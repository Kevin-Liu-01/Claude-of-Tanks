import assert from 'node:assert/strict';
import {
  RIGID_PARTNER, createRigidBox, createRigidCylinder, createRigidShape, createRigidWorld,
} from './rigidBody.ts';

// The physics lane's engine (2026-10-10): bodies fall, land, tumble, roll and come to rest where the physics puts them —
// on the ground, on static prisms, on kinematic boxes and on each other — the same way twice, and asleep.

const flat = { groundAt: () => 0 };
const pose = new Float64Array(7);

function run(world, steps) { for (let n = 0; n < steps; n++) world.step(); }
function stepUntilAsleep(world, slot, max = 1800) {
  for (let n = 0; n < max; n++) { world.step(); if (world.asleep[slot]) return n + 1; }
  return -1;
}
/** The lowest point of a body's contact spheres (centre height minus radius). */
function lowestPoint(world, slot) {
  const shape = world.shape(slot);
  world.framePose(slot, pose);
  let low = Infinity;
  const [x, y, z, a, b, c, d] = pose;
  for (let k = 0; k < shape.sphereCount; k++) {
    // sphere centre in the frame = sphere (relative to the com) + com
    const sx = shape.spheres[k * 4] + shape.com[0], sy = shape.spheres[k * 4 + 1] + shape.com[1], sz = shape.spheres[k * 4 + 2] + shape.com[2];
    const tx = b * sz - c * sy + d * sx, ty = c * sx - a * sz + d * sy, tz = a * sy - b * sx + d * sz;
    const wy = sy + 2 * (c * tx - a * tz);
    void x; void z;
    low = Math.min(low, y + wy - shape.spheres[k * 4 + 3]);
  }
  return low;
}

// --- 1. a crate dropped on flat ground lands, rests at its half height and sleeps
{
  const world = createRigidWorld({ capacity: 4 });
  world.bindEnvironment(flat);
  const crate = createRigidBox(0.5, 0.4, 0.6, 800);
  const slot = world.spawn(crate, { x: 0, y: 3, z: 0 });
  assert.equal(slot, 0);
  const steps = stepUntilAsleep(world, slot);
  assert.ok(steps > 0 && steps < 240, `the crate settles within 4 s (${steps} steps)`);
  assert.ok(Math.abs(world.py[slot] - 0.4) < 0.02, `it rests on its face at its half height (${world.py[slot].toFixed(4)})`);
  assert.ok(Math.abs(world.qx[slot]) < 0.01 && Math.abs(world.qz[slot]) < 0.01, 'flat, not tipped');
  const y0 = world.py[slot];
  run(world, 600);
  assert.equal(world.py[slot], y0, 'asleep: its pose never drifts');
}

// --- 2. hard landings are reported (dust and sound), once per cooldown
{
  const world = createRigidWorld({ capacity: 2 });
  world.bindEnvironment(flat);
  const slot = world.spawn(createRigidBox(0.5, 0.5, 0.5, 900), { x: 2, y: 6, z: 1 });
  let impacts = 0, speed = 0, partner = -1, at = null;
  for (let n = 0; n < 240; n++) {
    world.step();
    for (let k = 0; k < world.impactCount; k++) {
      impacts++;
      if (world.impactSpeed[k] > speed) { speed = world.impactSpeed[k]; partner = world.impactPartner[k]; at = [world.impactX[k], world.impactY[k], world.impactZ[k]]; }
      assert.equal(world.impactSlot[k], slot);
    }
  }
  assert.ok(impacts >= 1 && impacts <= 6, `a drop reports its landing and a bounce or two (${impacts})`);
  assert.ok(speed > 8 && speed < 12, `at the speed it fell (${speed.toFixed(2)} m/s ≈ √(2 g 5.5))`);
  assert.equal(partner, RIGID_PARTNER.GROUND);
  assert.ok(Math.abs(at[1]) < 0.1 && Math.abs(at[0] - 2) < 0.8, 'where it hit the ground');
}

// --- 3. tumbling down a slope, it ends lying on the slope (the ground, not a table, decides the pose)
const slope = { groundAt: (x) => -0.35 * x };
function slopeRun() {
  const world = createRigidWorld({ capacity: 4 });
  world.bindEnvironment(slope);
  const box = createRigidBox(0.9, 0.35, 1.4, 1500, { restitution: 0.25, friction: 0.55 });
  const slot = world.spawn(box, { x: 0, y: 2.5, z: 0, qx: 0.2, qy: 0.1, qz: 0.15, qw: 0.96, vx: 3, vy: 1, wz: -2.5, wy: 1 });
  const steps = stepUntilAsleep(world, slot, 3000);
  return { world, slot, steps };
}
{
  const { world, slot, steps } = slopeRun();
  assert.ok(steps > 0, 'it comes to rest on the slope');
  const ground = slope.groundAt(world.px[slot]);
  const low = lowestPoint(world, slot);
  assert.ok(Math.abs(low - (ground - 0.35 * 0)) < 0.6, 'its lowest point lies on the ground under it');
  assert.ok(world.px[slot] > 1, `it slid and tumbled downhill (x ${world.px[slot].toFixed(2)})`);
}

