// cumulusFields.selftest — the cumulus fields and the flat condensation base (2026-10-03, the skies-and-atmosphere lane;
// the gauntlet's wave 4: "dozens of near-identical, evenly spaced popcorn cumulus with no flat or shaded bases, reading
// as one sprite stamped repeatedly"). Pinned: the broad gate's law (its mean multiplier is 1, so a map's coverage holds on
// average, with clear gaps and dense fields), its place in the one field every consumer reads (the trace, the gobos,
// the far shade), the flat base's two terms, the plumbing from a regime row to the trace's uniforms, and the cumuliform
// regimes that take them (a stratiform deck never does).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLOUD_BASE_DARK, CLOUD_BASE_SHARP, CLOUD_CLUSTER_GAP, CLOUD_CLUSTER_PERIOD_K, CLOUD_EDGE_CRISP, CLOUD_FAR_FLAT, CLOUD_FAR_THIN, CLOUD_LUMP_GATE,
  CLOUD_LUMP_GATE_PERIOD_K, CLOUD_NEAR_FIELD, CLOUD_TOP_BILLOW,
} from './volumetricClouds.ts';
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
assert.match(clouds, /uniform float uCluster;\n\/\/ 2026-10-03: the cumulus fields' floor over the battlefield \(CLOUD_NEAR_FIELD; 0 = off\)\nuniform float uNearField;\n\/\/ the last cloudField call's cumulus-field gate/, 'declared with the shared field');
assert.match(clouds, /float g = textureLod\( tWeather, \( pxz \+ uWeatherShift \* 0\.5 \) \/ \$\{f\(CLOUD_WEATHER_TILE_M \* CLOUD_CLUSTER_PERIOD_K\)\} \+ vec2\( 0\.37, 0\.61 \), 0\.0 \)\.b;/,
  'the broad channel at the fields\' period, drifting at half the cells\' speed');
