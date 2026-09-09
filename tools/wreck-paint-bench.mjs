#!/usr/bin/env node
// CPU-only exact-source comparison. This process owns the FIFO; do not wrap it.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { arch, cpus, platform } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';

const TOOL = fileURLToPath(import.meta.url);
export const RECIPES = Object.freeze([
  Object.freeze({ specId: 't90m', seed: 2526, pop: false }),
  Object.freeze({ specId: 'k2', seed: 2002, pop: true }),
]);
const CATEGORIES = ['constructor', 'collection', 'normalization', 'painting', 'compaction', 'rest'];
const hash = value => createHash('sha256').update(value).digest('hex');
const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

export function parseArgs(args) {
  const options = {};
  for (const arg of args) {
    const match = /^--(baseline|candidate|out)=(.+)$/.exec(arg);
    assert.ok(match && !Object.hasOwn(options, match[1]), `Unknown or duplicate argument: ${arg}`);
    assert.ok(isAbsolute(match[2]), 'Source and output paths must be absolute');
    options[match[1]] = resolve(match[2]);
  }
  assert.equal(Object.keys(options).length, 3, 'Require --baseline, --candidate and --out absolute paths');
  assert.notEqual(options.baseline, options.candidate, 'Require two separately pinned source roots');
  return options;
}

export function schedule() {
  return Array.from({ length: 3 }, (_, round) => RECIPES.flatMap((recipe, recipeIndex) =>
    ['baseline', 'candidate'].map(role => ({ round: round + 1, recipeIndex, role, recipe })))).flat();
}

export function stageCategory(stage) {
  const name = stage.slice(stage.indexOf(':') + 1);
  if (name === 'construct') return 'constructor';
  if (name.startsWith('collect-')) return 'collection';
  if (name.startsWith('normalize-')) return 'normalization';
  if (name.startsWith('paint-vertices-')) return 'painting';
  if (name.startsWith('compact-')) return 'compaction';
  return 'rest';
}

function attributeIdentity(attribute) {
  if (!attribute) return null;
  return { name: attribute.name, count: attribute.count, itemSize: attribute.itemSize,
    normalized: attribute.normalized, usage: attribute.usage, gpuType: attribute.gpuType,
    arrayType: attribute.array.constructor.name, arrayLength: attribute.array.length, byteLength: attribute.array.byteLength,
    sha256: hash(bytes(attribute.array)) };
}

function validateGeometry(geometry) {
  if (!geometry) return;
  const position = geometry.attributes.position;
  assert.ok(position?.count > 0 && position.itemSize === 3, 'Require nonempty XYZ output');
  for (const attribute of Object.values(geometry.attributes)) {
    assert.equal(attribute.count, position.count, 'Every output stream must cover the same vertices');
    assert.equal(attribute.array.length, attribute.count * attribute.itemSize);
  }
  if (!geometry.index) return;
  assert.equal(geometry.index.itemSize, 1, 'Index metadata must describe scalar indices');
  for (const index of geometry.index.array) assert.ok(Number.isInteger(index) && index >= 0 && index < position.count);
}

export function outputIdentity(baked) {
  assert.ok(baked?.geo?.attributes.position, 'Actual geometry-only wreck bake must succeed');
  validateGeometry(baked.geo); validateGeometry(baked.shadowGeo);
  assert.equal(baked.tris * 3, baked.geo.index?.count ?? baked.geo.attributes.position.count);
  const geometry = geo => geo ? {
    name: geo.name, type: geo.type,
    attributes: Object.entries(geo.attributes).map(([name, attribute]) => [name, attributeIdentity(attribute)]),
    index: attributeIdentity(geo.index),
    morphAttributes: Object.entries(geo.morphAttributes).map(([name, attributes]) => [name, attributes.map(attributeIdentity)]),
    morphTargetsRelative: geo.morphTargetsRelative, groups: geo.groups, userData: geo.userData,
    drawRange: { start: geo.drawRange.start, count: String(geo.drawRange.count) },
    box: geo.boundingBox && [geo.boundingBox.min.toArray(), geo.boundingBox.max.toArray()],
    sphere: geo.boundingSphere && [geo.boundingSphere.center.toArray(), geo.boundingSphere.radius],
  } : null;
  // IDs/UUIDs are allocation identities, not geometry output; all stored streams
  // (including their order), index metadata and existing bounds are compared.
  const output = { hx: baked.hx, hz: baked.hz, h: baked.h, tris: baked.tris,
    visible: geometry(baked.geo), shadow: geometry(baked.shadowGeo) };
  const serialized = JSON.stringify(output, (_key, value) => {
    if (typeof value !== 'number') return value;
    if (Object.is(value, -0)) return '-0';
    return Number.isFinite(value) ? value : String(value);
  });
  return { sha256: hash(serialized), details: JSON.parse(serialized) };
}

