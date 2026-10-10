// src/world/maps/regional/cluster.ts — a compound of cells (the facades lane, 2026-10-08; docs/DESTRUCTION.md §16.3; the
// coordinator's ruling: "compounds/caravanserai/souks ... mudbrick slumps and powders, not shards").
//
// A Siwan or Wadi Rum compound, a caravanserai, a souk is a cluster of cubic cells (each a closed rounded box, some
// standing on others) that its kit merges into one geometry a bucket. Its anatomy (damage.ts describeCluster) is the
// sim's box round the whole cluster, so the sim's sections fall where they fall; the builders here find the cell a blow
// reaches and dress that cell's own face as a house's (fracture.ts), so a hole opens in the wall it struck, never in the
// air of the courtyard:
// - a breach: the ray from the event's point on the cluster's face, inward, to the first cell it enters; the hole on
//   that cell's face, in its render and its earth core;
// - the damaged stage: spalls on a few outer cells;
// - a wall section's fall: the cells standing on that side open where the band crossed them (a wide hole each, cut
//   through the merged walls: a part-by-part clamp cannot take one cell of a merged bucket);
// - the collapse: every ground cell to ragged earth stubs over a slumped heap (powdery skin, clods), the cells on the
//   roofs come down in it.
import {
  damageRng,
  type BreachSpec, type DamageFace, type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type FaceName,
  type FractureSlot, type Rgb, type StructureDamageAnatomy, type Vec3,
} from '../../destructionKit.ts';
import {
  FacePen, HEAP_LIFT_M, Mesh, bodyCentre, breachHouse, damagedHouse, fallbackSurface, heapChunk, heapSkin, remnantWall, type MoundHeight,
} from './fracture.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };

/** A cell of a compound: its box in the body frame, the bucket its walls are in. */
interface ClusterCell {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  bucket: string;
  /** its roof slab's top (shell.ts readCells): the rooms behind its holes stay under the slab, never above the parapet */
  deck?: number;
}

export function cellsOf(anatomy: StructureDamageAnatomy): readonly ClusterCell[] | null {
  const k = anatomy.kitPlan as { damage?: { cells?: readonly ClusterCell[] } } | undefined;
  return k?.damage?.cells ?? null;
}

const SIDES: ReadonlyArray<{ name: FaceName; u: Vec3; out: Vec3 }> = [
  { name: 'front', u: [1, 0, 0], out: [0, 0, 1] }, { name: 'right', u: [0, 0, -1], out: [1, 0, 0] },
  { name: 'back', u: [-1, 0, 0], out: [0, 0, -1] }, { name: 'left', u: [0, 0, 1], out: [-1, 0, 0] },
];

/** A cell as an anatomy of its own: one storey, its four faces in the cluster's layers (for a house's builders). */
function cellAnatomy(anatomy: StructureDamageAnatomy, cell: ClusterCell): StructureDamageAnatomy {
  const layers = anatomy.storeys[0].faces[0].layers.map((l) => ({ ...l, bucket: l.bucket === anatomy.storeys[0].faces[0].bucket ? cell.bucket : l.bucket }));
  // the faces reach the slab's underside (a hole, a room, a stub stays under the roof, the parapet over it untouched)
  const h = cell.deck !== undefined ? Math.max(1.5, Math.min(cell.y1, cell.deck - 0.2) - cell.y0) : cell.y1 - cell.y0;
  const faces: DamageFace[] = SIDES.map((s, f) => ({
    name: s.name, section: f, u: s.u, out: s.out,
    origin: s.name === 'front' ? [(cell.x0 + cell.x1) / 2, cell.y0, cell.z1] : s.name === 'right' ? [cell.x1, cell.y0, (cell.z0 + cell.z1) / 2]
      : s.name === 'back' ? [(cell.x0 + cell.x1) / 2, cell.y0, cell.z0] : [cell.x0, cell.y0, (cell.z0 + cell.z1) / 2],
    width: Math.abs(s.out[2]) > 0.5 ? cell.x1 - cell.x0 : cell.z1 - cell.z0, height: h,
    bucket: cell.bucket, layers: layers.map((l) => ({ ...l })), openings: [], members: [], masonry: null,
  }));
  return {
    ...anatomy, w: cell.x1 - cell.x0, d: cell.z1 - cell.z0, h: cell.y1, plinth: null, roof: null, chimneys: [],
    storeys: [{ index: 0, y0: cell.y0, y1: cell.y1, jetty: [0, 0, 0, 0], framed: false, faces, floor: null }],
    kitPlan: undefined,
  };
}

/**
 * The earth of a wall come down, slumped at its foot: a cone banked against the gap (highest on the wall line, out to
 * two metres in front and under a metre back into the room), its skin the walls' earth, its clods and lumps on it.
 */
