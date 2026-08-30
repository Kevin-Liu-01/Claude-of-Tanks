import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  LOD_SHADOW_FADE_ATTRIBUTE,
  LOD_SHADOW_FADE_PROGRAM_KEY,
  applyLodShadowFadeDepth,
  getLodShadowFadeDepthMaterial,
  patchLodShadowFadeDepthShader,
  usesLodShadowFadeDepth,
} from './lodShadowFade.ts';

function makeCaster(name) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  geometry.setAttribute(
    LOD_SHADOW_FADE_ATTRIBUTE,
    new THREE.InstancedBufferAttribute(new Float32Array([0]), 1),
  );
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshBasicMaterial(),
    1,
  );
  mesh.name = name;
  return mesh;
}

const first = applyLodShadowFadeDepth(makeCaster('first-map-tree'));
const second = applyLodShadowFadeDepth(makeCaster('second-map-tree'));
const sharedMaterial = getLodShadowFadeDepthMaterial();

assert.equal(first.customDepthMaterial, sharedMaterial,
  'LOD casters use the engine-owned depth material');
assert.equal(second.customDepthMaterial, sharedMaterial,
  'different worlds reuse one shader/material policy');
assert.equal(sharedMaterial.depthPacking, THREE.RGBADepthPacking,
  'LOD shadows retain the renderer-compatible depth packing');
assert.equal(sharedMaterial.customProgramCacheKey(), LOD_SHADOW_FADE_PROGRAM_KEY,
  'the shared shadow program has a deterministic cache key');
assert.equal(usesLodShadowFadeDepth(first), true,
  'runtime audits can identify a completely wired LOD caster');

const shader = {
  vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}',
  fragmentShader: '#include <common>\nvoid main() {\n#include <alphatest_fragment>\n}',
};
patchLodShadowFadeDepthShader(shader);
assert.match(shader.vertexShader, /attribute float aLodF;/,
  'shadow vertices receive the same per-instance fade as visible geometry');
assert.match(shader.fragmentShader, /if \(vLodShadowFade > 0\.0005\)/,
  'shadow fragments progressively dissolve instead of popping');
assert.match(shader.vertexShader,
  /vLodShadowWorldPosition = \(modelMatrix \* cotLodShadowWorld\)\.xyz/,
  'shadow vertices anchor the dissolve to world space');
assert.match(shader.fragmentShader, /floor\(vLodShadowWorldPosition \* 5\.0\)/,
  'the dissolve samples a quantized world-space pattern');
assert.doesNotMatch(shader.fragmentShader, /gl_FragCoord/,
  'cascade texel snaps cannot reseed the dissolve');

const missing = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
assert.throws(() => applyLodShadowFadeDepth(missing), /requires aLodF geometry data/,
  'new LOD casters fail closed when their fade attribute is missing');

for (const mesh of [first, second, missing]) {
  mesh.geometry.dispose();
  mesh.material.dispose();
}
console.log('lodShadowFade.selftest: shared fade, shader patch, and fail-closed wiring passed');
