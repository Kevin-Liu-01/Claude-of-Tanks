// authorityStateMigration.selftest.mjs — the authority's own state across a host migration: a census (279). Copyright (c) 2026 Kevin B. Liu.
//
// migrationHull's census walks a hull's own fields and ai.brainRecord's walks a bot brain's, but the authority keeps
// state of its own beside its hulls: ledgers keyed by hull (who set a fire, who hurt a hull last, a press on a prop, a
// ram pair's cooldown), clocks, counters and the world's indices. The kill-credit ledgers (death-flow-275) lived there
// and rode no keyframe until 279, and neither census could see them. This one reads sim/authoritativeMatch.ts: every
// `let` of createAuthoritativeMatch and every `const` it builds as a Map, a Set or a create*() instance is either carried
// to a migrated host (and where: the proof is the receipt named beside it) or named with the reason it need not be. A
// new one fails here until it is decided; a name listed that the source no longer declares fails as stale.
// Open (named so, and told to Main 2026-11-26): the crush press under way and the ram pairs' cooldown, both on the
// authority's own clock, are lost to a migration.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SOURCE = new URL('../../sim/authoritativeMatch.ts', import.meta.url);

/** Carried to a migrated host, and where (with the receipt that proves it). */
const CARRIED = new Map([
  ['battleS', 'MigrationKeyframe.battleS -> resumedAtS (modeWindowMigration [1])'],
  ['fireTickAcc', 'NewModeCheckpoint.host.fireTickS (modeWindowMigration [7])'],
  ['navigationWreckTicks', 'NewModeCheckpoint.host.wreckTicks (modeWindowMigration [7])'],
  ['spotting', 'NewModeCheckpoint.host.spotting (modeWindowMigration [7])'],
  ['modeController', 'NewModeCheckpoint.mode (sixModesMigration, objectiveModesMigration, waveStartMigration)'],
  ['fortified', 'NewModeCheckpoint.fortified (combatMigration)'],
  ['fireCredit', 'NewModeCheckpoint.host.fireStarters, 279 (killCreditMigration)'],
  ['recentDamage', 'NewModeCheckpoint.host.recentDamage on the battle clock, 279 (killCreditMigration)'],
  ['destruction', 'the destruction log the seat was told of -> restoreDestruction (windowReplay [6])'],
  ['destroyedObstacleSet', 'the frame\'s destroyed list -> restoreDestroyedObstacles (migrationState.selftest)'],
  ['destructibleRevision', 'the frame meta\'s revision -> restoreDestroyedObstacles (migrationState.selftest)'],
  ['wreckTurrets', 'each wreck row\'s turret body -> restoreWreckTurret (resumeHullBody)'],
  ['phase', 'resumePhaseOf: the newest frame\'s phase (resumePhase)'],
  ['countdownRemainingS', 'resumePhaseOf: the newest frame\'s countdownMs (resumePhase)'],
  ['result', 'resumePhaseOf: the verdict -> restoreVerdict (resumePhase)'],
  ['resultReason', 'the same'],
  ['resultTimeS', 'the same: restoreVerdict spends the ending hold'],
]);

