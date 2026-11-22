// endScreenModes.selftest.mjs — (endscreen-modes-275; the owner's Air Support report: a plane glyph for his vehicle, tank
// tiles on a gunship, "Leopard 2A4 V  Leopard 2A4 V" and "AC-130  AC-130" rows, "destroyed you with CL3143") the end
// screen per mode. Part 1 checks the descriptor table (endScreenModes.ts): every mode has a view, its figures have words
// and the gunship's record holds no tank figure. Part 2 replays battles through the real bookkeeper and report
// (shotInfo.ts -> endScreen.ts) over the recording DOM and reads the rows, the tiles and the final blow.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { created, StubElement } from './hudDomHarness.test-support.mjs';
import '../vehicles/fleetRegistration.ts';
import { GAME_MODE_IDS } from '../sim/gameModeCatalog.ts';
import { matchRulesetFor } from '../sim/matchRuleset.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createBus } from '../game/stateCore.ts';
import { createShotInfo } from './shotInfo.ts';
import { rosterCallsigns } from './botCallsigns.ts';
import { killSourceIdentity } from './killSourceIdentity.ts';
import { END_SCREEN_MODES, OUTCOME_REASONS, endScreenModeView, endStatValue, headlineScore } from './endScreenModes.ts';
import { modeEndReport } from '../sim/modeEndReport.ts';

const source = readFileSync(new URL('./endScreen.ts', import.meta.url), 'utf8');
const catalog = (locale) => JSON.parse(readFileSync(new URL(`./i18nCatalog.${locale}.json`, import.meta.url), 'utf8'));
const en = catalog('en-US'), zh = catalog('zh-CN');

// ---- part 1: the descriptor ------------------------------------------------------------------------------------------
const statText = /const STAT_TEXT[^=]*= Object\.freeze\(\{([\s\S]*?)\n\}\);/.exec(source)?.[1] ?? '';
const statIds = new Set([...statText.matchAll(/^\s*(\w+): \{ label: '([^']+)'(?:, short: '([^']+)')?/gm)].map((m) => m[1]));
const statKeys = [...statText.matchAll(/'(endScreen\.[\w.]+|garage\.record\.\w+)'/g)].map((m) => m[1]);
assert.ok(statIds.size >= 20, `the renderer's STAT_TEXT table parses (${statIds.size})`);
for (const mode of GAME_MODE_IDS) {
  const view = END_SCREEN_MODES[mode];
  assert.ok(view, `${mode}: the descriptor names the mode`);
  assert.ok(view.tiles.length >= 4 && view.tiles.length <= 6, `${mode}: four to six tiles (${view.tiles.length})`);
  for (const id of [...view.tiles, ...view.details]) assert.ok(statIds.has(id), `${mode}: ${id} has its words and glyph`);
  assert.equal(new Set([...view.tiles, ...view.details]).size, view.tiles.length + view.details.length, `${mode}: no figure twice`);
  assert.ok(view.columns.includes('kills') && view.columns.includes('damage'), `${mode}: the rosters keep kills and damage`);
  if (view.columns.includes('objective')) assert.ok(view.objective, `${mode}: an objective column says what it counts`);
  // a mode scored by its own score heads with it (the HUD's score bar)
  const ruleset = matchRulesetFor(mode);
  if (view.headline === 'mode') assert.ok(ruleset, `${mode}: a scored mode has a ruleset`);
}
for (const key of statKeys) {
  assert.ok(typeof en[key] === 'string', `en-US carries ${key}`);
  assert.ok(typeof zh[key] === 'string', `zh-CN carries ${key}`);
}
for (const [reason, results] of Object.entries(OUTCOME_REASONS)) for (const result of results) {
  const key = `endScreen.outcome.${reason}.${result}`;
  assert.ok(en[key] && zh[key], `the ${reason} ${result} line in en-US and zh-CN`);
}
for (const key of ['endScreen.role.juggernaut', 'endScreen.role.hunter', 'endScreen.role.survivor', 'endScreen.role.infected',
  'endScreen.class.gunship', 'endScreen.beat.downed']) assert.ok(en[key] && zh[key], `${key} in en-US and zh-CN`);
