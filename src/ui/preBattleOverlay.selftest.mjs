import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPreBattleOverlay } from './preBattleOverlay.ts';
import { t } from './i18n.ts';

const hudSource = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
const animations = Object.fromEntries(['tick', 'tick-alt'].map(className => {
  const declaration = hudSource.match(new RegExp(`\\.cot-prebattle \\.n\\.${className}\\{animation:([^}]+);\\}`));
  assert.ok(declaration, `${className}: actual HUD animation rule exists`);
  const [name, ...timing] = declaration[1].split(' ');
  assert.equal(timing.join(' '), 'var(--cot-motion-slow) var(--cot-ease-out)',
    'both animations retain shared duration/easing, including reduced-motion overrides');
  return [className, name];
}));
assert.notEqual(animations.tick, animations['tick-alt']);
const keyframes = Object.values(animations).map(name =>
  hudSource.match(new RegExp(`@keyframes ${name}\\{(from\\{[^}]+\\}to\\{[^}]+\\})\\}`))?.[1]);
assert.deepEqual(keyframes, Array(2).fill('from{transform:scale(1.28);opacity:.4;}to{transform:scale(1);opacity:1;}'),
  'alternate names preserve the exact original transform/opacity motion');

function element() {
  const classes = new Set();
  let text = '';
  const result = { mutations: 0, reads: 0,
    get textContent() { return text; },
    set textContent(value) { this.mutations++; text = value; },
    classList: { add: (...items) => { result.mutations++; items.forEach(item => classes.add(item)); },
      remove: (...items) => { result.mutations++; items.forEach(item => classes.delete(item)); },
      contains: item => classes.has(item),
      toggle: (item, on) => { result.mutations++; return on ? classes.add(item) : classes.delete(item); } } };
  for (const key of ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight']) {
    Object.defineProperty(result, key, { get() { result.reads++; assert.fail(`unexpected layout read: ${key}`); } });
  }
  result.getBoundingClientRect = () => assert.fail('unexpected geometry read');
  return result;
}
const root = element(), kicker = element(), numeral = element();
const overlay = createPreBattleOverlay(root, kicker, numeral);
const mutations = () => [root, kicker, numeral].map(item => item.mutations);
const animationName = () => {
  const active = Object.keys(animations).filter(name => numeral.classList.contains(name));
  assert.equal(active.length, 1, 'exactly one animation name is active');
  return animations[active[0]];
};
const priorGlobals = new Map(['setTimeout', 'clearTimeout', 'getComputedStyle'].map(key =>
  [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const timers = new Map();
let timerSerial = 0;
const fakeGlobals = {
  setTimeout(callback, delay) { timers.set(++timerSerial, { callback, delay }); return timerSerial; },
  clearTimeout(id) { timers.delete(id); },
  getComputedStyle() { assert.fail('countdown must not force a computed-style read'); },
};
try {
for (const [key, value] of Object.entries(fakeGlobals)) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
overlay.setWaiting(true);
const waitingMutations = mutations();
for (const seconds of [5, 5, 0, 4]) overlay.countdown(seconds);
overlay.setWaiting(true);
assert.deepEqual(mutations(), waitingMutations, 'waiting snapshots and repeated waiting state do not mutate DOM');
assert.equal(kicker.textContent, t('hud.waitingForCommanders'));
assert.equal(numeral.textContent, t('playMenu.ready.iAmReady'), 'loading snapshots cannot pretend the clock is running');
assert.equal(root.classList.contains('on'), true);
assert.equal(root.classList.contains('rollout'), false);
overlay.setWaiting(false);
overlay.countdown(5);
let previousAnimation = animationName();
const sameSecondMutations = mutations();
for (const seconds of [5, 4.8, 4.2]) overlay.countdown(seconds);
assert.equal(numeral.textContent, '5');
assert.deepEqual(mutations(), sameSecondMutations, 'same-second frames perform no DOM mutation');
assert.equal(animationName(), previousAnimation);
for (const seconds of [4, 3, 2, 1, 0]) {
  overlay.countdown(seconds);
  assert.equal(numeral.textContent, seconds ? String(seconds) : t('hud.rollout'));
  const nextAnimation = animationName();
  assert.notEqual(nextAnimation, previousAnimation, 'each numeral and GO edge selects a changed animation name');
  previousAnimation = nextAnimation;
}
assert.equal(numeral.textContent, t('hud.rollout'));
assert.equal(numeral.classList.contains('go'), true);
assert.deepEqual([...timers.values()].map(timer => timer.delay), [1100], 'only the existing rollout hide timer is scheduled');
const goMutations = mutations();
overlay.countdown(0);
overlay.countdown(-1);
assert.deepEqual(mutations(), goMutations, 'repeated GO does not mutate or restart its timer');
assert.equal(timerSerial, 1);
overlay.setWaiting(true);
assert.equal(timers.size, 0, 'waiting cancels a pending rollout hide');
assert.equal(root.classList.contains('rollout'), false);
assert.equal(numeral.classList.contains('tick'), false);
assert.equal(numeral.classList.contains('tick-alt'), false);
overlay.reset();
assert.equal(root.classList.contains('on'), false, 'Garage teardown clears waiting and timer');
assert.equal(root.classList.contains('waiting'), false);
overlay.countdown(2);
assert.equal(numeral.textContent, '2', 'late joins retain authority time');
assert.notEqual(animationName(), previousAnimation, 'a new countdown restarts across waiting/reset without a layout flush');
previousAnimation = animationName();
const validMutations = mutations();
overlay.countdown(NaN);
overlay.countdown(Infinity);
assert.equal(numeral.textContent, '2');
assert.deepEqual(mutations(), validMutations, 'nonfinite authority time cannot mutate presentation');
overlay.reset();
overlay.countdown(5);
assert.notEqual(animationName(), previousAnimation, 'same-frame rematch still changes the animation name');
assert.equal(kicker.textContent, t('hud.battleBeginsIn'), 'solo/rematch does not inherit waiting');
assert.equal(numeral.textContent, '5');
overlay.countdown(0);
const [timerId, timer] = [...timers][0];
timers.delete(timerId);
timer.callback();
assert.equal(root.classList.contains('on'), false, 'the unchanged hide deadline fades the rollout overlay');
overlay.countdown(5);
assert.equal(root.classList.contains('on'), true, 'a later countdown can show after rollout hide');
overlay.countdown(0);
overlay.reset();
assert.equal(timers.size, 0, 'teardown cancels the outstanding hide timer');
for (const name of ['on', 'waiting', 'rollout']) assert.equal(root.classList.contains(name), false);
for (const name of ['tick', 'tick-alt', 'go']) assert.equal(numeral.classList.contains(name), false);
assert.equal(numeral.textContent, '');
assert.equal([root, kicker, numeral].reduce((sum, item) => sum + item.reads, 0), 0);
} finally {
  overlay.reset();
  for (const [key, descriptor] of priorGlobals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else delete globalThis[key];
  }
}
console.log('preBattleOverlay.selftest: layout-free alternating motion, no-op frames, waiting, countdown, rematch and teardown passed');
