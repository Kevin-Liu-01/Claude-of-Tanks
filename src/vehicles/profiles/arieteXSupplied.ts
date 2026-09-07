// Independent supplied-file authoring model. Geometry is native procedural;
// registry wiring does not imply visual or release qualification.
import { ARIETE_SUPPLIED_X_DATUMS as D } from './arieteXSuppliedFrame.ts';
import { addArieteXSuppliedHull } from './arieteXSuppliedHull.ts';
import { addArieteXSuppliedTurret } from './arieteXSuppliedTurret.ts';
import { addArieteXSuppliedGear } from './arieteXSuppliedGear.ts';
import { addArieteXSuppliedGun } from './arieteXSuppliedGun.ts';
import { addArieteXSuppliedEquipment } from './arieteXSuppliedEquipment.ts';
import { addArieteXSuppliedHullEquipment } from './arieteXSuppliedHullEquipment.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export function buildArieteXSupplied(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(D.trunnion[0] - D.turretPivot[0],
    D.trunnion[1] - D.turretPivot[1], D.trunnion[2] - D.turretPivot[2]);
  P.topY = 2.101908 - D.turretPivot[1];
  addArieteXSuppliedHull(P);
  addArieteXSuppliedGear(P);
  addArieteXSuppliedTurret(P);
  addArieteXSuppliedEquipment(P);
  addArieteXSuppliedHullEquipment(P);
  addArieteXSuppliedGun(P);
  P.hullG.userData.xRebuild = { candidate: 'ariete_c1_x', independent: true,
    sourceLocalOnly: true, datumVersion: 2, target: 'owner-selected-supplied-file' };
}
