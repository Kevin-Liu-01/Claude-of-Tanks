// Compose an existing browser tool with the shared capture queue. Tools that
// already acquire the queue themselves must not be wrapped a second time.
import { spawn } from 'node:child_process';
import { createCaptureLock } from './capture-lock.mjs';

export function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child=spawn(command,args,{stdio:'inherit',...options});
    child.once('error',reject);
    child.once('close',(code,signal)=>{
      if(code===0)resolve();
      else reject(Object.assign(new Error(`${command} exited ${code ?? signal}`),{status:code ?? 128}));
    });
  });
}

export async function runCapturedCommand(command,args,options={},capture={}) {
  const lock=capture.lock ?? createCaptureLock();
  await lock.acquire(capture.timeoutMs ?? 45*60*1000);
  const release=()=>lock.release();
  process.once('exit',release);
  const refresher=setInterval(()=>lock.refresh(),capture.refreshMs ?? 30000);
  refresher.unref();
  try {
    await runCommand(command,args,options);
  } finally {
    clearInterval(refresher);
    process.removeListener('exit',release);
    release();
  }
}
