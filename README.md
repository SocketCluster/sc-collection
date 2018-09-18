# SCCollection
SocketCluster real-time collection component for reactive front ends.
Designed to work with `sc-crud-rethink` https://github.com/SocketCluster/sc-crud-rethink

## Setup

Inside the directory from which front end files are served, run the command:

```bash
npm install sc-collection --save
```

You can import it in your scripts like this (example; your exact path may differ):
```js
import SCCollection from '/node_modules/sc-collection/sc-collection.js';
```

## Usage

See https://github.com/socketcluster/sc-sample-inventory for sample app which demonstrates this component in action.

An SCCollection object can be instantiated like this:

```js
this.productsCollection = new SCCollection({
  // Pass the SocketCluster socket object.
  socket: pageOptions.socket,
  type: 'Product',
  fields: ['name', 'qty', 'price'],
  view: 'categoryView',
  viewParams: {category: this.categoryId},
  pageOffset: 0,
  pageSize: 5,
  getCount: true
});
```

The SCCollection allows you to read and manipulate a collection of documents in RethinkDB from the front end.
The ```productsCollection.value``` property is an array of `Product` objects which make up this collection; this array updates in real-time to match the collection on the server.
The ```productsCollection.meta``` property is an object which holds metadata about the collection's current state. It has the following properties: ```pageOffset```, ```pageSize```, ```isLastPage``` and ```count```.

If using a reactive front end framework like VueJS, you can bind the ```productsCollection.value``` and ```productsCollection.meta``` properties directly to your template since the array/object reference never changes (only the internal values/properties change).
In VueJS, you can instantiate and attach the collection value and metadata to your component like this:

```js
data: function () {
  this.productsCollection = new SCCollection({
    socket: pageOptions.socket,
    type: 'Product',
    fields: ['name', 'qty', 'price'],
    view: 'categoryView',
    viewParams: {category: this.categoryId},
    pageOffset: 0,
    pageSize: 5,
    getCount: true
  });

  return {
    products: this.productsCollection.value,
    productsMeta: this.productsCollection.meta
  };
},
```

Then you can bind this data to your template like this:

```html
// Iterate over the products array and render available properties of each product.
<tr v-for="product of products">
  <td>{{product.name}}</td>
  <td>{{product.qty}}</td>
  <td>{{product.price}}</td>
</tr>
```

## Supported attributes

The SCCollection tag supports the following attributes:

- ```socket```: A ```socketcluster-client``` socket; note that the same global socket object can be shared between multiple SCCollection and SCModel instances.
- ```type```: This is the model/table name in RethinkDB.
- ```fields```: The document fields to load for this collection.
- ```view```: The view to use for this collection. See https://github.com/SocketCluster/sc-crud-rethink for details about views.
- ```viewParams```: This should be a JSON object which will be used for filtering results for your view.
If you are using the sc-crud-rethink plugin on the backend, this data will be passed as the third argument to your transform function on your schema.
- ```pageOffset```: An integer which represents the current page of results within the collection.
- ```pageSize```: The number of results per page.
- ```getCount```: This is ```false``` by default; if set to ```true```, the ```collection.meta.count``` property will be populated with the total number of items in the collection; otherwise it always stays null (performance is better if ```getCount``` is ```false```).
