// Compose an existing browser tool with the shared capture queue. The command runs with the hold's nested-hold token
// (capture-lock.mjs nestedEnv, 2026-11-02 audit S4): a tool that acquires the queue itself nests in this hold instead of
// queueing behind its own parent's live pid until its timeout.
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
  // the class (timing or render) comes from the command this runs, unless capture.lockClass names it
  await lock.acquire(capture.timeoutMs ?? 45*60*1000,{command:[command,...args].join(' '),lockClass:capture.lockClass ?? null});
  const release=()=>lock.release();
  process.once('exit',release);
  const refresher=setInterval(()=>lock.refresh(),capture.refreshMs ?? 30000);
  refresher.unref();
  try {
    await runCommand(command,args,{...options,env:{...(options.env ?? process.env),...(lock.nestedEnv?.() ?? {})}});
  } finally {
    clearInterval(refresher);
    process.removeListener('exit',release);
    release();
  }
}
