import assert from 'node:assert/strict';
import { PRODUCTION_PRESETS, createProductionScene, productionCamera, productionAspect, reframeProductionPoint } from './studioProduction.ts';
import { sampleActorTrack, sampleCameraRail } from './studioTimeline.ts';

const height = (x, z) => 2 + x * .002 + z * .003;
for (const preset of PRODUCTION_PRESETS) for (const format of ['landscape', 'portrait', 'square']) {
  const options = {presetId:preset.id,format};
  const scene = createProductionScene(options,height);
  assert.deepEqual(scene,createProductionScene(options,height),'authored scene must be deterministic');
  assert.deepEqual(JSON.parse(JSON.stringify(scene)),scene,'portable recipe loses no state');
  assert.equal(scene.storyboard.durationMs,8000);
  assert.equal(scene.storyboard.shots.length,6);
  assert.equal(scene.storyboard.shots.filter(s=>s.transition==='cut').length,2);
  const names=new Set(scene.actors.map(a=>a.name));
  for(const effect of scene.effects){assert(names.has(effect.actor));assert(effect.tMs<8000);}
  for (const track of scene.storyboard.actorTracks) {
    assert(names.has(track.actor));const pose={};
    assert(sampleActorTrack(track.keys,4000,pose));
    assert(Number.isFinite(pose.x)&&Number.isFinite(pose.z));
  }
  for(let t=0;t<=8000;t+=100){const pose={};assert(sampleCameraRail(scene.storyboard.shots,t,pose));
    assert(pose.y>height(pose.x,pose.z)+1,'camera cannot travel beneath the sampled terrain');}
  assert.equal(scene.timeScale,0,'staging must not auto-play before review');
}
const target=[0,4,0], flat=()=>0;
const wide=productionCamera('hero',target,0,flat), portrait=productionCamera('hero',target,0,flat,'portrait');
const distance=c=>Math.hypot(...c.pos.map((v,i)=>v-target[i]));
assert(Math.abs(distance(portrait)/distance(wide)-16/9)<1e-9,'portrait uses a bounded dolly rather than backing deep into vegetation');
const coverage=(c,aspect)=>distance(c)*Math.tan(c.fov*Math.PI/360)*aspect;
assert(Math.abs(coverage(portrait,9/16)-coverage(wide,16/9))<1e-8,'native portrait lens preserves horizontal subject coverage');
assert.deepEqual(reframeProductionPoint(wide.pos,target,'landscape','portrait',flat),portrait.pos);
const back = reframeProductionPoint(portrait.pos,target,'portrait','landscape',flat);
back.forEach((v,i)=>assert(Math.abs(v-wide.pos[i])<1e-8,'format changes preserve the authored camera'));
assert.equal(reframeProductionPoint([1,2,3],target,'landscape','portrait',()=>20)[1],21.3);
const turned=productionCamera('track',target,90,flat);
assert(Math.abs(turned.pos[0]+2)<1e-8&&Math.abs(turned.pos[2]-13)<1e-8,'rig follows the selected tank heading');
assert.throws(()=>productionAspect('bad'),/format/);
assert.throws(()=>createProductionScene({presetId:'bad'},flat),/sequence/);
assert.throws(()=>productionCamera('unknown',target,0,flat),/rig/);
assert.throws(()=>productionCamera('hero',target,0,()=>NaN),/ground/);
console.log('studioProduction: deterministic 3-sequence × 3-format stories, safe camera paths and relative rigs pass');
