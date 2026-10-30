#!/usr/bin/env node
// public-shell.mjs — writes the public site's one bar (src/presentation/publicShell.ts: nav, optional footer, inline
// symbol block) into every public entry and its pages into the game's boot screen (index.html), or checks that each
// entry carries exactly what the shell renders.
// Copyright © 2026 Kevin B. Liu.
//
//   node tools/public-shell.mjs           check (exit 1 naming each stale entry)
//   node tools/public-shell.mjs --write   rewrite the marker blocks of every entry
//
// The English copy is the en-US catalog's (the /cn build localizes the same data-i18n hosts), the glyphs are the
// sprite's (src/ui/icons/sprite.svg) and the flags flag-icons' 4x3 art (docs/ATTRIBUTION.md).
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderBootNav, renderPublicShell } from '../src/presentation/publicShell.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The public entries that share the bar (the seventeen pages of brand-ui SPEC 12.3.1, and the missing page, 12.3.4). */
export const PUBLIC_SHELL_ENTRIES = Object.freeze([
  'site/home.html', '404.html', 'site/gallery.html', 'site/docs.html', 'site/docs-topic.html',
  'site/docs-build.html', 'site/docs-models.html', 'site/docs-simulation.html',
  'site/docs-rendering.html', 'site/docs-ai.html',
  'site/docs-multiplayer.html', 'site/docs-audio.html', 'site/docs-studio.html',
  'site/docs-filming.html',
  'site/docs-modes.html',
  'site/docs-battlefields.html',
  'site/docs-combat.html',
  'site/docs-tanks.html',
  'site/docs-start.html',
  'site/docs-controls.html',
  'site/docs-fleet.html',
]);

const catalog = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
const text = (key) => {
  if (typeof catalog[key] !== 'string') throw new Error(`public-shell: ${key} is not in the en-US catalog`);
  return catalog[key];
};
const sprite = readFileSync(join(ROOT, 'src/ui/icons/sprite.svg'), 'utf8');
const require = createRequire(join(ROOT, 'package.json'));
const flagSvg = (code) => readFileSync(require.resolve(`flag-icons/flags/4x3/${code}.svg`), 'utf8');

/** The game document, whose boot screen links the site's pages (<!--cot:bootnav-->). */
const BOOT_ENTRY = 'index.html';
const ENTRIES = [...PUBLIC_SHELL_ENTRIES, BOOT_ENTRY];

/** The document as the shell renders it. */
export function renderEntry(html, file = '') {
  return file === BOOT_ENTRY ? renderBootNav(html, text, sprite) : renderPublicShell(html, text, sprite, flagSvg);
}

/** Entries whose blocks differ from what the shell renders. */
export function staleEntries(root = ROOT) {
  return ENTRIES.filter((file) => {
    const html = readFileSync(join(root, file), 'utf8');
    return renderEntry(html, file) !== html;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    let written = 0;
    for (const file of ENTRIES) {
      const path = join(ROOT, file);
      const html = readFileSync(path, 'utf8');
      const next = renderEntry(html, file);
      if (next !== html) { writeFileSync(path, next); written++; }
    }
    console.log(`public-shell: ${written} of ${ENTRIES.length} entries rewritten`);
  } else {
    const stale = staleEntries();
    if (stale.length) {
      console.error(`public-shell: stale shell in ${stale.join(', ')} (run node tools/public-shell.mjs --write)`);
      process.exit(1);
    }
    console.log(`public-shell: ${ENTRIES.length} entries carry the current shell`);
  }
}
