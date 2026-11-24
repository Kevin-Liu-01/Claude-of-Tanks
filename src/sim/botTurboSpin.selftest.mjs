// botTurboSpin.selftest.mjs — bots take Turbo and the air spin (bot-turbo-276; turbo-spin-275 shipped both for players
// only, bots left out of scope). Copyright (c) 2026 Kevin B. Liu.
//
// Pins:
//   - the planner (game/botAbilities.ts) presses TURBO and AIR_SPIN only where the mode stamped them (modeTurbo,
//     modeAirSpin), Turbo only off cooldown (modeMoves.ts turboReadyIn) at a chase dead ahead and with its landing probed,
//     the air spin only early in a real climb with the whole turn still ahead of the landing, never on the ground;
//   - a Turbo Ball deal (seed 2, three bots a side, on the authority's step: sim/hullActions.ts applyHullActions, the one
//     action path both drivers and every seat take) sees a bot take Turbo and a bot flip or roll inside 30 s, every
//     spin's hull lands on its tracks, and two runs of the deal are tick-identical;
//   - a Standard deal on the same seed sees neither.
import assert from 'node:assert/strict';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { SIM_DT, tankAirborne } from './movement.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { BOT_TURBO, createBotAbilityPlanner } from '../game/botAbilities.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';

const { TURBO, AIR_SPIN } = PLAYER_ACTION_BITS;

// ---- the planner
const ball = matchRulesetFor('turbo_ball');
function planned(over = {}, context = {}) {
  const { state, ...rest } = over;
  const entity = {
    modeJumpMps: ball.jumpMps, modeTurbo: ball.turbo, modeAirSpin: ball.airSpin,
    combat: { hp: 100, maxHp: 100, destroyed: false },
    state: { yaw: 0, turretYaw: 0, speed: 10, verticalSpeed: 0, grounded: true, overturned: false, _ride: { airTime: 0 }, _body: {}, _airSpinAxis: 0, ...state },
    ...rest,
  };
  const ctx = { hitBearing: 0, hitAtS: -Infinity, retreating: false, reloadS: 0, contactM: Infinity, safeJump: false,
    chaseM: 40, safeTurbo: true, flightS: 0, ...context };
  const planner = createBotAbilityPlanner({ id: 'fixture' });
  return { eligible: planner.turboEligible(entity, 10, ctx), bits: planner.update(entity, 10, ctx) };
}
const flight = { grounded: false, verticalSpeed: 6, _ride: { airTime: 0.3 } };
assert.ok(planned().bits & TURBO, 'a chase dead ahead on the ground: Turbo');
assert.equal(planned({ modeTurbo: null }).bits & TURBO, 0, 'no Turbo where the mode has none');
assert.equal(planned({ turboReadyS: 11 }).bits & TURBO, 0, 'no Turbo while it cools');
assert.equal(planned({}, { safeTurbo: false }).bits & TURBO, 0, 'no Turbo where the landing probe refuses');
assert.equal(planned({}, { chaseM: Infinity }).bits & TURBO, 0, 'no Turbo with nothing to chase');
assert.equal(planned({}, { chaseM: BOT_TURBO.groundMaxM + 1 }).bits & TURBO, 0, 'no ground Turbo at a chase past its reach');
assert.equal(planned({}, { retreating: true }).bits & TURBO, 0, 'no Turbo falling back');
assert.equal(planned({ state: { speed: 1 } }).bits & TURBO, 0, 'no ground Turbo from a standstill');
assert.equal(planned({ state: flight }, { flightS: 3 }).bits & TURBO, 0, 'no air Turbo while the climb lasts');
assert.ok(planned({ state: { ...flight, verticalSpeed: 0.5 } }, { chaseM: 120, flightS: 2 }).bits & TURBO,
  'the air dash once the climb is spent, farther than the ground leap');
assert.ok(planned({ state: flight }, { flightS: 3 }).bits & AIR_SPIN, 'early in a climb with the turn ahead: the air spin');
assert.equal(planned({ state: flight, modeAirSpin: false }, { flightS: 3 }).bits & AIR_SPIN, 0, 'no air spin where the mode has none');
assert.equal(planned({ state: flight }, { flightS: 1 }).bits & AIR_SPIN, 0, 'no air spin without the whole turn ahead of the landing');
assert.equal(planned({ state: { ...flight, verticalSpeed: 0.5 } }, { flightS: 3 }).bits & AIR_SPIN, 0, 'no air spin off a hop (no climb)');
assert.equal(planned({ state: { ...flight, _ride: { airTime: 1.2 } } }, { flightS: 3 }).bits & AIR_SPIN, 0, 'one spin a flight: none late in it');
assert.equal(planned({ state: { ...flight, _airSpinAxis: 1 } }, { flightS: 3 }).bits & AIR_SPIN, 0, 'none while a spin still turns');
assert.equal(planned({}, { flightS: 3 }).bits & AIR_SPIN, 0, 'never on the ground');

// ---- a deal on the authority's step
const SPEC = 'm1a1_abrams_hc';
await ensureAuthorityFleet([SPEC]);
function deal(gameMode, seconds = 30) {
  const players = [];
  for (let i = 0; i < 3; i++) {
    players.push({ id: `a-${i}`, specId: SPEC, team: 'alpha', bot: true }, { id: `b-${i}`, specId: SPEC, team: 'bravo', bot: true });
  }
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 2, gameMode, countdownS: 0, players });
  match.onMatchReady();
  const inputs = new Map(), log = [], spinning = new Set();
  let roofLandings = 0;
  for (let tick = 0; tick < 60 * seconds; tick++) {
    match.step({ dt: SIM_DT, inputs });
    const snap = match.snapshot({ tick, serverTimeMs: tick * 1000 / 60, viewerId: 'a-0', ackInputSeq: null });
    for (const ev of snap.events ?? []) {
      if (ev.type !== 'tank_turbo' && ev.type !== 'tank_air_spin') continue;
      assert.equal(match.entityById.get(ev.id)?.bot, true, `${ev.type} from a bot`);
      log.push(`${tick}:${ev.type}:${ev.id}:${ev.axis ?? ''}`);
      if (ev.type === 'tank_air_spin') spinning.add(ev.id);
    }
    for (const id of spinning) {
      const state = match.entityById.get(id).state;
      if (tankAirborne(state)) continue;
      spinning.delete(id);
      if (state.overturned === true) roofLandings++;
    }
    match.afterSnapshotBroadcast();
  }
  return { log, roofLandings };
}
const first = deal('turbo_ball');
const turbos = first.log.filter((l) => l.includes(':tank_turbo:')).length;
const spins = first.log.filter((l) => l.includes(':tank_air_spin:')).length;
assert.ok(turbos > 0, 'a Turbo Ball bot takes Turbo inside 30 s');
assert.ok(spins > 0, 'a Turbo Ball bot flips or rolls in flight inside 30 s');
assert.equal(first.roofLandings, 0, 'every bot spin lands on its tracks');
assert.deepEqual(deal('turbo_ball').log, first.log, 'two runs of the deal take them on the same ticks');
assert.deepEqual(deal('standard', 15).log, [], 'a Standard deal sees neither');

console.log(`botTurboSpin: the planner presses Turbo at a chase dead ahead (off cooldown, landing probed; the air dash once `
  + `the climb is spent) and the air spin early in a real climb with the turn ahead, only where the mode carries them; `
  + `Turbo Ball seed 2, 3v3 bots, 30 s: ${turbos} turbos and ${spins} spins on the authority's action step (first `
  + `${first.log[0]}), every spin landed on its tracks, two runs tick-identical; Standard sees neither`);
