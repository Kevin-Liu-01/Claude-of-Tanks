import assert from 'node:assert/strict';
import { summarizeTeam } from './endScreen.js';

const summary = summarizeTeam([
  { dead: false, kills: 2, dmg: 1_480 },
  { dead: true, kills: 1, dmg: 720 },
  { dead: false, kills: 0, dmg: 0 },
]);

assert.deepEqual(summary, {
  total: 3,
  alive: 2,
  kills: 3,
  damage: 2_200,
});

assert.deepEqual(summarizeTeam([]), {
  total: 0,
  alive: 0,
  kills: 0,
  damage: 0,
});

assert.deepEqual(summarizeTeam([
  { dead: true, kills: -3, dmg: Number.NaN },
]), {
  total: 1,
  alive: 0,
  kills: 0,
  damage: 0,
});

console.log('endScreen summary selftest: PASS');
