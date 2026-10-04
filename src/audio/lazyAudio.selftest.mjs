import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as lazyModule from './lazyAudio.ts';
import { createAudio } from './audioEngine.ts';
import { createBus } from '../game/stateCore.ts';

const flushMicrotasks = async () => { for (let tick = 0; tick < 8; tick++) await Promise.resolve(); };

class FakeParam {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, at) { this.value = value; this.events.push([value, at]); }
  setTargetAtTime(value, at) { this.setValueAtTime(value, at); }
  linearRampToValueAtTime(value, at) { this.setValueAtTime(value, at); }
  exponentialRampToValueAtTime(value, at) { this.setValueAtTime(value, at); }
  cancelScheduledValues(at) { this.events = this.events.filter(event => event[1] < at); }
}

class FakeNode {
  constructor() {
    this.gain = new FakeParam(1);
    this.frequency = new FakeParam(0);
    this.started = false;
    this.stopped = false;
    this.onended = null;
  }
  connect(destination) { this.destination = destination; }
  disconnect() {}
  start() { this.started = true; }
  stop() { this.stopped = true; }
}

const { createLazyAudio } = lazyModule;
const fakeContext = {
  currentTime: 0,
  destination: new FakeNode(),
  createGain: () => new FakeNode(),
  createOscillator: () => new FakeNode(),
};
// Every sound is a recording (2026-10-03): the facade's oscillator loading tone is gone.
assert.equal('startFallbackLoadingTone' in lazyModule, false, 'the facade exports no synthesized loading tone');

const lazy = createLazyAudio();
await lazy.preload();
assert.equal(lazy.ready, false,
  'preloading transfers/evaluates the full mixer without constructing it before a gesture');

let preparedContexts = 0;
let preparedTransfers = 0;
let preparedMixers = 0;
let preparedResumes = 0;
let adoptedPreparedContext;
const preparedContext = {
  state: 'suspended',
  resume() { preparedResumes++; this.state = 'running'; return Promise.resolve(); },
};
const prepared = createLazyAudio({
  createContext: () => { preparedContexts++; return preparedContext; },
  loadMixer: async () => {
    preparedTransfers++;
    return { createAudio({ context }) {
      preparedMixers++;
      adoptedPreparedContext = context;
      return { resume() {}, bindBus() {}, mute() {}, setMasterVolume() {}, loadingOn() {}, ambientOn() {} };
    } };
  },
});
assert.equal(preparedContexts, 0, 'constructing the facade never opens an audio device');
prepared.prepare(); prepared.prepare();
await Promise.resolve();
assert.equal(preparedContexts, 1, 'repeated Ready gestures share one context');
assert.equal(preparedResumes, 1, 'running context is not resumed again during preparation');
assert.equal(preparedTransfers, 0, 'Ready does not fetch the mixer');
assert.equal(preparedMixers, 0, 'Ready does not synthesize or construct the mixer');
assert.equal(prepared.ready, false);
assert.equal(prepared.loadingActive, false, 'Ready does not play the loading tone');
prepared.resume();
await prepared.preload(); await Promise.resolve();
assert.equal(preparedContexts, 1, 'Battle does not reopen the prepared device');
assert.equal(preparedMixers, 1, 'Battle creates the mixer exactly once');
assert.equal(adoptedPreparedContext, preparedContext, 'Battle adopts the exact prepared context');

let preparationAttempts = 0;
const retryPreparation = createLazyAudio({
  createContext: () => {
    preparationAttempts++;
    if (preparationAttempts === 1) throw new Error('device temporarily unavailable');
    return preparedContext;
  },
  loadMixer: () => { throw new Error('preparation must not transfer the mixer'); },
});
assert.doesNotThrow(() => retryPreparation.prepare(), 'device denial cannot reject Ready');
retryPreparation.prepare();
assert.equal(preparationAttempts, 2, 'failed preparation remains retryable');
const absentAudio = createLazyAudio({ createContext: () => null });
assert.doesNotThrow(() => absentAudio.prepare(), 'missing WebAudio does not block readiness');
assert.equal(absentAudio.loadingActive, false);

