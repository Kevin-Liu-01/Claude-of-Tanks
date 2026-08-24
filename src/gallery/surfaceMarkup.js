import * as THREE from 'three';

export const MARKUP_OPERATIONS = Object.freeze(['inspect', 'remove', 'reshape', 'add']);

const OPERATION_COLORS = Object.freeze({
  inspect: 0x65a9ff,
  remove: 0xff5a5f,
  reshape: 0xffb347,
  add: 0x43d6b5,
});

const OPERATION_CSS = Object.freeze({
  inspect: '#65a9ff',
  remove: '#ff5a5f',
  reshape: '#ffb347',
  add: '#43d6b5',
});

const adjacencyCache = new WeakMap();

export function effectiveVisible(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

export function ownershipOf(object) {
  for (let node = object; node; node = node.parent) {
    if (node.name === 'rig_recoil') return 'recoil';
    if (node.name === 'rig_gun') return 'gun';
    if (node.name === 'rig_turret') return 'turret';
    if (node.name === 'rig_hull') return 'hull';
  }
  return 'root';
}

export function faceCount(geometry) {
  return geometry.index
    ? Math.floor(geometry.index.count / 3)
    : Math.floor(geometry.attributes.position.count / 3);
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

function quantizedVertexKey(position, index) {
  const scale = 100000;
  return `${Math.round(position.getX(index) * scale)},${Math.round(position.getY(index) * scale)},${Math.round(position.getZ(index) * scale)}`;
}

function geometryAdjacency(geometry) {
  if (adjacencyCache.has(geometry)) return adjacencyCache.get(geometry);
  const count = faceCount(geometry);
  if (count > 180000) return null;
  const position = geometry.attributes.position;
  const neighbors = Array.from({ length: count }, () => []);
  const normals = Array.from({ length: count });
  const edges = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

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
    for (const face of list) {
      for (const other of list) {
        if (face !== other && !neighbors[face].includes(other)) neighbors[face].push(other);
      }
    }
  }

  const result = { neighbors, normals };
  adjacencyCache.set(geometry, result);
  return result;
}

export function coplanarPatch(geometry, seedFace, angleDeg = 14) {
  const adjacency = geometryAdjacency(geometry);
  if (!adjacency) return [seedFace];
  const threshold = Math.cos(THREE.MathUtils.degToRad(THREE.MathUtils.clamp(angleDeg, 1, 45)));
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

function instanceMatrixFor(object, instanceId) {
  const matrix = new THREE.Matrix4();
  if (object.isInstancedMesh && Number.isInteger(instanceId)) object.getMatrixAt(instanceId, matrix);
  return matrix;
}

function objectLocalFaceVertices(object, faceIndex, instanceId) {
  const matrix = instanceMatrixFor(object, instanceId);
  return baseFaceVertices(object.geometry, faceIndex).map((vertex) => vertex.applyMatrix4(matrix));
}

function highlightGeometry(object, faceIndices, instanceId, lift = 0.006) {
  const positions = [];
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

function roundNumber(value) {
  return Number(value.toFixed(5));
}

function vectorArray(vector) {
  return [roundNumber(vector.x), roundNumber(vector.y), roundNumber(vector.z)];
}

function boxRecord(box) {
  return { min: vectorArray(box.min), max: vectorArray(box.max) };
}

function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function downloadBlob(blob, filename) {
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
}) {
  const $ = (selector) => root.querySelector(selector);
  const operationButtons = [...root.querySelectorAll('[data-markup-operation]')];
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const materials = new Map();
  let tankRoot = null;
  let tankId = null;
  let pickTargets = [];
  let annotations = [];
  let selectedAnnotationId = null;
  let annotationSequence = 1;
  let operation = 'remove';
  let hoverOverlay = null;
  let active = false;

  function operationMaterial(nextOperation, hover = false) {
    const key = `${nextOperation}:${hover}`;
    if (materials.has(key)) return materials.get(key);
    const material = new THREE.MeshBasicMaterial({
      color: OPERATION_COLORS[nextOperation] || OPERATION_COLORS.inspect,
      transparent: true,
      opacity: hover ? 0.34 : 0.53,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    materials.set(key, material);
    return material;
  }

  function addOverlay(object, faceIndices, instanceId, nextOperation, hover = false) {
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

  function removeOverlay(mesh) {
    if (!mesh) return;
    mesh.removeFromParent();
    mesh.geometry?.dispose();
  }

  function clearHover() {
    removeOverlay(hoverOverlay);
    hoverOverlay = null;
    onHover(null);
  }

  function rigPath(object) {
    const path = [];
    for (let node = object; node; node = node.parent) {
      path.unshift({ name: node.name || node.type, uuid: node.uuid });
      if (node === tankRoot) break;
    }
    return path;
  }

  function materialNames(object) {
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    return objectMaterials.filter(Boolean).map((material) => material.name || `material-${material.id}`);
  }

  function makePickTargets() {
    pickTargets = [];
    if (!tankRoot) return;
    tankRoot.updateMatrixWorld(true);
    tankRoot.traverse((object) => {
      if (!(object.isMesh || object.isInstancedMesh) || !object.geometry) return;
      if (!effectiveVisible(object) || object.userData.gallerySurfaceMarkup) return;
      if (object.name.startsWith('gallery_') || /shadow/i.test(object.name || '')) return;
      pickTargets.push(object);
    });
  }

  function rayHit(clientX, clientY) {
    if (!active || !pickTargets.length) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.setFromCamera(ndc, camera);
    return raycaster.intersectObjects(pickTargets, false).find((hit) =>
      hit.faceIndex !== undefined && hit.object.geometry && effectiveVisible(hit.object)) || null;
  }

  function operationRequest() {
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
        representativeTriangleLocal: representativeLocal.map(vectorArray),
        representativeTriangleWorld: representativeWorld.map(vectorArray),
      },
      request: operationRequest(),
    };
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

  function updateExport() {
    const output = $('#markupJson');
    if (output) output.value = JSON.stringify(exportRecord(), null, 2);
  }

  function selectionSummary(annotation) {
    return `${annotation.ownership} / ${annotation.mesh.name} · ${annotation.surface.faceIndices.length} tri`;
  }

  function renderAnnotationList() {
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
        if (event.target.closest('.markup-remove')) {
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

  function setOperation(nextOperation, announce = false) {
    operation = MARKUP_OPERATIONS.includes(nextOperation) ? nextOperation : 'inspect';
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

  function selectScreen(clientX, clientY, additive = false) {
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

  function hoverScreen(clientX, clientY) {
    if (!active) return null;
    const hit = rayHit(clientX, clientY);
    clearHover();
    if (!hit) return null;
    hoverOverlay = addOverlay(hit.object, [hit.faceIndex], hit.instanceId, operation, true);
    const info = {
      ownership: ownershipOf(hit.object),
      mesh: hit.object.name || hit.object.type,
      faceIndex: hit.faceIndex,
      instanceId: Number.isInteger(hit.instanceId) ? hit.instanceId : null,
      point: vectorArray(hit.point),
    };
    onHover(info);
    return info;
  }

  function focusSelected() {
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

  function attachTank(nextTankRoot, nextTankId) {
    clearHover();
    clearAnnotations();
    tankRoot = nextTankRoot;
    tankId = nextTankId;
    annotationSequence = 1;
    makePickTargets();
    updateExport();
  }

  function detachTank() {
    clearHover();
    clearAnnotations();
    tankRoot = null;
    tankId = null;
    pickTargets = [];
    updateExport();
  }

  function setActive(nextActive) {
    active = !!nextActive;
    annotations.forEach((annotation) => {
      annotation._runtime.overlay.visible = active;
    });
    if (active) makePickTargets();
    else clearHover();
    $('#markupWorkbench').hidden = !active;
  }

  function updatePose() {
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
    if (annotations.length) deleteAnnotation(annotations.at(-1).id);
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
      if (annotations.length) deleteAnnotation(annotations.at(-1).id);
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
