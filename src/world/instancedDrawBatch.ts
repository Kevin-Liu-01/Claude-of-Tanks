/**
 * instancedDrawBatch.ts — instanced pools that share a material, drawn in one call (world-pools-272, 2026-11-12).
 *
 * The draw census (tools/draw-census.mjs) put the destructible props at 36 to 51 of a battle frame's 270 to 320 color-pass
 * draws on every map: one InstancedMesh per kind (a crate, a drum, a fence plank...), while the kinds share 11 or 12
 * materials. three draws an InstancedMesh's one geometry per call, so pools of different geometry could only merge as one
 * multi-draw: a BatchedMesh (WEBGL_multi_draw: every member's instances in one call, the per-instance matrix and colour
 * from its textures, culled per instance against the camera).
 *
 * The pools stay what every other owner reads and writes (crush, topple, toss, hide, restore, tint: setMatrixAt and
 * setColorAt on the pool, as before). Each batch mirrors its members' instance streams when their versions move (at most
 * once a render, in the batch's onBeforeRender, before its draw) and draws them in the color passes; the members move to
 * the shadow-only layer, so they still cast exactly as before (the cascades, the r8 caster proxies, the static shadow
 * cache see the same casters) and no longer draw in the color passes. A member whose geometry is swapped leaves its batch
 * and draws itself again.
 *
 * The material is the members' own: three compiles its batched variant (USE_BATCHING), and batchMaterialProgram makes a
 * hook written for instancing (`#ifdef USE_INSTANCING`, `instanceMatrix`, `instanceColor`) read the batching matrix and
 * colour there, so world-space hooks (grime, stone settling, a vehicle's far form) see each instance's own frame.
 *
 * Without WEBGL_multi_draw three would submit one draw per instance; the caller batches nothing then.
 */
import * as THREE from 'three';
import { SHADOW_ONLY_LAYER } from '../engine/renderLayers.ts';

/** A pool that cannot join a batch, and why. */
export interface InstancedDrawSkip { name: string; why: string }

export interface InstancedDrawBatch {
  readonly mesh: THREE.BatchedMesh;
  readonly members: readonly THREE.InstancedMesh[];
  /** Mirror the members now (the batch's onBeforeRender does it before each draw). */
  sync(): void;
  /** Restore every member to its own draw and release the batch's GPU resources. */
  dispose(): void;
}

export interface InstancedDrawBatching {
  readonly batches: readonly InstancedDrawBatch[];
  readonly skipped: readonly InstancedDrawSkip[];
  /** Color-pass draws before (one per eligible pool) and after (one per batch) for the pools that joined. */
  readonly drawsBefore: number;
  readonly drawsAfter: number;
  dispose(): void;
}

interface Member {
  readonly mesh: THREE.InstancedMesh;
  readonly geometry: THREE.BufferGeometry;
  readonly start: number;
  readonly capacity: number;
  readonly layersMask: number;
  matrixVersion: number;
  colorVersion: number;
  shown: number;
  evicted: boolean;
}

const _matrix = new THREE.Matrix4();
const _projScreen = new THREE.Matrix4();
const _center = new THREE.Vector3();
/** Every live batch, for the same-page A/B switch (setInstancedDrawBatching). */
interface Switchable { readonly name: string; readonly members: readonly string[]; setEnabled(on: boolean): void }
/** Held weakly: a batch lives as long as its mesh (which holds its switch), a discarded world's drop out as met. */
const liveBatches = new Set<WeakRef<Switchable>>();
const SWITCH = Symbol('cotBatchSwitch');
let batchingEnabled = true;
/**
 * The same-page A/B (the draw census, the pixel diffs, the frame-budget probe's toggle): off, every member draws itself
 * again and the batches hide; on, the batches draw. `window.__DRAW_BATCH_DEBUG.set(false)`. Returns the batches switched.
 */
export function setInstancedDrawBatching(on: boolean): number {
  batchingEnabled = on;
  let switched = 0;
  for (const ref of liveBatches) {
    const batch = ref.deref();
    if (!batch) { liveBatches.delete(ref); continue; }
    batch.setEnabled(on);
    switched++;
  }
  return switched;
}
if (typeof window !== 'undefined') {
  (window as unknown as { __DRAW_BATCH_DEBUG?: object }).__DRAW_BATCH_DEBUG = {
    set: setInstancedDrawBatching, get enabled() { return batchingEnabled; }, get batches() { return liveBatches.size; },
    /** Each live batch: its name and members, and a switch of its own (the per-batch bisection of an A/B). */
    list() {
      return [...liveBatches].map((ref) => ref.deref()).filter((b): b is Switchable => !!b)
        .map((b) => ({ name: b.name, members: b.members, set: (on: boolean) => b.setEnabled(on) }));
    },
  };
}
const _color = new THREE.Color();
const PATCHED = Symbol('cotBatchProgram');

