// gear-frame-bench (gear-alloc-279): the option contract, the percentile pick, and the running gear's per-frame
// allocation budget on a small rig. First-party tooling: Kevin B. Liu.
//
// The budget: four gear units' conform + update over rough ground, 200 frames after a 600-frame warm-up, in a fresh
// process (the bench re-runs itself with --expose-gc and a 512 MB semi-space). What it still counts is the ground
// sampler's call contract (a scalar callback: V8 boxes the doubles passed to and returned from it) and a few KB in
// conform; the gear's other per-frame work allocates nothing. origin/main before gear-alloc-279 allocated about
// BUDGET_BEFORE_BYTES a frame on this rig.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GEAR_BENCH_IDS, GEAR_POSE_IDS, parseOptions, percentiles } from './gear-frame-bench.mjs';
// the rig the bench loads through --root (a dynamic import): named here so an edit to the gear re-runs this receipt
import '../src/vehicles/tankFactoryCore.ts';
import '../src/vehicles/hydraulicSuspension.ts';
import '../src/vehicles/loadedTrackContact.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_IDS = ['t90am', 'merkava4', 'strv103b', 'type10'];
const BUDGET_BYTES_PER_FRAME = 60_000; // the lane measured ~40.4 KB (2 runs), mostly the sampler contract; 1.5x margin
const BUDGET_BEFORE_BYTES = 290_000; // origin/main 1e7afa12dc measured 282-312 KB on this rig

const defaults = parseOptions([]);
assert.equal(defaults.root, ROOT);
assert.deepEqual(defaults.ids, GEAR_BENCH_IDS);
assert.equal(GEAR_BENCH_IDS.length, 16);
assert.deepEqual({ warm: defaults.warm, frames: defaults.frames, allocFrames: defaults.allocFrames, poses: defaults.poses },
  { warm: 300, frames: 1200, allocFrames: 200, poses: null });
assert.deepEqual(parseOptions(['--poses=/tmp/p.json']).ids, GEAR_POSE_IDS);
assert.ok(GEAR_POSE_IDS.includes('merkava3d'), 'the pose receipt reaches a non-rigid shoe course');
assert.deepEqual(parseOptions(['--ids=a,b,,c']).ids, ['a', 'b', 'c']);
for (const args of [['--ids=,'], ['--frames=0'], ['--warm=1.5'], ['--alloc-frames=x'], ['--nope']]) {
  assert.throws(() => parseOptions(args), undefined, args.join(' '));
}
assert.deepEqual(percentiles([5, 1, 4, 2, 3]), { mean: 3, p50: 3, p95: 5 });
assert.deepEqual(percentiles(Float64Array.of(2, 1)), { mean: 1.5, p50: 2, p95: 2 });

const run = spawnSync(process.execPath, [resolve(ROOT, 'tools/gear-frame-bench.mjs'), `--ids=${BUDGET_IDS.join(',')}`,
  '--warm=600', '--frames=100', '--alloc-frames=200', '--label=selftest'], { encoding: 'utf8', cwd: ROOT });
assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
const line = run.stdout.split('\n').find((l) => l.startsWith('GEAR_BENCH '));
assert.ok(line, run.stdout);
const record = JSON.parse(line.slice('GEAR_BENCH '.length));
assert.equal(record.tanks, BUDGET_IDS.length);
assert.ok(record.bytesPerFrame <= BUDGET_BYTES_PER_FRAME,
  `running gear allocates ${record.bytesPerFrame} B/frame on ${BUDGET_IDS.join(', ')}; budget ${BUDGET_BYTES_PER_FRAME} `
  + `(origin/main before gear-alloc-279: ~${BUDGET_BEFORE_BYTES}). node tools/gear-frame-bench.mjs --alloc-sites=15 `
  + `--ids=${BUDGET_IDS.join(',')} names the sites.`);
console.log(`gear-frame-bench selftest: PASS (${record.units} gear units, ${record.bytesPerFrame} B/frame <= ${BUDGET_BYTES_PER_FRAME})`);
