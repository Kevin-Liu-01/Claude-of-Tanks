// A rotary cannon's barrel cluster turning while it fires (release 269, the M163 VADS; the owner 2026-11-04: "that m163
// literally has a gatling gun/minigun on its turret so itll be so fun to have in game and play around with"). Presentation
// only: the visual's runtime (tankFactoryCore.ts createTankRuntimeSteps) kicks it from recoilKick, once per shot the
// authority fired, and advances it on the same fx-clock step the recoil stroke rides; it reads and writes nothing of the
// simulation. Generic: any gun whose builder groups its barrels in a rotor tagged `userData.gunRotor` (GunRotorTag) about
// the rotor's own +Z, the gun's bore axis.
//   - spin-up: the rotor runs up to speed over `spinUpS` (an M61's drive brings it to rate in a few tenths of a second);
//   - firing: one barrel position per shot at the gun's own cycle (six barrels at 0.06 s: 60 degrees a shot, 1,000
//     degrees a second);
//   - coast-down: `holdS` after the last shot it lets go and coasts to rest on an exponential decay (`coastS`);
//   - every rendered step turns it at most `maxStepRad` (24 degrees, under half a barrel's 60), so a six-barrel cluster
//     reads as turning forward at any frame rate instead of strobing backwards.
// Allocation-free after construction; no wall clock (the caller's step is the only time it reads).
// First-party: Kevin B. Liu (NOTICE.md).
import type { Object3D } from 'three';

/** The tag a builder puts on its rotor group's userData under GUN_ROTOR_KEY. */
export interface GunRotorTag {
  /** barrels round the rotor (one turns into battery per shot) */
  readonly barrels: number;
  /** the gun's firing cycle in seconds (one shot per barrel position) */
  readonly cycleS: number;
}

/** The userData key a rotor group carries its GunRotorTag under. */
export const GUN_ROTOR_KEY = 'gunRotor';

/** The rotor's tuning (the defaults are the M61's). */
export interface GunRotorTuning {
  readonly spinUpS: number;
  readonly coastS: number;
  readonly holdS: number;
  readonly maxStepRad: number;
}

export const GUN_ROTOR_DEFAULTS: GunRotorTuning = Object.freeze({
  spinUpS: 0.3, coastS: 0.45, holdS: 0.16, maxStepRad: 24 * Math.PI / 180,
});

/** The first rotor under `root` (depth first), or null: what the visual's runtime spins. */
export function findGunRotor(root: Object3D): Object3D | null {
  if (isGunRotorTag(root.userData[GUN_ROTOR_KEY])) return root;
  for (const child of root.children) {
    const found = findGunRotor(child);
    if (found) return found;
  }
  return null;
}

/** Whether a userData value is a usable GunRotorTag. */
function isGunRotorTag(value: unknown): value is GunRotorTag {
  const tag = value as Partial<GunRotorTag> | null | undefined;
  return !!tag && Number.isInteger(tag.barrels) && (tag.barrels ?? 0) >= 2
    && Number.isFinite(tag.cycleS) && (tag.cycleS ?? 0) > 0;
}

/** One rotor's spin: kick() on every shot, advance(dt) on every rendered step. */
export interface GunRotorSpin {
  /** a shot left the gun: run up (or keep running) */
  kick(): void;
  /** turn the rotor by this step's spin (seconds; 0 holds it) */
  advance(dt: number): void;
  /** stop dead at the current angle (a respawn or a reset pose) */
  stop(): void;
  /** the spin as a fraction of firing speed, 0..1 */
  readonly speed: number;
  /** the rotor's angle about its axis, radians, in [0, 2 pi) */
  readonly angle: number;
}

const TAU = Math.PI * 2;

/** The rotor's spin (only its rotation.z is written). */
export function createGunRotorSpin(rotor: Object3D, tuning: GunRotorTuning = GUN_ROTOR_DEFAULTS): GunRotorSpin {
  const tag = rotor.userData[GUN_ROTOR_KEY];
  if (!isGunRotorTag(tag)) throw new TypeError('gun rotor: userData.gunRotor needs whole barrels >= 2 and a positive cycleS');
  if (!(tuning.spinUpS > 0 && tuning.coastS > 0 && tuning.holdS > 0 && tuning.maxStepRad > 0)) {
    throw new RangeError('gun rotor: spin-up, coast, hold and step must be positive');
  }
  // firing speed: one barrel position per cycle
  const firingRadS = (TAU / tag.barrels) / tag.cycleS;
  // the hold outlasts a missed frame or two between the shots of a burst
  const holdS = Math.max(tuning.holdS, tag.cycleS * 2.5);
  let speed = 0;
  let sinceShotS = Infinity;
  let angle = ((rotor.rotation.z % TAU) + TAU) % TAU;
  return {
    kick() { sinceShotS = 0; },
    advance(dt) {
      if (!(dt > 0)) return;
      sinceShotS += dt;
      if (sinceShotS <= holdS) speed = Math.min(1, speed + dt / tuning.spinUpS);
      else if (speed > 0) {
        speed *= Math.exp(-dt / tuning.coastS);
        if (speed < 1e-3) speed = 0;
      }
      if (speed === 0) return;
      angle += Math.min(speed * firingRadS * dt, tuning.maxStepRad);
      if (angle >= TAU) angle -= TAU * Math.floor(angle / TAU);
      rotor.rotation.z = angle;
    },
    stop() { speed = 0; sinceShotS = Infinity; },
    get speed() { return speed; },
    get angle() { return angle; },
  };
}
