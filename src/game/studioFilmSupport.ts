/**
 * Film samples between two support steps.
 *
 * A Studio hull takes its ground track, heading, turret and gun from the timeline at any instant, but its height and
 * attitude from the battle support solver, stepped on the 60 Hz timeline grid (studioActorSupport.ts). A 30 fps film
 * frame's exposure is centred on every other grid line, so half of every frame's samples drew the hull at one support
 * step and half at the next: a hull riding rough ground printed twice, its gun ghosted above itself (shutter wave s1,
 * 2026-10-08: S13 frame 90, the same ghost at 60° and 90°, because its offset is one grid step's change, not the
 * shutter's). A film sample now solves the step after it and draws the support pose between the two steps around it;
 * the timeline's own pose and the track phase stay exact.
 *
 * Studio-only and written here rather than borrowed from the battle's presentationPose.ts: a static import from the
 * Studio chunk would split that module out of the game's battle chunk (one more request at battle entry).
 * Allocation-free after createFilmSupport.
 */

/** The tank state fields the support pose and the presentation read (sim/movement.ts TankState). */
export interface FilmSupportSource {
  pos: { x: number; y: number; z: number };
  yaw: number;
  speed: number;
  yawRate: number;
  visualPitch: number;
  visualRoll: number;
  turretYaw: number;
  gunPitch: number;
  trackScroll: { l: number; r: number };
  _swayEst?: number;
  _susp?: { p: number; r: number };
  _flinch?: { p: number; r: number; pv: number; rv: number };
}

interface SupportPose {
  y: number;
  visualPitch: number;
  visualRoll: number;
  speed: number;
  yawRate: number;
  swayEst: number;
  suspP: number;
  suspR: number;
  flinchP: number;
  flinchR: number;
  flinchPV: number;
  flinchRV: number;
}

/** The presentation state handed to the tank visual (tankFactoryCore.ts TankPoseState). */
export interface FilmSupportPresentation {
  pos: { x: number; y: number; z: number };
  yaw: number;
  visualPitch: number;
  visualRoll: number;
  yawRate: number;
  speed: number;
  turretYaw: number;
  gunPitch: number;
  trackScroll: { l: number; r: number };
  _swayEst: number;
  _susp: { p: number; r: number };
  _flinch: { p: number; r: number; pv: number; rv: number };
}

export interface FilmSupport {
  /** Grid step of `next` (-1: nothing captured since the last reset). */
  step: number;
  /** Grid step of `prev` (-1: none). */
  prevStep: number;
  prev: SupportPose;
  next: SupportPose;
  readonly pose: FilmSupportPresentation;
}

/** A sample closer than this to a grid line (in grid steps) is on it: the step's own pose, nothing to blend. */
export const FILM_SUPPORT_ON_GRID = 1e-6;

const supportPose = (): SupportPose => ({
  y: 0, visualPitch: 0, visualRoll: 0, speed: 0, yawRate: 0, swayEst: 0,
  suspP: 0, suspR: 0, flinchP: 0, flinchR: 0, flinchPV: 0, flinchRV: 0,
});

export function createFilmSupport(): FilmSupport {
  return {
    step: -1,
    prevStep: -1,
    prev: supportPose(),
    next: supportPose(),
    pose: {
      pos: { x: 0, y: 0, z: 0 }, yaw: 0, visualPitch: 0, visualRoll: 0, yawRate: 0, speed: 0,
      turretYaw: 0, gunPitch: 0, trackScroll: { l: 0, r: 0 }, _swayEst: 0,
      _susp: { p: 0, r: 0 }, _flinch: { p: 0, r: 0, pv: 0, rv: 0 },
    },
  };
}

/** Forget the captured steps (a replay or seek restarts the support solve). */
export function resetFilmSupport(support: FilmSupport): void {
  support.step = -1;
  support.prevStep = -1;
}

function readPose(out: SupportPose, state: FilmSupportSource): void {
  out.y = state.pos.y;
  out.visualPitch = state.visualPitch;
  out.visualRoll = state.visualRoll;
  out.speed = state.speed;
  out.yawRate = state.yawRate;
  out.swayEst = state._swayEst ?? 0;
  out.suspP = state._susp?.p ?? 0;
  out.suspR = state._susp?.r ?? 0;
  out.flinchP = state._flinch?.p ?? 0;
  out.flinchR = state._flinch?.r ?? 0;
  out.flinchPV = state._flinch?.pv ?? 0;
  out.flinchRV = state._flinch?.rv ?? 0;
}

/** Record the support pose the solver just produced for grid step `step`. */
export function captureFilmSupport(support: FilmSupport, state: FilmSupportSource, step: number): void {
  if (support.step === step - 1 && support.step >= 0) {
    const held = support.prev;
    support.prev = support.next;
    support.next = held;
    support.prevStep = support.step;
  } else {
    support.prevStep = -1;
  }
  readPose(support.next, state);
  support.step = step;
}

/**
 * The blend at timeline `timeMs` from the support step before it (0) to the step after it (1); 1 on a captured grid
 * line; -1 when the captured steps do not bracket it (the state's own pose stands).
 */
export function filmSupportAlpha(support: FilmSupport, timeMs: number, stepMs: number): number {
  const base = Math.floor((timeMs + 1e-7) / stepMs);
  const frac = timeMs / stepMs - base;
  if (frac <= FILM_SUPPORT_ON_GRID) return support.step === base ? 1 : support.prevStep === base ? 0 : -1;
  if (support.step === base + 1 && support.prevStep === base) return Math.min(1, frac);
  return -1;
}

const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * The presentation at blend `alpha` (filmSupportAlpha, ≥ 0): position, heading, turret and gun exactly as the timeline
 * left them in `state`, the track phase `scrollL`/`scrollR` past the state's, and the support pose blended.
 */
export function presentFilmSupport(
  support: FilmSupport,
  state: FilmSupportSource,
  alpha: number,
  scrollL: number,
  scrollR: number,
): FilmSupportPresentation {
  const out = support.pose, a = support.prev, b = support.next;
  const t = Math.max(0, Math.min(1, alpha));
  out.pos.x = state.pos.x;
  out.pos.y = mix(a.y, b.y, t);
  out.pos.z = state.pos.z;
  out.yaw = state.yaw;
  out.turretYaw = state.turretYaw;
  out.gunPitch = state.gunPitch;
  out.trackScroll.l = state.trackScroll.l + scrollL;
  out.trackScroll.r = state.trackScroll.r + scrollR;
  out.visualPitch = mix(a.visualPitch, b.visualPitch, t);
  out.visualRoll = mix(a.visualRoll, b.visualRoll, t);
  out.speed = mix(a.speed, b.speed, t);
  out.yawRate = mix(a.yawRate, b.yawRate, t);
  out._swayEst = mix(a.swayEst, b.swayEst, t);
  out._susp.p = mix(a.suspP, b.suspP, t);
  out._susp.r = mix(a.suspR, b.suspR, t);
  out._flinch.p = mix(a.flinchP, b.flinchP, t);
  out._flinch.r = mix(a.flinchR, b.flinchR, t);
  out._flinch.pv = mix(a.flinchPV, b.flinchPV, t);
  out._flinch.rv = mix(a.flinchRV, b.flinchRV, t);
  return out;
}
