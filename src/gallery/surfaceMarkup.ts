import type { RuntimeValue } from '../runtimeTypes.ts';
import * as THREE from 'three';

export const MARKUP_OPERATIONS = Object.freeze(['inspect', 'remove', 'reshape', 'add'] as const);
export type MarkupOperation = (typeof MARKUP_OPERATIONS)[number];

const OPERATION_COLORS: Readonly<Record<MarkupOperation, number>> = Object.freeze({
  inspect: 0x65a9ff,
  remove: 0xff5a5f,
  reshape: 0xffb347,
  add: 0x43d6b5,
});

const OPERATION_CSS: Readonly<Record<MarkupOperation, string>> = Object.freeze({
  inspect: '#65a9ff',
  remove: '#ff5a5f',
  reshape: '#ffb347',
  add: '#43d6b5',
});

/**
 * Markup must identify a surface without replacing its authored appearance.
 * In particular, an always-on-top double-sided fill turns compact roof guns
 * and spare links into a flat color card. Keep the overlay depth-aware and
 * translucent enough that the source primitive remains readable underneath.
 */
export const SURFACE_MARKUP_OVERLAY_STYLE = Object.freeze({
  hoverOpacity: 0.16,
  selectionOpacity: 0.28,
  depthTest: true,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -3,
});

interface GeometryAdjacency {
  neighbors: number[][];
  normals: THREE.Vector3[];
}

type PositionAttribute = THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
export type SurfacePickTarget = THREE.Mesh | THREE.InstancedMesh;
type PickTarget = SurfacePickTarget;
type SurfaceHit = THREE.Intersection<PickTarget> & {
  face: THREE.Face;
  faceIndex: number;
};

interface SurfaceControls {
  target: THREE.Vector3;
  update(): void;
}

interface SurfaceSpec {
  name?: string;
  authorship?: {
    creator?: string;
    creatorUrl?: string;
    copyright?: string;
    license?: string;
  };
}

interface ReshapeRequest {
  offsetM: number[];
}

interface AddRequest {
  primitive: string;
  dimensionsM: number[];
}

type OperationRequest = ReshapeRequest | AddRequest | null;

interface RuntimeAnnotation {
  object: PickTarget;
  overlay: THREE.Mesh;
}

interface SurfaceAnnotation {
  id: string;
  operation: MarkupOperation;
  scope: string;
  note: string;
  ownership: string;
  rigPath: Array<{ name: string; uuid: string }>;
  poseAtSelection: RuntimeValue;
  mesh: {
    name: string;
    type: string;
    uuid: string;
    geometryUuid: string;
    materialNames: string[];
    instanceId: number | null;
    indexed: boolean;
    positionCount: number;
    triangleCount: number;
    geometryBoundsLocal: BoxRecord;
  };
  surface: {
    seedFaceIndex: number;
    faceIndices: number[];
    localBounds: BoxRecord;
    worldBounds: BoxRecord;
    centroidLocal: number[];
    anchorWorld: number[];
    anchorMeshLocal: number[];
    normalWorld: number[];
    representativeTriangleLocal: number[][];
    representativeTriangleWorld: number[][];
  };
  request: OperationRequest;
  _runtime: RuntimeAnnotation;
}

interface BoxRecord {
  min: number[];
  max: number[];
}

export interface SurfaceInspectionInfo {
  faceIndex: number;
  ownership: string;
  mesh: string;
  instanceId: number | null;
  point: number[];
}

export interface SurfaceMarkupOptions {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  controls: SurfaceControls;
  getSpec(id: string): SurfaceSpec | null | undefined;
  getPose(): RuntimeValue;
  renderFrame(): void;
  showToast?(message: string): void;
  onHover?(info: SurfaceInspectionInfo | null): void;
  root?: ParentNode;
}

const adjacencyCache = new WeakMap<THREE.BufferGeometry, GeometryAdjacency>();

