// shadowReceiverOnly.selftest — receiver-only shadows (2026-10-04, the scenery lane, visual/shadow-bias). A material whose
// meshes never cast (the terrain, and the horizon ring that draws its ground faces with the terrain's material) is in no
// depth map, so it cannot shadow itself: it takes no receiver normal offset and a 2 cm depth bias in place of the
// cascade's acne terms, which held every ground shadow 0.40 x cos(e) + 0.045 / tan(e) away from its caster.
// Pinned: the chunk patches (inserted after the chunks' own lines, both declared per stage under the define, all three
// shadow-struct copies of the CSM lights chunk); the material hook (the opt-in's defines and its bias in the lights'
// normalised depth, the shared uniform, nothing for any other material); the A/B switch (__SHADOW_DEBUG.legacyBias puts
// the cascade's terms back); the guard (a mesh that draws a receiver-only material never casts); and the terrain's
// opt-in with every mesh that carries its material kept from casting.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SHADOW_RECEIVER_ONLY_BIAS_M } from './shadowStability.ts';

const here = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, location: { search: '' } };
const { createLighting } = await import('./lighting.ts');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000);
camera.position.set(0, 3, 0);
camera.lookAt(0, 2, 10);
camera.updateMatrixWorld();
const rig = createLighting(scene, camera, new THREE.Vector3(1, 0.7, 0.4).normalize());
rig.updateFrustums();
const lights = [];
scene.traverse((object) => { if (object.isDirectionalLight && object.castShadow) lights.push(object); });
assert.ok(lights.length >= 3, 'the cascades are built');

// ---- the chunks: the receiver-only lines go in after three's own, under the define, a uniform per stage
const C = THREE.ShaderChunk;
const ON = '#if defined( COT_SHADOW_RECEIVER_ONLY ) && defined( USE_SHADOWMAP )';
assert.equal(C.shadowmap_vertex.split('shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias').length - 1, 1,
  'shadowmap_vertex keeps its own normal-bias line (cloudShadeMap.selftest anchors on it)');
assert.ok(C.shadowmap_vertex.includes(`\tvec4 shadowWorldPosition;\n\t${ON}\n\tshadowWorldNormal *= 1.0 - uCotReceiverOnlyV;\n\t#endif\n`),
  'the receiver offset is dropped right after the declarations, before the cascades read shadowWorldNormal');
assert.ok(C.shadowmap_vertex.indexOf('shadowWorldNormal *= 1.0 - uCotReceiverOnlyV;')
  < C.shadowmap_vertex.indexOf('shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias'), 'and before its use');
