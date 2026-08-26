import assert from 'node:assert/strict';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createSignalingServer } from '../server/signalingServer.js';

function numericArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : fallback;
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be non-negative`);
  return value;
}

const durationMs = numericArg('duration', 6000);
const latencyMs = numericArg('latency', 85);
const jitterMs = numericArg('jitter', 35);
const lossPercent = numericArg('loss', 12);
const inputLossPercent = numericArg('input-loss', 0);
const root = new URL('..', import.meta.url).pathname;
const browserErrors = [];

const vite = await createViteServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false },
});
const signaling = createSignalingServer({ host: '127.0.0.1', port: 0 });
let browser = null;

function observePage(page, label) {
  page.on('pageerror', (error) => browserErrors.push(`${label}: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`${label}: ${message.text()}`);
  });
}

async function closePageState(page) {
  if (!page || page.isClosed()) return;
  await page.evaluate(() => {
    const state = globalThis.__COT_SOAK;
    if (!state) return;
    if (state.matchTimer) clearInterval(state.matchTimer);
    if (state.inputTimer) clearInterval(state.inputTimer);
    if (state.signalingResumeUnsubscribe) state.signalingResumeUnsubscribe();
    try { state.match?.close('soak_complete'); } catch (_) { /* best-effort QA cleanup */ }
    try { state.session?.close('soak_complete'); } catch (_) { /* best-effort QA cleanup */ }
  }).catch(() => {});
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
    ],
  });
  const hostPage = await browser.newPage();
  const guestPage = await browser.newPage();
  observePage(hostPage, 'host');
  observePage(guestPage, 'guest');
  await Promise.all([
    hostPage.goto(`${origin}/tools/multiplayer-browser-soak.html`, { waitUntil: 'domcontentloaded' }),
    guestPage.goto(`${origin}/tools/multiplayer-browser-soak.html?netSim=1&netLatency=${latencyMs}` +
      `&netJitter=${jitterMs}&netLoss=${lossPercent}&netInputLoss=${inputLossPercent}`,
    { waitUntil: 'domcontentloaded' }),
  ]);

  const room = await hostPage.evaluate(async (url) => {
    const [{ RoomSignalingClient }, { PrivateRoomHostSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.js'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.createRoom({
      player: { id: 'browser-host', name: 'Commander' },
      mode: 'lan',
      maxPlayers: 14,
    });
    const state = globalThis.__COT_SOAK = {
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
      mapId: 'random',
      onStart: (lobby) => { state.startingLobby = lobby; },
      onError: (error) => state.errors.push(error.message),
    });
    state.unsubscribe = state.session.runtime.onState((lobby) => { state.lastLobby = lobby; });
    return roomInfo;
  }, signalUrl);

  const guest = await guestPage.evaluate(async ({ url, roomCode }) => {
    const [{ RoomSignalingClient }, { PrivateRoomClientSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.js'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.joinRoom({
      roomCode,
      player: { id: 'browser-guest', name: 'Commander' },
    });
    const state = globalThis.__COT_SOAK = {
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
    const runtime = await state.session.ready;
    state.runtime = runtime;
    state.unsubscribe = runtime.onState((lobby) => { state.lastLobby = lobby; });
    return roomInfo;
  }, { url: signalUrl, roomCode: room.roomCode });

  await hostPage.waitForFunction(() => globalThis.__COT_SOAK?.session?.runtime?.peers?.size === 1,
    { timeout: 10000 });
  await guestPage.waitForFunction(() => globalThis.__COT_SOAK?.lastLobby?.players?.length === 2,
    { timeout: 10000 });

  const initial = await guestPage.evaluate(() => globalThis.__COT_SOAK.lastLobby);
  assert.equal(initial.players.find((player) => player.id === initial.hostId).specId, 'm1a2');
  assert.equal(initial.players.find((player) => player.id !== initial.hostId).team, 'bravo');
  assert.equal(new Set(initial.players.map((player) =>
    player.name.toLocaleLowerCase('en-US'))).size, 2,
  'canonical browser lobby disambiguates colliding commander names');

  await guestPage.evaluate(() => globalThis.__COT_SOAK.session.submit({
    type: 'set_map', mapId: 'winter',
  }));
  await guestPage.waitForFunction(() => globalThis.__COT_SOAK.runtime.errors.some(
    (error) => error.code === 'host_only'), { timeout: 5000 });
  await guestPage.evaluate(() => globalThis.__COT_SOAK.session.submit({
    type: 'set_team', team: 'spectator',
  }));
  await guestPage.waitForFunction(() => globalThis.__COT_SOAK.lastLobby.players.find(
    (player) => player.id === globalThis.__COT_SOAK.roomInfo.peerId)?.team === 'spectator',
  { timeout: 5000 });
  await guestPage.evaluate(() => globalThis.__COT_SOAK.session.submit({
    type: 'set_team', team: 'bravo',
  }));
  await hostPage.evaluate(() => {
    const session = globalThis.__COT_SOAK.session;
    session.command({ type: 'set_team_size', teamSize: 2 });
    session.command({ type: 'set_map', mapId: 'winter' });
  });
  await guestPage.evaluate(() => globalThis.__COT_SOAK.session.submit({
    type: 'select_vehicle', specId: 'm1a2',
  }));
  await guestPage.waitForFunction(() => {
    const state = globalThis.__COT_SOAK;
    const own = state.lastLobby.players.find((player) => player.id === state.roomInfo.peerId);
    return own?.team === 'bravo' && own?.specId === 'm1a2' && state.lastLobby.mapId === 'winter' &&
      state.lastLobby.teamSize === 2;
  }, { timeout: 5000 });
  await Promise.all([
    hostPage.evaluate(() => globalThis.__COT_SOAK.session.command({ type: 'set_ready', ready: true })),
    guestPage.evaluate(() => globalThis.__COT_SOAK.session.submit({ type: 'set_ready', ready: true })),
  ]);
  try {
    await hostPage.waitForFunction(() => globalThis.__COT_SOAK.lastLobby.players.every(
      (player) => player.ready), { timeout: 5000, polling: 100 });
  } catch (error) {
    const readiness = await Promise.all([
      hostPage.evaluate(() => ({ lobby: globalThis.__COT_SOAK?.lastLobby,
        errors: globalThis.__COT_SOAK?.errors })),
      guestPage.evaluate(() => ({ lobby: globalThis.__COT_SOAK?.lastLobby,
        errors: globalThis.__COT_SOAK?.runtime?.errors })),
    ]);
    throw new Error(`ready barrier timed out: ${JSON.stringify(readiness)}`, { cause: error });
  }
  await hostPage.evaluate(() => globalThis.__COT_SOAK.session.command({
    type: 'start', matchSeed: 0xC07CAFE,
  }));
  await Promise.all([
    hostPage.waitForFunction(() => globalThis.__COT_SOAK.startingLobby?.phase === 'starting',
      { timeout: 5000 }),
    guestPage.waitForFunction(() => globalThis.__COT_SOAK.lastLobby?.phase === 'starting',
      { timeout: 5000 }),
  ]);

  const hostMatch = await hostPage.evaluate(async () => {
    const { beginPrivateHostMatch } = await import('/src/net/privateMatchHandoff.js');
    const state = globalThis.__COT_SOAK;
    state.match = beginPrivateHostMatch({
      session: state.session,
      lobbyState: state.startingLobby,
    });
    state.advanceDurations = [];
    state.match.ready();
    return {
      playerId: state.match.playerId,
      mapId: state.match.mapId,
      rosterSize: state.match.simulation.entityById.size,
    };
  });
  const guestMatch = await guestPage.evaluate(async () => {
    const { beginPrivateClientMatch } = await import('/src/net/privateMatchHandoff.js');
    const state = globalThis.__COT_SOAK;
    state.match = await beginPrivateClientMatch({
      session: state.session,
      playerId: state.roomInfo.peerId,
      lobbyState: state.lastLobby,
    });
    state.sampleDurations = [];
    state.sampleIdentityStable = true;
    state.match.ready();
    return { playerId: state.match.playerId, mapId: state.match.mapId };
  });

  assert.equal(hostMatch.mapId, 'winter');
  assert.equal(guestMatch.mapId, 'winter');
  assert.equal(hostMatch.rosterSize, 4, '2v2 browser handoff creates a four-tank roster');
  assert.notEqual(hostMatch.playerId, guestMatch.playerId,
    'player identity must remain distinct when both players select M1A2');
  const matchDeadline = Date.now() + 10000;
  let matchState = null;
  while (Date.now() < matchDeadline) {
    await hostPage.evaluate(() => globalThis.__COT_SOAK.match.advance(50));
    const [hostState, guestState] = await Promise.all([
      hostPage.evaluate(() => {
        const match = globalThis.__COT_SOAK.match;
        return {
          started: match.host.matchStarted,
          tick: match.host.tick,
          peers: [...match.host.peers.values()].map((peer) => ({
            id: peer.id,
            welcomed: peer.welcomed,
            ready: peer.ready,
          })),
          invalidMessages: match.host.stats.invalidMessages,
        };
      }),
      guestPage.evaluate(() => {
        const client = globalThis.__COT_SOAK.match.client;
        return {
          connected: client.connected,
          closed: client.closed,
          snapshots: client.buffer.snapshots.length,
          errors: client.errors,
          transport: client.transport.stats,
        };
      }),
    ]);
    matchState = { host: hostState, guest: guestState };
    if (hostState.started && guestState.connected && guestState.snapshots > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  if (!matchState?.host.started || !matchState?.guest.connected || matchState.guest.snapshots < 1) {
    throw new Error(`match handshake timed out: ${JSON.stringify({ matchState, browserErrors })}`);
  }
  const playingDeadline = Date.now() + 10000;
  let phase = null;
  while (Date.now() < playingDeadline) {
    phase = await hostPage.evaluate(async () => {
      const state = globalThis.__COT_SOAK;
      await state.match.advance(50);
      state.match.client.update(performance.now());
      return state.match.simulation.phase;
    });
    await guestPage.evaluate(() => {
      const state = globalThis.__COT_SOAK;
      state.sample = state.match.update(performance.now());
    });
    if (phase === 'playing') break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(phase, 'playing', 'authority countdown must transition to active play');

  // Signaling is rendezvous, not the match transport. Drop both WebSockets
  // after gameplay is live, require durable room resume, and keep the same
  // RTC authority channels. This models a Vercel function recycle or mobile
  // network handover without disguising it as a fresh room.
  await Promise.all([hostPage, guestPage].map((page) => page.evaluate(() => {
    const state = globalThis.__COT_SOAK;
    state.signalingEvents = [];
    state.signalingResumeUnsubscribe = state.signaling.onEvent((message) => {
      if (message?.type === 'signaling_state' || message?.type === 'signaling_resumed') {
        state.signalingEvents.push(message.type);
      }
    });
    state.signaling.socket.close();
  })));
  await Promise.all([hostPage, guestPage].map((page) => page.waitForFunction(() => {
    const state = globalThis.__COT_SOAK;
    return state.signaling.state === 'open' && state.signalingEvents.includes('signaling_resumed');
  }, { timeout: 15_000, polling: 50 })));
  const resumed = await Promise.all([hostPage, guestPage].map((page) => page.evaluate(() => ({
    roomCode: globalThis.__COT_SOAK.signaling.roomCode,
    events: globalThis.__COT_SOAK.signalingEvents,
  }))));
  assert.ok(resumed.every((state) => state.roomCode === room.roomCode),
    'both browsers resume the same durable room after signaling loss');

  const startPosition = await hostPage.evaluate((playerId) => {
    const entity = globalThis.__COT_SOAK.match.simulation.entityById.get(playerId);
    return { ...entity.state.pos };
  }, guestMatch.playerId);
  const playDeadline = performance.now() + durationMs;
  while (performance.now() < playDeadline) {
    await Promise.all([
      hostPage.evaluate(() => {
        const state = globalThis.__COT_SOAK;
        const startedAt = performance.now();
        state.match.advance(1000 / 60);
        state.advanceDurations.push(performance.now() - startedAt);
      }),
      guestPage.evaluate(() => {
        const state = globalThis.__COT_SOAK;
        state.match.submitInput({
          throttle: 1,
          steer: 0.12,
          brake: false,
          fire: false,
          aimYaw: Math.PI,
          aimPitch: 0,
          shellSlot: 0,
          actionBits: 0,
        });
        const startedAt = performance.now();
        const nextSample = state.match.update(performance.now());
        state.sampleDurations.push(performance.now() - startedAt);
        if (state.sample && nextSample && nextSample !== state.sample) {
          state.sampleIdentityStable = false;
        }
        state.sample = nextSample;
      }),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
  const report = await guestPage.evaluate(() => {
    const state = globalThis.__COT_SOAK;
    const stats = state.match.client.getStats();
    const own = state.sample?.entities?.find((entity) => entity.id === state.match.playerId);
    return {
      connected: state.match.client.connected,
      ownEntityVisible: !!own,
      snapshots: stats.snapshotPacketsReceived,
      missingBaselines: stats.missingSnapshotBaselines,
      loss: stats.estimatedSnapshotLoss,
      buffer: stats.buffer,
      transport: stats.transport,
      errors: state.match.client.errors,
      sampleIdentityStable: state.sampleIdentityStable,
      averageSampleMs: state.sampleDurations.reduce((sum, value) => sum + value, 0) /
        Math.max(1, state.sampleDurations.length),
    };
  });
  const authority = await hostPage.evaluate((playerId) => {
    const state = globalThis.__COT_SOAK;
    const entity = state.match.simulation.entityById.get(playerId);
    return {
      endPosition: { ...entity.state.pos },
      speed: entity.state.speed,
      peerCount: state.match.host.peers.size,
      snapshots: state.match.host.stats.snapshots,
      invalidMessages: state.match.host.stats.invalidMessages,
      entityCount: state.match.simulation.entityById.size,
      averageAdvanceMs: state.advanceDurations.reduce((sum, value) => sum + value, 0) /
        Math.max(1, state.advanceDurations.length),
    };
  }, guestMatch.playerId);
  const displacement = Math.hypot(
    authority.endPosition.x - startPosition.x,
    authority.endPosition.z - startPosition.z,
  );
  assert.equal(report.connected, true);
  assert.equal(report.ownEntityVisible, true, 'a player must always receive its own authority row');
  assert.equal(authority.entityCount, 4, '2v2 authority retains all four tanks during play');
  assert.equal(report.sampleIdentityStable, true,
    'client presentation sampling reuses its output frame across the soak');
  assert.ok(report.snapshots >= 20, `expected at least 20 snapshots, received ${report.snapshots}`);
  assert.equal(report.missingBaselines, 0, 'periodic keyframes must recover every dropped delta');
  assert.ok(report.transport?.delayedIncoming > 0 && report.transport?.delayedOutgoing > 0,
    'the browser match must traverse the adverse-network wrapper');
  if (lossPercent > 0) {
    assert.ok(report.transport.droppedState > 0 || report.loss > 0,
      'the loss profile must actually discard replaceable state');
  }
  assert.ok(displacement > 0.5, `authority ignored guest controls (moved ${displacement.toFixed(2)}m)`);
  assert.ok(authority.speed > 0, 'guest-controlled authority should still be moving');
  assert.equal(authority.invalidMessages, 0);
  assert.equal(report.errors.length, 0);

  // End round one, ready both commanders again, and prove round two reuses
  // the already-open channels instead of touching signaling/WebRTC setup.
  await hostPage.evaluate(() => {
    const state = globalThis.__COT_SOAK;
    for (const entity of state.match.simulation.entities) {
      if (entity.team !== 'bravo') continue;
      entity.combat.hp = 0;
      entity.combat.destroyed = true;
    }
    state.match.advance(50);
  });
  await Promise.all([
    hostPage.waitForFunction(() => globalThis.__COT_SOAK.match.client.roomState?.phase === 'waiting',
      { timeout: 5000 }),
    guestPage.waitForFunction(() => globalThis.__COT_SOAK.match.client.roomState?.phase === 'waiting',
      { timeout: 5000 }),
  ]);
  const retainedRoom = await hostPage.evaluate(() => globalThis.__COT_SOAK.match.client.roomState);
  assert.equal(retainedRoom.players.length, 2, 'post-battle room retains both human commanders');
  assert.ok(retainedRoom.players.every((player) => !player.ready),
    'post-battle room resets ready votes for the next round');
  await Promise.all([
    hostPage.evaluate(() => globalThis.__COT_SOAK.match.roomCommand({ type: 'set_ready', ready: true })),
    guestPage.evaluate(() => globalThis.__COT_SOAK.match.roomCommand({ type: 'set_ready', ready: true })),
  ]);
  try {
    await hostPage.waitForFunction(() => globalThis.__COT_SOAK.match.client.roomState.players.every(
      (player) => player.ready), { timeout: 5000, polling: 100 });
  } catch (error) {
    const [hostReadyState, guestReadyState] = await Promise.all([
      hostPage.evaluate(() => ({
        room: globalThis.__COT_SOAK.match.client.roomState,
        clientErrors: globalThis.__COT_SOAK.match.client.errors,
        peerErrors: [...globalThis.__COT_SOAK.match.host.peers.values()].map((peer) => ({
          id: peer.id,
          welcomed: peer.welcomed,
          lastRecvSeq: peer.lastRecvSeq,
        })),
      })),
      guestPage.evaluate(() => ({
        room: globalThis.__COT_SOAK.match.client.roomState,
        clientErrors: globalThis.__COT_SOAK.match.client.errors,
        closed: globalThis.__COT_SOAK.match.client.closed,
      })),
    ]);
    console.error('rematch ready timeout', { hostReadyState, guestReadyState });
    throw error;
  }
  await hostPage.evaluate(() => globalThis.__COT_SOAK.match.roomCommand({
    type: 'start', matchSeed: 0xC07CAFF,
  }));
  await Promise.all([
    hostPage.waitForFunction(() => globalThis.__COT_SOAK.match.client.roomState?.phase === 'starting' &&
      globalThis.__COT_SOAK.match.client.roomState?.round === 2, { timeout: 5000 }),
    guestPage.waitForFunction(() => globalThis.__COT_SOAK.match.client.roomState?.phase === 'starting' &&
      globalThis.__COT_SOAK.match.client.roomState?.round === 2, { timeout: 5000 }),
  ]);
  const nextRound = await hostPage.evaluate(() => globalThis.__COT_SOAK.match.client.roomState);
  await guestPage.evaluate(() => globalThis.__COT_SOAK.match.ready());
  await hostPage.evaluate((lobbyState) => {
    const match = globalThis.__COT_SOAK.match;
    match.prepareRound({ lobbyState });
    match.ready();
  }, nextRound);
  const rematchDeadline = Date.now() + 10000;
  let rematch = null;
  while (Date.now() < rematchDeadline) {
    await hostPage.evaluate(() => globalThis.__COT_SOAK.match.advance(50));
    await guestPage.evaluate(() => globalThis.__COT_SOAK.match.update(performance.now()));
    rematch = await hostPage.evaluate(() => ({
      phase: globalThis.__COT_SOAK.match.client.roomState?.phase,
      round: globalThis.__COT_SOAK.match.client.roomState?.round,
      peers: globalThis.__COT_SOAK.match.host.peers.size,
      rtcPeers: globalThis.__COT_SOAK.session.peers.size,
    }));
    if (rematch.phase === 'playing') break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.deepEqual(rematch, { phase: 'playing', round: 2, peers: 2, rtcPeers: 1 },
    'round two starts with the same authority peers and RTC connection');

  await guestPage.evaluate(() => {
    const state = globalThis.__COT_SOAK;
    clearInterval(state.inputTimer);
    state.match.close('guest_soak_departure');
    state.session.close('guest_soak_departure');
  });
  await hostPage.waitForFunction(() => globalThis.__COT_SOAK.match.host.peers.size === 1,
    { timeout: 5000 });
  const postLeave = await hostPage.evaluate(() => ({
    matchPeers: globalThis.__COT_SOAK.match.host.peers.size,
    rtcPeers: globalThis.__COT_SOAK.session.peers.size,
  }));
  assert.deepEqual(postLeave, { matchPeers: 1, rtcPeers: 0 },
    'guest departure must release both authority and RTC ownership');
  assert.deepEqual(browserErrors, [], `browser errors:\n${browserErrors.join('\n')}`);

  console.log(JSON.stringify({
    ok: true,
    profile: { durationMs, latencyMs, jitterMs, lossPercent, inputLossPercent },
    roomCode: room.roomCode,
    players: [hostMatch.playerId, guestMatch.playerId],
    displacementM: Number(displacement.toFixed(2)),
    snapshots: report.snapshots,
    estimatedLossPercent: Number((report.loss * 100).toFixed(1)),
    interpolationDelayMs: Number(report.buffer.interpolationDelayMs.toFixed(1)),
    extrapolatedSamples: report.buffer.extrapolatedSamples,
    averageAuthorityAdvanceMs: Number(authority.averageAdvanceMs.toFixed(3)),
    averageClientSampleMs: Number(report.averageSampleMs.toFixed(3)),
    transport: {
      delayedIncoming: report.transport.delayedIncoming,
      delayedOutgoing: report.transport.delayedOutgoing,
      droppedState: report.transport.droppedState,
    },
    signalingResumed: resumed.map((state) => state.events),
    rematchRound: rematch.round,
    cleanDeparture: true,
  }, null, 2));
} finally {
  if (browser) {
    const pages = await browser.pages().catch(() => []);
    await Promise.all(pages.map(closePageState));
    await browser.close().catch(() => {});
  }
  await signaling.close().catch(() => {});
  await vite.close().catch(() => {});
}
