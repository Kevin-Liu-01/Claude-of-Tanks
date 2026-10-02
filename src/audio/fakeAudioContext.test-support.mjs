// Minimal Web Audio stand-in for node selftests: records graph edges, source
// starts/stops and parameter automation; the clock advances only when told.

export class FakeParam {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, at) { this.value = value; this.events.push(['set', value, at]); return this; }
  setTargetAtTime(value, at, tau) { this.value = value; this.events.push(['target', value, at, tau]); return this; }
  linearRampToValueAtTime(value, at) { this.value = value; this.events.push(['linear', value, at]); return this; }
  exponentialRampToValueAtTime(value, at) { this.value = value; this.events.push(['exp', value, at]); return this; }
  cancelScheduledValues(at) { this.events.push(['cancel', at]); return this; }
}

export class FakeNode {
  constructor(context, kind) {
    this.context = context;
    this.kind = kind;
    this.outputs = [];
    for (const key of ['gain', 'frequency', 'Q', 'pan', 'playbackRate', 'threshold', 'knee', 'ratio', 'attack', 'release', 'detune']) this[key] = new FakeParam(key === 'gain' || key === 'playbackRate' ? 1 : 0);
    this.started = null;
    this.stopped = null;
    this.onended = null;
    this.loop = false;
    this.buffer = null;
  }
  connect(destination) { this.outputs.push(destination); return destination; }
  disconnect() { this.outputs = []; }
  start(at = 0, offset = 0) { this.started = { at, offset }; this.context.started.push(this); }
  stop(at = 0) { this.stopped = at; }
}

export function fakeBuffer(duration = 1, sampleRate = 48000, channels = 1) {
  const length = Math.max(1, Math.round(duration * sampleRate));
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { duration, length, sampleRate, numberOfChannels: channels, getChannelData: (c) => data[c] };
}

export function createFakeContext({ sampleRate = 48000, decode = () => fakeBuffer(1, sampleRate) } = {}) {
  const context = {
    currentTime: 0,
    sampleRate,
    state: 'running',
    started: [],
    nodes: [],
    resume() { this.state = 'running'; return Promise.resolve(); },
    decodeAudioData(bytes) { return Promise.resolve(decode(bytes)); },
    createBuffer: (channels, length, rate) => fakeBuffer(length / rate, rate, channels),
    advance(seconds) { this.currentTime += seconds; },
  };
  context.destination = new FakeNode(context, 'destination');
  for (const [method, kind] of [
    ['createGain', 'gain'], ['createBiquadFilter', 'filter'], ['createStereoPanner', 'panner'],
    ['createBufferSource', 'source'], ['createOscillator', 'oscillator'], ['createWaveShaper', 'shaper'],
    ['createDynamicsCompressor', 'compressor'], ['createConvolver', 'convolver'], ['createScriptProcessor', 'script'],
  ]) {
    context[method] = () => {
      const node = new FakeNode(context, kind);
      context.nodes.push(node);
      return node;
    };
  }
  return context;
}
