/**
 * ballistics.js — shell flight integration, penetration-vs-distance, aim
 * solutions and gun dispersion sampling.
 *
 * Pure-logic module (ARCHITECTURE.md §3.5.1): imports three for math classes
 * only, has zero top-level side effects, and runs under plain node. All
 * randomness arrives as an injected `rng` (`() => number in [0,1)`); all time
 * arrives as `dt` parameters.
 *
 * Units: meters / seconds / radians. Millimeters only where the name says Mm.
 */

import { Vector3 } from 'three';

/** Gravity exaggeration factor for readable shell arcs (shells doc §2). */
export const GRAVITY_SCALE = 2.2;

/** Shells despawn after this many seconds of flight (shells doc §2). */
export const SHELL_MAX_LIFETIME_S = 6;

/** Effective gravity applied to shells, m/s². */
const G_SHELL = 9.81 * GRAVITY_SCALE;

// Scratch vectors — module scope so update paths never allocate per call.
const _basisRef = new Vector3();
const _right = new Vector3();
const _up = new Vector3();

/**
 * Create a live shell entity (ARCHITECTURE.md §2.5).
 *
 * @param {object} shellSpec ShellSpec — {name,type,caliberMm,pen100Mm,pen1000Mm,dmg,velocityMps,moduleDmg,tracer}
 * @param {string} shooterId id of the firing tank
 * @param {boolean} isPlayer whether the shooter is the player
 * @param {Vector3} muzzlePos world-space muzzle tip at fire time
 * @param {Vector3} dir unit direction of fire (already dispersed/elevated)
 * @param {number} id unique numeric shell id
 * @returns {object} ShellEntity
 */
export function createShell(shellSpec, shooterId, isPlayer, muzzlePos, dir, id) {
  return {
    id,
    shooterId,
    isPlayer,
    spec: shellSpec,
    pos: muzzlePos.clone(),
    prevPos: muzzlePos.clone(),
    vel: dir.clone().multiplyScalar(shellSpec.velocityMps),
    ageS: 0,
    distM: 0,
    dead: false,
    penRollDone: false,
    remainingPenMm: 0,
    dmgRoll: 0,
    bounces: 0,
    carriedThrough: false,
  };
}

/**
 * Integrate one shell step: straight flight plus exaggerated gravity, no drag
 * (pen falloff fakes velocity decay — shells doc §2). Stores prevPos so the
 * caller can sweep the prevPos→pos segment against the world without
 * tunneling. Marks the shell dead past SHELL_MAX_LIFETIME_S.
 *
 * @param {object} shell ShellEntity
 * @param {number} dt step in seconds
 * @returns {void}
 */
export function stepShell(shell, dt) {
  shell.prevPos.copy(shell.pos);
  shell.pos.addScaledVector(shell.vel, dt);
  shell.distM += shell.vel.length() * dt; // true arc length for pen falloff
  shell.vel.y -= G_SHELL * dt;
  shell.ageS += dt;
  if (shell.ageS > SHELL_MAX_LIFETIME_S) shell.dead = true;
}

/**
 * Penetration at a given flight distance: linear interpolation from pen@100m
 * to pen@1000m, clamped outside that range (ARCHITECTURE.md §3.5.1).
 *
 * Specs quoting a far anchor (`pen2000Mm`, optional — modern APFSDS roster
 * values are quoted at 2 km) get a second linear segment 1000 m → 2000 m and
 * clamp beyond it, so the quoted long-range figure lands where it was quoted
 * instead of the falloff freezing at the 1000 m value.
 *
 * @param {object} shellSpec ShellSpec ({pen100Mm, pen1000Mm, [pen2000Mm]})
 * @param {number} distM flight distance in meters
 * @returns {number} average penetration in mm RHAe at that distance
 */
export function penAtDistanceMm(shellSpec, distM) {
  if (distM > 1000 && shellSpec.pen2000Mm > 0) {
    const f2 = Math.min(1, (distM - 1000) / 1000);
    return shellSpec.pen1000Mm + (shellSpec.pen2000Mm - shellSpec.pen1000Mm) * f2;
  }
  const f = Math.min(1, Math.max(0, (distM - 100) / 900));
  return shellSpec.pen100Mm + (shellSpec.pen1000Mm - shellSpec.pen100Mm) * f;
}

/**
 * Barrel elevation (radians above the straight line to the target) needed for
 * a shell of the given muzzle velocity to land at distM on flat ground:
 * theta = 0.5 · asin(g·d / v²), clamped to the max-range solution.
 *
 * @param {number} distM target distance in meters
 * @param {number} velocityMps shell muzzle velocity in m/s
 * @returns {number} elevation angle in radians
 */
export function aimElevationRad(distM, velocityMps) {
  const s = Math.min(1, Math.max(-1, (G_SHELL * distM) / (velocityMps * velocityMps)));
  return 0.5 * Math.asin(s);
}

/**
 * Perturb a unit fire direction by gun dispersion. Angular offsets are drawn
 * as a 2D Gaussian via Box-Muller from `rng`, re-rolled while outside 2σ so
 * no shot ever leaves the visible reticle circle (shells doc §8), then the
 * direction is rotated by the two offsets. Mutates `dir` in place.
 *
 * LOCKED calling convention (ARCHITECTURE.md §3.5.1): callers pass
 * `sigmaRad = (computeDispersionRadM(spec, state, 100) / 2) / 100` — the
 * reticle radius is 2σ, so σ in radians is r(100m)/200. Both the 3-argument
 * form `(dir, sigmaRad, rng)` and the doc's 4-slot form
 * `(dir, dispersionRadM_at100, sigmaRad, rng)` are accepted; the value used
 * as σ is always the argument immediately preceding `rng`.
 *
 * @param {Vector3} dir unit direction, mutated in place
 * @param {number} a sigmaRad (3-arg form) or r(100 m) (4-arg form, unused)
 * @param {number|function} b sigmaRad (4-arg form) or rng (3-arg form)
 * @param {function} [c] rng (4-arg form)
 * @returns {void}
 */
export function applyDispersion(dir, a, b, c) {
  const rng = typeof c === 'function' ? c : b;
  const sigmaRad = typeof c === 'function' ? b : a;
  if (!(sigmaRad > 0)) return;

  // Box-Muller pair in units of sigma. Post-8.6 WoT rule (movement doc §8):
  // a roll landing OUTSIDE the 2σ reticle circle is re-placed UNIFORMLY inside
  // the circle (r = 2√u — area-uniform), which center-biases the rim
  // distribution exactly like the live game, instead of re-rolling the
  // Gaussian (truncation keeps the Gaussian rim shape).
  let x = 0;
  let y = 0;
  {
    const u1 = Math.max(rng(), 1e-12);
    const u2 = rng();
    const r = Math.sqrt(-2 * Math.log(u1));
    x = r * Math.cos(2 * Math.PI * u2);
    y = r * Math.sin(2 * Math.PI * u2);
    if (x * x + y * y > 4) {
      const rr = 2 * Math.sqrt(rng());
      const th = 2 * Math.PI * rng();
      x = rr * Math.cos(th);
      y = rr * Math.sin(th);
    }
  }

  _basisRef.set(0, 1, 0);
  if (Math.abs(dir.y) > 0.99) _basisRef.set(1, 0, 0);
  _right.crossVectors(dir, _basisRef).normalize();
  _up.crossVectors(_right, dir).normalize();
  dir
    .addScaledVector(_right, Math.tan(x * sigmaRad))
    .addScaledVector(_up, Math.tan(y * sigmaRad))
    .normalize();
}
