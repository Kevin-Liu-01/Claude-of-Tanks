/**
 * Remote-entity interpolation (charter §4 "Interpolation"): entities render
 * at `serverNow − delay`, where the delay adapts between two and four
 * snapshot intervals from the measured arrival jitter and recent loss.
 * Positions blend with Hermite curves from the rows' velocities (monotone on
 * the ground so a stale tangent never overshoots a contact), angles take the
 * shortest arc, extrapolation past the newest frame is capped at one
 * interval, and the render clock never runs backward. Every sample object is
 * reused so a 120 Hz render loop allocates nothing here.
 */
import { ENTITY_FLAGS, RELOAD_KIND_NAMES, dequantizeAngle, dequantizePosition, dequantizeReloadS,
  dequantizeShellVelocity, dequantizeVelocity, shellTypeName } from '../wire/index.ts';
import type { EntityRow, PhaseId, ShellRow, SnapshotFrame, VerdictId } from '../wire/index.ts';

/** One presented entity in SI units (metres, m/s, radians, seconds). */
export interface EntitySample {
  entityId: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  roll: number;
  turretYaw: number;
  gunPitch: number;
  hp: number;
  maxHp: number;
  reloadS: number;
  reloadTotalS: number;
  reloadKind: string;
  gunReloadS: number;
  gunReloadTotalS: number;
  gunReloadKind: string;
  magazineRounds: number;
  magazineCapacity: number;
  shellSlot: number;
  ammo0: number;
  ammo1: number;
  ammo2: number;
  flags: number;
  eraSpent: readonly number[];
  /** True when this sample was produced from a single frame (no pair to blend, or a discontinuity). */
  snapped: boolean;
}

export interface ShellSample {
  id: number;
  shooterEntityId: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  shellType: string;
  guided: boolean;
}

export interface FrameMetaSample {
  phase: PhaseId;
  countdownMs: number;
  battleTimeMs: number;
  verdict: VerdictId;
  verdictReason: string;
  destructibleRevision: number;
}

export interface FrameSample {
  /** Tick of the newer frame of the pair. */
  tick: number;
  /** The server time rendered. */
  renderTimeMs: number;
  entities: EntitySample[];
  shells: ShellSample[];
  meta: FrameMetaSample;
  modeStateJson: string | null;
  /** Milliseconds of extrapolation past the newest frame this sample used. */
  extrapolatedMs: number;
  /** The render time fell behind the buffer (an outage longer than it holds): every entity snapped. */
  resynced: boolean;
}

export interface InterpolatorOptions {
  snapshotIntervalMs?: number;
  minDelayIntervals?: number;
  maxDelayIntervals?: number;
  maxExtrapolationIntervals?: number;
  /** Frames kept (the delay never exceeds 4 intervals, so 16 is generous). */
  capacity?: number;
  /** Jitter estimator gains (faster attack than release). */
  jitterAttack?: number;
  jitterRelease?: number;
  /** Delay slew fractions of elapsed time (grow fast, recover latency slowly). */
  delayAttackFraction?: number;
  delayReleaseFraction?: number;
  /** A sequence gap younger than this adds one interval of delay. */
  lossMemoryMs?: number;
  /** A dry buffer holds the render clock for at most this long; a longer outage resyncs (jumps) instead. */
  maxStallMs?: number;
}

export interface InterpolatorStats {
  delayMs: number;
  targetDelayMs: number;
  arrivalJitterMs: number;
  samples: number;
  extrapolatedSamples: number;
  snappedSamples: number;
  bufferedFrames: number;
  maxExtrapolatedMs: number;
  /** Samples where the buffer ran dry and the render clock held at the extrapolation horizon. */
  stalledSamples: number;
  maxStallMs: number;
  /** Outages longer than the buffer: the timeline jumped forward once. */
  resyncs: number;
}

