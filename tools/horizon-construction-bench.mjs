#!/usr/bin/env node
// Cold, headless full-horizon construction; genuine native Canvas2D, no GPU.
// node tools/horizon-construction-bench.mjs --baseline-root=/frozen/before --candidate-root=/frozen/after \
//   --maps=verdant,coastal,frontier --seeds=1337,2049,7719 --pairs=3 --out=/fresh/receipt.json
// Optional: --tier=mobile --canvas-module=/absolute/@napi-rs/canvas/index.js
// Owns ONE shared FIFO lease across all fresh-process trials. Do not outer-wrap.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { createCaptureLock } from './capture-lock.mjs';

export const PROTOCOL = 'cold-native-horizon-construction-v1';
const SELF = fileURLToPath(import.meta.url);
const MEMORY_KEYS = ['heapUsed', 'arrayBuffers', 'external', 'rss'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fileHash = file => digest(fs.readFileSync(file));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const errorText = error => error?.stack || String(error);

function absolute(value, name) {
  assert.ok(value && isAbsolute(value), `${name} must be an explicit absolute path`);
  return resolve(value);
}

export function parseOptions(args) {
  const { values } = parseArgs({ args, options: {
    'baseline-root': { type: 'string' }, 'candidate-root': { type: 'string' },
    maps: { type: 'string' }, seeds: { type: 'string' }, out: { type: 'string' },
    pairs: { type: 'string', default: '3' }, tier: { type: 'string', default: 'desktop' },
    'canvas-module': { type: 'string' },
  } });
  const roots = Object.fromEntries(['baseline', 'candidate'].map(label =>
    [label, absolute(values[`${label}-root`], `${label}-root`)]));
  assert.notEqual(roots.baseline, roots.candidate, 'Comparison needs distinct frozen roots');
  const maps = (values.maps || '').split(','), seedTexts = (values.seeds || '').split(','), seeds = seedTexts.map(Number);
  assert.ok(maps.length <= 30 && maps.every(id => /^[a-z][a-z0-9_]*$/.test(id)), 'Supply explicit valid map IDs');
  assert.ok(seedTexts.every(seed => /^\d+$/.test(seed)) && seeds.length <= 16
    && seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff),
    'Supply explicit unsigned 32-bit seeds');
  assert.equal(new Set(maps).size, maps.length, 'Duplicate maps');
  assert.equal(new Set(seeds).size, seeds.length, 'Duplicate seeds');
  const pairs = Number(values.pairs), out = absolute(values.out, 'out');
  assert.ok(Number.isInteger(pairs) && pairs >= 2 && pairs <= 10, 'pairs must be 2..10');
  assert.ok(['desktop', 'mobile'].includes(values.tier), 'tier must be desktop or mobile');
  for (const root of Object.values(roots)) {
    const offset = relative(root, out);
    assert.ok(offset === '..' || offset.startsWith(`..${sep}`), 'Write evidence outside frozen roots');
  }
  const canvasModule = values['canvas-module'] === undefined ? createRequire(import.meta.url).resolve('@napi-rs/canvas')
    : absolute(values['canvas-module'], 'canvas-module');
  return { roots, maps, seeds, pairs, tier: values.tier, out, canvasModule };
}

export function trialPlan({ maps, seeds, pairs }) {
  const result = [];
  for (let pair = 0; pair < pairs; pair++) {
    let caseIndex = 0;
    for (const map of maps) for (const seed of seeds) {
      const order = (pair + caseIndex++) % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
      for (const variant of order) result.push({ pair, map, seed, variant });
    }
  }
  return result;
}

export function sourceSnapshot(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(fs.realpathSync(root), fs.realpathSync(git('rev-parse', '--show-toplevel')), 'Root must be a complete worktree');
  return { root: fs.realpathSync(root), head: git('rev-parse', 'HEAD'), status: git('status', '--porcelain=v1', '--untracked-files=all'),
    sourceTree: git('rev-parse', 'HEAD:src'), packageHash: fileHash(join(root, 'package.json')),
    lockfileHash: fileHash(join(root, 'package-lock.json')), horizonHash: fileHash(join(root, 'src/world/maps/horizon.ts')) };
}

