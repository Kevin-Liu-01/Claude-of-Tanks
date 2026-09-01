import * as THREE from 'three';
import {
  configureTankFactory,
  createTank,
  registerCanonicalBuilders,
  registerProfiledBuilders,
} from '../vehicles/tankFactoryCore.ts';
import { createProfileBuilders } from '../vehicles/profileBuilderAdapter.ts';
import {
  FITTINGS,
  buildDonorVariant,
  buildProfile,
} from '../vehicles/profiles/kit.ts';
import { T90_PROFILES } from '../vehicles/profiles/t90.ts';
import { ABRAMS_PROFILES } from '../vehicles/profiles/abrams.ts';
import { MODERN3_BUILDERS } from '../vehicles/modern3.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';

// This worker owns only the four Garage exhibit families. Importing the
// browser fleet facade here made Vite copy every playable family into a 5 MB
// worker even though 129 of them can never enter a maintenance bay.
configureTankFactory({ canonicalBuilderPacks: [], profiledBuilders: {}, fittings: FITTINGS });
registerCanonicalBuilders('garage-modern3', MODERN3_BUILDERS);
registerProfiledBuilders(createProfileBuilders({
  ...T90_PROFILES,
  ...ABRAMS_PROFILES,
}, {
  buildDonorVariant,
  buildProfile,
}));

type NumericArray =
  | Float32Array | Uint32Array | Uint16Array | Uint8Array
  | Int32Array | Int16Array | Int8Array;

interface AttributeWire {
  array: NumericArray;
  itemSize: number;
  normalized: boolean;
}

export interface GeometryWire {
  attributes: Record<string, AttributeWire>;
  index: AttributeWire | null;
  groups: Array<{ start: number; count: number; materialIndex: number }>;
  drawRange: { start: number; count: number };
  boundingBox: [number, number, number, number, number, number] | null;
  boundingSphere: [number, number, number, number] | null;
}

export interface MaterialWire {
  name: string;
  role: string;
  color: number | null;
  roughness: number | null;
  metalness: number | null;
  opacity: number;
  transparent: boolean;
  side: number;
  depthWrite: boolean;
}

interface NodeWire {
  kind: 'object' | 'group' | 'lod' | 'mesh' | 'instanced';
  name: string;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  visible: boolean;
  matrixAutoUpdate: boolean;
  renderOrder: number;
  userData: Record<string, string | number | boolean>;
  geometry: number | null;
  materials: number[];
  count: number;
  instanceMatrix: AttributeWire | null;
  instanceColor: AttributeWire | null;
  lodDistances: number[];
  lodHysteresis: number[];
  children: NodeWire[];
}

export interface FlatNodeWire extends Omit<NodeWire, 'children' | 'lodDistances' | 'lodHysteresis'> {
  parentIndex: number;
  lodDistance: number | null;
  lodHysteresis: number | null;
}

export interface GarageWorkshopGeometryWire {
  requestId: number;
  specId: string;
  nodes: FlatNodeWire[];
  geometries: GeometryWire[];
  materials: MaterialWire[];
  buildMs: number;
}

interface WorkshopWorkerScope {
  onmessage: ((event: MessageEvent<{
    requestId: number;
    specId: string;
    camoSeed: number;
    spec: (typeof TANK_SPECS)[string];
  }>) => void) | null;
  postMessage(message: WorkshopWorkerReply, transfer?: Transferable[]): void;
}

type WorkshopWorkerReply =
  | {
    ok: true;
    kind: 'begin';
    requestId: number;
    specId: string;
    buildMs: number;
    materials: MaterialWire[];
    geometryCount: number;
    nodeCount: number;
  }
  | { ok: true; kind: 'geometries'; requestId: number; geometries: GeometryWire[] }
  | { ok: true; kind: 'nodes'; requestId: number; nodes: FlatNodeWire[] }
  | { ok: true; kind: 'complete'; requestId: number }
  | { ok: false; requestId: number; message: string };

const workerScope = globalThis as typeof globalThis & WorkshopWorkerScope;

function copyArray(array: ArrayLike<number> & { constructor: { new(source: ArrayLike<number>): NumericArray } }): NumericArray {
  return new array.constructor(array);
}

