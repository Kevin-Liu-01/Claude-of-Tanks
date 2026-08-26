import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MODULE_COLORS = Object.freeze({
  engine: 0xf0a23a,
  fuelTank: 0xe76f51,
  ammoRack: 0xff4d5f,
  missileRack: 0xff6b45,
  autoloader: 0xff738e,
  feedSystem: 0xffa75c,
  turretRing: 0xb38cff,
  gunMount: 0xc2a5ff,
  radio: 0x78a9ff,
  optics: 0x5ee1d2,
  gun: 0xe9cf63,
  transmission: 0xd58a35,
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

function shapeBounds(shape) {
  if (shape.kind === 'ellipsoid') {
    const center = new THREE.Vector3().fromArray(shape.center);
    const half = new THREE.Vector3().fromArray(shape.radii);
    return { center, size: half.multiplyScalar(2) };
  }
  if (shape.kind === 'capsule') {
    const a = new THREE.Vector3().fromArray(shape.a);
    const b = new THREE.Vector3().fromArray(shape.b);
    const radius = Math.max(0.001, Number(shape.radius) || 0.001);
    const min = a.clone().min(b).addScalar(-radius);
    const max = a.clone().max(b).addScalar(radius);
    return { center: min.clone().add(max).multiplyScalar(0.5), size: max.sub(min) };
  }
  if (shape.kind === 'ellipticCylinder') {
    const half = new THREE.Vector3();
    const radialAxes = [0, 1, 2].filter((axis) => axis !== shape.axis);
    half.setComponent(shape.axis, shape.halfLength);
    half.setComponent(radialAxes[0], shape.radii[0]);
    half.setComponent(radialAxes[1], shape.radii[1]);
    return {
      center: new THREE.Vector3().fromArray(shape.center),
      size: half.multiplyScalar(2),
    };
  }
  return null;
}

function transformPart(geometry, position = [0, 0, 0], rotation = [0, 0, 0]) {
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1),
  );
  geometry.applyMatrix4(matrix);
  return geometry;
}

function boxPart(size, position = [0, 0, 0]) {
  return transformPart(new THREE.BoxGeometry(...size), position);
}

function cylinderPart(radius, length, axis = 'y', position = [0, 0, 0], radialSegments = 12) {
  const rotation = axis === 'x' ? [0, 0, Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return transformPart(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1, false),
    position,
    rotation,
  );
}

function conePart(radius, length, axis = 'y', position = [0, 0, 0]) {
  const rotation = axis === 'x' ? [0, 0, -Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return transformPart(new THREE.ConeGeometry(radius, length, 12), position, rotation);
}

function torusPart(radius, tube, axis = 'z', position = [0, 0, 0]) {
  const rotation = axis === 'x' ? [0, Math.PI / 2, 0] : axis === 'y' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return transformPart(new THREE.TorusGeometry(radius, tube, 8, 20), position, rotation);
}

function mergeModuleParts(parts, module) {
  const geometry = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!geometry) return null;
  geometry.type = 'GalleryModuleGeometry';
  geometry.name = `gallery_module_form_${module}`;
  geometry.userData.moduleForm = module;
  return geometry;
}

