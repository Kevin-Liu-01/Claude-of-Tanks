/**
 * MatchActor: one room's match. Owns the renderer-free authority, the 60 Hz
 * fixed-step loop, seat admission, input admission with the per-seat jitter
 * buffer, the pose history and lag-compensation hook, the 30 Hz per-viewer
 * snapshot publisher with interest management and backpressure, reliable
 * event delivery under the authority's reveal rules, chat, the verdict
 * callback and a graceful stop. Transport-agnostic (ClientLink).
 */
import '../../src/vehicles/tankFactory.ts';
import { createAuthoritativeMatch } from '../../src/sim/authoritativeMatch.ts';
import type { AuthoritativeEntity, AuthoritativeMatch, AuthoritativePlayerInput, AuthoritativePlayerRecord } from '../../src/sim/authoritativeMatch.ts';
import { matchRulesetFor, type MatchRuleset } from '../../src/sim/matchRuleset.ts';
import { normalizeGameMode, type GameModeId } from '../../src/sim/matchModes.ts';
import { SIM_DT } from '../../src/sim/movement.ts';
import { createDedicatedWorldCollision } from '../dedicatedWorldCollision.ts';
import {
  CLOSE_REASON, HELLO_CAPABILITY, INPUT_MARGIN_UNKNOWN, MAX_CLIENT_MESSAGE_BYTES, MAX_ENTITIES, MAX_SEATS, MESSAGE_TYPE,
  NO_ENTITY, NO_SEAT, NO_TICK, PROTOCOL_VERSION, SHELL_FLAGS, SNAPSHOT_HZ, TEAM, TICK_HZ,
} from '../../src/mp/wire/constants.ts';
import type { CloseReasonId, TeamId } from '../../src/mp/wire/constants.ts';
import { decodeMessage, encodeMessage, shellTypeIndex } from '../../src/mp/wire/codec.ts';
import type {
  EntityRow, EventMessage, HelloMessage, InputMessage, RosterEntry, ShellRow, SnapshotFrame, WireEvent, WireMessage,
} from '../../src/mp/wire/messages.ts';
import { captureEntityRow, captureMeta, captureViewerState, createEraIndexer } from './entityRows.ts';
import { createSeatInputBuffer, type SeatInputBuffer } from './inputBuffer.ts';
import { createLagCompensation, createLatencyTracker, type LagCompensation, type LatencyTracker } from './lagCompensation.ts';
import { createFixedStepLoop, type FixedStepLoop } from './loop.ts';
import { createViewerPublisher, type ViewerPublisher } from './publisher.ts';
import { createChatLimiter, normalizeChatText, type ChatLimiter } from './chat.ts';
import type { ClientLink } from './link.ts';
import { silentLogger, type Logger } from './log.ts';
import type { SeatClaims } from './seatToken.ts';

export type SeatTeam = 'alpha' | 'bravo' | 'spectator';

export interface ActorSeatSpec {
  seat: number;
  playerId: string;
  name: string;
  team: SeatTeam;
  specId: string;
  equipment?: readonly string[] | null;
}

export interface ActorBotSpec {
  playerId: string;
  name: string;
  team: 'alpha' | 'bravo';
  specId: string;
  difficulty?: 'easy' | 'normal' | 'hard';
}

export interface MatchVerdict {
  roomId: string;
  result: 'alpha' | 'bravo' | 'draw';
  reason: string;
  tick: number;
  battleTimeMs: number;
  entities: { entityId: number; playerId: string; bot: boolean; team: SeatTeam; kills: number; damage: number; destroyed: boolean }[];
}

export interface MatchActorOptions {
  roomId: string;
  mapId: string;
  mode?: string;
  seed: number;
  seats: ActorSeatSpec[];
  bots?: ActorBotSpec[];
  ruleset?: MatchRuleset;
  countdownS?: number;
  battleLimitS?: number;
  /** 'dedicated' loads the map's collision shard (production); 'terrain' uses the bare height field (fast receipts). */
  world?: 'dedicated' | 'terrain';
  log?: Logger;
  onVerdict?: (verdict: MatchVerdict) => void;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => () => void;
  /** Start the loop and the countdown immediately (default true). */
  autoStart?: boolean;
  /** Ticks the actor keeps publishing after the verdict before it stops (default: the ruleset's ending hold + 2 s, at least 5 s). */
  endedLingerTicks?: number;
}

