// The object graph and runtime data of a finished vehicle visual, copied for another actor (tankFactoryCore
// cloneTankVisual). Every object, transform, visibility flag and receipt is the copy's own; geometry the runtime never
// writes is shared by reference, the buffers it writes are copied (the caller names them), and every material is the
// copy's own (the caller's materialOf). Whatever this cannot copy faithfully (an unknown object kind, a render hook or
// user-data callback it does not know, a reference out of the tree, a class instance it cannot copy) refuses the
// whole copy instead of sharing its source's state with it: the caller then builds the visual from scratch.
import * as THREE from 'three';
import { zoomAwareLodUpdate } from '../engine/lodDistanceScale.ts';

type GraphAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;

/** The drawn kinds copied with their geometry and materials (an instanced mesh takes its own buffers too). */
const DRAWN_KINDS: ReadonlySet<Function> = new Set([THREE.Mesh, THREE.Line, THREE.LineSegments, THREE.LineLoop, THREE.Points]);

/** The render hooks the factory installs on every finished mesh; the caller installs them again on the copy. */
const REINSTALLED_HOOKS: ReadonlySet<string> = new Set(['vehicleGroundBefore', 'vehicleGroundAfter', 'applyCoplanarDepthLayer']);

export class VehicleGraphCopy {
  readonly objects = new Map<THREE.Object3D, THREE.Object3D>();
  private readonly geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  private readonly attributes = new Map<GraphAttribute, GraphAttribute>();
  private readonly data = new Map<object, unknown>();
  private readonly copyMaterial: (material: THREE.Material) => THREE.Material;
  /** User-data callbacks the copy's own runtime registers again (dropped here, never shared). */
  private readonly rebuiltCallbacks: ReadonlySet<string>;

  constructor(copyMaterial: (material: THREE.Material) => THREE.Material, rebuiltCallbacks: ReadonlySet<string> = new Set()) {
    this.copyMaterial = copyMaterial;
    this.rebuiltCallbacks = rebuiltCallbacks;
  }

