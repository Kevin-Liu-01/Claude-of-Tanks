/**
 * Server clock estimation (charter §4 "Clock"). PING/PONG round trips give
 * (rtt, offset) samples; the offset target is the median of the last 16
 * samples after outlier rejection, and the active offset slews toward it at
 * no more than 50 ms per second so a late pong can never move the
 * presentation timeline by a visible fraction of a metre in one frame. The
 * tick clock maps server time to simulation ticks from the (tick, serverTime)
 * pairs every snapshot carries. No wall-clock time reaches the simulation.
 */

export interface ClockSample {
  rttMs: number;
  offsetMs: number;
  atMs: number;
}

export interface ServerClockOptions {
  /** Samples kept for the filtered offset. */
  sampleWindow?: number;
  /** Slew rate of the active offset toward its target. */
  slewMsPerS?: number;
  /** Elapsed time counted for one slew step (a suspended tab does not earn a huge step). */
  maxSlewWindowMs?: number;
  /** An offset error above this snaps instead of slewing (a tab that slept for seconds). */
  hardResyncMs?: number;
  /** RTT low-pass and jitter estimator gain. */
  rttAlpha?: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = sorted.length >> 1;
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Offset target from the sample window: samples in the slower half of the RTTs
 * are rejected (asymmetric paths), then offsets more than three median
 * absolute deviations from the median are rejected; the target is the median
 * of the survivors.
 */
export function filteredOffsetMs(samples: readonly ClockSample[]): number {
  if (samples.length === 0) return 0;
  const byRtt = samples.slice().sort((a, b) => a.rttMs - b.rttMs);
  const best = byRtt.slice(0, Math.max(1, Math.ceil(byRtt.length / 2)));
  const offsets = best.map((sample) => sample.offsetMs);
  const center = median(offsets);
  const mad = median(offsets.map((offset) => Math.abs(offset - center)));
  const kept = offsets.filter((offset) => Math.abs(offset - center) <= Math.max(3 * mad, 1));
  return median(kept.length ? kept : offsets);
}

export class ServerClock {
  readonly sampleWindow: number;
  readonly slewMsPerS: number;
  readonly maxSlewWindowMs: number;
  readonly hardResyncMs: number;
  readonly rttAlpha: number;
  private readonly samples: ClockSample[] = [];
  private offsetMs = 0;
  private targetOffsetMs = 0;
  private seeded = false;
  private lastAdvanceMs: number | null = null;
  private lastRttMs: number | null = null;
  private smoothedRttMs: number | null = null;
  private jitterMs = 0;
  private resyncs = 0;

  constructor({
    sampleWindow = 16,
    slewMsPerS = 50,
    maxSlewWindowMs = 250,
    hardResyncMs = 2000,
    rttAlpha = 0.2,
  }: ServerClockOptions = {}) {
    this.sampleWindow = sampleWindow;
    this.slewMsPerS = slewMsPerS;
    this.maxSlewWindowMs = maxSlewWindowMs;
    this.hardResyncMs = hardResyncMs;
    this.rttAlpha = rttAlpha;
  }

  get isSeeded(): boolean { return this.seeded; }
  get sampleCount(): number { return this.samples.length; }
  /** Active offset: serverTime = localTime + offset. */
  get offset(): number { return this.offsetMs; }
  get target(): number { return this.targetOffsetMs; }
  get rttMs(): number | null { return this.smoothedRttMs; }
  get rttJitterMs(): number { return this.jitterMs; }
  get hardResyncs(): number { return this.resyncs; }

  /** WELCOME: one-way biased, corrected by the first pongs. */
  seed(serverTimeMs: number, localNowMs: number): void {
    this.offsetMs = serverTimeMs - localNowMs;
    this.targetOffsetMs = this.offsetMs;
    this.seeded = true;
    this.lastAdvanceMs = localNowMs;
  }

