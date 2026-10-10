// src/world/maps/regional/container.ts — shipping containers (the facades lane, 2026-10-08; docs/DESTRUCTION.md §16.3; the
// coordinator's order of work: compounds, then containers, then ruins).
//
// A row of ISO containers (the base kit's containerRow on Foundry, the rail yard and the airfield) is a set of closed
// steel boxes, one or two high, each in its own livery and a little off square. Its anatomy (damage.ts
// describeContainers) is the sim's box round the row. The builders here find the container a blow reaches and break that
// box the way the sheet kit breaks a hall's skin (sheet.ts), with no frame behind it, never a hole in the air between two
// boxes:
// - a breach: the corrugated side torn back round the hole and curled in, the dark hold behind it;
// - the damaged stage: shot holes through two of the boxes;
// - a wall section's fall: every container standing on that side torn open along it, one wide hole each;
// - the collapse: the boxes crushed and thrown. A lower container's roof caves and its sides buckle; an upper one tips
//   off the stack and lies on its side or canted against it; a door lies off its hinges; torn sheet is strewn round.
// The pieces are drawn in the vertex-coloured structure steel in each box's own livery (the containers' atlas is laid
// out for whole boxes, never for torn ones).
import type { BufferGeometry } from 'three';
import {
  damageRng,
  type BreachSpec, type DamageFace, type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type FaceName,
  type FractureSlot, type Rgb, type StructureDamageAnatomy, type Vec3,
} from '../../destructionKit.ts';
import { Mesh, cross3, norm3, type MoundHeight } from './fracture.ts';
import { breachSheet, crumpledSheet } from './sheet.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };

/** A shipping container read off its parts: its centre, its long axis (horizontal), its half length, height and width, its livery. */
interface ContainerBox {
  c: Vec3;
  a: Vec3;
  hl: number;
  hh: number;
  hw: number;
  tint: Rgb;
  /** it stands on another (its floor more than a metre up) */
  up: boolean;
}

/** The buckets a container's body is built in (the base kit's steel atlas, the light kit's structure steel, a baked model). */
const CONTAINER_BUCKETS: readonly string[] = ['steel', 'structureMetal', 'baked'];
/** The steel the torn and crushed pieces are drawn in: vertex-coloured, the corrugation in its detail tile. */
const SHEET_BUCKET = 'structureMetal';

/**
 * The containers among a structure's parts: every closed box of a few faces whose extents along its own axes are an ISO
 * container's (20 or 40 ft long, 8 ft wide, 8.5-9.5 ft high, give or take its build), its long axis the longer of the
 * two horizontal ones a face normal gives, its livery the mean of its vertex colours. Null when there is none.
 */
export function readContainers(parts: Readonly<Record<string, readonly BufferGeometry[]>>): ContainerBox[] | null {
  const out: ContainerBox[] = [];
  for (const bucket of CONTAINER_BUCKETS) for (const g of parts[bucket] ?? []) {
    const pos = g.getAttribute('position'), nor = g.getAttribute('normal');
    if (!pos || !nor || pos.count < 8 || pos.count > 48) continue;
    let ax = 0, az = 0;
    for (let i = 0; i < nor.count; i++) {
      const nx = nor.getX(i), ny = nor.getY(i), nz = nor.getZ(i);
      if (Math.abs(ny) < 0.2 && Math.hypot(nx, nz) > 0.8) { ax = nx; az = nz; break; }
    }
    const l = Math.hypot(ax, az);
    if (l < 0.5) continue;
    ax /= l; az /= l;
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const pa = x * ax + z * az, pb = -x * az + z * ax;
      a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); b0 = Math.min(b0, pb); b1 = Math.max(b1, pb); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const la = a1 - a0, lb = b1 - b0, h = y1 - y0;
    const long = lb > la;
    const hl = (long ? lb : la) / 2, hw = (long ? la : lb) / 2;
    if (hl * 2 < 5.4 || hl * 2 > 12.9 || hw * 2 < 2.1 || hw * 2 > 2.8 || h < 2.2 || h > 3.1) continue;
    const ca = (a0 + a1) / 2, cb = (b0 + b1) / 2;
    const col = g.getAttribute('color');
    let tint: Rgb = [0.42, 0.4, 0.37];
    if (col && col.count) {
      let r = 0, gg = 0, b = 0;
      for (let i = 0; i < col.count; i++) { r += col.getX(i); gg += col.getY(i); b += col.getZ(i); }
      tint = [r / col.count, gg / col.count, b / col.count];
    }
    const c: Vec3 = [ca * ax - cb * az, (y0 + y1) / 2, ca * az + cb * ax];
    // (dcore 2026-10-09, wave 294a: "re-emerges as one clean, square, grey-white corrugated block") a box whose livery
    // is its atlas's (white vertex colours) or that has none would crush in plain grey-white steel: it takes a livery of
    // the yard's own instead, picked by its place (the same on every peer)
    // (wave 322: "a container swapped for a grey gridded block") a neutral grey livery too: the atlas carries the paint
    if (!col || Math.max(tint[0], tint[1], tint[2]) - Math.min(tint[0], tint[1], tint[2]) < 0.06) tint = LIVERIES[liveryIndex(c)];
    out.push({ c, a: long ? [-az, 0, ax] : [ax, 0, az], hl, hh: h / 2, hw, tint, up: y0 > 1 });
  }
  return out.length ? out : null;
}