function attributeWire(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): AttributeWire {
  if ('isInterleavedBufferAttribute' in attribute && attribute.isInterleavedBufferAttribute) {
    const array = new Float32Array(attribute.count * attribute.itemSize);
    for (let index = 0; index < attribute.count; index++) {
      for (let component = 0; component < attribute.itemSize; component++) {
        array[index * attribute.itemSize + component] = attribute.getComponent(index, component);
      }
    }
    return { array, itemSize: attribute.itemSize, normalized: attribute.normalized };
  }
  return {
    array: copyArray(attribute.array as never),
    itemSize: attribute.itemSize,
    normalized: attribute.normalized,
  };
}

function geometryTransferableBuffers(value: readonly GeometryWire[]): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  for (const geometry of value) {
    for (const attribute of Object.values(geometry.attributes)) {
      buffers.add(attribute.array.buffer as ArrayBuffer);
    }
    if (geometry.index) buffers.add(geometry.index.array.buffer as ArrayBuffer);
  }
  return [...buffers];
}

function nodeTransferableBuffers(value: readonly FlatNodeWire[]): Transferable[] {
  const buffers = new Set<ArrayBuffer>();
  for (const node of value) {
    if (node.instanceMatrix) buffers.add(node.instanceMatrix.array.buffer as ArrayBuffer);
    if (node.instanceColor) buffers.add(node.instanceColor.array.buffer as ArrayBuffer);
  }
  return [...buffers];
}

const PRIMITIVE_USER_DATA_KEYS = [
  'appearanceRole', 'authoredShadowProxy', 'combatHitboxPart', 'combatHitboxRole',
  'runningGear', 'trackBucket', 'trackGuard', 'vehicleMarking',
] as const;

type PrimitiveUserDataKey = (typeof PRIMITIVE_USER_DATA_KEYS)[number];
type PrimitiveUserDataValue = string | number | boolean;

function primitiveUserData(
  source: Partial<Record<PrimitiveUserDataKey, PrimitiveUserDataValue>>,
): Record<string, PrimitiveUserDataValue> {
  const result: Record<string, string | number | boolean> = {};
  for (const key of PRIMITIVE_USER_DATA_KEYS) {
    const value = source?.[key];
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value;
    }
  }
  return result;
}

function serializeTank(root: THREE.Group, requestId: number, specId: string, buildMs: number): GarageWorkshopGeometryWire {
  const geometries: GeometryWire[] = [];
  const geometryIds = new Map<THREE.BufferGeometry, number>();
  const materials: MaterialWire[] = [];
  const materialIds = new Map<THREE.Material, number>();
  const nodes: FlatNodeWire[] = [];

  const geometryId = (geometry: THREE.BufferGeometry): number => {
    const known = geometryIds.get(geometry);
    if (known !== undefined) return known;
    const id = geometries.length;
    geometryIds.set(geometry, id);
    const attributes: Record<string, AttributeWire> = {};
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      attributes[name] = attributeWire(attribute);
    }
    // Exact bounds are part of the geometry payload. Recomputing them after
    // transfer scanned hundreds of thousands of vertices on the main thread
    // and produced a visible Garage frame spike despite off-thread creation.
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    const box = geometry.boundingBox;
    const sphere = geometry.boundingSphere;
    geometries.push({
      attributes,
      index: geometry.index ? attributeWire(geometry.index) : null,
      groups: geometry.groups.map((group) => ({
        start: group.start,
        count: group.count,
        materialIndex: group.materialIndex ?? 0,
      })),
      drawRange: { ...geometry.drawRange },
      boundingBox: box
        ? [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z]
        : null,
      boundingSphere: sphere
        ? [sphere.center.x, sphere.center.y, sphere.center.z, sphere.radius]
        : null,
    });
    return id;
  };

  const materialId = (material: THREE.Material): number => {
    const known = materialIds.get(material);
    if (known !== undefined) return known;
    const id = materials.length;
    materialIds.set(material, id);
    const standard = material as THREE.MeshStandardMaterial;
    materials.push({
      name: material.name || '',
      role: String(material.userData?.appearanceRole || ''),
      color: standard.color?.isColor ? standard.color.getHex() : null,
      roughness: typeof standard.roughness === 'number' ? standard.roughness : null,
      metalness: typeof standard.metalness === 'number' ? standard.metalness : null,
      opacity: material.opacity,
      transparent: material.transparent,
      side: material.side,
      depthWrite: material.depthWrite,
    });
    return id;
  };

  const appendNode = (
    object: THREE.Object3D,
    parentIndex: number,
    lodDistance: number | null,
    lodHysteresis: number | null,
  ): void => {
    const mesh = object as THREE.Mesh;
    const instanced = object as THREE.InstancedMesh;
    const lod = object as THREE.LOD;
    const sourceMaterials = mesh.isMesh
      ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      : [];
    const nodeIndex = nodes.length;
    nodes.push({
      kind: instanced.isInstancedMesh ? 'instanced'
        : mesh.isMesh ? 'mesh'
          : lod.isLOD ? 'lod'
            : object instanceof THREE.Group ? 'group' : 'object',
      name: object.name || '',
      position: object.position.toArray() as [number, number, number],
      quaternion: object.quaternion.toArray() as [number, number, number, number],
      scale: object.scale.toArray() as [number, number, number],
      visible: object.visible,
      matrixAutoUpdate: object.matrixAutoUpdate,
      renderOrder: object.renderOrder,
      userData: primitiveUserData(object.userData),
      geometry: mesh.isMesh ? geometryId(mesh.geometry) : null,
      materials: sourceMaterials.filter(Boolean).map(materialId),
      count: instanced.isInstancedMesh ? instanced.count : 0,
      instanceMatrix: instanced.isInstancedMesh ? attributeWire(instanced.instanceMatrix) : null,
      instanceColor: instanced.isInstancedMesh && instanced.instanceColor
        ? attributeWire(instanced.instanceColor) : null,
      parentIndex,
      lodDistance,
      lodHysteresis,
    });
    object.children.forEach((child, index) => appendNode(
      child,
      nodeIndex,
      lod.isLOD ? lod.levels[index]?.distance ?? 0 : null,
      lod.isLOD ? lod.levels[index]?.hysteresis ?? 0 : null,
    ));
  };

  appendNode(root, -1, null, null);
  return { requestId, specId, nodes, geometries, materials, buildMs };
}

