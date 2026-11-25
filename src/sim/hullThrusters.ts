/**
 * Hull thrusters (thrust-flips-277; owner 2026-11-24, on 276: "right now the flips and barrel rolls in gravity mode look
 * like your literally swinging around an axis instead of like a rocket strapped to your butt and sides being activated to
 * change your motion. it doesnt look natural at all").
 *
 * The air spin (flip-boost-276's dodge) is rigid-body dynamics, not a prescribed turn. Nozzles sit at mount points on the
 * hull's box: the butt for the front flip, the nose's underside for the back flip, the side away from the travel for a
 * barrel roll, and a pair of attitude jets per sense (a couple: one end pushed up, the other down, no net force). Each
 * applies a force at its point: the force moves the centre of mass, its moment about the centre of mass, r x F, turns the
 * hull through the box's inertia, and the turn carries on its own momentum after the burn. A burn has a shape: it lights
 * at a share of its thrust and ramps up, holds, and tapers off as the spin reaches its rate; the hull coasts; then the
 * opposite jets fire a counter-burn that brings it to rest one whole turn round, on its tracks (controlled landings, the
 * owner's dodge being a move rather than a tumble).
 *
 * Everything here is a function of the spin's state: the turn it still owes (`_airSpinLeft`) and the rate it turns at
 * (the attitude spring's), so the prediction checkpoint (version 11) and a migrated host already carry all of it, and a
 * replay re-derives the same burns. Per unit mass: forces are m/s^2, torques m^2/s^2, the inertia the box's squared radii
 * of gyration (m^2). Hull-local axes are the renderer's root: x the hull's left (a positive steer turns toward it), y up,
 * z forward. A dependency-light leaf so the renderer draws the plumes from the rule the simulation applies.
 */
import { tankContactRect, tankMassCenterOffsetM } from './tankContactShape.ts';

/** A hull as its contact box reads it (tankContactShape.ts's own spec shape). */
type ContactSpec = Parameters<typeof tankContactRect>[0];

/** The burn's law (one whole turn in about AIR_SPIN_TURN_S, hullFlight.ts). */
export const AIR_SPIN_BURN = Object.freeze({
  /** The rate the main burn spins the hull up to (rad/s). */
  rateMax: 14,
  /** Angular acceleration at a full main burn (rad/s^2): its nozzles' moment plus the attitude jets'. */
  alphaMain: 100,
  /** At a full counter-burn (rad/s^2): the opposite attitude jets alone. */
  alphaCounter: 90,
  /** The main burn lights at this share of its thrust and reaches all of it by `rampRad` of turn. */
  rampFloor: 0.3,
  rampRad: 0.12,
  /** It tapers over the last `taper` of the rate and cuts below `cut` of its thrust. */
  taper: 0.3,
  cut: 0.05,
  /** The main nozzles fire only this early in the turn (rad); past it the attitude jets alone trim the rate. */
  window: 2.2,
  /** The counter-burn takes the stop the remaining turn asks (rate^2 / 2 turn) from `counterFrom` of its authority, all
   *  of it by `counterFrom + counterBand`, and only in the turn's second half. */
  counterFrom: 0.65,
  counterBand: 0.3,
  /** A turn slower than this (rad/s) with more than `trimFrom` rad still owed is trimmed back up by the attitude jets. */
  trimRate: 3,
  trimFrom: 0.5,
  /** A turn this close to whole (rad) is whole. */
  finishRad: 0.01,
});

/** The burn this step, each a share of its thrust (0..1). `main`: the move's nozzles with their attitude jets; `trim`:
 *  the attitude jets along the turn; `counter`: the opposite attitude jets. */
export interface AirSpinBurnLevels { main: number; trim: number; counter: number }

/**
 * The burn for a spin that still owes `left` rad of its turn and turns at `rate` rad/s along it (negative: against it).
 * Deterministic in its two inputs (no clock): the checkpoint's own values pick it.
 */
export function airSpinBurn(left: number, rate: number, out: AirSpinBurnLevels): AirSpinBurnLevels {
  const B = AIR_SPIN_BURN;
  out.main = 0; out.trim = 0; out.counter = 0;
  const owed = Math.max(0, Math.min(2 * Math.PI, Number.isFinite(left) ? left : 0));
  const w = Number.isFinite(rate) ? rate : 0;
  if (!(owed > 0)) return out;
  const turned = 2 * Math.PI - owed;
  const stop = w > 0 ? w * w / (2 * Math.max(owed, 1e-6)) : 0;
  const counter = Math.min(1, Math.max(0, (stop - B.counterFrom * B.alphaCounter) / (B.counterBand * B.alphaCounter)));
  if (counter > 0 && turned > Math.PI) {
    out.counter = counter;
  } else if (turned < B.window && w < B.rateMax) {
    const ramp = B.rampFloor + (1 - B.rampFloor) * Math.min(1, turned / B.rampRad);
    const taper = (B.rateMax - w) / (B.rateMax * B.taper);
    const main = Math.min(1, ramp, taper);
    out.main = main >= B.cut ? main : 0;
  } else if (w < B.trimRate && owed > B.trimFrom) {
    out.trim = Math.min(1, (B.trimRate - w) / B.trimRate);
  }
  return out;
}

