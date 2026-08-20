import assert from 'node:assert/strict';
import { spectatorCardModel, spectatorSwitcherMarkup } from './spectatorSwitcher.js';

assert.deepEqual(spectatorCardModel({ count: 7, index: 3, specId: 'm1a2_sepv3' }), {
  icon: '/icons/m1a2_sepv3_angle.webp',
});
assert.equal(spectatorCardModel({ specId: '../bad' }).icon, '', 'icon paths reject unsafe ids');

const markup = spectatorSwitcherMarkup();
assert.match(markup, /class="portrait"/);
assert.match(markup, /class="cycle prev"[^>]*><kbd[^>]*>A<\/kbd><span[^>]*>Previous<\/span>/);
assert.match(markup, /class="cycle next"[^>]*><kbd[^>]*>D<\/kbd><span[^>]*>Next<\/span>/);
assert.match(markup, /aria-label="Return to garage"/);
assert.doesNotMatch(markup, /status|counter|Allied vehicle/);
assert.doesNotMatch(markup, /<div class="portrait"[^>]*><img[^>]*><span/);

console.log('spectatorSwitcher.selftest: clean spectator identity and controls passed');
