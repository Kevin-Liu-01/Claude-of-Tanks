import assert from 'node:assert/strict';
import { createBattleLoadScreen } from './battleLoad.ts';
import { t } from './i18n.ts';

// Exercise the real screen adapter; geometry reads and layout-style writes
// fail immediately, instead of using a second copy of its progress policy.
const mutations = [];
const elements = [];
const selectors = new Map();
function element(name) {
  const classes = new Set();
  const attributes = new Map();
  let text = '';
  const result = {
    name, id: '', className: '', innerHTML: '', children: [],
    get textContent() { return text; },
    set textContent(value) { mutations.push([name, 'text', value]); text = value; },
    get offsetWidth() { throw new Error('loading progress must not force layout'); },
    getBoundingClientRect() { throw new Error('loading progress must not measure layout'); },
    style: new Proxy({}, { set(target, key, value) {
      assert.notEqual(key, 'width', 'loading fill must not animate layout');
      mutations.push([name, 'style', key, value]); target[key] = value; return true;
    } }),
    setAttribute(key, value) { mutations.push([name, 'attribute', key, value]); attributes.set(key, value); },
    getAttribute(key) { return attributes.get(key); },
    appendChild(child) { this.children.push(child); return child; },
    append(...children) { this.children.push(...children); },
    querySelector(selector) {
      if (!selectors.has(selector)) selectors.set(selector, element(selector));
      return selectors.get(selector);
    },
    classList: {
      add(...values) { values.forEach(value => classes.add(value)); },
      remove(...values) { values.forEach(value => classes.delete(value)); },
      contains(value) { return classes.has(value); },
    },
  };
  elements.push(result);
  return result;
}
const priorDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const priorTimeout = Object.getOwnPropertyDescriptor(globalThis, 'setTimeout');
const timers = [];
Object.defineProperty(globalThis, 'document', { configurable: true, value: {
  head: element('head'), body: element('body'),
  createElement: name => element(name),
  getElementById: id => elements.find(item => item.id === id) ?? null,
} });
Object.defineProperty(globalThis, 'setTimeout', { configurable: true, value: callback => {
  timers.push(callback); return timers.length;
} });
try {
  const screen = createBattleLoadScreen();
  const info = { mapName: 'Verdant', allies: [], enemies: [] };
  screen.show(info);
  const fill = selectors.get('.ffill');
  const pct = selectors.get('.fpct');
  const progress = selectors.get('.fbar');
  const stage = selectors.get('.fstage');
  assert.equal(screen.visible, true);
  assert.equal(screen.covering, true);
  assert.equal(fill.style.transform, 'scaleX(0.000)');
  screen.progress(0.25, 'Building terrain meshes');
  assert.equal(fill.style.transform, 'scaleX(0.250)');
  assert.equal(pct.textContent, '25%');
  assert.equal(progress.getAttribute('aria-valuenow'), '25');
  assert.equal(stage.textContent, t('battleLoad.stage.buildingTerrain'));
  mutations.length = 0;
  for (let index = 0; index < 100; index++) screen.progress(0.25001, 'Building terrain meshes');
  assert.deepEqual(mutations, [], 'identical displayed progress does not churn styles or the live region');
  screen.progress(0.251);
  assert.deepEqual(mutations, [['.ffill', 'style', 'transform', 'scaleX(0.251)']],
    'sub-percent progress moves the fill without repeating percentage announcements');
  assert.equal(stage.textContent, t('battleLoad.stage.buildingTerrain'));
  screen.progress(0.251, 'Custom loading stage');
  assert.equal(stage.textContent, 'Custom loading stage');
  screen.rosters([], []);
  assert.equal(fill.style.transform, 'scaleX(0.251)', 'roster refresh does not reset progress');
  for (const [fraction, scale, percent] of [[-5, '0.000', '0'], [2, '1.000', '100'],
    [NaN, '0.000', '0'], [Infinity, '1.000', '100'], [-Infinity, '0.000', '0']]) {
    screen.progress(fraction);
    assert.equal(fill.style.transform, `scaleX(${scale})`);
    assert.equal(progress.getAttribute('aria-valuenow'), percent);
  }
  screen.progress(1, 'Ready');
  const leaving = screen.hide();
  assert.equal(screen.visible, false);
  assert.equal(screen.covering, true, 'entry remains covered throughout the exit fade');
  screen.show(info);
  timers.shift()();
  await leaving;
  assert.equal(screen.covering, true, 'an old fade cannot uncover a newly restaged load');
  assert.equal(fill.style.transform, 'scaleX(0.000)', 'a new load resets the previous completed fill');
  const hidden = screen.hide();
  timers.shift()();
  await hidden;
  assert.equal(screen.covering, false);

  const css = elements.find(item => item.id === 'cot-bl-style').textContent;
  assert.match(css, /\.cot-bl \.ffill\{[^}]*width:100%;[^}]*transform:scaleX\(0\);[^}]*transform-origin:left center;[^}]*transition:transform/);
  assert.doesNotMatch(css, /transition:width/);
  assert.match(css, /\.cot-bl\.on \.ffill\{will-change:transform;/,
    'compositor hint is limited to the visible loader');
  assert.match(css, /prefers-reduced-motion:reduce[^\n]*\.cot-bl \.ffill\{transition-duration:1ms/);
} finally {
  if (priorDocument) Object.defineProperty(globalThis, 'document', priorDocument);
  else delete globalThis.document;
  if (priorTimeout) Object.defineProperty(globalThis, 'setTimeout', priorTimeout);
  else delete globalThis.setTimeout;
}
console.log('battleLoadProgress.selftest: transform fill, dedup, accessibility, bounds and restaging passed');
