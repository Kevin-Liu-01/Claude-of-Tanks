import assert from 'node:assert/strict';
import * as T from 'three';
import {KIT} from './tankFactoryCore.ts';
import {lineUpperReturnBand} from './upperReturnBandStock.ts';

const stations=[-.8,.8],supports=stations.map(z=>({z,y:1}));
const cfg={wheelR:.4,wheelW:.3,wheelZs:[-1,0,1],wheelY:.5,xc:1.3,
 sprocket:{z:2,y:.7,r:.3},idler:{z:-2,y:.7,r:.3},trackW:.5,trackTh:.06,topY:1,
 loopPoints:KIT.trackLoopPoints({sprocket:{z:-2,y:.7,r:.3},idler:{z:2,y:.7,r:.3},supports,sag:0,botY:.04})};
cfg.loopPoints=cfg.loopPoints.filter((p,i,points)=>!i||Math.hypot(p[0]-points[i-1][0],p[1]-points[i-1][1])>1e-7);
for(let i=0;i<cfg.loopPoints.length;i++){
 const a=cfg.loopPoints[i],b=cfg.loopPoints[(i+1)%cfg.loopPoints.length];
 assert.ok(Math.hypot(a[0]-b[0],a[1]-b[1])>1e-7,'Finite native fixture carrier cells');
}
function fixture(quality,depth,options={}){
 const material=new T.MeshStandardMaterial(),mats=Object.fromEntries(
  ['hull','detail','dark','shadow','trackLink','spareTrack','burnt','trackL','trackR','wheels','rubber'].map(k=>[k,material]));
 Object.assign(mats,{trackTexL:new T.Texture(),trackTexR:new T.Texture()});
 const P={spec:{id:'merkava4_x'},disposables:[],mats,hullG:new T.Group(),geometryReceipt:true,q:quality==='high',batchStatic:false,add(){}};
 const gear=KIT.buildRunningGear(P,{...cfg,...options});
 const before=P.hullG.getObjectByName('gearTrackBandL').geometry.attributes.position.array.slice();
 if(depth)lineUpperReturnBand(P,stations,depth);gear.update(0,0);
 return{P,gear,before,dispose(){
  P.hullG.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
  for(const resource of new Set([...P.disposables,material,mats.trackTexL,mats.trackTexR]))resource.dispose();
 }};
}
function sameShoes(a,b){
 let maximum=0;
 for(const name of['gearTrackPads','gearTrackPadsSimplified']){
  const x=a.P.hullG.getObjectByName(name),y=b.P.hullG.getObjectByName(name);
  assert.equal(x.count,y.count);assert.equal(x.userData.trackShoePitchM,y.userData.trackShoePitchM);
  for(let i=0;i<x.instanceMatrix.array.length;i++)maximum=Math.max(maximum,Math.abs(x.instanceMatrix.array[i]-y.instanceMatrix.array[i]));
 }
 return maximum;
}
function snapshot(P){
 P.hullG.updateMatrixWorld(true);const rows=[];P.hullG.traverse(o=>{if(!o.geometry)return;
  rows.push({name:o.name,position:Array.from(o.geometry.attributes.position.array),normal:Array.from(o.geometry.attributes.normal.array),
   matrix:o.matrix.toArray(),instances:o.instanceMatrix?Array.from(o.instanceMatrix.array):null,visible:o.visible});
 });return rows;
}
let poses=0,negativeControls=0;
for(const quality of['high','low'])for(const rigidLinkChords of[false,true]){
 const base=fixture(quality,0,{rigidLinkChords,trackCarrierFromOuterFace:true});
 const lined=fixture(quality,.0038,{rigidLinkChords,trackCarrierFromOuterFace:true});
 const legacy=fixture(quality,.0038,{rigidLinkChords});
 const absent=fixture(quality,0,{rigidLinkChords}),explicit=fixture(quality,0,{rigidLinkChords,trackCarrierFromOuterFace:false});
 try{
  const p=lined.P.hullG.getObjectByName('gearTrackBandL').geometry.attributes.position.array;
  assert.equal(p.length,lined.before.length,'Lining adds zero triangles');let changed=0;
  for(let i=0;i<p.length;i++)if(p[i]!==lined.before[i]){
   changed++;assert.notEqual(i%3,0,'No axial width change');
   assert.ok([6,7,8,9,10,11,14,16,17,19,20,22].includes(Math.floor(i/3)%24),'No outer stock change');
  }
  assert.ok(changed>0,'Actual finite native inner stock changes');
  let oldMaximum=0;
  for(const height of[0,.3,-.22]){
   for(const f of[base,lined,legacy,absent,explicit]){f.gear.resetPose();f.gear.conform({pos:new T.Vector3(),yaw:0,visualPitch:0,visualRoll:0},()=>height,0,0,1/60);}
   for(let phase=0;phase<16;phase++){
    for(const f of[base,lined,legacy,absent,explicit])f.gear.update(phase*.011,-phase*.013,1/60);
    assert.ok(sameShoes(base,lined)<2e-7,'Both actual native samplers retain phase, pitch, wrap, tangent and lower course');
    assert.deepEqual(snapshot(absent.P),snapshot(explicit.P),'Default source stock, normals, transforms and poses remain byte-identical');
    oldMaximum=Math.max(oldMaximum,sameShoes(base,legacy));poses++;
   }
  }
  assert.ok(oldMaximum>.001,'Historical midpoint moves real shoes by over one millimetre');negativeControls++;
  for(const broken of[true,false]){
   for(const f of[base,lined,absent,explicit]){f.gear.setBroken('trackL',broken);f.gear.update(.11,-.09);}
   assert.ok(sameShoes(base,lined)<2e-7);assert.deepEqual(snapshot(absent.P),snapshot(explicit.P));
   assert.equal(lined.P.hullG.getObjectByName('gearTrackBandL').visible,!broken,'Lining shares native broken/repair ownership');
  }
 }finally{for(const f of[base,lined,legacy,absent,explicit])f.dispose();}
}
{
 const f=fixture('low',0),left=f.P.hullG.getObjectByName('gearTrackBandL'),right=f.P.hullG.getObjectByName('gearTrackBandR');
 const original=right.geometry.attributes.position;
 const reject=(zs,depth,mutate=()=>{})=>{
  const before=left.geometry.attributes.position.array.slice();mutate();
  try{assert.throws(()=>lineUpperReturnBand(f.P,zs,depth));negativeControls++;
   assert.deepEqual(left.geometry.attributes.position.array,before,'Invalid right stock must not partly mutate the left band');}
  finally{right.geometry.setAttribute('position',original);if(!right.parent)f.P.hullG.add(right);}
 };
 try{
  for(const depth of[0,-.001,NaN,Infinity])reject(stations,depth);
  for(const zs of[[],[NaN],[Infinity],[-.8,-.8],[-.8,-.8+1e-7],[-.8,999]])reject(zs,.0038);
  reject(stations,.0038,()=>right.removeFromParent());
  reject(stations,.0038,()=>right.geometry.setAttribute('position',new T.Float32BufferAttribute([0,0,0],3)));
  for(const invalid of['zero','nonfinite'])reject(stations,.0038,()=>{
   const p=original.clone();
   for(let base=0;base<p.count;base+=24){
    const z=(p.getZ(base+2)+p.getZ(base+6))/2;
    if(!stations.some(s=>Math.abs(s-z)<2e-6))continue;
    const y=(p.getY(base+2)+p.getY(base+6))/2;
    p.setY(base+2,y);p.setZ(base+2,z);
    p.setY(base+6,invalid==='zero'?y:Infinity);p.setZ(base+6,z);
   }
   right.geometry.setAttribute('position',p);
  });
 }finally{f.dispose();}
}
console.log('upperReturnBandStock:',JSON.stringify({poses,negativeControls,defaultBytesUnchanged:true,addedTriangles:0}));
