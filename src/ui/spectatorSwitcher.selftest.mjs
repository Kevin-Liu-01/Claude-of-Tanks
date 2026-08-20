import assert from 'node:assert/strict';
import { spectatorCardModel, spectatorSwitcherMarkup } from './spectatorSwitcher.js';

assert.deepEqual(spectatorCardModel({ count: 7, index: 3, specId: 'm1a2_sepv3' }), {
  count: 7,
  index: 3,
  counter: '03 / 07',
  scope: 'Allied vehicle',
  icon: '/icons/m1a2_sepv3_angle.webp',
});
assert.equal(spectatorCardModel({ count: 2, index: 9, allTeams: true }).counter, '02 / 02');
assert.equal(spectatorCardModel({ specId: '../bad' }).icon, '', 'icon paths reject unsafe ids');

const markup = spectatorSwitcherMarkup();
assert.match(markup, /class="portrait"/);
assert.match(markup, /class="cycle prev"/);
assert.match(markup, /class="cycle next"/);
assert.match(markup, /aria-label="Return to garage"/);

console.log('spectatorSwitcher.selftest: compact spectator card model and controls passed');
