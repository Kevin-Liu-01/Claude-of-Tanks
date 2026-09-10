import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from './tankFactory.ts';
import {TANK_SPECS} from './specs.ts';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildLeopard2A6X} from './profiles/leopardA6X.ts';
import {buildLeclercX} from './profiles/leclercX.ts';
import {buildType10X} from './profiles/type10X.ts';
import {AMX40_X_PROFILES} from './profiles/amx40X.ts';
import {GUARD_PRE_PAINT_SHA,beforeRegisteredGuardPaint} from './registeredGuardPaint.test-support.mjs';
import {installCanvasFixture} from './canvasFixture.test-support.mjs';

for(const name of Object.keys(GUARD_PRE_PAINT_SHA)){const source=readFileSync(new URL('./profiles/'+name,import.meta.url),'utf8');
 beforeRegisteredGuardPaint(name,source);assert.throws(()=>beforeRegisteredGuardPaint(name,source+'\n'),'undeclared source edits reject');}
const cases=[
 {id:'leo2a6_x',build:buildLeopard2A6X,label:['a6-fixed-front-guard','a6-fixed-upper-sheet'],count:8},
 {id:'leclerc_x',build:buildLeclercX,label:'leclerc-fixed-bow-guard',count:2},
 {id:'amx40_x',build:AMX40_X_PROFILES.amx40_x.build,label:'amx40-fixed-folded-skirt',count:4},
 {id:'type10_x',build:buildType10X,label:['type10-painted-folded-skirt','type10-painted-upper-fascia','type10-painted-rear-fascia'],count:14},
];
const changed=new Set(['hullDetail','hullPaintedDetail']),keys=['fixedPaintedPanel','materialOnlyPaintMigration','materialOnlyPaintSourceBucket'];
const methods=new Set(['add','addEquipment','addMudguard','addHatch','addCupola','addExternalArmor','addModuleVisual']);
function hash(g){const h=createHash('sha256');for(const key of Object.keys(g.attributes).sort()){
 const a=g.attributes[key];h.update(key).update(String(a.itemSize)).update(String(a.normalized));
 h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
 if(g.index){const a=g.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}return h.digest('hex');}
function witness(g,pose){const p=g.attributes.position,ix=g.index,a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
 let best=-1,result;for(let i=0;i<(ix?.count??p.count);i+=3){a.fromBufferAttribute(p,ix?ix.getX(i):i);b.fromBufferAttribute(p,ix?ix.getX(i+1):i+1);c.fromBufferAttribute(p,ix?ix.getX(i+2):i+2);
  const n=b.clone().sub(a).cross(c.clone().sub(a)),area=n.lengthSq();if(area<=best)continue;best=area;
  result={p:a.clone().add(b).add(c).multiplyScalar(1/3),n:n.normalize()};}
 const[x=0,y=0,z=0,rx=0,ry=0,rz=0]=pose,r=new T.Euler(rx,ry,rz);
 result.p.applyEuler(r).add(new T.Vector3(x,y,z));result.n.applyEuler(r);return{p:result.p.toArray(),n:result.n.toArray()};}
function build(row,quality,camoPattern,inverse=false){const selected=[],emissions=[];
 registerProfiledBuilders({[row.id]:P=>row.build(new Proxy(P,{get(target,key){if(!methods.has(key))return Reflect.get(target,key);
  return(...args)=>{const g=args.find(a=>a?.isBufferGeometry),chosen=[row.label].flat().includes(g?.userData.fixedPaintedPanel),bi=key==='addMudguard'?1:0,gi=args.indexOf(g);
   const meta={...g.userData};if(chosen){assert.ok(key==='addMudguard'||key==='addEquipment');assert.equal(args[bi],'hullPaintedDetail');
    assert.equal(meta.materialOnlyPaintMigration,true);assert.equal(meta.materialOnlyPaintSourceBucket,'hullDetail');
    selected.push({method:key,name:key==='addMudguard'?args[0]:meta.fixedPaintedPanel,hash:hash(g),pose:args.slice(gi+1),witness:witness(g,args.slice(gi+1))});
    for(const k of keys)delete meta[k];}
   emissions.push({method:key,args:args.map((a,i)=>a===g?hash(g):chosen&&i===bi?'FIXED_GUARD_PAINT':a),meta});
   if(chosen&&inverse){args[bi]='hullDetail';for(const k of keys)delete g.userData[k];}
   return target[key](...args);
  };
 }}))});
 try{assert.ok(TANK_SPECS[row.id]);const tank=createTank(row.id,null,{quality,camoPattern,camoSeed:4242,
  proceduralOnly:true,materialMode:'rendered',geometryReceipt:false,batchStatic:false,decor:true});
  assert.equal(tank.root.name,'tank_'+row.id);return{selected,emissions,tank};}
 finally{registerProfiledBuilders({[row.id]:row.build});}
}
function cloud(root){const rows=[],v=new T.Vector3();root.updateMatrixWorld(true);root.traverse(o=>{
 if(!o.isMesh||!changed.has(o.name))return;const p=o.geometry.attributes.position,ix=o.geometry.index;
 for(let i=0;i<(ix?.count??p.count);i+=3){const c=[];for(let j=0;j<3;j++)c.push(v.fromBufferAttribute(p,ix?ix.getX(i+j):i+j).applyMatrix4(o.matrixWorld).toArray().join(','));
  rows.push([0,1,2].map(j=>[c[j],c[(j+1)%3],c[(j+2)%3]].join('|')).sort()[0]);}});return rows.sort();}
function other(root){const rows=[];root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh||changed.has(o.name))return;
 rows.push([o.name,hash(o.geometry),o.matrixWorld.elements,o.material.name,o.material.userData.appearanceRole,
  o.userData.combatHitboxRole,o.count??null,o.instanceMatrix?Array.from(o.instanceMatrix.array):null]);});return rows;}
