// src/world/landmarks/railWorks.ts — a coalfield junction's railway works (landmarks-271, 2026-11-06; the owner: "new
// special buildings like the way our airport map has hangars and our seaside map has a harbor area with a lighthouse").
// Cinder Junction is a Ruhr and Upper Silesian yard of 1945; the census (buildings-270 signature places) found its
// signature missing: the engine shed round its turntable and the signal boxes over the throats.
//
// - roundhouse: the Reichsbahn Ringlokschuppen — a segment of brick stalls fanned round the turntable, each stall's
//   door a segmental arch in a pilastered front under a corbelled cornice, a tall iron window in each back bay, the
//   roof a shallow radial gable with its lantern along the ridge and a smoke jack over each stall's chimney; the
//   turntable in its pit (the bridge's girders, the operator's cab, the circular rail), the stall roads from the
//   table to the doors and the lead track out to the yard. Some doors stand open on the dark shed and its engines.
//   (r273, the realism pass: each stall's bay steps off its neighbours behind a brick fire wall, so the fan reads as a
//   ring of bays from the chase camera; the table sits in a pit below the apron's cinder bed with its coping, its ring
//   rail and a half-through plate-girder bridge; the apron carries inspection pits, a coal bunker, an ash heap and
//   stacked sleepers; the brick is sooted over every door, the roof patched and sooted round its jacks, panes broken.)
// - signalBox: the Stellwerk at a throat — a brick lower storey whose tall windows light the locking and rodding room,
//   the timber operating floor cantilevered over it on iron stilts toward the tracks, glazed on its front and both ends
//   between mullions, a hipped roof with its stove pipe, the outside stair up the back to the landing door, and the
//   rodding run leaving the foot of the front on its stools and turning along the tracks.
//
// Drawn in their own frames (x across, y up, z out of the front, the ground at y = 0) into the regional part sink, so
// they take the map kit's brick, roofing and weathering and merge into its buckets (no draw call of their own). The
// walls and roofs are structure; the joinery, the rails and the table are dressing (a hull drives over the table).
import { PartSink, facePoint, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { archLine, archRise, archWindow, archedBody, archedFace, bar, revolve, type ArchHole, type FaceName } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';

const IRON = rgb(0x2a2b2c), RAIL = rgb(0x4d4440), RAIL_TOP = rgb(0x8c8a86), SOOT = rgb(0x1f1d1c), SLEEPER = rgb(0x3a3029);
const DOOR = rgb(0x4b3a2c), DOOR_PAINT = rgb(0x3d4a3c), FRAME = rgb(0x2f3532), CAB_TIMBER = rgb(0x6b5236), CAB_TRIM = rgb(0xd8d0bc);
const CINDER = rgb(0x403b35), PIT_DEEP = rgb(0x141312), COAL = rgb(0x18181a), ASH = rgb(0x8a857c);
const STANDARD_GAUGE = 1.435;
/** The engine shed's apron: the bed of cinders its stall roads lie in, over the yard's grade (m). */
const YARD = 0.3;
const UP: Vec3 = [0, 1, 0], DOWN: Vec3 = [0, -1, 0];

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

/** A convex polygon turned to face `toward` (its rough outward direction), whatever order its corners came in. */
function facing(sink: PartSink, bucket: RegionalBucket, pts: readonly Vec3[], toward: Vec3, opts: EmitOptions = {}): void {
  const [a, b, c] = pts;
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  sink.polygon(bucket, n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] < 0 ? [...pts].reverse() : pts, opts);
}

