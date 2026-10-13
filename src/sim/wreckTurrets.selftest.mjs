import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import {
  createWreckEnvironment, createWreckTurrets, hullQuaternion, turretLaunchVelocity, wreckTurretProfile,
} from './wreckTurrets.ts';

// The physics lane (2026-10-10): a dead hull's turret is a body the simulation owns. A cook-off throws it, any other
// death unseats it, and it comes to rest where the physics put it — no table pose, no snap — the same way twice.

const m1 = getSpec('m1a2');
const strv = getSpec('strv103');

// --- profiles: a turret box on the ring plane, a hull box under it, a gun barrel, a real mass; casemates have none
{
  const profile = wreckTurretProfile(m1);
  assert.ok(profile.shape, 'an M1A2 has a turret body');
  assert.ok(profile.shape.mass > 12000 && profile.shape.mass < 22000, `about a quarter of the hull's mass (${profile.shape.mass.toFixed(0)} kg)`);
  assert.ok(profile.turretCenter[1] - profile.turretHalf[1] >= 0.019, 'the turret box stands on the ring plane');
  assert.ok(profile.hullCenter[1] + profile.hullHalf[1] <= profile.pivot[1] + 1e-9, "the hull box's top is the ring plane");
  assert.ok(profile.shape.com[2] > profile.turretCenter[2], 'the gun pulls the centre of mass forward of the box');
  assert.equal(wreckTurretProfile(m1), profile, 'cached per spec');
  assert.equal(wreckTurretProfile(strv).shape, null, 'the S-tank (turretless) throws no turret');
  assert.ok(wreckTurretProfile(strv).hullHalf[2] > 2, 'but stands as a hull box for the others');
}

// --- launch velocities: a cook-off throws high over its fireball (an MBT's turret 6–14 m over the ring), well off to a
// side, tumbling end over end; the speed is the charge's work on the turret's mass; a plain death unseats
{
  const out = new Float64Array(6);
  let seed = 1;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let n = 0; n < 50; n++) {
    turretLaunchVelocity('ammorack', 66.8, random, out);
    assert.ok(out[1] > 10.4 && out[1] < 16.6, `cook-off up ${out[1].toFixed(2)} (apex ${(out[1] ** 2 / 19.62).toFixed(1)} m)`);
    assert.ok(Math.hypot(out[0], out[2]) >= 1.79 && Math.hypot(out[0], out[2]) <= 4.41, 'thrown well off to a side');
    assert.ok(Math.hypot(out[3], out[4], out[5]) > 1.3, 'tumbling');
    turretLaunchVelocity('shot', 66.8, random, out);
    assert.ok(out[1] > 1.5 && out[1] < 2.7 && Math.hypot(out[0], out[2]) < 0.81, 'a plain kill unseats it');
  }
  // the same rack throws a light turret higher than a heavy one, never past the cap
  const draws = (k) => { let i = 0; return () => [0.5, 0.5, 0.5, 0.5, 0.5, k, 0.5, 0.5, 0.5][i++ % 9]; };
  turretLaunchVelocity('ammorack', 66.8, draws(0.5), out, 16000);
  const heavy = out[1];
  turretLaunchVelocity('ammorack', 66.8, draws(0.5), out, 9000);
  assert.ok(out[1] > heavy * 1.25, `a lighter turret flies faster (${heavy.toFixed(1)} → ${out[1].toFixed(1)} m/s)`);
  turretLaunchVelocity('ammorack', 66.8, draws(1), out, 1500);
  assert.ok(out[1] <= 19 + 1e-9, 'capped');
}

