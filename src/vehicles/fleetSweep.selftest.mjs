import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {runFleetSweep} from './fleetSweep.test-support.mjs';
function fixture(){
  const child=new EventEmitter(),signals=new EventEmitter(),timers=new Map(),kills=[];let clock=0,next=0;
  child.pid=123;child.kill=signal=>{kills.push(signal);return true;};
  const result=runFleetSweep('fixture',{spawnProcess:()=>child,signals,log(){},now:()=>clock,
    setTimer:(fn,ms)=>{timers.set(++next,{fn,at:clock+ms});return next;},clearTimer:id=>timers.delete(id)});
  const outcome=result.then(value=>({value}),error=>({error}));
  return{child,signals,timers,kills,outcome,
    step(ms){clock+=ms;for(const[id,timer]of [...timers])if(timer.at<=clock){timers.delete(id);timer.fn();}},
    start(ids=['a','b']){child.emit('message',{kind:'fleet-start',ids});},
    done(id){child.emit('message',{kind:'fleet-complete',id});},
    close(code=0){child.emit('close',code,null);},
  };
}
const healthy=fixture();healthy.start();healthy.step(200000);healthy.done('a');
healthy.step(200000);healthy.done('b');healthy.close();
assert.equal((await healthy.outcome).value.elapsedMs,400000);
assert.deepEqual(healthy.kills,[]);assert.equal(healthy.timers.size,0);
assert.equal(healthy.signals.listenerCount('SIGTERM'),0);
for(const failure of ['stalled','duplicate','wrong','missing','exit','interrupt','spawn']){
  const f=fixture();f.start();let settled=false;f.outcome.then(()=>settled=true);
  if(failure==='stalled'){
    f.step(239999);f.child.emit('message',{kind:'log',id:'anything'});
    f.step(1);assert.deepEqual(f.kills,['SIGTERM']);
    await Promise.resolve();assert.equal(settled,false,'retain ownership until the child closes');
    f.step(5000);assert.deepEqual(f.kills,['SIGTERM','SIGKILL']);
  }else if(failure==='duplicate'){f.done('a');f.done('a');}
  else if(failure==='wrong')f.done('b');
  else if(failure==='interrupt')f.signals.emit('SIGINT');
  else if(failure==='spawn')f.child.emit('error',new Error('spawn failed'));
  f.close(failure==='exit'?3:0);
  assert.ok((await f.outcome).error,failure);assert.equal(f.timers.size,0);
  assert.equal(f.signals.listenerCount('SIGTERM'),0);
}
for(const ids of [[],['a','a'],[null]]){
  const f=fixture();f.start(ids);f.close();assert.ok((await f.outcome).error);
}
// Real IPC/exit controls, with no short wall-clock assumptions on a busy host.
const source=`process.send({kind:'fleet-start',ids:['a']});process.send({kind:'fleet-complete',id:'a'});`;
assert.equal((await runFleetSweep(source,{log(){}})).count,1);
await assert.rejects(runFleetSweep(source+'process.exitCode=3;',{log(){}}),/exited 3/);
console.log('fleet sweep watchdog: complete ordered coverage, progress-only deadline, stall/kill escalation, signal/spawn/exit cleanup and real IPC PASS');
