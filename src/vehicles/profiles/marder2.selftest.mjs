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
  assert.ok(ext.z>8.86&&ext.z<9.42,`long cannon/body envelope ${ext.z}`);
  const body=root.getObjectByName('turret');body.geometry.computeBoundingBox();
  assert.ok(body.geometry.boundingBox.max.y>.88,'tall two-man TS503 turret replaces low RCT');
  const mount=root.getObjectByName('gunMount');assert.equal(mount.parent,gun);
  // The main body must stop behind the rocking mask, not fill its elevation bay.
  const opening=new Raycaster(turret.localToWorld(new Vector3(0,.54,1.30)),
    new Vector3(0,0,-1).transformDirection(turret.matrixWorld),0,1.2);
  const rear=opening.intersectObject(body)[0];assert.ok(rear,'closed rear bulkhead behind gun bay');
  assert.ok(turret.worldToLocal(rear.point.clone()).z<.23,'central bay stays open ahead of rear bulkhead');
  const hullFrame=hull.matrixWorld.clone();
  for(const yaw of [-1.15,0,.78]) for(const pitch of [-10,0,45]) {
   turret.rotation.y=yaw;gun.rotation.x=-pitch*Math.PI/180;root.updateMatrixWorld(true);
   assert.ok(hull.matrixWorld.equals(hullFrame),'hull and side grilles never rotate with turret');
   const p=new Vector3();tank.gunMuzzleWorld(p);assert.ok(p.toArray().every(Number.isFinite));
   const expected=gun.localToWorld(new Vector3(0,0,4.835));
   assert.ok(p.distanceTo(expected)<.001,'firing anchor stays on Rh503 muzzle through legal pitch/yaw');
   assert.ok(mount.getWorldPosition(new Vector3()).distanceTo(gun.getWorldPosition(new Vector3()))<.001,'mask stays on elevation pivot');
  }
  assert.ok(s.armor.crew.filter(c=>c.turretLocal).length===2,'two turret crew stations');
 } finally {tank.dispose();}
}
console.log('Marder 2: distinct seven-wheel hull and TS503 turret, real gun frame, crew, and independent roster preservation pass');
