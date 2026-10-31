// Merkava family closures (release 266, the roof-pocket census, tools/roof-pocket-census.mjs). The family's measured
// shells and parts (merkavaFamilySource.ts, release 265) leave a few slots under the armour's undersides with a part
// standing on each side: under the Mk 2's left cheek between the gun's boot and the cheek's outer plate, at the Mk 3's
// right cheek corner inside its side plate, under the Mk 3C's left flank inside the bustle brackets, and the Mk 2D's
// thin seams under the glacis lip over its add-on plates and under the stern's lip. Each closure fills its slot, read
// off the census's air cells: a loft through stations along z, each its slot's x range and its floor and roof (the roof
// 1.2 cm up into the armour), in the painted detail bucket (welded filler, not armour: its underside roofs nothing).
// Owner frames: the turret's (ring centre at deck height) and the hull's. First-party construction: Kevin B. Liu
// (NOTICE.md).
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { MerkavaMarkId } from './merkavaFamilyMarks.ts';

/** A station: z, the slot's x range, its floor and its roof (owner frame, m). */
type Station = readonly [z: number, x0: number, x1: number, y0: number, y1: number];
interface Closure { readonly owner: 'turret' | 'hull'; readonly stations: readonly Station[] }

// the Mk 2s' left cheek: its underside rises 0.355 m per m toward the nose (0.195 at z 1.67); the closure's floor runs
// level under the boot's flank, then ramps up with the outer plate's lower edge to the nose; its roof 1.2 cm up the underside
const mk2CheekRoof = (z: number): number => 0.207 + (z - 1.669) * 0.355;
const MK2_LEFT_CHEEK_2B: Closure = { owner: 'turret', stations: ([
  [1.72, 0.538, 0.578, 0.201], [1.80, 0.538, 0.618, 0.201], [1.84, 0.278, 0.618, 0.201], [1.88, 0.218, 0.598, 0.201],
  [2.00, 0.218, 0.558, 0.201], [2.04, 0.228, 0.538, 0.201], [2.10, 0.228, 0.508, 0.243], [2.24, 0.258, 0.418, 0.341],
] as const).map(([z, x0, x1, y0]): Station => [z, x0, x1, y0, mk2CheekRoof(z)]) };
const MK2D_LEFT_CHEEK: Closure = { owner: 'turret', stations: [
  [1.80, 0.438, 0.638, 0.167, 0.199], [1.84, 0.318, 0.638, 0.167, 0.219], [1.92, 0.218, 0.598, 0.167, 0.239],
  [1.96, 0.218, 0.598, 0.167, 0.259], [2.00, 0.218, 0.578, 0.167, 0.259],
] };
// the Mk 3s' right cheek corner, inside its side plate: its front ramps up to the cheek's underside, a face turned down
// and forward like the overhang ahead of it, not a block standing in it
const MK3_RIGHT_CHEEK_CORNER: Closure = { owner: 'turret', stations: [
  [1.52, -0.902, -0.822, 0.12, 0.152], [1.56, -0.922, -0.742, 0.12, 0.152], [1.60, -0.922, -0.682, 0.12, 0.172],
  [1.64, -0.902, -0.462, 0.12, 0.192], [1.66, -0.882, -0.461, 0.12, 0.196], [1.70, -0.862, -0.460, 0.18, 0.198],
] };

const CLOSURES: Readonly<Partial<Record<MerkavaMarkId, readonly Closure[]>>> = Object.freeze({
  merkava2b: [MK2_LEFT_CHEEK_2B],
  merkava2d: [
    MK2D_LEFT_CHEEK,
    // the glacis lip's seam: a fairing from the lip's front edge down to the add-on plates' top edge (facing up and forward
    // as the glacis does), and the stern lip's two seams
    { owner: 'hull', stations: [[3.34, -0.644, 0.636, 0.829, 0.905], [3.40, -0.644, 0.636, 0.840, 0.897],
      [3.455, -0.644, 0.636, 0.850, 0.862]] },
    { owner: 'hull', stations: [[-3.08, 0.546, 0.746, 0.429, 0.541], [-3.04, 0.546, 0.746, 0.429, 0.501], [-3.00, 0.546, 0.706, 0.429, 0.461]] },
    { owner: 'hull', stations: [[-3.08, -0.694, -0.554, 0.429, 0.521], [-3.04, -0.694, -0.554, 0.429, 0.501], [-3.00, -0.694, -0.554, 0.429, 0.461]] },
  ],
  merkava3c: [
    MK3_RIGHT_CHEEK_CORNER,
    // under the left flank's fall to the ring, inside the bustle brackets (2 mm inboard of their inner faces), each end
    // tapering to a sliver so no cap stands behind the canisters
    { owner: 'turret', stations: [
      [-1.60, 1.050, 1.058, 0.27, 0.30], [-1.56, 0.918, 1.058, 0.26, 0.292], [-1.52, 0.838, 1.058, 0.24, 0.292],
      [-1.48, 0.798, 1.058, 0.22, 0.272], [-1.44, 0.758, 1.058, 0.20, 0.272], [-1.40, 0.718, 1.058, 0.18, 0.252],
      [-1.36, 0.718, 1.058, 0.16, 0.252], [-1.32, 0.658, 1.058, 0.14, 0.232], [-1.28, 0.638, 1.058, 0.12, 0.212],
      [-1.24, 0.638, 1.058, 0.12, 0.212], [-1.20, 0.718, 1.058, 0.12, 0.192], [-1.16, 0.798, 1.058, 0.12, 0.172],
      [-1.12, 0.878, 1.058, 0.12, 0.172], [-1.04, 0.938, 1.058, 0.12, 0.188], [-1.00, 1.050, 1.058, 0.12, 0.18],
    ] },
  ],
  merkava3_baz: [MK3_RIGHT_CHEEK_CORNER],
});

/** The mark's closures, each lofted through its stations into the owner's painted detail bucket. */
export function buildMerkavaClosures(P: TankBuilderPort, id: MerkavaMarkId): void {
  for (const closure of CLOSURES[id] ?? []) {
    const sections = closure.stations.map(([z, x0, x1, y0, y1]) => ({ z,
      ring: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as SectionPoint[] }));
    P.add(closure.owner === 'turret' ? 'turretPaintedDetail' : 'hullPaintedDetail', sectionSolid(sections));
  }
}
