import { historicalRoadTerrainSource } from './roadHistoryTestOracle.mjs';
import { historicalMapPassDressingSource } from './mapPassDressing.test-support.mjs';
import { historicalRound47PresentationSource } from './round47MapPresentation.test-support.mjs';
import { historicalRound66OceanSource } from './round66Ocean.test-support.mjs';
import { historicalRound70SnowRegradeSource } from './round70SnowRegrade.test-support.mjs';
import { historicalRound71CloudsSource } from './round71Clouds.test-support.mjs';
import { historicalRound72ReliefSource } from './round72Relief.test-support.mjs';
import { historicalRound75PropsSource } from './round75Props.test-support.mjs';
import { originalExitConfig, historicalAuthoredExitSource } from '../../tools/road-authored-exit-fixture.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { createLayout } from './terrain.ts';
import { sampleRedrockCanyon, redrockCanyonCenter, redrockCanyonFloorHalfWidth } from './redrockCanyon.ts';

const base = '57fe26ac9c13525338178de28bfb52f9f19e2e90', root = fileURLToPath(new URL('../../', import.meta.url));
const read = name => readFileSync(new URL('../../' + name, import.meta.url), 'utf8');
const old = name => execFileSync('git', ['show', `${base}:${name}`], { cwd: root, encoding: 'utf8' });
const sha = data => createHash('sha256').update(data).digest('hex');
const serialize = value => JSON.stringify(value, (_key, item) => typeof item === 'function' ? item.toString() : item);
const oldMap = old('src/world/maps/badlands.ts'), oldTerrain = old('src/world/terrain.ts');
assert.equal(sha(oldMap), 'eae9a03e75913e7c1b6ba87fae136115e5a568675d4998923da47492cd7ddada');
assert.equal(sha(oldTerrain), 'cecde431b664736c5fd68f57f593ce9499e9bf792816a66376a454a031376e6d');
const registry = read('src/world/maps/index.ts');
// 2026-09-19: Mars (Olympus Basin) registers after this baseline; authenticate its exact registration lines,
// then project them away for the byte receipt (a new map never joins the historical relief loop below).
const marsRegistration = ["// Mars mode (owner 2026-09-18): the galaxy-sky basin with its research station.\nimport mars from './mars.ts';\n", '  mars,\n'];
for (const line of marsRegistration) assert.equal(registry.split(line).length, 2, 'index.ts: one exact Mars registration line');
assert.equal(marsRegistration.reduce((source, line) => source.replace(line, ''), registry), old('src/world/maps/index.ts'));
const mapFiles = [...registry.matchAll(/import \w+ from '\.\/(\w+\.ts)';/g)].map(match => match[1]);
assert.equal(mapFiles.length, MAP_IDS.length);
// 2026-09-11 restored the 1049e4e Alpine horizon bands (treeline 0.64 -> 0.80,
// snowline 0.42 -> 0.72). Horizon bands never feed relief; authenticate the
// exact current leaves, then project only them back for the byte receipt.
function historicalAlpineHorizonSource(source, file) {
  if (file !== 'alpine.ts') return source;
  const restored = "style: 'alpine', treeline: 0.80, snowline: 0.72,";
  assert.equal(source.split(restored).length, 2, 'alpine.ts: one exact restored horizon band line');
  return source.replace(restored, "style: 'alpine', treeline: 0.64, snowline: 0.42,");
}
// 2026-09-13 lighting: eight sky presets moved toward the 1049e4e key/fill ratio (graphics
// commit 471c7b709). Sky presets never feed relief; authenticate the exact current line, then
// project it back to the historical line for the byte receipt.
const HISTORICAL_LIGHTING_LINES = {
  'alpine.ts': ['sunIntensity: 4.2, sunColorHex: 0xf8eedb, hemiIntensity: 0.34, postExposure: 0.95,', 'sunIntensity: 2.85, sunColorHex: 0xffddbe, hemiIntensity: 0.54, postExposure: 0.95,'],
  'fjord.ts': ['sunIntensity: 4.2, sunColorHex: 0xf7ecd9, hemiIntensity: 0.36,', 'sunIntensity: 3.35, sunColorHex: 0xffdfbe, hemiIntensity: 0.52,'],
  'caldera.ts': ['sunIntensity: 4.0, sunColorHex: 0xffc9a0, hemiIntensity: 0.42, postExposure: 0.95,', 'sunIntensity: 3.5, sunColorHex: 0xffb985, hemiIntensity: 0.64, postExposure: 0.95,'],
  'monsoon.ts': ['sunIntensity: 3.6, sunColorHex: 0xfae8d0, hemiIntensity: 0.46, postExposure: 0.96,', 'sunIntensity: 2.9, sunColorHex: 0xffdfc0, hemiIntensity: 0.54, postExposure: 0.96,'],
  'delta.ts': ['sunIntensity: 4.1, sunColorHex: 0xfbeed6, hemiIntensity: 0.34, postExposure: 0.95,', 'sunIntensity: 3.55, sunColorHex: 0xffe7c5, hemiIntensity: 0.42, postExposure: 0.95,'],
  'blackglass.ts': ['sunIntensity: 3.9, sunColorHex: 0xffc697, hemiIntensity: 0.32, postExposure: 0.91,', 'sunIntensity: 3.5, sunColorHex: 0xffb77e, hemiIntensity: 0.38, postExposure: 0.91,'],
  'foundry.ts': ['sunIntensity: 4.2, sunColorHex: 0xfde3c4, hemiIntensity: 0.36, postExposure: 0.96,', 'sunIntensity: 3.8, sunColorHex: 0xffd6ad, hemiIntensity: 0.48, postExposure: 0.96,'],
};
// Round 37 (2026-09-22, AAA program check 5): the desert sky's Rayleigh rose 0.55 → 0.85 (Oasis inherits it) so the
// anti-solar sky is no longer inky down to the ridges; sky presets never feed relief — authenticate the exact current
// five-line block, then project it back to the historical line for the byte receipt.
const DESERT_RAYLEIGH_CURRENT = `    // round 37 (AAA program check 5, 2026-09-22): rayleigh 0.55 → 0.85 — at 0.55 the anti-solar sky was an inky
    // saturated blue right down to the ridges (40 display luma at +4° against a horizon band near 140), so the pale
    // ranges read 2.3× brighter than the sky behind them; more Rayleigh lifts the low sky toward the dusty pale blue a
    // real desert horizon carries (Oasis inherits this sky), the zenith stays deep
    turbidity: 7, rayleigh: 0.85, mieCoefficient: 0.009, mieDirectionalG: 0.8,`;
