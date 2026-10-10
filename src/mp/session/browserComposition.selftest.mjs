// The Multiplayer v2 browser launch over injected ports: a scripted session owner
// and a recorded presentation drive the composition through a room start, the
// covered load, prediction, the warm order, activation, the reveal, the verdict,
// the lobby re-attaching for a rematch, the Garage return with the room kept,
// an entry failure, a lost match link, the room closing mid-battle, an explicit
// leave and the match-start timeout.
import assert from 'node:assert/strict';
import { createBrowserComposition, createControlSampler } from './browserComposition.ts';
import { MULTIPLAYER_V2_SESSION } from './playMenuAdapter.ts';
import { roomToLobby } from '../room/roomPolicy.ts';
import { ACTION_BITS, CLOSE_REASON, PROTOCOL_VERSION, TEAM, VERDICT } from '../wire/index.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const settle = async (times = 6) => { for (let index = 0; index < times; index++) await tick(); };

// ------------------------------------------------------------ fixtures

function snapshot({ roomCode = 'ABC123', adminId = 'me', phase = 'waiting', round = 0, mapId = 'verdant', mode = 'lan', lastResult = null } = {}) {
  const player = (id, name, team, seat, camo, isAdmin) => ({
    id, name, team, seat, specId: 'm1a2', equipment: [], camo, ready: true, connected: true, isAdmin, joinedAt: 1,
  });
  return {
    v: 2, roomCode, mode, phase, adminId, revision: 1, round,
    settings: { gameMode: 'standard', mapId, teamSize: 1, maxSpectators: 2, botsFill: true, allowTeamSwitch: true, locked: false, arrangement: null, campaignOperationId: null },
    players: [player('me', 'Me', 'alpha', 0, 'summer', adminId === 'me'), player('foe', 'Foe', 'bravo', 1, 'winter', adminId === 'foe')],
    match: null, lastResult, createdAt: 1, touchedAt: 1,
  };
}

function makeRoomSession(calls, initial = snapshot()) {
  const lobbyListeners = new Set();
  const closedListeners = new Set();
  let room = initial;
  const phaseListeners = new Set();
  const client = {
    playerId: 'me',
    phase: 'joined',
    get room() { return room; },
    matchStart: null,
    // the network status model's room source (a real RoomClient carries these)
    seat: 0,
    region: 'lan',
    rttMs: 18,
    onPhase(listener) { phaseListeners.add(listener); return () => phaseListeners.delete(listener); },
    onState(listener) { lobbyListeners.add((lobby, next) => listener(next)); return () => {}; },
    onClosed() { return () => {}; },
    emitPhase(change) { client.phase = change.phase; for (const listener of [...phaseListeners]) listener(change); },
    async leave() { calls.push('client.leave'); },
    dispose() { calls.push('client.dispose'); client.phase = 'closed'; },
  };
  const session = {
    [MULTIPLAYER_V2_SESSION]: true,
    roomInfo: { get roomCode() { return room.roomCode; }, peerId: 'me', get hostId() { return room.adminId; }, hostName: 'Me', mode: initial.mode },
    client,
    get lobby() { return roomToLobby(room); },
    lastMatchStart: null,
    command: async (command) => { calls.push(`command:${command.type}`); return {}; },
    submit: async (command) => { calls.push(`command:${command.type}`); return {}; },
    chat: async () => {},
    onLobby(listener) { lobbyListeners.add(listener); return () => lobbyListeners.delete(listener); },
    onChat() { return () => {}; },
    onClosed(listener) { closedListeners.add(listener); return () => closedListeners.delete(listener); },
    close(reason) { calls.push(`session.close:${reason}`); },
    // test drivers
    publish(next) { room = next; for (const listener of lobbyListeners) listener(roomToLobby(next), next); },
    closeFromRoom(reason) { for (const listener of closedListeners) listener(reason); },
  };
  return session;
}

function matchStart(round = 1, mapId = 'alpine') {
  return { matchId: `match-${round}`, round, mapId, mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 'tok', matchUrl: '/match', expiresAt: 0 };
}

