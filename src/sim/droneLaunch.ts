import {AERIAL_RULES} from './matchRuleset.ts';
/** Motors spool on the cradle before the airframe unloads its skids: the clamps flip clear and the props run up to a
 * disc first, a readable beat before the lift (round 4b, 2026-10-11; coordinator-approved, launch time, height and
 * endpoints unchanged). */
export const DRONE_SPOOL_S = .6;
/**
 * The launch climb's thrust profile (round 4, 2026-10-11; coordinator-approved sim curve, launch time and height
 * unchanged): the airframe punches off the skids, climbs at a near-constant rate and brakes to the launch height,
 * rather than easing up a rail. Fractions of the climb (after the spool): the vertical speed ramps up over
 * `rampU` and down over the last `brakeU`, each on a smoothstep, so speed and acceleration stay continuous.
 */
export const DRONE_CLIMB_PROFILE = Object.freeze({ rampU: .12, brakeU: .4 });
const {rampU, brakeU} = DRONE_CLIMB_PROFILE, cruiseEnd = 1 - brakeU;
// Peak rate in launch heights per climb fraction: the profile's area (ramp and brake each cover half their span) is 1.
const peakRate = 1 / (cruiseEnd - rampU / 2 + brakeU / 2);
/** ∫ smoothstep over [0, x] (x in 0..1): x³ − x⁴/2. */
const rampArea = (x:number) => x * x * x - x * x * x * x / 2;
/** Height fraction at a climb fraction u (0..1): C2, monotonic, 0 at 0 and 1 at 1. */
export function droneClimbFraction(u:number):number {
 const x = Math.min(1, Math.max(0, u));
 if (x <= rampU) return peakRate * rampU * rampArea(x / rampU);
 if (x <= cruiseEnd) return peakRate * (rampU / 2 + (x - rampU));
 const b = (x - cruiseEnd) / brakeU;
 return peakRate * (rampU / 2 + (cruiseEnd - rampU) + brakeU * (b - rampArea(b)));
}
/** Shared deterministic launch displacement, in the carrier's dock frame: seated while the rotors spool, then the
 * thrust climb to the launch height, all within the unchanged launch time. A pure function of the flight's age. */
export function droneLaunchHeight(ageS:number):number {
 const u=(ageS-DRONE_SPOOL_S)/(AERIAL_RULES.drone.launchS-DRONE_SPOOL_S);
 return AERIAL_RULES.drone.launchHeightM*droneClimbFraction(u);
}
export function droneFreeFlightBlend(ageS:number):number {
 const u=Math.min(1,Math.max(0,(ageS-AERIAL_RULES.drone.launchS)/.4));
 return u*u*(3-2*u);
}
