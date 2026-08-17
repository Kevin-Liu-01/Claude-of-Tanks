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

const PLAYER_COUNT = 4;
const durationMs = numericArg('duration', 5000);
const settleMs = numericArg('settle', 3000);
const latencyMs = numericArg('latency', 45);
const jitterMs = numericArg('jitter', 15);
const lossPercent = numericArg('loss', 5);
const inputLossPercent = numericArg('input-loss', 3);
const root = new URL('..', import.meta.url).pathname;
const browserErrors = [];

const vite = await createViteServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false },
});
const signaling = createSignalingServer({ host: '127.0.0.1', port: 0 });
let browser = null;
let pages = [];

function observePage(page, label) {
  page.on('pageerror', (error) => browserErrors.push(`${label}: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`${label}: ${message.text()}`);
  });
}

function inputFor(index, brake = false) {
  return {
    throttle: brake ? 0 : 1,
    steer: brake ? 0 : [-0.08, 0.08, -0.14, 0.14][index],
    brake,
    fire: false,
    aimYaw: index < 2 ? 0 : Math.PI,
    aimPitch: 0,
    shellSlot: 0,
    actionBits: 0,
  };
}

async function closePageState(page) {
  if (!page || page.isClosed()) return;
  await page.evaluate(() => {
    const state = globalThis.__COT_FOUR_SOAK;
    if (!state) return;
    try { state.match?.close('four_player_soak_complete'); } catch (_) { /* best effort */ }
    try { state.session?.close('four_player_soak_complete'); } catch (_) { /* best effort */ }
  }).catch(() => {});
}

async function pumpHost(hostPage, elapsedMs, input) {
  return hostPage.evaluate(({ elapsed, frame }) => {
    const state = globalThis.__COT_FOUR_SOAK;
    const startedAt = performance.now();
    state.sample = state.match.advance(elapsed, frame);
    state.advanceDurations.push(performance.now() - startedAt);
    return {
      tick: state.match.host.tick,
      started: state.match.host.matchStarted,
      phase: state.match.simulation.phase,
    };
  }, { elapsed: elapsedMs, frame: input });
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
  pages = await Promise.all(Array.from({ length: PLAYER_COUNT }, async (_, index) => {
    const page = await browser.newPage();
    observePage(page, `player-${index + 1}`);
    const query = index === 0 ? '' : `?netSim=1&netLatency=${latencyMs}` +
      `&netJitter=${jitterMs}&netLoss=${lossPercent}&netInputLoss=${inputLossPercent}`;
    await page.goto(`${origin}/tools/multiplayer-browser-soak.html${query}`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    });
    return page;
  }));
  const [hostPage, ...guestPages] = pages;

  const room = await hostPage.evaluate(async (url) => {
    const [{ RoomSignalingClient }, { PrivateRoomHostSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.js'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.createRoom({
      player: { id: 'browser-p1', name: 'Commander' },
      mode: 'lan',
      maxPlayers: 14,
    });
    const state = globalThis.__COT_FOUR_SOAK = {
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

  await Promise.all(guestPages.map((page, guestIndex) => page.evaluate(async ({
    url, roomCode, index,
  }) => {
    const [{ RoomSignalingClient }, { PrivateRoomClientSession }] = await Promise.all([
      import('/src/net/signalingClient.js'),
      import('/src/net/privateRoomSession.js'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.joinRoom({
      roomCode,
      player: { id: `browser-p${index + 1}`, name: 'Commander' },
    });
    const state = globalThis.__COT_FOUR_SOAK = {
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
    await state.session.submit({ type: 'select_vehicle', specId: 'm1a2' });
    return roomInfo;
  }, { url: signalUrl, roomCode: room.roomCode, index: guestIndex + 1 })));

  await hostPage.waitForFunction(
    (count) => globalThis.__COT_FOUR_SOAK?.session?.runtime?.peers?.size === count - 1,
    { timeout: 20_000 }, PLAYER_COUNT,
  );
  await Promise.all(guestPages.map((page) => page.waitForFunction(
    (count) => globalThis.__COT_FOUR_SOAK?.lastLobby?.players?.length === count,
    { timeout: 20_000 }, PLAYER_COUNT,
  )));
  const lobby = await hostPage.evaluate(() => globalThis.__COT_FOUR_SOAK.lastLobby);
  assert.equal(lobby.players.length, PLAYER_COUNT);
  assert.equal(new Set(lobby.players.map((player) => player.id)).size, PLAYER_COUNT);
  assert.equal(new Set(lobby.players.map((player) => player.name.toLocaleLowerCase('en-US'))).size,
    PLAYER_COUNT, 'colliding four-player names are canonicalized uniquely');
  assert.equal(lobby.players.filter((player) => player.team === 'alpha').length, 2);
  assert.equal(lobby.players.filter((player) => player.team === 'bravo').length, 2);

  await Promise.all([
    hostPage.evaluate(() => globalThis.__COT_FOUR_SOAK.session.command({
      type: 'set_ready', ready: true,
    })),
    ...guestPages.map((page) => page.evaluate(() => globalThis.__COT_FOUR_SOAK.session.submit({
      type: 'set_ready', ready: true,
    }))),
  ]);
  await hostPage.waitForFunction(
    (count) => globalThis.__COT_FOUR_SOAK.lastLobby.players.length === count &&
      globalThis.__COT_FOUR_SOAK.lastLobby.players.every((player) => player.ready),
    { timeout: 15_000 }, PLAYER_COUNT,
  );
  await hostPage.evaluate(() => globalThis.__COT_FOUR_SOAK.session.command({
    type: 'start', matchSeed: 0x4C07CAFE,
  }));
  await Promise.all([
    hostPage.waitForFunction(() => globalThis.__COT_FOUR_SOAK.startingLobby?.phase === 'starting',
      { timeout: 10_000 }),
    ...guestPages.map((page) => page.waitForFunction(
      () => globalThis.__COT_FOUR_SOAK.lastLobby?.phase === 'starting',
      { timeout: 10_000 },
    )),
  ]);

  const hostMatch = await hostPage.evaluate(async () => {
    const { beginPrivateHostMatch } = await import('/src/net/privateMatchHandoff.js');
    const state = globalThis.__COT_FOUR_SOAK;
    state.match = beginPrivateHostMatch({ session: state.session, lobbyState: state.startingLobby });
    state.advanceDurations = [];
    state.match.ready();
    return {
      playerId: state.match.playerId,
      rosterSize: state.match.simulation.entityById.size,
    };
  });
  const guestMatches = await Promise.all(guestPages.map((page) => page.evaluate(async () => {
    const { beginPrivateClientMatch } = await import('/src/net/privateMatchHandoff.js');
    const state = globalThis.__COT_FOUR_SOAK;
    state.match = await beginPrivateClientMatch({
      session: state.session,
      playerId: state.roomInfo.peerId,
      lobbyState: state.lastLobby,
    });
    state.sampleDurations = [];
    state.sampleIdentityStable = true;
    state.match.ready();
    return { playerId: state.match.playerId };
  })));
  const playerIds = [hostMatch.playerId, ...guestMatches.map((match) => match.playerId)];
  assert.equal(hostMatch.rosterSize, PLAYER_COUNT,
    'two-versus-two handoff creates four human-controlled authority entities');
  assert.equal(new Set(playerIds).size, PLAYER_COUNT);

  const handshakeDeadline = Date.now() + 20_000;
  let handshakeReady = false;
  let handshakeState = null;
  while (Date.now() < handshakeDeadline) {
    await pumpHost(hostPage, 50, null);
    const clients = await Promise.all(guestPages.map((page) => page.evaluate(() => {
      const client = globalThis.__COT_FOUR_SOAK.match.client;
      globalThis.__COT_FOUR_SOAK.sample = client.update(performance.now());
      return {
        connected: client.connected,
        closed: client.closed,
        snapshots: client.buffer.snapshots.length,
        errors: client.errors,
      };
    })));
    const authority = await hostPage.evaluate((count) => {
      const host = globalThis.__COT_FOUR_SOAK.match.host;
      return {
        peerCount: host.peers.size,
        invalidMessages: host.stats.invalidMessages,
        peers: [...host.peers.values()].map((peer) => ({
          id: peer.id,
          welcomed: peer.welcomed,
          ready: peer.ready,
        })),
        ready: host.peers.size === count && [...host.peers.values()].every((peer) =>
          peer.welcomed && peer.ready),
      };
    }, PLAYER_COUNT);
    handshakeState = { authority, clients };
    if (authority.ready && clients.every((client) => client.connected && client.snapshots > 0)) {
      handshakeReady = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(handshakeReady, true,
    `all four peers complete match handshake and receive state: ${JSON.stringify(handshakeState)}`);

  const playingDeadline = Date.now() + 15_000;
  let phase = null;
  while (Date.now() < playingDeadline) {
    const state = await pumpHost(hostPage, 50, null);
    phase = state.phase;
    await Promise.all(guestPages.map((page) => page.evaluate(() => {
      globalThis.__COT_FOUR_SOAK.sample =
        globalThis.__COT_FOUR_SOAK.match.update(performance.now());
    })));
    if (phase === 'playing') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(phase, 'playing');
  const startPositions = await hostPage.evaluate(() => Object.fromEntries(
    [...globalThis.__COT_FOUR_SOAK.match.simulation.entityById].map(([id, entity]) => [id, {
      x: entity.state.pos.x,
      z: entity.state.pos.z,
    }]),
  ));

  const playDeadline = performance.now() + durationMs;
  while (performance.now() < playDeadline) {
    await Promise.all([
      pumpHost(hostPage, 1000 / 60, inputFor(0)),
      ...guestPages.map((page, index) => page.evaluate((frame) => {
        const state = globalThis.__COT_FOUR_SOAK;
        state.match.submitInput(frame);
        const startedAt = performance.now();
        const sample = state.match.update(performance.now());
        state.sampleDurations.push(performance.now() - startedAt);
        if (state.sample && sample && state.sample !== sample) state.sampleIdentityStable = false;
        state.sample = sample;
      }, inputFor(index + 1))),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  const settleDeadline = performance.now() + settleMs;
  while (performance.now() < settleDeadline) {
    await Promise.all([
      pumpHost(hostPage, 1000 / 60, inputFor(0, true)),
      ...guestPages.map((page, index) => page.evaluate((frame) => {
        const state = globalThis.__COT_FOUR_SOAK;
        state.match.submitInput(frame);
        state.sample = state.match.update(performance.now());
      }, inputFor(index + 1, true))),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  const authority = await hostPage.evaluate(() => {
    const state = globalThis.__COT_FOUR_SOAK;
    return {
      tick: state.match.host.tick,
      peerCount: state.match.host.peers.size,
      invalidMessages: state.match.host.stats.invalidMessages,
      droppedCatchUpMs: state.match.host.stats.droppedCatchUpMs,
      positions: Object.fromEntries([...state.match.simulation.entityById].map(([id, entity]) =>
        [id, { x: entity.state.pos.x, y: entity.state.pos.y, z: entity.state.pos.z }])),
      averageAdvanceMs: state.advanceDurations.reduce((sum, value) => sum + value, 0) /
        Math.max(1, state.advanceDurations.length),
      maxAdvanceMs: Math.max(...state.advanceDurations),
    };
  });
  const reports = await Promise.all(pages.map((page) => page.evaluate(() => {
    const state = globalThis.__COT_FOUR_SOAK;
    const stats = state.match.client.getStats();
    return {
      playerId: state.match.playerId,
      connected: state.match.client.connected,
      sampleTick: state.sample?.tick ?? null,
      entities: (state.sample?.entities || []).map((entity) => ({
        id: entity.id, x: entity.x, y: entity.y, z: entity.z,
      })),
      stats,
      errors: state.match.client.errors,
      sampleIdentityStable: state.sampleIdentityStable ?? true,
      averageSampleMs: state.sampleDurations
        ? state.sampleDurations.reduce((sum, value) => sum + value, 0) /
          Math.max(1, state.sampleDurations.length)
        : 0,
    };
  })));

  assert.equal(authority.peerCount, PLAYER_COUNT);
  assert.equal(authority.invalidMessages, 0);
  assert.equal(authority.droppedCatchUpMs, 0, 'four-player authority never drops simulation time');
  assert.ok(authority.averageAdvanceMs < 4,
    `authority keeps ample 60 Hz headroom (${authority.averageAdvanceMs.toFixed(2)} ms)`);
  assert.ok(authority.maxAdvanceMs < 33,
    `authority avoids multi-frame stalls (${authority.maxAdvanceMs.toFixed(2)} ms)`);
  assert.deepEqual(browserErrors, [], `browser errors:\n${browserErrors.join('\n')}`);
  const sampleTicks = reports.map((report) => report.sampleTick);
  assert.ok(Math.max(...sampleTicks) - Math.min(...sampleTicks) <= 12,
    `four rendered timelines stay within 200 ms (${sampleTicks.join(', ')})`);
  for (const report of reports) {
    assert.equal(report.connected, true, `${report.playerId} remains connected`);
    assert.deepEqual(report.errors, [], `${report.playerId} has no protocol errors`);
    assert.equal(report.sampleIdentityStable, true, `${report.playerId} reuses its sample frame`);
    assert.ok(report.stats.snapshotPacketsReceived >= 40,
      `${report.playerId} receives a continuous state stream`);
    assert.ok(report.stats.inputAckLag != null && report.stats.inputAckLag <= 20,
      `${report.playerId} input acknowledgement lag is bounded (${report.stats.inputAckLag})`);
    assert.equal(report.stats.pendingInputEdges, 0,
      `${report.playerId} has no unacknowledged fire or consumable edge`);
    assert.ok(report.stats.transportBufferedBytes < 64 * 1024,
      `${report.playerId} transport remains below the state backpressure ceiling`);
    assert.ok(report.stats.buffer.interpolationDelayMs <= 220,
      `${report.playerId} adaptive interpolation remains bounded`);
    assert.ok(report.averageSampleMs < 1,
      `${report.playerId} snapshot sampling stays below 1 ms`);
    if (report.playerId !== hostMatch.playerId) {
      const transport = report.stats.transport || {};
      assert.ok(transport.base?.state?.inputSent > 0,
        `${report.playerId} steering traverses the replaceable WebRTC lane`);
      assert.ok(report.stats.rttMs != null &&
        report.stats.rttMs <= latencyMs * 2 + jitterMs * 2 + 80,
      `${report.playerId} RTT stays inside the configured impairment budget`);
      if (inputLossPercent > 0) {
        assert.ok(transport.droppedInput > 0,
          `${report.playerId} soak exercises input-loss recovery`);
      }
    }
    const own = report.entities.find((entity) => entity.id === report.playerId);
    assert.ok(own, `${report.playerId} always receives its own authority row`);
    const truth = authority.positions[report.playerId];
    assert.ok(Math.hypot(own.x - truth.x, own.y - truth.y, own.z - truth.z) < 1.5,
      `${report.playerId} converges to authority after the drain window`);
    const start = startPositions[report.playerId];
    assert.ok(Math.hypot(truth.x - start.x, truth.z - start.z) > 0.5,
      `${report.playerId} movement reaches authority under loss`);
  }

  for (const team of ['alpha', 'bravo']) {
    const teamIds = lobby.players.filter((player) => player.team === team).map((player) => player.id);
    const targetId = teamIds[0];
    const poses = teamIds.map((viewerId) => reports.find((report) => report.playerId === viewerId)
      .entities.find((entity) => entity.id === targetId));
    assert.ok(poses.every(Boolean), `${team} teammates share visibility`);
    assert.ok(Math.hypot(
      poses[0].x - poses[1].x,
      poses[0].y - poses[1].y,
      poses[0].z - poses[1].z,
    ) < 0.5, `${team} teammates converge on the same shared pose`);
  }

  await Promise.all(guestPages.map((page) => page.evaluate(() => {
    const state = globalThis.__COT_FOUR_SOAK;
    state.match.close('four_player_guest_departure');
    state.session.close('four_player_guest_departure');
  })));
  await hostPage.waitForFunction(() =>
    globalThis.__COT_FOUR_SOAK.match.host.peers.size === 1 &&
    globalThis.__COT_FOUR_SOAK.session.peers.size === 0,
  { timeout: 10_000 });

  console.log(JSON.stringify({
    ok: true,
    players: playerIds,
    profile: { durationMs, settleMs, latencyMs, jitterMs, lossPercent, inputLossPercent },
    authority: {
      tick: authority.tick,
      averageAdvanceMs: Number(authority.averageAdvanceMs.toFixed(3)),
      maxAdvanceMs: Number(authority.maxAdvanceMs.toFixed(3)),
      droppedCatchUpMs: Number(authority.droppedCatchUpMs.toFixed(2)),
    },
    clients: reports.map((report) => ({
      playerId: report.playerId,
      snapshots: report.stats.snapshotPacketsReceived,
      rttMs: report.stats.rttMs == null ? null : Number(report.stats.rttMs.toFixed(1)),
      inputAckLag: report.stats.inputAckLag,
      interpolationDelayMs: Number(report.stats.buffer.interpolationDelayMs.toFixed(1)),
      estimatedLossPercent: Number((report.stats.estimatedSnapshotLoss * 100).toFixed(1)),
      droppedInputs: report.stats.transport?.droppedInput || 0,
      replaceableInputsSent: report.stats.transport?.base?.state?.inputSent || 0,
      averageSampleMs: Number(report.averageSampleMs.toFixed(3)),
    })),
    synchronized: true,
    cleanDeparture: true,
  }, null, 2));
} finally {
  await Promise.all(pages.map(closePageState));
  if (browser) await browser.close().catch(() => {});
  await signaling.close().catch(() => {});
  await vite.close().catch(() => {});
}
