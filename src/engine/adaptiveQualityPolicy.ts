import { overloadReliefLever } from './renderScalePolicy.ts';

/** Sample real cadence, not simulation's bounded delta; warm renders stay inert. */
export function adaptiveFrameSeconds(presentationSeconds: number, wallSeconds = presentationSeconds): number {
  if (!Number.isFinite(presentationSeconds) || presentationSeconds <= 0
    || !Number.isFinite(wallSeconds) || wallSeconds <= 0 || wallSeconds > .25) return 0;
  return wallSeconds;
}

export type AdaptiveQualityAction =
  | 'none'
  | 'trim-down'
  | 'resolution-down'
  | 'tier-down'
  | 'resolution-up'
  | 'trim-up'
  | 'tier-up';

interface AdaptiveQualityWindow {
  readonly clockSeconds: number;
  readonly frameEmaMs: number;
  readonly frameBudgetMs: number;
  readonly missedFrameRatio: number;
  readonly achievedFps: number;
  readonly dynamicScaleFloor: number;
  readonly maximumTrim: number;
  readonly mayRaiseTier: boolean;
  /**
   * 2026-10-02 (the frame-budget lane): the median GPU time of the window's sampled frames (gpuFrameTimer.ts), or
   * null/absent where the timer extension is unavailable — the policy then decides on the frame cadence alone.
   */
  readonly gpuFrameMs?: number | null;
}

const RESOLUTION_STEP = 0.09;
const DOWN_LEVEL = 1.08;
const UP_LEVEL = 1.06;
const DOWN_MISS_MINIMUM = 0.15;
const UP_MISS_MAXIMUM = 0.04;
const FPS_DECLINE_FACTOR = 0.80;
const FPS_BASELINE_MINIMUM = 24;
const FPS_SMOOTH_CEILING = 118;
const TRIM_DOWN_STRIKES = 2;
const TIER_DOWN_STRIKES = 4;
const TIER_DOWN_WARMUP_SECONDS = 8;
const TIER_UP_STABLE_SECONDS = 45;
const TIER_UP_STRIKES = 4;
const RESOLUTION_UP_BACKOFF_SECONDS = 1.5;
const RESOLUTION_FLAP_SECONDS = 8;
const RESOLUTION_BACKOFF_MAX_SECONDS = 20;
const RESOLUTION_BACKOFF_RESET_SECONDS = 60;
const TRIM_UP_MISS_MAXIMUM = 0.10;
const TRIM_UP_BACKOFF_SECONDS = 15;
const TRIM_FLAP_SECONDS = RESOLUTION_FLAP_SECONDS * 2;
const TRIM_BACKOFF_MAX_SECONDS = 90;
/**
 * GPU-informed resolution (2026-10-02, the frame-budget lane). Under vsync a healthy 60 Hz cadence hides the headroom,
 * so a cadence-only governor can only probe upward and step back (the anti-flap backoff bounds that to one probe per
 * 20 s, each a second and a half of missed frames). With the frame's measured GPU time the policy predicts instead:
 * the cost of the raster scales at most with the pixel count, so the next step up costs at most gpu × (next / now)²
 * — an up-step is taken only when that fits GPU_UP_HEADROOM of the budget. An overload with the GPU well inside the
 * budget (under GPU_BOUND_SHARE of it) is the main thread's: resolution would cost picture and buy nothing, so the
 * policy goes to the tier lever. A GPU-bound cut aims the predicted GPU time at GPU_DOWN_TARGET of the budget, at
 * most MAX_RESOLUTION_STEPS_PER_CUT steps at once.
 */
export const GPU_UP_HEADROOM = 0.85;
export const GPU_BOUND_SHARE = 0.75;
export const GPU_DOWN_TARGET = 0.9;
export const MAX_RESOLUTION_STEPS_PER_CUT = 2;
/**
 * A sample longer than the frames it was taken in is not the frame's GPU occupancy: a timer may report the span from
 * the frame's first command to its last including other work (ANGLE's Metal backend on a shared GPU read 20–55 ms
 * against a 16.7 ms cadence in the 2026-10-02 probes), and in steady state a frame's GPU work cannot outlast the
 * interval between presented frames. A sample beyond GPU_TRUST_SHARE of the frame cadence is set aside: that window
 * decides on the cadence alone, so a pessimistic timer can never hold the scale down.
 */
