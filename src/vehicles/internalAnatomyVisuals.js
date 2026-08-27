import * as THREE from 'three';
import { isPostwarVehicleEra } from './taxonomy.js';

export const CREW_STANDING_HEIGHT_M = 5 * 0.3048;
export const CREW_ARMOR_CLEARANCE_M = 0.035;

// Hull stations (drivers and turretless fighting compartments) are materially
// lower than turret baskets. Keep one real body scale, but use the reclined
// posture real low-roof stations require instead of letting the shins pass
// through the belly plate.
const HULL_CREW_RECLINE_RAD = Math.PI * 0.35;
const HULL_CREW_SHIN_RAD = Math.PI * 0.42;
const TURRET_CREW_SHIN_RAD = Math.PI * 0.08;

// One real-world body scale for every vehicle. Combat crew volumes describe
// damage and station placement; they must never resize the person occupying
// that station. These proportions yield a 1.524 m standing reference and a
// roughly 1.08 m seated silhouette including the lowered shins.
const CANONICAL_CREW = Object.freeze({
  torsoHeight: CREW_STANDING_HEIGHT_M * 0.39,
  torsoRadius: CREW_STANDING_HEIGHT_M * 0.075,
  headRadius: CREW_STANDING_HEIGHT_M * 0.055,
  shoulderSpan: CREW_STANDING_HEIGHT_M * 0.25,
  limbRadius: CREW_STANDING_HEIGHT_M * 0.023,
  upperArmLength: CREW_STANDING_HEIGHT_M * 0.16,
  thighLength: CREW_STANDING_HEIGHT_M * 0.245,
  shinLength: CREW_STANDING_HEIGHT_M * 0.235,
});

/**
 * Structural owner-frame bounds for a crew station. Cupolas and hatches are
 * deliberately excluded: they can raise the fleet-wide AABB above the actual
 * fighting-compartment roof and make a seated figure appear through the
 * turret crown.
 */
export function crewArmorEnvelope(armor, turretLocal) {
  const plates = turretLocal ? armor?.turretPlates : armor?.hullPlates;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const plate of plates || []) {
    if ((plate.kind || 'main') !== 'main'
        || /_(?:cupola|hatch)_/i.test(plate.name || '')) continue;
    for (const point of plate.verts || []) {
      if (!Array.isArray(point) || point.length < 3) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        min[axis] = Math.min(min[axis], point[axis]);
        max[axis] = Math.max(max[axis], point[axis]);
      }
    }
  }
  return Number.isFinite(min[0]) ? { min, max } : null;
}

function structuralCrewPlates(armor, turretLocal) {
  const plates = turretLocal ? armor?.turretPlates : armor?.hullPlates;
  return (plates || []).filter((plate) => (plate.kind || 'main') === 'main'
    && !/_(?:cupola|hatch)_/i.test(plate.name || ''));
}

function triangleHeightAtXZ(a, b, c, x, z) {
  const denominator = (b[2] - c[2]) * (a[0] - c[0])
    + (c[0] - b[0]) * (a[2] - c[2]);
  if (Math.abs(denominator) < 1e-9) return null;
  const wa = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2]))
    / denominator;
  const wb = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2]))
    / denominator;
  const wc = 1 - wa - wb;
  if (wa < -1e-7 || wb < -1e-7 || wc < -1e-7) return null;
  return wa * a[1] + wb * b[1] + wc * c[1];
}

function armorRoofHeightAt(plates, x, z) {
  let roof = -Infinity;
  for (const plate of plates) {
    const vertices = plate.verts || [];
    for (let index = 1; index < vertices.length - 1; index += 1) {
      const height = triangleHeightAtXZ(vertices[0], vertices[index], vertices[index + 1], x, z);
      if (height !== null) roof = Math.max(roof, height);
    }
  }
  return Number.isFinite(roof) ? roof : null;
}

function localCrewRoofY(armor, turretLocal, anchor, crownBounds, fallback) {
  const plates = structuralCrewPlates(armor, turretLocal);
  const xs = [crownBounds.min.x, (crownBounds.min.x + crownBounds.max.x) / 2, crownBounds.max.x];
  const zs = [crownBounds.min.z, (crownBounds.min.z + crownBounds.max.z) / 2, crownBounds.max.z];
  let roof = Infinity;
  let samples = 0;
  for (const xOffset of xs) {
    for (const zOffset of zs) {
      const height = armorRoofHeightAt(plates, anchor.x + xOffset, anchor.z + zOffset);
      if (height === null) continue;
      roof = Math.min(roof, height);
      samples += 1;
    }
  }
  return samples ? roof : fallback;
}

/** Lowest exact hull-shell point, expressed in the requested owner frame. */
export function internalTankFloorY(armor, turretLocal = false) {
  let floor = Infinity;
  for (const cell of armor?.collisionShells?.hull || []) {
    if (Array.isArray(cell?.min) && Number.isFinite(cell.min[1])) {
      floor = Math.min(floor, cell.min[1]);
    }
  }
  if (!Number.isFinite(floor)) {
    floor = crewArmorEnvelope(armor, false)?.min?.[1] ?? 0;
  }
  return floor - (turretLocal ? Number(armor?.turretPivot?.[1] || 0) : 0);
}

