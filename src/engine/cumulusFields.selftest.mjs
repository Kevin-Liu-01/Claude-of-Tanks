// cumulusFields.selftest — the cumulus fields and the flat condensation base (2026-10-03, the skies-and-atmosphere lane;
// the gauntlet's wave 4: "dozens of near-identical, evenly spaced popcorn cumulus with no flat or shaded bases, reading
// as one sprite stamped repeatedly"). Pinned: the broad gate's law (its mean multiplier is 1, so a map's coverage holds on
// average, with clear gaps and dense fields), its place in the one field every consumer reads (the trace, the gobos,
// the far shade), the flat base's two terms, the plumbing from a regime row to the trace's uniforms, and the cumuliform
// regimes that take them (a stratiform deck never does).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLOUD_CLUSTER_GAP, CLOUD_CLUSTER_PERIOD_K, CLOUD_FAR_THIN } from './volumetricClouds.ts';
import { CLOUDSCAPE_REGIMES } from './cloudscapes.ts';

const here = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const clouds = here('./volumetricClouds.ts');
const layer = here('./cloudscapeLayer.ts'), presets = here('./cloudPresets.ts'), scapes = here('./cloudscapes.ts');
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);

// ---- the gate: gap .. field heart, mean 1 over a symmetric broad field
assert.ok(CLOUD_CLUSTER_GAP > 0.2 && CLOUD_CLUSTER_GAP < 0.6, 'a gap thins the cells below the coverage cut, never to nothing');
assert.ok(CLOUD_CLUSTER_PERIOD_K >= 2, 'the fields are larger than the cells\' tile');
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gate = (g, k) => 1 + ((CLOUD_CLUSTER_GAP + 2 * (1 - CLOUD_CLUSTER_GAP) * smooth(0.3, 0.7, g)) - 1) * k;
let mean = 0; const n = 10000;
for (let i = 0; i < n; i++) mean += gate((i + 0.5) / n, 1);
near(mean / n, 1, 1e-3, 'the gate\'s mean over the broad field is 1 (the map\'s coverage holds on average)');
near(gate(0, 1), CLOUD_CLUSTER_GAP, 1e-12, 'a gap'); near(gate(1, 1), 2 - CLOUD_CLUSTER_GAP, 1e-12, 'a field\'s heart');
assert.equal(gate(0.1, 0), 1, 'cluster 0: the even field, exactly');
// a 0.34 coverage (Verdant) under the gate: the gaps clear, the hearts merge
const cut = 1 - 0.34;
assert.ok(0.9 * gate(0, 1) < cut, 'even a strong cell in a gap stays under the coverage cut (a clear gap)');
assert.ok(0.5 * gate(1, 1) > cut * 0.9, 'an average cell at a field\'s heart rises to the cut (cells merge into masses)');