export const GPU_TRUST_SHARE = 1.2;
const knownGpu = (window: AdaptiveQualityWindow): number | null => {
  const gpu = window.gpuFrameMs;
  if (typeof gpu !== 'number' || !Number.isFinite(gpu) || gpu <= 0) return null;
  return gpu <= window.frameEmaMs * GPU_TRUST_SHARE ? gpu : null;
};

interface LoadClassification {
  readonly overloaded: boolean;
  readonly fpsDeclined: boolean;
  readonly clean: boolean;
}

function classifyLoad(
  window: AdaptiveQualityWindow,
  baselineFps: number,
): LoadClassification {
  const overBudget = window.frameEmaMs > window.frameBudgetMs * DOWN_LEVEL
    && window.missedFrameRatio > DOWN_MISS_MINIMUM;
  const fpsDeclined = baselineFps >= FPS_BASELINE_MINIMUM
    && window.achievedFps < baselineFps * FPS_DECLINE_FACTOR
    && window.achievedFps < FPS_SMOOTH_CEILING;
  return {
    overloaded: overBudget || fpsDeclined,
    fpsDeclined,
    clean: window.frameEmaMs < window.frameBudgetMs * UP_LEVEL
      && window.missedFrameRatio < UP_MISS_MAXIMUM,
  };
}

function nextBaselineFps(
  current: number,
  achieved: number,
  load: LoadClassification,
): number {
  if (load.fpsDeclined) return current + (achieved - current) * 0.15;
  if (load.overloaded) return current;
  if (current === 0) return achieved;
  // When achieved === current the
  // delta is zero, so either learning rate produces the identical baseline.
  const learningRate = achieved > current ? 0.3 : 0.05;
  return current + (achieved - current) * learningRate;
}

/**
 * Pure-policy owner for the adaptive graphics relief ladder.
 *
 * Frame sampling and WebGL side effects remain in post.ts. This module sees
 * one aggregated evidence window at a time and owns the ordered decision:
 * expensive shading trim -> resolution -> automatic preset tier. Recovery
 * reverses that order so structural image detail returns before GTAO.
 */
export class AdaptiveQualityPolicy {
  private scale: number;
  private trim = 0;
  private baselineFps = 0;
  private trimDownStrikes = 0;
  private tierDownStrikes = 0;
  private tierUpStrikes = 0;
  private resolutionUpBackoffSeconds = RESOLUTION_UP_BACKOFF_SECONDS;
  private trimUpBackoffSeconds = TRIM_UP_BACKOFF_SECONDS;
  private lastScaleChangeAt = 0;
  private lastResolutionUpAt = Number.NEGATIVE_INFINITY;
  private lastResolutionDownAt = Number.NEGATIVE_INFINITY;
  private lastTrimUpAt = Number.NEGATIVE_INFINITY;
  private lastTrimDownAt = Number.NEGATIVE_INFINITY;
  private resetAt = 0;

  constructor(initialDynamicScale: number) {
    this.scale = initialDynamicScale;
  }

  get dynamicScale(): number { return this.scale; }
  get performanceTrim(): number { return this.trim; }
  get learnedBaselineFps(): number { return this.baselineFps; }

  reset(initialDynamicScale: number, clockSeconds: number): void {
    this.scale = initialDynamicScale;
    this.trim = 0;
    this.baselineFps = 0;
    this.trimDownStrikes = 0;
    this.tierDownStrikes = 0;
    this.tierUpStrikes = 0;
    this.resolutionUpBackoffSeconds = RESOLUTION_UP_BACKOFF_SECONDS;
    this.trimUpBackoffSeconds = TRIM_UP_BACKOFF_SECONDS;
    this.lastScaleChangeAt = clockSeconds;
    this.lastResolutionUpAt = Number.NEGATIVE_INFINITY;
    this.lastResolutionDownAt = Number.NEGATIVE_INFINITY;
    this.lastTrimUpAt = Number.NEGATIVE_INFINITY;
    this.lastTrimDownAt = Number.NEGATIVE_INFINITY;
    this.resetAt = clockSeconds;
  }

