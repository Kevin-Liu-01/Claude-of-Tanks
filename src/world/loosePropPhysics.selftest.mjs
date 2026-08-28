import assert from 'node:assert/strict';
import {
  LOOSE_PROP_STEP_S, createLoosePropBody, kickLooseProp,
  resetLoosePropBody, resolveLoosePropObstacle, resolveLoosePropPair,
  stepLoosePropBody,
} from './loosePropPhysics.ts';
import { DESTRUCTIBLE_TYPES } from './maps/inhabitKit.js';

const flat = () => 0;
const up = () => ({ x: 0, y: 1, z: 0 });

const expectedLooseFamilies = [
  'churn', 'drum', 'cone', 'trashcan', 'gasbottle', 'bucket', 'jerrycan', 'loosewheel',
];
for (const kind of expectedLooseFamilies) {
  const meta = DESTRUCTIBLE_TYPES[kind];
  assert.equal(meta?.cls, 'physics', `${kind} is registered as persistent loose dressing`);
  assert.equal(meta?.contact, 'loop', `${kind} uses hull-radius contact instead of a blocking collider`);
  assert.ok(meta.bodyR > 0 && meta.mass > 0 && meta.bounce > 0,
    `${kind} publishes bounded body tuning`);
}
assert.equal(DESTRUCTIBLE_TYPES.cone.groundConstrained, true,
  'every authored traffic cone uses the bounded ground-contact model');

function body(overrides = {}) {
  return createLoosePropBody({
    x: 0, baseY: 0, z: 0, radius: 0.31, height: 0.9,
    mass: 1, restitution: 0.34, spinBias: 1, ...overrides,
  });
}

// A ram wakes the body, moves it in the impact direction and debounces the
// following overlap tick instead of injecting energy 60 times per second.
{
  const b = body();
  assert.equal(kickLooseProp(b, 1, 0, 8, 'ram'), true);
  assert.equal(kickLooseProp(b, 1, 0, 8, 'ram'), false);
  for (let i = 0; i < 20; i++) stepLoosePropBody(b, LOOSE_PROP_STEP_S, flat, up);
  assert.ok(b.x > 1, `rammed body travelled forward (${b.x})`);
  assert.ok(Math.abs(b.qx) + Math.abs(b.qy) + Math.abs(b.qz) > 0.05,
    'rammed body visibly tumbles');
}

// Restitution produces a real rebound and damping eventually sleeps it.
{
  const b = body();
  kickLooseProp(b, 0, 1, 12, 'ram');
  let bounced = false;
  for (let i = 0; i < 900 && b.active; i++) {
    const flags = stepLoosePropBody(b, LOOSE_PROP_STEP_S, flat, up);
    if (flags & 2) bounced = true;
  }
  assert.equal(bounced, true, 'body records a terrain rebound');
  assert.equal(b.active, false, 'damped body enters the sleeping set');
}

// Regression: sustained tank overlap used to refresh the light cone's upward
// kick every contact window, launching it more than 40 m in ten seconds.
// Cones now stay terrain-bound even while ram contact is attempted every tick.
{
  const b = body({
    radius: 0.27, height: 0.8, mass: 0.34, restitution: 0.2,
    friction: 3.8, angularDrag: 2.4, groundConstrained: true,
  });
  let maxY = b.y;
  for (let i = 0; i < 600; i++) {
    kickLooseProp(b, 1, 0, 14, 'ram');
    stepLoosePropBody(b, LOOSE_PROP_STEP_S, flat, up);
    maxY = Math.max(maxY, b.y);
    assert.ok(Number.isFinite(b.x + b.y + b.z + b.qx + b.qy + b.qz + b.qw),
      `cone state stays finite at fixed step ${i}`);
  }
  assert.ok(maxY <= 0.4000001, `cone never gains altitude under sustained contact (${maxY})`);
  assert.equal(b.vy, 0, 'ground-constrained cone has no vertical velocity state');
  assert.ok(Math.hypot(b.vx, b.vz) <= 7.5000001, 'cone planar speed remains hard-bounded');
}

// Static collision reflects velocity instead of allowing clutter through a
// building footprint.
{
  const b = body();
  b.x = 0.8; b.y = 0.4; b.vx = -4; b.active = true;
  const wall = { min: [-1, 0, -1], max: [0.7, 2, 1] };
  assert.equal(resolveLoosePropObstacle(b, wall), true);
  assert.ok(b.x >= 0.7 + b.radius - 1e-8, 'body is pushed outside wall');
  assert.ok(b.vx > 0, 'wall contact reflects closing velocity');
}

// Active clutter transfers momentum into a sleeping neighbour.
{
  const a = body({ x: 0 });
  const b = body({ x: 0.5 });
  a.active = true; a.vx = 3;
  const wakes = resolveLoosePropPair(a, b);
  assert.ok(wakes & 2, 'sleeping neighbour wakes');
  assert.ok(b.vx > 0, 'neighbour receives momentum');
}

// Reset is exact and deterministic for cached-world rematches.
{
  const a = body(), b = body();
  kickLooseProp(a, 0.4, 0.9, 9, 'ram');
  kickLooseProp(b, 0.4, 0.9, 9, 'ram');
  for (let i = 0; i < 180; i++) {
    stepLoosePropBody(a, LOOSE_PROP_STEP_S, flat, up);
    stepLoosePropBody(b, LOOSE_PROP_STEP_S, flat, up);
  }
  assert.deepEqual(a, b, 'identical fixed-step inputs stay deterministic');
  resetLoosePropBody(a);
  assert.deepEqual([a.x, a.y, a.z, a.qx, a.qy, a.qz, a.qw, a.active],
    [0, 0.45, 0, 0, 0, 0, 1, false]);
}

console.log('loosePropPhysics.selftest: impulse, bounce, sleep, collision and reset passed');
