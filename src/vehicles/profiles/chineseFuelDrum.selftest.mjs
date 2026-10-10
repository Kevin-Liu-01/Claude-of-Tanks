import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT} from './kit.ts';
import {fuelDrumHoop} from './chineseFuelDrum.ts';
import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {shellPart} from '../../../tools/base-shell-audit-math.mjs';
import {shellEdgeTopology} from '../../../tools/base-shell-integrity.mjs';

const ids=['vt4a1','ztz99a2_prototype','ztz99a2','cn_t80u_modern','cn_t72b3m_modern','cn_t72b3_modern'];
const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
function mesh(g){const m=new THREE.Mesh(g,mat);m.updateMatrixWorld(true);return m;}
function endFaces(meshes,center,radius,length,side){
 const x=center.x+side*length/2;
 const ray=new THREE.Raycaster(new THREE.Vector3(x+side*.20,center.y+radius*.21,center.z+radius*.137),new THREE.Vector3(-side,0,0),0,.22);
 return ray.intersectObjects(meshes,false).filter(h=>Math.abs(h.point.x-x)<.000002);
}
const pointKey=p=>p.map(v=>Math.round(v*1e5)).join(',');
const triangleKey=v=>v.map(pointKey).sort().join('|');
function geometryTriangles(g){
 const p=g.attributes.position,index=g.index,result=[];
 const {start,count}=g.drawRange;
 for(let i=start;i<Math.min(index?.count??p.count,start+count);i+=3){const indices=[0,1,2].map(j=>index?index.getX(i+j):i+j);
  result.push({start:i,indices,points:indices.map(j=>[p.getX(j),p.getY(j),p.getZ(j)])});}
 return result;
}
function renderedEquipment(tank,parts){
 const caches=new Map(),out=[];
 for(const {bucket,g}of parts){
  let cache=caches.get(bucket);
  if(!cache){const actual=tank.root.getObjectByName(bucket);assert(actual?.isMesh,`actual ${bucket} mesh exists`);
   const triangles=new Map();for(const t of geometryTriangles(actual.geometry)){const key=triangleKey(t.points),rows=triangles.get(key)??[];rows.push(t);triangles.set(key,rows);}
   cache={actual,triangles};caches.set(bucket,cache);}
  for(const source of geometryTriangles(g)){
   const candidates=cache.triangles.get(triangleKey(source.points));
   assert.equal(candidates?.length,1,'tag-selected equipment triangle exists exactly once in the rendered merged buffer');
   const t=candidates[0];out.push({mesh:cache.actual,start:t.start,indices:t.indices,local:t.points});
  }
 }
 return out;
}
function equipmentWorld(observations){
 return observations.map(({mesh,start,indices,local})=>{
  let hullOwned=false;for(let p=mesh;p;p=p.parent){assert(p.visible,'equipment stays rendered');if(p.name==='rig_hull')hullOwned=true;}
  assert(hullOwned,'actual equipment mesh has hull ownership');
  const p=mesh.geometry.attributes.position,range=mesh.geometry.drawRange;
  assert(start>=range.start&&start+3<=Math.min(mesh.geometry.index?.count??p.count,range.start+range.count),'equipment triangle remains in the actual draw range');
  return indices.map((i,j)=>{const point=new THREE.Vector3().fromBufferAttribute(p,i);
   assert.deepEqual(point.toArray(),local[j],'native equipment vertex changed');
   return point.applyMatrix4(mesh.matrixWorld).toArray();});
 });
}
function minimumPitchY(y,z,lo,hi){
 const angles=[lo,hi],stationary=Math.atan2(z,y);
 for(let k=-2;k<=2;k++){const a=stationary+k*Math.PI;if(a>lo&&a<hi)angles.push(a);}
 return Math.min(...angles.map(a=>y*Math.cos(a)+z*Math.sin(a)));
}
function continuousMainGunClearance(tank,id,observations){
 const spec=getSpec(id),root=tank.root,gun=root.getObjectByName('rig_gun'),turret=root.getObjectByName('rig_turret'),recoil=root.getObjectByName('rig_recoil');
 assert.equal(spec.gunPitchByYawDeg,undefined,'no hidden yaw-dependent capability reduction');
 assert.equal(spec.gunDepressionDeg,6);assert.equal(spec.gunElevationDeg,14);
 // Capture actual native vertices before playing the real recuperator.
 root.updateMatrixWorld(true);const inverse=gun.matrixWorld.clone().invert(),vertices=[];
 gun.traverse(m=>{if(!m.isMesh||m.userData.shadowOnly||m.userData.authoredShadowProxy)return;
  let moving=false;for(let p=m;p&&p!==gun;p=p.parent)if(p===recoil)moving=true;
  const matrix=inverse.clone().multiply(m.matrixWorld),p=m.geometry.attributes.position;
  for(let i=0;i<p.count;i++)vertices.push({v:new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix),moving});});
 const state=createTankState(spec,new THREE.Vector3(),0);tank.syncFromState(state,0);
 tank.recoilKick(0,1);tank.syncFromState(state,.12);
 const travel=-recoil.position.z,kick=-gun.rotation.x;
 assert(travel>.13&&travel<.14&&kick>.013&&kick<.015,'actual cannon recuperator supplies stroke and pitch-rock endpoints');
 tank.syncFromState(state,.8);gun.rotation.x=0;turret.rotation.y=0;recoil.position.z=0;root.updateMatrixWorld(true);
 const lo=-spec.gunDepressionDeg*Math.PI/180,hi=spec.gunElevationDeg*Math.PI/180+kick;
 let min=Infinity;
 // Pitch is a sinusoid: endpoints plus stationary angles give its exact
 // minimum. Recoil is linear for fixed pitch, so its two endpoints suffice.
 // Every triangle is affine in its vertices, and yaw cannot change Y. The
 // resulting separating horizontal plane covers all intermediate poses.
 for(const {v,moving}of vertices)for(const stroke of moving?[0,travel]:[0])
  min=Math.min(min,minimumPitchY(v.y,v.z-stroke,lo,hi)+gun.position.y+turret.position.y);
 const rootInverse=root.matrixWorld.clone().invert();let max=-Infinity;
 for(const {mesh,indices}of observations){const matrix=rootInverse.clone().multiply(mesh.matrixWorld),p=mesh.geometry.attributes.position;
  for(const i of indices)max=Math.max(max,new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix).y);}
 return {minimumGunY:min,maximumEquipmentY:max,gap:min-max,pitch:[lo*180/Math.PI,hi*180/Math.PI],recoil:travel};
}
// Historical exact failure: body and two capped overlays terminate at the
// same axial coordinates. Ray fan catches two physically coincident faces.
const old=[mesh(KIT.cylX(.32,.80,24)),mesh(KIT.cylX(.325,.03,24).translate(.385,0,0)),mesh(KIT.cylX(.325,.03,24).translate(-.385,0,0))];
for(const side of [-1,1])assert.equal(endFaces(old,new THREE.Vector3(),.32,.80,side).length,2,'negative control reproduces exact duplicate cap planes');
for(const m of old)m.geometry.dispose();
for(const segments of [32,48]){
 const g=fuelDrumHoop(.327,.026,.020,segments),part=shellPart(g);
 assert.deepEqual(shellEdgeTopology(part),{boundary:0,nonmanifold:0,inconsistent:0},'hollow hoop is finite coherent steel');
 assert(part.volume>0,'outward hoop winding');
 assert.equal(new THREE.Raycaster(new THREE.Vector3(1,.1,.1),new THREE.Vector3(-1,0,0)).intersectObject(mesh(g)).length,0,'rim has real open centre');
 for(const [index,t] of part.triangles.entries()){
  const normal=t.triangle.getNormal(new THREE.Vector3()),p=g.attributes.normal,i=index*3;
  // Faceted geometry has the same outward sign as its smooth radial normals.
  assert(normal.dot(new THREE.Vector3().fromBufferAttribute(p,i))>.97,'annular face shading is outward');
 }
 g.dispose();
}
for(const quality of ['high','low'])for(const id of ids){
 const parts=[];
 const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242,
  partCensus(bucket,g){parts.push({bucket,g,role:g.userData.chineseFuelDrum?.role,cradle:g.userData.chineseFuelCradle,cage:g.userData.chineseModernization});}});
 try{
  tank.root.updateMatrixWorld(true);
  const hull=tank.root.getObjectByName('rig_hull'),turret=tank.root.getObjectByName('rig_turret');
  const bodies=parts.filter(p=>p.role==='body'),hoops=parts.filter(p=>p.role==='end-rim'||p.role==='strap');
  assert.equal(bodies.length,2,`${id}: exactly two actual barrels`);assert.equal(hoops.length,8);
  const targets=parts.filter(p=>p.bucket.startsWith('hull')).map(p=>mesh(p.g));
  for(const body of bodies){
   body.g.computeBoundingBox();const b=body.g.boundingBox,center=b.getCenter(new THREE.Vector3()),radius=(b.max.y-b.min.y)/2,length=b.max.x-b.min.x;
   for(const side of [-1,1]){
    const hits=endFaces(targets,center,radius,length,side);
    assert.equal(hits.length,1,`${id}/${quality}: one exposed end disc on side ${side}`);
    assert(hits[0].face.normal.x*side>.9999,`${id}: disc winding faces outward`);
   }
   assert(shellPart(body.g).volume>0,'finite outward native barrel stock');
  }
  // Fixture mutates the actual native end to prove the end-plane test sees
  // duplication even when the rest of the tank remains unchanged.
  const duplicate=mesh(bodies[0].g.clone());duplicate.geometry.computeBoundingBox();
  const bounds=duplicate.geometry.boundingBox;
  assert.equal(endFaces([...targets,duplicate],bounds.getCenter(new THREE.Vector3()),(bounds.max.y-bounds.min.y)/2,bounds.max.x-bounds.min.x,1).length,2,'duplicated emitted barrel is rejected');
  duplicate.geometry.dispose();
  if(!id.startsWith('cn_')){
   const contains=(g,point)=>new THREE.Raycaster(point,new THREE.Vector3(0,1,0),0,3).intersectObject(mesh(g))[0]?.face.normal.y>0;
   // Four historic angle brackets enter the actual 120 mm transom plate and
   // the vertical barrel straps. Probes are inside their small real laps.
   for(const side of [-1,1])for(const dx of [-.24,.24]){
    const x=side*(.76+dx),root=new THREE.Vector3(x,1.514,-4.047),lap=new THREE.Vector3(x,1.55,-4.505);
    assert(parts.some(p=>p.bucket==='hull'&&contains(p.g,root)),'existing drum bracket enters actual transom');
    const brackets=parts.filter(p=>p.bucket==='hullDark'&&contains(p.g,root));
    assert(brackets.length,'existing bracket reaches the transom lap');
    assert(brackets.some(p=>contains(p.g,lap)),'same bracket extends back into barrel saddle');
    assert(bodies.some(p=>contains(p.g,lap)),'angle bracket ends inside actual curved barrel wall');
   }
  }
  if(id.startsWith('cn_')){
   const native=parts.filter(p=>p.bucket==='hull').map(p=>mesh(p.g));
   const cradles=parts.filter(p=>p.cradle&&!p.cradle.role);assert.equal(cradles.length,4);
   for(const {g,cradle:{root,foot}} of cradles){
    const r=new THREE.Vector3(...root),f=new THREE.Vector3(...foot),dir=f.clone().sub(r).normalize();
    const contact=new THREE.Raycaster(r.clone().addScaledVector(dir,.12),dir.clone().negate(),0,.16).intersectObject(mesh(g))[0];
    assert(contact,'actual cradle enters its hull attachment');
    const hullHit=new THREE.Raycaster(new THREE.Vector3(root[0],root[1],root[2]-.08),new THREE.Vector3(0,0,1),0,.10).intersectObjects(native,false)[0];
    assert(hullHit&&Math.abs(hullHit.point.z-root[2])<1e-5,'native rear hull surface, independent of support receipt');
    const inside=new THREE.Raycaster(f,new THREE.Vector3(0,1,0),0,.5).intersectObjects(bodies.map(p=>mesh(p.g)),false)[0];
    assert(inside?.face.normal.y>0,'cradle foot enters actual curved drum body');
    const moved=mesh(g.clone().translate(0,0,-.30));
    assert.equal(new THREE.Raycaster(r.clone().addScaledVector(dir,.02),dir.clone().negate(),0,.07).intersectObject(moved).length,0,'detached cradle negative control');moved.geometry.dispose();
   }
   const cageRoots=parts.filter(p=>p.cage?.role==='cage-root');assert.equal(cageRoots.length,2);
   const permanent=parts.filter(p=>p.bucket==='turret'||p.bucket==='turretExternalArmor'&&!p.g.userData.eraHitFaceVertexStarts).map(p=>mesh(p.g));
   for(const {g} of cageRoots){
    g.computeBoundingBox();const b=g.boundingBox,center=b.getCenter(new THREE.Vector3());
    const start=new THREE.Vector3(center.x,center.y,b.max.z-.012);
    const supported=point=>permanent.some(m=>{const hit=new THREE.Raycaster(point,new THREE.Vector3(0,1,0),0,2).intersectObject(m)[0];return hit?.face.normal.y>0;});
    assert(supported(start),'cage root enters actual permanent receiving armor');
    assert(!supported(start.clone().add(new THREE.Vector3(4,0,0))),'detached cage negative control');
   }
   // Census tags select intended stock only. Every subsequent observation
   // reads the actual current merged native mesh, after damage and articulation.
   const equipment=parts.filter(p=>p.role||p.cradle);
   const observations=renderedEquipment(tank,equipment);
   const worldBefore=equipmentWorld(observations);
   const panels=parts.filter(p=>p.bucket==='hullExternalArmor'&&Array.isArray(p.g.userData.eraHitFaceVertexStarts));
   assert(panels.length>0,'physical removable hull panels remain present');
   for(const sector of ['turret_era_L','turret_era_R','skirt_era_L','skirt_era_R'])assert(tank.stripEra(sector),`${id}: intended armor sector remains removable`);
   assert.deepEqual(equipmentWorld(observations),worldBefore,'actual rendered drums, rims, straps, caps and cradles survive ERA loss');
   assert(tank.resetEra());
   assert.deepEqual(equipmentWorld(observations),worldBefore,'ERA reset preserves actual permanent equipment');
   for(const yaw of [-Math.PI/2,Math.PI/2,Math.PI]){
    turret.rotation.y=yaw;tank.root.updateMatrixWorld(true);
    assert.deepEqual(equipmentWorld(observations),worldBefore,'actual rendered equipment world vertices stay hull-owned through turret yaw');
   }
   turret.rotation.y=0;tank.root.updateMatrixWorld(true);
   const first=observations[0],position=first.mesh.geometry.attributes.position,i=first.indices[0],saved=position.getY(i);
   position.setY(i,saved+1);
   assert.throws(()=>equipmentWorld(observations),/native equipment vertex changed/,'rendered-buffer damage negative is detected');
   position.setY(i,saved);
   const oldX=first.mesh.position.x;first.mesh.position.x+=.25;tank.root.updateMatrixWorld(true);
   assert.notDeepEqual(equipmentWorld(observations),worldBefore,'misrigged rendered equipment transform is detected');
   first.mesh.position.x=oldX;tank.root.updateMatrixWorld(true);
   const clearance=continuousMainGunClearance(tank,id,observations);
   assert(clearance.gap>.025,`${id}/${quality}: complete legal pitch/recoil/yaw sweep clears every drum fitting: ${JSON.stringify(clearance)}`);
   // Restore precisely the reported former heights on the actual rendered
   // observation, without altering gun capability. This must fail the bound.
   const oldRaise=id==='cn_t80u_modern'?.54:id==='cn_t72b3m_modern'?.62:.58;
   assert(clearance.gap-oldRaise<0,'historical high drum location fails the same independent gun-envelope bound');
   console.log(`${id}/${quality}: continuous full-gun/drum separation ${clearance.gap.toFixed(6)} m; legal pitch ${clearance.pitch.join('..')} deg, recoil ${clearance.recoil.toFixed(6)} m`);
   const lattice=turret.getObjectByName('turretOpenLattice');assert(lattice,'rear cage belongs to rotating turret');
  }
  console.log(`${id}/${quality}: single ends, annular rims, contact, ERA and ownership checked`);
 }finally{tank.dispose();}
}
mat.dispose();
console.log('Chinese drums: historical coplanar-cap negative, actual HIGH/LOW finite rims, native receiving stock and articulated ownership passed');
