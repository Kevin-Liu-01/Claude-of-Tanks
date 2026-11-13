// battleExitLedgers.selftest — a battle's own ledgers leave with it at the Garage return (round 2 U13, 2026-11-04).
// Audit M6 moved the crush press off the shared obstacle records into a per-battle ledger (sim/crushPress.ts) that solo
// keeps on game._crushPress and clears at the next battle's reset; clearBattleAfterExit, the battle's teardown, left it
// holding the last battle's records and hull ids through the Garage (and the ram pair cooldowns with it).
import assert from 'node:assert/strict';
import { createCrushPressLedger } from '../sim/crushPress.ts';
import { clearBattleAfterExit } from './garageTankLifecycle.ts';

const bench = { kind: 'bench' }, hedge = { kind: 'hedge' };
const ledger = createCrushPressLedger();
for (let tick = 0; tick < 6; tick++) {
  ledger.press(bench, 'player', tick / 60, 1 / 60);
  ledger.press(hedge, 'bot-3', tick / 60, 1 / 60);
}
assert.ok(ledger.size >= 2, `the battle pressed two records (${ledger.size})`);
const game = { allTanks: [], tanks: [], shells: [], player: null, spotting: null, result: null, resultReason: null,
  preBattleS: 0, timeS: 30, fireTickAcc: 0, nextShellId: 1, openingRouteJobs: [],
  _crushPress: ledger, _ramPairT: new Map([['player|bot-3', 12.5]]) };
clearBattleAfterExit({ game });
assert.equal(game._crushPress, null, 'the teardown lets the battle\'s press ledger go (its records and hulls with it)');
assert.equal(game._ramPairT.size, 0, 'and the ram pair cooldowns');
console.log('battleExitLedgers: the crush press and ram cooldowns leave with their battle at the Garage return');
