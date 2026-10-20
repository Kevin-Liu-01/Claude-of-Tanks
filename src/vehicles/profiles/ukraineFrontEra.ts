// Release 227: Hetman II's own frontal ERA package, "Stepped Prow" (owner 2026-10-16: "for our turret upghrades, it
// should be a brand new era packages for both though, donnt make it just copy the t90ms. innovate for the hetman 2").
// An original Ukrainian concept in the diagonal, deep-block language of the Duplet/Nizh lineage, not a T-90M/MS Relikt
// layout: no fan of flat cheek cells, no roof cassette carpet. The turret front is a stepped prow of three raked
// courses of deep blocks per side on two facets, each course set back .085 m as it rises, carried on a permanent welded
// shelf, with jaw collars framing the mantlet, returns round the shoulders and a roof course of swept wedge blocks
// behind the top course (round 6). The hull carries a framed chevron glacis (three sawtooth bands per side laid as
// shingled wedge blocks between a keel and two side rails), a nose sill carrying two LED bars in proud visored lamp boxes, three two-tier
// hinged aprons a side on the lower front plate and two-layer bow modules on its front skirt banks. Every module is a lofted solid bound to an existing gameplay ERA sector with authored hit faces;
// every carrier, sill, rail, keel, hinge and housing is permanent and survives stripEra/resetEra.
//
// Frames: the turret frame of the T-72B3M (2016) donor turret (origin on the ring centre, +Z forward, +X the vehicle's
// left; x < 0 is the *_L sector) and the T-72B3M hull frame. The donor casting is never reshaped: every module and
// carrier is seated by ray on it.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {blindTube} from './measuredPrimitives.ts';
import {Stock, sectionLoft, crosswiseSolid, eraModule, sectorOf, assertHullPart, assertTurretPart,
  nightLens, tagFrontPart, refineHeights, type LoftStation, type V3} from './eraModuleKit.ts';
import type {SectionPoint} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {cylX, cylZ} = KIT;

const ID = 't72b3m_hetman_ii';
const SIDES = [-1, 1] as const;
const RAKE = Math.tan(15 * Math.PI / 180);

// ---------------------------------------------------------------------------------------------------------------------
// Turret: the stepped prow
//
// Round 4 (2026-10-17; the critic's UAPL-R3-H2-2: "when the ERA is spent, the new Hetman II package disappears
// completely ... no empty frames, brackets or blown-cell remains"; UAPL-R3-H2-3: "a stack of many thin horizontal
// laminations ... stair-stepped contour lines, not discrete ERA modules"; D5: "20 of 32 modules sink more than 7.5 mm
// into the casting"; D7: "prow course 3A ... intersects itself"): each course is laid as discrete blocks, two a facet,
// between permanent divider plates in their joints, each course standing on its own permanent ledge welded to the
// casting (course 1 on the prow shelf); the doublet seam groove is gone (it drew two more horizontal lines across every
// course). A block's back follows the casting at four heights, and a station is added along it wherever the casting's
// bulge between two stations would leave the back more than 2 mm off it. Spent, the shelf, the ledges, the dividers,
// the jaw ledge and the roof sill rail stay: a stepped frame of empty bays (round 6: shallow and gunmetal, FRAME_DEPTH).

/** Facet A (raked 22 degrees in plan) and facet B (58 degrees): plan normals in (|x|, z). */
const NA = [.375, .927] as const, NB = [.848, .530] as const;
/** Courses bottom to top: block heights, facet offsets at the course's foot, and the shoulder return's outer face.
 * Courses 2 and 3 stand on 15 mm ledges (LEDGE) over the course below, 1 mm clear of its top. */
// Round 6 (2026-10-18; the critic's D3: "at normal game distances the Hetman II's new package hardly reads as ERA ...
// smooth applique plate"; R3(b): read the courses as shingled steps by set-back and seam depth, never paint): the
// courses stand 4, 2.5 and 1 cm further out than round 5's (deeper blocks) and step back 8.5 cm each (7 before).
const COURSES = [
  {yb: .145, yt: .249, a: 1.683, b: 1.714, ret: 1.44 as number | null},
  {yb: .265, yt: .359, a: 1.598, b: 1.629, ret: 1.40 as number | null},
  {yb: .375, yt: .47, a: 1.513, b: 1.544, ret: null as number | null},
] as const;
const LEDGE = .015;
const SHELF = {bottom: .12, top: .145, proud: .025, lip: {x: 1.52, z0: .62, z1: .80}};
/** The jaw collars: two stacked blocks a side between the mantlet's sweep (|x| .40) and the cheek frame post, the upper
 * on its own ledge (.290-.305). */
const JAW = {x0: .40, x1: .511, ledge: [.290, .305] as const, blocks: [{yb: .145, yt: .289, front: 1.56}, {yb: .305, yt: .47, front: 1.45}]};
/** The cheek frame post between the jaw collars and the courses: a plate in the plane |x| = .52. */
const POST_X = .52;
const RETURN_END = .62;
/** The top course (no shoulder return) ends at most at this |x|. */
const TOP_COURSE_X = 1.40;
/** The joints: a permanent divider plate 12 mm thick in each, its top 4 mm under the blocks' and its face FRAME_DEPTH
 * off the casting; each block ends 8 mm off it (round 6: a 28 mm open joint, 3 mm before, so each block reads alone). */
const JOINT = {plate: .012, gap: .008, inset: .006, sink: .004};
/** Round 6 (the critic's D1: spent, "the Hetman II's banded cheek wrap stays in place"): the permanent frames the blocks
 * hang on (the ledges, the dividers, the cheek frame post, the jaw ledge) stand only 4.5 cm off the casting, in gunmetal,
 * instead of reaching the blocks' faces in the hull's paint: intact they are the dark floors of the joints, spent a rack
 * of short dark brackets on the bare casting. */
const FRAME_DEPTH = .045;
const FRAME_BUCKET = 'turretDark';
const HALF_JOINT = JOINT.plate / 2 + JOINT.gap;
/** Along a run the stations stand at most `step` apart (a block's, a ledge's); one is added between two whose seated
 * back leaves their chord by more than SEAT_TOL, so a back seated SEAT_IN into the casting at its stations stays from
 * 2.5 mm off it to 5.5 mm into it between them (round 6, the critic's UAPL-R5C-9: 1.5 mm seats, round 5's 2 mm left the
 * deepest block 7.0 mm in against the receipt's 7 mm limit). */
// (round 7, the critic's UAPL-R5C-6: measured at the blocks' corners, 2B2 stood 7.0 mm in: 1 mm seats)
const BLOCK_STEP = .22, LEDGE_STEP = .40, SEAT_TOL = .004, SEAT_IN = .001;

type P2 = readonly [number, number];
/** A station frame in the (|x|, z) plan: its origin on the course's foot line, its u axis `out`, and the factor that
 * turns a recession square to the facet into one along `out`. */
interface Frame { X: number; Z: number; out: P2; scale: number }

/** (|x|, z) where two front planes n1.p = d1 and n2.p = d2 meet. */
function meet(n1: P2, d1: number, n2: P2, d2: number): [number, number] {
  const det = n1[0] * n2[1] - n2[0] * n1[1];
  return [(d1 * n2[1] - d2 * n1[1]) / det, (n1[0] * d2 - n2[0] * d1) / det];
}
const unit2 = (a: P2): [number, number] => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
const bisector = (a: P2, b: P2): [number, number] => unit2([a[0] + b[0], a[1] + b[1]]);
const dot2 = (a: P2, b: P2): number => a[0] * b[0] + a[1] * b[1];
/** The direction along a front line of normal n, |x| increasing. */
const along = (n: P2): [number, number] => unit2([n[1], -n[0]]);
const perp = (n: P2): [number, number] => [n[1], -n[0]];

/** The casting behind a frame's origin at height y, as a u (along `out`) SEAT_IN into it, or null where the ray from in
 * front of `u0` misses or the module there would be more than .45 m deep. */
function seatU(casting: Stock, side: number, f: Frame, y: number, u0: number): number | null {
  const out = new THREE.Vector3(side * f.out[0], 0, f.out[1]), o = new THREE.Vector3(side * f.X, y, f.Z);
  const hit = casting.tryFace(tupV(o.clone().addScaledVector(out, u0 + .06)), [-out.x, 0, -out.z]);
  if (!hit) return null;
  const u = hit.point.clone().sub(o).dot(out) - SEAT_IN;
  return u0 - u > .45 ? null : u;
}
const tupV = (p: THREE.Vector3): V3 => [p.x, p.y, p.z];

