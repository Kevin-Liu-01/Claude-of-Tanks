#!/usr/bin/env node
/**
 * World-events audit (lane mp/world-state-audit, 2026-10-01): three headless seats and a bot fill on verdant's
 * collision shard, the REAL battle presentation (renderer stubbed: visuals, textures, FX bus) on every seat, the
 * room signaling double and the scripted WebRTC world — the code path a browser peer runs minus three's draw calls.
 *
 * The host authority's `eventsForViewer` is hooked, so every reliable event is logged exactly as it was sent to each
 * viewer (tick, kind, key, position); every seat's presentation logs every crush it applies (which path: the
 * per-frame destroyed list or the `world_prop_destroyed` event; the direction and speed it used; settled or animated)
 * and every FX bus event it emits (`prop:crushed`, `shell:expired`, `shell:hit`, `tank:destroyed`, `tank:ram`,
 * `tank:impact`, `tank:fire`, `shell:fired`, `weapon:predicted`) with the presented tick. The diff per seat and kind:
 * missing, duplicate, late (presented tick − host tick beyond one snapshot interval), early (negative), wrong place
 * (> 0.5 m), replayed on a rejoin (crushes applied for events that predate the seat's new presentation: animated is
 * the defect, settled is correct), replayed on a migration (the new host re-destroying what the old host had
 * destroyed; the peers' FX for it).
 *
 * Scenarios, in order: live play; p3 leaves the battle to the Garage and rejoins (a late joiner's presentation);
 * p2's link reconnects (a fresh offer, the actor replaces the seat); p1 (the host) closes its tab → the room elects p2
 * → p2 resumes from the sealed keyframe (the destroyed set compared before and after); p1 returns as a peer of p2.
 *
 *   node tools/mp-world-events-audit.mjs                       # ~2 min wall
 *   node tools/mp-world-events-audit.mjs --play=30 --after=12 --out=/path --label=before
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { Vector3 } from 'three';
import { createP2pRoomDouble } from './mp-p2p-room-double.ts';
import { memoryStorage, scriptedControls } from '../src/mp/session/headlessSession.ts';
import { RoomClient } from '../src/mp/room/roomClient.ts';
import { MatchSession } from '../src/mp/session/matchSession.ts';
import { createInProcessHostPort } from '../src/mp/host/inProcessHost.ts';
import { RtcWorld } from '../src/mp/transport/rtcDouble.test-support.ts';
import { createBattlePresentation } from '../src/mp/presentation/battlePresentation.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';
import { PHASE, TICK_HZ } from '../src/mp/wire/constants.ts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(25);
  }
};
const now = () => performance.now();
const TRACKED_BUS = new Set(['prop:crushed', 'shell:expired', 'shell:hit', 'tank:destroyed', 'tank:ram', 'tank:impact', 'tank:fire', 'shell:fired', 'weapon:predicted']);
const HOST_KINDS = ['world_prop_destroyed', 'shell_impact', 'shell_hit', 'tank_destroyed', 'tank_ram', 'tank_impact', 'tank_fire', 'shell_fired'];
/** host event kind → the bus kind the presentation emits for it */
const BUS_FOR = { world_prop_destroyed: 'prop:crushed', shell_impact: 'shell:expired', shell_hit: 'shell:hit', tank_destroyed: 'tank:destroyed', tank_ram: 'tank:ram', tank_impact: 'tank:impact', tank_fire: 'tank:fire', shell_fired: 'shell:fired' };
const MAP_ID = 'verdant';
const SNAPSHOT_TICKS = 3; // 20 Hz
/** A send this close to a view's end (its leave, the host's close, the run's end) cannot have been presented by it. */
const END_GUARD_MS = 400;

function keyOf(type, payload) {
  switch (type) {
    case 'world_prop_destroyed': return `prop:${payload.obstacleIndex}`;
    case 'shell_impact': return `impact:${payload.shellId}`;
    case 'shell_hit': return `hit:${payload.shellId}:${payload.targetId}`;
    case 'tank_destroyed': return `dead:${payload.id}`;
    case 'tank_ram': return `ram:${payload.aId}|${payload.bId}`;
    case 'tank_impact': return `crash:${payload.id}`;
    case 'tank_fire': return `fire:${payload.id}:${payload.burning ? 1 : 0}`;
    case 'shell_fired': return `fired:${payload.shellId}`;
    default: return `${type}`;
  }
}
function busKeyOf(type, payload) {
  switch (type) {
    case 'prop:crushed': return payload.obstacleIndex != null ? `prop:${payload.obstacleIndex}` : null;
    case 'shell:expired': return `impact:${payload.shellId}`;
    case 'shell:hit': return `hit:${payload.shellId}:${payload.targetId}`;
    case 'tank:destroyed': return `dead:${payload.id}`;
    case 'tank:ram': return `ram:${payload.aId}|${payload.bId}`;
    case 'tank:impact': return `crash:${payload.id}`;
    case 'tank:fire': return `fire:${payload.id}:${payload.burning ? 1 : 0}`;
    case 'shell:fired': return `fired:${payload.shellId}`;
    default: return null;
  }
}
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null);

