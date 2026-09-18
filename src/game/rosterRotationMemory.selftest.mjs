import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGameState } from './stateCore.ts';
import { pickBattleParticipants, rememberBattleBots, spawnTanks } from './rosterState.ts';
import { getSpec } from '../vehicles/specs.ts';

// matchmaking diversity (owner 2026-09-17: "teams arent actually randomly taking tanks … far greater diversity"):
// (1) the seeded roster shuffle's battle ordinal starts from the profile's lifetime match count instead of 0 on every
// page load, so the first battle of a session is a different draw each time the record grows; (2) the era-band
// rotation remembers the bots of the last TWO battles, so a vehicle only returns when the same-era and contemporary
// catalogs are used up (diversity r2: fresh contemporaries rank ahead of recent same-era vehicles).

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

// (3) diversity r2 (2026-09-18) against the real production catalog: a next-generation player has eighteen other
// hulls of its era, so with two battles of memory the fresh contemporaries (modern) must fill the seats before any
// vehicle repeats — battle 1 all own era, battle 2 the five fresh own-era hulls then modern, battle 3 all modern, and
// battle 4 the own-era hulls of battle 1 again (out of the memory); no far era ever enters. A modern player (92 hulls)
// never needs a contemporary.
const game = createGameState();
spawnTanks(game, {});
const shared = (a, b) => a.filter((id) => b.includes(id)).length;
const eraOf = (id) => getSpec(id).era;
const play = (playerId, battles) => {
  game.recentBotSpecIds = null; game.previousBotSpecIds = null;
  const rosters = [];
  for (let b = 1; b <= battles; b++) {
    const bots = pickBattleParticipants(game, playerId, true, 100 + b).filter((entity) => entity.specId !== playerId).map((entity) => entity.specId);
    const battleMemory = rememberBattleBots(game.previousBotSpecIds, bots);
    game.recentBotSpecIds = battleMemory.recent; game.previousBotSpecIds = battleMemory.previous;
    rosters.push(bots);
  }
  return rosters;
};
const ownEra = game.allTanks.filter((entity) => entity.specId !== 'm1a3' && eraOf(entity.specId) === 'next-generation').length;
assert.ok(ownEra >= 14 && ownEra < 26, `the next-generation catalog is short of two rosters (${ownEra} other hulls)`);
const ng = play('m1a3', 4);
assert.equal(ng[0].length, 13, 'thirteen non-player seats');
assert.ok(ng[0].every((id) => eraOf(id) === 'next-generation'), 'battle 1: the own-era catalog fills every seat');
assert.equal(shared(ng[0], ng[1]), 0, 'battle 2 repeats no vehicle of battle 1');
assert.equal(ng[1].filter((id) => eraOf(id) === 'next-generation').length, ownEra - 13, 'battle 2: every fresh own-era hull leads the roster');
assert.ok(ng[1].some((id) => eraOf(id) === 'modern'), 'battle 2: fresh modern contemporaries fill the remaining seats');
assert.equal(shared(ng[1], ng[2]), 0, 'battle 3 repeats no vehicle of battle 2');
assert.ok(ng[2].every((id) => eraOf(id) === 'modern'), 'battle 3: both battles of own-era hulls are recent, so fresh contemporaries take every seat');
assert.ok(ng[3].every((id) => eraOf(id) === 'next-generation') && shared(ng[3], ng[0]) === 13, 'battle 4: the own-era hulls of battle 1 have left the two-battle memory and return');
assert.ok(ng.flat().every((id) => ['next-generation', 'modern'].includes(eraOf(id))), 'no far era enters a next-generation battle');
assert.ok(new Set(ng.flat()).size >= 36, `four battles field far more than the eighteen own-era hulls (${new Set(ng.flat()).size} distinct)`);
const modern = play('m1a2', 3);
assert.ok(modern.flat().every((id) => eraOf(id) === 'modern'), 'a modern player never needs a contemporary');
assert.equal(shared(modern[0], modern[1]) + shared(modern[1], modern[2]), 0, 'consecutive modern rosters share nothing');
console.log('rosterRotationMemory.selftest: persisted battle ordinal, two-battle rotation memory and contemporary-era rotation passed');
