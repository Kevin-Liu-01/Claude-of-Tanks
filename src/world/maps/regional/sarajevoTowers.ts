// src/world/maps/regional/sarajevoTowers.ts — the Sarajevo kit's high-rises (sarajevo.ts), each in the footprint of the
// megacity landmark it replaces so the skyline along the boulevard stays vertical:
//   - arcology → the UNIS twin towers at Marijin Dvor ("Momo and Uzeir"): two square towers with chamfered corners in a
//     curtain wall of dark bronze glass on a shared lobby, gutted by fire, most of their glass gone to the dark floors;
//   - megatower on the boulevard → the parliament's tower: a slab behind a grid of concrete fins, its burnt floors
//     black, in front of the low assembly wing; up the slope → an estate tower;
//   - needletower → the Holiday Inn: a mustard-yellow cube on a brown-glazed podium, its window bands brown, the
//     front-line face shelled, the hotel's sign frame on the roof;
//   - terracetower → the estates' towers (Alipašino Polje, Mojmilo): a cross-plan tower of concrete panels, the
//     loggias' coloured parapets stacked up its arms, burnt flats, shell holes;
//   - parkingdeck → a Grbavica slab block: a long slab of concrete with its loggias in a grid along the front, the
//     stair towers' glazing down the back;
//   - broadcasttower → the Oslobođenje newspaper's tower: two concrete cores standing out of the collapsed tower, slabs
//     hanging between them, over the print works that kept the paper coming out.
// Collision: every tower's structure is a few prisms (the cores, the slabs, the podium), so its shell bands merge; the
// facades are dressing.
import { PartSink, faceBox, facePanel, facePoint, normalize3, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { DAMP_EDGE_BREAKS, holedBox, holedPolygon, recordBody, recordShaft, type HoleRect, type Stain } from './house.ts';
import { paneBucket } from './openings.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  CHAR, HESSIAN, IRON, PANEL_PAINTS, ROLL_SHUTTER, ZINC, choose, clampTo, fillOf, sandbagWindow, shellPocks, sootBand, unhcrSheet,
} from './sarajevoParts.ts';
import { parliament } from './sarajevoParliament.ts'; // (looks r2, b-east 2026-10-16: extracted, rebuilt there)

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

/** A convex plan (counter-clockwise seen from above) moved in by `r` on every side (each edge offset, the offsets met). */
function insetPlan(points: ReadonlyArray<readonly [number, number]>, r: number): Array<[number, number]> {
  const n = points.length, lines: Array<{ p: [number, number]; d: [number, number] }> = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % n], len = Math.hypot(bx - ax, bz - az) || 1;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    // inward: the face's out is (-uz, ux), so in is (uz, -ux)
    lines.push({ p: [ax + uz * r, az - ux * r], d: [ux, uz] });
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    if (Math.abs(den) < 1e-9) { out.push([b.p[0], b.p[1]]); continue; }
    const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / den;
    out.push([a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t]);
  }
  return out;
}

/**
 * A curtain-walled tower's floors (props census #9, lane B 2026-10-15; the judges: "glass and charred plates laid on a
 * dark prism"): each floor's spandrel band round the whole plan (its slab edge at its foot), the glazing set back `rec`
 * behind the face line on the floor's own core, the panes on it (or the UNHCR sheeting across the opening's mouth); a
 * gutted floor's core a bay deep (`deep`), charred, the slab's soffit over it and the columns standing at the face line;
 * the mullion fins down the faces from the glazing line to the face line. `state(floor)` decides each floor.
 */
function curtainFloors(sink: PartSink, plan: ReadonlyArray<readonly [number, number]>, y0: number, floors: number, fh: number,
  spandrel: Rgb, slab: RegionalBucket, state: (floor: number, face: number) => PaneState, look: () => number, opts: {
    rec?: number; deep?: number; step?: number; mobile?: boolean; finColour?: Rgb; finW?: number; finBucket?: RegionalBucket;
    /** the slab edge's colour where it is clad with the spandrels (UNIS's bronze), not the floor's concrete */
    edgeColour?: Rgb;
  } = {}): void {
  const rec = opts.rec ?? 0.45, deep = opts.deep ?? 2.8, faces = planFaces(plan), spH = fh * 0.32;
  const shallow = insetPlan(plan, rec), proud = insetPlan(plan, -0.05);
  const xs = plan.map(([x]) => x), zs = plan.map(([, z]) => z);
  const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const deepPlan = insetPlan(plan, Math.max(rec + 0.4, Math.min(deep, span * 0.3)));
  const guttedFloors: boolean[] = [];
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh;
    const states = faces.map((_, fi) => state(f, fi));
    const gutted = states.filter((s2) => s2 === 'gone' || s2 === 'burnt').length > faces.length / 2;
    guttedFloors.push(gutted);
    const burnt = states.some((s2) => s2 === 'burnt');
    // the spandrel band with the slab's edge at its foot (charred over a burnt floor)
    sink.prism('structureMetal', plan.map(([x, z]): Vec3 => [x, y, z]), [0, 1, 0], spH, { colour: burnt ? CHAR : shade(spandrel, 0.92 + look() * 0.14) });
    // (the slab's edge 5 cm proud of the spandrels: no face of it on theirs)
    if (opts.edgeColour) sink.prism('structureMetal', proud.map(([x, z]): Vec3 => [x, y, z]), [0, 1, 0], 0.32, { colour: burnt ? CHAR : opts.edgeColour });
    else sink.prism(slab, proud.map(([x, z]): Vec3 => [x, y, z]), [0, 1, 0], 0.32, {});
    // the floor's core: the rooms behind the glass, or the gutted bay's charred back wall
    const core = gutted ? deepPlan : shallow;
    // (the gutted bay's back wall charred: a colour the plaster bucket never carries, so the painted metal's; in the plaster
    // it read white, the 08:00 stills)
    sink.prism(gutted ? 'structureMetal' : 'dark', core.map(([x, z]): Vec3 => [x, y + spH, z]), [0, 1, 0], fh - spH, gutted ? { colour: CHAR } : {});
    if (gutted) {
      // the columns at the face line over the gutted bay, and the soot up to the next floor
      for (const [x, z] of shallow) sink.span(slab, x - 0.22, y + spH, z - 0.22, x + 0.22, y + fh, z + 0.22, {});
      faces.forEach((fc) => { if (burnt && f + 1 < floors) sootBand(sink, slab, fc, -fc.width / 2, fc.width / 2, y + fh, y + fh + 0.8); });
      continue;
    }
    // the corner piers closing each face's bay of glazing (a bay ends at the corners: no view along the recess round them)
    plan.forEach(([x, z], k) => {
      const [ix, iz] = shallow[k], r = Math.max(rec * 0.6, 0.3);
      sink.span(slab, (x + ix) / 2 - r, y + spH, (z + iz) / 2 - r, (x + ix) / 2 + r, y + fh, (z + iz) / 2 + r, {});
    });
    // the panes on the core's faces (lit, plain) or the sheeting across a face's mouth
    planFaces(shallow).forEach((cf, fi) => {
      const st = states[fi] ?? 'glass';
      // (the sheeting across the mouth, its battens on the spandrels over and under it)
      // (a chamfer's narrow bay keeps its glass: the sheeting's printed band would read as a slot across it)
      if (st === 'sheet' && faces[fi].width >= 3.5) { unhcrSheet(sink, faces[fi], 0, y + spH - 0.02, faces[fi].width - 0.6, fh - spH + 0.04, look); return; }
      if (st === 'gone' || st === 'burnt') return;
      facePanel(sink, st === 'lit' ? 'curtain' : 'glass', cf, 0, y + spH + (fh - spH) / 2, 0.012, cf.width - 0.1, fh - spH - 0.04, { decor: true, window: cf.out });
    });
  }
  // the mullion fins: from the glazing line out to the face line, up each run of standing floors (a gutted floor's bay
  // has its columns; a fin there would stand in the air with its back open)
  if (opts.mobile) return;
  const step = opts.step ?? 1.6, fin = opts.finColour ?? shade(spandrel, 0.8);
  for (let f = 0; f < floors;) {
    if (guttedFloors[f]) { f++; continue; }
    let e = f;
    while (e + 1 < floors && !guttedFloors[e + 1]) e++;
    const ya = y0 + f * fh, yb = y0 + (e + 1) * fh;
    faces.forEach((fc) => {
      const n = Math.max(1, Math.round(fc.width / step));
      for (let k = 1; k < n; k++) {
        faceBox(sink, opts.finBucket ?? 'structureMetal', fc, -fc.width / 2 + fc.width * k / n, (ya + yb) / 2, -rec / 2, opts.finW ?? 0.08, yb - ya, rec,
          { ...(opts.finBucket ? {} : { colour: fin }), decor: true, fine: !opts.finW }, 'caps');
      }
    });
    f = e + 1;
  }
}

/** A burnt opening's soot as a stain of the wall it is cut through (holedPolygon's): darkest at the head, fading up. */
function sootStain(u0: number, u1: number, y0: number, y1: number): Stain {
  return { u0, u1, y0, y1, bottom: 0.34, top: 0.9 };
}

/**
 * A punched window of a concrete facade, its opening cut through the wall `cut.reveal` deep (props census #9): the pane
 * at the back of the reveal (or its siege state) and a slim sill. (u, y) its bottom-centre. A burnt window is the dark
 * behind the cut with its soot a stain of the wall (`cut.stains`), stopping at `roof` (the buildings stream, 2026-10-13,
 * the integrity check: on a top floor it stood up to 0.7 m over the roof's edge).
 */
