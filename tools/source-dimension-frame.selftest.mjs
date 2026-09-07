import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sourceDimensionCamera,sourceDimensionRows,usesSourceDimensionFrame} from './source-dimension-frame.mjs';
const ref=new THREE.Box3(new THREE.Vector3(-2,0,-4),new THREE.Vector3(2,4,6));
const sourceSnapshot=ref.toArray?.()??[ref.min.toArray(),ref.max.toArray()];
const record=cam=>[...cam.projectionMatrix.elements,...cam.matrixWorld.elements];
for(const direction of [new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)]) {
  const frozen=record(sourceDimensionCamera(ref,direction));
  for(const scale of [.5,1,1.04,4]) {
    const candidate=ref.clone();candidate.min.multiplyScalar(scale);candidate.max.multiplyScalar(scale);
    candidate.translate(new THREE.Vector3(11,-3,8));
    assert.deepEqual(record(sourceDimensionCamera(ref,direction)),frozen,'candidate resizing/translation cannot change source sampling');
  }
}
assert.deepEqual([ref.min.toArray(),ref.max.toArray()],sourceSnapshot,'source frame is never mutated');
const dims={heightM:2.7,hullLengthM:7,overallLengthM:10,widthM:3.8};
assert.ok(sourceDimensionRows(dims,dims,ref,ref).every(r=>r.pct===0));
const large=ref.clone();large.max.x+=.4;
const clipped=sourceDimensionRows(dims,dims,ref,large);
assert.ok(Math.abs(clipped.find(r=>r.name==='physicalWidthM').pct-10)<1e-10,'a clipped/filtered raster cannot hide actual excess geometry');
const short=ref.clone();short.max.y*=.95;
assert.ok(sourceDimensionRows(dims,dims,ref,short).find(r=>r.name==='physicalHeightM').pct>4.99,'missing thin tops fail physical height even when filtered raster matches');
assert.throws(()=>sourceDimensionRows({...dims,widthM:NaN},dims,ref,ref));
assert.throws(()=>sourceDimensionCamera(new THREE.Box3(),new THREE.Vector3(1,0,0)));
const certified={passed:true,mode:'canonical-source-world'};
assert.equal(usesSourceDimensionFrame('t72b3_x',certified),true);
assert.equal(usesSourceDimensionFrame('leclerc_classic_x',certified),true,
  'older supplied Leclerc uses the same source-only ruler and physical guards');
assert.equal(usesSourceDimensionFrame('leclerc_classic_x',{...certified,passed:false}),false);
for(const id of ['ariete_c1_x','challenger1_x','chieftain5_x','strv122_x']) {
  assert.equal(usesSourceDimensionFrame(id,certified),true,'now source-authored with complete fused owner certificates');
  assert.equal(usesSourceDimensionFrame(id,{...certified,passed:false}),false);
}
for(const id of ['t72b3','leo2a5_x','leo2_revolution_proto'])assert.equal(usesSourceDimensionFrame(id,certified),false,'existing fleet keeps its established policy');
assert.equal(usesSourceDimensionFrame('t72b3_x',{...certified,passed:false}),false);
console.log('source-dimension-frame: fixed source ruler, identical paired definitions, physical oversize guard and legacy isolation pass');
