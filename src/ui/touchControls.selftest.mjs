import assert from 'node:assert/strict';
import { createMobileFireGesture, createTouchControls, nextQuickGraphicsPreset } from './touchControls.ts';
import { MOBILE_PRESET_ORDER, PRESETS } from '../engine/quality.ts';

if (nextQuickGraphicsPreset('low') !== 'medium' ||
    nextQuickGraphicsPreset('ultra') !== 'ultralow' ||
    nextQuickGraphicsPreset('ultralow') !== 'low') {
  throw new Error('desktop quick graphics cycle is not closed');
}
if (nextQuickGraphicsPreset('mobile', true) !== 'mobile-high' ||
    nextQuickGraphicsPreset('mobile-high', true) !== 'mobile-ultralow' ||
    nextQuickGraphicsPreset('mobile-ultralow', true) !== 'mobile-low') {
  throw new Error('mobile quick graphics cycle is not closed');
}
for (const name of MOBILE_PRESET_ORDER) {
  const preset = PRESETS[name];
  if (!preset || preset.textureScale !== 0.5 || preset.textureCap !== 2048) {
    throw new Error(`${name} escaped the mobile texture budget`);
  }
}

let clock = 0;
let timerSeq = 0;
const timers = new Map();
const scheduleHold = (fn, ms) => {
  const id = ++timerSeq;
  timers.set(id, { at: clock + ms, fn });
  return id;
};
const cancelHold = (id) => timers.delete(id);
const advance = (ms) => {
  clock += ms;
  for (;;) {
    const due = [...timers.entries()]
      .filter(([, t]) => t.at <= clock)
      .sort((a, b) => a[1].at - b[1].at)[0];
    if (!due) break;
    timers.delete(due[0]);
    due[1].fn();
  }
};

let fired = 0;
let holdStarts = 0;
let holdEnds = 0;
let cancelled = 0;
const aim = [];
const gesture = createMobileFireGesture({
  onAim: (dx, dy) => aim.push([dx, dy]),
  onFire: () => { fired += 1; },
  onHoldStart: () => { holdStarts += 1; },
  onHoldEnd: () => { holdEnds += 1; },
  onCancel: () => { cancelled += 1; },
  isCancelPoint: (x, y) => x >= 200 && y >= 50,
  holdDelayMs: 320,
  scheduleHold,
  cancelHold,
});
if (gesture.end(null, 0, 0) || gesture.cancel()) throw new Error('idle gesture produced a terminal edge');

// Landing wobble is swallowed; an intentional quick drag aims and then fires
// once on release without ever entering held fire.
if (!gesture.begin(7, 100, 100)) throw new Error('first fire pointer did not arm');
advance(100);
gesture.move(7, 105, 103);
if (aim.length || fired || holdStarts) throw new Error('fire deadzone produced input');
if (gesture.begin(8, 0, 0)) throw new Error('second fire pointer stole the gesture');
if (gesture.end(8, 0, 0)) throw new Error('foreign pointer ended the gesture');
gesture.move(7, 122, 108);
if (!gesture.getState().dragging || aim.length !== 1) throw new Error('intentional fire drag did not aim');
gesture.end(7, 130, 110);
advance(500); // released gesture's cancelled timer must stay dead
if (fired !== 1 || holdStarts || gesture.getState().active) throw new Error('quick release contract failed');

// A simple tap remains quick-fire, but still fires on lift rather than down.
gesture.begin(9, 80, 80);
advance(120);
if (fired !== 1) throw new Error('tap fired on pointerdown');
gesture.end(9, 80, 80);
if (fired !== 2) throw new Error('tap did not fire on pointerup');

// Holding crosses into one real held-fire interval. Dragging keeps aiming;
// release ends the hold and must not append a second release shot.
gesture.begin(10, 100, 100);
advance(319);
if (holdStarts) throw new Error('auto fire began before the hold threshold');
advance(1);
if (holdStarts !== 1 || !gesture.getState().autoFiring) throw new Error('hold did not start auto fire');
gesture.move(10, 125, 90);
gesture.end(10, 130, 88);
if (holdEnds !== 1 || fired !== 2 || gesture.getState().autoFiring) {
  throw new Error('release did not stop auto fire cleanly');
}