const DESERT_RAYLEIGH_HISTORICAL = '    turbidity: 7, rayleigh: 0.55, mieCoefficient: 0.009, mieDirectionalG: 0.8,';
function historicalSkyRayleighSource(source, file) {
  if (file !== 'desert.ts') return source;
  assert.equal(source.split(DESERT_RAYLEIGH_CURRENT).length, 2, 'desert.ts: one exact round-37 Rayleigh block');
  return source.replace(DESERT_RAYLEIGH_CURRENT, DESERT_RAYLEIGH_HISTORICAL);
}
// Round 40 (2026-09-22, AAA program check 13): Coastal's sea aperture no longer authors a neutral grey; it takes the
// map's deep-water colour (edgeWater.ts) and the shallow-water sheet continues over it. Relief is untouched —
// authenticate the exact current block, then project it back to the historical line for the byte receipt.
const COASTAL_APERTURE_CURRENT = `    // round 40 (2026-09-22, "water at the edge: same level and shader beyond"): no authored grey — the aperture takes
    // this map's deep-water colour (waterContact.ts) and the shallow-water sheet continues over it (edgeWater.ts)
    seaOpening: { azimuthDeg: 90, widthDeg: 118, level: -4.0 },`;
const COASTAL_APERTURE_HISTORICAL = '    seaOpening: { azimuthDeg: 90, widthDeg: 118, level: -4.0, colorHex: 0x8b9795 },';
const SALTWIND_BAY_CURRENT = `    // Round 40 (2026-09-22, AAA map program): the hooked bay is one authored shoreline. The former three overlapping
    // circles rasterised into three straight-edged basins with sand strips between them and dried in the last
    // metres before the red line; this contour keeps the bay's east shore and the harbour landings where they were,
    // hooks a headland cove at its north-east, and runs open to the west edge, where the horizon ring now carries
    // the same sea (edgeWater.ts). One level, as before: a connected bay cannot step at basin overlaps.
    // Round 52 (owner decision 2026-09-23, "Saltwind strand wider: 20 m"): the graded strand between the waterline and
    // the dry bank widens from 12 to 20 m — Saltmere's is 22 m — so the beached boats and the harbour landings rest on
    // a real beach instead of a two-boat-length shelf.
    lakes: [{ x: -452, z: 8, r: 250, depth: 1.1, level: -7.8, shelfM: 20,
      radii: [0.70, 0.66, 0.44, 0.48, 0.86, 1.00, 1.00, 1.00,
        1.00, 1.00, 1.00, 0.97, 0.86, 0.66, 0.58, 0.62] }],`;
