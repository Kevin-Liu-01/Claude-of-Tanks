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
  const config = getMapConfig(mapId);
  const field = createHeightField(seed, config);
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

// 2026-10-01 (frozen pins retired): per-map/seed RNG counts and tails, boat counts, kit budgets and non-boat byte digests
// built on the historical road/shoreline/exit inputs and the historical mapKits module (re-pinned at rounds 56, 58 and
// 67) were change detectors. Every consumer is now built on its current terrain: every boat seated shallowly with its
// strakes visible and its mast attached, no vacuous coverage, and a byte-identical rebuild.
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
    assert.deepEqual(inventory(repeated), stats, 'boat and kit bytes are deterministic');
    assert.deepEqual([repeated.calls, repeated.next], [built.calls, built.next], 'the rebuild draws the same seeded stream');
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
