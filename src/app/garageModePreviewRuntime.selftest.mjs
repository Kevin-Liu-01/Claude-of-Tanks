import assert from 'node:assert/strict';
import { Group } from 'three';
import { createGarageModePreviewRuntime, prepareGarageModePrograms } from './garageModePreviewRuntime.ts';
const turn = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject}; };
function fixture(){
 const imports=[],warms=[],updates=[],errors=[];let paints=0,clears=0;
 const preview={clear(){clears++;},update(root,spec,mode,dt){updates.push({root,mode,dt});}};
 const runtime=createGarageModePreviewRuntime({
  load(){const request=deferred();imports.push(request);return request.promise;},
  prepare(root,current){const request=deferred();warms.push({root,current,...request});return request.promise;},
  invalidate(){paints++;},warn(error){errors.push(error);},
 });
 return {runtime,imports,warms,updates,errors,preview,get paints(){return paints;},get clears(){return clears;}};
}
const a=new Group(),b=new Group(),spec={};
{
 const f=fixture();f.runtime.update(a,spec,'standard',.016);await turn();
 assert.equal(f.imports.length,0,'ordinary Garage stays lazy');
 const intent=f.runtime.preload();await turn();
 f.runtime.update(a,spec,'juggernaut',.016);assert.equal(f.runtime.pending,true);
 f.runtime.update(b,spec,'capture_the_flag',.016);
 f.imports[0].resolve(f.preview);await intent;await turn();
 assert.equal(f.imports.length,1,'selector intent and selections coalesce one transfer');
 assert.deepEqual(f.updates.map(u=>u.mode),['capture_the_flag'],'superseded selection never installs');
 assert.equal(f.warms[0].root,b);assert.equal(f.runtime.pending,true,'no reveal before link readiness');
 f.warms[0].resolve();await turn();
 assert.equal(f.runtime.pending,false);assert.equal(f.paints,1,'completion explicitly wakes settled renderer');
 f.runtime.update(b,spec,'capture_the_flag',.016);
 assert.equal(f.warms.length,1,'steady animation does not rewarm');
 f.runtime.update(b,spec,'infected',.016);await turn();
 const old=f.warms[1];f.runtime.update(a,spec,'drone',.016);
 assert.equal(old.current(),false,'tank/mode swap cancels old preparation');
 old.resolve();await turn();assert.equal(f.runtime.pending,true,'stale completion cannot reveal the next preview');
 assert.equal(f.warms[2].root,a);
 f.runtime.clear();assert.equal(f.warms[2].current(),false);
 f.warms[2].resolve();await turn();assert.equal(f.paints,1,'battle entry rejects late Garage invalidation');
 assert.equal(f.clears,1);assert.equal(f.runtime.pending,false);
}
{
 const f=fixture();f.runtime.update(a,spec,'drone',.016);await turn();
 f.imports[0].reject(new Error('offline'));await turn();
 assert.equal(f.runtime.pending,false,'failure cannot strand the canvas');assert.equal(f.errors.length,1);
 const retry=f.runtime.preload();await turn();f.imports[1].resolve(f.preview);await retry;
 f.runtime.update(a,spec,'drone',.016);await turn();f.warms[0].resolve();await turn();
 assert.equal(f.runtime.pending,false,'a failed import remains retryable');
}
console.log('garageModePreviewRuntime: lazy intent, rapid switches, ready-before-reveal, battle cancellation and retry passed');

{
 const f=fixture();f.runtime.update(a,spec,'juggernaut',0);await turn();
 f.imports[0].resolve(f.preview);await turn();f.warms[0].resolve();await turn();
 f.preview.update=(root,spec,mode,dt)=>{f.updates.push({root,mode,dt});return false;};
 const prior=f.paints;
 f.runtime.update(a,spec,'standard',0);
 assert.equal(f.runtime.pending,false,'turning a resident aura off never freezes the canvas');
 assert.equal(f.paints,prior+1,'uniform-only change invalidates immediately');
 f.runtime.update(a,spec,'juggernaut',0);
 assert.equal(f.runtime.pending,false,'returning to a resident aura has no loading frame');
 await turn();assert.equal(f.warms.length,1,'cached toggles never enter the compile queue');
 f.runtime.clear();
}

{
 const f=fixture();f.runtime.update(a,spec,'juggernaut',0);await turn();
 f.imports[0].resolve(f.preview);await turn();
 f.preview.update=()=>false;
 f.runtime.update(a,spec,'infected',0);
 assert.equal(f.warms[0].current(),false);
 f.warms[0].resolve();await turn();
 assert.equal(f.warms.length,2,'a cancelled first warm must finish for the replacement style');
 assert.equal(f.runtime.pending,true,'installed materials alone do not prove GPU readiness');
 f.warms[1].resolve();await turn();assert.equal(f.runtime.pending,false);
 f.runtime.clear();
}

{
 let attempts=0,yields=0,closed=0;
 await prepareGarageModePrograms(function*(){
   attempts++;try {yield;return attempts===1?{status:'incomplete',pending:2,reason:'budget'}:{status:'complete',pending:0};}
   finally {closed++;}
 },()=>true,async()=>{yields++;});
 assert.equal(attempts,2,'a partial GPU warm is retried before reveal');
 assert.equal(closed,2);assert.ok(yields>=2,'retry leaves the UI responsive');
 let failures=0;
 await assert.rejects(prepareGarageModePrograms(function*(){failures++;return {status:'incomplete',pending:1,reason:'budget'};},()=>true,async()=>{}),/retry budget/);
 assert.equal(failures,3,'a broken driver cannot hold the Garage forever');
 const f=fixture();f.runtime.update(a,spec,'juggernaut',0);await turn();f.imports[0].resolve(f.preview);await turn();
 f.warms[0].reject(new Error('shader failed'));await turn();
 assert.equal(f.clears,1,'failed warm restores the original materials');
 const updates=f.updates.length;
 for(let i=0;i<60;i++)f.runtime.update(a,spec,'juggernaut',1/60);
 assert.equal(f.updates.length,updates,'failed shaders are not recreated on each frame');
 assert.equal(f.runtime.pending,false);
}
