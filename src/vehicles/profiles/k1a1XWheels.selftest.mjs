import assert from 'node:assert/strict';
import {createHash}from 'node:crypto';
import * as T from 'three';
import {createTank,KIT}from '../tankFactory.ts';
import {auditTankWheelQuality}from '../wheelQuality.ts';
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs ${b}`);
const names=['k1SourceWheelFacesL','k1SourceWheelFacesR'];
function build(quality,legacy=false){
 const old=KIT.buildRunningGear;let gear;
 KIT.buildRunningGear=(port,input)=>{const cfg={...input};if(legacy){cfg.wheelCoreGeometry.disc.dispose();for(const layer of cfg.wheelFaceLayers)layer.geometry.dispose();delete cfg.wheelCoreGeometry;delete cfg.wheelFaceLayers;delete cfg.wheelTireInnerRadiusM;}return gear=old(port,cfg);};
 try{const tank=createTank('k1a1_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});tank.root.updateMatrixWorld(true);return{tank,gear};}finally{KIT.buildRunningGear=old;}
}
function unchanged(root){
 const h=createHash('sha256');root.traverse(m=>{
  if(!m.isMesh||m.name.startsWith('procShadow_')||m.userData.vehicleMarking)return;
  if([...names,'gearRoadWheelTires','gearRoadWheelDiscs','gearRoadWheelInsets','gearSuspensionLinks','gearSuspensionJointBosses'].includes(m.name))return;
  h.update(m.name).update(JSON.stringify(m.matrixWorld.elements));
  for(const key of Object.keys(m.geometry.attributes).sort()){const a=m.geometry.attributes[key].array;h.update(key).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
  for(const a of [m.geometry.index?.array,m.instanceMatrix?.array])if(a)h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
 });return h.digest('hex');
}
function meshes(root){const all=[];root.traverse(m=>{if(m.isMesh&&!m.name.startsWith('procShadow_')&&!m.userData.vehicleMarking)all.push(m);});return all;}
const sourceRows=[[.025,1.50723296],[.05,1.50031671],[.065,1.48656667],[.08,1.43735175],
 [.10,1.39538119],[.15,1.39702179],[.20,1.40047140],[.25,1.40598663],[.275,1.49047161],[.29,1.50920727]];
// 2026-09-12 fleet visual standard: the rubber tire runs in to .2700 (the
// source opening was .2971), so the two rolled-rim rows now sit under the
// tire. The source dish is still built unchanged beneath the rubber: those
// rows are witnessed through the tire and the rubber must be the first surface.
const TIRE_INNER_R=.2700;
function sourceWitnesses(root){
 const all=meshes(root);
 // Held-out whole-source first surfaces at the third axle, independently
 // measured on both mirrored source nodes. Not rings fed into the builder.
 for(const side of [-1,1])for(const[r,x]of sourceRows){const origin=new T.Vector3(side*1.6376,.3978-r,-.4408),direction=new T.Vector3(-side,0,0);
  const face=root.getObjectByName(names[side<0?0:1]);
  if(r>TIRE_INNER_R){
   const first=new T.Raycaster(origin,direction,0,.8).intersectObjects(all,false)[0];
   assert.equal(first?.object.name,'gearRoadWheelTires','fleet-standard rubber is the first surface over the rolled rim');
   const dish=new T.Raycaster(origin,direction,0,.8).intersectObject(face,false)[0];
   near(Math.abs(dish.point.x),x,.0006,'source-held-out rolled-rim surface is retained beneath the rubber');
   continue;
  }
  const hit=new T.Raycaster(origin,direction,0,.8).intersectObjects(all,false)[0];
  assert.equal(hit?.object.name,names[side<0?0:1],'literal steel dish is exposed before all other scene surfaces');
  near(Math.abs(hit.point.x),x,.0006,'source-held-out hub/bowl/rolled-rim surface');
  assert.equal(new T.Raycaster(origin,direction,0,1.6376-x-.002).intersectObjects(all,false)[0],undefined,'source approach space is genuinely empty');
 }
}
function movingFaces(root){
 const all=meshes(root),tires=root.getObjectByName('gearRoadWheelTires');
 for(const side of [-1,1]){const face=root.getObjectByName(names[side<0?0:1]);assert.equal(face.count,6);
  for(let i=0;i<6;i++){const matrix=new T.Matrix4();face.getMatrixAt(i,matrix);const tireFrames=[];
   for(let k=0;k<tires.count;k++){const m=new T.Matrix4();tires.getMatrixAt(k,m);if(m.equals(matrix))tireFrames.push(k);}
   assert.equal(tireFrames.length,1,'one native tire owns the exact same moving instance frame');
   matrix.premultiply(face.matrixWorld);const direction=new T.Vector3(-side,0,0).transformDirection(matrix);
   for(let k=0;k<8;k++){const theta=k*Math.PI/4+Math.PI/48,r=.15*Math.cos(Math.PI/48);
    const origin=new T.Vector3(side*.30,r*Math.cos(theta),r*Math.sin(theta)).applyMatrix4(matrix);
    const hit=new T.Raycaster(origin,direction,0,.4).intersectObjects(all,false)[0];assert.equal(hit?.object.name,face.name);
    near(hit.distance,.30-(.0545+.0058*.15/.1789),3e-6,'analytic bowl depth follows physical wheel spin');
   }
  }
 }
 assert.deepEqual(auditTankWheelQuality(root).issues,[],'actual native arms remain clear');
}
for(const quality of ['high','low']){
 const before=build(quality,true),after=build(quality);
 try{
  assert.equal(unchanged(before.tank.root),unchanged(after.tank.root),'all non-wheel buffers, end drums and course are unchanged');
  assert.deepEqual(after.gear.roadWheelLayout,before.gear.roadWheelLayout,'all axle datums remain fixed');
  sourceWitnesses(after.tank.root);movingFaces(after.tank.root);
  for(const[l,r]of [[.17,-.29],[.65,.21]]){before.gear.update(l,r,0);after.gear.update(l,r,0);before.tank.root.updateMatrixWorld(true);after.tank.root.updateMatrixWorld(true);movingFaces(after.tank.root);assert.equal(unchanged(before.tank.root),unchanged(after.tank.root),'track/end-wheel motion unchanged');}
  after.tank.root.rotation.y=.43;after.tank.root.position.set(2,.3,-1);after.tank.root.updateMatrixWorld(true);movingFaces(after.tank.root);
  const geo=new Set([...names,'gearRoadWheelDiscs','gearRoadWheelTires'].map(n=>after.tank.root.getObjectByName(n).geometry)),disposed=new Set();for(const g of geo)g.addEventListener('dispose',()=>disposed.add(g));
  after.tank.dispose();after.tank=null;assert.equal(disposed.size,geo.size,'owned wheel buffers disposed');
 }finally{before.tank.dispose();after.tank?.dispose();}
}
console.log('K1A1 X wheels: high/low source hub/bowl/rim witnesses, real air, native motion, strict clearance and non-wheel preservation pass');