const SALTWIND_BAY_HISTORICAL = `    // A connected bay shares one level; independent automatic lake levels
    // would create several-metre steps at the overlaps.
    lakes: [{ x: -434, z: -160, r: 126, depth: 1.1, level: -7.8 }, { x: -410, z: 12, r: 138, depth: 1.1, level: -7.8 }, { x: -424, z: 184, r: 122, depth: 1.1, level: -7.8 }],`;
// round 67 (2026-09-24): the piers author no length any more (the strand law sizes them to the shelf); the current
// block follows the source, the historical side keeps the round-40 text
const SALTWIND_LANDINGS_CURRENT = `      // round 40: two stations of the one bay's east shore whose beached boats rest on a shallow bank at every
      // battle seed (the stations between them sit on the basin landform's wet flat)
      // round 67 (2026-09-24): the piers take the strand law's shelf-sized length (riverLandings.ts) instead of the
      // authored 19 m — from the shore end over the planar core with room for the moored hull, within 4–10 spans
      { lakeIndex: 0, shoreAngleDeg: -25, shoreReeds: false },
      { lakeIndex: 0, shoreAngleDeg: 45, shoreReeds: false },`;
const SALTWIND_LANDINGS_HISTORICAL = `      { lakeIndex: 1, shoreAngleDeg: -15, shoreReeds: false, jettyLength: 19 },
      { lakeIndex: 2, shoreAngleDeg: -15, shoreReeds: false, jettyLength: 19 },`;

