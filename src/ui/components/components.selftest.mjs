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
  button, chip, emptyState, esc, keycap, scale20, scaleCells, segmented, statChip, statRow, statTile, tabs, tag, toggle, vehicle, wireRoving,
  wireRovingKeys,
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
// stat chips, stat tiles and empty states (250): escaped text, sprite glyphs, the tip as data-tip
const round = statChip({ icon: 'shellApfsds', label: 'APFSDS', value: '855', unit: 'mm', tip: 'M829A4 <sabot>' });
assert.match(round, /^<span class="cot-c-statchip" data-tip="M829A4 &lt;sabot&gt;"><svg [^>]*><use href="#i-shellApfsds(?:-s)?"\/><\/svg>/);
assert.match(round, /<span class="cot-c-statchip__label">APFSDS<\/span><b class="num">855<\/b><small>mm<\/small><\/span>$/);
const fitting = statChip({ icon: 'eqRammer', tip: 'Rammer' });
assert.match(fitting, /^<span class="cot-c-statchip cot-c-statchip--glyph" data-tip="Rammer" role="img" aria-label="Rammer">/, 'a glyph-only chip is named');
const tile = statTile({ label: 'Battles', value: '12', icon: 'battleRecord', note: '3 / 4', className: 'host-hook' });
assert.match(tile, /^<div class="cot-c-tile host-hook"><span class="cot-c-tile__label"><svg [^>]*><use href="#i-battleRecord(?:-s)?"\/><\/svg>Battles<\/span>/);
assert.match(tile, /<strong class="cot-c-tile__value">12<\/strong><small class="cot-c-tile__note">3 \/ 4<\/small><\/div>$/);
assert.match(statTile({ label: 'Survived', valueIcon: 'shield' }), /<strong class="cot-c-tile__value"><svg [^>]*><use href="#i-shield"\/>/, 'a status glyph in the figure');
const empty = emptyState({ text: 'No <match>', icon: 'search', action: { label: 'Clear', attrs: { 'data-clear-filters': true } } });
assert.match(empty, /<p>No &lt;match&gt;<\/p><button type="button" class="cot-c-btn cot-c-btn--36" data-ui-sound="press" data-clear-filters>Clear<\/button><\/div>$/);
assert.doesNotMatch(button({ label: 'Close', iconOnly: true, icon: 'close' }), /title=/, 'icon-only controls name themselves for the hover tip, not the browser');
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
// wireRovingKeys: a group whose items handle their own clicks (the Studio's segmented controls) gets the arrows only
const own = stubList(['p', 'q', 'r'], 'radio');
const pressed = [];
for (const item of own.items) item.click = () => pressed.push(item.dataset.value);
const unkey = wireRovingKeys(own.host);
assert.deepEqual(Object.keys(own.listeners), ['keydown'], 'keys only: the items keep their own click handlers');
own.items[0].focus();
let stopped = false;
own.listeners.keydown({ key: 'ArrowRight', preventDefault() {}, stopPropagation() { stopped = true; } });
assert.equal(document.activeElement, own.items[1], 'the arrow moves focus');
assert.deepEqual(pressed, ['q'], 'and presses the item, whose click selects it');
assert.ok(stopped, 'the arrows stay inside the group');
own.listeners.keydown({ key: 'End', preventDefault() {}, stopPropagation() {} });
own.listeners.keydown({ key: 'Tab', preventDefault() { throw new Error('Tab is not the group\'s'); }, stopPropagation() {} });
assert.deepEqual(pressed, ['q', 'r'], 'End presses the last; other keys pass');
unkey();
assert.deepEqual(Object.keys(own.listeners), [], 'the listener comes off');

/* 3. styles -------------------------------------------------------------------------------------------------- */
// A static sheet the page imports (src/main.ts), not a string the script injects: it paints with the first frame and
// stays out of the boot script.
// The kit's two sheets: components.css (every page that uses the kit) and figures.css (the stat chips, stat tiles and
// empty states the data surfaces draw), each tokens-only in the components layer.
const tokensCss = readFileSync(new URL('../tokens/tokens.css', import.meta.url), 'utf8');
for (const file of ['./components.css', './figures.css']) {
  const sheet = readFileSync(new URL(file, import.meta.url), 'utf8');
  assert.match(sheet, /\*\/\n@layer reset,tokens,base,components,surfaces,utilities,overrides;\n@layer components\{/,
    `${file} declares into the components layer, below every surface`);
  const css = sheet.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${file}: no colour literal: tokens only`);
  assert.doesNotMatch(css, /z-index:\s*\d|!important/, `${file}: no z-index or !important`);
  assert.doesNotMatch(css, /letter-spacing:\s*-?\.?\d/, `${file}: tracking reads the tracking tokens`);
  assert.doesNotMatch(css, /font(?:-size)?:[^;]*\b\d+(?:\.\d+)?px/, `${file}: type sizes read the type scale`);
  assert.doesNotMatch(css, /\b\d+(?:\.\d+)?m?s\b/, `${file}: durations read the motion tokens`);
  for (const [, name] of css.matchAll(/var\(--([a-z0-9-]+)/g)) {
    if (name === 'h' || name === 'sil') continue;
    assert.match(tokensCss, new RegExp(`--${name}:`), `${file}: --${name} is a design token`);
  }
}
const mainSource = readFileSync(new URL('../../main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /import '\.\/ui\/components\/components\.css';\nimport '\.\/ui\/components\/figures\.css';/, 'the game imports both sheets');
assert.match(readFileSync(new URL('../../gallery/gallery.css', import.meta.url), 'utf8'), /@import url\('\.\.\/ui\/components\/figures\.css'\);/,
  'the Gallery imports the figures it draws');
for (const page of ['../../docs/docs.css', '../../presentation/home.css', '../../presentation/notFound.css']) {
  assert.doesNotMatch(readFileSync(new URL(page, import.meta.url), 'utf8'), /figures\.css/, `${page} draws no figure and loads none`);
}
assert.doesNotMatch(readFileSync(new URL('./components.ts', import.meta.url), 'utf8'), /ensureStyle|`\s*\.cot-c-/,
  'no second copy of the sheets in the script');

console.log('components: markup, ARIA and escaping for every factory; roving focus; two tokens-only sheets in the components layer');
