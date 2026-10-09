// The far horizon panorama (the mountains lane, 2026-10-03; horizonPanorama.ts): the shell's geometry and its atlas
// mapping, the bake's contract with the renderer (three passes, the renderer's state restored, the fallback far range
// handed over and taken back on a GPU suspension, no bake without a capable renderer), the shaders' uniforms, and the
// horizon's wiring (one of the two far meshes visible at a time, lookups by name still find the round-72 range).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  HORIZON_PANORAMA, HORIZON_PANORAMA_CHARACTERS, HORIZON_PANORAMA_REGIONAL, HORIZON_PANORAMA_SHADERS, buildHorizonPanoramaShellGeometry, horizonPanoramaHaze,
  horizonJebelSection, HORIZON_JEBEL_CAP_DROP,
  createHorizonPanorama, horizonPanoramaUv, horizonRingSkylineTan, resolveHorizonPanoramaCharacter,
} from './horizonPanorama.ts';
import { HORIZON_FAR_ROWS } from './horizonFarRange.ts';
import saltwind from './maps/saltwind.ts';
import { horizonPanoramaDeckM } from './maps/horizon.ts';
import { HORIZON_RELIEF_CHARACTERS } from './horizonRelief.ts';
import { inselbergSection } from './landformGeology.ts';
import { CLOUD_FOGBANK_RANGE_M } from '../engine/cloudWeatherLayers.ts';
import { hazeSigma } from '../engine/hazeLaw.ts';
import { authoredSunOf, loadGroundedLightModel, resolveLightModel } from '../engine/lightModelCore.ts';
import { skyPresetToAtmosphere, sunDirectionOf } from '../engine/atmosphere.ts';
import { battleTimePreset } from '../engine/battleAtmosphereRuntime.ts';

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
    // the ground rows (the edge and the apron) carry v = 1, the wall's 0: the apron is ground and never reads sky
    for (let row = 0; row < rows; row++) {
      assert.equal(uv.getY(row * stride + k), row <= P.apronM.length ? 1 : 0, `row ${row}: ${row <= P.apronM.length ? 'ground' : 'wall'}`);
    }
  }
  geometry.dispose();
}
// --- over its column's skyline the shell is ground for a camera where the land goes on (the mountains lane, 2026-10-04):
// the apron (the ring's outer edge stands above the bake eye's horizon, +0.76 to +2.54 degrees, where a low far country's
// atlas is sky; discarded, it let the sky dome through between the ring and the shell, Whiteout's bird view) and the far
// earth (gauntlet waves 53-54's bird views, "the world simply ends ... a ruler-straight hard top edge": the sky dome under
// the camera's own horizontal). Both take the column's skyline (a bake pass: its highest opaque texel), the far earth
// hazed by the map's law toward its target; a hole under the skyline stays open, and so does the wall's sky for any
// camera whose ray to it points above its own horizontal (the ground and tank-height views)
{
  const handle = createHorizonPanorama({ ringEdge, sun: [0.3, 0.6, 0.2], gains: { ambient: 0.8, sunGain: 1.4 }, fogDensity: 0.0003 });
  const material = handle.mesh.material;
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
  material.onBeforeCompile(shader);
  const frag = shader.fragmentShader;
  assert.ok(shader.vertexShader.includes('vPanoApron = uv.y;'), 'the vertex passes the ground rows on');
  for (const name of ['uPanoSkyline', 'uPanoHaze', 'uPanoHazeAnti', 'uPanoHazeToward', 'uPanoSunH', 'uPanoHazeChroma']) {
    assert.ok(name in shader.uniforms && new RegExp(`uniform [^;]*\\b${name}\\b`).test(frag), `the shell declares and binds ${name}`);
  }
  assert.ok(frag.includes('if (skyline.a < 0.0 || panoUv.y <= skyline.a) discard;'), 'a hole under the skyline, or a column with no land, stays open');
  assert.ok(frag.includes('bool apron = vPanoApron > 0.5 && e > 0.0;') && frag.includes('if (vd.y >= 0.0 || !(apron || uPanoHaze.w > 0.5)) discard;'),
    'only a ray under the camera\'s own horizontal takes ground (the apron over the eye\'s horizon, else the far earth under the law); a camera looking up at the shell\'s sky sees it open');
  assert.ok(frag.includes('vec3 T = hazeTransmittance(uPanoHaze.x, reach, layer, uPanoHazeChroma);')
    && frag.includes('inScatter = max((screen - aerialT * (1.0 - Tp)) / max(Tp, vec3(0.05)), vec3(0.0));')
    && frag.includes('ground = ground * T + inScatter * (1.0 - T);'),
    'the far earth takes the map\'s law over its reach, into the colour the aerial pass turns into the screen\'s own horizon');
  // the screen's horizon: the dome as sky.ts draws it (its own lookup, greyed by the deck — the dome's greying on the
  // dome's uniforms, horizonPanoramaDeck.selftest.mjs — the knee, the intensity), toward the aerial pass's target as the
  // deck closes; the aerial pass's target and transmittance as post.ts lays them
  assert.ok(frag.includes('vec3 skyT = atmoSkyVisible(normalize(vec3(rd.x, max(rd.y, 0.02), rd.z)));')
    && frag.includes('vec3 domeSky = atmoKnee(panoDeckGrey(atmoSky(hdir), hdir)) * uAtmoIntensity;')
    && frag.includes('vec3 screen = mix(domeSky, aerialT, smoothstep(0.3, 0.8, uPanoTerms.z));')
    && frag.includes('if (inFrame > 0.0) screen = mix(screen, panoCloudOver(domeSky, vec2(clamp(cuv.x, 0.0, 1.0), cuv.y), hdir), inFrame);'),
    'the screen\'s horizon is the dome\'s own lookup under the cloud layer\'s composite (horizonPanoramaClouds.selftest.mjs), the aerial pass\'s own target where no cloud layer is read');
  for (const name of ['tAtmoSky', 'uAtmoSun', 'uAtmoViewH', 'uAtmoKnee', 'uAtmoIntensity', 'uPanoTint', 'uPanoTerms', 'uPanoDatum', 'uPanoSkyOn', 'uPanoSigmaPost',
    'uDeckHorizon', 'uDeckClosed', 'tClouds', 'uHistorySize', 'uKnee', 'uSkyIntensity', 'uFlash', 'uFlashTint', 'uSunDir', 'uInside', 'uPanoCloudOn', 'uPanoViewProj']) {
    assert.ok(name in shader.uniforms, `the shell binds ${name}`);
  }
  // per draw, read-only from the published atmosphere: no live sky (the receipts, the labs without one, the mobile tier's
  // Preetham dome) leaves the far earth on the bake's law target
  const air = handle.mesh.userData.panoAir;
  handle.mesh.onBeforeRender(null, { userData: {} }, { position: new THREE.Vector3(0, 300, 0) });
  assert.equal(air.uPanoSkyOn.value, 0, 'no published sky: the bake\'s own target');
  const skyline = HORIZON_PANORAMA_SHADERS.skyline;
  assert.ok(skyline && skyline.includes('if (c.a >= 0.5) { found = vec4(c.rgb / c.a, v); break; }') && skyline.includes('vec4 found = vec4(0.0, 0.0, 0.0, -1.0);'),
    'the skyline pass: per column the highest opaque texel, out of the premultiplication, or -1 where no land');
  assert.ok(HORIZON_PANORAMA_SHADERS.skylineBlur?.includes('for (int k = -64; k <= 64; k++)') && HORIZON_PANORAMA_SHADERS.skylineBlur.includes('if (c.a >= 0.0) { sum += c.rgb; n += 1.0; }')
    && HORIZON_PANORAMA_SHADERS.skylineBlur.includes('float stride = vUv.y < 0.5 ? 1.0 : 16.0;'),
    'its colour averaged among the columns with land, over 2.8 degrees either side and over 45 degrees, so no column stands as a bar');
  assert.ok(frag.includes('ground = mix(ground, wide, smoothstep(0.0, 0.0087, e - mix(uPanoElev.x, uPanoElev.y, skyline.a)));'),
    'the far earth\'s land is the wide average half a degree over the skyline, so no column\'s colour stands as a bar up to the horizon');
  const src = readFileSync(new URL('./horizonPanorama.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('air.uPanoHaze.value.set(haze.sigma * ch.air, haze.invScale, hazeDatumM, 1);'), 'the bake hands the shell the far path\'s σ (the map\'s air share), the layer and the datum');
  assert.ok(src.includes('air.uPanoHaze.value.set(0, 0, 0, 0);'), 'no law (its own air): no far earth');
  assert.ok(src.includes('air.uPanoSigmaPost.value = haze.sigma;') && src.includes('air.uAtmoKnee.value.copy(atmosphere.knee!);')
    && src.includes('air.uPanoDatum.value = Number.isFinite(ground) ? ground : hazeDatumM;'),
    'the shell takes the aerial pass\'s σ, the dome\'s lookup each draw, and the ground under the camera as the datum');
  handle.dispose();
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
  // Saltwind's own (gauntlet wave 32: "a nearly shadeless silhouette at almost the sky's value", "a second range rests on
  // a uniform bright haze stripe, lighter than the range above it", "a flat, nearly textureless white cutout"): clean
  // Adriatic air, the lowland's own fill, the maquis up the gullies and bare limestone only on the upper faces, a channel
  // under 5 km
  const salt = resolveHorizonPanoramaCharacter('rolling', saltwind.horizon.panorama);
  assert.ok(salt.shore > 1 && salt.shoreRange > 0 && salt.shoreM <= 5000, 'Saltwind: the mainland across a channel under 5 km');
  assert.ok(salt.air < 0.5 && salt.fillLaw === 1, 'Saltwind: clean air, the band under the ridge the lowland\'s own cover');
  assert.ok(salt.scrub > 0.5 && salt.rockFloor > 0.3 && salt.treeline > salt.rockFloor, 'Saltwind: maquis up the lower slopes, bare limestone above');
  assert.equal(salt.ownRock, 1, 'Saltwind: its far limestone the authored pale rock, not the battlefield\'s dark brown');
  // the channel past the sea apron is painted water on a channel coast, so the far ridge stands on it (wave 24: "floats
  // above a flat white haze stripe"); an open sea stays the game's own
  assert.ok(/float farWater = uShore\.x > 0\.0 \? sea \* smoothstep\(/.test(HORIZON_PANORAMA_SHADERS.strip)
    && HORIZON_PANORAMA_SHADERS.strip.includes('smoothstep(0.02, 0.2, sea) * (1.0 - farWater)'), 'a channel coast\'s far reach is water, not open sky');
}
// the jebel section (maps lane A's inselbergSection with a rim, ported): the JS mirror is continuous at the cap's rim
// and the wall's foot, falls monotonically from the crown to the plain, and its GLSL twin carries the same constants
{
  const foot = 0.66, rim = 0.86, apron = 0.18, top = foot * rim;
  assert.equal(horizonJebelSection(0, foot, apron, rim), 1, 'the crown stands at the full height');
  assert.ok(Math.abs(horizonJebelSection(top - 1e-6, foot, apron, rim) - horizonJebelSection(top + 1e-6, foot, apron, rim)) < 1e-4, 'continuous at the cap\'s rim');
  assert.ok(Math.abs(horizonJebelSection(foot - 1e-6, foot, apron, rim) - horizonJebelSection(foot + 1e-6, foot, apron, rim)) < 1e-4, 'continuous at the wall\'s foot');
  assert.ok(Math.abs(horizonJebelSection(foot, foot, apron, rim) - apron) < 1e-9 && horizonJebelSection(1, foot, apron, rim) === 0, 'the apron at the foot, the plain at the toe');
  let last = 2;
  for (let i = 0; i <= 100; i++) { const v = horizonJebelSection(i / 100, foot, apron, rim); assert.ok(v <= last + 1e-12, 'it never rises toward the plain'); last = v; }
  // a sheer wall: most of the height falls within the wall's band (from the rim to the foot)
  assert.ok(horizonJebelSection(top, foot, apron, rim) - horizonJebelSection(foot, foot, apron, rim) > 0.6, 'the wall carries most of the height');
  const glsl = HORIZON_PANORAMA_SHADERS.height;
  assert.ok(glsl.includes(`1.0 - ${HORIZON_JEBEL_CAP_DROP.toFixed(4)} * (q / top) * (q / top)`) && glsl.includes(`(${(1 - HORIZON_JEBEL_CAP_DROP).toFixed(4)} - apron)`),
    'the bake\'s section is the mirror\'s law');
  assert.ok(/if \(uJebel\.x > 0\.0\) rockW = max\(rockW, smoothstep\(0\.3, 0\.7, texture2D\(uHeight, g\)\.a\)\);/.test(HORIZON_PANORAMA_SHADERS.strip),
    'the strip bares a jebel\'s whole footprint');
  // the far jebels' section is maps lane A's inselbergSection with a rim (landformGeology.ts), so near and far rock keep one
  // form: sampled at fixed radii across the walls' spread of feet, aprons and rims on Redrock's bearings (the main
  // massifs' rim 0.86, the lobes' 0.84, the foot wandering 12-14 % and the flutes setting the wall back), within 1e-9
  let worst = 0;
  for (const [f, a, r] of [[0.66, 0.18, 0.86], [0.66 * 0.86, 0.12, 0.86], [0.66 * 1.14, 0.24, 0.86], [0.6, 0.16, 0.84], [0.5, 0.05, 0.84], [0.74, 0.27, 0.88]]) {
    for (let i = 0; i <= 400; i++) worst = Math.max(worst, Math.abs(horizonJebelSection(i / 400, f, a, r) - inselbergSection(i / 400, f, a, 4, r)));
  }
  assert.ok(worst <= 1e-9, `the far jebel's section is the battlefield's inselberg section (worst ${worst})`);
  // desert varnish down the walls (the edge-e pair of e8350e7bb: one smooth pale slab where the PR head's far range had
  // streaked mesas): streaks in the tree-cover channel of a treeless jebel country, darkening the rock, never painting forest
  const strip = HORIZON_PANORAMA_SHADERS.strip, heightPass = HORIZON_PANORAMA_SHADERS.height;
  assert.ok(heightPass.includes('gTree = max(gTree, gVarnish);') && heightPass.includes('gVarnish = gJebelVarnish * uJebel3.z;'), 'the jebels write their varnish after the tree cover');
  assert.ok(strip.includes('uJebel.x > 0.0 ? 0.0 : texture2D(uHeight, g).b') && strip.includes('if (uJebel.x > 0.0) col *= 1.0 - texture2D(uHeight, g).b;'),
    'a jebel country darkens its rock by the channel and paints no forest from it');
  for (const [name, c] of [...Object.entries(HORIZON_PANORAMA_CHARACTERS), ...Object.entries(HORIZON_PANORAMA_REGIONAL)]) {
    if (name !== 'jebel') assert.equal(c.jebelVarnish, 0, `${name}: no varnish`);
  }
  const jv = resolveHorizonPanoramaCharacter('mesa', { regional: 'jebel' });
  assert.ok(jv.jebelVarnish > 0 && jv.jebelBossM >= 60 && jv.jebelRadiusM <= 800, 'jebel: several bossed, varnished massifs rather than one wide slab');
}
// the far jebels v3 (gauntlet wave 50: "flat-coloured, pale-pink, near-rectangular blocks with dead-flat tops", the walls
// "one even pale tone with no lit or shaded faces"): the strip takes a wall's normal from the massif's own law at 4 m (the
// grid's rows lie ~35 m apart at 5 km and smoothed a sheer wall into a slope the sun lit from every side), paints Wadi
// Rum's sandstone on it (dark walls under pale domes, bedded, split by vertical joints), and no massif stands in the near
// band, whose forms are pressed under the ring's skyline (the dead-flat tops)
{
  const strip = HORIZON_PANORAMA_SHADERS.strip, heightPass = HORIZON_PANORAMA_SHADERS.height;
  assert.ok(strip.includes('float jebelField(vec2 p)') && heightPass.includes('float jebelField(vec2 p)'), 'one jebel law in the height pass and the strip');
  assert.ok(strip.includes('jebelField(wp.xz + vec2(e4, 0.0))') && strip.includes('jebelField(wp.xz + vec2(0.0, e4))')
    && /n = normalize\(mix\(n, normalize\(vec3\(-\(hx - h0\) \/ e4, 1\.0, -\(hz - h0\) \/ e4\)\), gJebelW\)\);/.test(strip),
    'the strip takes a jebel wall\'s normal from its law at 4 m');
  assert.ok(strip.includes('vec3 stone = mix(lower, upper, contact)') && strip.includes('float cleft = ') && strip.includes('float plane = '),
    'Wadi Rum\'s sandstone: the dark walls under the pale domes, the bedding planes, the joints\' clefts');
  // (v3b, the pair of 8248ca70b: the massifs kept past 5 km stood as small pale boxes and the PR head's nearer far country
  // went with them) — no massif's near edge inside its class's limit, and the massifs join the field after the near band's
  // press, so a massif from 3 km keeps its bossed top
  assert.ok(heightPass.includes('if (length(centre) - rad * el < uJebel3.w) continue;'), 'no massif\'s near edge nearer than its class\'s limit');
  const pressAt = heightPass.indexOf('if (h > nearCap) h = mix(h, nearCap + (h - nearCap) * 0.15, nearW);'), joinAt = heightPass.indexOf('h += hJebel;');
  assert.ok(pressAt > 0 && joinAt > pressAt, 'the massifs stand whole: their heights join after the near band\'s press');
  for (const [name, c] of [...Object.entries(HORIZON_PANORAMA_CHARACTERS), ...Object.entries(HORIZON_PANORAMA_REGIONAL)]) {
    if (name !== 'jebel') assert.equal(c.jebelNearM, 0, `${name}: no near limit`);
  }
  const jv = resolveHorizonPanoramaCharacter('mesa', { regional: 'jebel' });
  assert.ok(jv.jebelNearM >= HORIZON_PANORAMA.shellM && jv.jebelNearM <= 3500 && jv.jebelM >= 600,
    'jebel: the massifs from about 3 km, past the shell, tall enough to stand over the ring');
  const redrock = readFileSync(new URL('./maps/badlands.ts', import.meta.url), 'utf8');
  // (the Redrock lane, round 9: the far massifs' own knobs may follow — fewer, domed, more deeply varnished)
  assert.ok(/panorama: \{ regional: 'jebel', air: 0\.\d+, fillLaw: 1[ ,}]/.test(redrock),
    'Redrock\'s far air thinner than the law\'s σ (desert air is clear), the band under the massifs the plain\'s own sand');
  // v3b: Wadi Rum's tones from the plain's own sand (the pair of 8248ca70b: "pale grey-white castles", the domes brighter
  // than the sky above them) — the varnished walls about a third of the sand's albedo, redder-brown; the pale Disi only
  // on the domes and the rim, buff, near the sand; the walls never painted over with the fill a high camera sees
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const sand = [0.4225, 0.1854, 0.0648]; // Redrock's battlefield ground mean (setGroundTone; the pair's census)
  const lower = /vec3 lower = uBase \* vec3\(([\d.]+), ([\d.]+), ([\d.]+)\);/.exec(strip);
  assert.ok(lower, 'the walls are the plain\'s sand, varnished');
  const wallShare = lum(sand.map((v, i) => v * Number(lower[i + 1]))) / lum(sand);
  assert.ok(wallShare >= 0.25 && wallShare <= 0.35, `the varnished walls ${(wallShare * 100).toFixed(0)} % of the sand's albedo`);
  const cap = /vec3 upper = mix\(uBase, vec3\(dot\(uBase, vec3\(0\.2126, 0\.7152, 0\.0722\)\)\), ([\d.]+)\) \* ([\d.]+);/.exec(strip);
  assert.ok(cap && Number(cap[2]) >= 1 && Number(cap[2]) <= 1.25 && Number(cap[1]) <= 0.4, 'the Disi cap buff: near the sand, a touch paler and less saturated');
  const contact = /float contact = smoothstep\(([\d.]+), ([\d.]+), rel/.exec(strip);
  assert.ok(contact && Number(contact[1]) >= 0.75, 'the contact high on the massif: the pale cap only on the domes and the rim');
  assert.ok(strip.includes('col = mix(col, fill, hiddenW * 0.95 * (1.0 - gJebelW));'), 'the fill a high camera sees never paints over a massif\'s wall');
  assert.ok(strip.includes('float wooded = uTrees.z > 0.0 || uChar3.y >= 0.35 ? 1.0 : 0.0;'), 'a bare country\'s fill is its own ground, no woods');
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
// the dry coast's knobs rest at no effect on every class (only a map's block sets them): the law's full σ on the far
// path, the old fill, rock on every steep face, no scrub
for (const [name, c] of [...Object.entries(HORIZON_PANORAMA_CHARACTERS), ...Object.entries(HORIZON_PANORAMA_REGIONAL)]) {
  assert.ok(c.air === 1 && c.fillLaw === 0 && c.rockFloor < 0 && c.scrub === 0 && c.ownRock === 0, `${name}: the dry coast's knobs at rest`);
}
{
  const strip = HORIZON_PANORAMA_SHADERS.strip, height = HORIZON_PANORAMA_SHADERS.height;
  assert.ok(strip.includes('hazeTransmittance(uHaze.x * uAir.x, max(0.0, rr - uFrame.z), layer, uHazeChroma)'), 'the far path takes the map\'s share of the law\'s σ');
  assert.ok(/if \(uAir\.y > 0\.5\) \{[\s\S]*?if \(uHaze\.w > 0\.5\) \{[\s\S]*?fill = cover \* TF \+ lawTarget \* \(1\.0 - TF\);[\s\S]*?fill = mix\(cover, uFog \* 0\.95, 1\.0 - exp\(-800\.0 \* recede \/ 13000\.0\)\);/.test(strip),
    'the fill law: the lowland\'s own cover under the air of its own reach (the law\'s with a published sky, the bake\'s own without)');
  assert.ok(height.includes('if (uTrees.z > 0.0) gTree = max(gTree, uTrees.z * gGully);'), 'the scrub holds the gullies (the grid\'s tree cover)');
  assert.ok(strip.includes('smoothstep(uAir.z - 0.12, uAir.z + 0.12, hT + 0.05 * n1 - climb)'), 'bare rock above its floor, the floor climbing with the scrub');
  assert.ok(strip.includes('float fallStreak(vec2 xz)') && strip.includes('float streak = uTrees.z > 0.0 ? smoothstep(-0.2, 0.6, fallStreak(wp.xz)) : 0.0;'),
    'the scrub\'s edge follows each hillside\'s own fall line, only on a dry coast');
  // (toward the far shore the channel is darker, never haze-bright)
  assert.ok(strip.includes('uFog * vec3(0.55, 0.62, 0.66) * (1.0 - 0.45 * shoreAhead)'), 'the channel darkens toward the far shore');
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
  assert.ok(!jebel.tables && jebel.jebelShare > 0 && jebel.jebelRim >= 0.8 && jebel.jebelApron <= 0.25 && jebel.jebelFlutes >= 8,
    'jebel: sheer fluted massifs alone on a sand plain (gauntlet wave 24: the tables read as "low rounded swells")');
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
  assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('hazeTransmittance(uHaze.x * uAir.x, max(0.0, rr - uFrame.z), layer, uHazeChroma)')
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
  assert.deepEqual(renders.map((c) => c[1]), [`${P.gridA}x${P.gridR}`, `${P.gridA}x${P.gridR}`, `${P.width}x${P.height}`, `${P.width}x1`, `${P.width}x2`],
    'five passes: the heights, their light, the strip, its skyline per column and that skyline\'s colour averaged round the compass (near and wide)');
  assert.deepEqual(renderer.state(), before, 'the renderer\'s target, clear colour and alpha and auto-clear are restored');
  assert.equal(handle.mesh.visible, true, 'the shell shows once baked');
  assert.equal(fallback.visible, false, 'and takes the round-72 far range\'s place: one far draw');
  assert.ok(handle.mesh.material.map?.isTexture, 'the atlas is the shell\'s map (resource tracking sees it)');
  assert.equal(handle.ensureBaked(renderer), true, 'baked: a no-op');
  assert.equal(renderer.calls.filter((c) => c[0] === 'render').length, 5, 'no second bake while the atlas lives');
  // a GPU suspension disposes the atlas texture: the fallback comes back and the next request bakes again
  handle.mesh.material.map.dispose();
  assert.equal(handle.baked, false, 'a disposed atlas is not baked');
  assert.equal(handle.mesh.visible, false, 'the shell hides with its atlas gone');
  assert.equal(fallback.visible, true, 'the round-72 far range is back');
  assert.equal(handle.ensureBaked(renderer), true, 'and the next request bakes again');
  assert.equal(handle.stats.bakes, 2, 'twice in all');
  handle.dispose();
}

// --- 2026-10-08 (the nightsky lane): relight — the far country re-baked under the light the battlefield publishes -----
// (the battle atmosphere calls it right after it applies a time of day, inside its covered prepare). The first bake under
// this map's own day sky keeps that sky as the day reference; the day light is the identity (no re-bake: the authored bake
// stands); another light re-bakes once, with that light's key direction and the scales the strip reads; the same light
// twice is a no-op; back to the day re-bakes the authored bake; without a renderer, a preset or the grounded light it
// refuses (the battle atmosphere then keeps the night dim).
{
  await loadGroundedLightModel();
  const lightPreset = { sunElevationDeg: 32, sunAzimuthDeg: 115, sunIntensity: 4.5, skyIntensity: 1, turbidity: 4, rayleigh: 1.2,
    mieCoefficient: 0.006, mieDirectionalG: 0.82 };
  const daySun = sunDirectionOf(32, 115);
  const scene = new THREE.Scene();
  const publish = (preset, irr, horizon, sunHorizon) => {
    const params = skyPresetToAtmosphere(preset);
    scene.userData.atmosphere = {
      active: true, skyView: null, sunDir: new THREE.Vector3(...params.sunDir), params, skyIntensity: preset.skyIntensity ?? 1,
      irradianceRaw: new THREE.Color(...irr), fogTint: new THREE.Color(0x7e97b8), fogMix: 0.55, fogDensity: 0.00074,
      summary: { horizon: new THREE.Color(...horizon), sunHorizon: new THREE.Color(...sunHorizon) },
    };
    scene.userData.lightModel = resolveLightModel(preset, params, { irradianceRaw: irr }, authoredSunOf(preset), false);
  };
  // a strip pass's light uniforms, as the renderer is handed them
  const seen = [];
  const renderer = recordingRenderer();
  const render = renderer.render;
  renderer.render = (s2, c2) => {
    const u = s2.children[0]?.material?.uniforms;
    if (u?.uSunScale && u.uLight) seen.push({ sun: u.uSun.value.toArray(), sunScale: u.uSunScale.value.toArray(), skyScale: u.uSkyScale.value.toArray(),
      bounceScale: u.uBounceScale.value.toArray(), fog: u.uFog.value.toArray(), haze: u.uHaze.value.w });
    render(s2, c2);
  };
  const handle = createHorizonPanorama({ ...options, sun: daySun, lightPreset }, null);
  scene.add(handle.mesh);
  assert.equal(handle.relight(null), false, 'no renderer: no relight');
  publish(lightPreset, [0.3, 0.36, 0.45], [0.55, 0.62, 0.7], [0.8, 0.75, 0.62]);
  assert.equal(handle.ensureBaked(renderer), true, 'the day bake');
  assert.equal(handle.stats.dayReference, true, 'the first bake under this map\'s own day sky keeps it as the day reference');
  assert.deepEqual(seen.at(-1).sunScale, [1, 1, 1], 'the day bake\'s scales are exactly 1');
  assert.equal(seen.at(-1).haze, 1, 'and it takes the published sky\'s law');
  const dayStrip = seen.at(-1);
  assert.equal(handle.relight(renderer), true, 'the day light: carried');
  assert.equal(handle.stats.bakes, 1, 'the day light is the authored bake: no re-bake');
  assert.equal(handle.stats.light, null, 'and no relight recorded');
  // night: the moon at 24 degrees, the dome at .08, a darker sky
  const nightPreset = battleTimePreset(lightPreset, 'night');
  publish(nightPreset, [0.024, 0.029, 0.036], [0.044, 0.05, 0.056], [0.06, 0.06, 0.05]);
  assert.equal(handle.relight(renderer), true, 'night: relit');
  assert.equal(handle.stats.bakes, 2, 'one re-bake');
  assert.equal(handle.stats.relights, 1, 'recorded');
  const night = seen.at(-1);
  const moon = sunDirectionOf(24, 115);
  assert.ok(night.sun.every((v, i) => Math.abs(v - moon[i]) < 1e-6), 'the night bake is lit from the moon\'s direction');
  assert.ok(night.sunScale.every((v) => v > 0 && v < 0.3) && night.skyScale.every((v) => v > 0 && v < 1),
    `the night's moon and sky far under the day's (${night.sunScale.map((v) => v.toFixed(3))}, ${night.skyScale.map((v) => v.toFixed(3))})`);
  assert.ok(night.sunScale[2] > night.sunScale[0], 'the moonlight bluer than the sun');
  assert.ok(night.fog.every((v, i) => v < dayStrip.fog[i] * 0.3), 'the bake\'s own air under the night sky');
  assert.equal(night.haze, 1, 'and the published night sky\'s law (its haze darkens with the sky)');
  assert.ok(handle.stats.light && handle.stats.light.airScale < 0.3, 'the light recorded for the probes');
  assert.equal(handle.relight(renderer), true, 'the same night again: carried');
  assert.equal(handle.stats.bakes, 2, 'no second re-bake');
  // a GPU suspension keeps the relit light: the next bake is the night's
  handle.mesh.material.map.dispose();
  assert.equal(handle.ensureBaked(renderer), true, 'the suspended atlas bakes again');
  assert.deepEqual(seen.at(-1).sunScale, night.sunScale, 'under the night\'s light');
  // back to the day: the authored bake again, byte for byte the day's uniforms
  publish(lightPreset, [0.3, 0.36, 0.45], [0.55, 0.62, 0.7], [0.8, 0.75, 0.62]);
  assert.equal(handle.relight(renderer), true, 'back to the day');
  assert.equal(handle.stats.light, null, 'the authored day');
  assert.deepEqual(seen.at(-1), dayStrip, 'the day bake\'s uniforms, exactly');
  // refusals: no grounded light (the legacy rig), no preset
  scene.userData.lightModel = { ...scene.userData.lightModel, mode: 'legacy' };
  assert.equal(handle.relight(renderer), false, 'the legacy rig: no relight (the dim stands)');
  // a refusal after a relit battle returns the far country to the authored day (a galaxy sky's legacy rig on a cached
  // world must not keep the last battle's night)
  publish(nightPreset, [0.024, 0.029, 0.036], [0.044, 0.05, 0.056], [0.06, 0.06, 0.05]);
  assert.equal(handle.relight(renderer), true, 'night again');
  const relitBakes = handle.stats.bakes;
  scene.userData.lightModel = { ...scene.userData.lightModel, mode: 'legacy' };
  assert.equal(handle.relight(renderer), false, 'refused');
  assert.equal(handle.stats.bakes, relitBakes + 1, 'and re-baked');
  assert.equal(handle.stats.light, null, 'back to the authored day');
  assert.deepEqual(seen.at(-1).sunScale, [1, 1, 1], 'under the day\'s own uniforms');
  const bare = createHorizonPanorama({ ...options, sun: daySun }, null);
  scene.add(bare.mesh);
  publish(nightPreset, [0.024, 0.029, 0.036], [0.044, 0.05, 0.056], [0.06, 0.06, 0.05]);
  assert.equal(bare.relight(renderer), false, 'no authored preset: no day to measure against');
  // a map entered straight into the night (the Studio's map switch at night: world activation applies the map's sky
  // after the warm-up, so nothing baked under the day): the battle atmosphere notes the day sky before it applies the
  // night, and the relight then bakes once, under the night
  const late = createHorizonPanorama({ ...options, sun: daySun, lightPreset }, null);
  scene.add(late.mesh);
  publish(lightPreset, [0.3, 0.36, 0.45], [0.55, 0.62, 0.7], [0.8, 0.75, 0.62]);
  assert.equal(late.noteDaySky(), true, 'the day sky noted while it shows');
  assert.equal(late.stats.bakes, 0, 'without a bake');
  publish(nightPreset, [0.024, 0.029, 0.036], [0.044, 0.05, 0.056], [0.06, 0.06, 0.05]);
  assert.equal(late.noteDaySky(), true, 'a later sky never replaces the reference');
  assert.equal(late.relight(renderer), true, 'relit');
  assert.equal(late.stats.bakes, 1, 'one bake, under the night');
  assert.ok(late.stats.light && seen.at(-1).sunScale.every((v, i) => Math.abs(v - night.sunScale[i]) < 1e-12),
    'the same night light as the handle that baked the day first');
  handle.dispose(); bare.dispose(); late.dispose();
}

// --- 2026-10-05 (Part 1, the skies lane: the distant hills' cloud shadows) --------------------------------------------
// the aux pass: the strip's own march run twice (the sun's term on and off), at a quarter of the strip, on the tier with a
// shade map only; the shell rebuilds each far point and dims only the sun's share under the shared shade map
{
  const aux = HORIZON_PANORAMA_SHADERS.stripAux;
  assert.ok(aux && aux.length > 1000, 'the aux shader derives from the strip\'s (its rewritten lines all found)');
  assert.equal(aux.split('void main()').length - 1, 1, 'one main');
  assert.ok(/gSunScale = 1\.0;\s*vec4 full = stripTexel\(\);\s*float rr = gRR;\s*gSunScale = 0\.0;\s*vec4 dark = stripTexel\(\);/.test(aux), 'the march twice: the sun on, then off');
  // (2026-10-08, the nightsky lane: the sun's term carries the relight's scale — 1 by day — before the aux's on/off)
  assert.ok(aux.includes('vec3 sunC = uGains.y * 1.05 * ndl * light.r * vec3(1.06, 0.98, 0.86) * uSunScale * gSunScale;'), 'the surface\'s sun term scaled');
  assert.ok(aux.includes('vec3(1.06, 0.98, 0.86) * uSunScale * gSunScale + uGains.x * 0.82 * skyTint * uSkyScale'), 'and the hidden fill\'s');
  assert.ok(aux.includes('float share = la > 1e-5 ? clamp(1.0 - lb / la, 0.0, 1.0) : 0.0;'), 'the share: 1 - L(no sun) / L(full), bounded');
  assert.ok(aux.includes('gl_FragColor = vec4(vec3(rr / 10000.0, share, 1.0) * full.a, 1.0);'), 'premultiplied by the coverage, like the atlas');
  // the share's bounds, on the GLSL's own expression: 0..1, 0 where the sun's term is 0 (the two marches agree)
  const share = (la, lb) => (la > 1e-5 ? Math.min(1, Math.max(0, 1 - lb / la)) : 0);
  for (const [la, lb] of [[0.5, 0.2], [0.3, 0.3], [0.4, 0], [1e-7, 0], [0.2, 0.25]]) {
    const v = share(la, lb);
    assert.ok(v >= 0 && v <= 1, `the share in [0, 1] (${la}, ${lb})`);
  }
  assert.equal(share(0.3, 0.3), 0, 'no sun term (a face turned from the sun, a ridge\'s shadow): no share, no cloud shade');
  assert.equal(share(0.4, 0), 1, 'all of it the sun\'s: the whole texel dims under a core');
  // the shell's lookup: the far point as the bake placed it (azimuth u x 2 pi; the eye's height + tan(e) x distance)
  const shell = (() => {
    const h = createHorizonPanorama({ ringEdge, sun: [0.3, 0.6, 0.2], gains: { ambient: 0.8, sunGain: 1.4 } });
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
    h.mesh.material.onBeforeCompile(sh);
    h.dispose();
    for (const name of ['uPanoAux', 'uPanoShadeOn', 'tCotCloudShade', 'uCotCloudShade', 'uCotCloudSun']) assert.ok(name in sh.uniforms, `the shell binds ${name}`);
    return sh;
  })();
  assert.ok(shell.fragmentShader.includes('vec3 fp = vec3(cos(az) * rr, uPanoEye.y + tan(e) * rr, sin(az) * rr);'), 'the far point rebuilt');
  assert.ok(shell.fragmentShader.includes('land *= 1.0 - share * (1.0 - cotCloudSun(fp));'), 'only the sun\'s share dims');
  assert.ok(shell.fragmentShader.includes('float cotCloudSun( vec3 wp )'), 'through the shared lookup (cloudShadeMap.ts: the square, its edge fade, a grazing sun)');
  assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('vec3 wp = vec3(cos(a) * rr, uFrame.w + tanE * rr, sin(a) * rr);'), 'the bake\'s own placement of the point');
  // the fade at the shade map's square (its CPU twin, the lookup the shell calls): a far point at 3 km keeps the core's
  // shade, at 5.5 km it fades, at 6.5 km (past the 12 km square's half side) it takes none
  const { cloudSunShareAt } = await import('../engine/cloudShadeMap.ts');
  const rect = { x: 0, y: 0, z: 12000 }, sunUp = { x: 0, y: 1, z: 0 };
  const core = () => 0.9;
  const at = (x) => cloudSunShareAt({ x, y: 0, z: 0 }, rect, 1400, sunUp, core);
  assert.ok(Math.abs(at(3000) - 0.1) < 1e-9, 'inside the square: the core\'s 0.1 of the sun kept');
  assert.ok(at(5500) > 0.1 && at(5500) < 1, `faded toward the square's edge (${at(5500).toFixed(3)})`);
  assert.equal(at(6500), 1, 'outside the 12 km square: no shade (the panorama runs to 9 km)');
  // the bake: six passes with the aux, the aux a quarter of the strip; the suspension frees it with the atlas; the knob
  // and the phone tier bake none
  const fallback = new THREE.Object3D();
  const handle = createHorizonPanorama({ ...options, cloudShade: true }, fallback);
  const renderer = recordingRenderer();
  assert.equal(handle.ensureBaked(renderer), true);
  const renders = renderer.calls.filter((c) => c[0] === 'render').map((c) => c[1]);
  assert.deepEqual(renders.slice(-1), [`${P.width >> 2}x${P.height >> 2}`], 'the aux pass last, a quarter of the strip');
  assert.equal(renders.length, 6, 'six passes with the cloud shade');
  assert.equal(handle.stats.aux, true, 'recorded for the probes');
  const air = handle.mesh.userData.panoAir;
  assert.ok(air.uPanoAux.value?.isTexture, 'the shell reads it');
  handle.mesh.onBeforeRender(null, { userData: {} }, { position: new THREE.Vector3(0, 300, 0) });
  assert.equal(air.uPanoShadeOn.value, 0, 'no published shade map: off');
  const shared = { tCotCloudShade: { value: new THREE.Texture() }, uCotCloudShade: { value: new THREE.Vector4(0, 0, 1 / 12000, 1) }, uCotCloudSun: { value: new THREE.Vector4(0, 1, 0, 1400) } };
  handle.mesh.onBeforeRender(null, { userData: { cloudShadeUniforms: shared } }, { position: new THREE.Vector3(0, 300, 0) });
  assert.equal(air.uPanoShadeOn.value, 1, 'a published map: on');
  assert.strictEqual(air.uCotCloudShade.value, shared.uCotCloudShade.value, 'by reference (the layer refreshes it in place)');
  globalThis.__LIGHT_TUNE = { PANO_CLOUD_SHADE: 0 };
  handle.mesh.onBeforeRender(null, { userData: { cloudShadeUniforms: shared } }, { position: new THREE.Vector3(0, 300, 0) });
  assert.equal(air.uPanoShadeOn.value, 0, 'QA: PANO_CLOUD_SHADE 0 turns it off');
  delete globalThis.__LIGHT_TUNE;
  handle.mesh.material.map.dispose();
  assert.equal(air.uPanoAux.value, null, 'a GPU suspension frees the aux with the atlas (the next bake makes both)');
  handle.dispose();
  const phone = createHorizonPanorama({ ...options, cloudShade: false }, new THREE.Object3D());
  const r2 = recordingRenderer();
  assert.equal(phone.ensureBaked(r2), true);
  assert.equal(r2.calls.filter((c) => c[0] === 'render').length, 5, 'the phone tier: no aux pass');
  phone.dispose();
}

console.log('horizonPanorama.selftest: the shell, its atlas mapping, the far vocabulary, the passes, the bake contract and the far country\'s cloud shade (the aux pass, the share, the square) PASS');