function reseatCrewInsideArmor(group, poseBounds, crownBounds, armor, turretLocal) {
  const envelope = crewArmorEnvelope(armor, turretLocal);
  if (!envelope) return null;
  const original = group.position.clone();
  const poseMin = poseBounds.min.toArray();
  const poseMax = poseBounds.max.toArray();
  const poseSize = poseBounds.getSize(new THREE.Vector3()).toArray();

  // Preserve researched station coordinates when they already fit. Clamp X/Z
  // only when the structural envelope has enough room for the canonical body.
  for (const axis of [0, 2]) {
    const span = envelope.max[axis] - envelope.min[axis];
    if (span + 1e-9 < poseSize[axis] + CREW_ARMOR_CLEARANCE_M * 2) continue;
    const low = envelope.min[axis] - poseMin[axis] + CREW_ARMOR_CLEARANCE_M;
    const high = envelope.max[axis] - poseMax[axis] - CREW_ARMOR_CLEARANCE_M;
    group.position.setComponent(axis, THREE.MathUtils.clamp(
      group.position.getComponent(axis), low, high,
    ));
  }

  const roofY = localCrewRoofY(armor, turretLocal, group.position, crownBounds, envelope.max[1]);
  const roofLimit = roofY - crownBounds.max.y - CREW_ARMOR_CLEARANCE_M;
  const floorY = internalTankFloorY(armor, turretLocal);
  const floorLimit = floorY - poseMin[1] + CREW_ARMOR_CLEARANCE_M;
  const height = roofY - floorY;
  if (height + 1e-9 >= poseSize[1] + CREW_ARMOR_CLEARANCE_M * 2) {
    group.position.y = THREE.MathUtils.clamp(group.position.y, floorLimit, roofLimit);
  } else {
    // This is a fail-safe for malformed authoring data. The canonical hull
    // posture fits every measured fighting compartment; if a future spec does
    // not, preserve the belly boundary rather than silently drawing anatomy
    // through the tank floor.
    group.position.y = floorLimit;
  }

  return {
    envelope,
    roofY,
    floorY,
    original: original.toArray(),
    resolved: group.position.toArray(),
    adjustment: group.position.clone().sub(original).toArray(),
  };
}


function shapeBounds(shape) {
  if (shape?.kind === 'ellipsoid') {
    return {
      min: shape.center.map((value, axis) => value - shape.radii[axis]),
      max: shape.center.map((value, axis) => value + shape.radii[axis]),
    };
  }
  if (shape?.kind === 'capsule') {
    return {
      min: shape.a.map((value, axis) => Math.min(value, shape.b[axis]) - shape.radius),
      max: shape.a.map((value, axis) => Math.max(value, shape.b[axis]) + shape.radius),
    };
  }
  if (shape?.kind === 'ellipticCylinder') {
    let radialIndex = 0;
    const half = [0, 0, 0].map((_, axis) => {
      if (axis === shape.axis) return shape.halfLength;
      const radius = shape.radii[radialIndex];
      radialIndex += 1;
      return radius;
    });
    return {
      min: shape.center.map((value, axis) => value - half[axis]),
      max: shape.center.map((value, axis) => value + half[axis]),
    };
  }
  return null;
}

function preciseModuleVisualVolume(volume) {
  const internal = volume?.external !== true
    && !['trackL', 'trackR', 'gun', 'optics', 'turretRing', 'gunMount'].includes(volume?.module);
  if (!internal || !Array.isArray(volume?.shapes) || !volume.shapes.length) return volume;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const shape of volume.shapes) {
    const bounds = shapeBounds(shape);
    if (!bounds) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], bounds.min[axis]);
      max[axis] = Math.max(max[axis], bounds.max[axis]);
    }
  }
  return Number.isFinite(min[0]) ? { ...volume, min, max } : volume;
}

function localGeometryBounds(group) {
  group.updateMatrixWorld(true);
  const inverse = group.matrixWorld.clone().invert();
  const relative = new THREE.Matrix4();
  const bounds = new THREE.Box3();
  group.traverse((object) => {
    if (!object.isMesh || !object.geometry) return;
    if (object.isInstancedMesh) object.computeBoundingBox();
    else object.geometry.computeBoundingBox();
    const objectBounds = object.isInstancedMesh ? object.boundingBox : object.geometry.boundingBox;
    if (!objectBounds) return;
    relative.multiplyMatrices(inverse, object.matrixWorld);
    bounds.union(objectBounds.clone().applyMatrix4(relative));
  });
  return bounds;
}

/** Center an internal model on its canonical combat volume and owner rig. */
function proxyGroup(volume, hullGroup, turretGroup, kind) {
  const group = new THREE.Group();
  group.name = `internal_${kind}`;
  group.renderOrder = 12;
  group.position.set(
    (volume.min[0] + volume.max[0]) / 2,
    (volume.min[1] + volume.max[1]) / 2,
    (volume.min[2] + volume.max[2]) / 2,
  );
  (volume.turretLocal ? turretGroup : hullGroup).add(group);
  return group;
}

/**
 * Canonical recognizable module model used by both the kill cam and Gallery.
 * Geometry is sized from the combat volume, while era and caliber choose the
 * same ammo/fuel treatment in every presentation context.
 */
