// 2026-11-02 audit F10: the battle FX runtime's own lifecycles, on the real runtime (fx/effects.ts):
//  - deferred beats: a beat due under the killcam's suppression fires (its particles join the hidden emitters; it was
//    dropped for good), a light due then stays dark, and a deferred wreck made for one life of a visual never lands on
//    the next (a Studio actor reset inside the delay was wrecked again);
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
camera.position.set(0, 3, -40); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
function runtime(entities = new Map()) {
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 5, resolveEntity: (id) => entities.get(id) ?? null });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => { const l = handlers.get(n); l.splice(l.indexOf(f), 1); }; },
    emit(n, p) { for (const f of [...(handlers.get(n) ?? [])]) f(p); }, handlers };
  fx.bindBus(bus);
  const frames = (n, dt = 1 / 60, shells = []) => { for (let i = 0; i < n; i++) fx.update(dt, shells, camera, (id) => entities.get(id) ?? null); };
  return { fx, bus, frames };
}
function fakeVisual() {
  const root = new THREE.Group();
  scene.add(root);
  return { root, wrecks: 0, life: 0, wrecked: false,
    setDestroyed() { this.wrecks++; this.wrecked = true; }, isDestroyed() { return this.wrecked; }, wreckLife() { return this.life; } };
}

// ---- deferred beats ----
{
  const { fx, frames } = runtime();
  frames(2);
  // a composed kill's wreck is deferred 0.15 s; the killcam opens inside it
  const killed = fakeVisual();
  fx.destruction(new THREE.Vector3(0, 0, 0), killed, 'ammorack');
  assert.equal(killed.wrecks, 0, 'the wreck waits for the fireball');
  fx.setReplaySuppressed(true);
  frames(20);
  assert.equal(killed.wrecks, 1, 'a beat due under the suppression fires (it was dropped for good)');
  const debug = fx.getReplaySuppressionDebug();
  assert.deepEqual(debug.lightIntensities, [0, 0], 'and the lights stay dark while suppressed');
  fx.setReplaySuppressed(false);
  // a Studio actor restaged inside the delay: the deferred wreck was made for the life it ended
  const restaged = fakeVisual();
  fx.destruction(new THREE.Vector3(30, 0, 0), restaged, 'ammorack');
  restaged.life++;
  frames(20);
  assert.equal(restaged.wrecks, 0, 'a deferred wreck never lands on a visual reset since');
  fx.resetAll();
}

console.log('fxLifecycles.selftest: deferred beats fire under suppression and never outlive their visual\'s life');
