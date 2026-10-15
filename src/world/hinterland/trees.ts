// src/world/hinterland/trees.ts — the outland's near trees drawn from the battlefield's impostor atlas (HZ.11, the
// horizons stream, 2026-10-13; the ring forest's binding, horizonForestImpostors.ts, for the Hinterland's plan).
//
// The plan's trees nearer than HINTERLAND_NEAR_TREE_M stand under 2.5 km from any eye on the battlefield, where the
// Hinterland compresses nothing, so they can be the battlefield's own impostors — the same trees under the same law as
// its rim, a seamless step over the red line — at their planned stature, their species where the atlas holds it (else
// the map's rim species of their class), their foliage's season as a tint. The world assembles before or after the
// worker answers: assembleWorld leaves the binding on the Hinterland's root and whichever comes second applies it; the
// procedural near trees (buildings.ts) are hidden once the impostors draw. Without an atlas (the mobile tier, the
// receipts) the procedural trees stay.
import * as THREE from 'three';
import { applyCanopyDiffuseWrap } from '../canopyLighting.ts';
import { resolveHorizonForestClassMix, horizonForestImpostorPick, HORIZON_FOREST_IMPOSTOR_SKY_FILL, HORIZON_FOREST_IMPOSTOR_THIN, HORIZON_FOREST_IMPOSTOR_WRAP } from '../horizonForestImpostors.ts';
import { TREE_IMPOSTOR_ALPHA_TEST, type TreeImpostorLibrary } from '../treeImpostors.ts';
import type { HinterlandNearTrees } from './buildings.ts';
import { samplePyramid } from './pyramid.ts';
import { HINTERLAND_FORMS, HINTERLAND_TREE_STRIDE } from './wire.ts';

type MaterialShader = Parameters<THREE.Material['onBeforeCompile']>[0];

export interface HinterlandTreeImpostorOptions {
  library: TreeImpostorLibrary;
  rimMix: ReadonlyArray<readonly [string, number]>;
  rimTreeTint?: readonly [number, number, number];
  setupMaterial(material: THREE.Material, hook: (shader: MaterialShader) => void): void;
  /** GND (2026-10-14): the battlefield's forest-form law (vegetation.ts `_treeFormVariant`): the near variant a tree draws. */
  formVariant?: (species: string, variant: number, x: number, z: number) => number;
  /** GND (2026-10-14): the trees the battlefield's tiers take over (vegetation.ts adoptOutlandTrees): `adoptWithin`
   * selects, `adopt` takes them all or none and returns how many; an adopted tree draws no quad here. */
  adoptWithin?: (tree: { x: number; z: number }) => boolean;
  adopt?: (trees: readonly HinterlandAdoptedTree[]) => number;
}

/** A Hinterland tree as the battlefield's tiers take it (vegetation.ts OutlandTreeSpec). */
export interface HinterlandAdoptedTree {
  x: number; y: number; z: number; yaw: number; species: string; variant: number; mirror: boolean; scale: number;
  tint: [number, number, number];
}

const BINDING = 'hinterlandTreeImpostors';

/** Leave the binding on the Hinterland's root and apply it now if the land is already there (assembleWorld). */
export function bindHinterlandTreeImpostors(root: THREE.Object3D, options: HinterlandTreeImpostorOptions): void {
  root.userData[BINDING] = options;
  const object = root.getObjectByName('hinterland');
  if (object) applyHinterlandTreeImpostors(object, options);
}

/** The binding the root carries, if the world left one (the prefetch's attach). */
export function hinterlandTreeBinding(root: THREE.Object3D): HinterlandTreeImpostorOptions | null {
  return (root.userData[BINDING] as HinterlandTreeImpostorOptions | undefined) ?? null;
}

