import assert from 'node:assert/strict';
import * as T from 'three';
import {hardenSourceMuzzleRim,sourceMuzzleAssembly} from './profiles/abramsSourceXMuzzle.ts';
import {profiledTube} from './profiles/abramsSourceXGeometry.ts';
import {createTank} from './tankFactory.ts';
import {ABRAMS_SOURCE_X_IDS} from './abramsSourceXSpecs.ts';
import {buildAbramsSourceXEquipment} from './profiles/abramsSourceXEquipment.ts';

const pieces=sourceMuzzleAssembly(),material=new T.MeshBasicMaterial({side:T.FrontSide});
assert.equal(new Set(pieces.map(p=>p.name)).size,pieces.length);
const meshes=pieces.map(p=>{const m=new T.Mesh(p.geometry,material);m.name=p.name;m.updateMatrixWorld(true);return m;});
const cast=(list,p,d,far)=>new T.Raycaster(new T.Vector3(...p),new T.Vector3(...d),0,far).intersectObjects(list,false);
const near=(n,expected,tolerance,label)=>assert.ok(Number.isFinite(n)&&Math.abs(n-expected)<tolerance,`${label}: ${n} expected${expected} ±${tolerance}`);
for(const segments of[40,64]){
 const source=profiledTube([{z:5.60,r:.08434},{z:5.605275,r:.07724},{z:5.809425,r:.07724}],.06064,segments);
 const before=source.toNonIndexed(),after=hardenSourceMuzzleRim(source),p=after.attributes.position;
 assert.deepEqual(after.attributes.position.array,before.attributes.position.array,'rim shading changes no occupied triangle');
 assert.deepEqual(after.attributes.uv.array,before.attributes.uv.array,'rim UV unchanged');
 let rimFaces=0;
 for(let i=0;i<p.count;i+=3){
  const rim=[0,1,2].every(k=>Math.abs(p.getZ(i+k)-5.809425)<.0000005);
  if(rim)rimFaces++;
  for(let j=0;j<9;j++)assert.equal(after.attributes.normal.array[i*3+j],rim?j%3===2?1:0:before.attributes.normal.array[i*3+j],
   'only planar terminal normals are hardened; side and bore smoothing unchanged');
 }
 assert.equal(rimFaces,2*segments);
 before.dispose();after.dispose();
}
let triangles=0;
for(const {name,geometry}of pieces){
 const g=geometry.index?geometry.toNonIndexed():geometry,p=g.attributes.position,edges=new Map();let volume=0;
 const key=v=>v.toArray().map(n=>n.toFixed(5)).join(',');
 for(let i=0;i<p.count;i+=3){
  const v=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,i+j));triangles++;
  assert.ok(v.every(v=>v.toArray().every(Number.isFinite)),name);
  assert.ok(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).length()>1e-11,name);
  volume+=v[0].dot(v[1].clone().cross(v[2]))/6;
  for(let j=0;j<3;j++){const a=key(v[j]),b=key(v[(j+1)%3]),k=[a,b].sort().join('|'),e=edges.get(k)||{count:0,balance:0};e.count++;e.balance+=a<b?1:-1;edges.set(k,e);}
 }
 assert.ok(volume>1e-11,name);
 for(const e of edges.values())assert.deepEqual(e,{count:2,balance:0},`${name} closed outward stock`);
 if(g!==geometry)g.dispose();
}
// Independent complete source68 ray packet abrams-muzzle-Y5Nhaf. Small cast
// wing edge interpolation is an authored2.5mm approximation, not sampled mesh.
const wing=cast(meshes,[-.115,1.896,5.8],[0,0,-1],.3)[0];
assert.ok(wing);near(wing.point.z,5.602079705,.0025,'source rounded clamp end');
for(const x of[-.13,.095])assert.equal(cast(meshes,[x,1.896,5.8],[0,0,-1],.3).length,0,'outside source clamp width');
for(const x of[-.020003,-.073,.033])assert.equal(cast(meshes,[x,1.849085,5.82],[0,0,-1],.35).length,0,'muzzle assembly must not fill the bore');
// Independent source-only iwHQT7: the MRS itself also has a genuine oblique
// mouth, terminating nearZ5.628. A cylinder cap atZ5.578 is not equivalent.
const mrsWitnesses=[[0,0,5.627755685],[-.008,0,5.629086945],[.008,0,5.626427022],[0,.008,5.628514891],[0,-.008,5.626996479]];
const axis=new T.Vector3(.19372345,-.08602887,1).normalize().toArray();
const mrsOrigin=(dx,dy)=>[-.04558517505875+dx,1.97846518684525+dy,5.54];
for(const[dx,dy,z]of mrsWitnesses){
 const h=cast(meshes,mrsOrigin(dx,dy),axis,.13)[0];assert.ok(h);
 near(h.point.z,z,.002,'source recessed MRS floor, authored2mm small-stock approximation');
}
for(const y of[1.952,1.956,1.96])assert.equal(cast(meshes,[-.09,y,5.59],[1,0,0],.14).length,0,'space below oblique source MRS mouth');
// Capture the real emitted annular main tube, independently of the helper.
let tube;
const groups=[new T.Group(),new T.Group(),new T.Group()],disposables=[];
const capture=(_bucket,g,x,y,z,rx,ry,rz)=>{
 if(g.name==='abramsSourceX_MainTube'){tube=new T.Mesh(g,material);tube.position.set(x,y,z);tube.rotation.set(rx,ry,rz);tube.updateMatrixWorld(true);}else g.dispose();
};
buildAbramsSourceXEquipment({q:true,turretG:groups[0],gunG:groups[1],recoilG:groups[2],mats:{dark:material},disposables,
 spec:{armor:{turretPlates:[]}},destructibleCluster:(_n,f)=>f(),addEquipment:capture,addCupola:capture,addHatch:capture,addExternalArmor:capture},
 {a1:true,urbanArmor:false,curvedArat:false,sepv3:false,ukrainian:false},{turret:[0,0,0],gun:[0,0,0]});
