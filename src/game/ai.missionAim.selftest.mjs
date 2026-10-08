// A mission's own aim (modes lane 2026-10-08, Turbo Ball's striker on the ball): the bot lays its gun on the objective's
// aim point and fires only when the mission says fire, the gun is laid and loaded and a shell's sight to the point holds
// (light cover a shell passes counts as clear; a solid does not). No enemy needed: the striker's target is the ball.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState, updateTank, SIM_DT } from '../sim/movement.ts';
import { createAI, mulberry32 } from './ai.ts';

const flat = { getHeightAt: () => 0, getGroundType: () => 'firm' };
const ball = { x: 0, y: 2.2, z: 40, radiusM: 2.2 };

function run(name, { fire = true, raycast = () => null, seconds = 12 } = {}) {
  const spec = getSpec('t90m');
  const state = createTankState(spec, new Vector3(0, 0, 0), 0.6); // hull and turret 34 degrees off the ball
  const striker = {
    id: 'striker', specId: 't90m', spec, state,
    combat: { destroyed: false, reload: { t: 0, totalS: spec.gun.reloadS }, shellSlot: 0 },
    input: { throttle: 0, steer: 0, brake: false, fire: false, aimPoint: new Vector3(), shellSlot: 0 },
  };
  const ai = createAI(striker, {
    difficulty: 'normal', rng: mulberry32(7),
    deps: {
      heightField: flat, raycast, getEnemies: () => [], getObstacles: () => [], spotting: { isSpotted: () => true },
      getObjective: () => ({ mission: 'striker', x: ball.x, z: ball.z + 18, radiusM: 15, aim: { ...ball, fire } }),
    },
  });
  let t = 180, firedAt = -1;
  for (let i = 0; i < seconds / SIM_DT; i++) {
    t += SIM_DT;
    ai.update(SIM_DT, t);
    striker.input.throttle = 0; striker.input.steer = 0; striker.input.brake = false; // hold the hull still: gunnery only
    updateTank(striker, flat, SIM_DT);
    if (striker.input.fire) { firedAt = t - 180; break; }
  }
  const aim = striker.input.aimPoint;
  console.log(`${name}: fired ${firedAt >= 0 ? `${firedAt.toFixed(1)} s` : 'never'}, aim (${aim.x.toFixed(1)}, ${aim.y.toFixed(1)}, ${aim.z.toFixed(1)})`);
  return { firedAt, aim };
}

const shot = run('lined up');
assert.ok(shot.firedAt >= 0, 'a striker cleared to fire shoots the ball once its gun is laid');
assert.ok(Math.hypot(shot.aim.x - ball.x, shot.aim.z - ball.z) < 1, 'the gun is laid on the ball, not on a scan point');
assert.equal(run('holding', { fire: false }).firedAt, -1, 'laid but not cleared: it holds its fire');
// a solid 20 m out on the line (a wall: not crushable) blocks the shot; a fence a shell passes does not
const hitAt20 = (record) => (origin, direction, max) => (max > 20 ? { dist: 20, record } : null);
assert.equal(run('behind a wall', { raycast: hitAt20({ min: [0, 0, 0], max: [1, 3, 1], kind: 'wallbrick' }) }).firedAt, -1,
  'no shot into a solid between the gun and the ball');
assert.ok(run('through a fence', { raycast: hitAt20({ min: [0, 0, 0], max: [1, 1.4, 1], kind: 'fenceplank', crushable: true }) }).firedAt >= 0,
  'light cover a shell passes leaves the shot clear');
console.log('ai.missionAim.selftest: a mission aim lays the gun, fires only when cleared and in a shell\'s sight');
