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
const eraSectorNames = [...new Set(eraSectors.map((plate) => plate.name))];
assert.deepEqual(eraSectorNames.sort(), [...sectorNames].sort(),
  'six named ERA banks back the complete visual package');
for (const sectorName of sectorNames) {
  assert.ok(eraSectors.filter((plate) => plate.name === sectorName).length > 1,
    `${sectorName} retains its individually fitted cassette collision faces`);
}
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
  assert.ok(seat.normalLocal[1] > 0.84 && seat.normalLocal[2] > 0.13,
    'frontal ERA follows the dominant upper return of the closed arrowhead');
  assert.ok(seat.normalLocal[0] * seat.side > 0.20,
    'frontal ERA turns outward with the compound cheek instead of folding inward');
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

// 2026-10-05 (tank-accessories lane): the suit's garnish is one spray-card 'leaves' layer on the trees lane's atlases
// (vehicleFoliage.ts) instead of the light and dark flap layers; the net carrier is unchanged.
for (const owner of ['hull', 'turret', 'gun']) {
  for (const layer of ['net', 'leaves']) {
    const mesh = tank.root.getObjectByName(`${id}_ghillie_${owner}_${layer}`);
    assert.ok(mesh?.isMesh, `dense ${owner} ghillie ${layer} layer exists`);
    assert.ok(mesh.geometry.getAttribute('position').count > 120,
      `${owner} ghillie ${layer} is detailed fitted geometry`);
  }
}

// 2026-10-08 (tank-accessories round 5; the coordinator after wave 269, 2/10 on the hero, gear and mantlet views: "a
// box-shaped shell of bristling leaf shards encloses the turret and runs down the full gun barrel", "leaf polygons ...
// cutting through the cage bars"; the ruling: replace the approach): the roof net is draped over the roof and its basket
// rails (no seat gap: it rests on the armour and sags off what holds it up), the cheeks inside the front cage carry no
// net, the only face net hangs over the bustle's rear cage, and the flank drapes stop part way down the flank cage.
const ghillie = GHILLIE_SUIT_CONFIGS[id].turret;
assert.equal(ghillie.top.length, 4,
  'turret ghillie is split across bustle, main roof and both crown cheeks');
assert.equal(ghillie.top[0].holes.length, 1,
  'the obsolete aft cutout is closed after moving the lighter RWS forward');
for (const panel of ghillie.top) {
  assert.equal(panel.seatGapM, undefined, 'the roof net is draped over the roof and its rails, not seated on the plate');
}
assert.ok((ghillie.face ?? []).every((panel) => panel.z < -3),
  'no net on the cheeks inside the front cage: the only face net is over the bustle');
assert.ok(ghillie.top[0].yAt(0, -3.2) < 0.70,
  'bustle net no longer floats at the former .98 m blanket height');
assert.ok(ghillie.top[1].yAt(0, 0) < 0.82,
  'main roof net hugs the wedge roof below its equipment line');
{
  const toTurret = new THREE.Matrix4().copy(turret.matrixWorld).invert();
  const net = tank.root.getObjectByName(`${id}_ghillie_turret_net`), at = net.geometry.getAttribute('position');
  const local = Array.from({ length: at.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(at, i)
    .applyMatrix4(net.matrixWorld).applyMatrix4(toTurret));
  assert.ok(local.every((v) => v.y > 0.38), 'the flank drapes stop part way down the flank cage; the lower flanks are bare');
  assert.ok(local.every((v) => v.z < 1.36), 'the cheeks and their front cage carry no net');
}

const gunNet = tank.root.getObjectByName(`${id}_ghillie_gun_net`);
const gunBounds = new THREE.Box3().setFromObject(gunNet);
const muzzleWorld = muzzle.getWorldPosition(new THREE.Vector3());
assert.ok(gunBounds.max.z < muzzleWorld.z - 0.08,
  'barrel ghillie stops behind the open bore and muzzle/FX anchor');
// round 5 (wave 269: "runs down the full gun barrel"; real crews wrap only short sections): two short wraps
{
  const toGun = new THREE.Matrix4().copy(gun.matrixWorld).invert(), at = gunNet.geometry.getAttribute('position');
  const covered = new Set();
  for (let i = 0; i < at.count; i++) {
    covered.add(Math.floor(new THREE.Vector3().fromBufferAttribute(at, i).applyMatrix4(gunNet.matrixWorld).applyMatrix4(toGun).z / 0.05));
  }
  assert.ok(covered.size * 0.05 <= 1.4, `the barrel carries short wraps, not a sleeve (${(covered.size * 0.05).toFixed(2)} m wrapped)`);
}

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
