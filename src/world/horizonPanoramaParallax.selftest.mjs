// The horizons lane (2026-10-09): the far panorama's shell from a high camera over the water (gauntlet wave 313,
// Nordhavn's bird and apron views: "pale vertical sheets ... pillars hanging down from a flat slab to the far headlands"),
// and the far ranges' snow off their steep faces (Glacier Pass: white meringue peaks, no rock). The shell paints the far
// shore as the bake eye saw it, 30 m up; from a camera well above the eye a wall texel over an opening's water whose ray
// meets the sea before it reaches that texel's land takes the far earth's law instead. The law is checked in a JS port
// of the GLSL (the shell compiles in the browser receipts; the text here is pinned to the port).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { HORIZON_PANORAMA, HORIZON_PANORAMA_SHADERS, createHorizonPanorama, resolveHorizonPanoramaCharacter } from './horizonPanorama.ts';
import { getMapConfig } from './maps/index.ts';

// the owner's protected maps (2026-10-09 verdicts: "incredible", light-touch) keep their far country
const PROTECTED = ['verdant', 'winter', 'saltwind', 'reservoir', 'railyard', 'coastal', 'desert', 'frontier', 'fjord'];
const source = readFileSync(new URL('./horizonPanorama.ts', import.meta.url), 'utf8');

// --- the shell's parallax gate ----------------------------------------------------------------------------------
const n = 64;
const ringEdge = (() => {
  const rows = 2, positions = new Float32Array(n * rows * 3), heights = new Float32Array(n * rows);
  for (let row = 0; row < rows; row++) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = 1200 + row * 200, i = row * n + k;
    positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 2] = Math.sin(a) * r;
    heights[i] = positions[i * 3 + 1] = 30;
  }
  return { columns: n, positions, heights };
})();
const handle = createHorizonPanorama({ ringEdge, sun: [0.3, 0.6, 0.2], gains: { ambient: 0.8, sunGain: 1.4 }, fogDensity: 0.0003 });
const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
handle.mesh.material.onBeforeCompile(shader);
const fs = shader.fragmentShader;
assert.ok(fs.includes('bool parallaxOpen = false;') && fs.includes('if (pano.a < 0.5 || parallaxOpen) {'),
  'the shell opens a parallax texel into the far earth\'s law');
assert.ok(fs.includes('vPanoApron < 0.5 && cameraPosition.y > uPanoEye.y + 30.0 && textureSize(uPanoAux, 0).x > 1'),
  'only the wall, only from a camera 30 m over the bake eye, only where the aux pass (the texel\'s distance) is bound');
assert.ok(fs.includes('seaNear > 0.02'), 'only in a column with open sea near it');
assert.ok(/parallaxOpen = xP < 0\.92 \* length\(vec2\(cos\(azP\), sin\(azP\)\) \* \(auxP\.r \/ auxP\.b \* 10000\.0\) - cameraPosition\.xz\);/.test(fs),
  'the ray meets the sea short of the texel\'s own land');
handle.dispose?.();

// the law, ported: a camera, a wall point, the texel's land distance (from the bake eye's centre), the haze datum
function parallaxOpen({ cam, wall, landR, az, seaNear, datum = 0, auxBound = true }) {
  if (!(cam[1] > HORIZON_PANORAMA.eyeY + 30) || !auxBound || !(seaNear > 0.02)) return false;
  const vd = [wall[0] - cam[0], wall[1] - cam[1], wall[2] - cam[2]];
  const tanD = -vd[1] / Math.max(Math.hypot(vd[0], vd[2]), 1e-3);
  const x = tanD > 1e-5 ? Math.max(cam[1] - datum, 0.5) / tanD : 1e9;
  return x < 0.92 * Math.hypot(Math.cos(az) * landR - cam[0], Math.sin(az) * landR - cam[2]);
}
const R = 3360, az = 0.2;
const wallAt = (y) => [Math.cos(az) * R, y, Math.sin(az) * R];
// a far shore at 6 km, 150 m high, painted on the wall at the bake eye's line to it
const landR = 6000, landH = 150, paintedY = HORIZON_PANORAMA.eyeY + (landH - HORIZON_PANORAMA.eyeY) * R / landR;
// the bird view (300 m over the water): the painted shore's ray meets the sea at ~5 km, short of the shore — open
assert.equal(parallaxOpen({ cam: [-420, 304, -420], wall: wallAt(paintedY), landR, az, seaNear: 0.6 }), true,
  'a bird camera sees the water between, not the far shore stood on the wall');
// the same texel in a land column (no open sea near it) is the far country as before
assert.equal(parallaxOpen({ cam: [-420, 304, -420], wall: wallAt(paintedY), landR, az, seaNear: 0 }), false,
  'a land column keeps its painted country');
