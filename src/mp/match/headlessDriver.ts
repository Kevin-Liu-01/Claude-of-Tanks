/**
 * Headless driver: runs a MatchClient on a virtual clock at a display rate,
 * pumps its transport, and measures the charter's smoothness gates from the
 * frames the presentation would receive — no renderer, no DOM. The receipts
 * and `tools/mp-client-soak.mjs` share it.
 */
import type { MatchClient, MatchFrame } from './matchClient.ts';

export interface HeadlessDriverOptions {
  client: MatchClient;
  /** Advance the shared virtual clock. */
  advanceClock: (ms: number) => number;
  /** Deliver due frames on the link(s) and run the server (called after each clock advance). */
  pump: (nowMs: number) => void;
  frameIntervalMs?: number;
  /** Entities whose pose steps are measured (default: every remote entity). */
  measureEntity?: (entityId: number) => boolean;
  /** Warm-up frames excluded from the gates (the first authority arrival). */
  warmupFrames?: number;
}

export interface GateMetrics {
  frames: number;
  framesWithSample: number;
  /** Largest per-frame move of a remote entity's presented position (metres), warm-up excluded. */
  maxRemoteStepM: number;
  remoteStepsOver: number;
  remoteStepLimitM: number;
  /** Largest per-frame move of the viewer's presented tank. */
  maxOwnStepM: number;
  ownStepsOver: number;
  /** Ack-lag samples in ticks (one per accepted snapshot). */
  ackLagTicks: number[];
  ackLagP50: number;
  ackLagP95: number;
  hardSnaps: number;
  maxCorrectionStepM: number;
  maxCorrectionM: number;
  keyframes: number;
  missingBaselines: number;
  keyframeRecoveries: number;
  extrapolatedSamples: number;
  maxExtrapolatedMs: number;
  eventsDelivered: number;
  ownShotsDelivered: number;
  predictedShots: number;
  rttMs: number | null;
  interpolationDelayMs: number;
  bytesIn: number;
  bytesOut: number;
  elapsedMs: number;
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * (sorted.length - 1)))]!;
}

export class HeadlessMatchClientDriver {
  readonly client: MatchClient;
  readonly frameIntervalMs: number;
  private readonly advanceClock: (ms: number) => number;
  private readonly pump: (nowMs: number) => void;
  private readonly measureEntity: (entityId: number) => boolean;
  private readonly warmupFrames: number;
  private readonly lastRemote = new Map<number, { x: number; y: number; z: number; tick: number }>();
  private lastOwn: { x: number; y: number; z: number } | null = null;
  private lastNowMs: number | null = null;
  private lastAckLag = -1;
  private lastAcceptedSnapshots = 0;
  private lastMissingBaselines = 0;
  private awaitingRecovery = false;
  private frames = 0;
  private framesWithSample = 0;
  private elapsedMs = 0;
  readonly remoteStepLimitM: number;
  private readonly metrics = {
    maxRemoteStepM: 0, remoteStepsOver: 0, maxOwnStepM: 0, ownStepsOver: 0, ackLagTicks: [] as number[],
    keyframeRecoveries: 0, eventsDelivered: 0, ownShotsDelivered: 0, predictedShots: 0,
  };
  /** Every frame the client produced (kept for callers that need the timeline; cleared by `drain()`). */
  readonly frameLog: Array<{ nowMs: number; tick: number; entities: number; ownX: number | null; ownZ: number | null }> = [];

  constructor({
    client,
    advanceClock,
    pump,
    frameIntervalMs = 1000 / 60,
    measureEntity = () => true,
    warmupFrames = 30,
  }: HeadlessDriverOptions, remoteStepLimitM = 0.5) {
    this.client = client;
    this.advanceClock = advanceClock;
    this.pump = pump;
    this.frameIntervalMs = frameIntervalMs;
    this.measureEntity = measureEntity;
    this.warmupFrames = warmupFrames;
    this.remoteStepLimitM = remoteStepLimitM;
  }

  /**
   * One display frame: advance the clock (or take the caller's shared time
   * when several drivers share one clock), pump the link, update the client,
   * measure.
   */
  step(sharedNowMs?: number): MatchFrame | null {
    const nowMs = sharedNowMs ?? this.advanceClock(this.frameIntervalMs);
    const elapsedMs = this.lastNowMs === null ? this.frameIntervalMs : Math.max(0, nowMs - this.lastNowMs);
    this.lastNowMs = nowMs;
    this.pump(nowMs);
    const frame = this.client.update(nowMs, elapsedMs / 1000);
    this.frames++;
    this.elapsedMs += elapsedMs;
    this.observe(frame, nowMs);
    return frame;
  }

  run(ms: number): void {
    const steps = Math.round(ms / this.frameIntervalMs);
    for (let index = 0; index < steps; index++) this.step();
  }

