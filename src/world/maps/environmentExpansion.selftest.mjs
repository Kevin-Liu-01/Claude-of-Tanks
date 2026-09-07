import assert from 'node:assert/strict';
import { assertDeploymentRoadCoverage } from '../mapRoadCoverage.mjs';
import { createHeightField } from '../terrain.ts';
import { PLAYABLE_HALF_EXTENT_M } from '../battlefieldBounds.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './structureKit.ts';
import { sampleObbGround } from '../propPlacement.ts';
import polders from './polders.ts';
import copperMesa from './copperMesa.ts';
import airfield from './airfield.ts';
import oasis from './oasis.ts';
import whiteout from './whiteout.ts';
import orchard from './orchard.ts';
import longleaf from './longleaf.ts';
import mangrove from './mangrove.ts';
import saltwind from './saltwind.ts';
import reservoir from './reservoir.ts';
import delta from './delta.ts';
import monsoon from './monsoon.ts';
import autumn from './autumn.ts';
import { createMarshChannel } from './marshChannel.ts';

const maps = [polders, copperMesa, airfield, oasis, whiteout,
  orchard, longleaf, mangrove, saltwind, reservoir];
// First-pass authoring ceilings: the lived-in revision redistributes these
// populations instead of hiding a geometry/query-cost increase in new roads.
const authoredBudgets = {
  polders: { roadNodes: 157, wallM: 409, beltTrees: 41, trees: [42, 64, 72], grass: 1.02, rocks: 112, outcrops: 12, plan: 18 },
  copper_mesa: { roadNodes: 166, wallM: 405, beltTrees: 0, trees: [22, 32, 40], grass: 0.36, rocks: 224, outcrops: 42, plan: 16 },
  airfield: { roadNodes: 184, wallM: 403, beltTrees: 0, trees: [26, 42, 80], grass: 0.72, rocks: 98, outcrops: 12, plan: 16 },
  oasis: { roadNodes: 152, wallM: 421, beltTrees: 29, trees: [24, 28, 30], grass: 0.5, rocks: 144, outcrops: 24, plan: 18 },
  whiteout: { roadNodes: 150, wallM: 420, beltTrees: 0, trees: [8, 12, 20], grass: 0.2, rocks: 136, outcrops: 22, plan: 16 },
  orchard: { roadNodes: 156, wallM: 884, beltTrees: 61, trees: [42, 38, 88], grass: 0.95, rocks: 138, outcrops: 20, plan: 18 },
  longleaf: { roadNodes: 157, wallM: 432, beltTrees: 62, trees: [62, 86, 104], grass: 1, rocks: 164, outcrops: 24, plan: 18 },
  mangrove: { roadNodes: 156, wallM: 410, beltTrees: 29, trees: [58, 78, 84], grass: 1.06, rocks: 114, outcrops: 12, plan: 18 },
  saltwind: { roadNodes: 154, wallM: 440, beltTrees: 0, trees: [34, 52, 62], grass: 0.68, rocks: 188, outcrops: 30, plan: 18 },
  reservoir: { roadNodes: 165, wallM: 421, beltTrees: 0, trees: [66, 98, 108], grass: 0.96, rocks: 194, outcrops: 32, plan: 18 },
};

// Audit the real resampled road lattice with the runtime's setback, wetness
// and rigid-footprint support rules. This is not a substitute for the full
// seeded builder/collider receipt, but catches empty or single-ribbon plans
// without allocating textures, meshes or a browser.
function supportedFrontages(config, hf) {
  const village = hf._layout.village;
  const roads = hf._layout.roads;
  let junction = [village.cx, village.cz], nearest = Infinity;
  for (let ai = 0; ai < roads.length; ai++) for (let bi = ai + 1; bi < roads.length; bi++) {
    for (const a of roads[ai]) for (const b of roads[bi]) {
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 18) continue;
      const x = (a[0] + b[0]) / 2, z = (a[1] + b[1]) / 2;
      const distance = Math.hypot(x - village.cx, z - village.cz);
      if (distance < nearest) { nearest = distance; junction = [x, z]; }
    }
  }
  const inside = (x, z, pad = 0) => x >= village.x0 + pad && x <= village.x1 - pad
    && z >= village.z0 + pad && z <= village.z1 - pad;
  const lat = config.props.buildingLat[0] + config.props.buildingLat[1] * 0.5;
  return roads.map((road) => road.flatMap(([x, z], index) => {
    if (!index || index === road.length - 1 || !inside(x, z, 6)
      || Math.hypot(x - junction[0], z - junction[1]) < 22) return [];
    const a = road[index - 1], b = road[index + 1];
    const yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
    return [-1, 1].flatMap((side) => {
      const px = x - Math.cos(yaw) * side * lat, pz = z + Math.sin(yaw) * side * lat;
      if (!inside(px, pz) || hf._roadDist(px, pz) < 7.5 || hf._noVeg(px, pz)) return [];
      if (config.props.tacticalBeats.some((beat) => {
        const meta = DESTRUCTIBLE_BUILDING_TYPES[beat.structure];
        return Math.hypot(px - beat.x, pz - beat.z) < Math.hypot(meta.hw, meta.hl) * 0.72
          + (beat.reservePad ?? 2.5) + 10;
      })) return [];
      // A representative 12 x 16 m building, not a point standing on a road.
      if (sampleObbGround(hf, px, pz, 6, 8, yaw).spread > (config.props.maxSpread ?? 1.7)) return [];
      return [{ x: px, z: pz, yaw }];
    });
  }));
}
assert.equal(maps.length, 10, 'the inhabited-environment expansion adds ten battlefields');
assert.equal(new Set(maps.map(({ id }) => id)).size, 10, 'new battlefield identities are unique');
assert.equal(new Set(maps.map(({ terrain }) => JSON.stringify(terrain.roads))).size, 10,
  'every battlefield authors its own road graph');