groups.forEach(g=>g.traverse(o=>{if(o.isMesh)o.geometry.dispose();}));disposables.forEach(g=>g.dispose());assert.ok(tube);
// Source-only dYN9LS: true .06064 bore, flat rim from .061 through .076.
// A broad smoothed normal transition must not make this annulus read as air.
for(const r of[.061,.064,.070,.076]){
 const h=cast([tube],[-.020003+r,1.849085,5.85],[0,0,-1],.10)[0];assert.ok(h);
 near(h.point.z,5.809424877,.000002,'actual terminal rim first surface');
 for(const i of[h.face.a,h.face.b,h.face.c])assert.deepEqual(new T.Vector3().fromBufferAttribute(tube.geometry.attributes.normal,i).toArray(),[0,0,1]);
}
const named=name=>meshes.filter(m=>m.name===`SourceMuzzle${name}`);
const lapY=(lower,upper,x,z,max,label)=>{
 const a=cast(lower,[x,2.1,z],[0,-1,0],.5)[0],b=cast(upper,[x,1.7,z],[0,1,0],.5)[0];
 assert.ok(a&&b,label);const lap=a.point.y-b.point.y;assert.ok(lap>=-2e-7&&lap<=max,`${label} actual receiving lap${lap}`);
};
lapY([tube],named('MRSSaddle'),-.019968,5.65,.0002,'nose→curved saddle');
lapY(named('MRSSaddle'),named('MRSBase'),-.019968,5.65,.006,'saddle→base');
for(const z of[5.632,5.659,5.699]){
 const cradle=meshes.filter(m=>m.name.startsWith('SourceMuzzleMRSCradle')&&new T.Box3().setFromObject(m).containsPoint(new T.Vector3(-.07,1.95,z)));
 lapY(named('MRSBase'),cradle,-.07,z,.00001,'base→cradle');
 const x=-.0138+(z-5.704075)*.19372345;
 const seat=cast(cradle,[x,1.96,z],[0,-1,0],.04)[0],shell=cast(named('MRSOpticTube'),[x,1.93,z],[0,1,0],.07)[0];
 assert.ok(seat&&shell);near(seat.point.y-shell.point.y,.0001,.00003,'cylindrical optic seats into U cradle');
}
for(const x of[-.064323,.023733])for(const z of[5.646175,5.716815])lapY(named('MRSBase'),named(`MRSBolt${x}_${z}`),x,z,.0006,'top fastener→base');
lapY(named('ClampBolt-0.107113'),named('ClampWing-1'),-.107113,5.589435,.00003,'lower clamp fastener→wing');
lapY(named('ClampWing1'),named('ClampBolt0.067102'),.067102,5.589435,.0003,'upper clamp fastener→wing');
tube.geometry.dispose();
for(const p of pieces)p.geometry.dispose();material.dispose();

