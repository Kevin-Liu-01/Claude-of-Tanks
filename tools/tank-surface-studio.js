import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTank } from '/src/vehicles/tankFactory.js';
import { ALL_TANK_IDS, getSpec } from '/src/vehicles/specs.js';

// The full game roster also contains explicitly attributed community tanks.
// This authoring tool intentionally excludes those entries: its contract is
// that every selectable surface comes from our own procedural builders.
const FIRST_PARTY_TANK_IDS = ALL_TANK_IDS.filter((id) => !getSpec(id)?.community);

const $ = (selector) => document.querySelector(selector);
const viewport = $('#viewport');
const tankSelect = $('#tankSelect');
const jsonOutput = $('#jsonOutput');
const noteInput = $('#note');
const scopeInput = $('#scope');
const patchAngleInput = $('#patchAngle');
const modeButtons = [...document.querySelectorAll('[data-mode]')];

const OP_COLORS = {
  inspect: 0x65a9ff,
  remove: 0xff5a5f,
  reshape: 0xffb347,
  add: 0x43d6b5,
};
const OP_CSS = {
  inspect: '#65a9ff', remove: '#ff5a5f', reshape: '#ffb347', add: '#43d6b5',
};

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setClearColor(0x0b1014, 1);
viewport.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1014);
scene.fog = new THREE.Fog(0x0b1014, 28, 62);
const camera = new THREE.PerspectiveCamera(36, 1, 0.05, 300);
camera.position.set(-8, 5.2, 8);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 1.4;
controls.maxDistance = 70;
controls.target.set(0, 1.2, 0);
controls.update();

