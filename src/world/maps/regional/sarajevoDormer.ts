// src/world/maps/regional/sarajevoDormer.ts — the Austro-Hungarian block's dormer (sarajevo.ts ahBlock; the looks lane's r2
// sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder was taken extract-then-own and rebuilt here).
//
// The r2 sweep found its casement a painted plate (rowhouse@sarajevo on Ruinspires: a glass pane laid flat on the
// dormer's plaster front). The front is now a wall with the casement cut through it, the reveal 12 cm deep, the
// casement set back in it (openings.ts windowUnit inside the reveal); the dormer's cheeks, back and floor stay its box.
import type { Face, PartSink } from './geometry.ts';
import { emitRoof, holedPolygon, roofGeometry, type RoofGeometry, type RoofSpec } from './house.ts';
import { windowUnit, type WindowStyle } from './openings.ts';

/** The cut casement's reveal (m). */
const REVEAL = 0.12;

/** The tiled roof's dormer on the street slope (the turned frame: the street is local -x). */
export function ahDormer(sink: PartSink, rg: RoofGeometry, eave: number, len: number, look: () => number, AH_WINDOW: WindowStyle): void {
  const dz = (look() - 0.5) * len * 0.4, ex = -rg.s, dw = 1.3;
  const x0 = ex - 0.05, x1 = ex + 1.3, y0 = eave - 0.3, y1 = eave + 1.5;
  // the cheeks, the back, the top and the foot (the box less its front)
  sink.box('plaster', [(x0 + x1) / 2, (y0 + y1) / 2, dz], [(x1 - x0) / 2, (y1 - y0) / 2, dw / 2], {}, undefined, { nx: true });
  const cap: RoofSpec = { kind: 'gable', pitchDeg: 40, eave: 0.12, verge: 0.12, thickness: 0.12, bucket: 'roof', ridge: 'round' };
  sink.placed(Math.PI / 2, ex + 0.62, 0, dz, () => emitRoof(sink, roofGeometry(dw + 0.12, 1.45, eave + 1.5, cap), cap));
  // the front: a wall with the casement cut through it, the casement at the back of its reveal
  const face: Face = { origin: [x0, 0, dz], u: [0, 0, 1], out: [-1, 0, 0], width: dw };
  const wy = eave + 0.32, ww = 0.75, wh = 0.95;
  holedPolygon(sink, 'plaster', face, [[-dw / 2, y0], [dw / 2, y0], [dw / 2, y1], [-dw / 2, y1]],
    [{ u0: -ww / 2, u1: ww / 2, y0: wy, y1: wy + wh }], REVEAL + 0.02, REVEAL);
  const prior = sink.recess;
  sink.recess = REVEAL;
  try {
    windowUnit(sink, face, 0, wy, ww, wh, { ...AH_WINDOW, surround: null, sill: null }, look, 0.1);
  } finally { sink.recess = prior; }
}
