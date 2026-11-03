// 2026-11-02 audit F11 (machine 3): the audio device's lifecycle is watched. A context the browser suspends or
// interrupts under the game (a phone call, a backgrounded tab, WebKit's 'interrupted') is resumed by the next gesture
// anywhere (the first-gesture unlock re-arms after any interruption), and by the page becoming visible again where
// the browser allows it; 'interrupted' is resumed like 'suspended', in the facade and in the mixer. A gesture made while
// the game is muted or at master volume zero keeps the unlock: once heard again, the device resumes (a stopped one at
// once where the browser allows it, else on the next gesture).
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
  const bus = createBus();
  lazy.bindBus(bus);
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

  // a gesture whose resume the browser still refuses (the call holds the device) leaves the unlock armed
  ctx.allowResume = false;
  ctx.set('interrupted');
  doc.dispatch('pointerdown');
  await settle();
  assert.equal(ctx.state, 'interrupted', 'the device is still held');
  assert.equal(doc.count('pointerdown'), 1, 'so the next gesture tries again');
  ctx.allowResume = true;
  doc.dispatch('pointerdown');
  await settle();
  assert.equal(ctx.state, 'running', 'and resumes it once the call has ended');

  // muted, a gesture leaves the device alone but keeps the unlock: the gesture after the game is heard again resumes it
  lazy.mute(true);
  ctx.set('interrupted');
  const muted = ctx.resumes;
  doc.dispatch('pointerdown');
  await settle();
  assert.equal(ctx.resumes, muted, 'a muted game does not wake the device');
  assert.equal(doc.count('pointerdown'), 1, 'and a muted gesture does not use up the unlock');
  ctx.allowResume = false; // unmuted outside a gesture (a settings load), or the call still holds the device
  lazy.mute(false);
  await settle();
  assert.ok(ctx.resumes > muted, 'unmuting tries the stopped device at once');
  assert.equal(ctx.state, 'interrupted', 'which the browser refuses here');
  assert.equal(doc.count('pointerdown'), 1, 'so the unlock stays armed');
  ctx.allowResume = true;
  doc.dispatch('pointerdown');
  await settle();
  assert.equal(ctx.state, 'running', 'the next tap after unmuting resumes the device');

  // the unmute press itself (the battle's sound toggle): its own pointerdown is seen while still muted, its handler unmutes
  lazy.mute(true);
  ctx.set('suspended');
  doc.dispatch('pointerdown');
  assert.equal(ctx.state, 'suspended');
  lazy.mute(false);
  await settle();
  assert.equal(ctx.state, 'running', 'the unmute press wakes the device stopped while muted');

  // the same at master volume zero, raised by the settings call or by the bus's level
  for (const raise of ['setter', 'bus']) {
    lazy.setMasterVolume(0);
    ctx.set('suspended');
    const silent = ctx.resumes;
    doc.dispatch('keydown');
    await settle();
    assert.equal(ctx.resumes, silent, `${raise}: a silent game does not wake the device`);
    assert.equal(doc.count('keydown'), 1, `${raise}: and keeps the unlock`);
    ctx.allowResume = false;
    if (raise === 'setter') lazy.setMasterVolume(0.6);
    else bus.emit('ui:volumes', { master: 0.6 });
    await settle();
    assert.equal(doc.count('keydown'), 1, `${raise}: a refused resume leaves the unlock armed`);
    ctx.allowResume = true;
    doc.dispatch('keydown');
    await settle();
    assert.equal(ctx.state, 'running', `${raise}: the next key press after the level rises resumes the device`);
  }

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

  // a cold boot at master volume zero (a stored level): no device opens, and the unlock waits for the level to rise
  const doc2 = fakeDocument();
  globalThis.document = doc2;
  let coldContexts = 0;
  const cold = createLazyAudio({
    hasStickyActivation: () => false,
    createContext: () => { coldContexts++; return device(); },
    loadMixer: async () => ({ createAudio: () => ({ bindBus() {}, resume() {}, mute() {}, setMasterVolume() {}, loadingOn() {}, ambientOn() {}, update() {} }) }),
  });
  cold.setMasterVolume(0);
  cold.bindBus(createBus());
  doc2.dispatch('pointerdown');
  await settle();
  assert.equal(coldContexts, 0, 'a silent game opens no device on its first gesture');
  assert.equal(doc2.count('pointerdown'), 1, 'and keeps the first-gesture unlock');
  cold.setMasterVolume(0.5);
  assert.equal(coldContexts, 0, 'raising the level opens no device outside a gesture');
  doc2.dispatch('pointerdown');
  await settle();
  assert.equal(coldContexts, 1, 'the first gesture after the level rises opens the device');
} finally {
  if (savedDocument) Object.defineProperty(globalThis, 'document', savedDocument);
  else delete globalThis.document;
}

console.log('audioDevice.selftest: the device lifecycle (interruptions re-arm the gesture unlock, visibility retries, interrupted resumes) passed');
