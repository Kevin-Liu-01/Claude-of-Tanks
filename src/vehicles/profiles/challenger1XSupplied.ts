// Independent supplied-file rebuild. This entry deliberately calls none of
// the superseded handbook/photo Challenger profile or its vehicle helpers.
import { addChallenger1SuppliedHull } from './challenger1XSuppliedHull.ts';
import { addChallenger1SuppliedGear } from './challenger1XSuppliedGear.ts';
import { addChallenger1SuppliedTurret } from './challenger1XSuppliedTurret.ts';
import { addChallenger1SuppliedGun } from './challenger1XSuppliedGun.ts';
import { CHALLENGER1_SUPPLIED_DATUMS as D } from './challenger1XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export function buildChallenger1Supplied(P: TankBuilderPort): void {
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(D.trunnion[0]-D.turretPivot[0],
    D.trunnion[1]-D.turretPivot[1],D.trunnion[2]-D.turretPivot[2]);
  P.topY=D.structuralRoofY-D.turretPivot[1];
  addChallenger1SuppliedHull(P);
  addChallenger1SuppliedGear(P);
  addChallenger1SuppliedTurret(P);
  addChallenger1SuppliedGun(P);
}