// the AC-130's pilot: no armour blocks a round, nothing is spotted from the orbit, splash makes "on target" meaningless
const gunship = END_SCREEN_MODES.ac130;
assert.equal(gunship.vehicle, 'aircraft');
for (const tankOnly of ['blocked', 'spotted', 'accuracy', 'assist']) {
  assert.ok(!gunship.tiles.includes(tankOnly) && !gunship.details.includes(tankOnly), `the gunship's record shows no ${tankOnly}`);
}
assert.ok(gunship.tiles.includes('rescued'), 'it counts the troops it brought out');
assert.ok(END_SCREEN_MODES.air_support.tiles.includes('callIns'), "Air Support's record counts the call-ins");
assert.equal(END_SCREEN_MODES.standard.tiles.join(), 'dealt,kills,accuracy,spotted,assist,blocked', "a standard battle's six stand");
assert.ok(!endScreenModeView('capture_the_flag', false).columns.includes('deaths'), 'no deaths column outside a reviving battle');
assert.ok(endScreenModeView('capture_the_flag', true).columns.includes('deaths'));
assert.equal(endScreenModeView('nonsense').tiles.join(), END_SCREEN_MODES.standard.tiles.join(), 'an unknown mode reads as standard');
// a tile with no data behind it is left out, never a made-up zero
const words = { juggernaut: 'J', hunter: 'H', survivor: 'S', infected: 'I' };
const bare = { killCount: 0, stats: { dealt: 0, received: 0, blocked: 0, fired: 0, hits: 0, pens: 0, assist: 0 } };
assert.equal(endStatValue('rescued', bare, words), null);
assert.equal(endStatValue('wave', bare, words), null);
assert.equal(endStatValue('spotted', { ...bare, stats: { ...bare.stats, spotAttributed: false } }, words), null);
// the report of the mode state copies the HUD's figures, from the viewer's side
const report = modeEndReport({ id: 'capture_the_flag', perspectiveTeam: 'bravo', score: { alpha: 1, bravo: 3 }, target: 3 }, 'me');
assert.deepEqual(headlineScore(END_SCREEN_MODES.capture_the_flag, report, { own: 9, enemy: 9 }), { own: 3, enemy: 1, mode: true });
assert.deepEqual(headlineScore(END_SCREEN_MODES.standard, report, { own: 9, enemy: 4 }), { own: 9, enemy: 4, mode: false });
assert.equal(modeEndReport({ id: 'standard', perspectiveTeam: 'alpha', score: { alpha: 2, bravo: 1 } }, 'me').score, null,
  'a battle scored by kills carries no mode score');
assert.deepEqual(modeEndReport({ id: 'gun_game', perspectiveTeam: 'alpha', score: { alpha: 0, bravo: 0 },
  weaponStage: { index: 4, total: 5, kills: 0, required: 2, name: 'x' } }, 'me').weaponStage, { index: 5, total: 5 }, 'the ladder 1-based');

