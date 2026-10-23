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
// Step 1b deletes the tool-only public files (tools/tool-only-public-files.mjs):
// the 33.5 MB tank asset manifest and the marking sheets stay in public/ for
// the tools that write and read them, but no page requests them.
//
// Usage: node tools/strip-nc-assets.mjs   (see package.json "build")
//   COT_STRIP_NC_PROBE_CACHE=0           probe the registry even when its inputs are unchanged
//   COT_STRIP_NC_PROBE_TIMEOUT_MS=<ms>   the probe's wall-clock limit (default 10 minutes)

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync, realpathSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { toolOnlyPublicFiles } from './tool-only-public-files.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PROBE = path.join(ROOT, 'tools', 'strip-nc-registry-probe.mjs');

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

// The registry probe evaluates the whole spec registry: about 3 s of CPU, which took 59 s of wall clock at load 215
// and passed the old 120 s limit at load ~100 (2026-10-22). Its result is a function of the files it loads, the probe
// itself, the lockfile and Node, so it is reused while all of those are byte-identical (one cache file per checkout
// under node_modules/.cache), and a probe that does run gets a limit that no load we run at reaches.
const PROBE_TIMEOUT_MS = Number(process.env.COT_STRIP_NC_PROBE_TIMEOUT_MS) || 600_000;
const PROBE_CACHE_VERSION = 1;
const PROBE_CACHE = path.join(ROOT, 'node_modules', '.cache', 'cot-strip-nc',
  `${createHash('sha1').update(ROOT).digest('hex')}.json`);
const PROBE_KEY_FILES = ['tools/strip-nc-registry-probe.mjs', 'package-lock.json'];
const MARKER = '__STRIP_NC_REGISTRY__';
const INPUTS_MARKER = '__STRIP_NC_INPUTS__';

async function digestFiles(root, files) {
  const digests = {};
  await Promise.all(files.map(async (file) => {
    digests[file] = createHash('sha256').update(await readFile(path.resolve(root, file))).digest('hex');
  }));
  return digests;
}

/** The cached probe result, or null unless every input it recorded (root-relative) is byte-identical. */
export async function readProbeCache(cacheFile, root) {
  try {
    const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
    if (cached.version !== PROBE_CACHE_VERSION || cached.node !== process.version) return null;
    const files = Object.keys(cached.inputs);
    const current = await digestFiles(root, files);
    return files.every((file) => current[file] === cached.inputs[file]) ? { registry: cached.registry, inputs: files.length } : null;
  } catch {
    return null; // absent, unreadable, or an input is gone: probe
  }
}

/** Caches a probe result with the digests of its inputs; the rename makes a concurrent reader see all or nothing. */
export async function writeProbeCache(cacheFile, root, files, registry) {
  const inputs = await digestFiles(root, [...new Set(files)]);
  await mkdir(path.dirname(cacheFile), { recursive: true });
  const temporary = `${cacheFile}.${process.pid}`;
  await writeFile(temporary, JSON.stringify({ version: PROBE_CACHE_VERSION, node: process.version, inputs, registry }));
  await rename(temporary, cacheFile);
}

async function cachedRegistry() {
  if (process.env.COT_STRIP_NC_PROBE_CACHE === '0') return null;
  const cached = await readProbeCache(PROBE_CACHE, ROOT);
  return cached && { log: [], registry: cached.registry, note: `reused: its ${cached.inputs} inputs are unchanged` };
}

/** Runs the probe and caches a clean result with the digests of the files it loaded. */
async function probeRegistry() {
  const started = Date.now();
  const probe = await new Promise((resolveP) => {
    execFile(process.execPath, [PROBE], { cwd: ROOT, timeout: PROBE_TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => resolveP({ err, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  });
  const log = probe.stderr.split('\n').filter((line) => line.trim()).map((line) => `[strip-nc] ${line}`);
  const lines = probe.stdout.split('\n');
  const markerLine = lines.find((l) => l.startsWith(MARKER));
  if (!markerLine) return { log, error: probe.err };
  const registry = JSON.parse(markerLine.slice(MARKER.length));
  const inputsLine = lines.find((l) => l.startsWith(INPUTS_MARKER));
  if (!probe.err && inputsLine) {
    try {
      const loaded = JSON.parse(inputsLine.slice(INPUTS_MARKER.length));
      await writeProbeCache(PROBE_CACHE, ROOT, [...PROBE_KEY_FILES, ...loaded], registry);
    } catch (error) {
      log.push(`[strip-nc] (probe result not cached: ${error.message})`);
    }
  }
  return { log, registry, note: `probed in ${((Date.now() - started) / 1000).toFixed(1)} s` };
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('[strip-nc] dist/ not found — run `vite build` first.');
    process.exit(1);
  }
  // Step 2 does not read dist/: find the registry while step 1 deletes.
  const registry = cachedRegistry().then((cached) => cached ?? probeRegistry()).catch((error) => ({ log: [], error }));

  // 1. delete quarantined trees from dist
  for (const dir of STRIP_DIRS) {
    if (existsSync(dir)) {
      await rm(dir, { recursive: true, force: true });
      console.log(`[strip-nc] removed ${path.relative(ROOT, dir)}`);
    } else {
      console.log(`[strip-nc] (already absent) ${path.relative(ROOT, dir)}`);
    }
  }
  // 1b. tool-only public files never ship (FE-P15)
  const toolOnly = toolOnlyPublicFiles(DIST);
  for (const { path: file } of toolOnly) await rm(path.join(DIST, file), { force: true });
  const toolOnlyBytes = toolOnly.reduce((sum, entry) => sum + entry.bytes, 0);
  console.log(`[strip-nc] removed ${toolOnly.length} tool-only public files (${(toolOnlyBytes / 1048576).toFixed(1)} MB)`);

  // 2. cross-check: registered playables must not point at deleted paths.
  // The browser's boot-light fleet facade is imported in a subprocess. This
  // exercises the exact registry order without loading every visual builder,
  // and isolates its module cache from the postbuild guard. The guard fails
  // closed if the complete registry cannot be produced. Recovered rows remain
  // in ALL_TANK_IDS; restricted source overrides resolve the public way in the
  // probe because import.meta.env is absent under Node.
  const { log, registry: probed, error, note } = await registry;
  for (const line of log) console.log(line);
  if (!probed) {
    console.error('[strip-nc] FAIL: spec registry unavailable — cannot verify that no');
    console.error('[strip-nc] registered playable ships a stripped NC path. Refusing to pass.');
    if (error) console.error(`[strip-nc] probe error: ${error.message}`);
    process.exit(1);
  }
  const { allIds: ALL_TANK_IDS, sources } = probed;
  console.log(`[strip-nc] registry probe: ${ALL_TANK_IDS.length} playables, ${Object.keys(sources).length} GLB-sourced (${note})`);

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

// Run as a command, compared by real path: a checkout reached through a symlink must never skip this silently.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('[strip-nc] FAILED:', e); process.exit(1); });
}