// --- 4. deterministic: the same throw twice lands bit for bit in the same place
{
  const a = slopeRun(), b = slopeRun();
  assert.equal(a.steps, b.steps, 'the same number of steps to rest');
  for (const key of ['px', 'py', 'pz', 'qx', 'qy', 'qz', 'qw']) {
    assert.ok(Object.is(a.world[key][a.slot], b.world[key][b.slot]), `${key} identical to the bit`);
  }
}

// --- 5. a drum rolls down a slope and rolling resistance stops it on the flat
{
  const valley = { groundAt: (x) => (x < 6 ? -0.3 * (x - 6) : 0) };
  const world = createRigidWorld({ capacity: 2 });
  world.bindEnvironment(valley);
  // lying on its side: the cylinder's axis (local Y) along world Z
  const drum = createRigidCylinder(0.45, 0.6, 600, { rolling: 0.9, friction: 0.7 });
  const s = Math.SQRT1_2;
  const slot = world.spawn(drum, { x: 0, y: 1.8 + 0.45, z: 0, qx: s, qy: 0, qz: 0, qw: s });
  let maxSpin = 0;
  for (let n = 0; n < 1200 && !world.asleep[slot]; n++) {
    world.step();
    maxSpin = Math.max(maxSpin, Math.hypot(world.wx[slot], world.wy[slot], world.wz[slot]));
  }
  assert.ok(maxSpin > 3, `it rolled (peak spin ${maxSpin.toFixed(2)} rad/s)`);
  assert.ok(world.px[slot] > 6.5, `it reached the flat (x ${world.px[slot].toFixed(2)})`);
  assert.ok(world.px[slot] < 40, 'and stopped there');
  assert.ok(Math.abs(world.py[slot] - 0.45) < 0.05, `lying on its side (centre ${world.py[slot].toFixed(3)})`);
}

// --- 6. a wall (a static convex prism) stops a thrown block; a compound record's low wing is stood on
{
  const wall = { min: [4, 0, -5], max: [4.4, 3, 5], shape2: { kind: 'convex', cx: 4.2, cz: 0, points: [4, -5, 4.4, -5, 4.4, 5, 4, 5] } };
  const roof = { min: [-10, 0, 10], max: [0, 2, 20], shape2: { kind: 'compound', cx: -5, cz: 15, parts: [
    { kind: 'obb', cx: -5, cz: 15, hw: 5, hl: 5, yaw: 0, y0: 0, y1: 2 },
  ] } };
  const records = [wall, roof];
  const env = { groundAt: () => 0, queryStatic: (minX, minZ, maxX, maxZ, out) => {
    out.length = 0;
    for (const r of records) if (!(r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ)) out.push(r);
    return out;
  } };
  const world = createRigidWorld({ capacity: 4 });
  world.bindEnvironment(env);
  const block = createRigidBox(0.4, 0.4, 0.4, 1200);
  const thrown = world.spawn(block, { x: 0, y: 1.2, z: 0, vx: 12, vy: 1.5 });
  const dropped = world.spawn(block, { x: -5, y: 5, z: 15 });
  run(world, 600);
  assert.ok(world.px[thrown] < 4 - 0.35, `the wall stopped it on its own side (x ${world.px[thrown].toFixed(3)})`);
  assert.ok(Math.abs(world.py[dropped] - 2.4) < 0.03, `the dropped block stands on the roof (${world.py[dropped].toFixed(3)})`);
  // the wall goes (a collapse): a dead record is not solid, and a sleeper over a vanished roof wakes and falls
  roof.dead = true;
  run(world, 240);
  assert.ok(Math.abs(world.py[dropped] - 0.4) < 0.03, `with the roof gone it fell to the ground (${world.py[dropped].toFixed(3)})`);
}