// ---- part 2: battles through the real bookkeeper and report -----------------------------------------------------------
const ALLIES = ['m1a1_abrams_hc', 'leo2a4_v', 'type90'], FOES = ['c1_ariete_proto_serie1', 't90am', 't72b3'];
async function battle({ mode, pilot = false, script = () => {}, ended = {} }) {
  created.length = 0;
  const bus = createBus();
  const shot = createShotInfo(bus, new StubElement('div'));
  const team = (id) => (id.startsWith('foe') ? 'enemy' : 'player');
  shot.setTeamResolver(team);
  shot.setPlayer('me', 0, 'alpha');
  const ids = ['me', 'ally-0', 'ally-1', 'foe-0', 'foe-1', 'foe-2'];
  const specOf = (id) => (id === 'me' ? ALLIES[0] : id.startsWith('ally') ? ALLIES[1 + Number(id.slice(5))] : FOES[Number(id.slice(4))]);
  const hit = (attacker, target, damage, extra = {}) => bus.emit('shell:hit', {
    shellId: Math.random(), kind: 'pen', attackerId: attacker, attackerSpecId: specOf(attacker), targetId: target,
    targetSpecId: specOf(target), damage, shellType: 'APFSDS', shellName: 'CL3143 APFSDS', timeS: 60, ...extra });
  const kill = (attacker, target, extra = {}) => {
    hit(attacker, target, 1500, { destroyed: true, ...extra });
    bus.emit('tank:destroyed', { id: target, killerId: attacker, specId: specOf(target), cause: 'shot', source: extra.attackerSource ?? null });
  };
  script({ bus, hit, kill });
  const dead = new Set();
  bus.emit('battle:ended', { result: 'victory', reason: 'elimination', gameMode: mode, timeS: 300, ...ended,
    roster: ids.map((id) => ({ id, specId: specOf(id), vehicle: getSpec(specOf(id)).name, team: team(id), alive: !dead.has(id),
      isPlayer: id === 'me', ...(pilot && id === 'me' ? { aircraft: true } : {}) })) });
  await new Promise((resolve) => setTimeout(resolve, 900));
  const host = created.find((element) => element.classes.has('cot-es'));
  const rows = created.filter((element) => element.classes.has('es-tr')).map((row) => ({
    name: /class="nmt">([^<]*)/.exec(row.innerHTML)?.[1], vehicle: /class="vt(?: lat)?">([^<]*)/.exec(row.innerHTML)?.[1],
    nation: /class="fl" data-nation="([^"]*)"/.exec(row.innerHTML)?.[1] ?? null, html: row.innerHTML }));
  const tiles = created.filter((element) => element.classes.has('es-tal')).map((tile) => tile.dataset.stat);
  const blow = created.find((element) => element.classes.has('es-blow'))?.innerHTML.replace(/<svg[\s\S]*?<\/svg>/g, '') ?? '';
  return { host, rows, tiles, blow, ids, specOf };
}

// Air Support: the crew called the AC-130's orbit and its rounds killed; the crew still drove its tank
{
  const r = await battle({ mode: 'air_support', script: ({ bus, kill }) => {
    for (const [i, kind] of ['recon', 'gunship'].entries()) bus.emit('mode:strike_called', { strikeId: i, kind, team: 'alpha', callerId: 'me' });
    kill('me', 'foe-1', { attackerSource: 'ac130', shellName: '152 mm Howitzer', shellType: 'HE' });
    kill('me', 'foe-2');
    bus.emit('mode:aircraft_down', { strikeId: 9, kind: 'strafe', team: 'bravo', by: 'me' });
    bus.emit('mode:zone_captured', { zoneId: 'zone-1', team: 'alpha' });
  }, ended: { reason: 'score_limit', modeReport: { id: 'air_support', perspectiveTeam: 'alpha', score: { alpha: 1000, bravo: 640 }, target: 1000 } } });
  const me = r.rows.find((row) => row.html.includes('class="you"'));
  assert.equal(me.name, 'Claude', 'the player is the HUD\'s callsign');
  assert.equal(me.vehicle, getSpec('m1a1_abrams_hc').name, "a call-in's rounds never make the crew the AC-130");
  assert.ok(!me.html.includes('modeAc130'), 'and its row draws no gunship');
  assert.equal(r.host.dataset.callIns, '2', 'the call-ins tile counts the player\'s calls');
  assert.equal(r.host.dataset.strikeKills, '1', 'the gunship orbit\'s kill counts as a call-in kill');
  assert.equal(r.host.dataset.aircraftDown, '1');
  assert.equal(r.host.dataset.zones, '1', "the zones tile counts the side's captures");
  assert.equal(r.host.dataset.scoreKind, 'mode', 'the headline is the mode\'s score');
  assert.deepEqual(r.tiles, ['zones', 'kills', 'callIns', 'strikeKills', 'aircraftDown', 'dealt']);
  // no row repeats its name as its vehicle; the bots carry the HUD's callsigns
  const calls = rosterCallsigns(r.ids.map((id) => ({ id, specId: r.specOf(id), isPlayer: id === 'me' })));
  for (const row of r.rows) {
    assert.notEqual(row.name, row.vehicle, `no row reads its vehicle twice (${row.name})`);
    if (!row.html.includes('class="you"')) assert.ok([...calls.values()].includes(row.name), `${row.name} is a HUD callsign`);
    assert.ok(row.nation, `${row.name}'s row flies a flag`);
  }
}

// AC-130: the pilot's row flies the gunship under its nation's flag, its record counts the troops and rounds
{
  const r = await battle({ mode: 'ac130', pilot: true, script: ({ kill }) => {
    kill('me', 'foe-0', { attackerSource: 'ac130', shellName: '30 mm Autocannon', shellType: 'AP' });
  }, ended: { reason: 'escort_extracted', modeReport: { id: 'ac130', perspectiveTeam: 'alpha', score: null, target: null,
    escort: { total: 6, rescued: 4, required: 3, alive: 4 } } } });
  const me = r.rows.find((row) => row.html.includes('class="you"'));
  const ac130 = killSourceIdentity('ac130').label;
  assert.equal(me.name, 'Claude', "the pilot's row keeps the pilot's name");
  assert.equal(me.vehicle, ac130, 'its vehicle is the AC-130');
  assert.equal(me.nation, 'USA', 'under its nation\'s flag');
  assert.ok(me.html.includes('class="vc air"'), 'with the gunship role glyph');
  assert.deepEqual(r.tiles, ['rescued', 'troopsLost', 'kills', 'dealt', 'fired', 'modules']);
  assert.equal(r.host.dataset.troopsLost, '0');
  assert.ok(!r.tiles.includes('blocked') && !r.tiles.includes('accuracy'), 'no tank figure on the gunship\'s record');
}

// Capture the Flag: the flags lead, each row's own flags in its column, the score is the flags'; the final blow names
// the weapon whole
{
  const r = await battle({ mode: 'capture_the_flag', script: ({ bus, kill }) => {
    bus.emit('mode:flag_captured', { team: 'alpha', by: 'me' });
    bus.emit('mode:flag_captured', { team: 'alpha', by: 'ally-0' });
    bus.emit('mode:flag_returned', { team: 'alpha', by: 'me' });
    bus.emit('mode:respawn', { id: 'ally-1', team: 'alpha' });
    kill('foe-0', 'ally-1');
  }, ended: { reason: 'flag_limit', modeReport: { id: 'capture_the_flag', perspectiveTeam: 'alpha', score: { alpha: 3, bravo: 1 }, target: 3 } } });
  assert.equal(r.tiles[0], 'flags');
  assert.equal(r.host.dataset.flags, '1');
  assert.equal(r.host.dataset.objective, '1', 'the rosters carry the flags column');
  const me = r.rows.find((row) => row.html.includes('class="you"'));
  assert.match(me.html, /class="oc num"[^>]*>1</, "the player's row counts its flag");
  assert.match(r.blow, /with 120 mm CL3143 APFSDS/, `the final blow names the weapon whole (${r.blow})`);
  assert.ok(!/with CL3143</.test(r.blow), 'never the bare designation');
}

// a standard battle keeps its six
{
  const r = await battle({ mode: 'standard', script: ({ bus, kill }) => {
    bus.emit('tank:spotted', { id: 'foe-0', team: 'enemy', spotterId: 'me', timeS: 20 });
    kill('me', 'foe-0');
  } });
  assert.deepEqual(r.tiles, ['dealt', 'kills', 'accuracy', 'spotted', 'assist', 'blocked']);
  assert.equal(r.host.dataset.scoreKind, 'kills');
}

console.log(`endScreenModes.selftest: ${GAME_MODE_IDS.length} modes described; Air Support, AC-130, CTF and standard reports through the real bookkeeper (callsigns, the gunship's own record, the mode score, the weapon by name) PASS`);
