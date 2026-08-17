import assert from 'node:assert/strict';
import {
  createAdverseNetworkTransport,
  networkSimulationOptions,
} from './adverseNetworkTransport.js';

function createScheduler() {
  let now = 0;
  let nextId = 1;
  const jobs = new Map();
  return {
    clock: () => now,
    schedule(callback, delayMs) {
      const id = nextId++;
      jobs.set(id, { callback, at: now + delayMs });
      return id;
    },
    cancel(id) { jobs.delete(id); },
    run() {
      while (jobs.size) {
        const [id, job] = [...jobs.entries()].sort((a, b) => a[1].at - b[1].at)[0];
        jobs.delete(id);
        now = job.at;
        job.callback();
      }
    },
  };
}

function createQuantizedReverseTieScheduler() {
  let now = 0;
  let nextId = 1;
  const jobs = new Map();
  return {
    clock: () => now,
    schedule(callback, delayMs) {
      const id = nextId++;
      jobs.set(id, { callback, at: Math.floor(now + delayMs) });
      return id;
    },
    cancel(id) { jobs.delete(id); },
    run() {
      while (jobs.size) {
        const [id, job] = [...jobs.entries()].sort((a, b) =>
          a[1].at - b[1].at || b[0] - a[0])[0];
        jobs.delete(id);
        now = job.at;
        job.callback();
      }
    },
  };
}

function fakeTransport() {
  const listeners = new Set();
  const sent = [];
  return {
    kind: 'fake', readyState: 'open', bufferedAmount: 0, sent,
    send(message) { sent.push(message); return true; },
    sendInput(message) { sent.push({ ...message, lane: 'input' }); return true; },
    sendState(message) { sent.push(message); return true; },
    onMessage(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    onClose() { return () => {}; },
    onError() { return () => {}; },
    close() { this.readyState = 'closed'; },
    emit(message) { for (const listener of listeners) listener(message); },
  };
}

assert.deepEqual(networkSimulationOptions('?netLatency=140&netJitter=40&netLoss=12'), {
  latencyMs: 140, jitterMs: 40, stateLossRate: 0.12, inputLossRate: 0,
});
assert.equal(networkSimulationOptions(''), null);
assert.deepEqual(networkSimulationOptions('?netSim=1'), {
  latencyMs: 90, jitterMs: 25, stateLossRate: 0.05, inputLossRate: 0,
});

const scheduler = createScheduler();
const base = fakeTransport();
const randomValues = [0.2, 0.9, 0.1, 0.8, 0.3, 0.7];
let randomIndex = 0;
const simulated = createAdverseNetworkTransport(base, {
  latencyMs: 100,
  jitterMs: 50,
  stateLossRate: 0,
  rng: () => randomValues[randomIndex++ % randomValues.length],
  clock: scheduler.clock,
  schedule: scheduler.schedule,
  cancel: scheduler.cancel,
});
simulated.send({ type: 'input', seq: 1 });
simulated.send({ type: 'input', seq: 2 });
simulated.sendInput({ type: 'input', seq: 3 });
simulated.sendState({ type: 'snapshot', tick: 3 });
assert.equal(base.sent.length, 0, 'simulator delays outbound traffic');
scheduler.run();
assert.deepEqual(base.sent.filter((entry) => entry.type === 'input' && !entry.lane)
  .map((entry) => entry.seq), [1, 2],
  'reliable control remains ordered under opposing jitter');
assert.equal(base.sent.find((entry) => entry.seq === 3)?.lane, 'input',
  'simulated steering preserves the production replaceable lane');

const quantizedScheduler = createQuantizedReverseTieScheduler();
const quantizedBase = fakeTransport();
const quantized = createAdverseNetworkTransport(quantizedBase, {
  latencyMs: 100,
  jitterMs: 50,
  rng: (() => {
    const values = [1, 0];
    let index = 0;
    return () => values[index++ % values.length];
  })(),
  clock: quantizedScheduler.clock,
  schedule: quantizedScheduler.schedule,
  cancel: quantizedScheduler.cancel,
});
quantized.send({ type: 'hello', seq: 0 });
quantized.send({ type: 'ready', seq: 1 });
quantizedScheduler.run();
assert.deepEqual(quantizedBase.sent.map((entry) => entry.type), ['hello', 'ready'],
  'reliable ordering survives whole-millisecond browser timer quantization');

const received = [];
simulated.onMessage((message) => received.push(message.tick));
base.emit({ type: 'snapshot', tick: 3 });
base.emit({ type: 'snapshot', tick: 6 });
scheduler.run();
assert.deepEqual(received.sort((a, b) => a - b), [3, 6],
  'unordered snapshot lane survives deterministic jitter scheduling');
assert.equal(simulated.stats.pending, 0);

const lossScheduler = createScheduler();
const lossBase = fakeTransport();
const lossy = createAdverseNetworkTransport(lossBase, {
  stateLossRate: 1,
  inputLossRate: 1,
  rng: () => 0,
  clock: lossScheduler.clock,
  schedule: lossScheduler.schedule,
  cancel: lossScheduler.cancel,
});
lossy.sendState({ type: 'snapshot', tick: 3 });
lossy.sendInput({ type: 'input', seq: 4 });
lossBase.emit({ type: 'snapshot', tick: 6 });
lossScheduler.run();
assert.equal(lossy.stats.droppedState, 2,
  'state loss applies independently in both directions');
assert.equal(lossy.stats.droppedInput, 1,
  'input loss targets only the replaceable steering lane');

console.log('adverseNetworkTransport.selftest: ordered control, jitter, and loss passed');