/** A raked solid's ring at a frame between yb and yt: its front raked 15 degrees back from the foot line, `inset` (square
 * to the facet) behind it; its back seated at the given heights. Null where the casting is missed or the solid would be
 * under 2 cm deep. */
function rakedRing(casting: Stock, side: number, f: Frame, yb: number, yt: number, foot: number, backYs: readonly number[],
  inset = 0): SectionPoint[] | null {
  const front = (y: number) => -((y - foot) * RAKE + inset) * f.scale;
  const backs = backYs.map(y => seatU(casting, side, f, y, front(y)));
  if (backs.some(b => b === null)) return null;
  const b = backs as number[], n = b.length;
  if (front(yb) - b[0] < .02 || front(yt) - b[n - 1] < .02) return null;
  // the back points' u from 2 mm inside the foot and top, laid at the foot and top
  const ring: SectionPoint[] = [[b[0], yb], [front(yb), yb], [front(yt), yt], [b[n - 1], yt]];
  for (let k = n - 2; k >= 1; k--) ring.push([b[k], backYs[k]]);
  return ring;
}

/** The heights a block's back is seated at: its foot and top 2 mm in and its middle; a block taller than 12 cm (the jaw
 * collars) also its quarters (the casting's bulge between them would sink a straight back past 7.5 mm). */
const blockBacks = (yb: number, yt: number): number[] => yt - yb > .12
  ? [0, .25, .5, .75, 1].map(t => yb + .002 + (yt - yb - .004) * t)
  : [yb + .002, (yb + yt) / 2, yt - .002];

/** A block's seat heights refined on the casting behind one of its stations: between two heights whose chord leaves the
 * casting's seat by more than SEAT_TOL (a crease in the cast front: the T-72B3M's breaks at y .27-.29 beside the
 * mantlet), the middle height is added (three passes). */
function seatHeights(casting: Stock, side: number, f: Frame, yb: number, yt: number): number[] {
  let ys = blockBacks(yb, yt);
  const u = (y: number) => seatU(casting, side, f, y, -((y - yb) * RAKE) * f.scale);
  for (let pass = 0; pass < 3; pass++) {
    const next = [ys[0]];
    for (let i = 0; i < ys.length - 1; i++) {
      const a = ys[i], b = ys[i + 1], m = (a + b) / 2, ua = u(a), ub = u(b), um = u(m);
      if (ua !== null && ub !== null && um !== null && b - a > .01 && Math.abs(um - (ua + ub) / 2) > SEAT_TOL) next.push(m);
      next.push(b);
    }
    if (next.length === ys.length) break;
    ys = next;
  }
  return ys;
}
/** A span's seat heights: the union of the heights refined behind five of its stations (a crease runs at different
 * heights along a block), heights within 5 mm of each other merged. */
function spanSeatHeights(casting: Stock, side: number, sp: Span, yb: number, yt: number): number[] {
  const all = [0, .25, .5, .75, 1].flatMap(t => seatHeights(casting, side, spanFrame(sp, sp.s0 + (sp.s1 - sp.s0) * t), yb, yt)).sort((a, b) => a - b);
  const out: number[] = [];
  for (const y of all) if (!out.length || y - out[out.length - 1] > .005) out.push(y);
  out[out.length - 1] = Math.max(out[out.length - 1], all[all.length - 1]);
  return out;
}
/** The ring vertices of a raked ring that lie on the casting (all but its two front corners). */
const backVertices = (n: number): number[] => Array.from({length: n + 2}, (_, i) => i).filter(i => i !== 1 && i !== 2);

/** A straight run of a course's foot line: its start, direction and facet normal. */
interface Run { start: P2; dir: P2; n: P2 }
interface Station { s: number; f: Frame; ring: SectionPoint[] }
const runPoint = (run: Run, s: number): P2 => [run.start[0] + run.dir[0] * s, run.start[1] + run.dir[1] * s];
/** A joint or end of a course: a point on its foot line and the plan direction of its vertical plane (round 4: the
 * planes are the post's and the facet A mid joint's |x| = const, the knee's and the corner's mitres, the facet B mid
 * joint's square to the facet and the return's end z = const). */
interface Boundary { at: P2; out: P2 }
/** A stretch of a run between two boundaries: its stations' planes turn evenly from the first boundary's direction to
 * the second's (D7: square and mitred stations met at the knee; rays turning evenly never cross within a block's depth,
 * and the caps either side of a joint are parallel). */
interface Span { run: Run; s0: number; s1: number; out0: P2; out1: P2 }
function spanFrame(sp: Span, s: number, n = sp.run.n): Frame {
  const t = sp.s1 > sp.s0 ? THREE.MathUtils.clamp((s - sp.s0) / (sp.s1 - sp.s0), 0, 1) : 0;
  const out = unit2([sp.out0[0] + (sp.out1[0] - sp.out0[0]) * t, sp.out0[1] + (sp.out1[1] - sp.out0[1]) * t]);
  const [X, Z] = runPoint(sp.run, s);
  return {X, Z, out, scale: 1 / dot2(out, n)};
}
/** The run parameter where the plane of a boundary, offset `gap` square to it towards +s, meets the run. */
function runAtPlane(run: Run, b: Boundary, gap: number): number {
  const m = perp(b.out), sign = Math.sign(dot2(run.dir, m)) || 1;
  return (gap * sign - dot2([run.start[0] - b.at[0], run.start[1] - b.at[1]], m)) / dot2(run.dir, m);
}

/** Stations of a seated solid along a span, at most `step` apart; then, wherever the loft's back between two stations
 * (its back vertices' chords at a quarter, half and three quarters) stands more than SEAT_TOL off its seat depth in the
 * casting, a station is added at the middle of the two (up to four passes). `backs` names the ring vertices on the
 * casting. */
function spanStations(casting: Stock, sp: Span, ring: (f: Frame) => SectionPoint[] | null, side: number, step: number,
  backs: readonly number[]): Station[] | null {
  const make = (s: number): Station | null => { const f = spanFrame(sp, s), r = ring(f); return r ? {s, f, ring: r} : null; };
  const n = Math.max(1, Math.ceil((sp.s1 - sp.s0) / step));
  let list: Station[] = [];
  for (let k = 0; k <= n; k++) {
    const st = make(sp.s0 + (sp.s1 - sp.s0) * k / n);
    if (!st) return null;
    list.push(st);
  }
  const world = (st: Station, i: number): THREE.Vector3 => {
    const [u, v] = st.ring[i];
    return new THREE.Vector3(side * (st.f.X + st.f.out[0] * u), v, st.f.Z + st.f.out[1] * u);
  };
  const nW = new THREE.Vector3(side * sp.run.n[0], 0, sp.run.n[1]), up = new THREE.Vector3(0, 1, 0);
  // how far a chord point stands into the casting: its intercepts along the facet normal and the vertical (where the dome
  // turns over, the horizontal one alone runs away) taken as the distance to their plane (null: no casting behind it)
  const intercept = (p: THREE.Vector3, d: THREE.Vector3): number | null => {
    const hit = casting.tryFace(tupV(p.clone().addScaledVector(d, .08)), tupV(d.clone().negate()));
    return hit ? hit.point.clone().sub(p).dot(d) : null;
  };
  const depth = (p: THREE.Vector3): number | null => {
    const h = intercept(p, nW), v = intercept(p, up);
    if (h === null) return null;
    if (v === null || Math.sign(v) !== Math.sign(h)) return h;
    return Math.sign(h) * Math.abs(h * v) / Math.hypot(h, v);
  };
  // the back's vertices by height: its chords between the two stations, and between two heights the quad's centre and both
  // of its diagonals' midpoints (a twisted quad is split along one of them)
  const byHeight = [...backs].sort((i, j) => list[0].ring[i][1] - list[0].ring[j][1]);
  const off = (a: Station, b: Station): number => {
    const pts: THREE.Vector3[] = [];
    for (const i of byHeight) for (const t of [.25, .5, .75]) pts.push(world(a, i).lerp(world(b, i), t));
    for (let k = 0; k < byHeight.length - 1; k++) {
      const i = byHeight[k], j = byHeight[k + 1], Ai = world(a, i), Aj = world(a, j), Bi = world(b, i), Bj = world(b, j);
      pts.push(Ai.clone().add(Aj).add(Bi).add(Bj).multiplyScalar(.25), Ai.clone().lerp(Bj, .5), Aj.clone().lerp(Bi, .5));
    }
    let worst = 0;
    for (const p of pts) { const d = depth(p); worst = Math.max(worst, d === null ? Infinity : Math.abs(d - SEAT_IN)); }
    return worst;
  };
  for (let pass = 0; pass < 4; pass++) {
    const next: Station[] = [list[0]];
    let added = false;
    for (let i = 0; i < list.length - 1; i++) {
      const a = list[i], b = list[i + 1];
      if (b.s - a.s > .02 && off(a, b) > SEAT_TOL) {
        const m = make((a.s + b.s) / 2);
        if (m) { next.push(m); added = true; }
      }
      next.push(b);
    }
    list = next;
    if (!added) break;
  }
  return list;
}

