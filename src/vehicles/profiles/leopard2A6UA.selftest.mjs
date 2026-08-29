import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { GHILLIE_SUIT_CONFIGS } from '../ghillieSuit.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';

const id = 'leo2a6_ua';
const spec = getSpec(id);
assert.equal(spec.name, 'Leopard 2A6 UA');
assert.equal(spec.nation, 'Ukraine');
assert.equal(spec.variantOf, 'leo2a6m');
assert.equal(tankTier(id), 10, 'Leopard 2A6 UA is a Tier X playable');
assert.equal(spec.role, 'mbt');

const sectorNames = [
  'ua_turret_cheek_era_R', 'ua_turret_cheek_era_L',
  'ua_turret_side_era_R', 'ua_turret_side_era_L',
  'ua_skirt_era_R', 'ua_skirt_era_L',
];
const eraSectors = [...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => sectorNames.includes(plate.name));
assert.deepEqual(eraSectors.map((plate) => plate.name).sort(), [...sectorNames].sort(),
  'six named ERA sectors back the complete visual package');
for (const plate of eraSectors) {
  assert.equal(plate.kind, 'era', `${plate.name} is consumable ERA`);
  assert.ok(plate.era?.ceFlatMm >= 300, `${plate.name} has shaped-charge protection`);
  assert.ok(plate.era?.keReduction > 0 && plate.era.keReduction <= 0.22,
    `${plate.name} keeps a bounded kinetic effect`);
}

const tank = createTank(id, null, {
  proceduralOnly: true,
  geometryReceipt: true,
  quality: 'high',
});
tank.root.updateMatrixWorld(true);
const hull = tank.root.getObjectByName('rig_hull');
const turret = tank.root.getObjectByName('rig_turret');
const gun = tank.root.getObjectByName('rig_gun');
const recoil = tank.root.getObjectByName('rig_recoil');
const muzzle = tank.root.getObjectByName('rig_muzzle');
assert.ok(hull && turret && gun && recoil && muzzle,
  'UA package preserves the canonical 2A6M articulation hierarchy');

const receipt = turret.userData.leopard2A6UAProtectionReceipt;
assert.ok(receipt, 'UA model publishes a protection/equipment receipt');
assert.equal(receipt.totalTiles, 144);
assert.equal(receipt.remoteStationCount, 2, 'two distinct roof RWS towers are authored');
assert.equal(receipt.remoteStations.length, 2);
for (const station of receipt.remoteStations) {
  assert.equal(station.seatPenetrationM, 0.012,
    'each RWS pedestal is keyed 12 mm into the actual turret roof');
  assert.ok(station.baseBottomY < station.roofMinY,
    'each RWS pedestal reaches below the lowest armor in its footprint');
  assert.ok(station.baseTopY > station.roofMaxY,
    'each RWS pedestal bridges above the highest armor in its footprint');
  assert.ok(Math.abs(station.roofMinY - station.baseBottomY - 0.012) < 1e-9,
    'RWS low-edge overlap remains tightly controlled');
  assert.ok(Math.abs(station.baseTopY - station.roofMaxY - 0.030) < 1e-9,
    'RWS adapter exposes only a compact cap above the high roof edge');
}
const forwardStation = receipt.remoteStations.find((station) => !station.heavy);
assert.ok(forwardStation.z > -0.80,
  'the lighter RWS is brought forward onto the main turret roof');
assert.equal(receipt.equipmentIsNonArmor, true);
assert.equal(receipt.staticMergedProtection, true,
  'protection kit is static merged geometry with no per-frame work');
assert.equal(receipt.frontCageContourStations, 6);
assert.equal(receipt.frontCageRows, 5);
assert.equal(receipt.frontCageUprightsPerSide, 4);
assert.equal(receipt.frontCageTiePointsPerSide, 6);
assert.equal(receipt.frontCageSurfaceOffsetM, 0.095,
  'front cage follows the cheek contour at one controlled stand-off');
assert.equal(receipt.frontEraSeats.length, 36,
  'every frontal ERA brick publishes its conformal armor seat');
for (const seat of receipt.frontEraSeats) {
  assert.equal(seat.innerFaceOverlapM, 0.012,
    'frontal ERA inner faces overlap the cheek rather than floating');
  const normalLength = Math.hypot(...seat.normalLocal);
  assert.ok(Math.abs(normalLength - 1) < 1e-4, 'frontal ERA seat normals are normalized');
  assert.ok(seat.normalLocal[2] > 0.35, 'frontal ERA faces outward over the arrowhead');
}

