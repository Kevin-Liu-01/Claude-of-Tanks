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
// These are fixed prepatch *inputs* to the shared-kit identity comparison, not
// a restriction on future map authoring (e.g. adding Saltwind's fishing piers).
// Winter-family cases below still use their actual current production config.
const nonWinterInputs = {
  fjord: { extraKits: ['coastal'] }, delta: { extraKits: ['river'] },
  caldera: { extraKits: ['rail'] }, foundry: { extraKits: ['rail'] },
  skybridge: { extraKits: ['rail'] },
  mangrove: { extraKits: ['river'], riverLandings: [
    { lakeIndex: 20, shoreAngleDeg: 285 }, { lakeIndex: 10, shoreAngleDeg: 0 },
    { lakeIndex: 16, shoreAngleDeg: 0 },
  ] },
};
// Recorded from production dressMapExtras before this geometry change:
// calls, next RNG value, vertices, indices, bytes, geometries, straw count,
// and exact later/non-target geometry (snow drifts, boats, jetties).
const before = {
  'winter:1337': [12385, 0.3840193373616785, 43479, 113616, 1618560, 1401, 951,
    '56e85e54f479e5fb6f89ec156e23140cf7a71fdd92d379e5f952b56221591815'],
  'alpine:1337': [10378, 0.27826393325813115, 35335, 89928, 1310576, 1159, 766,
    'eea867263c832df686d2925e25f61cd3c04677aa24a998aff18e41aa1c557a7b'],
  'whiteout:1337': [4791, 0.15170386852696538, 17241, 46296, 644304, 545, 398,
    '38cfcd31faee449edfad642cfeb5e1e20764c993ed76b332214abebd66f202f0'],
  'winter:2049': [12570, 0.4328551187645644, 42358, 105840, 1567136, 1406, 942,
    'd96b992d82ae579c38bca3851b623cdb7ef28a10aacc55da5ebc3cdbcbadc6d5'],
  'alpine:2049': [9926, 0.624271342298016, 34394, 86724, 1274056, 1135, 799,
    '19059a82fc22b6f58e8c7b07e6b82e9b9e79afaddd51d7e0a0e462e500417812'],
  'whiteout:2049': [4988, 0.5925797368399799, 17142, 45072, 638688, 550, 370,
    '90493b7e5c13b7360fbf45f424c9929bc78ad39c1a525558b75e9508182885e6'],
  'winter:7719': [12631, 0.13289259327575564, 42966, 109620, 1594152, 1407, 929,
    '434a4b4158fd1bc0e8ac6eca578a51605c9d47df6be1857f56fad38a34749aa7'],
  'alpine:7719': [10164, 0.26666903169825673, 33378, 82332, 1232760, 1117, 720,
    'badc49560ba02fb2672f3af45784017cf619fdcc2491cf09decf35bce8f9d406'],
  'whiteout:7719': [4839, 0.0683232310693711, 16877, 44316, 628696, 542, 383,
    'd009e977a47c2401a14405e2790b5c48631d5fd46ee72303eb51ac880ef24e70'],
};
// Refreshed only for the separately audited beachedBoat heel/contact repair.
// Replaying the original constructor from 0e1a52ea4 reproduced all three old
// aggregate hashes exactly. Only Coastal/Fjord/Mangrove boat bytes changed;
// all other geometry, counts, storage and RNG matched. beachedBoat.selftest
// retains independent pre-repair non-boat byte/budget controls for every caller.
// Frozen rowboats and the nine Winter-family controls above are unchanged.
const otherHashes = {
  1337: '4950fb009f7a2b969bade3f16fcde7b2a79d9b1659b5129196812e84efe84a06',
  2049: 'c2d1b67b04dbc1e94f3742858e92f07268a21ad7cfb20f570fff87a6abb976d4',
  7719: 'f3f22c9c4e36a05dd9ce46e075b905dcc43ac7d74b532f61c576c20e91203085',
};

function build(mapId, seed) {
  const config = getMapConfig(mapId), field = createHeightField(seed, config);
  const props = winterMaps.includes(mapId) ? config.props : nonWinterInputs[mapId] || {};
  const buckets = Object.fromEntries(names.map(name => [name, []]));
  const random = mulberry32(seed ^ 0x5a17);
  let calls = 0;
  dressMapExtras({ mapId, extraKits: props.extraKits,
    riverLandings: props.riverLandings, L: field._layout, heightField: field,
    rng: () => { calls++; return random(); }, buckets });
  return { field, buckets, calls, next: random() };
}

