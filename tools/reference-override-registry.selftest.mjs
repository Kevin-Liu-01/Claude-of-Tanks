// The gate page's reference table (tools/procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES) names each id once, and a
// source-world certified id's oracle is the private local file reference-glb-loader.ts requires. A later entry silently
// replaces an earlier one: after the 10-15 id re-key the 08-04 recovered T-72B 1987 entry replaced the certified X
// study's, and the gate waited 150 s on the loader's refusal (266). Negative controls name a duplicate and a recovered path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SOURCE_WORLD_FRAMES } from './source-world-registration.mjs';
import { ABRAMS_X_REFERENCE_OVERRIDES } from './abrams-x-reference-overrides.ts';
import { ARES_APC_X_REFERENCE_OVERRIDES } from './ares-apc-x-reference-overrides.ts';
import { LEOPARD_X_REFERENCE_OVERRIDES } from './leopard-x-reference-overrides.ts';
import { OPLOT_BM_X_REFERENCE_OVERRIDES } from './oplot-bm-x-reference-overrides.ts';
import { SECOND_WAVE_X_REFERENCE_OVERRIDES } from './second-wave-x-reference-overrides.ts';
import { SUPPLIED_SOURCE_REFERENCE_OVERRIDES } from './supplied-source-reference-overrides.mjs';
import { T90_X_REFERENCE_OVERRIDES } from './t90-x-reference-overrides.ts';
import { WEST_X_REFERENCE_OVERRIDES } from './west-x-reference-overrides.ts';

// the tables the page spreads into its own (a new spread fails here until it is listed)
const SPREADS = { ABRAMS_X_REFERENCE_OVERRIDES, ARES_APC_X_REFERENCE_OVERRIDES, LEOPARD_X_REFERENCE_OVERRIDES,
  OPLOT_BM_X_REFERENCE_OVERRIDES, SECOND_WAVE_X_REFERENCE_OVERRIDES, SUPPLIED_SOURCE_REFERENCE_OVERRIDES,
  T90_X_REFERENCE_OVERRIDES, WEST_X_REFERENCE_OVERRIDES };

/** Each id defined by two of `sources` ([name, {id: registration}] in spread order), named with both sources. */
function duplicateRegistrations(sources) {
  const seen = new Map(), duplicates = [];
  for (const [name, entries] of sources) for (const id of Object.keys(entries)) {
    if (seen.has(id)) duplicates.push(`${id}: ${seen.get(id)} and ${name}`); else seen.set(id, name);
  }
  return duplicates;
}

/** Certified ids whose effective oracle is missing from the table or is not a private local file. */
function uncertifiedPaths(table, frames) {
  return Object.keys(frames).filter((id) => !table[id]?.glb?.path?.startsWith('/models/community-candidates/'))
    .map((id) => `${id}: ${table[id]?.glb?.path ?? 'not registered'}`);
}

const page = fs.readFileSync(new URL('./procedural-fidelity.html', import.meta.url), 'utf8');
const lines = page.split('\n');
const start = lines.findIndex((l) => l.startsWith('const LOCAL_REFERENCE_OVERRIDES = {'));
let end = start; while (!lines[end].startsWith('};')) end++;
const sources = [];
let literal = null;
for (const line of lines.slice(start + 1, end)) {
  const spread = /^ {2}\.\.\.([A-Z0-9_]+),/.exec(line);
  if (spread) {
    assert.ok(SPREADS[spread[1]], `${spread[1]}: the page spreads a table this receipt does not know; import it here`);
    sources.push([spread[1], SPREADS[spread[1]]]);
    continue;
  }
  const key = /^ {2}([a-z0-9_]+):/.exec(line);
  if (key) {
    if (!literal) sources.push(['the page', literal = {}]);
    // each literal entry's first path: is its oracle (every entry writes it as a string literal)
    literal[key[1]] = { text: '' };
  }
  const last = literal && Object.keys(literal).at(-1);
  if (last) literal[last].text += `${line}\n`;
}
for (const entry of Object.values(literal)) {
  const path = /path:\s*'([^']+)'/.exec(entry.text)?.[1];
  assert.ok(path, 'every literal entry names its oracle path');
  entry.glb = { path };
}
const table = Object.assign({}, ...sources.map(([, entries]) => entries));

assert.deepEqual(duplicateRegistrations(sources), [], 'one registration per id: a later one would replace it silently');
assert.deepEqual(uncertifiedPaths(table, SOURCE_WORLD_FRAMES), [], 'certified ids register their private local oracle');
assert.ok(SOURCE_WORLD_FRAMES.t72b_1987 && table.t72b_1987.glb.path === '/models/community-candidates/t72b_1987_x_source.glb');

// negative controls: the 266 collision, rebuilt
const collided = [...sources, ['the page (again)', { t72b_1987: { glb: { path: '/models/tanks/community/recovered/t72b_1987.glb' } } }]];
assert.deepEqual(duplicateRegistrations(collided).filter((d) => d.startsWith('t72b_1987:')),
  ['t72b_1987: SECOND_WAVE_X_REFERENCE_OVERRIDES and the page (again)']);
assert.deepEqual(uncertifiedPaths(Object.assign({}, table, collided.at(-1)[1]), { t72b_1987: SOURCE_WORLD_FRAMES.t72b_1987 }),
  ['t72b_1987: /models/tanks/community/recovered/t72b_1987.glb']);
assert.deepEqual(uncertifiedPaths({}, { t80u: SOURCE_WORLD_FRAMES.t80u }), ['t80u: not registered']);

// the page fails closed on an error it does not catch (a loader's refusal), so the gate reads a named error at once
assert.match(page, /addEventListener\('error', \(event\) => \{ window\.__FIDELITY_ERROR \?\?=/);
assert.match(page, /addEventListener\('unhandledrejection', \(event\) => \{ window\.__FIDELITY_ERROR \?\?=/);

console.log(`reference-override-registry.selftest: ${Object.keys(table).length} ids registered once from ${sources.length} sources; `
  + `${Object.keys(SOURCE_WORLD_FRAMES).length} certified ids on private local oracles; the 266 collision is named`);
