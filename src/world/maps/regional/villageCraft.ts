// src/world/maps/regional/villageCraft.ts — the village houses' wall craft (the looks lane, 2026-10-15; WORKLIST #15, the
// vernacular block's village family: "mekong stiltHouse and bengal tinHouse rebuilt on buildHouse (framed board or mat
// panels, cut openings)", "kohima nagaHouse from members with a house plan", "all openings cut ... exteriorDetailKit's
// free-standing dark plates removed"). A framed wall's covering laid as what it is, round the openings the house grammar
// cut through it (house.ts buildHouse calls a dialect's dressWall on a framed storey):
//   - corrugated sheet: sheets a cover width wide, each its own livery (galvanised, rust-streaked, a painted patch), the
//     corrugation's ribs down them, the upper row lapping the lower, the frame's corner posts and plate showing;
//   - boards: vertical planks each its own tone, battens over their joints, a rail at the foot and under the plate;
//   - woven mat: panels of plaited bamboo held in a frame of poles, each panel its own weave's tone and its diagonal
//     weave in its own direction;
// and an unglazed opening's unit (a stilt house's, a Naga house's): its frame boards round the cut and its plank
// shutter hung from the head and propped open on a stick — the dark of the room behind is the cut's own.
// Pure geometry on the kit's part sink, decor all (the storey wall the house builds keeps the collision).
import { faceBox, facePoint, shade, type Face, type Rgb, type Vec3, type PartSink } from './geometry.ts';
import type { Opening, WallRect } from './house.ts';

/** An opening's rectangle on its face (u along it, y up), grown by its casing: `margin` round a window, the door unit's
 *  own frame round a door (doorUnit frames it; a window's unit stands in the cut and the casing is the wall's). */
interface Hole { u0: number; u1: number; y0: number; y1: number; door: boolean }
const DOOR_FRAME_M = 0.12;
function holesOf(openings: readonly Opening[], rect: WallRect, margin: number): Hole[] {
  return openings.map((o) => {
    const door = o.kind === 'door' || o.kind === 'gate' || o.kind === 'shopfront', m = door ? DOOR_FRAME_M : margin;
    return { u0: o.u - o.w / 2 - m, u1: o.u + o.w / 2 + m, y0: rect.y0 + o.y0 - (door ? 0 : m), y1: rect.y0 + o.y0 + o.h + m, door };
  });
}

