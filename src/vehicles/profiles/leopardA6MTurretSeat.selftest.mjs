import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const eraSectorNames = [
  'a6m_turret_cheek_era_R', 'a6m_turret_cheek_era_L',
  'a6m_upper_glacis_era',
];
const retiredEraSectorNames = [
  'a6m_turret_side_era_R', 'a6m_turret_side_era_L',
  'a6m_skirt_era_R', 'a6m_skirt_era_L',
];
const spec = getSpec('leo2a6m');
const eraSectors = [...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => eraSectorNames.includes(plate.name));
assert.deepEqual(new Set(eraSectors.map((plate) => plate.name)), new Set(eraSectorNames),
  'leo2a6m exposes only the requested frontal ERA sectors to combat');
assert.equal(spec.dims.widthM, 3.98,
  'leo2a6m restores the certified ISAF cage width after removing skirt ERA');
assert.equal([...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => retiredEraSectorNames.includes(plate.name)).length, 0,
  'leo2a6m no longer carries the inherited turret-side or skirt ERA sectors');
for (const plate of eraSectors) {
  assert.equal(plate.kind, 'era', `${plate.name} is consumable rather than permanent armor`);
  assert.ok(plate.era?.ceFlatMm >= 300, `${plate.name} retains the UA chemical protection`);
}

