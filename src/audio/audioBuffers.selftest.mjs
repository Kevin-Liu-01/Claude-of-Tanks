import assert from 'node:assert/strict';
import { mulberry32 } from './audioPolicy.ts';
import { buildAudioBufferSteps, buildAudioBuffers, prepareAudioBuffers } from './audioBuffers.ts';
import { createAudio } from './audio.ts';

// Independent pre-split recipe copied from audio.ts at main c0064aaae.
// Only TypeScript annotations and the return seam were adapted; this oracle
// never calls the new generator. Keep the two implementations independent.
function originalBuffers(ctx) {
  const rng = mulberry32(9001);
  let whiteBuf, windBuf, crackleBuf, gunBufs;
    const sr = ctx.sampleRate;

    // White noise (2 s), seeded.
    whiteBuf = ctx.createBuffer(1, (sr * 2) | 0, sr);
    {
      const d = whiteBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = rng() * 2 - 1;
    }

    // Pink-ish noise for wind (Paul Kellet economy filter over seeded white).
    windBuf = ctx.createBuffer(1, (sr * 4) | 0, sr);
    {
      const d = windBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) {
        const w = rng() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
      }
    }

    // Crackle: sparse decaying impulses (fire crackle, debris patter).
    crackleBuf = ctx.createBuffer(1, (sr * 2) | 0, sr);
    {
      const d = crackleBuf.getChannelData(0);
      for (let e = 0; e < 160; e++) {
        const at = (rng() * d.length) | 0;
        const amp = 0.25 + rng() * 0.75;
        const len = 12 + ((rng() * 80) | 0);
        const sign = rng() < 0.5 ? -1 : 1;
        for (let i = 0; i < len && at + i < d.length; i++) {
          d[at + i] += sign * amp * Math.exp(-i / (len * 0.3)) * (rng() * 2 - 1);
        }
      }
    }

    // Render the layered gun timbres into PCM beds once (SOUND overhaul: four
    // caliber classes, each with a sharper crack, a resonant mid "bark" and a
    // longer sub/rumble tail than the old three-class beds — the live shot
    // still schedules just one source + one distance filter, plus a cheap
    // 2-node crack overlay for nearby shots).
    //   light ≤76 mm | medium ≤105 mm | heavy ≤130 mm | huge >130 mm (152/380)
    const makeGunBed = (kind) => {
      const P = {
        light:  { dur: 0.55, crackT: 0.030, bodyT: 0.10, rumT: 0.20, f0: 62, f1: 46, subT: 0.16, bark: 195, barkT: 0.045, out: 0.78 },
        medium: { dur: 1.00, crackT: 0.040, bodyT: 0.17, rumT: 0.42, f0: 54, f1: 34, subT: 0.32, bark: 150, barkT: 0.060, out: 0.86 },
        heavy:  { dur: 1.70, crackT: 0.055, bodyT: 0.25, rumT: 0.80, f0: 46, f1: 27, subT: 0.50, bark: 120, barkT: 0.080, out: 0.92 },
        huge:   { dur: 2.60, crackT: 0.070, bodyT: 0.34, rumT: 1.25, f0: 40, f1: 22, subT: 0.75, bark: 96,  barkT: 0.110, out: 0.97 },
      }[kind];
      const out = ctx.createBuffer(1, Math.ceil(sr * P.dur), sr);
      const d = out.getChannelData(0);
      const grng = mulberry32(0x6a09e667 ^ (P.bark | 0));
      let low = 0, prevNoise = 0, phaseAcc = 0;
      const barkW1 = Math.PI * 2 * P.bark / sr;
      const barkW2 = Math.PI * 2 * P.bark * 1.53 / sr;
      let bp1 = 0, bp2 = 0;
      for (let i = 0; i < d.length; i++) {
        const t = i / sr;
        const n = grng() * 2 - 1;
        low += (n - low) * (kind === 'huge' ? 0.02 : kind === 'heavy' ? 0.025 : kind === 'medium' ? 0.05 : 0.09);
        const high = n - prevNoise;
        prevNoise = n;
        const sweepT = Math.min(1, t / (P.subT * 0.9));
        phaseAcc += Math.PI * 2 * (P.f0 + (P.f1 - P.f0) * sweepT) / sr;
        bp1 += barkW1; bp2 += barkW2;
        const crack = high * Math.exp(-t / P.crackT);
        const body = n * Math.exp(-t / P.bodyT);
        const rumble = low * Math.exp(-t / P.rumT);
        const sub = Math.sin(phaseAcc) * Math.exp(-t / P.subT);
        // Resonant muzzle "bark": slightly inharmonic damped partial pair —
        // this is the mid-range punch the flat noise beds were missing.
        const bark = (Math.sin(bp1) + 0.45 * Math.sin(bp2)) * Math.exp(-t / P.barkT);
        const attack = Math.min(1, t / 0.003);
        const v = attack * (crack * 0.34 + body * 0.40 + rumble * 0.68 + sub * 0.60 + bark * 0.30);
        d[i] = v;
      }
      // Normalize the bed to a consistent peak so caliber classes mix predictably.
      let peak = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; }
      const k = peak > 0 ? P.out / peak : 1;
      for (let i = 0; i < d.length; i++) d[i] *= k;
      return out;
    };
    gunBufs = {
      light: makeGunBed('light'),
      medium: makeGunBed('medium'),
      heavy: makeGunBed('heavy'),
      huge: makeGunBed('huge'),
    };
  return { context: ctx, sampleRate: ctx.sampleRate, white: whiteBuf, wind: windBuf,
    crackle: crackleBuf, guns: gunBufs, random: rng };
}

