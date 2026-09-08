#!/usr/bin/env node
// Native two-client regression against an existing, immutable public build.
// --dist=/absolute/dist --out=/absolute/new-evidence --expected-build-index-hash=<sha256>
// Optional: --timeout-ms=240000 --local-signaling (only a built loopback default).
// With no arguments, runs CPU-only harness guard checks for the npm test suite.
// Owns one private 1v1 room when explicitly run. No build, endpoint substitution,
// readiness helpers, renderer/clock overrides, or synthetic application events.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';
import { browserOperationFailure, observeBrowserHealth } from './browser-failure-evidence.mjs';
import { productionUiOptions, validateProductionRoomEndpoint, readProductionGarageReadiness,
  readProductionRenderingContext, readUiState, validateUiProgress, waitForCompletedRoomMap,
  recordCompletedRoomMapLaunch, captureBattleScreenshot, cleanupProductionUi,
} from './production-private-room-ui.mjs';
import { observeProductionEntry, productionBattleLoaderHidden } from './production-entry-observer.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DESERT = '.cot-map-card:has(.mthumb.desert)';
const CLEANUP_RESERVE_MS = 35000;
const MIN_TIMEOUT_MS = 90000;
const CAPTURE_QUEUE_TIMEOUT_MS = 45 * 60 * 1000;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

function treeHash(directory, accept, prefix = '') {
  const hash = createHash('sha256');
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = `${prefix}${entry.name}`, absolute = join(directory, entry.name);
    if (entry.isDirectory()) hash.update(relative).update(treeHash(absolute, accept, `${relative}/`));
    else if (entry.isFile() && accept(relative)) hash.update(relative).update(readFileSync(absolute));
  }
  return hash.digest('hex');
}

function acquisitionHash() {
  const files = new Map();
  function visit(file) {
    if (files.has(file)) return;
    const source = readFileSync(file, 'utf8'); files.set(file, source);
    for (const match of source.matchAll(/from\s+['"](\.\/[^'"]+\.mjs)['"]/g)) visit(resolve(dirname(file), match[1]));
  }
  visit(fileURLToPath(import.meta.url));
  const hash = createHash('sha256');
  for (const [file, source] of [...files].sort(([a], [b]) => a.localeCompare(b))) hash.update(file.slice(ROOT.length)).update(source);
  return hash.update(readFileSync(join(ROOT, 'package-lock.json'))).digest('hex');
}

async function bounded(promise, timeoutMs, stage) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(stage), { operationFailure: 'deadline' })), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

/** A deadline stops the caller, not the producer. Retain inside the producer
 * and join every admitted acquisition before closing resources/releasing the
 * capture lease. Browser launch and lock admission also own native deadlines.
 */
export function createAcquisitionOwner() {
  const pending = [];
  let closed = false, retained = 0;
  return {
    acquire(acquire, retain) {
      assert.equal(closed, false, 'Acquisition admission is closed during cleanup');
      const operation = Promise.resolve().then(acquire).then(owner => {
        retain(owner); retained++; return owner;
      });
      pending.push(operation);
      return operation;
    },
    async drain() {
      closed = true;
      const results = await Promise.allSettled(pending);
      return { admitted: pending.length, retained, rejected: results.filter(row => row.status === 'rejected').length,
        drainedBeforeResourceCleanup: true };
    },
  };
}

export function scenarioTimeRemaining(timeoutMs, startedAt, now) {
  return Math.max(1, timeoutMs - CLEANUP_RESERVE_MS - (startedAt === null ? 0 : now - startedAt));
}

/** Read-only event evidence. Owns only its listeners/timer, never application state.
 * The capture-phase trusted click records the exact pre-handler race condition.
 * The native Ready click ledger makes completion-before-Ready independently auditable.
 */
