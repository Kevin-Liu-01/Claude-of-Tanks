#!/usr/bin/env node
// Native exact composed-PCF/coverage/submission regression, never an FPS or full-game benchmark.
// node tools/articulated-shadow-batch.browser.selftest.mjs [--out=/absolute/new-directory]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

const rootDir = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function sourceReceipt() {
  const paths = ['tools/articulated-shadow-batch.browser.selftest.mjs', 'tools/articulated-shadow-batch.browser.fixture.mjs',
    'src/engine/articulatedShadowBatch.ts', 'src/engine/renderLayers.ts', 'tools/native-browser-launch.mjs',
    'tools/capture-lock.mjs', 'package.json', 'package-lock.json',
    'node_modules/three/package.json', 'node_modules/three/build/three.core.js', 'node_modules/three/build/three.module.js',
    'node_modules/vite/package.json', 'node_modules/puppeteer/package.json',
    'node_modules/three/src/objects/BatchedMesh.js', 'node_modules/three/src/renderers/webgl/WebGLShadowMap.js',
    'node_modules/three/src/renderers/webgl/WebGLLights.js',
    'node_modules/three/src/renderers/shaders/ShaderChunk/packing.glsl.js',
    'node_modules/three/src/renderers/shaders/ShaderChunk/shadowmap_pars_fragment.glsl.js',
    'node_modules/three/src/renderers/shaders/ShaderChunk/project_vertex.glsl.js',
    'node_modules/three/src/renderers/shaders/ShaderChunk/batching_vertex.glsl.js',
    'node_modules/three/src/renderers/shaders/ShaderLib/depth.glsl.js'];
  return { revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim(),
    files: Object.fromEntries(paths.map(path => [path, hash(readFileSync(join(rootDir, path)))])) };
}
function outputDirectory(args) {
  if (!args.length) return null;
  const value = args.length === 1 && args[0].startsWith('--out=') ? args[0].slice(6)
    : args.length === 2 && args[0] === '--out' ? args[1] : null;
  assert.ok(value && isAbsolute(value), 'Use only --out=/absolute/new-directory');
  const directory = resolve(value);
  assert.ok(relative(rootDir, directory).startsWith('../'), 'Artifacts must remain outside the checkout');
  mkdirSync(directory); return directory;
}
async function bounded(promise, timeoutMs, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
  })]); } finally { clearTimeout(timer); }
}
function retainPixels(report, directory) {
  let number = 0;
  const owners = report.fixture.cases.flatMap(row => [row.reference, row.candidate])
    .concat(report.fixture.negatives.map(row => row.render))
    .concat(report.fixture.warmPasses.flatMap(row => [row.baseline, row.warm, row.revealed]));
  for (const owner of owners) for (const image of owner.pixels) {
    const bytes = Buffer.from(image.rgbaBase64, 'base64');
    assert.equal(bytes.length, image.width * image.height * 4);
    image.bytes = bytes.length; image.sha256 = hash(bytes);
    if (directory) {
      image.file = `${String(number).padStart(3, '0')}-${image.role}.rgba.gz`;
      writeFileSync(join(directory, image.file), gzipSync(bytes), { flag: 'wx' });
    }
    delete image.rgbaBase64; number++;
  }
  report.rawOutputs = number;
}

const report = { protocol: 'articulated-shadow-batch-native-v3', ok: false, source: null,
  fixture: null, artifacts: {}, errors: [], browserClosed: false, serverClosed: false, lockReleased: false,
  caveats: ['Gate: exact composed PCF RGBA and per-camera clear/nonclear caster coverage (clear is exactly RGBA255).',
    'Cross-arm packed-color byte differences and Three-decoded color-depth differences are retained diagnostics without a tolerance gate.',
    'Same-owner reset additionally requires exact original raw RGBA bytes, preserving deterministic same-path restoration.',
    'Warm-only cases require zero forward draws, identical same-owner raw shadow RGBA, and exact composed reveal without regenerating shadows.',
    'Pinned Three r185 PCF samples native depth textures, not packed RGBA color; native depth bit identity is not measured.',
    'Decoded diagnostics use the pinned packing formula in JavaScript; they do not reproduce GPU arithmetic or polygon-offset depth storage.',
    'Both negative controls must change composed PCF pixels and coverage. Native-v1 packed-color byte equality is a different contract.',
    'Four real light cameras and full native frustum traversal; no fake culling, quality changes, timing or FPS claim.',
    'WEBGL_multi_draw availability is observed. Its absence requires exact original-count fallback, not invented savings.',
    'Queued signals use ordinary OS termination; dead FIFO tickets are reaped by the existing shared owner.'] };
