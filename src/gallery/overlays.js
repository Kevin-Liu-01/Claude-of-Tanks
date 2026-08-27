import * as THREE from 'three';
import {
  addInternalCrewModel,
  addInternalDrivetrainModel,
  addInternalModuleModel,
} from '../vehicles/internalAnatomyVisuals.js';

const MODULE_COLORS = Object.freeze({
  engine: 0xf0a23a, fuelTank: 0xe76f51, ammoRack: 0xff4d5f,
  missileRack: 0xff6b45, autoloader: 0xff738e, feedSystem: 0xffa75c,
  turretRing: 0xb38cff, gunMount: 0xc2a5ff, radio: 0x78a9ff,
  optics: 0x5ee1d2, gun: 0xe9cf63, transmission: 0xd58a35,
});

const CREW_COLORS = Object.freeze({
  driver: 0x63d6ff, gunner: 0xffd166, commander: 0xb9f18c, loader: 0xff8fab,
  radioOperator: 0x9eb7ff, assistantDriver: 0x80d8d0, assistantLoader: 0xffa8c6,
  weaponOperatorLeft: 0xd8a4ff, weaponOperatorRight: 0xc28cff,
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
  const vertices = (plate.verts || []).filter((point) => Array.isArray(point) && point.length >= 3);
  if (vertices.length < 3) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    vertices.flatMap((point) => point.slice(0, 3)), 3,
  ));
  const indices = [];
  for (let index = 1; index < vertices.length - 1; index += 1) indices.push(0, index, index + 1);
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
    color, transparent: true, opacity, depthWrite: false, depthTest: true,
    side: THREE.DoubleSide, toneMapped: false, polygonOffset: true,
    polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}

function lineMaterial(color, opacity = 0.92) {
  return new THREE.LineBasicMaterial({
    color, transparent: true, opacity, depthTest: false, toneMapped: false,
  });
}

function dashedMaterial(color) {
  const material = new THREE.LineDashedMaterial({
    color, transparent: true, opacity: 0.92, dashSize: 0.075, gapSize: 0.04,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
  material.userData.galleryAnatomyLine = true;
  material.userData.galleryBaseOpacity = material.opacity;
  return material;
}

function anatomyFillMaterial(color) {
  const material = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.07, depthTest: false, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  material.userData.galleryAnatomyFill = true;
  material.userData.galleryBaseOpacity = material.opacity;
  return material;
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

function addDashedLines(model, color, resources) {
  const material = dashedMaterial(color);
  resources.push(material);
  const meshes = [];
  model.traverse((object) => {
    if (object.isMesh) meshes.push(object);
  });
  const instanceMatrix = new THREE.Matrix4();
  for (const mesh of meshes) {
    mesh.renderOrder = 84;
    const edges = new THREE.EdgesGeometry(mesh.geometry, 8);
    resources.push(edges);
    if (mesh.isInstancedMesh) {
      for (let index = 0; index < mesh.count; index += 1) {
        mesh.getMatrixAt(index, instanceMatrix);
        const lines = new THREE.LineSegments(edges, material);
        lines.matrix.copy(instanceMatrix);
        lines.matrixAutoUpdate = false;
        lines.renderOrder = 85;
        lines.raycast = () => {};
        lines.computeLineDistances();
        mesh.parent.add(lines);
      }
      continue;
    }
    const lines = new THREE.LineSegments(edges, material);
    lines.position.copy(mesh.position);
    lines.quaternion.copy(mesh.quaternion);
    lines.scale.copy(mesh.scale);
    lines.renderOrder = 85;
    lines.raycast = () => {};
    lines.computeLineDistances();
    mesh.parent.add(lines);
  }
  model.userData.galleryDashedAnatomy = true;
}

function volumeSize(volume) {
  return new THREE.Vector3(
    volume.max[0] - volume.min[0],
    volume.max[1] - volume.min[1],
    volume.max[2] - volume.min[2],
  );
}

function addVolumePicker(model, volume, index, mode, resources, pickables, partIndex = 0, partCount = 1) {
  const size = volumeSize(volume);
  if (size.x <= 0 || size.y <= 0 || size.z <= 0) return;
  const key = String(mode === 'modules' ? volume.module : volume.crew || 'volume');
  const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
  const material = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, colorWrite: false,
    depthWrite: false, depthTest: false,
  });
  const picker = new THREE.Mesh(geometry, material);
  picker.name = `gallery_${mode}_${key}_${index}_${partIndex}`;
  picker.userData.inspection = {
    mode,
    id: `${mode === 'modules' ? 'M' : 'C'}${String(index + 1).padStart(2, '0')}`
      + (partCount > 1 ? `.${partIndex + 1}` : ''),
    title: key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' '),
    owner: volume.turretLocal ? 'Turret-local model' : 'Hull-local model',
    dimensionsM: size.toArray().map((value) => Number(value.toFixed(2))),
    visualForm: volume.visualForm || 'kill-cam anatomy model',
    station: volume.station || volume.layoutPlacement || null,
    evidence: volume.layoutConfidence || null,
    sourceIds: volume.layoutSources || [],
  };
  picker.userData.inspectionVisual = model;
  model.add(picker);
  pickables.push(picker);
  resources.push(geometry, material);
}

