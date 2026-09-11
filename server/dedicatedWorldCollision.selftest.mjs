import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { Vector3 } from 'three';
import {
  createDedicatedWorldCollision,
  dedicatedCollisionManifestStats,
} from './dedicatedWorldCollision.ts';
import { getMapConfig, MAP_IDS } from '../src/world/maps/index.ts';
import { createHeadlessCollisionWorld } from '../src/world/headlessCollisionWorld.ts';
import { pushHullFromObstacle, rayCollisionRecord, shellPassesThroughCollisionRecord } from '../src/world/collision.ts';
import { decodeCollisionManifest, encodeCollisionManifest } from './collisionManifestCodec.ts';

const authoredWorlds = new Map();
// Fresh completed-road placement retains coalSiteIsClear's exact obstacle,
// slope and road rejection. The native capture has five clear piles on each
// of Foundry and Skybridge; movement/shell pairs and contact tests below remain.
const coalCensus = { railyard: 7, caldera: 7, foundry: 5, skybridge: 5 };

// Public-fleet wreck recapture: different hulk footprints change accepted
// placements on six maps. These exact counts preserve every non-wreck record
// and concealment list; terrain rejection and placement budgets are unchanged.
// The scoped coal capture adds 24 movement/shell pairs on four rail maps;
// its exact native-control attribution is in RAIL-COAL-STOCKPILES-CHECKPOINT.md.
// 2026-09-11: fresh all-map road-completion capture. The original planting
// sampler preserves seeded vegetation; only newly unsafe road/slope sites
// are excluded. Props use the completed physical roads. Exact census deltas
// are retained in docs/research/launch-collision-refresh-20260911.md.
const roadCompletionCensus = {
  verdant: [6501, 6250, 6763],
  desert: [2381, 2337, 1823],
  winter: [5085, 4870, 4281],
  urban: [3590, 5302, 2399],
  coastal: [3308, 3103, 2648],
  autumn: [6085, 5811, 6261],
  steppe: [2234, 1950, 1392],
  railyard: [2715, 2554, 1973],
  // playable-relief-collision-r1.8y4kRZ: native two-map terrain recapture;
  // unchanged seeded rejection rules alter accepted trees/props, not tolerances.
  frontier: [7381, 7120, 7538],
  fjord: [6346, 6187, 5572],
  delta: [7085, 6844, 8491],
  // redrock-derived-refresh-r1.p545nm: native canyon recapture. Unchanged
  // terrain-aware placement rules reject different props/trees on steep walls.
  badlands: [2668, 2493, 1698],
  monsoon: [9273, 9031, 11088],
  alpine: [8406, 8219, 7465],
  caldera: [4673, 4568, 3568],
  foundry: [3947, 3786, 2938],
  ruinspires: [2823, 5139, 1159],
  blackglass: [3491, 4374, 2251],
  titan_gorge: [2468, 2282, 1139],
  skybridge: [3114, 3169, 1886],
  // Native 3c06d3352 capture: authored drainage contours change seeded
  // vegetation/prop acceptance. Keep the exact census, not a tolerance.
  polders: [3957, 3736, 3406],
  // V23 native receipt (9fdbc49b): quarry-only producer A/B reproduces
  // every captured record. Existing slope/RNG rules yield +2 surface-rock
  // cover, -5 outcrop cover and -1 slope-rejected sapling; named prop counts
  // and 79 bush concealers are unchanged. No census tolerance is introduced.
  copper_mesa: [2550, 2369, 1809],
  // The shared terrain exclusion now follows the actual hardstand rectangle
  // plus its shoulder; the airfield configuration itself is unchanged.
  airfield: [3163, 3138, 2739],
  // Native19e03d36b: the authored spring contour changes terrain-aware
  // vegetation/prop acceptance; this is the exact captured census.
  oasis: [2486, 2270, 1888],
  whiteout: [1446, 1262, 805],
  orchard: [4399, 4154, 4454],
  longleaf: [5634, 5422, 6154],
  mangrove: [4919, 4741, 5666],
  saltwind: [3347, 3156, 2723],
  // Refreshed forked roads, assembly hardstand and grounded waterworks.
  reservoir: [6095, 5890, 6620],
};
// Native rim-road repair removes only rooted trees inside the 9 m road margin.
// Frozen 89784835d comparison proves every other movement/shell/concealment
// record is unchanged. Keep both fixed censuses explicit, with no tolerance.
const rimRoadRemovals = {
  verdant: 34,
  desert: 1,
  winter: 33,
  urban: 155,
  coastal: 36,
  autumn: 37,
  steppe: 12,
  railyard: 152,
  frontier: 101,
  fjord: 118,
  delta: 183,
  badlands: 6,
  monsoon: 127,
  alpine: 118,
  caldera: 46,
  foundry: 156,
  ruinspires: 197,
  blackglass: 70,
  titan_gorge: 10,
  skybridge: 1,
  polders: 65,
  copper_mesa: 67,
  airfield: 61,
  oasis: 31,
  whiteout: 14,
  orchard: 73,
  longleaf: 84,
  mangrove: 41,
  saltwind: 74,
  reservoir: 92
};
const expected = Object.fromEntries(Object.entries(roadCompletionCensus).map(([id, counts]) =>
  [id, counts.map(count => count - rimRoadRemovals[id])]));