export function addInternalModuleModel(
  volume,
  material,
  hullGroup,
  turretGroup,
  disposables,
  era,
  caliberMm,
  steelMaterial = material,
  armor = null,
) {
  const kind = volume.module;
  const form = volume.visualForm || '';
  if (kind === 'trackL' || kind === 'trackR') return null;
  const authoredVolume = volume;
  volume = preciseModuleVisualVolume(volume);
  const modern = isPostwarVehicleEra(era);
  const caliberRadius = caliberMm > 0 ? (caliberMm / 2000) * 1.08 : 0;
  const sx = volume.max[0] - volume.min[0];
  const sy = volume.max[1] - volume.min[1];
  const sz = volume.max[2] - volume.min[2];
  const group = proxyGroup(volume, hullGroup, turretGroup, `module_${kind}`);
  group.userData.internalAnatomy = {
    type: 'module', key: kind, ...(form ? { form } : {}),
    visualAnchorPolicy: volume === authoredVolume ? 'authoredVolume' : 'preciseCombatShapes',
    visualBounds: { min: [...volume.min], max: [...volume.max] },
  };

  const put = (geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, nextMaterial = material) => {
    disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, nextMaterial);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    group.add(mesh);
    return mesh;
  };

  const rounds = (radius, caseHeight, tipHeight, placements, tilt = 0) => {
    const caseGeometry = new THREE.CylinderGeometry(radius, radius, caseHeight, 8);
    const tipGeometry = new THREE.CylinderGeometry(radius * 0.18, radius * 0.94, tipHeight, 8);
    disposables.push(caseGeometry, tipGeometry);
    const cases = new THREE.InstancedMesh(caseGeometry, material, placements.length);
    const tips = new THREE.InstancedMesh(tipGeometry, material, placements.length);
    disposables.push(cases, tips);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const offset = new THREE.Vector3();
    placements.forEach((placement, index) => {
      quaternion.setFromEuler(new THREE.Euler(placement.rx || 0, placement.ry || 0, tilt));
      offset.set(0, (caseHeight + tipHeight) / 2, 0).applyQuaternion(quaternion);
      matrix.compose(position.set(placement.x, placement.y, placement.z), quaternion, scale);
      cases.setMatrixAt(index, matrix);
      matrix.compose(position.set(
        placement.x + offset.x,
        placement.y + offset.y,
        placement.z + offset.z,
      ), quaternion, scale);
      tips.setMatrixAt(index, matrix);
    });
    cases.instanceMatrix.needsUpdate = true;
    tips.instanceMatrix.needsUpdate = true;
    cases.computeBoundingSphere();
    tips.computeBoundingSphere();
    group.add(cases, tips);
  };

  if (kind === 'ammoRack' && /carousel|fixedGunMagazine/i.test(form)) {
    const ringRadius = Math.max(0.16, Math.min(sx, sz) * 0.34);
    const targetRadius = caliberRadius > 0 ? caliberRadius : 0.05;
    const count = Math.max(8, Math.min(22,
      Math.round((Math.PI * 2 * ringRadius) / Math.max(0.10, targetRadius * 2.65))));
    const radius = Math.min(targetRadius, ringRadius * 0.22);
    const caseHeight = sy * 0.5;
    const tipHeight = Math.min(sy * 0.2, radius * 5.5);
    const placements = [];
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2;
      placements.push({
        x: Math.cos(angle) * ringRadius,
        y: -sy / 2 + sy * 0.1 + caseHeight / 2,
        z: Math.sin(angle) * ringRadius,
      });
    }
    rounds(radius, caseHeight, tipHeight, placements);
    put(new THREE.CylinderGeometry(ringRadius * 1.28, ringRadius * 1.28, sy * 0.1, 20),
      0, -sy / 2 + sy * 0.05, 0);
    put(new THREE.TorusGeometry(ringRadius * 1.2, Math.min(sy * 0.07, 0.04), 8, 24),
      0, -sy / 2 + sy * 0.17, 0, Math.PI / 2, 0, 0, steelMaterial);
  } else if (kind === 'ammoRack' && /individualCanisters/i.test(form)) {
    const rows = Math.max(2, Math.min(5, Math.floor(sy / 0.18)));
    const columns = Math.max(2, Math.min(7, Math.floor(sx / 0.16)));
    const radius = Math.min(caliberRadius || 0.05, sx / columns * 0.3, sy / rows * 0.3);
    const length = sz * 0.72;
    const placements = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        placements.push({
          x: -sx / 2 + (column + 0.5) * sx / columns,
          y: -sy / 2 + (row + 0.5) * sy / rows,
          z: -length * 0.08,
          rx: Math.PI / 2,
        });
      }
    }
    rounds(radius, length * 0.72, Math.min(length * 0.18, radius * 5), placements);
    for (let row = 1; row < rows; row += 1) {
      put(new THREE.BoxGeometry(sx * 0.96, 0.025, sz * 0.9),
        0, -sy / 2 + row * sy / rows, 0, 0, 0, 0, steelMaterial);
    }
  } else if (kind === 'ammoRack' && (volume.turretLocal || /bustle|blowOff/i.test(form))) {
    const targetRadius = caliberRadius > 0 ? caliberRadius : 0.05;
    const nx = Math.max(2, Math.min(8, Math.floor(sx / Math.max(0.13, targetRadius * 2.7))));
    const ny = Math.max(1, Math.min(3, Math.floor(sy / Math.max(0.15, targetRadius * 3.1))));
    const radius = Math.min(targetRadius, (sx / nx) * 0.36, (sy / ny) * 0.36);
    const caseHeight = sz * 0.52;
    const tipHeight = Math.min(sz * 0.2, radius * 5.5);
    const placements = [];
    for (let ix = 0; ix < nx; ix += 1) {
      for (let iy = 0; iy < ny; iy += 1) {
        placements.push({
          x: -sx / 2 + (ix + 0.5) * (sx / nx),
          y: -sy / 2 + (iy + 0.5) * (sy / ny),
          z: -sz * 0.08,
          rx: Math.PI / 2,
        });
      }
    }
    rounds(radius, caseHeight, tipHeight, placements);
    for (let iy = 1; iy < ny; iy += 1) {
      put(new THREE.BoxGeometry(sx * 0.96, sy * 0.03, sz * 0.7),
        0, -sy / 2 + iy * (sy / ny), -sz * 0.08);
    }
    put(new THREE.BoxGeometry(sx * 0.96, sy * 0.94, 0.05), 0, 0, sz / 2 - 0.03);
    for (const side of [-1, 1]) {
      put(new THREE.BoxGeometry(0.03, sy * 0.9, sz * 0.7),
        side * (sx / 2 - 0.015), 0, -sz * 0.08, 0, 0, 0, steelMaterial);
    }
  } else if (kind === 'ammoRack') {
    const targetRadius = caliberRadius > 0 ? caliberRadius : 0.055;
    const nx = Math.max(2, Math.min(6, Math.floor(sx / Math.max(0.12, targetRadius * 3.0))));
    const nz = Math.max(2, Math.min(8, Math.floor(sz / Math.max(0.12, targetRadius * 3.0))));
    const radius = Math.min(targetRadius, (sx / nx) * 0.32, (sz / nz) * 0.32);
    const caseHeight = sy * 0.62;
    const tipHeight = Math.min(sy * 0.26, radius * 5.5);
    const placements = [];
    for (let ix = 0; ix < nx; ix += 1) {
      for (let iz = 0; iz < nz; iz += 1) {
        placements.push({
          x: -sx / 2 + (ix + 0.5) * (sx / nx),
          y: -sy / 2 + sy * 0.06 + caseHeight / 2,
          z: -sz / 2 + (iz + 0.5) * (sz / nz),
        });
      }
    }
    rounds(radius, caseHeight, tipHeight, placements);
    put(new THREE.BoxGeometry(sx * 0.98, sy * 0.08, sz * 0.98), 0, -sy / 2 + sy * 0.03, 0);
  } else if (kind === 'autoloader' && /carousel|basket/i.test(form)) {
    const radius = Math.max(0.15, Math.min(sx, sz) * 0.38);
    put(new THREE.CylinderGeometry(radius, radius * 0.92, sy * 0.18, 20),
      0, -sy * 0.36, 0);
    put(new THREE.TorusGeometry(radius * 0.82, Math.min(0.045, sy * 0.08), 8, 24),
      0, -sy * 0.18, 0, Math.PI / 2, 0, 0, steelMaterial);
    const armLength = Math.min(sz * 0.62, sy * 0.9);
    put(new THREE.BoxGeometry(sx * 0.12, sy * 0.12, armLength), 0, sy * 0.08, 0, 0, 0, 0, steelMaterial);
    put(new THREE.BoxGeometry(sx * 0.46, sy * 0.1, sz * 0.14), 0, sy * 0.28, sz * 0.2);
  } else if (kind === 'autoloader') {
    put(new THREE.BoxGeometry(sx * 0.9, sy * 0.82, sz * 0.82));
    const railY = sy * 0.22;
    for (const side of [-1, 1]) {
      put(new THREE.BoxGeometry(sx * 0.05, sy * 0.08, sz * 0.9),
        side * sx * 0.38, railY, 0, 0, 0, 0, steelMaterial);
    }
    put(new THREE.BoxGeometry(sx * 0.72, sy * 0.12, sz * 0.12), 0, railY, sz * 0.28, 0, 0, 0, steelMaterial);
  } else if (kind === 'feedSystem') {
    put(new THREE.BoxGeometry(sx * 0.72, sy * 0.62, sz * 0.6), 0, 0, -sz * 0.08);
    for (const side of [-1, 1]) {
      put(new THREE.TorusGeometry(Math.min(sx, sy) * 0.24, Math.min(sx, sy) * 0.06, 6, 16),
        side * sx * 0.22, sy * 0.08, sz * 0.2, Math.PI / 2, 0, 0, steelMaterial);
      put(new THREE.BoxGeometry(sx * 0.12, sy * 0.18, sz * 0.74),
        side * sx * 0.22, -sy * 0.08, 0, 0, 0, 0, steelMaterial);
    }
  } else if (kind === 'missileRack') {
    const count = Math.max(2, Math.min(6, Math.floor(sx / Math.max(0.12, sy * 0.32))));
    const radius = Math.min(sy, sx / count) * 0.28;
    for (let index = 0; index < count; index += 1) {
      const x = -sx / 2 + (index + 0.5) * sx / count;
      put(new THREE.CylinderGeometry(radius, radius, sz * 0.76, 10),
        x, 0, 0, Math.PI / 2, 0, 0);
      put(new THREE.ConeGeometry(radius * 0.88, sz * 0.14, 10),
        x, 0, sz * 0.45, Math.PI / 2, 0, 0, steelMaterial);
    }
  } else if (kind === 'fuelTank' && modern) {
    const count = sx > sy * 1.7 ? 2 : 1;
    const offsets = count === 2 ? [-0.22, 0.22] : [0];
    const radius = Math.max(0.07, Math.min(sy * 0.42, (sx / count) * 0.36, sz * 0.4));
    const cellLength = sz * 0.78;
    for (const offset of offsets) {
      const x = sx * offset;
      put(new THREE.CylinderGeometry(radius, radius, cellLength, 14),
        x, -sy * 0.03, 0, Math.PI / 2, 0, 0);
      put(new THREE.SphereGeometry(radius, 12, 8), x, -sy * 0.03, cellLength / 2);
      put(new THREE.SphereGeometry(radius, 12, 8), x, -sy * 0.03, -cellLength / 2);
      for (const zScale of [-0.24, 0.24]) {
        put(new THREE.TorusGeometry(radius * 1.04, radius * 0.11, 6, 18),
          x, -sy * 0.03, sz * zScale, 0, 0, 0, steelMaterial);
        put(new THREE.BoxGeometry(radius * 1.7, Math.max(0.04, sy * 0.5 - radius * 0.4), radius * 0.5),
          x, -sy * 0.03 - radius * 0.78, sz * zScale, 0, 0, 0, steelMaterial);
      }
    }
    const fittingRadius = Math.min(sx, sz) * 0.11;
    const fittingX = sx * offsets[offsets.length - 1];
    put(new THREE.CylinderGeometry(fittingRadius * 0.55, fittingRadius * 0.55, sy * 0.24, 8),
      fittingX, sy * 0.3, sz * 0.1, 0, 0, 0, steelMaterial);
    put(new THREE.CylinderGeometry(fittingRadius, fittingRadius, sy * 0.07, 10),
      fittingX, sy * 0.43, sz * 0.1, 0, 0, 0, steelMaterial);
    put(new THREE.CylinderGeometry(fittingRadius * 0.4, fittingRadius * 0.4, sz * 0.55, 6),
      -sx * 0.1, -sy * 0.34, 0, Math.PI / 2, 0, 0, steelMaterial);
  } else if (kind === 'engine' && /gasTurbine/i.test(form)) {
    const radius = Math.min(sx, sy) * 0.28;
    put(new THREE.CylinderGeometry(radius, radius * 0.88, sz * 0.78, 18),
      0, 0, 0, Math.PI / 2, 0, 0);
    for (let index = -2; index <= 2; index += 1) {
      put(new THREE.TorusGeometry(radius * (1 - Math.abs(index) * 0.035), radius * 0.08, 7, 20),
        0, 0, index * sz * 0.13, 0, 0, 0, steelMaterial);
    }
    put(new THREE.CylinderGeometry(radius * 0.58, radius * 0.58, sz * 0.18, 16),
      0, 0, sz * 0.42, Math.PI / 2, 0, 0, steelMaterial);
    for (const side of [-1, 1]) {
      put(new THREE.BoxGeometry(sx * 0.18, sy * 0.44, sz * 0.66),
        side * sx * 0.34, -sy * 0.1, 0, 0, 0, 0, steelMaterial);
    }
  } else if (kind === 'engine' && /twinFrontPowerpack/i.test(form)) {
    for (const side of [-1, 1]) {
      put(new THREE.BoxGeometry(sx * 0.4, sy * 0.54, sz * 0.72), side * sx * 0.24, -sy * 0.1, 0);
      put(new THREE.CylinderGeometry(sy * 0.12, sy * 0.12, sz * 0.62, 10),
        side * sx * 0.24, sy * 0.2, 0, Math.PI / 2, 0, 0, steelMaterial);
    }
    put(new THREE.BoxGeometry(sx * 0.9, sy * 0.12, sz * 0.18), 0, -sy * 0.38, sz * 0.28, 0, 0, 0, steelMaterial);
  } else if (kind === 'engine') {
    put(new THREE.BoxGeometry(sx * 0.84, sy * 0.42, sz * 0.8), 0, -sy * 0.22, 0);
    put(new THREE.BoxGeometry(sx * 0.58, sy * 0.14, sz * 0.58),
      0, -sy * 0.44, 0, 0, 0, 0, steelMaterial);
    put(new THREE.BoxGeometry(sx * 0.54, sy * 0.3, sz * 0.6), 0, sy * 0.06, 0);
    put(new THREE.BoxGeometry(sx * 0.16, sy * 0.1, sz * 0.56),
      -sx * 0.15, sy * 0.25, 0, 0, 0, 0, steelMaterial);
    put(new THREE.BoxGeometry(sx * 0.16, sy * 0.1, sz * 0.56),
      sx * 0.15, sy * 0.25, 0, 0, 0, 0, steelMaterial);
    for (let index = 0; index < 5; index += 1) {
      put(new THREE.BoxGeometry(sx * 0.68, sy * 0.4, sz * 0.045),
        0, sy * 0.04, -sz * 0.26 + index * (sz * 0.52 / 4), 0, 0, 0, steelMaterial);
    }
    const fanRadius = Math.min(sx, sz) * 0.27;
    put(new THREE.TorusGeometry(fanRadius * 1.12, fanRadius * 0.14, 8, 24),
      -sx * 0.2, sy * 0.34, 0, Math.PI / 2, 0, 0, steelMaterial);
    put(new THREE.CylinderGeometry(fanRadius, fanRadius, sy * 0.04, 18),
      -sx * 0.2, sy * 0.31, 0);
    for (let blade = 0; blade < 5; blade += 1) {
      put(new THREE.BoxGeometry(fanRadius * 1.9, sy * 0.03, fanRadius * 0.24),
        -sx * 0.2, sy * 0.345, 0, 0, (blade / 5) * Math.PI, 0, steelMaterial);
    }
    put(new THREE.CylinderGeometry(fanRadius * 0.22, fanRadius * 0.22, sy * 0.14, 8),
      -sx * 0.2, sy * 0.39, 0, 0, 0, 0, steelMaterial);
    put(new THREE.CylinderGeometry(fanRadius * 0.5, fanRadius * 0.5, sx * 0.3, 10),
      sx * 0.24, sy * 0.3, -sz * 0.18, 0, 0, Math.PI / 2, steelMaterial);
    for (const side of [-1, 1]) {
      put(new THREE.CylinderGeometry(sy * 0.095, sy * 0.095, sz * 0.7, 8),
        side * sx * 0.38, sy * 0.04, 0, Math.PI / 2, 0, 0, steelMaterial);
      for (let index = 0; index < 3; index += 1) {
        put(new THREE.CylinderGeometry(sy * 0.06, sy * 0.06, sx * 0.18, 6),
          side * sx * 0.3, sy * 0.14, -sz * 0.2 + index * sz * 0.2,
          0, 0, side * (Math.PI / 2.7), steelMaterial);
      }
    }
  } else if (kind === 'fuelTank') {
    const radius = Math.max(0.05, Math.min(sy * 0.42, sx * 0.21));
    put(new THREE.CylinderGeometry(radius, radius, sz * 0.85, 10),
      -sx * 0.22, 0, 0, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(radius, radius, sz * 0.85, 10),
      sx * 0.22, 0, 0, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, radius * 0.5, 8),
      -sx * 0.22, radius * 1.05, 0);
    put(new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, radius * 0.5, 8),
      sx * 0.22, radius * 1.05, 0);
    put(new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, sx * 0.44, 6),
      0, 0, sz * 0.28, 0, 0, Math.PI / 2);
    for (const zScale of [-0.26, 0.26]) {
      put(new THREE.TorusGeometry(radius * 1.05, radius * 0.1, 6, 16),
        -sx * 0.22, 0, sz * zScale, 0, 0, 0, steelMaterial);
      put(new THREE.TorusGeometry(radius * 1.05, radius * 0.1, 6, 16),
        sx * 0.22, 0, sz * zScale, 0, 0, 0, steelMaterial);
    }
  } else if (kind === 'gun') {
    const breechRadius = Math.min(sx, sy);
    put(new THREE.BoxGeometry(sx * 0.6, sy * 0.74, sz * 0.4), 0, 0, -sz * 0.2);
    put(new THREE.BoxGeometry(sx * 0.36, sy * 0.48, sz * 0.16), 0, -sy * 0.04, -sz * 0.46);
    put(new THREE.CylinderGeometry(breechRadius * 0.28, breechRadius * 0.28, sz * 0.42, 12),
      0, 0, sz * 0.2, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(breechRadius * 0.11, breechRadius * 0.11, sz * 0.62, 8),
      sx * 0.24, sy * 0.3, sz * 0.06, Math.PI / 2, 0, 0);
    put(new THREE.CylinderGeometry(breechRadius * 0.11, breechRadius * 0.11, sz * 0.62, 8),
      -sx * 0.24, sy * 0.3, sz * 0.06, Math.PI / 2, 0, 0);
  } else if (kind === 'transmission') {
    put(new THREE.BoxGeometry(sx * 0.82, sy * 0.66, sz * 0.72));
    put(new THREE.CylinderGeometry(sy * 0.24, sy * 0.24, sx * 0.94, 12),
      0, -sy * 0.12, 0, 0, 0, Math.PI / 2, steelMaterial);
    for (const side of [-1, 1]) {
      put(new THREE.TorusGeometry(sy * 0.28, sy * 0.07, 8, 18),
        side * sx * 0.34, -sy * 0.12, 0, 0, Math.PI / 2, 0);
    }
  } else if (kind === 'radio') {
    put(new THREE.BoxGeometry(sx * 0.75, sy * 0.55, sz * 0.7), 0, -sy * 0.12, 0);
    put(new THREE.CylinderGeometry(0.012, 0.012, sy * 0.7, 6), sx * 0.2, sy * 0.24, 0);
  } else if (kind === 'optics') {
    put(new THREE.CylinderGeometry(Math.min(sx, sz) * 0.2, Math.min(sx, sz) * 0.2, sy * 0.7, 8),
      0, -sy * 0.05, 0);
    put(new THREE.BoxGeometry(sx * 0.5, sy * 0.22, sz * 0.5), 0, sy * 0.34, 0);
  } else if (kind === 'turretRing') {
    const radius = Math.min(sx, sz) * 0.44;
    put(new THREE.TorusGeometry(radius, Math.min(sy * 0.3, 0.06), 8, 28),
      0, 0, 0, Math.PI / 2, 0, 0);
  } else {
    put(new THREE.BoxGeometry(sx * 0.6, sy * 0.6, sz * 0.6));
  }
  if (armor && volume.external !== true && kind !== 'optics') {
    const bounds = localGeometryBounds(group);
    const floorY = internalTankFloorY(armor, !!volume.turretLocal);
    const modelFloor = group.position.y + bounds.min.y;
    const adjustment = Math.max(0, floorY + CREW_ARMOR_CLEARANCE_M - modelFloor);
    group.position.y += adjustment;
    if (adjustment > 0) {
      group.userData.internalAnatomy.visualBounds.min[1] += adjustment;
      group.userData.internalAnatomy.visualBounds.max[1] += adjustment;
    }
    group.userData.internalAnatomy.compartmentFloorY = floorY;
    group.userData.internalAnatomy.floorAdjustmentY = adjustment;
  }
  return group;
}

