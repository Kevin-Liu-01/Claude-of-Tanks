import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createSignalingServer } from '../server/signalingServer.ts';

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
    protocolTimeout: 360_000,
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
  // Model two actual first-time machines: no shared cookies, storage,
  // service workers, HTTP cache, credentials, or player identity.
  const hostContext = await browser.createBrowserContext();
  const guestContext = await browser.createBrowserContext();
  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();
  observe(hostPage, 'host');
  observe(guestPage, 'guest');
  await hostPage.goto(`${origin}/tools/multiplayer-browser-soak.html`, {
    waitUntil: 'domcontentloaded', timeout: 180_000,
  });

  const room = await hostPage.evaluate(async ({ signalUrl: url }) => {
    const [{ RoomSignalingClient }, { PrivateRoomHostSession }] = await Promise.all([
      import('/src/net/signalingClient.ts'),
      import('/src/net/privateRoomSession.ts'),
      // The production entry imports the fleet facade before opening rooms;
      // mirror that registration boundary so the authority recognizes the
      // pristine client's default Abrams spec without warming its visual.
      import('/src/vehicles/fleetFactory.ts'),
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
        state.startPromise = import('/src/net/privateMatchHandoff.ts')
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
  await guestPage.bringToFront();
  await guestPage.goto(inviteUrl.href, {
    waitUntil: 'domcontentloaded', timeout: 180_000,
  });
  await guestPage.waitForFunction(
    () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage',
    { timeout: 240_000 },
  );

  let lobbyEntryError = null;
  try {
    await guestPage.waitForFunction(() => {
      const status = document.querySelector('.cot-play .status');
      return document.querySelector('.cot-play .lobby.show .players')?.children.length === 2 ||
        status?.classList.contains('err');
    }, { timeout: 15_000 });
  } catch (error) {
    lobbyEntryError = error;
  }
  if (lobbyEntryError) {
    const diagnostics = await Promise.all([
      hostPage.evaluate(() => {
        const state = globalThis.__COT_GUEST_ENTRY_HOST;
        return {
          lobby: state?.lobby || null,
          startError: state?.startError || null,
          signalingState: state?.signaling?.state || null,
          peers: [...(state?.session?.peers?.entries?.() || [])].map(([id, peer]) => ({
            id,
            connectionState: peer.connectionState,
            sessionId: peer.sessionId,
          })),
        };
      }),
      guestPage.evaluate(() => ({
        url: location.href,
        title: document.title,
        gameReady: window.__GAME_READY === true,
        phase: window.__DEBUG?.game?.phase || null,
        menuVisible: document.querySelector('.cot-play')?.classList.contains('show') || false,
        lobbyVisible: document.querySelector('.cot-play .lobby')?.classList.contains('show') || false,
        playerCount: document.querySelector('.cot-play .lobby .players')?.children.length || 0,
        status: document.querySelector('.cot-play .status')?.textContent || '',
        statusError: document.querySelector('.cot-play .status')?.classList.contains('err') || false,
      })),
      errors,
    ]);
    console.error('initial lobby entry diagnostics', JSON.stringify(diagnostics, null, 2));
    throw lobbyEntryError;
  }
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

  // Let the pristine invite finish its first real battlefield load, then
  // reload the actual application while authority is already playing. The
  // stable browser identity and canonical room URL must reclaim the same
  // seat and enter the live match without requiring the user to reopen the
  // lobby or paste the code again.
  await guestPage.waitForFunction(() =>
    (window.__DEBUG?.game?.phase === 'battle' && window.__DEBUG?.network?.connected === true) ||
      window.__NETWORK_ENTRY_FAILURE,
  { timeout: 240_000, polling: 50 });
  const initialEntryFailure = await guestPage.evaluate(() =>
    window.__NETWORK_ENTRY_FAILURE || null);
  if (initialEntryFailure) {
    const diagnostics = await Promise.all([
      hostPage.evaluate(() => {
        const state = globalThis.__COT_GUEST_ENTRY_HOST;
        return {
          startError: state?.startError,
          lobby: state?.lobby,
          signalingState: state?.signaling?.state,
          rtcPeers: [...(state?.session?.peers?.entries?.() || [])].map(([id, peer]) => ({
            id,
            connectionState: peer.connectionState,
            sessionId: peer.sessionId,
          })),
          matchPeers: [...(state?.match?.host?.peers?.values?.() || [])].map((peer) => ({
            id: peer.id,
            welcomed: peer.welcomed,
            ready: peer.ready,
            lastRecvSeq: peer.lastRecvSeq,
            transportReadyState: peer.transport?.readyState,
          })),
          matchStarted: state?.match?.host?.matchStarted,
          matchStats: state?.match?.host?.stats,
        };
      }),
      guestPage.evaluate(() => ({
        failure: window.__NETWORK_ENTRY_FAILURE || null,
        phase: window.__DEBUG?.game?.phase,
        network: window.__DEBUG?.network,
        roomVisible: document.querySelector('.cot-play')?.classList.contains('show'),
        loaderOn: document.querySelector('.cot-bl')?.classList.contains('on'),
      })),
    ]);
    console.error('initial guest entry diagnostics', JSON.stringify(diagnostics, null, 2));
  }
  assert.equal(initialEntryFailure, null,
    `the pristine invite failed its first authoritative snapshot: ${JSON.stringify(initialEntryFailure)}`);
  const beforeReload = await guestPage.evaluate(() => ({
    playerId: localStorage.getItem('cot.player.id.v1'),
    roomCode: new URL(location.href).searchParams.get('room'),
  }));
  const liveReloadStartedAt = performance.now();
  await guestPage.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
  let liveReloadWaitError = null;
  try {
    await guestPage.waitForFunction(() =>
      (window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'battle' &&
        window.__DEBUG?.network?.connected === true) || window.__NETWORK_ENTRY_FAILURE,
    { timeout: 90_000, polling: 50 });
  } catch (error) {
    liveReloadWaitError = error;
  }
  const liveReload = await guestPage.evaluate(() => ({
    playerId: localStorage.getItem('cot.player.id.v1'),
    roomCode: new URL(location.href).searchParams.get('room'),
    gameReady: window.__GAME_READY === true,
    phase: window.__DEBUG?.game?.phase,
    connected: window.__DEBUG?.network?.connected,
    entryFailure: window.__NETWORK_ENTRY_FAILURE || null,
    roomVisible: document.querySelector('.cot-play')?.classList.contains('show') || false,
    roomPhase: document.querySelector('.cot-play')?.dataset?.phase || '',
    roomStatus: document.querySelector('.cot-play .status')?.textContent || '',
    loaderOn: document.querySelector('.cot-bl')?.classList.contains('on') || false,
  }));
  const liveReloadRecoveryMs = performance.now() - liveReloadStartedAt;
  if (liveReloadWaitError) {
    const hostReloadState = await hostPage.evaluate(() => {
      const state = globalThis.__COT_GUEST_ENTRY_HOST;
      return {
        startError: state?.startError,
        lobby: state?.match?.client?.roomState || state?.lobby,
        rtcPeers: [...(state?.session?.peers?.entries?.() || [])].map(([id, peer]) => ({
          id,
          connectionState: peer.connectionState,
          sessionId: peer.sessionId,
        })),
        matchPeers: [...(state?.match?.host?.peers?.values?.() || [])].map((peer) => ({
          id: peer.id,
          welcomed: peer.welcomed,
          ready: peer.ready,
          lastRecvSeq: peer.lastRecvSeq,
          transportReadyState: peer.transport?.readyState,
        })),
      };
    });
    console.error('live reload diagnostics', JSON.stringify({
      error: liveReloadWaitError.message,
      host: hostReloadState,
      guest: liveReload,
    }, null, 2));
    throw liveReloadWaitError;
  }
  assert.equal(liveReload.playerId, beforeReload.playerId,
    'a full application reload retains the stable room player identity');
  assert.equal(liveReload.roomCode, room.roomCode,
    'the canonical room URL survives a live-match reload');
  assert.equal(liveReload.phase, 'battle');
  assert.equal(liveReload.connected, true);
  assert.equal(liveReload.entryFailure, null,
    'a live room resume does not enter network recovery presentation');
  await hostPage.waitForFunction((playerId) => {
    const host = globalThis.__COT_GUEST_ENTRY_HOST;
    return host?.match?.client?.roomState?.players?.find(
      (player) => player.id === playerId,
    )?.connected === true;
  }, { timeout: 15_000, polling: 25 }, liveReload.playerId);

  // Reload once more and close authority during the covered handoff. This
  // retains the original cancellation regression after the successful live
  // resume above, and proves a late async world cannot remount itself.
  await guestPage.reload({ waitUntil: 'domcontentloaded', timeout: 180_000 });
  await guestPage.waitForFunction(() =>
    window.__GAME_READY === true && document.querySelector('.cot-bl')?.classList.contains('on') &&
      !document.querySelector('.cot-play')?.classList.contains('show'),
  { timeout: 60_000, polling: 25 });

  // Close the host while the pristine guest is still behind its cold loader.
  // The obsolete async entry must unwind to Garage and remain there; it may
  // not publish its late transport/bridge or remount the battle surface.
  await hostPage.evaluate(() => {
    globalThis.__COT_GUEST_ENTRY_HOST.session.close('cold_entry_cancel_test');
  });
  await guestPage.waitForFunction(() =>
    window.__DEBUG?.game?.phase === 'garage'
      && window.__DEBUG?.garage?.isOpen === true
      && !document.querySelector('.cot-bl')?.classList.contains('on'),
  { timeout: 30_000, polling: 25 });
  await guestPage.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1_500)));
  const cancellation = await guestPage.evaluate(() => ({
    phase: window.__DEBUG?.game?.phase,
    garageOpen: window.__DEBUG?.garage?.isOpen === true,
    loaderOn: document.querySelector('.cot-bl')?.classList.contains('on') || false,
    entryFailure: window.__NETWORK_ENTRY_FAILURE || null,
    network: window.__DEBUG?.network || null,
  }));
  assert.equal(cancellation.phase, 'garage',
    'a cancelled pristine entry must remain in Garage after late work settles');
  assert.equal(cancellation.garageOpen, true);
  assert.equal(cancellation.loaderOn, false);
  assert.equal(cancellation.entryFailure, null,
    'intentional room closure is not presented as a cold-load failure');
  assert.equal(cancellation.network, null,
    'a late cold-entry transport must not regain browser session ownership');
  assert.deepEqual(errors, [], `browser errors:\n${errors.join('\n')}`);
  console.log(JSON.stringify({
    ok: true,
    report,
    liveReload: {
      ...liveReload,
      recoveryMs: Number(liveReloadRecoveryMs.toFixed(1)),
    },
    cancellation,
  }, null, 2));

  await Promise.all([closeState(hostPage), closeState(guestPage)]);
} finally {
  if (browser) await browser.close().catch(() => {});
  await signaling.close().catch(() => {});
  if (vite) await vite.close().catch(() => {});
}
