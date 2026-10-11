/**
 * The landing on a carrier's dock, shared by the dock's own animation (game/missionAttachmentVisual.ts) and the
 * airframe flying home (fx/dronePresentation.ts), which hands over at the landing's first pose. Presentation only.
 *
 * The airframe settles straight down the dock's certified launch column from `heightM` with its rotors at speed,
 * brakes into a short hover `hoverM` above the pads and touches down on its skids. The props spin down where the eye
 * can follow them: still discs for `discS`, then visible blades slowing over the rest of `spoolS` to the exact angle
 * the parked airframe holds them.
 */
export const DRONE_ARRIVAL = Object.freeze({ descentS: 1.5, spoolS: 1.4, discS: .3, heightM: 2.4, hoverM: .25 });
/** Prop angle through the blade phase of the spin-down (u from 0 to 1): two full turns that slow to rest, ending
 * exactly on the parked pose (a whole number of turns), quick enough at first to read as spinning. */
export function droneSpinDownAngle(u:number):number {
  const x = Math.min(1, Math.max(0, u));
  return 4 * Math.PI * (1 - (1 - x) * (1 - x));
}

/** Height above the pads at a descent fraction: down to a brief braking hover, then a smooth touchdown (C1 throughout). */
export function droneArrivalHeight(u: number): number {
  const { heightM, hoverM } = DRONE_ARRIVAL, x = Math.min(1, Math.max(0, u));
  if (x < .75) return hoverM + (heightM - hoverM) * (1 - x / .75) ** 2;
  const v = (x - .75) / .25;
  return hoverM * (1 - v * v * (3 - 2 * v));
}

/** Attitude in the dock frame (Euler YXZ: pitch about x, yaw about y, roll about z) at a descent fraction: the
 * airframe yaws into the cradle's line and trims small errors as it comes down; level and aligned on the pads. */
export function droneArrivalAttitude(u: number, out: { pitch: number; yaw: number; roll: number }): typeof out {
  const x = Math.min(1, Math.max(0, u)), settle = 1 - x;
  out.pitch = .035 * Math.sin(x * 11) * settle;
  out.yaw = .32 * settle * settle;
  out.roll = .045 * Math.sin(x * 8 + 1) * settle;
  return out;
}

/** The airframe flying home after a flight ends in the air (recall, battery, signal): presentation only. The sim's
 * cooldown and every gameplay timing are unchanged; the flight is bounded so it is home before the next airframe. */
export const DRONE_RETURN = Object.freeze({
  /** Hold while an impact for this shell may still be on its way (a client applies events and snapshots together). */
  graceS: .12,
  /** Transit height over the dock: the airframe climbs or glides to it on the way home (the world's raycast lifts it
   * over whatever lies ahead), then descends the dock's column from there. */
  cruiseAboveDockM: 15,
  /** Transit ground speed: the distance home over `targetS`, inside these bounds (m/s). */
  minSpeed: 18, maxSpeed: 55, targetS: 11,
  /** Within this horizontal distance of the column the airframe stops and descends it. */
  columnM: 1.2,
  /** The whole flight home, start to hand-over, is abandoned past this (the next airframe is ready at the cooldown). */
  maxS: 20,
});
