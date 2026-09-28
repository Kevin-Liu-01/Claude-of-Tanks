import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, requireReview } from './pipeline.mjs';
import { shorelineSurvey, landscapeSurvey } from './recipes.mjs';
const dir=mkdtempSync(join(tmpdir(),'cot-media-test-'));
try {
  const path=join(dir,'frame.png');writeFileSync(path,'original');
  const file={path,sha256:digest('original')};
  const receipt={sourceDigest:'render-state',finished:'now',errors:[],maps:[{map:'test',complete:true,stills:[file],shore:[],videos:[],posters:[],survey:{maxUncoveredM:12,radiusM:68}}]};
  const review={sourceDigest:'render-state',maps:{test:{accepted:true,notes:'Inspected the frame.',hashes:[file.sha256]}}};
  assert.doesNotThrow(()=>requireReview(receipt,review));
  assert.throws(()=>requireReview(receipt,{...review,sourceDigest:'stale'}),/different source/);
  assert.throws(()=>requireReview(receipt,{...review,maps:{}}),/Visual review required/);
  assert.throws(()=>requireReview(receipt,{...review,maps:{test:{...review.maps.test,hashes:[]}}}),/Unreviewed/);
  assert.throws(()=>requireReview({...receipt,errors:['failed']},review),/incomplete/);
  receipt.maps[0].survey.maxUncoveredM=70;
  assert.throws(()=>requireReview(receipt,review),/coverage/);
  receipt.maps[0].survey.maxUncoveredM=12;
  writeFileSync(path,'changed');assert.throws(()=>requireReview(receipt,review),/changed or missing/);
} finally {rmSync(dir,{recursive:true,force:true});}
const dry={mapId:'test',config:{},heightField:{size:1024,getWaterMaskAt:()=>0,getHeightAt:()=>0}};
assert.equal(shorelineSurvey(dry).samples,0,'a dry battlefield cannot invent a shoreline');
const lake={...dry,config:{splat:{seaLake:true}},heightField:{...dry.heightField,getWaterMaskAt:(x,z)=>Math.hypot(x-50,z)<80?1:0}};
const survey=shorelineSurvey(lake);
assert.ok(survey.samples>60&&survey.views.length>3,'the complete lake circumference is sampled');
assert.ok(survey.maxUncoveredM<=survey.radiusM,'every sampled segment is assigned an overlapping review view');
assert.ok(survey.views.every(view=>view.camera.pos.every(Number.isFinite)));
const landscape=landscapeSurvey(dry);
assert.equal(landscape.views.length,18,'all eight edge/corner directions, paired heights, and two whole-map views');
for(let station=0;station<8;station++) {
  const drive=landscape.views[station*2].camera,raised=landscape.views[station*2+1].camera;
  assert.deepEqual([drive.pos[0],drive.pos[2]],[raised.pos[0],raised.pos[2]],'paired reviews have the same horizontal pose');
  assert.ok(raised.pos[1]-drive.pos[1]>=60,'raised view sees beyond foreground obstructions');
  assert.ok(Math.max(Math.abs(drive.pos[0]),Math.abs(drive.pos[2]))<512,'boundary view begins inside the playable map');
  assert.ok(Math.max(Math.abs(drive.lookAt[0]),Math.abs(drive.lookAt[2]))>512,'view crosses the boundary instead of only inspecting inland terrain');
}
console.log('media production: rejects missing/stale/unreviewed/tampered captures; complete shoreline coverage PASS');
