// src/world/maps/regional/latticeFall.ts — how an open lattice comes down (props census #3, lane B 2026-10-14; the
// judges on the kit trestles, windmills, elevated tanks and radar towers: they "fall as solid metal drums 4.8 m across
// over a solid stump, not as their members").
//
// A lattice frame (lattice.ts latticeFrame, read back by damage.ts describeLattice) has no wall a round can hole: a
// blow passes through it. When it falls it folds over along the line it was struck from: each leg's foot stays a bent
// stub on its pad, the legs lie along the ground in the direction of the fall, the girts and braces lie scattered
// along them, and what stood on it (a tank, a wheel head, a radome) lies crumpled at the far end over a little scatter.
import {
  damageRng,
  type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type Rgb, type StructureDamageAnatomy, type Vec3,
} from '../../destructionKit.ts';
import { HEAP_LIFT_M, Mesh, beamBetween, bodyCentre, throwPieceAt, type MoundHeight } from './fracture.ts';
import type { LatticeReading } from './lattice.ts';
import { lyingDrum } from './shaft.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };
type P3 = [number, number, number];

export function latticeOf(anatomy: StructureDamageAnatomy): LatticeReading | null {
  const k = anatomy.kitPlan as { damage?: { lattice?: LatticeReading } } | undefined;
  return k?.damage?.lattice ?? null;
}

/** An open frame takes no hole and no spall: the blow passes through between its members. */
export function noLatticeDamage(): DamageStageResult {
  return { cuts: [], hides: [] };
}

/** The frame folded over along its fall: stubs on the pads, legs and members on the ground, the crown at the far end. */
export function collapseLattice(anatomy: StructureDamageAnatomy, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const lat = latticeOf(anatomy);
  if (!lat) return { cuts: [], hides: [{ section: null, partClass: null }] };
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const [cx, cz] = bodyCentre(anatomy);
  const given = (out as Writers & { fallAxis?: [number, number] }).fallAxis;
  const gl = given ? Math.hypot(given[0], given[1]) : 0;
  const ang = rng() * Math.PI * 2;
  const axis: Vec3 = given && gl > 1e-3 ? [given[0] / gl, 0, given[1] / gl] : [Math.cos(ang), 0, Math.sin(ang)];
  const side: Vec3 = [-axis[2], 0, axis[0]];
  const ground = (x: number, z: number): number => mound(x, z) + HEAP_LIFT_M * Math.max(0, Math.min(1, (mound(x, z) - 0.12) / 0.5));
  const tint: Rgb = lat.colour ?? [0.6, 0.6, 0.6];
  const s = lat.size;
  const height = Math.max(...lat.legs.map((l) => l.head[1] - l.foot[1]));
  if (mesh.begin(lat.bucket, 'rubble')) {
    for (const leg of lat.legs) {
      // the stub: bent over from its pad toward the fall
      const stubH = 0.35 + rng() * 0.6, lean = 0.25 + rng() * 0.3;
      const f = leg.foot, top: Vec3 = [f[0] + axis[0] * lean, f[1] + stubH, f[2] + axis[2] * lean];
      beamBetween(mesh, f, top, s, s, [0, 1, 0], tint);
      // the leg on the ground from its stub along the fall, a little turned, kinked once where it struck
      const L = (height - stubH) * (0.88 + rng() * 0.1), yaw = (rng() - 0.5) * 0.3;
      const dir: Vec3 = [axis[0] * Math.cos(yaw) - axis[2] * Math.sin(yaw), 0, axis[0] * Math.sin(yaw) + axis[2] * Math.cos(yaw)];
      const kink = 0.45 + rng() * 0.2, kinkTurn = (rng() - 0.5) * 0.5;
      const a: P3 = [top[0], 0, top[2]];
      const m: P3 = [a[0] + dir[0] * L * kink, 0, a[2] + dir[2] * L * kink];
      const dir2: Vec3 = [dir[0] * Math.cos(kinkTurn) - dir[2] * Math.sin(kinkTurn), 0, dir[0] * Math.sin(kinkTurn) + dir[2] * Math.cos(kinkTurn)];
      const b: P3 = [m[0] + dir2[0] * L * (1 - kink), 0, m[2] + dir2[2] * L * (1 - kink)];
      for (const p of [a, m, b]) p[1] = ground(p[0], p[2]) + s / 2;
      beamBetween(mesh, top, [a[0] + dir[0] * 0.3, a[1], a[2] + dir[2] * 0.3], s, s, [0, 1, 0], tint);
      beamBetween(mesh, a, m, s, s, [0, 1, 0], tint);
      beamBetween(mesh, m, b, s, s, [0, 1, 0], tint);
    }
    // the girts and braces scattered along the legs' line, some snapped in two
    const reach = height * 0.9, members = Math.min(18, 4 + lat.girts.length * 4);
    for (let k = 0; k < members; k++) {
      const t = 0.15 + rng() * 0.75, off = (rng() - 0.5) * 2.6, len = 0.8 + rng() * 2.2, yaw = rng() * Math.PI;
      const c: Vec3 = [cx + axis[0] * reach * t + side[0] * off, 0, cz + axis[2] * reach * t + side[2] * off];
      const d: Vec3 = [Math.cos(yaw) * len / 2, 0, Math.sin(yaw) * len / 2];
      const p0: P3 = [c[0] - d[0], 0, c[2] - d[2]], p1: P3 = [c[0] + d[0], 0, c[2] + d[2]];
      p0[1] = ground(p0[0], p0[2]) + s * 0.3; p1[1] = ground(p1[0], p1[2]) + s * 0.3;
      beamBetween(mesh, p0, p1, s * 0.5, s * 0.5, [0, 1, 0], [tint[0] * 0.92, tint[1] * 0.92, tint[2] * 0.92]);
    }
  }
  // the crown at the far end, crumpled flat on its side
  const crown = lat.crown;
  if (crown && mesh.begin(crown.bucket, 'rubble')) {
    const w = crown.x1 - crown.x0, d = crown.z1 - crown.z0, h = crown.y1 - crown.y0;
    const at = height * 0.95 + Math.max(w, d) * 0.4;
    const c: Vec3 = [cx + axis[0] * at, 0, cz + axis[2] * at];
    // a drum on its side along the fall, flattened where it struck (shaft.ts lyingDrum: chamfered, its ends ragged)
    const r = Math.max(w, d) * 0.45, flat = r * (0.55 + rng() * 0.2);
    lyingDrum(mesh, [c[0], ground(c[0], c[2]) + flat * 0.9, c[2]], axis, h * 0.5, r, flat, (rng() - 0.5) * 0.6, crown.tint, rng);
  }
  mesh.end();
  // the throw: rods, plates and bolts down the line of the fall
  for (let i = 0; i < out.pieces.capacity; i++) {
    const t = rng();
    const p: Vec3 = [cx + axis[0] * height * t + (rng() - 0.5) * 1.5, 0.5 + (1 - t) * height * 0.4, cz + axis[2] * height * t + (rng() - 0.5) * 1.5];
    if (!throwPieceAt(out.pieces, rng, lat.bucket, rng() < 0.7 ? 'beam' : 'sheet', p, [0.05 + rng() * 0.05, 0.05, 0.4 + rng() * 0.8], tint, 3)) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}
