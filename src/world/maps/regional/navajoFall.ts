// src/world/maps/regional/navajoFall.ts — how a hogan comes down (the looks lane, 2026-10-16; WORKLIST #26, the
// courtyard family's Destroyed line: "hogan from hoganBody({fallen:true}); ramada posts snap and drop the bough mat").
//
// A hogan (navajo.ts hoganBody: eight walls of juniper logs laid in their mud chinking on a sandstone footing, the
// cribbed roof of two rings of logs under its earth) was read as any shell and fell as adobe: one slumped heap. Its own
// wreck is the fallen hogan the ruin plot builds (hoganBody's `fallen`): the footing standing, each wall broken to a
// ragged stump of its lowest courses (the chinking's core and the logs on it), the cribbing logs down across the floor
// and against the stumps, the roof's earth fallen in on them in clods; a few logs and clods thrown. The damage kit
// (damage.ts) tags the anatomy it reads for a hogan (authoredOf) and hands the collapse here (authoredCollapse).
// Deterministic in the seed; the hogan's own buckets and its kit's tints. The ramada needs nothing here: it records
// itself as an open shed (shedFall.ts recordShed) and falls as one.
//
// The windmill (navajoR2.ts windmill; the r2 sweep fix b-west 2026-10-16: it folded flat at its feet as any lattice,
// latticeFall.ts, and stood 19 % of its height) buckles where a struck tower of angle legs gives: at its second girt.
// Its two lower panels stand with their girts and X rods, the legs' heads bent over toward the fall; the tower above
// folds over from there, its legs down from the buckle to the ground and kinked where they struck, its upper girts and
// rods among them; the cast head on its side at the fold's end, the wheel dished and propped on it with its sails
// sprung, the tail vane flat beside it.
import {
  damageRng,
  type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type Rgb, type StructureDamageAnatomy, type StructureDescribeInput, type Vec3,
} from '../../destructionKit.ts';
import { HEAP_LIFT_M, Mesh, beamBetween, throwPieceAt, type MoundHeight } from './fracture.ts';
import { rgb } from './geometry.ts';
import type { RegionalKitPlan } from './index.ts';
import type { LatticeReading } from './lattice.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };

/** The hogan as navajo.ts builds it: its octagon's radius (corners) and the numbers its walls are laid from. */
interface HoganWreck { kind: 'hogan'; r: number; foot: number; pitch: number; logR: number; t: number; tints: RegionalKitPlan['tints'] }
/** The windmill as navajoR2.ts builds it: its tower the lattice it recorded, buckling at `stand` (its second girt). */
interface WindmillWreck { kind: 'windmill'; stand: number }

const OCT = Math.PI / 4;
const JUNIPER: readonly Rgb[] = [0x6e5a44, 0x5f4d3a, 0x7a644a].map(rgb);
const mulK = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/**
 * Tag a described anatomy whose build has a wreck of its own (a Navajo hogan: the kit's 'adobe' builder), so the
 * collapse lays that instead of the reading's slump. The anatomy is returned as it was otherwise.
 */
export function authoredOf(input: StructureDescribeInput, anatomy: StructureDamageAnatomy | null): StructureDamageAnatomy | null {
  const plan = input.kitPlan as RegionalKitPlan | undefined;
  if (plan?.kind === 'regional-house' && plan.style === 'navajo' && plan.builder === 'watertower') {
    // (the windmill: the lattice reading describes it; its tower buckles at the second girt instead of folding at its feet)
    const lat = (anatomy?.kitPlan as { damage?: { lattice?: LatticeReading } } | undefined)?.damage?.lattice;
    if (anatomy && lat && lat.girts.length >= 3) (anatomy.kitPlan as { authored?: WindmillWreck }).authored = { kind: 'windmill', stand: lat.girts[1] };
    return anatomy;
  }
  if (!plan || plan.kind !== 'regional-house' || plan.style !== 'navajo' || plan.builder !== 'adobe') return anatomy;
  // (navajo.ts hogan: the radius from the plot as it builds it; the sides face k x 45 degrees, navajo.ts octSide)
  const span = Math.min(plan.info.w, plan.info.d) - 0.6;
  const r = Math.max(2.4, Math.min(3.25, span / (2 * Math.cos(OCT / 2)) - 0.12));
  const wreck: HoganWreck = { kind: 'hogan', r, foot: 0.22, pitch: 0.255, logR: 0.135, t: 0.26, tints: plan.tints };
  const a = anatomy ?? hoganAnatomy(input, plan, wreck);
  (a.kitPlan as { authored?: HoganWreck }).authored = wreck;
  return a;
}

