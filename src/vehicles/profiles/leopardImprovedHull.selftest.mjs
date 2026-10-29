import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

await ensureInteriorFills(['leo2_improved', 'leo2a7v']);

const near = (actual, expected, label, tolerance = 2e-4) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} vs ${expected}`);
const size = (object) => new THREE.Box3().setFromObject(object, true).getSize(new THREE.Vector3());

// Measured pre-edit envelopes: hull 4.005512 m across fitted skirts,
// 7.820 m long; turret 3.017523 m across. Only the first dimension changes.
// 264 (the 2A4-family rebuild, profiles/leopard2A4Family.ts): the Improved stands on the release hull with the 2A4 turret
// and its 2A6-look wedge; the old hull's 0.9 lateral scale went with that hull (leopard2ImprovedKit.ts). Its envelope is
// re-measured on the rebuild: 3.662 m across the deep skirts, the release hull's 7.902 m and seven 0.348 m road wheels.
for (const quality of ['high', 'low']) {
  const tank = createTank('leo2_improved', null, { proceduralOnly: true, quality, geometryReceipt: true });
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  tank.root.updateMatrixWorld(true);
  const hullSize = size(hull);
  near(hullSize.x, 3.662000, `${quality}: narrower frontal envelope`);
  near(hullSize.y, 2.067000, `${quality}: hull height retained`);
  near(hullSize.z, 7.902000, `${quality}: hull length retained`);
  near(size(turret).x, 2.905157, `${quality}: turret retains its width`);
  near(size(gun.getObjectByName('gunMount')).x, 0.443400, `${quality}: mantlet retains its width`);
  near(getSpec('leo2_improved').dims.widthM, 3.6, 'declared hull width');
  const armor = getSpec('leo2_improved').armor;
  const collisionHalfWidth = Math.max(...armor.collisionShells.hull.flatMap(cell =>
    cell.vertices.map(point => Math.abs(point[0]))));
  // (264: the release hull's combat shell measures 1.72 m, inside the 1.831 m drawn hull; the skirts' plates at 1.82
  // carry the side's first face)
  assert.ok(collisionHalfWidth > 1.70 && collisionHalfWidth < 1.81,
    `combat hull must fit the narrowed visible shell: ${collisionHalfWidth}`);
  const turretSide = armor.turretPlates.find(plate => plate.name === 'turret_side_R');
  near(turretSide.verts[0][0], 1.3937, 'combat turret width retained');
  near(tank.contactGeom.halfWidM, 1.6805, 'ground contact follows narrowed tracks');
  // 2026-10-04 (aa5fdca05): the published track run is read off the drawn band; the narrowed hull's band measures
  // 2.6772 m (the profile's pinned flat run was 2.6975 m), and the build publishes what the combat anatomy records.
  // (264: the release hull's band measures 2.6405 m)
  near(tank.contactGeom.halfLenM, 2.6405, 'ground contact length retained');
  near(tank.contactGeom.halfLenM, getSpec('leo2_improved').armor.trackContact.halfLenM, 'ground contact length published', 6e-5);
  const tracks = getSpec('leo2_improved').armor.trackShapes;
  assert.equal(tracks.length, 2, 'one collision lane on each side');
  for (const track of tracks) {
    near(track.x1 - track.x0, .643, 'track hitbox follows visible band width');
    near(Math.max(Math.abs(track.x0), Math.abs(track.x1)), 1.6805, 'lateral track envelope');
  }
  // Cached interior fills are stored in tank coordinates, independently of
  // the scaled hull owner. An old-width fill can enter the new track lane.
  // (264: the lane is the build's own track prism, its slab x 1.0375..1.6805 and its side silhouette's extent)
  const lane = {
    x0: Math.min(...tracks.map(track => Math.min(Math.abs(track.x0), Math.abs(track.x1)))),
    x1: Math.max(...tracks.map(track => Math.max(Math.abs(track.x0), Math.abs(track.x1)))),
    y0: Math.min(...tracks.flatMap(track => track.poly.map(([, y]) => y))),
    y1: Math.max(...tracks.flatMap(track => track.poly.map(([, y]) => y))),
    z0: Math.min(...tracks.flatMap(track => track.poly.map(([z]) => z))),
    z1: Math.max(...tracks.flatMap(track => track.poly.map(([z]) => z))),
  };
  const fill = hull.getObjectByName('hullInteriorFill');
  assert.ok(fill, 'closed hull retains its generated interior');
  const point = new THREE.Vector3();
  const positions = fill.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(fill.matrixWorld);
    const insideLane = Math.abs(point.x) > lane.x0 && Math.abs(point.x) < lane.x1
      && point.y > lane.y0 && point.y < lane.y1
      && point.z > lane.z0 && point.z < lane.z1;
    assert.equal(insideLane, false, 'interior fill leaves the complete moving track lane empty');
  }
  for (const side of [-1, 1]) {
    const wheels = hull.userData.runningGearRoadWheels(side);
    assert.ok(wheels.length >= 7, 'road wheels remain suspension-owned');
    for (const wheel of wheels) {
      near(wheel.r, .348, 'round wheel radius retained');
      const center = hull.localToWorld(new THREE.Vector3(wheel.x, wheel.y, wheel.z));
      assert.ok(Math.abs(center.x) > lane.x0 && Math.abs(center.x) < lane.x1,
        'wheel center stays inside its narrowed track lane');
    }
  }
  const tires = hull.getObjectByName('gearRoadWheelTires');
  const restTireSize = size(tires);
  const restTireMatrices = Array.from(tires.instanceMatrix.array);
  const state = createTankState(getSpec('leo2_improved'), new THREE.Vector3(), 0);
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
const source = createTank('leo2a7v', null, { proceduralOnly: true, geometryReceipt: true });
source.root.updateMatrixWorld(true);
near(getSpec('leo2a7v').dims.widthM, 4, '2A7V retains its own dimensions');
// 2026-10-10 (the netting lane, the owner's order of 2026-10-09: "a ton more netting and camo leaves" on the 2A7V): the
// field net's skirt drapes hang outside the hull; the hull's own width is measured without them
const bare = (object) => {
  const box = new THREE.Box3();
  object.updateMatrixWorld(true);
  object.traverse((o) => { if (o.isMesh && !/_ghillie_/.test(o.name)) box.expandByObject(o, true); });
  return box.getSize(new THREE.Vector3());
};
near(bare(source.root.getObjectByName('rig_hull')).x, 4.010000, '2A7V hull unchanged');
// 2026-10-21 (float-gaps 230): 3.180981 -> 3.133041. The 2A7V's right smoke bank (leopardX.ts smokeBank, a generic
// 2 x 4 grid, not source stations) stood 46-70 mm off the narrowing flank and now seats on it (P.snapGroup, -x), so the
// turret's +X extreme moves 1.576 -> 1.528; the -X shell side (-1.605) and the 4.010 hull width are unchanged.
near(bare(source.root.getObjectByName('rig_turret')).x, 3.133041, '2A7V turret unchanged');
source.dispose();
console.log('leopardImprovedHull.selftest: ok');
