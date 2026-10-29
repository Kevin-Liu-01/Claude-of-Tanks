import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_BINDINGS } from './input.ts';
import { createBus } from './stateCore.ts';
import { createMobileAutoAimRuntime } from './mobileAutoAimRuntime.ts';
import { PerspectiveCamera, Vector3 } from 'three';

// Round 30 (owner 2026-09-20): "make auto aim a keybind in desktop mode and keybind turning on hitboxes too";
// "the gravity jump should have a little rocket icon and be a lot more powerful, and work even when you're not
// on ground. and make it easier to press in mobile."
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

// --- bindings: T locks the sight, H flips the armour overlay; neither collides with an existing default
assert.equal(DEFAULT_BINDINGS.autoAim, 'KeyT');
assert.equal(DEFAULT_BINDINGS.hitboxOverlay, 'KeyH');
const codes = Object.values(DEFAULT_BINDINGS);
assert.equal(new Set(codes).size, codes.length, 'every default binding is unique');
const input = read('./input.ts');
assert.match(input, /\{ id: 'autoAim', label: 'action.autoAim', group: 'settings.group.combat' \}/, 'auto-aim is a rebindable combat action');
assert.match(input, /\{ id: 'hitboxOverlay', label: 'action.hitboxOverlay', group: 'settings.group.combat' \}/, 'the armour overlay is a rebindable combat action');
for (const catalog of ['../ui/i18nCatalog.en-US.json', '../ui/i18nCatalog.zh-CN.json']) {
  const text = JSON.parse(read(catalog));
  for (const key of ['action.autoAim', 'action.hitboxOverlay', 'hud.alert.armorOverlayOn', 'hud.alert.armorOverlayOff', 'touch.jump', 'touch.jumpAria']) {
    assert.ok(typeof text[key] === 'string' && text[key].length > 0, `${catalog}: ${key}`);
  }
}
const icons = read('../ui/settingsIcons.ts');
assert.match(icons, /autoAim: \{ id: 'autoAim'/, 'the settings panel has an icon for the auto-aim action');
assert.match(icons, /hitboxOverlay: \{ id: 'armorFlashlight' \}/, 'the overlay action reuses the armour flashlight icon');

// --- the key presses reach the battle: the auto-aim toggle and the overlay setting flip
const actions = read('./playerBattleActions.ts');
assert.match(actions, /onAction\('autoAim', \(\) => \{\n\s*if \(!battleInputAllowed\(\)\) return;\n\s*bus\.emit\('ui:autoAimToggle', \{\}\);/, 'T emits the same toggle the touch button does');
assert.match(actions, /onAction\('hitboxOverlay', \(\) => \{[\s\S]*?const on = !input\.getSettings\(\)\.armorAimOverlay;\n\s*input\.setSetting\('armorAimOverlay', on\);\n\s*bus\.emit\('ui:armorOverlayState', \{ on \}\);/, 'H flips the live armour overlay setting and announces it');
const hud = read('../ui/hud.ts');
assert.match(hud, /on\('ui:armorOverlayState', \(\{ on \}\) => \{\n\s*showAlert\(t\(on \? 'hud\.alert\.armorOverlayOn' : 'hud\.alert\.armorOverlayOff'\)/, 'the HUD confirms the overlay state');

// --- the auto-aim runtime no longer needs a touch layout (the runtime receipt covers acquisition)
const runtimeSource = read('./mobileAutoAimRuntime.ts');
assert.doesNotMatch(runtimeSource, /!input\.isTouchLayout\(\)/, 'the layout no longer gates the lock');
const access = read('./mobileBattleInputAccess.ts');
assert.match(access, /if \(!input\.isTouchLayout\(\)\) return autoAim \? Promise\.resolve\(null\) : ensureAutoAim\(\)\.then\(\(\) => null\);/,
  'a desktop layout loads the auto-aim runtime and no touch controls');
{
  const bus = createBus(); const enemy = { id: 'e', team: 'b', state: { pos: new Vector3(0, 0, 10) }, spec: { name: 'E', dims: { heightM: 2 } }, combat: { destroyed: false } };
  const player = { id: 'p', team: 'a', state: { pos: new Vector3() }, spec: { name: 'P', dims: { heightM: 2 } }, combat: { destroyed: false } };
  const runtime = createMobileAutoAimRuntime({ bus, input: { isTouchLayout: () => false }, camera: new PerspectiveCamera(), getPhase: () => 'battle', getTanks: () => [player, enemy], getPlayer: () => player, getTankById: (id) => (id === 'e' ? enemy : player), isVisible: () => true, pickTarget: () => enemy, targetCenter: (tank, out) => out.copy(tank.state.pos) });
  bus.emit('ui:autoAimToggle', {});
  assert.equal(runtime.targetId, 'e', 'a fine-pointer layout acquires the lock');
  runtime.dispose();
}

// The equal-size controls row owns the desktop and touch jump action.
assert.match(hud, /jumpHint.innerHTML = `[^`]*uiIconSVG\('rocket', 18\)[^`]*system-status/, 'jump has its rocket, keycap and status');
assert.match(hud, /setControlsJumpMode\(isJumpMode\(ruleset\)\)/, 'only jump rulesets expose the control');
assert.match(hud, /function setControlsJumpMode\(on:boolean\):void\{\n\s*jumpHint\.classList\.toggle\('on',on\);/, 'the jump flag shows the control');
// the shared control fires the real jump edge through the HUD's one binder (bindControl: a mouse press acts on its
// pointerdown, a touch tap on its release inside the slop; raw hold handlers trip the a11y census)
assert.match(hud, /bindControl\(jumpHint, \(\) => bus\.emit\('ui:selfRight', \{\}\)\)/, 'the shared control fires the real jump edge');
assert.match(hud, /const bindControl = \(button: HTMLButtonElement, act: \(\) => void\): void => \{[\s\S]*?button\.addEventListener\('pointerdown', \(event\) => \{[\s\S]*?if \(event\.pointerType === 'mouse'\) \{ act\(\); return; \}/,
  'a mouse press on the control acts on its pointerdown, the same edge as the F key');
assert.match(hud, /bus.emit\('ui:jumpAvailable', \{ on: false \}\)/, 'the legacy touch button stays hidden to avoid duplicate controls');
const touch = read('../ui/touchControls.ts');
assert.match(touch, /<button class="round jump" type="button" aria-label="\$\{t\('touch\.jumpAria'\)\}" hidden>\$\{ROCKET\}/, 'a hidden rocket button waits in the touch layer');
assert.match(touch, /bus\.on\('ui:jumpAvailable', \(payload\) => \{\n\s*const \{ on \} = payload as \{ on\?: boolean \};\n\s*jumpButton\.hidden = !on;/, 'it appears in rulesets with a jump');
assert.match(touch, /const selfRight = \(\): void => \{ bus\.emit\('ui:selfRight', \{\}\);/, 'the jump is the F key\'s edge: jump upright, flip when overturned');
assert.match(touch, /jumpButton\.addEventListener\('pointerdown', \(e\) => \{\n\s*e\.preventDefault\(\); e\.stopPropagation\(\);\n\s*selfRight\(\);/, 'a press is the same edge as the F key: jump upright, flip when overturned');
assert.match(touch, /\.cot-touch \.jump\{right:134px;bottom:124px;width:84px;height:84px;/, 'the rocket button is as big as the fire button family, above the scope');
const sprite = read('../ui/icons/sprite.svg');
assert.match(sprite, /<symbol id="i-rocket"><path d="M12 2\.5/, 'the shared icon set has a rocket glyph');
// The vehicle-action table (owner 2026-10-25, src/game/vehicleActions.ts; its own receipt proves the table): each row
// tile's keycap is its own binding's, never a shell digit or the old shared E.
assert.equal(DEFAULT_BINDINGS.atgm, 'KeyQ', 'Q is the ATGM on every launcher');
assert.match(input, /\{ id: 'atgm', label: 'systems\.atgm', group: 'settings\.group\.vehicle' \}/, 'the ATGM is a rebindable vehicle action');
for (const [tile, action, fallback] of [['missileKey', 'atgm', 'Q'], ['reloadKey', 'reloadMagazine', 'C'], ['specialKey', 'specialAction', 'E']]) {
  // (?? keeps an empty pad cap empty: || set the keyboard's key over it, tools/battle-key-caps.browser.mjs)
  assert.match(hud, new RegExp(`setText\\(${tile},frame\\.auxiliaryKeyLabels\\.${action} \\?\\? '${fallback}'\\);`), `${tile} names the ${action} binding`);
}
assert.doesNotMatch(read('./battleHudFrameRuntime.ts'), /keys\.missile =/, 'the ATGM no longer takes its shell slot\'s digit');
console.log('battleKeyActions.selftest: T auto-aim and H armour overlay bindings, desktop auto-aim runtime, rocket jump keycap and touch button, and the row tiles\' table keys (Q ATGM, C reload, E suspension)');