const loftOf = (side: number, list: readonly Station[]): THREE.BufferGeometry =>
  sectionLoft(list.map(st => ({o: [side * st.f.X, 0, st.f.Z] as V3, out: [side * st.f.out[0], 0, st.f.out[1]] as V3, up: [0, 1, 0] as V3, ring: st.ring})));

/** The faces a facet block's hit faces follow: its plan normal raised 15 degrees. */
function raised(side: number, n: P2): V3 {
  const c = Math.cos(15 * Math.PI / 180), s = Math.sin(15 * Math.PI / 180);
  return [side * n[0] * c, s, n[1] * c];
}

/** The cheek frame post's plane, |x| .52. */
const POST: Boundary = {at: [POST_X, (COURSES[0].a - NA[0] * POST_X) / NA[1]], out: [0, 1]};

/** One course along its plan path: its blocks (a span, the facet its face is on), its joints (a boundary and the facet
 * normal its divider's front recedes square to) and its ledge's spans. */
interface CoursePlan {
  blocks: {span: Span; n: P2; tag: string}[];
  joints: {b: Boundary; n: P2}[];
  path: Span[];
}

function coursePlan(casting: Stock, side: number, c: typeof COURSES[number]): CoursePlan {
  const nA = unit2(NA), nB = unit2(NB), nR: P2 = [1, 0], nK = bisector(nA, nB), nC = bisector(nB, nR);
  const K = meet(nA, c.a, nB, c.b), dA = along(nA), dB = along(nB), dR: P2 = [0, -1];
  const runA: Run = {start: [POST_X, (c.a - nA[0] * POST_X) / nA[1]], dir: dA, n: nA};
  const runB: Run = {start: K, dir: dB, n: nB};
  const sKA = runAtPlane(runA, {at: K, out: nK}, 0);
  const Am: Boundary = {at: runPoint(runA, (runAtPlane(runA, POST, 0) + sKA) / 2), out: [0, 1]}, Kb: Boundary = {at: K, out: nK};
  // a block between two boundaries on one run, its caps HALF_JOINT off them
  const block = (run: Run, a: Boundary, b: Boundary, n: P2, tag: string, endGap = HALF_JOINT) =>
    ({span: {run, s0: runAtPlane(run, a, HALF_JOINT), s1: runAtPlane(run, b, -endGap), out0: a.out, out1: b.out}, n, tag});
  const blocks: CoursePlan['blocks'] = [block(runA, POST, Am, nA, 'A1'), block(runA, Am, Kb, nA, 'A2')];
  const joints: CoursePlan['joints'] = [{b: Am, n: nA}, {b: Kb, n: nK}];
  const path: Span[] = [{run: runA, s0: runAtPlane(runA, POST, JOINT.plate / 2), s1: runAtPlane(runA, Am, 0), out0: POST.out, out1: Am.out},
    {run: runA, s0: runAtPlane(runA, Am, 0), s1: sKA, out0: Am.out, out1: Kb.out}];
  if (c.ret !== null) {
    const Cr: P2 = [c.ret, (c.b - nB[0] * c.ret) / nB[1]], Cb: Boundary = {at: Cr, out: nC};
    const runR: Run = {start: Cr, dir: dR, n: nR}, sB1 = runAtPlane(runB, Cb, 0);
    const Bm: Boundary = {at: runPoint(runB, sB1 / 2), out: nB}, end: Boundary = {at: [c.ret, RETURN_END], out: nR};
    blocks.push(block(runB, Kb, Bm, nB, 'B1'), block(runB, Bm, Cb, nB, 'B2'), block(runR, Cb, end, nR, 'R', 0));
    joints.push({b: Bm, n: nB}, {b: Cb, n: nC});
    path.push({run: runB, s0: 0, s1: sB1 / 2, out0: nK, out1: nB}, {run: runB, s0: sB1 / 2, s1: sB1, out0: nB, out1: nC},
      {run: runR, s0: 0, s1: Cr[1] - RETURN_END, out0: nC, out1: nR});
  } else {
    // the top course's facet B runs on to where its back leaves the casting (2 cm short of it), at most to |x| 1.40 (the
    // left smoke bank's lines of fire pass outboard of it)
    const backs = blockBacks(c.yb, c.yt), s0 = runAtPlane(runB, Kb, HALF_JOINT);
    let s = s0;
    for (let t = s0; runPoint(runB, t)[0] <= TOP_COURSE_X; t += .01) {
      if (!rakedRing(casting, side, spanFrame({run: runB, s0: t, s1: t, out0: nB, out1: nB}, t), c.yb, c.yt, c.yb, backs)) break;
      s = t;
    }
    const sEnd = s - .02, Bm: Boundary = {at: runPoint(runB, (s0 + sEnd) / 2), out: nB}, end: Boundary = {at: runPoint(runB, sEnd), out: nB};
    blocks.push(block(runB, Kb, Bm, nB, 'B1'), block(runB, Bm, end, nB, 'B2', 0));
    joints.push({b: Bm, n: nB});
    path.push({run: runB, s0: 0, s1: runAtPlane(runB, Bm, 0), out0: nK, out1: nB}, {run: runB, s0: runAtPlane(runB, Bm, 0), s1: sEnd, out0: nB, out1: nB});
  }
  return {blocks, joints, path};
}

