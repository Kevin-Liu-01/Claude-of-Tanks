import * as THREE from 'three';

// A built vehicle's geometry without its camouflage suit (the netting lane, 2026-10-11, the coordinator's rulings). The
// concept gate's "actual complete design dimensions" (tools/first-party-concept-check.mjs), a profile's complete-scene
// witness and the receipts that ray or bound a vehicle's own physical geometry (its armour, flanges, stand-off air and
// envelopes) measure the vehicle: a real vehicle's dimensions and armour never include the nets and cut garnish hung on
// it, and a field suit's garnish would otherwise put every netted hull out of its design. Do not re-add the suit to these
// measurements; ghillieSuit.ts caps a field suit at 0.6 m outside the bare vehicle (FIELD_CAP_M) so it cannot balloon.
// Only a suit's own meshes leave (<id>_ghillie_<owner>_net and _leaves, marked nonArmor open-lattice decor, alpha-tested
// wherever a texture is bound, with nothing hung under them); any other mesh carrying the name throws, so no structural
// geometry can hide behind the rule.

const SUIT_MESH = /_ghillie_(hull|turret|gun)_(net|leaves)$/;
const scratch = new THREE.Box3();

function assertCamouflageDecor(mesh) {
  const name = mesh.name || '';
  if (!mesh.isMesh || !SUIT_MESH.test(name) || mesh.children.length) {
    throw new Error(`${name}: only a suit's own net and garnish meshes may leave a vehicle's bounds`);
  }
  if (mesh.userData?.combatHitboxRole !== 'nonArmor' || mesh.userData?.continuityRole !== 'open-lattice') {
    throw new Error(`${name}: a mesh leaving a vehicle's bounds must be nonArmor open-lattice decor`);
  }
  for (const material of [].concat(mesh.material)) {
    if (!material || (material.map && !(material.alphaTest > 0))) {
      throw new Error(`${name}: a textured mesh leaving a vehicle's bounds must be alpha-tested decor`);
    }
  }
}

/** False for a camouflage suit's mesh (after the guard above), true for anything else: a receipt's mesh filter. */
export function notCamouflage(object) {
  if (!/_ghillie_/.test(object.name || '')) return true;
  assertCamouflageDecor(object);
  return false;
}

/** Box3.setFromObject(root) (its non-precise rule, node by node) with the camouflage suit's meshes left out. */
export function boundsWithoutCamouflage(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const visit = (object) => {
    if (/_ghillie_/.test(object.name || '')) { assertCamouflageDecor(object); return; }
    const geometry = object.geometry;
    if (geometry !== undefined) {
      if (object.boundingBox !== undefined) {
        if (object.boundingBox === null) object.computeBoundingBox();
        scratch.copy(object.boundingBox);
      } else {
        if (geometry.boundingBox === null) geometry.computeBoundingBox();
        scratch.copy(geometry.boundingBox);
      }
      scratch.applyMatrix4(object.matrixWorld);
      box.union(scratch);
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  return box;
}
