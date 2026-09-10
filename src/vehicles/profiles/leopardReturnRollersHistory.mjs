// Test-only inverse of the explicitly authorized A5 return-course addition.
// Do not replace the current armor/body with a freshly constructed baseline.
import assert from 'node:assert/strict';
import {createTank} from '../tankFactory.ts';
import {KIT,registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildLeopard2A5X} from './leopardX.ts';
import {unlinedLeopard2A5TestBuilder} from './leopardUpperBandHistoryTest.mjs';

// Published 9b65f4bfa: complete pre-addition A5 running-gear inputs.
const original={style:'rubber',wheelR:.3516,wheelW:.34,
 wheelZs:[-2.25,-1.40,-.57,.28,1.06,1.86,2.70],wheelY:.44,xc:1.371,
 trackW:.648,trackTh:.0389,topY:1.24558,botY:.06726,
 trackShoeDimensions:{padHeight:.0389,grouserHeight:.01636,webHeight:.04948,
  hornHeight:.06464,pinRadius:.01636,pinCentreY:-.01945},shoeWidthScale:1.032,
 sprocket:{z:-2.91,y:.914,r:.360,trackR:.2712},
 idler:{z:3.46,y:.915,r:.273,trackR:.2471},paintedEnds:true,arms:true,coveredTop:true};
// The return path changes link count/pitch and therefore the end-wheel tooth
// hardware as well. Road wheels, suspension, body and all source fittings are
// NEVER substituted. Only these exact named factory outputs use old inputs.
const replaced=new Set(['gearTrackBandL','gearTrackBandR','gearTrackPads',
 'gearTrackPadsSimplified','gearEndWheelBody','gearEndWheelHardware']);
const added=new Set(['gearReturnRollerRotors','gearReturnRollerSpindles']);

export function withA5ReturnRollerHistory(current,quality,check){
 for(const name of added){
  const mesh=current.root.getObjectByName(name);
  assert.ok(mesh?.isInstancedMesh&&mesh.count===8,`${name}: exact admitted four-per-side assembly exists`);
  assert.equal(mesh.userData.runningGear,true);
 }
 let before,calls=0;const build=KIT.buildRunningGear,originalBandPositions=[];
 try{
  registerProfiledBuilders({leo2a5_x:unlinedLeopard2A5TestBuilder});
  KIT.buildRunningGear=(P,cfg)=>{
   assert.equal(P.spec.id,'leo2a5_x','Inverse is only authorized for this exact profile');calls++;
   const {rollers,rollerR,returnRollerWidthM,returnRollerInsetM,returnRollerGeometry,trackCarrierFromOuterFace,loopPoints,...kept}=cfg;
   assert.equal(trackCarrierFromOuterFace,true,'Only the explicit protected shoe-course addition is inverted');
   assert.ok(returnRollerGeometry?.isBufferGeometry,'Exact new physical rotor is supplied');
   // The old-input inverse does not adopt the new caller-owned buffer.
   P.disposables.push(returnRollerGeometry);
   assert.deepEqual(kept,original,'All inputs except the explicit new return assembly remain published values');
   assert.equal(rollers.length,4);assert.equal(rollerR,.095);
   assert.equal(returnRollerWidthM,.16);assert.equal(returnRollerInsetM,.18);
   assert.ok(loopPoints.length>32);
   const gear=build(P,original);
   for(const name of['gearTrackBandL','gearTrackBandR'])originalBandPositions.push([name,P.hullG.getObjectByName(name).geometry.attributes.position.array.slice()]);
   return gear;
  };
  before=createTank('leo2a5_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
 }finally{KIT.buildRunningGear=build;registerProfiledBuilders({leo2a5_x:buildLeopard2A5X});}
 try{
  assert.equal(calls,1);
  for(const[name,positions]of originalBandPositions)assert.deepEqual(before.root.getObjectByName(name).geometry.attributes.position.array,positions,
   'Original-input history has no new support frames, so it receives no inner lining');
  before.root.updateMatrixWorld(true);current.root.updateMatrixWorld(true);
  for(const name of ['rig_hull','rig_turret','rig_gun'])assert.deepEqual(
   current.root.getObjectByName(name).matrixWorld.elements,before.root.getObjectByName(name).matrixWorld.elements,
   'Reconstruction may not change the current vehicle frame');
  const old=[],counts=new Map(),currentCounts=new Map();
  before.root.traverse(o=>{if(o.isMesh&&replaced.has(o.name)){old.push(o);counts.set(o.name,(counts.get(o.name)??0)+1);}});
  current.root.traverse(o=>{if(o.isMesh&&replaced.has(o.name))currentCounts.set(o.name,(currentCounts.get(o.name)??0)+1);});
  assert.deepEqual(currentCounts,counts,'Only existing exact named factory outputs are replaced');
  assert.equal(counts.size,replaced.size);
  // This adapter reads every non-gear vertex from the actual tank. Physical
  // roof/air/contact assertions continue to receive `current`, not this view.
  return check({traverse(visitor){
   current.root.traverse(o=>{if(!replaced.has(o.name)&&!added.has(o.name))visitor(o);});
   for(const mesh of old)visitor(mesh);
  }});
 }finally{before.dispose();}
}
