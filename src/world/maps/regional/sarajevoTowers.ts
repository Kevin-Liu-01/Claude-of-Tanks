// src/world/maps/regional/sarajevoTowers.ts — the Sarajevo kit's high-rises (sarajevo.ts), each in the footprint of the
// megacity landmark it replaces so the skyline along the boulevard stays vertical:
//   - arcology → the UNIS twin towers at Marijin Dvor ("Momo and Uzeir"): two square towers with chamfered corners in a
//     curtain wall of dark bronze glass on a shared lobby, gutted by fire, most of their glass gone to the dark floors;
//   - megatower on the boulevard → the parliament's tower: a slab behind a grid of concrete fins, its burnt floors
//     black, in front of the low assembly wing; up the slope → an estate tower;
//   - needletower → the Holiday Inn: an ochre cube of rendered panels on a brown-glazed podium, its windows punched in a
//     grid and brown-framed, many dark, the front-line face shelled, the hotel's sign frame on the roof;
//   - terracetower → the estates' towers (Alipašino Polje, Mojmilo): a cross-plan tower of concrete panels, the
//     loggias' coloured parapets stacked up its arms, burnt flats, shell holes;
//   - parkingdeck → a Grbavica slab block: a long slab of concrete with its loggias in a grid along the front, the
//     stair towers' glazing down the back;
//   - broadcasttower → the Oslobođenje newspaper's tower: two concrete cores standing out of the collapsed tower, slabs
//     hanging between them, over the print works that kept the paper coming out.
// Collision: every tower's structure is a few prisms (the cores, the slabs, the podium), so its shell bands merge; the
// facades are dressing.
import { PartSink, faceBox, facePanel, normalize3, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { paneBucket } from './openings.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  CHAR, IRON, PANEL_PAINTS, ROLL_SHUTTER, choose, clampTo, fillOf, shellHole, shellPocks, sootBand, unhcrSheet,
} from './sarajevoParts.ts';

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The faces of a convex plan (counter-clockwise seen from above): one wall face per edge. */
function planFaces(points: ReadonlyArray<readonly [number, number]>): Face[] {
  const out: Face[] = [];
  for (let i = 0; i < points.length; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % points.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 0.05) continue;
    const u: Vec3 = [(bx - ax) / len, 0, (bz - az) / len];
    out.push({ origin: [(ax + bx) / 2, 0, (az + bz) / 2], u, out: [-u[2], 0, u[0]], width: len });
  }
  return out;
}

/** A plan prism from y0 to y1 (points counter-clockwise seen from above). */
function planPrism(sink: PartSink, bucket: RegionalBucket, points: ReadonlyArray<readonly [number, number]>, y0: number, y1: number, opts = {}): void {
  sink.prism(bucket, points.map(([x, z]): Vec3 => [x, y0, z]), [0, 1, 0], y1 - y0, opts);
}

/** A square of half size h with corners chamfered by c, counter-clockwise seen from above, centred on (cx, cz). */
function chamferedSquare(cx: number, cz: number, hx: number, hz: number, c: number): Array<[number, number]> {
  return [[cx - hx + c, cz + hz], [cx + hx - c, cz + hz], [cx + hx, cz + hz - c], [cx + hx, cz - hz + c],
    [cx + hx - c, cz - hz], [cx - hx + c, cz - hz], [cx - hx, cz - hz + c], [cx - hx, cz + hz - c]];
}
const rect = (x0: number, z0: number, x1: number, z1: number): Array<[number, number]> => [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];

type PaneState = 'glass' | 'lit' | 'gone' | 'burnt' | 'sheet';

/**
 * A curtain-wall face: per floor a band of glazing over a spandrel panel, the slab edge; glazing gone to the dark floor
 * behind it, burnt (the soot climbing to the next floor), lit, or under sheeting. `state(face, floor)` decides.
 */