/**
 * The hogan's anatomy (no reading takes an octagon of logs: the core's default box would read it): its one storey's four
 * faces the octagon's four axis sides at their apothem, each its side's length, the logs over their mud chinking as the
 * wall's layers, the doorway on the side it faces when that is one of them; no roof of its own (the cribbing and the
 * earth fall with the collapse); the rubble its earth and logs.
 */
function hoganAnatomy(input: StructureDescribeInput, plan: RegionalKitPlan, h: HoganWreck): StructureDamageAnatomy {
  const A = h.r * Math.cos(OCT / 2), L = 2 * A * Math.tan(OCT / 2), wallTop = h.foot + 8 * h.pitch + h.pitch / 2;
  const mud: Rgb = plan.tints.plaster2 ?? [0.85, 0.85, 0.85], logs: Rgb = JUNIPER[0];
  const layers = [
    { material: 'timber' as const, bucket: 'structureWood', tint: logs, thicknessM: h.logR * 2, share: 0.7 },
    { material: 'adobe' as const, bucket: 'regionalPlaster2', tint: mud, thicknessM: h.t, share: 0.3 },
  ];
  // the doorway's side (navajo.ts eastSide: the side nearest the world's east), when it is an axis side
  const yaw = input.placement?.yaw ?? Math.PI / 2, door = ((Math.round(yaw / OCT) % 8) + 8) % 8;
  const SIDES = [
    { name: 'right' as const, k: 0, origin: [A, h.foot, 0] as Vec3, u: [0, 0, -1] as Vec3, out: [1, 0, 0] as Vec3 },
    { name: 'front' as const, k: 2, origin: [0, h.foot, A] as Vec3, u: [1, 0, 0] as Vec3, out: [0, 0, 1] as Vec3 },
    { name: 'left' as const, k: 4, origin: [-A, h.foot, 0] as Vec3, u: [0, 0, 1] as Vec3, out: [-1, 0, 0] as Vec3 },
    { name: 'back' as const, k: 6, origin: [0, h.foot, -A] as Vec3, u: [-1, 0, 0] as Vec3, out: [0, 0, -1] as Vec3 },
  ];
  const order = ['front', 'right', 'back', 'left'] as const;
  const faces = order.map((name, section) => {
    const s = SIDES.find((q) => q.name === name)!;
    return { name, section, origin: s.origin, u: s.u, out: s.out, width: L, height: wallTop - h.foot, bucket: 'structureWood', layers: layers.map((l) => ({ ...l })),
      openings: s.k === door ? [{ kind: 'door' as const, u: 0, w: 0.88, y0: 0, h: 1.7, reveal: h.t }] : [], members: [], masonry: null };
  });
  return {
    structureIdx: input.structureIdx, kit: 'navajo', seed: input.seed, massClass: input.massClass, placement: input.placement,
    w: 2 * A + 0.12, d: 2 * A + 0.12, h: wallTop + 1.3, plinth: null,
    storeys: [{ index: 0, y0: h.foot, y1: wallTop, jetty: [0, 0, 0, 0], framed: false, faces, floor: null }], roof: null, chimneys: [],
    interior: { color: [0.032, 0.028, 0.025], open: false },
    rubble: [{ material: 'adobe', bucket: 'regionalPlaster2', tint: mud, thicknessM: 0.3, share: 0.65 }, { material: 'timber', bucket: 'structureWood', tint: logs, thicknessM: 0.27, share: 0.35 }],
    remnant: { stubHeightM: 0.6, corners: false, chimneys: false },
    kitPlan: { regional: plan, damage: { kind: 'house-damage', surfaces: new Map() } },
  } as StructureDamageAnatomy;
}

/** The collapse of an anatomy authoredOf tagged, or null (the reading's own collapse lays it). */
export function authoredCollapse(anatomy: StructureDamageAnatomy, seed: number, out: Writers, mound: MoundHeight): DamageStageResult | null {
  const w = (anatomy.kitPlan as { authored?: HoganWreck | WindmillWreck } | undefined)?.authored;
  return w?.kind === 'hogan' ? collapseHogan(w, seed, out, mound) : w?.kind === 'windmill' ? collapseWindmill(anatomy, w, seed, out, mound) : null;
}

