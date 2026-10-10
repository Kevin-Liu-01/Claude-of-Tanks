import assert from 'node:assert/strict';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { ARCHITECTURE_STYLES } from './maps/regional/index.ts';
import { isLayoutBriefMap } from './maps/layoutBriefMaps.ts';
import { createHeightField, createLayout } from './terrain.ts';
import { roadNetworkComponentCount } from './maps/roadEndpoints.ts';
import { authoredRoadStationCount, authoredRoadStationIndex } from './maps/roadStations.ts';
import { redrockCanyonCenter, redrockCanyonFloorHalfWidth } from './redrockCanyon.ts';
import {
  HORIZON_TREELINE_ATLAS_VARIANTS,
  HORIZON_TREELINE_MAX_LAYERS,
  resolveHorizonTreelineLayers,
  sampleHorizonSilhouette,
  sampleTreelineCrownProfile,
} from './maps/horizon.ts';
import { UTILITY_POLE_PAIR_MAX_RELIEF, planUtilityPoleStation } from './propPlacement.ts';
import { PLAYABLE_HALF_EXTENT_M } from './battlefieldBounds.ts';
import { isPublicWreckDonor, WRECK_ROSTER_POOLS } from './wreckRoster.ts';
import { fleetForMap } from './maps/vehicleFleets.ts';
import { vehicleEraForId } from '../vehicles/taxonomy.ts';

// Match the world's metadata-registration boundary, without acquiring any
// vehicle geometry. Bare specs also retain incomplete/hidden donor records.
await import('../vehicles/fleetFactory.ts');

const EXPANSION = [
  'frontier', 'fjord', 'delta', 'badlands',
  'monsoon', 'alpine', 'caldera', 'foundry',
];
const EXTREME = ['ruinspires', 'blackglass', 'titan_gorge', 'skybridge'];
const LEGACY = ['verdant', 'desert', 'winter', 'urban',
  'coastal', 'autumn', 'steppe', 'railyard'];
const CLUTTER_FAMILIES = ['barrier', 'roadsign', 'cone', 'transformer', 'cablespool'];
// (2026-10-07, the map-revival lane; the coordinator after gauntlet waves 184 and 204): a map set in its period leaves out
// the families that period never saw — Tarkhan Steppe is a Virgin Lands sovkhoz of the 1950s (its mix is Glacier Pass's
// and Nordhavn's: cable reels and direction signs)
const PERIOD_FREE_CLUTTER = Object.freeze({
  steppe: ['barrier', 'cone', 'transformer'],
});
const LAYERED_TREELINES = new Map([
  ['cliffbridge', 2], ['verdant', 2], ['coastal', 2], ['autumn', 2],
  ['frontier', 3], ['delta', 3], ['monsoon', 3],
  ['airfield', 2], // the map-revival lane (2026-10-05, gauntlet wave 113): the Polissia's pinewoods close Kestrel's ring in two rows
  ['caldera', 2], ['polders', 2], // round 47 (2026-09-23): the two bland rings with a skyline impostor gain a second rank
  ['longleaf', 2], // the map-revival lane (2026-10-05, gauntlet wave 124): the flatwoods' pines close Longleaf's ring in two rows
]);
const polePolicyByMap = new Map();
const battlefieldWrecks = new Set();
// The map-vehicles lane (2026-10-06, the integrator's period ruling): each map's hulks are its own period's, the period
// of its civilians (vehicleFleets.ts), drawn from the curated donor pools the wreck fleet receipt bakes. A map of the
// 1937-45 war carries the KV-2 at Kursk and no tank hulk elsewhere (the public fleet has no other tank of that war; the
// war shows through the burnt period trucks and carts); the Moon carries none. A period cast smaller than the map's
// placement budget cycles through its slots, and the budget never rises.
const curatedWreckDonors = new Set(Object.values(WRECK_ROSTER_POOLS).flat());
// Existing desktop caps are deliberate scene budgets, not a variety knob.
const extraWreckBudget = { moon: 3, urban: 6, railyard: 6, frontier: 6, delta: 6,
  badlands: 7, monsoon: 7, alpine: 6, caldera: 7, foundry: 8,
  ruinspires: 9, blackglass: 8, titan_gorge: 8, skybridge: 8 };

