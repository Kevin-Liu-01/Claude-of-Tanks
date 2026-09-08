import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLazyAudio, startFallbackLoadingTone } from './lazyAudio.ts';
import { createBus } from '../game/stateCore.ts';

class FakeParam {
  constructor(value = 0) { this.value = value; }
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
  cancelScheduledValues() {}
}

class FakeNode {
  constructor() {
    this.gain = new FakeParam(1);
    this.frequency = new FakeParam(0);
    this.started = false;
    this.stopped = false;
    this.onended = null;
  }
  connect() {}
  disconnect() {}
  start() { this.started = true; }
  stop() { this.stopped = true; }
}

const fakeContext = {
  currentTime: 0,
  destination: new FakeNode(),
  createGain: () => new FakeNode(),
  createOscillator: () => new FakeNode(),
};
const tone = startFallbackLoadingTone(fakeContext);
assert.ok(tone, 'a gesture-unlocked context creates the immediate loading bed');
assert.equal(tone.nodes.length, 3,
  'the fallback stays to three inexpensive oscillators including the entry cue');
assert.ok(tone.nodes.every((node) => node.started), 'both fallback voices start immediately');

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
      return { resume() {}, bindBus() {}, mute() {}, loadingOn() {}, ambientOn() {} };
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
          assert.equal(graphReady, true, 'mute never touches an unbuilt audio graph');
          handoffCalls.push('mute');
        },
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
assert.deepEqual(handoffCalls, ['resume', 'mute'],
  'the adopted mixer constructs its graph before applying persisted state');
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
    return { bindBus() {}, resume() {}, mute() {}, loadingOn() {},
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

console.log('lazyAudio.selftest: deferred mixer and immediate loading tone passed');
