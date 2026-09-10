#!/usr/bin/env node
// Native storage and exact data-texture pixels; not a timing or resource-cap gate.
// Owns its FIFO lease. Run directly, without an outer capture wrapper.
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
  for (const file of ['./sourced-building-source.browser.selftest.mjs', '../src/world/sourcedBuildingDataSource.ts',
    '../src/world/sourcedTextures.ts', '../node_modules/three/src/textures/Source.js',
    '../node_modules/three/src/textures/Texture.js', '../node_modules/three/src/renderers/webgl/WebGLTextures.js',
    './native-browser-launch.mjs', './capture-lock.mjs', '../package-lock.json']) {
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
  const { replaceSourcedBuildingDataImage: replaceImage } = await import('/src/world/sourcedBuildingDataSource.ts');
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
  window.__BUILDING_SOURCE_TEST = { report, dispose };
  try {
    const gl = renderer.getContext(), extension = gl.getExtension('WEBGL_debug_renderer_info');
    check(extension, 'native renderer identity unavailable');
    report.renderer = String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL));
    check(!/swiftshader|llvmpipe|softpipe|software/i.test(report.renderer), 'software renderer rejected');
    function pattern(kind, seed = 0) {
      const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32;
      const context = canvas.getContext('2d'), pixels = context.createImageData(64, 32);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
        const i = (y * 64 + x) * 4;
        pixels.data.set(kind === 'normal'
          ? [104 + (x * 13 + y * 7 + seed) % 49, 104 + (x * 5 + y * 19 + seed) % 49,
            196 + (x * 3 + y * 11 + seed) % 59, 255]
          : [(x * 17 + y * 11) % 256, (x * x * 3 + y * 23) % 256, (x * 7 + y * y * 5) % 256, 255], i);
      }
      context.putImageData(pixels, 0, 0);
      return canvas; // Immutable after construction, including during negative controls.
    }
    function texture(canvas) {
      const view = own(new T.CanvasTexture(canvas));
      view.wrapS = view.wrapT = T.RepeatWrapping;
      view.magFilter = view.minFilter = T.NearestFilter;
      view.generateMipmaps = false; view.colorSpace = T.NoColorSpace;
      view.needsUpdate = true;
      return view;
    }
    const normal = pattern('normal'), surface = pattern('surface'), replacement = pattern('normal', 31);
    const images = [normal, normal, surface, surface];
    const reference = images.map(texture), candidate = images.map(canvas => {
      const view = texture(canvas); replaceImage(view, canvas); return view;
    });
    check(new Set(reference.map(view => view.source)).size === 4, 'reference requires four independent Sources');
    check(new Set(candidate).size === 4 && candidate[0].source === candidate[1].source
      && candidate[2].source === candidate[3].source && candidate[0].source !== candidate[2].source,
    'actual helper must share normal/surface Sources across independent views');
    const target = own(new T.WebGLRenderTarget(256, 128, { depthBuffer: false }));
    const scene = new T.Scene(), geometry = own(new T.PlaneGeometry(2, 1));
    const meshes = images.map((_, i) => {
      const material = own(new T.RawShaderMaterial({
        uniforms: { dataMap: { value: null }, uvMatrix: { value: new T.Matrix3() } },
        vertexShader: `precision highp float;
          attribute vec3 position; attribute vec2 uv;
          uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
          varying vec2 sampleUv;
          void main() { sampleUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `precision highp float;
          uniform sampler2D dataMap; uniform mat3 uvMatrix; varying vec2 sampleUv;
          void main() { gl_FragColor = texture2D(dataMap, (uvMatrix * vec3(sampleUv, 1.0)).xy); }`,
      }));
      const mesh = new T.Mesh(geometry, material);
      mesh.position.set(i % 2 ? 1 : -1, i < 2 ? 0.5 : -0.5, 0); scene.add(mesh); return mesh;
    });
    const camera = new T.OrthographicCamera(-2, 2, 1, -1, 0.1, 10); camera.position.z = 4;
    renderer.setRenderTarget(target); renderer.clear();
    const targetTextures = renderer.info.memory.textures;
    const gpuTexture = view => renderer.properties.get(view).__webglTexture;
    const allocations = () => renderer.info.memory.textures - targetTextures;
    const transforms = [[0.125, -0.25, 1.5, 1.25, 0], [-0.375, 0.2, 2, 0.75, 0.17],
      [0.3, 0.15, 1.25, 1.75, -0.13], [-0.2, 0.45, 0.75, 2, 0.29]];
    function render(views, uv = transforms) {
      for (let i = 0; i < 4; i++) {
        const [x, y, sx, sy, rotation] = uv[i], view = views[i];
        view.offset.set(x, y); view.repeat.set(sx, sy); view.center.set(0.5, 0.5);
        view.rotation = rotation; view.updateMatrix();
        meshes[i].material.uniforms.dataMap.value = view;
        meshes[i].material.uniforms.uvMatrix.value = view.matrix;
      }
      renderer.render(scene, camera);
      const pixels = new Uint8Array(256 * 128 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 256, 128, pixels);
      return pixels;
    }
    function compare(expected, actual) {
      const changedByView = [0, 0, 0, 0]; let maximum = 0;
      for (let i = 0; i < expected.length; i++) {
        const delta = Math.abs(expected[i] - actual[i]), pixel = Math.floor(i / 4);
        const view = (pixel >= 256 * 64 ? 0 : 2) + Number(pixel % 256 >= 128);
        changedByView[view] += Number(delta !== 0); maximum = Math.max(maximum, delta);
      }
      return { changed: changedByView.reduce((a, b) => a + b, 0), changedByView, maximum };
    }
    function parity(label) {
      const expected = render(reference), actual = render(candidate), difference = compare(expected, actual);
      report.cases.push({ label, ...difference });
      check(difference.changed === 0, `${label}: native data-texture pixels differ`);
      return actual;
    }
    function verifySamplerLifecycle() {
      const original = render(reference);
      report.allocations.reference = allocations();
      const referenceHandles = reference.map(gpuTexture);
      check(referenceHandles.every(Boolean) && new Set(referenceHandles).size === 4, 'reference requires four GPU handles');
      parity('independent-uv');
      report.allocations.candidate = allocations() - report.allocations.reference;
      const sharedHandle = gpuTexture(candidate[0]);
      check(sharedHandle && sharedHandle === gpuTexture(candidate[1])
        && gpuTexture(candidate[2]) === gpuTexture(candidate[3]) && sharedHandle !== gpuTexture(candidate[2])
        && candidate.every(view => !referenceHandles.includes(gpuTexture(view))), 'candidate requires two separate shared GPU handles');
      check(report.allocations.reference === 4 && report.allocations.candidate === 2, 'native storage must be 4 versus 2');
      report.visibleValues = new Set(original.filter((_, i) => i % 4 !== 3)).size;
      check(report.visibleValues > 32, 'patterns must produce nonblank varied pixels');
      const coupled = [transforms[0], transforms[0], transforms[2], transforms[2]];
      report.sharedUvNegative = compare(original, render(candidate, coupled));
      check(report.sharedUvNegative.changedByView[1] > 100 && report.sharedUvNegative.changedByView[3] > 100,
        'shared-UV negative control must change both sibling views');

      for (const views of [reference, candidate]) { views[1].wrapS = T.ClampToEdgeWrapping; views[1].needsUpdate = true; }
      const clamped = parity('different-sampler');
      report.allocations.differentSampler = allocations() - 4;
      check(report.allocations.differentSampler === 3 && gpuTexture(candidate[0]) !== gpuTexture(candidate[1]),
        'different sampler must retain a separate GPU allocation');
      check(compare(original, clamped).changedByView[1] > 100, 'sampler change must affect actual pixels');
      for (const views of [reference, candidate]) { views[1].wrapS = T.RepeatWrapping; views[1].needsUpdate = true; }
      parity('sampler-rejoin');
      check(allocations() === 6 && gpuTexture(candidate[0]) === gpuTexture(candidate[1]), 'matching sampler must rejoin storage');

      candidate[0].dispose();
      check(allocations() === 6 && gl.isTexture(sharedHandle), 'sibling must retain shared storage after first disposal');
      parity('single-dispose-reupload');
      check(allocations() === 6 && gpuTexture(candidate[0]) === sharedHandle, 'disposed view must rejoin sibling allocation');
      candidate[0].dispose(); candidate[1].dispose();
      report.allocations.afterNormalPairDispose = allocations();
      check(allocations() === 5 && !gl.isTexture(sharedHandle), 'last normal view must release shared storage once');
      parity('pair-dispose-reupload');
      check(allocations() === 6, 'reuploaded normal pair must own one allocation');
      return original;
    }
    function verifyImageReplacement(original) {
      const retainedSource = candidate[1].source, retainedHandle = gpuTexture(candidate[1]);
      replaceImage(candidate[0], replacement);
      reference[0].dispose(); reference[0].image = replacement; reference[0].needsUpdate = true;
      const replaced = parity('replace-one-image');
      report.replacementDifference = compare(original, replaced);
      report.allocations.replaced = allocations() - 4;
      check(candidate[0].source !== retainedSource && candidate[1].source === retainedSource
        && retainedSource.data === normal && candidate[1].image === normal
        && gpuTexture(candidate[1]) === retainedHandle, 'replacement must preserve sibling Source/image/GPU owner');
      check(report.replacementDifference.changedByView[0] > 100
        && report.replacementDifference.changedByView.slice(1).every(value => value === 0)
        && report.allocations.replaced === 3, 'only replaced view may change pixels/storage');
      const replacementHandle = gpuTexture(candidate[0]);
      replaceImage(candidate[0], normal);
      reference[0].dispose(); reference[0].image = normal; reference[0].needsUpdate = true;
      const restored = parity('replacement-rejoin');
      check(compare(original, restored).changed === 0 && allocations() === 6
        && candidate[0].source === retainedSource && gpuTexture(candidate[0]) === retainedHandle
        && !gl.isTexture(replacementHandle), 'restoration must rejoin and release replacement storage');

      // Deliberately broken old-style swap: even disposal before image assignment
      // mutates a sibling's shared Source. Do not corrupt the helper's own cache.
      const broken = images.map(texture), badNormal = new T.Source(normal), badSurface = new T.Source(surface);
      broken.forEach((view, i) => { view.source = i < 2 ? badNormal : badSurface; view.needsUpdate = true; });
      render(broken);
      const brokenSiblingHandle = gpuTexture(broken[1]);
      broken[0].dispose();
      check(gl.isTexture(brokenSiblingHandle), 'negative-control sibling must retain live storage');
      broken[0].image = replacement; broken[0].needsUpdate = true;
      report.sourceMutationNegative = compare(replaced, render(broken));
      check(broken[1].image === replacement && report.sourceMutationNegative.changedByView[1] > 100
        && [0, 2, 3].every(i => report.sourceMutationNegative.changedByView[i] === 0),
      'shared-Source mutation negative must corrupt actual sibling pixels');
      broken.forEach(view => view.dispose());
      candidate.forEach(view => view.dispose());
      report.allocations.afterAllCandidateDispose = allocations();
      check(allocations() === 4, 'disposing every candidate must leave only four references');
      parity('all-dispose-reupload');
      check(allocations() === 6, 'full reupload must restore exactly two candidate allocations');
    }
    function verifyBuildingSampler() {
      const maximumAnisotropy = renderer.capabilities.getMaxAnisotropy();
      const anisotropy = Math.min(4, maximumAnisotropy);
      for (const views of [reference, candidate]) for (const view of views) {
        view.dispose();
        view.magFilter = T.LinearFilter; view.minFilter = T.LinearMipmapLinearFilter;
        view.generateMipmaps = true; view.anisotropy = anisotropy; view.needsUpdate = true;
      }
      check(allocations() === 0, 'previous sampler allocations must release before building-policy upload');
      render(reference);
      const buildingReferenceAllocations = allocations(), buildingReferenceHandles = reference.map(gpuTexture);
      parity('building-linear-mipmapped-anisotropic');
      const buildingCandidateAllocations = allocations() - buildingReferenceAllocations;
      report.buildingSampler = { maximumAnisotropy, anisotropy, magFilter: T.LinearFilter,
        minFilter: T.LinearMipmapLinearFilter, generateMipmaps: true,
        referenceAllocations: buildingReferenceAllocations, candidateAllocations: buildingCandidateAllocations };
      check(buildingReferenceAllocations === 4 && buildingCandidateAllocations === 2,
        'building sampler native storage must remain 4 versus 2');
      check(buildingReferenceHandles.every(Boolean) && new Set(buildingReferenceHandles).size === 4
        && gpuTexture(candidate[0]) === gpuTexture(candidate[1])
        && gpuTexture(candidate[2]) === gpuTexture(candidate[3])
        && gpuTexture(candidate[0]) !== gpuTexture(candidate[2])
        && candidate.every(view => gpuTexture(view) && !buildingReferenceHandles.includes(gpuTexture(view))),
      'building sampler must retain four independent reference and two shared candidate GPU handles');
    }
    const original = verifySamplerLifecycle();
    verifyImageReplacement(original);
    verifyBuildingSampler();
    check(gl.getError() === gl.NO_ERROR, 'native GL error');
  } finally { dispose(); }
  return report;
}

const lock = createCaptureLock();
const report = { protocol: 'sourced-building-source-native-v1', ok: false, sourceHash: sourceHash(),
  errors: [], fixture: null, interruptedSignal: null,
  browserClosed: false, serverClosed: false, cacheRemoved: false, lockReleased: false };
let server, browser, page, cacheDir, refresh;
function terminateOwnedBrowser() {
  try {
    const child = browser?.process();
    if (child && child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  } catch (error) { report.errors.push(String(error)); }
}
function interrupt(signal) {
  report.interruptedSignal ??= signal;
  terminateOwnedBrowser();
}
function checkInterrupted() {
  if (!report.interruptedSignal) return;
  terminateOwnedBrowser();
  throw new Error(`native building fixture interrupted: ${report.interruptedSignal}`);
}
const onSigint = () => interrupt('SIGINT'), onSigterm = () => interrupt('SIGTERM');
try {
  await lock.acquire(45 * 60_000);
  // Before admission, retain ordinary OS termination and the shared FIFO policy.
  process.on('SIGINT', onSigint); process.on('SIGTERM', onSigterm);
  refresh = setInterval(() => lock.refresh(), 30_000); refresh.unref();
  cacheDir = mkdtempSync(join(tmpdir(), 'cot-building-source-vite-'));
  server = await createServer({ root, cacheDir, logLevel: 'error', optimizeDeps: { noDiscovery: true },
    server: { host: '127.0.0.1', port: 0, hmr: false, watch: null },
    plugins: [{ name: 'building-source-fixture', enforce: 'pre', configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (request.url !== '/__building_source_fixture') return next();
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><html><head><link rel="icon" href="data:,"></head><body data-building-source="1"></body></html>');
      });
    } }],
  });
  checkInterrupted();
  await bounded(server.listen(), 15_000, 'server listen');
  checkInterrupted();
  // Do not race launch against a signal: await its result, then close its owned
  // child before proceeding. Puppeteer's exit handlers must not bypass finally.
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new', timeout: 30_000,
    handleSIGINT: false, handleSIGTERM: false,
    protocolTimeout: 30_000, args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  checkInterrupted();
  report.launch = verifyNativeBrowserLaunch(browser); report.browserVersion = await browser.version();
  checkInterrupted();
  page = await browser.newPage();
  checkInterrupted();
  page.on('pageerror', error => { if (report.errors.length < 12) report.errors.push(String(error)); });
  page.on('console', message => {
    if (message.type() === 'error' && report.errors.length < 12) report.errors.push(message.text());
  });
  const navigation = await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__building_source_fixture`,
    { waitUntil: 'domcontentloaded', timeout: 30_000 });
  checkInterrupted();
  assert.equal(navigation?.status(), 200);
  const fixtureMarker = await page.evaluate(() => document.body.dataset.buildingSource);
  checkInterrupted();
  assert.equal(fixtureMarker, '1');
  report.fixture = await bounded(page.evaluate(nativeFixture), 45_000, 'native building fixture');
  checkInterrupted();
  assert.equal(report.fixture.cases.length, 9);
  assert.equal(report.fixture.finalTextures, 0); assert.equal(report.fixture.finalGeometries, 0);
  assert.deepEqual(report.fixture.cleanupErrors, []);
  assert.equal(sourceHash(), report.sourceHash, 'source changed during native acquisition');
} catch (error) { report.errors.push(String(error)); }
finally {
  if (page) try { report.fixture = await bounded(page.evaluate(() => {
    window.__BUILDING_SOURCE_TEST?.dispose(); return window.__BUILDING_SOURCE_TEST?.report ?? null;
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
  process.removeListener('SIGINT', onSigint); process.removeListener('SIGTERM', onSigterm);
}
report.ok = report.interruptedSignal === null && report.errors.length === 0 && report.fixture?.disposed === true
  && report.browserClosed && report.serverClosed && report.cacheRemoved && report.lockReleased;
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
