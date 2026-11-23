// src/world/maps/regional/sarajevoParliament.ts — the Sarajevo kit's parliament tower (the megatower on the boulevard,
// sarajevoTowers.ts megatower; the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder
// was taken extract-then-own and rebuilt here on the r2 standard).
//
// The r2 sweep measured it 0.92 plain boxes by area (g0): every floor was three closed prisms stacked (the spandrel, the
// slab edge, the core behind the glass), their caps — hidden between the floors — most of its surface, the fins and the
// corner piers bare boxes, the roof, the plant room, the podium and the assembly wing more boxes. Now each floor is its
// slab and its spandrel as sections swept round the plan (sweep): the slab's soffit over the window under it, the slab
// edge 5 cm proud, the spandrel panel on it with its sill back to the glazing line, the glazing wall up to the next
// slab's soffit (a gutted floor's floor runs a bay deep to its charred back wall). The fins are tapered concrete fins
// with a chamfered nose, the corner piers chamfered columns, the roof a slab with its parapet, coping and deck, the
// plant room with its cornice, the podium a plinth with its chamfered course, the wing a body with its parapet.
import { holedBox, recordBody, type HoleRect } from './house.ts';
import { PartSink, faceBox, facePanel, facePoint, normalize3, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import type { RegionalBuildContext } from './types.ts';
import { CHAR, IRON, clampTo, fillOf, sandbagWindow, shellPocks, sootBand, unhcrSheet } from './sarajevoParts.ts';

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
const rect = (x0: number, z0: number, x1: number, z1: number): Array<[number, number]> => [[x0, z1], [x1, z1], [x1, z0], [x0, z0]];


type PaneState = 'glass' | 'lit' | 'gone' | 'burnt' | 'sheet';
/** A section across a facade: [proud of the plan's face line (m; negative: behind it), height]. */
type Section = ReadonlyArray<readonly [number, number]>;

/** The rooms behind the glass (the dark bucket's tone; in the spandrel's welded strip). */
const ROOMS: Rgb = [0.045, 0.047, 0.05];
const CONCRETE: Rgb = rgb(0x9a968c);

/**
 * A section swept round a convex plan (counter-clockwise seen from above): one welded band of quads a section segment
 * and plan edge, the corners mitred (insetPlan), no caps. A section run upward keeps its outside out.
 */
function sweep(sink: PartSink, bucket: RegionalBucket, plan: ReadonlyArray<readonly [number, number]>, section: Section, opts: EmitOptions = {},
  colourOf?: (k: number) => Rgb): void {
  const rings = section.map(([o, y]) => insetPlan(plan, -o).map(([x, z]): Vec3 => [x, y, z]));
  for (let k = 0; k + 1 < rings.length; k++) {
    const a = rings[k], b = rings[k + 1], o = colourOf ? { ...opts, colour: colourOf(k) } : opts;
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      sink.quad(bucket, a[i], a[j], b[j], b[i], o);
    }
  }
}

/** A deck over a plan at y (counter-clockwise seen from above: it faces up). */
function deck(sink: PartSink, bucket: RegionalBucket, plan: ReadonlyArray<readonly [number, number]>, y: number, opts: EmitOptions = {}): void {
  sink.polygon(bucket, plan.map(([x, z]): Vec3 => [x, y, z]), opts);
}

/**
 * A column of half size r with its arrises chamfered 6 cm: its sides, and its caps where it stands proud of the slab's
 * edge (`capped`: a corner pier reaches 7.5 cm past the face line, past the soffit over it and the sill under it).
 */
function pier(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, r: number, y0: number, y1: number, capped = false): void {
  const c = Math.min(0.06, r * 0.3);
  const plan: Array<[number, number]> = [[cx - r + c, cz + r], [cx + r - c, cz + r], [cx + r, cz + r - c], [cx + r, cz - r + c],
    [cx + r - c, cz - r], [cx - r + c, cz - r], [cx - r, cz - r + c], [cx - r, cz + r - c]];
  sweep(sink, bucket, plan, [[0, y0], [0, y1]]);
  if (!capped) return;
  deck(sink, bucket, plan, y1);
  sink.polygon(bucket, plan.map(([x, z]): Vec3 => [x, y0, z]).reverse());
}

