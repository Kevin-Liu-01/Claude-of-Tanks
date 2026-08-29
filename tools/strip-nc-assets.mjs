#!/usr/bin/env node
// strip-nc-assets.mjs — postbuild guard for PUBLIC artifacts (content_breadth r2).
//
// 1. Deletes NC/personal-use quarantined + unvetted candidate model trees from
//    dist/ (they must never ship in a public build):
//      dist/models/community-candidates/**
//      dist/models/tanks/community/{quarantine,recovered}/**
//      historical raw-source trees
// 2. FAILS (exit 1) if any live MODEL_SOURCE path that is
//    still REGISTERED as a playable references a deleted path. Recovered
//    gameplay rows remain registered in public builds, but their model-source
//    gates must leave them on legal procedural family fallbacks.
// 3. Prints the docs/ATTRIBUTION.md sections that must be dropped for a
//    public build (the PERSONAL-USE / NC QUARANTINE block).
//
// Usage: node tools/strip-nc-assets.mjs   (see package.json "build:public")

import { rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

const STRIP_DIRS = [
  path.join(DIST, 'models', 'community-candidates'),
  path.join(DIST, 'models', 'tanks', 'community', 'quarantine'),
  path.join(DIST, 'models', 'tanks', 'community', 'recovered'),
  // USER DROPS wave 8 (scout-gen2): raw candidate STL trees + source zips —
  // reference-source folders must never ship; gameplay uses authored
  // procedural geometry and does not consume their baked model outputs.
  path.join(DIST, 'models', 'tanks', 'candidates-gen2'),
];
const NC_PATH_RE = /(quarantine\/|community-candidates\/|candidates-gen2\/|community\/recovered\/|abramsx-mortavex\.glb)/;

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
  // The browser's boot-light fleet facade is imported in a subprocess. This
  // exercises the exact registry order without loading every visual builder,
  // and isolates its module cache from the postbuild guard. The guard fails
  // closed if the complete registry cannot be produced. Recovered rows remain
  // in ALL_TANK_IDS; restricted source overrides resolve the public way in the
  // probe because import.meta.env is absent under Node.
  const MARKER = '__STRIP_NC_REGISTRY__';
  const probe = await new Promise((resolveP) => {
    execFile(process.execPath, [path.join(ROOT, 'tools', 'strip-nc-registry-probe.mjs')],
      { cwd: ROOT, timeout: 120000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => resolveP({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
  for (const line of probe.stderr.split('\n')) if (line.trim()) console.log(`[strip-nc] ${line}`);
  const markerLine = probe.stdout.split('\n').find((l) => l.startsWith(MARKER));
  if (!markerLine) {
    console.error('[strip-nc] FAIL: spec registry unavailable — cannot verify that no');
    console.error('[strip-nc] registered playable ships a stripped NC path. Refusing to pass.');
    if (probe.err) console.error(`[strip-nc] probe error: ${probe.err.message}`);
    process.exit(1);
  }
  const { allIds: ALL_TANK_IDS, sources } = JSON.parse(markerLine.slice(MARKER.length));
  console.log(`[strip-nc] registry probe: ${ALL_TANK_IDS.length} playables, ${Object.keys(sources).length} GLB-sourced`);

  const offenders = [];
  for (const id of ALL_TANK_IDS) {
    const p = sources[id];
    if (p && NC_PATH_RE.test(p)) offenders.push({ id, path: p, kind: 'playable' });
  }
  if (offenders.length) {
    console.error('[strip-nc] FAIL: registered rows still reference stripped NC/quarantine paths:');
    for (const o of offenders) console.error(`[strip-nc]   ${o.id} (${o.kind}) -> ${o.path}`);
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