function footSpill(mesh: Mesh, anatomy: StructureDamageAnatomy, f: DamageFace, cu: number, r: number, rng: () => number): void {
  const slots = anatomy.rubble.filter((s) => s.share > 0.02);
  if (!slots.length) return;
  const peak = Math.min(1.3, 0.45 * r + 0.2), ru = r * 1.05, ro = Math.min(2.2, 0.8 + r * 0.7), ri = 0.7;
  const bx = f.origin[0] + f.u[0] * cu, bz = f.origin[2] + f.u[2] * cu;
  const cone = (x: number, z: number): number => {
    const dx = x - bx, dz = z - bz;
    const du = (dx * f.u[0] + dz * f.u[2]) / ru, dn = dx * f.out[0] + dz * f.out[2], dv = dn / (dn >= 0 ? ro : ri);
    const q = du * du + dv * dv;
    return q >= 1 ? 0 : peak * Math.pow(1 - q, 0.9);
  };
  const local = { ...anatomy, w: 2 * ru, d: 2 * ro };
  heapSkin(mesh, local, slots, cone, bx + f.out[0] * 0.3, bz + f.out[2] * 0.3, rng);
  for (const slot of slots) {
    const count = Math.round(22 * slot.share);
    if (count < 1 || !mesh.begin(slot.bucket, 'rubble')) continue;
    for (let i = 0; i < count; i++) {
      const u = cu + (rng() - 0.5) * 2 * ru * 0.9, o = -0.3 + rng() * rng() * (ro + 0.2);
      const x = f.origin[0] + f.u[0] * u + f.out[0] * o, z = f.origin[2] + f.u[2] * u + f.out[2] * o;
      const sx = 0.14 + rng() * 0.3, sy = 0.08 + rng() * 0.16, sz = 0.12 + rng() * 0.28;
      heapChunk(mesh, slot, x, cone(x, z) + sy * 0.3, z, sx, sy, sz, rng() * Math.PI, (rng() - 0.5) * 0.6, rng);
    }
  }
}

/** The first cell a ray from `p` along `d` (horizontal) enters, and where: the cell, its face's side, the hit point. */
function rayCell(cells: readonly ClusterCell[], p: Vec3, d: Vec3, maxT: number): { cell: ClusterCell; side: number; at: Vec3 } | null {
  let best: { cell: ClusterCell; side: number; at: Vec3 } | null = null, bestT = maxT;
  for (const cell of cells) {
    if (p[1] < cell.y0 + 0.1 || p[1] > cell.y1 - 0.1) continue;
    // slab test in x and z; the entering face is the side whose slab bound the entry last
    let t0 = -Infinity, t1 = Infinity, enter = -1;
    for (const [axis, lo, hi, minus, plus] of [[0, cell.x0, cell.x1, 3, 1], [2, cell.z0, cell.z1, 2, 0]] as const) {
      const o = p[axis], v = d[axis];
      if (Math.abs(v) < 1e-9) { if (o < lo || o > hi) { t0 = Infinity; break; } continue; }
      const ta = (lo - o) / v, tb = (hi - o) / v, near = Math.min(ta, tb), far = Math.max(ta, tb);
      if (near > t0) { t0 = near; enter = v > 0 ? minus : plus; }
      t1 = Math.min(t1, far);
    }
    if (t0 > t1 || t1 < 0 || enter < 0) continue;
    const t = Math.max(0, t0);
    if (t < bestT) { bestT = t; best = { cell, side: t0 >= 0 ? enter : enter, at: [p[0] + d[0] * t, p[1], p[2] + d[2] * t] }; }
  }
  return best;
}

/** A hole on a cell's face, where the ray from the cluster's face struck it. */
function cellHole(anatomy: StructureDamageAnatomy, hole: BreachSpec, cells: readonly ClusterCell[]): { proxy: StructureDamageAnatomy; spec: BreachSpec } | null {
  const st = anatomy.storeys[hole.storey], f = st?.faces.find((x) => x.section === hole.section);
  if (!st || !f) return null;
  const p: Vec3 = [f.origin[0] + f.u[0] * hole.u + f.out[0] * 0.3, st.y0 + hole.y, f.origin[2] + f.u[2] * hole.u + f.out[2] * 0.3];
  const d: Vec3 = [-f.out[0], 0, -f.out[2]];
  const hit = rayCell(cells, p, d, Math.max(anatomy.w, anatomy.d) + 1);
  if (!hit) return null;
  const proxy = cellAnatomy(anatomy, hit.cell), cf = proxy.storeys[0].faces[hit.side];
  const u = (hit.at[0] - cf.origin[0]) * cf.u[0] + (hit.at[2] - cf.origin[2]) * cf.u[2];
  const y = hit.at[1] - hit.cell.y0;
  const r = Math.min(hole.radiusM, cf.width / 2 - 0.2, (hit.cell.y1 - hit.cell.y0) / 2 - 0.1);
  if (r < 0.15) return null;
  const uu = Math.max(-cf.width / 2 + r + 0.1, Math.min(cf.width / 2 - r - 0.1, u));
  const yy = Math.max(r + 0.1, Math.min(cf.height - r - 0.1, y));
  return { proxy, spec: { ...hole, section: cf.section, storey: 0, face: cf.name, u: uu, y: yy, radiusM: r } };
}

