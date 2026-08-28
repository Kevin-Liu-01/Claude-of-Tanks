import assert from 'node:assert/strict';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createSignalingServer } from '../server/signalingServer.js';

function numberOption(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : fallback;
  if (!Number.isFinite(value) || value <= 0) throw new TypeError(`${name} must be positive`);
  return value;
}

function nonNegativeOption(name, fallback = 0) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : fallback;
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be non-negative`);
  return value;
}

function stringOption(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}

const seconds = numberOption('seconds', 6);
const cpuRate = numberOption('cpu', 4);
const minimumFps = numberOption('min-fps', 30);
const cycles = numberOption('cycles', 1);
const maxColdReadyMs = numberOption('max-cold-ready', 15_000);
if (!Number.isInteger(cycles) || cycles > 10) {
  throw new TypeError('cycles must be an integer from 1 through 10');
}
const adverse = {
  latency: nonNegativeOption('latency'),
  jitter: nonNegativeOption('jitter'),
  loss: nonNegativeOption('loss'),
  inputLoss: nonNegativeOption('input-loss'),
};
const adverseEnabled = Object.values(adverse).some((value) => value > 0);
const roomMode = stringOption('room-mode', 'lan');
if (!['lan', 'private'].includes(roomMode)) {
  throw new TypeError('room-mode must be lan or private');
}
const only = stringOption('only', 'all');
if (!['all', 'solo', 'host', 'client'].includes(only)) {
  throw new TypeError('only must be all, solo, host, or client');
}
const enforceBudgets = stringOption('enforce', '1') !== '0';
const root = new URL('..', import.meta.url).pathname;
const consoleErrors = [];
const contextByPage = new WeakMap();
const coldReadyMsByPage = new WeakMap();
let browser = null;

const vite = await createViteServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
});
const signaling = createSignalingServer({ host: '127.0.0.1', port: 0 });

function observe(page, label) {
  page.on('pageerror', (error) => consoleErrors.push(`${label}: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`${label}: ${message.text()}`);
  });
}

async function openPage(origin, { full = false, label, adverseNetwork = false }) {
  // Model two people opening an invite on machines that have never visited
  // the game. A shared default context silently shares HTTP cache, storage,
  // workers, and other state between the host and guest pages.
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  contextByPage.set(page, context);
  observe(page, label);
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  if (full) {
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
        configurable: true,
        get: () => 4,
      });
      Object.defineProperty(Navigator.prototype, 'deviceMemory', {
        configurable: true,
        get: () => 4,
      });
    });
    const cdp = await page.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  }
  const params = new URLSearchParams();
  if (full) {
    params.set('nosplash', '1');
    params.set('tier', 'desktop');
    params.set('gfxreset', '1');
  }
  if (adverseNetwork && adverseEnabled) {
    params.set('netSim', '1');
    params.set('netLatency', String(adverse.latency));
    params.set('netJitter', String(adverse.jitter));
    params.set('netLoss', String(adverse.loss));
    params.set('netInputLoss', String(adverse.inputLoss));
  }
  const pathname = full ? '/' : '/tools/multiplayer-browser-soak.html';
  const path = `${pathname}?${params}`;
  const navigationStartedAt = Date.now();
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  if (full) {
    await page.waitForFunction(
      () => window.__GAME_READY === true && window.__DEV_TRACE?.enabled === true,
      { timeout: 240_000 },
    );
    coldReadyMsByPage.set(page, Date.now() - navigationStartedAt);
  }
  return page;
}

async function closeState(page) {
  if (!page) return;
  if (!page.isClosed()) {
    await page.evaluate(() => {
      const state = globalThis.__COT_RENDER_PERF;
      if (!state) return;
      if (state.pumpTimer) clearInterval(state.pumpTimer);
      if (state.readyTimer) clearInterval(state.readyTimer);
      try { state.match?.close('render_perf_complete'); } catch (_) { /* best effort */ }
      try { state.session?.close('render_perf_complete'); } catch (_) { /* best effort */ }
    }).catch(() => {});
    await page.close().catch(() => {});
  }
  const context = contextByPage.get(page);
  contextByPage.delete(page);
  if (context) await context.close().catch(() => {});
}

