// Proof (implicit state machine audit, round 2 U2 bullet 3, review round 1, 2026-11-04): a migrated host resumes the mode
// as the seat's newest frame shows it, not as the keyframe sealed it. The resume overlays the newest frame's hulls on the
// keyframe (migrationState.ts resumeStateFromRetained), and kept that frame's mode state (modeStateJson) without reading
// it: the mode checkpoint stayed the keyframe's, so whatever the mode did between the two came back undone. Each case
// seals a keyframe, plays an objective forward, takes the pilot's newest frame, and resumes a second actor from both:
//   - Turbo Ball: a goal in the gap (the score, the ball back on the spot), then the ball rolling off it;
//   - Zone Control: the pilot takes the first zone in the gap (its owner, its meter, the running score);
//   - Capture the Flag: the pilot takes the enemy flag in the gap (carried, and by whom).
// The new host's score, zones, flags and ball must be the newest frame's. Built as objectiveModesMigration's handoff.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe, resumeStateFromRetained } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';

const seats = [
  { seat: 0, playerId: 'pilot', name: 'Pilot', team: 'alpha', specId: 'm1a1_abrams_hc' },
  { seat: 1, playerId: 'enemy', name: 'Enemy', team: 'bravo', specId: 'm1a1_abrams_hc' },
  { seat: 2, playerId: 'friend', name: 'Friend', team: 'alpha', specId: 'm1a1_abrams_hc' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const round1 = (value) => Math.round(value * 10) / 10;
const objective = (controller) => {
  const state = controller.state;
  return {
    score: { alpha: Math.round(state.score.alpha), bravo: Math.round(state.score.bravo) },
    zones: state.zones.map((zone) => ({ id: zone.id, owner: zone.owner, contested: zone.contested, control: round1(zone.control) })),
    flags: state.flags.map((flag) => ({ team: flag.team, status: flag.status, carrierId: flag.carrierId })),
    ball: state.ball ? { x: round1(state.ball.x), z: round1(state.ball.z), vx: round1(state.ball.vx), lastTouchId: state.ball.lastTouchId } : null,
  };
};
/** The frame a viewer holds at the authority's current tick: its rows, meta and mode state, as matchActor.ts builds it. */
const frameOf = (actor, viewerId) => {
  const sim = actor.authority;
  const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
  const snapshot = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId, ackInputSeq: null });
  return {
    tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snapshot.meta, battleTimeMs }, false), destroyed: [],
    entities: sim.entities.map((entity) => captureEntityRow(entity, actor.wireIdOf(entity.id), era, tick)), shells: [], viewer: null,
    modeStateJson: snapshot.meta.modeState ? JSON.stringify(snapshot.meta.modeState) : null,
  };
};

const lost = [];
for (const mode of ['turbo_ball', 'zone_control', 'capture_the_flag']) {
  const make = (resume) => createMatchActor({ roomId: 'mode-frame', mapId: 'verdant', mode, seed: 33, seats, bots: [], ruleset: matchRulesetFor(mode), world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
  const first = make(null), sim = first.authority;
  sim.onMatchReady();
  const pilot = sim.entityById.get('pilot');
  const inputs = new Map([['pilot', { throttle: 0, steer: 0, fire: false, brake: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 }]]);
  const step = (ticks) => { for (let n = 0; n < ticks; n++) sim.step({ dt: 1 / 60, inputs }); };
  const live = sim.modeController.state;
  step(30);
  // the keyframe, as matchHostCore.ts buildKeyframe seals it
  const sealedFrame = frameOf(first, 'migration');
  const keyframe = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick: sealedFrame.tick, battleTimeMs: sealedFrame.serverTimeMs, phase: 'playing', modeCheckpoint: sim.captureModeCheckpoint(), entities: captureEntityExtras(first), frame: sealedFrame }));
  const atKeyframe = objective(sim.modeController);
  // the gap: the objective moves on the old host after its last keyframe
  if (mode === 'turbo_ball') {
    const goal = live.goals.find((entry) => entry.team === 'bravo');
    live.ball.lastTouchId = pilot.id;
    live.ball.x = goal.x; live.ball.z = goal.z; step(2);
    assert.equal(Math.round(live.score.alpha), atKeyframe.score.alpha + 1, 'setup: a goal in the gap');
    live.ball.vx = 6; step(20);
  }
  if (mode === 'zone_control') {
    const zone = live.zones[0];
    pilot.state.pos.set(zone.x, zone.y, zone.z);
    step(600);
    assert.equal(live.zones[0].owner, 'alpha', 'setup: the pilot took the zone in the gap');
  }
  if (mode === 'capture_the_flag') {
    const theirs = live.flags.find((flag) => flag.team === 'bravo');
    pilot.state.pos.set(theirs.x, 0, theirs.z); step(2);
    assert.equal(theirs.status, 'carried', 'setup: the pilot took the enemy flag in the gap');
    step(10);
  }
  const newest = frameOf(first, 'pilot');
  const atFrame = objective(sim.modeController);
  assert.notDeepEqual(atFrame, atKeyframe, `setup: ${mode} moved between the keyframe and the newest frame`);

  const { state } = resumeStateFromRetained(keyframe, 0, newest, 0, [], [], []);
  assert.equal(state.frame.tick, newest.tick, 'setup: the resume overlays the newest frame');
  const second = make({ tick: newest.tick, battleTimeMs: newest.serverTimeMs });
  applyResumeState(second, state);
  const resumed = objective(second.authority.modeController);
  for (const key of ['score', 'zones', 'flags', 'ball']) {
    if (JSON.stringify(resumed[key]) !== JSON.stringify(atFrame[key])) lost.push(`${mode} ${key}: newest frame ${JSON.stringify(atFrame[key])}, new host ${JSON.stringify(resumed[key])} (keyframe ${JSON.stringify(atKeyframe[key])})`);
  }
  first.stop(); second.stop();
}
if (lost.length) {
  console.error(`modeFrameReconcile: ${lost.length} mode readings rewound to the keyframe:\n  ${lost.join('\n  ')}`);
  assert.fail('a migrated host must resume the mode as the newest frame shows it');
}
console.log('modeFrameReconcile: a migrated host resumes the score, zones, flags and ball as the seat\'s newest frame shows them (a Turbo Ball goal and the ball\'s roll, a Zone Control capture, a flag taken in the gap)');
