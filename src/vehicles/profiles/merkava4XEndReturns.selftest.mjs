import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders,KIT} from '../tankFactoryCore.ts';
import {buildMerkava4X} from './merkavaX.ts';
import {createTankState} from '../../sim/movement.ts';
import {getSpec} from '../specs.ts';

const ID='merkava4_x';
const labels=new Set(['merkava4-x-front-side-return','merkava4-x-front-corner-return','merkava4-x-rear-side-return']);
const beforeProfile='a7cb2366ce25ac6c6e3ff9c9d78ad7bf4c8fa2a6b0f6211ef9d92e6391d127f6';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const source=fs.readFileSync(new URL('./merkavaX.ts',import.meta.url),'utf8');
const oldSource=source.replace("import { addMerkava4XEndReturns } from './merkava4XEndReturns.ts';\n",'')
  .replace('  addMerkava4XEndReturns(P);\n','');
assert.equal(hash(oldSource),beforeProfile,'Authenticate the complete prechange profile, not a refreshed native baseline');
const material=new T.MeshBasicMaterial({side:T.DoubleSide});
const v=a=>new T.Vector3(...a);
const hits=(meshes,p,d,far)=>new T.Raycaster(v(p),v(d),0,far).intersectObjects(meshes,false);
const stats={builds:0,contacts:0,oldGapWitnesses:0,phases:0,instances:0,triangleTests:0,
  rejectedAabbs:0,containmentExclusions:0,capPlanePairs:0,gearMeshes:new Set(),stockTypes:new Set(),negativeControls:0};

