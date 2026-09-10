#!/usr/bin/env node
// Exact native pixels/GPU storage for real tank track materials; not an FPS gate.
// Owns its FIFO lease. Run directly or through the registered npm post suite.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';
import { createServer } from 'vite';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
function sourceHash() {
  const hash = createHash('sha256');
  for (const file of ['./track-texture-source.browser.selftest.mjs', '../src/vehicles/materials.ts',
    '../src/vehicles/materialPainter.ts', '../src/vehicles/camoPolicy.ts',
    '../src/engine/quality.ts', '../package-lock.json']) {
    hash.update(file); hash.update('\0'); hash.update(readFileSync(new URL(file, import.meta.url)));
  }
  return hash.digest('hex');
}
async function bounded(promise, ms, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
  })]); } finally { clearTimeout(timer); }
}

async function nativeFixture() {
  const T = await import('/node_modules/three/build/three.module.js');
  const { createTankMaterials } = await import('/src/vehicles/materials.ts');
  const renderer = new T.WebGLRenderer({ antialias: false }); renderer.setSize(256, 128);
  document.body.append(renderer.domElement);
  const report = { cases: [], allocations: {}, cleanupErrors: [], disposed: false };
  const resources = [];
  const own = value => { resources.push(value); return value; };
  const check = (condition, label) => { if (!condition) throw new Error(label); };
  function dispose() {
    if (report.disposed) return;
    report.disposed = true;
    for (const value of resources.reverse()) {
      try { value.dispose(); } catch (error) { report.cleanupErrors.push(String(error)); }
    }
    report.finalTextures = renderer.info.memory.textures;
    report.finalGeometries = renderer.info.memory.geometries;
    try { renderer.dispose(); } catch (error) { report.cleanupErrors.push(String(error)); }
  }
  window.__TRACK_SOURCE_TEST = { report, dispose };
  try {
    const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    check(extension, 'native renderer identity unavailable');
    report.renderer = String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL));
    check(!/swiftshader|llvmpipe|softpipe|software/i.test(report.renderer), 'software renderer rejected');
    const target = own(new T.WebGLRenderTarget(256, 128, { depthBuffer: true }));
    const mats = own(createTankMaterials({ id: 'native-track-source-sharing', era: 'ww2',
      visual: { base: '#4a553c', scheme: 'solid', plateLines: false } }, { anisotropy: 4 }, 7, 'low', 'factory'));
    const candidate = [mats.trackTexL, mats.trackTexR];
    check(candidate[0] !== candidate[1] && candidate[0].source === candidate[1].source,
      'actual material factory must retain distinct views sharing one Source');
    const reference = candidate.map(input => {
      const texture = own(new T.CanvasTexture(input.image));
      for (const key of ['mapping', 'channel', 'wrapS', 'wrapT', 'magFilter', 'minFilter',
        'anisotropy', 'format', 'internalFormat', 'type', 'generateMipmaps', 'premultiplyAlpha',
        'flipY', 'unpackAlignment', 'colorSpace']) texture[key] = input[key];
      texture.needsUpdate = true;
      return texture;
    });
    check(reference[0].source !== reference[1].source, 'baseline must own two independent Sources');
    const scene = new T.Scene(); scene.background = new T.Color(0x06090c);
    scene.add(new T.HemisphereLight(0xffffff, 0x303030, 2));
    const light = new T.DirectionalLight(0xffffff, 3); light.position.set(-1, 2, 4); scene.add(light);
    const geometry = own(new T.PlaneGeometry(1.7, 1.7));
    const meshes = [new T.Mesh(geometry, mats.trackL), new T.Mesh(geometry, mats.trackR)];
    meshes[0].position.x = -0.95; meshes[1].position.x = 0.95; scene.add(...meshes);
    const camera = new T.OrthographicCamera(-2, 2, 1, -1, 0.1, 10); camera.position.z = 4;
    renderer.setRenderTarget(target); renderer.clear();
    const targetTextures = renderer.info.memory.textures;
    function render(views, offsets) {
      for (let i = 0; i < 2; i++) {
        views[i].offset.set(0, offsets[i]);
        meshes[i].material.map = meshes[i].material.bumpMap = views[i];
      }
      renderer.render(scene, camera);
      const pixels = new Uint8Array(256 * 128 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 256, 128, pixels);
      return pixels;
    }
    function compare(expected, actual) {
      let changed = 0, maximum = 0;
      for (let i = 0; i < expected.length; i++) {
        const delta = Math.abs(expected[i] - actual[i]);
        changed += Number(delta !== 0); maximum = Math.max(maximum, delta);
      }
      return { changed, maximum };
    }
    function parity(label, offsets) {
      const baseline = render(reference, offsets), actual = render(candidate, offsets);
      const difference = compare(baseline, actual);
      report.cases.push({ label, offsets, ...difference });
      check(difference.changed === 0, `${label}: track pixels differ`);
      return baseline;
    }
    const referencePixels = render(reference, [0, 0]);
    // Pinned Three lazily uploads this global physical-lighting LUT on the first
    // draw. Capture the actual renderer owner, not a separately imported singleton.
    const lut = renderer.properties.get(mats.trackL).uniforms?.dfgLUT?.value;
    check(lut?.isTexture, 'physical material must expose its actual DFG LUT');
    own(lut); // This fixture owns the only renderer/page using the singleton.
    check(lut.name === 'DFG_LUT' && lut.image.width === 16 && lut.image.height === 16
      && lut.format === T.RGFormat && lut.type === T.HalfFloatType, 'unexpected renderer helper texture');
    const gpuTexture = texture => renderer.properties.get(texture).__webglTexture;
    const referenceHandles = reference.map(gpuTexture), lutHandle = gpuTexture(lut);
    check(lutHandle && referenceHandles.every(handle => handle && handle !== lutHandle)
      && lutHandle !== gpuTexture(target.texture), 'DFG LUT must own a distinct live GPU allocation');
    check(referenceHandles[0] !== referenceHandles[1], 'reference views must own distinct GPU allocations');
    report.rendererHelper = { name: lut.name, width: lut.image.width, height: lut.image.height,
      format: lut.format, type: lut.type, textures: 1 };
    report.allocations.firstDrawTotal = renderer.info.memory.textures - targetTextures;
    const baseTextures = targetTextures + report.rendererHelper.textures;
    report.allocations.reference = renderer.info.memory.textures - baseTextures;
    render(candidate, [0, 0]);
    const candidateHandles = candidate.map(gpuTexture);
    check(candidateHandles[0] && candidateHandles[0] === candidateHandles[1]
      && candidateHandles[0] !== lutHandle && !referenceHandles.includes(candidateHandles[0]),
      'candidate views must share one separate live GPU allocation');
    report.gpuHandles = { referenceDistinct: true, candidateShared: true, helperDistinct: true };
    report.allocations.candidate = renderer.info.memory.textures - baseTextures - report.allocations.reference;
    check(report.allocations.reference === 2 && report.allocations.candidate === 1, 'native GPU storage must be 2 versus 1');
    report.visibleValues = new Set(referencePixels.filter((_, index) => index % 4 !== 3)).size;
    check(report.visibleValues > 16, 'track texture must produce nonblank varied pixels');
    for (const offsets of [[0, 0], [0.375, -0.125], [-0.2, 0.7]]) parity('independent-offsets', offsets);
    const independent = render(reference, [0.375, -0.125]);
    report.coupledNegative = compare(independent, render(candidate, [0.375, 0.375])).changed;
    check(report.coupledNegative > 100, 'coupled-offset negative control must change actual pixels');

    candidate[0].dispose();
    report.allocations.afterLeftDispose = renderer.info.memory.textures - baseTextures;
    check(report.allocations.afterLeftDispose === 3, 'right view must retain shared GPU storage');
    parity('left-dispose-reupload', [0.375, -0.125]);
    check(renderer.info.memory.textures - baseTextures === 3, 'left re-upload must reuse sibling storage');
    candidate[0].dispose(); candidate[1].dispose();
    report.allocations.afterBothDispose = renderer.info.memory.textures - baseTextures;
    check(report.allocations.afterBothDispose === 2, 'last view must free shared GPU storage once');
    parity('both-dispose-reupload', [-0.2, 0.7]);
    check(renderer.info.memory.textures - baseTextures === 3, 'restored pair must own one GPU texture');
    check(gl.getError() === gl.NO_ERROR, 'native GL error');
  } finally { dispose(); }
  return report;
}

