// Static draw merges for battle and Garage visuals (production plan P21, 2026-10-02).
//
// A battle hull submitted ~58 forward draws because the articulation-local
// static batch (tankFactoryCore batchMobileStaticChildren) only accepts
// anonymous, metadata-free leaves. Named buckets, fittings and source-study
// parts that share one material under one articulation owner stay separate.
// This pass folds them together AFTER the coplanar depth layers are known, so
// every pixel decision the separate draws made is kept:
//
// - Only a CONTIGUOUS run of the final layer order merges. Every mesh gets a
//   unique polygon offset (tankFactoryCore installCoplanarDepthLayers); a run
//   with no foreign layer between its members can share one offset without
//   reversing any cross-mesh winner. Unmerged meshes keep their exact layer.
//   Inside the run the parts are concatenated in layer order, so a later part
//   still wins an exact tie as its higher layer did.
// - Members share their owner (direct parent; an identity LOD wrapper whose
//   only other levels are empty sentinels is transparent), material, vertex
//   layout, raster flags, near-shadow-detail membership, distance-detail
//   membership and battle-sharing class. A finite LOD switch is kept on the
//   merged draw; a combat-retained (Infinity) wrapper is equivalent to none.
// - Vertex data is copied byte-for-byte: a part either sits at its owner's
//   identity or (when translations are baked) moves by a pure translation
//   added to its positions; normals, tangents, UVs and colours are untouched.
// - Running gear, ERA/equipment/weapon damage buffers, proxies, markings,
//   transparent or multi-material draws, instanced and batched meshes and
//   anything with its own render hooks never merge.
//
// The merged mesh keeps a side table (STATIC_MERGE_PARTS_KEY) with each
// source's name, userData, layer, original geometry and frame chain, so the
// consumers that measure per mesh (rest contact, presentation floor, showroom
// framing) and diagnostics read exactly what the separate meshes gave them.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isVehicleInstancedMesh, isVehicleMesh, type VehicleMesh } from './vehicleMesh.ts';
import { STATIC_MERGE_PARTS_KEY, type StaticMergePart } from './staticMergeParts.ts';

/** One color-pass mesh with the coplanar depth layer it would receive. */
export interface CoplanarLayerRecord {
  object: VehicleMesh;
  materials: THREE.Material[];
  layer: number;
}

export interface StaticMergeOptions {
  /** Allow parts that sit at a pure translation from their owner. */
  readonly bakeTranslations: boolean;
  /** Geometry that a runtime system edits in place (damage, ERA ranges). */
  isPinned(mesh: VehicleMesh): boolean;
  /** Same-spec battle visuals share this mesh's buffers (battleGeometrySharing). */
  isShareable(mesh: VehicleMesh): boolean;
  /** Names that are static even though they belong to the running gear. */
  readonly staticGearName: RegExp;
  /** Meshes that cast in the near-hull shadow cascade (nearVehicleShadowDetail). */
  readonly nearShadow: ReadonlySet<THREE.Object3D>;
  /** Meshes whose visibility the distance-detail policy toggles individually. */
  readonly detail: ReadonlySet<THREE.Object3D>;
  /** Receives every finished merge so owners can move their references. */
  onMerge(sources: readonly VehicleMesh[], merged: VehicleMesh): void;
}

export interface StaticMergeResult {
  records: CoplanarLayerRecord[];
  sourceMeshes: number;
  merges: number;
  savedDraws: number;
}

const IDENTITY = new THREE.Matrix4();
const INERT_GEOMETRY_USER_DATA = new Set(['abramsLoaderStock', 'sourceOwner', 'aresApc']);

function localMatrix(object: THREE.Object3D): THREE.Matrix4 {
  if (object.matrixAutoUpdate) object.updateMatrix();
  return object.matrix;
}

function isPureTranslation(matrix: THREE.Matrix4): boolean {
  const e = matrix.elements;
  return e[0] === 1 && e[1] === 0 && e[2] === 0 && e[3] === 0
    && e[4] === 0 && e[5] === 1 && e[6] === 0 && e[7] === 0
    && e[8] === 0 && e[9] === 0 && e[10] === 1 && e[11] === 0 && e[15] === 1;
}

function hasOwnHook(object: THREE.Object3D): boolean {
  return Object.prototype.hasOwnProperty.call(object, 'onBeforeRender')
    || Object.prototype.hasOwnProperty.call(object, 'onAfterRender')
    || Object.prototype.hasOwnProperty.call(object, 'onBeforeShadow')
    || Object.prototype.hasOwnProperty.call(object, 'onAfterShadow');
}

function layoutKey(geometry: THREE.BufferGeometry): string | null {
  if (Object.keys(geometry.morphAttributes).length) return null;
  if (geometry.drawRange.start !== 0 || geometry.drawRange.count !== Infinity) return null;
  for (const key of Object.keys(geometry.userData)) if (!INERT_GEOMETRY_USER_DATA.has(key)) return null;
  const parts: string[] = [];
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if ('isInterleavedBufferAttribute' in attribute && attribute.isInterleavedBufferAttribute) return null;
    const plain = attribute as THREE.BufferAttribute;
    parts.push(`${name}:${plain.itemSize}:${plain.normalized ? 1 : 0}:${plain.array.constructor.name}:${plain.gpuType}`);
  }
  if (!geometry.getAttribute('position')) return null;
  return `${parts.sort().join(',')}|${geometry.index ? 'i' : 'n'}`;
}

