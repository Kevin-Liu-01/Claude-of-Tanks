/**
 * Refresh-rate-invariant CSM scheduler.
 *
 * Near cascades refresh on every presented frame. The far cascades refresh as
 * one coherent cohort at a lower cadence and are added to that frame's near
 * work. CSM fade blends adjacent cascades, so withholding the near maps on a
 * far-cohort frame makes the foreground sample an older camera/tree timestamp
 * for exactly one frame: the resulting light-to-shadow swap is the visible
 * forest flash this scheduler must prevent.
 */

export const SHADOW_REFRESH_INTERVAL_S = 1 / 60;

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
  // Desktop's blended far pair refreshes at 20 Hz; a single mobile far map at
  // 30 Hz. Distant texels move slowly enough for that cadence, while the near
  // pair stays current on every presented frame.
  const farIntervalS = intervalS * Math.max(2, farCount + 1);
  const farMask = farCount > 0
    ? (((2 ** farCount) - 1) << nearCount)
    : 0;
  let farAcc = 0;
  let lastMask = 0;

  function reset(_resetCadence = false): void {
    // forceMask() has just supplied a coherent all-cascade baseline. Seed the
    // accumulator so normal far cadence resumes promptly without a long cold
    // gap, while still keeping the pair on one shared timestamp.
    farAcc = farCount > 0
      ? Math.max(0, farIntervalS - intervalS * 0.5)
      : 0;
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
    // The near pair is never withheld: skipping it for the far cohort leaves
    // nearby shadows one camera pose behind for a single, visibly flashing
    // frame. lighting.ts drives every map manually, so this mask describes the
    // actual depth work rather than Three's implicit auto-update behavior.
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
