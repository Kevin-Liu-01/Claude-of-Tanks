import { historicalRoadHeightField } from '../roadHistoryTestOracle.mjs';
import { originalExitConfig } from '../../../tools/road-authored-exit-fixture.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { createHeightField, mulberry32 } from '../terrain.ts';
import { planGroundedObbPose } from '../propPlacement.ts';
import { MAP_IDS, getMapConfig } from './index.ts';

// Exercise the exact private production constructor without adding a runtime
// export or duplicating its geometry/placement implementation in the test.
const kitUrl = new URL('./mapKits.ts', import.meta.url).href;
const hook = registerHooks({ load(url, context, next) {
  const result = next(url, context);
  return url === kitUrl ? { ...result, source: `${result.source}\nexport { beachedBoat };` } : result;
} });
const { dressMapExtras, beachedBoat } = await import(kitUrl);
hook.deregister();
const names = ['plaster', 'plaster2', 'plaster3', 'roof', 'stone', 'wood',
  'dark', 'glass', 'curtain', 'straw', 'baked'];
const consumers = ['coastal', 'fjord', 'mangrove', 'saltwind'];
assert.deepEqual(MAP_IDS.filter(id => {
  const p = getMapConfig(id).props;
  return (p.extraKits || (id === 'coastal' ? ['coastal'] : [])).includes('coastal')
    || Boolean(p.riverLandings?.length);
}), consumers, 'cover every actual beachedBoat caller, including authored dry landings');

function capture() {
  const buckets = Object.fromEntries(names.map(name => [name, []]));
  const boats = [], receipts = [];
  receipts.push = receipt => {
    if (receipt.kind === 'beached-boat') {
      const last = buckets.wood.at(-1).parameters;
      const withMast = last.width === 0.08 && last.height === 0.08 && last.depth === 2.3;
      boats.push({ receipt, withMast, parts: buckets.wood.slice(withMast ? -12 : -10) });
    }
    return Array.prototype.push.call(receipts, receipt);
  };
  return { buckets, boats, receipts };
}

function inventory(built) {
  const boatSet = new Set(built.boats.flatMap(boat => boat.parts));
  const other = createHash('sha256'), boat = createHash('sha256');
  let vertices = 0, indices = 0, bytes = 0, geometries = 0;
  for (const name of names) {
    other.update(name); boat.update(name);
    for (const g of built.buckets[name]) {
      const hash = boatSet.has(g) ? boat : other;
      geometries++; vertices += g.attributes.position.count;
      indices += g.index?.count ?? g.attributes.position.count;
      for (const key of Object.keys(g.attributes).sort()) {
        const a = g.attributes[key].array;
        const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength);
        bytes += a.byteLength; hash.update(key); hash.update(b);
      }
      if (g.index) {
        const a = g.index.array;
        bytes += a.byteLength; hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      }
    }
  }
  return { other: other.digest('hex'), boat: boat.digest('hex'), vertices, indices, bytes, geometries };
}

function build(mapId, seed, historical = false) {
  const config = historical ? originalExitConfig(getMapConfig(mapId)) : getMapConfig(mapId);
  const field = (historical ? historicalRoadHeightField : createHeightField)(seed, config);
  const built = capture(), random = mulberry32(seed ^ 0x5a17);
  let calls = 0;
  dressMapExtras({ mapId, extraKits: config.props.extraKits,
    riverLandings: config.props.riverLandings, L: field._layout, heightField: field,
    rng: () => { calls++; return random(); }, buckets: built.buckets, groundingReceipts: built.receipts });
  return { ...built, field, calls, next: random() };
}

function dispose(built) {
  for (const geometries of Object.values(built.buckets)) for (const g of geometries) g.dispose();
}