/**
 * A tapered concrete fin from the glazing line (`rec` behind the face line) out to the face line, its nose chamfered,
 * standing from y0 to y1 at u along the face: sides only (its foot and head are in the slab).
 */
function fin(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y0: number, y1: number, root: number, rec: number, opts: EmitOptions): void {
  const r = root / 2, n = r * 0.7, c = Math.min(0.025, n * 0.4);
  const sec: Array<[number, number]> = [[-r, -rec], [r, -rec], [n, -c], [n - c, 0], [-n + c, 0], [-n, -c]];
  const at = (s: readonly [number, number], y: number) => facePoint(face, u + s[0], y, s[1]);
  for (let i = 0; i < sec.length; i++) {
    const a = sec[i], b = sec[(i + 1) % sec.length];
    // (the section runs round the fin with the face's u and out; its sides wind outward whichever way the face turns)
    sink.quad(bucket, at(b, y0), at(a, y0), at(a, y1), at(b, y1), opts);
  }
}

/** (dome-detail-275) Rust on the bars the fire and the blasts left bare; the burnt frames' char. */
const REBAR = rgb(0x5a3a28), BURNT_FRAME = rgb(0x4a4540), ASH = rgb(0x45433f);

/**
 * (dome-detail-275) A bar left bare: from `a` (inside what holds it) to `b`, kept within 20 degrees of the plumb (a raking
 * bar must meet something at both ends: kitConnectivity). Fine joinery.
 */
function rebar(sink: PartSink, a: Vec3, b: Vec3): void {
  sink.member('structureMetal', a, b, 0.032, 0.032, normalize3([b[2] - a[2] || 1e-3, 0, -(b[0] - a[0])]), { colour: REBAR, decor: true, fine: true, exposed: true }, 0);
}

const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * (dome-detail-275; the work list: "its gutted floors are plain slabs") A gutted floor's burnt bay over its floor (y0)
 * to the next soffit (y1): the frame's columns standing at the face line a bay apart, charred; the curtain wall's
 * burnt mullions where they still stand on the glazing line, hang from the soffit or stick up from the sill; here and
 * there a length of the slab's edge (its top at `ye`) broken off and hanging over the face, its bars bare along the
 * break.
 */
function guttedBay(sink: PartSink, faces: readonly Face[], slab: RegionalBucket, y0: number, y1: number, ye: number, rec: number, deep: number,
  step: number, look: () => number): void {
  // the floor over it fallen in across one bay: its slab leaning from the soffit at the back wall down to the floor
  // behind the face line
  const fall = look() < 0.34 ? Math.floor(look() * faces.length) : -1;
  for (const [fi, fc] of faces.entries()) {
    if (fi === fall && fc.width > 5) {
      const u = (look() - 0.5) * (fc.width - 5), wl = 2.4 + look() * 1.6;
      const A = facePoint(fc, u, y1 - 0.12, -deep + 0.35), B = facePoint(fc, u + (look() - 0.5) * 0.6, y0 + 0.12, -0.7);
      const d = normalize3([B[0] - A[0], B[1] - A[1], B[2] - A[2]]);
      sink.member(slab, A, B, wl, 0.22, normalize3(cross3(d, fc.u)), { decor: true, exposed: true, shade: 0.62 }, 0.11);
    }
    const n = Math.max(2, Math.round(fc.width / 3.6));
    for (let k = 1; k < n; k++) {
      const [x, , z] = facePoint(fc, -fc.width / 2 + fc.width * k / n, 0, -0.34);
      sweep(sink, slab, rect(x - 0.19, z - 0.19, x + 0.19, z + 0.19), [[0, y0], [0, y1]], { decor: true, shade: 0.5 + look() * 0.2 });
    }
    const m = Math.max(1, Math.round(fc.width / step));
    for (let k = 1; k < m; k++) {
      const u = -fc.width / 2 + fc.width * k / m, r = look();
      if (r < 0.55) continue;
      const [a, b] = r < 0.74 ? [y0, y1] : r < 0.88 ? [y1 - 0.4 - look() * 1.0, y1] : [y0, y0 + 0.3 + look() * 0.7];
      sink.member('structureMetal', facePoint(fc, u, a, -rec - 0.05), facePoint(fc, u, b, -rec - 0.05), 0.07, 0.1, fc.out, { colour: BURNT_FRAME, decor: true, fine: true }, 0);
    }
    if (look() >= 0.5 || fc.width < 4) continue;
    const wf = 1.8 + look() * 1.8, uc = (look() - 0.5) * (fc.width - wf - 1.2), tilt = 0.9 + look() * 0.4, L = Math.min(wf * 0.6, 0.8 + look() * 0.35);
    const A = facePoint(fc, uc, ye - 0.12, 0.02), ay: Vec3 = [fc.out[0] * Math.cos(tilt), -Math.sin(tilt), fc.out[2] * Math.cos(tilt)];
    const B: Vec3 = [A[0] + ay[0] * L, A[1] + ay[1] * L, A[2] + ay[2] * L];
    sink.member(slab, A, B, wf, 0.2, normalize3(cross3(ay, fc.u)), { decor: true, exposed: true, shade: 0.6 }, 0.1);
    for (let j = 0; j < 2; j++) {
      const u = uc + (j - 0.5) * wf * 0.5 + (look() - 0.5) * 0.2;
      rebar(sink, facePoint(fc, u, ye - 0.06, 0.03), facePoint(fc, u + (look() - 0.5) * 0.06, ye - 0.5 - look() * 0.9, 0.07));
    }
  }
}

