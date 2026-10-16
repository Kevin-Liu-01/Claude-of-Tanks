import { AERIAL_RULES } from '../sim/matchRuleset.ts';
/**
 * The landing on a carrier's dock, shared by the dock's own animation (game/missionAttachmentVisual.ts) and the
 * airframe flying home (fx/dronePresentation.ts), which hands over at the landing's first pose. Presentation only.
 *
 * Round 5 (critics, waves 411c/416/420: "one smooth eased curve onto the roof", "on a rail, no corrections", "stops
 * dead at about 1 m/s"): the airframe arrives down the dock's certified column at the flight home's own speed
 * (`handoffSpeed`, no stop at the hand-over), brakes hard with a nose-up flare and a little late, dips below its hover
 * point and catches itself, holds a hover above the pads through visible corrections (height, attitude and heading
 * trims; never a step sideways out of the column), then sets down and touches at a walking pace, level on the pads.
 * The discs hold until the skids touch; then the props spin down where the eye can follow them: discs for `discS`,
 * the disc fading in five steps over `blendS` while the slowing blades show through it, then blades slowing to the
 * exact angle the parked airframe holds them, 1.6 s in all; after a short pause (`pauseS`) the clamps close.
 */
export const DRONE_ARRIVAL = Object.freeze({
  descentS: 2.95, spoolS: 1.6, discS: .15, blendS: .75, pauseS: .3, heightM: 2.4, hoverM: .46,
  /** Vertical speed (m/s) at the hand-over: the flight home descends the column at it, the landing starts at it. */
  handoffSpeed: 3.2,
  /** Within the descent (seconds): braking ends (a dip of `dipM` below the hover point), the catch back up ends, the
   * hover ends and the set-down begins; the skids touch at `contactSpeed` (m/s). */
  brakeEndS: 1.15, catchEndS: 1.5, setDownAtS: 2.3, dipM: .08, contactSpeed: .22,
});
/** Prop angle through the blade phase of the spin-down (u from 0 to 1): three full turns that slow to rest, ending
 * exactly on the parked pose (a whole number of turns), quick at first and visibly slowing. */
export function droneSpinDownAngle(u:number):number {
  const x = Math.min(1, Math.max(0, u));
  return 6 * Math.PI * (1 - (1 - x) * (1 - x));
}
/** The post-touchdown rotor phase at `s` seconds after the skids touch: full discs, discs fading under blades, blades. */
export function droneSpinDownPhase(s:number):'discs'|'blend'|'blades' {
  return s < DRONE_ARRIVAL.discS ? 'discs' : s < DRONE_ARRIVAL.discS + DRONE_ARRIVAL.blendS ? 'blend' : 'blades';
}
/** Which of `steps` fading discs shows at `s` seconds after touchdown during the blend (strongest first). */
export function droneSpinDownFadeStep(s:number, steps:number):number {
  const u = (s - DRONE_ARRIVAL.discS) / DRONE_ARRIVAL.blendS;
  return Math.min(steps - 1, Math.max(0, Math.floor(u * steps)));
}

const smooth = (x:number) => x * x * (3 - 2 * x);
const clamp01 = (x:number) => Math.min(1, Math.max(0, x));
/** Cubic Hermite from (h0, v0) to (h1, v1) over `span` seconds, at `tau` seconds in (velocities in m/s). */
function hermite(tau:number, span:number, h0:number, v0:number, h1:number, v1:number):number {
  const s = clamp01(tau / span), s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * h0 + (s3 - 2 * s2 + s) * span * v0 + (-2 * s3 + 3 * s2) * h1 + (s3 - s2) * span * v1;
}
/** The hover's corrections (metres): two catches of about 2 cm, zero with zero slope where the hover begins and ends. */
function hoverCorrection(tau:number, span:number):number {
  const k = clamp01(tau / span);
  return .021 * Math.sin(4 * Math.PI * k) * Math.sin(Math.PI * k);
}
/** Height above the pads at a descent fraction: braking down the column from the hand-over speed into a dip below the
 * hover point, the catch, the hover's corrections, the set-down to a gentle contact. Continuous in height and speed. */
