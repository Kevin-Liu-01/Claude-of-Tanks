// src/world/landmarks/railWorks.ts — a coalfield junction's railway works (landmarks-271, 2026-11-06; the owner: "new
// special buildings like the way our airport map has hangars and our seaside map has a harbor area with a lighthouse").
// Cinder Junction is a Ruhr and Upper Silesian yard of 1945; the census (buildings-270 signature places) found its
// signature missing: the engine shed round its turntable and the signal boxes over the throats.
//
// - roundhouse: the Reichsbahn Ringlokschuppen — a segment of brick stalls fanned round the turntable, each stall's
//   door a segmental arch in a pilastered front under a corbelled cornice, a tall iron window in each back bay, the
//   roof a shallow radial gable with its lantern along the ridge and a smoke jack over each stall's chimney; the
//   turntable flush in its pit (the bridge's girders, the operator's cab, the circular rail), the stall roads from the
//   table to the doors and the lead track out to the yard. Some doors stand open on the dark shed and its engines.
// - signalBox: the Stellwerk at a throat — a brick lower storey for the locking frame, the timber operating floor over
//   it in a band of windows on three sides, a hipped roof with its stove pipe, the outside stair to the landing door.
//
// Drawn in their own frames (x across, y up, z out of the front, the ground at y = 0) into the regional part sink, so
// they take the map kit's brick, roofing and weathering and merge into its buckets (no draw call of their own). The
// walls and roofs are structure; the joinery, the rails and the table are dressing (a hull drives over the table).
import { PartSink, facePoint, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { archWindow, archedBody, archedFace, bar, revolve, type ArchHole } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const IRON = rgb(0x2a2b2c), RAIL = rgb(0x4d4440), RAIL_TOP = rgb(0x8c8a86), SOOT = rgb(0x1f1d1c), SLEEPER = rgb(0x3a3029);
const DOOR = rgb(0x4b3a2c), DOOR_PAINT = rgb(0x3d4a3c), FRAME = rgb(0x2f3532), CAB_TIMBER = rgb(0x6b5236), CAB_TRIM = rgb(0xd8d0bc);
const STANDARD_GAUGE = 1.435;

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));
const deg = Math.PI / 180;

/** The roundhouse's plan from its parameters (plan.ts footprint and the builder agree on it). */
export function roundhouseLayout(p: Readonly<Record<string, number | string | boolean>>) {
  const stalls = Math.max(3, Math.min(14, Math.round(Number(p.stalls))));
  const da = Math.max(6, Math.min(12, Number(p.stallDeg))) * deg;
  const Rt = Math.max(8, Number(p.table) / 2), Rf = Math.max(Rt + 8, Number(p.front)), Rb = Rf + Math.max(14, Number(p.depth));
  const lead = Math.max(0, Number(p.lead));
  const half = stalls * da / 2;
  // the turntable's centre on the piece's z axis, so the whole plan (table, lead and stalls) is centred on the origin
  const reachFront = Rt + lead, reachBack = Rb + 0.9;
  const zT = (reachBack - reachFront) / 2;
  const across = Math.max((Rb + 0.6) * Math.sin(Math.min(half + 0.6 / Rb, Math.PI / 2)) + 0.4, Rt + 0.6);
  return { stalls, da, Rt, Rf, Rb, lead, half, zT, across, along: (reachFront + reachBack) / 2 };
}

/** A pair of rails on their sleepers from a to b (plan points, y the rail foot), dressing. */
function track(sink: PartSink, a: readonly [number, number], b: readonly [number, number], y: number): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  if (L < 0.5) return;
  const ux = dx / L, uz = dz / L, nx = uz, nz = -ux, g = STANDARD_GAUGE / 2 + 0.035;
  for (const s of [-1, 1]) {
    const p0: Vec3 = [a[0] + nx * g * s, y + 0.08, a[1] + nz * g * s], p1: Vec3 = [b[0] + nx * g * s, y + 0.08, b[1] + nz * g * s];
    bar(sink, 'structureMetal', p0, p1, 0.075, { colour: RAIL, decor: true });
    // the running surface worn bright
    bar(sink, 'structureMetal', [p0[0], y + 0.125, p0[2]], [p1[0], y + 0.125, p1[2]], 0.05, { colour: RAIL_TOP, decor: true, fine: 'near' });
  }
  for (let t = 0.35; t < L - 0.2; t += 0.65) {
    const cx = a[0] + ux * t, cz = a[1] + uz * t;
    bar(sink, 'structureWood', [cx - nx * 1.3, y + 0.02, cz - nz * 1.3], [cx + nx * 1.3, y + 0.02, cz + nz * 1.3], 0.12, { colour: SLEEPER, decor: true, fine: true });
  }
}

/** A planar wall face from a to b (plan points, a on the left seen from outside), its outward normal to the right of a->b. */
function chordFace(a: readonly [number, number], b: readonly [number, number]): Face {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const u: Vec3 = [dx / L, 0, dz / L];
  // u = (out.z, 0, -out.x)  =>  out = (-u.z, 0, u.x)
  const out: Vec3 = [-u[2], 0, u[0]];
  return { origin: [(a[0] + b[0]) / 2, 0, (a[1] + b[1]) / 2], u, out, width: L };
}

/**
 * The engine shed round its turntable (Reichsbahn Ringlokschuppen, the Ruhr's and Silesia's Bw of the 1910s-30s).
 * Parameters: stalls (count), stallDeg (each stall's angle), table (the turntable's diameter), front (the doors' radius
 * from the table's centre), depth (the stalls' length), lead (the lead track out past the table), open (how many doors
 * stand open), engines (how many engines stand at the open doors).
 */
