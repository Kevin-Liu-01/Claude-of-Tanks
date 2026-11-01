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
  // the laser rangefinder's box on the mantlet's face right of the gun (gun frame: the trunnion at the origin, the
  // mantlet's top 0.34 m over it and its face 0.47-0.60 m ahead), standing 8 cm over the mantlet's top; ahead of the
  // turret's front at +20 degrees, clear of the tube
  P.add('gunMount', box(0.26, 0.32, 0.26), -0.36, 0.26, 0.63);
  P.add('gunMountDark', box(0.18, 0.10, 0.02), -0.36, 0.32, 0.765);
  P.add('gunMountGlass', box(0.13, 0.06, 0.008), -0.36, 0.32, 0.777);
  // the gunner's thermal sight in its box on the roof's right front (the roof 0.92-0.96 m there), its armoured window
  // forward
  P.addEquipment('turret', box(0.36, 0.12, 0.36), -0.58, 0.97, 0.52);
  P.addEquipment('turret', box(0.32, 0.16, 0.32), -0.58, 1.11, 0.52);
  P.addEquipment('turretDark', box(0.24, 0.09, 0.02), -0.58, 1.12, 0.685);
  P.add('turretGlass', box(0.18, 0.06, 0.008), -0.58, 1.12, 0.697);
  // the image intensifier heads: on the cupola's forward face and on the driver's hatch
  P.addEquipment('turretDark', box(0.14, 0.10, 0.16), -0.62, 1.22, -0.18);
  P.addEquipment('hullDark', box(0.16, 0.09, 0.10), -0.40, 1.795, 2.38);
  P.turretG.userData.centurionDkReceipt = { mark: 'Mk 5/2 DK', laserRangefinderBox: 'right', thermalSightBox: 'right-front' };
}

function* buildCenturion52DkSteps(P: TankBuilderPort): TankProfileBuild {
  yield* centurionFamilySteps(P, 'mk5_2');
  addCenturionDkFit(P);
  yield 'buildCenturion52DkFit';
}

export const buildCenturion52DK = steppedBuilder((P: TankBuilderPort) => buildCenturion52DkSteps(P));
