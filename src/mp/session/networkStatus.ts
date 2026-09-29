/**
 * The Multiplayer v2 network status model (charter R3 "the player sees why in
 * one sentence", R4 "no lag" made observable). One mutable snapshot, written in
 * place on a bounded cadence from the match transport, the match client's
 * clock / snapshot stream / predictor and the room client, plus one threshold
 * table that turns the numbers into a verdict (`good` / `degraded` / `bad` /
 * `offline`) with the reason that decided it. The HUD strip, the lobby strip,
 * the banner and the telemetry summary all read this object; none of them
 * derives a rule of its own. Node-runnable, DOM-free, no allocation in
 * `update()`; the sources are structural so a receipt scripts them and the
 * real `MatchClient` / `RoomClient` satisfy them unchanged.
 */
import type { ConnectionPhase } from '../match/recovery.ts';
import type { PredictionStats } from '../match/prediction.ts';
import type { RoomClientPhase, RoomClientPhaseChange } from '../room/roomClient.ts';
import type { RoomMatchStatus, RoomPhase, RoomSnapshot } from '../room/protocol.ts';
import { ROOM_MAX_PLAYERS } from '../room/protocol.ts';
import { Listeners } from '../transport/transport.ts';
import type { TransportCloseReason, TransportState, TransportStateChange, TransportStats, Unsubscribe } from '../transport/transport.ts';
import { CLOSE_REASON, CLOSE_REASON_NAMES, SNAPSHOT_HZ } from '../wire/index.ts';
import type { CloseReasonId } from '../wire/index.ts';
import type { RtcCandidateType } from '../transport/webRtcTransport.ts';
import type { SessionP2pEvent, SessionP2pStatus, SessionRole } from './matchSession.ts';

export type NetworkHealth = 'unknown' | 'good' | 'degraded' | 'bad' | 'offline';

/** The one fact that decided the verdict (the banner names it; telemetry keeps it). */
export type NetworkHealthReason =
  | 'idle' | 'room' | 'room_reconnecting' | 'room_closed'
  | 'connecting' | 'live' | 'rtt' | 'jitter' | 'loss' | 'cadence' | 'stale' | 'corrections'
  | 'reconnecting' | 'stalled' | 'failed' | 'dropped' | 'closed' | 'left';

export interface NetworkHealthLimits {
  /** The window-minimum round trip at or above this (a busy client can only inflate a sample, never shrink one). */
  rttMs: number;
  /** The round-trip spread (median absolute deviation over the sample window) at or above this. */
  jitterMs: number;
  /** Snapshot sequence gaps over the snapshots of the loss window, at or above this. */
  lossRate: number;
  /** Time since the last accepted snapshot, at or above this. */
  snapshotAgeMs: number;
  /** Measured snapshot cadence over the sample window below this share of the authority's rate. */
  cadenceRatio: number;
  /** Reconciliations that staged more than one frame of release, per second, at or above this. */
  correctionsPerS: number;
}

/**
 * The threshold table. `degraded` is where a player starts to feel the link
 * (the HUD's ping colours turn at 80 / 160 ms; the interpolation buffer sits
 * at 67–133 ms and extrapolates for one interval, so a snapshot older than
 * 250 ms is already being invented; the soak certifies 3 % loss as playable,
 * so loss reads over a 4 s window and starts at twice that); `bad` is where
 * play is unreliable (the stall watchdog fires at 5 s, so a second without
 * authority is well inside a real outage).
 */
export const NETWORK_HEALTH_THRESHOLDS: Readonly<{ degraded: Readonly<NetworkHealthLimits>; bad: Readonly<NetworkHealthLimits> }> = Object.freeze({
  degraded: Object.freeze({ rttMs: 160, jitterMs: 40, lossRate: 0.06, snapshotAgeMs: 250, cadenceRatio: 0.8, correctionsPerS: 2 }),
  bad: Object.freeze({ rttMs: 300, jitterMs: 100, lossRate: 0.15, snapshotAgeMs: 1000, cadenceRatio: 0.5, correctionsPerS: 6 }),
});