assert.match(clouds, /cloudGate = mix\( 1\.0, \$\{f\(CLOUD_CLUSTER_GAP\)\} \+ \$\{f\(2 \* \(1 - CLOUD_CLUSTER_GAP\)\)\} \* smoothstep\( 0\.3, 0\.7, g \), uCluster \);[\s\S]{0,240}field \*= cloudGate;/, 'the gate');
// (2026-10-03, wave 22: "tiny grey dabs high in the frame smaller than the clouds near the horizon") the floor over the
// battlefield: never under the mean within 2.8 km of the map's centre, fading by 8 km; off until a capture shows it
assert.match(clouds, /if \( uNearField > 0\.0 \) cloudGate = max\( cloudGate, uNearField \* \( 1\.0 - smoothstep\( 2800\.0, 8000\.0, length\( pxz \) \) \) \);/, 'the floor');
// (2026-10-03) the trace's far-field re-mix toward the cells takes the same gate (a street regime's far half was ungated)
assert.match(clouds, /field = mix\( field, mix\( w\.r, w\.b, uFieldMix \) \* cloudGate, uStreets \* 0\.55 \* farK \);/, 'the far cells gated alike');
assert.match(clouds, /float cloudGate = 1\.0;/); assert.match(clouds, /\tcloudGate = 1\.0;\n\tif \( uCluster > 0\.0 \) \{/, 'reset per call');

// ---- the far field's thinning (2026-10-03; wave 4: "fewer small puffs near the horizon"): cumuliform only, past ~9 km,
// a share of the coverage off the cut; off until a lab shows it, read per frame for a sweep
assert.equal(CLOUD_FAR_THIN, 0, 'off by default');
assert.match(clouds, /if \( uFarThin > 0\.0 \) field -= uFarThin \* \( 1\.0 - uStratiform \) \* smoothstep\( 9000\.0, 20000\.0, farD \) \* uCoverage \* 0\.5;/, 'the far cut');
assert.match(clouds, /t\.uFarThin\.value = lightTune\('CLOUD_FAR_THIN', CLOUD_FAR_THIN\);/, 'per frame');

// ---- the cumulus knobs (2026-10-03; the gauntlet's wave 17, Opus: "soft, low-contrast cotton puffs at random heights, no
// shared flat base, undersides barely shaded, hardly flattening toward the horizon"): off until a capture shows them,
// read per frame for a sweep
assert.deepEqual([CLOUD_BASE_SHARP, CLOUD_BASE_DARK, CLOUD_FAR_FLAT], [0, 0, 0], 'the candidate\'s cumulus by default');
// (wave 22's knobs: the crisp outline, the billowed tops, the battlefield's field floor — off until a capture shows them)
assert.deepEqual([CLOUD_EDGE_CRISP, CLOUD_TOP_BILLOW, CLOUD_NEAR_FIELD], [0, 0, 0], 'off by default');
for (const [u, k] of [['uEdgeCrisp', 'CLOUD_EDGE_CRISP'], ['uTopBillow', 'CLOUD_TOP_BILLOW'], ['uNearField', 'CLOUD_NEAR_FIELD']]) {
  assert.match(clouds, new RegExp(`t\\.${u}\\.value = lightTune\\('${k}', ${k}\\);`), `${u} per frame`);
}
assert.match(clouds, /\(this\.goboMaterial\.uniforms as \{ uNearField: \{ value: number \} \}\)\.uNearField\.value = t\.uNearField\.value as number;/, 'the shade map\'s field takes the floor too');
assert.match(clouds, /float wispy = clamp\( mix\( hN \* 1\.4 - 0\.15, 1\.0, uWispiness \), 0\.0, 1\.0 \) \* \( 1\.0 - uTopBillow \* \( 1\.0 - uStratiform \) \);/, 'billows, not wisps, on a cumulus top');
assert.match(clouds, /float baseW = edgeC \* uBaseFlat \* \( 1\.0 - smoothstep\( 0\.0, 0\.22, hN \) \);[\s\S]{0,200}vec3 db = texture\( tDetail, vec3\( ps\.x, 17\.0, ps\.z \)/, 'the base outline crinkles in plan (one height through the bottom layer)');
for (const [u, k] of [['uBaseSharp', 'CLOUD_BASE_SHARP'], ['uBaseDark', 'CLOUD_BASE_DARK'], ['uFarFlat', 'CLOUD_FAR_FLAT']]) {
  assert.match(clouds, new RegExp(`uniform float ${u};`), `${u} is declared`);
  assert.match(clouds, new RegExp(`t\\.${u}\\.value = lightTune\\('${k}', ${k}\\);`), `${u} per frame`);
}
assert.match(clouds, /float bk = uBaseSharp \* uBaseFlat \* \( 1\.0 - uStratiform \) \* \( 1\.0 - smoothstep\( 0\.04, 0\.22, hN \) \);\s*if \( bk > 0\.0 \) d = mix\( d, max\( d, smoothstep\( 0\.01, 0\.12, d \) \* w\.cov \* hg \* 0\.9 \), bk \);/,
  'a flat-based cumulus: a column that carries the body fills its base, an empty one stays empty (fp12: no bodiless lenses)');
{
  // the fill, modelled: an empty column (d 0) stays 0; a thin edge of a body (d 0.06) rises toward the footprint; a dense
  // core is untouched
  const sm = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const fill = (d, cov, hg = 1, bk = 1) => d + (Math.max(d, sm(0.01, 0.12, d) * cov * hg * 0.9) - d) * bk;
  assert.equal(fill(0, 0.8), 0, 'an empty column stays empty');
  assert.ok(fill(0.06, 0.8) > 0.3, `a body's thin edge fills (${fill(0.06, 0.8).toFixed(2)})`);
  assert.equal(fill(0.9, 0.8), 0.9, 'a dense core is untouched');
}
assert.match(clouds, /float bd = uBaseDark \* \( 1\.0 - uStratiform \);\s*float msV = mix\( 0\.35 - 0\.15 \* bd, 1\.0,/, 'the base\'s diffused light');
assert.match(clouds, /float baseShadow = mix\( 0\.35 - 0\.17 \* bd, 1\.0,/, 'its direct light');
assert.match(clouds, /float floorK = mix\( 0\.34 - 0\.14 \* bd, 1\.25, deckFloor \)/, 'its sky floor (a deck\'s untouched)');
assert.match(clouds, /if \( uFarFlat > 0\.0 \) o\.top \*= 1\.0 - 0\.4 \* uFarFlat \* \( 1\.0 - uStratiform \) \* smoothstep\( 6000\.0, 18000\.0, farD \);/, 'the far field flattens');

// ---- the far band (2026-10-03; waves 13-14: "a ruler-flat pale band at one constant height"): decks only — a cumuliform
// sky ends where its traced field does and sinks into the haze; the contrails are off on every map
assert.match(clouds, /if \( uFarBand <= 0\.0 \|\| dir\.y <= 0\.0005 \|\| uDeckMarch <= 0\.0 \) return none;/, 'no far band under a cumuliform sky');
// (2026-10-03, the gauntlet's wave 17 on Frosthollow: a whitish band under the deck's edge) a deck's band admits the deck's
// own coverage when that is more — a closed deck stays closed to the horizon — and reaches down to it
assert.match(clouds, /float fbCov = max\( uFarBand, uCoverage \);\s*float covB = smoothstep\( 1\.0 - fbCov, 1\.0 - fbCov \+ 0\.35, fb \)/, 'the deck\'s coverage');
assert.match(layer, /export const CLOUD_CONTRAILS_ON = false;/, 'contrails off');
assert.match(layer, /out\.contrails = CLOUD_CONTRAILS_ON \? Math\.round\(clamp\(scape\.contrails \?\? 0, 0, 1\) \* CLOUD_CONTRAIL_MAX\) : 0;/);

// ---- a deck's definition (2026-10-03; the gauntlet's wave 5: "a flat, blurry, low-definition overcast sky ... reads as a
// placeholder skybox"): a knob every deck regime can take, 0 = round 76's deck (no regime takes it until a lab shows it)
assert.match(clouds, /float deckK = uDeckDetail \* max\( smoothstep\( 0\.3, 0\.6, uStratiform \), uCells \* 0\.8 \);/, 'decks only');
assert.match(clouds, /uStratiform \* 0\.8 \* \( 1\.0 - 0\.3 \* uCells \) \* \( 1\.0 - 0\.5 \* deckK \)/, 'less of the sheet\'s flattening');
assert.match(clouds, /amount \*= 1\.0 \+ 1\.8 \* deckK;/, 'the erosion near a cumulus\'s strength');
assert.match(clouds, /d = smoothstep\( 0\.03 \+ 0\.09 \* deckK \+ 0\.05 \* edgeC, 0\.6 - 0\.25 \* deckK - 0\.25 \* edgeC, d \);/, 'a crisper outline (a deck\'s, a crisp cumulus\'s)');
assert.match(clouds, /t\.uDeckDetail\.value = preset\.deckDetail \?\? 0;/);
assert.match(layer, /deckDetail: clamp\(pick\('deckDetail'\), 0, 1\),/);
assert.match(presets, /p\.cluster \?\? 0, p\.deckDetail \?\? 0,/, 'in the layer\'s key');
for (const [name, r] of Object.entries(CLOUDSCAPE_REGIMES)) assert.equal(r.deckDetail, 0, `${name}: round 76's deck until a lab shows the knob`);
// ---- a deck's lumps (2026-10-03; fp11: lumps 0.8 gave a deck's base its rolls, at one strength everywhere — a texture
// laid over the sheet): a broad field gates the strength, so the base reads lumpy over some stretches of the deck and
// smooth over others; both lump sites read the gated strength; no regime takes lumps until a lab shows the gated knob
assert.equal(CLOUD_LUMP_GATE, 1, 'the lumps come and go with the broad field');
assert.ok(CLOUD_LUMP_GATE_PERIOD_K >= 1 && CLOUD_LUMP_GATE_PERIOD_K <= 3, 'stretches of a few kilometres');
assert.match(clouds, /float cloudLumpK\( vec2 cxz \) \{\s*if \( uLumps <= 0\.0 \) return 0\.0;/, 'no fetch without lumps');
assert.match(clouds, /\$\{f\(CLOUD_WEATHER_TILE_M \* CLOUD_LUMP_GATE_PERIOD_K\)\} \+ vec2\( 0\.53, 0\.29 \), 0\.0 \)\.b;/, 'the broad channel at its own period and offset');
assert.match(clouds, /return uLumps \* mix\( 1\.0, smoothstep\( 0\.3, 0\.7, b \), \$\{f\(CLOUD_LUMP_GATE\)\} \);/, 'the gate');
assert.equal((clouds.match(/= cloudLumpK\( cxz \);/g) ?? []).length, 2, 'the cell factor and the base mottle read the gated strength');
assert.match(clouds, /k \*= mix\( 1\.0, 0\.45 \+ 0\.85 \* lump, lk \);/, 'the cell factor');
assert.match(clouds, /dm\.b \* 0\.15 \), lkB \);/, 'the base mottle');
assert.ok(!/, uLumps \);/.test(clouds), 'no ungated lump site left');
for (const [name, r] of Object.entries(CLOUDSCAPE_REGIMES)) assert.equal(r.lumps ?? 0, 0, `${name}: no lumps until a lab shows the gated knob`);
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
for (const regime of ['fair-weather-cumulus', 'cloud-streets', 'sea-streets', 'towering-cumulus']) {
  const r = CLOUDSCAPE_REGIMES[regime];
  assert.ok(r.cluster > 0.3 && r.cluster < 0.8, `${regime}: fields with gaps (${r.cluster})`);
  assert.equal(r.baseFlat, 1, `${regime}: a flat condensation base`);
}
// (2026-10-03, fp10: at a humilis map's 0.14-0.20 coverage the fields' hearts swelled the dry, sparse cells into cotton
// masses over Sirocco; humilis keeps the even field — small, flat, scattered — and its flat base)
assert.equal(CLOUDSCAPE_REGIMES['cumulus-humilis'].cluster, 0, 'humilis: no fields');
assert.equal(CLOUDSCAPE_REGIMES['cumulus-humilis'].baseFlat, 1, 'humilis: a flat base');
for (const regime of ['stratocumulus-deck', 'overcast-stratus', 'low-stratus', 'cumulonimbus-front', 'hazy-altostratus']) {
  const r = CLOUDSCAPE_REGIMES[regime];
  assert.equal(r.cluster, 0, `${regime}: no cumulus fields`); assert.equal(r.baseFlat, 0, `${regime}: its own base`);
}
assert.ok(CLOUDSCAPE_REGIMES['fair-weather-cumulus'].density > 0.1, 'a fair-weather cumulus dense enough to shade its own base');
assert.ok(CLOUDSCAPE_REGIMES['fair-weather-cumulus'].ambientScale < 1, 'and its shaded base not lifted back by the fill');

console.log(`cumulusFields.selftest: the cumulus fields' gate (gap ${CLOUD_CLUSTER_GAP}, mean 1, ${CLOUD_CLUSTER_PERIOD_K}x the tile), the deck lumps' broad gate, the flat base, the plumbing and the cumuliform regimes PASS`);