export function describeAttribute(attribute) {
  const array = attribute.array;
  assert.ok(ArrayBuffer.isView(array), 'Require actual uploaded typed attributes');
  const offsets = [...new Set([0, Math.floor(array.length / 2), Math.max(0, array.length - 1)])];
  return { type: array.constructor.name, itemSize: attribute.itemSize, count: attribute.count,
    bytes: array.byteLength, sha256: digest(Buffer.from(array.buffer, array.byteOffset, array.byteLength)),
    samples: offsets.filter(i => i < array.length).map(offset => ({ offset, value: array[offset] })) };
}

function describeGeometry(geometry) {
  const attributes = Object.fromEntries(Object.entries(geometry.attributes).map(([name, value]) => [name, describeAttribute(value)]));
  return { attributes, index: geometry.index ? describeAttribute(geometry.index) : null,
    attributeBytes: Object.values(attributes).reduce((sum, item) => sum + item.bytes, 0),
    indexBytes: geometry.index?.array.byteLength || 0 };
}

export function describeTexture(texture) {
  const image = texture.image;
  assert.ok(image?.width > 0 && image?.height > 0, 'Every owned texture needs actual pixels');
  const pixels = image.data ?? image.getContext('2d').getImageData(0, 0, image.width, image.height).data;
  assert.ok(ArrayBuffer.isView(pixels), 'No pixel-upload stub or skipped texture inventory');
  return { name: texture.name || '', width: image.width, height: image.height,
    pixelType: pixels.constructor.name, baseLevelPixelBytes: pixels.byteLength,
    sha256: digest(Buffer.from(pixels.buffer, pixels.byteOffset, pixels.byteLength)),
    format: texture.format, type: texture.type, colorSpace: texture.colorSpace,
    wrapS: texture.wrapS, wrapT: texture.wrapT, minFilter: texture.minFilter, magFilter: texture.magFilter };
}

function describeMaterial(material) {
  return { name: material.name || '', type: material.type, color: material.color?.getHexString() ?? null,
    side: material.side, alphaTest: material.alphaTest, opacity: material.opacity,
    transparent: material.transparent, vertexColors: material.vertexColors,
    programKeyHash: digest(material.customProgramCacheKey()) };
}

export function inspectAndDispose(root, dispose) {
  const meshes = [];
  root.traverse(object => {
    if (object.isMesh) meshes.push({ name: object.name, geometry: describeGeometry(object.geometry) });
  });
  const owned = { geometries: [], materials: [], textures: [] };
  const describe = { geometry: describeGeometry, material: describeMaterial, texture: describeTexture };
  const plural = { geometry: 'geometries', material: 'materials', texture: 'textures' };
  // The production owner enumerates shader-only textures too, without a new registry.
  const disposal = dispose(root, { onDispose(kind, resource) { owned[plural[kind]].push(describe[kind](resource)); } });
  assert.equal(owned.textures.length, disposal.textures);
  return { meshes, owned, disposal,
    counts: { meshes: meshes.length, geometries: disposal.geometries, materials: disposal.materials, textures: disposal.textures },
    logicalAttributeBytes: owned.geometries.reduce((sum, item) => sum + item.attributeBytes, 0),
    logicalIndexBytes: owned.geometries.reduce((sum, item) => sum + item.indexBytes, 0),
    baseLevelTexturePixelBytes: owned.textures.reduce((sum, item) => sum + item.baseLevelPixelBytes, 0) };
}

function forceMemory() {
  globalThis.gc(); globalThis.gc();
  const memory = process.memoryUsage();
  return Object.fromEntries(MEMORY_KEYS.map(key => [key, memory[key]]));
}

