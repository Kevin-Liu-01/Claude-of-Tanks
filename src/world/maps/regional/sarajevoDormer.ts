// src/world/maps/regional/sarajevoDormer.ts — the Austro-Hungarian block's dormer (sarajevo.ts ahBlock), extracted as it
// was (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder is taken extract-then-own)
// for this lane to rebuild on the r2 standard.
import type { PartSink } from './geometry.ts';
import { emitRoof, roofGeometry, type RoofGeometry, type RoofSpec } from './house.ts';
import { windowUnit, type WindowStyle } from './openings.ts';

/** The tiled roof's dormer on the street slope (the turned frame: the street is local -x). */
export function ahDormer(sink: PartSink, rg: RoofGeometry, eave: number, len: number, look: () => number, AH_WINDOW: WindowStyle): void {
        const dz = (look() - 0.5) * len * 0.4, ex = -rg.s, dw = 1.3;
        sink.span('plaster', ex - 0.05, eave - 0.3, dz - dw / 2, ex + 1.3, eave + 1.5, dz + dw / 2);
        const cap: RoofSpec = { kind: 'gable', pitchDeg: 40, eave: 0.12, verge: 0.12, thickness: 0.12, bucket: 'roof', ridge: 'round' };
        sink.placed(Math.PI / 2, ex + 0.62, 0, dz, () => emitRoof(sink, roofGeometry(dw + 0.12, 1.45, eave + 1.5, cap), cap));
        windowUnit(sink, { origin: [ex - 0.05, 0, dz], u: [0, 0, 1], out: [-1, 0, 0], width: dw }, 0, eave + 0.32, 0.75, 0.95, { ...AH_WINDOW, surround: null, sill: null }, look, 0.1);
}
