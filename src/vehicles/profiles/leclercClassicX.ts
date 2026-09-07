// Standalone first-party Leclerc X from the owner's older supplied revision.
// No other vehicle builder, whole-model wrapper or source geometry is used.
import { addLeclercClassicXHull } from './leclercClassicXHull.ts';
import { addLeclercClassicXTurret } from './leclercClassicXTurret.ts';
import { addLeclercClassicXEquipment } from './leclercClassicXEquipment.ts';
import { addLeclercClassicXGear } from './leclercClassicXGear.ts';
import { LECLERC_CLASSIC_X_DATUMS as D } from './leclercClassicXFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
export { LECLERC_CLASSIC_X_DATUMS } from './leclercClassicXFrame.ts';

export function buildLeclercClassicX(P: TankBuilderPort): void {
  P.hullG.position.set(0, 0, 0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(D.trunnion[0] - D.turretPivot[0],
    D.trunnion[1] - D.turretPivot[1], D.trunnion[2] - D.turretPivot[2]);
  P.topY = D.structuralRoofY - D.turretPivot[1];
  addLeclercClassicXHull(P);
  addLeclercClassicXGear(P);
  addLeclercClassicXTurret(P);
  addLeclercClassicXEquipment(P);
  P.hullG.userData.xRebuild = { candidate: 'leclerc_classic_x', independent: true,
    sourceLocalOnly: true, datumVersion: 1 };
}

export const LECLERC_CLASSIC_X_PROFILES = Object.freeze({
  leclerc_classic_x: { build: buildLeclercClassicX },
});
