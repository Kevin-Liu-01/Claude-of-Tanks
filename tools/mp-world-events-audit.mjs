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
 * Scripted at the start of live play (ghost-crunch lane, 2026-10-02), so every run judges the two cases a bot fill only
 * sometimes produces: a bot driven into a hedgehog whose crossed beams share one box centre (one event fells the whole
 * prop; an effect read back from its position names the wrong beam), and a bot dropped from 40 m on one hit point beside
 * a crushable tree (a fall death: the presented pose is mid-air one interpolation step before the landing). Effects are
 * attributed by the obstacle index the presentation names; a box centre two records share attributes nothing.
 *
 *   node tools/mp-world-events-audit.mjs                       # ~2 min wall
 *   node tools/mp-world-events-audit.mjs --play=30 --after=12 --out=/path --label=before
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
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
import { createObstacleGrid } from '../src/world/collision.ts';
import { PHASE, TICK_HZ } from '../src/mp/wire/constants.ts';
import { createHash } from 'node:crypto';
import { decodeMigrationKeyframe, deriveMigrationKey, openMigrationBlob } from '../src/mp/host/migrationState.ts';
import { createStructureDamage } from '../src/sim/structureDamage.ts';
import { craterFor, munitionChargeKg, munitionClassForShell } from '../src/sim/munitionBlast.ts';
import { isHeClass } from '../src/sim/damage.ts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(25);
  }
};
const now = () => performance.now();
const TRACKED_BUS = new Set(['prop:crushed', 'shell:expired', 'shell:hit', 'tank:destroyed', 'tank:ram', 'tank:impact', 'tank:fire', 'shell:fired', 'weapon:predicted', 'structure:stage', 'structure:breach', 'terrain:crater']);
// destruction (2026-10-07): a structure's stage is world state like a prop's fall: keyed by what it names, not by its host
// sections (P2, 2026-10-08): a hole or a section's fall is world state too, keyed by its structure, section and slot
// craters (2026-10-08, crater-render-spec §F): a dug crater is world state too, keyed by its craterId in the match's log
const HOST_KINDS = ['world_prop_destroyed', 'shell_impact', 'shell_hit', 'tank_destroyed', 'tank_ram', 'tank_impact', 'tank_fire', 'shell_fired', 'structure_stage', 'structure_breach', 'terrain_crater'];
const WORLD_KINDS = new Set(['world_prop_destroyed', 'structure_stage', 'structure_breach', 'terrain_crater']);
/** host event kind → the bus kind the presentation emits for it */
const BUS_FOR = { world_prop_destroyed: 'prop:crushed', shell_impact: 'shell:expired', shell_hit: 'shell:hit', tank_destroyed: 'tank:destroyed', tank_ram: 'tank:ram', tank_impact: 'tank:impact', tank_fire: 'tank:fire', shell_fired: 'shell:fired', structure_stage: 'structure:stage', structure_breach: 'structure:breach', terrain_crater: 'terrain:crater' };
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
    case 'structure_stage': return `stage:${payload.structureId}:${payload.stage}`;
    case 'structure_breach': return `breach:${payload.structureId}:${payload.section}:${payload.hole}`;
    case 'terrain_crater': return `crater:${payload.craterId}`;
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
    case 'structure:stage': return `stage:${payload.structureId}:${payload.stage}`;
    case 'structure:breach': return `breach:${payload.structureId}:${payload.section}:${payload.hole}`;
    case 'terrain:crater': return `crater:${payload.craterId}`;
    default: return null;
  }
}
const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);
const dist = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null);

