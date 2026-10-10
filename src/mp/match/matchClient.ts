import type { DestructionLogEntry } from '../../sim/destructionEvents.ts';
import { usesLauncherMuzzles } from '../../sim/launcherPolicy.ts';
/**
 * MatchClient: the browser-side match layer of Multiplayer v2 (charter §3
 * "Client", §4). It owns one transport, runs the HELLO/WELCOME handshake,
 * keeps the server clock, samples and streams input, assembles snapshots,
 * interpolates remote entities, predicts and reconciles the viewer's own
 * tank, delivers reliable events on a presentation budget, and applies the
 * recovery policy. Every part is Node-runnable: no DOM, no renderer — the
 * presentation adapter consumes the `MatchFrame` this produces once per
 * display frame, and the headless driver runs the same client in a soak.
 */
import type { MovementSpec } from '../../sim/movement.ts';
import { TRANSPORT_CLOSE } from '../transport/transport.ts';
import type { Transport, TransportStateChange, TransportStats } from '../transport/transport.ts';
import {
  CLOSE_REASON, ENTITY_FLAGS, HELLO_CAPABILITY, MESSAGE_TYPE, NO_ENTITY, NO_TICK, PROTOCOL_VERSION, SNAPSHOT_HZ,
  TICK_HZ, VIEWER_MODULES, decodeMessage, dequantizeReloadS, encodeMessage,
} from '../wire/index.ts';
import type {
  CloseReasonId, EntityRow, ErrorMessage, EventMessage, PhaseId, PongMessage, RosterEntry, SnapshotFrame,
  SnapshotPacket, VerdictId, ViewerState, WelcomeMessage, WireEvent,
} from '../wire/index.ts';
import { ServerClock, TickClock, TimeUnwrapper } from './clock.ts';
import { OwnShotPredictor, ReliableEventQueue } from './events.ts';
import type { PredictedShot, ReliableEventQueueStats } from './events.ts';
import { InputStream, NEUTRAL_CONTROL } from './inputStream.ts';
import type { ControlSample, InputStreamOptions, PredictionControl } from './inputStream.ts';
import { RemoteInterpolator } from './interpolation.ts';
import type { EntitySample, FrameMetaSample, InterpolatorOptions, ShellSample } from './interpolation.ts';
import { LocalPredictor } from './prediction.ts';
import type { CorrectionPolicy, PredictionStats, PredictionWorld } from './prediction.ts';
import { ConnectionRecovery } from './recovery.ts';
import type { ConnectionPhase, RecoveryOptions } from './recovery.ts';
import { MigrationStore } from './migrationStore.ts';
import type { RetainedBlob } from './migrationStore.ts';
import { SnapshotStream } from './snapshotStream.ts';
import type { TankState } from '../../sim/movement.ts';

export type Unsubscribe = () => void;

/** The world and specs prediction integrates against; the presentation (or the soak) supplies it. */
export interface PredictionProvider {
  world: PredictionWorld;
  specFor(specId: string): MovementSpec | null;
}

export interface MatchClientOptions {
  transport: Transport;
  /** Seat token issued by the room service. */
  token: string;
  clientBuild?: string;
  /** HELLO_CAPABILITY bits; immediate own-shot feedback by default. */
  capabilities?: number;
  clock?: () => number;
  /** Controls for a tick; null means neutral (destroyed, menu open, no device). */
  controls?: ((tick: number) => Readonly<ControlSample> | null) | null;
  prediction?: PredictionProvider | null;
  correction?: Partial<CorrectionPolicy>;
  interpolation?: InterpolatorOptions;
  recovery?: RecoveryOptions;
  input?: InputStreamOptions;
  /** Assembled frames kept for delta baselines (96 ≈ 3 s; receipts shrink it to force keyframe recovery). */
  snapshotRing?: number;
  pingIntervalMs?: number;
  /** The first pings go faster so the offset filter fills before the match starts. */
  pingBurstCount?: number;
  pingBurstIntervalMs?: number;
  /** Errors kept for diagnostics. */
  maxErrors?: number;
}

export interface OwnShotEvent {
  event: WireEvent;
  /** A flash for this shot already played from the fire edge; present the shell, not the muzzle. */
  feedbackPredicted: boolean;
}

export interface ViewerFrame {
  entityId: number;
  playerId: string;
  /** The predicted, corrected state the renderer reads; null without a prediction world (spectators). */
  state: TankState | null;
  /** The newest authority row, null before the first. */
  row: EntityRow | null;
  viewer: ViewerState | null;
  authorityTick: number;
  authorityReceivedAtMs: number | null;
  /** A fire edge this frame that presentation may flash before the authority confirms it. */
  predictedShot: PredictedShot | null;
}

export interface MatchFrame {
  /** Tick of the newer frame the remote sample used. */
  tick: number;
  renderTimeMs: number;
  entities: EntitySample[];
  shells: ShellSample[];
  meta: FrameMetaSample;
  modeStateJson: string | null;
  /** Persistent destroyed obstacle indices and their revision (from the newest frame). */
  destroyed: readonly number[];
  destructibleRevision: number;
  /**
   * Whether a `world_prop_destroyed` for this obstacle index is still on its way to the presentation (queued behind the
   * presented tick, staged by the budget, or in this frame's `events`): the newest frame's destroyed list already names
   * it, but its fall belongs to the event, not to the list (world state audit, 2026-10-01).
   */
  destroyedPending: (index: number) => boolean;
  /** The destruction log (from the newest frame; append-only) and whether a structure's stage event is still owed to
   * the presentation (its stage belongs to the event, not to the log). */
  destruction: readonly DestructionLogEntry[];
  destructionPending: (structureId: number) => boolean;
  /** Whether a crater's `terrain_crater` event is still owed to the presentation (P3: the crater belongs to it). */
  craterPending: (craterId: number) => boolean;
  viewer: ViewerFrame;
  /** This frame's budgeted reliable events (array reused between frames). */
  events: WireEvent[];
  /** The viewer's accepted shots, delivered immediately (array reused). */
  ownShots: OwnShotEvent[];
  extrapolatedMs: number;
  phase: ConnectionPhase;
}