/** The subset of MatchClient the model reads (allocation-free getters only). */
export interface NetworkStatusMatchSource {
  readonly transport: {
    readonly state: TransportState;
    readonly stats: Readonly<TransportStats>;
    onState(listener: (change: TransportStateChange) => void): Unsubscribe;
  };
  readonly phase: ConnectionPhase;
  readonly welcome: unknown;
  readonly serverClock: {
    readonly rttMs: number | null;
    readonly rttJitterMs: number;
    /** Stall-immune reads (ServerClock); a scripted source may omit them and the smoothed values stand in. */
    readonly minRttMs?: number | null;
    readonly medianRttMs?: number | null;
    readonly rttSpreadMs?: number;
  };
  readonly interpolator: { readonly delay: number; readonly bufferedFrames: number };
  readonly snapshots: { readonly acceptedCount: number; readonly estimatedMissingCount: number };
  readonly lastAuthorityReceivedAtMs: number | null;
  readonly predictorStats: Readonly<PredictionStats> | null;
  readonly bytesInPerSecond: number;
  readonly bytesOutPerSecond: number;
  readonly lastCloseReason: CloseReasonId | null;
  onPhase(listener: (phase: ConnectionPhase, detail: string) => void): Unsubscribe;
}

/** The peer-to-peer facts (P2 client lane): the session's in-place status object and its events. */
export interface NetworkStatusP2pSource {
  readonly p2p: Readonly<SessionP2pStatus> | null;
  onP2p(listener: (event: SessionP2pEvent) => void): Unsubscribe;
}

/** The subset of RoomClient the model reads. */
export interface NetworkStatusRoomSource {
  readonly phase: RoomClientPhase;
  readonly room: RoomSnapshot | null;
  readonly seat: number | null;
  readonly region: string | null;
  readonly rttMs: number | null;
  onPhase(listener: (change: RoomClientPhaseChange) => void): Unsubscribe;
  onState(listener: (room: RoomSnapshot) => void): Unsubscribe;
  onClosed(listener: (change: { reason: string }) => void): Unsubscribe;
}

export interface NetworkStatusSnapshot {
  /** Local clock of the last sample. */
  sampledAtMs: number;
  /** A match client is attached (the fields below it are live). */
  attached: boolean;
  transport: TransportState;
  transportReason: TransportCloseReason | null;
  transportDetail: string;
  /** 1-based attempt while the match link reconnects, else 0. */
  reconnectAttempt: number;
  /** Local time the next attempt fires while reconnecting, else null. */
  retryAtMs: number | null;
  /** Milliseconds until the next attempt at the last sample (0 when none). */
  nextRetryMs: number;
  /** Reconnect attempts on the match link since attach. */
  reconnects: number;
  /** The recovery phase of the match link. */
  link: ConnectionPhase;
  welcomed: boolean;
  /** The window-minimum round trip: the path's floor, immune to the client's own stalls. */
  rttMs: number | null;
  /** The window-median round trip (the panel shows it beside the floor). */
  rttMedianMs: number | null;
  /** The round-trip spread: median absolute deviation over the sample window. */
  rttJitterMs: number;
  /** The largest gap between two of the client's own updates inside the current window (a self-stall). */
  localStallMs: number;
  /** Snapshots per second measured over the last window; the authority's rate before the first window. */
  snapshotHz: number;
  expectedSnapshotHz: number;
  /** Time since the last accepted snapshot (0 before the first). */
  snapshotAgeMs: number;
  interpolationDelayMs: number;
  bufferedFrames: number;
  /** Sequence gaps over the snapshots of the last loss window (0 before the first window closes). */
  lossRate: number;
  correctionsPerS: number;
  bytesInPerS: number;
  bytesOutPerS: number;
  /** The wire CLOSE reason name when the server closed the link, else null. */
  closeReason: string | null;
  /** The close ended this seat (a kick, a timeout, a replacement — never the match ending or the client leaving). */
  seatDropped: boolean;
  room: RoomClientPhase;
  roomReconnectAttempt: number;
  roomRetryAtMs: number | null;
  roomReconnects: number;
  roomRttMs: number | null;
  roomRegion: string | null;
  seat: number | null;
  /** Seated commanders (spectators excluded) of `rosterCapacity`. */
  rosterCount: number;
  rosterCapacity: number;
  roomPhase: RoomPhase | null;
  matchStatus: RoomMatchStatus | null;
  // ---- peer-to-peer (P2 client lane): null / 0 on the WebSocket path
  /** This seat hosts the match (the authority runs in its browser) or plays as a peer of another seat's. */
  role: SessionRole;
  /** The host generation this seat runs (increments on every election). */
  generation: number;
  hostId: string | null;
  /** The peer's selected local candidate type (host / srflx / prflx / relay). */
  candidateType: RtcCandidateType | null;
  /** The traffic crosses a TURN relay (the peer's pair, or any of the host's peers). */
  viaTurn: boolean;
  /** The host's uplink across every peer link, kilobits per second (0 as a peer). */
  hostUplinkKbps: number;
  /** Peers this host serves (0 as a peer). */
  peersConnected: number;
  /** An election is under way: the new host boots or the link moves to it. */
  migrating: boolean;
  migrationHostId: string | null;
  health: NetworkHealth;
  healthReason: NetworkHealthReason;
}

