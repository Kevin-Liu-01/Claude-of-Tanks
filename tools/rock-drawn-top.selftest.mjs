// Stones under their drawn tops, through the authority (physics stream, 2026-10-13; the owner: "for tanks on rocks, fix all
// hitboxes and tank interactions with them"). A stone's movement record is one part under its drawn top
// (rockCollision.ts stoneCapPlanes; world/collision.ts collisionPartTopAt): a hull climbs a stone where its climb surface
// (collisionPartClimbAt: the faces its tracks ride up, no steeper than 45 degrees, lowered by their climb past the step)
// rises less than a step over its tracks, and is stopped where it rises more — the physics of the stone's own shape, its
// face grade and height against the hull's step and climb, not a size cutoff. Each case runs the real network authority
// over flat ground and one placed stone (tools/physics-torture.mjs runCase): a low dome and a rounded 0.8 m stone a hull
// crawls over and drives over, a rounded 1.0 m stone, a 1.4 m ball and a 2.1 m boulder that stop it, and the same run
// twice for determinism.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { collisionPartTopAt } from '../src/world/collision.ts';
import { applyRockCollisionProfile, rockCollisionProfile, rockFormOf } from '../src/world/rockCollision.ts';

await ensureAuthorityFleet(['t90am', 'm1a1_abrams_hc', 'bmp2']);

const flat = () => 0;
const sphere = rockFormOf(mergeVertices(new THREE.IcosahedronGeometry(1, 4)));
/** A stone at (0, 12): the unit ball scaled (sx, sy, sx) and raised by `lift` over the ground there, seated `seat` under it. */
function stone(sx, sy, lift, seat = -0.3, ground = flat) {
  const base = ground(0, 12);
  const matrix = new THREE.Matrix4().compose(new THREE.Vector3(0, base + lift, 12), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sx));
  const profile = rockCollisionProfile(sphere, matrix.elements, ground);
  assert.ok(profile?.cap, 'the stone bounds a drawn top');
  const obstacle = { min: [0, 0, 0], max: [0, 0, 0] }, collider = { min: [0, 0, 0], max: [0, 0, 0] };
  applyRockCollisionProfile(obstacle, collider, profile, base + seat);
  return obstacle;
}
const hold = (throttle, governMps = Infinity) => (t, s) => ({ throttle: s && Math.abs(s.speed) > governMps ? 0 : throttle });
/** Drive north from z = 0 at the stone; the root's highest lift, how far it got, its steps and jolts. */
function drive(record, hull, { throttle = 1, governMps = 2.5, speed = 0, seconds = 9, terrain = flat } = {}) {
  let lift = -Infinity, lastZ = 0;
  const caseDef = { id: 'stone', terrain, obstacles: [record], seconds, spawn: { x: 0, z: 0, yaw: 0, speed: speed || undefined },
    input: hold(throttle, governMps), allowBlocked: true };
  const metrics = runCase(hull, 'earth', caseDef, { replay: false, trace: (tick, match) => {
    const s = match.entityById.get('subject').state;
    lift = Math.max(lift, s.pos.y - terrain(s.pos.x, s.pos.z));
    lastZ = s.pos.z;
  } });
  return { metrics, lift, z: lastZ };
}

// 1. a low dome (0.6 m over the ground, 3.2 m across) and a rounded 0.8 m stone (2.4 m across): crawled over and driven
// over — the hull rides their surfaces
const dome = stone(1.6, 0.7, -0.1), round8 = stone(1.2, 1.0, -0.2);
const domeTop = collisionPartTopAt(dome, dome.shape2, 0, 12), round8Top = collisionPartTopAt(round8, round8.shape2, 0, 12);
assert.ok(domeTop > 0.55 && domeTop < 0.7, `the dome's top (${domeTop.toFixed(2)} m)`);
assert.ok(round8Top > 0.75 && round8Top < 0.85, `the stone's top (${round8Top.toFixed(2)} m)`);
for (const [record, name, rides] of [[dome, 'dome', 0.3], [round8, '0.8 m stone', 0.45]]) {
  for (const [hull, opts, label] of [['t90am', { governMps: 2.5 }, 'crawl'], ['m1a1_abrams_hc', { governMps: 8, speed: 8, seconds: 6 }, 'at 8 m/s']]) {
    const { metrics, lift, z } = drive(record, hull, opts);
    const at = `${name}, ${label}`;
    assert.ok(z > 16, `${at}: the hull goes over it (z ${z.toFixed(1)})`);
    assert.ok(lift > rides, `${at}: it rides up it (${lift.toFixed(2)} m)`);
    // (a 0.8 m stone met at 8 m/s lifts the hull at its climb's pace: a track rolling up a 45-degree face, 14 cm a step)
    const popMax = label === 'crawl' ? 0.12 : 0.18;
    assert.ok(metrics.popXZMaxM <= 0.12 && metrics.popYMaxM <= popMax, `${at}: no pops (${metrics.popXZMaxM.toFixed(3)} / ${metrics.popYMaxM.toFixed(3)} m)`);
    assert.ok(metrics.joltYMaxM <= (label === 'crawl' ? 0.1 : 0.18), `${at}: no vertical jolt past the climb (${metrics.joltYMaxM.toFixed(3)} m)`);
    assert.ok(metrics.obstaclePenMaxM <= 0.1 && metrics.bodyPenMaxM <= 0.1,
      `${at}: never left in the stone (${metrics.obstaclePenMaxM.toFixed(3)} / ${metrics.bodyPenMaxM.toFixed(3)} m)`);
  }
}

