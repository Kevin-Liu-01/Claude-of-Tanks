import type { ArmorEnvelope, Vec3Tuple } from '../specHelpers.ts';

// Owner-requested hull proportions. Turret, gun, length and height retain
// their authored dimensions; skirts and running gear belong to the hull.
export const LEOPARD_IMPROVED_HULL_WIDTH_SCALE = 0.9;
export const LEOPARD_IMPROVED_AUTHORED_WIDTH_M = 4;

/** Adjust only hull-owned combat surfaces, matching the visual hull rig. */
export function scaleLeopardImprovedHullArmor(armor: ArmorEnvelope, scale: number): void {
  const lateral = ([x, y, z]: Vec3Tuple): Vec3Tuple => [x * scale, y, z];
  for (const plate of armor.hullPlates) {
    plate.verts = plate.verts.map(lateral);
    if (plate.traceBounds) {
      plate.traceBounds.min = lateral(plate.traceBounds.min);
      plate.traceBounds.max = lateral(plate.traceBounds.max);
    }
  }
  for (const box of [...armor.modules, ...armor.crew]) {
    if (box.turretLocal) continue;
    box.min = lateral(box.min);
    box.max = lateral(box.max);
  }
  const contacts = armor.bodyContactPoints?.hull;
  if (contacts) for (let i = 0; i < contacts.length; i += 3) contacts[i] *= scale;
}
