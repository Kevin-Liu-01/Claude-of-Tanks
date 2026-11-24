import assert from 'node:assert/strict';
import { Box3 } from 'three';
import { createTank } from '../tankFactory.ts';

function signature(mesh) {
  const positions = mesh.geometry.attributes.position.array;
  let hash = 2166136261;
  for (const value of positions) {
    hash ^= Math.round(value * 10000);
    hash = Math.imul(hash, 16777619);
  }
  return `${positions.length}:${hash >>> 0}`;
}

function inspect(id) {
  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  tank.root.updateMatrixWorld(true);
  const hullRig = tank.root.getObjectByName('rig_hull');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  const hull = tank.root.getObjectByName('hull');
  const turret = tank.root.getObjectByName('turret');
  const equipment = tank.root.getObjectByName('turretEquipment');
  const detail = tank.root.getObjectByName('turretDetail');
  const dark = tank.root.getObjectByName('turretDark');
  assert(hullRig && turretRig && gunRig && hull && turret && equipment && detail && dark,
    `${id}: complete articulated buckets exist`);
  return { tank, hullRig, turretRig, gunRig, hull, turret, equipment, detail, dark };
}

const prototype = inspect('ztz99a');
const production = inspect('ztz99a2');
const vt4a1 = inspect('vt4a1');

assert.equal(prototype.turretRig.userData.ztz99a2PrototypeReceipt?.distinctPlayablePrototype, true,
  'ZTZ-99A2 Prototype: former canonical design remains separately playable');
assert.equal(prototype.turretRig.userData.ztz99a2TurretIntegrationReceipt?.selectedArmorAttached, true,
  'ZTZ-99A2 Prototype: preserved welded turret retains its attachment repair');
prototype.equipment.geometry.computeBoundingBox();
assert(prototype.equipment.geometry.boundingBox.min.z <= -2.34,
  'ZTZ-99A2 Prototype: preserved deep rear service package remains present');

const receipt = production.turretRig.userData.ztz99a2ProductionReceipt;
// release 276 (cn-turrets-276, Kevin 2026-11-24): the shell and its arrowhead cheek modules are one closed solid lofted
// from the turret's plan outline (chineseTurretOutlines.ts); the six-station Leopard-style chevrons are retired
assert.equal(receipt?.architecture, 'ztz99a2-production-arrowhead-r5',
  'ZTZ-99A2: canonical ID receives the production arrowhead turret');
assert.equal(receipt?.prototypeGeometryReused, false,
  'ZTZ-99A2: production turret is not the relabeled prototype mesh');
assert.equal(receipt?.outlineLofted, true,
  'ZTZ-99A2: shell and cheek modules are one solid from one outline');
assert.equal(receipt?.cheekModules, 'arrowhead',
  'ZTZ-99A2: arrowhead cheek modules, as photographed');
assert.equal(receipt?.detonatingCheekTiles, 36,
  'ZTZ-99A2: only the face tiles are depleted as ERA');
assert.equal(receipt?.spentStateRetainsClosedFront, true,
  'ZTZ-99A2: spent ERA state retains the complete closed front');
assert.equal(receipt?.bustleExtensionM, 0.50,
  'ZTZ-99A2: bustle is extended by exactly 0.50 m');
assert.equal(receipt?.bustleUndersideRiseM, 0.42,
  'ZTZ-99A2: bustle underside rises by exactly 0.42 m');
assert.equal(receipt?.armoredBustleRearZM, -2.22,
  'ZTZ-99A2: shell rear station includes the exact extension');
production.turret.geometry.computeBoundingBox();
assert(production.turret.geometry.boundingBox.min.z <= -2.219,
  'ZTZ-99A2: rendered armored shell reaches its -2.22 m rear station');
assert.deepEqual(production.turretRig.position.toArray(), [0, 1.56, 0.12],
  'ZTZ-99A2: new low production turret sits on its own forward ring station');
assert.notEqual(signature(prototype.turret), signature(production.turret),
  'ZTZ-99A2: production and prototype primary turret geometry are distinct');
const cheekTiles = production.tank.root.getObjectByName('turretExternalArmor');
assert(cheekTiles && cheekTiles.geometry.attributes.position.count >= 36 * 36,
  'ZTZ-99A2: the 36 raised face tiles (closed blocks) are all built');
