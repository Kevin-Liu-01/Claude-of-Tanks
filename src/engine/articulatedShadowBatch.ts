import {
  BatchedMesh, BufferAttribute, FloatType, Frustum, Material, Matrix4, Mesh, MeshDepthMaterial,
  Object3D, Sphere, StaticDrawUsage,
  type BufferGeometry, type Camera, type Scene, type WebGLRenderer,
} from 'three';
import { markShadowOnly, SHADOW_ONLY_LAYER } from './renderLayers.ts';

const sourceOwners = new WeakMap<Mesh, BatchedMesh>();
const beforeShadow = Object3D.prototype.onBeforeShadow;
const afterShadow = Object3D.prototype.onAfterShadow;
const beforeCompile = Material.prototype.onBeforeCompile;

interface SourceRecord {
  readonly source: Mesh;
  readonly instance: number;
  readonly matrix: Matrix4;
  readonly sphere: Sphere;
  readonly group: Parameters<WebGLRenderer['renderBufferDirect']>[5];
  visible: boolean;
}

function isFullStaticGeometry(geometry: BufferGeometry): boolean {
  const position = geometry.getAttribute('position');
  if (!(position instanceof BufferAttribute) || position.itemSize !== 3 || position.count < 3) return false;
  if (geometry.groups.length || Object.keys(geometry.morphAttributes).length) return false;
  const count = geometry.index?.count ?? position.count;
  if (count % 3 || geometry.drawRange.start !== 0) return false;
  if (geometry.drawRange.count !== Infinity && geometry.drawRange.count !== count) return false;
  for (const attribute of Object.values(geometry.attributes)) {
    if (!(attribute instanceof BufferAttribute) || attribute.usage !== StaticDrawUsage
      || attribute.count !== position.count || attribute.gpuType !== FloatType
      || !(attribute.array instanceof Float32Array) || 'isInstancedBufferAttribute' in attribute) return false;
    if (!attribute.array.every(Number.isFinite)) return false;
  }
  return !geometry.index || geometry.index.usage === StaticDrawUsage;
}

function sameAttributeLayout(a: BufferGeometry, b: BufferGeometry): boolean {
  if (!!a.index !== !!b.index) return false;
  const names = Object.keys(a.attributes);
  if (names.length !== Object.keys(b.attributes).length) return false;
  for (const name of names) {
    const left = a.getAttribute(name), right = b.getAttribute(name);
    if (!right || left.itemSize !== right.itemSize || left.normalized !== right.normalized
      || left.array.constructor !== right.array.constructor) return false;
  }
  return true;
}

function supportedSource(source: Mesh, first: Mesh): boolean {
  if (!(source instanceof Mesh) || 'isInstancedMesh' in source || 'isBatchedMesh' in source
    || 'isSkinnedMesh' in source || source.children.length || sourceOwners.has(source)) return false;
  if (!source.castShadow || source.receiveShadow || !source.frustumCulled
    || source.layers.mask !== (1 << SHADOW_ONLY_LAYER)
    || source.userData.authoredShadowProxy !== true) return false;
  if (Array.isArray(source.material) || source.material !== first.material
    || source.customDepthMaterial !== first.customDepthMaterial || source.customDistanceMaterial) return false;
  if (source.onBeforeShadow !== beforeShadow || source.onAfterShadow !== afterShadow) return false;
  return isFullStaticGeometry(source.geometry) && sameAttributeLayout(first.geometry, source.geometry);
}

function positiveOwnerTransform(root: Object3D, source: Mesh): boolean {
  const relative = new Matrix4(), local = new Matrix4();
  let object: Object3D | null = source;
  while (object && object !== root) {
    if (object.matrixAutoUpdate) local.compose(object.position, object.quaternion, object.scale);
    else local.copy(object.matrix);
    relative.premultiply(local);
    object = object.parent;
  }
  return object === root && relative.elements.every(Number.isFinite) && relative.determinant() > 0;
}

