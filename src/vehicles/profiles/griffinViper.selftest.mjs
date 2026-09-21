import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { ensureInteriorFills } from '../interiorFills.ts';
import { getSpec } from '../specs.ts';
import { VIPER_MUZZLES } from '../griffinViperLayout.ts';
import { GRIFFIN_HULL_LENGTH_M, GRIFFIN_TURRET_SCALE as S } from './griffinProportions.ts';
import { createTankState } from '../../sim/movement.ts';
import { verifyFixedLauncherSeats, verifyFixedLauncherNoRecoil, fixedLauncherNegatives } from '../fixedLauncherArticulation.test-support.mjs';
const hash=a=>createHash('sha256').update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex');
const spec=getSpec('griffin_viper');
assert.equal(spec.nation,'USA');assert.equal(spec.variantOf,'griffin50_x');
assert.equal(spec.gun.reloadS,1);assert.equal(spec.gun.autoloader,undefined);
assert.equal(spec.gun.shells[0].count,64);assert(spec.gun.shells.every(s=>s.guided));
const racks=spec.armor.modules.filter(m=>m.module==='missileRack');
assert.equal(racks.length,1,'one shared launcher damage state');
assert.equal(racks[0].parts.length,16,'sixteen separately measured canister volumes');
assert(racks[0].parts.every(p=>p.max[0]<0||p.min[0]>0),'no missile damage volume crosses the central gap');
for(const filled of [false,true]) {
if(filled)await ensureInteriorFills(['griffin_viper','griffin50_x']);
for(const quality of ['high','low']){
  const options={quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false,camoSeed:4242};
  const tank=createTank(spec.id,null,options),donor=createTank('griffin50_x',null,options);
  try{
    tank.prepareForSimulation();tank.root.updateMatrixWorld(true);donor.root.updateMatrixWorld(true);
    for(const name of ['hull','hullExternalArmor','gearRoadWheelDiscs','gearTrackBandL','gearTrackBandR']){
      const a=tank.root.getObjectByName(name),b=donor.root.getObjectByName(name);
      assert(a&&b,`retained ${name}`);
      assert.equal(hash(a.geometry.attributes.position),hash(b.geometry.attributes.position),`${name} original Griffin stock`);
      if(a.isInstancedMesh)assert.equal(hash(a.instanceMatrix),hash(b.instanceMatrix),`${name} shared extended axle positions`);
    }
    assert.equal(tank.root.getObjectByName('gearRoadWheelDiscs').count,12);
    assert.equal(tank.root.getObjectByName('gearReturnRollerTires').count,8);
    const state=createTankState(spec,new T.Vector3(),0),targets=[];
    tank.root.traverse(o=>{if(o.isMesh&&!o.userData.shadowOnly&&!o.userData.authoredShadowProxy&&!o.userData.vehicleMarking)targets.push(o)});
    const gun=tank.root.getObjectByName('rig_gun');
    for(const yaw of [0,.8,Math.PI])for(const pitch of [-6,0,25]){
      state.turretYaw=yaw;state.gunPitch=pitch*Math.PI/180;tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);
      verifyFixedLauncherSeats(tank,spec);
      for(const [index,tip]of VIPER_MUZZLES.entries()){
        const actual=tank.gunMuzzleWorld(new T.Vector3(),index,true);
        assert(actual.distanceTo(gun.localToWorld(new T.Vector3(tip.x,tip.y,tip.z)))<1e-6,'physical articulated tube origin');
        const origin=gun.localToWorld(new T.Vector3(tip.x,tip.y,tip.z+.01));
        const direction=new T.Vector3(0,0,-1).transformDirection(gun.matrixWorld);
        const hit=new T.Raycaster(origin,direction,0,4).intersectObjects(targets,false)[0];
        assert(hit&&hit.distance>2.3*S&&hit.distance<2.8*S,`deep cell ${index} stays open at ${yaw}/${pitch}: ${hit?.distance}`);
      }
    }
    state.turretYaw=0;state.gunPitch=0;tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);
    verifyFixedLauncherNoRecoil(tank,spec,0);
    fixedLauncherNegatives(tank,spec);
    const bounds=new T.Box3().setFromObject(tank.root),size=bounds.getSize(new T.Vector3());
    assert(Math.abs(size.x-3.8106)<.03);assert(Math.abs(size.z-GRIFFIN_HULL_LENGTH_M)<.02);assert(Math.abs(bounds.max.y-(2.07+1.54*S))<.02);
    // A blocked mouth fails the same complete-scene witness.
    const plug=new T.Mesh(new T.BoxGeometry(.20,.20,.03),new T.MeshBasicMaterial());
    plug.position.set(VIPER_MUZZLES[0].x,VIPER_MUZZLES[0].y,1.20*S);gun.add(plug);tank.root.updateMatrixWorld(true);
    const ray=new T.Raycaster(gun.localToWorld(new T.Vector3(VIPER_MUZZLES[0].x,VIPER_MUZZLES[0].y,1.32*S+.01)),new T.Vector3(0,0,-1).transformDirection(gun.matrixWorld),0,4);
    assert(ray.intersectObjects([...targets,plug],false)[0].distance<.20,'cap negative must obstruct the true launch cell');
    plug.geometry.dispose();plug.material.dispose();plug.removeFromParent();
  }finally{tank.dispose();donor.dispose();}
}
}
console.log('Griffin Viper: exact modern donor hull/gear, 16 deep cells through 9 articulated poses, complete dimensions and cap negative PASS');