/**
 * The parliament slab's floors (the r2 rebuild of the kit's curtainFloors for this tower): per floor the slab (its soffit
 * over the window under it, its edge 5 cm proud) and the spandrel strip on it (the panel, its sill back to the glazing
 * line, the glazing wall up to the next soffit), each one welded section round the plan; the corner piers closing each
 * face's bay; the panes or the sheeting on the glazing line; a gutted floor's floor a bay deep to its charred back wall,
 * the columns at the face line, the soot up to the next floor; the fins up each run of standing floors. Returns the
 * last floor's glazing depth (the roof's soffit runs to it).
 */
function slabFloors(sink: PartSink, plan: ReadonlyArray<readonly [number, number]>, y0: number, floors: number, fh: number,
  spandrel: Rgb, slab: RegionalBucket, state: (floor: number, face: number) => PaneState, look: () => number,
  opts: { rec: number; deep: number; step: number; finW: number; mobile: boolean }): number {
  const { rec } = opts, faces = planFaces(plan), spH = fh * 0.32, edge = 0.32;
  const shallow = insetPlan(plan, rec);
  const xs = plan.map(([x]) => x), zs = plan.map(([, z]) => z);
  const span = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const dI = Math.max(rec + 0.4, Math.min(opts.deep, span * 0.3));
  const guttedFloors: boolean[] = [];
  let below = rec;
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh;
    const states = faces.map((_, fi) => state(f, fi));
    const gutted = states.filter((s2) => s2 === 'gone' || s2 === 'burnt').length > faces.length / 2;
    guttedFloors.push(gutted);
    const burnt = states.some((s2) => s2 === 'burnt');
    // (dome-detail-275) a burnt panel's concrete sooted black but still concrete, a gutted floor's floor ash-grey (they
    // were the char's flat black: the gutted floors read as plain dark slabs)
    const panel = burnt ? shade(CONCRETE, 0.3 + look() * 0.12) : shade(spandrel, 0.92 + look() * 0.14);
    const back = gutted ? dI : rec;
    // the slab: its soffit from the glazing (or the gutted bay's back) of the floor under it out to its edge, the edge
    sweep(sink, slab, plan, [[-below, y], [0.05, y], [0.05, y + edge], [0, y + edge]]);
    // the spandrel strip on it: the panel, its sill to the glazing line (a gutted floor's floor to its back wall), the
    // glazing wall (the rooms behind the glass; the charred back wall) up to the next floor's soffit
    sweep(sink, 'structureMetal', plan, [[0, y + edge], [0, y + spH], [-back, y + spH], [-back, y + fh]], {},
      (k) => (k === 0 ? panel : k === 1 ? (gutted ? ASH : panel) : gutted ? CHAR : ROOMS));
    below = back;
    if (gutted) {
      // the columns at the face line over the gutted bay, and the soot up to the next floor
      for (const [x, z] of shallow) pier(sink, slab, x, z, 0.22, y + spH, y + fh);
      faces.forEach((fc) => { if (burnt && f + 1 < floors) sootBand(sink, slab, fc, -fc.width / 2, fc.width / 2, y + fh, y + fh + 0.8); });
      guttedBay(sink, faces, slab, y + spH, y + fh, y + edge, rec, dI, opts.step, look);
      continue;
    }
    // the corner piers closing each face's bay of glazing (a bay ends at the corners: no view along the recess round them)
    plan.forEach(([x, z], k) => {
      const [ix, iz] = shallow[k];
      pier(sink, slab, (x + ix) / 2, (z + iz) / 2, Math.max(rec * 0.6, 0.3), y + spH, y + fh, true);
    });
    // the panes on the glazing line (lit, plain) or the sheeting across a face's mouth
    planFaces(shallow).forEach((cf, fi) => {
      const st = states[fi] ?? 'glass';
      if (st === 'sheet' && faces[fi].width >= 3.5) { unhcrSheet(sink, faces[fi], 0, y + spH - 0.02, faces[fi].width - 0.6, fh - spH + 0.04, look); return; }
      if (st === 'gone' || st === 'burnt') return;
      facePanel(sink, st === 'lit' ? 'curtain' : 'glass', cf, 0, y + spH + (fh - spH) / 2, 0.012, cf.width - 0.1, fh - spH - 0.04, { decor: true, window: cf.out });
    });
  }
  // the fins: from the glazing line out to the face line, up each run of standing floors (a gutted floor's bay has its
  // columns; a fin there would stand in the air with its back open)
  if (opts.mobile) return below;
  for (let f = 0; f < floors;) {
    if (guttedFloors[f]) { f++; continue; }
    let e = f;
    while (e + 1 < floors && !guttedFloors[e + 1]) e++;
    const ya = y0 + f * fh, yb = y0 + (e + 1) * fh;
    faces.forEach((fc) => {
      const n = Math.max(1, Math.round(fc.width / opts.step));
      for (let k = 1; k < n; k++) fin(sink, slab, fc, -fc.width / 2 + fc.width * k / n, ya, yb, opts.finW, rec, { decor: true });
    });
    f = e + 1;
  }
  return below;
}

