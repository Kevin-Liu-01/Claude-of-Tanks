// The crew's line tables (crew-lines-269): every mode names its crew calls, every call they name is a scripted line with
// radio discipline, the team counts follow the network seat's rule (deathsAreFinal) in every mode, and the resolver turns
// a tank crew's line into the mode's and the AC-130 crew's own.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_MODE_IDS } from '../sim/gameModeCatalog.ts';
import { deathsAreFinal, matchRulesetFor } from '../sim/matchRuleset.ts';
import { GUNSHIP_CREW, MODE_CREW, VOICE_LINES, resolveCrewLine } from './voiceLines.ts';

const script = JSON.parse(readFileSync(new URL('../../tools/audio/crew-lines.json', import.meta.url), 'utf8'));
const scripted = new Set(script.lines.map((line) => line.id));
assert.deepEqual(Object.keys(VOICE_LINES).sort(), [...scripted].sort(), 'every scripted line has its radio discipline, and only those');

assert.deepEqual(Object.keys(MODE_CREW).sort(), [...GAME_MODE_IDS].sort(), 'every mode names its crew calls');
const named = [];
for (const crew of Object.values(MODE_CREW)) {
  for (const table of [crew.swap, crew.hunter ?? {}, crew.turned ?? {}]) for (const [from, to] of Object.entries(table)) named.push(from, to);
  for (const byReason of Object.values(crew.results ?? {})) named.push(...Object.values(byReason));
}
for (const [from, to] of Object.entries(GUNSHIP_CREW)) named.push(from, to);
for (const id of named) if (id != null) assert.ok(scripted.has(id), `${id} is a scripted line`);

const context = (mode, extra = {}) => ({ mode, seat: 'tank', juggernaut: null, turned: false, kickoff: false, endReason: null, ...extra });
// The team counts: said where a death is final, as a network seat counts them; Infected's last survivor is its own call.
for (const mode of GAME_MODE_IDS) {
  const final = deathsAreFinal(matchRulesetFor(mode));
  for (const id of ['last_enemy', 'outnumbered']) {
    assert.equal(resolveCrewLine(id, context(mode)) === id, final, `${mode}: ${id} ${final ? 'said' : 'not said'} (deaths ${final ? '' : 'not '}final)`);
  }
  const last = resolveCrewLine('last_tank', context(mode));
  assert.ok(mode === 'infected' ? last === 'last_survivor' : (last === 'last_tank') === final, `${mode}: last tank -> ${last}`);
}
// Each mode's opening; the standard battle and Realistic keep the plain one.
assert.equal(resolveCrewLine('battle_start', context('standard')), 'battle_start');
assert.equal(resolveCrewLine('battle_start', context('realistic')), 'battle_start');
for (const mode of GAME_MODE_IDS.filter((m) => !['standard', 'realistic', 'ac130'].includes(m))) {
  assert.notEqual(resolveCrewLine('battle_start', context(mode)), 'battle_start', `${mode} opens with its own call`);
}
assert.equal(resolveCrewLine('battle_start', context('juggernaut', { juggernaut: 'hunter' })), 'start_hunt');
assert.equal(resolveCrewLine('battle_start', context('juggernaut', { juggernaut: 'boss' })), 'start_juggernaut');
// The AC-130 crew: its own calls, and none for a tank's driving; a tank under the gunship keeps the tank crew's.
const gunship = (id, extra) => resolveCrewLine(id, context('ac130', { seat: 'gunship', ...extra }));
assert.equal(gunship('battle_start'), 'gunship_cleared_hot');
assert.equal(resolveCrewLine('battle_start', context('ac130')), 'battle_start');
assert.equal(gunship('target_destroyed'), 'gunship_kill');
assert.equal(gunship('miss'), 'gunship_splash');
assert.equal(gunship('victory'), 'gunship_victory');
for (const id of ['on_the_move', 'reversing', 'jump_brace', 'crew_ready', 'last_tank']) assert.equal(gunship(id), null, `the gunship never says ${id}`);
// Results by the ending's reason, for the side that earned them.
assert.equal(resolveCrewLine('victory', context('frontline_assault', { endReason: 'line_held' })), 'victory_assault');
assert.equal(resolveCrewLine('defeat', context('frontline_assault', { endReason: 'time_limit' })), 'defeat');
assert.equal(resolveCrewLine('victory', context('juggernaut', { endReason: 'juggernaut_destroyed', juggernaut: 'hunter' })), 'juggernaut_down');
assert.equal(resolveCrewLine('defeat', context('juggernaut', { endReason: 'juggernaut_destroyed', juggernaut: 'boss' })), 'defeat');
assert.equal(resolveCrewLine('defeat', context('endless_horde', { endReason: 'horde_overrun' })), 'defeat_overrun');
// A kick-off is not a respawn; a turned crew has no survivors' count.
assert.equal(resolveCrewLine('respawn', context('turbo_ball', { kickoff: true })), null);
assert.equal(resolveCrewLine('respawn', context('turbo_ball')), 'respawn');
assert.equal(resolveCrewLine('last_tank', context('infected', { turned: true })), null);

console.log(`voiceLines.selftest: ${GAME_MODE_IDS.length} modes name their crew calls, ${named.length / 2 | 0} swaps name scripted lines, team counts follow deathsAreFinal, the AC-130 crew speaks its own passed`);