/** Not carried, each with its reason. */
const NOT_CARRIED = new Map([
  ['timeS', 'the authority\'s own clock: restarts at 0 on a new host by design; what a keyframe carries is on the battle clock or aged into this one'],
  ['nextShellId', 'the ids of the rounds this host fires: no round in flight rides a keyframe (frame.shells is empty), and no rule reads an id\'s value'],
  ['modeEventSerial', 'the host\'s own count of mode events, read to know when to send the mode\'s state again (matchHostCore); no peer compares it'],
  ['airReveal', 'a view bound at construction (Air Support\'s reveal)'],
  ['botNavigation', 'the world\'s navigation grid, built afresh on the new host (or the standby\'s prepared ground)'],
  ['placement', 'the match placement on this world, built at construction'],
  ['opening', 'the bots\' opening plan, built from the roster and the map at construction; the brains\' own way rides the keyframe (botDriveMigration)'],
  ['ids', 'the roster, from the boot configuration every host boots from'],
  ['entityById', 'the same'],
  ['playerRecordById', 'the same'],
  ['obstacleIndex', 'the world\'s obstacle index, built from the world at construction'],
  ['obstacleByPropIdx', 'the same'],
  ['obstacleByTreeIdx', 'the same'],
  ['seatsAway', 'a seat away starts its grace over on a new host by design (death-flow-275 R5: the ledger is the host\'s own)'],
  ['seatBots', 'a seat already handed to a bot is a bot on the roster the new host boots from'],
  ['thinRotaryShot', 'presentation only: which rotary rounds play their flash and report (every round still flies and hits)'],
  ['destroyedFallViews', 'each viewer\'s sent-falls view: the new host\'s own frames start a view over'],
  ['destroyedBeforeBurst', 'a step\'s scratch: cleared and filled within one burst'],
  ['pendingCrushSet', 'a step\'s scratch: cleared every step'],
  ['bestRamPairs', 'a step\'s scratch: cleared every step'],
  ['pairReachMaxM', 'a step\'s scratch: set before each pair pass'],
  ['pendingTankBlast', 'a step\'s scratch: one shell\'s blast between its hit and its burst'],
  ['movingEntity', 'a step\'s scratch: the hull being moved'],
  ['hardContact', 'a step\'s scratch: the move\'s contact'],
  ['_supportPose', 'a step\'s scratch'],
  ['eventSources', 'keyed by an event waiting to be sent: no pending event rides a keyframe (the new host drops its own opening events, waveStartMigration)'],
  ['withheldCopies', 'the same: a pending event\'s per-viewer copy'],
  // open: told to Main (279's census found them); the press and the cooldown restart on the new host
  ['crushPress', 'OPEN (279 census, told to Main): a press under way on a prop (up to CRUSH_PRESS_S, on the authority\'s own clock) starts over on a new host'],
  ['ramPairTime', 'OPEN (279 census, told to Main): a ram pair\'s cooldown (on the authority\'s own clock) is lost, so a pair may ram again sooner'],
]);

const text = readFileSync(SOURCE, 'utf8');
const start = text.indexOf('export function createAuthoritativeMatch(');
assert.ok(start > 0, 'the authority\'s factory is found');
const body = text.slice(start);
const declared = [];
for (const match of body.matchAll(/^ {2}(let|const) ([A-Za-z_$][\w$]*)\b[^=\n]*=\s*([^\n]*)/gm)) {
  const [, kind, name, rhs] = match;
  if (kind === 'let' || /^(create[A-Z]\w*(<[^\n(]*>)?\(|new (Map|Set|WeakMap)\b)/.test(rhs)) declared.push(name);
}
assert.ok(declared.length > 40, `the census reads the factory's state (${declared.length} declarations)`);
const both = [...CARRIED.keys()].filter((name) => NOT_CARRIED.has(name));
assert.deepEqual(both, [], 'a name is carried or not, never both');
const undecided = declared.filter((name) => !CARRIED.has(name) && !NOT_CARRIED.has(name));
assert.deepEqual(undecided, [], `every authority let and stateful const is carried or named (left undecided: ${undecided.join(', ') || 'none'})`);
const stale = [...CARRIED.keys(), ...NOT_CARRIED.keys()].filter((name) => !declared.includes(name));
assert.deepEqual(stale, [], `no name is listed that the factory no longer declares (stale: ${stale.join(', ') || 'none'})`);
const open = [...NOT_CARRIED].filter(([, why]) => why.startsWith('OPEN')).map(([name]) => name);

console.log(`authorityStateMigration.selftest: the authority's ${declared.length} lets and stateful consts are each carried (${CARRIED.size}) or named (${NOT_CARRIED.size}); open: ${open.join(', ')}`);
