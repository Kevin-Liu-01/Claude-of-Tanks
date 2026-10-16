// src/world/horizonForestImpostors.ts — Round 77c (2026-09-26): the horizon ring's forest drawn from the battlefield's
// impostor atlas.
//
// Round 77b made the far tier (300–512 m) impostors of the near trees; the ring's forest beyond the red line stayed
// round 72's lobe trees, so on the conifer maps a pale, soft cone-lobe band stood over the dark, spiky impostor rim.
// The ring's geometry and its placements are round 72's (buildHorizonForest still scatters them and packs them on its
// group); where a world bakes an impostor atlas (desktop, a renderer) this module redraws the same placements as one
// camera-facing quad per tree on that atlas — the species picked by class (conifer / broadleaf) from the map's rim
// mix, the near variant and the mirror from the placement's own fields, the stature that of the battlefield's rim
// trees — through the shared impostor program (treeImpostors.ts applyProgram: the billboard, the azimuth dissolve,
// the mip coverage, the baked normal), the far tier's matte wrap and translucency, the far tier's sky fill and the
// same camera-distance fog as the playable forest. The near class's lobe hulls stay as shadow-only casters (their shadows on the rim slopes
// are round 72's) at the impostors' stature; the band and range lobes are disposed. Without a library (the mobile
// tier, the receipts) the ring keeps its lobes.
import * as THREE from 'three';
import { markShadowOnly } from '../engine/renderLayers.ts';
import { applyCanopyDiffuseWrap } from './canopyLighting.ts';
import { HORIZON_FOREST_PLACEMENT_STRIDE } from './horizonVista.ts';
import { TREE_IMPOSTOR_ALPHA_TEST, type TreeImpostorLibrary } from './treeImpostors.ts';
import { TREE_ARCHETYPES, type TreeSpecies } from './treeSpecies.ts';

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];
type MaterialShaderHook = (shader: MaterialShader) => void;

export const HORIZON_FOREST_IMPOSTOR_PROGRAM_KEY = 'horizon-forest-impostor-v2';
/** The far tier's law the ring's impostors share: the matte diffuse wrap, its translucency and its sky fill. */
export const HORIZON_FOREST_IMPOSTOR_WRAP = 0.38;
export const HORIZON_FOREST_IMPOSTOR_THIN = 0.18;
export const HORIZON_FOREST_IMPOSTOR_SKY_FILL = 1.0; // (2026-10-08: the full sky, as both tiers always drew; materialEnvIntensity.ts)

interface HorizonForestImpostorOptions {
  library: TreeImpostorLibrary;
  /** The map's rim species mix (vegetation.ts `veg.rimMix`); species the library has no rows for are dropped. */
  rimMix: ReadonlyArray<readonly [string, number]>;
  /** The mean height of the battlefield's rim trees in metres (vegetation.ts `_rimTreeHeightM`): the ring's trees
   * take the same mean stature, keeping the ring's own relative size spread. 0 leaves the lobes' stature law. */
  rimTreeHeightM: number;
  /** GND (2026-10-15; vegetation.ts `_ringSpeciesHeightM`, the map's `ringStature: 'species'`): each species' own rim
   * stature in metres; a placement of a species named here stands at (its scale / the ring's mean scale) × that height
   * instead of × the one rim mean. Absent or null: the one mean for every species, bit for bit as before. */
  speciesHeightM?: Readonly<Record<string, number>> | null;
  /** The rim trees' mean instance tint (vegetation.ts `_rimTreeTint`): every ring quad's colour is its own ring tone
   * × this, so the ring's forest carries the battlefield's value jitter and stand shade on average. */
  rimTreeTint?: readonly [number, number, number];
  setupMaterial(material: THREE.Material, hook: MaterialShaderHook): void;
  releaseMaterial?(material: THREE.Material): void;
  /** The battlefield's forest-form variant law (vegetation.ts `_treeFormVariant`, assignTreeForms for a wood's tree): a
   * placement's near variant passes through it, so the impostor row and an adopted tree's near variant agree. */
  formVariant?: (species: string, variant: number, x: number, z: number) => number;
  /**
   * GND / the Kestrel border trees (2026-10-14): the ring trees the battlefield's own tree tiers take over (vegetation.ts
   * adoptOutlandTrees): every resolved tree `adoptWithin` says yes to is handed to `adopt` and gets no quad and no lobe
   * shadow proxy here; `adopt` returns how many it took (0: none, every placement keeps its quad). Absent: no adoption.
   */
  adoptWithin?: (tree: HorizonForestTree) => boolean;
  adopt?: (trees: readonly HorizonForestTree[]) => number;
}

/** One ring placement as the battlefield's trees would draw it (resolveHorizonForestTrees): its packed index, position,
 * yaw, species, near variant (the impostor row), mirror, instance scale and the tint its quad takes. */