let deniedResumeCalls = 0;
const deniedResume = createLazyAudio({
  createContext: () => ({ state: 'suspended', resume: () => {
    deniedResumeCalls++;
    return Promise.reject(new Error('autoplay denied'));
  } }),
});
deniedResume.prepare();
await new Promise((resolve) => setImmediate(resolve));
deniedResume.prepare();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(deniedResumeCalls, 2, 'denied resume is observed and retryable, never unhandled');
let throwingResumeCalls = 0;
const throwingResume = createLazyAudio({ createContext: () => ({
  state: 'suspended', resume() {
    if (++throwingResumeCalls === 1) throw new Error('device interrupted');
    return Promise.resolve();
  },
}) });
assert.doesNotThrow(() => throwingResume.prepare());
throwingResume.prepare();
assert.equal(throwingResumeCalls, 2, 'synchronous resume failure is retryable on the same device');
const pendingResume = createLazyAudio({ createContext: () => ({
  state: 'suspended', resume: () => new Promise(() => {}),
}) });
assert.equal(pendingResume.prepare(), undefined, 'Ready never waits on audio permission');
assert.equal(pendingResume.loadingActive, false);

function loadingAudioHarness(sticky = true) {
  const calls = [];
  const context = {
    ...fakeContext,
    state: 'running',
    createOscillator() { calls.push('oscillator'); return new FakeNode(); },
  };
  const audio = createLazyAudio({
    hasStickyActivation: () => sticky,
    createContext() { calls.push('context'); return context; },
    loadMixer: async () => {
      calls.push('module');
      return { createAudio({ context: adopted }) {
        assert.equal(adopted, context, 'deferred startup still adopts its one real context');
        calls.push('mixer');
        return {
          resume() { calls.push('resume'); }, bindBus() {}, mute() {}, setMasterVolume() {},
          loadingOn(active) { calls.push(`loading:${active}`); }, ambientOn() {},
        };
      } };
    },
  });
  return { audio, calls, context };
}

for (const sticky of [true, false]) {
  const { audio, calls } = loadingAudioHarness(sticky);
  let releasePaint;
  const startup = audio.startLoadingAfterPaint(() => new Promise((resolve) => { releasePaint = resolve; }));
  assert.equal(calls.includes('context'), !sticky,
    'only verified sticky activation defers startup; unknown/legacy policy keeps gesture-time unlock');
  assert.equal(calls.includes('module'), !sticky, 'no modern mixer construction precedes the paint boundary');
  releasePaint(); await startup;
  await audio.preload(); await Promise.resolve();
  assert.equal(calls.filter((call) => call === 'context').length, 1);
  assert.equal(calls.filter((call) => call === 'oscillator').length, 0,
    'the facade synthesizes nothing: the mixer plays the recorded loading bed');
  assert.equal(calls.filter((call) => call === 'mixer').length, 1);
  assert.ok(calls.includes('loading:true'), 'the full mixer inherits loading sound intent');
}

const readyLoading = loadingAudioHarness();
readyLoading.audio.prepare();
await readyLoading.audio.startLoadingAfterPaint(async () => {});
await readyLoading.audio.preload(); await Promise.resolve();
assert.equal(readyLoading.calls.filter((call) => call === 'context').length, 1,
  'an explicit Ready-prepared device is reused rather than reconstructed');

for (const superseded of [false, true]) {
  const { audio, calls } = loadingAudioHarness();
  let releaseOld, releaseNew;
  const old = audio.startLoadingAfterPaint(() => new Promise((resolve) => { releaseOld = resolve; }));
  audio.loadingOn(false);
  const successor = superseded
    ? audio.startLoadingAfterPaint(() => new Promise((resolve) => { releaseNew = resolve; }))
    : null;
  releaseOld(); await old;
  assert.deepEqual(calls, [], 'a cancelled/superseded painted wait creates no device, mixer, or tone');
  if (successor) {
    releaseNew(); await successor;
    await audio.preload(); await Promise.resolve();
    assert.equal(calls.filter((call) => call === 'context').length, 1, 'only the latest loading intent starts audio');
  } else assert.equal(audio.loadingActive, false);
}

const failedPaint = loadingAudioHarness();
await assert.rejects(failedPaint.audio.startLoadingAfterPaint(async () => { throw new Error('cover cancelled'); }),
  /cover cancelled/);
assert.deepEqual(failedPaint.calls, [], 'paint/cover failure is observed before deferred audio side effects');