// Entering the compact cancel target stops an active hold immediately and
// lifting there adds neither a held nor release shot.
gesture.begin(11, 100, 100);
advance(320);
gesture.move(11, 210, 70);
if (!gesture.getState().cancelHot || gesture.getState().autoFiring) {
  throw new Error('cancel target did not stop auto fire');
}
gesture.end(11, 210, 70);
if (holdStarts !== 2 || holdEnds !== 2 || fired !== 2 || cancelled !== 1) {
  throw new Error('cancel target emitted an extra shot');
}

// Platform interruption also releases a live held action with no shot edge.
gesture.begin(12, 100, 100);
advance(320);
gesture.cancel(12);
if (holdStarts !== 3 || holdEnds !== 3 || fired !== 2 || cancelled !== 2) {
  throw new Error('pointer cancellation left auto fire active');
}

// batch 20 (2026-09-14 touch QA): the toolbar's quick buttons must work while the other thumb steers —
// `touch-action: none` (a second finger is not a pinch) and a tap on the button's own captured pointer
// lift, not the synthetic click the browser withholds during multi-touch.
{
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('./touchControls.ts', import.meta.url), 'utf8');
  const quickRule = source.match(/\.cot-touch \.quick\{[^}]*\}/)?.[0] ?? '';
  if (!/touch-action:none/.test(quickRule)) throw new Error('quick buttons must declare touch-action:none');
  for (const button of ['soundButton', 'graphicsButton', "root.querySelector<HTMLButtonElement>('.quick.settings')!"]) {
    if (!source.includes(`tapButton(${button}, `)) throw new Error(`${button} must be wired through tapButton`);
  }
  if (/\.quick\.(sound|graphics|settings)'\)!\.addEventListener\('click'/.test(source)) throw new Error('quick buttons must not rely on click alone');
  if (!/button\.addEventListener\('pointerup', lift\)/.test(source)) throw new Error('tapButton fires on the captured pointer lift');
}

console.log('touchControls hybrid fire and toolbar tap selftest passed');

