// botCallsigns.selftest — the bots' callsigns moved out of hud.ts name every bot as the HUD's own nickFor did (the pool,
// the FNV-1a hash over the entity id and its vehicle's seed id, the forward probe, the numbered fallback), and a roster
// assigns them in its own order. Copyright © 2026 Kevin B. Liu.
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
  assert.equal(name, legacy(id, specId, used), `${id}: the HUD's name`);
  used.add(name);
}
assert.match(botCallsign('tank-99', 't90am', used), /^Bot_\d\d$/, 'a spent pool numbers the bot');

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

console.log('botCallsigns.selftest: the HUD\'s bot names (pool, hash, probe, fallback) and the roster\'s own order passed');
