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
import {
  damageRng,
  type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type Rgb, type StructureDamageAnatomy, type StructureDescribeInput, type Vec3,
} from '../../destructionKit.ts';
import { HEAP_LIFT_M, Mesh, beamBetween, throwPieceAt, type MoundHeight } from './fracture.ts';
import { rgb } from './geometry.ts';
import type { RegionalKitPlan } from './index.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };

/** The hogan as navajo.ts builds it: its octagon's radius (corners) and the numbers its walls are laid from. */
interface HoganWreck { kind: 'hogan'; r: number; foot: number; pitch: number; logR: number; t: number; tints: RegionalKitPlan['tints'] }

const OCT = Math.PI / 4;
const JUNIPER: readonly Rgb[] = [0x6e5a44, 0x5f4d3a, 0x7a644a].map(rgb);
const mulK = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

/**
 * Tag a described anatomy whose build has a wreck of its own (a Navajo hogan: the kit's 'adobe' builder), so the
 * collapse lays that instead of the reading's slump. The anatomy is returned as it was otherwise.
 */
export function authoredOf(input: StructureDescribeInput, anatomy: StructureDamageAnatomy | null): StructureDamageAnatomy | null {
  const plan = input.kitPlan as RegionalKitPlan | undefined;
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
  const w = (anatomy.kitPlan as { authored?: HoganWreck } | undefined)?.authored;
  return w?.kind === 'hogan' ? collapseHogan(w, seed, out, mound) : null;
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
