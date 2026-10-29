import assert from 'node:assert/strict';
import * as THREE from 'three';
import {sourceDimensionCamera,sourceDimensionRows,usesSourceDimensionFrame} from './source-dimension-frame.mjs';
import { SUPPLIED_SOURCE_COMPARISON_IDS } from './supplied-source-reference-overrides.mjs';
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
for (const id of SUPPLIED_SOURCE_COMPARISON_IDS) {
  assert.equal(usesSourceDimensionFrame(id, certified), true, `${id}: same source-only ruler`);
  assert.equal(usesSourceDimensionFrame(id, {...certified, passed: false}), false,
    `${id}: an invalid source certificate cannot bypass dimensions`);
}
assert.equal(usesSourceDimensionFrame('t72b3',certified),true);
assert.equal(usesSourceDimensionFrame('m1a2_abrams_sepv2',certified),true,
  'direct supplied SEP v2 comparison uses its certified source ruler, not the unrelated published roof height');
assert.equal(usesSourceDimensionFrame('m1a2_abrams_sepv2',{...certified,passed:false}),false);
assert.equal(usesSourceDimensionFrame('m1a2_abrams_sepv2',{...certified,mode:'legacy'}),false);
assert.equal(usesSourceDimensionFrame('amx56',certified),true,
  'older supplied Leclerc uses the same source-only ruler and physical guards');
assert.equal(usesSourceDimensionFrame('amx56',{...certified,passed:false}),false);
for(const id of ['c1_ariete','challenger1_mk3','chieftain5','strv122']) {
  assert.equal(usesSourceDimensionFrame(id,certified),true,'now source-authored with complete fused owner certificates');
  assert.equal(usesSourceDimensionFrame(id,{...certified,passed:false}),false);
}
// (262: the Merkava family, measured on its owner-supplied sources)
for (const id of ['ares_apc', 'merkava4_trophy', 'merkava4_barak', 'namer_ifv',
  'merkava1b', 'merkava2b', 'merkava2d', 'merkava3c', 'merkava3_baz', 'merkava4b']) {
  assert.equal(usesSourceDimensionFrame(id, certified), true,
    `${id}: compare the supplied configuration with its fixed source ruler and complete equipment envelope`);
  assert.equal(usesSourceDimensionFrame(id, { ...certified, passed: false }), false,
    `${id}: failed source registration cannot authorize source dimensions`);
  assert.equal(usesSourceDimensionFrame(id, { ...certified, mode: 'legacy' }), false,
    `${id}: legacy alignment cannot authorize source dimensions`);
}
assert.equal(usesSourceDimensionFrame('m48a5_patton', certified), true,
  'the owner-supplied M48A5 is measured against its certified model, not the published roof height');
assert.equal(usesSourceDimensionFrame('m48a5_patton', {...certified, passed: false}), false);
// t72b3 retired 2026-09-23 (owner: "no hidden tanks"); the T-72B3M stands for the established fleet policy.
for(const id of ['t72b3m_2022','leo2a5','leo2_revolution_proto'])assert.equal(usesSourceDimensionFrame(id,certified),false,'existing fleet keeps its established policy');
assert.equal(usesSourceDimensionFrame('t72b3',{...certified,passed:false}),false);
console.log('source-dimension-frame: fixed source ruler, identical paired definitions, physical oversize guard and legacy isolation pass');
