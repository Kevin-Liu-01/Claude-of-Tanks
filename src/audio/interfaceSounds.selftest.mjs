import assert from 'node:assert/strict';
import { bindInterfaceSounds, classifyInterfaceTarget } from './interfaceSounds.ts';

// A minimal element tree: tag, attributes, text and a parent for closest().
function el(tag, attrs = {}, parent = null, text = '') {
  const node = {
    tagName: tag.toUpperCase(),
    textContent: text,
    type: attrs.type,
    parent,
    getAttribute: (name) => (name in attrs ? String(attrs[name]) : null),
    closest(selector) {
      for (let at = node; at; at = at.parent) if (matches(at, selector)) return at;
      return null;
    },
  };
  return node;
}

/** Enough of CSS for the classifier's selectors: tags, [attr], [attr="v"], .class, comma lists. */
function matches(node, selector) {
  return selector.split(',').some((part) => {
    const s = part.trim();
    const attr = s.match(/^([a-z]*)\[([a-z-]+)(?:="([^"]*)")?\]$/);
    if (attr) {
      const [, tag, name, value] = attr;
      if (tag && node.tagName.toLowerCase() !== tag) return false;
      const got = node.getAttribute(name);
      return value == null ? got != null : got === value;
    }
    if (s.startsWith('.')) return String(node.getAttribute('class') || '').split(/\s+/).includes(s.slice(1));
    return node.tagName.toLowerCase() === s;
  });
}

const body = el('div');
const sound = (target) => classifyInterfaceTarget(target)?.sound ?? null;

assert.equal(sound(el('button', {}, body, 'Camouflage')), 'click', 'a plain button clicks');
assert.equal(sound(el('span', {}, el('button', {}, body, 'Settings'))), 'click', 'a press inside a button belongs to it');
assert.equal(sound(el('div', { role: 'tab' }, body, 'Armour')), 'tab');
const tankList = el('div', { role: 'listbox' }, body);
assert.equal(sound(el('div', { role: 'option', 'data-spec-id': 't90am' }, tankList, 'T-90M')), 'vehicle', 'a tank card lifts its tank');
assert.equal(sound(el('div', { role: 'option' }, el('div', { role: 'listbox' }, body), 'Olympus Basin')), 'select', 'other list options select');
assert.equal(sound(el('input', { type: 'checkbox' }, body)), 'toggle');
assert.equal(sound(el('button', { 'aria-pressed': 'false' }, body, 'Night')), 'toggle');
assert.equal(sound(el('button', { class: 'cot-set-close', 'aria-label': 'Close settings' }, body, '')), 'back', 'a close control by its code name');
assert.equal(sound(el('button', {}, body, '×')), 'back', 'or by its glyph');
assert.equal(sound(el('button', { 'data-action': 'start' }, body, 'Start')), 'confirm', 'a primary action by its data-action word');
assert.equal(sound(el('button', { class: 'cot-battle', 'data-ui-sound': 'deploy' }, body, 'Battle')), 'confirm', 'deploy is the confirm press');

// Roles, not words (SPEC 10, BUI-F8): the visible label never decides the sound, so Chinese labels sound right and an
// English label without a role or a code name is a plain press.
const zhPairs = [
  [{ 'data-ui-sound': 'back' }, '关闭', 'back'],
  [{ class: 'cot-drawer-close', 'aria-label': '关闭车库面板' }, '', 'back'],
  [{ 'data-ui-sound': 'back' }, '返回', 'back'],
  [{ class: 'cot-modal__button', 'data-action': 'return' }, '返回车库', 'back'],
  [{ class: 'cot-battle', 'data-ui-sound': 'deploy' }, '出战', 'confirm'],
  [{ 'data-action': 'ready' }, '准备', 'confirm'],
];
for (const [attrs, zhLabel, expected] of zhPairs) {
  assert.equal(sound(el('button', attrs, body, zhLabel)), expected, `${zhLabel || attrs['aria-label']} sounds ${expected}`);
  assert.equal(sound(el('button', attrs, body, 'Close')), expected, 'and the same control in English sounds the same');
}
for (const label of ['Close', 'Back', 'Return to garage', 'Battle', 'Deploy', 'Start', '关闭', '返回', '出战']) {
  assert.equal(sound(el('button', {}, body, label)), 'click', `"${label}" alone, with no role or code name, is a plain press`);
  assert.equal(sound(el('button', { 'aria-label': label, title: label }, body, '')), 'click', `as an accessible name too ("${label}")`);
}
assert.equal(sound(el('button', { class: 'cot-modal-backdrop' }, body, '')), 'click', 'a code word must match whole (backdrop is not back)');
assert.equal(sound(el('button', { 'data-ui-sound': 'press' }, body, '')), 'click', 'press is the SPEC 10 name of the click');
assert.equal(sound(el('button', { 'data-ui-sound': 'reward-gold' }, body, '')), 'click', 'an unknown role falls back to structure');
assert.equal(sound(el('input', { type: 'range' }, body)), null, 'a slider sounds on change, not on press');
assert.equal(sound(el('button', { disabled: '' }, body, 'Locked')), null, 'a disabled control is silent');
assert.equal(sound(el('button', { 'data-ui-sound': 'none' }, body, 'Fire')), null, 'a control can opt out');
assert.equal(sound(el('button', { 'data-ui-sound': 'confirm' }, body, 'Go')), 'confirm', 'or name its sound');
assert.equal(sound(el('div', {}, body, 'decor')), null, 'non-controls are silent');
const dialog = el('div', { role: 'dialog' }, body);
assert.equal(classifyInterfaceTarget(el('button', {}, dialog, 'Resume'))?.inMenu, true, 'menus are known (they sound in battle)');
assert.equal(classifyInterfaceTarget(el('button', {}, body, 'Fire'))?.inMenu, false);

// The delegated listeners: clicks classify, range changes slide, everything else is ignored.
const handlers = {};
const doc = { addEventListener: (type, fn) => { handlers[type] = fn; }, removeEventListener: (type) => { delete handlers[type]; } };
const heard = [];
const unbind = bindInterfaceSounds(doc, (hit) => heard.push(hit.sound));
handlers.click({ target: el('div', { role: 'tab' }, body) });
handlers.click({ target: { not: 'an element' } });
handlers.change({ target: el('input', { type: 'range' }, body) });
handlers.change({ target: el('input', { type: 'text' }, body) });
assert.deepEqual(heard, ['tab', 'slider']);
unbind();
assert.deepEqual(Object.keys(handlers), [], 'unbinding removes both listeners');

console.log('interfaceSounds.selftest: roles (关闭, 返回, 出战 sound as Close, Back, Battle), tabs, tank cards, options, toggles, back, primary, sliders, opt-outs, menus and delegation passed');
