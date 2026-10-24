#!/usr/bin/env node
// tools/gallery-shell.mjs — the Gallery's static shell: the nation and class facet rows' default state, written into
// site/gallery.html by the same markup gallery.ts renders (src/gallery/galleryFacets.ts), so the first layout holds
// them before the page's script runs (247 perf pass: on a slow phone they arrived 11 s late and moved the list and the
// dossier 64 px down). The flags ship as sized empty boxes the script fills in; the class chips ship their words, which
// the build localizes for /cn (data-i18n). Copyright © 2026 Kevin B. Liu.
//   node tools/gallery-shell.mjs           write the rows
//   node tools/gallery-shell.mjs --check   fail when the page's rows are stale
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// the fleet registers its every wave on this import, as the page's own graph does (tools/home-premiere.mjs too)
import '../src/vehicles/tankFactory.ts';
import { VISIBLE_TANK_IDS, getSpec } from '../src/vehicles/specs.ts';
import { buildGalleryRecords } from '../src/gallery/catalog.ts';
import { t } from '../src/ui/i18n.ts';
import { classFacetsMarkup, fleetClasses, nationFacetsMarkup, nationFlags } from '../src/gallery/galleryFacets.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(ROOT, 'site/gallery.html');

/** The two rows' default markup (no facet pressed but All nations). */
export function shellRows() {
  const records = buildGalleryRecords(VISIBLE_TANK_IDS.map((id) => getSpec(id)));
  const { codes, nations } = nationFlags(records);
  return {
    nationFacets: nationFacetsMarkup({ codes, nations, selected: '', translate: t, flagSrc: null }),
    classFacets: classFacetsMarkup(fleetClasses(records), '', t, true),
  };
}

/** The page with its rows written in (each row's container holds buttons only, so its first </div> closes it). */
export function withShell(html, rows = shellRows()) {
  let out = html;
  for (const [id, markup] of Object.entries(rows)) {
    const row = new RegExp(`(<div [^>]*id="${id}"[^>]*>)[\\s\\S]*?(</div>)`);
    if (!row.test(out)) throw new Error(`gallery-shell: site/gallery.html has no #${id}`);
    out = out.replace(row, (_, open, close) => `${open}${markup}${close}`);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const html = readFileSync(PAGE, 'utf8');
  const next = withShell(html);
  if (process.argv.includes('--check')) {
    if (next !== html) { console.error('gallery-shell: site/gallery.html is stale; run node tools/gallery-shell.mjs'); process.exit(1); }
    console.log('gallery-shell: the facet rows are current');
  } else {
    if (next !== html) writeFileSync(PAGE, next);
    console.log(`gallery-shell: ${next === html ? 'unchanged' : 'written'}`);
  }
}
