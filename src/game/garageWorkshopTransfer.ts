import * as THREE from 'three';
import { createTankMaterials, prebakeSharedTextures } from '../vehicles/materials.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import type {
  GarageDressingEngineContext,
  GarageWorkshopVisual,
} from './garageDressing.ts';
import type {
  FlatNodeWire,
  GarageWorkshopGeometryWire,
  GeometryWire,
  MaterialWire,
} from './garageWorkshopGeometryWorker.ts';

type AttributeWire = GarageWorkshopGeometryWire['geometries'][number]['index'] & {};

interface WorkerReplyBase {
  ok: boolean;
  requestId: number;
  message?: string;
}

type WorkerReply = WorkerReplyBase & (
  | {
    kind: 'begin';
    specId: string;
    buildMs: number;
    materials: MaterialWire[];
    geometryCount: number;
    nodeCount: number;
  }
  | { kind: 'geometries'; geometries: GeometryWire[] }
  | { kind: 'nodes'; nodes: FlatNodeWire[] }
  | { kind: 'complete' }
  | { kind?: undefined }
);

interface MaterialPalette {
  hull: THREE.Material;
  wheels: THREE.Material;
  wheelsRecessed: THREE.Material;
  rubber: THREE.Material;
  detail: THREE.Material;
  dark: THREE.Material;
  shadow: THREE.Material;
  trackLink: THREE.Material;
  spareTrack: THREE.Material;
  glass: THREE.Material;
  barrel: THREE.Material;
  canvasCloth: THREE.Material;
  wood: THREE.Material;
  burnt: THREE.Material;
  dispose(): void;
}

type MaterialPaletteKey = Exclude<keyof MaterialPalette, 'dispose'>;

const ROLE_MATERIAL_KEYS: Readonly<Record<string, MaterialPaletteKey>> = {
  tireRubber: 'rubber',
  trackSteel: 'trackLink',
  trackBand: 'trackLink',
  armorPaint: 'hull',
  fittingPaint: 'detail',
  gunmetal: 'dark',
  gearShadow: 'shadow',
  opticGlass: 'glass',
  canvas: 'canvasCloth',
  wood: 'wood',
  burnt: 'burnt',
};

const NAME_MATERIAL_KEYS: ReadonlyArray<readonly [RegExp, MaterialPaletteKey]> = [
  [/glass/i, 'glass'],
  [/runninggeardetail|wheeldisc/i, 'wheels'],
  [/runninggeardark|shadow/i, 'shadow'],
  [/track|tread/i, 'trackLink'],
  [/detail|equipment|marking/i, 'detail'],
  [/dark|mount/i, 'dark'],
  [/gun|barrel|recoil/i, 'barrel'],
  [/^(hull|turret)|armor|cupola|hatch/i, 'hull'],
];

function bufferAttribute(source: NonNullable<AttributeWire>): THREE.BufferAttribute {
  return new THREE.BufferAttribute(source.array, source.itemSize, source.normalized);
}

function geometryFromWire(source: GarageWorkshopGeometryWire['geometries'][number]): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    geometry.setAttribute(name, bufferAttribute(attribute));
  }
  if (source.index) geometry.setIndex(bufferAttribute(source.index));
  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  if (source.boundingBox) {
    geometry.boundingBox = new THREE.Box3(
      new THREE.Vector3(...source.boundingBox.slice(0, 3) as [number, number, number]),
      new THREE.Vector3(...source.boundingBox.slice(3, 6) as [number, number, number]),
    );
  }
  if (source.boundingSphere) {
    geometry.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(...source.boundingSphere.slice(0, 3) as [number, number, number]),
      source.boundingSphere[3],
    );
  }
  return geometry;
}

const REBUILD_SLICE_MS = 3.5;