  /** A PONG for the PING sent at `sentMs`, received at `nowMs`, stamped `serverTimeMs`. */
  observePong(sentMs: number, nowMs: number, serverTimeMs: number): ClockSample | null {
    if (!Number.isFinite(sentMs) || !Number.isFinite(nowMs) || !Number.isFinite(serverTimeMs) || nowMs < sentMs) return null;
    const rttMs = nowMs - sentMs;
    const sample: ClockSample = { rttMs, offsetMs: serverTimeMs - (sentMs + nowMs) / 2, atMs: nowMs };
    this.samples.push(sample);
    if (this.samples.length > this.sampleWindow) this.samples.shift();
    if (this.lastRttMs !== null) {
      const variation = Math.abs(rttMs - this.lastRttMs);
      this.jitterMs += (variation - this.jitterMs) * this.rttAlpha;
    }
    this.lastRttMs = rttMs;
    this.smoothedRttMs = this.smoothedRttMs === null ? rttMs : this.smoothedRttMs + (rttMs - this.smoothedRttMs) * this.rttAlpha;
    this.targetOffsetMs = filteredOffsetMs(this.samples);
    if (!this.seeded) {
      this.offsetMs = this.targetOffsetMs;
      this.seeded = true;
      this.lastAdvanceMs = nowMs;
    }
    return sample;
  }

  /** Slew the active offset toward the target on the display clock. */
  advance(nowMs: number): void {
    if (!this.seeded) return;
    if (this.lastAdvanceMs !== null && nowMs > this.lastAdvanceMs) {
      const error = this.targetOffsetMs - this.offsetMs;
      if (Math.abs(error) > this.hardResyncMs) {
        this.offsetMs = this.targetOffsetMs;
        this.resyncs++;
      } else {
        const elapsedMs = Math.min(this.maxSlewWindowMs, nowMs - this.lastAdvanceMs);
        const maxStep = elapsedMs * this.slewMsPerS / 1000;
        this.offsetMs += Math.max(-maxStep, Math.min(maxStep, error));
      }
    }
    this.lastAdvanceMs = Math.max(this.lastAdvanceMs ?? nowMs, nowMs);
  }

  serverNow(nowMs: number): number { return nowMs + this.offsetMs; }

  reset(): void {
    this.samples.length = 0;
    this.offsetMs = 0;
    this.targetOffsetMs = 0;
    this.seeded = false;
    this.lastAdvanceMs = null;
    this.lastRttMs = null;
    this.smoothedRttMs = null;
    this.jitterMs = 0;
  }
}

/** Maps server time to simulation ticks from the latest (tick, serverTime) pair. */
export class TickClock {
  readonly tickMs: number;
  private anchorTick = 0;
  private anchorTimeMs = 0;
  private anchored = false;

  constructor(tickHz: number) {
    if (!(tickHz > 0)) throw new TypeError('tickHz must be positive');
    this.tickMs = 1000 / tickHz;
  }

  get isAnchored(): boolean { return this.anchored; }

  /** Adopt a newer (tick, serverTime) pair; older ticks are ignored. */
  observe(tick: number, serverTimeMs: number): void {
    if (this.anchored && tick <= this.anchorTick) return;
    this.anchorTick = tick;
    this.anchorTimeMs = serverTimeMs;
    this.anchored = true;
  }

  /** Fractional server tick at a server time. */
  tickAt(serverTimeMs: number): number {
    return this.anchorTick + (serverTimeMs - this.anchorTimeMs) / this.tickMs;
  }

  serverTimeAtTick(tick: number): number {
    return this.anchorTimeMs + (tick - this.anchorTick) * this.tickMs;
  }

  reset(): void { this.anchored = false; }
}

/** Turns the wire's u32 millisecond stamps back into a monotone timeline. */
export class TimeUnwrapper {
  private epochMs = 0;
  private last: number | null = null;

  unwrap(u32Ms: number): number {
    if (this.last !== null && u32Ms < this.last && this.last - u32Ms > 0x80000000) this.epochMs += 0x100000000;
    this.last = u32Ms;
    return this.epochMs + u32Ms;
  }

  reset(): void { this.epochMs = 0; this.last = null; }
}
