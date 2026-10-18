// Release 227: Hetman II's own frontal ERA package, "Stepped Prow" (owner 2026-10-16: "for our turret upghrades, it
// should be a brand new era packages for both though, donnt make it just copy the t90ms. innovate for the hetman 2").
// An original Ukrainian concept in the diagonal, deep-block language of the Duplet/Nizh lineage, not a T-90M/MS Relikt
// layout: no fan of flat cheek cells, no roof cassette field. The turret front is a stepped prow of three raked
// two-layer (doublet) courses per side on two facets, each course stepping back .07 m as it rises, carried on a
// permanent welded shelf, with jaw collars framing the mantlet, returns round the shoulders and a low brow on the roof
// front. The hull carries a framed chevron glacis (three sawtooth bands per side between a keel and two side rails),
// a nose sill holding two recessed LED bars, hinged aprons on the lower front plate and two-layer bow modules on its
// front skirt banks. Every module is a lofted solid bound to an existing gameplay ERA sector with authored hit faces;
// every carrier, sill, rail, keel, hinge and housing is permanent and survives stripEra/resetEra.
//
// Frames: the turret frame of the T-72B3M (2016) donor turret (origin on the ring centre, +Z forward, +X the vehicle's
// left; x < 0 is the *_L sector) and the T-72B3M hull frame. The donor casting is never reshaped: every module and
// carrier is seated by ray on it.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {blindTube} from './measuredPrimitives.ts';
import {Stock, sectionLoft, crosswiseSolid, eraModule, sectorOf, assertHullPart, assertTurretPart,
  nightLens, tagFrontPart, type LoftStation, type V3} from './eraModuleKit.ts';
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
// the jaw ledge and the brow rails stay: a stepped frame of empty bays.

/** Facet A (raked 22 degrees in plan) and facet B (58 degrees): plan normals in (|x|, z). */
const NA = [.375, .927] as const, NB = [.848, .530] as const;
/** Courses bottom to top: block heights, facet offsets at the course's foot, and the shoulder return's outer face.
 * Courses 2 and 3 stand on 15 mm ledges (LEDGE) over the course below, 1 mm clear of its top. */