function auditUtilityPoleStations(hf, mapId) {
  const stations = [];
  const nodes = hf._layout.roads[0];
  const noPlacement = hf._noVeg || (() => false);
  for (let i = 8; i < authoredRoadStationCount(hf._layout, 0) - 1; i++) {
    const at = authoredRoadStationIndex(hf._layout, 0, i);
    if (at < 0) continue;
    const [ax, az] = nodes[at], [bx, bz] = nodes[at + 1];
    const length = Math.hypot(bx - ax, bz - az) || 1;
    const tx = (bx - ax) / length, tz = (bz - az) / length;
    const x = ax - tz * 6.9, z = az + tx * 6.9;
    if (Math.max(Math.abs(x), Math.abs(z)) > PLAYABLE_HALF_EXTENT_M || noPlacement(x, z)) continue;
    const partnerX = x + tx * 6.5, partnerZ = z + tz * 6.5;
    const allowPair = Math.max(Math.abs(partnerX), Math.abs(partnerZ)) <= PLAYABLE_HALF_EXTENT_M
      && !noPlacement(partnerX, partnerZ);
    const station = planUtilityPoleStation(hf, x, z, tx, tz, { allowPair });
    stations.push(station);
    assert.ok(station.primary.y <= station.primary.support.min - 0.0349,
      `${mapId}: every primary utility post is planted into its terrain support`);
    if (station.partner) {
      assert.ok(station.partner.y <= station.partner.support.min - 0.0349,
        `${mapId}: every paired utility post has its own terrain support`);
      assert.ok(station.pairRelief <= UTILITY_POLE_PAIR_MAX_RELIEF + 1e-9,
        `${mapId}: paired utility stations only survive on flat ground`);
    }
  }
  assert.ok(stations.length >= 20, `${mapId}: complete utility line audited`);
  const policy = { pairs: 0, singles: 0, maxRejectedRelief: 0 };
  for (const station of stations) {
    if (station.paired) policy.pairs++;
    else {
      policy.singles++;
      policy.maxRejectedRelief = Math.max(policy.maxRejectedRelief, station.pairRelief);
    }
  }
  return policy;
}

function assertAuthoredMacroTerrain(config, hf) {
  if (config.id !== 'badlands') {
    assert.ok(config.terrain.landforms?.length >= 5,
      `${config.id}: authored macro terrain breaks the field into tactical lanes`);
    return;
  }
  assert.equal(config.terrain.redrockCanyon, true, 'Badlands explicitly owns the regional canyon');
  assert.equal(config.terrain.mesas, null, 'blanket random mesas cannot substitute for canyon walls');
  assert.equal(config.terrain.rimH, 0, 'canyon mouths are not closed by a square rim');
  // 2026-10-02 (Redrock Divide rebuilt to docs/MAP-LAYOUT-BRIEF.md): the canyon stays the regional terrain, and the
  // authored landforms are floor features (inselbergs, dune ridges and sand ramps), never shelf rows on the walls.
  for (const form of config.terrain.landforms) {
    assert.ok(Math.abs(form.x - redrockCanyonCenter(form.z)) < redrockCanyonFloorHalfWidth(form.z),
      `Badlands' ${form.kind} at (${form.x}, ${form.z}) stands on the canyon floor`);
  }
  // Check the actual completed heightfield, not just a new configuration label.
  // The dedicated badlandsRelief suite additionally covers two seeds, roads,
  // deployment/tactical footprints, support construction and live-cache parity.
  for (const z of [-80, 0, 70]) {
    const x = redrockCanyonCenter(z), floor = hf.getHeightAt(x, z);
    const west = hf.getHeightAt(x - 400, z) - floor, east = hf.getHeightAt(x + 400, z) - floor;
    assert.ok(west > 55 && east > 65 && east - west > 8, 'Badlands has tall unequal flanks above its floor');
    assert.ok(Math.abs(hf.getHeightAt(x - 160, z) - floor) < 6
      && Math.abs(hf.getHeightAt(x + 160, z) - floor) < 6, 'Badlands retains a broad low canyon floor');
  }
}