export async function runWorldEventsAudit({ playMs = 30_000, afterMs = 12_000, hostGraceMs = 1500, frameHz = 30, teamSize = 4, log = () => {} } = {}) {
  const SECRET = 'mp-world-events-audit-seat-secret-0123456789abcdef';
  const roomEvents = [];
  const rooms = await createP2pRoomDouble({ seatSecret: SECRET, hostGraceMs, onEvent: (event) => roomEvents.push(event) });
  const rtc = new RtcWorld();
  const reference = createDedicatedWorldCollision(MAP_ID);
  const referenceObstacles = reference.getObstacles();
  const obstaclePos = (index) => { const o = referenceObstacles[index]; return o ? [(o.min[0] + o.max[0]) * 0.5, o.min[1], (o.min[2] + o.max[2]) * 0.5] : null; };
  const indexByCenter = new Map();
  referenceObstacles.forEach((_o, index) => { indexByCenter.set(obstaclePos(index).map((v) => v.toFixed(3)).join(','), index); });
  const obstacleIndexAt = (pos) => (Array.isArray(pos) ? indexByCenter.get(pos.map((v) => Number(v).toFixed(3)).join(',')) ?? null : null);
  const hostLog = [];          // every event as sent to each viewer
  const hostCores = [];        // { id, core, hooked, generation }
  const peers = [];
  const failures = [];
  const marks = {};
  const report = { label: null, mapId: MAP_ID, playMs, afterMs, hostGraceMs, teamSize, steps: {}, wallMs: 0 };
  const startedAt = now();
  let ticking = true;

  // ------------------------------------------------------------ the host hook: what the authority sent to whom
  const hookCore = (entry) => {
    const actor = entry.core.actor;
    if (!actor || entry.hooked) return;
    entry.hooked = true;
    entry.bootTick = actor.tick;
    const authority = actor.authority;
    const original = authority.eventsForViewer.bind(authority);
    authority.eventsForViewer = (viewerId) => {
      const events = original(viewerId);
      const tick = actor.tick;
      const wallMs = now();
      for (const event of events) {
        const type = String(event.type);
        if (!HOST_KINDS.includes(type)) continue;
        const payload = event;
        let pos = null;
        if (type === 'world_prop_destroyed') pos = obstaclePos(Number(payload.obstacleIndex));
        else if (typeof payload.x === 'number') pos = [payload.x, payload.y, payload.z];
        else if (Array.isArray(payload.pos)) pos = [...payload.pos];
        else if (typeof payload.id === 'string') { const e = authority.entityById.get(payload.id); if (e) pos = [e.state.pos.x, e.state.pos.y, e.state.pos.z]; }
        const key = type === 'world_prop_destroyed' ? keyOf(type, payload) : `${entry.id}/${keyOf(type, payload)}`;
        hostLog.push({ host: entry.id, generation: entry.generation, tick, wallMs, viewerId, type, key, pos,
          index: type === 'world_prop_destroyed' ? Number(payload.obstacleIndex) : null, cause: payload.cause ?? null, shooterId: typeof payload.shooterId === 'string' ? payload.shooterId : null,
          dir: type === 'world_prop_destroyed' ? [Number(payload.directionX) || 0, Number(payload.directionZ) || 0] : null, speed: typeof payload.speedMps === 'number' ? payload.speedMps : null });
      }
      return events;
    };
  };
  const destroyedOf = (entry) => {
    const actor = entry.core.actor;
    const snapshot = actor.authority.snapshot({ tick: actor.tick, serverTimeMs: Math.round(actor.tick * 1000 / TICK_HZ), viewerId: '__audit__', ackInputSeq: null });
    return { indices: [...(snapshot.meta.destroyedObstacleIndices ?? [])].sort((a, b) => a - b), revision: Number(snapshot.meta.destructibleRevision) || 0 };
  };

  // ------------------------------------------------------------ the real presentation, renderer stubbed, logging what it applies
  const fakeVisual = () => ({
    root: { position: new Vector3(), userData: {} },
    setVisible() {}, syncFromState() {}, dispose() {}, recoilKick() { return -1; },
    gunMuzzleWorld(out) { return out.set(0, 2, 0); }, gunDirWorld(out) { return out.set(0, 0, 1); },
    stripEra() {}, resetEra() {}, setDestroyed() {}, resetDestroyed() {},
  });
  const cloneObstacles = () => referenceObstacles.map((o) => ({ min: o.min, max: o.max, crushable: o.crushable === true, crushMin: o.crushMin, kind: o.kind, treeIdx: o.treeIdx, propIdx: o.propIdx, crushed: false, shape2: null }));
  function auditPresentation(peer, round) {
    const roundIndex = peer.rounds.length;
    const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: MAP_ID };
    const obstacles = cloneObstacles();
    const record = { roundIndex, welcomeTick: null, welcomeAtMs: null, endedAtMs: null, welcomes: 0, frames: 0, applied: [], hostIdAtWelcome: null, actors: 0, rosterError: null };
    peer.rounds.push(record);
    let path = 'none';
    let presentedTick = -1;
    let frameGap = 0;
    const newestTick = () => peer.session.match?.snapshots.latest?.tick ?? -1;
    const worldCollision = {
      heightField: reference.heightField,
      getObstacles: () => obstacles,
      queryObstacles: (minX, minZ, maxX, maxZ, target) => reference.queryObstacles(minX, minZ, maxX, maxZ, target),
      crushObstacle(obstacle, dx, dz, speed, _cause, options) {
        const index = obstacles.indexOf(obstacle);
        record.applied.push({ kind: 'crush', key: `prop:${index}`, index, dx, dz, speed, settled: !!(options && options.settled), path, presentedTick, frameGap, newestTick: newestTick(), wallMs: now() });
      },
    };
    const bus = {
      emit(type, payload) {
        if (!TRACKED_BUS.has(type)) return;
        const pos = Array.isArray(payload.pos) ? [...payload.pos] : null;
        const propIndex = type === 'prop:crushed' ? (payload.obstacleIndex ?? obstacleIndexAt(pos)) : null;
        const hostId = peer.session.p2p?.hostId ?? peer.id;
        const busKey = busKeyOf(type, payload);
        record.applied.push({ kind: type, key: type === 'prop:crushed' ? (propIndex !== null ? `prop:${propIndex}` : null) : (busKey ? `${hostId}/${busKey}` : null), hostId, pos, path, presentedTick, frameGap, newestTick: newestTick(), wallMs: now(),
          index: propIndex, shooterId: payload.shooterId ?? null, feedbackPredicted: payload.feedbackPredicted ?? null, fireIntentSeq: payload.fireIntentSeq ?? null });
      },
    };
    const presentation = createBattlePresentation({
      engineCtx: { scene: { add() {} }, anisotropy: 1 }, game, bus, worldCollision,
      createTankVisual: fakeVisual, prepareVisualTextures: async () => {}, camoFor: () => 'factory',
    });
    const adapter = {
      applyRoster: (roster, context) => presentation.applyRoster(roster, context),
      applyFrame(frame) { path = 'frame'; frameGap = presentedTick < 0 ? 0 : frame.tick - presentedTick; presentedTick = frame.tick; record.frames++; try { presentation.applyFrame(frame); } finally { path = 'none'; } },
      applyEvent(event, context) { path = 'event'; try { presentation.applyEvent(event, context); } finally { path = 'none'; } },
      applyVerdict: (verdict, reason) => presentation.applyVerdict(verdict, reason),
      setVisibility: (entityId, visible) => presentation.setVisibility(entityId, visible),
      dispose: () => presentation.dispose(),
    };
    return {
      adapter, controls: round.spectator ? null : peer.controls, prediction: null,
      dispose: () => { record.endedAtMs ??= now(); presentation.dispose(); },
      onWelcome: async (welcome) => {
        record.welcomes++;
        record.welcomeTick ??= welcome.serverTick;
        record.welcomeAtMs ??= now();
        record.hostIdAtWelcome ??= peer.session.p2p?.hostId ?? null;
        try { await presentation.rosterReady(); record.actors = presentation.actors.size; }
        catch (error) { record.rosterError = error instanceof Error ? error.message : String(error); log(`[${peer.id}] roster failed: ${record.rosterError}`); }
      },
    };
  }

  // ------------------------------------------------------------ seats
  const createSocket = (url) => new WebSocket(url);
  const spawn = (id, name, storage, index, { canHost = true } = {}) => {
    const peer = { id, name, storage, index, controls: scriptedControls(index), rounds: [], disposed: false, room: null, session: null, p2pEvents: [], hostLiveTick: null, resets: [], lastReconnects: 0 };
    const room = new RoomClient({ endpoint: rooms.url, player: { id, name }, storage, clientBuild: 'audit', transport: { createSocket } });
    const session = new MatchSession({
      room, clientBuild: 'audit', transport: { createSocket },
      createPresentation: (round) => auditPresentation(peer, round),
      p2p: {
        createPeerConnection: rtc.createPeerConnection,
        ...(canHost ? { createHostPort: createInProcessHostPort({ world: 'dedicated', onCore: (core) => hostCores.push({ id, core, hooked: false, generation: hostCores.length + 1 }), keyframeIntervalMs: 500, reportIntervalMs: 1000 }) } : {}),
        manifestBase: null, tier: 'desktop', countdownS: 1,
        onLog: (level, message, fields) => {
          if (message === 'host live' && fields && peer.hostLiveTick === null) peer.hostLiveTick = fields.tick;
          if (level !== 'info') log(`[${id}] ${level}: ${message} ${fields ? JSON.stringify(fields) : ''}`);
        },
      },
    });
    session.start();
    session.onP2p((event) => peer.p2pEvents.push({ ...event, wallMs: now() }));
    peer.room = room;
    peer.session = session;
    peers.push(peer);
    return peer;
  };
  const retire = (peer) => { if (!peer.disposed) { peer.disposed = true; peer.retiredAtMs = now(); peer.session.dispose(); peer.room.dispose(); } };
  const ticker = (async () => {
    let last = now();
    while (ticking) {
      const current = now();
      const elapsedS = Math.min(0.25, (current - last) / 1000);
      last = current;
      rtc.flush();
      for (const peer of peers) if (!peer.disposed) peer.session.update(current, elapsedS);
      rtc.flush();
      for (const entry of hostCores) {
        hookCore(entry);
        if (entry.core.stopped && entry.stoppedAtMs == null) entry.stoppedAtMs = current;
      }
      // a seat's link resets (a reconnect, a host migration) clear its event queue: sends just before one are lost by design
      for (const peer of peers) {
        if (peer.disposed) continue;
        const reconnects = peer.session.match?.stats().reconnects ?? 0;
        if (reconnects !== peer.lastReconnects) { peer.lastReconnects = reconnects; peer.resets.push(current); }
      }
      await sleep(1000 / frameHz);
    }
  })();
  const welcomed = (peer) => !!peer.session.match?.welcome;
  const live = (peer) => peer.session.match?.phase === 'live';
  const playing = (peer) => peer.session.match?.stats().matchPhase === PHASE.PLAYING;
  const hostEventsBetween = (fromMs, toMs, type) => hostLog.filter((e) => e.type === type && e.wallMs >= fromMs && e.wallMs < toMs);
  const uniqueBy = (list, key) => new Set(list.map(key)).size;

  let code = '';
  try {
    // ---- start
    const p1 = spawn('p1', 'Creator', memoryStorage(), 0);
    const room = await p1.room.create({ mode: 'lan', selection: { specId: 'm1a2' }, settings: { teamSize, mapId: MAP_ID, botsFill: true } });
    code = room.roomCode;
    const p2 = spawn('p2', 'Two', memoryStorage(), 1);
    const p3 = spawn('p3', 'Three', memoryStorage(), 2);
    await p1.room.setTeam('bravo');
    await p2.room.join({ roomCode: code, selection: { specId: 't90m' }, team: 'alpha' });
    await p3.room.join({ roomCode: code, selection: { specId: 'leo2a7v' }, team: 'alpha' });
    await until(() => p1.room.room?.players.length === 3, 'three seats', 10_000);
    await Promise.all(peers.map((peer) => peer.room.setReady(true)));
    await until(() => p1.room.room?.players.every((player) => player.ready), 'everyone ready', 10_000);
    await p1.room.start();
    await until(() => peers.every((peer) => peer.session.round), 'every seat entered the match', 15_000);
    await until(() => peers.every(welcomed), 'every seat welcomed', 60_000);
    await until(() => peers.every((peer) => (peer.rounds.at(-1)?.frames ?? 0) > 10), 'frames flowing on every seat', 30_000);
    await until(() => peers.every(playing), 'the countdown ended', 20_000);
    const core1 = hostCores.find((entry) => entry.id === 'p1');
    await until(() => core1?.hooked, 'the host authority hooked', 5_000);
    report.steps.start = { host: p1.session.role, entities: core1.core.actor.authority.entities.length, obstacles: referenceObstacles.length, crushable: referenceObstacles.filter((o) => o.crushable).length };
    log(`start: p1 hosts ${report.steps.start.entities} entities on ${MAP_ID} (${report.steps.start.obstacles} obstacles, ${report.steps.start.crushable} crushable)`);

    // ---- 1. live play
    marks.playStart = now();
    await sleep(playMs);
    marks.playEnd = now();
    const liveCrushes = hostEventsBetween(marks.playStart, marks.playEnd, 'world_prop_destroyed');
    report.steps.live = { seconds: playMs / 1000, hostCrushes: uniqueBy(liveCrushes, (e) => `${e.tick}:${e.index}`), hostImpacts: uniqueBy(hostEventsBetween(marks.playStart, marks.playEnd, 'shell_impact'), (e) => e.key), hostHits: uniqueBy(hostEventsBetween(marks.playStart, marks.playEnd, 'shell_hit'), (e) => e.key), hostTick: core1.core.actor.tick };
    log(`live: ${report.steps.live.hostCrushes} crushes, ${report.steps.live.hostImpacts} shell impacts, ${report.steps.live.hostHits} hits on the host in ${playMs / 1000} s`);

    // ---- 2. p3 leaves the battle to the Garage and rejoins (a fresh presentation on the running match)
    const rejoinPayload = p3.session.round.matchStart;
    const destroyedBeforeRejoin = destroyedOf(core1).indices;
    await p3.session.leaveMatch('garage');
    await sleep(1500);
    marks.rejoinAt = now();
    const rejoinRound = p3.rounds.length;
    await p3.session.enterMatch(rejoinPayload);
    await until(() => p3.rounds.length > rejoinRound && p3.rounds.at(-1).welcomeTick !== null, 'p3 welcomed again', 30_000);
    await until(() => (p3.rounds.at(-1)?.frames ?? 0) > 5, 'frames flow to p3 again', 15_000);
    marks.rejoinFramesAt = now();
    await sleep(afterMs);
    marks.rejoinEnd = now();
    const rejoin = p3.rounds.at(-1);
    const rejoinCrushes = rejoin.applied.filter((e) => e.kind === 'crush');
    const replayedOnJoin = rejoinCrushes.filter((e) => destroyedBeforeRejoin.includes(e.index));
    report.steps.rejoin = { destroyedBefore: destroyedBeforeRejoin.length, welcomeTick: rejoin.welcomeTick, crushesApplied: rejoinCrushes.length, replayedOnJoin: replayedOnJoin.length, replayedAnimated: replayedOnJoin.filter((e) => !e.settled).length, replayedSettled: replayedOnJoin.filter((e) => e.settled).length, fxOnJoin: rejoin.applied.filter((e) => e.kind === 'prop:crushed' && destroyedBeforeRejoin.includes(e.index)).length };
    log(`rejoin: ${report.steps.rejoin.destroyedBefore} props already destroyed; p3's new presentation applied ${report.steps.rejoin.crushesApplied} crushes, ${report.steps.rejoin.replayedOnJoin} of them replays (${report.steps.rejoin.replayedAnimated} animated, ${report.steps.rejoin.replayedSettled} settled)`);

    // ---- 3. p2's link reconnects (a fresh offer; the actor replaces the seat; the client resets for the new socket)
    const p2Round = p2.rounds.at(-1);
    const p2CrushesBefore = p2Round.applied.filter((e) => e.kind === 'crush').length;
    marks.reconnectAt = now();
    const welcomesBefore = p2.session.match.stats().snapshotsAccepted;
    let rewelcomed = false;
    const offWelcome = p2.session.match.onWelcome(() => { rewelcomed = true; });
    p2.session.match.transport.reconnect('network', 'audit reconnect');
    await until(() => rewelcomed, 'p2 welcomed again after the reconnect', 20_000);
    offWelcome();
    marks.reconnectLiveAt = now();
    await sleep(afterMs);
    marks.reconnectEnd = now();
    const outageCrushes = hostEventsBetween(marks.reconnectAt, marks.reconnectLiveAt, 'world_prop_destroyed').filter((e) => e.viewerId === 'p2');
    report.steps.reconnect = { outageMs: Math.round(marks.reconnectLiveAt - marks.reconnectAt), snapshotsBefore: welcomesBefore, crushEventsSentDuringOutage: uniqueBy(outageCrushes, (e) => e.key), crushesAfter: p2Round.applied.filter((e) => e.kind === 'crush').length - p2CrushesBefore };
    log(`reconnect: p2 re-welcomed after ${report.steps.reconnect.outageMs} ms; ${report.steps.reconnect.crushEventsSentDuringOutage} crush events addressed to it during the outage`);

    // ---- 4. the host's tab closes: p2 is elected and resumes from the sealed keyframe
    const destroyedOld = destroyedOf(core1);
    const oldHostTick = core1.core.actor.tick;
    marks.hostClosedAt = now();
    p1.room.disconnect('tab closed');
    retire(p1);
    await until(() => core1.core.stopped, 'the old host stopped', 5_000);
    // what the elected seat holds now is what its boot overlays on the sealed keyframe (nothing new arrives on the dead link)
    const knownByElected = p2.session.match?.retainedMigration().latestFrame;
    const knownByElectedAtClose = knownByElected?.destroyed.length ?? -1;
    const knownRevisionAtClose = knownByElected?.meta.destructibleRevision ?? -1;
    await until(() => roomEvents.some((event) => event.kind === 'host_changed' && event.generation === 2), 'host_changed after the grace', hostGraceMs + 15_000);
    await until(() => p2.session.role === 'host' && p2.session.matchHost?.state === 'live', 'p2 hosts', 30_000);
    const core2 = hostCores.find((entry) => entry.id === 'p2');
    await until(() => core2?.hooked, 'the new host authority hooked', 5_000);
    marks.newHostLiveAt = now();
    const destroyedNew = destroyedOf(core2);
    await until(() => live(p3) && p3.session.stats().p2p?.migrating === false, 'p3 live on p2', 30_000);
    const oldSet = new Set(destroyedOld.indices);
    const newSet = new Set(destroyedNew.indices);
    report.steps.migration = {
      oldHostTick, resumedTick: core2.core.actor.tick, destroyedOld: destroyedOld.indices.length, revisionOld: destroyedOld.revision, knownByElectedAtClose, knownRevisionAtClose, destroyedNewAtBoot: destroyedNew.indices.length, revisionNewAtBoot: destroyedNew.revision,
      restored: destroyedOld.indices.filter((i) => newSet.has(i)).length, lostOnMigration: destroyedOld.indices.filter((i) => !newSet.has(i)).length, inventedOnMigration: destroyedNew.indices.filter((i) => !oldSet.has(i)).length,
    };
    log(`migration: old host had ${report.steps.migration.destroyedOld} destroyed (revision ${report.steps.migration.revisionOld}); the new host booted with ${report.steps.migration.destroyedNewAtBoot} (revision ${report.steps.migration.revisionNewAtBoot}): ${report.steps.migration.restored} restored, ${report.steps.migration.lostOnMigration} lost`);
    await sleep(afterMs);
    marks.migrationPlayEnd = now();
    const recrushed = hostEventsBetween(marks.newHostLiveAt, marks.migrationPlayEnd, 'world_prop_destroyed').filter((e) => e.host === 'p2' && oldSet.has(e.index));
    report.steps.migration.recrushEvents = uniqueBy(recrushed, (e) => e.key);
    report.steps.migration.newCrushEventsAfter = uniqueBy(hostEventsBetween(marks.newHostLiveAt, marks.migrationPlayEnd, 'world_prop_destroyed').filter((e) => e.host === 'p2'), (e) => e.key);
    const ghostFx = (peer) => peer.rounds.at(-1).applied.filter((e) => e.kind === 'prop:crushed' && e.wallMs >= marks.newHostLiveAt && e.wallMs < marks.migrationPlayEnd && recrushed.some((h) => h.key === e.key && h.viewerId === peer.id));
    report.steps.migration.ghostFxP2 = ghostFx(p2).length;
    report.steps.migration.ghostFxP3 = ghostFx(p3).length;
    log(`migration play: ${report.steps.migration.recrushEvents} re-crush events on the new host for props the old host had destroyed (ghost FX p2 ${report.steps.migration.ghostFxP2}, p3 ${report.steps.migration.ghostFxP3}); ${report.steps.migration.newCrushEventsAfter} crush events in all`);

    // ---- 5. p1 returns as a peer of p2 (a late joiner after the migration)
    const destroyedBeforeReturn = destroyedOf(core2).indices;
    const p1b = spawn('p1', 'Creator', p1.storage, 0);
    await p1b.room.join({ roomCode: code });
    await until(() => p1b.session.round && welcomed(p1b), 'p1 welcomed again as a peer', 30_000);
    marks.returnAt = now();
    await until(() => (p1b.rounds.at(-1)?.frames ?? 0) > 5, 'frames flow to p1 again', 15_000);
    await sleep(Math.min(afterMs, 6000));
    marks.end = now();
    const returned = p1b.rounds.at(-1);
    const returnCrushes = returned.applied.filter((e) => e.kind === 'crush');
    const replayedOnReturn = returnCrushes.filter((e) => destroyedBeforeReturn.includes(e.index));
    report.steps.return = { role: p1b.session.role, hostId: p1b.session.stats().p2p?.hostId ?? null, destroyedBefore: destroyedBeforeReturn.length, crushesApplied: returnCrushes.length, replayedOnJoin: replayedOnReturn.length, replayedAnimated: replayedOnReturn.filter((e) => !e.settled).length, replayedSettled: replayedOnReturn.filter((e) => e.settled).length };
    log(`return: p1 ${report.steps.return.role} of ${report.steps.return.hostId}; ${report.steps.return.destroyedBefore} destroyed before, ${report.steps.return.replayedOnJoin} replayed (${report.steps.return.replayedAnimated} animated)`);
  } catch (error) {
    failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
  } finally {
    report.wallMs = Math.round(now() - startedAt);
    ticking = false;
    await ticker;
    for (const peer of peers) retire(peer);
    for (const { core } of hostCores) core.dispose();
    await Promise.race([rooms.close(), sleep(5000)]);
  }

  // ------------------------------------------------------------ the diff: host deliveries vs peer applications
  const matrix = [];
  const perPeer = {};
  for (const peer of peers) {
    for (const round of peer.rounds) {
      if (round.welcomeAtMs === null) continue;
      const roundEnd = round.endedAtMs ?? peer.rounds[round.roundIndex + 1]?.welcomeAtMs ?? peer.retiredAtMs ?? marks.end ?? Infinity;
      const hostStoppedAt = (hostId) => hostCores.find((entry) => entry.id === hostId)?.stoppedAtMs ?? Infinity;
      // what the host sent to this seat while this presentation was its view (by wall time of the send). Not judged: a send
      // inside the last END_GUARD_MS before the view ended, before its host stopped, or before the seat's link reset (the
      // interpolation delay keeps it from presenting; a reset clears the queue by design — persistent state covers the world,
      // never a replayed effect); the seat's own shell_fired when its presentation has no actors (the single-process harness
      // cannot build the fleet twice; own shots are receipted in battlePresentation.selftest).
      const judged = (e) => e.wallMs < roundEnd - END_GUARD_MS && e.wallMs < hostStoppedAt(e.host) - END_GUARD_MS &&
        !peer.resets.some((reset) => e.wallMs >= reset - END_GUARD_MS && e.wallMs <= reset + 50) &&
        !(e.type === 'shell_fired' && e.shooterId === peer.id && round.actors === 0);
      const sentAll = hostLog.filter((e) => e.viewerId === peer.id && e.wallMs >= round.welcomeAtMs - 50 && e.wallMs < roundEnd);
      const sent = sentAll.filter(judged);
      const applied = round.applied;
      const used = new Set();
      const rows = {};
      // ordered matching per key: the k-th send of a key pairs with the k-th application of it (an ERA pop and the
      // penetration behind it share a shell and a target; a bouncing hull crashes several times)
      const cursors = new Map();
      const nextApplied = (key, kinds, notBeforeMs) => {
        for (let cursor = cursors.get(key) ?? 0; cursor < applied.length; cursor++) {
          const a = applied[cursor];
          if (used.has(cursor) || a.key !== key || !kinds.includes(a.kind) || a.wallMs < notBeforeMs - 5) continue;
          cursors.set(key, cursor + 1);
          used.add(cursor);
          return a;
        }
        return null;
      };
      for (const type of HOST_KINDS) {
        const busKind = BUS_FOR[type];
        const sentOfKind = sent.filter((e) => e.type === type);
        const row = { peer: peer.id, round: round.roundIndex, kind: type, sent: sentOfKind.length, applied: 0, missing: 0, duplicate: 0, late: 0, early: 0, wrongPlace: 0, dTicks: [], dWallMs: [], posErrM: [], viaFrame: 0, viaEvent: 0, cannedDirection: 0, settled: 0, fxWithoutCrush: 0, crushWithoutFx: 0 };
        for (const event of sentOfKind) {
          const crush = type === 'world_prop_destroyed' ? nextApplied(event.key, ['crush'], event.wallMs) : null;
          const fx = nextApplied(event.key, [busKind], event.wallMs);
          const first = crush ?? fx;
          if (!first) { row.missing++; continue; }
          row.applied++;
          const dTick = first.presentedTick - event.tick;
          row.dTicks.push(dTick);
          row.dWallMs.push(first.wallMs - event.wallMs);
          // late: beyond two snapshot intervals, and beyond what the budget's 4-tick deadline plus the presenter's own frame
          // gap allows (a slow frame of the single-process harness is not the client's lateness)
          if (dTick > SNAPSHOT_TICKS * 2 && dTick > 4 + (first.frameGap ?? 0)) row.late++;
          if (dTick < 0) row.early++;
          if (crush) {
            if (crush.path === 'frame') row.viaFrame++; else row.viaEvent++;
            if (crush.settled) row.settled++;
            if (crush.dx === 0 && crush.dz === 1 && crush.speed === 0) row.cannedDirection++;
            if (!fx) row.crushWithoutFx++;
          } else if (type === 'world_prop_destroyed' && fx) row.fxWithoutCrush++;
          const err = dist(fx?.pos ?? null, event.pos);
          if (err !== null) { row.posErrM.push(err); if (err > 0.5) row.wrongPlace++; }
        }
        // duplicates: applications of a key beyond the number of sends of that key to this seat (judged or not)
        const sendsPerKey = new Map();
        for (const e of sentAll) if (e.type === type) sendsPerKey.set(e.key, (sendsPerKey.get(e.key) ?? 0) + 1);
        const appliedPerKey = new Map();
        applied.forEach((a) => { if (a.key && sendsPerKey.has(a.key) && a.kind === busKind) appliedPerKey.set(a.key, (appliedPerKey.get(a.key) ?? 0) + 1); });
        for (const [key, count] of appliedPerKey) if (count > sendsPerKey.get(key)) row.duplicate += count - sendsPerKey.get(key);
        applied.forEach((a, i) => { if (!used.has(i) && a.key && sendsPerKey.has(a.key) && (a.kind === busKind || (type === 'world_prop_destroyed' && a.kind === 'crush'))) used.add(i); });
        const sortedTicks = [...row.dTicks].sort((a, b) => a - b);
        const sortedWall = [...row.dWallMs].sort((a, b) => a - b);
        const sortedErr = [...row.posErrM].sort((a, b) => a - b);
        row.dTicks = { min: sortedTicks[0] ?? null, p50: pct(sortedTicks, 0.5), max: sortedTicks.at(-1) ?? null };
        row.dWallMs = { p50: pct(sortedWall, 0.5) !== null ? Math.round(pct(sortedWall, 0.5)) : null, max: sortedWall.length ? Math.round(sortedWall.at(-1)) : null };
        row.posErrM = { max: sortedErr.length ? Number(sortedErr.at(-1).toFixed(3)) : null };
        rows[type] = row;
        matrix.push(row);
      }
      // crushes applied by this presentation that match no judged send: replays of state older than the view (a late joiner's
      // settled list), applications of sends the guards left unjudged (a reset or a view end within END_GUARD_MS), or — with
      // no send of that prop to this seat at any time — unexplained
      const everSent = (a) => hostLog.some((e) => e.type === 'world_prop_destroyed' && e.viewerId === peer.id && e.index === a.index && e.wallMs <= a.wallMs);
      const unmatchedCrushes = applied.filter((a, i) => a.kind === 'crush' && !used.has(i) && !everSent(a));
      const predating = unmatchedCrushes.filter((a) => hostLog.some((e) => e.type === 'world_prop_destroyed' && e.index === a.index && e.wallMs < round.welcomeAtMs));
      const ghostFx = applied.filter((a, i) => a.kind === 'prop:crushed' && !used.has(i) && !everSent(a));
      perPeer[`${peer.id}#${round.roundIndex}`] = { welcomeTick: round.welcomeTick, welcomes: round.welcomes, actors: round.actors, rosterError: round.rosterError, frames: round.frames, ghostFx: ghostFx.length, unmatchedCrushes: unmatchedCrushes.length, replaysOfOlderState: predating.length, replaysAnimated: predating.filter((a) => !a.settled).length, replaysSettled: predating.filter((a) => a.settled).length,
        ownShotFlashes: applied.filter((a) => a.kind === 'weapon:predicted').length, ownShellFiredUnpredicted: applied.filter((a) => a.kind === 'shell:fired' && a.shooterId === peer.id && a.feedbackPredicted === false).length, ownShellFiredPredicted: applied.filter((a) => a.kind === 'shell:fired' && a.shooterId === peer.id && a.feedbackPredicted === true).length };
    }
  }
  report.matrix = matrix;
  report.perPeer = perPeer;
  report.hostEvents = hostLog.length;
  report.failures = failures;
  report.pass = failures.length === 0;
  report.raw = { hostLog, peers: peers.map((peer) => ({ id: peer.id, rounds: peer.rounds.map((round) => ({ roundIndex: round.roundIndex, welcomeTick: round.welcomeTick, welcomeAtMs: round.welcomeAtMs, frames: round.frames, applied: round.applied })) })), marks, roomEvents: roomEvents.filter((e) => e.kind === 'host_changed' || e.kind === 'match_report') };
  return report;
}

