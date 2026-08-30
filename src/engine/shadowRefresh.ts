/**
 * Refresh-rate-invariant CSM scheduler.
 *
 * Near cascades refresh every presented frame at every display rate, while
 * each far map targets 30 updates/s. Far maps refresh as one cohort: CSM fade
 * blends adjacent cascades, so rendering them from different camera/tree-LOD
 * timestamps produces a visible light/shadow swap even when each individual
 * projection remains internally coherent.
 */

export const SHADOW_REFRESH_INTERVAL_S = 1 / 60;

/** Near cascades follow the display cadence; farther cascades may be scheduled. */
export function isContinuousShadowCascade(cascadeIndex: number, nearCount = 2): boolean {
  const index = cascadeIndex | 0;
  const count = Math.max(0, nearCount | 0);
  return index >= 0 && index < count;
}

/**
 * A PCF shadow sampler may only be left dormant after Three has created its
 * native depth texture. Binding Three's ordinary fallback texture to a
 * `sampler2DShadow` is invalid on strict WebGL2 drivers (notably ANGLE/Metal)
 * and causes every affected draw to be rejected with GL_INVALID_OPERATION.
 *
 * @param {Array<{shadow?:{map?:{depthTexture?:{isDepthTexture?:boolean}}}}>} lights
 * @param {number} [startIndex=2]
 * @returns {boolean}
 */
interface ShadowLightLike {
  shadow?: { map?: { depthTexture?: { isDepthTexture?: boolean } | null } | null };
}

export function canDormantShadowCascades(
  lights: readonly ShadowLightLike[] | null | undefined,
  startIndex = 2,
): boolean {
  if (!Array.isArray(lights)) return false;
  const start = Math.max(0, startIndex | 0);
  for (let i = start; i < lights.length; i++) {
    if (lights[i]?.shadow?.map?.depthTexture?.isDepthTexture !== true) return false;
  }
  return true;
}

/**
 * Add one required cascade job without letting a live transition exceed the
 * high-refresh per-frame map budget. Existing scheduled work keeps its bit
 * order; a required bit replaces excess work instead of stacking onto it.
 */
export function mergeRequiredShadowWork(
  scheduledMask: number,
  requiredIndex: number,
  cascadeCount: number,
  maxJobs = 2,
): number {
  const count = Math.max(0, Math.min(30, cascadeCount | 0));
  if (requiredIndex < 0 || requiredIndex >= count || maxJobs <= 0) return 0;
  const validMask = count > 0 ? (2 ** count) - 1 : 0;
  const requiredBit = 1 << requiredIndex;
  let pending = (scheduledMask & validMask) & ~requiredBit;
  let result = requiredBit;
  let jobs = 1;
  for (let i = 0; i < count && jobs < maxJobs; i++) {
    const bit = 1 << i;
    if (!(pending & bit)) continue;
    result |= bit;
    pending &= ~bit;
    jobs++;
  }
  return result;
}

/**
 * @param {number} cascadeCount
 * @param {{nearCount?:number, intervalS?:number}} [opts]
 */
export interface ShadowRefreshOptions {
  nearCount?: number;
  intervalS?: number;
}

export interface ShadowRefreshScheduler {
  step(dtS: number): number;
  reset(resetCadence?: boolean): void;
  forceMask(): number;
  readonly lastMask: number;
}

export function createShadowRefreshScheduler(
  cascadeCount: number,
  opts: ShadowRefreshOptions = {},
): ShadowRefreshScheduler {
  const count = Math.max(0, Math.min(30, cascadeCount | 0));
  const nearCount = Math.max(0, Math.min(count, opts.nearCount ?? 2));
  const intervalS = Math.max(1 / 240, Number(opts.intervalS) || SHADOW_REFRESH_INTERVAL_S);
  const epsilonS = Math.min(0.001, intervalS * 0.08);
  const nearMask = nearCount > 0 ? (2 ** nearCount) - 1 : 0;
  const farCount = count - nearCount;
  // Preserve the old per-cascade cadence and total map work. Two desktop far
  // cascades now render together every 1/30 s instead of alternating one map
  // every 1/60 s; a single mobile far cascade remains a 60 Hz stream.
  const farIntervalS = intervalS * Math.max(1, farCount);
  const farMask = farCount > 0
    ? (((2 ** farCount) - 1) << nearCount)
    : 0;
  let farAcc = 0;
  let lastMask = 0;

  function reset(_resetCadence = false): void {
    // forceMask() has just supplied a coherent all-cascade baseline. Seed the
    // accumulator so normal far cadence resumes promptly without a long cold
    // gap, while still keeping the pair on one shared timestamp.
    farAcc = farCount > 1
      ? Math.max(0, farIntervalS - intervalS * 0.5)
      : (nearCount > 1 ? intervalS * 0.5 : 0);
    lastMask = 0;
  }

  function allMask(): number {
    return count > 0 ? (2 ** count) - 1 : 0;
  }

  /** Reset phase and return a mask that refreshes every cascade now. */
  function forceMask(): number {
    reset();
    lastMask = allMask();
    return lastMask;
  }

  /**
   * Schedule one render frame.
   * @param {number} dtS render-frame delta
   * @returns {number} cascade bit mask
   */
  function step(dtS: number): number {
    const dt = Math.max(0, Math.min(farIntervalS, Number(dtS) || 0));
    if (!(dt > 0) || count === 0) {
      lastMask = 0;
      return 0;
    }
    // Near cascades are `autoUpdate=true` in lighting.ts and therefore render
    // on every presented frame. Keep them in the returned mask so telemetry
    // describes actual work; the scheduler only rate-limits the far cohort.
    let mask = nearMask;
    if (farCount > 0) farAcc = Math.min(farIntervalS * 2, farAcc + dt);
    if (farCount > 0 && farAcc + epsilonS >= farIntervalS) {
      mask |= farMask;
      farAcc = Math.max(0, farAcc - farIntervalS);
    }

    lastMask = mask;
    return mask;
  }

  reset(true);
  return {
    step,
    reset,
    forceMask,
    get lastMask() { return lastMask; },
  };
}