{
  const canyon = getMapConfig('badlands'), flat = { getHeightAt: () => 4 };
  assert.throws(() => assertAuthoredMacroTerrain(canyon, flat), { code: 'ERR_ASSERTION' }, 'metadata alone is not macro terrain');
  assert.throws(() => assertAuthoredMacroTerrain({ ...canyon, terrain: { ...canyon.terrain, redrockCanyon: false } }, flat),
    { code: 'ERR_ASSERTION' }, 'missing explicit canyon owner is rejected');
  assert.throws(() => assertAuthoredMacroTerrain({ ...canyon, id: 'frontier',
    terrain: { ...canyon.terrain, landforms: [] } }, flat),
  { code: 'ERR_ASSERTION' }, 'the other maps keep the original five-landform requirement');
  assert.throws(() => assertAuthoredMacroTerrain({ ...canyon, terrain: { ...canyon.terrain,
    landforms: [{ kind: 'ridge', x: redrockCanyonCenter(0) + 300, z: 0, length: 200, width: 40, height: 6 }] } }, flat),
  { code: 'ERR_ASSERTION' }, 'a shelf row on the canyon wall is rejected');
}

// Mars mode (2026-09-18): Olympus Basin joins the catalog
assert.equal(MAP_IDS.length, 33, 'the battlefield roster contains thirty-three maps');
assert.equal(new Set(MAP_IDS).size, MAP_IDS.length, 'map ids are unique');
assert.deepEqual(MAP_IDS.slice(8, 16), EXPANSION, 'the eight-map expansion stays registered');
assert.deepEqual(MAP_IDS.slice(16, 20), EXTREME, 'the extreme-environment expansion stays registered');
assert.equal(resolveHorizonTreelineLayers({ treelineLayers: 99 }), 3,
  'skyline depth clamps to the shared performance ceiling');
assert.equal(resolveHorizonTreelineLayers({ treelineLayers: -4 }), 1,
  'skyline depth always retains one canonical rank');