  setDynamicScale(next: number): boolean {
    if (next === this.scale) return false;
    this.scale = next;
    return true;
  }

  /** Sizing may raise the legal floor without starting a new workload. */
  reconcileDynamicScaleFloor(floor: number): boolean {
    // Keep the already-clamped raster and its observable policy in agreement.
    // This is not a recovery decision: retain every trim/load/backoff record.
    return this.setDynamicScale(Math.max(floor, this.scale));
  }

  forceTrim(next: number, maximumTrim: number): boolean {
    const clamped = Math.max(0, Math.min(maximumTrim, next));
    if (clamped === this.trim) return false;
    this.trim = clamped;
    return true;
  }

  resetTrims(): boolean {
    const changed = this.trim !== 0;
    this.trim = 0;
    this.trimDownStrikes = 0;
    this.trimUpBackoffSeconds = TRIM_UP_BACKOFF_SECONDS;
    return changed;
  }

  evaluate(window: AdaptiveQualityWindow): AdaptiveQualityAction {
    this.resetResolutionBackoffAfterStableMinute(window.clockSeconds);
    const load = classifyLoad(window, this.baselineFps);
    this.baselineFps = nextBaselineFps(
      this.baselineFps,
      window.achievedFps,
      load,
    );
    if (load.overloaded) return this.applyRelief(window);
    this.trimDownStrikes = 0;
    this.tierDownStrikes = 0;
    return this.applyRecovery(window, load.clean);
  }

  private resetResolutionBackoffAfterStableMinute(clockSeconds: number): void {
    // When
    // the backoff equals its base, assigning the base again is a no-op.
    const elevated = this.resolutionUpBackoffSeconds > RESOLUTION_UP_BACKOFF_SECONDS;
    // At exactly 60 s every legal
    // backoff (max 20 s) has already elapsed, so > versus >= is equivalent.
    const stable = clockSeconds - this.lastResolutionDownAt > RESOLUTION_BACKOFF_RESET_SECONDS;
    if (elevated && stable) this.resolutionUpBackoffSeconds = RESOLUTION_UP_BACKOFF_SECONDS;
  }

  private applyRelief(window: AdaptiveQualityWindow): AdaptiveQualityAction {
    this.tierUpStrikes = 0;
    const lever = overloadReliefLever(
      this.trim,
      window.maximumTrim,
      this.scale,
      window.dynamicScaleFloor,
    );
    if (lever === 'trim') return this.applyTrimRelief(window);
    if (lever === 'resolution') {
      const gpu = knownGpu(window);
      // a main-thread overload: fewer pixels would not shorten the frame
      if (gpu !== null && gpu < window.frameBudgetMs * GPU_BOUND_SHARE) return this.applyTierRelief(window.clockSeconds);
      return this.applyResolutionRelief(window);
    }
    return this.applyTierRelief(window.clockSeconds);
  }

  private applyTrimRelief(window: AdaptiveQualityWindow): AdaptiveQualityAction {
    this.trimDownStrikes++;
    if (this.trimDownStrikes < TRIM_DOWN_STRIKES) return 'none';
    this.trimDownStrikes = 0;
    this.trim = Math.min(window.maximumTrim, this.trim + 1);
    if (window.clockSeconds - this.lastTrimUpAt < TRIM_FLAP_SECONDS) {
      this.trimUpBackoffSeconds = Math.min(
        this.trimUpBackoffSeconds * 2,
        TRIM_BACKOFF_MAX_SECONDS,
      );
    }
    this.lastTrimDownAt = window.clockSeconds;
    return 'trim-down';
  }