function shelf(P: TankBuilderPort, casting: Stock, side: number): void {
  const c = COURSES[0], [kx, kz] = meet(NA, c.a, NB, c.b), ret = c.ret!;
  const cornerZ = (c.b - NB[0] * ret) / NB[1];
  const nA = unit2(NA), nB = unit2(NB), nK = bisector(NA, NB), nR: [number, number] = [1, 0], nC = bisector(NB, nR);
  // the outer edge .025 beyond course 1's foot line, the inner edge 4 mm into the casting's lower nose and flank
  const path: Frame[] = [
    // the first station's cap in the jaw collars' inner face plane (x = .40), clear of the mantlet's sweep
    {X: JAW.x0, Z: (c.a - NA[0] * JAW.x0) / NA[1], out: [0, 1], scale: 1 / NA[1]},
    ...[.52, .64, .78, .90, 1.00].map(X => ({X, Z: (c.a - NA[0] * X) / NA[1], out: nA, scale: 1})),
    {X: kx, Z: kz, out: nK, scale: 1 / (nK[0] * nA[0] + nK[1] * nA[1])},
    ...[1.25, 1.35].map(X => ({X, Z: (c.b - NB[0] * X) / NB[1], out: nB, scale: 1})),
    {X: ret, Z: cornerZ, out: nC, scale: 1 / (nC[0] * nB[0] + nC[1] * nB[1])},
    ...[(cornerZ + RETURN_END) / 2, RETURN_END].map(Z => ({X: ret, Z, out: nR, scale: 1})),
  ];
  // Round 7 (2026-10-18; the critic's UAPL-R5C-7: "Hetman II prow shelf 21.7 mm" into the casting): the casting is met at
  // the shelf's foot and top (2 mm inside it) at each station, so its back leans with the lower nose instead of standing
  // vertical from its mid height, 1 mm into it; and along each facet a station is added between two whose back's chord
  // leaves the casting by more than 4 mm (the lower nose bows out between the facet's stations)
  const backAt = (st: Frame) => {
    const o = new THREE.Vector3(side * st.X, 0, st.Z), out = new THREE.Vector3(side * st.out[0], 0, st.out[1]), uo = SHELF.proud * st.scale;
    return (y: number) => {
      const hit = casting.face(o.clone().addScaledVector(out, .2).setY(y).toArray() as unknown as V3, [-out.x, 0, -out.z]);
      return Math.min(hit.point.clone().setY(0).sub(o).dot(out) - .001, uo - .01);
    };
  };
  const ys = [SHELF.bottom + .002, SHELF.top - .002];
  let frames = path;
  for (let pass = 0; pass < 4; pass++) {
    const next: Frame[] = [frames[0]];
    let added = false;
    for (let i = 0; i < frames.length - 1; i++) {
      const a = frames[i], b = frames[i + 1];
      if (dot2(a.out, b.out) > .9999 && Math.hypot(b.X - a.X, b.Z - a.Z) > .02) {
        const m: Frame = {X: (a.X + b.X) / 2, Z: (a.Z + b.Z) / 2, out: a.out, scale: a.scale}, ua = backAt(a), ub = backAt(b), um = backAt(m);
        if (ys.some(y => Math.abs(um(y) - (ua(y) + ub(y)) / 2) > .004)) { next.push(m); added = true; }
      }
      next.push(b);
    }
    frames = next;
    if (!added) break;
  }
  const stations: LoftStation[] = frames.map(st => {
    const o = new THREE.Vector3(side * st.X, 0, st.Z), out = new THREE.Vector3(side * st.out[0], 0, st.out[1]);
    const uo = SHELF.proud * st.scale, ui = backAt(st);
    return {o: o.toArray() as unknown as V3, out: out.toArray() as unknown as V3, up: [0, 1, 0],
      ring: [[ui(ys[0]), SHELF.bottom], [uo, SHELF.bottom], [uo, SHELF.top], [ui(ys[1]), SHELF.top]]};
  });
  const g = sectionLoft(stations);
  assertTurretPart(ID, 'prow shelf', g);
  P.addExternalArmor('turret', g);
  // The outboard lip that carries the dazzler pod, abutting the shelf's outer edge along the return.
  const x0 = ret + SHELF.proud, x1 = SHELF.lip.x;
  const lip = crosswiseSolid([x0, x1].map(X => ({x: side * X, ring: [[SHELF.lip.z0, SHELF.bottom], [SHELF.lip.z1, SHELF.bottom],
    [SHELF.lip.z1, SHELF.top], [SHELF.lip.z0, SHELF.top]] as [number, number][]})));
  assertTurretPart(ID, 'prow shelf lip', lip);
  P.addExternalArmor('turret', lip);
}



/** A course's ledge (courses 2 and 3): 15 mm thick on the casting under the course, its front 6 mm behind the course's
 * foot line, from the cheek frame post to the course's end. */
function ledge(P: TankBuilderPort, casting: Stock, side: number, c: typeof COURSES[number], plan: CoursePlan): void {
  const y0 = c.yb - LEDGE, y1 = c.yb;
  const ring = (f: Frame): SectionPoint[] | null => {
    const full = -JOINT.inset * f.scale, u0 = seatU(casting, side, f, y0 + .002, full), u1 = seatU(casting, side, f, y1 - .002, full);
    if (u0 === null || u1 === null || full - Math.max(u0, u1) < .02) return null;
    const uo = Math.min(full, Math.max(u0, u1) + FRAME_DEPTH);
    return [[u0, y0], [uo, y0], [uo, y1], [u1, y1]];
  };
  const parts: Station[] = [];
  for (const [k, sp] of plan.path.entries()) {
    const list = spanStations(casting, sp, ring, side, LEDGE_STEP, [0, 3]);
    if (!list) throw new Error(`${ID}: the course ledge at ${c.yb} leaves the casting`);
    parts.push(...(k ? list.slice(1) : list));
  }
  const g = loftOf(side, parts);
  assertTurretPart(ID, 'prow ledge', g);
  P.addEquipment(FRAME_BUCKET, g);
}

/** A shallow frame plate 12 mm thick in a boundary's plane: its back seated on the casting at the given heights, its
 * face FRAME_DEPTH off the casting at each (round 6). */
function shallowPlate(casting: Stock, side: number, b: Boundary, keys: readonly number[], tangent = false): THREE.BufferGeometry {
  const m = perp(b.out);
  const frameAt = (d: number): Frame => ({X: b.at[0] + m[0] * d, Z: b.at[1] + m[1] * d, out: b.out, scale: 1});
  // (seated from in front of the plate's own frame, with no depth cap: the post stands where the casting falls back)
  const seat = (f: Frame, y: number): number | null => {
    const out = new THREE.Vector3(side * f.out[0], 0, f.out[1]), o = new THREE.Vector3(side * f.X, y, f.Z);
    const hit = casting.tryFace(tupV(o.clone().addScaledVector(out, .3)), [-out.x, 0, -out.z]);
    return hit ? hit.point.clone().sub(o).dot(out) - SEAT_IN : null;
  };
  // Round 7 (2026-10-18; the critic's UAPL-R5C-7: "cheek frame post 10.7, dividers 8.9-9.4 mm" into the casting): a
  // height is added between two whose chord leaves the cast front by more than 3.5 mm on either face of the plate; or,
  // `tangent` (a divider, deep in its joint), the plate keeps its two heights and its straight back stands out to touch
  // the cast front where it bows furthest out (five heights sampled), its seat there, clear of it elsewhere
  const ys = tangent ? [...keys] : refineHeights(y => {
    const a = seat(frameAt(-JOINT.plate / 2), y), c = seat(frameAt(JOINT.plate / 2), y);
    return a === null || c === null ? 0 : Math.min(a, c);
  }, keys, .0035);
  const tangentBack = (f: Frame): (number | null)[] => {
    const y0 = ys[0], y1 = ys[ys.length - 1], u0 = seat(f, y0), u1 = seat(f, y1);
    if (u0 === null || u1 === null) return [null];
    let shift = 0;
    for (const t of [.2, .4, .6, .8]) { const u = seat(f, y0 + (y1 - y0) * t); if (u !== null) shift = Math.max(shift, u - (u0 + (u1 - u0) * t)); }
    return ys.map(y => u0 + (u1 - u0) * (y - y0) / (y1 - y0) + shift);
  };
  const stations = [-JOINT.plate / 2, JOINT.plate / 2].map(d => {
    const f = frameAt(d);
    const bk = tangent ? tangentBack(f) : ys.map(y => seat(f, y));
    if (bk.some(u => u === null)) throw new Error(`${ID}: a prow frame plate at ${b.at.map(v => v.toFixed(3))} leaves the casting`);
    const u = bk as number[], n = ys.length;
    const ring: SectionPoint[] = [[u[0], ys[0]], ...ys.map((y, k) => [u[k] + FRAME_DEPTH, y] as SectionPoint), [u[n - 1], ys[n - 1]]];
    for (let k = n - 2; k >= 1; k--) ring.push([u[k], ys[k]]);
    return {s: d, f, ring};
  });
  return loftOf(side, stations);
}

/** The divider plates in a course's joints (near tier). */
function dividers(P: TankBuilderPort, casting: Stock, side: number, c: typeof COURSES[number], plan: CoursePlan): void {
  // (two seat heights, its back tangent to the cast front: round 7, the critic's UAPL-R5C-7, at the shoulder corner the
  // casting bows out 13 mm between a course's foot and top)
  const yt = c.yt - JOINT.sink, backs = [c.yb + .002, yt - .002];
  for (const j of plan.joints) {
    const g = shallowPlate(casting, side, j.b, backs, true);
    assertTurretPart(ID, 'prow divider', g);
    P.addEquipment(FRAME_BUCKET, g);
  }
}

/** The cheek frame post in the plane |x| .52 between the jaw collars and the courses: a shallow gunmetal plate from the
 * shelf to 4 mm under the top course's top (round 6: FRAME_DEPTH off the casting). */
function cheekPost(P: TankBuilderPort, casting: Stock, side: number): void {
  const top = COURSES[2].yt - JOINT.sink;
  const keys = [SHELF.top + .002, COURSES[0].yt, JAW.blocks[0].yt, COURSES[1].yb, JAW.blocks[1].yb, COURSES[1].yt, COURSES[2].yb, top - .002]
    .filter((y, i, all) => all.indexOf(y) === i).sort((a, b) => a - b);
  const g = shallowPlate(casting, side, POST, keys);
  assertTurretPart(ID, 'cheek frame post', g);
  P.addEquipment(FRAME_BUCKET, g);
}

