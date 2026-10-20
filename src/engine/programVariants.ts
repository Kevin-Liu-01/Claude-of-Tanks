// src/engine/programVariants.ts — one material per program variant (2026-10-16, the perf lane).
//
// three keeps ONE current program per material and re-resolves it whenever a draw's object needs another variant of it
// than the last draw did (WebGLRenderer setProgram: needsProgramChange — instanced or not, instance colours or not,
// batched, skinned, four-component vertex colours, tangents, morph targets). The re-resolution builds the material's
// whole parameter set and its cache key (WebGLPrograms getParameters / getProgramCacheKey), drops its uniform list and
// uploads every uniform again. A material drawn by a merged mesh and by an instanced pool flips twice a frame: the
// 10-16 battle census (zz-entry-probe --program-churn) read 26-27 re-resolutions a frame on Verdant and Urban — the
// props' bucket materials (merged buckets and the destructible pools, the rocks and their instanced variants, the
// wires) and the tanks' running-gear paint, rubber and gunmetal — and the live profile 253 ms of getProgram in 9 s.
//
// splitProgramVariants gives every further variant of a shared material its own TWIN: an object whose prototype is
// the material (Object.create), so it reads every property, map, define, hook and program key of the original as
// they are and as they change — a later patch of the original (the structure mask, the night emission) reaches the
// twin, an original.needsUpdate recompiles the twin too — and it renders with the very program the original compiled
// for that variant (the same cache key: no program is added). Every program of the original and its twins keeps one
// uniform map between them, as three keeps one per material (shareUniforms). It keeps the original's id, so the render
// lists sort the draws exactly as before; only the per-draw re-resolution goes. The original stays with the plain
// variant (the one runtime-built meshes — fragments, thrown wheels — take), else with the most objects.
// A hook that keeps a reference to its compile's own uniform map on the material (terrain.ts splatUniforms,
// shallowWater.ts waterShader) would follow only one of them: split only a subtree whose hooks keep none (map.ts splits
// the props; since 2026-10-19 tankFactoryCore.ts splits every battle and Garage-hero build before its depth layers).
// A twin is another object to code that keys or compares materials: whoever patches or clones a mesh's material by
// its registration resolves the original first (programVariantOrigin: the vehicles' burn hook and registered clones).
import type { Material, Object3D } from 'three';

type VariantObject = Object3D & {
  isMesh?: boolean; isInstancedMesh?: boolean; isBatchedMesh?: boolean; isSkinnedMesh?: boolean;
  instanceColor?: unknown; morphTexture?: unknown; colorTexture?: unknown; _colorsTexture?: unknown;
  geometry?: { attributes?: Record<string, { itemSize?: number } | undefined>; morphAttributes?: Record<string, unknown[] | undefined> };
  material?: Material | Material[];
};
type VariantMaterial = Material & { vertexColors?: boolean; normalMap?: unknown; anisotropy?: number };

/** The object's program variant of this material: exactly the object terms of three's needsProgramChange. */
export function programVariantOf(object: Object3D, material: Material): string {
  const o = object as VariantObject, m = material as VariantMaterial;
  const attributes = o.geometry?.attributes ?? {}, morph = o.geometry?.morphAttributes ?? {};
  const color = attributes.color;
  const morphCount = (morph.position ?? morph.normal ?? morph.color)?.length ?? 0;
  return [
    o.isInstancedMesh ? `i${o.instanceColor != null ? 'c' : ''}${o.morphTexture != null ? 'm' : ''}` : '',
    o.isBatchedMesh ? `b${(o._colorsTexture ?? o.colorTexture ?? null) !== null ? 'c' : ''}` : '',
    o.isSkinnedMesh ? 's' : '',
    m.vertexColors === true && !!color && color.itemSize === 4 ? 'a' : '',
    !!attributes.tangent && (!!m.normalMap || (m.anisotropy ?? 0) > 0) ? 't' : '',
    morph.position ? 'mp' : '', morph.normal ? 'mn' : '', morph.color ? 'mc' : '', morphCount ? `#${morphCount}` : '',
  ].join('');
}

const twins = new WeakMap<Material, Map<string, Material>>();
const twinOrigin = new WeakMap<Material, Material>();
/** The variant an original kept when it was split (its objects of that variant draw the original itself). */
const keptVariant = new WeakMap<Material, string>();

/** The original a twin reads through (the material itself when it is no twin). */
export function programVariantOrigin(material: Material): Material {
  return twinOrigin.get(material) ?? material;
}

type CompileShader = { uniforms: Record<string, unknown> };
const sharing = new WeakSet<Material>();
/**
 * One uniform map for every program of the original and its twins, as three keeps one per material (its
 * materialProperties.uniforms): the original's hook chain runs for each program it compiles and leaves the first
 * program's map in place, merged with any uniform a later program adds. A hook's per-compile uniform objects (CSM's
 * cameraNear and shadowFar, which CSM refreshes on the one shader it holds per material) stay one set per material.
 */
