// fogLayer.selftest — the materials' scene fog on the battlefield's haze layer (2026-10-02, the lighting lane).
// The patched exp2 chunk takes the path-averaged density of post.ts's layer (the same expression, the same scale height),
// the shared uniform reaches every fogged built-in material by reference, the view-space reconstruction of the fragment's
// height is exact, a camera on the ground keeps the plain law, and post.ts / sky.ts carry the wiring.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { FOG_LAYER, FOG_LAYER_H, FOG_LAYER_MIN_M, installFogLayer } from './fogLayer.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const plainExp2 = 'float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );';
const plainFragment = THREE.ShaderChunk.fog_fragment, plainParsFragment = THREE.ShaderChunk.fog_pars_fragment;
assert.ok(plainFragment.includes(plainExp2), 'three\'s exp2 chunk as the patch expects it');
installFogLayer();
installFogLayer(); // idempotent
const C = THREE.ShaderChunk;
assert.equal(C.fog_fragment, plainFragment, 'the fragment law is three\'s own (the layer rides vFogDepth)');
assert.equal(C.fog_pars_fragment, plainParsFragment, 'and no new varying or fragment uniform (a program near its varying limit links as before)');
assert.match(C.fog_vertex, /vFogDepth = - mvPosition\.z;\n#ifdef FOG_EXP2\nif \( fogLayer\.w > 0\.5 \) \{[\s\S]*vFogDepth \*= clamp\( fogCam \/ max\( fogGround, 1e-3 \), 0\.0, 1\.0 \);\n\}\n#endif/,
  'the exp2 path scales its optical distance per vertex; the linear fog is untouched');
assert.equal((C.fog_vertex.match(/fogLayer\.w > 0\.5/g) ?? []).length, 1);
assert.match(C.fog_pars_vertex, /#ifdef USE_FOG[\s\S]*varying float vFogDepth;\n#ifdef FOG_EXP2\nuniform vec4 fogLayer;\n#endif[\s\S]*#endif/, 'declared only where exp2 fog is');
assert.doesNotMatch(C.fog_pars_vertex, /varying vec/, 'no new varying');

// the shared uniform: every fogged built-in material, by reference through the per-program clone
let fogged = 0;
for (const [name, shader] of Object.entries(THREE.ShaderLib)) {
  if (!shader.uniforms.fogDensity) { assert.equal(shader.uniforms.fogLayer, undefined, `${name} has no fog`); continue; }
  fogged++;
  assert.strictEqual(shader.uniforms.fogLayer.value, FOG_LAYER, `${name} carries the shared layer`);
  assert.strictEqual(THREE.UniformsUtils.clone(shader.uniforms).fogLayer.value, FOG_LAYER, `${name}: a program's clone keeps the reference`);
}
assert.ok(fogged >= 8, `the fogged built-in materials (${fogged})`);
assert.strictEqual(THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]).fogLayer.value, FOG_LAYER, 'and a shader material merging UniformsLib.fog');

// the vertex's world height from its view position: cameraPosition.y + dot( viewMatrix[ 1 ].xyz, mvPosition.xyz )
{
  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 5000);
  for (const [p, t, w] of [[[-420, 312, -420], [60, 4, 60], [233, 7.5, 517]], [[3, 9, -8], [40, 2, 90], [-12, 41, 300]], [[0, 0.5, 0], [0, 0.5, 10], [5, 0, 30]]]) {
    cam.position.set(...p); cam.lookAt(...t); cam.updateMatrixWorld(true);
    const view = new THREE.Vector3(...w).applyMatrix4(cam.matrixWorldInverse);
    const e = cam.matrixWorldInverse.elements; // column-major: viewMatrix[1] = elements 4..6
    near(cam.position.y + e[4] * view.x + e[5] * view.y + e[6] * view.z, w[1], 1e-9, 'the reconstructed world height');
  }
}