assert.equal(new Set(maps.map(({ terrain }) => JSON.stringify(terrain.landforms))).size, 10,
  'every battlefield authors its own macro relief instead of copying a palette');
assert.equal(new Set(maps.map(({ props }) => JSON.stringify(props.plan))).size, 10,
  'each settlement has its own occupational building mix');

for (const config of maps) {
  const label = config.id;
  const hf = createHeightField(1337, config);
  const replay = createHeightField(1337, config);
  const roads = hf._layout.roads;
  const budget = authoredBudgets[label];
  assert.ok(roads.reduce((count, road) => count + road.length, 0) <= budget.roadNodes,
    `${label}: settlement articulation does not expand the per-query road lattice`);
  const frontages = supportedFrontages(config, hf);
  assert.ok(frontages.filter((sites) => sites.length >= 3).length >= 2,
    `${label}: at least two streets support multiple dry, stable building footprints`);
  const sites = frontages.flat();
  assert.ok(sites.length >= config.props.plan.length,
    `${label}: the authored building plan has enough supported placement opportunities`);
  assert.ok(Math.max(...sites.map(({ x }) => x)) - Math.min(...sites.map(({ x }) => x)) >= 70
    && Math.max(...sites.map(({ z }) => z)) - Math.min(...sites.map(({ z }) => z)) >= 100,
  `${label}: inhabited frontage occupies a two-dimensional court, not one remote ribbon`);
  assert.ok(roads.length >= 5 && roads.length <= 6, `${label}: bounded multi-route layout`);
  const points = roads.flat();
  const xs = points.map(([x]) => x), zs = points.map(([, z]) => z);
  if (label === 'reservoir') {
    // Reservoir deploys west/east; keep the same coverage floors in its
    // deployment frame. Other maps retain their existing exact assertions.
    assertDeploymentRoadCoverage(roads, hf._layout.spawns, 880, 580, label);
  } else {
    assert.ok(Math.max(...xs) - Math.min(...xs) >= 580, `${label}: both flanks have road access`);
    assert.ok(Math.max(...zs) - Math.min(...zs) >= 880, `${label}: roads reach both deployment zones`);
  }
  for (const [x, z] of points) {
    assert.ok(hf.getNormalAt(x, z).y >= 0.90, `${label}: road centerline is tank-traversable at ${x},${z}`);
    assert.equal(hf.getHeightAt(x, z), replay.getHeightAt(x, z), `${label}: authoring is deterministic`);
  }

  const spawns = [config.spawns.player, ...config.spawns.enemies];
  assert.equal(spawns.length, 8, `${label}: one player and seven enemy pads`);
  for (const spawn of spawns) {
    assert.ok(Math.max(Math.abs(spawn.x), Math.abs(spawn.z)) <= PLAYABLE_HALF_EXTENT_M,
      `${label}: deployment stays in playable bounds`);
    assert.notEqual(hf.getGroundType(spawn.x, spawn.z), 'soft', `${label}: deployment stays on dry ground`);
    for (const dx of [-8, 0, 8]) for (const dz of [-8, 0, 8]) {
      assert.ok(hf.getNormalAt(spawn.x + dx, spawn.z + dz).y >= 0.94,
        `${label}: deployment pad is stable for the complete tank footprint`);
    }
  }
  for (let a = 0; a < spawns.length; a++) for (let b = a + 1; b < spawns.length; b++) {
    assert.ok(Math.hypot(spawns[a].x - spawns[b].x, spawns[a].z - spawns[b].z) >= 60,
      `${label}: deployment pads do not overlap`);
  }

  const beats = config.props.tacticalBeats;
  assert.deepEqual(beats.map(({ role }) => role).sort(), ['brawl', 'scout', 'support'],
    `${label}: three distinct vehicle-role strongpoints`);
  for (const beat of beats) {
    assert.ok(Number.isFinite(beat.yawDeg), `${label}/${beat.id}: entry and redoubt face an authored approach`);
    assert.ok(DESTRUCTIBLE_BUILDING_TYPES[beat.structure], `${label}: landmark uses a certified existing family`);
    assert.ok(config.props.destructibleBuildings.includes(beat.structure), `${label}: landmark family is loaded`);
    assert.notEqual(hf.getGroundType(beat.x, beat.z), 'soft', `${label}/${beat.id}: dry strongpoint foundation`);
    assert.ok(hf.getNormalAt(beat.x, beat.z).y >= 0.86, `${label}/${beat.id}: stable strongpoint grade`);
    assert.ok(beat.outcrop && (beat.redoubt || beat.role === 'scout'), `${label}: layered cover is intentional`);
  }
  for (let a = 0; a < beats.length; a++) for (let b = a + 1; b < beats.length; b++) {
    assert.ok(Math.hypot(beats[a].x - beats[b].x, beats[a].z - beats[b].z) >= 180,
      `${label}: strongpoints distribute tactical choices`);
  }

  // These are authoring ceilings, not a claim about measured GPU cost. The
  // browser draw/memory gate remains necessary after renderer changes.
  assert.ok(config.vegetation.species.length <= 3, `${label}: at most three foliage material families`);
  for (const [index, key] of ['clusterCount', 'loneCount', 'rimCount'].entries()) {
    assert.ok(config.vegetation[key] <= budget.trees[index], `${label}: ${key} does not grow during placement polish`);
  }
  assert.ok(config.vegetation.grassDensity <= budget.grass && config.props.rocks <= budget.rocks
    && config.props.outcrops <= budget.outcrops && config.props.plan.length <= budget.plan,
  `${label}: the per-map foliage, geology and building populations stay within the first pass`);
  assert.ok(config.props.wallRuns.reduce((sum, [x0, z0, x1, z1]) => sum + Math.hypot(x1 - x0, z1 - z0), 0) <= budget.wallM,
    `${label}: courtyard walls reuse the existing linear geometry budget`);
  assert.ok((config.vegetation.belts ?? []).reduce((sum, belt) => sum
    + Math.ceil(Math.hypot(belt.x1 - belt.x0, belt.z1 - belt.z0) / belt.gap), 0) <= budget.beltTrees,
  `${label}: relocated planted rows do not add tree instances`);
  assert.ok(config.vegetation.clusterCount <= 66 && config.vegetation.loneCount <= 98
    && config.vegetation.rimCount <= 108, `${label}: foliage stays below existing moderate maps`);
  assert.ok(config.vegetation.grassDensity <= 1.06, `${label}: no grass-density escalation`);
  assert.ok(config.props.plan.length >= 16 && config.props.plan.length <= 18, `${label}: bounded settlement plan`);
  assert.ok(config.props.rocks <= 224 && config.props.outcrops <= 42, `${label}: bounded geological dressing`);
  assert.equal(config.props.tankWrecks.count, 5, `${label}: fixed five-wreck authoring budget`);
  assert.ok(config.props.inhabit.looseClutter <= 22 && config.props.inhabit.modernClutter <= 22,
    `${label}: bounded inhabited-detail pools`);
  assert.ok(config.sky.fogDensity <= 0.00072 && config.sky.fogMix <= 0.56,
    `${label}: atmosphere preserves midfield readability`);
}