for (const pendingPermission of [true, false]) {
  const { audio, context } = loadingAudioHarness();
  context.state = 'suspended';
  context.resume = () => pendingPermission
    ? new Promise(() => {}) : Promise.reject(new Error('autoplay denied'));
  await audio.startLoadingAfterPaint(async () => {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(audio.loadingActive, true, 'pending/rejected permission never leaves the loading owner awaiting audio');
}

let deferredCreationAttempts = 0;
const failedDevice = createLazyAudio({
  hasStickyActivation: () => true,
  createContext() {
    if (++deferredCreationAttempts === 1) throw new Error('device unavailable');
    return null;
  },
  loadMixer: async () => null,
});
await assert.rejects(failedDevice.startLoadingAfterPaint(async () => {}), /device unavailable/,
  'device failures reject the awaited owner boundary for its existing visible error recovery');
await failedDevice.startLoadingAfterPaint(async () => {});
assert.ok(deferredCreationAttempts >= 2, 'a failed device remains retryable');

const originalWarn = console.warn;
const mixerWarnings = [];
let mixerAttempts = 0;
const failedMixer = createLazyAudio({
  hasStickyActivation: () => true,
  createContext: () => ({ ...fakeContext, state: 'running' }),
  loadMixer: async () => ({ createAudio() {
    if (++mixerAttempts === 1) throw new Error('mixer construction failed before graph creation');
    return {
      resume() {},
      mute() {}, setMasterVolume() {}, loadingOn() {}, ambientOn() {},
    };
  } }),
});
try {
  console.warn = (...args) => mixerWarnings.push(args);
  await failedMixer.startLoadingAfterPaint(async () => {});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(failedMixer.ready, false, 'failed pre-graph construction cannot publish a ready mixer');
  assert.equal(failedMixer.loadingActive, true, 'loading intent survives failed pre-graph construction');
  assert.ok(mixerWarnings.length > 0, 'fire-and-forget initialization rejection is observed');
  failedMixer.resume();
  await failedMixer.warmBattleEvents();
  assert.equal(failedMixer.ready, true, 'a later explicit startup can retry the same deferred module');
} finally { console.warn = originalWarn; }

const handoffCalls = [];
let graphReady = false;
const handoffContext = { state: 'running' };
let selectedMapId = 'coastal';
let mixerMapReader;
const handoff = createLazyAudio({
  getMapId: () => selectedMapId,
  createContext: () => handoffContext,
  loadMixer: async () => ({
    createAudio({ context, getMapId }) {
      assert.equal(context, handoffContext, 'the mixer adopts the gesture-created context');
      mixerMapReader = getMapId;
      return {
        bindBus() {},
        resume() { graphReady = true; handoffCalls.push('resume'); },
        mute() {
          assert.equal(graphReady, false, 'mute is latched before sources can start');
          handoffCalls.push('mute');
        },
        setMasterVolume() { handoffCalls.push('master'); },
        loadingOn() {},
        ambientOn() {},
        playGarageSting() {},
      };
    },
  }),
});
handoff.resume();
await handoff.preload();
await Promise.resolve();
assert.deepEqual(handoffCalls, ['mute', 'master', 'resume'],
  'the adopted mixer starts its graph with the latest mute and volume already latched');
assert.equal(handoff.ready, true, 'the mixer handoff settles without a partial instance');
assert.equal(mixerMapReader(), 'coastal', 'the lazy handoff retains the active map reader');
selectedMapId = 'whiteout';
assert.equal(mixerMapReader(), 'whiteout', 'map selection is read live, not captured during audio loading');

let finishDeferred;
let initialPhaseSeen;
let ambientSeen;
const delayed = createLazyAudio({
  createContext: () => handoffContext,
  loadMixer: () => new Promise((resolve) => { finishDeferred = resolve; }),
});
const delayedBus = createBus();
delayed.bindBus(delayedBus);
delayed.resume();
delayedBus.emit('phase:change', { phase: 'battle' });
delayed.ambientOn(true);
const deferredModule = {
  createAudio({ initialPhase }) {
    initialPhaseSeen = initialPhase;
    return { bindBus() {}, resume() {}, mute() {}, setMasterVolume() {}, loadingOn() {},
      ambientOn(on) { ambientSeen = on; }, playGarageSting() {} };
  },
};
finishDeferred(deferredModule);
await delayed.preload(); await Promise.resolve();
assert.equal(initialPhaseSeen, 'battle', 'a late-loaded mixer inherits the battle phase it could not hear');
assert.equal(ambientSeen, true, 'the late-loaded mixer restores requested battle ambience');

const abandoned = createLazyAudio({
  createContext: () => handoffContext,
  loadMixer: () => new Promise((resolve) => { finishDeferred = resolve; }),
});
const abandonedBus = createBus(); abandoned.bindBus(abandonedBus); abandoned.resume();
abandonedBus.emit('phase:change', { phase: 'battle' }); abandoned.ambientOn(true);
abandonedBus.emit('phase:change', { phase: 'ended' });
finishDeferred(deferredModule);
await abandoned.preload(); await Promise.resolve();
assert.equal(initialPhaseSeen, 'ended', 'a late mixer inherits the latest destination phase');
assert.equal(ambientSeen, false, 'a battle that ended during transfer cannot resurrect stale ambience');

for (const abandonedDuringPreparation of [false, true]) {
  const calls = [];
  let finishBuffers;
  const pack = { fixture: 'private prepared buffers' };
  const context = { ...fakeContext, state: 'running' };
  const bus = createBus();
  const audio = createLazyAudio({
    createContext() { calls.push('context'); return context; },
    loadMixer: async () => ({
      prepareAudioBuffers(adopted) {
        assert.equal(adopted, context);
        calls.push('prepare');
        return new Promise(resolve => { finishBuffers = resolve; });
      },
      createAudio({ context: adopted, preparedBuffers, initialPhase }) {
        assert.equal(adopted, context); assert.equal(preparedBuffers, pack);
        calls.push(`create:${initialPhase}`);
        return {
          resume() { calls.push('graph'); }, mute() {}, setMasterVolume() {}, bindBus() { calls.push('bind'); },
          loadingOn(active) { calls.push(`loading:${active}`); },
          ambientOn(active) { calls.push(`ambient:${active}`); },
          warmBattleEvents() { calls.push('warm'); },
        };
      },
    }),
  });
  audio.bindBus(bus);
  audio.loadingOn(true); audio.resume();
  const warm = audio.warmBattleEvents();
  await flushMicrotasks();
  assert.deepEqual(calls, ['context', 'prepare'], 'concurrent facade calls join one private preparation');
  assert.equal(audio.ready, false);
  assert.equal(audio.loadingActive, true, 'loading intent stays active during preparation');
  bus.emit('phase:change', { phase: 'battle' }); audio.ambientOn(true);
  if (abandonedDuringPreparation) {
    audio.loadingOn(false);
    bus.emit('phase:change', { phase: 'garage' });
    assert.equal(audio.loadingActive, false);
  }
  finishBuffers(pack); await warm;
  assert.ok(calls.includes(`create:${abandonedDuringPreparation ? 'garage' : 'battle'}`),
    'mixer construction takes the latest phase AFTER its yielding preparation');
  assert.equal(calls.filter(call => call === 'graph').length, 1);
  assert.equal(calls.filter(call => call === 'bind').length, 1);
  assert.ok(calls.includes(`loading:${!abandonedDuringPreparation}`));
  assert.ok(calls.includes(`ambient:${!abandonedDuringPreparation}`));
  assert.equal(audio.loadingActive, !abandonedDuringPreparation,
    'completed shared preparation cannot revive an abandoned cue');
  assert.equal(audio.ready, true);
  await audio.warmBattleEvents();
  assert.equal(calls.filter(call => call === 'prepare').length, 1);
}

{
  let rejectBuffers;
  let prepares = 0, creates = 0, contexts = 0;
  const expected = new Error('private buffer preparation cancelled');
  const warnings = [];
  const previousWarn = console.warn;
  const context = { ...fakeContext, state: 'running' };
  const audio = createLazyAudio({
    createContext() { contexts++; return context; },
    loadMixer: async () => ({
      prepareAudioBuffers() {
        if (++prepares === 1) return new Promise((_resolve, reject) => { rejectBuffers = reject; });
        return Promise.resolve({ fixture: 'fresh complete pack' });
      },
      createAudio() {
        creates++;
        return { resume() {}, mute() {}, setMasterVolume() {}, loadingOn() {}, ambientOn() {}, bindBus() {}, warmBattleEvents() {} };
      },
    }),
  });
  try {
    console.warn = (...args) => warnings.push(args);
    audio.loadingOn(true);
    const rejected = assert.rejects(audio.warmBattleEvents(), error => error === expected);
    await flushMicrotasks();
    rejectBuffers(expected); await rejected; await flushMicrotasks();
    assert.equal(creates, 0, 'rejected preparation never constructs or publishes a graph');
    assert.equal(audio.ready, false); assert.equal(audio.loadingActive, true);
    assert.ok(warnings.length > 0, 'fire-and-forget acquisition observes preparation rejection');
    audio.resume(); await audio.warmBattleEvents();
    assert.deepEqual([prepares, creates, contexts], [2, 1, 1],
      'retry gets fresh private buffers while reusing the original borrowed device');
    assert.equal(audio.ready, true);
} finally { console.warn = previousWarn; }
}

function volumeHarness() {
  const gains = [], oscillators = [], events = [];
  let contexts = 0, transfers = 0, completeMixer;
  const context = {
    ...fakeContext, state: 'running',
    createGain() { const gain = new FakeNode(); gains.push(gain); return gain; },
    createOscillator() { const node = new FakeNode(); oscillators.push(node); return node; },
  };
  const bus = createBus();
  const audio = createLazyAudio({
    createContext() { contexts++; return context; },
    loadMixer() { transfers++; return new Promise(resolve => { completeMixer = resolve; }); },
  });
  audio.bindBus(bus);
  return { audio, bus, context, gains, oscillators, events,
    get contexts() { return contexts; }, get transfers() { return transfers; },
    async finish() {
      completeMixer({ createAudio({ context: adopted, initialPhase }) {
        assert.equal(adopted, context);
        events.push(['phase', initialPhase]);
        return {
          bindBus() {}, mute(value) { events.push(['mute', value]); },
          setMasterVolume(value) { events.push(['master', value]); },
          resume() { events.push(['resume']); },
          loadingOn(value) { events.push(['loading', value]); },
          ambientOn(value) { events.push(['ambient', value]); },
        };
      } });
      await flushMicrotasks();
    },
  };
}

// Read the same persisted master without a graph, then follow live bus intent
// while the mixer is absent. Private/unavailable storage remains optional.
{
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    for (const saved of ['{"volMaster":0}', '{"volMaster":0.25}', 'invalid']) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true,
        value: { getItem: () => saved } });
      const h = volumeHarness();
      h.audio.prepare();
      assert.equal(h.contexts, saved.includes(':0}') ? 0 : 1);
      assert.equal(h.transfers, 0);
      assert.equal(h.gains.length, 0, 'silent preparation has no output graph or sources');
      h.audio.loadingOn(true);
      assert.equal(h.gains.length + h.oscillators.length, 0, 'loading intent builds no sound of its own');
      h.audio.loadingOn(false);
      await h.finish();
      assert.ok(h.events.some(([kind, value]) => kind === 'master'
        && value === (saved.includes(':0}') ? 0 : saved.includes('0.25') ? 0.25 : 0.8)),
        'the adopted mixer starts at the persisted master');
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
}