export const roundhouse: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const L = roundhouseLayout(ctx.params);
  const { stalls, da, Rt, Rf, Rb, half, zT } = L;
  const wall: RegionalBucket = 'stone', foot = -0.6 - ctx.groundFall;
  const Hf = 7.6, Hb = 6.4, Hr = 9.4, Rm = Rf + (Rb - Rf) * 0.42;
  const eave = 0.55;
  // the plan: a stall's ray from the table's centre (angle 0 straight back, -z)
  const at = (theta: number, r: number): [number, number] => [Math.sin(theta) * r, zT - Math.cos(theta) * r];
  const theta = (i: number): number => -half + i * da;
  const openCount = Math.max(0, Math.min(stalls, Math.round(num(ctx, 'open', 0))));
  // which doors stand open: drawn from the look stream, so a new choice never moves the geometry
  const open = new Set<number>();
  const order = Array.from({ length: stalls }, (_, i) => i).sort(() => v() - 0.5);
  for (const i of order.slice(0, openCount)) open.add(i);
  const engines = Math.max(0, Math.min(openCount, Math.round(num(ctx, 'engines', 0))));
  const engineAt = new Set([...open].slice(0, engines));

  // ---- the stalls: front, back and the roof's ceiling (a closed solid, so the shed's whole plan is its record)
  for (let i = 0; i < stalls; i++) {
    const a0 = theta(i), a1 = theta(i + 1), am = (a0 + a1) / 2;
    // the front faces the table: seen from the table, left to right runs from a0 to a1
    const f = chordFace(at(a0, Rf), at(a1, Rf));
    const door: ArchHole = { u: 0, w: Math.min(4.3, f.width - 1.1), y0: 0, spring: 4.7, form: 'segmental', rise: 0.55 };
    const isOpen = open.has(i);
    archedFace(sink, wall, f, { u0: -f.width / 2, u1: f.width / 2, y0: foot, y1: Hf }, [door], isOpen ? 0.62 : 0.32, { through: isOpen });
    // the plinth band, the pilasters between the bays (at each chord's ends, shared with the next bay), the cornice
    faceStrip(sink, wall, f, -f.width / 2 + 0.28, foot, 0.56, Hf - 0.55, 0.16, { shade: 0.95 });
    corbelCornice(sink, wall, f, Hf, f.width);
    // the door: two boarded leaves, closed in its reveal or swung out against the front
    const lw = door.w / 2;
    if (!isOpen) {
      for (const s of [-1, 1]) leaf(sink, f, s * lw / 2, lw - 0.04, door.spring, -0.3, 0, v() < 0.5 ? DOOR : DOOR_PAINT);
      // the wicket door's frame in the right leaf
      sink.member('structureWood', facePoint(f, lw / 2 - 0.45, 0.1, -0.26), facePoint(f, lw / 2 - 0.45, 2.0, -0.26), 0.06, 0.04, f.out,
        { colour: shade(DOOR, 0.7), decor: true, fine: true });
      // the fanlight over the leaves
      archWindow(sink, f, { u: 0, w: door.w - 0.2, y0: door.spring + 0.05, spring: door.spring + 0.06, form: 'segmental', rise: 0.5 }, 0.3, FRAME, false, { bars: true });
    } else {
      // swung open to the front, each leaf at its jamb turned 100-120 degrees out
      for (const s of [-1, 1] as const) {
        const swing = (100 + v() * 22) * deg;
        leafOpen(sink, f, s, lw, door.spring - 0.05, swing, v() < 0.5 ? DOOR : DOOR_PAINT);
      }
      // the dark shed beyond: the stall's floor, its sooted walls and roof seen through the arch, and its pit
      shedInterior(sink, at, a0, a1, Rf + 0.62, Math.min(Rb - 1, Rf + 14), Hf - 0.6);
      if (engineAt.has(i)) engine(sink, at, am, Rf - 3.2, v);
    }
    // the back: the bay's tall iron window in a segmental head over a sill band
    const b = chordFace(at(a1, Rb), at(a0, Rb));
    const win: ArchHole = { u: 0, w: Math.min(3.2, b.width - 1.6), y0: 1.6, spring: 4.9, form: 'segmental', rise: 0.45 };
    archedFace(sink, wall, b, { u0: -b.width / 2, u1: b.width / 2, y0: foot, y1: Hb }, [win], 0.3);
    ironWindow(sink, b, win, 0.3);
    faceStrip(sink, wall, b, -b.width / 2 + 0.28, foot, 0.56, Hb - 0.4, 0.14, { shade: 0.95 });
    corbelCornice(sink, wall, b, Hb, b.width);
    // the ceiling closing the stall's solid (hidden under the roof)
    const p00 = at(a0, Rf), p01 = at(a1, Rf), p10 = at(a0, Rb), p11 = at(a1, Rb);
    sink.quad(wall, [p01[0], Hb, p01[1]], [p00[0], Hb, p00[1]], [p10[0], Hb, p10[1]], [p11[0], Hb, p11[1]], { shade: 0.5 });
  }
  // the end walls: radial gables at either side of the fan, pierced by a door and two windows
  for (const side of [-1, 1] as const) {
    const ae = side < 0 ? theta(0) : theta(stalls);
    const pf = at(ae, Rf), pb = at(ae, Rb);
    const f = side < 0 ? chordFace(pb, pf) : chordFace(pf, pb);
    const w = Rb - Rf, toU = (r: number): number => (side < 0 ? (Rb - r) - w / 2 : (r - Rf) - w / 2);
    const holes: ArchHole[] = [
      { u: toU(Rf + (Rb - Rf) * 0.25), w: 1.5, y0: 1.5, spring: 4.0, form: 'segmental', rise: 0.3 },
      { u: toU(Rf + (Rb - Rf) * 0.55), w: 1.4, y0: 0, spring: 2.6, form: 'segmental', rise: 0.3 },
      { u: toU(Rf + (Rb - Rf) * 0.82), w: 1.5, y0: 1.5, spring: 4.0, form: 'segmental', rise: 0.3 },
    ];
    archedFace(sink, wall, f, { u0: -f.width / 2, u1: f.width / 2, y0: foot, y1: Hb }, holes, 0.3);
    for (const h of holes) if (h.y0 > 0) ironWindow(sink, f, h, 0.3);
    // the gable over the eaves line: the front wall's head, up the rake to the ridge and down to the back (both faces)
    const rakeF = at(ae, Rf), rakeR = at(ae, Rm), rakeB = at(ae, Rb);
    const gable: Vec3[] = [[rakeF[0], Hb, rakeF[1]], [rakeB[0], Hb, rakeB[1]], [rakeR[0], Hr, rakeR[1]], [rakeF[0], Hf, rakeF[1]]];
    sink.polygon(wall, side > 0 ? gable : [...gable].reverse(), {});
    // the door's boarded leaf in its reveal and a lamp bracket over it
    const dh = holes[1];
    leaf(sink, f, dh.u, dh.w - 0.06, dh.spring, -0.27, 0, DOOR);
    bar(sink, 'structureMetal', facePoint(f, dh.u, dh.spring + 0.9, 0), facePoint(f, dh.u, dh.spring + 0.9, 0.6), 0.04, { colour: IRON, decor: true, fine: true });
  }

  // ---- the roof: a shallow radial gable over every stall (its ridge an arc at Rm), the lantern along the ridge, the
  // smoke jack over each stall's chimney, the eaves' fascia and soffit
  const roofOpts: EmitOptions = {};
  const rf = Rf - eave, rb = Rb + eave;
  const yAtR = (r: number): number => (r <= Rm ? Hf + (Hr - Hf) * (r - Rf) / (Rm - Rf) : Hr + (Hb - Hr) * (r - Rm) / (Rb - Rm));
  const yF = yAtR(rf), yB = yAtR(rb);
  const roofEnd = (k: number): number => theta(k) + (k === 0 ? -0.6 / Rm : k === stalls ? 0.6 / Rm : 0);
  for (let i = 0; i < stalls; i++) {
    const a0 = roofEnd(i), a1 = roofEnd(i + 1);
    const P = (a: number, r: number, y: number): Vec3 => { const [x, z] = at(a, r); return [x, y, z]; };
    // front slope (facing the table and up), back slope
    sink.quad('roof', P(a1, rf, yF), P(a0, rf, yF), P(a0, Rm, Hr), P(a1, Rm, Hr), roofOpts);
    sink.quad('roof', P(a0, rb, yB), P(a1, rb, yB), P(a1, Rm, Hr), P(a0, Rm, Hr), roofOpts);
    // the soffits under the eaves and the fascia boards
    sink.quad('roof', P(a0, rf, yF - 0.02), P(a1, rf, yF - 0.02), P(a1, Rf, yAtR(Rf) - 0.02), P(a0, Rf, yAtR(Rf) - 0.02), { decor: true, shade: 0.55 });
    sink.quad('roof', P(a1, rb, yB - 0.02), P(a0, rb, yB - 0.02), P(a0, Rb, yAtR(Rb) - 0.02), P(a1, Rb, yAtR(Rb) - 0.02), { decor: true, shade: 0.55 });
    sink.quad('structureWood', P(a1, rf, yF - 0.25), P(a0, rf, yF - 0.25), P(a0, rf, yF + 0.02), P(a1, rf, yF + 0.02), { colour: shade(CAB_TIMBER, 0.6), decor: true });
    sink.quad('structureWood', P(a0, rb, yB - 0.25), P(a1, rb, yB - 0.25), P(a1, rb, yB + 0.02), P(a0, rb, yB + 0.02), { colour: shade(CAB_TIMBER, 0.6), decor: true });
    // the lantern along the ridge: its glazed sides between posts and its own low roof
    const lw = 0.9, ly0 = Hr - 0.15, ly1 = Hr + 1.15;
    const Q = (a: number, r: number, y: number): Vec3 => P(a, r, y);
    const b0 = theta(i), b1 = theta(i + 1);
    sink.quad('glass', Q(b1, Rm - lw, ly0), Q(b0, Rm - lw, ly0), Q(b0, Rm - lw, ly1), Q(b1, Rm - lw, ly1), { decor: true, window: [0, 0, 1] });
    sink.quad('glass', Q(b0, Rm + lw, ly0), Q(b1, Rm + lw, ly0), Q(b1, Rm + lw, ly1), Q(b0, Rm + lw, ly1), { decor: true, window: [0, 0, -1] });
    sink.quad('roof', Q(b1, Rm - lw - 0.3, ly1 - 0.05), Q(b0, Rm - lw - 0.3, ly1 - 0.05), Q(b0, Rm, ly1 + 0.45), Q(b1, Rm, ly1 + 0.45), { decor: true });
    sink.quad('roof', Q(b0, Rm + lw + 0.3, ly1 - 0.05), Q(b1, Rm + lw + 0.3, ly1 - 0.05), Q(b1, Rm, ly1 + 0.45), Q(b0, Rm, ly1 + 0.45), { decor: true });
    for (const a of [b0 + 0.02 * da, (b0 + b1) / 2, b1 - 0.02 * da]) for (const r of [Rm - lw, Rm + lw]) {
      bar(sink, 'structureMetal', Q(a, r, ly0), Q(a, r, ly1), 0.05, { colour: FRAME, decor: true, fine: true });
    }
    // the smoke jack over the chimney of an engine standing in the stall: a sooted timber hood up through the front slope
    const am = (b0 + b1) / 2, rj = Rf + 3.6, yj = yAtR(rj);
    const [jx, jz] = at(am, rj);
    sink.span('structureMetal', jx - 0.7, yj - 0.6, jz - 0.7, jx + 0.7, yj + 1.5, jz + 0.7, { colour: SOOT, decor: true });
    sink.span('structureMetal', jx - 0.95, yj + 1.5, jz - 0.95, jx + 0.95, yj + 1.68, jz + 0.95, { colour: shade(SOOT, 1.3), decor: true });
    sink.span('structureMetal', jx - 0.45, yj + 1.68, jz - 0.45, jx + 0.45, yj + 2.3, jz + 0.45, { colour: SOOT, decor: true });
  }
  // the end gables' verges under the roof's edge
  for (const k of [0, stalls]) {
    const a = roofEnd(k), P = (r: number, y: number): Vec3 => { const [x, z] = at(a, r); return [x, y, z]; };
    bar(sink, 'structureWood', P(rf, yF + 0.05), P(Rm, Hr + 0.05), 0.16, { colour: shade(CAB_TIMBER, 0.6), decor: true });
    bar(sink, 'structureWood', P(Rm, Hr + 0.05), P(rb, yB + 0.05), 0.16, { colour: shade(CAB_TIMBER, 0.6), decor: true });
  }

  // ---- the turntable in its pit, flush with the yard (all dressing: a hull drives over it)
  turntable(sink, 0, zT, Rt, v);
  // the stall roads: from the table's rim to each door and on into the open stalls; the lead track out to the yard
  for (let i = 0; i < stalls; i++) {
    const am = (theta(i) + theta(i + 1)) / 2;
    track(sink, at(am, Rt + 0.3), at(am, Rf + (open.has(i) ? 12 : 0.1)), 0);
    // the inspection pit's kerb before the door (ash pits at the stalls' throats)
    if (i % 2 === 0) {
      const [px, pz] = at(am, Rf - 5), [qx, qz] = at(am, Rf - 1.2);
      for (const s of [-1, 1]) {
        const nx = Math.cos(am) * 0.95 * s, nz = Math.sin(am) * 0.95 * s;
        bar(sink, 'stone', [px + nx, 0.02, pz + nz], [qx + nx, 0.02, qz + nz], 0.22, { decor: true, fine: true, shade: 0.8 });
      }
    }
  }
  if (L.lead > 0) track(sink, [0, zT + Rt + 0.3], [0, zT + Rt + L.lead], 0);
  // the water cranes at the lead track either side of the table's mouth, and the ash heap by the inspection pits
  for (const s of [-1, 1]) waterCrane(sink, s * 3.1, zT + Rt + Math.min(L.lead, 5) - 1.5, s * (0.4 + v() * 0.5));
  return { parts: sink.finish() };
};