/**
 * The parliament's tower (props census #9; the looks lane's r2, 2026-10-16): the slab of floors behind its grid of
 * tapered fins on a podium, its burnt floors gutted a bay deep, its roof slab with a parapet and the plant room, in front
 * of the low assembly wing. (dome-detail-275) The gutted floors' burnt frames (guttedBay); the wing's upper storey on its
 * pilotis over the glazed ground storey, its window grids cut through front and sides, its roof's clerestory and breach.
 */
export function parliament(ctx: RegionalBuildContext): RegionalParts {
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
    const plan = rect(-W / 2 + 0.2, tz0 + 0.2, W / 2 - 0.2, tz1 - 0.2);
    // the podium: a plinth with a chamfered course, the slab's floors from its top
    sweep(sink, concrete, plan, [[0.1, -0.4], [0.1, 0.35], [0, 0.45], [0, 1.2]]);
    sink.polygon(concrete, insetPlan(plan, -0.1).map(([x, z]): Vec3 => [x, -0.4, z]).reverse());
    // (E13) the slab tower in its storey bands for the damage reading; the assembly wing its own body
    recordBody(sink, 0, (tz0 + tz1) / 2, W, tz1 - tz0, top + 3.2, concrete, false, true);
    // the fire took the floors under the top and a few here and there below (the tower burnt for days in 1992)
    const burntFrom = Math.max(1, floors - 7 - Math.floor(rng() * 5));
    const state = (f: number): PaneState => {
      const r = look();
      const burnt = f >= burntFrom ? r < 0.8 : r < 0.12;
      return burnt ? 'burnt' : r < 0.9 ? 'glass' : 'lit';
    };
    const last = slabFloors(sink, plan, 1.2, floors, fh, CONCRETE, concrete, (f) => state(f), look, { rec: 0.45, deep: 2.8, step: 1.75, finW: 0.26, mobile });
    // the roof slab over the last floor (0.2 m proud of the face line, as the old slab), its parapet and coping, the
    // deck sunk in it; the plant room on it with its cornice
    sweep(sink, concrete, plan, [[-last, top], [0.2, top], [0.2, top + 0.75], [-0.12, top + 0.75], [-0.12, top + 0.6]]);
    deck(sink, concrete, insetPlan(plan, 0.12), top + 0.6);
    const cz = (tz0 + tz1) / 2, plant = rect(-W * 0.2, cz - 1.8, W * 0.2, cz + 1.8);
    sweep(sink, concrete, plant, [[0, top + 0.6], [0, top + 3.0], [0.12, top + 3.0], [0.12, top + 3.2], [0, top + 3.2]]);
    deck(sink, concrete, plant, top + 3.2);
    // the assembly wing in front (dome-detail-275; the work list: "its podium a box"): the upper storey carried over the
    // street on a colonnade of pilotis, the ground storey's glazed front set back under it with the entrance's canopy
    // and steps; the upper storey's grid of windows along the front and down the sides over the ground storey's, each
    // cut through its wall (the glass at the back of the cut, burnt out to the dark, sheeted or sandbagged, the soot over
    // a burnt one); the parapet and its coping; on the roof the assembly hall's clerestory, the plant and a shell's breach
    const wz0 = tz1 + 0.6, wz1 = D / 2;
    if (wz1 - wz0 > 2.5) {
      recordBody(sink, 0, (wz0 + wz1) / 2, W, wz1 - wz0, 8.2, concrete);
      const wd = wz1 - wz0, gh = 4.0, top = 8.2, col = wd > 6 ? 1.8 : 0, rev = 0.3;
      const bayN = Math.max(3, Math.round((W - 1.2) / 2.1)), bay = (W - 1.2) / bayN;
      const uOf = (k: number) => -W / 2 + 0.6 + bay * (k + 0.5);
      const front: HoleRect[] = [], ground: HoleRect[] = [];
      for (let k = 0; k < bayN; k++) {
        front.push({ u0: uOf(k) - bay / 2 + 0.28, u1: uOf(k) + bay / 2 - 0.28, y0: gh + 0.75, y1: top - 1.0 });
        ground.push({ u0: uOf(k) - bay / 2 + 0.3, u1: uOf(k) + bay / 2 - 0.3, y0: 0.15, y1: gh - 0.6 });
      }
      const sides = (span: number, y0: number, y1: number): HoleRect[] => {
        const n = Math.max(1, Math.round((span - 1.0) / 2.3)), sb = (span - 1.0) / n;
        return Array.from({ length: n }, (_, k) => ({ u0: -span / 2 + 0.5 + sb * k + 0.4, u1: -span / 2 + 0.5 + sb * (k + 1) - 0.4, y0, y1 }));
      };
      const upSides = sides(wd - 0.8, gh + 0.75, top - 1.0), lowSides = sides(wd - col - 0.8, 0.9, gh - 0.8);
      const up = holedBox(sink, concrete, -W / 2, wz0, W / 2, wz1, gh, top, { front, left: upSides, right: upSides }, 0.4, rev);
      const low = holedBox(sink, concrete, -W / 2 + 0.3, wz0, W / 2 - 0.3, wz1 - col, -0.4, gh, col > 0 ? { front: ground, left: lowSides, right: lowSides } : { left: lowSides, right: lowSides }, 0.4, rev);
      // the panes at the backs of the cuts (or the dark), the mullion in each upper light, the soot over a burnt one
      let sheets = 0, bags = 0;
      const pane = (face: Face, h: HoleRect, mullion: boolean) => {
        const u = (h.u0 + h.u1) / 2, w = h.u1 - h.u0, ht = h.y1 - h.y0, r = look();
        if (r < 0.3) { sootBand(sink, concrete, face, h.u0 - 0.1, h.u1 + 0.1, h.y1, h.y1 + 0.9); return; }
        if (r < 0.42 && w > 1.2 && sheets < 2) { sheets++; unhcrSheet(sink, face, u, h.y0, w + 0.2, ht, look); return; }
        if (r < 0.5 && h.y0 < 2 && bags < 1) { bags++; sandbagWindow(sink, face, u, h.y0, w, ht, look); return; }
        facePanel(sink, 'glass', face, u, (h.y0 + h.y1) / 2, -rev + 0.012, w, ht, { decor: true, window: face.out });
        if (mullion) faceBox(sink, 'structureMetal', face, u, (h.y0 + h.y1) / 2, -rev + 0.04, 0.07, ht, 0.05, { colour: IRON, decor: true, fine: true });
      };
      for (const h of front) pane(up.front, h, true);
      for (const name of ['left', 'right'] as const) { for (const h of upSides) pane(up[name], h, true); for (const h of lowSides) pane(low[name], h, false); }
      if (col > 0) {
        for (const h of ground) pane(low.front, h, false);
        // the pilotis under the upper storey's front, a bay apart
        for (let k = 0; k <= bayN; k++) { const x = -W / 2 + 0.6 + bay * k, z = wz1 - 0.4; sweep(sink, concrete, rect(x - 0.22, z - 0.22, x + 0.22, z + 0.22), [[0, -0.4], [0, gh]]); }
        // the entrance's canopy in the middle bay over its steps
        const eu = uOf(Math.floor(bayN / 2)), ez = wz1 - col;
        faceBox(sink, concrete, low.front, eu, gh - 0.75, 0.6, bay - 0.2, 0.18, 1.2, { decor: true }, { back: true });
        for (let k = 0; k < 3; k++) sink.span(concrete, eu - bay / 2 + 0.2 - k * 0.3, -0.4, ez, eu + bay / 2 - 0.2 + k * 0.3, 0.15 - k * 0.15, ez + 0.4 + k * 0.4, { decor: true, shade: 0.9 });
      }
      // the string course over the ground storey's sides, the parapet and its coping round the roof
      for (const name of ['left', 'right', 'front'] as const) faceBox(sink, concrete, up[name], 0, gh + 0.2, 0.06, up[name].width, 0.4, 0.12, { decor: true, shade: 0.92 });
      const body = rect(-W / 2, wz0, W / 2, wz1);
      sweep(sink, concrete, body, [[0.04, top], [0.04, top + 0.7], [-0.24, top + 0.7], [-0.24, top]], { decor: true });
      // the assembly hall's clerestory on the roof, its band of louvres; a shell's breach in the deck beside it
      const hx = Math.min(W * 0.32, 6), hz0 = wz0 + wd * 0.25, hz1 = wz1 - wd * 0.25;
      if (hz1 - hz0 > 1.6) {
        const hall = rect(-hx, hz0, hx, hz1);
        sweep(sink, concrete, hall, [[0, top], [0, top + 1.6], [0.12, top + 1.6], [0.12, top + 1.85], [0, top + 1.85]]);
        deck(sink, concrete, hall, top + 1.85);
        for (const fc of planFaces(hall)) facePanel(sink, 'dark', fc, 0, top + 0.85, 0.01, fc.width - 0.8, 0.9, { decor: true });
        for (const fc of planFaces(hall)) if (fc.width > 3) for (let y = top + 0.55; y < top + 1.25; y += 0.24) faceBox(sink, 'structureMetal', fc, 0, y, 0.04, fc.width - 0.8, 0.05, 0.06, { colour: IRON, decor: true, fine: true });
      }
      const bx = (look() < 0.5 ? -1 : 1) * (hx + (W / 2 - hx) * (0.35 + look() * 0.3)), bz = (wz0 + wz1) / 2 + (look() - 0.5) * wd * 0.3, br = 0.7 + look() * 0.5;
      sink.polygon('dark', Array.from({ length: 9 }, (_, j) => { const a = -j / 9 * Math.PI * 2, rr = br * (0.75 + look() * 0.3); return [bx + Math.cos(a) * rr, top + 0.01, bz + Math.sin(a) * rr] as Vec3; }), { decor: true });
      for (let j = 0; j < 4; j++) {
        const a = j * Math.PI / 2 + look(), s2 = 0.18 + look() * 0.2;
        sink.placed(look() * Math.PI, bx + Math.cos(a) * (br + 0.5), 0, bz + Math.sin(a) * (br + 0.5), () => sink.span(concrete, -s2, top, -s2 * 0.7, s2, top + s2 * 0.8, s2 * 0.7, { decor: true, shade: 0.8 }));
      }
      sink.dressing(mobile, () => shellPocks(sink, up.front, { u0: -W / 2 + 0.6, u1: W / 2 - 0.6, y0: gh + 0.3, y1: top - 0.2 }, 10 + Math.floor(look() * 14),
        front.map((h) => ({ u0: h.u0 - 0.1, u1: h.u1 + 0.1, y0: h.y0 - 0.1, y1: h.y1 + 1.0 })), look, 'stone'));
    }
  });
  return sink.finish();
}
