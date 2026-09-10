import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRetainedAmmunitionSlot } from './hudAmmunitionPresentation.ts';
import { ammunitionSelectionLabel, ammunitionSlotViewState } from './hud.ts';
import { shellTypeLabel } from './garageDossier.ts';
import { getLocale, setLocale } from './i18n.ts';

const mutations = [];
const colors = { APFSDS: '#aabbcc', HE: '#ddeeff' };
const underlines = { APFSDS: 'silver', HE: 'olive' };

function element(name) {
  let textContent = '', tabIndex = 0;
  const attributes = new Map();
  const classes = new Set();
  const styles = {};
  const style = new Proxy({
    setProperty(key, value) {
      mutations.push([name, 'style', key, value]);
      styles[key] = value;
    },
  }, {
    set(_target, key, value) {
      mutations.push([name, 'style', key, value]);
      styles[key] = value;
      return true;
    },
    get(target, key) { return key in target ? target[key] : styles[key]; },
  });
  return {
    get textContent() { return textContent; },
    set textContent(value) { mutations.push([name, 'text', value]); textContent = value; },
    get tabIndex() { return tabIndex; },
    set tabIndex(value) { mutations.push([name, 'tabIndex', value]); tabIndex = value; },
    style,
    styles,
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
    removeAttribute(key) {
      mutations.push([name, 'removeAttribute', key]);
      attributes.delete(key);
    },
  };
}

function fixture(index) {
  const elements = Object.fromEntries([
    'button', 'type', 'underline', 'name', 'penetration', 'damage', 'count', 'cooldown',
  ].map(key => [key, element(`${index}.${key}`)]));
  const icons = [];
  const localizationCalls = { type: 0, selection: 0 };
  const slot = createRetainedAmmunitionSlot({
    index,
    elements,
    locale: getLocale,
    drawIcon(type) { icons.push(type); mutations.push([index, 'icon', type]); },
    typeLabel(type) { localizationCalls.type++; return shellTypeLabel(type); },
    count: shell => ammunitionSlotViewState(shell).count,
    selectionLabel(...args) { localizationCalls.selection++; return ammunitionSelectionLabel(...args); },
    typeColors: colors,
    underlineColors: underlines,
  });
  return { slot, elements, icons, localizationCalls };
}

const fixtures = Array.from({ length: 3 }, (_, index) => fixture(index));
const cards = [
  { type: 'APFSDS', name: 'Sabot', penLabel: 500, dmg: 390, count: 4 },
  { type: 'ATGM', name: 'Missile', penLabel: 700, dmg: 600, count: 3 },
  { type: 'HE', name: 'High explosive', penLabel: '90 mm', dmg: 500, count: 2 },
];

function render(selected = 0, pending = false, touch = false, open = false, heights = ['0', '0', '0']) {
  let rank = 0;
  fixtures.forEach(({ slot }, index) => {
    slot.render(cards[index], selected === index, pending);
    slot.layout(touch, open, slot.selected ? 0 : ++rank);
    slot.setCooldown(heights[index]);
  });
}

function assertCard(index, selected, pending = false) {
  const { elements, slot } = fixtures[index];
  const card = cards[index];
  const type = card.type || '';
  const view = ammunitionSlotViewState(card, selected);
  assert.equal(elements.type.textContent, shellTypeLabel(type));
  assert.equal(elements.type.style.color, colors[type] || '#9fb0bf');
  assert.equal(elements.underline.style.background, underlines[type] || 'rgba(146,164,180,.4)');
  assert.equal(elements.name.textContent, card.name || '—');
  assert.equal(elements.penetration.textContent, card.penLabel == null ? '—' : String(card.penLabel));
  assert.equal(elements.damage.textContent, card.dmg == null ? '—' : String(card.dmg));
  assert.equal(elements.count.textContent, String(view.count));
  assert.equal(slot.selected, selected);
  assert.equal(elements.button.classes.has('sel'), selected);
  assert.equal(elements.button.classes.has('empty'), view.empty);
  assert.equal(elements.button.attributes.get('aria-pressed'), selected ? 'true' : 'false');
  assert.equal(elements.button.attributes.get('aria-busy'), pending && selected ? 'true' : 'false');
  assert.equal(elements.button.attributes.get('aria-label'), ammunitionSelectionLabel(
    card.name || card.type || `slot ${index + 1}`, view.count, selected, pending,
  ));
}

