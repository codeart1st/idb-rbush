import indexedDB from 'fake-indexeddb'
import { rbush } from './index.js'

const dbs = new Map()
const objectStoreName1 = 'test1'
const objectStoreName2 = 'test2'
const database = 'test'

const createDB = database => {
  const request = indexedDB.open(database, 1)
  return new Promise((resolve, reject) => {
    request.onerror = event => {
      reject(event.target.error)
    }
    request.onsuccess = () => {
      resolve(request.result)
    }
    request.onupgradeneeded = () => {
      const db = request.result
      db.createObjectStore(objectStoreName1, { keyPath: 'id' })
      db.createObjectStore(objectStoreName2, { keyPath: 'id' })
    }
  })
}

const ignoreIds = async root => {
  var nodesToSearch = [], node = root, i, len
  while (node) {
    node.id = expect.any(String)
    if (!node.leaf_) {
      for (i = 0, len = node.children_.length; i < len; i++) {
        nodesToSearch.push(await node.children_[i])
      }
    }
    node = nodesToSearch.pop()
  }
  return root
}

const sortedEqual = (a, b, compare) => {
  compare = compare || defaultCompare
  expect(a.slice().sort(compare)).toStrictEqual(b.slice().sort(compare))
}

const defaultCompare = ({ bbox: a }, { bbox: b }) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]) || (a[3] - b[3])

const someData = n => {
  var data = []

  for (var i = 0; i < n; i++) {
    data.push({ bbox: [i, i, i, i] })
  }
  return data
}

const arrToBBox = arr => ({ bbox: arr })

var data = [[0, 0, 0, 0], [10, 10, 10, 10], [20, 20, 20, 20], [25, 0, 25, 0], [35, 10, 35, 10], [45, 20, 45, 20], [0, 25, 0, 25], [10, 35, 10, 35],
[20, 45, 20, 45], [25, 25, 25, 25], [35, 35, 35, 35], [45, 45, 45, 45], [50, 0, 50, 0], [60, 10, 60, 10], [70, 20, 70, 20], [75, 0, 75, 0],
[85, 10, 85, 10], [95, 20, 95, 20], [50, 25, 50, 25], [60, 35, 60, 35], [70, 45, 70, 45], [75, 25, 75, 25], [85, 35, 85, 35], [95, 45, 95, 45],
[0, 50, 0, 50], [10, 60, 10, 60], [20, 70, 20, 70], [25, 50, 25, 50], [35, 60, 35, 60], [45, 70, 45, 70], [0, 75, 0, 75], [10, 85, 10, 85],
[20, 95, 20, 95], [25, 75, 25, 75], [35, 85, 35, 85], [45, 95, 45, 95], [50, 50, 50, 50], [60, 60, 60, 60], [70, 70, 70, 70], [75, 50, 75, 50],
[85, 60, 85, 60], [95, 70, 95, 70], [50, 75, 50, 75], [60, 85, 60, 85], [70, 95, 70, 95], [75, 75, 75, 75], [85, 85, 85, 85], [95, 95, 95, 95]]
  .map(arrToBBox)

var emptyData = [[-Infinity, -Infinity, Infinity, Infinity], [-Infinity, -Infinity, Infinity, Infinity],
[-Infinity, -Infinity, Infinity, Infinity], [-Infinity, -Infinity, Infinity, Infinity],
[-Infinity, -Infinity, Infinity, Infinity], [-Infinity, -Infinity, Infinity, Infinity]].map(arrToBBox)

beforeAll(async () => {
  dbs.set(database, await createDB(database))
})

beforeEach(() => new Promise(async (resolve, reject) => {
  const db = dbs.get(database)
  const tx = db.transaction([objectStoreName1, objectStoreName2], 'readwrite')
  const store1 = tx.objectStore(objectStoreName1)
  const store2 = tx.objectStore(objectStoreName2)

  tx.onerror = event => reject(event.target.error)

  store1.clear()
  store2.clear().onsuccess = resolve
}))

test('constructor uses 9 max entries by default', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1)
  const tree2 = await rbush(db, objectStoreName2)

  await tree1.load(someData(9))
  await tree2.load(someData(10))

  expect(tree1.toJSON().height_).toBe(1)
  expect(tree2.toJSON().height_).toBe(2)
})

test('constructor loads existing tree from Indexed Database', async () => {
  const db = dbs.get(database)
  let tree = await rbush(db, objectStoreName1)

  await tree.load(data)
  sortedEqual(await tree.all(), data)

  tree = await rbush(db, objectStoreName1)
  sortedEqual(await tree.all(), data)
})

test('#load bulk-loads the given data given max node entries and forms a proper search tree', async () => {
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1, 4)

  await tree.load(data)

  sortedEqual(await tree.all(), data)
})

test('#load uses standard insertion when given a low number of items', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1, 8)
  const tree2 = await rbush(db, objectStoreName2, 8)

  await tree1.load(data)
  await tree1.load(data.slice(0, 3))
  await tree2.load(data)
  await tree2.insert(data[0])
  await tree2.insert(data[1])
  await tree2.insert(data[2])

  expect(tree1.toJSON().id).toBe(tree2.toJSON().id)
  expect(tree1.toJSON()).toStrictEqual(await ignoreIds(tree2.toJSON()))
})

test('#load does nothing if loading empty data', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1)
  const tree2 = await rbush(db, objectStoreName2)

  await tree1.load([])

  expect(tree1.toJSON()).toStrictEqual(tree2.toJSON())
})

test('#load handles the insertion of maxEntries + 2 empty bboxes', async () => {
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1, 4)

  await tree.load(emptyData)

  expect(tree.toJSON().height_).toBe(2)
  sortedEqual(await tree.all(), emptyData)
})

