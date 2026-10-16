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
import { holedPolygon, recordBody } from './house.ts';
import { PartSink, faceBox, facePanel, facePoint, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import type { RegionalBuildContext } from './types.ts';
import { CHAR, clampTo, fillOf, shellPocks, sootBand, unhcrSheet } from './sarajevoParts.ts';

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

/** A column of half size r with its arrises chamfered 6 cm, its sides only (the sill and the soffit close it). */
function pier(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, r: number, y0: number, y1: number, opts: EmitOptions = {}): void {
  const c = Math.min(0.06, r * 0.3);
  const plan: Array<[number, number]> = [[cx - r + c, cz + r], [cx + r - c, cz + r], [cx + r, cz + r - c], [cx + r, cz - r + c],
    [cx + r - c, cz - r], [cx - r + c, cz - r], [cx - r, cz - r + c], [cx - r, cz + r - c]];
  sweep(sink, bucket, plan, [[0, y0], [0, y1]], opts);
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
    const panel = burnt ? CHAR : shade(spandrel, 0.92 + look() * 0.14);
    const back = gutted ? dI : rec;
    // the slab: its soffit from the glazing (or the gutted bay's back) of the floor under it out to its edge, the edge
    sweep(sink, slab, plan, [[-below, y], [0.05, y], [0.05, y + edge], [0, y + edge]]);
    // the spandrel strip on it: the panel, its sill to the glazing line (a gutted floor's floor to its back wall), the
    // glazing wall (the rooms behind the glass; the charred back wall) up to the next floor's soffit
    sweep(sink, 'structureMetal', plan, [[0, y + edge], [0, y + spH], [-back, y + spH], [-back, y + fh]], {},
      (k) => (k < 2 ? panel : gutted ? CHAR : ROOMS));
    below = back;
    if (gutted) {
      // the columns at the face line over the gutted bay, and the soot up to the next floor
      for (const [x, z] of shallow) pier(sink, slab, x, z, 0.22, y + spH, y + fh);
      faces.forEach((fc) => { if (burnt && f + 1 < floors) sootBand(sink, slab, fc, -fc.width / 2, fc.width / 2, y + fh, y + fh + 0.8); });
      continue;
    }
    // the corner piers closing each face's bay of glazing (a bay ends at the corners: no view along the recess round them)
    plan.forEach(([x, z], k) => {
      const [ix, iz] = shallow[k];
      pier(sink, slab, (x + ix) / 2, (z + iz) / 2, Math.max(rec * 0.6, 0.3), y + spH, y + fh);
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
 * of the low assembly wing with its ribbons of glazing cut into the front.
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
    // the assembly wing in front: two storeys, a ribbon of dark glass, a flat roof behind its parapet
    const wz0 = tz1 + 0.6, wz1 = D / 2;
    if (wz1 - wz0 > 2.5) {
      recordBody(sink, 0, (wz0 + wz1) / 2, W, wz1 - wz0, 8.2, concrete);
      // (its ribbons of glazing cut into its front, the glass at the back of the cuts: they were laid on the span)
      const body = rect(-W / 2, wz0, W / 2, wz1 - 0.4);
      sweep(sink, concrete, body, [[0, -0.4], [0, 8.2], [-0.3, 8.2], [-0.3, 7.9]]);
      deck(sink, concrete, insetPlan(body, 0.3), 7.9);
      const wf: Face = { origin: [0, 0, wz1], u: [1, 0, 0], out: [0, 0, 1], width: W };
      holedPolygon(sink, concrete, wf, [[-W / 2, -0.4], [W / 2, -0.4], [W / 2, 8.2], [-W / 2, 8.2]],
        [{ u0: -(W - 1.6) / 2, u1: (W - 1.6) / 2, y0: 0.7, y1: 3.3 }, { u0: -(W - 1.6) / 2, u1: (W - 1.6) / 2, y0: 4.5, y1: 6.7 }], 0.4, 0.34);
      facePanel(sink, 'glass', wf, 0, 2.0, -0.33, W - 1.6, 2.6, { decor: true, window: [0, 0, 1] });
      if (look() < 0.5) { /* (the upper ribbon's glass gone to the dark behind it: the cut's dark shows) */ } else facePanel(sink, 'glass', wf, 0, 5.6, -0.33, W - 1.6, 2.2, { decor: true, window: [0, 0, 1] });
      for (const yy of [2.0, 5.6]) for (let k = 1, n = Math.max(2, Math.round((W - 1.6) / 1.8)); k < n; k++) {
        fin(sink, concrete, wf, -(W - 1.6) / 2 + (W - 1.6) * k / n, yy - (yy > 3 ? 1.1 : 1.3), yy + (yy > 3 ? 1.1 : 1.3), 0.12, 0.34, { decor: true });
      }
      faceBox(sink, concrete, wf, 0, 8.0, 0.2, W + 0.2, 0.5, 0.4, { decor: true });
      sink.dressing(mobile, () => shellPocks(sink, wf, { u0: -W / 2 + 0.6, u1: W / 2 - 0.6, y0: 3.4, y1: 4.6 }, 10 + Math.floor(look() * 14), [], look, 'stone'));
    }
  });
  return sink.finish();
}