function inventory(buckets) {
  const hash = createHash('sha256'), later = createHash('sha256');
  let vertices = 0, indices = 0, bytes = 0, geometries = 0;
  for (const name of names) {
    const untouched = !['stone', 'straw'].includes(name);
    hash.update(name); if (untouched) later.update(name);
    for (const geometry of buckets[name]) {
      geometries++; vertices += geometry.attributes.position.count;
      indices += geometry.index?.count ?? geometry.attributes.position.count;
      for (const attrName of Object.keys(geometry.attributes).sort()) {
        const a = geometry.attributes[attrName].array;
        const data = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        bytes += a.byteLength; hash.update(attrName); hash.update(data);
        if (untouched) { later.update(attrName); later.update(data); }
      }
      if (geometry.index) {
        const a = geometry.index.array, data = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
        bytes += a.byteLength; hash.update(data); if (untouched) later.update(data);
      }
    }
  }
  return { hash: hash.digest('hex'), later: later.digest('hex'), vertices, indices, bytes, geometries };
}

function clearance(field, p, i) {
  return p.getY(i) - field.getHeightAt(p.getX(i), p.getZ(i));
}

function auditBerm(geometry, field) {
  const p = geometry.attributes.position, uv = geometry.attributes.uv, n = geometry.attributes.normal;
  const rows = p.count / 5;
  assert.ok(Number.isInteger(rows) && rows >= 6 && rows <= 12);
  assert.equal(geometry.index.count, (rows - 1) * 24);
  assert.ok(p.count < rows * 24 && geometry.index.count < rows * 36,
    'the actual replacement uses fewer vertices AND indices than the old slab chain');
  for (let row = 0; row < rows; row++) for (let column = 0; column < 5; column++) {
    const i = row * 5 + column, h = clearance(field, p, i);
    const edge = row === 0 || row === rows - 1 || column === 0 || column === 4;
    assert.ok(edge ? Math.abs(h + 0.035) < 0.0001 : h > 0 && h <= 0.316,
      'real terrain seats the whole perimeter and the crest remains above ice');
    assert.ok(n.getY(i) > 0.52, 'visible berm faces receive the existing slope-based snow cap');
    assert.ok(Math.abs(uv.getX(i) - p.getX(i) * 0.8) < 0.00005
      && Math.abs(uv.getY(i) - p.getZ(i) * 0.8) < 0.00005,
    'continuous world-metric UVs cannot repeat the old thin-box V stretch');
  }
  for (let i = 0; i < geometry.index.count; i += 3) {
    const a = geometry.index.getX(i), b = geometry.index.getX(i + 1), c = geometry.index.getX(i + 2);
    const abx = p.getX(b) - p.getX(a), abz = p.getZ(b) - p.getZ(a);
    const acx = p.getX(c) - p.getX(a), acz = p.getZ(c) - p.getZ(a);
    assert.ok(abz * acx - abx * acz > 0.005, 'every real triangle has upward winding/nonfolded area');
  }
}

function auditIce(geometry, field) {
  const p = geometry.attributes.position;
  assert.equal(p.count, 24); assert.equal(geometry.index.count, 36);
  let buried = 0, top = 0, minRise = Infinity, maxRise = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const h = clearance(field, p, i);
    if (h < 0) {
      assert.ok(h <= -0.01, 'all bottom corners have a meaningful terrain embed');
      assert.ok(Math.abs(p.getY(i) - p.getY(12)) < 0.00001, 'the entire bottom is one common plane');
      buried++;
    }
    else {
      assert.ok(h > 0 && h < 0.56); top++;
      minRise = Math.min(minRise, h); maxRise = Math.max(maxRise, h);
    }
  }
  assert.equal(buried, 12, 'all four repeated logical base corners are buried');
  assert.equal(top, 12, 'wedge has real volume, not a flat sheet hidden below terrain');
  assert.ok(maxRise - minRise > 0.05, 'the cap is an irregular sloped ice crest, not a rectangular table');
  const quadArea = first => {
    let area = 0;
    for (const [a, b, c] of [[first, first + 2, first + 1], [first + 2, first + 3, first + 1]]) {
      area += Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a))
        - (p.getZ(b) - p.getZ(a)) * (p.getX(c) - p.getX(a))) * 0.5;
    }
    return area;
  };
  assert.ok(quadArea(8) < quadArea(12) * 0.15,
    'the finite cap sits inside a broad attached toe instead of a thin vertical tile');
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
  // Top UVs must follow the actual cap shrink/shear, not BoxGeometry's old
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

