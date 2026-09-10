#!/usr/bin/env node
// CPU-only same-source comparison; owns the shared FIFO, never double-wrap.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { cpus, loadavg } from 'node:os';
import { isAbsolute } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';

const ids = ['t64bv1', 't80u', 't80bv', 't90m', 'm1a1ha_x', 'merkava1b'];
const [out, mode = 'geometry-only'] = process.argv.slice(2);
assert.ok(out && isAbsolute(out) && process.argv.length <= 4
  && ['geometry-only', 'rendered'].includes(mode),
  'Usage: node tools/battle-era-receipt-bench.mjs /absolute/new-report.json [geometry-only|rendered]');
const lock = createCaptureLock();
const samples = [];
const startedAt = new Date().toISOString();
const startingLoad = loadavg();
const warnings = [];
const nativeWarn = console.warn;

function timing(visual, wallMs) {
  const t = visual.root.userData.coreBuildTiming;
  assert.ok(t && Number.isFinite(t.finishedAt));
  return { wallMs, coreMs: t.finishedAt - t.startedAt,
    authoredMs: t.authoredFinishedAt - t.authoredStartedAt,
    bindMergeMs: t.bindMergeFinishedAt - t.authoredFinishedAt,
    assemblyMs: t.finishedAt - t.bindMergeFinishedAt,
    receiptPlates: visual.root.userData.eraVisualBindingReceipt?.plates.length ?? 0,
    clusterCount: visual.root.userData.eraClusterNames.length };
}

await lock.acquire(45 * 60 * 1000);
const refresher = setInterval(() => lock.refresh(), 30000);
refresher.unref();
try {
  // Cosmetic stowage can need Canvas even when the core uses map-free paint.
  const require = createRequire(import.meta.url);
  const { createCanvas, ImageData, Path2D } = require('@napi-rs/canvas');
  globalThis.ImageData = ImageData;
  globalThis.Path2D = Path2D;
  globalThis.document = { createElement(tag) {
    assert.equal(tag, 'canvas'); return createCanvas(1, 1);
  } };
  console.warn = (...args) => { warnings.push(args.map(String).join(' ')); nativeWarn(...args); };
  const { createTank, ensureTankBuilder } = await import('../src/vehicles/fleetFactory.ts');
  for (const id of ids) await ensureTankBuilder(id);
  for (let round = 0; round < 4; round++) {
    for (const id of ids) {
      for (const enabled of round % 2 ? [false, true] : [true, false]) {
        const started = performance.now();
        const visual = createTank(id, null, { camoSeed: 4242, quality: 'ai',
          geometryQuality: 'low', batchStatic: true, battleDetailLod: true,
          materialMode: mode, eraVisualBindingReceipt: enabled });
        try {
          assert.equal(Object.hasOwn(visual.root.userData, 'eraVisualBindingReceipt'), enabled);
          const sample = { round, id, enabled, ...timing(visual, performance.now() - started) };
          samples.push(sample);
          console.log(JSON.stringify(sample));
        } finally { visual.dispose(); }
      }
    }
  }
  const source = readFileSync(new URL('../src/vehicles/tankFactoryCore.ts', import.meta.url));
  const report = { protocol: 'battle-era-receipt-cpu-v1', startedAt,
    finishedAt: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    sourceSha256: createHash('sha256').update(source).digest('hex'),
    node: process.version, cpu: cpus()[0]?.model, startingLoad, endingLoad: loadavg(),
    mode, options: { camoSeed: 4242, quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: true },
    scope: 'Same-process alternating order, all four rounds retained including cold first use. Actual authored builders; imports and disposal excluded. Geometry-only mode also enables static preview and skips rest-contact/UV/dirt work; rendered mode uses native Canvas2D. Assembly covers core post-merge, not later decoration/static batching. Non-await elapsed, not browser/GPU frame time or network/player performance certification.',
    warnings, samples };
  writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  assert.deepEqual(warnings, [], 'No silently omitted decoration or other construction warnings');
} finally { console.warn = nativeWarn; clearInterval(refresher); lock.release(); }