const stats = dedicatedCollisionManifestStats();
assert.deepEqual(Object.keys(expected), MAP_IDS, 'every registered map has a fixed census expectation');
assert.deepEqual(Object.keys(stats), MAP_IDS, 'manifest order and map registry stay in lockstep');
assert.deepEqual(readdirSync(new URL('./world-collision-manifests/', import.meta.url))
  .filter((file) => file.endsWith('.json') && file !== 'index.json').sort(),
MAP_IDS.map((id) => `${id}.json`).sort(), 'exactly one collision shard exists for every canonical map');
for (const [mapId, counts] of Object.entries(expected)) {
  assert.deepEqual(Object.values(stats[mapId]), counts, `${mapId} manifest census`);
  const mapWorld = createDedicatedWorldCollision(mapId);
  if (mapId === 'reservoir' || mapId === 'longleaf' || mapId in coalCensus) authoredWorlds.set(mapId, mapWorld);
  const hedgehogObstacles = mapWorld.getObstacles().filter((record) => record.kind === 'hedgehog');
  const hedgehogColliders = mapWorld.getColliders().filter((record) => record.kind === 'hedgehog');
  assert.ok(hedgehogObstacles.length >= 3 && hedgehogObstacles.length % 3 === 0,
    `${mapId} hedgehogs remain complete three-beam compounds`);
  assert.equal(hedgehogColliders.length, hedgehogObstacles.length,
    `${mapId} movement and shell hedgehog censuses agree`);
  assert.ok(hedgehogObstacles.every((record) => record.shape2?.kind === 'obb'),
    `${mapId} dedicated movement preserves narrow hedgehog beam shapes`);
  assert.ok(hedgehogColliders.every((record) => record.shape2?.kind === 'obb'),
    `${mapId} dedicated shell collision preserves narrow hedgehog beam shapes`);
  const treeObstacles = mapWorld.getObstacles().filter((record) => record.treeIdx != null);
  const treeColliders = mapWorld.getColliders().filter((record) => record.treeIdx != null);
  assert.ok(treeObstacles.length > 0, `${mapId} captures reachable trees as movement obstacles`);
  assert.equal(treeColliders.length, treeObstacles.length,
    `${mapId} movement and shell tree censuses agree`);
  assert.ok(treeObstacles.every((record) => record.crushable && record.kind === 'tree'),
    `${mapId} every reachable tree follows the shared destruction behavior`);
  assert.ok(treeObstacles.every((record) => record.crushMin === 0 && record.crushKeep === 1),
    `${mapId} trees topple immediately without becoming invisible speed bumps`);
}

const world = createDedicatedWorldCollision('verdant');
assert.equal(world.getObstacles().length, expected.verdant[0]);
assert.equal(world.getColliders().length, expected.verdant[1]);
assert.equal(world.getConcealment().length, expected.verdant[2]);
assert.ok(world.getObstacles().some((record) => record.shape2?.kind === 'convex'));
const compoundStructure = world.getObstacles().find((record) => record.shape2?.kind === 'compound');
assert.ok(compoundStructure && compoundStructure.shape2.parts.length >= 2,
  'dedicated manifest preserves exact compound structure parts behind one broad-phase record');
