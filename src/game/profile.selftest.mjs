import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
};

const {
  getLastBattleRecord,
  getPlayerRecord,
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
  kills: 0, damage: 0, bestDamage: 0, lastBattle: null,
});

installBattleRecords(bus);
installBattleRecords(bus);
bus.emit('ui:battleStart', { playerId: 'player-7', specId: 'm1a2', mapId: 'desert' });
bus.emit('shell:hit', { attackerId: 'player-7', targetId: 'enemy-1', damage: 431.4 });
bus.emit('shell:hit', { attackerId: 'enemy-1', targetId: 'player-7', damage: 900 });
bus.emit('tank:destroyed', { killerId: 'player-7', id: 'enemy-1' });
bus.emit('battle:ended', { result: 'victory', durationS: 123.2 });

assert.deepEqual(getLastBattleRecord(), {
  result: 'victory', kills: 1, damage: 431, vehicleId: 'm1a2', mapId: 'desert',
  durationS: 123, completedAt: getLastBattleRecord().completedAt,
});
assert.deepEqual(getPlayerRecord(), {
  version: 2, matches: 1, wins: 1, losses: 0, draws: 0,
  kills: 1, damage: 431, bestDamage: 431, lastBattle: getLastBattleRecord(),
});

recordBattleResult({ result: 'draw', kills: 2, damage: 1000, completedAt: 42 });
recordBattleResult({ result: 'unknown', damage: -10, completedAt: 43 });
assert.deepEqual(getPlayerRecord(), {
  version: 2, matches: 3, wins: 1, losses: 1, draws: 1,
  kills: 3, damage: 1431, bestDamage: 1000, lastBattle: {
    result: 'defeat', kills: 0, damage: 0, vehicleId: '', mapId: '',
    durationS: 0, completedAt: 43,
  },
});
assert.equal(store.has('cot_progress_v1'), false, 'obsolete wallet is never read or rewritten');

console.log('profile.selftest: real local match history passed');