function courses(P: TankBuilderPort, casting: Stock, side: number): void {
  COURSES.forEach((c, i) => {
    const plan = coursePlan(casting, side, c);
    if (i > 0) ledge(P, casting, side, c, plan);
    // (the far tier keeps the blocks, ledges and posts; the dividers are near-tier frame detail)
    if (P.q) dividers(P, casting, side, c, plan);
    for (const b of plan.blocks) {
      const ys = spanSeatHeights(casting, side, b.span, c.yb, c.yt);
      const list = spanStations(casting, b.span, f => rakedRing(casting, side, f, c.yb, c.yt, c.yb, ys), side, BLOCK_STEP, backVertices(ys.length));
      if (!list) throw new Error(`${ID}: prow block ${i + 1}${b.tag} leaves the casting`);
      const mid = list[Math.floor(list.length / 2)].f;
      eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', side * mid.X), geometry: loftOf(side, list),
        outward: raised(side, b.n), minDot: .5, name: `prow block ${i + 1}${b.tag}`, guard: (n, geo) => assertTurretPart(ID, n, geo)});
    }
  });
}

/** The jaw collars: two stacked blocks a side from the mantlet's sweep (|x| .40) to 3 mm off the cheek frame post, the
 * upper on its own ledge. */
function jaws(P: TankBuilderPort, casting: Stock, side: number): void {
  const nJ: P2 = [0, 1];
  const stationsAlong = (front: number, endGap: number, ring: (f: Frame) => SectionPoint[] | null): Station[] => {
    const x1 = POST_X - endGap;
    return [JAW.x0, (JAW.x0 + x1) / 2, x1].map(X => {
      const f: Frame = {X, Z: front, out: nJ, scale: 1}, r = ring(f);
      if (!r) throw new Error(`${ID}: a jaw collar leaves the casting`);
      return {s: X, f, ring: r};
    });
  };
  const [l0, l1] = JAW.ledge, j2 = JAW.blocks[1];
  const lg = loftOf(side, stationsAlong(j2.front, JOINT.plate / 2, f => {
    const full = -JOINT.inset * f.scale, u0 = seatU(casting, side, f, l0 + .002, full), u1 = seatU(casting, side, f, l1 - .002, full);
    return u0 === null || u1 === null ? null : [[u0, l0], [Math.min(full, Math.max(u0, u1) + FRAME_DEPTH), l0],
      [Math.min(full, Math.max(u0, u1) + FRAME_DEPTH), l1], [u1, l1]];
  }));
  assertTurretPart(ID, 'jaw ledge', lg);
  P.addEquipment(FRAME_BUCKET, lg);
  for (const [i, j] of JAW.blocks.entries()) {
    // (seated like a prow block: heights refined at its middle, stations added where the casting bulges between two)
    const span: Span = {run: {start: [0, j.front], dir: [1, 0], n: nJ}, s0: JAW.x0, s1: POST_X - HALF_JOINT, out0: nJ, out1: nJ};
    const backs = spanSeatHeights(casting, side, span, j.yb, j.yt);
    // (round 7: one span of stations 11 cm apart across the collar's 10.6 cm, more only where the casting bows)
    const list = spanStations(casting, span, f => rakedRing(casting, side, f, j.yb, j.yt, j.yb, backs), side, .11, backVertices(backs.length));
    if (!list) throw new Error(`${ID}: jaw collar ${i + 1} leaves the casting`);
    const g = loftOf(side, list);
    eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', side), geometry: g, outward: [0, Math.sin(.26), Math.cos(.26)],
      name: `jaw collar ${i + 1}`, guard: (n, geo) => assertTurretPart(ID, n, geo)});
  }
}

/** Round 6 (2026-10-18; the critic's D2: "roof-front ERA has been dropped ... the area is a smooth plate"): the roof
 * course, the prow's fourth step laid on the roof behind its top course: three wedge blocks a side whose front edge sweeps
 * back with the prow (an arrowhead in plan), 9 cm tall at the front (its top edge chamfered 2 cm) falling to 4 cm at the
 * rear, in 18 mm joints over gunmetal cleats, behind a gunmetal sill rail. Tops under .66 (E6, the gunner's sight's lower
 * ray over the left course). It replaces round 5's flat roof brow. */
// (round 7: the course 5 mm further back, clear of the top course's block 3B1 (2.3 mm into it once the prow blocks took 1 mm
// seats))
const ROOF = {x0: .40, x1: .98, front0: .980, sweep: .30, depth: .32, hFront: .09, hRear: .04, chamfer: .02, joint: .018,
  rail: {w: .014, h: .024, gap: .003}, cleat: {w: .010, h: .022}};
function roofCourse(P: TankBuilderPort, casting: Stock, side: number): void {
  const R = ROOF, zf = (X: number) => R.front0 - R.sweep * (X - R.x0), zr = (X: number) => zf(X) - R.depth;
  const dome = (X: number, z: number) => casting.top(side * X, z);
  const n = 3, w = (R.x1 - R.x0 - (n - 1) * R.joint) / n;
  for (let k = 0; k < n; k++) {
    const a = R.x0 + k * (w + R.joint), b = a + w;
    // (three stations across: the dome turns down outboard, and a block's bottom between two would sink into it)
    const stations = [a, (a + b) / 2, b].map(X => {
      const f = zf(X), r = zr(X), yf = dome(X, f), yr = dome(X, r);
      // (the dome falls away fastest at the front: the seat points close up there. The convex dome stands over every
      // chord between them and between the two stations, whose seat points lie at different heights of the swept course:
      // a 1 mm seat at the points leaves the bottom at most 6 mm into the roof between them)
      const bottom = [0, .4, .7, .87, 1].map(t => { const z = r + (f - r) * t; return [z, dome(X, z) - .001] as [number, number]; });
      return {x: side * X, ring: [...bottom, [f, yf + R.hFront - R.chamfer], [f - R.chamfer, yf + R.hFront], [r, yr + R.hRear]] as [number, number][]};
    });
    eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', side), geometry: crosswiseSolid(stations), outward: [0, .866, .5],
      minDot: .45, name: `roof block ${k + 1}`, guard: (nm, geo) => assertTurretPart(ID, nm, geo)});
  }
  // the sill rail 3 mm behind the course's rear edge, 3 mm into the roof. Round 7 (2026-10-18; the critic's UAPL-R5C-7:
  // "brow rails 8.5 mm" into the casting): a station is added wherever the dome falling away outboard leaves the rail's
  // straight foot more than 1.5 mm off it between two
  const railZ = (X: number): [number, number] => { const z1 = zr(X) - R.rail.gap; return [z1 - R.rail.w, z1]; };
  const railXs = refineHeights(X => { const [z0, z1] = railZ(X); return Math.min(dome(X, z0), dome(X, z1)); }, [R.x0, (R.x0 + R.x1) / 2, R.x1], .0015);
  const rail = crosswiseSolid(railXs.map(X => {
    const [z0, z1] = railZ(X);
    return {x: side * X, ring: [[z0, dome(X, z0) - .003], [z1, dome(X, z1) - .003], [z1, dome(X, z1) + R.rail.h], [z0, dome(X, z0) + R.rail.h]] as [number, number][]};
  }));
  assertTurretPart(ID, 'roof sill rail', rail);
  P.addEquipment(FRAME_BUCKET, rail);
  // a cleat in each joint, from the rail 13 cm forward under the blocks' joint, its sides 4 mm clear of the blocks (round
  // 7, the critic's UAPL-R5C-7: run to the course's front edge, its straight foot sank 11 mm into the dome's curve; its
  // foot and top follow the dome, a point added wherever the dome's curve leaves the chord by more than 2.5 mm)
  for (let k = 1; k < n; k++) {
    const X = R.x0 + k * (w + R.joint) - R.joint / 2;
    // (the same fractions of the cleat's run at both of its faces: a loft's stations keep one ring count)
    const r0 = zr(X) - R.rail.gap, f0 = r0 + .13;
    const ts = refineHeights(t => dome(X, r0 + (f0 - r0) * t), [0, 1], .0025);
    const cleat = crosswiseSolid([X - R.cleat.w / 2, X + R.cleat.w / 2].map(x => {
      const r = zr(x) - R.rail.gap, f = r + .13, zs = ts.map(t => r + (f - r) * t);
      return {x: side * x, ring: [...zs.map(z => [z, dome(x, z) - .003] as [number, number]),
        ...[...zs].reverse().map(z => [z, dome(x, z) + R.cleat.h] as [number, number])]};
    }));
    assertTurretPart(ID, 'roof cleat', cleat);
    P.addEquipment(FRAME_BUCKET, cleat);
  }
}

