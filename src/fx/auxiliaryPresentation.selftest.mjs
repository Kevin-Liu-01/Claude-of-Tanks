import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAuxiliaryPresentation } from './auxiliaryPresentation.ts';
import { requestAuxiliary } from '../sim/auxiliarySystems.ts';
import { packSmokeScreen } from '../sim/smokeReceipt.ts';
import { smokeCanisterPosition } from '../sim/smokeBallistics.ts';
const tank={id:'player',team:'player',spec:{id:'m1a3',dims:{heightM:2.6},armor:{turretPivot:[0,1.5,0]}},state:{pos:{x:0,y:0,z:0},yaw:0,turretYaw:.5},combat:{}};
requestAuxiliary(tank,'smoke',10,()=>0);
const screen=tank.combat.auxiliary.smoke;
const parent=new THREE.Group();let time=10.3,puffs=[];
const fx=createAuxiliaryPresentation(parent,{entities:()=>[],time:()=>time,ground:()=>0,report(){},flash(){},smoke(p,scale,density,life,wind){puffs.push({p:p.clone(),scale,density,life,wind});}});
const grenades=parent.getObjectByName('auxiliarySmokeCanisters');
fx.setNetworkScreens([JSON.parse(JSON.stringify(packSmokeScreen(screen)))]);fx.update();
assert.equal(grenades.count,screen.canisters.length,'late snapshot shows every in-flight canister, even without a visible emitter');
const matrix=new THREE.Matrix4(),position=new THREE.Vector3();
for(let i=0;i<grenades.count;i++){
 grenades.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
 const expected=smokeCanisterPosition(screen.canisters[i],.3,{});
 assert.ok(position.distanceTo(new THREE.Vector3(expected.x,expected.y,expected.z))<.025);
}
assert.ok(puffs.length>0&&puffs.every(p=>!p.wind),'in-flight trails without premature bank smoke');
const previous=grenades.instanceMatrix.array.slice();fx.update();
assert.deepEqual(grenades.instanceMatrix.array,previous,'paused match clock freezes the arc');
time=14;puffs=[];fx.update();assert.equal(grenades.count,0,'landed canisters retire');
assert.ok(puffs.some(p=>p.wind&&p.density>.9),'bank smoke grows at receipt landing positions');
fx.setNetworkScreens(Array.from({length:100},()=>screen));time=10.4;fx.update();assert.equal(grenades.count,256,'flight draw has a hard capacity');
fx.reset();assert.equal(grenades.count,0,'reset clears old launches');
fx.update();assert.equal(grenades.count,0,'old network screens cannot survive rematch');
for(const object of parent.children){object.geometry?.dispose();object.material?.dispose();}
console.log('auxiliaryPresentation: visible flight, delayed snapshot parity, trails, clouds, pause, bounds and reset passed');