/** A vertical strip proud of a face (a pilaster, a pier) at u from y0 to y1, `w` wide and `o` out. */
function faceStrip(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y0: number, w: number, y1: number, o: number, opts: EmitOptions = {}): void {
  const P = (uu: number, y: number, oo: number): Vec3 => facePoint(face, uu, y, oo);
  const a = u - w / 2, b = u + w / 2;
  sink.quad(bucket, P(a, y0, o), P(b, y0, o), P(b, y1, o), P(a, y1, o), { decor: true, ...opts });
  sink.quad(bucket, P(a, y0, 0), P(a, y0, o), P(a, y1, o), P(a, y1, 0), { decor: true, ...opts, shade: 0.8 });
  sink.quad(bucket, P(b, y0, o), P(b, y0, 0), P(b, y1, 0), P(b, y1, o), { decor: true, ...opts, shade: 0.8 });
}

/** The corbelled brick cornice under a wall's head: three stepped courses across the face's width. */
function corbelCornice(sink: PartSink, bucket: RegionalBucket, face: Face, y: number, width: number): void {
  const P = (u: number, yy: number, o: number): Vec3 => facePoint(face, u, yy, o);
  const u0 = -width / 2, u1 = width / 2;
  [[0.55, 0.06], [0.38, 0.13], [0.2, 0.2]].forEach(([drop, o]) => {
    const y0 = y - drop, y1 = y0 + 0.17;
    sink.quad(bucket, P(u0, y0, o), P(u1, y0, o), P(u1, y1, o), P(u0, y1, o), { decor: true, shade: 0.97 });
    sink.quad(bucket, P(u0, y0, 0), P(u1, y0, 0), P(u1, y0, o), P(u0, y0, o), { decor: true, shade: 0.6 });
    sink.quad(bucket, P(u0, y1, o), P(u1, y1, o), P(u1, y1, 0), P(u0, y1, 0), { decor: true, shade: 0.9 });
  });
}