/** The IR dazzler pods on the shelf lips: a bracket, a hood and a recessed red lens (marker, no beam). */
function dazzlers(P: TankBuilderPort): void {
  for (const side of SIDES) {
    const x = side * 1.50, y = .255, z = .70;
    P.addEquipment('turretDetail', tagFrontPart(new THREE.BoxGeometry(.08, y - .055 - SHELF.top + .004, .10), 'dazzler bracket', 'turret'), x, (SHELF.top - .004 + y - .055) / 2, z);
    // an open-mouthed hood: a 44 mm bore 16 mm deep in a 55 mm housing
    const hood = blindTube(.055, .044, .11, .016, P.q ? 7 : 6);
    assertTurretPart(ID, 'dazzler hood', hood.clone().translate(x, y, z));
    P.addEquipment('turretDetail', tagFrontPart(hood, 'dazzler hood', 'turret'), x, y, z);
    // the lens's face 10 mm inside the hood's mouth (z + .055), lapping into the hood bore
    P.addEquipment('turretGlass', tagFrontPart(nightLens(cylZ(.042, .012, 7), 'marker', 'red'), 'dazzler lens', 'turret'), x, y, z + .055 - .010 - .006);
  }
}

/** Hetman II's turret front: the shelves, the cheek frame posts, jaw collars, three prow courses of blocks on their
 * ledges and dividers, shoulder returns, the roof course on its sill rail and cleats, and the dazzler pods. Called first in the Hetman II
 * turret kit, before its flank cabinets. */
export function hetmanIIProw(P: TankBuilderPort): void {
  const parts: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['turret'], g => parts.push(g));
  const casting = new Stock(P.spec.id, parts);
  try {
    for (const side of SIDES) {
      shelf(P, casting, side);
      cheekPost(P, casting, side);
      jaws(P, casting, side);
      courses(P, casting, side);
      roofCourse(P, casting, side);
    }
    dazzlers(P);
  } finally { casting.dispose(); }
}

// ---------------------------------------------------------------------------------------------------------------------
// Hull: the framed chevron glacis, the nose sill and its LED bars, the lower-plate aprons and the bow modules

const SILL = {x: 1.142, rear: 3.08, nose: 3.342, front: 3.357, bottom: .958, hoodY: 1.05, top: 1.07, hood: .03, rearTop: 1.14};
// (round 10: each bar in its own proud armoured lamp box: `half` is the box's half width, the sill's flat cut under it)
const LED = {xs: [.60], half: .19, y: 1.015, lens: [.100, .056, .015] as V3, pitch: .124};
// (round 7, the critic's UAPL-R5C-7: "glacis side rails 9.5 mm" into the hull: the rail's outer 14 mm ran under the
// fender's inner edge at x 1.128 over the glacis's rear; it now ends 4 mm inside that edge)
const RAIL = {x0: 1.082, x1: 1.124, z0: 2.00, z1: 3.08, proud: .07};
const KEEL = {half: .025, z0: 2.14, z1: 3.08, proud: .055};
const BANDS = [
  {rear: [2.14, 2.00], front: [2.50, 2.22], lip: .10},
  {rear: [2.515, 2.235], front: [2.87, 2.59], lip: .13},
  {rear: [2.885, 2.605], front: [3.075, 3.075], lip: .15},
] as const;
const BAND_X = [.03, 1.08] as const;
const APRON = {x: [.03, 1.10] as const, y: [.62, .93] as const, thick: .07, doublet: .025, step: .775, joint: .018, knuckle: .07};
const BOW = {x: 2.15, outer: 2.215, layer: .049, inset: .012, chamfer: .015, outline: [[2.50, .86], [2.90, .97], [3.10, 1.28], [2.50, 1.28]] as const};

function sillSegments(P: TankBuilderPort, glacisAt: (z: number) => number): void {
  const s = SILL, gb = glacisAt(s.rear) - .004;
  const brk: [number, number] = [3.20, glacisAt(3.20) - .004];
  const full: [number, number][] = [[s.rear, gb], brk, [s.nose, .963], [s.front, s.bottom], [s.front, s.hoodY], [s.front + s.hood, s.hoodY],
    [s.front + s.hood, s.top], [s.rear, s.rearTop]];
  // (round 10, the blind critic's UAPL-R8-01: by day the bars in their slot under the hood's lip read only as a plain
  // plate edge: each now stands in a proud armoured lamp box, so the sill's face under a box is flat to its top, no slot
  // and no hood, and the box carries its own visor)
  const flat: [number, number][] = [[s.rear, gb], brk, [s.nose, .963], [s.front, s.bottom], [s.front, s.top], [s.rear, s.rearTop]];
  const cuts = [-s.x, ...LED.xs.flatMap(c => [-c - LED.half, -c + LED.half]).sort((a, b) => a - b),
    ...LED.xs.flatMap(c => [c - LED.half, c + LED.half]), s.x];
  for (let i = 0; i < cuts.length - 1; i++) {
    const underBox = i % 2 === 1, ring = underBox ? flat : full;
    const g = crosswiseSolid([cuts[i], cuts[i + 1]].map(x => ({x, ring})));
    assertHullPart(ID, 'nose sill', g);
    P.addExternalArmor('hull', g);
  }
}

/** Two LED nose bars. Round 7 (2026-10-18; the critic's UAPL-2: "flush, dark, recessed slits with no visible lens,
 * bezel or housing") gave each a raised dark bezel in a slot under the sill's hood. Round 10 (2026-10-19; the blind
 * critic's UAPL-R8-01: "the special lights only read at night ... by day the same lip shows only a plain plate edge"):
 * each bar is an armoured lamp box standing 5 cm proud of the sill's flat face (3 mm into it), welded plate in the hull's
 * paint: a top wall running on as a 15 mm visor, a bottom wall and two end cheeks round a dark mouth 2 mm over and under
 * the lenses, its gunmetal back plate (3 mm into the sill) carrying three lens segments 7 mm inside the mouth and 22 mm
 * inside the visor's lip (each lapping 5 mm into the back plate), split by gunmetal dividers (near tier). Lit from above,
 * the visor's top and the box's walls frame a black mouth and throw their own shadow on the sill: a fitting, not a plate
 * edge. */
const LAMP_BOX = {wall: .018, cheek: .012, seat: .003, mouth: .050, visor: .015, lensIn: .007, y0: .967, y1: 1.063, divider: .020,
  dividerProud: .003};
function ledBars(P: TankBuilderPort): void {
  const [lw, lh, lt] = LED.lens, B = LAMP_BOX, zSeat = SILL.front - B.seat, zMouth = SILL.front + B.mouth;
  const lensBack = zMouth - B.lensIn - lt, zPlate = lensBack + .005;
  const add = (bucket: string, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, name: string) => {
    const g = tagFrontPart(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), name, 'hull').translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    assertHullPart(ID, name, g);
    P.addEquipment(bucket, g);
  };
  const oy0 = B.y0 + B.wall, oy1 = B.y1 - B.wall;
  for (const c of LED.xs) for (const side of SIDES) {
    const cx = side * c, a = cx - LED.half + .001, b = cx + LED.half - .001;
    // the box: top wall and visor, bottom wall, end cheeks (between the walls), in the hull's paint
    add('hullExternalArmor', a, b, oy1, B.y1, zSeat, zMouth + B.visor, 'LED lamp box');
    add('hullExternalArmor', a, b, B.y0, oy0, zSeat, zMouth, 'LED lamp box');
    // (the cheeks' outer faces 0.5 mm inside the walls' ends and their backs 0.5 mm shallower, the back plate's 1 mm: no
    // two faces of the box share a plane)
    add('hullExternalArmor', a + .0005, a + B.cheek, oy0 - .001, oy1 + .001, zSeat + .0005, zMouth - .002, 'LED lamp box');
    add('hullExternalArmor', b - B.cheek, b - .0005, oy0 - .001, oy1 + .001, zSeat + .0005, zMouth - .002, 'LED lamp box');
    // the back plate, between the cheeks and walls (0.5 mm into each)
    add('hullDark', a + B.cheek - .0005, b - B.cheek + .0005, oy0 - .0005, oy1 + .0005, zSeat + .001, zPlate, 'LED lamp back plate');
    for (const k of [-1, 0, 1]) {
      // (glass, though the T-72B3M hull had no glass bucket (one draw more): the field net opens only round Glass, Hatch
      // and Cupola stock, so a lens in another bucket would be netted over)
      P.addEquipment('hullGlass', tagFrontPart(nightLens(new THREE.BoxGeometry(lw, lh, lt), 'headlight'), 'LED bar lens', 'hull'), cx + k * LED.pitch, LED.y, lensBack + lt / 2);
    }
    // the dividers between the lenses (near tier), 3 mm prouder than the lenses, 0.5 mm into the back plate
    if (P.q) for (const k of [-.5, .5]) {
      const x = cx + k * LED.pitch;
      add('hullDark', x - B.divider / 2, x + B.divider / 2, LED.y - lh / 2 - .002, LED.y + lh / 2 + .002, zPlate - .0005, lensBack + lt + B.dividerProud, 'LED bar divider');
    }
  }
}

