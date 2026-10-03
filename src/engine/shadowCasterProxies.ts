/**
 * shadowCasterProxies.ts — the r8 cascade caster proxies (2026-09-13), moved out of lighting.ts on 2026-10-02 (the
 * frame-budget lane) so the boot entry chunk does not carry them: lighting.ts imports this module when its first rig
 * is created and calls the four exports at the end. Until the module has arrived every heavy instanced owner casts all
 * of its instances into every cascade, which renders the same maps — a proxy only drops the instances that lie outside
 * its cascade's frustum. shadowGeometryClaims.selftest.mjs executes the block between `const SHADOW_CULL_MIN_TRIS`
 * and the end marker as it stands.
 */
import * as THREE from 'three';
import { markShadowOnly } from './renderLayers.ts';

type NumericAttributeArray = THREE.InstancedBufferAttribute['array'];

// --- r8 CASCADE CASTER PROXIES (correctness: replaces the r7 in-place instance
// compaction; shadow-flash root cause 2026-09-13) ----------------------------
// r7 compacted each heavy InstancedMesh's instance prefix inside onBeforeShadow
// and drew count=K. Three r185's shadow pass, however, runs objects.update() —
// the ONLY place instance buffers upload — BEFORE onBeforeShadow, gated to once
// per render call (WebGLShadowMap.renderObject: objects.update → onBeforeShadow
// → renderBufferDirect). The compacted bytes therefore never reached the GPU
// before the draw: every cascade rendered the FIRST K instances in owner order,
// not the K visible ones. Casters past index K lost their shadow, and since K
// changes with every camera move, WHICH casters were missing changed too — the
// "tree / bush / pole shadows flash while driving" report. Proven with a
// still-camera A/B (.qa-dev/cull-still-ab.mjs, temporal passes off): cull on vs
// off differed by 3.9k px of missing shadow, on vs on by 0 px; 63 % of the
// cascade-0-visible trunks and 81 % of the visible bushes sat past the prefix.
// Now every heavy static owner gets one SHADOW-ONLY PROXY per near cascade: a
// child of the owner on SHADOW_ONLY_LAYER that shares the owner's vertex and
// index buffers and owns its instance buffers. lighting.update() compacts each
// scheduled proxy to its cascade's frustum BEFORE renderer.render(), so the
// shadow pass's own objects.update() uploads exactly the bytes the draw uses.
// Owner buffers are never written. The owner casts only into the last cascade
// (that box spans the map, so culling there saves nothing); a proxy draws
// solely in its own cascade (count=0 elsewhere — three skips zero-instance
// draws). Culling stays conservative: per-instance world spheres (geometry
// sphere x instance scale + SHADOW_CULL_MARGIN for wind sway) against the
// cascade frustum. __SHADOW_DEBUG.noCull (probes) makes owners draw everything.
// Nothing here listens on geometries or holds strong owner references, so a
// discarded world (or a shared library geometry outliving it) never pins a
// mesh; proxies die with their owner and the browser frees their GL buffers.
const SHADOW_CULL_MIN_TRIS = 24000; // capacity*trisPerInstance below this: not worth proxies
const SHADOW_CULL_MARGIN = 4.0; // meters: wind sway + normal cascade-fit movement

