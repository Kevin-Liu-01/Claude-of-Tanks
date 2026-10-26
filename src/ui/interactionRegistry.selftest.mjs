// One pattern per task (INTERACTION-REDESIGN.md part D; owner 2026-10-26: "make map selection much more intituitve, as
// well as camo, i really mean update all legacy interaction surfaces and systems"). Copyright © 2026 Kevin B. Liu.
// The registry's own laws, then the static census of the source (tools/interaction-census.mjs):
// - every choose-one the source builds (a picker, a raw <select>, a createCustomSelect dropdown, a hand-built segmented,
//   radio group or listbox, a hand-rolled selection) is claimed by one registry row or exemption, so a new bespoke grid,
//   select or swatch list fails here until it is built on the picker and registered;
// - every mark a row claims is still in its owner (a row cannot outlive its site);
// - a createPicker() (or shared consumer's) id is the id of the picker row that claims it: one stamp a surface;
// - the rows that fail the bar are exactly the ratchet baseline's (tools/interaction-baseline.json): a new failing row
//   fails, and a row that now passes must leave the baseline, so it only shrinks;
// - each common path's presses (the step-count receipt replays them, tools/interaction-steps.mjs) are at most the
//   baseline's, and equal to its replayed steps: the count only falls.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { COMMON_PATHS, INTERACTION_EXEMPT, INTERACTION_LANES, INTERACTION_SITES, SITE_BUILDS, sitePasses } from './interactionRegistry.ts';
import { DATUM_SCREENS } from './surfaceRegistry.ts';
import { scanChoiceSites, scanSource } from '../../tools/interaction-census.mjs';
import { STEP_PATHS } from '../../tools/interaction-steps.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseline = JSON.parse(readFileSync(new URL('../../tools/interaction-baseline.json', import.meta.url), 'utf8'));

// --- the scanner's own laws (one fixture a kind) ---
const marks = (path, text) => scanSource(path, text).map((mark) => `${mark.kind}:${mark.key}`);
assert.deepEqual(marks('a.ts', "const p = createPicker(host, { id: 'battlefield', label })"), ['picker:battlefield']);
assert.deepEqual(marks('a.ts', "export function createMapPicker(host, o) { return createPicker(host, { id: o.id }); }"), [],
  "a shared consumer's own call takes its caller's id");
assert.deepEqual(marks('a.ts', "picker = createBattlefieldPicker(pick, {\n  id: 'rooms-battlefield', label })"), ['picker:rooms-battlefield']);
assert.deepEqual(marks('a.ts', '`<select data-rival aria-label="x"><option value="${o.id}"${o.id === v ? \' selected\' : \'\'}>`'), ['select:[data-rival]'],
  'an <option> belongs to its <select>');
assert.deepEqual(marks('a.ts', "const format = document.createElement('select');"), ['select:format']);
assert.deepEqual(marks('a.ts', 'const dd = createCustomSelect(field);'), ['custom-select:dd']);
assert.deepEqual(marks('a.ts', "const seg = el('div', 'cot-c-seg');\nseg.setAttribute('role', 'radiogroup');"), ['segmented:seg']);
assert.deepEqual(marks('a.ts', '`<div class="cot-c-seg tt-builds" role="radiogroup">`'), ['segmented:.tt-builds'], 'the kit class names only the primitive');
assert.deepEqual(marks('a.ts', '`<ul id="map-list" role="listbox">`'), ['listbox:#map-list']);
assert.deepEqual(marks('a.ts', "const list = host.querySelector('[role=\"listbox\"]');"), [], 'a selector that finds a listbox is not one');
assert.deepEqual(marks('a.ts', "for (const b of all) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));\n"
  + "for (const b of all) b.classList.toggle('on', b.dataset.mode === mode);"), ['bespoke:dataset.mode'], 'one site, however many writes');
assert.deepEqual(marks('a.ts', "const on = b.dataset.tone === tone;\nb.classList.toggle('on', on);"), ['bespoke:dataset.tone'], 'through a name');
assert.deepEqual(marks('a.ts', '`<button role="tab" data-tab="${id}" aria-selected="${id === cur}">`'), [], 'a tab is navigation');
assert.deepEqual(marks('a.ts', '// b.setAttribute(\'aria-pressed\', String(b.dataset.mode === mode));'), [], 'a comment is not a site');
assert.deepEqual(marks('a.html', '<!-- <select id="x"> -->\n<div class="cot-c-seg peer-switch" role="radiogroup">'), ['segmented:.peer-switch']);

