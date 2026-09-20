import assert from 'node:assert/strict';
import * as T from 'three';
import '../../../tools/tank-surface-collect.mjs';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {ensureInteriorFills} from '../interiorFills.ts';

// Weld by position only for test selection: material seams must not split a
// real closed primitive. All checks use emitted geometry, not userData bounds.
function components(mesh){
 const p=mesh.geometry.attributes.position,ix=mesh.geometry.index,n=ix?.count??p.count;
 const parent=[],vertices=[],byKey=new Map(),corners=[];
 const find=i=>parent[i]===i?i:parent[i]=find(parent[i]);
 for(let i=0;i<n;i++){
  const v=new T.Vector3().fromBufferAttribute(p,ix?ix.getX(i):i),key=v.toArray().map(x=>Math.round(x*1e6)).join(',');
  if(!byKey.has(key)){byKey.set(key,vertices.length);parent.push(vertices.length);vertices.push(v);}
  corners.push(byKey.get(key));
 }
 for(let i=0;i<n;i+=3)for(let k=1;k<3;k++)parent[find(corners[i+k])]=find(corners[i]);
 const sets=new Map();for(let i=0;i<n;i+=3){const key=find(corners[i]);if(!sets.has(key))sets.set(key,[]);sets.get(key).push(...corners.slice(i,i+3).map(k=>vertices[k]));}
 return [...sets.values()].map(points=>({points,bounds:new T.Box3().setFromPoints(points),mesh}));
}
function select(parts,center,size,label){
 const found=parts.filter(p=>p.bounds.getCenter(new T.Vector3()).distanceTo(new T.Vector3(...center))<.001
  &&p.bounds.getSize(new T.Vector3()).distanceTo(new T.Vector3(...size))<.004);
 assert.equal(found.length,1,`${label}: one actual authored component`);return found[0];
}
function surfaceCrossings(part,receiver,shift=new T.Vector3()){
 let count=0;const direction=new T.Vector3();
 for(let i=0;i<part.points.length;i+=3)for(let k=0;k<3;k++){
  const a=part.points[i+k].clone().add(shift).applyMatrix4(part.mesh.matrixWorld);
  const b=part.points[i+(k+1)%3].clone().add(shift).applyMatrix4(part.mesh.matrixWorld);
  direction.subVectors(b,a);const length=direction.length();if(length<1e-8)continue;
  const ray=new T.Raycaster(a,direction.divideScalar(length),0,length+1e-7);
  if(ray.intersectObject(receiver,false).length)count++;
 }return count;
}
function asMesh(part){
 const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(part.points.flatMap(p=>p.toArray()),3));
 const m=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));m.matrixAutoUpdate=false;m.matrixWorld.copy(part.mesh.matrixWorld);return m;
}
function assertContact(part,receiver,label,shift){
 assert.ok(surfaceCrossings(part,receiver,shift)>1,`${label}: finite receiving surface intersection`);
}
function localRay(owner,origin,direction,objects){
 return new T.Raycaster(owner.localToWorld(new T.Vector3(...origin)),new T.Vector3(...direction).transformDirection(owner.matrixWorld),0,1)
  .intersectObjects(objects,false)[0];
}
function barrelContinuous(mg,scale){
 const s=scale*.78,axisY=.014+.16*s+.080*s+.025*s+.004,frontZ=.23*s;
 const body=mg.getObjectByName('browningDerivedMachineGunBody');assert.ok(body?.isMesh);
 // Two interior samples of the old open run, its forward overlap, and the
 // real barrel: no painted ring or isolated tip can satisfy these first hits.
 for(const z of [.015,.06,.102,.14].map(v=>frontZ+v*s)){
  const hit=localRay(mg,[.045,axisY,z],[-1,0,0],[body]);
  assert.ok(hit&&hit.distance<.042,`continuous MAG receiver/barrel at ${z}`);
  const p=mg.worldToLocal(hit.point.clone());assert.ok(p.x>.008*s&&p.x<.015*s,'actual narrow barrel stock');
 }
}
function footSeated(mg,receivers){
 for(const dx of [-.009,0,.009]){
  const hit=localRay(mg,[dx,.07,0],[0,-1,0],receivers);
  assert.ok(hit,'MG foot has physical receiving stock');
  const gap=mg.worldToLocal(hit.point.clone()).y;
  assert.ok(gap>=-.003&&gap<.065,`MG base seated, signed receiver height ${gap}`);
 }
}
function verifySeats(tank,id){
 const rig=tank.root.getObjectByName('rig_turret'),turret=tank.root.getObjectByName('turret'),detail=tank.root.getObjectByName('turretDetail');
 const parts=components(detail);let owner=detail.parent;
 while(owner&&!/^rig_(turret|hull|gun)$/.test(owner.name))owner=owner.parent;
 assert.ok(owner===rig,'attachment follows turret yaw through its LOD owner, never gun pitch');
 if(id==='merkava3d_x'){
  for(const [x,y]of[[-1.03,.553],[1.03,.766]]){
   const eye=select(parts,[x,y,1.1899975],[.092,.087499,.020923],'forward lifting eye');
   assertContact(eye,turret,'forward lifting eye');
   assert.throws(()=>assertContact(eye,turret,'raised eye',new T.Vector3(0,.10,0)),/finite receiving/);
  }
  const sight=select(parts,[-.41,1.011,-.0300025],[.342,.27,.342],'panoramic sight');
  assertContact(sight,turret,'panoramic sight');
  assert.throws(()=>assertContact(sight,turret,'old floating sight',new T.Vector3(0,.04,0)),/finite receiving/);
 }else{
  for(const side of[-1,1]){
   const arm=select(parts,[side*1.4,.435,-2.3594],[.36,.10,.24],'rear radar arm');
   assertContact(arm,turret,'radar arm to turret');
   const pedestal=parts.find(p=>Math.abs(p.bounds.min.z+2.8394)<1e-5&&Math.abs(p.bounds.max.z+2.1794)<1e-5
     &&Math.sign(p.bounds.getCenter(new T.Vector3()).x)===side&&p.bounds.getSize(new T.Vector3()).y>.5);
   assert.ok(pedestal,'original sloping rear radar pedestal retained');
   const receiver=asMesh(pedestal);try{
    assertContact(arm,receiver,'arm to original radar pedestal');
    assert.throws(()=>assertContact(arm,receiver,'short detached arm',new T.Vector3(-side*.16,0,0)),/finite receiving/);
   }finally{receiver.geometry.dispose();receiver.material.dispose();}
   assert.throws(()=>assertContact(arm,turret,'detached radar arm',new T.Vector3(side*.20,0,0)),/finite receiving/);
  }
 }
 const mgs=[];rig.traverse(o=>{if(o.name==='fitting_browningDerived_mag')mgs.push(o)});
 assert.equal(mgs.length,id==='merkava3d_x'?2:1,'all original MAG assemblies retained');
 for(const mg of mgs){
  assert.ok(mg.parent===rig,'roof weapons yaw with their receiving stock');
  const scale=id==='merkava4_trophy'?1.48:mg.position.x<0?.96:.8667;
  barrelContinuous(mg,scale);footSeated(mg,[turret,detail]);
  const seatedY=mg.position.y;mg.position.y+=.10;mg.updateMatrixWorld(true);
  try{assert.throws(()=>footSeated(mg,[turret,detail]),/MG base seated/,'raised real fitting must lose its seat');}
  finally{mg.position.y=seatedY;mg.updateMatrixWorld(true);}
  const body=mg.getObjectByName('browningDerivedMachineGunBody'),original=body.geometry;
  // Remove only the actual connecting cylinder, preserving receiver/barrel.
  const s=scale*.78,bridge=components(body).find(p=>Math.abs(p.bounds.getCenter(new T.Vector3()).z-(.23+.0525)*s)<1e-5
    &&Math.abs(p.bounds.getSize(new T.Vector3()).z-.105*s)<1e-5);
  assert.ok(bridge,'actual receiver connector exists');
  const points=components(body).filter(p=>!p.bounds.equals(bridge.bounds)).flatMap(p=>p.points.flatMap(v=>v.toArray()));
  body.geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(points,3));
  try{assert.throws(()=>barrelContinuous(mg,scale),/continuous MAG/,'removing connector restores the actual failure');}
  finally{body.geometry.dispose();body.geometry=original;}
 }
}
await ensureInteriorFills(['merkava3d_x','merkava4_trophy']);
for(const quality of['high','low'])for(const id of['merkava3d_x','merkava4_trophy']){
 const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242,batchStatic:false});
 try{
  const rig=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun'),spec=getSpec(id);
  for(const yaw of[0,-1.1,.8])for(const pitch of[-spec.gunDepressionDeg,0,spec.gunElevationDeg]){
   rig.rotation.y=yaw;gun.rotation.x=-pitch*Math.PI/180;tank.recoilKick(.12);tank.root.updateMatrixWorld(true);
   verifySeats(tank,id);
  }
  console.log(`${id}/${quality}: physical eyes/sight/radar arms, all MAG feet and continuous barrels, yaw/pitch/recoil and broken-stock negatives PASS`);
 }finally{tank.dispose();}
}