export interface HorizonForestTree {
  index: number;
  x: number; y: number; z: number;
  yaw: number;
  species: string;
  variant: number;
  mirror: boolean;
  scale: number;
  tint: [number, number, number];
  conifer: boolean;
  /** The ring's class: 2 the near class, 1 the band, 0 the range. */
  detail: number;
}

export interface ResolvedHorizonForest {
  trees: HorizonForestTree[];
  ringLobeHeightM: number;
  ratio: number;
  tint: [number, number, number];
}

interface HorizonForestImpostorReceipt {
  instances: number;
  /** The placements the battlefield's tiers took over (no quad, no lobe proxy here). */
  adopted: number;
  /** Colour draws (one per species and mirror that has trees). */
  draws: number;
  /** The near class's lobe pools kept as shadow-only casters. */
  shadowProxies: number;
  species: Record<string, number>;
  stature: { rimTreeHeightM: number; ringLobeHeightM: number; ratio: number; species?: Readonly<Record<string, number>> };
  /** The rim tint every quad's tone was multiplied by. */
  tint: [number, number, number];
}

interface ForestRecord {
  instances: number;
  placements: Float32Array;
  tone: { fog: [number, number, number]; haze: number; maxHeight: number };
}

interface PoolTag { conifer: boolean; detail: number; variant: number; treeHeight: number }

function isConiferSpecies(species: string): boolean {
  return TREE_ARCHETYPES[species as TreeSpecies]?.family === 'conifer';
}

/** The species a placement class draws from: the rim mix's species of that class, normalised; the whole rim mix when
 * the class has none; every library species when the mix names none. */
export function resolveHorizonForestClassMix(
  rimMix: ReadonlyArray<readonly [string, number]>, librarySpecies: readonly string[], conifer: boolean,
): Array<[string, number]> {
  const known = rimMix.filter(([species, weight]) => librarySpecies.includes(species) && weight > 0);
  let candidates: Array<readonly [string, number]> = known.filter(([species]) => isConiferSpecies(species) === conifer);
  if (candidates.length === 0) candidates = known;
  if (candidates.length === 0) candidates = librarySpecies.map(species => [species, 1] as const);
  const total = candidates.reduce((sum, [, weight]) => sum + weight, 0);
  return candidates.map(([species, weight]) => [species, weight / total]);
}

/** A uniform pick value from a placement's position: the ring thins its candidates by their smallest keys, so the
 * packed key is NOT uniform over the kept trees (the last species of a mix would never be drawn). */