export function measureSteps(steps, now = () => performance.now()) {
  const stages = [], categoryMs = Object.fromEntries(CATEGORIES.map(name => [name, 0]));
  let synchronousMs = 0, paintRows = 0, baked = null;
  try {
    for (let count = 0; count < 100000; count++) {
      const start = now();
      const result = steps.next();
      const durationMs = now() - start;
      const stage = result.done ? 'return-and-dispose' : result.value.stage;
      assert.ok(Number.isFinite(durationMs) && durationMs >= 0 && typeof stage === 'string');
      const category = stageCategory(stage);
      synchronousMs += durationMs; categoryMs[category] += durationMs;
      stages.push({ stage, category, durationMs });
      const paint = /:paint-vertices-(\d+)$/.exec(stage);
      if (paint) { assert.ok(Number(paint[1]) > paintRows); paintRows = Number(paint[1]); }
      if (result.done) {
        baked = result.value;
        assert.ok(paintRows > 0, 'Require a final real paint-vertices checkpoint');
        return { synchronousMs, categoryMs, paintRows, stages, output: outputIdentity(baked) };
      }
    }
    throw new Error('Wreck generator exceeded its bounded checkpoint count');
  } finally {
    try { steps.return(null); }
    finally { baked?.geo.dispose(); baked?.shadowGeo?.dispose(); }
  }
}

export function distribution(values) {
  assert.ok(values.length && values.every(value => Number.isFinite(value) && value >= 0));
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return { median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0], max: sorted.at(-1) };
}

export function summarize(samples) {
  const expected = schedule();
  assert.equal(samples.length, expected.length, 'Every planned fresh-process sample must finish');
  samples.forEach((sample, index) => {
    for (const key of ['round', 'recipeIndex', 'role', 'recipe']) assert.deepEqual(sample[key], expected[index][key]);
    assert.ok(Number.isInteger(sample.paintRows) && sample.paintRows > 0, 'Require observed final paint row count');
  });
  return RECIPES.map((recipe, recipeIndex) => {
    const rows = samples.filter(sample => sample.recipeIndex === recipeIndex);
    for (const row of rows) assert.deepEqual(row.output, rows[0].output, `Exact ${recipe.specId} output differs`);
    const roles = Object.fromEntries(['baseline', 'candidate'].map(role => {
      const runs = rows.filter(row => row.role === role);
      assert.equal(new Set(runs.map(row => row.paintRows)).size, 1, 'Paint row count must be deterministic');
      return [role, { samples: runs.length, paintRows: runs[0].paintRows,
        synchronousMs: distribution(runs.map(row => row.synchronousMs)),
        categoryMs: Object.fromEntries(CATEGORIES.map(name => [name, distribution(runs.map(row => row.categoryMs[name]))])),
        builderAcquisitionMs: distribution(runs.map(row => row.builderAcquisitionMs)),
        moduleImportMs: distribution(runs.map(row => row.moduleImportMs)) }];
    }));
    return { recipe, outputSha256: rows[0].output.sha256, ...roles,
      candidateMinusBaselineMedianMs: roles.candidate.synchronousMs.median - roles.baseline.synchronousMs.median };
  });
}

export function sourceTreeIdentity(root) {
  const digest = createHash('sha256'); let files = 0;
  assert.ok(lstatSync(join(root, 'src')).isDirectory(), 'Source src must be a real directory, not a symlink');
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      assert.ok(entry.isDirectory() || entry.isFile(), `Unsupported linked/special source entry: ${path}`);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && /\.(?:ts|js|mjs|json|bin\.gz)$/.test(path)) {
        digest.update(path.slice(root.length)).update(readFileSync(path)); files++;
      }
    }
  };
  visit(join(root, 'src'));
  return { hash: digest.digest('hex'), files };
}

function sourceIdentity(root) {
  const tree = sourceTreeIdentity(root);
  const require = createRequire(join(root, 'package.json'));
  const threeRoot = resolve(dirname(require.resolve('three')), '..'), threePackage = join(threeRoot, 'package.json');
  const packageHash = hash(readFileSync(join(root, 'package-lock.json')));
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceHash: hash(tree.hash + packageHash + readFileSync(join(root, 'package.json'), 'utf8')),
    sourceFiles: tree.files, packageLockHash: packageHash,
    wreckHash: hash(readFileSync(join(root, 'src/world/wrecks.ts'))),
    exactGeometryHash: hash(readFileSync(join(root, 'src/world/exactWreckGeometry.ts'))),
    three: { version: JSON.parse(readFileSync(threePackage, 'utf8')).version,
      packageHash: hash(readFileSync(threePackage)),
      moduleHash: hash(readFileSync(join(threeRoot, 'build/three.module.js'))),
      coreHash: hash(readFileSync(join(threeRoot, 'build/three.core.js'))),
      geometryUtilsHash: hash(readFileSync(join(threeRoot, 'examples/jsm/utils/BufferGeometryUtils.js'))),
      convexGeometryHash: hash(readFileSync(join(threeRoot, 'examples/jsm/geometries/ConvexGeometry.js'))),
      convexHullHash: hash(readFileSync(join(threeRoot, 'examples/jsm/math/ConvexHull.js'))),
      roundedBoxHash: hash(readFileSync(join(threeRoot, 'examples/jsm/geometries/RoundedBoxGeometry.js'))) } };
}