/** Shipping liveries (linear): line blue, rust red, green, orange, slate, ochre, maroon, grey-green. */
const LIVERIES: readonly Rgb[] = [
  [0.07, 0.19, 0.39], [0.25, 0.045, 0.024], [0.05, 0.15, 0.042], [0.53, 0.14, 0.024], [0.11, 0.15, 0.17],
  [0.48, 0.29, 0.042], [0.16, 0.024, 0.024], [0.13, 0.17, 0.11],
];
function liveryIndex(c: Vec3): number {
  let h = 0x811c9dc5;
  for (const v of [Math.round(c[0] * 10), Math.round(c[1] * 10), Math.round(c[2] * 10)]) { h ^= v & 0xffff; h = Math.imul(h, 0x01000193); h ^= v >>> 16; h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % LIVERIES.length;
}

export function containersOf(anatomy: StructureDamageAnatomy): readonly ContainerBox[] | null {
  const k = anatomy.kitPlan as { damage?: { containers?: readonly ContainerBox[] } } | undefined;
  return k?.damage?.containers ?? null;
}

/** Across a box: its horizontal axis at a right angle to the long one (front's out: u × out points down, as house.ts). */
const across = (b: ContainerBox): Vec3 => [-b.a[2], 0, b.a[0]];
const add = (p: Vec3, q: Vec3, k: number): Vec3 => [p[0] + q[0] * k, p[1] + q[1] * k, p[2] + q[2] * k];
const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];

/** A container as an anatomy of its own: one storey, its four sides in its sheet (for the sheet kit's breach, frameless). */
function boxAnatomy(anatomy: StructureDamageAnatomy, b: ContainerBox): StructureDamageAnatomy {
  const w = across(b), y0 = b.c[1] - b.hh, h = 2 * b.hh;
  const sheet: FractureSlot = { material: 'metal', bucket: SHEET_BUCKET, tint: b.tint, thicknessM: 0.03, share: 1 };
  const base: Vec3 = [b.c[0], y0, b.c[2]];
  const sides: ReadonlyArray<{ name: FaceName; u: Vec3; out: Vec3; width: number; origin: Vec3 }> = [
    { name: 'front', u: b.a, out: w, width: 2 * b.hl, origin: add(base, w, b.hw) },
    { name: 'right', u: neg(w), out: b.a, width: 2 * b.hw, origin: add(base, b.a, b.hl) },
    { name: 'back', u: neg(b.a), out: neg(w), width: 2 * b.hl, origin: add(base, w, -b.hw) },
    { name: 'left', u: w, out: neg(b.a), width: 2 * b.hw, origin: add(base, b.a, -b.hl) },
  ];
  const faces: DamageFace[] = sides.map((s, f) => ({
    name: s.name, section: f, u: s.u, out: s.out, origin: s.origin, width: s.width, height: h,
    bucket: SHEET_BUCKET, layers: [{ ...sheet }], openings: [], members: [], masonry: null,
  }));
  return {
    ...anatomy, w: 2 * b.hl, d: 2 * b.hw, h: y0 + h, plinth: null, roof: null, chimneys: [],
    storeys: [{ index: 0, y0, y1: y0 + h, jetty: [0, 0, 0, 0], framed: false, faces, floor: null }],
    interior: { color: anatomy.interior.color, open: false },
    kitPlan: { damage: { kind: 'house-damage', surfaces: new Map(), frameless: true } },
  };
}