export type NetworkStatusEvent =
  | { kind: 'reconnect'; scope: 'match' | 'room'; attempt: number }
  | { kind: 'recovered'; scope: 'match' | 'room'; attempts: number }
  | { kind: 'dropped'; scope: 'match'; reason: string }
  | { kind: 'health'; health: NetworkHealth; reason: NetworkHealthReason; previous: NetworkHealth }
  /** This seat started (or stopped) hosting; `migrated` when an election put it there. */
  | { kind: 'host'; role: SessionRole; migrated: boolean }
  /** An election reached this seat: it boots as host, follows the new host, or the migration failed. */
  | { kind: 'migration'; phase: 'begin' | 'end' | 'failed'; role: SessionRole; hostId: string; reason: string };

/** What telemetry keeps of a battle's link (a few bytes at exit, never per tick). */
export interface NetworkStatusSummary {
  health: NetworkHealth;
  worst: NetworkHealth;
  reconnects: number;
  roomReconnects: number;
  drops: number;
  lastDrop: string | null;
  /** Milliseconds the link spent below `good` while attached. */
  impairedMs: number;
  /** Peer-to-peer: rounds this seat hosted (a migration onto it counts), elections it lived through. */
  hosted: number;
  migrations: number;
}

/** The banner the surface shows for a snapshot (copy is the surface's; this is the fact). */
export type NetworkBanner =
  | { kind: 'reconnecting'; scope: 'match' | 'room'; attempt: number; nextRetryS: number }
  /** A host election: `host` is the new host's name (the id when the room names none), `self` when this seat is it. */
  | { kind: 'migrating'; host: string; self: boolean }
  | { kind: 'stalled' }
  | { kind: 'dropped'; reason: string }
  | { kind: 'failed' }
  | { kind: 'degraded'; reason: NetworkHealthReason }
  | null;

export interface NetworkStatusModelOptions {
  clock?: () => number;
  /** How often `update()` samples the sources (the surfaces paint at this cadence). */
  sampleIntervalMs?: number;
  /** The cadence and correction rates need a window at least this long. */
  windowMs?: number;
  /** The loss rate reads over a longer window (a lost snapshot in a 1 s window is already 3 %). */
  lossWindowMs?: number;
  thresholds?: typeof NETWORK_HEALTH_THRESHOLDS;
  expectedSnapshotHz?: number;
  rosterCapacity?: number;
}

const HEALTH_RANK: Readonly<Record<NetworkHealth, number>> = Object.freeze({ unknown: 0, good: 1, degraded: 2, bad: 3, offline: 4 });

/** A window in which the client itself stalled longer than this cannot judge the link's cadence or freshness. */
const SELF_STALL_MS = 250;

const METRIC_ORDER: ReadonlyArray<{ reason: NetworkHealthReason; over(s: NetworkStatusSnapshot, limits: NetworkHealthLimits): boolean }> = Object.freeze([
  { reason: 'stale', over: (s, l) => s.localStallMs < SELF_STALL_MS && s.snapshotAgeMs >= l.snapshotAgeMs },
  { reason: 'loss', over: (s, l) => s.lossRate >= l.lossRate },
  { reason: 'rtt', over: (s, l) => s.rttMs !== null && s.rttMs >= l.rttMs },
  { reason: 'jitter', over: (s, l) => s.rttJitterMs >= l.jitterMs },
  { reason: 'cadence', over: (s, l) => s.localStallMs < SELF_STALL_MS && s.snapshotHz < s.expectedSnapshotHz * l.cadenceRatio },
  { reason: 'corrections', over: (s, l) => s.correctionsPerS >= l.correctionsPerS },
]);

