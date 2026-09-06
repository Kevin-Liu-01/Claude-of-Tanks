// Client world eviction and forced-GC residency. No screenshot or source edits.
// Run this SAME tool against both worktrees; build each separately beforehand.
// node tools/world-residency-probe.mjs --root=/path/to/tree --production \
//   --camera-manifest=/tmp/cameras.json --maps=verdant,coastal,winter,delta,monsoon,autumn \
//   --sweeps=3 --out=/tmp/residency.json
// Candidate adds --baseline=/tmp/pristine-residency.json. New-map sweeps have
// no pristine counterpart and certify repeat boundedness, not comparative cost.
// Create the immutable camera input once using tools/SKILL.md, "Fixed camera
// residency acquisition". Both processes must receive that exact manifest.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createServer, preview } from 'vite';
import puppeteer from 'puppeteer';
import { acquireCaptureLock, refreshCaptureLock, releaseCaptureLock } from './capture-lock.mjs';
import { sampleRenderedFrames } from './render-frame-sampler.mjs';
import { evaluateWorldResidency, RESIDENCY_SCHEMA } from './world-residency-policy.mjs';
import { RESIDENCY_TERRAIN_PROTOCOL, settleResidencyTerrain } from './world-residency-acquisition.mjs';
import {
  PINNED_SCENE, primePinnedSceneStorage, configurePinnedScene, capturePinnedScene,
} from './pinned-scene-acquisition.mjs';
import {
  RESIDENCY_CAMERA_PROTOCOL, cameraManifestRecord, cameraManifestValid, cameraForMap,
  applyResidencyCamera, captureResidencyCameraState, isCameraStateReceipt,
} from './residency-camera-acquisition.mjs';
import {
  installResidencyGeometryTracker, warmResidencyTerrain, writeResidencyHeapSnapshot,
  collectResidencyPrograms, writeResidencyPrograms,
} from './world-residency-diagnostics.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const root = path.resolve(option('root', process.cwd()));
const output = path.resolve(option('out', '/private/tmp/cot-world-residency.json'));
const baselinePath = option('baseline', '');
const baseline = baselinePath ? JSON.parse(fs.readFileSync(path.resolve(baselinePath), 'utf8')) : null;
// Optional instrumentation changes the diagnostic scenario, never the default
// acquisition or its gates. Heap pauses are not suitable for timing evidence.
const diagnosticsDir = option('diagnostics-dir', '');
const programInventoryDir = option('program-inventory-dir', '');
const snapshotAt = option('heap-snapshot-at', '').split(',').filter(Boolean);
const warmTerrain = args.includes('--diagnostic-warm-terrain');
if (warmTerrain && !diagnosticsDir) throw new Error('--diagnostic-warm-terrain requires --diagnostics-dir');
if (snapshotAt.length && !diagnosticsDir) throw new Error('--heap-snapshot-at requires --diagnostics-dir');
if (snapshotAt.some(key => !/^\d+:[a-z][a-z_]*$/.test(key))) throw new Error('Snapshot checkpoints use sweep:mapId');
const production = args.includes('--production');
const maps = option('maps', 'verdant,coastal,winter,delta,monsoon,autumn').split(',').filter(Boolean);
if (new Set(maps).size !== maps.length || maps.length < 3 || maps.some(id => !/^[a-z][a-z_]*$/.test(id))) {
  throw new Error('--maps requires at least three distinct battlefield IDs');
}
const cameraManifestPath = option('camera-manifest', '');
if (!cameraManifestPath) throw new Error('--camera-manifest is required for matched absolute scene acquisition');
const cameraManifest = cameraManifestRecord(JSON.parse(fs.readFileSync(path.resolve(cameraManifestPath), 'utf8')));
if (!cameraManifestValid(cameraManifest, maps)) throw new Error('Invalid or incomplete absolute camera manifest');
const sweeps = Number(option('sweeps', '3'));
const settleMs = Number(option('settle-ms', '1500'));
if (!Number.isInteger(sweeps) || sweeps < 3 || !Number.isFinite(settleMs) || settleMs < 500) {
  throw new Error('Require --sweeps>=3 and --settle-ms>=500');
}
const tier = option('tier', 'desktop');
if (!['desktop', 'mobile'].includes(tier)) throw new Error('--tier must be desktop or mobile');
const viewport = { width: Number(option('width', '1280')), height: Number(option('height', '720')), deviceScaleFactor: 1 };
if (!Number.isInteger(viewport.width) || !Number.isInteger(viewport.height)
    || viewport.width < 320 || viewport.height < 320) throw new Error('Viewport dimensions must be integers >=320');
const hash = input => createHash('sha256').update(input).digest('hex');
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();
const sourceFingerprint = () => {
  const digest = createHash('sha256');
  for (const file of git(['ls-files', '-co', '--exclude-standard', '--', 'src']).split('\n').filter(Boolean).sort()) {
    digest.update(file); digest.update(fs.readFileSync(path.join(root, file)));
  }
  return digest.digest('hex');
};
const acquisitionFiles = ['world-residency-probe.mjs', 'render-frame-sampler.mjs',
  'world-residency-acquisition.mjs', 'pinned-scene-acquisition.mjs', 'residency-camera-acquisition.mjs'];
