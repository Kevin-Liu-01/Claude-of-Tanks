import assert from 'node:assert/strict';
import { createFrameLoopScheduler } from '../engine/frameLoopScheduler.ts';
import { createNetworkBrowserSessionRuntime } from './networkBrowserSessionRuntime.ts';
import { createBrowserInputRuntime } from './browserInputRuntime.ts';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.ts';
import { createLoopbackTransportPair } from './loopbackTransport.ts';
import { captureWorldSnapshot } from './snapshot.ts';
import { createEnvelope, MESSAGE_TYPES } from './protocol.ts';

function fixture({ wake = true } = {}) {
  let nowMs = 0, focused = true, active = true, timer, scheduler;
  let presentation = 0, callbacks = 0, lastInputs;
  const events = new Map();
  const host = new AuthoritativeMatchRuntime({ maxCatchUpTicks: 6, simulation: {
    step({ inputs }) { lastInputs = inputs; },
    snapshot({ tick, ackInputSeq }) {
      return captureWorldSnapshot({ tick, serverTimeMs: tick * 1000 / 60,
        entities: [], viewerId: 'local', ackInputSeq, meta: { phase: 'playing' } });
    },
  } });
  function attach(id) {
    const link = createLoopbackTransportPair({ direct: true });
    host.attachPeer({ peerId: id, transport: link.host });
    const client = new MatchClientRuntime({ playerId: id, transport: link.client, clock: () => nowMs });
    client.connect(); client.readyForMatch();
    return client;
  }
  const local = attach('local'), remote = attach('remote');
  const player = { state: { pos: { x: 0, y: 0, z: 0 }, yaw: 0 },
    input: { throttle: 1, steer: 0.2, fire: true, shellSlot: 2,
      aimPoint: { x: 0, y: 0, z: 100 } }, combat: { destroyed: false } };
  const session = createNetworkBrowserSessionRuntime({ getPlayer: () => player,
    isBattleActive: () => active, shouldPresentDisconnect: () => active, nextFrame: async () => {},
    onBackgroundActivity() { callbacks++; if (wake) scheduler.wakeBackground?.(); },
  });
  session.publishMatch({ role: 'host', client: local, ready: () => local.readyForMatch(),
    onRemoteInput(listener) {
      return host.onInputAccepted?.((id) => { if (id !== 'local') listener(); }) ?? (() => {});
    },
    advance(elapsedMs, input) {
      if (input) local.submitInput(input, host.tick);
      host.advance(elapsedMs); return local.update(nowMs);
    },
    close() { local.close(); host.close(); },
  });
  session.publishBridge({ entities: new Map(), dispose() {},
    apply() { presentation++; }, recordInput() { presentation++; return true; },
    advancePrediction() { presentation++; return true; } });
  session.ensureInputRuntime(createBrowserInputRuntime).queueConsumable(0);
  scheduler = createFrameLoopScheduler({ tick() { assert.fail('background wake cannot render'); },
    isBootComplete: () => true, hasBackgroundWork: () => !!session.match,
    backgroundTick: (at) => session.pumpBackground(at), now: () => nowMs,
    documentState: { get hidden() { return !focused; }, hasFocus: () => focused },
    inputTarget: { addEventListener(name, fn) { events.set(name, fn); }, removeEventListener() {} },
    setRecurring(fn) { timer = fn; return 1; }, clearRecurring() {},
    requestFrame() { return 1; }, cancelFrame() {},
  });
  session.pump(1 / 60, nowMs);
  const initialPresentation = presentation;
  focused = false; events.get('blur')();
  const input = { throttle: 0.6, steer: 0, fire: false, aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 1 };
  return { host, local, remote, session, scheduler, input, initialPresentation,
    setTime(at) { nowMs = at; }, timer() { timer(); },
    foreground() { focused = true; events.get('focus')(); },
    setActive(value) { active = value; },
    get presentation() { return presentation; }, get callbacks() { return callbacks; },
    get lastInputs() { return lastInputs; },
    close() { scheduler.dispose(); session.close('test_complete'); remote.close(); } };
}