/** The verdict for a snapshot: transport and link states first, then the metric table in its order. Pure. */
export function resolveNetworkHealth(
  s: Readonly<NetworkStatusSnapshot>,
  thresholds: typeof NETWORK_HEALTH_THRESHOLDS = NETWORK_HEALTH_THRESHOLDS,
): { health: NetworkHealth; reason: NetworkHealthReason } {
  if (!s.attached) {
    if (s.room === 'reconnecting') return { health: 'bad', reason: 'room_reconnecting' };
    if (s.room === 'closed') return { health: 'offline', reason: 'room_closed' };
    if (s.room !== 'joined') return { health: 'unknown', reason: 'idle' };
    if (s.roomRttMs !== null && s.roomRttMs >= thresholds.bad.rttMs) return { health: 'degraded', reason: 'rtt' };
    return { health: 'good', reason: 'room' };
  }
  if (s.link === 'left') return { health: 'offline', reason: 'left' };
  if (s.link === 'closed') return { health: 'offline', reason: s.seatDropped ? 'dropped' : 'closed' };
  if (s.link === 'failed') return { health: 'offline', reason: 'failed' };
  if (s.transport === 'reconnecting' || s.link === 'reconnecting') return { health: 'bad', reason: 'reconnecting' };
  if (s.link === 'stalled') return { health: 'bad', reason: 'stalled' };
  if (s.link !== 'live') return { health: 'unknown', reason: 'connecting' };
  for (const metric of METRIC_ORDER) if (metric.over(s, thresholds.bad)) return { health: 'bad', reason: metric.reason };
  for (const metric of METRIC_ORDER) if (metric.over(s, thresholds.degraded)) return { health: 'degraded', reason: metric.reason };
  if (s.room === 'reconnecting') return { health: 'degraded', reason: 'room_reconnecting' };
  return { health: 'good', reason: 'live' };
}

/** The banner for a snapshot, or null when nothing needs saying. Pure. */
export function networkBannerFor(s: Readonly<NetworkStatusSnapshot>, nowMs: number = s.sampledAtMs, hostName: (id: string) => string = (id) => id): NetworkBanner {
  const seconds = (retryAtMs: number | null) => (retryAtMs === null ? 0 : Math.max(0, Math.ceil((retryAtMs - nowMs) / 1000)));
  // A host election outranks every link fact: the link is moving to the new host (or this seat is becoming it).
  if (s.migrating && s.migrationHostId && s.link !== 'left') return { kind: 'migrating', host: hostName(s.migrationHostId), self: s.role === 'host' };
  if (s.attached) {
    if (s.link === 'left') return null;
    if (s.link === 'closed') {
      if (s.seatDropped && s.closeReason) return { kind: 'dropped', reason: s.closeReason };
      // A `match_ended` close is the verdict's business; a close without a wire reason is a lost link.
      return s.closeReason ? null : { kind: 'failed' };
    }
    if (s.link === 'failed') return { kind: 'failed' };
    if (s.transport === 'reconnecting') return { kind: 'reconnecting', scope: 'match', attempt: Math.max(1, s.reconnectAttempt), nextRetryS: seconds(s.retryAtMs) };
    if (s.link === 'stalled') return { kind: 'stalled' };
    if (s.room === 'reconnecting') return { kind: 'reconnecting', scope: 'room', attempt: Math.max(1, s.roomReconnectAttempt), nextRetryS: seconds(s.roomRetryAtMs) };
    if (s.health === 'degraded' || s.health === 'bad') return { kind: 'degraded', reason: s.healthReason };
    return null;
  }
  if (s.room === 'reconnecting') return { kind: 'reconnecting', scope: 'room', attempt: Math.max(1, s.roomReconnectAttempt), nextRetryS: seconds(s.roomRetryAtMs) };
  return null;
}