/** The first container a ray from `p` along the horizontal `d` enters: the box, the side it enters by, the point. */
function rayBox(boxes: readonly ContainerBox[], p: Vec3, d: Vec3, maxT: number): { box: ContainerBox; side: number; at: Vec3 } | null {
  let best: { box: ContainerBox; side: number; at: Vec3 } | null = null, bestT = maxT;
  for (const b of boxes) {
    if (p[1] < b.c[1] - b.hh + 0.1 || p[1] > b.c[1] + b.hh - 0.1) continue;
    const w = across(b), rx = p[0] - b.c[0], rz = p[2] - b.c[2];
    // the slabs along the box's own axes; the side it enters by is the one whose slab bound the entry last
    const slabs: ReadonlyArray<[number, number, number, number, number]> = [
      [rx * b.a[0] + rz * b.a[2], d[0] * b.a[0] + d[2] * b.a[2], b.hl, 3, 1],
      [rx * w[0] + rz * w[2], d[0] * w[0] + d[2] * w[2], b.hw, 2, 0],
    ];
    let t0 = -Infinity, t1 = Infinity, enter = -1;
    for (const [o, v, half, minus, plus] of slabs) {
      if (Math.abs(v) < 1e-9) { if (Math.abs(o) > half) { t0 = Infinity; break; } continue; }
      const ta = (-half - o) / v, tb = (half - o) / v, near = Math.min(ta, tb), far = Math.max(ta, tb);
      if (near > t0) { t0 = near; enter = v > 0 ? minus : plus; }
      t1 = Math.min(t1, far);
    }
    if (t0 > t1 || t1 < 0 || enter < 0) continue;
    const t = Math.max(0, t0);
    if (t < bestT) { bestT = t; best = { box: b, side: enter, at: [p[0] + d[0] * t, p[1], p[2] + d[2] * t] }; }
  }
  return best;
}

/** A hole on a container's side where the ray from the row's face struck it, sized to the side. */
function boxHole(anatomy: StructureDamageAnatomy, hole: BreachSpec, boxes: readonly ContainerBox[]): { proxy: StructureDamageAnatomy; spec: BreachSpec } | null {
  const st = anatomy.storeys[hole.storey], f = st?.faces.find((x) => x.section === hole.section);
  if (!st || !f) return null;
  const p: Vec3 = [f.origin[0] + f.u[0] * hole.u + f.out[0] * 0.3, st.y0 + hole.y, f.origin[2] + f.u[2] * hole.u + f.out[2] * 0.3];
  const hit = rayBox(boxes, p, [-f.out[0], 0, -f.out[2]], Math.max(anatomy.w, anatomy.d) + 1);
  if (!hit) return null;
  const proxy = boxAnatomy(anatomy, hit.box), cf = proxy.storeys[0].faces[hit.side];
  const u = (hit.at[0] - cf.origin[0]) * cf.u[0] + (hit.at[2] - cf.origin[2]) * cf.u[2];
  const y = hit.at[1] - cf.origin[1];
  const r = Math.min(hole.radiusM, cf.width / 2 - 0.2, cf.height / 2 - 0.12);
  if (r < 0.12) return null;
  return {
    proxy,
    spec: { ...hole, section: cf.section, storey: 0, face: cf.name, u: Math.max(-cf.width / 2 + r + 0.1, Math.min(cf.width / 2 - r - 0.1, u)),
      y: Math.max(r + 0.1, Math.min(cf.height - r - 0.1, y)), radiusM: r },
  };
}

/** A breach in a row of containers: on the box the blow reaches, its sheet torn round the hole, the hold dark behind. */
export function breachContainers(anatomy: StructureDamageAnatomy, hole: BreachSpec, out: Writers): DamageStageResult {
  const boxes = containersOf(anatomy);
  const hit = boxes && boxHole(anatomy, hole, boxes);
  return hit ? breachSheet(hit.proxy, hit.spec, out) : { cuts: [], hides: [] };
}

