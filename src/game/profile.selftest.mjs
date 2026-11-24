import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};

const {
  getLastBattleRecord,
  getPlayerRecord,
  getRecentBattles,
  installBattleRecords,
  recordBattleResult,
} = await import('./profile.ts');

const handlers = new Map();
const bus = {
  on(name, fn) {
    if (!handlers.has(name)) handlers.set(name, []);
    handlers.get(name).push(fn);
  },
  emit(name, payload) {
    for (const fn of handlers.get(name) || []) fn(payload);
  },
};

assert.deepEqual(getPlayerRecord(), {
  version: 2, matches: 0, wins: 0, losses: 0, draws: 0,
  kills: 0, damage: 0, bestDamage: 0, lastBattle: null, recentBattles: [],
});

installBattleRecords(bus);
installBattleRecords(bus);
bus.emit('ui:battleStart', { playerId: 'player-7', specId: 'm1a1_abrams_hc', mapId: 'desert' });
bus.emit('shell:hit', { attackerId: 'player-7', targetId: 'enemy-1', damage: 431.4 });
bus.emit('shell:hit', { attackerId: 'enemy-1', targetId: 'player-7', damage: 900 });
bus.emit('tank:destroyed', { killerId: 'player-7', id: 'enemy-1' });
bus.emit('battle:ended', { result: 'victory', durationS: 123.2 });

assert.deepEqual(getLastBattleRecord(), {
  result: 'victory', kills: 1, damage: 431, vehicleId: 'm1a1_abrams_hc', mapId: 'desert',
  durationS: 123, completedAt: getLastBattleRecord().completedAt,
});
assert.deepEqual(getPlayerRecord(), {
  version: 2, matches: 1, wins: 1, losses: 0, draws: 0,
  kills: 1, damage: 431, bestDamage: 431, lastBattle: getLastBattleRecord(), recentBattles: [getLastBattleRecord()],
});

recordBattleResult({ result: 'draw', kills: 2, damage: 1000, completedAt: 42 });
// (leave-no-loss-276) a result outside the closed set (game/battleOutcome.ts) is refused: it never reads as a defeat
assert.throws(() => recordBattleResult({ result: 'unknown', damage: -10, completedAt: 43 }), /must name an outcome/);
recordBattleResult({ result: 'defeat', damage: -10, completedAt: 43 });
const defeat = { result: 'defeat', kills: 0, damage: 0, vehicleId: '', mapId: '', durationS: 0, completedAt: 43 };
assert.deepEqual(getPlayerRecord(), {
  version: 2, matches: 3, wins: 1, losses: 1, draws: 1,
  kills: 3, damage: 1431, bestDamage: 1000, lastBattle: defeat,
  recentBattles: getRecentBattles(),
});
// the Deploy screen's recent battles: the newest three, newest first
recordBattleResult({ result: 'victory', kills: 5, damage: 3310, vehicleId: 'leo2a6', mapId: 'amberford', completedAt: 44 });
assert.deepEqual(getRecentBattles().map((battle) => battle.completedAt), [44, 43, 42], 'the newest three battles, newest first');
// a profile saved before the list existed seeds it with its last battle
store.set([...store.keys()].find((key) => key !== 'cot_progress_v1'), JSON.stringify({ version: 2, matches: 1, lastBattle: defeat }));
const { getRecentBattles: reload } = await import(`./profile.ts?legacy`);
assert.deepEqual(reload().map((battle) => battle.completedAt), [43], 'an older profile keeps its last battle as its recent one');
assert.equal(store.has('cot_progress_v1'), false, 'obsolete wallet is never read or rewritten');

