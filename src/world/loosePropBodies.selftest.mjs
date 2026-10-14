// loosePropBodies.selftest.mjs — the kicked clutter on the game's one physics engine (destruction stream, 2026-10-12; the
// owner: "make the physics for stuff falling around ... use the same kind of physics engine. like how turrets popping off
// is now using natural, grounded physics"). A drum kicked by a hull tumbles and comes to rest on its end or its side on
// the ground (a sphere on a spherical support before: it rolled like a ball and never lay down); a wheel rolls on its
// tread; a drum knocked into one at rest strikes it and sets it moving; a body asleep a while leaves the engine with its
// pose kept; the same kicks lie the same way twice; the cone keeps its ground-constrained law.
import assert from 'node:assert/strict';
import { createLoosePropBody, kickLooseProp } from './loosePropPhysics.ts';
import { createLoosePropBodies } from './loosePropBodies.ts';

const drum = (x, z) => createLoosePropBody({ x, baseY: 0, z, radius: 0.31, height: 0.92, mass: 1, restitution: 0.3 });
const run = (bodies, list, steps) => {
  for (let i = 0; i < steps; i++) {
    bodies.step();
    for (const b of list) if (bodies.has(b)) bodies.sync(b);
  }
};
/** The drum's axis (its local up) in the world: upright 1, on its side 0. */
const upright = (b) => Math.abs(1 - 2 * (b.qx * b.qx + b.qz * b.qz));

// a hull's kick: the drum leaves, tumbles, lies on the ground, asleep, then out of the engine with its pose kept
{
  const bodies = createLoosePropBodies({ groundAt: () => 0 });
  const b = drum(0, 0);
  assert.ok(kickLooseProp(b, 1, 0, 6, 'ram'), 'kicked');
  assert.ok(bodies.wake(b, 'drum') && bodies.has(b), 'into the engine');
  run(bodies, [b], 60 * 8);
  assert.equal(bodies.has(b), false, 'asleep a while, it left the engine');
  assert.equal(b.active, false, 'and the prop is at rest');
  assert.ok(b.x > 0.5, `it went along the kick (${b.x.toFixed(2)} m)`);
  const u = upright(b);
  // its centre over the ground by the half extent of the way it lies: its height's half upright, its radius on its side
  const expect = u > 0.7 ? 0.46 : 0.31;
  assert.ok(u > 0.9 || u < 0.15, `it rests on its end or its side, not on an edge in the air (axis ${u.toFixed(2)})`);
  assert.ok(Math.abs(b.y - expect) < 0.06, `on the ground (${b.y.toFixed(3)} vs ${expect})`);
}

// on a slope it comes to rest on the slope (or rolls off it), never hanging
{
  const ground = (x, z) => 0.18 * x + 0.05 * z;
  const bodies = createLoosePropBodies({ groundAt: ground });
  const b = createLoosePropBody({ x: 0, baseY: 0, z: 0, radius: 0.27, height: 0.72, mass: 0.82 });
  b.y = ground(0, 0) + 0.36;
  kickLooseProp(b, 0, 1, 5, 'ram');
  bodies.wake(b, 'jerrycan');
  run(bodies, [b], 60 * 10);
  const g = ground(b.x, b.z);
  assert.ok(b.y - g > 0.08 && b.y - g < 0.5, `on the slope (${(b.y - g).toFixed(3)} m over it)`);
}

// a drum knocked into one at rest strikes it: the resting one, admitted asleep, is set moving
{
  const bodies = createLoosePropBodies({ groundAt: () => 0 });
  const a = drum(0, 0), c = drum(1.0, 0);
  kickLooseProp(a, 1, 0, 7, 'ram');
  bodies.wake(a, 'drum');
  assert.ok(bodies.admitResting(c, 'drum'), 'the resting drum in reach enters asleep');
  run(bodies, [a, c], 60 * 6);
  assert.ok(c.x > 1.15, `struck, it moved on (${c.x.toFixed(2)} m)`);
  assert.ok(Math.hypot(a.x - c.x, a.z - c.z) > 0.55, 'they do not pass through each other');
}

// deterministic
{
  const once = () => {
    const bodies = createLoosePropBodies({ groundAt: (x) => 0.05 * x });
    const b = drum(0, 0), w = createLoosePropBody({ x: 2, baseY: 0, z: 0.5, radius: 0.34, height: 0.69, mass: 0.85 });
    kickLooseProp(b, 1, 0.3, 5, 'ram'); kickLooseProp(w, -0.2, 1, 6, 'shell');
    bodies.wake(b, 'drum'); bodies.wake(w, 'loosewheel');
    run(bodies, [b, w], 60 * 5);
    return [b.x, b.y, b.z, b.qx, b.qw, w.x, w.z].map((v) => Math.round(v * 1e6));
  };
  assert.deepEqual(once(), once(), 'the same kicks lie the same way');
}

// the cone keeps its own law
{
  const bodies = createLoosePropBodies({ groundAt: () => 0 });
  const cone = createLoosePropBody({ x: 0, baseY: 0, z: 0, radius: 0.27, height: 0.8, groundConstrained: true });
  assert.equal(bodies.handles(cone), false);
}

console.log('loosePropBodies selftest: kicked clutter tumbles and lies on its end or side, on slopes, strikes the clutter at rest, leaves the engine asleep, deterministic — ok');