export function installLobbyObserver() {
  const state = { clicks: [], changes: [], dropped: 0, countdown: [], rolloutAt: null };
  let signature = '';
  const read = () => {
    const stats = window.__WORLD_PREFETCH;
    const players = [...document.querySelectorAll('.cot-play .lobby .players > .player')];
    const count = key => Number.isFinite(stats?.[key]) ? stats[key] : null;
    return { at: performance.now(), garage: window.__DEBUG?.game?.phase === 'garage',
      hasRoom: new URL(location.href).searchParams.has('room'),
      players: players.length, notReady: players.filter(row => row.querySelector('.wait')).length,
      canonicalWinter: document.querySelector('.cot-play [data-control="map"]')?.value === 'winter',
      activeWinter: stats?.active === 'winter', idle: stats?.active === null,
      completedWinter: stats?.lastMap === 'winter', desertSelected: !!document.querySelector('.cot-map-card.sel .mthumb.desert'),
      requested: count('requested'), completed: count('completed'), cancelled: count('cancelled'), promoted: count('promoted') };
  };
  const record = () => {
    const row = read();
    const next = JSON.stringify({ ...row, at: 0 });
    if (next !== signature) {
      signature = next;
      if (state.changes.length < 256) state.changes.push(row); else state.dropped++;
    }
    const overlay = document.querySelector('.cot-prebattle');
    const numeral = overlay?.querySelector('.n')?.textContent?.trim();
    if (/^[1-5]$/.test(numeral ?? '') && state.countdown.at(-1)?.value !== Number(numeral) && state.countdown.length < 16) {
      state.countdown.push({ at: performance.now(), value: Number(numeral),
        preBattleS: window.__DEBUG?.game?.preBattleS ?? null,
        focused: document.hasFocus(), hidden: document.hidden });
    }
    if (numeral === 'ROLL OUT!' && state.rolloutAt === null) state.rolloutAt = performance.now();
  };
  const click = event => {
    const element = event.target instanceof Element ? event.target : null;
    const action = element?.closest('.cot-map-card')?.querySelector('.mthumb.desert') ? 'desert'
      : element?.closest('.cot-play [data-action="ready"]') ? 'ready' : null;
    if (action && state.clicks.length < 8) state.clicks.push({ action, trusted: event.isTrusted, before: read() });
    record();
  };
  document.addEventListener('click', click, true);
  const timer = setInterval(record, 50);
  const mutations = new MutationObserver(record);
  mutations.observe(document.body, { childList: true, subtree: true, characterData: true });
  record();
  window.__COT_LOBBY_PREFETCH_CHECK = { read: () => ({ ...state, current: read() }), stop() {
    clearInterval(timer); mutations.disconnect(); document.removeEventListener('click', click, true);
    return this.read();
  } };
}

export function readLobbyObserver(stop = false) {
  const observer = window.__COT_LOBBY_PREFETCH_CHECK;
  return stop ? observer?.stop() : observer?.read();
}

export function validateRaceClick(receipt) {
  const clicks = receipt?.clicks ?? [];
  const click = clicks.find(row => row.action === 'desert');
  assert.ok(click?.trusted, 'A trusted native Desert click is required');
  assert.equal(click.before.garage && click.before.hasRoom && click.before.canonicalWinter && click.before.activeWinter, true,
    'Race missed: Winter must be actively building in the retained room at the actual Desert click');
  assert.equal(click.before.players, 2);
  assert.equal(click.before.notReady, 2, 'Both real players must still be Not Ready at the actual Desert click');
  assert.equal(clicks.filter(row => row.action === 'ready').length, 0, 'Ready cannot precede the race');
  return click;
}

