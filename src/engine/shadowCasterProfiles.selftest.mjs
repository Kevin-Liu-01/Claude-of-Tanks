import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  SHADOW_FOOTPRINT_MIN_TEXELS, SHADOW_LAW_MIN_SUN_ELEVATION_RAD, SHADOW_REACH_MARGIN_M,
  csmSampledFromM, evaluateShadowCasterMask, evaluateShadowCasterProfiles, instanceShadowSpheres, shadowFootprintM,
} from './shadowCasterProfiles.ts';
import {
  SHADOW_CASTER_ALL_CASCADES, setShadowCasterDynamicMask, setShadowCasterProfile, shadowCasterDynamicMaskOf,
} from './renderLayers.ts';

// Round 79 (2026-09-28, the performance lane): the three caster laws — content, footprint, reach — evaluated
// against synthetic cascades with three's real Frustum / InstancedMesh / Matrix4, and the lighting wiring by text.

// --- the CSM sampled-from law mirrors three's fade shader exactly
{
  const shader = readFileSync(new URL('../../node_modules/three/examples/jsm/csm/CSMShader.js', import.meta.url), 'utf8');
  assert.match(shader, /float linearDepth = \(vViewPosition\.z\) \/ \(shadowFar - cameraNear\);/, 'linear depth is the view depth over (shadowFar − cameraNear)');
  assert.match(shader, /margin = 0\.25 \* pow\( closestEdge, 2\.0 \);/, 'the fade margin is a quarter of the edge squared');
  assert.match(shader, /csmx = cascade\.x - margin \/ 2\.0;/, 'a cascade is sampled from its start less half the margin');
  const near = 0.5, far = 700;
  assert.equal(csmSampledFromM(0, near, far, true), 0, 'the first cascade is sampled from the camera');
  const x = 320 / 700;
  assert.ok(Math.abs(csmSampledFromM(x, near, far, true) - (x - 0.125 * x * x) * (far - near)) < 1e-9, 'fade: x − x²/8 of the range');
  assert.ok(Math.abs(csmSampledFromM(x, near, far, false) - x * (far - near)) < 1e-9, 'no fade: the break itself');
  assert.ok(csmSampledFromM(x, near, far, true) < csmSampledFromM(x, near, far, false), 'the fade reaches the map earlier');
  assert.equal(csmSampledFromM(-1, near, far, true), 0, 'a negative break is clamped');
}

// --- the footprint law
{
  assert.equal(shadowFootprintM(0, 0.5), 0, 'no height: no footprint');
  assert.ok(Math.abs(shadowFootprintM(1, Math.PI / 4) - 1) < 1e-9, 'a 45° sun casts a shadow as long as the caster is tall');
  assert.ok(shadowFootprintM(1, 24 * Math.PI / 180) > 2.2 && shadowFootprintM(1, 24 * Math.PI / 180) < 2.3, 'Monsoon Ridge: 2.25 m per metre of height');
  assert.equal(shadowFootprintM(1, SHADOW_LAW_MIN_SUN_ELEVATION_RAD / 2), Infinity, 'under the elevation floor the footprint is unbounded');
  assert.equal(shadowFootprintM(1, -0.2), Infinity, 'a sun below the horizon never bounds a shadow');
  assert.equal(SHADOW_FOOTPRINT_MIN_TEXELS, 2);
  assert.equal(SHADOW_REACH_MARGIN_M, 8);
}

function frustumAround(x, z, half) {
  // an orthographic light box looking straight down on a square of the ground
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 400);
  camera.position.set(x, 200, z);
  camera.lookAt(x, 0, z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
}
const object = new THREE.Object3D();
const sun24 = 24 * Math.PI / 180;
const cascades = [
  { scheduled: true, frustum: frustumAround(0, 0, 95), texelM: 0.093, sampledFromM: 0 },
  { scheduled: true, frustum: frustumAround(0, 0, 200), texelM: 0.19, sampledFromM: 80 },
  { scheduled: true, frustum: frustumAround(0, 0, 345), texelM: 0.33, sampledFromM: 170 },
  { scheduled: true, frustum: frustumAround(0, 0, 760), texelM: 1.48, sampledFromM: 303 },
];
const evaluation = { cascades, sunElevationRad: sun24 };

