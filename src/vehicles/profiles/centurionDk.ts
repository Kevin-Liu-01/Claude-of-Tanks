// The Centurion Mk 5/2 DK (release 265; docs/references/tanks/centurion5_2dk.md): the Danish Mk 5/2, rearmed with the
// 105 mm L7A1 in 1964 and given its fire control in 1985 (armyvehicles.dk/centurion.htm: 90 tanks "upgraded with a laser
// range finder and night vision equipment"; Pansermuseet: "a new fire control system with a laser rangefinder, a thermal
// sight for the gunner, and image intensifying equipment for the driver and commander"). The Mk 5/2's build (profiles/
// uk.ts centurionBuildSteps) with the Danish fit seated on it, as armyvehicles.dk's photograph of the Oksbøl tank shows:
// the rangefinder's armoured box over the gun on its right, riding the mantlet, and the gunner's thermal sight in its
// own box on the roof's right front. A +Z hull's right is -X. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT } from './kit.ts';
import { centurionBuildSteps, type UKCenturionPort } from './uk.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylY } = KIT;

function addCenturionDkFit(P: TankBuilderPort): void {
  // the laser rangefinder's armoured box on the mantlet's top right, pitching with the gun (gun frame)
  P.add('gunMount', box(0.30, 0.22, 0.44), -0.30, 0.30, 0.06);
  P.add('gunMountDark', box(0.22, 0.12, 0.02), -0.30, 0.31, 0.29);
  P.add('gunMountGlass', box(0.16, 0.07, 0.008), -0.30, 0.31, 0.302);
  P.add('gunMount', box(0.06, 0.12, 0.20), -0.30, 0.15, -0.02);
  // the gunner's thermal sight in its box on the roof's right front, its armoured window forward
  P.addEquipment('turret', box(0.34, 0.12, 0.40), -0.62, 0.78, 0.38);
  P.addEquipment('turret', box(0.30, 0.20, 0.36), -0.62, 0.94, 0.38);
  P.addEquipment('turretDark', box(0.24, 0.12, 0.02), -0.62, 0.95, 0.565);
  P.add('turretGlass', box(0.18, 0.07, 0.008), -0.62, 0.95, 0.578);
  // the image intensifier heads on the cupola's forward block and on the driver's periscope
  P.addEquipment('turretDark', box(0.14, 0.10, 0.12), -0.45, 1.06, -0.12);
  P.addEquipment('hullDark', cylY(0.06, 0.07, 0.08, 10), -0.62, 1.62, 2.30);
  P.turretG.userData.centurionDkReceipt = { mark: 'Mk 5/2 DK', laserRangefinderBox: 'right', thermalSightBox: 'right-front' };
}

function* buildCenturion52DkSteps(P: TankBuilderPort): TankProfileBuild {
  yield* centurionBuildSteps(P as unknown as UKCenturionPort, 5);
  addCenturionDkFit(P);
  yield 'buildCenturion52DkFit';
}

export const buildCenturion52DK = steppedBuilder((P: TankBuilderPort) => buildCenturion52DkSteps(P));
