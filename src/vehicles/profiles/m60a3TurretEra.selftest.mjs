import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';
import { getSpec } from '../specs.js';

const sectorNames = [
  'm60a3_turret_era_front_L',
  'm60a3_turret_era_front_R',
  'm60a3_turret_era_side_L',
  'm60a3_turret_era_side_R',
];

const spec = getSpec('m60a3');
const sectors = spec.armor.turretPlates.filter((plate) => sectorNames.includes(plate.name));
assert.deepEqual(sectors.map((plate) => plate.name).sort(), sectorNames,
  'M60A3 owns four independently strippable turret ERA sectors');
for (const plate of sectors) {
  assert.equal(plate.kind, 'era', `${plate.name}: hit layer is consumable ERA`);
  assert(plate.era?.ceFlatMm >= 250, `${plate.name}: first-generation ERA stops shaped-charge jets`);
  assert(plate.era?.keReduction > 0 && plate.era.keReduction <= 0.10,
    `${plate.name}: ERA has a modest, balanced kinetic effect`);
}

const tank = createTank('m60a3', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
const turret = tank.root.getObjectByName('rig_turret');
const receipt = turret?.userData.m60a3EraReceipt;
assert.ok(receipt, 'M60A3 publishes a conformal turret ERA seating receipt');
assert.equal(receipt.frontTilesPerSide, 15, 'each cast cheek carries three dense five-tile courses');
assert.equal(receipt.sideTilesPerSide, 18, 'each turret flank carries three wraparound six-tile courses');
assert.equal(receipt.totalTiles, 66, 'the complete turret package carries 66 destructible modules');
assert.equal(receipt.curvedSurfaceNormals, receipt.totalTiles,
  'every ERA module derives its own normal from the rounded casting');
assert.equal(receipt.tangentAxesPerTile, 2,
  'each tile uses longitudinal and dome tangents instead of a flat bank transform');
assert(receipt.castEmbedM >= 0.01 && receipt.castEmbedM <= 0.02,
  'modules are deliberately embedded into the cast skin instead of floating');
assert(receipt.minimumMantletClearanceM >= 0.04,
  'dense cheek fields preserve the moving mantlet throat');

const eraMeshes = turret.children.filter((object) => object.isInstancedMesh
  && object.geometry?.type === 'BoxGeometry'
  && Math.abs(object.geometry.parameters?.width - 0.28) < 1e-6
  && Math.abs(object.geometry.parameters?.height - 0.13) < 1e-6
  && Math.abs(object.geometry.parameters?.depth - 0.07) < 1e-6);
assert.equal(eraMeshes.length, 1, 'all turret ERA modules share one instanced draw bucket');
assert.equal(eraMeshes[0].count, receipt.totalTiles,
  'instanced draw bucket contains every authored turret module');

const matrix = new THREE.Matrix4();
const normal = new THREE.Vector3();
const surfaceNormals = [];
for (let index = 0; index < eraMeshes[0].count; index++) {
  eraMeshes[0].getMatrixAt(index, matrix);
  surfaceNormals.push(normal.set(0, 0, 1).transformDirection(matrix).clone());
}
const quantizedNormals = new Set(surfaceNormals.map((value) =>
  `${value.x.toFixed(2)},${value.y.toFixed(2)},${value.z.toFixed(2)}`));
const normalRange = (axis) => Math.max(...surfaceNormals.map((value) => value[axis]))
  - Math.min(...surfaceNormals.map((value) => value[axis]));
assert(quantizedNormals.size >= 50,
  'individual tiles retain the casting normals instead of collapsing into flat banks');
assert(normalRange('y') >= 0.75,
  'ERA courses roll over the turret dome from lower cheek to upper curve');
assert(normalRange('z') >= 1.50,
  'ERA wraps around the rounded nose and longitudinal cheek curve');

const countStripped = () => {
  let stripped = 0;
  for (let index = 0; index < eraMeshes[0].count; index++) {
    eraMeshes[0].getMatrixAt(index, matrix);
    if (matrix.elements[13] < -999) stripped++;
  }
  return stripped;
};

assert.equal(countStripped(), 0, 'all ERA modules are present on a fresh vehicle');
tank.stripEra('m60a3_turret_era_front_R');
assert.equal(countStripped(), receipt.frontTilesPerSide,
  'a frontal-sector hit removes only that sector’s visual modules');

tank.dispose();
console.log('m60a3TurretEra.selftest: dense conformal turret ERA is gameplay-backed and instanced');
