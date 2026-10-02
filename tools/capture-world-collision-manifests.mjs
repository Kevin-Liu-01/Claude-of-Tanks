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
 * run in Node (tools/headlessWorldCollision.mjs), and the Node build encodes byte-identically to the browser capture.
 * `--node` regenerates shards without a browser or a dev server; `--check` builds and compares without writing and
 * exits 1 when a committed shard has drifted from the tree:
 *   node tools/capture-world-collision-manifests.mjs --node --maps desert
 *   node tools/capture-world-collision-manifests.mjs --check
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  assertUnchangedCollisionShards, collisionCaptureOptions, readCollisionCaptureEntries,
  collisionManifestDirectory, writeCollisionManifestIndex, writeCollisionManifestShard,
} from './worldCollisionManifestFiles.mjs';
import { packCollisionRecord } from './headlessWorldCollision.mjs';

const options = collisionCaptureOptions(process.argv.slice(2));
const { session } = options;
const maps = options.partial ? readCollisionCaptureEntries(options.mapIds) : {};
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
  maps[mapId] = writeCollisionManifestShard(mapId, data);
  console.log(`${mapId}: ${data.obstacles.length} obstacles, ` +
    `${data.colliders.length} colliders, ${data.concealers.length} concealers`);
}

if (options.node) {
  const { buildWorldCollisionData } = await import('./headlessWorldCollision.mjs');
  const { readCollisionManifest } = await import('../server/collisionManifestFormat.ts');
  const { encodeCollisionManifest } = await import('../server/collisionManifestCodec.ts');
  const index = JSON.parse(readFileSync(new URL('index.json', collisionManifestDirectory), 'utf8'));
  let drifted = 0;
  for (const mapId of options.mapIds) {
    const data = await buildWorldCollisionData(mapId);
    if (!options.check) { publish(mapId, data); continue; }
    const text = JSON.stringify(encodeCollisionManifest(readCollisionManifest(data)));
    const sha256 = createHash('sha256').update(text).digest('hex');
    const committed = index.maps[mapId];
    const current = committed?.sha256 === sha256 && committed?.bytes === Buffer.byteLength(text);
    if (!current) drifted++;
    console.log(`${mapId}: ${current ? 'current' : `DRIFTED (committed ${committed?.sha256?.slice(0, 12)} ${committed?.bytes} B, tree ${sha256.slice(0, 12)} ${Buffer.byteLength(text)} B)`}`);
  }
  if (options.check) {
    console.log(`${options.mapIds.length - drifted}/${options.mapIds.length} collision shards match the tree`);
    if (drifted) process.exit(1);
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

if (options.partial) assertUnchangedCollisionShards(maps, options.mapIds);
writeCollisionManifestIndex(maps);
console.log(`captured ${options.mapIds.length} map shards; published ${Object.keys(maps).length}-map index at ` +
  fileURLToPath(new URL('index.json', collisionManifestDirectory)));
