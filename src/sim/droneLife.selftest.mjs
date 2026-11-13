// droneLife.selftest — the drone's flight across a carrier's revive and a host's restore (audit M4, 2026-11-02).
// Both authorities' revive hooks call initializeAerial, which replaced the flight; an airframe in flight then (a Turbo
// Ball goal revives every hull, living ones too) stayed in the shells list with no flight to steer, count strikes or end
// it, until the shell's own lifetime ran out. The revive now retires it, as a destroyed carrier's is. And restoreAerial
// copied the saved airframe's velocity, then zeroed it (the launch line's copy), so a migrated host's drone stalled and
// spooled back up from rest.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { initializeAerial, stepAerial, captureAerial, restoreAerial } from './aerialCombat.ts';
import { AERIAL_RULES, matchRulesetFor } from './matchRuleset.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { stepShell } from './ballistics.ts';
import { getSpec } from '../vehicles/specs.ts';

const DT = 1 / 60, DRONE = PLAYER_ACTION_BITS.DRONE, rules = matchRulesetFor('drone');
const pilot = () => ({ id: 'pilot', team: 'alpha', spec: getSpec('m1a1_abrams_hc'), bot: false, isPlayer: true,
  state: { pos: new Vector3(4, 0, -6), yaw: .3, turretYaw: -.4, speed: 0 }, combat: { destroyed: false },
  input: { throttle: 1, steer: 0, brake: false, fire: false, aimPoint: new Vector3(140, 22, 400), auxiliaryBits: 0 } });
function session(entity = pilot()) {
  initializeAerial(entity, rules);
  const shells = []; let id = 1, tick = 0;
  return {
    entity, shells, get tick() { return tick; },
    step(press = false) {
      tick++;
      if (press) entity.input.auxiliaryBits |= DRONE;
      stepAerial(entity, tick * DT, DT, () => id++, (shell) => shells.push(shell));
      for (const shell of shells) if (!shell.dead) stepShell(shell, DT);
    },
  };
}

// ---- a living carrier revived with its airframe in flight: the airframe is retired with the old flight
{
  const s = session();
  s.step(true);
  for (let i = 0; i < 90; i++) s.step();
  const flying = s.shells[0];
  assert.ok(flying && !flying.dead && s.entity.aerial.active, 'the airframe is in flight');
  initializeAerial(s.entity, rules); // the revive hooks' call (sim/authoritativeMatch.ts reviveForMode, game/state.ts revive)
  assert.equal(flying.dead, true, 'the revive retires the airframe its old flight flew');
  assert.equal(s.entity.aerial.active, false, 'the new life starts docked');
  s.step(true);
  assert.equal(s.shells.length, 2, 'and launches its own');
  assert.equal(s.shells[1].dead, false);
}

// ---- a restored airframe keeps the velocity it was saved with
{
  const a = session();
  a.step(true);
  for (let i = 0; i < Math.ceil((AERIAL_RULES.drone.launchS + 1) / DT); i++) a.step();
  const saved = captureAerial(a.entity);
  assert.ok(saved.shell && Math.hypot(...saved.shell.velocity) > 5, 'saved in free flight, moving');
  const b = session();
  const restored = [];
  restoreAerial(b.entity, saved, () => 77, (shell) => restored.push(shell));
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].vel.toArray(), saved.shell.velocity, 'the restored airframe flies on at its saved velocity');
  assert.deepEqual(restored[0].pos.toArray(), saved.shell.pos);
}

console.log('droneLife: a revive retires the airframe in flight; a restore keeps its velocity');