/** A breach in a compound: on the cell the blow reaches, as a house's wall breaks. */
export function breachCluster(anatomy: StructureDamageAnatomy, hole: BreachSpec, out: Writers): DamageStageResult {
  const cells = cellsOf(anatomy);
  const hit = cells && cellHole(anatomy, hole, cells);
  return hit ? breachHouse(hit.proxy, hit.spec, out) : { cuts: [], hides: [] };
}

/** The damaged stage on a compound: spalls on two of its outer cells, the glass gone. */
export function damagedCluster(anatomy: StructureDamageAnatomy, seed: number, out: Writers): DamageStageResult {
  const cells = cellsOf(anatomy) ?? [];
  const rng = damageRng(seed);
  const ground = cells.filter((c) => c.y0 <= anatomy.storeys[0].y0 + 0.5);
  const cuts: DamageStageResult['cuts'] = [];
  for (let k = 0; k < Math.min(2, ground.length); k++) {
    const cell = ground[Math.floor(rng() * ground.length)];
    cuts.push(...damagedHouse(cellAnatomy(anatomy, cell), Math.floor(rng() * 0x7fffffff), out).cuts);
  }
  return { cuts, hides: [{ section: null, partClass: 'glass' }] };
}

/**
 * A compound's wall section falls: every cell standing on that side opens where the band crossed it — a wide hole,
 * cut through the merged walls (the presentation's panel clamp takes parts whole, and a kit merges every cell of a
 * bucket into one part) and dressed as a house's breach.
 */
export function sectionDownCluster(anatomy: StructureDamageAnatomy, section: number, seed: number, out: Writers): DamageStageResult {
  const cells = cellsOf(anatomy) ?? [];
  const st = anatomy.storeys[Math.floor(section / 4)], f = st?.faces.find((x) => x.section === section);
  if (!st || !f) return { cuts: [], hides: [] };
  const rng = damageRng(seed);
  const cuts: DamageStageResult['cuts'] = [];
  const plane = f.origin[0] * f.out[0] + f.origin[2] * f.out[2];
  for (const cell of cells) {
    // the cell's face on this side, if it stands within a metre of the cluster's face, and the band crosses it
    const side = SIDES.findIndex((s) => s.out[0] === f.out[0] && s.out[2] === f.out[2]);
    const proxy = cellAnatomy(anatomy, cell), cf = proxy.storeys[0].faces[side];
    const cplane = cf.origin[0] * f.out[0] + cf.origin[2] * f.out[2];
    if (plane - cplane > 1 || cell.y1 < st.y0 + 0.5 || cell.y0 > st.y1 - 0.5) continue;
    const y0 = Math.max(cell.y0, st.y0), y1 = Math.min(cell.y0 + cf.height, st.y1);
    // the wall down: one wide gap low in the band (its lip runs under the floor line, its head near the band's top), the
    // earth spilled at its foot — a slumped wall, not a shot hole
    const r = Math.min(cf.width / 2 - 0.25, (y1 - y0) * 0.62);
    if (r < 0.5) continue;
    const cu = (rng() - 0.5) * Math.max(0, cf.width - 2 * r - 0.5);
    const res = breachHouse(proxy, { section: cf.section, storey: 0, face: cf.name, hole: 255, u: cu,
      y: y0 - cell.y0 + Math.max(0.3, r * 0.55), radiusM: r, dirX: -f.out[0], dirZ: -f.out[2], munition: null, cause: 'blast',
      seed: Math.floor(rng() * 0x7fffffff) }, out);
    cuts.push(...res.cuts);
    if (y0 <= anatomy.storeys[0].y0 + 0.5) {
      const mesh = new Mesh(out.mesh);
      footSpill(mesh, anatomy, cf, cu, r, rng);
      mesh.end();
    }
  }
  return { cuts, hides: [] };
}

/**
 * A compound collapses: every ground cell to ragged earth stubs over the heap banked against them, the heap slumped over
 * the sim's mound (its skin a hand over it, powdery, its clods and lumps of the walls' render and core), the cells that
 * stood on the roofs come down in it; the earth thrown down and out.
 */
