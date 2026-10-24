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
console.log(`gallery-shell.selftest: ${flags.length} flag boxes and ${(rows.classFacets.match(/<button/g) ?? []).length} class chips in the page's first layout`);
