import assert from 'node:assert/strict';
import {createDroneAttitude,updateDroneAttitude,droneWobblePitch,droneWobbleRoll,droneHoverDrift,droneClimbCharacter,DRONE_CLIMB} from './droneMotion.ts';
const state=createDroneAttitude(),vel={x:0,y:0,z:0};let maxBob=0,minBob=0,turns=0,lastRate=0,lastBob=null;const drift={x:0,z:0};
for(let i=0;i<600;i++){
 updateDroneAttitude(state,vel,0,i/60,1/60,1);
 maxBob=Math.max(maxBob,state.bob);minBob=Math.min(minBob,state.bob);
 if(lastBob!==null){const rate=state.bob-lastBob;if(rate*lastRate<0)turns++;lastRate=rate;}lastBob=state.bob;
 assert.ok(Math.abs(state.yaw)<.02,'hover corrections do not accumulate heading drift');
 assert.ok(Math.abs(droneWobblePitch(i/60,1))<.045);assert.ok(Math.abs(droneWobbleRoll(i/60,1))<.05);
 droneHoverDrift(i/60,1,drift);assert.ok(Math.hypot(drift.x,drift.z)<.022,'station-keeping wanders a centimetre or two, no more');
}
assert.ok(maxBob>.015&&minBob<-.015&&maxBob<.04&&minBob>-.04,'stable hover: a few centimetres of bounded altitude hunting, never a bounce');
{let wob=0;for(let i=0;i<600;i++)wob=Math.max(wob,Math.abs(droneWobblePitch(i/60,1)),Math.abs(droneWobbleRoll(i/60,1)));assert.ok(wob>.03,'the trim corrections read: about two degrees');}
assert.ok(turns>=40,'small quick corrections: the altitude reverses at least four times a second ('+turns+' in 10 s)');
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
// The lift-off's character: the dock's exact attitude inside the carrier's kit envelope, then trim corrections and a
// nose-down lean through the climb, and a short overshoot of the launch height that settles in quick corrections.
{
 const out={pitch:0,roll:0,lift:0},spool=.35,launch=2.4,height=u=>12*u*u*u*(10+u*(-15+6*u));
 for(let age=0;age<launch;age+=1/60){const u=Math.max(0,(age-spool)/(launch-spool)),h=height(Math.min(1,u));
  droneClimbCharacter(age,launch,Math.min(1,u),h,1,out);
  if(h<=DRONE_CLIMB.clearM)assert.ok(Math.abs(out.pitch)+Math.abs(out.roll)+Math.abs(out.lift)<1e-12,'inside the carrier\'s kit envelope the airframe holds the dock attitude and the authority\'s height');
  assert.equal(out.lift,0,'never above the authority while the launch climbs');}
 droneClimbCharacter(launch,launch,1,12,1,out);assert.ok(out.pitch>DRONE_CLIMB.lean*.6,'the nose leans toward forward flight at the top of the climb');
 // round 5: the lean shows early in the climb, two metres up
 {let early=0;for(let age=spool;age<launch;age+=1/60){const u=(age-spool)/(launch-spool),h=height(u);if(h>2.5&&h<5){droneClimbCharacter(age,launch,u,h,1,out);early=Math.max(early,out.pitch);}}assert.ok(early>.05,'the airframe pitches into the climb early ('+early.toFixed(3)+' rad)');}
 let peak=0,dip=0,swings=0,prev=0,prevRate=0;
 for(let age=launch;age<launch+1.5;age+=1/60){droneClimbCharacter(age,launch,1,12,1,out);
  assert.ok(Math.abs(out.roll)<.06&&out.pitch<.3,'bounded trim');peak=Math.max(peak,out.lift);dip=Math.min(dip,out.lift);
  const rate=out.lift-prev;if(rate*prevRate<0)swings++;prevRate=rate;prev=out.lift;}
 assert.ok(peak>.35&&peak<.5,'a readable overshoot over the launch height ('+peak.toFixed(3)+' m)');
 assert.ok(dip<-.03&&dip>-.1,'one shallow correction below it');assert.ok(swings>=2,'corrections settle it');
 droneClimbCharacter(launch+1.5,launch,1,12,1,out);assert.ok(Math.abs(out.lift)<.003,'settled within a second and a half');
}
console.log('droneMotion: quick small hover corrections, no heading drift, station-keeping, bank, stabilization, repeated-frame determinism and lift-off character passed');
