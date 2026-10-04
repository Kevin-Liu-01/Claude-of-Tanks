// The far horizon panorama (the mountains lane, 2026-10-03; horizonPanorama.ts): the shell's geometry and its atlas
// mapping, the bake's contract with the renderer (three passes, the renderer's state restored, the fallback far range
// handed over and taken back on a GPU suspension, no bake without a capable renderer), the shaders' uniforms, and the
// horizon's wiring (one of the two far meshes visible at a time, lookups by name still find the round-72 range).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  HORIZON_PANORAMA, HORIZON_PANORAMA_CHARACTERS, HORIZON_PANORAMA_REGIONAL, HORIZON_PANORAMA_SHADERS, buildHorizonPanoramaShellGeometry, horizonPanoramaHaze,
  createHorizonPanorama, horizonPanoramaUv, horizonRingSkylineTan, resolveHorizonPanoramaCharacter,
} from './horizonPanorama.ts';
import { HORIZON_FAR_ROWS } from './horizonFarRange.ts';
import saltwind from './maps/saltwind.ts';
import { horizonPanoramaDeckM } from './maps/horizon.ts';
import { HORIZON_RELIEF_CHARACTERS } from './horizonRelief.ts';
import { CLOUD_FOGBANK_RANGE_M } from '../engine/cloudWeatherLayers.ts';
import { hazeSigma } from '../engine/hazeLaw.ts';

const P = HORIZON_PANORAMA;
const n = 431;
const ringEdge = (() => {
  const rows = 3, positions = new Float32Array(n * rows * 3), heights = new Float32Array(n * rows);
  for (let row = 0; row < rows; row++) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = 1000 + row * 160, i = row * n + k;
    positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 2] = Math.sin(a) * r;
    heights[i] = positions[i * 3 + 1] = 40 + 30 * Math.sin(a * 3) + row * 10;
  }
  return { columns: n, positions, heights };
})();

// --- the shell: row 0 on the ring's outer edge, the apron, the wall at the shell radius; u continuous round the seam --
{
  const geometry = buildHorizonPanoramaShellGeometry(ringEdge);
  const pos = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  const rows = 1 + P.apronM.length + P.wallElevDeg.length, stride = n + 1;
  assert.equal(pos.count, rows * stride, 'the shell: (columns + the seam column) x rows vertices');
  assert.equal(geometry.index.count / 3, (rows - 1) * n * 2, `the shell's triangles (${(rows - 1) * n * 2})`);
  assert.ok((rows - 1) * n * 2 < 7000, 'the shell stays a few thousand triangles: one cheap draw');
  // the brief's budget: per map no more triangles than before — the shell draws fewer than the round-72 far range it
  // hides once baked (its rows x the same ring columns)
  assert.ok(rows <= HORIZON_FAR_ROWS.length,
    `the shell's ${(rows - 1) * n * 2} triangles stay under the far range's ${(HORIZON_FAR_ROWS.length - 1) * n * 2}`);
  const start = ringEdge.heights.length - n;
  for (let k = 0; k <= n; k++) {
    const c = k % n;
    assert.ok(Math.abs(pos.getX(k) - ringEdge.positions[(start + c) * 3]) < 1e-3 && Math.abs(pos.getZ(k) - ringEdge.positions[(start + c) * 3 + 2]) < 1e-3,
      'row 0 stands on the ring\'s outer edge');
    assert.ok(Math.abs(pos.getY(k) - (ringEdge.heights[start + c] - 0.05)) < 1e-3, 'row 0 takes the ring\'s outer heights');
    assert.ok(Math.abs(uv.getX(k) - k / n) < 1e-6, 'u is the azimuth fraction, continuous across the seam (column n at u = 1)');
    let previousR = Math.hypot(pos.getX(k), pos.getZ(k)), previousE = -Math.PI;
    for (let row = 1; row < rows; row++) {
      const i = row * stride + k, r = Math.hypot(pos.getX(i), pos.getZ(i));
      assert.ok(r >= previousR - 1e-3, 'the shell never folds back toward the square');
      previousR = r;
      if (row > P.apronM.length) {
        assert.ok(r >= P.shellM - 1e-3, 'the wall stands at the shell radius');
        const e = Math.atan2(pos.getY(i) - P.eyeY, r);
        assert.ok(e >= previousE - 1e-6, 'the wall rises row by row');
        previousE = e;
      }
    }
    // the atlas mapping: a wall vertex's own u and its elevation's v are its direction from the bake eye
    const top = (rows - 1) * stride + k;
    const [u, v] = horizonPanoramaUv(pos.getX(top), pos.getY(top), pos.getZ(top));
    const uWrapped = k === n ? 1 : k / n;
    assert.ok(Math.abs(u - uWrapped) < 1e-4 || Math.abs(u + 1 - uWrapped) < 1e-4 || (k === 0 && Math.abs(u - 1) < 1e-4) || (k === n && Math.abs(u) < 1e-4),
      `a wall vertex's azimuth is its u (${u.toFixed(5)} vs ${uWrapped.toFixed(5)})`);
    assert.ok(Math.abs(v - 1) < 1e-6, 'the wall\'s top row is the strip\'s top');
  }
  geometry.dispose();
}