/** A pair of rails from a to b (plan points, y the rail foot), on their sleepers unless `sleepers` is off. Dressing. */
function track(sink: PartSink, a: readonly [number, number], b: readonly [number, number], y: number, sleepers = true): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  if (L < 0.3) return;
  const ux = dx / L, uz = dz / L, nx = uz, nz = -ux, g = STANDARD_GAUGE / 2 + 0.035;
  for (const s of [-1, 1]) {
    const p0: Vec3 = [a[0] + nx * g * s, y + 0.08, a[1] + nz * g * s], p1: Vec3 = [b[0] + nx * g * s, y + 0.08, b[1] + nz * g * s];
    bar(sink, 'structureMetal', p0, p1, 0.075, { colour: RAIL, decor: true });
    // the running surface worn bright
    bar(sink, 'structureMetal', [p0[0], y + 0.125, p0[2]], [p1[0], y + 0.125, p1[2]], 0.05, { colour: RAIL_TOP, decor: true, fine: 'near' });
  }
  if (!sleepers) return;
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
  const v = ctx.variant, age = ctx.age ?? ((): number => 0.5);
  const L = roundhouseLayout(ctx.params);
  const { stalls, da, Rt, Rf, Rb, half, zT } = L;
  const wall: RegionalBucket = 'stone', foot = -0.6 - ctx.groundFall;
  const Hf = 7.6, Hb = 6.4, Hr = 9.4, Rm = Rf + (Rb - Rf) * 0.42;
  const eave = 0.55, yard = YARD, rf = Rf - eave, rb = Rb + eave;
  // the plan: a stall's ray from the table's centre (angle 0 straight back, -z)
  const at = (theta: number, r: number): [number, number] => [Math.sin(theta) * r, zT - Math.cos(theta) * r];
  const P = (a: number, r: number, y: number): Vec3 => { const [x, z] = at(a, r); return [x, y, z]; };
  const radial = (a: number): Vec3 => [Math.sin(a), 0, -Math.cos(a)];
  const inward = (a: number): Vec3 => [-Math.sin(a), 0, Math.cos(a)];
  const tangent = (a: number): Vec3 => [Math.cos(a), 0, Math.sin(a)];
  const theta = (i: number): number => -half + i * da;
  const yAtR = (r: number): number => (r <= Rm ? Hf + (Hr - Hf) * (r - Rf) / (Rm - Rf) : Hr + (Hb - Hr) * (r - Rm) / (Rb - Rm));
  const openCount = Math.max(0, Math.min(stalls, Math.round(num(ctx, 'open', 0))));
  // which doors stand open: drawn from the look stream, so a new choice never moves the geometry
  const open = new Set<number>();
  const order = Array.from({ length: stalls }, (_, i) => i).sort(() => v() - 0.5);
  for (const i of order.slice(0, openCount)) open.add(i);
  const engines = Math.max(0, Math.min(openCount, Math.round(num(ctx, 'engines', 0))));
  const engineAt = new Set([...open].slice(0, engines));
  // each stall's bay stands a little off its neighbours (built and rebuilt bay by bay): its wall heads, roof and lantern
  // step at every fire wall, 0.14-0.3 m from the next, so the ring of bays reads round the fan
  const step: number[] = [];
  for (let i = 0; i < stalls; i++) {
    let d = i === 0 ? v() * 0.4 : step[i - 1] + (v() < 0.5 ? -1 : 1) * (0.14 + v() * 0.16);
    if (d < 0) d = -d;
    if (d > 0.5) d = 1 - d;
    step.push(d);
  }

  // ---- the stalls: front, back and the roof's ceiling (a closed solid, so the shed's whole plan is its record)
  for (let i = 0; i < stalls; i++) {
    const a0 = theta(i), a1 = theta(i + 1), am = (a0 + a1) / 2, h = step[i];
    // the front faces the table: seen from the table, left to right runs from a0 to a1
    const f = chordFace(at(a0, Rf), at(a1, Rf));
    const door: ArchHole = { u: 0, w: Math.min(4.3, f.width - 1.1), y0: 0, spring: 4.7, form: 'segmental', rise: 0.55 };
    const isOpen = open.has(i);
    archedFace(sink, wall, f, { u0: -f.width / 2, u1: f.width / 2, y0: foot, y1: Hf + h }, [door], isOpen ? 0.62 : 0.32, { through: isOpen });
    // the pilaster strip at the bay's edge, the cornice under its head
    faceStrip(sink, wall, f, -f.width / 2 + 0.28, foot, 0.56, Hf + h - 0.55, 0.16, { shade: 0.95 });
    corbelCornice(sink, wall, f, Hf + h, f.width);
    // the soot the engines' exhaust laid up the brick over the door, densest over the arch
    sootOver(sink, f, door, Hf + h - 0.58, isOpen ? 0.3 : 0.4 + age() * 0.08, age);
    // the door: two boarded leaves, closed in its reveal or swung out against the front
    const lw = door.w / 2;
    if (!isOpen) {
      for (const s of [-1, 1]) leaf(sink, f, s * lw / 2, lw - 0.04, door.spring, -0.3, yard - 0.04, v() < 0.5 ? DOOR : DOOR_PAINT);
      // the wicket door's frame in the right leaf
      sink.member('structureWood', facePoint(f, lw / 2 - 0.45, yard + 0.1, -0.26), facePoint(f, lw / 2 - 0.45, yard + 2.0, -0.26), 0.06, 0.04, f.out,
        { colour: shade(DOOR, 0.7), decor: true, fine: true });
      // the fanlight over the leaves, some of its panes gone
      const fan: ArchHole = { u: 0, w: door.w - 0.2, y0: door.spring + 0.05, spring: door.spring + 0.06, form: 'segmental', rise: 0.5 };
      archWindow(sink, f, fan, 0.3, FRAME, false, { bars: true });
      if (age() < 0.55) {
        const u0 = -fan.w * (0.1 + age() * 0.3), u1 = u0 + fan.w * 0.18;
        facing(sink, 'dark', [facePoint(f, u0, fan.y0 + 0.02, -0.27), facePoint(f, u1, fan.y0 + 0.02, -0.27), facePoint(f, u1, fan.y0 + 0.36, -0.27), facePoint(f, u0, fan.y0 + 0.36, -0.27)], f.out, { decor: true });
      }
    } else {
      // swung open to the front, each leaf at its jamb turned 100-120 degrees out
      for (const s of [-1, 1] as const) {
        const swing = (100 + v() * 22) * deg;
        leafOpen(sink, f, s, lw, door.spring - 0.05, swing, yard - 0.04, v() < 0.5 ? DOOR : DOOR_PAINT);
      }
      // the dark shed beyond: the stall's floor, its sooted walls and roof seen through the arch
      shedInterior(sink, at, a0, a1, Rf + 0.62, Math.min(Rb - 1, Rf + 14), yard, Hf - 0.6);
      if (engineAt.has(i)) engine(sink, at, am, Rf - 3.2, yard);
    }
    // the back: the bay's tall iron window in a segmental head over a sill band, damp darkening its foot
    const b = chordFace(at(a1, Rb), at(a0, Rb));
    const win: ArchHole = { u: 0, w: Math.min(3.2, b.width - 1.6), y0: 1.6, spring: 4.9, form: 'segmental', rise: 0.45 };
    archedFace(sink, wall, b, { u0: -b.width / 2, u1: b.width / 2, y0: foot, y1: Hb + h }, [win], 0.3);
    ironWindow(sink, b, win, 0.3, age, 0.16);
    faceStrip(sink, wall, b, -b.width / 2 + 0.28, foot, 0.56, Hb + h - 0.4, 0.14, { shade: 0.95 });
    corbelCornice(sink, wall, b, Hb + h, b.width);
    stain(sink, b, -b.width / 2 + 0.6, b.width / 2, foot, 0.7 + age() * 0.4, 0.62);
    // the ceiling closing the stall's solid (hidden under the roof)
    facing(sink, wall, [P(a1, Rf, Hb + h), P(a0, Rf, Hb + h), P(a0, Rb, Hb + h), P(a1, Rb, Hb + h)], UP, { shade: 0.5 });
  }
  // the brick pilasters on the front between the stalls' doors, from the plinth to the eaves; between two bays each
  // rises on as the fire wall over the roofs, its blue-brick coping a course proud
  for (let k = 0; k <= stalls; k++) {
    const a = theta(k), end = k === 0 || k === stalls;
    const hl = step[Math.max(0, k - 1)], hr = step[Math.min(stalls - 1, k)], hi = Math.max(hl, hr), lo = Math.min(hl, hr);
    const [px, pz] = at(a, Rf - 0.16), [qx, qz] = at(a, Rf + 1);
    const top = (end ? Hf + hi : Hf + lo) - 0.05;
    sink.placed(Math.atan2(qx - px, qz - pz), px, 0, pz, () => sink.span(wall, -0.38, foot, -0.18, 0.38, top, 0.16, { decor: true, shade: 0.9 }));
    if (!end) fireWall(sink, a, lo, hi, { Rf, Rb, Rm, rf, rb, Hf, Hb, yAtR, at, tangent: tangent(a) });
  }
  // the end walls: radial gables at either side of the fan, pierced by a door and two windows
  for (const side of [-1, 1] as const) {
    const ae = side < 0 ? theta(0) : theta(stalls), h = side < 0 ? step[0] : step[stalls - 1];
    const pf = at(ae, Rf), pb = at(ae, Rb);
    const f = side < 0 ? chordFace(pb, pf) : chordFace(pf, pb);
    const w = Rb - Rf, toU = (r: number): number => (side < 0 ? (Rb - r) - w / 2 : (r - Rf) - w / 2);
    const holes: ArchHole[] = [
      { u: toU(Rf + (Rb - Rf) * 0.25), w: 1.5, y0: 1.5, spring: 4.0, form: 'segmental', rise: 0.3 },
      { u: toU(Rf + (Rb - Rf) * 0.55), w: 1.4, y0: 0, spring: 2.6, form: 'segmental', rise: 0.3 },
      { u: toU(Rf + (Rb - Rf) * 0.82), w: 1.5, y0: 1.5, spring: 4.0, form: 'segmental', rise: 0.3 },
    ];
    archedFace(sink, wall, f, { u0: -f.width / 2, u1: f.width / 2, y0: foot, y1: Hb + h }, holes, 0.3);
    for (const hole of holes) if (hole.y0 > 0) ironWindow(sink, f, hole, 0.3, age, 0.2);
    // the gable over the eaves line: the front wall's head, up the rake to the ridge and down to the back
    const rakeF = at(ae, Rf), rakeR = at(ae, Rm), rakeB = at(ae, Rb);
    facing(sink, wall, [[rakeF[0], Hb + h, rakeF[1]], [rakeB[0], Hb + h, rakeB[1]], [rakeR[0], Hr + h, rakeR[1]], [rakeF[0], Hf + h, rakeF[1]]], f.out, {});
    // the damp at its foot and a rain streak down from each window's sill
    stain(sink, f, -f.width / 2, f.width / 2, foot, 0.65 + age() * 0.4, 0.64);
    for (const hole of holes) if (hole.y0 > 0) stain(sink, f, hole.u - hole.w * 0.35, hole.u + hole.w * 0.2, hole.y0 - 1.1 - age() * 0.4, hole.y0 - 0.02, 0.74);
    // the door's boarded leaf in its reveal and a lamp bracket over it
    const dh = holes[1];
    leaf(sink, f, dh.u, dh.w - 0.06, dh.spring, -0.27, 0, DOOR);
    bar(sink, 'structureMetal', facePoint(f, dh.u, dh.spring + 0.9, 0), facePoint(f, dh.u, dh.spring + 0.9, 0.6), 0.04, { colour: IRON, decor: true, fine: true });
    // sleepers stacked against the wall outside, old ones for the yard's relaying
    const along = side < 0 ? [Rf + 11] : [Rf + 4.6, Rf + 11.5];
    for (const r of along) {
      const [sx, sz] = at(ae, r), tn = tangent(ae);
      sleeperStack(sink, sx + tn[0] * side * 1.05, sz + tn[2] * side * 1.05, Math.PI - ae, 4, age);
    }
  }

  // ---- the roof: a shallow radial gable over every stall (its ridge an arc at Rm), each bay at its own step, weathered
  // slates patched and gone in places; the lantern along the ridge with broken and boarded lights; the smoke jack over
  // each stall's chimney sooting the slates round it; the eaves' fascia and soffit
  const roofEnd = (k: number): number => theta(k) + (k === 0 ? -0.6 / Rm : k === stalls ? 0.6 / Rm : 0);
  for (let i = 0; i < stalls; i++) {
    const h = step[i], a0 = roofEnd(i), a1 = roofEnd(i + 1), b0 = theta(i), b1 = theta(i + 1), am = (b0 + b1) / 2;
    const S = (a: number, r: number, lift = 0): Vec3 => P(a, r, yAtR(r) + h + lift);
    const tone = 0.74 + age() * 0.24;
    facing(sink, 'roof', [S(a1, rf), S(a0, rf), S(a0, Rm), S(a1, Rm)], UP, { shade: tone });
    facing(sink, 'roof', [S(a0, rb), S(a1, rb), S(a1, Rm), S(a0, Rm)], UP, { shade: tone * (0.9 + age() * 0.12) });
    // the soffits under the eaves and the fascia boards
    facing(sink, 'roof', [S(a0, rf, -0.02), S(a1, rf, -0.02), S(a1, Rf, -0.02), S(a0, Rf, -0.02)], DOWN, { decor: true, shade: 0.55 });
    facing(sink, 'roof', [S(a1, rb, -0.02), S(a0, rb, -0.02), S(a0, Rb, -0.02), S(a1, Rb, -0.02)], DOWN, { decor: true, shade: 0.55 });
    facing(sink, 'structureWood', [S(a1, rf, -0.25), S(a0, rf, -0.25), S(a0, rf, 0.02), S(a1, rf, 0.02)], inward(am), { colour: shade(CAB_TIMBER, 0.6), decor: true });
    facing(sink, 'structureWood', [S(a0, rb, -0.25), S(a1, rb, -0.25), S(a1, rb, 0.02), S(a0, rb, 0.02)], radial(am), { colour: shade(CAB_TIMBER, 0.6), decor: true });
    // the slates' wear: patches of new and old slate and the holes where a blast stripped them to the battens
    const patches = 1 + Math.floor(age() * 2.4);
    for (let k = 0; k < patches; k++) {
      const back = age() < 0.4;
      const r0 = back ? Rm + 1 + age() * (rb - Rm - 3.5) : rf + 0.8 + age() * (Rm - rf - 3.4), dr = 1.0 + age() * 1.4;
      const f0 = 0.1 + age() * 0.5, f1 = Math.min(0.94, f0 + 0.16 + age() * 0.24);
      const c0 = b0 + (b1 - b0) * f0, c1 = b0 + (b1 - b0) * f1, kind = age();
      const pts = [S(c1, r0, 0.03), S(c0, r0, 0.03), S(c0, r0 + dr, 0.03), S(c1, r0 + dr, 0.03)];
      if (kind < 0.28) facing(sink, 'dark', pts, UP, { decor: true });
      else facing(sink, 'roof', pts, UP, { decor: true, shade: tone * (kind < 0.66 ? 0.62 : 1.2) });
    }
    // the lantern along the ridge: its lights between posts (glazed, broken out or boarded), its low roof and ends
    const lw = 0.9, ly0 = Hr + h - 0.15, ly1 = Hr + h + 1.15, bm = (b0 + b1) / 2;
    const Q = (a: number, r: number, y: number): Vec3 => P(a, r, y);
    for (const [c0, c1] of [[b0, bm], [bm, b1]] as const) for (const s of [-1, 1] as const) {
      const r = Rm + s * lw, out = s < 0 ? inward((c0 + c1) / 2) : radial((c0 + c1) / 2), state = age();
      const pts = [Q(c1, r, ly0), Q(c0, r, ly0), Q(c0, r, ly1), Q(c1, r, ly1)];
      if (state < 0.6) facing(sink, 'glass', pts, out, { decor: true, window: out });
      else if (state < 0.86) facing(sink, 'dark', pts, out, { decor: true });
      else facing(sink, 'structureWood', pts, out, { colour: shade(CAB_TIMBER, 0.55), decor: true });
    }
    facing(sink, 'roof', [Q(b1, Rm - lw - 0.3, ly1 - 0.05), Q(b0, Rm - lw - 0.3, ly1 - 0.05), Q(b0, Rm, ly1 + 0.45), Q(b1, Rm, ly1 + 0.45)], UP, { decor: true, shade: tone });
    facing(sink, 'roof', [Q(b0, Rm + lw + 0.3, ly1 - 0.05), Q(b1, Rm + lw + 0.3, ly1 - 0.05), Q(b1, Rm, ly1 + 0.45), Q(b0, Rm, ly1 + 0.45)], UP, { decor: true, shade: tone });
    for (const [a, s] of [[b0, -1], [b1, 1]] as const) {
      const tn = tangent(a);
      facing(sink, 'structureWood', [Q(a, Rm - lw, ly0), Q(a, Rm + lw, ly0), Q(a, Rm + lw, ly1), Q(a, Rm, ly1 + 0.45), Q(a, Rm - lw, ly1)],
        [tn[0] * s, 0, tn[2] * s], { colour: shade(CAB_TIMBER, 0.5), decor: true });
    }
    for (const a of i === stalls - 1 ? [b0, bm, b1] : [b0, bm]) for (const r of [Rm - lw, Rm + lw]) {
      bar(sink, 'structureMetal', Q(a, r, ly0), Q(a, r, ly1), 0.05, { colour: FRAME, decor: true, fine: true });
    }
    // the smoke jack over the chimney of an engine standing in the stall: the sooted hood flaring on the front slope,
    // its tall thin flue and the conical rain cap on its stays; the slates round it and below it black with soot
    const rj = Rf + 3.6, yj = yAtR(rj) + h;
    const [jx, jz] = at(am, rj);
    revolve(sink, 'structureMetal', jx, jz, [[0.95, yj - 0.5], [0.95, yj + 0.35], [0.34, yj + 1.1], [0.32, yj + 4.4], [0.31, yj + 4.4]], 8, { colour: SOOT, decor: true });
    revolve(sink, 'structureMetal', jx, jz, [[0.001, yj + 4.75], [0.72, yj + 4.75], [0.001, yj + 5.25]], 8, { colour: shade(SOOT, 1.25), decor: true });
    for (const d of [-0.3, 0.3]) bar(sink, 'structureMetal', [jx + d, yj + 4.35, jz], [jx + d * 1.5, yj + 4.78, jz], 0.04, { colour: SOOT, decor: true, fine: 'near' });
    const sw = (r: number, m: number): number => m / r, lean = (age() - 0.5) * 0.3 / rj;
    facing(sink, 'roof', [S(am + lean + sw(rj - 2.8, 1.5), rj - 2.8, 0.04), S(am + lean - sw(rj - 2.8, 1.5), rj - 2.8, 0.04),
      S(am - sw(rj + 1.4, 1.0), rj + 1.4, 0.04), S(am + sw(rj + 1.4, 1.0), rj + 1.4, 0.04)], UP, { decor: true, shade: 0.3 });
  }
  // the end gables' verges under the roof's edge
  for (const k of [0, stalls]) {
    const a = roofEnd(k), h = step[k === 0 ? 0 : stalls - 1], Pv = (r: number, y: number): Vec3 => P(a, r, y + h);
    bar(sink, 'structureWood', Pv(rf, yAtR(rf) + 0.05), Pv(Rm, Hr + 0.05), 0.16, { colour: shade(CAB_TIMBER, 0.6), decor: true });
    bar(sink, 'structureWood', Pv(Rm, Hr + 0.05), Pv(rb, yAtR(rb) + 0.05), 0.16, { colour: shade(CAB_TIMBER, 0.6), decor: true });
  }

  // ---- the apron: the cinder bed the stall roads lie in, from the table's coping out to the doors and a margin of it
  // round the rest of the table, its edge sloping down into the yard (dressing: a hull drives over it)
  const fanEdge = half + 0.7 / Rf, margin = Rt + 2.0, rIn = Rt + 0.5;
  const segs: Array<readonly [number, number, number]> = [];
  for (let k = 0; k < stalls * 2; k++) segs.push([-fanEdge + fanEdge * k / stalls, -fanEdge + fanEdge * (k + 1) / stalls, Rf + 0.05]);
  const ring = 22;
  for (let k = 0; k < ring; k++) {
    const span = Math.PI * 2 - 2 * fanEdge;
    segs.push([fanEdge + span * k / ring, fanEdge + span * (k + 1) / ring, margin]);
  }
  for (const [a0, a1, ro] of segs) {
    facing(sink, 'structureMetal', [P(a0, rIn, yard), P(a1, rIn, yard), P(a1, ro, yard), P(a0, ro, yard)], UP, { colour: CINDER, decor: true });
    if (ro < Rf) {
      const am = (a0 + a1) / 2, rd = radial(am);
      facing(sink, 'structureMetal', [P(a0, ro, yard), P(a1, ro, yard), P(a1, ro + 0.7, -0.12), P(a0, ro + 0.7, -0.12)], [rd[0], 1, rd[2]], { colour: shade(CINDER, 0.88), decor: true });
    }
  }
  // the fan's sides where the bed steps from the doors' depth back to the margin
  for (const s of [-1, 1] as const) {
    const a = s * fanEdge, tn = tangent(a), d0 = 0.7 / margin, d1 = 0.7 / Rf;
    facing(sink, 'structureMetal', [P(a, margin, yard), P(a, Rf + 0.05, yard), P(a + s * d1, Rf + 0.05, -0.12), P(a + s * d0, margin, -0.12)],
      [tn[0] * s, 1, tn[2] * s], { colour: shade(CINDER, 0.88), decor: true });
  }
  // the lead's strip of it out to the yard
  if (L.lead > 0) {
    const z0 = zT + Rt + 1.2, z1 = zT + Rt + L.lead - 0.5, hw = 2.6, y = yard - 0.005;
    facing(sink, 'structureMetal', [[-hw, y, z0], [hw, y, z0], [hw, y, z1], [-hw, y, z1]], UP, { colour: CINDER, decor: true });
    for (const s of [-1, 1]) facing(sink, 'structureMetal', [[s * hw, y, z0], [s * hw, y, z1], [s * (hw + 0.7), -0.12, z1], [s * (hw + 0.7), -0.12, z0]], [s, 1, 0], { colour: shade(CINDER, 0.88), decor: true });
    facing(sink, 'structureMetal', [[-hw, y, z1], [hw, y, z1], [hw + 0.4, -0.12, z1 + 0.45], [-hw - 0.4, -0.12, z1 + 0.45]], [0, 1, 1], { colour: shade(CINDER, 0.88), decor: true });
    track(sink, [0, zT + Rt + 0.62], [0, z1 + 0.25], yard);
  }

  // ---- the turntable in its pit under the apron, its bridge laid to a stall (look stream)
  const tableStall = Math.min(stalls - 1, Math.floor(v() * stalls));
  turntable(sink, 0, zT, Rt, yard, -(theta(tableStall) + da / 2));
  // the stall roads: from the table's rim to each door and on into the open stalls, most over an inspection pit before
  // the door (its brick walls carrying the rails, its floor black with ash and oil)
  for (let i = 0; i < stalls; i++) {
    const am = (theta(i) + theta(i + 1)) / 2, r0 = Rt + 0.62, r1 = Rf + (open.has(i) ? 12 : 0.1);
    if (v() < 0.72) {
      const p0 = Rf - 5.4 - v() * 1.6, p1 = Rf - 1.0;
      track(sink, at(am, r0), at(am, p0), yard);
      track(sink, at(am, p0), at(am, p1), yard, false);
      track(sink, at(am, p1), at(am, r1), yard);
      inspectionPit(sink, at(am, p0), at(am, p1), yard);
    } else track(sink, at(am, r0), at(am, r1), yard);
  }
  // the water cranes at the lead track either side of the table's mouth
  for (const s of [-1, 1]) waterCrane(sink, s * 3.6, zT + Rt + Math.min(L.lead, 5) - 1.5, s * (0.4 + v() * 0.5));
  // the coal bunker of sleepers on one side of the table's mouth and the ash and clinker heap on the other, where the
  // fires are cleaned before an engine goes on the table
  const coalSide = v() < 0.5 ? -1 : 1, cx = coalSide * Math.min(L.across - 4.6, Rt + 5.9);
  coalBunker(sink, cx, zT - 6.2, coalSide, age);
  heap(sink, -coalSide * Math.min(L.across - 4.4, Rt + 5.4), zT - 9.6, 2.5, 3.4, 1.35, ASH, age);
  heap(sink, -coalSide * Math.min(L.across - 3.4, Rt + 6.6), zT - 5.6, 1.4, 1.5, 0.7, shade(ASH, 0.7), age);
  return { parts: sink.finish() };
};

