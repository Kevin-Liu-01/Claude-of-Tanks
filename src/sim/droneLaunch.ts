import {AERIAL_RULES} from './matchRuleset.ts';
/** Motors spool on the cradle before the airframe unloads its skids. */
export const DRONE_SPOOL_S = .35;
/** Shared deterministic spool-up displacement, in the carrier's dock frame: seated while the rotors spool, then a
 * smooth vertical climb to the launch height, all within the unchanged launch time. */
export function droneLaunchHeight(ageS:number):number {
 const u=Math.min(1,Math.max(0,(ageS-DRONE_SPOOL_S)/(AERIAL_RULES.drone.launchS-DRONE_SPOOL_S)));
 return AERIAL_RULES.drone.launchHeightM*u*u*u*(10+u*(-15+6*u));
}
export function droneFreeFlightBlend(ageS:number):number {
 const u=Math.min(1,Math.max(0,(ageS-AERIAL_RULES.drone.launchS)/.4));
 return u*u*(3-2*u);
}
