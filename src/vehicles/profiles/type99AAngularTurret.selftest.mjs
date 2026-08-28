import assert from 'node:assert/strict';
import { Box3, Vector3 } from 'three';
import { createTank } from '../tankFactory.ts';

const tank = createTank('type99a', null, {
  proceduralOnly: true,
  geometryReceipt: true,
});

const turretRig = tank.root.getObjectByName('rig_turret');
const shell = tank.root.getObjectByName('turret');
const equipment = tank.root.getObjectByName('turretEquipment');
const detail = tank.root.getObjectByName('turretDetail');
assert(turretRig && shell && equipment && detail,
  'Type 99A: angular shell and turret-owned equipment buckets exist');

function belongsTo(object, ancestor) {
  let cursor = object;
  while (cursor && cursor !== ancestor) cursor = cursor.parent;
  return cursor === ancestor;
}

for (const name of [
  'turret', 'turretDark', 'turretDetail', 'turretEquipment',
  'turretCloth', 'turretGlass',
]) {
  const object = tank.root.getObjectByName(name);
  assert(object && belongsTo(object, turretRig),
    `Type 99A: ${name} remains owned by the yawing turret rig`);
}

const namedFittings = [];
turretRig.traverse((object) => {
  if (object.name?.startsWith('fitting_')) namedFittings.push(object);
});
assert(namedFittings.length >= 7,
  'Type 99A: both roof stations, whips and bustle fittings remain turret-owned');

// Both heavy machine guns belong ahead of their respective cupolas, with
// their rear grips reaching back to the hatch rims for standing operators.
tank.root.updateMatrixWorld(true);
const roofGuns = [];
turretRig.traverse((object) => {
  if (!object.userData.fittingRoot || object.userData.fitting !== 'pintleMG') return;
  const center = turretRig.worldToLocal(object.getWorldPosition(new Vector3()));
  const bounds = new Box3().setFromObject(object);
  const rear = turretRig.worldToLocal(new Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    bounds.min.z,
  ));
  const front = turretRig.worldToLocal(new Vector3(
    (bounds.min.x + bounds.max.x) / 2,
    (bounds.min.y + bounds.max.y) / 2,
    bounds.max.z,
  ));
  roofGuns.push({ center, rear, front });
});
assert.equal(roofGuns.length, 2,
  'Type 99A: one crew-served heavy machine gun exists for each cupola');
roofGuns.sort((left, right) => left.center.x - right.center.x);
const [leftGun, rightGun] = roofGuns;
assert(approx(leftGun.center.x, -0.50, 0.02) && approx(rightGun.center.x, 0.52, 0.02),
  'Type 99A: machine-gun pintles align laterally with the left and right cupolas');
assert(leftGun.center.z >= -0.25 && rightGun.center.z >= -0.18,
  'Type 99A: both machine-gun pintles sit ahead of their cupola openings');
assert(leftGun.rear.z <= -0.44 && rightGun.rear.z <= -0.38,
  'Type 99A: both machine-gun spade grips reach aft to their operator openings');
assert(leftGun.front.z - leftGun.rear.z >= 1.18
  && rightGun.front.z - rightGun.rear.z >= 1.18,
  'Type 99A: both cupola weapons retain the enlarged heavy-gun silhouette');

// The front shell must carry a long pointed nose and a dense set of diagonal
// cheek faces. This catches a regression back to the old broad square front.
const positions = shell.geometry.attributes.position;
const a = new Vector3();
const b = new Vector3();
const c = new Vector3();
const edgeA = new Vector3();
const edgeB = new Vector3();
const normal = new Vector3();
let diagonalFrontFaces = 0;
let rakedForwardFaces = 0;
let forwardTipZ = -Infinity;
for (let i = 0; i < positions.count; i += 3) {
  a.fromBufferAttribute(positions, i);
  b.fromBufferAttribute(positions, i + 1);
  c.fromBufferAttribute(positions, i + 2);
  forwardTipZ = Math.max(forwardTipZ, a.z, b.z, c.z);
  const centroidZ = (a.z + b.z + c.z) / 3;
  const centroidY = (a.y + b.y + c.y) / 3;
  if (centroidZ < 0.55) continue;
  edgeA.subVectors(b, a);
  edgeB.subVectors(c, a);
  normal.crossVectors(edgeA, edgeB).normalize();
  if (Math.abs(normal.x) > 0.25 && Math.abs(normal.z) > 0.25) diagonalFrontFaces++;
  if (centroidZ > 0.75 && centroidY > 0.30 && centroidY < 0.90
    && Math.abs(normal.z) > 0.35 && Math.abs(normal.y / normal.z) > 0.35) {
    rakedForwardFaces++;
  }
}
assert(forwardTipZ >= 1.85,
  'Type 99A: welded arrow reaches the sharpened 1.86 m local nose datum');