/** A boarded door leaf in an opening's reveal: centred at u, `w` wide, from the threshold to `top`, `o` out of the face. */
function leaf(sink: PartSink, face: Face, u: number, w: number, top: number, o: number, y0: number, colour: Rgb): void {
  const P = (uu: number, y: number, oo: number): Vec3 => facePoint(face, uu, y, oo);
  sink.quad('structureWood', P(u - w / 2, y0, o), P(u + w / 2, y0, o), P(u + w / 2, top, o), P(u - w / 2, top, o), { colour, decor: true });
  // the ledges and the brace, and the boards' joints
  for (const y of [y0 + 0.5, (y0 + top) / 2, top - 0.5]) {
    sink.quad('structureWood', P(u - w / 2 + 0.06, y - 0.09, o + 0.04), P(u + w / 2 - 0.06, y - 0.09, o + 0.04), P(u + w / 2 - 0.06, y + 0.09, o + 0.04), P(u - w / 2 + 0.06, y + 0.09, o + 0.04),
      { colour: shade(colour, 0.82), decor: true, fine: true });
  }
  for (let k = 1; k < Math.floor(w / 0.18); k++) {
    const uu = u - w / 2 + k * w / Math.floor(w / 0.18);
    sink.quad('structureWood', P(uu - 0.01, y0, o + 0.005), P(uu + 0.01, y0, o + 0.005), P(uu + 0.01, top, o + 0.005), P(uu - 0.01, top, o + 0.005), { colour: shade(colour, 0.6), decor: true, fine: 'near' });
  }
}

