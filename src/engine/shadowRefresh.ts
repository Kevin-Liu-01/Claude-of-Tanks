/**
 * Refresh-rate-invariant CSM scheduler.
 *
 * At 60 Hz both near cascades must refresh every presented frame. At 120+
 * they still need 60 updates/s each, while each far map needs 30. The near
 * pair owns one frame and the alternating far stream owns the next, keeping
 * full target cadence without ever combining all broad + near caster work.
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
  // Classify the DISPLAY cadence from a smoothed interval, never one frame.
  // Otherwise a transient >12.5 ms hitch flips that same frame onto the
  // three-map 60 Hz path and turns one miss into a self-reinforcing burst.
  // Once >95 Hz is observed, phase-spread mode stays latched. A 120 Hz panel
  // does not become a 60 Hz panel merely because the GPU is briefly late;
  // switching back under load is exactly the positive-feedback failure this
  // scheduler exists to prevent. A real 60 Hz panel never enters the mode.
  const highRefreshEnterS = 1 / 95;
  const cadenceEmaAlpha = 0.08;
  const nearAcc = new Float64Array(nearCount);
  let farAcc = 0;
  let farCursor = -1;
  let nearTieCursor = 0;
  let cadenceEmaS = 0;
  let highRefreshMode = false;
  let lastMask = 0;

  function reset(resetCadence = false): void {
    nearAcc.fill(0);
    // Keep the near pair phase-aligned and offset the alternating far stream.
    // At 120+ Hz this yields one near-pair frame, then one far-only frame:
    // identical per-cascade cadence with a much lower peak than pairing a far
    // map's broad caster set with either near map.
    farAcc = nearCount > 1 ? intervalS * 0.5 : 0;
    farCursor = -1;
    nearTieCursor = 0;
    if (resetCadence) {
      cadenceEmaS = 0;
      highRefreshMode = false;
    }
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
    const dt = Math.max(0, Math.min(intervalS * 2, Number(dtS) || 0));
    if (!(dt > 0) || count === 0) {
      lastMask = 0;
      return 0;
    }
    if (!(cadenceEmaS > 0)) {
      cadenceEmaS = dt;
      highRefreshMode = dt <= highRefreshEnterS;
    } else {
      cadenceEmaS += (dt - cadenceEmaS) * cadenceEmaAlpha;
      if (!highRefreshMode && cadenceEmaS <= highRefreshEnterS) {
        highRefreshMode = true;
      }
    }
    const highRefresh = highRefreshMode;
    let mask = 0;

    for (let i = 0; i < nearCount; i++) {
      nearAcc[i] = Math.min(intervalS * 2, nearAcc[i] + dt);
    }
    const farCount = count - nearCount;
    if (farCount > 0) farAcc = Math.min(intervalS * 2, farAcc + dt);

    if (highRefresh) {
      // Near maps share their frame; the alternating far stream owns a
      // separate frame. At the 120 Hz target this preserves exact 60/60/30/30
      // cadence. If throughput falls below 120, far cadence yields before we
      // recombine broad + near caster sets and amplify the overload.
      const dueNear = [];
      for (let i = 0; i < nearCount; i++) {
        if (nearAcc[i] + epsilonS >= intervalS) dueNear.push(i);
      }
      dueNear.sort((a, b) => nearAcc[b] - nearAcc[a]
        || ((a - nearTieCursor + nearCount) % nearCount)
          - ((b - nearTieCursor + nearCount) % nearCount));
      const farDue = farCount > 0 && farAcc + epsilonS >= intervalS;
      if (dueNear.length >= 2) {
        for (let job = 0; job < 2; job++) {
          const i = dueNear[job];
          mask |= 1 << i;
          nearAcc[i] = Math.max(0, nearAcc[i] - intervalS);
          nearTieCursor = (i + 1) % nearCount;
        }
      } else if (farDue) {
        // When one near stream alone is late (normally only after a hitch),
        // service whichever class is more overdue, still as a one-class
        // frame. The other catches up next frame without a workload burst.
        const near = dueNear[0];
        if (near === undefined || farAcc >= nearAcc[near]) {
          farCursor = (farCursor + 1) % farCount;
          mask |= 1 << (nearCount + farCursor);
          farAcc = Math.max(0, farAcc - intervalS);
        } else {
          mask |= 1 << near;
          nearAcc[near] = Math.max(0, nearAcc[near] - intervalS);
          nearTieCursor = (near + 1) % nearCount;
        }
      } else if (dueNear.length) {
        const i = dueNear[0];
        mask |= 1 << i;
        nearAcc[i] = Math.max(0, nearAcc[i] - intervalS);
        nearTieCursor = (i + 1) % nearCount;
      }
    } else {
      // 60–80 Hz: preserve the established every-frame near pair exactly.
      for (let i = 0; i < nearCount; i++) {
        if (nearAcc[i] + epsilonS < intervalS) continue;
        mask |= 1 << i;
        nearAcc[i] = Math.max(0, nearAcc[i] - intervalS);
      }
    }

    if (!highRefresh && farCount > 0) {
      if (farAcc + epsilonS >= intervalS) {
        farCursor = (farCursor + 1) % farCount;
        mask |= 1 << (nearCount + farCursor);
        farAcc = Math.max(0, farAcc - intervalS);
      }
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