// --- the outline: a turret meets the world where its armour reaches, not on its box's faces. Its base is a face (it
// sits on its ring plane), its side is no face (it does not stand on it "like a coin")
{
  const profile = wreckTurretProfile(m1);
  const s = profile.shape;
  const outline = [];
  for (let i = 0; i < s.sphereCount; i++) {
    if (s.sphereSolid[i] === 0) outline.push([s.spheres[i * 4] + s.com[0], s.spheres[i * 4 + 1] + s.com[1], s.spheres[i * 4 + 2] + s.com[2]]);
  }
  assert.ok(outline.length >= 12 && outline.length <= 60, `outline points (${outline.length})`);
  const c = profile.turretCenter, h = profile.turretHalf;
  for (const p of outline) for (let k = 0; k < 3; k++) assert.ok(Math.abs(p[k] - c[k]) <= h[k] + 1e-6, 'inside the turret box');
  const near = (k, sign) => { const ext = Math.max(...outline.map((p) => sign * p[k])); return outline.filter((p) => sign * p[k] >= ext - 0.03).length; };
  assert.ok(near(1, -1) >= 6, 'the base is a face');
  assert.ok(near(0, 1) <= 3 && near(0, -1) <= 3, 'a side is an edge at most');
}


// a hull standing on flat ground, at rest
function hull(id = 'h1', yaw = 0.3) {
  return {
    id, spec: m1,
    state: { pos: { x: 10, y: 0, z: -4 }, yaw, visualPitch: 0, visualRoll: 0, turretYaw: 0.4, speed: 0, verticalSpeed: 0, yawRate: 0 },
    combat: { destroyed: true },
  };
}
const flat = createWreckEnvironment(() => 0, [], []);
const pose = new Float64Array(7);

function settle(turrets, tanks, max = 1200) {
  let peak = -Infinity;
  for (let n = 0; n < max; n++) {
    turrets.step(tanks);
    for (const tank of tanks) if (turrets.framePose(tank.id, pose)) peak = Math.max(peak, pose[1]);
    if (tanks.every((tank) => !turrets.has(tank.id) || turrets.settled(tank.id))) return { steps: n + 1, peak };
  }
  return { steps: -1, peak };
}

/** The turret frame's lowest contact point above the ground (y 0). */
function lowestOverGround(turrets, id) {
  const slot = turrets.world.shape ? [...Array(turrets.world.capacity).keys()].find((s) => turrets.world.active[s]) : -1;
  void slot;
  turrets.framePose(id, pose);
  const profile = wreckTurretProfile(m1);
  const shape = profile.shape;
  const q = new Quaternion(pose[3], pose[4], pose[5], pose[6]);
  let low = Infinity;
  const v = new Vector3();
  for (let k = 0; k < shape.sphereCount; k++) {
    v.set(shape.spheres[k * 4] + shape.com[0], shape.spheres[k * 4 + 1] + shape.com[1], shape.spheres[k * 4 + 2] + shape.com[2]).applyQuaternion(q);
    low = Math.min(low, pose[1] + v.y - shape.spheres[k * 4 + 3]);
  }
  return low;
}

// --- set down on its side an M1A2's turret lies on it (its armour's flank is a face) and rocks to rest; set upright on
// its bustle, gun to the sky, it has no footing there (an end's upper points stand back from it) and goes over at once
// (a 3.4 m column still takes a second or two to come down from upright; a landing turret rarely stands there at all)
function setDown(rotation, lift) {
  const turrets = createWreckTurrets({ seed: 5 });
  turrets.bind(flat);
  const tank = hull('h9', 0);
  tank.state.pos = { x: 40, y: 0, z: 40 }; // far from the body: the hull box plays no part
  assert.equal(turrets.restore(tank, { x: 0, y: lift, z: 0, qx: rotation.x, qy: rotation.y, qz: rotation.z, qw: rotation.w, asleep: false }), true);
  const up = new Vector3();
  const tilts = [];
  for (let n = 0; n < 360; n++) {
    turrets.step([tank]);
    turrets.framePose(tank.id, pose);
    up.set(0, 1, 0).applyQuaternion(new Quaternion(pose[3], pose[4], pose[5], pose[6]));
    tilts.push(Math.acos(Math.max(-1, Math.min(1, up.y))) * 57.2958);
  }
  return tilts;
}
{
  // on its right side (+x down), a hair off square
  const side = setDown(new Quaternion().setFromEuler(new (await import('three')).Euler(0.02, 0, Math.PI / 2 + 0.03)), 1.95);
  const still = side.slice(300).every((t) => Math.abs(t - side[359]) < 0.02);
  assert.ok(still && Math.abs(side[359] - 90) < 3, `at rest on its flank by 5 s (${side[300].toFixed(2)}° → ${side[359].toFixed(2)}°)`);
  // upright on its bustle, gun to the sky, leaning 6°
  const bustle = setDown(new Quaternion().setFromEuler(new (await import('three')).Euler(-Math.PI / 2 + 0.105, 0, 0)), 3.45);
  const down = bustle.findIndex((t) => Math.abs(t - 90) > 45);
  assert.ok(down > 0 && down < 240, `off its bustle within 4 s (${down < 0 ? 'never' : (down / 60).toFixed(2) + ' s'})`);
  // set exactly upright on its bustle it has no footing there: it starts over at once instead of standing
  const upright = setDown(new Quaternion().setFromEuler(new (await import('three')).Euler(-Math.PI / 2, 0, 0)), 3.45);
  const over = upright.findIndex((t) => Math.abs(t - 90) > 45);
  assert.ok(Math.abs(upright[48] - 90) > 2.5, `upright on its bustle it is going over within 0.8 s (${upright[48].toFixed(1)}°)`);
  assert.ok(over > 0 && over < 180, `and down within 3 s (${over < 0 ? 'never' : (over / 60).toFixed(2) + ' s'})`);
}

