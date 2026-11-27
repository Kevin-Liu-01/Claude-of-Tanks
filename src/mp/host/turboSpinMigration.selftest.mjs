// turboSpinMigration.selftest.mjs — a host migration mid-turbo and mid-boost (turbo-spin-275; thrust-boosts-279). Copyright
// (c) 2026 Kevin B. Liu.
//
// Turbo Ball: one seat jumps and boosts three times in the air (the belly, then A, then D: sim/movement.ts
// requestTankBoost), the keyframe mid-way through the third burn; the other presses Turbo (sim/hullActions.ts
// requestHullTurbo: the leap, then a 3 s cooldown). The old host's keyframe goes through the migration codec onto a second
// actor on the same roster (resumeHullBody's handoff), and both hosts step on:
//   - the boosted flight carries (the hull exact's checkpoint, MigrationEntityExtras.hull: version 12's boost value, the
//     spring's rates and drift, and the boosts spent in its flags): the third burn finishes on the new host and the hull
//     flies, rolls and drifts as on the old one;
//   - three of the flight's five boosts spent: two more presses are taken on both hosts, the next refused on both (Main's
//     receipt: mid-flight with 3 used, after migration 2 remain);
//   - Turbo's cooldown runs on: a press half a second later is refused on both hosts, one after it ends is taken on both;
//     the leap's speed and lift ride the row (the dasher's flight matches).
// Negative controls, each sealed from the old hull with one part cleared for the capture alone (the rows are sealed first,
// the old host steps on untouched), so it holds whichever field carries the part: a keyframe without the boost leaves the
// new host's hull without its burn (apart in its path); without the boost's motion its roll and drift part; without the
// boosts spent the new host takes a press the old one refuses.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import { applyResumeState, captureEntityExtras, decodeMigrationKeyframe, encodeMigrationKeyframe } from './migrationState.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { matchRulesetFor } from '../../sim/matchRuleset.ts';
import { PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
import { BOOST_NOZZLES } from '../../sim/hullFlight.ts';

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
/** F for the flipper with a drive, on one host. */
function boost(sim, inputs, steer = 0) {
  const c = inputs.get('flipper');
  c.throttle = 0; c.steer = steer; c.actionBits = PLAYER_ACTION_BITS.SELF_RIGHT;
  step(sim, inputs);
  c.steer = 0;
}

function handoff({ dropBoost = false, dropMotion = false, dropUsed = false } = {}) {
  const old = make(null), sim = old.authority;
  const flip = control(), dash = control();
  const inputs = new Map([['flipper', flip], ['dasher', dash]]);
  sim.onMatchReady();
  step(sim, inputs, 90);
  const flipper = sim.entityById.get('flipper'), dasher = sim.entityById.get('dasher');
  assert.deepEqual(flipper.modeAirSpin, RULES.airSpin, 'setup: Turbo Ball stamps the boosts');
  assert.deepEqual(dasher.modeTurbo, RULES.turbo, 'setup: and Turbo');
  // the flipper jumps (F on the ground), then boosts: the belly, A, D
  flip.actionBits = PLAYER_ACTION_BITS.SELF_RIGHT; step(sim, inputs);
  assert.equal(flipper.state.grounded, false, 'setup: F on the ground jumps');
  step(sim, inputs, 20);
  boost(sim, inputs, 0);
  assert.equal(flipper.state._boostNozzle, BOOST_NOZZLES.UP, 'setup: F in the air with no drive fires the belly');
  step(sim, inputs, 23);
  boost(sim, inputs, 1);
  assert.equal(flipper.state._boostNozzle, BOOST_NOZZLES.LEFT, 'setup: with A held the right side pushes it left');
  // the dasher leaps
  const before = dasher.state.speed;
  dash.actionBits = PLAYER_ACTION_BITS.TURBO; step(sim, inputs);
  assert.ok(dasher.state.speed > before + RULES.turbo.forwardMps * 0.8, `setup: Turbo adds its forward speed (${before.toFixed(1)} -> ${dasher.state.speed.toFixed(1)})`);
  assert.equal(dasher.state.grounded, false, 'setup: and leaves the ground');
  step(sim, inputs, 22);
  boost(sim, inputs, -1);
  step(sim, inputs, 4);
  assert.ok(flipper.state._boostNozzle === BOOST_NOZZLES.RIGHT && flipper.state._boostBurnS > 0 && flipper.state._boostsUsed === 3,
    'setup: the keyframe is mid-way through the third burn, three boosts spent');
  assert.ok(Math.abs(flipper.state._spring.rollV) > 0.5 && Math.abs(flipper.state._spring.recoilVX) + Math.abs(flipper.state._spring.recoilVZ) > 1,
    'setup: the hull rolls and drifts');
  const readyIn = dasher.turboReadyS - sim.timeS;
  assert.ok(readyIn > 2.5, 'setup: the cooldown runs at the keyframe');

  const tick = Math.round(sim.timeS * 60), battleTimeMs = Math.round(sim.timeS * 1000), era = createEraIndexer();
  const snap = sim.snapshot({ tick, serverTimeMs: battleTimeMs, viewerId: 'migration', ackInputSeq: null });
  const frame = { tick, serverTimeMs: battleTimeMs, ackedInputTick: 0xffffffff, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 127,
    meta: captureMeta({ ...snap.meta, battleTimeMs }, false), destroyed: [],
    entities: sim.entities.map((entity) => captureEntityRow(entity, old.wireIdOf(entity.id), era, tick)), shells: [], viewer: null, modeStateJson: null };
  // a negative control's keyframe: one part of the boosted flight cleared for the capture alone
  const flying = flipper.state, spring = flying._spring;
  const held = { nozzle: flying._boostNozzle, burnS: flying._boostBurnS, used: flying._boostsUsed,
    pitchV: spring.pitchV, rollV: spring.rollV, recoilVX: spring.recoilVX, recoilVZ: spring.recoilVZ };
  if (dropBoost) { flying._boostNozzle = 0; flying._boostBurnS = 0; }
  if (dropMotion) { spring.pitchV = 0; spring.rollV = 0; spring.recoilVX = 0; spring.recoilVZ = 0; }
  if (dropUsed) flying._boostsUsed = 0;
  const extras = captureEntityExtras(old);
  flying._boostNozzle = held.nozzle; flying._boostBurnS = held.burnS; flying._boostsUsed = held.used;
  spring.pitchV = held.pitchV; spring.rollV = held.rollV; spring.recoilVX = held.recoilVX; spring.recoilVZ = held.recoilVZ;
  const flipperExtras = extras.find((entry) => entry.entityId === old.wireIdOf('flipper'));
  const dasherExtras = extras.find((entry) => entry.entityId === old.wireIdOf('dasher'));
  assert.ok(typeof flipperExtras.hull === 'string', 'the hull exact carries the boosted flight, its spin and drift and the boosts spent (276)');
  for (const gone of ['boost', 'boostMotion', 'boostsUsed', 'airSpin', 'airSpinRate', 'flipUsed']) {
    assert.ok(!(gone in flipperExtras), `no extras field of its own (${gone}): the hull exact is the one carrier`);
  }
  assert.ok(Math.abs(dasherExtras.turboReadyIn - readyIn) < 0.01, 'the extras carry Turbo\'s cooldown left');
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
/** The flipper's path apart on the two hosts over `ticks` (worst roll in rad, worst position in m). */
function follow(h, ticks) {
  const a = h.sim.entityById.get('flipper').state, b = h.next.entityById.get('flipper').state;
  let roll = 0, pos = 0;
  for (let n = 0; n < ticks; n++) {
    step(h.sim, h.inputs); step(h.next, h.freshInputs);
    roll = Math.max(roll, Math.abs(Math.atan2(Math.sin(a.visualRoll - b.visualRoll), Math.cos(a.visualRoll - b.visualRoll))));
    pos = Math.max(pos, Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z));
  }
  return { roll, pos };
}
/** Presses F (no drive) for the flipper on both hosts every 24 ticks, `count` times: how many each host took. */
function pressMore(h, count) {
  const a = h.sim.entityById.get('flipper'), b = h.next.entityById.get('flipper');
  const taken = [0, 0];
  for (let k = 0; k < count; k++) {
    assert.ok(!a.state.grounded && !b.state.grounded, `setup: press ${k + 1} in flight on both hosts`);
    const before = [a.state._boostsUsed, b.state._boostsUsed];
    boost(h.sim, h.inputs); boost(h.next, h.freshInputs);
    if (a.state._boostsUsed > before[0]) taken[0]++;
    if (b.state._boostsUsed > before[1]) taken[1]++;
    step(h.sim, h.inputs, 23); step(h.next, h.freshInputs, 23);
  }
  return taken;
}

// ---- the handoff with the extras whole
const whole = handoff();
const { sim, next, inputs, freshInputs } = whole;
const oldFlip = sim.entityById.get('flipper').state, newFlip = next.entityById.get('flipper').state;
assert.equal(newFlip._boostNozzle, oldFlip._boostNozzle, 'the new host burns the same nozzle');
assert.ok(Math.abs(newFlip._boostBurnS - oldFlip._boostBurnS) < 1e-6, 'with the burn it has left');
assert.equal(newFlip._boostsUsed, 3, 'and three boosts spent');
const oldDash = sim.entityById.get('dasher'), newDash = next.entityById.get('dasher');
assert.ok(Math.abs((newDash.turboReadyS - next.timeS) - (oldDash.turboReadyS - sim.timeS)) < 0.02, 'Turbo\'s cooldown runs on');
const oldFlipper = sim.entityById.get('flipper'), newFlipper = next.entityById.get('flipper');
assert.ok(Math.abs((newFlipper.airSpinReadyS - next.timeS) - (oldFlipper.airSpinReadyS - sim.timeS)) < 0.02, 'the gap between boosts runs on');
const path = follow(whole, 30);
assert.ok(path.roll < 0.05 && path.pos < 0.05, `the new host's boosted flight follows the old host's (roll within ${path.roll.toFixed(4)} rad, path within ${path.pos.toFixed(4)} m)`);
// half a second on: the cooldown refuses Turbo on both hosts
{
  const speeds = [oldDash.state.speed, newDash.state.speed];
  inputs.get('dasher').actionBits = PLAYER_ACTION_BITS.TURBO; freshInputs.get('dasher').actionBits = PLAYER_ACTION_BITS.TURBO;
  step(sim, inputs); step(next, freshInputs);
  assert.ok(oldDash.state.speed <= speeds[0] + 0.5 && newDash.state.speed <= speeds[1] + 0.5, 'Turbo is refused on both hosts while it cools');
}
const taken = pressMore(whole, 3);
assert.deepEqual(taken, [2, 2], 'two boosts remain on both hosts: two presses taken, the third refused');
let worstY = 0;
for (let n = 0; n < 120; n++) { step(sim, inputs); step(next, freshInputs); worstY = Math.max(worstY, Math.abs(newDash.state.pos.y - oldDash.state.pos.y)); }
assert.ok(worstY < 0.05, `the dasher flies on alike (worst height apart ${worstY.toFixed(4)} m)`);
// the cooldown over (3 s from the press): Turbo is taken on both hosts
for (let n = 0; n < 60 && !(oldDash.turboReadyS <= sim.timeS && newDash.turboReadyS <= next.timeS); n++) { step(sim, inputs); step(next, freshInputs); }
assert.ok(oldDash.turboReadyS <= sim.timeS && newDash.turboReadyS <= next.timeS, 'the cooldown has run out on both hosts');
for (let n = 0; n < 240 && !(oldDash.state.grounded && newDash.state.grounded); n++) { step(sim, inputs); step(next, freshInputs); }
step(sim, inputs, 30); step(next, freshInputs, 30);
const speeds = [oldDash.state.speed, newDash.state.speed];
inputs.get('dasher').actionBits = PLAYER_ACTION_BITS.TURBO; freshInputs.get('dasher').actionBits = PLAYER_ACTION_BITS.TURBO;
step(sim, inputs); step(next, freshInputs);
assert.ok(oldDash.state.speed > speeds[0] + 5 && newDash.state.speed > speeds[1] + 5, 'Turbo is taken again on both hosts');

// ---- negative controls
const noBoost = follow(handoff({ dropBoost: true }), 30);
assert.ok(noBoost.pos > 0.3, `negative control: without the carried boost the new host's hull leaves the old one's path (${noBoost.pos.toFixed(2)} m apart)`);
const noMotion = follow(handoff({ dropMotion: true }), 30);
assert.ok(noMotion.roll > 0.3 && noMotion.pos > 0.3, `negative control: without the carried motion its roll and drift part (${noMotion.roll.toFixed(2)} rad, ${noMotion.pos.toFixed(2)} m)`);
const noUsed = handoff({ dropUsed: true });
step(noUsed.sim, noUsed.inputs, 30); step(noUsed.next, noUsed.freshInputs, 30);
assert.deepEqual(pressMore(noUsed, 3), [2, 3], 'negative control: without the carried boosts spent the new host takes a press the old one refuses');

console.log(`turboSpinMigration: a migration mid-boost with three spent carries the burn, spin and drift (roll within ${path.roll.toFixed(4)} rad, path within ${path.pos.toFixed(4)} m) and leaves two boosts on both hosts (two taken, the third refused); mid-turbo the leap flies on (height within ${worstY.toFixed(4)} m) and the 3 s cooldown refuses then takes Turbo on both hosts; dropping the boost parts the path by ${noBoost.pos.toFixed(2)} m, the motion by ${noMotion.roll.toFixed(2)} rad, and the count lets a press through`);
