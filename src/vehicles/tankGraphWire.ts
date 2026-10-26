// A tank's graph across a realm (UI-LOCKDOWN E, stage 2b, 2026-10-25): every node of a root's subtree with its kind,
// name, visibility, local transform and userData, each mesh's geometry (a shared geometry once) and a stand-in for its
// material carrying what a geometry pass reads of one (its side and colour write, whether it is a list), so a worker
// runs a pass (the decoration's plan: decorPlanWire.ts) over a replica that traverses, probes and measures exactly as
// the page's graph would. userData travels with the three.js values it holds rebuilt (vectors, boxes, matrices...) and
// its references to nodes and geometries of the subtree kept; a value that cannot travel (a function, a material, a node
// outside the subtree) is dropped and named in `lossy`, which the decor proof reports.
import * as THREE from 'three';
import { addGeometryBuffers, geometryFrom, geometryWire, type GeometryWire } from './geometryWire.ts';

type NodeKind = 'object' | 'group' | 'mesh' | 'lod' | 'instanced';
interface MaterialWire {
  readonly name: string;
  readonly side: number;
  readonly colorWrite: boolean;
  readonly transparent: boolean;
  readonly opacity: number;
  readonly visible: boolean;
}
interface NodeWire {
  readonly kind: NodeKind;
  readonly parent: number;
  readonly name: string;
  readonly visible: boolean;
  readonly matrixAutoUpdate: boolean;
  /** position (3), quaternion (4), scale (3), the local matrix (16), then the world matrix as it stands (16) */
  readonly transform: number[];
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
  readonly frustumCulled: boolean;
  readonly renderOrder: number;
  readonly layers: number;
  readonly userData: unknown;
  readonly geometry?: number;
  readonly material?: MaterialWire | MaterialWire[];
  readonly levels?: readonly { object: number; distance: number; hysteresis: number }[];
  readonly count?: number;
  readonly instanceMatrix?: Float32Array;
}
export interface TankGraphWire {
  /** the root's parent's world matrix, when the root has a parent */
  readonly parentWorld: readonly number[] | null;
  readonly nodes: readonly NodeWire[];
  readonly geometries: readonly GeometryWire[];
  /** where a value could not travel (a node path and key), for the proof's report */
  readonly lossy: readonly string[];
}

// A tagged value in encoded userData: { [TAG]: kind, v }. A plain object's own keys never use it.
const TAG = '__tankGraphWire';
type MathValue = THREE.Vector2 | THREE.Vector3 | THREE.Vector4 | THREE.Quaternion | THREE.Euler | THREE.Color
  | THREE.Matrix3 | THREE.Matrix4 | THREE.Box3 | THREE.Sphere | THREE.Plane;

function mathWire(value: object): { kind: string; v: unknown[] } | null {
  // named here, never by constructor.name (a minified build renames the classes)
  const array = (kind: string, v: { toArray(): number[] }) => ({ kind, v: v.toArray() as unknown[] });
  if (value instanceof THREE.Vector2) return array('Vector2', value);
  if (value instanceof THREE.Vector3) return array('Vector3', value);
  if (value instanceof THREE.Vector4) return array('Vector4', value);
  if (value instanceof THREE.Quaternion) return array('Quaternion', value);
  if (value instanceof THREE.Color) return array('Color', value);
  if (value instanceof THREE.Matrix3) return array('Matrix3', value);
  if (value instanceof THREE.Matrix4) return array('Matrix4', value);
  if (value instanceof THREE.Euler) return { kind: 'Euler', v: [value.x, value.y, value.z, value.order] };
  if (value instanceof THREE.Box3) return { kind: 'Box3', v: [...value.min.toArray(), ...value.max.toArray()] };
  if (value instanceof THREE.Sphere) return { kind: 'Sphere', v: [...value.center.toArray(), value.radius] };
  if (value instanceof THREE.Plane) return { kind: 'Plane', v: [...value.normal.toArray(), value.constant] };
  return null;
}

function mathFrom(kind: string, v: unknown[]): MathValue {
  const n = v as number[];
  switch (kind) {
    case 'Vector2': return new THREE.Vector2().fromArray(n);
    case 'Vector3': return new THREE.Vector3().fromArray(n);
    case 'Vector4': return new THREE.Vector4().fromArray(n);
    case 'Quaternion': return new THREE.Quaternion().fromArray(n);
    case 'Color': return new THREE.Color().fromArray(n);
    case 'Matrix3': return new THREE.Matrix3().fromArray(n);
    case 'Matrix4': return new THREE.Matrix4().fromArray(n);
    case 'Euler': return new THREE.Euler(n[0], n[1], n[2], v[3] as THREE.EulerOrder);
    case 'Box3': return new THREE.Box3(new THREE.Vector3(n[0], n[1], n[2]), new THREE.Vector3(n[3], n[4], n[5]));
    case 'Sphere': return new THREE.Sphere(new THREE.Vector3(n[0], n[1], n[2]), n[3]);
    case 'Plane': return new THREE.Plane(new THREE.Vector3(n[0], n[1], n[2]), n[3]);
    default: throw new Error(`tank graph wire: unknown value kind ${kind}`);
  }
}