const lock = createCaptureLock();
const report = { protocol: 'track-texture-source-native-v1', ok: false, sourceHash: sourceHash(),
  errors: [], fixture: null, browserClosed: false, serverClosed: false, cacheRemoved: false, lockReleased: false };
let server, browser, page, cacheDir, refresh;
try {
  await lock.acquire(45 * 60_000);
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  cacheDir = mkdtempSync(join(tmpdir(), 'cot-track-source-vite-'));
  server = await createServer({ root, cacheDir, logLevel: 'error', optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    plugins: [{ name: 'track-source-fixture', enforce: 'pre', configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (request.url !== '/__track_source_fixture') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body data-track-source="1"></body></html>');
      });
    } }],
  });
  await server.listen();
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new', timeout: 30_000,
    protocolTimeout: 30_000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  report.launch = verifyNativeBrowserLaunch(browser); report.browserVersion = await browser.version();
  page = await browser.newPage();
  page.on('pageerror', error => { if (report.errors.length < 12) report.errors.push(String(error)); });
  page.on('console', message => {
    if (message.type() === 'error' && report.errors.length < 12) report.errors.push(message.text());
  });
  const navigation = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__track_source_fixture`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 });
  assert.equal(navigation?.status(), 200);
  assert.equal(await page.evaluate(() => document.body.dataset.trackSource), '1');
  report.fixture = await bounded(page.evaluate(nativeFixture), 45_000, 'native track fixture');
  assert.equal(report.fixture.cases.length, 5);
  assert.equal(report.fixture.finalTextures, 0); assert.equal(report.fixture.finalGeometries, 0);
  assert.deepEqual(report.fixture.cleanupErrors, []);
  assert.equal(sourceHash(), report.sourceHash, 'source changed during native acquisition');
} catch (error) { report.errors.push(String(error)); }
finally {
  if (page) try { report.fixture = await bounded(page.evaluate(() => {
    window.__TRACK_SOURCE_TEST?.dispose(); return window.__TRACK_SOURCE_TEST?.report ?? null;
  }), 5000, 'fixture cleanup'); } catch (error) { report.errors.push(String(error)); }
  if (browser) try { await bounded(browser.close(), 15_000, 'browser close'); report.browserClosed = true; }
  catch (error) {
    const child = browser.process();
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    report.errors.push(String(error));
  }
  if (server) try { await bounded(server.close(), 10_000, 'server close'); report.serverClosed = true; }
  catch (error) { report.errors.push(String(error)); }
  if (cacheDir) try { rmSync(cacheDir, { recursive: true, force: true }); report.cacheRemoved = true; }
  catch (error) { report.errors.push(String(error)); }
  clearInterval(refresh); lock.release(); report.lockReleased = true;
}
report.ok = report.errors.length === 0 && report.fixture?.disposed === true
  && report.browserClosed && report.serverClosed && report.cacheRemoved && report.lockReleased;
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
