/**
 * clock.ts — shared CONTINUOUS fx clock for visual animation timelines.
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

type FxClockSource = () => number;
type PopTrailEmitter = (
  x: number,
  y: number,
  z: number,
  heat: number,
  birthOffset: number,
) => void;

let clockFn: FxClockSource | null = null;
let shiftS = 0;

/** Install the shared clock source, measured in seconds. */
export function registerFxClock(fn: FxClockSource): void {
  clockFn = fn;
  shiftS = 0;
}

/** Report an age-preserving clock rebase of `delta` seconds. */
export function noteFxClockShift(delta: number): void {
  shiftS += delta;
}

/**
 * Continuous shared fx time in seconds, or null when no fx system has
 * registered (garage-only boots, unit probes) — callers fall back to
 * self-timed dt accumulation.
 */
export function fxNow(): number | null {
  return clockFn ? clockFn() - shiftS : null;
}

/**
 * The registered clock itself (seconds), without the rebase shift: the value the Studio's timeline (resetClock) and a
 * frozen shot (setFrozen) pin, so a layer animated on it films the same frame on every page (the map's air,
 * world/mapAmbience.ts). Null before an fx system registers.
 */
export function fxClockNow(): number | null {
  return clockFn ? clockFn() : null;
}

// ---------------------------------------------------------------------------
// Turret-pop smoke/ember trail bridge (effects_combat r6)
// ---------------------------------------------------------------------------
// The tumbling popped turret read as "a distant bird" — a bare dark speck
// with no motion cue tying it to the explosion. The particle system lives in
// effects.ts; the pop arc lives in tankFactory.ts. effects registers a tiny
// emitter here and the visual's applyPop calls it along the arc, so the
// turret drags a readable smoke + ember wake for its whole flight (works for
// live kills, GLB swaps and backdated composed captures alike).

let popTrailFn: PopTrailEmitter | null = null;

/** Install the trail emitter. */
export function registerPopTrail(fn: PopTrailEmitter): void {
  popTrailFn = fn;
}

/**
 * Emit one pop-trail puff at a world position (no-op without an fx system).
 * @param {number} x @param {number} y @param {number} z world position
 * @param {number} heat 0..1 ember intensity for this sample
 * @param {number} birthOffset seconds (<= 0 backdates the puff)
 */
export function emitPopTrail(
  x: number,
  y: number,
  z: number,
  heat: number,
  birthOffset = 0,
): void {
  if (popTrailFn) popTrailFn(x, y, z, heat, birthOffset);
}

// ---------------------------------------------------------------------------
// Turret landing bridge (physics lane, 2026-10-10)
// ---------------------------------------------------------------------------
// A popped turret is a rigid body now (sim/wreckTurrets.ts); the visual that follows it reports each hard landing
// here, where it happens, so the dust rises from the impact and the landing's sound plays at it — not on a timer
// beside the hull. Any number of listeners (the fx and the audio); none is a no-op.

type TurretLandingListener = (x: number, y: number, z: number, speedMps: number) => void;
const turretLandingListeners: TurretLandingListener[] = [];

/** Listen for turret landings; returns the unsubscribe. */
export function onTurretLanding(fn: TurretLandingListener): () => void {
  turretLandingListeners.push(fn);
  return () => {
    const index = turretLandingListeners.indexOf(fn);
    if (index >= 0) turretLandingListeners.splice(index, 1);
  };
}

/** A turret hit the ground (or a hull, or a wall) at x, y, z falling at `speedMps`. */
export function emitTurretLanding(x: number, y: number, z: number, speedMps: number): void {
  for (let i = 0; i < turretLandingListeners.length; i++) turretLandingListeners[i](x, y, z, speedMps);
}

// ---------------------------------------------------------------------------
// Debris landing bridge (the audio stream, 2026-10-13: B7)
// ---------------------------------------------------------------------------
// The rubble of a collapse is rigid bodies (fx/rubbleBodies.ts on its debris pool); the pool reports each hard landing
// (debrisPhysics onImpact) here, where it happens, so a heavy piece's thud plays where it lands. Any number of listeners
// (the audio); none is a no-op.

type DebrisLandingListener = (x: number, y: number, z: number, speedMps: number, massKg: number) => void;
const debrisLandingListeners: DebrisLandingListener[] = [];

/** Listen for debris landings; returns the unsubscribe. */
export function onDebrisLanding(fn: DebrisLandingListener): () => void {
  debrisLandingListeners.push(fn);
  return () => {
    const index = debrisLandingListeners.indexOf(fn);
    if (index >= 0) debrisLandingListeners.splice(index, 1);
  };
}

/** A piece of debris of `massKg` hit the ground (or the heap) at x, y, z at `speedMps`. */
export function emitDebrisLanding(x: number, y: number, z: number, speedMps: number, massKg: number): void {
  for (let i = 0; i < debrisLandingListeners.length; i++) debrisLandingListeners[i](x, y, z, speedMps, massKg);
}
