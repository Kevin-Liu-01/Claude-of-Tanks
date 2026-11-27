/**
 * Hull thrusters (thrust-flips-277; thrust-boosts-279, owner 2026-11-27: "the subsequent side/rear boosts that alow you
 * to roll shouldnt like just have you end at rogiinal position they should literally be just like a additional force
 * vector added from that side"; 276: "like a rocket strapped to your butt and sides being activated to change your
 * motion").
 *
 * A boost is a force at a point, nothing more. Its nozzles sit at mount points on the hull's box: the belly for the climb
 * (UP), the butt for Turbo in flight (FORWARD), the nose's underside for the back push (BACK), the side away from the push
 * for a side boost (LEFT, RIGHT), each a pair symmetric about the centre of mass. A press burns its pair at a constant
 * thrust for BOOST_BURN_S (hullFlight.ts). The force moves the centre of mass (the hull goes away from the side that
 * fired) and its moment about the centre of mass, r x F, turns the hull through the box's inertia. Nothing else fires:
 * no attitude couple, no counter-burn, no turn to finish. The hull keeps whatever velocity and spin the forces gave it,
 * the mode's air angular drag the only damper, and successive boosts add up as vectors. The ground takes the landing
 * (contact, rollover, the self-right).
 *
 * Everything here is a function of the burn's state (the nozzle firing and the seconds it has left, movement.ts
 * `_boostNozzle` and `_boostBurnS`) and the mode's rules, so the prediction checkpoint (version 12) and a migrated host
 * carry all of it, and a replay re-derives the same burns. Per unit mass: forces are m/s^2, torques m^2/s^2, the inertia
 * the box's squared radii of gyration (m^2). Hull-local axes are the renderer's root: x the hull's left (a positive
 * steer turns toward it), y up, z forward. A dependency-light leaf so the renderer draws the plumes from the rule the
 * simulation applies.
 */
import type { AirSpinRules } from './matchRuleset.ts';
import { BOOST_BURN_S, BOOST_NOZZLES } from './hullFlight.ts';
import { tankContactRect, tankMassCenterOffsetM } from './tankContactShape.ts';

/** A hull as its contact box reads it (tankContactShape.ts's own spec shape). */
type ContactSpec = Parameters<typeof tankContactRect>[0];

/** A flight in which a nozzle has fired turns at what its nozzles gave it, up to this (rad/s; Main's ruling 4): the
 *  flight's ordinary rate cap (the mode's airAngularSpeedMax, 1.2-1.4) would take a side boost's roll in a tick. */
export const BOOST_SPIN_CAP = 8;

/** The hull's box as the thrusters read it (root-local metres), its centre of mass and squared radii of gyration. */
export interface HullThrustFrame {
  comX: number; comY: number; comZ: number;
  front: number; rear: number; top: number; belly: number; halfWidth: number;
  k2Pitch: number; k2Roll: number;
}

const frameCache = new WeakMap<object, HullThrustFrame>();

/**
 * The thrusters' frame for a hull: its contact box (tankContactRect), its centre of mass along it
 * (tankMassCenterOffsetM) and halfway up the box, and a uniform box from the ground to the deck for the inertia (the
 * running gear is mass too): pitch (L^2 + H^2) / 12, roll (W^2 + H^2) / 12.
 */
export function hullThrustFrame(spec: ContactSpec): HullThrustFrame {
  const cached = frameCache.get(spec as object);
  if (cached) return cached;
  const rect = tankContactRect(spec);
  const offset = tankMassCenterOffsetM(spec);
  const top = Math.max(rect.maxY, 0.5);
  const length = 2 * rect.halfLength, width = 2 * rect.halfWidth;
  const frame: HullThrustFrame = Object.freeze({
    comX: rect.centerX,
    comY: (rect.minY + rect.maxY) * 0.5,
    comZ: rect.centerZ + (Number.isFinite(offset) ? offset : 0),
    front: rect.centerZ + rect.halfLength,
    rear: rect.centerZ - rect.halfLength,
    top,
    belly: Math.max(0, rect.minY),
    halfWidth: rect.halfWidth,
    k2Pitch: (length * length + top * top) / 12,
    k2Roll: (width * width + top * top) / 12,
  });
  frameCache.set(spec as object, frame);
  return frame;
}

