// i18nChunkImport.selftest.mjs — the locale registry imports the catalog chunk a page names through a module that only a
// Vite document resolves to the URL import (2026-10-16, the test-speed lane: src/ui/i18nChunkImport.ts, its document
// twin i18nChunkImport.browser.ts, the alias in tools/viteI18nPageCatalogs.ts). The self-test runner keys no receipt
// whose import graph holds a computed import() (tools/selftest-cache.mjs), and the registry is in the graph of every
// receipt that imports the locale runtime: with the URL import inline, about 380 receipts could never be reused.
//
// 1. The URL import lives in the document's importer alone; the registry and Node's importer hold none.
// 2. The runner's own planner keys the locale runtime and the map catalog (the chain the audit traced), whose graphs
//    hold Node's importer and never the document's.
// 3. No module anywhere in the repository imports the document's importer, so no Node graph can reach it; Node's
//    importer has one importer, the registry, by the one specifier the plugin's alias matches.
// (The alias, the build's boot-chunk check and the URL import's runtime: tools/i18n-page-catalogs.selftest.mjs.)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSelftestCache } from '../../tools/selftest-cache.mjs';
import { collectSelftestInputs } from '../../tools/selftest-inputs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REGISTRY = 'src/ui/i18nDictionaries.ts';
const NODE_IMPORTER = 'src/ui/i18nChunkImport.ts';
const DOCUMENT_IMPORTER = 'src/ui/i18nChunkImport.browser.ts';
const inputsOf = (file) => collectSelftestInputs(readFileSync(resolve(ROOT, file), 'utf8'), file);

// 1.
assert.equal(inputsOf(DOCUMENT_IMPORTER).opaqueImport, true, 'the document\'s importer imports the URL (a computed import())');
for (const file of [REGISTRY, NODE_IMPORTER, 'src/ui/i18n.ts']) {
  assert.equal(inputsOf(file).opaqueImport, false, `${file} holds no computed import()`);
}

// 2.
const cacheDir = mkdtempSync(join(tmpdir(), 'cot-i18n-chunk-import-'));
try {
  const cache = createSelftestCache({ root: ROOT, cacheDir, env: {}, argv: [] });
  for (const entry of ['src/ui/i18n.ts', 'src/world/maps/catalog.ts']) {
    const graph = [...cache.closureOf(resolve(ROOT, entry))].map((file) => relative(ROOT, file));
    assert.ok(graph.includes(REGISTRY) && graph.includes(NODE_IMPORTER), `${entry} reaches the registry and Node's importer`);
    assert.ok(!graph.includes(DOCUMENT_IMPORTER), `${entry} never reaches the document's importer`);
    const proof = cache.lookup(entry);
    assert.equal(proof.reason, 'no PASS for these inputs', `${entry} is keyed by the runner (reusable once it passes)`);
    assert.match(proof.key, /^[0-9a-f]{64}$/);
  }
} finally {
  rmSync(cacheDir, { recursive: true, force: true });
}

// 3.
const mentions = execFileSync('git', ['grep', '-l', '-I', '-F', '--untracked', 'i18nChunkImport', '--',
  '*.ts', '*.mts', '*.mjs', '*.js', '*.cjs', '*.html'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const importersOf = (target) => mentions.filter((file) => inputsOf(file).imports
  .some((specifier) => specifier.startsWith('.') && resolve(ROOT, dirname(file), specifier.split(/[?#]/, 1)[0]) === resolve(ROOT, target)));
assert.ok(mentions.includes(REGISTRY) && mentions.includes(DOCUMENT_IMPORTER), 'the scan sees the registry and both importers');
assert.deepEqual(importersOf(DOCUMENT_IMPORTER), [], 'nothing imports the document\'s importer: only the plugin\'s alias resolves it');
assert.deepEqual(importersOf(NODE_IMPORTER), [REGISTRY], 'the registry alone imports Node\'s importer');
assert.deepEqual(inputsOf(REGISTRY).imports.filter((specifier) => specifier.includes('i18nChunkImport')), ['./i18nChunkImport.ts'],
  'by the specifier the plugin aliases for a document');

console.log(`i18nChunkImport.selftest: the registry holds no computed import(); the locale runtime's graph is keyed; `
  + `${mentions.length} files mention the importers and none imports the document's`);
