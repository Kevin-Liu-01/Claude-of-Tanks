import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField, mulberry32 } from '../terrain.ts';
import { MAP_IDS, getMapConfig } from './index.ts';
import { dressMapExtras } from './mapKits.ts';

const names = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood',
  'dark', 'glass', 'curtain', 'straw', 'baked'];
const winterMaps = ['winter', 'alpine', 'whiteout'];
assert.deepEqual(MAP_IDS.filter(mapId => (getMapConfig(mapId).props.extraKits
  || (mapId === 'winter' ? ['winterLake'] : [])).includes('winterLake')), winterMaps,
  'every current production winterLake consumer has geometry/support coverage');
// 2026-10-01 (frozen pins retired): the V23/V25 per-map totals, RNG draw counts and tails, berm row sequences,
// non-fragment and fragment-base sha256 pins, the "all 28 non-Winter kits" aggregate and the historical-terrain replay
// (pre-relief road/shoreline/exit/Badlands inputs, the historical mapKits module) were change detectors. The physical
// gates below run on the CURRENT terrain of every winterLake consumer: seated, embedded and non-folded berms, closed
// buried ice plates, supported reeds, finite attributes, bucket ownership, one berm set per authored lake, a storage
// ceiling and a byte-identical rebuild.
// Storage ceiling per map/seed: the largest V25 Frosthollow total (2,052,280 premerge bytes) plus 10 % headroom; (props
// lane A #19, 2026-10-15) the ice rebuilt as broken slabs (16-triangle pentagonal blocks on the baked material, the
// ridges' piles; the coordinator's budget: at most 3.0 MB): the largest Frosthollow total 2,938,920, and just over it.
const KIT_BYTES_CEILING = 2_960_000;

function build(mapId, seed) {
  const config = getMapConfig(mapId);
  const field = createHeightField(seed, config);
  const buckets = Object.fromEntries(names.map(name => [name, []]));
  const random = mulberry32(seed ^ 0x5a17);
  let calls = 0;
  dressMapExtras({ mapId, extraKits: config.props.extraKits,
    riverLandings: config.props.riverLandings, L: field._layout, heightField: field,
    rng: () => { calls++; return random(); }, buckets });
  return { field, buckets, calls, next: random() };
}

function hashGeometry(geometry, hashes) {
  let bytes = 0;
  for (const attrName of Object.keys(geometry.attributes).sort()) {
    const a = geometry.attributes[attrName].array;
    const data = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    bytes += a.byteLength;
    for (const hash of hashes) { hash.update(attrName); hash.update(data); }
  }
  if (geometry.index) {
    const a = geometry.index.array, data = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    bytes += a.byteLength;
    for (const hash of hashes) hash.update(data);
  }
  return bytes;
}

function inventory(buckets) {
  const hash = createHash('sha256');
  let vertices = 0, indices = 0, bytes = 0, geometries = 0;
  for (const name of names) {
    hash.update(name);
    for (const geometry of buckets[name]) {
      geometries++; vertices += geometry.attributes.position.count;
      indices += geometry.index?.count ?? geometry.attributes.position.count;
      hash.update(geometry.name ?? '');
      bytes += hashGeometry(geometry, [hash]);
    }
  }
  return { hash: hash.digest('hex'), vertices, indices, bytes, geometries };
}

function clearance(field, p, i) {
  return p.getY(i) - field.getHeightAt(p.getX(i), p.getZ(i));
}

function auditBermEdge(p, field, a, b) {
  // Four times the construction sample density, on the actual Float32 mesh.
  for (let step = 0; step <= 32; step++) {
    const t = step / 32;
    const x = p.getX(a) + (p.getX(b) - p.getX(a)) * t;
    const z = p.getZ(a) + (p.getZ(b) - p.getZ(a)) * t;
    const y = p.getY(a) + (p.getY(b) - p.getY(a)) * t;
    assert.ok(y - field.getHeightAt(x, z) <= -0.01,
      `interpolated perimeter ${a}→${b}/${step} stays embedded, not vertex-only grounded`);
  }
}

