// src/world/maps/regional/glencanyonPads.ts — the Glen Canyon yards' pads (glencanyon.ts switchyard, transformerYard),
// extracted (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builders were taken
// extract-then-own; agreed with HORIZONS, whose Skybridge port is in integ/226) and rebuilt here.
//
// The r2 sweep measured both yards 0.78-0.79 plain boxes by area (terracetower and parkingdeck@glencanyon on Skybridge):
// the pad a bare slab the yard wide, its buried underside alone a third of the yard's surface. A pad is now its kerb and
// its bed: a concrete kerb round the yard's edge standing 8 cm over the bed, its inner face down to the bed (crushed rock
// or the concrete slab) laid inside it, the kerb's footing sunk 0.4 m. Dressing, as before (the yards' collision is their
// structures').
import type { EmitOptions, PartSink, RegionalBucket, Vec3 } from './geometry.ts';

/** The kerb's width and its rise over the bed (m). */
const KERB_W = 0.25, KERB_RISE = 0.08;

/** A yard's pad over its plot, W x D: the kerb round it from 0.4 m down to its head, the bed inside at 8 cm over the grade. */
export function yardPad(sink: PartSink, bucket: RegionalBucket, W: number, D: number, opts: EmitOptions): void {
  const bed = 0.08, head = bed + KERB_RISE;
  // the plan rings counter-clockwise from above (rect order: the +z edge first, toward +x), `o` proud of the plot's edge
  const ring = (o: number, y: number): Vec3[] => [[-W / 2 - o, y, D / 2 + o], [W / 2 + o, y, D / 2 + o], [W / 2 + o, y, -D / 2 - o], [-W / 2 - o, y, -D / 2 - o]];
  const section: Array<[number, number]> = [[0, -0.4], [0, head], [-KERB_W, head], [-KERB_W, bed]];
  const rings = section.map(([o, y]) => ring(o, y));
  for (let k = 0; k + 1 < rings.length; k++) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      sink.quad(bucket, rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i], opts);
    }
  }
  // the bed inside the kerb, the footing's underside closing it
  sink.polygon(bucket, rings[rings.length - 1], opts);
  sink.polygon(bucket, [...rings[0]].reverse(), opts);
}
