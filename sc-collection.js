import jsonStableStringify from '../sc-json-stable-stringify/sc-json-stable-stringify.js';
import Emitter from '../sc-component-emitter/sc-component-emitter.js';
import SCModel from '../sc-model/sc-model.js';

function SCCollection(options) {
  Emitter.call(this);

  this.socket = options.socket;
  this.type = options.type;
  this.fields = options.fields;
  this.view = options.view;
  this.viewParams = options.viewParams;
  if (options.viewPrimaryKeys == null) {
    this.viewPrimaryKeys = Object.keys(options.viewParams || {});
  } else {
    this.viewPrimaryKeys = options.viewPrimaryKeys;
  }
  this.meta = {
    pageOffset: options.pageOffset || 0,
    pageSize: options.pageSize || 10,
    isLastPage: null,
    count: null
  };
  this.getCount = options.getCount;
  this.realtimeCollection = options.realtimeCollection == null ? true : options.realtimeCollection;
  this.writeOnly = options.writeOnly;

  this.scModels = {};
  this.value = [];

  this._triggerCollectionError = (error) => {
    let err = this._formatError(error);
    // Throw error in different stack frame so that error handling
    // cannot interfere with a reconnect action.
    setTimeout(() => {
      if (this.listeners('error').length < 1) {
        throw err;
      } else {
        this.emit('error', err);
      }
    }, 0);
  };

  this._handleSCModelError = (err) => {
    this._triggerCollectionError(err);
  };

  this._handleSCModelChange = (event) => {
    this.value.forEach((modelValue, index) => {
      if (modelValue.id === event.resourceId) {
        this.value.splice(index, 1, modelValue);
      }
    });
    this.emit('modelChange', event);
  };

  if (this.writeOnly) {
    return;
  }

  if (!this.realtimeCollection) {
    // This is to account for socket reconnects - After recovering from a lost connection,
    // we will re-fetch the whole value to make sure that we haven't missed any updates made to it.
    this.socket.on('connect', (status) => {
      this.loadData();
    });
    if (this.socket.state == 'open') {
      this.loadData();
    }
    return;
  }

  this._handleChannelData = (packet) => {
    this.reloadCurrentPage();
  };

  let channelPrefix = 'crud>';
  let viewParamsObject = this.viewParams || {};
  let viewPrimaryParams = {};

  this.viewPrimaryKeys.forEach(function (field) {
    viewPrimaryParams[field] = viewParamsObject[field] === undefined ? null : viewParamsObject[field];
  });
  let viewPrimaryParamsString = jsonStableStringify(viewPrimaryParams);
  let viewChannelName = channelPrefix + this.view +
    '(' + viewPrimaryParamsString + '):' + this.type;

  let subscribeOptions = {
    data: {
      viewParams: viewParamsObject
    }
  };

  this.channel = this.socket.subscribe(viewChannelName, subscribeOptions);

  this._handleAuthentication = () => {
    this.channel.subscribe();
  };

  this.channel.watch(this._handleChannelData);

  this._handleSubscription = () => {
    this.loadData();
  };

  this._handleSubscriptionFailure = (err) => {
    this._triggerCollectionError(err);
  };

  // Fetch data once the subscribe is successful.
  this.channel.on('subscribe', this._handleSubscription);

  if (this.channel.state === 'subscribed') {
    this.loadData();
  }
  this.channel.on('subscribeFail', this._handleSubscriptionFailure);
  this.socket.on('authenticate', this._handleAuthentication);
}

SCCollection.prototype = Object.create(Emitter.prototype);

SCCollection.Emitter = Emitter;

SCCollection.prototype._formatError = function (error) {
  if (error) {
    if (error.message) {
      return new Error(error.message);
    }
    return new Error(error);
  }
  return error;
};

// Load values for the collection.
SCCollection.prototype.loadData = function () {
  if (this.writeOnly) {
    this._triggerCollectionError('Cannot load values for an SCCollection declared as write-only');
    return;
  }

  let query = {
    type: this.type
  };
  query.offset = this.meta.pageOffset || 0;
  if (this.view != null) {
    query.view = this.view;
  }
  if (this.viewParams != null) {
    query.viewParams = this.viewParams;
  }
  if (this.meta.pageSize) {
    query.pageSize = this.meta.pageSize;
  }
  if (this.getCount) {
    query.getCount = true;
  }

  this.socket.emit('read', query, (err, result) => {
    if (err) {
      this._triggerCollectionError(err);
    } else {
      let existingItemsMap = {};
      let newIdsLookup = {};
      let currentItems = this.value;
      let len = currentItems.length;

      for (let h = 0; h < len; h++) {
        existingItemsMap[currentItems[h].id] = currentItems[h];
      }

      let oldValue = this.value.splice(0);
      let resultDataLen = result.data.length;

      for (let i = 0; i < resultDataLen; i++) {
        let tempId = result.data[i];
        newIdsLookup[tempId] = true;
        if (existingItemsMap[tempId] == null) {
          let model = new SCModel({
            socket: this.socket,
            type: this.type,
            id: tempId,
            fields: this.fields
          });
          this.scModels[tempId] = model;
          this.value.push(model.value);
          model.on('error', this._handleSCModelError);
          model.on('change', this._handleSCModelChange);
        } else {
          this.value.push(existingItemsMap[tempId]);
        }
      }

      Object.keys(this.scModels).forEach((resourceId) => {
        if (!newIdsLookup[resourceId]) {
          this.scModels[resourceId].destroy();
          delete this.scModels[resourceId];
        }
      });

      if (result.count != null) {
        this.meta.count = result.count;
      }

      this.emit('change', {
        resourceType: this.type,
        oldValue: oldValue,
        newValue: this.value
      });

      this.meta.isLastPage = result.isLastPage;
    }
  });
};

SCCollection.prototype.reloadCurrentPage = function () {
  if (!this.writeOnly) {
    this.loadData();
  }
};

SCCollection.prototype.fetchNextPage = function () {
  if (!this.meta.isLastPage) {
    this.meta.pageOffset += this.meta.pageSize;
    this.reloadCurrentPage();
  }
};

SCCollection.prototype.fetchPreviousPage = function () {
  if (this.meta.pageOffset > 0) {
    let prevOffset = this.meta.pageOffset - this.meta.pageSize;
    if (prevOffset < 0) {
      prevOffset = 0;
    }
    this.meta.pageOffset = prevOffset;
    this.reloadCurrentPage();
  }
};

SCCollection.prototype.create = function (newValue) {
  let query = {
    type: this.type,
    value: newValue
  };
  return new Promise((resolve, reject) => {
    this.socket.emit('create', query, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });
};

SCCollection.prototype.delete = function (id) {
  let query = {
    type: this.type,
    id: id
  };
  return new Promise((resolve, reject) => {
    this.socket.emit('delete', query, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(data);
    });
  });
};

SCCollection.prototype.destroy = function () {
  if (this.channel) {
    this.socket.off('authenticate', this._handleAuthentication);
    this.channel.off('subscribe', this._handleSubscription);
    this.channel.off('subscribeFail', this._handleSubscriptionFailure);

    this.channel.unwatch(this._handleChannelData);

    if (!this.channel.watchers().length) {
      this.channel.destroy();
    }
  }
  Object.values(this.scModels).forEach((scModel) => {
    scModel.removeListener('error', this._handleSCModelError);
    scModel.removeListener('change', this._handleSCModelChange);
    scModel.destroy();
  });
};

export default SCCollection;
