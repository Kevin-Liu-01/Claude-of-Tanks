import assert from 'node:assert/strict';
import {continuousShoeFloor,shoeConformanceAlpha,assertShoeFloorFrame} from './continuousShoeFloor.ts';

for(const old of[-.12,-.015,0,.024,Infinity]){
 assert.equal(continuousShoeFloor(old),old,'non-opted rigs retain the original exact floor');
 for(const certificate of[-.13,-.03,.01])assert.equal(continuousShoeFloor(old,certificate),Math.min(old,certificate));
}
for(const invalid of[NaN,Infinity,-Infinity])assert.throws(()=>continuousShoeFloor(0,invalid),/finite complete-course proof/);
for(const dt of[-1,0,1/120,1/60,1/30,1/15,.12,1]){
 assert.equal(shoeConformanceAlpha(dt,false),1-Math.exp(-Math.max(0,Math.min(dt,.12))*20),'unchanged established damping');
 assert.equal(shoeConformanceAlpha(dt,true),1,'first certified sample reaches actual support immediately');
}
const identity={position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}},rootScale={x:1,y:1,z:1};
assert.doesNotThrow(()=>assertShoeFloorFrame(identity,rootScale));
for(const part of['position','rotation','scale'])for(const axis of['x','y','z']){
 const invalid=structuredClone(identity);invalid[part][axis]+=.01;
 assert.throws(()=>assertShoeFloorFrame(invalid,rootScale),/certified identity hull/);
}
for(const axis of['x','y','z'])assert.throws(()=>assertShoeFloorFrame(identity,{...rootScale,[axis]:.9}),/positive uniform root scale/);
console.log('continuousShoeFloor: PASS explicit certificate, frame/scale guards, lower body retention, unmarked defaults, first contact and original damping');

for(const scale of [.5,1.12,2])assert.doesNotThrow(()=>assertShoeFloorFrame(identity,{x:scale,y:scale,z:scale}));
for(const scale of [0,-1,NaN,Infinity])assert.throws(()=>assertShoeFloorFrame(identity,{x:scale,y:scale,z:scale}),/positive uniform/);

// Exercise the real SEP v3 rig: its continuous track certificate previously
// threw every frame as soon as Juggernaut enlarged the visual.
const {installCanvasFixture}=await import('./canvasFixture.test-support.mjs');installCanvasFixture();
const {createTank,ensureTankBuilder}=await import('./fleetFactory.ts');
const {getSpec}=await import('./specs.ts');
const {createTankState}=await import('../sim/movement.ts');
const {Vector3}=await import('three');
const {syncJuggernautVisual,clearJuggernautVisual}=await import('../game/juggernautVisual.ts');
const id='m1a2_sepv3_x';await ensureTankBuilder(id);
const visual=createTank(id,null,{quality:'high'}),spec=getSpec(id);
const state=createTankState(spec,new Vector3(),0);
state.modeScale=1.12;
let sampleReach=0;
visual.setGroundSampler((x,z)=>{sampleReach=Math.max(sampleReach,Math.abs(x),Math.abs(z));return 0;});
visual.syncFromState(state,1/60);
const ordinaryReach=sampleReach;
assert.ok(ordinaryReach>0);
for(let cycle=0;cycle<3;cycle++){
 syncJuggernautVisual(visual.root,spec.dims,1.12,100,100,0);
 sampleReach=0;
 for(let frame=0;frame<60;frame++){
  state.trackScroll.l=state.trackScroll.r=frame*.01;
  assert.doesNotThrow(()=>visual.syncFromState(state,1/60));
 }
 assert.ok(Math.abs(sampleReach/ordinaryReach-1.12)<1e-6,'ground samples follow the enlarged footprint');
 assert.ok(Number.isFinite(visual.seatRunningGearOnFloor(0)));
 clearJuggernautVisual(visual.root,true);
 assert.equal(visual.root.scale.x,1,'Garage return restores authored size');
 assert.doesNotThrow(()=>visual.seatRunningGearOnFloor(0));
}
visual.dispose();
console.log('continuousShoeFloor: SEP v3 Juggernaut sync and Garage return pass');
