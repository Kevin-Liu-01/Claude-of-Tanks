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
// Storage ceiling per map/seed: the largest V25 Frosthollow total (2,052,280 premerge bytes) plus 10 % headroom.
const KIT_BYTES_CEILING = 2_260_000;

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

function iceQuadArea(p, first) {
  let area = 0;
  for (const [a, b, c] of [[first, first + 2, first + 1], [first + 2, first + 3, first + 1]]) {
    area += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a))
      - (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) * 0.5;
  }
  return area;
}

function auditIceTopology(geometry) {
  const p = geometry.attributes.position, normal = geometry.attributes.normal;
  assert.equal(p.count, 24); assert.equal(geometry.index.count, 36);
  assert.equal(hashGeometry(geometry, []), 840, 'exact pre-V25 per-fragment attribute/index storage');
  assert.equal(geometry.index.count * 32, 1152, 'exact final nonindexed position/normal/UV storage');
  assert.ok(geometry.index.array instanceof Uint16Array);
  const edges = new Map(), key = i => `${p.getX(i)},${p.getY(i)},${p.getZ(i)}`;
  for (let i = 0; i < geometry.index.count; i += 3) {
    const triangle = [0, 1, 2].map(j => geometry.index.getX(i + j));
    for (let j = 0; j < 3; j++) {
      const a = key(triangle[j]), b = key(triangle[(j + 1) % 3]);
      assert.notEqual(a, b, 'all twelve triangles retain distinct finite edges');
      const forward = a < b, id = forward ? `${a}|${b}` : `${b}|${a}`;
      const entry = edges.get(id) || [0, 0];
      entry[0]++; entry[1] += forward ? 1 : -1; edges.set(id, entry);
    }
  }
  for (const edge of edges.values()) assert.deepEqual(edge, [2, 0],
    'actual welded perimeter is closed with opposing triangle winding, not disconnected faces');
  for (let i = 0; i < p.count; i++) assert.ok(Math.abs(Math.hypot(
    normal.getX(i), normal.getY(i), normal.getZ(i)) - 1) < 0.000001,
  'all deformed faces have finite unit lighting normals');
  const ratio = iceQuadArea(p, 8) / iceQuadArea(p, 12);
  assert.ok(ratio >= 0.50 && ratio <= 0.80,
    'broad broken plate occupies50–80% of its base, not the old10% tent crest');
  for (const end of [13, 14]) {
    const dx = p.getX(end) - p.getX(12), dz = p.getZ(end) - p.getZ(12);
    for (let i = 8; i < 12; i++) {
      const t = ((p.getX(i) - p.getX(12)) * dx + (p.getZ(i) - p.getZ(12)) * dz) / (dx * dx + dz * dz);
      assert.ok(t > 0.01 && t < 0.99, 'all upper corners stay strictly inside the unchanged support footprint');
    }
  }
  const edgeLength = (a, b) => Math.hypot(p.getX(a) - p.getX(b), p.getZ(a) - p.getZ(b));
  for (const [a, b, c, d] of [[8, 9, 10, 11], [8, 10, 9, 11]]) {
    assert.ok(Math.abs(edgeLength(a, b) - edgeLength(c, d)) / edgeLength(a, b) > 0.015,
      'both pairs of opposing broken edges are unequal, not a repeated rectangle');
  }
}