assert.ok(world.getObstacles().some((record) => record.crushable));
const destructible = world.getObstacles().find((record) => record.crushable &&
  record.propIdx != null && world.getColliders().some((entry) => entry.propIdx === record.propIdx));
const destructibleCollider = world.getColliders().find((record) =>
  record.propIdx === destructible.propIdx);
assert.equal(world.crushObstacle(destructible), true);
assert.equal(destructibleCollider.dead, true, 'destroyed server cover opens shell and LOS paths');

const tree = world.getObstacles().find((record) => record.treeIdx != null);
const treeCollider = world.getColliders().find((record) => record.treeIdx === tree.treeIdx);
assert.equal(world.crushObstacle(tree), true, 'dedicated tree yields to shell or ram destruction');
assert.equal(treeCollider.dead, true, 'felled dedicated tree leaves the shell/LOS collider set');

const shapeCenter = (shape, record) => {
  if (!shape) return [(record.min[0] + record.max[0]) * 0.5, (record.min[2] + record.max[2]) * 0.5];
  if (shape.kind === 'compound') return shapeCenter(shape.parts[0], record);
  return [shape.cx, shape.cz];
};
let hit = null;
for (const collider of world.getColliders()) {
  if (collider.dead || collider.max[1] - collider.min[1] < 0.2) continue;
  const [centerX, centerZ] = shapeCenter(collider.shape2, collider);
  hit = world.raycast(
    new Vector3(centerX, collider.max[1] + 2, centerZ),
    new Vector3(0, -1, 0),
    collider.max[1] - collider.min[1] + 4,
  );
  if (hit?.kind === 'prop') break;
}
assert.equal(hit?.kind, 'prop', 'headless raycast resolves captured shell cover');
const compound = world.getColliders().find((record) => record.shape2?.kind === 'compound');
assert.ok(compound, 'dedicated manifest retains compound structure footprints');
assert.ok(compound.shape2.parts.length >= 2 && compound.shape2.parts.length <= 64,
  'dedicated compound remains tight and bounded after inflation');

// Reuse the actual worlds/terrain above. Only the two small authored record
// subsets are re-encoded and inflated; no browser or procedural props rebuild.
function roundTripFeatureWorld(mapId, sourceWorld, kind) {
  const manifest = decodeCollisionManifest(JSON.parse(readFileSync(
    new URL(`./world-collision-manifests/${mapId}.json`, import.meta.url), 'utf8')));
  const selected = {
    obstacles: manifest.obstacles.filter(record => record.k === kind),
    colliders: manifest.colliders.filter(record => record.k === kind), concealers: [],
  };
  const restored = decodeCollisionManifest(JSON.parse(JSON.stringify(encodeCollisionManifest(selected))));
  assert.deepEqual(restored, selected, `${mapId}: all authored bounds, shapes, metadata and order round-trip exactly`);
  const copy = createHeadlessCollisionWorld({ mapId, heightField: sourceWorld.heightField, manifest: restored });
  assert.deepEqual(copy.getObstacles(), sourceWorld.getObstacles().filter(record => record.kind === kind));
  assert.deepEqual(copy.getColliders(), sourceWorld.getColliders().filter(record => record.kind === kind));
  return copy;
}

