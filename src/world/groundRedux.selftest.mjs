// Round 73 (2026-09-25, the ground redux): the per-map ground profile, the terrain material's redux contract and
// the sampler budget. Owner: "improve ground, ground transitions, shorelines... add tall grass that interacts with
// tanks... make sure performance is still really good". This receipt pins the profile table (every battlefield has a
// row, every knob inside its band, the biomes where they belong), the uniform packing the material reads, the
// quality knob's mapping, and the shader contract — the new terms exist, the material still declares ten samplers,
// the program key moved, the fold attribute rides the chunk vertices and the swash clock is the water sheet's.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GROUND_REDUX_BUDGET, groundReduxProfileIds, groundReduxUniformValues, resolveGroundReduxProfile, tallGrassQualityScale,
} from './groundRedux.ts';
import { MAP_IDS } from './maps/catalog.ts';
import { PRESETS } from '../engine/quality.ts';

// 1. Every battlefield has a row and every row names a battlefield; the unknown id runs the temperate defaults.
const ids = groundReduxProfileIds();
for (const id of MAP_IDS) assert.ok(ids.includes(id), `${id} has a ground profile`);
for (const id of ids) assert.ok(MAP_IDS.includes(id), `${id} is a map`);
const fallback = resolveGroundReduxProfile('no-such-map');
assert.equal(fallback.grass, null, 'an unknown map grows no sward');
assert.equal(fallback.swashStrength, 0, 'and has no wet strand');
assert.deepEqual(resolveGroundReduxProfile(undefined), fallback);

