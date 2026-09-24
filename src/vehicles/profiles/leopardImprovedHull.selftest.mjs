import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

await ensureInteriorFills(['leo2a7v', 'leo2a7v_x']);

const near = (actual, expected, label, tolerance = 2e-4) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} vs ${expected}`);
const size = (object) => new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3());

// Measured pre-edit envelopes: hull 4.005512 m across fitted skirts,
// 7.820 m long; turret 3.017523 m across. Only the first dimension changes.
for (const quality of ['high', 'low']) {
  const tank = createTank('leo2a7v', null, { proceduralOnly: true, quality, geometryReceipt: true });
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  tank.root.updateMatrixWorld(true);
  const hullSize = size(hull);
  near(hullSize.x, 3.604961, `${quality}: narrower frontal envelope`);
  near(hullSize.y, 2.146500, `${quality}: hull height retained`);
  near(hullSize.z, 7.820000, `${quality}: hull length retained`);
  near(size(turret).x, 3.017523, `${quality}: turret retains its width`);
  near(size(gun.getObjectByName('gunMount')).x, 0.620000, `${quality}: mantlet retains its width`);
  near(getSpec('leo2a7v').dims.widthM, 3.6, 'declared hull width');
  const armor = getSpec('leo2a7v').armor;
  const collisionHalfWidth = Math.max(...armor.collisionShells.hull.flatMap(cell =>
    cell.vertices.map(point => Math.abs(point[0]))));
  assert.ok(collisionHalfWidth > 1.75 && collisionHalfWidth < 1.81,
    `combat hull must fit the narrowed visible shell: ${collisionHalfWidth}`);
  const turretSide = armor.turretPlates.find(plate => plate.name === 'turret_side_R');
  near(turretSide.verts[0][0], 1.41, 'combat turret width retained');
  near(tank.contactGeom.halfWidM, 1.674, 'ground contact follows narrowed tracks');
  near(tank.contactGeom.halfLenM, 2.6975, 'ground contact length retained');
  const tracks = getSpec('leo2a7v').armor.trackShapes;
  assert.equal(tracks.length, 2, 'one collision lane on each side');
  for (const track of tracks) {
    near(track.x1 - track.x0, .594, 'track hitbox follows visible band width');
    near(Math.max(Math.abs(track.x0), Math.abs(track.x1)), 1.674, 'lateral track envelope');
  }
  // Cached interior fills are stored in tank coordinates, independently of
  // the scaled hull owner. An old-width fill can enter the new track lane.
  const fill = hull.getObjectByName('hullInteriorFill');
  assert.ok(fill, 'closed hull retains its generated interior');
  const point = new THREE.Vector3();
  const positions = fill.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(fill.matrixWorld);
    const insideLane = Math.abs(point.x) > 1.08 && Math.abs(point.x) < 1.674
      && point.y > .043 && point.y < 1.3698
      && point.z > -3.5752 && point.z < 3.6782;
    assert.equal(insideLane, false, 'interior fill leaves the complete moving track lane empty');
  }
  for (const side of [-1, 1]) {
    const wheels = hull.userData.runningGearRoadWheels(side);
    assert.ok(wheels.length >= 7, 'road wheels remain suspension-owned');
    for (const wheel of wheels) {
      near(wheel.r, .395, 'round wheel radius retained');
      const center = hull.localToWorld(new THREE.Vector3(wheel.x, wheel.y, wheel.z));
      assert.ok(Math.abs(center.x) > 1.08 && Math.abs(center.x) < 1.674,
        'wheel center stays inside its narrowed track lane');
    }
  }
  const tires = hull.getObjectByName('gearRoadWheelTires');
  const restTireSize = size(tires);
  const restTireMatrices = Array.from(tires.instanceMatrix.array);
  const state = createTankState(getSpec('leo2a7v'), new THREE.Vector3(), 0);
  state.trackScroll.l = 2.3;
  state.trackScroll.r = -1.1;
  state.turretYaw = Math.PI / 2;
  state.gunPitch = .2;
  for (let i = 0; i < 8; i++) tank.syncFromState(state, 1 / 60, 20);
  assert.notDeepEqual(Array.from(tires.instanceMatrix.array), restTireMatrices,
    'both sides run through the live wheel animation');
  tank.resetForGaragePresentation();
  tank.root.updateMatrixWorld(true);
  near(size(hull).x, hullSize.x, 'garage reuse retains narrowed assembly');
  near(size(tires).x, restTireSize.x, 'animated wheels retain lateral seating');
  tank.dispose();
}

// This independently authored vehicle copies combat metadata from the
// Improved, but must not inherit its owner-requested width change.
const source = createTank('leo2a7v_x', null, { proceduralOnly: true, geometryReceipt: true });
source.root.updateMatrixWorld(true);
near(getSpec('leo2a7v_x').dims.widthM, 4, '2A7V retains its own dimensions');
near(size(source.root.getObjectByName('rig_hull')).x, 4.010000, '2A7V hull unchanged');
near(size(source.root.getObjectByName('rig_turret')).x, 3.180981, '2A7V turret unchanged');
source.dispose();
console.log('leopardImprovedHull.selftest: ok');