/** The fire wall between two stalls' bays: brick from the front pilaster over both roofs to the back eaves, its top
 *  `hi` + 0.42 m over the higher roof, with a coping course proud each side (dressing over the stalls' solids). */
function fireWall(sink: PartSink, a: number, lo: number, hi: number, g: {
  Rf: number; Rb: number; Rm: number; rf: number; rb: number; Hf: number; Hb: number;
  yAtR: (r: number) => number; at: (a: number, r: number) => [number, number]; tangent: Vec3;
}): void {
  const t = 0.5, tn = g.tangent;
  const top = (r: number): number => g.yAtR(r) + hi + 0.42;
  const Q = (r: number, y: number, s = -0.5): Vec3 => { const [x, z] = g.at(a, r); return [x + tn[0] * t * s, y, z + tn[2] * t * s]; };
  // in the radial plane: (radial out, up, tangent) is right-handed, so this runs counter-clockwise seen from +tangent
  sink.prism('stone', [Q(g.Rf - 0.34, g.Hf - 0.7), Q(g.Rb + 0.05, g.Hb - 0.7), Q(g.rb + 0.02, g.yAtR(g.rb) + lo - 0.25), Q(g.rb + 0.02, top(g.rb)),
    Q(g.Rm, top(g.Rm)), Q(g.rf - 0.02, top(g.rf)), Q(g.rf - 0.02, g.yAtR(g.rf) + lo - 0.25)], tn, t, { decor: true, shade: 0.9 });
  for (const [r0, r1] of [[g.rf - 0.08, g.Rm], [g.Rm, g.rb + 0.08]] as const) {
    const y0 = top(r0) + 0.07, y1 = top(r1) + 0.07;
    facing(sink, 'stone', [Q(r0, y0, -0.62), Q(r1, y1, -0.62), Q(r1, y1, 0.62), Q(r0, y0, 0.62)], UP, { decor: true, shade: 0.62 });
    for (const s of [-1, 1] as const) {
      facing(sink, 'stone', [Q(r0, y0 - 0.13, s * 0.62), Q(r1, y1 - 0.13, s * 0.62), Q(r1, y1, s * 0.62), Q(r0, y0, s * 0.62)], [tn[0] * s, 0, tn[2] * s], { decor: true, shade: 0.55 });
    }
  }
}