assert(diagonalFrontFaces >= 100,
  'Type 99A: front is built from sustained diagonal cheek courses');
assert(rakedForwardFaces >= 32,
  'Type 99A: center arrow and cheek appliqué rake rearward instead of presenting flat forward walls');

const parts = tank.root.userData.combatGeometryParts;
function approx(value, target, tolerance = 0.015) {
  return Math.abs(value - target) <= tolerance;
}

for (const side of [-1, 1]) {
  const panniers = parts.filter((part) => part.bucket === 'turretEquipment'
    && (side > 0 ? part.min[0] >= 1.15 : part.max[0] <= -1.15)
    && part.min[2] <= -0.50 && part.max[2] >= -2.13);
  assert(panniers.some((part) => part.min[2] < -2.10),
    `Type 99A: ${side > 0 ? 'right' : 'left'} rear pannier overlaps the turret belt`);
  assert(panniers.some((part) => part.max[2] > -0.55),
    `Type 99A: ${side > 0 ? 'right' : 'left'} forward pannier overlaps the turret belt`);

  const cageStandoffs = parts.filter((part) => part.bucket === 'turretDetail'
    && (side > 0 ? part.min[0] >= 1.34 : part.max[0] <= -1.34)
    && part.max[2] <= -0.48 && part.min[2] >= -1.95
    && (part.max[0] - part.min[0]) >= 0.32);
  assert(cageStandoffs.length >= 3,
    `Type 99A: ${side > 0 ? 'right' : 'left'} cage has three shell-to-rail load paths`);
}

// The shortened mirrors retain their fender feet but no longer become tall
// antenna-like stalks above the glacis.
for (const side of [-1, 1]) {
  const mirrorStalk = parts.find((part) => part.bucket === 'hullDetail'
    && approx((part.min[0] + part.max[0]) / 2, side * 1.26, 0.02)
    && part.min[2] > 1.54 && part.max[2] < 1.98
    && (part.max[1] - part.min[1]) > 0.38);
  assert(mirrorStalk, `Type 99A: compact ${side > 0 ? 'right' : 'left'} mirror stalk exists`);
  assert(mirrorStalk.max[1] < 1.91,
    `Type 99A: ${side > 0 ? 'right' : 'left'} mirror stalk stays below the former tower height`);
}

// A representative outboard pannier point must orbit with turret yaw while
// keeping its exact distance to the turret pivot.
tank.root.updateMatrixWorld(true);
const localPoint = new Vector3(1.65, 0.58, -1.02);
const before = equipment.localToWorld(localPoint.clone());
const pivotBefore = turretRig.getWorldPosition(new Vector3());
turretRig.rotation.y = 0.61;
tank.root.updateMatrixWorld(true);
const after = equipment.localToWorld(localPoint.clone());
const pivotAfter = turretRig.getWorldPosition(new Vector3());
assert(before.distanceTo(after) > 0.75,
  'Type 99A: side equipment visibly follows turret yaw');
assert(Math.abs(before.distanceTo(pivotBefore) - after.distanceTo(pivotAfter)) < 1e-8,
  'Type 99A: side equipment stays rigidly attached during turret yaw');

tank.dispose();
console.log('type99AAngularTurret.selftest: arrow front, seated side modules, cupola MG stations, cage and compact mirrors verified');