const isPlain = (value: object): boolean => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

/** How a value refers to the graph it travels with (a value travelling alone has neither). */
interface ValueRefs {
  node?(object: THREE.Object3D): number | undefined;
  geometry?(geometry: THREE.BufferGeometry, where: string): number;
}

/** A userData value as it travels; `where` names it in `lossy` when part of it cannot. */
export function wireValue(value: unknown, where: string, lossy: string[], refs: ValueRefs = {}): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') { lossy.push(where); return undefined; }
    return value;
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (Array.isArray(value)) return value.map((item, i) => wireValue(item, `${where}[${i}]`, lossy, refs));
  if (value instanceof THREE.Object3D) {
    const index = refs.node?.(value);
    if (index === undefined) { lossy.push(`${where} (a node outside the subtree)`); return undefined; }
    return { [TAG]: 'node', v: index };
  }
  if (value instanceof THREE.BufferGeometry) {
    if (!refs.geometry) { lossy.push(`${where} (a geometry outside a graph)`); return undefined; }
    return { [TAG]: 'geometry', v: refs.geometry(value, where) };
  }
  const math = mathWire(value);
  if (math) return { [TAG]: math.kind, v: math.v };
  if (value instanceof Map) {
    return { [TAG]: 'Map', v: [...value].map(([k, item], i) => [wireValue(k, `${where}<${i}>`, lossy, refs), wireValue(item, `${where}<${i}>`, lossy, refs)]) };
  }
  if (value instanceof Set) return { [TAG]: 'Set', v: [...value].map((item, i) => wireValue(item, `${where}{${i}}`, lossy, refs)) };
  if (!isPlain(value)) lossy.push(`${where} (a ${value.constructor?.name ?? 'class'} instance travels as its own fields)`);
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === TAG) throw new Error(`tank graph wire: ${where} uses the wire's own key`);
    out[key] = wireValue(item, `${where}.${key}`, lossy, refs);
  }
  return out;
}

/** A value wireValue encoded, its node and geometry references resolved against the replica's. */
export function valueFrom(value: unknown, nodes: readonly THREE.Object3D[] = [], geometries: readonly THREE.BufferGeometry[] = []): unknown {
  if (value === null || typeof value !== 'object' || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (Array.isArray(value)) return value.map((item) => valueFrom(item, nodes, geometries));
  const tagged = value as Record<string, unknown>;
  if (TAG in tagged) {
    const kind = tagged[TAG] as string, v = tagged.v;
    if (kind === 'node') return nodes[v as number];
    if (kind === 'geometry') return geometries[v as number];
    if (kind === 'Map') return new Map((v as [unknown, unknown][]).map(([k, item]) => [valueFrom(k, nodes, geometries), valueFrom(item, nodes, geometries)]));
    if (kind === 'Set') return new Set((v as unknown[]).map((item) => valueFrom(item, nodes, geometries)));
    return mathFrom(kind, v as unknown[]);
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(tagged)) out[key] = valueFrom(item, nodes, geometries);
  return out;
}

/** The subtree of `root` as it travels, and the node index of each of `refs` (a node outside the subtree: -1). */
export function tankGraphWire(root: THREE.Object3D, refs: readonly THREE.Object3D[] = []): { wire: TankGraphWire; refs: number[] } {
  const nodeIndex = new Map<THREE.Object3D, number>();
  const order: THREE.Object3D[] = [];
  root.traverse((object) => { nodeIndex.set(object, order.length); order.push(object); });
  const geometryIndex = new Map<THREE.BufferGeometry, number>();
  const geometries: GeometryWire[] = [];
  const lossy: string[] = [];
  const pathOf = (object: THREE.Object3D): string => {
    const names: string[] = [];
    for (let at: THREE.Object3D | null = object; at && at !== root.parent; at = at.parent) names.unshift(at.name || at.type);
    return names.join('/');
  };

  function geometryRef(geometry: THREE.BufferGeometry, where: string): number {
    let index = geometryIndex.get(geometry);
    if (index === undefined) {
      index = geometries.length;
      geometryIndex.set(geometry, index);
      geometries.push(null as unknown as GeometryWire);
      geometries[index] = geometryWire(geometry, (value) => encode(value, `${where}#geometry`));
    }
    return index;
  }

  const graphRefs = { node: (object: THREE.Object3D) => nodeIndex.get(object), geometry: geometryRef };
  const encode = (value: unknown, where: string): unknown => wireValue(value, where, lossy, graphRefs);

  const materialWire = (material: THREE.Material): MaterialWire => ({ name: material.name, side: material.side,
    colorWrite: material.colorWrite, transparent: material.transparent, opacity: material.opacity, visible: material.visible });

  const nodes = order.map((object): NodeWire => {
    const where = pathOf(object);
    const mesh = object as THREE.Mesh;
    const kind: NodeKind = object instanceof THREE.InstancedMesh ? 'instanced' : object instanceof THREE.LOD ? 'lod'
      : mesh.isMesh ? 'mesh' : object instanceof THREE.Group ? 'group' : 'object';
    if (kind === 'object' && object.type !== 'Object3D') lossy.push(`${where} (a ${object.type} travels as an Object3D)`);
    const node: NodeWire = {
      kind, parent: object === root ? -1 : nodeIndex.get(object.parent!)!, name: object.name, visible: object.visible,
      matrixAutoUpdate: object.matrixAutoUpdate,
      transform: [...object.position.toArray(), ...object.quaternion.toArray(), ...object.scale.toArray(), ...object.matrix.elements,
        ...object.matrixWorld.elements],
      castShadow: object.castShadow, receiveShadow: object.receiveShadow, frustumCulled: object.frustumCulled,
      renderOrder: object.renderOrder, layers: object.layers.mask, userData: encode(object.userData, `${where}.userData`),
      ...(mesh.isMesh ? {
        geometry: geometryRef(mesh.geometry, where),
        material: Array.isArray(mesh.material) ? mesh.material.map(materialWire) : materialWire(mesh.material),
      } : {}),
      ...(kind === 'lod' ? { levels: (object as THREE.LOD).levels.map((level) => ({ object: nodeIndex.get(level.object) ?? -1,
        distance: level.distance, hysteresis: level.hysteresis })) } : {}),
      ...(kind === 'instanced' ? { count: (object as THREE.InstancedMesh).count,
        instanceMatrix: ((object as THREE.InstancedMesh).instanceMatrix.array as Float32Array).slice() } : {}),
    };
    return node;
  });
  return { wire: { parentWorld: root.parent ? [...root.parent.matrixWorld.elements] : null, nodes, geometries, lossy },
    refs: refs.map((object) => nodeIndex.get(object) ?? -1) };
}

/** The arrays a graph wire can hand over without a copy. */
export function tankGraphTransfer(wire: TankGraphWire): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const geometry of wire.geometries) addGeometryBuffers(geometry, buffers);
  for (const node of wire.nodes) if (node.instanceMatrix) buffers.add(node.instanceMatrix.buffer as ArrayBuffer);
  return [...buffers];
}

