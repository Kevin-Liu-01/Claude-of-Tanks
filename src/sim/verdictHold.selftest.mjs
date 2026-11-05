// verdictHold.selftest — through the ending hold the verdict stops the mode's rules, not the bodies already moving
// (round 2 U4, 2026-11-04). The mode controller hears a verdict it did not reach (matchEnded, audit M3) and takes it as
// its own result; step() then returned at its first line, so an AC-130 supply crate released just before the verdict
// hung in mid-air for the whole 8 s hold and the Turbo Ball stopped where it flew, in solo and on the authority (both
// drivers keep stepping the controller through the hold). A carried CTF flag hung at the verdict spot too while its
// carrier drove on, and the juggernaut's hp line kept its verdict value under a shell landing in the hold. Now the crate
// lands, the ball comes down, the flag rides its carrier and the hp line follows the hull; nothing is collected, touched,
// captured or scored.
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

// ---- Capture the Flag: a carried flag rides its carrier through the hold; it is not captured, returned or dropped
// (round 2 review: syncCarriedFlag ran only inside stepFlags, so the flag hung at the verdict spot while its carrier
// drove on, and matchModeWorldPresentation draws it at flag.x/y/z)
{
  const carrier = tank('carrier', 'alpha', 0, -100, false), defender = tank('defender', 'bravo', 0, 100);
  const events = [];
  const mode = createMatchModeController({ mode: 'capture_the_flag', entities: [carrier, defender], seed: 1,
    emit: (type, payload) => events.push({ type, payload }), setActive(target, active) { target.modeActive = active; }, revive() {} });
  const [home, enemyFlag] = ['alpha', 'bravo'].map((team) => mode.state.flags.find((flag) => flag.team === team));
  Object.assign(carrier.state.pos, { x: enemyFlag.x, z: enemyFlag.z });
  let t = 1;
  for (let i = 0; i < 30; i++, t += DT) mode.step(DT, t);
  assert.equal(enemyFlag.status, 'carried', 'the carrier has the bravo flag');
  assert.equal(enemyFlag.carrierId, 'carrier');
  const before = events.length, score = { ...mode.state.score };
  mode.matchEnded('draw', 'time_limit');
  // the carrier drives home through the 8 s hold and ends on its own flag's base, where a live match would score
  const from = { x: carrier.state.pos.x, z: carrier.state.pos.z }, steps = 480;
  for (let i = 1; i <= steps; i++, t += DT) {
    carrier.state.pos.x = from.x + (home.baseX - from.x) * (i / steps);
    carrier.state.pos.z = from.z + (home.baseZ - from.z) * (i / steps);
    mode.step(DT, t);
    assert.ok(Math.hypot(enemyFlag.x - carrier.state.pos.x, enemyFlag.z - carrier.state.pos.z) < 1e-9,
      `the carried flag rides its carrier through the hold (step ${i}: flag ${enemyFlag.x.toFixed(1)},${enemyFlag.z.toFixed(1)}, `
      + `carrier ${carrier.state.pos.x.toFixed(1)},${carrier.state.pos.z.toFixed(1)})`);
  }
  assert.equal(enemyFlag.y, carrier.state.pos.y + 3.4, 'at its carried height');
  assert.equal(enemyFlag.status, 'carried', 'not captured or dropped at the own base after the verdict');
  assert.equal(home.status, 'home');
  assert.deepEqual(events.slice(before), [], 'no capture, return or take is announced after the verdict');
  assert.deepEqual(mode.state.score, score, 'and the score stands');
  assert.deepEqual(mode.step(DT, t), { result: 'draw', reason: 'time_limit' }, 'the verdict stands');
}

// ---- Juggernaut: a shell that lands on the boss in the hold moves its hp line (the HUD's boss readout); the verdict stands
{
  const boss = tank('boss', 'alpha', 0, -100, false), hunter = tank('hunter', 'bravo', 0, 100);
  const events = [];
  const mode = createMatchModeController({ mode: 'juggernaut', entities: [boss, hunter], seed: 2,
    emit: (type, payload) => events.push({ type, payload }), setActive(target, active) { target.modeActive = active; }, revive() {} });
  let t = 1;
  for (let i = 0; i < 10; i++, t += DT) mode.step(DT, t);
  assert.equal(mode.state.boss.id, 'boss');
  assert.equal(mode.state.boss.hp, boss.combat.hp);
  const before = events.length;
  mode.matchEnded('alpha', 'time_limit');
  boss.combat.hp -= 400; // a shell already in flight lands in the hold
  mode.step(DT, t); t += DT;
  assert.equal(mode.state.boss.hp, boss.combat.hp, `the boss's hp line follows a late hit (${mode.state.boss.hp} vs ${boss.combat.hp})`);
  boss.combat.hp = 0; boss.combat.destroyed = true;
  assert.deepEqual(mode.step(DT, t), { result: 'alpha', reason: 'time_limit' }, 'a boss lost in the hold does not overturn the verdict');
  assert.equal(mode.state.boss.hp, 0);
  assert.deepEqual(events.slice(before), [], 'and nothing is announced');
}

console.log('verdictHold: through the ending hold a falling supply crate lands, the Turbo Ball comes down, a carried flag rides its carrier and the boss hp follows its hull; nothing is collected or scored');
