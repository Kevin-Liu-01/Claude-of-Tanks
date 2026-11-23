// turboSpinMigration.selftest.mjs — a host migration mid-turbo and mid-flip (turbo-spin-275). Copyright (c) 2026 Kevin B. Liu.
//
// Turbo Ball: one seat jumps and presses F in the air (a front flip, sim/movement.ts requestTankAirSpin), the other presses
// Turbo (sim/hullActions.ts requestHullTurbo: the leap, then a 3 s cooldown). The old host's keyframe goes through the
// migration codec onto a second actor on the same roster (resumeHullBody's handoff), and both hosts step on:
//   - the flip keeps turning on the new host and ends where the old host's ends, the hull back on its tracks;
//   - Turbo's cooldown runs on: a press half a second later is refused on both hosts, one after it ends is taken on both;
//   - the leap's speed and lift ride the row (the dasher's flight matches).
// Negative control: the same handoff with the extras' spin dropped leaves the new host's hull hanging mid-flip (the
// receipt fails without MigrationEntityExtras.airSpin).
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
import { AIR_SPIN_AXES } from '../../sim/movement.ts';

const MODE = 'turbo_ball';
const RULES = matchRulesetFor(MODE);
const seats = [
  { seat: 0, playerId: 'flipper', name: 'Flipper', team: 'alpha', specId: 'leclerc_s2' },
  { seat: 1, playerId: 'dasher', name: 'Dasher', team: 'bravo', specId: 'leclerc_s2' },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const world = () => ({ mapId: 'verdant', heightField: { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) }, getObstacles: () => [] });
const make = (resume) => createMatchActor({ roomId: 'turbo-spin', mapId: 'verdant', mode: MODE, seed: 52, seats, bots: [], ruleset: RULES,
  world: world(), countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {}, resume });
const control = () => ({ throttle: 0, steer: 0, fire: false, brake: false, aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0 });
const DT = 1 / 60;

/** Two hosts' inputs, stepped together; a press lasts one tick. */
function step(sim, inputs, ticks = 1) { for (let n = 0; n < ticks; n++) { sim.step({ dt: DT, inputs }); for (const c of inputs.values()) c.actionBits = 0; } }

function handoff({ dropSpin = false } = {}) {
  const old = make(null), sim = old.authority;
  const flip = control(), dash = control();
  const inputs = new Map([['flipper', flip], ['dasher', dash]]);
  sim.onMatchReady();
  step(sim, inputs, 90);
  const flipper = sim.entityById.get('flipper'), dasher = sim.entityById.get('dasher');
  assert.equal(flipper.modeAirSpin, true, 'setup: Turbo Ball stamps the air spin');
  assert.deepEqual(dasher.modeTurbo, RULES.turbo, 'setup: and Turbo');
  // the flipper jumps (F on the ground), flies a third of a second, then F again: the front flip (W held)
  flip.actionBits = PLAYER_ACTION_BITS.SELF_RIGHT; step(sim, inputs);
  assert.equal(flipper.state.grounded, false, 'setup: F on the ground jumps');
  step(sim, inputs, 20);
  const climb = flipper.state._ride.v;
  flip.throttle = 1; flip.actionBits = PLAYER_ACTION_BITS.SELF_RIGHT; step(sim, inputs);
  assert.equal(flipper.state._airSpinAxis, AIR_SPIN_AXES.FRONT_FLIP, 'setup: F in the air with W held is a front flip');
  assert.ok(flipper.state._ride.v < climb, 'F in the air no longer re-boosts the rocket');
  // the dasher leaps
  const before = dasher.state.speed;
  dash.actionBits = PLAYER_ACTION_BITS.TURBO; step(sim, inputs);
  assert.ok(dasher.state.speed > before + RULES.turbo.forwardMps * 0.8, `setup: Turbo adds its forward speed (${before.toFixed(1)} -> ${dasher.state.speed.toFixed(1)})`);
  assert.equal(dasher.state.grounded, false, 'setup: and leaves the ground');
  step(sim, inputs, 12);
  assert.ok(flipper.state._airSpinAxis !== 0 && flipper.state._airSpinLeft > 1, 'setup: the flip is mid-turn at the keyframe');
  const readyIn = dasher.turboReadyS - sim.timeS;
  assert.ok(readyIn > 2.5, 'setup: the cooldown runs at the keyframe');

  const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
  const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  const frame = { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [],
    entities: sim.entities.map((entity) => captureEntityRow(entity, old.wireIdOf(entity.id), era, tick)), shells: [], viewer: null, modeStateJson: null };
  const extras = captureEntityExtras(old);
  const flipperExtras = extras.find((entry) => entry.entityId === old.wireIdOf('flipper'));
  const dasherExtras = extras.find((entry) => entry.entityId === old.wireIdOf('dasher'));
  assert.ok(typeof flipperExtras.airSpin === 'number', 'the extras carry the flip');
  assert.ok(Math.abs(dasherExtras.turboReadyIn - readyIn) < 0.01, 'and the cooldown left');
  if (dropSpin) delete flipperExtras.airSpin;
  const sealed = decodeMigrationKeyframe(encodeMigrationKeyframe({ tick, battleTimeMs, timeS: sim.timeS, phase: 'playing',
    modeCheckpoint: sim.captureModeCheckpoint(), entities: extras, frame }));
  const fresh = make({ tick, battleTimeMs });
  applyResumeState(fresh, sealed);
  fresh.authority.onMatchReady();
  const next = fresh.authority;
  const freshInputs = new Map([['flipper', control()], ['dasher', control()]]);
  for (const [id, c] of inputs) Object.assign(freshInputs.get(id), c, { actionBits: 0 });
  return { sim, next, inputs, freshInputs };
}