function welcomeMessage() {
  return {
    type: 3, protocolVersion: PROTOCOL_VERSION, tickHz: 60, snapshotHz: 30, seat: 0, entityId: 1, team: TEAM.ALPHA, serverTick: 0, serverTimeMs: 0, seed: 99,
    capabilities: 0, roomId: 'ABC123', mapId: 'alpine', mode: 'standard', rulesetJson: '{}',
    roster: [
      { entityId: 1, seat: 0, team: TEAM.ALPHA, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a2' },
      { entityId: 2, seat: 1, team: TEAM.BRAVO, bot: false, connected: true, playerId: 'foe', name: 'Foe', specId: 'm1a2' },
    ],
  };
}

function frame({ verdict = VERDICT.NONE, events = [], ownShots = [] } = {}) {
  return {
    tick: 10, renderTimeMs: 0, entities: [], shells: [], meta: { phase: 2, verdict, verdictReason: '', battleTimeMs: 0, countdownMs: 0 },
    modeStateJson: null, destroyed: [], destructibleRevision: 0,
    viewer: { entityId: 1, playerId: 'me', state: null, row: null, viewer: null, authorityTick: 0, authorityReceivedAtMs: null, predictedShot: null },
    events, ownShots, extrapolatedMs: 0, phase: 'live',
  };
}

/** The scripted session owner: the receipt enters rounds, welcomes, frames and verdicts by hand. */
function createScriptedSession(options, record) {
  const listeners = { phase: new Set(), verdict: new Set(), frame: new Set() };
  const session = {
    options,
    phase: 'lobby',
    round: null,
    presentation: null,
    started: false,
    rounds: 0,
    verdicts: 0,
    start() { session.started = true; },
    onPhase(listener) { listeners.phase.add(listener); return () => listeners.phase.delete(listener); },
    onVerdict(listener) { listeners.verdict.add(listener); return () => listeners.verdict.delete(listener); },
    onFrame(listener) { listeners.frame.add(listener); return () => listeners.frame.delete(listener); },
    update(nowMs, elapsedS) { record.push(['update', nowMs, elapsedS]); return null; },
    /** The match client as the status model and the drop path read it (a stub: no transport, no frames). */
    match: null,
    /** A Garage return kept the room: re-enter the match the seat still holds a match_start for. */
    async enterMatch(payload) {
      record.push(`enterMatch:${payload.matchId}`);
      return session.enter({ matchStart: payload, room: options.room.room, spectator: false, playerId: 'me' });
    },
    async leaveMatch(reason = 'leave') {
      record.push(`leaveMatch:${reason}`);
      const presentation = session.presentation;
      session.presentation = null;
      session.round = null;
      presentation?.dispose();
      session.setPhase('lobby', reason);
    },
    dispose() { record.push('session.dispose'); void session.leaveMatch('dispose'); },
    stats() {
      return { phase: session.phase, round: session.round?.matchStart.round ?? 0, matchId: session.round?.matchStart.matchId ?? null, spectator: false, match: null, rounds: session.rounds, verdicts: session.verdicts };
    },
    setPhase(phase, detail = '') {
      if (session.phase === phase) return;
      session.phase = phase;
      for (const listener of listeners.phase) listener({ phase, detail });
    },
    /** The server closed the seat: the client (still attached) names the wire reason, then the session reads lost. */
    dropSeat(reason, detail = '') {
      session.match = {
        lastCloseReason: reason, lastCloseDetail: detail, phase: 'closed', welcome: {}, lastAuthorityReceivedAtMs: null, predictorStats: null,
        bytesInPerSecond: 0, bytesOutPerSecond: 0,
        transport: { state: 'closed', stats: { reconnects: 0 }, onState: () => () => {} },
        serverClock: { rttMs: 40, rttJitterMs: 2 }, interpolator: { delay: 100, bufferedFrames: 2 }, snapshots: { acceptedCount: 0, estimatedMissingCount: 0 },
        onPhase: () => () => {},
      };
      session.setPhase('lost', detail);
    },
    async enter(round) {
      session.round = round;
      session.setPhase('loading', round.matchStart.matchId);
      try {
        session.presentation = await options.createPresentation(round);
      } catch (error) {
        session.round = null;
        session.setPhase('lobby', 'presentation failed');
        throw error;
      }
      session.rounds++;
      session.setPhase('match', round.matchStart.matchId);
      return session.presentation;
    },
    async welcome(welcome = welcomeMessage()) {
      const own = welcome.roster.find((entry) => entry.entityId === welcome.entityId);
      await session.presentation.adapter.applyRoster(welcome.roster, {
        ownEntityId: welcome.entityId, ownPlayerId: own?.playerId ?? '', roomId: welcome.roomId, mapId: welcome.mapId, mode: welcome.mode, rulesetJson: welcome.rulesetJson,
      });
      await session.presentation.onWelcome?.(welcome);
    },
    frame(next = frame()) {
      session.presentation.adapter.applyFrame(next);
      for (const listener of listeners.frame) listener(next);
    },
    verdict(verdict, reason) {
      session.presentation.onVerdict?.(verdict, reason);
      session.verdicts++;
      for (const listener of listeners.verdict) listener({ verdict, reason, matchId: session.round?.matchStart.matchId ?? '' });
      session.setPhase('ended', reason);
    },
  };
  return session;
}

/** The recorded presentation: actors from the roster, the game surfaces of a mounted frame, a verdict on the bus. */
function createRecordedPresentation(options, record) {
  const actors = new Map();
  let ownEntityId = -1;
  let ready = Promise.resolve();
  const presentation = {
    options,
    actors,
    roster: [],
    frames: 0,
    disposed: false,
    get ownActor() {
      if (options.spectator) return null;
      for (const actor of actors.values()) if (actor.entityId === ownEntityId) return actor;
      return null;
    },
    applyRoster(entries, context) {
      ownEntityId = context.ownEntityId;
      ready = ready.then(async () => {
        await tick();
        for (const entry of entries) {
          if (actors.has(entry.playerId)) continue;
          actors.set(entry.playerId, {
            id: entry.playerId, entityId: entry.entityId, specId: entry.specId, spec: { id: entry.specId, name: entry.specId },
            camo: options.camoFor(entry), isPlayer: entry.entityId === context.ownEntityId,
            state: { pos: { x: 10, y: 1, z: -4 }, yaw: 0.5 },
            combat: { destroyed: false },
            input: { throttle: 0, steer: 0, brake: false, fire: false, aimLocked: false, aimPoint: { x: 10, y: 1, z: 96 }, shellSlot: 0 },
            visual: { root: {}, setGroundSampler(sampler) { record.push(`ground:${entry.playerId}:${typeof sampler}`); }, dispose() {} },
          });
          options.onRosterProgress?.(actors.size / entries.length, entry.specId);
        }
        presentation.roster = [...actors.values()];
      });
      return ready;
    },
    rosterReady() { return ready; },
    applyFrame() {
      presentation.frames++;
      options.game.tanks = [...actors.values()];
      options.game.tankById = actors;
      options.game.player = presentation.ownActor;
    },
    applyEvent() {},
    applyVerdict(verdict, reason) {
      if (options.game.result) return;
      options.game.result = verdict === VERDICT.ALPHA ? 'victory' : verdict === VERDICT.BRAVO ? 'defeat' : 'draw';
      options.game.resultReason = reason;
      options.bus.emit('battle:ended', { result: options.game.result, reason, network: true });
    },
    setVisibility() {},
    predictionWorld() {
      const heightField = options.worldCollision?.heightField;
      return heightField ? { heightField, collide: null, contactGeom: null } : null;
    },
    mount() {},
    unmount() {},
    endDisconnected() {
      record.push('endDisconnected');
      if (options.game.result) return false;
      options.game.result = 'draw';
      options.game.resultReason = 'network_disconnect';
      return true;
    },
    setPerspective(entityId) { record.push(`perspective:${entityId}`); return true; },
    // the real presentation's rule (authorityObstacles.ts, 2026-10-08): every world shares the authority's index space —
    // a phone's places what the desktop places — unless shown otherwise (the harness's world says so)
    get sharesAuthorityIndices() { return options.worldCollision?.sharesIndices !== false; },
    setAuthorityObstacles(identity) { record.push('presentation.authorityObstacles'); presentation.authorityIdentity = identity; },
    dispose() { record.push('presentation.dispose'); presentation.disposed = true; },
  };
  return presentation;
}

function createHarness({ loadWorld, blackWatchdog, compile, entryTimeoutMs = 120_000, p2p = null, layoutTier = null, sharesIndices = true, loadAuthorityObstacles = null } = {}) {
  const calls = [];
  const bus = [];
  const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'verdant', phase: 'garage', gameMode: 'standard', matchModeState: null };
  const sessions = [];
  const presentations = [];
  const menu = {
    attached: null, updates: 0, detached: 0, failures: [],
    attachActiveRoom(adapter) { menu.attached = adapter; calls.push(`menu.attach:${adapter.role}`); },
    updateActiveRoom(state) { menu.updates++; calls.push(`menu.update:${state.phase}`); return true; },
    detachActiveRoom() { menu.detached++; menu.attached = null; calls.push('menu.detach'); },
    showRoomFailure(reason, mode) { menu.failures.push([reason, mode]); calls.push(`menu.failure:${reason}:${mode}`); },
  };
  const battleLoad = {
    visible: false, progressLabels: [], shows: [],
    show(info) { battleLoad.visible = true; battleLoad.shows.push(info); calls.push(`load.show:${info.mapName}`); },
    rosters() {},
    progress(fraction, label) { battleLoad.progressLabels.push([fraction, label]); },
    async hide() { battleLoad.visible = false; calls.push('load.hide'); },
  };
  const lifecycle = {
    pending: false, covered: false, reveals: 0,
    async run(task, busy) { if (lifecycle.pending) return busy; lifecycle.pending = true; try { return await task(); } finally { lifecycle.covered = false; lifecycle.pending = false; } },
    coverRendering() { lifecycle.covered = true; calls.push('cover'); },
    uncoverRendering() { lifecycle.covered = false; calls.push('uncover'); },
    async primeReveal() { lifecycle.reveals++; calls.push('primeReveal'); return { primed: true }; },
  };
  const garageStatus = [];
  const roomStates = [];
  const statusSurfaces = [];
  const statusEvents = [];
  const statusReports = [];
  const timers = [];
  const worldCollision = { heightField: { getHeightAt: () => 0 }, getObstacles: () => [], layoutTier, sharesIndices };
  const ports = {
    lifecycle,
    load: {
      battleLoad,
      audio: { resume: () => calls.push('audio.resume'), loadingOn: (on) => calls.push(`audio.loading:${on}`), ambientOn: (on) => calls.push(`audio.ambient:${on}`) },
      lighting: { setFarCascadeDormant: (dormant) => calls.push(`farCascadeDormant:${dormant}`) },
      ensureBattleVisuals: async () => { calls.push('ensureBattleVisuals'); },
      loadModules: async () => { calls.push('loadModules'); },
      loadWorld: loadWorld ?? (async (mapId, onProgress, variant) => { calls.push(`loadWorld:${mapId}:${variant}`); onProgress(0.5, 'Half'); await tick(); }),
      nextFrame: async () => { calls.push('nextFrame'); },
      setAdaptiveSuspended: (value) => calls.push(`adaptive:${value}`),
      recordTrace: (trace) => { ports.trace = trace; },
      recordEntryFailure: (failure) => { ports.failure = failure; },
      recordSlowEntry: (beacon) => { calls.push(`slowEntry:${beacon.stage}:${beacon.code}:${beacon.pending}`); (ports.slowEntries ??= []).push(beacon); },
      ...(loadAuthorityObstacles ? { loadAuthorityObstacles: (mapId, signal) => { calls.push(`authorityObstacles:${mapId}:${signal instanceof AbortSignal}`); return loadAuthorityObstacles(mapId, signal); } } : {}),
    },
    roster: {
      getMap: (mapId) => ({ name: `Map ${mapId}`, thumb: `${mapId}.jpg`, biome: mapId }),
      rows: (players, team, viewerId) => players.filter((player) => player.team === team).map((player) => ({ id: player.specId, name: player.name, isPlayer: player.id === viewerId })),
      vehicleName: (specId) => `Vehicle ${specId}`,
      emitBattleStart: (payload) => calls.push(`battleStart:${payload.playerId}:${payload.specId}:${payload.mapId}`),
      setCamoBiome: (mapId) => calls.push(`camoBiome:${mapId}`),
    },
    scene: {
      engineCtx: { scene: { add() {} }, anisotropy: 1 },
      game,
      bus: { emit: (type, payload) => bus.push({ type, payload }) },
      getWorldCollision: () => worldCollision,
      groundSampler: () => 0,
      getFx: () => ({ setFrozen: () => {}, resetAll: () => {} }),
      resetRoundState: () => { game.result = null; game.resultReason = null; game.timeS = 0; game.preBattleS = Infinity; calls.push('resetRoundState'); },
      clearVehicleDecals: () => {},
      onVisualReady: () => {},
    },
    warm: {
      atmosphere: async (initial) => calls.push(`warm.atmosphere:${initial.meta?.weatherSeed}`),
      nightLighting: async () => calls.push('warm.nightLighting'),
      terrain: async (view) => calls.push(`warm.terrain:${view.entities.size}`),
      wrecks: async (view) => calls.push(`warm.wrecks:${view.entities.size}`),
      playerPanel: async (view, viewerId) => calls.push(`warm.panel:${view.entities.get(viewerId)?.specId}`),
      compile: compile ?? (async () => { calls.push('warm.compile'); return { preparation: { status: 'complete', pending: 0 } }; }),
      openingEffects: async (fx, view) => calls.push(`warm.fx:${typeof fx.resetAll}:${view.entities.size}`),
      shotCards: (specIds) => calls.push(`warm.shotCards:${specIds.join(',')}`),
      presentation: async () => calls.push('warm.presentation'),
      finalShadows: async () => calls.push('warm.finalShadows'),
    },
    presentation: {
      activate: (request) => { ports.activation = request; game.phase = 'battle'; calls.push(`activate:${request.viewerId}:${request.own.specId}:${request.mapId}:${request.spectator}`); },
      setWaitingForPeers: (waiting) => calls.push(`waiting:${waiting}`),
      setGarageLighting: (active) => calls.push(`garageLighting:${active}`),
      runBlackWatchdog: blackWatchdog ?? (async () => { calls.push('blackWatchdog'); return { failed: false }; }),
    },
    room: {
      getMenu: () => Promise.resolve(menu),
      setGarageStatus: (status) => { garageStatus.push(status); },
      emitRoomState: (payload) => { roomStates.push(payload); },
      clearInput: () => calls.push('clearInput'),
      enterGarage: async () => { game.phase = 'garage'; calls.push('enterGarage'); },
      returnToGarage: async () => { game.phase = 'garage'; calls.push('returnToGarage'); },
      getPhase: () => game.phase,
      hasResult: () => !!game.result,
    },
    status: {
      mount() {
        const surface = {
          sets: [], toggles: [], presses: 0, disposed: false,
          set(snapshot, banner, nowMs) { surface.sets.push([snapshot.health, snapshot.room, banner?.kind ?? null, nowMs]); },
          togglePanel(open) { surface.toggles.push(open); },
          pressLeave() { surface.presses++; return 'armed'; },
          dispose() { surface.disposed = true; calls.push('status.dispose'); },
        };
        statusSurfaces.push(surface);
        calls.push('status.mount');
        return surface;
      },
      event: (event) => { statusEvents.push(event); },
      report: (summary, reason) => { statusReports.push([reason, summary]); calls.push(`status.report:${reason}`); },
    },
  };
  if (p2p) ports.p2p = p2p;
  const composition = createBrowserComposition({
    ports,
    factories: {
      createSession: (options) => { const session = createScriptedSession(options, calls); sessions.push(session); return session; },
      createPresentation: (options) => { const presentation = createRecordedPresentation(options, calls); presentations.push(presentation); return presentation; },
    },
    clock: () => 1000,
    clientBuild: 'receipt',
    entryTimeoutMs,
    schedule: (callback) => setTimeout(callback, 0),
    setTimer: (callback, delayMs) => { const handle = { callback, delayMs, fired: false, fire() { handle.fired = true; callback(); } }; timers.push(handle); return handle; },
    clearTimer: (handle) => { handle.cleared = true; },
    reportError: (scope, error) => calls.push(`error:${scope}:${error instanceof Error ? error.message : String(error)}`),
    reportWarning: (scope, detail) => calls.push(`warn:${scope}:${detail}`),
  });
  return { calls, bus, game, sessions, presentations, menu, battleLoad, lifecycle, garageStatus, roomStates, statusSurfaces, statusEvents, statusReports, timers, ports, composition };
}

