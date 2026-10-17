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
import {Stock, sectionLoft, crosswiseSolid, eraModule, sectorOf, hardwareBlock, assertHullPart, assertTurretPart,
  nightLens, tagFrontPart, type LoftStation, type V3} from './eraModuleKit.ts';
import type {SectionPoint} from './sectionSolid.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
const {cylX, cylZ} = KIT;

const ID = 't72b3m_hetman_ii';
const SIDES = [-1, 1] as const;
const RAKE = Math.tan(15 * Math.PI / 180);
/** Doublet seam: an 18 mm groove, 10 mm deep, across the middle of each module's face (near tier; a 12 mm groove broke
 * into a dotted line at viewing distance). */
const SEAM = {half: .009, depth: .010};

// ---------------------------------------------------------------------------------------------------------------------
// Turret: the stepped prow

/** Facet A (raked 22 degrees in plan) and facet B (58 degrees): plan normals in (|x|, z). */
const NA = [.375, .927] as const, NB = [.848, .530] as const;
/** Courses bottom to top: heights, facet offsets at the course's foot, and the shoulder return's outer face. */
// (the shelf rides 20 mm higher than first drawn: at the prow's apex, r 1.77 about the ring, the turret's sweep passes
// over the rear deck's intake box, whose sloped front stands .087-.093 over the ring seat there)
const COURSES = [
  {yb: .145, yt: .25, a: 1.643, b: 1.674, ret: 1.44 as number | null},
  {yb: .25, yt: .36, a: 1.573, b: 1.604, ret: 1.40 as number | null},
  {yb: .36, yt: .47, a: 1.503, b: 1.534, ret: null as number | null},
] as const;
const SHELF = {bottom: .12, top: .145, proud: .025, lip: {x: 1.52, z0: .62, z1: .80}};
const JAW = {x0: .40, x1: .52, blocks: [{yb: .145, yt: .29, front: 1.56}, {yb: .29, yt: .47, front: 1.45}]};
const RETURN_END = .62;
const BROW = {x0: .40, x1: .95, z: [.44, .60, .72, .74] as const, thick: [.03, .045, .075] as const};

/** (|x|, z) where two front planes n1.p = d1 and n2.p = d2 meet. */
function meet(n1: readonly [number, number], d1: number, n2: readonly [number, number], d2: number): [number, number] {
  const det = n1[0] * n2[1] - n2[0] * n1[1];
  return [(d1 * n2[1] - d2 * n1[1]) / det, (n1[0] * d2 - n2[0] * d1) / det];
}
const unit2 = (a: readonly [number, number]): [number, number] => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; };
const bisector = (a: readonly [number, number], b: readonly [number, number]): [number, number] => unit2([a[0] + b[0], a[1] + b[1]]);

interface CourseStation { X: number; Z: number; out: [number, number]; scale: number }

/** A course module's ring at one station: back points seated by -out rays on the casting (4 mm in), front raked 15
 * degrees, a doublet seam on the near tier. Returns null where the back ray leaves the casting or the module would be
 * thinner than 2 cm (the course ends there). */
function courseRing(P: TankBuilderPort, casting: Stock, side: number, st: CourseStation, yb: number, yt: number): SectionPoint[] | null {
  const out: V3 = [side * st.out[0], 0, st.out[1]], o = new THREE.Vector3(side * st.X, 0, st.Z);
  const front = (y: number, inset = 0) => -((y - yb) * RAKE + inset) * st.scale;
  const back = (y: number): number | null => {
    const u0 = front(y), start = o.clone().addScaledVector(new THREE.Vector3(...out), u0 + .06).setY(y);
    const hit = casting.tryFace(start.toArray() as unknown as V3, [-out[0], 0, -out[2]]);
    if (!hit) return null;
    const u = hit.point.clone().sub(o).dot(new THREE.Vector3(...out)) - .004;
    return u0 - u > .45 ? null : u;
  };
  const b0 = back(yb + .002), b1 = back(yt - .002);
  if (b0 === null || b1 === null || front(yb) - b0 < .02 || front(yt) - b1 < .02) return null;
  if (!P.q) return [[b0, yb], [front(yb), yb], [front(yt), yt], [b1, yt]];
  const m = (yb + yt) / 2, lo = m - SEAM.half, hi = m + SEAM.half;
  return [[b0, yb], [front(yb), yb], [front(lo), lo], [front(lo, SEAM.depth), lo], [front(hi, SEAM.depth), hi],
    [front(hi), hi], [front(yt), yt], [b1, yt]];
}

