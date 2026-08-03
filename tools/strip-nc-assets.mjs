#!/usr/bin/env node
// strip-nc-assets.mjs — postbuild guard for PUBLIC artifacts (content_breadth r2).
//
// 1. Deletes NC/personal-use quarantined + unvetted candidate model trees from
//    dist/ (they must never ship in a public build):
//      dist/models/community-candidates/**
//      dist/models/tanks/community/{quarantine,recovered}/**
//      local-only Tejas/AbramsX GLBs and their derivative icon sets
// 2. FAILS (exit 1) if any MODEL_SOURCE path in src/vehicles/*.js that is
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
  // the bergman/ThudOne folders are CC BY-NC-SA and must never ship; the
  // CC-BY candidates ship only as their BAKED community/*.glb outputs.
  path.join(DIST, 'models', 'tanks', 'candidates-gen2'),
];
const STRIP_FILES = [
  path.join(DIST, 'models', 'tanks', 'm1a2_tejas.glb'),
  path.join(DIST, 'models', 'tanks', 'community', 'abramsx-mortavex.glb'),
];
const RECOVERED_ICON_IDS = [
  'm1a2_tejas', 'abramsx',
  'challenger1', 'chieftain5', 'fv510', 'leo2_revolution', 'leo2a5', 'leo2a7v',
  'm1a1ha', 'm1a2_sepv2', 'm60a1', 'pt91m', 'merkava1b', 'merkava2b',
  'merkava2d', 'merkava3b', 'merkava3c', 'merkava3d', 'merkava4b', 't62mv1',
  't64bv1', 't72b_1987', 't72b3m', 't72bu', 't90sm', 'type90', 't90a_vladimir',
  'is3_bergman', 'isu152', 'isu122s', 'centurion3', 'centurion5', 'comet',
  'challenger_cruiser', 'charioteer', 'leopard2_proto', 'm1a1_aim', 'm46_patton',
  'm47_patton', 'm26_pershing', 'm45_patton', 'm60a3',
  // USER DROPS wave 8 (scout-gen2) NC quarantine: bergman T-54/T-80 family +
  // the LastTriarius T-84 remix (effective CC BY-NC-SA via its NC-SA parents).
  // Their icons are derivative renders of NC meshes. The wave's CC-BY(-SA)
  // ids (t44, type59, amx30, amx30b2, m48, m60a2, vickers_mk1) SHIP.
  't54', 't80', 't80b', 't80bv', 't84',
];
const ICON_SUFFIXES = ['angle', 'side', 'side_silhouette', 'top', 'top_silhouette'];
const NC_PATH_RE = /(quarantine\/|community-candidates\/|candidates-gen2\/|community\/recovered\/|m1a2_tejas\.glb|abramsx-mortavex\.glb)/;

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
  for (const file of STRIP_FILES) {
    if (existsSync(file)) {
      await rm(file, { force: true });
      console.log(`[strip-nc] removed ${path.relative(ROOT, file)}`);
    }
  }
  for (const id of RECOVERED_ICON_IDS) {
    for (const suffix of ICON_SUFFIXES) {
      await rm(path.join(DIST, 'icons', `${id}_${suffix}.png`), { force: true });
    }
  }

  // 2. cross-check: registered playables must not point at deleted paths.
  // The spec registry is imported in a SUBPROCESS (tools/
  // strip-nc-registry-probe.mjs): profile modules carry dev-server-tolerant
  // circular-import fallbacks that surface as unhandled microtask exceptions
  // under a bare-node import, and an in-process import let those kill the
  // whole build. The probe tolerates them; this guard still fails CLOSED if
  // no registry comes back. Recovered rows remain in ALL_TANK_IDS; their
  // restricted MODEL_SOURCE overrides resolve the public way in the probe
  // (no import.meta.env under node).
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
    if (p && NC_PATH_RE.test(p)) offenders.push({ id, path: p });
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