function panelWindow(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, look: () => number, lit: number, roof: number,
  cut: { reveal: number; stains: Stain[] }): void {
  const roll = look();
  if (roll < 0.1) { unhcrSheet(sink, face, u, y, w, h, look); return; }
  if (roll < 0.2) { cut.stains.push(sootStain(u - w / 2 - 0.2, u + w / 2 + 0.2, y + h, Math.min(y + h + 1.4, roof))); return; }
  facePanel(sink, paneBucket(look, lit), face, u, y + h / 2, -cut.reveal + 0.016, w, h, { decor: true, window: face.out });
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
    // (props census #9, E13: the bodies for the damage reading, the towers in their storey bands: the lobby and each tower
    // break and fall on their own)
    recordBody(sink, 0, -0.2, W, D - 0.4, lobbyH, slab);
    // (props census #9) the lobby's glazed front cut into it, the glass at the back of the cut (it was laid on the span)
    // (dome-detail-275: the sides and the back a blank block) the lobby glazed all round in two bands, the hall's and
    // the mezzanine's, cut into it; each bay's pane in its state (glass, blown out to the dark, sheeted over), the bronze
    // mullions down the bands, the fascia between them, the coping round the roof; the entrance's canopy and step
    const bands = (hw: number): HoleRect[] => [{ u0: -hw, u1: hw, y0: 0.5, y1: 3.9 }, { u0: -hw, u1: hw, y0: 4.9, y1: 6.3 }];
    const lobby = holedBox(sink, slab, -W / 2, -D / 2, W / 2, D / 2, -0.4, lobbyH,
      { front: bands((W - 2) / 2), back: bands((W - 2) / 2), left: bands(D / 2 - 1.4), right: bands(D / 2 - 1.4) }, 0.4, 0.36);
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const face = lobby[name], gw = (name === 'front' || name === 'back' ? W - 2 : D - 2.8);
      for (const [yc, bh] of [[2.2, 3.4], [5.6, 1.4]] as const) {
        const n = Math.max(2, Math.round(gw / 1.8)), bw = gw / n;
        for (let k = 0; k < n; k++) {
          const u = -gw / 2 + bw * (k + 0.5), roll = look();
          if (roll < 0.72) facePanel(sink, 'glass', face, u, yc, -0.348, bw, bh, { decor: true, window: face.out });
          else if (roll < 0.8) unhcrSheet(sink, face, u, yc - bh / 2, bw - 0.14, bh, look);
          if (k > 0) faceBox(sink, 'structureMetal', face, u - bw / 2, yc, -0.2, 0.1, bh, 0.3, { colour: bronze, decor: true }, 'caps');
        }
      }
      faceBox(sink, 'structureMetal', face, 0, 4.3, 0.06, face.width, 0.8, 0.12, { decor: true, colour: bronze });
      faceBox(sink, slab, face, 0, lobbyH + 0.15, -0.12, face.width + 0.1, 0.3, 0.44, { decor: true, shade: 0.9 });
    }
    faceBox(sink, 'structureMetal', lobby.front, 0, 4.0, 0.33, Math.min(9, W * 0.3), 0.36, 0.66, { decor: true, colour: shade(bronze, 0.8) });
    faceBox(sink, slab, lobby.front, 0, -0.08, 0.25, Math.min(10, W * 0.34), 0.3, 0.5, { decor: true, shade: 0.88 });
    // (dome-detail-275) the hall's rooflights on the lobby's roof before and behind the towers, on their curbs, a few of
    // their panes blown out; the extract housings beside them
    const towerHz = Math.min(T / 2, D / 2 - 0.4), lz = (towerHz + D / 2) / 2;
    if (D / 2 - towerHz > 3) for (const sz of [-1, 1]) {
      const z = sz * lz, lw = Math.min(W * 0.4, 12), ld = Math.min(2.2, (D / 2 - towerHz) * 0.45);
      sink.span(slab, -lw / 2, lobbyH, z - ld / 2, lw / 2, lobbyH + 0.5, z + ld / 2, { decor: true, shade: 0.9 });
      for (let k = 0, n = Math.max(2, Math.round(lw / 2)); k < n; k++) {
        const x0 = -lw / 2 + lw * k / n, x1 = x0 + lw / n;
        sink.quad(look() < 0.75 ? 'glass' : 'dark', [x0 + 0.06, lobbyH + 0.52, z + ld / 2 - 0.06], [x1 - 0.06, lobbyH + 0.52, z + ld / 2 - 0.06], [x1 - 0.06, lobbyH + 0.52, z - ld / 2 + 0.06], [x0 + 0.06, lobbyH + 0.52, z - ld / 2 + 0.06], { decor: true });
      }
      sink.span(slab, W / 2 - 3.2, lobbyH, z - 0.7, W / 2 - 1.6, lobbyH + 1.2, z + 0.7, { decor: true, shade: 0.86 });
    }
    for (const side of [-1, 1]) {
      const cx = side * (gap / 2 + T / 2), hz = Math.min(T / 2, D / 2 - 0.4);
      const plan = chamferedSquare(cx, 0, T / 2, hz, c);
      const top = lobbyH + floors * fh;
      recordBody(sink, cx, 0, T, 2 * hz, top + 3.4, slab, false, true);
      planPrism(sink, slab, chamferedSquare(cx, 0, T / 2 + 0.15, hz + 0.15, c), top, top + 0.45);
      planPrism(sink, slab, chamferedSquare(cx, 0, T * 0.32, hz * 0.64, c * 0.6), top + 0.45, top + 3.4);
      // (dome-detail-275) the roof: the parapet's upstand round the deck, the plant storey's louvre band and coping, the
      // aerials on it
      for (const fc of planFaces(chamferedSquare(cx, 0, T / 2 + 0.15, hz + 0.15, c))) faceBox(sink, slab, fc, 0, top + 0.72, -0.14, fc.width + 0.1, 0.55, 0.28, { decor: true, shade: 0.92 });
      planPrism(sink, 'structureMetal', chamferedSquare(cx, 0, T * 0.32 + 0.05, hz * 0.64 + 0.05, c * 0.6), top + 1.3, top + 2.7, { colour: shade(bronze, 0.75), decor: true });
      planPrism(sink, slab, chamferedSquare(cx, 0, T * 0.32 + 0.14, hz * 0.64 + 0.14, c * 0.6), top + 3.3, top + 3.55, { decor: true, shade: 0.9 });
      for (const dz of [-0.35, 0.3]) sink.cylinder('structureMetal', [cx + side * T * 0.12, top + 3.55, dz * hz], 'y', 3.5 + look() * 3, 0.07, 6, { colour: IRON, decor: true }, 0.035);
      // the fire's floors: a run of gutted floors per tower, a few burnt, the rest glass (lit very rarely)
      const gutFrom = Math.floor(rng() * floors * 0.4), gutTo = Math.min(floors, gutFrom + Math.floor(floors * (0.45 + rng() * 0.4)));
      // (props census #9) the floors: spandrels round the plan, the glazing set back on each floor's core, the gutted
      // floors a bay deep with their columns (curtainFloors)
      const state = (f: number): PaneState => {
        const r = look();
        if (f >= gutFrom && f < gutTo) return r < 0.22 ? 'burnt' : r < 0.9 ? 'gone' : 'glass';
        return r < 0.12 ? 'gone' : r < 0.16 ? 'sheet' : r < 0.18 ? 'lit' : 'glass';
      };
      // (the slab edges clad in the bronze: the concrete's white bands read as another building, the stills of 08:00)
      curtainFloors(sink, plan, lobbyH, floors, fh, bronze, slab, (f) => state(f), look, { mobile, finColour: shade(bronze, 0.8), edgeColour: shade(bronze, 0.7) });
    }
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the parliament

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
    // (props census #9) the cross built as walls with their openings cut through them round a core (it was two solid
    // slabs with the windows and the loggias painted on): the arm ends' walls a loggia deep, the arms' sides a window's
    const hx = W / 2, hz = D / 2, a = armW / 2, cut = 0.4, deepEnd = 1.2;
    // (E13) the cross for the damage reading: the long arm whole, the other arm's halves either side of it, in storey bands
    recordBody(sink, 0, 0, W, armW, top + 2.6, concrete, false, true);
    if (hz - a > 0.5) for (const s2 of [-1, 1]) recordBody(sink, 0, s2 * (a + hz) / 2, armW, hz - a, top, concrete, false, true);
    planPrism(sink, concrete, rect(-hx + deepEnd, -a + cut, hx - deepEnd, a - cut), -0.4, top);
    planPrism(sink, concrete, rect(-a + cut, -hz + deepEnd, a - cut, hz - deepEnd), -0.4, top);
    sink.span(concrete, -armW / 2 - 0.5, top, -armW / 2 - 0.5, armW / 2 + 0.5, top + 2.6, armW / 2 + 0.5);
    // (dome-detail-275) the lift's motor room under its overhanging slab, its louvres, the aerial mast on it
    sink.span(concrete, -armW / 2 - 0.65, top + 2.6, -armW / 2 - 0.65, armW / 2 + 0.65, top + 2.82, armW / 2 + 0.65, { decor: true, shade: 0.9 });
    for (const o of [[0, 0, 1], [0, 0, -1]] as const) {
      faceBox(sink, 'dark', { origin: [0, 0, o[2] * (armW / 2 + 0.5)], u: [o[2], 0, 0], out: [0, 0, o[2]], width: armW + 1 }, 0, top + 1.5, 0.02, armW * 0.5, 1.1, 0.04, { decor: true });
    }
    const mast = 4 + look() * 3;
    sink.cylinder('structureMetal', [armW * 0.25, top + 2.82, 0], 'y', mast, 0.06, 6, { colour: IRON, decor: true }, 0.04);
    for (const k of [0.6, 0.85]) sink.member('structureMetal', [armW * 0.25 - 0.7, top + 2.82 + mast * k, 0], [armW * 0.25 + 0.7, top + 2.82 + mast * k, 0], 0.04, 0.04, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
    // the faces of the cross: the arm ends (loggias) and the arms' sides (windows); a side's wall stops at the arm end's
    // wall (`conv`: its convex end, -1 the start, 1 the end), the arm end's runs across the arm
    const faces: Array<{ face: Face; end: boolean; colour: Rgb; s0: number; s1: number }> = [];
    const add = (x0: number, z0: number, x1: number, z1: number, conv: -1 | 0 | 1, colour: Rgb) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      if (len < 0.5) return;
      const u: Vec3 = [(x1 - x0) / len, 0, (z1 - z0) / len];
      faces.push({ face: { origin: [(x0 + x1) / 2, 0, (z0 + z1) / 2], u, out: [-u[2], 0, u[0]], width: len }, end: conv === 0, colour,
        s0: -len / 2 + (conv === -1 ? deepEnd : 0), s1: len / 2 - (conv === 1 ? deepEnd : 0) });
    };
    // counter-clockwise round the cross seen from above
    add(-a, hz, a, hz, 0, paint); add(a, hz, a, a, -1, paint); add(a, a, hx, a, 1, paint);
    add(hx, a, hx, -a, 0, paint2); add(hx, -a, a, -a, -1, paint2); add(a, -a, a, -hz, 1, paint2);
    add(a, -hz, -a, -hz, 0, paint); add(-a, -hz, -a, -a, -1, paint); add(-a, -a, -hx, -a, 1, paint);
    add(-hx, -a, -hx, a, 0, paint2); add(-hx, a, -a, a, -1, paint2); add(-a, a, -a, hz, 1, paint2);
    const burnt = new Set<number>();
    for (let k = 0; k < 3 + Math.floor(rng() * 4); k++) burnt.add(Math.floor(rng() * faces.length) * 100 + Math.floor(rng() * floors));
    const endRev = deepEnd - 0.06, sideRev = cut - 0.1;
    faces.forEach(({ face, end, colour, s0, s1 }, fi) => {
      const holes: HoleRect[] = [], stains: Stain[] = [], keep: Array<{ u0: number; u1: number; y0: number; y1: number }> = [];
      // the entrance's glazed screen in the first arm end's ground storey (under its canopy)
      if (fi === 0) {
        const ew = Math.min(face.width - 0.6, 3.2);
        holes.push({ u0: -ew / 2, u1: ew / 2, y0: 0.2, y1: 2.4 });
        facePanel(sink, 'glass', face, 0, 1.3, -endRev + 0.016, ew, 2.2, { decor: true, window: face.out });
        faceBox(sink, concrete, face, 0, 2.7, 0.9, Math.min(face.width, 4.4), 0.2, 1.8, { decor: true });
      }
      for (let f = 0; f < floors; f++) {
        const y = 1.0 + f * fh;
        if (f > 0) {
          // (dome-detail-275: their ends 6 cm by 14 cm, out of sight, left out for the roof's and the plinth's budget)
          faceBox(sink, concrete, face, 0, y - 0.05, 0.03, face.width, 0.14, 0.06, { decor: true, fine: true }, 'ends');
          keep.push({ u0: -face.width, u1: face.width, y0: y - 0.12, y1: y + 0.02 });
        }
        const isBurnt = burnt.has(fi * 100 + f);
        if (end && f > 0) {
          // the loggia: its recess cut a bay deep (the balcony door at its back, or the dark), the slab, the coloured
          // parapet panel
          const lw = Math.min(face.width - 0.8, 3.6);
          holes.push({ u0: -lw / 2, u1: lw / 2, y0: y + 0.03, y1: y + 2.45 });
          if (!isBurnt && look() < 0.85) facePanel(sink, 'glass', face, 0, y + 1.24, -endRev + 0.016, lw, 2.42, { decor: true, window: face.out });
          faceBox(sink, concrete, face, 0, y - 0.05, 0.45, lw + 0.6, 0.15, 0.9, { decor: true });
          faceBox(sink, 'structureMetal', face, 0, y + 0.5, 0.88, lw + 0.6, 0.95, 0.06, { decor: true, colour: isBurnt ? CHAR : shade(colour, 0.9 + look() * 0.2) });
          // (soot stops at the roof's edge: on the top floor it stood a metre over it)
          if (isBurnt) stains.push(sootStain(-lw / 2, lw / 2, y + 2.45, Math.min(y + fh + 1.0, top)));
          continue;
        }
        if (end) continue;
        // the windows across the side's own wall
        const n = Math.floor((s1 - s0 - 0.6) / 2.4);
        for (let k = 0; k < n; k++) {
          const u = s0 + 0.3 + (s1 - s0 - 0.6) * (k + 0.5) / n;
          holes.push({ u0: u - 0.65, u1: u + 0.65, y0: y + 0.85, y1: y + 2.15 });
          if (isBurnt) stains.push(sootStain(u - 0.85, u + 0.85, y + 2.15, Math.min(y + fh + 0.8, top)));
          else panelWindow(sink, face, u, y + 0.85, 1.3, 1.3, look, 0.06, top, { reveal: sideRev, stains });
        }
      }
      holedPolygon(sink, concrete, face, [[s0, -0.4], [s1, -0.4], [s1, top], [s0, top]], holes, end ? deepEnd : cut, end ? endRev : sideRev, {}, stains,
        DAMP_EDGE_BREAKS);
      // (dome-detail-275) the parapet's coping along the roof's edge, the plinth's darker band at the foot (low under the
      // entrance)
      faceBox(sink, concrete, face, (s0 + s1) / 2, top + 0.17, -0.06, s1 - s0 + 0.12, 0.54, 0.24, { decor: true, shade: 0.88 });
      faceBox(sink, 'stone', face, (s0 + s1) / 2, fi === 0 ? -0.06 : 0.2, 0.03, s1 - s0 + 0.06, fi === 0 ? 0.48 : 1.0, 0.06, { decor: true, shade: 0.9 });
      // a shell's strike: the render knocked off round it (on the wall, clear of the openings and the slab joints)
      if (look() < 0.35) {
        const cu = (look() - 0.5) * face.width * 0.5, cy = 1.0 + fh * (2 + look() * (floors - 4)), r = 0.5 + look() * 0.4;
        const clear = [...holes, ...keep];
        sink.dressing(mobile, () => shellPocks(sink, face, { u0: Math.max(s0 + 0.2, cu - 3 * r), u1: Math.min(s1 - 0.2, cu + 3 * r), y0: cy - 3 * r, y1: Math.min(top - 0.3, cy + 3 * r) },
          8 + Math.floor(look() * 8), clear, look, concrete));
      }
    });
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ Holiday Inn

