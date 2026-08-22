import assert from 'node:assert/strict';
import { getMapConfig, MAP_IDS } from './maps/index.js';
import { createHeightField } from './terrain.js';
import { sampleHorizonSilhouette } from './maps/horizon.js';

const EXPANSION = [
  'frontier', 'fjord', 'delta', 'badlands',
  'monsoon', 'alpine', 'caldera', 'foundry',
];
const EXTREME = ['ruinspires', 'blackglass', 'titan_gorge', 'skybridge'];
const LEGACY = ['verdant', 'desert', 'winter', 'urban',
  'coastal', 'autumn', 'steppe', 'railyard'];
const MODERN_FAMILIES = [
  'm1a2', 't90m', 'leo2a7', 'm1a1', 't90a', 't80u', 'challenger2',
  'leclerc', 'merkava3d', 'k2', 'type99a', 'type10', 'kf51', 'ariete',
];
const CLUTTER_FAMILIES = ['barrier', 'roadsign', 'cone', 'transformer', 'cablespool'];

assert.equal(MAP_IDS.length, 20, 'the battlefield roster contains twenty maps');
assert.equal(new Set(MAP_IDS).size, MAP_IDS.length, 'map ids are unique');
assert.deepEqual(MAP_IDS.slice(8, 16), EXPANSION, 'the eight-map expansion stays registered');
assert.deepEqual(MAP_IDS.slice(-4), EXTREME, 'the extreme-environment expansion stays registered');

for (const mapId of MAP_IDS) {
  const config = getMapConfig(mapId);
  assert.equal(config.id, mapId, `${mapId}: config id matches registry`);
  assert.equal('sub' in config, false, `${mapId}: deprecated map tags stay out of metadata`);
  assert.ok(config.name && config.blurb, `${mapId}: player-facing copy exists`);
  assert.ok(config.terrain && config.vegetation && config.props && config.sky,
    `${mapId}: complete biome configuration`);
  assert.equal(config.spawns.enemies.length, 7, `${mapId}: seven enemy spawn pads`);
  for (const spawn of [config.spawns.player, ...config.spawns.enemies]) {
    assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.z), `${mapId}: finite spawn`);
    assert.ok(Math.max(Math.abs(spawn.x), Math.abs(spawn.z)) <= 470,
      `${mapId}: spawn stays inside the playable bounds`);
  }
  assert.equal(config.shot.pos.length, 3, `${mapId}: establishing camera position`);
  assert.equal(config.shot.look.length, 3, `${mapId}: establishing camera target`);
}