for (const mapId of MAP_IDS) {
  const config = getMapConfig(mapId);
  assert.equal(roadNetworkComponentCount(createLayout(config).roads), 1,
    `${mapId}: all routes connect through actual segment intersections, not merely wide bounding spans`);
  assert.equal(config.id, mapId, `${mapId}: config id matches registry`);
  assert.equal('sub' in config, false, `${mapId}: deprecated map tags stay out of metadata`);
  assert.ok(config.name && config.blurb, `${mapId}: player-facing copy exists`);
  assert.ok(config.terrain && config.vegetation && config.props && config.sky,
    `${mapId}: complete biome configuration`);
  const cast = config.props.tankWrecks;
  const fleetYear = Number(/(\d{4})s?$/.exec(fleetForMap(mapId).id)?.[1] ?? NaN);
  const warYears = fleetYear <= 1945, noHulks = mapId === 'moon' || (warYears && mapId !== 'verdant');
  assert.equal(cast.count, noHulks ? 0 : extraWreckBudget[mapId] ?? 5,
    `${mapId}: the period cast keeps the existing placement budget (none on a war front the fleet has no tank of)`);
  assert.ok(noHulks ? cast.ids.length === 0 : cast.ids.length >= 1 && cast.ids.length <= cast.count,
    `${mapId}: an authored period cast within the slots`);
  if (warYears) assert.equal(cast.era, 'ww2', `${mapId}: a war-years map's cast is of the war`);
  assert.equal(new Set(cast.ids).size, cast.ids.length, `${mapId}: no repeated donor in a map cast`);
  for (const id of cast.ids) {
    assert.ok(isPublicWreckDonor(id), `${mapId}/${id}: wreck donor is actually publicly playable`);
    assert.ok(curatedWreckDonors.has(id), `${mapId}/${id}: a curated donor the wreck fleet receipt bakes`);
    if (warYears) assert.equal(vehicleEraForId(id), 'ww2', `${mapId}/${id}: a tank of the war`);
    battlefieldWrecks.add(id);
  }
  const treelineLayers = resolveHorizonTreelineLayers(config.horizon);
  assert.ok(Number.isInteger(treelineLayers)
    && treelineLayers >= 1 && treelineLayers <= HORIZON_TREELINE_MAX_LAYERS,
    `${mapId}: skyline impostor depth stays within the one-draw-call budget`);
  assert.equal(treelineLayers, LAYERED_TREELINES.get(mapId) ?? 1,
    `${mapId}: map-specific skyline depth remains deliberate`);
  assert.equal(config.spawns.enemies.length, 7, `${mapId}: seven enemy spawn pads`);
  for (const spawn of [config.spawns.player, ...config.spawns.enemies]) {
    assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.z), `${mapId}: finite spawn`);
    assert.ok(Math.max(Math.abs(spawn.x), Math.abs(spawn.z)) <= PLAYABLE_HALF_EXTENT_M,
      `${mapId}: spawn stays inside the playable bounds`);
  }
  assert.equal(config.shot.pos.length, 3, `${mapId}: establishing camera position`);
  assert.equal(config.shot.look.length, 3, `${mapId}: establishing camera target`);
  const beats = config.props.tacticalBeats || [];
  // Layout-brief maps (2026-10-01, docs/MAP-LAYOUT-BRIEF.md) author their strongpoints in symmetric pairs, with
  // optional posts on the symmetry line: at least three, every role present.
  if (isLayoutBriefMap(mapId)) assert.ok(beats.length >= 3, `${mapId}: at least three deliberate lane strongpoints`);
  else assert.equal(beats.length, mapId === 'moon' ? 0 : 3, `${mapId}: three deliberate lane strongpoints`);
  assert.deepEqual([...new Set(beats.map((beat) => beat.role))].sort(),
    !isLayoutBriefMap(mapId) && mapId === 'moon' ? [] : ['brawl', 'scout', 'support'], `${mapId}: distinct vehicle-role decisions`);
  assert.equal(new Set(beats.map((beat) => beat.id)).size, beats.length,
    `${mapId}: memorable strongpoint identities are unique`);
  const structureFamilies = new Set(config.props.destructibleBuildings);
  const hf = createHeightField(1337, config);
  assertAuthoredMacroTerrain(config, hf);
  if (config.props.telegraph) {
    const policy = auditUtilityPoleStations(hf, mapId);
    polePolicyByMap.set(mapId, policy);
  } else {
    polePolicyByMap.set(mapId, { pairs: 0, singles: 0, maxRejectedRelief: 0 });
  }
  for (const beat of beats) {
    assert.ok(Math.max(Math.abs(beat.x), Math.abs(beat.z)) <= 360,
      `${mapId}/${beat.id}: strongpoint stays in the playable interior`);
    assert.ok(structureFamilies.has(beat.structure),
      `${mapId}/${beat.id}: strongpoint uses the map's textured structure family`);
    const components = [beat.structure, beat.redoubt, beat.outcrop, beat.wreck].filter(Boolean);
    assert.ok(components.length >= 2,
      `${mapId}/${beat.id}: strongpoint combines multiple cover layers`);
    if (LEGACY.includes(mapId)) {
      assert.notEqual(hf.getGroundType(beat.x, beat.z), 'soft',
        `${mapId}/${beat.id}: legacy strongpoint stays out of liquid/marsh ground`);
      assert.ok(hf.getNormalAt(beat.x, beat.z).y >= 0.78,
        `${mapId}/${beat.id}: legacy strongpoint avoids cliff-grade terrain`);
    }
  }
  for (let ai = 0; ai < beats.length; ai++) for (let bi = ai + 1; bi < beats.length; bi++) {
    assert.ok(Math.hypot(beats[ai].x - beats[bi].x, beats[ai].z - beats[bi].z) >= 180,
      `${mapId}: strongpoints distribute choices instead of forming one clutter knot`);
  }
}

// the period ruling's named casts (2026-10-06; the Fulda Gap keeps six of its seven types inside its six slots)
assert.deepEqual(getMapConfig('frontier').props.tankWrecks.ids, ['m60a3', 'm1a1', 'leo1a5', 'marder1a3', 't80b', 'bmp2'],
  'the Fulda Gap in the 1980s: NATO and Soviet armour of the decade');
assert.deepEqual(getMapConfig('ruinspires').props.tankWrecks.ids, ['t72m1_jaguar', 'type59', 'bmp2'], 'Sarajevo, 1992-96');
assert.deepEqual(getMapConfig('airfield').props.tankWrecks.ids, ['t72b3_x', 't80bv', 'bmp2', 'ua_t64bv'], 'Hostomel, 2022');
assert.deepEqual(getMapConfig('verdant').props.tankWrecks.ids, ['kv2'], 'Kursk, 1943: the KV-2');
assert.ok(battlefieldWrecks.size >= 20, `the period casts still bring a broad variety of hulks (${battlefieldWrecks.size} types)`);