// Main's owner-directed mantlet fit (2026-10-02, 245aa4e4e) opens a 0.80 m gun channel through the turret stock, so each
// closed cheek ends in a capped wall at |x| 0.40. Release 276: the cheeks are faces of the outline solid
// (chineseTurretOutlines.ts), so the wall section is the outline's: the level stub inboard of the tip at z 1.68 from the
// floor (on the ring's seat plane, turretSeatRace.ts: y 0.155) to the band top (y 0.40), and the sloped top meeting the
// roof (y 0.815) at z 1.10. The front envelope is measured on the stock outboard of the channel.
const channelHalfWidth = 0.40;
const chevronWall = [[0.40, 1.68], [0.815, 1.10], [0.155, 1.68]];
const chevronPositions = production.turret.geometry.attributes.position;
const onWall = (side, [y, z]) => {
  for (let index = 0; index < chevronPositions.count; index++) {
    if (Math.abs(chevronPositions.getX(index) - side * channelHalfWidth) < 1e-4
      && Math.abs(chevronPositions.getY(index) - y) < 1e-4
      && Math.abs(chevronPositions.getZ(index) - z) < 1e-4) return true;
  }
  return false;
};
const closedWalls = () => {
  for (const side of [-1, 1]) for (const corner of chevronWall) {
    assert(onWall(side, corner), `ZTZ-99A2: the permanent cheek closes at the gun-channel wall (${side}, ${corner})`);
  }
};
closedWalls();
// Seeded defect: the cheeks pulled 10 mm back from their measured wall section must fail.
production.turret.geometry.translate(0, 0, -0.01);
assert.throws(closedWalls, assert.AssertionError, 'ZTZ-99A2: a displaced cheek wall section is rejected');
production.turret.geometry.translate(0, 0, 0.01);
closedWalls();
assert(new Box3().setFromObject(production.turret).max.z >= production.turretRig.position.z + chevronWall[0][1] - 1e-4,
  'ZTZ-99A2: the permanent closed cheeks project to the gun-channel walls');
let frontMinY = Infinity;
let frontMaxY = -Infinity;
for (let index = 0; index < chevronPositions.count; index++) {
  if (chevronPositions.getZ(index) < 0.40 || Math.abs(chevronPositions.getX(index)) < channelHalfWidth - 1e-6) continue;
  frontMinY = Math.min(frontMinY, chevronPositions.getY(index));
  frontMaxY = Math.max(frontMaxY, chevronPositions.getY(index));
}
assert(frontMinY <= 0.02 && frontMaxY >= 0.814 && frontMaxY - frontMinY >= 0.79,
  `ZTZ-99A2: the permanent cheeks span the roof-to-chin front envelope (${frontMinY}..${frontMaxY})`);

for (const vehicle of [prototype, production, vt4a1]) {
  const hullReceipt = vehicle.hullRig.userData.ztz99a2HullIntegrationReceipt;
  assert.equal(hullReceipt?.shoulderVolumes, 2,
    'A2 chassis: both glacis-to-skirt shoulder volumes are present');
  assert.equal(hullReceipt?.architecture, 'ztz99a2-production-chassis-r3',
    'A2 chassis: revised closed shoulder architecture is installed');
  assert.equal(hullReceipt?.shoulderStationsPerSide, 6,
    'A2 chassis: each shoulder is a six-station closed structural loft');
  assert.equal(hullReceipt?.frontMudguardsAttachedToShoulders, true,
    'A2 chassis: front steel mudguards are structurally tied into the shoulders');
  assert.equal(hullReceipt?.frontMudguardShoulderOverlapM, 0.0475,
    'A2 chassis: mudguard rear faces overlap the structural shoulders');
  assert.equal(hullReceipt?.floatingBowStiffenersRemoved, true,
    'A2 chassis: detached low bow stiffeners are removed');
  assert.equal(hullReceipt?.endWheelLiftM, 0.10,
    'A2 chassis: idler and rear sprocket are raised by 0.10 m');
  assert.equal(hullReceipt?.idlerYM, 0.74,
    'A2 chassis: idler center follows the raised datum');
  assert.equal(hullReceipt?.rearSprocketYM, 0.78,
    'A2 chassis: rear sprocket center follows the raised datum');
  assert.equal(vehicle.hullRig.userData.sharedMudguards
    ?.filter((entry) => entry.label.startsWith('ztz99a2-front-mudguard-')).length, 2,
  'A2 chassis: two broad shaped front mudguards are registered');
  for (const mudguard of vehicle.hullRig.userData.sharedMudguards
    .filter((entry) => entry.label.startsWith('ztz99a2-front-mudguard-'))) {
    assert.equal(mudguard.y, 1.19,
      'A2 chassis: front mudguard vertical datum matches the shoulder face');
    assert.equal(mudguard.z, 3.46,
      'A2 chassis: front mudguard is buried into the shoulder nose');
    assert.equal(mudguard.attachedSupport, true,
      'A2 chassis: every front mudguard retains an attached upper support');
  }
}
assert.equal(signature(production.hull), signature(prototype.hull),
  'Production and prototype use the same improved ZTZ-99A2 chassis');
assert.equal(signature(production.hull), signature(vt4a1.hull),
  'VT-4A1 continues to inherit the improved ZTZ-99A2 chassis');

prototype.tank.dispose();
production.tank.dispose();
vt4a1.tank.dispose();
console.log('ztz99a2RearService.selftest: dominant closed chevrons, exact bustle rise and sealed shared bow shoulders verified');