// 2. Knob bands and the biomes where they belong.
const ARID = ['desert', 'badlands', 'caldera', 'titan_gorge', 'skybridge', 'copper_mesa', 'mars'];
const SNOW = ['winter', 'whiteout', 'alpine'];
const COAST = ['coastal', 'saltwind', 'fjord', 'mangrove'];
const STILL = ['delta', 'polders', 'reservoir', 'monsoon', 'oasis', 'skybridge'];
for (const id of MAP_IDS) {
  const p = resolveGroundReduxProfile(id);
  for (const key of ['heightBlend', 'midDetail', 'scree', 'glint', 'snowRipple', 'snowMacro', 'foldMoist', 'foldAO', 'foldCrest']) {
    assert.ok(p[key] >= 0 && p[key] <= 1.3, `${id}.${key} inside its band (${p[key]})`);
  }
  assert.ok(p.swashStrength >= 0 && p.swashStrength <= 1.6, `${id}.swashStrength inside the packer's cap (${p.swashStrength})`);
  assert.ok(p.swashPeriodS >= 0 && p.swashPeriodS <= 20, `${id}: a swell period, not a tide`);
  assert.ok(p.swashReachM >= 1 && p.swashReachM <= 12, `${id}: the swash reaches metres up the beach, inside the shore byte's 32 m (round 73b)`);
  assert.ok(p.swashLines >= 0 && p.swashLines <= 1.3, `${id}: foam / wrack line strength inside its band`);
  // round 73b: the border terms and the rim's climate tint
  for (const key of ['lip', 'verge', 'rim', 'midAlbedo', 'driftEdge']) assert.ok(p[key] >= 0 && p[key] <= 1.3, `${id}.${key} inside its band (${p[key]})`);
  for (const c of p.rimTint) assert.ok(c >= 0.3 && c <= 1.5, `${id}: the rim tint is a multiplier near one`);
  if (SNOW.includes(id)) assert.ok(p.driftEdge > 0, `${id}: the drifts carry a lee edge`);
  else assert.equal(p.driftEdge, 0, `${id}: no drift edge off the snow maps`);
  if (COAST.includes(id)) assert.ok(p.swashLines >= 0.9 && p.swashReachM >= 3, `${id}: a foam line and a reach of metres on a sea beach`);
  if (ARID.includes(id)) assert.equal(p.grass, null, `${id}: no sward on the arid ground`);
  else assert.ok(p.grass, `${id}: a sward`);
  if (SNOW.includes(id)) {
    assert.ok(p.snowRipple > 0 && p.snowMacro > 0 && p.glint > 0, `${id}: drifts, scour and sparkle on snow`);
    assert.equal(p.grass.kind, 'tundra', `${id}: dead sedge through the snow`);
  } else {
    assert.equal(p.snowRipple, 0, `${id}: no snow drifts off the snow maps`);
    assert.equal(p.glint, 0, `${id}: no snow sparkle off the snow maps`);
  }
  if (COAST.includes(id)) assert.ok(p.swashPeriodS > 0 && p.swashStrength > 0, `${id}: a breathing swash band`);
  if (STILL.includes(id)) assert.ok(p.swashPeriodS === 0 && p.swashStrength > 0 && p.swashStrength <= 0.6, `${id}: a steady damp bank, subtler than a swash`);
  if (COAST.includes(id)) assert.ok(p.swashStrength >= 0.9, `${id}: the swash reads (the Saltwind probe: 1.0 at width 0.12 ramps was invisible)`);
  if (p.grass) {
    const g = p.grass;
    assert.ok(g.density > 0 && g.density <= 1.3, `${id}: grass density inside the tier's budget`);
    assert.ok(g.heightM >= 0.3 && g.heightM <= 1.9, `${id}: blade height in metres`);
    assert.ok(g.heightVar >= 0 && g.heightVar <= 0.5 && g.widthM > 0.02 && g.widthM < 0.1);
    for (const c of [...g.base, ...g.tip, ...g.dry]) assert.ok(c >= 0 && c <= 1, `${id}: linear rgb`);
    assert.ok(g.tip[1] >= g.base[1], `${id}: the tip is lighter than the root (the root is dark under the sward)`);
    assert.ok(Math.hypot(g.windDir[0], g.windDir[1]) > 0.5, `${id}: a wind`);
    if (g.kind === 'reed') assert.ok(g.waterBand > 0 && g.waterBand <= 1 && g.heightM >= 1.4 && g.bank > 0 && g.bank <= 0.7, `${id}: reeds stand tall along the margin (round 73b: a waterline fringe, the bank's meadow thinner than the margin)`);
    else assert.equal(g.waterBand, 0, `${id}: only reeds grow in the water`);
    assert.ok(g.reedMargin >= 0 && g.reedMargin <= 1, `${id}: a reed margin, if any, inside its band`);
    if (g.kind !== 'reed') assert.equal(g.bank, 1, `${id}: the bank density is a reed biome's`);
  }
}
assert.equal(resolveGroundReduxProfile('steppe').grass.kind, 'steppe');
assert.ok(resolveGroundReduxProfile('steppe').grass.density >= 1.0, 'the golden grassland is the densest sward');
assert.equal(resolveGroundReduxProfile('verdant').grass.kind, 'meadow');
for (const id of ['delta', 'polders', 'mangrove', 'oasis']) assert.equal(resolveGroundReduxProfile(id).grass.kind, 'reed', `${id}: reeds`);
for (const id of ['coastal', 'saltwind', 'fjord']) assert.equal(resolveGroundReduxProfile(id).grass.kind, 'dune', `${id}: marram on the backshore`);
for (const id of ['urban', 'foundry', 'railyard', 'ruinspires', 'blackglass', 'airfield']) {
  assert.equal(resolveGroundReduxProfile(id).grass.kind, 'verge', `${id}: a trodden verge`);
  assert.ok(resolveGroundReduxProfile(id).grass.density <= 0.6, `${id}: sparse`);
}
assert.ok(resolveGroundReduxProfile('alpine').scree >= resolveGroundReduxProfile('winter').scree, 'the alpine pass carries the widest talus');
// round 73b: the meadow and hill maps carry a talus skirt under their outcrops too; the arid maps keep none (the
// owner's black-contour history on sand); a lake margin grows reeds on the Monsoon and Reservoir meadows
for (const id of ['verdant', 'autumn', 'frontier', 'monsoon', 'reservoir']) assert.ok(resolveGroundReduxProfile(id).scree > 0, `${id}: a scree skirt`);
for (const id of ['desert', 'badlands', 'caldera', 'mars']) assert.equal(resolveGroundReduxProfile(id).scree, 0, `${id}: no scree on the arid ground`);
assert.ok(resolveGroundReduxProfile('monsoon').grass.reedMargin > 0 && resolveGroundReduxProfile('reservoir').grass.reedMargin > 0, 'reed margins on the lake meadows');
assert.equal(resolveGroundReduxProfile('verdant').grass.reedMargin, 0);
assert.deepEqual(resolveGroundReduxProfile('monsoon').rimTint, resolveGroundReduxProfile('mangrove').rimTint, 'moss on the wet maps\' outcrops');
assert.ok(resolveGroundReduxProfile('desert').lip < resolveGroundReduxProfile('verdant').lip, 'the arid lip stays low');
assert.equal(resolveGroundReduxProfile('mars').foldMoist, 0, 'no moisture in the folds of Mars');

