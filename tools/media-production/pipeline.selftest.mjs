import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { digest, requireReview, leaseClock } from './pipeline.mjs';
import { shorelineSurvey, landscapeSurvey, mapScene, sunForCamera, MAP_SUN_MODES } from './recipes.mjs';
import { mergePublication } from './mergePublication.mjs';

const previous={created:'yesterday',revision:'old',sourceDigest:'old-inputs',review:{notes:'old review'},
  assets:[{src:'/map',sha256:'old-map'},{src:'/film',sha256:'film'}],
  shots:[{src:'/map'}],films:[{src:'/film'}],
  media:{'/map':'map','/film':'film'},recipes:{map:{seed:1},film:{seed:2}}};
const fresh={revision:'new',sourceDigest:'new-inputs',assets:[{src:'/map',sha256:'new-map'}],
  shots:[{src:'/map',title:'Fresh'}],films:[],media:{'/map':'map'},recipes:{map:{seed:3}}};
const merged=mergePublication(previous,fresh);
assert.deepEqual(merged.films,previous.films,'map refresh retains films');
assert.deepEqual(merged.shots,fresh.shots,'replaced map is not duplicated');
assert.equal(merged.recipes.map.seed,3);
assert.equal(merged.recipes.film.seed,2);
assert.equal(merged.retainedBatches[0].revision,'old','retained film keeps its source revision');
assert.deepEqual(merged.retainedBatches[0].assets,[previous.assets[1]]);
assert.deepEqual(mergePublication(merged,fresh).retainedBatches,merged.retainedBatches,'repeat refresh does not reattribute old footage');
assert.deepEqual(mergePublication(null,fresh),fresh);
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
// media r5: the overview's sun bearing against its camera (looking along +X = bearing 90)
const lookX={pos:[0,10,0],lookAt:[100,0,0]};
assert.deepEqual([...MAP_SUN_MODES],['map','back','rim','side','front']);
assert.equal(sunForCamera(lookX,'map'),null,'map keeps the authored sun');
assert.deepEqual(sunForCamera(lookX,'back'),{sunAzimuthDeg:90},'backlight faces the camera into the sun');
assert.deepEqual(sunForCamera(lookX,'front'),{sunAzimuthDeg:270},'front light stands behind the camera');
assert.deepEqual(sunForCamera({pos:[0,0,0],lookAt:[0,0,-5]},'side'),{sunAzimuthDeg:270});
assert.throws(()=>sunForCamera(lookX,'noon'),/Unknown sun mode/);
const shotWorld={mapId:'verdant',config:{shot:{pos:[0,20,-300],look:[0,0,0]}},heightField:{getHeightAt:()=>0}};
assert.equal(mapScene(shotWorld,'golden').light,undefined,'a default overview has no light block');
assert.deepEqual(mapScene(shotWorld,'golden','rim').light,{sunAzimuthDeg:32});
assert.equal(mapScene(shotWorld,'dusk','back').timeOfDay,'dusk');
// cinema --lease-min: the first film always renders; a lease ends before a film when the longest take would pass it
{
  const min = 60000;
  let t = 0;
  const clock = leaseClock(45 * min, 0, () => t);
  for (const [at, ends, why] of [[2, false, 'the first film renders'], [12, false, '12 + 10 <= 45'], [22, false, '22 + 10 <= 45'],
    [33, false, '33 + 11 <= 45'], [44, true, '44 + 11 > 45: the lease ends']]) {
    t = at * min;
    assert.equal(clock.endBefore(), ends, why);
  }
  assert.equal(clock.longestTake, 11 * min, 'the estimate is the longest take');
  t = 500 * min;
  assert.equal(leaseClock(45 * min, 0, () => t).endBefore(), false, 'a lease that began late still renders its first film');
  assert.equal(leaseClock(0, 0, () => t).endBefore(), false, 'no budget: no lease end');
}
console.log('media production: rejects missing/stale/unreviewed/tampered captures; complete shoreline coverage; overview sun bearings; cinema lease clock PASS');
