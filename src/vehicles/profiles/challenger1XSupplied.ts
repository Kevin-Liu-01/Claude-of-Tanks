import { addModernFieldCage } from './modernFieldCage.ts';
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
  // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): the bustle cage's low rail at .225 in the
  // turret frame (1.761 m), its lowest bar 1.742, so the cage clears the 1.73 engine deck behind the fighting compartment
  // as the turret turns; at the default it hung to 1.641 and swept 9 cm through the deck and its grilles.
  addModernFieldCage(P, { lowRail: .225 });
  // The ring receipt reads the deck at its well's floor (1.268), so its swept deck cannot seat the turret. The deck round
  // the ring is 1.622 and the engine deck behind it 1.73, and the turret's lower body and nose (1.57-1.65) ran through
  // both. Its seat (turretSeatRace.ts) takes that engine deck's plane, with a 1.5 cm seam, as a floor.
  P.turretG.userData.turretSeatMinY = 1.745;
}