/** Canonical seated human silhouette used by both kill cam and Gallery. */
export function addInternalCrewModel(
  volume,
  material,
  hullGroup,
  turretGroup,
  disposables,
  armor = null,
) {
  const group = proxyGroup(volume, hullGroup, turretGroup, `crew_${volume.crew}`);
  group.userData.internalAnatomy = {
    type: 'crew',
    key: volume.crew,
    form: volume.visualForm || 'seatedCrew',
    station: volume.station || null,
    pose: volume.turretLocal ? 'seated' : 'reclinedSeated',
    standingHeightM: CREW_STANDING_HEIGHT_M,
    scalePolicy: 'canonicalMeters',
  };
  const poseGroup = new THREE.Group();
  poseGroup.name = 'crew_seated_pose';
  const {
    torsoHeight,
    torsoRadius,
    headRadius,
    shoulderSpan,
    limbRadius,
    upperArmLength,
    thighLength,
    shinLength,
  } = CANONICAL_CREW;
  const body = new THREE.CapsuleGeometry(
    torsoRadius,
    torsoHeight - torsoRadius * 2,
    4,
    10,
  );
  const shoulderRadius = torsoRadius * 0.55;
  const shoulder = new THREE.CapsuleGeometry(
    shoulderRadius,
    shoulderSpan - shoulderRadius * 2,
    4,
    8,
  );
  const head = new THREE.SphereGeometry(headRadius, 10, 8);
  const helmet = new THREE.SphereGeometry(
    headRadius * 1.24,
    10,
    6,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.52,
  );
  disposables.push(body, shoulder, head, helmet);
  const upperBody = new THREE.Group();
  upperBody.name = 'crew_upper_body';
  upperBody.position.y = torsoRadius * 0.45;
  upperBody.rotation.x = volume.turretLocal ? 0 : -HULL_CREW_RECLINE_RAD;
  poseGroup.add(upperBody);
  const upperBodyMesh = (mesh) => {
    mesh.position.y -= upperBody.position.y;
    upperBody.add(mesh);
  };
  const bodyMesh = new THREE.Mesh(body, material);
  bodyMesh.name = 'crew_torso';
  bodyMesh.position.y = torsoHeight / 2;
  const shoulderMesh = new THREE.Mesh(shoulder, material);
  shoulderMesh.name = 'crew_shoulders';
  shoulderMesh.rotation.z = Math.PI / 2;
  shoulderMesh.position.y = torsoHeight - torsoRadius * 0.5;
  const neckY = torsoHeight + headRadius * 1.05;
  const headMesh = new THREE.Mesh(head, material);
  headMesh.name = 'crew_head';
  headMesh.position.y = neckY;
  const helmetMesh = new THREE.Mesh(helmet, material);
  helmetMesh.name = 'crew_helmet';
  helmetMesh.position.y = neckY + headRadius * 0.1;
  helmetMesh.scale.set(1, 0.8, 1);
  const armGeometry = new THREE.CapsuleGeometry(limbRadius, upperArmLength, 3, 7);
  const thighGeometry = new THREE.CapsuleGeometry(limbRadius * 1.12, thighLength, 3, 7);
  const shinGeometry = new THREE.CapsuleGeometry(limbRadius, shinLength, 3, 7);
  disposables.push(armGeometry, thighGeometry, shinGeometry);
  upperBodyMesh(bodyMesh);
  upperBodyMesh(shoulderMesh);
  upperBodyMesh(headMesh);
  upperBodyMesh(helmetMesh);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeometry, material);
    arm.name = side < 0 ? 'crew_arm_left' : 'crew_arm_right';
    arm.rotation.x = -0.55;
    arm.rotation.z = side * -0.2;
    const shoulderJoint = new THREE.Vector3(
      side * shoulderSpan * 0.43,
      torsoHeight * 0.82,
      torsoRadius * 0.15,
    );
    const armShoulderOffset = new THREE.Vector3(0, upperArmLength / 2, 0)
      .applyQuaternion(arm.quaternion);
    arm.position.copy(shoulderJoint).sub(armShoulderOffset);
    upperBodyMesh(arm);
    const thigh = new THREE.Mesh(thighGeometry, material);
    thigh.name = side < 0 ? 'crew_leg_left' : 'crew_leg_right';
    thigh.rotation.x = Math.PI * 0.48;
    const hip = new THREE.Vector3(
      side * torsoRadius * 0.58,
      torsoRadius * 0.45,
      torsoRadius * 0.08,
    );
    const thighHipOffset = new THREE.Vector3(0, -thighLength / 2, 0)
      .applyQuaternion(thigh.quaternion);
    thigh.position.copy(hip).sub(thighHipOffset);
    const shin = new THREE.Mesh(shinGeometry, material);
    shin.name = side < 0 ? 'crew_shin_left' : 'crew_shin_right';
    shin.rotation.x = volume.turretLocal ? TURRET_CREW_SHIN_RAD : HULL_CREW_SHIN_RAD;
    // Anchor both segments to the same knee instead of estimating their
    // positions independently. CapsuleGeometry's height spans the two cap
    // centers along local Y, so matching those centers keeps the dashed and
    // solid silhouettes joined at every crew-volume aspect ratio.
    const knee = new THREE.Vector3(0, thighLength / 2, 0)
      .applyQuaternion(thigh.quaternion)
      .add(thigh.position);
    const shinKneeOffset = new THREE.Vector3(0, shinLength / 2, 0)
      .applyQuaternion(shin.quaternion);
    shin.position.copy(knee).sub(shinKneeOffset);
    poseGroup.add(thigh, shin);
  }
  // Center the fixed-size seated pose on the authored station centroid. The
  // damage volume remains authoritative for simulation; the visual anchor is
  // then reseated inside the structural armor envelope so legacy boxes cannot
  // put helmets through roofs or bodies beyond hull/turret sides.
  poseGroup.updateMatrixWorld(true);
  const poseBounds = new THREE.Box3().setFromObject(poseGroup);
  const poseCenter = poseBounds.getCenter(new THREE.Vector3());
  poseGroup.position.sub(poseCenter);
  poseBounds.translate(poseCenter.clone().negate());
  poseGroup.updateMatrixWorld(true);
  const crownBounds = new THREE.Box3();
  for (const name of ['crew_head', 'crew_helmet']) {
    const mesh = poseGroup.getObjectByName(name);
    if (mesh) crownBounds.expandByObject(mesh);
  }
  const seat = reseatCrewInsideArmor(
    group, poseBounds, crownBounds, armor, !!volume.turretLocal,
  );
  group.userData.internalAnatomy.visualAnchorPolicy = seat
    ? 'structuralArmorEnvelope'
    : 'damageVolumeCentroid';
  if (seat) {
    group.userData.internalAnatomy.armorClearanceM = CREW_ARMOR_CLEARANCE_M;
    group.userData.internalAnatomy.compartmentBounds = seat.envelope;
    group.userData.internalAnatomy.compartmentRoofY = seat.roofY;
    group.userData.internalAnatomy.compartmentFloorY = seat.floorY;
    group.userData.internalAnatomy.originalAnchor = seat.original;
    group.userData.internalAnatomy.resolvedAnchor = seat.resolved;
    group.userData.internalAnatomy.anchorAdjustment = seat.adjustment;
  }
  group.add(poseGroup);
  return group;
}