function stationsOf(side: number, list: readonly CourseStation[], rings: readonly SectionPoint[][]): LoftStation[] {
  return list.map((st, i) => ({o: [side * st.X, 0, st.Z], out: [side * st.out[0], 0, st.out[1]], up: [0, 1, 0], ring: rings[i]}));
}

/** Lofts a course module through its valid stations (the run stops at the first invalid one after the start). Its
 * lifting lug stands on the exposed tread of its top, `tread` m deep between its top front edge and the next course's
 * foot (the top course: open); no lug where the step leaves under 3.6 cm (a lug there would be buried in the course over
 * it). */
function courseModule(P: TankBuilderPort, casting: Stock, side: number, list: readonly CourseStation[], yb: number, yt: number,
  name: string, outward: V3, tread: number): {last: CourseStation} | null {
  const used: CourseStation[] = [], rings: SectionPoint[][] = [];
  for (const st of list) {
    const ring = courseRing(P, casting, side, st, yb, yt);
    if (!ring) { if (used.length) break; else continue; }
    used.push(st); rings.push(ring);
  }
  if (used.length < 2) return null;
  const g = sectionLoft(stationsOf(side, used, rings));
  const mid = used[Math.floor(used.length / 2)], topFront = (yt - yb) * RAKE * mid.scale;
  // the lug square to the course's face: .05 along it, .03 deep, its foot 2 mm into the top, mid-tread
  const back = Math.min(tread, .06) / 2, along: V3 = [side * mid.out[1], 0, -mid.out[0]];
  const lugAt: V3 = [side * mid.X - side * mid.out[0] * (topFront + back), yt + .009, mid.Z - mid.out[1] * (topFront + back)];
  const lug = tread >= .036 ? [hardwareBlock(lugAt, [.05, .022, .03], {x: along, y: [0, 1, 0]})] : [];
  eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', side * mid.X), geometry: g, outward, minDot: .5,
    name, hardware: lug, guard: (n, geo) => assertTurretPart(ID, n, geo)});
  return {last: used[used.length - 1]};
}

/** The faces a facet module's hit faces follow: its plan normal raised 15 degrees. */
function raised(side: number, n: readonly [number, number]): V3 {
  const c = Math.cos(15 * Math.PI / 180), s = Math.sin(15 * Math.PI / 180);
  return [side * n[0] * c, s, n[1] * c];
}