const lock = createCaptureLock();
let server, browser, page, refresh, directory, admitted = false, closePromise = null;
async function closeBrowser() {
  if (!browser) return;
  if (closePromise) return closePromise;
  closePromise = (async () => {
    const child = browser.process();
    try { await bounded(browser.close(), 10_000, 'owned browser close'); }
    catch (error) {
      report.errors.push(String(error));
      if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    if (child && child.exitCode === null && child.signalCode === null) {
      await bounded(new Promise(resolveClose => child.once('close', resolveClose)), 5000, 'owned browser exit');
    }
    report.browserClosed = !!child && (child.exitCode !== null || child.signalCode !== null);
  })();
  return closePromise;
}
const interrupt = signal => {
  if (report.errors.length < 16) report.errors.push(`Interrupted: ${signal}`);
  void closeBrowser().catch(error => report.errors.push(String(error)));
};
const onInt = () => interrupt('SIGINT'), onTerm = () => interrupt('SIGTERM');
try {
  directory = outputDirectory(process.argv.slice(2)); report.source = sourceReceipt();
  if (directory) writeFileSync(join(directory, 'admission.json'), JSON.stringify({ source: report.source }), { flag: 'wx' });
  await lock.acquire(45 * 60_000); admitted = true;
  process.on('SIGINT', onInt); process.on('SIGTERM', onTerm);
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  server = await createServer({ root: rootDir, logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    plugins: [{ name: 'articulated-shadow-native-fixture', enforce: 'pre', configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (request.url !== '/__articulated_shadow_fixture') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body data-articulated-shadow="1"></body></html>');
      });
    } }],
  });
  await bounded(server.listen(), 15_000, 'owned Vite listen');
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new', timeout: 30_000, protocolTimeout: 60_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  report.launch = verifyNativeBrowserLaunch(browser); report.browserVersion = await browser.version();
  page = await browser.newPage(); await page.setViewport({ width: 320, height: 240, deviceScaleFactor: 1 });
  page.on('pageerror', error => { if (report.errors.length < 16) report.errors.push(String(error)); });
  page.on('console', message => { if (message.type() === 'error' && report.errors.length < 16) report.errors.push(message.text()); });
  const response = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__articulated_shadow_fixture`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 });
  assert.equal(response?.status(), 200);
  assert.equal(await page.evaluate(() => document.body.dataset.articulatedShadow), '1');
  report.fixture = await bounded(page.evaluate(async () => {
    const { installArticulatedShadowBatchFixture } = await import('/tools/articulated-shadow-batch.browser.fixture.mjs');
    const fixture = window.__ARTICULATED_SHADOW_TEST = installArticulatedShadowBatchFixture();
    return fixture.run();
  }), 60_000, 'native articulated shadow fixture');
  retainPixels(report, directory);
  if (directory) {
    const canvas = await page.$('canvas');
    assert.ok(canvas);
    try {
      const png = await bounded(canvas.screenshot({ type: 'png' }), 15_000, 'native fixture canvas');
      const file = join(directory, 'canvas.png'); writeFileSync(file, png, { flag: 'wx' });
      report.artifacts.canvas = { file, bytes: png.length, sha256: hash(png) };
    } finally { await canvas.dispose(); }
  }
  assert.equal(report.fixture.cases.length, 6); assert.equal(report.fixture.negatives.length, 2);
  assert.equal(report.fixture.warmPasses.length, 8);
  assert.equal(report.fixture.ok, true, 'exact composed PCF pixels, coverage, articulation and draw accounting must pass');
  assert.deepEqual(sourceReceipt(), report.source, 'scoped sources changed during native acquisition');
} catch (error) { report.errors.push(String(error)); }
finally {
  if (page && !report.browserClosed) {
    try {
      const cleanup = await bounded(page.evaluate(() => {
        const fixture = window.__ARTICULATED_SHADOW_TEST; fixture?.dispose();
        return { disposed: fixture?.report.disposed === true };
      }), 5000, 'fixture resource cleanup');
      if (report.fixture) report.fixture.disposed = cleanup.disposed;
    } catch (error) { report.errors.push(String(error)); }
  }
  try { await closeBrowser(); } catch (error) { report.errors.push(String(error)); }
  if (server) {
    try { await bounded(server.close(), 10_000, 'owned Vite close'); report.serverClosed = true; }
    catch (error) { report.errors.push(String(error)); }
  }
  clearInterval(refresh);
  if (admitted && (!browser || report.browserClosed)) { lock.release(); report.lockReleased = true; }
  process.removeListener('SIGINT', onInt); process.removeListener('SIGTERM', onTerm);
}
report.ok = report.errors.length === 0 && report.fixture?.ok === true && report.fixture.disposed
  && report.browserClosed && report.serverClosed && report.lockReleased;
if (directory) writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
