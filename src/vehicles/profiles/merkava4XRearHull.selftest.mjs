import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildMerkava4X} from './merkavaX.ts';
import {sectionSolid} from './sectionSolid.ts';

// Held-out canonical-source rays, not evaluated from builder stations. The
// source hull was never turret-unposed: only turret/equipment used the -25°
// correction documented in merkava4_x.md. All values below are world metres.
const SOURCE=[
  [-1.5,-3.790,1.046670],[1.5,-3.775,1.126309],
  [-1.1,-3.700,1.224095],[1.5,-3.715,1.224095],
  [-1.5,-3.665,1.359263],[-1.1,-3.655,1.407351],
  [-1.5,-3.645,1.455439],[1.1,-3.655,1.28350],
  [1.3,-3.655,1.40730],[1.5,-3.655,1.339935],
  [1.5,-3.645,1.354082],[-1.5,-3.625,1.510051],
  [1.5,-3.625,1.510051],[-1.5,-3.580,1.533695],
  [1.5,-3.400,1.533695],[-1.5,-3.250,1.565644],
  [1.5,-3.100,1.577793],[-1.5,-2.750,1.606141],
  [1.5,-2.750,1.606141],
];
const near=(actual,expected,tolerance,label)=>assert.ok(
  Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,
  `${label}: ${actual} vs ${expected} ± ${tolerance}`,
);
const hit=(object,x,z,y=1.79,up=false)=>new THREE.Raycaster(
  new THREE.Vector3(x,y,z),new THREE.Vector3(0,up?1:-1,0),0,3,
).intersectObject(object,false)[0];

function legacyHull() {
  const rows=[[-3.80,1.77,1.54,.73,.97,.19],[-3.36,1.77,1.665,.419,.97,.19],
    [-2,1.77,1.604,.419,.97,.19],[1.963,1.77,1.604,.419,.97,.19],
    [2.8,1.77,1.347,.48,.97,.03],[3.15,1.04,1.284,.59,.97,.03],
    [3.31,1.04,1.255,.64,.97,.03],[3.8,1.025,1.034,.96,.96,.02]];
  return sectionSolid(rows.map(([z,half,roof,floor,inner,shoulderDepth])=>{
    const bevel=Math.min(.06,(roof-floor)*.2),shoulder=roof-Math.min(shoulderDepth,(roof-floor)*.32);
    return {z,ring:[[-inner,floor],[inner,floor],[inner+.015,shoulder],
      [half,roof-bevel],[half-.025,roof],[-half+.025,roof],
      [-half,roof-bevel],[-inner-.015,shoulder]]};
  }));
}

function buildLegacy(P) {
  const add=P.add;let first=true;
  P.add=(slot,g,...rest)=>{
    if(slot==='hull'&&first){first=false;g.dispose();g=legacyHull();}
    return add(slot,g,...rest);
  };
  try{buildMerkava4X(P);}finally{P.add=add;}
}

function untouchedMeshes(root) {
  const rows=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.name==='hull'||mesh.userData.shadowOnly||mesh.userData.vehicleMarking)return;
    const hash=createHash('sha256');
    for(const [name,a]of Object.entries(mesh.geometry.attributes).sort()){
      hash.update(name);hash.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
    }
    if(mesh.geometry.index)hash.update(Buffer.from(mesh.geometry.index.array.buffer));
    if(mesh.isInstancedMesh)hash.update(Buffer.from(mesh.instanceMatrix.array.buffer));
    hash.update(JSON.stringify(mesh.matrixWorld.elements));
    rows.push(`${mesh.name}:${hash.digest('hex')}`);
  });
  return rows.sort();
}

function forwardTriangles(mesh) {
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index,rows=[],v=new THREE.Vector3();
  for(let i=0;i<(index?.count??p.count);i+=3){
    const corners=[0,1,2].map(j=>v.fromBufferAttribute(p,index?index.getX(i+j):i+j)
      .applyMatrix4(mesh.matrixWorld).toArray());
    if(corners.every(p=>p[2]>=-2.000001))rows.push(corners.map(p=>p.map(n=>n.toFixed(7)).join(',')).sort().join('|'));
  }
  return rows.sort();
}