// --- 7. kinematic boxes: a turret-sized box rests on a hull deck, and a moving hull shoves a resting body
{
  const world = createRigidWorld({ capacity: 4, kinematicCapacity: 4 });
  world.bindEnvironment(flat);
  world.setKinematicCount(1);
  // a hull 7 × 2 × 3.6 m standing on the ground (centre at 1 m)
  world.setKinematic(0, 7, 0, 1, 0, 0, 0, 0, 1, 1.8, 1, 3.5, 0, 0, 0, 0, 0, 0);
  const turret = createRigidBox(1.6, 0.45, 2.0, 2400);
  const slot = world.spawn(turret, { x: 0.3, y: 2.6, z: 0, owner: 7 });
  assert.ok(stepUntilAsleep(world, slot) > 0, 'the turret settles');
  assert.ok(Math.abs(world.py[slot] - 2.45) < 0.03, `on the deck (${world.py[slot].toFixed(3)})`);
  // a second hull drives into a crate on the ground at 4 m/s
  const crate = world.spawn(createRigidBox(0.5, 0.5, 0.5, 300), { x: 8, y: 0.5, z: 0 });
  assert.ok(stepUntilAsleep(world, crate) > 0);
  const x0 = world.px[crate];
  world.setKinematicCount(2);
  let hullX = 4;
  for (let n = 0; n < 120; n++) {
    hullX += 4 / 60;
    world.setKinematic(1, 9, hullX, 1, 0, 0, 0, 0, 1, 1.8, 1, 3.5, 4, 0, 0, 0, 0, 0);
    world.step();
  }
  assert.ok(world.px[crate] > x0 + 3, `the moving hull pushed the crate along (${x0.toFixed(2)} → ${world.px[crate].toFixed(2)})`);
  assert.ok(world.px[crate] > hullX + 1.8 + 0.4, 'and it stayed in front of the hull, not inside it');
}

// --- 8. bodies on bodies: a stack of three settles and sleeps without jitter
{
  const world = createRigidWorld({ capacity: 4 });
  world.bindEnvironment(flat);
  const box = createRigidBox(0.6, 0.3, 0.6, 700);
  const slots = [0, 1, 2].map((k) => world.spawn(box, { x: 0.05 * k, y: 0.3 + k * 0.62 + 0.05, z: 0 }));
  run(world, 400);
  for (const [k, slot] of slots.entries()) {
    assert.equal(world.asleep[slot], 1, `stacked box ${k} asleep`);
    assert.ok(Math.abs(world.py[slot] - (0.3 + k * 0.6)) < 0.04, `box ${k} rests on the one below (${world.py[slot].toFixed(3)})`);
  }
  // a fast block thrown into the sleeping stack wakes it
  const thrown = world.spawn(createRigidBox(0.25, 0.25, 0.25, 2000), { x: -4, y: 1.5, z: 0, vx: 14, vy: 1 });
  run(world, 20);
  assert.ok(world.asleep[slots[2]] === 0 || world.asleep[slots[1]] === 0, 'the hit woke the stack');
  run(world, 900);
  for (const slot of [...slots, thrown]) assert.equal(world.asleep[slot], 1, 'everything comes to rest again');
}

// --- 9. a compound turret with its gun: it tumbles, lands, and neither the hull box nor the barrel sinks into the ground
{
  const turret = createRigidShape([
    { kind: 'box', center: [0, 0.45, -0.2], half: [1.7, 0.45, 2.1], mass: 14000 },
    { kind: 'capsule', a: [0, 0.5, 1.9], b: [0, 0.38, 6.6], radius: 0.09, mass: 2200 },
  ], { restitution: 0.3, friction: 0.6, rolling: 0.3 });
  assert.ok(turret.com[2] > 0, 'the gun pulls the centre of mass forward');
  const world = createRigidWorld({ capacity: 2 });
  world.bindEnvironment(slope);
  const slot = world.spawn(turret, { x: 0, y: 4, z: 0, vx: 1.8, vy: 7.5, vz: 0.6, wx: 1.4, wy: 2.2, wz: -1.1 });
  let lowest = Infinity;
  for (let n = 0; n < 1800 && !world.asleep[slot]; n++) {
    world.step();
    const shape = world.shape(slot);
    // the deepest any sphere reaches under the ground
    for (let k = 0; k < shape.sphereCount; k++) {
      const s = shape.spheres;
      const x = s[k * 4], y = s[k * 4 + 1], z = s[k * 4 + 2];
      const a = world.qx[slot], b = world.qy[slot], c = world.qz[slot], d = world.qw[slot];
      const tx = b * z - c * y + d * x, ty = c * x - a * z + d * y, tz = a * y - b * x + d * z;
      const wxp = world.px[slot] + x + 2 * (b * tz - c * ty);
      const wyp = world.py[slot] + y + 2 * (c * tx - a * tz);
      lowest = Math.min(lowest, wyp - s[k * 4 + 3] - slope.groundAt(wxp));
    }
  }
  assert.equal(world.asleep[slot], 1, 'the turret comes to rest');
  assert.ok(lowest > -0.12, `no part of it sank more than a few centimetres into the ground (${lowest.toFixed(3)} m)`);
}

