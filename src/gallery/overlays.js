import * as THREE from 'three';

const MODULE_COLORS = Object.freeze({
  engine: 0xf0a23a,
  fuelTank: 0xe76f51,
  ammoRack: 0xff4d5f,
  turretRing: 0xb38cff,
  radio: 0x78a9ff,
  optics: 0x5ee1d2,
  gun: 0xe9cf63,
  trackL: 0x98a6ad,
  trackR: 0x98a6ad,
});

const CREW_COLORS = Object.freeze({
  driver: 0x63d6ff,
  gunner: 0xffd166,
  commander: 0xb9f18c,
  loader: 0xff8fab,
});

function armorColor(plate) {
  if (plate.kind === 'era' || plate.era) return 0xc18cff;
  if (plate.kind === 'spaced') return 0x4fc7d9;
  if (plate.kind === 'external') return 0x8b9aa4;
  const ke = Number(plate.keMm ?? plate.physicalMm ?? 0);
  if (ke >= 650) return 0x50d890;
  if (ke >= 350) return 0xa8d85d;
  if (ke >= 180) return 0xf2cf5b;
  if (ke >= 80) return 0xf39a45;
  return 0xe96959;
}

function plateGeometry(plate) {
  const verts = (plate.verts || []).filter((point) => Array.isArray(point) && point.length >= 3);
  if (verts.length < 3) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts.flatMap((point) => point.slice(0, 3)), 3));
  const indices = [];
  for (let index = 1; index < verts.length - 1; index += 1) indices.push(0, index, index + 1);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function collisionPlateGeometry(cells) {
  const byPlate = new Map();
  for (const cell of cells || []) {
    for (const face of cell.faces || []) {
      if (face.internal || !face.plate) continue;
      let positions = byPlate.get(face.plate);
      if (!positions) {
        positions = [];
        byPlate.set(face.plate, positions);
      }
      for (const index of face.indices || []) {
        const point = cell.vertices?.[index];
        if (point) positions.push(point[0], point[1], point[2]);
      }
    }
  }
  const geometries = [];
  for (const [plate, positions] of byPlate) {
    if (positions.length < 9 || positions.length % 9 !== 0) continue;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    geometries.push({ plate, geometry });
  }
  return geometries;
}

function inspectionMaterial(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function lineMaterial(color, opacity = 0.92) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false, toneMapped: false });
}

function attachContainer(owner, name) {
  const container = new THREE.Group();
  container.name = name;
  container.renderOrder = 80;
  owner.add(container);
  return container;
}

function addPlate(container, plate, index, turretLocal, resources, pickables, sourceGeometry = null) {
  const geometry = sourceGeometry || plateGeometry(plate);
  if (!geometry) return;
  const color = armorColor(plate);
  const material = inspectionMaterial(color, 0.38);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `gallery_armor_${turretLocal ? 'turret' : 'hull'}_${index}`;
  mesh.renderOrder = 81;
  mesh.userData.inspection = {
    mode: 'armor',
    id: `${turretLocal ? 'T' : 'H'}${String(index + 1).padStart(2, '0')}`,
    title: String(plate.name || 'Armor plate').replaceAll('_', ' '),
    kind: String(plate.kind || 'main'),
    physicalMm: Number(plate.physicalMm || 0),
    keMm: Number(plate.keMm ?? plate.physicalMm ?? 0),
    ceMm: Number(plate.ceMm ?? plate.physicalMm ?? 0),
    owner: turretLocal ? 'Turret' : 'Hull',
  };
  container.add(mesh);
  pickables.push(mesh);
  resources.push(geometry, material);

  const edgeGeometry = new THREE.EdgesGeometry(geometry, 12);
  const edgeMaterial = lineMaterial(color);
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.renderOrder = 82;
  edges.raycast = () => {};
  container.add(edges);
  resources.push(edgeGeometry, edgeMaterial);
}

const _up = new THREE.Vector3(0, 1, 0);
const _axis = new THREE.Vector3();
const _center = new THREE.Vector3();

function shapeGeometry(shape) {
  if (shape.kind === 'ellipsoid') {
    return {
      geometry: new THREE.SphereGeometry(1, 20, 12),
      position: _center.fromArray(shape.center),
      scale: new THREE.Vector3().fromArray(shape.radii),
      quaternion: new THREE.Quaternion(),
    };
  }
  if (shape.kind === 'capsule') {
    const a = new THREE.Vector3().fromArray(shape.a);
    const b = new THREE.Vector3().fromArray(shape.b);
    const length = a.distanceTo(b);
    return {
      geometry: new THREE.CapsuleGeometry(shape.radius, length, 6, 14),
      position: a.add(b).multiplyScalar(0.5),
      scale: new THREE.Vector3(1, 1, 1),
      quaternion: new THREE.Quaternion().setFromUnitVectors(
        _up, _axis.subVectors(b, a).normalize(),
      ),
    };
  }
  if (shape.kind === 'ellipticCylinder') {
    const direction = _axis.set(0, 0, 0).setComponent(shape.axis, 1);
    return {
      geometry: new THREE.CylinderGeometry(1, 1, 2, 20, 1, false),
      position: _center.fromArray(shape.center),
      scale: new THREE.Vector3(shape.radii[0], shape.halfLength, shape.radii[1]),
      quaternion: new THREE.Quaternion().setFromUnitVectors(_up, direction),
    };
  }
  return null;
}