/** What this client holds for a host migration (P2 client lane): the sealed blobs and the newest assembled frame. */
export interface RetainedMigrationState {
  keyframe: RetainedBlob | null;
  config: RetainedBlob | null;
  /** The newest assembled (viewer-filtered) frame and when it arrived: exact for what this viewer could see. */
  latestFrame: SnapshotFrame | null;
  latestFrameAtMs: number | null;
  /**
   * The obstacle index of every `world_prop_destroyed` this client received in the round, presented or still queued
   * (fix/mp-migration-props, 2026-10-02): a fall reaches a peer the tick it happens, the destroyed list only with the
   * next snapshot, so a host that died between the two left the fall here alone. A link reset clears the event queue,
   * never this.
   */
  fallen: readonly number[];
  /** Every destruction entry a `structure_stage` (later a breach or a crater) named this round: like `fallen`, a link
   * reset clears the queue, never this. */
  destruction?: readonly DestructionLogEntry[];
}

export interface MatchClientStats {
  phase: ConnectionPhase;
  welcomed: boolean;
  matchPhase: PhaseId | null;
  verdict: VerdictId | null;
  rttMs: number | null;
  rttJitterMs: number;
  serverOffsetMs: number;
  serverOffsetTargetMs: number;
  clockSamples: number;
  arrivalJitterMs: number;
  lossRate: number;
  interpolationDelayMs: number;
  targetDelayMs: number;
  extrapolatedSamples: number;
  maxExtrapolatedMs: number;
  /** Samples where an entity snapped (a teleport, a first sight) and the furthest an entity was continued past its own sample (P3b interest tiers). */
  snappedSamples: number;
  maxRowExtrapolatedMs: number;
  bytesIn: number;
  bytesOut: number;
  bytesInPerS: number;
  bytesOutPerS: number;
  framesIn: number;
  framesOut: number;
  snapshotsAccepted: number;
  keyframes: number;
  missingBaselines: number;
  keyframeRequests: number;
  staleSnapshots: number;
  inputAckLagTicks: number;
  inputIntrinsicAckLagTicks: number;
  inputLeadTicks: number;
  inputMarginTicks: number;
  pendingFireEdges: number;
  pendingActionBits: number;
  sampledTicks: number;
  skippedTicks: number;
  inputFramesSent: number;
  prediction: PredictionStats | null;
  events: ReliableEventQueueStats;
  ownShotsPredicted: number;
  ownShotsConfirmed: number;
  transport: TransportStats;
  transportState: string;
  bufferedBytes: number;
  decodeErrors: number;
  serverErrors: number;
  reconnects: number;
  stalls: number;
  outageMs: number;
  closeReason: CloseReasonId | null;
  /** Own-row hints sent after a resumed link (P3b: the migration seed for a hull the new host could not see). */
  resumeHintsSent: number;
}

interface PendingPing {
  key: number;
  sentAtMs: number;
}

const MAX_PENDING_PINGS = 8;
const MAX_TICKS_PER_FRAME = 4;
const CATCH_UP_LIMIT_TICKS = 8;
/** Display-tick slew: 10 % of the error per frame, at most a tenth of a tick, resync past 8 ticks. */
const DISPLAY_TICK_GAIN = 0.1;
const DISPLAY_TICK_SLEW = 0.1;
const DISPLAY_TICK_RESYNC = 8;
const VIEWER_GUN_INDEX = VIEWER_MODULES.indexOf('gun');
const VIEWER_GUN_MOUNT_INDEX = VIEWER_MODULES.indexOf('gunMount');

function u32(value: number): number { return Math.round(value) >>> 0; }

export class MatchClient {
  readonly transport: Transport;
  readonly clock: () => number;
  readonly serverClock: ServerClock;
  readonly tickClock: TickClock;
  readonly inputStream: InputStream;
  readonly snapshots: SnapshotStream;
  readonly interpolator: RemoteInterpolator;
  readonly events: ReliableEventQueue;
  readonly ownShots: OwnShotPredictor;
  readonly recovery: ConnectionRecovery;
  /** Migration blobs the host rides inside EVENT messages (kept, never presented). */
  readonly migration = new MigrationStore();
  private readonly token: string;
  private readonly clientBuild: string;
  private readonly capabilities: number;
  private readonly controls: ((tick: number) => Readonly<ControlSample> | null) | null;
  private readonly correction: Partial<CorrectionPolicy>;
  private predictionProvider: PredictionProvider | null;
  private predictor: LocalPredictor | null = null;
  private readonly pingIntervalMs: number;
  private readonly pingBurstCount: number;
  private readonly pingBurstIntervalMs: number;
  private readonly maxErrors: number;
  private readonly timeUnwrap = new TimeUnwrapper();
  private readonly pendingPings: PendingPing[] = [];
  private readonly unsubscribe: Unsubscribe[] = [];
  private readonly frame: MatchFrame;
  /** Own shots received since the last frame; swapped into the frame at the next update. */
  private pendingOwnShots: OwnShotEvent[] = [];
  private helloSentAtMs: number | null = null;
  private readonly frameListeners = new Set<(frame: MatchFrame) => void>();
  private readonly welcomeListeners = new Set<(welcome: WelcomeMessage) => void>();
  private readonly phaseListeners = new Set<(phase: ConnectionPhase, detail: string) => void>();
  readonly errors: ErrorMessage[] = [];
  private welcomeMessage: WelcomeMessage | null = null;
  /** The authority's snapshot rate as the newest WELCOME named it (SNAPSHOT_HZ before the first). */
  private snapshotHz = SNAPSHOT_HZ;
  private ownPlayerId = '';
  private ownRow: EntityRow | null = null;
  private ownViewer: ViewerState | null = null;
  private ownAuthorityTick = -1;
  private ownAuthorityAtMs: number | null = null;
  private lastAuthorityAtMs: number | null = null;
  private openedAtMs: number | null = null;
  private lastPingAtMs = -Infinity;
  private pingsSent = 0;
  private pingKey = 0;
  private pendingSpectatorAck = NO_TICK;
  private keyframeRequestedForGap = false;
  private predictedShot: PredictedShot | null = null;
  /** The fractional tick the local tank is presented at; runs at one tick per tick of local time and slews to the sampler. */
  private displayTick = -1;
  private closeReason: CloseReasonId | null = null;
  private closeDetail = '';
  private disposed = false;
  private latestDestroyed: readonly number[] = [];
  private latestRevision = 0;
  /** Every obstacle a `world_prop_destroyed` named this round (RetainedMigrationState.fallen). */
  private readonly fallenObstacles = new Set<number>();
  /** Every stage a `structure_stage` named this round (RetainedMigrationState.destruction). */
  private readonly retainedDestruction: DestructionLogEntry[] = [];
  private latestDestruction: readonly DestructionLogEntry[] = [];
  private matchPhase: PhaseId | null = null;
  private verdict: VerdictId | null = null;
  private decodeErrors = 0;
  private serverErrors = 0;
  private keyframeRequests = 0;
  private inputFramesSent = 0;
  private resumeHintsSent = 0;
  private snapshotsAccepted = 0;
  private rateWindowStartMs: number | null = null;
  private rateWindowBytesIn = 0;
  private rateWindowBytesOut = 0;
  private bytesInPerS = 0;
  private bytesOutPerS = 0;

