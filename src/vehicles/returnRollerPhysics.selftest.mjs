import assert from 'node:assert/strict';
import * as T from 'three';
import {KIT} from './tankFactoryCore.ts';
import {matrix,rollerSuspensionFixtures} from './returnRollerPhysicsTest.mjs';

let poses=0,negatives=0;
for(const mode of['default','hydraulic','override']){
 const material=new T.MeshStandardMaterial(),mats=Object.fromEntries(
  ['hull','detail','dark','shadow','trackLink','spareTrack','burnt','trackL','trackR','wheels','rubber'].map(k=>[k,material]));
 Object.assign(mats,{trackTexL:new T.Texture(),trackTexR:new T.Texture()});
 const hullG=new T.Group();hullG.position.y=.19;hullG.scale.y=1.1;
 const P={spec:{id:'m1a2',...(mode!=='default'?{hydropneumaticAim:{compressionM:.36,droopM:.17}}:{})},
  disposables:[],mats,hullG,geometryReceipt:true,q:false,batchStatic:false,add(){}};
 const cfg={wheelR:.4,wheelW:.3,wheelZs:[-1,0,1],wheelY:.5,xc:1.3,
  sprocket:{z:-2,y:.7,r:.3},idler:{z:2,y:.7,r:.3},trackW:.5,trackTh:.06,topY:1,
  ...(mode==='override'?{suspensionCompressionM:.24,suspensionDroopM:.12}:{})};
 const gear=KIT.buildRunningGear(P,cfg),c={port:P,cfg,gear},roads=hullG.getObjectByName('gearRoadWheelTires');
 const read=()=>{hullG.updateMatrixWorld(true);return Array.from({length:roads.count},(_,i)=>new T.Vector3().setFromMatrixPosition(matrix(roads,i,hullG)).y);};
 const settle=sample=>{gear.resetPose();for(let i=0;i<180;i++)gear.conform({pos:new T.Vector3(),yaw:0,visualPitch:0,visualRoll:0},sample,0,0,1/60);gear.update(0,0);};
 try{
  gear.resetPose();const rest=read(),expected=mode==='default'?[.30,.22]:mode==='hydraulic'?[.36,.17]:[.24,.12];
  const fixtures=rollerSuspensionFixtures(c);
  assert.equal(fixtures[1].targetM,expected[0]);assert.equal(fixtures[2].targetM,-expected[1]);
  for(const {targetM,sample}of fixtures.slice(0,3)){
   settle(sample);assert.ok(read().every((y,i)=>Math.abs(y-rest[i]-targetM)<2e-6));poses++;
  }
  settle(()=>expected[0]);
  assert.ok(read().some((y,i)=>Math.abs(y-rest[i]-expected[0])>.05),
   'Absolute terrain height was not evidence of full suspension stroke');negatives++;
 }finally{
  hullG.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
  for(const resource of new Set([...P.disposables,material,mats.trackTexL,mats.trackTexR]))resource.dispose();
 }
}
console.log('returnRollerPhysics:',JSON.stringify({poses,negatives,configuredStrokeMeasured:true}));