  private applyResolutionRelief(window: AdaptiveQualityWindow): AdaptiveQualityAction {
    let steps = 1;
    const gpu = knownGpu(window);
    if (gpu !== null && gpu > window.frameBudgetMs) {
      // the scale whose predicted GPU time (pixel-proportional) lands at the target share of the budget
      const target = this.scale * Math.sqrt((GPU_DOWN_TARGET * window.frameBudgetMs) / gpu);
      steps = Math.max(1, Math.min(MAX_RESOLUTION_STEPS_PER_CUT, Math.ceil((this.scale - target) / RESOLUTION_STEP - 1e-9)));
    }
    this.scale = Math.max(window.dynamicScaleFloor, this.scale - RESOLUTION_STEP * steps);
    if (window.clockSeconds - this.lastResolutionUpAt < RESOLUTION_FLAP_SECONDS) {
      this.resolutionUpBackoffSeconds = Math.min(
        this.resolutionUpBackoffSeconds * 2,
        RESOLUTION_BACKOFF_MAX_SECONDS,
      );
    }
    this.lastResolutionDownAt = window.clockSeconds;
    this.lastScaleChangeAt = window.clockSeconds;
    return 'resolution-down';
  }

  private applyTierRelief(clockSeconds: number): AdaptiveQualityAction {
    if (clockSeconds <= TIER_DOWN_WARMUP_SECONDS) return 'none';
    this.tierDownStrikes++;
    if (this.tierDownStrikes < TIER_DOWN_STRIKES) return 'none';
    this.tierDownStrikes = 0;
    return 'tier-down';
  }

  private applyRecovery(
    window: AdaptiveQualityWindow,
    clean: boolean,
  ): AdaptiveQualityAction {
    if (clean && this.canRestoreResolution(window.clockSeconds) && this.gpuFitsStepUp(window)) {
      this.tierUpStrikes = 0;
      this.scale = Math.min(1, this.scale + RESOLUTION_STEP);
      this.lastResolutionUpAt = window.clockSeconds;
      this.lastScaleChangeAt = window.clockSeconds;
      return 'resolution-up';
    }
    if (this.canRestoreTrim(window)) {
      this.tierUpStrikes = 0;
      this.trim--;
      this.lastTrimUpAt = window.clockSeconds;
      return 'trim-up';
    }
    return this.applyTierRecovery(window, clean);
  }

  private applyTierRecovery(
    window: AdaptiveQualityWindow,
    clean: boolean,
  ): AdaptiveQualityAction {
    const stableLongEnough = window.clockSeconds - this.resetAt >= TIER_UP_STABLE_SECONDS;
    if (!window.mayRaiseTier || !clean || this.scale < 1 || this.trim > 0 || !stableLongEnough) {
      this.tierUpStrikes = 0;
      return 'none';
    }
    this.tierUpStrikes++;
    if (this.tierUpStrikes < TIER_UP_STRIKES) return 'none';
    this.tierUpStrikes = 0;
    return 'tier-up';
  }

  /** Without a GPU measurement the cadence rule alone decides; with one, the next step must fit the headroom. */
  private gpuFitsStepUp(window: AdaptiveQualityWindow): boolean {
    const gpu = knownGpu(window);
    if (gpu === null || !(this.scale > 0)) return true;
    const next = Math.min(1, this.scale + RESOLUTION_STEP);
    return gpu * (next / this.scale) ** 2 <= window.frameBudgetMs * GPU_UP_HEADROOM;
  }

  private canRestoreResolution(clockSeconds: number): boolean {
    return this.scale < 1
      && clockSeconds - this.lastScaleChangeAt >= this.resolutionUpBackoffSeconds;
  }

  private canRestoreTrim(window: AdaptiveQualityWindow): boolean {
    return this.trim > 0
      && window.frameEmaMs < window.frameBudgetMs * UP_LEVEL
      && window.missedFrameRatio < TRIM_UP_MISS_MAXIMUM
      && window.clockSeconds - this.lastTrimDownAt >= this.trimUpBackoffSeconds
      && window.clockSeconds - this.lastTrimUpAt >= this.trimUpBackoffSeconds;
  }
}
