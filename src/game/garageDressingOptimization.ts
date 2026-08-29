import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface GarageDressingOptimizationOptions {
  /**
   * World-space bounding-sphere radius below which a static fitting no longer
   * submits to the Garage shadow cascades. The color pass remains untouched.
   */
  minimumShadowRadiusM?: number;
  /** Fixed decorative compositions whose internal articulation is never
   * changed after the quiet Garage builder finishes. Their exact opaque
   * surfaces may share draw owners while the supplied roots remain movable. */
  staticDisplayOwners?: readonly THREE.Object3D[];
  /** Detached alternate layouts that still own shared geometry resources. */
  additionalResourceRoots?: readonly THREE.Object3D[];
}

export interface GarageDressingOptimizationReceipt {
  objectsFrozen: number;
  meshesInstanced: number;
  instanceBatches: number;
  meshesMerged: number;
  mergeBatches: number;
  sourceGeometriesReleased: number;
  drawCallsRemoved: number;
  displayMeshesMerged: number;
  displayMergeBatches: number;
  displayDrawCallsRemoved: number;
  displayElementsMerged: number;
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

interface StaticMergeBatch {
  material: THREE.Material;
  castShadow: boolean;
  receiveShadow: boolean;
  renderOrder: number;
  layersMask: number;
  frustumCulled: boolean;
  meshes: THREE.Mesh[];
}

interface StaticMergeResult {
  meshesMerged: number;
  mergeBatches: number;
  sourceGeometries: Set<THREE.BufferGeometry>;
  drawCallsRemoved: number;
  elementsMerged: number;
}

// Merging duplicates CPU-side vertex/index arrays. Keep it for the batches
// where one extra element buffer replaces many draw owners; a giant hull merge
// that saves only one call is deliberately left as authored geometry.
const MAX_DISPLAY_ELEMENTS_PER_REMOVED_DRAW = 1_200;

function belongsToFleetExhibit(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let owner: THREE.Object3D | null = object; owner && owner !== root; owner = owner.parent) {
    if (owner.name.startsWith('dressing_tank_')
        || owner.userData.sourceVehicleId
        || owner.userData.variantSwitchOwner === true) return true;
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

function geometryLayoutKey(geometry: THREE.BufferGeometry): string | null {
  if (Object.keys(geometry.morphAttributes).length > 0) return null;
  const attributes = Object.entries(geometry.attributes).sort(([a], [b]) => a.localeCompare(b));
  for (const [, attribute] of attributes) {
    if ('isInterleavedBufferAttribute' in attribute
        && attribute.isInterleavedBufferAttribute) return null;
  }
  const layout = attributes.map(([name, attribute]) => {
    const arrayName = attribute.array?.constructor?.name || 'Array';
    return `${name}:${attribute.itemSize}:${Number(attribute.normalized)}:${arrayName}`;
  }).join('|');
  return `${geometry.index ? 'indexed' : 'flat'}:${layout}`;
}

function canMergeStaticMesh(mesh: THREE.Mesh, root: THREE.Object3D): boolean {
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
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  if (Object.keys(mesh.userData).length > 0 || belongsToFleetExhibit(mesh, root)) return false;
  const range = mesh.geometry.drawRange;
  if (range.start !== 0 || Number.isFinite(range.count)) return false;
  return geometryLayoutKey(mesh.geometry) !== null;
}

function isVisibleWithin(object: THREE.Object3D, owner: THREE.Object3D): boolean {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (!current.visible) return false;
    if (current === owner) return true;
  }
  return false;
}

function canMergeStaticDisplayMesh(mesh: THREE.Mesh, owner: THREE.Object3D): boolean {
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
  if (!isVisibleWithin(mesh, owner) || mesh.material.transparent || mesh.material.visible === false) {
    return false;
  }
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  if (mesh.userData.authoredShadowProxy === true || mesh.material.colorWrite === false) return false;
  const range = mesh.geometry.drawRange;
  if (range.start !== 0 || Number.isFinite(range.count)) return false;
  return geometryLayoutKey(mesh.geometry) !== null;
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

/**
 * Merge remaining opaque, semantically inert workshop meshes by material and
 * render state. The first pass above already instances repeated geometry, so
 * this primarily collapses one-off boxes, cylinders and fittings without
 * duplicating the large repeated meshes. Vertices move into root-local space;
 * the rendered surfaces, materials and shadow flags remain unchanged.
 */
function mergeStaticWorkshopProps(root: THREE.Object3D): {
  meshesMerged: number;
  mergeBatches: number;
  sourceGeometries: Set<THREE.BufferGeometry>;
  drawCallsRemoved: number;
} {
  const byMaterial = new Map<THREE.Material, Map<string, StaticMergeBatch>>();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !canMergeStaticMesh(mesh, root)) return;
    const layout = geometryLayoutKey(mesh.geometry);
    if (!layout) return;
    let byState = byMaterial.get(mesh.material as THREE.Material);
    if (!byState) byMaterial.set(mesh.material as THREE.Material, byState = new Map());
    const key = `${Number(mesh.castShadow)}:${Number(mesh.receiveShadow)}:${mesh.renderOrder}`
      + `:${mesh.layers.mask}:${Number(mesh.frustumCulled)}:${layout}`;
    let batch = byState.get(key);
    if (!batch) {
      batch = {
        material: mesh.material as THREE.Material,
        castShadow: mesh.castShadow,
        receiveShadow: mesh.receiveShadow,
        renderOrder: mesh.renderOrder,
        layersMask: mesh.layers.mask,
        frustumCulled: mesh.frustumCulled,
        meshes: [],
      };
      byState.set(key, batch);
    }
    batch.meshes.push(mesh);
  });

  _rootWorldInverse.copy(root.matrixWorld).invert();
  const generated = root.userData.optimizationDisposables ||= [];
  let meshesMerged = 0;
  let mergeBatches = 0;
  const mergedSources = new Set<THREE.BufferGeometry>();
  for (const byState of byMaterial.values()) {
    for (const batch of byState.values()) {
      if (batch.meshes.length < 2) continue;
      const transformed = batch.meshes.map((mesh) => {
        const geometry = mesh.geometry.clone();
        _instanceMatrix.multiplyMatrices(_rootWorldInverse, mesh.matrixWorld);
        geometry.applyMatrix4(_instanceMatrix);
        return geometry;
      });
      const geometry = mergeGeometries(transformed, false);
      for (const clone of transformed) clone.dispose();
      if (!geometry) continue;
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const merged = new THREE.Mesh(geometry, batch.material);
      merged.name = `workshop_static_merge_${mergeBatches + 1}`;
      merged.castShadow = batch.castShadow;
      merged.receiveShadow = batch.receiveShadow;
      merged.renderOrder = batch.renderOrder;
      merged.layers.mask = batch.layersMask;
      merged.frustumCulled = batch.frustumCulled;
      merged.userData.workshopStaticMerge = true;
      merged.updateMatrix();
      merged.matrixAutoUpdate = false;
      for (const mesh of batch.meshes) {
        mergedSources.add(mesh.geometry);
        mesh.removeFromParent();
      }
      root.add(merged);
      generated.push(geometry);
      meshesMerged += batch.meshes.length;
      mergeBatches += 1;
    }
  }
  return {
    meshesMerged,
    mergeBatches,
    sourceGeometries: mergedSources,
    drawCallsRemoved: meshesMerged - mergeBatches,
  };
}

