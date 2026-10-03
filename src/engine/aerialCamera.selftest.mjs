import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { createAerialCamera } from './aerialCamera.ts';
const camera=new PerspectiveCamera(),rig=createAerialCamera(camera);
const e={aerial:{kind:'gunship',active:true,launching:false,x:0,y:240,z:90,yaw:0,pitch:0,batteryS:0,cooldownS:0},input:{aimPoint:new Vector3()}};
const input={mouseDX:0,mouseDY:0,wheel:0};
rig.update(e,input,1/60);const focus=e.input.aimPoint.clone();
e.aerial.x=90;e.aerial.z=0;rig.update(e,input,1/60);
assert.ok(e.input.aimPoint.distanceTo(focus)<1e-8,'orbit preserves chosen ground target');
input.mouseDX=100;rig.update(e,input,1/60);assert.ok(e.input.aimPoint.distanceTo(focus)>10,'mouse pans the gimbal over the map');
input.mouseDX=0;input.wheel=1;rig.update(e,input,1/60);assert.ok(camera.fov<55,'zoom-in input magnifies');
e.aerial.active=false;assert.equal(rig.update(e,input,1/60),false);assert.equal(camera.fov,60,'return clears flight camera');
console.log('aerialCamera: stable orbital targeting, mouse pan, zoom and exit passed');

// Match the input.ts contract: physical right is negative mouseDX. Assert
// screen direction, not merely distance moved (which missed the reversal).
for(const kind of ['gunship','drone'])for(const startYaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
 for(const axis of ['horizontal','vertical'])for(const sign of [-1,1])for(const cursorAim of [false,true]){
  const c=new PerspectiveCamera(),r=createAerialCamera(c);
  const actor={aerial:{...e.aerial,active:true,kind,yaw:startYaw,x:90*Math.sin(startYaw),z:90*Math.cos(startYaw)},input:{aimPoint:new Vector3()}};
  r.update(actor,{mouseDX:0,mouseDY:0,wheel:0},1/60);c.updateMatrixWorld(true);
  const oldCamera=c.clone();oldCamera.updateMatrixWorld(true);
  const mouseDX=!cursorAim&&axis==='horizontal'?-sign*30:0;
  const mouseDY=!cursorAim&&axis==='vertical'?sign*30:0;
  r.update(actor,{mouseDX,mouseDY,wheel:0,cursorAim,cursorX:axis==='horizontal'?sign:0,cursorY:axis==='vertical'?-sign:0},1/60);
  const screen=actor.input.aimPoint.clone().project(oldCamera);
  assert.ok(axis==='horizontal'?screen.x*sign>.001:screen.y*sign<-.001,`${kind} ${axis} direction ${sign}, cursor=${cursorAim}, yaw=${startYaw}`);
 }
}
console.log('aerialCamera: mouse and cursor directions correct in both aircraft at four headings; vertical unchanged');
