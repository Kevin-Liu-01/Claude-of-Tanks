// Owner-directed kit as one rigid group (266): the parts `build` adds stand in a group named `name` directly under the
// hull's or the turret's rig, tagged ownerKit, so tools/owner-kit-targets.mjs can set exactly that group aside from a
// registered source comparison (Main's ruling per vehicle; the rest of the vehicle clears its own bar). The same split
// as the Oplot-M's kit (oplotBM.ts keeps its own copy: its source is hash-pinned). First-party: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const KIT_BUCKETS = Object.freeze({
  hull: ['hull', 'hullDark', 'hullBark', 'hullDetail', 'hullEquipment', 'hullGlass'],
  turret: ['turret', 'turretEquipment', 'turretDetail', 'turretDark', 'turretGlass'],
});

/** Runs `build`, and merges every bucket part it adds into the group `name` under the owner's rig (a station that
 * stays at the rig's pose). */
export function ownerKitGroup(P: TankBuilderPort, owner: 'hull' | 'turret', name: string, build: () => void): void {
  const group = new THREE.Group();
  group.name = name;
  Object.assign(group.userData, { ownerKit: true, fitting: 'ownerKit' });
  (owner === 'hull' ? P.hullG : P.turretG).add(group);
  const buckets = [...KIT_BUCKETS[owner]], seen = new Set<THREE.BufferGeometry>();
  P.forEachBucketPart(buckets, (part) => seen.add(part));
  build();
  P.forEachBucketPart(buckets, (part) => { if (!seen.has(part)) part.userData.auxiliaryStation = { name, stage: 'yaw' }; });
}
