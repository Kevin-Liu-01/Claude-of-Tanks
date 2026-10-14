#!/usr/bin/env node

/**
 * Capture the exact rendered-map collision records for dedicated servers.
 *
 * Usage:
 *   npx vite --host 127.0.0.1 --port 5197
 *   agent-browser --session cot-manifest open http://127.0.0.1:5197/
 *   node tools/capture-world-collision-manifests.mjs cot-manifest
 *   node tools/capture-world-collision-manifests.mjs cot-manifest --maps whiteout
 *
 * Round 61 (2026-09-24): the headless mode needs no session or dev server — it serves THIS checkout on a private
 * vite server (a 5300–5399 port, its own optimizer cache; tools/map-probe-runtime.mjs) in a headless Chrome
 * (`--use-gl=angle`), waits for window.__GAME_READY, switches maps through window.__DEBUG.switchMap and runs the
 * same pack script as the session mode, so a lane recaptures a map's shard on its own tree:
 *   node tools/capture-world-collision-manifests.mjs --headless --maps autumn
 * Hold the shared probe mutex around it and run it under nice -n 19 like the other probes; a partial capture keeps
 * every other shard byte-identical (assertUnchangedCollisionShards) and republishes the complete index.
 *
 * 2026-10-01 (maps-and-layouts lane): the rendered world's records come from three deterministic builders that also
 * run in Node (tools/headlessWorldCollision.mjs). `--node` regenerates shards without a browser or a dev server.
 * `--check` builds and compares without writing, and exits 1 when a committed shard has drifted from the tree. A
 * browser capture and the Node build can disagree in the last packed digit of a rare record (the two engines' Math
 * functions round apart), so a record counts as drifted only when a number moves by more than CHECK_ROUNDING_M or
 * anything else differs:
 *   node tools/capture-world-collision-manifests.mjs --node --maps desert
 *   node tools/capture-world-collision-manifests.mjs --check
 *   node tools/capture-world-collision-manifests.mjs --tier=mobile   # a phone's build against the desktop's shards
 *
 * 2026-10-13 (speed): `--jobs=N` (2-8) splits a Node build of more than one map (a regeneration of every map, a check,
 * the phone tier, a variant) round-robin over N child processes of this tool. Each child builds its share, writes its
 * shards and closes with a `job-done` line naming the maps it found drifted (tools/collisionSplitBuild.mjs); the parent
 * prints the per-map lines in map order, publishes the index itself, and exits 1 on a reported drift, or 2 when a child
 * is unsound (any non-zero exit, no job-done line, a missing map). Without `--jobs` (or with `--jobs=1`) the build is
 * the serial one, as before: every map after every earlier map in one process, as a page that changes battlefields
 * builds them. A split builds each map after its share's earlier maps only, and its check says so in its summary. So
 * the split is for regenerating every map, and the landing checks stay serial (docs/DEVELOPMENT.md). 2026-10-14: a
 * regeneration of some maps never splits (collisionCaptureOptions refuses --jobs with --maps there). Serially it builds
 * each map after the selected maps before it, an order the serial check never builds, so the check can report a build
 * that depends on them; a split would build them apart and write what the check builds (Polders bending Reservoir
 * through an injected cache passed that way and failed origin/main's serial procedure).
 *   node tools/capture-world-collision-manifests.mjs --node --jobs=4
 *   node tools/capture-world-collision-manifests.mjs --node --variant=assault-trenches --jobs=4
 *   node tools/capture-world-collision-manifests.mjs --node --maps polders,reservoir      # some maps: always serial
 *   node tools/capture-world-collision-manifests.mjs --check                              # serial
 * A split's children never outlive it: a wall-clock alarm or a kill of the parent ends them too, before they write.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  assertUnchangedCollisionShards, collisionCaptureOptions, readCollisionCaptureEntries, readCollisionManifestVariants,
  collisionManifestDirectory, writeCollisionManifestIndex, writeCollisionManifestShard,
} from './worldCollisionManifestFiles.mjs';
import { packCollisionRecord } from './headlessWorldCollision.mjs';
import {
  armCollisionJobChild, collisionBuildMode, collisionJobDoneLine, runCollisionSplitBuild,
} from './collisionSplitBuild.mjs';

const options = collisionCaptureOptions(process.argv.slice(2));
/** serial (the default), split (--jobs=N), or a split's child; a child marker this process's parent never set exits 2 */
const build = (() => {
  try { return collisionBuildMode(options); } catch (error) { console.error(error.message); process.exit(2); }
})();
/** A child of a split Node build: it builds and writes its share of the maps; its parent publishes the index. */
const jobChild = build.mode === 'child';
const splitBuild = build.mode === 'split';
/** A child stops the moment its parent is gone (a watchdog thread, and this check before each map and each shard). */
const whileParentLives = jobChild ? armCollisionJobChild(build.parent) : () => {};
/** Two packed decimals of 4 places that round apart differ by one unit in the last place; anything more is drift. */
const CHECK_ROUNDING_M = 2e-4;
/** The first difference beyond rounding between two decoded manifests (null when none), and the records within it. */
function compareDecoded(committed, tree) {
  let rounded = 0;
  const same = (a, b) => {
    if (typeof a === 'number' && typeof b === 'number') {
      if (a === b) return true;
      if (Math.abs(a - b) <= CHECK_ROUNDING_M) { rounded++; return true; }
      return false;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
      return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, i) => same(value, b[i]));
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      const keys = Object.keys(a);
      return keys.length === Object.keys(b).length && keys.every((key) => key in b && same(a[key], b[key]));
    }
    return a === b;
  };
  for (const list of ['obstacles', 'colliders', 'concealers']) {
    const a = committed[list] ?? [], b = tree[list] ?? [];
    if (a.length !== b.length) return { difference: `${list} ${a.length} committed, ${b.length} in the tree`, rounded };
    for (let i = 0; i < a.length; i++) {
      if (!same(a[i], b[i])) return { difference: `${list}[${i}] ${JSON.stringify(a[i]).slice(0, 120)} -> ${JSON.stringify(b[i]).slice(0, 120)}`, rounded };
    }
  }
  return { difference: null, rounded };
}
const { session } = options;
// a split build's parent holds the complete index (and checks the unchanged shards) for its children
const maps = options.partial && !jobChild ? readCollisionCaptureEntries(options.mapIds) : {};
const CAPTURE_TIMEOUT_MS = 60_000;
/** The headless page boots the whole fleet index before __GAME_READY; a cold optimizer cache adds a minute. */
const HEADLESS_READY_TIMEOUT_MS = 300_000;
const HEADLESS_CAPTURE_TIMEOUT_MS = 240_000;

