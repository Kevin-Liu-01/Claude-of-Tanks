// 2026-11-02 audit F10: a round missing from one frame's shell list has not ended. The presentation read every absence
// as an end: tracers retired (a re-sighted round re-rolled its belt's tracer), guided rounds parted their wires and
// ended their trails for good on the first missing frame, a reappearing missile kept its ended trail slot (it flew
// trail-less), and the 43rd drone of a frame was never marked seen (it was read as a flight that ended). Now:
//  - a missile trail and a wire seen again after they ended begin anew (the ended one dissolves or fades keyless);
//  - a tracer missing one frame keeps its record (its belt place), a struck one still goes at once;
//  - a guided round ends its trail and wire only past MISSILE_ABSENCE_GRACE_S, once (a frozen clock repeated it);
//  - a drone past the pool's capacity is tracked, not ended.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createMissileTrails } from './missileTrails.ts';
import { createMissileWires } from './missileWires.ts';
import { createProjectileTracers } from './projectileTracers.ts';
import { createDronePresentation } from './dronePresentation.ts';
import { createSceneLightUniforms } from './sceneLight.ts';
import { createFx } from './effects.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

// ---- a trail and a wire seen again after they ended ----
{
  const soft = { uDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 }, uRes: { value: new THREE.Vector2(1, 1) } };
  const trails = createMissileTrails(createSceneLightUniforms(), soft);
  const key = 4242;
  const first = trails.begin(key, 0, 0.3);
  trails.point(first, 0, 2, 0, 1, 0.5);
  trails.head(first, 0, 2, 3, 1.02, 0.52);
  trails.end(first, 1.05);
  assert.equal(trails.ended(first), true);
  const again = trails.begin(key, 0, 0.3);
  assert.notEqual(again, first, 'a round seen again after its trail ended lays a new trail (it flew trail-less)');
  assert.equal(trails.ended(again), false);
  assert.equal(trails.begin(key, 0, 0.3), again, 'and keeps it while it draws');
  assert.equal(trails.ended(first), true, 'the ended one dissolves on');

  const wires = createMissileWires(createSceneLightUniforms());
  const w0 = wires.begin(77, 1, 0, 2, 0, 1);
  wires.tail(w0, 0, 2, 10, 1.1);
  wires.cut(w0, 1.2);
  assert.equal(wires.parted(w0), true);
  const w1 = wires.begin(77, 1, 0, 2, 0, 1.3);
  assert.notEqual(w1, w0, 'a round seen again after its wire parted lays a new wire');
  assert.equal(wires.parted(w1), false);
}

// ---- a tracer missing one frame keeps its belt place ----
{
  const tr = createProjectileTracers({ shooter: () => ({ id: 'm1a1_abrams_hc', nation: 'USA' }), scene: new THREE.Scene(), now: () => 10, capacity: 64 });
  const shell = (id, x) => ({ id, shooterId: 'a', pos: new THREE.Vector3(x, 2, 50), vel: new THREE.Vector3(0, 0, 850), ageS: 0.2, distM: 170,
    spec: { type: 'AP', caliberMm: 12.7 } });
  const frame = (shells) => { tr.begin(); for (const s of shells) tr.write(s); tr.end(); return tr.mesh.geometry.instanceCount; };
  // a NATO belt: the first of every five rounds glows
  const burst = Array.from({ length: 5 }, (_, i) => shell(100 + i, i));
  assert.equal(frame(burst), 1, 'one tracer in five');
  frame(burst.filter((s) => s.id !== 101)); // a dark round drops out of one frame
  assert.equal(frame(burst), 1, 'seen again, it is still dark: its belt place kept (a new record took the next, a tracer)');
  // struck: gone at once
  tr.strike(100, [0, 2, 60]);
  frame(burst.slice(1));
  assert.equal(tr.stats().tracked, 4, 'a struck round is released at once');
  frame([]); frame([]);
  assert.equal(tr.stats().tracked, 0, 'rounds missing two frames are released');
}

// ---- the 43rd drone of a frame is tracked, not ended ----
{
  const events = [];
  const pool = createDronePresentation(new THREE.Group(), {
    onReturnEvent: (id, event) => events.push(`${id}:${event}`),
    resolveCarrier: () => ({ frame: new THREE.Object3D(), destroyed: false, flying: true }),
  });
  const pos = (i) => new THREE.Vector3(i * 3, 40, 0);
  const frame = (t, ids) => {
    pool.begin(t, new THREE.Vector3(0, 40, -50));
    for (const i of ids) pool.write(pos(i), new THREE.Vector3(0, 0, 12), `d${i}`, 0, 30, 'USA', undefined, 'p1');
    pool.end();
  };
  const fleet = Array.from({ length: 42 }, (_, i) => i);
  frame(1 / 60, fleet);
  // a 43rd launches ahead of them in the list: the last of the 42 is past the pool's capacity this frame
  for (let f = 2; f <= 4; f++) frame(f / 60, [99, ...fleet]);
  assert.deepEqual(events, [], 'no drone in the air reads as a flight that ended');
}

// ---- a guided round's absence: ended past a grace, once ----
{
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
  camera.position.set(-20, 5, 0); camera.lookAt(0, 3, 60); camera.updateMatrixWorld(true);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 5 });
  scene.add(fx.group);
  const sh = { id: 900, pos: new THREE.Vector3(0, 3, 0), prevPos: new THREE.Vector3(0, 3, 0), vel: new THREE.Vector3(0, 0, 250),
    spec: { guided: true, tracer: 'ATGM', name: '9M133 Kornet' }, shooterId: 'g', ageS: 0.5, distM: 125 };
  const step = (present) => {
    sh.prevPos.copy(sh.pos); sh.pos.z += 250 / 60; sh.ageS += 1 / 60; sh.distM += 250 / 60;
    fx.update(1 / 60, present ? [sh] : [], camera, () => null);
    return fx.getGuidedRecordDebug();
  };
  for (let f = 0; f < 10; f++) step(true);
  assert.equal(step(false).endedTrails, 0, 'a round missing one frame has not ended');
  for (let f = 0; f < 6; f++) assert.equal(step(true).endedTrails, 0, 'seen again, its trail draws on');
  let d = null;
  for (let f = 0; f < 4; f++) d = step(false);
  assert.equal(d.endedTrails, 0, 'four frames (67 ms) is still inside the grace');
  for (let f = 0; f < 6; f++) d = step(false);
  assert.equal(d.endedTrails, 1, 'past it the round has ended: its trail ends where it was last seen');
  fx.resetAll();
}

console.log('absenceGrace.selftest: a round missing from a frame has not ended; trails and wires seen again begin anew; tracers keep their belt place; every drone is tracked');
