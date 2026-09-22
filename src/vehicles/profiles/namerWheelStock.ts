import * as THREE from 'three';
import { KIT } from './kit.ts';
import { lathedWheelSection, type AxialWheelStation } from './lathedWheelStock.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// Source wheel18 axial first hits, SHA72afdec0. Retain the existing axle and
// chassis scale; only the outward rim, recessed web and stepped hub change.
const AXLE_X = 1.444 * .95;
const axial = (sourceX: number): number => (sourceX - AXLE_X) / .95;
const TIRE_BACK = axial(1.350851);
const TIRE_FRONT = axial(1.490957);
const WEB_FRONT = axial(1.376765);

function wheelMetal(segments: number): THREE.BufferGeometry {
  // The old inboard axle tip remains at -.2516, so the existing suspension
  // receiver and its finite clearance stay fixed. It is wholly behind the
  // visible face. No front cap spans the source's deep annular recess.
  // 2026-09-22 wheel audit: the source hub cap (X1.522377) stood 3.1 cm proud of the tire front; the
  // fleet seat is 2.5 cm, so the cap sits at X1.513730 (2.4 cm) and the cone to R.08799 keeps its station.
  const section: AxialWheelStation[] = [
    [-.2516, 0], [axial(1.513730), 0], [axial(1.513730), .06222],
    [axial(1.481370), .08799], [axial(1.454791), .08799],
    [axial(1.454791), .11511], [WEB_FRONT, .11511],
    [WEB_FRONT, .29610], [TIRE_FRONT, .29610], [TIRE_FRONT, .305],
    [TIRE_BACK, .305], [TIRE_BACK, .09298], [-.2516, .04774],
  ];
  return lathedWheelSection(section, segments);
}

function tireExtension(segments: number): THREE.BufferGeometry {
  // The central band is emitted through the native tire hook. These two
  // side-specific annuli complete the retained inboard contact stock and the
  // measured outward tire without filling the steel web or inter-tire gap.
  const ranges = [[-.17, axial(1.312882)], [-TIRE_BACK, TIRE_FRONT]];
  return KIT.mergeAll(ranges.map(([back, front]) => lathedWheelSection([
    [back, .303], [front, .303], [front, .341], [back, .341],
  ], segments)));
}

export function namerWheelStock(P: TankBuilderPort) {
  const segments = P.q ? 24 : 12;
  const steel = wheelMetal(segments), rubber = tireExtension(segments);
  return {
    wheelCoreGeometry: { disc: KIT.cylX(.04774, .10, P.q ? 12 : 8) },
    wheelTireBands: [{ centerM: 0, widthM: -2 * TIRE_BACK, innerRadiusM: .303 }],
    wheelFaceLayers: ([-1, 1] as const).flatMap(side => {
      const face = side < 0 ? steel.clone().rotateY(Math.PI) : steel;
      const tire = side < 0 ? rubber.clone().rotateY(Math.PI) : rubber;
      return [
        { geometry: face, material: P.mats.wheels, side,
          name: `gearRoadWheelDetailNamerSteel${side}`, appearanceRole: 'wheelDish' },
        { geometry: tire, material: P.mats.rubber, side,
          name: `gearRoadWheelDetailNamerTire${side}`, appearanceRole: 'wheelTire' },
      ];
    }),
  };
}
