import { pathToFileURL } from 'node:url';
import { isAbsolute, join, normalize, parse } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { installFeedbackPeerObserver, measureNativeFeedback } from './multiplayer-feedback-probe.mjs';
import { startMultiplayerCpuTimeline } from './multiplayer-cpu-timeline.mjs';

function validateAmmoSelection(ammoSlot, measurePerformance) {
  if (ammoSlot !== undefined && (!measurePerformance || !Number.isSafeInteger(ammoSlot) ||
      ammoSlot < 1 || ammoSlot > 3)) {
    throw new TypeError('ammo slot must be 1, 2, or 3 and requires --performance');
  }
}

function validateCpuTimeline(cpuTimeline, measurePerformance) {
  if (typeof cpuTimeline !== 'boolean' || (cpuTimeline && !measurePerformance)) {
    throw new TypeError('CPU timeline requires --performance');
  }
}

export function productionUiOptions({ url, timeoutMs = 300_000, screenshots, measurePerformance = false,
  ammoSlot, cpuTimeline = false } = {}) {
  let origin;
  try { origin = new URL(url); } catch (_) { throw new TypeError('an explicit frontend origin is required'); }
  if (!['https:', 'http:'].includes(origin.protocol) || origin.pathname !== '/' ||
      origin.username || origin.password || origin.search || origin.hash) {
    throw new TypeError('frontend must be a credential-free HTTP(S) origin without a path');
  }
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30_000 || timeoutMs > 300_000) {
    throw new TypeError('timeout must be an integer from 30000 through 300000 ms');
  }
  validateAmmoSelection(ammoSlot, measurePerformance);
  validateCpuTimeline(cpuTimeline, measurePerformance);
  if (screenshots !== undefined && (typeof screenshots !== 'string' || !isAbsolute(screenshots) ||
      screenshots.split(/[\\/]/).includes('..') || normalize(screenshots) === parse(screenshots).root ||
      !measurePerformance)) {
    throw new TypeError('screenshots require --performance and an absolute artifact subdirectory');
  }
  return { origin: origin.origin, timeoutMs,
    ...(cpuTimeline ? { cpuTimeline: true } : {}),
    ...(ammoSlot === undefined ? {} : { ammoSlot }),
    ...(screenshots === undefined ? {} : { screenshots: normalize(screenshots) }) };
}

/** Optional diagnosis has measurable overhead and is not a timing certification. */
export async function measureProductionFeedback(page, options, {
  startTimeline = startMultiplayerCpuTimeline, measure = measureNativeFeedback,
} = {}) {
  if (!options.cpuTimeline) return measure(page, 20_000, options.ammoSlot);
  const timeline = await startTimeline(page);
  let sample;
  let cpu;
  try { sample = await measure(page, 20_000, options.ammoSlot); }
  finally { cpu = await timeline.stop(); }
  const offset = sample.sampleStartedAtMs - cpu.baselinePageTimeMs;
  return { ...sample, cpuTimeline: { ...cpu,
    sampleStartOffsetMs: Number.isFinite(offset) ? offset : null,
    diagnosticOverhead: true } };
}

function failure(stage) {
  return Object.assign(new Error('production private-room UI smoke failed'), {
    code: 'production_private_room_ui_failed', stage,
  });
}

function bounded(promise, milliseconds, stage) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(failure(stage)), Math.max(1, milliseconds));
  })]).finally(() => clearTimeout(timer));
}

/** Read-only projection: never export player IDs, invitation codes, storage, or signaling secrets. */
export function readUiState() {
  const shown = (selector) => {
    const element = document.querySelector(selector);
    return !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  };
  const network = window.__DEBUG?.network;
  return { phase: window.__DEBUG?.game?.phase || null, ready: window.__GAME_READY === true,
    garageVisible: shown('.cot-battle'), lobbyVisible: shown('.cot-play .lobby.show'),
    lobbyPlayers: document.querySelector('.cot-play .lobby.show .players')?.children.length || 0,
    failureVisible: shown('.cot-play .room-failure:not([hidden])'),
    loadingVisible: shown('.cot-bl.on'), connected: network?.connected === true,
    snapshotPacketsReceived: Number(network?.snapshotPacketsReceived) || 0,
    inputPacketsSubmitted: Number(network?.inputPacketsSubmitted) || 0,
    hasRoomUrl: new URL(location.href).searchParams.has('room') };
}

