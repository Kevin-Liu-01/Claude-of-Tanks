// Native production day/night-only and retained equipment-damage regression.
// Desktop + real mobile quality under viewport emulation, not physical Safari.
// Screenshots and state checks only: no performance or memory certification.
// From repo root after npm run build:
// node tools/daynight-atmosphere-probe.mjs --out=/tmp/cot-daynight-UNIQUE [--gate]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { selectBattleWeather } from '../src/engine/battleWeatherPolicy.ts';

const outputArgument = process.argv.find(x => x.startsWith('--out='))?.slice(6);
assert(outputArgument, 'An explicit unique --out= directory is required');
const out = resolve(outputArgument);
mkdirSync(out); // Refuse existing evidence; never overwrite or mix probe runs.
const report = { schemaVersion: 3, startedAt: new Date().toISOString(),
  method: 'Native production day/night/day plus former rain/snow/fog seeds; desktop High and emulated tablet real mobile quality; retained equipment damage and Garage cleanup. No performance measurement or physical-device certification.',
  acquisitionSha256: createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  cases: [], screenshots: [], observerCleanup: [],
  errors: [], consoleErrors: [], cleanupErrors: [], passed: false };
const save = () => writeFileSync(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
const deadlines = { progressMs: 5_000, settleMs: 30_000 };
report.deadlines = deadlines;
let server, browser, page;
const previewSockets = new Set();

async function within(promise, milliseconds, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds} ms`)), milliseconds);
    })]);
  } finally { clearTimeout(timer); }
}

function evaluateWithin(callback, argument, milliseconds = 10_000, label = 'Equipment probe evaluation') {
  return within(page.evaluate(callback, argument), milliseconds, label);
}

async function cleanupStep(label, action, milliseconds = 10_000) {
  try { await within(Promise.resolve().then(action), milliseconds, label); return true; }
  catch (error) { report.cleanupErrors.push(`${label}: ${error.message}`); save(); return false; }
}

function installFrameWait(deadlines) {
  const probe = window.__equipmentDamageProbe = { stateEpoch: 0, completedEpoch: -1, renderCount: 0 };
  let post = null, original = null, wrapped = null, activeWait = null;
  probe.beginStateEpoch = () => ++probe.stateEpoch;
  probe.renderReceipt = () => ({ stateEpoch: probe.stateEpoch,
    completedEpoch: probe.completedEpoch, renderCount: probe.renderCount });
  probe.install = target => {
    if (post) throw new Error('Render observer already installed');
    if (typeof target?.render !== 'function') throw new Error('Missing actual post.render');
    post = target; original = post.render;
    wrapped = function () {
      const epoch = probe.stateEpoch;
      const result = Reflect.apply(original, this, arguments);
      // A thrown/unfinished render is never progress. No extra scene render,
      // quality override or simulation step is introduced by this observer.
      probe.completedEpoch = epoch; probe.renderCount++;
      activeWait?.progress();
      return result;
    };
    post.render = wrapped;
  };
  probe.waitForFrames = count => new Promise((resolve, reject) => {
    if (!post || activeWait || !Number.isSafeInteger(count) || count < 1) {
      reject(new Error('Invalid or overlapping completed-render wait')); return;
    }
    const epoch = probe.stateEpoch, startFrame = probe.renderCount;
    const started = performance.now();
    let lastProgress = started, previous = 0, finished = false;
    const finish = error => {
      if (finished) return;
      finished = true;
      clearInterval(watchdog);
      activeWait = null;
      if (error) reject(error);
      else resolve({ epoch, startFrame, endFrame: probe.renderCount, completed: previous });
    };
    const progress = () => {
      if (probe.stateEpoch !== epoch || probe.completedEpoch !== epoch) {
        finish(new Error('State changed during completed-render wait')); return;
      }
      previous = probe.renderCount - startFrame; lastProgress = performance.now();
      if (previous >= count) finish();
    };
    const watchdog = setInterval(() => {
      const now = performance.now();
      if (now - started >= deadlines.settleMs) {
        finish(new Error(`Render settle deadline; completed ${previous}/${count}`));
      } else if (now - lastProgress >= deadlines.progressMs) {
        finish(new Error(`No completed post.render for ${deadlines.progressMs} ms; completed ${previous}/${count}`));
      }
    }, 250);
    activeWait = { progress, finish };
  });
  probe.dispose = () => {
    activeWait?.finish(new Error('Render observer disposed during wait'));
    const owned = post === null || post.render === wrapped;
    if (post && owned) post.render = original;
    if (!owned) throw new Error('Render observer ownership changed before cleanup');
    post = original = wrapped = null;
    return { restored: true, pendingWait: activeWait !== null, renderCount: probe.renderCount };
  };
}

async function configurePage(tier) {
  // Mobile/touch configuration can navigate about:blank. Observe reloads only
  // after it settles and before the one intended application navigation.
  await page.setViewport(tier.viewport);
  let mainNavigations = 0;
  page.on('framenavigated', frame => {
    if (frame !== page.mainFrame()) return;
    if (++mainNavigations > 1) {
      report.errors.push(`Unexpected main-page navigation/reload: ${frame.url()}`);
      save();
    }
  });
  page.on('error', error => { report.errors.push(`Browser page crash: ${error.message}`); save(); });
  page.on('pageerror', error => { report.errors.push(error.message); save(); });
  page.on('console', event => {
    if (event.type() === 'error') { report.consoleErrors.push(event.text()); save(); }
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('cot.gfxPreset', 'high');
    localStorage.setItem('cot.gfxMobilePreset', 'mobile');
  });
  await page.evaluateOnNewDocument(installFrameWait, deadlines);
}

async function settle(count = 120) {
  return evaluateWithin(count => window.__equipmentDamageProbe.waitForFrames(count),
    count, deadlines.settleMs + 5_000, 'Frame settling');
}

async function stage(mapId, specId = 'm1a1') {
  await evaluateWithin(async ({ mapId, specId }) => {
    const d = window.__DEBUG;
    d.shotMode = false;
    if (d.game.phase !== 'garage') await d.enterGarage();
    d.game.battleCount = 0;
    await d.beginSoloBattle({ specId, mapId, randomRoster: false });
  }, { mapId, specId }, 180_000, `Battle entry ${mapId}/${specId}`);
  await page.waitForFunction('window.__DEBUG.game.preBattleS <= 0 && window.__DEBUG.game.tanks.every(x => x.visual)', { timeout: 180_000 });
  await evaluateWithin(() => {
    const d = window.__DEBUG;
    d.shotMode = true;
    d.post.setAdaptiveSuspended(true);
    const p = d.game.player.state.pos;
    d.camera.position.set(p.x + 12, p.y + 7, p.z - 14);
    d.camera.lookAt(p.x, p.y + 2, p.z + 22);
    d.camera.fov = 50; d.camera.updateProjectionMatrix();
    window.__equipmentDamageProbe.beginStateEpoch();
    const telemetry = document.getElementById('cot-perfhud');
    if (telemetry) telemetry.style.display = 'none';
  });
}

function assertRenderedState(state) {
  assert(state.render.renderCount > 0 && state.render.completedEpoch === state.render.stateEpoch,
    'State must have completed an ordinary post.render before capture');
}

function assertScreenshotState(expected, actual) {
  assertRenderedState(actual);
  assert.equal(actual.render.stateEpoch, expected.render.stateEpoch, 'capture state epoch changed');
  assert(actual.render.renderCount >= expected.render.renderCount, 'capture render count went backwards');
  const { render: ignoredExpected, ...expectedState } = expected;
  const { render: ignoredActual, ...actualState } = actual;
  assert.deepEqual(actualState, expectedState, 'screenshot state changed around capture');
}

async function screenshot(label, expected) {
  const capture = { label, startedAt: new Date().toISOString(), completed: false };
  report.screenshots.push(capture); save();
  assertRenderedState(expected);
  capture.before = await evaluateWithin(readVisualState); save();
  assertScreenshotState(expected, capture.before);
  await within(page.screenshot({ path: resolve(out, `${label}.png`) }), 30_000, `Screenshot ${label}`);
  capture.after = await evaluateWithin(readVisualState); save();
  assertScreenshotState(capture.before, capture.after);
  capture.completed = true; capture.finishedAt = new Date().toISOString(); save();
}

function validNativeGraphics(receipt) {
  return receipt.unmaskedGpu && !receipt.contextLost && receipt.glError === 0
    && typeof receipt.gpu === 'string' && receipt.gpu.trim().length > 0
    && !/swiftshader|software|llvmpipe|softpipe/i.test(receipt.gpu);
}

async function nativeGraphics(label) {
  const receipt = await evaluateWithin(() => {
    const gl = window.__DEBUG.renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    return { unmaskedGpu: !!ext, contextLost: gl.isContextLost(), glError: gl.getError(),
      gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  report[label] = receipt; save();
  assert(validNativeGraphics(receipt),
  `Native error-free WebGL is required: ${receipt.gpu}`);
  return receipt;
}

function seedFor(biome, timeOfDay) {
  for (let seed = 1; seed < 1000; seed++) {
    if (selectBattleWeather(seed, biome).timeOfDay === timeOfDay) return seed;
  }
  throw new Error(`No ${timeOfDay} seed for ${biome}`);
}

async function atmosphereReceipt(seed, mapId) {
  await evaluateWithin(async ({ seed, mapId }) => {
    await window.__DEBUG.battleAtmosphere.prepare(seed, mapId);
    window.__equipmentDamageProbe.beginStateEpoch();
  }, { seed, mapId }, 120_000, 'Atmosphere preparation');
  await settle(30);
  return evaluateWithin(readVisualState);
}

function readVisualState() {
    const d = window.__DEBUG, directional = [], directionalColors = [], skies = [], clouds = [], cloudDecks = [];
    d.scene.traverse(object => {
      if (object.isDirectionalLight) {
        directional.push(object.intensity); directionalColors.push(object.color.toArray());
      }
      const uniforms = object.material?.uniforms;
      if (uniforms?.uSkyIntensity) skies.push(uniforms.uSkyIntensity.value);
      if (object.name === 'cloudLayer' || object.name === 'cloudLayerFar') {
        clouds.push(uniforms.uOpacity.value);
        cloudDecks.push({ name: object.name, visible: object.visible,
          opacity: uniforms.uOpacity.value, offset: uniforms.uOff.value.toArray(),
          rotation: uniforms.uRot.value.toArray(), altitude: uniforms.uAlt.value,
          scale: uniforms.uScale.value, haze: uniforms.uHazeK.value });
      }
    });
    return { weather: d.battleAtmosphere.current?.weather ?? null,
      phase: d.game.phase, mapId: d.world?.mapId ?? null,
      precipitationAttached: !!d.scene.getObjectByName('battle-precipitation'),
      preset: d.quality.resolvePresetName(), fogDensity: d.scene.fog?.density,
      fogColor: d.scene.fog?.color.toArray(), environmentIntensity: d.scene.environmentIntensity,
      directional, directionalColors, skies, clouds, cloudDecks, cloudShadeAmp: d.scene.userData.cloudShadeAmp,
      hemi: d.lighting.hemi.intensity, hemiColor: d.lighting.hemi.color.toArray(),
      worldUuid: d.world?.group.uuid ?? null,
      camera: [d.camera.position.toArray(), d.camera.quaternion.toArray(), d.camera.fov],
      playerPose: d.game.player?.visual?.root.matrixWorld.toArray() ?? null,
      raster: [d.renderer.domElement.width, d.renderer.domElement.height],
      render: window.__equipmentDamageProbe.renderReceipt() };
}

function lightingReceipt(state) {
  return Object.fromEntries(['skies', 'directional', 'directionalColors', 'hemi', 'hemiColor',
    'clouds', 'cloudDecks', 'cloudShadeAmp', 'fogDensity', 'fogColor', 'environmentIntensity']
    .map(key => [key, state[key]]));
}

function clearWeatherState(state) {
  return state.weather?.version === 2 && state.weather.condition === 'clear'
    && state.weather.precipitationIntensity === 0 && state.weather.cloudOpacityMultiplier === 1
    && state.weather.fogDensityMultiplier === 1 && !state.precipitationAttached;
}

function actualLightingChanges(day, night) {
  return day.skies.length > 0 && night.skies.length === day.skies.length
    && night.skies.some((value, index) => value < day.skies[index])
    && night.directional.some((value, index) => value < day.directional[index]);
}

function requestedScenarios(row, states) {
  return states.length === row.expected.length && states.every((state, i) =>
    state.phase === 'battle' && state.mapId === row.mapId
    && JSON.stringify(state.weather) === JSON.stringify(row.expected[i]));
}

function checkAtmosphereCase(row, preset) {
  const { day, night, restored, legacy } = row;
  const states = [day, night, restored, ...legacy];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  return {
    clearOnly: states.every(clearWeatherState),
    requestedScenarios: requestedScenarios(row, states),
    dayNightDay: day.weather.timeOfDay === 'day' && night.weather.timeOfDay === 'night'
      && restored.weather.timeOfDay === 'day',
    actualLightingChanges: actualLightingChanges(day, night),
    authoredCloudOpacityAndFogDensity: day.clouds.length === 2 && Number.isFinite(day.fogDensity)
      && states.every(state => state.fogDensity === day.fogDensity
      && same(state.clouds, day.clouds)),
    daylightRestored: same(lightingReceipt(day), lightingReceipt(restored)),
    stableScene: states.every(state => state.worldUuid === day.worldUuid
      && same(state.camera, day.camera) && same(state.playerPose, day.playerPose)),
    sameRasterAndRealTier: states.every(state => state.preset === preset && same(state.raster, day.raster)),
    actualRenderedStates: states.every(state => state.render.renderCount > 0
      && state.render.stateEpoch === state.render.completedEpoch),
  };
}

async function dayNightPictures(tier) {
  for (const [mapId, biome, oldSeeds] of [
    ['verdant', 'temperate', [24]], ['winter', 'cold', [13, 3]], ['monsoon', 'tropical', [1337]],
  ]) {
    const daySeed = seedFor(biome, 'day'), nightSeed = seedFor(biome, 'night');
    const expected = [daySeed, nightSeed, daySeed, ...oldSeeds].map(seed => selectBattleWeather(seed, biome));
    // Independent shipped historical fixtures: removing precipitation must
    // not silently re-key either of these day/night selections.
    if (mapId === 'winter') assert.equal(expected.at(-1).timeOfDay, 'night');
    if (mapId === 'monsoon') assert.equal(expected.at(-1).timeOfDay, 'day');
    const label = `${tier.label}-${mapId}`, row = { label, mapId, expected,
      legacySeeds: oldSeeds, legacy: [], checks: { completed: false } };
    report.cases.push(row); save();
    await stage(mapId);
    row.day = await atmosphereReceipt(daySeed, mapId); save();
    await screenshot(`${label}-day`, row.day);
    row.night = await atmosphereReceipt(nightSeed, mapId); save();
    await screenshot(`${label}-night`, row.night);
    for (const seed of oldSeeds) { row.legacy.push(await atmosphereReceipt(seed, mapId)); save(); }
    row.restored = await atmosphereReceipt(daySeed, mapId); save();
    await screenshot(`${label}-day-restored`, row.restored);
    await nativeGraphics(`${label}-graphics`);
    row.checks = checkAtmosphereCase(row, tier.preset); save();
    assert(Object.values(row.checks).every(Boolean), `Day/night checks failed: ${label}`);
  }
}

async function enterAuthoredGarage() {
  await evaluateWithin(async () => {
    const d = window.__DEBUG;
    d.shotMode = false; await d.enterGarage();
    window.__equipmentDamageProbe.beginStateEpoch();
  }, undefined, 120_000, 'Garage return');
  await settle(2);
  const result = await evaluateWithin(readVisualState);
  assertRenderedState(result);
  assert.equal(result.phase, 'garage'); assert.equal(result.weather, null);
  assert.equal(result.precipitationAttached, false);
  return result;
}

async function garageReceipt(baseline) {
  const result = await enterAuthoredGarage();
  assert.deepEqual(lightingReceipt(result), lightingReceipt(baseline), 'authored same-variant Garage lighting restored');
  return result;
}

async function equipmentGeometryReceipt() {
  // Leopard 2A6's authored ammo can is merged into the instance-owned
  // turretDark/nonArmor bucket (profiles/leopard.ts + mergeBucket). Hash only
  // this one geometry at explicit checkpoints, never retain fleet buffers.
  const mesh = window.__DEBUG.game.player.visual.root.getObjectByName('turretDark');
  if (!mesh?.isMesh || mesh.userData.combatHitboxRole !== 'nonArmor' || mesh.geometry.index) {
    throw new Error('Missing expected owned nonArmor turretDark merge');
  }
  const geometry = mesh.geometry;
  const digest = async name => {
    const attribute = geometry.getAttribute(name), array = attribute?.array;
    if (!(array instanceof Float32Array) || attribute.itemSize !== 3 || !array.length) {
      throw new Error(`Missing equipment ${name} Float32 buffer`);
    }
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return { count: attribute.count, sha256: Array.from(new Uint8Array(hash),
      byte => byte.toString(16).padStart(2, '0')).join('') };
  };
  return { meshUuid: mesh.uuid, geometryUuid: geometry.uuid, role: mesh.userData.combatHitboxRole,
    position: await digest('position'), normal: await digest('normal'),
    box: geometry.boundingBox ? [geometry.boundingBox.min.toArray(), geometry.boundingBox.max.toArray()] : null,
    sphere: geometry.boundingSphere ? [geometry.boundingSphere.center.toArray(), geometry.boundingSphere.radius] : null };
}

function checkEquipmentGeometry(before, after, reset) {
  for (const state of [after, reset]) {
    assert.equal(state.meshUuid, before.meshUuid, 'equipment mesh identity changed');
    assert.equal(state.geometryUuid, before.geometryUuid, 'equipment geometry ownership changed');
    assert.equal(state.role, 'nonArmor');
    assert.equal(state.position.count, before.position.count);
    assert.equal(state.normal.count, before.normal.count);
  }
  assert.notEqual(after.position.sha256, before.position.sha256, 'accepted dent must alter actual positions');
  assert.notEqual(after.normal.sha256, before.normal.sha256, 'accepted dent must alter actual normals');
  assert.deepEqual(reset, before, 'reset restores exact positions, normals and bounds');
}

async function equipmentPictures() {
  report.equipmentProgress = 'staging'; save();
  await stage('verdant', 'leo2a6');
  report.atmosphere = await evaluateWithin(async () => {
    const d = window.__DEBUG;
    await d.battleAtmosphere.prepare(1, 'verdant');
    const turret = d.game.player.visual.root.getObjectByName('rig_turret');
    const target = d.camera.position.clone().set(.26, .405, -2.485);
    turret.localToWorld(target);
    d.camera.position.copy(target).add(d.camera.position.clone().set(.65, .8, -1.35));
    d.camera.lookAt(target); d.camera.fov = 42; d.camera.updateProjectionMatrix();
    window.__equipmentDamageProbe.beginStateEpoch();
    return { condition: d.battleAtmosphere.current.weather.condition,
      timeOfDay: d.battleAtmosphere.current.weather.timeOfDay,
      precipitationAttached: !!d.scene.getObjectByName('battle-precipitation') };
  }, undefined, 120_000, 'Equipment preparation');
  save();
  assert.deepEqual(report.atmosphere, { condition: 'clear', timeOfDay: 'day', precipitationAttached: false });
  await settle(5);
  report.equipmentGeometry = { before: await evaluateWithin(equipmentGeometryReceipt) }; save();
  await screenshot('equipment-before', await evaluateWithin(readVisualState));
  report.equipmentProgress = 'before captured'; save();
  const result = await evaluateWithin(() => {
    const visual = window.__DEBUG.game.player.visual;
    const event = { impactFrame: 'turret', impactLocalPos: [.26, .405, -2.463],
      impactLocalNormal: [0, 0, -1], caliberMm: 120, kind: 'nonpen' };
    const result = { applied: visual.applyEquipmentDamage(event), duplicate: visual.applyEquipmentDamage(event) };
    window.__equipmentDamageProbe.beginStateEpoch();
    return result;
  });
  report.equipment = result; save();
  assert.deepEqual(result, { applied: true, duplicate: false });
  await settle(5);
  report.equipmentGeometry.after = await evaluateWithin(equipmentGeometryReceipt); save();
  await screenshot('equipment-after', await evaluateWithin(readVisualState));
  report.equipmentProgress = 'damage captured'; save();
  await evaluateWithin(() => {
    window.__DEBUG.game.player.visual.resetDestroyed();
    window.__equipmentDamageProbe.beginStateEpoch();
  });
  await settle(5);
  report.equipmentGeometry.reset = await evaluateWithin(equipmentGeometryReceipt); save();
  checkEquipmentGeometry(report.equipmentGeometry.before, report.equipmentGeometry.after, report.equipmentGeometry.reset);
  await screenshot('equipment-reset', await evaluateWithin(readVisualState));
  report.equipmentProgress = 'reset captured'; save();
  return result;
}

async function stopOwnedBrowser() {
  if (!browser) return;
  const child = browser.process();
  const running = () => child && child.exitCode === null && child.signalCode === null;
  const exited = new Promise(resolve => {
    if (!running()) resolve(); else child.once('exit', resolve);
  });
  const graceful = await cleanupStep('Browser graceful close', () => browser.close(), 10_000);
  if (!graceful && running()) {
    await cleanupStep(`Owned Chrome PID ${child.pid} forced exit`, async () => {
      // Only this launch's exact ChildProcess; never search/kill other Chrome
      // PIDs or a process group belonging to another browser session.
      report.chromeKill = { pid: child.pid, signal: 'SIGKILL', sent: child.kill('SIGKILL') }; save();
      await within(exited, 5_000, `Owned Chrome PID ${child.pid} exit`);
    }, 6_000);
  }
  if (!graceful) await cleanupStep('Disconnect owned browser transport', () => browser.disconnect(), 5_000);
  report.chromeStopped = !running();
  if (running()) {
    report.cleanupErrors.push(`Owned Chrome PID ${child.pid} did not exit after SIGKILL`);
    child.unref();
  }
  save();
}

async function stopOwnedPreview() {
  if (!server) return;
  const closed = new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  const graceful = await cleanupStep('Preview graceful close', () => closed, 5_000);
  if (!graceful) {
    // This Set contains only sockets accepted by our owned preview server.
    for (const socket of previewSockets) socket.destroy();
    await cleanupStep('Owned preview sockets closed', () => closed, 5_000);
  }
  report.previewStopped = !server.httpServer.listening && previewSockets.size === 0;
  if (!report.previewStopped) report.cleanupErrors.push('Owned preview did not fully stop');
  save();
}

async function stopFrameObserver() {
  if (!page || page.isClosed()) return;
  const receipt = await evaluateWithin(() => window.__equipmentDamageProbe?.dispose() ?? null);
  report.observerCleanup.push(receipt); save();
  assert(receipt?.restored && !receipt.pendingWait, 'completed-render observer must restore its owned method/timer');
}

try {
  save();
  const entry = readFileSync('dist/index.html');
  report.build = createHash('sha256').update(entry).digest('hex');
  assert(!entry.toString().includes('/@vite/client'), 'Production build required');
  server = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 5852, strictPort: true } });
  server.httpServer.on('connection', socket => {
    previewSockets.add(socket);
    socket.once('close', () => previewSockets.delete(socket));
  });
  browser = await puppeteer.launch({ headless: true, protocolTimeout: 360_000,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'] });
  report.chromePid = browser.process()?.pid ?? null; save();
  report.browserVersion = await within(browser.version(), 10_000, 'Browser version');
  for (const tier of [
    { label: 'high', query: 'desktop', preset: 'high', viewport: { width: 1440, height: 900, deviceScaleFactor: 1 } },
    { label: 'tablet', query: 'mobile', preset: 'mobile', viewport: { width: 1180, height: 820, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ]) {
    page = await within(browser.newPage(), 30_000, 'Browser page creation');
    await configurePage(tier);
    await page.goto(`http://127.0.0.1:5852/?debug=1&tier=${tier.query}`, { waitUntil: 'domcontentloaded', timeout: 360_000 });
    await page.waitForFunction('window.__GAME_READY && window.__DEBUG?.battleAtmosphere', { timeout: 360_000 });
    await evaluateWithin(() => window.__equipmentDamageProbe.install(window.__DEBUG.post));
    await settle(2);
    // The sealed Verdant cold-boot path deliberately skips preset activation
    // (main.ts): its sky default far-cloud opacity is .42, while normal Garage
    // entry authors .6. Preserve that receipt, then compare matching lifecycle
    // states. Never overwrite the raw cold state or silently waive a delta.
    report[`${tier.label}-coldGarage`] = await evaluateWithin(readVisualState); save();
    const garageBaseline = await enterAuthoredGarage();
    assert.equal(garageBaseline.phase, 'garage'); assert.equal(garageBaseline.weather, null);
    report[`${tier.label}-garageBaseline`] = garageBaseline; save();
    await nativeGraphics(`${tier.label}-graphics`);
    await dayNightPictures(tier);
    if (tier.label === 'high') {
      report.equipment = await equipmentPictures();
      await nativeGraphics('graphicsAfterEquipment');
    }
    report[`${tier.label}-garage`] = await garageReceipt(garageBaseline); save();
    await stopFrameObserver();
    await within(page.close(), 10_000, 'Page close');
  }
  report.passed = report.equipment.applied === true && report.equipment.duplicate === false
    && report.cases.length === 6 && report.cases.every(row => Object.values(row.checks).every(Boolean))
    && report.screenshots.length === 21 && report.screenshots.every(row => row.completed)
    && report.errors.length === 0 && report.consoleErrors.length === 0;
} catch (error) { report.errors.push(error.stack ?? String(error)); save(); }
finally {
  await cleanupStep('Completed-render observer cleanup', stopFrameObserver, 12_000);
  await cleanupStep('Owned browser shutdown', stopOwnedBrowser, 25_000);
  await cleanupStep('Owned preview shutdown', stopOwnedPreview, 15_000);
  report.finishedAt = new Date().toISOString();
  report.passed &&= report.cleanupErrors.length === 0
    && report.errors.length === 0 && report.consoleErrors.length === 0;
  save();
}
console.log(JSON.stringify({ out, passed: report.passed, errors: report.errors,
  consoleErrors: report.consoleErrors, cleanupErrors: report.cleanupErrors,
  equipment: report.equipment, garage: report.garage }));
if (process.argv.includes('--gate') && !report.passed) process.exitCode = 1;