/** One nozzle: its mount (root-local), the unit direction it pushes the hull (its exhaust leaves the other way) and its
 *  thrust per unit hull mass at a full burn (m/s^2). */
export interface HullNozzle { x: number; y: number; z: number; dx: number; dy: number; dz: number; accel: number }

/** A boost's nozzle pair for one hull and one shove, and what its full burn does to the hull's spin (filled in place: the
 *  sim calls it every step of a burn). */
export interface BoostThrusters {
  nozzle: number;
  pair: [HullNozzle, HullNozzle];
  /** The pair's angular acceleration at a full burn (rad/s^2), from r x F, in the attitude spring's senses: `pitch`
   *  positive nose up, `roll` positive the hull's left (+x) side up. */
  alphaPitch: number;
  alphaRoll: number;
}

export function createBoostThrusters(): BoostThrusters {
  const nozzle = (): HullNozzle => ({ x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, accel: 0 });
  return { nozzle: 0, pair: [nozzle(), nozzle()], alphaPitch: 0, alphaRoll: 0 };
}

/** The pair's spread across the hull (a share of its half width) and a side pair's along it (a share of its half length). */
const PAIR_SPREAD = 0.5;
const SIDE_PAIR_Z = 0.45;
/** The nozzles' tilt off their push, toward up: the butt's 15 degrees, the nose's 30, the sides' 20. Exact constants (the
 *  det-math rule: no native transcendental in the sim): 15 = 45 - 30; 20's to double precision. */
const SIN15 = (Math.sqrt(6) - Math.sqrt(2)) / 4, COS15 = (Math.sqrt(6) + Math.sqrt(2)) / 4;
const SIN30 = 0.5, COS30 = Math.sqrt(3) / 2;
const SIN20 = 0.3420201433256687, COS20 = 0.9396926207859084;

/** The shove a nozzle's burn delivers along its push (m/s; AirSpinRules), 0 with no rules or no such nozzle. */
export function boostShove(nozzle: number, rules: AirSpinRules | null | undefined): number {
  if (!rules) return 0;
  const shove = nozzle === BOOST_NOZZLES.UP ? rules.upMps
    : nozzle === BOOST_NOZZLES.FORWARD ? rules.forwardMps
      : nozzle === BOOST_NOZZLES.BACK ? rules.backMps
        : nozzle === BOOST_NOZZLES.LEFT || nozzle === BOOST_NOZZLES.RIGHT ? rules.sideMps : 0;
  return Number.isFinite(shove) && shove > 0 ? shove : 0;
}

/**
 * A boost's nozzle pair for a hull, sized so its burn (BOOST_BURN_S at full thrust) delivers `shoveMps` along its push
 * (the push's horizontal share for a tilted nozzle, all of it for the belly's), and that pair's r x F about the centre of
 * mass over the box's inertia. An unknown nozzle fills a pair at no thrust.
 */
