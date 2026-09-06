import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  ACQUISITION_PROTOCOL, settleMapTextures, applyTimingCamera, captureTimingState,
  requireComparableRun, requireTimingReceipt, requireSameTimingState,
  waitForTimingGarage, warmTimingGarage, captureTimingGarageOwner, captureTimingBackend,
  requireTimingGarageSetup, requireSameTimingGarageSetup,
  requireTimingBuildProvenance,
} from './map-environment-acquisition.mjs';
import { PINNED_SCENE } from './pinned-scene-acquisition.mjs';

const scene = {
  protocol: PINNED_SCENE.protocol, selectedSpecId: 'm1a2',
  playerEntityId: 'm1a2', playerSpecId: 'm1a2',
  entities: PINNED_SCENE.roster.map((specId, index) => ({
    entityId: specId, team: index < 4 ? 'player' : 'enemy', specId,
    isPlayer: index === 0, visualSpecId: specId,
  })),
};
const settings = {
  protocol: ACQUISITION_PROTOCOL, harnessHash: 'same-tool-content-hash',
  viewport: { width: 1440, height: 900, dpr: 1 }, sampleCount: 90, repeats: 3,
  settleMs: 2500, syncGpu: false, tier: 'desktop', captureShots: false, production: true, maps: ['verdant'],
};
const garage = {
  built: true, variant: 'verdant_motor_pool', mapId: 'verdant', exhibitCount: 5,
  sourceVehicleIds: ['t90a_burlak', 'm1a2', 'leo2a5_a5nl', 't90m', 'k2'],
  optimizedTriangleParity: true, triangles: 100, optimizedTriangles: 100,
  nodes: 3, meshes: 2, geometries: 1, materials: 2, textures: 2,
};
const garageSetup = {
  ownerBefore: garage, owner: garage, warm: { frames: 8, stable: true, renderer: { geometries: 100, textures: 30, programs: 20 } },
  backend: { vendor: 'Apple', renderer: 'ANGLE Metal Renderer: Apple M5 Max', version: 'WebGL 2.0', contextLost: false },
  browserVersion: 'Chrome/151.0.7922.47',
};
const receipt = {
  garage,
  scene, readiness: { mapId: 'verdant', settled: true, evidence: 'legacy-settled-promise', results: null },
  terrain: { protocol: 'countdown-lookahead-v1', jobs: 3, exhausted: true, verified: true, pendingAfterRender: 0,
    topology: { worldUuid: 'world-one', camera: [1, 2, 3, 0, 0, 0, 1],
      initialGeometryCount: 64, streamedGeometryCount: 3, indexReferences: 67 } },
  state: {
    mapId: 'verdant',
    camera: { position: [1, 2, 3], quaternion: [0, 0, 0, 1], fov: 55, near: 0.1, far: 8000 },
    render: { canvas: [1440, 900], pixelRatio: 1, renderScale: 1, dynScale: 1,
      postAA: 'smaa+fsr1', msaaSamples: 4, preset: 'high', perfTrim: 0, gtao: true, bloom: true, contextLost: false },
  },
};
const baseline = {
  schemaVersion: 5, acquisition: settings, buildIndexHash: 'a'.repeat(64), pageErrors: [], garageSetup,
  maps: [{ id: 'verdant', acquisition: receipt, frames: { runs: Array.from({ length: 3 }, () => ({
    sampleCount: 90, medianMs: 16, p95Ms: 20, renderMedianMs: 12, renderP95Ms: 16,
    callsMax: 700, trianglesMax: 4000000, acquisitionBefore: receipt, acquisitionAfter: receipt,
  })) } }],
};
requireComparableRun(baseline, settings);
requireComparableRun(baseline, { ...settings, maps: ['verdant', 'oasis'] });
for (const [key, value] of [
  ['sampleCount', 100], ['repeats', 5], ['settleMs', 1100], ['syncGpu', true], ['tier', 'auto'],
  ['harnessHash', 'other-tool'], ['viewport', { width: 1920, height: 1080, dpr: 1 }],
  ['maps', ['oasis', 'verdant']], ['captureShots', true], ['production', false], ['production', undefined],
]) assert.throws(() => requireComparableRun(baseline, { ...settings, [key]: value }), undefined, key);
assert.throws(() => requireComparableRun({ schemaVersion: 2 }, settings), /recapture/);
assert.throws(() => requireComparableRun({ ...baseline, schemaVersion: 3 }, settings), /recapture/);
assert.throws(() => requireComparableRun({ ...baseline, schemaVersion: 4 }, settings), /recapture/);
requireComparableRun({ ...baseline, buildIndexHash: 'b'.repeat(64) }, settings);
const development = { ...baseline, acquisition: { ...settings, production: false }, buildIndexHash: null };
requireComparableRun(development, development.acquisition);
assert.throws(() => requireComparableRun(development, settings), /production/);
for (const buildIndexHash of [undefined, null, '', 'not-a-sha', 'a'.repeat(63), ['a'.repeat(64)]]) {
  assert.throws(() => requireTimingBuildProvenance({ ...baseline, buildIndexHash }), /provenance/);
}
assert.throws(() => requireTimingBuildProvenance({ ...development, buildIndexHash: 'a'.repeat(64) }), /provenance/);
assert.throws(() => requireTimingBuildProvenance({ ...baseline, acquisition: {} }), /mode/);
for (const mutate of [
  b => { b.pageErrors.push('shader failure'); },
  b => { b.acquisitionError = 'warm failed'; },
  b => { b.maps[0].frames.runs.pop(); },
  b => { b.maps[0].frames.runs[0].sampleCount--; },
  b => { b.maps[0].frames.runs[0].renderMedianMs = NaN; },
  b => { b.maps[0].frames.runs[0].acquisitionAfter.state.render.dynScale = 0.9; },
  b => { b.maps[0].acquisition.scene.playerSpecId = 'm1a3'; },
  b => { b.maps[0].acquisition.readiness.results = [{ applied: false, failures: ['load failed'] }]; },
  b => { b.maps[0].acquisition.readiness.evidence = 'unknown'; },
  b => { b.maps[0].acquisition.terrain.pendingAfterRender = 1; },
  b => { b.maps[0].frames.runs[1].acquisitionAfter.terrain.topology.streamedGeometryCount++; },
  b => { delete b.garageSetup; },
  b => { b.garageSetup.owner.built = false; },
  b => { b.garageSetup.ownerBefore.geometries++; },
  b => { b.garageSetup.warm.frames = 9; },
  b => { b.garageSetup.warm.stable = false; },
  b => { b.garageSetup.backend.contextLost = true; },
  b => { b.garageSetup.backend.renderer = ''; },
  b => { b.garageSetup.warm.renderer.programs = NaN; },
  b => { b.maps[0].acquisition.garage.geometries++; },
  b => { b.maps[0].frames.runs[1].acquisitionAfter.garage.textures++; },
]) {
  // JSON clone deliberately breaks shared references like a report on disk.
  const broken = JSON.parse(JSON.stringify(baseline));
  mutate(broken);
  assert.throws(() => requireComparableRun(broken, settings));
}
requireTimingReceipt(receipt, 'verdant', settings.viewport);
for (const mutate of [
  r => { r.state.render.perfTrim = 1; },
  r => { r.state.render.renderScale = 0.8; },
  r => { r.state.render.canvas[0] = 1000; },
  r => { r.state.camera.position[0] = NaN; },
  r => { r.readiness.settled = false; },
  r => { r.readiness.evidence = 'verified-target-results'; r.readiness.results = [{ applied: true, failures: ['decode'] }]; },
  r => { r.terrain.verified = false; },
  r => { r.terrain.topology.camera[0]++; },
  r => { r.state.render.contextLost = true; },
  r => { r.garage.exhibitCount = 0; },
  r => { r.garage.variant = 'fjord_drydock'; },
  r => { r.garage.sourceVehicleIds.reverse(); },
]) {
  const broken = structuredClone(receipt);
  mutate(broken);
  assert.throws(() => requireTimingReceipt(broken, 'verdant', settings.viewport));
}
for (const mutate of [
  r => { r.state.camera.position[1]++; },
  r => { r.state.render.msaaSamples = 0; },
  r => { r.state.render.gtao = false; },
  r => { r.scene.entities.reverse(); },
  r => { r.terrain.topology.indexReferences++; },
  r => { r.garage.materials++; },
]) {
  const changed = structuredClone(receipt);
  mutate(changed);
  assert.throws(() => requireSameTimingState(receipt, changed), /changed/);
}
requireTimingGarageSetup(garageSetup);
requireSameTimingGarageSetup(garageSetup, structuredClone(garageSetup));
for (const mutate of [
  g => { g.owner.textures++; },
  g => { g.backend.renderer = 'SwiftShader'; },
  g => { g.backend.vendor = 'Other'; },
  g => { g.browserVersion = 'Chrome/152'; },
]) {
  const changed = structuredClone(garageSetup);
  mutate(changed);
  assert.throws(() => requireSameTimingGarageSetup(garageSetup, changed), /changed/);
}

