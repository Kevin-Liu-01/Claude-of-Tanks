import assert from 'node:assert/strict';
import {createDroneFeedTransition} from './droneFeedTransition.ts';
for(const reason of ['hit','expired','cancelled']){
 const feed=createDroneFeedTransition();assert.equal(feed.step(false,false,true,0),0);
 assert.equal(feed.step(false,true,true,10),0);assert.equal(feed.step(true,true,true,100),0);
 assert.equal(feed.step(false,false,true,200),1,reason);assert.ok(feed.step(false,false,true,400)>0);assert.equal(feed.step(false,false,true,821),0);
 assert.equal(feed.step(false,false,true,900),0,'does not repeatedly trigger');
}
const launch=createDroneFeedTransition();launch.step(false,true,true,0);assert.equal(launch.step(false,false,true,10),0,'no lost FPV feed during launch');
launch.step(true,true,true,20);assert.equal(launch.step(false,false,false,30),0,'garage and hidden HUD do not show static');
console.log('droneFeedTransition: impact, expiry, cancellation, launch and garage/reset passed');