function paint(tank,prior){const o=tank.root.getObjectByName('hullPaintedDetail');assert.ok(o?.isMesh);
 assert.equal(o.material.name,'cot:armor-paint');assert.equal(o.material.map,tank.root.getObjectByName('hull').material.map);assert.ok(o.material.map?.isTexture);
 assert.equal(o.userData.combatHitboxRole,'nonArmor');assert.equal(o.userData.materialOnlyPaintMigration,true);
 assert.equal(o.userData.materialOnlyPaintSourceBucket,'hullDetail');assert.equal(o.parent.isLOD,true);
 assert.equal(o.parent.parent.name,'rig_hull');assert.deepEqual(o.parent.levels.map(l=>l.distance),prior.parent.levels.map(l=>l.distance));
 const uv=o.geometry.attributes.uv,p=o.geometry.attributes.position,n=o.geometry.attributes.normal;
 assert.ok(uv&&Array.from(uv.array).every(Number.isFinite));
 const scale=TANK_SPECS[tank.root.name.slice(5)].visual.camoScale??.34,us=new Set(),vs=new Set();
 for(let i=0;i<p.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i)),nz=Math.abs(n.getZ(i));
  const u=ny>=nx&&ny>=nz?p.getX(i):nx>=nz?p.getZ(i):p.getX(i),v=ny>=nx&&ny>=nz?p.getZ(i):p.getY(i);
  assert.equal(uv.getX(i),Math.fround(u*scale),'exact spatial camouflage U');assert.equal(uv.getY(i),Math.fround(v*scale),'exact spatial camouflage V');
  us.add(uv.getX(i));vs.add(uv.getY(i));}
 assert.ok(us.size>1&&vs.size>1,'both texture axes vary over the actual stock; a box need not have >8 unique scalar values');return o;}
const restore=installCanvasFixture(),rows=[];let rays=0,emissions=0;
try{for(const row of cases)for(const quality of['high','low'])for(const camo of['factory','winter']){
 const before=build(row,quality,camo,true),after=build(row,quality,camo);
 try{
  assert.equal(after.selected.length,row.count);assert.deepEqual(after.selected,before.selected);
  assert.deepEqual(after.emissions,before.emissions);emissions+=after.emissions.length;
  assert.deepEqual(after.tank.root.userData.__decorSummary,before.tank.root.userData.__decorSummary,row.id+': decoration decisions remain exact');
  const mesh=paint(after.tank,before.tank.root.getObjectByName('hullDetail'));
  for(const yaw of[0,.73,-1.21]){
   for(const{tank}of[before,after]){for(const era of tank.root.userData.eraClusterNames??[])tank.stripEra(era);
    tank.root.position.set(.3,.07,-.4);tank.root.rotation.set(.03,yaw,-.02);tank.root.getObjectByName('rig_turret').rotation.y=-.4*yaw;
    tank.root.getObjectByName('rig_gun').rotation.x=-.12;tank.root.updateMatrixWorld(true);}
   assert.deepEqual(cloud(after.tank.root),cloud(before.tank.root));assert.deepEqual(other(after.tank.root),other(before.tank.root),row.id+': all other parts/finish/pose exact');
   for(const{witness:w}of after.selected){const cast=(tank,targets)=>{const rig=tank.root.getObjectByName('rig_hull');
     return new T.Raycaster(rig.localToWorld(new T.Vector3(...w.p).addScaledVector(new T.Vector3(...w.n),.05)),
      new T.Vector3(...w.n).negate().transformDirection(rig.matrixWorld),0,.10).intersectObjects(targets,false)[0];};
    const a=cast(before.tank,[before.tank.root.getObjectByName('hullDetail'),before.tank.root.getObjectByName('hullPaintedDetail')].filter(Boolean)),b=cast(after.tank,[mesh]);
    assert.ok(a&&b,row.id+': each painted source guard retains a real receiving surface');assert.ok(a.point.distanceTo(b.point)<1e-8);rays++;}
  }
  const map=mesh.material.map;mesh.material.map=null;assert.throws(()=>paint(after.tank,before.tank.root.getObjectByName('hullDetail')));mesh.material.map=map;
  rows.push({id:row.id,quality,camo,selected:row.count,decorTriangles:after.tank.root.userData.__decorSummary.tris});
 }finally{before.tank.dispose();after.tank.dispose();}
}}finally{restore();}
console.log(JSON.stringify({pass:true,originalSources:GUARD_PRE_PAINT_SHA,emissions,posedSpentReceivingRays:rays,rows,
 limitation:'Material-only fixed guards, not flexible flaps. Full physical differential and actual UV/material checks; separate native pixels required.'}));