interface CasterProxyRecord {
  readonly owner: THREE.InstancedMesh;
  /** Owner geometry the proxies mirror; a swap rebuilds the record. */
  readonly geometry: THREE.BufferGeometry;
  readonly capacity: number;
  readonly proxies: THREE.InstancedMesh[];
  /** Per proxy: [instanceMatrix, ...geometry instanced attributes], aligned with ownerAttrs. */
  readonly proxyAttrs: THREE.InstancedBufferAttribute[][];
  readonly ownerAttrs: THREE.InstancedBufferAttribute[];
  /** Visible instance count compacted into each proxy. */
  readonly counts: Int32Array;
  /** Per-instance world bounding spheres of the owner's current instances. */
  readonly centers: Float32Array;
  readonly radii: Float32Array;
  n: number;
  matrixVersion: number;
  /** Set once the proxies hold a compaction; until then the owner casts everywhere. */
  ready: boolean;
  /** Owner count saved across one cascade draw by the before/after hooks. */
  savedCount: number;
  /**
   * 2026-10-02 (the frame-budget lane): what each near cascade's compaction was made from — the cascade's frustum epoch
   * and the owner's instance state (instance-matrix version, the other instanced streams' summed versions, count). A
   * per-frame update whose cascade and owner both still match skips the copy: the proxy already holds it.
   */
  readonly compactedEpoch: Float64Array;
  readonly compactedMatrix: Float64Array;
  readonly compactedStreams: Float64Array;
  readonly compactedN: Float64Array;
}

const _casterRecords = new WeakMap<THREE.InstancedMesh, CasterProxyRecord | null>();
/** Weak owner list for the per-frame compaction; dead entries are pruned as met. */
const _casterOwners: WeakRef<THREE.InstancedMesh>[] = [];
const _proxyOf = new WeakMap<THREE.InstancedMesh, { rec: CasterProxyRecord; cascade: number }>();
const _cascadeIndexByCamera = new WeakMap<THREE.Camera, number>();
/** Near cascades that receive proxies (every registered cascade but the last). */
let _casterProxyCascades = 0;
const _cullSphere = new THREE.Sphere();
const _cullVec = new THREE.Vector3();
const _cullMat = new THREE.Matrix4();
const _cullFrusta: (THREE.Frustum | null)[] = [];
/** Per near cascade: the shadow matrix of the last update and an epoch that moves whenever it changes. */
const _cullFrustumKeys: Float64Array[] = [];
const _cullFrustumEpochs: number[] = [];
const _cullEpochs: number[] = [];
function cascadeFrustumEpoch(index: number, matrix: THREE.Matrix4): number {
  let key = _cullFrustumKeys[index];
  if (!key) { key = new Float64Array(16).fill(Number.NaN); _cullFrustumKeys[index] = key; _cullFrustumEpochs[index] = 0; }
  const e = matrix.elements;
  let changed = false;
  for (let k = 0; k < 16; k++) if (key[k] !== e[k]) { key[k] = e[k]; changed = true; }
  if (changed) _cullFrustumEpochs[index]++;
  return _cullFrustumEpochs[index];
}
const noopRaycast = (): void => {};

function geometryTris(geo: THREE.BufferGeometry): number {
  const idx = geo.index;
  const pos = geo.attributes && geo.attributes.position;
  return (((idx ? idx.count : (pos ? pos.count : 0)) / 3) | 0);
}

function shadowCullDebugDisabled(): boolean {
  return typeof window !== 'undefined' && !!window.__SHADOW_DEBUG?.noCull;
}

/** Tell the shadow hooks which cascade each shadow camera belongs to. */
function registerCasterCascades(lights: readonly THREE.DirectionalLight[]): void {
  for (let i = 0; i < lights.length; i++) _cascadeIndexByCamera.set(lights[i].shadow.camera, i);
  _casterProxyCascades = Math.max(_casterProxyCascades, lights.length - 1);
}

function cloneInstancedAttribute(source: THREE.InstancedBufferAttribute): THREE.InstancedBufferAttribute {
  const Ctor = source.array.constructor as unknown as new (length: number) => NumericAttributeArray;
  const clone = new THREE.InstancedBufferAttribute(
    new Ctor(source.array.length), source.itemSize, source.normalized, source.meshPerAttribute);
  clone.setUsage(THREE.DynamicDrawUsage);
  return clone;
}

function isAttachedTo(object: THREE.Object3D, root: THREE.Object3D): boolean {
  let node: THREE.Object3D | null = object;
  while (node) {
    if (node === root) return true;
    node = node.parent;
  }
  return false;
}