function curtainFace(sink: PartSink, face: Face, y0: number, floors: number, fh: number, spandrel: Rgb, slab: RegionalBucket,
  state: (floor: number) => PaneState, look: () => number, inset = 0.25): void {
  const w = face.width - 2 * inset;
  if (w < 0.4) return;
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh, s = state(f);
    const gy0 = y + fh * 0.32, gy1 = y + fh - 0.12;
    if (s === 'glass' || s === 'lit') facePanel(sink, s === 'lit' ? 'curtain' : 'glass', face, 0, (gy0 + gy1) / 2, 0.05, w, gy1 - gy0, { decor: true, window: face.out });
    else if (s === 'sheet') facePanel(sink, 'structureMetal', face, 0, (gy0 + gy1) / 2, 0.06, w, gy1 - gy0, { decor: true, colour: rgb(0xd9dedb) });
    // the spandrel panel (the burnt floor's charred), or the bare slab edge where the panels fell
    if (s === 'gone') faceBox(sink, slab, face, 0, y + 0.08, 0.06, w + 0.1, 0.34, 0.12, { decor: true, fineSides: true });
    else faceBox(sink, 'structureMetal', face, 0, y + fh * 0.16, 0.07, w + 0.1, fh * 0.32 + 0.04, 0.06, { decor: true, colour: s === 'burnt' ? CHAR : shade(spandrel, 0.92 + look() * 0.14) });
    // the fire's soot climbing the face from a burnt floor's head two floors and more (wave 162: "no burnt towers" — one
    // floor's band under the next floor's glass read as a dark spandrel, not a fire)
    if (s === 'burnt') sootBand(sink, slab, face, -w / 2, w / 2, y + fh * 0.9, Math.min(y + fh * (2.4 + look() * 0.8), y0 + floors * fh));
  }
}

/** Mullions down a face: full-height strips every `step` metres (fine joinery). */
function mullions(sink: PartSink, face: Face, y0: number, y1: number, step: number, colour: Rgb, inset = 0.25): void {
  const w = face.width - 2 * inset, n = Math.max(1, Math.round(w / step));
  for (let k = 1; k < n; k++) faceBox(sink, 'structureWood', face, -w / 2 + w * k / n, (y0 + y1) / 2, 0.09, 0.08, y1 - y0, 0.08, { decor: true, colour, fine: true });
  for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, s * (face.width / 2 - 0.12), (y0 + y1) / 2, 0.08, 0.24, y1 - y0, 0.1, { decor: true, colour });
}

/** A punched window of a concrete facade: the pane (or its siege state) and a slim sill. (u, y) its bottom-centre. */
function panelWindow(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, look: () => number, lit: number): void {
  const roll = look();
  if (roll < 0.1) { unhcrSheet(sink, face, u, y, w, h, look); return; }
  if (roll < 0.2) {
    facePanel(sink, 'dark', face, u, y + h / 2, 0.01, w, h, { decor: true });
    sootBand(sink, 'plaster3', face, u - w / 2 - 0.2, u + w / 2 + 0.2, y + h, y + h + 1.4);
    return;
  }
  facePanel(sink, paneBucket(look, lit), face, u, y + h / 2, 0.012, w, h, { decor: true, window: face.out });
  faceBox(sink, 'plaster3', face, u, y - 0.04, 0.05, w + 0.12, 0.08, 0.1, { decor: true, fine: true });
}

// ------------------------------------------------------------------------------------------------ UNIS

/**
 * The UNIS twin towers: two chamfered-square towers of dark bronze glass on a shared two-storey lobby, a plant storey
 * on each roof. Most floors gutted: the glass gone to the dark, the charred spandrels, soot up the faces.
 */
const unisTowers: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60);
    const T = clampTo(Math.min((W - 3) / 2, D - 2), 1.6, 13.2), c = T * 0.17;
    const fh = 3.2, floors = Math.max(4, Math.min(18, Math.round((W > 20 ? 56 : 18) / fh)));
    const gap = clampTo(W - 2 * T - 0.4, 0.6, 8);
    const bronze = rgb(0x4b3a2b), slab = 'plaster3' as const;
    // the lobby the towers stand on
    const lobbyH = 7.0;
    sink.span(slab, -W / 2, -0.4, -D / 2, W / 2, lobbyH, D / 2);
    const lobby: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    facePanel(sink, 'glass', lobby, 0, 2.2, 0.03, W - 2, 3.4, { decor: true, window: [0, 0, 1] });
    faceBox(sink, 'structureMetal', lobby, 0, 4.3, 0.06, W, 0.8, 0.12, { decor: true, colour: bronze });
    for (const side of [-1, 1]) {
      const cx = side * (gap / 2 + T / 2), hz = Math.min(T / 2, D / 2 - 0.4);
      const plan = chamferedSquare(cx, 0, T / 2, hz, c);
      const top = lobbyH + floors * fh;
      planPrism(sink, 'dark', plan, lobbyH, top);
      planPrism(sink, slab, chamferedSquare(cx, 0, T / 2 + 0.15, hz + 0.15, c), top, top + 0.45);
      planPrism(sink, slab, chamferedSquare(cx, 0, T * 0.32, hz * 0.64, c * 0.6), top + 0.45, top + 3.4);
      // the fire's floors: the fire of 1992 gutted most of each tower (waves 186/187 read "intact glass towers" in a run of
      // half the floors); the floors below it a few burnt, the rest glass (lit very rarely)
      const gutFrom = Math.floor(rng() * floors * 0.15), gutTo = Math.min(floors, gutFrom + Math.floor(floors * (0.72 + rng() * 0.28)));
      const faces = planFaces(plan);
      faces.forEach((face, fi) => {
        const state = (f: number): PaneState => {
          const r = look();
          if (f >= gutFrom && f < gutTo) return r < 0.5 ? 'burnt' : r < 0.92 ? 'gone' : 'glass';
          return r < 0.12 ? 'gone' : r < 0.16 ? 'sheet' : r < 0.18 ? 'lit' : 'glass';
        };
        curtainFace(sink, face, lobbyH, floors, fh, bronze, slab, state, look, fi % 2 ? 0.1 : 0.25);
        if (!mobile) mullions(sink, face, lobbyH, top, 1.6, shade(bronze, 0.8), fi % 2 ? 0.1 : 0.25);
      });
    }
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the parliament

