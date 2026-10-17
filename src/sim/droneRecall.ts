/**
 * The drone recall's timing law (owner 2026-10-14), shared by both authorities (sim/aerialCombat.ts) and the airframe
 * flying home (fx/dronePresentation.ts), so the flight home that is drawn lands inside the window the authority holds the
 * next launch for. Pure and deterministic: a function of the flight's age, or of where the airframe is at the recall.
 * The rules live in sim/matchRuleset.ts (AERIAL_RULES.drone.recall).
 *
 * The transit is bounded (verifier, 2026-10-14: a recall from high above the tank waited up to 71 s, against 25 s after
 * a loss): the ground track and the climb or sink each fly at their usual pace, and faster where the usual pace would
 * not cover them inside `maxTransitS`. So from anywhere the airframe can be, however high, low or far, the relaunch is
 * ready at most `maxTransitS + approachS + landingS + cooldownS` after the recall, well inside the loss cooldown.
 */
import { AERIAL_RULES } from './matchRuleset.ts';

const RECALL = AERIAL_RULES.drone.recall;
/** Seconds into a flight from which a recall is accepted: the launch climb, then the lens hand-over into the drone's
 * own feed (the pilot has "entered the screen"). A press before it is refused. */
export const DRONE_RECALL_OPENS_S = AERIAL_RULES.drone.launchS + RECALL.feedS;
export function droneRecallOpen(ageS: number): boolean { return ageS >= DRONE_RECALL_OPENS_S; }
/** A distance as the law reads it: never negative; an unbounded or undefined one reads as the longest (the bound holds). */
function span(m: number): number { return Number.isNaN(m) ? Number.MAX_VALUE : Math.min(Number.MAX_VALUE, Math.max(0, m)); }
/** Ground speed of the flight home over a horizontal distance to the dock (m/s): the distance over `transitS` inside
 * [minMps, maxMps], and never slower than covers it inside `maxTransitS`. */
export function droneReturnSpeed(horizontalM: number): number {
  const ground = span(horizontalM);
  return Math.max(Math.min(RECALL.maxMps, Math.max(RECALL.minMps, ground / RECALL.transitS)), ground / RECALL.maxTransitS);
}
/** Climb (`riseM` > 0) or sink (`riseM` < 0) rate of the flight home to its cruise height over the dock (m/s):
 * `climbMps` or `sinkMps`, and never slower than covers the change inside `maxTransitS`. */
function droneReturnClimbRate(riseM: number): number {
  return Math.max(riseM > 0 ? RECALL.climbMps : RECALL.sinkMps, span(Math.abs(riseM)) / RECALL.maxTransitS);
}
/** Seconds the climb or sink to cruise height over the dock takes (`aboveDockM`: the airframe's height over the dock
 * datum at the recall); at most `maxTransitS`. */
export function droneReturnClimbS(aboveDockM: number): number {
  const rise = RECALL.cruiseAboveDockM - (Number.isFinite(aboveDockM) ? aboveDockM : 0);
  return Math.min(RECALL.maxTransitS, Math.abs(rise) / droneReturnClimbRate(rise));
}
/** Seconds of the transit home: the longer of the ground track and the climb or sink, at most `maxTransitS`. */
function droneReturnTransitS(horizontalM: number, aboveDockM: number): number {
  const ground = span(horizontalM), groundS = ground > 0 ? ground / droneReturnSpeed(ground) : 0;
  const transit = Math.max(groundS, droneReturnClimbS(aboveDockM));
  // A non-finite input (never reachable) reads as the bound, never as a longer or an undefined wait.
  return transit < RECALL.maxTransitS ? transit : RECALL.maxTransitS;
}
/** Seconds from an accepted recall to the landing's first pose over the dock: the transit, then the fixed beats (the
 * hold, the approach to the dock's column and its descent). */
export function droneReturnS(horizontalM: number, aboveDockM: number): number {
  return droneReturnTransitS(horizontalM, aboveDockM) + RECALL.approachS;
}
/** Seconds from an accepted recall until the airframe is parked on its dock: the flight home, then the landing. */
export function droneDockS(horizontalM: number, aboveDockM: number): number {
  return droneReturnS(horizontalM, aboveDockM) + RECALL.landingS;
}
/** The longest any recall waits for its relaunch, from anywhere the airframe can be (the law's bound). */
export const DRONE_RECALL_RELAUNCH_MAX_S = RECALL.maxTransitS + RECALL.approachS + RECALL.landingS + RECALL.cooldownS;
