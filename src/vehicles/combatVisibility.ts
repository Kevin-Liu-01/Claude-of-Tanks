import { LOD, type Object3D } from 'three';

/** Distance detail may remove decoration, never visible armor or working equipment. */
export function isCombatVisibleObject(object: Object3D): boolean {
  const data = object.userData;
  return data.combatVisibility === true
    || ['armor', 'externalArmor', 'equipment'].includes(data.combatHitboxRole)
    || !!data.weaponName || !!data.auxiliaryPivot
    || data.appearanceRole === 'machineGun'
    || data.fitting === 'smokeBank' || data.fitting === 'auxiliaryWeapon'
    || !!data.smokeSockets?.length;
}

/** Protect complete working assemblies and their parents from cosmetic detachment. */
export function combatVisibleObjects(root: Object3D): Set<Object3D> {
  const retained = new Set<Object3D>();
  root.traverse(object => {
    if (!isCombatVisibleObject(object)) return;
    object.traverse(child => retained.add(child));
    for (let parent = object.parent; parent; parent = parent.parent) {
      retained.add(parent);
      if (parent === root) break;
    }
  });
  return retained;
}

/** Keep authored wrappers intact for profile assembly, then disable their cull
 * horizons only where they contain combat stock. Damage visibility stays owned
 * by the existing mesh/vertex lifecycle; this runs once at construction. */
export function retainCombatLods(root: Object3D): void {
  for (const object of combatVisibleObjects(root)) {
    if (!(object instanceof LOD)) continue;
    for (let i = 1; i < object.levels.length; i++) object.levels[i]!.distance = Infinity;
  }
}