interface Owner {
  owner: THREE.Object3D;
  wrapper: THREE.LOD | null;
  /** '' when the source is always at level 0. */
  signature: string;
}

/** The source's articulation owner, seeing through an identity detail wrapper. */
function resolveOwner(mesh: VehicleMesh): Owner | null {
  const parent = mesh.parent;
  if (!parent) return null;
  if (!(parent instanceof THREE.LOD)) return { owner: parent, wrapper: null, signature: '' };
  if (parent.levels[0]?.object !== mesh || !parent.parent || !parent.visible || !parent.autoUpdate
      || parent.name || Object.keys(parent.userData).length || hasOwnHook(parent)) return null;
  for (let index = 1; index < parent.levels.length; index++) {
    const sentinel = parent.levels[index].object;
    if (sentinel.type !== 'Object3D' || sentinel.children.length) return null;
  }
  for (const child of parent.children) {
    if (child !== mesh && !parent.levels.some((level) => level.object === child)) return null;
  }
  if (!localMatrix(parent).equals(IDENTITY)) return null;
  const finite = parent.levels.slice(1).some((level) => Number.isFinite(level.distance));
  const signature = finite
    ? parent.levels.slice(1).map((level) => `${level.distance}:${level.hysteresis}`).join('/')
    : '';
  return { owner: parent.parent, wrapper: parent, signature };
}

interface Candidate {
  record: CoplanarLayerRecord;
  key: string;
  owner: Owner;
  matrix: THREE.Matrix4;
}

function candidateFor(record: CoplanarLayerRecord, options: StaticMergeOptions): Candidate | null {
  const mesh = record.object;
  if (!isVehicleMesh(mesh) || isVehicleInstancedMesh(mesh)) return null;
  const flags = mesh as VehicleMesh & { isBatchedMesh?: boolean; isSkinnedMesh?: boolean };
  if (flags.isBatchedMesh || flags.isSkinnedMesh || mesh.type !== 'Mesh') return null;
  if (Array.isArray(mesh.material) || record.materials.length !== 1) return null;
  const material = mesh.material;
  if (!material || material !== record.materials[0] || material.transparent
      || material.visible === false || material.colorWrite === false) return null;
  if (!mesh.visible || mesh.children.length || hasOwnHook(mesh)
      || mesh.customDepthMaterial || mesh.customDistanceMaterial) return null;
  const data = mesh.userData;
  const name = mesh.name || '';
  if ((data.runningGear || /^gear/.test(name)) && !options.staticGearName.test(name)) return null;
  if (data.authoredShadowProxy || data.vehicleMarking || data.__kitMerged
      || data.__cotTrackRuntimeClone || data.__cotSharedAttributeView) return null;
  if (options.isPinned(mesh)) return null;
  const layout = layoutKey(mesh.geometry);
  if (!layout) return null;
  const owner = resolveOwner(mesh);
  if (!owner || !owner.owner.visible) return null;
  const matrix = localMatrix(mesh).clone();
  const identity = matrix.equals(IDENTITY);
  if (!identity && !(options.bakeTranslations && isPureTranslation(matrix))) return null;
  const key = [
    owner.owner.uuid, owner.signature, material.uuid, layout,
    mesh.castShadow ? 1 : 0, mesh.receiveShadow ? 1 : 0, mesh.renderOrder, mesh.layers.mask,
    mesh.frustumCulled ? 1 : 0, options.nearShadow.has(mesh) ? 1 : 0, options.detail.has(mesh) ? 1 : 0,
    options.isShareable(mesh) ? 1 : 0,
  ].join('|');
  return { record, key, owner, matrix };
}

function translatedCopy(geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): THREE.BufferGeometry {
  // Exactly applyMatrix4's position arithmetic for a pure translation, without
  // its normal/tangent renormalisation: every other attribute stays bit-equal.
  const copy = geometry.clone();
  const position = copy.getAttribute('position') as THREE.BufferAttribute;
  const array = position.array;
  const x = matrix.elements[12], y = matrix.elements[13], z = matrix.elements[14];
  for (let offset = 0; offset < array.length; offset += 3) {
    array[offset] += x;
    array[offset + 1] += y;
    array[offset + 2] += z;
  }
  return copy;
}

function commonUserData(sources: readonly VehicleMesh[]): Record<string, unknown> {
  const shared: Record<string, unknown> = {};
  const [first, ...rest] = sources;
  for (const [key, value] of Object.entries(first.userData)) {
    if (key === 'smokeSockets' || key === 'coplanarDepthLayer') continue;
    if (rest.every((source) => Object.prototype.hasOwnProperty.call(source.userData, key)
      && source.userData[key] === value)) shared[key] = value;
  }
  return shared;
}