assert.ok(polders.props.plan.includes('mill') && polders.terrain.lakes.length === 27
  && !polders.terrain.marshes.length && polders.terrain.softLakes,
  'polders couple working farmland to five separately leveled retention compartments');
assert.ok(copperMesa.terrain.landforms.some((form) => form.kind === 'basin' && form.height <= -10),
  'mine has a deep authored ore cut');
assert.ok(airfield.splat.pavedRoads && airfield.vegetation.avoid.length === 5,
  'airfield preserves its long cleared paved strip');
assert.ok(oasis.terrain.dunes && oasis.terrain.lakes.length === 3 && !oasis.terrain.marshes.length
  && oasis.vegetation.belts.length === 2,
  'oasis combines dune arms, one hooked three-cell spring and planted shore palms');
assert.ok(whiteout.terrain.frozenMarshes && whiteout.props.snowCap && whiteout.vegetation.clusterCount <= 8,
  'polar station is exposed snow country rather than an alpine forest');
assert.equal(orchard.vegetation.belts.length, 6, 'orchard has six deliberately planted contour rows');
assert.ok(longleaf.vegetation.belts.length === 2 && longleaf.vegetation.avoid.length === 6 && longleaf.props.logs,
  'logging valley has a cleared harvest swath, two planted edges and timber dressing');