/** Pitch spins: the air spin's axes ±1 (movement.ts AIR_SPIN_AXES), rolls ±2. */
export function airSpinPitches(axis: number): boolean { return Math.abs(axis) === 1; }

/**
 * The sense the burn turns the hull in, as the attitude spring signs its rate (positive pitch nose up; positive roll
 * lifts the hull's left, +x). A flip turns as its axis is signed (BACK_FLIP +1 nose up, FRONT_FLIP -1 nose down). A
 * barrel roll comes out of its side nozzles' moment: the roll to the left (+2) fires the right side's nozzles, which
 * lift the right side, so the left goes down (-1), and the hull rolls the way it travels, as a barrel does.
 */
export function airSpinSense(axis: number): number {
  if (!axis) return 0;
  return airSpinPitches(axis) ? Math.sign(axis) : -Math.sign(axis);
}

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

/** What a nozzle does in a burn: the move's own (`main`), the attitude jets beside it (`couple`), the opposite jets
 *  (`counter`). The trim fires the `couple` jets. */
export type NozzleRole = 'main' | 'couple' | 'counter';

/** One nozzle: its mount (root-local), the unit direction it pushes the hull (its exhaust leaves the other way) and its
 *  thrust per unit hull mass at a full burn (m/s^2). */
export interface HullNozzle { role: NozzleRole; x: number; y: number; z: number; dx: number; dy: number; dz: number; accel: number }

/** A move's thrusters for one hull and one shove, and what a full burn of each set does (filled in place: the sim calls it
 *  every step of a burn). */
export interface AirSpinThrusters {
  axis: number;
  /** The move's nozzles, a pair, each pushing `accel` along its direction. */
  nozzles: [HullNozzle, HullNozzle];
  /** Angular acceleration (spring sense, rad/s^2) the move's own nozzles give at a full burn, from r x F, and the
   *  attitude jets' share (alphaMain less it). */
  alphaMainNozzles: number;
  alphaCouple: number;
}

export function createAirSpinThrusters(): AirSpinThrusters {
  const nozzle = (): HullNozzle => ({ role: 'main', x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, accel: 0 });
  return { axis: 0, nozzles: [nozzle(), nozzle()], alphaMainNozzles: 0, alphaCouple: 0 };
}

/** The pair's spread across the hull (a share of its half width) and a side pair's along it (a share of its half length). */
const PAIR_SPREAD = 0.5;
const SIDE_PAIR_Z = 0.45;
/** The move's nozzles' tilt off its travel, toward up: the butt's 15 degrees, the nose's 30, the sides' 20. Exact
 *  constants (the det-math rule: no native transcendental in the sim): 15 = 45 - 30; 20's to double precision. */
const SIN15 = (Math.sqrt(6) - Math.sqrt(2)) / 4, COS15 = (Math.sqrt(6) + Math.sqrt(2)) / 4;
const SIN30 = 0.5, COS30 = Math.sqrt(3) / 2;
const SIN20 = 0.3420201433256687, COS20 = 0.9396926207859084;

/**
 * The move's own nozzles and their thrust for a hull, sized so the main burn's push along the move, over the burn that
 * brings the spin to `rateMax`, is `shoveMps` (AirSpinRules: forwardMps, backMps, sideMps); their moment about the centre
 * of mass is r x F, and the attitude jets supply the rest of `alphaMain`. Axis ±1 a flip, ±2 a roll (AIR_SPIN_AXES).
 */