const cityMaterialMaps = ['urban', 'foundry', 'ruinspires', 'blackglass', 'skybridge', 'caldera'];
const repairedHeavyFamilies = ['factory', 'foundryoffice', 'depot', 'warehouse', 'firestation'];
const repairedLightFamilies = ['transformershed', 'motorpool', 'securityoffice', 'servicegarage', 'relaystation'];
for (const mapId of cityMaterialMaps) {
  const config = getMapConfig(mapId);
  const tones = config.props.tones;
  assert.ok(tones, `${mapId}: city structures have an authored material palette`);
  // a map whose regional kit owns its renders' tones (props.architecture; the map keeps only its field walls' stone,
  // props.ts lays the kit's tones under the map's): the kit's palette is the city palette, and its painters are
  // regionalArchitecture.selftest's (the map-revival lanes, 2026-10-05)
  const kit = config.props.architecture ? ARCHITECTURE_STYLES.find((style) => style.id === config.props.architecture) : null;
  if (kit && !tones.plaster) {
    assert.ok(['plaster', 'plaster2', 'plaster3'].every((bucket) => typeof kit.surfaces.tones?.[bucket] === 'function')
      && typeof tones.stone === 'function', `${mapId}: the ${kit.id} kit owns the renders' tones and the map keeps its field walls' stone`);
    continue;
  }
  const samples = ['plaster', 'plaster2', 'plaster3', 'stone', 'roof']
    .map((bucket) => tones[bucket](0.5, 0.34, 0.55));
  assert.ok(samples.every(([hue, saturation, lightness]) => (
    Number.isFinite(hue) && saturation >= 0.07 && lightness >= 0.12 && lightness <= 0.62
  )), `${mapId}: city materials retain restrained real color instead of collapsing to flat grey`);
  assert.ok(new Set(samples.map(([hue]) => hue.toFixed(3))).size >= 4,
    `${mapId}: plaster, masonry, weathered accent, and roof families remain visually distinct`);
}
for (const family of repairedHeavyFamilies) {
  const maps = cityMaterialMaps.filter((mapId) => [...getMapConfig(mapId).props.plan,
    ...(getMapConfig(mapId).props.plannedSites ?? []).map((site) => site.structure)].includes(family));
  assert.ok(maps.length >= 5,
    `${family}: repaired heavyweight family is exercised across at least five city/industrial maps`);
}
for (const family of repairedLightFamilies) {
  const maps = cityMaterialMaps.filter((mapId) => (
    getMapConfig(mapId).props.destructibleBuildings.includes(family)
  ));
  assert.ok(maps.length >= 5,
    `${family}: repaired light-building family is exercised across at least five city/industrial maps`);
}

assert.ok(polePolicyByMap.get('verdant').pairs > 0 && polePolicyByMap.get('verdant').singles > 0,
  'Verdant Fields keeps flat-ground pairs while its uneven stations become single posts');
