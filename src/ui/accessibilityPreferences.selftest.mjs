// accessibilityPreferences.selftest.mjs — the accessibility core's receipt (brand-ui SPEC 4.6, 4.7, 9, 12.1.6, 14; PLAN
// BUI-F9). Copyright © 2026 Kevin B. Liu.
//
//  1. The record (accessibilitySettings.ts): defaults, normalisation (ranges, enums, colours, toggles), persistence,
//     refusals; :root is the runtime source the boot reader (accessibilityPreferences.ts) turns into the live state.
//  2. Text and HUD scale: --cot-type-scale = ui scale x text size (0.8-2.0) and --cot-hud-scale = clamp(short/1080,
//     .85, 2.0) x HUD scale (0.75-1.5), consumed by the type tokens; responsiveLayout writes both fits.
//  3. Colour presets and high contrast: data-cvd / data-contrast on :root and the same selection in tokens.ts, where
//     liveToken() equals the tokens.css cascade for every token under every preset, Custom pair and motion choice.
//     A Custom pair under the floors is refused and never stored; a stored one that fails is put back at start.
//  4. Reduce motion overrides the OS both ways: data-motion and every prefers-reduced-motion rule in the document,
//     the ones modules add later included; prefersReducedMotion() for script; shake, flash and drone static go live.
//  5. The game document's head seed writes exactly what applyAccessibility() writes, for any stored record.
//  6. The boot cost: the reader, bundled and minified as the game ships it, at most 1 KB brotli with what it imports; the
//     record, the writer, the motion rules and the colour checks stay out of the game's boot graph and every public page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brotliCompressSync, constants as zlib } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { A11Y, hudFitFor, installAccessibility, prefersReducedMotion, readAccessibilityRoot } from './accessibilityPreferences.ts';
import {
  ACCESSIBILITY_EVENT, ACCESSIBILITY_KEY, COLOR_PRESETS, DEFAULT_ACCESSIBILITY, HOLD_ACTIONS, MOTION_MODES, RANGES,
  accessibilityPreferences, applyAccessibility, normalizeAccessibility, readAccessibility, saveAccessibility, setCustomTeamColours,
} from './accessibilitySettings.ts';
import { motionMediaText, overrideMotionRules } from './accessibilityMotion.ts';
import { TOKENS, TOKEN_PRESETS, TOKEN_PX, liveToken, tokenEpoch } from './tokens/tokens.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(`${ROOT}${path}`, 'utf8');

/* --------------------------------------------------------------------------------------------- fakes */
const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial));
  return { map, getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};
const fakeRoot = () => {
  const props = new Map();
  return {
    dataset: {},
    style: { setProperty: (k, v) => props.set(k, String(v)), removeProperty: (k) => props.delete(k), getPropertyValue: (k) => props.get(k) ?? '' },
    props,
  };
};
const snapshot = (root) => ({ data: { ...root.dataset }, props: Object.fromEntries([...root.props].sort()) });
let osReduces = false;
const osQuery = { get matches() { return osReduces; }, listeners: new Set(),
  addEventListener(_, fn) { this.listeners.add(fn); }, removeEventListener(_, fn) { this.listeners.delete(fn); } };
