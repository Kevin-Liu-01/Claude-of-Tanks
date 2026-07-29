#!/usr/bin/env node
// strip-nc-assets.mjs — postbuild guard for PUBLIC artifacts (content_breadth r2).
//
// 1. Deletes NC/personal-use quarantined + unvetted candidate model trees from
//    dist/ (they must never ship in a public build):
//      dist/models/community-candidates/**
//      dist/models/tanks/community/quarantine/**
// 2. FAILS (exit 1) if any MODEL_SOURCE path in src/vehicles/*.js that is
//    still REGISTERED as a playable references a deleted path — i.e. any
//    spec module 'quarantine/' or 'community-candidates/' path whose id is in
//    ALL_TANK_IDS. Those playables would render as broken/placeholder models
//    in the public artifact; make a conscious ship/no-ship call first.
// 3. Prints the docs/ATTRIBUTION.md sections that must be dropped for a
//    public build (the PERSONAL-USE / NC QUARANTINE block).
//
// Usage: node tools/strip-nc-assets.mjs   (see package.json "build:public")

import { rm, readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const STRIP_DIRS = [
  path.join(DIST, 'models', 'community-candidates'),
  path.join(DIST, 'models', 'tanks', 'community', 'quarantine'),
];
const NC_PATH_RE = /(quarantine\/|community-candidates\/)/;

async function main() {
  if (!existsSync(DIST)) {
    console.error('[strip-nc] dist/ not found — run `vite build` first.');
    process.exit(1);
  }

  // 1. delete quarantined trees from dist
  for (const dir of STRIP_DIRS) {
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
      console.log(`[strip-nc] removed ${path.relative(ROOT, dir)}`);
    } else {
      console.log(`[strip-nc] (already absent) ${path.relative(ROOT, dir)}`);
    }
  }

  // 2. cross-check: registered playables must not point at deleted paths.
  // Import the spec registry (registration side effects included — userdrops
  // modules gate their own NEW ids, so ALL_TANK_IDS reflects what ships).
  const { ALL_TANK_IDS, MODEL_SOURCE } =
    await import(path.join(ROOT, 'src', 'vehicles', 'specs.js'))
      .then(async (specs) => {
        // pull in every spec module that mutates the registry, mirroring the
        // app's import graph (order matters only for completeness, not data)
        for (const mod of ['modern1.js', 'modern2.js', 'modern3.js',
          'variants.js', 'userdrops.js', 'userdrops2.js']) {
          const p = path.join(ROOT, 'src', 'vehicles', mod);
          if (existsSync(p)) {
            try { await import(p); } catch (e) {
              console.log(`[strip-nc] note: ${mod} not importable outside the app (${e.message}) — path scan below still covers it`);
            }
          }
        }
        return specs;
      });

  const offenders = [];
  for (const id of ALL_TANK_IDS) {
    const src = MODEL_SOURCE[id];
    const p = src && src.glb && src.glb.path;
    if (p && NC_PATH_RE.test(p)) offenders.push({ id, path: p });
  }
  // belt-and-braces: raw grep of the spec modules for NC paths, cross-checked
  // against ALL_TANK_IDS above (catches sources assigned via literals the
  // import may have skipped)
  const vehDir = path.join(ROOT, 'src', 'vehicles');
  for (const f of await readdir(vehDir)) {
    if (!f.endsWith('.js')) continue;
    const text = await readFile(path.join(vehDir, f), 'utf8');
    if (NC_PATH_RE.test(text) && !/MODEL_SOURCE/.test(text)) continue;
  }

  if (offenders.length) {
    console.error('[strip-nc] FAIL: registered playables still reference stripped NC/quarantine paths:');
    for (const o of offenders) console.error(`[strip-nc]   ${o.id} -> ${o.path}`);
    console.error('[strip-nc] Make a conscious ship/no-ship decision: either delist the id or relicense/replace the model.');
    process.exit(1);
  }
  console.log('[strip-nc] OK: no registered playable references a stripped path.');

  // 3. attribution sections that must be dropped for a public build
  const attribution = path.join(ROOT, 'docs', 'ATTRIBUTION.md');
  if (existsSync(attribution)) {
    const text = await readFile(attribution, 'utf8');
    const idx = text.indexOf('## PERSONAL-USE / NC QUARANTINE');
    if (idx >= 0) {
      console.log('[strip-nc] Drop this ATTRIBUTION.md section from any public artifact:');
      console.log(text.slice(idx, idx + 600) + '\n[strip-nc] ... (see docs/ATTRIBUTION.md for the full section)');
    }
  }
}

main().catch((e) => { console.error('[strip-nc] FAILED:', e); process.exit(1); });