// Semantic diagnostic forms are normalized into the authoritative shape's
// axis-aligned bounds. They make the overlay readable without changing the
// smooth ellipsoid/capsule/cylinder data used by combat intersection tests.
function moduleFormGeometry(module) {
  const parts = [];
  if (module === 'engine') {
    parts.push(boxPart([0.76, 0.48, 0.70], [0, -0.10, 0]));
    parts.push(boxPart([0.27, 0.22, 0.58], [-0.20, 0.25, 0]));
    parts.push(boxPart([0.27, 0.22, 0.58], [0.20, 0.25, 0]));
    parts.push(cylinderPart(0.21, 0.10, 'z', [0, -0.06, -0.40], 16));
  } else if (module === 'fuelTank') {
    parts.push(boxPart([0.72, 0.64, 0.78]));
    parts.push(boxPart([0.80, 0.08, 0.11], [0, 0.25, -0.22]));
    parts.push(boxPart([0.80, 0.08, 0.11], [0, 0.25, 0.22]));
    parts.push(cylinderPart(0.07, 0.12, 'y', [0.22, 0.38, 0.18], 10));
  } else if (module === 'ammoRack') {
    parts.push(boxPart([0.82, 0.11, 0.82], [0, -0.42, 0]));
    for (const x of [-0.27, 0, 0.27]) {
      parts.push(cylinderPart(0.065, 0.58, 'z', [x, -0.08, -0.04], 10));
      parts.push(conePart(0.075, 0.16, 'z', [x, -0.08, 0.33]));
    }
  } else if (module === 'missileRack') {
    parts.push(boxPart([0.78, 0.12, 0.74], [0, -0.41, -0.03]));
    for (const x of [-0.21, 0.21]) for (const y of [-0.20, 0.20]) {
      parts.push(cylinderPart(0.095, 0.66, 'z', [x, y, -0.06], 12));
      parts.push(conePart(0.10, 0.16, 'z', [x, y, 0.35]));
    }
  } else if (module === 'autoloader') {
    parts.push(torusPart(0.31, 0.075, 'y', [0, -0.06, 0]));
    parts.push(cylinderPart(0.16, 0.24, 'y', [0, -0.06, 0], 16));
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      parts.push(cylinderPart(0.045, 0.34, 'z', [Math.cos(angle) * 0.30, 0.14, Math.sin(angle) * 0.20], 8));
    }
  } else if (module === 'feedSystem') {
    parts.push(boxPart([0.76, 0.58, 0.34], [0, -0.08, -0.21]));
    for (const x of [-0.27, -0.09, 0.09, 0.27]) {
      parts.push(cylinderPart(0.055, 0.50, 'z', [x, 0.15, 0.15], 8));
    }
  } else if (module === 'transmission') {
    parts.push(boxPart([0.72, 0.50, 0.62], [0, -0.08, 0]));
    parts.push(cylinderPart(0.18, 0.80, 'x', [0, 0.23, -0.12], 16));
    parts.push(cylinderPart(0.13, 0.80, 'x', [0, 0.20, 0.23], 14));
  } else if (module === 'radio') {
    parts.push(boxPart([0.76, 0.66, 0.64]));
    for (const y of [-0.22, 0, 0.22]) parts.push(boxPart([0.62, 0.055, 0.08], [0, y, 0.36]));
    parts.push(cylinderPart(0.06, 0.08, 'z', [0.26, 0.26, 0.38], 10));
  } else if (module === 'optics') {
    parts.push(boxPart([0.60, 0.54, 0.54], [0, -0.06, -0.10]));
    parts.push(cylinderPart(0.19, 0.30, 'z', [0, 0.05, 0.28], 16));
    parts.push(boxPart([0.44, 0.13, 0.08], [0, 0.30, 0.18]));
  } else if (module === 'gun') {
    parts.push(boxPart([0.62, 0.58, 0.50], [0, 0, -0.23]));
    parts.push(cylinderPart(0.13, 0.70, 'z', [0, 0, 0.15], 16));
    parts.push(cylinderPart(0.19, 0.16, 'z', [0, 0, 0.39], 16));
  } else if (module === 'gunMount' || module === 'turretRing') {
    parts.push(torusPart(0.34, 0.09, 'y'));
    parts.push(cylinderPart(0.22, 0.20, 'y', [0, 0, 0], 18));
  } else if (module === 'trackL' || module === 'trackR') {
    parts.push(boxPart([0.62, 0.64, 0.88]));
    for (const z of [-0.38, -0.23, -0.08, 0.08, 0.23, 0.38]) {
      parts.push(boxPart([0.76, 0.08, 0.07], [0, 0.34, z]));
    }
  } else {
    parts.push(boxPart([0.76, 0.66, 0.76]));
    parts.push(boxPart([0.52, 0.10, 0.82], [0, 0.30, 0]));
  }
  return mergeModuleParts(parts, module);
}

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

function moduleGeometry(module, shape) {
  const bounds = shapeBounds(shape);
  if (!bounds) return null;
  const geometry = moduleFormGeometry(module);
  if (!geometry) return null;
  return {
    geometry,
    position: bounds.center,
    scale: bounds.size,
    quaternion: new THREE.Quaternion(),
  };
}

function addVolume(container, volume, shape, index, mode, resources, pickables, partIndex = 0, partCount = 1) {
  const min = new THREE.Vector3().fromArray(volume.min || [0, 0, 0]);
  const max = new THREE.Vector3().fromArray(volume.max || [0, 0, 0]);
  const size = max.clone().sub(min);
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return;
  const key = String(mode === 'modules' ? volume.module : volume.crew || 'volume');
  const built = mode === 'modules' ? moduleGeometry(key, shape) : shapeGeometry(shape);
  if (!built) return;
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
    visualForm: mode === 'modules' ? key : shape.kind,
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