let poses=0;
for(const id of ABRAMS_SOURCE_X_IDS)for(const quality of['high','low']){
 const tank=createTank(id,null,{quality,proceduralOnly:true,materialMode:'geometry-only',batchStatic:false,camoSeed:4242});
 tank.root.updateMatrixWorld(true);
 const gun=tank.root.getObjectByName('rig_gun'),turret=tank.root.getObjectByName('rig_turret');
 const rest=gun.matrixWorld.clone().invert(),actual=[],restore=[];
 tank.root.traverse(o=>{if(!o.isMesh||o.userData.shadowOnly||/shadow/i.test(o.name))return;for(let p=o;p;p=p.parent)if(!p.visible)return;
  const old=o.material;const clone=m=>{const c=m.clone();c.side=T.FrontSide;return c;};o.material=Array.isArray(old)?old.map(clone):clone(old);actual.push(o);
  restore.push(()=>{[].concat(o.material).forEach(m=>m.dispose());o.material=old;});
 });
 try{
  for(const[yaw,pitch]of[[0,0],[.73,-.12],[Math.PI,.23]]){
   turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
   const transform=gun.matrixWorld.clone().multiply(rest),inverse=transform.clone().invert();
   const hit=(p,d,far)=>cast(actual,new T.Vector3(...p).applyMatrix4(transform).toArray(),new T.Vector3(...d).transformDirection(transform).toArray(),far);
   const label=`${id}/${quality}/${yaw}/${pitch}`;
   const h=hit([-.115,1.896,5.8],[0,0,-1],.3)[0];assert.ok(h,label);
   near(h.point.clone().applyMatrix4(inverse).z,5.602079705,.0025,`${label} source clamp fore`);
   for(const z of[5.56,5.58,5.60,5.61]){
    // Bottom rays avoid source MRS, which legitimately lies above the tube.
    const h=hit([-.020003,1.7,z],[0,1,0],.15)[0];assert.ok(h,label);
    const expected=new Map([[5.56,1.754925667],[5.58,1.759132796],[5.60,1.764745668],[5.61,1.771855644]]).get(z);
    near(h.point.clone().applyMatrix4(inverse).y,expected,.00025,`${label} measured collar radius`);
   }
   for(const x of[-.020003,-.073,.033])assert.equal(hit([x,1.849085,5.82],[0,0,-1],.85).length,0,`${label} actual open bore`);
   for(const r of[.061,.064,.070,.076]){
    const h=hit([-.020003+r,1.849085,5.85],[0,0,-1],.10)[0];assert.ok(h,label);
    near(h.point.clone().applyMatrix4(inverse).z,5.809424877,.000002,`${label} complete-scene source annulus`);
   }
   assert.equal(hit([-.13,1.896,5.8],[0,0,-1],.3).length,0,`${label} source outer clamp air`);
   for(const[dx,dy,z]of mrsWitnesses){const h=hit(mrsOrigin(dx,dy),axis,.13)[0];assert.ok(h,label);near(h.point.clone().applyMatrix4(inverse).z,z,.002,`${label} source hollow MRS mouth`);}
   for(const y of[1.952,1.956,1.96])assert.equal(hit([-.09,y,5.59],[1,0,0],.14).length,0,`${label} actual air below slanted MRS mouth`);
   poses++;
  }
 }finally{restore.forEach(f=>f());tank.dispose();}
}
assert.equal(poses,42);
console.log(`Abrams muzzle: ${pieces.length} closed stocks/${triangles} triangles; source collar/rounded wing/actual bore/owner articulation high-low42poses PASS`);