globalThis.matchMedia = (query) => {
  assert.equal(query, '(prefers-reduced-motion: reduce)', 'the core asks the OS only about reduced motion');
  return osQuery;
};
const events = [];
globalThis.dispatchEvent = (event) => { events.push(event); return true; };
// the document whose :root a change is written on when no root is passed (the game's)
const docRoot = fakeRoot();
globalThis.document = { documentElement: docRoot, styleSheets: [], head: null };
// the game document's head seed, run against a root the way the browser runs it before first paint
const html = read('index.html');
const seedMatch = /<script>\s*(\/\/ The player's accessibility choices before first paint[\s\S]*?)<\/script>/.exec(html);
assert.ok(seedMatch, 'index.html seeds the accessibility attributes before first paint');
const seedFn = new Function('localStorage', 'document', seedMatch[1]);
const seed = (raw, root) => seedFn({ getItem: (k) => (k === ACCESSIBILITY_KEY ? raw : null) }, { documentElement: root });
globalThis.CustomEvent ??= class CustomEvent extends Event { constructor(type, init) { super(type); this.detail = init?.detail; } };

/* --------------------------------------------------------------------------------------------- 1. the record */
assert.deepEqual(normalizeAccessibility(null), DEFAULT_ACCESSIBILITY, 'nothing stored is the defaults');
for (const bad of [undefined, 3, 'x', [], { textScale: 'big', motion: 'slow', colorPreset: 'rainbow', toggles: 'fire' }]) {
  assert.deepEqual(normalizeAccessibility(bad), DEFAULT_ACCESSIBILITY, `garbage normalises to the defaults (${JSON.stringify(bad)})`);
}
assert.deepEqual(DEFAULT_ACCESSIBILITY.customOwn, TOKENS['team-own'], 'the Custom pickers start at the default ally colour');
assert.deepEqual(DEFAULT_ACCESSIBILITY.customEnemy, TOKENS['team-enemy'], 'and the default enemy colour');
{
  const n = normalizeAccessibility({
    textScale: 9, hudScale: 0.1, shake: -2, flash: 0.35, motion: 'reduce', colorPreset: 'tritan',
    customOwn: '#ABCDEF', customEnemy: 'red', highContrast: 1, droneStatic: false,
    toggles: ['rosters', 'fire', 'fire', 'nope', 'handbrake'], extra: 1,
  });
  assert.equal(n.textScale, RANGES.textScale[1], 'text size clamps to 200 %');
  assert.equal(n.hudScale, RANGES.hudScale[0], 'HUD scale clamps to 75 %');
  assert.deepEqual([n.shake, n.flash], [0, 0.35], 'shake and flash clamp to 0-100 %');
  assert.equal(n.customOwn, '#abcdef', 'a stored colour is kept in lower case');
  assert.equal(n.customEnemy, DEFAULT_ACCESSIBILITY.customEnemy, 'a malformed colour falls back');
  assert.equal(n.highContrast, false, 'only true turns high contrast on');
  assert.deepEqual(n.toggles, ['fire', 'handbrake', 'rosters'], 'toggles keep known hold actions once, in HOLD_ACTIONS order');
  assert.ok(!('extra' in n), 'unknown keys are dropped');
}
assert.deepEqual(RANGES.textScale, [0.8, 2], 'SPEC 12.1.6: text size 80-200 %');
assert.deepEqual(RANGES.hudScale, [0.75, 1.5], 'SPEC 12.1.6: HUD scale 75-150 %');
assert.deepEqual([...COLOR_PRESETS], ['default', 'deutan', 'protan', 'tritan', 'classic', 'custom'], 'SPEC 4.6 presets');
assert.deepEqual([...MOTION_MODES], ['system', 'reduce', 'full'], 'Reduce motion: follow the OS, on, off');
for (const preset of COLOR_PRESETS.filter((p) => p !== 'default' && p !== 'custom')) {
  assert.ok(Object.hasOwn(TOKEN_PRESETS.cvd, preset), `the ${preset} preset is a tokens.json colour-vision preset`);
}
{
  const store = memoryStorage();
  assert.deepEqual(readAccessibility(store), DEFAULT_ACCESSIBILITY);
  store.setItem(ACCESSIBILITY_KEY, '{broken');
  assert.deepEqual(readAccessibility(store), DEFAULT_ACCESSIBILITY, 'unreadable JSON is the defaults');
  store.map.clear();
  events.length = 0;
  assert.equal(saveAccessibility({ shake: 0.4, toggles: ['freeLook'], customOwn: '#000000' }, store), true);
  const saved = JSON.parse(store.getItem(ACCESSIBILITY_KEY));
  assert.equal(saved.shake, 0.4);
  assert.deepEqual(saved.toggles, ['freeLook']);
  assert.equal(saved.customOwn, DEFAULT_ACCESSIBILITY.customOwn, 'saveAccessibility never changes the Custom colours (only a checked pair does)');
  assert.equal(events.at(-1)?.type, ACCESSIBILITY_EVENT, 'a change is announced');
  assert.equal(events.at(-1)?.detail.shake, 0.4);
  assert.equal(A11Y.shake, 0.4, 'and goes live (written on :root, read back by the boot reader)');
  assert.equal(docRoot.props.get('--cot-shake-scale'), '0.4');
  assert.deepEqual([...A11Y.toggles], ['freeLook']);
  assert.equal(docRoot.dataset.toggles, 'freeLook', 'the toggled hold actions are on :root');
  const refusing = { getItem: () => null, setItem() { throw new Error('quota'); } };
  assert.equal(saveAccessibility({ shake: 1 }, refusing), false, 'a refused write reports failure');
  assert.equal(A11Y.shake, 0.4, 'and applies nothing');
  saveAccessibility({ shake: 1, toggles: [] }, store);
}

/* --------------------------------------------------------------------------------------------- 2. text and HUD scale */
const tokensCss = read('src/ui/tokens/tokens.css');
assert.match(tokensCss, /--cot-type-scale:calc\(var\(--cot-ui-scale,1\)\*var\(--cot-user-text\)\)/, 'type scale = ui scale x text size');
assert.match(tokensCss, /--cot-hud-scale:calc\(var\(--cot-hud-fit,1\)\*var\(--cot-user-hud\)\)/, 'HUD scale = resolution fit x HUD scale');
for (const [name, px] of Object.entries(TOKEN_PX).filter(([n]) => n.startsWith('fs-'))) {
  assert.ok(tokensCss.includes(`--${name}:calc(${px}px*var(--cot-type-scale))`), `--${name} consumes --cot-type-scale (and so --cot-ui-scale)`);
}
for (const name of ['hud-fs-copy', 'hud-fs-body', 'hud-fs-numeral']) {
  assert.ok(tokensCss.includes(`--${name}:calc(${TOKEN_PX[name]}px*var(--cot-hud-scale))`), `--${name} consumes --cot-hud-scale`);
}
const tick = () => new Promise((r) => setTimeout(r, 30));
const near = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label}: ${a} != ${b}`);
near(hudFitFor(1920, 1080), 1, '1080p keeps the HUD at 100 %');
near(hudFitFor(2560, 1440), 1440 / 1080, '1440p grows it to its 1080p proportions');
near(hudFitFor(3840, 2160), 2, '4K at DPR 1 doubles it');
near(hudFitFor(7680, 4320), 2, 'the fit stops at 2.0');
near(hudFitFor(1366, 768), 0.85, 'a laptop stops at 0.85');
near(hudFitFor(390, 844), 0.85, 'a portrait phone reads its short side and stops at 0.85');
near(hudFitFor(844, 390), 0.85, 'and a landscape one');
near(hudFitFor(NaN, 0), 1, 'no reading is 1');
assert.match(read('src/ui/responsiveLayout.ts'), /setVar\('--cot-ui-scale', next\.scale\.toFixed\(4\)\);/,
  'responsiveLayout writes the ui scale the type tokens read');
{
  const root = fakeRoot();
  applyAccessibility(normalizeAccessibility({ textScale: 1.5, hudScale: 1.25 }), root);
  assert.equal(root.props.get('--cot-user-text'), '1.5', 'the text size reaches --cot-user-text');
  assert.equal(root.props.get('--cot-user-hud'), '1.25', 'the HUD scale reaches --cot-user-hud');
  applyAccessibility(DEFAULT_ACCESSIBILITY, root);
  assert.equal(root.props.size, 0, 'at 100 % nothing is written (the tokens default to 1)');
}

/* --------------------------------------------------------------------------------------------- 3. presets */
// The tokens.css cascade, simulated: defaults, the selected preset blocks, the OS media copy while the player follows the
// OS, then the inline runtime tokens.
const parseDecls = (text) => new Map(text.split(';').map((s) => s.trim()).filter(Boolean).map((d) => {
  const i = d.indexOf(':');
  return [d.slice(2, i), d.slice(i + 1).trim()];
}));
const body = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '');
const defaults = parseDecls(/^:root\{([^}]*)\}/m.exec(body)[1]);
const presetBlocks = [...body.matchAll(/:root\[data-([a-z]+)=([a-z]+)\]\{([^}]*)\}/g)].map(([, axis, preset, decls]) => ({ axis, preset, decls: parseDecls(decls) }));
const media = /@media \(prefers-reduced-motion:reduce\)\{\s*:root:not\(\[data-motion\]\)\{([^}]*)\}/.exec(body);
assert.ok(media, 'the OS reduce-motion copy yields to data-motion');
const mediaDecls = parseDecls(media[1]);
const resolve = (text, decls, depth = 0) => {
  assert.ok(depth < 32);
  return text.replace(/var\(--([a-z0-9-]+)\)/g, (m, n) => (decls.has(n) ? resolve(decls.get(n), decls, depth + 1) : m));
};
const cascade = (root) => {
  const decls = new Map(defaults);
  for (const block of presetBlocks) if (root.dataset[block.axis] === block.preset) for (const [k, v] of block.decls) decls.set(k, v);
  if (!root.dataset.motion && osReduces) for (const [k, v] of mediaDecls) decls.set(k, v);
  for (const [k, v] of root.props) if (k.startsWith('--') && decls.has(k.slice(2))) decls.set(k.slice(2), v);
  return decls;
};
let compared = 0;
const scaled = new Set(Object.keys(TOKEN_PX).filter((n) => /calc\(/.test(defaults.get(n) ?? '')));
for (const colorPreset of COLOR_PRESETS) for (const highContrast of [false, true]) for (const motion of MOTION_MODES) for (const os of [false, true]) {
  osReduces = os;
  const root = fakeRoot();
  const prefs = normalizeAccessibility({ colorPreset, highContrast, motion, customOwn: '#3fa0ff', customEnemy: '#ff5a4e' });
  const epoch = tokenEpoch();
  applyAccessibility(prefs, root);
  assert.ok(tokenEpoch() > epoch, 'every apply bumps the token epoch canvases watch');
  assert.equal(root.dataset.cvd, colorPreset === 'default' ? undefined : colorPreset, 'data-cvd names the preset');
  assert.equal(root.dataset.contrast, highContrast ? 'high' : undefined, 'data-contrast=high');
  assert.equal(root.dataset.motion, motion === 'system' ? undefined : motion, 'data-motion is the explicit choice only');
  assert.equal(A11Y.reduceMotion, motion === 'reduce' || (motion === 'system' && os), 'reduced motion: the choice, or the OS while followed');
  assert.equal(prefersReducedMotion(root), A11Y.reduceMotion);
  const decls = cascade(root);
  for (const name of Object.keys(TOKENS)) {
    if (scaled.has(name)) continue;
    assert.equal(liveToken(name), resolve(decls.get(name), decls),
      `liveToken('${name}') equals the cascade (${colorPreset}${highContrast ? ' high' : ''} motion=${motion} os=${os})`);
    compared++;
  }
}
osReduces = false;
{
  const root = fakeRoot();
  applyAccessibility(normalizeAccessibility({ colorPreset: 'custom', customOwn: '#3fa0ff', customEnemy: '#ff5a4e', highContrast: true }), root);
  assert.equal(root.props.get('--team-own'), '#3fa0ff', 'Custom writes the ally colour on :root');
  assert.equal(liveToken('text-own'), TOKENS['ink-1'], 'high contrast still sets coloured words in ink-1 under Custom');
  applyAccessibility(DEFAULT_ACCESSIBILITY, root);
  assert.ok(!root.props.has('--team-own') && !root.props.has('--team-enemy'), 'leaving Custom removes the inline colours');
  assert.equal(liveToken('team-enemy'), TOKENS['team-enemy']);
}
{
  const store = memoryStorage();
  const refused = setCustomTeamColours('#7ee87e', '#f05a5a', store);
  assert.equal(refused.ok, false, "SPEC 4.5's old team pair (deutan ΔE 19.3) is refused");
  assert.ok(refused.failures.some((f) => f.check === 'own~enemy' && f.view === 'deutan'), 'and the failing pair and view are named');
  assert.equal(store.getItem(ACCESSIBILITY_KEY), null, 'a refused pair is never stored');
  const accepted = setCustomTeamColours('#3fa0ff', '#ff5a4e', store);
  assert.equal(accepted.ok, true, `a separable pair is accepted (${accepted.failures.map((f) => f.check).join(', ')})`);
  assert.equal(JSON.parse(store.getItem(ACCESSIBILITY_KEY)).colorPreset, 'custom', 'and selects Custom');
  assert.equal(accessibilityPreferences().customEnemy, '#ff5a4e');
  // A stored pair that fails the check (written by hand, or by an older build) returns to the defaults at start.
  const raw = JSON.stringify({ colorPreset: 'custom', customOwn: '#7ee87e', customEnemy: '#f05a5a', shake: 0.5, toggles: ['handbrake'] });
  const tampered = memoryStorage({ [ACCESSIBILITY_KEY]: raw });
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { value: tampered, configurable: true, writable: true });
  try {
    for (const k of Object.keys(docRoot.dataset)) delete docRoot.dataset[k];
    docRoot.props.clear();
    seed(raw, docRoot);
    docRoot.style.setProperty('--cot-viewport-width', '2560px');
    docRoot.style.setProperty('--cot-viewport-height', '1440px');
    osQuery.listeners.clear();
    const layoutListeners = [];
    globalThis.addEventListener = (type, fn) => { if (type === 'cot:layoutchange') layoutListeners.push(fn); };
    installAccessibility();
    assert.equal(docRoot.props.get('--cot-hud-fit'), (1440 / 1080).toFixed(4), 'the HUD fit is written from the measured viewport');
    docRoot.style.setProperty('--cot-viewport-width', '3840px');
    docRoot.style.setProperty('--cot-viewport-height', '2160px');
    for (const fn of layoutListeners) fn();
    assert.equal(docRoot.props.get('--cot-hud-fit'), '2.0000', 'and follows every layout change (4K doubles it)');
    delete globalThis.addEventListener;
    assert.equal(docRoot.dataset.cvd, 'custom', 'the seeded record is in force at once');
    assert.deepEqual([A11Y.shake, [...A11Y.toggles]], [0.5, ['handbrake']], 'the boot reader takes the live state from :root');
    assert.equal(liveToken('team-own'), '#7ee87e', 'and the token selection, Custom colours included');
    await tick();
    assert.equal(readAccessibility(tampered).colorPreset, 'default', 'then the re-check refuses the pair and stores the defaults');
    assert.equal(docRoot.dataset.cvd, undefined, 'and :root leaves Custom');
    assert.equal(liveToken('team-own'), TOKENS['team-own']);
    assert.equal(readAccessibility(tampered).shake, 0.5, 'keeping every other choice');
    // The OS changing its setting re-resolves reduced motion for a player who follows it (read live every frame).
    assert.equal(osQuery.listeners.size, 1, 'the boot reader follows the OS setting');
    osReduces = true;
    for (const fn of osQuery.listeners) fn();
    assert.equal(A11Y.reduceMotion, true, 'the OS turning reduce on goes live');
    assert.equal(liveToken('dur-base'), '1ms', 'and collapses the motion tokens canvases read');
    osReduces = false;
    for (const fn of osQuery.listeners) fn();
    assert.equal(A11Y.reduceMotion, false);
    osQuery.listeners.clear();
  } finally {
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
    else delete globalThis.localStorage;
  }
  applyAccessibility(DEFAULT_ACCESSIBILITY, fakeRoot());
}

/* --------------------------------------------------------------------------------------------- 4. motion, shake, flash */
assert.equal(motionMediaText('(prefers-reduced-motion: reduce)', 'reduce'), 'all', 'Reduce on turns a reduce rule on');
assert.equal(motionMediaText('(prefers-reduced-motion: reduce)', 'full'), 'not all', 'Reduce off turns it off');
assert.equal(motionMediaText('(prefers-reduced-motion:reduce)', 'system'), '(prefers-reduced-motion:reduce)', 'System keeps the OS query');
assert.equal(motionMediaText('(prefers-reduced-motion: no-preference)', 'reduce'), 'not all', 'a motion-allowed rule is the opposite');
assert.equal(motionMediaText('(prefers-reduced-motion: no-preference)', 'full'), 'all');
assert.equal(motionMediaText('(prefers-reduced-motion: reduce) and (pointer: coarse)', 'reduce'), '(min-width: 0px) and (pointer: coarse)',
  'a combined query keeps its other conditions');
assert.equal(motionMediaText('(prefers-reduced-motion: reduce) and (pointer: coarse)', 'full'), '(max-width: -1px) and (pointer: coarse)');
{
  const rule = (mediaText, children) => ({ media: { mediaText }, cssRules: children });
  const reduce = rule('(prefers-reduced-motion: reduce)');
  const width = rule('(max-width: 600px)', [rule('(prefers-reduced-motion: reduce)')]);
  const plain = { selectorText: '.x' };
  const rules = [reduce, width, plain];
  assert.equal(overrideMotionRules(rules, 'reduce'), 2, 'nested reduced-motion rules are found');
  assert.equal(reduce.media.mediaText, 'all');
  assert.equal(width.media.mediaText, '(max-width: 600px)', 'other media rules are untouched');
  assert.equal(width.cssRules[0].media.mediaText, 'all');
  overrideMotionRules(rules, 'full');
  assert.equal(reduce.media.mediaText, 'not all');
  overrideMotionRules(rules, 'system');
  assert.equal(reduce.media.mediaText, '(prefers-reduced-motion: reduce)', 'System restores the authored query');
}
{
  // Through applyAccessibility: every sheet in the document, and the styles modules add while a choice overrides the OS.
  const rule = (mediaText) => ({ media: { mediaText } });
  const authored = rule('(prefers-reduced-motion: reduce)');
  let observer = null;
  globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; observer = this; } observe(target, options) { this.target = target; this.options = options; } disconnect() { observer = null; } };
  const head = { tagName: 'HEAD' };
  const motionRoot = fakeRoot();
  const priorDocument = globalThis.document;
  globalThis.document = { documentElement: motionRoot, styleSheets: [{ cssRules: [authored] }, { get cssRules() { throw new Error('cross-origin'); } }], head };
  try {
    applyAccessibility(DEFAULT_ACCESSIBILITY, motionRoot);
    await tick();
    assert.equal(observer, null, 'the default (System, nothing overridden) walks nothing and watches nothing');
    applyAccessibility(normalizeAccessibility({ motion: 'reduce' }), motionRoot);
    await tick();
    assert.equal(authored.media.mediaText, 'all', 'an existing sheet follows Reduce on (a cross-origin sheet is skipped)');
    assert.ok(observer && observer.target === head && observer.options.childList, 'the head is watched while a choice overrides the OS');
    const late = rule('(prefers-reduced-motion: reduce)');
    observer.cb([{ target: head, addedNodes: [{ tagName: 'STYLE', sheet: { cssRules: [late] } }] }]);
    assert.equal(late.media.mediaText, 'all', 'a style a module adds later follows too');
    let onLoad = null;
    const lateLink = rule('(prefers-reduced-motion: reduce)');
    const link = { tagName: 'LINK', sheet: null, addEventListener: (_, fn) => { onLoad = fn; } };
    observer.cb([{ target: head, addedNodes: [link] }]);
    link.sheet = { cssRules: [lateLink] };
    onLoad();
    assert.equal(lateLink.media.mediaText, 'all', 'and a lazily linked stylesheet once it loads');
    applyAccessibility(normalizeAccessibility({ motion: 'full' }), motionRoot);
    await tick();
    assert.equal(authored.media.mediaText, 'not all', 'Reduce off');
    applyAccessibility(DEFAULT_ACCESSIBILITY, motionRoot);
    await tick();
    assert.equal(authored.media.mediaText, '(prefers-reduced-motion: reduce)', 'System restores every rule');
    assert.equal(observer, null, 'and stops watching');
  } finally {
    globalThis.document = priorDocument;
    delete globalThis.MutationObserver;
  }
}
{
  const root = fakeRoot();
  applyAccessibility(normalizeAccessibility({ shake: 0, flash: 0.3, droneStatic: false, toggles: ['fire', 'rosters'] }), root);
  assert.deepEqual([A11Y.shake, A11Y.flash], [0, 0.3], 'shake and flash go live');
  assert.equal(root.props.get('--cot-shake-scale'), '0', 'camera shake is on :root as --cot-shake-scale');
  assert.deepEqual([...A11Y.toggles].sort(), ['fire', 'rosters'], 'the toggled hold actions go live');
  assert.equal(root.dataset.droneStatic, 'off', 'data-drone-static=off for the aerial HUD');
  assert.equal(root.props.get('--cot-flash-scale'), '0.3', 'CSS flashes read --cot-flash-scale');
  applyAccessibility(DEFAULT_ACCESSIBILITY, root);
  assert.equal(A11Y.toggles.size, 0);
}
// Where the live values go (each consumer multiplies by them; the behaviour is in cameraRig and input selftests).
const consumers = [
  ['src/engine/cameraRig.ts', /A11Y\.shake \* \(0\.0011[\s\S]*Math\.pow\(trauma, 1\.6\) \* A11Y\.shake[\s\S]*recoil \* A11Y\.shake[\s\S]*fovKick \* A11Y\.shake/, 'the camera: sway, trauma shake, recoil kick and FOV punch'],
  ['src/game/killcam.ts', /Math\.exp\(-pb\.itWall \/ 0\.3\) \* A11Y\.shake/, 'the kill cam shake'],
  ['src/game/killcam.ts', /cotKcFlash\{0%\{opacity:calc\(\.62\*var\(--cot-flash-scale,1\)\)/, 'the kill cam shock flash'],
  ['src/fx/effects.ts', /state\.peak \* Math\.pow\(k, state\.pow \|\| 2\) \* A11Y\.flash/, 'the muzzle and blast lights'],
  ['src/fx/effects.ts', /\* muzzleCardScale \* appliedCardFlash/, 'the additive flash and jet cards'],
  ['src/engine/volumetricClouds.ts', /\(1 - 0\.25 \* k\) \* A11Y\.flash/, 'lightning'],
  ['src/ui/hud.ts', /\(1 - paint\.age \/ 0\.25\) \* A11Y\.flash/, 'the incoming-hit bloom'],
  ['src/ui/hud.ts', /visual\.opacity \* visual\.flash \* A11Y\.flash/, 'the hit-confirm spark'],
  ['src/ui/aerialHud.css', /:root\[data-drone-static=off\] \.cot-drone-signal-loss::before/, 'the drone feed static'],
];
for (const [file, pattern, label] of consumers) assert.match(read(file), pattern, `${label} (${file})`);
// Script asks the player's choice, never the OS alone: the game modules through the core; the modal and the fleet takes,
// which the public pages also load, through the same rule inline (they never carry the core: the build graphs below).
const OS_QUERY = /matchMedia\??\.?\(\s*['"]\(prefers-reduced-motion/;
for (const file of ['src/ui/garage.ts', 'src/ui/hud.ts', 'src/game/killcam.ts', 'src/ui/settings.ts']) {
  assert.doesNotMatch(read(file), OS_QUERY, `${file} reads reduced motion from the player's choice, not the OS alone`);
}
const RULE = /choice === 'reduce' \|\| \(choice !== 'full' && [^;]*matchMedia[^;]*\(prefers-reduced-motion: reduce\)'\)\.matches/;
assert.match(read('src/ui/modal.ts'), RULE, 'the modal applies the core\'s rule (the choice on :root, else the OS)');
// The shared media player (the fleet takes, the public pages) applies the same rule (BUI-F7 moved the takes onto it).
assert.match(read('src/presentation/mediaPlayer.ts'), /if \(choice === 'reduce' \|\| choice === 'full'\) return choice === 'reduce';\s*return !!query\('\(prefers-reduced-motion: reduce\)'\)\?\.matches;/,
  'the shared media player applies it too');
assert.match(read('src/presentation/mediaPlayer.ts'), /addEventListener\?\.\('cot:accessibility', sync\)/, 'and follow a change of it');
{
  for (const [choice, os, want] of [[undefined, false, false], [undefined, true, true], ['reduce', false, true], ['full', true, false]]) {
    osReduces = os;
    assert.equal(prefersReducedMotion({ dataset: choice ? { motion: choice } : {} }), want,
      `reduced motion with the choice ${choice ?? 'System'} and the OS ${os ? 'reducing' : 'not reducing'}`);
  }
  osReduces = false;
}
// Boot graphs: the game carries the reader and the token selection, never the token table; no public page carries either.
{
  const { staticImportClosure } = await import('../../tools/static-import-closure.mjs');
  const game = staticImportClosure('src/main.ts', { root: ROOT });
  assert.ok(game.has('src/ui/accessibilityPreferences.ts') && game.has('src/ui/tokens/tokenSelection.ts'), 'the game boots the reader');
  // and the build keeps it in the game-only DOM primitives chunk (no extra boot request): vite.config.ts group 'dom'
  assert.match(read('vite.config.ts'), /name: 'dom', test: \/\[\\\\\/\]src\[\\\\\/\]ui\[\\\\\/\]\(\?:dom\|accessibilityPreferences\|tokens\[\\\\\/\]tokenSelection\)/,
    'the reader rides with the DOM primitives chunk');
  for (const lazy of ['src/ui/tokens/tokens.ts', 'src/ui/colorVision.ts', 'src/ui/accessibilitySettings.ts', 'src/ui/accessibilityMotion.ts']) {
    assert.ok(!game.has(lazy), `${lazy} stays out of the game's boot graph`);
  }
  for (const entry of ['src/presentation/publicPages.ts', 'src/presentation/publicNav.ts', 'src/presentation/notFound.ts', 'src/docs/docs.ts', 'src/gallery/gallery.ts']) {
    const closure = staticImportClosure(entry, { root: ROOT });
    for (const core of ['src/ui/accessibilityPreferences.ts', 'src/ui/tokens/tokenSelection.ts', 'src/ui/tokens/tokens.ts']) {
      assert.ok(!closure.has(core), `${entry} does not carry ${core}`);
    }
  }
}
// motion.css (shared with the public pages, unchanged) keeps its plain OS rule: in the game the override above turns it on
// or off with every other prefers-reduced-motion rule, and the tokens follow data-motion from first paint.
assert.match(read('src/ui/motion.css'), /@media \(prefers-reduced-motion: reduce\) \{/);

/* --------------------------------------------------------------------------------------------- 5. the head seed */
assert.ok(html.indexOf(seedMatch[0]) < html.indexOf('src/ui/tokens/tokens.css'), 'ahead of the token sheet');
const records = [
  null, '{broken', {}, DEFAULT_ACCESSIBILITY,
  { colorPreset: 'deutan', highContrast: true, motion: 'reduce', droneStatic: false, textScale: 1.75, hudScale: 1.2, flash: 0.4, shake: 0.2,
    toggles: ['rosters', 'fire', 'bogus'] },
  { colorPreset: 'custom', customOwn: '#3FA0FF', customEnemy: '#ff5a4e', motion: 'full', textScale: 9, hudScale: -1, flash: 'x' },
  { colorPreset: 'custom', customOwn: 'blue', customEnemy: '#ff5a4e' },
  { colorPreset: 'rainbow', highContrast: 'yes', motion: 'slow', textScale: 1, hudScale: 1 },
  { colorPreset: 'tritan', textScale: 0.8, hudScale: 0.75, flash: 0, shake: 7, toggles: 'fire' },
];
for (const record of records) {
  const raw = record === null ? null : typeof record === 'string' ? record : JSON.stringify(record);
  const seeded = fakeRoot();
  seed(raw, seeded);
  const applied = fakeRoot();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch { /* unreadable */ }
  applyAccessibility(normalizeAccessibility(parsed), applied);
  assert.deepEqual(snapshot(seeded), snapshot(applied), `the head seed writes what applyAccessibility writes (${raw})`);
}
applyAccessibility(DEFAULT_ACCESSIBILITY, fakeRoot());
assert.match(read('src/main.ts'), /installResponsiveLayout\(\);[\s\S]{0,600}installAccessibility\(\);/, 'main.ts installs the core at boot');

/* --------------------------------------------------------------------------------------------- 6. boot cost */
// The reader as the game ships it: an entry that uses everything the boot and the lazy modules import from it (so nothing
// is dropped), bundled with what it takes from the token module (tree-shaken), minified, brotli. The settings writer,
// the motion rules and the colour checks are lazy chunks of their own (external here).
let bootBrotli = null;
try {
  const { rolldown } = await import('rolldown');
  const reader = fileURLToPath(new URL('./accessibilityPreferences.ts', import.meta.url));
  const entry = `import * as a from ${JSON.stringify(reader)};a.installAccessibility();`
    + 'globalThis.__cot=[a.A11Y,a.prefersReducedMotion,a.readAccessibilityRoot];';
  const bundle = await rolldown({
    input: 'a11y-boot-entry', logLevel: 'silent',
    plugins: [{
      name: 'a11y-boot-entry',
      resolveId(id) {
        if (id === 'a11y-boot-entry') return id;
        // the lazy chunks, named as the build names them (./name-hash.js)
        const lazy = /(colorVision|accessibilityMotion|accessibilitySettings)\.ts$/.exec(id);
        return lazy ? { id: `./${lazy[1]}-0a1b2c3d.js`, external: true } : null;
      },
      load: (id) => (id === 'a11y-boot-entry' ? entry : null),
    }],
  });
  const { output } = await bundle.generate({ format: 'esm', minify: true });
  await bundle.close();
  const code = output.filter((o) => o.type === 'chunk' && o.isEntry).map((o) => o.code).join('');
  bootBrotli = brotliCompressSync(Buffer.from(code), { params: { [zlib.BROTLI_PARAM_QUALITY]: 11 } }).length;
} catch (error) {
  console.warn(`accessibility core: boot-cost bundle skipped (${error.message})`);
}
if (bootBrotli !== null) assert.ok(bootBrotli <= 1024, `the accessibility reader is ${bootBrotli} B brotli, over PLAN BUI-F9's 1 KB`);

console.log(`accessibility core: record, ${compared} tokens equal to the cascade across ${COLOR_PRESETS.length * 2 * MOTION_MODES.length * 2} `
  + `preset/contrast/motion/OS selections, Custom refusal and re-check, motion rules both ways (late styles included), `
  + `${consumers.length} shake/flash/static consumers, ${records.length} head-seed records${bootBrotli === null ? '' : `, reader ${bootBrotli} B brotli`}; `
  + `${HOLD_ACTIONS.length} hold actions`);
