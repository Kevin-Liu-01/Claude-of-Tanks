import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createAudio } from './audio.ts';
import { createBus } from '../game/stateCore.ts';
import { AMBIENT_BUDGET, AMBIENT_PROFILES } from './ambientPolicy.ts';

// CPU-only reference renderer for the exact small WebAudio subset exercised
// by ambience. It records the REAL mixer graph, seeded buffers, automation,
// source lifetimes and connections; no second copy of the synthesis recipe.
// This is a deterministic PCM regression, not a native-browser conformance or
// subjective listening test. We tap before the safety compressor/limiter, so
// clipping cannot be hidden by either processor or by the master volume.
class Param {
  constructor(context, value = 0) { this.context = context; this.initial = value; this.events = []; this.inputs = []; }
  set value(value) { this.setValueAtTime(value, this.context.currentTime); }
  get value() { return this.at(this.context.currentTime); }
  setValueAtTime(value, time) { this.events.push({ kind: 'set', value, time }); }
  setTargetAtTime(value, time, constant) { this.events.push({ kind: 'target', value, time, constant }); }
  linearRampToValueAtTime(value, time) { this.events.push({ kind: 'linear', value, time }); }
  exponentialRampToValueAtTime(value, time) { this.events.push({ kind: 'exponential', value, time }); }
  cancelScheduledValues(time) { this.events = this.events.filter((event) => event.time < time); }
  at(time) {
    let value = this.initial, anchor = 0, target = null;
    const evolve = (at) => target ? target.value + (value - target.value) * Math.exp(-(at - anchor) / target.constant) : value;
    for (const event of this.events) {
      if (time < event.time) {
        if (event.kind === 'linear' || event.kind === 'exponential') {
          const ratio = Math.max(0, (time - anchor) / Math.max(1e-9, event.time - anchor));
          return event.kind === 'linear' ? value + (event.value - value) * ratio
            : value * Math.pow(event.value / Math.max(1e-12, value), ratio);
        }
        return evolve(time);
      }
      value = evolve(event.time);
      anchor = event.time;
      if (event.kind === 'target') target = event;
      else { value = event.value; target = null; }
    }
    return evolve(time);
  }
}
class Node {
  constructor(context, kind) {
    this.context = context; this.kind = kind; this.inputs = []; this.edges = [];
    this.startAt = Infinity; this.stopAt = Infinity; this.offset = 0; this.ended = false;
    for (const key of ['gain', 'frequency', 'Q', 'playbackRate', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) {
      this[key] = new Param(context, key === 'gain' || key === 'playbackRate' ? 1 : 0);
    }
  }
  connect(destination) {
    const edge = { source: this, from: this.context.currentTime, until: Infinity };
    this.edges.push(edge); destination.inputs.push(edge);
  }
  disconnect() { for (const edge of this.edges) edge.until = Math.min(edge.until, this.context.currentTime); }
  start(time = this.context.currentTime, offset = 0) { this.startAt = time; this.offset = offset; }
  stop(time = this.context.currentTime) { this.stopAt = Math.min(this.stopAt, time); }
}
class Context {
  constructor() {
    this.currentTime = 0; this.sampleRate = 24000; this.state = 'running'; this.nodes = [];
    this.destination = this.node('destination');
  }
  node(kind) { const node = new Node(this, kind); this.nodes.push(node); return node; }
  createGain() { return this.node('gain'); }
  createOscillator() { return this.node('oscillator'); }
  createBufferSource() { return this.node('buffer'); }
  createBiquadFilter() { return this.node('filter'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createWaveShaper() { return this.node('shaper'); }
  createStereoPanner() { return this.node('panner'); }
  createBuffer(channels, length, sampleRate) {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (channel) => data[channel], duration: length / sampleRate, sampleRate };
  }
  async decodeAudioData() { return this.createBuffer(1, 1, this.sampleRate); }
  advance(time) {
    for (const node of this.nodes) if (!node.ended && node.stopAt <= time) {
      this.currentTime = node.stopAt; node.ended = true; node.onended?.();
    }
    this.currentTime = time;
  }
}

function render(context, output, seconds) {
  const sr = context.sampleRate, totalLength = Math.round(seconds * sr);
  // One-second scratch blocks keep the audit independent of phrase count:
  // only the final stereo PCM spans the full scenario. Source/filter history
  // crosses blocks without retaining every node's thirty-second output.
  let offset = 0, length = Math.min(sr, totalLength);
  const nodeCache = new Map(), paramCache = new Map();
  const sourcePhases = new Map(), filterStates = new Map();
  function inputSum(inputs, channel) {
    const values = new Float32Array(length);
    for (const edge of inputs) {
      const begin = Math.max(0, Math.ceil(edge.from * sr) - offset);
      const end = Math.min(length, Math.ceil(edge.until * sr) - offset);
      if (begin >= end) continue;
      const source = nodeValues(edge.source, channel);
      for (let i = begin; i < end; i++) values[i] += source[i];
    }
    return values;
  }
  function paramValues(param) {
    if (paramCache.has(param)) return paramCache.get(param);
    const values = inputSum(param.inputs, 0);
    for (let i = 0; i < length; i++) values[i] += param.at((offset + i) / sr);
    paramCache.set(param, values);
    return values;
  }
  function nodeValues(node, channel) {
    let cached = nodeCache.get(node);
    if (cached?.[channel]) return cached[channel];
    if (!cached) { cached = []; nodeCache.set(node, cached); }
    const values = inputSum(node.inputs, channel);
    cached[channel] = values;
    if (node.kind === 'buffer' || node.kind === 'oscillator') {
      const begin = Math.max(0, Math.ceil(node.startAt * sr) - offset);
      const end = Math.min(length, Math.ceil(node.stopAt * sr) - offset);
      const frequency = paramValues(node.kind === 'buffer' ? node.playbackRate : node.frequency);
      const phases = sourcePhases.get(node) ?? [];
      let phase = phases[channel] ?? node.offset * (node.buffer?.sampleRate ?? sr);
      const data = node.buffer?.getChannelData(0);
      for (let i = begin; i < end; i++) {
        if (data) {
          const index = Math.floor(phase), fraction = phase - index;
          if (node.loop || index < data.length) values[i] = data[index % data.length] * (1 - fraction)
            + data[(index + 1) % data.length] * fraction;
          phase += frequency[i] * node.buffer.sampleRate / sr;
        } else {
          const sine = Math.sin(phase);
          assert.ok(node.type === 'sine' || node.type === 'triangle', `unsupported ambient waveform ${node.type}`);
          values[i] = node.type === 'triangle' ? 2 / Math.PI * Math.asin(sine) : sine;
          phase += Math.PI * 2 * frequency[i] / sr;
        }
      }
      phases[channel] = phase; sourcePhases.set(node, phases);
    } else if (node.kind === 'gain' || node.kind === 'panner') {
      const parameter = paramValues(node.kind === 'gain' ? node.gain : node.pan);
      for (let i = 0; i < length; i++) values[i] *= node.kind === 'gain' ? parameter[i]
        : channel === 0 ? Math.cos((parameter[i] + 1) * Math.PI / 4) : Math.sin((parameter[i] + 1) * Math.PI / 4);
    } else if (node.kind === 'filter') {
      assert.ok(node.type === 'lowpass' || node.type === 'bandpass', `unsupported ambient filter ${node.type}`);
      const frequency = paramValues(node.frequency), q = paramValues(node.Q);
      const states = filterStates.get(node) ?? [];
      let [x1, x2, y1, y2] = states[channel] ?? [0, 0, 0, 0];
      for (let i = 0; i < length; i++) {
        const omega = Math.PI * 2 * Math.min(sr * 0.49, Math.max(1, frequency[i])) / sr;
        const cosine = Math.cos(omega), sine = Math.sin(omega);
        // WebAudio lowpass Q is a dB resonance; bandpass Q is linear.
        const alpha = sine / (2 * (node.type === 'lowpass' ? Math.pow(10, q[i] / 20) : Math.max(0.001, q[i])));
        const a0 = 1 + alpha, a1 = -2 * cosine / a0, a2 = (1 - alpha) / a0;
        const b0 = (node.type === 'lowpass' ? (1 - cosine) / 2 : alpha) / a0;
        const b1 = node.type === 'lowpass' ? (1 - cosine) / a0 : 0;
        const b2 = node.type === 'lowpass' ? b0 : -b0;
        const x = values[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        values[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
      }
      states[channel] = [x1, x2, y1, y2]; filterStates.set(node, states);
    } else throw new Error(`offline ambient tap unexpectedly reaches ${node.kind}`);
    return values;
  }
  const pcm = [new Float32Array(totalLength), new Float32Array(totalLength)];
  for (offset = 0; offset < totalLength; offset += sr) {
    length = Math.min(sr, totalLength - offset);
    nodeCache.clear(); paramCache.clear();
    pcm[0].set(nodeValues(output, 0), offset);
    pcm[1].set(nodeValues(output, 1), offset);
  }
  return pcm;
}

function measure(channels, sampleRate, beginS = 0, endS = channels[0].length / sampleRate) {
  let peak = 0, square = 0, differenceSquare = 0, count = 0;
  const start = Math.round(beginS * sampleRate), end = Math.round(endS * sampleRate);
  for (const samples of channels) for (let i = start; i < end; i++) {
    assert.ok(Number.isFinite(samples[i]), 'PCM samples remain finite');
    peak = Math.max(peak, Math.abs(samples[i])); square += samples[i] ** 2;
    if (i > start) differenceSquare += (samples[i] - samples[i - 1]) ** 2;
    count++;
  }
  return { peak, rms: Math.sqrt(square / count), brightness: Math.sqrt(differenceSquare / Math.max(1e-15, square)) };
}

// Calibrate the reference kernel itself before using it as an oracle.
{
  const context = new Context();
  const ramp = new Param(context, 0);
  ramp.setValueAtTime(1, 1); ramp.linearRampToValueAtTime(3, 3);
  assert.equal(ramp.at(0.5), 0); assert.equal(ramp.at(2), 2);
  const target = new Param(context, 1);
  target.setTargetAtTime(0, 0, 1);
  assert.ok(Math.abs(target.at(1) - Math.exp(-1)) < 1e-12);
  const oscillator = context.createOscillator(); oscillator.type = 'sine';
  oscillator.frequency.value = 1000; oscillator.start(0); oscillator.stop(0.05);
  const pan = context.createStereoPanner(); pan.pan.value = -1; oscillator.connect(pan);
  const left = render(context, pan, 0.1), repeat = render(context, pan, 0.1);
  assert.deepEqual(left, repeat, 'identical captured graphs render identical PCM bytes');
  assert.ok(Math.abs(measure([left[0]], context.sampleRate, 0, 0.05).rms - Math.SQRT1_2) < 1e-5,
    'reference sine rendering retains unity RMS calibration');
  assert.equal(measure([left[1]], context.sampleRate).peak, 0, 'equal-power hard-left pan silences the right channel');
  assert.equal(measure(left, context.sampleRate, 0.06).peak, 0, 'source stops are sample-accurate in the reference renderer');
}

const previous = Object.fromEntries(['window', 'fetch', 'setInterval', 'clearInterval'].map((key) => [key, globalThis[key]]));
const representatives = { field: 'verdant', forest: 'orchard', coastal: 'saltwind', wetland: 'mangrove',
  desert: 'oasis', alpine: 'alpine', polar: 'whiteout', industrial: 'copper_mesa' };
const receipts = [];
try {
  globalThis.fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  for (const [biome, mapId] of Object.entries(representatives)) {
    globalThis.window = {};
    const intervals = new Map(); let nextTimer = 0;
    globalThis.setInterval = (callback, ms) => { const id = ++nextTimer; intervals.set(id, { callback, ms }); return id; };
    globalThis.clearInterval = (id) => intervals.delete(id);
    const context = new Context(), bus = createBus();
    const mixer = createAudio({ context, getMapId: () => mapId, initialPhase: 'battle' });
    mixer.bindBus(bus); mixer.resume();
    const beforeWind = context.nodes.length;
    mixer.ambientOn(true);
    const wind = context.nodes.slice(beforeWind);
    assert.equal(wind.length, AMBIENT_BUDGET.loopNodes);
    const ambientBus = context.nodes.find((node) => node.inputs.some((edge) => edge.source === wind[2]));
    const tick = [...intervals.values()][0];
    assert.equal(tick.ms, 700);
    for (let index = 1; index <= 42; index++) { context.advance(index * 0.7); tick.callback(); }
    const cues = window.__COT_AUDIO.soundLog.filter(({ type }) => type === 'ambient:cue');
    assert.equal(cues.length > 0, biome !== 'polar', `${biome}: intended call population occurs deterministically`);
    context.advance(30);
    bus.emit('phase:change', { phase: 'ended' });
    assert.equal(intervals.size, 0, `${biome}: phase teardown owns and clears its only timer`);
    context.advance(31);
    assert.ok(wind.every((node) => node.edges.every((edge) => edge.until <= 30.16)),
      `${biome}: teardown disconnects the complete real wind graph`);
    const pcm = render(context, ambientBus, 31);
    const signal = measure(pcm, context.sampleRate, 0, 30);
    const windOnly = measure(pcm, context.sampleRate, 0.8, 1.5);
    assert.ok(signal.peak < 0.5, `${biome}: pre-limiter ambient PCM keeps at least 6 dBFS headroom`);
    assert.ok(signal.rms > 0.004, `${biome}: palette is audible rather than a silent profile`);
    assert.ok(measure(pcm, context.sampleRate, 30.3).peak < 1e-8, `${biome}: phase teardown leaves no PCM tail`);
    const hash = createHash('sha256').update(new Uint8Array(pcm[0].buffer)).digest('hex');
    receipts.push({ biome, cues: cues.length, peak: signal.peak, rms: signal.rms,
      windRms: windOnly.rms, brightness: windOnly.brightness, hash });
    assert.equal(window.__COT_AUDIO.ambientState().cueActive, false);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  }
} finally {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
  }
}
assert.equal(new Set(receipts.map(({ hash }) => hash)).size, 8, 'all eight real synthesized PCM streams differ');
for (let a = 0; a < receipts.length; a++) for (let b = a + 1; b < receipts.length; b++) {
  const left = receipts[a], right = receipts[b];
  const distance = Math.hypot(Math.log(left.windRms / right.windRms), Math.log(left.brightness / right.brightness));
  assert.ok(distance > 0.035, `${left.biome}/${right.biome}: palettes differ in measurable wind tone/level, not just cue labels`);
}
assert.equal(Object.keys(AMBIENT_PROFILES).length, receipts.length, 'every ambient palette receives a PCM audit');
console.log('ambientPcm.selftest: CPU-only real-graph PCM, eight distinct palettes, headroom and silent phase teardown passed');
console.table(receipts.map(({ biome, cues, peak, rms, windRms, brightness, hash }) => ({ biome, cues,
  peak: +peak.toFixed(5), rms: +rms.toFixed(5), windRms: +windRms.toFixed(5), brightness: +brightness.toFixed(5), hash: hash.slice(0, 12) })));