/** Redraw the Hinterland object's near trees as impostor quads (idempotent; null when there is nothing to bind). */
export function applyHinterlandTreeImpostors(object: THREE.Object3D, options: HinterlandTreeImpostorOptions): { instances: number; adopted: number; draws: number } | null {
  const outland = object.getObjectByName('hinterland-outland');
  const near = outland?.userData.hinterlandNearTrees as HinterlandNearTrees | undefined;
  if (!outland || !near || outland.userData.hinterlandTreeImpostors) return null;
  const { library } = options;
  const count = Math.floor(near.trees.length / HINTERLAND_TREE_STRIDE);
  // (the atlas bakes under the loading cover, warmImpostors: the quads sample its render target whenever it is ready)
  if (count === 0) return null;
  const librarySpecies: string[] = [];
  for (const row of library.rows) if (!librarySpecies.includes(row.species)) librarySpecies.push(row.species);
  const classMix = [resolveHorizonForestClassMix(options.rimMix, librarySpecies, false), resolveHorizonForestClassMix(options.rimMix, librarySpecies, true)];
  const pick = (mix: Array<[string, number]>, u: number): string => {
    let acc = 0;
    for (const [sp, w] of mix) { acc += w; if (u < acc) return sp; }
    return mix[mix.length - 1][0];
  };
  const buckets = new Map<string, number[]>();
  const speciesOf = new Array<string>(count);
  // GND (2026-10-14): each tree resolved once — its species, near variant (the forest-form law), yaw, stature, seat and
  // tint — for the quads below and for the battlefield's adoption
  const rimTint = new THREE.Color(...(options.rimTreeTint ?? [1, 1, 1]));
  // the season's foliage as a tint: a turning crown olive-brown, a bare one grey-brown (linear multipliers)
  const turned = new THREE.Color(0.95, 0.72, 0.42), bare = new THREE.Color(0.62, 0.52, 0.46), white = new THREE.Color(1, 1, 1);
  const resolved: HinterlandAdoptedTree[] = new Array(count);
  const tint = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const o = i * HINTERLAND_TREE_STRIDE, x = near.trees[o], z = near.trees[o + 1];
    const planned = near.species[near.trees[o + 6]];
    const conifer = HINTERLAND_FORMS[near.trees[o + 7]] === 'conifer';
    const sp = librarySpecies.includes(planned) ? planned : pick(classMix[conifer ? 1 : 0], horizonForestImpostorPick(x, z));
    speciesOf[i] = sp;
    const heightM = near.trees[o + 2], tone = near.trees[o + 4], leaf = near.trees[o + 5];
    let variant = Math.min(library.variants - 1, Math.floor(tone * library.variants));
    if (options.formVariant) variant = Math.min(library.variants - 1, Math.max(0, options.formVariant(sp, variant, x, z)));
    const row = library.rows[library.rowBase(sp) + variant];
    const yRaw = near.trees[o + 8];
    const l = Math.max(0, Math.min(1, leaf));
    if (l > 0.5) tint.copy(turned).lerp(white, (l - 0.5) * 2); else tint.copy(bare).lerp(turned, l * 2);
    tint.multiplyScalar(0.9 + 0.2 * tone).multiply(rimTint);
    resolved[i] = {
      x, y: (Number.isFinite(yRaw) ? yRaw : samplePyramid(near.pyramid, x, z)) - 0.3, z,
      yaw: horizonForestImpostorPick(x * 1.7, z * 0.3) * Math.PI * 2, species: sp, variant,
      mirror: horizonForestImpostorPick(z, x) < 0.5, scale: heightM / Math.max(1e-3, row.heightM), tint: [tint.r, tint.g, tint.b],
    };
  }
  const adoptedMask = new Uint8Array(count);
  let adopted = 0;
  if (options.adopt && options.adoptWithin) {
    const chosen: number[] = [];
    for (let i = 0; i < count; i++) if (options.adoptWithin(resolved[i])) chosen.push(i);
    adopted = chosen.length ? options.adopt(chosen.map(i => resolved[i])) : 0;
    if (adopted > 0) for (const i of chosen) adoptedMask[i] = 1;
  }
  for (let i = 0; i < count; i++) {
    if (adoptedMask[i]) continue;
    const sp = speciesOf[i];
    const mirror = resolved[i].mirror ? 1 : 0;
    const key = `${sp}/${mirror}`;
    let bucket = buckets.get(key);
    if (!bucket) { bucket = []; buckets.set(key, bucket); }
    bucket.push(i);
  }
  const material = new THREE.MeshStandardMaterial({
    map: library.albedo.texture, vertexColors: true, alphaTest: TREE_IMPOSTOR_ALPHA_TEST, alphaToCoverage: true,
    side: THREE.DoubleSide, roughness: 1.0, metalness: 0.0,
  });
  material.envMapIntensity = HORIZON_FOREST_IMPOSTOR_SKY_FILL;
  material.customProgramCacheKey = () => 'hinterland-tree-impostor-v1';
  options.setupMaterial(material, (shader) => {
    library.applyProgram(shader);
    applyCanopyDiffuseWrap(shader, HORIZON_FOREST_IMPOSTOR_WRAP, true, HORIZON_FOREST_IMPOSTOR_THIN);
  });
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(), position = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
  let draws = 0;
  const group = new THREE.Group();
  group.name = 'hinterland-tree-impostors';
  group.matrixAutoUpdate = false;
  for (const [key, bucket] of buckets) {
    const [sp, mirror] = key.split('/');
    const geometry = library.quadGeometry(sp, mirror === '1');
    const rows = new THREE.InstancedBufferAttribute(new Float32Array(bucket.length), 1);
    geometry.setAttribute('aImpRow', rows);
    const mesh = new THREE.InstancedMesh(geometry, material, bucket.length);
    mesh.name = `hinterland-tree-impostor-${sp}-${mirror}`;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false; mesh.frustumCulled = false;
    mesh.userData.aoExclude = true; // (alpha-tested: the GTAO prepass would composite the quads solid)
    for (let j = 0; j < bucket.length; j++) {
      const tree = resolved[bucket[j]];
      quaternion.setFromAxisAngle(up, tree.yaw);
      scale.setScalar(tree.scale);
      position.set(tree.x, tree.y, tree.z);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(j, matrix);
      mesh.setColorAt(j, color.setRGB(tree.tint[0], tree.tint[1], tree.tint[2]));
      rows.array[j] = tree.variant; // (the program adds the species' first row: aImpCell.x)
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    draws++;
  }
  outland.add(group);
  group.updateMatrixWorld(true);
  const procedural = outland.getObjectByName('hinterland-trees-near');
  if (procedural) procedural.visible = false;
  const receipt = { instances: count, adopted, draws };
  outland.userData.hinterlandTreeImpostors = receipt;
  return receipt;
}
