import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createLazyAudio, startFallbackLoadingTone } from './lazyAudio.js';

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
assert.equal(tone.nodes.length, 2, 'the fallback stays to two inexpensive oscillators');
assert.ok(tone.nodes.every((node) => node.started), 'both fallback voices start immediately');

const lazy = createLazyAudio();
await lazy.preload();
assert.equal(lazy.ready, false,
  'preloading transfers/evaluates the full mixer without constructing it before a gesture');

const mainSource = await readFile(new URL('../main.js', import.meta.url), 'utf8');
assert.match(mainSource, /import \{ createLazyAudio \} from '\.\/audio\/lazyAudio\.js';/,
  'the garage boot graph uses the boot-light audio facade');
assert.doesNotMatch(mainSource, /from '\.\/audio\/audio\.js';/,
  'the full mixer is not a static boot dependency');
assert.match(mainSource, /function preloadBattleIntent[\s\S]*audio\.preload\(\);/,
  'Battle intent transfers the full mixer before the click when possible');

console.log('lazyAudio.selftest: deferred mixer and immediate loading tone passed');