/** A door leaf swung open on its jamb hinge: side -1 the left leaf, +1 the right; `swing` from closed (radians). */
function leafOpen(sink: PartSink, face: Face, side: -1 | 1, w: number, top: number, swing: number, colour: Rgb): void {
  // the hinge at the jamb's outer edge; the leaf runs back toward the centre when closed (along -side*u) and swings out
  const hu = side * (w + 0.02), dirU = -side * Math.cos(swing), dirO = Math.sin(swing);
  const P = (along: number, y: number, off: number): Vec3 => facePoint(face, hu + dirU * along + side * dirO * 0 + (off * dirO * 0), y, 0.05 + dirO * along + off);
  const a = P(0, 0, 0), b = P(w - 0.05, 0, 0), c = P(w - 0.05, top, 0), d = P(0, top, 0);
  // two faces (each side of the leaf seen)
  sink.quad('structureWood', a, b, c, d, { colour, decor: true });
  sink.quad('structureWood', b, a, d, c, { colour: shade(colour, 0.75), decor: true });
  for (const y of [0.5, top / 2, top - 0.5]) bar(sink, 'structureWood', P(0.08, y, 0.03), P(w - 0.13, y, 0.03), 0.07, { colour: shade(colour, 0.8), decor: true, fine: true });
}

/** An iron window of small panes in its opening: the glazing, a grid of glazing bars (coarse frame, fine bars). */
function ironWindow(sink: PartSink, face: Face, h: ArchHole, reveal: number): void {
  archWindow(sink, face, h, reveal, FRAME, false, { bars: true, coarse: true });
  const o = -reveal + 0.04;
  for (let y = h.y0 + 0.42; y < h.spring; y += 0.42) {
    sink.member('structureMetal', facePoint(face, h.u - h.w / 2, y, o), facePoint(face, h.u + h.w / 2, y, o), 0.03, 0.03, face.out, { colour: FRAME, decor: true, fine: true });
  }
  for (let k = 1; k < Math.round(h.w / 0.4); k++) {
    const u = h.u - h.w / 2 + k * h.w / Math.round(h.w / 0.4);
    sink.member('structureMetal', facePoint(face, u, h.y0, o), facePoint(face, u, h.spring, o), 0.03, 0.03, face.out, { colour: FRAME, decor: true, fine: true });
  }
}

/** The dark stall beyond an open door: its sooted floor, walls and roof from radius r0 to r1 (dressing). */
function shedInterior(sink: PartSink, at: (a: number, r: number) => [number, number], a0: number, a1: number, r0: number, r1: number, h: number): void {
  const P = (a: number, r: number, y: number): Vec3 => { const [x, z] = at(a, r); return [x, y, z]; };
  const k = 0.18 * (a1 - a0);
  const b0 = a0 + k * 0.2, b1 = a1 - k * 0.2;
  // floor, the two side walls (facing in), the back of the stall, the roof's underside
  sink.quad('dark', P(b0, r0, 0.03), P(b1, r0, 0.03), P(b1, r1, 0.03), P(b0, r1, 0.03), { decor: true });
  sink.quad('dark', P(b0, r1, 0), P(b0, r0, 0), P(b0, r0, h), P(b0, r1, h), { decor: true });
  sink.quad('dark', P(b1, r0, 0), P(b1, r1, 0), P(b1, r1, h), P(b1, r0, h), { decor: true });
  sink.quad('dark', P(b1, r1, 0), P(b0, r1, 0), P(b0, r1, h), P(b1, r1, h), { decor: true });
  sink.quad('dark', P(b0, r0, h), P(b1, r0, h), P(b1, r1, h), P(b0, r1, h), { decor: true });
}