function auditIce(geometry, field) {
  const p = geometry.attributes.position;
  auditIceTopology(geometry);
  let buried = 0, top = 0, minRise = Infinity, maxRise = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const h = clearance(field, p, i);
    if (h < 0) {
      assert.ok(h <= -0.01, 'all bottom corners have a meaningful terrain embed');
      assert.ok(Math.abs(p.getY(i) - p.getY(12)) < 0.00001, 'the entire bottom is one common plane');
      buried++;
    }
    else {
      assert.ok(h > 0 && h < 0.30); top++;
      minRise = Math.min(minRise, h); maxRise = Math.max(maxRise, h);
    }
  }
  assert.equal(buried, 12, 'all four repeated logical base corners are buried');
  assert.equal(top, 12, 'wedge has real volume, not a flat sheet hidden below terrain');
  assert.ok(maxRise - minRise > 0.05, 'the broad cap has a real tilted edge, not a level table');
  // Twice the construction sampling density: cover full perimeter AND every
  // underside cell, including positions between the production support probes.
  for (let row = 0; row <= 8; row++) for (let column = 0; column <= 8; column++) {
    const x = p.getX(12) + (p.getX(13) - p.getX(12)) * column / 8
      + (p.getX(14) - p.getX(12)) * row / 8;
    const z = p.getZ(12) + (p.getZ(13) - p.getZ(12)) * column / 8
      + (p.getZ(14) - p.getZ(12)) * row / 8;
    assert.ok(p.getY(12) - field.getHeightAt(x, z) <= -0.01,
      'no interpolated base edge or underside bridges a curved terrain hollow');
  }
  // Top UVs must follow the actual cap shear, not BoxGeometry's old
  // parameters.depth. Preserve the original independent .86–1.16 UV jitter.
  const uv = geometry.attributes.uv;
  for (const [a, b] of [[8, 9], [8, 10], [9, 11], [10, 11], [8, 11]]) {
    const distance = Math.hypot(p.getX(a) - p.getX(b), p.getZ(a) - p.getZ(b));
    const density = Math.hypot(uv.getX(a) - uv.getX(b), uv.getY(a) - uv.getY(b)) / distance;
    assert.ok(density >= 0.8 * 0.86 - 0.0001 && density <= 0.9 * 1.16 + 0.0001,
      'deformed cap keeps the authored .8/.9 UV density without a fivefold compressed texture');
  }
  for (const first of [12, 15]) {
    const a = geometry.index.getX(first), b = geometry.index.getX(first + 1), c = geometry.index.getX(first + 2);
    const abx = p.getX(b) - p.getX(a), abz = p.getZ(b) - p.getZ(a);
    const acx = p.getX(c) - p.getX(a), acz = p.getZ(c) - p.getZ(a);
    assert.ok(abz * acx - abx * acz > 0.0001, 'deformed top triangles retain upward winding');
  }
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
      mapId === 'whiteout' || mapId === 'winter' ? ['plaster', 'straw'] : ['plaster', 'wood', 'straw'], // 2026-09-23: no 80 m sheet on Frosthollow => no rowboat wood
      'kit reuses the already-populated plaster draw; its obsolete stone batch is eliminated');
    let mapBerms = 0, mapWedges = 0;
    for (const geometry of snowBerms) { auditBerm(geometry, built.field); mapBerms++; }
    for (const geometry of built.buckets.stone) {
      assert.notEqual(geometry.name, 'winter-pressure-berm', 'accepted snow berm stays out of masonry');
      assert.notEqual(geometry.name, 'winter-ice-wedge', 'no snow-dusted fracture retains mortar relief');
    }
    for (const geometry of built.buckets.plaster) {
      if (geometry.name === 'winter-ice-wedge') { auditIce(geometry, built.field); mapWedges++; }
    }
    assert.equal(mapBerms, built.field._layout.lakes.reduce((n, lake) => n + (lake.r >= 80 ? 7 : 2), 0),
      `${mapId}: every authored pressure ridge still exists`);
    assert.ok(mapWedges > 0, `${mapId}/${seed}: shoreline and crest ice plates are populated`);
    auditReeds(built.buckets.straw, built.field);
    for (const geometries of Object.values(built.buckets)) for (const geometry of geometries) {
      assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position', 'uv']);
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
console.log(`winterLakeGeometry.selftest: ${berms} seated berms, ${wedges} plates on the current Winter/Alpine/Whiteout terrain across three seeds`);

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
    for (const geometry of buckets.plaster) {
      if (geometry.name === 'winter-ice-wedge') auditIce(geometry, field);
    }
    auditReeds(buckets.straw, field);
  } finally {
    for (const geometries of Object.values(buckets)) for (const geometry of geometries) geometry.dispose();
  }
}
console.log('winterLakeGeometry.selftest: flat, sloped, rippled and curved underside support fixtures also pass');
