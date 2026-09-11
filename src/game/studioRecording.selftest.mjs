import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

// Exercise the real recording functions with a controlled browser encoder.
// Event order and failure injection are independent of production internals.
const source=readFileSync(new URL('./studio.ts',import.meta.url),'utf8');
const begin=source.indexOf('  function recordVideo('),end=source.indexOf('  function recordingStatus()',begin);
assert.ok(begin>0 && end>begin);
const functions=stripTypeScriptTypes(source.slice(begin,end));
function fixture() {
  const encoders=[],tracks=[],timers=new Map();let timerId=0,now=0,throwAt='',downloads=0;
  class Recorder {
    state='inactive';mimeType='video/webm';listeners=new Map();
    constructor(){if(throwAt==='constructor')throw Error('constructor');encoders.push(this);}
    addEventListener(type,fn){this.listeners.set(type,fn);}
    emit(type,event={}){this.listeners.get(type)?.(event);}
    start(){if(throwAt==='start')throw Error('start');this.state='recording';}
    stop(){this.state='inactive';}
    chunk(size=1){this.emit('dataavailable',{data:new Blob([new Uint8Array(size)])});}
  }
  const track=()=>{const t={stopped:false,stop(){this.stopped=true;},requestFrame(){if(throwAt==='requestFrame')throw Error('requestFrame');}};tracks.push(t);return t;};
  const make=new Function('ports',`
    const {MediaRecorder,renderer,performance,setTimeout,clearTimeout,document,post}=ports;
    let recording=null,timeScale=0,clockMs=0;
    const storyboard={durationMs:15000},videoMimeType=()=> 'video/webm';
    const rail={updateVisibility(){}},lighting={update(){}},panel={refreshStoryboard(){},refreshTime(){}};
    const invalidate=()=>{},stepFx=()=>{},seekTimeline=t=>{clockMs=t;},getWorld=()=>({mapId:'test'});
    ${functions}
    return {recordVideo,stopRecording,state:()=>({active:!!recording,timeScale}),clock:t=>{clockMs=t;}};
  `);
  const api=make({MediaRecorder:Recorder,renderer:{domElement:{captureStream(){const t=track();return {getTracks:()=>[t],getVideoTracks:()=>[t]};}}},
    performance:{now:()=>now},setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
    document:{createElement(){return {click(){downloads++;}}}},post:{render(){if(throwAt==='render')throw Error('render');}}});
  return {...api,encoders,tracks,timers,throwAt:x=>{throwAt=x;},tick:()=>{for(const fn of [...timers.values()])fn();},
    now:x=>{now=x;},downloads:()=>downloads};
}
for(const stage of ['constructor','start','render','requestFrame']) {
  const f=fixture();f.throwAt(stage);
  await assert.rejects(f.recordVideo({download:false}),new RegExp(stage));
  assert.equal(f.state().active,false);assert.ok(f.tracks.every(t=>t.stopped));assert.equal(f.timers.size,0);
  f.throwAt('');const retry=f.recordVideo({download:false});const recorder=f.encoders.at(-1);
  recorder.chunk();assert.equal(f.state().timeScale,1);f.clock(15000);f.stopRecording();recorder.emit('stop');
  assert.equal((await retry).durationMs,15000);assert.equal(f.state().active,false);
}
{
  const f=fixture(),promise=f.recordVideo();const rejected=assert.rejects(promise,/encoder did not start/);
  f.encoders[0].chunk(0);assert.equal(f.state().timeScale,0);f.tick();await rejected;
  assert.equal(f.state().active,false);assert.ok(f.tracks[0].stopped);assert.equal(f.downloads(),0);
}
{
  const f=fixture(),promise=f.recordVideo();const rejected=assert.rejects(promise,/encoder error/),old=f.encoders[0];
  old.emit('error',{error:new Error('encoder error')});await rejected;
  const retry=f.recordVideo({download:false}),fresh=f.encoders[1];fresh.chunk();assert.equal(f.state().timeScale,1);
  old.chunk();old.emit('stop');assert.deepEqual(f.state(),{active:true,timeScale:1});assert.equal(f.downloads(),0);
  f.clock(15000);f.stopRecording();fresh.emit('stop');await retry;
}
{
  const f=fixture(),promise=f.recordVideo({download:false}),recorder=f.encoders[0];
  assert.equal(f.state().timeScale,0);f.stopRecording();recorder.chunk();assert.equal(f.state().timeScale,0);
  recorder.emit('stop');assert.equal((await promise).durationMs,0);assert.equal(f.timers.size,0);
}
console.log('studioRecording.selftest: encoder startup/retry, timeout, late error events, session ownership and zero-duration cancellation pass');
