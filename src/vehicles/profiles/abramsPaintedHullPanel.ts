import type * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** Fixed painted body sheets need the same vehicle-space camouflage as
 * the hull. Keep fittings/stowage in their independent material buckets.
 * These guards do not enlarge the base armor envelope and remain visible
 * with the silhouette at distance; their real collision plates are separate. */
export function addAbramsPaintedHullPanel(P: TankBuilderPort, side: number,
  geometry: THREE.BufferGeometry, x=0, y=0, z=0): void {
  geometry.userData.abramsPaintedHullPanel = true;
  P.addEquipment(side < 0 ? 'hullTrackGuardL' : 'hullTrackGuardR', geometry, x, y, z);
}

