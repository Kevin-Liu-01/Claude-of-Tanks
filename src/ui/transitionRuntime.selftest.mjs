import assert from 'node:assert/strict';
import { createTransition } from './transition.ts';
import { FEATURED_IMAGES } from './featuredShots.ts';
import { preloadImage } from './imagePreload.ts';
import { t } from './i18n.ts';

class ElementFixture {
  constructor() {
    this.style = {};
    this.children = new Map();
    this.classes = new Set();
    this.textContent = '';
    this.classList = {
      add: (...values) => values.forEach(value => this.classes.add(value)),
      remove: (...values) => values.forEach(value => this.classes.delete(value)),
      contains: value => this.classes.has(value),
      toggle: (value, force = !this.classes.has(value)) => { if (force) this.classes.add(value); else this.classes.delete(value); return force; },
    };
  }
  set className(value) { this.classes = new Set(value.split(/\s+/)); }
  querySelector(selector) {
    if (!this.children.has(selector)) this.children.set(selector, new ElementFixture());
    return this.children.get(selector);
  }
  appendChild(child) { return child; }
  setAttribute(name, value) { (this.attributes ??= {})[name] = String(value); }
  getClientRects() { return this.classes.has('on') ? [{}] : []; }
}

const originals = new Map(['window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'scheduler', 'Image']
  .map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const roots = [];
let opaqueObserved = false, atPaint = null, controlledOpacity = null;
const head = new ElementFixture(), body = new ElementFixture();
const documentEvents = new EventTarget();
const visibilityListeners = new Set();
body.appendChild = child => { roots.push(child); return child; };
const globals = {
  window: { location: { search: '' } },
  document: {
    hidden: false, head, body, getElementById: () => null, createElement: () => new ElementFixture(),
    addEventListener(type, callback) {
      assert.equal(type, 'visibilitychange');
      visibilityListeners.add(callback);
      documentEvents.addEventListener(type, callback);
    },
    removeEventListener(type, callback) {
      assert.equal(type, 'visibilitychange');
      visibilityListeners.delete(callback);
      documentEvents.removeEventListener(type, callback);
    },
  },
  getComputedStyle: root => {
    const opacity = controlledOpacity ?? (root.classList.contains('lit') ? 1 : 0);
    const opaque = opacity >= 0.999;
    if (opaque) opaqueObserved = true;
    return { opacity: String(opacity) };
  },
  requestAnimationFrame: callback => setTimeout(() => callback(performance.now()), 0),
  cancelAnimationFrame: handle => clearTimeout(handle),
  scheduler: { yield: () => new Promise(resolve => setTimeout(() => {
    resolve();
    if (opaqueObserved && atPaint) {
      const run = atPaint; atPaint = null;
      // nextPaintFrame resumes, then the cover helper checks ownership and
      // resolves. Supersede in the microtask before run()'s await continuation.
      queueMicrotask(() => queueMicrotask(run));
    }
  }, 0)) },
};
for (const [name, value] of Object.entries(globals)) Object.defineProperty(globalThis, name, { configurable: true, value });
try {
  const transition = createTransition();
  const root = roots.at(-1), say = roots.at(-2);
  assert.equal(transition.holdingSceneForFadeIn, false);
  // the overlay is a picture; a status beside it, in the page while the overlay is off, carries its words
  assert.equal(root.attributes?.['aria-hidden'], 'true', 'the overlay itself is hidden from assistive technology');
  assert.equal(say.attributes?.role, 'status', 'the transition announces through a status');
  assert.notEqual(say, root, 'the status is not inside the overlay a display flip brings in');
  let workCalls = 0;
  atPaint = () => transition.show({ title: 'New owner' });
  await assert.rejects(transition.run(() => { workCalls++; }, { minShowMs: 0 }), { name: 'AbortError' });
  assert.equal(workCalls, 0, 'supersession after cover resolves cannot invoke old work');
  assert.equal(transition.visible, true, 'old failure must not hide the new owner');
  assert.equal(root.querySelector('.title').textContent, 'New owner');
  assert.equal(say.querySelector('.h').textContent, t('transition.sentence', { text: 'New owner' }), 'the status names where the player is going');
  assert.equal(say.querySelector('.s').textContent, root.querySelector('.mstage').textContent, 'the status reads the meter stage');
  await transition.hide();
  assert.equal(say.querySelector('.h').textContent, '', 'a finished transition leaves no words in the status');
  assert.equal(say.querySelector('.s').textContent, '');
  transition.show({ kicker: 'Scene Studio', title: 'Garage', progress: false });
  assert.equal(say.querySelector('.h').textContent, ['Scene Studio', 'Garage'].map((text) => t('transition.sentence', { text })).join(' '),
    'each part is one sentence in the page\'s language');
  assert.equal(say.querySelector('.s').textContent, '', 'a veil without a meter announces no stages');
  await transition.hide();

  opaqueObserved = false;
  const result = await transition.run(progress => {
    workCalls++;
    transition.show({ title: 'Newer owner' });
    progress(0.7, 'Stale work progress');
    return 42;
  }, { minShowMs: 0 });
  assert.equal(result, 42);
  assert.equal(workCalls, 1);
  assert.equal(root.querySelector('.mpct').textContent, '0%', 'old work cannot repaint new progress');
  assert.notEqual(root.querySelector('.mstage').textContent, 'Stale work progress');
  assert.equal(transition.visible, true, 'old completion cannot hide the new transition');
  await transition.hide();

  await assert.rejects(transition.run(() => { throw new Error('restore failed'); }, { minShowMs: 0 }), /restore failed/);
  assert.equal(transition.active, false, 'current-owner work failure releases its veil');

  controlledOpacity = 0;
  const oldFade = transition.run(() => assert.fail('superseded fade cannot start work'),
    { holdSceneDuringFadeIn: true, minShowMs: 0 });
  assert.equal(transition.holdingSceneForFadeIn, true, 'opt-in acquires the fade lease before returning');
  const oldRejected = assert.rejects(oldFade, { name: 'AbortError' });
  const newerFade = transition.run(() => {
    assert.equal(transition.holdingSceneForFadeIn, false, 'release precedes the covered work callback');
  }, { holdSceneDuringFadeIn: true, minShowMs: 0 });
  await oldRejected;
  assert.equal(transition.holdingSceneForFadeIn, true, 'old cleanup cannot release the newer fade lease');
  controlledOpacity = 1;
  await newerFade;
  assert.equal(transition.holdingSceneForFadeIn, false);

  controlledOpacity = 0;
  const interruptedFade = transition.run(() => assert.fail('hidden veil cannot start stale work'),
    { holdSceneDuringFadeIn: true, minShowMs: 0 });
  const interruptedRejected = assert.rejects(interruptedFade, { name: 'AbortError' });
  const hiding = transition.hide();
  assert.equal(transition.holdingSceneForFadeIn, false, 'explicit hide releases immediately, not after fade-out');
  await Promise.all([interruptedRejected, hiding]);

  const ordinary = transition.run(() => {
    assert.equal(transition.holdingSceneForFadeIn, false);
  }, { minShowMs: 0 });
  assert.equal(transition.holdingSceneForFadeIn, false, 'other transition callers keep original scene cadence');
  controlledOpacity = 1;
  await ordinary;

  globals.document.hidden = true;
  await transition.run(() => {
    assert.equal(transition.holdingSceneForFadeIn, false, 'hidden continuation releases before work');
  }, { holdSceneDuringFadeIn: true, minShowMs: 0 });
  globals.document.hidden = false;
  globals.window.location.search = '?notrans';
  let skippedWork = false;
  const skipped = transition.run(() => {
    skippedWork = true;
    assert.equal(transition.holdingSceneForFadeIn, false, 'capture bypass never acquires a scene hold');
  }, { holdSceneDuringFadeIn: true });
  assert.equal(skippedWork, true, 'capture bypass retains synchronous work invocation');
  await skipped;
  globals.window.location.search = '';
  assert.equal(visibilityListeners.size, 0, 'completed and superseded covers release their document listeners');

  // The picture layers cross-fade. The warm picture fades in from the dark on the low layer, the requested one fades in
  // over it on the high layer once it decodes, and a finished transition leaves both out of view for the next screen.
  const pending = new Map();
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {
    set src(url) { pending.set(url, () => this.onload?.()); }
  } });
  const land = async (url) => { pending.get(url)?.(); pending.delete(url); await new Promise((resolve) => setTimeout(resolve, 0)); };
  const warm = preloadImage(FEATURED_IMAGES[0]);
  await land(FEATURED_IMAGES[0]);
  assert.equal(await warm, FEATURED_IMAGES[0]);
  const low = root.querySelector('.bg.lo'), high = root.querySelector('.bg.hi');
  const requested = '/media/selftest/requested-hero.webp';
  transition.show({ hero: requested });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(low.classList.contains('shown') && !high.classList.contains('shown'), 'the warm picture fades in on the low layer');
  assert.match(low.style.backgroundImage, new RegExp(FEATURED_IMAGES[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await land(requested);
  assert.ok(high.classList.contains('shown') && low.classList.contains('shown'), 'the requested picture fades in over the warm one');
  assert.match(high.style.backgroundImage, /requested-hero/);
  await transition.hide();
  assert.ok(!low.classList.contains('shown') && !high.classList.contains('shown'), 'the next screen starts dark');
} finally {
  for (const [name, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name];
  }
}
console.log('transitionRuntime.selftest: actual owner handles cover microtask races, stale progress and failed work; a status announces it; its pictures cross-fade');