class BufferContext {
  constructor(sampleRate, tracked = false) {
    this.sampleRate = sampleRate; this.buffers = []; this.writes = 0;
    this.closed = 0; this.tracked = tracked;
  }
  createBuffer(channels, length, sampleRate) {
    const bytes = new Float32Array(length);
    const data = this.tracked ? new Proxy(bytes, {
      get: (target, key) => Reflect.get(target, key, target),
      set: (target, key, value) => { this.writes++; return Reflect.set(target, key, value); },
    }) : bytes;
    const buffer = { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
      getChannelData: channel => { assert.equal(channel, 0); return data; }, bytes };
    this.buffers.push(buffer);
    return buffer;
  }
  close() { this.closed++; }
}

function assertExactPack(actual, expected) {
  assert.equal(actual.sampleRate, expected.sampleRate);
  assert.deepEqual(Object.keys(actual.guns), ['light', 'medium', 'heavy', 'huge']);
  const buffers = pack => [pack.white, pack.wind, pack.crackle, ...Object.values(pack.guns)];
  const expectedBuffers = buffers(expected);
  buffers(actual).forEach((buffer, index) => {
    const reference = expectedBuffers[index];
    assert.deepEqual([buffer.numberOfChannels, buffer.length, buffer.sampleRate],
      [reference.numberOfChannels, reference.length, reference.sampleRate]);
    assert.equal(Buffer.compare(Buffer.from(buffer.bytes.buffer), Buffer.from(reference.bytes.buffer)), 0,
      `buffer ${index}: every Float32 byte must match the independent original recipe`);
  });
  for (let next = 0; next < 64; next++) assert.equal(actual.random(), expected.random(),
    'subsequent live sound variation resumes the exact original shared RNG stream');
}

for (const sampleRate of [8000, 44100, 48000]) {
  const context = new BufferContext(sampleRate);
  const actual = buildAudioBuffers(context);
  assert.equal(actual.context, context);
  assert.equal(context.buffers.length, 7);
  assertExactPack(actual, originalBuffers(new BufferContext(sampleRate)));
  assert.equal(context.closed, 0);
}

for (const clock of ['stopped', 'backward', 'advancing']) {
  let time = 0;
  const now = () => clock === 'stopped' ? 0 : clock === 'backward' ? --time : ++time;
  const context = new BufferContext(8000, true);
  const steps = buildAudioBufferSteps(context, mulberry32(9001), now);
  assert.deepEqual(steps.next(), { value: undefined, done: false });
  assert.equal(context.buffers.length, 0, 'first private checkpoint precedes all buffer allocation');
  let checkpoints = 1;
  for (;;) {
    const before = context.writes;
    const step = steps.next();
    assert.ok(context.writes - before <= (clock === 'advancing' ? 768 : 16384 + 255),
      `${clock}: bounded sample blocks protect both CPU deadline and nonadvancing clocks`);
    if (step.done) {
      assertExactPack(step.value, originalBuffers(new BufferContext(8000)));
      break;
    }
    checkpoints++;
  }
  assert.ok(checkpoints > 5);
  assert.equal(context.closed, 0);
}

// Close at every private checkpoint; no later next() can allocate or publish.
const countSteps = buildAudioBufferSteps(new BufferContext(1000), mulberry32(9001), () => 0);
let count = 0;
while (!countSteps.next().done) count++;
for (let cancelAt = 0; cancelAt < count; cancelAt++) {
  const context = new BufferContext(1000);
  const steps = buildAudioBufferSteps(context, mulberry32(9001), () => 0);
  for (let index = 0; index <= cancelAt; index++) assert.equal(steps.next().done, false);
  const allocated = context.buffers.length;
  assert.deepEqual(steps.return(undefined), { done: true, value: undefined });
  assert.deepEqual(steps.next(), { done: true, value: undefined });
  assert.equal(context.buffers.length, allocated);
  assert.equal(context.closed, 0, 'cancelling private buffers never closes a borrowed context');
}