export function effectiveVisible(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

/**
 * Return every visible triangle surface authored beneath a tank root.
 *
 * Gallery Studio used to infer non-pickable helpers from object names. That
 * made ordinary primitive fittings disappear from markup whenever a builder
 * used a name containing "shadow", while unnamed fitting meshes were hard to
 * audit. Pickability now follows render semantics instead: visible geometry is
 * selectable; only explicit markup overlays and authored colorless shadow
 * proxies are excluded.
 */
export function collectSurfacePickTargets(root: THREE.Object3D): SurfacePickTarget[] {
  const targets: SurfacePickTarget[] = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry?.getAttribute('position')) return;
    if (!effectiveVisible(object) || object.userData.gallerySurfaceMarkup) return;
    if (object.userData.authoredShadowProxy || object.userData.shadowOnly) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    const hasRenderedMaterial = materials.some((material) => material
      && material.visible !== false
      && material.colorWrite !== false
      && (!material.transparent || material.opacity > 0));
    if (!hasRenderedMaterial) return;
    targets.push(object as SurfacePickTarget);
  });
  return targets;
}

export function ownershipOf(object: THREE.Object3D): string {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node.name === 'rig_recoil') return 'recoil';
    if (node.name === 'rig_gun') return 'gun';
    if (node.name === 'rig_turret') return 'turret';
    if (node.name === 'rig_hull') return 'hull';
  }
  return 'root';
}

export function faceCount(geometry: THREE.BufferGeometry): number {
  return geometry.index
    ? Math.floor(geometry.index.count / 3)
    : Math.floor(geometry.attributes.position.count / 3);
}

function positionAttribute(geometry: THREE.BufferGeometry): PositionAttribute {
  const position = geometry.attributes.position;
  if (!position) throw new TypeError('Surface geometry requires a position attribute');
  return position;
}

function faceVertexIndices(geometry: THREE.BufferGeometry, faceIndex: number): number[] {
  const base = faceIndex * 3;
  if (geometry.index) {
    return [geometry.index.getX(base), geometry.index.getX(base + 1), geometry.index.getX(base + 2)];
  }
  return [base, base + 1, base + 2];
}

function baseFaceVertices(geometry: THREE.BufferGeometry, faceIndex: number): THREE.Vector3[] {
  const position = positionAttribute(geometry);
  return faceVertexIndices(geometry, faceIndex).map((index) =>
    new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index)));
}

function quantizedVertexKey(position: PositionAttribute, index: number): string {
  const scale = 100000;
  return `${Math.round(position.getX(index) * scale)},${Math.round(position.getY(index) * scale)},${Math.round(position.getZ(index) * scale)}`;
}

function indexFaceEdges(edges: Map<string, number[]>, keys: string[], face: number): void {
  for (const [first, second] of [[0, 1], [1, 2], [2, 0]]) {
    const edge = keys[first] < keys[second]
      ? `${keys[first]}|${keys[second]}`
      : `${keys[second]}|${keys[first]}`;
    const faces = edges.get(edge) || [];
    faces.push(face);
    edges.set(edge, faces);
  }
}

function indexGeometryFaces(
  geometry: THREE.BufferGeometry,
  position: PositionAttribute,
  count: number,
): { edges: Map<string, number[]>; normals: THREE.Vector3[] } {
  const normals: THREE.Vector3[] = Array.from({ length: count }, () => new THREE.Vector3());
  const edges = new Map<string, number[]>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let face = 0; face < count; face++) {
    const indices = faceVertexIndices(geometry, face);
    a.fromBufferAttribute(position, indices[0]);
    b.fromBufferAttribute(position, indices[1]);
    c.fromBufferAttribute(position, indices[2]);
    normals[face].crossVectors(b.sub(a), c.sub(a)).normalize();
    indexFaceEdges(edges, indices.map((index) => quantizedVertexKey(position, index)), face);
  }
  return { edges, normals };
}

function connectAdjacentFaces(edges: Map<string, number[]>, neighbors: number[][]): void {
  for (const faces of edges.values()) {
    if (faces.length < 2) continue;
    for (const face of faces) {
      for (const other of faces) {
        if (face !== other && !neighbors[face].includes(other)) neighbors[face].push(other);
      }
    }
  }
}