// --- a sea opening (the ring's marine faces out to 4.35 km over 40 columns, Saltwind's channel): the shell's edge row
// stands on them at seaEdgeMaxM and nothing of the shell reaches the cloud layer's sea fog bank (paired capture d6: a
// shell at 4.5 km took the bank, integrated to its far range, over the far shore painted on it) -------------------------
{
  const sea = (() => {
    const rows = 3, positions = new Float32Array(n * rows * 3), heights = new Float32Array(n * rows);
    for (let row = 0; row < rows; row++) for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2, open = row === rows - 1 && k >= 100 && k < 140, r = open ? 4350 : 1000 + row * 160, i = row * n + k;
      positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 2] = Math.sin(a) * r;
      heights[i] = positions[i * 3 + 1] = open ? 0.4 : 40 + row * 10;
    }
    return { columns: n, positions, heights };
  })();
  const geometry = buildHorizonPanoramaShellGeometry(sea), pos = geometry.getAttribute('position');
  let farthest = 0;
  for (let i = 0; i < pos.count; i++) farthest = Math.max(farthest, Math.hypot(pos.getX(i), pos.getZ(i)));
  assert.ok(P.seaEdgeMaxM + 160 < CLOUD_FOGBANK_RANGE_M[0] && farthest < CLOUD_FOGBANK_RANGE_M[0],
    `the shell stays inside the sea fog bank's range (${farthest.toFixed(0)} m < ${CLOUD_FOGBANK_RANGE_M[0]} m)`);
  const rowsN = 1 + P.apronM.length + P.wallElevDeg.length, strideN = n + 1;
  for (let k = 0; k <= n; k++) for (let row = 1; row < rowsN; row++) {
    const i = row * strideN + k, j = i - strideN;
    assert.ok(Math.hypot(pos.getX(i), pos.getZ(i)) >= Math.hypot(pos.getX(j), pos.getZ(j)) - 1e-3, 'over the opening too the shell never folds back');
  }
  for (let k = 100; k < 140; k++) {
    const r = Math.hypot(pos.getX(k), pos.getZ(k));
    assert.ok(Math.abs(r - P.seaEdgeMaxM) < 1e-2 && Math.abs(pos.getY(k) - (0.4 - 0.05)) < 1e-3,
      'over the opening the edge row stands on the marine faces at seaEdgeMaxM');
  }
  geometry.dispose();
}