// Round 47 follow-up (owner 2026-09-23, "evident right angle with shore and water at the border"): Saltmere's bay is one
// authored crescent centred past the red line and Nordhavn's bays are three fjord arms between rock peninsulas — relief
// authoring by owner ruling, as Saltwind's round-40 bay was. Authenticate the exact current blocks, project them back.
const COASTAL_BAY_CURRENT = `    // round 47 follow-up (2026-09-23, owner: "evident right angle with shore and water at the border"): the bay is ONE
    // authored crescent whose centre sits 88 m past the red line — its west arc is the strand (x ≈ 300 at the village,
    // meeting the border at z ≈ -320 and 230) and it runs on past the edge as the same disc, so the coast reaches the
    // border as two headlands instead of six circle arcs. Stations start east and wind toward +z: 7 is the promontory
    // the coast-road ridge (212, 54) dies into, 10 a second low cape; the east half is cut short (stations 13–3) so the
    // disc's own far shore ends ~145 m past the red line where the ring is still low and the sea sector opens beyond it
    // (a full disc put that shore 390 m out, under the ring's mountains — a lake with a cliff wall around it). The bank
    // grades over 0.10 R (30 m) instead of the fitted third of the radius, and seven boats lie on the strand.
    lakes: [{ x: 600, z: -40, r: 300, level: -4.0, depth: 0.6, shelfM: 22, bankBand: 1.10, boats: 7,
      radii: [0.19, 0.20, 0.26, 0.42, 0.85, 0.97, 0.99, 0.92, 1.00, 0.96, 0.90, 0.985, 0.85, 0.42, 0.26, 0.20] }],
    // the matching shore ring paints the WIDE feathered mask ramp the uSea shader splits into beach apron / surf line /
    // open water, and adds a gentle strand dip so the beach grades below the meadow (the west stations of the bay; at
    // 344 m the ramp's wetness at the strand matches what the three 190 m discs and their 218 m rings gave the beach
    // material). Its east half stays round: a ring's fitted bank band divides by its NARROWEST station, and the bay's
    // 0.19 R east stations on this ring made that band 2.03 R — the meadow 700 m inland sank toward the strand level.
    marshes: [{ x: 600, z: -40, r: 344, dip: 0.5,
      radii: [1.00, 1.00, 1.00, 1.00, 1.00, 0.97, 0.99, 0.92, 1.00, 0.96, 0.90, 0.985, 1.00, 1.00, 1.00, 1.00] }],
`;
const COASTAL_BAY_HISTORICAL = `    lakes: [
      { x: 460, z: -60, r: 190, level: -4.0, depth: 0.6 },
      { x: 470, z: 160, r: 170, level: -4.0, depth: 0.6 },
      { x: 480, z: -270, r: 150, level: -4.0, depth: 0.6 },
    ],
    // matching shore rings: these paint the WIDE feathered mask ramp the
    // uSea shader splits into beach apron / surf line / open water, and add
    // a gentle strand dip so the beach grades below the meadow
    marshes: [
      { x: 460, z: -60, r: 218, dip: 0.5 },
      { x: 470, z: 160, r: 196, dip: 0.5 },
      { x: 480, z: -270, r: 172, dip: 0.45 },
    ],
`;
const FJORD_ARMS_CURRENT = `    // round 47 follow-up (2026-09-23, owner: "evident right angle with shore and water at the border"): three fjord ARMS
    // instead of three round bays — each disc is a westward lobe (stations start east and wind toward +z: 8 is the head,
    // 4 and 12 the narrow flanks at 0.44–0.50), the arms share one mouth past the red line, and two rock peninsulas
    // (the ridges below) run between them; the harbour terraces meet the heads at x ≈ 250–290 as before. The banks
    // grade over 0.14 of the local radius (15 m on a flank, 35 m at a head) — the fitted third of the radius pulled the
    // peninsulas down to the water level and buried their ridges.
    // No beached boats: a clinker hull on a 0.14 R rock bank buries its tips (beachedBoat.selftest); the three jetties,
    // buoys and driftwood keep the harbour dressing.
    lakes: [
      { x: 438, z: -142, r: 188, depth: 2.4, level: -8.2, shelfM: 10, bankBand: 1.14, boats: 0,
        radii: [1.00, 0.96, 0.82, 0.60, 0.46, 0.50, 0.68, 0.93, 1.00, 0.94, 0.70, 0.52, 0.46, 0.58, 0.80, 0.96] },
      { x: 466, z: 70, r: 176, depth: 2.4, level: -8.2, shelfM: 10, bankBand: 1.14, boats: 0,
        radii: [1.00, 0.96, 0.80, 0.58, 0.44, 0.50, 0.70, 0.95, 1.00, 0.95, 0.70, 0.50, 0.44, 0.56, 0.78, 0.96] },
      { x: 442, z: 262, r: 152, depth: 2.4, level: -8.2, shelfM: 10, bankBand: 1.14, boats: 0,
        radii: [1.00, 0.96, 0.82, 0.60, 0.50, 0.56, 0.72, 0.94, 1.00, 0.95, 0.74, 0.54, 0.46, 0.56, 0.80, 0.96] },
    ],
`;
const FJORD_ARMS_HISTORICAL = `    lakes: [
      { x: 438, z: -142, r: 188, depth: 2.4, level: -8.2 },
      { x: 466, z: 70, r: 176, depth: 2.4, level: -8.2 },
      { x: 442, z: 262, r: 152, depth: 2.4, level: -8.2 },
    ],
`;
const COASTAL_RIM_FADE_CURRENT = '    coastRimFadeM: 120, // round 47 follow-up: the bay\'s headlands climb to the rim over 120 m instead of standing on the strand\n';
const SALTWIND_RIM_FADE_CURRENT = '    coastRimFadeM: 110, // round 47 follow-up: the bay-mouth headlands climb to the rim over 110 m instead of standing as slabs one row past the line\n';
const FJORD_RIM_FADE_CURRENT = '    coastRimFadeM: 90, // round 47 follow-up: the peninsulas between the arms climb to the rim over 90 m, not in one block\n';
const FJORD_WALLS_CURRENT = `      // round 47 follow-up: the rock peninsulas between the fjord arms and the walls outside them — the arms' water
      // flattening wins inside the lobes, so each ridge's flanks drop straight into the fjord
      { kind: 'ridge', x: 395, z: -32, length: 210, width: 50, height: 13.0, yawDeg: 0 },
      { kind: 'ridge', x: 395, z: 170, length: 210, width: 46, height: 12.0, yawDeg: 0 },
      { kind: 'ridge', x: 430, z: -268, length: 170, width: 56, height: 12.0, yawDeg: -4 },
      { kind: 'ridge', x: 430, z: 378, length: 160, width: 56, height: 11.0, yawDeg: 4 },
`;
function historicalSeaApertureSource(source, file) {
  if (file === 'saltwind.ts') {
    // Round 40: Saltwind's bay is one authored contour open to the west edge and its two landings stand on two stations
    // of that one shore; relief authoring elsewhere is untouched — authenticate both current blocks, project them back.
    assert.equal(source.split(SALTWIND_BAY_CURRENT).length, 2, 'saltwind.ts: one exact round-40 bay block');
    assert.equal(source.split(SALTWIND_LANDINGS_CURRENT).length, 2, 'saltwind.ts: one exact round-40 landings block');
    assert.equal(source.split(SALTWIND_RIM_FADE_CURRENT).length, 2, 'saltwind.ts: one exact round-47 coast rim fade line');
    return source.replace(SALTWIND_BAY_CURRENT, SALTWIND_BAY_HISTORICAL).replace(SALTWIND_LANDINGS_CURRENT, SALTWIND_LANDINGS_HISTORICAL)
      .replace(SALTWIND_RIM_FADE_CURRENT, '');
  }
  if (file === 'fjord.ts') {
    assert.equal(source.split(FJORD_ARMS_CURRENT).length, 2, 'fjord.ts: one exact round-47 fjord-arms block');
    assert.equal(source.split(FJORD_WALLS_CURRENT).length, 2, 'fjord.ts: one exact round-47 peninsula-ridges block');
    assert.equal(source.split(FJORD_RIM_FADE_CURRENT).length, 2, 'fjord.ts: one exact round-47 coast rim fade line');
    return source.replace(FJORD_ARMS_CURRENT, FJORD_ARMS_HISTORICAL).replace(FJORD_WALLS_CURRENT, '').replace(FJORD_RIM_FADE_CURRENT, '');
  }
  if (file !== 'coastal.ts') return source;
  assert.equal(source.split(COASTAL_APERTURE_CURRENT).length, 2, 'coastal.ts: one exact round-40 aperture block');
  assert.equal(source.split(COASTAL_BAY_CURRENT).length, 2, 'coastal.ts: one exact round-47 crescent-bay block');
  assert.equal(source.split(COASTAL_RIM_FADE_CURRENT).length, 2, 'coastal.ts: one exact round-47 coast rim fade line');
  return source.replace(COASTAL_APERTURE_CURRENT, COASTAL_APERTURE_HISTORICAL).replace(COASTAL_BAY_CURRENT, COASTAL_BAY_HISTORICAL)
    .replace(COASTAL_RIM_FADE_CURRENT, '');
}
function historicalLightingSource(source, file) {
  if (file === 'mangrove.ts') {
    const current = 'sunIntensity: 4.0, /* lighting 2026-09-13: was 3.7 */ ';
    assert.equal(source.split(current).length, 2, 'mangrove.ts: one exact 2026-09-13 key line');
    return source.replace(current, 'sunIntensity: 3.7, ');
  }
  const pair = HISTORICAL_LIGHTING_LINES[file];
  if (!pair) return source;
  const [current, historical] = pair;
  const pattern = new RegExp('^(\\s*)' + current.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' // lighting 2026-09-13:[^\\n]*$', 'm');
  assert.equal(source.match(pattern)?.length, 2, `${file}: one exact 2026-09-13 lighting line`);
  return source.replace(pattern, '$1' + historical);
}
// Round 45 (2026-09-23, AAA checks 3/15): Monsoon's splat block authors a slope grass hold (the SW corner mound held its
// turf to ~38° instead of rendering as bare mud); splat authoring never feeds relief — authenticate the exact block,
// project it away for the byte receipt.
const MONSOON_SLOPE_HOLD_CURRENT = `    // round 45 (2026-09-23, AAA checks 3/15): the SW corner mound rendered as bare mud from ~30°; a monsoon hill holds
    // its turf to ~38° — the slope→rock thresholds shift by 0.10 (rock from ~38°, full at ~50°).
    slopeGrassHold: 0.10,
`;
function historicalSlopeHoldSource(source, file) {
  if (file !== 'monsoon.ts') return source;
  assert.equal(source.split(MONSOON_SLOPE_HOLD_CURRENT).length, 2, 'monsoon.ts: one exact round-45 slope-hold block');
  return source.replace(MONSOON_SLOPE_HOLD_CURRENT, '');
}
// Round 29 (2026-09-20): Sunscar Oasis names its vista ground kind on its horizon line; the original line had none.
function historicalVistaGroundSource(source, file) {
  if (file !== 'oasis.ts') return source;
  const current = "style: 'rolling', ground: 'sand', treeline: 0.12,";
  assert.equal(source.split(current).length, 2, 'oasis.ts: one exact round-29 vista ground line');
  return source.replace(current, "style: 'rolling', treeline: 0.12,");
}
// Round 48 redesigns (owner 2026-09-23, "Frosthollow, Amberford and Tarkhan Steppe ... are straight rips of Verdant
// Field, exact same maps — not good, need redesign"): winter.ts, autumn.ts and steppe.ts are new landforms by owner
// decision, like the Mars registration, so their sources leave the historical byte projection instead of being projected
// back; their own receipts (mapQuality, terrainStreaming, shoreDirtMask, assaultTrenchTerrain, roadContinuity) pin them.
for (const file of mapFiles) if (file !== 'badlands.ts' && file !== 'mars.ts' && file !== 'winter.ts' && file !== 'autumn.ts' && file !== 'steppe.ts') {
  const id = file === 'alpine.ts' ? 'alpine' : file === 'reservoir.ts' ? 'reservoir' : '';
  assert.equal(historicalAuthoredExitSource(historicalAlpineHorizonSource(
    historicalRound75PropsSource(historicalMapPassDressingSource(historicalLightingSource(historicalVistaGroundSource(historicalSkyRayleighSource(historicalSeaApertureSource(historicalSlopeHoldSource(historicalRound47PresentationSource(historicalRound66OceanSource(historicalRound71CloudsSource(historicalRound70SnowRegradeSource(historicalRound72ReliefSource(read('src/world/maps/' + file), file), file), file), file), file), file), file), file), file), file), file, assert), file), file), old('src/world/maps/' + file), id),
    old('src/world/maps/' + file), `${file}: unchanged authoring apart from authenticated road approaches`);
}

