import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rememberBattleBots } from './rosterState.ts';

// matchmaking diversity (owner 2026-09-17: "teams arent actually randomly taking tanks … far greater diversity"):
// (1) the seeded roster shuffle's battle ordinal starts from the profile's lifetime match count instead of 0 on every
// page load, so the first battle of a session is a different draw each time the record grows; (2) the era-band
// rotation remembers the bots of the last TWO battles, so a vehicle only returns when the same-era catalog is used up.

// (1) the app entry seeds the ordinal right after the game state exists, from the profile module
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const created = main.indexOf('const game: MainGameState = createGameState<');
const seeded = main.indexOf('game.battleCount = battleOrdinalBase();');
assert.ok(created > 0 && seeded > created && seeded - created < 400, 'the battle ordinal is seeded from the profile immediately after the game state is created');
assert.match(main, /import \{ battleOrdinalBase, installBattleRecords \} from '\.\/game\/profile\.ts';/);

// the profile base reads the persisted record and falls back to 0 without storage
globalThis.localStorage = {
  store: new Map([['cot.profile.v2', JSON.stringify({ version: 2, matches: 37, wins: 20, losses: 15, draws: 2, kills: 90, damage: 100000, bestDamage: 6000, lastBattle: null })]]),
  getItem(key) { return this.store.get(key) ?? null; },
  setItem(key, value) { this.store.set(key, value); },
  removeItem(key) { this.store.delete(key); },
};
const { battleOrdinalBase, getPlayerRecord } = await import('./profile.ts');
assert.equal(battleOrdinalBase(), 37, 'the ordinal base is the persisted lifetime match count');
assert.equal(getPlayerRecord().matches, 37);

// (2) two battles of rotation memory
let memory = rememberBattleBots(null, ['t90m', 'leo2a6', 'm1a2']);
assert.deepEqual([...memory.recent].sort(), ['leo2a6', 'm1a2', 't90m'], 'first battle: its own bots are recent');
assert.deepEqual([...memory.previous].sort(), ['leo2a6', 'm1a2', 't90m']);
memory = rememberBattleBots(memory.previous, ['k2', 'type10', 'm1a2']);
assert.deepEqual([...memory.recent].sort(), ['k2', 'leo2a6', 'm1a2', 't90m', 'type10'], 'second battle: both battles\' bots are recent');
assert.deepEqual([...memory.previous].sort(), ['k2', 'm1a2', 'type10'], 'only the latest battle carries forward');
memory = rememberBattleBots(memory.previous, ['challenger_3']);
assert.deepEqual([...memory.recent].sort(), ['challenger_3', 'k2', 'm1a2', 'type10'], 'the battle before last has dropped out of the memory');
console.log('rosterRotationMemory.selftest: persisted battle ordinal and two-battle rotation memory passed');