const COURSES = [
  {yb: .145, yt: .249, a: 1.643, b: 1.674, ret: 1.44 as number | null},
  {yb: .265, yt: .359, a: 1.573, b: 1.604, ret: 1.40 as number | null},
  {yb: .375, yt: .47, a: 1.503, b: 1.534, ret: null as number | null},
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
const BROW = {x0: .40, x1: .95, z: [.44, .60, .72, .74] as const, thick: [.03, .045, .075] as const, rail: {w: .012, h: .022}};
/** The joints: a permanent divider plate 12 mm thick in each, its front 6 mm behind the blocks' faces and its top 4 mm
 * under theirs; each block ends 3 mm off it. */
const JOINT = {plate: .012, gap: .003, inset: .006, sink: .004};
const HALF_JOINT = JOINT.plate / 2 + JOINT.gap;
/** Along a run the stations stand at most `step` apart (a block's, a ledge's); one is added between two whose seated
 * back leaves their chord by more than SEAT_TOL, so a back seated SEAT_IN into the casting at its stations stays from 2
 * mm off it to 6 mm into it between them. */
const BLOCK_STEP = .16, LEDGE_STEP = .17, SEAT_TOL = .004, SEAT_IN = .002;

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
  const y = (SHELF.bottom + SHELF.top) / 2;
  const stations: LoftStation[] = path.map(st => {
    const o = new THREE.Vector3(side * st.X, 0, st.Z), out = new THREE.Vector3(side * st.out[0], 0, st.out[1]);
    const uo = SHELF.proud * st.scale;
    const hit = casting.face(o.clone().addScaledVector(out, .2).setY(y).toArray() as unknown as V3, [-out.x, 0, -out.z]);
    const ui = hit.point.clone().setY(0).sub(o).dot(out) - .004;
    return {o: o.toArray() as unknown as V3, out: out.toArray() as unknown as V3, up: [0, 1, 0],
      ring: [[ui, SHELF.bottom], [uo, SHELF.bottom], [uo, SHELF.top], [ui, SHELF.top]]};
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
    const uo = -JOINT.inset * f.scale, u0 = seatU(casting, side, f, y0 + .002, uo), u1 = seatU(casting, side, f, y1 - .002, uo);
    return u0 === null || u1 === null || uo - Math.max(u0, u1) < .02 ? null : [[u0, y0], [uo, y0], [uo, y1], [u1, y1]];
  };
  const parts: Station[] = [];
  for (const [k, sp] of plan.path.entries()) {
    const list = spanStations(casting, sp, ring, side, LEDGE_STEP, [0, 3]);
    if (!list) throw new Error(`${ID}: the course ledge at ${c.yb} leaves the casting`);
    parts.push(...(k ? list.slice(1) : list));
  }
  const g = loftOf(side, parts);
  assertTurretPart(ID, 'prow ledge', g);
  P.addExternalArmor('turret', g);
}

/** A frame plate 12 mm thick in a boundary's plane, from the course's foot to 4 mm under its top, its front 6 mm behind
 * the faces either side (square to the given facet normal), or at the given front. */
function framePlate(casting: Stock, side: number, b: Boundary, n: P2, yb: number, yt: number, backs: readonly number[],
  front?: (o: P2, out: P2, y: number) => number): THREE.BufferGeometry {
  const m = perp(b.out), scale = 1 / dot2(b.out, n);
  const stations = [-JOINT.plate / 2, JOINT.plate / 2].map(d => {
    const f: Frame = {X: b.at[0] + m[0] * d, Z: b.at[1] + m[1] * d, out: b.out, scale};
    let r: SectionPoint[] | null;
    if (front) {
      const fr = backs.map(y => [front([f.X, f.Z], b.out, y), y] as SectionPoint);
      const bk = backs.map((y, i) => [seatU(casting, side, f, y, fr[i][0]), y] as [number | null, number]);
      r = bk.some(q => q[0] === null) ? null : [...fr, ...[...bk].reverse()] as SectionPoint[];
    } else r = rakedRing(casting, side, f, yb, yt, yb, backs, JOINT.inset);
    if (!r) throw new Error(`${ID}: a prow frame plate at ${b.at.map(v => v.toFixed(3))} leaves the casting`);
    return {s: d, f, ring: r};
  });
  return loftOf(side, stations);
}

/** The divider plates in a course's joints (near tier). */
function dividers(P: TankBuilderPort, casting: Stock, side: number, c: typeof COURSES[number], plan: CoursePlan): void {
  const yt = c.yt - JOINT.sink, backs = [c.yb + .002, (c.yb + yt) / 2, yt - .002];
  for (const j of plan.joints) {
    const g = framePlate(casting, side, j.b, j.n, c.yb, yt, backs);
    assertTurretPart(ID, 'prow divider', g);
    P.addExternalArmor('turret', g);
  }
}

/** The cheek frame post in the plane |x| .52 between the jaw collars and the courses: from the shelf to 4 mm under the
 * top course's top, its front 6 mm behind the jaw collars' and the courses' faces (whichever stands further back) at
 * every height. */
function cheekPost(P: TankBuilderPort, casting: Stock, side: number): void {
  const nA = unit2(NA), nJ: P2 = [0, 1];
  // the faces present at a height: a course (its foot plane where a ledge is), a jaw collar (its foot over the jaw ledge)
  const course = (y: number): {n: P2; d: number} => {
    for (const [k, c] of COURSES.entries()) {
      if (y < c.yb - 1e-9) return {n: nA, d: c.a};
      if (y <= c.yt + 1e-9 || k === COURSES.length - 1) return {n: nA, d: c.a - (y - c.yb) * RAKE};
    }
    return {n: nA, d: COURSES[2].a};
  };
  const jaw = (y: number): {n: P2; d: number} => {
    const [j1, j2] = JAW.blocks;
    return y <= j1.yt + 1e-9 ? {n: nJ, d: j1.front - (y - j1.yb) * RAKE} : {n: nJ, d: j2.front - (Math.max(y, j2.yb) - j2.yb) * RAKE};
  };
  const front = (o: P2, out: P2, y: number): number => Math.min(...[course(y), jaw(y)].map(e =>
    (e.d - dot2(e.n, o)) / dot2(e.n, out) - JOINT.inset / dot2(e.n, out)));
  const top = COURSES[2].yt - JOINT.sink;
  const keys = [SHELF.top + .002, COURSES[0].yt, JAW.blocks[0].yt, COURSES[1].yb, JAW.blocks[1].yb, COURSES[1].yt, COURSES[2].yb, top - .002]
    .filter((y, i, all) => all.indexOf(y) === i).sort((a, b) => a - b);
  const g = framePlate(casting, side, POST, nJ, SHELF.top, top, keys, front);
  assertTurretPart(ID, 'cheek frame post', g);
  P.addExternalArmor('turret', g);
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
    const uo = -JOINT.inset * f.scale, u0 = seatU(casting, side, f, l0 + .002, uo), u1 = seatU(casting, side, f, l1 - .002, uo);
    return u0 === null || u1 === null ? null : [[u0, l0], [uo, l0], [uo, l1], [u1, l1]];
  }));
  assertTurretPart(ID, 'jaw ledge', lg);
  P.addExternalArmor('turret', lg);
  for (const [i, j] of JAW.blocks.entries()) {
    // (seated like a prow block: heights refined at its middle, stations added where the casting bulges between two)
    const span: Span = {run: {start: [0, j.front], dir: [1, 0], n: nJ}, s0: JAW.x0, s1: POST_X - HALF_JOINT, out0: nJ, out1: nJ};
    const backs = spanSeatHeights(casting, side, span, j.yb, j.yt);
    const list = spanStations(casting, span, f => rakedRing(casting, side, f, j.yb, j.yt, j.yb, backs), side, .06, backVertices(backs.length));
    if (!list) throw new Error(`${ID}: jaw collar ${i + 1} leaves the casting`);
    const g = loftOf(side, list);
    eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', side), geometry: g, outward: [0, Math.sin(.26), Math.cos(.26)],
      name: `jaw collar ${i + 1}`, guard: (n, geo) => assertTurretPart(ID, n, geo)});
  }
}

