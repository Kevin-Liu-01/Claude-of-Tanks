// Proof (implicit state machine audit M3, 2026-11-02): one match phase, and a mode controller that hears the verdict.
// The authority's MatchPhase stopped at playing; the actor layered `ended`/`stopped` booleans on it and the full phase
// was rebuilt three ways (the actor's stats, the control API, the LAN host's status with an 'unknown' fallback). And
// when the authority decided the match (time limit, elimination) the mode controller never learned it: through the
// 8 s ending hold Zone Control went on scoring held zones and kills, respawns and waves went on, and the mode could
// later announce a winner of its own.
//   - the actor's phase runs playing → ending (the hold) → ended (the hold spent) → stopped, and the control API's
//     status reads it through the one status function (ending and ended are both 'ended' to the rooms);
//   - a Zone Control match decided by the clock keeps its score through the hold: no zone points, no kill points, and
//     the controller's result is the authority's.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from './matchActor.ts';
import { statusOf } from './control.ts';
import { ensureAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../src/sim/matchRuleset.ts';

const seats = [
  { seat: 0, playerId: 'pilot', name: 'Pilot', team: 'alpha', specId: 'm1a1_abrams_hc' },
  { seat: 1, playerId: 'enemy', name: 'Enemy', team: 'bravo', specId: 'm1a1_abrams_hc' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const TICK_MS = 1000 / 60;

// ---- the phase: one reading, from the authority's phases through the hold to the stop
{
  let nowMs = 0;
  const actor = createMatchActor({ roomId: 'phase', mapId: 'verdant', seed: 5, seats, bots: [], world: world(), countdownS: 0, battleLimitS: 1, now: () => nowMs, schedule: () => () => {} });
  const advance = (ticks) => { for (let n = 0; n < ticks; n++) { nowMs += TICK_MS; actor.advance(nowMs); } };
  const seen = [];
  const note = () => {
    const phase = actor.phase, status = statusOf('phase', actor, 'm1')?.phase;
    if (seen.at(-1)?.phase !== phase) seen.push({ phase, status, stats: actor.stats().phase });
  };
  for (let n = 0; n < 60 * 14 && !actor.stopped; n++) { advance(1); note(); }
  note();
  assert.deepEqual(seen.map((entry) => entry.phase), ['playing', 'ending', 'ended', 'stopped'], `the actor's phase (${JSON.stringify(seen)})`);
  for (const entry of seen) {
    const expected = entry.phase === 'ending' ? 'ended' : entry.phase;
    assert.equal(entry.status, expected, `the control API reads ${entry.phase} as ${expected}`);
    assert.equal(entry.stats, expected, `the actor's stats read ${entry.phase} as ${expected}`);
  }
}

// ---- Zone Control decided by the clock: the controller freezes with the authority's verdict
{
  const actor = createMatchActor({ roomId: 'zone-hold', mapId: 'verdant', mode: 'zone_control', seed: 3, seats, bots: [], ruleset: matchRulesetFor('zone_control'), world: world(), countdownS: 0, battleLimitS: 10, autoStart: false, now: () => 0, schedule: () => () => {} });
  const sim = actor.authority;
  sim.onMatchReady();
  const pilot = sim.entityById.get('pilot'), enemy = sim.entityById.get('enemy');
  const zone = sim.modeController.state.zones[0];
  const inputs = new Map();
  for (let n = 0; n < 60 * 11 && !sim.result; n++) { pilot.state.pos.set(zone.x, zone.y, zone.z); sim.step({ dt: 1 / 60, inputs }); }
  assert.equal(sim.resultReason, 'time_limit', 'setup: the clock decided the match');
  assert.equal(zone.owner, 'alpha', 'setup: the pilot holds the zone');
  const atVerdict = { ...sim.modeController.state.score };
  assert.ok(atVerdict.alpha > 0, `setup: the zone scored before the verdict (${JSON.stringify(atVerdict)})`);
  for (let n = 0; n < 60 * 5; n++) { pilot.state.pos.set(zone.x, zone.y, zone.z); sim.step({ dt: 1 / 60, inputs }); }
  enemy.combat.destroyed = true;
  sim.modeController.recordDestruction(enemy.id, pilot.id);
  assert.deepEqual(sim.modeController.state.score, atVerdict, `the score stands through the hold (verdict ${JSON.stringify(atVerdict)}, after ${JSON.stringify(sim.modeController.state.score)})`);
  assert.deepEqual(sim.modeController.step(1 / 60, sim.timeS), { result: sim.result, reason: sim.resultReason }, 'the controller\'s result is the authority\'s verdict');
  actor.stop();
}
console.log('matchPhase: one phase from playing through the ending hold to the stop, read once by every status; a clock verdict freezes the mode controller');