/** The fallen hogan (hoganBody's `fallen`, laid on the sim's heap): see the module's note. */
function collapseHogan(h: HoganWreck, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const A = h.r * Math.cos(OCT / 2), L = 2 * A * Math.tan(OCT / 2);
  const ground = (x: number, z: number): number => { const m = mound(x, z); return m + HEAP_LIFT_M * Math.max(0, Math.min(1, (m - 0.12) / 0.5)); };
  const stone: Rgb = h.tints.stone ?? [0.85, 0.85, 0.85], mud: Rgb = mulK(h.tints.plaster2 ?? [0.85, 0.85, 0.85], 0.92);
  /** an oriented box: centre, its yaw about y, half sizes along its own x (the wall's run), y and z (through it) */
  const box = (c: Vec3, yaw: number, hx: number, hy: number, hz: number, tint: Rgb, tilt = 0): void => {
    if (!mesh.fits(24)) return;
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const ux: Vec3 = [cy * ct, st, sy * ct], uy: Vec3 = [-cy * st, ct, -sy * st], uz: Vec3 = [-sy, 0, cy];
    const P = (a: number, b: number, e: number): Vec3 => [c[0] + ux[0] * a * hx + uy[0] * b * hy + uz[0] * e * hz, c[1] + ux[1] * a * hx + uy[1] * b * hy + uz[1] * e * hz,
      c[2] + ux[2] * a * hx + uy[2] * b * hy + uz[2] * e * hz];
    const neg = (v: Vec3): Vec3 => [-v[0], -v[1], -v[2]];
    const faces: Array<[Vec3, Vec3, Vec3, Vec3, Vec3]> = [
      [P(-1, 1, -1), P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), uy], [P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), neg(uy)],
      [P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), ux], [P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), neg(ux)],
      [P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), uz], [P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), P(1, -1, -1), neg(uz)],
    ];
    for (const [a, b, cc, d, n] of faces) mesh.quadUv(a, b, cc, d, n, 0.5, mulK(tint, 0.62 + 0.38 * Math.max(0, n[1])));
  };
  // the footing: its eight stones of sandstone standing as they were
  if (mesh.begin('regionalStone', 'remnant')) {
    for (let k = 0; k < 8; k++) {
      const a = k * OCT, yaw = a + Math.PI / 2;
      box([Math.cos(a) * (A + 0.03), (h.foot - 0.3) / 2, Math.sin(a) * (A + 0.03)], yaw, L / 2 + 0.06, (h.foot + 0.3) / 2, h.t / 2 + 0.06, mulK(stone, 0.9 + rng() * 0.15));
    }
  }
  // each wall's stump: the chinking's core to a ragged top, its lowest courses of logs on it, their ends past the corners
  const tops: number[] = [];
  if (mesh.begin('regionalPlaster2', 'remnant')) {
    for (let k = 0; k < 8; k++) {
      const a = k * OCT, yaw = a + Math.PI / 2, top = h.foot + 0.35 + rng() * 1.1;
      tops.push(top);
      const r = A - h.t / 2, c: Vec3 = [Math.cos(a) * r, (h.foot + top) / 2, Math.sin(a) * r];
      // (a ragged top: the stump in two lengths, the one end lower)
      box([c[0] - Math.cos(yaw) * L / 4, c[1], c[2] - Math.sin(yaw) * L / 4], yaw, L / 4 + 0.01, (top - h.foot) / 2, h.t / 2, mulK(mud, 0.95 + rng() * 0.1));
      const top2 = Math.max(h.foot + 0.2, top - 0.15 - rng() * 0.45);
      box([c[0] + Math.cos(yaw) * L / 4, (h.foot + top2) / 2, c[2] + Math.sin(yaw) * L / 4], yaw, L / 4 + 0.01, (top2 - h.foot) / 2, h.t / 2, mulK(mud, 0.95 + rng() * 0.1));
    }
  }
  if (mesh.begin('structureWood', 'remnant')) {
    for (let k = 0; k < 8; k++) {
      const a = k * OCT, yaw = a + Math.PI / 2, r = A + 0.02, n = Math.max(1, Math.floor((tops[k] - h.foot) / h.pitch));
      const ux = Math.cos(yaw), uz = Math.sin(yaw), cx = Math.cos(a) * r, cz = Math.sin(a) * r;
      for (let c = 0; c < n; c++) {
        const y = h.foot + h.logR + (k % 2) * h.pitch / 2 + c * h.pitch;
        if (y + h.logR > tops[k] + 0.02) break;
        const ext = 0.16 + rng() * 0.12, tint = mulK(JUNIPER[(k + c) % JUNIPER.length], 0.9 + rng() * 0.16);
        beamBetween(mesh, [cx - ux * (L / 2 + ext), y, cz - uz * (L / 2 + ext)], [cx + ux * (L / 2 + ext), y, cz + uz * (L / 2 + ext)], h.logR * 1.9, h.logR * 1.9, [0, 1, 0], tint);
      }
    }
  }
  // the roof's cribbing down: its logs across the floor and propped on the stumps, the earth fallen in over them
  if (mesh.begin('structureWood', 'rubble')) {
    for (let k = 0; k < 9; k++) {
      const a: [number, number, number] = [(rng() - 0.5) * A * 1.4, 0, (rng() - 0.5) * A * 1.4], yaw = rng() * Math.PI, len = A * (1.1 + rng() * 0.7);
      const b: [number, number, number] = [a[0] + Math.cos(yaw) * len, 0, a[2] + Math.sin(yaw) * len];
      a[1] = ground(a[0], a[2]) + 0.14;
      // a log reaching a stump rests on its head; the rest lie on the heap
      const rb = Math.hypot(b[0], b[2]), kb = ((Math.round(Math.atan2(b[2], b[0]) / OCT) % 8) + 8) % 8;
      b[1] = rb > A - 0.4 ? Math.max(ground(b[0], b[2]) + 0.14, (tops[kb] ?? h.foot) + 0.14) : ground(b[0], b[2]) + 0.14;
      beamBetween(mesh, a, b, h.logR * 1.8, h.logR * 1.8, [0, 1, 0], mulK(JUNIPER[k % JUNIPER.length], 0.85 + rng() * 0.15));
    }
  }
  if (mesh.begin('regionalPlaster2', 'rubble')) {
    for (let k = 0; k < 26; k++) {
      const ang = rng() * Math.PI * 2, d = Math.sqrt(rng()) * A * 0.95, x = Math.cos(ang) * d, z = Math.sin(ang) * d, s = 0.25 + rng() * 0.3;
      box([x, ground(x, z) + s * 0.4, z], rng() * Math.PI, s * 1.3, s * 0.45, s, mulK(mud, 0.82 + rng() * 0.25), (rng() - 0.5) * 0.4);
    }
  }
  mesh.end();
  // the throw: logs and clods out from the walls
  for (let i = 0; i < out.pieces.capacity; i++) {
    const a = rng() * Math.PI * 2, p: Vec3 = [Math.cos(a) * A * 0.8, 1.2 + rng(), Math.sin(a) * A * 0.8];
    const log = rng() < 0.5;
    if (!throwPieceAt(out.pieces, rng, log ? 'structureWood' : 'regionalPlaster2', log ? 'beam' : 'clod', p, log ? [0.12, 0.12, 0.8 + rng() * 0.8] : [0.2, 0.15, 0.2],
      log ? JUNIPER[i % JUNIPER.length] : mud, 3)) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}

