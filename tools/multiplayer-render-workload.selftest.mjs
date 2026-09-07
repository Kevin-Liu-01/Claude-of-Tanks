import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { createMultiplayerRenderWorkload, readRenderWorkloadState,
  classifyRenderWorkload, renderWorkloadFailureEvidence } from './multiplayer-render-workload.mjs';

function state({ focused = true, hidden = false, time = 1000, animation = 10,
  background = 0, snapshots = 20, inputs = 30, connected = true } = {}) {
  return { pageTimeMs: time, focused, hidden, phase: 'battle', connected,
    animationTicks: animation, backgroundTicks: background,
    snapshotPacketsReceived: snapshots, inputPacketsSubmitted: inputs };
}
const world = { window: { __DEBUG: {
  frameLoopScheduler: { animationTicks: 4, backgroundTicks: 7, PRIVATE_DATA: 'PRIVATE_SECRET' },
  network: { connected: true, snapshotPacketsReceived: 9, inputPacketsSubmitted: 10, peerId: 'PRIVATE_ID' },
  game: { phase: 'battle', player: { input: { fire: true } } },
  input: { getState() { assert.fail('observation must not consume input'); } },
} }, document: { hasFocus: () => true, hidden: false }, performance: { now: () => 2000 } };
assert.deepEqual(JSON.parse(JSON.stringify(runInNewContext(`(${readRenderWorkloadState})()`, world))),
  state({ time: 2000, animation: 4, background: 7, snapshots: 9, inputs: 10 }));
assert.doesNotMatch(JSON.stringify(runInNewContext(`(${readRenderWorkloadState})()`, world)), /PRIVATE|fire/);

const dualBefore = [state(), state()];
const dualAfter = [state({ time: 2000, animation: 30, snapshots: 35, inputs: 50 }),
  state({ time: 2000, animation: 30, snapshots: 35, inputs: 50 })];
assert.equal(classifyRenderWorkload(dualBefore, dualAfter, 'host').classification, 'dual-render-observed');
const hiddenBefore = state({ focused: false, hidden: true });
const hiddenAfter = state({ focused: false, hidden: true, time: 2000, background: 20, snapshots: 35, inputs: 50 });
const single = classifyRenderWorkload([dualBefore[0], hiddenBefore], [dualAfter[0], hiddenAfter], 'host');
assert.equal(single.classification, 'single-foreground-live-background-observed');
assert.equal(single.peers[1].animationDelta, 0);
assert.equal(single.peers[1].backgroundDelta, 20);
assert.equal(single.peers[0].intervalMs, 1000);
assert.equal(classifyRenderWorkload(dualBefore, [dualAfter[0], hiddenAfter], 'host').classification,
  'mixed-or-unverified', 'endpoint transition is not certified as a fully background peer');
assert.equal(classifyRenderWorkload(dualBefore, [state({ animation: 1 }), dualAfter[1]], 'host').classification,
  'mixed-or-unverified', 'counter reset cannot masquerade as no rendering');

async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
async function reached(predicate) {
  for (let index = 0; index < 200 && !predicate(); index++) await Promise.resolve();
  assert.ok(predicate(), 'the bounded fake command reached its explicit pause');
}
function fixture({ duplicateWindow = false, rejectAt, failAdmission, failCleanup = false,
  lateCreate = false, pauseFirstRestore = false } = {}) {
  let now = 0;
  let serial = 0;
  let releasedLate;
  let releasedRestore;
  const timers = new Map();
  const calls = [];
  const rows = [state({ time: 0 }), state({ time: 0 })];
  const native = [0, 1].map((index) => ({ left: index * 1280, top: 0, width: 1280, height: 800, windowState: 'normal' }));
  const original = structuredClone(native);
  const detached = [0, 0];
  const reads = [0, 0];
  let restoring = false;
  const advanceRows = (ms) => {
    now += ms;
    for (const row of rows) {
      row.pageTimeMs = now;
      if (row.hidden) row.backgroundTicks += Math.floor(ms / 50);
      else row.animationTicks += Math.floor(ms / 16);
      row.snapshotPacketsReceived += Math.floor(ms / 50);
      row.inputPacketsSubmitted += Math.floor(ms / 50);
    }
    if (failAdmission === 'scheduler' && rows[1].hidden) rows[1].animationTicks++;
    if (failAdmission === 'network') rows[1].snapshotPacketsReceived = 20;
  };
  const clock = { now: () => now,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { at: now + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async advance(ms) {
      await flush(); const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        advanceRows(next[1].at - now); timers.delete(next[0]); next[1].fn(); await flush();
      }
      advanceRows(end - now); await flush();
    },
    async sleep(ms) { calls.push(['sleep', ms]); advanceRows(ms); },
  };
  const sessions = [0, 1].map((index) => ({
    async send(method, args) {
      calls.push([index, method, args]);
      if (rejectAt === method) throw new Error('PRIVATE_TOKEN https://PRIVATE_URL');
      if (method === 'Browser.getWindowForTarget') return { windowId: duplicateWindow ? 1 : index + 1,
        bounds: { ...native[index] }, targetId: 'PRIVATE_TARGET' };
      if (method === 'Browser.getWindowBounds') return { bounds: { ...native[index] } };
      if (method === 'Browser.setWindowBounds') {
        assert.equal(args.windowId, index + 1, 'commands stay bound to the exact acquired page/window');
        if (pauseFirstRestore && !releasedRestore) {
          await new Promise((resolve) => { releasedRestore = resolve; });
        }
        if (restoring && failCleanup) throw new Error('PRIVATE_RESTORE');
        Object.assign(native[index], args.bounds);
        rows[index].hidden = native[index].windowState === 'minimized';
        rows[index].focused = !rows[index].hidden;
        if (failAdmission === 'focus' && index === 1) rows[index].focused = true;
      }
      return {};
    },
    async detach() { calls.push([index, 'detach']); detached[index]++; },
  }));
  const pages = sessions.map((session, index) => ({
    target: () => ({ createCDPSession() {
      calls.push([index, 'create']);
      if (lateCreate && index === 1) return new Promise((resolve) => { releasedLate = () => resolve(session); });
      return session;
    } }),
    async bringToFront() { calls.push([index, 'front']); },
    async evaluate(fn) { reads[index]++; assert.equal(fn, readRenderWorkloadState); return { ...rows[index] }; },
  }));
  return { pages, calls, rows, clock, timers, native, original, detached, reads,
    advanceRows, restoring() { restoring = true; }, releaseLate() { releasedLate(); },
    releaseRestore() { releasedRestore(); } };
}

