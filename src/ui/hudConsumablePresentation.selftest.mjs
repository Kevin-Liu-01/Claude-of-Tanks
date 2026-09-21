import assert from 'node:assert/strict';
import { createRetainedConsumableSlot } from './hudConsumablePresentation.ts';

const mutations = [];
const labelCalls = { ready: 0, cooling: 0 };

function element(name) {
  let textContent = '';
  const attributes = new Map();
  const classes = new Set();
  const styles = {};
  const style = new Proxy({
    setProperty(key, value) {
      mutations.push([name, 'style', key, value]);
      styles[key] = value;
    },
  }, {
    set(target, key, value) {
      mutations.push([name, 'style', key, value]);
      styles[key] = value;
      return true;
    },
    get(target, key) { return key in target ? target[key] : styles[key]; },
  });
  return {
    get textContent() { return textContent; },
    set textContent(value) { mutations.push([name, 'text', value]); textContent = value; },
    style,
    attributes,
    classes,
    classList: {
      toggle(key, on) {
        mutations.push([name, 'class', key, on]);
        if (on) classes.add(key);
        else classes.delete(key);
      },
    },
    setAttribute(key, value) {
      mutations.push([name, 'attribute', key, value]);
      attributes.set(key, value);
    },
  };
}

let locale = 'en';
function fixture(index) {
  const elements = {
    button: element(`${index}.button`),
    count: element(`${index}.count`),
    cooldown: element(`${index}.cooldown`),
  };
  const slot = createRetainedConsumableSlot({
    elements,
    locale: () => locale,
    readyMark: '∞',
    readyLabel() { labelCalls.ready++; return `${locale}: ready`; },
    coolingLabel(seconds) { labelCalls.cooling++; return `${locale}: ready in ${seconds}s`; },
  });
  return { slot, elements };
}

const fixtures = Array.from({ length: 3 }, (_, index) => fixture(index));
const COOLDOWN_S = [35, 45, 25];

// The tray renders every presented frame; a battle that never fires a
// consumable must not touch the DOM at all after the first settling frame.
function frameAll(remainingList) {
  fixtures.forEach(({ slot }, index) => slot.render(remainingList[index], COOLDOWN_S[index]));
}

frameAll([0, 0, 0]);
for (const { elements } of fixtures) {
  assert.equal(elements.cooldown.style.display, 'none');
  assert.equal(elements.button.classes.has('cooling'), false);
  assert.equal(elements.count.textContent, '∞');
  assert.equal(elements.button.attributes.get('aria-label'), 'en: ready');
}
mutations.length = 0;
labelCalls.ready = labelCalls.cooling = 0;
for (let frame = 0; frame < 600; frame++) frameAll([0, 0, 0]);
assert.deepEqual(mutations, [], 'idle frames perform no consumable DOM writes');
assert.deepEqual([labelCalls.ready, labelCalls.cooling], [0, 0],
  'idle frames never re-translate the accessible label');

// Firing a kit sweeps exactly one slot; the neighbours stay untouched.
fixtures[1].slot.render(45, COOLDOWN_S[1]);
assert.equal(fixtures[1].elements.cooldown.style.display, 'block');
assert.equal(fixtures[1].elements.cooldown.style['--cool'], '100.0%');
assert.equal(fixtures[1].elements.count.textContent, '45');
assert.equal(fixtures[1].elements.button.classes.has('cooling'), true);
assert.equal(fixtures[1].elements.button.attributes.get('aria-label'), 'en: ready in 45s');
assert.equal(fixtures[0].elements.button.classes.has('cooling'), false);
mutations.length = 0;
fixtures[1].slot.render(45 - 1 / 60, COOLDOWN_S[1]);
assert.deepEqual(mutations, [], 'a sub-visual cooldown step rewrites nothing');

// The sweep advances only when its rendered precision changes.
fixtures[1].slot.render(44, COOLDOWN_S[1]);
assert.deepEqual(mutations, [
  ['1.cooldown', 'style', '--cool', '97.8%'],
  ['1.count', 'text', '44'],
  ['1.button', 'attribute', 'aria-label', 'en: ready in 44s'],
], 'a visible second rewrites the sweep, the count and its accessible label');
mutations.length = 0;
fixtures[1].slot.render(43.999, COOLDOWN_S[1]);
assert.deepEqual(mutations, [], 'the frame between two whole seconds stays quiet');

// A slot returns to ready exactly once, even though the frame loop keeps
// calling it every frame afterwards.
fixtures[1].slot.render(0.4, COOLDOWN_S[1]);
mutations.length = 0;
fixtures[1].slot.render(0, COOLDOWN_S[1]);
assert.deepEqual(mutations, [
  ['1.cooldown', 'style', 'display', 'none'],
  ['1.button', 'class', 'cooling', false],
  ['1.count', 'text', '∞'],
  ['1.button', 'attribute', 'aria-label', 'en: ready'],
], 'the ready transition is written once');
mutations.length = 0;
for (let frame = 0; frame < 120; frame++) fixtures[1].slot.render(0, COOLDOWN_S[1]);
assert.deepEqual(mutations, [], 'settling after a cooldown stays quiet');

// Localization is a live input: the ready tray must re-announce on a switch
// even when no numeric state moved.
locale = 'zh-CN';
mutations.length = 0;
frameAll([0, 0, 0]);
assert.deepEqual(mutations.map(row => row.slice(0, 2)), [
  ['0.button', 'attribute'], ['1.button', 'attribute'], ['2.button', 'attribute'],
], 'a locale change refreshes only the accessible labels');
for (const { elements } of fixtures) {
  assert.equal(elements.button.attributes.get('aria-label'), 'zh-CN: ready');
}
mutations.length = 0;
frameAll([0, 0, 0]);
assert.deepEqual(mutations, [], 'the re-announced locale settles without repeating');

// Degenerate rulesets (consumables disabled report a zero-length cooldown)
// stay clamped instead of leaking Infinity into the custom property.
fixtures[2].slot.render(5, 0);
assert.equal(fixtures[2].elements.cooldown.style['--cool'], '100.0%');
fixtures[2].slot.render(-1, COOLDOWN_S[2]);
assert.equal(fixtures[2].elements.cooldown.style.display, 'none');
assert.equal(fixtures[2].elements.count.textContent, '∞');

console.log('ok hudConsumablePresentation — retained tray writes nothing while idle');
