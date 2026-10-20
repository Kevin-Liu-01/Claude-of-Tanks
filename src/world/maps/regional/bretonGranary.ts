// src/world/maps/regional/bretonGranary.ts — the Breton kit's granary (the base granary's footprint), extracted from
// breton.ts to be owned by props census #22 (Lane C, 2026-10-16; the coordinator's extract-then-own grant). The kit hands
// its own helpers in, so the granary builds in the Breton dialect exactly as it did in breton.ts.
import { PartSink, faceBox, shade, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit } from './openings.ts';
import type { RegionalBuildContext } from './types.ts';

/** What the granary borrows from the Breton kit (breton.ts): its uv offset, state, roof, dialect, parapets and quoins. */
interface BretonGranaryKit<S extends { rng: () => number; litShare: number; paint: Rgb }> {
  uvOffset(ctx: RegionalBuildContext): [number, number];
  stateFor(ctx: RegionalBuildContext): S;
  slate(pitch: number): RoofSpec;
  dialect(st: S): HouseDialect;
  gableParapets(sink: PartSink, frame: HouseFrame, stacks: number, rng: () => number): void;
  quoins(sink: PartSink, frame: HouseFrame): void;
}

/**
 * A small granite outbuilding (the base granary's footprint). (Props census #22, Lane C 2026-10-16: "the other three
 * walls are blank, there is no plinth ... no quoins, no lintel or surround on the door, and no vent".) It stands on its
 * granite plinth, its door in a dressed surround under a monolith lintel with its step, a slit vent cut through each
 * eave wall and a loft hatch through the back, the Breton quoins up its corners and its gable parapets.
 */
export function bretonGranary<S extends { rng: () => number; litShare: number; paint: Rgb }>(ctx: RegionalBuildContext,
  { uvOffset, stateFor, slate, dialect, gableParapets, quoins }: BretonGranaryKit<S>): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = { ...stateFor(ctx), wall: 'stone' as RegionalBucket };
  const W = Math.max(3.4, ctx.info.w - 0.6), D = Math.max(4.2, ctx.info.d - 1.6), plinth = 0.3, dw = 0.9, dh = 1.9;
  const base = dialect({ ...st, litShare: 0 });
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: 0, w: dw, y0: 0, h: dh },
    { face: 'right', storey: 0, kind: 'loft', u: 0, w: 0.14, y0: 1.1, h: 0.62 },
    { face: 'left', storey: 0, kind: 'loft', u: 0, w: 0.14, y0: 1.1, h: 0.62 },
    { face: 'back', storey: 0, kind: 'loft', u: 0, w: 0.6, y0: 1.35, h: 0.6 },
  ];
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: plinth, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.3, wall: 'stone' }], roof: slate(48), gableBucket: 'stone',
    openings, chimneys: [], gutters: null, verge: null, reveal: 0.35, core: 'stone',
  }, {
    ...base,
    // the slits are left empty (their reveals and the dark of the store); the hatch takes its plank leaf
    window: (s, face, o, y0) => {
      if (o.w >= 0.3) doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(st.paint, 0.7), frame: { bucket: 'stone', width: 0.14, out: 0.05 }, steps: null, leafKind: 'plank' });
    },
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: shade(st.paint, 0.75), frame: { bucket: 'stone', width: 0.22, out: 0.06 }, transom: false, steps: { bucket: 'stone' }, leafKind: 'plank',
    }, plinth),
  });
  gableParapets(sink, frame, 0, st.rng);
  quoins(sink, frame);
  // the monolith lintel over the door's dressed jambs
  const f = frame.faces.front;
  faceBox(sink, 'stone', f, 0, frame.floors[0] + dh + 0.22 + 0.15, 0.045, dw + 0.44 + 0.34, 0.3, 0.1, { decor: true, fineSides: true, shade: 1.05 });
  return sink.finish();
}
