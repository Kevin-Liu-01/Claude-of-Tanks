import assert from 'node:assert/strict';
import { battleControlHintGroups } from './settings.js';

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

console.log('settingsControls.selftest: dedicated and contextual free-look references passed');