// Current shoreline inventory: RNG calls/tail, boat count, raw kit geometry
// budgets and exact non-boat bytes. Published buoy waterlines and individually
// seated river reeds are accounted for; driftwood and all boat support checks
// below remain unchanged. Saltwind retains its approved 19 m piers.
// 2026-09-24 (round 56): every strand row re-pinned — the wrack line's mats, sticks, pebbles, shells and landing pieces
// now follow the kits (vertex-coloured `baked` plus the timber and crate planks in wood) and the coastal driftwood lies
// in the strand's band instead of on the plain 1.03–1.12 R circle; the mangrove rows (no authored shelf) are unchanged.
const controls = {
'coastal:1337': [16669, 0.0454030679538846, 7, 31929, 48864, 1455336, 1320, '2e596a88b4cd0b1ab10efaccc90bea266aaa4897ad835bcdb5c279da739a1b35'],
  'fjord:1337': [17247, 0.2780527842696756, 0, 14901, 25020, 668424, 592, '620389a3e185c238ecfbc7fdf64a27f6de249d0bb845b0e3f8a01364076dcaeb'],
  'mangrove:1337': [948, 0.8354170476086438, 3, 2918, 5652, 104680, 157, 'afec74e5fc20f8317d4206b2223ab748a0f2e98460e788a7ba984c22c4cf2bb7'],
  'saltwind:1337': [11683, 0.8688368322327733, 2, 21876, 33300, 1000632, 907, 'b9e564f77ffeee63e6c46522ca521231baf9ea94de8c5ab25cfbaa97fc0559f2'],
  'coastal:2049': [17211, 0.9449044358916581, 7, 33081, 50592, 1510344, 1368, '4ff180bb1387562dddc42ce541f22f096fe69b8a8923f459873a928de9b2ff6c'],
  'fjord:2049': [18143, 0.49002599250525236, 0, 17559, 28764, 793728, 705, 'a28cb362b01e9642ef42249390b288724072ecdef971e64cc045798e2fb804b5'],
  'mangrove:2049': [1171, 0.2525088486727327, 3, 3324, 6696, 119760, 186, '1829ce951029eb888a7a82b89b10c5053853311c66e89bb4c0f73f439e277e86'],
  'saltwind:2049': [12995, 0.2858398121315986, 2, 25308, 38448, 1161936, 1050, '58d2190196103e204b9ae5f12e29cd01efd51daa2e6186bc1205e363370d2e7d'],
  'coastal:7719': [16465, 0.5733173205517232, 7, 31665, 48468, 1443792, 1309, '74a95e8cb4da48a8475ee51257f84e9486592357af78f4a8212b7ff075cb0271'],
  'fjord:7719': [15585, 0.7478129521477968, 0, 10071, 17532, 444960, 393, '6730cb01025deffa66fe17abf1208d36d79da000b0bf06b07f074da8b6260b6f'],
  'mangrove:7719': [1154, 0.6781580389942974, 3, 3338, 6732, 120280, 187, '42198b4f72d2e8384ca6ce9dd62224e2c485747b01025935d9fc187a4507eef7'],
  'saltwind:7719': [12274, 0.25415970711037517, 2, 23484, 35712, 1075920, 974, 'a4a27aff54dee4f237b6b930a20ea1e0e0592fb0934b35c4810e48adb00f4ab4'],
};

function point(g, index) {
  return new THREE.Vector3().fromBufferAttribute(g.attributes.position, index);
}
function faceCenter(g, first) {
  const center = new THREE.Vector3();
  for (let i = first; i < first + 4; i++) center.add(point(g, i));
  return center.multiplyScalar(.25);
}
function auditBoat(boat, field) {
  const { parts, receipt, withMast } = boat;
  assert.equal(parts.length, withMast ? 12 : 10);
  let minGap = Infinity, maxGap = -Infinity;
  for (const g of parts.slice(0, 10)) {
    assert.equal(g.attributes.position.count, 24);
    assert.equal(g.index.count, 36);
    assert.deepEqual(Object.keys(g.attributes).sort(), ['normal', 'position', 'uv']);
    const start = point(g, 12), across = point(g, 13).sub(start), along = point(g, 14).sub(start);
    // Twice the production density, including full emitted underside edges
    // and interiors; this is not a test of the old unheeled plane receipt.
    const nu = Math.ceil(g.parameters.width / .175), nv = Math.ceil(g.parameters.depth / .175);
    for (let u = 0; u <= nu; u++) for (let v = 0; v <= nv; v++) {
      const p = start.clone().addScaledVector(across, u / nu).addScaledVector(along, v / nv);
      const gap = p.y - field.getHeightAt(p.x, p.z);
      minGap = Math.min(minGap, gap); maxGap = Math.max(maxGap, gap);
    }
    for (const attr of Object.values(g.attributes)) assert.ok(attr.array.every(Number.isFinite));
  }
  assert.ok(minGap >= -.039 && minGap <= -.032,
    `whole actual hull has shallow contact, not floating or deeply buried tips: ${minGap}`);
  assert.ok(maxGap > .25, 'upper strakes/thwarts remain visible above the beach');
  assert.ok(Math.abs(receipt.baseClearance + .035) < 1e-12);
  if (withMast) {
    const foot = faceCenter(parts[10], 12), thwartTop = faceCenter(parts[9], 8);
    assert.ok(foot.distanceTo(thwartTop) < .00004, 'actual mast foot is planted on forward thwart');
    const tip = faceCenter(parts[10], 8), axis = tip.clone().sub(foot).normalize();
    const boomCenter = faceCenter(parts[11], 0).add(faceCenter(parts[11], 4)).multiplyScalar(.5);
    const alongMast = boomCenter.clone().sub(foot).dot(axis);
    assert.ok(alongMast > .65 && alongMast < .75);
    assert.ok(foot.clone().addScaledVector(axis, alongMast).distanceTo(boomCenter) < .00004,
      'actual boom center intersects mast axis after heel, slope and yaw');
  }
  return { minGap, maxGap };
}

