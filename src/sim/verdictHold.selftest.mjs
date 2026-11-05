// verdictHold.selftest — through the ending hold the verdict stops the mode's rules, not the bodies already moving
// (round 2 U4, 2026-11-04). The mode controller hears a verdict it did not reach (matchEnded, audit M3) and takes it as
// its own result; step() then returned at its first line, so an AC-130 supply crate released just before the verdict
// hung in mid-air for the whole 8 s hold and the Turbo Ball stopped where it flew, in solo and on the authority (both
// drivers keep stepping the controller through the hold). Now the crate lands and the ball comes down, and nothing is
// collected, touched or scored.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';

const tank = (id, team, x, z, bot = true) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20] }, input: { aimPoint: { x: 0, y: 0, z: 0 } } });
const DT = 1 / 60;

// ---- AC-130: a crate on its way down at the verdict lands; the ally standing at it takes nothing
{
  const pilot = tank('pilot', 'alpha', 0, -200, false);
  pilot.aerial = { kind: 'gunship', y: 240 };
  pilot.input.aimPoint = { x: 40, y: 0, z: -60 };
  const ally = tank('ally', 'alpha', 40, -60);
  ally.combat.ammo = [2]; // well under 90 % of its stowage: it wants the ammunition crate
  const hostile = tank('hostile', 'bravo', 300, 300);
  const events = [];
  const mode = createMatchModeController({ mode: 'ac130', entities: [pilot, ally, hostile], seed: 7,
    emit: (type, payload) => events.push({ type, payload }), setActive(target, active) { target.modeActive = active; }, revive() {} });
  assert.equal(mode.requestSupply('pilot', 'ammo', 1), true, 'the gunship calls a drop');
  const crate = mode.state.pickups.find((pickup) => pickup.airDrop);
  assert.ok(crate, 'the crate is in the air');
  let t = 1;
  for (; t < 3; t += DT) mode.step(DT, t);
  assert.ok(crate.y > crate.groundY + 50, `the crate is still high at the verdict (${crate.y.toFixed(1)} m)`);
  const atVerdict = crate.y;
  mode.matchEnded('bravo', 'time_limit');
  for (; t < 12; t += DT) mode.step(DT, t);
  assert.ok(crate.y < atVerdict, `the crate keeps falling through the hold (${atVerdict.toFixed(1)} -> ${crate.y.toFixed(1)} m)`);
  assert.equal(crate.y, crate.groundY, 'and lands');
  assert.equal(crate.active, true, 'the ally standing at it collects nothing after the verdict');
  assert.equal(events.filter((e) => e.type === 'mode_pickup_collected').length, 0);
  assert.deepEqual(ally.combat.ammo, [2]);
  assert.equal(mode.requestSupply('pilot', 'heal', t), false, 'and no new drop is called');
  assert.deepEqual(mode.step(DT, t), { result: 'bravo', reason: 'time_limit' }, 'the verdict stands');
}

// ---- Turbo Ball: a ball in flight at the verdict comes down; no goal, touch or reset is scored in the hold
{
  const a = tank('a', 'alpha', -250, 0), b = tank('b', 'bravo', 250, 0);
  const events = [];
  const mode = createMatchModeController({ mode: 'turbo_ball', entities: [a, b], seed: 3,
    emit: (type, payload) => events.push({ type, payload }), setActive(target, active) { target.modeActive = active; }, revive() {} });
  const ball = mode.state.ball;
  const floor = ball.y;
  const at = { x: ball.x, y: ball.y, z: ball.z };
  assert.equal(mode.tryHitBall({ prevPos: { x: at.x, y: at.y, z: at.z - 1 }, pos: at, vel: { x: 0, y: 30, z: 4 }, shooterId: 'a' }), true);
  let t = 1;
  for (; t < 5.5; t += DT) mode.step(DT, t);
  assert.ok(ball.y > floor + 30, `the ball is high in the air at the verdict (${(ball.y - floor).toFixed(1)} m up)`);
  const atVerdict = ball.y;
  const before = events.length, score = { ...mode.state.score };
  mode.matchEnded('draw', 'time_limit');
  let lowest = Infinity;
  for (; t < 13.5; t += DT) { mode.step(DT, t); lowest = Math.min(lowest, ball.y - floor); }
  assert.ok(lowest < 0.5, `the ball comes down through the 8 s hold (${(atVerdict - floor).toFixed(1)} m up at the verdict, lowest ${lowest.toFixed(2)} m)`);
  assert.deepEqual(events.slice(before), [], 'nothing is touched, scored or reset after the verdict');
  assert.deepEqual(mode.state.score, score);
}

console.log('verdictHold: through the ending hold a falling supply crate lands and the Turbo Ball comes down; nothing is collected or scored');
