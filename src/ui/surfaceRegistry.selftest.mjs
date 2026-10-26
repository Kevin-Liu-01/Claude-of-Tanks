// One datum, one owner (UI-LOCKDOWN parts B and C; owner 2026-10-25: "consolidate surfaces, prevent things like that
// silly double ping indicator from happening again"). The registry's own laws, then a static census of the source:
// - a datum key is placed (data-datum, the registry's helpers) only by a module the registry names as its owner, and
//   every owner the registry names places it, with the surface it names (the helpers live in src/ui/dom.ts);
// - every placed datum has a registry row (a readout without one fails), and no module writes data-datum by hand;
// - a datum's glyph (signal, clock, shell) is placed through datumGlyph(), never as a bare icon call, outside the
//   registry's GLYPH_MARKS (each mark a reason);
// - a datum's label keys (the fps, link and km/h captions) appear only in its owners' modules.
// The runtime half (two visible elements of one datum, a visible unregistered figure) is tools/datum-census.mjs, run by
// tools/battle-hud-overlap.browser.mjs and the gauntlet captures.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DATUM_SCREENS, GLYPH_MARKS, SURFACE_REGISTRY } from './surfaceRegistry.ts';
import { datumAttr, datumGlyph, markDatum } from './dom.ts';
import { DATUM_KEYS, DATUM_READOUTS } from '../../tools/datum-census.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const REGISTRY = 'src/ui/surfaceRegistry.ts';
/** The helpers' home (they write the attribute themselves). */
const HELPERS = 'src/ui/dom.ts';

// --- the table's own laws ---
for (const [key, row] of Object.entries(SURFACE_REGISTRY)) {
  assert.match(key, /^[a-z][a-z0-9-]*$/, `${key}: a datum key is kebab-case`);
  assert.ok(row.places.length > 0, `${key}: a row names at least one place`);
  const byScreen = new Map();
  for (const place of row.places) {
    assert.ok(DATUM_SCREENS.includes(place.screen), `${key}: ${place.screen} is a registered screen`);
    assert.match(place.owner, /^(src\/.+\.ts|index\.html|site\/.+\.html)$/, `${key}: ${place.owner} is a source path`);
    assert.ok(place.surface, `${key}: each place names its surface`);
    const list = byScreen.get(place.screen) ?? [];
    list.push(place);
    byScreen.set(place.screen, list);
  }
  // one place a screen and state: two places of one datum on one screen must name disjoint states
  for (const [screen, places] of byScreen) {
    if (places.length < 2) continue;
    const seen = new Map();
    for (const place of places) {
      assert.ok(place.states?.length, `${key} on ${screen}: two places on one screen each name the states they show in`);
      for (const state of place.states) {
        assert.ok(!seen.has(state), `${key} on ${screen}: ${place.surface} and ${seen.get(state)} both show in "${state}"`);
        seen.set(state, place.surface);
      }
    }
  }
}
assert.deepEqual(DATUM_READOUTS.map(([key]) => key).filter((key) => !SURFACE_REGISTRY[key]), [], 'readout patterns name rows');
for (const [, source] of DATUM_READOUTS) assert.doesNotThrow(() => new RegExp(source), `${source} compiles`);

// --- the helpers ---
assert.equal(datumAttr('clock'), ' data-datum="clock"');
const node = { dataset: {} };
assert.equal(markDatum(node, 'link'), node);
assert.equal(node.dataset.datum, 'link');
const bare = { attributes: {}, setAttribute(name, value) { this.attributes[name] = value; } };
assert.equal(markDatum(bare, 'seat').attributes['data-datum'], 'seat', 'an element without a dataset is marked by attribute');
for (const [key, row] of Object.entries(SURFACE_REGISTRY)) {
  if (row.glyph) assert.ok(datumGlyph(key, 14).includes(`data-icon="${row.glyph}"`), `datumGlyph('${key}') draws ${row.glyph}`);
}

// --- the static census ---
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|html)$/.test(name) && !/\.selftest\.|\.d\.ts$|\.test-support\./.test(name)) files.push(path);
  }
};
walk(join(root, 'src'));
walk(join(root, 'site'));
files.push(join(root, 'index.html'));
const sources = files.map((path) => ({ path: relative(root, path), text: readFileSync(path, 'utf8') }));

/** Each datumAttr('key') / datumGlyph('key', ...) / markDatum(<element>, 'key') call: markDatum's key follows its first
 *  argument's top-level comma, whatever calls that argument holds. */
