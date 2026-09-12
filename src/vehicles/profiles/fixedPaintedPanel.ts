import type * as THREE from 'three';

/** A finish-only migration of explicitly authored fixed hull stock. This
 * never changes the geometry, damage owner or source registration. */
export function markFixedPaintedPanel<T extends THREE.BufferGeometry>(geometry: T, label: string,
  sourceBucket: 'hullDetail' | 'hullRubber' | 'turretDetail'): T {
  if (!label) throw new RangeError('Fixed painted panel requires a specific authored label');
  // BufferGeometry.copy/clone aliases userData: never tag an unpainted sibling.
  geometry.userData = {...geometry.userData};
  geometry.userData.fixedPaintedPanel = label;
  geometry.userData.materialOnlyPaintMigration = true;
  geometry.userData.materialOnlyPaintSourceBucket = sourceBucket;
  return geometry;
}

/** Mixed/unmarked groups keep the original marking/probe behavior. One
 * painted sheet cannot exempt unrelated armor or running gear. */
export function materialOnlyPaintSourceBucket(geometries: readonly THREE.BufferGeometry[]): string | undefined {
  const source = geometries[0]?.userData.materialOnlyPaintSourceBucket;
  if (source !== 'hullDetail' && source !== 'hullRubber' && source !== 'turretDetail') return undefined;
  return geometries.every(geometry => geometry.userData.materialOnlyPaintMigration === true
    && typeof geometry.userData.fixedPaintedPanel === 'string'
    && geometry.userData.fixedPaintedPanel.length > 0
    && geometry.userData.materialOnlyPaintSourceBucket === source) ? source : undefined;
}