/** Neutral drivetrain dressing shared with the kill-cam anatomy view. */
export function addInternalDrivetrainModel(armor, hullGroup, disposables, material) {
  const modules = armor.modules || [];
  const engine = modules.find((entry) => entry.module === 'engine' && !entry.turretLocal);
  const track = modules.find((entry) => entry.module === 'trackL')
    || modules.find((entry) => entry.module === 'trackR');
  if (!engine || !track) return null;
  const group = new THREE.Group();
  group.name = 'internal_drivetrain';
  group.renderOrder = 12;
  group.userData.internalAnatomy = { type: 'drivetrain', key: 'drivetrain' };
  hullGroup.add(group);
  const put = (geometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    disposables.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    group.add(mesh);
  };
  const ex = (engine.min[0] + engine.max[0]) / 2;
  const ey = (engine.min[1] + engine.max[1]) / 2;
  const ez = (engine.min[2] + engine.max[2]) / 2;
  const hullForward = track.max[2];
  const hullRear = track.min[2];
  const rearEngine = ez < (hullForward + hullRear) / 2;
  const face = rearEngine ? engine.max[2] : engine.min[2];
  const endZ = rearEngine
    ? hullForward - (hullForward - hullRear) * 0.12
    : hullRear + (hullForward - hullRear) * 0.12;
  const length = Math.abs(endZ - face);
  if (length < 0.8) {
    group.removeFromParent();
    return null;
  }
  const shaftY = Math.max(track.min[1] + 0.3, ey - (engine.max[1] - engine.min[1]) * 0.2);
  const midZ = (face + endZ) / 2;
  put(new THREE.CylinderGeometry(0.07, 0.07, length, 8), ex, shaftY, midZ, Math.PI / 2, 0, 0);
  put(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10),
    ex, shaftY, face + (rearEngine ? 0.06 : -0.06), Math.PI / 2, 0, 0);
  put(new THREE.CylinderGeometry(0.14, 0.14, 0.12, 10),
    ex, shaftY, endZ + (rearEngine ? -0.06 : 0.06), Math.PI / 2, 0, 0);
  const width = (engine.max[0] - engine.min[0]) * 0.92;
  const height = Math.max(0.3, (engine.max[1] - engine.min[1]) * 0.58);
  const transmissionLength = Math.min(0.75, length * 0.34);
  put(new THREE.BoxGeometry(width, height, transmissionLength),
    ex, shaftY + height * 0.14, endZ);
  for (let index = 0; index < 3; index += 1) {
    put(new THREE.BoxGeometry(width * 1.06, height * 0.74, transmissionLength * 0.09),
      ex, shaftY + height * 0.18,
      endZ - transmissionLength * 0.3 + index * transmissionLength * 0.3);
  }
  put(new THREE.CylinderGeometry(height * 0.28, height * 0.28, width * 1.5, 10),
    ex, shaftY, endZ, 0, 0, Math.PI / 2);
  return group;
}
