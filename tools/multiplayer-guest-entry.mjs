import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createSignalingServer } from '../server/signalingServer.js';

const root = new URL('..', import.meta.url).pathname;
const errors = [];
const signaling = createSignalingServer({ host: '127.0.0.1', port: 0 });
let vite = null;
let browser = null;

function observe(page, label) {
  page.on('pageerror', (error) => errors.push(`${label}: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label}: ${message.text()}`);
  });
}

async function closeState(page) {
  if (!page || page.isClosed()) return;
  await page.evaluate(() => {
    const state = globalThis.__COT_GUEST_ENTRY_HOST;
    if (state?.timer) clearInterval(state.timer);
    try { state?.match?.close('guest_entry_complete'); } catch (_) { /* best effort */ }
    try { state?.session?.close('guest_entry_complete'); } catch (_) { /* best effort */ }
  }).catch(() => {});
}

try {
  const signalAddress = await signaling.listen();
  const signalUrl = `ws://127.0.0.1:${signalAddress.port}/signal`;
  process.env.VITE_SIGNAL_URL = signalUrl;
  vite = await createViteServer({
    root,
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
  });
  await vite.listen();
  const viteAddress = vite.httpServer.address();
  const origin = `http://127.0.0.1:${viteAddress.port}`;

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
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();
  observe(hostPage, 'host');
  observe(guestPage, 'guest');
  await hostPage.goto(`${origin}/tools/multiplayer-browser-soak.html`, {
    waitUntil: 'domcontentloaded', timeout: 180_000,
  });

  const room = await hostPage.evaluate(async ({ signalUrl: url }) => {
    const [{ RoomSignalingClient }, { PrivateRoomHostSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.js'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.createRoom({
      player: { id: 'entry-host', name: 'Entry Host' },
      mode: 'private',
      maxPlayers: 14,
    });
    const state = globalThis.__COT_GUEST_ENTRY_HOST = {
      signaling: signalingClient,
      roomInfo,
      lobby: null,
      startError: null,
    };
    state.session = new PrivateRoomHostSession({
      signaling: signalingClient,
      roomInfo,
      hostName: 'Entry Host',
      hostSpecId: 'm1a2',
      mapId: 'winter',
      teamSize: 1,
      onStart: (lobbyState) => {
        state.lobby = lobbyState;
        state.startPromise = import('/src/net/privateMatchHandoff.js')
          .then(({ beginPrivateHostMatch }) => {
            state.match = beginPrivateHostMatch({ session: state.session, lobbyState });
            state.match.ready();
            state.timer = setInterval(() => state.match.advance(1000 / 60), 1000 / 60);
          })
          .catch((error) => { state.startError = error.message; });
      },
      onError: (error) => { state.startError = error.message; },
    });
    state.unsubscribe = state.session.runtime.onState((lobby) => { state.lobby = lobby; });
    return roomInfo;
  }, { signalUrl });

  const inviteUrl = new URL(`${origin}/`);
  inviteUrl.searchParams.set('nosplash', '1');
  inviteUrl.searchParams.set('tier', 'desktop');
  inviteUrl.searchParams.set('gfxreset', '1');
  inviteUrl.searchParams.set('room', room.roomCode);
  inviteUrl.searchParams.set('host', 'Entry Host');
  await guestPage.goto(inviteUrl.href, {
    waitUntil: 'domcontentloaded', timeout: 180_000,
  });
  await guestPage.waitForFunction(
    () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage',
    { timeout: 240_000 },
  );

  await guestPage.waitForFunction(() => {
    const status = document.querySelector('.cot-play .status');
    return document.querySelector('.cot-play .lobby.show .players')?.children.length === 2 ||
      status?.classList.contains('err');
  }, { timeout: 15_000 });
  const joinError = await guestPage.evaluate(() => {
    const status = document.querySelector('.cot-play .status');
    return status?.classList.contains('err') ? status.textContent : '';
  });
  assert.equal(joinError, '', `guest failed to join the real lobby: ${joinError}`);

  await Promise.all([
    hostPage.waitForFunction(
      () => globalThis.__COT_GUEST_ENTRY_HOST?.lobby?.players?.length === 2,
      { timeout: 15_000 },
    ),
    guestPage.waitForFunction(
      () => document.querySelector('.cot-play .lobby.show .players')?.children.length === 2,
      { timeout: 15_000 },
    ),
  ]);

  await guestPage.click('.cot-play .close');
  await guestPage.waitForFunction(
    () => !document.querySelector('.cot-play')?.classList.contains('show') &&
      window.__DEBUG?.garage?.isOpen === true,
    { timeout: 10_000 },
  );
  const garageRoom = await guestPage.evaluate(() => ({
    url: location.href,
    reminderVisible: document.querySelector('.cot-room-reminder')?.classList.contains('show') || false,
    reminderText: document.querySelector('.cot-room-reminder .rr-copy')?.textContent || '',
  }));
  assert.equal(garageRoom.reminderVisible, true,
    'guest garage must expose the room reminder while membership stays active');
  assert.match(garageRoom.reminderText, new RegExp(room.roomCode),
    'guest garage reminder must identify the active room');
  assert.equal(new URL(garageRoom.url).searchParams.get('room'), room.roomCode,
    'guest invite URL must remain canonical until the player explicitly leaves');
  assert.equal(await hostPage.evaluate(() =>
    globalThis.__COT_GUEST_ENTRY_HOST?.lobby?.players?.length), 2,
  'guest must remain in the host roster while viewing the garage');

  await guestPage.click('.cot-room-reminder');
  await guestPage.waitForFunction(
    () => document.querySelector('.cot-play.show .lobby.show .players')?.children.length === 2,
    { timeout: 10_000 },
  );

  await guestPage.evaluate(() => {
    globalThis.__COT_GUEST_ENTRY = { frames: [] };
    const state = globalThis.__COT_GUEST_ENTRY;
    const menu = document.querySelector('.cot-play');
    const loader = document.querySelector('.cot-bl');
    let handoffStarted = false;
    const sample = () => {
      const menuVisible = menu.classList.contains('show');
      if (!menuVisible) handoffStarted = true;
      if (handoffStarted) {
        const loaderStyle = getComputedStyle(loader);
        const garage = window.__DEBUG?.garage;
        const center = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
        state.frames.push({
          phase: window.__DEBUG?.game?.phase,
          menuVisible,
          loaderOn: loader.classList.contains('on'),
          loaderDisplay: loaderStyle.display,
          loaderOpacity: Number(loaderStyle.opacity),
          garageOpen: !!garage?.isOpen,
          topSurface: center?.closest?.('.cot-bl,.cot-play')?.className || center?.tagName || '',
        });
      }
      if (state.frames.length < 3600 &&
          (window.__DEBUG?.game?.phase !== 'battle' || loader.classList.contains('on'))) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
  });

  await Promise.all([
    hostPage.evaluate(() => globalThis.__COT_GUEST_ENTRY_HOST.session.command({
      type: 'set_ready', ready: true,
    })),
    guestPage.evaluate(() => document.querySelector('.cot-play [data-action="ready"]').click()),
  ]);
  await hostPage.waitForFunction(
    () => globalThis.__COT_GUEST_ENTRY_HOST.lobby.players.every((player) => player.ready),
    { timeout: 10_000 },
  );
  await hostPage.evaluate(() => globalThis.__COT_GUEST_ENTRY_HOST.session.command({
    type: 'start', matchSeed: 0xC07CAFE,
  }));

  // The regression is the guest's compositor handoff, not the full (and
  // intentionally expensive) battlefield load. Ten real animation frames
  // are enough to prove whether closing the lobby exposed the garage.
  await guestPage.waitForFunction(
    () => globalThis.__COT_GUEST_ENTRY?.frames?.length >= 10,
    { timeout: 30_000, polling: 20 },
  );
  const report = await guestPage.evaluate(() => {
    const state = globalThis.__COT_GUEST_ENTRY;
    const firstHidden = state.frames.find((frame) => !frame.menuVisible) || null;
    const exposed = state.frames.filter((frame) =>
      frame.phase !== 'battle' && !frame.menuVisible &&
      (frame.loaderDisplay === 'none' || frame.loaderOpacity < 0.99));
    return {
      frames: state.frames.length,
      firstHidden,
      exposed: exposed.slice(0, 8),
      entryFailure: window.__NETWORK_ENTRY_FAILURE || null,
    };
  });

  assert.ok(report.firstHidden, 'real guest lobby must enter the network handoff');
  assert.equal(report.firstHidden.loaderOn, true,
    'guest must mount the battle cover before hiding its lobby');
  assert.equal(report.firstHidden.loaderOpacity, 1,
    'guest battle cover must be fully opaque on its first composited handoff frame');
  assert.match(report.firstHidden.topSurface, /cot-bl/,
    'battle cover must own the first guest frame after the lobby closes');
  assert.deepEqual(report.exposed, [], 'guest exposed the garage before entering battle');
  assert.equal(report.entryFailure, null, 'guest handoff must not enter recovery');
  assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`);
  console.log(JSON.stringify({ ok: true, report }, null, 2));

  await Promise.all([closeState(hostPage), closeState(guestPage)]);
} finally {
  if (browser) await browser.close().catch(() => {});
  await signaling.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
