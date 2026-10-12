/**
 * The landing on a carrier's dock, shared by the dock's own animation (game/missionAttachmentVisual.ts) and the
 * airframe flying home (fx/dronePresentation.ts), which hands over at the landing's first pose. Presentation only.
 *
 * Round 4 (critics, 2026-10-11): the airframe comes straight down the dock's certified launch column from `heightM`
 * with its rotors at speed and brakes with a nose-up flare into a short hover `hoverM` above the pads, where a pilot's
 * small quick corrections show, then sets down on its skids. The discs hold until the skids touch; then the props spin
 * down where the eye can follow them: discs for `discS`, then the disc fading in five steps over `blendS` while the
 * slowing blades show through it (round 4b: one faint step read as discs-then-stopped in 0.1 s stills), then blades
 * slowing to the exact angle the parked airframe holds them, 1.6 s in all. The clamps close after.
 */
export const DRONE_ARRIVAL = Object.freeze({
  descentS: 1.7, spoolS: 1.6, discS: .15, blendS: .75, heightM: 2.4, hoverM: .3,
  /** Within the descent (seconds): braking ends and the hover begins; the hover ends and the set-down begins. */
  hoverAtS: .95, setDownAtS: 1.35,
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
/** The hover's small quick corrections (metres), zero with zero slope where the hover begins and ends. */
function hoverCorrection(tau:number, span:number):number {
  const k = Math.min(1, Math.max(0, tau / span));
  // Three corrections in the hover (a whole number of half-waves across it keeps the ends flat).
  return .011 * Math.sin(6 * Math.PI * k) * Math.sin(Math.PI * k);
}
/** Height above the pads at a descent fraction: braking down the column to the hover, the hover's corrections, the
 * set-down. Continuous in height and speed; it rises only by the hover's centimetre corrections. */
export function droneArrivalHeight(u: number): number {
  const { heightM, hoverM, descentS, hoverAtS, setDownAtS } = DRONE_ARRIVAL, t = Math.min(1, Math.max(0, u)) * descentS;
  if (t < hoverAtS) return hoverM + (heightM - hoverM) * (1 - t / hoverAtS) ** 2;
  if (t < setDownAtS) return hoverM + hoverCorrection(t - hoverAtS, setDownAtS - hoverAtS);
  return hoverM * (1 - smooth((t - setDownAtS) / (descentS - setDownAtS)));
}

/** Attitude in the dock frame (Euler YXZ: pitch about x, yaw about y, roll about z) at a descent fraction: the airframe
 * yaws into the cradle's line, flares nose-up as it brakes, trims in small quick corrections through the hover, and is
 * level and aligned on the pads. Positive pitch puts the nose down. */
export function droneArrivalAttitude(u: number, out: { pitch: number; yaw: number; roll: number }): typeof out {
  const { descentS, hoverAtS, setDownAtS } = DRONE_ARRIVAL, x = Math.min(1, Math.max(0, u)), t = x * descentS;
  const settle = 1 - smooth(Math.min(1, t / descentS));
  // The flare: builds through the braking, peaks as the hover begins, gone before the set-down.
  const flare = t < hoverAtS ? smooth(Math.max(0, (t - .35) / (hoverAtS - .35))) : 1 - smooth(Math.min(1, (t - hoverAtS) / (setDownAtS - hoverAtS)));
  // Quick small corrections, strongest in the hover, fading to level on the pads.
  const hover = t >= hoverAtS && t < setDownAtS ? Math.sin(Math.PI * (t - hoverAtS) / (setDownAtS - hoverAtS)) : 0;
  const trim = .35 * settle + .65 * hover;
  out.pitch = -.1 * flare + (.022 * Math.sin(t * 13.7) + .01 * Math.sin(t * 23.1 + 1)) * trim;
  out.yaw = .32 * settle * settle + .01 * Math.sin(t * 9.3) * hover;
  out.roll = (.03 * Math.sin(t * 11.9 + 1) + .012 * Math.sin(t * 19.7)) * trim;
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