/** Wire CLOSE reasons that mean "the server ended this seat" (as opposed to the match ending or the client leaving). */
export const SEAT_DROP_REASONS: ReadonlySet<CloseReasonId> = new Set<CloseReasonId>([
  CLOSE_REASON.BAD_TOKEN, CLOSE_REASON.TOKEN_EXPIRED, CLOSE_REASON.SEAT_TAKEN, CLOSE_REASON.ROOM_UNKNOWN, CLOSE_REASON.ROOM_CLOSED,
  CLOSE_REASON.MALFORMED, CLOSE_REASON.RATE_LIMITED, CLOSE_REASON.BACKPRESSURE, CLOSE_REASON.HELLO_REQUIRED,
  CLOSE_REASON.INPUT_TOO_FAR_AHEAD, CLOSE_REASON.UNEXPECTED_MESSAGE, CLOSE_REASON.SERVER_DRAIN, CLOSE_REASON.REPLACED,
  CLOSE_REASON.IDLE_TIMEOUT, CLOSE_REASON.ORIGIN_FORBIDDEN, CLOSE_REASON.PAYLOAD_TOO_LARGE, CLOSE_REASON.INTERNAL_ERROR,
  CLOSE_REASON.CHAT_REJECTED, CLOSE_REASON.NOT_SEATED, CLOSE_REASON.CAPACITY, CLOSE_REASON.PROTOCOL_VERSION,
]);

export function closeReasonName(reason: CloseReasonId | null): string | null {
  return reason === null || reason === CLOSE_REASON.NONE ? null : CLOSE_REASON_NAMES[reason] ?? `reason_${reason}`;
}

function createSnapshot(expectedSnapshotHz: number, rosterCapacity: number): NetworkStatusSnapshot {
  return {
    sampledAtMs: 0, attached: false, transport: 'idle', transportReason: null, transportDetail: '', reconnectAttempt: 0,
    retryAtMs: null, nextRetryMs: 0, reconnects: 0, link: 'idle', welcomed: false, rttMs: null, rttMedianMs: null, rttJitterMs: 0,
    localStallMs: 0, snapshotHz: expectedSnapshotHz, expectedSnapshotHz, snapshotAgeMs: 0, interpolationDelayMs: 0, bufferedFrames: 0,
    lossRate: 0, correctionsPerS: 0, bytesInPerS: 0, bytesOutPerS: 0, closeReason: null, seatDropped: false,
    room: 'idle', roomReconnectAttempt: 0, roomRetryAtMs: null, roomReconnects: 0, roomRttMs: null, roomRegion: null, seat: null,
    rosterCount: 0, rosterCapacity, roomPhase: null, matchStatus: null,
    role: null, generation: 0, hostId: null, candidateType: null, viaTurn: false, hostUplinkKbps: 0, peersConnected: 0, migrating: false, migrationHostId: null,
    health: 'unknown', healthReason: 'idle',
  };
}

export class NetworkStatusModel {
  readonly snapshot: NetworkStatusSnapshot;
  readonly thresholds: typeof NETWORK_HEALTH_THRESHOLDS;
  readonly sampleIntervalMs: number;
  readonly windowMs: number;
  readonly lossWindowMs: number;
  private readonly clock: () => number;
  private readonly changeListeners = new Listeners<NetworkStatusSnapshot>();
  private readonly eventListeners = new Listeners<NetworkStatusEvent>();
  private match: NetworkStatusMatchSource | null = null;
  private room: NetworkStatusRoomSource | null = null;
  private p2p: NetworkStatusP2pSource | null = null;
  private readonly matchSubscriptions: Unsubscribe[] = [];
  private readonly roomSubscriptions: Unsubscribe[] = [];
  private readonly p2pSubscriptions: Unsubscribe[] = [];
  private hosted = 0;
  private migrations = 0;
  private lastSampleMs = -Infinity;
  private lastUpdateMs: number | null = null;
  private windowStallMs = 0;
  private windowStartMs: number | null = null;
  private windowSnapshots = 0;
  private windowCorrections = 0;
  private lossWindowStartMs: number | null = null;
  private lossWindowSnapshots = 0;
  private lossWindowMissing = 0;
  private worst: NetworkHealth = 'unknown';
  private drops = 0;
  private lastDrop: string | null = null;
  private impairedMs = 0;
  private impairedSinceMs: number | null = null;