function auditBermShape(p, field) {
  const rows = p.count / 5, widths = [], crests = [];
  for (let row = 0; row < rows; row++) {
    const left = row * 5, crest = left + 2, right = left + 4;
    const dx = p.getX(right) - p.getX(left), dz = p.getZ(right) - p.getZ(left);
    const width = Math.hypot(dx, dz);
    const crestFraction = ((p.getX(crest) - p.getX(left)) * dx
      + (p.getZ(crest) - p.getZ(left)) * dz) / (width * width);
    assert.ok(Math.abs(crestFraction - 0.5) >= 0.069,
      'every actual cross-section has an offset crest, not mirror-image shoulders');
    widths.push(width); crests.push(clearance(field, p, crest));
    if (row > 0 && row < rows - 1) {
      assert.ok(Math.abs(clearance(field, p, left + 1) - clearance(field, p, left + 3))
        > crests[row] * 0.23, 'the two snow shoulders have unequal heights');
    }
  }
  const middleWidth = Math.max(...widths.slice(1, -1));
  assert.ok(widths[0] < middleWidth * 0.4 && widths.at(-1) < middleWidth * 0.4,
    'both finite ends taper into the sheet rather than finishing as squared track ends');
  const peaks = [];
  for (let row = 1; row < rows - 1; row++) {
    if (crests[row] > crests[row - 1] && crests[row] > crests[row + 1]) peaks.push(row);
  }
  assert.equal(peaks.length, 2, 'actual mesh has two broad, separately readable humps');
  assert.ok(Math.abs(crests[peaks[0]] - crests[peaks[1]]) > 0.001,
    'the two humps are not repeated equal-height teeth');
  assert.ok(Math.min(...crests.slice(peaks[0] + 1, peaks[1]))
    < Math.min(crests[peaks[0]], crests[peaks[1]]) * 0.8,
  'a lower connected snow saddle separates the unequal humps');
}

function auditBermTopology(geometry, rows) {
  const { position, uv, normal } = geometry.attributes;
  assert.equal(geometry.index.count, (rows - 1) * 24);
  assert.equal(position.array.byteLength + uv.array.byteLength + normal.array.byteLength, rows * 160,
    'same exact three attribute buffers and storage per pre-V24 cross-section');
  assert.equal(geometry.index.array.byteLength, (rows - 1) * 48,
    'same exact Uint16 index storage per pre-V24 cross-section gap');
  for (let row = 0; row < rows - 1; row++) for (let column = 0; column < 4; column++) {
    const i = row * 5 + column, start = (row * 4 + column) * 6;
    assert.deepEqual(Array.from(geometry.index.array.subarray(start, start + 6)),
      [i, i + 1, i + 5, i + 1, i + 6, i + 5],
      'each actual triangle retains the precise V23 connectivity and winding order');
  }
}