// 3. The uniform packing the material reads: four packed vectors, the rate is 2π / period, clamped bands.
const u = groundReduxUniformValues(resolveGroundReduxProfile('coastal'));
assert.equal(u.reduxA.length, 4); assert.equal(u.reduxFold.length, 4); assert.equal(u.reduxSwash.length, 4); assert.equal(u.reduxSnow.length, 3);
assert.ok(Math.abs(u.reduxSwash[0] - (2 * Math.PI) / 8.5) < 1e-12, 'the swash rate is 2π over the map\'s swell period');
assert.equal(u.reduxSwash[1], 6, 'round 73b: the reach in metres (Saltmere 6 m), read off the baked shore byte — the mask apron is two metres on a real beach'); assert.equal(u.reduxSwash[2], 1.5, 'the Saltwind probe (2026-09-26): strength 1.5 read as wet sand');
assert.equal(u.reduxSwash[3], 1, 'the foam and wrack lines at full on a sea beach');
assert.equal(u.reduxB.length, 4); assert.equal(u.reduxC.length, 4);
assert.deepEqual(u.reduxB, [0.8, 0.8, 0.7, 1.0], 'round 73b: lip, verge, rim, mid albedo on a temperate coast');
assert.deepEqual(u.reduxC.slice(0, 3), [0.88, 0.94, 0.72], 'the lichen rim tint'); assert.equal(u.reduxC[3], 0, 'no drift edge off the snow');
assert.equal(groundReduxUniformValues(resolveGroundReduxProfile('whiteout')).reduxC[3], 1, 'the drifts\' lee edge on the snow');
assert.deepEqual(groundReduxUniformValues({ ...fallback, rimTint: [9, -1, Number.NaN] }).reduxC.slice(0, 3), [1.5, 0.3, 1], 'the tint clamps to a multiplier near one');
assert.equal(groundReduxUniformValues({ ...fallback, swashStrength: 3 }).reduxSwash[2], 1.6, 'the strength caps at 1.6');
assert.equal(groundReduxUniformValues(resolveGroundReduxProfile('delta')).reduxSwash[0], 0, 'a still bank has no rate');
assert.deepEqual(groundReduxUniformValues(resolveGroundReduxProfile('desert')).reduxSnow, [0, 0, 0]);
assert.deepEqual(groundReduxUniformValues({ ...fallback, heightBlend: 9, foldMoist: -2, swashReachM: 5, swashPeriodS: 0 }).reduxA[0], 1.3, 'clamped to the band');
assert.equal(groundReduxUniformValues({ ...fallback, foldMoist: -2 }).reduxFold[0], 0);
assert.equal(groundReduxUniformValues({ ...fallback, swashReachM: 40 }).reduxSwash[1], 12, 'the reach caps at 12 m (the mark at 1.3 × reach + 0.8 stays inside the 32 m byte)');
assert.equal(groundReduxUniformValues({ ...fallback, swashReachM: 0 }).reduxSwash[1], 1, 'and floors at a metre');
assert.equal(groundReduxUniformValues({ ...fallback, swashReachM: Number.NaN }).reduxSwash[1], 2.5, 'a broken reach takes the still bank\'s');
assert.equal(groundReduxUniformValues({ ...fallback, heightBlend: Number.NaN }).reduxA[0], 0, 'a broken knob is inert');

// 4. The quality knob: the full sward on High / Ultra, half on Medium, a quarter on Low, none on the mobile presets.
assert.equal(tallGrassQualityScale(PRESETS.ultra), 1); assert.equal(tallGrassQualityScale(PRESETS.high), 1);
assert.equal(tallGrassQualityScale(PRESETS.medium), 0.5); assert.equal(tallGrassQualityScale(PRESETS.low), 0.25);
for (const name of ['mobile-low', 'mobile', 'mobile-high']) assert.equal(tallGrassQualityScale(PRESETS[name]), 0, `${name}: no tier`);
assert.equal(tallGrassQualityScale(null), 0); assert.equal(tallGrassQualityScale({ tallGrass: 4 }), 1.5); assert.equal(tallGrassQualityScale({ tallGrass: -1 }), 0);

