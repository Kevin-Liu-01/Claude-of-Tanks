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

/**
 * The program variant a caster's depth draw takes, in three's setProgram terms: 0 a plain mesh; 10 instanced (+1 with
 * an instanceColor, +2 with a morphTexture: USE_INSTANCING_COLOR / USE_INSTANCING_MORPH); 20 batched (+1 with a
 * colour texture, three's `_colorsTexture`: USE_BATCHING_COLOR); 30 skinned. Each flips a shared material's program at
 * every switch.
 */
export type CasterKind = number;

interface CasterLike {
  isInstancedMesh?: boolean;
  isBatchedMesh?: boolean;
  isSkinnedMesh?: boolean;
  instanceColor?: unknown;
  morphTexture?: unknown;
  _colorsTexture?: unknown;
  material?: THREE.Material | THREE.Material[];
  customDepthMaterial?: THREE.Material;
}

export function casterKind(object: CasterLike): CasterKind {
  if (object.isBatchedMesh) return 20 + (object._colorsTexture ? 1 : 0);
  if (object.isInstancedMesh) return 10 + (object.instanceColor ? 1 : 0) + (object.morphTexture ? 2 : 0);
  return object.isSkinnedMesh ? 30 : 0;
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

const kindDefaults = new Map<CasterKind, THREE.MeshDepthMaterial>();
const defaultSet = new WeakSet<THREE.Material>();
/** The shared default depth material of a non-plain kind. */
export function kindDepthDefault(kind: CasterKind): THREE.MeshDepthMaterial {
  let material = kindDefaults.get(kind);
  if (!material) {
    material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    material.name = `cot:shadow-depth-${kind}`;
    kindDefaults.set(kind, material);
    defaultSet.add(material);
  }
  return material;
}

const homeKind = new WeakMap<THREE.Material, CasterKind>();
const kindClones = new WeakMap<THREE.Material, Map<CasterKind, THREE.Material>>();

/** A plain depth/distance material three draws without app shader hooks: its clone renders exactly the same. */
function cloneable(material: THREE.Material): boolean {
  if (!(material instanceof THREE.MeshDepthMaterial || material instanceof THREE.MeshDistanceMaterial)) return false;
  return material.onBeforeCompile === THREE.Material.prototype.onBeforeCompile
    && material.customProgramCacheKey === THREE.Material.prototype.customProgramCacheKey;
}

function cloneForKind(material: THREE.Material, kind: CasterKind): THREE.Material | null {
  if (!cloneable(material)) return null;
  let clones = kindClones.get(material);
  if (!clones) { clones = new Map(); kindClones.set(material, clones); }
  let clone = clones.get(kind);
  if (!clone) {
    const made = material.clone();
    made.name = material.name;
    clones.set(kind, made);
    homeKind.set(made, kind);
    material.addEventListener('dispose', () => made.dispose());
    clone = made;
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
