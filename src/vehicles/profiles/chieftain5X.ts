// Independent original construction from the complete owner-supplied Mk5
// reference. The former primary-photo draft is superseded, not a donor.
import { addChieftain5XSourceHull } from './chieftain5XSourceHull.ts';
import { addChieftain5XSourceGear } from './chieftain5XSourceGear.ts';
import { addChieftain5XSourceTurret } from './chieftain5XSourceTurret.ts';
import { addChieftain5XSourceGun } from './chieftain5XSourceGun.ts';
import { addChieftain5XSourceHullEquipment } from './chieftain5XSourceHullEquipment.ts';
import { addChieftain5XSourceTurretEquipment } from './chieftain5XSourceTurretEquipment.ts';
import { addChieftain5XSourceApplique } from './chieftain5XSourceApplique.ts';
import { addChieftain5XSourceClosure } from './chieftain5XSourceClosure.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];

export const CHIEFTAIN5_X_DATUMS = Object.freeze({
  chieftain5_x: {
    dims: { hullLengthM: 6.57542378005239, overallLengthM: 10.470842599868774,
      widthM: 3.509999990463257, heightM: 2.315201997756958 },
    structuralRoofY: 2.315201997756958, fixedOpticHeightM: 2.730199,
    highestFittingM: 3.8093717098236084,
    hullEquipmentLengthM: 7.209124,
    // The source bearing is warped and has no rig. These are explicitly
    // inferred functional axes inside its independently measured bearing/root.
    turretPivot: [.0031, 1.476, .36928] as Point,
    trunnion: [-.008067, 1.859441, 1.570] as Point,
    muzzleZ: 6.812053203582764,
  },
});
const D = CHIEFTAIN5_X_DATUMS.chieftain5_x;

export function buildChieftain5X(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(D.trunnion[0] - D.turretPivot[0],
    D.trunnion[1] - D.turretPivot[1], D.trunnion[2] - D.turretPivot[2]);
  P.topY = D.structuralRoofY - D.turretPivot[1];
  addChieftain5XSourceHull(P);
  addChieftain5XSourceGear(P);
  addChieftain5XSourceHullEquipment(P);
  addChieftain5XSourceClosure(P);
  addChieftain5XSourceTurret(P, D.turretPivot);
  addChieftain5XSourceTurretEquipment(P, D.turretPivot);
  addChieftain5XSourceApplique(P, D.turretPivot);
  addChieftain5XSourceGun(P, D.trunnion);
  // The source projector is an optic, not a complete roof weapon. Do not
  // relabel it as an MG or silently retain the obsolete inferred photo weapon.
  P.muzzleZ = D.muzzleZ - D.trunnion[2];
}

export const CHIEFTAIN5_X_PROFILES = Object.freeze({ chieftain5_x: { build: buildChieftain5X } });
