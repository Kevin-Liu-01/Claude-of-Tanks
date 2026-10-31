// Merkava family closures (release 266, the roof-pocket census, tools/roof-pocket-census.mjs). The family's measured
// shells and parts (merkavaFamilySource.ts, release 265) leave a few slots under the armour's undersides with a part
// standing on each side: under the Mk 2's left cheek between the gun's boot and the cheek's outer plate, and the Mk 2D's
// stern seams under the lip. Each closure fills its slot, read off the census's air cells: a loft through stations along
// z, each its slot's x range and its floor and roof (the roof 1.2 cm up into the armour), in the painted detail bucket
// (welded filler, not armour: its underside roofs nothing). The Mk 3s' right cheek corner inside the spaced side plate,
// the Mk 3C's left flank behind its stand-off canisters and the Mk 2D's glacis lip over its spaced add-on plates stay
// open: filled, each read as a block in a shadowed recess to both blind critics (266). Owner frames: the turret's (ring
// centre at deck height) and the hull's. First-party construction: Kevin B. Liu (NOTICE.md).
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

const CLOSURES: Readonly<Partial<Record<MerkavaMarkId, readonly Closure[]>>> = Object.freeze({
  merkava2b: [MK2_LEFT_CHEEK_2B],
  merkava2d: [
    MK2D_LEFT_CHEEK,
    // the stern lip's two seams
    { owner: 'hull', stations: [[-3.08, 0.546, 0.746, 0.429, 0.541], [-3.04, 0.546, 0.746, 0.429, 0.501], [-3.00, 0.546, 0.706, 0.429, 0.461]] },
    { owner: 'hull', stations: [[-3.08, -0.694, -0.554, 0.429, 0.521], [-3.04, -0.694, -0.554, 0.429, 0.501], [-3.00, -0.694, -0.554, 0.429, 0.461]] },
  ],
});

/** The mark's closures, each lofted through its stations into the owner's painted detail bucket. */
export function buildMerkavaClosures(P: TankBuilderPort, id: MerkavaMarkId): void {
  for (const closure of CLOSURES[id] ?? []) {
    const sections = closure.stations.map(([z, x0, x1, y0, y1]) => ({ z,
      ring: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] as SectionPoint[] }));
    P.add(closure.owner === 'turret' ? 'turretPaintedDetail' : 'hullPaintedDetail', sectionSolid(sections));
  }
}