// --- the table's own laws ---
for (const [id, row] of Object.entries(INTERACTION_SITES)) {
  assert.match(id, /^[a-z][a-z0-9-]*$/, `${id}: a site id (its data-picker stamp) is kebab-case`);
  assert.ok(existsSync(`${root}${row.owner}`), `${id}: owner ${row.owner} exists`);
  assert.ok(DATUM_SCREENS.includes(row.screen), `${id}: ${row.screen} is a registered screen`);
  assert.ok(INTERACTION_LANES.includes(row.lane), `${id}: ${row.lane} is a lane`);
  assert.ok(SITE_BUILDS.includes(row.build), `${id}: ${row.build} is a build`);
  assert.ok(row.chooses, `${id}: says what it chooses`);
  assert.ok(row.marks.length > 0, `${id}: claims at least one census mark`);
  if (row.build === 'picker') assert.ok(row.marks.some((mark) => mark.endsWith(`picker:${id}`)), `${id}: a picker row claims the picker stamped with its id`);
  for (const mark of row.marks) {
    const key = /(?:^|\s)picker:(.+)$/.exec(mark)?.[1];
    if (key) assert.equal(key, id, `${id}: claims picker:${key}, another surface's stamp (one picker id a surface)`);
  }
  for (const mark of row.marks) {
    const at = mark.indexOf(' ');
    if (at > 0) assert.ok(existsSync(`${root}${mark.slice(0, at)}`), `${id}: ${mark.slice(0, at)} exists`);
  }
  if (row.path) assert.ok(COMMON_PATHS[row.path], `${id}: ${row.path} is a common path`);
}
for (const exempt of INTERACTION_EXEMPT) assert.ok(exempt.reason, `INTERACTION_EXEMPT ${exempt.owner} ${exempt.mark}: each exemption gives its reason`);

// --- the static census: every mark claimed once, every claim real ---
const sites = scanChoiceSites(root);
const claims = new Map();
const claim = (owner, mark, by) => {
  const key = `${owner} ${mark}`;
  assert.ok(!claims.has(key), `${owner} ${mark}: claimed by both ${claims.get(key)} and ${by}`);
  claims.set(key, by);
};
/** A row's mark in its owner, or in the file it names first (`site/gallery.html listbox:#vehicleList`). */
const placeOf = (owner, mark) => {
  const at = mark.indexOf(' ');
  return at > 0 && /\.(ts|html)$/.test(mark.slice(0, at)) ? [mark.slice(0, at), mark.slice(at + 1)] : [owner, mark];
};
for (const [id, row] of Object.entries(INTERACTION_SITES)) for (const mark of row.marks) claim(...placeOf(row.owner, mark), id);
for (const exempt of INTERACTION_EXEMPT) claim(exempt.owner, exempt.mark, 'INTERACTION_EXEMPT');
const problems = [];
const found = new Set();
for (const site of sites) {
  const key = `${site.path} ${site.mark}`;
  found.add(key);
  if (claims.has(key)) continue;
  problems.push(site.kind === 'picker'
    ? `${site.path}:${site.line} createPicker('${site.key}') has no registry row: add it to src/ui/interactionRegistry.ts`
    : `${site.path}:${site.line} a new choose-one (${site.mark}): build it on the picker (src/ui/components/picker.ts) and register it in src/ui/interactionRegistry.ts`);
}
for (const [key, by] of claims) {
  if (found.has(key)) continue;
  problems.push(by === 'INTERACTION_EXEMPT'
    ? `INTERACTION_EXEMPT ${key}: a stale exemption (the source no longer has it)`
    : `${by}: ${key} is no longer in the source: if the site is now a picker, set build 'picker' with its picker mark and drop it from tools/interaction-baseline.json`);
}
assert.deepEqual(problems, [], `interaction census:\n  ${problems.join('\n  ')}`);

// --- the ratchet: failing rows are exactly the baseline's, which only shrinks ---
const failing = Object.entries(INTERACTION_SITES).filter(([, row]) => !sitePasses(row)).map(([id]) => id).sort();
const allowed = [...baseline.failing].sort();
assert.deepEqual(failing.filter((id) => !allowed.includes(id)), [],
  'a new choose-one that fails the bar: build it on the picker (the baseline only shrinks)');
assert.deepEqual(allowed.filter((id) => !failing.includes(id)), [],
  'these rows pass now: remove them from tools/interaction-baseline.json "failing" (the ratchet shrinks)');

// --- the common paths: presses at most the baseline's, and the replay's steps are that many presses ---
assert.deepEqual(Object.keys(baseline.paths).sort(), Object.keys(COMMON_PATHS).sort(), 'the baseline pins every common path');
assert.deepEqual(STEP_PATHS.map((path) => path.id).sort(), Object.keys(COMMON_PATHS).sort(), 'the step receipt replays every common path');
for (const [id, path] of Object.entries(COMMON_PATHS)) {
  assert.ok(path.presses <= baseline.paths[id], `${id}: ${path.presses} presses, more than the baseline's ${baseline.paths[id]} (the count only falls)`);
  assert.equal(path.presses, baseline.paths[id], `${id}: now ${path.presses} presses: lower tools/interaction-baseline.json "paths" to match`);
  const replay = STEP_PATHS.find((step) => step.id === id);
  assert.equal(replay.steps.length, path.presses, `${id}: the replay presses ${replay.steps.length} times, the registry says ${path.presses}`);
  assert.ok(DATUM_SCREENS.includes(path.from), `${id}: starts on a registered screen`);
}

const rows = Object.values(INTERACTION_SITES);
console.log(`interactionRegistry.selftest: ${rows.length} choose-one sites (${rows.filter(sitePasses).length} pass, ${failing.length} in the baseline), `
  + `${INTERACTION_EXEMPT.length} exempt, ${sites.length} census marks; ${Object.keys(COMMON_PATHS).length} common paths`);