  constructor({
    clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
    sampleIntervalMs = 250,
    windowMs = 1000,
    lossWindowMs = 4000,
    thresholds = NETWORK_HEALTH_THRESHOLDS,
    expectedSnapshotHz = SNAPSHOT_HZ,
    rosterCapacity = ROOM_MAX_PLAYERS,
  }: NetworkStatusModelOptions = {}) {
    this.clock = clock;
    this.sampleIntervalMs = sampleIntervalMs;
    this.windowMs = windowMs;
    this.lossWindowMs = lossWindowMs;
    this.thresholds = thresholds;
    this.snapshot = createSnapshot(expectedSnapshotHz, rosterCapacity);
  }

  onChange(listener: (snapshot: NetworkStatusSnapshot) => void): Unsubscribe { return this.changeListeners.add(listener); }
  onEvent(listener: (event: NetworkStatusEvent) => void): Unsubscribe { return this.eventListeners.add(listener); }

  // ------------------------------------------------------------ sources

  attachRoom(room: NetworkStatusRoomSource): void {
    this.detachRoom();
    this.room = room;
    const s = this.snapshot;
    this.roomSubscriptions.push(room.onPhase((change) => {
      if (change.phase === 'reconnecting') {
        const attempt = change.attempt ?? s.roomReconnectAttempt + 1;
        s.roomReconnectAttempt = attempt;
        s.roomRetryAtMs = change.retryDelayMs === undefined ? null : this.clock() + change.retryDelayMs;
        s.roomReconnects++;
        this.eventListeners.emit({ kind: 'reconnect', scope: 'room', attempt });
      } else {
        if (change.phase === 'joined' && s.roomReconnectAttempt > 0) {
          this.eventListeners.emit({ kind: 'recovered', scope: 'room', attempts: s.roomReconnectAttempt });
        }
        s.roomReconnectAttempt = 0;
        s.roomRetryAtMs = null;
      }
      this.sample(this.clock(), true);
    }));
    this.roomSubscriptions.push(room.onState(() => this.sample(this.clock(), true)));
    this.roomSubscriptions.push(room.onClosed(() => this.sample(this.clock(), true)));
    this.sample(this.clock(), true);
  }

  detachRoom(): void {
    for (const unsubscribe of this.roomSubscriptions.splice(0)) unsubscribe();
    this.room = null;
  }

  /** The session's peer-to-peer facts (attached with the match, detached with it). */
  attachP2p(source: NetworkStatusP2pSource): void {
    this.detachP2p();
    this.p2p = source;
    const s = this.snapshot;
    this.p2pSubscriptions.push(source.onP2p((event) => {
      if (event.kind === 'role') {
        const migrated = s.migrating;
        if (event.role === 'host') this.hosted++;
        this.eventListeners.emit({ kind: 'host', role: event.role, migrated });
      } else if (event.kind === 'migration') {
        if (event.phase === 'begin') this.migrations++;
        this.eventListeners.emit({ kind: 'migration', phase: event.phase, role: event.role, hostId: event.hostId, reason: event.detail });
      }
      this.sample(this.clock(), true);
    }));
    this.sample(this.clock(), true);
  }

  detachP2p(): void {
    for (const unsubscribe of this.p2pSubscriptions.splice(0)) unsubscribe();
    if (!this.p2p) return;
    this.p2p = null;
    const s = this.snapshot;
    s.role = null; s.generation = 0; s.hostId = null; s.candidateType = null; s.viaTurn = false; s.hostUplinkKbps = 0; s.peersConnected = 0;
    s.migrating = false; s.migrationHostId = null;
  }

  attachMatch(match: NetworkStatusMatchSource): void {
    this.detachMatch();
    this.match = match;
    const s = this.snapshot;
    s.attached = true;
    s.reconnects = 0;
    s.reconnectAttempt = 0;
    s.retryAtMs = null;
    s.closeReason = null;
    s.seatDropped = false;
    this.windowStartMs = null;
    this.lossWindowStartMs = null;
    this.matchSubscriptions.push(match.transport.onState((change) => {
      s.transport = change.state;
      s.transportReason = change.reason ?? null;
      s.transportDetail = change.detail ?? '';
      if (change.state === 'reconnecting') {
        const attempt = change.attempt ?? s.reconnectAttempt + 1;
        s.reconnectAttempt = attempt;
        s.retryAtMs = change.retryDelayMs === undefined ? null : this.clock() + change.retryDelayMs;
        s.reconnects++;
        this.eventListeners.emit({ kind: 'reconnect', scope: 'match', attempt });
      } else if (change.state === 'open') {
        if (change.resumed && s.reconnectAttempt > 0) this.eventListeners.emit({ kind: 'recovered', scope: 'match', attempts: s.reconnectAttempt });
        s.reconnectAttempt = 0;
        s.retryAtMs = null;
        this.windowStartMs = null;
        this.lossWindowStartMs = null;
      } else if (change.state === 'closed') {
        s.reconnectAttempt = 0;
        s.retryAtMs = null;
        this.noteClose(match);
      }
      this.sample(this.clock(), true);
    }));
    this.matchSubscriptions.push(match.onPhase((phase) => {
      if (phase === 'closed') this.noteClose(match);
      this.sample(this.clock(), true);
    }));
    this.sample(this.clock(), true);
  }

