import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {addLeclercXRearTerrace} from './leclercXRearShoulders.ts';

const near=(actual,expected,tolerance,label)=>assert.ok(Number.isFinite(actual)
 &&Math.abs(actual-expected)<=tolerance,`${label}: ${actual}; expected ${expected} ± ${tolerance}`);
const cast=(meshes,p,d,far=10)=>new THREE.Raycaster(new THREE.Vector3(...p),
 new THREE.Vector3(...d),0,far).intersectObjects(meshes,false)[0];

// Complete-source Object29/30 first surfaces at held-out Z stations. These
// scalars were measured independently of the procedural loft stations.
const XS=[-1.625,-1.545,-1.50,-1.485,1.345,1.375,1.4,1.425,1.545];
const WITNESSES=[
 [-1.23,[1.9236931,2.0258366,2.0348487,2.0348487,2.2125854,2.114681,2.0154372,2.0496338,1.93887]],
 [-1.07,[1.9191502,2.0232837,2.0356987,2.0356987,2.2117684,2.1026483,2.016455,2.0503457,1.9348044]],
 [-.73,[1.9094965,2.0229675,2.0375049,2.0375049,2.1953128,2.0886696,2.0186177,2.0518585,1.9261649]],
 [-.46,[1.9027947,2.0227164,2.0389393,2.0389393,2.1333233,2.0897713,2.0203352,2.0530599,1.9193041]],
];

function sourceSurfaces(all) {
 for(const[z,ys]of WITNESSES)for(let i=0;i<XS.length;i++) {
  const hit=cast(all,[XS[i],3,z],[0,-1,0]);
  near(hit?.point.y,ys[i],.0001,'actual source shoulder, seam or terrace bevel');
  assert.equal(hit?.object.name,'turret','armor remains in the real yaw-owned turret');
 }
 for(const[side,z,x]of[[1,-1.3,1.5598652],[1,-.9,1.5665812],
  [-1,-1.3,-1.6308839],[-1,-.9,-1.6348844]])
  // The near-vertical wall retains its moving physical crease, rather
  // than one interpolated wall that hides the narrow outer air.
  near(cast(all,[side*2,1.8,z],[-side,0,0])?.point.x,x,.0001,
   'measured near-vertical outer wall, not an inflated shoulder cap');
}

function realAir(all) {
 for(const[x,z]of[[1.57,-1.3],[1.57,-.9],[-1.64,-1.3],[-1.64,-.9]])
  assert.equal(cast(all,[x,1.8,z],[0,1,0],.5),undefined,
   'complete source outer shoulder air stays genuinely empty');
 for(const z of[-1.2,-.9]) {
  assert.equal(cast(all,[1.3,2.064,z],[0,1,0],.004),undefined,
   'source clearance beneath the outer terrace is not filled by a box');
  near(cast(all,[1.3,2.064,z],[0,1,0])?.point.y,2.0686557293,.000001,
   'source flat underside closes the upper module');
 }
 for(const[x,z,roof]of[[-1.50,-1.07,2.0356987],[1.40,-.73,2.0186177]]) {
  assert.equal(cast(all,[x,roof+.002,z],[0,1,0],.009),undefined,
   'narrow seam has actual recessed air, not a painted stripe');
  near(cast(all,[x,roof+.01,z],[0,-1,0])?.point.y,roof,.0001,'closed seam floor');
 }
}

function retainedGeometry(tank,all) {
 // These three unchanged native witnesses protect the non-target forward
 // surfaces; they are explicitly not additional source accuracy claims.
 for(const[x,z,y]of[[0,1.5,2.2207458],[-1.5,1,1.9072139],[1.5,1,1.8546624]])
  near(cast(all,[x,3,z],[0,-1,0])?.point.y,y,.000001,'unchanged forward cheek/spine');
 near(cast(all,[-.72,2.4,.4],[0,-1,0])?.point.y,2.0741854,.000001,
  'independent source port well remains recessed');
 const muzzle=tank.root.getObjectByName('rig_muzzle').getWorldPosition(new THREE.Vector3());
 near(muzzle.z,6.239235,.000001,'source cannon endpoint unchanged');
 const yaw=tank.root.getObjectByName('rig_turret'),pivot=yaw.position.clone();
 const p=new THREE.Vector3(1.345,2.1953128,-.73).sub(pivot)
  .applyAxisAngle(new THREE.Vector3(0,1,0),.6).add(pivot);
 yaw.rotation.y=.6;tank.root.getObjectByName('rig_gun').rotation.x=.1;
 tank.root.updateMatrixWorld(true);
 near(cast(all,[p.x,3,p.z],[0,-1,0])?.point.y,p.y,.0001,
  'measured shoulder follows yaw but not independent gun elevation');
}

function closedSupportedTerrace() {
 const geometries=[];
 addLeclercXRearTerrace({add(_bucket,g){geometries.push(g);}},[0,0,0]);
 try {
  const core=geometries[0].boundingBox;
  assert.ok(geometries.length>2,'independent folded terrace is actually emitted');
  for(const g of geometries.slice(1)) {
   const b=g.boundingBox;
   assert.ok(core.max.x-b.min.x>.0009,'every outer span has a concealed positive lap to its core');
   const edges=new Map(),p=g.attributes.position;
   const key=i=>[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join(',');
   for(let i=0;i<p.count;i+=3)for(let j=0;j<3;j++) {
    const k=[key(i+j),key(i+(j+1)%3)].sort().join('|');
    edges.set(k,(edges.get(k)??0)+1);
   }
   assert.ok([...edges.values()].every(n=>n===2),'folded spans retain closed backs/ends/undersides');
  }
 }finally{for(const g of geometries)g.dispose();}
}

closedSupportedTerrace();
for(const quality of['high','low']) {
 const tank=createTank('leclerc_x',null,{quality,geometryReceipt:true,batchStatic:false,proceduralOnly:true});
 try {
  tank.root.updateMatrixWorld(true);const all=[];
  tank.root.traverse(m=>{if(m.isMesh&&!m.name.startsWith('procShadow_')&&!m.userData.vehicleMarking)all.push(m);});
  sourceSurfaces(all);realAir(all);retainedGeometry(tank,all);
 }finally{tank.dispose();}
}
console.log('leclercXRearShoulders: actual high/low source crowns, folds, seams, outer air, terrace contact and non-target preservation pass');
