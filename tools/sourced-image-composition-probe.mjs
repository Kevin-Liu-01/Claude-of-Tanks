#!/usr/bin/env node
// Tooling only; never builds or boots the game. See report.caveats before using timings.
// node tools/sourced-image-composition-probe.mjs --out=/absolute/new-directory
//   --dependency-root=/absolute/existing-install [--pairs=2] [--reuse-delay-ms=1000]
//   [--mode=decode|worker] (worker: six source cases plus three optional-image fixtures)
// Native runs require ordinary capture FIFO admission. No discarded warmups.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createCaptureLock } from './capture-lock.mjs';
import { SOURCE_COMPOSITION_PROTOCOL, urbanCompositionCases, compositionPlan,
  compareRgba, validateCompositionTrial, measureSourceComposition } from './sourced-image-composition.mjs';
import { SOURCE_WORKER_PROTOCOL, extractWorkerComposer, validateWorkerReply } from './sourced-image-worker.mjs';
import { workerCompositionCases, validateWorkerTrial } from './sourced-image-worker-browser.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = '4b321885c676877b83f9dd6725bcef164cab8f29';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

export function parseCompositionOptions(args) {
  const value = (name, fallback = '') => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  assert.ok(args.every(arg => /^--(out|dependency-root|pairs|reuse-delay-ms|timeout-ms|mode)=/.test(arg)), 'Unknown option');
  assert.equal(new Set(args.map(arg => arg.split('=')[0])).size, args.length, 'Duplicate option');
  const out = value('out'), dependencyRoot = value('dependency-root');
  assert.ok(isAbsolute(out) && isAbsolute(dependencyRoot), 'Absolute --out and --dependency-root required');
  assert.ok(relative(ROOT, out).startsWith('../'), 'Output must be outside the source worktree');
  const pairs = Number(value('pairs', '2')), reuseDelayMs = Number(value('reuse-delay-ms', '1000'));
  const mode = value('mode', 'decode');
  assert.ok(['decode', 'worker'].includes(mode), 'Unknown comparison mode');
  const timeoutMs = Number(value('timeout-ms', mode === 'worker' ? '300000' : '180000'));
  compositionPlan([], pairs);
  assert.ok(Number.isInteger(reuseDelayMs) && reuseDelayMs >= 100 && reuseDelayMs <= 5000);
  assert.ok(Number.isInteger(timeoutMs) && timeoutMs >= 10000 && timeoutMs <= 600000);
  return { out, dependencyRoot, pairs, reuseDelayMs, timeoutMs, mode,
    imageTimeoutMs: 10000, workerTimeoutMs: 10000, trialTimeoutMs: 30000 };
}