/**
 * A goods engine standing at an open stall, its smokebox out of the door (a Reichsbahn 2-10-0 of the BR 44 and 50
 * classes, simplified to what reads from a tank: the boiler on its frames, the smokebox door, the chimney and dome,
 * the cab, the smoke deflectors, the coupled wheels and cylinders). Its axis along the stall road, its front at r0.
 */
function engine(sink: PartSink, at: (a: number, r: number) => [number, number], a: number, r0: number, v: () => number): void {
  const black = rgb(0x1c1c1d), red = rgb(0x6c1f1a), steel = rgb(0x3b3c3e);
  const front = at(a, r0), back = at(a, r0 + 13.5);
  const ux = (back[0] - front[0]) / 13.5, uz = (back[1] - front[1]) / 13.5, nx = uz, nz = -ux;
  const P = (s: number, y: number, n = 0): Vec3 => [front[0] + ux * s + nx * n, y, front[1] + uz * s + nz * n];
  const yaw = Math.atan2(ux, uz);
  // the frames and the running plate
  sink.placed(yaw, P(6.6, 0)[0], 0, P(6.6, 0)[2], () => {
    sink.span('structureMetal', -1.45, 1.55, -6.4, 1.45, 1.68, 6.6, { colour: black, decor: true });
    sink.span('structureMetal', -0.55, 0.55, -6.6, 0.55, 1.55, 6.4, { colour: red, decor: true });
    // the boiler, the smokebox at the front (-z in this frame: the engine faces out of the door)
    sink.cylinder('structureMetal', [0, 2.75, -6.2], 'z', 9.2, 0.95, 14, { colour: black, decor: true });
    sink.cylinder('structureMetal', [0, 2.75, -6.6], 'z', 0.4, 0.98, 14, { colour: shade(black, 1.25), decor: true });
    sink.cylinder('structureMetal', [0, 3.65, -5.4], 'y', 0.75, 0.33, 10, { colour: black, decor: true });
    sink.cylinder('structureMetal', [0, 3.6, -1.4], 'y', 0.55, 0.45, 10, { colour: black, decor: true }, 0.38);
    sink.cylinder('structureMetal', [0, 3.6, 1.0], 'y', 0.4, 0.3, 10, { colour: black, decor: true });
    // the smoke deflectors (Wagner type)
    for (const s of [-1, 1]) sink.span('structureMetal', s * 1.32 - 0.03, 1.7, -6.2, s * 1.32 + 0.03, 3.9, -3.6, { colour: black, decor: true });
    // the cylinders and the buffer beam
    for (const s of [-1, 1]) sink.cylinder('structureMetal', [s * 1.1, 1.15, -6.0], 'z', 1.6, 0.36, 10, { colour: black, decor: true });
    sink.span('structureMetal', -1.5, 0.75, -6.9, 1.5, 1.35, -6.55, { colour: red, decor: true });
    for (const s of [-1, 1]) sink.cylinder('structureMetal', [s * 0.85, 1.05, -7.35], 'z', 0.45, 0.2, 8, { colour: steel, decor: true });
    // the coupled wheels (five axles) under the running plate
    for (let k = 0; k < 5; k++) for (const s of [-1, 1]) {
      sink.cylinder('structureMetal', [s * 0.82, 0.7, -3.9 + k * 1.45], 'x', 0.14, 0.7, 16, { colour: shade(red, 0.9), decor: true });
    }
    // the cab
    sink.span('structureMetal', -1.45, 1.68, 3.0, 1.45, 4.0, 6.4, { colour: black, decor: true });
    sink.span('structureMetal', -1.55, 4.0, 2.9, 1.55, 4.2, 6.6, { colour: shade(black, 1.2), decor: true });
    for (const s of [-1, 1]) sink.span('glass', s * 1.46 - 0.005, 2.9, 3.6, s * 1.46 + 0.005, 3.6, 4.6, { decor: true });
  });
  void v;
}

/**
 * A water crane (Wasserkran) at the lead track: its column on a plinth, the swinging arm out over the track with the
 * leather hose hanging from its end, the counterweight and the drain grating at its foot. `swing` turns its arm.
 */
function waterCrane(sink: PartSink, x: number, z: number, swing: number): void {
  const paint = rgb(0x26302b);
  sink.cylinder('stone', [x, -0.4, z], 'y', 0.75, 0.55, 10, { shade: 0.9 });
  sink.cylinder('structureMetal', [x, 0.35, z], 'y', 3.6, 0.2, 10, { colour: paint }, 0.16);
  sink.cylinder('structureMetal', [x, 3.95, z], 'y', 0.35, 0.28, 10, { colour: paint, decor: true });
  const ax = -Math.sign(x) * Math.cos(swing), az = Math.sin(swing);
  bar(sink, 'structureMetal', [x, 3.6, z], [x + ax * 3.0, 3.75, z + az * 3.0], 0.2, { colour: paint, decor: true });
  bar(sink, 'structureMetal', [x, 3.6, z], [x - ax * 0.9, 3.55, z - az * 0.9], 0.14, { colour: paint, decor: true });
  sink.span('structureMetal', x - ax * 0.9 - 0.2, 3.1, z - az * 0.9 - 0.2, x - ax * 0.9 + 0.2, 3.5, z - az * 0.9 + 0.2, { colour: paint, decor: true });
  bar(sink, 'structureWood', [x + ax * 3.0, 3.7, z + az * 3.0], [x + ax * 3.05, 1.6, z + az * 3.05], 0.12, { colour: rgb(0x2a201a), decor: true });
  sink.span('structureMetal', x - 0.6, 0.02, z - 0.6, x + 0.6, 0.05, z + 0.6, { colour: IRON, decor: true, fine: true });
}

