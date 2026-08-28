import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLazyAudio, startFallbackLoadingTone } from './lazyAudio.ts';

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
const handoff = createLazyAudio({
  createContext: () => handoffContext,
  loadMixer: async () => ({
    createAudio({ context }) {
      assert.equal(context, handoffContext, 'the mixer adopts the gesture-created context');
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
assert.match(intentSource, /const preload = \([\s\S]{0,500}ignoreFailure\(preloadAudio\)/,
  'Battle intent transfers the full mixer before the click when possible');

console.log('lazyAudio.selftest: deferred mixer and immediate loading tone passed');