/**
 * Collapse only the immutable interior of each authored display. The owner is
 * retained, so alternate Garage layouts can still move complete tanks and
 * service assemblies as a unit. Materials, vertices, shadow state and layer
 * state are unchanged; only redundant leaf draw owners and empty rig groups
 * disappear from the live scene graph.
 */
function mergeStaticDisplayOwners(
  owners: readonly THREE.Object3D[],
  generated: TrackedGeometry[],
): StaticMergeResult {
  let meshesMerged = 0;
  let mergeBatches = 0;
  let elementsMerged = 0;
  const sourceGeometries = new Set<THREE.BufferGeometry>();

  for (const owner of new Set(owners)) {
    const byMaterial = new Map<THREE.Material, Map<string, StaticMergeBatch>>();
    owner.updateWorldMatrix(true, true);
    owner.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh || !canMergeStaticDisplayMesh(mesh, owner)) return;
      const layout = geometryLayoutKey(mesh.geometry);
      if (!layout) return;
      let byState = byMaterial.get(mesh.material as THREE.Material);
      if (!byState) byMaterial.set(mesh.material as THREE.Material, byState = new Map());
      const key = `${Number(mesh.castShadow)}:${Number(mesh.receiveShadow)}:${mesh.renderOrder}`
        + `:${mesh.layers.mask}:${Number(mesh.frustumCulled)}:${layout}`;
      let batch = byState.get(key);
      if (!batch) {
        batch = {
          material: mesh.material as THREE.Material,
          castShadow: mesh.castShadow,
          receiveShadow: mesh.receiveShadow,
          renderOrder: mesh.renderOrder,
          layersMask: mesh.layers.mask,
          frustumCulled: mesh.frustumCulled,
          meshes: [],
        };
        byState.set(key, batch);
      }
      batch.meshes.push(mesh);
    });

    _rootWorldInverse.copy(owner.matrixWorld).invert();
    for (const byState of byMaterial.values()) {
      for (const batch of byState.values()) {
        if (batch.meshes.length < 2) continue;
        const batchElements = batch.meshes.reduce((sum, mesh) => sum
          + (mesh.geometry.index?.count
            || mesh.geometry.attributes.position?.count
            || 0), 0);
        if (batchElements / (batch.meshes.length - 1)
            > MAX_DISPLAY_ELEMENTS_PER_REMOVED_DRAW) continue;
        const transformed = batch.meshes.map((mesh) => {
          const geometry = mesh.geometry.clone();
          _instanceMatrix.multiplyMatrices(_rootWorldInverse, mesh.matrixWorld);
          geometry.applyMatrix4(_instanceMatrix);
          return geometry;
        });
        const geometry = mergeGeometries(transformed, false);
        for (const clone of transformed) clone.dispose();
        if (!geometry) continue;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        const merged = new THREE.Mesh(geometry, batch.material);
        merged.name = `workshop_display_merge_${mergeBatches + 1}`;
        merged.castShadow = batch.castShadow;
        merged.receiveShadow = batch.receiveShadow;
        merged.renderOrder = batch.renderOrder;
        merged.layers.mask = batch.layersMask;
        merged.frustumCulled = batch.frustumCulled;
        merged.userData.workshopStaticDisplayMerge = true;
        merged.updateMatrix();
        merged.matrixAutoUpdate = false;
        for (const mesh of batch.meshes) {
          sourceGeometries.add(mesh.geometry);
          mesh.removeFromParent();
        }
        owner.add(merged);
        generated.push(geometry);
        meshesMerged += batch.meshes.length;
        mergeBatches += 1;
        elementsMerged += batchElements;
      }
    }

    const descendants: THREE.Object3D[] = [];
    owner.traverse((object) => { if (object !== owner) descendants.push(object); });
    for (let index = descendants.length - 1; index >= 0; index--) {
      const object = descendants[index];
      if (object.children.length > 0 || object.parent === null) continue;
      if (object.type === 'Group' || object.type === 'Object3D') object.removeFromParent();
    }
  }

  return {
    meshesMerged,
    mergeBatches,
    sourceGeometries,
    drawCallsRemoved: meshesMerged - mergeBatches,
    elementsMerged,
  };
}

