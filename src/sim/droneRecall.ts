/**
 * The drone recall's timing law (owner 2026-10-14), shared by both authorities (sim/aerialCombat.ts) and the airframe
 * flying home (fx/dronePresentation.ts), so the flight home that is drawn lands inside the window the authority holds the
 * next launch for. Pure and deterministic: a function of the flight's age, or of the distance home at the recall.
 * The rules live in sim/matchRuleset.ts (AERIAL_RULES.drone.recall).
 */
import { AERIAL_RULES } from './matchRuleset.ts';

const RECALL = AERIAL_RULES.drone.recall;
/** Seconds into a flight from which a recall is accepted: the launch climb, then the lens hand-over into the drone's
 * own feed (the pilot has "entered the screen"). A press before it is refused. */
export const DRONE_RECALL_OPENS_S = AERIAL_RULES.drone.launchS + RECALL.feedS;
export function droneRecallOpen(ageS: number): boolean { return ageS >= DRONE_RECALL_OPENS_S; }
/** Ground speed of the flight home over a horizontal distance to the dock (m/s). */
export function droneReturnSpeed(horizontalM: number): number {
  return Math.min(RECALL.maxMps, Math.max(RECALL.minMps, Math.max(0, horizontalM) / RECALL.transitS));
}
/** Seconds from an accepted recall to the landing's first pose over the dock: the transit (the longer of the ground
 * track and the climb or sink to cruise height over the dock), then the fixed beats (the hold, the approach to the dock's
 * column and its descent). `aboveDockM` is the airframe's height over the dock datum at the recall. */
export function droneReturnS(horizontalM: number, aboveDockM: number): number {
  const ground = Math.max(0, horizontalM), rise = RECALL.cruiseAboveDockM - aboveDockM;
  const vertical = rise >= 0 ? rise / RECALL.climbMps : -rise / RECALL.sinkMps;
  return Math.max(ground / droneReturnSpeed(ground), vertical) + RECALL.approachS;
}
/** Seconds from an accepted recall until the airframe is parked on its dock: the flight home, then the landing. */
export function droneDockS(horizontalM: number, aboveDockM: number): number {
  return droneReturnS(horizontalM, aboveDockM) + RECALL.landingS;
}