  private observe(frame: MatchFrame | null, nowMs: number): void {
    const stats = this.client.stats();
    if (stats.snapshotsAccepted > this.lastAcceptedSnapshots) {
      this.lastAcceptedSnapshots = stats.snapshotsAccepted;
      if (this.client.isSeated && stats.inputAckLagTicks !== this.lastAckLag) {
        this.lastAckLag = stats.inputAckLagTicks;
        if (this.frames > this.warmupFrames) this.metrics.ackLagTicks.push(stats.inputAckLagTicks);
      }
      if (this.awaitingRecovery && stats.keyframes > 0) {
        this.metrics.keyframeRecoveries++;
        this.awaitingRecovery = false;
      }
    }
    if (stats.missingBaselines > this.lastMissingBaselines) {
      this.lastMissingBaselines = stats.missingBaselines;
      this.awaitingRecovery = true;
    }
    if (!frame) return;
    this.framesWithSample++;
    const warm = this.frames > this.warmupFrames;
    const ownId = this.client.ownEntityId;
    const seen = new Set<number>();
    for (const entity of frame.entities) {
      if (entity.entityId === ownId || !this.measureEntity(entity.entityId)) continue;
      seen.add(entity.entityId);
      const last = this.lastRemote.get(entity.entityId);
      if (last && warm && !entity.snapped) {
        const step = Math.hypot(entity.x - last.x, entity.y - last.y, entity.z - last.z);
        this.metrics.maxRemoteStepM = Math.max(this.metrics.maxRemoteStepM, step);
        if (step > this.remoteStepLimitM) this.metrics.remoteStepsOver++;
      }
      if (last) { last.x = entity.x; last.y = entity.y; last.z = entity.z; last.tick = frame.tick; }
      else this.lastRemote.set(entity.entityId, { x: entity.x, y: entity.y, z: entity.z, tick: frame.tick });
    }
    for (const id of this.lastRemote.keys()) if (!seen.has(id)) this.lastRemote.delete(id);
    const own = frame.viewer.state;
    if (own) {
      if (this.lastOwn && warm) {
        const step = Math.hypot(own.pos.x - this.lastOwn.x, own.pos.y - this.lastOwn.y, own.pos.z - this.lastOwn.z);
        this.metrics.maxOwnStepM = Math.max(this.metrics.maxOwnStepM, step);
        if (step > this.remoteStepLimitM) this.metrics.ownStepsOver++;
      }
      this.lastOwn ??= { x: 0, y: 0, z: 0 };
      this.lastOwn.x = own.pos.x; this.lastOwn.y = own.pos.y; this.lastOwn.z = own.pos.z;
    }
    this.metrics.eventsDelivered += frame.events.length;
    this.metrics.ownShotsDelivered += frame.ownShots.length;
    if (frame.viewer.predictedShot) this.metrics.predictedShots++;
    this.frameLog.push({
      nowMs, tick: frame.tick, entities: frame.entities.length,
      ownX: own ? own.pos.x : null, ownZ: own ? own.pos.z : null,
    });
    if (this.frameLog.length > 4096) this.frameLog.splice(0, this.frameLog.length - 4096);
  }

  gates(): GateMetrics {
    const stats = this.client.stats();
    return {
      frames: this.frames,
      framesWithSample: this.framesWithSample,
      maxRemoteStepM: this.metrics.maxRemoteStepM,
      remoteStepsOver: this.metrics.remoteStepsOver,
      remoteStepLimitM: this.remoteStepLimitM,
      maxOwnStepM: this.metrics.maxOwnStepM,
      ownStepsOver: this.metrics.ownStepsOver,
      ackLagTicks: this.metrics.ackLagTicks.slice(),
      ackLagP50: percentile(this.metrics.ackLagTicks, 0.5),
      ackLagP95: percentile(this.metrics.ackLagTicks, 0.95),
      hardSnaps: stats.prediction?.hardSnaps ?? 0,
      maxCorrectionStepM: stats.prediction?.maxCorrectionStepM ?? 0,
      maxCorrectionM: stats.prediction?.maxPositionErrorM ?? 0,
      keyframes: stats.keyframes,
      missingBaselines: stats.missingBaselines,
      keyframeRecoveries: this.metrics.keyframeRecoveries,
      extrapolatedSamples: stats.extrapolatedSamples,
      maxExtrapolatedMs: stats.maxExtrapolatedMs,
      eventsDelivered: this.metrics.eventsDelivered,
      ownShotsDelivered: this.metrics.ownShotsDelivered,
      predictedShots: this.metrics.predictedShots,
      rttMs: stats.rttMs,
      interpolationDelayMs: stats.interpolationDelayMs,
      bytesIn: stats.bytesIn,
      bytesOut: stats.bytesOut,
      elapsedMs: this.elapsedMs,
    };
  }
}