function shareUniforms(original: Material): void {
  if (sharing.has(original)) return;
  sharing.add(original);
  let shared: Record<string, unknown> | null = null;
  const hook = original.onBeforeCompile;
  const wrapper = function (this: Material, shader: Parameters<Material['onBeforeCompile']>[0], renderer: Parameters<Material['onBeforeCompile']>[1]) {
    hook.call(this, shader, renderer);
    // only the original's and its twins' programs share: a clone compiled through the original's chain (the vehicles'
    // runVehicleHookChain: the Garage energy skin) keeps the map its own compile made, as before the split
    if (this !== original && twinOrigin.get(this) !== original) return;
    const compiled = shader as unknown as CompileShader;
    if (!shared) { shared = compiled.uniforms; return; }
    for (const key of Object.keys(compiled.uniforms)) if (!(key in shared)) shared[key] = compiled.uniforms[key];
    compiled.uniforms = shared;
  };
  original.onBeforeCompile = wrapper;
  // three's default program key is the hook's source text: a material without its own key keeps its hook's
  if (!Object.prototype.hasOwnProperty.call(original, 'customProgramCacheKey')) {
    original.customProgramCacheKey = function (this: Material) {
      const current = this.onBeforeCompile;
      return (current === wrapper ? hook : current).toString();
    };
  }
}

function twinOf(original: Material, variant: string): Material {
  shareUniforms(original);
  let byVariant = twins.get(original);
  if (!byVariant) { byVariant = new Map(); twins.set(original, byVariant); }
  let twin = byVariant.get(variant);
  if (twin) return twin;
  twin = Object.create(original) as Material;
  // its own version on top of the original's: an original.needsUpdate recompiles the twin, a twin's own needsUpdate
  // (three: version++) recompiles only the twin
  let own = 0;
  Object.defineProperty(twin, 'version', {
    configurable: true, enumerable: true,
    get: () => original.version + own,
    set: (value: number) => { own = value - original.version; },
  });
  // its own listeners (three registers its dispose release per material object), released with the original
  (twin as unknown as { _listeners: object })._listeners = {};
  original.addEventListener('dispose', () => twin!.dispose());
  twinOrigin.set(twin, original);
  byVariant.set(variant, twin);
  return twin;
}

/**
 * Give every further program variant of each material drawn under `root` its own twin (above). Idempotent: a second
 * pass finds one variant per material. `onlyAlreadySplit` re-seats the twins of materials a pass split before and splits
 * nothing new. Returns the counts.
 */
export function splitProgramVariants(
  root: Object3D, { onlyAlreadySplit = false }: { onlyAlreadySplit?: boolean } = {},
): { materials: number; split: number; twins: number; objects: number } {
  interface Slot { object: VariantObject; index: number }
  const uses = new Map<Material, Map<string, Slot[]>>();
  root.traverse((node) => {
    const object = node as VariantObject;
    if (!object.isMesh || !object.material) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    list.forEach((material, index) => {
      if (!material) return;
      const variant = programVariantOf(object, material);
      let byVariant = uses.get(material);
      if (!byVariant) { byVariant = new Map(); uses.set(material, byVariant); }
      let slots = byVariant.get(variant);
      if (!slots) { slots = []; byVariant.set(variant, slots); }
      slots.push({ object, index: Array.isArray(object.material) ? index : -1 });
    });
  });
  let split = 0, made = 0, objects = 0;
  for (const [material, byVariant] of uses) {
    if (byVariant.size < 2) continue;
    // a re-seat (onlyAlreadySplit: the energy skin's unwrap) never splits a material the build left whole
    if (onlyAlreadySplit && !keptVariant.has(programVariantOrigin(material))) continue;
    split++;
    // the original keeps the plain variant, else the most drawn one (the first of a tie: traversal order)
    let keep = byVariant.has('') ? '' : null;
    if (keep === null) {
      let most = -1;
      for (const [variant, slots] of byVariant) if (slots.length > most) { most = slots.length; keep = variant; }
    }
    const origin = programVariantOrigin(material);
    if (origin === material) keptVariant.set(origin, keep!);
    for (const [variant, slots] of byVariant) {
      if (variant === keep) continue;
      // (a twin drawn again under another variant: the original's own variant goes back to the original)
      const before = variant === keptVariant.get(origin) || (twins.get(origin)?.has(variant) ?? false);
      const target = variant === keptVariant.get(origin) ? origin : twinOf(origin, variant);
      if (!before) made++;
      for (const { object, index } of slots) {
        if (index < 0) object.material = target;
        else (object.material as Material[])[index] = target;
        objects++;
      }
    }
  }
  return { materials: uses.size, split, twins: made, objects };
}
