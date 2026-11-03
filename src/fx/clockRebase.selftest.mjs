// 2026-11-02 audit R7: the fx clock's rebase (a capture's pin past 20 s, the Studio's reset to 0 at every load and seek)
// walks one registry each part of the runtime registers its shift with where it is made (fx/timeShift.ts), never a
// hand list, and the stamps the hand list had missed now move:
//  - the registry: parts with a shiftTime, the runtime's own arrays, in order; an absent tier's part skipped;
//  - the volume media's embers (a forward rebase expired them at once);
//  - the structure fracture's collapse face hold (a forward rebase disposed a collapsing building's redrawn faces the
//    moment their hold began), through the fracture stages that own it;
//  - a live runtime registers every part, and a pinned clock keeps an ember's age;
//  - the debris pool reports what it cannot step under ~15 fps, and a collapse's pieces age by the pool's time (they
//    aged by frame time while their bodies fell on the pool's);
//  - (review r2) a building's falling rubble keeps its pool's time too: a body thrown with a delay (a collapse front, a
//    topple's landing) is let go, falls and lands at 8 fps as at 60 (it came due on the fx clock before its pool let it
//    go, and was given up on: it vanished), and a rebase of the fx clock never moves its release.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { createFxTimeShiftRegistry } from './timeShift.ts';
import { createVolumeMedia } from './volumeMedia.ts';
import { createDebrisPhysics } from './debrisPhysics.ts';
import { createStructureFracture } from './structureFracture.ts';
import { createCollapseBodies } from './collapseBodies.ts';
import { createRubbleBodies } from './rubbleBodies.ts';
import { createFx } from './effects.ts';
import { fxClockNow } from './clock.ts';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from '../world/maps/regional/index.ts';
import { streamFrom } from '../world/maps/regional/geometry.ts';
import { structureDamageKitChain } from '../world/destructionKit.ts';

const require = createRequire(import.meta.url);
const { createCanvas } = require('@napi-rs/canvas');
globalThis.document ??= { createElement: () => createCanvas(1, 1) };

// ---- the registry ----
{
  const shifts = createFxTimeShiftRegistry();
  const seen = [];
  const part = { at: 3, shiftTime(d) { this.at += d; seen.push('part'); } };
  assert.equal(shifts.add('part', part), part, 'add hands the part back to its construction site');
  assert.equal(shifts.add('absent', null), null, "an absent tier's part is skipped");
  let own = 1;
  shifts.on('own', (d) => { own += d; seen.push('own'); });
  assert.throws(() => shifts.on('own', () => {}), /twice/);
  shifts.shift(10);
  shifts.shift(0);
  assert.deepEqual([part.at, own, seen], [13, 11, ['part', 'own']]);
  assert.deepEqual(shifts.names(), ['part', 'own']);
}

// ---- the volume media's embers move with its glows ----
{
  const soft = { uDepth: { value: null }, uNear: { value: 0.1 }, uFar: { value: 100 }, uRes: { value: new THREE.Vector2(1, 1) } };
  let now = 40;
  const media = createVolumeMedia({ soft, now: () => now, capacity: 8 });
  const u = media.group.children[0].material.uniforms;
  media.ember(1, 2, 3, 2, 0.8, 5, -0.5);
  media.glow(1, 2, 3, 2, 0.8, 5, -0.5);
  media.shiftTime(100);
  assert.equal(u.uGlowP.value[0].w, 139.5, 'a glow shifts with the clock');
  assert.equal(u.uEmberP.value[0].w, 139.5, 'an ember shifts with the clock');
  assert.ok(u.uEmberP.value[1].w < -1e8, 'an empty ember slot stays empty');
}

// ---- a building's seam (structureFracture.selftest's fixture) ----
const material = new THREE.MeshStandardMaterial({ vertexColors: true });
function seamOf(styleId, id, [w, d, h], structureIdx) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  const seed = 7;
  const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket: 'stone', rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'damage', snowCap: false, tier: 'desktop' }, streamFrom(seed * 3 + 5));
  const describe = structureDamageKitChain(id, styleId).find((k) => k.describe)?.describe;
  const anatomy = describe?.({ structureIdx, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 5, kitPlan: regionalKitPlanOf(parts) });
  const pos = [], nrm = [], col = [];
  for (const geos of Object.values(parts)) {
    if (!Array.isArray(geos)) continue;
    for (const g0 of geos) {
      if (!g0?.attributes?.position) continue;
      const g = g0.index ? g0.toNonIndexed() : g0;
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i)); nrm.push(n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0); col.push(0.8, 0.7, 0.6);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geometry, material);
  return { structureIdx, anatomy, spans: [{ mesh, position: geometry.attributes.position, bucket: 'stone', first: 0, count: pos.length / 3,
    partClass: 'wall', instanceId: null }], touchShadows() {} };
}