function shelf(P: TankBuilderPort, casting: Stock, side: number): void {
  const c = COURSES[0], [kx, kz] = meet(NA, c.a, NB, c.b), ret = c.ret!;
  const cornerZ = (c.b - NB[0] * ret) / NB[1];
  const nA = unit2(NA), nB = unit2(NB), nK = bisector(NA, NB), nR: [number, number] = [1, 0], nC = bisector(NB, nR);
  // the outer edge .025 beyond course 1's foot line, the inner edge 4 mm into the casting's lower nose and flank
  const path: {X: number; Z: number; out: [number, number]; scale: number}[] = [
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

function jaws(P: TankBuilderPort, casting: Stock, side: number): void {
  for (const [i, j] of JAW.blocks.entries()) {
    const ring = (X: number): SectionPoint[] => {
      const front = (y: number, inset = 0) => -((y - j.yb) * RAKE + inset);
      const back = (y: number) => {
        const hit = casting.face([side * X, y, j.front + .2], [0, 0, -1]);
        return hit.point.z - j.front - .004;
      };
      const b0 = back(j.yb + .002), b1 = back(j.yt - .002);
      if (!P.q) return [[b0, j.yb], [front(j.yb), j.yb], [front(j.yt), j.yt], [b1, j.yt]];
      const m = (j.yb + j.yt) / 2, lo = m - SEAM.half, hi = m + SEAM.half;
      return [[b0, j.yb], [front(j.yb), j.yb], [front(lo), lo], [front(lo, SEAM.depth), lo], [front(hi, SEAM.depth), hi],
        [front(hi), hi], [front(j.yt), j.yt], [b1, j.yt]];
    };
    const g = sectionLoft([JAW.x0, JAW.x1].map(X => ({o: [side * X, 0, j.front] as V3, out: [0, 0, 1] as V3, up: [0, 1, 0] as V3, ring: ring(X)})));
    const lug = hardwareBlock([side * (JAW.x0 + JAW.x1) / 2, j.yt + .009, j.front - (j.yt - j.yb) * RAKE - .05], [.04, .022, .03]);
    eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', side), geometry: g, outward: [0, Math.sin(.26), Math.cos(.26)],
      name: `jaw collar ${i + 1}`, hardware: [lug], guard: (n, geo) => assertTurretPart(ID, n, geo)});
  }
}

function courses(P: TankBuilderPort, casting: Stock, side: number): void {
  const nA = unit2(NA), nB = unit2(NB), nK = bisector(NA, NB), nR: [number, number] = [1, 0], nC = bisector(NB, nR);
  const sK = 1 / (nK[0] * nA[0] + nK[1] * nA[1]), sC = 1 / (nC[0] * nB[0] + nC[1] * nB[1]);
  COURSES.forEach((c, i) => {
    const [kx, kz] = meet(NA, c.a, NB, c.b), knee: CourseStation = {X: kx, Z: kz, out: nK, scale: sK};
    // the tread each module's top leaves in front of the course over it (its front planes step back by the difference of
    // their offsets, less this course's own 15-degree rake over its height); the top course is open
    const next = COURSES[i + 1], rake = (c.yt - c.yb) * RAKE;
    const treadA = next ? c.a - next.a - rake : 1, treadB = next ? c.b - next.b - rake : 1;
    // (a shoulder return's top lies under the course over it: return 1's tread is 1.2 cm, return 2's top runs under the
    // end of course 3B; neither carries a lug)
    const treadR = 0;
    // facet A from the jaw collars' outer face to the knee
    // the first station's cap lies in the jaw collars' outer face (x = .52): its frame runs straight forward
    const aStations: CourseStation[] = [.52, .64, .78, .90, 1.00].filter(X => X < kx - .04)
      .map((X, k) => k ? {X, Z: (c.a - NA[0] * X) / NA[1], out: nA, scale: 1}
        : {X, Z: (c.a - NA[0] * X) / NA[1], out: [0, 1] as [number, number], scale: 1 / NA[1]});
    courseModule(P, casting, side, [...aStations, knee], c.yb, c.yt, `prow course ${i + 1}A`, raised(side, NA), treadA);
    // facet B from the knee to the shoulder corner (courses 1-2) or to where its back leaves the casting (course 3)
    const corner = c.ret ? {X: c.ret, Z: (c.b - NB[0] * c.ret) / NB[1], out: nC, scale: sC} : null;
    const bX = [1.20, 1.25, 1.30, 1.35, 1.40].filter(X => X > kx + .04 && (!corner || X < corner.X - .03));
    const bStations: CourseStation[] = [knee, ...bX.map(X => ({X, Z: (c.b - NB[0] * X) / NB[1], out: nB, scale: 1})),
      ...(corner ? [corner] : [])];
    const done = courseModule(P, casting, side, bStations, c.yb, c.yt, `prow course ${i + 1}B`, raised(side, NB), treadB);
    if (!corner || !done || done.last !== corner) return;
    // the shoulder return, round the corner and back along the flank
    const rStations: CourseStation[] = [corner, ...[(corner.Z + RETURN_END) / 2, RETURN_END].map(Z => ({X: c.ret!, Z, out: nR, scale: 1}))];
    courseModule(P, casting, side, rStations, c.yb, c.yt, `prow return ${i + 1}`, raised(side, nR), treadR);
  });
}