/** The windmill buckled at its second girt (see the module's note), laid on the sim's heap. */
function collapseWindmill(anatomy: StructureDamageAnatomy, w: WindmillWreck, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const lat = (anatomy.kitPlan as { damage: { lattice: LatticeReading } }).damage.lattice;
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const given = (out as Writers & { fallAxis?: [number, number] }).fallAxis;
  const gl = given ? Math.hypot(given[0], given[1]) : 0, ang = rng() * Math.PI * 2;
  const axis: Vec3 = given && gl > 1e-3 ? [given[0] / gl, 0, given[1] / gl] : [Math.cos(ang), 0, Math.sin(ang)];
  const side: Vec3 = [-axis[2], 0, axis[0]];
  const ground = (x: number, z: number): number => { const m = mound(x, z); return m + HEAP_LIFT_M * Math.max(0, Math.min(1, (m - 0.12) / 0.5)); };
  const tint: Rgb = lat.colour ?? [0.6, 0.6, 0.6], dull = mulK(tint, 0.9), s = lat.size;
  const legs = lat.legs, y0 = Math.min(...legs.map((l) => l.foot[1]));
  const height = Math.max(...legs.map((l) => l.head[1] - l.foot[1]));
  const cx = legs.reduce((a, l) => a + l.foot[0], 0) / legs.length, cz = legs.reduce((a, l) => a + l.foot[2], 0) / legs.length;
  const stand = Math.max(y0 + 1.5, Math.min(w.stand, y0 + height * 0.5));
  const along = (l: { foot: Vec3; head: Vec3 }, y: number): Vec3 => {
    const t = (y - l.foot[1]) / Math.max(1e-6, l.head[1] - l.foot[1]);
    return [l.foot[0] + (l.head[0] - l.foot[0]) * t, y, l.foot[2] + (l.head[2] - l.foot[2]) * t];
  };
  // the buckle: each stub's head bent over toward the fall, the legs on the fall's side crushed a little lower
  const tops: Vec3[] = legs.map((l) => {
    const p = along(l, stand), lean = 0.15 + rng() * 0.2, lead = (p[0] - cx) * axis[0] + (p[2] - cz) * axis[2] > 0 ? 0.15 + rng() * 0.2 : 0;
    return [p[0] + axis[0] * lean, p[1] - lead, p[2] + axis[2] * lean];
  });
  const onStub = (k: number, y: number): Vec3 => {
    const f = legs[k].foot, t = tops[k], u = (y - f[1]) / Math.max(1e-6, t[1] - f[1]);
    return [f[0] + (t[0] - f[0]) * u, y, f[2] + (t[2] - f[2]) * u];
  };
  // (the legs in their laid order go round the frame: latticeFrame's corners)
  if (mesh.begin(lat.bucket, 'remnant')) {
    legs.forEach((l, k) => beamBetween(mesh, l.foot, tops[k], s, s, [0, 1, 0], tint));
    const low = Math.min(...tops.map((t) => t[1])) - 0.1;
    const levels = [y0 + 0.3, ...lat.girts.filter((g) => g < low)];
    for (let i = 1; i < levels.length; i++) for (let k = 0; k < 4; k++) {
      beamBetween(mesh, onStub(k, levels[i]), onStub((k + 1) % 4, levels[i]), s * 0.5, s * 0.5, [0, 1, 0], tint);
    }
    const panels = [...levels, low];
    for (let i = 0; i + 1 < panels.length; i++) for (let k = 0; k < 4; k++) {
      const j = (k + 1) % 4;
      beamBetween(mesh, onStub(k, panels[i]), onStub(j, panels[i + 1]), s * 0.3, s * 0.3, [0, 1, 0], dull);
      // (a rod of the top panel snapped at the buckle hangs short)
      if (i + 2 < panels.length || rng() < 0.5) beamBetween(mesh, onStub(j, panels[i]), onStub(k, panels[i + 1]), s * 0.3, s * 0.3, [0, 1, 0], dull);
    }
  }
  // the tower above the buckle folded over: each leg from its stub's head down along the fall, kinked where it struck,
  // the frame narrowing to its head as it stood
  const upper = height - (stand - y0);
  let reach = 0;
  if (mesh.begin(lat.bucket, 'rubble')) {
    for (const t of tops) {
      const drop = t[1] - ground(t[0], t[2]), run = Math.sqrt(Math.max(0.25, upper * upper * (0.9 + rng() * 0.08) - drop * drop));
      const yaw = (rng() - 0.5) * 0.25, d: Vec3 = [axis[0] * Math.cos(yaw) - axis[2] * Math.sin(yaw), 0, axis[0] * Math.sin(yaw) + axis[2] * Math.cos(yaw)];
      const lateral = (t[0] - cx) * side[0] + (t[2] - cz) * side[2];
      const e: [number, number, number] = [t[0] + d[0] * run - side[0] * lateral * 0.6, 0, t[2] + d[2] * run - side[2] * lateral * 0.6];
      e[1] = ground(e[0], e[2]) + s / 2;
      const m: [number, number, number] = [t[0] + (e[0] - t[0]) * 0.45, 0, t[2] + (e[2] - t[2]) * 0.45];
      m[1] = Math.max(ground(m[0], m[2]) + s / 2, t[1] * 0.55 + e[1] * 0.45 - 0.25 - rng() * 0.3);
      beamBetween(mesh, t, m, s, s, [0, 1, 0], tint);
      beamBetween(mesh, m, e, s, s, [0, 1, 0], tint);
      reach = Math.max(reach, (e[0] - cx) * axis[0] + (e[2] - cz) * axis[2]);
    }
    // the upper girts and rods among the folded legs, some across them
    for (let k = 0; k < 12; k++) {
      const t = 0.2 + rng() * 0.75, off = (rng() - 0.5) * 2.2, len = 0.8 + rng() * 1.6, yaw = rng() * Math.PI;
      const c: Vec3 = [cx + axis[0] * reach * t + side[0] * off, 0, cz + axis[2] * reach * t + side[2] * off];
      const h = (stand - y0) * Math.max(0, 1 - t * 1.6) * rng();
      const p0: Vec3 = [c[0] - Math.cos(yaw) * len / 2, 0, c[2] - Math.sin(yaw) * len / 2], p1: Vec3 = [c[0] + Math.cos(yaw) * len / 2, 0, c[2] + Math.sin(yaw) * len / 2];
      beamBetween(mesh, [p0[0], ground(p0[0], p0[2]) + s * 0.3 + h, p0[2]], [p1[0], ground(p1[0], p1[2]) + s * 0.3, p1[2]], s * 0.4, s * 0.4, [0, 1, 0], dull);
    }
  }
  // the cast head on its side at the fold's end, the wheel dished and propped on it with its sails sprung, the vane flat
  const crown = lat.crown, steel: Rgb = crown?.tint ?? tint;
  if (mesh.begin(crown?.bucket ?? lat.bucket, 'rubble')) {
    const hc: Vec3 = [cx + axis[0] * (reach + 0.4), 0, cz + axis[2] * (reach + 0.4)];
    const gy = ground(hc[0], hc[2]);
    beamBetween(mesh, [hc[0] - side[0] * 0.3, gy + 0.22, hc[2] - side[2] * 0.3], [hc[0] + side[0] * 0.3, gy + 0.22, hc[2] + side[2] * 0.3], 0.5, 0.44, axis, mulK(steel, 0.8));
    const R = crown ? Math.max(1.0, Math.min(1.7, (crown.x1 - crown.x0) / 2 * 0.95)) : 1.4, tilt = 0.45 + rng() * 0.3;
    const q: Vec3 = [axis[0] * Math.cos(tilt), Math.sin(tilt), axis[2] * Math.cos(tilt)];
    const wc: Vec3 = [hc[0] + axis[0] * (R * Math.cos(tilt) + 0.2), gy + R * Math.sin(tilt) + 0.04, hc[2] + axis[2] * (R * Math.cos(tilt) + 0.2)];
    const rim = (a: number, r: number): Vec3 => [wc[0] + side[0] * Math.cos(a) * r - q[0] * Math.sin(a) * r, wc[1] - q[1] * Math.sin(a) * r, wc[2] + side[2] * Math.cos(a) * r - q[2] * Math.sin(a) * r];
    const n: Vec3 = [-axis[0] * Math.sin(tilt), Math.cos(tilt), -axis[2] * Math.sin(tilt)];
    for (const r of [R, R * 0.5]) for (let k = 0; k < 12; k++) {
      // (a dent where it struck: the rim's lowest arc pressed in)
      const dent = (a: number) => r * (1 - 0.12 * Math.max(0, Math.sin(a)));
      const a0 = k / 12 * Math.PI * 2, a1 = (k + 1) / 12 * Math.PI * 2;
      beamBetween(mesh, rim(a0, dent(a0)), rim(a1, dent(a1)), 0.04, 0.04, n, steel);
    }
    for (let k = 0; k < 18; k++) {
      if (rng() < 0.3) continue;
      const a = k / 18 * Math.PI * 2 + (rng() - 0.5) * 0.1;
      beamBetween(mesh, rim(a, R * 0.5), rim(a, R * (0.95 - rng() * 0.1)), 0.17, 0.012, n, mulK(steel, 0.95 + (k % 2) * 0.08));
    }
    const vc: Vec3 = [hc[0] - axis[0] * 0.6 + side[0] * 1.2, 0, hc[2] - axis[2] * 0.6 + side[2] * 1.2];
    const vy = ground(vc[0], vc[2]) + 0.02;
    beamBetween(mesh, [vc[0] - axis[0] * 0.5, vy, vc[2] - axis[2] * 0.5], [vc[0] + axis[0] * 0.5, vy, vc[2] + axis[2] * 0.5], 1.0, 0.02, [0, 1, 0], rgb(0xd8d4c8));
  }
  mesh.end();
  // the throw: rods, plates and bolts down the line of the fall
  for (let i = 0; i < out.pieces.capacity; i++) {
    const t = rng(), p: Vec3 = [cx + axis[0] * reach * t + (rng() - 0.5) * 1.5, 0.5 + (1 - t) * stand * 0.5, cz + axis[2] * reach * t + (rng() - 0.5) * 1.5];
    if (!throwPieceAt(out.pieces, rng, lat.bucket, rng() < 0.7 ? 'beam' : 'sheet', p, [0.05 + rng() * 0.05, 0.05, 0.4 + rng() * 0.8], tint, 3)) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}