/** Why a pool cannot join a batch, or null when it can. */
export function instancedBatchBlocker(mesh: THREE.InstancedMesh, parent: THREE.Object3D): string | null {
  if (!mesh.isInstancedMesh) return 'not instanced';
  if (mesh.parent !== parent) return 'another parent';
  if (Array.isArray(mesh.material)) return 'material array';
  const material = mesh.material as THREE.Material;
  if (material.transparent) return 'transparent';
  if (!mesh.visible) return 'hidden';
  if (!mesh.matrix.equals(_matrix.identity())) return 'transformed';
  if (mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return 'onBeforeRender';
  const geometry = mesh.geometry;
  // (groups do not matter: three draws a single-material mesh's whole range in one call, as the batch does)
  if (Object.keys(geometry.morphAttributes).length > 0) return 'morph';
  if (!geometry.getAttribute('position')) return 'no position';
  for (const name of Object.keys(geometry.attributes)) {
    const attribute = geometry.getAttribute(name) as THREE.BufferAttribute & { isInstancedBufferAttribute?: boolean; isInterleavedBufferAttribute?: boolean };
    if (attribute.isInstancedBufferAttribute) return `instanced ${name}`;
    if (attribute.isInterleavedBufferAttribute) return `interleaved ${name}`;
  }
  const dr = geometry.drawRange;
  if (dr.start !== 0 || Number.isFinite(dr.count)) return 'draw range';
  return null;
}

/** The pools that may share one batch: the same material, vertex layout, index, passes and flags. */
function batchKey(mesh: THREE.InstancedMesh): string {
  const geometry = mesh.geometry;
  const attributes = Object.keys(geometry.attributes).sort().map((name) => {
    const a = geometry.getAttribute(name) as THREE.BufferAttribute;
    return `${name}:${a.itemSize}:${a.normalized ? 1 : 0}:${a.array.constructor.name}`;
  }).join(',');
  const flags = Object.keys(mesh.userData).sort()
    .filter((key) => ['string', 'number', 'boolean'].includes(typeof mesh.userData[key]))
    .map((key) => `${key}=${String(mesh.userData[key])}`).join(',');
  return [(mesh.material as THREE.Material).uuid, attributes, geometry.index ? 'i' : 'n', mesh.receiveShadow ? 1 : 0,
    mesh.renderOrder, mesh.layers.mask, mesh.instanceColor ? 'c' : '-', flags].join('|');
}

/**
 * A hook written for instancing, made to read the batching frame in the material's batched program: `USE_INSTANCING`
 * guards take `USE_BATCHING` too, and `instanceMatrix` / `instanceColor` read the instance's batching matrix and colour,
 * fetched once at the top of main (`cotBatchingMatrix`, `cotBatchingColor`: three's own batchingMatrix is declared only at
 * batching_vertex, after color_vertex, where a hook may already read the instance — the clutter tint does). Only text
 * outside three's own chunks is touched: at onBeforeCompile the chunks are still `#include` lines.
 */
export function batchShaderSource(source: string): string {
  if (/\bcotBatchingMatrix\b/.test(source)) return source; // (shimmed)
  // a hook that inlined three's own matrix chunks carries their batching branch beside the instancing one it rewrote:
  // running both would apply the instance twice, so such a program is left as three wrote it
  if (/\bbatchingMatrix\b|#ifdef USE_BATCHING\b(?!_)|defined\(\s*USE_BATCHING\s*\)/.test(source)) return source;
  const main = /void\s+main\s*\(\s*\)\s*\{/.exec(source);
  if (!main || !/\binstance(Matrix|Color)\b/.test(source)) return source;
  const usesColor = /\binstanceColor\b/.test(source);
  const head = `\n#ifdef USE_BATCHING\n  mat4 cotBatchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );\n${usesColor
    ? '  #ifdef USE_BATCHING_COLOR\n  vec3 cotBatchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) ).xyz;\n  #else\n  vec3 cotBatchingColor = vec3( 1.0 );\n  #endif\n'
    : ''}#endif`;
  const at = main.index + main[0].length;
  const body = source.slice(at)
    .replace(/#ifdef USE_INSTANCING_COLOR\b/g, '#if defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING )')
    .replace(/#ifdef USE_INSTANCING\b/g, '#if defined( USE_INSTANCING ) || defined( USE_BATCHING )')
    .replace(/defined\(\s*USE_INSTANCING\s*\)(?!\s*\|\|\s*defined\(\s*USE_BATCHING)/g, '( defined( USE_INSTANCING ) || defined( USE_BATCHING ) )')
    .replace(/\binstanceMatrix\b/g, 'cotBatchingMatrix')
    .replace(/\binstanceColor\b/g, 'cotBatchingColor')
    // an inlined color_vertex (vehicleSurface.ts masks the instance colour to the paint) keeps its batching branch beside
    // the instancing one, which now draws the batch: the batching branch would multiply the colour a second time
    .replace(/#ifdef USE_BATCHING_COLOR\b/g, '#if 0 // (world-pools-272: the instancing colour branch above draws the batch)');
  return source.slice(0, at) + head + body;
}

/** Install batchShaderSource on a material's batched program (idempotent; the instanced program is untouched). */
export function batchMaterialProgram(material: THREE.Material): void {
  const tagged = material as THREE.Material & { [PATCHED]?: boolean };
  if (tagged[PATCHED]) return;
  tagged[PATCHED] = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = function (shader, renderer) {
    previous.call(this, shader, renderer);
    if ((shader as unknown as { batching?: boolean }).batching) shader.vertexShader = batchShaderSource(shader.vertexShader);
  };
}

function buildBatch(members: THREE.InstancedMesh[], parent: THREE.Object3D, name: string): InstancedDrawBatch {
  const first = members[0];
  let instances = 0, vertices = 0, indices = 0;
  for (const m of members) {
    instances += m.instanceMatrix.count;
    vertices += m.geometry.getAttribute('position').count;
    indices += m.geometry.index ? m.geometry.index.count : 0;
  }
  const material = first.material as THREE.Material;
  batchMaterialProgram(material);
  const mesh = new THREE.BatchedMesh(instances, vertices, Math.max(indices, 1), material);
  mesh.name = name;
  // the members draw in the order three's painter sort gave the pools (memberOrder, below): where two members' surfaces
  // tie in depth, the same one wins as before
  mesh.sortObjects = true;
  mesh.perObjectFrustumCulled = true;
  mesh.frustumCulled = false; // (the members' instances move: the batch's own sphere would go stale)
  mesh.castShadow = false; // the members cast, on the shadow-only layer
  mesh.receiveShadow = first.receiveShadow;
  mesh.renderOrder = first.renderOrder;
  mesh.layers.mask = first.layers.mask;
  mesh.matrixAutoUpdate = false;
  for (const key of Object.keys(first.userData)) {
    const value = first.userData[key];
    if (['string', 'number', 'boolean'].includes(typeof value)) mesh.userData[key] = value;
  }
  mesh.userData.instancedDrawBatch = { members: members.map((m) => m.name) };
  const records: Member[] = [];
  let start = 0;
  for (const m of members) {
    const geometryId = mesh.addGeometry(m.geometry);
    const capacity = m.instanceMatrix.count;
    for (let i = 0; i < capacity; i++) mesh.addInstance(geometryId);
    records.push({ mesh: m, geometry: m.geometry, start, capacity, layersMask: m.layers.mask, matrixVersion: -1, colorVersion: -1, shown: capacity, evicted: false });
    start += capacity;
  }
  const colored = members.some((m) => m.instanceColor);
  // the order: three sorts opaque draws of one material by their depth (the pool's bounding-sphere centre in clip space)
  // and then by object id; the batch draws its members' instances in that member order, each member's in slot order
  // (a counting sort over the members: the instances arrive in member order)
  const memberOf = new Int32Array(start);
  records.forEach((r, k) => memberOf.fill(k, r.start, r.start + r.capacity));
  const rank = new Int32Array(records.length), byDepth = records.map((_, k) => k), depth = new Float64Array(records.length);
  const counts = new Int32Array(records.length + 1);
  type Item = { start: number; count: number; z: number };
  /** (three's render-list item carries its instance id as `index`; its typings leave it out) */
  const instanceOf = (item: Item): number => (item as Item & { index: number }).index;
  let scratch: Item[] = [];
  const byDepthThenId = (a: number, b: number): number => depth[a] - depth[b] || records[a].mesh.id - records[b].mesh.id;
  // hot-path: every render of the batch (each couch pane's too)
  const memberOrder = function (list: Item[], camera: THREE.Camera): void {
    _projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    for (let k = 0; k < records.length; k++) {
      const m = records[k].mesh;
      if (m.boundingSphere === null) m.computeBoundingSphere();
      depth[k] = _center.copy(m.boundingSphere!.center).applyMatrix4(m.matrixWorld).applyMatrix4(_projScreen).z;
    }
    byDepth.sort(byDepthThenId);
    for (let i = 0; i < byDepth.length; i++) rank[byDepth[i]] = i;
    counts.fill(0);
    for (const item of list) counts[rank[memberOf[instanceOf(item)]] + 1]++;
    for (let i = 1; i < counts.length; i++) counts[i] += counts[i - 1];
    if (scratch.length < list.length) scratch = new Array(list.length); // alloc-ok: grows once to the batch's instance count
    for (const item of list) scratch[counts[rank[memberOf[instanceOf(item)]]]++] = item;
    for (let i = 0; i < list.length; i++) list[i] = scratch[i];
  };
  mesh.customSort = memberOrder;
  const evict = (r: Member): void => {
    r.evicted = true;
    r.mesh.layers.mask = r.layersMask;
    for (let i = 0; i < r.capacity; i++) mesh.setVisibleAt(r.start + i, false);
  };
  let enabled = true;
  // hot-path: every render of the batch (each couch pane's too)
  const sync = (): void => {
    if (!enabled) return;
    for (const r of records) {
      if (r.evicted) continue;
      const m = r.mesh;
      if (m.geometry !== r.geometry || m.parent !== parent) { evict(r); continue; }
      const shown = m.visible ? Math.max(0, Math.min(m.count, r.capacity)) : 0;
      if (shown !== r.shown) {
        for (let i = Math.min(shown, r.shown); i < Math.max(shown, r.shown); i++) mesh.setVisibleAt(r.start + i, i < shown);
        r.shown = shown;
      }
      if (m.instanceMatrix.version !== r.matrixVersion) {
        r.matrixVersion = m.instanceMatrix.version;
        const array = m.instanceMatrix.array as Float32Array;
        for (let i = 0; i < r.capacity; i++) mesh.setMatrixAt(r.start + i, _matrix.fromArray(array, i * 16));
      }
      const colors = m.instanceColor;
      if (colored && (colors ? colors.version : 0) !== r.colorVersion) {
        r.colorVersion = colors ? colors.version : 0;
        for (let i = 0; i < r.capacity; i++) {
          if (colors) _color.fromArray(colors.array as Float32Array, i * 3); else _color.setRGB(1, 1, 1);
          mesh.setColorAt(r.start + i, _color);
        }
      }
    }
  };
  // the instance range a member does not show starts hidden; sync fills the matrices and colours
  sync();
  const prepare = mesh.onBeforeRender;
  mesh.onBeforeRender = function (renderer, scene, camera, geometry, mat, group) {
    sync();
    prepare.call(this, renderer, scene, camera, geometry, mat, group);
  };
  const switchable: Switchable = {
    name, members: members.map((m) => m.name),
    setEnabled(on: boolean): void {
      if (on === enabled) return;
      enabled = on;
      mesh.visible = on;
      for (const r of records) {
        if (r.evicted) continue;
        if (on) { r.mesh.layers.set(SHADOW_ONLY_LAYER); r.matrixVersion = -1; r.colorVersion = -1; } else r.mesh.layers.mask = r.layersMask;
      }
      if (on) sync();
    },
  };
  for (const r of records) r.mesh.layers.set(SHADOW_ONLY_LAYER);
  parent.add(mesh);
  mesh.updateMatrixWorld(true);
  (mesh as unknown as { [SWITCH]: Switchable })[SWITCH] = switchable;
  const ref = new WeakRef(switchable);
  liveBatches.add(ref);
  if (!batchingEnabled) switchable.setEnabled(false);
  return {
    mesh, members,
    sync,
    dispose() {
      liveBatches.delete(ref);
      for (const r of records) if (!r.evicted) r.mesh.layers.mask = r.layersMask;
      mesh.removeFromParent();
      mesh.dispose();
    },
  };
}

/**
 * Batch every group of two or more eligible pools under `parent` that share a material and layout (see the header).
 * Pools that cannot join keep their own draw and are listed with the reason.
 */
export function batchInstancedPools(parent: THREE.Object3D, pools: readonly THREE.InstancedMesh[], name: string): InstancedDrawBatching {
  const skipped: InstancedDrawSkip[] = [];
  const groups = new Map<string, THREE.InstancedMesh[]>();
  for (const pool of pools) {
    const why = instancedBatchBlocker(pool, parent);
    if (why) { skipped.push({ name: pool.name, why }); continue; }
    const key = batchKey(pool);
    let group = groups.get(key);
    if (!group) groups.set(key, group = []);
    group.push(pool);
  }
  const batches: InstancedDrawBatch[] = [];
  let drawsBefore = 0;
  for (const group of groups.values()) {
    if (group.length < 2) { skipped.push({ name: group[0].name, why: 'alone in its material' }); continue; }
    batches.push(buildBatch(group, parent, `${name}-${batches.length}`));
    drawsBefore += group.length;
  }
  return {
    batches, skipped, drawsBefore, drawsAfter: batches.length,
    dispose() { for (const batch of batches) batch.dispose(); },
  };
}