const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const vector = value => ({ value: [...value], fromArray(next) { this.value = [...next]; }, toArray() { return this.value; } });
let lodUpdates = 0;
let lightingUpdates = 0;
const camera = {
  position: vector([0, 0, 0]), quaternion: vector([0, 0, 0, 1]), fov: 1, near: 1, far: 1,
  updateProjectionMatrix() {}, updateMatrixWorld() {},
};
const world = { mapId: 'verdant', update() { lodUpdates++; },
  minimapTextureState: { promise: Promise.resolve(), settled: true } };
const debug = {
  world, camera,
  lighting: { updateFrustums() {}, update() { lightingUpdates++; } },
  renderer: { domElement: { width: 1440, height: 900, dataset: { renderScale: '1.000', postAa: 'smaa+fsr1' } },
    getPixelRatio: () => 1, getContext: () => ({ isContextLost: () => false }) },
  post: { dynScale: 1, msaaSamples: 4, perfTrim: 0, gtao: { enabled: true }, bloom: { enabled: true } },
  quality: { resolvePresetName: () => 'high' },
};
Object.defineProperty(globalThis, 'window', { configurable: true, value: { __DEBUG: debug } });
// Reconstructing browser functions proves they do not close over Node imports.
const browserSettle = Function(`return (${settleMapTextures.toString()})`)();
try {
  const legacy = await browserSettle({ mapId: 'verdant' });
  assert.equal(legacy.evidence, 'legacy-settled-promise');
  world.minimapTextureState.results = [{ target: 'ground', applied: true, failures: [] }];
  assert.equal((await browserSettle({ mapId: 'verdant' })).evidence, 'verified-target-results');
  world.minimapTextureState.results[0].applied = false;
  await assert.rejects(browserSettle({ mapId: 'verdant' }), /application failed/);
  delete world.minimapTextureState.results;
  world.minimapTextureState.settled = false;
  await assert.rejects(browserSettle({ mapId: 'verdant' }), /unsettled/);
  world.minimapTextureState.promise = new Promise(() => {});
  await assert.rejects(browserSettle({ mapId: 'verdant', timeoutMs: 1 }), /timeout/);
  world.minimapTextureState.promise = Promise.resolve().then(() => { debug.world = { ...world }; });
  await assert.rejects(browserSettle({ mapId: 'verdant' }), /changed/);
  debug.world = world;
  Function(`return (${applyTimingCamera.toString()})`)()(receipt.state.camera);
  assert.equal(lodUpdates, 1);
  assert.equal(lightingUpdates, 1);
  assert.deepEqual(Function(`return (${captureTimingState.toString()})`)()(), receipt.state);

  let built = false, forcedDrains = 0;
  const idle = { current: 'dressing', queued: 0 };
  debug.game = { phase: 'garage' };
  debug.garageDressing = { isBuilt: () => built };
  window.__GARAGE_IDLE_WORK = idle;
  window.__GARAGE_WORKSHOP = { async ensureBuilt() {
    assert.equal(built, true, 'never force chunks before the natural builder finishes');
    assert.equal(idle.current, null, 'never race an in-flight quiet lease');
    forcedDrains++;
  } };
  const browserGarageWait = Function(`return (${waitForTimingGarage.toString()})`)();
  await assert.rejects(browserGarageWait({ timeoutMs: 1, pollMs: 1 }), /timeout/);
  assert.equal(forcedDrains, 0);
  built = true;
  await assert.rejects(browserGarageWait({ timeoutMs: 1, pollMs: 1 }), /timeout/);
  assert.equal(forcedDrains, 0, 'built alone does not bypass an outstanding lease');
  idle.current = null;
  await browserGarageWait();
  assert.equal(forcedDrains, 1);
  debug.game.phase = 'shot';
  await assert.rejects(browserGarageWait(), /left Garage/);

  const render = () => {};
  debug.post.render = render;
  debug.renderer.info = { memory: { geometries: 100, textures: 30 }, programs: Array(20) };
  const browserGarageWarm = Function(`return (${warmTimingGarage.toString()})`)();
  const warmed = browserGarageWarm();
  for (let frame = 0; frame < 7; frame++) debug.post.render();
  assert.notEqual(debug.post.render, render, 'seven actual renders are not eight');
  debug.post.render();
  assert.deepEqual(await warmed, garageSetup.warm);
  assert.equal(debug.post.render, render);
  const unstable = browserGarageWarm();
  for (let frame = 0; frame < 7; frame++) debug.post.render();
  debug.renderer.info.memory.geometries++;
  debug.post.render();
  assert.equal((await unstable).stable, false, 'late work fails; it does not add warm frames');
  await assert.rejects(browserGarageWarm({ timeoutMs: 1 }), /only 0\/8/);
  assert.equal(debug.post.render, render, 'timeout restores the real renderer');
  const failedRender = () => { throw new Error('render failure'); };
  debug.post.render = failedRender;
  const renderFailure = browserGarageWarm();
  assert.throws(() => debug.post.render(), /render failure/);
  await assert.rejects(renderFailure, /render failure/);
  assert.equal(debug.post.render, failedRender, 'exception restores the real renderer');

  const texture = { isTexture: true }, shaderTexture = { isTexture: true };
  const geometry = {};
  const objects = [{}, { isMesh: true, geometry, material: { map: texture } },
    { isMesh: true, geometry, material: [{ uniforms: { map: { value: shaderTexture } } }] }];
  debug.garageDressing.group = { traverse: visit => objects.forEach(visit) };
  window.__GARAGE_WORKSHOP.stats = () => ({ ...garage, selected: garage.variant });
  assert.deepEqual(Function(`return (${captureTimingGarageOwner.toString()})`)()(), garage);
  const extension = { UNMASKED_VENDOR_WEBGL: 1, UNMASKED_RENDERER_WEBGL: 2 };
  debug.renderer.getContext = () => ({ VERSION: 3, getExtension: () => extension,
    getParameter: key => [null, garageSetup.backend.vendor, garageSetup.backend.renderer, garageSetup.backend.version][key],
    isContextLost: () => false });
  const browserBackend = Function(`return (${captureTimingBackend.toString()})`)();
  assert.deepEqual(browserBackend(), garageSetup.backend);
  debug.renderer.getContext = () => ({ getExtension: () => null });
  assert.throws(browserBackend, /unavailable/);
} finally {
  if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow);
  else delete globalThis.window;
}