const ordinary = fixture();
const defaultOwner = await createMultiplayerRenderWorkload(ordinary.pages, {}, ordinary.clock);
await defaultOwner.begin('host'); ordinary.advanceRows(20000);
const defaultReceipt = await defaultOwner.finish('host');
assert.equal(defaultReceipt.requested, 'dual-render-stress');
assert.equal(defaultReceipt.sample.classification, 'dual-render-observed');
await defaultOwner.dispose();
assert.deepEqual(ordinary.calls, [], 'default observation adds no native window/session control or settling delay');

const controlled = fixture();
const owner = await createMultiplayerRenderWorkload(controlled.pages, { mode: 'single-foreground' }, controlled.clock);
for (const role of ['host', 'guest']) {
  await owner.begin(role);
  const index = role === 'host' ? 0 : 1;
  assert.equal(controlled.native[1 - index].windowState, 'minimized');
  assert.equal(controlled.native[index].windowState, 'normal');
  controlled.advanceRows(20000);
  const receipt = await owner.finish(role);
  assert.equal(receipt.admission.classification, 'single-foreground-live-background-observed');
  assert.equal(receipt.sample.classification, 'single-foreground-live-background-observed');
  assert.equal(receipt.sample.peers[1 - index].animationDelta, 0);
  assert.equal(receipt.sample.peers[1 - index].backgroundDelta, 400);
  assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE|windowId|left|targetId|https?:/);
}
const disposal = owner.dispose(); assert.equal(owner.dispose(), disposal); await disposal;
assert.deepEqual(controlled.native, controlled.original);
assert.deepEqual(controlled.detached, [1, 1]);
assert.equal(controlled.timers.size, 0);

for (const failAdmission of ['focus', 'scheduler', 'network']) {
  const f = fixture({ failAdmission });
  const candidate = await createMultiplayerRenderWorkload(f.pages, { mode: 'single-foreground' }, f.clock);
  await assert.rejects(candidate.begin('host'), (error) => {
    assert.match(error.message, /render_workload_admission_failed/);
    const receipt = renderWorkloadFailureEvidence(error);
    assert.equal(receipt.admission.classification, 'mixed-or-unverified');
    assert.equal(receipt.admission.peers.length, 2);
    assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE|windowId|targetId|https?:/);
    return true;
  });
  await candidate.dispose();
  assert.deepEqual(f.native, f.original);
  assert.deepEqual(f.detached, [1, 1]);
}
const lateFailure = fixture();
const checked = await createMultiplayerRenderWorkload(lateFailure.pages, { mode: 'single-foreground' }, lateFailure.clock);
await checked.begin('host'); lateFailure.advanceRows(20000); lateFailure.rows[1].animationTicks++;
await assert.rejects(checked.finish('host'), (error) => {
  assert.match(error.message, /render_workload_observation_failed/);
  assert.equal(renderWorkloadFailureEvidence(error).sample.peers[1].animationDelta, 1);
  return true;
});
lateFailure.rows[0].phase = lateFailure.rows[1].phase = 'garage';
lateFailure.rows[0].connected = lateFailure.rows[1].connected = false;
await checked.dispose();
assert.deepEqual(lateFailure.native, lateFailure.original, 'cleanup does not depend on the battle remaining active');