  constructor({
    transport,
    token,
    clientBuild = 'dev',
    capabilities = HELLO_CAPABILITY.SHOT_FEEDBACK,
    clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
    controls = null,
    prediction = null,
    correction = {},
    interpolation = {},
    recovery = {},
    input = {},
    snapshotRing = 96,
    pingIntervalMs = 1000,
    pingBurstCount = 8,
    pingBurstIntervalMs = 200,
    maxErrors = 32,
  }: MatchClientOptions) {
    if (!transport || typeof transport.send !== 'function') throw new TypeError('a transport is required');
    if (typeof token !== 'string' || !token) throw new TypeError('a seat token is required');
    this.transport = transport;
    this.token = token;
    this.clientBuild = clientBuild;
    this.capabilities = capabilities;
    this.clock = clock;
    this.controls = controls;
    this.predictionProvider = prediction;
    this.correction = correction;
    this.pingIntervalMs = pingIntervalMs;
    this.pingBurstCount = pingBurstCount;
    this.pingBurstIntervalMs = pingBurstIntervalMs;
    this.maxErrors = maxErrors;
    this.serverClock = new ServerClock();
    this.tickClock = new TickClock(TICK_HZ);
    this.inputStream = new InputStream(input);
    // both start at the default rate (SNAPSHOT_HZ) and follow the WELCOME's rate from the handshake on
    this.snapshots = new SnapshotStream({ ringSize: snapshotRing, ticksPerSnapshot: TICK_HZ / SNAPSHOT_HZ });
    this.interpolator = new RemoteInterpolator({ snapshotIntervalMs: 1000 / SNAPSHOT_HZ, ...interpolation });
    this.events = new ReliableEventQueue();
    this.ownShots = new OwnShotPredictor();
    this.recovery = new ConnectionRecovery(recovery);
    this.frame = {
      tick: 0, renderTimeMs: 0, entities: [], shells: [],
      meta: { phase: 0, countdownMs: 0, battleTimeMs: 0, verdict: 0, verdictReason: '', destructibleRevision: 0 },
      modeStateJson: null, destroyed: [], destructibleRevision: 0,
      destroyedPending: (index) => this.events.isObstaclePending(index),
      destruction: [],
      destructionPending: (structureId) => this.events.isStructurePending(structureId),
      craterPending: (craterId) => this.events.isCraterPending(craterId),
      viewer: {
        entityId: NO_ENTITY, playerId: '', state: null, row: null, viewer: null, authorityTick: -1,
        authorityReceivedAtMs: null, predictedShot: null,
      },
      events: [], ownShots: [], extrapolatedMs: 0, phase: 'idle',
    };
    this.unsubscribe.push(transport.onFrame((bytes) => this.receive(bytes)));
    this.unsubscribe.push(transport.onState((change) => this.transportChanged(change)));
  }

  // ------------------------------------------------------------ public surface

  get welcome(): WelcomeMessage | null { return this.welcomeMessage; }
  /** The verdict the authority's frames named (NONE/null before one): the status surface reads it — a close after it is the end screen's business. */
  get lastVerdict(): VerdictId | null { return this.verdict; }
  get roster(): readonly RosterEntry[] { return this.welcomeMessage?.roster ?? []; }
  get phase(): ConnectionPhase { return this.recovery.current; }
  get isSeated(): boolean { return !!this.welcomeMessage && this.welcomeMessage.entityId !== NO_ENTITY; }
  get ownEntityId(): number { return this.welcomeMessage?.entityId ?? NO_ENTITY; }
  /** The authority's snapshot rate (Hz) this client runs at: the WELCOME's, SNAPSHOT_HZ before one arrives. */
  get snapshotRateHz(): number { return this.snapshotHz; }
  /** The presented state of the viewer's tank (null without prediction). */
  get localTank(): TankState | null { return this.predictor?.presented ?? null; }
  /** The prediction's simulation state at the newest sampled tick (collision framing, diagnostics). */
  get predictionState(): TankState | null { return this.predictor?.simulationState ?? null; }
  get lastCloseReason(): CloseReasonId | null { return this.closeReason; }
  get lastCloseDetail(): string { return this.closeDetail; }
  /** Allocation-free reads for the network status model (stats() copies; these do not). */
  get lastAuthorityReceivedAtMs(): number | null { return this.lastAuthorityAtMs; }
  get snapshotsAcceptedCount(): number { return this.snapshotsAccepted; }
  get predictorStats(): Readonly<PredictionStats> | null { return this.predictor?.liveStats ?? null; }
  get bytesInPerSecond(): number { return this.bytesInPerS; }
  get bytesOutPerSecond(): number { return this.bytesOutPerS; }

