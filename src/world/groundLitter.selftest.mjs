import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createGroundLitter, GROUND_LITTER, groundLitterFadeSource, groundLitterProfile, groundLitterProfileIds, resolveGroundLitterConfig } from './groundLitter.ts';
import { MAP_IDS } from './maps/catalog.ts';

// environment density pass (2026-09-12): stones, clods and splinters strewn
// under the camera — deterministic cells, exclusions, shoulders, fade, wiring.

const height = (x, z) => 0.4 * Math.sin(x * 0.1) + 0.2 * Math.cos(z * 0.13);
const field = {
  getHeightAt: height,
  getHeightAtFast: height,
  _roadDist: (x) => Math.abs(x - 5),                               // a road along z at x = 5
  getGroundType: (x, z) => (Math.hypot(x + 20, z - 15) < 6 ? 'soft' : 'hard'),
  getNormalAt: (x, z) => (z > 30 ? { x: 0.6, y: 0.7, z: 0.39 } : { x: 0, y: 1, z: 0 }),
  _noVeg: (x) => x < -20,                                          // worked yards west
  getWaterMaskAt: (x, z) => (z < -20 ? 1 : 0),
};
const blocked = (x, y, z) => Math.hypot(x - 20, z + 10) < 5;       // a sealed building footprint

const settle = (litter, camera) => { for (let i = 0; i < 40 && (litter.getState().pending || !litter.getState().publishes); i++) litter.update(camera); };
const positions = (mesh) => {
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), out = [];
  for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m); p.setFromMatrixPosition(m); out.push([p.x, p.y, p.z]); }
  return out;
};

// defaults and disabling
const defaults = resolveGroundLitterConfig();
assert.equal(defaults.density, 1); assert.ok(defaults.stones > 0 && defaults.clods > 0 && defaults.splinters > 0);
assert.deepEqual(resolveGroundLitterConfig({ density: -3, shoulders: 4 }), { ...defaults, density: 0, shoulders: 1 });
{
  const off = createGroundLitter(field, { config: { density: 0 } });
  off.update({ x: 0, z: 0 }); off.update({ x: 0, z: 0 });
  assert.equal(off.group.visible, false); assert.equal(off.getState().builds, 0); assert.deepEqual(off.getState().counts, [0, 0, 0]);
  off.dispose();
}

// a settled ring under the camera
const litter = createGroundLitter(field, { seed: 11, blocked });
assert.equal(litter.group.name, 'ground-litter');
assert.equal(litter.group.children.length, 3);
assert.deepEqual(litter.meshes.map((m) => m.name), ['ground-litter-stones', 'ground-litter-clods', 'ground-litter-splinters']);
for (const mesh of litter.meshes) {
  assert.equal(mesh.castShadow, false, 'litter casts no shadow');
  assert.equal(mesh.receiveShadow, true, 'litter receives shadow');
  assert.equal(mesh.frustumCulled, false);
  assert.equal(mesh.material.customProgramCacheKey(), GROUND_LITTER.programKey);
}
litter.update({ x: 0, z: 0 });
assert.ok(litter.getState().pending > 0, 'a fresh ring builds over several updates');
assert.equal(litter.getState().publishes, 0, 'nothing is published until the ring is complete');
settle(litter, { x: 0, z: 0 });
const state = litter.getState();
assert.equal(state.pending, 0); assert.equal(state.publishes, 1); assert.equal(state.builds, 25); assert.equal(state.cached, 25);
const [stones, clods, splinters] = state.counts;
assert.ok(stones + clods + splinters > 400, `a ring carries hundreds of pieces (${state.counts})`);
assert.ok(stones > clods && clods > 0 && splinters > 0, `all three pools are populated (${state.counts})`);
const cap = 25 * GROUND_LITTER.candidatesPerCell;
for (const mesh of litter.meshes) assert.ok(mesh.count <= cap && mesh.count === mesh.instanceMatrix.updateRanges[0].count / 16);