assert.ok(C.shadowmap_pars_vertex.endsWith(`${ON}\nuniform float uCotReceiverOnlyV;\n#endif`), 'the vertex stage declares its uniform');
assert.ok(C.shadowmap_pars_fragment.endsWith(`${ON}\nuniform float uCotReceiverOnly;\n#endif`), 'the fragment stage its own (no precision pairing)');
const copy = 'directionalLightShadow = directionalLightShadows[ i ];';
const override = `${copy}\n\t\t\t\t${ON}\n\t\t\t\tdirectionalLightShadow.shadowBias = mix( directionalLightShadow.shadowBias, COT_RECEIVER_SHADOW_BIAS, uCotReceiverOnly );\n\t\t\t\t#endif`;
assert.equal(C.lights_fragment_begin.split(copy).length - 1, 3, 'the CSM lights chunk copies the shadow struct three times');
assert.equal(C.lights_fragment_begin.split(override).length - 1, 3, 'and each copy takes the receiver-only bias before its getShadow');
for (const text of [C.shadowmap_vertex, C.shadowmap_pars_vertex, C.shadowmap_pars_fragment, C.lights_fragment_begin]) {
  const opens = (text.match(/^\s*#if/gm) || []).length, closes = (text.match(/^\s*#endif/gm) || []).length;
  assert.equal(opens, closes, 'every patched chunk keeps its conditionals balanced');
}

// ---- the material hook: the opt-in, its defines and the shared uniform; nothing for any other material
const compile = (material) => {
  const lib = THREE.ShaderLib.standard;
  const shader = { uniforms: {}, vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader };
  material.onBeforeCompile(shader, null);
  return shader;
};
const ground = new THREE.MeshStandardMaterial();
ground.userData.cotShadowReceiverOnly = true;
rig.setupShadowMaterial(ground);
const range = lights[0].shadow.camera.far - lights[0].shadow.camera.near;
assert.equal(ground.defines.COT_SHADOW_RECEIVER_ONLY, '', 'the opt-in compiles the receiver-only branch');
assert.equal(ground.defines.COT_RECEIVER_SHADOW_BIAS, (-SHADOW_RECEIVER_ONLY_BIAS_M / range).toExponential(6),
  'its bias: 2 cm in the lights\' normalised depth');
assert.ok(Math.abs(-Number(ground.defines.COT_RECEIVER_SHADOW_BIAS) * range - 0.02) < 1e-6, 'which is 2 cm along the sun ray');
assert.ok(/^-\d\.\d{6}e-\d+$/.test(ground.defines.COT_RECEIVER_SHADOW_BIAS), 'a GLSL float literal');
const groundShader = compile(ground);
assert.ok(groundShader.uniforms.uCotReceiverOnly && groundShader.uniforms.uCotReceiverOnly === groundShader.uniforms.uCotReceiverOnlyV,
  'both stages read one shared value');
assert.equal(groundShader.uniforms.uCotReceiverOnly.value, 1, 'on by default: the 2 cm bias and no offset');
const caster = new THREE.MeshStandardMaterial();
rig.setupShadowMaterial(caster);
assert.ok(!('COT_SHADOW_RECEIVER_ONLY' in (caster.defines ?? {})) && !('COT_RECEIVER_SHADOW_BIAS' in (caster.defines ?? {})),
  'a material without the opt-in keeps the cascade terms');
const casterShader = compile(caster);
assert.ok(!casterShader.uniforms.uCotReceiverOnly && !casterShader.uniforms.uCotReceiverOnlyV, 'and carries no receiver uniform');

// ---- the A/B switch: legacyBias puts the cascade's terms back on the receiver-only materials too, without a recompile
window.__SHADOW_DEBUG = { legacyBias: true };
rig.updateFrustums();
assert.equal(groundShader.uniforms.uCotReceiverOnly.value, 0, 'legacyBias: the cascade bias and the normal offset, as before');
delete window.__SHADOW_DEBUG;
rig.updateFrustums();
assert.equal(groundShader.uniforms.uCotReceiverOnly.value, 1, 'restored after the A/B');

// ---- the guard: a mesh that draws a receiver-only material never casts (its 2 cm bias would shadow it with acne). The
// public build turns the casting off quietly; a dev or QA build (?debug) says so once per mesh, naming it
const warnings = [];
const consoleWarn = console.warn, consoleError = console.error;
console.warn = (...args) => warnings.push(args.join(' '));
console.error = (...args) => warnings.push('error: ' + args.join(' '));
try {
  const geometry = new THREE.BoxGeometry();
  const quietMesh = new THREE.Mesh(geometry, ground);
  quietMesh.name = 'public-ground';
  quietMesh.castShadow = true;
  ground.onBeforeRender(null, scene, camera, geometry, quietMesh, null);
  assert.equal(quietMesh.castShadow, false, 'the first draw turns the casting off');
  assert.equal(warnings.length, 0, 'the public build says nothing');
  globalThis.location = { search: '?debug=1' };
  const castingMesh = new THREE.Mesh(geometry, ground);
  castingMesh.name = 'misplaced-ground';
  castingMesh.castShadow = true;
  ground.onBeforeRender(null, scene, camera, geometry, castingMesh, null);
  assert.equal(castingMesh.castShadow, false, 'a QA build turns it off too');
  assert.equal(warnings.length, 1, 'and says so');
  assert.match(warnings[0], /^lighting\.ts: misplaced-ground draws a receiver-only shadow material and cast shadows/, 'a warning naming the mesh');
  ground.onBeforeRender(null, scene, camera, geometry, castingMesh, null);
  const quiet = new THREE.Mesh(geometry, ground);
  ground.onBeforeRender(null, scene, camera, geometry, quiet, null);
  assert.equal(warnings.length, 1, 'once per mesh; a receiving mesh is left alone');
  rig.setupShadowMaterial(ground);
  const again = new THREE.Mesh(geometry, ground);
  again.castShadow = true;
  ground.onBeforeRender(null, scene, camera, geometry, again, null);
  assert.equal(warnings.length, 2, 'a second registration does not wrap the guard twice');
  caster.onBeforeRender(null, scene, camera, geometry, Object.assign(new THREE.Mesh(geometry, caster), { castShadow: true }), null);
  assert.equal(warnings.length, 2, 'a caster material has no guard');
} finally {
  console.warn = consoleWarn;
  console.error = consoleError;
  delete globalThis.location;
}
const lightingSource = here('./lighting.ts');
assert.match(lightingSource, /function receiverOnlyGuardSpeaks\(\): boolean \{\n  return import\.meta\.env\?\.DEV === true \|\| debugModeRequested\(\);\n\}/,
  'the guard speaks in the dev build and behind ?debug, never in the public build');

// ---- the terrain's opt-in, and every mesh that carries its material kept from casting
const terrain = here('../world/terrain.ts');
assert.match(terrain, /mat\.userData\.cotShadowReceiverOnly = true;\n  engineCtx\.setupShadowMaterial\(mat, splatHook\);/,
  'the terrain material opts in where it registers');
assert.match(terrain, /const mesh = new THREE\.Mesh\(lods\[openingLevel\]!, mat\);\n      mesh\.receiveShadow = true;\n      mesh\.castShadow = false;/,
  'the chunks receive and never cast');
const chunkMeshes = terrain.split(/new THREE\.Mesh\([^)]*\bmat\)/).length - 1;
assert.equal(chunkMeshes, 1, 'the chunk mesh is the only mesh terrain.ts builds on its material');
assert.match(terrain, /bindAutumnHorizonGround\(horizonMesh, mat, splatTextures, \{/, 'the horizon ring is the material\'s other user');
const ring = here('../world/horizonAutumnGround.ts');
assert.match(ring, /mesh\.material = \[mesh\.material, material\];\n  mesh\.receiveShadow = true;/, 'the ring draws its ground faces with it');
assert.match(ring, /far\.material = \[far\.material, terrain\];\n  far\.receiveShadow = true;/, 'and its far range');
assert.doesNotMatch(ring, /castShadow\s*=\s*true/, 'neither casts');
const horizon = here('../world/maps/horizon.ts');
assert.match(horizon, /prepareAutumnHorizonGround\(mesh, retainedTextures\);/, 'the ring mesh is maps/horizon.ts\'s');
assert.doesNotMatch(horizon, /castShadow\s*=\s*true/, 'which builds no casting mesh');

console.log('shadowReceiverOnly.selftest: the chunks, the opt-in and its 2 cm bias, the A/B switch, the guard and the terrain\'s non-casting meshes pass');