for (const silence of ['mute', 'master', 'bus']) {
  const h = volumeHarness();
  if (silence === 'mute') h.audio.mute(true);
  else if (silence === 'master') h.audio.setMasterVolume(0);
  else h.bus.emit('ui:volumes', { master: 0 });
  h.audio.prepare();
  assert.equal(h.contexts, 0, `${silence} suppresses optional device preparation`);
  assert.equal(h.transfers, 0);
  h.audio.loadingOn(true);
  assert.equal(h.contexts, 1, 'explicit Battle unlocks its single context even when silenced');
  assert.equal(h.gains.length + h.oscillators.length, 0, 'and starts no sound of its own');
  h.bus.emit('phase:change', { phase: 'battle' });
  h.audio.ambientOn(true);
  h.bus.emit('ui:volumes', { master: 0.35 });
  h.audio.mute(true);
  h.audio.loadingOn(false);
  h.bus.emit('phase:change', { phase: 'garage' });
  await h.finish();
  assert.deepEqual(h.events.slice(0, 4), [['phase', 'garage'], ['mute', true], ['master', 0.35], ['resume']]);
  assert.ok(h.events.some(([kind, value]) => kind === 'loading' && value === false));
  assert.ok(h.events.some(([kind, value]) => kind === 'ambient' && value === false));
  h.audio.mute(false);
  h.audio.setMasterVolume(0);
  assert.deepEqual(h.events.slice(-2), [['mute', false], ['master', 0]], 'live mute and master reach the mixer');
  assert.equal(h.contexts, 1);
}