async function runCpuSelftest() {
  assert.equal(scenarioTimeRemaining(240000, null, CAPTURE_QUEUE_TIMEOUT_MS), 205000,
    'Even a full FIFO queue wait cannot consume the not-yet-started scenario budget');
  assert.equal(scenarioTimeRemaining(240000, CAPTURE_QUEUE_TIMEOUT_MS, CAPTURE_QUEUE_TIMEOUT_MS + 15000), 190000,
    'The scenario clock advances normally after admission');
  const valid = { clicks: [{ action: 'desert', trusted: true, before: {
    garage: true, hasRoom: true, canonicalWinter: true, activeWinter: true, players: 2, notReady: 2 } }] };
  assert.equal(validateRaceClick(valid), valid.clicks[0]);
  for (const field of ['garage', 'hasRoom', 'canonicalWinter', 'activeWinter']) {
    const changed = structuredClone(valid); changed.clicks[0].before[field] = false;
    assert.throws(() => validateRaceClick(changed));
  }
  for (const field of ['players', 'notReady']) {
    const changed = structuredClone(valid); changed.clicks[0].before[field] = 1;
    assert.throws(() => validateRaceClick(changed));
  }
  assert.throws(() => validateRaceClick({ clicks: [] }));
  assert.throws(() => validateRaceClick({ clicks: [{ ...valid.clicks[0], trusted: false }] }));
  assert.throws(() => validateRaceClick({ clicks: [...valid.clicks, { action: 'ready' }] }));
  await assert.rejects(runLobbyPrefetchRegression({ dist: 'relative', out: '/absolute/test', expectedBuildIndexHash: 'a'.repeat(64) }));
  await assert.rejects(runLobbyPrefetchRegression({ dist: '/absolute/dist', out: '/absolute/test', expectedBuildIndexHash: 'wrong' }));
  for (const timeoutMs of [30000, CLEANUP_RESERVE_MS, MIN_TIMEOUT_MS - 1]) {
    await assert.rejects(runLobbyPrefetchRegression({ dist: '/absolute/dist', out: '/absolute/test',
      expectedBuildIndexHash: 'a'.repeat(64), timeoutMs }), /90000 through 300000/);
  }
  // Reproduce the outer-deadline/late-producer ordering for every owned resource.
  for (const role of ['lock', 'preview', 'browser']) {
    const acquisitions = createAcquisitionOwner(), order = [];
    let finishAcquisition, retainedOwner = null, drained = false;
    const owner = { role };
    const pending = acquisitions.acquire(() => new Promise(resolve => { finishAcquisition = resolve; }), value => {
      retainedOwner = value; order.push('retained');
    });
    await assert.rejects(bounded(pending, 1, 'delayed_acquisition'), /delayed_acquisition/);
    const cleanup = acquisitions.drain().then(receipt => {
      assert.equal(retainedOwner, owner); order.push('resource_closed', 'lease_released'); drained = true;
      return receipt;
    });
    await Promise.resolve(); assert.equal(drained, false, 'Cleanup cannot outrun a pending producer');
    finishAcquisition(owner);
    assert.deepEqual(await cleanup, { admitted: 1, retained: 1, rejected: 0, drainedBeforeResourceCleanup: true });
    assert.deepEqual(order, ['retained', 'resource_closed', 'lease_released']);
    assert.throws(() => acquisitions.acquire(() => owner, () => {}), /admission is closed/);
  }
  console.log('lobby-prefetch-before-ready: CPU-only native-race, CLI and late-acquisition cleanup guards passed; no browser or room acquired');
}

function readNativeOutput() {
  const renderer = window.__DEBUG?.renderer;
  const gl = renderer?.getContext();
  const extension = gl?.getExtension('WEBGL_debug_renderer_info');
  const canvas = renderer?.domElement;
  const rect = canvas?.getBoundingClientRect();
  return { gpuUnmasked: !!extension, gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : null,
    contextLost: gl?.isContextLost() ?? null, frame: renderer?.info?.render?.frame ?? null,
    canvas: rect ? { width: canvas.width, height: canvas.height, cssWidth: rect.width, cssHeight: rect.height,
      visible: rect.width > 0 && rect.height > 0 && getComputedStyle(canvas).visibility !== 'hidden' } : null,
    focused: document.hasFocus(), hidden: document.hidden,
    version: document.querySelector('meta[name="application-version"]')?.content ?? null };
}

function validateNativeOutput(row) {
  assert.ok(row.gpuUnmasked && row.gpu && !/swiftshader|llvmpipe|softpipe|software|basic render|lavapipe/i.test(row.gpu),
    'An observed native hardware GPU is required');
  assert.equal(row.contextLost, false);
  assert.ok(row.canvas?.visible && row.canvas.width > 0 && row.canvas.height > 0 && row.frame > 0);
}