scene.add(new THREE.AmbientLight(0xe8edf0, 1.02));
scene.add(new THREE.HemisphereLight(0xd3dde4, 0x25291f, 1.50));
const keyLight = new THREE.DirectionalLight(0xfff2dc, 2.5);
keyLight.position.set(-12, 18, 14);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x8fb8d7, 1.0);
fillLight.position.set(12, 8, -10);
scene.add(fillLight);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(18, 96),
  new THREE.MeshStandardMaterial({ color: 0x141b20, roughness: 0.95, metalness: 0.04 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.015;
ground.userData.surfaceStudioIgnore = true;
scene.add(ground);
const grid = new THREE.GridHelper(30, 30, 0x4c4a3c, 0x242b30);
grid.position.y = 0.002;
grid.material.transparent = true;
grid.material.opacity = 0.42;
grid.userData.surfaceStudioIgnore = true;
scene.add(grid);

// The same amber inspection-ring language used by the garage turntable keeps
// this authoring page visibly inside the Claude of Tanks application rather
// than feeling like a disconnected Three.js utility.
for (const [inner, outer, opacity] of [[7.45, 7.49, 0.45], [8.15, 8.17, 0.18]]) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 128),
    new THREE.MeshBasicMaterial({ color: 0xee9b2d, transparent: true, opacity, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.006;
  ring.userData.surfaceStudioIgnore = true;
  scene.add(ring);
}

const engineCtx = { setupShadowMaterial: (material) => material, anisotropy: 1, renderer };
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const adjacencyCache = new WeakMap();

let visual = null;
let tankRoot = null;
let currentBox = new THREE.Box3();
let pickTargets = [];
let annotations = [];
let selectedAnnotationId = null;
let annotationSeq = 1;
let mode = 'remove';
let hoverOverlay = null;
let pointerStart = null;
let toastTimer = 0;

const sharedMaterials = new Map();
function operationMaterial(operation, hover = false) {
  const key = `${operation}:${hover}`;
  if (sharedMaterials.has(key)) return sharedMaterials.get(key);
  const material = new THREE.MeshBasicMaterial({
    color: OP_COLORS[operation] || OP_COLORS.inspect,
    transparent: true,
    opacity: hover ? 0.34 : 0.53,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  sharedMaterials.set(key, material);
  return material;
}

function effectiveVisible(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

function forceHeroLod(root) {
  root.traverse((object) => {
    if (!object.isLOD) return;
    object.autoUpdate = false;
    object.levels.forEach((level, index) => {
      if (level.object) level.object.visible = index === 0;
    });
  });
}

function visibleBox(root) {
  const box = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object.isMesh || object.isInstancedMesh) || !object.geometry) return;
    if (!effectiveVisible(object) || object.userData.surfaceStudioIgnore || /shadow/i.test(object.name || '')) return;
    if (object.isInstancedMesh) {
      if (!object.count) return;
      object.computeBoundingBox();
      if (object.boundingBox && !object.boundingBox.isEmpty()) {
        box.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
      return;
    }
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    box.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return box;
}

function materialNames(object) {
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  return materials.filter(Boolean).map((material) => material.name || `material-${material.id}`);
}

function rigPath(object) {
  const path = [];
  for (let node = object; node; node = node.parent) {
    if (node === scene) break;
    path.unshift({ name: node.name || node.type, uuid: node.uuid });
  }
  return path;
}

function ownershipOf(object) {
  for (let node = object; node; node = node.parent) {
    if (node.name === 'rig_recoil') return 'recoil';
    if (node.name === 'rig_gun') return 'gun';
    if (node.name === 'rig_turret') return 'turret';
    if (node.name === 'rig_hull') return 'hull';
  }
  return 'root';
}

function faceCount(geometry) {
  return geometry.index ? Math.floor(geometry.index.count / 3) : Math.floor(geometry.attributes.position.count / 3);
}

function faceVertexIndices(geometry, faceIndex) {
  const base = faceIndex * 3;
  if (geometry.index) {
    return [geometry.index.getX(base), geometry.index.getX(base + 1), geometry.index.getX(base + 2)];
  }
  return [base, base + 1, base + 2];
}

function baseFaceVertices(geometry, faceIndex) {
  const position = geometry.attributes.position;
  return faceVertexIndices(geometry, faceIndex).map((index) =>
    new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index)));
}

function instanceMatrixFor(object, instanceId) {
  const matrix = new THREE.Matrix4();
  if (object.isInstancedMesh && Number.isInteger(instanceId)) object.getMatrixAt(instanceId, matrix);
  return matrix;
}

function objectLocalFaceVertices(object, faceIndex, instanceId) {
  const matrix = instanceMatrixFor(object, instanceId);
  return baseFaceVertices(object.geometry, faceIndex).map((vertex) => vertex.applyMatrix4(matrix));
}

function quantizedVertexKey(position, index) {
  const q = 100000;
  return `${Math.round(position.getX(index) * q)},${Math.round(position.getY(index) * q)},${Math.round(position.getZ(index) * q)}`;
}

function geometryAdjacency(geometry) {
  if (adjacencyCache.has(geometry)) return adjacencyCache.get(geometry);
  const count = faceCount(geometry);
  if (count > 180000) return null;
  const position = geometry.attributes.position;
  const neighbors = Array.from({ length: count }, () => []);
  const normals = Array.from({ length: count });
  const edges = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let face = 0; face < count; face++) {
    const indices = faceVertexIndices(geometry, face);
    a.fromBufferAttribute(position, indices[0]);
    b.fromBufferAttribute(position, indices[1]);
    c.fromBufferAttribute(position, indices[2]);
    normals[face] = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
    const keys = indices.map((index) => quantizedVertexKey(position, index));
    for (const [i0, i1] of [[0, 1], [1, 2], [2, 0]]) {
      const edge = keys[i0] < keys[i1] ? `${keys[i0]}|${keys[i1]}` : `${keys[i1]}|${keys[i0]}`;
      const list = edges.get(edge) || [];
      list.push(face);
      edges.set(edge, list);
    }
  }
  for (const list of edges.values()) {
    if (list.length < 2) continue;
    for (const face of list) for (const other of list) {
      if (face !== other && !neighbors[face].includes(other)) neighbors[face].push(other);
    }
  }
  const result = { neighbors, normals };
  adjacencyCache.set(geometry, result);
  return result;
}

function coplanarPatch(geometry, seedFace, angleDeg) {
  const adjacency = geometryAdjacency(geometry);
  if (!adjacency) return [seedFace];
  const threshold = Math.cos(THREE.MathUtils.degToRad(angleDeg));
  const seedNormal = adjacency.normals[seedFace];
  const seen = new Set([seedFace]);
  const queue = [seedFace];
  while (queue.length && seen.size < 3000) {
    const face = queue.shift();
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

function highlightGeometry(object, faceIndices, instanceId, lift = 0.006) {
  const positions = [];
  for (const faceIndex of faceIndices) {
    const vertices = objectLocalFaceVertices(object, faceIndex, instanceId);
    const normal = new THREE.Vector3().crossVectors(
      vertices[1].clone().sub(vertices[0]), vertices[2].clone().sub(vertices[0]),
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

function addOverlay(object, faceIndices, instanceId, operation, hover = false) {
  const overlay = new THREE.Mesh(
    highlightGeometry(object, faceIndices, instanceId, hover ? 0.009 : 0.007),
    operationMaterial(operation, hover),
  );
  overlay.name = hover ? 'surfaceStudioHover' : 'surfaceStudioSelection';
  overlay.userData.surfaceStudioIgnore = true;
  overlay.renderOrder = hover ? 900 : 800;
  object.add(overlay);
  return overlay;
}

function removeOverlay(overlay) {
  if (!overlay) return;
  if (overlay.parent) overlay.parent.remove(overlay);
  if (overlay.geometry) overlay.geometry.dispose();
}

function clearHover() {
  removeOverlay(hoverOverlay);
  hoverOverlay = null;
}

function makePickTargets() {
  pickTargets = [];
  tankRoot.updateMatrixWorld(true);
  tankRoot.traverse((object) => {
    if (!(object.isMesh || object.isInstancedMesh) || !object.geometry) return;
    if (!effectiveVisible(object) || object.userData.surfaceStudioIgnore || /shadow/i.test(object.name || '')) return;
    pickTargets.push(object);
  });
}

function rayHit(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  return raycaster.intersectObjects(pickTargets, false).find((hit) =>
    hit.faceIndex !== undefined && hit.object.geometry && effectiveVisible(hit.object));
}

function roundNumber(value) { return Number(value.toFixed(5)); }
function vectorArray(vector) { return [roundNumber(vector.x), roundNumber(vector.y), roundNumber(vector.z)]; }
function boxRecord(box) { return { min: vectorArray(box.min), max: vectorArray(box.max) }; }

function poseRecord() {
  return {
    hullYawDeg: Number($('#hullYaw').value),
    turretYawDeg: Number($('#turretYaw').value),
    gunPitchDeg: Number($('#gunPitch').value),
  };
}

function operationRequest() {
  if (mode === 'reshape') {
    return {
      offsetM: [Number($('#offsetX').value), Number($('#offsetY').value), Number($('#offsetZ').value)],
    };
  }
  if (mode === 'add') {
    return {
      primitive: $('#primitive').value,
      dimensionsM: [Number($('#sizeW').value), Number($('#sizeH').value), Number($('#sizeD').value)],
    };
  }
  return null;
}

function recordFromHit(hit, faceIndices) {
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
    for (const localObjectVertex of objectLocalFaceVertices(object, faceIndex, instanceId)) {
      const baseLocal = localObjectVertex.clone().applyMatrix4(instanceMatrix.clone().invert());
      const world = localObjectVertex.clone().applyMatrix4(object.matrixWorld);
      localBounds.expandByPoint(baseLocal);
      worldBounds.expandByPoint(world);
      centroidLocal.add(baseLocal);
      vertexSamples++;
    }
  }
  centroidLocal.multiplyScalar(1 / Math.max(1, vertexSamples));
  const representativeBase = baseFaceVertices(object.geometry, hit.faceIndex);
  const representativeWorld = representativeBase.map((vertex) => vertex.clone().applyMatrix4(combinedWorld));
  const worldNormal = hit.face.normal.clone().applyMatrix3(new THREE.Matrix3().getNormalMatrix(combinedWorld)).normalize();
  const geometry = object.geometry;
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const annotation = {
    id: `surface-${annotationSeq++}`,
    operation: mode,
    scope: scopeInput.value,
    note: noteInput.value.trim(),
    ownership: ownershipOf(object),
    rigPath: rigPath(object),
    poseAtSelection: poseRecord(),
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
      geometryBoundsLocal: boxRecord(geometry.boundingBox),
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
      representativeTriangleLocal: representativeBase.map(vectorArray),
      representativeTriangleWorld: representativeWorld.map(vectorArray),
    },
    request: operationRequest(),
  };
  const overlay = addOverlay(object, faceIndices, instanceId, mode);
  Object.defineProperty(annotation, '_runtime', { value: { object, overlay }, enumerable: false });
  return annotation;
}

function deleteAnnotation(id) {
  const index = annotations.findIndex((annotation) => annotation.id === id);
  if (index < 0) return;
  removeOverlay(annotations[index]._runtime.overlay);
  annotations.splice(index, 1);
  selectedAnnotationId = annotations.at(-1)?.id || null;
  renderAnnotationList();
  updateExport();
}

function clearAnnotations() {
  annotations.forEach((annotation) => removeOverlay(annotation._runtime.overlay));
  annotations = [];
  selectedAnnotationId = null;
  renderAnnotationList();
  updateExport();
}

function selectHit(hit, additive = false) {
  if (!hit) return;
  if (mode === 'inspect') {
    const owner = ownershipOf(hit.object);
    showToast(`${owner} · ${hit.object.name || hit.object.type} · face ${hit.faceIndex}`);
    return;
  }
  if (!additive) clearAnnotations();
  const angle = THREE.MathUtils.clamp(Number(patchAngleInput.value) || 14, 1, 45);
  const faces = scopeInput.value === 'patch'
    ? coplanarPatch(hit.object.geometry, hit.faceIndex, angle)
    : [hit.faceIndex];
  const annotation = recordFromHit(hit, faces);
  annotations.push(annotation);
  selectedAnnotationId = annotation.id;
  renderAnnotationList();
  updateExport();
  showToast(`${mode.toUpperCase()} marked ${faces.length} triangle${faces.length === 1 ? '' : 's'}`);
}

function selectionSummary(annotation) {
  return `${annotation.ownership} / ${annotation.mesh.name} · ${annotation.surface.faceIndices.length} tri`;
}

function renderAnnotationList() {
  const list = $('#selectionList');
  $('#selectionCount').textContent = String(annotations.length);
  list.innerHTML = '';
  if (!annotations.length) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'No marked surfaces yet.';
    list.appendChild(empty);
    return;
  }
  for (const annotation of annotations) {
    const row = document.createElement('button');
    row.className = `annotation${annotation.id === selectedAnnotationId ? ' active' : ''}`;
    row.type = 'button';
    row.innerHTML = `<span class="annotation-dot" style="background:${OP_CSS[annotation.operation]}"></span><span><strong>${annotation.operation.toUpperCase()} · ${annotation.id}</strong><small>${selectionSummary(annotation)}</small></span><span class="remove-one" title="Delete">×</span>`;
    row.addEventListener('click', (event) => {
      if (event.target.closest('.remove-one')) { deleteAnnotation(annotation.id); return; }
      selectedAnnotationId = annotation.id;
      noteInput.value = annotation.note || '';
      renderAnnotationList();
    });
    list.appendChild(row);
  }
}

function exportRecord() {
  const spec = getSpec(tankSelect.value);
  return {
    schemaVersion: 1,
    tool: 'tank-surface-markup-studio',
    generatedAt: new Date().toISOString(),
    authorship: {
      mode: 'first-party-procedural-only',
      createTankOptions: { proceduralOnly: true, quality: 'high', camoSeed: 4242 },
      externalGeometryLoaded: false,
      communitySpecsEligible: false,
    },
    tank: { id: tankSelect.value, name: spec.name || tankSelect.value },
    pose: poseRecord(),
    camera: {
      position: vectorArray(camera.position),
      target: vectorArray(controls.target),
      fovDeg: roundNumber(camera.fov),
    },
    coordinateSystem: { handedness: 'right', axes: { x: 'vehicle right', y: 'up', z: 'forward' }, units: 'metres' },
    annotations,
  };
}

function updateExport() {
  jsonOutput.value = JSON.stringify(exportRecord(), null, 2);
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function disposeTank() {
  clearHover();
  clearAnnotations();
  if (visual) visual.dispose();
  visual = null;
  tankRoot = null;
  pickTargets = [];
}

function loadTank(id) {
  if (!FIRST_PARTY_TANK_IDS.includes(id)) id = FIRST_PARTY_TANK_IDS[0];
  disposeTank();
  visual = createTank(id, engineCtx, {
    camoSeed: 4242,
    quality: 'high',
    proceduralOnly: true,
  });
  tankRoot = visual.root;
  scene.add(tankRoot);
  forceHeroLod(tankRoot);
  tankRoot.updateMatrixWorld(true);
  currentBox = visibleBox(tankRoot);
  makePickTargets();
  tankSelect.value = id;
  $('#hullYaw').value = '0';
  $('#turretYaw').value = '0';
  $('#gunPitch').value = '0';
  updatePoseOutputs();
  const spec = getSpec(id);
  $('#tankTitle').textContent = `${spec.name || id} · ${id}`;
  $('#ownershipStatus').textContent = `${pickTargets.length} selectable meshes · proceduralOnly`;
  history.replaceState(null, '', `${location.pathname}?id=${encodeURIComponent(id)}`);
  frameView('hero');
  updateExport();
}

function updatePoseOutputs() {
  if (!tankRoot) return;
  const hullYaw = Number($('#hullYaw').value);
  const turretYaw = Number($('#turretYaw').value);
  const gunPitch = Number($('#gunPitch').value);
  tankRoot.rotation.y = THREE.MathUtils.degToRad(hullYaw);
  const turret = tankRoot.getObjectByName('rig_turret');
  const gun = tankRoot.getObjectByName('rig_gun');
  if (turret) turret.rotation.y = THREE.MathUtils.degToRad(turretYaw);
  if (gun) gun.rotation.x = -THREE.MathUtils.degToRad(gunPitch);
  tankRoot.updateMatrixWorld(true);
  $('#hullYawOut').textContent = `${hullYaw}°`;
  $('#turretYawOut').textContent = `${turretYaw}°`;
  $('#gunPitchOut').textContent = `${gunPitch}°`;
  updateExport();
}

const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0.08, 1),
  left: new THREE.Vector3(-1, 0.06, 0),
  right: new THREE.Vector3(1, 0.06, 0),
  rear: new THREE.Vector3(0, 0.08, -1),
  top: new THREE.Vector3(0, 1, 0.015),
  hero: new THREE.Vector3(-1, 0.46, 1),
  'elevated-left': new THREE.Vector3(-1, 0.60, 0.20),
  'elevated-right': new THREE.Vector3(1, 0.60, 0.20),
};

function frameView(name) {
  if (!tankRoot) return;
  currentBox = visibleBox(tankRoot);
  const center = currentBox.getCenter(new THREE.Vector3());
  const size = currentBox.getSize(new THREE.Vector3());
  const direction = (VIEW_DIRECTIONS[name] || VIEW_DIRECTIONS.hero).clone().normalize();
  const radius = Math.max(size.x, size.y * 1.25, size.z) * 0.58;
  // A conventional sphere-fit leaves long-gunned vehicles tiny because the
  // barrel dominates their depth. The tighter authoring fit intentionally
  // fills the viewport so individual armor plates remain clickable.
  const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5)) * 0.72;
  camera.up.set(0, 1, 0);
  if (name === 'top') camera.up.set(0, 0, -1);
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.target.copy(center);
  controls.update();
  updateExport();
}

