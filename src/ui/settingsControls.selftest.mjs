import assert from 'node:assert/strict';
import { getLocale, setLocale } from './i18n.ts';
import { battleControlHintGroups } from './settings.ts';
import { SETTINGS_ACTION_ICONS, SETTINGS_OPTION_ICONS } from './settingsIcons.ts';
import { uiIconIds, uiIconSVG } from './uiIcons.ts';

const originalLocale = getLocale();
setLocale('en-US');

const holdGroups = battleControlHintGroups('hold');
assert.deepEqual(holdGroups.find(([label]) => label === 'Gun Hold'),
  ['Gun Hold', ['freeLook']],
  'compact controls reference includes the dedicated remappable gun-hold action');
assert.deepEqual(holdGroups.find(([, actionIds]) => actionIds[0] === 'freeCamera'),
  ['Aim', ['freeCamera']],
  'default RMB role stays distinct from dedicated gun hold');

const classicGroups = battleControlHintGroups('freelook');
assert.deepEqual(classicGroups.find(([, actionIds]) => actionIds[0] === 'freeCamera'),
  ['Gun Hold', ['freeCamera']],
  'controls reference follows the selected RMB behavior');

const iconIds = new Set(uiIconIds());
for (const action of ['smoke', 'lights', 'roofGun']) assert.ok(SETTINGS_ACTION_ICONS[action]);
// round 30 (2026-09-20): autoAim (T) and hitboxOverlay (H) join the remappable actions with their own icons;
// multiplayer v2 status surface (2026-09-26): networkPanel (F3) and leaveBattle (F4) join them
assert.equal(Object.keys(SETTINGS_ACTION_ICONS).length, 31,
  'every remappable action has a settings icon');
// sfx engine redesign (2026-10-02): crew-radio language and the concussion toggle join the sound tab
assert.deepEqual(Object.keys(SETTINGS_OPTION_ICONS).sort(), [
  'aiDifficulty', 'aimSmoothing', 'alarmHeartbeat', 'armorAimOverlay', 'audioConcussion', 'crewVoice',
  'graphicsQuality', 'hideBattleUi', 'invertY', 'isometricView', 'padSensitivity', 'rmbMode', 'sensitivity',
  'showDebugHud', 'showDirectionalHitValues', 'showPerfMeter', 'sniperSensScale', 'volAmbience',
  'volCombat', 'volEngine', 'volMaster', 'volUi', 'volVoice',
].sort(), 'every gameplay, sound, and graphics option has a settings icon');

for (const [key, spec] of Object.entries({ ...SETTINGS_ACTION_ICONS, ...SETTINGS_OPTION_ICONS })) {
  assert.ok(iconIds.has(spec.id), `${key} references a shared UI icon`);
  assert.match(uiIconSVG(spec.id, 16), /^<svg[\s\S]*<\/svg>$/, `${key} renders valid inline SVG`);
}
assert.deepEqual([
  SETTINGS_ACTION_ICONS.shell1.badge,
  SETTINGS_ACTION_ICONS.shell2.badge,
  SETTINGS_ACTION_ICONS.shell3.badge,
], ['1', '2', '3'], 'shell icons keep their slot identity');
const armorSvg = uiIconSVG(SETTINGS_OPTION_ICONS.armorAimOverlay.id, 16);
for (const color of ['#d95b54', '#e3a53b', '#63c77a']) {
  assert.ok(armorSvg.includes(color), `armor flashlight icon includes ${color}`);
}

console.log('settingsControls.selftest: controls references and exhaustive setting icons passed');
setLocale(originalLocale);
