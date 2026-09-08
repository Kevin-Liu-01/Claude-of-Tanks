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

function build(mapId, seed) {
  const config = getMapConfig(mapId), field = createHeightField(seed, config);
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

// Before the beachedBoat-only change: RNG calls/tail, boat count, all geometry
// budgets and the exact bytes of everything EXCEPT the intended boat geometry.
// Saltwind already had its approved 19 m piers when this control was recorded.
const controls = {
  'coastal:1337': [1531, .4111101049929857, 8, 6177, 11448, 220560, 233, 'a0d4dd0c2229d7b4607ae42664eefd3baec33ddfbacdc752c80856dcc905c56e'],
  'fjord:1337': [1585, .41451837751083076, 9, 6609, 12096, 235680, 251, '8f6daa5cb15d1665f76af5c4f96118b827414a3e417813de5328c5f1a6ea39ae'],
  'mangrove:1337': [948, .8354170476086438, 3, 3768, 5652, 131880, 157, 'da427a4ebbf3411042fc1d2d4b68b74340f5b6174303785cc52856c7458d1072'],
  'saltwind:1337': [396, .17567920126020908, 2, 2016, 3024, 70560, 84, '2003fb1bf6bff853acd6e8b51fe9a82bda80841bf4cf32b9e033164e7702e1f8'],
  'coastal:2049': [1584, .48176062549464405, 9, 6561, 12024, 234000, 249, '050182e21040f625b05926f4cc22af00ecc956213ab1cc836237c55e1e55287c'],
  'fjord:2049': [1584, .48176062549464405, 9, 6561, 12024, 234000, 249, '3c7c30ccd5870318bc3af8e64ed02d4a2e0e30db9bf787ca8fcfd087ed937c47'],
  'mangrove:2049': [1171, .2525088486727327, 3, 4464, 6696, 156240, 186, 'a82d5a1d01391c6e183d2e01ca010af96aec19dde8a6063e679e798891154774'],
  'saltwind:2049': [396, .06904261675663292, 2, 2016, 3024, 70560, 84, 'afff2e5b11438a2502e270577eb777ec559dfd24590b2e8411d31f8ed48f42d8'],
  'coastal:7719': [1585, .7750232561957091, 9, 6609, 12096, 235680, 251, 'f8f571c8b8c582354963510cc7ebe65b8e4c38b9da70976992589aa2ae541749'],
  'fjord:7719': [1585, .7750232561957091, 9, 6609, 12096, 235680, 251, '207d2630b6edd53cd28f71f80b4af9c51ac47cbb5474c7c141704bb5db5a3492'],
  'mangrove:7719': [1154, .6781580389942974, 3, 4488, 6732, 157080, 187, '819af65e0daa09e1d3e4da0762c5f3243efe5b0359e34a01671fa6e772e0304e'],
  'saltwind:7719': [396, .7221453771926463, 2, 2016, 3024, 70560, 84, 'c3f941d198c59990f61d318b44f16ae0e5244994530bdd1329e2352960d40c4b'],
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
  const built = build(mapId, seed), stats = inventory(built);
  try {
    assert.deepEqual([built.calls, built.next, built.boats.length, stats.vertices, stats.indices,
      stats.bytes, stats.geometries, stats.other], controls[`${mapId}:${seed}`],
    `${mapId}/${seed}: exact shared RNG, budgets and ALL non-boat geometry bytes preserved`);
    assert.ok(built.boats.length > 0, 'no vacuous production consumer coverage');
    for (const boat of built.boats) {
      const audit = auditBoat(boat, built.field);
      deepest = Math.min(deepest, audit.minGap); realBoats++; mastBoats += +boat.withMast;
    }
    const repeated = build(mapId, seed);
    assert.deepEqual(inventory(repeated), stats, 'new boat bytes are deterministic');
    assert.deepEqual([...repeated.receipts], [...built.receipts]);
    dispose(repeated);
  } finally { dispose(built); }
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
