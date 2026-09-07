// Owner-selected supplied-file shape frame. This is not the manufacturer's
// dimensional envelope. No old Strv/Leopard profile or source triangles used.
import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
export type StrvPoint = readonly [number, number, number];
export const STRV122_SUPPLIED_DATUMS = Object.freeze({
  dims: { hullLengthM: 7.524020894, overallLengthM: 9.30952060,
    widthM: 3.78, heightM: 2.5256 },
  highestFittingM: 5.35913175,
  // The fused source contains no rig. Functional yaw and pitch locations are
  // explicit inferences inside its measured bearing and cannon root.
  turretPivot: [0, 1.705, -.12] as StrvPoint,
  trunnion: [.00787, 2.02397, 1.24] as StrvPoint,
  muzzleZ: 5.48842252,
});

export function strvSourceTurret(P: TankBuilderPort, bucket: string,
  g: THREE.BufferGeometry, x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0): void {
  const p = STRV122_SUPPLIED_DATUMS.turretPivot;
  if (bucket === 'turret') P.add(bucket, g, x-p[0], y-p[1], z-p[2], rx, ry, rz);
  else P.addEquipment(bucket, g, x-p[0], y-p[1], z-p[2], rx, ry, rz);
}