export interface ActorClientStats {
  seat: number;
  entityId: number;
  playerId: string;
  spectator: boolean;
  bytesOut: number;
  bytesIn: number;
  snapshots: number;
  keyframes: number;
  droppedSnapshots: number;
  events: number;
  rttMs: number;
  rewindTicks: number;
  inputMargin: number | null;
  bufferTicks: number;
}

export interface MatchActorStats {
  roomId: string;
  mapId: string;
  mode: string;
  tick: number;
  phase: string;
  clients: number;
  spectators: number;
  seatsFilled: number;
  bots: number;
  bytesOut: number;
  bytesIn: number;
  snapshots: number;
  keyframes: number;
  droppedSnapshots: number;
  backpressureCloses: number;
  events: number;
  malformed: number;
  rejectedInputs: number;
  tickMs: { p50: number; p95: number; max: number; mean: number; count: number };
  loop: { droppedTicks: number; stalls: number; lateWakeupMaxMs: number };
  lagComp: { rewoundShots: number; rewoundSweeps: number; mismatchMeanM: number; mismatchMaxM: number; historyMisses: number };
  verdict: string | null;
}

export interface MatchActor {
  readonly roomId: string;
  readonly tick: number;
  readonly ended: boolean;
  readonly stopped: boolean;
  readonly authority: AuthoritativeMatch;
  readonly loop: FixedStepLoop;
  readonly lagComp: LagCompensation;
  /** Admit a link whose HELLO carried verified seat claims for this room. */
  attach(link: ClientLink, hello: HelloMessage, claims: SeatClaims): boolean;
  /** Inject a server-side reliable event to every viewer (roster/admin changes from the room service). */
  broadcastEvent(event: WireEvent): void;
  advance(nowMs?: number): number;
  start(): void;
  stop(reason?: CloseReasonId, detail?: string): void;
  stats(): MatchActorStats;
  clientStats(): ActorClientStats[];
}

interface ActorClient {
  link: ClientLink;
  seat: number;
  entityId: number;
  entity: AuthoritativeEntity | null;
  playerId: string;
  name: string;
  team: SeatTeam;
  viewerId: string;
  spectator: boolean;
  capabilities: number;
  input: SeatInputBuffer;
  publisher: ViewerPublisher;
  latency: LatencyTracker;
  chat: ChatLimiter;
  bytesOut: number;
  bytesIn: number;
  events: number;
  droppedSnapshots: number;
  malformed: number;
  pressureSinceMs: number | null;
  rate: { windowStartMs: number; count: number };
  closing: boolean;
}

const BACKPRESSURE_SOFT_BYTES = 64 * 1024;
const BACKPRESSURE_HARD_BYTES = 512 * 1024;
const BACKPRESSURE_SUSTAINED_MS = 2000;
const MAX_MESSAGES_PER_SECOND = 150;
const MAX_MALFORMED = 20;
const SNAPSHOT_EVERY_TICKS = TICK_HZ / SNAPSHOT_HZ;
const TICK_MS = SIM_DT * 1000;

const TEAM_ID: Record<SeatTeam, TeamId> = { alpha: TEAM.ALPHA, bravo: TEAM.BRAVO, spectator: TEAM.SPECTATOR };

function teamOf(entity: AuthoritativeEntity): SeatTeam {
  return entity.team === 'bravo' ? 'bravo' : 'alpha';
}

function clampI16(value: number): number {
  return value < -32768 ? -32768 : value > 32767 ? 32767 : value;
}