/** Fail closed rather than photograph an invitation, settings, login, or stale lobby. */
export function battleScreenshotAllowed() {
  const shown = (selector) => Array.from(document.querySelectorAll(selector)).some((element) =>
    element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden');
  const game = window.__DEBUG?.game;
  if (game?.phase !== 'battle' || game.result || !window.__DEBUG?.network?.connected ||
      document.hidden || !document.hasFocus() ||
      (window.__COT_FEEDBACK_SAMPLE && !window.__COT_FEEDBACK_SAMPLE.disposed)) return false;
  if (shown('.cot-play.show, .cot-bl.on, .cot-settings.open, dialog[open], input[type="password"], .cot-room-chat.open')) {
    return false;
  }
  const visibleText = document.body.innerText.toUpperCase();
  const code = new URL(location.href).searchParams.get('room')?.toUpperCase();
  if (code && visibleText.includes(code)) return false;
  const ids = [game.player?.id, ...(game.tanks || []).slice(0, 32).map((tank) => tank.id)];
  return !ids.some((id) => typeof id === 'string' && id.length >= 8 && visibleText.includes(id.toUpperCase()));
}

/** Two fixed filenames, viewport only, exclusive writes; never overwrite prior evidence. */
export async function captureBattleScreenshot(page, directory, role, io = { mkdir, writeFile }) {
  if (!['host', 'guest'].includes(role)) throw failure('screenshot_role');
  if (!await page.evaluate(battleScreenshotAllowed)) throw failure('screenshot_battle_guard');
  const bytes = await bounded(page.screenshot({ type: 'png', fullPage: false,
    captureBeyondViewport: false }), 5000, 'screenshot_capture');
  // A terminal/menu transition during capture must not persist sensitive pixels.
  if (!await page.evaluate(battleScreenshotAllowed)) throw failure('screenshot_battle_guard');
  const filename = `${role}-battle.png`;
  await io.mkdir(directory, { recursive: true });
  await io.writeFile(join(directory, filename), bytes, { flag: 'wx' });
  return { role, filename, capturedAfterSample: true, viewportOnly: true };
}

export function validateUiProgress(before, after) {
  if (before.length !== 2 || after.length !== 2) throw failure('battle_progress');
  return after.map((state, index) => {
    const prior = before[index];
    if (state.phase !== 'battle' || !state.connected || state.loadingVisible ||
        state.snapshotPacketsReceived <= prior.snapshotPacketsReceived ||
        state.inputPacketsSubmitted <= prior.inputPacketsSubmitted) throw failure('battle_progress');
    return { role: index ? 'guest' : 'host', phase: 'battle', connected: true,
      snapshotIncrease: state.snapshotPacketsReceived - prior.snapshotPacketsReceived,
      inputIncrease: state.inputPacketsSubmitted - prior.inputPacketsSubmitted };
  });
}

async function visible(page, selector) {
  return page.$eval(selector, (element) => element.getClientRects().length > 0)
    .catch(() => false);
}

async function nativeClick(page, selector, timeoutMs) {
  await page.bringToFront();
  await page.waitForSelector(selector, { visible: true, timeout: timeoutMs });
  await page.click(selector);
}

async function openPrivateMenu(page, timeoutMs) {
  await nativeClick(page, '.cot-battle-mode', timeoutMs);
  await nativeClick(page, '.cot-battle-choice[data-mode="private"]', timeoutMs);
  await nativeClick(page, '.cot-battle', timeoutMs);
  await page.waitForSelector('.cot-play.show [data-action="create"]', { visible: true, timeout: timeoutMs });
}

async function selectMenuOption(page, control, value, timeoutMs) {
  await nativeClick(page, `${control} [data-select-trigger]`, timeoutMs);
  await nativeClick(page, `${control} [role="option"][data-value="${value}"]`, timeoutMs);
}

async function nativeLeaveBattle(page, timeoutMs) {
  await page.bringToFront();
  await page.keyboard.press('Escape');
  if (!await visible(page, '.cot-settings.open .leave')) {
    // The first Escape can belong to native pointer-lock release.
    await page.keyboard.press('Escape');
  }
  await nativeClick(page, '.cot-settings.open .leave', timeoutMs);
  await page.waitForFunction(() => window.__DEBUG?.game?.phase === 'garage', { timeout: timeoutMs });
}

async function closeOwnedRoom(page, timeoutMs) {
  if (!page || page.isClosed()) return false;
  const state = await page.evaluate(readUiState);
  if (state.phase === 'battle') await nativeLeaveBattle(page, timeoutMs);
  if (await visible(page, '.cot-play.show [data-action="leave"]')) {
    await nativeClick(page, '.cot-play.show [data-action="leave"]', timeoutMs);
  } else if ((await page.evaluate(readUiState)).hasRoomUrl) {
    // Retained room membership is reopened through the same native garage control.
    await nativeClick(page, '.cot-battle', timeoutMs);
    if (await visible(page, '.cot-play.show [data-action="leave"]')) {
      await nativeClick(page, '.cot-play.show [data-action="leave"]', timeoutMs);
    }
  }
  return !(await page.evaluate(readUiState)).hasRoomUrl;
}

export async function cleanupProductionUi({ browser, pages, roomCreated }, timeoutMs = 10_000) {
  const roomCleanup = [];
  if (roomCreated) {
    // Host first: its explicit native Leave closes this exact room for both players.
    for (const page of pages) {
      roomCleanup.push(await bounded(closeOwnedRoom(page, 3_000), timeoutMs, 'room_cleanup').catch(() => false));
    }
  }
  let browserClosed = !browser;
  if (browser) {
    try { await bounded(browser.close(), 5_000, 'browser_cleanup'); browserClosed = true; }
    catch (_) { browser.process()?.kill('SIGKILL'); }
  }
  return { roomCleanupVerified: !roomCreated || roomCleanup.every(Boolean), browserClosed };
}

async function freshPage(browser, origin, timeoutMs, owners, onPageError, measurePerformance) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  owners.pages.push(page);
  page.on('pageerror', onPageError);
  await page.setCacheEnabled(false);
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  page.setDefaultTimeout(Math.min(15_000, timeoutMs));
  page.setDefaultNavigationTimeout(Math.min(60_000, timeoutMs));
  if (measurePerformance) await page.evaluateOnNewDocument(installFeedbackPeerObserver);
  await page.goto(`${origin}/${measurePerformance ? '?debug=1' : ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.cot-battle-mode', { visible: true, timeout: Math.min(90_000, timeoutMs) });
  if (new URL(page.url()).origin !== origin) throw failure('frontend_origin');
  return page;
}

/** Native deployed controls only; never override endpoints, import /src, or change game state. */
export async function verifyProductionPrivateRoomUi({ url, timeoutMs = 300_000,
  launchBrowser = null, onStage = () => {}, measurePerformance = false, screenshots, ammoSlot,
  cpuTimeline = false } = {}) {
  const options = productionUiOptions({ url, timeoutMs, screenshots, measurePerformance, ammoSlot, cpuTimeline });
  const started = performance.now();
  const owners = { browser: null, pages: [], roomCreated: false };
  let stage = 'browser_launch';
  let problem;
  let result;
  let pageErrors = 0;
  const left = () => Math.max(1, timeoutMs - 27_000 - (performance.now() - started));
  const run = (next, action) => {
    stage = next;
    onStage(next);
    return bounded(Promise.resolve().then(action), left(), next);
  };
  try {
    const launch = launchBrowser || (async () => {
      const { default: puppeteer } = await import('puppeteer');
      return puppeteer.launch({ headless: true, timeout: Math.min(30_000, timeoutMs),
        protocolTimeout: 60_000, args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--enable-webgl'] });
    });
    owners.browser = await launch();
    for (const role of ['host', 'guest']) {
      await run(`${role}_garage`, () => freshPage(owners.browser, options.origin, left(), owners,
        () => { pageErrors++; }, measurePerformance));
    }
    const [host, guest] = owners.pages;
    await run('private_controls', () => openPrivateMenu(host, left()));
    const modes = await host.$$eval('.cot-play [data-mode]', (elements) => elements.map((el) => el.dataset.mode));
    if (modes.join(',') !== 'solo,private,lan') throw failure('private_controls');
    // Read the built-in endpoint only. There is deliberately no endpoint override option.
    const endpoint = await host.$eval('.cot-play [data-field="signal"]', (el) => el.value);
    const signaling = new URL(endpoint);
    if (signaling.protocol !== 'wss:' || signaling.pathname !== '/rooms') throw failure('default_endpoint');
    await run('create_1v1_room', async () => {
      await selectMenuOption(host, '.cot-play [data-field="create-size"]', '1', left());
      owners.roomCreated = true;
      await nativeClick(host, '.cot-play [data-action="create"]', left());
      await host.waitForSelector('.cot-play .lobby.show .code', { visible: true, timeout: left() });
    });
    const code = await host.$eval('.cot-play .lobby.show .code', (el) => el.textContent.trim());
    if (!/^[A-Z0-9]{6}$/.test(code)) throw failure('room_code');
    const invite = new URL('/', options.origin);
    invite.searchParams.set('room', code);
    if (measurePerformance) invite.searchParams.set('debug', '1');
    await run('guest_native_invite', async () => {
      await guest.goto(invite.href, { waitUntil: 'domcontentloaded' });
      await guest.waitForFunction(() => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2,
        { timeout: left() });
      await host.waitForFunction(() => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2,
        { timeout: left() });
    });
    await run('ready_and_launch', async () => {
      await selectMenuOption(host, '.cot-play [data-control="map"]', 'winter', left());
      await nativeClick(guest, '.cot-play [data-action="ready"]', left());
      await nativeClick(host, '.cot-play [data-action="ready"]', left());
      await host.waitForFunction(() => document.querySelector('.cot-play [data-action="start"]')?.disabled === false,
        { timeout: left() });
      await nativeClick(host, '.cot-play [data-action="start"]', left());
    });
    await run('both_live_battles', () => Promise.all(owners.pages.map((page) => page.waitForFunction(() =>
      window.__DEBUG?.game?.phase === 'battle' && window.__DEBUG?.network?.connected === true &&
      !document.querySelector('.cot-bl.on'), { timeout: left() }))));
    const before = await Promise.all(owners.pages.map((page) => page.evaluate(readUiState)));
    await run('battle_progress', () => Promise.all(owners.pages.map((page, index) => page.waitForFunction((prior) =>
      window.__DEBUG.network.snapshotPacketsReceived > prior.snapshotPacketsReceived + 5 &&
      window.__DEBUG.network.inputPacketsSubmitted > prior.inputPacketsSubmitted + 5,
    { timeout: Math.min(10_000, left()) }, before[index]))));
    const after = await Promise.all(owners.pages.map((page) => page.evaluate(readUiState)));
    const peers = validateUiProgress(before, after);
    const performanceReceipt = measurePerformance ? await run('native_feedback_performance', async () => {
      const samples = [];
      const captures = [];
      for (const [index, page] of owners.pages.entries()) {
        const role = index ? 'guest' : 'host';
        samples.push({ role, ...await measureProductionFeedback(page, options) });
        if (options.screenshots) captures.push(await captureBattleScreenshot(page, options.screenshots, role));
      }
      return { scenario: 'native-private-1v1-winter', sampleMsPerRole: 20_000,
        ammoSlot: options.ammoSlot ?? 1,
        viewport: [1280, 800], deviceScaleFactor: 1, cpuThrottle: 1,
        twoRenderedContextsSameMachine: true, foregroundRolesMeasuredSequentially: true,
        externalGpuContention: 'not-detected-or-controlled-by-this-probe',
        latencyMeaning: 'application-input-edge-to-confirmed-effect-and-next-rAF-callback-not-click-to-photon',
        samples, ...(options.screenshots ? { screenshots: captures } : {}) };
    }) : null;
    await run('native_exit_and_room_close', async () => {
      await nativeLeaveBattle(host, left());
      await closeOwnedRoom(host, left());
      await guest.waitForFunction(() => window.__DEBUG?.game?.phase === 'garage' &&
        !window.__DEBUG?.network && !new URL(location.href).searchParams.has('room'), { timeout: left() });
    });
    if (pageErrors) throw failure('page_errors');
    result = { ok: true, freshBrowserContexts: 2, nativePrivate1v1: true, defaultRoomEndpoint: true,
      nativeInviteJoined: true, nativeReadyAndLaunch: true, peers, nativeExitAndRoomClose: true, pageErrors };
    if (performanceReceipt) result.performance = performanceReceipt;
  } catch (_) {
    problem = failure(stage);
    problem.lastStates = await Promise.all(owners.pages.map((page) =>
      bounded(page.evaluate(readUiState), 1_000, 'last_state').catch(() => null)));
  }
  const cleanup = await cleanupProductionUi(owners);
  if (problem) throw Object.assign(problem, { cleanup });
  if (!cleanup.browserClosed || !cleanup.roomCleanupVerified) throw Object.assign(failure('cleanup'), { cleanup });
  return { ...result, cleanup };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  try {
    const ammoSlot = option('ammo-slot');
    if ((ammoSlot !== undefined || process.argv.includes('--ammo-slot')) && !/^[123]$/.test(ammoSlot || '')) {
      throw new TypeError('ammo slot must be 1, 2, or 3');
    }
    const result = await verifyProductionPrivateRoomUi({ url: option('url'),
      measurePerformance: process.argv.includes('--performance'),
      cpuTimeline: process.argv.includes('--cpu-timeline'),
      ammoSlot: ammoSlot === undefined ? undefined : Number(ammoSlot),
      screenshots: option('screenshots'),
      timeoutMs: option('timeout-ms') === undefined ? 300_000 : Number(option('timeout-ms')),
      onStage: (stage) => console.log(`[production-ui] ${stage}`) });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, code: 'production_private_room_ui_failed',
      stage: error?.stage || 'configuration', lastStates: error?.lastStates || null, cleanup: error?.cleanup || null }, null, 2));
    process.exitCode = 1;
  }
}
