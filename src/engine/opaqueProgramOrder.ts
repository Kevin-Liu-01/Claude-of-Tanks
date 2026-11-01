import type * as THREE from 'three';

/** A material with three's runtime id (Material.id; the type declarations leave it out). */
type SortMaterial = THREE.Material & { readonly id: number };

/** The fields of three's render-list item the opaque comparator reads (WebGLRenderLists, three 0.185). */
export interface OpaqueRenderItem {
  readonly id: number;
  readonly material: SortMaterial;
  readonly materialVariant: number;
  readonly groupOrder: number;
  readonly renderOrder: number;
  readonly z: number;
}

/** A material's linked program id, or -1 while it has none (never drawn). */
export type ProgramIdOf = (material: SortMaterial) => number;

/**
 * three's painterSortStable with the material's program ahead of its id: group order, render order, program, material,
 * material variant, depth, object. The steps keep three's form (a difference only where the fields differ), so a NaN depth
 * sorts as three sorts it.
 */
export function programFirstOpaqueSort(programOf: ProgramIdOf): (a: OpaqueRenderItem, b: OpaqueRenderItem) => number {
  return (a, b) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    if (a.material.id !== b.material.id) {
      const pa = programOf(a.material), pb = programOf(b.material);
      if (pa !== pb) return pa - pb;
      return a.material.id - b.material.id;
    }
    if (a.materialVariant !== b.materialVariant) return a.materialVariant - b.materialVariant;
    if (a.z !== b.z) return a.z - b.z;
    return a.id - b.id;
  };
}

interface ProgramProperties {
  has(material: THREE.Material): boolean;
  get(material: THREE.Material): { currentProgram?: { id: number } };
}

interface CachedProgram { frame: number; program: number }

/** Entries kept before the cache starts over (disposed materials' ids are never read again). */
const PROGRAM_CACHE_LIMIT = 4096;

/**
 * A material's last linked program from the renderer's properties, read once a render call (`frameOf`, three's
 * info.render.frame) and cached by material id for the rest of that call's sort, so a recompiled material sorts by its
 * new program from the next render. A material with no program yet reads -1; `has` first, so the lookup never creates a
 * properties entry for it.
 */
export function cachedProgramIdOf(properties: ProgramProperties, frameOf: () => number): ProgramIdOf {
  const cache = new Map<number, CachedProgram>();
  return (material) => {
    const frame = frameOf();
    const cached = cache.get(material.id);
    if (cached && cached.frame === frame) return cached.program;
    const program = properties.has(material) ? properties.get(material).currentProgram?.id ?? -1 : -1;
    if (cached) { cached.frame = frame; cached.program = program; return program; }
    if (cache.size >= PROGRAM_CACHE_LIMIT) cache.clear();
    cache.set(material.id, { frame, program });
    return program;
  };
}

/**
 * (local-fps-266, Main's ruling on the 266 main-thread ranking) Draw each render order's opaque list program by program.
 * three sorts it by material id, so the materials that share a program (79 programs under 137 materials in a Verdant
 * battle's main pass) interleave with others: 113 program switches a frame, and each switch walks the program's light,
 * camera and shadow uniforms again (three's setProgram; the lights alone 1.25 ms of a 22.9 ms frame). By program first
 * the same list makes 70. Group and render order still lead, the transparent list keeps three's order, and only the order
 * of opaque draws within one render order changes.
 */
export function installOpaqueProgramOrder(renderer: THREE.WebGLRenderer): void {
  const properties = (renderer as unknown as { properties: ProgramProperties }).properties;
  const info = renderer.info;
  renderer.setOpaqueSort(programFirstOpaqueSort(cachedProgramIdOf(properties, () => info.render.frame)));
}