/** The parliament's tower: a slab behind its grid of fins, burnt floors black, the assembly wing in front. */
function parliament(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60);
    // the slab's crown on the lot's back and side edges, the assembly wing's front on its street edge
    const td = clampTo(D * 0.54, 6, 14), tz0 = -D / 2, tz1 = tz0 + td;
    const fh = 3.1, floors = Math.max(4, Math.min(19, Math.round((W > 16 ? 58 : 16) / fh)));
    const top = floors * fh + 1.2;
    const concrete = 'plaster3' as const;
    sink.span('dark', -W / 2 + 0.2, -0.4, tz0 + 0.2, W / 2 - 0.2, top, tz1 - 0.2);
    sink.span(concrete, -W / 2, top, tz0, W / 2, top + 0.6, tz1);
    sink.span(concrete, -W * 0.2, top + 0.6, (tz0 + tz1) / 2 - 1.8, W * 0.2, top + 3.2, (tz0 + tz1) / 2 + 1.8);
    const faces = planFaces(rect(-W / 2 + 0.2, tz0 + 0.2, W / 2 - 0.2, tz1 - 0.2));
    // the fire took the floors under the top and a few here and there below (the tower burnt for days in 1992)
    const burntFrom = Math.max(1, floors - 7 - Math.floor(rng() * 5));
    for (const face of faces) {
      for (let f = 0; f < floors; f++) {
        const y = 1.2 + f * fh, r = look();
        const burnt = f >= burntFrom ? r < 0.8 : r < 0.12;
        facePanel(sink, burnt ? 'dark' : r < 0.9 ? 'glass' : 'curtain', face, 0, y + fh / 2, 0.02, face.width - 0.2, fh - 0.5, { decor: true, window: face.out });
        faceBox(sink, concrete, face, 0, y + 0.1, 0.12, face.width + 0.3, 0.42, 0.24, { decor: true, fineSides: true });
        if (burnt && f + 1 < floors) sootBand(sink, concrete, face, -face.width / 2, face.width / 2, y + fh - 0.3, y + fh + 0.6);
      }
      // the grid of fins, full height
      const n = Math.max(2, Math.round(face.width / 1.75));
      for (let k = 0; k <= n; k++) {
        const u = -face.width / 2 + face.width * k / n;
        faceBox(sink, concrete, face, u, (1.2 + top) / 2, 0.22, 0.26, top - 1.2, 0.44, { decor: true, fineSides: true });
      }
    }
    // the assembly wing in front: two storeys, a ribbon of dark glass, a flat roof
    const wz0 = tz1 + 0.6, wz1 = D / 2;
    if (wz1 - wz0 > 2.5) {
      sink.span(concrete, -W / 2, -0.4, wz0, W / 2, 8.2, wz1);
      const wf: Face = { origin: [0, 0, wz1], u: [1, 0, 0], out: [0, 0, 1], width: W };
      facePanel(sink, 'glass', wf, 0, 2.0, 0.02, W - 1.6, 2.6, { decor: true, window: [0, 0, 1] });
      facePanel(sink, look() < 0.5 ? 'dark' : 'glass', wf, 0, 5.6, 0.02, W - 1.6, 2.2, { decor: true, window: [0, 0, 1] });
      faceBox(sink, concrete, wf, 0, 8.0, 0.2, W + 0.2, 0.5, 0.4, { decor: true });
      sink.dressing(mobile, () => shellPocks(sink, wf, { u0: -W / 2 + 0.6, u1: W / 2 - 0.6, y0: 3.4, y1: 4.6 }, 10 + Math.floor(look() * 14), [], look, 'stone'));
    }
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ estate towers