/** A vertical strip proud of a face (a pilaster, a pier) at u from y0 to y1, `w` wide and `o` out. */
function faceStrip(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y0: number, w: number, y1: number, o: number, opts: EmitOptions = {}): void {
  const P = (uu: number, y: number, oo: number): Vec3 => facePoint(face, uu, y, oo);
  const a = u - w / 2, b = u + w / 2;
  sink.quad(bucket, P(a, y0, o), P(b, y0, o), P(b, y1, o), P(a, y1, o), { decor: true, ...opts });
  sink.quad(bucket, P(a, y0, 0), P(a, y0, o), P(a, y1, o), P(a, y1, 0), { decor: true, ...opts, shade: 0.8 });
  sink.quad(bucket, P(b, y0, o), P(b, y0, 0), P(b, y1, 0), P(b, y1, o), { decor: true, ...opts, shade: 0.8 });
}

/** A stain on a brick face (damp at a foot, a rain streak, soot): a darker band of the brick itself from u0 to u1, y0 to y1. */
function stain(sink: PartSink, face: Face, u0: number, u1: number, y0: number, y1: number, dark: number): void {
  const P = (u: number, y: number): Vec3 => facePoint(face, u, y, 0.012);
  sink.quad('stone', P(u0, y0), P(u1, y0), P(u1, y1), P(u0, y1), { decor: true, shade: dark });
}