const ports = new Map(), terrainURL = new URL('./terrain.ts', import.meta.url).href;
const anchor = '  const getHeightAt = (x: number, z: number): number => heightAt(x, z, true, true);';
for (const [side, text] of [['current', historicalRoadTerrainSource], ['old', oldTerrain]]) {
  assert.equal(text.split(anchor).length, 2, 'actual completed support checkpoint');
  const observed = text.replace(anchor, anchor + '\n  __supports = {road:gRoadElev,dist:gRoadDist,corridor:gCorridor,pads:padYs,lakes:lakeLevels};')
    + '\nlet __supports; export function constructObserved(seed,cfg){const field=createHeightField(seed,cfg);return {field,supports:__supports};}\n';
  ports.set(`${terrainURL}?redrock-${side}`, stripTypeScriptTypes(observed));
}
const oldURL = new URL('./maps/badlands.ts?redrock-old', import.meta.url).href;
ports.set(oldURL, stripTypeScriptTypes(oldMap));
const hook = registerHooks({ load(url, context, next) {
  return ports.has(url) ? { format: 'module', source: ports.get(url), shortCircuit: true } : next(url, context);
} });
let current, previous, original;
try {
  current = await import(`${terrainURL}?redrock-current`);
  previous = await import(`${terrainURL}?redrock-old`);
  original = (await import(oldURL)).default;
} finally { hook.deregister(); }
const config = getMapConfig('badlands'), layout = current.createLayout(config);
assert.equal(config.terrain.redrockCanyon, true);
assert.equal(config.terrain.mesas, null, 'blanket random mesas no longer define this canyon');
assert.equal(config.terrain.rimH, 0, 'no closed square wall across the two canyon mouths');
assert.deepEqual(config.terrain.landforms, [], 'rejected scattered shelf pilot is not layered underneath');
assert.deepEqual(config.spawns, original.spawns, 'existing deployment anchors retained');
assert.deepEqual(config.terrain.village, original.terrain.village, 'outpost stays on its original floor footprint');
assert.deepEqual(config.terrain.marshes, original.terrain.marshes);
assert.equal(config.terrain.roads.paths.length, 5);
for (const index of [1, 3, 4]) assert.deepEqual(config.terrain.roads.paths[index], original.terrain.roads.paths[index]);
for (const index of [0, 2]) {
  assert.deepEqual(config.terrain.roads.paths[index][0], original.terrain.roads.paths[index][0]);
  assert.deepEqual(config.terrain.roads.paths[index].at(-1), original.terrain.roads.paths[index].at(-1));
}
// Later material-only refinement is independently bounded by redrockMaterial.
// round 71 (2026-09-25): the cloudscape block (the volumetric layer's per-map authoring) never feeds relief; projected out
assert.equal(serialize({ ...config, blurb: original.blurb, terrain: original.terrain,
  splat: original.splat, horizon: original.horizon, clouds: undefined,
  props: { ...config.props, tacticalBeats: original.props.tacticalBeats, wallRuns: original.props.wallRuns } }),
serialize(original), 'only scoped terrain, blurb, materials and floor-reseated tactical/wall records change');

