import assert from 'node:assert/strict';
import * as T from 'three';
import {efficientReturnRoller} from './efficientReturnRoller.ts';

const fixtures=[
 {name:'kf51-fit',radiusM:.095,axialWidthM:.16,spindleRadiusM:.027,spindleLengthM:.212,count:8},
 {name:'k2-fit',radiusM:.09,axialWidthM:.16,spindleRadiusM:.026,spindleLengthM:.247,count:6},
];
const triangles=g=>(g.index?.count??g.attributes.position.count)/3;
function shaftFitsHub(rotor,spindle,fixture){
 const material=new T.MeshBasicMaterial({side:T.DoubleSide}),mesh=new T.Mesh(rotor,material);
 const p=spindle.attributes.position,section=new Map();
 for(let i=0;i<p.count;i++){
  const y=p.getY(i),z=p.getZ(i);if(Math.hypot(y,z)<fixture.spindleRadiusM*.99)continue;
  section.set(`${Math.round(y*1e8)}/${Math.round(z*1e8)}`,[y,z]);
 }
 assert.ok(section.size>=4);
 try{
  for(let phase=0;phase<32;phase++){
   mesh.rotation.x=phase*Math.PI/16;mesh.updateMatrixWorld(true);
   for(const [y,z]of section.values()){
    // Include a 0.5 mm positive receiving margin around the actual finite
    // spindle rim, not merely its axis or nominal circumradius metadata.
    const margin=1+.0005/fixture.spindleRadiusM;
    const ray=new T.Raycaster(new T.Vector3(-fixture.axialWidthM/2-.01,y*margin,z*margin),new T.Vector3(1,0,0));
    const hit=ray.intersectObject(mesh,false)[0];
    assert.ok(hit,'A real hub receiving section exists');
    assert.ok(Math.abs(hit.point.x+fixture.axialWidthM/2)<2e-7,'Finite shaft rim enters through hub cap at every relative phase, not through its shoulder');
   }
  }
 }finally{material.dispose();}
}
function closed(g){
 const p=g.attributes.position,ix=g.index,edges=new Map();let volume=0;
 const vertex=i=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(i):i);
 const key=v=>[v.x,v.y,v.z].map(x=>Math.round(x*1e7)).join(',');
 for(let i=0;i<(ix?.count??p.count);i+=3){
  const a=vertex(i),b=vertex(i+1),c=vertex(i+2);
  assert.ok(new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a)).length()>1e-10,'No degenerate stock triangles');
  volume+=a.dot(new T.Vector3().crossVectors(b,c))/6;
  const keys=[key(a),key(b),key(c)];
  for(let j=0;j<3;j++){
   const u=keys[j],v=keys[(j+1)%3],k=u<v?`${u}/${v}`:`${v}/${u}`;
   const edge=edges.get(k)||{count:0,balance:0};edge.count++;edge.balance+=u<v?1:-1;edges.set(k,edge);
  }
 }
 for(const e of edges.values()){assert.equal(e.count,2,'Every finite stock edge has two faces');assert.equal(e.balance,0,'Stock winding is consistent');}
 assert.ok(volume>0,'Actual stock is outward-wound with positive occupied volume');return volume;
}
function groups(g){
 assert.equal(g.groups.length,2,'Two material submissions, not many tiny ring groups');
 const seen=new Uint8Array(g.index.count);
 for(const group of g.groups){
  assert.ok(group.materialIndex===0||group.materialIndex===1);assert.equal(group.count%3,0);assert.ok(group.count>0);
  for(let j=group.start;j<group.start+group.count;j++){assert.equal(seen[j],0);seen[j]=1;}
 }
 assert.ok(seen.every(n=>n===1),'Every actual draw triangle has exactly one finish');
 const p=g.attributes.position,uv=g.attributes.uv;
 assert.equal(uv?.count,p.count,'Every render vertex has explicit UVs');
 assert.ok(Array.from(uv.array).every(n=>Number.isFinite(n)&&n>=0&&n<=1));
 for(const group of g.groups)if(group.materialIndex===1)for(let j=group.start;j<group.start+group.count;j+=3){
  const [a,b,c]=[0,1,2].map(k=>g.index.getX(j+k));
  const area=(uv.getX(b)-uv.getX(a))*(uv.getY(c)-uv.getY(a))-(uv.getY(b)-uv.getY(a))*(uv.getX(c)-uv.getX(a));
  assert.ok(Math.abs(area)>1e-8,'Every painted shoulder/hub face has non-degenerate UV area');
 }
 for(const group of g.groups)if(group.materialIndex===0)for(let j=group.start;j<group.start+group.count;j++)
  assert.ok(Math.abs(Math.abs(p.getX(g.index.getX(j)))-.16/2*.50/.69)<1e-7,'Rubber covers only the finite crown; hubs are painted');
}
function tangentContact(rotor,fixture,quality){
 const crownSegments=quality==='high'?24:12;
 const angles=[...Array.from({length:32},(_,i)=>i*Math.PI/16),Math.PI/crownSegments];
 const gap=(g,angle)=>{
  const m=new T.Matrix4().makeRotationX(angle),p=g.attributes.position;let top=-Infinity;
  for(let i=0;i<p.count;i++)top=Math.max(top,new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(m).y);
  return fixture.radiusM-top;
 };
 const maximumGapM=Math.max(...angles.map(angle=>gap(rotor,angle)));
 assert.ok(maximumGapM<=.006,'Actual finite rotating crown stays within 6 mm of its tangent plane');
 assert.ok(Math.abs(maximumGapM-fixture.radiusM*(1-Math.cos(Math.PI/crownSegments)))<1e-7,
  'Explicit half-phase reaches the analytic worst case; sampling cannot miss the maximum');
 const oldEight=new T.CylinderGeometry(fixture.radiusM,fixture.radiusM,fixture.axialWidthM,8,1,false).rotateZ(Math.PI/2);
 const oldEightGapM=gap(oldEight,Math.PI/8);oldEight.dispose();
 assert.ok(oldEightGapM>.006,'Original eight-sector crown fails the same 6 mm contact limit');negatives++;
 return{fixture:fixture.name,quality,phases:angles.length,maximumGapM,oldEightGapM};
}
const rows=[],tangentContacts=[];let poses=0,negatives=0;
const rubber=new T.MeshBasicMaterial({color:0x242322}),paint=new T.MeshBasicMaterial({color:0x516849});
for(const fixture of fixtures)for(const quality of['high','low']){
 const options={...fixture,quality},leaf=efficientReturnRoller(options),{rotor,spindle}=leaf;
 const rotorVolume=closed(rotor),spindleVolume=closed(spindle);groups(rotor);
 tangentContacts.push(tangentContact(rotor,fixture,quality));
 const count=fixture.count,rotors=new T.InstancedMesh(rotor,[rubber,paint],count),shafts=new T.InstancedMesh(spindle,paint,count);
 assert.equal(rotors.material[0],rubber);assert.equal(rotors.material[1],paint);assert.equal(shafts.material,paint);
 const budget=quality==='high'?160:80,complete=triangles(rotor)+triangles(spindle);
 assert.equal(complete,budget);assert.equal(triangles(rotors.geometry)*rotors.count+triangles(shafts.geometry)*shafts.count,budget*count);
 const bb=rotor.boundingBox;
 assert.ok(Math.abs(bb.max.x-fixture.axialWidthM/2)<1e-7);assert.ok(Math.abs(bb.min.x+fixture.axialWidthM/2)<1e-7);
 assert.ok(Math.abs(bb.max.y-fixture.radiusM)<1e-7);assert.ok(Math.abs(bb.min.y+fixture.radiusM)<1e-7);
 // Complete moving rotor stock is contained by the cylinder used in the
 // existing fitted contact proof, for every angle (norm is rotation-invariant).
 const p=rotor.attributes.position;
 for(let i=0;i<p.count;i++){
  assert.ok(Math.hypot(p.getY(i),p.getZ(i))<=fixture.radiusM+1e-7);
  assert.ok(Math.abs(p.getX(i))<=fixture.axialWidthM/2+1e-7);
 }
 for(let phase=0;phase<32;phase++){
  const rotation=new T.Matrix4().makeRotationX(phase*Math.PI/16);
  for(let side of[-1,1]){
   const axis=side*1.097,m=rotation.clone().setPosition(axis,1.024,.38);
   for(let i=0;i<count/2;i++)rotors.setMatrixAt(i+(side>0?count/2:0),m);
   for(let i=0;i<p.count;i++){
    const point=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(m);
    assert.ok(Math.hypot(point.y-1.024,point.z-.38)<=fixture.radiusM+1e-7);
   }
  }
  poses++;
 }
 // Finite hub/spindle overlap and five non-collinear receiving-section
 // witnesses. This is local assembly fit, NOT a claim of a K2 hull ray audit.
 shaftFitsHub(rotor,spindle,fixture);
 const smallHub=rotor.clone(),hp=smallHub.attributes.position;
 const oldRadius=Math.max(fixture.radiusM*.30,fixture.spindleRadiusM*1.05);
 for(let i=0;i<hp.count;i++)if(Math.abs(Math.abs(hp.getX(i))-fixture.axialWidthM/2)<1e-7){
  const radius=Math.hypot(hp.getY(i),hp.getZ(i));
  if(radius>0){hp.setY(i,hp.getY(i)*oldRadius/radius);hp.setZ(i,hp.getZ(i)*oldRadius/radius);}
 }
 smallHub.computeBoundingSphere();assert.throws(()=>shaftFitsHub(smallHub,spindle,fixture));negatives++;smallHub.dispose();
 const shaftMesh=new T.Mesh(spindle,new T.MeshBasicMaterial({side:T.DoubleSide}));
 shaftMesh.position.x=.015-fixture.spindleLengthM/2;shaftMesh.updateMatrixWorld(true);
 for(const [y,z] of[[0,0],[.008,0],[-.008,0],[0,.008],[0,-.008]]){
  const hit=new T.Raycaster(new T.Vector3(-2,y,z),new T.Vector3(1,0,0)).intersectObject(shaftMesh,false);
  assert.equal(hit.length>=2,true,'Finite shaft section has entering and leaving stock');
  assert.ok(hit.at(-1).point.x>-.16/2+.02,'Positive finite shaft penetration into rotor hub');
 }
 const open=rotor.clone();open.setIndex(Array.from(open.index.array).slice(3));assert.throws(()=>closed(open));negatives++;open.dispose();
 const unpainted=rotor.clone();unpainted.clearGroups();assert.throws(()=>groups(unpainted));negatives++;unpainted.dispose();
 const untextured=rotor.clone();untextured.deleteAttribute('uv');assert.throws(()=>groups(untextured));negatives++;untextured.dispose();
 const reversed=rotor.clone();const ri=Array.from(reversed.index.array);for(let i=0;i<ri.length;i+=3)[ri[i],ri[i+1]]=[ri[i+1],ri[i]];
 reversed.setIndex(ri);assert.throws(()=>closed(reversed));negatives++;reversed.dispose();
 let rotorDisposed=0,spindleDisposed=0;rotor.addEventListener('dispose',()=>rotorDisposed++);spindle.addEventListener('dispose',()=>spindleDisposed++);
 rotors.dispose();shafts.dispose();rotor.dispose();spindle.dispose();shaftMesh.material.dispose();
 assert.equal(rotorDisposed,1);assert.equal(spindleDisposed,1);
 rows.push({fixture:fixture.name,quality,count,rotorTriangles:triangles(rotor),spindleTriangles:triangles(spindle),complete,instanceExpanded:complete*count,rotorVolume,spindleVolume});
}
for(const key of['radiusM','axialWidthM','spindleRadiusM','spindleLengthM'])for(const value of[0,-1,NaN,Infinity]){
 assert.throws(()=>efficientReturnRoller({...fixtures[0],quality:'low',[key]:value}),RangeError);negatives++;
}
assert.throws(()=>efficientReturnRoller({...fixtures[0],quality:'invalid'}),RangeError);negatives++;
assert.throws(()=>efficientReturnRoller({...fixtures[0],quality:'low',spindleRadiusM:.05}),RangeError);negatives++;
rubber.dispose();paint.dispose();console.log('efficientReturnRoller:',JSON.stringify({rows,poses,tangentContacts,negativeControls:negatives}));