function setMode(nextMode) {
  mode = nextMode;
  modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === mode));
  $('#reshapeFields').classList.toggle('hidden', mode !== 'reshape');
  $('#addFields').classList.toggle('hidden', mode !== 'add');
  clearHover();
}

function focusSelected() {
  const annotation = annotations.find((item) => item.id === selectedAnnotationId);
  if (!annotation) { showToast('Select a marked surface first'); return; }
  const box = new THREE.Box3().setFromObject(annotation._runtime.overlay);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const distance = Math.max(1.4, Math.max(size.x, size.y, size.z) * 4.5);
  const direction = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.update();
}

function downloadBlob(blob, filename) {
  const anchor = document.createElement('a');
  anchor.href = URL.createObjectURL(blob);
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(anchor.href), 500);
}

function timestampSlug() { return new Date().toISOString().replace(/[:.]/g, '-'); }

function populateTankList() {
  const rows = FIRST_PARTY_TANK_IDS.map((id) => {
    const spec = getSpec(id);
    return { id, name: spec.name || id };
  }).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  for (const row of rows) {
    const option = document.createElement('option');
    option.value = row.id;
    option.textContent = `${row.name} — ${row.id}`;
    tankSelect.appendChild(option);
  }
}

function resize() {
  const rect = viewport.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(viewport);

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.button !== 0) { pointerStart = null; return; }
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (moved > 5) return;
  selectHit(rayHit(event.clientX, event.clientY), event.shiftKey);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.buttons) return;
  const hit = rayHit(event.clientX, event.clientY);
  clearHover();
  if (!hit) {
    $('#meshStatus').textContent = 'Hover a surface to inspect ownership.';
    return;
  }
  hoverOverlay = addOverlay(hit.object, [hit.faceIndex], hit.instanceId, mode, true);
  const point = vectorArray(hit.point).join(', ');
  $('#meshStatus').textContent = `${ownershipOf(hit.object)} · ${hit.object.name || hit.object.type} · face ${hit.faceIndex}${Number.isInteger(hit.instanceId) ? ` · instance ${hit.instanceId}` : ''} · [${point}]`;
});
renderer.domElement.addEventListener('pointerleave', clearHover);