function assertAuthoredContact(mapWorld, obstacle, collider, x, z, label) {
  assert.ok(mapWorld.queryObstacles(x - 0.1, z - 0.1, x + 0.1, z + 0.1, []).includes(obstacle),
    `${label}: the dedicated broad phase indexes the authored footprint`);
  const push = { x: 0, z: 0 };
  assert.equal(pushHullFromObstacle({ x, z }, 0, 1, 1, 0, 1, 0.7, obstacle, push), true,
    `${label}: actual hull contact resolves against the inflated shape`);
  assert.ok(Number.isFinite(push.x) && Number.isFinite(push.z) && Math.hypot(push.x, push.z) > 0);
  const [cx, cz] = shapeCenter(collider.shape2, collider);
  const origin = new Vector3(cx, collider.max[1] + 0.5, cz), down = new Vector3(0, -1, 0);
  const normal = new Vector3();
  assert.ok(Math.abs(rayCollisionRecord(origin, down, collider, 0.75, normal) - 0.5) < 1e-9,
    `${label}: the top collision plane survives inflation`);
  assert.deepEqual(normal.toArray(), [0, 1, 0]);
  const hit = mapWorld.raycast(origin, down, 0.75);
  assert.equal(hit?.record, collider, `${label}: world raycast reaches this exact cover record`);
  assert.ok(Math.abs(hit.point.y - collider.max[1]) < 1e-9);
  return { origin, down };
}

const capturedNumber = value => Math.round(value * 10000) / 10000;

function expectedWaterworksBounds(field, name, center, width, depth, waterLevel) {
  const [x, z] = center;
  let low = Infinity, high = -Infinity;
  for (let px = x - width / 2; px <= x + width / 2; px += 0.5) {
    for (let pz = z - depth / 2; pz <= z + depth / 2; pz += 0.5) {
      const y = field.getHeightAt(px, pz);
      low = Math.min(low, y); high = Math.max(high, y);
    }
  }
  // Independent authored dimensions: dry kiosk embeds 12 cm; hydraulic feet
  // extend 1.2 m below the water plane. The taller intake body has a closed
  // full-footprint 1.04 m hood; the ordinary kiosk/bank caps add 6 cm.
  const bottom = name === 'kiosk' ? low - 0.12 : waterLevel - 1.2;
  const top = name === 'intake' ? waterLevel + 7.4 + 1.04
    : (name === 'kiosk' ? high + 3.2 : waterLevel + 1.1) + 0.06;
  return { min: [x - width / 2, bottom, z - depth / 2].map(capturedNumber),
    max: [x + width / 2, top, z + depth / 2].map(capturedNumber) };
}

function assertWaterworks(mapWorld) {
  const obstacles = mapWorld.getObstacles().filter(record => record.kind === 'waterworks');
  const colliders = mapWorld.getColliders().filter(record => record.kind === 'waterworks');
  assert.equal(obstacles.length, 3,
    'Reservoir fixture is missing the three authored waterworks obstacles; regenerate its native collision shard');
  assert.equal(colliders.length, 3, 'Reservoir must capture all three waterworks shell-cover records');
  const config = getMapConfig('reservoir').props.reservoirWaterworks;
  const level = mapWorld.heightField._layout.lakes[config.lakeIndex].level;
  assert.ok(Number.isFinite(level));
  for (const [name, width, depth] of [['kiosk', 6, 6], ['bank', 7, 12], ['intake', 7, 6]]) {
    const [x, z] = config[name];
    const selected = records => records.filter(record => record.shape2?.cx === x && record.shape2?.cz === z);
    const obs = selected(obstacles), cols = selected(colliders);
    assert.equal(obs.length, 1, `${name}: exactly one movement slot at the authored site`);
    assert.equal(cols.length, 1, `${name}: exactly one shell slot at the authored site`);
    const bounds = expectedWaterworksBounds(mapWorld.heightField, name, [x, z], width, depth, level);
    for (const record of [obs[0], cols[0]]) {
      assert.deepEqual(record.shape2, { kind: 'obb', cx: x, cz: z, hw: width / 2, hl: depth / 2, yaw: 0 },
        `${name}: old rubble circle is replaced, not retained beside the body OBB`);
      assert.deepEqual(record.min, bounds.min); assert.deepEqual(record.max, bounds.max);
      for (const key of ['crushable', 'propIdx', 'treeIdx', 'crushMin', 'crushKeep', 'dead', 'crushed']) {
        assert.equal(record[key], undefined, `${name}: permanent masonry has no destruction linkage (${key})`);
      }
      assert.equal(shellPassesThroughCollisionRecord(record), false, `${name}: shells cannot pass through solid waterworks`);
      assert.equal(rayCollisionRecord(new Vector3(record.max[0] + 0.02, record.max[1] + 0.5,
        record.max[2] + 0.02), new Vector3(0, -1, 0), record, 1, new Vector3()), -1,
      `${name}: the narrow phase does not extend beyond the real rectangular footprint`);
    }
    assertAuthoredContact(mapWorld, obs[0], cols[0], x, z, `Reservoir ${name}`);
    if (name === 'intake') assertIntakeHood(cols[0]);
  }
  const bank = colliders.find(record => record.shape2.cx === config.bank[0]);
  const intake = colliders.find(record => record.shape2.cx === config.intake[0]);
  assert.equal(bank.max[0], intake.min[0], 'bank and intake meet without a phantom water gap');
  assert.equal(bank.min[1], intake.min[1], 'both hydraulic bodies share the submerged foundation depth');
  assert.ok(intake.min[2] >= bank.min[2] && intake.max[2] <= bank.max[2],
    'the full intake interface is supported inside the bank span');
}

