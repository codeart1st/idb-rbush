Indexed Database RBush
=====

IDB-RBush is a high-performance JavaScript library for 2D **spatial indexing** of points and rectangles in an IndexedDB object store.
It's based on an optimized **R-tree** data structure with **bulk insertion** support.

*Spatial index* is a special data structure for points and rectangles
that allows you to perform queries like "all items within this bounding box" very efficiently
(e.g. hundreds of times faster than looping over all items).
It's most commonly used in maps and data visualizations.

## Demos

The demos contain visualization of trees generated from 50k bulk-loaded random points.

## Install

Install with NPM (`npm install idb-rbush`).

## Usage

### Creating an IDBObjectStore

It's important, that the `IDBObjectStore` has the `keyPath` set to `'id'`.
```js
const request = self.indexedDB.open(dbName)
request.onupgradeneeded = () => {
  const db = request.result
  db.createObjectStore(objectStoreName, { keyPath: 'id' })
}
```

### Creating a Tree

For creating a tree you need a successfully opened `IDBDatabase` connection object together with an unique name of an `IDBObjectStore`, in which IDB-RBush will persist your **R-tree** data structure. If the function finds an existing root node, the persisted structure will be reused. Otherwise a new root node will be created.
```js
(async () => {
  try {
    const tree = await rbush(db, objectStoreName)
  } catch (error) {
    // handle error
  }
})()
```

An optional argument to `rbush` defines the maximum number of entries in a tree node.
`9` (used by default) is a reasonable choice for most applications.
Higher value means faster insertion and slower search, and vice versa.

```js
(async () => {
  try {
    const tree = await rbush(db, objectStoreName, 16)
  } catch (error) {
    // handle error
  }
})()
```

### Adding Data

Insert an item:

```js
(async () => {
  const item = {
    bbox: [20, 40, 30, 50], // mandatory
    foo: 'bar' // any additional data
  }

  try {
    await tree.insert(item)
  } catch (error) {
    // handle error
  }
})()
```

### Removing Data

Remove a previously inserted item:

```js
(async () => {
  try {
    await tree.remove(item)
  } catch (error) {
    // handle error
  }
})()
```

By default, IDB-RBush removes objects by reference.
However, you can pass a custom `equals` function to compare by value for removal,
which is useful when you only have a copy of the object you need removed (e.g. loaded from server):

```js
(async () => {
  try {
    await tree.remove(itemCopy, (a, b) => {
      return a.id === b.id
    })
  } catch (error) {
    // handle error
  }
})()
```

Remove all items:

```js
(async () => {
  try {
    await tree.clear()
  } catch (error) {
    // handle error
  }
})()
```

### Data Format

