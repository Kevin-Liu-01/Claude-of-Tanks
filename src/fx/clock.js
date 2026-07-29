/**
 * clock.js — shared CONTINUOUS fx clock for visual animation timelines.
 *
 * effects_combat r5: the tank visuals' self-timed animation layers (gun
 * recuperator recoil, turret-pop arc, wreck ember cooldown, staged char)
 * used to advance by the RENDER frame dt on every syncFromState call. Live
 * that is correct, but whenever the sim is halted while rAF keeps running
 * (screenshot 'shot' phase juggling, stepped-frozen critic captures) those
 * timelines aged in WALL-CLOCK time while the whole fx system stood frozen:
 * a live kill was fully charred + turret-settled before the first 0.1 s
 * capture frame, and the recuperator was back in battery by the "17 ms"
 * frame — the r4 "asset-swap at the most-watched moment" critical.
 *
 * The particle system's shared uTime is the one clock every fx element
 * already ages against, and the screenshot/critic pipeline pins/steps it
 * via fx.setFrozen(frozen, atTimeS). Visual timelines now read it through
 * this module: live play is identical (the clock advances by render dt each
 * frame), frozen captures hold every timeline, stepped captures advance them
 * exactly by the pinned step.
 *
 * fxNow() is RE-BASE IMMUNE: fx.setFrozen's age-preserving rebase (clock
 * pinned > 20 s away from its current value) shifts all fx-internal birth
 * stamps by delta; it reports the same delta here so fxNow() stays a
 * continuous monotonic timeline and visual birth anchors keep their age.
 */

let clockFn = null;
let shiftS = 0;

/** Install the shared clock source. @param {() => number} fn seconds */
export function registerFxClock(fn) {
  clockFn = fn;
  shiftS = 0;
}

/** Report an age-preserving clock rebase of `delta` seconds. */
export function noteFxClockShift(delta) {
  shiftS += delta;
}

/**
 * Continuous shared fx time in seconds, or null when no fx system has
 * registered (garage-only boots, unit probes) — callers fall back to
 * self-timed dt accumulation.
 * @returns {number|null}
 */
export function fxNow() {
  return clockFn ? clockFn() - shiftS : null;
}

// ---------------------------------------------------------------------------
// Turret-pop smoke/ember trail bridge (effects_combat r6)
// ---------------------------------------------------------------------------
// The tumbling popped turret read as "a distant bird" — a bare dark speck
// with no motion cue tying it to the explosion. The particle system lives in
// effects.js; the pop arc lives in tankFactory.js. effects registers a tiny
// emitter here and the visual's applyPop calls it along the arc, so the
// turret drags a readable smoke + ember wake for its whole flight (works for
// live kills, GLB swaps and backdated composed captures alike).

let popTrailFn = null;

/** Install the trail emitter. @param {(x:number,y:number,z:number,heat:number,birthOffset:number)=>void} fn */
export function registerPopTrail(fn) {
  popTrailFn = fn;
}

/**
 * Emit one pop-trail puff at a world position (no-op without an fx system).
 * @param {number} x @param {number} y @param {number} z world position
 * @param {number} heat 0..1 ember intensity for this sample
 * @param {number} birthOffset seconds (<= 0 backdates the puff)
 */
export function emitPopTrail(x, y, z, heat, birthOffset = 0) {
  if (popTrailFn) popTrailFn(x, y, z, heat, birthOffset);
}
