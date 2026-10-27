// foliageSeeThrough.selftest.mjs — (item 259) Settings' See-through foliage is off by default, and off, no foliage clears
// for the camera. Copyright © 2026 Kevin B. Liu.
// The owner, 2026-10-26: "disable the thing that lets u see through greenery. it can be an optional thing u can enable in
// settings". On a real vegetation build (trees and shrubs), driven with a chase focus standing in a near crown:
//   - the choice reads off from an empty or blocked storage, and keeps what the player set;
//   - off (the default): the occlusion sweep never runs, every tree's and shrub's fade stays 0, the scope corridor's
//     target stays 0 while scoped, and the near dissolve keeps its lens band (the crowns' and shrubs' reach, and the
//     cluster-free band's share);
//   - on: the crown in the capsule fades, the corridor opens with the scope, the near reach is the trees round 4 one;
//   - off again: every fade snaps to 0 at once, and no later frame runs the sweep;
//   - the world frame passes the choice every frame, the map gates the tall grass's corridor on it, and the Settings
//     row writes it (Graphics).
// A construction receipt: no GPU (the shaders' text is vegetationProgramKey.selftest's).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createFoliageSeeThroughPreference, FOLIAGE_SEE_THROUGH_STORAGE_KEY } from './foliageSeeThrough.ts';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

// --- the choice ---
const store = new Map();
const storage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) };
assert.equal(createFoliageSeeThroughPreference(() => storage).get(), false, 'off by default');
const pref = createFoliageSeeThroughPreference(() => storage);
pref.set(true);
assert.equal(store.get(FOLIAGE_SEE_THROUGH_STORAGE_KEY), 'on');
assert.equal(createFoliageSeeThroughPreference(() => storage).get(), true, 'a later page reads the choice');
const blocked = createFoliageSeeThroughPreference(() => ({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }));
assert.equal(blocked.get(), false, 'a blocked storage reads off');
blocked.set(true);
assert.equal(blocked.get(), true, 'and the session keeps the choice');

