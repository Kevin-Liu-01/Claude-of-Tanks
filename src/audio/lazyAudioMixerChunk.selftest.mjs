// lazyAudioMixerChunk.selftest.mjs — the audio mixer's chunk follows the one lazy-chunk policy (2026-11-02 audit R6,
// round 3 X8). Copyright © 2026 Kevin B. Liu.
//
// The boot-light facade (lazyAudio.ts) loads the full mixer (audioEngine.ts) at the first sound intent: the first gesture
// (the unlock calls resume, then disarms), a press on the battle canvas (pointerLockFeedbackRuntime.ts audioResume, the
// per-press asker this drives through resume()), the loading bed, the Garage sting, a battle's warm, the boot idle's
// preload. Its memo (modulePromise) was cleared on a failure, and the creation's memo over it (realPromise) with it, so
// after one failed transfer every later intent asked the chunk again at once: a request per press, offline too, and a
// removed deployment's 404 never terminal. Now the chunk is an app/lazyChunk.ts chunk: asked again at once after one
// failure, then past the backoff (2, 4, 8 ... s), never offline; and the mixer is made once it arrives. This drives the
// facade's own default loader (`import('./audioEngine.ts')`); a chunk "fails" the way a browser's import does when the
// network drops: its resolve throws, and the module that does arrive is a stand-in mixer.
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let clock = 1000;
performance.now = () => clock; // the lazy chunk's default clock
let onLine = true;
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => onLine, configurable: true });

const MIXER = './audioEngine.ts';
let networkUp = false;
let asks = 0;
const STUB = `data:text/javascript,${encodeURIComponent(`export function createAudio() {
  globalThis.__cotMixers = (globalThis.__cotMixers ?? 0) + 1;
  return { bindBus() {}, mute() {}, setMasterVolume() {}, resume() {}, loadingOn() {}, ambientOn() {}, playGarageSting() {},
    update() {}, warmBattleEvents() {} };
}`)}`;
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === MIXER && (context.parentURL ?? '').endsWith('/src/audio/lazyAudio.ts')) {
      asks += 1;
      if (!networkUp) throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
      return { url: STUB, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const settle = async () => { for (let i = 0; i < 10; i++) await new Promise((resolve) => setImmediate(resolve)); };
const warnings = [];
const warn = console.warn;
console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
try {
  const { createLazyAudio } = await import('./lazyAudio.ts');
  const audio = createLazyAudio({ createContext: () => null });
  /** A press anywhere: the facade's unlock resumes the device and asks for the mixer. */
  const press = async (times = 1) => { for (let i = 0; i < times; i++) { audio.resume(); await settle(); } };

  // the first intent's transfer fails, and the next asks again at once
  await press();
  assert.equal(asks, 1);
  await press();
  assert.equal(asks, 2, 'asked again at once after one failure');
  assert.equal(audio.ready, false);

  // 1. thirty presses inside the backoff: no ask (and no warning: nothing was asked)
  await press(30);
  assert.equal(asks, 2, `thirty presses after a failed mixer transfer ask nothing inside the backoff (${asks} asks: the `
    + 'memo cleared on failure was asked again by every press)');
  assert.equal(warnings.filter((line) => line.includes('deferred mixer load failed')).length, 2, 'one warning per failed ask');

  // 2. offline: no intent asks, however long since the last failure
  onLine = false;
  clock += 60_000;
  await press(10);
  audio.playGarageSting();
  audio.loadingOn(true);
  await audio.warmBattleEvents();
  await audio.preload();
  await settle();
  assert.equal(asks, 2, `no ask while the browser is offline (${asks} asks)`);
  audio.loadingOn(false);

  // 3. back online past the backoff: the next press asks, the mixer arrives and is made once, and nothing asks again
  onLine = true;
  networkUp = true;
  await press();
  assert.equal(asks, 3, 'online and past the backoff: asked again');
  assert.equal(audio.ready, true, 'the mixer is made from the chunk that arrived');
  assert.equal(globalThis.__cotMixers, 1);
  await press(5);
  await audio.warmBattleEvents();
  assert.equal(asks, 3, 'a loaded mixer is never asked again');
  assert.equal(globalThis.__cotMixers, 1, 'and made once');
} finally {
  console.warn = warn;
  hook.deregister();
}
console.log('lazyAudioMixerChunk.selftest: OK (the audio mixer is asked again under the lazy-chunk policy, never per press)');
