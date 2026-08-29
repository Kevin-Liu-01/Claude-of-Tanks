import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';

const MERKAVA_IDS = [
  'merkava1b', 'merkava2b', 'merkava2d',
  'merkava3c', 'merkava3d', 'merkava4b',
];

const GLACIS_CLOSURES = Object.freeze({
  merkava1b: [2.28, 2.91],
  merkava2b: [1.95, 2.98],
  merkava2d: [1.95, 3.12],
  merkava3c: [2.15, 2.71],
  merkava3d: [1.85, 2.83],
  merkava4b: [2.10, 3.30],
});

const RUNNING_GEAR_REVISIONS = Object.freeze({
  merkava2b: 'terminal-course-reseat-r3',
  merkava2d: 'terminal-course-reseat-r3',
});

const REMOVED_SURFACES = [
  { id: 'merkava3c', mesh: 'hullRunningGearDark', min: [-1.72, 0.145, -3.20], max: [-1.72, 0.445, 1.70] },
  { id: 'merkava3d', mesh: 'hullRunningGearDark', min: [-1.72, 0.145, -3.28], max: [-1.72, 0.300, 1.70] },
  { id: 'merkava3d', mesh: 'hullCloth', min: [-1.716, 0.375, -3.13], max: [-1.716, 0.420, 1.59] },
  { id: 'merkava3d', mesh: 'hullRunningGearDark', min: [-1.716, 0.300, -3.13], max: [-1.716, 0.375, 1.59] },
  { id: 'merkava3d', mesh: 'hullRunningGearDark', min: [-1.092, 0.14, -3.60], max: [-1.092, 0.70, 2.20] },
  { id: 'merkava3d', mesh: 'hullRunningGearDark', min: [1.092, 0.14, -3.60], max: [1.092, 0.70, 2.20] },
];

const round = (value, places = 4) => Number(value.toFixed(places));

function roadWheelStations(tires) {
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const stations = new Map();
  for (let i = 0; i < tires.count; i++) {
    tires.getMatrixAt(i, matrix);
    position.setFromMatrixPosition(matrix);
    stations.set(`${round(position.y)}:${round(position.z)}`, {
      y: position.y,
      z: position.z,
    });
  }
  return [...stations.values()];
}

function staticWheelRings(root, stations) {
  const rings = [];
  root.traverse((mesh) => {
    if (!['hullRunningGearDark', 'hullRunningGearDetail'].includes(mesh.name)) return;
    const position = mesh.geometry?.getAttribute('position');
    if (!position) return;
    for (const station of stations) {
      const groups = new Map();
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        if (Math.abs(x) < 1) continue;
        const dy = position.getY(i) - station.y;
        const dz = position.getZ(i) - station.z;
        const radius = Math.hypot(dy, dz);
        if (radius < 0.08 || radius > 0.42) continue;
        const key = `${round(x, 3)}:${round(radius, 3)}`;
        const angles = groups.get(key) || new Set();
        angles.add(round(Math.atan2(dz, dy), 2));
        groups.set(key, angles);
      }
      for (const [key, angles] of groups) {
        if (angles.size >= 8) rings.push({ mesh: mesh.name, station, key, samples: angles.size });
      }
    }
  });
  return rings;
}

function containsMarkedSurface(root, mark, tolerance = 1e-4) {
  let found = false;
  root.traverse((mesh) => {
    if (found || mesh.name !== mark.mesh) return;
    const position = mesh.geometry?.getAttribute('position');
    if (!position) return;
    const index = mesh.geometry.index;
    const faceCount = index ? index.count / 3 : position.count / 3;
    const vertices = [];
    for (let face = 0; face < faceCount; face++) {
      for (let corner = 0; corner < 3; corner++) {
        const vertex = index ? index.getX(face * 3 + corner) : face * 3 + corner;
        const point = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
        const inside = point.every((value, axis) => value >= mark.min[axis] - tolerance && value <= mark.max[axis] + tolerance);
        if (inside) vertices.push(point);
      }
    }
    if (vertices.length < 6) return;
    for (let axis = 0; axis < 3; axis++) {
      const values = vertices.map((point) => point[axis]);
      if (Math.abs(Math.min(...values) - mark.min[axis]) > tolerance) return;
      if (Math.abs(Math.max(...values) - mark.max[axis]) > tolerance) return;
    }
    found = true;
  });
  return found;
}