  /**
   * The state a newly elected host boots from (the sealed keyframe and config, the newest frame this viewer assembled,
   * every prop it was told fell).
   */
  retainedMigration(): RetainedMigrationState {
    return {
      keyframe: this.migration.keyframe, config: this.migration.config, latestFrame: this.snapshots.latest, latestFrameAtMs: this.lastAuthorityAtMs,
      fallen: [...this.fallenObstacles],
      destruction: this.retainedDestruction.slice(),
    };
  }

  connect(): void {
    if (this.disposed) throw new Error('match client disposed');
    this.transport.open();
  }

  /** Explicit leave: tells the server, ends recovery, closes the transport. */
  leave(reason: CloseReasonId = CLOSE_REASON.CLIENT_LEAVE): void {
    if (this.disposed) return;
    if (this.transport.state === 'open') this.send(encodeMessage({ type: MESSAGE_TYPE.LEAVE, reason }));
    this.recovery.end('left');
    this.transport.close(TRANSPORT_CLOSE.CLIENT, 'leave');
    this.notifyPhase('left', 'leave');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.recovery.current !== 'left' && this.recovery.current !== 'failed') this.recovery.end('closed');
    for (const off of this.unsubscribe) off();
    this.unsubscribe.length = 0;
    this.transport.close(TRANSPORT_CLOSE.CLIENT, 'dispose');
    this.frameListeners.clear();
    this.welcomeListeners.clear();
    this.phaseListeners.clear();
  }

  /** Supply (or replace) the prediction world after construction (the presentation knows the map late). */
  enablePrediction(provider: PredictionProvider | null): void {
    this.predictionProvider = provider;
    this.predictor = null;
    this.ensurePredictor();
  }

  onFrame(listener: (frame: MatchFrame) => void): Unsubscribe {
    this.frameListeners.add(listener);
    return () => { this.frameListeners.delete(listener); };
  }

  onWelcome(listener: (welcome: WelcomeMessage) => void): Unsubscribe {
    this.welcomeListeners.add(listener);
    return () => { this.welcomeListeners.delete(listener); };
  }

  onPhase(listener: (phase: ConnectionPhase, detail: string) => void): Unsubscribe {
    this.phaseListeners.add(listener);
    return () => { this.phaseListeners.delete(listener); };
  }

  /**
   * One display frame: clock slew, recovery, input ticks, pings, the remote
   * sample at `serverNow − delay`, the local presentation, the event flush.
   * Returns null until the first snapshot has been assembled.
   */
  update(nowMs: number, elapsedS: number): MatchFrame | null {
    if (this.disposed || this.recovery.current === 'left') return null;
    this.serverClock.advance(nowMs);
    this.stepRecovery(nowMs);
    this.observeRates(nowMs);
    const live = this.welcomeMessage !== null && this.transport.state === 'open' && this.recovery.current !== 'failed';
    this.predictedShot = null;
    if (live) {
      this.sampleInputs(nowMs, elapsedS);
      this.maintainPings(nowMs);
      this.maintainAcks();
    }
    const serverNow = this.serverClock.serverNow(nowMs);
    const sample = this.interpolator.sample(serverNow);
    if (!sample) return null;
    const frame = this.frame;
    frame.tick = sample.tick;
    frame.renderTimeMs = sample.renderTimeMs;
    frame.entities = sample.entities;
    frame.shells = sample.shells;
    frame.meta = sample.meta;
    frame.modeStateJson = sample.modeStateJson;
    frame.extrapolatedMs = sample.extrapolatedMs;
    frame.destroyed = this.latestDestroyed;
    frame.destructibleRevision = this.latestRevision;
    frame.destruction = this.latestDestruction;
    frame.phase = this.recovery.current;
    if (this.predictor) this.predictor.present(elapsedS, this.displayTick);
    const viewer = frame.viewer;
    viewer.entityId = this.ownEntityId;
    viewer.playerId = this.ownPlayerId;
    viewer.state = this.predictor?.presented ?? null;
    viewer.row = this.ownRow;
    viewer.viewer = this.ownViewer;
    viewer.authorityTick = this.ownAuthorityTick;
    viewer.authorityReceivedAtMs = this.ownAuthorityAtMs;
    viewer.predictedShot = this.predictedShot;
    // the previous frame's events were presented: the queue no longer owes them (a destroyed-list entry may now settle)
    this.events.release(frame.events);
    frame.events.length = 0;
    this.events.flush(sample.tick, frame.events);
    // Double-buffered: shots that arrived since the last frame are this frame's; the other array collects the next.
    const delivered = frame.ownShots;
    delivered.length = 0;
    frame.ownShots = this.pendingOwnShots;
    this.pendingOwnShots = delivered;
    for (const listener of this.frameListeners) listener(frame);
    return frame;
  }

  stats(): MatchClientStats {
    const streams = this.snapshots.stats();
    const input = this.inputStream.stats();
    const interp = this.interpolator.stats();
    return {
      phase: this.recovery.current,
      welcomed: this.welcomeMessage !== null,
      matchPhase: this.matchPhase,
      verdict: this.verdict,
      rttMs: this.serverClock.rttMs,
      rttJitterMs: this.serverClock.rttJitterMs,
      serverOffsetMs: this.serverClock.offset,
      serverOffsetTargetMs: this.serverClock.target,
      clockSamples: this.serverClock.sampleCount,
      arrivalJitterMs: interp.arrivalJitterMs,
      lossRate: streams.lossRate,
      interpolationDelayMs: interp.delayMs,
      targetDelayMs: interp.targetDelayMs,
      extrapolatedSamples: interp.extrapolatedSamples,
      maxExtrapolatedMs: interp.maxExtrapolatedMs,
      snappedSamples: interp.snappedSamples,
      maxRowExtrapolatedMs: interp.maxRowExtrapolatedMs,
      bytesIn: this.transport.stats.bytesReceived,
      bytesOut: this.transport.stats.bytesSent,
      bytesInPerS: this.bytesInPerS,
      bytesOutPerS: this.bytesOutPerS,
      framesIn: this.transport.stats.framesReceived,
      framesOut: this.transport.stats.framesSent,
      snapshotsAccepted: this.snapshotsAccepted,
      keyframes: streams.keyframes,
      missingBaselines: streams.missingBaselines,
      keyframeRequests: this.keyframeRequests,
      staleSnapshots: streams.stale,
      inputAckLagTicks: input.ackLagTicks,
      inputIntrinsicAckLagTicks: input.intrinsicAckLagTicks,
      inputLeadTicks: input.leadTicks,
      inputMarginTicks: input.lastMarginTicks,
      pendingFireEdges: input.pendingFireEdges,
      pendingActionBits: input.pendingActionBits,
      sampledTicks: input.sampledTicks,
      skippedTicks: input.skippedTicks,
      inputFramesSent: this.inputFramesSent,
      prediction: this.predictor?.getStats() ?? null,
      events: this.events.stats(),
      ownShotsPredicted: this.ownShots.predicted,
      ownShotsConfirmed: this.ownShots.confirmed,
      transport: { ...this.transport.stats },
      transportState: this.transport.state,
      bufferedBytes: this.transport.bufferedBytes,
      decodeErrors: this.decodeErrors,
      serverErrors: this.serverErrors,
      reconnects: this.transport.stats.reconnects,
      stalls: this.recovery.stallCount,
      outageMs: this.recovery.outageStartedAtMs === null ? 0 : Math.max(0, this.clock() - this.recovery.outageStartedAtMs),
      closeReason: this.closeReason,
      resumeHintsSent: this.resumeHintsSent,
    };
  }

  // ------------------------------------------------------------ transport

  private transportChanged(change: TransportStateChange): void {
    if (this.disposed) return;
    if (change.state === 'open') {
      this.openedAtMs = this.clock();
      // A resumed link may be a new host (a migration): the own newest authority row from the host we lost is the seed
      // for our hull if the new host could not see it (P3b); the actor bounds it and ignores it on a plain reconnect.
      // The hint is dated by the row's capture tick (the last time the authority captured the pose fresh), never the
      // frame's: the actor compares it with the restored row's capture tick, so its own host's carried row reads as no
      // newer and a hull that moved since the keyframe as newer.
      const hint = change.resumed ? this.ownRow : null;
      if (change.resumed) this.resetForNewSocket();
      this.sendHello();
      if (hint) this.sendResumeHint(hint.tick, hint);
    } else if (change.state === 'reconnecting') {
      this.welcomeMessage = null;
      this.inputStream.clearPendingEdges();
      this.ownShots.cancel();
      this.pendingPings.length = 0;
    } else if (change.state === 'closed') {
      this.pendingPings.length = 0;
      if (change.reason === TRANSPORT_CLOSE.EXHAUSTED || change.reason === TRANSPORT_CLOSE.BACKPRESSURE ||
          change.reason === TRANSPORT_CLOSE.TIMEOUT) {
        this.recovery.end('failed');
        this.notifyPhase('failed', change.detail ?? change.reason);
      } else if (change.reason === TRANSPORT_CLOSE.SERVER || change.reason === TRANSPORT_CLOSE.NETWORK ||
          change.reason === TRANSPORT_CLOSE.PROTOCOL) {
        if (this.recovery.current !== 'left') {
          this.recovery.end('closed');
          this.notifyPhase('closed', change.detail ?? change.reason);
        }
      }
    }
  }

  /** A new socket: the server holds no baseline and expects a fresh HELLO. */
  private resetForNewSocket(): void {
    this.snapshots.reset();
    this.interpolator.clear();
    this.events.clear();
    this.predictor?.reset();
    this.ownShots.reset();
    this.pendingOwnShots.length = 0;
    this.ownRow = null;
    this.ownViewer = null;
    this.ownAuthorityTick = -1;
    this.ownAuthorityAtMs = null;
    this.lastAuthorityAtMs = null;
    this.keyframeRequestedForGap = false;
    this.pendingSpectatorAck = NO_TICK;
  }

  private sendHello(): void {
    this.helloSentAtMs = this.clock();
    this.send(encodeMessage({
      type: MESSAGE_TYPE.HELLO,
      protocolVersion: PROTOCOL_VERSION,
      capabilities: this.capabilities,
      token: this.token,
      clientBuild: this.clientBuild,
    }));
  }

  private send(bytes: Uint8Array): boolean {
    return this.transport.send(bytes);
  }

  /** The own row as of its capture tick `tick`. */
  private sendResumeHint(tick: number, row: EntityRow): void {
    const sent = this.send(encodeMessage({
      type: MESSAGE_TYPE.RESUME_HINT, tick, x: row.x, y: row.y, z: row.z, speed: row.speed, verticalSpeed: row.verticalSpeed,
      yaw: row.yaw, pitch: row.pitch, roll: row.roll, turretYaw: row.turretYaw, gunPitch: row.gunPitch,
    }));
    if (sent) this.resumeHintsSent++;
  }

  private receive(bytes: Uint8Array): void {
    if (this.disposed) return;
    const nowMs = this.clock();
    const decoded = decodeMessage(bytes, { resolveBaseline: this.snapshots.resolveBaseline });
    if (!decoded.ok) {
      if (decoded.error.code === 'missing_baseline') {
        this.snapshots.noteMissingBaseline();
        this.requestKeyframe();
      } else this.decodeErrors++;
      return;
    }
    const message = decoded.message;
    switch (message.type) {
      case MESSAGE_TYPE.WELCOME: this.receiveWelcome(message, nowMs); break;
      case MESSAGE_TYPE.SNAPSHOT: this.receiveSnapshot(message, nowMs); break;
      case MESSAGE_TYPE.EVENT: this.receiveEvents(message); break;
      case MESSAGE_TYPE.PONG: this.receivePong(message, nowMs); break;
      case MESSAGE_TYPE.ERROR:
        this.serverErrors++;
        this.errors.push(message);
        if (this.errors.length > this.maxErrors) this.errors.shift();
        break;
      case MESSAGE_TYPE.CLOSE:
        this.closeReason = message.reason;
        this.closeDetail = message.detail;
        if (this.recovery.current !== 'left') this.recovery.end('closed');
        this.transport.close(TRANSPORT_CLOSE.SERVER, message.detail || String(message.reason));
        this.notifyPhase('closed', message.detail);
        break;
      default:
        // Client-to-server types never arrive here; the decoder already validated the frame.
        break;
    }
  }

  // ------------------------------------------------------------ handshake + clock

  private receiveWelcome(welcome: WelcomeMessage, nowMs: number): void {
    if (welcome.protocolVersion !== PROTOCOL_VERSION) {
      this.closeReason = CLOSE_REASON.PROTOCOL_VERSION;
      this.closeDetail = `server protocol ${welcome.protocolVersion}`;
      this.recovery.end('closed');
      this.transport.close(TRANSPORT_CLOSE.PROTOCOL, this.closeDetail);
      this.notifyPhase('closed', this.closeDetail);
      return;
    }
    // The tick rate is the simulation's; the snapshot rate is the host's choice (P3b: 20 or 30 Hz, any divisor of the
    // tick rate) and the interpolation delay, the extrapolation cap and the loss estimate follow it in intervals.
    if (welcome.tickHz !== TICK_HZ || welcome.snapshotHz < 1 || TICK_HZ % welcome.snapshotHz !== 0) {
      this.closeReason = CLOSE_REASON.PROTOCOL_VERSION;
      this.closeDetail = `unsupported rates ${welcome.tickHz}/${welcome.snapshotHz} Hz`;
      this.recovery.end('closed');
      this.transport.close(TRANSPORT_CLOSE.PROTOCOL, this.closeDetail);
      this.notifyPhase('closed', this.closeDetail);
      return;
    }
    if (welcome.snapshotHz !== this.snapshotHz) {
      this.snapshotHz = welcome.snapshotHz;
      this.interpolator.setSnapshotInterval(1000 / welcome.snapshotHz);
      this.snapshots.setTicksPerSnapshot(TICK_HZ / welcome.snapshotHz);
    }
    this.welcomeMessage = welcome;
    this.timeUnwrap.reset();
    const serverTimeMs = this.timeUnwrap.unwrap(welcome.serverTimeMs);
    this.tickClock.observe(welcome.serverTick, serverTimeMs);
    // HELLO -> WELCOME is a round trip with a server stamp: the first clock sample.
    if (this.helloSentAtMs !== null) this.serverClock.observePong(this.helloSentAtMs, nowMs, serverTimeMs);
    if (!this.serverClock.isSeeded) this.serverClock.seed(serverTimeMs, nowMs);
    const own = welcome.roster.find((entry) => entry.entityId === welcome.entityId);
    this.ownPlayerId = own?.playerId ?? '';
    if (welcome.entityId !== NO_ENTITY) {
      const startTick = Math.floor(this.tickClock.tickAt(this.serverClock.serverNow(nowMs))) + this.inputStream.lead + 1;
      this.inputStream.start(Math.max(welcome.serverTick, startTick));
      this.ensurePredictor();
    }
    this.lastPingAtMs = -Infinity;
    this.pingsSent = 0;
    for (const listener of this.welcomeListeners) listener(welcome);
  }

  private ensurePredictor(): void {
    if (this.predictor || !this.predictionProvider || !this.welcomeMessage || this.welcomeMessage.entityId === NO_ENTITY) return;
    const own = this.welcomeMessage.roster.find((entry) => entry.entityId === this.welcomeMessage!.entityId);
    const spec = own ? this.predictionProvider.specFor(own.specId) : null;
    if (!spec) return;
    this.predictor = new LocalPredictor(spec, this.predictionProvider.world, this.correction);
  }

  private maintainPings(nowMs: number): void {
    const interval = this.pingsSent < this.pingBurstCount ? this.pingBurstIntervalMs : this.pingIntervalMs;
    if (nowMs - this.lastPingAtMs < interval) return;
    this.sendPing(nowMs, this.snapshots.ackTick);
  }

  private sendPing(nowMs: number, ackTick: number): void {
    const key = u32(this.pingKey++ * 7919 + nowMs);
    if (!this.send(encodeMessage({ type: MESSAGE_TYPE.PING, clientTimeMs: key, snapshotAckTick: ackTick }))) return;
    this.lastPingAtMs = nowMs;
    this.pingsSent++;
    this.pendingPings.push({ key, sentAtMs: nowMs });
    if (this.pendingPings.length > MAX_PENDING_PINGS) this.pendingPings.shift();
  }

  private receivePong(pong: PongMessage, nowMs: number): void {
    const index = this.pendingPings.findIndex((ping) => ping.key === pong.clientTimeMs);
    if (index < 0) return;
    const [ping] = this.pendingPings.splice(index, 1);
    this.serverClock.observePong(ping!.sentAtMs, nowMs, this.timeUnwrap.unwrap(pong.serverTimeMs));
  }

  /** Ask for a keyframe: an ack of NO_TICK (the server sends one when it holds no acked baseline). */
  private requestKeyframe(): void {
    if (this.keyframeRequestedForGap || this.transport.state !== 'open') return;
    this.keyframeRequestedForGap = true;
    this.keyframeRequests++;
    this.sendPing(this.clock(), NO_TICK);
  }

  // ------------------------------------------------------------ snapshots + events

  private receiveSnapshot(packet: SnapshotPacket, nowMs: number): void {
    const accepted = this.snapshots.accept(packet);
    if (!accepted.ok) {
      if (accepted.reason === 'missing_baseline') this.requestKeyframe();
      return;
    }
    const frame = accepted.frame;
    if (accepted.keyframe) this.keyframeRequestedForGap = false;
    const serverTimeMs = this.timeUnwrap.unwrap(frame.serverTimeMs);
    this.tickClock.observe(frame.tick, serverTimeMs);
    this.lastAuthorityAtMs = nowMs;
    this.snapshotsAccepted++;
    this.inputStream.acknowledge(frame, nowMs);
    this.interpolator.push(frame, serverTimeMs, nowMs, this.snapshots.lastGapTick === frame.tick);
    this.latestDestroyed = frame.destroyed;
    this.latestRevision = frame.meta.destructibleRevision;
    this.latestDestruction = frame.destruction ?? [];
    this.matchPhase = frame.meta.phase;
    this.verdict = frame.meta.verdict;
    this.pendingSpectatorAck = frame.tick;
    this.observeOwnRow(frame, nowMs);
  }

  private observeOwnRow(frame: SnapshotFrame, nowMs: number): void {
    const entityId = this.ownEntityId;
    if (entityId === NO_ENTITY) return;
    let row: EntityRow | null = null;
    for (const candidate of frame.entities) if (candidate.entityId === entityId) { row = candidate; break; }
    if (!row) return;
    this.ownRow = row;
    this.ownViewer = frame.viewer && frame.viewer.entityId === entityId ? frame.viewer : null;
    // The own row is on the near tier: captured every snapshot and omitted from a delta only when identical, so a
    // carried row (its capture tick older than the frame's) is the authority's exact pose AT THE FRAME'S TICK — reconcile
    // there. Reconciling at the row's own tick refused every frame of a hull held still against a hull this client
    // cannot see (an unchanged row, an older tick, "no newer authority") and the prediction drove on through it: 3.6 m
    // of misprediction in the client soak against 0.3 (P3b, 2026-09-29).
    this.ownAuthorityTick = frame.tick;
    this.ownAuthorityAtMs = nowMs;
    const viewer = this.ownViewer;
    const own = this.welcomeMessage?.roster.find(entry => entry.entityId === entityId);
    const gun = own ? this.predictionProvider?.specFor(own.specId)?.gun : undefined;
    const round = gun?.shells?.[row.shellSlot];
    const gunRed = !viewer || (usesLauncherMuzzles(gun, round)
      ? viewer.modules[VIEWER_MODULES.indexOf('missileRack')] === 2
      : viewer.modules[VIEWER_GUN_INDEX] === 2 || viewer.modules[VIEWER_GUN_MOUNT_INDEX] === 2
        || viewer.modules[VIEWER_MODULES.indexOf('feedSystem')] === 2);
    this.ownShots.observe({
      tick: frame.tick,
      alive: row.hp > 0 && (row.flags & ENTITY_FLAGS.DESTROYED) === 0,
      shellSlot: row.shellSlot,
      reloadS: dequantizeReloadS(row.reload),
      ammo: row.shellSlot === 0 ? row.ammo0 : row.shellSlot === 1 ? row.ammo1 : row.ammo2,
      magazineRounds: row.magazineRounds,
      magazineCapacity: row.magazineCapacity,
      guided: false,
      weaponBlocked: gunRed,
    }, nowMs);
    this.ensurePredictor();
    this.predictor?.reconcile(
      { tick: frame.tick, row, viewer: this.ownViewer },
      this.controlAt,
      this.inputStream.lastSampledTick,
    );
  }

  private readonly controlAt = (tick: number): PredictionControl | null => this.inputStream.controlAt(tick);

  private receiveEvents(message: EventMessage): void {
    // Migration chunks are retained here and never reach the presentation or the budgeted queue.
    let game: WireEvent[] | null = null;
    const nowMs = this.clock();
    for (const event of message.events) {
      if (this.migration.receive(event, nowMs)) continue;
      (game ??= []).push(event);
      if (event.kind === 'world_prop_destroyed') {
        const index = Number(event.payload.obstacleIndex);
        if (Number.isSafeInteger(index) && index >= 0) this.fallenObstacles.add(index);
      } else if (event.kind === 'structure_stage') {
        const structureId = Number(event.payload.structureId), stage = event.payload.stage;
        if (Number.isSafeInteger(structureId) && structureId >= 0
          && (stage === 'damaged' || stage === 'breached' || stage === 'collapsed')) {
          const cx = Number(event.payload.cx), cz = Number(event.payload.cz);
          this.retainedDestruction.push(Number.isFinite(cx) && Number.isFinite(cz)
            ? { kind: 'stage', structureId, stage, cx, cz } : { kind: 'stage', structureId, stage });
        }
      } else if (event.kind === 'structure_breach') {
        // a hole or a fall (P2), as the log carries it (its footprint centre with it)
        const p = event.payload;
        const structureId = Number(p.structureId), section = Number(p.section), hole = Number(p.hole);
        const x = Number(p.x), y = Number(p.y), z = Number(p.z), radiusM = Number(p.radiusM);
        if (Number.isSafeInteger(structureId) && structureId >= 0 && Number.isSafeInteger(section) && Number.isSafeInteger(hole)
          && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && Number.isFinite(radiusM)) {
          const cx = Number(p.cx), cz = Number(p.cz);
          const entry = { kind: 'breach' as const, structureId, section, hole, x, y, z, radiusM, sectionDown: p.sectionDown === true };
          this.retainedDestruction.push(Number.isFinite(cx) && Number.isFinite(cz) ? { ...entry, cx, cz } : entry);
        }
      }
    }
    if (!game) return;
    if (game.length !== message.events.length) message = { type: MESSAGE_TYPE.EVENT, tick: message.tick, events: game };
    if (!this.ownPlayerId) { this.events.push(message); return; }
    let own: WireEvent[] | null = null;
    let rest: WireEvent[] | null = null;
    for (const event of message.events) {
      if (event.kind === 'shell_fired' && event.payload.shooterId === this.ownPlayerId) (own ??= []).push(event);
      else (rest ??= []).push(event);
    }
    if (own) {
      for (const event of own) {
        const predicted = this.ownShots.confirm(event);
        this.pendingOwnShots.push({ event, feedbackPredicted: predicted !== null });
      }
    }
    if (rest) this.events.push({ type: MESSAGE_TYPE.EVENT, tick: message.tick, events: rest });
  }

  // ------------------------------------------------------------ input

  /**
   * The display tick trails the sampler by up to one tick so consecutive
   * tick poses blend; it advances with local time and slews toward its
   * target instead of jumping when the lead or the RTT estimate changes.
   */
  private advanceDisplayTick(targetTick: number, elapsedS: number): void {
    const newest = this.inputStream.lastSampledTick;
    if (this.displayTick < 0 || Math.abs(targetTick - this.displayTick) > DISPLAY_TICK_RESYNC) {
      this.displayTick = targetTick;
    } else {
      this.displayTick += elapsedS * TICK_HZ;
      const error = targetTick - this.displayTick;
      this.displayTick += Math.max(-DISPLAY_TICK_SLEW, Math.min(DISPLAY_TICK_SLEW, error * DISPLAY_TICK_GAIN));
    }
    this.displayTick = Math.max(newest - 2, Math.min(newest, this.displayTick));
  }

  private sampleInputs(nowMs: number, elapsedS: number): void {
    if (!this.inputStream.isStarted || !this.isSeated) return;
    const serverNow = this.serverClock.serverNow(nowMs);
    const oneWayMs = (this.serverClock.rttMs ?? 0) / 2;
    const targetTick = this.tickClock.tickAt(serverNow + oneWayMs) + this.inputStream.lead;
    const due = this.inputStream.dueTicks(targetTick, MAX_TICKS_PER_FRAME, CATCH_UP_LIMIT_TICKS);
    for (let index = 0; index < due; index++) {
      const tick = this.inputStream.pendingTick;
      const sample = this.controls?.(tick) ?? NEUTRAL_CONTROL;
      const previousFireSeq = this.inputStream.currentFireSeq;
      const control = this.inputStream.sample(sample);
      this.predictor?.recordTick(control);
      if (control.fireSeq !== previousFireSeq) {
        this.predictedShot = this.ownShots.predict(control.fireSeq, control.shellSlot, nowMs) ?? this.predictedShot;
      }
    }
    this.advanceDisplayTick(targetTick - 1, elapsedS);
    if (due > 0) {
      const message = this.inputStream.frame(this.snapshots.ackTick, this.interpolator.delay);
      if (message && this.send(encodeMessage(message))) this.inputFramesSent++;
    }
  }

  /** Spectators send no INPUT: acknowledge each assembled snapshot explicitly. */
  private maintainAcks(): void {
    if (this.isSeated || this.pendingSpectatorAck === NO_TICK) return;
    const tick = this.pendingSpectatorAck;
    this.pendingSpectatorAck = NO_TICK;
    this.send(encodeMessage({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick }));
  }

  // ------------------------------------------------------------ recovery + rates

  private stepRecovery(nowMs: number): void {
    const step = this.recovery.update({
      nowMs,
      transportState: this.transport.state,
      welcomed: this.welcomeMessage !== null,
      lastAuthorityAtMs: this.lastAuthorityAtMs,
      openedAtMs: this.openedAtMs,
    });
    if (step.requestReconnect) {
      this.transport.reconnect(TRANSPORT_CLOSE.STALLED, `no accepted authority for ${Math.round(this.recovery.stallMs)} ms`);
    }
    if (step.fail && this.transport.state !== 'closed') {
      this.transport.close(TRANSPORT_CLOSE.TIMEOUT, `no authority for ${Math.round(step.outageMs)} ms`);
    }
    if (step.changed) this.notifyPhase(step.phase, step.phase === 'stalled' ? 'authority_stalled' : '');
  }

  private notifyPhase(phase: ConnectionPhase, detail: string): void {
    for (const listener of this.phaseListeners) listener(phase, detail);
  }

  private observeRates(nowMs: number): void {
    const stats = this.transport.stats;
    if (this.rateWindowStartMs === null) {
      this.rateWindowStartMs = nowMs;
      this.rateWindowBytesIn = stats.bytesReceived;
      this.rateWindowBytesOut = stats.bytesSent;
      return;
    }
    const elapsedMs = nowMs - this.rateWindowStartMs;
    if (elapsedMs < 1000) return;
    this.bytesInPerS = (stats.bytesReceived - this.rateWindowBytesIn) * 1000 / elapsedMs;
    this.bytesOutPerS = (stats.bytesSent - this.rateWindowBytesOut) * 1000 / elapsedMs;
    this.rateWindowStartMs = nowMs;
    this.rateWindowBytesIn = stats.bytesReceived;
    this.rateWindowBytesOut = stats.bytesSent;
  }
}
