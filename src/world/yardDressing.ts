// Round 75 (2026-09-26): the yard dressing planner — pallets, crates, drums, cable drums, tyre stacks, fuel tanks
// and skips laid around a battlefield's industrial structures. Renderer-free and deterministic: the planner reads
// the placed structures (kind, pose, envelope), the height field's ground / road / water / berth queries and the
// map's collision records, and returns instance placements for the kit (maps/yardClutterKit.ts) to render as one
// InstancedMesh per family. Dressing, not obstacles: nothing here publishes a collision record, so every dedicated
// shard and census is untouched; the pieces keep to the apron band just outside a structure's envelope where a hull
// rarely drives, and the planner refuses roads, water, steep ground, the rail berth and every existing solid.

export type YardFamily =
  | 'pallets' | 'palletsTall' | 'crates' | 'drum' | 'drumRank' | 'cableDrum' | 'tyres' | 'fuelTank' | 'skip';

export interface YardStructure {
  kind: string;
  x: number;
  z: number;
  /** The builder's placement envelope (metres), the rectangle the pieces keep outside of. */
  w: number;
  d: number;
  rot: number;
}

export interface YardField {
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): { y: number };
  _roadDist(x: number, z: number): number;
  getWaterMaskAt?(x: number, z: number): number;
  _noVeg?(x: number, z: number): boolean;
}

export interface YardSolid {
  min: readonly number[];
  max: readonly number[];
}

export interface YardPlacement {
  family: YardFamily;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  /** A colourway index for the kit's livery table (drums, skips, tanks). */
  variant: number;
  /** The structure this piece dresses (its index in the planner's input). */
  structure: number;
}

export interface YardPlan {
  placements: YardPlacement[];
  /** The structures the planner dressed and how many pieces each got. */
  perStructure: number[];
  attempts: number;
}

export interface YardPlanOptions {
  /** Hard cap on placed pieces (a map's yardDressing budget). */
  budget: number;
  /** Half-extent of the square the dressing stays inside (the playable square's rim margin). */
  half?: number;
  /** Chase the pieces this far from a road centreline. */
  roadClearance?: number;
  /** Polar and martian sets thin the mix (no wooden pallets on Mars). */
  palette?: 'brownfield' | 'polar' | 'martian';
}

/** Footprint radius per family (metres): clearance against solids, other pieces and the structure envelope. */
export const YARD_FAMILY_RADIUS: Readonly<Record<YardFamily, number>> = Object.freeze({
  pallets: 0.75, palletsTall: 0.75, crates: 1.1, drum: 0.35, drumRank: 1.1, cableDrum: 0.9, tyres: 0.55,
  fuelTank: 2.5, skip: 1.8,
});

/** Which families a structure kind attracts, weighted; a kind absent here takes no dressing. */
const YARD_PROFILES: Readonly<Record<string, ReadonlyArray<readonly [YardFamily, number]>>> = Object.freeze({
  containerRow: [['pallets', 3], ['drum', 3], ['drumRank', 2], ['cableDrum', 2], ['tyres', 2], ['crates', 1], ['palletsTall', 1]],
  warehouse: [['pallets', 3], ['palletsTall', 2], ['crates', 3], ['skip', 2], ['drum', 2], ['drumRank', 1], ['fuelTank', 1]],
  shed: [['pallets', 3], ['crates', 2], ['drum', 1], ['cableDrum', 1]],
  gantry: [['cableDrum', 3], ['drumRank', 2], ['pallets', 1], ['tyres', 1]],
  factory: [['skip', 2], ['fuelTank', 2], ['drumRank', 2], ['pallets', 2], ['drum', 1]],
  depot: [['crates', 3], ['pallets', 2], ['drum', 1], ['skip', 1]],
  foundryoffice: [['skip', 1], ['drum', 1], ['pallets', 1]],
  firestation: [['drum', 2], ['skip', 1], ['crates', 1]],
  watertower: [['drum', 2], ['cableDrum', 1]],
});

/** Pieces a structure kind gets at density 1 (scaled by the map's remaining budget). */
const YARD_PIECES_PER_KIND: Readonly<Record<string, number>> = Object.freeze({
  containerRow: 5, warehouse: 6, shed: 3, gantry: 4, factory: 5, depot: 3, foundryoffice: 2, firestation: 2, watertower: 2,
});

const MARTIAN_FAMILIES: ReadonlySet<YardFamily> = new Set(['drum', 'drumRank', 'skip', 'fuelTank']); // no timber on Mars

function mulberry32(a: number): () => number {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function yardStructureKinds(): readonly string[] {
  return Object.keys(YARD_PROFILES);
}

function pickFamily(rng: () => number, profile: ReadonlyArray<readonly [YardFamily, number]>, palette: string): YardFamily {
  const rows = palette === 'martian' ? profile.filter(([family]) => MARTIAN_FAMILIES.has(family)) : profile;
  const total = rows.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [family, weight] of rows) { roll -= weight; if (roll <= 0) return family; }
  return rows[rows.length - 1][0];
}

