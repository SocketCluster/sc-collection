# sc-collection
Collection model component for Polymer and SocketCluster

## Setup

```bash
bower install sc-collection --save
```

You can include it inside your Polymer components like this (example):
```html
<link rel="import" href="/bower_components/sc-collection/sc-collection.html">
```

## Usage

See https://github.com/socketcluster/sc-sample-inventory for sample app which demonstrates this component in action.

This is what an sc-collection might look like:

```html
<sc-collection id="category-products" realtime="{{realtime}}" resource-type="Product" resource-value="{{categoryProducts}}" resource-view="categoryView" resource-predicate-data="{{categoryId}}" resource-page-offset="{{pageOffsetStart}}" resource-page-size="{{pageSize}}" resource-count="{{itemCount}}"></sc-collection>

```

An sc-collection allows you to read and manipulate a collection of documents from RethinkDB.
In the example above, the ```resource-value="{{categoryProducts}}"``` binds the collection's data to a ```categoryProducts``` array.
The ```categoryProducts``` array will hold objects in the form ```{id: '644e1dd7-2a7f-18fb-b8ed-ed78c3f92c2b'}``` - These are placeholders for
documents within the collection - Only the id field is set, if you want to display/manipulate additional fields/properties of each document, you will
have to bind them to the collection like this:

```html
<template is="dom-repeat" items="{{categoryProducts}}" filter="hasIdFilter" observe="id">
  <sc-field resource-type="Product" resource-id="{{item.id}}" resource-field="qty" resource-value="{{item.qty}}"></sc-field>
  <sc-field resource-type="Product" resource-id="{{item.id}}" resource-field="price" resource-value="{{item.price}}"></sc-field>
  <sc-field resource-type="Product" resource-id="{{item.id}}" resource-field="name" resource-value="{{item.name}}"></sc-field>
</template>
```

See https://github.com/SocketCluster/sc-field for more details.

## Supported attributes

The sc-collection tag supports the following attributes:

- ```resource-type```: This is the model/table name in RethinkDB.
- ```resource-view```: The view to use for this collection. See https://github.com/SocketCluster/sc-crud-rethink for details about views.
- ```resource-value```: The binding for the current page of results/documents from RethinkDB (updated in realtime) - This is the output of the component.
- ```resource-predicate-data```: This can be any value (any JSON-compatible type) which will be used for filtering results for your view.
If you are using the sc-crud-rethink plugin on the backend, this data will be passed as the second argument to both your filter and order functions. See ```categoryId``` here: https://github.com/SocketCluster/sc-sample-inventory/blob/master/worker.js#L58
- ```resource-page-offset```: An integer which represents the current page of results within the collection.
- ```resource-page-size```: The number of results per page.
- ```resource-count```: This outputs the total number of documents within the view/collection.
- ```realtime```: A boolean which allows you to toggle between a realtime/static view of the collection - Note that this doesn't affect the realtime
updating of individual sc-field components which are attached to the collection.
