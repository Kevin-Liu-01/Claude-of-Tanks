import assert from 'node:assert/strict';
import { ConnectionRecovery } from './recovery.ts';

const recovery = new ConnectionRecovery();
const step = (nowMs, transportState, welcomed, lastAuthorityAtMs, openedAtMs = 0) =>
  recovery.update({ nowMs, transportState, welcomed, lastAuthorityAtMs, openedAtMs });

assert.equal(recovery.current, 'idle');
let s = step(0, 'connecting', false, null, null);
assert.deepEqual([s.phase, s.changed, s.requestReconnect, s.fail], ['connecting', true, false, false]);
s = step(50, 'open', false, null, 50);
assert.equal(s.phase, 'handshaking');
s = step(120, 'open', true, null, 50);
assert.equal(s.phase, 'handshaking', 'WELCOME alone is not live: the first snapshot is');
s = step(200, 'open', true, 200, 50);
assert.equal(s.phase, 'live');
// Authority stops: 5 s later the match is stalled and a fresh socket is requested once.
s = step(5_199, 'open', true, 200, 50);
assert.equal(s.phase, 'live');
s = step(5_200, 'open', true, 200, 50);
assert.deepEqual([s.phase, s.changed, s.requestReconnect], ['stalled', true, true]);
assert.equal(recovery.stallCount, 1);
s = step(5_300, 'open', true, 200, 50);
assert.deepEqual([s.phase, s.changed, s.requestReconnect], ['stalled', false, false], 'the reconnect request goes out once');
assert.equal(s.outageMs, 100);
// The transport reconnects, the handshake repeats, authority resumes.
s = step(5_400, 'reconnecting', false, null, null);
assert.equal(s.phase, 'reconnecting');
s = step(5_700, 'open', false, null, 5_700);
assert.equal(s.phase, 'handshaking');
s = step(5_750, 'open', true, null, 5_700);
assert.equal(s.phase, 'handshaking', 'a WELCOME on the new socket does not end the outage');
assert.ok(s.outageMs > 0);
s = step(5_800, 'open', true, 5_800, 5_700);
assert.deepEqual([s.phase, s.changed, s.outageMs], ['live', true, 0]);
assert.equal(recovery.recoveryCount, 1);
assert.equal(recovery.outageStartedAtMs, null);
// A second stall that never recovers fails after the 60 s grace.
s = step(11_000, 'open', true, 5_800, 5_700);
assert.equal(s.phase, 'stalled');
assert.equal(s.requestReconnect, true, 'a new stall may request a socket again');
s = step(30_000, 'reconnecting', false, null, null);
assert.equal(s.phase, 'reconnecting');
s = step(70_999, 'reconnecting', false, null, null);
assert.equal(s.phase, 'reconnecting');
s = step(71_000, 'reconnecting', false, null, null);
assert.deepEqual([s.phase, s.fail], ['failed', true], '60 s after the stall began the match is failed');
s = step(80_000, 'open', true, 80_000, 79_000);
assert.equal(s.phase, 'failed', 'failed is terminal');

// A socket that opens and is welcomed but never receives authority stalls from its open time.
const silent = new ConnectionRecovery();
silent.update({ nowMs: 0, transportState: 'open', welcomed: true, lastAuthorityAtMs: null, openedAtMs: 0 });
assert.equal(silent.current, 'handshaking');
assert.equal(silent.update({ nowMs: 5_000, transportState: 'open', welcomed: true, lastAuthorityAtMs: null, openedAtMs: 0 }).phase, 'stalled');

const closedTransport = new ConnectionRecovery();
let c = closedTransport.update({ nowMs: 0, transportState: 'open', welcomed: true, lastAuthorityAtMs: 0, openedAtMs: 0 });
assert.equal(c.phase, 'live');
c = closedTransport.update({ nowMs: 100, transportState: 'closed', welcomed: false, lastAuthorityAtMs: 0, openedAtMs: 0 });
assert.deepEqual([c.phase, c.fail], ['failed', true], 'a closed transport ends the match');

const left = new ConnectionRecovery();
left.update({ nowMs: 0, transportState: 'open', welcomed: true, lastAuthorityAtMs: 0, openedAtMs: 0 });
left.end('left');
assert.equal(left.current, 'left');
assert.equal(left.update({ nowMs: 1, transportState: 'open', welcomed: true, lastAuthorityAtMs: 1, openedAtMs: 0 }).phase, 'left');

const custom = new ConnectionRecovery({ stallMs: 1_000, graceMs: 3_000 });
custom.update({ nowMs: 0, transportState: 'open', welcomed: true, lastAuthorityAtMs: 0, openedAtMs: 0 });
assert.equal(custom.update({ nowMs: 1_000, transportState: 'open', welcomed: true, lastAuthorityAtMs: 0, openedAtMs: 0 }).phase, 'stalled');
assert.equal(custom.update({ nowMs: 3_999, transportState: 'open', welcomed: true, lastAuthorityAtMs: 0, openedAtMs: 0 }).phase, 'stalled');
assert.equal(custom.update({ nowMs: 4_000, transportState: 'open', welcomed: true, lastAuthorityAtMs: 0, openedAtMs: 0 }).phase, 'failed');


// ---- 2026-10-15 (the MP stream): a starved tab's own stall never reads as a dead host. The stall clock restarts at the
// last frame this tab's tasks were seen starved (starvedAtMs): authority missing while the tab could not read it is
// not a stall; five seconds of it after the tab runs again are.
{
  const starved = new ConnectionRecovery();
  const at = (nowMs, lastAuthorityAtMs, starvedAtMs = null) => starved.update({ nowMs, transportState: 'open', welcomed: true, lastAuthorityAtMs, openedAtMs: 0, starvedAtMs });
  assert.equal(at(100, 100).phase, 'live');
  // the tab is starved for 6.5 s (a roster being painted under the loader): no stall, no reconnect
  for (let t = 200; t <= 6_600; t += 50) {
    const step = at(t, 100, t);
    assert.equal(step.requestReconnect, false, `starved at ${t} ms: no reconnect`);
    assert.notEqual(step.phase, 'stalled');
  }
  // the tab runs again and authority stays missing: the stall comes 5 s after the starvation ended, not before
  assert.notEqual(at(11_599, 100, 6_600).phase, 'stalled');
  const late = at(11_600, 100, 6_600);
  assert.deepEqual([late.phase, late.requestReconnect], ['stalled', true], 'a host still silent 5 s after the tab woke is stalled');
  // the control: the same silence without starvation stalls at 5 s
  const plain = new ConnectionRecovery();
  plain.update({ nowMs: 100, transportState: 'open', welcomed: true, lastAuthorityAtMs: 100, openedAtMs: 0 });
  const control = plain.update({ nowMs: 5_100, transportState: 'open', welcomed: true, lastAuthorityAtMs: 100, openedAtMs: 0 });
  assert.deepEqual([control.phase, control.requestReconnect], ['stalled', true], 'control: 5 s of silence while the tab ran');
}

console.log('mp recovery: live → stalled after 5 s (one reconnect request) → reconnecting → live, 60 s grace → failed, left/closed terminal pass');
