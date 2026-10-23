// terrainSplatFold.ts (2026-10-12, the perf stream): the terrain program's map-constant uniforms fold into GLSL
// constants of exactly their values, the list stays true to the shader and to the material's writers, and the program
// key follows the folded values.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { SPLAT_FOLD_UNIFORMS, foldSplatUniforms, glslFloat, splatFoldEnabled, splatFoldLiteral, splatFoldSignature } from './terrainSplatFold.ts';

const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const landUse = readFileSync(new URL('./landUse.ts', import.meta.url), 'utf8');
const fragStart = terrain.indexOf('const SPLAT_COMMON_FRAG = /* glsl */`');
const fragEnd = terrain.indexOf('\n`;', fragStart);
assert.ok(fragStart > 0 && fragEnd > fragStart, 'terrain.ts carries SPLAT_COMMON_FRAG');
const luStart = landUse.indexOf('export const LAND_USE_GLSL = /* glsl */`');
const luEnd = landUse.indexOf('\n`;', luStart);
const source = terrain.slice(fragStart, fragEnd).replace('${LAND_USE_GLSL}', landUse.slice(luStart, luEnd));

// 1. Every listed uniform is declared once in the program as a float or a vector (the list cannot name a sampler, an
//    array or a uniform the shader no longer has).
const declared = new Map();
for (const m of source.matchAll(/^[ \t]*uniform (float|vec2|vec3|vec4|sampler2D|int) ([^;]+);/gm)) {
  for (const raw of m[2].split(',')) declared.set(raw.trim().replace(/\[.*$/, ''), raw.includes('[') ? `${m[1]}[]` : m[1]);
}
for (const name of SPLAT_FOLD_UNIFORMS) {
  assert.ok(/^(float|vec[234])$/.test(declared.get(name) ?? ''), `${name} is a float or vector uniform of the splat program (${declared.get(name)})`);
}
// the uniforms a frame, a bind or a probe changes stay uniforms
for (const live of ['uRingDraw', 'uRingReliefR', 'uRingReliefGrad', 'uRingReliefAmp', 'uRingReliefWall', 'uGroundTime',
  'uSunDirW', 'uWallSkyLift', 'uFormation', 'uFormationLow', 'uFormationUp', 'uRingCap', 'uMeanG', 'uMeanD', 'uMeanR',
  'uMeanM', 'uLandTier', 'uMaskStack', 'uRoadClass', 'uLandBake']) {
  assert.ok(!SPLAT_FOLD_UNIFORMS.includes(live), `${live} changes at run time and is never folded`);
}

// 2. Only the material's compile assigns the folded uniforms: terrain.ts writes them as `shader.uniforms.<name> = …`
//    and nothing writes `.<name>.value` afterwards (the live ones are written through their shared objects).
for (const name of SPLAT_FOLD_UNIFORMS) {
  assert.doesNotMatch(terrain, new RegExp(`\\.${name}\\.value\\s*=(?!=)`), `terrain.ts never writes ${name} after its compile`);
}

// 3. The literals round-trip to the float32 a uniform upload of the same double carries.
for (const v of [0, -0, 1, -1, 0.1, 1 / 3, 2.6, 1e-7, 123456.789, 1e9, 0.000123, Math.PI, -0.0625]) {
  const text = glslFloat(v);
  assert.match(text, /^-?(\d+\.\d*|\d+(\.\d*)?e[+-]?\d+)$/, `${v} prints as a GLSL float literal (${text})`);
  assert.ok(Object.is(Math.fround(Number(text)), Math.fround(v)), `${text} is ${v} as a float32`);
}
assert.throws(() => glslFloat(NaN));
assert.deepEqual(splatFoldLiteral(new THREE.Vector4(0, 1, 2.5, -0.25)), ['vec4', 'vec4(0.0, 1.0, 2.5, -0.25)']);
assert.deepEqual(splatFoldLiteral(new THREE.Vector3(1.16, 1.08, 0.76)), ['vec3', 'vec3(1.16, 1.08, 0.76)']);
assert.deepEqual(splatFoldLiteral(new THREE.Vector2(0.4, 0.78)), ['vec2', 'vec2(0.4, 0.78)']);
assert.equal(splatFoldLiteral(new THREE.Texture()), null, 'a sampler never folds');
assert.equal(splatFoldLiteral([1, 2]), null, 'an array never folds');

// 4. The fold rewrites exactly the listed declarations, keeps the rest of a shared declaration and leaves the code alone.
const uniforms = {};
for (const name of SPLAT_FOLD_UNIFORMS) {
  const type = declared.get(name);
  uniforms[name] = { value: type === 'float' ? 0.5 : type === 'vec2' ? new THREE.Vector2(1, 2) : type === 'vec3' ? new THREE.Vector3(1, 2, 3) : new THREE.Vector4(1, 2, 3, 4) };
}
uniforms.uRoadTex = { value: 0.25 };
uniforms.uGroundTime = { value: 3 }; // live: must stay a uniform
const { source: folded, folded: names } = foldSplatUniforms(source, uniforms);
assert.deepEqual([...names].sort(), [...SPLAT_FOLD_UNIFORMS].sort(), 'every listed uniform folds');
assert.match(folded, /^const float uRoadTex = 0\.25;$/m);
assert.match(folded, /^uniform float uGroundTime;/m, 'a live uniform stays');
assert.match(folded, /^uniform float uTownWear|const float uTownWear = 0\.5;/m);
assert.doesNotMatch(folded, new RegExp(`^\\s*uniform (float|vec[234]) [^;]*\\b(${SPLAT_FOLD_UNIFORMS.join('|')})\\b`, 'm'),
  'no folded name is still declared a uniform');
const strip = (text) => text.replace(/^[ \t]*(uniform|const) [^;]+;[^\n]*$/gm, '').replace(/^\s*$/gm, '');
assert.equal(strip(folded), strip(source), 'the program\'s code is untouched: only declarations change');
const partial = foldSplatUniforms('uniform float uMicroAmp, uStrata, uRoadTex;\nuniform float uGroundTime;', { uStrata: { value: 0 }, uRoadTex: { value: 1 } });
assert.equal(partial.source, 'uniform float uMicroAmp;\nconst float uStrata = 0.0;\nconst float uRoadTex = 1.0;\nuniform float uGroundTime;');

// 5. The key follows the values: two maps with different terms never share a folded program; equal values share it.
const a = splatFoldSignature({ uSea: { value: 0 }, uStrata: { value: 0.5 } });
const b = splatFoldSignature({ uSea: { value: 1 }, uStrata: { value: 0.5 } });
const c = splatFoldSignature({ uStrata: { value: 0.5 }, uSea: { value: 0 } });
assert.notEqual(a, b);
assert.equal(a, c);

// 6. The material wiring: the hook folds after the splat source is in, the key carries the signature, a lab switch.
assert.match(terrain, /if \(splatFold\) shader\.fragmentShader = foldSplatUniforms\(shader\.fragmentShader, shader\.uniforms\)\.source;/);
assert.match(terrain, /mat\.customProgramCacheKey = \(\) => `world-terrain-splat-v54-[^\n]*\$\{splatFoldKey\}(?:\$\{splatPrune \? '-p1' : ''\})?`/);
globalThis.__COT_SPLAT_FOLD = false;
assert.equal(splatFoldEnabled(), false, 'a lab tool can keep the uniforms live');
delete globalThis.__COT_SPLAT_FOLD;
assert.equal(splatFoldEnabled(), true);

console.log(`terrainSplatFold.selftest: ${SPLAT_FOLD_UNIFORMS.length} map-constant uniforms fold to exact constants; code untouched; key follows values`);