/** The damaged stage on a row: two or three shot holes through two of its boxes. */
export function damagedContainers(anatomy: StructureDamageAnatomy, seed: number, out: Writers): DamageStageResult {
  const boxes = containersOf(anatomy) ?? [];
  const rng = damageRng(seed);
  const cuts: DamageStageResult['cuts'] = [];
  for (let k = 0; k < Math.min(2, boxes.length); k++) {
    const proxy = boxAnatomy(anatomy, boxes[Math.floor(rng() * boxes.length)]);
    for (let s = 0; s < 1 + Math.floor(rng() * 2); s++) {
      const f = proxy.storeys[0].faces[Math.floor(rng() * 4)], r = 0.14 + rng() * 0.12;
      if (f.width < 2 * r + 0.6) continue;
      cuts.push(...breachSheet(proxy, { section: f.section, storey: 0, face: f.name, hole: 200 + s, u: (rng() - 0.5) * (f.width - 2 * r - 0.5),
        y: r + 0.3 + rng() * Math.max(0, f.height - 2 * r - 0.6), radiusM: r, dirX: -f.out[0], dirZ: -f.out[2], munition: null, cause: 'kinetic',
        seed: Math.floor(rng() * 0x7fffffff) }, out).cuts);
    }
  }
  return { cuts, hides: [] };
}

/**
 * A row's wall section falls: every container standing on that side, within a metre and a half of the row's face and in
 * the band, torn open along it (one wide hole a box, through its merged side).
 */
export function sectionDownContainers(anatomy: StructureDamageAnatomy, section: number, seed: number, out: Writers): DamageStageResult {
  const boxes = containersOf(anatomy) ?? [];
  const st = anatomy.storeys[Math.floor(section / 4)], f = st?.faces.find((x) => x.section === section);
  if (!st || !f) return { cuts: [], hides: [] };
  const rng = damageRng(seed);
  const cuts: DamageStageResult['cuts'] = [];
  const plane = f.origin[0] * f.out[0] + f.origin[2] * f.out[2];
  for (const b of boxes) {
    if (b.c[1] + b.hh < st.y0 + 0.5 || b.c[1] - b.hh > st.y1 - 0.5) continue;
    const proxy = boxAnatomy(anatomy, b);
    // the box's side facing the row's face the most
    let side = 0, best = -Infinity;
    proxy.storeys[0].faces.forEach((cf, k) => { const dot = cf.out[0] * f.out[0] + cf.out[2] * f.out[2]; if (dot > best) { best = dot; side = k; } });
    const cf = proxy.storeys[0].faces[side];
    if (best < 0.7 || plane - (cf.origin[0] * f.out[0] + cf.origin[2] * f.out[2]) > 1.5) continue;
    const r = Math.min(cf.width / 2 - 0.3, cf.height / 2 - 0.12);
    if (r < 0.4) continue;
    cuts.push(...breachSheet(proxy, { section: cf.section, storey: 0, face: cf.name, hole: 255, u: (rng() - 0.5) * Math.max(0, cf.width - 2 * r - 0.6),
      y: cf.height / 2, radiusM: r, dirX: -f.out[0], dirZ: -f.out[2], munition: null, cause: 'blast', seed: Math.floor(rng() * 0x7fffffff) }, out).cuts);
  }
  return { cuts, hides: [] };
}

