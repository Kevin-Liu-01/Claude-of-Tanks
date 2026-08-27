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
  meshesInstanced: number;
  instanceBatches: number;
  drawCallsRemoved: number;
  shadowCastersBefore: number;
  shadowCastersAfter: number;
  shadowCastersPruned: number;
  minimumShadowRadiusM: number;
}

const _worldScale = new THREE.Vector3();
const _rootWorldInverse = new THREE.Matrix4();
const _instanceMatrix = new THREE.Matrix4();

interface StaticMeshBatch {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  layersMask: number;
  meshes: THREE.Mesh[];
}

function belongsToFleetExhibit(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let owner: THREE.Object3D | null = object; owner && owner !== root; owner = owner.parent) {
    if (owner.name.startsWith('dressing_tank_') || owner.userData.sourceVehicleId) return true;
  }
  return false;
}

function canInstanceStaticMesh(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
  const specialized = mesh as THREE.Mesh & {
    isInstancedMesh?: boolean;
    isBatchedMesh?: boolean;
    isSkinnedMesh?: boolean;
  };
  if (specialized.isInstancedMesh || specialized.isBatchedMesh || specialized.isSkinnedMesh) {
    return false;
  }
  if (!mesh.geometry || Array.isArray(mesh.material) || !mesh.material) return false;
  if (mesh.children.length > 0 || mesh.morphTargetInfluences) return false;
  if (!mesh.visible || mesh.material.transparent || mesh.material.visible === false) return false;
  if (mesh.userData.keepWorkshopMesh || belongsToFleetExhibit(mesh, root)) return false;
  return true;
}

/**
 * Replace exact repeated opaque workshop props with an InstancedMesh. Geometry,
 * material, transforms, lighting flags and silhouettes remain byte-for-byte
 * the same; only the submission owner changes. Authored fleet exhibits are
 * excluded because their visual lifecycle still owns those scene graphs.
 */
function instanceStaticWorkshopProps(root: THREE.Object3D): {
  meshesInstanced: number;
  instanceBatches: number;
  drawCallsRemoved: number;
} {
  const byGeometry = new Map<THREE.BufferGeometry, Map<THREE.Material, Map<string, StaticMeshBatch>>>();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !canInstanceStaticMesh(mesh, root)) return;
    let byMaterial = byGeometry.get(mesh.geometry);
    if (!byMaterial) byGeometry.set(mesh.geometry, byMaterial = new Map());
    let byState = byMaterial.get(mesh.material as THREE.Material);
    if (!byState) byMaterial.set(mesh.material as THREE.Material, byState = new Map());
    const key = `${Number(mesh.castShadow)}:${Number(mesh.receiveShadow)}:${mesh.renderOrder}:${mesh.layers.mask}`;
    let batch = byState.get(key);
    if (!batch) {
      batch = {
        geometry: mesh.geometry,
        material: mesh.material as THREE.Material,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
        renderOrder: mesh.renderOrder,
        layersMask: mesh.layers.mask,
        meshes: [],
      };
      byState.set(key, batch);
    }
    batch.meshes.push(mesh);
  });

  _rootWorldInverse.copy(root.matrixWorld).invert();
  let meshesInstanced = 0;
  let instanceBatches = 0;
  for (const byMaterial of byGeometry.values()) {
    for (const byState of byMaterial.values()) {
      for (const batch of byState.values()) {
        if (batch.meshes.length < 2) continue;
        const instanced = new THREE.InstancedMesh(
          batch.geometry,
          batch.material,
          batch.meshes.length,
        );
        instanced.name = `workshop_static_instances_${instanceBatches + 1}`;
        instanced.castShadow = batch.castShadow;
        instanced.receiveShadow = batch.receiveShadow;
        instanced.renderOrder = batch.renderOrder;
        instanced.layers.mask = batch.layersMask;
        instanced.userData.workshopStaticInstances = true;
        batch.meshes.forEach((mesh, index) => {
          _instanceMatrix.multiplyMatrices(_rootWorldInverse, mesh.matrixWorld);
          instanced.setMatrixAt(index, _instanceMatrix);
          mesh.removeFromParent();
        });
        instanced.instanceMatrix.needsUpdate = true;
        instanced.computeBoundingSphere();
        instanced.updateMatrix();
        instanced.matrixAutoUpdate = false;
        root.add(instanced);
        meshesInstanced += batch.meshes.length;
        instanceBatches += 1;
      }
    }
  }
  return {
    meshesInstanced,
    instanceBatches,
    drawCallsRemoved: meshesInstanced - instanceBatches,
  };
}

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

  const instancing = instanceStaticWorkshopProps(root);

  const receipt: GarageDressingOptimizationReceipt = {
    objectsFrozen,
    ...instancing,
    shadowCastersBefore,
    shadowCastersAfter,
    shadowCastersPruned: shadowCastersBefore - shadowCastersAfter,
    minimumShadowRadiusM: cutoff,
  };
  root.userData.optimizationReceipt = receipt;
  return receipt;
}
