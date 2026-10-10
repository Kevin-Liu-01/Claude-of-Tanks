// structureOcclusion.selftest — 2026-10-10 (the shadows lane, overhaul r4): cavity occlusion for structure pixels only.
// The scene-alpha bands (opaque 2 + v, vehicle 4 + v, structure 6 + v) and every decoder that reads them, the law's CPU
// twins, the GLSL block, the installed opaque chunk (the real rig in Node), and the wiring: the define from the material's
// flag, the props' structure kinds, the aerial pass under the cavity lever, the tiers.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STRUCTURE_ALPHA_MIN, STRUCTURE_ALPHA_TAG, STRUCTURE_OCCLUSION_BIAS, STRUCTURE_OCCLUSION_EXCLUDED_KINDS, STRUCTURE_OCCLUSION_GLSL,
  STRUCTURE_OCCLUSION_RANGE_M, STRUCTURE_OCCLUSION_STRENGTH, sceneAlphaClass, structureCavityFromHorizons, structureOcclusionShade,
} from './structureOcclusion.ts';
import { VEHICLE_ALPHA_MIN, VEHICLE_ALPHA_TAG } from './vehicleOcclusion.ts';
import { contactShadowSunVisibility } from './contactShadows.ts';
import { PRESETS } from './quality.ts';

const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b} (tol ${tol})`);
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ---- 1. the bands
for (const v of [0, 0.5, 1]) {
  assert.equal(sceneAlphaClass(2 + v), 'opaque', `an opaque lit pixel (2 + ${v})`);
  assert.equal(sceneAlphaClass(2 + VEHICLE_ALPHA_TAG + v), 'vehicle', `a vehicle pixel (4 + ${v})`);
  assert.equal(sceneAlphaClass(2 + STRUCTURE_ALPHA_TAG + v), 'structure', `a structure pixel (6 + ${v})`);
  near(contactShadowSunVisibility(2 + STRUCTURE_ALPHA_TAG + v), v, 1e-12, `the contact march decodes a structure's visibility (${v})`);
  near(contactShadowSunVisibility(2 + VEHICLE_ALPHA_TAG + v), v, 1e-12, `and still a vehicle's (${v})`);
}
assert.equal(sceneAlphaClass(0.6), 'card', 'a grass or leaf card');
assert.ok(2 + VEHICLE_ALPHA_TAG + 1 < STRUCTURE_ALPHA_MIN && STRUCTURE_ALPHA_MIN < 2 + STRUCTURE_ALPHA_TAG, 'the bands never overlap');
assert.ok(STRUCTURE_ALPHA_MIN > VEHICLE_ALPHA_MIN, 'the structure band sits over the vehicle band');

// ---- 2. the law
assert.equal(structureCavityFromHorizons([]), 0);
near(structureCavityFromHorizons([1 - STRUCTURE_OCCLUSION_BIAS, 0]), 0.5, 1e-12, 'one direction fully occluded of two');
near(structureOcclusionShade(1, 0), 1 - STRUCTURE_OCCLUSION_STRENGTH, 1e-12, 'a reveal in shade: the full darkening');
near(structureOcclusionShade(1, 1), 1, 1e-12, 'a sunlit face keeps its sun');
near(structureOcclusionShade(1, 0, 0), 1, 1e-12, 'past the range: nothing');