const running = fixture();
try {
  for (let step = 1; step <= 300; step++) {
    running.setTime(step * 1000 / 30);
    running.remote.submitInput(running.input, running.host.tick);
    if (step % 30 === 0) running.timer(); // Actual throttled-timer model: one callback per second.
  }
  assert.equal(running.host.tick, 601, '30 Hz fresh remote input must service 600 fixed ticks despite a 1 Hz timer');
  assert.equal(running.presentation, running.initialPresentation);
  assert.equal(running.lastInputs.get('local').throttle, 0);
  assert.equal(running.lastInputs.get('local').fire, false);
  assert.equal(running.lastInputs.get('local').actionBits, 0);
  assert.equal(running.lastInputs.get('remote').throttle, 0.6);
  assert.equal(running.local.getStats().pendingInputEdges, 0);
  const beforeBurst = running.host.tick;
  for (let packet = 0; packet < 256; packet++) running.remote.submitInput(running.input, running.host.tick);
  assert.equal(running.host.tick, beforeBurst, 'same-time packet flood cannot accelerate simulation');
  const beforeInvalid = running.callbacks;
  running.host.acceptPeerMessage('remote', {});
  for (const payload of [{ inputSeq: 0, clientTick: 0 }, { inputSeq: 10000, clientTick: 1000000 },
    { inputSeq: 10000, clientTick: running.host.tick, snapshotAckTick: running.host.tick + 1 }]) {
    running.host.acceptPeerMessage('remote', createEnvelope(MESSAGE_TYPES.INPUT,
      { ...running.input, ...payload }, { seq: 10000, tick: running.host.tick }));
  }
  assert.equal(running.callbacks, beforeInvalid, 'malformed, stale, future and invalid-ACK input cannot request service');
  running.setActive(false); running.setTime(10100);
  running.remote.submitInput(running.input, running.host.tick);
  assert.equal(running.callbacks, beforeInvalid, 'retained non-battle room does not request authority service');
  running.setActive(true); running.foreground();
  running.remote.submitInput(running.input, running.host.tick);
  assert.equal(running.host.tick, beforeBurst, 'foreground packets never create a second simulation clock');
  running.session.pump(0.1, 10100);
  const afterVisible = running.host.tick;
  running.session.pump(0.1, 10100);
  assert.equal(running.host.tick, afterVisible, 'same timestamp cannot be consumed twice');
  const timing = running.session.diagnostics().pumpTiming;
  assert.ok(timing.backgroundDiscardedMs < 1e-6);
  console.log(JSON.stringify({ scenario: 'background-1Hz-timer-30Hz-input', simulatedTicks: 600,
    backgroundRenderCalls: 0, discardedBackgroundMs: timing.backgroundDiscardedMs }));
} finally { running.close(); }

const silent = fixture({ wake: false });
try {
  for (let step = 1; step <= 10; step++) { silent.setTime(step * 1000); silent.timer(); }
  assert.equal(silent.host.tick, 61, 'a silent throttled page retains the safe catch-up cap');
  assert.equal(silent.host.stats.droppedCatchUpMs, 0, 'authority never saw the time clamped by its browser owner');
  const timing = silent.session.diagnostics().pumpTiming;
  assert.equal(timing.backgroundElapsedMs, 10000);
  assert.equal(timing.backgroundDiscardedMs, 9000, 'upstream discarded wall time must be visible separately');
  assert.equal(timing.backgroundMaxGapMs, 1000);
  silent.setTime(20000); silent.timer();
  assert.equal(silent.host.tick, 67, 'OS suspension still cannot fast-forward the match');
  silent.setTime(30000); silent.foreground();
  silent.session.pump(0.1, 30000);
  assert.equal(silent.host.tick, 73, 'foreground resumption shares the same safe catch-up cap');
  assert.equal(silent.session.diagnostics().pumpTiming.backgroundDiscardedMs, 28800,
    'the first visible callback also reports time lost since its last background service');
  silent.session.pump(0.1, 30000);
  assert.equal(silent.host.tick, 73, 'simultaneous focus/timer delivery cannot consume resumed time twice');
  console.log(JSON.stringify({ scenario: 'background-1Hz-timer-no-input', simulatedTicks: 60,
    authorityDroppedMs: 0, browserDiscardedMs: timing.backgroundDiscardedMs }));
} finally { silent.close(); }

console.log('networkBackgroundWake.selftest: PASS');
