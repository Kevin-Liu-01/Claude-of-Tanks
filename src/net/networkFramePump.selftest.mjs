import assert from 'node:assert/strict';
import { createNetworkFramePump } from './networkFramePump.ts';

const calls = [];
const client = {
  closed: false,
  connected: true,
  lastSubmittedInputSeq: 9,
  drainEventsThrough(tick, target) { target.push({ type: 'tick', tick }); },
  getStats() { return { rttMs: 42 }; },
};
const match = {
  role: 'host',
  client,
  advance(dtMs, input) { calls.push(['advance', dtMs, input]); return { tick: 12 }; },
  update(nowMs) { calls.push(['update', nowMs]); return { tick: 13 }; },
  submitInput(input) { calls.push(['submit', input]); return true; },
};
const bridge = {
  apply(snapshot, dt, events) { calls.push(['apply', snapshot.tick, dt, [...events]]); },
  recordInput(input, elapsed, sequence) { calls.push(['record', input, elapsed, sequence]); },
  endDisconnected() { calls.push(['disconnected']); },
  getPredictionStats() { return { hardSnaps: 0 }; },
};
const status = {
  diagnosticsVisible: true,
  update(stats) { calls.push(['diagnostics', stats]); },
};
const recovery = {
  update() { return true; }, attach() {}, snapshot() {}, dispose() {},
};
const input = {
  frame() { return { throttle: 1, actionBits: 4 }; },
  advance(dt) { calls.push(['inputAdvance', dt]); },
  shouldSend() { return true; },
  commit() { calls.push(['commit']); return 0.025; },
  acknowledge(bits) { calls.push(['ack', bits]); },
  restore(bits) { calls.push(['restore', bits]); },
  resetCadence() { calls.push(['resetCadence']); },
  reset() { calls.push(['reset']); },
  queueAction(action) { calls.push(['action', action]); },
  queueConsumable(slot) { calls.push(['consumable', slot]); },
};

const pump = createNetworkFramePump({
  getMatch: () => match,
  getBridge: () => bridge,
  getStatus: () => status,
  getPlayer: () => ({ id: 'player' }),
  isBattleActive: () => true,
  recovery,
  nextFrame: async () => {},
  now: () => 0,
});
pump.ensureInputRuntime(() => input);
pump.queueAction('reloadMagazine');
pump.queueConsumable(2);
pump.pump(1 / 60, 500);
assert.ok(calls.some(([name, bits]) => name === 'ack' && bits === 4));
assert.ok(calls.some(([name, tick, , events]) =>
  name === 'apply' && tick === 12 && events[0].tick === 12));
assert.deepEqual(pump.diagnostics(), { rttMs: 42, prediction: { hardSnaps: 0 } });
assert.equal((await pump.waitForSnapshot((snapshot) => snapshot.tick === 12, 10, 'timeout')).tick, 12);

match.role = 'client';
pump.pump(0.025, 750);
assert.ok(calls.some(([name]) => name === 'inputAdvance'));
assert.ok(calls.some(([name]) => name === 'submit'));
assert.ok(calls.some(([name, , elapsed, sequence]) =>
  name === 'record' && elapsed === 0.025 && sequence === 9));

client.closed = true;
pump.pump(0.025, 900);
assert.ok(calls.some(([name]) => name === 'disconnected'),
  'the recovery expiry produces one presentation edge');

pump.clearRound();
assert.equal(pump.latestSnapshot, null);
pump.dispose();
assert.ok(calls.filter(([name]) => name === 'reset').length >= 2);

console.log('networkFramePump.selftest: host/client cadence and snapshot ownership passed');