for (const mapId of [...EXPANSION, ...EXTREME]) {
  const config = getMapConfig(mapId);
  assert.ok(config.props.plan.length >= 14, `${mapId}: authored landmark plan is dense`);
  assert.equal(config.props.tankWrecks.era, 'modern', `${mapId}: modern wreck fleet`);
  assert.ok(config.props.tankWrecks.count >= 5, `${mapId}: multiple wreck story beats`);
  assert.equal(config.props.tankWrecks.debris, true, `${mapId}: detached debris enabled`);
  assert.ok(config.props.inhabit.modernClutter >= 18,
    `${mapId}: modern roadside and checkpoint clutter budget`);
  assert.ok(config.props.craters >= 48, `${mapId}: battlefield scarring budget`);
  assert.ok(config.terrain.landforms?.length >= 5,
    `${mapId}: authored macro terrain breaks the field into tactical lanes`);
  assert.ok(config.props.wallRuns?.length >= 6,
    `${mapId}: breached hard-cover lines divide open approaches`);
  assert.ok(config.sky.fogDensity <= 0.0009,
    `${mapId}: atmosphere preserves midfield color and structure`);
  assert.ok(config.sky.fogMix <= 0.68,
    `${mapId}: fog tint cannot flatten the horizon into a solid card`);

  const hf = createHeightField(1337, config);
  const routes = hf._layout.roads;
  assert.ok(routes.length >= 4, `${mapId}: at least four authored movement routes`);
  assert.ok(routes.every((route) => route.length >= 6), `${mapId}: routes span meaningful map distance`);
  const routePoints = routes.flat();
  const routeX = routePoints.map(([x]) => x), routeZ = routePoints.map(([, z]) => z);
  assert.ok(Math.max(...routeX) - Math.min(...routeX) >= 580,
    `${mapId}: road network serves both lateral flanks`);
  assert.ok(Math.max(...routeZ) - Math.min(...routeZ) >= 820,
    `${mapId}: road network connects both deployment regions`);

  const beats = config.props.tacticalBeats || [];
  assert.equal(beats.length, 3, `${mapId}: three deliberate lane strongpoints`);
  assert.deepEqual([...new Set(beats.map((beat) => beat.role))].sort(),
    ['brawl', 'scout', 'support'], `${mapId}: distinct vehicle-role decisions`);
  assert.equal(new Set(beats.map((beat) => beat.id)).size, beats.length,
    `${mapId}: memorable strongpoint identities are unique`);
  const destructibleBuildingFamilies = new Set(config.props.destructibleBuildings);
  for (const beat of beats) {
    assert.ok(Math.max(Math.abs(beat.x), Math.abs(beat.z)) <= 360,
      `${mapId}/${beat.id}: strongpoint stays in the playable interior`);
    assert.ok(destructibleBuildingFamilies.has(beat.structure),
      `${mapId}/${beat.id}: strongpoint uses the map's textured structure family`);
    const components = [beat.structure, beat.redoubt, beat.outcrop, beat.wreck].filter(Boolean);
    assert.ok(components.length >= 2,
      `${mapId}/${beat.id}: strongpoint combines multiple cover layers`);
  }
  for (let ai = 0; ai < beats.length; ai++) for (let bi = ai + 1; bi < beats.length; bi++) {
    assert.ok(Math.hypot(beats[ai].x - beats[bi].x, beats[ai].z - beats[bi].z) >= 180,
      `${mapId}: strongpoints distribute choices instead of forming one clutter knot`);
  }
  const sectorMeans = [];
  let sampledMin = Infinity, sampledMax = -Infinity;
  for (let sz = -1; sz <= 1; sz++) for (let sx = -1; sx <= 1; sx++) {
    let sum = 0, count = 0;
    for (let z = -320 + (sz + 1) * 210; z <= -320 + (sz + 2) * 210; z += 35) {
      for (let x = -320 + (sx + 1) * 210; x <= -320 + (sx + 2) * 210; x += 35) {
        const h = hf.getHeightAt(x, z);
        sum += h; count++;
        sampledMin = Math.min(sampledMin, h); sampledMax = Math.max(sampledMax, h);
      }
    }
    sectorMeans.push(sum / count);
  }
  const sectorRange = Math.max(...sectorMeans) - Math.min(...sectorMeans);
  assert.ok(sectorRange >= 1.25, `${mapId}: sectors have distinct elevation identities`);
  assert.ok(sampledMax - sampledMin >= 12,
    `${mapId}: playable interior includes meaningful hull-down relief`);
}

for (const mapId of ['ruinspires', 'blackglass']) {
  const config = getMapConfig(mapId);
  const monumental = config.props.plan.filter((kind) =>
    ['megatower', 'arcology', 'parkingdeck', 'civichall'].includes(kind));
  assert.ok(monumental.length >= 18,
    `${mapId}: destroyed city skyline has at least eighteen monumental structures`);
  assert.ok(config.props.rubblePiles >= 150,
    `${mapId}: collapsed blocks carry a city-scale rubble budget`);
  assert.equal(config.props.streetRowsAfterLandmarks, true,
    `${mapId}: dense frontage grows around reserved monumental footprints`);
  assert.ok(config.props.streetRowRoadStride <= 2 && config.props.ruinChance >= 0.45,
    `${mapId}: street walls stay dense and visibly battle-damaged`);
  assert.ok(config.props.tones?.plaster && config.props.tones?.stone,
    `${mapId}: skyline uses authored weathered material tones`);
}

