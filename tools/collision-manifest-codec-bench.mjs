#!/usr/bin/env node
// Compare matched current raw and dictionary shards. Fresh Node processes make
// module/loader caches cold; filesystem cache is NOT flushed. No browser/GPU.
// node tools/collision-manifest-codec-bench.mjs <before-directory> <after-directory> [pairs=6]
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCollisionManifestLoader } from '../server/collisionManifestLoader.ts';

if (process.argv[2] === '--worker') {
  assert.equal(typeof globalThis.gc, 'function', 'worker requires --expose-gc');
  const directory = pathToFileURL(resolve(process.argv[3]) + '/');
  const settle = () => { globalThis.gc(); globalThis.gc(); return process.memoryUsage(); };
  const baseline = settle();
  const start = performance.now();
  const loader = createCollisionManifestLoader(directory);
  const times = [];
  for (const id of Object.keys(loader.stats())) {
    const before = performance.now();
    loader.get(id);
    times.push(performance.now() - before);
  }
  const elapsedMs = performance.now() - start;
  const retained = settle();
  assert.equal(loader.cacheStats().idleMaps, 2);
  console.log(JSON.stringify({
    maps: times.length, elapsedMs, times,
    heapBytes: retained.heapUsed - baseline.heapUsed,
    arrayBufferBytes: retained.arrayBuffers - baseline.arrayBuffers,
  }));
} else {
  const before = process.argv[2], after = process.argv[3];
  const pairs = Number(process.argv[4] ?? 6);
  assert.ok(before && after && Number.isInteger(pairs) && pairs >= 2 && pairs <= 20,
    'usage: node tools/collision-manifest-codec-bench.mjs <before-directory> <after-directory> [pairs=6]');
  const runs = [];
  for (let pair = 0; pair < pairs; pair++) {
    const order = pair % 2 ? ['after', 'before'] : ['before', 'after'];
    for (const variant of order) {
      const child = spawnSync(process.execPath, [
        '--expose-gc', fileURLToPath(import.meta.url), '--worker', variant === 'before' ? before : after,
      ], { encoding: 'utf8', timeout: 60_000 });
      if (child.error) throw child.error;
      assert.equal(child.status, 0, child.stderr);
      runs.push({ pair, variant, ...JSON.parse(child.stdout) });
    }
  }
  const median = (values) => {
    const ordered = values.toSorted((a, b) => a - b);
    return (ordered[Math.floor((ordered.length - 1) / 2)] + ordered[Math.floor(ordered.length / 2)]) / 2;
  };
  const summary = (variant) => {
    const selected = runs.filter((run) => run.variant === variant);
    return Object.fromEntries(['elapsedMs', 'heapBytes', 'arrayBufferBytes'].map((key) => [
      key, { median: median(selected.map((run) => run[key])), min: Math.min(...selected.map((run) => run[key])),
        max: Math.max(...selected.map((run) => run[key])) },
    ]));
  };
  console.log(JSON.stringify({
    scope: 'fresh-process cold loader; same current geometry, warm/unspecified OS file cache; 30-map sweep, idle retention 2',
    pairs, before: summary('before'), after: summary('after'), runs,
  }, null, 2));
}
