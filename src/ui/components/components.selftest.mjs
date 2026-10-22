// components.selftest.mjs — the shared component kit (brand-ui SPEC §6, BUI-F5). Copyright © 2026 Kevin B. Liu.
//
// 1. Markup: every factory escapes its text, names icon-only controls, carries its ARIA state and a sound role, and
//    draws on the token and icon systems (no inline colour, no raw SVG glyphs).
// 2. Behaviour: wireRoving moves selection and focus with the arrows, Home and End, and clicks.
// 3. Styles: one sheet in the components layer, and no style literal (the token package holds every value).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// Vite asset imports (the flag SVGs' `?url`) resolve to their public path, as the build does.
registerHooks({
  resolve(specifier, context, next) {
    const flag = /flags\/4x3\/([a-z]+)\.svg\?url$/.exec(specifier);
    if (flag) return { url: `data:text/javascript,export default '/flags/${flag[1]}.svg'`, shortCircuit: true };
    return next(specifier, context);
  },
});

const {
  button, chip, esc, keycap, scale20, scaleCells, segmented, statRow, tabs, tag, toggle, vehicle, wireRoving, ensureComponentStyles,
} = await import('./components.ts');

/* 1. markup -------------------------------------------------------------------------------------------------- */
assert.equal(esc(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;', 'text and attributes are escaped');
const primary = button({ label: 'Deploy <now>', variant: 'primary', size: 64, icon: 'deploy', key: 'Enter' });
assert.match(primary, /^<button type="button" class="cot-c-btn cot-c-btn--primary cot-c-btn--64" data-ui-sound="confirm">/);
assert.match(primary, /Deploy &lt;now&gt;/, 'the label is escaped');
assert.match(primary, /<use href="#i-deploy"\/>/, 'the glyph comes from the sprite');
assert.match(primary, /<kbd class="cot-c-kbd" aria-hidden="true">Enter<\/kbd>/, 'the key cap is decorative');
const iconOnly = button({ label: 'Settings', icon: 'settings', iconOnly: true });
assert.match(iconOnly, /aria-label="Settings"/, 'an icon-only button is named');
assert.doesNotMatch(iconOnly, /cot-c-btn__label|cot-c-kbd/, 'an icon-only button shows no text and no key cap');
assert.match(button({ label: 'Back', attrs: { disabled: true, 'data-x': 1, hidden: false } }), /data-ui-sound="press" disabled data-x="1">/,
  'extra attributes: true is bare, false is omitted');
assert.match(chip({ label: 'MBT', pressed: true }), /^<button type="button" class="cot-c-chip" aria-pressed="true" data-ui-sound="toggle">/);
assert.match(chip({ label: 'MBT' }), /^<span class="cot-c-chip">/, 'a static chip is not a control');
assert.match(chip({ label: 'Germany', nation: 'germany', pressed: false, compact: true }), /aria-label="Germany"[^>]*><img class="cot-c-flag/,
  'a compact flag chip is named by its nation');
assert.equal(tag('New', 'accent'), '<span class="cot-c-tag cot-c-tag--accent">New</span>');
const seg = segmented({ label: 'Sides', value: 'b', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C', disabled: true }] });
assert.match(seg, /role="radiogroup" aria-label="Sides"/);
assert.equal((seg.match(/aria-checked="true"/g) ?? []).length, 1, 'one option is checked');
assert.match(seg, /data-value="b" aria-checked="true" tabindex="0"/, 'the checked option holds the tab stop');
assert.equal((seg.match(/tabindex="-1"/g) ?? []).length, 2, 'the others leave the tab order');
const tablist = tabs({ label: 'Deploy', selected: 'quick', panelPrefix: 'deploy', tabs: [
  { id: 'quick', label: 'Quick battle', icon: 'modeStandard' }, { id: 'campaign', label: 'Campaign', count: '3 / 6', key: 'C' }] });
assert.match(tablist, /role="tablist" aria-label="Deploy"/);
assert.match(tablist, /role="tab" class="cot-c-tabs__tab" data-tab="quick" aria-selected="true" tabindex="0" data-ui-sound="tab" aria-controls="deploy-quick"/);
assert.match(tablist, /<span class="cot-c-tabs__count num">3 \/ 6<\/span>/);
const sw = toggle({ label: 'Cinematic FX', checked: false, onWord: 'ON', offWord: 'OFF' });
assert.match(sw, /role="switch" class="cot-c-toggle" aria-checked="false" aria-label="Cinematic FX"/);
assert.match(sw, />OFF<\/span><\/button>$/, 'the state is written, never only coloured');
assert.equal(scaleCells(900, 0, 1000), 18);
assert.equal(scaleCells(5.7, 12, 3), 14, 'a range written best-low reads lower values as better');
assert.equal(scaleCells(-5, 0, 10), 1, 'every value lights at least one cell');
assert.equal(scaleCells(99, 0, 10), 20);
assert.equal(scaleCells(Number.NaN, 0, 10), 0);
const bar = scale20(3, 5);
assert.equal((bar.match(/<i/g) ?? []).length, 20, 'twenty cells');
assert.match(bar, /^<span class="cot-c-scale" aria-hidden="true"><i class="f"><\/i><i class="f"><\/i><i class="f"><\/i><i><\/i><i class="r"><\/i>/);
assert.match(scale20(5, 3), /<i class="f r"><\/i>/, 'a rival tick inside the lit run');
const row = statRow({ label: 'Reload', value: '5.7', unit: 's', icon: 'reload', cells: 14, rivalCells: 13, delta: '−0.3', better: true });
assert.match(row, /<b class="num">5\.7<\/b><small>s<\/small><em class="cot-c-stat__delta is-better">−0\.3<\/em>/, 'raw value, unit and worded delta');
const veh = vehicle({ id: 'challenger3', nation: 'uk', name: 'Challenger 3' });
assert.match(veh, /<img class="cot-c-flag cot-c-flag--sm"[^>]*alt="" aria-hidden="true"/, 'the flag is decorative beside the name');
assert.match(veh, /--sil:url\(\/icons\/challenger3_side_silhouette\.png\)/, 'the silhouette is the tank\'s own');
assert.match(veh, /<b>Challenger 3<\/b><\/span>$/);
for (const markup of [primary, iconOnly, seg, tablist, sw, row, veh]) {
  assert.doesNotMatch(markup, /style="(?!--sil:)[^"]*"/, 'no inline style other than the silhouette mask source');
  assert.doesNotMatch(markup, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'no colour in markup');
}

/* 2. behaviour ----------------------------------------------------------------------------------------------- */
function stubList(values, role) {
  const listeners = {};
  const items = values.map((value) => {
    const attrs = new Map([['role', role]]);
    return {
      dataset: role === 'tab' ? { tab: value } : { value }, tabIndex: -1,
      getAttribute: (name) => attrs.get(name) ?? null, setAttribute: (name, v) => attrs.set(name, v), hasAttribute: (name) => attrs.has(name),
      focus() { globalThis.document.activeElement = this; },
      closest() { return this; },
    };
  });
  const host = {
    querySelectorAll: () => items, getAttribute: () => null, contains: (node) => items.includes(node),
    addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; },
  };
  return { host, items, listeners };
}
globalThis.document = { activeElement: null };
const picked = [];
const { host, items, listeners } = stubList(['a', 'b', 'c'], 'tab');
const unwire = wireRoving(host, (value) => picked.push(value));
items[0].focus();
const key = (k) => { let prevented = false; listeners.keydown({ key: k, preventDefault: () => { prevented = true; } }); return prevented; };
assert.ok(key('ArrowRight'));
assert.equal(document.activeElement, items[1], 'ArrowRight moves focus');
assert.equal(items[1].getAttribute('aria-selected'), 'true');
assert.equal(items[0].getAttribute('aria-selected'), 'false');
assert.equal(items[1].tabIndex, 0);
key('End'); assert.equal(document.activeElement, items[2]);
key('ArrowRight'); assert.equal(document.activeElement, items[0], 'the arrows wrap');
key('ArrowLeft'); assert.equal(document.activeElement, items[2]);
key('Home'); assert.equal(document.activeElement, items[0]);
assert.equal(key('ArrowDown'), false, 'a horizontal list ignores the vertical arrows');
listeners.click({ target: items[1] });
assert.deepEqual(picked, ['b', 'c', 'a', 'c', 'a', 'b']);
unwire();
assert.deepEqual(Object.keys(listeners), [], 'the listeners come off');
const radios = stubList(['x', 'y'], 'radio');
wireRoving(radios.host, () => {});
radios.items[0].focus();
radios.listeners.keydown({ key: 'ArrowRight', preventDefault() {} });
assert.equal(radios.items[1].getAttribute('aria-checked'), 'true', 'a radio group checks what it moves to');

/* 3. styles -------------------------------------------------------------------------------------------------- */
const injected = [];
globalThis.document = {
  getElementById: () => null, createElement: () => ({ tagName: 'STYLE' }), head: { appendChild: (node) => injected.push(node) },
};
ensureComponentStyles();
assert.equal(injected.length, 1);
assert.equal(injected[0].id, 'cot-components');
assert.match(injected[0].textContent, /^@layer reset,tokens,base,components,surfaces,utilities,overrides;@layer components\{/,
  'the kit declares into the components layer, below every surface');
const source = readFileSync(new URL('./components.ts', import.meta.url), 'utf8');
const css = /const CSS = `([\s\S]*?)`;/.exec(source)[1];
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'no colour literal: tokens only');
assert.doesNotMatch(css, /z-index:\s*\d|!important/, 'no z-index or !important');
assert.doesNotMatch(css, /letter-spacing:\s*-?\.?\d/, 'tracking reads the tracking tokens');
assert.doesNotMatch(css, /font(?:-size)?:[^;]*\b\d+(?:\.\d+)?px/, 'type sizes read the type scale');
assert.doesNotMatch(css, /\b\d+(?:\.\d+)?m?s\b/, 'durations read the motion tokens');
for (const [, name] of css.matchAll(/var\(--([a-z0-9-]+)/g)) {
  if (name === 'h' || name === 'sil') continue;
  assert.match(readFileSync(new URL('../tokens/tokens.css', import.meta.url), 'utf8'), new RegExp(`--${name}:`), `--${name} is a design token`);
}

console.log('components: markup, ARIA and escaping for every factory; roving focus; one tokens-only sheet in the components layer');
