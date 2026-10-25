import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getLocale, setLocale, t } from './i18n.ts';
import { battleControlHintGroups } from './settings.ts';
import { SETTINGS_ACTION_ICONS, SETTINGS_OPTION_ICONS } from './settingsIcons.ts';
import { uiIconIds, uiIconSVG } from './uiIcons.ts';

const originalLocale = getLocale();
setLocale('en-US');

// (247) the first-battle strip: driving, the gun, the right button's role (by the setting), the sight and the menu; the
// tray's tiles carry the shell and consumable caps, so the strip names none of them
const holdGroups = battleControlHintGroups('hold');
assert.deepEqual(holdGroups.map(([, actionIds]) => actionIds[0]), ['forward', 'fire', 'freeCamera', 'sniperToggle', 'settingsMenu'],
  'the strip keeps the first battle\'s essentials');
assert.deepEqual(holdGroups.find(([, actionIds]) => actionIds[0] === 'freeCamera'),
  ['Aim', ['freeCamera']],
  'default RMB role stays distinct from dedicated gun hold');

const classicGroups = battleControlHintGroups('freelook');
assert.deepEqual(classicGroups.find(([, actionIds]) => actionIds[0] === 'freeCamera'),
  ['Gun Hold', ['freeCamera']],
  'controls reference follows the selected RMB behavior');
assert.ok(!holdGroups.some(([, actionIds]) => actionIds.some((id) => /^(shell|consumable)\d$/.test(id))),
  'the strip leaves the tray\'s keys to the tray');

const iconIds = new Set(uiIconIds());
for (const action of ['smoke', 'lights', 'roofGun', 'drone', 'aerialVision']) assert.ok(SETTINGS_ACTION_ICONS[action]);
// round 30 (2026-09-20): autoAim (T) and hitboxOverlay (H) join the remappable actions with their own icons;
// multiplayer v2 status surface (2026-09-26): networkPanel (F3) and leaveBattle (F4) join them;
// six battle modes (2026-10-02): the drone launch (V) joins them; the proving ground (2026-10-20): its reset (R) and
// moving targets (Y) join them
for (const action of ['rangeReset', 'rangeMoving']) assert.ok(iconIds.has(SETTINGS_ACTION_ICONS[action].id), `${action} wears an icon of the shared set`);
assert.equal(Object.keys(SETTINGS_ACTION_ICONS).length, 37,
  'every remappable action has a settings icon');
// sfx engine redesign (2026-10-02): crew-radio language and the concussion toggle join the sound tab; the time of day
// is a row of its own (gauntlet 250)
assert.deepEqual(Object.keys(SETTINGS_OPTION_ICONS).sort(), [
  'aiDifficulty', 'aimSmoothing', 'alarmHeartbeat', 'armorAimOverlay', 'audioConcussion', 'battleTimes', 'crewVoice',
  'graphicsQuality', 'hideBattleUi', 'invertY', 'isometricView', 'padSensitivity', 'rmbMode', 'sensitivity',
  'showDebugHud', 'showDirectionalHitValues', 'showPerfMeter', 'sniperSensScale', 'volAmbience',
  'volCombat', 'volEngine', 'volMaster', 'volUi', 'volVoice',
].sort(), 'every gameplay, sound, and graphics option has a settings icon');

for (const [key, spec] of Object.entries({ ...SETTINGS_ACTION_ICONS, ...SETTINGS_OPTION_ICONS })) {
  assert.ok(iconIds.has(spec.id), `${key} references a shared UI icon`);
  assert.match(uiIconSVG(spec.id, 16), /^<svg[\s\S]*<\/svg>$/, `${key} renders valid inline SVG`);
}
// the shell slots' number is their label's (Shell slot 1), not a badge over the glyph (gauntlet 250: a badge read as a
// stray accent chip against the label)
assert.ok(['shell1', 'shell2', 'shell3'].every((id) => !('badge' in SETTINGS_ACTION_ICONS[id])), 'shell slots carry no badge');
// The armour-overlay glyph follows the one icon rule (brand-ui BUI-F4): drawn once in the sprite, coloured by its
// row's tone through currentColor, never with baked thickness colours.
const armorSvg = uiIconSVG(SETTINGS_OPTION_ICONS.armorAimOverlay.id, 16);
assert.match(armorSvg, /href="#i-armorFlashlight"/, 'the armour overlay draws its own glyph');
assert.doesNotMatch(armorSvg, /#[0-9a-f]{6}/i, 'the armour overlay glyph carries no baked colour');

// (watch-mode-243 follow-up; 247) the pause veil is one plate: its title, Resume, and Settings with the menu's current
// key, whose cap the touch layout hides (a touch layout taps); no line of instructions, so no em dash
{
  const source = readFileSync(new URL('./settings.ts', import.meta.url), 'utf8');
  assert.match(source, /resumeSettingsKey\.textContent = bindLabel\('settingsMenu'\);/,
    'the veil\'s Settings names the menu\'s bound key when it shows');
  assert.match(source, /cot-c-btn--primary rz-go">\$\{t\('settings\.pauseResume'\)\}/, 'Resume is the veil\'s one primary');
  assert.doesNotMatch(source, /settings\.pauseSub/, 'the veil carries no instruction line');
  assert.equal(t('settings.pauseResume'), 'Resume');
  // the first battles show the strip at the rollout, and only on a keyboard and mouse
  assert.match(source, /bus\.on\('battle:rollout', \(\) => \{ if \(!open && takeFirstBattleHint\(\)\) showHints\(\); \}\);/,
    'the rollout shows the first battles\' strip');
  assert.match(source, /if \(input\.isTouchLayout\?\.\(\) \|\| input\.isPadConnected\(\)\) return false;/,
    'a touch layout and a pad show no keyboard caps');
}

console.log('settingsControls.selftest: controls references and exhaustive setting icons passed');
setLocale(originalLocale);
