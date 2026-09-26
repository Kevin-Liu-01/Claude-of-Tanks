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
  assert.ok(p.swashWidth >= 0.2 && p.swashWidth <= 4, `${id}: the band is a multiple of the apron ramp inside the packer's clamp`);
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
    if (g.kind === 'reed') assert.ok(g.waterBand > 0 && g.heightM >= 1.4, `${id}: reeds stand tall in the shallows`);
    else assert.equal(g.waterBand, 0, `${id}: only reeds grow in the water`);
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
assert.equal(resolveGroundReduxProfile('mars').foldMoist, 0, 'no moisture in the folds of Mars');

// 3. The uniform packing the material reads: four packed vectors, the rate is 2π / period, clamped bands.
const u = groundReduxUniformValues(resolveGroundReduxProfile('coastal'));
assert.equal(u.reduxA.length, 4); assert.equal(u.reduxFold.length, 4); assert.equal(u.reduxSwash.length, 4); assert.equal(u.reduxSnow.length, 3);
assert.ok(Math.abs(u.reduxSwash[0] - (2 * Math.PI) / 8.5) < 1e-12, 'the swash rate is 2π over the map\'s swell period');
assert.equal(u.reduxSwash[1], 1.9); assert.equal(u.reduxSwash[2], 1.5, 'the Saltwind probe (2026-09-26): width 1.9 ramps, strength 1.5 read as wet sand; 1.0 at 0.12 ramps was invisible');
assert.equal(groundReduxUniformValues({ ...fallback, swashStrength: 3 }).reduxSwash[2], 1.6, 'the strength caps at 1.6');
assert.equal(groundReduxUniformValues(resolveGroundReduxProfile('delta')).reduxSwash[0], 0, 'a still bank has no rate');
assert.deepEqual(groundReduxUniformValues(resolveGroundReduxProfile('desert')).reduxSnow, [0, 0, 0]);
assert.deepEqual(groundReduxUniformValues({ ...fallback, heightBlend: 9, foldMoist: -2, swashWidth: 5, swashPeriodS: 0 }).reduxA[0], 1.3, 'clamped to the band');
assert.equal(groundReduxUniformValues({ ...fallback, foldMoist: -2 }).reduxFold[0], 0);
assert.equal(groundReduxUniformValues({ ...fallback, swashWidth: 9 }).reduxSwash[1], 4);
assert.equal(groundReduxUniformValues({ ...fallback, swashWidth: Number.NaN }).reduxSwash[1], 1.9, 'a broken width takes the default');
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
  'float reduxHeightMix(float f, float hBase, float hLayer, float k) {',
  'fD = reduxHeightMix(fD, hBase, hD, hK);', 'fR = reduxHeightMix(fR, hBase, hR, hK * 0.8);',
  'float scree = uReduxA.z * smoothstep(0.10, 0.20, slopeR + (n1h - 0.5) * 0.10) * (1.0 - smoothstep(0.32, 0.46, slopeR))',
  'if (uReduxSnow.x > 0.001) {', 'if (uReduxSnow.y > 0.001) {',
  'float hollow = smoothstep(0.10, 0.60, vFold);', 'gFoldAO = 1.0 - uReduxFold.y * 0.35 * hollow * (1.0 - fMs);',
  'float dMidN = smoothstep(26.0, 50.0, camDist) * (1.0 - smoothstep(95.0, 150.0, camDist)) * uReduxA.y;',
  'if (uSea > 0.5 && uReduxSwash.z > 0.001) {', 'float swashPh = uGroundTime * uReduxSwash.x + n1 * 6.0 + n1h * 1.5;',
  'float strandD = clamp((uSeaRamp.x - fM) / (uReduxSwash.y * max(uSeaRamp.x, 0.02)), 0.0, 1.0);',
  'gSplatRough = mix(gSplatRough, 0.30, wetSand * 0.9);', 'gSplatRough = mix(gSplatRough, 0.14, glint);',
]) assert.ok(material.includes(term), `the material carries: ${term}`);
assert.ok(/float x = f \+ \(hLayer - hBase\) \* k \* 4\.0 \* f \* \(1\.0 - f\);/.test(material),
  'the height transition vanishes at full and zero coverage (a road stays a road)');
assert.ok(material.includes('float hK = uReduxA.x * 2.5 * (1.0 - farM) * (1.0 - projW);'), 'and fades with the far variant, off the wall projections');
assert.ok(material.includes('(1.0 - smoothstep(14.0, 42.0, camDist))'), 'glints live inside 42 m — no shimmer at range');
// the wiring: profile from the map id inside the material steps (the call site keeps its shape), the fold
// attribute on the vertices, the AO hook on Three's own stage, the clock shared with the sheet, the key
assert.ok(terrain.includes('const redux = groundReduxUniformValues(resolveGroundReduxProfile(mapId));'));
assert.ok(terrain.includes("geo.setAttribute('fold', new THREE.BufferAttribute(fold, 1, true));"), 'one normalised byte per vertex');
assert.ok(terrain.includes('attribute float fold;\\nvarying float vFold;') && terrain.includes('vFold = fold;'), 'the vertex shader forwards the fold');
assert.ok(terrain.includes("'#include <aomap_fragment>\\nreflectedLight.indirectDiffuse *= gFoldAO;'"), 'fold occlusion is indirect only');
assert.ok(terrain.includes('heightField._foldAt = foldAt;'), 'the tall grass reads the same folds');
assert.ok(terrain.includes('if (groundClock && Number.isFinite(dt) && dt > 0) groundClock.value += dt;')
  && terrain.includes('if (groundClock) groundClock.value = t;'), 'the swash breathes on the water sheet\'s clock and freezes with it');
assert.ok(terrain.includes("mat.customProgramCacheKey = () => 'world-terrain-splat-v42';"), 'the program key moved with the fragment');
assert.ok(!/uniform sampler2D uPress|uniform sampler2D uRedux/.test(material), 'no new sampler');

// 6. The budgets the perf bench compares against (docs/MAP-BEAUTIFICATION.md round 73).
assert.deepEqual({ ...GROUND_REDUX_BUDGET }, { terrainGpuMs: 0.8, tallGrassGpuMs: 1.0, shorelineGpuMs: 0.2, cpuMs: 0.2, drawCalls: 6, terrainSamplers: 16, terrainDeclaredSamplers: 10 });

console.log(`groundRedux.selftest: ${MAP_IDS.length} map profiles, uniform packing, the quality knob, the terrain material's redux contract (ten samplers, v40) and the budgets pinned`);