// ---- the structure fracture's collapse hold survives a forward rebase ----
{
  const seam = seamOf('hessian', 'cottage', [8, 10, 6.5], 7);
  const pool = createDebrisPhysics({ capacity: 96 });
  pool.bind({ groundAt: () => 0 });
  let clock = 0;
  const fracture = createStructureFracture({ pool, group: new THREE.Group(), materialFor: () => material, now: () => clock, keepSpan: () => {} });
  const front = seam.anatomy.storeys[0].faces.find((f) => f.name === 'front');
  let took = null;
  for (const u of [0.3, -0.6, 1.2, -1.5, 2.1, -2.4]) {
    if (front.openings.some((o) => Math.abs(u - o.u) < o.w / 2 + 0.7 && 1.4 > o.y0 - 0.7 && 1.4 < o.y0 + o.h + 0.7)) continue;
    took = fracture.strike(seam, front.origin[0] + front.u[0] * u + front.out[0] * 0.05, front.origin[1] + 1.4,
      front.origin[2] + front.u[2] * u + front.out[2] * 0.05, -front.out[0], -front.out[2], 'he', 1.2, 125);
    break;
  }
  fracture.flush();
  assert.ok(Array.isArray(took) && took.length >= 2, 'a round breaks a face');
  const faces = fracture.standing(7);
  assert.ok(faces.length >= 1, 'its face stands redrawn');
  // the collapse: the redrawn faces held 5 s for the mask to carry them down, then a capture pins the clock 100 s on
  fracture.release(7, 5);
  clock += 100;
  fracture.shiftTime(100);
  clock += 1 / 30;
  fracture.update();
  assert.ok(faces.every((m) => m.parent !== null), 'a forward rebase keeps the collapse\'s face hold');
  clock += 6;
  fracture.update();
  assert.ok(faces.every((m) => m.parent === null), 'which ends on its own time');
}

// ---- a live runtime: every part registered, and a pin keeps an ember's age ----
{
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
  camera.position.set(0, 3, -40); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 5 });
  scene.add(fx.group);
  const names = fx.timeShiftNames();
  for (const part of ['particles', 'volumeMedia', 'debrisChunks', 'craterMarks', 'mapCraterMarks', 'structureMask', 'rubbleBodies',
    'structureDebris', 'fractureStages', 'structureStages', 'missileTrails', 'missileWires', 'projectileTracers', 'lights',
    'shockRings', 'muzzleRings', 'trackPrints', 'tickCursor']) {
    assert.ok(names.includes(part), `the runtime registers ${part}'s shift`);
  }
  for (let i = 0; i < 30; i++) fx.update(1 / 60, [], camera, () => null);
  const media = fx.group.getObjectByName('fx-volume-media');
  const u = media?.children?.[0]?.material?.uniforms;
  assert.ok(u?.uEmberP, 'the desktop tier draws volume media');
  const handlers = new Map();
  fx.bindBus({ on(n, f) { (handlers.get(n) ?? handlers.set(n, []).get(n)).push(f); return () => {}; } });
  const emit = (n, p) => { for (const f of handlers.get(n) ?? []) f(p); };
  emit('shell:fired', { shellId: 'h1', shooterId: 'g', pos: [0, 200, -100], muzzlePos: [0, 200, -100], dir: [0, -0.8, 0.6], shellType: 'HE',
    caliberMm: 152, shellName: '152 mm HE', munition: 'howitzer', chargeKg: 20 });
  emit('shell:expired', { shellId: 'h1', pos: [0, 0, 0], hitTerrain: true, munition: 'howitzer', chargeKg: 20, caliberMm: 152, shellType: 'HE' });
  fx.update(1 / 60, [], camera, () => null);
  const live = u.uEmberP.value.filter((e) => e.w > -1e8);
  assert.ok(live.length > 0, 'a heavy burst lays embers');
  const ageBefore = fxClockNow() - live[0].w;
  fx.setFrozen(true, 500);
  assert.equal(fxClockNow(), 500, 'the clock is pinned 500 s on');
  const ageAfter = fxClockNow() - live[0].w;
  assert.ok(Math.abs(ageAfter - ageBefore) < 1e-6, `a pin keeps an ember's age (${ageBefore.toFixed(3)} s -> ${ageAfter.toFixed(3)} s)`);
  fx.setFrozen(false);
  fx.resetAll();
}