// ---- the GLSL: one field for the trace, the gobos and the far shade
assert.match(clouds, /uniform float uCluster;\n\/\/ the last cloudField call's cumulus-field gate/, 'declared with the shared field');
assert.match(clouds, /float g = textureLod\( tWeather, \( pxz \+ uWeatherShift \* 0\.5 \) \/ \$\{f\(CLOUD_WEATHER_TILE_M \* CLOUD_CLUSTER_PERIOD_K\)\} \+ vec2\( 0\.37, 0\.61 \), 0\.0 \)\.b;/,
  'the broad channel at the fields\' period, drifting at half the cells\' speed');
assert.match(clouds, /cloudGate = mix\( 1\.0, \$\{f\(CLOUD_CLUSTER_GAP\)\} \+ \$\{f\(2 \* \(1 - CLOUD_CLUSTER_GAP\)\)\} \* smoothstep\( 0\.3, 0\.7, g \), uCluster \);\s*field \*= cloudGate;/, 'the gate');
// (2026-10-03) the trace's far-field re-mix toward the cells takes the same gate (a street regime's far half was ungated)
assert.match(clouds, /field = mix\( field, mix\( w\.r, w\.b, uFieldMix \) \* cloudGate, uStreets \* 0\.55 \* farK \);/, 'the far cells gated alike');
assert.match(clouds, /float cloudGate = 1\.0;/); assert.match(clouds, /\tcloudGate = 1\.0;\n\tif \( uCluster > 0\.0 \) \{/, 'reset per call');

// ---- the far field's thinning (2026-10-03; wave 4: "fewer small puffs near the horizon"): cumuliform only, past ~9 km,
// a share of the coverage off the cut; off until a lab shows it, read per frame for a sweep
assert.equal(CLOUD_FAR_THIN, 0, 'off by default');
assert.match(clouds, /if \( uFarThin > 0\.0 \) field -= uFarThin \* \( 1\.0 - uStratiform \) \* smoothstep\( 9000\.0, 20000\.0, farD \) \* uCoverage \* 0\.5;/, 'the far cut');
assert.match(clouds, /t\.uFarThin\.value = lightTune\('CLOUD_FAR_THIN', CLOUD_FAR_THIN\);/, 'per frame');

// ---- a deck's definition (2026-10-03; the gauntlet's wave 5: "a flat, blurry, low-definition overcast sky ... reads as a
// placeholder skybox"): a knob every deck regime can take, 0 = round 76's deck (no regime takes it until a lab shows it)
assert.match(clouds, /float deckK = uDeckDetail \* max\( smoothstep\( 0\.3, 0\.6, uStratiform \), uCells \* 0\.8 \);/, 'decks only');
assert.match(clouds, /uStratiform \* 0\.8 \* \( 1\.0 - 0\.3 \* uCells \) \* \( 1\.0 - 0\.5 \* deckK \)/, 'less of the sheet\'s flattening');
assert.match(clouds, /amount \*= 1\.0 \+ 1\.8 \* deckK;/, 'the erosion near a cumulus\'s strength');
assert.match(clouds, /d = smoothstep\( 0\.03 \+ 0\.09 \* deckK, 0\.6 - 0\.25 \* deckK, d \);/, 'a crisper outline');
assert.match(clouds, /t\.uDeckDetail\.value = preset\.deckDetail \?\? 0;/);
assert.match(layer, /deckDetail: clamp\(pick\('deckDetail'\), 0, 1\),/);
assert.match(presets, /p\.cluster \?\? 0, p\.deckDetail \?\? 0,/, 'in the layer\'s key');
for (const [name, r] of Object.entries(CLOUDSCAPE_REGIMES)) assert.equal(r.deckDetail, 0, `${name}: round 76's deck until a lab shows the knob`);
assert.match(clouds, /uFieldMix: \{ value: 0 \}, uCluster: \{ value: 0 \},/, 'every consumer\'s field uniforms carry it');
assert.match(clouds, /uFieldMix: gu\.uFieldMix, uCluster: gu\.uCluster,/, 'the far shade reads the gobos\' own');
assert.match(clouds, /g\.uCluster\.value = preset\?\.cluster \?\? 0;/, 'the gobos follow the preset');
assert.match(clouds, /t\.uCluster\.value = preset\.cluster \?\? 0;/, 'the trace follows the preset');

// ---- the flat base
assert.match(clouds, /float riseEnd = mix\( 0\.05, 0\.14, t \) \* \( 1\.0 - 0\.6 \* uBaseFlat \* \( 1\.0 - uStratiform \) \);/, 'a sharper rise at the base');
assert.match(clouds, /amount \*= mix\( 1\.0, smoothstep\( 0\.0, 0\.18, hN \), uBaseFlat \* \( 1\.0 - uStratiform \) \);/, 'no erosion lumps under the base');
assert.match(clouds, /t\.uBaseFlat\.value = preset\.baseFlat \?\? 0;/);

// ---- the plumbing: config -> row -> preset (cloudscapeLayer.ts), the legacy preset at 0
assert.match(layer, /cluster: clamp\(pick\('cluster'\), 0, 1\),\s*baseFlat: clamp\(pick\('baseFlat'\), 0, 1\),/);
assert.match(layer, /cluster: row\?\.cluster \?\? legacy\.cluster \?\? 0,\s*baseFlat: row\?\.baseFlat \?\? legacy\.baseFlat \?\? 0,/);
assert.match(presets, /p\.lumps \?\? 0, p\.baseFlat \?\? 0, p\.cluster \?\? 0,/, 'both are in the layer\'s key (a change rebuilds the history)');
assert.match(scapes, /const CLEAR_WEATHER = Object\.freeze\(\{ rain: 0, virga: 0, lumps: 0, cluster: 0, baseFlat: 0, deckDetail: 0 \} as const\);/, 'a row without them is the even, round sky');

// ---- the regimes: the cumuliform ones take fields and flat bases; the decks, the sheets and the fronts do not
for (const regime of ['fair-weather-cumulus', 'cloud-streets', 'sea-streets', 'cumulus-humilis', 'towering-cumulus']) {
  const r = CLOUDSCAPE_REGIMES[regime];
  assert.ok(r.cluster > 0.3 && r.cluster < 0.8, `${regime}: fields with gaps (${r.cluster})`);
  assert.equal(r.baseFlat, 1, `${regime}: a flat condensation base`);
}
for (const regime of ['stratocumulus-deck', 'overcast-stratus', 'low-stratus', 'cumulonimbus-front', 'hazy-altostratus']) {
  const r = CLOUDSCAPE_REGIMES[regime];
  assert.equal(r.cluster, 0, `${regime}: no cumulus fields`); assert.equal(r.baseFlat, 0, `${regime}: its own base`);
}
assert.ok(CLOUDSCAPE_REGIMES['fair-weather-cumulus'].density > 0.1, 'a fair-weather cumulus dense enough to shade its own base');
assert.ok(CLOUDSCAPE_REGIMES['fair-weather-cumulus'].ambientScale < 1, 'and its shaded base not lifted back by the fill');

console.log(`cumulusFields.selftest: the cumulus fields' gate (gap ${CLOUD_CLUSTER_GAP}, mean 1, ${CLOUD_CLUSTER_PERIOD_K}x the tile), the flat base, the plumbing and the cumuliform regimes PASS`);
