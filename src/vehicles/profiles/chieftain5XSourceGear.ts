// New native gear anchored to the complete supplied Mk5 wheel/track study.
// No former photo-draft axle, radius or course table is retained.
import { KIT } from './kit.ts';
import { roundedTrackContact } from './roundedTrackContact.ts';
import { chieftain5SourceWheelSolids } from './chieftain5XSourceWheels.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export const CHIEFTAIN5_SOURCE_ROAD_ZS = Object.freeze([
  -2.230051, -1.339106, -.420375, .470570, 1.491482, 2.382427,
]);

export function addChieftain5XSourceGear(P: TankBuilderPort): void {
  const wheelZs = [...CHIEFTAIN5_SOURCE_ROAD_ZS];
  const rollers = [-1.784579, .025545, 1.936953].map(z => ({ z, y: .978785, r: .14610 }));
  const wheels = chieftain5SourceWheelSolids(P.q ? 40 : 24);
  const sprocket = { z: -3.140714, y: .837166, r: .251866, trackR: .2574, toothTipRadiusM: .333432 };
  const idler = { z: 3.100381, y: .8788445, r: .25590, trackR: .2260 };
  const botY = .040, topY = 1.1553;
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', wheelR: .3952785, wheelW: .41679, wheelY: .4481615,
    wheelZs, wheelTireInnerRadiusM: .3195,
    wheelCoreGeometry: { disc: wheels.core },
    wheelFaceLayers: [
      { geometry: wheels.left, material: P.mats.wheels, side: -1, name: 'gearMk5SourceDishL' },
      { geometry: wheels.right, material: P.mats.wheels, side: 1, name: 'gearMk5SourceDishR' },
    ],
    xc: 1.2947382, roadWheelOutsetLeftM: -.0004482, roadWheelOutsetRightM: .0004482,
    // Object_10 has a 432.924 mm continuous running web between
    // X1.07872450 and1.51164842; only the shoe/connector extremities span
    // 609.499 mm. A full-width continuous web incorrectly occupies their air.
    trackW: .6094994, trackCarrierWidthM: .432923913, trackTh: .020, botY, topY,
    trackShoeDimensions: { padHeight: .016, grouserHeight: .010,
      webHeight: .03178, hornHeight: .060 },
    sprocket, idler, rollers, returnRollerWidthM: .22856,
    returnRollerOutsetM: .00448, returnRollerInsetM: .010,
    suspensionPattern: 'paired-bogie',
    // The supplied levers are not rigged. The functional native pivots use
    // the measured paired axle groups; hidden spring travel remains inferred.
    suspensionDimensions: { armWidthM: .124, armHeightM: .174,
      armAxleHeightM: .151, armCenterAbsXM: .964,
      anchorBossWidthM: .170, anchorBossRadiusM: .100,
      anchorBossCenterAbsXM: .956,
      axleBossWidthM: .206, axleBossRadiusM: .086,
      axleBossCenterAbsXM: 1.022, anchorLiftM: .010 },
    loopPoints: roundedTrackContact(KIT.trackLoopPoints({
      idler, sprocket, contact: { zR: -2.21302, zF: 2.34030 }, botY, topY,
      supports: rollers.map(r => ({ z: r.z, y: 1.1515 + (r.z + 3.08) * .00131 })),
      sag: .001, frontArcSteps: 24, rearArcSteps: 24,
    }), botY, .3952785),
    rigidLinkChords: true, arms: true, coveredTop: true, paintedEnds: true,
  });
  // Source-visible spring-group housings stay permanent hull equipment.
  // Their small concealed lap into the carrier is a construction allowance.
  for (const side of [-1, 1]) for (const z of [-1.784579, .025545, 1.936953]) {
    P.addEquipment('hullDetail', KIT.box(.190, .665, .282), side * .972, .772, z);
    P.addEquipment('hullDetail', KIT.cylX(.132, .190, 24), side * .972, .481, z);
  }
}