async function verifyScreenshot(output, capture, page) {
  const bytes = readFileSync(join(output, capture.filename));
  // Center world pixels exclude the top/bottom HUD and any room UI (guarded by
  // captureBattleScreenshot). This is nonblank-output evidence, not visual quality.
  // Decode the already-captured PNG in an unattached 2D canvas after entry. This
  // neither re-renders the game nor depends on an optional Node image package.
  const pixels = await page.evaluate(async encoded => {
    const raw = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
    const image = await createImageBitmap(new Blob([raw], { type: 'image/png' }));
    try {
      const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const data = context.getImageData(Math.floor(image.width * .3), Math.floor(image.height * .3),
        Math.floor(image.width * .4), Math.floor(image.height * .4)).data;
      const colors = new Set(); let low = 255, high = 0;
      for (let index = 0; index < data.length; index += 64) {
        colors.add(`${data[index] >> 4},${data[index + 1] >> 4},${data[index + 2] >> 4}`);
        const value = (data[index] + data[index + 1] + data[index + 2]) / 3;
        low = Math.min(low, value); high = Math.max(high, value);
      }
      return { width: image.width, height: image.height, centerColorBuckets: colors.size, centerLuminanceRange: high - low };
    } finally { image.close(); }
  }, bytes.toString('base64'));
  assert.ok(pixels.centerColorBuckets >= 16 && pixels.centerLuminanceRange >= 20,
    'The visible battlefield screenshot must contain nonblank world pixels');
  return { ...capture, sha256: sha256(bytes), bytes: bytes.length, ...pixels, nonblank: true };
}