// 2026-10-03: Titan Gorge's and Skybridge Chasm's redesigns took the noise mesas off their first roads, so each line now
// crosses its floor (pairs) and its rock's toes (single posts); the steep corridor's single-post case is the historical
// Titan's below
for (const [mapId, name] of [['titan_gorge', 'Titan Gorge'], ['skybridge', 'Skybridge Chasm']]) {
  assert.ok(polePolicyByMap.get(mapId).pairs > 0 && polePolicyByMap.get(mapId).singles > 0,
    `${name} keeps flat-floor pairs while its uneven stations become single posts`);
}
// The original b0e014818 regression covered a shelf in the pre-completion
// road field. New road grading may remove that hazard, not pole protection.
// Titan has no id-dependent quarry/terrain policy: omit only road dispatch,
// retaining its actual authored paths, seed, landforms and placement rules.
// 2026-10-03: Titan Gorge's redesign took the noise mesas (and so the shelf) off its first road, so the regression keeps
// the pre-redesign terrain as its fixture: the mesa field, the six smooth landforms, the roads and the deployment.
const HISTORICAL_TITAN = Object.freeze({
  mesas: { amp: 22, thr0: 0.755, thr1: 0.815, wallWidth: 0.62, corridorFloor: 0.30 },
  roads: { paths: [
    [[-420, -458], [-338, -338], [-286, -206], [-220, -86], [-142, 28], [-82, 168], [-18, 306], [62, 466]],
    [[-128, -466], [-88, -324], [-28, -184], [44, -42], [126, 92], [212, 226], [306, 356], [390, 458]],
    [[366, -454], [304, -304], [246, -168], [172, -28], [92, 108], [8, 242], [-84, 370], [-176, 466]],
    [[-382, -72], [-260, -92], [-142, -60], [-12, -82], [116, -48], [244, -76], [372, -54]],
    [[-334, 228], [-214, 192], [-96, 220], [30, 188], [154, 224], [284, 196]],
  ] },
  landforms: [
    { kind: 'ridge', x: -268, z: 18, length: 760, width: 118, height: 17.5, yawDeg: -4, corridorScale: 0.38 },
    { kind: 'ridge', x: 278, z: 12, length: 760, width: 122, height: 18.0, yawDeg: 5, corridorScale: 0.38 },
    { kind: 'ridge', x: -52, z: 312, length: 330, width: 98, height: 12.0, yawDeg: 82, corridorScale: 0.42 },
    { kind: 'knoll', x: -116, z: -248, rx: 124, rz: 78, height: 9.0, yawDeg: 22, corridorScale: 0.44 },
    { kind: 'basin', x: 22, z: 18, rx: 188, rz: 124, height: -7.0, yawDeg: -12, corridorScale: 0.68 },
    { kind: 'knoll', x: 162, z: 274, rx: 112, rz: 72, height: 8.0, yawDeg: -24, corridorScale: 0.46 },
  ],
});
const titanToday = getMapConfig('titan_gorge');
const historicalTitanPolicy = auditUtilityPoleStations(createHeightField(1337, {
  ...titanToday, id: undefined,
  terrain: { ...titanToday.terrain, ...HISTORICAL_TITAN, hardstands: undefined, landformRock: false },
  spawns: { ...titanToday.spawns, player: { x: -352, z: -392 } },
}), 'historical Titan Gorge');
assert.ok(historicalTitanPolicy.maxRejectedRelief > 2,
  'historical Titan Gorge audit covers the cliff shelves that previously suspended a second post');
assert.ok(historicalTitanPolicy.singles >= 20 && historicalTitanPolicy.singles > historicalTitanPolicy.pairs * 3,
  `historical Titan Gorge uses single posts throughout its steep utility corridor (${historicalTitanPolicy.singles} singles, ${historicalTitanPolicy.pairs} pairs)`);
assert.deepEqual(polePolicyByMap.get('delta'), { pairs: 0, singles: 0, maxRejectedRelief: 0 },
  'Mekong Delta intentionally has no utility-pole line to audit');

