import assert from 'node:assert/strict';
import * as T from 'three';
import {addStrv122XSuppliedGear,strv122SuppliedWheelSolids} from './strv122XSuppliedGear.ts';
import {isTrackShoeMesh} from '../../../tools/track-clip-classification.mjs';
import {measureSpatialArmClearance} from '../suspensionClearance.ts';

const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs ${b} ±${t}`);
const SOURCE_ROAD_Z=[-2.245,-1.4375,-.645,.1275,.8925,1.6675,2.465];
function fixture(high){
 const material=new T.MeshStandardMaterial();
 const mats=Object.fromEntries(['hull','wheels','wheelsRecessed','rubber','detail','dark','shadow',
  'trackLink','spareTrack','burnt','trackL','trackR'].map(k=>[k,material]));
 mats.trackTexL=new T.Texture();mats.trackTexR=new T.Texture();
 const port={spec:{id:'strv122_x'},disposables:[],mats,hullG:new T.Group(),geometryReceipt:true,q:high,batchStatic:false,add(){}};
 port.hullG.name='rig_hull';
 try{addStrv122XSuppliedGear(port);port.gear.update(0,0);port.hullG.updateMatrixWorld(true);return{port,dispose};}
 catch(error){dispose();throw error;}
 function dispose(){
  const resources=new Set([...port.disposables,material,mats.trackTexL,mats.trackTexR]);
  port.hullG.traverse(n=>{if(n.geometry)resources.add(n.geometry);});for(const r of resources)r.dispose();
 }
}
function centers(mesh){
 const matrix=new T.Matrix4(),rows=[];
 for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,matrix);rows.push(new T.Vector3().setFromMatrixPosition(matrix));}return rows;
}
function axes(port){
 const tires=port.hullG.getObjectByName('gearRoadWheelTires');assert.equal(tires.count,14);
 for(const p of centers(tires)){
  near(Math.abs(p.x),p.x<0?1.315:1.335,2e-6,'independent source side axle, not track lane');
  near(p.y,.432,2e-6,'source lower-half circular fit axle height');
  near(Math.min(...SOURCE_ROAD_Z.map(z=>Math.abs(p.z-z))),0,2e-6,'one of seven source longitudinal centers');
 }
 const receipt=port.hullG.userData.runningGearReceipts[0];
 assert.deepEqual(receipt.wheelZs,SOURCE_ROAD_Z);
 near(receipt.xcLeft,1.387,1e-12,'independent actual source left shoe lane');
 near(receipt.xcRight,1.410,1e-12,'independent actual source right shoe lane');
 near(receipt.roadWheelOutsetLeftM,-.072,1e-12,'left road datum never displaces shoe lane');
 near(receipt.roadWheelOutsetRightM,-.075,1e-12,'right road datum never displaces shoe lane');
}
function surfaces(port){
 const meshes=[];port.hullG.traverseVisible(n=>{if(n.isMesh&&!n.userData.shadowOnly)meshes.push(n);});
 // Complete-source first-face measurements, held out from the primitive's
 // radius/axial corner stations. Source scan is noisy/fused:6mm is explicit.
 for(const[y,z,x]of[[.4,.90,1.538104],[.4,.72,1.427402],[.52,.76,1.429100],
  [.28,.76,1.416023],[.16,.90,1.452394],[.4,1.18,1.496193]]){
  const h=new T.Raycaster(new T.Vector3(3,y,z),new T.Vector3(-1,0,0)).intersectObjects(meshes,false)[0];
  near(h?.point.x,x,.006,'whole native wheel dish/hub/rim source first face');
 }
 const left=new T.Raycaster(new T.Vector3(-3,.40,.90),new T.Vector3(1,0,0)).intersectObjects(meshes,false)[0];
 near(left?.point.x,-1.518543,.006,'real source left-side hub asymmetry');
 const tire=port.hullG.getObjectByName('gearRoadWheelTires');
 for(const p of centers(tire)){
  const h=new T.Raycaster(new T.Vector3(p.x>0?3:-3,p.y,p.z),new T.Vector3(p.x>0?-1:1,0,0),0,3).intersectObject(tire,false)[0];
  assert.equal(h,undefined,'real rubber center is open around recessed steel, not capped');
 }
}
function endpoints(port){
 const meshes=[];port.hullG.traverse(n=>{if(n.name==='gearEndWheelBody'||n.name==='gearEndWheelHardware')meshes.push(n);});
 assert.equal(meshes.length,8,'both real spinning end-wheel material assemblies per side');
 for(const m of meshes){
  const rear=m.userData.runningGearEndKind==='sprocket';
  near(m.position.z,rear?-2.874170:3.236487,1e-9,'source outer-course circle-fit longitudinal axle');
  near(m.position.y,rear?.808317:.822477,1e-9,'source outer-course circle-fit axle height');
 }
 for(const[side,y,z,x]of[[1,.825,3.235,1.480088],[1,.80,3.235,1.479829],
  [1,.60,3.235,1.411785],[-1,.825,3.235,-1.455521],[-1,.60,3.235,-1.387156],
  [1,.80,-2.85,1.678559],[-1,.80,-2.85,-1.653152]]){
  const hit=new T.Raycaster(new T.Vector3(side*3,y,z),new T.Vector3(-side,0,0)).intersectObjects(meshes,false)[0];
  near(hit?.point.x,x,.006,'native endpoint source hub/lower-bowl axial first face');
 }
 const before=meshes.map(m=>m.quaternion.clone());port.gear.update(.17,-.21);
 for(let i=0;i<meshes.length;i++)assert.ok(Math.abs(meshes[i].quaternion.dot(before[i]))<.9999,
  'source-seated complete endpoint actually spins through native gear update');
 port.gear.update(0,0);
}
function animation(port){
 const root=port.hullG,tires=root.getObjectByName('gearRoadWheelTires');
 const faces=['strv122SuppliedWheelFacesLeft','strv122SuppliedWheelFacesRight'].map(n=>root.getObjectByName(n));
 const versions=faces.map(f=>f.instanceMatrix.version),before=faces.map(f=>Array.from(f.instanceMatrix.array));
 port.gear.update(.37,-.29);
 const state={pos:new T.Vector3(),yaw:0,visualPitch:0,visualRoll:0};
 port.gear.conform(state,(_x,z)=>Math.abs(z)<.7?.035:0,0,0,1/60);port.gear.update(.37,-.29,1/60);
 const road=centers(tires);
 for(const [i,mesh]of faces.entries()){
  assert.ok(mesh.instanceMatrix.version>versions[i],'caller uploads real moving wheel face matrices');
  assert.notDeepEqual(Array.from(mesh.instanceMatrix.array),before[i],'real wheel face moves/spins, not parked decoration');
  for(const p of centers(mesh))near(Math.min(...road.map(r=>r.distanceTo(p))),0,2e-6,'face and tire share exact live suspension axle');
 }
}
function groundPhases(port){
 const links=[];port.hullG.traverse(n=>{if(isTrackShoeMesh(n))links.push(n);});
 assert.ok(links.length,'native physical articulated shoe geometry exists');
 const matrix=new T.Matrix4(),world=new T.Matrix4(),v=new T.Vector3();let min=Infinity;
 for(let phase=0;phase<16;phase++){
  port.gear.update(phase*.013,-phase*.017);port.hullG.updateMatrixWorld(true);
  for(const mesh of links)for(let i=0;i<mesh.count;i++){
   mesh.getMatrixAt(i,matrix);world.multiplyMatrices(mesh.matrixWorld,matrix);
   const p=mesh.geometry.attributes.position;for(let j=0;j<p.count;j++)min=Math.min(min,v.fromBufferAttribute(p,j).applyMatrix4(world).y);
  }
 }
 assert.ok(min>=-.0005,`all sixteen physical shoe phases stay above source ground: ${min}`);
}
function suspension(port){
 port.gear.update(0,0);port.hullG.updateMatrixWorld(true);
 const arms=port.hullG.getObjectByName('gearSuspensionLinks');
 const bosses=port.hullG.getObjectByName('gearSuspensionJointBosses');
 const discs=port.hullG.getObjectByName('gearRoadWheelDiscs');
 for(const side of ['left','right']){
  const result=measureSpatialArmClearance(arms,side);
  assert.ok(result&&result.arms===7&&result.samples>=84,'real surfaces cover every arm');
  assert.ok(result.minimumM>=.02035,`${side} real wheel/arm air exceeds unchanged20.35mm floor: ${result.minimumM}`);
 }
 // The inferred spindle must join the relocated arm to the wheel, not leave
 // a new gap in exchange for satisfying clearance. Actual double-sided rays
 // through closed stock establish positive axial overlap at both joints.
 const material=port.mats.wheels,previous=material.side;material.side=T.DoubleSide;
 const matrix=new T.Matrix4(),p=new T.Vector3();
 const span=(mesh,index,position,side)=>{
  const hits=new T.Raycaster(new T.Vector3(side*3,position.y+.01,position.z),
   new T.Vector3(-side,0,0)).intersectObject(mesh,false)
   .filter(hit=>hit.instanceId===index).map(hit=>Math.abs(hit.point.x));
  assert.ok(hits.length>=2,'closed stock has real near/far faces');
  return [Math.min(...hits),Math.max(...hits)];
 };
 const overlap=(a,b,label)=>assert.ok(Math.min(a[1],b[1])-Math.max(a[0],b[0])>.002,label);
 try{
  for(let i=0;i<arms.count;i++){
   bosses.getMatrixAt(i*2+1,matrix);p.setFromMatrixPosition(matrix);const side=Math.sign(p.x);
   const axle=span(bosses,i*2+1,p,side);overlap(axle,span(arms,i,p,side),'axle boss receives arm');
   const wheel=centers(discs).findIndex(v=>Math.sign(v.x)===side&&Math.abs(v.z-p.z)<1e-6);
   assert.ok(wheel>=0);overlap(axle,span(discs,wheel,p,side),'axle boss receives native wheel core');
   bosses.getMatrixAt(i*2,matrix);p.setFromMatrixPosition(matrix);
   overlap(span(bosses,i*2,p,side),span(arms,i,p,side),'anchor boss receives arm');
  }
 }finally{material.side=previous;}
}
const faceTriangles=new Map();
const shoeTriangles=new Map();
for(const high of[true,false]){
 const f=fixture(high);try{
  const faces=['strv122SuppliedWheelFacesLeft','strv122SuppliedWheelFacesRight']
   .map(name=>f.port.hullG.getObjectByName(name));
  faceTriangles.set(high,faces.reduce((sum,m)=>sum+(m.geometry.index?.count??m.geometry.attributes.position.count)/3*m.count,0));
  let shoeCost=0;
  const camera=new T.PerspectiveCamera();camera.position.set(0,3,-10);camera.updateMatrixWorld(true);
  f.port.hullG.traverse(node=>{if(node.isLOD)node.update(camera);});
  f.port.hullG.traverseVisible(mesh=>{
   if(isTrackShoeMesh(mesh))shoeCost+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*mesh.count;
  });
  shoeTriangles.set(high,shoeCost);
  // Regression against shipped 37,944-triangle links, not a release score.
  // The separate 25k HIGH stretch target remains unmet and documented.
  assert.ok(shoeCost>0&&shoeCost<=37944*(high?.70:.43),
   `shared ${high?'HIGH':'LOW'} shoes reduce shipped stock by at least 30%/57%: ${shoeCost}`);
  axes(f.port);surfaces(f.port);endpoints(f.port);suspension(f.port);groundPhases(f.port);animation(f.port);
 }finally{f.dispose();}
}
assert.ok(shoeTriangles.get(false)<shoeTriangles.get(true)*.70,'LOW shoes must materially simplify HIGH stock');
console.log('strv122XSuppliedGear shoe triangles HIGH/LOW:',shoeTriangles.get(true),shoeTriangles.get(false));
for(const high of [true,false]) assert.equal(faceTriangles.get(high),21504,
 'actual steel faces remove one third of the former 32256 triangles without relaxing source rays');
const solids=strv122SuppliedWheelSolids();for(const g of Object.values(solids)){
 assert.ok(g.attributes.position.count>48);for(const v of g.attributes.position.array)assert.ok(Number.isFinite(v));g.dispose();
}
console.log('strv122XSuppliedGear: source held-out dish/hub/rim rays, actual seven native axles, live face/tire ownership and sixteen ground phases PASS high/low');