render();
fixtures.forEach((_, index) => assertCard(index, index === 0));
mutations.length = 0;
for (let frame = 0; frame < 600; frame++) render();
assert.deepEqual(mutations, [], 'unchanged frames perform no ammunition DOM or icon writes');

cards[0].count = 3;
render();
assertCard(0, true);
assert.deepEqual(mutations.map(row => row.slice(0, 2)), [
  ['0.count', 'text'], ['0.button', 'attribute'],
], 'in-place count mutation updates only the count and accessible label');
assert.deepEqual(fixtures[0].icons, ['APFSDS']);

cards[0].count = 0;
render();
assertCard(0, true);
assert.equal(fixtures[0].elements.button.classes.has('empty'), true,
  'depleted selected normal ammo remains selected and empty while other ammo is stocked');
render(1, true, false, false, ['0', '100%', '0']);
fixtures.forEach((_, index) => assertCard(index, index === 1, true));
assert.equal(fixtures[1].elements.cooldown.style.height, '100%');
mutations.length = 0;
render(1, true, false, false, ['0', '100%', '0']);
assert.deepEqual(mutations, [], 'a pending ATGM confirmation does not rewrite identical state');

render(1, false, false, false, ['0', '99.9%', '0']);
assertCard(1, true, false);
assert.equal(fixtures[1].elements.cooldown.style.height, '99.9%');
mutations.length = 0;
render(1, false, false, false, ['0', '99.8%', '0']);
assert.deepEqual(mutations, [['1.cooldown', 'style', 'height', '99.8%']],
  'reload sweep alone updates only its changed active-slot height');
render(2);
assert.equal(fixtures[1].elements.cooldown.style.height, '0',
  'selection/completion clears the former slot cooldown');
assertCard(2, true);

// Immediate input highlights can be denied or replaced by a later snapshot.
fixtures[1].slot.select(true);
fixtures[2].slot.select(false);
render(2);
assertCard(1, false);
assertCard(2, true);
assert.equal(fixtures[2].elements.button.attributes.get('aria-pressed'), 'true',
  'same-value authoritative render repairs optimistic class changes');

render(1, false, true, false);
assert.equal(fixtures[1].elements.button.tabIndex, 0);
assert.equal(fixtures[1].elements.button.attributes.get('aria-expanded'), 'false');
assert.equal(fixtures[0].elements.button.tabIndex, -1);
assert.equal(fixtures[0].elements.button.attributes.get('aria-hidden'), 'true');
assert.equal(fixtures[0].elements.button.style['--touch-ammo-x'], '-56px');
assert.equal(fixtures[2].elements.button.style['--touch-ammo-x'], '-112px');
render(1, false, true, true);
for (const { elements } of fixtures) {
  assert.equal(elements.button.tabIndex, 0);
  assert.equal(elements.button.attributes.has('aria-hidden'), false);
}
assert.equal(fixtures[1].elements.button.attributes.get('aria-expanded'), 'true');
render(2, false, true, false);
assert.equal(fixtures[1].elements.button.attributes.has('aria-expanded'), false);
assert.equal(fixtures[2].elements.button.attributes.get('aria-expanded'), 'false');
assert.equal(fixtures[2].elements.button.style['--touch-ammo-x'], '0px');
render(2, false, false, false);
for (const { elements } of fixtures) {
  assert.equal(elements.button.tabIndex, 0);
  assert.equal(elements.button.attributes.has('aria-expanded'), false);
  assert.equal(elements.button.attributes.has('aria-hidden'), false);
}
mutations.length = 0;
render(2);
assert.deepEqual(mutations, [], 'desktop recovery settles without repeated layout/ARIA writes');

