// Composed modes (combined-arms-276; owner 2026-11-23: "lets add a mode with drone AND air support"). Copyright © 2026
// Kevin B. Liu (NOTICE.md).
//
// A mode built from rule parts (matchRuleset.ts COMPOSED_MODES: Combined Arms is Air Support's battle plus Drone's
// launch) is the composition of the modes it draws on, never a third fork of their rules:
// 1. every field of the composed ruleset is a part's, the very object or value (a redefined field fails), or the plain
//    battle's (Air Support's own fields outside its part, which are STANDARD's), and its id;
// 2. the donor modes spread the same parts: Drone's ruleset holds the launch part's values and Air Support's the battle
//    part's, so a rule they share with the composed mode comes from one declaration;
// 3. matchRuleset.ts declares the composed mode as its parts alone, and no ruleset row spells a part's field itself;
// 4. no reader outside the catalog and the ruleset asks a part's mode by its id (`mode === 'air_support'`): it reads the
//    part's facet (modeLaunchesDrones, modeCallsAirSupport, modePlaysSectors), so a composed mode reaches every reader.
//    The few id checks that are about a mode's own battle, not a part, are listed below with their reasons.
// Each check runs on the real tables (no problem) and on a planted copy that breaks it (a problem): the negative controls.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPOSED_MODES, MODE_RULE_PARTS, matchRulesetFor, modeCallsAirSupport, modeLaunchesDrones, modePlaysSectors } from './matchRuleset.ts';
import { BATTLE_MODE_IDS, GAME_MODE_DEFINITIONS, MODE_PRESENTATION_ORDER } from './gameModeCatalog.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RULESET_SOURCE = readFileSync(join(ROOT, 'src/sim/matchRuleset.ts'), 'utf8');

/** The donor mode of each part: the mode that plays the part alone, whose other fields are the plain battle's. */
const DONORS = Object.freeze({ droneLaunch: 'drone', airSupportBattle: 'air_support' });
/** The mode whose fields outside its part are STANDARD's (Air Support is STANDARD plus its battle part). */
const PLAIN = 'air_support';

/** Checks 1 and 2 over `rulesets` (mode -> ruleset), `parts` (name -> part) and `composed` (mode -> part names). */
function rulesetProblems(rulesets, parts, composed) {
  const problems = [];
  for (const [name, mode] of Object.entries(DONORS)) {
    for (const [field, value] of Object.entries(parts[name])) {
      if (rulesets[mode][field] !== value) problems.push(`${mode}.${field} is not the ${name} part's (redefined in the donor)`);
    }
  }
  const plainFields = new Set(Object.keys(parts.airSupportBattle));
  for (const [mode, names] of Object.entries(composed)) {
    const ruleset = rulesets[mode];
    if (ruleset.mode !== mode) problems.push(`${mode}: its ruleset names ${ruleset.mode}`);
    const owner = new Map();
    for (const name of names) for (const field of Object.keys(parts[name])) owner.set(field, name);
    for (const field of new Set([...Object.keys(ruleset), ...Object.keys(rulesets[PLAIN])])) {
      if (field === 'mode') continue;
      const name = owner.get(field);
      if (name) {
        if (ruleset[field] !== parts[name][field]) problems.push(`${mode}.${field} redefines the ${name} part's`);
      } else if (!plainFields.has(field) && ruleset[field] !== rulesets[PLAIN][field]) {
        problems.push(`${mode}.${field} is neither a part's nor the plain battle's`);
      }
    }
  }
  return problems;
}

/** The BASE_RULESETS row of `mode` in matchRuleset.ts's source (its text up to the next row). */
function rowOf(source, mode) {
  const table = source.slice(source.indexOf('const BASE_RULESETS'));
  const start = table.search(new RegExp(`\\n  ${mode}: `));
  if (start < 0) return null;
  const rest = table.slice(start + 1);
  const next = rest.slice(2).search(/\n  (?:\/\/ |[a-z_0-9]+: )/);
  return next < 0 ? rest : rest.slice(0, next + 2);
}