function auditBerm(geometry, field) {
  const p = geometry.attributes.position, uv = geometry.attributes.uv, n = geometry.attributes.normal;
  const rows = p.count / 5;
  assert.ok(Number.isInteger(rows) && rows >= 6 && rows <= 12);
  auditBermTopology(geometry, rows);
  assert.ok(p.count < rows * 24 && geometry.index.count < rows * 36,
    'the actual replacement uses fewer vertices AND indices than the old slab chain');
  for (let row = 0; row < rows; row++) for (let column = 0; column < 5; column++) {
    const i = row * 5 + column, h = clearance(field, p, i);
    const edge = row === 0 || row === rows - 1 || column === 0 || column === 4;
    assert.ok(edge ? h <= -0.0349 : h > 0 && h <= 0.316,
      'real terrain seats the whole perimeter and the crest remains above ice');
    assert.ok(n.getY(i) > 0.52, 'visible berm faces receive the existing slope-based snow cap');
    assert.ok(Math.abs(uv.getX(i) - p.getX(i) * 0.3) < 0.00005
      && Math.abs(uv.getY(i) - p.getZ(i) * 0.3) < 0.00005,
    'existing plaster/drift surface uses continuous .3 world-metric UVs');
  }
  for (let row = 0; row < rows - 1; row++) {
    auditBermEdge(p, field, row * 5, (row + 1) * 5);
    auditBermEdge(p, field, row * 5 + 4, (row + 1) * 5 + 4);
  }
  for (let column = 0; column < 4; column++) {
    auditBermEdge(p, field, column, column + 1);
    const last = (rows - 1) * 5 + column;
    auditBermEdge(p, field, last, last + 1);
  }
  auditBermShape(p, field);
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.getX(i), b = geometry.index.getX(i + 1), c = geometry.index.getX(i + 2);
    const abx = p.getX(b) - p.getX(a), abz = p.getZ(b) - p.getZ(a);
    const acx = p.getX(c) - p.getX(a), acz = p.getZ(c) - p.getZ(a);
    assert.ok(abz * acx - abx * acz > 0.005, 'every real triangle has upward winding/nonfolded area');
  }
}