  /** The match client is gone (a leave, a new round): the link fields freeze on their last values. */
  detachMatch(): void {
    for (const unsubscribe of this.matchSubscriptions.splice(0)) unsubscribe();
    if (this.match) {
      this.match = null;
      this.snapshot.attached = false;
      this.closeImpairment(this.clock());
      this.sample(this.clock(), true);
    }
  }

  dispose(): void {
    this.detachMatch();
    this.detachRoom();
    this.detachP2p();
    this.changeListeners.clear();
    this.eventListeners.clear();
  }

  private noteClose(match: NetworkStatusMatchSource): void {
    const s = this.snapshot;
    const reason = match.lastCloseReason;
    const name = closeReasonName(reason);
    if (name === null || s.closeReason === name) return;
    s.closeReason = name;
    if (reason !== null && SEAT_DROP_REASONS.has(reason)) {
      s.seatDropped = true;
      this.drops++;
      this.lastDrop = name;
      this.eventListeners.emit({ kind: 'dropped', scope: 'match', reason: name });
    }
  }

  // ------------------------------------------------------------ sampling

  /** One display frame: samples at the cadence; returns true when a sample was taken. */
  update(nowMs: number = this.clock()): boolean {
    // The gap between two of the client's own updates is a self-stall (a shader compile, a GC pause): a
    // window that holds one cannot judge cadence or freshness, so the largest gap rides the snapshot.
    if (this.lastUpdateMs !== null) {
      const gap = nowMs - this.lastUpdateMs;
      if (gap > this.windowStallMs) this.windowStallMs = gap;
    }
    this.lastUpdateMs = nowMs;
    if (nowMs - this.lastSampleMs < this.sampleIntervalMs) return false;
    this.sample(nowMs, false);
    return true;
  }