/** The fields only a part sets, as a row would spell them: Drone's launch and counter-drone, Air Support's ledger. */
const FACETS = [['aerial', /\baerial: 'drone'/g], ['counterDrone', /\bcounterDrone: /g], ['airSupport', /\bairSupport: /g]];
/** Check 3 over matchRuleset.ts's `source`. */
function sourceProblems(source, parts, composed) {
  const problems = [];
  const spreads = { droneLaunch: '...DRONE_LAUNCH_PART', airSupportBattle: '...AIR_SUPPORT_BATTLE_PART' };
  for (const [name, mode] of Object.entries(DONORS)) {
    const row = rowOf(source, mode);
    if (!row?.includes(spreads[name])) problems.push(`${mode}'s row does not spread ${spreads[name].slice(3)}`);
  }
  for (const mode of Object.keys(composed)) {
    const row = rowOf(source, mode);
    if (!row || !new RegExp(`^  ${mode}: composedRuleset\\('${mode}'\\),\\s*$`).test(row.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n'))) {
      problems.push(`${mode}'s row is not composedRuleset('${mode}') alone`);
    }
  }
  // (a part's identifying facets: the fields only its part sets. respawnS or timeLimitS are every mode's own)
  const table = source.slice(source.indexOf('const BASE_RULESETS'));
  const body = table.slice(0, table.indexOf('\n});') + 4);
  for (const [field, spelled] of FACETS) {
    for (const match of body.matchAll(spelled)) {
      const line = body.slice(body.lastIndexOf('\n', match.index) + 1, body.indexOf('\n', match.index));
      if (line.trim().startsWith('//')) continue;
      problems.push(`a ruleset row spells the part field ${field} itself: ${line.trim().slice(0, 100)}`);
    }
  }
  return problems;
}

// ---- 1-3 on the real tables
const rulesets = Object.fromEntries(BATTLE_MODE_IDS.map((mode) => [mode, matchRulesetFor(mode)]));
assert.deepEqual(rulesetProblems(rulesets, MODE_RULE_PARTS, COMPOSED_MODES), [], 'every composed field is a part\'s or the plain battle\'s');
assert.deepEqual(sourceProblems(RULESET_SOURCE, MODE_RULE_PARTS, COMPOSED_MODES), [], 'the composed mode is declared as its parts');
assert.deepEqual(Object.keys(COMPOSED_MODES), ['combined_arms'], 'Combined Arms is the one composed mode');
assert.deepEqual([...COMPOSED_MODES.combined_arms], ['airSupportBattle', 'droneLaunch'], 'Combined Arms: Air Support\'s battle and Drone\'s launch');
const arms = rulesets.combined_arms;
assert.equal(arms.airSupport, rulesets.air_support.airSupport, 'one support ledger and call-in table for both modes');
assert.equal(arms.aerial, 'drone', 'every crew launches a drone');
assert.equal(arms.counterDrone, true, 'the roof stations engage drones');
assert.equal(arms.scoreTarget ?? null, null, 'the drone\'s 20-kill race is Drone\'s battle, not its launch part');

// ---- the negative controls: each planted break is found
const redefined = { ...rulesets, combined_arms: { ...arms, respawnS: 5 } };
assert.ok(rulesetProblems(redefined, MODE_RULE_PARTS, COMPOSED_MODES).some((p) => p.includes('combined_arms.respawnS redefines')),
  'control: a part field redefined in the composed mode fails');
const copiedLedger = { ...rulesets, combined_arms: { ...arms, airSupport: { ...arms.airSupport } } };
assert.ok(rulesetProblems(copiedLedger, MODE_RULE_PARTS, COMPOSED_MODES).some((p) => p.includes('combined_arms.airSupport')),
  'control: a copy of the ledger, equal but not the part\'s, fails');
const forked = { ...rulesets, combined_arms: { ...arms, hpScale: 2 } };
assert.ok(rulesetProblems(forked, MODE_RULE_PARTS, COMPOSED_MODES).some((p) => p.includes('combined_arms.hpScale is neither')),
  'control: a rule of the composed mode\'s own fails');
const droneDrift = { ...rulesets, drone: { ...rulesets.drone, counterDrone: false } };
assert.ok(rulesetProblems(droneDrift, MODE_RULE_PARTS, COMPOSED_MODES).some((p) => p.includes('drone.counterDrone')),
  'control: a donor drifting from its part fails');
const literalRow = RULESET_SOURCE.replace("  combined_arms: composedRuleset('combined_arms'),",
  "  combined_arms: Object.freeze({ ...STANDARD, mode: 'combined_arms', aerial: 'drone', counterDrone: true, respawnS: 8, timeLimitS: 720, airSupport: AIR_SUPPORT_RULES }),");
assert.notEqual(literalRow, RULESET_SOURCE, 'the planted row replaced the real one');
const literalProblems = sourceProblems(literalRow, MODE_RULE_PARTS, COMPOSED_MODES);
assert.ok(literalProblems.some((p) => p.includes('not composedRuleset')) && literalProblems.some((p) => p.includes('part field airSupport')),
  'control: the composed mode spelled out field by field fails');
const unspread = RULESET_SOURCE.replace('...DRONE_LAUNCH_PART, respawnS: 6', "aerial: 'drone', counterDrone: true, respawnS: 6");
assert.notEqual(unspread, RULESET_SOURCE, 'the planted drone row replaced the real one');
assert.ok(sourceProblems(unspread, MODE_RULE_PARTS, COMPOSED_MODES).some((p) => p.includes("drone's row does not spread")),
  'control: a donor that spells its part out fails');

// ---- the facets: every reader's question answered from the parts
for (const mode of BATTLE_MODE_IDS) {
  assert.equal(modeLaunchesDrones(mode), rulesets[mode].aerial === 'drone', `${mode}: launches drones by its part`);
  assert.equal(modeCallsAirSupport(mode), !!rulesets[mode].airSupport, `${mode}: calls air support by its part`);
}
assert.deepEqual(BATTLE_MODE_IDS.filter(modePlaysSectors), ['zone_control', 'mars', 'air_support', 'combined_arms'], 'the sector battles');
assert.equal(modeLaunchesDrones('not-a-mode'), false);
assert.equal(modeCallsAirSupport(null), false);

// ---- the catalog: appended to the wire's order, after Air Support in every list, with its own icon
assert.equal(BATTLE_MODE_IDS.at(-1), 'combined_arms', 'a new battle mode is appended to the wire\'s order');
assert.equal(MODE_PRESENTATION_ORDER[MODE_PRESENTATION_ORDER.indexOf('air_support') + 1], 'combined_arms', 'Combined Arms follows Air Support');
assert.deepEqual(MODE_PRESENTATION_ORDER.slice(0, -1), ['standard', 'drone', 'zone_control', 'capture_the_flag', 'frontline_assault',
  'turbo_ball', 'mars', 'endless_horde', 'gun_game', 'juggernaut', 'infected', 'realistic', 'ac130', 'air_support'],
  'the owner-ordered list (2026-10-25) is unchanged before it');
assert.equal(GAME_MODE_DEFINITIONS.combined_arms.label, 'Combined Arms');
assert.equal(GAME_MODE_DEFINITIONS.combined_arms.icon, 'modeCombinedArms');
assert.ok(GAME_MODE_DEFINITIONS.combined_arms.description.includes('2000'), 'its copy quotes the ruleset\'s target');

// ---- 4: no new id check for a part's mode outside the catalog and the ruleset
const PART_MODES = ['drone', 'air_support', 'combined_arms'];
const ID_CHECK = new RegExp([
  `\\b\\w*(?:[mM]ode|[iI]d)\\s*[!=]==?\\s*'(?:${PART_MODES.join('|')})'`,
  `'(?:${PART_MODES.join('|')})'\\s*[!=]==?\\s*\\w*(?:[mM]ode|[iI]d)\\b`,
  `case '(?:${PART_MODES.join('|')})'`,
].join('|'), 'g');
/** The id checks that stay, each about a mode's own battle or not a game mode at all: [file, count, why]. */
const KEPT = [
  ['src/sim/matchModes.ts', 1, "Drone's own battle: the 20-kill race (drone_score_limit), not its launch part"],
  ['src/ui/hud.ts', 1, "Drone's own battle: its kill race's status line"],
  ['src/engine/watchCamera.ts', 3, "Watch's camera mode 'drone' (the spectator's flight), not a game mode"],
  ['src/game/watchController.ts', 2, "Watch's camera mode 'drone', not a game mode"],
  ['src/app/watchRuntime.ts', 1, "Watch's camera mode 'drone', not a game mode"],
];
const EXEMPT = new Set(['src/sim/gameModeCatalog.ts', 'src/sim/matchRuleset.ts']);
/** Id checks per file in `files` ([path, text]). */
function idChecks(files) {
  const counts = new Map();
  for (const [file, text] of files) {
    if (EXEMPT.has(file)) continue;
    const found = text.match(ID_CHECK)?.length ?? 0;
    if (found) counts.set(file, found);
  }
  return counts;
}
function idCheckProblems(counts) {
  const problems = [];
  const kept = new Map(KEPT.map(([file, count]) => [file, count]));
  for (const [file, count] of counts) {
    if (count > (kept.get(file) ?? 0)) problems.push(`${file}: ${count} id check(s) for a part's mode (kept ${kept.get(file) ?? 0}); read the facet instead`);
  }
  for (const [file, count] of kept) if ((counts.get(file) ?? 0) < count) problems.push(`${file}: fewer id checks than kept (${counts.get(file) ?? 0} < ${count}); lower KEPT`);
  return problems;
}
function sources(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sources(path, out);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push([path, readFileSync(join(ROOT, path), 'utf8')]);
  }
  return out;
}
const tree = [...sources('src'), ...sources('server')];
assert.deepEqual(idCheckProblems(idChecks(tree)), [], 'no id check for a part\'s mode outside the kept ones');
// control: a planted Air Support id check in a reader is found, and so is one in the other spelling
const planted = [...tree, ['src/ui/plantedReader.ts', "if (state.id === 'air_support' || 'combined_arms' === modeId) draw();"]];
assert.deepEqual(idCheckProblems(idChecks(planted)), ["src/ui/plantedReader.ts: 2 id check(s) for a part's mode (kept 0); read the facet instead"],
  'control: a planted id check is found');
assert.ok(idChecks([['src/ui/x.ts', "switch (gameMode) { case 'drone': break; }"]]).get('src/ui/x.ts') === 1, 'control: a case label is an id check');
assert.equal(idChecks([['src/ui/x.ts', "if (view.kind === 'drone' || source === 'drone') fly();"]]).size, 0, 'an aircraft kind or a kill source is not a mode id');

console.log('modeComposition PASS', JSON.stringify({ composed: Object.keys(COMPOSED_MODES), parts: Object.keys(MODE_RULE_PARTS),
  scanned: tree.length, kept: KEPT.reduce((sum, [, count]) => sum + count, 0), controls: 9 }));