export function collapseCluster(anatomy: StructureDamageAnatomy, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const cells = cellsOf(anatomy) ?? [];
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const [cx, cz] = bodyCentre(anatomy);
  const top = (x: number, z: number): number => { const m = mound(x, z); return m + HEAP_LIFT_M * Math.max(0, Math.min(1, (m - 0.12) / 0.5)); };
  const base = anatomy.storeys[0].y0;
  // 1. the stubs: each ground cell's faces, ragged, over the heap against them
  for (const cell of cells) {
    if (cell.y0 > base + 0.5) continue;
    const proxy = cellAnatomy(anatomy, cell);
    for (const f of proxy.storeys[0].faces) {
      const half = f.width / 2, lobes = Array.from({ length: 4 }, () => [rng() * 2 - 1, rng() * Math.PI * 2]);
      const line = (u: number): number => {
        let v = 0;
        for (let k = 0; k < lobes.length; k++) v += lobes[k][0] * Math.sin(u * (k + 1) * 1.1 + lobes[k][1]) / (k + 1);
        const corner = Math.max(0, 1 - (half - Math.abs(u)) / 0.8) * 0.6;
        const banked = Math.max(0, top(f.origin[0] + f.u[0] * u, f.origin[2] + f.u[2] * u) - (f.origin[1] - base));
        return Math.min(f.height, Math.max(0.3, banked + 0.5 + 0.6 * (1 + v) + corner));
      };
      remnantWall(mesh, new FacePen(f, fallbackSurface(f)), proxy, rng, line);
    }
  }
  // 2. the heap: the walls' earth slumped over the mound, its skin powdery (paler, dusted)
  const slots = anatomy.rubble.filter((s) => s.share > 0.005);
  const dust = (t: Rgb): Rgb => [Math.min(1, t[0] * 0.92 + 0.08), Math.min(1, t[1] * 0.92 + 0.07), Math.min(1, t[2] * 0.9 + 0.05)];
  const skinSlots: FractureSlot[] = slots.map((sl) => (sl.material === 'adobe' || sl.material === 'plaster' ? { ...sl, tint: dust(sl.tint) } : sl));
  const reach = heapSkin(mesh, anatomy, skinSlots, top, cx, cz, rng);
  // 3. clods and lumps of render over it, dense where it stands high
  const budget = Math.max(60, Math.min(360, Math.floor((out.mesh.capacity - out.mesh.vertices) / 26)));
  for (const slot of slots) {
    const count = Math.round(budget * slot.share);
    if (count < 1 || !mesh.begin(slot.bucket, 'rubble')) continue;
    const flat = slot.material === 'plaster';
    for (let i = 0; i < count; i++) {
      const a = rng() * Math.PI * 2, r = Math.sqrt(rng());
      const x = cx + Math.cos(a) * r * reach[0], z = cz + Math.sin(a) * r * reach[1];
      const sx = flat ? 0.15 + rng() * 0.25 : 0.12 + rng() * 0.3, sy = flat ? 0.02 + rng() * 0.03 : 0.1 + rng() * 0.2, sz = flat ? 0.12 + rng() * 0.22 : 0.12 + rng() * 0.28;
      heapChunk(mesh, slot, x, top(x, z) + sy * 0.3, z, sx, sy, sz, rng() * Math.PI, (rng() - 0.5) * 0.7, rng);
    }
  }
  mesh.end();
  // 4. the earth thrown down and out (with sections on the presentation passes no piece budget)
  const h = Math.max(...cells.map((c) => c.y1), base + 3);
  for (let i = 0; i < out.pieces.capacity; i++) {
    const slot = slots[Math.floor(rng() * slots.length)];
    if (!slot) break;
    const ox = (rng() - 0.5) * anatomy.w, oz = (rng() - 0.5) * anatomy.d, y = base + 1 + rng() * (h - base - 1);
    const len = Math.hypot(ox, oz) || 1, sp = 1 + rng() * 2.5, spin = rng() * Math.PI * 2;
    const shape = slot.material === 'adobe' ? 'clod' : slot.material === 'plaster' ? 'plate' : slot.material === 'timber' ? 'beam' : 'chunk';
    if (!out.pieces.push(slot.bucket, shape, Math.floor(rng() * 4), cx + ox, y, cz + oz, 0, Math.sin(spin / 2), 0, Math.cos(spin / 2),
      0.2 + rng() * 0.25, 0.12 + rng() * 0.15, 0.18 + rng() * 0.22, slot.tint[0], slot.tint[1], slot.tint[2], (ox / len) * sp, -1 - rng() * 2, (oz / len) * sp)) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}