// ---- the handoff with the extras whole
const { sim, next, inputs, freshInputs } = handoff();
const oldFlip = sim.entityById.get('flipper').state, newFlip = next.entityById.get('flipper').state;
assert.equal(newFlip._airSpinAxis, oldFlip._airSpinAxis, 'the new host turns the same flip');
assert.ok(Math.abs(newFlip._airSpinLeft - oldFlip._airSpinLeft) < 1e-6, 'with the turn it still owes');
const oldDash = sim.entityById.get('dasher'), newDash = next.entityById.get('dasher');
assert.ok(Math.abs((newDash.turboReadyS - next.timeS) - (oldDash.turboReadyS - sim.timeS)) < 0.02, 'Turbo\'s cooldown runs on');
let worstPitch = 0, worstY = 0, endedAt = null;
for (let n = 0; n < 240; n++) {
  step(sim, inputs); step(next, freshInputs);
  worstPitch = Math.max(worstPitch, Math.abs(Math.atan2(Math.sin(newFlip.visualPitch - oldFlip.visualPitch), Math.cos(newFlip.visualPitch - oldFlip.visualPitch))));
  worstY = Math.max(worstY, Math.abs(newDash.state.pos.y - oldDash.state.pos.y));
  if (endedAt === null && !newFlip._airSpinAxis) endedAt = n;
  if (n === 30) {
    // half a second on: the cooldown refuses Turbo on both hosts
    const speeds = [oldDash.state.speed, newDash.state.speed];
    inputs.get('dasher').actionBits = PLAYER_ACTION_BITS.TURBO; freshInputs.get('dasher').actionBits = PLAYER_ACTION_BITS.TURBO;
    step(sim, inputs); step(next, freshInputs);
    assert.ok(oldDash.state.speed <= speeds[0] + 0.5 && newDash.state.speed <= speeds[1] + 0.5, 'Turbo is refused on both hosts while it cools');
  }
}
assert.ok(endedAt !== null && endedAt < 60, `the flip finishes on the new host (${endedAt} ticks after the handoff)`);
assert.ok(worstPitch < 0.05, `the new host's flip follows the old host's (worst pitch apart ${worstPitch.toFixed(4)} rad)`);
assert.ok(worstY < 0.05, `the dasher's leap flies on alike (worst height apart ${worstY.toFixed(4)} m)`);
// the landing's rebound settles alike on both hosts
for (let n = 0; n < 120 && !(newFlip.grounded && oldFlip.grounded); n++) { step(sim, inputs); step(next, freshInputs); }
assert.equal(newFlip.grounded, true, 'the flipper is down again');
assert.equal(newFlip.overturned, false, 'on its tracks: a whole flip lands as it left');
// the cooldown over (3 s from the press): Turbo is taken on both hosts
for (let n = 0; n < 60; n++) { step(sim, inputs); step(next, freshInputs); }
assert.ok(oldDash.turboReadyS <= sim.timeS && newDash.turboReadyS <= next.timeS, 'the cooldown has run out on both hosts');
const speeds = [oldDash.state.speed, newDash.state.speed];
inputs.get('dasher').actionBits = PLAYER_ACTION_BITS.TURBO; freshInputs.get('dasher').actionBits = PLAYER_ACTION_BITS.TURBO;
step(sim, inputs); step(next, freshInputs);
assert.ok(oldDash.state.speed > speeds[0] + 5 && newDash.state.speed > speeds[1] + 5, 'Turbo is taken again on both hosts');

// ---- negative control: the extras without the flip
const dropped = handoff({ dropSpin: true });
const hung = dropped.next.entityById.get('flipper').state, ref = dropped.sim.entityById.get('flipper').state;
let apart = 0;
for (let n = 0; n < 40; n++) {
  step(dropped.sim, dropped.inputs); step(dropped.next, dropped.freshInputs);
  apart = Math.max(apart, Math.abs(Math.atan2(Math.sin(hung.visualPitch - ref.visualPitch), Math.cos(hung.visualPitch - ref.visualPitch))));
}
assert.ok(apart > 0.5, `negative control: without the carried spin the new host's hull falls out of the flip (${apart.toFixed(2)} rad apart)`);

console.log(`turboSpinMigration: a migration mid-flip finishes the flip on the new host (pitch within ${worstPitch.toFixed(4)} rad, done ${endedAt} ticks on, back on its tracks); mid-turbo the leap flies on (height within ${worstY.toFixed(4)} m) and the 3 s cooldown refuses then takes Turbo on both hosts; dropping the carried spin leaves the hull ${apart.toFixed(2)} rad off`);