// ------------------------------------------------------------ port validation and session guard
{
  assert.throws(() => createBrowserComposition({ ports: {} }), /requires the lifecycle.run port/);
  const harness = createHarness();
  assert.throws(() => harness.composition.beginRoom({ session: { roomInfo: { peerId: 'x' } } }), /requires a v2 room session/, 'a v1 session never reaches the v2 launch');
  assert.equal(harness.composition.active, false);
  assert.equal(harness.composition.stats().room, null);
}

// ------------------------------------------------------------ the happy path: start, load, welcome, first frame, warm, activate, reveal
const harness = createHarness();
const { calls, composition, game } = harness;
const roomSession = makeRoomSession(calls);
const entry = composition.beginRoom({ role: 'host', session: roomSession, lobbyState: roomSession.lobby });
assert.deepEqual(calls.slice(0, 3), ['cover', 'resetRoundState', 'load.show:Map verdant'], 'the synchronous prefix covers rendering and shows the room briefing before any await');
assert.equal(harness.sessions.length, 1, 'one session owner per room');
assert.equal(harness.sessions[0].started, true);
assert.equal(harness.sessions[0].options.clientBuild, 'receipt');
assert.equal(harness.lifecycle.pending, true, 'the entry holds the battle-entry critical section');
assert.equal(harness.garageStatus.at(-1)?.roomCode, 'ABC123', 'adopting the room publishes the Garage room status');
const owner = harness.sessions[0];
const round1 = { matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' };
const sessionPresentation = await owner.enter(round1);
assert.equal(composition.active, true);
assert.equal(composition.inMatch, false);
assert.ok(calls.includes('loadModules') && calls.includes('ensureBattleVisuals') && calls.includes('loadWorld:alpine:null'), 'modules, visuals and the round map load together');
assert.ok(calls.indexOf('battleStart:me:m1a2:alpine') < calls.indexOf('loadWorld:alpine:null'), 'the battle-start intent precedes the world load');
assert.equal(harness.battleLoad.shows.at(-1).mapName, 'Map alpine', 'the loader names the concrete battlefield of match_start, not the room default');
assert.equal(harness.battleLoad.shows.at(-1).allies[0].isPlayer, true);
assert.equal(harness.battleLoad.shows.at(-1).enemies[0].id, 'm1a2');
assert.equal(harness.presentations.length, 1);
const recorded = harness.presentations[0];
assert.equal(recorded.options.spectator, false);
assert.equal(recorded.options.worldCollision, harness.ports.scene.getWorldCollision());
assert.equal(typeof sessionPresentation.controls, 'function', 'a seated player drives');
assert.equal(sessionPresentation.prediction, null, 'prediction waits for the roster');
await owner.welcome();
assert.deepEqual([...recorded.actors.values()].map((actor) => actor.camo), ['summer', 'winter'], 'paint comes from the room seats');
assert.ok(calls.includes('ground:me:function') && calls.includes('ground:foe:function'), 'every actor gets the ground sampler');
assert.ok(sessionPresentation.prediction, 'prediction is enabled once the own actor and the world are known');
assert.equal(sessionPresentation.prediction.world.heightField, harness.ports.scene.getWorldCollision().heightField);
assert.equal(sessionPresentation.prediction.specFor('m1a2').id, 'm1a2', 'the own spec comes from the actor');
assert.equal(composition.inMatch, false, 'nothing activates before the first frame');
owner.frame(frame());
await settle(12);
const warmOrder = calls.filter((call) => typeof call === 'string' && (call.startsWith('warm.') || call.startsWith('activate:') || call === 'primeReveal' || call === 'load.hide' || call === 'blackWatchdog' || call.startsWith('garageLighting') || call.startsWith('waiting')));
assert.deepEqual(warmOrder, [
  'garageLighting:false', 'warm.atmosphere:99', 'warm.nightLighting', 'warm.terrain:2', 'warm.wrecks:2', 'warm.panel:m1a2', 'warm.compile',
  'warm.fx:function:2', 'warm.shotCards:m1a2,m1a2', 'activate:me:m1a2:alpine:false', 'waiting:false', 'warm.presentation', 'warm.finalShadows',
  'blackWatchdog', 'primeReveal', 'load.hide',
], 'v1\'s covered order: warm, activate, opening ground cover, final shadows, the black watchdog, the reveal barrier, the loader fade');
assert.equal(await entry, true, 'beginRoom resolves once the battle is revealed');
assert.equal(composition.inMatch, true);
assert.equal(harness.lifecycle.pending, false);
assert.equal(game.phase, 'battle');
assert.equal(game.player?.id, 'me');
assert.ok(calls.includes('audio.ambient:true') && calls.includes('adaptive:false'));
assert.equal(harness.ports.trace.status, 'complete');
assert.ok(harness.ports.trace.stages.compile >= 0 && 'primeReveal' in harness.ports.trace.stages);
assert.equal(harness.ports.activation.own.id, 'me');
harness.ports.activation.bridge.setPerspective('foe');
assert.ok(calls.includes('perspective:2'), 'a spectator perspective maps the player id to the entity id');
assert.equal(harness.menu.attached, null, 'the lobby stays off the menu while the battle is live');

// ------------------------------------------------------------ the network status strip: mounted with the activation, painted from the pumps
await settle();
assert.equal(harness.statusSurfaces.length, 1, 'the strip mounts once the round is activated');
assert.ok(calls.indexOf('status.mount') > calls.indexOf('activate:me:m1a2:alpine:false'), 'the strip mounts after activation');
const statusSurface = harness.statusSurfaces[0];
assert.equal(statusSurface.sets.length, 1, 'the mounted strip paints the current snapshot at once');
assert.deepEqual(statusSurface.sets[0].slice(0, 3), ['good', 'joined', null], 'a joined room (the scripted owner carries no match link) reads good with no banner');
assert.equal(composition.networkStatus.seat, 0);
assert.equal(composition.networkStatus.roomRegion, 'lan');
assert.equal(composition.networkStatus.rosterCount, 2);
assert.equal(composition.networkStatus.roomRttMs, 18);
assert.equal(composition.stats().network.surface, true);
assert.equal(composition.stats().network.health, 'good');

// ------------------------------------------------------------ controls and the frame hooks
{
  const own = recorded.ownActor;
  own.input.throttle = 0.7; own.input.steer = -0.2; own.input.fire = true; own.input.shellSlot = 2;
  const sample = sessionPresentation.controls(30);
  assert.equal(sample.throttle, 0.7);
  assert.equal(sample.fire, true);
  assert.equal(sample.shellSlot, 2);
  assert.ok(Math.abs(sample.aimYaw) < 1e-9 && Math.abs(sample.aimDistance - 100) < 1e-9, 'the aim intent is the own actor\'s aim point in hull-relative polar form');
  assert.equal(sample.actionPresses, 0);
  composition.queueConsumable(1);
  composition.queueAction('selfRight');
  assert.equal(sessionPresentation.controls(31).actionPresses, ACTION_BITS.FIRST_AID | ACTION_BITS.SELF_RIGHT, 'HUD actions ride the next tick as edges');
  assert.equal(sessionPresentation.controls(32).actionPresses, 0, 'once');
  own.combat.destroyed = true;
  assert.equal(sessionPresentation.controls(33), null, 'a destroyed viewer sends neutral controls');
  own.combat.destroyed = false;
  const before = calls.length;
  composition.pump(1 / 60, 5000);
  composition.pumpBackground(6000);
  const updates = calls.slice(before).filter((call) => Array.isArray(call) && call[0] === 'update');
  assert.deepEqual(updates, [['update', 5000, 1 / 60], ['update', 6000, 0.25]], 'the frame and background pumps drive the session owner (background elapsed clamped)');
  assert.equal(statusSurface.sets.length, 3, 'each pump samples the status model at its cadence and paints the strip');
  assert.equal(statusSurface.sets.at(-1)[3], 6000);
  assert.equal(composition.pressLeave(), 'armed', 'the leave action reaches the mounted strip');
  assert.equal(statusSurface.presses, 1);
  composition.toggleStatusPanel(true);
  assert.deepEqual(statusSurface.toggles, [true], 'the network-details action reaches the mounted strip');
  const sampler = createControlSampler(() => null);
  assert.equal(sampler.sample(1), null);
}

// ------------------------------------------------------------ the verdict, the lobby back on the menu, the Garage return with the room kept
owner.frame(frame({ events: [{ kind: 'shell_fired', payload: { shooterId: 'foe' } }], ownShots: [{ event: { kind: 'shell_fired', payload: { shooterId: 'me' } }, feedbackPredicted: true }] }));
assert.deepEqual(composition.stats().round.events, { shell_fired: 2 });
assert.equal(composition.stats().round.ownShots, 1);
assert.deepEqual(composition.stats().round.shotsBy, { foe: 1, me: 1 }, 'shots are counted by shooter (the browser e2e proves each side saw the other\'s)');
owner.verdict(VERDICT.ALPHA, 'elimination');
assert.equal(game.result, 'victory');
assert.equal(harness.bus.at(-1).type, 'battle:ended');
roomSession.publish(snapshot({ phase: 'waiting', round: 1, lastResult: { round: 1, result: 'alpha', reason: 'elimination' } }));
await settle();
assert.ok(harness.menu.attached, 'with the result up, the lobby attaches to the Play menu');
assert.equal(harness.menu.attached.role, 'host');
assert.equal(harness.menu.attached.state.lastResult.result, 'alpha');
assert.equal(harness.roomStates.at(-1).role, 'host');
assert.equal(harness.garageStatus.at(-1).readyCount, 2);
await harness.menu.attached.command({ type: 'set_ready', ready: true });
assert.ok(calls.includes('command:set_ready'), 'lobby commands go through the room session');
assert.equal(composition.shouldPreserveRoom(), true, 'the room survives the Garage return');
composition.disposePresentation();
assert.equal(statusSurface.disposed, true, 'the Garage return unmounts the strip');
assert.deepEqual(harness.statusReports.map(([reason]) => reason), ['verdict'], 'a played round leaves one link summary, with why it ended (the result was up)');
assert.equal(harness.statusReports[0][1].health, 'good');
assert.equal(harness.statusEvents.filter((event) => event.kind === 'health').length, 0, 'health changes are not telemetry events');
assert.equal(composition.stats().network.surface, false);
assert.equal(composition.pressLeave(), 'ignored', 'no strip, no leave action');
assert.equal(composition.active, false);
assert.ok(calls.includes('leaveMatch:returned_to_garage') && calls.includes('presentation.dispose'), 'the seat leaves the match, the presentation is released');
assert.equal(harness.sessions.length, 1, 'the session owner survives for the rematch');
game.phase = 'garage';
roomSession.publish(snapshot({ phase: 'waiting', round: 1 }));
await settle();
assert.ok(harness.menu.updates >= 1, 'later room states update the attached lobby');

// ------------------------------------------------------------ the rematch: the same room, a new round, no new session owner
{
  const rematch = composition.beginRoom({ role: 'host', session: roomSession, lobbyState: roomSession.lobby });
  assert.equal(harness.sessions.length, 1, 'the rematch reuses the room\'s session owner');
  assert.equal(harness.lifecycle.pending, true);
  assert.equal(harness.battleLoad.shows.at(-1).mode, 'LAN Battle · Direct Wi-Fi', 'a room start shows the mode briefing');
  const round2 = { matchStart: matchStart(2, 'winter'), room: snapshot({ phase: 'starting', round: 2 }), spectator: false, playerId: 'me' };
  await owner.enter(round2);
  assert.equal(harness.battleLoad.shows.at(-1).mode, 'LAN Battle · Direct Wi-Fi · Round 2');
  assert.equal(game.result, null, 'the previous result is cleared before the new round renders');
  await owner.welcome();
  owner.frame(frame());
  await settle(12);
  assert.equal(await rematch, true);
  assert.equal(composition.stats().round.matchId, 'match-2');
  assert.equal(composition.stats().rounds, 2);
  assert.equal(harness.presentations.length, 2);
  assert.equal(harness.presentations[0].disposed, true);
}

// ------------------------------------------------------------ a lost match link in a live round ends it as a disconnect once
{
  owner.setPhase('lost', 'transport exhausted');
  assert.ok(calls.includes('endDisconnected'));
  assert.equal(game.result, 'draw');
  assert.equal(game.resultReason, 'network_disconnect');
  assert.equal(composition.stats().lastFailure.reason, 'match_lost');
  await owner.leaveMatch('result screen');
  game.phase = 'garage';
  game.result = null;
}

// ------------------------------------------------------------ the server drops the seat in a live round: the banner names it, then the same clean return
{
  const before = harness.statusSurfaces.length;
  const rejoin = composition.beginRoom({ role: 'host', session: roomSession, lobbyState: roomSession.lobby });
  const round3 = { matchStart: matchStart(3, 'verdant'), room: snapshot({ phase: 'playing', round: 3 }), spectator: false, playerId: 'me' };
  await owner.enter(round3);
  await owner.welcome();
  owner.frame(frame());
  await settle(12);
  assert.equal(await rejoin, true);
  assert.equal(harness.statusSurfaces.length, before + 1, 'the strip mounts for the round');
  const surface = harness.statusSurfaces.at(-1);
  const paintsBefore = surface.sets.length;
  harness.timers.length = 0;
  owner.dropSeat(CLOSE_REASON.IDLE_TIMEOUT, 'idle');
  assert.equal(calls.at(-1), 'clearInput', 'input is cleared at once');
  assert.ok(surface.sets.length > paintsBefore, 'the strip is painted at once so the banner reads');
  assert.deepEqual(surface.sets.at(-1).slice(0, 3), ['good', 'joined', null], 'the scripted owner\'s stub is not attached to the model (no transport events), so the paint carries the room verdict');
  assert.equal(harness.timers.length, 1, 'the return waits for the notice to be read');
  assert.equal(harness.timers[0].delayMs, 3000);
  assert.ok(!calls.includes('endDisconnected') || calls.lastIndexOf('endDisconnected') < calls.lastIndexOf('activate:me:m1a2:verdant:false'), 'a seat drop is not presented as a disconnect result');
  assert.equal(composition.stats().lastFailure.reason, 'seat_idle_timeout');
  harness.timers[0].fire();
  await settle();
  assert.equal(calls.at(-1), 'returnToGarage', 'the same clean return as Leave battle');
  assert.equal(game.phase, 'garage');
  composition.disposePresentation();
  await settle();
  assert.equal(surface.disposed, true);
  assert.equal(harness.statusReports.at(-1)[0], 'dropped', 'the dropped round leaves its link summary as a drop');
  owner.match = null;
  roomSession.publish(snapshot({ phase: 'playing', round: 3 }));
  await settle();
}

// ------------------------------------------------------------ re-entry: a Garage return kept the room, the seat still holds the match_start, the room still runs the match
{
  roomSession.client.matchStart = matchStart(3, 'verdant');
  const running = snapshot({ phase: 'playing', round: 3 });
  running.match = { id: 'match-3', round: 3, status: 'playing', mapId: 'verdant', seed: 7, startedAt: 1, endedAt: null, verdict: null };
  roomSession.publish(running);
  await settle();
  const reentry = composition.beginRoom({ role: 'host', session: roomSession, lobbyState: roomSession.lobby });
  await settle();
  assert.ok(calls.includes('enterMatch:match-3'), 'beginRoom re-enters the running match through the session owner instead of waiting for a start');
  assert.equal(harness.sessions.length, 1, 'the same session owner');
  await owner.welcome();
  owner.frame(frame());
  await settle(12);
  assert.equal(await reentry, true, 'the re-entered round reveals');
  assert.equal(composition.stats().round.matchId, 'match-3');
  composition.disposePresentation();
  await settle();
  roomSession.client.matchStart = null;
  const ended = snapshot({ phase: 'waiting', round: 3, lastResult: { round: 3, result: 'draw', reason: 'time_limit' } });
  roomSession.publish(ended);
  await settle();
  const idle = composition.beginRoom({ role: 'host', session: roomSession, lobbyState: roomSession.lobby });
  await settle();
  assert.equal(calls.filter((call) => call === 'enterMatch:match-3').length, 1, 'no match to re-enter once the room says it ended: the entry waits for a start');
  const round4 = { matchStart: matchStart(4, 'alpine'), room: snapshot({ phase: 'starting', round: 4 }), spectator: false, playerId: 'me' };
  await owner.enter(round4);
  await owner.welcome();
  owner.frame(frame());
  await settle(12);
  assert.equal(await idle, true);
  game.result = null;
}

// ------------------------------------------------------------ an entry failure: the world load rejects
{
  const failing = createHarness({ loadWorld: async () => { throw new Error('terrain shard missing'); } });
  const failingRoom = makeRoomSession(failing.calls);
  const failedEntry = failing.composition.beginRoom({ role: 'host', session: failingRoom, lobbyState: failingRoom.lobby });
  const failOwner = failing.sessions[0];
  await assert.rejects(failOwner.enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' }), /terrain shard missing/);
  assert.equal(await failedEntry, false, 'beginRoom resolves false when the round cannot present');
  const tail = failing.calls.filter((call) => ['leaveMatch:entry_failed', 'enterGarage', 'uncover', 'load.hide', 'cover'].includes(call));
  assert.deepEqual(tail.slice(-4), ['cover', 'enterGarage', 'uncover', 'load.hide'], 'the covered Garage restore runs before the loader fades');
  assert.ok(failing.calls.includes('leaveMatch:entry_failed'));
  assert.equal(failing.ports.failure.reason, 'entry_failed');
  assert.match(failing.ports.failure.message, /terrain shard missing/);
  assert.ok(failing.calls.some((call) => typeof call === 'string' && call.startsWith('error:multiplayer v2 entry:terrain shard')));
  assert.equal(failing.composition.active, false);
  assert.equal(failing.composition.room, failingRoom, 'the room is kept for a retry');
  await settle();
  assert.ok(failing.menu.attached, 'the lobby re-attaches so the player can retry from the room');
  assert.equal(failing.lifecycle.pending, false);
}

// ------------------------------------------------------------ the black watchdog refusing the frame is an entry failure too
{
  const dark = createHarness({ blackWatchdog: async () => ({ failed: true, error: 'black' }) });
  const darkRoom = makeRoomSession(dark.calls);
  const darkEntry = dark.composition.beginRoom({ role: 'host', session: darkRoom, lobbyState: darkRoom.lobby });
  const darkOwner = dark.sessions[0];
  await darkOwner.enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
  await darkOwner.welcome();
  darkOwner.frame(frame());
  assert.equal(await darkEntry, false);
  assert.equal(dark.ports.failure.stage, 'reveal');
  assert.match(dark.ports.failure.message, /could not be verified/);
  assert.equal(dark.ports.trace.status, 'failed');
}

// ------------------------------------------------------------ only the watchdog's own verdict blocks entry (2026-10-09, R047)
// The probe draws offscreen and reads its own target: a page hidden behind another tab, with no frame presented since
// the countdown began (the frame waits take their hidden fallback), measured 18.9 on the R047 repro and entered. A
// low-light round's verdict carries the diagnostic scale it was measured under (sunset 0.165: 14.8-20.7, was 3.8-4.7 and
// refused). Neither visibility nor presented frames may turn a healthy verdict into the refusal above.
{
  const previousDocument = globalThis.document;
  globalThis.document = { visibilityState: 'hidden', hidden: true, hasFocus: () => false };
  const verdicts = [];
  try {
    for (const verdict of [{ before: 18.9, after: null, rescued: false, stage: null },
      { before: 14.8, after: null, rescued: false, stage: null, nightRadianceScale: 0.494 / 3 }]) {
      const hidden = createHarness({ blackWatchdog: async () => { verdicts.push(verdict); return verdict; } });
      const hiddenRoom = makeRoomSession(hidden.calls);
      const hiddenEntry = hidden.composition.beginRoom({ role: 'client', session: hiddenRoom, lobbyState: hiddenRoom.lobby });
      const hiddenOwner = hidden.sessions[0];
      await hiddenOwner.enter({ matchStart: matchStart(1, 'verdant'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
      await hiddenOwner.welcome();
      hiddenOwner.frame(frame());
      assert.equal(await hiddenEntry, true, `a healthy verdict (${verdict.before}) enters with the page hidden`);
      assert.equal(hidden.ports.failure ?? null, null, 'no entry failure is recorded');
      assert.equal(hidden.ports.trace.status, 'complete');
      assert.deepEqual(hidden.ports.trace.blackCheck, verdict, 'the trace keeps the verdict and the scale it was measured under');
    }
    assert.equal(verdicts.length, 2, 'one watchdog run per entry, no visibility gate in front of it');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

// ------------------------------------------------------------ the room closing mid-battle: clear input, return to the Garage, the failure panel
{
  const kicked = createHarness();
  const kickedRoom = makeRoomSession(kicked.calls);
  const kickedEntry = kicked.composition.beginRoom({ role: 'client', session: kickedRoom, lobbyState: kickedRoom.lobby });
  const kickedOwner = kicked.sessions[0];
  await kickedOwner.enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
  await kickedOwner.welcome();
  kickedOwner.frame(frame());
  assert.equal(await kickedEntry, true);
  kickedRoom.closeFromRoom('kicked');
  await settle();
  assert.ok(kicked.calls.includes('clearInput') && kicked.calls.includes('returnToGarage') && kicked.calls.includes('session.dispose'));
  assert.deepEqual(kicked.menu.failures, [['kicked', 'lan']], 'the failure surface names the reason and the mode');
  assert.equal(kicked.composition.room, null);
  assert.equal(kicked.composition.active, false);
  assert.equal(kicked.garageStatus.at(-1), null);
  assert.equal(kicked.roomStates.at(-1), null);
  assert.equal(kicked.composition.shouldPreserveRoom(), false);
}

// ------------------------------------------------------------ the room closing while loading: the covered restore, then the panel
{
  let releaseWorld = null;
  const gone = createHarness({ loadWorld: () => new Promise((resolve) => { releaseWorld = resolve; }) });
  const goneRoom = makeRoomSession(gone.calls);
  const goneEntry = gone.composition.beginRoom({ role: 'client', session: goneRoom, lobbyState: goneRoom.lobby });
  const goneOwner = gone.sessions[0];
  const entering = goneOwner.enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
  await settle();
  goneRoom.closeFromRoom('expired');
  await settle();
  assert.equal(await goneEntry, false);
  assert.ok(gone.calls.includes('enterGarage') && gone.calls.includes('load.hide'));
  assert.deepEqual(gone.menu.failures, [['expired', 'lan']]);
  // The world finishing after the room vanished is discarded, never reported as a failure.
  releaseWorld();
  await assert.rejects(entering, /superseded/);
  await settle();
  assert.ok(!gone.calls.some((call) => typeof call === 'string' && call.startsWith('error:')), 'a superseded round reports nothing');
  assert.equal(gone.presentations.length, 0, 'no presentation is built on a released room');
}

// ------------------------------------------------------------ an explicit leave from the lobby closes the seat
{
  const leaving = createHarness();
  const leavingRoom = makeRoomSession(leaving.calls);
  leaving.composition.beginRoom({ role: 'host', session: leavingRoom, lobbyState: leavingRoom.lobby }).catch(() => {});
  leavingRoom.publish(snapshot({ phase: 'waiting' }));
  await settle();
  assert.ok(leaving.menu.attached, 'in the Garage the lobby is attached at once');
  leaving.menu.attached.leave('left_room');
  await settle();
  assert.ok(leaving.calls.includes('client.leave') && leaving.calls.includes('client.dispose') && leaving.calls.includes('menu.detach'));
  assert.equal(leaving.composition.room, null);
  assert.deepEqual(leaving.menu.failures, [], 'an explicit leave shows no failure');
}

// ------------------------------------------------------------ leaving while a round loads: the seat goes, the Garage is restored under the cover, then the entry settles
{
  let releaseWorld = null;
  const mid = createHarness({ loadWorld: () => new Promise((resolve) => { releaseWorld = resolve; }) });
  const midRoom = makeRoomSession(mid.calls);
  const midEntry = mid.composition.beginRoom({ role: 'host', session: midRoom, lobbyState: midRoom.lobby });
  const midOwner = mid.sessions[0];
  const entering = midOwner.enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
  await settle();
  let settled = null;
  midEntry.then((value) => { settled = value; });
  mid.composition.leaveRoom('explicit_leave');
  assert.equal(mid.lifecycle.pending, true, 'the entry stays held until the covered restore is done');
  await settle(4);
  assert.equal(settled, false, 'the entry settles false after the restore');
  assert.deepEqual(mid.calls.filter((call) => ['clearInput', 'client.leave', 'enterGarage', 'uncover', 'load.hide'].includes(call)),
    ['clearInput', 'client.leave', 'enterGarage', 'uncover', 'load.hide'], 'input off, the seat left, the Garage restored under the cover, the loader faded');
  assert.equal(mid.composition.room, null);
  assert.deepEqual(mid.menu.failures, [], 'an explicit leave is not a failure');
  releaseWorld();
  await assert.rejects(entering, /superseded/);
}

// ------------------------------------------------------------ the match-start timeout restores the Garage and keeps the room
{
  const slow = createHarness({ entryTimeoutMs: 30 });
  const slowRoom = makeRoomSession(slow.calls);
  const slowEntry = slow.composition.beginRoom({ role: 'host', session: slowRoom, lobbyState: slowRoom.lobby });
  assert.equal(await slowEntry, false, 'no match_start in time: the entry ends');
  assert.equal(slow.ports.failure.reason, 'match_start_timeout');
  assert.ok(slow.calls.includes('enterGarage') && slow.calls.includes('load.hide'));
  assert.equal(slow.composition.room, slowRoom, 'the room stays for a retry');
  assert.equal(slow.lifecycle.pending, false);
  slow.composition.dispose();
  assert.equal(slow.composition.room, null);
  assert.equal(await slow.composition.beginRoom({ session: slowRoom }), false, 'a disposed composition launches nothing');
}

// ------------------------------------------------------------ entry resilience: a shader preparation past its wall-clock budget runs once more with a fresh deadline, then the entry proceeds
{
  const attempts = [];
  const slowGpu = createHarness({ compile: async () => {
    attempts.push(attempts.length + 1);
    return attempts.length === 1 ? { preparation: { status: 'incomplete', pending: 7, reason: 'budget' } } : { preparation: { status: 'complete', pending: 0 } };
  } });
  const slowRoom = makeRoomSession(slowGpu.calls);
  const slowEntry = slowGpu.composition.beginRoom({ role: 'host', session: slowRoom, lobbyState: slowRoom.lobby });
  const slowOwner = slowGpu.sessions[0];
  await slowOwner.enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
  await slowOwner.welcome();
  slowOwner.frame(frame());
  assert.equal(await slowEntry, true, 'the entry proceeds once the second preparation completes');
  assert.deepEqual(attempts, [1, 2], 'the compile ran exactly twice');
  assert.equal(slowGpu.ports.trace.status, 'complete');
  assert.ok(slowGpu.ports.trace.stages.compile >= 0 && slowGpu.ports.trace.stages.compileRetry >= 0, `the trace carries both attempts (${JSON.stringify(slowGpu.ports.trace.stages)})`);
  assert.equal(slowGpu.ports.slowEntries.length, 1, 'one beacon for the extension');
  assert.deepEqual({ ...slowGpu.ports.slowEntries[0], ms: 0 }, { stage: 'compile', code: 'extended', ms: 0, pending: 7 });
  assert.ok(Number.isFinite(slowGpu.ports.slowEntries[0].ms) && slowGpu.ports.slowEntries[0].ms >= 0);
  assert.equal(slowGpu.ports.failure ?? null, null, 'no entry failure');
  assert.ok(slowGpu.calls.includes('slowEntry:compile:extended:7'));
  const progress = slowGpu.battleLoad.progressLabels.map(([, label]) => label);
  assert.ok(progress.includes('Compiling combat shaders (still preparing)'), 'the loader says the compile is still preparing');
  slowGpu.composition.dispose();
}

// ------------------------------------------------------------ twice past the budget: the hard failure with the same message, no third attempt
{
  const attempts = [];
  const starved = createHarness({ compile: async () => { attempts.push(1); return { preparation: { status: 'incomplete', pending: 7, reason: 'budget' } }; } });
  const starvedRoom = makeRoomSession(starved.calls);
  const starvedEntry = starved.composition.beginRoom({ role: 'host', session: starvedRoom, lobbyState: starvedRoom.lobby });
  const starvedOwner = starved.sessions[0];
  await starvedOwner.enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
  await starvedOwner.welcome();
  starvedOwner.frame(frame());
  assert.equal(await starvedEntry, false, 'the second verdict is final');
  assert.equal(attempts.length, 2, 'no third attempt');
  assert.match(starved.ports.failure.message, /Battle shaders could not finish preparing\. Please retry from the Garage\./);
  assert.equal(starved.ports.trace.status, 'failed');
  assert.ok(starved.ports.trace.stages.compile >= 0 && starved.ports.trace.stages.compileRetry >= 0, `the failed trace records both attempts (${JSON.stringify(starved.ports.trace.stages)})`);
  assert.equal(starved.ports.slowEntries.length, 1, 'the extension was beaconed once; the failure is the entry result');
  assert.ok(starved.calls.includes('enterGarage') && starved.calls.includes('load.hide'), 'the covered Garage restore runs');
  starved.composition.dispose();
}

// ------------------------------------------------------------ an incomplete preparation for any other reason never retries
{
  const attempts = [];
  const lost = createHarness({ compile: async () => { attempts.push(1); return { preparation: { status: 'incomplete', pending: null, reason: 'invalidated' } }; } });
  const lostRoom = makeRoomSession(lost.calls);
  const lostEntry = lost.composition.beginRoom({ role: 'host', session: lostRoom, lobbyState: lostRoom.lobby });
  const lostOwner = lost.sessions[0];
  await lostOwner.enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
  await lostOwner.welcome();
  lostOwner.frame(frame());
  assert.equal(await lostEntry, false);
  assert.equal(attempts.length, 1, 'an invalidated preparation fails at once');
  assert.match(lost.ports.failure.message, /could not finish preparing/);
  assert.equal(lost.ports.slowEntries, undefined, 'no beacon');
  lost.composition.dispose();
}

composition.dispose();
assert.ok(calls.includes('client.leave'), 'disposing the composition leaves the seat');
// ------------------------------------------------------------ the host's log levels (lane mp/ui-sync-check, 2026-09-30): a warn
// ("match report refused host_only" after an election, "elected but cannot host") is a warning, never a console error — the
// browser proofs fail a run on any console error, and these are the product's own expected transients
{
  const hosted = createHarness({ p2p: { createHostPort: () => { throw new Error('the receipt never boots a host'); }, manifestBase: null, tier: 'desktop' } });
  const room = makeRoomSession(hosted.calls);
  hosted.composition.beginRoom({ role: 'host', session: room, lobbyState: room.lobby });
  const onLog = hosted.sessions[0]?.options?.p2p?.onLog;
  assert.equal(typeof onLog, 'function', 'the session owner receives the host log sink with its p2p ports');
  onLog('warn', 'match report refused', { error: 'host_only' });
  onLog('info', 'host actor booted', { tick: 0 });
  onLog('error', 'host boot failed', { error: 'manifest' });
  assert.ok(hosted.calls.includes('warn:multiplayer v2 host warn:match report refused {"error":"host_only"}'), 'a host warn reaches the warning sink');
  assert.ok(!hosted.calls.some((entry) => entry.startsWith('error:multiplayer v2 host warn')), 'and never the error sink');
  assert.ok(hosted.calls.includes('error:multiplayer v2 host error:host boot failed {"error":"manifest"}'), 'a host error stays an error');
  assert.ok(!hosted.calls.some((entry) => /multiplayer v2 host info/.test(entry)), 'info lines stay quiet');
  hosted.composition.dispose();
}

// ------------------------------------------------------------ the ICE of a room session (2026-10-02, §13.14): the resolver is
// built once per room session from the room's mode and the room client the seat holds, and is the session's own `ice`
{
  const built = [];
  const resolver = async () => ({ iceServers: [], relayOnly: false });
  const iced = createHarness({ p2p: { createHostPort: () => { throw new Error('the receipt never boots a host'); }, manifestBase: null, tier: 'desktop',
    createIceResolver: (mode, room) => { built.push({ mode, room }); return resolver; } } });
  const room = makeRoomSession(iced.calls);
  iced.composition.beginRoom({ role: 'host', session: room, lobbyState: room.lobby });
  assert.equal(built.length, 1, 'one resolver per room session');
  assert.equal(built[0].room, room.client, 'built over the room client this seat holds');
  assert.equal(built[0].mode, room.roomInfo.mode === 'lan' ? 'lan' : 'private', 'with the room\'s mode');
  assert.equal(iced.sessions[0]?.options?.p2p?.ice, resolver, 'the session resolves every connection through it');
  assert.equal('loadIce' in (iced.sessions[0]?.options?.p2p ?? {}), false, 'no credential endpoint port remains');
  iced.composition.dispose();
}

// ------------------------------------------------------------ a world laid out otherwise (ghost-crunch lane, 2026-10-02): a world
// that is not the host manifest's index space loads the manifest's obstacle identities beside the roster and hands them to
// the presentation (the persistent destroyed list reads through them); a shared layout — a phone's now too — loads nothing
{
  const identity = (index) => ({ x: index, z: -index, kind: 'tree' });
  for (const [layoutTier, sharesIndices, expected] of [['mobile', true, false], ['desktop', true, false], ['mobile', false, true]]) {
    const layout = createHarness({ layoutTier, sharesIndices, loadAuthorityObstacles: async () => identity });
    const room = makeRoomSession(layout.calls);
    layout.composition.beginRoom({ role: 'host', session: room, lobbyState: room.lobby });
    await layout.sessions[0].enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
    await settle(4);
    const presentation = layout.presentations[0];
    assert.equal(layout.calls.includes('authorityObstacles:alpine:true'), expected, `${layoutTier}/${sharesIndices}: the manifest's identities load only for a world laid out otherwise`);
    assert.equal(presentation.authorityIdentity === identity, expected, `${layoutTier}/${sharesIndices}: and reach the presentation`);
    layout.composition.dispose();
  }
  const failing = createHarness({ layoutTier: 'mobile', sharesIndices: false, loadAuthorityObstacles: async () => { throw new Error('manifest unreachable'); } });
  const room = makeRoomSession(failing.calls);
  failing.composition.beginRoom({ role: 'host', session: room, lobbyState: room.lobby });
  await failing.sessions[0].enter({ matchStart: matchStart(1, 'alpine'), room: snapshot({ phase: 'starting', round: 1 }), spectator: false, playerId: 'me' });
  await settle(4);
  assert.ok(failing.calls.some((entry) => typeof entry === 'string' && entry.startsWith('warn:multiplayer v2 authority obstacles:manifest unreachable')), 'an unreachable manifest is a warning; the round goes on (live falls still find their records)');
  assert.equal(failing.presentations[0].disposed, false);
  failing.composition.dispose();
}

console.log('browserComposition.selftest: the v2 browser launch loads, predicts, warms, activates and reveals a round, keeps the room for a rematch, routes lost links, load failures, a vanished room, an explicit leave and a start timeout to the existing surfaces, runs a shader preparation past its budget once more before failing, and loads the obstacle identities of the host manifest for a world laid out otherwise');
