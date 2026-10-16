// src/world/maps/regional/glencanyonPads.ts — the Glen Canyon yards' pads (glencanyon.ts switchyard, transformerYard),
// extracted as they were (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builders are
// taken extract-then-own; agreed with HORIZONS, whose Skybridge port is in integ/226) for this lane to rebuild.
import type { EmitOptions, PartSink, RegionalBucket } from './geometry.ts';

/** A yard's pad over its plot, W x D, from 0.4 m down to 8 cm over the grade. */
export function yardPad(sink: PartSink, bucket: RegionalBucket, W: number, D: number, opts: EmitOptions): void {
  sink.span(bucket, -W / 2, -0.4, -D / 2, W / 2, 0.08, D / 2, opts);
}