/** The replica: its nodes in the sender's traversal order (node 0 the root). */
export function tankGraphFrom(wire: TankGraphWire): THREE.Object3D[] {
  const nodes: THREE.Object3D[] = [];
  const standIn = (material: MaterialWire): THREE.Material => {
    const stand = new THREE.MeshBasicMaterial();
    Object.assign(stand, material);
    return stand;
  };
  // the geometries and nodes first, their userData last (a reference may point anywhere in the subtree)
  const geometries = wire.geometries.map((geometry) => geometryFrom(geometry, () => ({})));
  for (const node of wire.nodes) {
    let object: THREE.Object3D;
    if (node.kind === 'instanced') {
      const instanced = new THREE.InstancedMesh(geometries[node.geometry!], standIn(node.material as MaterialWire), node.count!);
      instanced.instanceMatrix.array.set(node.instanceMatrix!);
      object = instanced;
    } else if (node.kind === 'mesh') {
      const material = Array.isArray(node.material) ? node.material.map(standIn) : standIn(node.material!);
      object = new THREE.Mesh(geometries[node.geometry!], material);
    } else {
      object = node.kind === 'lod' ? new THREE.LOD() : node.kind === 'group' ? new THREE.Group() : new THREE.Object3D();
    }
    const t = node.transform;
    object.name = node.name;
    object.visible = node.visible;
    object.position.fromArray(t, 0);
    object.quaternion.fromArray(t, 3);
    object.scale.fromArray(t, 7);
    object.matrix.fromArray(t, 10);
    object.matrixWorld.fromArray(t, 26);
    object.matrixAutoUpdate = node.matrixAutoUpdate;
    object.castShadow = node.castShadow;
    object.receiveShadow = node.receiveShadow;
    object.frustumCulled = node.frustumCulled;
    object.renderOrder = node.renderOrder;
    object.layers.mask = node.layers;
    nodes.push(object);
  }
  // children in the sender's order, then each LOD's levels over its own children, then userData
  wire.nodes.forEach((node, i) => { if (node.parent >= 0) nodes[node.parent].add(nodes[i]); });
  if (wire.parentWorld && nodes.length) {
    // the root's parent stands as a fixed frame at the world matrix it had
    const holder = new THREE.Object3D();
    holder.matrixAutoUpdate = false;
    holder.matrix.fromArray(wire.parentWorld);
    holder.matrixWorld.fromArray(wire.parentWorld);
    holder.add(nodes[0]);
  }
  wire.nodes.forEach((node, i) => {
    const levels = node.levels && (nodes[i] as THREE.LOD).levels;
    if (levels) levels.splice(0, levels.length, ...node.levels!.map((level) => ({ object: nodes[level.object],
      distance: level.distance, hysteresis: level.hysteresis })));
    nodes[i].userData = (valueFrom(node.userData, nodes, geometries) ?? {}) as Record<string, unknown>;
  });
  wire.geometries.forEach((geometry, i) => {
    geometries[i].userData = (valueFrom(geometry.userData, nodes, geometries) ?? {}) as Record<string, unknown>;
  });
  return nodes;
}