let berms = 0, wedges = 0, reducedBytes = 0, finalAttributeBytesSaved = 0;
for (const seed of [1337, 2049, 7719]) {
  const others = createHash('sha256');
  for (const mapId of MAP_IDS) {
    const built = build(mapId, seed), stats = inventory(built.buckets);
    try {
      if (!winterMaps.includes(mapId)) {
        others.update(JSON.stringify([mapId, built.calls, built.next, stats.hash]));
        continue;
      }
      const old = before[`${mapId}:${seed}`];
      assert.equal(built.calls, old[0], `${mapId}: every original RNG draw is retained`);
      assert.equal(built.next, old[1], `${mapId}: subsequent seeded work gets the identical RNG tail`);
      assert.ok(stats.vertices < old[2] && stats.indices < old[3] && stats.bytes < old[4]
        && stats.geometries < old[5], `${mapId}: all actual construction/render geometry budgets decrease`);
      assert.equal(built.buckets.straw.length, old[6], 'the authored reed/head population is not thinned');
      assert.equal(stats.later, old[7], 'later snow lenses and lake landmarks survive byte-identically');
      assert.deepEqual(names.filter(name => built.buckets[name].length),
        mapId === 'whiteout' ? ['plaster', 'stone', 'straw'] : ['plaster', 'stone', 'wood', 'straw'],
        'no material/texture/shader bucket or extra draw family is introduced');
      let mapBerms = 0, mapWedges = 0;
      for (const geometry of built.buckets.stone) {
        if (geometry.name === 'winter-pressure-berm') { auditBerm(geometry, built.field); mapBerms++; }
        if (geometry.name === 'winter-ice-wedge') { auditIce(geometry, built.field); mapWedges++; }
      }
      assert.equal(mapBerms, built.field._layout.lakes.reduce((n, lake) => n + (lake.r >= 80 ? 7 : 2), 0),
        `${mapId}: every authored pressure ridge still exists`);
      assert.ok(mapWedges > 10, `${mapId}: actual shoreline and crest ice remains populated`);
      auditReeds(built.buckets.straw, built.field);
      if (mapId === 'whiteout' && seed === 1337) {
        // Actual prepatch bucket44 edge14→12 at t=.25 floated14.4109cm
        // despite both endpoints being buried. Locate its unchanged seeded
        // width and test the preserved world point independently of grid loops.
        const wedge = built.buckets.stone.find(geometry => geometry.name === 'winter-ice-wedge'
          && Math.abs(geometry.parameters.width - 1.653848610073328) < 1e-10);
        assert.ok(wedge, 'the real Whiteout shoreline regression case remains populated');
        const terrainY = built.field.getHeightAt(-330.0991668701172, 274.09700775146484);
        assert.ok(-3.8482715487480164 - terrainY > 0.14, 'the preserved original edge really bridged this bank');
        assert.ok(wedge.attributes.position.getY(12) - terrainY < -0.03,
          'the same actual Whiteout edge is now below terrain');
      }
      for (const geometries of Object.values(built.buckets)) for (const geometry of geometries) {
        assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position', 'uv']);
        for (const attr of Object.values(geometry.attributes)) {
          assert.ok(attr.array.every(Number.isFinite), 'merged attributes remain finite and compatible');
        }
      }
      berms += mapBerms; wedges += mapWedges; reducedBytes += old[4] - stats.bytes;
      // props.ts converts each indexed part to nonindexed before bucket merge.
      finalAttributeBytesSaved += (old[3] - stats.indices) * 8 * Float32Array.BYTES_PER_ELEMENT;
      console.log(`${mapId}/${seed}: geometry bytes ${old[4]}→${stats.bytes}, indices ${old[3]}→${stats.indices}`);
    } finally {
      for (const geometries of Object.values(built.buckets)) for (const geometry of geometries) geometry.dispose();
    }
  }
  assert.equal(others.digest('hex'), otherHashes[seed],
    'all 27 non-Winter kits match their audited boat-repair baseline with unchanged RNG');
}
console.log(`winterLakeGeometry.selftest: ${berms} grounded berms, ${wedges} wedges, ${reducedBytes} fewer premerge bytes; ${finalAttributeBytesSaved} fewer final nonindexed attribute bytes across9map/seed cases`);

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
    for (const geometry of buckets.stone) {
      if (geometry.name === 'winter-pressure-berm') auditBerm(geometry, field);
      if (geometry.name === 'winter-ice-wedge') auditIce(geometry, field);
    }
    auditReeds(buckets.straw, field);
  } finally {
    for (const geometries of Object.values(buckets)) for (const geometry of geometries) geometry.dispose();
  }
}
console.log('winterLakeGeometry.selftest: flat, sloped, rippled and curved underside support fixtures also pass');
