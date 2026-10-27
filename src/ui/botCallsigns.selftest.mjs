// botCallsigns.selftest — the bots' callsigns moved out of hud.ts name every bot as the HUD's own nickFor did (the pool,
// the FNV-1a hash over the entity id and its vehicle's seed id, the forward probe) while the first 24 last; past them the
// rest of the 72 and only then a numbered name, never one twice; a roster assigns them in its own order. The largest
// fields (a 21 v 21 sortie, a 32 v 32 room) never fall back to Bot_N (Main 2026-10-26). Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { botCallsign, hashCallsign, PLAYER_CALLSIGN, rosterCallsigns } from './botCallsigns.ts';
import { tankSeedId } from '../vehicles/tankIdAliases.ts';

// hud.ts nickFor before the move (2026-10-23), verbatim in its arithmetic
const LEGACY = ['IronMaus', 'SteppeWolf_71', 'Kranvagn', 'DustDevil', 'Bogatyr', 'HullDown_Hank', 'PzKpfwPete', 'Kettenkrad',
  'RicochetRita', 'TokTokkie', 'GeneralLee42', 'Zaseka', 'MudCrawler', 'BiaTheBear', 'SabotSally', 'Feldwebel_K',
  'OldNikolai', 'TinCanAlly', 'GrilleGuy', 'VodkaVanya', 'CamoNet', 'LongStop', 'DerbyDozer', 'PakWagen'];
const legacy = (id, specId, used) => {
  const i = hashCallsign(String(id) + (specId ? tankSeedId(specId) : '')) % LEGACY.length;
  for (let n = 0; n < LEGACY.length; n++) if (!used.has(LEGACY[(i + n) % LEGACY.length])) return LEGACY[(i + n) % LEGACY.length];
  return `Bot_${(hashCallsign(String(id)) % 90) + 10}`;
};
const specs = ['t90am', 'leo2a4_v', 'm1a1_abrams_hc', 'leclerc_s2', null];
const used = new Set();
for (let i = 0; i < 30; i++) {
  const id = `tank-${i}`, specId = specs[i % specs.length];
  const name = botCallsign(id, specId, used);
  // (the first 24 as the HUD named them; past them the pool's rest, never a number)
  if (i < 24) assert.equal(name, legacy(id, specId, used), `${id}: the HUD's name`);
  else assert.ok(!LEGACY.includes(name) && !/^Bot_/.test(name), `${id}: the pool's rest past the first 24 (${name})`);
  used.add(name);
}

// the largest fields: a 21 v 21 sortie's 41 bots and a 32 v 32 room's 63 (room bot ids, roomBots.ts), each a name of its
// own and none numbered, the same names on every call (the HUD and the load card ask apart)
const field = (n, idOf) => Array.from({ length: n }, (_, i) => ({ id: idOf(i), specId: specs[i % specs.length] }));
for (const [label, tanks] of [
  ['21 v 21 sortie', [{ id: 'player', specId: 'm1a1_abrams_hc', isPlayer: true }, ...field(41, (i) => `bot-${i + 1}`)]],
  ['32 v 32 room', field(63, (i) => (i < 31 ? `bot-alpha-${i + 2}` : `bot-bravo-${i - 30}`))],
]) {
  const names = rosterCallsigns(tanks), again = rosterCallsigns(tanks);
  const bots = tanks.filter((tank) => !tank.isPlayer).length;
  assert.equal(names.size, bots, `${label}: every bot named`);
  assert.equal(new Set(names.values()).size, bots, `${label}: no name twice`);
  assert.deepEqual([...names.values()].filter((name) => /^Bot_/.test(name)), [], `${label}: no numbered fallback`);
  assert.deepEqual([...again], [...names], `${label}: the same names on every call`);
}
// past all 72: numbered, the first number free, still never twice
const crowd = rosterCallsigns(field(100, (i) => `crowd-${i}`));
assert.equal(new Set(crowd.values()).size, 100, 'a field past the pool: no name twice');
assert.equal([...crowd.values()].filter((name) => /^Bot_\d+$/.test(name)).length, 28, 'a field past the pool: 28 numbered');

// a roster: its own order, display names and the player keep theirs and take none from the pool
const tanks = [
  { id: 'a', specId: 't90am' }, { id: 'me', specId: 'm1a1_abrams_hc', isPlayer: true },
  { id: 'b', specId: 't90am', displayName: 'Kestrel' }, { id: 'c', specId: 'leo2a4_v' }, { id: 'a', specId: 't90am' },
];
const named = rosterCallsigns(tanks);
assert.deepEqual([...named.keys()], ['a', 'c'], 'bots only, each once');
const walk = new Set();
for (const tank of [tanks[0], tanks[3]]) { const name = legacy(tank.id, tank.specId, walk); assert.equal(named.get(tank.id), name); walk.add(name); }
assert.equal(PLAYER_CALLSIGN, 'Claude');

console.log('botCallsigns.selftest: the HUD\'s bot names for the first 24, the pool\'s rest to 72, a unique numbered fallback past it, no Bot_N or name twice in a 21 v 21 sortie or a 32 v 32 room, and the roster\'s own order passed');