// (props lane A #19, 2026-10-15: the lakes' ice is broken slabs of the sheet, maps/lakeIce.ts iceSlab) a slab is a
// closed pentagonal block 12-45 cm thick, its low edge frozen into the ice under it, rafted up off it, with a rime top
// over blue-green broken edges on the baked material's vertex colour
function auditSlab(geometry, field) {
  const p = geometry.attributes.position, n = geometry.attributes.normal, c = geometry.attributes.color;
  assert.equal(geometry.name, 'winter-ice-slab');
  assert.equal(geometry.index, null);
  assert.equal(p.count, 48, 'cap, broken sides and underside: 16 triangles');
  const edges = new Map(), key = (i) => `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
  for (let i = 0; i < p.count; i += 3) for (let j = 0; j < 3; j++) {
    const a = key(i + j), b = key(i + (j + 1) % 3);
    assert.notEqual(a, b, 'every triangle has three distinct corners');
    const forward = a < b, id = forward ? `${a}|${b}` : `${b}|${a}`;
    const entry = edges.get(id) || [0, 0];
    entry[0]++; entry[1] += forward ? 1 : -1; edges.set(id, entry);
  }
  for (const edge of edges.values()) assert.deepEqual(edge, [2, 0], 'a closed block, its faces wound one way round');
  let buried = 0, high = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const h = clearance(field, p, i);
    if (h <= -0.01) buried++;
    high = Math.max(high, h);
    assert.ok(Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5, 'finite unit lighting normals');
    for (const v of [c.getX(i), c.getY(i), c.getZ(i)]) assert.ok(v >= 0 && v <= 1);
  }
  assert.ok(buried >= 2, 'its low edge is frozen into the sheet');
  assert.ok(high > 0.08 && high < 2.4, `rafted up off the ice (${high.toFixed(2)} m), never a wall`);
  // its thickness: the cap's plane (the first 9 vertices, its fan) to the underside's (the last 9)
  const ax = p.getX(1) - p.getX(0), ay = p.getY(1) - p.getY(0), az = p.getZ(1) - p.getZ(0);
  const bx = p.getX(2) - p.getX(0), by = p.getY(2) - p.getY(0), bz = p.getZ(2) - p.getZ(0);
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
  const under = p.count - 1;
  const t = Math.abs((p.getX(under) - p.getX(0)) * nx + (p.getY(under) - p.getY(0)) * ny + (p.getZ(under) - p.getZ(0)) * nz);
  assert.ok(t >= 0.12 && t <= 0.45, `a real block ${t.toFixed(2)} m thick`);
  const lum = (i) => c.getX(i) * 0.2 + c.getY(i) * 0.7 + c.getZ(i) * 0.1;
  let cap = 0, deep = 0;
  for (let i = 0; i < 9; i++) { cap += lum(i) / 9; deep += lum(p.count - 1 - i) / 9; }
  assert.ok(cap > 0.55 && deep < 0.25, 'a rime top over the deep ice');
  assert.ok(c.getZ(9) > c.getX(9) && c.getY(9) > c.getX(9), 'blue-green broken edges');
}

function auditReeds(geometries, field) {
  const priorTips = [];
  for (const geometry of geometries) {
    if (!geometry.name.startsWith('winter-reed')) continue;
    const p = geometry.attributes.position;
    assert.equal(p.count, 14); assert.equal(geometry.index.count, 36);
    const normal = geometry.attributes.normal;
    for (const [a, b] of [[0, 4], [5, 9]]) {
      const dot = normal.getX(a) * normal.getX(b) + normal.getY(a) * normal.getY(b)
        + normal.getZ(a) * normal.getZ(b);
      assert.ok(dot > 1 - 0.000001, 'duplicated UV seam vertices have the same smooth lighting normal');
    }
    const base = [0, 0, 0];
    for (let i = 0; i < 4; i++) {
      base[0] += p.getX(i) / 4; base[1] += p.getY(i) / 4; base[2] += p.getZ(i) / 4;
    }
    if (geometry.name === 'winter-reed-head') {
      assert.ok(priorTips.some(tip => Math.hypot(...tip.map((v, i) => v - base[i])) < 0.00005),
        'every bent head connects to a real stalk tip instead of a random floating crossbar');
    } else {
      assert.ok(Math.abs(base[1] - field.getHeightAt(base[0], base[2]) + 0.06) < 0.0001,
        'each stalk uses its own actual scattered terrain support');
      for (let i = 0; i < 4; i++) assert.ok(clearance(field, p, i) < 0,
        'no corner of a reed foot floats above its local terrain');
      const width = Math.hypot(p.getX(0) - p.getX(2), p.getZ(0) - p.getZ(2));
      assert.ok(width >= 0.0179 && width <= 0.0451, 'reeds are18–45mm wide, not6–15cm posts');
      const middleWidth = Math.hypot(p.getX(5) - p.getX(7), p.getZ(5) - p.getZ(7));
      assert.ok(middleWidth < width * 0.65, 'stalk silhouette tapers before its pointed tip');
      priorTips.push([p.getX(10), p.getY(10), p.getZ(10)]);
      if (priorTips.length > 14) priorTips.shift();
    }
    for (let i = 11; i < 14; i++) assert.deepEqual(
      [p.getX(i), p.getY(i), p.getZ(i)], [p.getX(10), p.getY(10), p.getZ(10)],
      'the actual stem has one finite connected tip');
  }
}

let berms = 0, wedges = 0;
for (const mapId of winterMaps) for (const seed of [1337, 2049, 7719]) {
  const built = build(mapId, seed), stats = inventory(built.buckets);
  try {
    assert.ok(stats.bytes <= KIT_BYTES_CEILING,
      `${mapId}/${seed}: winter kit storage stays inside its ceiling (${stats.bytes} bytes)`);
    assert.ok(built.buckets.straw.length > 0, `${mapId}/${seed}: the authored reed/head population exists`);
    const snowBerms = built.buckets.plaster.filter(g => g.name === 'winter-pressure-berm');
    assert.deepEqual(names.filter(name => built.buckets[name].length),
      mapId === 'whiteout' || mapId === 'winter' ? ['plaster', 'straw', 'baked'] : ['plaster', 'wood', 'straw', 'baked'], // 2026-09-23: no 80 m sheet on Frosthollow => no rowboat wood
      'kit reuses the already-populated plaster draw (the snow) and the baked one (the ice); its obsolete stone batch is eliminated');
    let mapBerms = 0, mapWedges = 0;
    for (const geometry of snowBerms) { auditBerm(geometry, built.field); mapBerms++; }
    for (const geometry of built.buckets.stone) {
      assert.notEqual(geometry.name, 'winter-pressure-berm', 'accepted snow berm stays out of masonry');
      assert.notEqual(geometry.name, 'winter-ice-wedge', 'no snow-dusted fracture retains mortar relief');
    }
    for (const geometry of built.buckets.plaster) assert.notEqual(geometry.name, 'winter-ice-slab', 'the ice is off the snow');
    for (const geometry of built.buckets.baked) {
      if (geometry.name === 'winter-ice-slab') { auditSlab(geometry, built.field); mapWedges++; }
    }
    assert.equal(mapBerms, built.field._layout.lakes.reduce((n, lake) => n + (lake.r >= 80 ? 7 : 2), 0),
      `${mapId}: every authored pressure ridge still exists`);
    assert.ok(mapWedges > mapBerms * 4, `${mapId}/${seed}: the shore's slabs and the ridges' piles are populated (${mapWedges})`);
    auditReeds(built.buckets.straw, built.field);
    for (const [bucket, geometries] of Object.entries(built.buckets)) for (const geometry of geometries) {
      assert.deepEqual(Object.keys(geometry.attributes).sort(), bucket === 'baked' ? ['color', 'normal', 'position', 'uv'] : ['normal', 'position', 'uv']);
      for (const attr of Object.values(geometry.attributes)) {
        assert.ok(attr.array.every(Number.isFinite), 'merged attributes remain finite and compatible');
      }
    }
    berms += mapBerms; wedges += mapWedges;
    if (seed === 1337) {
      const repeated = build(mapId, seed);
      try {
        assert.equal(inventory(repeated.buckets).hash, stats.hash,
          'an independent production build reproduces every current kit byte');
        assert.equal(repeated.calls, built.calls, 'the rebuild draws the same RNG sequence');
        assert.equal(repeated.next, built.next, 'subsequent seeded work gets the identical RNG tail');
      } finally { for (const list of Object.values(repeated.buckets)) for (const geometry of list) geometry.dispose(); }
    }
    console.log(`${mapId}/${seed}: ${stats.bytes} bytes, ${stats.indices} indices, ${mapBerms} berms, ${mapWedges} plates`);
  } finally {
    for (const geometries of Object.values(built.buckets)) for (const geometry of geometries) geometry.dispose();
  }
}
console.log(`winterLakeGeometry.selftest: ${berms} seated berms, ${wedges} ice slabs on the current Winter/Alpine/Whiteout terrain across three seeds`);

const supportFunctions = [
  () => 0,
  ...[0.12, -0.18].map(slope => (x, z) => slope * x + slope * z * 0.4 + Math.sin(x * 0.7) * 0.01),
  (x, z) => 0.3 * Math.sin(x * 0.75) * Math.cos(z * 0.6),
];
for (const getHeightAt of supportFunctions) {
  const field = {
    getHeightAt,
    getWaterMaskAt: () => 0, // Frozen-bank fixtures contain no liquid water.
    _roadDist: () => 100,
  };
  const buckets = Object.fromEntries(names.map(name => [name, []]));
  dressMapExtras({ mapId: 'winter', extraKits: ['winterLake'],
    L: { lakes: [{ x: 40, z: -30, r: 20 }], roads: [], village: { x0: 0, z0: 0, z1: 0 } },
    heightField: field, rng: mulberry32(7719), buckets });
  try {
    for (const geometry of buckets.plaster) {
      if (geometry.name === 'winter-pressure-berm') auditBerm(geometry, field);
    }
    for (const geometry of buckets.baked) {
      if (geometry.name === 'winter-ice-slab') auditSlab(geometry, field);
    }
    auditReeds(buckets.straw, field);
  } finally {
    for (const geometries of Object.values(buckets)) for (const geometry of geometries) geometry.dispose();
  }
}
console.log('winterLakeGeometry.selftest: flat, sloped, rippled and curved underside support fixtures also pass');
