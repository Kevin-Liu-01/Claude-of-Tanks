// Shared "seat a fitting on an owner rig" helpers (round 46 cleanup,
// docs/CLEANUP-2026-09-22.md §4.3). Ten family packs carried the identical
// mount() body and three IFV packs the identical always-rotated variant; the
// packs import these instead of keeping local copies.
import type { Object3D } from 'three';

/** The two articulation rigs a fitting can be seated on. */
interface MountOwnerRigs {
  readonly hullG: { add(object: Object3D): unknown };
  readonly turretG: { add(object: Object3D): unknown };
}

type MountRotation = readonly [number, number, number];

/** Seat a fitting on the hull or turret rig; the rotation is applied only when given. */
export function mount(
  P: MountOwnerRigs,
  owner: 'hull' | 'turret',
  fitting: Object3D,
  x: number,
  y: number,
  z: number,
  rotation: MountRotation | null = null,
): void {
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

/** Seat an object on the hull or turret rig and always set its rotation (neutral by default). */
export function mountRotated(
  P: MountOwnerRigs,
  owner: 'hull' | 'turret',
  object: Object3D,
  x: number,
  y: number,
  z: number,
  rotation: MountRotation = [0, 0, 0],
): void {
  object.position.set(x, y, z);
  object.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(object);
}
