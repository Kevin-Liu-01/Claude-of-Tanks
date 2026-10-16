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
  /**
   * 2026-10-13 (the perf stream): the rung the raster holds at under load (renderScalePolicy.dynamicScaleHold; the
   * floor itself where the preset declares none). A cut from above lands on it in one step; the raster goes below it
   * only after HOLD_DOWN_STRIKES consecutive overloaded windows, and recovers to it before it recovers past it.
   */
  readonly dynamicScaleHold?: number;
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
/** Consecutive overloaded windows at the hold rung (~6 s at the 1.5 s decision interval) before the raster goes below. */
export const HOLD_DOWN_STRIKES = 4;
/**
 * 2026-10-15 (the perf lane; owner: Auto fell High -> Low under load and still ran ~26 fps). A preset tier is the
 * picture's biggest lever, so it moves only when the frame really cannot keep up and only while the cut is shown to
 * buy frames:
 *  - KEEP-UP: a window counts toward a tier cut only when it is overloaded AND its achieved rate is under
 *    TIER_KEEP_UP_SHARE of the presented rate (min(60 Hz, the display's cadence)): 45 fps on a 60 Hz screen. A machine
 *    that delivers 50 fps on High keeps High (the trim and the resolution ladder still act there).
 *  - SUSTAINED: TIER_DOWN_STRIKES consecutive such windows (12 s at the 1.5 s decision interval) since the last
 *    workload reset, so a killcam beat, a burst of smoke or a background hitch never costs a tier.
 *  - PROVEN: a cut opens a trial (beginTierTrial). After TIER_TRIAL_SKIP_WINDOWS settling windows (the new tier's
 *    resize and links), the median of TIER_TRIAL_WINDOWS windows must beat the cut's evidence (the median of its strike
 *    windows) by TIER_MIN_GAIN; otherwise the cut bought nothing (the main thread, or another process, owns the frame:
 *    the 10-12 baseline saw Low at 22-34 fps where High made 23-35) and the policy restores the tier at once
 *    ('tier-up') and bars tier cuts for TIER_RETRY_SECONDS, doubling up to TIER_RETRY_MAX_SECONDS per failed trial.
 */
const TIER_DOWN_STRIKES = 8;
export const TIER_KEEP_UP_SHARE = 0.75;
const TIER_PRESENTED_RATE_CAP = 60;
export const TIER_TRIAL_SKIP_WINDOWS = 1;
export const TIER_TRIAL_WINDOWS = 5;
export const TIER_MIN_GAIN = 0.15;
export const TIER_RETRY_SECONDS = 180;
const TIER_RETRY_MAX_SECONDS = 900;
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
const RUNG_EPSILON = 1e-6;
/** The hold rung, never below the floor nor above the full raster; the floor itself without a declared hold. */
const holdRung = (window: AdaptiveQualityWindow): number => {
  const hold = window.dynamicScaleHold;
  if (typeof hold !== 'number' || !Number.isFinite(hold)) return window.dynamicScaleFloor;
  return Math.min(1, Math.max(window.dynamicScaleFloor, hold));
};
const knownGpu = (window: AdaptiveQualityWindow): number | null => {
  const gpu = window.gpuFrameMs;
  if (typeof gpu !== 'number' || !Number.isFinite(gpu) || gpu <= 0) return null;
  return gpu <= window.frameEmaMs * GPU_TRUST_SHARE ? gpu : null;
};

/** The achieved rate under which a window is a tier strike: a share of min(60 Hz, the display's presented rate). */
export function tierKeepUpFps(frameBudgetMs: number): number {
  const presented = Number.isFinite(frameBudgetMs) && frameBudgetMs > 0
    ? Math.min(TIER_PRESENTED_RATE_CAP, 1000 / frameBudgetMs) : TIER_PRESENTED_RATE_CAP;
  return presented * TIER_KEEP_UP_SHARE;
}

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