function helperCalls(text) {
  const calls = [];
  for (const match of text.matchAll(/\b(datumAttr|markDatum|datumGlyph)\(/g)) {
    const helper = match[1];
    let at = match.index + match[0].length;
    if (helper === 'markDatum') {
      for (let depth = 0; at < text.length; at++) {
        const ch = text[at];
        if (ch === '(' || ch === '[' || ch === '{') depth++;
        else if (ch === ')' || ch === ']' || ch === '}') depth--;
        else if (ch === ',' && depth === 0) { at++; break; }
      }
    }
    const key = /^\s*['"]([^'"]+)['"]/.exec(text.slice(at, at + 80))?.[1];
    if (key) calls.push({ helper, key, index: match.index });
  }
  return calls;
}

const owners = new Map(Object.entries(SURFACE_REGISTRY).map(([key, row]) => [key, new Set(row.places.map((p) => p.owner))]));
const problems = [];
const placedBy = new Map();
const note = (key, path) => placedBy.set(`${key} ${path}`, true);
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

for (const { path, text } of sources) {
  if (path === REGISTRY || path === HELPERS) continue;
  // hand-written markers: an attribute in markup (not a CSS selector's [data-datum=...]), a dataset or setAttribute write;
  // static pages (index.html, site/*.html) write the attribute itself, checked like a helper call
  if (path.endsWith('.html')) {
    for (const match of text.matchAll(/(?<!\[)data-datum="([^"]*)"/g)) {
      const key = match[1];
      const at = `${path}:${lineOf(text, match.index)}`;
      if (!SURFACE_REGISTRY[key]) problems.push(`${at} data-datum="${key}": no registry row (add one to surfaceRegistry.ts)`);
      else if (!owners.get(key).has(path)) problems.push(`${at} renders the ${key} datum, owned by ${[...owners.get(key)].join(', ')}`);
      else note(key, path);
    }
    continue;
  }
  const raw = [
    ...text.matchAll(/(?<!\[)data-datum\s*=\s*\\?["'`]([^"'`\\]*)/g),
    ...text.matchAll(/\.dataset\.datum\s*=/g),
    ...text.matchAll(/setAttribute\(\s*['"]data-datum['"]/g),
  ];
  for (const match of raw) problems.push(`${path}:${lineOf(text, match.index)} writes data-datum by hand: use datumAttr()/markDatum() from surfaceRegistry.ts`);
  // the registry's helpers: the key must be a row and this module one of its owners
  for (const { helper, key, index } of helperCalls(text)) {
    const at = `${path}:${lineOf(text, index)}`;
    if (!SURFACE_REGISTRY[key]) { problems.push(`${at} ${helper}('${key}'): no registry row (add one to surfaceRegistry.ts)`); continue; }
    if (!owners.get(key).has(path)) { problems.push(`${at} renders the ${key} datum, owned by ${[...owners.get(key)].join(', ')}`); continue; }
    if (helper !== 'datumGlyph') note(key, path);
  }
  // a datum's glyph only through datumGlyph() (or a GLYPH_MARKS entry with its reason)
  for (const match of text.matchAll(/\b(?:uiIconSVG|icon|uiIconInSvg|iconInSvg|iconUrl)\(\s*['"]([A-Za-z]+)['"]/g)) {
    const glyph = match[1];
    const datum = Object.entries(SURFACE_REGISTRY).find(([, row]) => row.glyph === glyph)?.[0];
    if (!datum || GLYPH_MARKS.some((mark) => mark.owner === path && mark.glyph === glyph)) continue;
    problems.push(`${path}:${lineOf(text, match.index)} places the ${glyph} glyph by hand: it marks the ${datum} datum (datumGlyph('${datum}', size) in its owner, or a GLYPH_MARKS entry with its reason)`);
  }
  // a datum's caption keys only in its owners (a second readout of the ping would reuse its caption)
  if (path.endsWith('.ts')) {
    for (const [key, row] of Object.entries(SURFACE_REGISTRY)) {
      for (const label of row.labels ?? []) {
        const index = text.indexOf(`'${label}'`);
        if (index >= 0 && !owners.get(key).has(path)) problems.push(`${path}:${lineOf(text, index)} uses ${label}, the ${key} datum's caption, outside its owners`);
      }
    }
  }
}
// every place the registry names is real: its owner places the datum and carries the surface's class
const byPath = new Map(sources.map((source) => [source.path, source.text]));
for (const [key, row] of Object.entries(SURFACE_REGISTRY)) {
  for (const place of row.places) {
    const text = byPath.get(place.owner);
    if (text === undefined) { problems.push(`${key}: owner ${place.owner} does not exist`); continue; }
    if (!placedBy.has(`${key} ${place.owner}`)) problems.push(`${key}: ${place.owner} is named its owner but never places it (datumAttr/markDatum)`);
    for (const token of place.surface.match(/[.#][A-Za-z][\w-]*/g) ?? []) {
      if (!text.includes(token.slice(1))) problems.push(`${key}: ${place.owner} has no "${token.slice(1)}" for the surface ${place.surface}`);
    }
  }
}
for (const mark of GLYPH_MARKS) {
  assert.ok(mark.reason, `GLYPH_MARKS ${mark.owner} ${mark.glyph}: each mark gives its reason`);
  const text = byPath.get(mark.owner) ?? '';
  assert.ok(new RegExp(`\\(\\s*['"]${mark.glyph}['"]`).test(text), `GLYPH_MARKS ${mark.owner} ${mark.glyph}: a stale mark (the module no longer places it)`);
}

assert.deepEqual(problems, [], `surface registry census:\n  ${problems.join('\n  ')}`);
console.log(`surfaceRegistry.selftest: ${DATUM_KEYS.length} datums, ${Object.values(SURFACE_REGISTRY).reduce((n, row) => n + row.places.length, 0)} places over ${DATUM_SCREENS.length} screens; ${sources.length} sources censused`);
