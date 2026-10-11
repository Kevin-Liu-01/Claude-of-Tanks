import assert from 'node:assert/strict';
import {createDroneAttitude,updateDroneAttitude,droneWobblePitch,droneWobbleRoll} from './droneMotion.ts';
const state=createDroneAttitude(),vel={x:0,y:0,z:0};let maxBob=0,minBob=0;
for(let i=0;i<600;i++){
 updateDroneAttitude(state,vel,0,i/60,1/60,1);
 maxBob=Math.max(maxBob,state.bob);minBob=Math.min(minBob,state.bob);
 assert.ok(Math.abs(state.yaw)<.013,'hover corrections do not accumulate heading drift');
 assert.ok(Math.abs(droneWobblePitch(i/60,1))<.026);assert.ok(Math.abs(droneWobbleRoll(i/60,1))<.033);
}
assert.ok(maxBob>.03&&minBob<-.03&&maxBob<.06&&minBob>-.06,'stable hover: a few centimetres of bounded vertical hunting, never a bounce');
vel.z=25;for(let i=0;i<60;i++)updateDroneAttitude(state,vel,0,10+i/60,1/60,1);
assert.ok(state.pitch>.07,'forward motion banks the airframe');
vel.x=15;for(let i=0;i<60;i++)updateDroneAttitude(state,vel,0,11+i/60,1/60,1);
assert.ok(state.roll<-.04,'strafing produces a corrective bank');
vel.x=vel.z=0;for(let i=0;i<180;i++)updateDroneAttitude(state,vel,0,12+i/60,1/60,1);
assert.ok(Math.abs(state.pitch)<1e-6&&Math.abs(state.roll)<1e-6,'stabilizer settles after input stops');
// Re-drawing one presentation time (pinned clock, pause, a second render) leaves the attitude where it was.
{
 const a=createDroneAttitude(),b=createDroneAttitude(),v={x:12,y:0,z:30};
 for(let i=0;i<30;i++){updateDroneAttitude(a,v,.2,i/60,1/60,3);updateDroneAttitude(b,v,.2,i/60,1/60,3);for(let k=0;k<5;k++)updateDroneAttitude(b,v,.2,i/60,0,3);}
 assert.deepEqual(b,a,'repeated frames at one time never move the stabilizer');
}
console.log('droneMotion: stable hover wobble, no heading drift, bank, stabilization and repeated-frame determinism passed');
