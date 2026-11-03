// The Olifant TTD, Tank Technology Demonstrator (release 269; Main's ruling 2026-11-02 on the owner's "flesh out south
// african and australian tank trees"; the owner, the same day: "the ttd needs to properly be based on an actual leopard
// 2"; docs/references/tanks/ttd.md): Project Loggim's one prototype, finished in 1992 (Reumech OMC the hull, Lyttelton
// Engineering Works the turret and gun), at the SA Armour Museum since 1996-97. Built on the fleet's Leopard 2: the
// release's Leopard 2-pattern hull and seven-wheel gear (leopard2Hull.ts: Leopard 2-type torsion bars, four return
// rollers, the rear sprocket, as TE records the TTD's) and the 2A4 turret with its square block front
// (leopard2A4Turret.ts), whose flat cheeks either side of the slot, right-hand cupola and bustle the TTD's photographs
// share; the TTD's own fit over it (tanks-encyclopedia; the parade, mobility and top-down photographs): two banks of four
// 81 mm dischargers on the roof's side edges behind an armour sheet in place of the 2A4's rear-corner blocks, the
// loader's 7.62 mm FN MAG, the trials number on the lower nose. The trials gun was the 105 mm GT3 in its thermal sleeve,
// 51 calibres: the 2A4's sleeved L/44 tube stands for it within 5 % of its length and 1 cm of its girth.
// A +Z hull's right is -X: the commander and gunner sit at -X, the loader at +X.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT } from './kit.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { addLeopard2SternRackFloor, buildLeopard2Hull } from './leopard2Hull.ts';
import { buildLeopard2A4Turret } from './leopard2A4Turret.ts';
import { LEO2A4_TURRET } from '../leopard2A4FamilyArmor.ts';
import { LEOPARD2_HULL } from '../leopard2HullDatums.ts';
import { EARLY_LEOPARD2_FORE_SKIRT_DROP_M, EARLY_LEOPARD2_FORWARD_LIFT_EYE_Z } from '../leopard2a3B4Armor.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** The TTD's own fit on the 2A4 turret (turret metres from the ring's centre on the deck). */
function addTtdKit(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const T = LEO2A4_TURRET, roof = T.roofY;
  // the two banks of four 81 mm dischargers on the roof's side edges, behind the cupolas, raised forward and splayed out,
  // the armour sheet standing over each wall's top edge outboard of them (TE: "two banks of four ... behind an armour
  // sheet"; the top-down photograph)
  for (const s of [-1, 1] as const) {
    const wall = s < 0 ? T.wallRightM : T.wallLeftM, x = s * (wall - 0.22), z0 = -0.95;
    // (269 blind critic: the banks read low and small at range) the tubes on a raised block, their muzzles over the
    // sheet's top edge in profile and dark at the bore, the sheet half as tall again
    P.addEquipment('turret', box(0.20, 0.17, 0.62), x, roof + 0.085, z0 + 0.25);
    for (let k = 0; k < 4; k++) {
      const z = z0 + 0.02 + k * 0.155;
      P.add('turretDetail', markSmokeTube(cylZ(0.042, 0.24, 12)), x, roof + 0.24, z, -0.62, s * 0.30, 0);
      P.add('turretDark', cylZ(0.030, 0.245, 10), x, roof + 0.24, z, -0.62, s * 0.30, 0);
    }
    P.addEquipment('turret', box(0.03, 0.30, 0.76), s * (wall - 0.035), roof + 0.10, z0 + 0.25);
  }
  P.turretG.userData.ttdTurretReceipt = Object.freeze({
    revision: 'ttd-269-leopard2', base: 'leopard2a4-block', roofY: roof, dischargers: 8, sheetedDischargers: true,
    loaderMG: 'mag', trialsNumber: 'TTD 001 M',
  });
}

/** The TTD on the Leopard 2: the hull, the 2A4 turret's square block front, its own fit. */
export function buildTtd(P: TankBuilderPort): void {
  buildLeopard2Hull(P, { flapName: 'ttd-rear-flap', exhaust: 'louvre', foreSkirtDropM: EARLY_LEOPARD2_FORE_SKIRT_DROP_M,
    fuelFillers: false, forwardLiftEyeZ: EARLY_LEOPARD2_FORWARD_LIFT_EYE_Z });
  // the stern rack floored as the early Leopards' and the Christian II's (open, it read through to the ground from above:
  // the standard check's contiguity, 54 cells at x 0, z -3.99, release 269)
  addLeopard2SternRackFloor(P);
  buildLeopard2A4Turret(P, { gun: 'L44', front: 'block', seed: 26900, loaderMG: { cls: 'mag', name: 'ttdLoaderMag' },
    smoke: false, whips: true, sideBins: true, rearBox: false });
  addTtdKit(P);
  // the trials number on the lower nose (the parade photograph: "TTD 001 M"), on the plate's face
  const [za, ya] = LEOPARD2_HULL.belly[LEOPARD2_HULL.belly.length - 2], [zb, yb] = LEOPARD2_HULL.belly[LEOPARD2_HULL.belly.length - 1];
  const tilt = Math.atan2(zb - za, yb - ya);
  P.decal('hull', 'stencil', 'TTD 001 M', 0.18, [0, (ya + yb) / 2, (za + zb) / 2 + 0.012], 0, tilt);
  P.topY = 1.22;
}

/** The TTD's datums for its fixture (profiles/southAfrica.selftest.mjs): the Leopard 2 construction's, the muzzle's
 * station ahead of the hull's middle with the gun level. */
export const TTD_DATUMS = Object.freeze({
  hull: LEOPARD2_HULL, roadWheelZs: LEOPARD2_HULL.wheelZs,
  muzzleHullZ: LEO2A4_TURRET.pivot[2] + LEO2A4_TURRET.gunLocal[2] + LEO2A4_TURRET.barrelL44M,
});