  private sample(nowMs: number, forced: boolean): void {
    const s = this.snapshot;
    if (!forced && nowMs - this.lastSampleMs < this.sampleIntervalMs) return;
    this.lastSampleMs = nowMs;
    s.sampledAtMs = nowMs;
    const room = this.room;
    if (room) {
      s.room = room.phase;
      s.roomRttMs = room.rttMs;
      s.roomRegion = room.region;
      s.seat = room.seat;
      const snapshot = room.room;
      if (snapshot) {
        let seated = 0;
        for (const player of snapshot.players) if (player.team !== 'spectator') seated++;
        s.rosterCount = seated;
        s.roomPhase = snapshot.phase;
        s.matchStatus = snapshot.match?.status ?? null;
      } else {
        s.rosterCount = 0;
        s.roomPhase = null;
        s.matchStatus = null;
      }
    }
    const p2p = this.p2p?.p2p ?? null;
    if (p2p) {
      s.role = p2p.role; s.generation = p2p.generation; s.hostId = p2p.hostId; s.candidateType = p2p.candidateType; s.viaTurn = p2p.viaTurn;
      s.hostUplinkKbps = p2p.uplinkBytesPerS * 8 / 1000; s.peersConnected = p2p.peersConnected; s.migrating = p2p.migrating; s.migrationHostId = p2p.migrationHostId;
    } else if (this.p2p) {
      s.role = null; s.migrating = false; s.migrationHostId = null;
    }
    const match = this.match;
    if (match) {
      s.transport = match.transport.state;
      s.link = match.phase;
      s.welcomed = match.welcome !== null && match.welcome !== undefined;
      const clock = match.serverClock;
      s.rttMs = clock.minRttMs ?? clock.rttMs;
      s.rttMedianMs = clock.medianRttMs ?? clock.rttMs;
      s.rttJitterMs = clock.rttSpreadMs ?? clock.rttJitterMs;
      s.localStallMs = this.windowStallMs;
      s.interpolationDelayMs = match.interpolator.delay;
      s.bufferedFrames = match.interpolator.bufferedFrames;
      const accepted = match.snapshots.acceptedCount;
      const missing = match.snapshots.estimatedMissingCount;
      const lastAuthorityAt = match.lastAuthorityReceivedAtMs;
      s.snapshotAgeMs = lastAuthorityAt === null || s.link !== 'live' ? 0 : Math.max(0, nowMs - lastAuthorityAt);
      s.bytesInPerS = match.bytesInPerSecond;
      s.bytesOutPerS = match.bytesOutPerSecond;
      const corrections = match.predictorStats?.visibleCorrections ?? 0;
      if (this.lossWindowStartMs === null || s.link !== 'live') {
        this.lossWindowStartMs = nowMs;
        this.lossWindowSnapshots = accepted;
        this.lossWindowMissing = missing;
        s.lossRate = 0;
      } else if (nowMs - this.lossWindowStartMs >= this.lossWindowMs) {
        const seen = accepted - this.lossWindowSnapshots;
        const lost = missing - this.lossWindowMissing;
        s.lossRate = seen + lost > 0 ? lost / (seen + lost) : 0;
        this.lossWindowStartMs = nowMs;
        this.lossWindowSnapshots = accepted;
        this.lossWindowMissing = missing;
      }
      if (this.windowStartMs === null || s.link !== 'live') {
        this.windowStartMs = nowMs;
        this.windowSnapshots = accepted;
        this.windowCorrections = corrections;
        this.windowStallMs = 0;
        s.snapshotHz = s.expectedSnapshotHz;
        s.correctionsPerS = 0;
      } else if (nowMs - this.windowStartMs >= this.windowMs) {
        const seconds = (nowMs - this.windowStartMs) / 1000;
        s.snapshotHz = (accepted - this.windowSnapshots) / seconds;
        s.correctionsPerS = (corrections - this.windowCorrections) / seconds;
        s.localStallMs = this.windowStallMs;
        this.windowStartMs = nowMs;
        this.windowSnapshots = accepted;
        this.windowCorrections = corrections;
        this.windowStallMs = 0;
      }
    }
    s.nextRetryMs = s.retryAtMs === null ? 0 : Math.max(0, s.retryAtMs - nowMs);
    const previous = s.health;
    const verdict = resolveNetworkHealth(s, this.thresholds);
    s.health = verdict.health;
    s.healthReason = verdict.reason;
    if (HEALTH_RANK[s.health] > HEALTH_RANK[this.worst]) this.worst = s.health;
    if (s.attached) {
      const impaired = s.health === 'degraded' || s.health === 'bad';
      if (impaired && this.impairedSinceMs === null) this.impairedSinceMs = nowMs;
      else if (!impaired) this.closeImpairment(nowMs);
    }
    if (previous !== s.health) this.eventListeners.emit({ kind: 'health', health: s.health, reason: s.healthReason, previous });
    this.changeListeners.emit(s);
  }

  private closeImpairment(nowMs: number): void {
    if (this.impairedSinceMs === null) return;
    this.impairedMs += Math.max(0, nowMs - this.impairedSinceMs);
    this.impairedSinceMs = null;
  }

  /** The banner for the current snapshot at `nowMs` (the countdown keeps moving between samples); a host id reads as the seat's name. */
  banner(nowMs: number = this.clock()): NetworkBanner {
    return networkBannerFor(this.snapshot, nowMs, (id) => this.room?.room?.players.find((player) => player.id === id)?.name ?? id);
  }

  summary(): NetworkStatusSummary {
    const nowMs = this.clock();
    const open = this.impairedSinceMs === null ? 0 : Math.max(0, nowMs - this.impairedSinceMs);
    return {
      health: this.snapshot.health, worst: this.worst, reconnects: this.snapshot.reconnects, roomReconnects: this.snapshot.roomReconnects,
      drops: this.drops, lastDrop: this.lastDrop, impairedMs: Math.round(this.impairedMs + open),
      hosted: this.hosted, migrations: this.migrations,
    };
  }
}