async function createStartingRoom(hostPage, guestPage, signalUrl) {
  const room = await hostPage.evaluate(async ({ url, roomMode: mode }) => {
    const [{ RoomSignalingClient }, { PrivateRoomHostSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.ts'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.createRoom({
      player: { id: 'render-host', name: 'Commander' },
      mode,
      maxPlayers: 14,
    });
    const state = globalThis.__COT_RENDER_PERF = {
      signaling: signalingClient,
      roomInfo,
      lastLobby: null,
      startingLobby: null,
      errors: [],
    };
    state.session = new PrivateRoomHostSession({
      signaling: signalingClient,
      roomInfo,
      hostName: 'Commander',
      hostSpecId: 'm1a2',
      mapId: 'winter',
      teamSize: 2,
      onStart: (lobby) => { state.startingLobby = lobby; },
      onError: (error) => state.errors.push(error.message),
    });
    state.unsubscribe = state.session.runtime.onState((lobby) => { state.lastLobby = lobby; });
    return roomInfo;
  }, { url: signalUrl, roomMode });

  await guestPage.evaluate(async ({ url, roomCode }) => {
    const [{ RoomSignalingClient }, { PrivateRoomClientSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.ts'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.joinRoom({
      roomCode,
      player: { id: 'render-guest', name: 'Commander' },
    });
    const state = globalThis.__COT_RENDER_PERF = {
      signaling: signalingClient,
      roomInfo,
      lastLobby: null,
      errors: [],
    };
    state.session = new PrivateRoomClientSession({
      signaling: signalingClient,
      roomInfo,
      onError: (error) => state.errors.push(error.message),
    });
    state.runtime = await state.session.ready;
    state.unsubscribe = state.runtime.onState((lobby) => { state.lastLobby = lobby; });
    state.session.submit({ type: 'select_vehicle', specId: 'm1a2' });
  }, { url: signalUrl, roomCode: room.roomCode });

  await hostPage.waitForFunction(
    () => globalThis.__COT_RENDER_PERF?.session?.runtime?.peers?.size === 1,
    { timeout: 15_000 },
  );
  await guestPage.waitForFunction(
    () => globalThis.__COT_RENDER_PERF?.lastLobby?.players?.length === 2,
    { timeout: 15_000 },
  );
  const lobby = await guestPage.evaluate(() => globalThis.__COT_RENDER_PERF.lastLobby);
  assert.equal(lobby.teamSize, 2);
  assert.equal(new Set(lobby.players.map((player) =>
    player.name.toLocaleLowerCase('en-US'))).size, 2,
  'full-render room must retain canonical unique names');

  await Promise.all([
    hostPage.evaluate(() => globalThis.__COT_RENDER_PERF.session.command({
      type: 'set_ready', ready: true,
    })),
    guestPage.evaluate(() => globalThis.__COT_RENDER_PERF.session.submit({
      type: 'set_ready', ready: true,
    })),
  ]);
  await hostPage.waitForFunction(
    () => globalThis.__COT_RENDER_PERF.lastLobby.players.every((player) => player.ready),
    { timeout: 10_000 },
  );
  await hostPage.evaluate(() => globalThis.__COT_RENDER_PERF.session.command({
    type: 'start', matchSeed: 0xC07CAFE,
  }));
  await Promise.all([
    hostPage.waitForFunction(
      () => globalThis.__COT_RENDER_PERF.startingLobby?.phase === 'starting',
      { timeout: 10_000 },
    ),
    guestPage.waitForFunction(
      () => globalThis.__COT_RENDER_PERF.lastLobby?.phase === 'starting',
      { timeout: 10_000 },
    ),
  ]);
}