// --- the content law: registered spheres against each cascade's frustum
{
  const far = { heightM: 30, spheres: new Float32Array([300, 0, 0, 5]) };
  assert.equal(evaluateShadowCasterMask(object, far, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1100, 'a piece 300 m out reaches only the two far boxes');
  const near = { heightM: 30, spheres: new Float32Array([10, 0, 0, 5, 300, 0, 0, 5]) };
  assert.equal(evaluateShadowCasterMask(object, near, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'any piece inside a box keeps the draw');
  const none = { heightM: 30, spheres: new Float32Array(0) };
  assert.equal(evaluateShadowCasterMask(object, none, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b0000, 'no content: no cascade');
  const bare = { heightM: 30 };
  assert.equal(evaluateShadowCasterMask(object, bare, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'no spheres: the object\'s own bounds decide, as three does');
  const unscheduled = cascades.map((c, i) => (i === 0 ? { ...c, scheduled: false, frustum: null } : c));
  assert.equal(evaluateShadowCasterMask(object, far, { cascades: unscheduled, sunElevationRad: sun24 }, 0b1111) & 0b1111, 0b1101, 'an unscheduled cascade keeps its previous bit');
  assert.equal(evaluateShadowCasterMask(object, far, { cascades: unscheduled, sunElevationRad: sun24 }, 0b1110) & 0b1111, 0b1100);
}

// --- the footprint law: a shadow shorter than two texels of a map is not drawn into it
{
  const fence = { heightM: 1.06, spheres: new Float32Array([5, 0, 0, 2]) }; // 2.4 m at 24°
  assert.equal(evaluateShadowCasterMask(object, fence, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b0111, 'a metre-high fence casts nowhere into the 1.48 m far map');
  const wall = { heightM: 4, spheres: new Float32Array([5, 0, 0, 2]) }; // 9 m
  assert.equal(evaluateShadowCasterMask(object, wall, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'a four-metre wall reads in every map');
  const lowSun = { cascades, sunElevationRad: 13 * Math.PI / 180 };
  assert.equal(evaluateShadowCasterMask(object, fence, lowSun, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'Whiteout\'s 13° sun stretches the fence shadow to 4.6 m: kept');
  const grazing = { cascades, sunElevationRad: 0.01 };
  assert.equal(evaluateShadowCasterMask(object, fence, grazing, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'under the elevation floor nothing is hidden by footprint');
  const unknown = { heightM: 0, spheres: new Float32Array([5, 0, 0, 2]) };
  assert.equal(evaluateShadowCasterMask(object, unknown, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'an unknown height never masks');
}

// --- the reach law: near-tier content cannot shadow a cascade sampled beyond its reach
{
  const nearTier = { heightM: 20, reachM: 230 }; // footprint 44.9 m at 24°: reaches 283 m, under the far map's 303 m
  assert.equal(evaluateShadowCasterMask(object, nearTier, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b0111, 'the near tier leaves the far cascade');
  const promoted = { heightM: 20, reachM: 400 }; // a scope-promoted tree stands 400 m out
  assert.equal(evaluateShadowCasterMask(object, promoted, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'a promoted tree keeps the far cascade');
  const whiteout = { cascades, sunElevationRad: 13 * Math.PI / 180 }; // footprint 86.6 m: 230 + 8 + 86.6 = 324.6 > 303
  assert.equal(evaluateShadowCasterMask(object, nearTier, whiteout, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'a low sun reaches the far map: kept');
  const noHeight = { heightM: 0, reachM: 100 };
  assert.equal(evaluateShadowCasterMask(object, noHeight, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'no height: the reach law cannot bound the shadow, nothing hidden');
  assert.ok(230 + SHADOW_REACH_MARGIN_M + shadowFootprintM(20, sun24) < cascades[3].sampledFromM);
}

// --- instanced content: spheres from the instance matrices, refreshed when they change
{
  const geometry = new THREE.BoxGeometry(2, 1, 2);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 3);
  const m = new THREE.Matrix4();
  mesh.setMatrixAt(0, m.makeTranslation(300, 0, 0));
  mesh.setMatrixAt(1, m.makeTranslation(310, 0, 0));
  mesh.setMatrixAt(2, m.makeScale(3, 3, 3).setPosition(320, 0, 0));
  mesh.updateMatrixWorld(true);
  const first = instanceShadowSpheres(mesh);
  assert.equal(first.count, 3);
  assert.ok(Math.abs(first.spheres[3] - geometry.boundingSphere.radius) < 1e-6, 'unit scale keeps the geometry radius');
  assert.ok(Math.abs(first.spheres[11] - geometry.boundingSphere.radius * 3) < 1e-6, 'the radius follows the instance scale');
  assert.equal(first.spheres[8], 320);
  const profile = { heightM: 5, instanced: true };
  assert.equal(evaluateShadowCasterMask(mesh, profile, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1100, 'instances 300 m out reach the two far boxes');
  assert.equal(instanceShadowSpheres(mesh).spheres, first.spheres, 'unchanged matrices reuse the spheres');
  mesh.setMatrixAt(0, m.identity().setPosition(5, 0, 0));
  mesh.instanceMatrix.needsUpdate = true;
  assert.equal(evaluateShadowCasterMask(mesh, profile, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b1111, 'a moved instance is seen after its upload marks the buffer');
  mesh.count = 0;
  assert.equal(evaluateShadowCasterMask(mesh, profile, evaluation, SHADOW_CASTER_ALL_CASCADES) & 0b1111, 0b0000, 'count zero: no content anywhere');
  mesh.count = 3;
  const grown = new THREE.InstancedMesh(geometry, mesh.material, 1);
  grown.setMatrixAt(0, m.identity().setPosition(0, 0, 0));
  assert.equal(instanceShadowSpheres(grown).count, 1);
  geometry.dispose(); mesh.material.dispose();
}

// --- the frame evaluation writes dynamic masks for every registered profile (and only when they change)
{
  const a = new THREE.Object3D(), b = new THREE.Object3D();
  setShadowCasterProfile(a, { heightM: 30, spheres: new Float32Array([300, 0, 0, 5]) });
  setShadowCasterProfile(b, { heightM: 1.06, spheres: new Float32Array([5, 0, 0, 2]) });
  assert.equal(evaluateShadowCasterProfiles(evaluation), 2);
  assert.equal(shadowCasterDynamicMaskOf(a) & 0b1111, 0b1100);
  assert.equal(shadowCasterDynamicMaskOf(b) & 0b1111, 0b0111);
  setShadowCasterDynamicMask(a, 0b1111);
  const idle = { cascades: cascades.map((c) => ({ ...c, scheduled: false, frustum: null })), sunElevationRad: sun24 };
  evaluateShadowCasterProfiles(idle);
  assert.equal(shadowCasterDynamicMaskOf(a), 0b1111, 'no scheduled cascade: the masks stand');
  setShadowCasterProfile(a, null); setShadowCasterProfile(b, null);
  assert.equal(evaluateShadowCasterProfiles(evaluation), 0);
}

// --- the lighting wiring: evaluated after the r8 proxies every frame and before the primed maps, desktop tiers only
{
  const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
  assert.match(lighting, /updateCasterProxies\(csm\.lights, scene, false\);\n\s+nearVehiclePolicy\.update\(\);\n\s+evaluateCasterProfiles\(false\);/, 'the frame evaluation follows the proxy compaction and the near-hull selection');
  assert.match(lighting, /updateCasterProxies\(csm\.lights, scene2, true\);[^\n]*\n\s+evaluateCasterProfiles\(true\);/, 'the priming pass evaluates every cascade');
  assert.match(lighting, /function evaluateCasterProfiles\(all: boolean\): void \{\n\s+if \(mobileTier\) return;/, 'the phones keep their cascades as they are');
  assert.match(lighting, /sample\.texelM = \(shadowCam\.right - shadowCam\.left\) \/ Math\.max\(1, shadow\.mapSize\.x\);/, 'the live texel size');
  assert.match(lighting, /csmSampledFromM\(i === 0 \? 0 : csm\.breaks\[i - 1\], camera\.near, far, csm\.fade\)/, 'the sampled range from the live breaks and fade');
  assert.match(lighting, /Math\.asin\(Math\.max\(-1, Math\.min\(1, -csm\.lightDirection\.y\)\)\)/, 'the sun elevation from the CSM light direction');
}
console.log('shadowCasterProfiles.selftest: the content, footprint and reach laws, the CSM sampled-from formula against three\'s shader, instanced sphere refresh, the frame evaluation and the lighting wiring pinned');