for (const mapId of [...EXPANSION, ...EXTREME]) {
  const config = getMapConfig(mapId);
  // a layout-brief map may author its landmarks as sites (Ruinspires, 2026-10-02: rotation pairs) instead of the
  // roadside plan
  const landmarks = [...config.props.plan, ...(config.props.plannedSites ?? []).map((site) => site.structure)];
  assert.ok(landmarks.length >= 14, `${mapId}: authored landmark plan is dense`);
  // the period ruling (2026-10-06): the cast is the map's period's (above), and a war front the fleet has no tank of
  // carries none
  assert.ok(config.props.tankWrecks.count >= 5 || config.props.tankWrecks.count === 0 && config.props.tankWrecks.era === 'ww2',
    `${mapId}: multiple wreck story beats, or none on a war front`);
  assert.equal(config.props.tankWrecks.debris, true, `${mapId}: detached debris enabled`);
  // an authored mix counts its pieces: a period map keeps the budget in the families of its year (Nordhavn 1940 and
  // Glacier Pass 1945 have cable reels and direction signs, no traffic cones, Jersey barriers or pad transformers)
  const modernClutter = config.props.inhabit.modernClutter;
  const modernBudget = typeof modernClutter === 'object' && modernClutter
    ? Object.values(modernClutter).reduce((sum, count) => sum + count, 0) : modernClutter;
  assert.ok(modernBudget >= 18,
    `${mapId}: modern roadside and checkpoint clutter budget`);
  assert.ok(config.props.craters >= 48, `${mapId}: battlefield scarring budget`);
  assert.ok(config.props.wallRuns?.length >= 6,
    `${mapId}: breached hard-cover lines divide open approaches`);
  assert.ok(config.sky.fogDensity <= 0.0009,
    `${mapId}: atmosphere preserves midfield color and structure`);
  assert.ok(config.sky.fogMix <= 0.68,
    `${mapId}: fog tint cannot flatten the horizon into a solid card`);

  const hf = createHeightField(1337, config);
  assertAuthoredMacroTerrain(config, hf);
  const routes = hf._layout.roads;
  assert.ok(routes.length >= 4, `${mapId}: at least four authored movement routes`);
  assert.ok(routes.every((route) => route.length >= 6), `${mapId}: routes span meaningful map distance`);
  const routePoints = routes.flat();
  const routeX = routePoints.map(([x]) => x), routeZ = routePoints.map(([, z]) => z);
  assert.ok(Math.max(...routeX) - Math.min(...routeX) >= 580,
    `${mapId}: road network serves both lateral flanks`);
  assert.ok(Math.max(...routeZ) - Math.min(...routeZ) >= 820,
    `${mapId}: connected road network spans both deployment regions`);

  const beats = config.props.tacticalBeats || [];
  // Layout-brief maps (2026-10-01, docs/MAP-LAYOUT-BRIEF.md) author their strongpoints in symmetric pairs, with
  // optional posts on the symmetry line: at least three, every role present.
  if (isLayoutBriefMap(mapId)) assert.ok(beats.length >= 3, `${mapId}: at least three deliberate lane strongpoints`);
  else assert.equal(beats.length, mapId === 'moon' ? 0 : 3, `${mapId}: three deliberate lane strongpoints`);
  assert.deepEqual([...new Set(beats.map((beat) => beat.role))].sort(),
    !isLayoutBriefMap(mapId) && mapId === 'moon' ? [] : ['brawl', 'scout', 'support'], `${mapId}: distinct vehicle-role decisions`);
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

// (the map-revival lane, 2026-10-07: under the Sarajevo kit, maps/regional/sarajevoCivic.ts, five more of the structure
// ids build the valley's monumental landmarks — 'firestation' a domed mosque under its minaret, 'factory' the Orthodox
// cathedral, 'foundryoffice' the Catholic cathedral's twin towers, 'warehouse' the market hall, 'depot' the čaršija's
// arcade — so Ruinspires' skyline counts them with the towers and slabs)
const KIT_LANDMARKS = { sarajevo: ['firestation', 'factory', 'foundryoffice', 'warehouse', 'depot'] };
for (const mapId of ['ruinspires', 'blackglass']) {
  const config = getMapConfig(mapId);
  const landmarks = KIT_LANDMARKS[config.props.architecture] ?? [];
  const monumental = [...config.props.plan, ...(config.props.plannedSites ?? []).map((site) => site.structure)].filter((kind) =>
    ['megatower', 'arcology', 'needletower', 'broadcasttower', 'terracetower',
      'parkingdeck', 'civichall', ...landmarks].includes(kind));
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

// Canyon walls: ridges of canyon height (17 m or more) on both flanks of the canyon's axis, 100 m or more off it. Each
// flank is measured by the length its walls cover along the axis inside the playable square (the union of their
// spans), and must cover most of it, 60 % or more. The 2026-10-03 redesigns end Titan's shelves in cliffs at 660 m
// (70 %) and break Skybridge's shoulders into three segments a side with lanes between them (650 m, 69 %). The pairs of
// 760 m and 770 m ridges the old check counted (a length of 700 m or more was all it asked) ran end to end along the x
// axis through the middle, a few metres off it, so they met it by length alone.
function canyonWallCoverage(config) {
  const walls = config.terrain.landforms.filter((form) => form.kind === 'ridge' && (form.height || 0) >= 17);
  if (!walls.length) return [];
  const lead = walls.reduce((best, form) => ((form.length || 0) > (best.length || 0) ? form : best));
  const yaw = (lead.yawDeg || 0) * Math.PI / 180, ax = Math.cos(yaw), az = Math.sin(yaw);
  const flanks = new Map();
  for (const form of walls) {
    const offset = -form.x * az + form.z * ax;
    if (Math.abs(offset) < 100) continue;
    const along = form.x * ax + form.z * az;
    const reach = (form.length || 100) / 2 * Math.abs(Math.cos(((form.yawDeg || 0) - (lead.yawDeg || 0)) * Math.PI / 180));
    const span = [Math.max(-PLAYABLE_HALF_EXTENT_M, along - reach), Math.min(PLAYABLE_HALF_EXTENT_M, along + reach)];
    if (span[1] > span[0]) flanks.set(Math.sign(offset), [...(flanks.get(Math.sign(offset)) ?? []), span]);
  }
  return [...flanks.values()].map((spans) => {
    spans.sort((a, b) => a[0] - b[0]);
    let covered = 0, end = -Infinity;
    for (const [from, to] of spans) {
      if (to > end) covered += to - Math.max(from, end);
      end = Math.max(end, to);
    }
    return covered;
  });
}
for (const mapId of ['titan_gorge', 'skybridge']) {
  const config = getMapConfig(mapId);
  const covered = canyonWallCoverage(config);
  assert.ok(covered.length === 2 && Math.min(...covered) >= 0.6 * 2 * PLAYABLE_HALF_EXTENT_M,
    `${mapId}: paired canyon walls span most of the battlefield (${covered.map((m) => m.toFixed(0)).join(' / ')} m `
    + `of ${2 * PLAYABLE_HALF_EXTENT_M} m)`);
  assert.ok(config.horizon.style === 'mesa' && config.horizon.amp >= 1.9,
    `${mapId}: distant skyline reads at Grand Canyon scale`);
}

for (const mapId of LEGACY) {
  const config = getMapConfig(mapId);
  const wrecks = config.props.tankWrecks;
  assert.equal(config.props.telegraph, true, `${mapId}: linked utility-pole network enabled`);
  // the period ruling (2026-10-06) replaced the modern backport: the period cast (checked above for every map) may be
  // smaller than its slots, which cycle through it
  assert.equal(wrecks.debris, true, `${mapId}: detached wreck debris backport`);
  assert.ok(wrecks.ids.length <= wrecks.count, `${mapId}: a no-repeat period cast within the slots`);
  const clutter = config.props.inhabit.modernClutter;
  assert.equal(typeof clutter, 'object', `${mapId}: authored modern-clutter mix`);
  for (const kind of CLUTTER_FAMILIES) {
    if (PERIOD_FREE_CLUTTER[mapId]?.includes(kind)) {
      assert.equal(clutter[kind] ?? 0, 0, `${mapId}: no ${kind} in its period`);
      continue;
    }
    assert.ok(clutter[kind] >= 3, `${mapId}: ${kind} family backported`);
  }
}

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
  const profiles = [];
  for (let variant = 0; variant < HORIZON_TREELINE_ATLAS_VARIANTS; variant++) {
    const heights = sampleTreelineCrownProfile({ seed: 1337, variant });
    profiles.push(heights);
    let maxStep = 0;
    let maxImpulse = 0;
    for (let i = 0; i < heights.length; i++) {
      const previous = heights[(i - 1 + heights.length) % heights.length];
      const next = heights[(i + 1) % heights.length];
      maxStep = Math.max(maxStep, Math.abs(next - heights[i]));
      maxImpulse = Math.max(maxImpulse, Math.abs(next - 2 * heights[i] + previous));
    }
    assert.ok(Math.min(...heights) >= 0.43 && Math.max(...heights) <= 0.78,
      `treeline atlas ${variant}: connected canopy stays broad and low`);
    assert.ok(maxStep <= 0.035 && maxImpulse <= 0.01,
      `treeline atlas ${variant}: scope view cannot reveal one-sample needles`);
  }
  for (let i = 1; i < profiles.length; i++) {
    let difference = 0;
    for (let k = 0; k < profiles[i].length; k++) {
      difference += Math.abs(profiles[i][k] - profiles[0][k]);
    }
    assert.ok(difference / profiles[i].length >= 0.045,
      `treeline atlas ${i}: ridge ranges do not repeat the same crown strip`);
  }
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

console.log('mapQuality.selftest: 30 complete maps; extreme terrain/atmosphere and legacy backport passed');