export function memoryDelta(before, after) {
  return Object.fromEntries(MEMORY_KEYS.map(key => [key, after[key] - before[key]]));
}

async function nativeRuntime(root, canvasModule, tier) {
  const manifest = JSON.parse(fs.readFileSync(join(dirname(canvasModule), 'package.json'), 'utf8'));
  assert.equal(manifest.name, '@napi-rs/canvas', 'Genuine native @napi-rs/canvas required');
  const native = await import(pathToFileURL(canvasModule).href);
  assert.equal(typeof native.createCanvas, 'function'); assert.equal(typeof native.ImageData, 'function');
  const bindings = Object.keys(createRequire(import.meta.url).cache).filter(file => file.endsWith('.node'))
    .map(file => ({ path: fs.realpathSync(file), sha256: fileHash(file) }));
  assert.ok(bindings.length > 0, 'Native rasterizer binding must be loaded; no JS/WASM pixel substitute');
  globalThis.ImageData = native.ImageData;
  globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return native.createCanvas(1, 1); } };
  globalThis.window = { location: { search: `?tier=${tier}` } };
  const load = file => import(pathToFileURL(join(root, file)).href);
  const { resolveDeviceTier } = await load('src/engine/quality.ts');
  assert.equal(resolveDeviceTier(), tier);
  const [{ buildHorizonRing }, { getMapConfig, MAP_IDS }, { disposeObject3DResources }] = await Promise.all([
    load('src/world/maps/horizon.ts'), load('src/world/maps/index.ts'), load('src/engine/resourceLifetime.ts'),
  ]);
  return { buildHorizonRing, getMapConfig, MAP_IDS, disposeObject3DResources,
    rasterizer: { path: fs.realpathSync(canvasModule), version: manifest.version, moduleHash: fileHash(canvasModule), bindings } };
}