/** [y0, y1] less the holes over the column (u0, u1): the free heights. */
function freeHeights(y0: number, y1: number, holes: readonly Hole[], u0: number, u1: number, min = 0.05): Array<[number, number]> {
  let out: Array<[number, number]> = [[y0, y1]];
  for (const h of holes) {
    if (h.u1 <= u0 + 1e-4 || h.u0 >= u1 - 1e-4) continue;
    const next: Array<[number, number]> = [];
    for (const [a, b] of out) {
      if (h.y1 <= a || h.y0 >= b) { next.push([a, b]); continue; }
      if (h.y0 > a) next.push([a, h.y0]);
      if (h.y1 < b) next.push([h.y1, b]);
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a >= min);
}

/** The wall cut into columns at `pitch` and at every hole's sides: each column's free heights. */
function columns(rect: WallRect, holes: readonly Hole[], pitch: number, inset: number): Array<{ u0: number; u1: number; k: number; free: Array<[number, number]> }> {
  const a = rect.u0 + inset, b = rect.u1 - inset;
  const cuts = new Set<number>([a, b]);
  const n = Math.max(1, Math.round((b - a) / pitch));
  for (let k = 1; k < n; k++) cuts.add(a + (b - a) * k / n);
  for (const h of holes) for (const u of [h.u0, h.u1]) if (u > a && u < b) cuts.add(u);
  const us = [...cuts].sort((p, q) => p - q), out: Array<{ u0: number; u1: number; k: number; free: Array<[number, number]> }> = [];
  for (let i = 0; i + 1 < us.length; i++) {
    const u0 = us[i], u1 = us[i + 1];
    if (u1 - u0 < 0.03) continue;
    // the sheet (board, panel) this column belongs to: by its middle, on the pitch's grid
    const k = Math.floor(((u0 + u1) / 2 - a) / ((b - a) / n));
    out.push({ u0, u1, k, free: freeHeights(rect.y0, rect.y1, holes, u0, u1) });
  }
  return out;
}

/** A sheet's livery: its own shade of the wall's, one in five a patch of another (`patch`). */
export type SheetLivery = (k: number) => Rgb;

/**
 * Corrugated sheet on a framed wall: sheets `cover` wide from the foot to the plate, a second row lapping the first
 * over 1.8 m, each sheet its own livery, its ribs down it (fine joinery), the frame's corner posts and the wall plate
 * proud of the sheets at the head. `holes` the openings, their casings `margin` wide.
 */
export function corrugatedCladding(sink: PartSink, face: Face, rect: WallRect, openings: readonly Opening[], livery: SheetLivery,
  frame: Rgb, opts: { mobile: boolean; cover?: number; margin?: number }): void {
  const cover = opts.cover ?? 0.76, margin = opts.margin ?? 0.07;
  const holes = holesOf(openings, rect, margin);
  const lap = rect.y1 - rect.y0 > 2.2 ? rect.y0 + 1.8 : null;
  for (const col of columns(rect, holes, cover, 0.1)) {
    for (const [a, b] of col.free) {
      // the lower row and, over the lap, the upper row a sheet's thickness further out (a short length — over a window,
      // under one — is one sheet cut to it, in the wall's own livery: no dark offcut stands proud alone)
      const split = lap !== null && a < lap - 0.4 && b > lap + 0.4;
      const rows: Array<[number, number, number]> = split ? [[a, lap! + 0.08, 0.0], [lap!, b, 0.006]] : [[a, b, 0]];
      for (const [y0, y1, o] of rows) {
        const colour = y1 - y0 < 1.0 ? livery(-1) : livery(col.k * 2 + (o > 0 ? 1 : 0));
        faceBox(sink, 'structureMetal', face, (col.u0 + col.u1) / 2, (y0 + y1) / 2, 0.009 + o, col.u1 - col.u0 - 0.004, y1 - y0, 0.012, { colour, decor: true }, 'caps');
        if (opts.mobile) continue;
        // the ribs: the corrugation's crowns catching the light, every 15 cm across the sheet
        const rib = shade(colour, 1.12);
        for (let u = col.u0 + 0.075; u < col.u1 - 0.04; u += 0.15) {
          faceBox(sink, 'structureMetal', face, u, (y0 + y1) / 2, 0.018 + o, 0.022, y1 - y0 - 0.01, 0.008, { colour: rib, decor: true, fine: true }, { back: true, top: true, bottom: true });
        }
      }
    }
  }
  // the frame showing: the corner posts and the plate under the eave, and the casings round the openings
  for (const u of [rect.u0 + 0.05, rect.u1 - 0.05]) faceBox(sink, 'structureWood', face, u, (rect.y0 + rect.y1) / 2, 0.03, 0.1, rect.y1 - rect.y0, 0.06, { colour: frame, decor: true }, 'caps');
  faceBox(sink, 'structureWood', face, 0, rect.y1 - 0.06, 0.035, rect.u1 - rect.u0, 0.12, 0.07, { colour: shade(frame, 0.9), decor: true }, 'ends');
  casings(sink, face, holes, frame);
}

/**
 * Vertical boards on a framed wall: each plank its own tone (`board`), a batten over each joint (fine), a rail at the
 * foot and one under the plate, the casings round the openings.
 */
export function boardCladding(sink: PartSink, face: Face, rect: WallRect, openings: readonly Opening[], board: (k: number) => Rgb,
  frame: Rgb, opts: { mobile: boolean; width?: number; margin?: number }): void {
  const width = opts.width ?? 0.24, margin = opts.margin ?? 0.07;
  const holes = holesOf(openings, rect, margin);
  for (const col of columns(rect, holes, width, 0.04)) {
    for (const [a, b] of col.free) {
      faceBox(sink, 'structureWood', face, (col.u0 + col.u1) / 2, (a + b) / 2, 0.012, col.u1 - col.u0 - 0.006, b - a, 0.022, { colour: board(col.k), decor: true }, 'caps');
    }
  }
  if (!opts.mobile) {
    const step = (rect.u1 - rect.u0 - 0.08) / Math.max(1, Math.round((rect.u1 - rect.u0 - 0.08) / width));
    for (let u = rect.u0 + 0.04 + step; u < rect.u1 - 0.05; u += step) {
      for (const [a, b] of freeHeights(rect.y0 + 0.12, rect.y1 - 0.14, holes, u - 0.025, u + 0.025)) {
        faceBox(sink, 'structureWood', face, u, (a + b) / 2, 0.03, 0.045, b - a, 0.018, { colour: shade(frame, 0.92), decor: true, fine: true }, 'caps');
      }
    }
  }
  for (const y of [rect.y0 + 0.07, rect.y1 - 0.08]) {
    for (const [u0, u1] of spansAlong(rect, holes, y)) faceBox(sink, 'structureWood', face, (u0 + u1) / 2, y, 0.032, u1 - u0, 0.13, 0.04, { colour: frame, decor: true }, 'ends');
  }
  casings(sink, face, holes, frame);
}

/**
 * Woven bamboo mat panels in a frame of poles: the wall in bays between posts, each bay's mat its own tone and weave
 * direction (two layers of diagonal splints, fine joinery near the camera), the poles round each bay, the casings.
 */
export function matCladding(sink: PartSink, face: Face, rect: WallRect, openings: readonly Opening[], mat: (k: number) => Rgb,
  pole: Rgb, opts: { mobile: boolean; bay?: number; margin?: number }): void {
  const bay = opts.bay ?? 1.2, margin = opts.margin ?? 0.08;
  const holes = holesOf(openings, rect, margin);
  for (const col of columns(rect, holes, bay, 0.06)) {
    const tone = mat(col.k);
    for (const [a, b] of col.free) {
      faceBox(sink, 'structureWood', face, (col.u0 + col.u1) / 2, (a + b) / 2, 0.01, col.u1 - col.u0, b - a, 0.016, { colour: tone, decor: true }, 'caps');
      if (opts.mobile) continue;
      // the weave: splints laid diagonally across the panel, a hand apart, each panel's the other way to its
      // neighbour's (a flat strip a hair proud: two triangles a splint)
      const dir = col.k % 2 ? 1 : -1, h = b - a, step = 0.2, sw = 0.03;
      const spl = { colour: shade(tone, 1.12), decor: true, fine: true } as const;
      for (let c = col.u0 - h + step / 2; c < col.u1; c += step) {
        const ya = a + Math.max(0, col.u0 - c), yb = a + Math.min(h, col.u1 - c);
        if (yb - ya < 0.09) continue;
        let ua = c + (ya - a), ub = c + (yb - a);
        if (dir < 0) { ua = col.u0 + col.u1 - ua; ub = col.u0 + col.u1 - ub; }
        const du = (ub - ua) / Math.hypot(ub - ua, yb - ya), dy = (yb - ya) / Math.hypot(ub - ua, yb - ya);
        const nu = -dy * sw / 2, ny = du * sw / 2;
        const q = [facePoint(face, ua - nu, ya - ny, 0.02), facePoint(face, ub - nu, yb - ny, 0.02), facePoint(face, ub + nu, yb + ny, 0.02), facePoint(face, ua + nu, ya + ny, 0.02)];
        // (counter-clockwise in the face's u, y: it faces out of the wall)
        sink.quad('structureWood', q[0], q[1], q[2], q[3], spl);
      }
    }
  }
  // the frame: a pole at each bay's side and along the foot and the head
  const n = Math.max(1, Math.round((rect.u1 - rect.u0 - 0.12) / bay));
  for (let k = 0; k <= n; k++) {
    const u = rect.u0 + 0.06 + (rect.u1 - rect.u0 - 0.12) * k / n;
    for (const [a, b] of freeHeights(rect.y0, rect.y1, holes, u - 0.04, u + 0.04)) {
      sink.member('structureWood', facePoint(face, u, a, 0.04), facePoint(face, u, b, 0.04), 0.08, 0.08, face.out, { colour: pole, decor: true, exposed: true }, 0.02);
    }
  }
  for (const y of [rect.y0 + 0.05, rect.y1 - 0.06]) {
    for (const [u0, u1] of spansAlong(rect, holes, y)) sink.member('structureWood', facePoint(face, u0, y, 0.045), facePoint(face, u1, y, 0.045), 0.07, 0.07, face.out,
      { colour: shade(pole, 0.94), decor: true, exposed: true }, 0.02);
  }
  casings(sink, face, holes, pole);
}

/** The free stretches of a line across the wall at height y (between the holes it meets). */
function spansAlong(rect: WallRect, holes: readonly Hole[], y: number): Array<[number, number]> {
  const cut = holes.filter((h) => y > h.y0 && y < h.y1).map((h) => [h.u0, h.u1] as const).sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let cur = rect.u0;
  for (const [a, b] of [...cut, [rect.u1, rect.u1] as const]) {
    if (a - cur > 0.1) out.push([cur, a]);
    cur = Math.max(cur, b);
  }
  return out;
}

/** Board casings round each opening's cut: two jambs, the head and (a window) the sill board, proud of the cladding. */
function casings(sink: PartSink, face: Face, holes: readonly Hole[], colour: Rgb): void {
  for (const h of holes) {
    if (h.door) continue;
    const c = { colour: shade(colour, 0.95), decor: true } as const, t = 0.07;
    faceBox(sink, 'structureWood', face, h.u0 + t / 2, (h.y0 + h.y1) / 2, 0.04, t, h.y1 - h.y0, 0.05, c);
    faceBox(sink, 'structureWood', face, h.u1 - t / 2, (h.y0 + h.y1) / 2, 0.04, t, h.y1 - h.y0, 0.05, c);
    faceBox(sink, 'structureWood', face, (h.u0 + h.u1) / 2, h.y1 - t / 2, 0.045, h.u1 - h.u0 + 0.06, t, 0.06, c);
    faceBox(sink, 'structureWood', face, (h.u0 + h.u1) / 2, h.y0 + 0.03, 0.05, h.u1 - h.u0 + 0.04, 0.06, 0.08, c);
  }
}

/**
 * An unglazed opening's unit (a stilt house's, a hill house's): in its cut (sink.recess: the reveal) a plank shutter hung
 * from a rail at the head, swung out sixty degrees and propped on a stick from the sill; the room's dark is the cut's.
 * (u, y) the clear opening's bottom centre.
 */
export function proppedShutter(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, colour: Rgb, mobile: boolean): void {
  const P = (uu: number, yy: number, o: number): Vec3 => facePoint(face, uu, yy, o);
  const leaf = { colour, decor: true } as const;
  sink.member('structureWood', P(u - w / 2 - 0.05, y + h + 0.03, 0.03), P(u + w / 2 + 0.05, y + h + 0.03, 0.03), 0.06, 0.05, face.out, { ...leaf, colour: shade(colour, 0.8), exposed: true });
  const swing = Math.PI / 3, len = h * 0.95, hy = y + h + 0.02;
  const along = (t: number): Vec3 => P(u, hy - len * t * Math.cos(swing), 0.05 + len * t * Math.sin(swing));
  const nrm: Vec3 = [face.out[0] * Math.cos(swing), Math.sin(swing), face.out[2] * Math.cos(swing)];
  // the leaf: three boards, their two ledges across the back
  const boards = 3;
  for (let k = 0; k < boards; k++) {
    const du = -w / 2 + w * (k + 0.5) / boards;
    const a = along(0), b = along(1);
    sink.member('structureWood', [a[0] + face.u[0] * du, a[1], a[2] + face.u[2] * du], [b[0] + face.u[0] * du, b[1], b[2] + face.u[2] * du], w / boards - 0.008, 0.03, nrm,
      { colour: shade(colour, 0.94 + 0.06 * k), decor: true, exposed: true }, 0.015);
  }
  if (!mobile) for (const t of [0.2, 0.8]) {
    const c = along(t), back: Vec3 = [c[0] - nrm[0] * 0.03, c[1] - nrm[1] * 0.03, c[2] - nrm[2] * 0.03];
    sink.member('structureWood', [back[0] - face.u[0] * w / 2, back[1], back[2] - face.u[2] * w / 2], [back[0] + face.u[0] * w / 2, back[1], back[2] + face.u[2] * w / 2],
      0.07, 0.025, nrm, { colour: shade(colour, 0.75), decor: true, exposed: true, fine: true }, 0.012);
  }
  const stick = along(0.85);
  sink.member('structureWood', P(u + w * 0.3, y, 0.06), [stick[0] + face.u[0] * w * 0.3, stick[1], stick[2] + face.u[2] * w * 0.3], 0.025, 0.025, face.u,
    { colour: shade(colour, 0.7), decor: true, exposed: true, fine: true }, 0.0125);
}