// --- the characters: every relief character has its far vocabulary; overrides merge -----------------------------------
for (const character of HORIZON_RELIEF_CHARACTERS) {
  const c = HORIZON_PANORAMA_CHARACTERS[character];
  assert.ok(c && c.ampM > 0 && c.macroL > c.midL && c.midL > c.gullyL, `${character}: a far vocabulary from the ranges down to the gullies`);
}
assert.equal(resolveHorizonPanoramaCharacter('alpine', { ampM: 1 }).ampM, 1, 'a map overrides its character\'s knobs');
assert.equal(resolveHorizonPanoramaCharacter('alpine', { ampM: 1 }).macroL, HORIZON_PANORAMA_CHARACTERS.alpine.macroL, 'the others stay');

// --- the layers behind the ring: the far country answers the ring's own skyline from the bake eye ----------------------
// (the panorama lab, SwiftShader: on Verdant, Frontier Basin and Saltmere the far country stood above the ring's skyline
// on 14-35 % of the bearings, by about a degree and a half; with the layers on 55-63 %, by about two)
{
  const sky = horizonRingSkylineTan(ringEdge, P.eyeY);
  assert.equal(sky.length, n, 'one skyline value per ring column');
  // the raw skyline of the fixture ring: its highest row seen from the eye
  let rawMax = -1, rawMin = 1;
  for (let k = 0; k < n; k++) {
    let t = -1;
    for (let row = 0; row < 3; row++) { const i = row * n + k, r = Math.hypot(ringEdge.positions[i * 3], ringEdge.positions[i * 3 + 2]); if (r >= 520) t = Math.max(t, (ringEdge.heights[i] - P.eyeY) / r); }
    rawMax = Math.max(rawMax, t); rawMin = Math.min(rawMin, t);
  }
  const lo = Math.min(...sky), hi = Math.max(...sky);
  assert.ok(lo >= rawMin - 1e-6 && hi <= rawMax + 1e-6, 'the envelope stays within the ring\'s own skyline');
  let jump = 0;
  for (let k = 0; k < n; k++) jump = Math.max(jump, Math.abs(sky[k] - sky[(k + 1) % n]));
  assert.ok(jump < (rawMax - rawMin) * 0.12, `the envelope is smooth round the compass (largest column step ${jump.toFixed(4)})`);
}
for (const [character, c] of Object.entries(HORIZON_PANORAMA_CHARACTERS)) {
  assert.ok(c.layers >= 0 && c.layers <= 1, `${character}: the layers' strength is a share`);
  assert.equal(c.plinth, character === 'rolling' || character === 'coastal', `${character}: the hill countries layer as ridgelines, the mountain countries scale their ranges`);
}
assert.ok(HORIZON_PANORAMA_SHADERS.height.includes('edge.a') && HORIZON_PANORAMA_SHADERS.height.includes('gPlinth'), 'the height pass reads the ring\'s skyline and writes the plinth');
// the far shore (gauntlet wave 4, Saltwind's western sea read as the world's end): a channel coast raises the land across
// the water per map; every character keeps its sea sectors open to the horizon unless the map opts in
for (const [character, c] of Object.entries(HORIZON_PANORAMA_CHARACTERS)) {
  assert.equal(c.shore, 0, `${character}: the sea sectors stay open sea by default`);
  assert.equal(c.shoreRange, 0, `${character}: and no coastal range stands in them`);
}
assert.ok(/uniform vec4 uShore;/.test(HORIZON_PANORAMA_SHADERS.height) && /uShore\.x > 0\.0/.test(HORIZON_PANORAMA_SHADERS.height), 'the height pass raises the far shore where a map asks for one');
{
  // a channel coast's far shore (the Dalmatian mainland across Saltwind's channel, 4-7 km out, a coastal range along it).
  // Saltwind itself is held at the PR head's far country (gauntlet wave 24) while its karst ridge is rebuilt
  const pano = resolveHorizonPanoramaCharacter('coastal', { regional: 'karstRidge', shore: 1.2, shoreM: 5600, shoreRange: 0.9, treeline: 0.35 });
  assert.ok(pano.shore > 1 && pano.shoreM > 4000 && pano.shoreM < 7000, 'a channel coast: the land across the water, 4-7 km out');
  assert.ok(pano.shoreRange > 0 && pano.shoreRange <= 1, 'a coastal range along the far shore (no low strip where its own relief is low)');
  assert.ok(pano.treeline < HORIZON_PANORAMA_CHARACTERS.coastal.treeline, 'the karst keeps its woods on the lower flanks');
  assert.equal(saltwind.horizon.panorama, false, 'Saltwind holds the PR head\'s far country (gauntlet waves 24 and 32) until its ridge is rebuilt');
  // the channel past the sea apron is painted water on a channel coast, so the far ridge stands on it (wave 24: "floats
  // above a flat white haze stripe"); an open sea stays the game's own
  assert.ok(/float farWater = uShore\.x > 0\.0 \? sea \* smoothstep\(/.test(HORIZON_PANORAMA_SHADERS.strip)
    && HORIZON_PANORAMA_SHADERS.strip.includes('smoothstep(0.02, 0.2, sea) * (1.0 - farWater)'), 'a channel coast\'s far reach is water, not open sky');
}
// the ring hands the bake its map's own overcast (lightModelCore resolveOvercast of its sky and cloudscape), not the light
// model the battlefield may still publish from the last map
{
  const src = readFileSync(new URL('./maps/horizon.ts', import.meta.url), 'utf8');
  assert.ok(/overcast: resolveOvercast\(/.test(src), 'the ring passes the map\'s own overcast to the bake');
  const hp = readFileSync(new URL('./horizonPanorama.ts', import.meta.url), 'utf8');
  assert.ok(hp.includes('options.overcast ?? published.overcast'), 'the bake prefers the map\'s own overcast');
}
// every uniform a pass reads is declared in that pass (a strip reading uTrees without its declaration compiled to nothing:
// the SwiftShader lab drew no panorama at all — the receipts compile no GLSL)
for (const [pass, source] of Object.entries(HORIZON_PANORAMA_SHADERS)) {
  const declared = new Set([...source.matchAll(/uniform\s+\w+\s+([^;]+);/g)].flatMap((m) => m[1].split(',').map((n) => n.trim().replace(/\[.*\]$/, ''))));
  for (const used of new Set([...source.matchAll(/\b(u[A-Z]\w*)\b/g)].map((m) => m[1]))) {
    assert.ok(declared.has(used), `the ${pass} pass declares the ${used} it reads`);
  }
}
// the strip's fill below the ring's skyline takes an ice sheet's snow (the follow-up ticket: over Whiteout's low ring the
// elevated views saw it as a band of the battlefield's ground tone)
assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('float fillSnow = uChar3.x < 0.0 ? 1.0 : 0.0;')
  && HORIZON_PANORAMA_SHADERS.strip.includes('mix(uBase, uSnow, fillSnow)'), 'the fill below the skyline takes the sheet\'s snow');
// the forest climbs a monsoon hill country's steep faces (gauntlet wave 24, Monsoon Ridge's 'ridges' "a pale, jagged desert
// rock formation"): the vegetation's slope limit is the character's, the ridges' crests round, rock only on the cliffs
{
  const ridges = resolveHorizonPanoramaCharacter('karst', { regional: 'ridges' });
  assert.ok(ridges.forestSlope >= 0.55 && ridges.rockSlope >= 0.85 && ridges.sharp <= 1.2, 'ridges: forest up the faces, rounded crests');
  assert.equal(HORIZON_PANORAMA_CHARACTERS.rolling.forestSlope, 0.32, 'a temperate hill keeps the old forest limit');
  // (and every other regional class: Orchard's forested far country stays the PR head's until its own views say otherwise)
  for (const [regional, c] of Object.entries(HORIZON_PANORAMA_REGIONAL)) {
    if (regional !== 'ridges') assert.equal(c.forestSlope, 0.32, `${regional}: the old forest limit`);
  }
  assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('smoothstep(uTrees.y, uTrees.y + 0.23, slope)'), 'the strip reads the forest\'s slope limit');
}
// --- the regional classes (gauntlet wave 15, every critic: "mountain ranges behind places that have none"): a map's
// horizon block picks its real place's far country ------------------------------------------------------------------
{
  const plain = resolveHorizonPanoramaCharacter('rolling', { regional: 'plain' });
  assert.ok(plain.ampM <= 80 && plain.layers === 0 && plain.farRise === 0 && !plain.plinth && plain.trees > 10,
    'plain: swells under 80 m, nothing lifted over the ring, the skyline its tree lines');
  const upland = resolveHorizonPanoramaCharacter('alpine', { regional: 'upland' });
  assert.ok(upland.ampM <= 300 && upland.snowline > 1 && upland.layers < 1, 'upland: rounded hills under 300 m, no snow, a half layer');
  assert.ok(resolveHorizonPanoramaCharacter('rolling', { regional: 'erg' }).trees === 0, 'erg: no trees');
  const jebel = resolveHorizonPanoramaCharacter('mesa', { regional: 'jebel' });
  assert.ok(jebel.tables && jebel.mesaTalusM < 300 && jebel.mesaCliffM > 80, 'jebel: a short apron and a sheer wall');
  assert.ok(resolveHorizonPanoramaCharacter('polar', { regional: 'iceSheet' }).peakShare > 0, 'iceSheet: nunataks through the ice');
  assert.ok(resolveHorizonPanoramaCharacter('volcanic', { regional: 'volcanicField' }).ampM < 600, 'volcanicField: no 1300 m spikes');
  assert.equal(resolveHorizonPanoramaCharacter('rolling', { regional: 'plain', ampM: 50 }).ampM, 50, 'a map overrides its class\'s knobs');
  for (const u of ['uTrees', 'uMesa', 'uPeaks']) assert.ok(HORIZON_PANORAMA_SHADERS.height.includes(u), `the height pass reads ${u}`);
  assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('texture2D(uHeight, g).b'), 'the strip colours the far field\'s trees as the forest');
  // the peaks bare (a white cone through the ice read as one more snow drift): the height pass writes each peak's
  // footprint beside its tree cover, the strip lays rock over it and holds no snow on its faces
  assert.ok(HORIZON_PANORAMA_SHADERS.height.includes('vec4(h, gPlinth, gTree, gPeak)'), 'the height pass writes the peaks\' footprint');
  assert.ok(/float peak = smoothstep\([^;]*texture2D\(uHeight, g\)\.a\)/.test(HORIZON_PANORAMA_SHADERS.strip) && HORIZON_PANORAMA_SHADERS.strip.includes('1.0 - 0.9 * peak'),
    'the strip bares the peaks: rock over their footprint, no snow on their faces');
}
assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('texture2D(uHeight, g).g'), 'the strip zones its forest and snow over the plinth');
// the shared haze law past the shell (hazeLaw.ts; the coordinator: "read it from hazeLaw rather than your own constants,
// so near and far stay consistent"): σ from the map's air, the layer's density, the aerial pass's target from the published
// sky — and the bake's own air only where no sky of this map is published
{
  const sun = [0.5, 0.6, 0.6];
  const atmosphere = { active: true, sunDir: { x: 0.5, y: 0.6, z: 0.6 }, fogDensity: 0.0009, fogMix: 0.5,
    fogTint: new THREE.Color(0.6, 0.65, 0.7), summary: { horizon: new THREE.Color(0.7, 0.8, 0.95), sunHorizon: new THREE.Color(1.0, 0.95, 0.85) } };
  const haze = horizonPanoramaHaze(atmosphere, sun, 0.00074, 0);
  assert.ok(haze && Math.abs(haze.sigma - hazeSigma(0.00074)) < 1e-12, 'the bake takes the map\'s own σ');
  assert.ok(haze.toward.x > haze.anti.x && haze.anti.z > haze.anti.x, 'the target: the sky at the horizon, warm toward the sun, cool away from it');
  assert.ok(haze.anti.y < 0.8, 'a step under the sky (a range never pales past it)');
  assert.equal(horizonPanoramaHaze(null, sun, 0.00074), null, 'no published sky: the bake\'s own air');
  // under a closed deck the target is the authored tint at the deck's level, never the clear sky's warm horizon (the pair
  // ticket of 5ea057f45: Whiteout's far ice sheet baked beige under a stale light model's overcast 0)
  const deck = horizonPanoramaHaze(atmosphere, sun, 0.00074, 1);
  assert.ok(deck.toward.x / deck.toward.z < haze.toward.x / haze.toward.z && deck.anti.y < haze.anti.y, 'a closed deck: the tint, dimmer, no warm band');
  assert.equal(horizonPanoramaHaze({ ...atmosphere, sunDir: { x: -0.5, y: 0.6, z: 0.6 } }, sun, 0.00074), null, 'another map\'s or hour\'s sky: the bake\'s own air');
  // a bake waits (a couple of seconds of frames) while the battlefield still publishes another map's sky (the shots' flow
  // baked every map after the first before its own sky was applied), and bakes at once where no sky is published
  const source = readFileSync(new URL('./horizonPanorama.ts', import.meta.url), 'utf8');
  assert.ok(/if \(skyWaits < HORIZON_PANORAMA_SKY_WAIT_FRAMES && publishedSkyPending\(\)\) \{ skyWaits\+\+; return false; \}/.test(source)
    && /return !!atmosphere\?\.active && !horizonPanoramaHaze\(/.test(source), 'the bake waits for this map\'s published sky, and only where one is published');
  // the ice sheet is white to its lowest swale: its own snowline under every height, the ring's not imposed (Whiteout's
  // horizon stood as a band of the battlefield's ground tone under the ring's snowline)
  assert.ok(resolveHorizonPanoramaCharacter('polar', { regional: 'iceSheet' }).snowline < 0
    && source.includes('options.snowlineM != null && ch.snowline >= 0 ? options.snowlineM / ch.ampM : ch.snowline'), 'the ice sheet keeps its own snowline');
  assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('hazeTransmittance(uHaze.x, max(0.0, rr - uFrame.z), layer, uHazeChroma)')
    && HORIZON_PANORAMA_SHADERS.strip.includes('hazeLayerMean('), 'the strip hazes the path past the shell by the shared law');
}
// the atlas is premultiplied (paired capture d6: a dark dotted outline on every skyline, the shell's filtered samples
// averaging the land with the sky texels' black)
assert.ok(/gl_FragColor = vec4\(pow\([^;]*\) \* alpha, alpha\);/.test(HORIZON_PANORAMA_SHADERS.strip), 'the strip writes premultiplied colour');

