/**
 * GPU-resident resource budgets and deterministic scene disposal.
 *
 * Phones need lifetime limits in addition to smaller individual textures.
 * A hidden Object3D still owns every WebGL buffer/texture it has uploaded, so
 * merely setting `visible = false` does not protect the browser from reclaiming
 * the context after several map or showroom switches.
 */
import type {
  BufferGeometry,
  Material,
  Object3D,
  Texture,
} from 'three';

export interface ResourceLimits {
  readonly pedestalVisuals: number;
  readonly worldScenes: number;
}

export interface RetainedObject3DResources {
  geometries?: Iterable<BufferGeometry>;
  materials?: Iterable<Material>;
  textures?: Iterable<Texture>;
}

export interface ResourceDisposalReceipt {
  objects: number;
  geometries: number;
  materials: number;
  textures: number;
}

type ResourceKind = 'geometry' | 'material' | 'texture';
type DisposableResource = BufferGeometry | Material | Texture;

interface ResourceDisposalOptions {
  preserveRoots?: Object3D[];
  releaseMaterials?: boolean;
  onDispose?: ((kind: ResourceKind, resource: DisposableResource) => void) | null;
}

interface ResourceObject extends Object3D {
  geometry?: BufferGeometry;
  material?: Material | Material[];
  skeleton?: { boneTexture?: Texture | null };
  isBatchedMesh?: boolean;
  isInstancedMesh?: boolean;
  dispose?(): void;
}

interface ResourceBag {
  geometries: Set<BufferGeometry>;
  materials: Set<Material>;
  textures: Set<Texture>;
}

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
const RETAINED_RESOURCES = new WeakMap<Object3D, RetainedObject3DResources>();

/**
 * Declare resources owned by an Object3D but not necessarily attached to its
 * current render tree. Collections stay live, so streamed additions made
 * after registration are included in eventual disposal.
 */
export function registerRetainedObject3DResources(
  owner: Object3D,
  resources: RetainedObject3DResources,
): void {
  if (!owner?.isObject3D || !resources || typeof resources !== 'object') {
    throw new TypeError('retained Object3D resources require an owner and resource collections');
  }
  RETAINED_RESOURCES.set(owner, resources);
}

/** @returns {{pedestalVisuals:number, worldScenes:number}} */
export function residentResourceLimits(tier: unknown): ResourceLimits {
  return LIMITS[tier === 'mobile' ? 'mobile' : 'desktop'];
}

function isTexture(value: unknown): value is Texture {
  return value !== null && typeof value === 'object'
    && (value as { isTexture?: boolean }).isTexture === true;
}

function collectMaterialTextures(material: Material | null | undefined, out: Set<Texture>): void {
  if (!material) return;
  for (const value of Object.values(material)) {
    if (isTexture(value)) out.add(value);
    else if (Array.isArray(value)) {
      for (const item of value) if (isTexture(item)) out.add(item);
    }
  }
  const uniforms = (material as unknown as {
    uniforms?: Record<string, { value?: unknown } | null | undefined>;
  }).uniforms;
  for (const uniform of Object.values(uniforms || {})) {
    const value = uniform?.value;
    if (isTexture(value)) out.add(value);
    else if (Array.isArray(value)) {
      for (const item of value) if (isTexture(item)) out.add(item);
    }
  }
}

function collectDeclaredResources(object: Object3D, bag: ResourceBag): void {
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

function collectTreeResources(root: Object3D | null | undefined, bag: ResourceBag): void {
  if (!root?.traverse) return;
  root.traverse((object) => {
    collectDeclaredResources(object, bag);
    const resourceObject = object as ResourceObject;
    if (resourceObject.geometry) bag.geometries.add(resourceObject.geometry);
    const materials = Array.isArray(resourceObject.material)
      ? resourceObject.material : (resourceObject.material ? [resourceObject.material] : []);
    for (const material of materials) {
      bag.materials.add(material);
      collectMaterialTextures(material, bag.textures);
    }
    if (resourceObject.skeleton?.boneTexture) {
      bag.textures.add(resourceObject.skeleton.boneTexture);
    }
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
  root: Object3D | null | undefined,
  {
    preserveRoots = [],
    releaseMaterials = true,
    onDispose = null,
  }: ResourceDisposalOptions = {},
): ResourceDisposalReceipt {
  const keep: ResourceBag = {
    geometries: new Set(), materials: new Set(), textures: new Set(),
  };
  for (const preserveRoot of preserveRoots) collectTreeResources(preserveRoot, keep);

  const owned: ResourceBag = {
    geometries: new Set(), materials: new Set(), textures: new Set(),
  };
  let objects = 0;
  if (root?.traverse) {
    root.traverse((object) => {
      objects += 1;
      collectDeclaredResources(object, owned);
      const resourceObject = object as ResourceObject;
      if (resourceObject.geometry) owned.geometries.add(resourceObject.geometry);
      const materials = Array.isArray(resourceObject.material)
        ? resourceObject.material : (resourceObject.material ? [resourceObject.material] : []);
      for (const material of materials) {
        owned.materials.add(material);
        collectMaterialTextures(material, owned.textures);
      }
      if (resourceObject.skeleton?.boneTexture) {
        owned.textures.add(resourceObject.skeleton.boneTexture);
      }
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
export function disposeObject3DResources(
  root: Object3D | null | undefined,
  { preserveRoots = [], onDispose = null }: ResourceDisposalOptions = {},
): ResourceDisposalReceipt {
  const keep: ResourceBag = {
    geometries: new Set(), materials: new Set(), textures: new Set(),
  };
  for (const preserveRoot of preserveRoots) collectTreeResources(preserveRoot, keep);

  const owned: ResourceBag = {
    geometries: new Set(), materials: new Set(), textures: new Set(),
  };
  let objects = 0;
  if (root?.traverse) {
    root.traverse((object) => {
      objects += 1;
      collectDeclaredResources(object, owned);
      const resourceObject = object as ResourceObject;
      if (resourceObject.geometry) owned.geometries.add(resourceObject.geometry);
      const materials = Array.isArray(resourceObject.material)
        ? resourceObject.material : (resourceObject.material ? [resourceObject.material] : []);
      for (const material of materials) {
        owned.materials.add(material);
        collectMaterialTextures(material, owned.textures);
      }
      if (resourceObject.skeleton?.boneTexture) {
        owned.textures.add(resourceObject.skeleton.boneTexture);
      }
      // Batched/instanced meshes may own private GPU textures that are not
      // reachable through `material` (matrices, visibility, morph data).
      if ((resourceObject.isBatchedMesh || resourceObject.isInstancedMesh)
        && typeof resourceObject.dispose === 'function') {
        resourceObject.dispose();
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