/** The soot over an engine-shed door: black on the brick round the arch's head, a plume thinning up to `top`. */
function sootOver(sink: PartSink, face: Face, h: ArchHole, top: number, dark: number, age: () => number): void {
  const crown = h.spring + archRise(h), w = h.w, lean = (age() - 0.5) * 0.5, o = 0.012;
  const P = (u: number, y: number): Vec3 => facePoint(face, h.u + u, y, o);
  const opts = { decor: true, shade: dark };
  // the haunches, following the arch up to the crown's line
  const line = archLine(h, 8);
  for (let i = 0; i + 1 < line.length; i++) {
    const [ua, ya] = line[i], [ub, yb] = line[i + 1];
    if (Math.min(ya, yb) > crown - 0.03) continue;
    sink.quad('stone', P(ua - h.u, ya + 0.02), P(ub - h.u, yb + 0.02), P(ub - h.u, crown + 0.03), P(ua - h.u, crown + 0.03), opts);
  }
  // the dense band over the crown, then the plume
  sink.quad('stone', P(-w * 0.5, crown + 0.03), P(w * 0.5, crown + 0.03), P(w * 0.46 + lean, crown + 0.95), P(-w * 0.5 + lean, crown + 0.95), opts);
  if (top > crown + 1.05) sink.quad('stone', P(-w * 0.5 + lean, crown + 0.95), P(w * 0.46 + lean, crown + 0.95), P(w * 0.26 + lean * 1.8, top), P(-w * 0.34 + lean * 1.8, top), { decor: true, shade: dark + 0.24 });
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
function leafOpen(sink: PartSink, face: Face, side: -1 | 1, w: number, top: number, swing: number, y0: number, colour: Rgb): void {
  // the hinge at the jamb's outer edge; the leaf runs back toward the centre when closed (along -side*u) and swings out
  const hu = side * (w + 0.02), dirU = -side * Math.cos(swing), dirO = Math.sin(swing);
  const P = (along: number, y: number, off: number): Vec3 => facePoint(face, hu + dirU * along, y, 0.05 + dirO * along + off);
  const a = P(0, y0, 0), b = P(w - 0.05, y0, 0), c = P(w - 0.05, top, 0), d = P(0, top, 0);
  // two faces (each side of the leaf seen)
  sink.quad('structureWood', a, b, c, d, { colour, decor: true });
  sink.quad('structureWood', b, a, d, c, { colour: shade(colour, 0.75), decor: true });
  for (const y of [y0 + 0.5, (y0 + top) / 2, top - 0.5]) bar(sink, 'structureWood', P(0.08, y, 0.03), P(w - 0.13, y, 0.03), 0.07, { colour: shade(colour, 0.8), decor: true, fine: true });
}

/**
 * An iron window of small panes in its opening: the glazing, a grid of glazing bars (coarse frame, fine bars), and
 * `broken` of its panes gone (a dark hole where the glass was) or boarded, drawn from the age stream.
 */
function ironWindow(sink: PartSink, face: Face, h: ArchHole, reveal: number, age?: () => number, broken = 0): void {
  archWindow(sink, face, h, reveal, FRAME, false, { bars: true, coarse: true });
  const o = -reveal + 0.04;
  const rows: number[] = [h.y0];
  for (let y = h.y0 + 0.42; y < h.spring; y += 0.42) {
    rows.push(y);
    sink.member('structureMetal', facePoint(face, h.u - h.w / 2, y, o), facePoint(face, h.u + h.w / 2, y, o), 0.03, 0.03, face.out, { colour: FRAME, decor: true, fine: true });
  }
  const cols = Math.round(h.w / 0.4);
  for (let k = 1; k < cols; k++) {
    const u = h.u - h.w / 2 + k * h.w / cols;
    sink.member('structureMetal', facePoint(face, u, h.y0, o), facePoint(face, u, h.spring, o), 0.03, 0.03, face.out, { colour: FRAME, decor: true, fine: true });
  }
  if (!age || broken <= 0) return;
  const ob = -reveal + 0.022;
  for (let r = 0; r < rows.length; r++) for (let k = 0; k < cols; k++) {
    const roll = age();
    if (roll >= broken) continue;
    const y0 = rows[r] + 0.02, y1 = Math.min(h.spring, rows[r] + 0.4), u0 = h.u - h.w / 2 + k * h.w / cols + 0.02, u1 = u0 + h.w / cols - 0.04;
    if (y1 - y0 < 0.1) continue;
    const pts = [facePoint(face, u0, y0, ob), facePoint(face, u1, y0, ob), facePoint(face, u1, y1, ob), facePoint(face, u0, y1, ob)];
    if (roll < broken * 0.8) facing(sink, 'dark', pts, face.out, { decor: true });
    else facing(sink, 'structureWood', pts, face.out, { colour: shade(CAB_TIMBER, 0.7), decor: true });
  }
}

/** The dark stall beyond an open door: its sooted floor (at the apron's `floor`), walls and roof from radius r0 to r1. */
function shedInterior(sink: PartSink, at: (a: number, r: number) => [number, number], a0: number, a1: number, r0: number, r1: number, floor: number, h: number): void {
  const P = (a: number, r: number, y: number): Vec3 => { const [x, z] = at(a, r); return [x, y, z]; };
  const k = 0.18 * (a1 - a0);
  const b0 = a0 + k * 0.2, b1 = a1 - k * 0.2;
  // floor, the two side walls (facing in), the back of the stall, the roof's underside
  facing(sink, 'dark', [P(b0, r0, floor + 0.03), P(b1, r0, floor + 0.03), P(b1, r1, floor + 0.03), P(b0, r1, floor + 0.03)], UP, { decor: true });
  sink.quad('dark', P(b0, r1, 0), P(b0, r0, 0), P(b0, r0, h), P(b0, r1, h), { decor: true });
  sink.quad('dark', P(b1, r0, 0), P(b1, r1, 0), P(b1, r1, h), P(b1, r0, h), { decor: true });
  sink.quad('dark', P(b1, r1, 0), P(b0, r1, 0), P(b0, r1, h), P(b1, r1, h), { decor: true });
  facing(sink, 'dark', [P(b0, r0, h), P(b1, r0, h), P(b1, r1, h), P(b0, r1, h)], DOWN, { decor: true });
}

/**
 * A goods engine standing at an open stall, its smokebox out of the door (a Reichsbahn 2-10-0 of the BR 44 and 50
 * classes, simplified to what reads from a tank: the boiler on its frames, the smokebox door, the chimney and dome,
 * the cab, the smoke deflectors, the coupled wheels and cylinders). Its axis along the stall road, its front at r0,
 * its rails at y.
 */
function engine(sink: PartSink, at: (a: number, r: number) => [number, number], a: number, r0: number, y: number): void {
  const black = rgb(0x1c1c1d), red = rgb(0x6c1f1a), steel = rgb(0x3b3c3e);
  const front = at(a, r0), back = at(a, r0 + 13.5);
  const ux = (back[0] - front[0]) / 13.5, uz = (back[1] - front[1]) / 13.5;
  const yaw = Math.atan2(ux, uz);
  sink.placed(yaw, front[0] + ux * 6.6, y, front[1] + uz * 6.6, () => {
    // the frames and the running plate
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

/**
 * The turntable in its pit: the coping round the rim a course over the apron's cinders (`y`), the pit's dark wall down to
 * its floor, the ring beam and the circular rail on it, and the half-through bridge laid to `yaw` — its two plate
 * girders a metre over the rails with their stiffeners and fish bellies down into the pit, the deck and its track at the
 * apron's level, the walkways and handrails outside the girders, the end carriages on the ring rail and the operator's
 * cab. All dressing: a hull drives over it.
 */
function turntable(sink: PartSink, cx: number, cz: number, R: number, y: number, yaw: number): void {
  const n = 40, floor = 0.03, cope = y + 0.12, fb = floor + 0.14;
  // the coping (its outer face down into the cinders, closed under them), the pit's wall black with damp and oil down to
  // its brick floor (the wall's end closes it), the ring beam and the circular rail on it
  revolve(sink, 'stone', cx, cz, [[R + 0.6, -0.1], [R + 0.6, cope], [R, cope]], n, { decor: true, shade: 0.92 });
  revolve(sink, 'stone', cx, cz, [[R + 0.01, cope], [R, cope], [R, floor]], n, { decor: true, shade: 0.3 });
  revolve(sink, 'stone', cx, cz, [[R - 0.45, fb], [R - 1.05, fb]], n, { decor: true, shade: 0.62 });
  revolve(sink, 'structureMetal', cx, cz, [[R - 0.71, fb + 0.15], [R - 0.79, fb + 0.15]], n, { colour: RAIL_TOP, decor: true });
  sink.placed(yaw, cx, 0, cz, () => {
    const Lb = R - 0.12, top = y + 1.0, endBot = y - 0.14, midBot = floor + 0.18;
    const bot = (z: number): number => endBot - (endBot - midBot) * (1 - (z / Lb) ** 2);
    for (const s of [-1, 1] as const) {
      const xg = s * 1.32, N = 8;
      for (let k = 0; k < N; k++) {
        const z0 = -Lb + 2 * Lb * k / N, z1 = -Lb + 2 * Lb * (k + 1) / N;
        const web: Vec3[] = [[xg, bot(z0), z0], [xg, bot(z1), z1], [xg, top, z1], [xg, top, z0]];
        facing(sink, 'structureMetal', web, [s, 0, 0], { colour: IRON, decor: true });
        facing(sink, 'structureMetal', web, [-s, 0, 0], { colour: shade(IRON, 0.8), decor: true });
      }
      // the top flange, the stiffeners down the web's outer face
      sink.span('structureMetal', xg - 0.2, top, -Lb, xg + 0.2, top + 0.07, Lb, { colour: shade(IRON, 1.1), decor: true });
      for (let z = -Lb + 1.2; z < Lb - 0.8; z += 2.4) bar(sink, 'structureMetal', [xg + s * 0.06, bot(z) + 0.05, z], [xg + s * 0.06, top, z], 0.09, { colour: shade(IRON, 1.15), decor: true, fine: true });
      // the walkway outside the girder, its handrail on stanchions
      sink.span('structureWood', s > 0 ? 1.44 : -2.2, y - 0.06, -Lb, s > 0 ? 2.2 : -1.44, y, Lb, { colour: shade(SLEEPER, 1.25), decor: true });
      bar(sink, 'structureMetal', [s * 2.15, y + 1.0, -Lb + 0.2], [s * 2.15, y + 1.0, Lb - 0.2], 0.05, { colour: IRON, decor: true });
      for (let z = -Lb + 0.2; z <= Lb - 0.1; z += 2.3) bar(sink, 'structureMetal', [s * 2.15, y, z], [s * 2.15, y + 1.0, z], 0.045, { colour: IRON, decor: true, fine: true });
    }
    // the deck between the girders and the bridge's rails on it
    sink.span('structureWood', -1.22, y - 0.1, -Lb, 1.22, y, Lb, { colour: SLEEPER, decor: true });
    track(sink, [0, -Lb], [0, Lb], y, false);
    // the end carriages on the ring rail
    for (const z of [-(R - 0.75), R - 0.75]) sink.span('structureMetal', -2.25, fb + 0.15, z - 0.4, 2.25, y - 0.06, z + 0.4, { colour: IRON, decor: true });
    // the operator's cab on the walkway at the +z end
    const c = R - 2.7;
    sink.span('structureWood', 1.45, y, c - 0.85, 2.95, y + 2.3, c + 0.85, { colour: CAB_TIMBER, decor: true });
    sink.span('glass', 2.95, y + 1.2, c - 0.6, 2.97, y + 2.0, c + 0.6, { decor: true });
    sink.span('glass', 1.65, y + 1.2, c + 0.85, 2.75, y + 2.0, c + 0.87, { decor: true });
    sink.span('structureWood', 1.35, y + 2.3, c - 1.0, 3.1, y + 2.45, c + 1.0, { colour: shade(CAB_TIMBER, 0.6), decor: true });
    // the king pin's cover on its pier
    sink.cylinder('stone', [0, floor, 0], 'y', 0.5, 1.1, 12, { decor: true, shade: 0.7 });
    sink.cylinder('structureMetal', [0, floor + 0.5, 0], 'y', 0.25, 0.7, 12, { colour: IRON, decor: true });
  });
}

/** An inspection pit between a stall road's rails from a to b (plan points; the apron's top at y): its black floor and
 *  the brick walls that carry the rails, the steps down at its far end. Dressing. */
function inspectionPit(sink: PartSink, a: readonly [number, number], b: readonly [number, number], y: number): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, nx = uz, nz = -ux, w = 0.52;
  const C = (t: number, s: number, yy: number): Vec3 => [a[0] + ux * t + nx * s, yy, a[1] + uz * t + nz * s];
  facing(sink, 'structureMetal', [C(0, -w, y + 0.006), C(L, -w, y + 0.006), C(L, w, y + 0.006), C(0, w, y + 0.006)], UP, { colour: PIT_DEEP, decor: true });
  // the walls' brick copings either side (their tops and the faces into the pit) and across its ends
  for (const s of [-1, 1] as const) {
    facing(sink, 'stone', [C(0, s * w, y + 0.08), C(L, s * w, y + 0.08), C(L, s * (w + 0.16), y + 0.08), C(0, s * (w + 0.16), y + 0.08)], UP, { decor: true, shade: 0.55 });
    facing(sink, 'stone', [C(0, s * w, y + 0.006), C(L, s * w, y + 0.006), C(L, s * w, y + 0.08), C(0, s * w, y + 0.08)], [-nx * s, 0, -nz * s], { decor: true, shade: 0.35 });
  }
  for (const [t, d] of [[0, 1], [L, -1]] as const) {
    facing(sink, 'stone', [C(t, -w, y + 0.08), C(t, w, y + 0.08), C(t + d * 0.16, w, y + 0.08), C(t + d * 0.16, -w, y + 0.08)], UP, { decor: true, shade: 0.55 });
  }
  for (let k = 0; k < 3; k++) facing(sink, 'stone', [C(0.25 + k * 0.28, -w * 0.8, y + 0.008), C(0.25 + k * 0.28, w * 0.8, y + 0.008), C(0.45 + k * 0.28, w * 0.8, y + 0.008), C(0.45 + k * 0.28, -w * 0.8, y + 0.008)], UP, { decor: true, shade: 0.5 + k * 0.08, fine: true });
}

/** A loose heap (coal, ash and clinker): an irregular low mound of rings, its foot sunk in the ground. Dressing. */
function heap(sink: PartSink, cx: number, cz: number, rx: number, rz: number, h: number, colour: Rgb, age: () => number): void {
  const n = 9;
  const prof: ReadonlyArray<readonly [number, number]> = [[1.12, -0.2], [1.0, 0.03], [0.8, 0.4], [0.5, 0.76], [0.18, 1]];
  const jit = Array.from({ length: n }, () => 0.82 + age() * 0.36), lift = Array.from({ length: n }, () => 0.85 + age() * 0.3);
  const rings = prof.map(([f, yy], k) => Array.from({ length: n }, (_, i): Vec3 => {
    const a = i / n * Math.PI * 2, j = jit[(i + k * 3) % n];
    return [cx + Math.cos(a) * rx * f * j, yy <= 0.03 ? yy : h * yy * lift[(i + k) % n], cz + Math.sin(a) * rz * f * j];
  }));
  for (let k = 0; k + 1 < rings.length; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, a = (i + 0.5) / n * Math.PI * 2;
    facing(sink, 'structureMetal', [rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]], [Math.cos(a), 0.7, Math.sin(a)],
      { colour: shade(colour, 0.86 + ((i * 7 + k * 3) % 5) * 0.06), decor: true });
  }
  facing(sink, 'structureMetal', rings[rings.length - 1], UP, { colour, decor: true });
}

/** The coal bunker at (x, z): three walls of old sleepers between rail posts, open toward the table on the -side face,
 *  heaped with coal spilling out of its mouth. */
function coalBunker(sink: PartSink, x: number, z: number, side: -1 | 1, age: () => number): void {
  const w = 4.2, d = 6.0, hgt = 1.3, t = 0.26, xo = x + side * w / 2, xi = x - side * w / 2;
  const c = shade(SLEEPER, 1.1);
  sink.span('structureWood', Math.min(xo, xo - side * t), 0, z - d / 2, Math.max(xo, xo - side * t), hgt, z + d / 2, { colour: c });
  for (const s of [-1, 1]) sink.span('structureWood', Math.min(xi, xo), 0, z + s * d / 2 - (s > 0 ? t : 0), Math.max(xi, xo), hgt, z + s * d / 2 + (s < 0 ? t : 0), { colour: c });
  // the courses' joints and the rail posts holding them
  for (let y = 0.26; y < hgt; y += 0.26) bar(sink, 'structureWood', [xo + side * 0.01, y, z - d / 2], [xo + side * 0.01, y, z + d / 2], 0.03, { colour: shade(c, 0.55), decor: true, fine: 'near' });
  for (const [px, pz] of [[xo, z - d / 2], [xo, z + d / 2], [xo, z], [xi, z - d / 2], [xi, z + d / 2]] as const) {
    bar(sink, 'structureMetal', [px + side * 0.16, -0.2, pz], [px + side * 0.16, hgt + 0.25, pz], 0.13, { colour: RAIL, decor: true });
  }
  heap(sink, x - side * 0.5, z, w * 0.62, d * 0.46, 1.9, COAL, age);
}

/** A stack of sleepers at (x, z), turned `yaw` (their length along its local z): layers of five on two bearers each,
 *  the top layer short, each sleeper a little off its neighbours. Dressing. */
function sleeperStack(sink: PartSink, x: number, z: number, yaw: number, layers: number, age: () => number): void {
  sink.placed(yaw, x, 0, z, () => {
    for (let l = 0; l < layers; l++) {
      const y = l * 0.2, n = l === layers - 1 ? 2 + Math.floor(age() * 3) : 5;
      if (l > 0) for (const zz of [-0.85, 0.85]) sink.span('structureWood', -0.78, y - 0.05, zz - 0.1, 0.78, y, zz + 0.1, { colour: shade(SLEEPER, 0.8), decor: true, fine: true });
      // a layer laid as a block a little off the one under it (the full layers), the top's few sleepers apart
      const off = (age() - 0.5) * 0.36, c = shade(SLEEPER, 0.8 + age() * 0.45);
      if (n === 5) {
        sink.span('structureWood', -0.75, y, -1.3 + off, 0.75, y + 0.15, 1.3 + off, { colour: c, decor: true });
        for (let k = 1; k < 5; k++) sink.quad('structureWood', [-0.75 + k * 0.3 - 0.015, y + 0.151, 1.3 + off], [-0.75 + k * 0.3 + 0.015, y + 0.151, 1.3 + off], [-0.75 + k * 0.3 + 0.015, y + 0.151, -1.3 + off], [-0.75 + k * 0.3 - 0.015, y + 0.151, -1.3 + off], { colour: shade(c, 0.5), decor: true, fine: 'near' });
      } else for (let k = 0; k < n; k++) {
        const xx = -0.62 + k * 0.31, o2 = off + (age() - 0.5) * 0.3;
        sink.span('structureWood', xx - 0.13, y, -1.3 + o2, xx + 0.13, y + 0.15, 1.3 + o2, { colour: shade(c, 0.9 + age() * 0.2), decor: true });
      }
    }
  });
}

/**
 * The signal box at a throat (Reichsbahn Stellwerk, 1910s-30s): `length` along the tracks (x), `depth` across, the brick
 * lower storey (`base` high) whose tall windows light the locking and rodding room; the timber operating floor over it,
 * cantilevered 1.1 m toward the tracks on iron stilts and 0.4 m round its other sides on timber brackets, glazed on its
 * front and both ends between mullions; its hipped roof with the stove pipe; the outside stair up the back to the
 * landing door; and the rodding run out of the outlet at the foot of the front, on its stools, turning along the
 * tracks both ways. Its front (+z) faces the tracks.
 */
export const signalBox: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const age = ctx.age ?? ((): number => 0.5);
  const W = num(ctx, 'length', 6, 16), D = num(ctx, 'depth', 3.5, 6), Hb = num(ctx, 'base', 3, 8), Hc = 3.1;
  const foot = -0.6 - ctx.groundFall, wall: RegionalBucket = 'stone';
  // ---- the lower storey: tall segmental windows to the front and ends, the door in the back at the +x end
  const sill = Math.min(1.0, Hb * 0.25), spring = Math.max(sill + 1.0, Math.min(Hb - 1.3, 3.0));
  const win = (u: number): ArchHole => ({ u, w: 1.1, y0: sill, spring, form: 'segmental', rise: 0.22 });
  const nf = Math.max(2, Math.round((W - 1.6) / 2.0));
  const lower: Partial<Record<FaceName, ArchHole[]>> = {
    front: Array.from({ length: nf }, (_, k) => win(-W / 2 + 0.8 + (W - 1.6) * (k + 0.5) / nf)),
    back: [{ u: -(W / 2 - 1.2), w: 1.1, y0: 0, spring: 2.15, form: 'segmental', rise: 0.25 }],
    right: [win(0)], left: [win(0)],
  };
  const lf = archedBody(sink, wall, 0, 0, W, D, foot, Hb, lower, 0.26);
  for (const name of ['front', 'right', 'left'] as const) for (const h of lower[name]!) {
    ironWindow(sink, lf[name], h, 0.26, age, 0.08);
    // the rain's streak down the brick from the sill
    stain(sink, lf[name], h.u - h.w * 0.4, h.u + h.w * 0.25, Math.max(0.5, h.y0 - 0.9 - age() * 0.5), h.y0 - 0.02, 0.72);
  }
  leaf(sink, lf.back, lower.back![0].u, 1.04, 2.1, -0.24, 0, DOOR);
  for (const f of [lf.front, lf.back, lf.left, lf.right]) {
    corbelCornice(sink, wall, f, Hb + 0.2, f.width);
    // the damp at the foot (round the door on the back)
    if (f === lf.back) {
      const du = lower.back![0].u;
      stain(sink, f, -f.width / 2, du - 0.6, foot, 0.5 + age() * 0.2, 0.64);
      stain(sink, f, du + 0.6, f.width / 2, foot, 0.5 + age() * 0.2, 0.64);
    } else stain(sink, f, -f.width / 2, f.width / 2, foot, 0.5 + age() * 0.2, 0.64);
  }
  // the rodding outlet low in the front wall
  facing(sink, 'dark', [facePoint(lf.front, -W / 2 + 1.0, 0.12, 0.02), facePoint(lf.front, W / 2 - 1.0, 0.12, 0.02), facePoint(lf.front, W / 2 - 1.0, 0.42, 0.02), facePoint(lf.front, -W / 2 + 1.0, 0.42, 0.02)], [0, 0, 1], { decor: true });

  // ---- the operating floor: timber walls over the brick, out 1.1 m to the front and 0.4 m round the rest
  const ofr = 1.1, oth = 0.4, ow = W + 2 * oth, od = D + oth + ofr, cz = (ofr - oth) / 2;
  const y0 = Hb + 0.05, y1 = Hb + Hc, gs = y0 + 0.95, gh = y1 - 0.28;
  const zF = cz + od / 2, zB = cz - od / 2;
  const band = (width: number, u = 0): ArchHole => ({ u, w: width, y0: gs, spring: gh, form: 'flat' });
  const door: ArchHole = { u: ow / 2 - 0.75, w: 0.9, y0, spring: y0 + 2.1, form: 'flat' };
  const upper: Partial<Record<FaceName, ArchHole[]>> = {
    front: [band(ow - 0.5)], right: [band(od - 0.5)], left: [band(od - 0.5)],
    back: [door, { u: -0.6, w: 0.8, y0: gs, spring: gh, form: 'flat' }, { u: -2.4, w: 0.8, y0: gs, spring: gh, form: 'flat' }],
  };
  const uf = archedBody(sink, 'wood', 0, cz, ow, od, y0, y1, upper, 0.08);
  // the glazing band on three sides: mullions every 0.8-1 m, the top lights' transom, the sliding sashes' meeting rail,
  // a pane gone or boarded here and there; the sill board under it
  for (const name of ['front', 'right', 'left'] as const) {
    const f = uf[name], h = upper[name]![0], o = -0.045;
    archWindow(sink, f, h, 0.08, CAB_TRIM, false, { bars: false, coarse: true });
    const n = Math.max(2, Math.round(h.w / 0.9)), pw = h.w / n, tr = h.spring - 0.42;
    for (let k = 1; k < n; k++) {
      const u = h.u - h.w / 2 + k * pw;
      sink.member('structureWood', facePoint(f, u, h.y0, o), facePoint(f, u, h.spring, o), 0.08, 0.06, f.out, { colour: CAB_TRIM, decor: true });
    }
    sink.member('structureWood', facePoint(f, h.u - h.w / 2, tr, o), facePoint(f, h.u + h.w / 2, tr, o), 0.07, 0.05, f.out, { colour: CAB_TRIM, decor: true });
    sink.member('structureWood', facePoint(f, h.u - h.w / 2, (h.y0 + tr) / 2, o), facePoint(f, h.u + h.w / 2, (h.y0 + tr) / 2, o), 0.05, 0.04, f.out, { colour: CAB_TRIM, decor: true, fine: true });
    for (let k = 0; k < n; k++) {
      const roll = age();
      if (roll > 0.12) continue;
      const u0 = h.u - h.w / 2 + k * pw + 0.05, u1 = u0 + pw - 0.1, ya = roll < 0.06 ? h.y0 + 0.04 : (h.y0 + tr) / 2 + 0.03, yb = roll < 0.06 ? (h.y0 + tr) / 2 - 0.03 : tr - 0.04;
      facing(sink, roll < 0.08 ? 'dark' : 'structureWood', [facePoint(f, u0, ya, -0.06), facePoint(f, u1, ya, -0.06), facePoint(f, u1, yb, -0.06), facePoint(f, u0, yb, -0.06)], f.out,
        roll < 0.08 ? { decor: true } : { colour: shade(CAB_TIMBER, 0.8), decor: true });
    }
    sink.member('structureWood', facePoint(f, -f.width / 2, h.y0 - 0.05, 0.03), facePoint(f, f.width / 2, h.y0 - 0.05, 0.03), 0.09, 0.1, f.out, { colour: CAB_TRIM, decor: true });
  }
  for (const h of upper.back!.slice(1)) archWindow(sink, uf.back, h, 0.08, CAB_TRIM, false, { bars: true, coarse: true });
  // the boarding's head trim and the sill beam the floor stands on
  for (const f of [uf.front, uf.back, uf.left, uf.right]) {
    sink.member('structureWood', facePoint(f, -f.width / 2, y1 - 0.15, 0.03), facePoint(f, f.width / 2, y1 - 0.15, 0.03), 0.09, 0.05, f.out, { colour: CAB_TRIM, decor: true, fine: true });
    sink.member('structureWood', facePoint(f, -f.width / 2, y0 - 0.1, 0.04), facePoint(f, f.width / 2, y0 - 0.1, 0.04), 0.24, 0.14, f.out, { colour: shade(CAB_TIMBER, 0.7), decor: true });
  }
  leaf(sink, uf.back, door.u, 0.86, y0 + 2.1, -0.06, y0, DOOR_PAINT);
  // the floor's underside over the overhang
  facing(sink, 'structureWood', [[-ow / 2, y0 - 0.2, zB], [ow / 2, y0 - 0.2, zB], [ow / 2, y0 - 0.2, zF], [-ow / 2, y0 - 0.2, zF]], DOWN, { colour: shade(CAB_TIMBER, 0.45), decor: true });
  // the stilts under the front: iron columns on their footings, braced to the sill beam
  const posts = Math.max(2, Math.round(ow / 4.4));
  for (let k = 0; k <= posts; k++) {
    const px = -ow / 2 + 0.3 + (ow - 0.6) * k / posts, pz = zF - 0.25;
    sink.cylinder('stone', [px, foot, pz], 'y', 0.75 - foot, 0.28, 8, { shade: 0.85 });
    sink.cylinder('structureMetal', [px, 0.75, pz], 'y', y0 - 0.95, 0.1, 8, { colour: IRON });
    for (const s of [-1, 1]) if ((k > 0 || s > 0) && (k < posts || s < 0)) bar(sink, 'structureMetal', [px, y0 - 1.1, pz], [px + s * 0.8, y0 - 0.1, zF + 0.1], 0.07, { colour: IRON, decor: true });
    bar(sink, 'structureMetal', [px, y0 - 1.0, pz], [px, y0 - 0.24, D / 2], 0.07, { colour: IRON, decor: true });
  }
  // the brackets under the narrow overhang round the ends and the back
  for (const s of [-1, 1]) for (const z of [-D / 2 + 0.7, D / 2 - 0.7]) bar(sink, 'structureWood', [s * W / 2, Hb - 0.9, z], [s * (ow / 2 - 0.08), y0 - 0.22, z], 0.13, { colour: CAB_TIMBER, decor: true });
  for (const x of [-W / 4, W / 4]) bar(sink, 'structureWood', [x, Hb - 0.9, -D / 2], [x, y0 - 0.22, zB + 0.08], 0.13, { colour: CAB_TIMBER, decor: true });
  // the hipped roof, its eaves well out over the windows, and the stove pipe
  const roof: RoofSpec = { kind: 'hip', pitchDeg: 32, eave: 0.6, verge: 0.6, thickness: 0.12, bucket: 'roof', ridge: null };
  sink.placed(0, 0, 0, cz, () => emitRoof(sink, roofGeometry(ow, od, y1, roof), roof));
  bar(sink, 'structureMetal', [W / 4, y1 + 0.5, cz - od / 4], [W / 4, y1 + 2.6, cz - od / 4], 0.12, { colour: IRON, decor: true });
  sink.cylinder('structureMetal', [W / 4, y1 + 2.6, cz - od / 4], 'y', 0.22, 0.2, 8, { colour: IRON, decor: true });
  // the name board on the front under the windows
  sink.span('structureWood', -1.3, y0 + 0.3, zF + 0.02, 1.3, y0 + 0.72, zF + 0.06, { colour: rgb(0x1e2a24), decor: true });
  sink.span('structureWood', -1.2, y0 + 0.38, zF + 0.06, 1.2, y0 + 0.64, zF + 0.065, { colour: CAB_TRIM, decor: true, fine: true });

  // ---- the outside stair: the landing at the back door on its posts, the flight down along the back wall toward +x
  const lx0 = -ow / 2, lx1 = -ow / 2 + 1.6, lz0 = zB - 1.1, run = Math.max(3.2, y0 * 1.05);
  sink.span('structureWood', lx0, y0 - 0.12, lz0, lx1, y0, zB, { colour: CAB_TIMBER });
  for (const [px, pz] of [[lx0 + 0.1, lz0 + 0.1], [lx1 - 0.1, lz0 + 0.1]] as const) bar(sink, 'structureWood', [px, foot, pz], [px, y0 - 0.12, pz], 0.15, { colour: CAB_TIMBER });
  bar(sink, 'structureMetal', [lx0 + 0.04, y0 + 1.0, lz0 + 0.04], [lx1, y0 + 1.0, lz0 + 0.04], 0.05, { colour: IRON, decor: true });
  bar(sink, 'structureMetal', [lx0 + 0.04, y0 + 1.0, lz0 + 0.04], [lx0 + 0.04, y0 + 1.0, zB], 0.05, { colour: IRON, decor: true });
  for (const [px, pz] of [[lx0 + 0.04, lz0 + 0.04], [lx0 + 0.04, zB - 0.5], [lx0 + 0.8, lz0 + 0.04]] as const) bar(sink, 'structureMetal', [px, y0, pz], [px, y0 + 1.0, pz], 0.04, { colour: IRON, decor: true, fine: true });
  const zs0 = lz0 + 0.05, zs1 = zB - 0.08;
  for (const z of [zs0, zs1]) sink.member('structureWood', [lx1, y0 - 0.05, z], [lx1 + run, 0.0, z], 0.3, 0.07, [0, 0, z === zs0 ? -1 : 1], { colour: CAB_TIMBER, decor: true, exposed: true });
  const steps = Math.max(6, Math.round(y0 / 0.21));
  for (let k = 1; k < steps; k++) {
    const y = y0 - k * (y0 / steps), x = lx1 + k * run / steps;
    sink.span('structureWood', x - 0.14, y - 0.04, zs0 + 0.03, x + 0.14, y, zs1 - 0.03, { colour: shade(CAB_TIMBER, 1.1), decor: true });
  }
  bar(sink, 'structureMetal', [lx1, y0 + 0.95, zs0 - 0.03], [lx1 + run, 0.95, zs0 - 0.03], 0.05, { colour: IRON, decor: true });
  for (let k = 0; k <= 3; k++) {
    const x = lx1 + run * k / 3, y = y0 * (1 - k / 3);
    bar(sink, 'structureMetal', [x, y, zs0 - 0.03], [x, y + 0.95, zs0 - 0.03], 0.04, { colour: IRON, decor: true, fine: true });
  }
  bar(sink, 'structureWood', [lx1 + run * 0.5, foot, zs0], [lx1 + run * 0.5, y0 * 0.5 - 0.12, zs0], 0.13, { colour: CAB_TIMBER });

  // ---- the rodding and signal wires: out of the outlet under the cab on their stools, then by the cranks along the
  // tracks both ways (a dark bundle at range, the separate rods near)
  const zr0 = D / 2, zTurn = D / 2 + 2.6, reach = W / 2 + 1.55, ry = 0.3, rods = 5;
  for (const s of [-1, 1] as const) {
    const xs = s * 0.9;
    for (let k = 0; k < rods; k++) {
      const x = xs + s * k * 0.13, zt = zTurn + k * 0.13;
      const rod = { colour: RAIL_TOP, decor: true, fine: true } as const, yr = ry + 0.012;
      facing(sink, 'structureMetal', [[x - 0.018, yr, zr0], [x + 0.018, yr, zr0], [x + 0.018, yr, zt + 0.018], [x - 0.018, yr, zt + 0.018]], UP, rod);
      facing(sink, 'structureMetal', [[x - s * 0.018, yr, zt - 0.018], [s * reach, yr, zt - 0.018], [s * reach, yr, zt + 0.018], [x - s * 0.018, yr, zt + 0.018]], UP, rod);
    }
    const bw = (rods - 1) * 0.13 + 0.08;
    facing(sink, 'structureMetal', [[xs - s * 0.04, ry - 0.01, zr0], [xs + s * bw, ry - 0.01, zr0], [xs + s * bw, ry - 0.01, zTurn + bw], [xs - s * 0.04, ry - 0.01, zTurn - 0.04]], UP, { colour: IRON, decor: true });
    facing(sink, 'structureMetal', [[xs - s * 0.04, ry - 0.01, zTurn - 0.04], [s * reach, ry - 0.01, zTurn - 0.04], [s * reach, ry - 0.01, zTurn + bw], [xs + s * bw, ry - 0.01, zTurn + bw]], UP, { colour: IRON, decor: true });
    // the cranks' bed at the turn, the stools under the run
    sink.span('structureWood', Math.min(xs, xs + s * (bw + 0.3)), 0, zTurn - 0.3, Math.max(xs, xs + s * (bw + 0.3)), ry - 0.02, zTurn + bw + 0.3, { colour: shade(SLEEPER, 1.2), decor: true });
    for (let x = xs + s * 1.6; Math.abs(x) < reach - 0.2; x += s * 1.8) sink.span('structureWood', x - 0.1, 0, zTurn - 0.1, x + 0.1, ry - 0.02, zTurn + bw + 0.1, { colour: shade(SLEEPER, 1.1), decor: true });
    sink.span('structureWood', Math.min(xs - s * 0.1, xs + s * (bw + 0.1)), 0, (zr0 + zTurn) / 2 - 0.1, Math.max(xs - s * 0.1, xs + s * (bw + 0.1)), ry - 0.02, (zr0 + zTurn) / 2 + 0.1, { colour: shade(SLEEPER, 1.1), decor: true });
  }
  return { parts: sink.finish() };
};
