// Independently measured June-2024 supplied-file frame. These are scalar
// authoring datums, not a transform of the separate Char Leclerc builder.
import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export type ClassicPoint = readonly [number, number, number];
export const LECLERC_CLASSIC_X_DATUMS = Object.freeze({
  dims: { hullLengthM: 7.43927585874, overallLengthM: 10.03416968112,
    widthM: 3.6, heightM: 2.4667723048 },
  structuralRoofY: 2.4667723048, fixedOpticHeightM: 2.886042,
  highestFittingM: 3.19835755241,
  // The inner bearing axis is measured. The outer collar is offset by about
  // 4 mm in X/Z in the source and is deliberately not made concentric here.
  turretPivot: [-.0162842395776, 1.47698078437, .561125178827] as ClassicPoint,
  // The source has no pitch rig. X/Y are the round tube's measured axis;
  // Z is its visible rear attachment, an explicitly inferred internal joint.
  trunnion: [.00612553759845, 1.95678372667, 2.45012127254] as ClassicPoint,
  muzzleZ: 6.31453175175,
  trackCenters: [-1.3197594513, 1.2481384606] as const,
  wheelCenters: [-1.33865549123, 1.22690393301] as const,
  wheelY: .42155023396, wheelRadiusM: .3451203334,
  wheelZsLeft: [-1.981099159, -1.156655, -.2759985, .592166, 1.4478395, 2.2660375] as const,
  wheelZsRight: [-1.983363937, -1.1565415, -.2766605, .5899555, 1.4477285, 2.2657085] as const,
});

export function classicTurret(P: TankBuilderPort, bucket: string,
  g: THREE.BufferGeometry, x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0): void {
  const pivot = LECLERC_CLASSIC_X_DATUMS.turretPivot;
  P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2], rx, ry, rz);
}

export function classicGun(P: TankBuilderPort, bucket: string,
  g: THREE.BufferGeometry, x = 0, y = 0, z = 0): void {
  const pivot = LECLERC_CLASSIC_X_DATUMS.trunnion;
  P.add(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2]);
}
