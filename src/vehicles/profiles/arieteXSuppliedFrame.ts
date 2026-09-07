// Owner-directed supplied-file likeness. Scalars are measured from the fixed
// uniform comparison frame, not CIO real-vehicle dimensions or source arrays.
import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
export type ArietePoint = readonly [number, number, number];
export const ARIETE_SUPPLIED_X_DATUMS = Object.freeze({
  dims: { hullLengthM: 7.0114073416, overallLengthM: 8.5337977835,
    widthM: 3.61, heightM: 2.131347 },
  highestFittingM: 3.564580707, fixedOpticHeightM: 2.548532,
  // Actual lower bearing, not the source material owner's arbitrary origin.
  turretPivot: [0, 1.306227824, .328028885] as ArietePoint,
  // X/Y follow the round tube. Z is its visible rear seat; the source has no
  // pitch bone, so this hidden mechanical joint remains an explicit inference.
  trunnion: [0, 1.651499209, 1.3415539] as ArietePoint,
  muzzleZ: 5.028094113, boreFloorZ: 3.683820288,
  wheelY: .34611254, wheelRadiusM: .28975886,
  wheelX: 1.18048348, trackX: 1.177119,
});
export function arieteSourceTurret(P: TankBuilderPort, bucket: string,
  geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0): void {
  const pivot = ARIETE_SUPPLIED_X_DATUMS.turretPivot;
  // Structural stock must remain armor through damage/LOD; addEquipment
  // intentionally remaps a plain turret bucket into removable equipment.
  if (bucket === 'turret') P.add(bucket, geometry, x - pivot[0], y - pivot[1], z - pivot[2], rx, ry, rz);
  else P.addEquipment(bucket, geometry, x - pivot[0], y - pivot[1], z - pivot[2], rx, ry, rz);
}