// --- the far country's deck (gauntlet wave 6: over Verdant's and Frontier Basin's scattered cumulus the far crests were
// capped and faded at the default 1400 m deck): a closed cloudscape keeps the deck, scattered clouds leave the summits
// standing among them, a map without a cloudscape keeps the round-72 deck ----------------------------------------------
assert.equal(horizonPanoramaDeckM({ clouds: { regime: 'fair-weather-cumulus' } }, 1400), 2600, 'scattered cumulus: the far summits stand among the clouds');
assert.equal(horizonPanoramaDeckM({ clouds: { regime: 'cumulus-humilis', coverage: 0.14 } }, 900), 2600, 'an authored low cover lifts the deck too');
assert.equal(horizonPanoramaDeckM({ clouds: { regime: 'stratocumulus-deck' } }, 320), 320, 'a closed deck keeps the far country under it');
assert.equal(horizonPanoramaDeckM({ clouds: { regime: 'fair-weather-cumulus', coverage: 0.8 } }, 1400), 1400, 'an authored cover past 0.6 is a deck');
assert.equal(horizonPanoramaDeckM({}, 1400), 1400, 'no cloudscape: the round-72 deck');
// the tablelands: eroded, stepped mesas (a talus apron and a caprock cliff by the rim distance), their tops clearing the
// ring's skyline or staying behind it (no sliver)
assert.ok(HORIZON_PANORAMA_SHADERS.height.includes('mesaRamp(s1, uMesa.x, uMesa.z)') && HORIZON_PANORAMA_SHADERS.height.includes('mesaRamp(s1 - inset'),
  'the height pass shapes each table by its rim distance: a talus apron, a cliff, an inset upper tier');
