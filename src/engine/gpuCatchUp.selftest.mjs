// (battle-spikes-253) The link polls' GPU catch-up gate (gpuCatchUp.ts): a poll asks its synchronous completion queries
// only once the fence its previous poll left has signalled, so no query waits behind a GPU process seconds behind
// (nav-perf's root-r room: a 1.3 s getProgramParameter at a Garage return). Without fences, on a lost context, or when
// a fence cannot be made or read, the gate answers caught up and the poll behaves as before.
import assert from 'node:assert/strict';
import { createGpuCatchUpGate } from './gpuCatchUp.ts';

function fencedContext() {
  const events = [];
  let next = 0;
  const signalled = new Set();
  const gl = {
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, TIMEOUT_EXPIRED: 0x911B, ALREADY_SIGNALED: 0x911A, WAIT_FAILED: 0x911D,
    lost: false, failFence: false, failWait: false, failStatus: null,
    isContextLost() { return this.lost; },
    fenceSync(condition, flags) {
      assert.equal(condition, 0x9117); assert.equal(flags, 0);
      if (this.failFence) return null;
      const fence = { id: ++next };
      events.push(['fence', fence.id]);
      return fence;
    },
    flush() { events.push(['flush']); },
    clientWaitSync(fence, flags, timeout) {
      assert.equal(flags, 0); assert.equal(timeout, 0, 'never a blocking wait');
      if (this.failWait) throw new Error('wait failed');
      if (this.failStatus !== null) return this.failStatus;
      return signalled.has(fence.id) ? this.ALREADY_SIGNALED : this.TIMEOUT_EXPIRED;
    },
    deleteSync(fence) { events.push(['delete', fence.id]); },
  };
  return { gl, events, signal: (id) => signalled.add(id) };
}

{
  const { gl, events, signal } = fencedContext();
  const gate = createGpuCatchUpGate(gl);
  assert.equal(gate.caughtUp(), false, 'the first poll only marks the queue');
  assert.deepEqual(events, [['fence', 1], ['flush']]);
  assert.equal(gate.caughtUp(), false, 'held while the GPU is behind that mark');
  assert.equal(gate.caughtUp(), false);
  signal(1);
  assert.equal(gate.caughtUp(), true, 'caught up: this poll may ask');
  assert.deepEqual(events.slice(2), [['delete', 1], ['fence', 2], ['flush']], 'and the next poll waits for this one');
  assert.equal(gate.caughtUp(), false);
  signal(2);
  assert.equal(gate.caughtUp(), true);
  gate.dispose();
  assert.deepEqual(events.at(-1), ['delete', 3], 'dispose deletes the outstanding fence');
}
{
  // a status that is neither pending nor signalled (WAIT_FAILED) holds nothing back
  const { gl } = fencedContext();
  const gate = createGpuCatchUpGate(gl);
  gate.caughtUp();
  gl.failStatus = gl.WAIT_FAILED;
  assert.equal(gate.caughtUp(), true);
}
for (const fault of ['no-fences', 'lost', 'fence-null', 'wait-throws']) {
  const { gl } = fencedContext();
  let context = gl;
  if (fault === 'no-fences') context = { isContextLost: () => false };
  if (fault === 'lost') gl.lost = true;
  if (fault === 'fence-null') gl.failFence = true;
  const gate = createGpuCatchUpGate(context);
  if (fault === 'wait-throws') { assert.equal(gate.caughtUp(), false); gl.failWait = true; }
  for (let i = 0; i < 3; i++) assert.equal(gate.caughtUp(), true, `${fault}: answers caught up, the poll as before`);
  gate.dispose();
}
// the renderer-wide link wait (main.ts awaitRendererProgramLinks: the battle visual stream's) polls through a gate too
{
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
  const at = main.indexOf('const awaitRendererProgramLinks = async');
  const body = main.slice(at, main.indexOf('\n};', at));
  assert.ok(at > 0 && body.includes('createGpuCatchUpGate(renderer.getContext())') && body.includes('if (gate.caughtUp())')
    && body.includes('gate.dispose()'), 'the renderer-wide link wait asks only once the GPU caught up');
}
console.log('gpuCatchUp.selftest: a poll asks only after its previous mark signalled; never a blocking wait; fenceless, lost and failing contexts answer caught up');