const visuals = new Map();
for (const id of MERKAVA_IDS) {
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  visuals.set(id, visual);
  const tires = visual.root.getObjectByName('gearRoadWheelTires');
  assert.ok(tires?.isInstancedMesh, `${id}: canonical road wheels are instanced`);
  assert.equal(tires.count, 12, `${id}: exactly six canonical road wheels per side`);
  assert.equal(visual.root.getObjectByName('rig_hull')?.userData.nativeRoadWheelStations, 6,
    `${id}: running-gear receipt records six road-wheel stations`);
  const hull = visual.root.getObjectByName('rig_hull');
  const gearReceipt = hull.userData[`${id}RunningGearReceipt`];
  assert.equal(gearReceipt?.revision,
    RUNNING_GEAR_REVISIONS[id] ?? 'terminal-course-reseat-r2',
    `${id}: terminal-course reseat is audited`);
  assert.ok(Math.abs(gearReceipt.idlerForwardM - 0.15) < 1e-9,
    `${id}: idler moves forward by 15 cm`);
  assert.ok(Math.abs(gearReceipt.idlerZM - gearReceipt.previousIdlerZM - 0.15) < 1e-9,
    `${id}: idler receipt preserves the previous station`);
  assert.equal(gearReceipt.trackCourseUsesIdlerEndpoint, true,
    `${id}: live tread course uses the reseated idler endpoint`);
  if (id === 'merkava2b' || id === 'merkava2d') {
    assert.ok(gearReceipt.frontTerminalRoadWheelClearanceM > 0.15,
      `${id}: raised forward terminal clears the first road wheel by over 15 cm`);
    assert.ok(Math.abs(gearReceipt.sprocketZM - 2.52) < 1e-9,
      `${id}: front terminal is seated at the shared forward station`);
    assert.ok(Math.abs(gearReceipt.sprocketYM - 0.82) < 1e-9,
      `${id}: front terminal is seated at the shared raised station`);
  }

  const closureReceipt = hull.userData[`${id}GlacisClosureReceipt`];
  assert.equal(closureReceipt?.revision, 'upper-lower-glacis-web-r1',
    `${id}: lower glacis cavity has a structural closure`);
  assert.ok(Math.abs(closureReceipt.rearStationZM - GLACIS_CLOSURES[id][0]) < 1e-9);
  assert.ok(Math.abs(closureReceipt.frontStationZM - GLACIS_CLOSURES[id][1]) < 1e-9);
  assert.equal(closureReceipt.buriedEdgeOverlap, true,
    `${id}: closure terminates inside adjacent armor planes`);
  assert.deepEqual(staticWheelRings(visual.root, roadWheelStations(tires)), [],
    `${id}: no static wheel cylinders remain inside the suspension-driven road wheels`);
}

const mk3d = visuals.get('merkava3d');
const mk3dFaceNames = [
  'gearRoadWheelPressedFaces', 'gearRoadWheelDishRings',
  'gearRoadWheelDishRecesses', 'gearRoadWheelHubCaps',
];
for (const name of mk3dFaceNames) {
  const layer = mk3d.root.getObjectByName(name);
  assert.ok(layer?.isInstancedMesh, `merkava3d: ${name} is suspension-driven`);
  assert.equal(layer.count, 12, `merkava3d: ${name} follows all twelve road wheels`);
  assert.equal(layer.userData.dynamicWheelFace, true, `merkava3d: ${name} cannot remain parked on the hull`);
}

const tireMatrix = new THREE.Matrix4();
const faceMatrix = new THREE.Matrix4();
const tirePosition = new THREE.Vector3();
const facePosition = new THREE.Vector3();
for (const [id, visual] of visuals) {
  const faceLayers = [];
  visual.root.traverse((object) => {
    if (object.userData.dynamicWheelFace) faceLayers.push(object);
  });
  if (!faceLayers.length) continue;
  const state = createTankState(getSpec(id), new THREE.Vector3(0, 0, 0), 0);
  visual.setGroundSampler((x, z) => Math.sin(z * 1.7) * 0.11 + x * 0.015);
  for (let frame = 0; frame < 24; frame++) visual.syncFromState(state, 1 / 60);
  const tireLayer = visual.root.getObjectByName('gearRoadWheelTires');
  for (const layer of faceLayers) {
    for (let instance = 0; instance < tireLayer.count; instance++) {
      tireLayer.getMatrixAt(instance, tireMatrix);
      layer.getMatrixAt(instance, faceMatrix);
      tirePosition.setFromMatrixPosition(tireMatrix);
      facePosition.setFromMatrixPosition(faceMatrix);
      assert.ok(Math.abs(facePosition.y - tirePosition.y) < 1e-6,
        `${id}: ${layer.name} follows wheel ${instance} suspension travel`);
      assert.ok(Math.abs(facePosition.z - tirePosition.z) < 1e-6,
        `${id}: ${layer.name} stays concentric with wheel ${instance}`);
    }
  }
}

for (const mark of REMOVED_SURFACES) {
  assert.equal(containsMarkedSurface(visuals.get(mark.id).root, mark), false,
    `${mark.id}: owner-marked ${mark.mesh} patch stays removed`);
}

console.log('merkavaRunningGear.selftest: six reseated idlers, closed glacis webs, and one wheel course passed');