function railsAndKeel(P: TankBuilderPort, glacisAt: (z: number) => number): void {
  const zs = (z0: number, z1: number) => [z0, ...[2.40, 2.60, 2.80, 3.00].filter(z => z > z0 + .01 && z < z1 - .01), z1];
  for (const side of SIDES) {
    const g = sectionLoft(zs(RAIL.z0, RAIL.z1).map(z => {
      const y = glacisAt(z);
      return {o: [0, 0, z] as V3, out: [1, 0, 0] as V3, up: [0, 1, 0] as V3,
        ring: [[side * RAIL.x0, y - .004], [side * RAIL.x1, y - .004], [side * RAIL.x1, y + RAIL.proud], [side * RAIL.x0, y + RAIL.proud]] as [number, number][]};
    }));
    assertHullPart(ID, 'glacis side rail', g);
    P.addExternalArmor('hull', g);
  }
  const keel = sectionLoft(zs(KEEL.z0, KEEL.z1).map(z => {
    const y = glacisAt(z);
    return {o: [0, 0, z] as V3, out: [1, 0, 0] as V3, up: [0, 1, 0] as V3,
      ring: [[-KEEL.half, y - .004], [KEEL.half, y - .004], [KEEL.half, y + KEEL.proud], [-KEEL.half, y + KEEL.proud]] as [number, number][]};
  }));
  assertHullPart(ID, 'glacis keel', keel);
  P.addExternalArmor('hull', keel);
}

/** The three sawtooth chevron bands per side: wedges .025 thick at their rear rising to a front lip raked 60 degrees,
 * their lips swept back 15 degrees outboard. Round 4: each band's rear edge abuts a permanent retainer rib welded to the
 * glacis (RIB: spent, the three chevrons stay drawn on the plate as the frame they hung on). Round 6 (the critic's D3:
 * "broad flat wedge plates with thin seam lines and almost no relief"; D6: spent, "thin beige rods at varying angles ...
 * stray sticks"): each band is laid as discrete wedge blocks in 18 mm joints, three a side on the outer bands and four,
 * half a block offset, on the middle band (shingled like the prow's courses), and the ribs and a cleat in every joint
 * are gunmetal: intact they are the dark floors of the joints, spent a herringbone frame tied to the keel and rails. */
const BAND_JOINT = .018, BAND_BLOCKS = [3, 4, 3] as const;
/** A band's rear and front edges (z) at |x| X: the band's two authored stations, linear between. */
function bandEdge(b: typeof BANDS[number], X: number): {rear: number; front: number} {
  const t = (X - BAND_X[0]) / (BAND_X[1] - BAND_X[0]);
  return {rear: b.rear[0] + (b.rear[1] - b.rear[0]) * t, front: b.front[0] + (b.front[1] - b.front[0]) * t};
}
/** A band's blocks as [x0, x1] spans (|x|): `count` 3 is three whole blocks; 4 is two whole blocks between two halves. */
function bandSpans(count: number): [number, number][] {
  const [x0, x1] = BAND_X, whole = (x1 - x0 - 2 * BAND_JOINT) / 3, pitch = whole + BAND_JOINT;
  const cuts = count === 3 ? [x0 + whole + BAND_JOINT / 2, x0 + whole + pitch + BAND_JOINT / 2]
    : [x0 + whole / 2 + BAND_JOINT / 2, x0 + whole / 2 + pitch + BAND_JOINT / 2, x0 + whole / 2 + 2 * pitch + BAND_JOINT / 2];
  const edges = [x0, ...cuts.flatMap(c => [c - BAND_JOINT / 2, c + BAND_JOINT / 2]), x1];
  const out: [number, number][] = [];
  for (let i = 0; i < edges.length; i += 2) out.push([edges[i], edges[i + 1]]);
  return out;
}
function chevronBands(P: TankBuilderPort, glacisAt: (z: number) => number): void {
  const cot60 = 1 / Math.tan(Math.PI / 3);
  for (const side of SIDES) BANDS.forEach((b, i) => {
    const seat = BAND_SEAT[i], spans = bandSpans(BAND_BLOCKS[i]);
    spans.forEach(([xa, xb], k) => {
      const stations = [xa, xb].map(X => {
        const {rear: zr, front: zf} = bandEdge(b, X);
        const bottom = [0, 1 / 3, 2 / 3, 1].map(t => { const z = zr + (zf - zr) * t; return [z, glacisAt(z) - seat] as [number, number]; });
        const top: [number, number] = [zf - b.lip * cot60, glacisAt(zf) + b.lip];
        return {x: side * X, ring: [...bottom, top, [zr, glacisAt(zr) + .025]] as [number, number][]};
      });
      eraModule(P, {owner: 'hull', sector: sectorOf('glacis_era', side), geometry: crosswiseSolid(stations), outward: [0, .7071, .7071], minDot: .5,
        name: `chevron block ${i + 1}.${k + 1}`, guard: (nm, geo) => assertHullPart(ID, nm, geo)});
    });
    const rib = crosswiseSolid(BAND_X.map((X, k) => {
      const z1 = b.rear[k] - RIB.gap, z0 = z1 - RIB.w;
      // (its foot under its band's seat: no shared plane)
      const foot = RIB_FOOT[i];
      return {x: side * X, ring: [[z0, glacisAt(z0) - foot], [z1, glacisAt(z1) - foot], [z1, glacisAt(z1) + RIB.h], [z0, glacisAt(z0) + RIB.h]] as [number, number][]};
    }));
    assertHullPart(ID, 'chevron retainer rib', rib);
    P.addEquipment('hullDark', rib);
    // a cleat in each joint from the rib to the lip's foot, its sides 4 mm clear of the blocks (near tier)
    if (P.q) for (let k = 0; k < spans.length - 1; k++) {
      const X = (spans[k][1] + spans[k + 1][0]) / 2;
      const cleat = crosswiseSolid([X - RIB.cleat / 2, X + RIB.cleat / 2].map(x => {
        const {rear, front} = bandEdge(b, x), z0 = rear - RIB.gap, z1 = front - .004, foot = RIB_FOOT[i];
        return {x: side * x, ring: [[z0, glacisAt(z0) - foot], [z1, glacisAt(z1) - foot], [z1, glacisAt(z1) + RIB.h], [z0, glacisAt(z0) + RIB.h]] as [number, number][]};
      }));
      assertHullPart(ID, 'chevron joint cleat', cleat);
      P.addEquipment('hullDark', cleat);
    }
  });
}
/** The retainer rib: 10 mm thick, 1 mm behind its band, so 4 mm clear of the band ahead's lip foot (the bands' 15 mm
 * gaps), 3 cm tall; the joint cleats 10 mm wide (round 6). */
const RIB = {w: .010, h: .03, gap: .001, cleat: .010};
/** Round 5 (2026-10-17; the lane's seat-sink receipt: band 2 entered the plate 7.3 mm at (.73, 1.305, 2.407)): the
 * T-72B3M glacis breaks 2.7 degrees at z 2.40 (slope .348 behind, .396 ahead), and bands 1 and 2 cross the break
 * obliquely (band 1's front edge, band 2's rear edge and its rib), so their bottoms, lofted straight between the two
 * stations, sag up to 3.3 mm under it. Their seats are shallower (bands 2.5 mm, band 2's rib foot 3.5 mm; band 3 and
 * the other ribs keep 4 and 6 mm), so no part enters the plate past 7 mm and no rib foot shares a band's plane. */
