/**
 * MatchActor: one room's match. Owns the renderer-free authority, the 60 Hz
 * fixed-step loop, seat admission, input admission with the per-seat jitter
 * buffer, the pose history and lag-compensation hook, the per-viewer
 * snapshot publisher (20 Hz by default; interest tiers, per-peer skips), reliable
 * event delivery under the authority's reveal rules, chat, the verdict
 * callback and a graceful stop. Transport-agnostic (ClientLink).
 *
 * Vehicles: the spec-only authority fleet (src/vehicles/authorityFleet.ts), never the fleet's geometry. The caller
 * loads the roster's combat anatomy first (`ensureAuthorityFleet`: the browser host at boot, the Node service at
 * start); the actor refuses a roster whose calibration groups never loaded.
 */
import type { DestructionLogEntry } from '../../src/sim/destructionEvents.ts';
import { quantizeDestructionEntry } from '../../src/mp/wire/destructionLog.ts';
import { requireAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';
import { createAuthoritativeMatch } from '../../src/sim/authoritativeMatch.ts';
import type {
  AuthoritativeEntity, AuthoritativeMatch, AuthoritativePlayerInput, AuthoritativePlayerRecord, AuthoritativeWorldCollision,
} from '../../src/sim/authoritativeMatch.ts';
import { matchRulesetFor, terrainVariantFor, type MatchRuleset } from '../../src/sim/matchRuleset.ts';
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
  EntityRow, EventMessage, HelloMessage, InputMessage, ResumeHintMessage, RosterEntry, ShellRow, SnapshotFrame, WireEvent, WireMessage,
} from '../../src/mp/wire/messages.ts';
import { dequantizeAngle, dequantizePosition, dequantizeVelocity } from '../../src/mp/wire/quantize.ts';
import { captureEntityRow, captureMeta, captureViewerState, createEraIndexer } from './entityRows.ts';
import {
  INTEREST_ENGAGED_TICKS, INTEREST_NEAR_MISS_M, beginSnapshot, createViewerInterest, engageEntity, needsFreshRow, recordRow, viewerTierFor,
} from './interestTiers.ts';
import type { InterestTier, ViewerInterest } from './interestTiers.ts';
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
  /** A spawn override (the receipts place hulls at known distances); the layout's spawn otherwise. */
  spawn?: { x: number; z: number; yaw?: number };
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

/** A ready collision world the caller built (the browser host: the fetched manifest through createHeadlessCollisionWorld). */
export interface ActorWorldCollision extends AuthoritativeWorldCollision {
  release?(): void;
}

/**
 * Peer-to-peer host migration (P2 client lane, 2026-09-28): the elected host boots the actor at the authority tick the
 * match reached (the tick timeline stays continuous with the old host's, so every client's server clock and input lead
 * still fit) with the battle clock already at `battleTimeMs`; the countdown is skipped, the entities are restored by
 * the host runtime from the retained keyframe before the loop starts.
 */
export interface MatchActorResume {
  tick: number;
  battleTimeMs: number;
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
  /**
   * 'dedicated' loads the map's collision shard (production, Node); 'terrain' uses the bare height field (fast
   * receipts); an object is a ready world (the browser host builds it from the fetched manifest).
   */
  world?: 'dedicated' | 'terrain' | ActorWorldCollision;
  resume?: MatchActorResume | null;
  log?: Logger;
  onVerdict?: (verdict: MatchVerdict) => void;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => () => void;
  /** Start the loop and the countdown immediately (default true). */
  autoStart?: boolean;
  /** Ticks the actor keeps publishing after the verdict before it stops (default: the ruleset's ending hold + 2 s, at least 5 s). */
  endedLingerTicks?: number;
  /** Snapshots per second for the near tier (SNAPSHOT_HZ by default; must divide TICK_HZ). The WELCOME names it; the tiers halve and third it. */
  snapshotHz?: number;
}

/** Rows the interest tiers published (refreshed) and held per tier (P3b, 2026-09-29). */
export interface InterestStats {
  /** Rows refreshed per tier (near, mid, far), cumulative. */
  published: [number, number, number];
  /** Rows carried over unchanged, cumulative. */
  held: number;
  /** Entities per tier in the newest snapshot (summed over viewers on the actor total). */
  population: [number, number, number];
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
  interest: InterestStats;
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
  snapshotHz: number;
  lagComp: { rewoundShots: number; rewoundSweeps: number; mismatchMeanM: number; mismatchMaxM: number; historyMisses: number };
  verdict: string | null;
  interest: InterestStats;
  resumeHints: ResumeHintStats;
}