function geometryHash(g){
  const h=crypto.createHash('sha256');
  for(const name of Object.keys(g.attributes).sort()){
    const a=g.attributes[name];h.update(name);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
  }
  if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));
  return h.digest('hex');
}
function capture(quality,omit=false){
  const old=[],added=[],retained=[];
  registerProfiledBuilders({[ID]:P=>buildMerkava4X(new Proxy(P,{get(target,key){
    if(!['add','addEquipment','addMudguard'].includes(key))return Reflect.get(target,key);
    return (...args)=>{
      const at=key==='addMudguard'?1:0,slot=args[at],g=args[at+1];
      const isNew=key==='addMudguard'&&labels.has(args[0]);
      if(isNew&&omit){g.dispose();return;}
      const transformed=KIT.xform(g.clone(),...args.slice(at+2));
      if(!isNew)retained.push([key,at?args[0]:null,slot,geometryHash(transformed)]);
      if(slot.startsWith('hull')){
        const mesh=new T.Mesh(transformed,material);mesh.name=at?args[0]:slot;
        mesh.userData.bucket=slot;mesh.updateMatrixWorld(true);(isNew?added:old).push(mesh);
      }else transformed.dispose();
      return target[key](...args);
    };
  }}))});
  try{
    const tank=createTank(ID,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
    tank.root.updateMatrixWorld(true);return {tank,old,added,retained};
  }finally{registerProfiledBuilders({[ID]:buildMerkava4X});}
}
function dispose(c){c.tank.dispose();[...c.old,...c.added].forEach(m=>m.geometry.dispose());}
function closed(g){
  const a=g.attributes.position,index=g.index,edges=new Map();let vol=0;
  for(let i=0;i<(index?.count??a.count);i+=3){
    const p=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(a,index?index.getX(i+j):i+j));
    vol+=p[0].dot(p[1].clone().cross(p[2]))/6;
    const keys=p.map(q=>q.toArray().map(n=>Math.round(n*1e6)).join(','));
    for(let j=0;j<3;j++){
      const a=keys[j],b=keys[(j+1)%3],key=[a,b].sort().join('|'),row=edges.get(key)??[0,0];
      row[0]++;row[1]+=a<b?1:-1;edges.set(key,row);
    }
  }
  assert.ok(vol>1e-5,'Positive finite outward stock');
  assert.ok([...edges.values()].every(([n,w])=>n===2&&w===0),'Closed caps, folds and walls with opposing edge winding');
}
// Recover every plane from actual emitted triangles, not a nominal box.
function assertSeparatedCapPlanes(cap,receiver){
  const planes=mesh=>{
    const p=mesh.geometry.attributes.position,index=mesh.geometry.index,out=[];
    for(let i=0;i<(index?.count??p.count);i+=3){
      const a=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j));
      const n=a[1].clone().sub(a[0]).cross(a[2].clone().sub(a[0])).normalize(),d=n.dot(a[0]);
      if(!out.some(q=>q.n.distanceToSquared(n)<1e-12&&Math.abs(q.d-d)<2e-7))out.push({n,d,p:a[0]});
    }
    assert.equal(out.length,6,'Actual closed plain cap/flap has six finite planes');return out;
  };
  let pairs=0;
  for(const a of planes(cap))for(const b of planes(receiver))if(Math.abs(a.n.dot(b.n))>1-1e-8){
    assert.ok(Math.abs(a.n.dot(b.p)-a.d)>.001,
      'Every parallel new cap plane is separated from the unchanged rubber receiver by >1 mm');pairs++;
  }
  assert.equal(pairs,12);return pairs;
}
function contact(c){
  const front=c.added.filter(m=>m.name==='merkava4-x-front-side-return');
  const rear=c.added.filter(m=>m.name==='merkava4-x-rear-side-return');
  const corners=c.added.filter(m=>m.name.endsWith('corner-return'));
  const frontRows=[[3.02,1.782],[3.15,1.762],[3.30,1.762],[3.45,1.762],[3.60,1.762],[3.74,1.762]];
  const rearRows=[-3.64,-3.58,-3.50,-3.43,-3.38,-3.25,-3.10,-3.00];
  for(const side of[-1,1]){
    for(const [z,x]of frontRows)for(const dx of[-.001,0,.001]){
      const a=hits(c.old,[side*(x+dx),1.8,z],[0,-1,0],1)[0];
      const b=hits(front,[side*(x+dx),1.8,z],[0,-1,0],1)[0];
      assert.ok(a&&b&&a.point.y-b.point.y>.001&&a.point.y-b.point.y<.004,
        `Finite front flange is embedded inside the actual unchanged guard roof: ${side}/${z}/${x+dx} ${a?.point.y}/${b?.point.y}`);stats.contacts++;
    }
    for(const z of rearRows)for(const x of[1.731,1.733,1.735]){
      const a=hits(c.old,[side*x,1.8,z],[0,-1,0],.7)[0];
      const b=hits(rear,[side*x,1.8,z],[0,-1,0],.7)[0];
      assert.ok(a&&b&&a.point.y-b.point.y>.001&&a.point.y-b.point.y<.004,
        `Finite rear flange is embedded in the actual existing roof, including its fold: ${side}/${z}/${x} ${a?.point.y}/${b?.point.y}`);stats.contacts++;
    }
    for(const [z,skins]of [[2.997,front],[3.000,front],[-2.979,rear],[-2.976,rear],[-2.973,rear]])
    for(const y of[1.190,1.205,1.220]){
      const receiving=c.old.filter(m=>{
        const b=new T.Box3().setFromObject(m),center=b.getCenter(new T.Vector3());
        return Math.abs(center.x-side*1.8384)<1e-5&&Math.abs(b.max.y-1.25)<1e-5
          &&Math.abs(center.z-(z>0?2.636:-2.614))<1e-5;
      });
      assert.equal(receiving.length,1,'Exact pre-existing rounded last-skirt receiver, not an assumed full box');
      if(z===3||z===-2.979)assert.equal(hits(receiving,[side*1.94,1.24,z],[-side,0,0],.20).length,0,
        'Preserve the original rounded-corner air witness rather than certifying its bounding box as stock');
      const old=hits(receiving,[side*1.94,y,z],[-side,0,0],.20).map(h=>side*h.point.x);
      const skin=hits(skins,[side*1.94,y,z],[-side,0,0],.20).map(h=>side*h.point.x);
      assert.ok(old.length>=2&&skin.length>=2,`Actual finite receiving and added stock both have entry/exit faces: ${side}/${z}/${y} old=${old} new=${skin}`);
      assert.ok(Math.min(Math.max(...old),Math.max(...skin))-Math.max(Math.min(...old),Math.min(...skin))>.0005,
        `Positive overlap with actual rounded skirt stock: ${side}/${z}/${y} old=${old} new=${skin}`);stats.contacts++;
    }
    for(const y of[.86,.92,1.00])for(const x of[1.714,1.718,1.722]){
      const a=hits(c.old,[side*x,y,3.85],[0,0,-1],.16)[0];
      const b=hits(corners,[side*x,y,3.85],[0,0,-1],.16)[0];
      assert.ok(a&&b&&b.point.z-a.point.z>.001&&b.point.z-a.point.z<.004,
        'Finite cap separates its exposed plane from the unchanged rubber flap');
      const old=hits(c.old.filter(m=>m.name==='merkava4-x-front-flap'),[side*x,y,3.85],[0,0,-1],.16).map(h=>h.point.z);
      const added=hits(corners,[side*x,y,3.85],[0,0,-1],.16).map(h=>h.point.z);
      assert.ok(old.length>=2&&added.length>=2
        &&Math.min(Math.max(...old),Math.max(...added))-Math.max(Math.min(...old),Math.min(...added))>.040,
        'Actual entry/exit stock retains more than 40 mm positive lap');stats.contacts++;
    }
    const cap=corners.find(m=>new T.Box3().setFromObject(m).getCenter(new T.Vector3()).x*side>0);
    const flap=c.old.find(m=>m.name==='merkava4-x-front-flap'&&new T.Box3().setFromObject(m).getCenter(new T.Vector3()).x*side>0);
    assert.ok(cap&&flap);stats.capPlanePairs+=assertSeparatedCapPlanes(cap,flap);
    for(const depth of[.045,.049]){
      const predecessor=new T.Mesh(KIT.xform(KIT.box(.072,.235,depth),side*1.748,.928,3.760,-.13),material);
      assert.throws(()=>assertSeparatedCapPlanes(predecessor,flap),
        'Original cap and depth-only correction retain forbidden coincident finite planes');
      predecessor.geometry.dispose();stats.negativeControls++;
    }
    for(const y of[.86,.93,1.00]){
      assert.ok(hits(front,[side*1.778,y,3.83],[0,0,-1],.12).length);
      assert.ok(hits(corners,[side*1.778,y,3.83],[0,0,-1],.12).length,
        'Finite side and end folds overlap');stats.contacts++;
    }
    for(const [z,y,skins]of [[3.15,.95,front],[3.45,.95,front],[3.60,1.05,front],
      [-3.55,1.25,rear],[-3.42,1.30,rear],[-3.15,1.35,rear]]){
      assert.equal(hits(c.old,[side*2.04,y,z],[-side,0,0],.30).length,0,
        'The historical missing upper side remains a failing witness');
      assert.ok(hits(skins,[side*2.04,y,z],[-side,0,0],.30).length,
        'Finite skin closes the independently documented missing source-side region');stats.oldGapWitnesses++;
    }
    for(const y of[.45,.58,.65])for(const z of[3.05,3.25,3.45,3.65,3.75])
      assert.equal(hits(c.added,[side*2.04,y,z],[-side,0,0],1).length,0,'Lower front moving mouth remains open');
    for(const y of[.80,.95,1.14])for(const z of rearRows)
      assert.equal(hits(c.added,[side*2.04,y,z],[-side,0,0],1).length,0,'Source rear air below1.15m is retained');
  }
  const right=hits(rear,[2,1.30,-3.42],[-1,0,0],.5)[0];
  const left=hits(rear,[-2,1.30,-3.42],[1,0,0],.5)[0];
  assert.ok(right&&left&&Math.abs(right.point.x-1.752)<2e-6&&Math.abs(left.point.x+1.780)<2e-6,
    'Measured right-side recess survives instead of becoming a symmetric outer box');
}
// Convex pieces are recovered from the actual emitted, concave L-section.
// No AABB is used as occupied stock. The two quads exactly partition its ring.
function hull(points){
  const planes=[],box=new T.Box3().setFromPoints(points);
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++)for(let k=j+1;k<points.length;k++){
    const n=points[j].clone().sub(points[i]).cross(points[k].clone().sub(points[i]));
    if(n.lengthSq()<1e-16)continue;n.normalize();let d=-n.dot(points[i]);
    const ds=points.map(p=>n.dot(p)+d),lo=Math.min(...ds),hi=Math.max(...ds);
    if(lo < -2e-7 && hi > 2e-7)continue;
    if(lo>=-2e-7){n.negate();d=-d;}
    if(!planes.some(p=>p.n.distanceToSquared(n)<1e-12&&Math.abs(p.d-d)<2e-7))planes.push({n,d});
  }
  assert.ok(planes.length>=6,'Finite convex occupied component');return {planes,box};
}
function occupied(mesh){
  const p=mesh.geometry.attributes.position;
  if(mesh.name.endsWith('corner-return'))return [hull(Array.from({length:p.count},(_,i)=>new T.Vector3().fromBufferAttribute(p,i)))];
  const pieces=[];
  const cells=mesh.name.includes('front-side')?6:7;
  assert.equal(p.count,cells*36+24,'Authenticate emitted finite six-vertex L-loft cells and caps');
  for(let s=0;s<cells;s++){
    const a=[],b=[];
    for(let i=0;i<6;i++){
      a.push(new T.Vector3().fromBufferAttribute(p,s*36+i*6));
      b.push(new T.Vector3().fromBufferAttribute(p,s*36+i*6+5));
    }
    if(a[0].x<0){a.reverse();b.reverse();}
    for(const quad of [[0,1,4,5],[1,2,3,4]])pieces.push(hull([...quad.map(i=>a[i]),...quad.map(i=>b[i])]));
  }
  return pieces;
}
function triangleIntersects(points,solid){
  let poly=points;
  for(const {n,d} of solid.planes){
    const next=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i],b=poly[(i+1)%poly.length],da=n.dot(a)+d+1e-7,db=n.dot(b)+d+1e-7;
      if(da<=0)next.push(a);
      if((da<0)!==(db<0))next.push(a.clone().lerp(b,da/(da-db)));
    }
    poly=next;if(poly.length<3)return false;
  }
  let area=0;for(let i=1;i<poly.length-1;i++)area+=poly[i].clone().sub(poly[0]).cross(poly[i+1].clone().sub(poly[0])).length();
  return area>1e-12;
}
function movingStock(tank,solids,check=true){
  const rig=tank.root.getObjectByName('rig_hull'),inverse=rig.matrixWorld.clone().invert();
  const matrix=new T.Matrix4(),box=new T.Box3(),triBox=new T.Box3();
  let penetrations=0;
  rig.traverse(mesh=>{
    if(!mesh.isMesh||!mesh.userData.runningGear)return;
    stats.gearMeshes.add(mesh.name);stats.stockTypes.add(mesh.isInstancedMesh?'instanced':'merged');
    const g=mesh.geometry,p=g.attributes.position,index=g.index,n=index?index.count:p.count;
    // The carrier is deformed in place. Construction-time boxes are stale
    // and cannot exclude current occupied stock from the physical proof.
    g.computeBoundingBox();
    for(let instance=0;instance<(mesh.isInstancedMesh?mesh.count:1);instance++){
      if(mesh.isInstancedMesh)mesh.getMatrixAt(instance,matrix);else matrix.identity();
      matrix.premultiply(mesh.matrixWorld).premultiply(inverse);stats.instances++;
      box.copy(g.boundingBox).applyMatrix4(matrix);
      const candidates=solids.filter(s=>box.intersectsBox(s.box));
      if(!candidates.length){stats.rejectedAabbs++;continue;}
      if(check)for(const s of candidates){
        // Surface clipping also catches an entire gear component inside a
        // folded cell. The opposite containment could otherwise hide with no
        // intersecting gear face: conservatively reject any native mesh box
        // capable of enclosing a complete new convex cell. A disjoint portion
        // of the real cell's bounds rules that case out; this is not an AABB
        // substituted for occupied stock. Ambiguous enclosure must fail.
        assert.ok(!box.containsBox(s.box),'No new convex fender cell may hide wholly inside native gear stock');
        stats.containmentExclusions++;
      }
      // Indexed and nonindexed, visible and hidden far shoes, complete open
      // and closed finite surfaces: none is dropped by an oracle-name filter.
      for(let i=0;i<n;i+=3){
        const tri=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(matrix));
        triBox.setFromPoints(tri);
        for(const s of candidates)if(triBox.intersectsBox(s.box)){
          stats.triangleTests++;if(triangleIntersects(tri,s))penetrations++;
        }
      }
    }
  });
  if(check)assert.equal(penetrations,0,'No actual moving stock finite surface may enter the new folded stock');
  return penetrations;
}
function nativeGearHash(tank){
  const out=[];tank.root.traverse(m=>{if(m.isMesh&&m.userData.runningGear)out.push([m.name,
    geometryHash(m.geometry),m.matrixWorld.toArray(),m.count??1,m.isInstancedMesh?hash(Buffer.from(m.instanceMatrix.array.buffer)):null]);});
  return hash(JSON.stringify(out));
}