export async function workerTrial({ root, map, seed, canvasModule, tier }) {
  assert.equal(typeof globalThis.gc, 'function', 'Worker requires --expose-gc');
  const saved = new Map(['window', 'document', 'ImageData'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let mesh = null, runtime;
  try {
    runtime = await nativeRuntime(root, canvasModule, tier);
    assert.ok(runtime.MAP_IDS.includes(map), `Unknown map ${map}`);
    const config = runtime.getMapConfig(map);
    const before = forceMemory(), cpu = process.cpuUsage(), start = performance.now();
    mesh = runtime.buildHorizonRing(null, config, seed);
    const constructionWallMs = performance.now() - start, usedCpu = process.cpuUsage(cpu);
    const live = forceMemory();
    const inventory = inspectAndDispose(mesh, runtime.disposeObject3DResources); mesh = null;
    // Let resource visitor/canvas temporary stacks unwind. No warmup/rebuild loop.
    await new Promise(resolve => setImmediate(resolve));
    const afterDispose = forceMemory();
    return { map, seed, tier, constructionWallMs,
      constructionCpuMs: { user: usedCpu.user / 1000, system: usedCpu.system / 1000 },
      memory: { before, live, afterDispose, liveDelta: memoryDelta(before, live),
        postDisposeDelta: memoryDelta(before, afterDispose) }, inventory, rasterizer: runtime.rasterizer };
  } finally {
    if (mesh) runtime?.disposeObject3DResources(mesh);
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}

export function runFreshTrial(input, signal, { timeoutMs = 90000, spawnChild = spawn } = {}) {
  return new Promise(resolveResult => {
    const controller = new AbortController();
    const child = spawnChild(process.execPath, ['--expose-gc', SELF, '--worker', JSON.stringify(input)], {
      cwd: input.root, stdio: ['ignore', 'pipe', 'pipe', 'ipc'], signal: controller.signal,
    });
    let receipt = null, error = null, stdout = '', stderr = '', killTimer;
    const stop = reason => {
      error ||= reason; controller.abort();
      killTimer ??= setTimeout(() => child.kill('SIGKILL'), 5000);
    };
    const aborted = () => stop('Caller interrupted the owned worker');
    const timer = setTimeout(() => stop(`Worker exceeded ${timeoutMs}ms deadline`), timeoutMs);
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) aborted();
    const output = (current, chunk) => {
      if (current.length + chunk.length > 1024 * 1024) stop('Worker output exceeded 1MiB; remainder truncated');
      return (current + chunk).slice(0, 1024 * 1024);
    };
    child.stdout.on('data', chunk => { stdout = output(stdout, chunk.toString()); });
    child.stderr.on('data', chunk => { stderr = output(stderr, chunk.toString()); });
    child.on('message', message => { receipt = message; });
    child.once('error', failure => { error ||= errorText(failure); });
    // Never release a lease on abort/error before the actual worker closes.
    child.once('close', (code, childSignal) => {
      clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', aborted);
      resolveResult({ code, signal: childSignal, error, stdout, stderr, receipt });
    });
  });
}

export async function compareTrials(options, { snapshot = sourceSnapshot, trial = runFreshTrial, signal } = {}) {
  const report = { protocol: PROTOCOL, options, startedAt: new Date().toISOString(), node: process.version,
    toolHash: fileHash(SELF), runs: [], before: {}, after: {}, errors: [], pass: false,
    scope: 'One fresh Node process per map/seed/variant/trial; no warmup or discarded samples. Real synchronous buildHorizonRing plus native Canvas2D. Module import time excluded; OS file cache unspecified. No renderer, GPU allocation, FPS, browser or device certification.',
    memoryScope: 'Forced-GC Node process deltas after imports, live construction, and production disposal plus dropped mesh reference. Post-disposal delta includes retained runtime caches, native allocator residue and small diagnostic inventory bookkeeping; not proof of a leak or GPU bytes. RGBA counts describe base-level CPU pixels, not native backing allocation.' };
  try {
    for (const [label, root] of Object.entries(options.roots)) {
      report.before[label] = snapshot(root); assert.equal(report.before[label].status, '', `${label} root must be clean`);
    }
    for (const item of trialPlan(options)) {
      if (signal?.aborted) throw new Error('Comparison interrupted');
      const root = options.roots[item.variant], before = snapshot(root);
      assert.ok(equal(before, report.before[item.variant]), 'Frozen source changed before worker');
      const result = await trial({ root, map: item.map, seed: item.seed, tier: options.tier, canvasModule: options.canvasModule }, signal);
      const run = { ...item, ...result, sourceBefore: before };
      report.runs.push(run);
      const after = snapshot(root); run.sourceAfter = after;
      assert.ok(equal(before, after), 'Frozen source changed during worker');
      validateTrial(result, item, options.tier);
      run.valid = true;
    }
    report.pass = true;
  } catch (error) { report.errors.push(errorText(error)); }
  for (const [label, root] of Object.entries(options.roots)) {
    try { report.after[label] = snapshot(root); }
    catch (error) { report.errors.push(errorText(error)); }
  }
  report.sourceUnchanged = equal(report.before, report.after);
  report.toolHashAfter = fileHash(SELF);
  report.toolUnchanged = report.toolHash === report.toolHashAfter;
  report.summary = summarizeTrials(report.runs);
  report.inputsDeterministic = report.summary.every(item => item.inventoryStable && item.rasterizerStable)
    && report.runs.filter(run => run.valid).every(run => equal(run.receipt.value.rasterizer, report.runs[0].receipt.value.rasterizer));
  report.pass &&= report.sourceUnchanged && report.toolUnchanged && report.inputsDeterministic && report.errors.length === 0;
  report.finishedAt = new Date().toISOString();
  return report;
}

export function validateTrial(result, item, tier) {
  assert.ok(result.code === 0 && result.signal === null && !result.error && result.receipt?.ok === true,
    'Worker failed; raw result retained');
  const value = result.receipt.value;
  assert.ok(value?.map === item.map && value.seed === item.seed && value.tier === tier, 'Wrong worker case');
  assert.ok(Number.isFinite(value.constructionWallMs) && value.constructionWallMs >= 0, 'Invalid elapsed measurement');
  assert.ok(['user', 'system'].every(key => Number.isFinite(value.constructionCpuMs?.[key]) && value.constructionCpuMs[key] >= 0), 'Invalid process CPU measurement');
  assert.ok(MEMORY_KEYS.every(key => Number.isFinite(value.memory?.postDisposeDelta?.[key])), 'Invalid signed memory delta');
  assert.ok(value.rasterizer?.path && value.rasterizer?.version, 'Missing native rasterizer identity');
  assert.ok(value.inventory.meshes.some(mesh => mesh.name === 'horizon-ring'), 'Actual parent horizon missing');
  assert.ok(value.inventory.meshes.some(mesh => mesh.name === 'horizon-detail'), 'Actual detail child missing');
  assert.ok(value.inventory.counts.textures > 0 && value.inventory.baseLevelTexturePixelBytes > 0, 'Missing native texture inventory');
}

function statistics(values) {
  const sorted = values.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { min: sorted[0], max: sorted.at(-1), median: (sorted[middle] + sorted[Math.floor((sorted.length - 1) / 2)]) / 2 };
}

export function summarizeTrials(runs) {
  const groups = new Map();
  for (const run of runs) {
    if (!run.valid) continue;
    const key = `${run.variant}/${run.map}/${run.seed}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(run.receipt.value);
  }
  return [...groups.entries()].map(([key, values]) => ({ key, trials: values.length,
    constructionWallMs: statistics(values.map(value => value.constructionWallMs)),
    constructionCpuMs: statistics(values.map(value => value.constructionCpuMs.user + value.constructionCpuMs.system)),
    postDisposeDelta: Object.fromEntries(MEMORY_KEYS.map(name => [name,
      statistics(values.map(value => value.memory.postDisposeDelta[name]))])),
    inventoryStable: values.every(value => equal(value.inventory, values[0].inventory)),
    rasterizerStable: values.every(value => equal(value.rasterizer, values[0].rasterizer)),
  }));
}

export async function withLease(run, lock = createCaptureLock()) {
  await lock.acquire(45 * 60 * 1000);
  const refresh = setInterval(() => lock.refresh(), 30000); refresh.unref();
  try { return await run(); }
  finally { clearInterval(refresh); lock.release(); }
}

export async function writeFreshReport(out, run) {
  const fd = fs.openSync(out, 'wx');
  let report;
  try { report = await run(); }
  catch (error) { report = { protocol: PROTOCOL, pass: false, errors: [errorText(error)] }; }
  finally {
    try { fs.writeSync(fd, `${JSON.stringify(report, null, 2)}\n`); }
    finally { fs.closeSync(fd); }
  }
  return report;
}

async function main() {
  if (process.argv[2] === '--worker') {
    let receipt;
    try { receipt = { ok: true, value: await workerTrial(JSON.parse(process.argv[3])) }; }
    catch (error) { receipt = { ok: false, error: errorText(error) }; }
    process.send?.(receipt); process.exitCode = receipt.ok ? 0 : 1; return;
  }
  const options = parseOptions(process.argv.slice(2)), controller = new AbortController();
  const handlers = ['SIGINT', 'SIGTERM'].map(name => [name, () => controller.abort(name)]);
  for (const [name, handler] of handlers) process.once(name, handler);
  try {
    const report = await writeFreshReport(options.out, () => withLease(() => compareTrials(options, { signal: controller.signal })));
    console.log(JSON.stringify({ out: options.out, pass: report.pass, trials: report.runs?.length || 0 }));
    process.exitCode = controller.signal.aborted ? (controller.signal.reason === 'SIGINT' ? 130 : 143) : report.pass ? 0 : 1;
  } finally { for (const [name, handler] of handlers) process.removeListener(name, handler); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