const tool = fs.readFileSync(new URL('./map-environment-audit.mjs', import.meta.url), 'utf8');
assert.ok(tool.includes("const production = flagArg('production')"), 'CLI production flag is actually consumed');
assert.ok(tool.includes("fs.readFileSync(path.join(ROOT, 'dist/index.html'))"), 'hash the served build index');
assert.ok(tool.includes('if (readBuildIndexHash() !== report.buildIndexHash)'), 'a replaced build invalidates timing');
// Execute the exact production/dev selection and close branches with ports;
// these fixtures launch neither a server nor a browser.
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const serverStart = tool.indexOf('  const selectedPort =');
const serverEnd = tool.indexOf('  const address =', serverStart);
assert.ok(serverStart > 0 && serverEnd > serverStart);
const selectServer = new AsyncFunction('production', 'ROOT', 'preview', 'createServer',
  `let server;\n${tool.slice(serverStart, serverEnd)}\nreturn server;`);
for (const production of [true, false]) {
  const calls = [];
  const stub = { listen: async () => calls.push('listen') };
  const make = kind => async options => {
    calls.push(kind);
    assert.equal(options.root, '/fixture/build');
    assert.equal((production ? options.preview : options.server).host, '127.0.0.1');
    return stub;
  };
  assert.equal(await selectServer(production, '/fixture/build', make('preview'), make('dev')), stub);
  assert.deepEqual(calls, production ? ['preview'] : ['dev', 'listen']);
}
const closeStart = tool.lastIndexOf('} finally {\n  try {\n    if (browser)');
assert.ok(closeStart > 0);
const closeOwned = new AsyncFunction('browser', 'server', 'clearInterval', 'releaseCaptureLock', 'lockRefresher',
  `try {} ${tool.slice(closeStart + 2)}`);
