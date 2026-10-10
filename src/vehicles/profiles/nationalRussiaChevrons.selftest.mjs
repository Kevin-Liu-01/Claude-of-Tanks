import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {measureGunHullClearance} from './bradleyGunClearance.test-support.mjs';

const IDS=['ru_t80u_modern','ru_t72b3m_modern','ru_t72b3_modern'];
const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
const vec=p=>new THREE.Vector3(...p);
const key=p=>p.toArray().map(v=>v.toFixed(5)).join(',');

function actualLeaf(applique,leaf){
 const normal=vec(leaf.normal),corners=[...leaf.face,...leaf.back.map(p=>vec(p).addScaledVector(normal,.012).toArray())];
 const position=applique.geometry.attributes.position,values=[];
 for(let i=0;i<position.count;i+=3){
  const points=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(position,i+j));
  if(points.every(p=>corners.some(c=>p.distanceTo(vec(c))<2e-6)))for(const p of points)values.push(...p.toArray());
 }
 assert.equal(values.length,108,'complete closed wedge exists in the actual rendered armor buffer');
 return new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(values,3));
}
function closedSolid(geometry){
 const p=geometry.attributes.position,edges=new Map();let volume=0;
 for(let i=0;i<p.count;i+=3){
  const v=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j));
  volume+=v[0].dot(v[1].clone().cross(v[2]))/6;
  for(let j=0;j<3;j++){const k=[key(v[j]),key(v[(j+1)%3])].sort().join('|');edges.set(k,(edges.get(k)??0)+1);}
 }
 assert.ok(volume>.0002,'finite positive armor volume, outward winding');
 assert.ok([...edges.values()].every(n=>n===2),'closed manifold wedge, including receiving back and sides');
}
function frontNormal(geometry,leaf){
 const p=geometry.attributes.position,axis=vec(leaf.normal),front=leaf.face.map(vec),normals=[];
 for(let i=0;i<p.count;i+=3){
  const v=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,i+j));
  if(v.every(p=>front.some(c=>c.distanceTo(p)<2e-6)))normals.push(v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize());
 }
 assert.equal(normals.length,2,'actual continuous two-triangle outward armor face');
 for(const n of normals){assert.ok(n.dot(axis)>.35,'combat face points out of the housing');
  assert.ok((leaf.course==='upper'?n.y:-n.y)>.50,'upper and lower faces have opposed strong chevron rakes');}
 return normals[0];
}
function contactSamples(leaf){
 const [a,b,c,d]=leaf.back.map(vec),out=[];
 for(const t of[.05,.25,.5,.75,.95])for(const u of[.05,.25,.5,.75,.95])
  out.push(a.clone().lerp(b,t).lerp(d.clone().lerp(c,t),u));
 return out;
}
function seated(backing,leaf,offset=0){
 const normal=vec(leaf.normal);
 for(const p of contactSamples(leaf)){
  p.addScaledVector(normal,offset);
  const ray=new THREE.Raycaster(p.clone().addScaledVector(normal,.015),normal.clone().negate(),0,.045);
  const hit=ray.intersectObject(backing).find(h=>Math.abs(h.distance-.015)<3e-6);
  assert.ok(hit&&Math.abs(hit.distance-.015)<3e-6,'whole finite receiving face is seated on permanent native housing');
  const inner=new THREE.Raycaster(p.clone().addScaledVector(normal,-.004),normal.clone().negate(),.000001,.05);
  assert.equal(inner.intersectObject(backing).length,0,'carrier root enters finite stock, not a zero-thickness overlay');
 }
}
function snapshot(root){
 const out=[];root.traverse(m=>{if(m.isMesh)out.push({mesh:m,array:m.geometry.attributes.position.array.slice()});});return out;
}
function triangleMatches(surface,triangles){
 const p=surface.map(vec),nearest=new THREE.Vector3();
 return triangles.some(t=>p.every(v=>t.closestPointToPoint(v,nearest).distanceTo(v)<3e-6));
}
function strippedTriangles(applique,before){
 const p=applique.geometry.attributes.position,out=[];
 for(let i=0;i<p.count;i+=3)if(p.getY(i)<-900)out.push(new THREE.Triangle(...[0,1,2].map(j=>new THREE.Vector3().fromArray(before,(i+j)*3))));
 return out;
}
function assertMirror(leaves){
 const left=leaves.filter(l=>l.side===-1),right=leaves.filter(l=>l.side===1);
 for(let i=0;i<left.length;i++)for(const field of['face','back'])for(let j=0;j<4;j++){
  const a=left[i][field][j],b=right[i][field][j];assert.ok(Math.hypot(a[0]+b[0],a[1]-b[1],a[2]-b[2])<2e-6,'paired real armor mirrors across the main-gun recess');
 }
}
function gunCorridor(tank,leaves){
 const gun=tank.root.getObjectByName('rig_gun'),inverse=gun.matrixWorld.clone().invert();let maxX=0;
 gun.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position,matrix=inverse.clone().multiply(m.matrixWorld);
  for(let i=0;i<p.count;i++)maxX=Math.max(maxX,Math.abs(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix).x));});
 assert.ok(maxX<=.420001,'full physical gun assembly stays within its existing cross-axis envelope');
 const minX=Math.min(...leaves.flatMap(l=>[...l.back,...l.face]).map(p=>Math.abs(p[0])));
 assert.ok(minX-maxX>.025,'real side air stays open for every pitch and recoil, which transform only Y/Z');
 return minX-maxX;
}
function continuousHullGap(tank,geometries){
 const inverse=tank.root.matrixWorld.clone().invert();let hullMax=-Infinity;
 tank.root.getObjectByName('rig_hull').traverse(m=>{
  if(!m.isMesh||m.userData.shadowOnly||m.userData.authoredShadowProxy)return;
  const p=m.geometry.attributes.position,matrix=inverse.clone().multiply(m.matrixWorld);
  for(let i=0;i<p.count;i++)hullMax=Math.max(hullMax,new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix).y);
 });
 const turretY=tank.root.getObjectByName('rig_turret').position.y;
 let armorMin=Infinity;for(const g of geometries){const p=g.attributes.position;for(let i=0;i<p.count;i++)armorMin=Math.min(armorMin,p.getY(i)+turretY);}
 assert.ok(armorMin-hullMax>.015,'complete new wedge volumes clear even the tallest hull vertex: all continuous yaw angles');
 return armorMin-hullMax;
}
function hullSweep(tank,geometries,offset=0){
 const root=tank.root.clone(true),gun=root.getObjectByName('rig_gun');gun.clear();gun.position.set(0,offset,0);gun.rotation.set(0,0,0);
 for(const g of geometries){const mesh=new THREE.Mesh(g,material);mesh.name='new-chevron';gun.add(mesh);}
 const recoil=new THREE.Group();recoil.name='rig_recoil';gun.add(recoil);root.updateMatrixWorld(true);
 return measureGunHullClearance({root},{minimumHullY:1,yawDegrees:offset?[0,90,180,270]:Array.from({length:720},(_,i)=>i*.5),pitchDegrees:[0],recoilDistances:[0]});
}
const reports=[];
try {
 for(const id of IDS)for(const quality of['high','low']){
  const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
  const geometries=[];
  try {
   tank.root.updateMatrixWorld(true);
   const turret=tank.root.getObjectByName('rig_turret'),applique=turret.getObjectByName('turretExternalArmor');
   const leaves=turret.userData.russianChevronEra.leaves;
   assert.equal(leaves.length,id==='ru_t72b3m_modern'?32:28,'front cap, diagonal cheek and shoulder all receive both courses');
   for(const leaf of leaves){const g=actualLeaf(applique,leaf);geometries.push(g);closedSolid(g);frontNormal(g,leaf);}
   assertMirror(leaves);const gunGap=gunCorridor(tank,leaves),continuousGap=continuousHullGap(tank,geometries);
   const inward=leaves.map(l=>({...l,...Object.fromEntries(['back','face'].map(k=>[k,l[k].map(p=>[p[0]-l.side*.20,p[1],p[2]])]))}));
   assert.throws(()=>gunCorridor(tank,inward),/real side air/,'inward armor fails the same full gun corridor check');
   // Old square cassette faces have no opposed rake. Reconstruct that concrete
   // former failure while keeping the same footprint and real front vertices.
   const flat={...leaves[0],face:leaves[0].back.map(p=>vec(p).addScaledVector(vec(leaves[0].normal),.12).toArray())};
   const order=vec(flat.face[1]).sub(vec(flat.face[0])).cross(vec(flat.face[2]).sub(vec(flat.face[0]))).dot(vec(flat.normal))>0?[0,1,2,0,2,3]:[0,2,1,0,3,2];
   const flatGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(order.flatMap(i=>flat.face[i]),3));
   assert.throws(()=>frontNormal(flatGeometry,flat),/opposed strong chevron/);flatGeometry.dispose();
   const snaps=snapshot(tank.root),before=applique.geometry.attributes.position.array.slice();
   const rows=tank.root.userData.eraVisualBindingReceipt.plates.filter(p=>p.name.startsWith('turret_era_'));
   assert.equal(rows.length,2,'existing two gameplay sectors retained');
   for(const row of rows){
    assert.ok(row.registered&&row.ownerMatches&&row.owner==='turret','chevrons registered to native turret-owned damage sector');
    assert.equal(tank.stripEra(row.name),true);
    const removed=strippedTriangles(applique,before);
    for(const face of row.fittedSurfaces)assert.ok(triangleMatches(face,removed),'ERA hit field is an actual spent physical triangle');
    assert.ok(!triangleMatches(row.fittedSurfaces[0].map(p=>[p[0],p[1]+4,p[2]]),removed),'translated air hit-field negative control is rejected');
    for(const leaf of leaves.filter(l=>l.side===(row.name.endsWith('L')?-1:1)))
     assert.ok(leaf.face.every(p=>removed.some(t=>t.closestPointToPoint(vec(p),new THREE.Vector3()).distanceTo(vec(p))<2e-6)),'every new chevron disappears with its actual combat sector');
    assert.equal(tank.resetEra(),true);
    for(const {mesh,array}of snaps)assert.deepEqual(mesh.geometry.attributes.position.array,array,'damage reset restores exact native buffers');
   }
   tank.stripEra('turret_era_L');tank.stripEra('turret_era_R');
   const backing=new THREE.Mesh(applique.geometry,material);backing.updateMatrixWorld(true);
   for(const leaf of leaves)seated(backing,leaf);
   assert.throws(()=>seated(backing,leaves[0],.018),/seated/,'floating-cheek negative control detected');
   tank.resetEra();
   const sweep=hullSweep(tank,geometries);
   assert.ok(sweep.minimum>.004,`new ERA clears all native hull stock through 360 degrees: ${JSON.stringify(sweep)}`);
   assert.ok(hullSweep(tank,geometries,-.35).minimum<0,'low-mounted armor control intersects the actual hull');
   reports.push({id,quality,leaves:leaves.length,seatedPoints:leaves.length*25,gunCorridorM:gunGap,continuousHullGapM:continuousGap,hullYawPoses:sweep.poses,hullClearanceM:sweep.minimum});
  }finally{for(const g of geometries)g.dispose();tank.dispose();}
 }
}finally{material.dispose();}
console.log(JSON.stringify(reports,null,2));
console.log('nationalRussiaChevrons: native closed chevrons, permanent seats, correct ERA live/spent/reset, mirror, continuous gun corridor and full-yaw hull clearance pass HIGH/LOW');
