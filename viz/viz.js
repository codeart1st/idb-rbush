var W = 700,
    canvas = document.getElementById('canvas'),
    ctx = canvas.getContext('2d');

if (window.devicePixelRatio > 1) {
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
    canvas.width = canvas.width * 2;
    canvas.height = canvas.height * 2;
    ctx.scale(2, 2);
}

function randBox(size) {
    var x = Math.random() * (W - size),
        y = Math.random() * (W - size);
    return [
        x,
        y,
        x + size * Math.random(),
        y + size * Math.random()
    ];
}

function randClusterPoint(dist) {
    var x = dist + Math.random() * (W - dist * 2),
        y = dist + Math.random() * (W - dist * 2);
    return {x: x, y: y};
}

function randClusterBox(cluster, dist, size) {
    var x = cluster.x - dist + 2 * dist * (Math.random() + Math.random() + Math.random()) / 3,
        y = cluster.y - dist + 2 * dist * (Math.random() + Math.random() + Math.random()) / 3;

    return {
        bbox: [
            x,
            y,
            x + size * Math.random(),
            y + size * Math.random()
        ],
        item: true
    };
}

var colors = ['#f40', '#0b0', '#37f'],
    rects;

async function drawTree(node, level) {
    if (!node) { return; }

    var rect = [], bbox = node.bbox;

    rect.push(level ? colors[(node.h - 1) % colors.length] : 'grey');
    rect.push(level ? 1 / Math.pow(level, 1.2) : 0.2);
    rect.push([
        Math.round(bbox[0]),
        Math.round(bbox[1]),
        Math.round(bbox[2] - bbox[0]),
        Math.round(bbox[3] - bbox[1])
    ]);

    rects.push(rect);

    if (node.l) return;
    if (level === 6) { return; }

    for (var i = 0; i < node.c.length; i++) {
        await drawTree(await node.c[i], level + 1);
    }
}

async function draw() {
    rects = [];
    await drawTree(tree.toJSON(), 0);

    ctx.clearRect(0, 0, W + 1, W + 1);

    for (var i = rects.length - 1; i >= 0; i--) {
        ctx.strokeStyle = rects[i][0];
        ctx.globalAlpha = rects[i][1];
        ctx.strokeRect.apply(ctx, rects[i][2]);
    }
}

async function search(e) {
    console.time('1 pixel search');
    await tree.search([
        e.clientX,
        e.clientY,
        e.clientX + 1,
        e.clientY + 1
    ]);
    console.timeEnd('1 pixel search');
}

async function remove() {
    data.sort(tree.compareMinX);
    console.time('remove 10000');
    for (var i = 0; i < 10000; i++) {
        await tree.remove(data[i]);
    }
    console.timeEnd('remove 10000');

    data.splice(0, 10000);

    await draw();
};
