// botTurboSpin.selftest.mjs — bots take Turbo, and in flight its butt burn (bot-turbo-276; turbo-spin-275 shipped both for
// players only; thrust-boosts-279, Main's ruling 5 as amended 2026-11-27: in flight a bot fires the butt's nozzles at 277's
// dodge moment, never the belly, a side or the nose). Copyright (c) 2026 Kevin B. Liu.
//
// Pass rules (written before measuring):
//   - the planner (game/botAbilities.ts) presses TURBO only where the mode stamped it (modeTurbo), off cooldown
//     (modeMoves.ts turboReadyIn): on the ground at a chase dead ahead with its landing probed; in flight once, early in a
//     real climb with the burn still ahead of the landing, no boost yet this flight, W or no drive held. It never presses
//     AIR_SPIN, and never the jump (F, which boosts in flight) once the ride has left the ground;
//   - a Turbo Ball deal (seed 2, three bots a side, on the authority's step: sim/hullActions.ts applyHullActions, the one
//     action path both drivers and every seat take) sees a bot take Turbo on the ground and a bot fire the butt in flight
//     inside 30 s, no bot boost at all (no tank_air_spin), every butt-burned hull on its tracks 1 s after it lands, and two
//     runs tick-identical; a Standard deal sees neither;
//   - the Turbo Ball sweep's 8 pairs the belly lost (server/botObjectives.selftest.mjs, from 60 m, 4 seeds, 120 s) each
//     score on some seed, at most 5% of the butt-burned landings there end overturned 1 s on, and the reverted control (the
//     ruling-5 bot: the same press fires the belly, AIR_SPIN for TURBO in flight) scores on none of them.
import assert from 'node:assert/strict';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { SIM_DT, tankAirborne } from './movement.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { BOOST_BURN_S, BOOST_NOZZLES } from './hullFlight.ts';
import { createDedicatedWorldCollision } from '../../server/dedicatedWorldCollision.ts';
import { BOT_TURBO, createBotAbilityPlanner } from '../game/botAbilities.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';

const { TURBO, AIR_SPIN, SELF_RIGHT } = PLAYER_ACTION_BITS;

// ---- the planner
const ball = matchRulesetFor('turbo_ball');
function planned(over = {}, context = {}) {
  const { state, ...rest } = over;
  const entity = {
    modeJumpMps: ball.jumpMps, modeTurbo: ball.turbo, modeAirSpin: ball.airSpin,
    combat: { hp: 100, maxHp: 100, destroyed: false },
    state: { yaw: 0, turretYaw: 0, speed: 10, verticalSpeed: 0, grounded: true, overturned: false, _ride: { airTime: 0 }, _body: {}, _boostBurnS: 0, _boostsUsed: 0, ...state },
    input: { throttle: 1, steer: 0 },
    ...rest,
  };
  const ctx = { hitBearing: 0, hitAtS: -Infinity, retreating: false, reloadS: 0, contactM: Infinity, safeJump: false,
    chaseM: 40, safeTurbo: true, flightS: 0, ...context };
  const planner = createBotAbilityPlanner({ id: 'fixture' });
  return { eligible: planner.turboEligible(entity, 10, ctx), bits: planner.update(entity, 10, ctx) };
}
const flight = { grounded: false, verticalSpeed: 6, _ride: { airTime: 0.3 } };
const AIR = { flightS: 3 };
assert.ok(planned().bits & TURBO, 'a chase dead ahead on the ground: Turbo');
assert.equal(planned({ modeTurbo: null }).bits & TURBO, 0, 'no Turbo where the mode has none');
assert.equal(planned({ turboReadyS: 11 }).bits & TURBO, 0, 'no Turbo while it cools');
assert.equal(planned({}, { safeTurbo: false }).bits & TURBO, 0, 'no Turbo where the landing probe refuses');
assert.equal(planned({}, { chaseM: Infinity }).bits & TURBO, 0, 'no Turbo with nothing to chase');
assert.equal(planned({}, { chaseM: BOT_TURBO.groundMaxM + 1 }).bits & TURBO, 0, 'no ground Turbo at a chase past its reach');
assert.equal(planned({}, { retreating: true }).bits & TURBO, 0, 'no Turbo falling back');
assert.equal(planned({ state: { speed: 1 } }).bits & TURBO, 0, 'no ground Turbo from a standstill');
assert.ok(planned({ state: flight }, AIR).bits & TURBO, 'early in a climb with the burn ahead: the butt burn');
assert.ok(planned({ state: flight, input: { throttle: 0, steer: 0 } }, AIR).bits & TURBO, 'no drive held: the butt too');
assert.equal(planned({ state: flight, modeTurbo: null }, AIR).bits & TURBO, 0, 'no butt burn where the mode has no Turbo');
assert.equal(planned({ state: flight, modeAirSpin: null }, AIR).bits & TURBO, 0, 'nor where it has no flight rules');
assert.equal(planned({ state: flight, turboReadyS: 11 }, AIR).bits & TURBO, 0, 'nor while Turbo cools');
assert.equal(planned({ state: flight, input: { throttle: 0, steer: 1 } }, AIR).bits & TURBO, 0, 'nor while the drive holds a side');
assert.equal(planned({ state: flight, input: { throttle: -1, steer: 0 } }, AIR).bits & TURBO, 0, 'nor S');
const burnAhead = BOOST_BURN_S + BOT_TURBO.spinMarginS;
assert.equal(planned({ state: flight }, { flightS: burnAhead - 0.05 }).bits & TURBO, 0, 'none without the burn ahead of the landing');
assert.ok(planned({ state: flight }, { flightS: burnAhead + 0.05 }).bits & TURBO, 'and the burn once it is');
assert.equal(planned({ state: { ...flight, verticalSpeed: 0.5 } }, { chaseM: 60, flightS: 2 }).bits & TURBO, 0, 'none off a hop or a spent climb');
assert.equal(planned({ state: { ...flight, _ride: { airTime: 1.2 } } }, AIR).bits & TURBO, 0, 'none late in a flight');
assert.equal(planned({ state: { ...flight, _boostsUsed: 1 } }, AIR).bits & TURBO, 0, 'once a flight');
assert.equal(planned({ state: { ...flight, _boostBurnS: 0.1 } }, AIR).bits & TURBO, 0, 'none while a burn runs');
for (const [state, why] of [[{}, 'the ground'], [flight, 'flight'], [{ ...flight, _boostsUsed: 1 }, 'a spent flight']]) {
  assert.equal(planned({ state }, AIR).bits & AIR_SPIN, 0, `never the boost (${why})`);
}
// the jump wants the ride on its support: F once it has left it boosts (sim/modeMoves.ts pressSelfRight)
const offensive = { offensive: true, safeJump: true, chaseM: Infinity };
assert.ok(planned({}, offensive).bits & SELF_RIGHT, 'on the ground an offensive jump is pressed');
assert.equal(planned({ state: { _ride: { airTime: 0.2 } } }, offensive).bits & SELF_RIGHT, 0,
  'not once the ride has left its support, though the hull reads grounded');