// ---- a local battle begun outside the Garage's BATTLE press (the report's Battle Again and campaign Next, the Play
// menu's solo start, the ladder) is announced like the press: soloBattleEntry's announcement, once the entry accepts the
// start (audit F2, round 4 F1), is the same ui:battleStart with the vehicle and map. Each is counted once; a quit
// (a 'garage' before any result) drops its tally. (Plan 033's battle:localBegin route, merged here in dddfb6071b, was
// left unused by that merge: this section drove an event no module emits any more.)
const before = getPlayerRecord();
bus.emit('ui:battleStart', { specId: 'leo2a6', mapId: 'verdant', gameMode: 'frontline_assault', campaignOperationId: 'op-1' });
bus.emit('phase:change', { phase: 'battle' });
bus.emit('tank:destroyed', { killerId: 'leo2a6', id: 'enemy-2' });
bus.emit('battle:ended', { result: 'victory', durationS: 60 });
bus.emit('phase:change', { phase: 'garage' });
let after = getPlayerRecord();
assert.equal(after.matches, before.matches + 1, 'a battle started from the report or the ladder is counted');
assert.equal(after.wins, before.wins + 1, 'and its win');
assert.equal(after.lastBattle.vehicleId, 'leo2a6', 'under the vehicle it was fought in');
assert.equal(after.lastBattle.mapId, 'verdant');
assert.equal(after.lastBattle.kills, 1);
// a quit: the Garage's battle in vehicle A left without a result, then the ladder's battle in vehicle B
bus.emit('ui:battleStart', { specId: 'm1a1_abrams_hc', mapId: 'desert' });
bus.emit('phase:change', { phase: 'battle' });
bus.emit('tank:destroyed', { killerId: 'm1a1_abrams_hc', id: 'enemy-3' });
bus.emit('tank:destroyed', { killerId: 'm1a1_abrams_hc', id: 'enemy-4' });
bus.emit('phase:change', { phase: 'garage' });
bus.emit('ui:battleStart', { specId: 't90m', mapId: 'urban', gameMode: 'standard', campaignOperationId: null });
bus.emit('phase:change', { phase: 'battle' });
bus.emit('tank:destroyed', { killerId: 't90m', id: 'enemy-5' });
bus.emit('battle:ended', { result: 'defeat', durationS: 30 });
bus.emit('phase:change', { phase: 'garage' });
after = getPlayerRecord();
assert.equal(after.lastBattle.vehicleId, 't90m', 'the battle after a quit is recorded under its own vehicle');
assert.equal(after.lastBattle.kills, 1, 'with its own kills only');
assert.equal(after.matches, before.matches + 2, 'the quit battle is not a match');
// one announcement, one match: a battle that ends once is recorded once, and a result after the record adds nothing
bus.emit('ui:battleStart', { specId: 'leo2a6', mapId: 'verdant' });
bus.emit('phase:change', { phase: 'battle' });
bus.emit('battle:ended', { result: 'draw', durationS: 5 });
bus.emit('battle:ended', { result: 'draw', durationS: 5 });
bus.emit('phase:change', { phase: 'garage' });
assert.equal(getPlayerRecord().matches, before.matches + 3, 'each start path counts its battle once');
// an entry that announces nothing (the __DEBUG.beginBattleEntry hook, round 4 F1) keeps no record
bus.emit('phase:change', { phase: 'battle' });
bus.emit('battle:ended', { result: 'victory', durationS: 5 });
bus.emit('phase:change', { phase: 'garage' });
assert.equal(getPlayerRecord().matches, before.matches + 3, 'an unannounced debug battle is not a match');

