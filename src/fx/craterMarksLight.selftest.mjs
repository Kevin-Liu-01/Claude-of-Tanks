// craterMarksLight.selftest.mjs — (orange-rings-230, 2026-10-21) the crater marks take the ground's own light.
// The defect: Steinburg's daylight streets showed hard orange discs about 7 m across, a darker ring inside, on the map's
// pre-placed shell scars (world/mapCraters.ts; the marks on hard ground at (-63.21, 82.70), (-51.87, 80.04),
// (-37.94, -82.00) and (-95.32, 35.65), every one within 5 cm of a ring in the captures). Their drawer, fx/craterMarks.ts,
// was a ShaderMaterial that lit itself: the sun's full colour through a 0.35 wrap, no cascade shadow, a hemisphere guess
// for the sky. A mark in a building's shadow, under a low sun or under the moon drew several times brighter than the
// ground round it; every map lays them (9-135 sites a map, the collision manifests' `craters`).
// Pinned:
//  1. the mark is three's lit standard material: transparent, no depth write, receiving the cascades' shadow and never
//     casting, receiver-only like the terrain it lies on;
//  2. it registers through the engine's cascade setup with its shader hook, and the runtime (createFx) registers both of
//     its instances (the battle's craters, the map's) that way;
//  3. its patch applies to three's own standard program and writes only the surface — the albedo and coverage where the
//     program lays its albedo, the relief's normal over the draped ground's before the lights, a heat emission — with no
//     light of its own (no sun colour, sky colour, sun direction, wrap or fog of its own);
//  4. a slot's draped normals: up on level ground, the slope's on a slope, a dug bowl's walls turned inward.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createCraterMarks } from './craterMarks.ts';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

// ---- 1. a lit material, shadowed as the ground is
const marks = createCraterMarks();
const material = marks.mesh.material;
assert.equal(material.isMeshStandardMaterial, true, `the marks are lit by the scene (${material.type}, not a light of their own)`);
assert.equal(material.isShaderMaterial, undefined, 'no self-lit shader material');
assert.ok(material.transparent && material.depthWrite === false, 'a transparent decal that writes no depth');
assert.equal(marks.mesh.receiveShadow, true, 'the cascades shadow the mark');
assert.equal(marks.mesh.castShadow, false, 'and it casts none');
assert.equal(material.userData.cotShadowReceiverOnly, true, 'receiver-only, as the terrain under it (its shadow edges meet the ground\'s)');
assert.equal(material.customProgramCacheKey(), 'fx-crater-marks-lit-v1', 'a program of its own among the hooked materials');

// ---- 2. registered with the engine's cascades, with its hook
{
  const seen = [];
  const lit = createCraterMarks({ setupMaterial: (m, hook) => { seen.push({ m, hook }); } });
  assert.equal(seen.length, 1, 'one registration');
  assert.equal(seen[0].m, lit.mesh.material, 'of the mark\'s own material');
  assert.equal(typeof seen[0].hook, 'function', 'with its shader hook (the cascades replace onBeforeCompile and chain it)');
  assert.equal(lit.mesh.material.onBeforeCompile, seen[0].hook, 'a setup that keeps no hook still compiles the surface');
}
{
  const registered = [];
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1,
    setupShadowMaterial: (m, hook) => { registered.push({ m, hook }); }, releaseShadowMaterial: () => {} },
  { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 3 });
  const meshes = [];
  fx.group.traverse((o) => { if (o.name === 'fx-crater-marks') meshes.push(o); });
  assert.equal(meshes.length, 2, 'the battle\'s craters and the map\'s');
  for (const mesh of meshes) {
    const entry = registered.find((r) => r.m === mesh.material);
    assert.ok(entry, 'each registered through the engine\'s setupShadowMaterial');
    assert.equal(typeof entry.hook, 'function', 'with the marks\' hook');
  }
}

// ---- 3. the patch: three's standard program, the surface only
const compiled = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
material.onBeforeCompile(compiled);
const vert = compiled.vertexShader, frag = compiled.fragmentShader;
assert.equal(compiled.uniforms.uTime, material.userData.uniforms.uTime, 'the clock is the mark\'s own uniform');
assert.equal(compiled.uniforms.uHeatView, material.userData.uniforms.uHeatView, 'and the heat lens');
const at = (src, s) => { const i = src.indexOf(s); assert.ok(i >= 0, `the program carries ${s}`); return i; };
assert.ok(at(vert, 'vGroundN = normal;') > at(vert, '#include <begin_vertex>'), 'the draped ground\'s normal rides to the fragment');
assert.ok(at(vert, 'if ( uTime - aInfo.x < 0.0 ) gl_Position = vec4( 0.0, 0.0, 2.0, 1.0 );') > at(vert, '#include <project_vertex>'),
  'a slot born after the clock draws nothing');
