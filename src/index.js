import quickselect from 'quickselect'

const ROOT_NODE_ID = '00000000-0000-0000-0000-000000000000'
const STATUS_NEW = 0
const STATUS_UPDATED = 1
const STATUS_DELETED = 2

const uuid = (a) => a ? (a ^ Math.random() * 16 >> a / 4).toString(16) : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, uuid)

const findItem = (item, items, equalsFn) => {
  if (!equalsFn) return items.indexOf(item)

  for (var i = 0, len = items.length; i < len; i++) {
    if (equalsFn(item, items[i])) return i
  }
  return -1
}

const extend = (a, b) => {
  const aa = a.bbox, bb = b.bbox
  a.bbox = [
    Math.min(aa[0], bb[0]),
    Math.min(aa[1], bb[1]),
    Math.max(aa[2], bb[2]),
    Math.max(aa[3], bb[3])
  ]
  return a
}

const compareNodeMinX = (a, b) => {
  return a.bbox[0] - b.bbox[0]
}

const compareNodeMinY = (a, b) => {
  return a.bbox[1] - b.bbox[1]
}

const bboxArea = a => {
  const aa = a.bbox
  return (aa[2] - aa[0]) * (aa[3] - aa[1])
}

const bboxMargin = a => {
  const aa = a.bbox
  return (aa[2] - aa[0]) + (aa[3] - aa[1])
}

const enlargedArea = (a, b) => {
  const aa = a.bbox, bb = b.bbox
  return (Math.max(bb[2], aa[2]) - Math.min(bb[0], aa[0])) *
    (Math.max(bb[3], aa[3]) - Math.min(bb[1], aa[1]))
}

const intersectionArea = (a, b) => {
  const aa = a.bbox, bb = b.bbox
  var minX = Math.max(aa[0], bb[0]),
    minY = Math.max(aa[1], bb[1]),
    maxX = Math.min(aa[2], bb[2]),
    maxY = Math.min(aa[3], bb[3])

  return Math.max(0, maxX - minX) *
    Math.max(0, maxY - minY)
}

const contains = (a, b) => {
  const aa = a.bbox, bb = b.bbox
  return aa[0] <= bb[0] &&
    aa[1] <= bb[1] &&
    bb[2] <= aa[2] &&
    bb[3] <= aa[3]
}

const intersects = (a, b) => {
  const aa = a.bbox, bb = b.bbox
  return bb[0] <= aa[2] &&
    bb[1] <= aa[3] &&
    bb[2] >= aa[0] &&
    bb[3] >= aa[1]
}

// sort an array so that items come in groups of n unsorted items, with groups sorted between each other;
// combines selection algorithm with binary divide & conquer approach
const multiSelect = (arr, left, right, n, compare) => {
  var stack = [left, right],
    mid

  while (stack.length) {
    right = stack.pop()
    left = stack.pop()

    if (right - left <= n) continue

    mid = left + Math.ceil((right - left) / n / 2) * n
    quickselect(arr, mid, left, right, compare)

    stack.push(left, mid, mid, right)
  }
}

const syncChanges = (pendingChanges, target) => {
  var len, i, arr = [], current
  for (i = 0, len = target.children_.length; i < len; i++) {
    current = target.children_[i]
    arr[i] = current.leaf_ === undefined ? current : current.id
  }

  pendingChanges[target.id] = {
    node: {
      ...target,
      children_: arr
    },
    // If status is NEW, keep it as NEW for updates with ongoing pendingChange
    status_: pendingChanges[target.id] && pendingChanges[target.id].status_ === STATUS_NEW ? STATUS_NEW : STATUS_UPDATED
  }
}

const wrap = (node, pendingChanges, db, objectStoreName, stats) => {
  return new (new Proxy(function (children_) {
    return {
      ...node,
      children_,
      ...stats
    }
  }, nodeHandler(pendingChanges, db, objectStoreName)))(...node.children_)
}