function assertIntakeHood(record) {
  const direction = new Vector3(-1, 0, 0), hit = new Vector3();
  const x = record.max[0] + 0.5;
  for (const z of [record.min[2] + 0.001, record.shape2.cz, record.max[2] - 0.001]) {
    const below = new Vector3(x, record.max[1] - 0.001, z);
    assert.ok(Math.abs(rayCollisionRecord(below, direction, record, 1, hit) - 0.5) < 1e-9,
      'the closed service hood blocks grazing shells across its full actual width');
    assert.equal(rayCollisionRecord(new Vector3(x, record.max[1] + 0.001, z),
      direction, record, 1, hit), -1, 'no invisible cover above the hood');
  }
  for (const z of [record.min[2] - 0.001, record.max[2] + 0.001]) {
    assert.equal(rayCollisionRecord(new Vector3(x, record.max[1] - 0.001, z),
      direction, record, 1, hit), -1, 'no invisible cover outside the hood footprint');
  }
}

function assertLoggingYard(mapWorld, independentWorld) {
  const flatbeds = mapWorld.getObstacles().filter(record => record.kind === 'truckflatbed');
  const colliders = mapWorld.getColliders().filter(record => record.kind === 'truckflatbed');
  // Completed-road placement adds four earlier accepted props. Both original
  // donor heights and authored destinations remain exact; native IDs shift +4.
  // The original sites below still detect phantom copies after relocation.
  const donors = [{ propIdx: 272, height: 1.8867, old: [310.07125, 360.43725] },
    { propIdx: 284, height: 2.0051, old: [49.2173, 228.37325] }];
  assert.deepEqual(flatbeds.map(record => record.propIdx), donors.map(record => record.propIdx));
  assert.deepEqual(colliders.map(record => record.propIdx), donors.map(record => record.propIdx));
  const sites = getMapConfig('longleaf').props.loggingYard.flatbeds;
  assert.equal(sites.length, 2, 'both existing flatbeds have explicit loading bays');
  for (const [index, obstacle] of flatbeds.entries()) {
    const { x, z } = sites[index], donor = donors[index], collider = colliders[index];
    assert.equal(obstacle.shape2?.kind, 'compound', 'final ground-bearing flatbed refit survives capture');
    assert.equal(obstacle.shape2.parts.length, 9, 'all original ground-bearing flatbed parts survive');
    assert.ok(Math.hypot(obstacle.shape2.cx - x, obstacle.shape2.cz - z) < 0.3,
      `Longleaf propIdx${donor.propIdx} is missing from its authored loading bay; regenerate its native collision shard`);
    assert.deepEqual(collider, obstacle, 'movement and shell copies share the relocated bounds, shape and identity');
    assert.equal(obstacle.crushable, true); assert.equal(obstacle.crushMin, 2); assert.equal(obstacle.crushKeep, 0.87);
    assert.equal(shellPassesThroughCollisionRecord(obstacle), true, 'relocation preserves existing breakable-cover policy');
    assert.ok(Math.abs(obstacle.max[1] - obstacle.min[1] - donor.height) < 0.000100001,
      'the original scaled height survives two independently rounded Y endpoints');
    assert.ok(!mapWorld.queryObstacles(donor.old[0] - 0.1, donor.old[1] - 0.1,
      donor.old[0] + 0.1, donor.old[1] + 0.1, []).includes(obstacle), 'no phantom donor remains indexed at its old site');
    const independent = independentWorld.getObstacles().find(record => record.propIdx === donor.propIdx);
    const independentCollider = independentWorld.getColliders().find(record => record.propIdx === donor.propIdx);
    assert.notEqual(independent, obstacle); assert.notEqual(independent.shape2.parts[0], obstacle.shape2.parts[0]);
    const before = structuredClone(independent), ray = assertAuthoredContact(mapWorld, obstacle, collider, x, z, 'Longleaf flatbed');
    assert.equal(mapWorld.crushObstacle(obstacle), true);
    assert.equal(obstacle.crushed, true); assert.equal(collider.dead, true);
    assert.equal(mapWorld.crushObstacle(obstacle), false, 'repeat destruction is idempotent');
    assert.notEqual(mapWorld.raycast(ray.origin, ray.down, 0.75)?.record, collider, 'destroyed flatbed opens its shell path');
    assert.deepEqual(independent, before, 'one match cannot destroy the same slot in another match');
    assert.equal(independentCollider.dead, undefined);
    assertAuthoredContact(independentWorld, independent, independentCollider, x, z, 'independent Longleaf flatbed');
  }
}

