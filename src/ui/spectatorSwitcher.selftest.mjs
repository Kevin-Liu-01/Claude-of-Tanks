import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spectatorCardModel, spectatorSwitcherMarkup, spectatorSwitcherStyles } from './spectatorSwitcher.ts';

assert.deepEqual(spectatorCardModel({ count: 7, index: 3, specId: 'm1a1_abrams_fep' }), {
  icon: '/icons/m1a1_abrams_fep_angle.webp',
  position: '3 / 7',
});
assert.equal(spectatorCardModel({ specId: '../bad' }).icon, '', 'icon paths reject unsafe ids');
assert.equal(spectatorCardModel({ count: 3, index: 8 }).position, '3 / 3', 'position clamps to roster size');

const markup = spectatorSwitcherMarkup();
assert.match(markup, /class="portrait"/);
assert.doesNotMatch(markup, /cursor-hint/, 'no how-to line: the bar says what it is (INTERACTION-REDESIGN C)');
assert.match(markup, /class="spec-status"/);
assert.match(markup, /class="idx"[^>]* hidden/);
assert.match(markup, /class="cycle prev"[^>]*>[\s\S]*?<kbd>A<\/kbd><kbd>Q<\/kbd>/);
assert.match(markup, /class="cycle next"[^>]*>[\s\S]*?<kbd>D<\/kbd><kbd>E<\/kbd>/);
// (death-flow-275) one plate: the step back, the watched tank, the step on, in that order
assert.ok(markup.indexOf('cycle prev') < markup.indexOf('class="subject"') && markup.indexOf('class="subject"') < markup.indexOf('cycle next'),
  'the watched tank between its two steps');
// (death-flow-275) A / Q back, D / E on: both pairs are named to assistive technology
assert.match(markup, /class="cycle prev"[^>]*aria-keyshortcuts="A Q"/);
assert.match(markup, /class="cycle next"[^>]*aria-keyshortcuts="D E"/);
assert.ok(markup.indexOf('>Q</kbd>') < markup.indexOf('>E</kbd>'), 'Q and E, Watch\'s keys, share one horizontal control row');
assert.match(markup, /aria-label="Return to garage"/);
assert.match(markup, /<svg[^>]*aria-hidden="true"/);
assert.doesNotMatch(markup, /Allied vehicle/);
assert.doesNotMatch(markup, /portrait-mark/, 'spectator strip omits decorative corner brackets');

const hudSource = readFileSync(new URL('./hud.ts', import.meta.url), 'utf8');
assert.doesNotMatch(hudSource, /\.cot-spec \.portrait::after/,
  'spectator portrait omits the decorative diagonal overlay');
assert.match(spectatorSwitcherStyles, /\.cot-spec\{[^}]*bottom:16px;/,
  'spectator switcher shares the minimap bottom safe-area padding');

console.log('spectatorSwitcher.selftest: command-style spectator identity and controls passed');