// ---- a deal on the authority's step
const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);
/** Butt-burned hulls (`burning`, by id): on landing each is looked at 1 s on; returns [landings, overturned]. */
function watchLandings(entityById) {
  const flying = new Set(), due = new Map();
  let landings = 0, overturned = 0;
  return {
    burned(id) { flying.add(id); },
    tick(tick) {
      for (const id of flying) {
        if (tankAirborne(entityById.get(id).state)) continue;
        flying.delete(id); due.set(id, tick + 60); landings++;
      }
      for (const [id, at] of due) {
        if (tick < at) continue;
        due.delete(id);
        if (entityById.get(id).state.overturned === true) overturned++;
      }
    },
    get landings() { return landings; },
    get overturned() { return overturned; },
  };
}
function deal(gameMode, seconds = 30) {
  const players = [];
  for (let i = 0; i < 3; i++) {
    players.push({ id: `a-${i}`, specId: SPEC, team: 'alpha', bot: true }, { id: `b-${i}`, specId: SPEC, team: 'bravo', bot: true });
  }
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 2, gameMode, countdownS: 0, players });
  match.onMatchReady();
  const inputs = new Map(), log = [], landings = watchLandings(match.entityById);
  let boosts = 0, butts = 0;
  for (let tick = 0; tick < 60 * seconds; tick++) {
    match.step({ dt: SIM_DT, inputs });
    const snap = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId: 'a-0', ackInputSeq: null });
    for (const ev of snap.events ?? []) {
      if (ev.type !== 'tank_turbo' && ev.type !== 'tank_air_spin') continue;
      assert.equal(match.entityById.get(ev.id)?.bot, true, `${ev.type} from a bot`);
      log.push(`${tick}:${ev.type}:${ev.id}:${ev.nozzle ?? ''}`);
      if (ev.type === 'tank_air_spin') boosts++;
      if (ev.type === 'tank_turbo' && ev.nozzle === BOOST_NOZZLES.FORWARD) { butts++; landings.burned(ev.id); }
    }
    landings.tick(tick);
    match.afterSnapshotBroadcast();
  }
  return { log, boosts, butts, landings: landings.landings, overturned: landings.overturned };
}
const first = deal('turbo_ball');
const turbos = first.log.filter((l) => l.includes(':tank_turbo:')).length;
assert.ok(turbos > first.butts, 'a Turbo Ball bot takes Turbo on the ground inside 30 s');
assert.ok(first.butts > 0, 'a Turbo Ball bot fires the butt in flight inside 30 s');
assert.equal(first.boosts, 0, 'no bot boost (belly, side or nose) at all');
assert.equal(first.overturned, 0, `every butt-burned bot is on its tracks 1 s after it lands (${first.landings} landings)`);
assert.deepEqual(deal('turbo_ball').log, first.log, 'two runs of the deal take them on the same ticks');
assert.deepEqual(deal('standard', 15).log, [], 'a Standard deal sees neither');