function brow(P: TankBuilderPort, casting: Stock, side: number): void {
  const [z0, z1, z2, z3] = BROW.z, [t0, t1, t2] = BROW.thick;
  const stations = [BROW.x0, .55, .70, .85, BROW.x1].map(X => {
    const b = (z: number) => casting.top(side * X, z) - .004;
    const [b0, b1, b2, b3] = [b(z0), b(z1), b(z2), b(z3)];
    return {x: side * X, ring: [[z0, b0], [z1, b1], [z2, b2], [z3, b3], [z3, b3 + t2 + .004], [z2, b2 + t2 + .004],
      [z2, b2 + t1 + .004], [z1, b1 + t1 + .004], [z1, b1 + t0 + .004], [z0, b0 + t0 + .004]] as [number, number][]};
  });
  eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', side), geometry: crosswiseSolid(stations), outward: [0, .866, .5], minDot: .5,
    name: 'roof brow', guard: (n, geo) => assertTurretPart(ID, n, geo)});
  // its permanent seat rails, 3 mm clear of its front and rear edges, 4 mm into the roof
  const r = BROW.rail;
  for (const [za, zb] of [[z3 + .003, z3 + .003 + r.w], [z0 - .003 - r.w, z0 - .003]] as const) {
    const rail = crosswiseSolid([BROW.x0, (BROW.x0 + BROW.x1) / 2, BROW.x1].map(X => {
      const ya = casting.top(side * X, za) - .004, yb = casting.top(side * X, zb) - .004;
      return {x: side * X, ring: [[za, ya], [zb, yb], [zb, yb + r.h + .004], [za, ya + r.h + .004]] as [number, number][]};
    }));
    assertTurretPart(ID, 'brow rail', rail);
    P.addExternalArmor('turret', rail);
  }
}