function geometryAdjacency(geometry: THREE.BufferGeometry): GeometryAdjacency | null {
  if (adjacencyCache.has(geometry)) return adjacencyCache.get(geometry) ?? null;
  const count = faceCount(geometry);
  if (count > 180000) return null;
  const position = positionAttribute(geometry);
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  const { edges, normals } = indexGeometryFaces(geometry, position, count);
  connectAdjacentFaces(edges, neighbors);
  const result = { neighbors, normals };
  adjacencyCache.set(geometry, result);
  return result;
}

export function coplanarPatch(
  geometry: THREE.BufferGeometry,
  seedFace: number,
  angleDeg = 14,
): number[] {
  const adjacency = geometryAdjacency(geometry);
  if (!adjacency) return [seedFace];
  const threshold = Math.cos(THREE.MathUtils.degToRad(THREE.MathUtils.clamp(angleDeg, 1, 45)));
  const seedNormal = adjacency.normals[seedFace];
  const seen = new Set([seedFace]);
  const queue: number[] = [seedFace];

  while (queue.length && seen.size < 3000) {
    const face = queue.shift();
    if (face === undefined) break;
    const currentNormal = adjacency.normals[face];
    for (const next of adjacency.neighbors[face]) {
      if (seen.has(next)) continue;
      const nextNormal = adjacency.normals[next];
      if (currentNormal.dot(nextNormal) < threshold || seedNormal.dot(nextNormal) < threshold) continue;
      seen.add(next);
      queue.push(next);
    }
  }

  return [...seen].sort((a, b) => a - b);
}

function instanceMatrixFor(object: PickTarget, instanceId: number | null | undefined): THREE.Matrix4 {
  const matrix = new THREE.Matrix4();
  if (object instanceof THREE.InstancedMesh && instanceId != null && Number.isInteger(instanceId)) {
    object.getMatrixAt(instanceId, matrix);
  }
  return matrix;
}

function objectLocalFaceVertices(
  object: PickTarget,
  faceIndex: number,
  instanceId: number | null | undefined,
): THREE.Vector3[] {
  const matrix = instanceMatrixFor(object, instanceId);
  return baseFaceVertices(object.geometry, faceIndex).map((vertex) => vertex.applyMatrix4(matrix));
}