// --- a cook-off: the turret flies, tumbles and lies on the ground beside its hull (or on it), asleep — never seated
function cookOff(tick = 120) {
  const turrets = createWreckTurrets({ seed: 7 });
  turrets.bind(flat);
  const tank = hull();
  assert.equal(turrets.launch(tank, 'ammorack', tick), true);
  assert.equal(turrets.launch(tank, 'ammorack', tick + 1), false, 'a turret flies once');
  const seat = new Float64Array(7);
  turrets.framePose(tank.id, seat);
  const result = settle(turrets, [tank]);
  turrets.framePose(tank.id, pose);
  return { turrets, tank, seat, result, pose: Float64Array.from(pose) };
}
{
  const { turrets, tank, seat, result, pose: rest } = cookOff();
  const profile = wreckTurretProfile(m1);
  assert.ok(Math.abs(seat[1] - profile.pivot[1]) < 1e-9, 'it launches from its ring');
  assert.ok(result.steps > 60 && result.steps < 900, `it comes to rest (${result.steps} steps)`);
  assert.ok(result.peak > seat[1] + 1.6, `thrown well clear of the hull (peak ${(result.peak - seat[1]).toFixed(2)} m over the ring)`);
  const moved = Math.hypot(rest[0] - seat[0], rest[2] - seat[2]);
  assert.ok(moved > 0.8, `it landed away from its ring (${moved.toFixed(2)} m)`);
  const low = lowestOverGround(turrets, tank.id);
  const hullTop = profile.hullCenter[1] + profile.hullHalf[1];
  assert.ok(Math.abs(low) < 0.06 || Math.abs(low - hullTop) < 0.12, `it lies on the ground or on the hull (lowest point ${low.toFixed(3)} m)`);
  for (const value of rest) assert.ok(Number.isFinite(value));
  // asleep: its pose never moves again
  const before = Float64Array.from(rest);
  for (let n = 0; n < 300; n++) turrets.step([tank]);
  turrets.framePose(tank.id, pose);
  assert.deepEqual([...pose], [...before], 'settled for good');
}

// --- the same kill twice lands to the bit; another tick throws another way
{
  const a = cookOff(120), b = cookOff(120), c = cookOff(121);
  assert.equal(a.result.steps, b.result.steps);
  assert.deepEqual([...a.pose], [...b.pose], 'bit-identical rest pose');
  assert.equal(a.turrets.digest(), b.turrets.digest());
  assert.notDeepEqual([...a.pose], [...c.pose], 'the launch is seeded by the kill');
}