/** The migration seed for unseen hulls (P3b, 2026-09-29; docs/MULTIPLAYER-V2.md §13.9.5): resume hints applied and refused, by reason. */
export interface ResumeHintStats {
  applied: number;
  rejected: number;
  reasons: { noResume: number; notRestored: number; repeated: number; older: number; future: number; tooFar: number; noSeat: number };
}

export interface MatchActor {
  readonly roomId: string;
  /** The ruleset the match plays by (the WELCOME's rulesetJson): the mode's table bent by the room's arrangement. */
  readonly ruleset: MatchRuleset;
  readonly tick: number;
  readonly ended: boolean;
  readonly stopped: boolean;
  readonly authority: AuthoritativeMatch;
  readonly loop: FixedStepLoop;
  readonly lagComp: LagCompensation;
  /** Admit a link whose HELLO carried verified seat claims for this room. */
  attach(link: ClientLink, hello: HelloMessage, claims: SeatClaims): boolean;
  /** The authority entity behind a wire entity id (1..64), null for an unknown id. */
  entityForWireId(entityId: number): AuthoritativeEntity | null;
  /** The wire entity id of a player or bot id, null for an unknown one. */
  wireIdOf(playerId: string): number | null;
  /** Battle time the actor resumed at (0 for a fresh match): every published battle clock adds it. */
  readonly resumedBattleTimeMs: number;
  /**
   * The row an entity was restored from at a migration (`applyResumeState` names it): a later RESUME_HINT from that
   * entity's own seat is applied only when it is newer than this row and within the distance the hull could have driven
   * since — the migration seed for a hull the new host could not see (P3b).
   */
  noteRestoredRow(entityId: number, tick: number, x: number, z: number): void;
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
  interest: ViewerInterest;
  latency: LatencyTracker;
  chat: ChatLimiter;
  bytesOut: number;
  bytesIn: number;
  events: number;
  droppedSnapshots: number;
  malformed: number;
  pressureSinceMs: number | null;
  /** The message-rate token bucket: `tokens` refill at MAX_MESSAGES_PER_SECOND up to MESSAGE_BURST. */
  rate: { tokens: number; lastMs: number };
  closing: boolean;
}

/**
 * Per-peer rate adaptation (P3b, 2026-09-29; docs/MULTIPLAYER-V2.md §13.9.3): a viewer whose link holds more than
 * SNAPSHOT_SKIP_BYTES unsent (≈ 0.7 s of snapshots at 14v14) has this snapshot skipped — never delayed, never queued
 * behind — so a slow peer only ever falls a snapshot behind and never slows the others; above the soft bound for
 * BACKPRESSURE_SUSTAINED_MS, or the hard bound at once, the link closes as BACKPRESSURE.
 */
export const SNAPSHOT_SKIP_BYTES = 16 * 1024;
/**
 * How many snapshots apart the viewer's movement checkpoint (the 48-float integrator state its prediction rewinds to)
 * rides: every one. It is 48 of ≈ 206 kbit/s per viewer at 30 Hz (P3b's attribution, 2026-09-29) and a 10 Hz cadence
 * was tried: 3 cm of own misprediction in `snapshotRate.selftest`, but at 14v14 in the soak 257 hard snaps and 1.19 m
 * of end desync against 60 and 0.15 m with a checkpoint every snapshot — the predictor replaying from the row alone
 * between checkpoints diverges under contact. Not taken; the knob stays for a later measured cut.
 */
export const VIEWER_CHECKPOINT_EVERY_SNAPSHOTS = 1;
const BACKPRESSURE_SOFT_BYTES = 64 * 1024;
const BACKPRESSURE_HARD_BYTES = 512 * 1024;
const BACKPRESSURE_SUSTAINED_MS = 2000;
const MAX_MESSAGES_PER_SECOND = 150;
/**
 * The message-rate limit is a token bucket (P3b, 2026-09-29): a client sends ≈ 65 messages a second (inputs at 60 Hz
 * and pings), and the old fixed one-second window closed every peer of a browser host whose main thread stalled for two
 * seconds — the game page's battle reveal compiled shaders while its actor already ran, the peers' frames queued on the
 * main thread and reached the Worker in one burst (the realism soak, 2026-09-29). A backlog of a few seconds of honest
 * traffic now passes; a flood still trips within seconds (900 tokens at 150 a second: a 1,000 messages/s sender is
 * closed in about a second).
 */