export async function bounded(operation, ms, label) {
  let timer;
  try { return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} deadline (${ms} ms)`)), ms);
  })]); } finally { clearTimeout(timer); }
}

async function snapshot() {
  const paths = ['src/world/sourcedTextures.ts', 'src/engine/quality.ts', 'package.json', 'package-lock.json',
    'tools/sourced-image-composition-probe.mjs', 'tools/sourced-image-composition.mjs', 'tools/capture-lock.mjs',
    'tools/sourced-image-worker.mjs', 'tools/sourced-image-worker-browser.mjs'];
  return { revision: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD:src'),
    base: BASE, runtimeDiff: git('diff', '--name-only', BASE, '--', 'src', 'package.json', 'package-lock.json'),
    dirtyPaths: git('status', '--short').split('\n').filter(Boolean),
    files: Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(join(ROOT, path)))]))) };
}

async function nativeGraphics(page) {
  return page.evaluate(() => {
    const canvas = document.createElement('canvas'), gl = canvas.getContext('webgl2');
    if (!gl) return { nativeObserved: false };
    try {
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
      return { renderer, contextLost: gl.isContextLost(), nativeObserved: !!renderer
        && !/swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(renderer) };
    } finally { gl.getExtension('WEBGL_lose_context')?.loseContext(); }
  });
}

async function retainPixels(settings, trial, index) {
  for (const measure of trial.measurements ?? []) for (const output of measure.outputs ?? []) {
    if (!output.rgbaBase64) continue;
    const bytes = Buffer.from(output.rgbaBase64, 'base64');
    assert.equal(bytes.length, output.byteLength);
    const file = `${String(index).padStart(3, '0')}-${trial.caseId}-${trial.policy}-${measure.stage}-${output.role}.rgba.gz`;
    await writeFile(join(settings.out, file), gzipSync(bytes), { flag: 'wx' });
    delete output.rgbaBase64;
    output.file = file; output.sha256 = hash(bytes);
  }
}

async function compareTrials(settings, trials) {
  const comparisons = [];
  const compare = async (a, b, identity) => {
    assert.ok(a?.file && b?.file, 'Missing paired output');
    const read = async row => gunzipSync(await readFile(join(settings.out, row.file)));
    const bytesA = await read(a), bytesB = await read(b);
    assert.equal(hash(bytesA), a.sha256); assert.equal(hash(bytesB), b.sha256);
    comparisons.push({ ...identity, ...compareRgba(bytesA, bytesB) });
  };
  const policies = settings.mode === 'worker' ? ['main', 'worker'] : ['onload', 'decode'];
  for (const before of trials.filter(row => row.policy === policies[0])) {
    const after = trials.find(row => row.round === before.round && row.caseId === before.caseId && row.policy === policies[1]);
    assert.ok(after && before.status === 'complete' && after.status === 'complete', 'Incomplete A/B pair');
    for (const measure of before.measurements) for (const output of measure.outputs) {
      const counterpart = after.measurements.find(row => row.stage === measure.stage)?.outputs.find(row => row.role === output.role);
      await compare(output, counterpart, { kind: policies.join('-vs-'), round: before.round,
        caseId: before.caseId, stage: measure.stage, role: output.role });
    }
  }
  for (const trial of trials) for (const output of trial.measurements[0].outputs) {
    await compare(output, trial.measurements[1].outputs.find(row => row.role === output.role),
      { kind: 'first-vs-reuse', round: trial.round, caseId: trial.caseId, policy: trial.policy, role: output.role });
  }
  return comparisons;
}

const childExited = child => child.exitCode !== null || child.signalCode !== null;
function waitForExit(child, ms) {
  if (childExited(child)) return Promise.resolve();
  return new Promise((resolveExit, reject) => {
    const onExit = () => { clearTimeout(timer); resolveExit(); };
    const timer = setTimeout(() => { child.removeListener('exit', onExit); reject(new Error('Owned browser exit deadline')); }, ms);
    child.once('exit', onExit);
  });
}

export async function closeOwnedBrowser(browser, errors, { closeMs = 5000, exitMs = 3000 } = {}) {
  const child = browser.process();
  if (!child) { errors.push('Missing owned browser process receipt'); return false; }
  await bounded(() => browser.close(), closeMs, 'Browser close').catch(error => errors.push(String(error)));
  if (!childExited(child)) {
    child.kill('SIGTERM');
    await waitForExit(child, exitMs).catch(() => { if (!childExited(child)) child.kill('SIGKILL'); });
  }
  await waitForExit(child, exitMs).catch(error => errors.push(String(error)));
  return childExited(child);
}

async function stopWorkerAcquisition(page) {
  if (page) await bounded(() => page.evaluate(() => window.__STOP_SOURCE_COMPOSITION?.()), 1500, 'Worker acquisition stop');
}

async function runTrial(browser, url, input, plan, settings, report, workerSource, workerOwner) {
  let context, page;
  const errors = [];
  let row = { ...plan, status: 'failed' };
  try {
    context = await bounded(() => browser.createBrowserContext(), 5000, 'Fresh context');
    page = await bounded(() => context.newPage(), 5000, 'Fresh page');
    if (settings.mode === 'worker') workerOwner.page = page;
    await page.setViewport({ width: 640, height: 480, deviceScaleFactor: 1 });
    await page.setCacheEnabled(false);
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(`${url}/__sourced-image-probe?tier=desktop`, { waitUntil: 'load', timeout: 10000 });
    const parameters = { input, policy: plan.policy, reuseDelayMs: settings.reuseDelayMs,
      imageTimeoutMs: settings.imageTimeoutMs, workerTimeoutMs: settings.workerTimeoutMs };
    const execute = settings.mode === 'worker'
      ? () => page.evaluate(async args => {
        const { measureWorkerComparison } = await import('/tools/sourced-image-worker-browser.mjs');
        return measureWorkerComparison(args);
      }, { ...parameters, workerSource, validateReplySource: validateWorkerReply.toString() })
      : () => page.evaluate(measureSourceComposition, parameters);
    row = { ...plan, ...await bounded(execute, settings.trialTimeoutMs, 'Composition trial') };
    // GPU identity and output retention are strictly outside both timed phases.
    row.graphics = await bounded(() => nativeGraphics(page), 5000, 'Graphics receipt');
  } catch (error) {
    if (page) {
      const partial = await bounded(() => page.evaluate(() => window.__SOURCE_COMPOSITION), 1500, 'Partial receipt').catch(() => null);
      if (partial) row = { ...plan, ...partial };
    }
    row.status = 'failed'; row.error = String(error);
  } finally {
    if (settings.mode === 'worker') {
      await stopWorkerAcquisition(page).catch(error => report.cleanupErrors.push(String(error)));
      if (workerOwner.page === page) workerOwner.page = null;
    }
    // A late unresolved context creation is owned by whole-browser teardown.
    if (!context) row.cleanupFailed = true;
    if (context) await bounded(() => context.close(), 5000, 'Context close').catch(error => {
      row.cleanupFailed = true; report.cleanupErrors.push(String(error));
    });
  }
  row.errors = errors;
  return row;
}

export async function runCompositionProbe(args) {
  const settings = parseCompositionOptions(args);
  const before = await snapshot();
  assert.equal(before.sourceTree, git('rev-parse', `${BASE}:src`), 'This experiment requires the exact approved source tree');
  assert.equal(before.runtimeDiff, '', 'Approved source/dependency manifests must not have working-tree changes');
  const source = await readFile(join(ROOT, 'src/world/sourcedTextures.ts'), 'utf8');
  const originalCases = await urbanCompositionCases(source);
  const cases = settings.mode === 'worker' ? workerCompositionCases(originalCases) : originalCases;
  const plan = compositionPlan(cases, settings.pairs).map(item => settings.mode === 'worker'
    ? { ...item, policy: item.policy === 'onload' ? 'main' : 'worker' } : item);
  const workerSource = settings.mode === 'worker' ? extractWorkerComposer(source) : null;
  const assets = new Map();
  for (const url of new Set(cases.flatMap(row => Object.values(row.images).filter(Boolean)))) {
    const bytes = await readFile(join(ROOT, 'public', url.slice(1)));
    const approved = execFileSync('git', ['show', `${BASE}:public${url}`], { cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(hash(bytes), hash(approved), `Input differs from approved base: ${url}`);
    assets.set(url, bytes);
  }
  await mkdir(settings.out);
  const report = { protocol: settings.mode === 'worker' ? SOURCE_WORKER_PROTOCOL : SOURCE_COMPOSITION_PROTOCOL,
    settings, before, cases, plan, workerSourceSha256: workerSource ? hash(workerSource) : null,
    inputs: [...assets].map(([url, bytes]) => ({ url, sha256: hash(bytes), bytes: bytes.length })),
    startedAt: new Date().toISOString(), trials: [], errors: [], cleanupErrors: [], comparisons: [], pass: false,
    caveats: [
      'Standalone first-composition experiment, not production loading, frame timing or a speed certificate.',
      'Fresh context and disabled HTTP cache per arm; browser process, driver and OS caches remain shared.',
      'AB then BA; every result retained, no warmups or discarded first compositions.',
      'Source module delivery/import is outside timing. Exact assets are served from the recorded immutable byte buffers.',
      'All four PBR images join readiness; earlier images receive natural group-barrier slack, recorded per image.',
      'The normal image is loaded/decoded but normal-canvas copying is outside these albedo/surface composer measurements.',
      'Delayed reuse recomposes the same images with existing shared readback scratch; it bypasses composeSet output caches.',
      'Reuse combines image/scratch/JIT warmth. Browser decoded data may be reclaimed; decode does not remove Canvas readback.',
      'Readback wrappers add diagnostic overhead. Pixel serialization, byte comparisons and graphics identity follow both timed phases.',
      'The observed hardware renderer is a browser eligibility receipt, not proof that a Canvas2D readback ran on the GPU.',
      'Queued termination uses ordinary OS signals; dead FIFO tickets are reaped on the next shared scan, not immediately.',
    ] };
  if (settings.mode === 'worker') report.caveats = [
    'Isolated fidelity/event-loop experiment, not game FPS or a production worker integration.',
    'Six approved urban source cases plus three explicitly labeled missing-optional-image fixtures; no changed normal image scope.',
    'Fresh context and disabled HTTP cache per arm; browser/driver/OS caches remain shared. AB then BA, no discarded warmups.',
    'Worker bootstrap and async createImageBitmap from the same loaded HTML images are inside end-to-end timing.',
    'Every composition creates a fresh one-shot worker. Delayed reuse reuses images, not a warm worker pool.',
    'Required worker output RGBA readback/transfer preparation and main putImageData adoption are inside the pipeline.',
    'Pipeline end is canvas adoption. Subsequent main termination/revoke cleanup is separately timestamped, not included in pipelineMs.',
    'Parity readbacks/base64 encoding and hardware identity occur after both timed pipelines and responsiveness observation.',
    'RAF callback gaps/LongTasks measure main event-loop availability, not rendered FPS or physical GPU completion.',
    'Main uses a prototype readback observer; worker wraps its owned contexts. Both retain instrumentation overhead, not assumed identical.',
    'Two leading/trailing observation frame boundaries surround image IO and pipelines without warming composition.',
    'Native ImageBitmap conversion and Canvas adoption parity are admission questions, not assumed equivalent backends.',
    'Exact source/input bytes remain pinned to the approved base; missing Worker/bitmap/LongTask capability fails closed.',
    'Queued interruption retains the ordinary FIFO dead-ticket boundary; only the owned lease is released.',
  ];
  await writeFile(join(settings.out, 'admission.json'), JSON.stringify({ before, settings, startedAt: report.startedAt }), { flag: 'wx' });
  const lock = createCaptureLock();
  const workerOwner = { page: null };
  let browser, server, refresher, deadline, closing, interrupted, admitted = false;
  const closeBrowser = () => {
    if (!browser) return Promise.resolve();
    return closing ??= (async () => {
      if (settings.mode === 'worker') await stopWorkerAcquisition(workerOwner.page).catch(error => report.cleanupErrors.push(String(error)));
      return closeOwnedBrowser(browser, report.cleanupErrors);
    })()
      .then(closed => { report.browserExitConfirmed = closed; })
      .catch(error => { report.cleanupErrors.push(String(error)); report.browserExitConfirmed = false; });
  };
  const interrupt = signal => { interrupted = signal; void closeBrowser(); };
  const onInt = () => interrupt('SIGINT'), onTerm = () => interrupt('SIGTERM');
  try {
    await lock.acquire(45 * 60 * 1000); admitted = true;
    process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
    refresher = setInterval(() => lock.refresh(), 30000); refresher.unref();
    deadline = setTimeout(() => interrupt('Overall deadline'), settings.timeoutMs);
    const require = createRequire(join(settings.dependencyRoot, 'package.json'));
    const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
    const { default: puppeteer } = await import(pathToFileURL(require.resolve('puppeteer')).href);
    const approvedPackages = JSON.parse(await readFile(join(ROOT, 'package-lock.json'), 'utf8')).packages;
    report.dependencies = Object.fromEntries(await Promise.all(['vite', 'puppeteer', 'three'].map(async name => {
      const entry = require.resolve(name);
      // Three deliberately does not export package.json; its pinned CJS entry is build/three.cjs.
      const manifest = name === 'three' ? join(dirname(entry), '..', 'package.json') : require.resolve(`${name}/package.json`);
      const manifestBytes = await readFile(manifest), metadata = JSON.parse(manifestBytes);
      assert.equal(metadata.version, approvedPackages[`node_modules/${name}`].version, `Unapproved ${name} version`);
      return [name, { entry, sha256: hash(await readFile(entry)), manifest,
        manifestSha256: hash(manifestBytes), version: metadata.version }];
    })));
    const threeModule = join(dirname(require.resolve('three')), 'three.module.js');
    report.dependencies.three.browserModules = Object.fromEntries(await Promise.all(
      [threeModule, join(dirname(threeModule), 'three.core.js')].map(async path => [path, hash(await readFile(path))])));
    const middleware = (request, response, next) => {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path === '/__sourced-image-probe') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><title>Sourced image composition probe</title><link rel="icon" href="data:,">');
      } else if (assets.has(path)) {
        response.setHeader('Content-Type', 'image/jpeg'); response.setHeader('Cache-Control', 'no-store'); response.end(assets.get(path));
      } else next();
    };
    server = await createServer({ root: ROOT, configFile: false, logLevel: 'error',
      appType: 'custom', plugins: [{ name: 'frozen-source-image-inputs', configureServer(value) { value.middlewares.use(middleware); } }],
      resolve: { alias: { three: threeModule } },
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { host: '127.0.0.1', port: 0, hmr: false, fs: { allow: [ROOT, settings.dependencyRoot] } } });
    await bounded(() => server.listen(), 5000, 'Source server listen');
    const address = server.httpServer.address();
    const url = `http://127.0.0.1:${address.port}`;
    report.browserArgs = ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'];
    browser = await puppeteer.launch({ headless: 'new', handleSIGINT: false, handleSIGTERM: false,
      timeout: 30000, protocolTimeout: settings.trialTimeoutMs, args: report.browserArgs });
    report.browserPid = browser.process()?.pid;
    if (interrupted) throw new Error(interrupted);
    report.browserVersion = await browser.version();
    for (const [index, item] of plan.entries()) {
      if (interrupted) throw new Error(interrupted);
      const input = cases.find(value => value.id === item.caseId);
      const row = await runTrial(browser, url, input, item, settings, report, workerSource, workerOwner);
      report.trials.push(row);
      await retainPixels(settings, row, index).catch(error => { row.retentionError = String(error); report.errors.push(String(error)); });
      try {
        if (settings.mode === 'worker') validateWorkerTrial(row, input); else validateCompositionTrial(row);
        assert.equal(row.errors.length, 0);
      }
      catch (error) { row.admissionError = String(error); }
      await writeFile(join(settings.out, `trial-${String(index).padStart(3, '0')}.json`), JSON.stringify(row, null, 2), { flag: 'wx' });
      assert.ok(!row.cleanupFailed, 'Context cleanup failed; refusing another native trial');
    }
    report.comparisons = await compareTrials(settings, report.trials);
    assert.ok(report.comparisons.length > 0 && report.comparisons.every(row => row.exact), 'RGBA parity failed');
    assert.ok(report.trials.every(row => !row.admissionError), 'One or more trials failed admission');
  } catch (error) { report.errors.push(String(error)); }
  finally {
    clearTimeout(deadline);
    await closeBrowser();
    if (server) await bounded(() => server.close(), 5000, 'Server close').catch(error => report.cleanupErrors.push(String(error)));
    clearInterval(refresher);
    // Never admit the next capture while our browser is still known alive.
    if (admitted && (!browser || report.browserExitConfirmed)) {
      lock.release(); report.ownedLeaseReleaseCalled = true;
    }
    process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm);
    report.after = await snapshot().catch(error => { report.errors.push(String(error)); return null; });
    report.sourceUnchanged = JSON.stringify(report.before) === JSON.stringify(report.after);
    report.finishedAt = new Date().toISOString();
    report.pass = !interrupted && report.sourceUnchanged && report.trials.length === plan.length
      && report.errors.length === 0 && report.cleanupErrors.length === 0;
    await writeFile(join(settings.out, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  }
  console.log(JSON.stringify({ protocol: report.protocol, pass: report.pass, trials: report.trials.length, out: settings.out }));
  if (!report.pass) process.exitCode = 1;
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runCompositionProbe(process.argv.slice(2));