async function collectFullRenderer(page, label) {
  await page.bringToFront();
  await page.waitForFunction(
    () => (window.__DEBUG.game.phase === 'battle' && window.__DEBUG.game.preBattleS <= 0) ||
      globalThis.__COT_RENDER_PERF?.entryResult === false,
    { timeout: 240_000, polling: 50 },
  );
  const entryState = await page.evaluate(() => ({
    result: globalThis.__COT_RENDER_PERF?.entryResult ?? true,
    failure: globalThis.__NETWORK_ENTRY_FAILURE || null,
    transition: globalThis.__COT_RENDER_PERF?.entryTransition || null,
    transitionFrames: globalThis.__COT_RENDER_PERF?.entryFrames || [],
    blackCheck: globalThis.__NETWORK_LOAD?.blackCheck || null,
  }));
  assert.notEqual(entryState.result, false,
    `${label} failed during network battle entry: ${JSON.stringify(entryState.failure)}`);
  if (label !== 'solo') {
    assert.equal(entryState.transition?.loaderVisible, true,
      `${label} must synchronously cover the garage before its first await`);
    assert.ok(entryState.transitionFrames.length > 0,
      `${label} must observe rendered entry frames`);
    assert.equal(entryState.transitionFrames.some((frame) =>
      !frame.loaderVisible && frame.phase !== 'battle'), false,
    `${label} exposed the garage/blank page during network handoff`);
    assert.ok(entryState.blackCheck && !entryState.blackCheck.error,
      `${label} must run the real-scene black watchdog before reveal`);
    assert.equal(entryState.transition?.result, null,
      `${label} must clear a prior match result synchronously at handoff`);
  }
  await page.evaluate((mode) => {
    const state = globalThis.__COT_RENDER_PERF = globalThis.__COT_RENDER_PERF || {};
    state.syncCalls = 0;
    for (const entity of window.__DEBUG.game.tanks) {
      const visual = entity.visual;
      if (!visual || visual.__renderPerfSyncWrapped) continue;
      const original = visual.syncFromState.bind(visual);
      visual.syncFromState = (...args) => {
        state.syncCalls++;
        return original(...args);
      };
      visual.__renderPerfSyncWrapped = true;
    }
    window.__DEV_TRACE.clear();
    window.__DEV_TRACE.mark('render-perf:start', { mode });
    window.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyW', key: 'w', bubbles: true,
    }));
  }, label);
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  const report = await page.evaluate((mode) => {
    window.dispatchEvent(new KeyboardEvent('keyup', {
      code: 'KeyW', key: 'w', bubbles: true,
    }));
    const trace = window.__DEV_TRACE.stats();
    return {
      mode,
      ...trace,
      renderer: {
        calls: window.__DEBUG.renderer.info.render.calls,
        triangles: window.__DEBUG.renderer.info.render.triangles,
      },
      rosterSize: window.__DEBUG.frameInfo.rosterTanks?.length ||
        window.__DEBUG.game.tanks.length,
      network: window.__DEBUG.network,
      presentation: window.__DEBUG.networkPresentation,
      syncCalls: globalThis.__COT_RENDER_PERF?.syncCalls || 0,
      entry: {
        transition: globalThis.__COT_RENDER_PERF?.entryTransition || null,
        transitionFrames: globalThis.__COT_RENDER_PERF?.entryFrames?.length || 0,
        blackCheck: globalThis.__NETWORK_LOAD?.blackCheck || null,
      },
    };
  }, label);
  report.entry.coldReadyMs = coldReadyMsByPage.get(page) ?? null;
  if (!enforceBudgets) return report;
  assert.ok(report.entry.coldReadyMs != null && report.entry.coldReadyMs < maxColdReadyMs,
    `${label} cold profile took ${report.entry.coldReadyMs} ms to become ready`);
  assert.ok(report.frames >= seconds * minimumFps,
    `${label} captured too few active frames: ${report.frames}`);
  assert.equal(report.freezes, 0, `${label} must not freeze under ${cpuRate}x CPU throttling`);
  assert.ok(report.gapP95 < 40,
    `${label} p95 frame gap ${report.gapP95} ms fell below a stable 30 fps floor`);
  assert.ok(report.syncCalls <= report.frames * report.rosterSize * 1.15 + report.rosterSize * 4,
    `${label} duplicated tank visual work: ${report.syncCalls} syncs / ${report.frames} frames`);
  if (label !== 'solo') {
    const prediction = report.network?.prediction;
    const predictionDiagnostic = JSON.stringify({
      prediction,
      inputAckLag: report.network?.inputAckLag,
      transport: report.network?.transport,
    });
    assert.equal(prediction?.hardSnaps, 0,
      `${label} hard-snapped during visible network play`);
    assert.ok((prediction?.maxFreePositionErrorM ?? Infinity) < 2,
      `${label} free predictor diverged ${prediction?.maxFreePositionErrorM} m: ${predictionDiagnostic}`);
    assert.ok((prediction?.maxContactPositionErrorM ?? Infinity) < 7,
      `${label} contact recovery diverged ${prediction?.maxContactPositionErrorM} m: ${predictionDiagnostic}`);
    assert.ok((prediction?.lastPositionErrorM ?? Infinity) < 1,
      `${label} retained ${prediction?.lastPositionErrorM} m of rubberband error`);
    assert.ok((prediction?.maxCorrectionStepM ?? Infinity) < 0.25,
      `${label} released a visible one-frame correction step ` +
      `${prediction?.maxCorrectionStepM} m: ${predictionDiagnostic}`);
    assert.ok((prediction?.maxVerticalCorrectionStepM ?? Infinity) < 0.15,
      `${label} released a visible terrain-height correction step ` +
      `${prediction?.maxVerticalCorrectionStepM} m: ${predictionDiagnostic}`);
    assert.equal(prediction?.droppedHistory, 0,
      `${label} dropped prediction history under the tested network profile`);
    await page.evaluate((expectedResult) => {
      const tanks = window.__DEBUG.game.tanks;
      const ownTeam = window.__DEBUG.game.player.networkTeam;
      const resultTeam = expectedResult === 'victory'
        ? ownTeam
        : tanks.find((entity) => entity.networkTeam !== ownTeam)?.networkTeam;
      const events = Array.from({ length: 7 }, (_, index) => ({
        type: 'tank_destroyed',
        id: tanks[index % tanks.length].id,
        killerId: window.__DEBUG.game.player.id,
        cause: index % 2 ? 'shot' : 'ammo_rack',
      }));
      events.push({ type: 'match_ended', result: resultTeam });
      window.__DEV_TRACE.clear();
      window.__DEV_TRACE.mark('render-perf:destruction-burst', { expectedResult });
      if (!window.__DEBUG.injectNetworkEvents(events)) {
        throw new Error('network event injection seam was unavailable');
      }
      if (window.__DEBUG.game.result !== null) {
        throw new Error('persistent result bypassed queued destruction chronology');
      }
    }, label.endsWith('-client') ? 'defeat' : 'victory');
    await page.waitForFunction(
      (expected) => window.__DEBUG.game.result === expected,
      { timeout: 15_000, polling: 16 },
      label.endsWith('-client') ? 'defeat' : 'victory',
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    report.destructionBurst = await page.evaluate(() => ({
      ...window.__DEV_TRACE.stats(),
      result: window.__DEBUG.game.result,
      presentation: window.__DEBUG.networkPresentation,
    }));
    assert.equal(report.destructionBurst.freezes, 0,
      `${label} destruction/result burst must not freeze`);
    assert.ok(report.destructionBurst.maxGapMs < 200,
      `${label} destruction/result burst stalled ${report.destructionBurst.maxGapMs} ms`);
    assert.equal(report.destructionBurst.presentation?.pending, 0,
      `${label} must drain every reliable presentation event`);
    assert.ok(report.destructionBurst.presentation?.peakPending >= 8,
      `${label} did not exercise the destruction admission queue`);
  }
  return report;
}

