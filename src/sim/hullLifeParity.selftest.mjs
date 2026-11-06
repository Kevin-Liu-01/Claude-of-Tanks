// 2026-11-02 audit M6, two per-life rules both drivers apply alike:
//  - the crash accumulator (the closing speed a crash still resolving has priced, sim/impact.ts HullCrashMemory) starts
//    clear at every life, a mode's revive included, on both drivers (resetHullCrashMemory). The solo step cleared it at
//    the battle's seat only and the authority never: a revive inside the 0.3 s crash window (a Turbo Ball goal revives
//    every hull) priced the old life's closing speed into the new life's first blow.
//  - the rollover auto-right runs for every live hull a controller drives (268: sim/rollover.ts stepBotRollovers, the one
//    rule both drivers call; round one's own gate, botDriven.ts autoRightsItself on `!isPlayer`, gave way to it at the
//    round-four merge). The authority read `!bot`, the solo step `!isPlayer`; in Watch the human seat's brain drives it
//    (it rights itself) and a watcher's taken bot seat is the player's (it keeps the self-right key): watchSeat.ts parks
//    the taken seat's controller and hands the human seat its own, so the controller rule follows both.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { ROLLOVER_AUTO_RIGHT_S, stepBotRollovers } from './rollover.ts';
import { resetHullCrashMemory } from './impact.ts';
import { leaveWatchSeat, openWatchSeats, prepareWatchSeat, takeWatchSeat } from '../game/watchSeat.ts';

const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');

// ---- the crash memory: a revived hull starts clear ---------------------------------------------------------------
{
  const memory = { _impactAccumMps: 7, _impactAccumT: 3 };
  resetHullCrashMemory(memory);
  assert.deepEqual(memory, { _impactAccumMps: 0, _impactAccumT: -1e9 });
  const match = createAuthoritativeMatch({ mapId: 'verdant', seed: 3, countdownS: 0, gameMode: 'zone_control', players: [
    { id: 'life-a', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: -200, z: -300, yaw: 0 } },
    { id: 'life-b', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 200, z: 300, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const hull = match.entityById.get('life-a');
  const idle = new Map();
  match.step({ dt: 1 / 60, inputs: idle });
  // the hull dies mid-crash: the accumulator holds the crash it was resolving
  hull._impactAccumMps = 9;
  hull._impactAccumT = 1e6;
  hull.combat.hp = 0;
  hull.combat.destroyed = true;
  let tick = 0;
  for (; tick < 1200 && hull.combat.destroyed; tick++) match.step({ dt: 1 / 60, inputs: idle });
  assert.equal(hull.combat.destroyed, false, `zone control revives the hull (after ${tick} ticks)`);
  assert.equal(hull._impactAccumMps, 0, 'the authority: the revived hull carries no crash of its last life');
  assert.equal(hull._impactAccumT, -1e9);
  // the solo step: its revive and its battle seat clear the same memory through the same function
  const reviveBody = solo.slice(solo.indexOf('revive(ent: SoloEntity, spawn: MatchModeSpawn'), solo.indexOf('ent.visual?.syncFromState?.(ent.state);'));
  assert.ok(reviveBody.length > 0 && reviveBody.includes('resetHullCrashMemory(ent);'), 'the solo step: its mode revive clears the crash memory');
  assert.match(solo, /function initializeBattleEntity[\s\S]*?resetHullCrashMemory\(entity\);/, 'and its battle seat');
  assert.match(authority, /function reviveForMode[\s\S]*?resetHullCrashMemory\(tank\);/, 'the authority\'s revive through the same function');
}

// ---- the rollover gate: a controller at the keys ------------------------------------------------------------------
{
  const overturned = () => ({
    speed: 0, verticalSpeed: 0, grounded: true, visualPitch: Math.PI, visualRoll: 0, overturned: true, rolloverCountdownS: 0,
    _spring: { pitchV: 0, rollV: 0 }, _body: { tumbling: true, autoRighting: false }, _terr: { pitch: 0, roll: 0 },
    _ride: { y: 1, v: 0, airTime: 0 }, _rollover: { elapsedS: 0, expired: false },
  });
  /** Whether `hull`, on its roof, is righted by the drivers' one rule within the window. */
  const rightsItself = (hull) => {
    const probe = { ...hull, state: overturned() };
    let righted = false;
    for (let i = 0; i < ROLLOVER_AUTO_RIGHT_S * 60 + 1; i++) stepBotRollovers([probe], 1 / 60, () => { righted = true; });
    return righted;
  };
  const input = () => ({ throttle: 0, steer: 0, brake: false, fire: false });
  const player = { id: 'player', team: 'player', isPlayer: true, bot: false, aiCtl: null, input: input(), combat: { destroyed: false } };
  assert.equal(rightsItself(player), false, 'a player keeps the self-right key');
  // a watched battle's human seat: its brain is built as any bot's and parked until the battle opens (state.ts)
  const human = { id: 'human', team: 'player', isPlayer: true, bot: false, aiCtl: 'human-brain', input: input(), combat: { destroyed: false } };
  const bot = { id: 'bot', team: 'player', isPlayer: false, bot: true, aiCtl: 'bot-brain', input: input(), combat: { destroyed: false } };
  const game = { player: human, tanks: [human, bot], ruleset: { watch: { takeControl: true } }, watch: null };
  assert.equal(rightsItself(bot), true, 'a bot rights itself');
  prepareWatchSeat(game, human);
  assert.equal(rightsItself(human), false, 'Watch, loading: the human seat is still the player\'s');
  openWatchSeats(game);
  assert.equal(rightsItself(human), true, 'Watch, open: the human seat\'s brain drives it, so it rights itself');
  assert.ok(takeWatchSeat(game, bot));
  assert.equal(rightsItself(bot), false, 'a watcher\'s taken seat keeps the self-right key (its `bot` role is unchanged)');
  assert.equal(bot.bot, true);
  leaveWatchSeat(game);
  assert.equal(rightsItself(bot), true, 'handed back, it rights itself again');
  assert.equal(rightsItself({ ...bot, combat: { destroyed: true } }), false, 'a wreck does not');
  assert.equal(rightsItself({ ...bot, modeActive: false }), false, 'nor a benched hull');
  assert.match(solo, /stepBotRollovers\(game\.tanks, SIM_DT,/, 'the solo step runs the one rule');
  assert.match(authority, /stepBotRollovers\(entities, dt,/, 'the authority too');
}

console.log('hullLifeParity.selftest: a revived hull carries no crash of its last life on either driver; the rollover auto-right runs '
  + 'for every live hull a controller drives on both (sim/rollover.ts stepBotRollovers), Watch\'s seats included');
