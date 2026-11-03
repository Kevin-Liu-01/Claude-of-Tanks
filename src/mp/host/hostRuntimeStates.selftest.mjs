// Proof (implicit state machine audit M1/M3, 2026-11-02): the browser host's runtime states and its core's end.
// MatchHost.setState refused only a move to the same state and the Worker's 'ready' checked only its own latch, while
// the port stays subscribed PORT_CLOSE_GRACE_MS after a stop or a boot timeout: a 'ready' in flight across the thread
// boundary moved a stopped or failed host to 'live' (its drain then let the stopped actor's reports reach the room, it
// overwrote the page's kernels report, and a later stop() emitted 'stopped' again). And the core never marked itself
// stopped once its actor ended itself after the verdict: it kept its links and admitted re-offering peers.
//   - a ready after stop() leaves the host stopped; a second stop() emits nothing;
//   - a ready after the boot timeout leaves it failed;
//   - a ready while booting goes live, once;
//   - a core whose actor ended itself is stopped and refuses a new link (link_close back to the main thread).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHostPortPair } from './hostProtocol.ts';
import { createMatchHost } from './matchHost.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { FakeSignalRelay, RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { TICK_MS } from '../wire/constants.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';

const hostSecret = createHash('sha256').update('host-runtime-states').digest('hex');
const seats = [
  { seat: 0, playerId: 'host', name: 'Host', team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: -30, z: 0, yaw: 0 } },
  { seat: 1, playerId: 'peer', name: 'Peer', team: 'bravo', specId: 't90am', spawn: { x: 30, z: 0, yaw: Math.PI } },
];
const config = { roomId: 'STATE1', matchId: 'm1-005ta7e5', generation: 1, mapId: 'verdant', mode: 'standard', seed: 2, seats, bots: [], countdownS: 0, battleLimitS: 600, hostSecret, manifestBase: null, resume: null };

/** A host on a port the receipt answers by hand (a Worker whose replies are in flight), on virtual timers. */
function scriptedHost() {
  let nowMs = 0, serial = 0;
  const timers = new Map();
  let deliver = null;
  const sent = [];
  const port = { post(message) { sent.push(message.type); }, onMessage(listener) { deliver = listener; return () => { deliver = null; }; }, close() {} };
  const states = [];
  const relay = new FakeSignalRelay('host', 1);
  const host = createMatchHost({
    playerId: 'host', generation: () => 1, createPort: () => port, createPeerConnection: new RtcWorld().createPeerConnection,
    room: { signaler: relay.signalerFor('host'), reportMatch: async () => {} },
    clock: () => nowMs,
    setTimer(callback, delayMs) { const handle = ++serial; timers.set(handle, { dueMs: nowMs + delayMs, callback }); return handle; },
    clearTimer(handle) { timers.delete(handle); },
    bootTimeoutMs: 1000,
  });
  host.onState((state) => states.push(state));
  return {
    host, states, sent,
    worker: (message) => deliver?.(message),
    advance(ms) {
      nowMs += ms;
      for (const [handle, timer] of [...timers]) if (timer.dueMs <= nowMs) { timers.delete(handle); timer.callback(); }
    },
  };
}
const ready = { type: 'ready', tick: 0, entities: 2, resumed: false, kernels: { mode: 'ts', reason: 'off' } };

// ---- a ready in flight when the session stopped the host
{
  const run = scriptedHost();
  const starting = run.host.start(config).catch((error) => error);
  assert.equal(run.host.state, 'booting');
  run.host.stop();
  run.advance(100); // inside the port's close grace
  run.worker(ready);
  assert.equal(run.host.state, 'stopped', `a ready after stop() leaves the host stopped (was: ${run.host.state})`);
  run.host.stop();
  assert.deepEqual(run.states, ['booting', 'stopped'], `no second 'stopped', no 'live' (${run.states.join(' → ')})`);
  assert.ok((await starting) instanceof Error, 'the start rejected with the stop');
}

// ---- a ready landing just after the boot timeout
{
  const run = scriptedHost();
  const starting = run.host.start(config).catch((error) => error);
  run.advance(1001);
  assert.equal(run.host.state, 'failed', 'the boot timed out');
  run.worker(ready);
  assert.equal(run.host.state, 'failed', 'a late ready leaves a failed host failed');
  assert.deepEqual(run.states, ['booting', 'failed']);
  assert.ok((await starting) instanceof Error);
}

// ---- the ordinary boot: booting → live, once
{
  const run = scriptedHost();
  const starting = run.host.start(config);
  run.worker(ready);
  run.worker(ready);
  await starting;
  assert.equal(run.host.state, 'live');
  assert.deepEqual(run.states, ['booting', 'live']);
  run.host.stop();
  assert.deepEqual(run.states, ['booting', 'live', 'stopped']);
}

// ---- a core whose actor ends itself after its verdict is stopped, and refuses a new link
{
  await ensureAuthorityFleet(seats.map((seat) => seat.specId));
  let nowMs = 0, serial = 0;
  const timers = new Map();
  const pair = createHostPortPair();
  const posted = [];
  pair.main.onMessage((message) => posted.push(message));
  const core = createMatchHostCore({
    port: pair.worker, buildWorld: async () => 'terrain', now: () => nowMs, schedule: () => () => {}, endedLingerTicks: 10,
    setTimer(callback, delayMs) { const handle = ++serial; timers.set(handle, { dueMs: nowMs + delayMs, callback }); return handle; },
    clearTimer(handle) { timers.delete(handle); },
  });
  pair.main.post({ type: 'boot', config: { ...config, battleLimitS: 1 } });
  for (let n = 0; n < 400 && !core.actor; n++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(core.actor, 'the core booted');
  for (let n = 0; n < 200 && !core.actor.stopped; n++) { nowMs += TICK_MS; core.actor.advance(nowMs); }
  assert.equal(core.actor.stopped, true, 'setup: the actor ended itself after its verdict and linger');
  for (const [handle, timer] of [...timers]) if (timer.dueMs <= nowMs) { timers.delete(handle); timer.callback(); }
  assert.equal(core.stopped, true, `the core is stopped with its actor (was: ${core.stopped})`);
  posted.length = 0;
  pair.main.post({ type: 'link_open', peer: 7, label: 'late', playerId: 'peer' });
  for (let n = 0; n < 4; n++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(posted.some((message) => message.type === 'link_close' && message.peer === 7), 'a link opened after the end is closed at once');
  core.dispose();
  pair.main.close();
}
console.log('hostRuntimeStates: a stopped or failed host stays so whatever its thread replies, a live one goes live once, and a core whose actor ended is stopped');