async function runSolo(origin) {
  const page = await openPage(origin, { full: true, label: 'solo-render' });
  try {
    await page.evaluate(() => {
      window.__COT_RENDER_ENTRY = window.__DEBUG
        .beginSoloBattle({ specId: 'm1a2', mapId: 'winter' })
        .catch((error) => { window.__COT_RENDER_ENTRY_ERROR = error.message; });
      return true;
    });
    return await collectFullRenderer(page, 'solo');
  } finally {
    await closeState(page);
  }
}

async function runNetwork(origin, signalUrl, renderedRole) {
  const hostPage = await openPage(origin, {
    full: renderedRole === 'host',
    label: `${renderedRole}-host-page`,
  });
  const guestPage = await openPage(origin, {
    full: renderedRole === 'client',
    label: `${renderedRole}-guest-page`,
    adverseNetwork: true,
  });
  try {
    await createStartingRoom(hostPage, guestPage, signalUrl);
    if (renderedRole === 'host') {
      await guestPage.evaluate(() => {
        const state = globalThis.__COT_RENDER_PERF;
        state.handoff = (async () => {
          const { beginPrivateClientMatch } = await import('/src/net/privateMatchHandoff.ts');
          state.match = await beginPrivateClientMatch({
            session: state.session,
            playerId: state.roomInfo.peerId,
            lobbyState: state.lastLobby,
          });
          state.matchControlTypes = [];
          state.stopMatchControlTrace = state.match.client.transport.onMessage((message) => {
            if (message?.type !== 'snapshot') state.matchControlTypes.push({
              type: message?.type || null,
              seq: message?.seq ?? null,
              connected: !!state.match?.client?.connected,
            });
          });
          if (!state.match.client.connected) {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                unsubscribe();
                reject(new Error('guest match handshake timed out'));
              }, 60_000);
              const unsubscribe = state.match.client.onConnection((connected) => {
                if (!connected) return;
                clearTimeout(timeout);
                unsubscribe();
                resolve();
              });
            });
          }
          state.match.ready();
          state.readyTimer = setInterval(() => {
            if (!state.match?.client?.closed && !state.match?.host?.matchStarted) state.match.ready();
          }, 1000);
          state.pumpTimer = setInterval(() => state.match.update(performance.now()), 16);
        })().catch((error) => { state.errors.push(error.message); });
        return true;
      });
      await hostPage.evaluate(() => {
        const state = globalThis.__COT_RENDER_PERF;
        state.entryFrames = [];
        window.__DEBUG.game.result = 'victory';
        const sample = () => {
          const loaderVisible = !!document.querySelector('.cot-bl.on');
          const phase = window.__DEBUG.game.phase;
          state.entryFrames.push({ loaderVisible, phase });
          if (phase !== 'battle' && state.entryFrames.length < 1200) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        state.entry = window.__DEBUG.beginNetworkBattle({
          role: 'host',
          session: state.session,
          lobbyState: state.startingLobby,
        }).then((result) => { state.entryResult = result; })
          .catch((error) => { state.errors.push(error.message); state.entryResult = false; });
        state.entryTransition = {
          loaderVisible: !!document.querySelector('.cot-bl.on'),
          phase: window.__DEBUG.game.phase,
          result: window.__DEBUG.game.result,
        };
        return true;
      });
      try {
        return await collectFullRenderer(hostPage, `${roomMode}-host`);
      } catch (error) {
        const guestDiagnostics = await guestPage.evaluate(() => {
          const match = globalThis.__COT_RENDER_PERF?.match;
          const client = match?.client;
          return {
            errors: globalThis.__COT_RENDER_PERF?.errors || [],
            clientErrors: client?.errors || [],
            controlTypes: globalThis.__COT_RENDER_PERF?.matchControlTypes || [],
            connected: !!client?.connected,
            closed: !!client?.closed,
            readySent: !!client?.readySent,
            handshakeSent: !!client?.handshakeSent,
            sendSeq: client?.sendSeq ?? null,
            lastRecvSeq: client?.lastRecvSeq ?? null,
            transportKind: client?.transport?.kind || null,
            transportStats: client?.transport?.stats || null,
          };
        });
        throw new Error(`${error.message}; guest=${JSON.stringify(guestDiagnostics)}`, {
          cause: error,
        });
      }
    }

    await hostPage.evaluate(async () => {
      const { beginPrivateHostMatch } = await import('/src/net/privateMatchHandoff.ts');
      const state = globalThis.__COT_RENDER_PERF;
      state.match = beginPrivateHostMatch({
        session: state.session,
        lobbyState: state.startingLobby,
      });
      state.match.ready();
      state.readyTimer = setInterval(() => {
        if (!state.match?.client?.closed && !state.match?.host?.matchStarted) state.match.ready();
      }, 1000);
      state.pumpTimer = setInterval(() => state.match.advance(1000 / 60), 1000 / 60);
    });
    await guestPage.evaluate(() => {
      const state = globalThis.__COT_RENDER_PERF;
      state.entryFrames = [];
      window.__DEBUG.game.result = 'victory';
      const sample = () => {
        const loaderVisible = !!document.querySelector('.cot-bl.on');
        const phase = window.__DEBUG.game.phase;
        state.entryFrames.push({ loaderVisible, phase });
        if (phase !== 'battle' && state.entryFrames.length < 1200) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      state.entry = window.__DEBUG.beginNetworkBattle({
        role: 'client',
        session: state.session,
        lobbyState: state.lastLobby,
      }).then((result) => { state.entryResult = result; })
        .catch((error) => { state.errors.push(error.message); state.entryResult = false; });
      state.entryTransition = {
        loaderVisible: !!document.querySelector('.cot-bl.on'),
        phase: window.__DEBUG.game.phase,
        result: window.__DEBUG.game.result,
      };
      return true;
    });
    return await collectFullRenderer(guestPage, `${roomMode}-client`);
  } finally {
    await Promise.all([closeState(hostPage), closeState(guestPage)]);
  }
}