const TELEPORT_FLOOR_M = 8;
const TELEPORT_SPEED_MULTIPLIER = 3;
const MAX_SAMPLE_ELAPSED_MS = 250;
const CONTINUED_ANGLES = ['yaw', 'pitch', 'roll', 'turretYaw', 'gunPitch'] as const;

function shortestAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  else if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

export function lerpAngle(a: number, b: number, t: number): number {
  return a + shortestAngleDelta(a, b) * t;
}

export function hermite(p0: number, v0: number, p1: number, v1: number, t: number, durationS: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * durationS * v0 +
    (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * durationS * v1;
}

/** Hermite whose tangents never overshoot the two authoritative samples (contact-safe). */
export function monotoneHermite(p0: number, v0: number, p1: number, v1: number, t: number, durationS: number): number {
  if (!(durationS > 0)) return p1;
  const slope = (p1 - p0) / durationS;
  if (Math.abs(slope) < 1e-8) return p0;
  let m0 = v0 * slope > 0 ? v0 : 0;
  let m1 = v1 * slope > 0 ? v1 : 0;
  const alpha = m0 / slope;
  const beta = m1 / slope;
  const magnitude = alpha * alpha + beta * beta;
  if (magnitude > 9) {
    const scale = 3 / Math.sqrt(magnitude);
    m0 = scale * alpha * slope;
    m1 = scale * beta * slope;
  }
  return hermite(p0, m0, p1, m1, t, durationS);
}

export function createEntitySample(entityId = 0): EntitySample {
  return {
    entityId, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
    hp: 0, maxHp: 1, reloadS: 0, reloadTotalS: 0, reloadKind: 'ready', gunReloadS: 0, gunReloadTotalS: 0,
    gunReloadKind: 'ready', magazineRounds: 0, magazineCapacity: 0, shellSlot: 0, ammo0: 0, ammo1: 0, ammo2: 0,
    flags: 0, eraSpent: [], snapped: true,
  };
}

/** Dequantize one row into a sample (velocity from speed along yaw + vertical speed). */
export function decodeRow(row: EntityRow, out: EntitySample): EntitySample {
  out.entityId = row.entityId;
  out.x = dequantizePosition(row.x);
  out.y = dequantizePosition(row.y);
  out.z = dequantizePosition(row.z);
  const yaw = dequantizeAngle(row.yaw);
  const speed = dequantizeVelocity(row.speed);
  out.vx = Math.sin(yaw) * speed;
  out.vz = Math.cos(yaw) * speed;
  out.vy = dequantizeVelocity(row.verticalSpeed);
  out.yaw = yaw;
  out.pitch = dequantizeAngle(row.pitch);
  out.roll = dequantizeAngle(row.roll);
  out.turretYaw = dequantizeAngle(row.turretYaw);
  out.gunPitch = dequantizeAngle(row.gunPitch);
  out.hp = row.hp;
  out.maxHp = row.maxHp;
  out.reloadS = dequantizeReloadS(row.reload);
  out.reloadTotalS = dequantizeReloadS(row.reloadTotal);
  out.reloadKind = RELOAD_KIND_NAMES[row.reloadKind] ?? 'ready';
  out.gunReloadS = dequantizeReloadS(row.gunReload);
  out.gunReloadTotalS = dequantizeReloadS(row.gunReloadTotal);
  out.gunReloadKind = RELOAD_KIND_NAMES[row.gunReloadKind] ?? 'ready';
  out.magazineRounds = row.magazineRounds;
  out.magazineCapacity = row.magazineCapacity;
  out.shellSlot = row.shellSlot;
  out.ammo0 = row.ammo0;
  out.ammo1 = row.ammo1;
  out.ammo2 = row.ammo2;
  out.flags = row.flags;
  out.eraSpent = row.eraSpent;
  out.snapped = true;
  return out;
}

function decodeShell(row: ShellRow, out: ShellSample): ShellSample {
  out.id = row.id;
  out.shooterEntityId = row.shooterEntityId;
  out.x = dequantizePosition(row.x);
  out.y = dequantizePosition(row.y);
  out.z = dequantizePosition(row.z);
  out.vx = dequantizeShellVelocity(row.vx);
  out.vy = dequantizeShellVelocity(row.vy);
  out.vz = dequantizeShellVelocity(row.vz);
  out.shellType = shellTypeName(row.shellType);
  out.guided = (row.flags & 1) !== 0;
  return out;
}

/** Same life and no teleport between two rows: interpolation is meaningful. */
function continuousPose(previous: EntityRow, current: EntityRow, durationS: number): boolean {
  if ((previous.flags ^ current.flags) & ENTITY_FLAGS.DESTROYED) return false;
  const distanceM = Math.hypot(current.x - previous.x, current.y - previous.y, current.z - previous.z) / 1000;
  const speedMps = Math.max(
    Math.hypot(previous.speed, previous.verticalSpeed), Math.hypot(current.speed, current.verticalSpeed),
  ) / 100;
  return distanceM <= Math.max(TELEPORT_FLOOR_M, speedMps * Math.max(0, durationS) * TELEPORT_SPEED_MULTIPLIER);
}

interface BufferedFrame {
  frame: SnapshotFrame;
  serverTimeMs: number;
  rows: Map<number, EntityRow>;
}

export class RemoteInterpolator {
  readonly snapshotIntervalMs: number;
  readonly minDelayMs: number;
  readonly maxDelayMs: number;
  readonly maxExtrapolationMs: number;
  readonly capacity: number;
  readonly jitterAttack: number;
  readonly jitterRelease: number;
  readonly delayAttackFraction: number;
  readonly delayReleaseFraction: number;
  readonly lossMemoryMs: number;
  readonly maxStallMs: number;
  private readonly frames: BufferedFrame[] = [];
  private delayMs: number;
  private targetDelayMs: number;
  private arrivalJitterMs = 0;
  private lastArrivalMs: number | null = null;
  private lastArrivalServerMs: number | null = null;
  private lastLossServerMs = -Infinity;
  private lastSampleServerMs: number | null = null;
  private lastRenderTimeMs: number | null = null;
  private readonly samples = new Map<number, EntitySample>();
  private readonly scratchA = createEntitySample();
  private readonly scratchB = createEntitySample();
  private readonly shellSamples: ShellSample[] = [];
  private readonly olderShells = new Map<number, ShellRow>();
  private readonly present = new Set<number>();
  private readonly output: FrameSample;
  private sampleCount = 0;
  private extrapolatedSamples = 0;
  private snappedSamples = 0;
  private maxExtrapolatedMs = 0;
  private stalledSamples = 0;
  private maxObservedStallMs = 0;
  private resyncs = 0;

  constructor({
    snapshotIntervalMs = 1000 / 30,
    minDelayIntervals = 2,
    maxDelayIntervals = 4,
    maxExtrapolationIntervals = 1,
    capacity = 16,
    jitterAttack = 0.25,
    jitterRelease = 0.05,
    delayAttackFraction = 0.5,
    delayReleaseFraction = 0.1,
    lossMemoryMs = 2000,
    maxStallMs = 400,
  }: InterpolatorOptions = {}) {
    this.snapshotIntervalMs = snapshotIntervalMs;
    this.minDelayMs = minDelayIntervals * snapshotIntervalMs;
    this.maxDelayMs = maxDelayIntervals * snapshotIntervalMs;
    this.maxExtrapolationMs = maxExtrapolationIntervals * snapshotIntervalMs;
    this.capacity = capacity;
    this.jitterAttack = jitterAttack;
    this.jitterRelease = jitterRelease;
    this.delayAttackFraction = delayAttackFraction;
    this.delayReleaseFraction = delayReleaseFraction;
    this.lossMemoryMs = lossMemoryMs;
    this.maxStallMs = maxStallMs;
    this.delayMs = this.minDelayMs;
    this.targetDelayMs = this.minDelayMs;
    this.output = {
      tick: 0, renderTimeMs: 0, entities: [], shells: this.shellSamples,
      meta: { phase: 0, countdownMs: 0, battleTimeMs: 0, verdict: 0, verdictReason: '', destructibleRevision: 0 },
      modeStateJson: null, extrapolatedMs: 0, resynced: false,
    };
  }

  get delay(): number { return this.delayMs; }
  get bufferedFrames(): number { return this.frames.length; }
  get newest(): SnapshotFrame | null { return this.frames.length ? this.frames[this.frames.length - 1]!.frame : null; }

  /** A newly assembled frame; `serverTimeMs` is the unwrapped stamp, `receivedAtMs` the local clock. */
  push(frame: SnapshotFrame, serverTimeMs: number, receivedAtMs: number, lossObserved = false): boolean {
    const last = this.frames[this.frames.length - 1];
    if (last && (frame.tick <= last.frame.tick || serverTimeMs < last.serverTimeMs)) return false;
    this.frames.push({ frame, serverTimeMs, rows: new Map(frame.entities.map((row) => [row.entityId, row])) });
    if (this.frames.length > this.capacity) this.frames.shift();
    if (lossObserved) this.lastLossServerMs = serverTimeMs;
    this.observeArrival(serverTimeMs, receivedAtMs);
    return true;
  }

  private observeArrival(serverTimeMs: number, receivedAtMs: number): void {
    if (this.lastArrivalMs !== null && this.lastArrivalServerMs !== null && receivedAtMs >= this.lastArrivalMs) {
      const variation = Math.abs((receivedAtMs - this.lastArrivalMs) - (serverTimeMs - this.lastArrivalServerMs));
      const gain = variation > this.arrivalJitterMs ? this.jitterAttack : this.jitterRelease;
      this.arrivalJitterMs += (variation - this.arrivalJitterMs) * gain;
    }
    this.lastArrivalMs = receivedAtMs;
    this.lastArrivalServerMs = serverTimeMs;
    const lossBonus = serverTimeMs - this.lastLossServerMs <= this.lossMemoryMs ? this.snapshotIntervalMs : 0;
    this.targetDelayMs = Math.min(this.maxDelayMs,
      Math.max(this.minDelayMs, this.minDelayMs + 2 * this.arrivalJitterMs + lossBonus));
  }

  private advanceDelay(serverNowMs: number): void {
    if (this.lastSampleServerMs !== null) {
      const elapsedMs = Math.max(0, Math.min(MAX_SAMPLE_ELAPSED_MS, serverNowMs - this.lastSampleServerMs));
      const error = this.targetDelayMs - this.delayMs;
      if (error > 0) this.delayMs += Math.min(error, elapsedMs * this.delayAttackFraction);
      else if (error < 0) this.delayMs += Math.max(error, -elapsedMs * this.delayReleaseFraction);
    }
    this.lastSampleServerMs = serverNowMs;
  }

  private sampleFor(entityId: number): EntitySample {
    this.present.add(entityId);
    let sample = this.samples.get(entityId);
    if (!sample) {
      sample = createEntitySample(entityId);
      this.samples.set(entityId, sample);
    }
    return sample;
  }

  /** Render the world at `serverNowMs − delay`. Returns null before the first frame. */
  sample(serverNowMs: number): FrameSample | null {
    if (this.frames.length === 0) return null;
    this.sampleCount++;
    this.advanceDelay(serverNowMs);
    const desired = serverNowMs - this.delayMs;
    // A buffer that ran dry (a loss burst) holds the render clock at the
    // extrapolation horizon instead of freezing every entity and jumping when
    // the next frame lands; the extra delay this leaves then releases slowly.
    const horizon = this.frames[this.frames.length - 1]!.serverTimeMs + this.maxExtrapolationMs;
    let renderTime = Math.min(desired, horizon);
    if (this.lastRenderTimeMs !== null) renderTime = Math.max(renderTime, this.lastRenderTimeMs);
    let resynced = false;
    if (renderTime < desired - 1e-9) {
      this.stalledSamples++;
      this.maxObservedStallMs = Math.max(this.maxObservedStallMs, desired - renderTime);
      this.delayMs = serverNowMs - renderTime;
      // A stall past the budget is an outage: playing it back at 1.1× would take seconds.
      if (desired - renderTime > this.maxStallMs) resynced = true;
    }
    // An outage longer than the buffer holds: the held timeline is gone. A
    // render clock that leaps (the process itself was suspended) is one too.
    if (renderTime < this.frames[0]!.serverTimeMs) resynced = true;
    if (this.lastRenderTimeMs !== null && renderTime - this.lastRenderTimeMs > this.maxStallMs) resynced = true;
    if (resynced) {
      // The clock jumps once and every entity snaps (a teleport); the delay returns to its target.
      this.delayMs = Math.max(this.minDelayMs, Math.min(this.maxDelayMs, this.targetDelayMs));
      renderTime = Math.max(this.frames[0]!.serverTimeMs, Math.min(horizon, serverNowMs - this.delayMs));
      this.resyncs++;
    }
    this.lastRenderTimeMs = renderTime;

    let older = this.frames[0]!;
    let newer = this.frames[this.frames.length - 1]!;
    for (const buffered of this.frames) {
      if (buffered.serverTimeMs <= renderTime) older = buffered;
      if (buffered.serverTimeMs >= renderTime) { newer = buffered; break; }
    }
    const out = this.output;
    out.entities.length = 0;
    this.present.clear();
    let extrapolatedMs = 0;
    if (older === newer || newer.serverTimeMs <= older.serverTimeMs) {
      extrapolatedMs = Math.max(0, Math.min(this.maxExtrapolationMs, renderTime - newer.serverTimeMs));
      this.extrapolate(newer, extrapolatedMs, out.entities);
    } else {
      this.interpolate(older, newer, renderTime, out.entities);
    }
    for (const entityId of this.samples.keys()) {
      if (!this.present.has(entityId)) this.samples.delete(entityId);
    }
    out.tick = newer.frame.tick;
    out.renderTimeMs = renderTime;
    out.extrapolatedMs = extrapolatedMs;
    out.resynced = resynced;
    if (resynced) for (const entity of out.entities) entity.snapped = true;
    if (extrapolatedMs > 0) {
      this.extrapolatedSamples++;
      this.maxExtrapolatedMs = Math.max(this.maxExtrapolatedMs, extrapolatedMs);
    }
    this.sampleShells(older, newer, renderTime, extrapolatedMs);
    this.sampleMeta(older, newer, renderTime, extrapolatedMs);
    out.modeStateJson = newer.frame.modeStateJson;
    return out;
  }

  private interpolate(older: BufferedFrame, newer: BufferedFrame, renderTime: number, entities: EntitySample[]): void {
    const durationMs = newer.serverTimeMs - older.serverTimeMs;
    const durationS = durationMs / 1000;
    const t = Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / durationMs));
    for (const row of newer.frame.entities) {
      const previous = older.rows.get(row.entityId);
      const out = this.sampleFor(row.entityId);
      if (!previous || !continuousPose(previous, row, durationS)) {
        decodeRow(row, out);
        this.snappedSamples++;
        entities.push(out);
        continue;
      }
      const a = decodeRow(previous, this.scratchA);
      const b = decodeRow(row, this.scratchB);
      decodeRow(row, out);
      const grounded = !(a.flags & ENTITY_FLAGS.AIRBORNE) && !(b.flags & ENTITY_FLAGS.AIRBORNE);
      out.x = monotoneHermite(a.x, a.vx, b.x, b.vx, t, durationS);
      out.y = grounded ? monotoneHermite(a.y, a.vy, b.y, b.vy, t, durationS) : hermite(a.y, a.vy, b.y, b.vy, t, durationS);
      out.z = monotoneHermite(a.z, a.vz, b.z, b.vz, t, durationS);
      out.vx = a.vx + (b.vx - a.vx) * t;
      out.vy = a.vy + (b.vy - a.vy) * t;
      out.vz = a.vz + (b.vz - a.vz) * t;
      out.yaw = lerpAngle(a.yaw, b.yaw, t);
      out.pitch = lerpAngle(a.pitch, b.pitch, t);
      out.roll = lerpAngle(a.roll, b.roll, t);
      out.turretYaw = lerpAngle(a.turretYaw, b.turretYaw, t);
      out.gunPitch = lerpAngle(a.gunPitch, b.gunPitch, t);
      out.reloadS = a.reloadS + (b.reloadS - a.reloadS) * t;
      out.gunReloadS = a.gunReloadS + (b.gunReloadS - a.gunReloadS) * t;
      out.snapped = false;
      entities.push(out);
    }
  }

  private extrapolate(newest: BufferedFrame, extraMs: number, entities: EntitySample[]): void {
    const index = this.frames.indexOf(newest);
    const previous = index > 0 ? this.frames[index - 1]! : null;
    const durationS = previous ? (newest.serverTimeMs - previous.serverTimeMs) / 1000 : 0;
    const extraS = extraMs / 1000;
    for (const row of newest.frame.entities) {
      const out = decodeRow(row, this.sampleFor(row.entityId));
      entities.push(out);
      const previousRow = previous?.rows.get(row.entityId);
      const continuous = !!previousRow && durationS > 0 && continuousPose(previousRow, row, durationS);
      out.snapped = !continuous;
      if (extraS <= 0) { if (!continuous) this.snappedSamples++; continue; }
      if (row.flags & ENTITY_FLAGS.DESTROYED) { out.vx = out.vy = out.vz = 0; continue; }
      out.x += out.vx * extraS;
      out.z += out.vz * extraS;
      // A grounded chassis follows its support: continue the height only along the observed secant.
      if (row.flags & ENTITY_FLAGS.AIRBORNE) out.y += out.vy * extraS;
      else if (continuous && previousRow) {
        const slope = (row.y - previousRow.y) / 1000 / durationS;
        const vy = slope * out.vy > 0 ? Math.sign(slope) * Math.min(Math.abs(out.vy), 3 * Math.abs(slope)) : 0;
        out.vy = vy;
        out.y += vy * extraS;
      } else out.vy = 0;
      out.reloadS = Math.max(0, out.reloadS - extraS);
      out.gunReloadS = Math.max(0, out.gunReloadS - extraS);
      // Continue the last short-arc angular motion for at most one observed interval.
      if (continuous && previousRow && !(row.flags & (ENTITY_FLAGS.OVERTURNED | ENTITY_FLAGS.AUTO_RIGHTING)) &&
          !((previousRow.flags ^ row.flags) & (ENTITY_FLAGS.AIRBORNE | ENTITY_FLAGS.OVERTURNED | ENTITY_FLAGS.AUTO_RIGHTING))) {
        const fraction = Math.min(1, extraS / durationS);
        const a = decodeRow(previousRow, this.scratchA);
        for (const key of CONTINUED_ANGLES) out[key] += shortestAngleDelta(a[key], out[key]) * fraction;
      }
    }
  }

  private sampleShells(older: BufferedFrame, newer: BufferedFrame, renderTime: number, extraMs: number): void {
    const interpolating = older !== newer && newer.serverTimeMs > older.serverTimeMs;
    const durationS = interpolating ? (newer.serverTimeMs - older.serverTimeMs) / 1000 : 0;
    const t = interpolating ? Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / (durationS * 1000))) : 1;
    const extraS = extraMs / 1000;
    this.olderShells.clear();
    if (interpolating) for (const shell of older.frame.shells) this.olderShells.set(shell.id, shell);
    let count = 0;
    for (const shell of newer.frame.shells) {
      let target = this.shellSamples[count];
      if (!target) {
        target = { id: 0, shooterEntityId: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, shellType: 'OTHER', guided: false };
        this.shellSamples[count] = target;
      }
      decodeShell(shell, target);
      const previous = interpolating ? this.olderShells.get(shell.id) : undefined;
      if (previous && previous.shooterEntityId === shell.shooterEntityId && previous.shellType === shell.shellType) {
        const a = decodeShell(previous, this.scratchShell);
        target.x = hermite(a.x, a.vx, target.x, target.vx, t, durationS);
        target.y = hermite(a.y, a.vy, target.y, target.vy, t, durationS);
        target.z = hermite(a.z, a.vz, target.z, target.vz, t, durationS);
        target.vx = a.vx + (target.vx - a.vx) * t;
        target.vy = a.vy + (target.vy - a.vy) * t;
        target.vz = a.vz + (target.vz - a.vz) * t;
      } else if (extraS > 0) {
        target.x += target.vx * extraS;
        target.y += target.vy * extraS;
        target.z += target.vz * extraS;
      }
      count++;
    }
    this.shellSamples.length = count;
  }

  private readonly scratchShell: ShellSample = {
    id: 0, shooterEntityId: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, shellType: 'OTHER', guided: false,
  };

  private sampleMeta(older: BufferedFrame, newer: BufferedFrame, renderTime: number, extraMs: number): void {
    const meta = this.output.meta;
    const current = newer.frame.meta;
    meta.phase = current.phase;
    meta.verdict = current.verdict;
    meta.verdictReason = current.verdictReason;
    meta.destructibleRevision = current.destructibleRevision;
    meta.countdownMs = current.countdownMs;
    meta.battleTimeMs = current.battleTimeMs;
    const previous = older.frame.meta;
    if (older !== newer && newer.serverTimeMs > older.serverTimeMs && previous.phase === current.phase) {
      const t = Math.max(0, Math.min(1, (renderTime - older.serverTimeMs) / (newer.serverTimeMs - older.serverTimeMs)));
      meta.countdownMs = previous.countdownMs + (current.countdownMs - previous.countdownMs) * t;
      meta.battleTimeMs = previous.battleTimeMs + (current.battleTimeMs - previous.battleTimeMs) * t;
    } else if (extraMs > 0) {
      // PHASE.COUNTDOWN = 1 counts down; PHASE.PLAYING = 2 counts up.
      if (current.phase === 1) meta.countdownMs = Math.max(0, current.countdownMs - extraMs);
      if (current.phase === 2) meta.battleTimeMs = current.battleTimeMs + extraMs;
    }
  }

  /** A reconnect or a new round: forget the timeline (the render clock may then move backward once). */
  clear(): void {
    this.frames.length = 0;
    this.samples.clear();
    this.present.clear();
    this.shellSamples.length = 0;
    this.lastArrivalMs = null;
    this.lastArrivalServerMs = null;
    this.lastSampleServerMs = null;
    this.lastRenderTimeMs = null;
    this.lastLossServerMs = -Infinity;
    this.arrivalJitterMs = 0;
    this.delayMs = this.minDelayMs;
    this.targetDelayMs = this.minDelayMs;
  }

  stats(): InterpolatorStats {
    return {
      delayMs: this.delayMs,
      targetDelayMs: this.targetDelayMs,
      arrivalJitterMs: this.arrivalJitterMs,
      samples: this.sampleCount,
      extrapolatedSamples: this.extrapolatedSamples,
      snappedSamples: this.snappedSamples,
      bufferedFrames: this.frames.length,
      maxExtrapolatedMs: this.maxExtrapolatedMs,
      stalledSamples: this.stalledSamples,
      maxStallMs: this.maxObservedStallMs,
      resyncs: this.resyncs,
    };
  }
}