function brow(P: TankBuilderPort, casting: Stock, side: number): void {
  const [z0, z1, z2, z3] = BROW.z, [t0, t1, t2] = BROW.thick;
  const stations = [BROW.x0, .55, .70, .85, BROW.x1].map(X => {
    const b = (z: number) => casting.top(side * X, z) - .004;
    const [b0, b1, b2, b3] = [b(z0), b(z1), b(z2), b(z3)];
    return {x: side * X, ring: [[z0, b0], [z1, b1], [z2, b2], [z3, b3], [z3, b3 + t2 + .004], [z2, b2 + t2 + .004],
      [z2, b2 + t1 + .004], [z1, b1 + t1 + .004], [z1, b1 + t0 + .004], [z0, b0 + t0 + .004]] as [number, number][]};
  });
  const g = crosswiseSolid(stations);
  const lug = hardwareBlock([side * (BROW.x0 + BROW.x1) / 2, casting.top(side * .675, .52) + t0 + .011, .52], [.04, .022, .03]);
  eraModule(P, {owner: 'turret', sector: sectorOf('turret_era', side), geometry: g, outward: [0, .866, .5], minDot: .5,
    name: 'roof brow', hardware: [lug], guard: (n, geo) => assertTurretPart(ID, n, geo)});
}

/** The IR dazzler pods on the shelf lips: a bracket, a hood and a recessed red lens (marker, no beam). */
function dazzlers(P: TankBuilderPort): void {
  for (const side of SIDES) {
    const x = side * 1.50, y = .255, z = .70;
    P.addEquipment('turretDetail', tagFrontPart(new THREE.BoxGeometry(.08, y - .055 - SHELF.top + .004, .10), 'dazzler bracket', 'turret'), x, (SHELF.top - .004 + y - .055) / 2, z);
    // an open-mouthed hood: a 44 mm bore 16 mm deep in a 55 mm housing
    const hood = blindTube(.055, .044, .11, .016, P.q ? 20 : 12);
    assertTurretPart(ID, 'dazzler hood', hood.clone().translate(x, y, z));
    P.addEquipment('turretDetail', tagFrontPart(hood, 'dazzler hood', 'turret'), x, y, z);
    // the lens's face 10 mm inside the hood's mouth (z + .055), lapping into the hood bore
    P.addEquipment('turretGlass', tagFrontPart(nightLens(cylZ(.042, .012, P.q ? 20 : 12), 'marker', 'red'), 'dazzler lens', 'turret'), x, y, z + .055 - .010 - .006);
  }
}

/** Hetman II's turret front: shelves, jaw collars, three prow courses, shoulder returns, roof brows and dazzler pods.
 * Called first in the Hetman II turret kit, before its flank cabinets. */
export function hetmanIIProw(P: TankBuilderPort): void {
  const parts: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['turret'], g => parts.push(g));
  const casting = new Stock(P.spec.id, parts);
  try {
    for (const side of SIDES) {
      shelf(P, casting, side);
      jaws(P, casting, side);
      courses(P, casting, side);
      brow(P, casting, side);
    }
    dazzlers(P);
  } finally { casting.dispose(); }
}

// ---------------------------------------------------------------------------------------------------------------------
// Hull: the framed chevron glacis, the nose sill and its LED bars, the lower-plate aprons and the bow modules