let realBoats = 0, mastBoats = 0, deepest = 0;
for (const seed of [1337, 2049, 7719]) for (const mapId of consumers) {
  const historical = build(mapId, seed, true), prior = inventory(historical);
  const built = build(mapId, seed), stats = inventory(built);
  try {
    assert.deepEqual([historical.calls, historical.next, historical.boats.length, prior.vertices, prior.indices,
      prior.bytes, prior.geometries, prior.other], controls[`${mapId}:${seed}`],
    `${mapId}/${seed}: exact shared RNG, budgets and ALL non-boat geometry bytes preserved`);
    // Round 47 follow-up: a shore may author `boats: 0` on every lake (Nordhavn's fjord arms — a clinker hull on a
    // 0.14 R rock bank buries its tips; the jetties stay). That is a deliberate opt-out, not vacuous coverage.
    const optedOut = (getMapConfig(mapId).terrain.lakes ?? []).every(lake => lake.boats === 0);
    assert.ok(built.boats.length > 0 || optedOut, 'no vacuous production consumer coverage');
    if (optedOut) assert.equal(built.boats.length, 0, `${mapId}: an authored zero places no boat`);
    for (const boat of built.boats) {
      const audit = auditBoat(boat, built.field);
      deepest = Math.min(deepest, audit.minGap); realBoats++; mastBoats += +boat.withMast;
    }
    const repeated = build(mapId, seed);
    assert.deepEqual(inventory(repeated), stats, 'new boat bytes are deterministic');
    assert.deepEqual([...repeated.receipts], [...built.receipts]);
    dispose(repeated);
  } finally { dispose(built); dispose(historical); }
}
console.log(`beachedBoat.selftest: ${realBoats} real boats, ${mastBoats} attached masts; worst penetration ${deepest} m`);

for (const slope of [0, .16, -.24]) for (const yaw of [0, .71, 2.8]) for (const seed of [1337, 2049, 7719]) {
  let queries = 0;
  const field = { getHeightAt: (x, z) => { queries++; return slope * x + slope * z * .35
    + (slope ? .018 * Math.sin(x * .7) * Math.cos(z * .5) : 0); },
  getWaterMaskAt: () => 0, _roadDist: () => 100 };
  const random = mulberry32(seed), built = capture();
  let calls = 0;
  beachedBoat(built.buckets, () => { calls++; return random(); }, field, 20, -30, yaw, true, built.receipts);
  const constructionQueries = queries;
  try {
    const boat = built.boats[0];
    auditBoat(boat, field);
    assert.equal(calls, 49, 'one length, six plank tilts, one heel,40UV draws and one boom yaw');
    assert.ok(constructionQueries <= 110, `bounded construction-only support queries: ${constructionQueries}`);
    const L = boat.parts[0].parameters.width;
    const pose = planGroundedObbPose(field, 20, -30, L / 2, .8, yaw, .06);
    const n = new THREE.Vector3(pose.normalX, pose.normalY, pose.normalZ);
    const longAxis = faceCenter(boat.parts[9], 0).sub(faceCenter(boat.parts[9], 4)).normalize();
    const widthAxis = faceCenter(boat.parts[9], 16).sub(faceCenter(boat.parts[9], 20)).normalize();
    assert.ok(Math.abs(longAxis.dot(n)) < .0001, 'heel adds NO bow-to-stern pitch relative to ground plane');
    assert.ok(widthAxis.dot(n) < -.099 && widthAxis.dot(n) > -.180,
      'decorative heel stays on the transverse axis at the authored .10–.18 radians');
  } finally { dispose(built); }
}
console.log('beachedBoat.selftest: flat/sloped/rippled terrain, non-cardinal yaw, rigid heel and attachment checks pass');