test('#insert handles the insertion of maxEntries + 2 empty bboxes', async () => {
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1, 4)

  for (const item of emptyData) {
    await tree.insert(item)
  }

  expect(tree.toJSON().height_).toBe(2)
  sortedEqual(await tree.all(), emptyData)
})

test('#load properly splits tree root when merging trees of the same height', async () => {
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1, 4)

  await tree.load(data)
  await tree.load(data)

  expect(tree.toJSON().height_).toBe(4)
  sortedEqual(await tree.all(), data.concat(data))
})

test('#load properly merges data of smaller or bigger tree heights', async () => {
  const smaller = someData(10)
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1, 4)
  const tree2 = await rbush(db, objectStoreName2, 4)

  await tree1.load(data)
  await tree1.load(smaller)
  await tree2.load(smaller)
  await tree2.load(data)

  expect(tree1.toJSON().height_).toBe(tree2.toJSON().height_)
  sortedEqual(await tree1.all(), data.concat(smaller))
  sortedEqual(await tree2.all(), data.concat(smaller))
})

test('#search finds matching points in the tree given a bbox', async () => {
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1, 4)
  await tree.load(data)

  const result = await tree.search([40, 20, 80, 70])

  sortedEqual(result, [
    [70, 20, 70, 20], [75, 25, 75, 25], [45, 45, 45, 45], [50, 50, 50, 50], [60, 60, 60, 60], [70, 70, 70, 70],
    [45, 20, 45, 20], [45, 70, 45, 70], [75, 50, 75, 50], [50, 25, 50, 25], [60, 35, 60, 35], [70, 45, 70, 45]
  ].map(arrToBBox))
})

test('#search returns an empty array if nothing found', async () => {
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1, 4)
  await tree.load(data)

  const result = await tree.search([200, 200, 210, 210])

  sortedEqual(result, [])
})

test('#all returns all points in the tree', async () => {
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1, 4)
  await tree.load(data)

  var result = await tree.all()

  sortedEqual(result, data)
  sortedEqual(await tree.search([0, 0, 100, 100]), data)
})

test('#toJSON & #fromJSON exports and imports search tree in JSON format', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1, 4)
  const tree2 = await rbush(db, objectStoreName1, 4)
  await tree1.load(data)

  tree2.fromJSON(tree1.toJSON())

  sortedEqual(await tree1.all(), await tree2.all())
})

test('#insert adds an item to an existing tree correctly', async () => {
  const items = [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [2, 2, 2, 2],
    [3, 3, 3, 3],
    [1, 1, 2, 2]
  ].map(arrToBBox)
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1, 4)
  await tree.load(items.slice(0, 3))

  await tree.insert(items[3])
  expect(tree.toJSON().height_).toBe(1)
  sortedEqual(await tree.all(), items.slice(0, 4))

  await tree.insert(items[4])
  expect(tree.toJSON().height_).toBe(2)
  sortedEqual(await tree.all(), items)
})

test('#insert does nothing if given undefined', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1)
  const tree2 = await rbush(db, objectStoreName1)
  await tree1.load(data)
  await tree2.load(data)

  await tree2.insert()

  expect(tree1.toJSON()).toStrictEqual(await ignoreIds(tree2.toJSON()))
})

test('#insert forms a valid tree if items are inserted one by one', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1, 4)
  const tree2 = await rbush(db, objectStoreName1, 4)

  for (const item of data) {
    await tree1.insert(item)
  }
  await tree2.load(data)

  expect(tree1.toJSON().height_ - tree2.toJSON().height_).toBeLessThanOrEqual(1)
  sortedEqual(await tree1.all(), await tree2.all())
})

test('#remove removes items correctly', async () => {
  const len = data.length
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1, 4)
  await tree.load(data)

  await tree.remove(data[0]);
  await tree.remove(data[1]);
  await tree.remove(data[2]);
  await tree.remove(data[len - 1]);
  await tree.remove(data[len - 2]);
  await tree.remove(data[len - 3]);

  sortedEqual(data.slice(3, len - 3), await tree.all())
})

test('#remove does nothing if nothing found', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1)
  const tree2 = await rbush(db, objectStoreName2)
  await tree1.load(data)
  await tree2.load(data)

  await tree2.remove({ bbox: [13, 13, 13, 13] })

  expect(tree1.toJSON()).toStrictEqual(await ignoreIds(tree2.toJSON()))
})

test('#remove does nothing if given undefined', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1)
  const tree2 = await rbush(db, objectStoreName2)
  await tree1.load(data)
  await tree2.load(data)

  await tree2.remove()

  expect(tree1.toJSON()).toStrictEqual(await ignoreIds(tree2.toJSON()))
})

test('#remove brings the tree to a clear state when removing everything one by one', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1)
  const tree2 = await rbush(db, objectStoreName2)
  await tree1.load(data)

  for (const item of data) {
    await tree1.remove(item)
  }

  expect(tree1.toJSON()).toStrictEqual(tree2.toJSON())
})

test('#remove accepts an equals function', async () => {
  const db = dbs.get(database)
  const tree = await rbush(db, objectStoreName1)
  await tree.load(data)

  const item = {
    bbox: [20, 70, 20, 70],
    foo: 'bar'
  }
  await tree.insert(item)
  await tree.remove(JSON.parse(JSON.stringify(item)), (a, b) => a.foo === b.foo)

  sortedEqual(await tree.all(), data)
})

test('#clear should clear all the data in the tree', async () => {
  const db = dbs.get(database)
  const tree1 = await rbush(db, objectStoreName1, 4)
  const tree2 = await rbush(db, objectStoreName1, 4)

  await tree1.load(data)
  await tree1.clear()

  expect(tree1.toJSON()).toStrictEqual(tree2.toJSON())
})
