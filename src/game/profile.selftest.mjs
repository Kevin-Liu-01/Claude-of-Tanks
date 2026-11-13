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
recordBattleResult({ result: 'unknown', damage: -10, completedAt: 43 });
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

// ---- (improve-271 plan 033) a local battle begun without the Garage's ui:battleStart (the report's NEXT or RETRY, the Play
// menu's ladder) is named by main.ts beginLocalBattle's battle:localBegin and still counts; a quit drops its tally
const before = getPlayerRecord();
bus.emit('battle:localBegin', { specId: 'leo2a6', mapId: 'verdant' });
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
// a quit: the Garage's battle in vehicle A left without a result, then an unannounced battle in vehicle B
bus.emit('ui:battleStart', { specId: 'm1a1_abrams_hc', mapId: 'desert' });
bus.emit('phase:change', { phase: 'battle' });
bus.emit('tank:destroyed', { killerId: 'm1a1_abrams_hc', id: 'enemy-3' });
bus.emit('tank:destroyed', { killerId: 'm1a1_abrams_hc', id: 'enemy-4' });
bus.emit('phase:change', { phase: 'garage' });
bus.emit('battle:localBegin', { specId: 't90m', mapId: 'urban' });
bus.emit('phase:change', { phase: 'battle' });
bus.emit('tank:destroyed', { killerId: 't90m', id: 'enemy-5' });
bus.emit('battle:ended', { result: 'defeat', durationS: 30 });
bus.emit('phase:change', { phase: 'garage' });
after = getPlayerRecord();
assert.equal(after.lastBattle.vehicleId, 't90m', 'the battle after a quit is recorded under its own vehicle');
assert.equal(after.lastBattle.kills, 1, 'with its own kills only');
assert.equal(after.matches, before.matches + 2, 'the quit battle is not a match');
// a phase fallback with nothing announced still counts the battle (debug and API entry), with no vehicle named
bus.emit('phase:change', { phase: 'battle' });
bus.emit('battle:ended', { result: 'draw', durationS: 5 });
bus.emit('phase:change', { phase: 'garage' });
assert.equal(getPlayerRecord().matches, before.matches + 3, 'an unannounced battle with no begin event is counted');
assert.equal(getPlayerRecord().lastBattle.vehicleId, '', 'with no vehicle named');

const { readFileSync } = await import('node:fs');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(main, /function beginLocalBattle\([\s\S]{0,1200}bus\.emit\('battle:localBegin', \{ specId, mapId: operation\?\.mapId \?\? mapId \}\);[\s\S]{0,80}soloBattleEntry\.beginSelected\(/,
  'main.ts names every local battle it begins to the profile');

console.log('profile.selftest: real local match history passed; battles begun from the report or the ladder counted, a quit drops its tally');
