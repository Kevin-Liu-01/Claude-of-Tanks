import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec,ALL_TANK_IDS} from './specs.ts';
import {smokeSocketsFor} from './vehicleAuxiliaryGeometry.ts';
import {auxiliaryCapabilities} from './auxiliaryInventory.ts';
import {requestAuxiliary} from '../sim/auxiliarySystems.ts';
import {createTankState} from '../sim/movement.ts';
import {smokeCanisterPosition} from '../sim/smokeBallistics.ts';
import {packSmokeScreen,restoreSmokeScreen} from '../sim/smokeReceipt.ts';

const ids=process.argv.includes('--all')?ALL_TANK_IDS.filter(id=>auxiliaryCapabilities({id})?.smoke.length):['kf41_lynx_x','lrmv_lynx','kf51_x','t14_x','ariete_c1_x','ariete_c2_x','griffin_viper','m1a2','leo2a4','ajax_x','borsuk','t90a_burlak','t90m','stb1','leo1a5','challenger2','merkava3d','fv510','m60a3','t14'];
let builds=0, launches=0;
const failures=[];
for(const id of ids)for(const quality of ['high','low']) {
 let visual;
 try {
 const spec=getSpec(id), kit=auxiliaryCapabilities(spec);
 assert.ok(kit?.smoke.length,`${id}: rendered smoke equipment must enable its control`);
 if(id==='kf41_lynx_x'||id==='t14')for(const socket of kit.smoke)
  assert.ok(Math.abs(Math.atan2(socket.direction[0],socket.direction[2]))<Math.PI/3,`${id}: smoke fans ahead of the turret, not sideways or behind it`);
 visual=createTank(id,null,{quality,proceduralOnly:true,decor:true,geometryReceipt:true,batchStatic:true,battleDetailLod:true});
 const sockets=[];
 visual.root.traverse(mesh=>{for(const socket of smokeSocketsFor(mesh))sockets.push({mesh,socket});});
 assert.equal(sockets.length,kit.smoke.length,`${id}/${quality}: no sockets lost during merging or decoration`);
 for(const turretYaw of [0,Math.PI/2,Math.PI]) {
  const state=createTankState(spec,new THREE.Vector3(3,0,-2),.35);
  state.turretYaw=turretYaw;state.visualPitch=.08;state.visualRoll=-.04;
  visual.syncFromState(state);visual.root.updateMatrixWorld(true);
  const actor={id,team:'player',spec,state,combat:{}};
  assert.equal(requestAuxiliary(actor,'smoke',10,()=>0),true);
  const screen=actor.combat.auxiliary.smoke, used=new Set();
  for(const {mesh,socket} of sockets){
   const p=new THREE.Vector3(...socket.position).applyMatrix4(mesh.matrixWorld);
   const d=new THREE.Vector3(...socket.direction).transformDirection(mesh.matrixWorld);
   let closest=-1,error=Infinity;
   for(let i=0;i<screen.canisters.length;i++)if(!used.has(i)){
    const shot=screen.canisters[i],distance=p.distanceTo(new THREE.Vector3(...shot.slice(0,3)));
    if(distance<error){closest=i;error=distance;}
   }
   assert.ok(error<.025,`${id}/${quality}: live mouth and launch differ by ${error.toFixed(4)}m`);
   used.add(closest);
   const shot=screen.canisters[closest],axis=new THREE.Vector3(...shot.slice(3,6)).normalize();
   // 2026-10-08: the launchers' fan law (smokeFan.ts) turns each tube's launch across its side's arc, as the real
   // launchers' tubes are set; the generated directions are the law applied to these bores (tank:controls:check)
   assert.ok(d.dot(axis)>Math.cos(75*Math.PI/180)&&axis.y>0,`${id}/${quality}: launch follows its bore through the fan law`);
   const before=smokeCanisterPosition(shot,shot[6]*.3,{});
   assert.ok((before.x-shot[0])*axis.x+(before.z-shot[2])*axis.z>0,'canister travels out along its bank');
   launches++;
  }
  const restored=restoreSmokeScreen(JSON.parse(JSON.stringify(packSmokeScreen(screen))));
  assert.equal(restored.canisters.length,kit.smoke.length,'network receives the same salvo');
  assert.equal(requestAuxiliary(actor,'smoke',11,()=>0),false,'cannot bypass smoke reload');
  assert.equal(actor.combat.auxiliary.smokeCharges,2);
 }
 // Launchers remain visible past the ordinary decorative LOD horizon.
 const distantState=createTankState(spec,new THREE.Vector3(3,0,-2),.35);
 visual.syncFromState(distantState,0,500);
 const camera=new THREE.PerspectiveCamera();camera.position.set(0,50,500);camera.updateMatrixWorld(true);
 visual.root.traverse(o=>{if(o.isLOD)o.update(camera);});
 for(const {mesh} of sockets){
  let attached=false;
  for(let owner=mesh;owner;owner=owner.parent){
   assert.notEqual(owner.visible,false,`${id}: working smoke equipment must not vanish at distance`);
   if(owner===visual.root){attached=true;break;}
  }
  assert.ok(attached,`${id}: working smoke equipment must remain attached to the rendered tank`);
 }
 builds++;
 if(process.argv.includes('--all')&&builds%40===0)console.log(`smoke fleet: ${builds}/${ids.length*2} builds passed`);
 }catch(error){failures.push({id,quality,message:error.message});console.error(id,quality,error.message);}
 finally{visual?.dispose();}
}
assert.deepEqual(failures,[],'all selected smoke-equipped vehicles must pass');
console.log(`smokeLauncherFleet: ${builds} decorated/batched HIGH/LOW builds, ${launches} actual-mouth yaw/tilt launches passed`);
