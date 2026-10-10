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
// 2026-09-30 (4c34b3e8b, owner's remote roof weapons): a remote MAG keeps its fixed foundation in
// browningDerivedMachineGunBody and pitches its receiver, connector and barrel in the fitting's own
// auxiliaryWeaponPitch group; a manned MAG still carries all of them in the body.
function weaponStock(mg){
 const pitch=mg.children.find(o=>o.name==='auxiliaryWeaponPitch');
 if(!pitch)return mg.getObjectByName('browningDerivedMachineGunBody');
 const stock=pitch.children.find(o=>o.name==='fitting_auxiliaryWeapon_dark');
 assert.ok(stock?.isMesh,'remote MAG receiver/barrel pitches inside its own fitting');return stock;
}
function barrelContinuous(mg,scale){
 const s=scale*.78,axisY=.014+.16*s+.080*s+.025*s+.004,frontZ=.23*s;
 const body=weaponStock(mg);assert.ok(body?.isMesh);
 // Two interior samples of the old open run, its forward overlap, and the
 // real barrel: no painted ring or isolated tip can satisfy these first hits.
 for(const z of [.015,.06,.102,.14].map(v=>frontZ+v*s)){
  const hit=localRay(mg,[.045,axisY,z],[-1,0,0],[body]);
  assert.ok(hit&&hit.distance<.042,`continuous MAG receiver/barrel at ${z}`);
  // 2026-10-07 (tank-accessories round 3): the bridge is the shared barrel-nut/chamber lathe (r0*1.6 -> 1.24) and the
  // breech third r0*1.12, so the first hit lies 0.008s..0.020s off the axis (the old plain cylinder was r0*1.12).
  // 2026-10-07 (round 4, re-pinned): barrels take their true section whatever the station's scale (machineGunGeometry.ts:
  // r0 = barrelR 0.0155 x max(s, the MAG's own 0.78), a 24 mm barrel; round 3's r0 = 0.012 s drew an 18 mm "pencil"),
  // so the first hit lies on that section, from the breech third (1.07 r0 across the 10-sided lathe's flat) to the
  // barrel nut (1.52 r0), and inside the receiver's half-width (0.037 s): still a barrel, never the receiver block.
  const r0=.0155*Math.max(s,.78),p=mg.worldToLocal(hit.point.clone());
  assert.ok(p.x>.9*r0&&p.x<Math.min(1.65*r0,.037*s),'actual narrow barrel stock');
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
  // 2026-10-07 (round 3): the Trophy commander's remote MAG is drawn at true scale (1.0, was 1.48: a 115 % GPMG)
  // 2026-10-08 (round 5): crew guns draw at no less than 95 % of their class's true scale (machineGunGeometry.ts
  // MG_CREW_TRUE_SHARE), so the probe reads the drawn scale off the fitting instead of the authored one.
  const scale=mg.userData.weaponScale/.78;
  barrelContinuous(mg,scale);footSeated(mg,[turret,detail]);
  const seatedY=mg.position.y;mg.position.y+=.10;mg.updateMatrixWorld(true);
  try{assert.throws(()=>footSeated(mg,[turret,detail]),/MG base seated/,'raised real fitting must lose its seat');}
  finally{mg.position.y=seatedY;mg.updateMatrixWorld(true);}
  const body=weaponStock(mg),original=body.geometry;
  // Remove only the actual connecting cylinder, preserving receiver/barrel.
  // Component bounds are compared in the fitting frame (a remote pitch group is offset inside it).
  const toFitting=new T.Matrix4().copy(mg.matrixWorld).invert().multiply(body.matrixWorld);
  const s=scale*.78,bridge=components(body).find(p=>{const b=p.bounds.clone().applyMatrix4(toFitting);
    // round 3: the universal bridge runs from the receiver face to the barrel foot (0.1s + 2 mm)
    return Math.abs(b.getCenter(new T.Vector3()).z-(.23*s+(.1*s+.002)/2))<1e-5&&Math.abs(b.getSize(new T.Vector3()).z-(.1*s+.002))<1e-5;});
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