// a tank-height camera (and any camera under 60 m) sees the wall as before
for (const y of [2.5, 12, 45]) assert.equal(parallaxOpen({ cam: [0, y, 0], wall: wallAt(paintedY), landR, az, seaNear: 0.6 }), false, `a camera at ${y} m keeps the wall`);
// without the aux pass the shell is as before
assert.equal(parallaxOpen({ cam: [-420, 304, -420], wall: wallAt(paintedY), landR, az, seaNear: 0.6, auxBound: false }), false,
  'a shell without the aux pass is unchanged');
// a high camera looking up at a texel above its own height never meets the sea: the wall stays
assert.equal(parallaxOpen({ cam: [0, 120, 0], wall: wallAt(400), landR: 8000, az, seaNear: 0.6 }), false,
  'a ray over the camera\'s horizontal keeps the wall');

// --- the far ranges' snow off the steep faces ---------------------------------------------------------------------
assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('smoothstep(mix(0.3, 0.17, uAir.w), mix(0.5, 0.33, uAir.w), slope + 0.05 * uAir.w * n1)'),
  'the strip\'s snow slides off from the slope the map asks (uAir.w); 0 is the old law exactly');
assert.ok(/uAir: \{ value: new THREE\.Vector4\(ch\.air, ch\.fillLaw, ch\.rockFloor, ch\.snowSlide\) \}/.test(source), 'the knob rides in uAir.w');
assert.equal(resolveHorizonPanoramaCharacter('alpine').snowSlide, 0, 'the characters keep their snow');
const alpine = getMapConfig('alpine').horizon;
assert.equal(resolveHorizonPanoramaCharacter('alpine', typeof alpine.panorama === 'object' ? alpine.panorama : undefined).snowSlide, 1,
  'Glacier Pass lets its far ranges\' snow slide off the steep faces');
for (const id of PROTECTED) {
  const p = getMapConfig(id).horizon?.panorama;
  assert.ok(!(p && typeof p === 'object' && p.snowSlide), `${id} keeps its far snow`);
}

// --- the inlets' sides counted as open sea (Nordhavn's bird views: "pale vertical pillars") --------------------------
assert.ok(HORIZON_PANORAMA_SHADERS.skyline.includes('float open = found.a < 0.0 && texture2D(uEdge, vec2(vUv.x, 0.5)).g > 0.1 ? -2.0 : -1.0;'),
  'a column with no land past a 0.1 sea weight is open sea (the strip opens its water from 0.02 to 0.2), not a far country in the cloud');
assert.ok(fs.includes('if (!landCol && under.a < 0.004) discard;'), 'a column with neither land nor open sea near it (the cloud deck) stays open');

// --- the limb fill (the bird views' "long flat pale horizontal slab") -----------------------------------------------
assert.ok(fs.includes('if (disc <= 0.0 && uPanoLimb < 0.5) discard;') && fs.includes('float x = disc > 0.0 ? 2.0 * h / (tanD + sqrt(disc)) : 1e7;'),
  'a ray over the earth\'s limb takes the horizon\'s colour where the map asks, and stays open elsewhere');
assert.ok(/air\.uPanoLimb\.value = ch\.limbFill > 0 \? 1 : 0;/.test(source), 'the shell takes its map\'s limb fill');
assert.equal(resolveHorizonPanoramaCharacter('alpine').limbFill, 0, 'the characters leave the limb open');
const limbOf = (id) => { const p = getMapConfig(id).horizon?.panorama; return p && typeof p === 'object' ? (p.limbFill ?? 0) : 0; };
for (const id of ['fjord', 'coastal', 'saltwind']) assert.equal(limbOf(id), 1, `${id}'s sea horizon runs on into the sky over the limb`);
for (const id of ['verdant', 'winter', 'reservoir', 'railyard', 'desert', 'frontier', 'alpine', 'caldera', 'urban']) assert.equal(limbOf(id), 0, `${id} keeps its limb open`);

// --- the far faces' forest belts (R023) ----------------------------------------------------------------------------
assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('if (uTrees.w > 0.0 && uChar3.y > 0.0) {') && HORIZON_PANORAMA_SHADERS.strip.includes('vegW = max(vegW, uTrees.w * bZone * (1.0 - gap));'),
  'the strip\'s forest climbs the faces in belts where the map asks (uTrees.w), never thinning the forest the character has');
assert.ok(/uTrees: \{ value: new THREE\.Vector4\(ch\.trees, ch\.forestSlope, ch\.scrub, ch\.forestBelts\) \}/.test(source), 'the knob rides in uTrees.w');
assert.equal(resolveHorizonPanoramaCharacter('alpine').forestBelts, 0, 'the characters keep their forest');
assert.equal(resolveHorizonPanoramaCharacter('alpine', alpine.panorama).forestBelts, 1, 'Glacier Pass\'s far faces carry forest belts');
for (const id of PROTECTED) {
  const p = getMapConfig(id).horizon?.panorama;
  assert.ok(!(p && typeof p === 'object' && p.forestBelts), `${id} keeps its far forest`);
}

console.log('horizonPanoramaParallax.selftest: the shell\'s parallax over the water, the inlets\' sides, the limb fill, the far ranges\' snow slide and forest belts PASS');