// 5. The terrain material's contract.
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const material = terrain.slice(terrain.indexOf('const SPLAT_COMMON_FRAG'), terrain.indexOf('const SPLAT_NORMAL_FRAG'));
const declared = [...material.matchAll(/uniform sampler2D ([^;]+);/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
assert.equal(declared.length, GROUND_REDUX_BUDGET.terrainDeclaredSamplers, `the material still declares ten samplers (${declared.join(' ')})`);
assert.ok(GROUND_REDUX_BUDGET.terrainDeclaredSamplers + 6 <= GROUND_REDUX_BUDGET.terrainSamplers, 'ten of its own, the engine\'s cascades / environment / fog fill sixteen');
for (const term of [
  'uniform vec4 uReduxA;', 'uniform vec4 uReduxFold;', 'uniform vec4 uReduxSwash;', 'uniform vec3 uReduxSnow;', 'uniform float uGroundTime;',
  'varying float vFold;', 'float gFoldAO = 1.0;',
  // round 73b: the two new vectors, the shore varying, the crust and foam globals, the borders, the mid albedo, the
  // sawtooth drifts and the strand in metres
  'uniform vec4 uReduxB;', 'uniform vec4 uReduxC;', 'varying float vShore;', 'float gScour = 0.0;', 'float gStrandFoam = 0.0;',
  'float lip = 4.0 * fD * (1.0 - fD) * (0.40 + 0.60 * n1h) * lipG;', 'float rim = 4.0 * fR * (1.0 - fR) * smoothstep(0.25, 0.70, n1h * 0.55 + n2 * 0.45) * rimG;',
  'a.rgb = mix(a.rgb, a.rgb * uReduxC.rgb, rim * 0.85);', 'float vergeW = uReduxB.y * shoulder * fD * (1.0 - roadCore) * (1.0 - projW) * (1.0 - fMs)',
  'float midA = uReduxB.w * dMidN * meadowG * (1.0 - fR) * (1.0 - roadCore);',
  'float drift = (dwave < 0.8 ? dwave / 0.8 : (1.0 - dwave) / 0.2) * 2.0 - 1.0;', 'a.rgb *= 1.0 - lee * 0.13 * sw * uReduxC.w',
  'gScour = scour * uReduxSnow.x;', 'float reachM = uReduxSwash.y;', 'if (uReduxSwash.x > 0.0) reachM *= 0.55 + 0.45 * sin(swashPh);',
  'float edgeM = vShore + (n1h - 0.5) * 1.2 + (n1 - 0.5) * 0.6;', 'float markM = uReduxSwash.y * 1.3 + 0.8;',
  'gStrandFoam = exp(-pow((foamM - reachM) / 0.30, 2.0))', 'if (uReduxSwash.x == 0.0) a.rgb = mix(a.rgb, a.rgb * vec3(0.80, 0.72, 0.58), min(wetSand, 1.0) * 0.6); // a still bank is mud',
  'float film = 1.0 - smoothstep(reachM - 0.25, reachM + 0.25, edgeM); // the last wave\'s line: sharp, ragged', 'gSplatRough = mix(gSplatRough, 0.92, gStrandFoam);', 'gSplatRough = mix(gSplatRough, 0.62, gScour * 0.55);',
  'float reduxHeightMix(float f, float hBase, float hLayer, float k) {',
  'fD = reduxHeightMix(fD, hBase, hD, hK);', 'fR = reduxHeightMix(fR, hBase, hR, hK * 0.8);',
  'float scree = uReduxA.z * smoothstep(0.10, 0.20, slopeR + (n1h - 0.5) * 0.10) * (1.0 - smoothstep(0.32, 0.46, slopeR))',
  'if (uReduxSnow.x > 0.001) {', 'if (uReduxSnow.y > 0.001) {',
  'float hollow = smoothstep(0.06, 0.50, vFold);', 'gFoldAO = 1.0 - uReduxFold.y * 0.35 * hollow * (1.0 - fMs);',
  'float dMidN = smoothstep(20.0, 40.0, camDist) * (1.0 - smoothstep(110.0, 190.0, camDist)) * uReduxA.y;',
  'if (uSea > 0.5 && uReduxSwash.z > 0.001) {', 'float swashPh = uGroundTime * uReduxSwash.x + n1 * 6.0 + n1h * 1.5;',
  'gSplatRough = mix(gSplatRough, 0.30, min(wetSand, 1.0) * 0.95);', 'gSplatRough = mix(gSplatRough, 0.14, glint);',
]) assert.ok(material.includes(term), `the material carries: ${term}`);
assert.ok(/float x = f \+ \(hLayer - hBase\) \* k \* 4\.0 \* f \* \(1\.0 - f\);/.test(material),
  'the height transition vanishes at full and zero coverage (a road stays a road)');
assert.ok(material.includes('float hK = uReduxA.x * 2.5 * (1.0 - farM) * (1.0 - projW);'), 'and fades with the far variant, off the wall projections');
// 2026-09-26: the relief taps and both mixes run only where the transition does — the far field and the zeroed
// `?ground=legacy` A/B keep the plain mask (reduxHeightMix with k = 0 would still S-curve it)
assert.ok(material.includes('if (hK > 0.001) hBase = reduxLuma(a.rgb) - reduxLuma(texture2D(uAlbG, uv * 0.240, 7.0).rgb);'), 'the base relief is gated on the transition strength');
assert.equal((material.match(/if \(hK > 0\.001\) \{/g) || []).length, 2, 'the dirt and rock height mixes are gated on it');
assert.ok(material.includes('(1.0 - smoothstep(14.0, 42.0, camDist))'), 'glints live inside 42 m — no shimmer at range');
// the wiring: profile from the map id inside the material steps (the call site keeps its shape), the fold
// attribute on the vertices, the AO hook on Three's own stage, the clock shared with the sheet, the key
assert.ok(terrain.includes('const redux = groundReduxUniformValues(resolveGroundReduxProfile(mapId));'));
assert.ok(terrain.includes("geo.setAttribute('fold', new THREE.BufferAttribute(fold, 1, true));"), 'one normalised byte per vertex');
assert.ok(terrain.includes('attribute float fold;\\nvarying float vFold;') && terrain.includes('vFold = fold;'), 'the vertex shader forwards the fold');
// round 73b: the shore byte — inverted, so the ring bands (no attribute) read 32 m; one normalised byte per vertex
assert.ok(terrain.includes('attribute float shore;\\nvarying float vShore;') && terrain.includes('vShore = (1.0 - shore) * 32.0;'), 'the vertex shader forwards the shore distance in metres');
assert.ok(terrain.includes("geo.setAttribute('shore', new THREE.BufferAttribute(shore, 1, true));"), 'one normalised shore byte per vertex');
assert.ok(terrain.includes('shore[vi] = m >= 32 ? 0 : 255 - Math.round(Math.max(0, m) * (255 / 32));'), 'inverted: 255 at the waterline, 0 at 32 m and beyond');
assert.ok(terrain.includes('shoreAt = (x: number, z: number): number => {') && terrain.includes('const dist = shorelineDistance(d, x, z, 1.32);'), 'baked from the map\'s own shoreline contours');
assert.ok(!/uniform sampler2D uShore/.test(material), 'the shore is an attribute, not a sampler');
assert.ok(terrain.includes("'#include <aomap_fragment>\\nreflectedLight.indirectDiffuse *= gFoldAO;'"), 'fold occlusion is indirect only');
assert.ok(terrain.includes('heightField._foldAt = foldAt;'), 'the tall grass reads the same folds');
assert.ok(terrain.includes('if (groundClock && Number.isFinite(dt) && dt > 0) groundClock.value += dt;')
  && terrain.includes('if (groundClock) groundClock.value = t;'), 'the swash breathes on the water sheet\'s clock and freezes with it');
assert.ok(terrain.includes("mat.customProgramCacheKey = () => 'world-terrain-splat-v43';"), 'the program key moved with the fragment (round 73b: v43)');
assert.ok(!/uniform sampler2D uPress|uniform sampler2D uRedux/.test(material), 'no new sampler');

// 6. The budgets the perf bench compares against (docs/MAP-BEAUTIFICATION.md round 73).
assert.deepEqual({ ...GROUND_REDUX_BUDGET }, { terrainGpuMs: 0.8, tallGrassGpuMs: 1.0, shorelineGpuMs: 0.2, cpuMs: 0.2, drawCalls: 6, terrainSamplers: 16, terrainDeclaredSamplers: 10 });

console.log(`groundRedux.selftest: ${MAP_IDS.length} map profiles, uniform packing (six vectors), the quality knob, the terrain material's redux contract (ten samplers, v43, the borders, the strand in metres on the shore byte) and the budgets pinned`);
