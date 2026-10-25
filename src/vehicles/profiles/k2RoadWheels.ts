// Production K2 wheel stock, shared with the owner's XK2 and K2B variants.
// Axle stations and track courses remain properties of each chassis.
import * as THREE from 'three';
import { mergeAll } from '../factoryGeometry.ts';
import type { MeasuredTireBand } from '../measuredWheelGeometry.ts';
import type { RunningGearConfig } from '../tankFactoryCore.ts';

export const K2_ROAD_WHEELS = Object.freeze({
  wheelR: .3225,
  wheelW: .387,
  dishR: .90,
});

/** 2026-10-25 (the owner: "redo the k2b and xk2's tracks and wheels to look better"): the K2 X source twin wheel, sliced
 * through its axle between two bolt heads. Two rubber bands, each disc dished 12.4 cm behind its tire face, ten bolt
 * heads on a 167 mm circle, and a filleted hub boss standing out to 1.5 cm inside the face. Source metres, axial from
 * the wheel's centre plane; the fleet construction 'k2-dished-hub' (nationWheelConstructions.ts) draws the same stock. */
export const K2_TIRE_BANDS: readonly MeasuredTireBand[] = Object.freeze([-.10455, .10455].map(centerM => Object.freeze({
  centerM, widthM: .1769, innerRadiusM: .300,
})));

type Section = readonly [axial: number, radius: number];
function turned(rows: readonly Section[], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(rows.map(([x, r]) => new THREE.Vector2(r, x)), segments).rotateZ(-Math.PI / 2);
}

export function k2RoadWheelFace(side: -1 | 1, segments: number): THREE.BufferGeometry {
  // From the cap tip along the visible face (cap, boss, dish, rim wall, lip), then back under the tire to the axis
  const rows: readonly Section[] = [[.1779, 0], [.1760, .0476], [.1650, .0926], [.1444, .0972], [.0825, .1109],
    [.0756, .1287], [.0688, .1435], [.0688, .2595], [.0805, .2679], [.0905, .2749], [.1816, .2781], [.193, .2781],
    [.193, .300], [.019, .300], [.019, 0], [.1779, 0]];
  const geometry = turned([...rows].reverse(), segments);
  if (side < 0) geometry.rotateY(Math.PI);
  return geometry;
}

export function k2RoadWheelCore(segments: number): THREE.BufferGeometry {
  return turned([[-.019, 0], [-.019, .137], [.019, .137], [.019, 0], [-.019, 0]], segments);
}

/** The ten hexagonal bolt heads standing 7.6 mm off the dish face (HIGH only: roadWheelGeometry.ts WheelDetail). */
export function k2RoadWheelBolts(side: -1 | 1): THREE.BufferGeometry {
  const heads: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 10; k++) {
    const angle = (k * 36 + 9) * Math.PI / 180;
    heads.push(new THREE.CylinderGeometry(.017, .017, .0076, 6).rotateZ(Math.PI / 2)
      .translate(.0688 + .0038, .167 * Math.sin(angle), .167 * Math.cos(angle)));
  }
  const merged = mergeAll(heads);
  if (side < 0) merged.rotateY(Math.PI);
  return merged;
}

/** The running-gear fields that draw this stock on a K2 chassis natively (k2X.ts, modern3.ts buildK2): the bands, the
 * hub drum, both faces and, at HIGH, their bolt heads (LOW turns at the fleet's 12 segments). */
export function k2WheelGear(high: boolean, material: THREE.Material):
  Pick<RunningGearConfig, 'wheelTireBands' | 'wheelCoreGeometry' | 'wheelFaceLayers'> {
  const segments = high ? 32 : 12;
  return {
    wheelTireBands: K2_TIRE_BANDS,
    wheelCoreGeometry: { disc: k2RoadWheelCore(segments) },
    wheelFaceLayers: ([-1, 1] as const).flatMap((side) => [
      { geometry: k2RoadWheelFace(side, segments), material, side, name: `k2SourceWheelFace${side}` },
      ...(high ? [{ geometry: k2RoadWheelBolts(side), material, side, name: `k2SourceWheelBolts${side}` }] : []),
    ]),
  };
}