/** The IR dazzler pods on the shelf lips: a bracket, a hood and a recessed red lens (marker, no beam). */
function dazzlers(P: TankBuilderPort): void {
  for (const side of SIDES) {
    const x = side * 1.50, y = .255, z = .70;
    P.addEquipment('turretDetail', tagFrontPart(new THREE.BoxGeometry(.08, y - .055 - SHELF.top + .004, .10), 'dazzler bracket', 'turret'), x, (SHELF.top - .004 + y - .055) / 2, z);
    // an open-mouthed hood: a 44 mm bore 16 mm deep in a 55 mm housing
    const hood = blindTube(.055, .044, .11, .016, P.q ? 10 : 8);
    assertTurretPart(ID, 'dazzler hood', hood.clone().translate(x, y, z));
    P.addEquipment('turretDetail', tagFrontPart(hood, 'dazzler hood', 'turret'), x, y, z);
    // the lens's face 10 mm inside the hood's mouth (z + .055), lapping into the hood bore
    P.addEquipment('turretGlass', tagFrontPart(nightLens(cylZ(.042, .012, P.q ? 10 : 8), 'marker', 'red'), 'dazzler lens', 'turret'), x, y, z + .055 - .010 - .006);
  }
}

/** Hetman II's turret front: the shelves, the cheek frame posts, jaw collars, three prow courses of blocks on their
 * ledges and dividers, shoulder returns, roof brows on their rails and the dazzler pods. Called first in the Hetman II
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
      brow(P, casting, side);
    }
    dazzlers(P);
  } finally { casting.dispose(); }
}

// ---------------------------------------------------------------------------------------------------------------------
// Hull: the framed chevron glacis, the nose sill and its LED bars, the lower-plate aprons and the bow modules

const SILL = {x: 1.142, rear: 3.08, nose: 3.342, front: 3.357, bottom: .958, hoodY: 1.05, top: 1.07, hood: .03, rearTop: 1.14};
const LED = {xs: [.60], half: .18, y: 1.015, slot: .03, depth: .015, lens: [.10, .040, .014] as V3, pitch: .12, recess: .012};
const RAIL = {x0: 1.082, x1: 1.142, z0: 2.00, z1: 3.08, proud: .07};
const KEEL = {half: .025, z0: 2.14, z1: 3.08, proud: .055};
const BANDS = [
  {rear: [2.14, 2.00], front: [2.50, 2.22], lip: .10},
  {rear: [2.515, 2.235], front: [2.87, 2.59], lip: .13},
  {rear: [2.885, 2.605], front: [3.075, 3.075], lip: .15},
] as const;
const BAND_X = [.03, 1.08] as const;
const APRON = {x: [.03, 1.10] as const, y: [.62, .93] as const, thick: .07, knuckles: [.25, .62, .98] as const};
const BOW = {x: 2.15, outer: 2.215, layer: .049, inset: .012, chamfer: .015, outline: [[2.50, .86], [2.90, .97], [3.10, 1.28], [2.50, 1.28]] as const};

function sillSegments(P: TankBuilderPort, glacisAt: (z: number) => number): void {
  const s = SILL, gb = glacisAt(s.rear) - .004;
  const brk: [number, number] = [3.20, glacisAt(3.20) - .004];
  const full: [number, number][] = [[s.rear, gb], brk, [s.nose, .963], [s.front, s.bottom], [s.front, s.hoodY], [s.front + s.hood, s.hoodY],
    [s.front + s.hood, s.top], [s.rear, s.rearTop]];
  const lo = LED.y - LED.slot, hi = LED.y + LED.slot, back = s.front - LED.depth;
  const slot: [number, number][] = [[s.rear, gb], brk, [s.nose, .963], [s.front, s.bottom], [s.front, lo], [back, lo], [back, hi],
    [s.front, hi], [s.front, s.hoodY], [s.front + s.hood, s.hoodY], [s.front + s.hood, s.top], [s.rear, s.rearTop]];
  const cuts = [-s.x, ...LED.xs.flatMap(c => [-c - LED.half, -c + LED.half]).sort((a, b) => a - b),
    ...LED.xs.flatMap(c => [c - LED.half, c + LED.half]), s.x];
  for (let i = 0; i < cuts.length - 1; i++) {
    const inSlot = i % 2 === 1, ring = inSlot ? slot : full;
    const g = crosswiseSolid([cuts[i], cuts[i + 1]].map(x => ({x, ring})));
    assertHullPart(ID, 'nose sill', g);
    P.addExternalArmor('hull', g);
  }
}

/** Two LED nose bars: three lens segments per bar between dark dividers and dark slot liners, each lens's face 12 mm
 * inside the sill's front face, its body lapping into the slot's back wall. */
