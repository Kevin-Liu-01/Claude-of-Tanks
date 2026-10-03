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
assert.equal(sound(el('div', { role: 'option', 'data-spec-id': 't90m' }, tankList, 'T-90M')), 'vehicle', 'a tank card lifts its tank');
assert.equal(sound(el('div', { role: 'option' }, el('div', { role: 'listbox' }, body), 'Olympus Basin')), 'select', 'other list options select');
assert.equal(sound(el('input', { type: 'checkbox' }, body)), 'toggle');
assert.equal(sound(el('button', { 'aria-pressed': 'false' }, body, 'Night')), 'toggle');
assert.equal(sound(el('button', { 'aria-label': 'Close settings' }, body, '')), 'back');
assert.equal(sound(el('button', {}, body, '×')), 'back');
assert.equal(sound(el('button', { class: 'cot-play' }, body, 'Battle')), 'confirm', 'the battle button is the primary action');
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

console.log('interfaceSounds.selftest: tabs, tank cards, options, toggles, back, primary, sliders, opt-outs, menus and delegation passed');
