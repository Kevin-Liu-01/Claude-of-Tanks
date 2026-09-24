import type { BufferGeometry, Box3 } from 'three';

/** Damageable external weapon stock; smoke launchers and cosmetic fittings do
 * not opt in. The offline anatomy pass records the native faces, including
 * open mouths and separated pods, without changing the rendered geometry. */
export function weaponStock<T extends BufferGeometry>(
  geometry: T, module: 'missileRack' | 'gun' = 'missileRack', armorMm = 10,
): T {
  geometry.userData.weaponStock = { module, armorMm };
  return geometry;
}

interface AssemblyPort {
  readonly geometryReceipt?: boolean;
  forEachBucketPart(names: string[], visit: (geometry: BufferGeometry, bounds: Box3 | null) => void): void;
}
const WEAPON_BUCKETS = ['turret', 'turretEquipment', 'turretDetail', 'turretDark',
  'gun', 'gunDark', 'gunMount', 'gunMountDark', 'hull', 'hullDetail', 'hullEquipment'];

/** Scope the damage registration to a real authored assembly. Runtime builds
 * do no extra work; only offline receipts inspect the original stock parts. */
export function weaponAssembly(P: object, build: () => void,
  module: 'missileRack' | 'gun' = 'missileRack', armorMm = 10): void {
  if (!('geometryReceipt' in P) || !P.geometryReceipt) { build(); return; }
  if (!('forEachBucketPart' in P) || typeof P.forEachBucketPart !== 'function') {
    throw new Error('Weapon receipt requires the native bucket visitor');
  }
  const port = P as AssemblyPort;
  const previous = new Set<BufferGeometry>();
  port.forEachBucketPart(WEAPON_BUCKETS, geometry => previous.add(geometry));
  build();
  port.forEachBucketPart(WEAPON_BUCKETS, geometry => {
    if (!previous.has(geometry) && !geometry.userData.authoredWeaponArmor) {
      weaponStock(geometry, module, armorMm);
    }
  });
}
