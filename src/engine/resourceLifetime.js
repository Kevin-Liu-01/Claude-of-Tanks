/**
 * GPU-resident resource budgets and deterministic scene disposal.
 *
 * Phones need lifetime limits in addition to smaller individual textures.
 * A hidden Object3D still owns every WebGL buffer/texture it has uploaded, so
 * merely setting `visible = false` does not protect the browser from reclaiming
 * the context after several map or showroom switches.
 */

const LIMITS = Object.freeze({
  // Keep enough recent heroes/maps for quick backtracking without allowing a
  // long browsing session to become an unbounded GPU/heap residency policy.
  // Four preview tanks and two worlds preserve useful reuse while putting a
  // deterministic ceiling on hidden scene graphs, textures and programs.
  desktop: Object.freeze({ pedestalVisuals: 4, worldScenes: 2 }),
  mobile: Object.freeze({ pedestalVisuals: 2, worldScenes: 1 }),
});

// Some owners retain valid GPU resources outside the active Object3D tree
// (terrain LOD alternatives are the canonical example). A WeakMap keeps that
// ownership explicit without putting Sets/functions into serializable
// userData or extending the lifetime of a released scene root.
const RETAINED_RESOURCES = new WeakMap();

/**
 * Declare resources owned by an Object3D but not necessarily attached to its
 * current render tree. Collections stay live, so streamed additions made
 * after registration are included in eventual disposal.
 */
export function registerRetainedObject3DResources(owner, resources) {
  if (!owner?.isObject3D || !resources || typeof resources !== 'object') {
    throw new TypeError('retained Object3D resources require an owner and resource collections');
  }
  RETAINED_RESOURCES.set(owner, resources);
}

/** @returns {{pedestalVisuals:number, worldScenes:number}} */
export function residentResourceLimits(tier) {
  return LIMITS[tier === 'mobile' ? 'mobile' : 'desktop'];
}

function collectMaterialTextures(material, out) {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (value?.isTexture) out.add(value);
    else if (Array.isArray(value)) {
      for (const item of value) if (item?.isTexture) out.add(item);
    }
  }
  for (const uniform of Object.values(material.uniforms || {})) {
    const value = uniform?.value;
    if (value?.isTexture) out.add(value);
    else if (Array.isArray(value)) {
      for (const item of value) if (item?.isTexture) out.add(item);
    }
  }
}

function collectDeclaredResources(object, bag) {
  const declared = RETAINED_RESOURCES.get(object);
  if (!declared) return;
  for (const geometry of declared.geometries || []) {
    if (geometry) bag.geometries.add(geometry);
  }
  for (const material of declared.materials || []) {
    if (!material) continue;
    bag.materials.add(material);
    collectMaterialTextures(material, bag.textures);
  }
  for (const texture of declared.textures || []) {
    if (texture) bag.textures.add(texture);
  }
}

function collectTreeResources(root, bag) {
  if (!root?.traverse) return;
  root.traverse((object) => {
    collectDeclaredResources(object, bag);
    if (object.geometry) bag.geometries.add(object.geometry);
    const materials = Array.isArray(object.material)
      ? object.material : (object.material ? [object.material] : []);
    for (const material of materials) {
      bag.materials.add(material);
      collectMaterialTextures(material, bag.textures);
    }
    if (object.skeleton?.boneTexture) bag.textures.add(object.skeleton.boneTexture);
  });
}

/**
 * Release the WebGL allocations owned by a retained Object3D subtree without
 * destroying its CPU-side scene graph. Three.js resources are intentionally
 * reusable after `dispose()`: their next render uploads the same typed arrays,
 * images and shader state again. This lets mutually exclusive phases trade
 * GPU residency while preserving an exact, rebuild-free presentation.
 *
 * BatchedMesh's own `dispose()` is deliberately not called here because it
 * nulls the private matrix/indirect textures and makes the object unusable.
 * Its public geometry/material resources are still released normally; the
 * small private control textures remain as the bounded cost of retaining the
 * live batch.
 *
 * @param {import('three').Object3D} root
 * @param {{preserveRoots?: import('three').Object3D[], releaseMaterials?: boolean,
 *   onDispose?: Function}} [opts]
 * @returns {{objects:number, geometries:number, materials:number, textures:number}}
 */
