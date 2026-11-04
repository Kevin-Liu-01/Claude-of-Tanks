// 2026-11-02 audit M6, two per-life rules both drivers apply alike:
//  - the crash accumulator (the closing speed a crash still resolving has priced, sim/impact.ts HullCrashMemory) starts
//    clear at every life, a mode's revive included, on both drivers (resetHullCrashMemory). The solo step cleared it at
//    the battle's seat only and the authority never: a revive inside the 0.3 s crash window (a Turbo Ball goal revives
//    every hull) priced the old life's closing speed into the new life's first blow.
//  - the rollover auto-right runs for every live hull no player drives (sim/botDriven.ts autoRightsItself). The authority
//    read `!bot`, the solo step `!isPlayer`: the same outside Watch; in Watch the human seat's brain drives it (it rights
//    itself) and a watcher's taken bot seat is the player's (it keeps the self-right key), which only `isPlayer` follows.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import '../vehicles/tankFactory.ts'; // register the full authored fleet
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { autoRightsItself } from './botDriven.ts';
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

// ---- the rollover gate: no player at the keys -------------------------------------------------------------------
{
  const input = () => ({ throttle: 0, steer: 0, brake: false, fire: false });
  const human = { id: 'human', team: 'player', isPlayer: true, bot: false, aiCtl: 'human-brain', input: input(), combat: { destroyed: false } };
  const bot = { id: 'bot', team: 'player', isPlayer: false, bot: true, aiCtl: 'bot-brain', input: input(), combat: { destroyed: false } };
  const game = { player: human, tanks: [human, bot], ruleset: { watch: { takeControl: true } }, watch: null };
  assert.equal(autoRightsItself(human), false, 'a player keeps the self-right key');
  assert.equal(autoRightsItself(bot), true, 'a bot rights itself');
  prepareWatchSeat(game, human);
  assert.equal(autoRightsItself(human), false, 'Watch, loading: the human seat is still the player\'s');
  openWatchSeats(game);
  assert.equal(autoRightsItself(human), true, 'Watch, open: the human seat\'s brain drives it, so it rights itself');
  assert.ok(takeWatchSeat(game, bot));
  assert.equal(autoRightsItself(bot), false, 'a watcher\'s taken seat keeps the self-right key (its `bot` role is unchanged)');
  assert.equal(bot.bot, true);
  leaveWatchSeat(game);
  assert.equal(autoRightsItself(bot), true, 'handed back, it rights itself again');
  assert.equal(autoRightsItself({ ...bot, combat: { destroyed: true } }), false, 'a wreck does not');
  assert.equal(autoRightsItself({ ...bot, modeActive: false }), false, 'nor a benched hull');
  assert.match(solo, /function stepRolloverRecovery[\s\S]*?if \(!autoRightsItself\(entity\)\) continue;/, 'the solo step gates its rollover step on it');
  assert.match(authority, /function advanceRollover[\s\S]*?if \(!autoRightsItself\(entity\)\) continue;/, 'the authority too');
}

console.log('hullLifeParity.selftest: a revived hull carries no crash of its last life on either driver; the rollover auto-right runs '
  + 'for every live hull no player drives on both, Watch\'s seats included');