try {
  await vite.listen();
  const signalAddress = await signaling.listen();
  const viteAddress = vite.httpServer.address();
  const origin = `http://127.0.0.1:${viteAddress.port}`;
  const signalUrl = `ws://127.0.0.1:${signalAddress.port}/signal`;
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--use-gl=angle',
      '--enable-webgl',
    ],
  });

  const runs = [];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const solo = only === 'all' || only === 'solo' ? await runSolo(origin) : null;
    const host = only === 'all' || only === 'host'
      ? await runNetwork(origin, signalUrl, 'host')
      : null;
    const client = only === 'all' || only === 'client'
      ? await runNetwork(origin, signalUrl, 'client')
      : null;
    for (const report of [host, client].filter(Boolean)) {
      if (solo) {
        assert.ok(report.gapP95 <= solo.gapP95 * 1.35 + 2,
          `${report.mode} p95 ${report.gapP95} ms regressed against solo ${solo.gapP95} ms`);
      }
      assert.equal(report.rosterSize, 4, `${report.mode} must render a real 2v2 roster`);
    }
    runs.push({
      cycle,
      ...(solo ? { solo } : {}),
      ...(host ? { [`${roomMode}Host`]: host } : {}),
      ...(client ? { [`${roomMode}Client`]: client } : {}),
    });
  }
  assert.deepEqual(consoleErrors, [], `browser errors:\n${consoleErrors.join('\n')}`);
  console.log(JSON.stringify({
    ok: true,
    profile: {
      seconds, cpuRate, minimumFps, cycles, maxColdReadyMs, enforceBudgets,
      viewport: [1280, 720], quality: 'desktop', roomMode, adverse,
      freshBrowserContexts: true,
    },
    runs,
    ...(cycles === 1 ? runs[0] : {}),
  }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  await signaling.close().catch(() => {});
  await vite.close().catch(() => {});
}
