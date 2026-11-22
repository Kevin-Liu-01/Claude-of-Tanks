// src/world/footings.ts — a support's footing read from the ground under its own footprint (bridge-footings-275).
//
// The owner, 2026-11-21, on Aegis Crossing's Puente Nuevo: "its supports need to have proper foundations going through
// bottom of land". The viaduct's body stood on one footing for the whole bridge, read at the deck's centre, and every
// pier over a lower stretch of the gorge floor hung 2.5-5.9 m in the air. A pier, an abutment, a bent's sill or a base
// plate reads the lowest ground over its own rectangle here and goes FOOTING_EMBED_M under it. A builder whose authored
// depth already lies deeper keeps it (a support only ever reaches down), so a footing buried in rock is unchanged.
//
// Each footing is recorded with its rectangle, so a receipt checks it against the ground read densely
// (supportFootings.selftest.mjs) and against the geometry and collision built on it.
//
// Authored by Kevin B. Liu (NOTICE.md).

/** A footing goes this far under the lowest ground beneath its support. */
export const FOOTING_EMBED_M = 1.2;
/** The ground under a support is read at most this far apart, its corners and edges included. */
const FOOTING_SAMPLE_M = 0.5;

/** One support as built: its rectangle in the frame its builder reads the ground in (x, z), and its base (y0). */
export interface SupportFooting {
  label: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  y0: number;
}

/** The ground's height at a point of a builder's frame. */
export type FrameGround = (x: number, z: number) => number;

/** The lowest ground over the rectangle [x0, x1] x [z0, z1], read at most FOOTING_SAMPLE_M apart. */
export function lowestGroundUnder(ground: FrameGround, x0: number, x1: number, z0: number, z1: number): number {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), az = Math.min(z0, z1), bz = Math.max(z0, z1);
  const nx = Math.max(1, Math.ceil((bx - ax) / FOOTING_SAMPLE_M)), nz = Math.max(1, Math.ceil((bz - az) / FOOTING_SAMPLE_M));
  let low = Infinity;
  for (let i = 0; i <= nx; i++) {
    const x = ax + (bx - ax) * i / nx;
    for (let k = 0; k <= nz; k++) low = Math.min(low, ground(x, az + (bz - az) * k / nz));
  }
  return low;
}

/**
 * A builder's footings: each support reads the lowest ground under its rectangle and stands `embed` under it, or at its
 * authored depth where that lies deeper. Every footing taken is kept in `list`, in the order taken.
 */
export class Footings {
  readonly list: SupportFooting[] = [];
  private readonly ground: FrameGround;
  constructor(ground: FrameGround) { this.ground = ground; }

  /** The base of the support over [x0, x1] x [z0, z1]: `embed` under its lowest ground, or `authored` if deeper. */
  under(label: string, x0: number, x1: number, z0: number, z1: number, authored = Infinity, embed = FOOTING_EMBED_M): number {
    const y0 = Math.min(authored, lowestGroundUnder(this.ground, x0, x1, z0, z1) - embed);
    this.list.push({ label, x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0 });
    return y0;
  }
}
