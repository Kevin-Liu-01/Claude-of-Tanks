import * as THREE from 'three';

export interface GarageDressingOptimizationOptions {
  /**
   * World-space bounding-sphere radius below which a static fitting no longer
   * submits to the Garage shadow cascades. The color pass remains untouched.
   */
  minimumShadowRadiusM?: number;
}

export interface GarageDressingOptimizationReceipt {
  objectsFrozen: number;
  shadowCastersBefore: number;
  shadowCastersAfter: number;
  shadowCastersPruned: number;
  minimumShadowRadiusM: number;
}

const _worldScale = new THREE.Vector3();

function isAuthoredShadowOwner(object: THREE.Mesh): boolean {
  const material = Array.isArray(object.material) ? object.material[0] : object.material;
  return object.userData.authoredShadowProxy === true
    || object.userData.keepWorkshopShadow === true
    || material?.colorWrite === false;
}

/**
 * Finalize the Garage workshop after its last streamed build slice.
 *
 * Every descendant is static for the lifetime of the workshop. Baking its
 * local matrix once removes hundreds of redundant position/quaternion/scale
 * compositions from every showroom-orbit frame. Tiny fittings remain fully
 * rendered, but stop entering both Garage shadow cascades when their projected
 * shade is beneath useful screen resolution. Authored vehicle shadow proxies
 * and explicitly retained casters are never pruned.
 */
export function optimizeGarageDressing(
  root: THREE.Object3D,
  { minimumShadowRadiusM = 0.4 }: GarageDressingOptimizationOptions = {},
): GarageDressingOptimizationReceipt {
  const cutoff = Math.max(0, minimumShadowRadiusM);
  let objectsFrozen = 0;
  let shadowCastersBefore = 0;
  let shadowCastersAfter = 0;

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object !== root && object.matrixAutoUpdate) {
      object.updateMatrix();
      object.matrixAutoUpdate = false;
      objectsFrozen += 1;
    }

    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.castShadow || !mesh.geometry) return;
    shadowCastersBefore += 1;
    if (!isAuthoredShadowOwner(mesh)) {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere();
      mesh.getWorldScale(_worldScale);
      const radius = (mesh.geometry.boundingSphere?.radius ?? Infinity)
        * Math.max(_worldScale.x, _worldScale.y, _worldScale.z);
      if (Number.isFinite(radius) && radius < cutoff) mesh.castShadow = false;
    }
    if (mesh.castShadow) shadowCastersAfter += 1;
  });

  const receipt: GarageDressingOptimizationReceipt = {
    objectsFrozen,
    shadowCastersBefore,
    shadowCastersAfter,
    shadowCastersPruned: shadowCastersBefore - shadowCastersAfter,
    minimumShadowRadiusM: cutoff,
  };
  root.userData.optimizationReceipt = receipt;
  return receipt;
}