const nodeHandler = (pendingChanges, db, objectStoreName) => ({
  construct: (target, argumentsList, newTarget) => {
    const node = Reflect.construct(target, [
      // Wrap a proxy around the children argument
      new Proxy(argumentsList, {
        set: (target, propertyKey, value, receiver) => {
          const result = Reflect.set(target, propertyKey, value, receiver)
          if (typeof propertyKey === 'string' && !isNaN(propertyKey)) { // is array element access ?
            syncChanges(pendingChanges, node)
          }
          return result
        },
        get: (target, propertyKey, receiver) => {
          let match, result
          if (typeof propertyKey === 'string') {
            if (match = propertyKey.match(/^get\((\d)*\)$/)) {
              // .get is a special implementation in our proxy. It omits the loading from idb
              return target[match[1]]
            }

            result = Reflect.get(target, propertyKey, receiver)
            if (!isNaN(propertyKey)) { // is array element access ?
              if (!node.leaf_ && typeof result === 'string') {
                // it seems to be that loading is needed
                return loadById(db, objectStoreName, result).then(node => {
                  // capsulate inside proxy and store it by id inside the array
                  const child = wrap(node, pendingChanges, db, objectStoreName, { restored_: true })
                  Reflect.set(target, propertyKey, child, receiver)
                  return Reflect.get(target, propertyKey, receiver)
                })
              }
            }
          }
          return result
        }
      })
    ], newTarget)

    if (node.restored_) {
      delete node.restored_
    } else {
      const children_ = []
      for (let i = 0, len = node.children_.length; i < len; i++) {
        // .get is a special implementation in our proxy. It omits the loading from idb
        children_.push(node.children_[`get(${i})`])
      }

      pendingChanges[node.id] = {
        node: {
          ...node,
          children_
        },
        status_: STATUS_NEW
      }
    }

    return new Proxy(node, nodeHandler(pendingChanges, db, objectStoreName))
  },
  set: (target, propertyKey, value, receiver) => {
    const result = Reflect.set(target, propertyKey, value, receiver)
    syncChanges(pendingChanges, target)
    return result
  }
})

const loadById = (db, objectStoreName, id) => new Promise((resolve, reject) => {
  const tx = db.transaction(objectStoreName, 'readonly')
  const store = tx.objectStore(objectStoreName)
  tx.onerror = event => {
    reject(event.target.error)
  }
  const request = store.get(id)
  request.onsuccess = event => resolve(event.target.result)
})