{
  const h = volumeHarness();
  const oldBus = h.bus, nextBus = createBus();
  h.audio.bindBus(nextBus);
  oldBus.emit('ui:volumes', { master: 0 });
  h.audio.prepare();
  assert.equal(h.contexts, 1, 'rebinding removes the retired bus volume listener');
  nextBus.emit('ui:volumes', { master: 0.2 });
  h.audio.loadingOn(true);
  h.audio.loadingOn(false);
  await h.finish();
  assert.ok(h.events.some(([kind, value]) => kind === 'master' && value === 0.2), 'the live bus level is latched');
  h.audio.setMasterVolume(2);
  h.audio.setMasterVolume(NaN);
  assert.deepEqual(h.events.filter(([kind]) => kind === 'master').slice(-2), [['master', 1], ['master', 1]],
    'levels clamp, and an invalid level cannot reach the mixer as NaN');
}

// Execute the actual full mixer. The destination is inspected at every source
// start, catching a briefly audible graph before a later mute smoothing ramp.
{
  const saved = new Map(['fetch', 'window', 'document', 'setInterval', 'clearInterval']
    .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    // Assets fetch and decode (silent one-second buffers), so recorded cues really start: nothing in the engine
    // is synthesized any more, and only a decoded asset can start a source.
    globalThis.fetch = async () => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(16) });
    globalThis.window = undefined; globalThis.document = undefined;
    globalThis.setInterval = () => 1; globalThis.clearInterval = () => {};
    for (const muteFirst of [false, true]) {
      const nodes = [];
      const context = { currentTime: 0, sampleRate: 1000, state: 'running', destination: {} };
      const makeNode = (kind) => {
        const node = new FakeNode(); node.kind = kind;
        for (const key of ['Q', 'playbackRate', 'pan', 'threshold', 'knee', 'ratio', 'attack', 'release']) node[key] = new FakeParam();
        node.start = () => {
          const master = nodes.find(value => value.destination === context.destination);
          assert.equal(master?.gain.value, 0, 'the first source cannot precede exact-zero master/mute');
          node.started = true;
        };
        nodes.push(node); return node;
      };
      for (const [method, kind] of [['createGain', 'gain'], ['createOscillator', 'oscillator'],
        ['createBufferSource', 'buffer'], ['createBiquadFilter', 'filter'], ['createConvolver', 'convolver'],
        ['createDynamicsCompressor', 'compressor'], ['createWaveShaper', 'shaper'], ['createStereoPanner', 'panner']]) {
        context[method] = () => makeNode(kind);
      }
      context.createBuffer = (channels, length, sampleRate) => {
        const data = Array.from({ length: channels }, () => new Float32Array(length));
        return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate, getChannelData: (c) => data[c] };
      };
      context.decodeAudioData = () => Promise.resolve(context.createBuffer(1, 1000, 1000));
      const mixer = createAudio({ context, tier: 'desktop' });
      if (muteFirst) { mixer.mute(true); mixer.setMasterVolume(0.45); }
      else mixer.setMasterVolume(0);
      assert.equal(nodes.length, 0, 'pre-resume setters only latch, even with an adopted context');
      mixer.resume();
      for (let i = 0; i < 40; i++) await new Promise((resolve) => setImmediate(resolve));
      mixer.loadingOn(true);
      assert.ok(nodes.some(node => node.started), 'negative witness actually exercises source starts (the loading bed)');
      const master = nodes.find(node => node.destination === context.destination);
      assert.equal(master.gain.value, 0);
      if (muteFirst) { mixer.mute(false); assert.equal(master.gain.value, 0.45); }
    }
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const intentSource = await readFile(
  new URL('../game/battleIntentRuntime.ts', import.meta.url), 'utf8',
);
assert.match(mainSource, /import \{ createLazyAudio \} from '\.\/audio\/lazyAudio\.ts';/,
  'the garage boot graph uses the boot-light audio facade');
assert.doesNotMatch(mainSource, /from '\.\/audio\/audio\.js';/,
  'the full mixer is not a static boot dependency');
assert.match(mainSource, /preloadAudio: \(\) => audio\.preload\(\)/,
  'the composition root gives Battle intent the lazy mixer port');
assert.match(mainSource, /getMapId: \(\) => game\.phase === 'battle'\s*\? game\.mapId/,
  'battle ambience uses canonical game map identity instead of an inactive cached world');
assert.match(intentSource, /const preload = \([\s\S]{0,500}ignoreFailure\(preloadAudio\)/,
  'Battle intent transfers the full mixer before the click when possible');
assert.match(mainSource, /const entryReady = boot\.ready\(\(\) => audio\.prepare\(\)\);/,
  'only the accepted boot gate delegates to silent, mute-aware device preparation');

console.log('lazyAudio.selftest: deferred mixer and silent facade passed');