/** A quad of steel sheet with its outward normal from its winding (a → b → c → d counter-clockwise seen from outside). */
function steelQuad(mesh: Mesh, a: Vec3, b: Vec3, c: Vec3, d: Vec3, tint: Rgb, shade: number): void {
  const n = norm3(cross3([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [d[0] - a[0], d[1] - a[1], d[2] - a[2]]));
  if (!Number.isFinite(n[0])) return;
  const k = shade * (0.78 + 0.22 * Math.max(0, n[1]));
  mesh.quadUvAlong(a, b, c, d, n, 0, [tint[0] * k, tint[1] * k, tint[2] * k]);
}

/**
 * A container as a deformed box: `corner(i, j, k)` gives its corner at (±1 along, ±1 across, 0 floor / 1 roof), each side
 * laid as a 2 x 2 grid whose middle point `bulge` pushes out along the side's normal (a buckled panel); counter-clockwise
 * seen from outside.
 */
function deformedBox(mesh: Mesh, corner: (i: number, j: number, k: number) => Vec3, bulge: number, sag: number, tint: Rgb): void {
  const mid = (p: Vec3, q: Vec3): Vec3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];
  const centre = (ps: Vec3[]): Vec3 => [ps.reduce((s, p) => s + p[0], 0) / ps.length, ps.reduce((s, p) => s + p[1], 0) / ps.length, ps.reduce((s, p) => s + p[2], 0) / ps.length];
  const panel = (p00: Vec3, p10: Vec3, p11: Vec3, p01: Vec3, push: number, down: number, shade: number) => {
    const n = norm3(cross3([p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]], [p01[0] - p00[0], p01[1] - p00[1], p01[2] - p00[2]]));
    if (!Number.isFinite(n[0])) return;
    const m = centre([p00, p10, p11, p01]);
    const c: Vec3 = [m[0] + n[0] * push, m[1] + n[1] * push - down, m[2] + n[2] * push];
    const e0 = mid(p00, p10), e1 = mid(p10, p11), e2 = mid(p11, p01), e3 = mid(p01, p00);
    steelQuad(mesh, p00, e0, c, e3, tint, shade);
    steelQuad(mesh, e0, p10, e1, c, tint, shade);
    steelQuad(mesh, c, e1, p11, e2, tint, shade);
    steelQuad(mesh, e3, c, e2, p01, tint, shade);
  };
  const C = corner;
  // the sides (the long ones buckle most), the ends, the roof (caved at its middle)
  panel(C(-1, 1, 0), C(1, 1, 0), C(1, 1, 1), C(-1, 1, 1), bulge, 0, 0.92);
  panel(C(1, -1, 0), C(-1, -1, 0), C(-1, -1, 1), C(1, -1, 1), bulge * 0.8, 0, 0.92);
  panel(C(1, 1, 0), C(1, -1, 0), C(1, -1, 1), C(1, 1, 1), bulge * 0.4, 0, 0.85);
  panel(C(-1, -1, 0), C(-1, 1, 0), C(-1, 1, 1), C(-1, -1, 1), bulge * 0.4, 0, 0.85);
  panel(C(-1, -1, 1), C(-1, 1, 1), C(1, 1, 1), C(1, -1, 1), 0, sag, 1);
}

/**
 * A row comes down: each lower container crushed where it stood (its roof caved by a third to a half, lower at one end,
 * its sides buckled out), each upper one tipped off the stack (on its side beside it or canted against it), a door off
 * its hinges at a few ends, torn sheet strewn round, all over the sim's mound (which raises the terrain itself).
 */
