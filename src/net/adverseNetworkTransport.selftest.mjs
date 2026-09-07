import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import {
  createAdverseNetworkTransport,
  networkSimulationOptions,
  parseNetworkSimulationSeed,
} from './adverseNetworkTransport.ts';

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
assert.equal(networkSimulationOptions('?netSeed=7'), null,
  'a seed alone never enables impairment on the normal transport path');
for (const seed of [0, 1, 0xffffffff]) {
  assert.equal(parseNetworkSimulationSeed(String(seed)), seed);
  assert.equal(networkSimulationOptions(`?netSim=1&netSeed=${seed}`).netSeed, seed);
}
for (const seed of ['', '-1', '4294967296', '1.5', 'NaN', 'Infinity', '0x20', '1e3', ' 2']) {
  assert.throws(() => parseNetworkSimulationSeed(seed), /seed/i);
  assert.throws(() => networkSimulationOptions(`?netSim=1&netSeed=${encodeURIComponent(seed)}`), /seed/i);
}
assert.throws(() => networkSimulationOptions('?netSim=1&netSeed=1&netSeed=2'), /seed/i);

// Execute only the runner's real argument/query expressions, never its browser
// or server owner. This keeps CLI validation covered in the Node-only suite.
const scaleSource = readFileSync(new URL('../../tools/multiplayer-four-player-soak.mjs', import.meta.url), 'utf8');
const seedConfiguration = scaleSource.slice(scaleSource.indexOf('const seedArguments ='),
  scaleSource.indexOf('const rosterTimeoutMs ='));
assert.ok(seedConfiguration.startsWith('const seedArguments ='));
const scaleSeed = (argv) => runInNewContext(`${seedConfiguration}\nseed;`, {
  process: { argv }, parseNetworkSimulationSeed,
});
assert.equal(scaleSeed([]), null, 'omitting --seed preserves the unseeded baseline');
assert.equal(scaleSeed(['--seed=0']), 0);
assert.equal(scaleSeed(['--seed=4294967295']), 0xffffffff);
for (const value of ['', '-1', '4294967296', '1.5', '1e3']) {
  assert.throws(() => scaleSeed([`--seed=${value}`]), /seed/i);
}
assert.throws(() => scaleSeed(['--seed=1', '--seed=2']), /seed/i);
const queryConfiguration = scaleSource.slice(scaleSource.indexOf('    const netSeed ='),
  scaleSource.indexOf('    await page.goto('));
assert.ok(queryConfiguration.includes('const query ='));
const scaleQuery = (seed, index) => runInNewContext(`${queryConfiguration}\nquery;`, {
  seed, index, latencyMs: 45, jitterMs: 15, lossPercent: 5, inputLossPercent: 3,
});
assert.equal(scaleQuery(0, 0), '', 'the local host loopback is not impaired');
assert.equal(scaleQuery(null, 1), '?netSim=1&netLatency=45&netJitter=15&netLoss=5&netInputLoss=3');
const guestSeeds = Array.from({ length: 13 }, (_, index) =>
  networkSimulationOptions(scaleQuery(0xffffffff, index + 1)).netSeed);
assert.equal(new Set(guestSeeds).size, 13, 'all thirteen guest streams have distinct derived seeds');
assert.ok(guestSeeds.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff));

function seededReceipt(netSeed) {
  const clock = createScheduler();
  const transport = fakeTransport();
  const completed = [];
  const originalSend = transport.sendInput;
  transport.sendInput = (message) => {
    completed.push(['send', message.seq, clock.clock()]);
    return originalSend.call(transport, message);
  };
  const impaired = createAdverseNetworkTransport(transport, {
    netSeed, latencyMs: 50, jitterMs: 50, stateLossRate: 0.2, inputLossRate: 0.2,
    clock: clock.clock, schedule: clock.schedule, cancel: clock.cancel,
  });
  impaired.onMessage((message) => completed.push(['receive', message.seq, clock.clock()]));
  for (let seq = 0; seq < 80; seq++) {
    impaired.sendInput({ type: 'input', seq });
    transport.emit({ type: 'snapshot', seq, tick: seq * 3 });
  }
  clock.run();
  const receipt = { completed, stats: impaired.stats };
  impaired.dispose();
  return receipt;
}
const seededZero = seededReceipt(0);
assert.deepEqual(seededReceipt(0), seededZero,
  'the same admitted traffic and scheduler produce identical delays, loss and completion order');
