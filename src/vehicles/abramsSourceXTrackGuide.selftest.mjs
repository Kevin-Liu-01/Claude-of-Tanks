import { trackGuideGeometry } from './profiles/abramsSourceXTrackShoe.ts';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from './tankFactory.ts';
import {KIT} from './tankFactoryCore.ts';
import {ABRAMS_SOURCE_X_IDS} from './abramsSourceXSpecs.ts';
import {ABRAMS_SOURCE_X_GUIDE_PROFILE as PROFILE} from './profiles/abramsSourceXHull.ts';
import {getSpec} from './specs.ts';
import {createTankState} from '../sim/movement.ts';

// Independent source120 intervals, selected OBJ85c33cee…bd29, canonical
// [-rawX, rawY+.203945, .357965-rawZ]. Ground guide is a thin hollow wedge,
// not the source119 broad belt and not an inferred engagement-tooth count.
const SOURCE = [[.075,1.440958141,1.410661378],[.10,1.437824855,1.413864798],
  [.15,1.431554635,1.420271685],[.18,1.427792282,1.424115819]];
const material=new T.MeshBasicMaterial({side:T.DoubleSide});
const hash=value=>createHash('sha256').update(value).digest('hex');
function bytes(a){return Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength);}
function geometryHash(g){const h=createHash('sha256');for(const key of Object.keys(g.attributes).sort())h.update(key).update(bytes(g.attributes[key]));if(g.index)h.update(bytes(g.index));return h.digest('hex');}
function triangles(g){
  const result=[],keys=Object.keys(g.attributes).sort(),count=g.index?.count??g.attributes.position.count;
  for(let i=0;i<count;i+=3){const corners=[0,1,2].map(k=>{const v=g.index?g.index.getX(i+k):i+k;return keys.map(key=>{const a=g.attributes[key];return[key,...Array.from({length:a.itemSize},(_,c)=>a.getComponent(v,c))];});});
    result.push([0,1,2].map(k=>JSON.stringify([...corners.slice(k),...corners.slice(0,k)])).sort()[0]);}
  return result.sort();
}
function subtract(a,b){const counts=new Map();for(const x of b)counts.set(x,(counts.get(x)||0)+1);return a.filter(x=>{const n=counts.get(x)||0;if(n){counts.set(x,n-1);return false;}return true;});}
function closure(g){
  const edges=new Map(),p=g.attributes.position;let volume=0;
  assert.deepEqual(Object.keys(g.attributes).sort(),['normal','position','uv']);
  for(const a of Object.values(g.attributes))assert.ok(Array.from(a.array).every(Number.isFinite));
  const key=v=>v.toArray().map(x=>Math.round(x*1e8)).join(',');
  for(let i=0;i<p.count;i+=3){const vs=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,i+k));
    const area=vs[1].clone().sub(vs[0]).cross(vs[2].clone().sub(vs[0])).lengthSq();
    assert.ok(area>1e-20,'no collapsed guide triangle');volume+=vs[0].dot(vs[1].clone().cross(vs[2]))/6;
    for(let k=0;k<3;k++){const a=key(vs[k]),b=key(vs[(k+1)%3]),edge=[a,b].sort().join('|');edges.set(edge,(edges.get(edge)||0)+(a<b?1:-1));}}
  assert.ok(volume>0,'closed guide points outward');assert.ok([...edges.values()].every(x=>x===0),'all guide stock edges oppose');
}
function make(id,quality,legacy=false){
  const build=KIT.buildRunningGear;let config,gear;
  KIT.buildRunningGear=(P,cfg)=>{config=cfg;if(legacy){assert.ok(cfg.trackGuideProfile);cfg={...cfg};delete cfg.trackGuideProfile;}gear=build(P,cfg);return gear;};
  try{return{tank:createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,batchStatic:false,camoSeed:4242}),config,gear};}
  finally{KIT.buildRunningGear=build;}
}
function bodyRows(root){
  root.updateMatrixWorld(true);const rows=[];
  root.traverse(o=>{if(!o.isMesh)return;const pad=/^gearTrackPads(?:Simplified)?$/.test(o.name);
    rows.push([o.name,pad?null:geometryHash(o.geometry),o.matrixWorld.toArray(),o.instanceMatrix?hash(bytes(o.instanceMatrix)):null]);});
  return rows;
}
function proxy(geometry,matrix){const m=new T.Mesh(geometry,material);m.matrixWorld.copy(matrix);geometry.computeBoundingBox();return{mesh:m,box:geometry.boundingBox.clone().applyMatrix4(matrix)};}
function gearProxies(root){
  const list=[],matrix=new T.Matrix4();root.updateMatrixWorld(true);
  root.traverse(o=>{if(!o.isMesh||!/^gear/.test(o.name)||/^gearTrack/.test(o.name))return;
    if(o.isInstancedMesh){for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);list.push({...proxy(o.geometry,o.matrixWorld.clone().multiply(matrix)),name:o.name,index:i});}}
    else{assert.ok(!o.isBatchedMesh,'test owns separate stock path');list.push({...proxy(o.geometry,o.matrixWorld),name:o.name});}});return list;
}
const raycaster=new T.Raycaster(),componentCache=new WeakMap();
function components(g){
  if(componentCache.has(g))return componentCache.get(g);
  const p=g.attributes.position,count=(g.index?.count??p.count)/3,parent=Array.from({length:count},(_,i)=>i),vertices=new Map();
  const find=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  for(let face=0;face<count;face++)for(let k=0;k<3;k++){
    const i=g.index?g.index.getX(face*3+k):face*3+k,key=[p.getX(i),p.getY(i),p.getZ(i)].map(x=>Math.round(x*1e6)).join(',');
    if(vertices.has(key))parent[find(face)]=find(vertices.get(key));else vertices.set(key,face);
  }
  const ids=parent.map((_,i)=>find(i)),boxes=new Map();
  for(let face=0;face<count;face++)for(let k=0;k<3;k++){
    const id=ids[face],box=boxes.get(id)||new T.Box3(),i=g.index?g.index.getX(face*3+k):face*3+k;
    box.expandByPoint(new T.Vector3().fromBufferAttribute(p,i));boxes.set(id,box);
  }
  const result={ids,boxes};componentCache.set(g,result);return result;
}
function inside(stock,point){
  if(!stock.box.containsPoint(point))return false;
  const {ids,boxes}=components(stock.mesh.geometry),local=point.clone().applyMatrix4(stock.mesh.matrixWorld.clone().invert());
  const possible=new Set([...boxes].filter(([,box])=>box.containsPoint(local)).map(([id])=>id));
  if(!possible.size)return false;
  for(const sign of[-1,1]){const dir=new T.Vector3(sign,0,0);raycaster.set(point,dir);raycaster.near=1e-7;raycaster.far=4;
    const intervals=new Map();
    for(const hit of raycaster.intersectObject(stock.mesh,false)){
      const id=ids[hit.faceIndex];if(!possible.has(id))continue;
      const distances=intervals.get(id)||[];
      if(!distances.length||Math.abs(hit.distance-distances.at(-1))>1e-7)distances.push(hit.distance);
      intervals.set(id,distances);
    }
    // Per-connected-stock parity, not normal sign. This retains overlapping
    // solids as a union and handles historically reversed tooth winding.
    if([...intervals.values()].some(distances=>distances.length%2))return true;}
  return false;
}