function highlightGeometry(
  object: PickTarget,
  faceIndices: number[],
  instanceId: number | null | undefined,
  lift = 0.006,
): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const faceIndex of faceIndices) {
    const vertices = objectLocalFaceVertices(object, faceIndex, instanceId);
    const normal = new THREE.Vector3().crossVectors(
      vertices[1].clone().sub(vertices[0]),
      vertices[2].clone().sub(vertices[0]),
    ).normalize();
    for (const vertex of vertices) {
      vertex.addScaledVector(normal, lift);
      positions.push(vertex.x, vertex.y, vertex.z);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function roundNumber(value: number): number {
  return Number(value.toFixed(5));
}

function vectorArray(vector: THREE.Vector3): number[] {
  return [roundNumber(vector.x), roundNumber(vector.y), roundNumber(vector.z)];
}

function boxRecord(box: THREE.Box3): BoxRecord {
  return { min: vectorArray(box.min), max: vectorArray(box.max) };
}

function timestampSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function downloadBlob(blob: Blob, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}

export function createSurfaceMarkup({
  renderer,
  camera,
  controls,
  getSpec,
  getPose,
  renderFrame,
  showToast = () => {},
  onHover = () => {},
  root = document,
}: SurfaceMarkupOptions) {
  const $ = <T extends HTMLElement = HTMLInputElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing Surface Markup control: ${selector}`);
    return element;
  };
  const operationButtons = [
    ...root.querySelectorAll<HTMLButtonElement>('[data-markup-operation]'),
  ];
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  let tankRoot: THREE.Object3D | null = null;
  let tankId: string | null = null;
  let pickTargets: PickTarget[] = [];
  let annotations: SurfaceAnnotation[] = [];
  let selectedAnnotationId: string | null = null;
  let annotationSequence = 1;
  let operation: MarkupOperation = 'remove';
  let hoverOverlay: THREE.Mesh | null = null;
  let active = false;

  function operationMaterial(
    nextOperation: MarkupOperation,
    hover = false,
  ): THREE.MeshBasicMaterial {
    const key = `${nextOperation}:${hover}`;
    const cached = materials.get(key);
    if (cached) return cached;
    const material = new THREE.MeshBasicMaterial({
      color: OPERATION_COLORS[nextOperation] || OPERATION_COLORS.inspect,
      transparent: true,
      opacity: hover
        ? SURFACE_MARKUP_OVERLAY_STYLE.hoverOpacity
        : SURFACE_MARKUP_OVERLAY_STYLE.selectionOpacity,
      side: THREE.DoubleSide,
      depthTest: SURFACE_MARKUP_OVERLAY_STYLE.depthTest,
      depthWrite: SURFACE_MARKUP_OVERLAY_STYLE.depthWrite,
      polygonOffset: SURFACE_MARKUP_OVERLAY_STYLE.polygonOffset,
      polygonOffsetFactor: SURFACE_MARKUP_OVERLAY_STYLE.polygonOffsetFactor,
      polygonOffsetUnits: SURFACE_MARKUP_OVERLAY_STYLE.polygonOffsetUnits,
      toneMapped: false,
    });
    materials.set(key, material);
    return material;
  }

  function addOverlay(
    object: PickTarget,
    faceIndices: number[],
    instanceId: number | null | undefined,
    nextOperation: MarkupOperation,
    hover = false,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      highlightGeometry(object, faceIndices, instanceId, hover ? 0.009 : 0.007),
      operationMaterial(nextOperation, hover),
    );
    mesh.name = hover ? 'gallerySurfaceMarkupHover' : 'gallerySurfaceMarkupSelection';
    mesh.userData.gallerySurfaceMarkup = true;
    mesh.renderOrder = hover ? 900 : 800;
    object.add(mesh);
    return mesh;
  }

  function removeOverlay(mesh: THREE.Mesh | null | undefined): void {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry?.dispose();
  }

  function clearHover(): void {
    removeOverlay(hoverOverlay);
    hoverOverlay = null;
    onHover(null);
  }

  function rigPath(object: THREE.Object3D): Array<{ name: string; uuid: string }> {
    const path: Array<{ name: string; uuid: string }> = [];
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      path.unshift({ name: node.name || node.type, uuid: node.uuid });
      if (node === tankRoot) break;
    }
    return path;
  }

  function materialNames(object: PickTarget): string[] {
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    return objectMaterials.filter(Boolean).map((material) =>
      material.name || `material-${material.uuid}`);
  }

  function makePickTargets(): void {
    pickTargets = tankRoot ? collectSurfacePickTargets(tankRoot) : [];
  }

  function rayHit(clientX: number, clientY: number): SurfaceHit | null {
    if (!active || !pickTargets.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects<PickTarget>(pickTargets, false).find((hit): hit is SurfaceHit =>
      hit.faceIndex !== undefined && hit.face !== null
      && !!hit.object.geometry && effectiveVisible(hit.object)) || null;
  }

  function operationRequest(): OperationRequest {
    if (operation === 'reshape') {
      return {
        offsetM: ['#markupOffsetX', '#markupOffsetY', '#markupOffsetZ'].map((selector) => Number($(selector).value)),
      };
    }
    if (operation === 'add') {
      return {
        primitive: $('#markupPrimitive').value,
        dimensionsM: ['#markupSizeW', '#markupSizeH', '#markupSizeD'].map((selector) => Number($(selector).value)),
      };
    }
    return null;
  }

  function recordFromHit(hit: SurfaceHit, faceIndices: number[]): SurfaceAnnotation {
    const object = hit.object;
    const instanceId = Number.isInteger(hit.instanceId) ? hit.instanceId : null;
    const instanceMatrix = instanceMatrixFor(object, instanceId);
    const combinedWorld = object.matrixWorld.clone().multiply(instanceMatrix);
    const inverseWorld = combinedWorld.clone().invert();
    const localBounds = new THREE.Box3();
    const worldBounds = new THREE.Box3();
    const centroidLocal = new THREE.Vector3();
    let vertexSamples = 0;

    for (const faceIndex of faceIndices) {
      for (const objectLocalVertex of objectLocalFaceVertices(object, faceIndex, instanceId)) {
        const baseLocal = objectLocalVertex.clone().applyMatrix4(instanceMatrix.clone().invert());
        const world = objectLocalVertex.clone().applyMatrix4(object.matrixWorld);
        localBounds.expandByPoint(baseLocal);
        worldBounds.expandByPoint(world);
        centroidLocal.add(baseLocal);
        vertexSamples++;
      }
    }
    centroidLocal.multiplyScalar(1 / Math.max(1, vertexSamples));

    const representativeLocal = baseFaceVertices(object.geometry, hit.faceIndex);
    const representativeWorld = representativeLocal.map((vertex) => vertex.clone().applyMatrix4(combinedWorld));
    const worldNormal = hit.face.normal.clone()
      .applyMatrix3(new THREE.Matrix3().getNormalMatrix(combinedWorld))
      .normalize();
    const geometry = object.geometry;
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    const geometryBounds = geometry.boundingBox;
    if (!geometryBounds) throw new Error('Surface geometry has no computable bounding box');
    const annotation = {
      id: `surface-${annotationSequence++}`,
      operation,
      scope: $('#markupScope').value,
      note: $('#markupNote').value.trim(),
      ownership: ownershipOf(object),
      rigPath: rigPath(object),
      poseAtSelection: getPose(),
      mesh: {
        name: object.name || object.type,
        type: object.type,
        uuid: object.uuid,
        geometryUuid: geometry.uuid,
        materialNames: materialNames(object),
        instanceId,
        indexed: !!geometry.index,
        positionCount: geometry.attributes.position.count,
        triangleCount: faceCount(geometry),
        geometryBoundsLocal: boxRecord(geometryBounds),
      },
      surface: {
        seedFaceIndex: hit.faceIndex,
        faceIndices,
        localBounds: boxRecord(localBounds),
        worldBounds: boxRecord(worldBounds),
        centroidLocal: vectorArray(centroidLocal),
        anchorWorld: vectorArray(hit.point),
        anchorMeshLocal: vectorArray(hit.point.clone().applyMatrix4(inverseWorld)),
        normalWorld: vectorArray(worldNormal),
        representativeTriangleLocal: representativeLocal.map(vectorArray),
        representativeTriangleWorld: representativeWorld.map(vectorArray),
      },
      request: operationRequest(),
    } as SurfaceAnnotation;
    const selectionOverlay = addOverlay(object, faceIndices, instanceId, operation);
    Object.defineProperty(annotation, '_runtime', {
      value: { object, overlay: selectionOverlay },
      enumerable: false,
    });
    return annotation;
  }

  function exportRecord() {
    const spec = tankId ? getSpec(tankId) : null;
    return {
      schemaVersion: 1,
      tool: 'tank-gallery-surface-markup',
      generatedAt: new Date().toISOString(),
      authorship: {
        creator: spec?.authorship?.creator || 'Kevin B. Liu',
        creatorUrl: spec?.authorship?.creatorUrl || 'https://github.com/Kevin-Liu-01',
        copyright: spec?.authorship?.copyright || 'Copyright © 2026 Kevin B. Liu',
        license: spec?.authorship?.license || 'LicenseRef-Claude-of-Tanks-Proprietary-Content-1.0',
        mode: 'first-party-procedural-only',
        createTankOptions: { proceduralOnly: true, quality: 'high', camoSeed: 4242 },
        externalGeometryLoaded: false,
        communitySpecsEligible: false,
      },
      tank: { id: tankId, name: spec?.name || tankId },
      pose: getPose(),
      camera: {
        position: vectorArray(camera.position),
        target: vectorArray(controls.target),
        fovDeg: roundNumber(camera.fov),
      },
      coordinateSystem: {
        handedness: 'right',
        axes: { x: 'vehicle right', y: 'up', z: 'forward' },
        units: 'metres',
      },
      annotations,
    };
  }

  function updateExport(): void {
    const output = $('#markupJson');
    if (output) output.value = JSON.stringify(exportRecord(), null, 2);
  }

  function selectionSummary(annotation: SurfaceAnnotation): string {
    return `${annotation.ownership} / ${annotation.mesh.name} · ${annotation.surface.faceIndices.length} tri`;
  }

  function renderAnnotationList(): void {
    const list = $('#markupSelectionList');
    $('#markupSelectionCount').textContent = String(annotations.length);
    list.replaceChildren();
    if (!annotations.length) {
      const empty = document.createElement('p');
      empty.className = 'markup-hint';
      empty.textContent = 'No marked surfaces yet.';
      list.append(empty);
      return;
    }

    for (const annotation of annotations) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `markup-selection${annotation.id === selectedAnnotationId ? ' active' : ''}`;
      const marker = document.createElement('i');
      marker.style.background = OPERATION_CSS[annotation.operation];
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = `${annotation.operation.toUpperCase()} · ${annotation.id}`;
      const summary = document.createElement('small');
      summary.textContent = selectionSummary(annotation);
      copy.append(title, summary);
      const remove = document.createElement('span');
      remove.className = 'markup-remove';
      remove.textContent = '×';
      remove.title = 'Delete selection';
      row.append(marker, copy, remove);
      row.addEventListener('click', (event) => {
        if (event.target instanceof Element && event.target.closest('.markup-remove')) {
          deleteAnnotation(annotation.id);
          return;
        }
        selectedAnnotationId = annotation.id;
        $('#markupNote').value = annotation.note || '';
        renderAnnotationList();
      });
      list.append(row);
    }
  }

  function deleteAnnotation(id: string): void {
    const index = annotations.findIndex((annotation) => annotation.id === id);
    if (index < 0) return;
    removeOverlay(annotations[index]._runtime.overlay);
    annotations.splice(index, 1);
    selectedAnnotationId = annotations.at(-1)?.id || null;
    renderAnnotationList();
    updateExport();
  }

  function clearAnnotations(): void {
    annotations.forEach((annotation) => removeOverlay(annotation._runtime.overlay));
    annotations = [];
    selectedAnnotationId = null;
    renderAnnotationList();
    updateExport();
  }

  function setOperation(nextOperation: string | undefined, announce = false): void {
    operation = MARKUP_OPERATIONS.includes(nextOperation as MarkupOperation)
      ? nextOperation as MarkupOperation : 'inspect';
    operationButtons.forEach((button) => {
      const isActive = button.dataset.markupOperation === operation;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    $('#markupReshapeFields').hidden = operation !== 'reshape';
    $('#markupAddFields').hidden = operation !== 'add';
    clearHover();
    if (announce) showToast(`Markup operation: ${operation}`);
  }

  function selectScreen(clientX: number, clientY: number, additive = false) {
    const hit = rayHit(clientX, clientY);
    if (!hit) return null;
    if (operation === 'inspect') {
      showToast(`${ownershipOf(hit.object)} · ${hit.object.name || hit.object.type} · face ${hit.faceIndex}`);
      return hit;
    }
    if (!additive) clearAnnotations();
    const angle = THREE.MathUtils.clamp(Number($('#markupPatchAngle').value) || 14, 1, 45);
    const faces = $('#markupScope').value === 'patch'
      ? coplanarPatch(hit.object.geometry, hit.faceIndex, angle)
      : [hit.faceIndex];
    const annotation = recordFromHit(hit, faces);
    annotations.push(annotation);
    selectedAnnotationId = annotation.id;
    renderAnnotationList();
    updateExport();
    showToast(`${operation.toUpperCase()} marked ${faces.length} triangle${faces.length === 1 ? '' : 's'}`);
    return annotation;
  }

  function hoverScreen(clientX: number, clientY: number) {
    if (!active) return null;
    const hit = rayHit(clientX, clientY);
    clearHover();
    if (!hit) return null;
    hoverOverlay = addOverlay(hit.object, [hit.faceIndex], hit.instanceId, operation, true);
    const info = {
      ownership: ownershipOf(hit.object),
      mesh: hit.object.name || hit.object.type,
      faceIndex: hit.faceIndex,
      instanceId: typeof hit.instanceId === 'number' && Number.isInteger(hit.instanceId)
        ? hit.instanceId
        : null,
      point: vectorArray(hit.point),
    };
    onHover(info);
    return info;
  }

  function focusSelected(): void {
    const annotation = annotations.find((item) => item.id === selectedAnnotationId);
    if (!annotation) {
      showToast('Select a marked surface first');
      return;
    }
    const box = new THREE.Box3().setFromObject(annotation._runtime.overlay);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const distance = Math.max(1.4, Math.max(size.x, size.y, size.z) * 4.5);
    const direction = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, distance);
    controls.update();
    updateExport();
  }

  function attachTank(nextTankRoot: THREE.Object3D, nextTankId: string): void {
    clearHover();
    clearAnnotations();
    tankRoot = nextTankRoot;
    tankId = nextTankId;
    annotationSequence = 1;
    makePickTargets();
    updateExport();
  }

  function detachTank(): void {
    clearHover();
    clearAnnotations();
    tankRoot = null;
    tankId = null;
    pickTargets = [];
    updateExport();
  }

  function setActive(nextActive: boolean): void {
    active = !!nextActive;
    annotations.forEach((annotation) => {
      annotation._runtime.overlay.visible = active;
    });
    if (active) makePickTargets();
    else clearHover();
    $('#markupWorkbench').hidden = !active;
  }

  function updatePose(): void {
    updateExport();
  }

  operationButtons.forEach((button) => button.addEventListener('click', () =>
    setOperation(button.dataset.markupOperation, true)));
  $('#markupNote').addEventListener('input', () => {
    const annotation = annotations.find((item) => item.id === selectedAnnotationId);
    if (!annotation) return;
    annotation.note = $('#markupNote').value.trim();
    updateExport();
  });
  for (const selector of [
    '#markupOffsetX', '#markupOffsetY', '#markupOffsetZ', '#markupPrimitive',
    '#markupSizeW', '#markupSizeH', '#markupSizeD',
  ]) {
    $(selector).addEventListener('input', () => {
      const annotation = annotations.find((item) => item.id === selectedAnnotationId);
      if (!annotation || annotation.operation !== operation) return;
      annotation.request = operationRequest();
      updateExport();
    });
  }
  $('#markupUndo').addEventListener('click', () => {
    const latest = annotations.at(-1);
    if (latest) deleteAnnotation(latest.id);
  });
  $('#markupClear').addEventListener('click', clearAnnotations);
  $('#markupFocus').addEventListener('click', focusSelected);
  $('#markupCopy').addEventListener('click', async () => {
    updateExport();
    try {
      await navigator.clipboard.writeText($('#markupJson').value);
    } catch {
      $('#markupJson').select();
      document.execCommand('copy');
    }
    showToast('Surface markup JSON copied');
  });
  $('#markupDownload').addEventListener('click', () => {
    updateExport();
    downloadBlob(
      new Blob([$('#markupJson').value], { type: 'application/json' }),
      `${tankId}-surface-markup-${timestampSlug()}.json`,
    );
  });
  $('#markupSavePng').addEventListener('click', () => {
    renderFrame();
    renderer.domElement.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${tankId}-surface-markup-${timestampSlug()}.png`);
    }, 'image/png');
  });

  setOperation('remove');
  renderAnnotationList();
  setActive(false);

  return {
    attachTank,
    detachTank,
    setActive,
    setOperation,
    selectScreen,
    hoverScreen,
    clearHover,
    clearAnnotations,
    deleteSelected() {
      if (selectedAnnotationId) deleteAnnotation(selectedAnnotationId);
    },
    undo() {
      const latest = annotations.at(-1);
      if (latest) deleteAnnotation(latest.id);
    },
    updatePose,
    exportRecord,
    get active() { return active; },
    get operation() { return operation; },
    getState: () => ({
      active,
      operation,
      tankId,
      selectableMeshes: pickTargets.length,
      visibleAnnotations: annotations.filter((annotation) => annotation._runtime.overlay.visible).length,
      annotations: exportRecord().annotations,
    }),
  };
}
