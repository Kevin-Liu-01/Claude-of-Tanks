import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildMerkava3DX} from './merkavaX.ts';
import {buildKF51X} from './kf51X.ts';

const CASES=[
  {id:'merkava3d_x',build:buildMerkava3DX,owner:'turret',prefix:'merkava_merkava3d_turret_era_',parts:3},
  {id:'kf51_x',build:buildKF51X,owner:'hull',prefix:'kf51_skirt_era_',parts:15},
];
const point=new THREE.Vector3();
const near=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<.000001,
  `${label}: ${actual} vs ${expected}`);
function geometryFingerprint(root) {
  // Grouping/material role may change; actual world triangles must not. Marking
  // seating and invisible generated shadow proxies are separate receipts.
  root.updateMatrixWorld(true);
  const triangles=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh||mesh.userData.shadowOnly||mesh.userData.vehicleMarking)return;
    const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
    const count=index?.count??p.count;
    for(let i=0;i<count;i+=3) {
      const corners=[];
      for(let j=0;j<3;j++) {
        point.fromBufferAttribute(p,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld);
        corners.push(point.toArray().map(v=>v.toFixed(7)).join(','));
      }
      triangles.push(corners.sort().join('|'));
    }
  });
  return {triangles:triangles.length,sha256:createHash('sha256').update(triangles.sort().join('\n')).digest('hex')};
}
function geometryBytes(mesh) {
  const p=mesh.geometry.attributes.position;
  return Buffer.from(p.array.buffer,p.array.byteOffset,p.array.byteLength);
}
function visibleVertices(mesh,sign) {
  const p=mesh.geometry.attributes.position;let count=0;
  for(let i=0;i<p.count;i++)if(p.getY(i)>-900&&Math.sign(p.getX(i))===sign)count++;
  return count;
}
function permanentWitness(tank,c) {
  const core=tank.root.getObjectByName(c.owner);
  if(c.id==='kf51_x') {
    const hit=new THREE.Raycaster(new THREE.Vector3(-2,1.50,0),new THREE.Vector3(1,0,0),0,4)
      .intersectObject(core,false)[0];
    assert.ok(hit,'KF51: independent permanent inner hull remains closed');
    return hit.point.x;
  }
  const hit=new THREE.Raycaster(new THREE.Vector3(1.40,4,-1.2),new THREE.Vector3(0,-1,0),0,4)
    .intersectObject(core,false)[0];
  assert.ok(hit,'Mk3D: independent permanent turret backing remains closed');
  return hit.point.y;
}
function actualFacetSupport(mesh,faces,label) {
  const p=mesh.geometry.attributes.position,index=mesh.geometry.index,triangles=[];
  for(let i=0;i<(index?.count??p.count);i+=3)triangles.push(new THREE.Triangle(
    ...[0,1,2].map(offset=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i+offset):i+offset)),
  ));
  const nearest=new THREE.Vector3();
  for(const face of faces) {
    const corners=face.map(value=>new THREE.Vector3(...value));
    const center=corners.slice(0,3).reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(1/3);
    assert.deepEqual(face[2],face[3],`${label}: exact native triangle retains quad-compatible representation`);
    for(const witness of [...corners,center]) {
      const distance=Math.min(...triangles.map(triangle=>triangle.closestPointToPoint(witness,nearest).distanceTo(witness)));
      assert.ok(distance<.000002,`${label}: actual hit facet corner/center is on physical armor (${distance} m)`);
    }
    const normal=new THREE.Triangle(...corners.slice(0,3)).getNormal(new THREE.Vector3());
    assert.ok(normal.length()>.99,`${label}: hit triangle is physically nondegenerate`);
    const worldCenter=center.clone().applyMatrix4(mesh.matrixWorld),worldNormal=normal.transformDirection(mesh.matrixWorld);
    const ray=new THREE.Raycaster(worldCenter.clone().addScaledVector(worldNormal,.04),worldNormal.negate(),0,.08);
    assert.ok(ray.intersectObject(mesh,false).some(hit=>hit.point.distanceTo(worldCenter)<.000003),
      `${label}: center normal ray intersects the exact rendered facet`);
  }
}
function testDepletion(tank,c,quality) {
  const root=tank.root,external=root.getObjectByName(`${c.owner}ExternalArmor`);
  const core=root.getObjectByName(c.owner);
  assert.ok(external?.isMesh&&core?.isMesh,`${c.id}/${quality}: separate external and permanent meshes`);
  const original=Buffer.from(geometryBytes(external)),backing=Buffer.from(geometryBytes(core));
  const coreWitness=permanentWitness(tank,c);
  const binding=root.userData.eraVisualBindingReceipt;
  for(const [suffix,sign]of[['L',-1],['R',1]]) {
    const name=c.prefix+suffix,row=binding.plates.find(r=>r.name===name);
    assert.equal(row.registered,true,`${name}: actual cluster is registered`);
    assert.equal(row.registeredOwner,c.owner,`${name}: correct articulation owner`);
    assert.equal(row.partCount,c.parts,`${name}: only existing selected parts are removable`);
    assert.ok(row.fittedSurfaces.length>=6,`${name}: separate real native facets replace a broad PCA rectangle`);
    actualFacetSupport(external,row.fittedSurfaces,`${name}/${quality}`);
    const removed=visibleVertices(external,sign),adjacent=visibleVertices(external,-sign);
    assert.ok(removed>0&&adjacent>0,`${name}: both live side courses exist before impact`);
    assert.equal(tank.stripEra(name),true,`${name}: damage removes actual registered vertices`);
    assert.equal(visibleVertices(external,sign),0,`${name}: no selected cassette remains live`);
    assert.equal(visibleVertices(external,-sign),adjacent,`${name}: neighboring side is untouched`);
    assert.deepEqual(geometryBytes(core),backing,`${name}: permanent load-bearing backing stays byte-identical`);
    near(permanentWitness(tank,c),coreWitness,`${name}: actual permanent first-surface ray retained`);
    const spent=Buffer.from(geometryBytes(external));
    tank.stripEra(name);
    assert.deepEqual(geometryBytes(external),spent,`${name}: repeated depletion is idempotent`);
    assert.equal(tank.resetEra(),true,`${name}: reset is implemented`);
    assert.deepEqual(geometryBytes(external),original,`${name}: actual original panel buffers restore exactly`);
  }
}
for(const c of CASES)for(const quality of ['high','low']) {
  // Exercise the same current builder with registration bypassed solely to
  // prove adding cluster metadata neither adds nor moves any physical surface.
  registerProfiledBuilders({[c.id]:P=>{
    const register=P.destructibleCluster;
    P.destructibleCluster=(_name,fill)=>fill();
    try {c.build(P);}finally{P.destructibleCluster=register;}
  }});
  const baseline=createTank(c.id,null,{quality,geometryReceipt:true,proceduralOnly:true,camoSeed:4242});
  let fingerprint;
  try {fingerprint=geometryFingerprint(baseline.root);}finally{baseline.dispose();}
  registerProfiledBuilders({[c.id]:c.build});
  const tank=createTank(c.id,null,{quality,geometryReceipt:true,proceduralOnly:true,camoSeed:4242});
  try {
    assert.deepEqual(geometryFingerprint(tank.root),fingerprint,
      `${c.id}/${quality}: exact world triangle multiset unchanged by ERA binding`);
    tank.root.updateMatrixWorld(true);
    testDepletion(tank,c,quality);
    console.log(`${c.id}/${quality}: ${fingerprint.triangles} unchanged physical triangles ${fingerprint.sha256}`);
  }finally{tank.dispose();}
}
console.log('westXEraBinding: unchanged source surfaces, exact actual removable ranges, permanent backing, adjacency and reset pass high/low');