function addVolume(container, volume, shape, index, mode, resources, pickables, partIndex = 0, partCount = 1) {
  const min = new THREE.Vector3().fromArray(volume.min || [0, 0, 0]);
  const max = new THREE.Vector3().fromArray(volume.max || [0, 0, 0]);
  const size = max.clone().sub(min);
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return;
  const built = shapeGeometry(shape);
  if (!built) return;
  const key = String(mode === 'modules' ? volume.module : volume.crew || 'volume');
  const color = (mode === 'modules' ? MODULE_COLORS[key] : CREW_COLORS[key]) || 0x68c7ff;
  const { geometry } = built;
  const material = inspectionMaterial(color, 0.24);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(built.position);
  mesh.quaternion.copy(built.quaternion);
  mesh.scale.copy(built.scale);
  mesh.name = `gallery_${mode}_${key}_${index}_${partIndex}`;
  mesh.renderOrder = 84;
  mesh.userData.inspection = {
    mode,
    id: `${mode === 'modules' ? 'M' : 'C'}${String(index + 1).padStart(2, '0')}`
      + (partCount > 1 ? `.${partIndex + 1}` : ''),
    title: key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' '),
    owner: volume.turretLocal ? 'Turret-local volume' : 'Hull-local volume',
    dimensionsM: size.toArray().map((value) => Number(value.toFixed(2))),
  };
  container.add(mesh);
  pickables.push(mesh);
  resources.push(geometry, material);

  const edgeGeometry = new THREE.EdgesGeometry(geometry);
  const edgeMaterial = lineMaterial(color, 0.95);
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.position.copy(built.position);
  edges.quaternion.copy(built.quaternion);
  edges.scale.copy(built.scale);
  edges.renderOrder = 85;
  edges.raycast = () => {};
  container.add(edges);
  resources.push(edgeGeometry, edgeMaterial);
}

export function createInspectionOverlay(spec, visual, mode) {
  const resources = [];
  const pickables = [];
  const containers = [];
  if (!visual?.root || mode === 'appearance') {
    return { mode, count: 0, pickables, clear() {} };
  }

  const root = visual.root;
  const turret = root.getObjectByName('rig_turret') || root;
  const hullContainer = attachContainer(root, `gallery_${mode}_hull`);
  const turretContainer = attachContainer(turret, `gallery_${mode}_turret`);
  containers.push(hullContainer, turretContainer);

  if (mode === 'armor') {
    const hullPlates = spec.armor?.hullPlates || [];
    const turretPlates = spec.armor?.turretPlates || [];
    const exactHull = collisionPlateGeometry(spec.armor?.collisionShells?.hull);
    const exactTurret = collisionPlateGeometry(spec.armor?.collisionShells?.turret);
    exactHull.forEach(({ plate, geometry }, index) =>
      addPlate(hullContainer, plate, index, false, resources, pickables, geometry));
    exactTurret.forEach(({ plate, geometry }, index) =>
      addPlate(turretContainer, plate, index, true, resources, pickables, geometry));
    // Closed cells replace broad main plates. Non-main screens/ERA and the
    // small authored hatch/cupola structures remain separate combat layers.
    hullPlates.filter((plate) => (plate.kind || 'main') !== 'main'
      || /_(?:cupola|hatch)_/i.test(plate.name || '')).forEach((plate, index) =>
      addPlate(hullContainer, plate, exactHull.length + index, false, resources, pickables));
    turretPlates.filter((plate) => (plate.kind || 'main') !== 'main'
      || /_(?:cupola|hatch)_/i.test(plate.name || '')).forEach((plate, index) =>
      addPlate(turretContainer, plate, exactTurret.length + index, true, resources, pickables));
  } else {
    const source = mode === 'modules' ? spec.armor?.modules : spec.armor?.crew;
    (source || []).forEach((volume, index) => {
      const shapes = Array.isArray(volume.shapes) && volume.shapes.length ? volume.shapes : [];
      shapes.forEach((shape, partIndex) => addVolume(
        volume.turretLocal ? turretContainer : hullContainer,
        volume,
        shape,
        index,
        mode,
        resources,
        pickables,
        partIndex,
        shapes.length,
      ));
    });
  }

  let emphasized = null;
  return {
    mode,
    count: pickables.length,
    pickables,
    emphasize(object) {
      if (emphasized?.material) emphasized.material.opacity = emphasized.userData.galleryBaseOpacity || 0.38;
      emphasized = object || null;
      if (emphasized?.material) {
        emphasized.userData.galleryBaseOpacity ||= emphasized.material.opacity;
        emphasized.material.opacity = Math.min(0.74, emphasized.material.opacity + 0.28);
      }
    },
    clear() {
      containers.forEach((container) => container.removeFromParent());
      resources.forEach((resource) => resource.dispose?.());
      resources.length = 0;
      pickables.length = 0;
      emphasized = null;
    },
  };
}

export function inspectionLegend(mode) {
  if (mode === 'armor') return [
    ['< 80 mm', '#e96959'],
    ['80–179 mm', '#f39a45'],
    ['180–349 mm', '#f2cf5b'],
    ['350–649 mm', '#a8d85d'],
    ['650+ mm', '#50d890'],
    ['ERA', '#c18cff'],
  ];
  if (mode === 'modules') return [
    ['Ammunition', '#ff4d5f'],
    ['Fuel', '#e76f51'],
    ['Engine', '#f0a23a'],
    ['Optics', '#5ee1d2'],
    ['Other', '#78a9ff'],
  ];
  if (mode === 'crew') return [
    ['Driver', '#63d6ff'],
    ['Gunner', '#ffd166'],
    ['Commander', '#b9f18c'],
    ['Loader', '#ff8fab'],
  ];
  return [];
}
