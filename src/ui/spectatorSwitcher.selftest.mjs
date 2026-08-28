import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spectatorCardModel, spectatorSwitcherMarkup } from './spectatorSwitcher.ts';

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
assert.match(markup, /class="cycle prev"[^>]*>[\s\S]*?<kbd aria-hidden="true">A<\/kbd>/);
assert.match(markup, /class="cycle next"[^>]*>[\s\S]*?<kbd aria-hidden="true">D<\/kbd>/);
assert.ok(markup.indexOf('>A</kbd>') < markup.indexOf('>D</kbd>'), 'A and D shortcuts share one horizontal control row');
assert.match(markup, /aria-label="Return to garage"/);
assert.match(markup, /<svg[^>]*aria-hidden="true"/);
assert.doesNotMatch(markup, /Allied vehicle/);
assert.doesNotMatch(markup, /portrait-mark/, 'spectator strip omits decorative corner brackets');

const hudSource = readFileSync(new URL('./hud.js', import.meta.url), 'utf8');
assert.doesNotMatch(hudSource, /\.cot-spec \.portrait::after/,
  'spectator portrait omits the decorative diagonal overlay');
assert.match(hudSource, /\.cot-spec\{[^}]*bottom:16px;/,
  'spectator switcher shares the minimap bottom safe-area padding');

console.log('spectatorSwitcher.selftest: command-style spectator identity and controls passed');