// Same objects can be repurposed by frozen captures, spectator views or a new tank.
Object.assign(cards[1], { type: 'HE', name: 'Replacement shell', dmg: 0, penLabel: 0, count: -2 });
render(1);
assertCard(1, true);
assert.deepEqual(fixtures[1].icons, ['ATGM', 'HE']);
delete cards[1].name;
delete cards[1].penLabel;
delete cards[1].dmg;
delete cards[1].count;
render(1);
assertCard(1, true);
assert.equal(fixtures[1].elements.count.textContent, '12', 'missing counts retain canonical type fallback');
cards[1].count = Number.NaN;
render(1);
assertCard(1, true);
mutations.length = 0;
render(1);
assert.deepEqual(mutations, [], 'non-finite raw values do not defeat the primitive retention guard');
cards[1] = { type: 'custom', count: 1.9 };
render(1);
assertCard(1, true);
assert.equal(fixtures[1].elements.count.textContent, '1');
cards[1] = {};
render(-1);
fixtures.forEach((_, index) => assertCard(index, false));

// Public locale changes invalidate translated presentation without changing
// simulation/card values or repainting language-independent geometry/colors.
const originalLocale = getLocale();
try {
  setLocale('en-US');
  const localized = fixture(3);
  const card = { type: 'ATGM', name: 'Missile', dmg: 600, penLabel: 700, count: 0 };
  localized.slot.render(card, true, true);
  const englishType = localized.elements.type.textContent;
  const englishAria = localized.elements.button.attributes.get('aria-label');
  mutations.length = 0;
  setLocale('zh-CN');
  localized.slot.render(card, true, true);
  assert.equal(localized.elements.type.textContent, shellTypeLabel('ATGM'));
  assert.equal(localized.elements.button.attributes.get('aria-label'),
    ammunitionSelectionLabel('Missile', 0, true, true));
  assert.notEqual(localized.elements.type.textContent, englishType);
  assert.notEqual(localized.elements.button.attributes.get('aria-label'), englishAria);
  assert.deepEqual(localized.icons, ['ATGM'], 'locale-only changes do not redraw ammunition icons');
  assert.deepEqual(mutations.map(row => row.slice(0, 3)), [
    ['3.type', 'text', shellTypeLabel('ATGM')], ['3.button', 'attribute', 'aria-label'],
  ], 'locale-only changes write only translated labels and accessibility text');
  mutations.length = 0;
  const beforeStableLocale = { ...localized.localizationCalls };
  for (let frame = 0; frame < 600; frame++) localized.slot.render(card, true, true);
  assert.deepEqual(mutations, [], 'unchanged localized frames retain the no-write fast path');
  assert.deepEqual(localized.localizationCalls, beforeStableLocale,
    'unchanged localized frames do not re-run label translation');
  setLocale('en-US');
  localized.slot.render(card, true, true);
  assert.equal(localized.elements.type.textContent, englishType);
  assert.equal(localized.elements.button.attributes.get('aria-label'), englishAria);
  assert.deepEqual(localized.icons, ['ATGM']);
} finally {
  setLocale(originalLocale);
}

const hudSource = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
const selectorFunctions = hudSource.slice(hudSource.indexOf('  // ---------- shell selector ----------'),
  hudSource.indexOf('  // ---------- world-space tank nameplates ----------'));
assert.doesNotMatch(selectorFunctions, /requireElement|querySelector/,
  'live shell/cooldown presentation must use construction-time handles');
assert.match(hudSource, /slotPresentations\[k\]\.select\(k === i\)/,
  'optimistic selection must use the same retained class owner');
assert.match(hudSource, /typeLabel: shellTypeLabel,[\s\S]*count: shellCount,[\s\S]*selectionLabel: ammunitionSelectionLabel,/,
  'slot retention consumes the canonical HUD formatting/count policy');
assert.match(hudSource, /locale: getLocale,/,
  'locale-only updates invalidate retained translated ammunition presentation');

console.log('hudAmmunitionPresentation.selftest: retained mutations, mutable cards, pending selection, touch, reload and locale passed');
