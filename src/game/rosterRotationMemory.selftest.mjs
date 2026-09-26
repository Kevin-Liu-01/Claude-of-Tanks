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

// (3) Real-catalog diversity: fresh own-era hulls lead each draw, then fresh
// modern contemporaries fill the remaining seats before a recent hull repeats.
// The expanded IFV roster now fills two complete next-generation battles.
// Battle 4 can reuse battle 1 after it leaves the two-battle memory.
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
const productionFleet = game.allTanks;
const ownEraIds = new Set(productionFleet
  .filter((entity) => entity.specId !== 'm1a3' && eraOf(entity.specId) === 'next-generation')
  .map((entity) => entity.specId));
assert.ok(ownEraIds.size >= 13, 'the production next-generation catalog fills a complete first roster');
const ng = play('m1a3', 4);
for (const [index, roster] of ng.entries()) {
  const recent = new Set(ng.slice(Math.max(0, index - 2), index).flat());
  const freshOwnEra = [...ownEraIds].filter((id) => !recent.has(id)).length;
  const expectedOwnEra = Math.min(13, freshOwnEra);
  assert.equal(roster.length, 13, 'thirteen non-player seats');
  assert.equal(roster.filter((id) => eraOf(id) === 'next-generation').length, expectedOwnEra,
    `production battle ${index + 1}: fresh own-era hulls lead the draw`);
  assert.equal(roster.filter((id) => eraOf(id) === 'modern').length, 13 - expectedOwnEra,
    `production battle ${index + 1}: modern contemporaries fill only exhausted own-era seats`);
  assert.ok(roster.every((id) => !recent.has(id)), 'no vehicle repeats either of the previous two battles');
}
assert.ok(new Set(ng.flat()).size >= 39, 'four production battles include three complete distinct rosters');

// Keep a real-vehicle subcatalog that always exhausts within two battles.
// This exercises contemporary fallback even as the full production fleet grows.
const boundedOwnEra = new Set([...ownEraIds].slice(0, 18));
try {
  game.allTanks = productionFleet.filter((entity) => entity.specId === 'm1a3'
    || eraOf(entity.specId) !== 'next-generation' || boundedOwnEra.has(entity.specId));
  const bounded = play('m1a3', 4);
  assert.ok(bounded[0].every((id) => eraOf(id) === 'next-generation'), 'bounded battle 1 uses only its own era');
  assert.equal(bounded[1].filter((id) => eraOf(id) === 'next-generation').length, boundedOwnEra.size - 13,
    'bounded battle 2 uses the remaining fresh own-era hulls');
  assert.equal(bounded[1].filter((id) => eraOf(id) === 'modern').length, 26 - boundedOwnEra.size,
    'bounded battle 2 fills its remaining seats with fresh contemporaries');
  assert.ok(bounded[2].every((id) => eraOf(id) === 'modern'), 'bounded battle 3 exhausts its own era and uses fresh contemporaries');
  assert.equal(shared(bounded[0], bounded[1]) + shared(bounded[0], bounded[2]) + shared(bounded[1], bounded[2]), 0,
    'bounded first three battles share no hulls');
  assert.ok(bounded[3].every((id) => eraOf(id) === 'next-generation') && shared(bounded[3], bounded[0]) === 13,
    'bounded battle 4 can reuse battle 1 after it leaves the two-battle memory');
} finally {
  game.allTanks = productionFleet;
}
const modern = play('m1a2', 3);
assert.ok(modern.flat().every((id) => eraOf(id) === 'modern'), 'a modern player never needs a contemporary');
assert.equal(shared(modern[0], modern[1]) + shared(modern[1], modern[2]), 0, 'consecutive modern rosters share nothing');
console.log('rosterRotationMemory.selftest: persisted battle ordinal, two-battle rotation memory and contemporary-era rotation passed');