export function formatMatrix(report) {
  const lines = [];
  lines.push(`# World-events audit${report.label ? ` — ${report.label}` : ''}`);
  lines.push('');
  lines.push(`Map ${report.mapId}, ${report.teamSize}v${report.teamSize} (3 seats + bots), live ${report.playMs / 1000} s, ${report.afterMs / 1000} s after each scenario, host grace ${report.hostGraceMs} ms; ${report.hostEvents} per-viewer event deliveries logged; ${report.wallMs} ms wall.`);
  lines.push('');
  for (const [step, detail] of Object.entries(report.steps)) lines.push(`- **${step}**: ${JSON.stringify(detail)}`);
  lines.push('');
  lines.push('## Per seat and presentation: what the host sent vs what the presentation applied');
  lines.push('');
  lines.push('| seat#view | kind | sent | applied | missing | duplicate | late (>2 intervals) | early (<0) | wrong place (>0.5 m) | Δticks min/p50/max | Δwall p50/max ms | pos err max m | via frame / via event | canned dir | settled | FX w/o crush | crush w/o FX |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const row of report.matrix) {
    if (row.sent === 0) continue;
    lines.push(`| ${row.peer}#${row.round} | ${row.kind} | ${row.sent} | ${row.applied} | ${row.missing} | ${row.duplicate} | ${row.late} | ${row.early} | ${row.wrongPlace} | ${row.dTicks.min ?? '–'}/${row.dTicks.p50 ?? '–'}/${row.dTicks.max ?? '–'} | ${row.dWallMs.p50 ?? '–'}/${row.dWallMs.max ?? '–'} | ${row.posErrM.max ?? '–'} | ${row.viaFrame} / ${row.viaEvent} | ${row.cannedDirection} | ${row.settled} | ${row.fxWithoutCrush} | ${row.crushWithoutFx} |`);
  }
  lines.push('');
  lines.push('## Per presentation: replays of older state, own-shot feedback');
  lines.push('');
  lines.push('| seat#view | welcome tick | welcomes | actors | frames | ghost FX (prop:crushed for a prop never sent to this seat) | crushes of props never sent to this seat | of which replays of state older than the view | animated | settled | own flashes predicted | own shell_fired unpredicted | own shell_fired predicted |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [key, row] of Object.entries(report.perPeer)) {
    lines.push(`| ${key} | ${row.welcomeTick} | ${row.welcomes} | ${row.actors}${row.rosterError ? ` (roster: ${row.rosterError})` : ''} | ${row.frames} | ${row.ghostFx} | ${row.unmatchedCrushes} | ${row.replaysOfOlderState} | ${row.replaysAnimated} | ${row.replaysSettled} | ${row.ownShotFlashes} | ${row.ownShellFiredUnpredicted} | ${row.ownShellFiredPredicted} |`);
  }
  lines.push('');
  for (const failure of report.failures) lines.push(`FAIL: ${failure}`);
  lines.push(report.pass ? 'audit run: complete' : 'audit run: INCOMPLETE');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (name, fallback) => { const hit = process.argv.find((a) => a.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : fallback; };
  const outDir = arg('out', null);
  const label = arg('label', null);
  const report = await runWorldEventsAudit({ playMs: Number(arg('play', 30)) * 1000, afterMs: Number(arg('after', 12)) * 1000, log: (line) => process.stderr.write(`[world-events] ${line}\n`) });
  report.label = label;
  const text = formatMatrix(report);
  console.log(text);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    const stamp = label ? `-${label}` : '';
    writeFileSync(join(outDir, `world-events-audit${stamp}.json`), JSON.stringify(report, null, 1));
    writeFileSync(join(outDir, `world-events-matrix${stamp}.md`), `${text}\n`);
    process.stderr.write(`[world-events] wrote ${join(outDir, `world-events-matrix${stamp}.md`)}\n`);
  }
  process.exitCode = report.pass ? 0 : 1;
}