// ---- the Turbo Ball sweep's pairs the belly lost, and the reverted control
// The ruling-5 bot pressed the belly at this moment: the control swaps each in-flight TURBO a bot's brain presses for
// AIR_SPIN after it thinks (entity.aiCtl.update, sim/playerInputStage.ts applyBotInput), on the same action path.
const BELLY_LOST = [['desert', 'bravo'], ['coastal', 'bravo'], ['autumn', 'bravo'], ['railyard', 'alpha'], ['blackglass', 'alpha'],
  ['oasis', 'alpha'], ['longleaf', 'alpha'], ['longleaf', 'bravo']];
const SEEDS = [6767, 1, 2, 3];
function asBellyBot(entity) {
  const ctl = entity.aiCtl;
  if (!ctl || ctl.__belly) return;
  const update = ctl.update.bind(ctl);
  ctl.update = (dt, timeS) => {
    update(dt, timeS);
    const bits = entity.input.actionBits | 0;
    if ((bits & TURBO) && tankAirborne(entity.state)) entity.input.actionBits = (bits & ~TURBO) | AIR_SPIN;
  };
  ctl.__belly = true;
}
/** One run (server/botObjectives.selftest.mjs ballRun): the ball 60 m before `goalTeam`'s goal, the runner 22 m behind. */
function ballRun(mapId, goalTeam, seed, belly, landings) {
  const runnerTeam = goalTeam === 'bravo' ? 'alpha' : 'bravo';
  const match = createAuthoritativeMatch({
    mapId, gameMode: 'turbo_ball', seed, countdownS: 0, worldCollision: createDedicatedWorldCollision(mapId),
    players: [{ id: 'runner', specId: 'm551_sheridan', team: runnerTeam, bot: true }, { id: 'opponent', specId: 't90am', team: goalTeam }],
  });
  match.onMatchReady();
  for (const entity of match.entities) entity.combat.ammo.fill(0);
  const { ball, goals } = match.modeController.state, goal = goals.find((g) => g.team === goalTeam);
  const dx = goal.x - ball.x, dz = goal.z - ball.z, length = Math.hypot(dx, dz), nx = dx / length, nz = dz / length;
  ball.x = goal.x - nx * 60; ball.z = goal.z - nz * 60;
  ball.y = match.heightField.getHeightAt(ball.x, ball.z) + 2.2;
  const bot = match.entityById.get('runner');
  bot.state.pos.set(ball.x - nx * 22, match.heightField.getHeightAt(ball.x - nx * 22, ball.z - nz * 22), ball.z - nz * 22);
  bot.state.yaw = Math.atan2(nx, nz);
  const opponent = match.entityById.get('opponent');
  opponent.state.pos.x += 75;
  opponent.state.pos.y = match.heightField.getHeightAt(opponent.state.pos.x, opponent.state.pos.z);
  const inputs = new Map(), watch = watchLandings(match.entityById);
  let scored = false;
  for (let tick = 0; tick < 120 * 60 && !scored; tick++) {
    if (belly) asBellyBot(bot);
    match.step({ dt: SIM_DT, inputs });
    watch.tick(tick);
    if (tick % 15 !== 0) continue;
    for (const ev of match.snapshot({ tick, serverTimeMs: tick * 1000 / 60 }).events) {
      if (ev.type === 'mode_goal_scored') scored = true;
      if (ev.type === 'tank_turbo' && ev.id === 'runner' && ev.nozzle === BOOST_NOZZLES.FORWARD) watch.burned('runner');
    }
    match.afterSnapshotBroadcast();
  }
  landings.n += watch.landings; landings.over += watch.overturned;
  return scored;
}
const now = [], control = [], buttLandings = { n: 0, over: 0 }, bellyLandings = { n: 0, over: 0 };
for (const [mapId, goalTeam] of BELLY_LOST) {
  const key = `${mapId}->${goalTeam}`;
  const seed = SEEDS.find((s) => ballRun(mapId, goalTeam, s, false, buttLandings));
  now.push(seed == null ? `${key}: none` : `${key}: seed ${seed}`);
  assert.ok(seed != null, `${key} scores on one of seeds ${SEEDS.join(', ')} with the butt burn`);
  const bellySeed = SEEDS.find((s) => ballRun(mapId, goalTeam, s, true, bellyLandings));
  if (bellySeed != null) control.push(`${key} (seed ${bellySeed})`);
}
assert.ok(buttLandings.n > 0 && buttLandings.over <= 0.05 * buttLandings.n,
  `at most 5% of butt-burned landings overturned 1 s on: ${buttLandings.over} of ${buttLandings.n}`);
assert.deepEqual(control, [], `the reverted control (the belly at the same press) scores on none of the 8 pairs: ${control.join(', ')}`);

console.log(`botTurboSpin: the planner presses Turbo on the ground at a chase dead ahead and the butt burn once early in a real `
  + `climb with the burn ahead, never the boost and never a jump off a lifted ride; Turbo Ball seed 2, 3v3 bots, 30 s: `
  + `${turbos} turbos (${first.butts} butt burns, ${first.landings} landings, ${first.overturned} overturned), no boost, two runs `
  + `tick-identical; Standard sees neither; the belly's 8 lost pairs score again (${now.join(', ')}), ${buttLandings.over} of `
  + `${buttLandings.n} butt-burned landings overturned 1 s on; the reverted control (belly) scores on none`);
