import assert from 'node:assert/strict';
import { battleControlHintGroups } from './settings.js';
import { SETTINGS_ACTION_ICONS, SETTINGS_OPTION_ICONS } from './settingsIcons.ts';
import { uiIconIds, uiIconSVG } from './uiIcons.ts';

const holdGroups = battleControlHintGroups('hold');
assert.deepEqual(holdGroups.find(([label]) => label === 'Free Look'),
  ['Free Look', ['freeLook']],
  'compact controls reference includes the dedicated remappable free-look action');
assert.deepEqual(holdGroups.find(([, actionIds]) => actionIds[0] === 'freeCamera'),
  ['Aim', ['freeCamera']],
  'default RMB role stays distinct from dedicated free look');

const classicGroups = battleControlHintGroups('freelook');
assert.deepEqual(classicGroups.find(([, actionIds]) => actionIds[0] === 'freeCamera'),
  ['Free Look', ['freeCamera']],
  'controls reference follows the selected RMB behavior');

const iconIds = new Set(uiIconIds());
assert.equal(Object.keys(SETTINGS_ACTION_ICONS).length, 23,
  'every remappable action has a settings icon');
assert.deepEqual(Object.keys(SETTINGS_OPTION_ICONS).sort(), [
  'aiDifficulty', 'aimSmoothing', 'alarmHeartbeat', 'armorAimOverlay',
  'graphicsQuality', 'invertY', 'padSensitivity', 'rmbMode', 'sensitivity',
  'showDebugHud', 'showPerfMeter', 'sniperSensScale', 'volAmbience',
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