const SILL = {x: 1.145, rear: 3.08, nose: 3.342, front: 3.357, bottom: .958, hoodY: 1.05, top: 1.07, hood: .03, rearTop: 1.14};
const LED = {xs: [.60], half: .18, y: 1.015, slot: .03, depth: .015, lens: [.10, .040, .014] as V3, pitch: .12, recess: .012};
const RAIL = {x0: 1.085, x1: 1.145, z0: 2.00, z1: 3.08, proud: .07};
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

/** The three sawtooth chevron bands per side: wedges .025 thick at their rear rising to a front lip raked 60 degrees
 * with a doublet seam (near tier), their lips swept back 15 degrees outboard. */
function chevronBands(P: TankBuilderPort, glacisAt: (z: number) => number): void {
  const cot60 = 1 / Math.tan(Math.PI / 3), n: [number, number] = [Math.sin(Math.PI / 3), Math.cos(Math.PI / 3)];
  for (const side of SIDES) BANDS.forEach((b, i) => {
    const stations = BAND_X.map((X, k) => {
      const zr = b.rear[k], zf = b.front[k];
      const bottom = [0, 1 / 3, 2 / 3, 1].map(t => { const z = zr + (zf - zr) * t; return [z, glacisAt(z) - .004] as [number, number]; });
      const foot: [number, number] = [zf, glacisAt(zf) - .004], top: [number, number] = [zf - b.lip * cot60, glacisAt(zf) + b.lip];
      const along = (t: number): [number, number] => [foot[0] + (top[0] - foot[0]) * t, foot[1] + (top[1] - foot[1]) * t];
      const lip: [number, number][] = [];
      if (P.q) {
        const dt = SEAM.half / (top[1] - foot[1]), a = along(.5 - dt), c = along(.5 + dt);
        lip.push(a, [a[0] - SEAM.depth * n[0], a[1] - SEAM.depth * n[1]], [c[0] - SEAM.depth * n[0], c[1] - SEAM.depth * n[1]], c);
      }
      return {x: side * X, ring: [...bottom, ...lip, top, [zr, glacisAt(zr) + .025]] as [number, number][]};
    });
    const g = crosswiseSolid(stations);
    // the lifting lug on the band's own top (a ray down onto it) a third of the way from its rear edge to its lip at x
    // .55, its foot 4 mm into the top
    const t = (.55 - BAND_X[0]) / (BAND_X[1] - BAND_X[0]), zr = b.rear[0] + (b.rear[1] - b.rear[0]) * t;
    const zl = b.front[0] + (b.front[1] - b.front[0]) * t - b.lip * cot60, mz = zr + (zl - zr) / 3;
    const own = new Stock(ID, [g]), my = own.top(side * .55, mz);
    own.dispose();
    const lug = hardwareBlock([side * .55, my + .01 - .004, mz], [.05, .02, .03]);
    eraModule(P, {owner: 'hull', sector: sectorOf('glacis_era', side), geometry: g, outward: [0, .7071, .7071], minDot: .5,
      name: `chevron band ${i + 1}`, hardware: [lug], guard: (nm, geo) => assertHullPart(ID, nm, geo)});
  });
}

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
    const knuckles = APRON.knuckles.map(line), segs = P.q ? 12 : 8;
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

/** Hetman II's hull front: called in the Hetman II kit after its hull package. */
export function hetmanIIGlacis(P: TankBuilderPort): void {
  const core: THREE.BufferGeometry[] = [];
  P.forEachBucketPart(['hull'], g => core.push(g));
  const hull = new Stock(P.spec.id, core);
  try {
    const glacisAt = (z: number) => hull.top(0, z);
    sillSegments(P, glacisAt);
    ledBars(P);
    railsAndKeel(P, glacisAt);
    chevronBands(P, glacisAt);
    aprons(P, hull);
    bowModules(P);
  } finally { hull.dispose(); }
}