/** The Holiday Inn: the yellow cube on its brown-glazed podium, the window bands, the crown storey and the sign. */
const holidayInn: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 7, 60), D = clampTo(f.d, 7, 60);
    const yellow = rgb(0xd2a63a), brown = rgb(0x4a3326);
    const podH = 7.0, T = clampTo(Math.min(W, D) - 1.6, 4, 18), fh = 3.1;
    const floors = Math.max(3, Math.min(10, Math.round(T * 0.58)));
    const top = podH + floors * fh;
    // the podium: its two bands of brown glass cut into it between the yellow piers (props census #9: they were laid on
    // a solid box), the glass at the back of the cuts (the upper band's gone to the dark on some faces); the cube with
    // its corners notched built floor by floor (curtainFloors); the crown storey
    const pb = { y0: 0.6, y1: 3.4 }, pu = { y0: 4.9, y1: 6.5 };
    const band = (w: number) => [{ u0: -(w - 1.2) / 2, u1: (w - 1.2) / 2, ...pb }, { u0: -(w - 1.2) / 2, u1: (w - 1.2) / 2, ...pu }];
    const pod = holedBox(sink, 'structureMetal', -W / 2, -D / 2, W / 2, D / 2, -0.4, podH,
      { front: band(W), back: band(W), right: band(D - 0.8), left: band(D - 0.8) }, 0.4, 0.34, { colour: shade(yellow, 0.92) });
    const c = T * 0.08;
    const cube = chamferedSquare(0, 0, T / 2, T / 2, c);
    planPrism(sink, 'structureMetal', chamferedSquare(0, 0, T / 2 + 0.15, T / 2 + 0.15, c), top, top + 0.45, { colour: yellow });
    // (E13) the podium and the cube (in its storey bands) for the damage reading
    recordBody(sink, 0, 0, W, D, podH, 'structureMetal');
    recordBody(sink, 0, 0, T, T, top + 3.0, 'structureMetal', false, true);
    planPrism(sink, 'structureMetal', chamferedSquare(0, 0, T * 0.36, T * 0.36, c * 0.7), top + 0.45, top + 3.0, { colour: shade(yellow, 0.95) });
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const face = pod[name], gw = (name === 'front' || name === 'back' ? W : D - 0.8) - 1.2;
      facePanel(sink, 'glass', face, 0, 2.0, -0.328, gw, 2.8, { decor: true, window: face.out });
      faceBox(sink, 'structureMetal', face, 0, 4.15, 0.04, face.width - 1.2, 0.6, 0.06, { decor: true, colour: brown });
      if (look() >= 0.3) facePanel(sink, 'glass', face, 0, 5.7, -0.328, gw, 1.6, { decor: true, window: face.out });
      for (const yy of [2.0, 5.7]) for (let k = 1, n = Math.max(2, Math.round(gw / 1.6)); k < n; k++) {
        faceBox(sink, 'structureMetal', face, -gw / 2 + gw * k / n, yy, -0.2, 0.08, yy > 3 ? 1.6 : 2.8, 0.3, { decor: true, colour: brown }, 'caps');
      }
      // (dome-detail-275) the yellow piers standing proud through both bands every few bays, the coping round the roof
      for (let k = 1, n = Math.max(2, Math.round(gw / 4.8)); k < n; k++) {
        faceBox(sink, 'structureMetal', face, -gw / 2 + gw * k / n, (podH - 0.4) / 2, -0.11, 0.42, podH + 0.4, 0.44, { decor: true, colour: shade(yellow, 0.97) }, 'caps');
      }
      faceBox(sink, 'structureMetal', face, 0, podH + 0.12, -0.1, face.width + 0.1, 0.3, 0.4, { decor: true, colour: brown });
    }
    // the window bands set back behind the yellow spandrels with their brown mullions, floor by floor (the south-west
    // faces shelled toward the front line: their glass gone to the dark or under sheeting, the pocks in the spandrels)
    const cubeFaces = planFaces(cube);
    const state = (_f: number, fi: number): PaneState => {
      const roll = look();
      const shelled = fi === 4 || fi === 6;
      return shelled ? (roll < 0.35 ? 'gone' : roll < 0.5 ? 'sheet' : 'glass') : roll < 0.08 ? 'gone' : roll < 0.12 ? 'lit' : 'glass';
    };
    // (dome-detail-275: the fins were fine joinery, the bands read flush at range) the brown mullion fins standing the
    // glazing's reveal deep at every range
    curtainFloors(sink, cube, podH, floors, fh, yellow, 'plaster3', state, look, { mobile, step: 1.5, finColour: brown, finW: 0.09 });
    for (const fi of [4, 6]) {
      const face = cubeFaces[fi];
      if (!face) continue;
      // (on the spandrels only, clear of the slab's edge and the glazing: a pock over the recess stood in the air)
      for (let fl = 0; fl < floors; fl++) {
        const y = podH + fl * fh, spH = fh * 0.32;
        const band = (y0: number, y1: number) => ({ u0: -face.width, u1: face.width, y0, y1 });
        sink.dressing(mobile, () => shellPocks(sink, face, { u0: -face.width / 2 + 0.3, u1: face.width / 2 - 0.3, y0: y + 0.3, y1: y + spH },
          2 + Math.floor(look() * 4), [band(y - 1, y + 0.32), band(y + spH, y + fh)], look, 'stone'));
      }
    }
    // (dome-detail-275) the roof: the parapet's brown coping, the plant storey's louvre band and coping, the lift's
    // motor room on it; on the deck round it the water tanks on their plinths and the foreign press's satellite dishes
    // on their posts, turned south over the front
    for (const fc of planFaces(chamferedSquare(0, 0, T / 2 + 0.15, T / 2 + 0.15, c))) faceBox(sink, 'structureMetal', fc, 0, top + 0.47, -0.12, fc.width + 0.1, 0.2, 0.3, { colour: brown, decor: true });
    const cr = T * 0.36, deck = top + 0.45;
    planPrism(sink, 'structureMetal', chamferedSquare(0, 0, cr + 0.05, cr + 0.05, c * 0.7), top + 1.2, top + 2.3, { colour: shade(brown, 0.8), decor: true });
    planPrism(sink, 'structureMetal', chamferedSquare(0, 0, cr + 0.14, cr + 0.14, c * 0.7), top + 2.86, top + 3.06, { colour: shade(yellow, 0.88), decor: true });
    sink.span('structureMetal', -cr * 0.55, top + 3.0, -cr * 0.75, cr * 0.15, top + 5.2, -cr * 0.25, { colour: shade(yellow, 0.9), decor: true });
    sink.span('structureMetal', -cr * 0.58, top + 5.2, -cr * 0.78, cr * 0.18, top + 5.4, -cr * 0.22, { colour: brown, decor: true });
    const ring = (T / 2 + cr) / 2;
    for (const sx of [-1, 1]) {
      const x = sx * ring, z = -T * 0.24, tr = Math.min(0.9, (T / 2 - cr) * 0.4);
      sink.span('structureMetal', x - tr, deck, z - tr, x + tr, deck + 0.3, z + tr, { colour: shade(yellow, 0.8), decor: true });
      sink.cylinder('structureMetal', [x, deck + 0.3, z], 'y', 1.6, tr * 0.95, 12, { colour: shade(ZINC, 1.1 + look() * 0.2), decor: true }, tr * 0.95);
    }
    const dishN = normalize3([0, 0.75, 0.66]), e1: Vec3 = [1, 0, 0];
    const e2: Vec3 = [dishN[1] * e1[2] - dishN[2] * e1[1], dishN[2] * e1[0] - dishN[0] * e1[2], dishN[0] * e1[1] - dishN[1] * e1[0]];
    for (const dx of [-0.42, -0.1, 0.24]) {
      if (look() < 0.25) continue;
      const x = dx * T, z = ring, dr = 0.55 + look() * 0.4, cy = deck + 0.6 + dr;
      sink.span('structureMetal', x - 0.06, deck, z - 0.06, x + 0.06, cy, z + 0.06, { colour: IRON, decor: true });
      const pts = Array.from({ length: 12 }, (_, j): Vec3 => {
        const t = (j / 12) * Math.PI * 2;
        return [x + (Math.cos(t) * e1[0] + Math.sin(t) * e2[0]) * dr, cy + Math.sin(t) * e2[1] * dr, z + Math.sin(t) * e2[2] * dr];
      });
      sink.prism('structureMetal', pts, dishN, 0.05, { colour: rgb(0xd8d6cf), decor: true });
    }
    // (dome-detail-275) the entrance on the front: its canopy standing out over the doors on its brown fascia, the step
    // up to it; at the back the staff's way in behind a wall of sandbags (the front was the sniper's)
    faceBox(sink, 'structureMetal', pod.front, 0, 3.7, 0.33, Math.min(8, W - 2), 0.5, 0.66, { colour: brown, decor: true });
    faceBox(sink, 'structureMetal', pod.front, 0, 3.7, 0.665, Math.min(8, W - 2) * 0.6, 0.3, 0.02, { colour: rgb(0x2f6b4a), decor: true, fine: 'near' });
    faceBox(sink, 'plaster3', pod.front, 0, -0.08, 0.25, Math.min(8, W - 2), 0.3, 0.5, { decor: true, shade: 0.9 });
    for (let k = 0; k < 7; k++) {
      const kk = 0.84 + look() * 0.22, len = Math.min(5, W * 0.3) - (k % 2) * 0.3;
      faceBox(sink, 'structureWood', pod.back, (look() - 0.5) * 0.2, 0.08 + 0.15 * k, 0.4, len, 0.14, 0.4, { decor: true, colour: [HESSIAN[0] * kk, HESSIAN[1] * kk, HESSIAN[2] * kk] });
    }
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
    // (props census #9) the slab and its annex built as walls with their openings cut through them round cores (they
    // were solid spans with the shops, the loggias and the windows painted on): the front's wall a loggia deep, the
    // back's a window deep, the annex's shopfronts cut into its front
    const annex = D / 2 - z1 > 1.5, deep = 1.2, wallT = 0.4, frontRev = deep - 0.06, rev = wallT - 0.06;
    if (annex) {
      // the annex one storey high (its roof at the slab's first floor: the first loggias stand over it)
      const ah = gH, az0 = z1 - 0.2, af: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
      recordBody(sink, 0, (z1 + D / 2) / 2, W, D / 2 - z1, ah + 0.7, concrete);
      const units = Math.max(2, Math.floor(W / 4.2)), holes: HoleRect[] = [];
      sink.span(concrete, -W / 2, -0.4, az0, W / 2, ah, D / 2 - wallT);
      sink.span(concrete, -W / 2, ah, D / 2 - 0.25, W / 2, ah + 0.7, D / 2);
      for (let k = 0; k < units; k++) {
        const u = -W / 2 + W * (k + 0.5) / units, uw = W / units - 1.0;
        holes.push({ u0: u - uw / 2, u1: u + uw / 2, y0: 0.2, y1: 2.6 });
        // a shop's roller shutter down in its opening, or its window at the back of the cut under the fascia
        if (k % 3 === 2) faceBox(sink, 'structureMetal', af, u, 1.4, -0.12, uw, 2.4, 0.05, { decor: true, colour: shade(ROLL_SHUTTER, 0.9 + look() * 0.2) });
        else {
          if (look() >= 0.3) facePanel(sink, 'glass', af, u, 1.4, -rev + 0.016, uw, 2.4, { decor: true, window: [0, 0, 1] });
          // (the fascia a sign box 14 cm deep: a board laid on the wall read as a painted opening)
          faceBox(sink, 'structureMetal', af, u, 2.95, 0.07, uw + 0.4, 0.5, 0.14, { decor: true, colour: shade(paint, 0.9) });
        }
      }
      holedPolygon(sink, concrete, af, [[-W / 2, -0.4], [W / 2, -0.4], [W / 2, ah], [-W / 2, ah]], holes, wallT, rev, {}, [], DAMP_EDGE_BREAKS);
      sink.dressing(mobile, () => shellPocks(sink, af, { u0: -W / 2 + 0.3, u1: W / 2 - 0.3, y0: 0.3, y1: ah - 0.3 }, 12 + Math.floor(look() * 16), holes, look, 'stone'));
    }
    sink.span(concrete, -W / 2 - 0.1, top, z0 - 0.1, W / 2 + 0.1, top + 0.7, z1 + 0.1);
    // (E13) the slab in its storey bands for the damage reading (the annex its own body)
    recordBody(sink, 0, (z0 + z1) / 2, W, sd, top + 0.7, concrete, false, true);
    for (const x of [-W * 0.28, W * 0.28]) sink.span(concrete, x - 1.3, top + 0.7, z0 + sd * 0.25, x + 1.3, top + 3.0, z1 - sd * 0.25, { decor: true });
    const front: Face = { origin: [0, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const back: Face = { origin: [0, 0, z0], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    const bays = Math.max(2, Math.round(W / 2.9)), bw = W / bays;
    const burnt = new Set<number>();
    for (let k = 0; k < 2 + Math.floor(rng() * 5); k++) burnt.add(Math.floor(rng() * bays) * 100 + Math.floor(rng() * floors));
    const frontHoles: HoleRect[] = [], backHoles: HoleRect[] = [], frontStains: Stain[] = [], backStains: Stain[] = [];
    // the foot: the shops' glazing bay by bay (under the annex where it stands) and the shutter boxes
    if (!annex) {
      for (let k = 0; k < bays; k++) {
        const u = -W / 2 + bw * (k + 0.5);
        frontHoles.push({ u0: u - (bw - 0.5) / 2, u1: u + (bw - 0.5) / 2, y0: 0.4, y1: 2.8 });
        if (look() >= 0.3) facePanel(sink, 'glass', front, u, 1.6, -frontRev + 0.016, bw - 0.5, 2.4, { decor: true, window: [0, 0, 1] });
      }
      faceBox(sink, 'structureMetal', front, 0, gH - 0.35, 0.06, W, 0.5, 0.1, { decor: true, colour: ROLL_SHUTTER });
    }
    for (let f = 0; f < floors; f++) {
      const y = gH + f * fh;
      faceBox(sink, concrete, front, 0, y - 0.04, 0.5, W, 0.14, 1.0, { decor: true });
      for (let k = 0; k < bays; k++) {
        // the loggia: its recess a bay deep (the balcony door at its back, or the dark of a burnt flat), the slab and
        // the coloured parapet in front, the soot of a burnt one the wall's over it
        const u = -W / 2 + bw * (k + 0.5), isBurnt = burnt.has(k * 100 + f);
        frontHoles.push({ u0: u - (bw - 0.5) / 2, u1: u + (bw - 0.5) / 2, y0: y + 0.03, y1: y + 2.4 });
        const door = isBurnt ? null : look() < 0.9 ? 'glass' as const : 'curtain' as const;
        if (door) facePanel(sink, door, front, u, y + 1.215, -frontRev + 0.016, bw - 0.5, 2.37, { decor: true, window: [0, 0, 1] });
        faceBox(sink, 'structureMetal', front, u, y + 0.52, 0.97, bw - 0.12, 0.96, 0.06, { decor: true, colour: isBurnt ? CHAR : shade(paint, 0.88 + look() * 0.22) });
        if (isBurnt) frontStains.push(sootStain(u - bw / 2 + 0.2, u + bw / 2 - 0.2, y + 2.4, Math.min(y + fh + 1.1, top)));
      }
      // (the end walls on the slab's ends: a wall half over the end stood open behind, its back on nothing)
      for (let k = 0; k <= bays; k++) faceBox(sink, concrete, front, clampTo(-W / 2 + bw * k, -W / 2 + 0.07, W / 2 - 0.07), y + fh / 2, 0.5, 0.14, fh, 1.0, { decor: true, fine: true });
      // the back: kitchen windows, the stair glazing
      for (let k = 0; k < bays; k++) {
        const u = -W / 2 + bw * (k + 0.5);
        if (k % 4 === 2) continue;
        backHoles.push({ u0: u - 0.55, u1: u + 0.55, y0: y + 1.0, y1: y + 2.2 });
        panelWindow(sink, back, u, y + 1.0, 1.1, 1.2, look, 0.06, top, { reveal: rev, stains: backStains });
      }
    }
    for (let k = 2; k < bays; k += 4) {
      const u = -W / 2 + bw * (k + 0.5);
      backHoles.push({ u0: u - 0.7, u1: u + 0.7, y0: gH + 0.5, y1: top - 0.5 });
      facePanel(sink, 'glass', back, u, (gH + top) / 2, -rev + 0.016, 1.4, top - gH - 1, { decor: true, window: [0, 0, -1] });
    }
    // (dome-detail-275: the end walls were blank) the gable ends: the bathrooms' and the kitchens' windows two a floor
    // up each, the panel joints between the floors; a shell's breach through the west end, the render knocked off round it
    const cz2 = (z0 + z1) / 2, sideHoles: Record<'left' | 'right', HoleRect[]> = { left: [], right: [] }, sideStains: Record<'left' | 'right', Stain[]> = { left: [], right: [] };
    const ends: Record<'left' | 'right', Face> = {
      right: { origin: [W / 2, 0, cz2], u: [0, 0, -1], out: [1, 0, 0], width: sd },
      left: { origin: [-W / 2, 0, cz2], u: [0, 0, 1], out: [-1, 0, 0], width: sd },
    };
    const eu = Math.min(1.9, sd / 2 - wallT - 1.2), breachFloor = 1 + Math.floor(look() * Math.max(1, floors - 2));
    for (const name of ['left', 'right'] as const) for (let f = 0; f < floors; f++) {
      const y = gH + f * fh;
      for (const u of [-eu, eu]) {
        sideHoles[name].push({ u0: u - 0.45, u1: u + 0.45, y0: y + 1.0, y1: y + 2.2 });
        panelWindow(sink, ends[name], u, y + 1.0, 0.9, 1.2, look, 0.05, top, { reveal: rev, stains: sideStains[name] });
      }
      if (name === 'left' && f === breachFloor) sideHoles.left.push({ u0: -0.8, u1: 0.7, y0: y + 0.7, y1: y + 2.1 });
    }
    holedBox(sink, concrete, -W / 2, z0, W / 2, z1, -0.4, top, { front: frontHoles, back: backHoles, left: sideHoles.left, right: sideHoles.right },
      { front: deep, back: wallT, left: wallT, right: wallT }, rev, {},
      { reveals: { front: frontRev }, stains: { front: frontStains, back: backStains, left: sideStains.left, right: sideStains.right }, edgeBreaks: DAMP_EDGE_BREAKS });
    for (const name of ['left', 'right'] as const) {
      const face = ends[name];
      for (let f = 1; f < floors; f++) faceBox(sink, concrete, face, 0, gH + f * fh - 0.05, 0.03, sd - 0.1, 0.12, 0.06, { decor: true, fine: true }, 'ends');
      // (the joint down the middle broken by the breach)
      const b0 = gH + breachFloor * fh + 0.6, b1 = b0 + 1.6;
      for (const [ya, yb] of name === 'left' ? [[gH, b0], [b1, top]] : [[gH, top]]) {
        if (yb - ya > 0.3) faceBox(sink, concrete, face, 0, (ya + yb) / 2, 0.03, 0.1, yb - ya, 0.06, { decor: true, fine: true }, 'caps');
      }
    }
    // the shell strikes on the back: the render knocked off, clear of the openings (the painted holes are gone)
    sink.dressing(mobile, () => {
      // (dome-detail-275) the breach's ring of knocked-off render, the splinters' pocks across the west end
      const by = gH + breachFloor * fh + 1.4;
      shellPocks(sink, ends.left, { u0: -2.2, u1: 2.0, y0: by - 2.0, y1: Math.min(top - 0.3, by + 2.0) }, 14, sideHoles.left, look, 'stone');
      shellPocks(sink, ends.left, { u0: -sd / 2 + 0.6, u1: sd / 2 - 0.6, y0: 1, y1: top - 1 }, 12, sideHoles.left, look, 'stone');
      shellPocks(sink, back, { u0: -W / 2 + 0.4, u1: W / 2 - 0.4, y0: 1, y1: top - 1 }, 20 + Math.floor(look() * 30), backHoles, look, 'stone');
      for (let k = 0; k < 2; k++) {
        const cu = (look() - 0.5) * W * 0.8, cy = gH + fh * (1 + look() * (floors - 2)) + 2.4, r = 0.45 + look() * 0.4;
        shellPocks(sink, back, { u0: Math.max(-W / 2 + 0.4, cu - 3 * r), u1: Math.min(W / 2 - 0.4, cu + 3 * r), y0: cy - 3 * r, y1: Math.min(top - 0.3, cy + 3 * r) },
          8 + Math.floor(look() * 8), backHoles, look, 'stone');
      }
    });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ Oslobođenje

/** (dome-detail-275) Rust on the bars the blasts and the fire left bare. */
const REBAR = rgb(0x5a3a28);

/**
 * (dome-detail-275) A bar left bare: from `a` (inside what holds it) to `b`, kept within 20 degrees of the plumb or the
 * level (a raking bar must meet something at both ends: kitConnectivity). Fine joinery.
 */
function rebar(sink: PartSink, a: Vec3, b: Vec3): void {
  const level = Math.abs(b[1] - a[1]) < 0.05;
  sink.member('structureMetal', a, b, 0.032, 0.032, level ? [0, 1, 0] : normalize3([b[2] - a[2] || 1e-3, 0, -(b[0] - a[0])]),
    { colour: REBAR, decor: true, fine: true, exposed: true }, 0);
}

/**
 * (dome-detail-275) A torn floor slab's stub on a face, its top at y: `so` out from the wall, u0..u1 along it, charred
 * (`burn` its shade), the bars of its broken edge hanging from it, one or two sticking out level.
 */
function slabStub(sink: PartSink, face: Face, u0: number, u1: number, y: number, so: number, burn: number, look: () => number): void {
  faceBox(sink, 'plaster3', face, (u0 + u1) / 2, y - 0.13, so / 2 - 0.02, u1 - u0, 0.26, so, { decor: true, shade: burn });
  const bars = 2 + Math.floor(look() * 3);
  for (let k = 0; k < bars; k++) {
    const u = u0 + 0.15 + look() * Math.max(0.01, u1 - u0 - 0.3), o = so - 0.1;
    if (look() < 0.3) rebar(sink, facePoint(face, u, y - 0.12, o), facePoint(face, u + (look() - 0.5) * 0.1, y - 0.12, so + 0.25 + look() * 0.45));
    else rebar(sink, facePoint(face, u, y - 0.1, o), facePoint(face, u + (look() - 0.5) * 0.12, y - 0.55 - look() * 1.0, o + look() * 0.08));
  }
}

/**
 * The Oslobođenje tower: the two concrete cores standing out of the collapsed tower over the print works, floor slabs
 * hanging between them, rebar at their heads, the rubble mound at their feet, the soot up their faces, a mast.
 * (dome-detail-275: two blank shafts over a plain podium) The cores' openings in a grid up their height (the lobby's
 * doorways, the stair's windows), the torn slabs at every floor charred, their bars hanging; the tower's frame still
 * hanging off the cores' inner faces, its spandrels and columns; the heads broken ragged; the gutted storeys' piers
 * and slab edges, the frame's column stumps and the fallen floors on them; the print works' ribbon glazing, its
 * loading door and sandbagged windows, its parapet and the shell's breach in its roof.
 */
const oslobodjenje: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 8, 60), D = clampTo(f.d, 7, 60);
    const concrete = 'plaster3' as const;
    // (props census #9) the print works, the gutted storeys and the cores built as walls round cores (they were solid
    // spans with the windows, the gutted bays and the soot painted on): the windows cut through, the soot the walls' own
    const wallT = 0.4, rev = wallT - 0.06;
    // the print works: three storeys along the back of the plot, its roof broken
    const bz0 = -D / 2, bz1 = bz0 + clampTo(D * 0.48, 4, 11), bh = 10.5;
    const cs = clampTo(Math.min(W, D) * 0.25, 2.5, 5.6), ch = clampTo(W * 1.75, 12, 46);
    const cz = bz1 + cs / 2 + 0.3;
    // the collapsed tower's two lowest storeys still standing round the cores' feet to the lot's front, gutted
    const tz0 = bz1 - 0.2, tz1 = D / 2, th = 6.8, stub = tz1 - tz0 > 2;
    const pf: Face = { origin: [0, 0, bz1], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const pHoles: HoleRect[] = [], pStains: Stain[] = [];
    for (let f = 0; f < 3; f++) for (let k = 0; k < Math.max(2, Math.floor(W / 2.6)); k++) {
      const n = Math.max(2, Math.floor(W / 2.6)), u = -W / 2 + W * (k + 0.5) / n, y = 0.9 + f * 3.4;
      // (the storeys behind the gutted tower's are inside it: no openings there)
      if (stub && y + 1.4 < th + 0.1) continue;
      pHoles.push({ u0: u - 0.75, u1: u + 0.75, y0: y, y1: y + 1.4 });
      panelWindow(sink, pf, u, y, 1.5, 1.4, look, 0.04, bh, { reveal: rev, stains: pStains });
    }
    // (dome-detail-275) the print works' back and ends: its ribbon glazing storey by storey between the frame's piers,
    // the panes in their bays (glass, sheeting, gone to the dark, a burnt run sooted over), the loading door in the back's
    // ground storey under its shutter, the ends' ground windows sandbagged to slits beside a steel door
    const pd = bz1 - bz0, segs = W >= 14 ? 3 : 2, m = 0.9, segW = (W - 2 * m - (segs - 1) * m) / segs;
    const bHoles: HoleRect[] = [], bStains: Stain[] = [], eHoles: HoleRect[] = [], eStains: Stain[] = [];
    type Ribbon = { u: number; y: number; w: number };
    const backRibbons: Ribbon[] = [], endRibbons: Ribbon[] = [];
    const door = { u: -W / 2 + m + segW / 2 + Math.floor(segs / 2) * (segW + m), w: Math.min(3.6, segW - 0.6) };
    for (let fl = 0; fl < 3; fl++) {
      const y = 1.0 + fl * 3.4;
      for (let s = 0; s < segs; s++) {
        const u = -W / 2 + m + segW / 2 + s * (segW + m);
        if (fl === 0 && u === door.u) { bHoles.push({ u0: u - door.w / 2, u1: u + door.w / 2, y0: 0.05, y1: 3.3 }); continue; }
        bHoles.push({ u0: u - segW / 2, u1: u + segW / 2, y0: y, y1: y + 1.7 });
        backRibbons.push({ u, y, w: segW });
        if (look() < 0.22) bStains.push(sootStain(u - segW / 2, u + segW / 2, y + 1.7, Math.min(y + 3.2, bh)));
      }
      const ew = pd - 2 * wallT - 1.2;
      if (fl > 0) {
        eHoles.push({ u0: -ew / 2, u1: ew / 2, y0: y, y1: y + 1.7 });
        endRibbons.push({ u: 0, y, w: ew });
        if (look() < 0.22) eStains.push(sootStain(-ew / 2, ew / 2, y + 1.7, Math.min(y + 3.2, bh)));
      }
    }
    const eu = (pd / 2 - wallT) * 0.5;
    eHoles.push({ u0: -eu - 0.8, u1: -eu + 0.8, y0: 0.9, y1: 2.3 }, { u0: eu - 0.6, u1: eu + 0.6, y0: 0.05, y1: 2.3 });
    const works = holedBox(sink, concrete, -W / 2, bz0, W / 2, bz1, -0.4, bh, { front: pHoles, back: bHoles, left: eHoles, right: eHoles }, wallT, rev, {},
      { stains: { front: pStains, back: bStains, left: eStains, right: eStains }, edgeBreaks: DAMP_EDGE_BREAKS });
    // (E13) the bodies for the damage reading: the print works, the gutted storeys, the cores (shafts, in bands)
    recordBody(sink, 0, (bz0 + bz1) / 2, W, bz1 - bz0, bh, concrete, false, true);
    const ribbon = (face: Face, r: Ribbon) => {
      const nb = Math.max(2, Math.round(r.w / 1.7)), bw = r.w / nb;
      for (let k = 0; k < nb; k++) {
        const u = r.u - r.w / 2 + bw * (k + 0.5), roll = look();
        if (roll < 0.42) facePanel(sink, 'glass', face, u, r.y + 0.85, -rev + 0.016, bw, 1.7, { decor: true, window: face.out });
        else if (roll < 0.58) unhcrSheet(sink, face, u, r.y, bw - 0.12, 1.7, look);
        if (k > 0) faceBox(sink, 'structureMetal', face, u - bw / 2, r.y + 0.85, -rev / 2, 0.07, 1.7, rev, { colour: IRON, decor: true, fine: true }, 'caps');
      }
      // the ribbon's sill, a concrete course along it
      faceBox(sink, concrete, face, r.u, r.y - 0.07, 0.06, r.w + 0.3, 0.14, 0.12, { decor: true, shade: 0.92 });
    };
    for (const r of backRibbons) ribbon(works.back, r);
    for (const name of ['left', 'right'] as const) {
      const face = works[name];
      for (const r of endRibbons) ribbon(face, r);
      sandbagWindow(sink, face, -eu, 0.9, 1.6, 1.4, look);
      faceBox(sink, 'structureMetal', face, eu, 1.175, -rev + 0.05, 1.2, 2.25, 0.06, { decor: true, colour: shade(IRON, 1.4 + look() * 0.4) });
    }
    // the loading door's shutter half up over the dark of the press hall
    faceBox(sink, 'structureMetal', works.back, door.u, 2.35, -rev + 0.05, door.w, 1.9, 0.06, { decor: true, colour: shade(ROLL_SHUTTER, 0.8 + look() * 0.2) });
    faceBox(sink, concrete, works.back, door.u, 3.5, 0.15, door.w + 0.8, 0.3, 0.3, { decor: true, shade: 0.9 });
    // the frame's piers between the ribbons (the back) and at the ends' corners, the parapet round the roof
    for (let s = 0; s <= segs; s++) {
      faceBox(sink, concrete, works.back, -W / 2 + m / 2 + s * (segW + m), (bh - 0.4) / 2, 0.09, 0.62, bh + 0.4, 0.18, { decor: true }, 'caps');
    }
    const par = { decor: true, shade: 0.94 } as const;
    sink.span(concrete, -W / 2, bh, bz0, W / 2, bh + 0.55, bz0 + 0.28, par);
    sink.span(concrete, -W / 2, bh, bz1 - 0.28, W / 2, bh + 0.55, bz1, par);
    for (const sx of [-1, 1]) sink.span(concrete, sx * W / 2, bh, bz0 + 0.28, sx * (W / 2 - 0.28), bh + 0.55, bz1 - 0.28, par);
    // (dome-detail-275, the church's shell strike) the roof's breach: the roofing burnt black round the hole, the dark of
    // the press hall in it, the purlins across it (one broken short), the sheets peeled back at its rim, the rubble round it
    {
      const hx = -W * 0.12 + (look() - 0.5) * W * 0.1, hz = (bz0 + bz1) / 2, r = Math.min(3.0, pd * 0.28);
      const rough = Array.from({ length: 9 }, () => 0.72 + look() * 0.28);
      const blot = (rr: number, lift: number, bucket: RegionalBucket, opts: { colour?: Rgb; decor: true }) => sink.polygon(bucket, [[hx, bh + lift, hz] as Vec3,
        ...Array.from({ length: 10 }, (_, j): Vec3 => { const a = -(j % 9) / 9 * Math.PI * 2, q = rr * rough[j % 9]; return [hx + Math.cos(a) * q * 1.3, bh + lift, hz + Math.sin(a) * q]; })], opts);
      blot(r, 0.02, 'structureMetal', { colour: rgb(0x2b2622), decor: true });
      blot(r * 0.58, 0.04, 'dark', { decor: true });
      for (const [k, dx] of [-0.55, 0, 0.55].entries()) {
        const x = hx + dx * r, len = k === 1 ? r * (0.9 + look() * 0.4) : r * 2.1;
        sink.member('structureMetal', [x, bh, hz - r * 1.05], [x, bh, hz - r * 1.05 + len], 0.1, 0.16, [0, 1, 0], { colour: shade(IRON, 1.3), decor: true, ends: true }, 0.02);
      }
      for (let j = 0; j < 4; j++) {
        const a = (j / 4) * Math.PI * 2 + look() * 0.8, p: Vec3 = [hx + Math.cos(a) * r * 1.15, bh, hz + Math.sin(a) * r * 0.82], lift = 0.3 + look() * 0.4;
        sink.member('structureMetal', p, [p[0] + Math.cos(a) * 0.6, p[1] + lift, p[2] + Math.sin(a) * 0.6], 0.6, 0.02, normalize3([-Math.cos(a), 1, -Math.sin(a)]),
          { colour: shade(ZINC, 0.7), decor: true, exposed: true }, 0);
      }
      for (let j = 0; j < 5; j++) {
        const a = look() * Math.PI * 2, x = hx + Math.cos(a) * r * 1.5, z = clampTo(hz + Math.sin(a) * r * 1.1, bz0 + 0.8, bz1 - 0.8), s2 = 0.25 + look() * 0.35;
        sink.placed(look() * Math.PI, x, bh, z, () => sink.span('stone', -s2, -0.05, -s2 * 0.7, s2, s2 * 0.8, s2 * 0.7, { decor: true, shade: 0.85 }));
      }
      // the plant on the roof: the press hall's extract housings and a flue
      for (const sx of [-1, 1]) {
        const x = sx * W * 0.32, z = bz0 + 1.6;
        sink.span(concrete, x - 0.8, bh, z - 0.6, x + 0.8, bh + 1.3, z + 0.6, { decor: true, shade: 0.9 });
        faceBox(sink, 'structureMetal', { origin: [x, 0, z + 0.6], u: [1, 0, 0], out: [0, 0, 1], width: 1.6 }, 0, bh + 0.75, 0.02, 1.2, 0.6, 0.04, { decor: true, colour: shade(ZINC, 0.8) });
      }
      sink.cylinder('structureMetal', [W * 0.32, bh + 1.3, bz0 + 1.6], 'y', 2.4, 0.22, 8, { colour: shade(ZINC, 0.6), decor: true }, 0.22);
    }
    if (stub) {
      // the gutted storeys: their window bays open to the burnt-out dark, the soot up the wall over them
      const n = Math.max(2, Math.floor(W / 2.8)), tHoles: HoleRect[] = [], sHoles: HoleRect[] = [];
      for (let fl = 0; fl < 2; fl++) for (let k = 0; k < n; k++) {
        const u = -W / 2 + W * (k + 0.5) / n, bw = W / n - 0.9;
        tHoles.push({ u0: u - bw / 2, u1: u + bw / 2, y0: 0.65 + fl * 3.4, y1: 2.55 + fl * 3.4 });
      }
      // (dome-detail-275) the ends' bays too (they were blank)
      const sw = tz1 - tz0 - 2 * wallT, sn = Math.max(1, Math.floor(sw / 3.2));
      for (let fl = 0; fl < 2; fl++) for (let k = 0; k < sn; k++) {
        const u = -sw / 2 + sw * (k + 0.5) / sn, bw = sw / sn - 0.9;
        sHoles.push({ u0: u - bw / 2, u1: u + bw / 2, y0: 0.65 + fl * 3.4, y1: 2.55 + fl * 3.4 });
      }
      recordBody(sink, 0, (tz0 + tz1) / 2, W, tz1 - tz0, th, concrete, false, true);
      const soot = [sootStain(-W / 2, W / 2, 2.6, th)], sSoot = [sootStain(-sw / 2, sw / 2, 2.6, th)];
      const gutted = holedBox(sink, concrete, -W / 2, tz0, W / 2, tz1, -0.4, th, { front: tHoles, left: sHoles, right: sHoles }, wallT, rev, {},
        { stains: { front: soot, left: sSoot, right: sSoot }, edgeBreaks: DAMP_EDGE_BREAKS });
      // (dome-detail-275) the frame on the gutted storeys' front: the piers between the bays, the slab edges charred
      // across them; on their roof the tower's columns broken off at uneven heights, their bars standing out of them
      const g = gutted.front;
      for (let k = 1; k < n; k++) faceBox(sink, concrete, g, -W / 2 + W * k / n, (th - 0.4) / 2, 0.08, 0.5, th + 0.4, 0.16, { decor: true }, 'caps');
      for (const [y, burn] of [[3.2, 0.62], [6.5, 0.5]] as const) faceBox(sink, concrete, g, 0, y, 0.11, W + 0.04, 0.6, 0.22, { decor: true, shade: burn + look() * 0.2 });
      for (const name of ['left', 'right'] as const) faceBox(sink, concrete, gutted[name], 0, 3.2, 0.11, tz1 - tz0 - 0.04, 0.6, 0.22, { decor: true, shade: 0.6 + look() * 0.2 });
      const inside = W / 2 - cs - 1.0;
      for (let k = 1; k < n; k++) {
        const x = -W / 2 + W * k / n, z = tz1 - 0.5, hs = 0.4 + look() * 2.6;
        sink.span(concrete, x - 0.24, th, z - 0.24, x + 0.24, th + hs, z + 0.24, { decor: true, shade: 0.85 + look() * 0.1 });
        for (const dx of [-0.14, 0.14]) rebar(sink, [x + dx, th + hs - 0.15, z], [x + dx + (look() - 0.5) * 0.14, th + hs + 0.4 + look() * 0.6, z + (look() - 0.5) * 0.14]);
        if (Math.abs(x) < inside && look() < 0.6) {
          const z2 = (cz + cs / 2 + tz1) / 2 - 0.4, h2 = 1.2 + look() * 1.6;
          sink.span(concrete, x - 0.24, th, z2 - 0.24, x + 0.24, th + h2, z2 + 0.24, { decor: true, shade: 0.8 });
        }
      }
    } else sink.span('dark', -W * 0.2, bh - 0.02, bz0 + 1.5, W * 0.1, bh + 0.02, bz1 - 1.5, { decor: true });
    const span = W - 2 * cs - 1.2, fh = 3.4, firstFloor = stub ? th : fh;
    for (const side of [-1, 1]) {
      const cx = side * (W / 2 - cs / 2 - 0.6), h = ch * (side > 0 ? 1 : 0.86 + rng() * 0.08);
      // the core's walls round it, the fire's soot darkening up them to the head
      const soot = [0, 1, 2, 3].map(() => h * (0.3 + look() * 0.3));
      const coreStain = (k: number): Stain[] => [{ u0: -cs / 2, u1: cs / 2, y0: soot[k], y1: h, bottom: 1, top: 0.42 }];
      recordShaft(sink, cx, cz, cs, h, concrete, true);
      // (dome-detail-275) the openings up the core, floor by floor: the lift's and the stair's doorways onto the lobby
      // that fell (a blast's breach now and then), the stair's windows at its half landings on the outer face, the
      // landing windows over the print works' roof at the back; on the inner face a slab's stub where the floor tore
      // off, a doorway into the void where it went whole
      const outer = side < 0 ? 'left' : 'right', inner = side < 0 ? 'right' : 'left', hw = cs / 2 - 0.3;
      const holes: Record<'front' | 'back' | 'left' | 'right', HoleRect[]> = { front: [], back: [], left: [], right: [] };
      type Floor = { y: number; burnt: boolean; frontTop: number; innerStub: boolean };
      const floors: Floor[] = [];
      for (let y = firstFloor; y + fh < h - 0.3; y += fh) {
        let frontTop = y + 2.35;
        for (const du of [-1, 1].map((s2) => s2 * Math.min(1.05, cs * 0.21))) {
          const dw = Math.min(0.5, cs * 0.09);
          if (look() < 0.12) { holes.front.push({ u0: du - dw - 0.3, u1: du + dw + 0.2, y0: y + 0.15, y1: y + 2.9 }); frontTop = y + 2.9; }
          else holes.front.push({ u0: du - dw, u1: du + dw, y0: y + 0.15, y1: y + 2.35 });
        }
        if (y + 1.0 > bh + 0.4) holes.back.push({ u0: -Math.min(0.6, hw - 0.3), u1: Math.min(0.6, hw - 0.3), y0: y + 1.0, y1: y + 2.3 });
        holes[outer].push({ u0: -0.4, u1: 0.4, y0: y + 1.75, y1: y + 3.1 });
        const innerStub = y > firstFloor + 0.1 && look() < 0.55;
        if (!innerStub) holes[inner].push({ u0: -Math.min(0.7, hw - 0.3), u1: Math.min(0.7, hw - 0.3), y0: y + 0.15, y1: y + 2.35 });
        floors.push({ y, burnt: look() < 0.45, frontTop, innerStub });
      }
      const core = holedBox(sink, concrete, cx - cs / 2, cz - cs / 2, cx + cs / 2, cz + cs / 2, -0.4, h, holes, 0.3, 0.24, {},
        { stains: { front: coreStain(0), right: coreStain(1), back: coreStain(2), left: coreStain(3) }, edgeBreaks: DAMP_EDGE_BREAKS });
      // (dome-detail-275) each floor's torn slabs charred, the soot over a burnt floor's doorways; the slab stubs on the
      // inner face (the buildings stream, 2026-10-12, the integrity check: a stub drawn deeper than long stood up to 1.2 m
      // off its core on nothing: each stub from the core's face, its drawn length out)
      for (const fl of floors) {
        if (fl.burnt && fl.y + 3.45 - fl.frontTop > 0.3) sootBand(sink, concrete, core.front, -hw - 0.2, hw + 0.2, fl.frontTop + 0.03, fl.y + 3.45);
        if (fl.y > firstFloor + 0.1 && look() < 0.6) slabStub(sink, core.front, -cs / 2 + 0.1 + look() * 1.2, cs / 2 - 0.1 - look() * 1.2, fl.y, 0.3 + look() * 1.1, 0.5 + look() * 0.3, look);
        if (fl.y > bh + 0.5 && look() < 0.5) slabStub(sink, core.back, -hw + look() * 0.8, hw - look() * 0.8, fl.y, 0.3 + look() * 0.8, 0.55 + look() * 0.3, look);
        if (fl.innerStub) {
          const so = 1.2 + look() * 2.4;
          slabStub(sink, core[inner], -cs * 0.45, cs * 0.45, fl.y, so, 0.55 + look() * 0.35, look);
          if (fl.burnt) sootBand(sink, concrete, core[inner], -hw, hw, fl.y + 0.02, fl.y + 1.6);
        }
      }
      // (dome-detail-275) the tower's frame still hanging off the core's inner face over a few floors: its spandrels out
      // over the void, torn off at uneven lengths, its columns between them where both still reach
      const xin = cx - side * cs / 2, dir = -side, zf = cz + cs / 2;
      if (floors.length > 3) {
        const i0 = Math.min(floors.length - 3, Math.floor(floors.length * (0.3 + look() * 0.35)));
        const lens = [0, 1, 2].map(() => 1.4 + look() * Math.max(0.2, Math.min(span * 0.42, 5.6) - 1.4));
        for (let k = 0; k < 3; k++) {
          const y = floors[i0 + k].y;
          sink.span(concrete, xin - dir * 0.05, y - 0.3, zf - 0.28, xin + dir * lens[k], y + 0.85, zf + 0.04, { decor: true, shade: 0.7 + look() * 0.25 });
          if (k < 2) for (let d = 1.4; d + 0.2 < Math.min(lens[k], lens[k + 1]); d += 1.4) {
            const x = xin + dir * d;
            sink.span(concrete, x - 0.13, y + 0.85, zf - 0.26, x + 0.13, floors[i0 + k + 1].y - 0.3, zf, { decor: true, shade: 0.8 });
          }
          rebar(sink, [xin + dir * (lens[k] - 0.1), y - 0.1, zf - 0.12], [xin + dir * (lens[k] - 0.1), y - 0.7 - look() * 0.8, zf - 0.12 + (look() - 0.5) * 0.1]);
        }
      }
      // (dome-detail-275) the head broken ragged: its walls torn down unevenly, stepped teeth standing over the cut, the
      // bars out of them (they were six brown sticks on a flat top)
      for (const zs of [cz + cs / 2 - 0.3, cz - cs / 2]) {
        const x0 = cx - cs / 2 + look() * (cs - 2.2), w0 = 1.0 + look() * 1.2, t0 = 0.6 + look() * 1.6;
        sink.span(concrete, x0, h, zs, x0 + w0, h + t0, zs + 0.3, { decor: true, shade: 0.8 });
        sink.span(concrete, x0 + 0.15, h + t0, zs, x0 + w0 * (0.4 + look() * 0.3), h + t0 + 0.4 + look() * 0.9, zs + 0.3, { decor: true, shade: 0.74 });
        for (let k = 0; k < 3; k++) {
          const x = x0 + 0.1 + look() * (w0 - 0.2), z = zs + 0.15;
          rebar(sink, [x, h + t0 - 0.2, z], [x + (look() - 0.5) * 0.16, h + t0 + 0.5 + look() * 0.8, z + (look() - 0.5) * 0.16]);
        }
      }
      sink.dressing(mobile, () => {
        for (let k = 0; k < 6; k++) {
          const x = cx + (look() - 0.5) * cs * 0.9, z = cz + (look() - 0.5) * cs * 0.9;
          rebar(sink, [x, h - 0.2, z], [x + (look() - 0.5) * 0.2, h + 0.6 + look() * 0.9, z + (look() - 0.5) * 0.2]);
        }
      });
      if (side > 0) {
        sink.cylinder('structureMetal', [cx, h, cz], 'y', 7.5, 0.12, 6, { colour: rgb(0xb4b2aa), decor: true }, 0.06);
        for (const k of [0.4, 0.7]) sink.member('structureMetal', [cx - 0.9, h + 7.5 * k, cz], [cx + 0.9, h + 7.5 * k, cz], 0.05, 0.05, [0, 0, 1], { colour: rgb(0xb4b2aa), decor: true, exposed: true }, 0);
      }
    }
    // slabs hanging between the cores, the mound of the fallen floors
    for (let k = 0; k < 3; k++) {
      const y = 8 + k * (ch * 0.22) + look() * 3;
      // (the integrity check, 2026-10-12: the slabs stopped 20 cm short of both cores, hanging in the air between them)
      // each slab's ends held in the cores' faces
      const a: Vec3 = [-span / 2 - 0.1, y, cz], b: Vec3 = [span / 2 + 0.1, y - 2 - look() * 6, cz + (look() - 0.5) * 2];
      sink.member(concrete, a, b, cs * 0.9, 0.26, normalize3([0.2, 1, 0]), { decor: true, exposed: true });
    }
    // (dome-detail-275: the mound and its slabs stood inside the gutted storeys, out of sight) the fallen floors heaped on
    // the gutted storeys' roof between the cores, in steps, the slabs tipped up out of it
    const base = stub ? th : 0, mz0 = stub ? tz0 + 0.4 : cz - cs, mz1 = stub ? tz1 - 1.1 : Math.min(D / 2, cz + cs * 1.4);
    sink.span('stone', -span / 2 - 0.5, base - 0.3, mz0, span / 2 + 0.5, base + 0.9, mz1, { decor: true });
    for (let k = 0; k < 2; k++) {
      const x0 = (look() - 0.5) * span * 0.6, hw2 = span * (0.15 + look() * 0.12);
      sink.span('stone', x0 - hw2, base + 0.9, mz0 + 0.5 + look(), x0 + hw2, base + 1.5 + look() * 0.8, mz1 - 0.5 - look(), { decor: true, shade: 0.9 });
    }
    // (a phone keeps two of the six slabs, every slab drawn)
    for (let k = 0; k < 6; k++) {
      const x = (look() - 0.5) * span, z = clampTo(cz + (look() - 0.3) * cs, mz0 + 1, mz1 - 1);
      const dx = (look() - 0.5) * 3, topY = base + 2.2 + look() * 2, dz = (look() - 0.5) * 3, wide = 2 + look() * 2;
      if (!mobile || k < 2) sink.member(concrete, [x, base + 0.8, z], [x + dx, topY, z + dz], wide, 0.24, [0, 1, 0], { decor: true, exposed: true });
    }
    sink.dressing(mobile, () => {
      shellPocks(sink, pf, { u0: -W / 2 + 0.4, u1: W / 2 - 0.4, y0: stub ? th + 0.3 : 0.6, y1: bh - 0.6 }, 30, pHoles, look, 'stone');
      // (dome-detail-275) the splinters' pocks down the print works' back and ends, clear of the glazing
      shellPocks(sink, works.back, { u0: -W / 2 + 0.4, u1: W / 2 - 0.4, y0: 0.4, y1: bh - 0.4 }, 24, bHoles, look, 'stone');
      for (const name of ['left', 'right'] as const) shellPocks(sink, works[name], { u0: -pd / 2 + 0.8, u1: pd / 2 - 0.8, y0: 0.4, y1: bh - 0.4 }, 10, eHoles, look, 'stone');
    });
    // (dome-detail-275) the ruin set into its ground: the fallen concrete at the gutted storeys' foot and along the
    // print works' back
    for (let k = 0; k < 7; k++) {
      const front = k < 4, x = (look() - 0.5) * (W - 2), z = front ? D / 2 - 0.2 + look() * 0.1 : bz0 + 0.2 - look() * 0.1, s2 = 0.25 + look() * 0.25;
      sink.placed(look() * Math.PI, x, 0, z, () => sink.span('stone', -s2, -0.2, -s2 * 0.6, s2, s2 * 0.7, s2 * 0.6, { decor: true, shade: 0.82 }));
    }
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
