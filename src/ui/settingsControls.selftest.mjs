import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getLocale, setLocale, t } from './i18n.ts';
import { battleControlHintGroups } from './settings.ts';
import { SETTINGS_ACTION_ICONS, SETTINGS_OPTION_ICONS } from './settingsIcons.ts';
import { uiIconIds, uiIconSVG } from './uiIcons.ts';
import { FLIGHT_ACTIONS, VEHICLE_ACTIONS } from '../game/vehicleActions.ts';

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
// the vehicle-action table (owner 2026-10-25, src/game/vehicleActions.ts): the ATGM (Q) joins them, and every vehicle and
// flight action wears the table's glyph, as the HUD's controls row and the Garage do
assert.equal(Object.keys(SETTINGS_ACTION_ICONS).length, 38,
  'every remappable action has a settings icon');
for (const def of [...VEHICLE_ACTIONS, ...FLIGHT_ACTIONS].filter((entry) => entry.binding !== 'selfRight')) {
  assert.equal(SETTINGS_ACTION_ICONS[def.binding].id, def.glyph, `${def.binding} wears the table's ${def.glyph}`);
  assert.ok(iconIds.has(def.glyph), `${def.glyph} is in the shared set`);
}
// sfx engine redesign (2026-10-02): crew-radio language and the concussion toggle join the sound tab; the time of day
// is a row of its own (gauntlet 250)
// (battle-camera-264) the chase camera's five settings join the gameplay tab
assert.deepEqual(Object.keys(SETTINGS_OPTION_ICONS).sort(), [
  'aiDifficulty', 'aimSmoothing', 'alarmHeartbeat', 'armorAimOverlay', 'audioConcussion', 'battleTimes',
  'cameraDistance', 'cameraFov', 'cameraFraming', 'cameraHeight', 'cameraShoulder', 'crewVoice',
  'foliageSeeThrough', 'graphicsQuality', 'hideBattleUi', 'invertY', 'isometricView', 'padSensitivity', 'rmbMode', 'sensitivity',
  'showDebugHud', 'showDirectionalHitValues', 'showPerfMeter', 'sniperSensScale', 'volAmbience',
  'volCombat', 'volEngine', 'volMaster', 'volUi', 'volVoice',
].sort(), 'every gameplay, sound, and graphics option has a settings icon');

