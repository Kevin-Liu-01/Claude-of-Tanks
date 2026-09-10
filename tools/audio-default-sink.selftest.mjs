import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audioSinkOrder, audioSinkOptions, audioSinkReadiness, runAudioSinkAttempt,
  summarizeAudioSinkExperiment } from './audio-default-sink.fixture.mjs';
import { audioProbeOptions, audioProbeLaunchOptions } from './audio-default-sink-probe.mjs';

function fixture(failure = '') {
  let now = 1000, context, created = 0;
  const calls = [];
  const env = { performance: { now: () => now, timeOrigin: 1234 }, navigator: { userActivation: { isActive: true } },
    requestAnimationFrame(callback) { queueMicrotask(() => { now += 16; callback(now); }); } };
  class FakeContext {
    constructor(options) {
      calls.push(['construct', structuredClone(options)]); created++;
      if (failure === 'constructor') throw new Error('constructor rejection');
      now += options.sinkId ? 2 : 120;
      this.sampleRate = 48000; this.baseLatency = 0.003; this.outputLatency = 0.01;
      this.sinkId = options.sinkId && failure !== 'ignored' ? { type: 'none' } : '';
      this.state = 'suspended'; this.destination = {}; this.epoch = now;
      if (failure === 'unsupported') this.setSinkId = undefined;
      context = this;
    }
    get currentTime() { return failure === 'clock' ? 0 : (now - this.epoch) / 1000; }
    getOutputTimestamp() { return { contextTime: failure === 'output' ? 0 : this.currentTime,
      performanceTime: failure === 'output' ? 0 : now }; }
    resume() { calls.push(['resume']); this.state = 'running'; return Promise.resolve(); }
    setSinkId(value) {
      calls.push(['setSinkId', value]);
      if (failure === 'switch') return Promise.reject(new Error('switch rejection'));
      return Promise.resolve().then(() => { now += 10; this.sinkId = ''; calls.push(['route-settled']); });
    }
    addEventListener() {}
    removeEventListener() {}
    createOscillator() {
      calls.push(['graph']);
      return { frequency: {}, connect() {}, disconnect() { calls.push(['disconnect-oscillator']); },
        start() { calls.push(['start']); }, stop() { calls.push(['stop']); } };
    }
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; }
    createAnalyser() {
      return { fftSize: 256, connect() {}, disconnect() {},
        getFloatTimeDomainData(data) { data.fill(failure === 'silence' ? 0 : 0.007); } };
    }
    close() { calls.push(['close']); this.state = 'closed'; return Promise.resolve(); }
  }
  env.AudioContext = FakeContext;
  return { env, calls, get created() { return created; }, get context() { return context; } };
}

assert.deepEqual(audioSinkOrder(1).map(row => row.mode), ['default', 'silent-then-default', 'silent-then-default', 'default']);
assert.equal(audioSinkOrder().length, 12);
for (const count of [0, 1.1, 7, NaN]) assert.throws(() => audioSinkOrder(count));
assert.deepEqual(audioSinkOptions('default'), { latencyHint: 'interactive' });
assert.deepEqual(audioSinkOptions('silent-then-default'), { latencyHint: 'interactive', sinkId: { type: 'none' } });
assert.throws(() => audioSinkOptions('other'));

const native = audioProbeLaunchOptions('/absolute/chrome');
assert.equal(native.headless, false);
assert.ok(native.ignoreDefaultArgs.includes('--mute-audio'));
assert.ok(native.args.every(value => !/autoplay|fake|mute|sample-rate/.test(value)));
assert.throws(() => audioProbeOptions(['--out=/absolute/out']));
assert.throws(() => audioProbeOptions(['--allow-native-audio', '--out=relative']));
assert.throws(() => audioProbeOptions(['--allow-native-audio', '--out=/absolute/out', '--headless']));
assert.equal(audioProbeOptions(['--allow-native-audio', '--out=/absolute/out']).blocks, 3);