  /** Give the copy its own buffers of `source` (every attribute and the index copied); returns the copy. */
  ownGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
    let copy = this.geometries.get(source);
    if (copy) return copy;
    copy = source.clone();
    for (const [name, attribute] of Object.entries(source.attributes)) this.attributes.set(attribute, copy.attributes[name]!);
    if (source.index && copy.index) this.attributes.set(source.index, copy.index);
    this.geometries.set(source, copy);
    return copy;
  }

  /** The copy's buffers of `source` where it owns some, else the shared source. */
  geometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
    return this.geometries.get(source) ?? source;
  }

  /** The copy's attribute for one of the source's (its own when it owns the geometry's buffers, else the shared one). */
  attribute<T extends GraphAttribute>(source: T): T {
    return (this.attributes.get(source) ?? source) as T;
  }

  material<T extends THREE.Material>(source: T): T {
    return this.copyMaterial(source) as T;
  }

  object<T extends THREE.Object3D>(source: T): T {
    const copy = this.objects.get(source);
    if (!copy) throw new Error(`${source.name || source.type}: not part of the copied vehicle`);
    return copy as T;
  }

  /** Copy a whole tree; every object in it becomes reachable through object(). */
  tree<T extends THREE.Object3D>(source: T): T {
    const copy = this.node(source);
    for (const child of source.children) copy.add(this.tree(child));
    if ((source as THREE.Object3D as THREE.LOD).isLOD) {
      const lod = source as THREE.Object3D as THREE.LOD, target = copy as THREE.Object3D as THREE.LOD;
      target.levels.push(...lod.levels.map((level) => ({ ...level, object: this.object(level.object) })));
      target.autoUpdate = lod.autoUpdate;
      (target as THREE.LOD & { _currentLevel: number })._currentLevel = (lod as THREE.LOD & { _currentLevel: number })._currentLevel;
    }
    return copy as T;
  }

  /** User data in the copy's terms (run after tree(): it may reference any object of the tree). */
  userData(): void {
    for (const [source, copy] of this.objects) copy.userData = this.value(source.userData, 'userData') as Record<string, unknown>;
  }

  /**
   * One value of the source's runtime state in the copy's terms: objects of the tree, its materials, buffers and
   * attributes map to the copy's; plain data, math values and typed arrays are copied (shared identities stay shared);
   * textures and frozen values are shared; anything else refuses the copy.
   */
  value<T>(source: T, path = 'value'): T {
    if (source === null || typeof source !== 'object') {
      if (typeof source === 'function') throw new Error(`${path}: a callback cannot be copied for another visual`);
      return source;
    }
    const object = source as unknown as object;
    if (this.data.has(object)) return this.data.get(object) as T;
    const any = source as unknown as Record<string, unknown> & {
      isObject3D?: boolean; isMaterial?: boolean; isBufferGeometry?: boolean; isBufferAttribute?: boolean;
      isInterleavedBufferAttribute?: boolean; isTexture?: boolean; clone?: () => unknown;
    };
    if (any.isObject3D) return this.object(source as unknown as THREE.Object3D) as unknown as T;
    if (any.isMaterial) return this.material(source as unknown as THREE.Material) as unknown as T;
    if (any.isBufferGeometry) return this.geometry(source as unknown as THREE.BufferGeometry) as unknown as T;
    if (any.isBufferAttribute || any.isInterleavedBufferAttribute) return this.attribute(source as unknown as GraphAttribute) as unknown as T;
    if (any.isTexture) return source;
    let copy: unknown;
    if (ArrayBuffer.isView(source)) copy = (source as unknown as { slice(): unknown }).slice();
    else if (source instanceof THREE.Vector2 || source instanceof THREE.Vector3 || source instanceof THREE.Vector4
      || source instanceof THREE.Quaternion || source instanceof THREE.Euler || source instanceof THREE.Matrix3
      || source instanceof THREE.Matrix4 || source instanceof THREE.Color || source instanceof THREE.Box3
      || source instanceof THREE.Sphere || source instanceof THREE.Plane) copy = any.clone!();
    else if (Array.isArray(source)) {
      const list: unknown[] = [];
      this.data.set(object, list);
      source.forEach((entry, i) => { list.push(this.value(entry, `${path}[${i}]`)); });
      return (Object.isFrozen(source) ? Object.freeze(list) : list) as T;
    } else if (source instanceof Map) {
      const map = new Map();
      this.data.set(object, map);
      for (const [key, entry] of source) map.set(this.value(key, `${path} key`), this.value(entry, `${path}.${String(key)}`));
      return map as T;
    } else if (source instanceof Set) {
      const set = new Set();
      this.data.set(object, set);
      for (const entry of source) set.add(this.value(entry, `${path} entry`));
      return set as T;
    } else {
      const proto = Object.getPrototypeOf(source);
      if (proto !== Object.prototype && proto !== null) throw new Error(`${path}: a ${proto?.constructor?.name ?? 'class'} instance cannot be copied for another visual`);
      const record: Record<string, unknown> = proto === null ? Object.create(null) : {};
      this.data.set(object, record);
      for (const [key, entry] of Object.entries(any)) {
        if (typeof entry === 'function' && path === 'userData' && this.rebuiltCallbacks.has(key)) continue;
        record[key] = this.value(entry, `${path}.${key}`);
      }
      return (Object.isFrozen(source) ? Object.freeze(record) : record) as T;
    }
    this.data.set(object, copy);
    return copy as T;
  }

  private node(source: THREE.Object3D): THREE.Object3D {
    const any = source as THREE.Object3D & Partial<THREE.Mesh> & { isInstancedMesh?: boolean; isBatchedMesh?: boolean;
      isSkinnedMesh?: boolean; isLOD?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean; isGroup?: boolean };
    let copy: THREE.Object3D;
    if (any.isBatchedMesh || any.isSkinnedMesh || any.isSprite) throw new Error(`${source.name || source.type}: a ${source.type} cannot be copied for another visual`);
    if (any.isInstancedMesh) {
      const instanced = source as THREE.InstancedMesh;
      if (instanced.morphTexture) throw new Error(`${source.name}: a morphed instanced mesh cannot be copied for another visual`);
      const target = new THREE.InstancedMesh(this.geometry(instanced.geometry), this.materials(instanced.material), 0);
      target.count = instanced.count;
      target.instanceMatrix = this.instanceAttribute(instanced.instanceMatrix);
      target.instanceColor = instanced.instanceColor ? this.instanceAttribute(instanced.instanceColor) : null;
      target.boundingBox = instanced.boundingBox?.clone() ?? null;
      target.boundingSphere = instanced.boundingSphere?.clone() ?? null;
      copy = target;
    } else if (DRAWN_KINDS.has(source.constructor)) {
      const mesh = source as THREE.Mesh;
      const Kind = source.constructor as new (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[]) => THREE.Mesh;
      const target = new Kind(this.geometry(mesh.geometry), this.materials(mesh.material));
      if (mesh.morphTargetInfluences) target.morphTargetInfluences = mesh.morphTargetInfluences.slice();
      if (mesh.morphTargetDictionary) target.morphTargetDictionary = { ...mesh.morphTargetDictionary };
      copy = target;
    } else if (any.isLOD) copy = new THREE.LOD();
    else if (any.isGroup) copy = new THREE.Group();
    else if (source.constructor === THREE.Object3D) copy = new THREE.Object3D();
    else throw new Error(`${source.name || source.type}: a ${source.constructor.name} cannot be copied for another visual`);
    // Object3D.copy deep-copies user data through JSON, which drops callbacks and mangles typed arrays and references:
    // the copy takes it from userData() instead
    const userData = source.userData;
    source.userData = {};
    try { THREE.Object3D.prototype.copy.call(copy, source, false); }
    finally { source.userData = userData; }
    for (const key of Object.keys(source)) {
      const own = (source as unknown as Record<string, unknown>)[key];
      if (typeof own !== 'function') continue;
      if ((key === 'onBeforeRender' || key === 'onAfterRender') && REINSTALLED_HOOKS.has(own.name)) continue;
      if (key === 'update' && own === zoomAwareLodUpdate) { (copy as THREE.LOD).update = zoomAwareLodUpdate; continue; }
      // the pickers' exclusion (shadow proxies, bore fallbacks): a no-op
      if (key === 'raycast' && (own as () => void).length === 0) { copy.raycast = own as THREE.Object3D['raycast']; continue; }
      throw new Error(`${source.name || source.type}: its ${key} (${own.name || 'anonymous'}) cannot be copied for another visual`);
    }
    this.objects.set(source, copy);
    return copy;
  }

  private materials(source: THREE.Material | THREE.Material[]): THREE.Material | THREE.Material[] {
    return Array.isArray(source) ? source.map((material) => this.material(material)) : this.material(source);
  }

  /** A per-instance buffer is always the copy's own; meshes that shared one (the shoes' two detail levels) still do. */
  private instanceAttribute(source: THREE.InstancedBufferAttribute): THREE.InstancedBufferAttribute {
    let copy = this.attributes.get(source) as THREE.InstancedBufferAttribute | undefined;
    if (!copy) {
      copy = source.clone() as THREE.InstancedBufferAttribute;
      this.attributes.set(source, copy);
    }
    return copy;
  }
}