/** Local frame of a structure: u across its width, v along its depth. */
function toWorld(s: YardStructure, u: number, v: number): [number, number] {
  const c = Math.cos(s.rot), n = Math.sin(s.rot);
  return [s.x + u * c + v * n, s.z - u * n + v * c];
}

function insideEnvelope(s: YardStructure, x: number, z: number, pad: number): boolean {
  const c = Math.cos(s.rot), n = Math.sin(s.rot);
  const dx = x - s.x, dz = z - s.z;
  const u = dx * c - dz * n, v = dx * n + dz * c;
  return Math.abs(u) < s.w / 2 + pad && Math.abs(v) < s.d / 2 + pad;
}

function touchesSolid(solids: readonly YardSolid[], x: number, z: number, r: number): boolean {
  for (const solid of solids) {
    if (x + r < solid.min[0] || x - r > solid.max[0] || z + r < solid.min[2] || z - r > solid.max[2]) continue;
    return true;
  }
  return false;
}

/**
 * Plan the dressing. Structures are visited in their placement order, each with its own count from the kind's
 * table and the remaining budget; every candidate stands in the apron band 0.6–2.6 m outside the envelope on a
 * random side, aligned to the structure with a little scatter, and passes the ground, road, water, berth, solid,
 * neighbour-envelope and piece-spacing checks before it is kept.
 */
export function planYardDressing(
  structures: readonly YardStructure[],
  field: YardField,
  solids: readonly YardSolid[],
  seed: number,
  { budget, half = 478, roadClearance = 4.5, palette = 'brownfield' }: YardPlanOptions,
): YardPlan {
  const rng = mulberry32(seed + 7501);
  const placements: YardPlacement[] = [];
  const perStructure = structures.map(() => 0);
  let attempts = 0;
  if (!(budget > 0)) return { placements, perStructure, attempts };
  const candidates = structures.map((s, index) => ({ s, index })).filter(({ s }) => YARD_PROFILES[s.kind]);
  const share = candidates.reduce((sum, { s }) => sum + YARD_PIECES_PER_KIND[s.kind], 0);
  const density = share > 0 ? Math.min(1, budget / share) : 0;
  for (const { s, index } of candidates) {
    if (placements.length >= budget) break;
    const profile = YARD_PROFILES[s.kind];
    const want = Math.max(1, Math.round(YARD_PIECES_PER_KIND[s.kind] * density * (palette === 'polar' ? 0.7 : 1)));
    for (let k = 0, tries = 0; k < want && tries < want * 6 && placements.length < budget; tries++) {
      attempts++;
      const family = pickFamily(rng, profile, palette);
      const r = YARD_FAMILY_RADIUS[family];
      const side = (rng() * 4) | 0;
      const along = (rng() - 0.5) * 0.86;
      const out = 0.6 + r + rng() * 2.0;
      const [u, v] = side === 0 ? [along * s.w, s.d / 2 + out] : side === 1 ? [along * s.w, -s.d / 2 - out]
        : side === 2 ? [s.w / 2 + out, along * s.d] : [-s.w / 2 - out, along * s.d];
      const [x, z] = toWorld(s, u, v);
      if (Math.abs(x) > half - r || Math.abs(z) > half - r) continue;
      if (field._roadDist(x, z) < roadClearance + r) continue;
      if (field.getWaterMaskAt && field.getWaterMaskAt(x, z) > 0.01) continue;
      if (field._noVeg && field._noVeg(x, z)) continue;
      if (field.getNormalAt(x, z).y < 0.9) continue;
      if (structures.some((other, j) => j !== index && insideEnvelope(other, x, z, r + 0.2))) continue;
      if (touchesSolid(solids, x, z, r + 0.15)) continue;
      if (placements.some((p) => Math.hypot(p.x - x, p.z - z) < YARD_FAMILY_RADIUS[p.family] + r + 0.25)) continue;
      // ranks, tanks and skips align with the structure they serve; loose pieces scatter
      const aligned = family === 'drumRank' || family === 'fuelTank' || family === 'skip' || family === 'palletsTall';
      const yaw = aligned ? s.rot + (side < 2 ? 0 : Math.PI / 2) + (rng() - 0.5) * 0.12 : rng() * Math.PI * 2;
      placements.push({
        family, x, y: field.getHeightAt(x, z), z, yaw,
        scale: 0.92 + rng() * 0.16, variant: (rng() * 8) | 0, structure: index,
      });
      perStructure[index]++;
      k++;
    }
  }
  return { placements, perStructure, attempts };
}
