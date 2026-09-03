/**
 * Full-frame CSM scheduler.
 *
 * Every active cascade is rendered from the same camera/caster timestamp on
 * every presented frame. Rate-capping distant maps made foliage and building
 * shadows visibly step against a smooth camera, especially inside cascade
 * fades. Static Garage scenes still use explicit dormancy in lighting.ts.
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
 * Resolve a bounded covered shadow warm without risking uninitialized native
 * depth samplers. A partial pass is allowed only when every omitted cascade
 * already owns a valid depth texture and the caller has explicitly made those
 * bands dormant; all other states fail open to a complete pass.
 */
export function resolveShadowPrimeCount(
  lights: readonly ShadowLightLike[] | null | undefined,
  requestedCount: number,
  farCascadesDormant: boolean,
): number {
  const total = lights?.length ?? 0;
  if (!total) return 0;
  const bounded = Number.isFinite(requestedCount)
    ? Math.max(0, Math.min(total, Math.floor(requestedCount)))
    : total;
  return bounded < total
    && farCascadesDormant
    && canDormantShadowCascades(lights, bounded)
    ? bounded
    : total;
}

/**
 * @param {number} cascadeCount
 */
export interface ShadowRefreshScheduler {
  step(dtS: number): number;
  reset(resetCadence?: boolean): void;
  forceMask(): number;
  readonly lastMask: number;
}

export function createShadowRefreshScheduler(
  cascadeCount: number,
): ShadowRefreshScheduler {
  const count = Math.max(0, Math.min(30, cascadeCount | 0));
  const fullMask = count > 0 ? (2 ** count) - 1 : 0;
  let lastMask = 0;

  function reset(_resetCadence = false): void {
    lastMask = 0;
  }

  /** Reset phase and return a mask that refreshes every cascade now. */
  function forceMask(): number {
    reset();
    lastMask = fullMask;
    return lastMask;
  }

  /**
   * Schedule one render frame.
   * @param {number} dtS render-frame delta
   * @returns {number} cascade bit mask
   */
  function step(dtS: number): number {
    if (!(Number(dtS) > 0) || count === 0) {
      lastMask = 0;
      return 0;
    }
    lastMask = fullMask;
    return lastMask;
  }

  reset(true);
  return {
    step,
    reset,
    forceMask,
    get lastMask() { return lastMask; },
  };
}
