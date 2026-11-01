// The Centurion Mk 5/2 DK (release 267; docs/references/tanks/centurion5_2dk.md): the Danish Mk 5/2, rearmed with the
// 105 mm L7A1 in 1964 and given its fire control in 1985 (armyvehicles.dk/centurion.htm: 90 tanks "upgraded with a laser
// range finder and night vision equipment"; Pansermuseet: "a new fire control system with a laser rangefinder, a thermal
// sight for the gunner, and image intensifying equipment for the driver and commander"). The Centurion family's Mk 5/2
// (profiles/centurionFamily.ts centurionFamilySteps, its builder untouched: the Centurion lane's ruling, 2026-10-29) with
// the Danish fit seated on it, as the photographs show: the rangefinder's armoured box on the mantlet's face right of the
// gun, its top over the mantlet's (armyvehicles.dk, the Oksbøl tank), and the gunner's thermal sight in its own box on the
// roof's right front, its window forward (Commons, Stevnsfortet). A +Z hull's right is -X. First-party procedural
// geometry: Kevin B. Liu (NOTICE.md).
import { KIT } from './kit.ts';
import { centurionFamilySteps } from './centurionFamily.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box } = KIT;

function addCenturionDkFit(P: TankBuilderPort): void {
  // the laser rangefinder's armoured box on the mantlet's face right of the gun, level with it (gun frame: the trunnion
  // at the origin, the mantlet's face 0.47-0.60 m ahead); ahead of the turret's front from -10 to +20 degrees, clear of
  // the tube; dark, with its lens forward under a visor (critics dk1: small, high and in the coat's brown, it read as a
  // camouflage patch; the Oksbøl photograph's box bulkier, level with the gun)
  P.add('gunMountDark', box(0.36, 0.30, 0.30), -0.42, 0.08, 0.65);
  P.add('gunMountGlass', box(0.20, 0.10, 0.008), -0.42, 0.10, 0.804);
  P.add('gunMountDark', box(0.26, 0.03, 0.06), -0.42, 0.175, 0.82);
  // the gunner's thermal sight in its box on the roof's right front (the roof 0.92-0.96 m there), its armoured window
  // forward
  P.addEquipment('turret', box(0.36, 0.12, 0.36), -0.58, 0.97, 0.52);
  P.addEquipment('turret', box(0.32, 0.16, 0.32), -0.58, 1.11, 0.52);
  P.addEquipment('turretDark', box(0.28, 0.12, 0.02), -0.58, 1.12, 0.685);
  P.add('turretGlass', box(0.22, 0.08, 0.008), -0.58, 1.12, 0.697);
  // the commander's image intensifier head on the cupola's forward face (the driver's sits in his periscope's place:
  // a head on the hatch stopped the gun at 5 degrees over the bow quarters, gun-depression-sweep 2026-11-01)
  P.addEquipment('turretDark', box(0.14, 0.10, 0.16), -0.62, 1.22, -0.18);
  P.turretG.userData.centurionDkReceipt = { mark: 'Mk 5/2 DK', laserRangefinderBox: 'right', thermalSightBox: 'right-front' };
}

function* buildCenturion52DkSteps(P: TankBuilderPort): TankProfileBuild {
  yield* centurionFamilySteps(P, 'mk5_2');
  addCenturionDkFit(P);
  yield 'buildCenturion52DkFit';
}

export const buildCenturion52DK = steppedBuilder((P: TankBuilderPort) => buildCenturion52DkSteps(P));