export async function runWorldEventsAudit({ playMs = 30_000, afterMs = 12_000, hostGraceMs = 1500, frameHz = 30, teamSize = 4, scripted = true, minLiveCrushes = 3, log = () => {} } = {}) {
  const SECRET = 'mp-world-events-audit-seat-secret-0123456789abcdef';
  const roomEvents = [];
  const rooms = await createP2pRoomDouble({ seatSecret: SECRET, hostGraceMs, onEvent: (event) => roomEvents.push(event) });
  const rtc = new RtcWorld();
  const reference = createDedicatedWorldCollision(MAP_ID);
  const referenceObstacles = reference.getObstacles();
  const obstaclePos = (index) => { const o = referenceObstacles[index]; return o ? [(o.min[0] + o.max[0]) * 0.5, o.min[1], (o.min[2] + o.max[2]) * 0.5] : null; };
  // A box centre names an obstacle only when no other record shares it (a hedgehog's crossed beams do): -1 marks a shared one.
  const indexByCenter = new Map();
  const centerKey = (pos) => pos.map((v) => Number(v).toFixed(3)).join(',');
  referenceObstacles.forEach((_o, index) => { const key = centerKey(obstaclePos(index)); indexByCenter.set(key, indexByCenter.has(key) ? -1 : index); });
  const obstacleIndexAt = (pos) => { const index = Array.isArray(pos) ? indexByCenter.get(centerKey(pos)) ?? null : null; return index === -1 ? null : index; };
  // The scripted sites: a crushable prop whose records share a box centre (verdant: a hedgehog's crossed beams) — the one
  // whose southernmost record, the first a hull driving north meets, is of the shared pair, so its one event names a
  // record its centre cannot — and the crushable tree nearest the map centre.
  const scriptedSites = (() => {
    const byCenter = new Map();
    referenceObstacles.forEach((o, index) => {
      if (!o.crushable || o.propIdx == null) return;
      const key = centerKey(obstaclePos(index));
      if (!byCenter.has(key)) byCenter.set(key, []);
      byCenter.get(key).push(index);
    });
    const pairs = [...byCenter.values()].filter((list) => list.length > 1);
    const southernmost = (pair) => referenceObstacles.map((o, i) => ({ o, i })).filter(({ o }) => o.propIdx === referenceObstacles[pair[0]].propIdx)
      .sort((a, b) => a.o.min[2] - b.o.min[2])[0].i;
    const pair = pairs.find((list) => list.includes(southernmost(list))) ?? pairs[0] ?? null;
    const propIdx = pair ? referenceObstacles[pair[0]].propIdx : null;
    const hedgehog = pair ? { propIdx, kind: referenceObstacles[pair[0]].kind, records: referenceObstacles.map((o, i) => (o.propIdx === propIdx ? i : -1)).filter((i) => i >= 0), sharedCenter: pair, center: obstaclePos(pair[0]) } : null;
    let tree = null;
    let best = Infinity;
    referenceObstacles.forEach((o, index) => {
      if (o.treeIdx == null || !o.crushable) return;
      const [x, , z] = obstaclePos(index);
      if (Math.hypot(x, z) < best) { best = Math.hypot(x, z); tree = { index, center: obstaclePos(index) }; }
    });
    // destruction (2026-10-07): a house a bot can ram at speed — the approach across its long side clear for 14 m
    let ram = null;
    const structureTable = createStructureDamage(referenceObstacles, reference.getColliders());
    for (const structure of structureTable.structures) {
      if (!structure.collapsible || ram) continue;
      for (const side of [1, -1]) {
        const rx = Math.cos(structure.yaw) * side, rz = -Math.sin(structure.yaw) * side;
        const startX = structure.cx + rx * (structure.hw + 12), startZ = structure.cz + rz * (structure.hw + 12);
        const blocked = referenceObstacles.some((o) => !o.crushable && o.structureIdx !== structure.id && [0.25, 0.5, 0.75, 1].some((t) => {
          const x = startX + (structure.cx - startX) * t * (12 / (structure.hw + 12)), z = startZ + (structure.cz - startZ) * t * (12 / (structure.hw + 12));
          return x > o.min[0] - 3 && x < o.max[0] + 3 && z > o.min[2] - 3 && z < o.max[2] + 3;
        }));
        if (blocked) continue;
        ram = { structureId: structure.id, start: [startX, startZ], yaw: Math.atan2(-rx, -rz) };
        break;
      }
    }
    // sections (P2, 2026-10-08): another structure a bot can shell — 20 m out across its long side, the line clear — for
    // the holes (and a panel's fall) a match with sections on sends
    let breach = null;
    for (const structure of structureTable.structures) {
      if (!structure.destructible || structure.id === ram?.structureId || breach) continue;
      for (const side of [1, -1]) {
        const rx = Math.cos(structure.yaw) * side, rz = -Math.sin(structure.yaw) * side;
        const startX = structure.cx + rx * (structure.hw + 20), startZ = structure.cz + rz * (structure.hw + 20);
        const blocked = referenceObstacles.some((o) => !o.crushable && o.structureIdx !== structure.id && [0.2, 0.4, 0.6, 0.8, 1].some((t) => {
          const x = startX + (structure.cx - startX) * t * (20 / (structure.hw + 20)), z = startZ + (structure.cz - startZ) * t * (20 / (structure.hw + 20));
          return x > o.min[0] - 3 && x < o.max[0] + 3 && z > o.min[2] - 3 && z < o.max[2] + 3;
        }));
        if (blocked) continue;
        breach = { structureId: structure.id, start: [startX, startZ], yaw: Math.atan2(-rx, -rz),
          target: [structure.cx + rx * structure.hw, structure.baseY + 1.8, structure.cz + rz * structure.hw] };
        break;
      }
    }
    // craters (2026-10-08): open, soft, dry ground nearest the map centre — nothing standing within 14 m — where a bot's HE
    // round digs (the switch on), 22 m ahead of the hull
    let crater = null;
    for (let ring = 0; ring <= 12 && !crater; ring++) {
      for (let k = 0; k < Math.max(1, ring * 8) && !crater; k++) {
        const a = (k / Math.max(1, ring * 8)) * Math.PI * 2;
        const x = Math.round(Math.sin(a) * ring * 20), z = Math.round(Math.cos(a) * ring * 20);
        const tx = x, tz = z + 22;
        const ground = reference.heightField.getGroundType?.(tx, tz) ?? 'medium';
        if (ground === 'hard' || (reference.heightField.getWaterMaskAt?.(tx, tz) ?? 0) > 0.05) continue;
        const near = referenceObstacles.some((o) => Math.max(o.min[0] - Math.max(x, tx), Math.min(x, tx) - o.max[0], 0) < 14
          && Math.max(o.min[2] - Math.max(z, tz), Math.min(z, tz) - o.max[2], 0) < 14);
        if (!near) crater = { start: [x, z], target: [tx, tz] };
      }
    }
    return { hedgehog, tree, ram, breach, crater };
  })();
  const hostLog = [];          // every event as sent to each viewer
  const hostCores = [];        // { id, core, hooked, generation }
  const peers = [];
  const failures = [];
  const marks = {};
  const report = { label: null, mapId: MAP_ID, playMs, afterMs, hostGraceMs, teamSize, steps: {}, wallMs: 0, loopDelay: null };
  const startedAt = now();
  // The host, the seats and the transport share this one process: its event-loop delay says whether the harness kept
  // its frame cadence, so a reader can tell a late beat of a starved harness from a late client.
  const loopDelay = monitorEventLoopDelay({ resolution: 10 });
  loopDelay.enable();
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
        else if (type === 'terrain_crater') pos = [payload.x, 0, payload.z];
        // a death is judged against the hull itself at its tick, not against the position its own payload carries
        else if (type === 'tank_destroyed' && typeof payload.id === 'string' && authority.entityById.get(payload.id)) { const e = authority.entityById.get(payload.id); pos = [e.state.pos.x, e.state.pos.y, e.state.pos.z]; }
        else if (typeof payload.x === 'number') pos = [payload.x, payload.y, payload.z];
        else if (Array.isArray(payload.pos)) pos = [...payload.pos];
        else if (typeof payload.id === 'string') { const e = authority.entityById.get(payload.id); if (e) pos = [e.state.pos.x, e.state.pos.y, e.state.pos.z]; }
        const key = WORLD_KINDS.has(type) ? keyOf(type, payload) : `${entry.id}/${keyOf(type, payload)}`;
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
  // a structure's records keep their group and footprint: the presentation's destruction mirror derives its table from them
  const cloneObstacles = () => referenceObstacles.map((o) => ({ min: o.min, max: o.max, crushable: o.crushable === true, crushMin: o.crushMin, kind: o.kind, treeIdx: o.treeIdx, propIdx: o.propIdx, crushed: false,
    shape2: o.structureIdx !== undefined ? o.shape2 : null, ...(o.structureIdx !== undefined ? { structureIdx: o.structureIdx, structureRole: o.structureRole } : {}) }));
  const referenceStructureColliders = reference.getColliders().filter((o) => o.structureIdx !== undefined);
  const cloneStructureColliders = () => referenceStructureColliders.map((o) => ({ min: o.min, max: o.max, kind: o.kind, shape2: o.shape2, structureIdx: o.structureIdx, structureRole: o.structureRole, crushed: false, dead: false }));
  function auditPresentation(peer, round) {
    const roundIndex = peer.rounds.length;
    const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: MAP_ID };
    const obstacles = cloneObstacles();
    const colliders = cloneStructureColliders();
    // the presentation's own records (their `crushed` flags are this view's), queried as the browser world's grid is
    const queryClones = createObstacleGrid(obstacles);
    const record = { roundIndex, welcomeTick: null, welcomeAtMs: null, endedAtMs: null, welcomes: 0, frames: 0, applied: [], hostIdAtWelcome: null, actors: 0, rosterError: null };
    peer.rounds.push(record);
    let path = 'none';
    let presentedTick = -1;
    let frameGap = 0;
    const newestTick = () => peer.session.match?.snapshots.latest?.tick ?? -1;
    const worldCollision = {
      heightField: reference.heightField,
      getObstacles: () => obstacles,
      getColliders: () => colliders,
      queryObstacles: (minX, minZ, maxX, maxZ, target) => queryClones(minX, minZ, maxX, maxZ, target),
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
        const worldKeyed = type === 'structure:stage' || type === 'structure:breach' || type === 'terrain:crater';
        const stagePos = type === 'structure:stage' || type === 'structure:breach' ? [payload.x, payload.y, payload.z]
          : type === 'terrain:crater' ? [payload.x, 0, payload.z] : null;
        record.applied.push({ kind: type, key: type === 'prop:crushed' ? (propIndex !== null ? `prop:${propIndex}` : null) : worldKeyed ? busKey : (busKey ? `${hostId}/${busKey}` : null), hostId, pos: stagePos ?? pos, path, presentedTick, frameGap, newestTick: newestTick(), wallMs: now(),
          index: propIndex, shooterId: payload.shooterId ?? null, feedbackPredicted: payload.feedbackPredicted ?? null, fireIntentSeq: payload.fireIntentSeq ?? null,
          settled: payload.settled === true });
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
    // the returning p1 is a second seat instance under the same player id: its views are labelled p1' in the report
    const label = `${id}${"'".repeat(peers.filter((other) => other.id === id).length)}`;
    const peer = { id, label, name, storage, index, controls: scriptedControls(index), rounds: [], disposed: false, room: null, session: null, p2pEvents: [], hostLiveTick: null, resets: [], lastReconnects: 0 };
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

    // ---- 1. live play (the scripted cases first: a bot into the shared-centre prop, a bot falling to its death by a tree)
    marks.playStart = now();
    if (scripted) {
      const authority = core1.core.actor.authority;
      const bots = authority.entities.filter((entity) => entity.bot && !entity.combat.destroyed);
      const groundAt = (x, z) => authority.heightField.getHeightAt(x, z);
      report.steps.scripted = {};
      if (scriptedSites.hedgehog && bots[0]) {
        const [x, , z] = scriptedSites.hedgehog.center;
        bots[0].state.pos.set(x, groundAt(x, z - 4.5) + 0.05, z - 4.5);
        bots[0].state.yaw = 0;
        bots[0].state.speed = 8;
        report.steps.scripted.hedgehog = { botId: bots[0].id, propIdx: scriptedSites.hedgehog.propIdx, kind: scriptedSites.hedgehog.kind, records: scriptedSites.hedgehog.records, sharedCenter: scriptedSites.hedgehog.sharedCenter };
      }
      if (scriptedSites.tree && bots[1]) {
        const [x, , z] = scriptedSites.tree.center;
        // 40 m up (the ride integrator owns the hull's height), one hit point: the authority's fall pricing kills it on landing
        bots[1].state.pos.set(x + 2.5, groundAt(x + 2.5, z) + 40, z);
        Object.assign(bots[1].state._ride, { y: bots[1].state.pos.y, v: 0, grounded: false });
        bots[1].state.grounded = false;
        bots[1].state.yaw = 0;
        bots[1].state.speed = 0;
        bots[1].combat.hp = 1;
        report.steps.scripted.fall = { botId: bots[1].id, tree: scriptedSites.tree.index };
      }
      if (scriptedSites.ram && bots[2]) {
        const [x, z] = scriptedSites.ram.start;
        bots[2].state.pos.set(x, groundAt(x, z) + 0.05, z);
        bots[2].state.yaw = scriptedSites.ram.yaw;
        bots[2].state.speed = 14;
        // its AI off and its throttle held open: a bot's own plan braked or turned it away from the wall in about one
        // run in three under load (2026-10-08), and the ram is what this case judges
        bots[2].aiCtl = null;
        Object.assign(bots[2].input, { throttle: 1, steer: 0, brake: false });
        report.steps.scripted.ram = { botId: bots[2].id, structureId: scriptedSites.ram.structureId };
      }
      // craters (2026-10-08, crater-render-spec §F): the remaining bot with the round that digs deepest fires it into open
      // ground 22 m ahead, its AI off and its gun reloaded; with the switch off the case records that nothing was dug
      const diggers = bots.slice(3).map((bot) => {
        const slot = bot.spec.gun.shells.findIndex((shell) => isHeClass(shell.type));
        if (slot < 0) return null;
        const shell = bot.spec.gun.shells[slot], munition = munitionClassForShell(shell);
        return { bot, slot, radiusM: craterFor(munitionChargeKg(shell, munition), munition, 1, { radiusM: 0, depthM: 0, rimM: 0 }).radiusM };
      }).filter(Boolean).sort((a, b) => b.radiusM - a.radiusM);
      const digger = scriptedSites.crater ? (diggers[0]?.bot ?? null) : null;
      if (scriptedSites.crater && diggers[0]) {
        const { bot, slot, radiusM } = diggers[0];
        const [x, z] = scriptedSites.crater.start, [tx, tz] = scriptedSites.crater.target;
        bot.state.pos.set(x, groundAt(x, z) + 0.05, z);
        bot.state.yaw = 0;
        bot.state.speed = 0;
        bot.aiCtl = null;
        bot.combat.shellSlot = slot;
        Object.assign(bot.combat.reload, { t: 0, kind: 'ready' });
        Object.assign(bot.input, { throttle: 0, steer: 0, brake: true, fire: true, shellSlot: slot });
        bot.input.aimPoint.set(tx, groundAt(tx, tz), tz);
        report.steps.scripted.crater = { botId: bot.id, shell: bot.spec.gun.shells[slot].name, radiusM: Number(radiusM.toFixed(2)), target: [tx, tz] };
      }
      // sections (P2): a bot shells another house's wall with its HE round, its AI off and its gun reloaded (with the
      // switch off it only damages the house)
      const sheller = bots.slice(3).filter((bot) => bot !== digger).map((bot) => ({ bot, slot: bot.spec.gun.shells.findIndex((shell) => isHeClass(shell.type)) }))
        .find((entry) => entry.slot >= 0);
      if (scriptedSites.breach && sheller) {
        const { bot, slot } = sheller;
        const [x, z] = scriptedSites.breach.start;
        bot.state.pos.set(x, groundAt(x, z) + 0.05, z);
        bot.state.yaw = scriptedSites.breach.yaw;
        bot.state.speed = 0;
        bot.aiCtl = null;
        bot.combat.shellSlot = slot;
        Object.assign(bot.combat.reload, { t: 0, kind: 'ready' });
        Object.assign(bot.input, { throttle: 0, steer: 0, brake: true, fire: true, shellSlot: slot });
        bot.input.aimPoint.set(...scriptedSites.breach.target);
        report.steps.scripted.breach = { botId: bot.id, structureId: scriptedSites.breach.structureId, shell: bot.spec.gun.shells[slot].name };
      }
      log(`scripted: ${JSON.stringify(report.steps.scripted)}`);
    }
    await sleep(playMs);
    // The live window is wall-clock, and a starved host runs fewer ticks in it (the receipt's 8 s window produced 1-2
    // crushes in about one run in five under load, 2026-10-03). Extend it, up to three times its length, until the
    // host has produced the few crushes the judgement below needs; an idle machine never waits past playMs.
    const liveCrushCount = () => uniqueBy(hostEventsBetween(marks.playStart, now(), 'world_prop_destroyed'), (e) => `${e.tick}:${e.index}`);
    for (let waited = playMs; waited < playMs * 3 && liveCrushCount() < minLiveCrushes; waited += 1000) await sleep(1000);
    marks.playEnd = now();
    const liveCrushes = hostEventsBetween(marks.playStart, marks.playEnd, 'world_prop_destroyed');
    report.steps.live = { seconds: Math.round(marks.playEnd - marks.playStart) / 1000, hostCrushes: uniqueBy(liveCrushes, (e) => `${e.tick}:${e.index}`), hostImpacts: uniqueBy(hostEventsBetween(marks.playStart, marks.playEnd, 'shell_impact'), (e) => e.key), hostHits: uniqueBy(hostEventsBetween(marks.playStart, marks.playEnd, 'shell_hit'), (e) => e.key), hostTick: core1.core.actor.tick };
    log(`live: ${report.steps.live.hostCrushes} crushes, ${report.steps.live.hostImpacts} shell impacts, ${report.steps.live.hostHits} hits on the host in ${report.steps.live.seconds} s`);

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
    // What the elected seat knows fell, read here independently of the boot (nothing new arrives on the dead link): the
    // newer of the sealed keyframe (opened with the room's host secret, as the seat will) and its own newest frame, plus
    // every fall the old host sent it — a fall's event reaches the seat the tick it happens, its frame up to two ticks later,
    // and a host that dies between the two leaves the fall in the seat's events alone (fix/mp-migration-props, 2026-10-02).
    // The close is graceful in this harness (what was sent before it arrives), so everything sent was received.
    const retainedAtClose = p2.session.match?.retainedMigration();
    const latestAtClose = retainedAtClose?.latestFrame ?? null;
    let keyframeAtClose = null;
    if (retainedAtClose?.keyframe) {
      const hostSecret = createHash('sha256').update(`${SECRET}:${p2.session.round.matchStart.matchId}`).digest('hex');
      const sealed = decodeMigrationKeyframe(await openMigrationBlob(await deriveMigrationKey(hostSecret), retainedAtClose.keyframe.blob));
      keyframeAtClose = { tick: sealed.tick, destroyed: sealed.frame.destroyed, revision: sealed.frame.meta.destructibleRevision };
    }
    const latestBase = latestAtClose ? { tick: latestAtClose.tick, destroyed: latestAtClose.destroyed, revision: latestAtClose.meta.destructibleRevision } : null;
    const bootBase = keyframeAtClose && (!latestBase || keyframeAtClose.tick >= latestBase.tick) ? { ...keyframeAtClose, source: 'keyframe' } : latestBase ? { ...latestBase, source: 'frame' } : null;
    const fallsSentToSeat = new Set(hostLog.filter((e) => e.host === 'p1' && e.viewerId === 'p2' && e.type === 'world_prop_destroyed').map((e) => e.index));
    const knownBySeat = new Set([...(bootBase?.destroyed ?? []), ...fallsSentToSeat]);
    const knownFromEventsOnly = [...knownBySeat].filter((index) => !(bootBase?.destroyed ?? []).includes(index));
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
      oldHostTick, resumedTick: core2.core.actor.tick, destroyedOld: destroyedOld.indices.length, revisionOld: destroyedOld.revision,
      bootBase: bootBase?.source ?? null, baseTick: bootBase?.tick ?? null, keyframeTick: keyframeAtClose?.tick ?? null, latestTick: latestBase?.tick ?? null, baseDestroyed: bootBase?.destroyed.length ?? -1, baseRevision: bootBase?.revision ?? -1,
      knownBySeat: knownBySeat.size, knownFromEventsOnly: knownFromEventsOnly.length, knownNotRestored: [...knownBySeat].filter((index) => !newSet.has(index)).length,
      destroyedNewAtBoot: destroyedNew.indices.length, revisionNewAtBoot: destroyedNew.revision,
      restored: destroyedOld.indices.filter((i) => newSet.has(i)).length, lostOnMigration: destroyedOld.indices.filter((i) => !newSet.has(i)).length, inventedOnMigration: destroyedNew.indices.filter((i) => !oldSet.has(i)).length,
    };
    log(`migration: old host had ${report.steps.migration.destroyedOld} destroyed (revision ${report.steps.migration.revisionOld}); the seat knew ${report.steps.migration.knownBySeat} (its ${report.steps.migration.bootBase} at tick ${report.steps.migration.baseTick}: ${report.steps.migration.baseDestroyed}, ${report.steps.migration.knownFromEventsOnly} more from events); the new host booted with ${report.steps.migration.destroyedNewAtBoot} (revision ${report.steps.migration.revisionNewAtBoot}): ${report.steps.migration.restored} restored, ${report.steps.migration.lostOnMigration} lost`);
    await sleep(afterMs);
    marks.migrationPlayEnd = now();
    const recrushed = hostEventsBetween(marks.newHostLiveAt, marks.migrationPlayEnd, 'world_prop_destroyed').filter((e) => e.host === 'p2' && oldSet.has(e.index));
    report.steps.migration.recrushEvents = uniqueBy(recrushed, (e) => e.key);
    // destruction: a stage the old host sent never comes again from the new one (it resumed from the log)
    const oldStages = new Set(hostLog.filter((e) => e.type === 'structure_stage' && e.host === 'p1').map((e) => e.key));
    report.steps.migration.oldStages = oldStages.size;
    report.steps.migration.restagedEvents = uniqueBy(hostEventsBetween(marks.newHostLiveAt, marks.migrationPlayEnd, 'structure_stage')
      .filter((e) => e.host === 'p2' && oldStages.has(e.key)), (e) => e.key);
    const oldBreaches = new Set(hostLog.filter((e) => e.type === 'structure_breach' && e.host === 'p1').map((e) => e.key));
    report.steps.migration.oldBreaches = oldBreaches.size;
    report.steps.migration.rebreachedEvents = uniqueBy(hostEventsBetween(marks.newHostLiveAt, marks.migrationPlayEnd, 'structure_breach')
      .filter((e) => e.host === 'p2' && oldBreaches.has(e.key)), (e) => e.key);
    const oldCraters = new Set(hostLog.filter((e) => e.type === 'terrain_crater' && e.host === 'p1').map((e) => e.key));
    report.steps.migration.oldCraters = oldCraters.size;
    report.steps.migration.recrateredEvents = uniqueBy(hostEventsBetween(marks.newHostLiveAt, marks.migrationPlayEnd, 'terrain_crater')
      .filter((e) => e.host === 'p2' && oldCraters.has(e.key)), (e) => e.key);
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
    loopDelay.disable();
    report.loopDelay = { p99Ms: Math.round(loopDelay.percentile(99) / 1e5) / 10, maxMs: Math.round(loopDelay.max / 1e5) / 10,
      meanMs: Math.round(loopDelay.mean / 1e5) / 10 };
    ticking = false;
    await ticker;
    for (const peer of peers) retire(peer);
    for (const { core } of hostCores) core.dispose();
    await Promise.race([rooms.close(), sleep(5000)]);
  }

  // ------------------------------------------------------------ the scripted cases' outcome
  const scriptedCases = report.steps.scripted;
  if (scriptedCases?.hedgehog) {
    const sends = hostLog.filter((e) => e.type === 'world_prop_destroyed' && scriptedCases.hedgehog.records.includes(e.index));
    const events = [...new Set(sends.map((e) => `${e.host}:${e.index}:${e.tick}`))];
    scriptedCases.hedgehog.events = events.length;
    scriptedCases.hedgehog.eventIndices = [...new Set(sends.map((e) => e.index))];
    scriptedCases.hedgehog.eventSharesCenter = sends.some((e) => scriptedCases.hedgehog.sharedCenter.includes(e.index));
  }
  if (scriptedCases?.ram) {
    const stages = hostLog.filter((e) => e.type === 'structure_stage' && e.key.startsWith(`stage:${scriptedCases.ram.structureId}:`));
    scriptedCases.ram.stages = [...new Set(stages.map((e) => e.key.split(':')[2]))];
    scriptedCases.ram.collapsed = scriptedCases.ram.stages.includes('collapsed');
  }
  if (scriptedCases?.crater) {
    const dug = hostLog.filter((e) => e.type === 'terrain_crater' && e.host === 'p1');
    scriptedCases.crater.dug = uniqueBy(dug, (e) => e.key);
  }
  if (scriptedCases?.fall) {
    const deaths = hostLog.filter((e) => e.type === 'tank_destroyed' && e.key.endsWith(`/dead:${scriptedCases.fall.botId}`));
    scriptedCases.fall.died = deaths.length > 0;
    scriptedCases.fall.cause = deaths[0]?.cause ?? null;
    scriptedCases.fall.tick = deaths[0]?.tick ?? null;
    scriptedCases.fall.presentedErrM = {};
    for (const peer of peers) for (const round of peer.rounds) {
      for (const a of round.applied) {
        if (a.kind !== 'tank:destroyed' || !a.key?.endsWith(`/dead:${scriptedCases.fall.botId}`)) continue;
        const sent = deaths.find((e) => e.viewerId === peer.id && e.key === a.key);
        const err = dist(a.pos, sent?.pos ?? null);
        if (err !== null) scriptedCases.fall.presentedErrM[`${peer.label}#${round.roundIndex}`] = Number(err.toFixed(4));
      }
    }
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
        const row = { peer: peer.label, round: round.roundIndex, kind: type, sent: sentOfKind.length, applied: 0, missing: 0, duplicate: 0, late: 0, early: 0, wrongPlace: 0, dTicks: [], dWallMs: [], posErrM: [], viaFrame: 0, viaEvent: 0, cannedDirection: 0, settled: 0, fxWithoutCrush: 0, crushWithoutFx: 0 };
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
      // an effect that names no obstacle cannot be judged: counted on its own, never read back from a shared box centre
      const unattributedFx = applied.filter((a) => a.kind === 'prop:crushed' && a.index === null);
      const ghostFx = applied.filter((a, i) => a.kind === 'prop:crushed' && a.index !== null && !used.has(i) && !everSent(a));
      // destruction: a stage this presentation applied that no judged send explains — a late joiner's settled log entry
      // (expected, settled) or an animation of older state (a finding)
      const stageSentBefore = (a) => hostLog.some((e) => e.type === 'structure_stage' && e.key === a.key && e.wallMs < round.welcomeAtMs);
      const olderStages = applied.filter((a, i) => a.kind === 'structure:stage' && !used.has(i) && stageSentBefore(a));
      const ghostStages = applied.filter((a, i) => a.kind === 'structure:stage' && !used.has(i) && !hostLog.some((e) => e.type === 'structure_stage' && e.key === a.key));
      // sections (P2): the same for holes and section falls
      const breachSentBefore = (a) => hostLog.some((e) => e.type === 'structure_breach' && e.key === a.key && e.wallMs < round.welcomeAtMs);
      const olderBreaches = applied.filter((a, i) => a.kind === 'structure:breach' && !used.has(i) && breachSentBefore(a));
      const ghostBreaches = applied.filter((a, i) => a.kind === 'structure:breach' && !used.has(i) && !hostLog.some((e) => e.type === 'structure_breach' && e.key === a.key));
      // craters: a crater older than the view is laid down settled, once; nothing is dug that the host never sent
      const craterSentBefore = (a) => hostLog.some((e) => e.type === 'terrain_crater' && e.key === a.key && e.wallMs < round.welcomeAtMs);
      const olderCraters = applied.filter((a, i) => a.kind === 'terrain:crater' && !used.has(i) && craterSentBefore(a));
      const ghostCraters = applied.filter((a, i) => a.kind === 'terrain:crater' && !used.has(i) && !hostLog.some((e) => e.type === 'terrain_crater' && e.key === a.key));
      const craterKeys = applied.filter((a) => a.kind === 'terrain:crater').map((a) => a.key);
      const cratersTwice = craterKeys.length - new Set(craterKeys).size;
      perPeer[`${peer.label}#${round.roundIndex}`] = { welcomeTick: round.welcomeTick, welcomes: round.welcomes, actors: round.actors, rosterError: round.rosterError, frames: round.frames, ghostFx: ghostFx.length,
        stagesOlderSettled: olderStages.filter((a) => a.settled).length, stagesOlderAnimated: olderStages.filter((a) => !a.settled).length, ghostStages: ghostStages.length,
        breachesOlderSettled: olderBreaches.filter((a) => a.settled).length, breachesOlderAnimated: olderBreaches.filter((a) => !a.settled).length,
        ghostBreaches: ghostBreaches.length,
        cratersOlderSettled: olderCraters.filter((a) => a.settled).length, cratersOlderAnimated: olderCraters.filter((a) => !a.settled).length, ghostCraters: ghostCraters.length, cratersTwice, unattributedFx: unattributedFx.length, unmatchedCrushes: unmatchedCrushes.length, replaysOfOlderState: predating.length, replaysAnimated: predating.filter((a) => !a.settled).length, replaysSettled: predating.filter((a) => a.settled).length,
        ownShotFlashes: applied.filter((a) => a.kind === 'weapon:predicted').length, ownShellFiredUnpredicted: applied.filter((a) => a.kind === 'shell:fired' && a.shooterId === peer.id && a.feedbackPredicted === false).length, ownShellFiredPredicted: applied.filter((a) => a.kind === 'shell:fired' && a.shooterId === peer.id && a.feedbackPredicted === true).length };
    }
  }
  report.matrix = matrix;
  report.perPeer = perPeer;
  report.hostEvents = hostLog.length;
  report.failures = failures;
  report.pass = failures.length === 0;
  report.raw = { hostLog, peers: peers.map((peer) => ({ id: peer.id, label: peer.label, rounds: peer.rounds.map((round) => ({ roundIndex: round.roundIndex, welcomeTick: round.welcomeTick, welcomeAtMs: round.welcomeAtMs, frames: round.frames, applied: round.applied })) })), marks, roomEvents: roomEvents.filter((e) => e.kind === 'host_changed' || e.kind === 'match_report') };
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
  lines.push('| seat#view | welcome tick | welcomes | actors | frames | ghost FX (prop:crushed for a prop never sent to this seat) | prop:crushed naming no obstacle | crushes of props never sent to this seat | of which replays of state older than the view | animated | settled | own flashes predicted | own shell_fired unpredicted | own shell_fired predicted |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [key, row] of Object.entries(report.perPeer)) {
    lines.push(`| ${key} | ${row.welcomeTick} | ${row.welcomes} | ${row.actors}${row.rosterError ? ` (roster: ${row.rosterError})` : ''} | ${row.frames} | ${row.ghostFx} | ${row.unattributedFx} | ${row.unmatchedCrushes} | ${row.replaysOfOlderState} | ${row.replaysAnimated} | ${row.replaysSettled} | ${row.ownShotFlashes} | ${row.ownShellFiredUnpredicted} | ${row.ownShellFiredPredicted} |`);
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
