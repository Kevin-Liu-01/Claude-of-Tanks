// src/world/maps/regional/sarajevoRoofs.ts — the Austro-Hungarian block's attic oculus and its mansard's dormers (sarajevo.ts
// ahBlock, mansard), extracted (the looks lane's r2 follow-up, b-east, 2026-10-16: lane B is parked, so its builders were
// taken extract-then-own) and rebuilt here. Both read as painted plates in the forms the sweep did not grade (the rowhouse's
// representative was a tiled block): the oculus a dark oval laid on the attic gable, each dormer's casement a pane laid
// on its plaster front. The oculus now has its moulded surround standing 14 cm off the gable, the reveal running back
// inside it to the glass; each dormer's front is a wall with the casement cut through it, 12 cm deep, the casement set back.
import { LocalFrame, facePoint, type Face, type PartSink, type Rgb, type Vec3 } from './geometry.ts';
import { emitRoof, holedPolygon, roofGeometry, type RoofSpec } from './house.ts';
import { windowUnit, type WindowStyle } from './openings.ts';

/** The oculus's surround: its width round the light and its stand off the gable (m). */
const RIM = 0.1, DEEP = 0.14;

/**
 * The Secession attic gable's oval window: a moulded stone surround (its face, its outer side down to the gable, the
 * reveal inside it) round the light, the glass at the reveal's back on the gable's face.
 */
export function atticOculus(sink: PartSink, face: Face, eave: number): void {
  const n = 10, cy = eave + 1.0, rx = 0.42, ry = 0.55;
  const ring = (k: number, o: number): Vec3[] => Array.from({ length: n }, (_, j) => {
    const t = (j / n) * Math.PI * 2;
    return facePoint(face, Math.cos(t) * (rx + k), cy + Math.sin(t) * (ry + k), o);
  });
  const outerBack = ring(RIM, 0), outerFace = ring(RIM, DEEP), innerFace = ring(0, DEEP), innerBack = ring(0, 0.02);
  const stone = { decor: true };
  for (let j = 0; j < n; j++) {
    const i = (j + 1) % n;
    // (the ring runs counter-clockwise seen from out of the face: each band wound to face out of its own surface)
    sink.quad('stone', outerFace[j], outerFace[i], innerFace[i], innerFace[j], stone);
    sink.quad('stone', outerBack[j], outerBack[i], outerFace[i], outerFace[j], stone);
    sink.quad('stone', innerFace[j], innerFace[i], innerBack[i], innerBack[j], stone);
  }
  sink.polygon('glass', innerBack, { decor: true, window: face.out });
}

/** The cut casement's reveal (m). */
const REVEAL = 0.12;

/** One of the zinc mansard's dormers in its street slope (the turned frame: the street is local -x). */
export function mansardDormer(sink: PartSink, x0: number, x1: number, e: number, dz: number, dw: number, look: () => number, style: WindowStyle): void {
  const y0 = e + 0.35, y1 = e + 2.05;
  // the cheeks, the back, the top and the foot (the box less its front)
  sink.box('plaster', [(x0 + x1) / 2, (y0 + y1) / 2, dz], [(x1 - x0) / 2, (y1 - y0) / 2, dw / 2], { decor: true }, undefined, { nx: true });
  const cap: RoofSpec = { kind: 'gable', pitchDeg: 38, eave: 0.1, verge: 0.1, thickness: 0.1, bucket: 'roof', ridge: null };
  sink.placed(Math.PI / 2, (x0 + x1) / 2, 0, dz, () => emitRoof(sink, roofGeometry(dw + 0.1, x1 - x0, e + 2.05, cap), { ...cap, decor: true }));
  // the front: a wall with the casement cut through it, the casement at the back of its reveal
  const face: Face = { origin: [x0, 0, dz], u: [0, 0, 1], out: [-1, 0, 0], width: dw };
  const wy = e + 0.6, ww = 0.7, wh = 1.0;
  holedPolygon(sink, 'plaster', face, [[-dw / 2, y0], [dw / 2, y0], [dw / 2, y1], [-dw / 2, y1]], [{ u0: -ww / 2, u1: ww / 2, y0: wy, y1: wy + wh }],
    REVEAL + 0.02, REVEAL, { decor: true });
  const prior = sink.recess;
  sink.recess = REVEAL;
  try {
    windowUnit(sink, face, 0, wy, ww, wh, style, look, 0.1);
  } finally { sink.recess = prior; }
}

/** The doksat's casements' reveal (m). */
const BAY_REVEAL = 0.1;

/**
 * The mahala house's doksat (its bay of windows under the eaves, `dd` out of the upper storey): its box less its front,
 * the front a wall with a casement cut through it a pane, each casement set back in its reveal (they were panes laid on
 * the bay's plaster: the rowhouse forms the sweep did not grade).
 */
export function doksatBay(sink: PartSink, up: Face, du: number, dw: number, dd: number, yb: number, yt: number, look: () => number, lit: number,
  DARK_FRAME: Rgb): Face {
  // the box's sides, top and foot (faceBox's frame: x along the face, y up, z out; its back is the wall, its front the cut wall)
  const centre = facePoint(up, du, (yb + yt) / 2, dd / 2);
  sink.box('plaster', centre, [dw / 2, (yt - yb) / 2, dd / 2], { decor: true }, new LocalFrame(up.u, [0, 1, 0], up.out, [0, 0, 0]), { pz: true, nz: true });
  const bay: Face = { origin: [up.origin[0] + up.out[0] * dd, 0, up.origin[2] + up.out[2] * dd], u: up.u, out: up.out, width: dw };
  const panes = Math.max(3, Math.round(dw / 0.62)), pw = dw / panes - 0.16, ph = Math.min(1.05, yt - yb - 0.8), py = yb + 0.55;
  const holes = Array.from({ length: panes }, (_, k) => {
    const pu = du - dw / 2 + (k + 0.5) * dw / panes;
    return { u0: pu - pw / 2, u1: pu + pw / 2, y0: py, y1: py + ph };
  });
  holedPolygon(sink, 'plaster', bay, [[du - dw / 2, yb], [du + dw / 2, yb], [du + dw / 2, yt], [du - dw / 2, yt]], holes, BAY_REVEAL + 0.02, BAY_REVEAL, { decor: true });
  const prior = sink.recess;
  sink.recess = BAY_REVEAL;
  try {
    for (let k = 0; k < panes; k++) {
      const pu = du - dw / 2 + (k + 0.5) * dw / panes;
      windowUnit(sink, bay, pu, py, pw, ph, { frame: DARK_FRAME, frameWidth: 0.05, frameOut: 0.03, bars: 'cross', surround: null, sill: null, shutters: null }, look, lit);
    }
  } finally { sink.recess = prior; }
  return bay;
}