export function collapseContainers(anatomy: StructureDamageAnatomy, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const boxes = containersOf(anatomy) ?? [];
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const ground = (x: number, z: number): number => mound(x, z) + 0.02;
  if (mesh.begin(SHEET_BUCKET, 'rubble')) {
    for (const b of boxes) {
      const w = across(b);
      if (!b.up) {
        // crushed where it stood: the roof down by a third to a half (one end lower), skewed a little along the blow
        // (dcore 2026-10-09, wave 322: "a container swapped for a clean grey gridded block") crushed hard enough to read
        // from the ground: the roof down by a half to two thirds at one end, the box skewed and leaning
        const crushA = 0.45 + rng() * 0.2, crushB = 0.55 + rng() * 0.15, skew = (rng() - 0.5) * 0.8, lean = (rng() - 0.5) * 0.7;
        const corner = (i: number, j: number, k: number): Vec3 => {
          const along = i * b.hl * (0.98 + rng() * 0.02), side = j * b.hw;
          const x = b.c[0] + b.a[0] * along + w[0] * side, z = b.c[2] + b.a[2] * along + w[2] * side;
          if (!k) return [x, ground(x, z), z];
          const drop = (i < 0 ? crushA : crushB) * 2 * b.hh;
          return [x + b.a[0] * skew + w[0] * lean, ground(x, z) + 2 * b.hh - drop, z + b.a[2] * skew + w[2] * lean];
        };
        // its sides buckled out a hand to two, its paint dulled by the dust and scorched where it split
        const dull: Rgb = [b.tint[0] * 0.72, b.tint[1] * 0.68, b.tint[2] * 0.64];
        deformedBox(mesh, corner, 0.3 + rng() * 0.25, 0.35 + rng() * 0.3, dull);
      } else {
        // tipped off the stack: rolled onto its side beside it, or canted on the ground there, and turned a little. Its
        // cross-section (across, up) turns about its long axis (a rotation keeps every side's winding outward), then sits
        // on the ground with its near edge at the stack's side
        const toSide = rng() < 0.55, dir = rng() < 0.5 ? 1 : -1, turn = (rng() - 0.5) * 0.4;
        const ca = Math.cos(turn), sa = Math.sin(turn);
        const a2: Vec3 = [b.a[0] * ca - w[0] * sa, 0, b.a[2] * ca - w[2] * sa], w2: Vec3 = [-a2[2], 0, a2[0]];
        const th = -dir * (toSide ? (Math.PI / 2) * (0.95 + rng() * 0.1) : 0.3 + rng() * 0.3);
        const ct = Math.cos(th), st = Math.sin(th);
        const rot = (sx: number, uy: number): [number, number] => [sx * ct - uy * st, sx * st + uy * ct];
        const cs = [rot(-b.hw, 0), rot(b.hw, 0), rot(-b.hw, 2 * b.hh), rot(b.hw, 2 * b.hh)];
        const minU = Math.min(...cs.map((q) => q[1])), near = dir > 0 ? Math.min(...cs.map((q) => q[0])) : Math.max(...cs.map((q) => q[0]));
        const shift = dir * (b.hw + 0.15) - near;
        const corner = (i: number, j: number, k: number): Vec3 => {
          const [s2, u2] = rot(j * b.hw, k * 2 * b.hh);
          const hx = s2 + shift;
          const x = b.c[0] + a2[0] * i * b.hl + w2[0] * hx, z = b.c[2] + a2[2] * i * b.hl + w2[2] * hx;
          return [x, ground(x, z) + (u2 - minU), z];
        };
        // (wave 326: the tipped box read as "a clean grey gridded block" — it fell a storey) buckled and caved where it
        // landed, dulled by the dust
        const dull: Rgb = [b.tint[0] * 0.7, b.tint[1] * 0.66, b.tint[2] * 0.62];
        deformedBox(mesh, corner, 0.22 + rng() * 0.2, 0.3 + rng() * 0.3, dull);
      }
    }
  }
  // a door off its hinges at a few ends, lying flat or propped; torn sheet strewn round
  const door = (b: ContainerBox) => {
    const end = rng() < 0.5 ? 1 : -1, w = across(b);
    const x = b.c[0] + b.a[0] * end * (b.hl + 0.9 + rng() * 0.8) + w[0] * (rng() - 0.5) * 1.5;
    const z = b.c[2] + b.a[2] * end * (b.hl + 0.9 + rng() * 0.8) + w[2] * (rng() - 0.5) * 1.5;
    const yaw = rng() * Math.PI, c = Math.cos(yaw), s = Math.sin(yaw), hx = 0.58, hz = 1.2, lift = rng() < 0.4 ? 0.5 + rng() * 0.5 : 0;
    const P = (u: number, v: number): Vec3 => {
      const px = x + c * u * hx - s * v * hz, pz = z + s * u * hx + c * v * hz;
      return [px, ground(px, pz) + 0.03 + (v > 0 ? lift : 0), pz];
    };
    steelQuad(mesh, P(-1, -1), P(-1, 1), P(1, 1), P(1, -1), b.tint, 0.9);
  };
  if (mesh.begin(SHEET_BUCKET, 'rubble')) {
    for (const b of boxes) {
      if (rng() < 0.45) door(b);
      for (let k = 0; k < 1 + Math.floor(rng() * 2); k++) {
        const th = rng() * Math.PI * 2, rr = Math.max(b.hl, b.hw) + 0.6 + rng() * 2;
        const ox = b.c[0] + Math.cos(th) * rr, oz = b.c[2] + Math.sin(th) * rr, dth = th + (rng() - 0.5) * 1.2;
        crumpledSheet(mesh, rng, [ox, 0, oz], [Math.cos(dth), 0, Math.sin(dth)], 0.6 + rng() * 0.5, 1.2 + rng() * 1.4, 3, ground, b.tint);
      }
    }
  }
  mesh.end();
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}