function yieldToGarageFrame(): Promise<void> {
  // A timer task gives the browser an animation/render opportunity between
  // slices. `scheduler.yield()` alone may resume ahead of rendering, which is
  // exactly the long-task pattern this transfer boundary exists to avoid.
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function materialForWire(
  source: MaterialWire,
  objectName: string,
  palette: MaterialPalette,
  fallbacks: THREE.Material[],
): THREE.Material {
  const role = source.role;
  if (role === 'wheelPaint') {
    return /recessed/i.test(source.name) ? palette.wheelsRecessed : palette.wheels;
  }
  const roleMaterialKey = ROLE_MATERIAL_KEYS[role];
  if (roleMaterialKey) return palette[roleMaterialKey];

  const nameMaterialKey = NAME_MATERIAL_KEYS.find(([pattern]) => pattern.test(objectName))?.[1];
  if (nameMaterialKey) return palette[nameMaterialKey];

  const material = new THREE.MeshStandardMaterial({
    color: source.color ?? 0x4a5040,
    roughness: source.roughness ?? 0.75,
    metalness: source.metalness ?? 0.1,
    opacity: source.opacity,
    transparent: source.transparent,
    side: source.side as THREE.Side,
    depthWrite: source.depthWrite,
    vertexColors: true,
  });
  fallbacks.push(material);
  return material;
}

function rebuildNodeObject(
  source: FlatNodeWire,
  geometries: readonly THREE.BufferGeometry[],
  materials: readonly MaterialWire[],
  palette: MaterialPalette,
  fallbacks: THREE.Material[],
): THREE.Object3D {
  const resolvedMaterials = source.materials.map((index) =>
    materialForWire(materials[index], source.name, palette, fallbacks));
  let object: THREE.Object3D;
  if (source.kind === 'instanced') {
    const mesh = new THREE.InstancedMesh(
      geometries[source.geometry!],
      resolvedMaterials.length === 1 ? resolvedMaterials[0] : resolvedMaterials,
      source.count,
    );
    if (source.instanceMatrix) mesh.instanceMatrix = bufferAttribute(source.instanceMatrix) as THREE.InstancedBufferAttribute;
    if (source.instanceColor) mesh.instanceColor = bufferAttribute(source.instanceColor) as THREE.InstancedBufferAttribute;
    object = mesh;
  } else if (source.kind === 'mesh') {
    object = new THREE.Mesh(
      geometries[source.geometry!],
      resolvedMaterials.length === 1 ? resolvedMaterials[0] : resolvedMaterials,
    );
  } else if (source.kind === 'lod') object = new THREE.LOD();
  else if (source.kind === 'group') object = new THREE.Group();
  else object = new THREE.Object3D();

  object.name = source.name;
  object.position.fromArray(source.position);
  object.quaternion.fromArray(source.quaternion);
  object.scale.fromArray(source.scale);
  object.visible = source.visible;
  object.matrixAutoUpdate = source.matrixAutoUpdate;
  object.renderOrder = source.renderOrder;
  Object.assign(object.userData, source.userData);

  if (!object.matrixAutoUpdate) object.updateMatrix();
  return object;
}

async function rebuildNodeTree(
  nodes: readonly FlatNodeWire[],
  geometries: readonly THREE.BufferGeometry[],
  materials: readonly MaterialWire[],
  palette: MaterialPalette,
  fallbacks: THREE.Material[],
): Promise<THREE.Object3D> {
  if (!nodes.length) throw new Error('Garage workshop worker returned an empty node tree');
  const objects: THREE.Object3D[] = [];
  let sliceStartedAt = performance.now();
  for (let cursor = 0; cursor < nodes.length; cursor++) {
    const source = nodes[cursor];
    const object = rebuildNodeObject(
      source,
      geometries,
      materials,
      palette,
      fallbacks,
    );
    objects.push(object);
    if (source.parentIndex >= 0) {
      const parent = objects[source.parentIndex];
      if (!parent) throw new Error(`Garage workshop node ${cursor} has no parent ${source.parentIndex}`);
      if (source.lodDistance !== null) {
        (parent as THREE.LOD).addLevel(
          object,
          source.lodDistance,
          source.lodHysteresis ?? 0,
        );
      } else {
        parent.add(object);
      }
    }
    if (performance.now() - sliceStartedAt >= REBUILD_SLICE_MS) {
      await yieldToGarageFrame();
      sliceStartedAt = performance.now();
    }
  }
  return objects[0];
}

async function visualFromWire(
  wire: GarageWorkshopGeometryWire,
  engineCtx: GarageDressingEngineContext,
  camoSeed: number,
): Promise<GarageWorkshopVisual> {
  const timings: Record<string, number> = { startedAt: Math.round(performance.now()) };
  const geometries: THREE.BufferGeometry[] = [];
  let sliceStartedAt = performance.now();
  for (const source of wire.geometries) {
    geometries.push(geometryFromWire(source));
    if (performance.now() - sliceStartedAt >= REBUILD_SLICE_MS) {
      await yieldToGarageFrame();
      sliceStartedAt = performance.now();
    }
  }
  timings.geometriesAt = Math.round(performance.now());
  const spec = TANK_SPECS[wire.specId];
  // Geometry already arrives incrementally from the worker. Paint generation
  // must follow the same cooperative boundary: a synchronous cache miss here
  // otherwise turns one decorative exhibit into a 200-300 ms Garage frame on
  // a 4x-throttled CPU even though its geometry never touched the main thread.
  await prebakeSharedTextures(
    spec,
    engineCtx.anisotropy || 8,
    'ai',
    yieldToGarageFrame,
  );
  timings.texturesAt = Math.round(performance.now());
  const palette = createTankMaterials(
    spec,
    engineCtx as never,
    camoSeed,
    'ai',
  ) as MaterialPalette;
  timings.materialsAt = Math.round(performance.now());
  const fallbackMaterials: THREE.Material[] = [];
  await yieldToGarageFrame();
  const root = await rebuildNodeTree(
    wire.nodes,
    geometries,
    wire.materials,
    palette,
    fallbackMaterials,
  ) as THREE.Group;
  timings.nodesAt = Math.round(performance.now());
  root.userData.workerGeometryBuildMs = wire.buildMs;
  root.userData.geometryQuality = 'high';
  root.userData.textureQuality = 'ai';
  root.userData.workshopTransfer = 'off-main-thread-high-detail';
  root.userData.workshopTransferTimings = timings;
  let disposed = false;
  return {
    root,
    resetForGaragePresentation() {
      root.traverse((object) => {
        object.visible = object.userData.authoredShadowProxy !== true && object.visible;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (root.parent) root.parent.remove(root);
      for (const geometry of geometries) geometry.dispose();
      for (const material of fallbackMaterials) material.dispose();
      palette.dispose();
    },
  };
}

export function createGarageWorkshopTransfer(
  engineCtx: GarageDressingEngineContext,
): {
  createVisual(specId: string, camoSeed: number): Promise<GarageWorkshopVisual>;
  dispose(): void;
} {
  let worker: Worker | null = null;
  let nextRequestId = 1;
  const pending = new Map<number, {
    camoSeed: number;
    wire: GarageWorkshopGeometryWire | null;
    geometryCount: number;
    nodeCount: number;
    resolve(value: GarageWorkshopVisual): void;
    reject(error: Error): void;
  }>();
  const handleMessage = (event: MessageEvent<WorkerReply>): void => {
    const reply = event.data;
    const request = pending.get(reply.requestId);
    if (!request) return;
    if (!reply.ok) {
      pending.delete(reply.requestId);
      request.reject(new Error(reply.message || 'Garage workshop worker failed'));
      return;
    }
    if (reply.kind === 'begin') {
      request.geometryCount = reply.geometryCount;
      request.nodeCount = reply.nodeCount;
      request.wire = {
        requestId: reply.requestId,
        specId: reply.specId,
        buildMs: reply.buildMs,
        materials: reply.materials,
        geometries: [],
        nodes: [],
      };
      return;
    }
    if (!request.wire) {
      pending.delete(reply.requestId);
      request.reject(new Error('Garage workshop worker sent a batch before its header'));
      return;
    }
    if (reply.kind === 'geometries') {
      request.wire.geometries.push(...reply.geometries);
      return;
    }
    if (reply.kind === 'nodes') {
      request.wire.nodes.push(...reply.nodes);
      return;
    }
    if (reply.kind !== 'complete') return;
    pending.delete(reply.requestId);
    if (request.wire.geometries.length !== request.geometryCount
      || request.wire.nodes.length !== request.nodeCount) {
      request.reject(new Error('Garage workshop worker transfer was incomplete'));
      return;
    }
    void visualFromWire(request.wire, engineCtx, request.camoSeed)
      .then(request.resolve, request.reject);
  };
  const handleError = (event: ErrorEvent): void => {
    const error = new Error(event.message || 'Garage workshop worker failed');
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  const ensureWorker = (): Worker => {
    if (worker) return worker;
    worker = new Worker(new URL('./garageWorkshopGeometryWorker.ts', import.meta.url), {
      type: 'module',
      name: 'cot-garage-workshop-geometry',
    });
    worker.onmessage = handleMessage;
    worker.onerror = handleError;
    return worker;
  };
  return {
    createVisual(specId, camoSeed) {
      const requestId = nextRequestId++;
      return new Promise((resolve, reject) => {
        pending.set(requestId, {
          camoSeed,
          wire: null,
          geometryCount: 0,
          nodeCount: 0,
          resolve,
          reject,
        });
        ensureWorker().postMessage({
          requestId,
          specId,
          camoSeed,
          spec: TANK_SPECS[specId],
        });
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      const error = new Error('Garage workshop worker disposed');
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    },
  };
}
