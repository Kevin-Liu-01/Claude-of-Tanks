import assert from 'node:assert/strict';
import * as THREE from 'three';
import './m60FamilyAttachments.selftest.mjs';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const sectorNames = [
  'm60a3_turret_era_front_L',
  'm60a3_turret_era_front_R',
  'm60a3_turret_era_side_L',
  'm60a3_turret_era_side_R',
];

const spec = getSpec('m60a3');
const sectors = spec.armor.turretPlates.filter((plate) => sectorNames.includes(plate.name));
assert.deepEqual([...new Set(sectors.map((plate) => plate.name))].sort(), sectorNames,
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

const finish = tank.root.userData.eraFinishReceipt;
assert.ok(finish, 'M60A3 publishes the fleet ERA finish receipt');
assert.equal(finish.revision, 'fleet-layered-vehicle-scale-camo-r1');
assert.equal(finish.layeredCassettes, receipt.totalTiles,
  'every authored M60 cassette receives a distinct inset cover');
assert.equal(finish.authoredParts, receipt.totalTiles * receipt.layersPerCassette,
  'cassette bodies and covers are tracked in the damageable ERA ranges');
assert.equal(finish.camoProjection, 'vehicle-scale-box-uv',
  'the field shares one continuous vehicle-scale camouflage projection');
assert.equal(finish.bodyAndCoverUseVehiclePaint, true,
  'both ERA layers use vehicle paint rather than gray detail material');
assert.equal(finish.maximumDrawBuckets, 1,
  'all M60 turret ERA layers remain one static merged draw bucket');
assert.equal(finish.perFrameWork, false,
  'layering adds no frame-loop work');

const eraMesh = tank.root.getObjectByName('turretExternalArmor');
assert.ok(eraMesh?.geometry && !eraMesh.isInstancedMesh,
  'M60 ERA is merged into the semantic turret external-armor bucket');
const normalAttribute = eraMesh.geometry.getAttribute('normal');
const surfaceNormals = [];
for (let index = 0; index < normalAttribute.count; index += 3) {
  surfaceNormals.push(new THREE.Vector3(
    normalAttribute.getX(index), normalAttribute.getY(index), normalAttribute.getZ(index)));
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

const position = eraMesh.geometry.getAttribute('position');
const countStrippedVertices = () => {
  let stripped = 0;
  for (let index = 0; index < position.count; index++) {
    if (position.getY(index) < -999) stripped++;
  }
  return stripped;
};

assert.equal(countStrippedVertices(), 0, 'all ERA layers are present on a fresh vehicle');
tank.stripEra('m60a3_turret_era_front_R');
assert.equal(countStrippedVertices(), receipt.frontTilesPerSide * 72,
  'a frontal-sector hit removes both 36-vertex box layers for only that sector');
assert.equal(tank.resetEra(), true, 'round reset restores the merged ERA geometry in place');
assert.equal(countStrippedVertices(), 0, 'reset restores every stripped body and cover vertex');

tank.dispose();
console.log('m60a3TurretEra.selftest: conformal M60 ERA is layered, camouflaged, merged, and strippable');