function specCaliberMm(spec) {
  return Number(spec?.gun?.shells?.[0]?.caliberMm || spec?.gun?.caliberMm || 0);
}

function addModuleModels(spec, hullContainer, turretContainer, resources, pickables) {
  const modules = spec.armor?.modules || [];
  const caliberMm = specCaliberMm(spec);
  modules.forEach((volume, index) => {
    const parts = Array.isArray(volume.parts) && volume.parts.length ? volume.parts : [volume];
    parts.forEach((part, partIndex) => {
      const resolved = part === volume ? volume : { ...volume, min: part.min, max: part.max };
      const color = MODULE_COLORS[volume.module] || 0x78a9ff;
      const fill = anatomyFillMaterial(color);
      resources.push(fill);
      const model = addInternalModuleModel(
        resolved, fill, hullContainer, turretContainer, resources,
        spec.era, caliberMm, fill,
      );
      if (!model) return;
      addDashedLines(model, color, resources);
      addVolumePicker(model, resolved, index, 'modules', resources, pickables, partIndex, parts.length);
    });
  });
  const drivetrainColor = 0x98a6ad;
  const drivetrainFill = anatomyFillMaterial(drivetrainColor);
  resources.push(drivetrainFill);
  const drivetrain = addInternalDrivetrainModel(
    spec.armor || {}, hullContainer, resources, drivetrainFill,
  );
  if (drivetrain) addDashedLines(drivetrain, drivetrainColor, resources);
}

function addCrewModels(spec, hullContainer, turretContainer, resources, pickables) {
  const crew = spec.armor?.crew || [];
  crew.forEach((volume, index) => {
    const color = CREW_COLORS[volume.crew] || 0x68c7ff;
    const fill = anatomyFillMaterial(color);
    resources.push(fill);
    const model = addInternalCrewModel(
      volume, fill, hullContainer, turretContainer, resources, spec.armor,
    );
    addDashedLines(model, color, resources);
    addVolumePicker(model, volume, index, 'crew', resources, pickables);
  });
}

function setAnatomyEmphasis(picker, emphasized) {
  const model = picker?.userData?.inspectionVisual;
  if (!model) return false;
  model.traverse((object) => {
    const material = object.material;
    if (material?.userData?.galleryAnatomyLine) {
      material.opacity = emphasized ? 1 : material.userData.galleryBaseOpacity;
    } else if (material?.userData?.galleryAnatomyFill) {
      material.opacity = emphasized ? 0.18 : material.userData.galleryBaseOpacity;
    }
  });
  return true;
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
    hullPlates.filter((plate) => (plate.kind || 'main') !== 'main'
      || /_(?:cupola|hatch)_/i.test(plate.name || '')).forEach((plate, index) =>
      addPlate(hullContainer, plate, exactHull.length + index, false, resources, pickables));
    turretPlates.filter((plate) => (plate.kind || 'main') !== 'main'
      || /_(?:cupola|hatch)_/i.test(plate.name || '')).forEach((plate, index) =>
      addPlate(turretContainer, plate, exactTurret.length + index, true, resources, pickables));
  } else if (mode === 'modules') {
    addModuleModels(spec, hullContainer, turretContainer, resources, pickables);
  } else if (mode === 'crew') {
    addCrewModels(spec, hullContainer, turretContainer, resources, pickables);
  }

  let emphasized = null;
  return {
    mode,
    count: pickables.length,
    pickables,
    emphasize(object) {
      if (emphasized) {
        if (!setAnatomyEmphasis(emphasized, false) && emphasized.material) {
          emphasized.material.opacity = emphasized.userData.galleryBaseOpacity || 0.38;
        }
      }
      emphasized = object || null;
      if (emphasized) {
        if (!setAnatomyEmphasis(emphasized, true) && emphasized.material) {
          emphasized.userData.galleryBaseOpacity ||= emphasized.material.opacity;
          emphasized.material.opacity = Math.min(0.74, emphasized.material.opacity + 0.28);
        }
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
    ['< 80 mm', '#e96959'], ['80–179 mm', '#f39a45'],
    ['180–349 mm', '#f2cf5b'], ['350–649 mm', '#a8d85d'],
    ['650+ mm', '#50d890'], ['ERA', '#c18cff'],
  ];
  if (mode === 'modules') return [
    ['Ammunition', '#ff4d5f'], ['Fuel', '#e76f51'], ['Engine', '#f0a23a'],
    ['Optics', '#5ee1d2'], ['Other', '#78a9ff'],
  ];
  if (mode === 'crew') return [
    ['Driver', '#63d6ff'], ['Gunner', '#ffd166'],
    ['Commander', '#b9f18c'], ['Loader', '#ff8fab'], ['Specialist', '#9eb7ff'],
  ];
  return [];
}
