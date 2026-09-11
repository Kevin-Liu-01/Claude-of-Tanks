import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {sampleActorTrack} from './studioTimeline.ts';
import {Euler,Vector3} from 'three';
import {getSpec} from '../vehicles/specs.ts';
import {createTankState,SIM_DT} from '../sim/movement.ts';
import {conformStudioActor,resetStudioActorSupport} from './studioActorSupport.ts';

function actor(x=0,z=0,yaw=0) {
  const spec=getSpec('m1a2');
  const state=createTankState(spec,new Vector3(x,0,z),yaw);
  state.speed=4; state.yawRate=.15; state.turretYaw=.6; state.gunPitch=.07;
  state.trackScroll.l=8; state.trackScroll.r=12;
  return {spec,state,input:{throttle:0,steer:0,brake:true},combat:null,
    contactGeom:{halfLenM:2.4,halfWidM:1.4,zCenterM:0,bottomYM:.18,gearBottomYM:.18}};
}
for(const rigid of [false,true])for(const height of [()=>0,(x,z)=>.1*x+.05*z]) {
  const a=actor(12,9,.35),s=a.state;
  const terrain={getHeightAt:height,getGroundType:()=> 'hard'};
  conformStudioActor(a,terrain,0,rigid);
  assert.deepEqual([s.pos.x,s.pos.z,s.yaw,s.speed,s.yawRate,s.turretYaw,s.gunPitch,s.trackScroll.l,s.trackScroll.r],
    [12,9,.35,4,.15,.6,.07,8,12],'support cannot drift authored motion or aim');
  assert.deepEqual(a.input,{throttle:0,steer:0,brake:true,aimLocked:undefined});
  const gaps=[];
  for(const x of [-1.4,1.4])for(const z of [-2.4,0,2.4]){
    const p=new Vector3(x,.18,z).applyEuler(new Euler(-s.visualPitch,s.yaw,s.visualRoll,'YXZ')).add(s.pos);
    gaps.push(p.y-height(p.x,p.z));
  }
  assert.ok(Math.min(...gaps)>-.04 && Math.min(...gaps)<.09,`contact gap ${gaps}, rigid=${rigid}`);
  assert.ok(Math.max(...gaps)-Math.min(...gaps)<.08,'planar terrain must not leave one end floating');
  for(let frame=0;frame<120;frame++) {s.pos.z+=.03;conformStudioActor(a,terrain,SIM_DT,rigid);}
  assert.ok(Number.isFinite(s.pos.y+s.visualPitch+s.visualRoll));
  assert.equal(s.trackScroll.l,8);assert.equal(s.trackScroll.r,12);
}

// Exercise the actual timeline integration: cue/frame refreshes use dt=0 but
// must never trigger a 48-step settle or reset an ongoing support spring.
{
  const a=actor(),calls=[];let syncs=0;
  Object.assign(a,{timelineX:0,timelineZ:0,timelineYaw:0,supportStep:0,supportX:0,supportZ:0,supportYaw:0,visual:{isDestroyed:()=>false,syncFromState(){syncs++;}}});
  const track={keys:[{tMs:0,pos:[0,0],facingDeg:0,turretDeg:0,gunDeg:0},
    {tMs:1000,pos:[0,2],facingDeg:30,turretDeg:0,gunDeg:0}]};
  const source=readFileSync(new URL('./studio.ts',import.meta.url),'utf8');
  const start=source.indexOf('  function applyStoryboardActorSample('),end=source.indexOf('  function applyStoryboardFrame(',start);
  const make=new Function('actors','sampleActorTrack','conformStudioActor','actorTrackFor','actorRootPosition','_v3','hfProxy',`
    const DEG=Math.PI/180,SIM_DT=1/60,_actorSample={},clampGunDeg=(spec,v)=>v;
    ${stripTypeScriptTypes(source.slice(start,end))}
    return applyStoryboardActors;
  `);
  const apply=make([a],sampleActorTrack,(...args)=>calls.push(args[2]),()=>track,
    (_a,x,z,_yaw,out)=>out.set(x,0,z),new Vector3(),{});
  apply(0,0,true);assert.deepEqual(calls,[0]);assert.equal(syncs,1);
  for(let frame=1;frame<=60;frame++){apply(frame*1000/60,SIM_DT);apply(frame*1000/60,0);}
  assert.equal(calls.length,61);assert.equal(calls.filter(dt=>dt===0).length,1);
  assert.equal(syncs,1,'ordinary completed-frame refresh must not resettle');
  assert.ok(a.state.speed>1.7 && a.state.yawRate>.5,'visual sync receives moving and turning rates after display sampling');
  // Different frame boundaries and extra zero-delta refreshes cross precisely
  // the same 60 support ticks; effects can also split an interval off-grid.
  calls.length=0;apply(0,0,true);
  for(const ms of [7,19,55,71,89,125,250,425,440,619,900,1000]){apply(ms,.007);apply(ms,0);}
  assert.equal(calls.length,61);assert.equal(calls.filter(dt=>dt===0).length,1);
  const solve=frames=>{
    const fresh=actor();Object.assign(fresh,{timelineX:0,timelineZ:0,timelineYaw:0,
      supportStep:0,supportX:0,supportZ:0,supportYaw:0,
      visual:{isDestroyed:()=>false,syncFromState(){}}});
    const terrain={getHeightAt:(x,z)=>.1*x+.05*z+.04*Math.sin(z),getGroundType:()=> 'hard'};
    const run=make([fresh],sampleActorTrack,conformStudioActor,()=>track,
      (_a,x,z,_yaw,out)=>out.set(x,0,z),new Vector3(),terrain);
    run(0,0,true);for(const ms of frames){run(ms,.01);run(ms,0);}
    const state=fresh.state;
    return [state.pos.y,state.visualPitch,state.visualRoll,state._spring,state._ride,
      state.trackScroll,fresh.supportStep];
  };
  const regular=Array.from({length:60},(_,i)=>(i+1)*1000/60);
  const irregular=[7,19,55,71,89,125,250,425,440,619,900,1000];
  assert.deepEqual(solve(irregular),solve(regular),'support and track travel are independent of display/cue subdivision');
}


{
  const spec=getSpec('strv103'),a=actor();a.spec=spec;
  const terrain={getHeightAt:()=>0,getGroundType:()=> 'hard'};
  const solve=()=>{
    resetStudioActorSupport(a,.08);conformStudioActor(a,terrain,0);
    return [a.state.suspensionAim,a.state.suspensionAimPitch,a.state.pos.y,a.state.visualPitch,a.state.visualRoll];
  };
  const first=solve();a.state._spring.pitch=-.7;a.state._ride.y=50;a.state._fanYield=.25;
  assert.deepEqual(solve(),first,'canonical replay retains hydraulic staging and forgets dynamic history');
  assert.equal(first[0],true);assert.equal(first[1],.08);
}

console.log('studioActorSupport.selftest: real support, authored motion, fixed cadence, reverse replay and hydraulic staging pass');
