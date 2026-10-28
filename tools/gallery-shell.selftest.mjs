// gallery-shell.selftest.mjs — the Gallery's static facet rows (tools/gallery-shell.mjs) are current, and the page's
// script renders the same rows through the same module. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shellRows, withShell } from './gallery-shell.mjs';

const page = readFileSync(new URL('../site/gallery.html', import.meta.url), 'utf8');
const rows = shellRows();
assert.equal(withShell(page, rows), page, 'site/gallery.html carries the current facet rows (node tools/gallery-shell.mjs)');
// the flags ship as sized empty boxes (the script fills their sources in); the chips ship their localizable words
const flags = [...rows.nationFacets.matchAll(/<img class="cot-c-flag"([^>]*)>/g)].map((match) => match[1]);
assert.ok(flags.length >= 10 && flags.every((attrs) => !/\ssrc=/.test(attrs) && /width="20" height="15"/.test(attrs)),
  'every flag box is sized and waits for its source');
assert.match(rows.classFacets, /data-i18n="fleet\.class\.mbt\.short"[^>]*>MBT<\/button>/, 'a class chip ships its word, localized at build');
const runtime = readFileSync(new URL('../src/gallery/gallery.ts', import.meta.url), 'utf8');
assert.match(runtime, /\$\('#nationFacets'\)\.innerHTML = nationFacetsMarkup\(/, 'the script renders the nation row through galleryFacets.ts');
assert.match(runtime, /\$\('#classFacets'\)\.innerHTML = classFacetsMarkup\(/, 'the script renders the class row through galleryFacets.ts');
// the loading census 262: the browse pane stands from the first paint, its list a busy skeleton until the script fills it
// (the list painted 9.5 s after the page on Fast 3G), and the dossier's skeleton holds its place
const list = /<div class="fam" id="vehicleList"([^>]*)>((?:<i class="fam__skel cot-c-skel" aria-hidden="true"><\/i>)+)<\/div>/.exec(page);
assert.ok(list && /aria-busy="true"/.test(list[1]) && list[2].split('<i ').length - 1 >= 10, 'the list ships busy skeleton rows');
assert.match(runtime, /vehicleList\.removeAttribute\('aria-busy'\)/, 'the script clears the list\'s busy state as it fills it');
assert.match(page, /<aside class="dossier"[^>]*>\s*<div class="dossier-skel" aria-hidden="true">/, 'the dossier ships its skeleton');
const galleryCss = readFileSync(new URL('../src/gallery/gallery.css', import.meta.url), 'utf8');
assert.match(galleryCss, /html:not\(\.gallery-ready\) :is\(\.dossier-scroll,\.views,\.tools\)\{visibility:hidden;/, 'the browse pane is not held hidden');
assert.match(runtime, /still\.src = record\?\.image \|\| '';\s*revealWhenReady\(still\.parentElement!, still\);/, 'the dossier still fades in');
console.log(`gallery-shell.selftest: ${flags.length} flag boxes and ${(rows.classFacets.match(/<button/g) ?? []).length} class chips in the page's first layout`);
