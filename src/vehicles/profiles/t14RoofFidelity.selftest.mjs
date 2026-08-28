import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';

const tank = createTank('t14', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});

const hullRig = tank.root.getObjectByName('rig_hull');
const turretRig = tank.root.getObjectByName('rig_turret');
const shell = tank.root.getObjectByName('turret');
const hullDark = tank.root.getObjectByName('hullDark');
assert(hullRig && turretRig && shell && hullDark,
  'T-14: hull/turret rigs and authored shell buckets exist');

const roof = turretRig.userData.t14RoofFidelityReceipt;
assert(roof, 'T-14: roof fidelity receipt is published');
assert.equal(roof.lowerBeltHeightM, 0.34,
  'T-14: broad lower turret belt is reduced to the 0.34 m knuckle datum');
assert(Math.abs(roof.mainRwsRearTierBottomM - roof.mainRwsPedestalTopM) < 1e-9,
  'T-14: rear electronics tier sits flush on the main RWS pedestal');
assert(Math.abs(roof.mainRwsFrontTierBottomM - roof.mainRwsPedestalTopM) < 1e-9,
  'T-14: forward electronics tier sits flush on the main RWS pedestal');
assert(roof.leftRemoteWeaponStation && roof.leftRemoteWeaponStationX < 0,
  'T-14: compact remote machine-gun station occupies the vehicle-left roof');
assert.equal(roof.rearAntennaCount, 2,
  'T-14: paired rear communications antennas are recorded');
assert.equal(roof.cheekSensorRecessCount, 2);
assert.equal(roof.cheekSensorLensCount, 2);

const parts = tank.root.userData.combatGeometryParts;
const lowerBelts = parts.filter((part) => part.bucket === 'turret'
  && part.min[1] >= -1e-5 && part.min[1] <= 1e-5
  && part.max[1] > 0.30 && part.max[1] < 0.35);
assert(lowerBelts.length >= 4,
  'T-14: all four lower-belt facets terminate at the slimmer knuckle');

const seatedTiers = parts.filter((part) => part.bucket === 'turretEquipment'
  && Math.abs(part.min[1] - roof.mainRwsPedestalTopM) < 1e-4
  && part.min[0] < -0.54 && part.max[0] > 0.04);
assert.equal(seatedTiers.length, 2,
  'T-14: both marked roof tiers are real turret equipment with zero air gap');

const leftRwsBase = parts.find((part) => part.bucket === 'turretDetail'
  && part.min[0] < -0.96 && part.max[0] > -0.68
  && Math.abs(part.min[1] - roof.roofDatumM) < 1e-4
  && part.min[2] < -0.24 && part.max[2] > 0.04);
assert(leftRwsBase,
  'T-14: left remote station base physically begins on the rear crown');
const leftRemoteWeapon = tank.root.getObjectByName('t14_left_remote_weapon');
assert(leftRemoteWeapon?.userData.fitting === 'pintleMG'
    && leftRemoteWeapon.userData.fittingRoot,
  'T-14: left tower carries a canonical remote machine-gun fitting');

const cheekLenses = parts.filter((part) => part.bucket === 'turretGlass'
  && part.min[2] > 1.25 && part.max[2] < 1.50
  && Math.abs((part.min[0] + part.max[0]) / 2) > 0.80);
assert.equal(cheekLenses.length, 2,
  'T-14: two inset glass lenses occupy the square cheek sockets');
for (const lens of cheekLenses) {
  assert(lens.max[0] - lens.min[0] < 0.25 && lens.max[1] - lens.min[1] < 0.25,
    'T-14: cheek lens remains visibly inset inside its armored frame');
}

function belongsTo(object, ancestor) {
  let cursor = object;
  while (cursor && cursor !== ancestor) cursor = cursor.parent;
  return cursor === ancestor;
}

for (const side of ['left', 'right']) {
  const antenna = tank.root.getObjectByName(`t14_rear_antenna_${side}`);
  assert(antenna && belongsTo(antenna, turretRig),
    `T-14: rear ${side} antenna follows turret yaw`);
}

const mudguards = tank.root.userData.mudguardFenderSeats
  .filter((seat) => seat.label.startsWith('t14_front_mudguard_'));
assert.equal(mudguards.length, 2);
assert(mudguards.every((seat) => seat.supported && seat.directGapM <= 0.005),
  'T-14: both front mudguards have a measured hull support path');

const hullReceipt = hullRig.userData.t14HullFidelityReceipt;
assert(hullReceipt?.glacisBackingFacesOutward,
  'T-14: glacis backing orientation correction is recorded');
const position = hullDark.geometry.attributes.position;
const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const edgeA = new Vector3();
const edgeB = new Vector3();
const normal = new Vector3();
let outwardGlacisFaces = 0;
for (let i = 0; i < position.count; i += 3) {
  a.fromBufferAttribute(position, i);
  b.fromBufferAttribute(position, i + 1);
  c.fromBufferAttribute(position, i + 2);
  const cx = (a.x + b.x + c.x) / 3;
  const cy = (a.y + b.y + c.y) / 3;
  const cz = (a.z + b.z + c.z) / 3;
  if (Math.abs(cx) < 0.05 || Math.abs(cx) > 1.55
      || cy < 1.32 || cy > 1.68 || cz < 2.20 || cz > 3.85) continue;
  edgeA.subVectors(b, a);
  edgeB.subVectors(c, a);
  normal.crossVectors(edgeA, edgeB).normalize();
  if (normal.y > 0.95 && normal.z > 0.10) outwardGlacisFaces++;
}
assert(outwardGlacisFaces >= 4,
  'T-14: both glacis backing panels expose upward/forward outer faces');

tank.dispose();
console.log('t14RoofFidelity.selftest: roof seats, slim belt, left RWS, rear antennas, mudguards, glacis and sensor recesses verified');
