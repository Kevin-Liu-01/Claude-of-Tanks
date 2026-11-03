// 2026-11-02 audit F11 (machine 3): the audio device's lifecycle is watched. A context the browser suspends or
// interrupts under the game (a phone call, a backgrounded tab, WebKit's 'interrupted') is resumed by the next gesture
// anywhere (the first-gesture unlock re-arms after any interruption), and by the page becoming visible again where
// the browser allows it; 'interrupted' is resumed like 'suspended', in the facade and in the mixer.
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { createFakeContext } from './fakeAudioContext.test-support.mjs';
import { settle } from './engineHarness.test-support.mjs';

function fakeDocument() {
  const listeners = new Map();
  return {
    visibilityState: 'visible',
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type) { for (const fn of [...(listeners.get(type) ?? [])]) fn({ type }); },
    count(type) { return listeners.get(type)?.size ?? 0; },
  };
}

/** A device the browser can stop under us: its state changes raise 'statechange'. */
function device() {
  const listeners = new Set();
  return {
    state: 'running',
    resumes: 0,
    allowResume: true,
    currentTime: 0,
    resume() {
      this.resumes++;
      if (!this.allowResume) return Promise.reject(new Error('resume needs a gesture'));
      this.set('running');
      return Promise.resolve();
    },
    addEventListener(type, fn) { if (type === 'statechange') listeners.add(fn); },
    removeEventListener(type, fn) { listeners.delete(fn); },
    set(state) { if (this.state === state) return; this.state = state; for (const fn of [...listeners]) fn({ type: 'statechange' }); },
  };
}

const savedDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const doc = fakeDocument();
globalThis.document = doc;
try {
  const { createLazyAudio } = await import('./lazyAudio.ts');
  const ctx = device();
  let contexts = 0;
  let mixerResumes = 0;
  const lazy = createLazyAudio({
    hasStickyActivation: () => false, // an engine without the activation API: the unlock runs inside the gesture
    createContext: () => { contexts++; return ctx; },
    loadMixer: async () => ({ createAudio: () => ({ bindBus() {}, resume() { mixerResumes++; }, mute() {}, setMasterVolume() {}, loadingOn() {}, ambientOn() {}, update() {} }) }),
  });
  lazy.bindBus(createBus());
  assert.equal(doc.count('pointerdown'), 1, 'the first-gesture unlock is armed');
  doc.dispatch('pointerdown');
  await settle();
  assert.equal(contexts, 1, 'the first gesture opens the device');
  assert.equal(doc.count('pointerdown'), 0, 'and the unlock steps aside while the device runs');

  // a phone call: WebKit interrupts the running context
  ctx.set('interrupted');
  assert.equal(doc.count('pointerdown'), 1, 'an interruption re-arms the gesture unlock');
  const before = ctx.resumes;
  doc.dispatch('pointerdown');
  await settle();
  assert.equal(ctx.resumes, before + 1, 'the next gesture resumes the interrupted device');
  assert.equal(ctx.state, 'running');
  assert.equal(doc.count('pointerdown'), 0, 'and the unlock steps aside again');
  assert.equal(contexts, 1, 'the same device, never a second one');
  assert.ok(mixerResumes >= 1, 'the mixer resumes with it');

  // a backgrounded tab: suspended while hidden; on its return the page tries at once, and a refusal leaves the gesture
  doc.visibilityState = 'hidden';
  ctx.allowResume = false;
  ctx.set('suspended');
  assert.equal(doc.count('pointerdown'), 1, 'a suspension re-arms it too');
  doc.visibilityState = 'visible';
  const hidden = ctx.resumes;
  doc.dispatch('visibilitychange');
  await settle();
  assert.ok(ctx.resumes > hidden, 'the page becoming visible tries to resume');
  assert.equal(ctx.state, 'suspended', 'which this browser refuses without a gesture');
  assert.equal(doc.count('pointerdown'), 1, 'so the gesture unlock stays armed');
  ctx.allowResume = true;
  doc.dispatch('keydown');
  await settle();
  assert.equal(ctx.state, 'running', 'the next key press resumes it');
  assert.equal(doc.count('keydown'), 0);

  // muted, the unlock steps aside without resuming (as the first gesture always has)
  lazy.mute(true);
  ctx.set('suspended');
  const muted = ctx.resumes;
  doc.dispatch('pointerdown');
  await settle();
  assert.equal(ctx.resumes, muted, 'a muted game does not wake the device');
  lazy.mute(false);

  // a direct resume (the battle's rollout, a round load) also wakes an interrupted device
  ctx.set('interrupted');
  const direct = ctx.resumes;
  lazy.resume();
  assert.equal(ctx.resumes, direct + 1, 'the facade resumes an interrupted device, not only a suspended one');

  // the mixer's own resume treats 'interrupted' as 'suspended'
  const { createAudio } = await import('./audioEngine.ts');
  const engineCtx = createFakeContext();
  engineCtx.state = 'interrupted';
  let engineResumes = 0;
  engineCtx.resume = function () { engineResumes++; this.state = 'running'; return Promise.resolve(); };
  globalThis.window = {};
  const engine = createAudio({ context: engineCtx, tier: 'desktop' });
  engine.resume();
  assert.equal(engineResumes, 1, 'the mixer resumes an interrupted context');
} finally {
  if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
  else delete globalThis.document;
}

console.log('audioDevice.selftest: the device lifecycle (interruptions re-arm the gesture unlock, visibility retries, interrupted resumes) passed');
