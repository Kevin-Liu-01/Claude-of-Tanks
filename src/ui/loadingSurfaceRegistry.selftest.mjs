// The loading-surface census (static): every row of src/ui/loadingSurfaceRegistry.ts names a lane and a page the census
// knows, an owner that exists, a box and a ready state the page still builds (a class, id or attribute of the selector is
// in the owner's source, its page's HTML or a stylesheet), a ready form the census reads, and one path per page; and no
// fire-and-forget import that a dropped network leaves unhandled. The browser census (tools/loading-census.mjs) loads
// the rows. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOADING_LANES, LOADING_PAGES, LOADING_RULES, LOADING_SURFACES } from './loadingSurfaceRegistry.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const rows = Object.entries(LOADING_SURFACES);
const read = (file) => readFileSync(join(ROOT, file), 'utf8');

// every stylesheet and the documents' own HTML: a box the markup or a rule names is a box the page builds
const sheets = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(css|ts)$/.test(name) && !/\.d\.ts$/.test(name)) sheets.push(relative(ROOT, path));
  }
};
walk(join(ROOT, 'src'));
const PAGE_HTML = { game: ['index.html'], studio: ['index.html'], home: ['site/home.html'], docs: ['site/docs.html'],
  'docs-topic': ['site/docs-tanks.html', 'site/docs-filming.html'], 'docs-fleet': ['site/docs-fleet.html'], gallery: ['site/gallery.html'], '404': ['404.html'] };