const BAND_SEAT = [.0025, .0025, .004] as const, RIB_FOOT = [.006, .0035, .006] as const;

/** Hinged aprons on the lower front plate, hung on a hinge line on the plate in the gap between its top edge and the
 * sill. Round 6 (the critic's D3: "the lower front plate is nearly bare apart from a slim ledge"): three aprons a side
 * in 18 mm joints, each a doublet: its lower tier 9.5 cm thick, stepped back to 7 cm over its upper tier (the shingle of
 * the prow and the glacis); four permanent knuckles a side (at the ends and the joints) and, between them, each apron's
 * own knuckle (near tier) on the same pin. */
function aprons(P: TankBuilderPort, hull: Stock): void {
  const ys = [APRON.y[0], .704, APRON.step, .823, APRON.y[1]];
  const [x0, x1] = APRON.x, w = (x1 - x0 - 2 * APRON.joint) / 3;
  const spans = [0, 1, 2].map(k => [x0 + k * (w + APRON.joint), x0 + k * (w + APRON.joint) + w] as const);
  for (const side of SIDES) {
    const ring = (X: number): [number, number][] => {
      const backs = ys.map(y => hull.face([side * X, y, 5], [0, 0, -1]).point);
      const segN = (i: number): [number, number] => { const a = backs[i], b = backs[i + 1], dz = b.z - a.z, dy = b.y - a.y, l = Math.hypot(dz, dy); return [dy / l, -dz / l]; };
      // a point's offset along its facet's normal (the plate's two facets meet at .704-.823; the step lies on the upper one)
      const off = (i: number, d: number, seg: number): [number, number] => { const n = segN(seg); return [backs[i].z + n[0] * d, backs[i].y + n[1] * d]; };
      const mitre = (i: number, d: number): [number, number] => {
        const a = segN(i - 1), b = segN(i), m = [a[0] + b[0], a[1] + b[1]], l = Math.hypot(m[0], m[1]), k = d / Math.max(.5, (m[0] * b[0] + m[1] * b[1]) / l);
        return [backs[i].z + m[0] / l * k, backs[i].y + m[1] / l * k];
      };
      const t0 = APRON.thick + APRON.doublet, t1 = APRON.thick;
      const back = ys.map((_, i) => i === 0 ? off(0, -.004, 0) : i === ys.length - 1 ? off(i, -.004, i - 1) : mitre(i, -.004));
      const front: [number, number][] = [off(0, t0, 0), mitre(1, t0), off(2, t0, 2), off(2, t1, 2), mitre(3, t1), off(4, t1, 3)];
      return [...back, ...front.reverse()];
    };
    const r = .022, segs = 6;
    const line = (X: number): THREE.Vector3 => {
      const a = hull.face([side * X, .823, 5], [0, 0, -1]).point, b = hull.face([side * X, APRON.y[1], 5], [0, 0, -1]).point;
      const up = new THREE.Vector3(0, b.y - a.y, b.z - a.z).normalize(), out = new THREE.Vector3(0, -up.z, up.y);
      if (out.z < 0) out.negate();
      return b.clone().setX(side * X).addScaledVector(up, r - .003).addScaledVector(out, r - .004);
    };
    // the permanent knuckles at the line's ends and over the joints; each apron's own knuckle fills the line between
    // (the permanent knuckles over the two joints; the outer aprons' own knuckles run to 4 mm inside their outer ends)
    const knuckleX = [x0 - APRON.knuckle / 2 + .004, ...spans.slice(1).map(([a]) => a - APRON.joint / 2), x1 + APRON.knuckle / 2 - .004];
    spans.forEach(([a, b], k) => {
      const geo = crosswiseSolid([a, b].map(X => ({x: side * X, ring: ring(X)})));
      const l0 = knuckleX[k] + APRON.knuckle / 2 + .003, l1 = knuckleX[k + 1] - APRON.knuckle / 2 - .003, c = line((l0 + l1) / 2);
      eraModule(P, {owner: 'hull', sector: sectorOf('glacis_era', side), geometry: geo, outward: [0, -.86, .51], minDot: .5,
        name: `lower-plate apron ${k + 1}`, hardware: [cylX(r, l1 - l0, segs).translate(c.x, c.y, c.z)], guard: (nm, g2) => assertHullPart(ID, nm, g2)});
    });
    for (const X of knuckleX.slice(1, -1)) { const c = line(X); P.addEquipment('hullDetail', tagFrontPart(cylX(r, APRON.knuckle, segs), 'apron hinge knuckle', 'hull'), c.x, c.y, c.z); }
  }
}

/** Two-layer bow modules on the front skirt banks' outer faces: a base layer and a chamfered, inset face layer. */
function bowModules(P: TankBuilderPort): void {
  const inset = (d: number): [number, number][] => {
    // the outline (convex, counter-clockwise in (z, y)) offset inward by d
    const o = BOW.outline, n = o.length, lines = o.map((p, i) => {
      const q = o[(i + 1) % n], dz = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dz, dy), nz = dy / l, ny = -dz / l;
      return {p: [p[0] - nz * d, p[1] - ny * d], d: [dz, dy]};
    });
    return lines.map((L, i) => {
      const M = lines[(i + n - 1) % n], det = M.d[0] * L.d[1] - M.d[1] * L.d[0];
      const t = ((L.p[0] - M.p[0]) * L.d[1] - (L.p[1] - M.p[1]) * L.d[0]) / det;
      return [M.p[0] + M.d[0] * t, M.p[1] + M.d[1] * t] as [number, number];
    });
  };
  const base = BOW.outline.map(p => [p[0], p[1]] as [number, number]), face = inset(BOW.inset), crown = inset(BOW.inset + BOW.chamfer);
  for (const side of SIDES) {
    const x0 = BOW.x - .004, x1 = x0 + BOW.layer, x3 = side > 0 ? BOW.outer : BOW.outer;
    const at = (X: number, ring: [number, number][]) => ({o: [side * X, 0, 0] as V3, out: [0, 0, -1] as V3, up: [0, 1, 0] as V3,
      ring: ring.map(([z, y]) => [-z, y] as [number, number])});
    const stations = P.q ? [at(x0, base), at(x1, base), at(x1, face), at(x3 - BOW.chamfer * .6, face), at(x3, crown)]
      : [at(x0, base), at(x1, base), at(x1, face), at(x3, face)];
    const g = sectionLoft(stations);
    eraModule(P, {owner: 'hull', sector: sectorOf('skirt_era', side), geometry: g, outward: [side, 0, 0], minDot: .5,
      name: 'bow skirt module', guard: (nm, geo) => assertHullPart(ID, nm, geo, {skirtTop: 1.28})});
  }
}

/** The driver's periscope block under the hatch's front edge (the T-72B3M's dark block, x +-.19, y 1.477-1.505, z
 * 1.987-2.072) stood 1.6-4.3 cm clear of the glacis (round 2; the critic: "a thin black slab sticks forward from under
 * the driver's hatch disc and looks like a loose sliver"): a welded base seats it on the plate (2 mm into the block),
 * and three vision windows face forward on its front, under the driver's sight plane. */
function periscopeSeat(P: TankBuilderPort, glacisAt: (z: number) => number): void {
  const z0 = 1.99, z1 = 2.068, top = 1.479;
  const base = crosswiseSolid([-.185, .185].map(x => ({x, ring: [[z0, glacisAt(z0) - .004], [z1, glacisAt(z1) - .004], [z1, top], [z0, top]] as [number, number][]})));
  assertHullPart(ID, 'periscope base', base);
  P.addEquipment('hullDetail', base);
  for (const x of [-.12, 0, .12]) {
    const g = new THREE.BoxGeometry(.10, .014, .003).translate(x + .002, 1.489, 2.0725 + .0005);
    assertHullPart(ID, 'periscope window', g);
    P.addEquipment('hullGlass', g);
  }
}

/** Hetman II's hull front: called in the Hetman II kit after its hull package. */
export function hetmanIIGlacis(P: TankBuilderPort): void {
  const core: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['hull'], g => core.push(g));
  const hull = new Stock(P.spec.id, core);
  try {
    const glacisAt = (z: number) => hull.top(0, z);
    sillSegments(P, glacisAt);
    ledBars(P);
    periscopeSeat(P, glacisAt);
    railsAndKeel(P, glacisAt);
    chevronBands(P, glacisAt);
    aprons(P, hull);
    bowModules(P);
  } finally { hull.dispose(); }
}
