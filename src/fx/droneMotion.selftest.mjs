import assert from 'node:assert/strict';
import {createDroneAttitude,updateDroneAttitude,droneWobblePitch,droneWobbleRoll} from './droneMotion.ts';
const state=createDroneAttitude(),vel={x:0,y:0,z:0};let maxBob=0,minBob=0;
for(let i=0;i<600;i++){
 updateDroneAttitude(state,vel,0,i/60,1/60,1);
 maxBob=Math.max(maxBob,state.bob);minBob=Math.min(minBob,state.bob);
 assert.ok(Math.abs(state.yaw)<.01,'hover corrections do not accumulate heading drift');
 assert.ok(Math.abs(droneWobblePitch(i/60,1))<.02);assert.ok(Math.abs(droneWobbleRoll(i/60,1))<.024);
}
assert.ok(maxBob>.025&&minBob<-.025,'hover has bounded vertical movement');
vel.z=25;for(let i=0;i<60;i++)updateDroneAttitude(state,vel,0,10+i/60,1/60,1);
assert.ok(state.pitch>.07,'forward motion banks the airframe');
vel.x=15;for(let i=0;i<60;i++)updateDroneAttitude(state,vel,0,11+i/60,1/60,1);
assert.ok(state.roll<-.04,'strafing produces a corrective bank');
vel.x=vel.z=0;for(let i=0;i<180;i++)updateDroneAttitude(state,vel,0,12+i/60,1/60,1);
assert.ok(Math.abs(state.pitch)<1e-6&&Math.abs(state.roll)<1e-6,'stabilizer settles after input stops');
console.log('droneMotion: bounded hover wobble, no heading drift, bank and stabilization passed');