assert.notDeepEqual(seededReceipt(1).completed, seededZero.completed,
  'independent seeds do not force every QA peer through the same impairment stream');
assert.ok(seededZero.stats.droppedInput > 0 && seededZero.stats.droppedState > 0);
assert.ok(seededZero.stats.reorderedOutgoingInput > 0 && seededZero.stats.reorderedIncomingState > 0);
assert.equal(seededZero.stats.netSeed, 0, 'zero is a real seed, not the unseeded fallback');
for (const netSeed of [-1, 0x100000000, 0.5, NaN, Infinity]) {
  assert.throws(() => createAdverseNetworkTransport(fakeTransport(), { netSeed }), /seed/i);
}
assert.throws(() => createAdverseNetworkTransport(fakeTransport(), { netSeed: 1, rng: () => 0 }),
  /seed|rng/i, 'a receipt cannot claim a seed while a different RNG actually owns the draws');

function reorderedFixture(extra = {}) {
  const clock = createScheduler();
  const transport = fakeTransport();
  let draw = 0;
  const impaired = createAdverseNetworkTransport(transport, {
    latencyMs: 50, jitterMs: 50, rng: () => draw++ % 2 === 0 ? 1 : 0,
    clock: clock.clock, schedule: clock.schedule, cancel: clock.cancel,
    ...extra,
  });
  return { clock, transport, impaired };
}
{
  const { clock, transport, impaired } = reorderedFixture();
  const received = [];
  impaired.onMessage((message) => received.push([message.type, message.seq]));
  impaired.sendInput({ type: 'input', seq: 1 });
  impaired.sendInput({ type: 'input', seq: 2 });
  impaired.sendState({ type: 'snapshot', seq: 20 });
  impaired.sendState({ type: 'snapshot', seq: 21 });
  transport.emit({ type: 'input', seq: 3 });
  transport.emit({ type: 'input', seq: 4 });
  transport.emit({ type: 'snapshot', seq: 30 });
  transport.emit({ type: 'snapshot', seq: 31 });
  for (const key of ['reorderedOutgoingInput', 'reorderedOutgoingState',
    'reorderedIncomingInput', 'reorderedIncomingState']) assert.equal(impaired.stats[key], 0,
    'opposing scheduled deadlines alone do not count as observed completion');
  clock.run();
  assert.deepEqual(transport.sent.map((message) => message.seq), [2, 21, 1, 20]);
  assert.deepEqual(received, [['input', 4], ['snapshot', 31], ['input', 3], ['snapshot', 30]]);
  for (const key of ['reorderedOutgoingInput', 'reorderedOutgoingState',
    'reorderedIncomingInput', 'reorderedIncomingState']) assert.equal(impaired.stats[key], 1);
  impaired.dispose();
}
{
  const { clock, transport, impaired } = reorderedFixture();
  const received = [];
  impaired.onMessage((message) => received.push(message.seq));
  impaired.send({ type: 'event', seq: 20 });
  impaired.send({ type: 'event', seq: 21 });
  transport.emit({ type: 'event', seq: 30 });
  transport.emit({ type: 'event', seq: 31 });
  clock.run();
  assert.deepEqual(transport.sent.map((message) => message.seq), [20, 21]);
  assert.deepEqual(received, [30, 31], 'reliable incoming control is still ordered under opposing jitter');
  assert.equal(impaired.stats.reorderedOutgoingState, 0);
  assert.equal(impaired.stats.reorderedIncomingState, 0);
  impaired.dispose();
}
{
  const originalRandom = Math.random;
  let draws = 0;
  Math.random = () => { draws++; return 0.5; };
  try {
    const clock = createScheduler();
    const impaired = createAdverseNetworkTransport(fakeTransport(), {
      clock: clock.clock, schedule: clock.schedule, cancel: clock.cancel,
    });
    impaired.sendInput({ type: 'input', seq: 0 });
    clock.run();
    assert.equal(draws, 1, 'the default QA wrapper still uses the existing Math.random path');
    assert.equal(impaired.stats.netSeed, null);
    impaired.dispose();
  } finally {
    Math.random = originalRandom;
  }
}
for (const [type, counter] of [
  ['input', 'reorderedIncomingInput'], ['snapshot', 'reorderedIncomingState'],
]) {
  const { clock, transport, impaired } = reorderedFixture({ jitterMs: 0 });
  const delivered = [];
  const record = (message) => delivered.push(message.seq);
  let unsubscribe = impaired.onMessage(record);
  transport.emit({ type, seq: 20 });
  clock.run();
  transport.emit({ type, seq: 19 });
  unsubscribe();
  clock.run();
  assert.equal(impaired.stats[counter], 0,
    'a stale packet whose last consumer unsubscribed before delivery is not an observed reorder');
  transport.emit({ type, seq: 30 });
  clock.run();
  unsubscribe = impaired.onMessage(record);
  transport.emit({ type, seq: 25 });
  clock.run();
  assert.equal(impaired.stats[counter], 0,
    'a packet delivered to nobody cannot advance the observed receive watermark');
  transport.emit({ type, seq: 24 });
  clock.run();
  assert.equal(impaired.stats[counter], 1, 'a stale packet delivered to a live consumer still counts');
  transport.emit({ type, seq: 23 });
  unsubscribe();
  impaired.onMessage(record);
  clock.run();
  assert.equal(impaired.stats[counter], 2,
    'a replacement consumer present at timer delivery receives the packet normally');
  assert.deepEqual(delivered, [20, 25, 24, 23]);
  assert.equal(impaired.stats.delayedIncoming, 6, 'scheduled receipt accounting is unchanged');
  assert.equal(impaired.stats.pending, 0);
  impaired.dispose();
}
{
  const { clock, transport, impaired } = reorderedFixture({ jitterMs: 0 });
  const receivedSequences = [];
  impaired.onMessage((message) => receivedSequences.push(message.seq));
  for (const seq of [0x7ffffffe, 0x7fffffff, 0, 1, 1]) {
    impaired.sendInput({ type: 'input', seq });
    transport.emit({ type: 'snapshot', seq });
  }
  clock.run();
  assert.equal(impaired.stats.reorderedOutgoingInput, 0, 'normal sequence wrap and duplicate are not reordering');
  assert.equal(impaired.stats.reorderedIncomingState, 0);
  impaired.sendInput({ type: 'input', seq: 0x7fffffff });
  transport.emit({ type: 'snapshot', seq: 0x7fffffff });
  clock.run();
  assert.equal(impaired.stats.reorderedOutgoingInput, 1, 'a delayed pre-wrap packet really is stale');
  assert.equal(impaired.stats.reorderedIncomingState, 1);
  assert.deepEqual(receivedSequences, [0x7ffffffe, 0x7fffffff, 0, 1, 1, 0x7fffffff],
    'receive wrap counters describe packets actually delivered to a consumer');
  for (const seq of [-1, 0x80000000, '0', NaN, undefined]) {
    impaired.sendInput({ type: 'input', seq });
    transport.emit({ type: 'snapshot', seq });
  }
  clock.run();
  assert.equal(impaired.stats.reorderedOutgoingInput, 1, 'invalid sequences are not evidence of reordering');
  assert.equal(impaired.stats.reorderedIncomingState, 1);
  impaired.dispose();
}
for (const rejectedSequence of [1, 2]) {
  const { clock, transport, impaired } = reorderedFixture();
  transport.sendInput = (message) => message.seq !== rejectedSequence;
  impaired.sendInput({ type: 'input', seq: 1 });
  impaired.sendInput({ type: 'input', seq: 2 });
  clock.run();
  assert.equal(impaired.stats.reorderedOutgoingInput, 0, 'a rejected stale send never completed');
  impaired.sendState({ type: 'snapshot', seq: 1 });
  impaired.sendState({ type: 'snapshot', seq: 2 });
  impaired.close();
  clock.run();
  assert.equal(impaired.stats.reorderedOutgoingState, 0, 'cancelled delayed sends never completed');
  assert.equal(impaired.stats.pending, 0);
  impaired.dispose();
}
{
  const { clock, transport, impaired } = reorderedFixture({ rng: () => NaN, inputLossRate: 0.5 });
  impaired.sendInput({ type: 'input', seq: 0 });
  clock.run();
  assert.equal(transport.sent.length, 1, 'invalid injected loss draws preserve the prior no-drop fallback');
  assert.equal(impaired.stats.droppedInput, 0);
  impaired.dispose();
}

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
lossBase.emit({ type: 'input', seq: 0 });
lossScheduler.run();
assert.equal(lossy.stats.droppedInput, 2, 'incoming replaceable input observes its configured loss');
assert.equal(lossy.stats.reorderedIncomingInput, 0, 'dropped traffic cannot count as completed reorder');

console.log('adverseNetworkTransport.selftest: seeded QA/CLI, observed reorder, ordered control, jitter, and loss passed');