export async function rbush(db, objectStoreName, maxEntries) {
  // max entries in a node is 9 by default; min node fill is 40% for best performance
  const _maxEntries = Math.max(4, maxEntries || 9)
  const _minEntries = Math.max(2, Math.ceil(_maxEntries * 0.4))
  const _pendingChanges = {}

  var data

  const _commit = () => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(objectStoreName, 'readwrite');
      const store = tx.objectStore(objectStoreName);

      tx.onerror = event => {
        reject(event.target.error);
      };

      const ids = Object.keys(_pendingChanges)
      let i, len, entry, request;

      for (i = 0, len = ids.length; i < len; i++) {
        entry = _pendingChanges[ids[i]];
        switch (entry.status_) {
          case STATUS_NEW:
            request = store.add(entry.node);
            break;
          case STATUS_UPDATED:
            request = store.put(entry.node);
            break;
          case STATUS_DELETED:
            request = store.delete(ids[i]);
            break;
        }
      }

      // clean up and keep the original object reference
      var props = Object.keys(_pendingChanges);
      for (i = 0, len = props.length; i < len; i++) {
        delete _pendingChanges[props[i]];
      }

      request.onsuccess = () => {
        resolve();
      };
    })
  }

  const all = async () => _all(data, [])

  const search = async (bbox) => {

    var node = data,
      bboxItem = { bbox },
      result = []

    if (!intersects(bboxItem, node)) return result;

    var nodesToSearch = [],
      i, len, child, childBBox;

    while (node) {
      for (i = 0, len = node.children_.length; i < len; i++) {

        child = await node.children_[i];
        childBBox = node.leaf_ ? toBBox(child) : child;

        if (intersects(bboxItem, childBBox)) {
          if (node.leaf_) result.push(child);
          else if (contains(bboxItem, childBBox)) await _all(child, result);
          else nodesToSearch.push(child);
        }
      }
      node = nodesToSearch.pop();
    }

    return result;
  }

  const load = async (_data) => {
    if (!(_data && _data.length)) return;

    if (_data.length < _minEntries) {
      for (var i = 0, len = _data.length; i < len; i++) {
        await insert(_data[i]);
      }
      return;
    }

    // recursively build the tree with the given data from scratch using OMT algorithm
    var node = await _build(_data.slice(), 0, _data.length - 1, 0);

    if (!data.children_.length) {
      // save as is if tree is empty
      delete _pendingChanges[node.id] // reset pending change for old id
      node.id = ROOT_NODE_ID
      data = node;

    } else if (data.height_ === node.height_) {
      // split root if trees have the same height
      await _splitRoot(data, node);

    } else {
      if (data.height_ < node.height_) {
        // swap trees if inserted one is bigger
        var tmpNode = data;
        data = node;
        node = tmpNode;
        node.id = data.id; // switch ids
        data.id = ROOT_NODE_ID; // set root node id again
      }

      // insert the small tree into the large tree at appropriate level
      await _insert(node, data.height_ - node.height_ - 1, true);
    }

    await _commit();
  }

  const insert = async (item) => {
    if (item) {
      await _insert(item, data.height_ - 1);
      await _commit();
    }
  }

  const clear = () => {
    // clean up and keep the original object reference
    var props = Object.keys(_pendingChanges);
    for (var i = 0, len = props.length; i < len; i++) {
      delete _pendingChanges[props[i]];
    }

    const newNode = createNode([], ROOT_NODE_ID);
    data = newNode;
  }

  const remove = async (item, equalsFn) => {
    if (!item) return;

    var node = data,
      bbox = toBBox(item),
      path = [],
      indexes = [],
      i, parent, index, goingUp;

    // depth-first iterative tree traversal
    while (node || path.length) {

      if (!node) { // go up
        node = path.pop();
        parent = path[path.length - 1];
        i = indexes.pop();
        goingUp = true;
      }

      if (node.leaf_) { // check current node
        index = findItem(item, node.children_, equalsFn);

        if (index !== -1) {
          // item found, remove the item and condense tree upwards
          node.children_.splice(index, 1);
          path.push(node);
          await _condense(path);
          await _commit();
          return;
        }
      }

      if (!goingUp && !node.leaf_ && contains(node, bbox)) { // go down
        path.push(node);
        indexes.push(i);
        i = 0;
        parent = node;
        node = await node.children_[0];

      } else if (parent) { // go right
        i++;
        node = await parent.children_[i];
        goingUp = false;

      } else node = null; // nothing found
    }
  }

  const toBBox = item => item

  const compareMinX = compareNodeMinX
  const compareMinY = compareNodeMinY

  const toJSON = () => data

  const fromJSON = _data => {
    data = _data;
  }

  const _all = async (node, result) => {
    var nodesToSearch = [];
    while (node) {
      if (node instanceof Promise) {
        node = await node
      }
      if (node.leaf_) result.push.apply(result, node.children_);
      else nodesToSearch.push.apply(nodesToSearch, node.children_);

      node = nodesToSearch.pop();
    }
    return result;
  }

  const _build = async (items, left, right, height) => {

    var N = right - left + 1,
      M = _maxEntries,
      node;

    if (N <= M) {
      // reached leaf level; return leaf
      node = createNode(items.slice(left, right + 1));
      await calcBBox(node, toBBox);
      return node;
    }

    if (!height) {
      // target height of the bulk-loaded tree
      height = Math.ceil(Math.log(N) / Math.log(M));

      // target number of root entries to maximize storage utilization
      M = Math.ceil(N / Math.pow(M, height - 1));
    }

    node = createNode([]);
    node.leaf_ = false;
    node.height_ = height;

    // split the items into M mostly square tiles

    var N2 = Math.ceil(N / M),
      N1 = N2 * Math.ceil(Math.sqrt(M)),
      i, j, right2, right3;

    multiSelect(items, left, right, N1, compareMinX);

    for (i = left; i <= right; i += N1) {

      right2 = Math.min(i + N1 - 1, right);

      multiSelect(items, i, right2, N2, compareMinY);

      for (j = i; j <= right2; j += N2) {

        right3 = Math.min(j + N2 - 1, right2);

        // pack each entry recursively
        node.children_.push(await _build(items, j, right3, height - 1));
      }
    }

    await calcBBox(node, toBBox);

    return node;
  }

  const _chooseSubtree = async (bbox, node, level, path) => {

    var i, len, child, targetNode, area, enlargement, minArea, minEnlargement;

    while (true) {
      path.push(node);

      if (node.leaf_ || path.length - 1 === level) break;

      minArea = minEnlargement = Infinity;

      for (i = 0, len = node.children_.length; i < len; i++) {
        child = await node.children_[i];
        area = bboxArea(child);
        enlargement = enlargedArea(bbox, child) - area;

        // choose entry with the least area enlargement
        if (enlargement < minEnlargement) {
          minEnlargement = enlargement;
          minArea = area < minArea ? area : minArea;
          targetNode = child;

        } else if (enlargement === minEnlargement) {
          // otherwise choose one with the smallest area
          if (area < minArea) {
            minArea = area;
            targetNode = child;
          }
        }
      }

      node = targetNode || await node.children_[0];
    }

    return node;
  }

  const _insert = async (item, level, isNode) => {

    var bbox = isNode ? item : toBBox(item),
      insertPath = [];

    // find the best node for accommodating the item, saving all nodes along the path too
    var node = await _chooseSubtree(bbox, data, level, insertPath);

    // put the item into the node
    node.children_.push(item);
    extend(node, bbox);

    // split on node overflow; propagate upwards if necessary
    while (level >= 0) {
      if (insertPath[level].children_.length > _maxEntries) {
        await _split(insertPath, level);
        level--;
      } else break;
    }

    // adjust bboxes along the insertion path
    _adjustParentBBoxes(bbox, insertPath, level);
  }

  // split overflowed node into two
  const _split = async (insertPath, level) => {

    var node = insertPath[level],
      M = node.children_.length,
      m = _minEntries;

    await _chooseSplitAxis(node, m, M);

    var splitIndex = await _chooseSplitIndex(node, m, M);

    var newNode = createNode(node.children_.splice(splitIndex, node.children_.length - splitIndex));
    newNode.height_ = node.height_;
    newNode.leaf_ = node.leaf_;

    await calcBBox(node, toBBox);
    await calcBBox(newNode, toBBox);

    if (level) insertPath[level - 1].children_.push(newNode);
    else await _splitRoot(node, newNode);
  }

  const _splitRoot = async (node, newNode) => {
    // split root node
    node.id = uuid() // neue id für den alten root node vergeben
    data = createNode([node, newNode], ROOT_NODE_ID); // neuen root node erzeugen
    _pendingChanges[ROOT_NODE_ID].status_ = STATUS_UPDATED // reset status from NEW to UPDATED
    data.height_ = node.height_ + 1;
    data.leaf_ = false;
    await calcBBox(data, toBBox);
  }

  const _chooseSplitIndex = async (node, m, M) => {

    var i, bbox1, bbox2, overlap, area, minOverlap, minArea, index;

    minOverlap = minArea = Infinity;

    for (i = m; i <= M - m; i++) {
      bbox1 = await distBBox(node, 0, i, toBBox);
      bbox2 = await distBBox(node, i, M, toBBox);

      overlap = intersectionArea(bbox1, bbox2);
      area = bboxArea(bbox1) + bboxArea(bbox2);

      // choose distribution with minimum overlap
      if (overlap < minOverlap) {
        minOverlap = overlap;
        index = i;

        minArea = area < minArea ? area : minArea;

      } else if (overlap === minOverlap) {
        // otherwise choose distribution with minimum area
        if (area < minArea) {
          minArea = area;
          index = i;
        }
      }
    }

    return index;
  }

  // sorts node children by the best axis for split
  const _chooseSplitAxis = async (node, m, M) => {

    var _compareMinX = node.leaf_ ? compareMinX : compareNodeMinX,
      _compareMinY = node.leaf_ ? compareMinY : compareNodeMinY,
      xMargin = await _allDistMargin(node, m, M, _compareMinX),
      yMargin = await _allDistMargin(node, m, M, _compareMinY);

    // if total distributions margin value is minimal for x, sort by minX,
    // otherwise it's already sorted by minY
    if (xMargin < yMargin) node.children_.sort(compareMinX);
  }

  // total margin of all possible split distributions where each node is at least m full
  const _allDistMargin = async (node, m, M, compare) => {

    node.children_.sort(compare);

    var leftBBox = await distBBox(node, 0, m, toBBox),
      rightBBox = await distBBox(node, M - m, M, toBBox),
      margin = bboxMargin(leftBBox) + bboxMargin(rightBBox),
      i, child;

    for (i = m; i < M - m; i++) {
      child = await node.children_[i];
      extend(leftBBox, node.leaf_ ? toBBox(child) : child);
      margin += bboxMargin(leftBBox);
    }

    for (i = M - m - 1; i >= m; i--) {
      child = await node.children_[i];
      extend(rightBBox, node.leaf_ ? toBBox(child) : child);
      margin += bboxMargin(rightBBox);
    }

    return margin;
  }

  const _adjustParentBBoxes = (bbox, path, level) => {
    // adjust bboxes along the given tree path
    for (var i = level; i >= 0; i--) {
      extend(path[i], bbox);
    }
  }

  const _condense = async (path) => {
    // go through the path, removing empty nodes and updating bboxes
    for (var i = path.length - 1, siblings; i >= 0; i--) {
      if (path[i].children_.length === 0) {
        if (i > 0) {
          siblings = path[i - 1].children_;
          siblings.splice(siblings.indexOf(path[i]), 1);
          _pendingChanges[path[i].id] = { status_: STATUS_DELETED };

        } else {
          _pendingChanges[ROOT_NODE_ID] = { status_: STATUS_DELETED };
          await _commit(); // remove old root node from indexeddb
          clear();
        }

      } else await calcBBox(path[i], toBBox);
    }
  }

  const createNode = (children_, id) => {
    return wrap({
      children_,
      id: id ? id : uuid(),
      height_: 1,
      leaf_: true,
      bbox: [
        Infinity,
        Infinity,
        -Infinity,
        -Infinity
      ]
    }, _pendingChanges, db, objectStoreName)
  }

  // min bounding rectangle of node children from k to p-1
  const distBBox = async (node, k, p, toBBox, destNode) => {
    if (!destNode) destNode = {};
    destNode.bbox = [
      Infinity,
      Infinity,
      -Infinity,
      -Infinity
    ]

    for (var i = k, child; i < p; i++) {
      child = await node.children_[i];
      extend(destNode, node.leaf_ ? toBBox(child) : child);
    }

    return destNode;
  }

  // calculate node's bbox from bboxes of its children
  const calcBBox = async (node, toBBox) => {
    await distBBox(node, 0, node.children_.length, toBBox, node)
  }

  const node = await loadById(db, objectStoreName, ROOT_NODE_ID)
  if (node) {
    data = wrap(node, _pendingChanges, db, objectStoreName, { restored_: true });
  } else {
    clear();
    await _commit();
  }

  return Object.freeze({
    all,
    search,
    load,
    insert,
    clear,
    remove,
    toJSON,
    fromJSON
  })
}
