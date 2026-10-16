// src/world/maps/regional/bretonGranary.ts — the Breton kit's granary (the base granary's footprint), extracted from
// breton.ts to be owned by props census #22 (Lane C, 2026-10-16; the coordinator's extract-then-own grant). The kit hands
// its own helpers in, so the granary builds in the Breton dialect exactly as it did in breton.ts.
import { PartSink, type RegionalBucket, type RegionalParts } from './geometry.ts';
import { buildHouse, type HouseDialect, type HouseFrame, type RoofSpec } from './house.ts';
import type { RegionalBuildContext } from './types.ts';

/** What the granary borrows from the Breton kit (breton.ts): its uv offset, state, roof, dialect, parapets and quoins. */
export interface BretonGranaryKit<S extends { rng: () => number; litShare: number }> {
  uvOffset(ctx: RegionalBuildContext): [number, number];
  stateFor(ctx: RegionalBuildContext): S;
  slate(pitch: number): RoofSpec;
  dialect(st: S): HouseDialect;
  gableParapets(sink: PartSink, frame: HouseFrame, stacks: number, rng: () => number): void;
  quoins(sink: PartSink, frame: HouseFrame): void;
}

/** A small granite outbuilding (the base granary's footprint). */
export function bretonGranary<S extends { rng: () => number; litShare: number }>(ctx: RegionalBuildContext,
  { uvOffset, stateFor, slate, dialect, gableParapets }: BretonGranaryKit<S>): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = { ...stateFor(ctx), wall: 'stone' as RegionalBucket };
  const W = Math.max(3.4, ctx.info.w - 0.6), D = Math.max(4.2, ctx.info.d - 1.6);
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: null, storeys: [{ h: 2.5, wall: 'stone' }], roof: slate(48), gableBucket: 'stone',
    openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.9 }], chimneys: [], gutters: null, verge: null,
  }, dialect({ ...st, litShare: 0 }));
  gableParapets(sink, frame, 0, st.rng);
  return sink.finish();
}