interface GeometryOwnerList {
  push(geometry: THREE.BufferGeometry): unknown;
}

function mergeRun(run: readonly Candidate[], index: number, disposables: GeometryOwnerList,
  options: StaticMergeOptions): VehicleMesh | null {
  const temporary: THREE.BufferGeometry[] = [];
  const geometries = run.map(({ record, matrix }) => {
    const geometry = record.object.geometry;
    if (matrix.equals(IDENTITY)) return geometry;
    const copy = translatedCopy(geometry, matrix);
    temporary.push(copy);
    return copy;
  });
  const merged = mergeGeometries(geometries, false);
  for (const geometry of temporary) geometry.dispose();
  if (!merged) return null;
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  disposables.push(merged);
  const sources = run.map(({ record }) => record.object);
  const first = sources[0];
  const mesh = new THREE.Mesh(merged, first.material) as VehicleMesh;
  mesh.name = `staticMerge_${index}`;
  mesh.castShadow = first.castShadow;
  mesh.receiveShadow = first.receiveShadow;
  mesh.renderOrder = first.renderOrder;
  mesh.layers.mask = first.layers.mask;
  mesh.frustumCulled = first.frustumCulled;
  Object.assign(mesh.userData, commonUserData(sources));
  if (sources.every((source) => options.isShareable(source))) mesh.userData.staticMergeShareable = true;
  const parts: StaticMergePart[] = [];
  let vertexStart = 0, indexStart = 0;
  for (const { record, owner, matrix } of run) {
    const geometry = record.object.geometry;
    const vertexCount = geometry.getAttribute('position').count;
    const indexCount = geometry.index ? geometry.index.count : 0;
    parts.push(Object.freeze({
      name: record.object.name || '',
      userData: Object.freeze({ ...record.object.userData }),
      layer: record.layer,
      geometry,
      wrapperMatrix: owner.wrapper ? owner.wrapper.matrix.clone() : null,
      matrix,
      vertexStart,
      vertexCount,
      indexStart: geometry.index ? indexStart : -1,
      indexCount,
    }));
    vertexStart += vertexCount;
    indexStart += indexCount;
  }
  mesh.userData[STATIC_MERGE_PARTS_KEY] = Object.freeze(parts);
  return mesh;
}

/** Replace the run's meshes (and any wrappers left empty) with the merged draw. */
function installMerged(run: readonly Candidate[], mesh: VehicleMesh): void {
  const { owner, wrapper, signature } = run[0].owner;
  const firstSource = run[0].record.object;
  if (signature && wrapper) {
    // Finite switch: the first wrapper keeps its exact levels and now owns the merged draw.
    wrapper.levels[0].object = mesh;
    const at = wrapper.children.indexOf(firstSource);
    wrapper.remove(firstSource);
    wrapper.add(mesh);
    wrapper.children.splice(at, 0, wrapper.children.pop()!);
  } else {
    const anchor = wrapper ?? firstSource;
    const at = owner.children.indexOf(anchor);
    owner.add(mesh);
    owner.children.splice(at, 0, owner.children.pop()!);
  }
  for (let index = 0; index < run.length; index++) {
    const source = run[index].record.object;
    const sourceWrapper = run[index].owner.wrapper;
    if (signature && index === 0) continue;
    if (sourceWrapper) sourceWrapper.removeFromParent();
    else source.removeFromParent();
  }
}

/**
 * Merge every contiguous same-key run of the final coplanar layer order.
 * Returns the records the depth-layer hooks should be installed on.
 */
export function mergeContiguousStaticRuns(
  records: readonly CoplanarLayerRecord[],
  disposables: GeometryOwnerList,
  options: StaticMergeOptions,
): StaticMergeResult {
  const ordered = [...records].sort((a, b) => a.layer - b.layer);
  const output: CoplanarLayerRecord[] = [];
  let sourceMeshes = 0, merges = 0;
  let run: Candidate[] = [];
  const flush = (): void => {
    if (run.length > 1) {
      const mesh = mergeRun(run, merges, disposables, options);
      if (mesh) {
        installMerged(run, mesh);
        options.onMerge(run.map(({ record }) => record.object), mesh);
        // Collapse onto the run's top layer: every foreign layer is below the
        // first part or above the last, so no cross-mesh order changes.
        output.push({ object: mesh, materials: [mesh.material as THREE.Material], layer: run[run.length - 1].record.layer });
        sourceMeshes += run.length;
        merges++;
        run = [];
        return;
      }
    }
    for (const candidate of run) output.push(candidate.record);
    run = [];
  };
  for (const record of ordered) {
    const candidate = candidateFor(record, options);
    if (!candidate) {
      flush();
      output.push(record);
      continue;
    }
    if (run.length && run[0].key !== candidate.key) flush();
    run.push(candidate);
  }
  flush();
  output.sort((a, b) => a.layer - b.layer);
  return { records: output, sourceMeshes, merges, savedDraws: sourceMeshes - merges };
}