// --- the world: a small real build ---
const saved = new Map(['document', 'ImageData'].map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
class ImageData { constructor(data, width, height) {
  this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
  this.width = typeof data === 'number' ? data : width;
  this.height = typeof data === 'number' ? width : height;
} }
globalThis.ImageData = ImageData;
globalThis.document = { createElement() {
  const canvas = { width: 0, height: 0 };
  const context = new Proxy({
    createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
    getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
  }, { get: (target, key) => target[key] ?? (() => {}) });
  canvas.getContext = () => context;
  return canvas;
} };
const renderer = {
  getRenderTarget: () => null, setRenderTarget() {}, render() {}, clear() {}, getClearColor: (target) => target,
  getClearAlpha: () => 1, setClearColor() {}, autoClear: true, shadowMap: { autoUpdate: true }, xr: { enabled: false },
};
const engine = { renderer, setupShadowMaterial() {}, scene: { userData: { sunDirWorld: new THREE.Vector3(0.4, 0.8, 0.3).normalize() } } };
const cfg = { vegetation: { species: ['oak', 'pine'], clusterCount: 6, loneCount: 24, rimCount: 0, grassDensity: 0, bushCount: 80, belts: [],
  authoredTrees: [] } };
const veg = createVegetation(createHeightField(1337), engine, 1337, cfg);
try {
  const fwd = new THREE.Vector3(0, 0, 1);
  // the camera over a lone tree's neighbourhood partitions its near trees; the focus stands in that tree's crown
  const tree = veg._trees.find((t) => t.species !== 'snag' && Math.abs(t.x) < 300 && Math.abs(t.z) < 300);
  assert.ok(tree, 'a tree near the centre');
  const cam = new THREE.Vector3(tree.x, tree.cy + 4, tree.z - 14);
  const focus = new THREE.Vector3(tree.x, tree.cy, tree.z);
  for (let k = 0; k < 3; k++) veg.update(0, cam, fwd, null);
  assert.ok(tree.near, 'the tree is in the near tier');
  const bushFades = () => {
    let sum = 0;
    veg.group.traverse((mesh) => {
      const attr = mesh.isInstancedMesh && mesh.geometry.getAttribute('aFadeI');
      if (attr && !mesh.userData.treeTrunk && !mesh.userData.treeFoliage) for (let i = 0; i < mesh.count; i++) sum += attr.array[i];
    });
    return sum;
  };
  const treeFades = () => veg._trees.reduce((sum, t) => sum + t.fade, 0);

  // off, the default
  let state = veg._seeThrough();
  assert.equal(state.on, false, 'See-through foliage is off by default');
  assert.ok(Math.abs(state.crownReach - 0.125) < 1e-9 && Math.abs(state.shrubReach - 0.125) < 1e-9,
    `the crowns and shrubs keep their lens band (reach ${state.crownReach}, ${state.shrubReach}: 8 m x 0.125 = the bark's 1 m)`);
  assert.equal(state.nearSee, 0, 'the cluster-free band is its lens band');
  for (let k = 0; k < 4; k++) veg.update(1 / 60, cam, fwd, focus);
  state = veg._seeThrough();
  assert.equal(state.sweeps, 0, 'the occlusion sweep never runs');
  assert.equal(treeFades(), 0, 'no tree fades');
  assert.equal(bushFades(), 0, 'no shrub fades');
  veg.setSniperFade(1, true, 10, 300);
  assert.equal(veg._seeThrough().sniperTarget, 0, 'the scope corridor stays shut while scoped');
  veg.setSniperFade(0, true, 55, 300);

  // on
  veg.setSeeThrough(true);
  state = veg._seeThrough();
  assert.deepEqual([state.crownReach, state.shrubReach, state.nearSee], [1, 0.5, 1], 'the trees round 4 reach and the whole band');
  veg.update(0, cam, fwd, focus); // dt 0 snaps the fades (shot mode's law)
  assert.ok(veg._seeThrough().sweeps > 0, 'the sweep runs');
  assert.equal(tree.fade, 1, 'the crown in the capsule fades');
  veg.setSniperFade(1, true, 10, 300);
  assert.equal(veg._seeThrough().sniperTarget, 1, 'the scope corridor opens with the scope');
  veg.setSniperFade(0, true, 55, 300);

  // off again: every fade snaps solid and the sweep stops
  veg.setSeeThrough(false);
  assert.equal(treeFades(), 0, 'every tree snaps solid');
  assert.equal(bushFades(), 0, 'every shrub snaps solid');
  const sweeps = veg._seeThrough().sweeps;
  for (let k = 0; k < 4; k++) veg.update(1 / 60, cam, fwd, focus);
  assert.equal(veg._seeThrough().sweeps, sweeps, 'no later frame runs the sweep');
  assert.equal(tree.fade, 0);
} finally {
  veg.dispose();
  disposeObject3DResources(veg.group);
  for (const [k, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; }
}

// --- the wiring ---
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
assert.match(read('./worldFramePresentationRuntime.ts'), /world\.setFoliageSeeThrough\(seeThroughFoliage\(\)\);/,
  'the world frame passes the choice every frame');
assert.match(read('./map.ts'), /tallGrass\.setSniperFade\(foliageSeeThrough \? f : 0, immediate\);/, 'the tall grass\'s corridor follows it');
assert.match(read('./map.ts'), /vegetation\.setSeeThrough\(on\);\s*tallGrass\.setSniperFade\(on \? sniperShare : 0\);/, 'and so do the trees');
assert.match(read('../ui/settings.ts'), /foliageSeeThrough\.set\(/, 'the Settings row writes it');
console.log('foliageSeeThrough.selftest: off by default, off clears no foliage (no sweep, no corridor, the lens band), on fades PASS');