/** Drop a record's proxies; the owner is re-classified by its next shadow draw when `forget`. */
function disposeCasterRecord(rec: CasterProxyRecord, forget: boolean): void {
  for (const proxy of rec.proxies) {
    rec.owner.remove(proxy);
    _proxyOf.delete(proxy);
  }
  rec.proxies.length = 0;
  if (forget) _casterRecords.delete(rec.owner);
  else _casterRecords.set(rec.owner, null);
}

/** Build the proxies for a heavy owner; null when the owner cannot be mirrored. */
function buildCasterRecord(owner: THREE.InstancedMesh): CasterProxyRecord | null {
  const geo = owner.geometry;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const bs = geo.boundingSphere;
  const capacity = owner.instanceMatrix.count;
  if (!bs || !isFinite(bs.radius) || bs.radius <= 0 || capacity <= 0 || _casterProxyCascades <= 0) {
    _casterRecords.set(owner, null);
    return null;
  }
  const ownerAttrs: THREE.InstancedBufferAttribute[] = [owner.instanceMatrix];
  for (const key of Object.keys(geo.attributes)) {
    const attr = geo.attributes[key];
    if (!(attr instanceof THREE.InstancedBufferAttribute)) continue;
    if (attr.count < capacity) {
      _casterRecords.set(owner, null);
      return null;
    }
    ownerAttrs.push(attr);
  }
  const proxies: THREE.InstancedMesh[] = [];
  const proxyAttrs: THREE.InstancedBufferAttribute[][] = [];
  const rec: CasterProxyRecord = {
    owner, geometry: geo, capacity, proxies, proxyAttrs, ownerAttrs,
    counts: new Int32Array(_casterProxyCascades),
    centers: new Float32Array(capacity * 3),
    radii: new Float32Array(capacity),
    n: 0, matrixVersion: -1, ready: false, savedCount: owner.count,
    compactedEpoch: new Float64Array(_casterProxyCascades).fill(-1),
    compactedMatrix: new Float64Array(_casterProxyCascades).fill(-1),
    compactedStreams: new Float64Array(_casterProxyCascades).fill(-1),
    compactedN: new Float64Array(_casterProxyCascades).fill(-1),
  };
  for (let i = 0; i < _casterProxyCascades; i++) {
    const proxyGeometry = new THREE.BufferGeometry();
    if (geo.index) proxyGeometry.setIndex(geo.index);
    const attrs: THREE.InstancedBufferAttribute[] = [];
    for (const key of Object.keys(geo.attributes)) {
      const attr = geo.attributes[key];
      if (attr instanceof THREE.InstancedBufferAttribute) {
        const clone = cloneInstancedAttribute(attr);
        proxyGeometry.setAttribute(key, clone);
        attrs.push(clone);
      } else {
        proxyGeometry.setAttribute(key, attr); // shared vertex buffer, uploaded once
      }
    }
    proxyGeometry.groups = geo.groups;
    proxyGeometry.drawRange = geo.drawRange;
    proxyGeometry.boundingSphere = bs;
    proxyGeometry.boundingBox = geo.boundingBox;
    const proxy = new THREE.InstancedMesh(proxyGeometry, owner.material, capacity);
    proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (owner.instanceColor) {
      // keep the owner's depth-program variant (USE_INSTANCING_COLOR); the depth pass never reads it
      proxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
      proxy.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    proxy.customDepthMaterial = owner.customDepthMaterial;
    proxy.customDistanceMaterial = owner.customDistanceMaterial;
    proxy.castShadow = true;
    proxy.receiveShadow = false;
    proxy.frustumCulled = false;
    proxy.matrixAutoUpdate = false;
    proxy.matrixWorldAutoUpdate = false;
    proxy.matrixWorld.copy(owner.matrixWorld);
    proxy.count = 0;
    proxy.raycast = noopRaycast; // aim/pick rays never see shadow geometry
    proxy.name = `${owner.name || 'caster'}-shadow-c${i}`;
    proxy.userData.cotCasterProxy = true;
    proxy.userData.aoExclude = true;
    markShadowOnly(proxy);
    owner.add(proxy);
    proxies.push(proxy);
    proxyAttrs.push([proxy.instanceMatrix, ...attrs]);
    _proxyOf.set(proxy, { rec, cascade: i });
  }
  _casterRecords.set(owner, rec);
  _casterOwners.push(new WeakRef(owner));
  return rec;
}

function resolveCasterRecord(owner: THREE.InstancedMesh): CasterProxyRecord | null {
  const record = _casterRecords.get(owner);
  if (record !== undefined) return record;
  if (_proxyOf.has(owner) || geometryTris(owner.geometry) * owner.instanceMatrix.count < SHADOW_CULL_MIN_TRIS) {
    _casterRecords.set(owner, null);
    return null;
  }
  return buildCasterRecord(owner);
}

/** Re-derive per-instance world spheres when the owner's instances changed. */
function refreshCasterSpheres(rec: CasterProxyRecord): void {
  const owner = rec.owner;
  const n = Math.min(owner.count, rec.capacity);
  if (rec.matrixVersion === owner.instanceMatrix.version && rec.n === n) return;
  const bs = rec.geometry.boundingSphere as THREE.Sphere;
  const matrices = owner.instanceMatrix.array;
  for (let i = 0; i < n; i++) {
    _cullMat.fromArray(matrices, i * 16).premultiply(owner.matrixWorld);
    _cullVec.copy(bs.center).applyMatrix4(_cullMat);
    rec.centers[i * 3] = _cullVec.x;
    rec.centers[i * 3 + 1] = _cullVec.y;
    rec.centers[i * 3 + 2] = _cullVec.z;
    rec.radii[i] = bs.radius * _cullMat.getMaxScaleOnAxis() + SHADOW_CULL_MARGIN;
  }
  rec.n = n;
  rec.matrixVersion = owner.instanceMatrix.version;
}

/** Copy the owner instances inside `frustum` into proxy `cascade`'s prefix and mark it for upload. */
function compactCasterProxy(rec: CasterProxyRecord, cascade: number, frustum: THREE.Frustum): void {
  const n = rec.n;
  const centers = rec.centers;
  const radii = rec.radii;
  const sources = rec.ownerAttrs;
  const targets = rec.proxyAttrs[cascade];
  let k = 0;
  for (let j = 0; j < n; j++) {
    _cullSphere.center.set(centers[j * 3], centers[j * 3 + 1], centers[j * 3 + 2]);
    _cullSphere.radius = radii[j];
    if (!frustum.intersectsSphere(_cullSphere)) continue;
    for (let a = 0; a < sources.length; a++) {
      const size = sources[a].itemSize;
      const src = sources[a].array;
      const dst = targets[a].array;
      const from = j * size;
      const to = k * size;
      for (let c = 0; c < size; c++) dst[to + c] = src[from + c];
    }
    k++;
  }
  rec.counts[cascade] = k;
  if (k === 0) return;
  for (let a = 0; a < targets.length; a++) {
    const attr = targets[a];
    attr.clearUpdateRanges();
    attr.addUpdateRange(0, k * attr.itemSize);
    attr.needsUpdate = true;
  }
}

/**
 * Before renderer.render(): compact every registered owner's proxies for the
 * cascades that draw this frame (`all` for shadow priming), using the poses
 * applyStableCascadePoses just wrote so the frusta match the maps.
 */
function updateCasterProxies(
  lights: readonly THREE.DirectionalLight[],
  root: THREE.Object3D,
  all: boolean,
): void {
  if (_casterOwners.length === 0 || shadowCullDebugDisabled()) return;
  const proxyCascades = Math.min(_casterProxyCascades, lights.length);
  let scheduled = 0;
  for (let i = 0; i < proxyCascades; i++) {
    _cullFrusta[i] = null;
    const light = lights[i];
    if (!all && !light.shadow.needsUpdate) continue;
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    light.shadow.updateMatrices(light);
    _cullFrusta[i] = light.shadow.getFrustum();
    _cullEpochs[i] = cascadeFrustumEpoch(i, light.shadow.matrix);
    scheduled |= 1 << i;
  }
  if (!scheduled) return;
  for (let r = _casterOwners.length - 1; r >= 0; r--) {
    const owner = _casterOwners[r].deref();
    const rec = owner ? _casterRecords.get(owner) : null;
    if (!owner || !rec) {
      _casterOwners.splice(r, 1);
      continue;
    }
    if (!isAttachedTo(owner, root)) continue;
    if (owner.geometry !== rec.geometry || owner.instanceMatrix.count !== rec.capacity) {
      disposeCasterRecord(rec, true);
      _casterOwners.splice(r, 1);
      continue;
    }
    refreshCasterSpheres(rec);
    let streams = 0;
    for (let a = 1; a < rec.ownerAttrs.length; a++) streams += rec.ownerAttrs[a].version;
    for (let i = 0; i < rec.proxies.length; i++) {
      const proxy = rec.proxies[i];
      proxy.matrixWorld.copy(owner.matrixWorld);
      proxy.castShadow = owner.castShadow;
      if (proxy.material !== owner.material) proxy.material = owner.material;
      if (proxy.customDepthMaterial !== owner.customDepthMaterial) proxy.customDepthMaterial = owner.customDepthMaterial;
      const frustum = _cullFrusta[i];
      if (!frustum) continue;
      // a still cascade over an unchanged owner already holds this compaction (priming always recompacts)
      if (!all && rec.compactedEpoch[i] === _cullEpochs[i] && rec.compactedMatrix[i] === owner.instanceMatrix.version
        && rec.compactedStreams[i] === streams && rec.compactedN[i] === rec.n) continue;
      compactCasterProxy(rec, i, frustum);
      rec.compactedEpoch[i] = _cullEpochs[i];
      rec.compactedMatrix[i] = owner.instanceMatrix.version;
      rec.compactedStreams[i] = streams;
      rec.compactedN[i] = rec.n;
    }
    rec.ready = true;
  }
}

/** onBeforeShadow half: a proxy draws only in its cascade, an owner only where no proxy covers. */
function casterProxyBeforeShadow(object: THREE.Object3D, shadowCamera: THREE.Camera): void {
  if (!(object instanceof THREE.InstancedMesh)) return;
  const noCull = shadowCullDebugDisabled();
  const asProxy = _proxyOf.get(object);
  if (asProxy) {
    object.count = !noCull && _cascadeIndexByCamera.get(shadowCamera) === asProxy.cascade
      ? asProxy.rec.counts[asProxy.cascade]
      : 0;
    return;
  }
  const rec = resolveCasterRecord(object);
  if (!rec) return;
  rec.savedCount = object.count;
  if (noCull || !rec.ready) return;
  const cascade = _cascadeIndexByCamera.get(shadowCamera);
  if (cascade !== undefined && cascade < rec.proxies.length) object.count = 0;
}

/** onAfterShadow half: owners get their count back, proxies return to zero, before anyone reads them. */
function casterProxyAfterShadow(object: THREE.Object3D): void {
  if (!(object instanceof THREE.InstancedMesh)) return;
  if (_proxyOf.has(object)) {
    object.count = 0;
    return;
  }
  const rec = _casterRecords.get(object);
  if (rec) object.count = rec.savedCount;
}

// --- end of the r8 caster-proxy block

export { casterProxyAfterShadow, casterProxyBeforeShadow, registerCasterCascades, updateCasterProxies };