// --- a plain kill: the turret is knocked off its ring and drops back on its own deck, askew
{
  const turrets = createWreckTurrets({ seed: 3 });
  turrets.bind(flat);
  const tank = hull('h2', -1.1);
  turrets.launch(tank, 'shot', 400);
  const seat = new Float64Array(7);
  turrets.framePose(tank.id, seat);
  const result = settle(turrets, [tank]);
  assert.ok(result.steps > 0, 'it settles');
  turrets.framePose(tank.id, pose);
  assert.ok(Math.abs(pose[1] - seat[1]) < 0.12, `back on the deck (Δy ${(pose[1] - seat[1]).toFixed(3)} m)`);
  assert.ok(result.peak - seat[1] > 0.08 && result.peak - seat[1] < 0.5, `a jolt, not a throw (${(result.peak - seat[1]).toFixed(2)} m)`);
  const turned = 2 * Math.acos(Math.min(1, Math.abs(seat[3] * pose[3] + seat[4] * pose[4] + seat[5] * pose[5] + seat[6] * pose[6])));
  assert.ok(turned > 0.01, `askew on its ring (${(turned * 57.3).toFixed(1)}°)`);
}

// --- a live hull drives into a resting turret and shoves it; a respawned hull takes its turret back
{
  const turrets = createWreckTurrets({ seed: 11 });
  turrets.bind(flat);
  const dead = hull('dead', 0);
  dead.state.pos = { x: 0, y: 0, z: 0 };
  turrets.launch(dead, 'shot', 10);
  settle(turrets, [dead]);
  turrets.framePose('dead', pose);
  const z0 = pose[2];
  // a live M1A2 drives in from behind along +z at 5 m/s, its hull box in line with the turret on the deck
  const live = { id: 'live', spec: m1, combat: { destroyed: false },
    state: { pos: { x: 0, y: 0, z: -12 }, yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, speed: 5, verticalSpeed: 0, yawRate: 0 } };
  for (let n = 0; n < 240; n++) {
    live.state.pos = { x: 0, y: 0, z: -12 + (5 * n) / 60 };
    // the dead hull is shoved too (movement owns it): it moves ahead of the live one once they meet
    if (live.state.pos.z > -7.9) { dead.state.pos = { x: 0, y: 0, z: live.state.pos.z + 7.9 }; dead.state.speed = 5; }
    turrets.step([dead, live]);
  }
  turrets.framePose('dead', pose);
  assert.ok(pose[2] > z0 + 2, `the shoved hull carried its turret along (${z0.toFixed(2)} → ${pose[2].toFixed(2)})`);
  dead.combat.destroyed = false;
  turrets.step([dead, live]);
  assert.equal(turrets.has('dead'), false, 'a hull that lives again takes its turret back');
}

// --- the turret frame as a matrix (armor.ts traces the turret's plates at it) and a restored body
{
  const { turrets, tank, pose: rest } = cookOff();
  const m = new Matrix4();
  assert.equal(turrets.frameMatrix(tank.id, m), true);
  const p = new Vector3(), q = new Quaternion(), s = new Vector3();
  m.decompose(p, q, s);
  assert.ok(Math.abs(p.x - rest[0]) < 1e-9 && Math.abs(p.y - rest[1]) < 1e-9 && Math.abs(s.x - 1) < 1e-9);
  const again = createWreckTurrets({ seed: 7 });
  again.bind(flat);
  assert.equal(again.restore(tank, { x: rest[0], y: rest[1], z: rest[2], qx: rest[3], qy: rest[4], qz: rest[5], qw: rest[6], asleep: true }), true);
  again.step([tank]);
  again.framePose(tank.id, pose);
  assert.deepEqual([...pose].map((v) => Math.round(v * 1e6)), [...rest].map((v) => Math.round(v * 1e6)), 'a restored settled body lies where it lay');
}

// --- hull quaternion matches three's Euler YXZ (−pitch, yaw, roll)
{
  const out = new Float64Array(4);
  hullQuaternion(0.7, 0.12, -0.08, out);
  const ref = new Quaternion().setFromEuler(new (await import('three')).Euler(-0.12, 0.7, -0.08, 'YXZ'));
  assert.ok(Math.abs(out[0] - ref.x) < 1e-12 && Math.abs(out[1] - ref.y) < 1e-12 && Math.abs(out[2] - ref.z) < 1e-12 && Math.abs(out[3] - ref.w) < 1e-12);
}

console.log('wreckTurrets.selftest: profiles, seeded launches scaled by charge and turret mass, the armour outline, set-down flank and bustle, cook-off flight to rest, bit-identical reruns, plain-kill unseat on the deck, shoves and respawns, frame matrix and restore');
