// aerialDistBoost.selftest.mjs — (lane ac130-fx-228 r3, the blind critic's "full-lens tan wash" the frame after a gunship
// kill) the kill legibility boost (effects.ts distBoost: a kill 200-400 m off drawn up to ~1.9x its size) reads the
// apparent distance for a camera aloft (the gunship's gimbal, a telephoto at up to 6x), so a kill seen through the zoomed
// lens is drawn at its own size, not boosted twice; a camera near the ground and the gimbal at its widest are unchanged.
// Measured on the real runtime: the volume media's largest card after the same kill, seen from each camera.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const target = new THREE.Vector3(0, 1.2, 138);
/** the largest volume-media card born for one kill at `target`, seen from `camera` (m: the card's half-size) */
function killCard(position, fov) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.5, 5000);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 77 });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; }, off() {},
    emit(n, p) { for (const f of handlers.get(n) ?? []) f(p); } };
  fx.bindBus(bus);
  bus.emit('tank:destroyed', { id: 't1', specId: 't72b3', pos: target.toArray(), killerId: 'pilot', cause: 'shot' });
  for (let i = 0; i < 6; i++) fx.update(1 / 60, [], camera, () => null);
  const g = fx.group.getObjectByName('fx-volume-media').children[0].geometry;
  const sz = g.attributes.aSZ;
  let size = 0;
  for (let i = 0; i < sz.count; i++) size = Math.max(size, sz.getX(i), sz.getY(i));
  fx.resetAll();
  return size;
}

const lens = killCard(new THREE.Vector3(0, 240.12, 0), 55 / 3.6);
const wideAloft = killCard(new THREE.Vector3(0, 240.12, 0), 55);
const ground = killCard(new THREE.Vector3(0, 2.5, -139), 55 / 3.6);
assert.ok(lens > 0 && wideAloft > 0 && ground > 0, 'the kill draws its media from every camera');
// the same 277 m: the zoomed lens sees the kill at its own size, the gimbal at its widest keeps the full boost
assert.ok(wideAloft > lens * 1.6, `the gimbal at 1x boosts the kill (${wideAloft.toFixed(1)} m) where the 3.6x lens does not (${lens.toFixed(1)} m)`);
// a camera on the ground (here a zoomed one at the same 277 m) is unchanged: its boost reads the plain distance
assert.ok(Math.abs(ground - wideAloft) < 0.05 * wideAloft, `a ground camera keeps the plain boost (${ground.toFixed(1)} m vs ${wideAloft.toFixed(1)} m)`);
console.log(`aerialDistBoost: a kill seen through the gunship's 3.6x lens is drawn at its own size (${lens.toFixed(1)} m), the gimbal at 1x and a ground camera keep the legibility boost (${wideAloft.toFixed(1)} m)`);
