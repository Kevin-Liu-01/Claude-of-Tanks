/** Explicitly separated lattice equipment can enclose intentional exterior
 * air. Armor and unmarked furniture always remain in the zero-hole scan. */
export function isOpenLatticeMesh(object) {
  return object?.isMesh === true
    && object.userData?.continuityRole === 'open-lattice'
    && ['nonArmor', 'equipment'].includes(object.userData?.combatHitboxRole);
}