// (improve-271 plan 024) two thumbs on stand-in DOM: lifting the driving thumb leaves the aiming thumb aiming; a window
// blur with both thumbs down still releases both; the toolbar's graphics chip follows a preset changed elsewhere
{
  const listeners = new Map();
  const on = (owner, type, fn) => {
    if (!listeners.has(owner)) listeners.set(owner, new Map());
    const byType = listeners.get(owner);
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push(fn);
  };
  const fire = (owner, type, event = {}) => {
    for (const fn of listeners.get(owner)?.get(type) ?? []) fn({ preventDefault() {}, stopPropagation() {}, clientX: 0, clientY: 0, ...event });
  };
  /** An element stand-in: what the controls set, read and listen to; one child per selector. */
  const element = (tagName = 'DIV') => {
    const children = new Map();
    const classes = new Set();
    const attributes = new Map();
    const node = {
      tagName, dataset: {}, style: {}, hidden: false, textContent: '', innerHTML: '', className: '', type: '', id: '',
      classList: { toggle: (name, force) => { const next = force ?? !classes.has(name); if (next) classes.add(name); else classes.delete(name); return next; },
        add: (...names) => names.forEach((name) => classes.add(name)), remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name) },
      setAttribute: (name, value) => attributes.set(name, String(value)), getAttribute: (name) => attributes.get(name) ?? null,
      removeAttribute: (name) => attributes.delete(name), toggleAttribute: (name, force) => { if (force ?? !attributes.has(name)) attributes.set(name, ''); else attributes.delete(name); },
      addEventListener: (type, fn) => on(node, type, fn), removeEventListener() {},
      querySelector: (selector) => { if (!children.has(selector)) children.set(selector, element()); return children.get(selector); },
      querySelectorAll: (selector) => [node.querySelector(selector)],
      append() {}, appendChild(child) { return child; }, remove() {}, closest: () => null, contains: () => false, focus() {}, blur() {},
      setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0 }),
      animate: () => ({ cancel() {}, finished: Promise.resolve() }),
    };
    return node;
  };
  const head = element('HEAD'), body = element('BODY');
  const appended = [];
  body.appendChild = (child) => { appended.push(child); return child; };
  const previous = { document: globalThis.document, window: globalThis.window, localStorage: globalThis.localStorage };
  const store = new Map();
  globalThis.localStorage = { getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: (key) => store.delete(key) };
  globalThis.document = { createElement: (tag) => element(String(tag).toUpperCase()), getElementById: () => null, head, body, hidden: false,
    addEventListener: (type, fn) => on(globalThis.document, type, fn), removeEventListener() {}, documentElement: element('HTML') };
  globalThis.window = { addEventListener: (type, fn) => on(globalThis.window, type, fn), removeEventListener() {}, innerWidth: 844, innerHeight: 390,
    localStorage: globalThis.localStorage, location: { search: '' },
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  try {
    const aims = [];
    const moves = [];
    const input = { isTouchLayout: () => true, setVirtualMove: (x, y) => moves.push([x, y]), addVirtualAim: (dx, dy) => aims.push([dx, dy]),
      tapVirtual() {}, pressVirtual() {}, releaseVirtual() {}, setVirtualFire() {}, labelFor: () => '', getBinding: () => null };
    const busHandlers = new Map();
    const bus = { on: (name, fn) => { busHandlers.set(name, [...(busHandlers.get(name) ?? []), fn]); return () => {}; }, emit() {} };
    const controls = createTouchControls({ input, bus, isBattleActive: () => true });
    const joy = controls.root.querySelector('.joy');
    const aimLayer = appended.find((node) => node !== controls.root);
    const aimPad = aimLayer.querySelector('.aimpad');
    assert.ok(listeners.get(aimPad)?.has('pointermove'), 'the aim pad listens for its own pointers');
    fire(joy, 'pointerdown', { pointerId: 1, clientX: 80, clientY: 50 });
    fire(aimPad, 'pointerdown', { pointerId: 2, clientX: 400, clientY: 200 });
    fire(aimPad, 'pointermove', { pointerId: 2, clientX: 410, clientY: 200 });
    assert.equal(aims.length, 1, 'the aiming thumb aims while the driving thumb drives');
    fire(joy, 'pointerup', { pointerId: 1 });
    assert.deepEqual(moves.at(-1), [0, 0], 'lifting the driving thumb stops the drive');
    fire(aimPad, 'pointermove', { pointerId: 2, clientX: 430, clientY: 210 });
    assert.equal(aims.length, 2, 'and the aiming thumb still aims');
    // a window blur with both thumbs down releases both
    fire(joy, 'pointerdown', { pointerId: 3, clientX: 80, clientY: 50 });
    fire(globalThis.window, 'blur');
    fire(aimPad, 'pointermove', { pointerId: 2, clientX: 450, clientY: 210 });
    assert.equal(aims.length, 2, 'a blur releases the aiming thumb too');
    assert.deepEqual(moves.at(-1), [0, 0], 'and the driving thumb');
    // the graphics chip names the preset chosen in Settings at the next layout pass (phase change, resize, rotation)
    const chip = controls.root.querySelector('.quick.graphics').querySelector('.ql');
    const shown = chip.textContent;
    const { setPresetName, setMobilePresetName, getDeviceTier } = await import('../engine/quality.ts');
    const mobile = getDeviceTier() === 'mobile';
    const other = (mobile ? MOBILE_PRESET_ORDER : ['ultralow', 'low', 'medium', 'high', 'ultra'])
      .find((name) => PRESETS[name] && !shown.includes(PRESETS[name].label) && PRESETS[name].label !== 'High');
    if (mobile) setMobilePresetName(other); else setPresetName(other);
    fire(globalThis.window, 'resize');
    assert.notEqual(chip.textContent, shown, `the graphics chip follows the preset changed elsewhere (${shown} -> ${chip.textContent})`);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
}
console.log('touchControls.selftest: two-thumb release, blur release and the graphics chip refresh passed');
