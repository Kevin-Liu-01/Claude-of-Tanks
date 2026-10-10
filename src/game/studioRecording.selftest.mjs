import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

// Exercise the real recording functions with a controlled browser encoder.
// Event order and failure injection are independent of production internals.
const source=readFileSync(new URL('./studio.ts',import.meta.url),'utf8');
const begin=source.indexOf('  function recordVideo('),end=source.indexOf('  function recordingStatus()',begin);
assert.ok(begin>0 && end>begin);
const functions=stripTypeScriptTypes(source.slice(begin,end));
const tickBegin=source.indexOf('  function tick(dt: number'),tickEnd=source.indexOf('  function urlParam(',tickBegin);
assert.ok(tickBegin>0&&tickEnd>tickBegin);
const tickFunction=stripTypeScriptTypes(source.slice(tickBegin,tickEnd));
function fixture() {
  const encoders=[],tracks=[],timers=new Map();let timerId=0,now=0,throwAt='',downloads=0,submitted=0,chunkAfter=Infinity;
  class Recorder {
    state='inactive';mimeType='video/webm';listeners=new Map();
    constructor(){if(throwAt==='constructor')throw Error('constructor');encoders.push(this);}
    addEventListener(type,fn){this.listeners.set(type,fn);}
    emit(type,event={}){this.listeners.get(type)?.(event);}
    start(){if(throwAt==='start')throw Error('start');this.state='recording';}
    stop(){this.state='inactive';}
    chunk(size=1){this.emit('dataavailable',{data:new Blob([new Uint8Array(size)])});}
  }
  const track=()=>{const t={stopped:false,stop(){this.stopped=true;},requestFrame(){if(throwAt==='requestFrame')throw Error('requestFrame');if(++submitted===chunkAfter)encoders.at(-1).chunk();}};tracks.push(t);return t;};
  const make=new Function('ports',`
    const {MediaRecorder,renderer,performance,setTimeout,clearTimeout,document,post}=ports;
    let recording=null,timeScale=0,clockMs=0,filming=false;
    const storyboard={durationMs:15000},videoMimeType=()=> 'video/webm';
    const rail={updateVisibility(){}},lighting={update(){},updateFrustums(){}},panel={tick(){},refreshStoryboard(){},refreshTime(){}};
    let poolSweepAcc=0,frameDirty=false,lastFov=60;
    const camera={fov:60,position:{},getWorldDirection(){}},_fwd={},perf={skippedFrames:0,renderedFrames:0};
    const updateCamera=()=>false,sweepPool=()=>{},advanceTimeline=ms=>{clockMs+=ms;},syncCrushPlan=()=>{};
    const invalidate=()=>{frameDirty=true;},stepFx=()=>{},seekTimeline=t=>{clockMs=t;},getWorld=()=>({mapId:'test',update(){}}),flareToWallClock=()=>{};
    ${functions}
    ${tickFunction}
    return {recordVideo,stopRecording,frame:(dt=1/60,wall=dt)=>tick(dt,wall),perf,clockValue:()=>clockMs,state:()=>({active:!!recording,timeScale}),clock:t=>{clockMs=t;}};
  `);
  const api=make({MediaRecorder:Recorder,renderer:{domElement:{captureStream(){const t=track();return {getTracks:()=>[t],getVideoTracks:()=>[t]};}}},
    performance:{now:()=>now},setTimeout(fn){timers.set(++timerId,fn);return timerId;},clearTimeout(id){timers.delete(id);},
    document:{createElement(){return {click(){downloads++;}}}},post:{render(){if(throwAt==='render')throw Error('render');}}});
  return {...api,frame:(dt=1/60,wall=dt)=>{now+=wall*1000;api.frame(dt,wall);},encoders,tracks,timers,throwAt:x=>{throwAt=x;},tick:()=>{for(const fn of [...timers.values()])fn();},
    now:x=>{now=x;},downloads:()=>downloads,chunkAfter:n=>{chunkAfter=n;},submitted:()=>submitted};
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
{
  const f=fixture();f.chunkAfter(5);
  const promise=f.recordVideo({download:false}),recorder=f.encoders[0];
  for(let i=0;i<3;i++){f.frame();assert.equal(f.clockValue(),0);assert.equal(f.state().timeScale,0);}
  f.frame();assert.equal(f.submitted(),5);assert.equal(f.state().timeScale,1);assert.equal(f.clockValue(),0);
  f.frame();assert.ok(f.clockValue()>0);assert.equal(f.submitted(),5,'priming stops after first bytes');
  f.stopRecording();recorder.emit('stop');await promise;
  f.frame();const rendered=f.perf.renderedFrames;f.frame();assert.equal(f.perf.renderedFrames,rendered,'idle paused frames remain skipped');
}
{
  const f=fixture(),promise=f.recordVideo({download:false});
  const rejection=assert.rejects(promise,/requestFrame/);f.throwAt('requestFrame');f.frame();await rejection;
  assert.equal(f.state().active,false);assert.ok(f.tracks.every(t=>t.stopped));assert.equal(f.timers.size,0);
  f.throwAt('');const retry=f.recordVideo({download:false}),recorder=f.encoders.at(-1);
  recorder.chunk();f.clock(15000);f.stopRecording();recorder.emit('stop');await retry;
}
{
  const f=fixture(),promise=f.recordVideo({download:false}),recorder=f.encoders[0];
  f.now(800);recorder.chunk(); // Encoder lead-in is not authored playback.
  f.frame(.1,.8);assert.equal(f.clockValue(),800,'slow frame must retain actual encoded time');
  f.frame(.1,.35);assert.equal(f.clockValue(),1150,'capped interactive delta cannot slow the movie');
  f.frame(.1,20);assert.equal(f.clockValue(),15000,'catch-up remains bounded by the authored end');
  recorder.emit('stop');const result=await promise;
  assert.equal(result.durationMs,15000);assert.equal(result.leadInMs,800);
}
// Resize invalidates a temporal renderer even when the authored scene is paused.
// Exercise the actual still-capture transaction, including failure cleanup.
const captureBegin=source.indexOf('  function renderCaptureFrame(');
const captureEnd=source.indexOf('  function videoMimeType(',captureBegin);
assert.ok(captureBegin>0 && captureEnd>captureBegin);
const captureFunctions=stripTypeScriptTypes(source.slice(captureBegin,captureEnd));
function captureFixture({fail=false,pixelRatio=2}={}) {
  let width=1280,height=720,ratio=pixelRatio,target='1280x720',pending=0,clock=2500,draws=0,quality='preview';
  const cinema={setQuality(q){quality=q;}};
  const rail={group:{visible:true}},marker={group:{visible:false}};
  const camera={aspect:width/height,updateProjectionMatrix(){},updateMatrixWorld(){}};
  const renderer={
    getSize(v){v.x=width;v.y=height;},getPixelRatio:()=>ratio,
    setPixelRatio(v){ratio=v;},setSize(w,h){width=w;height=h;},
    capabilities:{maxTextureSize:4096},
    domElement:{toDataURL(){
      assert.equal(pending,0,'capture cannot read partially rebuilt history');
      assert.equal(quality,'capture','picture passes render at capture quality');
      assert.equal(rail.group.visible,false);assert.equal(marker.group.visible,false);
      if(fail)throw Error('readback failed');
      return 'data:image/png;base64,capture';
    }},
  };
  const post={
    setSize(w,h){const next=w+'x'+h;if(next!==target){pending=4;target=next;}},
    render(dt){clock+=dt*1000;draws++;pending=Math.max(0,pending-1);},
  };
  const scene={userData:{volumetricClouds:{settleForCapture(){
    const changed=pending>0;pending=0;return changed;
  }}}};
  const capture=new Function('ports',`
    const {renderer,camera,post,scene,rail,marker,cinema}=ports;
    const _size={},CAPTURE_MAX_W=4096,CAPTURE_MIN_W=1920;
    const lighting={updateFrustums(){},update(){}},stepFx=()=>{};
    ${captureFunctions}
    return capture;
  `)({renderer,camera,post,scene,rail,marker,cinema});
  return {capture,cut(){pending=4;},state:()=>({width,height,ratio,pending,clock,draws,aspect:camera.aspect,rail:rail.group.visible,marker:marker.group.visible,quality})};
}
for(const fail of [false,true]) {
  const f=captureFixture({fail});
  if(fail)assert.throws(()=>f.capture({width:3840,height:2160}),/readback failed/);
  else assert.deepEqual(f.capture({width:3840,height:2160}),{dataURL:'data:image/png;base64,capture',width:3840,height:2160});
  assert.deepEqual(f.state(),{width:1280,height:720,ratio:2,pending:0,clock:2500,draws:4,aspect:1280/720,rail:true,marker:false,quality:'preview'});
}
{
  const f=captureFixture({pixelRatio:1});
  f.capture({width:1280,height:720});assert.equal(f.state().draws,2,'same-size video frames retain their history');
  f.cut();f.capture({width:1280,height:720});
  assert.equal(f.state().pending,0);assert.equal(f.state().clock,2500);
}
console.log('studioRecording.selftest: recording lifecycle and settled, clock-preserving capture/resize/failure recovery pass');
