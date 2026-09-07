import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCaptureLock } from './capture-lock.mjs';
import { runCommand, runCapturedCommand } from './capture-command.mjs';

const root=mkdtempSync(join(tmpdir(),'cot-capture-command-'));
const lockDir=join(root,'capture.lock'),queueDir=join(root,'capture.queue');
const options={stdio:'ignore'};
try {
  let refreshed=0,acquiredAt=0;
  const actual=createCaptureLock({lockDir,queueDir});
  const lock={
    async acquire(timeout) {await actual.acquire(timeout);acquiredAt=statSync(lockDir).mtimeMs;},
    refresh() {actual.refresh();refreshed++;},
    release() {actual.release();},
  };
  await runCapturedCommand(process.execPath,['-e','setTimeout(()=>{},150)'],options,
    {lock,timeoutMs:500,refreshMs:10});
  assert.ok(acquiredAt>0&&refreshed>0,'awaited subprocess leaves event loop available to refresh ownership');
  assert.equal(existsSync(lockDir),false,'successful subprocess releases ownership');
  await assert.rejects(runCapturedCommand(process.execPath,['-e','process.exit(7)'],options,{lock}),
    error=>error.status===7);
  assert.equal(existsSync(lockDir),false,'nonzero exit fails closed and releases ownership');
  await assert.rejects(runCapturedCommand(join(root,'missing-executable'),[],options,{lock}),/ENOENT/);
  assert.equal(existsSync(lockDir),false,'spawn failure releases ownership');
  await actual.acquire(500);
  const blocked=createCaptureLock({lockDir,queueDir});
  await assert.rejects(runCapturedCommand(process.execPath,['-e','process.exit(0)'],options,
    {lock:blocked,timeoutMs:10}),/timeout/);
  assert.equal(existsSync(lockDir),true,'failed waiter cannot release another capture owner');
  actual.release();
  await runCommand(process.execPath,['-e','process.exit(0)'],options);
  assert.equal(existsSync(lockDir),false,'CPU commands do not acquire the GPU queue');
} finally {rmSync(root,{recursive:true,force:true});}
console.log('capture-command: subprocess refresh, exit/spawn failure cleanup, ownership and unwrapped CPU execution pass');