/**
 * An estate tower: two crossing slabs of concrete panels (the cross plan of Alipašino Polje and Mojmilo), the windows
 * punched in a grid, the loggias stacked up each arm's end behind their coloured parapets, the slab joints banding it;
 * burnt flats, a shell hole.
 */
function estateTower(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 7, 60), D = clampTo(f.d, 7, 60);
    const fr = rng();
    const fh = 2.85, floors = W > 16 ? 15 + Math.round(fr * 2) : 4;
    const armW = clampTo(Math.min(W, D) * 0.46, 4, 11);
    const top = 1.0 + floors * fh;
    const concrete = 'plaster3' as const;
    const paint = choose(rng(), PANEL_PAINTS), paint2 = choose(rng(), PANEL_PAINTS);
    // the two slabs (structure) and the roof's parapet, lift rooms
    const slabs = [rect(-W / 2, -armW / 2, W / 2, armW / 2), rect(-armW / 2, -D / 2, armW / 2, D / 2)];
    for (const plan of slabs) planPrism(sink, concrete, plan, -0.4, top);
    sink.span(concrete, -armW / 2 - 0.5, top, -armW / 2 - 0.5, armW / 2 + 0.5, top + 2.6, armW / 2 + 0.5);
    // the faces of the cross: the arm ends (loggias) and the arms' sides (windows)
    const hx = W / 2, hz = D / 2, a = armW / 2;
    const faces: Array<{ face: Face; end: boolean; colour: Rgb }> = [];
    const add = (x0: number, z0: number, x1: number, z1: number, end: boolean, colour: Rgb) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.5) return;
      const u: Vec3 = [(x1 - x0) / len, 0, (z1 - z0) / len];
      faces.push({ face: { origin: [(x0 + x1) / 2, 0, (z0 + z1) / 2], u, out: [-u[2], 0, u[0]], width: len }, end, colour });
    };
    // counter-clockwise round the cross seen from above
    add(-a, hz, a, hz, true, paint); add(a, hz, a, a, false, paint); add(a, a, hx, a, false, paint);
    add(hx, a, hx, -a, true, paint2); add(hx, -a, a, -a, false, paint2); add(a, -a, a, -hz, false, paint2);
    add(a, -hz, -a, -hz, true, paint); add(-a, -hz, -a, -a, false, paint); add(-a, -a, -hx, -a, false, paint);
    add(-hx, -a, -hx, a, true, paint2); add(-hx, a, -a, a, false, paint2); add(-a, a, -a, hz, false, paint2);
    const burnt = new Set<number>();
    for (let k = 0; k < 3 + Math.floor(rng() * 4); k++) burnt.add(Math.floor(rng() * faces.length) * 100 + Math.floor(rng() * floors));
    faces.forEach(({ face, end, colour }, fi) => {
      for (let f = 0; f < floors; f++) {
        const y = 1.0 + f * fh;
        if (f > 0) faceBox(sink, concrete, face, 0, y - 0.05, 0.03, face.width, 0.14, 0.06, { decor: true, fine: true });
        const isBurnt = burnt.has(fi * 100 + f);
        if (end && f > 0) {
          // the loggia: the dark recess, the slab, the coloured parapet panel
          const lw = Math.min(face.width - 0.8, 3.6);
          facePanel(sink, isBurnt ? 'dark' : look() < 0.85 ? 'glass' : 'dark', face, 0, y + 1.2, 0.01, lw, 2.2, { decor: true, window: face.out });
          faceBox(sink, concrete, face, 0, y - 0.05, 0.45, lw + 0.6, 0.15, 0.9, { decor: true });
          faceBox(sink, 'structureMetal', face, 0, y + 0.5, 0.88, lw + 0.6, 0.95, 0.06, { decor: true, colour: isBurnt ? CHAR : shade(colour, 0.9 + look() * 0.2) });
          if (isBurnt) sootBand(sink, concrete, face, -lw / 2, lw / 2, y + 2.3, y + fh + 1.0);
          continue;
        }
        const n = Math.max(1, Math.floor((face.width - 0.6) / 2.4));
        for (let k = 0; k < n; k++) {
          const u = -face.width / 2 + 0.3 + (face.width - 0.6) * (k + 0.5) / n;
          if (isBurnt) {
            facePanel(sink, 'dark', face, u, y + 1.5, 0.01, 1.3, 1.3, { decor: true });
            sootBand(sink, concrete, face, u - 0.85, u + 0.85, y + 2.15, y + fh + 0.8);
          } else panelWindow(sink, face, u, y + 0.85, 1.3, 1.3, look, 0.06);
        }
      }
      if (look() < 0.35) sink.dressing(mobile, () => shellHole(sink, face, (look() - 0.5) * face.width * 0.5, 1.0 + fh * (2 + look() * (floors - 4)), 0.5 + look() * 0.4, look, 'stone'));
    });
    // the ground storey: the entrance's glazed screen under a canopy
    const entry = faces[0].face;
    facePanel(sink, 'glass', entry, 0, 1.3, 0.04, Math.min(entry.width - 0.6, 3.2), 2.2, { decor: true, window: entry.out });
    faceBox(sink, concrete, entry, 0, 2.7, 0.9, Math.min(entry.width, 4.4), 0.2, 1.8, { decor: true });
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ Holiday Inn

