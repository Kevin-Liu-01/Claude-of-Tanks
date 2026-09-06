import assert from 'node:assert/strict';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createSignalingServer } from '../server/signalingServer.ts';
import { parseNetworkSimulationSeed } from '../src/net/adverseNetworkTransport.ts';

const signalOverride = process.argv.find((entry) => entry.startsWith('--signal-url='))?.slice(13);
if (signalOverride && !/^wss?:\/\//.test(signalOverride)) throw new TypeError('signal-url must be WebSocket');

function numericArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : fallback;
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be non-negative`);
  return value;
}

function integerArg(name, fallback, { min, max }) {
  const value = numericArg(name, fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} through ${max}`);
  }
  return value;
}

const playerCount = integerArg('players', 4, { min: 2, max: 14 });
const teamSize = integerArg('team-size', playerCount / 2, { min: 1, max: 7 });
if (playerCount !== teamSize * 2) {
  throw new RangeError('players must equal two complete teams (--players=2*--team-size)');
}
const durationMs = numericArg('duration', 5000);
const settleMs = numericArg('settle', 3000);
const latencyMs = numericArg('latency', 45);
const jitterMs = numericArg('jitter', 15);
const lossPercent = numericArg('loss', 5);
const inputLossPercent = numericArg('input-loss', 3);
const seedArguments = process.argv.filter((entry) => entry.startsWith('--seed='));
if (seedArguments.length > 1) throw new TypeError('seed must specify one uint32');
const seed = seedArguments.length ? parseNetworkSimulationSeed(seedArguments[0].slice(7)) : null;
const rosterTimeoutMs = 20_000 + playerCount * 2_000;
const root = new URL('..', import.meta.url).pathname;
const browserErrors = [];

const vite = await createViteServer({
  root,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: numericArg('port', 0), strictPort: true, hmr: false },
});
const signaling = createSignalingServer({ host: '127.0.0.1', port: 0 });
let browser = null;
let pages = [];
let contexts = [];
let cleaningUp = false;
let runFailed = false;
const diagnosticStartedAt = performance.now();

function diagnostic(event, details = {}) {
  console.error('[multiplayer-soak:diagnostic]', JSON.stringify({
    event,
    elapsedMs: Math.round(performance.now() - diagnosticStartedAt),
    cleaningUp,
    ...details,
  }));
}

function observePage(page, label) {
  page.on('pageerror', (error) => browserErrors.push(`${label}: ${error.stack || error.message}`));
  page.on('error', (error) => diagnostic('page_crash', { player: label, message: error.message }));
  page.on('close', () => {
    if (!cleaningUp) diagnostic('page_closed_before_cleanup', { player: label });
  });
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(`${label}: ${message.text()}`);
  });
}

function inputFor(playerId, lobby, brake = false) {
  const player = lobby.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`missing lobby player ${playerId}`);
  const teammates = lobby.players.filter((candidate) => candidate.team === player.team);
  const laneIndex = teammates.findIndex((candidate) => candidate.id === playerId);
  const center = (teammates.length - 1) / 2;
  const laneOffset = center > 0 ? (laneIndex - center) / center : 0;
  return {
    throttle: brake ? 0 : 1,
    steer: brake ? 0 : laneOffset * 0.14,
    brake,
    fire: false,
    aimYaw: player.team === 'alpha' ? 0 : Math.PI,
    aimPitch: 0,
    shellSlot: 0,
    actionBits: 0,
  };
}

async function closePageState(page) {
  if (!page || page.isClosed()) return;
  await page.evaluate(() => {
    const state = globalThis.__COT_ROSTER_SOAK;
    if (!state) return;
    try { state.match?.close('roster_soak_complete'); } catch (_) { /* best effort */ }
    try { state.session?.close('roster_soak_complete'); } catch (_) { /* best effort */ }
    try { state.signaling?.close('roster_soak_complete'); } catch (_) { /* best effort */ }
  }).catch(() => {});
}

