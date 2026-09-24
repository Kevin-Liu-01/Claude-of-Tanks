// src/world/maps/mooredHullMotion.ts — round 67 (2026-09-24): the moored hull's bob and sway, render-side.
//
// Round 58 moored a clinker hull alongside every derived jetty and left it welded to the sheet. The kit still lays
// the hull into the wood bucket exactly as it did (every receipt that freezes the kit's bytes is untouched) and, when
// the caller supplies an `animated` sink, also hands the same geometries to it (maps/mapKits.ts AnimatedDressing);
// props.ts then keeps those pieces out of the merged wood mesh, gives the hull its own mesh on the shared wood
// material and poses it every rendered frame from the world clock with the pure functions below — a few centimetres
// of heave from two swells, a degree of roll and half a degree of pitch on incommensurate periods, phased by the
// mooring point so two hulls never move in step. No stream draw, no wall clock and no simulation state: the sim,
// the authority and the dedicated shards never see the hull move. The motion is deliberately independent of the
// sheet shader; a later round may drive it from the ocean displacement instead.

export const MOORED_HULL_HEAVE_M = 0.035;
export const MOORED_HULL_CHOP_M = 0.012;
export const MOORED_HULL_ROLL_RAD = 0.022;
export const MOORED_HULL_PITCH_RAD = 0.008;
/** Periods in seconds: none a multiple of another, so the pose never repeats inside a minute. */
export const MOORED_HULL_PERIODS_S = Object.freeze({ heave: 4.3, chop: 2.7, roll: 3.6, pitch: 5.1 });

export interface MooredHullPose {
  /** Vertical offset from the still keel line (m). */
  heave: number;
  /** About the hull's length axis (rad). */
  roll: number;
  /** About the hull's beam axis (rad). */
  pitch: number;
}

const TAU = Math.PI * 2;

/** A phase in [0, 2π) from the mooring point, so hulls a metre apart move out of step (no draw, no clock). */
export function mooredHullPhase(x: number, z: number): number {
  let h = (Math.imul(Math.round(x * 16), 73856093) ^ Math.imul(Math.round(z * 16), 19349663)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h / 4294967296) * TAU;
}

/** The hull's pose at `timeS` on the world clock; allocation-free (the caller owns `out`). */
export function mooredHullPose(timeS: number, phase: number, out: MooredHullPose): MooredHullPose {
  const p = MOORED_HULL_PERIODS_S;
  out.heave = MOORED_HULL_HEAVE_M * Math.sin(TAU * timeS / p.heave + phase)
    + MOORED_HULL_CHOP_M * Math.sin(TAU * timeS / p.chop + phase * 1.7);
  out.roll = MOORED_HULL_ROLL_RAD * Math.sin(TAU * timeS / p.roll + phase * 0.6);
  out.pitch = MOORED_HULL_PITCH_RAD * Math.sin(TAU * timeS / p.pitch + phase * 1.3);
  return out;
}