// A reversed external box is still outside; two overlapping independent
// solids must not cancel one another in a whole-mesh even-parity shortcut.
{
  const a=new T.BoxGeometry(.04,.04,.04).translate(.08,0,0),index=a.index;
  for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}
  const b=new T.BoxGeometry(.04,.04,.04).translate(.09,0,0),c=new T.BoxGeometry(.04,.04,.04).translate(-.08,0,0);
  const combined=KIT.mergeAll([a,b,c]),s=proxy(combined,new T.Matrix4());
  assert.ok(s.box.containsPoint(new T.Vector3()),'control lies inside the merged broad box, not an AABB shortcut');
  assert.equal(inside(s,new T.Vector3()),false,'inward winding beyond air does not imply point penetration');
  assert.equal(inside(s,new T.Vector3(.085,.001,.003)),true,'overlapping closed stock remains occupied');
  combined.dispose();
}
function guideSamples(g){const p=g.attributes.position,unique=new Map();for(let i=0;i<p.count;i+=3){const v=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,i+k));
  for(const point of[...v,v[0].clone().add(v[1]).add(v[2]).divideScalar(3),...v.map((a,k)=>a.clone().add(v[(k+1)%3]).multiplyScalar(.5))])unique.set(point.toArray().join(','),point);}
  return[...unique.values()];}