/** The capture script the page evaluates: switch to the map, then pack every record the way the server reads it. */
export function collisionCaptureScript(mapId) {
  return `(async () => {
    const world = await window.__DEBUG.switchMap(${JSON.stringify(mapId)});
    const n = (value) => Math.round(value * 10000) / 10000;
    const pack = ${packCollisionRecord.toString()};
    return {
      obstacles: world.getObstacles().map(pack),
      // Tree trunks are the exact same logical record for movement and shell
      // raycasts. Version 2 stores them once in obstacles; the headless world
      // reuses that object in its collider grid instead of inflating a clone.
      colliders: world.getColliders().filter((record) => record.treeIdx == null).map(pack),
      concealers: world.getConcealment().map((entry) => [n(entry.x), n(entry.z), n(entry.r), n(entry.add)]),
    };
  })()`;
}

function evaluate(script) {
  const raw = execFileSync('agent-browser', [
    '--session', session,
    '--json',
    'eval',
    script,
  ], {
    encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
    timeout: CAPTURE_TIMEOUT_MS, killSignal: 'SIGTERM',
  });
  const envelope = JSON.parse(raw);
  if (!envelope.success) throw new Error(envelope.error || 'browser evaluation failed');
  return envelope.data.result;
}

function publish(mapId, data) {
  whileParentLives();
  maps[mapId] = writeCollisionManifestShard(mapId, data);
  console.log(`${mapId}: ${data.obstacles.length} obstacles, ` +
    `${data.colliders.length} colliders, ${data.concealers.length} concealers`);
  if (jobChild) console.log(`job-entry ${mapId} ${JSON.stringify(maps[mapId])}`);
}

/** A check's closing line; a split check's says what it did not check (a map built after the other shares' maps). */
function checkSummary(drifted) {
  const total = options.mapIds.length;
  const split = splitBuild ? ` (split over ${Math.min(build.jobs, total)} jobs: no map built after the other shares'`
    + ' maps; the serial check without --jobs builds each after every earlier map)' : '';
  return (options.variant ? `${total - drifted}/${total} ${options.variant} shards match the tree`
    : `${total - drifted}/${total} collision shards match the tree${options.tier ? ` built at the ${options.tier} tier` : ''}`) + split;
}

/** Publish a variant's index entries beside the committed index's maps and other variants. */
function publishVariantIndex(index, variants, entries) {
  writeCollisionManifestIndex(index.maps, collisionManifestDirectory, { ...variants, [options.variant]: entries });
  console.log(`captured ${options.mapIds.length} ${options.variant} shards; published the index with ${Object.keys(entries).length} of them`);
}