// battle-camera-264 (owner 2026-10-28: "be able to change and alter this camera angle as u like in settins"): the
// Gameplay tab's Camera card, the panel's own slider (its range and number field, both named) for height, distance,
// framing and field of view at their ranges, the kit's segmented control for the shoulder, and a named reset on each row
{
  const source = readFileSync(new URL('./settings.ts', import.meta.url), 'utf8');
  assert.match(source, /cameraCard\(body\);/, 'the Gameplay tab carries the Camera card');
  for (const key of ['cameraHeight', 'cameraDistance', 'cameraFraming', 'cameraFov']) {
    assert.match(source, new RegExp(String.raw`slider\(t\('settings\.camera\.[a-z]+'\), '${key}'`), `${key} is a slider row`);
  }
  assert.match(source, /const \[min, max\] = CHASE_CAMERA_RANGES\[key\];/, 'each slider spans its setting\'s range (chaseFraming.ts)');
  assert.match(source, /segmented\(\{ label: shoulderLabel, className: 'cot-set-shoulder'/, 'the shoulder is the kit\'s segmented control');
  assert.match(source, /el\('button', 'cot-c-btn cot-c-btn--36 cot-c-btn--icon cot-c-btn--quiet cot-set-reset', host\);/,
    'each row\'s reset is the kit\'s quiet icon button (by its classes: the factory stays off the Gallery\'s boot chunk)');
  assert.match(source, /reset\.setAttribute\('aria-label', t\('settings\.camera\.reset', \{ label \}\)\);/, 'named for its row');
  assert.match(source, /input\.setSetting\(key, CHASE_CAMERA_DEFAULTS\[key\]\);/, 'a reset returns the setting to its default');
  assert.match(source, /range\.setAttribute\('aria-label', label\);/, 'a slider\'s range is named');
  for (const [key, en] of [['title', 'Camera'], ['height', 'Camera height'], ['distance', 'Camera distance'], ['shoulder', 'Camera shoulder'],
    ['framing', 'Vertical framing'], ['fov', 'Field of view'], ['shoulderLeft', 'Left'], ['shoulderCentre', 'Center'],
    ['shoulderRight', 'Right']]) assert.equal(t(`settings.camera.${key}`), en);
  assert.equal(t('settings.camera.reset', { label: 'Field of view' }), 'Reset Field of view to default');
  const zh = JSON.parse(readFileSync(new URL('./i18nCatalog.zh-CN.json', import.meta.url), 'utf8'));
  for (const key of ['title', 'height', 'distance', 'shoulder', 'shoulderLeft', 'shoulderCentre', 'shoulderRight', 'framing', 'fov',
    'reset', 'unitMetres', 'note']) {
    assert.ok(zh[`settings.camera.${key}`] && zh[`settings.camera.${key}`] !== t(`settings.camera.${key}`), `zh-CN translates settings.camera.${key}`);
  }
  assert.match(zh['settings.camera.reset'], /\{label\}/, 'the zh reset keeps its placeholder');
}

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
assert.match(armorSvg, /href="#i-armorFlashlight-s"/, 'the armour overlay draws its own glyph (its 16-unit master: item 259)');
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
  // (owner 2026-10-25: "only make it come up when its needed") the strip shows the groups still unused; each leaves as
  // its control is pressed and stays learned; the strip leaves at the player's first engagement and with a kill cam
  assert.match(source, /const HINT_GROUP_IDS = \['move', 'fire', 'aim', 'sniper', 'menu'\] as const;/, 'one id per group, in the strip\'s order');
  assert.match(source, /if \(record\.battles >= HINT_BATTLES \|\| HINT_GROUP_IDS\.every\(\(id\) => record\.learned\.has\(id\)\)\) return false;/,
    'a player who has used every control sees no strip');
  assert.match(source, /\.filter\(\(\{ id \}\) => !record\.learned\.has\(id\)\)/, 'only the groups still unused show');
  assert.match(source, /hintListeners\.push\(input\.onAction\(action, \(\) => learnHint\(id\)\)\)/, 'a group leaves as its control is pressed');
  assert.match(source, /bus\.on\('ui:playerEngaged', \(\) => fadeHints\(\)\);/, 'the first engagement ends the strip');
  assert.match(source, /bus\.on\('killcam:begin', \(\) => \{\s*kcReplay = true;\s*hideResumeVeil\(\);\s*hideHints\(\);/, 'a kill cam ends the strip');
  // the resume veil's hide writes only when the veil is up: updateGear's 150 ms sweep calls it in every state, and a
  // classList.remove of an absent class still rewrites the attribute (266; the idle census in
  // tools/hud-self-measure.browser.selftest.mjs fails on any attribute a page at rest keeps rewriting)
  assert.match(source, /function hideResumeVeil\(\) \{\s*if \(resume\.classList\.contains\('show'\)\) resume\.classList\.remove\('show'\);/,
    'the veil\'s hide is a no-op while the veil is down');
  assert.match(source, /setInterval\(updateGear, 150\);/, 'the sweep it guards is still the 150 ms one');
  // its seat: over the vehicle-controls row (battleHudLayout.ts); never over the scope, a flight, Watch or a spectated battle
  // (gauntlet r3: the planner's place, over the rack's centre or beside the speedometer, battleHudLayout.ts hintsPlace)
  assert.match(source, /\.cot-hints\{position:fixed;left:var\(--hud-hints-x,50%\);top:var\(--hud-hints-bottom,calc\(var\(--hud-systems-top,/, 'the strip seats over the controls row');
  assert.match(source, /body\.cot-hud-aerial \.cot-hints,html\[data-cot-scoped\] \.cot-hints,html\[data-watch\] \.cot-hints,body\.cot-spectating \.cot-hints\{display:none;\}/,
    'the scope, a flight, Watch and spectating hide the strip');
}

console.log('settingsControls.selftest: controls references and exhaustive setting icons passed');
setLocale(originalLocale);
