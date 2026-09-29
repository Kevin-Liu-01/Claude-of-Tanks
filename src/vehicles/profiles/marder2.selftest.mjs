import assert from 'node:assert/strict';
import { Box3,Vector3,Raycaster } from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { synchronizeIfvReplicaCombatMetadata } from '../ifvReplicaSpecs.ts';
import { synchronizeSuppliedSourceCombatMetadata } from '../suppliedSourceFleetSpecs.ts';
import { censusEquipment } from '../../../tools/source-equipment-policy.mjs';
import { ensureInteriorFills } from '../interiorFills.ts';

const id='marder2',s=getSpec(id);
assert.equal(s.name,'Marder 2');assert.equal(tankTier(id),10);
assert.equal(s.gun.caliberMm,50);assert.equal(s.gun.shells.some(r=>r.guided),false);
assert.equal(s.gun.launcherMuzzles,undefined);
const independent=['spz_puma_s1','spz_puma_s1_x','kurganets25_x','borsuk'];
const tuning=new Map(independent.map(id=>[id,JSON.stringify(getSpec(id).gun)]));
for(let i=0;i<2;i++){synchronizeIfvReplicaCombatMetadata();synchronizeSuppliedSourceCombatMetadata();}
for(const [id,before]of tuning)assert.equal(JSON.stringify(getSpec(id).gun),before,`${id}: independent Marder registration never replaces an existing weapon`);
await ensureInteriorFills([id]);
for(const quality of ['high','low']) {
 const tank=createTank(id,null,{proceduralOnly:true,quality,geometryReceipt:true,batchStatic:false,decor:false});
 try {
  tank.root.updateMatrixWorld(true);
  const root=tank.root,hull=root.getObjectByName('rig_hull'),turret=root.getObjectByName('rig_turret'),gun=root.getObjectByName('rig_gun');
  const wheels=root.getObjectByName('gearRoadWheelTires');
  assert.equal(wheels.count,14,'seven physical wheels per side');
  assert.equal(censusEquipment(root).mg,0,'coax remains part of gun; no invented roof weapon');
  assert.equal(root.getObjectByName('rig_launcher_tip_0'),undefined);
  const ext=new Box3().setFromObject(root,true).getSize(new Vector3());
  assert.ok(ext.x>3.70&&ext.x<3.97,`full skirt width ${ext.x}`);
  assert.ok(ext.z>8.43&&ext.z<8.81,`long cannon/body envelope ${ext.z}`);
  const body=root.getObjectByName('turret');body.geometry.computeBoundingBox();
  const turretBox=body.geometry.boundingBox;
  assert.ok(Math.abs(turretBox.max.y-.81)<.00001,'turret crown reduced from .90 m to .81 m');
  assert.ok(Math.abs(turretBox.max.x-1.008)<.00001,'turret half-width reduced from 1.12 m to 1.008 m');
  assert.ok(Math.abs(turretBox.min.z+1.395)<.00001,'turret bustle reduced from 1.55 m to 1.395 m');
  assert.deepEqual(s.armor.turretPivot,[0,2.02,-.48],'bearing location is unchanged');
  for(const owner of [hull,turret,gun]) assert.deepEqual(owner.scale.toArray(),[1,1,1],'canonical owner rigs stay unit scale');
  const mount=root.getObjectByName('gunMount');assert.equal(mount.parent,gun);
  // The main body must stop behind the rocking mask, not fill its elevation bay.
  const opening=new Raycaster(turret.localToWorld(new Vector3(0,.486,1.17)),
    new Vector3(0,0,-1).transformDirection(turret.matrixWorld),0,1.2);
  const rear=opening.intersectObject(body)[0];assert.ok(rear,'closed rear bulkhead behind gun bay');
  assert.ok(turret.worldToLocal(rear.point.clone()).z<.207,'central bay stays open ahead of rear bulkhead');
  // Regression for the first draft's sloped tub, front lamp boxes and rear
  // flaps crossing the belt. Probe the actual chassis stock in the shoe corridor.
  const chassis=['hull','hullDetail','hullRubber'].map(name=>root.getObjectByName(name)).filter(Boolean);
  for(const side of [-1,1]) for(const x of [1.25,1.47,1.69]) for(const z of [-3.50,-3.25,-2,0,2,3.2,3.4]) {
    const start=hull.localToWorld(new Vector3(side*x,.20,z));
    const ray=new Raycaster(start,new Vector3(0,1,0),0,1.13);
    assert.equal(ray.intersectObjects(chassis,false).length,0,`${quality}: clear track tunnel at ${side*x}/${z}`);
  }
  const hullFrame=hull.matrixWorld.clone();
  for(const yaw of [-1.15,0,.78]) for(const pitch of [-10,0,45]) {
   turret.rotation.y=yaw;gun.rotation.x=-pitch*Math.PI/180;root.updateMatrixWorld(true);
   assert.ok(hull.matrixWorld.equals(hullFrame),'hull and side grilles never rotate with turret');
   const p=new Vector3();tank.gunMuzzleWorld(p);assert.ok(p.toArray().every(Number.isFinite));
   const expected=gun.localToWorld(new Vector3(0,0,4.3515));
   assert.ok(p.distanceTo(expected)<.001,'firing anchor stays on Rh503 muzzle through legal pitch/yaw');
   assert.ok(mount.getWorldPosition(new Vector3()).distanceTo(gun.getWorldPosition(new Vector3()))<.001,'mask stays on elevation pivot');
  }
  assert.ok(s.armor.crew.filter(c=>c.turretLocal).length===2,'two turret crew stations');
 } finally {tank.dispose();}
}
console.log('Marder 2: distinct seven-wheel hull and TS503 turret, real gun frame, crew, and independent roster preservation pass');
