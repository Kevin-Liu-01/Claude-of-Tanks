// The doorsteps (buildings-271 R4; the owner, 2026-11-08: "make a whole area feel lived in"; Main: the lived-in layer
// instanced and within PERF-LOCKDOWN). The blind critics named what made a street read as worked and lived in: barrels
// and troughs by the doors, the woodpile against the barn, a bench under the window, the cart before the barn door.
// This planner reads each regional building's ground-floor doors (buildingContacts.ts) and stands a few such pieces
// against the wall beside each door, never across it: pots and a bench by a house door, a log stack, a cart and a cask
// by a cart door, casks and crates by a shop. Renderer-free and deterministic for one map build; maps/doorstepKit.ts
// builds the families and props.ts folds them into its buckets as the yard dressing does (no draw of its own).

import type { BuildingGroundContact } from './buildingContacts.ts';

export type DoorstepFamily = 'pots' | 'bench' | 'bucket' | 'cask' | 'logs' | 'handcart' | 'crates';

/** Each family's footprint radius (m) for spacing and clearance, and its depth off the wall (its back against it). */
const DOORSTEP_FAMILY: Readonly<Record<DoorstepFamily, { r: number; depth: number }>> = Object.freeze({
  pots: { r: 0.35, depth: 0.32 }, bench: { r: 0.85, depth: 0.42 }, bucket: { r: 0.2, depth: 0.3 },
  cask: { r: 0.36, depth: 0.62 }, logs: { r: 0.95, depth: 0.55 }, handcart: { r: 1.15, depth: 1.0 }, crates: { r: 0.5, depth: 0.55 },
});

/** What stands by each kind of door, in the order tried, with its chance. */
const BY_DOOR: Readonly<Record<'door' | 'cart' | 'shop', ReadonlyArray<readonly [DoorstepFamily, number]>>> = Object.freeze({
  door: [['pots', 0.7], ['bench', 0.45], ['bucket', 0.35], ['cask', 0.25]],
  cart: [['logs', 0.65], ['handcart', 0.5], ['cask', 0.4]],
  shop: [['cask', 0.6], ['crates', 0.55], ['pots', 0.3]],
});

interface DoorstepField {
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): { y: number };
  _roadDist(x: number, z: number): number;
  getWaterMaskAt?(x: number, z: number): number;
}

interface DoorstepSolid {
  min: readonly number[];
  max: readonly number[];
}

interface DoorstepPlacement {
  family: DoorstepFamily;
  x: number;
  y: number;
  z: number;
  yaw: number;
  variant: number;
}

/** Whether (x, z) lies inside a counter-clockwise (from above) quad, grown by `pad`. */
function insidePlinth(q: ReadonlyArray<readonly [number, number]>, x: number, z: number, pad: number): boolean {
  for (let i = 0; i < q.length; i++) {
    const [ax, az] = q[i], [bx, bz] = q[(i + 1) % q.length];
    const ex = bx - ax, ez = bz - az, len = Math.hypot(ex, ez) || 1;
    // the outward side of a counter-clockwise-from-above edge (x east, z south) is its left in x-z
    if (((x - ax) * ez - (z - az) * ex) / len < -pad) return false;
  }
  return true;
}

const mulberry32 = (a: number) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * Plan the doorsteps. Each door, in the buildings' order, tries its kind's families in turn (each by its chance): a
 * piece stands on one side of the door or the other, its near edge `clear` past the door's jamb, its back against the
 * wall (the plinth's outline), turned to the street; it is kept when it stands off the carriageway (`roadClearance` from
 * a road's centre), on dry, level ground, outside every building's plinth and every small solid, and clear of the pieces
 * already placed. Big solids (a building's own boxes) are the plinths' to judge: a rotated house's box covers its doorstep.
 */
export function planDoorsteps(
  contacts: ReadonlyArray<BuildingGroundContact>,
  field: DoorstepField,
  solids: ReadonlyArray<DoorstepSolid>,
  seed: number,
  { budget, roadClearance = 4.2, smallSolidM2 = 30 }: { budget: number; roadClearance?: number; smallSolidM2?: number },
): DoorstepPlacement[] {
  const rng = mulberry32(seed + 9127);
  const out: DoorstepPlacement[] = [];
  const small = solids.filter((s) => (s.max[0] - s.min[0]) * (s.max[2] - s.min[2]) < smallSolidM2);
  const plinths = contacts.map((c) => c.plinth);
  for (const contact of contacts) {
    for (const door of contact.doors) {
      if (out.length >= budget) return out;
      // the wall's direction at the door (the normal turned a quarter), and which side each piece takes
      const tx = -door.nz, tz = door.nx;
      let side = rng() < 0.5 ? -1 : 1;
      let along = door.width / 2 + 0.35;
      for (const [family, chance] of BY_DOOR[door.kind]) {
        if (rng() >= chance || out.length >= budget) continue;
        const { r, depth } = DOORSTEP_FAMILY[family];
        // its back 8 cm off the wall's face, clear of the plinth's 5 cm step
        const off = along + r, back = 0.08 + depth / 2;
        const x = door.x + tx * side * off + door.nx * back, z = door.z + tz * side * off + door.nz * back;
        // a cart parks out before its door instead
        const [px, pz] = family === 'handcart' ? [door.x + door.nx * (2.2 + rng() * 0.6) + tx * side * 0.6, door.z + door.nz * (2.2 + rng() * 0.6) + tz * side * 0.6] : [x, z];
        if (field._roadDist(px, pz) < roadClearance + r * 0.5) continue;
        if (field.getWaterMaskAt && field.getWaterMaskAt(px, pz) > 0.01) continue;
        if (field.getNormalAt(px, pz).y < 0.92) continue;
        // a piece against its own wall needs only its centre outside every plinth; the cart, out in the open, its whole radius
        if (plinths.some((q) => insidePlinth(q, px, pz, family === 'handcart' ? r * 0.6 : -0.02))) continue;
        if (small.some((s) => px + r > s.min[0] && px - r < s.max[0] && pz + r > s.min[2] && pz - r < s.max[2])) continue;
        if (out.some((p) => Math.hypot(p.x - px, p.z - pz) < DOORSTEP_FAMILY[p.family].r + r + 0.15)) continue;
        // the piece's back to the wall: its local +z faces out along the door's normal; a cart turned along the wall
        const yaw = Math.atan2(door.nx, door.nz) + (family === 'handcart' ? Math.PI / 2 * side : (rng() - 0.5) * 0.18);
        out.push({ family, x: px, y: field.getHeightAt(px, pz), z: pz, yaw, variant: (rng() * 8) | 0 });
        if (family !== 'handcart') { along = off + r + 0.1; side = -side; }
      }
    }
  }
  return out;
}