// ---- 3. the GLSL block and the decoders
const g = STRUCTURE_OCCLUSION_GLSL;
assert.match(g, new RegExp(`if \\( alpha < ${STRUCTURE_ALPHA_MIN.toFixed(4)} \\) return 1\\.0;`), 'only structure pixels');
assert.match(g, /float sunVis = clamp\( alpha - 6\.0, 0\.0, 1\.0 \);/, 'the structure band\'s visibility');
assert.match(g, /return 1\.0 - cotStructureCavity\( uv, P, N, dist \) \* fade \* uStructOccStrength \* ambShare;/, 'only the ambient share');
assert.match(g, /if \( h > best && texture2D\( tDiffuse, q \)\.a >= 1\.5 \) best = h;/, 'only opaque lit surfaces occlude');
assert.doesNotMatch(g, /interleavedGradientNoise|fract\( sin|gl_FragCoord/, 'a fixed pattern: no per-pixel noise');
const contact = read('./contactShadows.ts');
assert.match(contact, /if \( a >= \$\{f\(STRUCTURE_ALPHA_MIN\)\} \) return clamp\( a - 6\.0, 0\.0, 1\.0 \);\s*if \( a >= \$\{f\(VEHICLE_ALPHA_MIN\)\} \) return clamp\( a - 4\.0, 0\.0, 1\.0 \);/, 'the contact march\'s GLSL decode');
const vehicle = read('./vehicleOcclusion.ts');
assert.match(vehicle, /if \( alpha >= 5\.5 \) return 1\.0;/, 'the vehicles\' cavity never takes a structure pixel');
assert.equal(STRUCTURE_ALPHA_MIN, 5.5, 'the literal in vehicleOcclusion.ts (an import there would be a cycle)');

// ---- 4. the installed opaque chunk (the real rig, in Node)
{
  const THREE = await import('three');
  const { createLighting } = await import('./lighting.ts');
  createLighting(new THREE.Scene(), new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 4000), new THREE.Vector3(0.4, 0.6, 0.3).normalize());
  assert.ok(THREE.ShaderChunk.opaque_fragment.includes(`gl_FragColor.a = 2.0 + cotSunVis;\n#ifdef COT_STRUCTURE_PIXEL\ngl_FragColor.a += ${STRUCTURE_ALPHA_TAG.toFixed(1)};\n#endif`),
    'the opaque chunk adds the structure tag under its define, after the 2 + v write');
}

// ---- 5. the wiring
const lighting = read('./lighting.ts');
assert.match(lighting, /if \(mat\.userData\.cotStructurePixel === true\) \(mat\.defines \?\?= \{\}\)\.COT_STRUCTURE_PIXEL = '';/, 'the define from the material\'s flag');
const props = read('../world/props.ts');
assert.match(props, /if \(!STRUCTURE_OCCLUSION_EXCLUDED_KINDS\.has\(materialKind\)\) material\.userData\.cotStructurePixel = true;/, 'the props\' structure kinds tag their pixels');
for (const kind of ['rock', 'fieldStone', 'fieldMud', 'ballast', 'pole', 'glass', 'vehicle']) assert.ok(STRUCTURE_OCCLUSION_EXCLUDED_KINDS.has(kind), `${kind} is not a structure`);
const post = read('./post.ts');
assert.match(post, /if \( uStructOcc > 0\.5 && texel\.a >= \$\{STRUCTURE_ALPHA_MIN\.toFixed\(1\)\} && -viewZ < \$\{STRUCTURE_OCCLUSION_RANGE_M\.toFixed\(1\)\} \) \{\s*texel\.rgb \*= cotStructureCavityShade\( vUv, uCamPos \+ ray \* rayT, -viewZ, texel\.a \);/, 'the aerial pass');
assert.ok(post.indexOf('cotStructureCavityShade( vUv') < post.indexOf('texel.a = 1.0;'), 'consumed before the pass restores alpha');
assert.match(post, /aerial\.uniforms\.uStructOcc\.value = lightFx\.vehicleOcclusion && preset\.structureOcclusion === true && lightTune\('STRUCT_OCC', 1\) > 0 \? 1 : 0;/, 'the cavity lever and the tier\'s switch');
for (const name of ['ultra', 'high']) assert.equal(PRESETS[name].structureOcclusion, true, `${name} takes the term`);
for (const name of ['medium', 'low', 'mobile', 'mobile-low', 'mobile-high']) assert.equal(PRESETS[name].structureOcclusion, undefined, `${name} does not`);

console.log(`structureOcclusion.selftest: the alpha bands (opaque 2, vehicle 4, structure 6 + v) and their decoders, the cavity law (radius ${0.9} m, strength ${STRUCTURE_OCCLUSION_STRENGTH}, range ${STRUCTURE_OCCLUSION_RANGE_M} m), the GLSL, the installed chunk and the wiring PASS`);
