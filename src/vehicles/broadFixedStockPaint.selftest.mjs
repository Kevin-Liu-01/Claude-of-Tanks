import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from './tankFactory.ts';
import {TANK_SPECS} from './specs.ts';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildLeopard2A5X} from './profiles/leopardX.ts';
import {installCanvasFixture} from './canvasFixture.test-support.mjs';

const directNames=new Set(['leo2a5_xSourceFixture_ServiceCoverRight','leo2a5_xSourceFixture_ServiceCoverLeft']);
const methods=new Set(['add','addEquipment','addMudguard','addHatch','addCupola','addExternalArmor','addModuleVisual']);
function hash(g,omitUV=false){const h=createHash('sha256');for(const key of Object.keys(g.attributes).sort()){
 if(omitUV&&key==='uv')continue;const a=g.attributes[key];h.update(key).update(String(a.itemSize)).update(String(a.normalized));
 h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
 if(g.index){const a=g.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}return h.digest('hex');}
// 2026-10-01 (owner: retire frozen pins): the replay of the authenticated pre-paint leopardA5XDetails.ts
// source (pinned digest, undeclared-edit negative control, raw old-versus-new detail emissions) is gone.
// The live differential stays: each build is compared with the same build whose two service covers are
// returned to the fitting paint, so the cover paint stays material-only.
function build(id,quality,camoPattern,inverse=false){const selected=[],emissions=[];
 const builder=buildLeopard2A5X;
 registerProfiledBuilders({[id]:P=>{
  const originalAdd=P.hullG.add;
  P.hullG.add=function(...objects){for(const o of objects)if(directNames.has(o.name)){
   selected.push({method:'direct',name:o.name,hash:hash(o.geometry,true),pose:o.position.toArray()});
   if(inverse){o.material=P.mats.detail;o.userData.appearanceRole='fittingPaint';}
  }return originalAdd.apply(this,objects);};
  try{builder(new Proxy(P,{get(target,key){if(!methods.has(key))return Reflect.get(target,key);
   return(...args)=>{const g=args.find(a=>a?.isBufferGeometry);
    emissions.push([key,args.map(a=>a===g?hash(g):a)]);
    return target[key](...args);
   };
  }}));}finally{P.hullG.add=originalAdd;}
 }});
 try{assert.ok(TANK_SPECS[id]);const tank=createTank(id,null,{quality,camoPattern,camoSeed:4242,
  proceduralOnly:true,materialMode:'rendered',geometryReceipt:false,batchStatic:false,decor:true});
  assert.equal(tank.root.name,'tank_'+id);return{tank,selected,emissions};}
 finally{registerProfiledBuilders({[id]:builder});}
}
function cloud(root,names){root.updateMatrixWorld(true);const rows=[],v=new T.Vector3();root.traverse(o=>{
 if(!o.isMesh||!names.has(o.name))return;assert.ok(!o.isInstancedMesh&&!o.isBatchedMesh);
 const p=o.geometry.attributes.position,index=o.geometry.index,n=index?.count??p.count;
 for(let i=0;i<n;i+=3){const corners=[];for(let k=0;k<3;k++)corners.push(v.fromBufferAttribute(p,index?index.getX(i+k):i+k)
  .applyMatrix4(o.matrixWorld).toArray().join(','));
 rows.push([0,1,2].map(k=>[corners[k],corners[(k+1)%3],corners[(k+2)%3]].join('|')).sort()[0]);}});return rows.sort();}
function materialSlots(value){
 const slots=Array.isArray(value)?value:[value];assert.ok(slots.length>0);
 return slots.map(material=>{assert.equal(material?.isMaterial,true);
  return[material.name,material.userData.appearanceRole];});
}
function others(root,excluded){root.updateMatrixWorld(true);const rows=[];root.traverse(o=>{
 if(!o.isMesh||excluded.has(o.name))return;rows.push([o.name,hash(o.geometry),o.matrixWorld.elements,
  materialSlots(o.material),o.geometry.groups,o.userData.combatHitboxRole,
  o.count??null,o.instanceMatrix?Array.from(o.instanceMatrix.array):null]);});return rows;}
{
 const g=new T.BoxGeometry(),a=new T.MeshBasicMaterial(),b=new T.MeshBasicMaterial(),root=new T.Group();
 a.name='steel';b.name='rubber';root.add(new T.InstancedMesh(g,[a,b],1));
 const snapshot=()=>JSON.stringify(others(root,new Set())),before=snapshot();
 b.name='wrong';assert.notEqual(snapshot(),before,'every material-array slot participates');b.name='rubber';
 const index=g.groups[0].materialIndex;g.groups[0].materialIndex=1-index;
 assert.notEqual(snapshot(),before,'face-to-material group assignment participates');g.groups[0].materialIndex=index;
 assert.equal(snapshot(),before);assert.throws(()=>materialSlots([]));assert.throws(()=>materialSlots([a,{}]));
 g.dispose();a.dispose();b.dispose();
}
function painted(tank,id){const names=[...directNames];
 return names.map(name=>{const o=tank.root.getObjectByName(name);assert.ok(o?.isMesh);
  assert.equal(o.parent.name,'rig_hull','original direct always-visible hull owner, not a new LOD or armor mesh');
  assert.equal(o.userData.combatHitboxRole,'equipment');
  assert.equal(o.material.name,'cot:armor-paint');assert.equal(o.material.map,tank.root.getObjectByName('hull').material.map);
  assert.ok(o.material.map?.isTexture);const uv=o.geometry.attributes.uv;
  assert.ok(uv&&Array.from(uv.array).every(Number.isFinite)&&new Set(uv.array).size>8);return o;});}
const restore=installCanvasFixture(),rows=[];let rays=0;
try{for(const id of['leo2a5_x'])for(const quality of['high','low'])for(const camo of['factory','winter']){
 const old=build(id,quality,camo,true),now=build(id,quality,camo);
 try{
  assert.equal(now.selected.length,2);assert.deepEqual(now.selected,old.selected);
  assert.deepEqual(now.emissions,old.emissions,'all ordinary and registered guard emissions observed, no hidden bucket path');
  assert.deepEqual(now.tank.root.userData.__decorSummary,old.tank.root.userData.__decorSummary,id+'/'+quality+'/'+camo+': original decoration decisions');
  const meshes=painted(now.tank,id),excluded=directNames;
  for(const yaw of[0,.73,-1.21]){
   for(const{tank}of[old,now]){for(const era of tank.root.userData.eraClusterNames??[])tank.stripEra(era);
    tank.root.position.set(.3,.07,-.4);tank.root.rotation.set(.03,yaw,-.02);
    tank.root.getObjectByName('rig_turret').rotation.y=-.4*yaw;tank.root.getObjectByName('rig_gun').rotation.x=-.12;tank.root.updateMatrixWorld(true);}
   assert.deepEqual(cloud(now.tank.root,excluded),cloud(old.tank.root,excluded),'entire selected oriented physical stock remains exact after pose/spent ERA');
   assert.deepEqual(others(now.tank.root,excluded),others(old.tank.root,excluded),'all other geometry, finish, wheels, kit and markings remain exact');
   const rig=now.tank.root.getObjectByName('rig_hull'),oldRig=old.tank.root.getObjectByName('rig_hull');
   const witnesses=[[[.776058,2.3,-1.378049],[0,-1,0],.8],[[-.765934,2.3,-1.365959],[0,-1,0],.8]];
   const previous=[...directNames].map(n=>old.tank.root.getObjectByName(n));
   for(const[p,d,max]of witnesses){const hit=(frame,targets)=>new T.Raycaster(frame.localToWorld(new T.Vector3(...p)),
    new T.Vector3(...d).transformDirection(frame.matrixWorld),0,max).intersectObjects(targets,false)[0];
    const a=hit(oldRig,previous),b=hit(rig,meshes);assert.ok(a&&b,'each actual permanent sheet/cover remains a receiving surface');
    assert.ok(a.point.distanceTo(b.point)<1e-8);rays++;}
  }
  const map=meshes[0].material.map;meshes[0].material.map=null;assert.throws(()=>painted(now.tank,id));meshes[0].material.map=map;
  const role=meshes[0].userData.combatHitboxRole;meshes[0].userData.combatHitboxRole='armor';assert.throws(()=>painted(now.tank,id));meshes[0].userData.combatHitboxRole=role;
  rows.push({id,quality,camo,selected:now.selected.length,decorTriangles:now.tank.root.userData.__decorSummary.tris});
 }finally{old.tank.dispose();now.tank.dispose();}
}}finally{restore();}
console.log(JSON.stringify({pass:true,posedSpentReceivingRays:rays,rows,
 limitation:'Exact raw/physical attributes, ownership, native material and UV response. Inert Canvas fixture does not draw pixels; separate native H/L camouflage check is required.'}));
