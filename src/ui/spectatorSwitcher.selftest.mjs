import assert from 'node:assert/strict';
import { spectatorCardModel, spectatorSwitcherMarkup } from './spectatorSwitcher.js';

assert.deepEqual(spectatorCardModel({ count: 7, index: 3, specId: 'm1a2_sepv3' }), {
  icon: '/icons/m1a2_sepv3_angle.webp',
  position: '3 / 7',
});
assert.equal(spectatorCardModel({ specId: '../bad' }).icon, '', 'icon paths reject unsafe ids');
assert.equal(spectatorCardModel({ count: 3, index: 8 }).position, '3 / 3', 'position clamps to roster size');

const markup = spectatorSwitcherMarkup();
assert.match(markup, /class="portrait"/);
assert.match(markup, /class="spec-status"/);
assert.match(markup, /class="idx" hidden/);
assert.match(markup, /class="cycle prev"[^>]*>[\s\S]*?<kbd>A<\/kbd><span>Previous<\/span>/);
assert.match(markup, /class="cycle next"[^>]*>[\s\S]*?<kbd>D<\/kbd><span>Next<\/span>/);
assert.match(markup, /aria-label="Return to garage"/);
assert.match(markup, /<svg[^>]*aria-hidden="true"/);
assert.doesNotMatch(markup, /Allied vehicle/);

console.log('spectatorSwitcher.selftest: command-style spectator identity and controls passed');