const eraMeshes = [];
tank.root.traverse((object) => {
  if (object.isMesh && /ExternalArmor$/.test(object.name)) eraMeshes.push(object);
});
const eraFinish = tank.root.userData.eraFinishReceipt;
assert.ok(eraFinish, 'UA model publishes the fleet layered-ERA finish receipt');
assert.deepEqual([...eraFinish.gameplaySectors].sort(), [...sectorNames].sort(),
  'all six gameplay sectors participate in the merged visual finish');
assert.equal(eraFinish.layeredCassettes, 144,
  'all six gameplay sectors have matching layered visual cassettes');
assert.equal(eraFinish.authoredParts, 288,
  'each cassette contributes one body and one inset camouflage cover');
assert.equal(eraMeshes.length, 2, 'hull and turret ERA use two merged draw buckets');
assert.ok(eraMeshes.every((mesh) => mesh.userData.combatHitboxRole === 'externalArmor'),
  'both merged ERA meshes retain explicit external-armor semantics');

const equipment = tank.root.getObjectByName('turretEquipment');
assert.equal(equipment?.userData.combatHitboxRole, 'equipment',
  'RWS receiver bodies cannot inflate the armor hitbox');
assert.equal(turret.getObjectByName('turretEquipment'), equipment,
  'both RWS towers remain children of the rotating turret rig');
const equipmentPositions = equipment.geometry.getAttribute('position');
for (const station of receipt.remoteStations) {
  let baseVertexCount = 0;
  for (let index = 0; index < equipmentPositions.count; index++) {
    const dx = equipmentPositions.getX(index) - station.x;
    const dz = equipmentPositions.getZ(index) - station.z;
    if (Math.hypot(dx, dz) <= 0.25
        && Math.abs(equipmentPositions.getY(index) - station.baseBottomY) < 1e-6) {
      baseVertexCount++;
    }
  }
  assert.ok(baseVertexCount >= 8,
    'merged RWS geometry retains the authored roof-contact ring');
}

for (const owner of ['hull', 'turret', 'gun']) {
  for (const layer of ['net', 'light', 'dark']) {
    const mesh = tank.root.getObjectByName(`${id}_ghillie_${owner}_${layer}`);
    assert.ok(mesh?.isMesh, `dense ${owner} ghillie ${layer} layer exists`);
    assert.ok(mesh.geometry.getAttribute('position').count > 120,
      `${owner} ghillie ${layer} is detailed fitted geometry`);
  }
}

const ghillie = GHILLIE_SUIT_CONFIGS[id].turret;
assert.equal(ghillie.top.length, 4,
  'turret ghillie is split across bustle, main roof and both crown cheeks');
assert.equal(ghillie.top[0].holes.length, 1,
  'the obsolete aft cutout is closed after moving the lighter RWS forward');
for (const panel of ghillie.top) {
  assert.ok(panel.seatGapM <= 0.026,
    `${panel.seat} net carrier stays within 26 mm of its authored roof surface`);
}
assert.equal(ghillie.face.length, 2, 'front ghillie is split around the moving gun channel');
for (const panel of ghillie.face) {
  assert.equal(typeof panel.zAt, 'function', 'front net follows the ruled cheek instead of a flat plane');
  assert.ok(panel.seatGapM <= 0.065, 'front net clears only the seated ERA depth');
}
assert.ok(ghillie.top[0].yAt(0, -3.2) < 0.70,
  'bustle net no longer floats at the former .98 m blanket height');
assert.ok(ghillie.top[1].yAt(0, 0) < 0.82,
  'main roof net hugs the wedge roof below its equipment line');
assert.ok(ghillie.face[1].zAt(1.20, 0.40) < 2.10,
  'outboard front net follows the swept cheek instead of the old z=2.72 plane');

const gunNet = tank.root.getObjectByName(`${id}_ghillie_gun_net`);
const gunBounds = new THREE.Box3().setFromObject(gunNet);
const muzzleWorld = muzzle.getWorldPosition(new THREE.Vector3());
assert.ok(gunBounds.max.z < muzzleWorld.z - 0.08,
  'barrel ghillie stops behind the open bore and muzzle/FX anchor');

const markings = [];
tank.root.traverse((object) => {
  if (object.userData.vehicleMarking) markings.push(object);
});
assert.ok(markings.some((object) => object.userData.markingCode?.includes(':ua-trident:')),
  'Ukrainian trident is present on a final supported surface');
assert.ok(markings.every((object) => object.userData.surfaceSupported),
  'every UA marking is physically seated');

tank.dispose();
console.log('leopard2A6UA.selftest: Tier X UA armor, cages, RWS and ghillie are playable');
