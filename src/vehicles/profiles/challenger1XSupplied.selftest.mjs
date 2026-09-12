import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addChallenger1SuppliedHull} from './challenger1XSuppliedHull.ts';
import {addChallenger1SuppliedTurret} from './challenger1XSuppliedTurret.ts';
import {addChallenger1SuppliedGun} from './challenger1XSuppliedGun.ts';
import {auditTankWheelQuality} from '../wheelQuality.ts';

// Independent source-registration scalars. Do not derive these assertions
// from the current builder or a generated candidate calibration.
const scale=.022766597878026665,offset=[.000448134021952124,.002688968328105816,1.225273105020766];
const point=(x,y,z)=>[x*scale+offset[0],y*scale+offset[1],z*scale+offset[2]];
const source={yaw:point(-.059055,61.2204705,-26.7519695),gun:point(-.669291,73.464565,20.748032),
 muzzle:point(0,0,216.220474)[2],floor:point(0,0,211.141739)[2],
 roadZ:[-128.602360,-88.897641,-55.334647,-15.393701,17.972440,53.405514].map(z=>point(0,0,z)[2]),
 rollerZ:[-108.622044,-35.039370,37.637797].map(z=>point(0,0,z)[2])};
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs ${b} ±${t}`);
function hit(meshes,p,d,far=10){return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(meshes,false)[0];}
function signedVolume(g){
 const p=g.attributes.position,idx=g.index;let volume=0;
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 for(let i=0;i<(idx?.count??p.count);i+=3){
  a.fromBufferAttribute(p,idx?idx.getX(i):i);b.fromBufferAttribute(p,idx?idx.getX(i+1):i+1);c.fromBufferAttribute(p,idx?idx.getX(i+2):i+2);
  assert.ok([...a.toArray(),...b.toArray(),...c.toArray()].every(Number.isFinite),'original primitive vertices are finite');
  volume+=a.dot(b.cross(c))/6;
 }
 return volume;
}
function primitiveChecks(){
 const pieces=[];
 const add=(_slot,g)=>pieces.push(g);
 const port={add,addEquipment:add,addHatch:add,addCupola:add,addExternalArmor:add,
  addMudguard(_label,slot,g){add(slot,g);},muzzleZ:0};
 addChallenger1SuppliedHull(port);addChallenger1SuppliedTurret(port);addChallenger1SuppliedGun(port);
 try{
  assert.ok(pieces.length>300,'independent assembled fittings, not donor/template dispatch');
  for(const [i,g]of pieces.entries())assert.ok(signedVolume(g)>1e-11,`primitive ${i} has positive outward solid volume`);
 }finally{pieces.forEach(g=>g.dispose());}
}
function framesAndBore(t,ms){
 for(const [name,expected]of[['rig_turret',source.yaw],['rig_gun',source.gun]]){
  const actual=t.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());
  near(actual.distanceTo(new THREE.Vector3(...expected)),0,2e-6,`${name} source design joint, not exporter origin`);
 }
 const muzzle=t.gunMuzzleWorld(new THREE.Vector3());
 near(muzzle.distanceTo(new THREE.Vector3(source.gun[0],source.gun[1],source.muzzle)),0,2e-6,'true source firing anchor');
 const cannon=t.root.getObjectByName('gun');
 for(const [x,y]of[[0,0],[.03,0],[-.03,0],[0,.03],[0,-.03]]){
  const o=[source.gun[0]+x,source.gun[1]+y,source.muzzle+.10];
  near(hit([cannon],o,[0,0,-1],.4)?.point.z,source.floor,2e-5,'actual metal blind floor');
  const all=hit(ms,o,[0,0,-1],.4);
  // Fleet mouth standard (2026-09-12, terminal-surface-fit-r2): visible
  // furniture is the lining seated on the tube's true mouth face; the recessed
  // metal floor is asserted separately above. The chamfered bore course ends
  // 14.3 mm behind the ballistic marker but the outer course reaches it, so the
  // mouth-face scan seats the flush lining 0.3 mm proud of the marker instead
  // of burying the lip inside the outer course.
  assert.equal(all?.object.name,'muzzleBoreShadowFallbackDisc','visible furniture is the fleet lining');
  near(all?.point.z,source.muzzle+.0003,.0005,'all visible muzzle furniture is the flush lining on the terminal face');
 }
 // Pin the physical sixteen-sided entrance and eight-sided deep section.
 // Cardinal and diagonal rays are distinct; no nominal120mm circular filler.
 for(const [rawZ,angle,radius,tolerance]of[[216.20,0,2.383416,.0006],
  [216.20,Math.PI/4,2.383416,.0006],[211.15,0,2.383416*Math.cos(Math.PI/8),.0006],
  [211.15,Math.PI/8,2.383416,.0006]]){
  const z=point(0,0,rawZ)[2],d=[Math.cos(angle),Math.sin(angle),0];
  const h=hit([cannon],[source.gun[0],source.gun[1],z],d,.15);
  near(h?.distance,radius*scale,tolerance,'source polygon bore section');
 }
 const yaw=t.root.getObjectByName('rig_turret'),gun=t.root.getObjectByName('rig_gun');
 yaw.rotation.y=.63;gun.rotation.x=-.11;t.root.updateMatrixWorld(true);
 const expected=new THREE.Vector3(0,0,source.muzzle-source.gun[2]).applyAxisAngle(new THREE.Vector3(1,0,0),-.11)
  .add(new THREE.Vector3(...source.gun).sub(new THREE.Vector3(...source.yaw)))
  .applyAxisAngle(new THREE.Vector3(0,1,0),.63).add(new THREE.Vector3(...source.yaw));
 near(t.gunMuzzleWorld(new THREE.Vector3()).distanceTo(expected),0,2e-6,'source muzzle follows exact yaw/pitch owner');
 yaw.rotation.y=0;gun.rotation.x=0;t.root.updateMatrixWorld(true);
}
function gear(t){
 assert.deepEqual(auditTankWheelQuality(t.root).issues,[],
  'actual source-seated wheels retain the unchanged narrow-phase suspension clearance floor');
 const roads=t.root.getObjectByName('gearRoadWheelTires'),rollers=t.root.getObjectByName('gearReturnRollerTires');
 assert.equal(roads.count,12);assert.equal(rollers.count,6,'source has three, not handbook four, return rollers per side');
 const matrix=new THREE.Matrix4(),p=new THREE.Vector3();
 for(const [mesh,zs,rawY,rawX]of[[roads,source.roadZ,18.9370075,51.6929135],[rollers,source.rollerZ,36.889765,55.295275]]){
  for(let i=0;i<mesh.count;i++){
   mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix).applyMatrix4(mesh.matrixWorld);
   near(Math.min(...zs.map(z=>Math.abs(p.z-z))),0,2e-6,'unchanged measured axle longitudinal station');
   near(p.y,point(0,rawY,0)[1],2e-6,'unchanged measured axle height');
   near(Math.abs(p.x),rawX*scale,2e-6,'actual source outboard roller/road axis, not hidden inset');
  }
 }
 const r=t.root.getObjectByName('rig_hull').userData.runningGearReceipts[0];
 near(r.returnRollerOutsetM,3.759842*scale,1e-10,'documented physical outward roller placement');
 const ends=[];t.root.traverse(n=>{if(n.name==='gearEndWheelBody')ends.push(n);});
 assert.equal(ends.length,4,'actual native paired sprockets and idlers remain');
 for(const mesh of ends){
  mesh.getWorldPosition(p);
  const raw=p.z<0?[-158.090546,29.507875]:[87.992126,29.488188];
  near(p.z,point(0,0,raw[0])[2],2e-6,'end axle Z unchanged by concealed tub relief');
  near(p.y,point(0,raw[1],0)[1],2e-6,'end axle Y unchanged by concealed tub relief');
  near(Math.abs(p.x),51.535433*scale,2e-6,'end axle lateral course remains unchanged');
 }
 suspensionJoints(t);
}
function suspensionJoints(t){
 const arms=t.root.getObjectByName('gearSuspensionLinks');
 const bosses=t.root.getObjectByName('gearSuspensionJointBosses');
 const discs=t.root.getObjectByName('gearRoadWheelDiscs');
 const matrix=new THREE.Matrix4(),v=new THREE.Vector3();
 const materials=[...new Set([arms,bosses,discs].flatMap(mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material]))];
 const original=materials.map(mat=>mat.side);materials.forEach(mat=>{mat.side=THREE.DoubleSide;});
 const center=(mesh,i)=>{mesh.getMatrixAt(i,matrix);return v.setFromMatrixPosition(matrix).clone();};
 const span=(mesh,index,c)=>{
  const side=Math.sign(c.x),o=new THREE.Vector3(side*3,c.y+.005,c.z);
  const hits=new THREE.Raycaster(o,new THREE.Vector3(-side,0,0)).intersectObject(mesh,false)
   .filter(h=>h.instanceId===index).map(h=>Math.abs(h.point.x));
  assert.ok(hits.length>=2,'joint ray intersects closed near/far stock');
  return [Math.min(...hits),Math.max(...hits)];
 };
 const overlap=(a,b)=>assert.ok(Math.min(a[1],b[1])-Math.max(a[0],b[0])>.002,
  'inferred receiving joint retains more than2mm actual positive overlap');
 try{
  const wheels=Array.from({length:discs.count},(_,i)=>center(discs,i));
  for(let i=0;i<arms.count;i++){
   const c=center(bosses,i*2+1),axle=span(bosses,i*2+1,c);
   overlap(axle,span(arms,i,c));
   const wi=wheels.findIndex(w=>Math.sign(w.x)===Math.sign(c.x)&&Math.abs(w.z-c.z)<1e-6);
   assert.ok(wi>=0);overlap(axle,span(discs,wi,c));
   const a=center(bosses,i*2);overlap(span(bosses,i*2,a),span(arms,i,a));
  }
 }finally{materials.forEach((mat,i)=>{mat.side=original[i];});}
}
function sideCourses(t,ms){
 for(const side of[-1,1]){
  const direction=[-side,0,0];
  for(const[y,z,x]of[[35,34,76.653542],[35,42,77.086617],[22,50,70]]){
   near(hit(ms,point(side*90,y,z),direction)?.point.x,point(side*x,0,0)[0],.0005,
    'actual source applique field, raised border and installed-sheet first face');
  }
  const armor=t.root.getObjectByName('hullExternalArmor');
  for(const[y,z]of[[30,90],[35,-160]])assert.equal(hit([armor],point(side*90,y,z),direction,.6),undefined,
   'source installed-sheet end upsweeps retain genuine end-wheel air');
 }
 near(hit(ms,point(90,20,17.97244),[-1,0,0])?.point.x,1.377846130943416,.003,
  'lower source applique edge exposes actual road wheel, not a substitute disc');
 const idler=hit(ms,point(90,30,90),[-1,0,0]);
 assert.equal(idler?.object.name,'gearEndWheelBody','front skirt exposes the real native idler, not extra armor');
 // Preserve the existing native end face during this sheet-only correction.
 // Its source first face is X1.454084778, 31.87 mm farther out: a documented
 // remaining end-wheel form limitation, not exact-source acceptance.
 near(idler.point.x,1.4222193180209266,2e-6,'unchanged native end face after sheet-only correction');
}
function surfacesAndAir(t,ms){
 // Complete-source rays, including the source carrier's genuine inboard air.
 for(const [rawX,rawZ,expected]of[[50,95,1.1004525034359025],[-50,95,1.1004525034359025],
  [-40,-30,2.189125325130001],[60,0,1.5112255007755904]]){
  near(hit(ms,point(rawX,250,rawZ),[0,-1,0])?.point.y,expected,.006,'whole-model held-out source first surface');
 }
 assert.equal(hit(ms,point(60,75,0),[0,1,0],.20),undefined,'right carrier is open, not a tall solid box');
 const hull=t.root.getObjectByName('hull');
 assert.equal(hit([hull],point(45,43,86.8),[0,1,0],.020),undefined,'approved concealed flared-tip relief clears unchanged track material');
 // The visible front roof remains in front of that mechanical relief.
 assert.ok(hit(ms,point(45,43,120),[0,0,-1],.6),'front guard retains the source-visible face');
 let falseMG=0;t.root.traverseVisible(n=>{if(n.userData.fitting==='pintleMG'&&n.userData.fittingRoot)falseMG++;});
 assert.equal(falseMG,0,'an empty source cupola mount never becomes a recognized weapon');
}
primitiveChecks();
for(const quality of['high','low']){
 const t=createTank('challenger1_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
 try{
  t.root.updateMatrixWorld(true);const ms=[];t.root.traverseVisible(n=>{if(n.isMesh&&!n.userData.shadowOnly)ms.push(n);});
  framesAndBore(t,ms);gear(t);surfacesAndAir(t,ms);sideCourses(t,ms);
 }finally{t.dispose();}
}
console.log('challenger1XSupplied: independent high/low source joints, polygon throat, actual native axle/roller positions, concealed clearance, open carrier and honest empty weapon mount pass');