for(const quality of ['high','low']){
  const before=capture(quality,true),c=capture(quality);
  try{
    assert.deepEqual(c.retained,before.retained,'All pre-existing profile-authored geometry and paint/rubber/equipment buckets stay exact');
    assert.equal(nativeGearHash(c.tank),nativeGearHash(before.tank),'Actual native complete running gear remains byte-identical');
    assert.equal(c.added.length,6,'Bilateral front skins, front corners and rear upper returns');
    for(const m of c.added)closed(m.geometry);
    contact(c);
    const bounds=new T.Box3().setFromObject(before.tank.root),afterBounds=new T.Box3().setFromObject(c.tank.root);
    assert.ok(bounds.min.distanceTo(afterBounds.min)<1e-7&&bounds.max.distanceTo(afterBounds.max)<1e-7,'Whole-vehicle envelope is unchanged');
    const solids=c.added.flatMap(occupied),state=createTankState(getSpec(ID),v([0,0,0]),0);
    movingStock(c.tank,solids);
    // Adversarial finite skin through the actual front end-wheel demonstrates
    // that complete-stock traversal/intersection cannot vacuously pass.
    const mutant=hull([1.70,1.80].flatMap(x=>[.80,.94].flatMap(y=>[3.20,3.32].map(z=>v([x,y,z])))));
    assert.ok(movingStock(c.tank,[mutant],false)>0,'An inboard floating fender must fail physical stock clearance');stats.negativeControls++;
    for(const terrain of [null,()=>1,()=>-1,(x,z)=>.035*Math.sin(z*2.1)+.025*x]){
      c.tank.setGroundSampler(terrain);
      for(let phase=0;phase<=64;phase++){
        // At least one full revolution of every .3467 m-or-smaller rotor,
        // plus distinct near/far link phase samples at the rounded nose.
        state.trackScroll.l=phase/64*(2*Math.PI*.3467);state.trackScroll.r=-phase/64*(2*Math.PI*.360);
        state.visualPitch=terrain?.(0,0)===1?.10:0;state.visualRoll=terrain?.(0,0)===-1?-.08:0;
        state.yaw=.31;c.tank.syncFromState(state,1/60,10);c.tank.root.updateMatrixWorld(true);
        movingStock(c.tank,solids);stats.phases++;
      }
    }
    const hullMesh=c.tank.root.getObjectByName('hull');
    for(const name of ['hullTrackGuardL','hullTrackGuardR']){
      const m=c.tank.root.getObjectByName(name);
      assert.ok(m?.isMesh&&m.visible&&m.userData.trackGuard);
      assert.equal(m.userData.appearanceRole,'armorPaint');assert.equal(m.userData.combatHitboxRole,'nonArmor');
      assert.equal(m.material,hullMesh.material,'Native body camo material, not black rubber or equipment cloth');
      assert.equal(m.parent.name,'rig_hull');
      const beforeCount=m.geometry.attributes.position.count;
      for(const era of c.tank.root.userData.eraClusterNames??[])c.tank.stripEra(era);
      assert.equal(m.geometry.attributes.position.count,beforeCount,'Permanent folded skin survives spent ERA');
      c.tank.resetEra();
    }
    stats.builds++;
  }finally{dispose(before);dispose(c);}
}
assert.ok(stats.gearMeshes.has('gearTrackBandL')&&stats.gearMeshes.has('gearTrackBandR'),'Both actual deforming bands included');
assert.ok(stats.gearMeshes.has('gearTrackPadsSimplified'),'Actual far shoes included despite visibility');
assert.equal(stats.stockTypes.size,2,'Merged and instanced physical stock both included');
material.dispose();
console.log(JSON.stringify({pass:true,...stats,gearMeshes:[...stats.gearMeshes],stockTypes:[...stats.stockTypes],
  limits:'Finite triangle/occupied-fold intersections at sampled actual poses, including compression/droop requests. Not an all-terrain or continuous-time certificate; source comparison is separately hash-pinned.'}));
