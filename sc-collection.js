import jsonStableStringify from '/node_modules/sc-json-stable-stringify/sc-json-stable-stringify.js';
import socketClusterClient from '/node_modules/socketcluster-client-edge/socketcluster.js';
import SCModel from '/node_modules/sc-model/sc-model.js';
const Emitter = socketClusterClient.Emitter;

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
  this.pageOffset = options.pageOffset;
  this.pageSize = options.pageSize || 10;
  this.isLastPage = null;
  this.getCount = options.getCount;
  this.disableRealtime = options.disableRealtime;
  this.writeOnly = options.writeOnly;

  this.scModels = {};
  this.value = [];

  let channelPrefix = 'crud>';
  let viewParamsObject = this.viewParams || {};
  let viewParams = {};

  (this.viewPrimaryKeys || []).forEach(function (fieldName) {
    viewParams[fieldName] = viewParamsObject[fieldName];
  });
  let viewParamsString = jsonStableStringify(viewParams);
  let viewChannelName = channelPrefix + this.view +
    '(' + viewParamsString + '):' + this.type;

  let subscribeOptions = {
    data: {
      viewParams: viewParamsObject
    }
  };

  this.channel = this.socket.subscribe(viewChannelName, subscribeOptions);

  this._handleChannelData = (packet) => {
    if (packet == null) {
      this.reloadCurrentPage();
    } else {
      let collectionStart = this.pageOffset || 0;
      let collectionEnd = collectionStart + this.pageSize;
      if (packet.type == 'update' && packet.action == 'move') {
        // A resource was moved around within the same view as a result
        // of an update operation on the resource.
        let minOffset = Math.min(packet.oldOffset, packet.newOffset);
        if (minOffset <= collectionEnd) {
          this.reloadCurrentPage();
        }
      } else {
        if (packet.offset <= collectionEnd) {
          this.reloadCurrentPage();
        }
      }
    }
  };

  this._handleAuthentication = () => {
    this.channel.subscribe();
  };

  this.channel.watch(this._handleChannelData);

  this._handleSubscription = () => {
    this.loadData();
  };

  // Fetch data once the subscribe is successful.
  this.channel.on('subscribe', this._handleSubscription);
  if (this.channel.state === 'subscribed') {
    this.loadData();
  }
  this.socket.on('authenticate', this._handleAuthentication);
}

SCCollection.prototype = Object.create(Emitter.prototype);

SCCollection.Emitter = Emitter;

// Load values for the collection.
SCCollection.prototype.loadData = function () {
  let query = {
    type: this.type
  };
  query.offset = this.pageOffset || 0;
  if (this.view != null) {
    query.view = this.view;
  }
  if (this.viewParams != null) {
    query.viewParams = this.viewParams;
  }
  if (this.pageSize) {
    query.pageSize = this.pageSize;
  }
  if (this.getCount) {
    query.getCount = true;
  }

  this.socket.emit('read', query, (err, result) => {
    if (err) {
      throw new Error(err);
    } else {
      let existingItemsMap = {};
      let newIdsLookup = {};
      let currentItems = this.value;
      let len = currentItems.length;

      for (let h = 0; h < len; h++) {
        existingItemsMap[currentItems[h].id] = currentItems[h];
      }

      let newItems = [];
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
          newItems.push(model.value);
        } else {
          newItems.push(existingItemsMap[tempId]);
        }
      }

      Object.keys(this.scModels).forEach((resourceId) => {
        if (!newIdsLookup[resourceId]) {
          this.scModels[resourceId].destroy();
          delete this.scModels[resourceId];
        }
      });

      this.value = newItems;

      if (result.count != null) {
        this.count = result.count;
      }
    }
    this.isLastPage = result.isLastPage;
  });
};

SCCollection.prototype.reloadCurrentPage = function () {
  if (!this.writeOnly) {
    this.loadData();
  }
};

SCCollection.prototype.fetchNextPage = function () {
  if (!this.isLastPage) {
    this.pageOffset += this.pageSize;
    this.reloadCurrentPage();
  }
};

SCCollection.prototype.fetchPreviousPage = function () {
  if (this.pageOffset > 0) {
    let prevOffset = this.pageOffset - this.pageSize;
    if (prevOffset < 0) {
      prevOffset = 0;
    }
    this.pageOffset = prevOffset;
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
  var query = {
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
  this.socket.off('authenticate', this._handleAuthentication);
  this.channel.off('subscribe', this._handleSubscription);
  if (!this.channel.watchers().length) {
    this.channel.unsubscribe();
  }
};

export default SCCollection;
