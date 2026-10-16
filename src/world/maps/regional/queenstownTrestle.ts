// src/world/maps/regional/queenstownTrestle.ts — the tank trestle's deck (queenstown.ts tankTrestle), extracted as it was
// (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder is taken extract-then-own)
// for this lane to rebuild on the r2 standard.
import type { PartSink, Rgb } from './geometry.ts';

/** The trestle's deck over its bearers, P square at legH. */
export function trestleDeck(sink: PartSink, P: number, legH: number, colour: Rgb): void {
    sink.span('structureWood', -P / 2, legH + 0.14, -P / 2, P / 2, legH + 0.3, P / 2, { colour });
}