function admissible(root: Object3D, sources: readonly Mesh[]): boolean {
  if (sources.length < 2 || sources.length > 3 || new Set(sources).size !== sources.length) return false;
  const first = sources[0];
  if (!(root instanceof Object3D) || !(first instanceof Mesh)) return false;
  if (Array.isArray(first.material) || first.material.colorWrite || first.material.depthWrite
    || first.material.onBeforeCompile !== beforeCompile) return false;
  if (!(first.customDepthMaterial instanceof MeshDepthMaterial)
    || first.customDepthMaterial.onBeforeCompile !== beforeCompile) return false;
  return sources.every(source => supportedSource(source, first) && positiveOwnerTransform(root, source));
}

function visibleWithin(root: Object3D, source: Mesh, camera: Camera): boolean {
  if (!source.layers.test(camera.layers) || !source.material
    || Array.isArray(source.material) || !source.material.visible) return false;
  let object: Object3D | null = source;
  while (object) {
    if (!object.visible) return false;
    if (object === root) return true;
    object = object.parent;
  }
  return false;
}

/** Retains source ownership; only this container owns copied geometry/control textures. */
class ArticulatedShadowBatch extends BatchedMesh {
  override customSort: null = null;
  private readonly root: Object3D;
  private readonly records: SourceRecord[] = [];
  private readonly inverse = new Matrix4();
  private readonly relative = new Matrix4();
  private readonly projection = new Matrix4();
  private readonly frustum = new Frustum();
  private readonly sphere = new Sphere();
  private frustumReady = false;
  private released = false;

  constructor(root: Object3D, sources: readonly Mesh[]) {
    let vertices = 0, indices = 0;
    for (const source of sources) {
      vertices += source.geometry.getAttribute('position').count;
      indices += source.geometry.index?.count ?? 0;
    }
    super(sources.length, vertices, indices, sources[0].material as Material);
    this.root = root;
    this.name = 'articulatedShadowBatch';
    this.castShadow = true;
    this.receiveShadow = false;
    // ShadowMap tests this bound before onBeforeShadow. Per-entry culling is
    // still performed by the pinned base hook against EACH cascade camera.
    this.frustumCulled = false;
    this.perObjectFrustumCulled = true;
    this.sortObjects = false;
    this.customDepthMaterial = sources[0].customDepthMaterial;
    this.userData.authoredShadowProxy = true;
    this.userData.shadowVehicleId = sources[0].userData.shadowVehicleId;
    markShadowOnly(this);
  }

  initialize(sources: readonly Mesh[]): void {
    for (const source of sources) {
      const geometry = this.addGeometry(source.geometry);
      const instance = this.addInstance(geometry);
      const matrix = new Matrix4();
      matrix.elements.fill(NaN);
      // Warm the owned entry's bounds now. Neither cascade preparation nor
      // mirrored fallback may allocate a sphere or mutate borrowed geometry.
      const sphere = new Sphere();
      this.getBoundingSphereAt(geometry, sphere);
      const range = this.getGeometryRangeAt(geometry);
      if (!range) throw new Error('Missing articulated shadow geometry range');
      const group = { start: range.start, count: range.count, materialIndex: 0 };
      this.records.push({ source, instance, matrix, sphere, group, visible: true });
    }
    // Root insertion may synchronously throw from a user event handler. No
    // original caster is changed until all construction/insertion succeeded.
    this.root.add(this);
    for (const { source } of this.records) {
      sourceOwners.set(source, this);
      source.castShadow = false;
    }
  }

  override raycast(): void {}

  private setEntryVisible(record: SourceRecord, visible: boolean): void {
    if (record.visible === visible) return;
    this.setVisibleAt(record.instance, visible);
    record.visible = visible;
  }