/** The turntable: its pit's coping ring, the dark pit, the circular rail, the bridge's girders, deck and rails, the
 *  operator's cab at one end (dressing; the pit is flush, the yard's level). */
function turntable(sink: PartSink, cx: number, cz: number, R: number, v: () => number): void {
  const n = 48;
  revolve(sink, 'stone', cx, cz, [[R + 0.55, -0.4], [R + 0.55, 0.14], [R, 0.14], [R, 0.02], [R + 0.01, 0.02]], n, { decor: true, shade: 0.88 });
  // the pit floor (cinders and oil), and the circular running rail near the wall
  revolve(sink, 'stone', cx, cz, [[R, 0.035], [0.001, 0.035]], n, { decor: true, shade: 0.42 });
  revolve(sink, 'structureMetal', cx, cz, [[R - 0.76, 0.04], [R - 0.75, 0.04], [R - 0.75, 0.12], [R - 0.65, 0.12], [R - 0.65, 0.04], [R - 0.64, 0.04]], n, { colour: RAIL, decor: true });
  // the bridge, turned toward a stall (look stream)
  const yaw = (v() - 0.5) * 0.9;
  sink.placed(yaw, cx, 0, cz, () => {
    for (const s of [-1, 1]) {
      // the two fish-bellied girders, deepest at the king pin
      const pts: Vec3[] = [];
      for (let k = 0; k <= 8; k++) { const z = -R + 0.25 + (2 * R - 0.5) * k / 8; pts.push([s * 1.25, 0.75 - 0.45 * (1 - Math.pow(z / R, 2)), z]); }
      for (let k = 0; k < 8; k++) {
        const a = pts[k], b = pts[k + 1];
        sink.quad('structureMetal', [s * 1.25, a[1], a[2]], [s * 1.25, b[1], b[2]], [s * 1.25, 0.95, b[2]], [s * 1.25, 0.95, a[2]],
          { colour: IRON, decor: true });
        sink.quad('structureMetal', [s * 1.25, 0.95, a[2]], [s * 1.25, 0.95, b[2]], [s * 1.25, b[1], b[2]], [s * 1.25, a[1], a[2]],
          { colour: shade(IRON, 0.8), decor: true });
      }
      sink.span('structureMetal', s * 1.25 - 0.2, 0.95, -R + 0.25, s * 1.25 + 0.2, 1.03, R - 0.25, { colour: IRON, decor: true });
    }
    // the deck between the girders and the bridge's rails on it
    sink.span('structureWood', -1.05, 0.88, -R + 0.3, 1.05, 0.95, R - 0.3, { colour: SLEEPER, decor: true });
    track(sink, [0, -R + 0.3], [0, R - 0.3], 0.95);
    // the end carriages on the circular rail and the operator's cab at the +z end, on its bracket off the girder
    for (const z of [-R + 0.6, R - 0.6]) sink.span('structureMetal', -1.6, 0.1, z - 0.35, 1.6, 0.9, z + 0.35, { colour: IRON, decor: true });
    const cz2 = R - 2.2;
    sink.span('structureMetal', 1.45, 0.9, cz2 - 1.0, 3.2, 1.0, cz2 + 1.0, { colour: IRON, decor: true });
    sink.span('structureWood', 1.55, 1.0, cz2 - 0.8, 3.05, 3.3, cz2 + 0.8, { colour: CAB_TIMBER, decor: true });
    sink.span('glass', 3.05, 2.1, cz2 - 0.55, 3.07, 2.9, cz2 + 0.55, { decor: true });
    sink.span('glass', 1.75, 2.1, cz2 + 0.8, 2.85, 2.9, cz2 + 0.82, { decor: true });
    sink.span('structureWood', 1.4, 3.3, cz2 - 1.0, 3.25, 3.45, cz2 + 1.0, { colour: shade(CAB_TIMBER, 0.6), decor: true });
    // the king pin's cover
    sink.cylinder('structureMetal', [0, 0.04, 0], 'y', 0.95, 0.7, 12, { colour: IRON, decor: true });
  });
}

/**
 * The signal box at a throat (Reichsbahn Stellwerk, 1910s-30s): `length` along the tracks (x), `depth` across, the brick
 * lower storey (`base` high) for the locking frame with its small windows, the timber operating floor over it in a band
 * of windows on its front and ends, its hipped roof with the stove pipe, and the outside stair up its -x end to the
 * landing door. Its front (+z) faces the tracks.
 */