// the start paths announce: the Play menu, the ladder and campaign Next reach soloBattleEntry.beginSelected, whose
// accepted start runs the entry's own announcement, the announce port main.ts binds to ui:battleStart; the report's
// Battle Again replays the Garage press, which announces its own
const { readFileSync } = await import('node:fs');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('./soloBattleEntryRuntime.ts', import.meta.url), 'utf8');
assert.match(main, /function beginLocalBattle\([\s\S]{0,1200}return soloBattleEntry\.beginSelected\(/, 'the menu and ladder start through beginSelected');
assert.match(main, /bus\.on\('ui:campaignNext'[\s\S]{0,800}beginLocalBattle\(/, 'campaign Next is a ladder start');
assert.match(main, /createSoloBattleEntryRuntime\(\{[\s\S]{0,800}announce: \(payload\) => bus\.emit\('ui:battleStart', payload\),/,
  'main.ts binds the entry\'s announcement to ui:battleStart');
assert.match(entry, /beginSelected\(\{[\s\S]{0,500}return run\(selected, selectedMapId, options, announcedByEntry\(selected, selectedMapId, options\)\);/,
  'beginSelected\'s start is announced by the entry');
assert.match(main, /triggerBattle: \(\) => replayBattleEntry\(battleEntryIntent, \{\s*replay: \(entry\) => garage\.replayEntry\(entry\),/,
  'Battle Again replays the Garage press');

// (leave-no-loss-276) stored rows naming no outcome of the closed set (a later version's 'retreat', a bad import's) are
// kept as read: not shown, not counted, never read as a defeat, and saved back byte for byte in their place
const foreignLast = { result: 'retreat', kills: 4, damage: 900, vehicleId: 'future_tank', completedAt: 90, future: { field: [1, 2.5, 'x'], note: null } };
const foreignOlder = { result: 'surrendered', completedAt: 80 };
const knownRow = { result: 'victory', kills: 2, damage: 1200, vehicleId: 'leo2a6', mapId: 'amberford', durationS: 100, completedAt: 85 };
store.set('cot.profile.v2', JSON.stringify({ version: 2, matches: 7, wins: 4, losses: 3, draws: 0, kills: 20, damage: 9000, bestDamage: 3000,
  lastBattle: foreignLast, recentBattles: [foreignLast, knownRow, foreignOlder] }));
const kept = await import('./profile.ts?kept');
assert.deepEqual(kept.getRecentBattles().map((battle) => battle.completedAt), [85], 'only the readable row is shown');
assert.equal(kept.getLastBattleRecord(), null, 'a kept last battle is not shown as one');
const keptView = kept.getPlayerRecord();
assert.deepEqual([keptView.matches, keptView.wins, keptView.losses, keptView.kills, keptView.damage], [7, 4, 3, 20, 9000], 'kept rows count in no total');
assert.equal(keptView.lastBattle, null);
// the round trip: the next battle saves the profile; the kept rows are written back exactly as stored, in their places
kept.recordBattleResult({ result: 'draw', kills: 1, damage: 100, completedAt: 95 });
const resaved = JSON.parse(store.get('cot.profile.v2'));
assert.deepEqual(resaved.recentBattles.map((row) => row.completedAt), [95, 90, 85], 'the newest three, the kept row in its place');
assert.equal(JSON.stringify(resaved.recentBattles[1]), JSON.stringify(foreignLast), 'the kept row survives a load and save byte for byte');
assert.ok(store.get('cot.profile.v2').includes(JSON.stringify(foreignLast)), 'byte for byte in the stored text');
assert.deepEqual([resaved.matches, resaved.draws, resaved.losses], [8, 1, 3], 'the new draw counts; the kept rows still do not');
// loading alone rewrites nothing: the stored text is the planted text after every getter has read it
const planted = JSON.stringify({ version: 2, matches: 1, wins: 1, losses: 0, draws: 0, kills: 0, damage: 0, bestDamage: 0,
  lastBattle: foreignLast, recentBattles: [foreignLast] });
store.set('cot.profile.v2', planted);
const keptTwice = await import('./profile.ts?kept2');
keptTwice.getPlayerRecord(); keptTwice.getRecentBattles(); keptTwice.getLastBattleRecord(); keptTwice.battleOrdinalBase();
assert.equal(store.get('cot.profile.v2'), planted, 'loading alone rewrites nothing');

console.log('profile.selftest: real local match history passed; battles begun from the report or the ladder announced and counted once, a quit drops its tally');