// exclusions: carriageway, soft ground, water, steep faces, sealed footprints; ground fit
const all = litter.meshes.flatMap((mesh, kind) => positions(mesh).map((p) => [...p, kind]));
for (const [x, y, z, kind] of all) {
  assert.ok(Math.abs(x - 5) >= GROUND_LITTER.roadCoreM, `off the carriageway (${x.toFixed(2)})`);
  assert.ok(Math.hypot(x + 20, z - 15) >= 6, 'off soft ground');
  assert.ok(z >= -20, 'off water');
  assert.ok(z <= 30, 'off steep faces');
  assert.ok(Math.hypot(x - 20, z + 10) >= 5 - 0.3, 'out of sealed building footprints');
  assert.ok(y >= height(x, z) - 0.01 && y <= height(x, z) + 0.08, 'sits on the ground');
  if (x < -20) assert.equal(kind, 0, 'worked yards carry stones only');
  assert.ok(x >= -32 && x < 48 && z >= -32 && z < 48, 'inside the ±2-cell ring');
}
assert.ok(all.some(([x]) => x < -20), 'swept yards still carry a few stones');
// shoulders: gravel spill densest beside the road
const band = (lo, hi) => all.filter(([x, , z, kind]) => kind === 0 && z > -15 && z < 25 && Math.abs(x - 5) >= lo && Math.abs(x - 5) < hi).length;
const shoulderPerM = band(GROUND_LITTER.roadCoreM, GROUND_LITTER.shoulderM) / (2 * (GROUND_LITTER.shoulderM - GROUND_LITTER.roadCoreM));
const openPerM = band(12, 26) / (2 * 14);
assert.ok(shoulderPerM > openPerM * 1.3, `shoulders carry more gravel (${shoulderPerM.toFixed(2)} vs ${openPerM.toFixed(2)} per m)`);

// determinism and seeds
const twin = createGroundLitter(field, { seed: 11, blocked });
settle(twin, { x: 0, z: 0 });
assert.deepEqual(twin.getState().counts, state.counts);
assert.deepEqual([...twin.meshes[0].instanceMatrix.array.slice(0, stones * 16)], [...litter.meshes[0].instanceMatrix.array.slice(0, stones * 16)], 'same seed, same stones');
const other = createGroundLitter(field, { seed: 12, blocked });
settle(other, { x: 0, z: 0 });
assert.notDeepEqual([...other.meshes[0].instanceMatrix.array.slice(0, 64)], [...litter.meshes[0].instanceMatrix.array.slice(0, 64)], 'another seed strews differently');
twin.dispose(); other.dispose();

// streaming: a new cell builds only the fresh column, the cache serves a return trip
litter.update({ x: 17, z: 0 });
assert.equal(litter.getState().builds, 30, 'one cell east: five new cells, built inside one update');
assert.equal(litter.getState().pending, 0); assert.equal(litter.getState().publishes, 2); assert.equal(litter.getState().cached, 30);
litter.update({ x: 0, z: 0 });
assert.equal(litter.getState().pending, 0, 'the return trip is served from the cache');
assert.equal(litter.getState().publishes, 3); assert.equal(litter.getState().builds, 30);
assert.deepEqual(litter.getState().counts, state.counts, 'the cached ring republishes identically');
for (let i = 0; i < 140; i++) { litter.update({ x: i * 16, z: 400 }); settle(litter, { x: i * 16, z: 400 }); }
assert.ok(litter.getState().cached <= GROUND_LITTER.cacheCells, 'the cell cache is bounded');

// pool mix
{
  const stonesOnly = createGroundLitter(field, { seed: 3, config: { clods: 0, splinters: 0 } });
  settle(stonesOnly, { x: 0, z: 0 });
  const [s, c, p] = stonesOnly.getState().counts;
  assert.ok(s > 0 && c === 0 && p === 0, `a stones-only mix fills one pool (${s}, ${c}, ${p})`);
  stonesOnly.dispose();
}

