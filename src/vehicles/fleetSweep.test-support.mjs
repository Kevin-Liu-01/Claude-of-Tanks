import {spawn} from 'node:child_process';

// Functional sweep watchdog, not a switch-latency benchmark. Only completing
// the next declared vehicle resets it; logs, duplicates and malformed IPC do
// not. Wait for the owned child to close before releasing the runner's lease.
export function runFleetSweep(source,{
  spawnProcess=spawn,signals=process,setTimer=setTimeout,clearTimer=clearTimeout,
  now=()=>performance.now(),log=console.log,timeoutMs=240000,killGraceMs=5000,
}={}){
  return new Promise((resolve,reject)=>{
    const started=now(),child=spawnProcess(process.execPath,['--input-type=module','-e',source],
      {stdio:['ignore','inherit','inherit','ipc']});
    let ids,index=0,last=started,maximumStepMs=0,timer,killer,failure,closed=false;
    const stop=(error,signal='SIGTERM')=>{
      failure??=error;clearTimer(timer);if(killer||closed)return;
      child.kill(signal);killer=setTimer(()=>{if(!closed)child.kill('SIGKILL');},killGraceMs);
    };
    const arm=()=>{clearTimer(timer);timer=setTimer(()=>stop(new Error(
      `Fleet sweep stalled for ${timeoutMs}ms after ${index}/${ids?.length??'?'} vehicles`)),timeoutMs);};
    const interrupt=()=>stop(new Error('Fleet sweep interrupted'),'SIGINT');
    const terminate=()=>stop(new Error('Fleet sweep terminated'));
    const cleanup=()=>{closed=true;clearTimer(timer);clearTimer(killer);
      signals.removeListener('SIGINT',interrupt);signals.removeListener('SIGTERM',terminate);};
    signals.on('SIGINT',interrupt);signals.on('SIGTERM',terminate);arm();
    child.on('message',message=>{
      if(closed||failure)return;
      if(message?.kind==='fleet-start'){
        if(ids||!Array.isArray(message.ids)||!message.ids.length
          ||message.ids.some(id=>typeof id!=='string'||!id)||new Set(message.ids).size!==message.ids.length)
          return stop(new Error('Invalid fleet sweep declaration'));
        ids=[...message.ids];return; // declaration alone is not completed work
      }
      if(message?.kind!=='fleet-complete')return;
      if(!ids||index>=ids.length||message.id!==ids[index])
        return stop(new Error('Fleet sweep completion is missing, duplicate or out of order'));
      const at=now();maximumStepMs=Math.max(maximumStepMs,at-last);last=at;index++;arm();
      if(index%16===0||index===ids.length)log(`[fleet-sweep] completed ${index}/${ids.length}: ${message.id}`);
    });
    child.once('error',error=>{failure??=error;if(!child.pid){cleanup();reject(error);}else stop(error);});
    child.once('close',(code,signal)=>{
      cleanup();if(failure)return reject(failure);
      if(code!==0)return reject(new Error(`Fleet sweep exited ${code??signal}`));
      if(!ids||index!==ids.length)return reject(new Error('Fleet sweep exited without complete coverage'));
      const elapsedMs=now()-started;
      log(`[fleet-sweep] ${index} vehicles; ${elapsedMs.toFixed(0)}ms elapsed; ${maximumStepMs.toFixed(0)}ms longest progress interval`
        +(elapsedMs>timeoutMs?'; SLOW: exceeds former aggregate watchdog (not a performance pass)':''));
      resolve({count:index,elapsedMs,maximumStepMs});
    });
  });
}