const good = [];
for (const scenario of audioSinkOrder(1)) {
  const f = fixture();
  const attempt = runAudioSinkAttempt({ isTrusted: true }, scenario.mode, f.env);
  assert.equal(f.created, 1, 'constructor runs synchronously inside the trusted handler');
  assert.equal(f.calls[1][0], 'resume', 'resume begins before any async continuation');
  if (scenario.mode !== 'default') assert.deepEqual(f.calls[2], ['setSinkId', ''], 'only the default output is requested synchronously');
  const row = await attempt;
  assert.equal(row.ok, true, JSON.stringify(row));
  assert.equal(row.closed, true); assert.equal(row.route.sink, 'default');
  assert.equal(row.graphEnd.sampleRate, 48000);
  assert.equal(row.readiness.ok, true);
  assert.equal(f.context.state, 'closed'); assert.equal(f.calls.at(-1)[0], 'close');
  assert.equal(Object.hasOwn(f.calls[0][1], 'sampleRate'), false);
  assert.equal(row.constructor.endMs - row.constructor.startMs, scenario.mode === 'default' ? 120 : 2);
  if (row.setSink) assert.equal(row.setSink.settledMs - row.setSink.returnedMs, 10);
  good.push({ ...row, longTasksSupported: true, maxCallbackGapMs: scenario.mode === 'default' ? 128 : 17 });
}
assert.equal(summarizeAudioSinkExperiment(good).verdict, 'promising-microprobe-only');

for (const failure of ['constructor', 'unsupported', 'ignored', 'switch', 'clock', 'output', 'silence']) {
  const f = fixture(failure);
  const row = await runAudioSinkAttempt({ isTrusted: true }, 'silent-then-default', f.env);
  assert.equal(row.ok, false, failure); assert.equal(row.fallbackRequired, true, failure);
  assert.equal(row.closed, true, failure); assert.equal(f.created, 1, 'no implicit reconstruction/default fallback');
  if (f.context) assert.equal(f.context.state, 'closed');
  if (['unsupported', 'ignored', 'switch'].includes(failure)) assert.ok(!f.calls.some(([call]) => call === 'graph'));
}
for (const [trusted, active] of [[false, true], [true, false]]) {
  const f = fixture(); f.env.navigator.userActivation.isActive = active;
  const row = await runAudioSinkAttempt({ isTrusted: trusted }, 'default', f.env);
  assert.equal(row.ok, false); assert.equal(f.created, 0, 'no construction before trusted active gesture');
}
assert.equal(audioSinkReadiness({}).ok, false);
for (const mutate of [
  rows => { rows[1].signalPeak = 0; rows[1].ok = false; },
  rows => { rows[1].maxCallbackGapMs = 150; },
  rows => { rows[1].constructor.endMs += 150; },
  rows => { rows[1].route.sampleRate = 44100; },
  rows => { rows[1].longTasksSupported = false; },
  rows => { rows[1].mode = 'default'; },
]) {
  const rows = structuredClone(good); mutate(rows);
  assert.equal(summarizeAudioSinkExperiment(rows).verdict, 'reject');
}
assert.equal(summarizeAudioSinkExperiment(good.slice(1)).verdict, 'reject');
const warmOnly = structuredClone(good);
for (const row of warmOnly) { row.constructor.endMs = row.constructor.startMs + 1; row.handlerSyncEndMs = row.clickedAtMs + 1; }
assert.equal(summarizeAudioSinkExperiment(warmOnly).verdict, 'inconclusive', 'warm baseline cannot certify cold-stall removal');

const source = readFileSync(new URL('./audio-default-sink.fixture.mjs', import.meta.url), 'utf8');
assert.ok(!/getUserMedia\(|enumerateDevices\(|selectAudioOutput\(|OfflineAudioContext/.test(source));
console.log('audio-default-sink: CPU-only gesture/order/default routing, rejection/cleanup, clock/signal and evidence guards PASS; no browser launched');
