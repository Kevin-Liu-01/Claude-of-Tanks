import assert from 'node:assert/strict';
import { PerspectiveCamera } from 'three';
import { getAerialVision, nextAerialVision, setAerialVision, aerialVisionCode } from './aerialVision.ts';
import { createAerialCamera } from './aerialCamera.ts';
const values=new Map([['cot.aerialVision','night']]);globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
assert.equal(getAerialVision(),'night','saved view restored');
const camera=new PerspectiveCamera(),rig=createAerialCamera(camera),input={mouseDX:0,mouseDY:0,wheel:0};
for(const kind of ['drone','gunship']){
 const entity={aerial:{kind,active:true,launching:false,x:0,y:250,z:0,yaw:0,pitch:0,batteryS:40}};
 for(const view of ['infrared','thermal','night','daylight']){
  setAerialVision(view);rig.update(entity,input,1/60);
  assert.equal(camera.userData.flightVision,aerialVisionCode(view));assert.equal(camera.userData.thermalFlight,true);
  assert.equal(values.get('cot.aerialVision'),view);
 }
 assert.equal(nextAerialVision(),'infrared');entity.aerial.active=false;rig.update(entity,input,1/60);assert.equal(camera.userData.thermalFlight,false);
}
const launch={aerial:{kind:'drone',active:true,launching:true,x:0,y:3,z:0,yaw:0,pitch:0,batteryS:40}};
setAerialVision('night');rig.update(launch,input,1/60);assert.equal(camera.userData.thermalFlight,false,'sensor stays off during launch');
setAerialVision('bad');assert.equal(getAerialVision(),'night','invalid mode ignored');
globalThis.localStorage.setItem=()=>{throw Error('storage denied');};setAerialVision('thermal');assert.equal(getAerialVision(),'thermal');
console.log('aerialVision: four camera views, persistence, cycle, launch and exit gating passed');