export const signalBox: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const v = ctx.variant;
  const W = num(ctx, 'length', 6, 16), D = num(ctx, 'depth', 3.5, 6), Hb = num(ctx, 'base', 3, 8), Hc = 3.1;
  const foot = -0.6 - ctx.groundFall, wall: RegionalBucket = 'stone';
  // the locking-room storey: a door in the back, small segmental windows to the front
  const lower: Partial<Record<'front' | 'back' | 'left' | 'right', ArchHole[]>> = { front: [], back: [{ u: W / 2 - 1.2, w: 1.1, y0: 0, spring: 2.1, form: 'segmental', rise: 0.25 }], right: [] };
  for (let u = -W / 2 + 1.2; u < W / 2 - 0.9; u += 1.8) lower.front!.push({ u, w: 0.9, y0: 1.2, spring: 2.3, form: 'segmental', rise: 0.2 });
  lower.right!.push({ u: 0, w: 0.9, y0: 1.2, spring: 2.3, form: 'segmental', rise: 0.2 });
  const lf = archedBody(sink, wall, 0, 0, W, D, foot, Hb, lower, 0.26);
  for (const h of lower.front!) ironWindow(sink, lf.front, h, 0.26);
  ironWindow(sink, lf.right, lower.right![0], 0.26);
  leaf(sink, lf.back, lower.back![0].u, 1.04, 2.1, -0.24, 0, DOOR);
  for (const f of [lf.front, lf.back, lf.left, lf.right]) corbelCornice(sink, wall, f, Hb + 0.2, f.width);
  // the operating floor: timber walls proud of the brick on the cornice, the window band across its front and ends
  const ow = W + 0.4, od = D + 0.4, y0 = Hb + 0.05, y1 = Hb + Hc;
  const band = (width: number): ArchHole[] => {
    const out: ArchHole[] = [], n = Math.max(2, Math.round((width - 0.6) / 1.05));
    for (let k = 0; k < n; k++) out.push({ u: -width / 2 + 0.3 + (width - 0.6) * (k + 0.5) / n, w: (width - 0.6) / n - 0.12, y0: y0 + 1.05, spring: y1 - 0.35, form: 'flat' });
    return out;
  };
  const upper = { front: band(ow), right: band(od), left: [{ u: 0, w: 0.95, y0, spring: y0 + 2.1, form: 'flat' as const }], back: band(ow).filter((_, k) => k % 3 === 1) };
  const uf = archedBody(sink, 'wood', 0, 0, ow, od, y0, y1, upper, 0.08);
  for (const name of ['front', 'right', 'back'] as const) for (const h of upper[name]) archWindow(sink, uf[name], h, 0.08, CAB_TRIM, v() < 0.3, { bars: true, coarse: true });
  // the boarding's battens and the trim at the sill and the head
  for (const f of [uf.front, uf.back, uf.left, uf.right]) {
    for (const y of [y0 + 1.0, y1 - 0.3]) sink.member('structureWood', facePoint(f, -f.width / 2, y, 0.03), facePoint(f, f.width / 2, y, 0.03), 0.09, 0.05, f.out, { colour: CAB_TRIM, decor: true, fine: true });
  }
  leaf(sink, uf.left, 0, 0.9, y0 + 2.1, -0.06, y0, DOOR_PAINT);
  // the hipped roof, its eaves well out over the windows, and the stove pipe
  const roof: RoofSpec = { kind: 'hip', pitchDeg: 32, eave: 0.6, verge: 0.6, thickness: 0.12, bucket: 'roof', ridge: null };
  emitRoof(sink, roofGeometry(ow, od, y1, roof), roof);
  bar(sink, 'structureMetal', [W / 4, y1 + 0.5, -od / 4], [W / 4, y1 + 2.6, -od / 4], 0.12, { colour: IRON, decor: true });
  sink.cylinder('structureMetal', [W / 4, y1 + 2.6, -od / 4], 'y', 0.22, 0.2, 8, { colour: IRON, decor: true });
  // the outside stair up the -x end: its stringers, treads and handrail, the landing at the door on its posts
  const sx0 = -ow / 2 - 0.15, landX = sx0 - 1.1, run = Hb * 1.15;
  sink.span('structureWood', landX - 0.1, y0 - 0.12, -od / 2 + 0.2, sx0, y0, od / 2 - 0.2, { colour: CAB_TIMBER });
  for (const z of [-od / 2 + 0.3, od / 2 - 0.3]) bar(sink, 'structureWood', [landX, foot, z], [landX, y0 - 0.12, z], 0.14, { colour: CAB_TIMBER });
  // the stair's two stringers, at its edges
  for (const x of [landX + 0.05, landX + 0.95]) bar(sink, 'structureWood', [x, y0 - 0.06, -od / 2 + 0.2], [x, 0, -od / 2 + 0.2 - run], 0.1, { colour: CAB_TIMBER, decor: true });
  const steps = Math.max(6, Math.round(Hb / 0.21));
  for (let k = 1; k < steps; k++) {
    const y = y0 - k * (y0 / steps), z = -od / 2 + 0.2 - k * run / steps;
    sink.span('structureWood', landX, y - 0.04, z - 0.14, landX + 1.0, y, z + 0.14, { colour: CAB_TIMBER, decor: true });
  }
  bar(sink, 'structureMetal', [landX - 0.02, y0 + 0.95, -od / 2 + 0.2], [landX - 0.02, 0.95, -od / 2 + 0.2 - run], 0.04, { colour: IRON, decor: true });
  bar(sink, 'structureMetal', [landX - 0.02, y0 + 0.95, -od / 2 + 0.2], [landX - 0.02, y0 + 0.95, od / 2 - 0.2], 0.04, { colour: IRON, decor: true });
  // the name board on the front under the windows
  sink.span('structureWood', -1.3, y0 + 0.35, od / 2 + 0.02, 1.3, y0 + 0.75, od / 2 + 0.06, { colour: rgb(0x1e2a24), decor: true });
  // the rodding and wires leaving the box's front at the foot, out to the tracks (the run of point rods on its stools)
  for (let k = 0; k < 6; k++) {
    const x = -W / 2 + 1 + k * (W - 2) / 5;
    bar(sink, 'structureMetal', [x, 0.25, D / 2], [x, 0.25, D / 2 + 3.4], 0.03, { colour: IRON, decor: true, fine: true });
  }
  return { parts: sink.finish() };
};