const visual = createTank('leo2a6m', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const turretRig = visual.root.getObjectByName('rig_turret');
const hullRig = visual.root.getObjectByName('rig_hull');
assert.ok(turretRig && hullRig, 'leo2a6m keeps the canonical hull/turret rig');

const findMesh = (root, name) => {
  let found = null;
  root.traverse((node) => {
    if (!found && node.isMesh && node.name === name) found = node;
  });
  assert.ok(found, `leo2a6m has merged ${name} geometry`);
  return found;
};

const turret = findMesh(turretRig, 'turret');
const detail = findMesh(turretRig, 'turretDetail');
const equipment = findMesh(turretRig, 'turretEquipment');
const hull = findMesh(hullRig, 'hull');

const eraReceipt = turretRig.userData.leopard2A6MERAReceipt;
assert.ok(eraReceipt, 'leo2a6m publishes its fitted ERA receipt');
assert.equal(eraReceipt.totalTiles, 162,
  'leo2a6m receives the expanded cheeks and upper-glacis field only');
assert.deepEqual(new Set(eraReceipt.sectors), new Set(eraSectorNames),
  'visual ERA clusters map one-to-one to the standard tank sectors');
assert.equal(eraReceipt.cheekEraSeats.length, 112,
  'seven complete courses publish conformal seats across both turret cheeks');
assert.equal(eraReceipt.glacisEraSeats.length, 50,
  'the upper-glacis field publishes a fitted seat for every cassette');
assert.equal(eraReceipt.staticMergedProtection, true,
  'the added package creates no per-frame geometry work');
const assertSurfaceSeat = (seat, halfDepth, expectedOverlap, label) => {
  const surface = new THREE.Vector3(...seat.surfaceLocal);
  const center = new THREE.Vector3(...seat.centerLocal);
  const normal = new THREE.Vector3(...seat.normalLocal);
  const offset = center.sub(surface);
  assert.ok(Math.abs(normal.length() - 1) < 2e-5, `${label} has a unit surface normal`);
  assert.ok(offset.clone().cross(normal).length() < 2e-5,
    `${label} center advances only along the sampled surface normal`);
  assert.ok(Math.abs(offset.dot(normal) - (halfDepth - expectedOverlap)) < 2e-5,
    `${label} back face overlaps its armor seat by ${expectedOverlap} m`);
  assert.equal(seat.innerFaceOverlapM, expectedOverlap,
    `${label} records its physical overlap`);
};
for (const seat of eraReceipt.cheekEraSeats) {
  assertSurfaceSeat(seat, 0.07 * 0.84 * 0.5, 0.024, 'cheek ERA');
}
for (const seat of eraReceipt.glacisEraSeats) {
  assertSurfaceSeat(seat, 0.07 * 1.08 * 0.5, 0.015, 'glacis ERA');
}

const hullEra = findMesh(hullRig, 'hullExternalArmor');
const turretEra = findMesh(turretRig, 'turretExternalArmor');
const finish = visual.root.userData.eraFinishReceipt;
assert.equal(finish.layeredCassettes, 162,
  'all gameplay ERA sectors have matching layered visual cassettes');
assert.equal(finish.authoredParts, 324,
  'each cassette contributes one body and one inset top layer');
assert.deepEqual(finish.owners, ['hull', 'turret']);
assert.equal(finish.maximumDrawBuckets, 2,
  'hull and turret ERA remain two shared static draw buckets');
assert.equal(hullEra.geometry.getAttribute('position').count, 3600,
  'fifty glacis cassettes and lids are merged into hull external armor');
assert.equal(turretEra.geometry.getAttribute('position').count, 8064,
  'one hundred twelve cheek cassettes and lids are merged into turret external armor');

const cageReceipt = eraReceipt.cheekCage;
assert.ok(cageReceipt, 'leo2a6m publishes its conformal cheek-cage receipt');
assert.equal(cageReceipt.rows, 6, 'cheek cage has six face-following horizontal rails');
assert.equal(cageReceipt.contourStations, 6,
  'each cheek-cage row follows all six arrowhead contour stations');
assert.equal(cageReceipt.uprightsPerSide, 5,
  'five uprights retain each cheek cage on the compound face');
assert.equal(cageReceipt.tiePointsPerSide, 6,
  'six physical stand-off ties connect each cage to the cheek armor');
assert.equal(cageReceipt.surfaceOffsetM, 0.085,
  'cage clears the flush ERA faces without drifting away from the cheek');
assert.equal(cageReceipt.equipmentIsNonArmor, true,
  'cheek cage is visual equipment rather than duplicate combat armor');
assert.equal(cageReceipt.turretOwned, true,
  'cheek cage follows turret traverse');

const remoteWeaponReceipt = eraReceipt.roofRemoteWeapon;
assert.ok(remoteWeaponReceipt, 'leo2a6m publishes its roof remote-weapon receipt');
assert.equal(remoteWeaponReceipt.weaponClass, 'remote-machine-gun',
  'roof station is classified as a compact RCWS');
assert.equal(remoteWeaponReceipt.caliberMm, 12.7,
  'roof station carries a machine-gun caliber rather than a 35 mm autocannon');
assert.ok(remoteWeaponReceipt.bearingBottomLocalY <= remoteWeaponReceipt.roofTopLocalY,
  'RCWS bearing is buried into the turret roof');
assert.ok(remoteWeaponReceipt.receiverTopLocalY <= 1.24,
  'RCWS receiver stays below the existing PERI crown height budget');
assert.ok(remoteWeaponReceipt.barrelLengthM <= 0.40,
  'machine-gun barrel is less than one quarter of the retired autocannon length');
assert.ok(remoteWeaponReceipt.bearingDiameterM <= 0.40,
  'RCWS bearing is compact enough for the rear roof-V');
assert.equal(remoteWeaponReceipt.weaponScale, 0.72,
  'M2-class fitting uses the accepted compact station scale');
assert.equal(remoteWeaponReceipt.remoteControlled, true,
  'sensor-equipped roof weapon records remote operation');
assert.equal(remoteWeaponReceipt.equipmentIsNonArmor, true,
  'RCWS is visual equipment rather than structural armor');
assert.equal(remoteWeaponReceipt.turretOwned, true,
  'RCWS follows turret traverse');
const remoteMachineGun = turretRig.getObjectByName('leo2A6MRemoteMachineGun');
assert.ok(remoteMachineGun && remoteMachineGun.parent === turretRig,
  'compact remote machine gun is directly owned by the turret rig');
assert.equal(remoteMachineGun.userData.remoteControlled, true,
  'roof weapon group exposes its remote-control contract');
let equipmentOwner = equipment;
while (equipmentOwner && equipmentOwner !== turretRig) equipmentOwner = equipmentOwner.parent;
assert.ok(equipmentOwner === turretRig,
  'merged cage and RCWS equipment remain under the turret rig');

const downHits = (mesh, x, localZ) => {
  const ray = new THREE.Raycaster(
    new THREE.Vector3(x, 4, localZ + turretRig.position.z),
    new THREE.Vector3(0, -1, 0),
    0,
    10,
  );
  return ray.intersectObject(mesh, false).map((hit) => hit.point.y);
};

// The exact user-marked lug used to occupy this ray at world y~2.50 while
// the cheek surface sat at ~2.14.  Nothing may remain in that air column.
assert.equal(downHits(detail, 0.55, 2.28).length, 0,
  'marked freestanding A6M apex lug is removed');

// Every replacement fastener is a low-profile head embedded in the sloped
// armor: the first detail hit can stand no more than 22 mm above the first
// structural armor hit on the same vertical ray.
for (const [x, z] of [[0.47, 2.30], [0.62, 2.17], [0.79, 2.02], [1.00, 1.67], [1.18, 1.43]]) {
  const armorY = downHits(turret, x, z)[0];
  const detailY = downHits(detail, x, z)[0];
  assert.ok(Number.isFinite(armorY) && Number.isFinite(detailY),
    `A6M fastener ray (${x},${z}) intersects detail and armor`);
  assert.ok(detailY - armorY <= 0.022 && detailY - armorY >= -0.004,
    `A6M fastener at (${x},${z}) is surface-seated (${detailY - armorY} m gap)`);
}

// Crown-return sample rays must hit connected armor through the former open
// triangle between the arrow wedge and the forward V-roof.
for (const [x, z] of [[0.55, 1.25], [0.85, 1.00]]) {
  const hits = downHits(turret, x, z);
  assert.ok(hits.length > 0 && hits[0] > 2.30,
    `A6M crown return closes roof/wedge ray (${x},${z})`);
}

// The 2A6-pattern center brow now bridges the two inner cheek edges above
// the gun.  These centerline rays used to miss entirely at z >= 1.85; the
// replacement must form a continuous, sloping structural roof without
// dropping into the 2.13 m gun-axis corridor.
for (const [z, minY, maxY] of [
  [1.85, 2.32, 2.40],
  [2.10, 2.28, 2.36],
  [2.18, 2.25, 2.33],
]) {
  const hits = downHits(turret, 0, z);
  assert.ok(hits.length > 0 && hits[0] >= minY && hits[0] <= maxY,
    `A6M center brow seats above the gun at z=${z} (${hits[0]} m)`);
}
const gunAxisY = turretRig.position.y + 0.33;
const forwardGunCorridorHits = new THREE.Raycaster(
  new THREE.Vector3(0, gunAxisY, 4.0 + turretRig.position.z),
  new THREE.Vector3(0, 0, -1), 0, 1.8,
).intersectObject(turret, false);
assert.equal(forwardGunCorridorHits.length, 0,
  'A6M brow leaves the forward L/55 gun corridor open');

// The bearing collar reaches the 1.67 m hull deck instead of leaving the
// old 35-40 mm air slit under the dark turret basket.
const turretBounds = new THREE.Box3().setFromObject(turret);
assert.ok(turretBounds.min.y >= 1.64 && turretBounds.min.y <= 1.67,
  `A6M bearing collar lands on deck (${turretBounds.min.y} m)`);
const hullDeck = new THREE.Raycaster(
  new THREE.Vector3(0.8, 4, 0.35), new THREE.Vector3(0, -1, 0), 0, 10,
).intersectObject(hull, false)[0]?.point.y;
assert.ok(Number.isFinite(hullDeck) && turretBounds.min.y <= hullDeck + 0.002,
  `A6M bearing overlaps hull deck (${turretBounds.min.y} <= ${hullDeck})`);

// The cage follows the two actual side-skirt planes: the narrower rear run
// sits close to x=1.72, while only the short armored-bow run retains the
// 1.99 m certified width anchor. Both runs keep a continuous heel -> skirt
// support path and meet through the recorded transition at z=1.44.
const cageReceipts = hullRig.userData.leopardSlatMountReceipts;
assert.equal(cageReceipts?.length, 12, 'A6M records both six-section cage runs');
const rearCage = cageReceipts.filter(({ run }) => run === 'rear-skirt');
const frontCage = cageReceipts.filter(({ run }) => run === 'front-skirt');
assert.equal(rearCage.length, 8, 'A6M records four rear-skirt sections per side');
assert.equal(frontCage.length, 4, 'A6M records two front-skirt sections per side');
for (const receipt of rearCage) {
  assert.equal(receipt.outerX, 1.800, 'A6M rear cage is pulled close to the rear skirt');
  assert.equal(receipt.seatX, 1.720, 'A6M rear cage brackets land on the rear skirt face');
}
for (const receipt of frontCage) {
  assert.equal(receipt.outerX, 1.990, 'A6M bow cage retains the certified outer plane');
  assert.equal(receipt.seatX, 1.875, 'A6M bow cage brackets land on the armor modules');
}
for (const receipt of cageReceipts) {
  assert.equal(receipt.railY, 0.78, 'A6M cage retains its lower protective rail');
  assert.equal(receipt.lowerMountY, 0.90, 'A6M lower bracket lands on the skirt face');
  assert.ok(receipt.outerX - receipt.seatX <= 0.115,
    'A6M cage standoff remains close enough to read as skirt-mounted');
  assert.ok(receipt.lowerMountY > receipt.railY,
    'A6M cage has a vertical heel between its lower rail and skirt mount');
}
assert.deepEqual(hullRig.userData.leopardSlatTransition, {
  z: 1.44,
  rearOuterX: 1.800,
  frontOuterX: 1.990,
  rearSeatX: 1.720,
  frontSeatX: 1.875,
}, 'A6M records a supported transition between the two skirt planes');

// The paired bow width indicators land on the 1.305 m skirt/fender crown
// instead of floating above the upper glacis.
const widthIndicator = hullRig.userData.leopardWidthIndicatorSeat;
assert.ok(widthIndicator, 'A6M records the paired width-indicator seat');
assert.equal(widthIndicator.rodBottomY, widthIndicator.supportY,
  'A6M width-indicator rods touch the bow support plane');
assert.ok(widthIndicator.capCenterY - widthIndicator.rodTopY <= 0.016,
  'A6M width-indicator caps overlap the rod tips');

// The A6M applique narrows the bridge's forward edge to one third of its
// former 0.78 m span while keeping the shared rear seat and rib cadence.
const expectedA6MBridge = {
  frontZ: 2.20,
  rearZ: 0.50,
  frontHalfWidth: 0.13,
  rearHalfWidth: 0.28,
  ribZ: [0.82, 1.14, 1.46],
};
assert.deepEqual(turretRig.userData.leopardA6MantletRoofBridge, expectedA6MBridge,
  'A6M uses the narrowed fitted mantlet-roof bridge');

const a6 = createTank('leo2a6', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});
a6.root.updateMatrixWorld(true);
const a6TurretRig = a6.root.getObjectByName('rig_turret');
const a6GunRig = a6.root.getObjectByName('rig_gun');
const a6MuzzleRig = a6.root.getObjectByName('rig_muzzle');
assert.ok(a6TurretRig && a6GunRig && a6MuzzleRig,
  'leo2a6 keeps its canonical turret, gun, and muzzle rigs');
assert.deepEqual(a6TurretRig.userData.leopardA6MantletRoofBridge, {
  ...expectedA6MBridge,
  frontHalfWidth: 0.39,
}, 'A6 retains the full-width family mantlet-roof bridge');

const a6Gun = findMesh(a6GunRig, 'gun');
const a6GunDark = findMesh(a6GunRig, 'gunDark');
const physicalGunFaceZ = Math.max(
  new THREE.Box3().setFromObject(a6Gun).max.z,
  new THREE.Box3().setFromObject(a6GunDark).max.z,
);
const muzzleWorld = new THREE.Vector3();
a6MuzzleRig.getWorldPosition(muzzleWorld);
assert.ok(Math.abs(muzzleWorld.z - physicalGunFaceZ) <= 0.012,
  `A6 muzzle rig sits on the physical barrel face (${muzzleWorld.z} vs ${physicalGunFaceZ})`);

console.log('Leopard 2A6M turret-seat selftest passed');