async function pumpHost(hostPage, elapsedMs, input) {
  return hostPage.evaluate(({ elapsed, frame }) => {
    const state = globalThis.__COT_ROSTER_SOAK;
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
  const signalAddress = signalOverride ? null : await signaling.listen();
  const viteAddress = vite.httpServer.address();
  const origin = `http://127.0.0.1:${viteAddress.port}`;
  const signalUrl = signalOverride || `ws://127.0.0.1:${signalAddress.port}/signal`;
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
  browser.on('disconnected', () => {
    if (!cleaningUp) diagnostic('browser_disconnected_before_cleanup');
  });
  browser.process()?.once('exit', (code, signal) => {
    if (!cleaningUp || runFailed) diagnostic('browser_process_exit', { code, signal });
  });
  pages = await Promise.all(Array.from({ length: playerCount }, async (_, index) => {
    // Every participant receives an isolated browser profile. This prevents
    // one player's warmed cache or persisted identity from making later joins
    // look healthier than a real first visit from another machine.
    const context = await browser.createBrowserContext();
    contexts[index] = context;
    const page = await context.newPage();
    observePage(page, `player-${index + 1}`);
    // Independent streams per guest; the same explicit master seed and player
    // index reproduce draws, not native browser timer/network scheduling.
    const netSeed = seed === null ? null : (seed + Math.imul(index, 0x9e3779b9)) >>> 0;
    const query = index === 0 ? '' : `?netSim=1&netLatency=${latencyMs}` +
      `&netJitter=${jitterMs}&netLoss=${lossPercent}&netInputLoss=${inputLossPercent}` +
      (netSeed === null ? '' : `&netSeed=${netSeed}`);
    await page.goto(`${origin}/tools/multiplayer-browser-soak.html${query}`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    });
    return page;
  }));
  console.log(`[multiplayer-soak] ${playerCount} browser pages ready`);
  const [hostPage, ...guestPages] = pages;

  const room = await hostPage.evaluate(async ({ url, requestedTeamSize }) => {
    const [{ RoomSignalingClient }, { PrivateRoomHostSession }] = await Promise.all([
      import('/src/net/signalingClient.ts'),
      import('/src/net/privateRoomSession.ts'),
    ]);
    const signalingClient = new RoomSignalingClient({ url });
    const roomInfo = await signalingClient.createRoom({
      player: { id: 'browser-p1', name: 'Commander' },
      mode: 'lan',
      maxPlayers: 14,
    });
    const state = globalThis.__COT_ROSTER_SOAK = {
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
      teamSize: requestedTeamSize,
      onStart: (lobby) => { state.startingLobby = lobby; },
      onError: (error) => state.errors.push(error.message),
    });
    state.unsubscribe = state.session.runtime.onState((lobby) => { state.lastLobby = lobby; });
    return roomInfo;
  }, { url: signalUrl, requestedTeamSize: teamSize });
  console.log(`[multiplayer-soak] host room ${room.roomCode} ready`);

  await Promise.all(guestPages.map(async (page, guestIndex) => {
    try {
      return await page.evaluate(async ({ url, roomCode, index, timeoutMs }) => {
        const state = globalThis.__COT_ROSTER_SOAK = {
          signaling: null,
          roomInfo: null,
          lastLobby: null,
          errors: [],
          stage: 'loading_modules',
        };
        const [{ RoomSignalingClient }, { PrivateRoomClientSession }] = await Promise.all([
          import('/src/net/signalingClient.ts'),
          import('/src/net/privateRoomSession.ts'),
        ]);
        state.stage = 'joining_signaling_room';
        const signalingClient = new RoomSignalingClient({ url });
        state.signaling = signalingClient;
        const roomInfo = await signalingClient.joinRoom({
          roomCode,
          player: { id: `browser-p${index + 1}`, name: 'Commander' },
        });
        state.roomInfo = roomInfo;
        state.stage = 'opening_webrtc_channels';
        state.session = new PrivateRoomClientSession({
          signaling: signalingClient,
          roomInfo,
          onError: (error) => state.errors.push(error.message),
        });
        let timer = null;
        try {
          state.runtime = await Promise.race([
            state.session.ready,
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error(
                `WebRTC channels did not open within ${Math.round(timeoutMs / 1000)} seconds`,
              )), timeoutMs);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        state.stage = 'submitting_lobby_profile';
        state.unsubscribe = state.runtime.onState((lobby) => { state.lastLobby = lobby; });
        await state.session.submit({ type: 'select_vehicle', specId: 'm1a2' });
        state.stage = 'lobby_ready';
        return roomInfo;
      }, {
        url: signalUrl,
        roomCode: room.roomCode,
        index: guestIndex + 1,
        timeoutMs: rosterTimeoutMs,
      });
    } catch (error) {
      // Record the original rejection before another browser call can delay
      // its report or a sibling failure can start shared-browser cleanup.
      diagnostic('guest_evaluate_rejected', {
        player: `player-${guestIndex + 2}`,
        message: error.stack || error.message,
        pageClosed: page.isClosed(),
        browserConnected: browser.connected,
      });
      const details = await page.evaluate(() => ({
        stage: globalThis.__COT_ROSTER_SOAK?.stage || 'unknown',
        errors: globalThis.__COT_ROSTER_SOAK?.errors || [],
      })).catch(() => ({ stage: 'page_unavailable', errors: [] }));
      throw new Error(`player-${guestIndex + 2} failed during ${details.stage}: ${error.message}; ` +
        `session errors=${JSON.stringify(details.errors)}`);
    }
  }));
  console.log(`[multiplayer-soak] all ${guestPages.length} guest WebRTC sessions ready`);

  await hostPage.waitForFunction(
    (count) => globalThis.__COT_ROSTER_SOAK?.session?.runtime?.peers?.size === count - 1,
    { timeout: rosterTimeoutMs }, playerCount,
  );
  await Promise.all(guestPages.map((page) => page.waitForFunction(
    (count) => globalThis.__COT_ROSTER_SOAK?.lastLobby?.players?.length === count,
    { timeout: rosterTimeoutMs }, playerCount,
  )));
  const lobby = await hostPage.evaluate(() => globalThis.__COT_ROSTER_SOAK.lastLobby);
  assert.equal(lobby.players.length, playerCount);
  assert.equal(new Set(lobby.players.map((player) => player.id)).size, playerCount);
  assert.equal(new Set(lobby.players.map((player) => player.name.toLocaleLowerCase('en-US'))).size,
    playerCount, 'colliding roster names are canonicalized uniquely');
  assert.equal(lobby.players.filter((player) => player.team === 'alpha').length, teamSize);
  assert.equal(lobby.players.filter((player) => player.team === 'bravo').length, teamSize);
  console.log(`[multiplayer-soak] balanced ${teamSize}v${teamSize} lobby synchronized`);

  await Promise.all([
    hostPage.evaluate(() => globalThis.__COT_ROSTER_SOAK.session.command({
      type: 'set_ready', ready: true,
    })),
    ...guestPages.map((page) => page.evaluate(() => globalThis.__COT_ROSTER_SOAK.session.submit({
      type: 'set_ready', ready: true,
    }))),
  ]);
  await hostPage.waitForFunction(
    (count) => globalThis.__COT_ROSTER_SOAK.lastLobby.players.length === count &&
      globalThis.__COT_ROSTER_SOAK.lastLobby.players.every((player) => player.ready),
    { timeout: rosterTimeoutMs }, playerCount,
  );
  await hostPage.evaluate(() => globalThis.__COT_ROSTER_SOAK.session.command({
    type: 'start', matchSeed: 0x4C07CAFE,
  }));
  const startDeadline = Date.now() + rosterTimeoutMs;
  let startState = null;
  while (Date.now() < startDeadline) {
    const [hostStarting, guests] = await Promise.all([
      hostPage.evaluate(() => globalThis.__COT_ROSTER_SOAK.startingLobby),
      Promise.all(guestPages.map((page) => page.evaluate(() => {
        const state = globalThis.__COT_ROSTER_SOAK;
        return {
          playerId: state.roomInfo.peerId,
          phase: state.lastLobby?.phase || null,
          revision: state.lastLobby?.revision ?? null,
          readyPlayers: state.lastLobby?.players?.filter((player) => player.ready).length ?? 0,
          closed: state.session.runtime.closed,
          errors: [...state.session.runtime.errors],
          transport: state.session.runtime.getStats().transport,
        };
      }))),
    ]);
    startState = { hostPhase: hostStarting?.phase || null, guests };
    if (hostStarting?.phase === 'starting' &&
        guests.every((guest) => guest.phase === 'starting')) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(startState?.hostPhase, 'starting',
    `host enters starting phase: ${JSON.stringify(startState)}`);
  assert.equal(startState.guests.every((guest) => guest.phase === 'starting'), true,
    `all ${guestPages.length} guests receive starting state: ${JSON.stringify(startState)}`);
  console.log(`[multiplayer-soak] all ${playerCount} peers received the start transition`);

  const hostMatch = await hostPage.evaluate(async () => {
    const { beginPrivateHostMatch } = await import('/src/net/privateMatchHandoff.ts');
    const state = globalThis.__COT_ROSTER_SOAK;
    state.match = beginPrivateHostMatch({ session: state.session, lobbyState: state.startingLobby });
    state.advanceDurations = [];
    state.match.ready();
    return {
      playerId: state.match.playerId,
      rosterSize: state.match.simulation.entityById.size,
    };
  });
  const guestMatches = await Promise.all(guestPages.map((page) => page.evaluate(async () => {
    const { beginPrivateClientMatch } = await import('/src/net/privateMatchHandoff.ts');
    const state = globalThis.__COT_ROSTER_SOAK;
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
  assert.equal(hostMatch.rosterSize, playerCount,
    `${teamSize}-versus-${teamSize} handoff creates ${playerCount} human authority entities`);
  assert.equal(new Set(playerIds).size, playerCount);
  console.log(`[multiplayer-soak] ${playerCount}-human authority handoff complete`);

  const handshakeDeadline = Date.now() + rosterTimeoutMs;
  let handshakeReady = false;
  let handshakeState = null;
  while (Date.now() < handshakeDeadline) {
    await pumpHost(hostPage, 50, null);
    const clients = await Promise.all(guestPages.map((page) => page.evaluate(() => {
      const client = globalThis.__COT_ROSTER_SOAK.match.client;
      globalThis.__COT_ROSTER_SOAK.sample = client.update(performance.now());
      return {
        connected: client.connected,
        closed: client.closed,
        snapshots: client.buffer.snapshots.length,
        errors: client.errors,
      };
    })));
    const authority = await hostPage.evaluate((count) => {
      const host = globalThis.__COT_ROSTER_SOAK.match.host;
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
    }, playerCount);
    handshakeState = { authority, clients };
    if (authority.ready && clients.every((client) => client.connected && client.snapshots > 0)) {
      handshakeReady = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(handshakeReady, true,
    `all ${playerCount} peers complete match handshake and receive state: ` +
    JSON.stringify(handshakeState));
  console.log(`[multiplayer-soak] all ${playerCount} match handshakes complete`);

  const playingDeadline = Date.now() + rosterTimeoutMs;
  let phase = null;
  while (Date.now() < playingDeadline) {
    const state = await pumpHost(hostPage, 50, null);
    phase = state.phase;
    await Promise.all(guestPages.map((page) => page.evaluate(() => {
      globalThis.__COT_ROSTER_SOAK.sample =
        globalThis.__COT_ROSTER_SOAK.match.update(performance.now());
    })));
    if (phase === 'playing') break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.equal(phase, 'playing');
  const startPositions = await hostPage.evaluate(() => Object.fromEntries(
    [...globalThis.__COT_ROSTER_SOAK.match.simulation.entityById].map(([id, entity]) => [id, {
      x: entity.state.pos.x,
      z: entity.state.pos.z,
    }]),
  ));

  const playDeadline = performance.now() + durationMs;
  while (performance.now() < playDeadline) {
    await Promise.all([
      pumpHost(hostPage, 1000 / 60, inputFor(hostMatch.playerId, lobby)),
      ...guestPages.map((page, index) => page.evaluate((frame) => {
        const state = globalThis.__COT_ROSTER_SOAK;
        state.match.submitInput(frame);
        const startedAt = performance.now();
        const sample = state.match.update(performance.now());
        state.sampleDurations.push(performance.now() - startedAt);
        if (state.sample && sample && state.sample !== sample) state.sampleIdentityStable = false;
        state.sample = sample;
      }, inputFor(guestMatches[index].playerId, lobby))),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  const settleDeadline = performance.now() + settleMs;
  while (performance.now() < settleDeadline) {
    await Promise.all([
      pumpHost(hostPage, 1000 / 60, inputFor(hostMatch.playerId, lobby, true)),
      ...guestPages.map((page, index) => page.evaluate((frame) => {
        const state = globalThis.__COT_ROSTER_SOAK;
        state.match.submitInput(frame);
        state.sample = state.match.update(performance.now());
      }, inputFor(guestMatches[index].playerId, lobby, true))),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }

  const authority = await hostPage.evaluate(() => {
    const state = globalThis.__COT_ROSTER_SOAK;
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
    const state = globalThis.__COT_ROSTER_SOAK;
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

  assert.equal(authority.peerCount, playerCount);
  assert.equal(authority.invalidMessages, 0);
  assert.equal(authority.droppedCatchUpMs, 0,
    `${playerCount}-player authority never drops simulation time`);
  assert.ok(authority.averageAdvanceMs < 4,
    `authority keeps ample 60 Hz headroom (${authority.averageAdvanceMs.toFixed(2)} ms)`);
  assert.ok(authority.maxAdvanceMs < 33,
    `authority avoids multi-frame stalls (${authority.maxAdvanceMs.toFixed(2)} ms)`);
  assert.deepEqual(browserErrors, [], `browser errors:\n${browserErrors.join('\n')}`);
  const sampleTicks = reports.map((report) => report.sampleTick);
  assert.ok(Math.max(...sampleTicks) - Math.min(...sampleTicks) <= 12,
    `${playerCount} rendered timelines stay within 200 ms (${sampleTicks.join(', ')})`);
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
    const maxSharedPoseError = poses.length > 1
      ? Math.max(...poses.slice(1).map((pose) => Math.hypot(
        poses[0].x - pose.x,
        poses[0].y - pose.y,
        poses[0].z - pose.z,
      )))
      : 0;
    assert.ok(maxSharedPoseError < 0.5,
      `${team} teammates converge on one shared pose (${maxSharedPoseError.toFixed(3)} m)`);
  }

  await Promise.all(guestPages.map((page) => page.evaluate(() => {
    const state = globalThis.__COT_ROSTER_SOAK;
    state.match.close('roster_soak_guest_departure');
    state.session.close('roster_soak_guest_departure');
  })));
  await hostPage.waitForFunction(() =>
    globalThis.__COT_ROSTER_SOAK.match.host.peers.size === 1 &&
    globalThis.__COT_ROSTER_SOAK.session.peers.size === 0,
  { timeout: rosterTimeoutMs });

  console.log(JSON.stringify({
    ok: true,
    players: playerIds,
    profile: {
      playerCount,
      teamSize,
      durationMs,
      settleMs,
      latencyMs,
      jitterMs,
      lossPercent,
      inputLossPercent,
      seed,
      seedDerivation: seed === null ? null : 'uint32(seed + playerIndex * 0x9e3779b9)',
      reorderMeasurement: 'stale sequence completion; outgoing base admission, incoming decoded delivery',
      freshBrowserContexts: true,
    },
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
      netSeed: report.stats.transport?.netSeed ?? null,
      reorderedOutgoingInput: report.stats.transport?.reorderedOutgoingInput || 0,
      reorderedOutgoingState: report.stats.transport?.reorderedOutgoingState || 0,
      reorderedIncomingInput: report.stats.transport?.reorderedIncomingInput || 0,
      reorderedIncomingState: report.stats.transport?.reorderedIncomingState || 0,
      replaceableInputsSent: report.stats.transport?.base?.state?.inputSent || 0,
      averageSampleMs: Number(report.averageSampleMs.toFixed(3)),
    })),
    synchronized: true,
    cleanDeparture: true,
  }, null, 2));
} catch (error) {
  runFailed = true;
  diagnostic('run_failed_before_cleanup', {
    message: error.stack || error.message,
    browserErrors: browserErrors.slice(0, 20),
  });
  throw error;
} finally {
  cleaningUp = true;
  await Promise.all(pages.map(closePageState));
  if (browser) await browser.close().catch(() => {});
  await Promise.all(contexts.map((context) => context?.close().catch(() => {})));
  await signaling.close().catch(() => {});
  await vite.close().catch(() => {});
}