const MESSAGE_BURST = 900;
const MAX_MALFORMED = 20;
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
    roomId, mapId, seed, seats, bots = [], battleLimitS, world = 'dedicated',
    log = silentLogger, onVerdict, now = () => performance.now(), schedule, autoStart = true,
    endedLingerTicks, resume = null,
  } = options;
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(roomId)) throw new TypeError('roomId must be a safe id');
  if (resume && (!Number.isInteger(resume.tick) || resume.tick < 0 || !(resume.battleTimeMs >= 0) || !Number.isFinite(resume.battleTimeMs))) {
    throw new TypeError('resume needs an integer tick >= 0 and a finite battleTimeMs >= 0');
  }
  const mode: GameModeId = normalizeGameMode(options.mode ?? 'standard');
  const ruleset = options.ruleset && options.ruleset.mode === mode ? options.ruleset : matchRulesetFor(mode);
  const snapshotHz = options.snapshotHz ?? SNAPSHOT_HZ;
  if (!Number.isInteger(snapshotHz) || snapshotHz < 1 || snapshotHz > TICK_HZ || TICK_HZ % snapshotHz !== 0) {
    throw new TypeError(`snapshotHz must be an integer divisor of ${TICK_HZ} (${snapshotHz})`);
  }
  const snapshotEveryTicks = TICK_HZ / snapshotHz;
  const checkpointEverySnapshots = VIEWER_CHECKPOINT_EVERY_SNAPSHOTS;
  const actorLog = log.child({ room: roomId, map: mapId });
  // A resumed match skips the countdown and its clock limit counts from where the old host left it.
  const resumedBattleTimeMs = resume ? Math.round(resume.battleTimeMs) : 0;
  const countdownS = resume ? 0 : options.countdownS ?? 5;
  const rulesetLimitS = typeof ruleset.timeLimitS === 'number' && Number.isFinite(ruleset.timeLimitS) ? ruleset.timeLimitS : null;
  const effectiveBattleLimitS = battleLimitS != null ? Math.max(1, battleLimitS - resumedBattleTimeMs / 1000)
    : resume && rulesetLimitS !== null ? Math.max(1, rulesetLimitS - resumedBattleTimeMs / 1000) : undefined;

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
    players.push({ id: spec.playerId, specId: spec.specId, team: spec.team, equipment: spec.equipment ?? null, ...(spec.spawn ? { spawn: spec.spawn } : {}) });
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
  // Every hull's armor, modules, crew and hit shells are finalized before the authority reads them (spectators ride no hull).
  requireAuthorityFleet(players.map((player) => player.specId));

  // ---- authority and world
  const collision: ActorWorldCollision | null = typeof world === 'object' && world !== null ? world
    : world === 'dedicated' ? createDedicatedWorldCollision(mapId, { retain: true, variant: terrainVariantFor(mode) }) : null;
  const releaseWorld = () => { if (collision && typeof collision.release === 'function') collision.release(); };
  let authority: AuthoritativeMatch;
  let lagComp: LagCompensation;
  try {
    const bound: { hook: LagCompensation | null } = { hook: null };
    authority = createAuthoritativeMatch({
      players, mapId, seed, countdownS, gameMode: mode, ruleset,
      ...(effectiveBattleLimitS != null ? { battleLimitS: effectiveBattleLimitS } : {}),
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
  // destruction (docs/DESTRUCTION.md §8.2): the authority's log, copied for the frames whenever it grows
  let destructionFrameLog: DestructionLogEntry[] = [];
  const totals = { bytesOut: 0, bytesIn: 0, snapshots: 0, keyframes: 0, droppedSnapshots: 0, backpressureCloses: 0, events: 0, malformed: 0, rejectedInputs: 0 };
  // the migration seed (P3b): what each entity was restored from, and whether its own seat's hint was taken
  const restoredTicks = new Int32Array(MAX_ENTITIES + 1).fill(-1);
  const restoredX = new Float64Array(MAX_ENTITIES + 1);
  const restoredZ = new Float64Array(MAX_ENTITIES + 1);
  const hinted = new Uint8Array(MAX_ENTITIES + 1);
  const resumeHints: ResumeHintStats = { applied: 0, rejected: 0, reasons: { noResume: 0, notRestored: 0, repeated: 0, older: 0, future: 0, tooFar: 0, noSeat: 0 } };
  let ended = false;
  let stopped = false;
  let verdict: MatchVerdict | null = null;
  let verdictTick = -1;
  const inputs = new Map<string, AuthoritativePlayerInput | null>();

  function serverTimeMs(tick: number): number { return Math.round(tick * TICK_MS); }

  /** The battle clock as the clients read it: the authority's, plus what the old host had already played. */
  function metaWithResumedClock(meta: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!resumedBattleTimeMs || !meta) return meta;
    return { ...meta, battleTimeMs: (Number(meta.battleTimeMs) || 0) + resumedBattleTimeMs };
  }

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
    const rate = client.rate;
    const elapsedMs = Math.max(0, nowMs - rate.lastMs);
    rate.lastMs = nowMs;
    rate.tokens = Math.min(MESSAGE_BURST, rate.tokens + elapsedMs * MAX_MESSAGES_PER_SECOND / 1000);
    if (rate.tokens < 1) return true;
    rate.tokens -= 1;
    return false;
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
      case MESSAGE_TYPE.RESUME_HINT: receiveResumeHint(client, message); return;
      default:
        sendError(client, CLOSE_REASON.UNEXPECTED_MESSAGE, `type ${message.type}`);
    }
  }

  /** The hull's top speed (m/s) for the hint's distance bound; the fleet's fastest hull is the floor so a mode multiplier never refuses a true row. */
  function topSpeedMps(entity: AuthoritativeEntity): number {
    const kmh = (entity.spec as { topSpeedKmh?: number }).topSpeedKmh;
    return Math.max(25, typeof kmh === 'number' && Number.isFinite(kmh) ? kmh / 3.6 : 0);
  }

  /**
   * A viewer's own newest authority row from the host it lost (P3b): applied to its entity only when this actor resumed
   * a migration, the entity was restored from the migration state, no hint was taken for it yet, the row is newer than
   * the restored one and older than the resume tick, and it lies within the distance the hull could have driven since
   * the restored row (top speed × the ticks between, with a margin) — pose fields only, never combat state. A client
   * never places itself: outside those bounds the hint is refused and counted.
   */
  function receiveResumeHint(client: ActorClient, hint: ResumeHintMessage): void {
    const entity = client.entity;
    const refuse = (reason: keyof ResumeHintStats['reasons']): void => { resumeHints.rejected++; resumeHints.reasons[reason]++; };
    if (!entity) { refuse('noSeat'); return; }
    const entityId = client.entityId;
    if (!resume) { refuse('noResume'); return; }
    const restoredTick = restoredTicks[entityId]!;
    if (restoredTick < 0) { refuse('notRestored'); return; }
    if (hinted[entityId]) { refuse('repeated'); return; }
    if (!(hint.tick > restoredTick)) { refuse('older'); return; }
    if (hint.tick >= resume.tick) { refuse('future'); return; }
    const x = dequantizePosition(hint.x);
    const z = dequantizePosition(hint.z);
    const allowedM = (hint.tick - restoredTick) * SIM_DT * topSpeedMps(entity) * 1.25 + 3;
    const movedM = Math.hypot(x - restoredX[entityId]!, z - restoredZ[entityId]!);
    if (movedM > allowedM) { refuse('tooFar'); actorLog.warn('resume hint refused', { player: client.playerId, movedM: Math.round(movedM * 10) / 10, allowedM: Math.round(allowedM * 10) / 10 }); return; }
    const tank = entity.state;
    tank.pos.x = x;
    tank.pos.y = dequantizePosition(hint.y);
    tank.pos.z = z;
    tank.yaw = dequantizeAngle(hint.yaw);
    tank.speed = dequantizeVelocity(hint.speed);
    tank.verticalSpeed = dequantizeVelocity(hint.verticalSpeed);
    tank.turretYaw = dequantizeAngle(hint.turretYaw);
    tank.gunPitch = dequantizeAngle(hint.gunPitch);
    tank.visualPitch = dequantizeAngle(hint.pitch);
    tank.visualRoll = dequantizeAngle(hint.roll);
    hinted[entityId] = 1;
    resumeHints.applied++;
    actorLog.info('resume hint applied', { player: client.playerId, tick: hint.tick, restoredTick, movedM: Math.round(movedM * 100) / 100 });
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

  /**
   * Engagement for the interest tiers (P3b): a hit either way, a shell landing beside the viewer or a ram puts the
   * other party on the near tier for INTEREST_ENGAGED_TICKS. Read from the events the viewer receives — its own
   * involvement is always among them (the authority's reveal rule names the viewer).
   */
  function engageFromEvent(client: ActorClient, event: Record<string, unknown>, tick: number): void {
    const viewer = client.entity;
    if (!viewer) return;
    const until = tick + INTEREST_ENGAGED_TICKS;
    const engage = (playerId: unknown): void => {
      if (typeof playerId !== 'string' || playerId === viewer.id) return;
      const entityId = entityIdOf.get(playerId);
      if (entityId !== undefined) engageEntity(client.interest, entityId, until);
    };
    switch (event.type) {
      case 'shell_hit':
        if (event.shooterId === viewer.id) engage(event.targetId);
        else if (event.targetId === viewer.id) engage(event.shooterId);
        return;
      case 'shell_impact': {
        if (event.shooterId === viewer.id) return;
        const dx = Number(event.x) - viewer.state.pos.x;
        const dz = Number(event.z) - viewer.state.pos.z;
        if (dx * dx + dz * dz <= INTEREST_NEAR_MISS_M * INTEREST_NEAR_MISS_M) engage(event.shooterId);
        return;
      }
      case 'tank_ram':
        if (event.aId === viewer.id) engage(event.bId);
        else if (event.bId === viewer.id) engage(event.aId);
        return;
      default:
        return;
    }
  }

  function deliverEvents(tick: number): void {
    if (authority.pendingEventCount === 0) return;
    for (const client of clients.keys()) {
      const events = authority.eventsForViewer(client.viewerId);
      if (!events.length) continue;
      for (const event of events) engageFromEvent(client, event as unknown as Record<string, unknown>, tick);
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
    if (!row) { row = captureEntityRow(entity, entityId, era, tick); rowCache.set(entityId, row); }
    return row;
  }

  /** The frames' copy of the authority's destruction log (append-only: a longer log is a new copy, the wire's entries). */
  function destructionLog(meta: Record<string, unknown> | null): DestructionLogEntry[] {
    const log = Array.isArray(meta?.destructionLog) ? meta.destructionLog as DestructionLogEntry[] : null;
    if (log && log.length !== destructionFrameLog.length) destructionFrameLog = log.map(quantizeDestructionEntry);
    return destructionFrameLog;
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

  /**
   * The viewer's frame at `tick`. The authority's viewer snapshot is the spotting filter (a hidden enemy is absent
   * before any tier applies); each visible entity's row is then refreshed on its interest tier's cadence for this
   * viewer or carried over from what the viewer holds (P3b, 2026-09-29; interestTiers.ts). Spectators have no hull
   * to measure from and see every entity at full rate.
   */
  function buildFrame(client: ActorClient, tick: number): SnapshotFrame {
    const snapshot = authority.snapshot({ tick, serverTimeMs: serverTimeMs(tick), viewerId: client.viewerId, ackInputSeq: null });
    const entities: EntityRow[] = [];
    const interest = client.interest;
    const snapshotIndex = (tick / snapshotEveryTicks) | 0;
    const viewer = client.entity;
    const vx = viewer ? viewer.state.pos.x : 0;
    const vy = viewer ? viewer.state.pos.y : 0;
    const vz = viewer ? viewer.state.pos.z : 0;
    beginSnapshot(interest);
    for (const row of snapshot.entities) {
      const entityId = entityIdOf.get(row.id);
      const entity = entityId == null ? null : entityByWireId.get(entityId);
      if (!entity || entityId == null) continue;
      let tier: InterestTier = 0;
      if (viewer && entity !== viewer) {
        const dx = entity.state.pos.x - vx;
        const dy = entity.state.pos.y - vy;
        const dz = entity.state.pos.z - vz;
        tier = viewerTierFor(interest, entityId, tick, dx * dx + dy * dy + dz * dz);
      }
      const fresh = needsFreshRow(interest, entityId, tier, snapshotIndex);
      const captured = fresh ? rowFor(entity, entityId, tick) : interest.rows[entityId]!;
      recordRow(interest, entityId, tier, snapshotIndex, captured, fresh);
      entities.push(captured);
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
      meta: captureMeta(metaWithResumedClock(meta), ended),
      destroyed: destroyedList(meta),
      destruction: destructionLog(meta),
      entities,
      shells,
      viewer: client.entity ? captureViewerState(client.entityId, meta?.localPrediction, snapshotIndex % checkpointEverySnapshots === 0) : null,
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
      if (buffered > SNAPSHOT_SKIP_BYTES) {
        // a slow peer: this snapshot is skipped (the next one is fresher than a queued copy of this one would be)
        client.droppedSnapshots++;
        totals.droppedSnapshots++;
        continue;
      }
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
      battleTimeMs: Math.round(authority.timeS * 1000) + resumedBattleTimeMs,
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
    if (tick % snapshotEveryTicks === 0) publishSnapshots(tick);
    if (ended && tick - verdictTick >= lingerTicks()) stop(CLOSE_REASON.MATCH_ENDED, verdict?.result ?? '');
  }

  const loop = createFixedStepLoop({
    tickMs: TICK_MS,
    now,
    ...(schedule ? { schedule } : {}),
    startTick: resume ? resume.tick : 0,
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
      input: createSeatInputBuffer(), publisher: createViewerPublisher(), interest: createViewerInterest(), latency: createLatencyTracker(), chat: createChatLimiter(),
      bytesOut: 0, bytesIn: 0, events: 0, droppedSnapshots: 0, malformed: 0, pressureSinceMs: null,
      rate: { tokens: MESSAGE_BURST, lastMs: now() }, closing: false,
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
      protocolVersion: PROTOCOL_VERSION, tickHz: TICK_HZ, snapshotHz,
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
      interest: { published: [...client.interest.published], held: client.interest.held, population: [...client.interest.population] },
    }));
  }

  function interestTotals(): InterestStats {
    const totals: InterestStats = { published: [0, 0, 0], held: 0, population: [0, 0, 0] };
    for (const client of clients.keys()) {
      const interest = client.interest;
      for (let tier = 0; tier < 3; tier++) {
        totals.published[tier] += interest.published[tier]!;
        totals.population[tier] += interest.population[tier]!;
      }
      totals.held += interest.held;
    }
    return totals;
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
      snapshotHz,
      lagComp: {
        rewoundShots: lag.rewoundShots, rewoundSweeps: lag.rewoundSweeps,
        mismatchMeanM: lag.rewoundShots ? lag.mismatchSumM / lag.rewoundShots : 0, mismatchMaxM: lag.mismatchMaxM, historyMisses: lag.historyMisses,
      },
      verdict: verdict ? verdict.result : null,
      interest: interestTotals(),
      resumeHints: { applied: resumeHints.applied, rejected: resumeHints.rejected, reasons: { ...resumeHints.reasons } },
    };
  }

  if (autoStart) start();

  return {
    roomId,
    ruleset,
    get tick() { return loop.tick; },
    get ended() { return ended; },
    get stopped() { return stopped; },
    authority,
    loop,
    lagComp,
    attach,
    entityForWireId: (entityId) => entityByWireId.get(entityId) ?? null,
    wireIdOf: (playerId) => entityIdOf.get(playerId) ?? null,
    resumedBattleTimeMs,
    noteRestoredRow(entityId, tick, x, z) {
      if (!Number.isInteger(entityId) || entityId < 1 || entityId > MAX_ENTITIES || !Number.isInteger(tick) || tick < 0) return;
      restoredTicks[entityId] = tick;
      restoredX[entityId] = x;
      restoredZ[entityId] = z;
      hinted[entityId] = 0;
    },
    broadcastEvent,
    advance: (nowMs) => loop.advance(nowMs),
    start,
    stop,
    stats,
    clientStats,
  };
}
