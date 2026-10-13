/**
 * shadowDepthKinds.ts — one shadow depth material per caster kind, so three stops re-deriving its program on every
 * shadow draw (2026-10-12, the perf stream).
 *
 * three's setProgram re-runs getProgram (getParameters plus the whole program key string) whenever consecutive draws
 * of one material switch between a plain Mesh, an InstancedMesh, a BatchedMesh and a SkinnedMesh: their programs
 * differ (USE_INSTANCING, USE_BATCHING, USE_SKINNING). The shadow pass draws every caster without a custom depth
 * material through ONE shared MeshDepthMaterial, and the tanks' procedural shadow proxies share
 * PROC_SHADOW_DEPTH_MAT between their plain meshes and the articulated BatchedMesh. A battle frame's casters
 * interleave all four kinds, so the census at 1728x1117@2 counted ~33 shadow-pass re-evaluations a frame of ~52.
 *
 * The shadow hook (lighting.ts patchShadowDepthPacking, run right before every caster's shadow draw with the depth
 * material three selected) settles each caster on a material of its own kind for the frames that follow:
 * - three's shared material, selected for a non-plain caster: the caster takes a shared default of its kind through
 *   `customDepthMaterial` (only when its material needs no per-material clone: three's own rule, below);
 * - a custom depth material first met on another kind: the caster takes that material's clone for its kind (a plain
 *   MeshDepthMaterial or MeshDistanceMaterial only; anything with its own shader hooks is left as it is).
 * three's getDepthMaterial copies the same per-draw state (side, visibility, maps, alpha test, clipping, displacement)
 * onto a custom material as onto its own, and a default here is three's own MeshDepthMaterial at the RGBA packing the
 * hook puts every depth material on, so every shadow map renders exactly as before.
 */
import * as THREE from 'three';

/** 0 a plain mesh, 1 instanced, 2 batched, 3 skinned. */
export type CasterKind = 0 | 1 | 2 | 3;

interface CasterLike {
  isInstancedMesh?: boolean;
  isBatchedMesh?: boolean;
  isSkinnedMesh?: boolean;
  material?: THREE.Material | THREE.Material[];
  customDepthMaterial?: THREE.Material;
}

export function casterKind(object: CasterLike): CasterKind {
  return object.isBatchedMesh ? 2 : object.isInstancedMesh ? 1 : object.isSkinnedMesh ? 3 : 0;
}

/** three's WebGLShadowMap getDepthMaterial rule: a caster whose material matches takes a per-material clone. */
export function needsDepthVariant(material: THREE.Material, localClipping: boolean): boolean {
  const m = material as THREE.Material & {
    clipShadows?: boolean; displacementMap?: THREE.Texture | null; displacementScale?: number;
    alphaMap?: THREE.Texture | null; map?: THREE.Texture | null;
  };
  return (localClipping && m.clipShadows === true && Array.isArray(m.clippingPlanes) && m.clippingPlanes.length !== 0)
    || (!!m.displacementMap && m.displacementScale !== 0)
    || (!!m.alphaMap && m.alphaTest > 0)
    || (!!m.map && m.alphaTest > 0)
    || m.alphaToCoverage === true;
}

function anyNeedsDepthVariant(material: CasterLike['material'], localClipping: boolean): boolean {
  if (!material) return true;
  if (Array.isArray(material)) return material.some((m) => !m || needsDepthVariant(m, localClipping));
  return needsDepthVariant(material, localClipping);
}

const kindDefaults: (THREE.MeshDepthMaterial | undefined)[] = [];
const defaultSet = new WeakSet<THREE.Material>();
/** The shared default depth material of a non-plain kind. */
export function kindDepthDefault(kind: CasterKind): THREE.MeshDepthMaterial {
  let material = kindDefaults[kind];
  if (!material) {
    material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    material.name = `cot:shadow-depth-${['plain', 'instanced', 'batched', 'skinned'][kind]}`;
    kindDefaults[kind] = material;
    defaultSet.add(material);
  }
  return material;
}

const homeKind = new WeakMap<THREE.Material, CasterKind>();
const kindClones = new WeakMap<THREE.Material, (THREE.Material | undefined)[]>();

/** A plain depth/distance material three draws without app shader hooks: its clone renders exactly the same. */
function cloneable(material: THREE.Material): boolean {
  if (!(material instanceof THREE.MeshDepthMaterial || material instanceof THREE.MeshDistanceMaterial)) return false;
  return material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile
    && material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey;
}

function cloneForKind(material: THREE.Material, kind: CasterKind): THREE.Material | null {
  if (!cloneable(material)) return null;
  let clones = kindClones.get(material);
  if (!clones) { clones = []; kindClones.set(material, clones); }
  let clone = clones[kind];
  if (!clone) {
    clone = material.clone();
    clone.name = material.name;
    clones[kind] = clone;
    homeKind.set(clone, kind);
    material.addEventListener('dispose', () => clone!.dispose());
  }
  return clone;
}

/**
 * The shadow hook's step for one caster and the depth material three selected for this draw. Changes take effect from
 * the caster's next shadow draw; this one renders as selected.
 */
export function settleShadowDepthKind(object: CasterLike, depthMaterial: THREE.Material, localClipping: boolean): void {
  const kind = casterKind(object);
  const custom = object.customDepthMaterial;
  if (custom !== undefined) {
    if (custom !== depthMaterial) return; // a distance pass, or a material the caller swapped: not ours to judge
    if (defaultSet.has(custom)) {
      // a default of ours: only while three would not clone for the caster's material
      if (anyNeedsDepthVariant(object.material, localClipping)) object.customDepthMaterial = undefined;
      return;
    }
    const home = homeKind.get(custom);
    if (home === undefined) { homeKind.set(custom, kind); return; }
    if (home === kind) return;
    const clone = cloneForKind(custom, kind);
    if (clone) object.customDepthMaterial = clone;
    return;
  }
  if (kind === 0) return; // plain meshes keep three's shared material
  if (anyNeedsDepthVariant(object.material, localClipping)) return; // three's per-material clone: its own rule
  object.customDepthMaterial = kindDepthDefault(kind);
}