// 2. a rounded 1.0 m stone (past the climb), a 1.4 m ball (its equator 0.4 m up: steep from the ground) and a 2.1 m
// boulder: they stop a hull, cleanly
for (const [record, label] of [[stone(1.4, 1.2, -0.2), 'rounded 1.0 m stone'], [stone(1, 1, 0.4), '1.4 m ball'], [stone(1.6, 1.5, 0.6), '2.1 m boulder']]) {
  const { metrics, lift, z } = drive(record, 'm1a1_abrams_hc', { governMps: 4 });
  assert.ok(z < 12, `${label}: the hull is stopped short of its middle (z ${z.toFixed(2)})`);
  assert.ok(lift < 0.25, `${label}: it does not climb it (${lift.toFixed(2)} m)`);
  assert.ok(metrics.popXZMaxM <= 0.12 && metrics.popYMaxM <= 0.12, `${label}: no pops (${metrics.popXZMaxM.toFixed(3)} / ${metrics.popYMaxM.toFixed(3)} m)`);
  assert.ok(metrics.obstaclePenMaxM <= 0.1, `${label}: not pushed into it (${metrics.obstaclePenMaxM.toFixed(3)} m)`);
}

// 3. a hull nosing down a 24-degree slope into a boulder at its foot (1.6 m and 2.0 m): its glacis leans past its
// footprint at track level, and the end plate's probe holds it out of the stone (collision.ts endPlateLean; without it a
// T-90M rests with its glacis 0.28-0.29 m in these for 3 s, and one in the census 1.1 m inside a 2.4 m boulder)
const downhill = (x, z) => -0.45 * z;
for (const record of [stone(2, 1.6, 0, -0.3, downhill), stone(1.8, 2.2, -0.2, -0.3, downhill)]) {
  for (const hull of ['t90am']) {
    const { metrics, z } = drive(record, hull, { governMps: 8, speed: 8, seconds: 4, terrain: downhill });
    assert.ok(z < 12, `${hull} downhill: the boulder stops it (z ${z.toFixed(2)})`);
    assert.ok(metrics.bodyPenMaxM <= 0.1, `${hull} downhill: its nose stays out of the boulder (${metrics.bodyPenMaxM.toFixed(3)} m)`);
    // (a ram at 8 m/s into a boulder steps the hull's root 14 cm as its nose stops, with the probe or without it)
    assert.ok(metrics.popXZMaxM <= 0.12 && metrics.popYMaxM <= 0.16, `${hull} downhill: no pops (${metrics.popXZMaxM.toFixed(3)} / ${metrics.popYMaxM.toFixed(3)} m)`);
  }
}

// 4. deterministic: the same run twice ends on the same pose to the bit
const a = drive(dome, 'bmp2', { governMps: 3, seconds: 5 }).metrics.final, b = drive(dome, 'bmp2', { governMps: 3, seconds: 5 }).metrics.final;
assert.deepEqual(a, b, 'the same run, the same pose');

console.log(`rock-drawn-top.selftest: a ${domeTop.toFixed(2)} m dome and a ${round8Top.toFixed(2)} m rounded stone crawled and driven over without a pop; a 1.0 m stone, a 1.4 m ball and a 2.1 m boulder stop a hull cleanly, its nose held out of a boulder met nosing down a slope; deterministic`);