export function boostThrusters(frame: HullThrustFrame, nozzle: number, shoveMps: number, out: BoostThrusters): BoostThrusters {
  const shove = Math.max(0, Number.isFinite(shoveMps) ? shoveMps : 0);
  let dx = 0, dy = 0, dz = 0, along = 1;
  // each mount: a pair either side of the centre of mass across the hull (s = -1, +1 on x), or along it for a side pair
  let x0 = frame.comX, y0 = frame.comY, z0 = frame.comZ, spreadX = 0, spreadZ = 0;
  if (nozzle === BOOST_NOZZLES.UP) {
    // the belly, under the centre of mass, pushing straight up the hull's own up
    dy = 1;
    y0 = frame.belly; spreadX = frame.halfWidth * PAIR_SPREAD;
  } else if (nozzle === BOOST_NOZZLES.FORWARD) {
    // the butt, a little above the centre of mass, pushing forward and a little up
    dy = SIN15; dz = COS15; along = COS15;
    y0 = frame.comY + 0.15 * (frame.top - frame.comY); z0 = frame.rear; spreadX = frame.halfWidth * PAIR_SPREAD;
  } else if (nozzle === BOOST_NOZZLES.BACK) {
    // the nose's underside, pushing back and up
    dy = SIN30; dz = -COS30; along = COS30;
    y0 = frame.belly; z0 = frame.front; spreadX = frame.halfWidth * PAIR_SPREAD;
  } else if (nozzle === BOOST_NOZZLES.LEFT || nozzle === BOOST_NOZZLES.RIGHT) {
    // the side away from the push, at the centre of mass's height, pushing across and a little up
    const toward = nozzle === BOOST_NOZZLES.LEFT ? 1 : -1;
    dx = toward * COS20; dy = SIN20; along = COS20;
    x0 = frame.comX - toward * frame.halfWidth; spreadZ = SIDE_PAIR_Z * (frame.front - frame.rear) * 0.5;
  }
  const known = dx !== 0 || dy !== 0 || dz !== 0;
  const accel = known && shove > 0 ? shove / (along * BOOST_BURN_S) / 2 : 0;
  out.nozzle = known ? nozzle : 0;
  out.alphaPitch = 0;
  out.alphaRoll = 0;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const n = out.pair[i]!;
    n.x = x0 + s * spreadX; n.y = y0; n.z = z0 + s * spreadZ;
    n.dx = dx; n.dy = dy; n.dz = dz;
    n.accel = accel;
    out.alphaPitch += nozzlePitchAlpha(frame, n);
    out.alphaRoll += nozzleRollAlpha(frame, n);
  }
  return out;
}

/** A nozzle's r x F about the centre of mass at full thrust over the box's pitch inertia, nose up positive (-tau_x). */
export function nozzlePitchAlpha(frame: HullThrustFrame, n: HullNozzle): number {
  const ry = n.y - frame.comY, rz = n.z - frame.comZ;
  return -(ry * n.dz - rz * n.dy) * n.accel / frame.k2Pitch;
}

/** A nozzle's r x F about the centre of mass at full thrust over the box's roll inertia, the left (+x) side up positive
 *  (+tau_z). */
export function nozzleRollAlpha(frame: HullThrustFrame, n: HullNozzle): number {
  const rx = n.x - frame.comX, ry = n.y - frame.comY;
  return (rx * n.dy - ry * n.dx) * n.accel / frame.k2Roll;
}

/**
 * A hull-local vector in the world, at the renderer's composition (Euler YXZ: yaw, then -pitch about x, then roll about
 * z), from the angles' sines and cosines (the sim passes detMath's, the renderer Math's). Writes [x, y, z] to `out`.
 */
export function hullToWorld(x: number, y: number, z: number, sinYaw: number, cosYaw: number, sinPitch: number,
  cosPitch: number, sinRoll: number, cosRoll: number, out: number[]): number[] {
  const x1 = x * cosRoll - y * sinRoll, y1 = x * sinRoll + y * cosRoll;
  // about x by -pitch: sin(-p) = -sin p
  const y2 = y1 * cosPitch + z * sinPitch, z2 = -y1 * sinPitch + z * cosPitch;
  out[0] = x1 * cosYaw + z2 * sinYaw;
  out[1] = y2;
  out[2] = -x1 * sinYaw + z2 * cosYaw;
  return out;
}

/** The burn the renderer draws (movement.ts TankState._thrust, written each step): the nozzle firing (BOOST_NOZZLES, 0
 *  none), the share of its thrust the step applied (0..1: under 1 where the climb cap took some of it), `lift` while a
 *  ground press's hop waits to clear the ground before it fires, and the shove the pair is sized for. */
export interface HullThrustState { nozzle: number; level: number; lift: number; shove: number }

export function createHullThrustState(): HullThrustState {
  return { nozzle: 0, level: 0, lift: 0, shove: 0 };
}
