import * as THREE from 'three';
import { createTankMaterials } from '../vehicles/materials.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import type {
  GarageDressingEngineContext,
  GarageWorkshopVisual,
} from './garageDressing.ts';
import type { GarageWorkshopGeometryWire } from './garageWorkshopGeometryWorker.ts';

type AttributeWire = GarageWorkshopGeometryWire['geometries'][number]['index'] & {};
type NodeWire = GarageWorkshopGeometryWire['root'];
type MaterialWire = GarageWorkshopGeometryWire['materials'][number];

interface WorkerReply {
  ok: boolean;
  requestId: number;
  message?: string;
  wire?: GarageWorkshopGeometryWire;
}

interface MaterialPalette extends Record<string, unknown> {
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
  if (role === 'tireRubber') return palette.rubber;
  if (role === 'trackSteel' || role === 'trackBand') return palette.trackLink;
  if (role === 'armorPaint') return palette.hull;
  if (role === 'fittingPaint') return palette.detail;
  if (role === 'gunmetal') return palette.dark;
  if (role === 'gearShadow') return palette.shadow;
  if (role === 'opticGlass') return palette.glass;
  if (role === 'canvas') return palette.canvasCloth;
  if (role === 'wood') return palette.wood;
  if (role === 'burnt') return palette.burnt;

  if (/glass/i.test(objectName)) return palette.glass;
  if (/runninggeardetail|wheeldisc/i.test(objectName)) return palette.wheels;
  if (/runninggeardark|shadow/i.test(objectName)) return palette.shadow;
  if (/track|tread/i.test(objectName)) return palette.trackLink;
  if (/detail|equipment|marking/i.test(objectName)) return palette.detail;
  if (/dark|mount/i.test(objectName)) return palette.dark;
  if (/gun|barrel|recoil/i.test(objectName)) return palette.barrel;
  if (/^(hull|turret)|armor|cupola|hatch/i.test(objectName)) return palette.hull;

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
  source: NodeWire,
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
  source: NodeWire,
  geometries: readonly THREE.BufferGeometry[],
  materials: readonly MaterialWire[],
  palette: MaterialPalette,
  fallbacks: THREE.Material[],
): Promise<THREE.Object3D> {
  const root = rebuildNodeObject(source, geometries, materials, palette, fallbacks);
  const queue: Array<{
    source: NodeWire;
    parent: THREE.Object3D;
    lodDistance: number | null;
  }> = [];
  source.children.forEach((child, index) => queue.push({
    source: child,
    parent: root,
    lodDistance: source.kind === 'lod' ? source.lodDistances[index] ?? 0 : null,
  }));
  let cursor = 0;
  let sliceStartedAt = performance.now();
  while (cursor < queue.length) {
    const entry = queue[cursor++];
    const object = rebuildNodeObject(
      entry.source,
      geometries,
      materials,
      palette,
      fallbacks,
    );
    if (entry.lodDistance !== null) {
      (entry.parent as THREE.LOD).addLevel(object, entry.lodDistance);
    } else {
      entry.parent.add(object);
    }
    entry.source.children.forEach((child, index) => queue.push({
      source: child,
      parent: object,
      lodDistance: entry.source.kind === 'lod'
        ? entry.source.lodDistances[index] ?? 0
        : null,
    }));
    if (performance.now() - sliceStartedAt >= REBUILD_SLICE_MS) {
      await yieldToGarageFrame();
      sliceStartedAt = performance.now();
    }
  }
  return root;
}

async function visualFromWire(
  wire: GarageWorkshopGeometryWire,
  engineCtx: GarageDressingEngineContext,
  camoSeed: number,
): Promise<GarageWorkshopVisual> {
  const geometries: THREE.BufferGeometry[] = [];
  let sliceStartedAt = performance.now();
  for (const source of wire.geometries) {
    geometries.push(geometryFromWire(source));
    if (performance.now() - sliceStartedAt >= REBUILD_SLICE_MS) {
      await yieldToGarageFrame();
      sliceStartedAt = performance.now();
    }
  }
  const palette = createTankMaterials(
    TANK_SPECS[wire.specId],
    engineCtx as never,
    camoSeed,
    'ai',
  ) as MaterialPalette;
  const fallbackMaterials: THREE.Material[] = [];
  await yieldToGarageFrame();
  const root = await rebuildNodeTree(
    wire.root,
    geometries,
    wire.materials,
    palette,
    fallbackMaterials,
  ) as THREE.Group;
  root.userData.workerGeometryBuildMs = wire.buildMs;
  root.userData.geometryQuality = 'high';
  root.userData.textureQuality = 'ai';
  root.userData.workshopTransfer = 'off-main-thread-high-detail';
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
    resolve(value: GarageWorkshopVisual): void;
    reject(error: Error): void;
  }>();
  const handleMessage = (event: MessageEvent<WorkerReply>): void => {
    const reply = event.data;
    const request = pending.get(reply.requestId ?? reply.wire?.requestId ?? -1);
    if (!request) return;
    pending.delete(reply.requestId ?? reply.wire?.requestId ?? -1);
    if (!reply.ok || !reply.wire) {
      request.reject(new Error(reply.message || 'Garage workshop worker failed'));
      return;
    }
    void visualFromWire(reply.wire, engineCtx, request.camoSeed)
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
        pending.set(requestId, { camoSeed, resolve, reject });
        ensureWorker().postMessage({ requestId, specId, camoSeed });
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
