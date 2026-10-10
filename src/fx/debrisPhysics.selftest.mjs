import assert from 'node:assert/strict';
import { createRigidBox } from '../sim/rigidBody.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createDebrisPhysics } from './debrisPhysics.ts';

// The physics lane's presentation pool for collapse pieces (2026-10-10; dcore's natural collapses build on it): pieces
// wait where they stand until their release, fall, land on the ground and the hulls, report their landings, sleep, and
// give way oldest-sleeper-first when the pool is full — the same way on every peer (no randomness, no wall clock).

const flat = { groundAt: () => 0 };
const panel = createRigidBox(2.2, 1.5, 0.18, 1900, { restitution: 0.15, friction: 0.7 });
const block = createRigidBox(0.35, 0.25, 0.3, 1900);
const pose = new Float64Array(7);
const run = (pool, seconds, dt = 1 / 60) => { for (let t = 0; t < seconds; t += dt) pool.advance(dt); };

// --- progressive release: a delayed panel stands where it was spawned until its time, then topples and lies flat
{
  const pool = createDebrisPhysics({ capacity: 8 });
  pool.bind(flat);
  const impacts = [];
  pool.onImpact((x, y, z, speed, mass, handle) => impacts.push({ y, speed, mass, handle }));
  // a wall panel standing on its edge with a push off the wall plane, released after 1 s
  const handle = pool.spawn(panel, { x: 0, y: 1.5 + 0.01, z: 0, vz: 0.6, wx: 0.4 }, 1);
  assert.ok(handle >= 0);
  run(pool, 0.9);
  assert.equal(pool.framePoseAt(handle, pose), true);
  assert.ok(Math.abs(pose[1] - 1.51) < 1e-9 && Math.abs(pose[2]) < 1e-9, 'waiting: drawn where it stands');
  assert.equal(pool.stats().waiting, 1);
  run(pool, 6);
  assert.equal(pool.stats().waiting, 0, 'released at its time');
  assert.equal(pool.asleep(handle), true, 'it came to rest');
  pool.framePoseAt(handle, pose);
  assert.ok(Math.abs(pose[1] - 0.18) < 0.03, `it lies flat on the ground (${pose[1].toFixed(3)} m)`);
  assert.ok(impacts.some((impact) => impact.handle === handle && impact.speed > 2 && impact.mass > 1000), 'its landing was reported with its handle');
}

// --- deterministic: the same collapse twice (uneven frame times included) lies the same way
function collapse(dts) {
  const pool = createDebrisPhysics({ capacity: 32 });
  pool.bind({ groundAt: (x, z) => 0.08 * x + 0.03 * z });
  const handles = [];
  for (let k = 0; k < 16; k++) {
    handles.push(pool.spawn(k % 4 === 0 ? panel : block, {
      x: (k % 4) * 0.9, y: 2 + Math.floor(k / 4) * 0.7, z: (k % 3) * 0.5,
      qx: 0.1 * (k % 3), qw: 1, vx: (k % 5) * 0.3 - 0.6, vy: 0.5, vz: (k % 2) * 0.4, wx: (k % 4) - 1.5, wz: (k % 3) * 0.6,
    }, (k % 4) * 0.25));
  }
  let i = 0;
  for (let t = 0; t < 10; ) { const dt = dts[i++ % dts.length]; pool.advance(dt); t += dt; }
  return handles.map((h) => { pool.framePoseAt(h, pose); return [...pose].map((v) => Math.round(v * 1e6)); });
}
{
  const even = collapse([1 / 60]);
  assert.deepEqual(collapse([1 / 60]), even, 'the same collapse lies the same way twice');
  assert.deepEqual(collapse([1 / 120, 1 / 120, 1 / 30, 1 / 60]), even, 'whatever the frame times (fixed steps from the accumulator)');
}

// --- a hull is a kinematic box: a slab lands on its deck; a hull driving through shoves a resting block
{
  const pool = createDebrisPhysics({ capacity: 8 });
  pool.bind(flat);
  const tank = { id: 'h', spec: getSpec('m1a2'), combat: { destroyed: false },
    state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, speed: 0, verticalSpeed: 0, yawRate: 0 } };
  pool.setHulls([tank]);
  const slab = pool.spawn(createRigidBox(0.8, 0.12, 0.8, 1900), { x: 0, y: 6, z: -2.6 });
  run(pool, 4);
  pool.framePoseAt(slab, pose);
  assert.ok(pose[1] > 1.2, `the slab rests on the deck, not through it (${pose[1].toFixed(2)} m)`);
  const rock = pool.spawn(block, { x: 0, y: 0.25, z: 9 });
  run(pool, 1);
  pool.framePoseAt(rock, pose);
  const z0 = pose[2];
  for (let n = 0; n < 150; n++) { tank.state.pos = { x: 0, y: 0, z: (n * 4) / 60 }; tank.state.speed = 4; pool.setHulls([tank]); pool.advance(1 / 60); }
  pool.framePoseAt(rock, pose);
  assert.ok(pose[2] > z0 + 2, `the hull shoved the block ahead of it (${z0.toFixed(2)} → ${pose[2].toFixed(2)})`);
}

// --- full: the oldest sleeper gives way, its final pose handed over to be frozen
{
  const pool = createDebrisPhysics({ capacity: 4 });
  pool.bind(flat);
  const evicted = [];
  pool.onEvict((handle, final) => evicted.push({ handle, y: final[1] }));
  const first = [0, 1, 2, 3].map((k) => pool.spawn(block, { x: k * 2, y: 1, z: 0 }));
  run(pool, 3);
  assert.ok(first.every((h) => pool.asleep(h)));
  const late = pool.spawn(block, { x: 20, y: 1, z: 0 });
  assert.equal(evicted.length, 1, 'one sleeper gave way');
  assert.equal(evicted[0].handle, first[0], 'the oldest');
  assert.ok(Math.abs(evicted[0].y - 0.25) < 0.02, 'with the pose it lay in');
  assert.equal(pool.framePoseAt(first[0], pose), false, 'its handle is retired');
  run(pool, 2);
  assert.equal(pool.asleep(late), true);
  pool.reset();
  assert.deepEqual(pool.stats(), { bodies: 0, awake: 0, waiting: 0, handles: 0, timeS: 0 });
}

// --- no allocation per advance once warm
if (typeof globalThis.gc === 'function') {
  const pool = createDebrisPhysics({ capacity: 32 });
  pool.bind({ groundAt: (x) => 0.05 * x });
  for (let k = 0; k < 24; k++) pool.spawn(block, { x: k * 0.5, y: 1 + (k % 4), z: 0, wx: k % 3 }, (k % 6) * 0.1);
  run(pool, 0.5);
  globalThis.gc();
  const before = process.memoryUsage().heapUsed;
  run(pool, 30);
  globalThis.gc();
  assert.ok(process.memoryUsage().heapUsed - before < 256 * 1024, 'the heap stays flat');
}

console.log('debrisPhysics.selftest: progressive release, landings with handles, rest flat, bit-identical across frame times, hull decks and shoves, oldest-sleeper eviction with its pose, flat heap');