interface TierTrial {
  /** The median achieved rate of the strike windows that made the cut. */
  readonly evidenceFps: number;
  skip: number;
  readonly fps: number[];
}

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
  private holdDownStrikes = 0;
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
  // The tier record outlives reset(): a tier change rebroadcasts the preset, and post.ts resets the governor on it.
  private tierStrikeFps: number[] = [];
  private tierCutEvidenceFps: number | null = null;
  private tierTrial: TierTrial | null = null;
  private tierDownBarredUntil = Number.NEGATIVE_INFINITY;
  private tierRetrySeconds = TIER_RETRY_SECONDS;

  constructor(initialDynamicScale: number) {
    this.scale = initialDynamicScale;
  }

  get dynamicScale(): number { return this.scale; }
  get performanceTrim(): number { return this.trim; }
  get learnedBaselineFps(): number { return this.baselineFps; }
  /** Diagnostics: a tier trial is measuring the last cut. */
  get tierTrialActive(): boolean { return this.tierTrial !== null; }
  /** Diagnostics: the clock before which no tier cut is taken (a failed trial's bar). */
  get tierCutsBarredUntil(): number { return this.tierDownBarredUntil; }

  /**
   * The tier cut this policy asked for was applied (post.ts: reportSustainedOverload() returned true): measure it.
   * A cut that was refused (an explicit preset, the floor tier, a phone) opens no trial.
   */
  beginTierTrial(): boolean {
    const evidence = this.tierCutEvidenceFps;
    this.tierCutEvidenceFps = null;
    if (evidence === null || !(evidence > 0)) return false;
    this.tierTrial = { evidenceFps: evidence, skip: TIER_TRIAL_SKIP_WINDOWS, fps: [] };
    return true;
  }

  /** A new workload (garage <-> battle, a restored context) cannot be compared with the cut's evidence: keep the tier. */
  abandonTierTrial(): void {
    this.tierTrial = null;
    this.tierCutEvidenceFps = null;
  }

  reset(initialDynamicScale: number, clockSeconds: number): void {
    this.scale = initialDynamicScale;
    this.trim = 0;
    this.baselineFps = 0;
    this.trimDownStrikes = 0;
    this.holdDownStrikes = 0;
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
    this.tierStrikeFps = [];
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
    if (this.judgeTierTrial(window)) return 'tier-up';
    const load = classifyLoad(window, this.baselineFps);
    this.baselineFps = nextBaselineFps(
      this.baselineFps,
      window.achievedFps,
      load,
    );
    if (load.overloaded) return this.applyRelief(window);
    this.trimDownStrikes = 0;
    this.holdDownStrikes = 0;
    this.tierDownStrikes = 0;
    this.tierStrikeFps = [];
    return this.applyRecovery(window, load.clean);
  }

  /** Feed an open tier trial; true when the cut bought too little and the tier must be restored now. */
  private judgeTierTrial(window: AdaptiveQualityWindow): boolean {
    const trial = this.tierTrial;
    if (!trial) return false;
    if (!window.mayRaiseTier) {
      // the user pinned a preset (or the cap moved): nothing for the trial to restore
      this.tierTrial = null;
      return false;
    }
    if (trial.skip > 0) {
      trial.skip--;
      return false;
    }
    if (Number.isFinite(window.achievedFps) && window.achievedFps > 0) trial.fps.push(window.achievedFps);
    if (trial.fps.length < TIER_TRIAL_WINDOWS) return false;
    this.tierTrial = null;
    if (median(trial.fps) >= trial.evidenceFps * (1 + TIER_MIN_GAIN)) {
      this.tierRetrySeconds = TIER_RETRY_SECONDS;
      return false;
    }
    this.tierDownBarredUntil = window.clockSeconds + this.tierRetrySeconds;
    this.tierRetrySeconds = Math.min(this.tierRetrySeconds * 2, TIER_RETRY_MAX_SECONDS);
    this.tierDownStrikes = 0;
    this.tierStrikeFps = [];
    this.tierUpStrikes = 0;
    return true;
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
      if (gpu !== null && gpu < window.frameBudgetMs * GPU_BOUND_SHARE) return this.applyTierRelief(window);
      return this.applyResolutionRelief(window);
    }
    return this.applyTierRelief(window);
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
    const hold = holdRung(window);
    if (this.scale > hold + RUNG_EPSILON) {
      // above the hold rung: one cut lands on it, never past it
      this.holdDownStrikes = 0;
      this.scale = hold < window.dynamicScaleFloor + RUNG_EPSILON
        ? Math.max(window.dynamicScaleFloor, this.scale - RESOLUTION_STEP * steps)
        : hold;
    } else {
      // at the hold rung: below it only under a sustained overload
      this.holdDownStrikes++;
      if (this.holdDownStrikes < HOLD_DOWN_STRIKES) return 'none';
      this.holdDownStrikes = 0;
      this.scale = Math.max(window.dynamicScaleFloor, this.scale - RESOLUTION_STEP * steps);
    }
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

  private applyTierRelief(window: AdaptiveQualityWindow): AdaptiveQualityAction {
    const clockSeconds = window.clockSeconds;
    if (clockSeconds <= TIER_DOWN_WARMUP_SECONDS) return 'none';
    // keeping up (or a trial still measuring the last cut, or a failed trial's bar): no strike, and the run restarts
    if (window.achievedFps >= tierKeepUpFps(window.frameBudgetMs) || this.tierTrial !== null
      || clockSeconds < this.tierDownBarredUntil) {
      this.tierDownStrikes = 0;
      this.tierStrikeFps = [];
      return 'none';
    }
    this.tierDownStrikes++;
    this.tierStrikeFps.push(window.achievedFps);
    if (this.tierDownStrikes < TIER_DOWN_STRIKES) return 'none';
    this.tierCutEvidenceFps = median(this.tierStrikeFps);
    this.tierDownStrikes = 0;
    this.tierStrikeFps = [];
    return 'tier-down';
  }

  private applyRecovery(
    window: AdaptiveQualityWindow,
    clean: boolean,
  ): AdaptiveQualityAction {
    if (clean && this.canRestoreResolution(window.clockSeconds) && this.gpuFitsStepUp(window)) {
      this.tierUpStrikes = 0;
      this.scale = this.nextScaleUp(window);
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
    if (!window.mayRaiseTier || !clean || this.scale < 1 || this.trim > 0 || !stableLongEnough || this.tierTrial) {
      this.tierUpStrikes = 0;
      return 'none';
    }
    this.tierUpStrikes++;
    if (this.tierUpStrikes < TIER_UP_STRIKES) return 'none';
    this.tierUpStrikes = 0;
    return 'tier-up';
  }

  /** The up-step's scale: a rung below the hold climbs back to it, the hold rung returns to the full raster at once. */
  private nextScaleUp(window: AdaptiveQualityWindow): number {
    const hold = holdRung(window);
    if (hold <= window.dynamicScaleFloor + RUNG_EPSILON) return Math.min(1, this.scale + RESOLUTION_STEP);
    if (this.scale < hold - RUNG_EPSILON) {
      const next = this.scale + RESOLUTION_STEP;
      return next >= hold - 1e-4 ? hold : next; // the rung itself, not a float a hair under it
    }
    return 1;
  }

  /** Without a GPU measurement the cadence rule alone decides; with one, the next step must fit the headroom. */
  private gpuFitsStepUp(window: AdaptiveQualityWindow): boolean {
    const gpu = knownGpu(window);
    if (gpu === null || !(this.scale > 0)) return true;
    const next = this.nextScaleUp(window);
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