assert.deepEqual([HORIZON_PANORAMA_CHARACTERS.mesa.mesaTalusM, HORIZON_PANORAMA_CHARACTERS.mesa.mesaCliffM], [700, 50], 'the eroded mesas: a broad apron and a short cliff');
assert.ok(/uChar2\.z > 0\.5 \? mix\(-0\.03, 0\.06/.test(HORIZON_PANORAMA_SHADERS.height), 'a table\'s top clears the ring\'s skyline or stays behind it');
// the land falls away within ~12 degrees of any sea sector (Nordhavn Fjord's headland between two openings stood as a
// monolith in the water), and a far shore fades at the sector's flanks
assert.ok(HORIZON_PANORAMA_SHADERS.height.includes('nearSea') && HORIZON_PANORAMA_SHADERS.height.includes('fract(a0 - 0.034)'),
  'the far land tapers by its nearness to a sea sector, either side');
assert.ok(HORIZON_PANORAMA_SHADERS.height.includes('smoothstep(0.0, 0.6, sink)'), 'the far shore stands well inside the sector only');

// --- the shaders: the passes read the uniforms the baker binds -------------------------------------------------------
for (const [name, source] of Object.entries(HORIZON_PANORAMA_SHADERS)) {
  if (name === 'vertex') continue;
  assert.ok(/void main\(\)/.test(source), `${name}: a fragment program`);
}
for (const u of ['uChar0', 'uChar1', 'uChar2', 'uFrame', 'uEdge', 'uOff0']) assert.ok(HORIZON_PANORAMA_SHADERS.height.includes(u), `the height pass reads ${u}`);
for (const u of ['uHeight', 'uSun', 'uGrid']) assert.ok(HORIZON_PANORAMA_SHADERS.light.includes(u), `the light pass reads ${u}`);
for (const u of ['uHeight', 'uLight', 'uElev', 'uFog', 'uRock', 'uSnow', 'uForest']) assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes(u), `the strip pass reads ${u}`);

