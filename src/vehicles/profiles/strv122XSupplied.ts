// Entirely native, independently authored source-file target. Registry entry
// is an authoring checkpoint, never evidence of visual/release qualification.
import { STRV122_SUPPLIED_DATUMS as D } from './strv122XSuppliedFrame.ts';
import { addStrv122XSuppliedHull } from './strv122XSuppliedHull.ts';
import { addStrv122XSuppliedTurret } from './strv122XSuppliedTurret.ts';
import { addStrv122XSuppliedGear } from './strv122XSuppliedGear.ts';
import { addStrv122XSuppliedGun } from './strv122XSuppliedGun.ts';
import { addStrv122XSuppliedEquipment } from './strv122XSuppliedEquipment.ts';
import { addStrv122XSuppliedHullEquipment } from './strv122XSuppliedHullEquipment.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export function buildStrv122XSupplied(P: TankBuilderPort): void {
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(D.trunnion[0]-D.turretPivot[0],
    D.trunnion[1]-D.turretPivot[1],D.trunnion[2]-D.turretPivot[2]);
  P.topY=D.dims.heightM-D.turretPivot[1];
  addStrv122XSuppliedHull(P);
  addStrv122XSuppliedGear(P);
  addStrv122XSuppliedTurret(P);
  addStrv122XSuppliedEquipment(P);
  addStrv122XSuppliedHullEquipment(P);
  addStrv122XSuppliedGun(P);
  P.hullG.userData.xRebuild={candidate:'strv122_x',independent:true,
    sourceLocalOnly:true,datumVersion:2,target:'owner-selected-supplied-file'};
}