tankSelect.addEventListener('change', () => loadTank(tankSelect.value));
for (const button of modeButtons) button.addEventListener('click', () => setMode(button.dataset.mode));
for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => frameView(button.dataset.view));
for (const id of ['hullYaw', 'turretYaw', 'gunPitch']) $(`#${id}`).addEventListener('input', updatePoseOutputs);

noteInput.addEventListener('input', () => {
  const annotation = annotations.find((item) => item.id === selectedAnnotationId);
  if (!annotation) return;
  annotation.note = noteInput.value.trim();
  updateExport();
});
for (const id of ['offsetX', 'offsetY', 'offsetZ', 'primitive', 'sizeW', 'sizeH', 'sizeD']) {
  $(`#${id}`).addEventListener('input', () => {
    const annotation = annotations.find((item) => item.id === selectedAnnotationId);
    if (!annotation || annotation.operation !== mode) return;
    annotation.request = operationRequest();
    updateExport();
  });
}

$('#undo').addEventListener('click', () => {
  if (annotations.length) deleteAnnotation(annotations.at(-1).id);
});
$('#clear').addEventListener('click', clearAnnotations);
$('#focus').addEventListener('click', focusSelected);
$('#copyJson').addEventListener('click', async () => {
  updateExport();
  try {
    await navigator.clipboard.writeText(jsonOutput.value);
  } catch {
    jsonOutput.select();
    document.execCommand('copy');
  }
  showToast('Markup JSON copied');
});
$('#downloadJson').addEventListener('click', () => {
  updateExport();
  downloadBlob(new Blob([jsonOutput.value], { type: 'application/json' }),
    `${tankSelect.value}-surface-markup-${timestampSlug()}.json`);
});
$('#savePng').addEventListener('click', () => {
  renderer.render(scene, camera);
  renderer.domElement.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${tankSelect.value}-surface-markup-${timestampSlug()}.png`);
  }, 'image/png');
});

window.addEventListener('keydown', (event) => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
  const keyModes = { Digit1: 'inspect', Digit2: 'remove', Digit3: 'reshape', Digit4: 'add' };
  if (keyModes[event.code]) setMode(keyModes[event.code]);
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ') {
    event.preventDefault();
    if (annotations.length) deleteAnnotation(annotations.at(-1).id);
  }
  if (event.code === 'Delete' && selectedAnnotationId) deleteAnnotation(selectedAnnotationId);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

populateTankList();
resize();
setMode('remove');
const initialId = new URLSearchParams(location.search).get('id');
loadTank(FIRST_PARTY_TANK_IDS.includes(initialId)
  ? initialId
  : (FIRST_PARTY_TANK_IDS.includes('t90') ? 't90' : FIRST_PARTY_TANK_IDS[0]));
animate();

window.__SURFACE_STUDIO = {
  ready: true,
  loadTank,
  setMode,
  frameView,
  exportJSON: () => exportRecord(),
  selectScreen: (x, y, additive = false) => selectHit(rayHit(x, y), additive),
  getState: () => ({ tankId: tankSelect.value, mode, annotations: exportRecord().annotations }),
};