const GEOMETRY_BATCH_SIZE = 24;
const NODE_BATCH_SIZE = 192;

function yieldWorkerQueue(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function postWireInBatches(wire: GarageWorkshopGeometryWire): Promise<void> {
  workerScope.postMessage({
    ok: true,
    kind: 'begin',
    requestId: wire.requestId,
    specId: wire.specId,
    buildMs: wire.buildMs,
    materials: wire.materials,
    geometryCount: wire.geometries.length,
    nodeCount: wire.nodes.length,
  });
  for (let index = 0; index < wire.geometries.length; index += GEOMETRY_BATCH_SIZE) {
    const geometries = wire.geometries.slice(index, index + GEOMETRY_BATCH_SIZE);
    workerScope.postMessage({
      ok: true,
      kind: 'geometries',
      requestId: wire.requestId,
      geometries,
    }, geometryTransferableBuffers(geometries));
    await yieldWorkerQueue();
  }
  for (let index = 0; index < wire.nodes.length; index += NODE_BATCH_SIZE) {
    const nodes = wire.nodes.slice(index, index + NODE_BATCH_SIZE);
    workerScope.postMessage({
      ok: true,
      kind: 'nodes',
      requestId: wire.requestId,
      nodes,
    }, nodeTransferableBuffers(nodes));
    await yieldWorkerQueue();
  }
  workerScope.postMessage({ ok: true, kind: 'complete', requestId: wire.requestId });
}

workerScope.onmessage = async (event: MessageEvent<{
  requestId: number;
  specId: string;
  camoSeed: number;
  spec: (typeof TANK_SPECS)[string];
}>): Promise<void> => {
  const { requestId, specId, camoSeed, spec } = event.data;
  try {
    TANK_SPECS[specId] ||= spec;
    const startedAt = performance.now();
    const visual = createTank(specId, {}, {
      camoSeed,
      materialMode: 'geometry-only',
      geometryQuality: 'high',
      staticPreview: true,
      decor: true,
      deferStaticBatch: true,
    });
    const wire = serializeTank(visual.root, requestId, specId, performance.now() - startedAt);
    await postWireInBatches(wire);
  } catch (error) {
    workerScope.postMessage({
      ok: false,
      requestId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