function sourceAndAir(tank,quality) {
  const hull=tank.root.getObjectByName('hull');
  for(const [x,z,y]of SOURCE)near(hit(hull,x,z)?.point.y,y,.0035,`${quality} source rear ${x}/${z}`);
  const ramp=hit(hull,1.5,-3.1).face.normal.clone().transformDirection(hull.matrixWorld);
  assert.ok(ramp.dot(new THREE.Vector3(0,.9967360764,-.0807291396))>.99999,
    `${quality}: rising shoulder is the actual source plane`);
  for(const x of[-1.5,-1.1,1.1,1.5]){
    const air=new THREE.Raycaster(new THREE.Vector3(x,1.42,-3.79),new THREE.Vector3(0,0,1),0,.075)
      .intersectObject(hull,false);
    assert.equal(air.length,0,`${quality}: air above the low rear landing ${x}`);
  }
  // The right stamping is genuinely lower in the center, not a solid bounding
  // rectangle. Both side rims remain attached to the continuous folded skin.
  near(hit(hull,1.5,-3.65)?.point.y,1.347009,.001,`${quality}: recessed right channel floor`);
  assert.ok(hit(hull,1.3,-3.65).point.y-hit(hull,1.5,-3.65).point.y>.08,
    `${quality}: real right channel upper air`);
  assert.ok(hit(hull,-1.3,-3.65).point.y-hit(hull,1.5,-3.65).point.y>.08,
    `${quality}: left cover is not incorrectly mirrored from the recess`);
  const basket=tank.root.getObjectByName('turretDetail');
  near(hit(basket,0,-3.50,1.9)?.point.y,1.82628,.001,`${quality}: aligned basket floor stays fixed`);
  assert.equal(new THREE.Raycaster(new THREE.Vector3(0,1.7,-3.55),new THREE.Vector3(0,0,1),0,.10)
    .intersectObject(hull,false).length,0,`${quality}: genuine space below basket remains air`);
  // The return makes physical contact with the body, rather than a raised
  // detached lamina. At this held-out station it overlaps by 26 mm vertically.
  const returns=new THREE.Raycaster(new THREE.Vector3(-1.3,1.6,-3.604),new THREE.Vector3(0,-1,0),0,.2)
    .intersectObject(hull,false).map(h=>h.point.y);
  assert.ok(returns.length>=2&&Math.max(...returns)-Math.min(...returns)<.004,
    `${quality}: cover return is seated into the lower fold`);
}

for(const quality of['high','low']){
  registerProfiledBuilders({merkava4_x:buildLegacy});
  const baseline=createTank('merkava4_x',null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
  registerProfiledBuilders({merkava4_x:buildMerkava4X});
  const tank=createTank('merkava4_x',null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
  try{
    tank.root.updateMatrixWorld(true);baseline.root.updateMatrixWorld(true);
    sourceAndAir(tank,quality);
    assert.deepEqual(untouchedMeshes(tank.root),untouchedMeshes(baseline.root),
      `${quality}: basket/turret/equipment/gun/running-gear exact buffers and transforms remain unchanged`);
    const hull=tank.root.getObjectByName('hull'),oldHull=baseline.root.getObjectByName('hull');
    assert.deepEqual(forwardTriangles(hull),forwardTriangles(oldHull),
      `${quality}: all hull triangles forward of unchanged Z -2.0 station remain exact`);
    for(const z of[-3.78,-3.7,-3.55,-3.4,-3.0,-2.7])near(
      hit(hull,0,z,0,true)?.point.y,hit(oldHull,0,z,0,true)?.point.y,.000001,
      `${quality}: original closed lower keel is unchanged at ${z}`);
    near(tank.contactGeom.bottomYM,baseline.contactGeom.bottomYM,.000001,
      `${quality}: physical native track contact unchanged`);
    console.log(`merkava4XRearHull ${quality}: ${SOURCE.length} source rays, folded air/contact and non-target exact preservation PASS`);
  }finally{tank.dispose();baseline.dispose();}
}