export function droneArrivalHeight(u: number): number {
  const A = DRONE_ARRIVAL, t = clamp01(u) * A.descentS, dipAt = A.hoverM - A.dipM;
  if (t < A.brakeEndS) return hermite(t, A.brakeEndS, A.heightM, -A.handoffSpeed, dipAt, 0);
  if (t < A.catchEndS) return dipAt + A.dipM * smooth((t - A.brakeEndS) / (A.catchEndS - A.brakeEndS));
  if (t < A.setDownAtS) return A.hoverM + hoverCorrection(t - A.catchEndS, A.setDownAtS - A.catchEndS);
  return Math.max(0, hermite(t - A.setDownAtS, A.descentS - A.setDownAtS, A.hoverM, 0, 0, -A.contactSpeed));
}

/** Attitude in the dock frame (Euler YXZ: pitch about x, yaw about y, roll about z) at a descent fraction: the airframe
 * yaws into the cradle's line as it brakes, flares nose-up through the braking and the catch, trims through the hover
 * in visible quick corrections (a few degrees each axis), steadies through the set-down and is level and aligned on the
 * pads. Positive pitch puts the nose down. */
export function droneArrivalAttitude(u: number, out: { pitch: number; yaw: number; roll: number }): typeof out {
  const A = DRONE_ARRIVAL, t = clamp01(u) * A.descentS;
  const align = 1 - smooth(clamp01(t / A.brakeEndS));
  // The flare: builds through the braking, held into the catch, level again as the hover settles.
  const flare = t < A.brakeEndS ? smooth(clamp01((t - .35) / (A.brakeEndS - .35))) : 1 - smooth(clamp01((t - A.brakeEndS) / (A.catchEndS + .15 - A.brakeEndS)));
  // Corrections: strongest through the hover, small on the way down, gone at contact.
  const hoverK = t >= A.catchEndS && t < A.setDownAtS ? Math.sin(Math.PI * (t - A.catchEndS) / (A.setDownAtS - A.catchEndS)) : 0;
  const setDownK = t >= A.setDownAtS ? 1 - smooth(clamp01((t - A.setDownAtS) / (A.descentS - A.setDownAtS))) : 0;
  const trim = .3 * align + hoverK + .35 * setDownK;
  out.pitch = -.11 * flare + (.058 * Math.sin(t * 7.3 + .4) + .02 * Math.sin(t * 17.1 + 1)) * trim;
  out.yaw = .32 * align * align + (.04 * Math.sin(t * 4.1 + .7)) * hoverK;
  out.roll = (.068 * Math.sin(t * 6.1 + 1) + .022 * Math.sin(t * 15.7)) * trim;
  return out;
}

/** The airframe flying home after a flight ends in the air (recall, battery, signal): drawn here, timed by the recall's
 * law (sim/droneRecall.ts, the rules in AERIAL_RULES.drone.recall): its pace, its climb and sink, and its bound, so a
 * recalled airframe is parked inside the window the authority holds the dock for (owner 2026-10-14). */
export const DRONE_RETURN = Object.freeze({
  /** Hold while an impact for this shell may still be on its way (a client applies events and snapshots together). */
  graceS: .12,
  /** Transit height over the dock: the airframe climbs or glides to it on the way home (the world's raycast lifts it
   * over whatever lies ahead), then descends the dock's column from there. */
  cruiseAboveDockM: AERIAL_RULES.drone.recall.cruiseAboveDockM,
  /** Within this horizontal distance of the column the airframe stops and descends it. */
  columnM: 1.2,
  /** A flight home not handed over this long past its timing law is abandoned (the dock relaunches soon after). */
  overrunS: 3,
});
