// src/world/maps/regional/sarajevoRoofs.ts — the Austro-Hungarian block's attic oculus and its mansard's dormers (sarajevo.ts
// ahBlock, mansard), extracted as they were (the looks lane's r2 follow-up, b-east, 2026-10-16: lane B is parked, so its
// builders are taken extract-then-own) for this lane to rebuild on the r2 standard.
import { facePoint, type Face, type PartSink } from './geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from './house.ts';
import { windowUnit, type WindowStyle } from './openings.ts';

/** The Secession attic gable's oval window. */
export function atticOculus(sink: PartSink, face: Face, eave: number): void {
        sink.polygon('dark', Array.from({ length: 10 }, (_, j) => {
          const t = (j / 10) * Math.PI * 2;
          return facePoint(face, Math.cos(t) * 0.42, eave + 1.0 + Math.sin(t) * 0.55, 0.02);
        }), { decor: true });
}

/** One of the zinc mansard's dormers in its street slope (the turned frame: the street is local -x). */
export function mansardDormer(sink: PartSink, x0: number, x1: number, e: number, dz: number, dw: number, look: () => number, style: WindowStyle): void {
    sink.span('plaster', x0, e + 0.35, dz - dw / 2, x1, e + 2.05, dz + dw / 2, { decor: true });
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 38, eave: 0.1, verge: 0.1, thickness: 0.1, bucket: 'roof', ridge: null };
    sink.placed(Math.PI / 2, (x0 + x1) / 2, 0, dz, () => emitRoof(sink, roofGeometry(dw + 0.1, x1 - x0, e + 2.05, cap), { ...cap, decor: true }));
    windowUnit(sink, { origin: [x0, 0, dz], u: [0, 0, 1], out: [-1, 0, 0], width: dw }, 0, e + 0.6, 0.7, 1.0, style, look, 0.1);
}
