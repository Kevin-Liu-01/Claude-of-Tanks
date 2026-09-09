import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT,registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildLeopard2A7VX} from './leopardX.ts';
import {buildLeopardRevolution} from './leopardRevolution.ts';
import {auditTankWheelQuality} from '../wheelQuality.ts';
import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {leopardReturnRollers} from './leopardReturnRollers.ts';
import {matrix,finiteClearance,continuousShoeClearance,moving} from '../returnRollerPhysicsTest.mjs';
import {auditVisibleReturnRollerContact} from '../returnRollerContactTest.mjs';

const cases=[['leo2a7v_x',buildLeopard2A7VX],['leo2_revolution',buildLeopardRevolution]];
const requested=process.argv[2];
if(requested&&!cases.some(([id])=>id===requested))throw new Error('Unknown exact roller target');
const selected=requested?cases.filter(([id])=>id===requested):cases;
// Exact missing-roller gear inputs retained in published 508bb19b0.
const ORIGINAL={
 leo2a7v_x:{style:'rubber',wheelR:.375,wheelW:.37,wheelZs:[-2.38,-1.57,-.76,.05,.86,1.67,2.48],wheelY:.46,xc:1.48,
  trackW:.66,trackTh:.074,topY:1.32,botY:.105,sprocket:{z:-3.120,y:.9647,r:.3813},idler:{z:3.247,y:.9063,r:.2785},paintedEnds:true,arms:true,coveredTop:true},
 leo2_revolution:{style:'rubber',wheelR:.3305,wheelW:.35,wheelZs:[-2.211,-1.471,-.663,.092,.828,1.588,2.386],wheelY:.421,xc:1.312,
  trackW:.535,trackTh:.072,sprocket:{z:-2.7783,y:.836,r:.3514},idler:{z:3.202,y:.809,r:.2777},topY:1.157,botY:.048,paintedEnds:true,arms:true,coveredTop:true},
};
const stats={builds:0,rollers:0,poses:0,negativeControls:0,rows:[]};
const hash=g=>{const h=createHash('sha256');for(const key of Object.keys(g.attributes).sort()){
 const a=g.attributes[key];h.update(key);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
 }if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');};
function capture(id,build,quality,old){
 let port,cfg,gear;const emissions=[],original=KIT.buildRunningGear,originalBandPositions=[];
 KIT.buildRunningGear=(p,input)=>{
  const {rollers,rollerR,returnRollerWidthM,returnRollerInsetM,returnRollerGeometry,trackCarrierFromOuterFace,loopPoints,...retained}=input;
  assert.equal(trackCarrierFromOuterFace,undefined,'Neither priority model needs band lining');
  if(old)p.disposables.push(returnRollerGeometry); // Test inverse never adopts this caller-owned new buffer.
  assert.deepEqual(retained,ORIGINAL[id],'Every pre-existing gear input remains exact');
  cfg=old?retained:input;gear=original(p,cfg);
  if(old)for(const name of['gearTrackBandL','gearTrackBandR'])originalBandPositions.push([name,p.hullG.getObjectByName(name).geometry.attributes.position.array.slice()]);
  return gear;
 };
 registerProfiledBuilders({[id]:P=>{port=P;build(new Proxy(P,{get(target,key){
  if(!['add','addEquipment','addMudguard'].includes(key))return Reflect.get(target,key);
  return(...args)=>{
   const at=key==='addMudguard'?1:0,g=args[at+1],transform=args.slice(at+2);
   const geometry=KIT.xform(g.clone(),...transform);emissions.push([key,at?args[0]:null,args[at],hash(geometry)]);geometry.dispose();
   return target[key](...args);
  };
 }}));
 if(old){
  for(const[name,positions]of originalBandPositions)assert.deepEqual(P.hullG.getObjectByName(name).geometry.attributes.position.array,positions,
   'Original-input control has no added support frames and receives no lining');
  const mounts=P.hullG.getObjectByName('gearReturnRollerSpindles');assert.equal(mounts.count,8);mounts.removeFromParent();mounts.dispose();
 }
 }});
 try{
  const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  tank.root.updateMatrixWorld(true);stats.builds++;
  return{tank,port,cfg,gear,emissions,receipt:port.hullG.userData.runningGearReceipts[0],dispose(){tank.dispose();}};
 }finally{KIT.buildRunningGear=original;registerProfiledBuilders({[id]:build});}
}
function body(root){const out=[];root.traverse(o=>{
 if(!o.geometry||! /^(hull|turret|gun)/.test(o.name))return;
 out.push([o.name,hash(o.geometry),o.material.name,o.matrix.elements,o.parent?.name]);
});return out;}
function rollerBounds(c){
 const tire=c.port.hullG.getObjectByName('gearReturnRollerRotors');
 assert.equal(tire.count,8);assert.deepEqual(tire.material,[c.port.mats.rubber,c.port.mats.wheels]);
 assert.equal(tire.userData.appearanceRole,undefined);assert.equal(tire.visible,true);
 assert.equal(c.port.hullG.getObjectByName('gearReturnRollerTires'),undefined);
 assert.equal(c.port.hullG.getObjectByName('gearReturnRollerDiscs'),undefined);
 const bounds=[];
 for(let i=0;i<8;i++){
  const m=matrix(tire,i,c.port.hullG),center=new T.Vector3().setFromMatrixPosition(m),box=new T.Box3();let radius=0;
  for(const mesh of[tire]){const p=mesh.geometry.attributes.position,own=matrix(mesh,i,c.port.hullG);
   for(let j=0;j<p.count;j++){const v=new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(own);box.expandByPoint(v);radius=Math.max(radius,Math.hypot(v.y-center.y,v.z-center.z));}}
  assert.ok(Math.abs(radius-.095)<2e-7,'Actual emitted radius, not entry.r metadata');
  assert.ok(Math.abs(box.max.x-box.min.x-.16)<2e-7);
  assert.ok(Math.abs(Math.abs(center.x)-(c.cfg.xc-.18))<2e-7);
  bounds.push({center,minX:box.min.x,maxX:box.max.x,r:radius});
 }
 assert.equal(bounds.filter(b=>b.center.x<0).length,4);assert.equal(bounds.filter(b=>b.center.x>0).length,4);
 stats.rollers+=8;return bounds;
}
const material=new T.MeshBasicMaterial({side:T.DoubleSide});
function mounts(c,bounds){
 const skin=new T.Mesh(c.port.hullG.getObjectByName('hull').geometry,material);
 const mesh=c.port.hullG.getObjectByName('gearReturnRollerSpindles');
 assert.equal(mesh.count,8);assert.equal(mesh.geometry.parameters.radiusTop,.027);
 assert.equal(mesh.geometry.parameters.radialSegments,c.port.q?8:4);assert.equal(mesh.geometry.parameters.openEnded,false);
 assert.equal(mesh.material,c.port.mats.wheels);assert.equal(mesh.userData.runningGear,true);
 assert.equal(mesh.parent,c.port.hullG,'Mounts share the roller assembly owner, not a disposable detail LOD');
 for(const [i,b]of bounds.entries()){
  const g=mesh.geometry.clone().applyMatrix4(matrix(mesh,i,c.port.hullG));g.computeBoundingBox();const box=g.boundingBox,side=Math.sign(b.center.x);g.dispose();
  assert.ok(Math.abs((side>0?box.min.x:-box.max.x)-.965)<2e-7,'Exact finite hull-side spindle root');
  assert.ok(box.min.x<b.center.x&&box.max.x>b.center.x,'Spindle crosses finite hub interior');
  for(const [dy,dz]of[[0,0],[.008,0],[-.008,0],[0,.008],[0,-.008]]){
   const ray=new T.Raycaster(new T.Vector3(side*1.1,b.center.y+dy,b.center.z+dz),new T.Vector3(-side,0,0));
   const hit=ray.intersectObject(skin,false).find(h=>Math.abs(h.point.x)<1.02);
   assert.ok(hit,'Finite old hull receiving face exists');
   assert.ok(side>0?hit.point.x-box.min.x>.025:box.max.x-hit.point.x>.025,'More than 25 mm spindle/hull lap');
  }
 }
}
for(const [id,build]of selected)for(const quality of['high','low']){
 const old=capture(id,build,quality,true),current=capture(id,build,quality,false);
 try{
  assert.equal(old.port.hullG.getObjectByName('gearReturnRollerTires'),undefined,'Original missing-roller witness');
  assert.deepEqual(current.emissions,old.emissions,'Every pre-existing authored emission is byte-identical');
  assert.deepEqual(body(current.tank.root),body(old.tank.root),'Actual hull/turret/gun armor, finish and rig stay exact');
  for(const name of['rig_hull','rig_turret','rig_gun'])assert.deepEqual(current.tank.root.getObjectByName(name).matrixWorld.elements,
   old.tank.root.getObjectByName(name).matrixWorld.elements,'Original normalized hull/turret/gun datums');
  for(const key of['wheelZs','wheelR','wheelY','sprocket','idler','botY','trackW','trackTh'])assert.deepEqual(current.receipt[key],old.receipt[key]);
  for(const name of['gearRoadWheelTires','gearRoadWheelDiscs','gearRoadWheelInsets','gearSuspensionLinks','gearSuspensionJointBosses']){
   const a=current.port.hullG.getObjectByName(name),b=old.port.hullG.getObjectByName(name);
   assert.equal(hash(a.geometry),hash(b.geometry));assert.deepEqual(a.instanceMatrix.array,b.instanceMatrix.array);
  }
  const lower=c=>c.receipt.loopPoints.slice(c.receipt.loopPoints.findIndex(([z])=>z>c.cfg.idler.z+1e-7));
  assert.deepEqual(lower(current),lower(old),'Existing lower contact/run and lower end arcs retained');
  for(let i=0;i<current.receipt.loopPoints.length;i++){
   const a=current.receipt.loopPoints[i],b=current.receipt.loopPoints[(i+1)%current.receipt.loopPoints.length];
   assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-7,'No zero-length carrier cell');
  }
  assert.deepEqual(auditTankWheelQuality(current.tank.root).issues,[]);
  const bounds=rollerBounds(current);mounts(current,bounds);
  const continuous=continuousShoeClearance(current,bounds);
  const motion=moving(current,bounds),clearance=motion.minimum;stats.poses+=motion.poses;
  current.gear.resetPose();
  const contact=auditVisibleReturnRollerContact(current.tank,current.gear,createTankState(getSpec(id),new T.Vector3(),0),{radiusM:.095});
  const rotor=current.port.hullG.getObjectByName('gearReturnRollerRotors'),shaft=current.port.hullG.getObjectByName('gearReturnRollerSpindles');
  const triangles=mesh=>(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;
  const complete=triangles(rotor)+triangles(shaft),budget=quality==='high'?160:80;
  assert.equal(complete,budget);assert.equal(triangles(rotor)*rotor.count+triangles(shaft)*shaft.count,budget*8);
  stats.rows.push({id,quality,minimumTrackClearanceM:clearance,roadMinimum:motion.roadMinimum,strokes:motion.strokes,continuousShoeClearanceM:continuous,
   completeRollerTriangles:complete,instanceExpandedRollerTriangles:complete*8,
   contact:contact.map(r=>({distance:r.distance,gapM:r.maximumVisibleSupportGapM,shoeOnlyGapM:r.shoeOnlyMaximumGapM,contact:r.contact}))});
  assert.ok(contact.every(row=>row.contact==='PASS'),`${id}/${quality}: actual rendered support gap exceeds 6 mm`);
  console.log(JSON.stringify(stats.rows.at(-1)));
  assert.ok(Number.isFinite(clearance),'Actual finite stock was checked, not an empty collider set');
  assert.ok(clearance<.0001,'The finite rollers meet a real band/web support surface, not floating below it');
  assert.ok(clearance>=-2e-6,`${id}/${quality}: actual band + near/far shoes penetrate rollers by ${-clearance} m`);
  const bad=bounds.map(b=>({...b,center:b.center.clone().add(new T.Vector3(0,.07,0))}));
  current.gear.resetPose();current.gear.update(0,0);current.tank.root.updateMatrixWorld(true);
  const band=current.port.hullG.getObjectByName('gearTrackBandL');
  assert.ok(finiteClearance(band,matrix(band,0,current.port.hullG),bad)<-.025,'Raised-roller negative control intersects real carrier');stats.negativeControls++;
 }finally{old.dispose();current.dispose();}
 // Real batched battle presentation, not just calling the distance API on
 // an inspection build which has no installed far-detail groups.
 const battle=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:true,battleDetailLod:true,camoSeed:4242});stats.builds++;
 let disposedGeometry=0,disposedInstances=0,disposedRotors=0,disposedRotorInstances=0;
 const shaft=battle.root.getObjectByName('gearReturnRollerSpindles');
 shaft.geometry.addEventListener('dispose',()=>disposedGeometry++);shaft.addEventListener('dispose',()=>disposedInstances++);
 const rotor=battle.root.getObjectByName('gearReturnRollerRotors');
 rotor.geometry.addEventListener('dispose',()=>disposedRotors++);rotor.addEventListener('dispose',()=>disposedRotorInstances++);
 try{
  if(quality==='high')assert.ok(battle.root.userData.battleDetailGroupCount>0,'Actual HIGH battle detail groups installed');
  const state=createTankState(getSpec(id),new T.Vector3(),0);
  for(const distance of[150,300,15]){
   battle.syncFromState(state,1/60,distance);
   for(const name of['gearReturnRollerRotors','gearReturnRollerSpindles']){
    const mesh=battle.root.getObjectByName(name);assert.ok(mesh,`${name} remains attached at ${distance} m`);
    let owner=mesh;while(owner){assert.equal(owner.visible,true,`${name} stays visible at actual battle LOD`);owner=owner.parent;}
   }
  }
 }finally{battle.dispose();}
 assert.equal(disposedGeometry,1,'Owned shared spindle geometry disposed exactly once');
 assert.equal(disposedInstances,1,'Owned instanced spindle buffer disposed exactly once');
 assert.equal(disposedRotors,1);assert.equal(disposedRotorInstances,1);
}
for(const quality of['high','low']){
 const control=createTank('leo2a6m_x',null,{quality,proceduralOnly:true,geometryReceipt:true});stats.builds++;
 try{
  assert.equal(control.root.getObjectByName('gearReturnRollerTires').count,8,'Existing A6M rollers retained');
  assert.equal(control.root.getObjectByName('gearReturnRollerSpindles'),undefined,'No blanket A6M opt-in or station donor');
 }finally{control.dispose();}
 const rollerless=createTank('t62mv1_x',null,{quality,proceduralOnly:true,geometryReceipt:true});stats.builds++;
 try{
  for(const name of['gearReturnRollerRotors','gearReturnRollerTires','gearReturnRollerDiscs','gearReturnRollerSpindles'])
   assert.equal(rollerless.root.getObjectByName(name),undefined,'FM100-2-3: T-62 remains a real rollerless vehicle');
 }finally{rollerless.dispose();}
}
for(const stations of[[],[-2,-1,1],[-2,1,1,2],[-2,0,NaN,2],[-4,-1,1,2]]){
 assert.throws(()=>leopardReturnRollers({},ORIGINAL.leo2a7v_x,stations),/four ordered stations/);stats.negativeControls++;
}
for(const root of[0,NaN,1.4]){
 assert.throws(()=>leopardReturnRollers({},ORIGINAL.leo2a7v_x,[-2,-.4,1,2],0,root),/positive finite root/);stats.negativeControls++;
}
material.dispose();
console.log('leopardReturnRollers: '+JSON.stringify(stats));