function assertCoalStockpiles(mapId, mapWorld) {
  const obstacles = mapWorld.getObstacles().filter(record => record.kind === 'coal-heap');
  const colliders = mapWorld.getColliders().filter(record => record.kind === 'coal-heap');
  assert.equal(obstacles.length, coalCensus[mapId], `${mapId}: native coal movement census`);
  assert.equal(colliders.length, obstacles.length, `${mapId}: native coal shell census`);
  for (const [index, obstacle] of obstacles.entries()) {
    const collider = colliders[index];
    assert.deepEqual(collider, obstacle);
    assert.notEqual(collider, obstacle); assert.notEqual(collider.shape2, obstacle.shape2);
    assert.equal(obstacle.shape2?.kind, 'convex', 'coal retains the actual packed vertex hull');
    const { cx: x, cz: z } = obstacle.shape2;
    assert.ok(obstacle.max[0] - obstacle.min[0] < 5 && obstacle.max[2] - obstacle.min[2] < 5,
      'small stockpiles cannot regress to giant placeholder bounds');
    assert.ok(obstacle.max[1] - mapWorld.heightField.getHeightAt(x, z) < 1,
      'captured piles remain sub-metre above their terrain support');
    assert.equal(shellPassesThroughCollisionRecord(collider), false);
    assertAuthoredContact(mapWorld, obstacle, collider, x, z, `${mapId} coal ${index}`);
    for (const railX of [40, 49, 58, 67, 76]) {
      assert.equal(pushHullFromObstacle({ x: railX, z }, 0, 1, 1, 0, 2, 1.5, obstacle, { x: 0, z: 0 }), false,
        'new solid coal leaves every adjacent rail lane driveable');
    }
    assert.equal(rayCollisionRecord(new Vector3(x - 10, collider.max[1] + 0.01, z),
      new Vector3(1, 0, 0), collider, 20, new Vector3()), -1, 'no invisible coal cover above the actual apex');
  }
}

for (const mapId of Object.keys(coalCensus)) {
  const source = authoredWorlds.get(mapId);
  const restored = roundTripFeatureWorld(mapId, source, 'coal-heap');
  assertCoalStockpiles(mapId, source);
  assertCoalStockpiles(mapId, restored);
}

const reservoir = authoredWorlds.get('reservoir');
// Compare pristine inflation before contact queries add their private grid
// stamps. Query bookkeeping is deliberately not serialized into the codec.
const reservoirRoundTrip = roundTripFeatureWorld('reservoir', reservoir, 'waterworks');
assertWaterworks(reservoir);
assertWaterworks(reservoirRoundTrip);
const longleaf = authoredWorlds.get('longleaf');
assertLoggingYard(longleaf, roundTripFeatureWorld('longleaf', longleaf, 'truckflatbed'));

console.log(`dedicatedWorldCollision.selftest: all ${MAP_IDS.length} exact map manifests passed`);
