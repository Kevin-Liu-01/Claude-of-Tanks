// src/world/maps/regional/penstockFall.ts — how a penstock run comes down (lane B, 2026-10-16, for 227; the anti-raft
// floor: Glen Canyon's run (glencanyon.ts penstockRun, on the base gantry's plot) fell as the default kit's heap, 22 % of
// its height, and as an open frame by its plot's name it stood no masonry).
//
// The pipe lies on ring girders whose legs stand on rocker plates on low concrete piers, from its anchor block to the
// thrust block where it dives under the ground. Struck down, the steel gives and the concrete stands: the anchor and the
// thrust blocks and the piers stand as they were; the pipe breaks at its girders into its lengths, each down off its
// supports, one end on its pier's head and the other on the ground (every other one the other way round), crushed flat
// where it struck; the ring girders bent over on their piers. The pipe's own steel and the run's own concrete; a few
// plates thrown.
import { damageRng, type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type Rgb, type Vec3 } from '../../destructionKit.ts';
import { HEAP_LIFT_M, Mesh, beamBetween, throwPieceAt, type MoundHeight } from './fracture.ts';
import { lyingDrum } from './shaft.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };

/** A box in the building's frame: its corners' least and most x, y, z. */
export interface WreckBox { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }

/** The run as glencanyon.ts penstockRun built it, in the building's frame. */
export interface PenstockWreck {
  /** the pipe's axis from the anchor block's face to the thrust block's, its radius */
  a: Vec3;
  b: Vec3;
  r: number;
  /** each ring girder's pier: its box (it stands) */
  piers: WreckBox[];
  /** the anchor and the thrust blocks (they stand) */
  blocks: WreckBox[];
  /** the concrete's bucket and tint, the pipe's paint and its darker trim */
  concrete: { bucket: string; tint: Rgb; tintKey: string };
  paint: Rgb;
  dark: Rgb;
}

/** The run brought down: see the module's note. */
export function collapsePenstock(w: PenstockWreck, seed: number, out: Writers, mound: MoundHeight, concreteTint: Rgb | null = null): DamageStageResult {
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const ground = (x: number, z: number): number => { const m = mound(x, z); return m + HEAP_LIFT_M * Math.max(0, Math.min(1, (m - 0.12) / 0.5)); };
  const len = Math.hypot(w.b[0] - w.a[0], w.b[2] - w.a[2]) || 1;
  const ax: Vec3 = [(w.b[0] - w.a[0]) / len, 0, (w.b[2] - w.a[2]) / len];
  const side: Vec3 = [-ax[2], 0, ax[0]];
  const along = (p: { x0: number; x1: number; z0: number; z1: number }) => (((p.x0 + p.x1) / 2 - w.a[0]) * ax[0] + ((p.z0 + p.z1) / 2 - w.a[2]) * ax[2]);
  // the concrete standing: the blocks and the piers as they stood
  if (mesh.begin(w.concrete.bucket, 'remnant')) {
    for (const b of [...w.blocks, ...w.piers]) {
      const base = concreteTint ?? w.concrete.tint, shade = 0.88 + rng() * 0.1, t: Rgb = [base[0] * shade, base[1] * shade, base[2] * shade];
      // (beamBetween up a vertical: its width runs along z, its depth along x)
      beamBetween(mesh, [(b.x0 + b.x1) / 2, b.y0, (b.z0 + b.z1) / 2], [(b.x0 + b.x1) / 2, b.y1, (b.z0 + b.z1) / 2], Math.max(0.1, b.z1 - b.z0), Math.max(0.1, b.x1 - b.x0), [1, 0, 0], t);
    }
  }
  // the pipe in its lengths between the supports, each down off them: one end on a pier's head, the other on the ground
  const stops = [0, ...w.piers.map(along).sort((p, q) => p - q), len];
  const pierTop = (s: number): number => {
    let best = -Infinity;
    for (const p of w.piers) if (Math.abs(along(p) - s) < 0.8) best = Math.max(best, p.y1);
    return best;
  };
  if (mesh.begin('structureMetal', 'rubble')) {
    for (let k = 0; k + 1 < stops.length; k++) {
      const s0 = stops[k] + 0.15, s1 = stops[k + 1] - 0.15;
      if (s1 - s0 < 0.6) continue;
      const lateral = (rng() - 0.5) * w.r * 0.8, flat = w.r * (0.6 + rng() * 0.2);
      const p0: Vec3 = [w.a[0] + ax[0] * s0 + side[0] * lateral, 0, w.a[2] + ax[2] * s0 + side[2] * lateral];
      const p1: Vec3 = [w.a[0] + ax[0] * s1 + side[0] * lateral, 0, w.a[2] + ax[2] * s1 + side[2] * lateral];
      // which end rests high: the one over a pier (the run's ends rest on their blocks' feet), every other length turned
      const high0 = k % 2 === 0, top0 = pierTop(stops[k]), top1 = pierTop(stops[k + 1]);
      const y0 = (high0 && Number.isFinite(top0) ? top0 : ground(p0[0], p0[2])) + flat;
      const y1 = (!high0 && Number.isFinite(top1) ? top1 : ground(p1[0], p1[2])) + flat;
      const c: Vec3 = [(p0[0] + p1[0]) / 2, (y0 + y1) / 2, (p0[2] + p1[2]) / 2];
      const dl = Math.hypot(p1[0] - p0[0], y1 - y0, p1[2] - p0[2]) || 1;
      const axis: Vec3 = [(p1[0] - p0[0]) / dl, (y1 - y0) / dl, (p1[2] - p0[2]) / dl];
      lyingDrum(mesh, c, axis, dl / 2, w.r, flat, (rng() - 0.5) * 0.5, w.paint, rng);
    }
    // the ring girders bent over on their piers: each ring's two legs folded down beside the pier, the ring's lower arc
    for (const p of w.piers) {
      const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, lean = (rng() < 0.5 ? -1 : 1) * (0.4 + rng() * 0.5);
      for (const sz of [-1, 1]) {
        const foot: Vec3 = [cx + side[0] * sz * w.r * 0.92, p.y1 + 0.1, cz + side[2] * sz * w.r * 0.92];
        const head: Vec3 = [foot[0] + ax[0] * lean, p.y1 + w.r * 0.5, foot[2] + ax[2] * lean];
        beamBetween(mesh, foot, head, 0.22, 0.3, [0, 1, 0], w.dark);
      }
    }
  }
  mesh.end();
  // the throw: plates and rivets down the run
  for (let i = 0; i < out.pieces.capacity; i++) {
    const t = rng(), p: Vec3 = [w.a[0] + ax[0] * len * t + (rng() - 0.5) * 2, 0.6 + rng() * w.r, w.a[2] + ax[2] * len * t + (rng() - 0.5) * 2];
    if (!throwPieceAt(out.pieces, rng, 'structureMetal', rng() < 0.6 ? 'sheet' : 'beam', p, [0.3 + rng() * 0.4, 0.03, 0.3 + rng() * 0.5], w.paint, 3)) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}