export function airSpinThrusters(frame: HullThrustFrame, axis: number, shoveMps: number, out: AirSpinThrusters): AirSpinThrusters {
  const B = AIR_SPIN_BURN;
  const shove = Math.max(0, Number.isFinite(shoveMps) ? shoveMps : 0);
  let dx = 0, dy = 0, dz = 0, along = 1;
  let mx = 0, my = 0, mz = 0;
  if (axis === -1) {
    // FRONT_FLIP: the butt, a little above the centre of mass, pushing forward and a little up
    dy = SIN15; dz = COS15; along = COS15;
    mx = frame.halfWidth * PAIR_SPREAD; my = frame.comY + 0.15 * (frame.top - frame.comY); mz = frame.rear;
  } else if (axis === 1) {
    // BACK_FLIP: the nose's underside, pushing back and up
    dy = SIN30; dz = -COS30; along = COS30;
    mx = frame.halfWidth * PAIR_SPREAD; my = frame.belly; mz = frame.front;
  } else {
    // a roll: the side away from the travel, at the centre of mass's height, pushing toward the travel and a little up
    const toward = axis === 2 ? 1 : -1; // ROLL_LEFT travels to +x
    dx = toward * COS20; dy = SIN20; along = COS20;
    mx = -toward * frame.halfWidth; my = frame.comY; mz = SIDE_PAIR_Z * (frame.front - frame.rear) * 0.5;
  }
  const accel = shove > 0 ? shove * B.alphaMain / (B.rateMax * along) / 2 : 0;
  const pitch = airSpinPitches(axis);
  out.axis = axis;
  out.alphaMainNozzles = 0;
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;
    const nozzle = out.nozzles[i]!;
    nozzle.role = 'main';
    nozzle.x = pitch ? frame.comX + s * mx : mx;
    nozzle.y = my;
    nozzle.z = pitch ? mz : frame.comZ + s * mz;
    nozzle.dx = dx; nozzle.dy = dy; nozzle.dz = dz;
    nozzle.accel = accel;
    out.alphaMainNozzles += nozzleAlpha(frame, nozzle, axis);
  }
  out.alphaCouple = B.alphaMain - out.alphaMainNozzles;
  return out;
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

/** A nozzle's angular acceleration at full thrust about the move's axis, in the spring's sense: r x F about the centre of
 *  mass over the box's inertia (pitch: -tau_x, the nose going up; roll: +tau_z, the left side going up). */
export function nozzleAlpha(frame: HullThrustFrame, nozzle: HullNozzle, axis: number): number {
  const rx = nozzle.x - frame.comX, ry = nozzle.y - frame.comY, rz = nozzle.z - frame.comZ;
  const fx = nozzle.dx * nozzle.accel, fy = nozzle.dy * nozzle.accel, fz = nozzle.dz * nozzle.accel;
  if (airSpinPitches(axis)) return -(ry * fz - rz * fy) / frame.k2Pitch;
  return (rx * fy - ry * fx) / frame.k2Roll;
}

/**
 * The attitude jets for a sense of turn (spring sense: +1 nose up or left side up, -1 the other way) on a pitch or a
 * roll: two vertical jets at opposite ends of the box, one pushing up, one down, each `accel` (a couple: no net force,
 * the moment its force times the ends' spread). `alpha` (rad/s^2) sizes them.
 */
export function attitudeJets(frame: HullThrustFrame, pitch: boolean, sense: number, alpha: number, role: NozzleRole,
  out: HullNozzle[] = []): HullNozzle[] {
  out.length = 0;
  const a = Math.abs(alpha);
  if (!(a > 0) || !sense) return out;
  if (pitch) {
    // nose up: the nose's underside pushes up, the tail's deck down (and the reverse for nose down)
    const accel = a * frame.k2Pitch / Math.max(0.5, frame.front - frame.rear);
    const up = sense > 0;
    out.push({ role, x: frame.comX, y: up ? frame.belly : frame.top, z: frame.front, dx: 0, dy: up ? 1 : -1, dz: 0, accel });
    out.push({ role, x: frame.comX, y: up ? frame.top : frame.belly, z: frame.rear, dx: 0, dy: up ? -1 : 1, dz: 0, accel });
  } else {
    // left side up (+x): the left's underside pushes up, the right's deck down
    const accel = a * frame.k2Roll / Math.max(0.5, 2 * frame.halfWidth);
    const up = sense > 0;
    out.push({ role, x: frame.halfWidth, y: up ? frame.belly : frame.top, z: frame.comZ, dx: 0, dy: up ? 1 : -1, dz: 0, accel });
    out.push({ role, x: -frame.halfWidth, y: up ? frame.top : frame.belly, z: frame.comZ, dx: 0, dy: up ? -1 : 1, dz: 0, accel });
  }
  return out;
}

/** The burn the renderer draws (movement.ts TankState._thrust, written each step): the move's axis and each set's share
 *  of its thrust (AirSpinBurnLevels), `lift` while a ground dodge's hop waits to clear the ground before it turns. */
export interface HullThrustState { axis: number; main: number; trim: number; counter: number; lift: number; shove: number }

export function createHullThrustState(): HullThrustState {
  return { axis: 0, main: 0, trim: 0, counter: 0, lift: 0, shove: 0 };
}