for (const mapId of ['titan_gorge', 'skybridge']) {
  const config = getMapConfig(mapId);
  const majorWalls = config.terrain.landforms.filter((form) =>
    form.kind === 'ridge' && form.height >= 17 && form.length >= 700);
  assert.ok(majorWalls.length >= 2,
    `${mapId}: paired canyon walls span most of the battlefield`);
  assert.ok(config.horizon.style === 'mesa' && config.horizon.amp >= 1.9,
    `${mapId}: distant skyline reads at Grand Canyon scale`);
}

const legacyWreckFamilies = new Set();
const legacyMobileWreckFamilies = new Set();
for (const mapId of LEGACY) {
  const config = getMapConfig(mapId);
  const wrecks = config.props.tankWrecks;
  assert.equal(config.props.telegraph, true, `${mapId}: linked utility-pole network enabled`);
  assert.equal(wrecks.era, 'modern', `${mapId}: modern wreck backport`);
  assert.equal(wrecks.debris, true, `${mapId}: detached wreck debris backport`);
  assert.equal(wrecks.ids.length, wrecks.count, `${mapId}: deliberate no-repeat wreck cast`);
  wrecks.ids.forEach((id) => legacyWreckFamilies.add(id));
  wrecks.ids.slice(0, 2).forEach((id) => legacyMobileWreckFamilies.add(id));
  const clutter = config.props.inhabit.modernClutter;
  assert.equal(typeof clutter, 'object', `${mapId}: authored modern-clutter mix`);
  for (const kind of CLUTTER_FAMILIES) {
    assert.ok(clutter[kind] >= 3, `${mapId}: ${kind} family backported`);
  }
}
assert.deepEqual([...legacyWreckFamilies].sort(), [...MODERN_FAMILIES].sort(),
  'legacy maps collectively cover the complete modern wreck roster');
assert.deepEqual([...legacyMobileWreckFamilies].sort(), [...MODERN_FAMILIES].sort(),
  'two-wreck mobile budgets collectively cover the complete modern wreck roster');

for (const mapId of ['winter', 'fjord', 'monsoon', 'alpine']) {
  const cfg = getMapConfig(mapId);
  const heights = sampleHorizonSilhouette({
    style: 'alpine', mapId, amp: cfg.horizon.amp,
    row: { base: 56, amp: 76, f0: 2.6, f1: 5.2 },
  });
  let maxStep = 0;
  for (let i = 0; i < heights.length; i++) {
    maxStep = Math.max(maxStep, Math.abs(heights[i] - heights[(i + 1) % heights.length]));
  }
  assert.ok(maxStep <= 5.5, `${mapId}: alpine skyline has no needle-like one-segment peaks`);
}

{
  // Sirocco's seven synthetic spawn corridors converge behind the village.
  // Removing 100% of mesa height under each one left narrow full-height rock
  // wedges between them—the shark-fin hills visible from the battle camera.
  // Sample the complete village backdrop at half a terrain-cell interval so
  // that both steep one-cell faces and isolated local peaks stay caught.
  const desert = createHeightField(1337, getMapConfig('desert'));
  let maxSlope = 0;
  let needlePeaks = 0;
  for (let z = -60; z <= 260; z += 4) for (let x = -190; x <= 190; x += 4) {
    const h = desert.getHeightAt(x, z);
    const west = desert.getHeightAt(x - 8, z);
    const east = desert.getHeightAt(x + 8, z);
    const north = desert.getHeightAt(x, z - 8);
    const south = desert.getHeightAt(x, z + 8);
    maxSlope = Math.max(maxSlope,
      Math.abs(h - west) / 8, Math.abs(h - east) / 8,
      Math.abs(h - north) / 8, Math.abs(h - south) / 8);
    if (h - Math.max(west, east, north, south) > 2.5) needlePeaks++;
  }
  assert.ok(maxSlope <= 1.85,
    `desert: village backdrop has graded hill shoulders (max slope ${maxSlope.toFixed(3)})`);
  assert.equal(needlePeaks, 0, 'desert: village backdrop has no one-cell shark-fin peaks');
}

console.log('mapQuality.selftest: 20 complete maps; extreme terrain/atmosphere and legacy backport passed');