const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
// per-map profiles: every id names a real map, tints stay stone-dark, unknown maps run defaults
for (const id of groundLitterProfileIds()) assert.ok(MAP_IDS.includes(id), `${id} is a map`);
for (const id of MAP_IDS) {
  const profile = resolveGroundLitterConfig(groundLitterProfile(id));
  assert.ok(profile.stoneTint.every((c) => c <= 0.25), `${id}: stones stay darker than sun-dried dirt`);
  assert.ok(profile.density >= 0 && profile.density <= 1.3, `${id}: density inside the tier's budget`);
}
assert.deepEqual(groundLitterProfile('verdant'), {}, 'temperate fields run the defaults');
assert.equal(resolveGroundLitterConfig(groundLitterProfile('desert')).splinters, 0, 'no timber splinters on the wadi');
assert.ok(resolveGroundLitterConfig(groundLitterProfile('winter')).density < 0.5, 'snow keeps a few dark stones');
assert.match(map, /groundLitterProfile\(config\.id\)/, 'the world reads the profile by map id');

// the material joins the engine's cascaded-shadow setup through the hook and is released with the tier
{
  const calls = [];
  const released = [];
  const csm = createGroundLitter(field, { seed: 5, setupMaterial: (material, hook) => { calls.push({ material, hook }); material.onBeforeCompile = hook; }, releaseMaterial: (m) => released.push(m) });
  assert.equal(calls.length, 1, 'one shared material is set up once');
  assert.equal(calls[0].material, csm.meshes[0].material);
  assert.equal(typeof calls[0].hook, 'function');
  const shader = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '' };
  calls[0].hook(shader);
  assert.match(shader.vertexShader, /uLitterFade/, 'the fade hook is what the engine composes after its own patch');
  csm.dispose();
  assert.deepEqual(released, [calls[0].material], 'dispose releases the material from the shadow setup');
}
assert.match(map, /setupMaterial: \(material, hook\) => engineCtx\.setupShadowMaterial\?\.\(material, hook\)/, 'the world folds the litter material into the cascaded-shadow setup');
assert.match(map, /releaseMaterial: \(material\) => engineCtx\.releaseShadowMaterial\?\.\(material\)/, 'and releases it with the world');

// fade shader and program key
const fade = groundLitterFadeSource();
assert.match(fade, /uniform vec2 uLitterFade;/);
assert.match(fade, /distance\(litterAnchor, cameraPosition\)/);
assert.match(fade, /transformed \*= 1\.0 - smoothstep\(uLitterFade\.x, uLitterFade\.y, litterDist\);/);
assert.ok(GROUND_LITTER.fadeOutM <= GROUND_LITTER.cellM * GROUND_LITTER.ring, 'the fade completes inside the ring');

// disposal
{
  const parent = new THREE.Group(); parent.add(litter.group);
  let disposed = 0;
  for (const mesh of litter.meshes) mesh.geometry.addEventListener('dispose', () => { disposed++; });
  litter.meshes[0].material.addEventListener('dispose', () => { disposed++; });
  litter.dispose();
  assert.equal(parent.children.length, 0); assert.equal(disposed, 4, 'three geometries and the shared material dispose once');
  assert.equal(litter.getState().cached, 0);
}

// wiring: the world owns one litter tier fed by the sealed footprint query
assert.match(map, /createGroundLitter\(heightField, \{/, 'the world builds the litter tier on its height field');
assert.match(map, /blocked: createGroundCoverClearance\(queryObstacles\)/, 'litter keeps out of sealed footprints');
assert.match(map, /litter\.update\(cameraPos\)/, 'the frame update streams litter cells');
assert.match(map, /litter\.dispose\(\)/, 'litter is released with the world');
assert.match(map, /config\.vegetation[^\n]*\.litter/, 'maps tune the tier through their vegetation config');
console.log(`groundLitter.selftest: ring ${state.counts.join('/')} pieces, exclusions, shoulders, determinism, streaming, mix, fade, disposal and wiring PASS`);