export function horizonForestImpostorPick(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function pickSpecies(mix: ReadonlyArray<readonly [string, number]>, u: number): string {
  let acc = 0;
  for (const [species, weight] of mix) {
    acc += weight;
    if (u < acc) return species;
  }
  return mix[mix.length - 1][0];
}

/** The near variant a placement takes: its tone (uniform in the ring's 0.86–1.12 band) spread over the rows. */
export function horizonForestImpostorVariant(tone: number, variants: number): number {
  return Math.min(variants - 1, Math.max(0, Math.floor(((tone - 0.86) / 0.26) * variants)));
}

/**
 * The ring forest's trees as the battlefield draws them (GND, 2026-10-14; shared by the quads below and the battlefield's
 * adoption, vegetation.ts adoptOutlandTrees): per placement the species by class from the rim mix (a hash of the
 * position), the near variant from its tone through the battlefield's forest-form law, the mirror from the ring's
 * variant, and the instance scale that stands it at the ring's relative stature × the rim trees' mean height. Null when
 * the group carries no packed placements.
 */
export function resolveHorizonForestTrees(
  forest: THREE.Object3D, library: TreeImpostorLibrary,
  options: Pick<HorizonForestImpostorOptions, 'rimMix' | 'rimTreeHeightM' | 'rimTreeTint' | 'formVariant' | 'speciesHeightM'>,
): ResolvedHorizonForest | null {
  const record = forest.userData.horizonForest as ForestRecord | undefined;
  if (!record?.placements) return null;
  const stride = HORIZON_FOREST_PLACEMENT_STRIDE;
  const packed = record.placements;
  const count = Math.floor(packed.length / stride);
  if (count === 0) return null;
  const librarySpecies: string[] = [];
  for (const row of library.rows) if (!librarySpecies.includes(row.species)) librarySpecies.push(row.species);
  const classMix = [resolveHorizonForestClassMix(options.rimMix, librarySpecies, false), resolveHorizonForestClassMix(options.rimMix, librarySpecies, true)];
  const pools = lobePoolsOf(forest);
  const lobeHeightOf = (conifer: boolean, detail: number, variant: number): number => {
    const pool = pools.find(p => p.tag.conifer === conifer && p.tag.detail === detail && (detail !== 2 || p.tag.variant === variant));
    return pool ? pool.tag.treeHeight : 6.5;
  };
  // the stature law: the ring's mean lobe height against the rim trees' mean height
  let ringHeightSum = 0, ringScaleSum = 0;
  for (let i = 0; i < count; i++) {
    const o = i * stride;
    ringHeightSum += lobeHeightOf(packed[o + 5] > 0.5, packed[o + 9], packed[o + 6]) * packed[o + 3];
    ringScaleSum += packed[o + 3];
  }
  const ringLobeHeightM = ringHeightSum / count, ringScaleMean = ringScaleSum / count;
  const ratio = options.rimTreeHeightM > 0 ? options.rimTreeHeightM / ringLobeHeightM : 1;
  const rim = options.rimTreeTint ?? [1, 1, 1];
  // the assignment: species by class from the rim mix (a hash of the position), the near variant from its tone (through
  // the forest-form law), the mirror from its variant; the instance scale puts the tree at the ring's relative stature
  // × the rim's mean: height = (scale / mean ring scale) × ring mean lobe height × ratio = (scale / mean) × rim mean
  const trees: HorizonForestTree[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * stride;
    const conifer = packed[o + 5] > 0.5;
    const x = packed[o], z = packed[o + 2];
    const species = pickSpecies(classMix[conifer ? 1 : 0], horizonForestImpostorPick(x, z));
    let variant = horizonForestImpostorVariant(packed[o + 7], library.variants);
    if (options.formVariant) variant = Math.min(library.variants - 1, Math.max(0, options.formVariant(species, variant, x, z)));
    const row = library.rows[library.rowBase(species) + variant];
    // (GND 2026-10-15) a map whose ring stands each species at its own stature: that species' rim height
    const own = options.speciesHeightM?.[species];
    const targetHeight = own !== undefined && own > 0 ? (packed[o + 3] / ringScaleMean) * own
      : (packed[o + 3] / ringScaleMean) * ringLobeHeightM * ratio;
    const tone = packed[o + 7];
    trees[i] = {
      index: i, x, y: packed[o + 1], z, yaw: packed[o + 4], species, variant, mirror: packed[o + 6] > 0.5,
      scale: targetHeight / Math.max(1e-3, row.heightM), tint: [tone * rim[0], tone * rim[1], tone * rim[2]],
      conifer, detail: packed[o + 9],
    };
  }
  return { trees, ringLobeHeightM, ratio, tint: [rim[0], rim[1], rim[2]] };
}

function lobePoolsOf(forest: THREE.Object3D): Array<{ mesh: THREE.InstancedMesh; tag: PoolTag }> {
  const pools: Array<{ mesh: THREE.InstancedMesh; tag: PoolTag }> = [];
  for (const child of forest.children) {
    const tag = child.userData.horizonForestPool as PoolTag | undefined;
    if (tag && (child as THREE.InstancedMesh).isInstancedMesh) pools.push({ mesh: child as THREE.InstancedMesh, tag });
  }
  return pools;
}

/**
 * Redraw a ring forest group's placements as impostor quads on the battlefield's atlas. Returns null (and changes
 * nothing) when the group carries no packed placements or is already bound. Idempotent per group. With `adopt`, the
 * trees `adoptWithin` selects are handed to the battlefield's tiers first and draw no quad and cast no lobe proxy here.
 */
export function bindHorizonForestImpostors(
  forest: THREE.Object3D, options: HorizonForestImpostorOptions,
): HorizonForestImpostorReceipt | null {
  if (forest.userData.horizonForestImpostors) return null;
  const { library } = options;
  const resolved = resolveHorizonForestTrees(forest, library, options);
  if (!resolved) return null;
  const record = forest.userData.horizonForest as ForestRecord;
  const stride = HORIZON_FOREST_PLACEMENT_STRIDE;
  const packed = record.placements;
  const count = resolved.trees.length;
  const { ringLobeHeightM, ratio } = resolved;
  // the lobe pools: the near class becomes shadow-only proxies, the band and range classes go
  const pools = lobePoolsOf(forest);
  // the adoption: the battlefield's tiers take the trees near the playable square (no quad, no lobe proxy here)
  const adoptedMask = new Uint8Array(count);
  let adopted = 0;
  if (options.adopt && options.adoptWithin) {
    const chosen = resolved.trees.filter(tree => options.adoptWithin!(tree));
    adopted = chosen.length ? options.adopt(chosen) : 0;
    if (adopted > 0) for (const tree of chosen) adoptedMask[tree.index] = 1;
    if (adopted > 0 && adopted !== chosen.length) throw new Error(`horizon forest: ${chosen.length} trees offered, ${adopted} adopted`);
  }
  const species = resolved.trees.map(tree => tree.species);
  const variantOf = Int32Array.from(resolved.trees, tree => tree.variant);
  const scaleOf = Float32Array.from(resolved.trees, tree => tree.scale);
  const buckets = new Map<string, number[]>();
  for (let i = 0; i < count; i++) {
    if (adoptedMask[i]) continue;
    const key = `${species[i]}/${resolved.trees[i].mirror ? 1 : 0}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = []; buckets.set(key, bucket); }
    bucket.push(i);
  }
  // The same lighting and distance-based scene fog as the playable forest.
  const material = new THREE.MeshStandardMaterial({
    map: library.albedo.texture, vertexColors: true, alphaTest: TREE_IMPOSTOR_ALPHA_TEST, alphaToCoverage: true,
    side: THREE.DoubleSide, roughness: 1.0, metalness: 0.0,
  });
  material.envMapIntensity = HORIZON_FOREST_IMPOSTOR_SKY_FILL;
  material.customProgramCacheKey = () => HORIZON_FOREST_IMPOSTOR_PROGRAM_KEY;
  const hook: MaterialShaderHook = (shader) => {
    library.applyProgram(shader);
    applyCanopyDiffuseWrap(shader, HORIZON_FOREST_IMPOSTOR_WRAP, true, HORIZON_FOREST_IMPOSTOR_THIN);
  };
  options.setupMaterial(material, hook);
  // the quads: one pool per species and mirror, the row per instance
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  const rimTint = new THREE.Color(...(options.rimTreeTint ?? [1, 1, 1]));
  const speciesCounts: Record<string, number> = {};
  let draws = 0;
  for (const [key, bucket] of buckets) {
    const [sp, mirror] = key.split('/');
    const geometry = library.quadGeometry(sp, mirror === '1');
    const rows = new THREE.InstancedBufferAttribute(new Float32Array(bucket.length), 1);
    geometry.setAttribute('aImpRow', rows);
    const mesh = new THREE.InstancedMesh(geometry, material, bucket.length);
    mesh.name = `horizon-forest-impostor-${sp}-${mirror}`;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.userData.aoExclude = true; // alpha-tested: the GTAO override prepass would composite the quads solid
    mesh.userData.horizonForestImpostor = { species: sp, mirror: mirror === '1' };
    for (let j = 0; j < bucket.length; j++) {
      const i = bucket[j], o = i * stride;
      quaternion.setFromAxisAngle(up, packed[o + 4]);
      scale.setScalar(scaleOf[i]);
      position.set(packed[o], packed[o + 1], packed[o + 2]);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(j, matrix);
      color.setScalar(packed[o + 7]).multiply(rimTint);
      mesh.setColorAt(j, color);
      rows.array[j] = variantOf[i];
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    forest.add(mesh);
    draws++;
    speciesCounts[sp] = (speciesCounts[sp] ?? 0) + bucket.length;
  }
  // the lobes: the near class keeps casting its hull's shadow at the impostor's stature, the rest are disposed
  const proxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  let shadowProxies = 0;
  let lobeMaterial: THREE.Material | null = null;
  for (const { mesh, tag } of pools) {
    if (!Array.isArray(mesh.material)) lobeMaterial = mesh.material;
    if (tag.detail !== 2 || !mesh.castShadow) {
      forest.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
      continue;
    }
    let j = 0;
    for (let i = 0; i < count && j < mesh.count; i++) {
      const o = i * stride;
      if ((packed[o + 5] > 0.5) !== tag.conifer || packed[o + 9] !== 2 || packed[o + 6] !== tag.variant) continue;
      if (adoptedMask[i]) continue; // (the adopted tree's own near proxy casts its shadow: no double crown)
      const row = library.rows[library.rowBase(species[i]) + variantOf[i]];
      quaternion.setFromAxisAngle(up, packed[o + 4]);
      scale.setScalar(scaleOf[i] * row.heightM / Math.max(1e-3, tag.treeHeight));
      position.set(packed[o], packed[o + 1], packed[o + 2]);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(j, matrix);
      j++;
    }
    mesh.count = j; // (a pool short of its quota by the adopted trees draws only what it holds)
    mesh.instanceMatrix.needsUpdate = true;
    mesh.material = proxyMaterial;
    markShadowOnly(mesh);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.userData.horizonForestShadowProxy = true;
    shadowProxies++;
  }
  if (lobeMaterial) {
    options.releaseMaterial?.(lobeMaterial);
    lobeMaterial.dispose();
  }
  const receipt: HorizonForestImpostorReceipt = {
    instances: count, adopted, draws, shadowProxies, species: speciesCounts,
    stature: { rimTreeHeightM: options.rimTreeHeightM, ringLobeHeightM, ratio, ...(options.speciesHeightM ? { species: options.speciesHeightM } : {}) },
    tint: [rimTint.r, rimTint.g, rimTint.b],
  };
  forest.userData.horizonForestImpostors = receipt;
  forest.userData.horizonForestImpostorMaterial = material;
  return receipt;
}
