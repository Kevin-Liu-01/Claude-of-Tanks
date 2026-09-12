import assert from 'node:assert/strict';
import * as THREE from 'three';
import {markFixedPaintedPanel,materialOnlyPaintSourceBucket} from './profiles/fixedPaintedPanel.ts';

const g=new THREE.BoxGeometry(.2,.3,.4), plain=g.clone(), second=g.clone();
try{
  const original=new Uint8Array(g.attributes.position.array.buffer.slice(0));
  assert.equal(markFixedPaintedPanel(g,'fixed-source-sheet','hullRubber'),g);
  assert.deepEqual(new Uint8Array(g.attributes.position.array.buffer),original);
  assert.equal(materialOnlyPaintSourceBucket([g]),'hullRubber');
  assert.equal(materialOnlyPaintSourceBucket([]),undefined);
  assert.equal(materialOnlyPaintSourceBucket([plain]),undefined);
  assert.equal(materialOnlyPaintSourceBucket([g,plain]),undefined,'one sheet cannot exempt an ordinary group');
  markFixedPaintedPanel(second,'different-fixed-sheet','hullDetail');
  assert.equal(materialOnlyPaintSourceBucket([g,second]),undefined,'mixed original groups retain defaults');
  for(const field of ['fixedPaintedPanel','materialOnlyPaintMigration','materialOnlyPaintSourceBucket']){
    const old=g.userData[field];delete g.userData[field];
    assert.equal(materialOnlyPaintSourceBucket([g]),undefined);g.userData[field]=old;
  }
  // Painted turret fittings (stowage cases, carriers, basket floors) share
  // the same explicit provenance contract as hull sheets (2026-09-11).
  g.userData.materialOnlyPaintSourceBucket='turretDetail';
  assert.equal(materialOnlyPaintSourceBucket([g]),'turretDetail','turret detail provenance is accepted when every sheet declares it');
  g.userData.materialOnlyPaintSourceBucket='turretDark';
  assert.equal(materialOnlyPaintSourceBucket([g]),undefined,'unlisted provenance buckets keep their defaults');
  g.userData.materialOnlyPaintSourceBucket='hullDetail';
  assert.throws(()=>markFixedPaintedPanel(plain,'','hullDetail'));
}finally{g.dispose();plain.dispose();second.dispose();}
console.log('fixedPaintedPanel: exact buffers, explicit hull provenance, mixed/unmarked/empty negative controls PASS');