for (const options of [{ duplicateWindow: true }, { rejectAt: 'Browser.getWindowForTarget' }]) {
  const f = fixture(options);
  await assert.rejects(createMultiplayerRenderWorkload(f.pages, { mode: 'single-foreground' }, f.clock),
    /render_workload_start_failed/);
  assert.ok(f.detached.every((value) => value <= 1));
  assert.ok(!f.calls.some((call) => call[1] === 'Browser.setWindowBounds'), 'no mutation before distinct-window proof');
}
const cleanupFailure = fixture({ failCleanup: true });
const broken = await createMultiplayerRenderWorkload(cleanupFailure.pages, { mode: 'single-foreground' }, cleanupFailure.clock);
await broken.begin('host'); cleanupFailure.restoring();
await assert.rejects(broken.dispose(), /^Error: render_workload_cleanup_failed$/);
assert.deepEqual(cleanupFailure.detached, [1, 1], 'restoration failure cannot skip session disposal');

const late = fixture({ lateCreate: true });
const pending = createMultiplayerRenderWorkload(late.pages, { mode: 'single-foreground', commandTimeoutMs: 10 }, late.clock);
const rejected = assert.rejects(pending, /^Error: render_workload_start_failed$/);
await late.clock.advance(10); await rejected; late.releaseLate(); await flush();
assert.deepEqual(late.detached, [1, 1], 'late session creation after timeout is still owned and detached');
assert.equal(late.timers.size, 0);

const cancelled = fixture();
let settle;
cancelled.clock.sleep = () => new Promise((resolve) => { settle = resolve; });
const cancelOwner = await createMultiplayerRenderWorkload(cancelled.pages, { mode: 'single-foreground' }, cancelled.clock);
const admission = cancelOwner.begin('host');
const cancelledAdmission = assert.rejects(admission, /render_workload_admission_failed/);
await reached(() => typeof settle === 'function');
const restoring = cancelOwner.dispose();
settle(); await cancelledAdmission; await restoring;
assert.deepEqual(cancelled.native, cancelled.original);
assert.deepEqual(cancelled.detached, [1, 1]);
assert.equal(cancelled.calls.filter((call) => call[1] === 'Browser.setWindowBounds' &&
  call[2].bounds.windowState === 'minimized').length, 1,
'an interrupted admission cannot mutate a window after cleanup');
assert.deepEqual(cancelled.reads, [0, 0], 'cancelled settling cannot proceed into observation');

const midCommand = fixture({ pauseFirstRestore: true });
const midOwner = await createMultiplayerRenderWorkload(midCommand.pages, { mode: 'single-foreground' }, midCommand.clock);
const midAdmission = assert.rejects(midOwner.begin('host'), /render_workload_admission_failed/);
await flush();
const midDisposal = midOwner.dispose();
midCommand.releaseRestore(); await midAdmission; await midDisposal;
assert.deepEqual(midCommand.native, midCommand.original);
assert.deepEqual(midCommand.detached, [1, 1]);
assert.ok(!midCommand.calls.some((call) => call[1] === 'Browser.setWindowBounds' &&
  call[2].bounds.windowState === 'minimized'), 'disposal during restore fences subsequent peer minimize');
assert.ok(!midCommand.calls.some((call) => call[0] === 'sleep'));
assert.deepEqual(midCommand.reads, [0, 0]);

const timedMutation = fixture({ pauseFirstRestore: true });
timedMutation.native[0].windowState = timedMutation.original[0].windowState = 'minimized';
const timedOwner = await createMultiplayerRenderWorkload(timedMutation.pages,
  { mode: 'single-foreground', commandTimeoutMs: 10 }, timedMutation.clock);
const timedAdmission = assert.rejects(timedOwner.begin('host'), /render_workload_admission_failed/);
await timedMutation.clock.advance(10); await timedAdmission;
await assert.rejects(timedOwner.dispose(), /render_workload_cleanup_failed/,
  'an unresolved timed-out native mutation cannot produce a verified restoration receipt');
assert.deepEqual(timedMutation.detached, [1, 1], 'uncertain native state cannot skip bounded session disposal');
timedMutation.releaseRestore(); await flush();
assert.equal(timedMutation.native[0].windowState, 'normal', 'late native completion models the exact uncertainty');
assert.equal(timedMutation.timers.size, 0);
assert.equal(renderWorkloadFailureEvidence({ renderWorkload: { PRIVATE: true } }), null,
  'untrusted errors cannot inject an arbitrary receipt');

for (const originalState of ['maximized', 'fullscreen', 'minimized']) {
  const f = fixture();
  f.native[0].windowState = originalState;
  f.original[0].windowState = originalState;
  const candidate = await createMultiplayerRenderWorkload(f.pages, { mode: 'single-foreground' }, f.clock);
  await candidate.begin('host');
  await candidate.dispose();
  assert.deepEqual(f.native, f.original, 'restore rectangle and initial native state independently');
  assert.ok(f.calls.filter((call) => call[1] === 'Browser.setWindowBounds')
    .every((call) => call[2].bounds.windowState === undefined || Object.keys(call[2].bounds).length === 1),
  'CDP window-state commands cannot be combined with rectangle fields');
}

console.log('multiplayer render workload selftest: PASS');
