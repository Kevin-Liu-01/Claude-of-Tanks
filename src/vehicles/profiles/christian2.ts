// The Christian II (release 262): a fictional Danish Army concept MBT. The owner, 2026-10-27: "the christian 2 is based
// off the leopard, take innnspo from japanese type 90. but dress it in a ton of netting and ghillie", then "that type90
// is a leopard anyways so basee off of that type 90 pleasee". It is an explicit first-party derivative of the Type 90 X
// (type90X.ts, kept byte-identical: hull, running gear, slab-sided turret, bustle autoloader, sights and Rh 120 L/44)
// with the Christian II's own deltas: bolted spaced armour modules along both compartment walls, flank bins on the
// bustle, Danish markings and paint, and the fleet's heavy field netting and garnish over all of it
// (ghillieFleetSuits.ts christian2). The supplied concept GLB was read for proportions only and nothing of it ships
// (docs/references/tanks/christian2.md; docs/references/concepts/christian2-20261027.json).
//
// Frames: the Type 90 X authors in world metres; turret pieces subtract its pivot (0, 1.681682, 0.156993). +X is the
// hull's left (the world's right of a +Z hull is -X).
import { KIT } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { buildType90X } from './type90X.ts';
import { CHRISTIAN2_PIVOT, CHRISTIAN2_SIDE_MODULES, christian2WallX } from '../christian2Armor.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

const PIVOT = CHRISTIAN2_PIVOT;

/** World metres to the turret frame. */
const local = (x: number, y: number, z: number): [number, number, number] => [x - PIVOT[0], y - PIVOT[1], z - PIVOT[2]];

/** Three bolted spaced-armour modules a side along the compartment wall, seated on spacer blocks. */
function sideModules(P: TankBuilderPort): void {
  const { box, cylX } = KIT;
  const M = CHRISTIAN2_SIDE_MODULES;
  for (const side of [-1, 1]) {
    for (const [z0, z1] of M.spans) {
      // the plate follows the wall's plan line station by station, its upper outer edge chamfered
      const ring = (z: number): SectionPoint[] => {
        const inner = christian2WallX(z, side) + M.standoffM, outer = inner + M.depthM;
        const yl = M.y0 - PIVOT[1], yh = M.y1 - PIVOT[1];
        const r: SectionPoint[] = [[inner, yl], [outer, yl], [outer, yh - 0.035], [outer - 0.035, yh], [inner, yh]];
        return side > 0 ? r : r.map(([x, y]) => [-x, y] as SectionPoint).reverse();
      };
      P.addExternalArmor('turret', sectionSolid([z0, (z0 + z1) / 2, z1].map((z) => ({ z: z - PIVOT[2], ring: ring(z) }))));
      // spacers from the wall into the plate, and the bolt heads on the plate face
      for (const z of [z0 + 0.10, z1 - 0.10]) {
        const wall = christian2WallX(z, side);
        for (const y of [M.y0 + 0.08, M.y1 - 0.10]) {
          P.addExternalArmor('turret', box(M.standoffM + 0.03, 0.07, 0.07), ...local(side * (wall + (M.standoffM + 0.03) / 2 - 0.01), y, z));
          P.add('turretDetail', cylX(0.024, 0.014, 8), ...local(side * (wall + M.standoffM + M.depthM + 0.004), y, z));
        }
      }
    }
  }
}

/** Bolted stowage bins on the bustle's flanks, between the smoke banks and the whip pots. */
function bustleBins(P: TankBuilderPort): void {
  const { box } = KIT;
  for (const side of [-1, 1]) {
    // the bustle wall runs from x 1.263/1.153 at z -1.47 to 1.230/1.114 at -2.008 (-X/+X)
    const wall = side < 0 ? 1.255 : 1.145;
    const w = 0.15, z0 = -1.80, z1 = -1.34, y0 = 1.90, y1 = 2.19, zc = (z0 + z1) / 2;
    P.add('turretDetail', box(w, y1 - y0, z1 - z0), ...local(side * (wall + w / 2), (y0 + y1) / 2, zc));
    P.add('turretDark', box(w + 0.006, 0.012, z1 - z0 - 0.04), ...local(side * (wall + w / 2), y1 - 0.05, zc));
    for (const z of [z0 + 0.09, z1 - 0.09]) P.add('turretDark', box(0.03, 0.06, 0.05), ...local(side * (wall + w + 0.012), y1 - 0.10, z));
    P.add('turretDetail', box(0.05, 0.05, z1 - z0 + 0.06), ...local(side * (wall + 0.02), y0 - 0.025, zc));   // shelf
  }
}

function buildChristian2(P: TankBuilderPort): void {
  buildType90X(P);
  sideModules(P);
  bustleBins(P);
  // the tactical number on the middle module of each side
  for (const side of [-1, 1]) {
    P.decal('turret', 'number', null, 0.22, local(side * (christian2WallX(0.365, side) + CHRISTIAN2_SIDE_MODULES.standoffM + CHRISTIAN2_SIDE_MODULES.depthM + 0.003), 2.03, 0.365), side * Math.PI / 2);
  }
  addVehicleGhillieSuit(P);
}

export const CHRISTIAN2_PROFILES = {
  christian2: { build: buildChristian2 },
} satisfies VehicleProfileRecord;
