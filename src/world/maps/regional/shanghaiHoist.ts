// src/world/maps/regional/shanghaiHoist.ts — the godown's hoist beam and its tackle over the loading doors (shanghai.ts
// godown), extracted as they were (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its
// builder is taken extract-then-own) for this lane to rebuild on the r2 standard.
import { rgb, type PartSink } from './geometry.ts';
import { IRON } from './shanghaiParts.ts';

/** The hoist beam out of the street gable's parapet over the loading doors, and its tackle hanging from it. */
export function hoistTackle(sink: PartSink, eaveY: number, D: number): void {
    sink.member('structureWood', [0, eaveY + 0.9, D / 2 - 0.4], [0, eaveY + 0.9, D / 2 + 1.0], 0.22, 0.22, [0, 1, 0], { colour: rgb(0x3b3029), decor: true, exposed: true, shadow: true }, 0);
    sink.cylinder('structureMetal', [0, eaveY - 1.6, D / 2 + 0.85], 'y', 2.4, 0.015, 4, { colour: IRON, decor: true, fine: true });
}
