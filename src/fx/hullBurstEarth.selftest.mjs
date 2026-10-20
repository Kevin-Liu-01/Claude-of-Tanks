// hullBurstEarth.selftest.mjs — (lane ac130-fx-228 r3, the r5 blind critic: the gunship's 152 mm on a hull "undersized ...
// gone by f6" against the same shell on the ground, and no hot signature in the infrared lens) a heavy charge (the
// howitzer's shell, a missile's warhead) bursting on a hull that sits on the ground throws the ground's earth round the
// hull's own fireball — the heavy round's fountain and column, clods, dust sheet and ring (blastRecipes.ts heavyHullBurst
// -> groundBurst earthOnly) — from a turret's roof too (effects.ts: a heavy charge reaches the ground from 4 m). Measured
// on the real runtime: the volume media a 20 kg howitzer shell draws on the ground, on a hull top, on a roof and high.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

/** the media bodies 0.4 s after a gunship howitzer shell bursts `where` ('ground', or on a hull at height `y` m) */
function bodies(where, y = 0) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
  camera.position.set(0, 3, -300); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 5 });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; }, off() {},
    emit(n, p) { for (const f of handlers.get(n) ?? []) f(p); } };
  fx.bindBus(bus);
  bus.emit('shell:fired', { shellId: 'g1', shooterId: 'pilot', pos: [0, 240, -200], muzzlePos: [0, 240, -200], dir: [0, -0.8, 0.6],
    shellType: 'HE', caliberMm: 152, shellName: '152 mm HE', munition: 'howitzer', chargeKg: 20 });
  if (where === 'hull') bus.emit('shell:hit', { shellId: 'g1', attackerId: 'pilot', targetId: 't1', kind: 'he_pen', damage: 276,
    pos: [0, y, 0], normal: [0, 1, 0], caliberMm: 152, shellType: 'HE', destroyed: false });
  bus.emit('shell:expired', { shellId: 'g1', pos: [0, y, 0], hitTerrain: where === 'ground', hitKind: where === 'hull' ? 'tank' : undefined,
    munition: 'howitzer', chargeKg: 20, caliberMm: 152, shellType: 'HE' });
  for (let i = 0; i < 24; i++) fx.update(1 / 60, [], camera, () => null);
  const n = fx.group.getObjectByName('fx-volume-media')?.children?.[0]?.geometry?.instanceCount ?? 0;
  fx.resetAll();
  return n;
}

const ground = bodies('ground');
const hullTop = bodies('hull', 1.8);
const roof = bodies('hull', 3.2);
const high = bodies('hull', 6);
assert.ok(ground > 0 && high > 0, 'every burst draws its media');
assert.ok(hullTop >= high * 2.5, `a heavy burst on a hull top throws the ground's earth (${hullTop} bodies vs ${high} high above it)`);
assert.ok(roof >= high * 2.5, `and from a turret's roof (${roof} at 3.2 m)`);
assert.ok(hullTop <= ground, `a hull burst throws no more earth than the shell on the ground itself (${hullTop} vs ${ground})`);
console.log(`hullBurstEarth: the gunship's 152 mm on a hull top throws the ground's earth (${hullTop} media bodies; ${roof} from a roof; ${high} high above the ground; ${ground} on the ground)`);
