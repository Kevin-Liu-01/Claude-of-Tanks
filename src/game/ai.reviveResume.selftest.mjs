// Round 2 (U18) of the 2026-11-02 audit M7: a revived bot's brain resumes from its new hull. A mode's revive (both drivers'
// revive hooks, which the mode controller calls) builds a new hull at the spawn and leaves the same controller driving
// it, and the controller was not stepped while its hull lay dead: what it measures from one tick to the next read the
// teleport from the wreck to the spawn as one tick of its own (a progress spike), and its legs, spot and mission route
// were the last life's. ai.ts resume() is the controller's hand-back entry point (Watch mode's Leave uses it too).
// Reproduced on 50197fdf43: neither revive hook called it, and on the first tick of the new life the bot's progress rate
// read hundreds of metres a second. Pins: [1] on the authority every revive hands the brain back with the battle's clock,
// and the first tick of the new life reads no progress spike (the solo battle's revive: ai.reviveResumeSolo).
// Round 3 (B17): the solo battle's half moved to its own file and the fleet narrowed to the roster (this receipt took
// 14 s of CPU, most of it the whole fleet's combat anatomy and the solo battle's import graph).
import { Vector3 } from 'three';
import { createMatchActor } from '../../server/match/matchActor.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { SIM_DT } from '../sim/movement.ts';

let failures = 0;
const ok = (cond, label) => { if (cond) console.log(`  ok  ${label}`); else { failures++; console.error(`FAIL  ${label}`); } };

/** Count the resumes a hull's brain hears, with the clock each one carries. */
function spyResume(entity) {
  const calls = [];
  const ctl = entity.aiCtl;
  const original = typeof ctl.resume === 'function' ? ctl.resume.bind(ctl) : null;
  ctl.resume = (timeS, firstShellId) => { calls.push(timeS); original?.(timeS, firstShellId); };
  return calls;
}

await ensureAuthorityFleet(['m1a1_abrams_hc', 't90am']);
const flat = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const inputs = new Map();

console.log('[1] the authority\'s revive hands the brain back');
{
  const actor = createMatchActor({ roomId: 'revive', mapId: 'verdant', mode: 'capture_the_flag', seed: 321, seats: [], world: flat(),
    bots: [
      { playerId: 'a1', name: 'A1', team: 'alpha', specId: 'm1a1_abrams_hc' },
      { playerId: 'a2', name: 'A2', team: 'alpha', specId: 't90am' },
      { playerId: 'b1', name: 'B1', team: 'bravo', specId: 't90am' },
      { playerId: 'b2', name: 'B2', team: 'bravo', specId: 'm1a1_abrams_hc' },
    ], countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {} });
  const match = actor.authority;
  match.onMatchReady();
  const step = () => match.step({ dt: SIM_DT, inputs });
  for (let i = 0; i < 60; i++) step();
  const entity = match.entityById.get('a2');
  const calls = spyResume(entity);
  // killed 150 m off its spawn: the brain drives one tick where the wreck will lie
  entity.state.pos.x += 150;
  entity.state.pos.z += 40;
  step();
  entity.combat.destroyed = true;
  entity.combat.hp = 0;
  const oldCombat = entity.combat;
  let ticks = 0;
  while (ticks++ < 1200 && (entity.combat === oldCombat || entity.combat.destroyed)) step();
  const revived = entity.combat !== oldCombat && !entity.combat.destroyed;
  const atRevive = match.timeS;
  step(); // the first tick of the new life
  const info = entity.aiCtl.debugInfo();
  ok(revived, `the mode revives the bot (${ticks} ticks)`);
  ok(calls.length === 1 && Math.abs(calls[0] - atRevive) < 1e-9,
    `the revive hands the brain back once, on the battle's clock (${calls.length} call(s)${calls.length ? ` at ${calls[0].toFixed(2)} s, revive at ${atRevive.toFixed(2)} s` : ''})`);
  ok(info.progressRate < 5, `no progress spike on the first tick of the new life (progressRate ${info.progressRate} m/s)`);
  actor.stop();
}

if (failures) { console.error(`ai.reviveResume.selftest: ${failures} failure(s)`); process.exit(1); }
console.log('ai.reviveResume.selftest: the authority\'s revive hands a bot\'s brain back through resume()');
