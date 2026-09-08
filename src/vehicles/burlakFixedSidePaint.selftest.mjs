import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from './tankFactory.ts';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildT90BurlakX} from './profiles/t90BurlakX.ts';
import {installCanvasFixture} from './canvasFixture.test-support.mjs';

const LABEL='burlak-x-fixed-skirt';
const SOURCE_STATIONS=[[-2.06345,1.959],[-.45925,1.2476],[.8833,1.4287],[2.29245,1.3838]];
const methods=new Set(['add','addEquipment','addExternalArmor','addModuleVisual','addMudguard','addHatch','addCupola']);
const changedBuckets=new Set(['hullRubber','hullTrackGuardL','hullTrackGuardR']);
function hash(g){const h=createHash('sha256');for(const key of Object.keys(g.attributes).sort()){
 const a=g.attributes[key];h.update(key).update(String(a.itemSize)).update(String(a.normalized));
 h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
 if(g.index){const a=g.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}return h.digest('hex');}
function build(quality,camoPattern,old=false){const emissions=[],selected=[];
 registerProfiledBuilders({t90a_burlak_x:P=>buildT90BurlakX(new Proxy(P,{get(target,key){
  if(!methods.has(key))return Reflect.get(target,key);
  return(...args)=>{const g=args.find(a=>a?.isBufferGeometry),chosen=key==='addMudguard'&&args[0]===LABEL;
   if(chosen){assert.ok(['hullTrackGuardL','hullTrackGuardR'].includes(args[1]));
    selected.push({bucket:args[1],parameters:{...g.parameters},pose:args.slice(3)});}
   emissions.push([key,args.map((a,i)=>a===g?hash(g):chosen&&i===1?'selected-fixed-side-sheet':a)]);
   if(chosen&&old)args[1]='hullRubber';
   return target[key](...args);
  };
 }}))});
 try{return{emissions,selected,tank:createTank('t90a_burlak_x',null,{quality,proceduralOnly:true,
  materialMode:'rendered',geometryReceipt:false,batchStatic:false,decor:true,camoPattern,camoSeed:4242})};}
 finally{registerProfiledBuilders({t90a_burlak_x:buildT90BurlakX});}
}
function clouds(root){root.updateMatrixWorld(true);const rows=[],v=new T.Vector3();root.traverse(o=>{
 if(!o.isMesh||!changedBuckets.has(o.name))return;assert.ok(!o.isInstancedMesh&&!o.isBatchedMesh);
 const p=o.geometry.attributes.position,index=o.geometry.index,n=index?.count??p.count;
 for(let i=0;i<n;i+=3){const corners=[];for(let k=0;k<3;k++)corners.push(v.fromBufferAttribute(p,index?index.getX(i+k):i+k)
  .applyMatrix4(o.matrixWorld).toArray().join(','));
 rows.push([0,1,2].map(k=>[corners[k],corners[(k+1)%3],corners[(k+2)%3]].join('|')).sort()[0]);}
 });return rows.sort();}
function independent(root){root.updateMatrixWorld(true);const rows=[];root.traverse(o=>{
 if(!o.isMesh||changedBuckets.has(o.name))return;
 rows.push([o.name,hash(o.geometry),o.matrixWorld.elements,o.material.name,o.userData.combatHitboxRole,
  o.count??null,o.instanceMatrix?Array.from(o.instanceMatrix.array):null]);
 });return rows;}
function guards(tank){const rig=tank.root.getObjectByName('rig_hull'),hull=tank.root.getObjectByName('hull');
 return [-1,1].map(side=>{const mesh=tank.root.getObjectByName(side<0?'hullTrackGuardL':'hullTrackGuardR');
  assert.ok(mesh?.isMesh);assert.equal(mesh.parent,rig,'unchanged always-visible hull-side stock');
  assert.equal(mesh.userData.combatHitboxRole,'nonArmor','paint does not enlarge the ballistic envelope');
  assert.equal(mesh.material.name,'cot:armor-paint');assert.equal(mesh.material.map,hull.material.map);
  assert.ok(mesh.material.map?.isTexture,'native paint material, not a flat approximation');
  const uv=mesh.geometry.attributes.uv;assert.ok(uv&&Array.from(uv.array).every(Number.isFinite));
  assert.ok(new Set(uv.array).size>8,'spatial camouflage coordinates, not one constant texel');return mesh;});}
const restore=installCanvasFixture(),rows=[];let emissions=0,rays=0;
try{for(const quality of['high','low'])for(const camo of['factory','winter']){
 const before=build(quality,camo,true),after=build(quality,camo);
 try{
  assert.equal(after.selected.length,8,'four source sheets per side, no blanket material migration');
  for(let i=0;i<8;i++){const row=after.selected[i],side=i<4?-1:1,[z,depth]=SOURCE_STATIONS[i%4];
   assert.equal(row.parameters.width,.011);assert.equal(row.parameters.height,.5801);assert.equal(row.parameters.depth,depth-.01);
   assert.deepEqual(row.pose,[side*1.732,1.016,z],'all source sheet positions are held');}
  assert.deepEqual(after.emissions,before.emissions,'every raw geometry, method and pose is identical; only the eight declared finishes change');
  emissions+=after.emissions.length;
  const oldSheet=before.tank.root.getObjectByName('hullRubber');
  assert.ok(oldSheet?.isMesh);assert.equal(oldSheet.material.name,'cot:tire-rubber');assert.equal(oldSheet.material.map,null);
  const rig=after.tank.root.getObjectByName('rig_hull'),sheets=guards(after.tank);
  assert.deepEqual(after.tank.root.userData.__decorSummary,before.tank.root.userData.__decorSummary,'no decoration admission/skip change');
  for(const tank of[before.tank,after.tank])for(const era of tank.root.userData.eraClusterNames??[])tank.stripEra(era);
  for(const yaw of[0,.73,-1.21]){
   for(const tank of[before.tank,after.tank]){tank.root.position.set(.3,.07,-.4);tank.root.rotation.set(.03,yaw,-.02);
    tank.root.getObjectByName('rig_turret').rotation.y=-.4*yaw;tank.root.getObjectByName('rig_gun').rotation.x=-.12;tank.root.updateMatrixWorld(true);}
   assert.deepEqual(clouds(after.tank.root),clouds(before.tank.root),'complete oriented sheet stock is unchanged through actual poses and spent ERA');
   assert.deepEqual(independent(after.tank.root),independent(before.tank.root),'all other geometry, wheels, markings, decorations and poses remain exact');
   for(const side of[-1,1])for(const[z]of SOURCE_STATIONS){
    const p=rig.localToWorld(new T.Vector3(side*2.1,1.02,z)),d=new T.Vector3(-side,0,0).transformDirection(rig.matrixWorld);
    const hit=new T.Raycaster(p,d,0,.5).intersectObjects(sheets,false)[0];assert.ok(hit,'every painted source sheet remains after ERA removal');
    assert.ok(Math.abs(hit.point.clone().applyMatrix4(rig.matrixWorld.clone().invert()).x-side*1.7375)<1e-6);rays++;
   }
  }
  const map=sheets[0].material.map;sheets[0].material.map=null;assert.throws(()=>guards(after.tank));sheets[0].material.map=map;
  const role=sheets[0].userData.combatHitboxRole;sheets[0].userData.combatHitboxRole='armor';assert.throws(()=>guards(after.tank));sheets[0].userData.combatHitboxRole=role;
  rows.push({quality,camo,sheets:8,decorTriangles:after.tank.root.userData.__decorSummary.tris});
 }finally{before.tank.dispose();after.tank.dispose();}
}}finally{restore();}
console.log(JSON.stringify({pass:true,emissions,posedSpentSheetRays:rays,rows,
 limitation:'CPU material/UV and exact full stock, pose and decoration equivalence. Canvas fixture draws no native pixels; separate native finish pairs are required.'}));