function canyonContract(sample) {
  for (const z of [-80, 0, 70]) {
    const center = redrockCanyonCenter(z), floor = sample(center, z);
    const west = sample(center - 400, z) - floor, east = sample(center + 400, z) - floor;
    assert.ok(west > 55 && east > 65 && east - west > 8, 'two tall unequal flanks above a real low floor');
    assert.ok(Math.abs(sample(center - 160, z) - floor) < 6 && Math.abs(sample(center + 160, z) - floor) < 6,
      'wide connected floor, not the crown of a ridge or several random mesas');
    for (const side of [-1, 1]) {
      let steepest = 0, benchRun = 0, longestBench = 0;
      for (let distance = 211; distance < 400; distance++) {
        const height = sample(center + side * distance, z) - floor;
        const slope = Math.abs(sample(center + side * (distance + 1), z)
          - sample(center + side * distance, z));
        // Measure the bench across one 4m terrain-support cell. One-metre
        // soil ripples must not split an otherwise continuous rock terrace.
        const benchSlope = Math.abs(sample(center + side * (distance + 2), z)
          - sample(center + side * (distance - 2), z)) / 4;
        steepest = Math.max(steepest, slope);
        benchRun = height > 15 && height < 40 && benchSlope < .2 ? benchRun + 1 : 0;
        longestBench = Math.max(longestBench, benchRun);
      }
      assert.ok(steepest > 2.2, 'central walls contain steep rock faces, not smooth hillside ramps');
      assert.ok(longestBench >= 22, `continuous rock benches separate the steep faces: z=${z}, side=${side}, length=${longestBench}, steepest=${steepest}`);
    }
  }
}
canyonContract(sampleRedrockCanyon);
assert.throws(() => canyonContract(() => 4), { code: 'ERR_ASSERTION' }, 'flat former-floor substitute fails tall canyon');
assert.throws(() => canyonContract((x, z) => sampleRedrockCanyon(x, z) * .1), { code: 'ERR_ASSERTION' },
  'tiny shelf-height substitution cannot satisfy a canyon');
