import assert from 'node:assert/strict';
import * as THREE from 'three';
import { addCombatHitboxes, createCombatFrames } from './combatHitboxes.ts';
const root = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group();
root.add(turret); turret.add(gun); turret.position.set(0, 2, 0); gun.position.set(0, 0, 1);
const resources = [], pickables = [];
const armor = {
  modules: [
    {module:'engine',min:[-9,-9,-9],max:[9,9,9], shapes:[{kind:'ellipsoid',center:[1,2,3],radii:[2,1,3]}]},
    ...[0,1,2].map(axis => ({module:'ammoRack',min:[-9,-9,-9],max:[9,9,9], shapes:[{kind:'ellipticCylinder',axis,center:[0,0,0],radii:[2,3],halfLength:4}]})),
    {module:'gun',gunFollow:true,turretLocal:true,min:[-9,-9,-9],max:[9,9,9],shapes:[{kind:'capsule',a:[0,0,0],b:[0,0,4],radius:1}]},
    {module:'fuelTank',turretLocal:true,min:[-9,-9,-9],max:[9,9,9],parts:[{min:[-3,0,0],max:[-2,1,1]},{min:[2,0,0],max:[3,1,1]}]},
    {module:'trackL',min:[-9,-9,-9],max:[9,9,9]},
  ],
  trackShapes:[{module:'trackL',x0:-3,x1:-2,poly:[[0,-4],[1,-3],[1,3],[0,4]]}],
};
addCombatHitboxes('modules', armor, root, turret, gun, resources, pickables);
assert.equal(pickables.length,8,'compound shapes replace broad enclosing boxes, including tracks');
function bounds(mesh) { mesh.geometry.computeBoundingBox(); return mesh.geometry.boundingBox; }
function near(a,b) { assert.ok(Math.abs(a-b)<.015,`${a} ≈ ${b}`); }
const sphere = bounds(pickables[0]); sphere.min.toArray().forEach((v,i)=>near(v,[-1,1,0][i]));
sphere.max.toArray().forEach((v,i)=>near(v,[3,3,6][i]));
for(let axis=0;axis<3;axis++) {
 const b=bounds(pickables[axis+1]), ext=b.getSize(new THREE.Vector3()).toArray();
 const expected = axis===0?[8,4,6]:axis===1?[4,8,6]:[4,6,8];
 ext.forEach((v,i)=>near(v,expected[i]));
}
const capsule = bounds(pickables[4]); near(capsule.min.z,-1);near(capsule.max.z,5);
assert.equal(pickables[4].parent,gun,'gun-follow stock owns the pitching frame');
assert.equal(pickables[5].parent,turret,'turret volumes follow articulation');
assert.equal(pickables.filter(p=>p.userData.inspection.module==='trackL').length,1,'no old padded track AABB');
const track=bounds(pickables[7]); assert.deepEqual(track.min.toArray(),[-3,0,-4]);assert.deepEqual(track.max.toArray(),[-2,1,4]);
turret.rotation.y=Math.PI/2;gun.rotation.x=-.2;root.updateMatrixWorld(true);
assert.ok(pickables.every(mesh=>new THREE.Box3().setFromObject(mesh).min.toArray().every(Number.isFinite)));
for(const resource of resources)resource.dispose();
console.log('combatHitboxes: ellipsoid/cylinder/capsule, compound stock, exact track prism and articulation PASS');

// Presentation scales must not expand canonical combat volumes or trunnion offsets.
const vehicle = new THREE.Group(), rig = new THREE.Group(), gunRig = new THREE.Group();
rig.name = 'rig_turret'; gunRig.name = 'rig_gun'; vehicle.add(rig); rig.add(gunRig);
rig.scale.set(2, 3, 4); gunRig.scale.set(3, 2, 2);
rig.rotation.y = .7; gunRig.rotation.x = -.3;
const frames = createCombatFrames(vehicle, {turretPivot:[0,2,1], gunPivot:[0,.5,2]});
vehicle.updateMatrixWorld(true);
const expected = new THREE.Vector3(1,0,4).sub(new THREE.Vector3(0,.5,2))
  .applyAxisAngle(new THREE.Vector3(1,0,0),-.3).add(new THREE.Vector3(0,.5,2))
  .applyAxisAngle(new THREE.Vector3(0,1,0),.7).add(new THREE.Vector3(0,2,1));
assert.ok(new THREE.Vector3(1,0,4).applyMatrix4(frames.gun.matrixWorld).distanceTo(expected)<1e-8);
assert.ok(frames.turret.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))<1e-8);
rig.rotation.y = -.4; frames.update(); assert.equal(frames.turret.rotation.y,-.4);
frames.hull.removeFromParent();
console.log('combatHitboxes: canonical frames ignore presentation scales and follow articulation PASS');
