// obstacleDepenetration.selftest.mjs — a hull leaves an obstacle it already stands in over a few steps, while one driven
// into a wall still stops at it at once (destruction stream, 2026-10-12; the owner: "tanks driving on odd surfaces like
// rocks and other irregularities will stop being glitchy and weird").
//
// The field audit (tools/physics-torture.mjs --field, 28 bots for 120 s) found the obstacle push throwing hulls in one
// tick: a parked M1A2 SEPv3 0.43 m off Frontier's bunker and sandbags, once a second; a T-72BU 0.90-0.97 m sideways off a
// Redrock boulder. The push's part that undoes the step's own travel into the obstacle still applies at once; the rest —
// an overlap the hull was already in (an attitude change on a rock, a support change, a refused crush) — leaves at most a
// quarter of itself a step, never less than 6 cm. Real movement (sim/movement.ts updateTank) against a collide resolver
// that pushes the hull's footprint out of a wall.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import '../vehicles/fleetFactory.ts';
import { getSpec } from '../vehicles/specs.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { createTankState, updateTank, SIM_DT } from './movement.ts';

await ensureAuthorityFleet(['m1a2']);
const flat = { getHeightAt: () => 0, getNormalAt: () => ({ x: 0, y: 1, z: 0 }), getGroundType: () => 'firm' };
const spec = getSpec('m1a2');
const halfLength = spec.dims.hullLengthM * 0.5;

function hull(x, speed = 0, throttle = 0) {
  const state = createTankState(spec, new Vector3(x, 0, 0), Math.PI / 2); // facing +x
  state.speed = speed;
  return {
    id: 'h', specId: 'm1a2', spec, state,
    combat: { hp: spec.hp, maxHp: spec.hp, destroyed: false, reload: { t: 0, totalS: 5, kind: 'ready' }, shellSlot: 0, modules: {}, crew: {},
      fire: { burning: false, tickTimer: 0, ticksLeft: 0 }, magazine: null },
    input: { throttle, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0, actionBits: 0 },
  };
}
// a wall whose face stands at x = 10: the resolver pushes the hull's nose (x + half length) back out of it
const wallX = 10;
const collide = (pos, _radius, out) => {
  const over = pos.x + halfLength - wallX;
  if (over <= 0) return false;
  out.x -= over;
  return true;
};

// ---- a hull standing 0.45 m into the wall (the bunker's case: a parked hull, the overlap already there)
{
  const e = hull(wallX - halfLength + 0.45);
  const steps = [];
  for (let i = 0; i < 40; i++) {
    const before = e.state.pos.x;
    updateTank(e, flat, SIM_DT, collide);
    steps.push(before - e.state.pos.x);
  }
  const worst = Math.max(...steps);
  assert.ok(worst <= 0.115, `it leaves over several steps, never more than ~11 cm in one (worst ${worst.toFixed(3)} m)`);
  const over = e.state.pos.x + halfLength - wallX;
  assert.ok(over < 0.01, `and is out of the wall within 40 steps (${over.toFixed(3)} m left)`);
}

// ---- a hull driven into the wall at 8 m/s stops at its face at once: its own travel is never let into the wall
{
  const e = hull(wallX - halfLength - 0.5, 8, 1);
  let deepest = 0;
  for (let i = 0; i < 60; i++) {
    updateTank(e, flat, SIM_DT, collide);
    deepest = Math.max(deepest, e.state.pos.x + halfLength - wallX);
  }
  assert.ok(deepest < 0.02, `the wall stops the hull at its face (deepest ${deepest.toFixed(3)} m)`);
  assert.ok(Math.abs(e.state.speed) < 1, 'and its travel into it is spent');
}

console.log('obstacleDepenetration selftest: an overlap leaves gradually, travel into a wall is stopped at once — ok');