If you're indexing a static list of points (you don't need to add/remove points after indexing), you should use [kdbush](https://github.com/mourner/kdbush) which performs point indexing 5-8x faster than IDB-RBush.

### Bulk-Inserting Data

Bulk-insert the given data into the tree:

```js
(async () => {
  try {
    await tree.load([item1, item2, ...])
  } catch (error) {
    // handle error
  }
})()
```

Bulk insertion is usually ~2-3 times faster than inserting items one by one.
After bulk loading (bulk insertion into an empty tree),
subsequent query performance is also ~20-30% better.

Note that when you do bulk insertion into an existing tree,
it bulk-loads the given data into a separate tree
and inserts the smaller tree into the larger tree.
This means that bulk insertion works very well for clustered data
(where items in one update are close to each other),
but makes query performance worse if the data is scattered.

### Search

```js
(async () => {
  try {
    const result = await tree.search([40, 20, 80, 70])
  } catch (error) {
    // handle error
  }
})()
```

Returns an array of data items (points or rectangles) that the given bounding box intersects.

Note that the `search` method accepts a bounding box in `[minX, minY, maxX, maxY]` format
regardless of the format specified in the constructor (which only affects inserted objects).

```js
(async () => {
  try {
    const allItems = await tree.all()
  } catch (error) {
    // handle error
  }
})()
```

Returns all items of the tree.

### Export and Import

```js
// export the internal data object tree
var treeData = tree.toJSON()

// import previously exported data
var tree = rbush(9).fromJSON(treeData)
```

Importing and exporting as JSON allows you to use RBush on both the server (using Node.js) and the browser combined,
e.g. first indexing the data on the server and and then importing the resulting tree data on the client for searching.

Note that the `nodeSize` option passed to the constructor must be the same in both trees for export/import to work properly.

### K-Nearest Neighbors

For "_k_ nearest neighbors around a point" type of queries for IDB-RBush,
check out [rbush-knn](https://github.com/codeart1st/idb-rbush-knn).

## Algorithms Used

* single insertion: non-recursive R-tree insertion with overlap minimizing split routine from R\*-tree (split is very effective in JS, while other R\*-tree modifications like reinsertion on overflow and overlap minimizing subtree search are too slow and not worth it)
* single deletion: non-recursive R-tree deletion using depth-first tree traversal with free-at-empty strategy (entries in underflowed nodes are not reinserted, instead underflowed nodes are kept in the tree and deleted only when empty, which is a good compromise of query vs removal performance)
* bulk loading: OMT algorithm (Overlap Minimizing Top-down Bulk Loading) combined with Floyd–Rivest selection algorithm
* bulk insertion: STLT algorithm (Small-Tree-Large-Tree)
* search: standard non-recursive R-tree search

## Papers

* [R-trees: a Dynamic Index Structure For Spatial Searching](http://www-db.deis.unibo.it/courses/SI-LS/papers/Gut84.pdf)
* [The R*-tree: An Efficient and Robust Access Method for Points and Rectangles+](http://dbs.mathematik.uni-marburg.de/publications/myPapers/1990/BKSS90.pdf)
* [OMT: Overlap Minimizing Top-down Bulk Loading Algorithm for R-tree](http://ftp.informatik.rwth-aachen.de/Publications/CEUR-WS/Vol-74/files/FORUM_18.pdf)
* [Bulk Insertions into R-Trees Using the Small-Tree-Large-Tree Approach](http://www.cs.arizona.edu/~bkmoon/papers/dke06-bulk.pdf)
* [R-Trees: Theory and Applications (book)](http://www.apress.com/9781852339777)

## Development

```bash
npm install  # install dependencies

npm test     # check the code with JSHint and run tests
npm run cov  # report test coverage (with more detailed report in coverage/lcov-report/index.html)
```

## Compatibility

IDB-RBush should run on all major browsers with [IndexedDB support](https://caniuse.com/#feat=indexeddb). It uses various native ES2015 features: promise, arrow function, spread operator, proxy, reflect. And the ES2017 async/await.

## Changelog

#### 3.0.0 &mdash; Jan 27, 2019

- **Breaking:** Initial fork from rbush to implement a variant with IndexedDB support.
- **Breaking:** Changed the bbox format again from `{minX: 20, minY: 40, maxX: 30, maxY: 50}` to `bbox: [20, 40, 30, 50]`. Matching the GeoJSON [RFC 7946](https://tools.ietf.org/html/rfc7946) spec and reduce the property access over the proxy objects.
- **Breaking:** New promise-based API calls for all exported functions because of the IndexedDB asynchronous API.
- **Breaking:** Now every node in the R-tree data structure has an unique [UUID](https://tools.ietf.org/html/rfc4122) based on this [GitHubGist](https://gist.github.com/jed/982883). The `id` of the root node is always `00000000-0000-0000-0000-000000000000`.
- **Breaking:** Removed `collides` method from version 1.4.0 -> no use case.
- **Breaking:** Removed the ability to customize the internal data format.
- **Breaking:** Removed the method chaining ability because of simplification.
- Added `fake-indexeddb` for tests running in Node.js.
- Added Typings Definition file (index.d.ts).
- Reworked README documentation.

#### 2.0.2 &mdash; Dec 21, 2017

- Added default export for better ES6 modules / transpiler support.

#### 2.0.1 &mdash; June 29, 2016

- Fixed browser builds in NPM.

#### 2.0.0 &mdash; June 29, 2016

- **Breaking:** changed the default format of inserted items from `[20, 40, 30, 50]` to `{minX: 20, minY: 40, maxX: 30, maxY: 50}`.
- **Breaking:** changed the `search` method argument format from `[20, 40, 30, 50]` to `{minX: 20, minY: 40, maxX: 30, maxY: 50}`.
- Improved performance by up to 30%.
- Added `equalsFn` optional argument to `remove` to be able to remove by value rather than by reference.
- Changed the source code to use CommonJS module format. Browser builds are automatically built and published to NPM.
- Quickselect algorithm (used internally) is now a [separate module](https://github.com/mourner/quickselect).

#### 1.4.3 &mdash; May 17, 2016

- Fixed an error when inserting many empty bounding boxes.

#### 1.4.2 &mdash; Dec 16, 2015

- 50% faster insertion.

#### 1.4.1 &mdash; Sep 16, 2015

- Fixed insertion in IE8.

#### 1.4.0 &mdash; Apr 22, 2015

- Added `collides` method for fast collision detection.

#### 1.3.4 &mdash; Aug 31, 2014

- Improved bulk insertion performance for a large number of items (e.g. up to 100% for inserting a million items).
- Fixed performance regression for high node sizes.

#### 1.3.3 &mdash; Aug 30, 2014

- Improved bulk insertion performance by ~60-70%.
- Improved insertion performance by ~40%.
- Improved search performance by ~30%.

#### 1.3.2 &mdash; Nov 25, 2013

- Improved removal performance by ~50%. [#18](https://github.com/codeart1st/idb-rbush/pull/18)

#### 1.3.1 &mdash; Nov 24, 2013

- Fixed minor error in the choose split axis algorithm. [#17](https://github.com/codeart1st/idb-rbush/pull/17)
- Much better test coverage (near 100%). [#6](https://github.com/codeart1st/idb-rbush/issues/6)

#### 1.3.0 &mdash; Nov 21, 2013

- Significantly improved search performance (especially on large-bbox queries — up to 3x faster). [#11](https://github.com/codeart1st/idb-rbush/pull/11)
- Added `all` method for getting all of the tree items. [#11](https://github.com/codeart1st/idb-rbush/pull/11)
- Made `toBBox`, `compareMinX`, `compareMinY` methods public, made it possible to avoid Content Security Policy issues by overriding them for custom format. [#14](https://github.com/codeart1st/idb-rbush/pull/14) [#12](https://github.com/codeart1st/idb-rbush/pull/12)

#### 1.2.5 &mdash; Nov 5, 2013

- Fixed a bug where insertion failed on a tree that had all items removed previously. [#10](https://github.com/codeart1st/idb-rbush/issues/10)

#### 1.2.4 &mdash; Oct 25, 2013

- Added Web Workers support. [#9](https://github.com/codeart1st/idb-rbush/pull/9)

#### 1.2.3 &mdash; Aug 30, 2013

- Added AMD support. [#8](https://github.com/codeart1st/idb-rbush/pull/8)

#### 1.2.2 &mdash; Aug 27, 2013

- Eliminated recursion when recalculating node bboxes (on insert, remove, load).

#### 1.2.0 &mdash; Jul 19, 2013

First fully functional RBush release.