for (const z of [-6000, -600, -430, 430, 600, 6000]) {
  assert.equal(redrockCanyonFloorHalfWidth(z), 330, 'mouth stops widening before the boundary');
}
// the floor is flat and symmetric across the axis to the map edge and just past it
for (const z of [-540, -430, 430, 540]) {
  const center = redrockCanyonCenter(z);
  assert.equal(sampleRedrockCanyon(center + 300, z), sampleRedrockCanyon(center - 300, z));
}
// Round 39 (owner 2026-09-22, "make the divide an enclosed area instead of being in a 'gap'"): past 612 m the floor
// climbs the flanks' own two-tier wall profile and both mouths are closed by a headwall from ~800 m out; nothing moves
// inside ±512 m
for (const z of [-680, 680]) {
  const center = redrockCanyonCenter(z), openFloor = 4 + 0.004 * z;
  const rising = sampleRedrockCanyon(center, z);
  assert.ok(rising > openFloor + 1 && rising < 70, `mouth floor climbing at z=${z}: ${rising}`);
}
for (const z of [-6000, -900, 900, 6000]) {
  const center = redrockCanyonCenter(z);
  for (const across of [-300, 0, 300]) {
    assert.ok(sampleRedrockCanyon(center + across, z) > 45, `headwall closes the mouth at z=${z}, across=${across}`);
  }
}
assert.equal(sampleRedrockCanyon(redrockCanyonCenter(500), 500), 4 + 0.004 * 500, 'the playable floor keeps its exact datum to the edge');
for (const across of [-400, 400]) {
  for (const z of [-207 + across * .035, 110 + Math.abs(across) * .24]) {
    const x = redrockCanyonCenter(z) + across;
    assert.equal(sampleRedrockCanyon(x, z), sampleRedrockCanyon(redrockCanyonCenter(z), z),
      'road-aligned side ravines connect all the way through each wall');
  }
}
assert.doesNotMatch(read('src/world/redrockCanyon.ts'), /\bnew\s+|Math\.random|\.noise\(|new (?:Float|Int|Uint)/,
  'shared analytic region adds no query allocation, noise or grid');

const bufferReceipt = values => Object.fromEntries(Object.entries(values).map(([key, value]) => [key,
  { type: value.constructor.name, bytes: value.byteLength, sha: sha(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) }]));
function roadGrades(field) {
  return layout.roads.map((road, index) => {
    let maxGrade = 0, maxStep = 0, samples = 0;
    for (let i = 1; i < road.length; i++) {
      const a = road[i - 1], b = road[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.ceil(length / 2), step = length / steps;
      let prior = field.getHeightAt(...a);
      for (let j = 1; j <= steps; j++) {
        const t = j / steps, h = field.getHeightAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        maxStep = Math.max(maxStep, Math.abs(h - prior)); maxGrade = Math.max(maxGrade, Math.abs(h - prior) / step);
        prior = h; samples++;
      }
    }
    return { index, maxGrade, maxStep, samples };
  });
}
function supportFootprints(field) {
  const points = [...layout.spawns.enemies, layout.spawns.player, ...config.props.tacticalBeats];
  return points.map(point => {
    let lo = Infinity, hi = -Infinity, minNormalY = 1;
    for (const dx of [-8, 0, 8]) for (const dz of [-8, 0, 8]) {
      const x = point.x + dx, z = point.z + dz, h = field.getHeightAt(x, z);
      lo = Math.min(lo, h); hi = Math.max(hi, h); minNormalY = Math.min(minNormalY, field.getNormalAt(x, z).y);
    }
    return { x: point.x, z: point.z, relief: hi - lo, minNormalY };
  });
}
const receipts = [];
for (const seed of [1337, 7719]) {
  // 2026-09-17 field trenches: the relief law is compared on untrenched fields (fieldTrenches:false); the carve has its own receipt.
  const a = current.constructObserved(seed, { ...config, fieldTrenches: false }), b = previous.constructObserved(seed, original);
  const support = bufferReceipt(a.supports), oldSupport = bufferReceipt(b.supports);
  for (const key of Object.keys(support)) {
    assert.equal(support[key].type, oldSupport[key].type); assert.equal(support[key].bytes, oldSupport[key].bytes);
  }
  assert.notEqual(support.road.sha, oldSupport.road.sha, 'new roads are seated in the canyon, not held mesa elevations');
  assert.notEqual(support.pads.sha, oldSupport.pads.sha, 'deployment targets are recomputed on the new floor');
  canyonContract((x, z) => a.field.getHeightAt(x, z));
  let changed = 0, maxDelta = 0, fastSamples = 0;
  for (let z = -480; z <= 480; z += 40) for (let x = -480; x <= 480; x += 40) {
    const h = a.field.getHeightAt(x, z), delta = Math.abs(h - b.field.getHeightAt(x, z));
    assert.ok(Number.isFinite(h)); maxDelta = Math.max(maxDelta, delta); if (delta > 8) changed++;
    assert.equal(a.field.getWaterMaskAt(x, z), 0);
    if (x % 80 === 0 && z % 80 === 0) {
      assert.equal(a.field.getHeightAtFast(x, z), Math.fround(h)); fastSamples++;
    }
  }
  assert.ok(changed > 80 && maxDelta > 40, 'region-scale canyon, not another low-impact shelf adjustment');
  receipts.push({ seed, changed, maxDelta, fastSamples, support, roads: roadGrades(a.field), footprints: supportFootprints(a.field) });
}
// Current opt-in disabled on another actual map ID is exactly inert, not a global policy switch.
const gated = { ...config, id: 'frontier' }, disabled = { ...gated, terrain: { ...gated.terrain, redrockCanyon: false } };
const gatedA = current.constructObserved(1337, gated), gatedB = current.constructObserved(1337, disabled);
assert.deepEqual(bufferReceipt(gatedA.supports), bufferReceipt(gatedB.supports));
for (let z = -400; z <= 400; z += 80) for (let x = -400; x <= 400; x += 80) {
  assert.equal(gatedA.field.getHeightAt(x, z), gatedB.field.getHeightAt(x, z));
}
for (const id of MAP_IDS) if (id !== 'badlands') {
  const cfg = originalExitConfig(getMapConfig(id)), a = current.constructObserved(1337, { ...cfg, fieldTrenches: false }), b = previous.constructObserved(1337, cfg);
  assert.deepEqual(bufferReceipt(a.supports), bufferReceipt(b.supports), `${id}: unchanged support arrays`);
  for (let z = -480; z <= 480; z += 80) for (let x = -480; x <= 480; x += 80) {
    assert.equal(a.field.getHeightAt(x, z), b.field.getHeightAt(x, z), `${id}: exact original height`);
    assert.deepEqual(a.field.getNormalAt(x, z).toArray(), b.field.getNormalAt(x, z).toArray());
  }
}
console.log(JSON.stringify({ test: 'badlandsRelief', base, unchangedMaps: 29, receipts,
  limits: 'Actual conditioned CPU ground/support/cache and road/footprint measurements. Full-mode current-terrain access, actual native prop contact, refreshed collision/minimap and visual acceptance remain separate gates; no GPU or memory-performance clearance.' }, null, 2));
for (const receipt of receipts) {
  for (const road of receipt.roads) assert.ok(road.maxGrade <= .30, `road${road.index}/${receipt.seed}: continuous drivable grade`);
  for (const point of receipt.footprints) {
    assert.ok(point.relief <= 2 && point.minNormalY >= .94, `${receipt.seed}/${point.x},${point.z}: seated deployment/tactical footprint`);
  }
}