{
  const context = new BufferContext(44100);
  let pauses = 0;
  const actual = await prepareAudioBuffers(context, { now: () => 0, yieldWork: async () => { pauses++; } });
  assertExactPack(actual, originalBuffers(new BufferContext(44100)));
  assert.ok(pauses > 10, 'real asynchronous preparation traverses the bounded generator');
}
for (const abortAt of [0, 1, 3]) {
  const context = new BufferContext(8000);
  const controller = new AbortController();
  const expected = new Error(`cancel ${abortAt}`);
  let pauses = 0;
  if (abortAt === 0) controller.abort(expected);
  await assert.rejects(prepareAudioBuffers(context, {
    signal: controller.signal, now: () => 0,
    yieldWork: async () => { if (++pauses === abortAt) controller.abort(expected); },
  }), error => error === expected);
  if (abortAt === 0) assert.equal(context.buffers.length, 0);
  assert.equal(context.closed, 0);
  assertExactPack(await prepareAudioBuffers(context, { now: () => 0, yieldWork: async () => {} }),
    originalBuffers(new BufferContext(8000)));
}
{
  const context = new BufferContext(8000);
  const expected = new Error('owner yield rejected');
  await assert.rejects(prepareAudioBuffers(context, { yieldWork: async () => { throw expected; } }),
    error => error === expected);
  assert.equal(context.buffers.length, 0, 'rejected initial checkpoint has no partial allocation');
}
{
  const context = new BufferContext(8000);
  const allocate = context.createBuffer.bind(context);
  const expected = new Error('native allocation rejected');
  context.createBuffer = (...args) => {
    if (context.buffers.length === 2) throw expected;
    return allocate(...args);
  };
  await assert.rejects(prepareAudioBuffers(context, { now: () => 0, yieldWork: async () => {} }),
    error => error === expected);
  assert.equal(context.buffers.length, 2);
  assert.equal(context.closed, 0);
  context.createBuffer = allocate;
  assertExactPack(await prepareAudioBuffers(context, { now: () => 0, yieldWork: async () => {} }),
    originalBuffers(new BufferContext(8000)));
}

class Param {
  constructor() { this.value = 0; }
  setValueAtTime(value) { this.value = value; }
  setTargetAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}
class MixerContext extends BufferContext {
  constructor(rate) {
    super(rate); this.nodes = []; this.currentTime = 0; this.state = 'running';
    this.destination = {};
  }
  node(kind) {
    const node = { kind, connect() {}, disconnect() {}, start(...args) { this.startArgs = args; }, stop() {} };
    for (const key of ['gain','frequency','Q','playbackRate','pan','threshold','knee','ratio','attack','release']) {
      node[key] = new Param();
    }
    this.nodes.push(node); return node;
  }
  createGain() { return this.node('gain'); }
  createOscillator() { return this.node('oscillator'); }
  createBufferSource() { return this.node('buffer'); }
  createBiquadFilter() { return this.node('filter'); }
  createDynamicsCompressor() { return this.node('compressor'); }
  createWaveShaper() { return this.node('shaper'); }
  createStereoPanner() { return this.node('panner'); }
}
const savedGlobals = new Map(['fetch','setInterval','clearInterval','window','document']
  .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
try {
  globalThis.fetch = () => new Promise(() => {}); // Never perform a network or decode operation.
  globalThis.setInterval = () => 1;
  globalThis.clearInterval = () => {};
  globalThis.window = undefined; globalThis.document = undefined;
  const direct = new MixerContext(8000);
  const prepared = new MixerContext(8000);
  const pack = await prepareAudioBuffers(prepared, { now: () => 0, yieldWork: async () => {} });
  assert.equal(prepared.nodes.length, 0, 'all cooperative work precedes graph/source construction');
  const live = createAudio({ context: prepared, preparedBuffers: pack });
  assert.equal(prepared.nodes.length, 0);
  live.resume();
  const synchronous = createAudio({ context: direct });
  synchronous.resume();
  assert.equal(prepared.buffers.length, 7, 'adoption never synthesizes the prepared samples again');
  assert.equal(direct.buffers.length, 7, 'legacy synchronous resume is still fully initialized on return');
  direct.buffers.forEach((buffer, index) => assert.equal(Buffer.compare(
    Buffer.from(buffer.bytes.buffer), Buffer.from(prepared.buffers[index].bytes.buffer)), 0));
  assert.deepEqual(prepared.nodes.map(node => [node.kind, node.startArgs]),
    direct.nodes.map(node => [node.kind, node.startArgs]),
    'same graph order and first live RNG-derived offsets survive private preparation');
  const nodes = prepared.nodes.length;
  live.resume(); assert.equal(prepared.nodes.length, nodes, 'resuming never rebuilds the graph');
  assert.throws(() => createAudio({ context: direct, preparedBuffers: pack }), /different context/);
  const originalRate = prepared.sampleRate; prepared.sampleRate = 48000;
  assert.throws(() => createAudio({ context: prepared, preparedBuffers: pack }), /sample rate/);
  prepared.sampleRate = originalRate;
  assert.equal(prepared.closed, 0); assert.equal(direct.closed, 0);
} finally {
  for (const [key, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
}

console.log('[audioBuffers] independent exact PCM/RNG, bounded synthesis, cancellation/retry and synchronous adoption passed');
