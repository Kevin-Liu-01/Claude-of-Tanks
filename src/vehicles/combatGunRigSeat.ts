// 230 gun-barrel alignment: the combat-rig table (combatGunRigs.generated.ts) moves only the combat frame. The drawn tank
// is built in the frame its profile was authored in: builders and the factory's visual passes (the rig seat, the ERA
// seats, the dirt bake, the bore fallback, the decoration gun guard) read this view, so a measured row never moves a
// vertex, a seat or a paint value, and a builder that seats its rig from the spec's pivot cannot chase its own row.
// Pure data: no Three.js.

const AUTHORED = Symbol.for('claude-of-tanks.combat-gun-rig.authored');

interface RigBarrel {
  lengthM: number;
  radiusM: number;
  collision?: boolean;
}

interface RigArmor {
  turretPivot: number[] | readonly number[];
  gunPivot?: number[] | readonly number[];
  gunBarrel?: RigBarrel;
}

interface AuthoredRig {
  turretPivot: number[];
  gunPivot?: number[];
  gunBarrel?: RigBarrel;
}

/** Keep the profile-authored rig before a combat-rig row replaces it (the first call wins). */
export function rememberAuthoredRig(armor: RigArmor): void {
  if (Object.prototype.hasOwnProperty.call(armor, AUTHORED)) return;
  const authored: AuthoredRig = {
    turretPivot: [...armor.turretPivot],
    ...(armor.gunPivot ? { gunPivot: [...armor.gunPivot] } : {}),
    ...(armor.gunBarrel ? { gunBarrel: { ...armor.gunBarrel } } : {}),
  };
  Object.defineProperty(armor, AUTHORED, { value: Object.freeze(authored), enumerable: false });
}

/** The spec as its builder authored it: the same object when no combat-rig row moved its frame, else a copy whose
 * armor carries the authored pivots and barrel (plates, modules and every other field shared). */
export function authoringRigSpec<T extends { armor: RigArmor }>(spec: T): T {
  const authored = (spec.armor as RigArmor & { [AUTHORED]?: AuthoredRig })[AUTHORED];
  if (!authored) return spec;
  return {
    ...spec,
    armor: {
      ...spec.armor,
      turretPivot: [...authored.turretPivot],
      ...(authored.gunPivot ? { gunPivot: [...authored.gunPivot] } : {}),
      ...(authored.gunBarrel ? { gunBarrel: { ...authored.gunBarrel } } : {}),
    },
  };
}