const corpus = new Map();
const corpusFor = (row) => {
  const key = `${row.page}|${row.owner}`;
  if (!corpus.has(key)) corpus.set(key, [read(row.owner), ...PAGE_HTML[row.page].map(read), ...sheets.filter((f) => f.endsWith('.css')).map(read)].join('\n'));
  return corpus.get(key);
};
/** A selector's names: its classes, ids and attribute names (the words the page must still write). */
const namesOf = (selector) => [...selector.matchAll(/([.#])([A-Za-z][\w-]*)|\[([a-z][\w-]*)/g)].map((m) => m[2] ?? m[3]);

// a press is built wherever the page at rest is (the Garage's nav and Deploy open other owners' surfaces)
const everything = [...Object.values(PAGE_HTML).flat(), ...sheets].map(read).join('\n');
// 1. The rows.
const paths = new Map();
for (const [id, row] of rows) {
  assert.ok(LOADING_LANES.includes(row.lane), `${id}: lane ${row.lane} is one of ${LOADING_LANES.join(', ')}`);
  assert.ok(LOADING_PAGES.includes(row.page), `${id}: page ${row.page} is one the census loads`);
  assert.ok(existsSync(join(ROOT, row.owner)), `${id}: its owner ${row.owner} exists`);
  assert.ok(row.path.startsWith('/'), `${id}: its path is a path`);
  if (paths.has(row.page)) assert.equal(row.path, paths.get(row.page), `${id}: every ${row.page} row loads one path`);
  paths.set(row.page, row.path);
  const ready = /^(loaded|frame|gone):(.+)$/.exec(row.ready)?.[2] ?? row.ready;
  assert.ok(!/^\w+:/.test(ready), `${id}: its ready form is loaded:, frame:, gone: or a selector`);
  const text = corpusFor(row);
  for (const [what, selector] of [['box', row.box], ['ready', ready]]) {
    const names = namesOf(selector);
    assert.ok(names.length, `${id}: its ${what} (${selector}) names a class, id or attribute`);
    assert.ok(names.some((name) => text.includes(name)), `${id}: its ${what} (${selector}) is still built: none of ${names.join(', ')} is in ${row.owner}, its page or a stylesheet`);
  }
  const recipesOf = (r) => (Array.isArray(r) ? [r] : Object.values(r ?? {}));
  for (const recipe of [...recipesOf(row.open), ...recipesOf(row.leave)]) {
    for (const step of recipe) {
      const names = namesOf(step.replace(/^\?/, ''));
      assert.ok(names.some((name) => everything.includes(name)), `${id}: its press ${step} is still built`);
    }
  }
  assert.ok(!(row.scroll && row.open), `${id}: a row scrolls to its box or presses its way in, not both`);
  for (const [rule, reason] of Object.entries(row.allow ?? {})) {
    assert.ok(LOADING_RULES.includes(rule), `${id}: it allows ${rule}, one of ${LOADING_RULES.join(', ')}`);
    assert.ok(typeof reason === 'string' && reason.trim().length > 10, `${id}: its ${rule} allowance names the ruling`);
  }
}
// the census holds exactly the rules the registry names (an allowance for a rule it never finds hides nothing)
const censusRules = new Set([...read('tools/loading-census.mjs').matchAll(/rule: '([a-z-]+)'/g)].map((m) => m[1]));
assert.deepEqual([...censusRules].sort(), [...LOADING_RULES].sort(), 'the registry names the census\'s rules');
for (const page of LOADING_PAGES) assert.ok(paths.has(page), `the census loads ${page}: a row names it`);

// 2. No fire-and-forget import that a dropped network leaves unhandled: every `void import(...)` chain carries a .catch()
// or a .then() rejection handler (an unhandled one reached the boot recovery's reload before the reveal, and is a silent
// console error on a public page). The public pages' remaining sites are their owner's (premiere-site), listed here
// until each is caught: the list only shrinks.
// (integ 262: docs-home-262 caught the public pages' last nine sites, so the list is empty)
const UNCAUGHT_BASELINE = Object.freeze({});
/** The `void import(` chains in a source with no handler for the import's rejection, by line. */
function uncaughtImports(source) {
  const lines = [];
  for (const m of source.matchAll(/void import\(/g)) {
    let i = m.index + m[0].length, depth = 1;
    for (; i < source.length; i++) {
      const c = source[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { depth--; if (depth < 0) break; }
      else if (depth === 0 && c === ';') break;
      else if (depth === 0 && c === '\n' && !/^\s*\./.test(source.slice(i + 1, i + 200))) break;
    }
    const chain = source.slice(m.index, i);
    const rejectArg = [...chain.matchAll(/\.then\(/g)].some((t) => {
      let d = 0;
      for (let j = t.index + 6; j < chain.length; j++) {
        const c = chain[j];
        if ('([{'.includes(c)) d++;
        else if (')]}'.includes(c)) { if (d === 0) return false; d--; }
        else if (c === ',' && d === 0) return true;
      }
      return false;
    });
    if (!/\.catch\(/.test(chain) && !rejectArg) lines.push(source.slice(0, m.index).split('\n').length);
  }
  return lines;
}
assert.deepEqual(uncaughtImports("void import('./a.ts').then((m) => m.go());"), [1], 'the scan finds an uncaught chain');
assert.deepEqual(uncaughtImports("void import('./a.ts').then((m) => m.go())\n  .catch(() => {});"), [], 'a .catch on the next line handles it');
assert.deepEqual(uncaughtImports("void import('./a.ts').then((m) => m.go(1, 2), () => {});"), [], 'a rejection handler handles it');
assert.deepEqual(uncaughtImports("void import('./a.ts').then((m) => m.go(1, 2));"), [1], 'a comma inside the handler is not one');
const shrunk = [];
for (const file of sheets.filter((f) => f.endsWith('.ts'))) {
  const found = uncaughtImports(read(file));
  const allowed = UNCAUGHT_BASELINE[file] ?? 0;
  assert.ok(found.length <= allowed, `${file}: a fire-and-forget import a dropped network leaves unhandled (line ${found.join(', ')}): `
    + 'add .catch() with the quiet state it leaves, or a .then() rejection handler');
  if (found.length < allowed) shrunk.push(`${file} ${allowed} -> ${found.length}`);
}
assert.deepEqual(shrunk, [], 'a caught site leaves the baseline: lower UNCAUGHT_BASELINE');

console.log(`loadingSurfaceRegistry.selftest: ${rows.length} loading surfaces across ${paths.size} pages, each with a lane, an owner and a box the page still builds; `
  + `no uncaught fire-and-forget import outside the public pages' ${Object.values(UNCAUGHT_BASELINE).reduce((a, b) => a + b, 0)} listed`);