  private drawOriginal(renderer: WebGLRenderer, camera: Camera, material: Material, record: SourceRecord): void {
    // Rare late reflection/singular batch transform: preserve the original
    // draw's winding and world transform instead of feeding a negative
    // instance matrix to BatchedMesh (explicitly unsupported by Three).
    const source = record.source;
    if (source.frustumCulled) {
      if (!this.frustumReady) {
        this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        this.frustum.setFromProjectionMatrix(this.projection, camera.coordinateSystem, camera.reversedDepth);
        this.frustumReady = true;
      }
      this.sphere.copy(record.sphere).applyMatrix4(source.matrixWorld);
      if (!this.frustum.intersectsSphere(this.sphere)) return;
    }
    source.modelViewMatrix.multiplyMatrices(camera.matrixWorldInverse, source.matrixWorld);
    // ShadowMap has already uploaded this batch geometry before the hook.
    // Borrow its exact packed range: the noncasting source geometry may never
    // have reached WebGLObjects.update. Keep the original object for winding.
    // Pinned shadow rendering passes a null scene despite its narrower type.
    const draw = renderer.renderBufferDirect as (
      camera: Camera, scene: Scene | null, geometry: BufferGeometry, material: Material,
      object: Object3D, group: Parameters<WebGLRenderer['renderBufferDirect']>[5] | null,
    ) => void;
    draw.call(renderer, camera, null, this.geometry, material, source, record.group);
  }

  private synchronize(renderer: WebGLRenderer, camera: Camera, shadowCamera: Camera, material: Material): void {
    const determinant = this.matrixWorld.determinant();
    const invertible = Number.isFinite(determinant) && determinant !== 0;
    if (invertible) this.inverse.copy(this.matrixWorld).invert();
    this.frustumReady = false;
    for (const record of this.records) {
      const visible = visibleWithin(this.root, record.source, camera);
      if (!visible) { this.setEntryVisible(record, false); continue; }
      this.relative.multiplyMatrices(this.inverse, record.source.matrixWorld);
      const supported = invertible && this.relative.determinant() > 0
        && this.relative.elements.every(Number.isFinite);
      this.setEntryVisible(record, supported);
      if (!supported) {
        this.drawOriginal(renderer, shadowCamera, material, record);
      } else if (!record.matrix.equals(this.relative)) {
        this.setMatrixAt(record.instance, this.relative);
        record.matrix.copy(this.relative);
      }
    }
  }

  override onBeforeShadow(
    renderer: WebGLRenderer, scene: Scene, camera: Camera, shadowCamera: Camera,
    geometry: BufferGeometry, material: Material,
    group: Parameters<Object3D['onBeforeShadow']>[6],
  ): void {
    if (this.released) return;
    this.synchronize(renderer, camera, shadowCamera, material);
    // Never reuse the previous cascade's culling or indirect draw list.
    super.onBeforeShadow(renderer, scene, camera, shadowCamera, geometry, material, group);
  }

  override dispose(): void {
    if (this.released) return;
    this.released = true;
    this.visible = false;
    this.castShadow = false;
    for (const { source } of this.records) {
      if (sourceOwners.get(source) !== this) continue;
      sourceOwners.delete(source);
      if (!source.castShadow) source.castShadow = true;
    }
    // Three container disposal is invoked from root.traverse(). Detaching
    // here would shift that traversal's child array and skip later owners.
    super.dispose();
  }
}

/**
 * Optional batching of 2–3 immutable authored proxies. Unsupported inputs
 * retain the exact original path. Returned dispose() disables the retained
 * container and restores its original caster flags; GPU suspension must NOT
 * call BatchedMesh.dispose(), which destroys its reusable control textures.
 */
export function installArticulatedShadowBatch(root: Object3D, sources: readonly Mesh[]): BatchedMesh | null {
  if (!admissible(root, sources)) return null;
  let batch: ArticulatedShadowBatch | null = null;
  try {
    batch = new ArticulatedShadowBatch(root, sources);
    batch.initialize(sources);
    return batch;
  } catch (error) {
    try { batch?.dispose(); } catch { /* Preserve the construction failure. */ }
    try { batch?.removeFromParent(); } catch { /* Rollback is outside traversal. */ }
    throw error;
  }
}
