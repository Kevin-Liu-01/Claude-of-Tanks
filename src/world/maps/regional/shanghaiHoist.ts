// src/world/maps/regional/shanghaiHoist.ts — the godown's hoist beam and its tackle over the loading doors (shanghai.ts
// godown), extracted (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder was taken
// extract-then-own) and rebuilt here: the r2 sweep found the tackle's fall hanging 10 cm under the beam (warehouse@shanghai,
// blackglass): the beam stands on its axis's line (sink.member lays it `depth` out of it), so the fall now runs up to
// the beam's underside, and its hook block hangs on its foot.
import { rgb, type PartSink } from './geometry.ts';
import { IRON } from './shanghaiParts.ts';

/** The hoist beam out of the street gable's parapet over the loading doors, and its tackle hanging from it. */
export function hoistTackle(sink: PartSink, eaveY: number, D: number): void {
    sink.member('structureWood', [0, eaveY + 0.9, D / 2 - 0.4], [0, eaveY + 0.9, D / 2 + 1.0], 0.22, 0.22, [0, 1, 0], { colour: rgb(0x3b3029), decor: true, exposed: true, shadow: true }, 0);
    // the fall from the beam's underside (the member stands from its axis up: eaveY + 0.9) down to the hook block
    sink.cylinder('structureMetal', [0, eaveY - 1.6, D / 2 + 0.85], 'y', 2.5 + 0.01, 0.015, 4, { colour: IRON, decor: true, fine: true });
    sink.cylinder('structureMetal', [0, eaveY - 1.78, D / 2 + 0.85], 'y', 0.2, 0.05, 6, { colour: IRON, decor: true, fine: true }, 0.035);
}
