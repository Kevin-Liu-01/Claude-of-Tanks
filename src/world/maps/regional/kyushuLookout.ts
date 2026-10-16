// src/world/maps/regional/kyushuLookout.ts — the hinomi-yagura's frame (kyushu.ts stack, the fire lookout form), extracted
// as it was (the looks lane's r2 follow-up, b-east, 2026-10-16: lane B is parked, so its builder is taken
// extract-then-own) for this lane to rebuild on the r2 standard.
import type { PartSink, RegionalBucket, Rgb } from './geometry.ts';
import { latticeFrame } from './lattice.ts';

/** The lookout's four legs on their footings, girts at every panel and X braces in each, recorded as a lattice. */
export function lookoutFrame(sink: PartSink, b0: number, b1: number, H: number, steel: Rgb, CEMENT: RegionalBucket, mobile: boolean): void {
  latticeFrame(sink, { foot: b0, head: b1, y0: 0, y1: H, size: 0.1, girt: 0.06, brace: 0.035, panels: Math.max(3, Math.round(H / 2.2)), bucket: 'structureMetal',
    colour: steel, pad: { bucket: CEMENT, size: 0.45, top: 0.2 }, mobile },
  { x0: -1.1, x1: 1.1, y0: H, y1: H + 2.3, z0: -1.1, z1: 1.1, bucket: 'structureMetal', tint: steel });
}