// ---- the debris pool's dropped time, and a collapse's pieces on the pool's clock ----
{
  const pool = createDebrisPhysics({ capacity: 8 });
  pool.advance(0.2);
  // four steps of 1/60 run, half a step is carried, the rest is given up
  assert.ok(Math.abs(pool.droppedS() - (0.2 - 4 / 60 - 0.5 / 60)) < 1e-9, `the pool reports what it gave up (${pool.droppedS()})`);
  pool.advance(0.5);
  assert.ok(pool.droppedS() > 0.25 + 0.2, 'beyond a 0.25 s delta too');
  pool.reset();
  assert.equal(pool.droppedS(), 0);

  const seam = seamOf('hessian', 'cottage', [8, 10, 6.5], 7);
  const collapsePool = createDebrisPhysics({ capacity: 96 });
  const bodies = createCollapseBodies({ pool: collapsePool, group: new THREE.Group(), materialFor: () => material, groundAt: () => 0,
    environment: () => null, now: () => 0 });
  assert.equal(bodies.collapse(seam, { structureId: 7, cause: 'blast', x: 0, y: 2, z: 6, dirX: 0, dirZ: -1 }, [], () => material), true);
  for (let i = 0; i < 24; i++) bodies.update(0.125); // 8 fps for 3 s
  const pooled = collapsePool.stats().timeS;
  const clock = bodies.stats().clockS;
  assert.ok(pooled < 2.5, `the pool steps less than the frames' 3 s under 8 fps (${pooled.toFixed(2)} s)`);
  assert.ok(Math.abs(clock - pooled) <= 1 / 60 + 1e-9, `the pieces age on the pool's time (clock ${clock.toFixed(3)} s, pool ${pooled.toFixed(3)} s)`);
}

// ---- a delayed rubble body under 8 fps ----
{
  const throwOne = (bodies) => bodies.throw('stone', 'block', 0, 4, 0, 0, 0, 0, 1, 0.5, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0.6, 0.5, 0.4, 1.2);
  const lowest = (bodies) => {
    const mesh = bodies.group.children.find((m) => m.count > 0 && m.name === 'fx-rubble-body-block');
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    return new THREE.Vector3().setFromMatrixPosition(m).y;
  };
  for (const [label, dt] of [['8 fps', 0.125], ['60 fps', 1 / 60]]) {
    let now = 0;
    const bodies = createRubbleBodies({ now: () => now, environment: () => ({ groundAt: () => 0 }), materialFor: () => null, capacity: 8 });
    assert.equal(throwOne(bodies), true);
    // 8 s of frames: at 8 fps the pool steps a little over half of it, the body's 1.2 s delay on the pool's time
    for (let t = 0; t < 8 - 1e-9; t += dt) { now += dt; bodies.update(); }
    const st = bodies.stats();
    assert.equal(st.live, 1, `${label}: the delayed body is still there (${JSON.stringify(st)})`);
    assert.equal(st.bodies, 1, `${label}: in the pool's world`);
    assert.ok(Math.abs(st.clockS - bodies.pool.stats().timeS) <= 1 / 60 + 1e-9,
      `${label}: the bodies' clock is the pool's (${st.clockS} s vs ${bodies.pool.stats().timeS} s)`);
    const y = lowest(bodies);
    assert.ok(y > 0 && y < 0.6, `${label}: it fell and lies on the ground (centre ${y.toFixed(2)} m)`);
  }
  // a rebase of the fx clock (a capture's pin) neither releases a waiting body early nor holds it back
  let now = 50;
  const bodies = createRubbleBodies({ now: () => now, environment: () => ({ groundAt: () => 0 }), materialFor: () => null, capacity: 8 });
  throwOne(bodies);
  for (let f = 0; f < 30; f++) { now += 1 / 60; bodies.update(); }
  now += 100; bodies.shiftTime(100);
  for (let f = 0; f < 30; f++) { now += 1 / 60; bodies.update(); }
  assert.ok(bodies.stats().clockS < 1.2 && bodies.stats().live === 1, 'one second in, still waiting');
  for (let f = 0; f < 60; f++) { now += 1 / 60; bodies.update(); }
  assert.equal(bodies.stats().bodies, 1, 'and let go on its own time');
}

console.log('clockRebase.selftest: one registry of fx-clock shifts; embers and the fracture\'s face hold move with a rebase; the pieces and the rubble age on the debris pool\'s time');