const probeFiles = [...acquisitionFiles, 'world-residency-policy.mjs'];
const toolDir = path.dirname(fileURLToPath(import.meta.url));
const report = {
  schemaVersion: RESIDENCY_SCHEMA,
  generatedAt: new Date().toISOString(),
  scenario: { production, viewport, tier, maps, sweeps, settleMs, seed: 1337,
    acquisition: { terrain: RESIDENCY_TERRAIN_PROTOCOL, scene: PINNED_SCENE.protocol,
      camera: RESIDENCY_CAMERA_PROTOCOL },
    scene: PINNED_SCENE, cameraManifest },
  metadata: {
    root, revision: git(['rev-parse', 'HEAD']), dirtyPaths: git(['status', '--short']).split('\n').filter(Boolean),
    sourceHash: sourceFingerprint(),
    buildIndexHash: production ? hash(fs.readFileSync(path.join(root, 'dist/index.html'))) : null,
    probeHash: hash(probeFiles.map(file => fs.readFileSync(path.join(toolDir, file), 'utf8')).join('\n')),
    acquisitionHash: hash(acquisitionFiles
      .map(file => fs.readFileSync(path.join(toolDir, file), 'utf8')).join('\n')),
    browserVersion: null, gpuRenderer: null, captureLock: 'cot-shots',
    cameraManifestPath: path.resolve(cameraManifestPath),
  },
  samples: [], errors: [], failedResponses: [],
};
if (diagnosticsDir || programInventoryDir) {
  if (diagnosticsDir) fs.mkdirSync(path.resolve(diagnosticsDir), { recursive: true });
  report.scenario.diagnostics = { geometryInventory: Boolean(diagnosticsDir), heapSnapshots: snapshotAt,
    warmTerrain, programInventory: Boolean(programInventoryDir) };
  report.metadata.diagnosticsHash = hash(fs.readFileSync(path.join(toolDir, 'world-residency-diagnostics.mjs')));
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Return serializable receipts only. Never retain a world, material, texture,
// remote JSHandle or a window-side history that itself defeats eviction.
function browserReceipt() {
  const D = window.__DEBUG;
  const renderer = D.renderer;
  return {
    activeMapId: D.world?.mapId ?? null,
    worldUuid: D.world?.group?.uuid ?? null,
    worldIds: Array.isArray(D.worldCacheIds) ? D.worldCacheIds : null,
    worldLimit: Number.isFinite(D.residentLimits?.worldScenes) ? D.residentLimits.worldScenes : null,
    releaseSupported: 'lastWorldRelease' in D,
    lastRelease: D.lastWorldRelease ?? null,
    renderer: { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
      programs: renderer.info.programs?.length ?? 0 },
    terrainIndexPool: D.world?._buildDetail?.terrain?.indexPool ?? null,
    contextLost: D.graphicsContextLost || renderer.getContext().isContextLost(),
    phase: D.game.phase,
  };
}

async function activateMap(page, mapId) {
  return page.evaluate(async id => {
    const view = id === 'verdant' ? 'battlefield' : `battlefield_${id}`;
    await window.__SHOTS.set(view);
    const D = window.__DEBUG;
    if (D.world?.mapId !== id) throw new Error(`Map activation mismatch: wanted ${id}, got ${D.world?.mapId}`);
    D.post.pinDynScale(1);
    const state = D.world.minimapTextureState;
    if (!state?.promise) return 'unsupported';
    let timer;
    try {
      await Promise.race([state.promise, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Texture settle timeout: ${id}`)), 120_000);
      })]);
    } finally { clearTimeout(timer); }
    if (!state.settled) throw new Error(`Texture promise not settled: ${id}`);
    if (!Array.isArray(state.results)) return 'promise-only';
    if (!state.results.length || state.results.some(row => !row.applied || row.failures.length)) {
      throw new Error(`Failed sourced texture receipt: ${id}`);
    }
    return 'results-verified';
  }, mapId);
}

async function collectSettled(page, cdp) {
  // Console remote objects can accidentally keep a discarded scene alive.
  await cdp.send('Runtime.discardConsoleEntries');
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(250);
  await cdp.send('HeapProfiler.collectGarbage');
  // Unlike performance.memory sampled many seconds later, this is the actual
  // post-collection managed/backing-store/DOM-embedder receipt. Missing support
  // is a failing measurement, never zero or optional successful GC.
  const heap = await cdp.send('Runtime.getHeapUsage');
  const receipt = await page.evaluate(browserReceipt);
  if (receipt.contextLost) throw new Error('WebGL context lost during world cycling');
  return { ...receipt, gcPasses: 2, heap };
}

async function verifiedCameraState(page, expectedCamera, before = null) {
  const state = await page.evaluate(captureResidencyCameraState);
  if (!isCameraStateReceipt(state, expectedCamera, viewport)) {
    throw new Error(`Absolute camera/native render state mismatch: ${JSON.stringify(state)}`);
  }
  if (before && JSON.stringify(before) !== JSON.stringify(state)) {
    throw new Error('Camera or render quality changed during actual rendered frames');
  }
  return state;
}

let server, browser, lockRefresher;
try {
  await acquireCaptureLock(30 * 60 * 1000);
  lockRefresher = setInterval(refreshCaptureLock, 60_000);
  lockRefresher.unref();
  // Vite's project warmup resolves relative to cwd even with an explicit root.
  process.chdir(root);
  server = production
    ? await preview({ root, logLevel: 'error', preview: { host: '127.0.0.1', port: 5846, strictPort: false } })
    : await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: 5846,
      strictPort: false, hmr: false, watch: null } });
  if (!production) await server.listen();
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}/?tier=${tier}&gfxreset=1&nosplash=1`;
  browser = await puppeteer.launch({ headless: 'new', protocolTimeout: 600_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage', '--js-flags=--expose-gc'] });
  report.metadata.browserVersion = await browser.version();
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.evaluateOnNewDocument(primePinnedSceneStorage, PINNED_SCENE);
  page.setDefaultTimeout(180_000);
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error' && !/favicon|github-stars|Vercel Web Analytics/.test(message.text())) {
      report.errors.push(message.text());
    }
  });
  page.on('response', response => {
    if (response.status() < 400) return;
    report.failedResponses.push({ status: response.status(), url: response.url() });
    if (response.url().startsWith(new URL(url).origin) && !/favicon|github-stars/.test(response.url())) {
      report.errors.push(`Required local resource failed: ${response.status()} ${response.url()}`);
    }
  });
  const cdp = await page.createCDPSession();
  await cdp.send('HeapProfiler.enable');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.waitForFunction(() => window.__GAME_READY === true && window.__DEBUG?.renderer && window.__SHOTS?.set);
  await page.evaluate(configurePinnedScene, PINNED_SCENE);
  if (diagnosticsDir) await page.evaluate(installResidencyGeometryTracker);
  report.metadata.gpuRenderer = await page.evaluate(() => {
    const gl = window.__DEBUG.renderer.getContext();
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
  });
  for (let sweep = 0; sweep < sweeps; sweep++) {
    for (const mapId of maps) {
      const started = performance.now();
      const textureReadiness = await activateMap(page, mapId);
      const expectedCamera = cameraForMap(cameraManifest, mapId);
      await page.evaluate(applyResidencyCamera, expectedCamera);
      await sleep(settleMs);
      const terrainPrepared = await page.evaluate(settleResidencyTerrain);
      const cameraPrepared = await verifiedCameraState(page, expectedCamera);
      await page.evaluate(sampleRenderedFrames, { count: 8, syncGpu: false });
      let terrainWarm;
      if (warmTerrain) {
        terrainWarm = await page.evaluate(warmResidencyTerrain);
        await page.evaluate(sampleRenderedFrames, { count: 8, syncGpu: false });
      }
      const terrainSettled = await page.evaluate(settleResidencyTerrain, terrainPrepared);
      const sceneIdentity = await page.evaluate(capturePinnedScene, PINNED_SCENE);
      const cameraState = await verifiedCameraState(page, expectedCamera, cameraPrepared);
      const receipt = { ...await collectSettled(page, cdp), terrainWarm: terrainSettled, sceneIdentity, cameraState };
      if (diagnosticsDir) {
        if (terrainWarm) receipt.diagnosticTerrainWarm = terrainWarm;
        receipt.geometryInventory = await page.evaluate(() => window.__RESIDENCY_DIAGNOSTICS.inventory());
        if (snapshotAt.includes(`${sweep}:${mapId}`)) {
          receipt.heapSnapshot = await writeResidencyHeapSnapshot(cdp,
            path.resolve(diagnosticsDir, `sweep${sweep}-${mapId}.heapsnapshot`));
        }
      }
      if (programInventoryDir) {
        receipt.programInventory = writeResidencyPrograms(await page.evaluate(collectResidencyPrograms),
          path.resolve(programInventoryDir), `sweep${sweep}-${mapId}`);
      }
      report.samples.push({ sweep, mapId, textureReadiness, elapsedMs: Math.round(performance.now() - started), ...receipt });
      console.log(`[world-residency] sweep${sweep}/${mapId} GC heap=${(receipt.heap.usedSize / 1048576).toFixed(2)}MiB `
        + `backing=${(receipt.heap.backingStorageSize / 1048576).toFixed(2)}MiB GPU=${receipt.renderer.geometries}/${receipt.renderer.textures}`);
    }
  }
} catch (error) {
  report.errors.push(error instanceof Error ? error.message : String(error));
} finally {
  if (browser) await browser.close();
  if (server?.close) await server.close();
  else if (server) await new Promise(resolve => server.httpServer.close(resolve));
  clearInterval(lockRefresher);
  releaseCaptureLock();
}
report.evaluation = evaluateWorldResidency(report, baseline);
report.ok = report.evaluation.pass;
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(`[world-residency] ${report.ok ? 'PASS' : 'FAIL'} ${output}`);
for (const failure of report.evaluation.checks.filter(row => !row.pass)) console.error(JSON.stringify(failure));
if (!report.ok) process.exitCode = 1;