export async function runLobbyPrefetchRegression({ dist, out, expectedBuildIndexHash, timeoutMs = 240_000, localSignaling = false }) {
  assert.ok(Number.isSafeInteger(timeoutMs) && timeoutMs >= MIN_TIMEOUT_MS && timeoutMs <= 300000,
    'Timeout must be an integer from 90000 through 300000 ms, including the cleanup reserve');
  assert.ok(isAbsolute(dist) && isAbsolute(out) && out !== resolve(out, '..'), 'Absolute build and new output directories required');
  assert.match(expectedBuildIndexHash ?? '', /^[a-f0-9]{64}$/, 'An approved index SHA256 is required');
  assert.equal(existsSync(out), false, 'Never overwrite prior evidence');
  const indexBytes = readFileSync(join(dist, 'index.html'));
  assert.equal(sha256(indexBytes), expectedBuildIndexHash, 'The exact approved build is required');
  const buildVersion = indexBytes.toString().match(/name="application-version" content="([^"]+)"/)?.[1];
  assert.ok(buildVersion, 'Build must identify its source version');
  const buildHash = () => treeHash(dist, file => /\.(?:html|js|css|json)$/.test(file));
  const report = { protocol: 'lobby-prefetch-before-ready-native-v1', ok: false, startedAt: new Date().toISOString(),
    buildIndexHash: expectedBuildIndexHash, buildVersion, runtimeBuildHash: buildHash(), acquisitionHash: acquisitionHash(),
    invocationRevision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    sourceIdentityNote: 'Served build is identified by embedded version plus index and complete runtime-file hashes; invocation checkout is not claimed as build provenance.',
    scenario: { canonicalMap: 'winter', garageClick: 'desert', realClients: 2, teamSize: 1,
      bothNotReadyRequired: true, viewport: [1280, 800], deviceScaleFactor: 1, cpuThrottle: 1,
      helperStateOverrides: false, backgroundScheduling: 'native', boundedBeforeReadyMs: 15000 },
    captureQueueTimeoutMs: CAPTURE_QUEUE_TIMEOUT_MS, scenarioTimeoutMs: timeoutMs,
    stages: [], errors: [], observers: [], captures: [] };
  mkdirSync(out, { recursive: true });
  const lock = createCaptureLock();
  const acquisitions = createAcquisitionOwner();
  const owners = { browser: null, pages: [], roomCreated: false };
  const started = performance.now();
  const health = observeBrowserHealth(() => performance.now() - started);
  let server, refresh, stage = 'validate_options', interrupted = false, lockHeld = false, scenarioStarted = null;
  const left = () => scenarioTimeRemaining(timeoutMs, scenarioStarted, performance.now());
  const run = async (next, action) => {
    stage = next; report.stages.push({ stage, atMs: performance.now() - started });
    console.log(`[lobby-prefetch] ${stage}`);
    if (interrupted) throw new Error('interrupted');
    return bounded(Promise.resolve().then(action), left(), stage);
  };
  const click = async (page, selector) => {
    await page.bringToFront(); await page.waitForSelector(selector, { visible: true, timeout: left() });
    await page.click(selector);
  };
  const select = async (page, control, value) => {
    await click(page, `${control} [data-select-trigger]`);
    await click(page, `${control} [role="option"][data-value="${value}"]`);
  };
  const interrupt = () => { interrupted = true; };
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  try {
    // Validate timeout/local mode before acquiring a browser or creating a room.
    productionUiOptions({ url: 'http://127.0.0.1', timeoutMs, localSignaling });
    // Normal FIFO admission has its own bounded queue deadline. No browser or
    // room exists yet, and another legitimate capture cannot consume our test
    // scenario budget. Retention/drain ownership still includes this producer.
    stage = 'capture_lock'; report.stages.push({ stage, atMs: performance.now() - started });
    console.log(`[lobby-prefetch] ${stage} (FIFO, up to 45 minutes; scenario clock not started)`);
    await acquisitions.acquire(() => lock.acquire(CAPTURE_QUEUE_TIMEOUT_MS), () => { lockHeld = true; });
    scenarioStarted = performance.now();
    report.captureQueueWaitMs = scenarioStarted - started;
    report.scenarioStartedAt = new Date().toISOString();
    refresh = setInterval(() => lock.refresh(), 30000); refresh.unref();
    await run('immutable_build_preview', () => acquisitions.acquire(() => preview({ root: ROOT, configFile: false, logLevel: 'error',
      plugins: [{ name: 'lobby-preview-owner', configurePreviewServer(instance) { server = instance; } }],
      build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0, strictPort: true } }),
    instance => { server = instance; }));
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    const options = productionUiOptions({ url: origin, timeoutMs, localSignaling, entryProfile: 'timings' });
    await run('native_browser', () => acquisitions.acquire(() => puppeteer.launch(nativeBrowserLaunchOptions({
      headless: true, timeout: Math.max(1, Math.min(30000, left() - 1000)), protocolTimeout: 15000,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--enable-webgl'] })),
    browser => { owners.browser = browser; }));
    report.browserLaunch = verifyNativeBrowserLaunch(owners.browser);
    report.browserVersion = await owners.browser.version(); health.watchBrowser(owners.browser);
    for (const role of ['host', 'guest']) await run(`${role}_pristine_garage`, async () => {
      const context = await owners.browser.createBrowserContext(), page = await context.newPage();
      owners.pages.push(page); health.watchPage(page, role);
      page.setDefaultTimeout(15000); page.setDefaultNavigationTimeout(60000);
      await page.setCacheEnabled(false); await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      await page.goto(`${origin}/?debug=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(readProductionGarageReadiness, { timeout: left() });
      const output = await page.evaluate(readNativeOutput); validateNativeOutput(output);
      assert.equal(output.version, buildVersion); report[`${role}GarageOutput`] = output;
    });
    const [host, guest] = owners.pages;
    await run('create_owned_room', async () => {
      await click(host, '.cot-battle-mode'); await click(host, '.cot-battle-choice[data-mode="private"]');
      await click(host, '.cot-battle');
      const endpoint = await host.$eval('.cot-play [data-field="signal"]', element => element.value);
      report.signalingTransport = validateProductionRoomEndpoint(endpoint, options);
      await select(host, '.cot-play [data-field="create-size"]', '1');
      owners.roomCreated = true; await click(host, '.cot-play [data-action="create"]');
      await host.waitForSelector('.cot-play .lobby.show .code', { visible: true, timeout: left() });
    });
    await run('guest_native_invite', async () => {
      const code = await host.$eval('.cot-play .lobby.show .code', element => element.textContent.trim());
      assert.match(code, /^[A-Z0-9]{6}$/);
      await guest.goto(`${origin}/?room=${code}&debug=1`, { waitUntil: 'domcontentloaded' });
      await Promise.all(owners.pages.map(page => page.waitForFunction(() =>
        document.querySelector('.cot-play .lobby.show .players')?.children.length === 2, { timeout: left() })));
      await Promise.all(owners.pages.map(page => page.evaluate(installLobbyObserver)));
    });
    await run('guest_browse_while_not_ready', async () => {
      await click(guest, '.cot-play.show .close');
      const desertVisible = await guest.$eval(DESERT, element => element.getClientRects().length > 0);
      if (!desertVisible) await click(guest, 'button[data-garage-panel="maps"]');
      await guest.waitForSelector(DESERT, { visible: true, timeout: left() });
      await select(host, '.cot-play [data-control="map"]', 'winter');
      await guest.bringToFront();
      await guest.waitForFunction(() => window.__WORLD_PREFETCH?.active === 'winter', { timeout: 10000, polling: 20 });
      await guest.click(DESERT);
      report.race = await guest.evaluate(readLobbyObserver);
      report.click = validateRaceClick(report.race);
    });
    await run('complete_canonical_winter_before_either_ready', async () => {
      await click(guest, '.cot-battle');
      await waitForCompletedRoomMap(owners.pages, { timeoutMs: 15000,
        isCancelled: () => interrupted,
        onEvidence: receipt => { report.waitingRoomMap = receipt; } });
      report.beforeReady = await Promise.all(owners.pages.map(page => page.evaluate(readLobbyObserver)));
      for (const receipt of report.beforeReady) {
        assert.equal(receipt.current.notReady, 2); assert.equal(receipt.current.players, 2);
        assert.equal(receipt.current.canonicalWinter && receipt.current.completedWinter && receipt.current.idle, true);
        assert.equal(receipt.clicks.filter(row => row.action === 'ready').length, 0);
        assert.equal(receipt.dropped, 0);
      }
      assert.equal(report.beforeReady[1].current.cancelled, report.click.before.cancelled,
        'A Garage map click must not cancel canonical room Winter preparation');
      assert.ok(report.beforeReady[1].changes.some(row => row.desertSelected), 'The native Garage selection must actually occur');
    });
    await run('native_ready_only_after_completed_winter', async () => {
      await click(guest, '.cot-play [data-action="ready"]'); await click(host, '.cot-play [data-action="ready"]');
      await host.waitForFunction(() => document.querySelector('.cot-play [data-action="start"]')?.disabled === false,
        { timeout: left() });
    });
    await run('native_start_cached_winter_and_countdown', () => observeProductionEntry(owners.pages, options, async () => {
      await click(host, '.cot-play [data-action="start"]');
      await Promise.all(owners.pages.map(page => page.waitForFunction(productionBattleLoaderHidden, { timeout: left() })));
    }, { readContext: readProductionRenderingContext,
      onEvidence: entry => { report.entry = entry; report.waitingRoomMap = recordCompletedRoomMapLaunch(report.waitingRoomMap, entry); },
      afterReveal: () => Promise.all(owners.pages.map(page => page.waitForFunction(() =>
        window.__DEBUG?.game?.phase === 'battle' && window.__DEBUG.game.preBattleS <= 0 &&
        document.querySelector('.cot-prebattle .n')?.textContent?.trim() === 'ROLL OUT!', { timeout: 15000, polling: 50 }))),
    }));
    assert.equal(report.waitingRoomMap.launchVerified, true, 'Both clients must consume completed Winter cache, not promote unfinished work');
    await run('verify_countdown_and_live_output', async () => {
      report.observers = await Promise.all(owners.pages.map(page => page.evaluate(readLobbyObserver)));
      for (const receipt of report.observers) {
        assert.equal(receipt.clicks.filter(row => row.action === 'ready' && row.trusted).length, 1);
        assert.equal(receipt.countdown[0]?.value, 5, 'The real countdown starts at five on both clients');
        assert.ok(receipt.rolloutAt - receipt.countdown[0].at >= 4500, 'The five-second countdown must not be skipped');
      }
      assert.deepEqual(report.entry.peers[0].observation.foregroundCountdown, [5, 4, 3, 2, 1],
        'The foreground host must visibly receive every countdown numeral');
      const before = await Promise.all(owners.pages.map(page => page.evaluate(readUiState)));
      for (const [index, page] of owners.pages.entries()) {
        await page.bringToFront();
        await page.waitForFunction(prior => window.__DEBUG?.network?.snapshotPacketsReceived > prior.snapshotPacketsReceived + 5 &&
          window.__DEBUG.network.inputPacketsSubmitted > prior.inputPacketsSubmitted + 5, { timeout: 10000 }, before[index]);
        const native = await page.evaluate(readNativeOutput); validateNativeOutput(native);
        assert.equal(native.focused && !native.hidden, true);
        const capture = await captureBattleScreenshot(page, out, index ? 'guest' : 'host');
        report.captures.push({ ...await verifyScreenshot(out, capture, page), native });
      }
      report.progress = validateUiProgress(before, await Promise.all(owners.pages.map(page => page.evaluate(readUiState))));
    });
  } catch (error) {
    report.errors.push({ stage, kind: browserOperationFailure(error), assertion: error?.code === 'ERR_ASSERTION'
      ? String(error.message).split('\n')[0] : null });
  } finally {
    report.acquisitions = await acquisitions.drain();
    report.health = health.stop();
    for (const [index, page] of owners.pages.entries()) {
      try { report.observers[index] = await bounded(page.evaluate(readLobbyObserver, true), 2000, 'observer_cleanup'); }
      catch { report.errors.push({ stage: 'observer_cleanup', role: index ? 'guest' : 'host' }); }
    }
    report.cleanup = await cleanupProductionUi(owners);
    if (server) {
      server.httpServer.closeAllConnections();
      try { await bounded(new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve())), 5000, 'preview_cleanup'); report.serverClosed = true; }
      catch { report.errors.push({ stage: 'preview_cleanup' }); }
    } else report.serverClosed = true;
    clearInterval(refresh); lock.release(); report.lockReleased = lockHeld;
    process.off('SIGINT', interrupt); process.off('SIGTERM', interrupt);
    report.identityUnchanged = report.runtimeBuildHash === buildHash() && report.acquisitionHash === acquisitionHash();
    report.endedAt = new Date().toISOString();
    report.scenarioDurationMs = scenarioStarted === null ? null : performance.now() - scenarioStarted;
    report.ok = !interrupted && report.errors.length === 0 && report.identityUnchanged && report.cleanup.roomCleanupVerified &&
      report.cleanup.browserClosed && report.serverClosed && report.lockReleased && !report.health.browserDisconnected &&
      report.health.peers.every(peer => !peer.rendererCrashCount && !peer.appExceptionCount && !peer.closed);
    writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length === 0) await runCpuSelftest();
  else if (args.includes('--help')) {
    console.log('node tools/lobby-prefetch-before-ready.browser.selftest.mjs --dist=/absolute/public-dist --out=/absolute/new-evidence --expected-build-index-hash=<sha256> [--timeout-ms=240000] [--local-signaling]');
  } else {
    const value = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
    const allowed = /^(?:--(?:dist|out|expected-build-index-hash|timeout-ms)=.+|--local-signaling)$/;
    assert.ok(args.every(arg => allowed.test(arg)), 'Unknown CLI argument');
    const report = await runLobbyPrefetchRegression({ dist: value('dist'), out: value('out'),
      expectedBuildIndexHash: value('expected-build-index-hash'), timeoutMs: Number(value('timeout-ms') ?? 240000),
      localSignaling: args.includes('--local-signaling') });
    console.log(JSON.stringify({ ok: report.ok, errors: report.errors, cleanup: report.cleanup, report: join(value('out'), 'report.json') }, null, 2));
    if (!report.ok) process.exitCode = 1;
  }
}