assert.ok(at(frag, 'diffuseColor = vec4( cotMarkCol, cotMarkA );') > at(frag, '#include <map_fragment>'), 'the surface is the program\'s albedo');
const normalAt = at(frag, 'normal = normalize( ( viewMatrix * vec4( cotMarkNW, 0.0 ) ).xyz );');
assert.ok(normalAt > at(frag, '#include <normal_fragment_maps>') && normalAt < at(frag, '#include <lights_fragment_begin>'),
  'the relief\'s normal, set before the program\'s lights read it');
assert.match(frag, /vec3 cotMarkNW = normalize\( normalize\( vGroundN \) \+ cotMarkN - vec3\( 0\.0, 1\.0, 0\.0 \) \);/,
  'tilting the draped ground\'s own normal (the ground\'s slope and a bowl\'s walls come with it)');
assert.ok(at(frag, 'totalEmissiveRadiance += cotMarkHeat;') > at(frag, '#include <emissivemap_fragment>'), 'the heat lens\'s glow is emitted');
const surface = frag.slice(frag.indexOf('void cotCraterMark('), frag.indexOf('void main() {'));
assert.ok(surface.length > 1000, 'the surface function precedes main');
for (const [re, what] of [[/uSunCol|uSkyCol|uSunDir/, 'a sun or sky of its own'], [/dot\( n, uSunDir \)|0\.35 \+ 0\.65 \* ndl/, 'the wrapped sun'],
  [/fogColor|fogFactor/, 'a fog of its own'], [/gl_FragColor/, 'an output of its own']]) {
  assert.doesNotMatch(surface, re, `the surface carries no ${what}`);
}
assert.equal(frag.split('#include <lights_fragment_begin>').length, 2, 'three\'s own lights light it, once');
assert.equal(frag.split('#include <fog_fragment>').length, 2, 'and three\'s own fog');

// ---- 4. the draped normals
const VERTS = 1 + 28 * 6;
const N = marks.mesh.geometry.getAttribute('normal').array;
const slotNormals = (slot) => Array.from({ length: VERTS }, (_, v) => [N[(slot * VERTS + v) * 3], N[(slot * VERTS + v) * 3 + 1], N[(slot * VERTS + v) * 3 + 2]]);
marks.stamp(0, 0, 1.5, 'concrete', 'he', 0.4, 0, () => 0); // mark slot 160: level ground
for (const n of slotNormals(160)) assert.ok(Math.abs(n[0]) < 1e-6 && Math.abs(n[1] - 1) < 1e-6 && Math.abs(n[2]) < 1e-6, `level ground is up (${n})`);
marks.stamp(40, 0, 1.5, 'soil', 'he', 0.4, 0, (x) => 0.3 * x); // slot 161: a 0.3 slope rising to +x
{
  const want = new THREE.Vector3(-0.3, 1, 0).normalize();
  for (const n of slotNormals(161)) assert.ok(Math.hypot(n[0] - want.x, n[1] - want.y, n[2] - want.z) < 1e-4, `the slope's normal (${n})`);
}
const bowl = (x, z) => -0.8 * Math.max(0, 1 - ((x - 10) ** 2 + (z - 20) ** 2) / (2 * 2));
marks.crater({ x: 10, z: 20, radiusM: 2, p1: 0, p2: 0, p3: 0, surface: 'soil', climate: 'vegetated', explosive: true, seed: 0.5, birth: 0 }, bowl);
{
  // crater slot 0, disc reach 2.4 R = 4.8 m: its first ring (0.8 m out) lies on the bowl's wall, turned toward the centre
  const ring1 = slotNormals(0).slice(1, 1 + 28);
  for (let s = 0; s < 28; s++) {
    const a = (s / 28) * Math.PI * 2, out = [Math.cos(a), Math.sin(a)];
    assert.ok(ring1[s][0] * out[0] + ring1[s][2] * out[1] < -0.2, `the wall faces in at ${s} (${ring1[s]})`);
  }
  const outer = slotNormals(0).slice(1 + 5 * 28);
  for (const n of outer) assert.ok(n[1] > 0.999, `past the bowl the ground is level again (${n})`);
}
marks.update(12.5);
assert.equal(material.userData.uniforms.uTime.value, 12.5, 'the clock is the marks\' only per-frame write');
console.log('craterMarksLight.selftest: the crater marks are lit as the ground they lie on (three\'s standard program, the engine\'s cascades, receiver-only), both instances registered, the surface patch carries no light of its own, draped normals follow the ground');