// --- 10. a sleeping body's pose is the one it lies in: framePoseAt interpolates and never jumps
{
  const world = createRigidWorld({ capacity: 2 });
  world.bindEnvironment(flat);
  const slot = world.spawn(createRigidBox(0.5, 0.2, 0.9, 900), { x: 0, y: 1.5, z: 0, wx: 3, vz: 2 });
  const prev = new Float64Array(7), cur = new Float64Array(7), mid = new Float64Array(7);
  let worst = 0;
  for (let n = 0; n < 400; n++) {
    world.step();
    world.framePoseAt(slot, 0, prev);
    world.framePoseAt(slot, 1, cur);
    world.framePoseAt(slot, 0.5, mid);
    const jump = Math.hypot(cur[0] - prev[0], cur[1] - prev[1], cur[2] - prev[2]);
    worst = Math.max(worst, jump);
    assert.ok(Math.abs(mid[1] - (prev[1] + cur[1]) / 2) < 1e-9 + jump, 'half way is between');
  }
  assert.ok(worst < 0.25, `no frame-to-frame jump larger than a step's travel (${worst.toFixed(3)} m)`);
}

// --- 11. wedged piles come to rest (dcore, 2026-10-10: a slab tilted on a corner pier with a wall panel wedged under
// its edge climbed ~5 cm/s and never slept — the panel's edge had pierced the slab, the two boxes' spheres were pushed out
// of opposite faces and clamped them together; static corners were solved cold every step and flickered)
{
  let seed = 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const slabShape = createRigidBox(2.8, 0.14, 2.4, 2200, { restitution: 0.12, friction: 0.7 });
  const panelShape = createRigidBox(2.2, 1.5, 0.18, 1900, { restitution: 0.12, friction: 0.7 });
  let awake = 0, worstClimb = 0;
  for (let v = 0; v < 40; v++) {
    const pierH = 1.2 + rnd() * 1.6;
    const pier = { min: [-0.4, 0, -0.4], max: [0.4, pierH, 0.4], shape2: { kind: 'obb', cx: 0, cz: 0, hw: 0.4, hl: 0.4, yaw: 0 } };
    const world = createRigidWorld({ capacity: 4 });
    world.bindEnvironment({ groundAt: () => 0, queryStatic: (minX, minZ, maxX, maxZ, out) => {
      out.length = 0;
      if (!(pier.max[0] < minX || pier.min[0] > maxX || pier.max[2] < minZ || pier.min[2] > maxZ)) out.push(pier);
      return out;
    } });
    const lean = rnd() * 1.4, yaw = (rnd() - 0.5) * 1.2;
    const cy = Math.cos(yaw / 2), sy = Math.sin(yaw / 2), cl = Math.cos(lean / 2), sl = Math.sin(lean / 2);
    const panel = world.spawn(panelShape, { x: 3.2 + rnd() * 1.6, y: 1.6 + rnd(), z: (rnd() - 0.5) * 2,
      qx: cy * sl, qy: sy * cl, qz: -sy * sl, qw: cy * cl });
    const tilt = 0.2 + rnd() * 0.35;
    const slab = world.spawn(slabShape, { x: 1.8 + rnd() * 0.6, y: pierH + 1.4 + rnd(), z: (rnd() - 0.5) * 0.8,
      qz: -Math.sin(tilt / 2), qw: Math.cos(tilt / 2), vx: rnd() - 0.5, wy: rnd() - 0.5 });
    let y12 = 0;
    for (let n = 0; n < 60 * 20; n++) { world.step(); if (n === 60 * 12) y12 = world.py[slab]; }
    if (!world.asleep[slab] || !world.asleep[panel]) awake++;
    worstClimb = Math.max(worstClimb, world.py[slab] - y12);
  }
  assert.equal(awake, 0, `every wedged pile sleeps within 20 s (${awake} of 40 still awake)`);
  assert.ok(worstClimb < 0.02, `no slab creeps up its pile (${worstClimb.toFixed(3)} m over 8 s)`);
}

// --- 12. no allocation per step (heap stays flat across many steps once warm)
if (typeof globalThis.gc === 'function') {
  const world = createRigidWorld({ capacity: 16 });
  world.bindEnvironment(slope);
  const box = createRigidBox(0.5, 0.3, 0.7, 900);
  for (let k = 0; k < 12; k++) world.spawn(box, { x: k * 0.4, y: 2 + k * 0.7, z: (k % 3) * 0.5, wx: k * 0.3, vy: 2 });
  run(world, 200);
  globalThis.gc();
  const before = process.memoryUsage().heapUsed;
  for (let k = 0; k < 4000; k++) world.step();
  globalThis.gc();
  const grown = process.memoryUsage().heapUsed - before;
  assert.ok(grown < 512 * 1024, `the heap stays flat across 4,000 steps (${(grown / 1024).toFixed(0)} KB)`);
}

console.log('rigidBody.selftest: drop + sleep, impact reports, slope tumble, bit-identical reruns, rolling drum, static walls and vanished roofs, kinematic decks and shoves, stacks, compound turret with gun, interpolation, wedged piles at rest');
