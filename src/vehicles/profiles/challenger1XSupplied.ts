import { addModernFieldCage } from './modernFieldCage.ts';
// Independent supplied-file rebuild. This entry deliberately calls none of
// the superseded handbook/photo Challenger profile or its vehicle helpers.
import { addChallenger1SuppliedHull, type Challenger1SuppliedHullOptions } from './challenger1XSuppliedHull.ts';
import { addChallenger1SuppliedGear } from './challenger1XSuppliedGear.ts';
import { addChallenger1SuppliedTurret } from './challenger1XSuppliedTurret.ts';
import { addChallenger1SuppliedGun } from './challenger1XSuppliedGun.ts';
import { CHALLENGER1_SUPPLIED_DATUMS as D } from './challenger1XSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export function buildChallenger1Supplied(P: TankBuilderPort): void {
  assembleChallenger1Supplied(P, {});
}
/** Release 262 (owner 2026-10-28): the plain Challenger 1 on the same build, without the Op Granby kit (the Mk 1, Mk 2). */
export function buildChallenger1SuppliedPlain(P: TankBuilderPort): void {
  assembleChallenger1Supplied(P, { granbyKit: false });
}
function assembleChallenger1Supplied(P: TankBuilderPort, hull: Challenger1SuppliedHullOptions): void {
  P.hullG.position.set(0,0,0);
  P.turretG.position.set(...D.turretPivot);
  P.gunG.position.set(D.trunnion[0]-D.turretPivot[0],
    D.trunnion[1]-D.turretPivot[1],D.trunnion[2]-D.turretPivot[2]);
  P.topY=D.structuralRoofY-D.turretPivot[1];
  addChallenger1SuppliedHull(P, hull);
  addChallenger1SuppliedGear(P);
  addChallenger1SuppliedTurret(P);
  addChallenger1SuppliedGun(P);
  // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): the bustle cage's low rail at .225 in the
  // turret frame (1.761 m), its lowest bar 1.742, so the cage clears the 1.73 engine deck behind the fighting compartment
  // as the turret turns; at the default it hung to 1.641 and swept 9 cm through the deck and its grilles.
  addModernFieldCage(P, { lowRail: .225 });
  // The ring receipt reads the deck at its well's floor (1.268), so its swept deck cannot seat the turret. The deck round
  // the ring is 1.622, and the turret's lower body (1.57) stood 5 cm into it; its seat (turretSeatRace.ts) takes that
  // deck's plane with its 3 cm seam as a floor (the engine roof steps up past the turret's sweep: the hull).
  P.turretG.userData.turretSeatMinY = 1.652;
  // Its measured rim reads the interior fills (.8237 with one set, .8657 with the next), so the chain never settles; the
  // seat keeps a fixed radius, the hull opening's (.8237) with its 2 cm clearance, so the turret's lower collar over the
  // deck's edge (1.57, out to .88) comes up too.
  P.turretG.userData.turretSeatKeepR = .8437;

}
