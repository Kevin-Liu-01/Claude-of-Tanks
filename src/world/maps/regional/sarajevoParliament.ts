// src/world/maps/regional/sarajevoParliament.ts — the Sarajevo kit's parliament tower (the megatower on the boulevard,
// sarajevoTowers.ts megatower), extracted as it was (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is
// parked, so its builder is taken extract-then-own) for this lane to rebuild on the r2 standard.
import { PartSink, faceBox, facePanel, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { holedPolygon, recordBody } from './house.ts';
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

/** The parliament's tower: a slab behind its grid of fins, burnt floors black, the assembly wing in front. */
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
    // (props census #9) the slab's floors built (curtainFloors): the concrete spandrels, the glazing set back behind the
    // grid of fins, the burnt floors gutted a bay deep (they were glass and dark plates on a dark box)
    sink.span(concrete, -W / 2 + 0.2, -0.4, tz0 + 0.2, W / 2 - 0.2, 1.2, tz1 - 0.2);
    sink.span(concrete, -W / 2, top, tz0, W / 2, top + 0.6, tz1);
    // (E13) the slab tower in its storey bands for the damage reading; the assembly wing its own body
    recordBody(sink, 0, (tz0 + tz1) / 2, W, tz1 - tz0, top + 3.2, concrete, false, true);
    sink.span(concrete, -W * 0.2, top + 0.6, (tz0 + tz1) / 2 - 1.8, W * 0.2, top + 3.2, (tz0 + tz1) / 2 + 1.8);
    // the fire took the floors under the top and a few here and there below (the tower burnt for days in 1992)
    const burntFrom = Math.max(1, floors - 7 - Math.floor(rng() * 5));
    const state = (f: number): PaneState => {
      const r = look();
      const burnt = f >= burntFrom ? r < 0.8 : r < 0.12;
      return burnt ? 'burnt' : r < 0.9 ? 'glass' : 'lit';
    };
    curtainFloors(sink, rect(-W / 2 + 0.2, tz0 + 0.2, W / 2 - 0.2, tz1 - 0.2), 1.2, floors, fh, rgb(0x9a968c), concrete, (f) => state(f), look,
      { mobile, step: 1.75, finW: 0.26, finBucket: concrete });
    // the assembly wing in front: two storeys, a ribbon of dark glass, a flat roof
    const wz0 = tz1 + 0.6, wz1 = D / 2;
    if (wz1 - wz0 > 2.5) {
      recordBody(sink, 0, (wz0 + wz1) / 2, W, wz1 - wz0, 8.2, concrete);
      // (its ribbons of glazing cut into its front, the glass at the back of the cuts: they were laid on the span)
      sink.span(concrete, -W / 2, -0.4, wz0, W / 2, 8.2, wz1 - 0.4);
      const wf: Face = { origin: [0, 0, wz1], u: [1, 0, 0], out: [0, 0, 1], width: W };
      holedPolygon(sink, concrete, wf, [[-W / 2, -0.4], [W / 2, -0.4], [W / 2, 8.2], [-W / 2, 8.2]],
        [{ u0: -(W - 1.6) / 2, u1: (W - 1.6) / 2, y0: 0.7, y1: 3.3 }, { u0: -(W - 1.6) / 2, u1: (W - 1.6) / 2, y0: 4.5, y1: 6.7 }], 0.4, 0.34);
      facePanel(sink, 'glass', wf, 0, 2.0, -0.33, W - 1.6, 2.6, { decor: true, window: [0, 0, 1] });
      if (look() < 0.5) { /* (the upper ribbon's glass gone to the dark behind it: the cut's dark shows) */ } else facePanel(sink, 'glass', wf, 0, 5.6, -0.33, W - 1.6, 2.2, { decor: true, window: [0, 0, 1] });
      for (const yy of [2.0, 5.6]) for (let k = 1, n = Math.max(2, Math.round((W - 1.6) / 1.8)); k < n; k++) {
        faceBox(sink, concrete, wf, -(W - 1.6) / 2 + (W - 1.6) * k / n, yy, -0.2, 0.12, yy > 3 ? 2.2 : 2.6, 0.3, { decor: true }, 'caps');
      }
      faceBox(sink, concrete, wf, 0, 8.0, 0.2, W + 0.2, 0.5, 0.4, { decor: true });
      sink.dressing(mobile, () => shellPocks(sink, wf, { u0: -W / 2 + 0.6, u1: W / 2 - 0.6, y0: 3.4, y1: 4.6 }, 10 + Math.floor(look() * 14), [], look, 'stone'));
    }
  });
  return sink.finish();
}
