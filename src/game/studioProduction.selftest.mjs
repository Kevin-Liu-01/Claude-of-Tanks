import assert from 'node:assert/strict';
import { PRODUCTION_PRESETS, createProductionScene, productionCamera, productionAspect, reframeProductionPoint } from './studioProduction.ts';
import { sampleActorTrack, sampleCameraRail } from './studioTimeline.ts';

const height = (x, z) => 2 + x * .002 + z * .003;
for (const preset of PRODUCTION_PRESETS) for (const format of ['landscape', 'portrait', 'square', 'card']) {
  const options = {presetId:preset.id,format};
  const scene = createProductionScene(options,height);
  assert.deepEqual(scene,createProductionScene(options,height),'authored scene must be deterministic');
  assert.deepEqual(JSON.parse(JSON.stringify(scene)),scene,'portable recipe loses no state');
  assert.equal(scene.storyboard.durationMs,8000);
  assert.equal(scene.storyboard.shots.length,6);
  assert.equal(scene.storyboard.shots.filter(s=>s.transition==='cut').length,2);
  const names=new Set(scene.actors.map(a=>a.name));
  // an effect is on a cast member or at a world point (a flare, a barrage)
  for(const effect of scene.effects){assert(effect.actor?names.has(effect.actor):effect.at.every(Number.isFinite),`${preset.id}: ${effect.id} has a place`);assert(effect.tMs<8000);}
  assert(names.has('lead'),'every sequence features a lead the Director can recast');
  assert.equal(new Set(scene.effects.map(e=>e.id)).size,scene.effects.length,`${preset.id}: effect ids are unique`);
  assert.equal(new Set(scene.actors.map(a=>a.name)).size,scene.actors.length);
  for (const track of scene.storyboard.actorTracks) {
    assert(names.has(track.actor));const pose={};
    assert(sampleActorTrack(track.keys,4000,pose));
    assert(Number.isFinite(pose.x)&&Number.isFinite(pose.z));
  }
  for(let t=0;t<=8000;t+=100){const pose={};assert(sampleCameraRail(scene.storyboard.shots,t,pose));
    assert(pose.y>height(pose.x,pose.z)+1,'camera cannot travel beneath the sampled terrain');}
  assert.equal(scene.timeScale,0,'staging must not auto-play before review');
}
assert.ok(PRODUCTION_PRESETS.length>=20,'the library offers twenty sequences or more');
assert.deepEqual(PRODUCTION_PRESETS.slice(0,3).map(p=>p.id),['steel-pursuit','desert-crossfire','coast-recon'],'the first three keep their ids and order');
assert.equal(new Set(PRODUCTION_PRESETS.map(p=>p.id)).size,PRODUCTION_PRESETS.length);
for(const preset of PRODUCTION_PRESETS){
  assert.equal(createProductionScene({presetId:preset.id,vehicleId:'leo2a4'},height).actors.find(a=>a.name==='lead').id,'leo2a4','the featured tank recasts the lead');
  assert.ok(['showcase','combat','environment'].includes(preset.category));
}
// a camera a building would hide gives way: with every left-hand rig blocked, each act takes the other side
{
  const preset=PRODUCTION_PRESETS[0];
  const lead=preset.cast[0];
  const rightOf=(pos)=>pos[0]>lead.at[0];
  const clear=createProductionScene({presetId:preset.id},height,(from)=>rightOf(from));
  assert(clear.storyboard.shots.every(shot=>rightOf(shot.pos)),'blocked rigs give way to the other side');
  assert.deepEqual(createProductionScene({presetId:preset.id},height,()=>true),createProductionScene({presetId:preset.id},height),'a clear world keeps the authored rigs');
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
const mirrored=productionCamera('hero',target,0,flat,'landscape',true);
assert(Math.abs(mirrored.pos[0]+wide.pos[0])<1e-9&&Math.abs(mirrored.pos[2]-wide.pos[2])<1e-9,'a mirrored rig stands on the subject\'s other side');
assert.throws(()=>productionAspect('bad'),/format/);
assert.throws(()=>createProductionScene({presetId:'bad'},flat),/sequence/);
assert.throws(()=>productionCamera('unknown',target,0,flat),/rig/);
assert.throws(()=>productionCamera('hero',target,0,()=>NaN),/ground/);
console.log(`studioProduction: deterministic ${PRODUCTION_PRESETS.length}-sequence × 4-format stories, safe camera paths and relative rigs pass`);