assert.ok(mangrove.terrain.lakes.length === 26 && mangrove.props.plan.includes('fishery'),
  'estuary islands carry multiple ford channels and fishing livelihoods');
assert.ok(saltwind.terrain.lakes.every(({ x }) => x < -400), 'saltwind water opens onto the western map edge');
assert.ok(reservoir.terrain.lakes.length === 3
  && reservoir.terrain.lakes.every(({ x, r }) => x > 100 && r >= 68)
  && reservoir.terrain.lakes.filter(({ r }) => r >= 100).length === 1,
  'one irregular upland reservoir has unequal eastern-interior basin lobes');

for (const config of [oasis, saltwind, reservoir]) {
  const levels = config.terrain.lakes.map(({ level }) => level);
  assert.ok(levels.every(Number.isFinite) && new Set(levels).size === 1,
    `${config.id}: connected sheets share one waterline without overlap steps`);
}

assert.deepEqual(createMarshChannel([]), [], 'empty channel authoring is inert');
const loneStation = { x: 0, z: 0, r: 30, dip: 1 };
assert.deepEqual(createMarshChannel([loneStation]), [loneStation], 'single-station authoring preserves the bowl');
for (const config of [delta, monsoon, autumn]) {
  const hf = createHeightField(1337, config);
  const protectedPads = [hf._layout.spawns.player, ...hf._layout.spawns.enemies];
  let wetSamples = 0, dryFordSamples = 0;
  // Monsoon retains one separate rain-fed roadside pool after its channel.
  const channel = config.id === 'monsoon' ? config.terrain.marshes.slice(0, -1) : config.terrain.marshes;
  assert.ok(channel.length >= 20 && channel.length <= (config.id === 'autumn' ? 56 : 36),
    `${config.id}: continuous river uses a bounded authoring sample count`);
  for (let index = 1; index < channel.length; index++) {
    const a = channel[index - 1], b = channel[index];
    assert.ok(Math.hypot(b.x - a.x, b.z - a.z) <= Math.min(a.r, b.r) * 1.15 + 1e-9,
      `${config.id}: channel overlaps survive the contracted irregular shore envelope`);
    for (let step = 0; step <= 4; step++) {
      const t = step / 4;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const roadDistance = hf._roadDist(x, z);
      const padDistance = Math.min(...protectedPads.map((pad) => Math.hypot(pad.x - x, pad.z - z)));
      if (roadDistance <= 14 || padDistance <= 22) {
        assert.equal(hf.getWaterMaskAt(x, z), 0,
          `${config.id}: dry ford/pad height-priority zone never paints uphill liquid`);
        if (roadDistance < 3.8) assert.equal(hf.getGroundType(x, z), 'hard',
          `${config.id}: actual road center has hard tank support`);
        dryFordSamples++;
      } else if (roadDistance >= 18 && padDistance >= 26) {
        assert.ok(hf.getWaterMaskAt(x, z) >= 0.95,
          `${config.id}: river centerline outside authored ford/pad feathers has no dry gaps at ${x},${z}`);
        wetSamples++;
      }
    }
  }
  assert.ok(wetSamples >= 60 && dryFordSamples >= 1,
    `${config.id}: independently cover continuous open water and intentional dry crossings`);
  for (const beat of config.props.tacticalBeats) {
    assert.equal(hf.getWaterMaskAt(beat.x, beat.z), 0,
      `${config.id}/${beat.id}: river repair does not flood an authored strongpoint`);
  }
}

for (const [x, z, radius, dip] of [[-300, -142, 16, 0.8], [-20, -214, 19, 0.9], [140, -202, 16, 0.8]]) {
  const ford = autumn.terrain.marshes.find(station => station.x === x && station.z === z);
  assert.ok(ford && ford.r === radius && ford.dip === dip,
    'Autumn preserves all three authored narrow, shallow ford stations');
  // Interpolated cells may connect the reach but cannot widen its original
  // ford cross-section. The radius itself includes the conservative dry bank.
  for (const station of autumn.terrain.marshes) {
    const along = Math.abs(station.x - x);
    if (along >= station.r) continue;
    const across = Math.sqrt(station.r ** 2 - along ** 2) + Math.abs(station.z - z);
    assert.ok(across <= radius + 0.01, `Autumn ford at ${x} was widened by a neighbor`);
  }
}

console.log('environmentExpansion.selftest: ten budgeted battlefields and three continuous river layouts passed');