// --- the baker's contract with the renderer ----------------------------------------------------------------------------
function recordingRenderer({ webgl2 = true, maxTextureSize = 16384, floatTargets = true } = {}) {
  const calls = [];
  let target = null, autoClear = true, clearAlpha = 1;
  const clearColor = new THREE.Color(0.2, 0.3, 0.4);
  return {
    calls,
    capabilities: { isWebGL2: webgl2, maxTextureSize },
    extensions: { has: (name) => floatTargets && (name === 'EXT_color_buffer_float' || name === 'EXT_color_buffer_half_float') },
    getRenderTarget: () => target,
    setRenderTarget: (t) => { target = t; calls.push(['target', t ? `${t.width}x${t.height}` : null]); },
    render: (scene, camera) => { calls.push(['render', target ? `${target.width}x${target.height}` : null, scene.children[0]?.material?.type]); },
    get autoClear() { return autoClear; }, set autoClear(v) { autoClear = v; },
    getClearColor: (out) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (c, a) => { clearColor.copy(c); clearAlpha = a; },
    clear: () => calls.push(['clear']),
    state: () => ({ target, autoClear, clearAlpha, clearColor: clearColor.getHex() }),
  };
}
const palette = { base: new THREE.Color(0x5b6c4c), rock: new THREE.Color(0x66625e), snow: new THREE.Color(0xeef2f7), forest: new THREE.Color(0x435f3a), fog: new THREE.Color(0x8fa3bd) };
const options = { seed: 1337, character: 'alpine', palette, sun: [0.5, 0.6, 0.6], gains: { ambient: 0.5, sunGain: 1.3 }, deckBaseM: 1900, seaOpenings: [], ringEdge };
{
  const fallback = new THREE.Object3D();
  const handle = createHorizonPanorama(options, fallback);
  assert.equal(handle.mesh.visible, false, 'the shell waits for its atlas');
  assert.equal(handle.ensureBaked(null), false, 'no renderer, no bake (the receipts, the headless audits)');
  assert.equal(fallback.visible, true, 'the round-72 far range stays on meanwhile');
  for (const [stub, why] of [[recordingRenderer({ webgl2: false }), 'webgl1'], [recordingRenderer({ maxTextureSize: 4096 }), 'max texture size'], [recordingRenderer({ floatTargets: false }), 'no float render targets']]) {
    assert.equal(handle.ensureBaked(stub), false, `${why}: no bake`);
    assert.equal(handle.stats.unsupported, why, `${why}: recorded for the probes`);
    assert.equal(stub.calls.length, 0, `${why}: the renderer untouched`);
    assert.equal(fallback.visible, true, `${why}: the fallback stays`);
  }
  // the battlefield's own ground and rock means colour the far country when they come before the bake
  assert.equal(handle.stats.tone, 'authored', 'the authored palette until the ground tone arrives');
  assert.equal(handle.setGroundTone(new THREE.Color(0.31, 0.27, 0.2), null), true, 'the ground tone is taken before the bake');
  assert.equal(handle.stats.tone, 'ground', 'and recorded for the probes');
  const renderer = recordingRenderer();
  const before = renderer.state();
  assert.equal(handle.ensureBaked(renderer), true, 'a capable renderer bakes');
  assert.equal(handle.setGroundTone(new THREE.Color(0.5, 0.5, 0.5), null), false, 'a tone after the bake is not taken (a re-bake would hitch a frame)');
  const renders = renderer.calls.filter((c) => c[0] === 'render');
  assert.deepEqual(renders.map((c) => c[1]), [`${P.gridA}x${P.gridR}`, `${P.gridA}x${P.gridR}`, `${P.width}x${P.height}`], 'three passes: the heights, their light, the strip');
  assert.deepEqual(renderer.state(), before, 'the renderer\'s target, clear colour and alpha and auto-clear are restored');
  assert.equal(handle.mesh.visible, true, 'the shell shows once baked');
  assert.equal(fallback.visible, false, 'and takes the round-72 far range\'s place: one far draw');
  assert.ok(handle.mesh.material.map?.isTexture, 'the atlas is the shell\'s map (resource tracking sees it)');
  assert.equal(handle.ensureBaked(renderer), true, 'baked: a no-op');
  assert.equal(renderer.calls.filter((c) => c[0] === 'render').length, 3, 'no second bake while the atlas lives');
  // a GPU suspension disposes the atlas texture: the fallback comes back and the next request bakes again
  handle.mesh.material.map.dispose();
  assert.equal(handle.baked, false, 'a disposed atlas is not baked');
  assert.equal(handle.mesh.visible, false, 'the shell hides with its atlas gone');
  assert.equal(fallback.visible, true, 'the round-72 far range is back');
  assert.equal(handle.ensureBaked(renderer), true, 'and the next request bakes again');
  assert.equal(handle.stats.bakes, 2, 'twice in all');
  handle.dispose();
}

console.log('horizonPanorama.selftest: the shell, its atlas mapping, the far vocabulary, the passes and the bake contract PASS');