/** Publish the base index last, after every selected map has been captured (a partial capture keeps the rest). */
function publishBaseIndex() {
  if (options.partial) assertUnchangedCollisionShards(maps, options.mapIds);
  writeCollisionManifestIndex(maps);
  console.log(`captured ${options.mapIds.length} map shards; published ${Object.keys(maps).length}-map index at ` +
    fileURLToPath(new URL('index.json', collisionManifestDirectory)));
}

if (splitBuild) {
  // tools/collisionSplitBuild.mjs holds the children's protocol and the verdict: 2 when any child is unsound, and a
  // drift is only ever what a child reports in its job-done line, never inferred from its exit code. A variant's
  // regeneration extends the index it read before the build, as the serial run does.
  const variantIndex = options.variant && !options.check
    ? { index: JSON.parse(readFileSync(new URL('index.json', collisionManifestDirectory), 'utf8')), variants: readCollisionManifestVariants() }
    : null;
  const { code, drifted, entries } = await runCollisionSplitBuild({
    tool: fileURLToPath(import.meta.url), argv: process.argv.slice(2), mapIds: options.mapIds, jobs: build.jobs,
    check: options.check, variant: options.variant ?? null,
  });
  if (code === 2) process.exit(2);
  if (options.check) {
    console.log(checkSummary(drifted.length));
    process.exit(code);
  }
  if (variantIndex) {
    const merged = { ...(variantIndex.variants[options.variant] ?? {}) };
    for (const mapId of options.mapIds) merged[mapId] = entries.get(mapId);
    publishVariantIndex(variantIndex.index, variantIndex.variants, merged);
  } else {
    for (const mapId of options.mapIds) maps[mapId] = entries.get(mapId);
    publishBaseIndex();
  }
  process.exit(0);
} else if (options.node && options.variant) {
  // 2026-10-08 (destruction core lane): a mode's battlefield variant, built from the variant's config into
  // `<map>@<variant>.json`; the base shards and the index's maps stay as they are
  const { buildWorldCollisionData } = await import('./headlessWorldCollision.mjs');
  const { readCollisionManifest } = await import('../server/collisionManifestFormat.ts');
  const { encodeCollisionManifest, decodeCollisionManifest } = await import('../server/collisionManifestCodec.ts');
  const index = JSON.parse(readFileSync(new URL('index.json', collisionManifestDirectory), 'utf8'));
  const variants = readCollisionManifestVariants();
  const entries = { ...(variants[options.variant] ?? {}) };
  const drifted = [];
  for (const mapId of options.mapIds) {
    if (jobChild) { whileParentLives(); console.log(`job-map ${mapId}`); }
    const data = await buildWorldCollisionData(mapId, { variant: options.variant });
    const label = `${mapId}@${options.variant}`;
    if (!options.check) {
      whileParentLives();
      entries[mapId] = writeCollisionManifestShard(mapId, data, collisionManifestDirectory, options.variant);
      console.log(`${label}: ${data.obstacles.length} obstacles, ${data.colliders.length} colliders, ${data.concealers.length} concealers`);
      if (jobChild) console.log(`job-entry ${label} ${JSON.stringify(entries[mapId])}`);
      continue;
    }
    const encoded = encodeCollisionManifest(readCollisionManifest(data));
    const text = JSON.stringify(encoded);
    const sha256 = createHash('sha256').update(text).digest('hex');
    const committed = index.variants?.[options.variant]?.[mapId];
    if (committed?.sha256 === sha256 && committed?.bytes === Buffer.byteLength(text)) { console.log(`${label}: current`); continue; }
    if (!committed) { drifted.push(mapId); console.log(`${label}: MISSING`); continue; }
    const committedShard = JSON.parse(readFileSync(new URL(`${label}.json`, collisionManifestDirectory), 'utf8'));
    const { difference, rounded } = compareDecoded(decodeCollisionManifest(committedShard), decodeCollisionManifest(encoded));
    if (difference) { drifted.push(mapId); console.log(`${label}: DRIFTED (${difference})`); }
    else console.log(`${label}: current (${rounded} packed numbers differ in the last digit)`);
  }
  // a split build's child reports its drift in its closing line and exits 0; its parent gives the verdict
  if (jobChild) console.log(collisionJobDoneLine(options.mapIds, drifted));
  else if (options.check) {
    console.log(checkSummary(drifted.length));
    process.exit(drifted.length ? 1 : 0);
  } else publishVariantIndex(index, variants, entries);
  process.exit(0);
} else if (options.node) {
  if (options.tier) {
    // the phone tier (destruction core lane, 2026-10-08): the device tier resolves once per process, before any build
    // reads it; the committed shards are the desktop's, so a phone's build must match them index for index
    globalThis.window ??= {};
    globalThis.window.location = { search: `?tier=${options.tier}` };
    globalThis.window.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
    const { resolveDeviceTier } = await import('../src/engine/quality.ts');
    if (resolveDeviceTier() !== options.tier) throw new Error(`the ${options.tier} tier did not resolve`);
    console.log(`building at the ${options.tier} tier against the desktop's committed shards`);
  }
  const { buildWorldCollisionData } = await import('./headlessWorldCollision.mjs');
  const { readCollisionManifest } = await import('../server/collisionManifestFormat.ts');
  const { encodeCollisionManifest } = await import('../server/collisionManifestCodec.ts');
  const index = JSON.parse(readFileSync(new URL('index.json', collisionManifestDirectory), 'utf8'));
  const drifted = [];
  const { decodeCollisionManifest } = await import('../server/collisionManifestCodec.ts');
  // 2026-10-07 (map-vehicles lane): COT_DRAWN_GEOMETRY_SHAPE=1 (the drift receipt sets it) also walks every node of
  // the built props and vegetation that holds a geometry for V8's fast properties (src/world/geometryStreams.ts), on
  // this same build, so the shape check costs no second world build; one line per map, read by the receipt
  const shape = process.env.COT_DRAWN_GEOMETRY_SHAPE === '1' ? await import('../src/world/geometryStreams.test-support.mjs') : null;
  const inspect = shape ? ({ mapId, flora, dressing }) => {
    const offenders = [];
    const walked = shape.auditDrawnGeometry(flora.group, 'vegetation', offenders)
      + shape.auditDrawnGeometry(dressing.group, 'props', offenders);
    let standIns = 0;
    dressing.group.traverse((node) => { if (/^destructible-.+-shadow$/.test(node.name)) standIns++; });
    console.log(`drawn-shape ${mapId}: ${walked} walked, ${standIns} stand-ins, ${offenders.length} offenders`
      + (offenders.length ? ` (${offenders.slice(0, 6).join('; ')})` : ''));
  } : undefined;
  for (const mapId of options.mapIds) {
    if (jobChild) { whileParentLives(); console.log(`job-map ${mapId}`); }
    const data = await buildWorldCollisionData(mapId, { inspect });
    if (!options.check) { publish(mapId, data); continue; }
    const encoded = encodeCollisionManifest(readCollisionManifest(data));
    const text = JSON.stringify(encoded);
    const sha256 = createHash('sha256').update(text).digest('hex');
    const committed = index.maps[mapId];
    if (committed?.sha256 === sha256 && committed?.bytes === Buffer.byteLength(text)) {
      console.log(`${mapId}: current`);
      continue;
    }
    const committedShard = JSON.parse(readFileSync(new URL(`${mapId}.json`, collisionManifestDirectory), 'utf8'));
    const { difference, rounded } = compareDecoded(decodeCollisionManifest(committedShard), decodeCollisionManifest(encoded));
    if (difference) {
      drifted.push(mapId);
      console.log(`${mapId}: DRIFTED (${difference})`);
    } else {
      console.log(`${mapId}: current (${rounded} packed numbers differ in the last digit)`);
    }
  }
  if (jobChild) {
    console.log(collisionJobDoneLine(options.mapIds, drifted));
    process.exit(0);
  }
  if (options.check) {
    console.log(checkSummary(drifted.length));
    if (drifted.length) process.exit(1);
    process.exit(0);
  }
} else if (options.headless) {
  const { openGamePage, withMapProbeSession } = await import('./map-probe-runtime.mjs');
  const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  await withMapProbeSession({ root, cacheDir: options.cacheDir, launch: { width: 1280, height: 720 } }, async ({ browser, port }) => {
    const { page, errors } = await openGamePage(browser, {
      port, viewport: { width: 1280, height: 720 }, readyTimeoutMs: HEADLESS_READY_TIMEOUT_MS,
    });
    try {
      for (const mapId of options.mapIds) {
        console.log(`capturing ${mapId} headless on ${root} (timeout ${HEADLESS_CAPTURE_TIMEOUT_MS / 1000}s)`);
        const data = await page.evaluate(collisionCaptureScript(mapId));
        if (errors.length) throw new Error(`page errors before ${mapId} was packed:\n${errors.join('\n')}`);
        publish(mapId, data);
      }
    } finally {
      await page.close().catch(() => {});
    }
  });
} else {
  const ready = evaluate('typeof window.__DEBUG === "object"');
  if (!ready) throw new Error('game debug facade is not ready in the capture browser');
  for (const mapId of options.mapIds) {
    console.log(`capturing ${mapId} (timeout ${CAPTURE_TIMEOUT_MS / 1000}s)`);
    publish(mapId, evaluate(collisionCaptureScript(mapId)));
  }
}

// a split build's child leaves the index to its parent
if (!jobChild) publishBaseIndex();