function ledBars(P: TankBuilderPort): void {
  const [lw, lh, lt] = LED.lens, face = SILL.front - LED.recess, back = SILL.front - LED.depth;
  for (const c of LED.xs) for (const side of SIDES) {
    const cx = side * c;
    for (const k of [-1, 0, 1]) {
      // (glass, though the T-72B3M hull had no glass bucket (one draw more): the field net opens only round Glass, Hatch
      // and Cupola stock, so a lens in another bucket would be netted over)
      P.addEquipment('hullGlass', tagFrontPart(nightLens(new THREE.BoxGeometry(lw, lh, lt), 'headlight'), 'LED bar lens', 'hull'), cx + k * LED.pitch, LED.y, face - lt / 2);
    }
    // dividers between the lenses and liners along the slot's top and bottom: dark, beside (never in front of) a lens
    const liner = (w: number, h: number, x: number, y: number) =>
      P.addEquipment('hullDark', tagFrontPart(new THREE.BoxGeometry(w, h, LED.depth - .004), 'LED bar liner', 'hull'), x, y, back + (LED.depth - .004) / 2 - .002);
    for (const k of [-.5, .5]) liner(LED.pitch - lw, lh, cx + k * LED.pitch, LED.y);
    for (const dy of [-1, 1]) liner(2 * LED.half - .004, LED.slot - lh / 2 - .001, cx, LED.y + dy * (LED.slot + lh / 2) / 2);
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
 * glacis (RIB: spent, the three chevrons stay drawn on the plate as the frame they hung on), and the
 * doublet seam groove on the lips is gone (with the prow's, it drew the critic's "stair-stepped contour lines"). */
function chevronBands(P: TankBuilderPort, glacisAt: (z: number) => number): void {
  const cot60 = 1 / Math.tan(Math.PI / 3);
  for (const side of SIDES) BANDS.forEach((b, i) => {
    const seat = BAND_SEAT[i];
    const stations = BAND_X.map((X, k) => {
      const zr = b.rear[k], zf = b.front[k];
      const bottom = [0, 1 / 3, 2 / 3, 1].map(t => { const z = zr + (zf - zr) * t; return [z, glacisAt(z) - seat] as [number, number]; });
      const top: [number, number] = [zf - b.lip * cot60, glacisAt(zf) + b.lip];
      return {x: side * X, ring: [...bottom, top, [zr, glacisAt(zr) + .025]] as [number, number][]};
    });
    eraModule(P, {owner: 'hull', sector: sectorOf('glacis_era', side), geometry: crosswiseSolid(stations), outward: [0, .7071, .7071], minDot: .5,
      name: `chevron band ${i + 1}`, guard: (nm, geo) => assertHullPart(ID, nm, geo)});
    const rib = crosswiseSolid(BAND_X.map((X, k) => {
      const z1 = b.rear[k] - RIB.gap, z0 = z1 - RIB.w;
      // (its foot under its band's seat: no shared plane)
      const foot = RIB_FOOT[i];
      return {x: side * X, ring: [[z0, glacisAt(z0) - foot], [z1, glacisAt(z1) - foot], [z1, glacisAt(z1) + RIB.h], [z0, glacisAt(z0) + RIB.h]] as [number, number][]};
    }));
    assertHullPart(ID, 'chevron retainer rib', rib);
    P.addExternalArmor('hull', rib);
  });
}
/** The retainer rib: 10 mm thick, 1 mm behind its band, so 4 mm clear of the band ahead's lip foot (the bands' 15 mm
 * gaps), 3 cm tall. */
const RIB = {w: .010, h: .03, gap: .001};
/** Round 5 (2026-10-17; the lane's seat-sink receipt: band 2 entered the plate 7.3 mm at (.73, 1.305, 2.407)): the
 * T-72B3M glacis breaks 2.7 degrees at z 2.40 (slope .348 behind, .396 ahead), and bands 1 and 2 cross the break
 * obliquely (band 1's front edge, band 2's rear edge and its rib), so their bottoms, lofted straight between the two
 * stations, sag up to 3.3 mm under it. Their seats are shallower (bands 2.5 mm, band 2's rib foot 3.5 mm; band 3 and
 * the other ribs keep 4 and 6 mm), so no part enters the plate past 7 mm and no rib foot shares a band's plane. */
const BAND_SEAT = [.0025, .0025, .004] as const, RIB_FOOT = [.006, .0035, .006] as const;

/** Hinged aprons on the lower front plate: a two-facet panel .07 thick, hung on a hinge line on the plate in the gap
 * between its top edge and the sill: three permanent knuckles and, between them, the apron's own (near tier). */
function aprons(P: TankBuilderPort, hull: Stock): void {
  for (const side of SIDES) {
    const stations = APRON.x.map(X => {
      const ys = [APRON.y[0], .704, .823, APRON.y[1]];
      const backs = ys.map(y => hull.face([side * X, y, 5], [0, 0, -1]).point);
      const nAt = (i: number): [number, number] => {
        const a = backs[Math.max(0, i - 1)], b = backs[Math.min(backs.length - 1, i + 1)];
        const dz = b.z - a.z, dy = b.y - a.y, l = Math.hypot(dz, dy);
        return [dy / l, -dz / l];
      };
      const segN = (i: number): [number, number] => { const a = backs[i], b = backs[i + 1], dz = b.z - a.z, dy = b.y - a.y, l = Math.hypot(dz, dy); return [dy / l, -dz / l]; };
      const offset = (i: number, d: number): [number, number] => {
        // mitred offset along the bisector of the two neighbouring facets
        const n = i === 0 ? segN(0) : i === backs.length - 1 ? segN(i - 1) : nAt(i);
        const ref = i === 0 ? segN(0) : i === backs.length - 1 ? segN(i - 1) : segN(i);
        const k = d / Math.max(.5, n[0] * ref[0] + n[1] * ref[1]);
        return [backs[i].z + n[0] * k, backs[i].y + n[1] * k];
      };
      const back = backs.map((_, i) => offset(i, -.004)), front = backs.map((_, i) => offset(i, APRON.thick));
      return {x: side * X, ring: [...back, ...front.reverse()] as [number, number][]};
    });
    const g = crosswiseSolid(stations);
    // the hinge line: on the plate's top facet (from y .823 to the apron's top edge at .93), its up-slope and outward
    // normal in (z, y); the permanent knuckles sit 4 mm into the plate and 3 mm over the apron's top edge, the apron's own
    // knuckles (near tier, furniture that leaves with it) fill the line between them on the same pin
    const r = .022, line = (X: number): THREE.Vector3 => {
      const a = hull.face([side * X, .823, 5], [0, 0, -1]).point, b = hull.face([side * X, APRON.y[1], 5], [0, 0, -1]).point;
      const up = new THREE.Vector3(0, b.y - a.y, b.z - a.z).normalize(), out = new THREE.Vector3(0, -up.z, up.y);
      if (out.z < 0) out.negate();
      return b.clone().setX(side * X).addScaledVector(up, r - .003).addScaledVector(out, r - .004);
    };
    const knuckles = APRON.knuckles.map(line), segs = P.q ? 8 : 7;
    const leaves = APRON.knuckles.slice(1).map((X, k) => {
      const x0 = APRON.knuckles[k] + .05 + .003, x1 = X - .05 - .003, c = line((x0 + x1) / 2);
      return cylX(r, x1 - x0, segs).translate(c.x, c.y, c.z);
    });
    eraModule(P, {owner: 'hull', sector: sectorOf('glacis_era', side), geometry: g, outward: [0, -.86, .51], minDot: .5,
      name: 'lower-plate apron', hardware: leaves, guard: (nm, geo) => assertHullPart(ID, nm, geo)});
    for (const c of knuckles) P.addEquipment('hullDetail', tagFrontPart(cylX(r, .10, segs), 'apron hinge knuckle', 'hull'), c.x, c.y, c.z);
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
