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
assert(roof.moldedCrown && roof.crownPlanVertexCount === 10,
  'T-14: front roof is a connected multi-station crown rather than a square lid');
assert(roof.singleMoldedRoof && roof.raisedRearCrownRemoved && roof.roofDatumM === 0.845,
  'T-14: cheek-shaped crown is the only roof; the marked raised rectangular lid is gone');
assert(roof.crownThroatHalfWidthM < roof.crownShoulderHalfWidthM * 0.25,
  'T-14: crown plan narrows materially into the gun throat');
assert(roof.mainRwsPedestalEquipment
    && roof.mainRwsPedestalBottomM < roof.roofDatumM
    && roof.mainRwsPedestalTopM > roof.roofDatumM,
  'T-14: main RWS pedestal is equipment seated through the molded roof skin');
assert(Math.abs(roof.mainRwsRearTierBottomM - roof.mainRwsPedestalTopM) < 1e-9,
  'T-14: rear electronics tier sits flush on the main RWS pedestal');
assert(Math.abs(roof.mainRwsFrontTierBottomM - roof.mainRwsPedestalTopM) < 1e-9,
  'T-14: forward electronics tier sits flush on the main RWS pedestal');
assert(roof.primaryRemoteWeaponStation && roof.primaryRemoteWeaponStationX < 0,
  'T-14: consolidated remote autocannon occupies the primary roof station');
assert.equal(roof.primaryRemoteWeaponCaliberMm, 30);
assert.equal(roof.primaryRemoteWeaponBarrelDiameterM, 0.124);
assert.equal(roof.primaryRemoteWeaponVariant, 'armata-30mm-autocannon');
assert(roof.primaryRemoteWeaponForwardFacing,
  'T-14: primary roof autocannon firing axis remains vehicle-forward');
assert(roof.roofMachineGunStation && roof.roofMachineGunScale === 0.92
    && roof.roofMachineGunForwardFacing,
  'T-14: enlarged NSVT has its own forward-facing molded-roof station');
assert.equal(roof.rearAntennaCount, 2,
  'T-14: paired rear communications antennas are recorded');
assert.equal(roof.cheekSensorRecessCount, 2);
assert.equal(roof.cheekSensorLensCount, 6);
assert(roof.cheekSensorStructuralCutouts && roof.cheekSensorPocketDepthM >= 0.09,
  'T-14: cheek optics occupy structural armor cutouts at least 90 mm deep');
assert.equal(roof.auxiliaryTechPartCount, 22);
assert.equal(roof.externalTechLensCount, 9);

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

const seatedPedestal = parts.find((part) => part.bucket === 'turretEquipment'
  && Math.abs(part.min[1] - roof.mainRwsPedestalBottomM) < 1e-4
  && Math.abs(part.max[1] - roof.mainRwsPedestalTopM) < 1e-4
  && part.min[0] < -0.60 && part.max[0] > 0.14
  && part.min[2] < -1.28 && part.max[2] > -0.22);
assert(seatedPedestal,
  'T-14: main remote-weapon pedestal is seated equipment, not false turret armor');

const deletedRaisedLid = parts.find((part) => part.bucket === 'turret'
  && Math.abs(part.min[1] - roof.roofDatumM) < 1e-4
  && part.max[1] > 1.03
  && part.min[0] < -1.20 && part.max[0] > 1.20
  && part.min[2] < -0.50 && part.max[2] > 0.38);
assert.equal(deletedRaisedLid, undefined,
  'T-14: no structural geometry remains at the marked raised-lid bounds');

const primaryRwsBearing = parts.find((part) => part.bucket === 'turretDetail'
  && Math.abs(part.min[1] - roof.primaryRemoteWeaponDeckM) < 1e-4
  && part.min[0] < roof.primaryRemoteWeaponStationX - 0.19
  && part.max[0] > roof.primaryRemoteWeaponStationX + 0.19
  && part.min[2] < -1.27 && part.max[2] > -0.89);
assert(primaryRwsBearing,
  'T-14: primary autocannon bearing physically begins on the marked electronics roof');
const primaryRemoteWeapon = tank.root.getObjectByName('t14_primary_remote_weapon');
assert(primaryRemoteWeapon?.userData.fitting === 'pintleMG'
    && primaryRemoteWeapon.userData.fittingRoot
    && primaryRemoteWeapon.userData.caliberMm === 30
    && primaryRemoteWeapon.userData.barrelDiameterM === 0.124
    && primaryRemoteWeapon.userData.stationVariant === 'armata-30mm-autocannon'
    && primaryRemoteWeapon.userData.forwardFacing,
  'T-14: primary station carries one canonical stronger forward-facing 30 mm autocannon');

const roofMgBase = parts.find((part) => part.bucket === 'turretDetail'
  && Math.abs(part.min[1] - roof.roofDatumM) < 1e-4
  && part.min[0] < -0.94 && part.max[0] > -0.62
  && part.min[2] < -0.24 && part.max[2] > 0.08);
const roofMachineGun = tank.root.getObjectByName('t14_roof_machine_gun');
assert(roofMgBase && roofMachineGun?.userData.fitting === 'pintleMG'
    && roofMachineGun.userData.fittingRoot
    && roofMachineGun.userData.forwardFacing
    && roofMachineGun.userData.stationVariant === 'armata-roof-nsvt',
  'T-14: stronger NSVT is connected to a dedicated molded-roof socket');

const cheekLenses = parts.filter((part) => part.bucket === 'turretGlass'
  && part.min[1] > 0.40 && part.max[1] < 0.70
  && part.min[2] > 0.90 && part.max[2] < 1.40
  && Math.abs((part.min[0] + part.max[0]) / 2) > 0.70);
assert.equal(cheekLenses.length, 6,
  'T-14: two square cheek sockets carry three inset optical channels apiece');
for (const lens of cheekLenses) {
  assert(lens.max[0] - lens.min[0] < 0.30 && lens.max[1] - lens.min[1] < 0.24,
    'T-14: cheek lens remains inside its armored aperture');
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
console.log('t14RoofFidelity.selftest: single molded roof, structural cheek optics, consolidated 30 mm RWS, seated NSVT, turret tech, antennas, mudguards and glacis verified');
