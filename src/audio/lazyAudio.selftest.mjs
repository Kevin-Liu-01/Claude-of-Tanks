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
