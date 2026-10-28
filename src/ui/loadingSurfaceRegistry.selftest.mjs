// The loading-surface census (static): every row of src/ui/loadingSurfaceRegistry.ts names a lane and a page the census
// knows, an owner that exists, a box and a ready state the page still builds (a class, id or attribute of the selector is
// in the owner's source, its page's HTML or a stylesheet), a ready form the census reads, and one path per page. The
// browser census (tools/loading-census.mjs) loads the rows. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOADING_LANES, LOADING_PAGES, LOADING_SURFACES } from './loadingSurfaceRegistry.ts';

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
  'docs-topic': ['site/docs-tanks.html', 'site/docs-filming.html'], gallery: ['site/gallery.html'], '404': ['404.html'] };
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
  const recipes = Array.isArray(row.open) ? [row.open] : Object.values(row.open ?? {});
  for (const recipe of recipes) {
    for (const step of recipe) {
      const names = namesOf(step.replace(/^\?/, ''));
      assert.ok(names.some((name) => everything.includes(name)), `${id}: its press ${step} is still built`);
    }
  }
  assert.ok(!(row.scroll && row.open), `${id}: a row scrolls to its box or presses its way in, not both`);
}
for (const page of LOADING_PAGES) assert.ok(paths.has(page), `the census loads ${page}: a row names it`);

console.log(`loadingSurfaceRegistry.selftest: ${rows.length} loading surfaces across ${paths.size} pages, each with a lane, an owner and a box the page still builds`);