/** The Holiday Inn: the ochre cube of rendered panels on its brown-glazed podium, its windows punched in a grid and
 * brown-framed, the crown storey and the sign. */
const holidayInn: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 7, 60), D = clampTo(f.d, 7, 60);
    // (waves 186/187: the first draft's saturated yellow sheet in bands round ribbons of glass read as "a candy-striped
    // skyscraper"; the hotel is ochre-rendered prefabricated panels, its windows punched in a grid, brown-framed)
    const yellow = rgb(0xb59a5c), brown = rgb(0x4a3326);
    const podH = 7.0, T = clampTo(Math.min(W, D) - 1.6, 4, 18), fh = 3.1;
    const floors = Math.max(3, Math.min(10, Math.round(T * 0.58)));
    const top = podH + floors * fh;
    // the podium: brown glass between ochre piers; the cube with its corners notched; the crown storey
    sink.span('plaster', -W / 2, -0.4, -D / 2, W / 2, podH, D / 2, { colour: shade(yellow, 0.86) });
    const c = T * 0.08;
    const cube = chamferedSquare(0, 0, T / 2, T / 2, c);
    planPrism(sink, 'plaster', cube, podH, top, { colour: yellow });
    planPrism(sink, 'plaster', chamferedSquare(0, 0, T * 0.36, T * 0.36, c * 0.7), top, top + 3.0, { colour: shade(yellow, 0.9) });
    for (const face of planFaces(rect(-W / 2, -D / 2, W / 2, D / 2))) {
      facePanel(sink, 'glass', face, 0, 2.0, 0.02, face.width - 1.2, 2.8, { decor: true, window: face.out });
      faceBox(sink, 'structureMetal', face, 0, 4.4, 0.04, face.width - 1.2, 0.6, 0.06, { decor: true, colour: brown });
      facePanel(sink, look() < 0.3 ? 'dark' : 'glass', face, 0, 5.7, 0.02, face.width - 1.2, 1.6, { decor: true, window: face.out });
    }
    // the windows punched in a grid on every face of the cube, brown-framed, the panels' joints a darker ochre between
    // them; the hotel stood on the front line, so many rooms are dark, some under UNHCR sheeting (the south-west faces
    // shelled hardest)
    planFaces(cube).forEach((face, fi) => {
      if (face.width < 2) return;
      const shelled = fi === 4 || fi === 6;
      const gw = face.width - 0.8, n = Math.max(1, Math.floor(gw / 1.75));
      for (let f = 0; f < floors; f++) {
        const y = podH + f * fh;
        for (let k = 0; k < n; k++) {
          const u = -gw / 2 + gw * (k + 0.5) / n, roll = look();
          const state = shelled ? (roll < 0.5 ? 'gone' : roll < 0.62 ? 'sheet' : 'glass') : roll < 0.3 ? 'gone' : roll < 0.38 ? 'sheet' : roll < 0.4 ? 'lit' : 'glass';
          if (state === 'gone') facePanel(sink, 'dark', face, u, y + 1.5, 0.015, 1.15, 1.45, { decor: true });
          else if (state === 'sheet') facePanel(sink, 'structureMetal', face, u, y + 1.5, 0.025, 1.15, 1.45, { decor: true, colour: rgb(0xd9dedb) });
          else facePanel(sink, state === 'lit' ? 'curtain' : 'glass', face, u, y + 1.5, 0.015, 1.15, 1.45, { decor: true, window: face.out });
          // the frame's sill and head
          faceBox(sink, 'structureWood', face, u, y + 0.74, 0.04, 1.3, 0.09, 0.07, { decor: true, colour: brown, fineSides: true });
          faceBox(sink, 'structureWood', face, u, y + 2.26, 0.04, 1.3, 0.09, 0.07, { decor: true, colour: brown, fineSides: true });
        }
        // the panel joint between the storeys
        faceBox(sink, 'plaster', face, 0, y + fh - 0.02, 0.02, face.width - 0.1, 0.06, 0.03, { decor: true, colour: shade(yellow, 0.72), fine: true });
      }
      if (shelled) sink.dressing(mobile, () => {
        shellPocks(sink, face, { u0: -face.width / 2 + 0.3, u1: face.width / 2 - 0.3, y0: podH + 0.3, y1: top - 0.5 }, 30 + Math.floor(look() * 30), [], look, 'stone');
        for (let k = 0; k < 2; k++) shellHole(sink, face, (look() - 0.5) * face.width * 0.6, podH + fh * (1 + look() * (floors - 2)) + 2.6, 0.5 + look() * 0.5, look, 'stone');
      });
    });
    // the sign frame on the roof: posts and the board (its green lettering a dark panel at this range)
    const sy = top + 3.0;
    for (const dx of [-T * 0.25, T * 0.25]) sink.member('structureMetal', [dx, sy, 0], [dx, sy + 2.6, 0], 0.12, 0.12, [0, 0, 1], { colour: IRON, decor: true, exposed: true }, 0);
    sink.span('structureMetal', -T * 0.33, sy + 1.0, -0.08, T * 0.33, sy + 2.5, 0.08, { colour: rng() < 0.5 ? rgb(0x2f6b4a) : rgb(0x2a4c3a), decor: true });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the slab block

