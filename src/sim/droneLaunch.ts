import {AERIAL_RULES} from './matchRuleset.ts';
/** Shared deterministic spool-up displacement, in the carrier's dock frame. */
export function droneLaunchHeight(ageS:number):number {
 const u=Math.min(1,Math.max(0,ageS/AERIAL_RULES.drone.launchS));
 return AERIAL_RULES.drone.launchHeightM*u*u*u*(10+u*(-15+6*u));
}
export function droneFreeFlightBlend(ageS:number):number {
 const u=Math.min(1,Math.max(0,(ageS-AERIAL_RULES.drone.launchS)/.4));
 return u*u*(3-2*u);
}