export function registerCancellation(getOwner, emitter = process) {
  let interrupted = false;
  const stop = () => { interrupted = true; getOwner()?.stop('Interrupted'); };
  emitter.on('SIGINT', stop); emitter.on('SIGTERM', stop);
  return { isInterrupted: () => interrupted,
    dispose() { emitter.off('SIGINT', stop); emitter.off('SIGTERM', stop); } };
}

/** Settlement means close (not exit/error), so the parent retains its lease
 * until the child and its IPC/stdout/stderr handles have drained. */
export function ownWorker(child, { timeoutMs = 30000, graceMs = 1000,
  setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let stdout = '', stderr = '', receipt, failure, forceTimer;
  const stop = reason => {
    failure ??= new Error(reason);
    child.kill('SIGTERM');
    forceTimer ??= setTimer(() => child.kill('SIGKILL'), graceMs);
  };
  const append = (name, data) => {
    const remaining = 256 * 1024 - stdout.length - stderr.length;
    const bounded = data.toString().slice(0, remaining);
    if (name === 'stdout') stdout += bounded; else stderr += bounded;
    if (data.length > remaining) stop('Worker output exceeded its bound');
  };
  const timer = setTimer(() => stop('Worker exceeded its time bound'), timeoutMs);
  child.stdout.on('data', data => append('stdout', data)); child.stderr.on('data', data => append('stderr', data));
  child.stdout.on('error', error => stop(String(error))); child.stderr.on('error', error => stop(String(error)));
  child.on('message', message => { if (receipt) stop('Duplicate worker receipt'); else receipt = message; });
  child.on('error', error => { failure ??= error; });
  const done = new Promise(resolveDone => child.once('close', (code, signal) => {
    clearTimer(timer); clearTimer(forceTimer);
    if (code !== 0 || signal) failure ??= new Error(`Worker closed with code=${code} signal=${signal}`);
    if (!receipt) failure ??= new Error('Worker did not return a receipt');
    resolveDone({ stdout, stderr, receipt, error: failure?.message ?? null });
  }));
  return { stop, done };
}

async function worker(root, recipeIndex) {
  assert.equal(process.env.COT_WRECK_BENCH_OWNER, String(process.ppid), 'Worker requires its capture-owning parent');
  assert.equal(typeof process.send, 'function');
  assert.equal(typeof globalThis.document, 'undefined', 'No DOM, Canvas or GPU fixture');
  assert.ok(RECIPES[recipeIndex]);
  const start = performance.now();
  const { ensureTankBuilder } = await import(pathToFileURL(join(root, 'src/vehicles/fleetFactory.ts')).href);
  const { bakeTankWreckSteps } = await import(pathToFileURL(join(root, 'src/world/wrecks.ts')).href);
  const moduleImportMs = performance.now() - start;
  const acquisition = performance.now(); await ensureTankBuilder(RECIPES[recipeIndex].specId);
  const builderAcquisitionMs = performance.now() - acquisition;
  const recipe = RECIPES[recipeIndex];
  const measured = measureSteps(bakeTankWreckSteps({ anisotropy: 4, setupShadowMaterial() {} }, recipe.specId, recipe));
  const receipt = { pid: process.pid, node: process.version, moduleImportMs, builderAcquisitionMs, ...measured };
  await new Promise((done, reject) => process.send(receipt, error => error ? reject(error) : done()));
  process.disconnect();
}

async function sampleWorker(options, job, ordinal, setOwner) {
  const child = spawn(process.execPath, [TOOL, '--worker', options[job.role], String(job.recipeIndex)], {
    cwd: options[job.role], stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, COT_WRECK_BENCH_OWNER: String(process.pid) },
  });
  const owner = ownWorker(child); setOwner(owner);
  console.log(`[wreck-paint-bench] sample=${ordinal} ${job.role}/${job.recipe.specId} childPid=${child.pid}`);
  try {
    const result = await owner.done;
    const stem = `${String(ordinal).padStart(2, '0')}-${job.role}-${job.recipe.specId}`;
    writeFileSync(join(options.out, `${stem}.json`), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    assert.equal(result.error, null, `${stem}: ${result.error}`);
    return { ...result.receipt, ...job };
  } finally { setOwner(null); }
}

async function run(options) {
  options.baseline = realpathSync(options.baseline); options.candidate = realpathSync(options.candidate);
  assert.notEqual(options.baseline, options.candidate, 'Resolved source roots must differ');
  mkdirSync(options.out); // Exclusive: an existing path, including a symlink, fails.
  const identities = () => Object.fromEntries(['baseline', 'candidate'].map(role => [role, sourceIdentity(options[role])]));
  const acquisition = () => ({ toolHash: hash(readFileSync(TOOL)),
    captureLockHash: hash(readFileSync(join(dirname(TOOL), 'capture-lock.mjs'))) });
  const report = { protocol: 'wreck-paint-cpu-comparison-v1', ok: false, startedAt: new Date().toISOString(),
    pid: process.pid, options, hardware: { platform: platform(), arch: arch(), cpu: cpus()[0]?.model ?? 'unknown',
      logicalCpus: cpus().length, node: process.version, executable: process.execPath },
    inputs: RECIPES, sourceIdentities: identities(), acquisition: acquisition(), samples: [], errors: [],
    factoryContract: { anisotropy: 4, quality: 'low', geometryQuality: 'low', materialMode: 'geometry-only',
      proceduralOnly: true, eraVisualBindingReceipt: false, destroyedAgeS: 1000,
      camoSeeds: RECIPES.map(recipe => 4000 + (recipe.seed % 997)) },
    limitations: ['Fresh Node module/cache lifetime for each recipe sample; OS file-cache state is unspecified',
      'CPU geometry-only factory and wreck generator; not browser loading, GPU, raster, quality or frame-time certification',
      'No warmups or source instrumentation; module imports and ensureTankBuilder acquisition are timed separately',
      'Stage categories charge next() to its returned checkpoint; boundary tails can be charged to the following stage',
      'Synchronous totals include generator return/temporary-owner disposal, exclude output hashing and final returned-geometry disposal',
      'Medians/min/max are observations with no timing threshold, statistical significance or performance pass claim'],
  };
  const write = () => writeFileSync(join(options.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const lock = createCaptureLock(); let owner = null, refresh;
  const cancellation = registerCancellation(() => owner);
  try {
    write(); console.log(`[wreck-paint-bench] stage=capture_lock pid=${process.pid} output=${options.out}`);
    await lock.acquire(45 * 60 * 1000);
    report.captureAcquiredAt = new Date().toISOString();
    refresh = setInterval(() => lock.refresh(), 30000); refresh.unref();
    assert.equal(cancellation.isInterrupted(), false, 'Interrupted while queued; no worker admitted');
    assert.deepEqual(identities(), report.sourceIdentities, 'Source changed while queued');
    assert.deepEqual(acquisition(), report.acquisition, 'Acquisition tool changed while queued');
    assert.deepEqual(report.sourceIdentities.baseline.three, report.sourceIdentities.candidate.three, 'Require matched installed Three.js');
    for (const job of schedule()) {
      assert.equal(cancellation.isInterrupted(), false, 'Interrupted before sample');
      report.samples.push(await sampleWorker(options, job, report.samples.length + 1, value => { owner = value; })); write();
    }
    report.summary = summarize(report.samples);
    assert.equal(new Set(report.samples.map(sample => sample.pid)).size, report.samples.length, 'Require independent child process identities');
    assert.ok(report.samples.every(sample => sample.node === process.version), 'Require the same Node runtime for every child');
    assert.deepEqual(identities(), report.sourceIdentities, 'Source changed during measurement');
    assert.deepEqual(acquisition(), report.acquisition, 'Acquisition tool changed during measurement');
    report.exactOutputParity = true;
  } catch (error) { report.errors.push(String(error)); }
  finally {
    // sampleWorker awaits close on every result, including spawn failure,
    // timeout and repeated cancellation, before this lease can be released.
    if (owner) { owner.stop('Parent cleanup'); await owner.done; owner = null; }
    clearInterval(refresh); lock.release(); report.captureLeaseReleased = true;
    report.interrupted = cancellation.isInterrupted(); cancellation.dispose();
    report.finishedAt = new Date().toISOString(); report.ok = !report.interrupted && !report.errors.length && report.exactOutputParity === true;
    write();
  }
  console.log(JSON.stringify({ ok: report.ok, errors: report.errors, summary: report.summary, report: join(options.out, 'report.json') }));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === '--worker' && args.length === 3 && isAbsolute(args[1]) && /^[01]$/.test(args[2])) {
      await worker(args[1], Number(args[2]));
    } else await run(parseArgs(args));
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
