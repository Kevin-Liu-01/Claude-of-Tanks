import assert from 'node:assert/strict';
import * as THREE from 'three';
import { inspectNightWorldFixture } from './nightWorldFixtureInspection.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from '../world/maps/structureKit.ts';
import { makeLighthouse } from '../world/maps/railKit.ts';
import { markWorldAperture } from '../world/worldNightEmissionGeometry.ts';
import { prepareWorldStaticNightFixture, prepareWorldStructureNightFixture, setWorldNightFixtureActive } from '../world/worldNightFixtureInstances.ts';

const root = new THREE.Group(); root.position.set(30, 2, -20); root.rotation.y = .6;
const materials = [], geometries = [], instances = [];
function structure(kind, x) {
  const geometry = DESTRUCTIBLE_BUILDING_TYPES[kind].build(() => .5);
  const material = new THREE.MeshStandardMaterial(); materials.push(material); geometries.push(geometry);
  const mesh = new THREE.InstancedMesh(geometry, material, 2); mesh.name = `destructible-${kind}`;
  mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(x - 40, 0, 0));
  mesh.setMatrixAt(1, new THREE.Matrix4().compose(new THREE.Vector3(x, 0, 0),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(.06, .5, -.04)), new THREE.Vector3(.85, .95, .90)));
  prepareWorldStructureNightFixture(mesh, true); setWorldNightFixtureActive(mesh, 0, false);
  root.add(mesh); instances.push(mesh); return mesh;
}
const office = structure('securityoffice', 0), relay = structure('relaystation', 65);
const buckets = Object.fromEntries(['plaster', 'stone', 'roof', 'wood', 'dark', 'glass', 'baked'].map(key => [key, []]));
makeLighthouse(() => .5, buckets);
const glass = new THREE.MeshPhysicalMaterial(); materials.push(glass);
const ordinary = new THREE.BoxGeometry(1, 1, .1); geometries.push(ordinary);
prepareWorldStaticNightFixture([...buckets.glass, ordinary], glass);
const lighthouse = new THREE.Mesh(buckets.glass[0], glass); lighthouse.position.x = 130; root.add(lighthouse);
const children = [...root.children], reference = new THREE.Vector3(40, 8, 0);
for (const [kind, mesh, distance] of [['structure-window', office, 4], ['relay-beacon', relay, 5], ['lighthouse', lighthouse, 8]]) {
  const seat = inspectNightWorldFixture(root, reference, kind);
  assert(seat, `${kind}: actual authored outward aperture has a clear camera`);
  assert.equal(seat.ownerUuid, mesh.uuid); assert.equal(seat.kind, kind);
  assert.equal(seat.slot, kind === 'lighthouse' ? null : 1, 'destroyed instance never supplies the source');
  assert.equal(seat.mask, kind === 'relay-beacon' ? 2 : 1);
  assert.equal(seat.lineOfSight, 'authored-emissive-face');
  assert(new THREE.Vector3().fromArray(seat.camera).distanceTo(new THREE.Vector3().fromArray(seat.point)) >= distance - .25,
    'reverse trace preserves the external camera, not a near-clipped origin');
  const matrix = mesh.matrixWorld.clone();
  if (mesh.isInstancedMesh) { const instance = new THREE.Matrix4(); mesh.getMatrixAt(1, instance); matrix.multiply(instance); }
  const position = mesh.geometry.getAttribute('position'), normal = mesh.geometry.getAttribute('normal');
  const ids = [0, 1, 2].map(offset => mesh.geometry.index?.getX(seat.faceIndex * 3 + offset) ?? seat.faceIndex * 3 + offset);
  const point = new THREE.Vector3(), direction = new THREE.Vector3();
  for (const id of ids) { point.add(new THREE.Vector3().fromBufferAttribute(position, id)); direction.add(new THREE.Vector3().fromBufferAttribute(normal, id)); }
  point.multiplyScalar(1 / 3).applyMatrix4(matrix); direction.normalize().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(matrix));
  assert(point.distanceTo(new THREE.Vector3().fromArray(seat.point)) < 1e-8, 'actual scaled/tilted instance face point');
  assert(direction.distanceTo(new THREE.Vector3().fromArray(seat.direction)) < 1e-8, 'inverse-transpose normal survives nonuniform fixture scaling');
  mesh.visible = false; assert.equal(inspectNightWorldFixture(root, reference, kind), null); mesh.visible = true;
}
assert.deepEqual(root.children, children, 'inspection changes no scene owners');
setWorldNightFixtureActive(office, 1, false);
assert.equal(inspectNightWorldFixture(root, reference, 'structure-window'), null);
setWorldNightFixtureActive(relay, 1, false);
assert.equal(inspectNightWorldFixture(root, reference, 'relay-beacon'), null);
assert.throws(() => inspectNightWorldFixture(root, reference, 'any-glowing-material'), /Unknown authored fixture/);

const blockedRoot = new THREE.Group(), paneGeometry = markWorldAperture(new THREE.BoxGeometry(1, 1, .03), [0, 0, 1]);
const paneMaterial = new THREE.MeshStandardMaterial(); materials.push(paneMaterial); geometries.push(paneGeometry);
const pane = new THREE.InstancedMesh(paneGeometry, paneMaterial, 1); pane.name = 'destructible-securityoffice';
pane.setMatrixAt(0, new THREE.Matrix4()); prepareWorldStructureNightFixture(pane, true); blockedRoot.add(pane); instances.push(pane);
assert(inspectNightWorldFixture(blockedRoot, reference, 'structure-window'));
const wallGeometry = new THREE.BoxGeometry(3, 3, .1), wallMaterial = new THREE.MeshBasicMaterial();
geometries.push(wallGeometry); materials.push(wallMaterial);
const wall = new THREE.Mesh(wallGeometry, wallMaterial); wall.position.z = .2; blockedRoot.add(wall);
assert.equal(inspectNightWorldFixture(blockedRoot, reference, 'structure-window'), null, 'no camera rescue for a buried aperture');
wall.visible = false; assert(inspectNightWorldFixture(blockedRoot, reference, 'structure-window'));
wall.visible = true; wall.position.z = 3.8;
assert.equal(inspectNightWorldFixture(blockedRoot, reference, 'structure-window'), null, 'nearby wall or camera-inside facade is rejected');
for (const mesh of instances) mesh.dispose();
for (const geometry of [...geometries, ...Object.values(buckets).flat()]) geometry.dispose();
for (const material of materials) material.dispose();
console.log('nightWorldFixtureInspection: actual masked pane/bulb and instance identity, scaled transforms, inactive/buried rejection, fixed external cameras PASS');