// the layer factor, modelled exactly as the chunk computes it, against post.ts's expression
const post = readFileSync(new URL('./post.ts', import.meta.url), 'utf8');
assert.equal(Number(post.match(/const AERIAL_LAYER_H = ([0-9.]+);/)?.[1]), FOG_LAYER_H, 'one scale height for the aerial pass and the fog');
assert.match(post, /float hzFromCam = abs\( hzY0 - hzY1 \) < 1\.0 \? exp\( -0\.5 \* \( hzY0 \+ hzY1 \) \/ hzH \)\s*: hzH \* \( exp\( -hzY1 \/ hzH \) - exp\( -hzY0 \/ hzH \) \) \/ \( hzY0 - hzY1 \);/);
assert.match(post, /float hzFromGround = hzY1 < 1\.0 \? exp\( -0\.5 \* hzY1 \/ hzH \) : hzH \* \( 1\.0 - exp\( -hzY1 \/ hzH \) \) \/ hzY1;/);
assert.match(post, /hzLayer = clamp\( hzFromCam \/ max\( hzFromGround, 1e-3 \), 0\.0, 1\.0 \);/);
const layer = (y0m, y1m) => { // the vertex chunk, in units of H
  const y0 = y0m / FOG_LAYER_H, y1 = Math.max(y1m, 0) / FOG_LAYER_H;
  const cam = Math.abs(y0 - y1) < 0.003 ? Math.exp(-0.5 * (y0 + y1)) : (Math.exp(-y1) - Math.exp(-y0)) / (y0 - y1);
  const ground = y1 < 0.003 ? Math.exp(-0.5 * y1) : (1 - Math.exp(-y1)) / y1;
  return Math.min(1, Math.max(0, cam / Math.max(ground, 1e-3)));
};
const postLayer = (y0, y1) => { // post.ts, in metres
  const H = FOG_LAYER_H;
  const cam = Math.abs(y0 - y1) < 1 ? Math.exp(-0.5 * (y0 + y1) / H) : H * (Math.exp(-y1 / H) - Math.exp(-y0 / H)) / (y0 - y1);
  const ground = y1 < 1 ? Math.exp(-0.5 * y1 / H) : H * (1 - Math.exp(-y1 / H)) / y1;
  return Math.min(1, Math.max(0, cam / Math.max(ground, 1e-3)));
};
for (const [y0, y1] of [[300, 0], [300, 40], [300, 300], [55, 0], [14, 90], [14, 260], [120, 500], [300, -20]]) {
  near(layer(y0, y1), postLayer(y0, Math.max(y1, 0)), 1e-6, `the chunk's layer equals the aerial pass's (${y0} m over ${y1} m)`);
}
near(layer(300, 0), 0.632, 0.001, 'the census bird looks down through 63 % of the ground path\'s density');
const fogAt = (density, d, k) => 1 - Math.exp(-((density * d * k) ** 2));
const d900 = 0.00074 * 0.55;
assert.ok(fogAt(d900, 900, layer(300, 0)) < 0.45 * fogAt(d900, 900, 1), 'the far square from the bird: under half the plain fog');
// the gate: below FOG_LAYER_MIN_M the layer would move the fog by under 4 % of itself, so a camera near the ground keeps the plain law
assert.ok(layer(FOG_LAYER_MIN_M, 0) ** 2 > 0.96, `the gate height keeps the fog within 4 % (${(layer(FOG_LAYER_MIN_M, 0) ** 2).toFixed(4)})`);
assert.ok(FOG_LAYER_MIN_M > 8, 'the chase (8 m) and the sights stay under the gate');
for (const y1 of [0, 30, 120, 260]) assert.ok(layer(6, y1) > 0.985, `and the layer itself barely moves a ground camera's fog toward ${y1} m`);

// the wiring: sky.ts patches before any program compiles; post.ts writes the shared uniform where it writes the datum
const sky = readFileSync(new URL('./sky.ts', import.meta.url), 'utf8');
assert.match(sky, /import \{ installFogLayer \} from '\.\/fogLayer\.ts';/);
assert.match(sky, /^installFogLayer\(\);$/m, 'at module evaluation, before the first compile');
assert.match(post, /aerial\.uniforms\.uHazeDatum\.value = datum;\s*\/\/[^\n]*\n\s*FOG_LAYER\.x = elements\[13\] - datum;\s*FOG_LAYER\.y = datum;\s*FOG_LAYER\.w = FOG_LAYER\.x > FOG_LAYER_MIN_M \? lightTune\('FOG_LAYER', 1\) : 0;/,
  'the camera\'s height over the haze datum, gated near the ground');
assert.equal(FOG_LAYER.z, 1 / FOG_LAYER_H);

console.log(`fogLayer.selftest: the exp2 fog's optical distance on the aerial pass's layer, per vertex (the bird at 300 m: ${layer(300, 0).toFixed(3)} of the ground path), shared uniform on ${fogged} fogged materials, exact height reconstruction, the ground keeps the plain law, wiring PASS`);