let occupiedChecks=0,neighborChecks=0,phaseChecks=0,articulationChecks=0;
function sweep(build,quality){
  const {tank,gear}=build,pads=tank.root.getObjectByName('gearTrackPads'),pitch=pads.userData.trackShoePitchM;
  const guide=trackGuideGeometry(pitch,PROFILE),samples=guideSamples(guide),matrix=new T.Matrix4();closure(guide);
  const failures=[];
  const state=createTankState(getSpec('m1a2_sepv2_x'),new T.Vector3(),0);
  const samplers=[null,(x,z)=>.065*Math.exp(-(((z-.8)/.6)**2)),
    (x,z)=>-.07*Math.exp(-(((z+.9)/.7)**2))+.035*Math.sin(x*2+z*.6)];
  try{for(const[pose,sampler]of samplers.entries()){
   if(sampler){
    const road=tank.root.getObjectByName('gearRoadWheelTires'),before=Array.from(road.instanceMatrix.array);
    for(let step=0;step<24;step++){gear.conform(state,sampler,0,0,1/30);gear.update(0,0,1/30);}
    assert.notDeepEqual(Array.from(road.instanceMatrix.array),before,'the test actually articulates road axles, not only whole-root yaw');articulationChecks++;
   }
   for(let phase=0;phase<16;phase++){
    gear.update(pitch*phase/16,-pitch*phase/16,1/60);tank.root.updateMatrixWorld(true);
    const stock=gearProxies(tank.root),guides=[];
    for(let i=0;i<pads.count;i++){pads.getMatrixAt(i,matrix);guides.push(proxy(guide,pads.matrixWorld.clone().multiply(matrix)));}
    for(let i=0;i<guides.length;i++)for(const local of samples){const point=local.clone().applyMatrix4(guides[i].mesh.matrixWorld);
      for(const target of stock){occupiedChecks++;if(inside(target,point)){if(failures.length<8)failures.push({pose,phase,shoe:i,stock:target.name,index:target.index,point:point.toArray()});}}
      const half=guides.length/2,base=i<half?0:half,relative=i-base;
      for(const offset of[-1,1]){const j=base+(relative+offset+half)%half;neighborChecks++;if(inside(guides[j],point)&&failures.length<8)failures.push({pose,phase,shoe:i,neighbor:j,point:point.toArray()});}}
    phaseChecks++;
  }}}finally{guide.dispose();}
  assert.deepEqual(failures,[],`${quality}: actual guide stock must clear every gear solid and neighbouring moving guide`);
}
function sourceSections(build){
  const pads=build.tank.root.getObjectByName('gearTrackPads'),g=trackGuideGeometry(pads.userData.trackShoePitchM,PROFILE);
  const m=new T.Mesh(g,material);m.rotation.x=Math.PI;m.position.set(1.42596,.025,.357965);m.updateMatrixWorld(true);
  try{for(const[y,right,left]of SOURCE){for(const[origin,direction,want]of[[[1.5,y,.357965],[-1,0,0],right],[[1.35,y,.357965],[1,0,0],left]]){
    const hit=new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction),0,.2).intersectObject(m)[0];assert.ok(hit);assert.ok(Math.abs(hit.point.x-want)<.002,'independent source120 outer tapered plane');}}
    for(const y of[.10,.15])assert.equal(new T.Raycaster(new T.Vector3(1.42596,y,.34),new T.Vector3(0,0,1),0,.03).intersectObject(m).length,0,'source guide cavity is real air, not a solid triangle');
    for(const y of[.20,.30])assert.equal(new T.Raycaster(new T.Vector3(1.5,y,.357965),new T.Vector3(-1,0,0),0,.2).intersectObject(m).length,0,'source air above guide');
  }finally{g.dispose();}
}
for(const invalid of[{...PROFILE,wallM:NaN},{...PROFILE,wallM:.1},{...PROFILE,tipDepthRatio:1.2},
  {...PROFILE,stations:[[.012,.01],[.012,.005],[.169,.0002]]},{...PROFILE,cavityTipInwardM:.169}])assert.throws(()=>trackGuideGeometry(.155,invalid),/native guide|Native guide/);

let builds=0;
for(const quality of['high','low'])for(const id of ABRAMS_SOURCE_X_IDS){
  const current=make(id,quality),old=make(id,quality,true);
  try{
    assert.deepEqual(bodyRows(current.tank.root),bodyRows(old.tank.root),`${id}/${quality}: every non-guide visible buffer/owner and every shoe/course matrix stays exact`);
    assert.deepEqual(current.config.trackShoeDimensions,old.config.trackShoeDimensions,'no pad/web/horn legacy scalar change');
    const a=current.tank.root.getObjectByName('gearTrackPads'),b=old.tank.root.getObjectByName('gearTrackPads');
    const g=trackGuideGeometry(a.userData.trackShoePitchM,PROFILE),added=subtract(triangles(a.geometry),triangles(b.geometry)),removed=subtract(triangles(b.geometry),triangles(a.geometry));
    try{assert.deepEqual(added,triangles(g),'only the exact new closed guide is added to each shoe');assert.equal(removed.length,12,'FSP reference is the complete closed ruled legacy-envelope horn, not the historical two-box recipe');closure(g);}finally{g.dispose();}
    const low=current.tank.root.getObjectByName('gearTrackPadsSimplified'),oldLow=old.tank.root.getObjectByName('gearTrackPadsSimplified');
    assert.equal(subtract(triangles(oldLow.geometry),triangles(low.geometry)).length,0,'all old simplified pad/grouser triangles remain');
    assert.equal(low.instanceMatrix,a.instanceMatrix,'one live matrix train across both LODs');
    sourceSections(current);
    if(id==='m1a2_sepv2_x')sweep(current,quality);
    builds++;
  }finally{current.tank.dispose();old.tank.dispose();}
}
assert.equal(builds,14);assert.equal(phaseChecks,96);assert.equal(articulationChecks,4);material.dispose();
console.log(JSON.stringify({test:'Abrams source120 guide',actualBuilds:28,pairedQualityVariantChecks:builds,completeBilateralPhaseChecks:phaseChecks,articulationChecks,occupiedChecks,neighborChecks,status:'PASS'}));
