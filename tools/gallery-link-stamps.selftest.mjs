#!/usr/bin/env node
// Every Tank Gallery link the repository writes carries its id schema (278, scope-and-names). Copyright (c) 2026
// Kevin B. Liu. First-party tool; see NOTICE.md.
//
// The gallery reads a link without `&ids=` as id schema 1 (src/vehicles/tankIdAliases.ts, SSOT 2.19), right for old
// shared links. A link written today without the stamp names another vehicle whenever its id is one of the swap ids:
// docs/GALLERY.md's `/gallery?id=t90m&layer=armor` (2026-08-17) opened the T-90AM, and the Reddit capture lane filmed
// and drafted it as the T-90M Proryv the roster names. So every tracked text file is scanned for a gallery link with an
// id (`gallery?…id=` or `gallery.html?…id=`); each must carry `ids=` in its query, or build it on its line from the
// live schema (galleryHref, TANK_IDS.linkParam, TANK_ID_SCHEMA_PARAM or a STAMP made from them; `${…}` ids are
// current ids and need the live schema). A literal id may carry a fixed stamp: `ids=4` keeps meaning schema 4.
// Not scanned: receipts (*.selftest.mjs test unstamped links on purpose), docs/DEPLOYS.md and docs/history/ (records),
// src/game/tankIdBoundaries.ts (galleryHref, the stamp's definition).
// Prose naming the pattern (`?id=<id>`) passes. Its planted-link controls run first.
//   node tools/gallery-link-stamps.selftest.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const LINK = /gallery(?:\.html)?\?([^"'<>\s)`]*)/g;
const LIVE_STAMP = ['galleryHref', 'linkParam(', 'TANK_ID_SCHEMA_PARAM', 'STAMP'];
// galleryHref's own file is the stamp's definition (its stamp is a local variable)
const SKIP = [/\.selftest\.mjs$/, /^docs\/DEPLOYS\.md$/, /^docs\/history\//, /^src\/game\/tankIdBoundaries\.ts$/];

/** The unstamped gallery links on one line of `file`: [] when every link with an id carries its schema. */
export function unstampedLinks(file, line) {
  if (SKIP.some((re) => re.test(file))) return [];
  const found = [];
  for (const match of line.matchAll(LINK)) {
    const query = match[1];
    const id = /(?:^|&|&amp;)id=([^&]*)/.exec(query)?.[1];
    if (!id) continue; // no id, or a placeholder (`?id=<id>`: the match stops at the bracket)
    if (/(?:^|&|&amp;)ids=/.test(query)) continue;
    if (LIVE_STAMP.some((name) => line.includes(name))) continue;
    found.push(match[0]);
  }
  return found;
}

// planted-link controls: the scan finds an unstamped link of each kind and passes the stamped and the prose forms
assert.deepEqual(unstampedLinks('docs/GALLERY.md', '/gallery?id=t90m&layer=armor'), ['gallery?id=t90m&layer=armor']);
assert.equal(unstampedLinks('tools/x.mjs', 'await page.goto(`${base}/gallery?id=${id}`);').length, 1, 'a current id with no stamp');
assert.equal(unstampedLinks('tools/x.mjs', "path: '/gallery.html?layer=modules&id=carro45t',").length, 1, 'id after another key');
assert.equal(unstampedLinks('site/x.html', '<a href="/cn/gallery?id=t90m&amp;layer=armor">').length, 1, 'a localized html link');
assert.deepEqual(unstampedLinks('docs/GALLERY.md', '/gallery?id=t90am&ids=4&layer=armor'), []);
assert.deepEqual(unstampedLinks('site/x.html', '<a href="/gallery?id=t90m&amp;ids=4">'), []);
assert.deepEqual(unstampedLinks('tools/x.mjs', 'const href = (id) => `/gallery?id=${id}${STAMP ? `&${STAMP}` : ""}`;'), []);
assert.deepEqual(unstampedLinks('middleware.ts', '/** The tank a Gallery link names (`/gallery?id=<id>`), else null. */'), []);
assert.deepEqual(unstampedLinks('docs/GALLERY.md', 'redirects to `/gallery?layer=markup` so'), [], 'no id, nothing to stamp');
assert.deepEqual(unstampedLinks('src/vehicles/tankIdAliases.selftest.mjs', '/gallery?id=t90m'), [], 'receipts are not scanned');

// the tree: git grep's tracked text lines that name a gallery query with an id
let out = '';
try {
  out = execFileSync('git', ['grep', '-I', '-n', '-E', 'gallery(\\.html)?\\?[^"\' )]*id=', '--', '.'], { encoding: 'utf8', maxBuffer: 256 << 20 });
} catch (error) {
  if (error.status !== 1) throw error; // 1: no line matched
}
const findings = [];
let scanned = 0;
for (const row of out.split('\n')) {
  const m = /^([^:]+):(\d+):(.*)$/.exec(row);
  if (!m) continue;
  scanned++;
  for (const link of unstampedLinks(m[1], m[3])) findings.push(`${m[1]}:${m[2]}: ${link}`);
}
assert.deepEqual(findings, [], `gallery links without their id schema (&ids=, or galleryHref):\n${findings.join('\n')}`);
console.log(`gallery-link-stamps.selftest: ${scanned} tracked lines name a gallery id, every one stamped or built by galleryHref; `
  + 'planted unstamped links are found PASS');