/**
 * A Grbavica slab block: a long slab of concrete across the plot, its loggias in a grid along the front behind
 * coloured parapets, the stair towers' glazing down the back, shops and entrances at the foot, lift rooms on the roof.
 */
const slabBlock: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 7, 60), D = clampTo(f.d, 7, 60);
    // the slab along the back of the lot, its low annex of shops and garages filling the front to the lot's edge
    const sd = clampTo(D * 0.5, 5, 12), z0 = -D / 2, z1 = z0 + sd;
    const fh = 2.85, gH = 3.4, floors = Math.max(2, Math.min(9, 6 + Math.floor(rng() * 4)));
    const top = gH + floors * fh;
    const concrete = 'plaster3' as const;
    const paint = choose(rng(), PANEL_PAINTS);
    sink.span(concrete, -W / 2, -0.4, z0, W / 2, top, z1);
    if (D / 2 - z1 > 1.5) {
      const ah = 4.2;
      sink.span(concrete, -W / 2, -0.4, z1 - 0.2, W / 2, ah, D / 2);
      sink.span(concrete, -W / 2, ah, D / 2 - 0.25, W / 2, ah + 0.7, D / 2);
      const af: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
      const units = Math.max(2, Math.floor(W / 4.2));
      for (let k = 0; k < units; k++) {
        const u = -W / 2 + W * (k + 0.5) / units, uw = W / units - 1.0;
        if (k % 3 === 2) faceBox(sink, 'structureMetal', af, u, 1.4, 0.03, uw, 2.8, 0.05, { decor: true, colour: shade(ROLL_SHUTTER, 0.9 + look() * 0.2) });
        else {
          facePanel(sink, look() < 0.3 ? 'dark' : 'glass', af, u, 1.5, 0.02, uw, 2.6, { decor: true, window: [0, 0, 1] });
          faceBox(sink, 'structureMetal', af, u, 3.2, 0.05, uw + 0.4, 0.55, 0.08, { decor: true, colour: shade(paint, 0.9) });
        }
      }
      sink.dressing(mobile, () => shellPocks(sink, af, { u0: -W / 2 + 0.3, u1: W / 2 - 0.3, y0: 0.3, y1: ah - 0.3 }, 12 + Math.floor(look() * 16), [], look, 'stone'));
    }
    sink.span(concrete, -W / 2 - 0.1, top, z0 - 0.1, W / 2 + 0.1, top + 0.7, z1 + 0.1);
    for (const x of [-W * 0.28, W * 0.28]) sink.span(concrete, x - 1.3, top + 0.7, z0 + sd * 0.25, x + 1.3, top + 3.0, z1 - sd * 0.25, { decor: true });
    const front: Face = { origin: [0, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const back: Face = { origin: [0, 0, z0], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    const bays = Math.max(2, Math.round(W / 2.9)), bw = W / bays;
    const burnt = new Set<number>();
    for (let k = 0; k < 2 + Math.floor(rng() * 5); k++) burnt.add(Math.floor(rng() * bays) * 100 + Math.floor(rng() * floors));
    // the foot: shops' glazing and the entrances
    facePanel(sink, 'glass', front, 0, 1.6, 0.02, W - 1, 2.4, { decor: true, window: [0, 0, 1] });
    faceBox(sink, 'structureMetal', front, 0, gH - 0.35, 0.06, W, 0.5, 0.1, { decor: true, colour: ROLL_SHUTTER });
    for (let f = 0; f < floors; f++) {
      const y = gH + f * fh;
      faceBox(sink, concrete, front, 0, y - 0.04, 0.5, W, 0.14, 1.0, { decor: true });
      for (let k = 0; k < bays; k++) {
        const u = -W / 2 + bw * (k + 0.5), isBurnt = burnt.has(k * 100 + f);
        facePanel(sink, isBurnt ? 'dark' : look() < 0.9 ? 'glass' : 'curtain', front, u, y + 1.2, 0.01, bw - 0.5, 2.2, { decor: true, window: [0, 0, 1] });
        faceBox(sink, 'structureMetal', front, u, y + 0.52, 0.97, bw - 0.12, 0.96, 0.06, { decor: true, colour: isBurnt ? CHAR : shade(paint, 0.88 + look() * 0.22) });
        if (isBurnt) sootBand(sink, concrete, front, u - bw / 2 + 0.2, u + bw / 2 - 0.2, y + 2.3, y + fh + 1.1);
      }
      for (let k = 0; k <= bays; k++) faceBox(sink, concrete, front, -W / 2 + bw * k, y + fh / 2, 0.5, 0.14, fh, 1.0, { decor: true, fine: true });
      // the back: kitchen windows, the stair glazing
      for (let k = 0; k < bays; k++) {
        const u = -W / 2 + bw * (k + 0.5);
        if (k % 4 === 2) continue;
        panelWindow(sink, back, u, y + 1.0, 1.1, 1.2, look, 0.06);
      }
    }
    for (let k = 2; k < bays; k += 4) facePanel(sink, 'glass', back, -W / 2 + bw * (k + 0.5), (gH + top) / 2, 0.02, 1.4, top - gH - 1, { decor: true, window: [0, 0, -1] });
    sink.dressing(mobile, () => {
      shellPocks(sink, back, { u0: -W / 2 + 0.4, u1: W / 2 - 0.4, y0: 1, y1: top - 1 }, 20 + Math.floor(look() * 30), [], look, 'stone');
      for (let k = 0; k < 2; k++) shellHole(sink, back, (look() - 0.5) * W * 0.8, gH + fh * (1 + look() * (floors - 2)) + 2.4, 0.45 + look() * 0.4, look, 'stone');
    });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ Oslobođenje

/**
 * The Oslobođenje tower: the two concrete cores standing out of the collapsed tower over the print works, floor slabs
 * hanging between them, rebar at their heads, the rubble mound at their feet, the soot up their faces, a mast.
 */
const oslobodjenje: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 8, 60), D = clampTo(f.d, 7, 60);
    const concrete = 'plaster3' as const;
    // the print works: three storeys along the back of the plot, its roof broken
    const bz0 = -D / 2, bz1 = bz0 + clampTo(D * 0.48, 4, 11), bh = 10.5;
    sink.span(concrete, -W / 2, -0.4, bz0, W / 2, bh, bz1);
    const pf: Face = { origin: [0, 0, bz1], u: [1, 0, 0], out: [0, 0, 1], width: W };
    for (let f = 0; f < 3; f++) for (let k = 0; k < Math.max(2, Math.floor(W / 2.6)); k++) {
      const n = Math.max(2, Math.floor(W / 2.6)), u = -W / 2 + W * (k + 0.5) / n;
      panelWindow(sink, pf, u, 0.9 + f * 3.4, 1.5, 1.4, look, 0.04);
    }
    sink.span('dark', -W * 0.2, bh - 0.02, bz0 + 1.5, W * 0.1, bh + 0.02, bz1 - 1.5, { decor: true });
    // the cores
    const cs = clampTo(Math.min(W, D) * 0.25, 2.5, 5.6), ch = clampTo(W * 1.75, 12, 46);
    const cz = bz1 + cs / 2 + 0.3;
    // the collapsed tower's two lowest storeys still standing round the cores' feet to the lot's front, gutted
    const tz0 = bz1 - 0.2, tz1 = D / 2, th = 6.8;
    if (tz1 - tz0 > 2) {
      sink.span(concrete, -W / 2, -0.4, tz0, W / 2, th, tz1);
      const tf: Face = { origin: [0, 0, tz1], u: [1, 0, 0], out: [0, 0, 1], width: W };
      const n = Math.max(2, Math.floor(W / 2.8));
      for (let fl = 0; fl < 2; fl++) for (let k = 0; k < n; k++) {
        const u = -W / 2 + W * (k + 0.5) / n;
        facePanel(sink, 'dark', tf, u, 1.6 + fl * 3.4, 0.01, W / n - 0.9, 1.9, { decor: true });
      }
      sootBand(sink, concrete, tf, -W / 2, W / 2, 2.6, th);
    }
    for (const side of [-1, 1]) {
      const cx = side * (W / 2 - cs / 2 - 0.6), h = ch * (side > 0 ? 1 : 0.86 + rng() * 0.08);
      sink.span(concrete, cx - cs / 2, -0.4, cz - cs / 2, cx + cs / 2, h, cz + cs / 2);
      const faces = planFaces(rect(cx - cs / 2, cz - cs / 2, cx + cs / 2, cz + cs / 2));
      for (const face of faces) sootBand(sink, concrete, face, -cs / 2, cs / 2, h * (0.3 + look() * 0.3), h);
      // the slab stubs on the inner face at every floor, rebar at the head
      for (let y = 3.4; y < h - 1; y += 3.4) {
        const inner: Face = faces.find((f) => f.out[0] === -side) ?? faces[0];
        if (look() < 0.55) faceBox(sink, concrete, inner, 0, y, 0.6 + look() * 1.2, cs * 0.9, 0.26, 1.2 + look() * 2.4, { decor: true });
      }
      sink.dressing(mobile, () => {
        for (let k = 0; k < 6; k++) {
          const x = cx + (look() - 0.5) * cs, z = cz + (look() - 0.5) * cs;
          sink.member('structureWood', [x, h, z], [x + (look() - 0.5) * 0.6, h + 0.6 + look() * 0.9, z + (look() - 0.5) * 0.6], 0.035, 0.035, [0, 0, 1], { colour: rgb(0x5e4030), decor: true, exposed: true }, 0);
        }
      });
      if (side > 0) {
        sink.cylinder('structureMetal', [cx, h, cz], 'y', 7.5, 0.12, 6, { colour: rgb(0xb4b2aa), decor: true }, 0.06);
        for (const k of [0.4, 0.7]) sink.member('structureMetal', [cx - 0.9, h + 7.5 * k, cz], [cx + 0.9, h + 7.5 * k, cz], 0.05, 0.05, [0, 0, 1], { colour: rgb(0xb4b2aa), decor: true, exposed: true }, 0);
      }
    }
    // slabs hanging between the cores, the mound of the fallen floors
    const span = W - 2 * cs - 1.2;
    for (let k = 0; k < 3; k++) {
      const y = 8 + k * (ch * 0.22) + look() * 3;
      const a: Vec3 = [-span / 2 + 0.2, y, cz], b: Vec3 = [span / 2 - 0.2, y - 2 - look() * 6, cz + (look() - 0.5) * 2];
      sink.member(concrete, a, b, cs * 0.9, 0.26, normalize3([0.2, 1, 0]), { decor: true, exposed: true });
    }
    sink.span('stone', -span / 2 - 0.5, -0.3, cz - cs, span / 2 + 0.5, 2.2, Math.min(D / 2, cz + cs * 1.4), { decor: true });
    // (a phone keeps two of the six slabs, every slab drawn)
    for (let k = 0; k < 6; k++) {
      const x = (look() - 0.5) * span, z = cz + (look() - 0.3) * cs;
      const dx = (look() - 0.5) * 3, topY = 2.2 + look() * 2, dz = (look() - 0.5) * 3, wide = 2 + look() * 2;
      if (!mobile || k < 2) sink.member(concrete, [x, 0.8, z], [x + dx, topY, z + dz], wide, 0.24, [0, 1, 0], { decor: true, exposed: true });
    }
    sink.dressing(mobile, () => shellPocks(sink, pf, { u0: -W / 2 + 0.4, u1: W / 2 - 0.4, y0: 0.6, y1: bh - 0.6 }, 30, [], look, 'stone'));
  });
  return sink.finish();
};

/** The megatower's place: the parliament on the boulevard, an estate tower up the slope. */
const megatower: RegionalBuilder = (ctx) => {
  const valley = ctx.z !== undefined ? Math.abs(ctx.z) < 60 : ctx.rng() < 0.5;
  return valley ? parliament(ctx) : estateTower(ctx);
};

export const SARAJEVO_TOWER_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  arcology: unisTowers,
  megatower,
  needletower: holidayInn,
  terracetower: estateTower,
  parkingdeck: slabBlock,
  broadcasttower: oslobodjenje,
});

export type { RegionalParts };