type TrackedGeometry = THREE.BufferGeometry & { dispose(): void };

function releaseUnreferencedGeometries(
  candidates: ReadonlySet<THREE.BufferGeometry>,
  resourceRoots: readonly THREE.Object3D[],
): number {
  const live = new Set<THREE.BufferGeometry>();
  for (const root of resourceRoots) {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) live.add(mesh.geometry);
    });
  }
  let released = 0;
  for (const geometry of candidates) {
    if (live.has(geometry)) continue;
    geometry.dispose();
    released += 1;
  }
  return released;
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
  {
    minimumShadowRadiusM = 0.4,
    staticDisplayOwners = [],
    additionalResourceRoots = [],
  }: GarageDressingOptimizationOptions = {},
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
  const merging = mergeStaticWorkshopProps(root);
  const generated = root.userData.optimizationDisposables ||= [];
  const displayMerging = mergeStaticDisplayOwners(staticDisplayOwners, generated);
  const releaseCandidates = new Set([
    ...merging.sourceGeometries,
    ...displayMerging.sourceGeometries,
  ]);
  const sourceGeometriesReleased = releaseUnreferencedGeometries(
    releaseCandidates,
    [root, ...additionalResourceRoots],
  );

  const receipt: GarageDressingOptimizationReceipt = {
    objectsFrozen,
    meshesInstanced: instancing.meshesInstanced,
    instanceBatches: instancing.instanceBatches,
    meshesMerged: merging.meshesMerged,
    mergeBatches: merging.mergeBatches,
    sourceGeometriesReleased,
    drawCallsRemoved: instancing.drawCallsRemoved + merging.drawCallsRemoved
      + displayMerging.drawCallsRemoved,
    displayMeshesMerged: displayMerging.meshesMerged,
    displayMergeBatches: displayMerging.mergeBatches,
    displayDrawCallsRemoved: displayMerging.drawCallsRemoved,
    displayElementsMerged: displayMerging.elementsMerged,
    shadowCastersBefore,
    shadowCastersAfter,
    shadowCastersPruned: shadowCastersBefore - shadowCastersAfter,
    minimumShadowRadiusM: cutoff,
  };
  root.userData.optimizationReceipt = receipt;
  return receipt;
}