export function createMatchActor(options: MatchActorOptions): MatchActor {
  const {
    roomId, mapId, seed, seats, bots = [], countdownS = 5, battleLimitS, world = 'dedicated',
    log = silentLogger, onVerdict, now = () => performance.now(), schedule, autoStart = true,
    endedLingerTicks,
  } = options;
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(roomId)) throw new TypeError('roomId must be a safe id');
  const mode: GameModeId = normalizeGameMode(options.mode ?? 'standard');
  const ruleset = options.ruleset && options.ruleset.mode === mode ? options.ruleset : matchRulesetFor(mode);
  const actorLog = log.child({ room: roomId, map: mapId });

  // ---- roster: seats first (entity ids in seat order), then bots
  const players: AuthoritativePlayerRecord[] = [];
  const seatById = new Map<number, ActorSeatSpec>();
  const seatOfPlayer = new Map<string, ActorSeatSpec>();
  const entityIdOf = new Map<string, number>();
  const rosterEntries: RosterEntry[] = [];
  let nextEntityId = 1;
  for (const spec of seats) {
    if (!Number.isInteger(spec.seat) || spec.seat < 0 || spec.seat >= MAX_SEATS || seatById.has(spec.seat)) {
      throw new TypeError(`invalid or duplicate seat ${spec.seat}`);
    }
    if (seatOfPlayer.has(spec.playerId)) throw new TypeError(`duplicate player ${spec.playerId}`);
    seatById.set(spec.seat, spec);
    seatOfPlayer.set(spec.playerId, spec);
    if (spec.team === 'spectator') continue;
    const entityId = nextEntityId++;
    entityIdOf.set(spec.playerId, entityId);
    players.push({ id: spec.playerId, specId: spec.specId, team: spec.team, equipment: spec.equipment ?? null });
    rosterEntries.push({ entityId, seat: spec.seat, team: TEAM_ID[spec.team], bot: false, connected: false, playerId: spec.playerId, name: spec.name, specId: spec.specId });
  }
  for (const bot of bots) {
    if (seatOfPlayer.has(bot.playerId) || entityIdOf.has(bot.playerId)) throw new TypeError(`duplicate bot ${bot.playerId}`);
    const entityId = nextEntityId++;
    entityIdOf.set(bot.playerId, entityId);
    players.push({ id: bot.playerId, specId: bot.specId, team: bot.team, bot: true, difficulty: bot.difficulty ?? 'normal' });
    rosterEntries.push({ entityId, seat: NO_SEAT, team: TEAM_ID[bot.team], bot: true, connected: true, playerId: bot.playerId, name: bot.name, specId: bot.specId });
  }
  if (players.length < 1 || players.length > MAX_ENTITIES) throw new TypeError(`rooms field 1..${MAX_ENTITIES} entities`);

  // ---- authority and world
  const collision = world === 'dedicated' ? createDedicatedWorldCollision(mapId, { retain: true }) : null;
  const releaseWorld = () => collision?.release();
  let authority: AuthoritativeMatch;
  let lagComp: LagCompensation;
  try {
    const bound: { hook: LagCompensation | null } = { hook: null };
    authority = createAuthoritativeMatch({
      players, mapId, seed, countdownS, gameMode: mode, ruleset,
      ...(battleLimitS != null ? { battleLimitS } : {}),
      worldCollision: collision,
      shellRewind: { begin: (shell) => bound.hook?.begin(shell), end: (shell) => bound.hook?.end(shell) },
    });
    lagComp = createLagCompensation({ entities: authority.entities });
    bound.hook = lagComp;
  } catch (error) {
    releaseWorld();
    throw error;
  }
  const entityByWireId = new Map<number, AuthoritativeEntity>();
  for (const entity of authority.entities) {
    const entityId = entityIdOf.get(entity.id)!;
    entityByWireId.set(entityId, entity);
    lagComp.bind(entity, entityId - 1);
  }
  const era = createEraIndexer();
  const rulesetJson = JSON.stringify(ruleset);

  // ---- clients
  const clients = new Map<ActorClient, true>();
  const clientBySeat = new Map<number, ActorClient>();
  const rowCache = new Map<number, EntityRow>();
  let rowCacheTick = -1;
  let sortedDestroyed: number[] = [];
  let destroyedRevision = -1;
  const totals = { bytesOut: 0, bytesIn: 0, snapshots: 0, keyframes: 0, droppedSnapshots: 0, backpressureCloses: 0, events: 0, malformed: 0, rejectedInputs: 0 };
  let ended = false;
  let stopped = false;
  let verdict: MatchVerdict | null = null;
  let verdictTick = -1;
  const inputs = new Map<string, AuthoritativePlayerInput | null>();

  function serverTimeMs(tick: number): number { return Math.round(tick * TICK_MS); }

  function send(client: ActorClient, bytes: Uint8Array): boolean {
    if (client.closing || client.link.closed) return false;
    try {
      client.link.send(bytes);
    } catch {
      detach(client, CLOSE_REASON.INTERNAL_ERROR, 'send failed');
      return false;
    }
    client.bytesOut += bytes.byteLength;
    totals.bytesOut += bytes.byteLength;
    return true;
  }

  function sendMessage(client: ActorClient, message: WireMessage): boolean {
    return send(client, encodeMessage(message));
  }

  function sendError(client: ActorClient, reason: CloseReasonId, detail: string): void {
    sendMessage(client, { type: MESSAGE_TYPE.ERROR, reason, detail });
  }

  function detach(client: ActorClient, reason: CloseReasonId, detail = ''): void {
    if (client.closing) return;
    client.closing = true;
    clients.delete(client);
    if (clientBySeat.get(client.seat) === client) clientBySeat.delete(client.seat);
    if (client.entity) {
      authority.onPeerLeave({ peerId: client.entity.id });
      lagComp.setRewindTicks(client.entity.id, 0);
      const entry = rosterEntries.find((row) => row.entityId === client.entityId);
      if (entry) entry.connected = false;
    }
    client.link.close(reason, detail);
    actorLog.info('client detached', { seat: client.seat, player: client.playerId, reason, detail });
    if (client.entity) {
      broadcastEvent({ kind: 'roster', payload: { entityId: client.entityId, playerId: client.playerId, connected: false, reason } });
    }
  }

  function broadcastEvent(event: WireEvent): void {
    const message: EventMessage = { type: MESSAGE_TYPE.EVENT, tick: loop.tick, events: [event] };
    let bytes: Uint8Array;
    try { bytes = encodeMessage(message); } catch (error) {
      actorLog.warn('event dropped', { kind: event.kind, error: String(error) });
      return;
    }
    for (const client of clients.keys()) if (send(client, bytes)) { client.events++; totals.events++; }
  }

  function rateLimited(client: ActorClient, nowMs: number): boolean {
    if (nowMs - client.rate.windowStartMs >= 1000) { client.rate.windowStartMs = nowMs; client.rate.count = 0; }
    client.rate.count++;
    return client.rate.count > MAX_MESSAGES_PER_SECOND;
  }

  function receive(client: ActorClient, bytes: Uint8Array): void {
    if (client.closing) return;
    const nowMs = now();
    client.bytesIn += bytes.byteLength;
    totals.bytesIn += bytes.byteLength;
    if (rateLimited(client, nowMs)) { detach(client, CLOSE_REASON.RATE_LIMITED, 'message rate'); return; }
    const decoded = decodeMessage(bytes, { maxBytes: MAX_CLIENT_MESSAGE_BYTES });
    if (!decoded.ok) {
      client.malformed++;
      totals.malformed++;
      if (client.malformed > MAX_MALFORMED) { detach(client, CLOSE_REASON.MALFORMED, decoded.error.code); return; }
      sendError(client, CLOSE_REASON.MALFORMED, decoded.error.code);
      return;
    }
    const message = decoded.message;
    switch (message.type) {
      case MESSAGE_TYPE.INPUT: receiveInput(client, message, nowMs); return;
      case MESSAGE_TYPE.SNAPSHOT_ACK: acknowledge(client, message.tick, nowMs); return;
      case MESSAGE_TYPE.PING:
        acknowledge(client, message.snapshotAckTick, nowMs);
        sendMessage(client, { type: MESSAGE_TYPE.PONG, clientTimeMs: message.clientTimeMs, serverTimeMs: serverTimeMs(loop.tick), serverTick: loop.tick });
        return;
      case MESSAGE_TYPE.CHAT: receiveChat(client, message.text, nowMs); return;
      case MESSAGE_TYPE.LEAVE: detach(client, CLOSE_REASON.CLIENT_LEAVE); return;
      default:
        sendError(client, CLOSE_REASON.UNEXPECTED_MESSAGE, `type ${message.type}`);
    }
  }

  function acknowledge(client: ActorClient, tick: number, nowMs: number): void {
    const rtt = client.publisher.ack(tick, nowMs);
    if (rtt != null) {
      client.latency.sampleRtt(rtt);
      if (client.entity) lagComp.setRewindTicks(client.entity.id, client.latency.rewindTicks(TICK_MS));
    }
  }

  function receiveInput(client: ActorClient, frame: InputMessage, nowMs: number): void {
    if (!client.entity) { sendError(client, CLOSE_REASON.NOT_SEATED, 'spectators send no input'); return; }
    const admitted = client.input.admit(frame, loop.tick);
    if (admitted.farAhead) {
      totals.rejectedInputs++;
      sendError(client, CLOSE_REASON.INPUT_TOO_FAR_AHEAD, `tick ${frame.clientTick} vs ${loop.tick}`);
      return;
    }
    acknowledge(client, frame.snapshotAckTick, nowMs);
    client.latency.setInterpDelayMs(frame.interpDelayMs);
    lagComp.setRewindTicks(client.entity.id, client.latency.rewindTicks(TICK_MS));
  }

  function receiveChat(client: ActorClient, raw: string, nowMs: number): void {
    const text = normalizeChatText(raw);
    if (!text) { sendError(client, CLOSE_REASON.CHAT_REJECTED, 'empty or invalid'); return; }
    if (!client.chat.admit(nowMs)) { sendError(client, CLOSE_REASON.CHAT_REJECTED, 'rate limited'); return; }
    broadcastEvent({ kind: 'chat', payload: {
      seat: client.seat, entityId: client.entityId, playerId: client.playerId, name: client.name, team: client.team, text, tick: loop.tick,
    } });
  }

  // ---- per-tick pipeline
  function collectInputs(tick: number): Map<string, AuthoritativePlayerInput | null> {
    inputs.clear();
    for (const client of clients.keys()) {
      if (client.entity) inputs.set(client.entity.id, client.input.inputFor(tick));
    }
    return inputs;
  }

  function deliverEvents(tick: number): void {
    if (authority.pendingEventCount === 0) return;
    for (const client of clients.keys()) {
      const events = authority.eventsForViewer(client.viewerId);
      if (!events.length) continue;
      const message: EventMessage = {
        type: MESSAGE_TYPE.EVENT, tick,
        events: events.map((event) => ({ kind: String(event.type), payload: event as Record<string, unknown> })),
      };
      let bytes: Uint8Array;
      try { bytes = encodeMessage(message); } catch (error) {
        actorLog.warn('event batch dropped', { player: client.playerId, error: String(error) });
        continue;
      }
      if (send(client, bytes)) { client.events += events.length; totals.events += events.length; }
    }
    authority.afterEventBroadcast();
  }

  function rowFor(entity: AuthoritativeEntity, entityId: number, tick: number): EntityRow {
    if (rowCacheTick !== tick) { rowCache.clear(); rowCacheTick = tick; }
    let row = rowCache.get(entityId);
    if (!row) { row = captureEntityRow(entity, entityId, era); rowCache.set(entityId, row); }
    return row;
  }

  function destroyedList(meta: Record<string, unknown> | null): number[] {
    const revision = Number(meta?.destructibleRevision) || 0;
    if (revision !== destroyedRevision) {
      const indices = Array.isArray(meta?.destroyedObstacleIndices) ? meta.destroyedObstacleIndices as number[] : [];
      sortedDestroyed = [...new Set(indices.filter((index) => Number.isInteger(index) && index >= 0))].sort((a, b) => a - b);
      destroyedRevision = revision;
    }
    return sortedDestroyed;
  }

  function buildFrame(client: ActorClient, tick: number): SnapshotFrame {
    const snapshot = authority.snapshot({ tick, serverTimeMs: serverTimeMs(tick), viewerId: client.viewerId, ackInputSeq: null });
    const entities: EntityRow[] = [];
    for (const row of snapshot.entities) {
      const entityId = entityIdOf.get(row.id);
      const entity = entityId == null ? null : entityByWireId.get(entityId);
      if (!entity || entityId == null) continue;
      entities.push(rowFor(entity, entityId, tick));
    }
    entities.sort((a, b) => a.entityId - b.entityId);
    const shells: ShellRow[] = [];
    for (const shell of snapshot.shells) {
      const shooter = entityIdOf.get(shell.shooterId) ?? NO_ENTITY;
      shells.push({
        id: shell.id & 0xffff, shooterEntityId: shooter,
        x: shell.x * 10, y: shell.y * 10, z: shell.z * 10,
        vx: clampI16(Math.round(shell.vx / 10)), vy: clampI16(Math.round(shell.vy / 10)), vz: clampI16(Math.round(shell.vz / 10)),
        shellType: shellTypeIndex(shell.type), flags: shell.guided ? SHELL_FLAGS.GUIDED : 0,
      });
    }
    const meta = snapshot.meta;
    const margin = client.input.marginTicks;
    return {
      tick,
      serverTimeMs: serverTimeMs(tick),
      ackedInputTick: client.input.lastAppliedTick < 0 ? NO_TICK : client.input.lastAppliedTick,
      ackedFireSeq: Math.max(0, client.input.lastAppliedFireSeq),
      ackedActionSeq: Math.max(0, client.input.lastAppliedActionSeq),
      inputMarginTicks: margin == null ? INPUT_MARGIN_UNKNOWN : Math.max(-128, Math.min(126, margin)),
      meta: captureMeta(meta, ended),
      destroyed: destroyedList(meta),
      entities,
      shells,
      viewer: client.entity ? captureViewerState(client.entityId, meta?.localPrediction) : null,
      modeStateJson: meta?.modeState ? JSON.stringify(meta.modeState) : null,
    };
  }

  function publishSnapshots(tick: number): void {
    const nowMs = now();
    for (const client of [...clients.keys()]) {
      const buffered = client.link.bufferedAmount;
      if (buffered > BACKPRESSURE_HARD_BYTES) {
        totals.backpressureCloses++;
        detach(client, CLOSE_REASON.BACKPRESSURE, `${buffered} bytes buffered`);
        continue;
      }
      if (buffered > BACKPRESSURE_SOFT_BYTES) {
        // at most one unsent snapshot per client: the stale one is dropped, never queued behind
        client.droppedSnapshots++;
        totals.droppedSnapshots++;
        if (client.pressureSinceMs == null) client.pressureSinceMs = nowMs;
        else if (nowMs - client.pressureSinceMs > BACKPRESSURE_SUSTAINED_MS) {
          totals.backpressureCloses++;
          detach(client, CLOSE_REASON.BACKPRESSURE, 'sustained');
        }
        continue;
      }
      client.pressureSinceMs = null;
      const { bytes, keyframe } = client.publisher.publish(buildFrame(client, tick), nowMs);
      if (send(client, bytes)) {
        totals.snapshots++;
        if (keyframe) totals.keyframes++;
      }
    }
    authority.afterSnapshotBroadcast();
  }

  /** Ticks published past the verdict: the configured linger, else the ruleset's ending hold plus two seconds (never under 5 s). */
  function lingerTicks(): number {
    if (endedLingerTicks !== undefined) return endedLingerTicks;
    const holdS = typeof authority.endingHoldS === 'number' && Number.isFinite(authority.endingHoldS) ? authority.endingHoldS : 0;
    return Math.max(TICK_HZ * 5, Math.ceil((holdS + 2) * TICK_HZ));
  }

  function settleVerdict(tick: number): void {
    if (verdict || !authority.result) return;
    ended = true;
    verdictTick = tick;
    verdict = {
      roomId,
      result: authority.result,
      reason: authority.resultReason ?? '',
      tick,
      battleTimeMs: Math.round(authority.timeS * 1000),
      entities: authority.entities.map((entity) => ({
        entityId: entityIdOf.get(entity.id)!, playerId: entity.id, bot: entity.bot, team: teamOf(entity),
        kills: entity.kills, damage: Math.round(entity.damage), destroyed: entity.combat.destroyed,
      })),
    };
    actorLog.info('verdict', { result: verdict.result, reason: verdict.reason, tick });
    try { onVerdict?.(verdict); } catch (error) { actorLog.error('verdict callback failed', { error: String(error) }); }
  }

  function onTick(tick: number, dt: number): void {
    if (stopped) return;
    // battle endings (2026-09-25): the authority keeps stepping through the ruleset's post-verdict hold
    // (guns silenced, shells in flight landing, the mode controller settling — authoritativeMatch endingHoldS)
    // and stands still by itself once the hold expires, so the ending replay or camera beat plays over a live field.
    authority.step({ dt, inputs: collectInputs(tick) });
    if (!ended) lagComp.record(tick);
    deliverEvents(tick);
    settleVerdict(tick);
    if (tick % SNAPSHOT_EVERY_TICKS === 0) publishSnapshots(tick);
    if (ended && tick - verdictTick >= lingerTicks()) stop(CLOSE_REASON.MATCH_ENDED, verdict?.result ?? '');
  }

  const loop = createFixedStepLoop({
    tickMs: TICK_MS,
    now,
    ...(schedule ? { schedule } : {}),
    onTick,
    onError: (error) => actorLog.error('tick failed', { tick: loop.tick, error: error instanceof Error ? error.stack ?? error.message : String(error) }),
  });

  function start(): void {
    if (stopped) return;
    if (authority.phase === 'loading') authority.onMatchReady();
    loop.start();
  }

  function stop(reason: CloseReasonId = CLOSE_REASON.ROOM_CLOSED, detail = ''): void {
    if (stopped) return;
    stopped = true;
    loop.stop();
    for (const client of [...clients.keys()]) detach(client, reason, detail);
    releaseWorld();
    actorLog.info('actor stopped', { reason, tick: loop.tick });
  }

  function attach(link: ClientLink, hello: HelloMessage, claims: SeatClaims): boolean {
    if (stopped) { link.close(CLOSE_REASON.ROOM_CLOSED, 'match over'); return false; }
    if (hello.protocolVersion !== PROTOCOL_VERSION) { link.close(CLOSE_REASON.PROTOCOL_VERSION, `server ${PROTOCOL_VERSION}`); return false; }
    if (claims.roomId !== roomId) { link.close(CLOSE_REASON.ROOM_UNKNOWN, 'token is for another room'); return false; }
    const seatSpec = seatById.get(claims.seat);
    if (!seatSpec || seatSpec.playerId !== claims.playerId) { link.close(CLOSE_REASON.BAD_TOKEN, 'seat does not match the roster'); return false; }
    const previous = clientBySeat.get(claims.seat);
    if (previous) detach(previous, CLOSE_REASON.REPLACED, 'seat reconnected');
    const spectator = seatSpec.team === 'spectator';
    const entityId = spectator ? NO_ENTITY : entityIdOf.get(seatSpec.playerId)!;
    const entity = spectator ? null : entityByWireId.get(entityId)!;
    const client: ActorClient = {
      link, seat: claims.seat, entityId, entity, playerId: seatSpec.playerId, name: seatSpec.name, team: seatSpec.team,
      viewerId: spectator ? `spectator:${seatSpec.playerId}` : seatSpec.playerId, spectator,
      capabilities: hello.capabilities & HELLO_CAPABILITY.SHOT_FEEDBACK,
      input: createSeatInputBuffer(), publisher: createViewerPublisher(), latency: createLatencyTracker(), chat: createChatLimiter(),
      bytesOut: 0, bytesIn: 0, events: 0, droppedSnapshots: 0, malformed: 0, pressureSinceMs: null,
      rate: { windowStartMs: now(), count: 0 }, closing: false,
    };
    clients.set(client, true);
    clientBySeat.set(client.seat, client);
    link.onMessage((bytes) => receive(client, bytes));
    link.onClose(() => detach(client, CLOSE_REASON.NONE, 'link closed'));
    if (entity) {
      authority.onPeerJoin({ peerId: entity.id });
      const entry = rosterEntries.find((row) => row.entityId === entityId);
      if (entry) entry.connected = true;
    }
    const welcomed = sendMessage(client, {
      type: MESSAGE_TYPE.WELCOME,
      protocolVersion: PROTOCOL_VERSION, tickHz: TICK_HZ, snapshotHz: SNAPSHOT_HZ,
      seat: client.seat, entityId, team: TEAM_ID[seatSpec.team],
      serverTick: loop.tick, serverTimeMs: serverTimeMs(loop.tick), seed: seed >>> 0, capabilities: client.capabilities,
      roomId, mapId, mode, rulesetJson, roster: rosterEntries.map((row) => ({ ...row })),
    });
    if (!welcomed) return false;
    actorLog.info('client welcomed', { seat: client.seat, player: client.playerId, spectator, build: hello.clientBuild.slice(0, 32) });
    if (entity) broadcastEvent({ kind: 'roster', payload: { entityId, playerId: client.playerId, connected: true } });
    return true;
  }

  function clientStats(): ActorClientStats[] {
    return [...clients.keys()].map((client) => ({
      seat: client.seat, entityId: client.entityId, playerId: client.playerId, spectator: client.spectator,
      bytesOut: client.bytesOut, bytesIn: client.bytesIn, snapshots: client.publisher.stats.keyframes + client.publisher.stats.deltas,
      keyframes: client.publisher.stats.keyframes, droppedSnapshots: client.droppedSnapshots, events: client.events,
      rttMs: client.latency.owdMs * 2, rewindTicks: client.latency.rewindTicks(TICK_MS),
      inputMargin: client.input.marginTicks, bufferTicks: client.input.bufferTicks,
    }));
  }

  function stats(): MatchActorStats {
    let spectators = 0;
    for (const client of clients.keys()) if (client.spectator) spectators++;
    const lag = lagComp.stats;
    return {
      roomId, mapId, mode, tick: loop.tick, phase: ended ? 'ended' : authority.phase,
      clients: clients.size, spectators, seatsFilled: clients.size - spectators, bots: bots.length,
      ...totals,
      tickMs: loop.tickCost.summary(),
      loop: { droppedTicks: loop.stats.droppedTicks, stalls: loop.stats.stalls, lateWakeupMaxMs: loop.stats.lateWakeupMaxMs },
      lagComp: {
        rewoundShots: lag.rewoundShots, rewoundSweeps: lag.rewoundSweeps,
        mismatchMeanM: lag.rewoundShots ? lag.mismatchSumM / lag.rewoundShots : 0, mismatchMaxM: lag.mismatchMaxM, historyMisses: lag.historyMisses,
      },
      verdict: verdict ? verdict.result : null,
    };
  }

  if (autoStart) start();

  return {
    roomId,
    get tick() { return loop.tick; },
    get ended() { return ended; },
    get stopped() { return stopped; },
    authority,
    loop,
    lagComp,
    attach,
    broadcastEvent,
    advance: (nowMs) => loop.advance(nowMs),
    start,
    stop,
    stats,
    clientStats,
  };
}