for (const mode of ['dev', 'preview', 'browser-error', 'server-error', 'none']) {
  const calls = [];
  const browser = mode === 'none' ? null : { async close() {
    calls.push('browser');
    if (mode === 'browser-error') throw new Error('browser close failed');
  } };
  const server = mode === 'none' ? null : mode === 'dev'
    ? { async close() { calls.push('dev'); } }
    : { httpServer: { close(done) {
      calls.push('preview'); done(mode === 'server-error' ? new Error('server close failed') : undefined);
    } } };
  const closing = closeOwned(browser, server, () => calls.push('timer'), () => calls.push('lock'), 1);
  if (mode.endsWith('-error')) await assert.rejects(closing, /close failed/);
  else await closing;
  assert.deepEqual(calls, mode === 'none' ? ['timer', 'lock']
    : ['browser', mode === 'dev' ? 'dev' : 'preview', 'timer', 'lock']);
}
assert.ok(tool.indexOf('evaluateOnNewDocument(primePinnedSceneStorage') < tool.indexOf('page.goto('));
assert.ok(tool.includes('if (prior) await page.evaluate(applyTimingCamera, prior.state.camera)'));
assert.ok(tool.includes('await page.evaluate(settleMapTextures, { mapId })'));
assert.ok(tool.includes('await page.evaluate(settleResidencyTerrain, prepared.terrain)'));
assert.ok(tool.includes('await page.evaluate(sampleRenderedFrames, { count: 8, syncGpu })'));
assert.ok(tool.indexOf('await page.evaluate(waitForTimingGarage)') < tool.indexOf("window.__SHOTS.set('garage')"));
assert.ok(tool.indexOf('await page.evaluate(warmTimingGarage)') < tool.indexOf('for (const mapId of requested)'));
assert.ok(tool.includes('if (baseline) requireSameTimingGarageSetup(baseline.garageSetup, report.garageSetup)'));
assert.ok(tool.includes("path.join(ROOT, 'src/world/maps/index.ts')"), 'target root owns map catalog');
console.log('map-environment-acquisition: production selection/provenance/cleanup, full-Garage ownership, fixed eight renders, actual GPU and strict repeated pairing passed');
