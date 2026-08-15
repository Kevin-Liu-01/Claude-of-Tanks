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

const seconds = numberOption('seconds', 6);
const cpuRate = numberOption('cpu', 4);
const root = new URL('..', import.meta.url).pathname;
const consoleErrors = [];
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

async function openPage(origin, { full = false, label }) {
  const page = await browser.newPage();
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
  const path = full
    ? '/?nosplash=1&tier=desktop&gfxreset=1'
    : '/tools/multiplayer-browser-soak.html';
  await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  if (full) {
    await page.waitForFunction(
      () => window.__GAME_READY === true && window.__DEV_TRACE?.enabled === true,
      { timeout: 240_000 },
    );
  }
  return page;
}

async function closeState(page) {
  if (!page || page.isClosed()) return;
  await page.evaluate(() => {
    const state = globalThis.__COT_RENDER_PERF;
    if (!state) return;
    if (state.pumpTimer) clearInterval(state.pumpTimer);
    try { state.match?.close('render_perf_complete'); } catch (_) { /* best effort */ }
    try { state.session?.close('render_perf_complete'); } catch (_) { /* best effort */ }
  }).catch(() => {});
  await page.close().catch(() => {});
}

async function createStartingRoom(hostPage, guestPage, signalUrl) {
  const room = await hostPage.evaluate(async (url) => {
    const [{ RoomSignalingClient }, { PrivateRoomHostSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.js'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.createRoom({
      player: { id: 'render-host', name: 'Commander' },
      mode: 'lan',
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
  }, signalUrl);

  await guestPage.evaluate(async ({ url, roomCode }) => {
    const [{ RoomSignalingClient }, { PrivateRoomClientSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.js'),
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
  }));
  assert.notEqual(entryState.result, false,
    `${label} failed during network battle entry: ${JSON.stringify(entryState.failure)}`);
  await page.evaluate((mode) => {
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
    };
  }, label);
  assert.ok(report.frames >= seconds * 30,
    `${label} captured too few active frames: ${report.frames}`);
  assert.equal(report.freezes, 0, `${label} must not freeze under ${cpuRate}x CPU throttling`);
  assert.ok(report.gapP95 < 40,
    `${label} p95 frame gap ${report.gapP95} ms fell below a stable 30 fps floor`);
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
  });
  try {
    await createStartingRoom(hostPage, guestPage, signalUrl);
    if (renderedRole === 'host') {
      await guestPage.evaluate(() => {
        const state = globalThis.__COT_RENDER_PERF;
        state.handoff = (async () => {
          const { beginPrivateClientMatch } = await import('/src/net/privateMatchHandoff.js');
          state.match = await beginPrivateClientMatch({
            session: state.session,
            playerId: state.roomInfo.peerId,
            lobbyState: state.lastLobby,
          });
          if (!state.match.client.connected) {
            await new Promise((resolve, reject) => {
              const timeout = setTimeout(() => {
                unsubscribe();
                reject(new Error('guest match handshake timed out'));
              }, 10_000);
              const unsubscribe = state.match.client.onConnection((connected) => {
                if (!connected) return;
                clearTimeout(timeout);
                unsubscribe();
                resolve();
              });
            });
          }
          state.match.ready();
          state.pumpTimer = setInterval(() => state.match.update(performance.now()), 16);
        })().catch((error) => { state.errors.push(error.message); });
        return true;
      });
      await hostPage.evaluate(() => {
        const state = globalThis.__COT_RENDER_PERF;
        state.entry = window.__DEBUG.beginNetworkBattle({
          role: 'host',
          session: state.session,
          lobbyState: state.startingLobby,
        }).then((result) => { state.entryResult = result; })
          .catch((error) => { state.errors.push(error.message); state.entryResult = false; });
        return true;
      });
      return await collectFullRenderer(hostPage, 'private-host');
    }

    await hostPage.evaluate(async () => {
      const { beginPrivateHostMatch } = await import('/src/net/privateMatchHandoff.js');
      const state = globalThis.__COT_RENDER_PERF;
      state.match = beginPrivateHostMatch({
        session: state.session,
        lobbyState: state.startingLobby,
      });
      state.match.ready();
      state.pumpTimer = setInterval(() => state.match.advance(1000 / 60), 1000 / 60);
    });
    await guestPage.evaluate(() => {
      const state = globalThis.__COT_RENDER_PERF;
      state.entry = window.__DEBUG.beginNetworkBattle({
        role: 'client',
        session: state.session,
        lobbyState: state.lastLobby,
      }).then((result) => { state.entryResult = result; })
        .catch((error) => { state.errors.push(error.message); state.entryResult = false; });
      return true;
    });
    return await collectFullRenderer(guestPage, 'private-client');
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

  const solo = await runSolo(origin);
  const host = await runNetwork(origin, signalUrl, 'host');
  const client = await runNetwork(origin, signalUrl, 'client');
  for (const report of [host, client]) {
    assert.ok(report.gapP95 <= solo.gapP95 * 1.35 + 2,
      `${report.mode} p95 ${report.gapP95} ms regressed against solo ${solo.gapP95} ms`);
    assert.equal(report.rosterSize, 4, `${report.mode} must render a real 2v2 roster`);
  }
  assert.deepEqual(consoleErrors, [], `browser errors:\n${consoleErrors.join('\n')}`);
  console.log(JSON.stringify({
    ok: true,
    profile: { seconds, cpuRate, viewport: [1280, 720], quality: 'desktop' },
    solo,
    privateHost: host,
    privateClient: client,
  }, null, 2));
} finally {
  if (browser) await browser.close().catch(() => {});
  await signaling.close().catch(() => {});
  await vite.close().catch(() => {});
}
