// Proof (implicit state machine audit M1, 2026-11-02): the objective modes' match state across a serialized host
// handoff, built the way sixModesMigration builds it. captureModeCheckpoint (sim/authoritativeMatch.ts) returns a
// checkpoint only for juggernaut, infected, realistic, gun_game, drone, ac130 and the wave modes, and the controller's
// checkpoint (sim/matchModes.ts captureCheckpoint) carries no flag, zone or ball state outside Frontline Assault. A
// Zone Control, Mars, Capture the Flag or Turbo Ball match in progress is played to a score and a live objective here,
// handed to a new host, and compared: scores, zones, flags and the ball must be what the old host left.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { captureEntityExtras, encodeMigrationKeyframe, decodeMigrationKeyframe, applyResumeState } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';

const seats = [
  { seat: 0, playerId: 'pilot', name: 'Pilot', team: 'alpha', specId: 'm1a1_abrams_hc' },
  { seat: 1, playerId: 'enemy', name: 'Enemy', team: 'bravo', specId: 'm1a1_abrams_hc' },
  { seat: 2, playerId: 'friend', name: 'Friend', team: 'alpha', specId: 'm1a1_abrams_hc' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const round2 = (value) => Math.round(value * 100) / 100;
const objective = (controller) => {
  const state = controller.state;
  return {
    score: { ...state.score },
    zones: state.zones.map((zone) => ({ id: zone.id, owner: zone.owner, control: round2(zone.control) })),
    flags: state.flags.map((flag) => ({ team: flag.team, status: flag.status, carrierId: flag.carrierId })),
    ball: state.ball ? { x: round2(state.ball.x), z: round2(state.ball.z) } : null,
  };
};

const lost = [];
for (const mode of ['zone_control', 'mars', 'capture_the_flag', 'turbo_ball']) {
  const make = (resume) => createMatchActor({ roomId: 'objective-migration', mapId: 'verdant', mode, seed: 33, seats, bots: [], ruleset: matchRulesetFor(mode), world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const first = make(null), sim = first.authority;
  sim.onMatchReady();
  const pilot = sim.entityById.get('pilot'), enemy = sim.entityById.get('enemy');
  const inputs = new Map([['pilot', { throttle: 0, steer: 0, fire: false, brake: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 }]]);
  const step = (ticks) => { for (let n = 0; n < ticks; n++) sim.step({ dt: 1 / 60, inputs }); };
  const live = sim.modeController.state;
  if (mode === 'zone_control' || mode === 'mars') {
    // a kill scores, then the pilot holds the first zone long enough to take it
    enemy.combat.destroyed = true;
    sim.modeController.recordDestruction(enemy.id, pilot.id);
    const zone = live.zones[0];
    pilot.state.pos.set(zone.x, zone.y, zone.z);
    step(600);
  }
  if (mode === 'capture_the_flag') {
    // take the enemy flag, carry it home for a capture, then take it again: one point and a flag in flight
    const own = live.flags.find((flag) => flag.team === 'alpha'), theirs = live.flags.find((flag) => flag.team === 'bravo');
    pilot.state.pos.set(theirs.x, 0, theirs.z); step(2);
    pilot.state.pos.set(own.baseX, 0, own.baseZ); step(2);
    pilot.state.pos.set(theirs.x, 0, theirs.z); step(2);
    assert.equal(theirs.status, 'carried', 'setup: the enemy flag is in flight');
  }
  if (mode === 'turbo_ball') {
    // the pilot's touch rolls the ball into the enemy goal, then the ball is back in play off the kick-off spot
    const goal = live.goals.find((entry) => entry.team === 'bravo');
    live.ball.lastTouchId = pilot.id;
    live.ball.x = goal.x; live.ball.z = goal.z; step(2);
    live.ball.x += 40; step(1);
  }
  const before = objective(sim.modeController);
  assert.ok(before.score.alpha > 0, `setup: ${mode} has a point on the board (${JSON.stringify(before.score)})`);

  const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
  const snapshot = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  const keyframe = { tick, battleTimeMs, phase: 'playing', modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(first), frame: { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127, meta: captureMeta({ ...snapshot.meta, battleTimeMs }, false), destroyed: [], entities: sim.entities.map((entity) => captureEntityRow(entity, first.wireIdOf(entity.id), era, tick)), shells: [], viewer: null, modeStateJson: null } };
  const saved = decodeMigrationKeyframe(encodeMigrationKeyframe(keyframe));
  const second = make({ tick, battleTimeMs });
  applyResumeState(second, saved);
  const after = objective(second.authority.modeController);
  for (const key of ['score', 'zones', 'flags', 'ball']) {
    if (JSON.stringify(after[key]) !== JSON.stringify(before[key])) lost.push(`${mode} ${key}: old host ${JSON.stringify(before[key])}, new host ${JSON.stringify(after[key])}`);
  }
  first.stop(); second.stop();
}

if (lost.length) {
  console.error(`objectiveModesMigration: ${lost.length} pieces of match state lost across the host handoff:\n  ${lost.join('\n  ')}`);
  assert.fail('objective-mode match state must survive a host migration');
}
console.log('objectiveModesMigration: Zone Control, Mars, Capture the Flag and Turbo Ball scores, zones, flags and ball survive a serialized host handoff');