export function releaseObject3DGpuResources(
  root,
  { preserveRoots = [], releaseMaterials = true, onDispose = null } = {},
) {
  const keep = { geometries: new Set(), materials: new Set(), textures: new Set() };
  for (const preserveRoot of preserveRoots) collectTreeResources(preserveRoot, keep);

  const owned = { geometries: new Set(), materials: new Set(), textures: new Set() };
  let objects = 0;
  if (root?.traverse) {
    root.traverse((object) => {
      objects += 1;
      collectDeclaredResources(object, owned);
      if (object.geometry) owned.geometries.add(object.geometry);
      const materials = Array.isArray(object.material)
        ? object.material : (object.material ? [object.material] : []);
      for (const material of materials) {
        owned.materials.add(material);
        collectMaterialTextures(material, owned.textures);
      }
      if (object.skeleton?.boneTexture) owned.textures.add(object.skeleton.boneTexture);
    });
  }

  const receipt = { objects, geometries: 0, materials: 0, textures: 0 };
  for (const geometry of owned.geometries) {
    if (keep.geometries.has(geometry)) continue;
    onDispose?.('geometry', geometry);
    geometry.dispose?.();
    receipt.geometries += 1;
  }
  if (releaseMaterials) {
    for (const material of owned.materials) {
      if (keep.materials.has(material)) continue;
      onDispose?.('material', material);
      material.dispose?.();
      receipt.materials += 1;
    }
  }
  for (const texture of owned.textures) {
    if (keep.textures.has(texture)) continue;
    onDispose?.('texture', texture);
    texture.dispose?.();
    receipt.textures += 1;
  }
  return receipt;
}

/**
 * Detach a scene subtree and release resources not referenced by preserved
 * roots. Shared materials/textures used by the active world or garage remain
 * live; disposed Three resources may still be lazily re-uploaded if a module
 * cache later reuses their JS object.
 *
 * @param {import('three').Object3D} root
 * @param {{preserveRoots?: import('three').Object3D[], onDispose?: Function}} [opts]
 * @returns {{objects:number, geometries:number, materials:number, textures:number}}
 */
export function disposeObject3DResources(root, { preserveRoots = [], onDispose = null } = {}) {
  const keep = { geometries: new Set(), materials: new Set(), textures: new Set() };
  for (const preserveRoot of preserveRoots) collectTreeResources(preserveRoot, keep);

  const owned = { geometries: new Set(), materials: new Set(), textures: new Set() };
  let objects = 0;
  if (root?.traverse) {
    root.traverse((object) => {
      objects += 1;
      collectDeclaredResources(object, owned);
      if (object.geometry) owned.geometries.add(object.geometry);
      const materials = Array.isArray(object.material)
        ? object.material : (object.material ? [object.material] : []);
      for (const material of materials) {
        owned.materials.add(material);
        collectMaterialTextures(material, owned.textures);
      }
      if (object.skeleton?.boneTexture) owned.textures.add(object.skeleton.boneTexture);
      // Batched/instanced meshes may own private GPU textures that are not
      // reachable through `material` (matrices, visibility, morph data).
      if ((object.isBatchedMesh || object.isInstancedMesh) && typeof object.dispose === 'function') {
        object.dispose();
      }
    });
  }

  root?.removeFromParent?.();
  let geometries = 0;
  for (const geometry of owned.geometries) {
    if (keep.geometries.has(geometry)) continue;
    onDispose?.('geometry', geometry);
    geometry.dispose?.();
    geometries += 1;
  }
  let materials = 0;
  for (const material of owned.materials) {
    if (keep.materials.has(material)) continue;
    onDispose?.('material', material);
    material.dispose?.();
    materials += 1;
  }
  let textures = 0;
  for (const texture of owned.textures) {
    if (keep.textures.has(texture)) continue;
    onDispose?.('texture', texture);
    texture.dispose?.();
    textures += 1;
  }
  return { objects, geometries, materials, textures };
}
