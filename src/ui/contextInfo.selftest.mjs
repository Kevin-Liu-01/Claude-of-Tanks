import assert from 'node:assert/strict';
import { resolveInfoImage } from './contextInfo.js';
import { uiIconIds, uiIconSVG } from './uiIcons.js';

assert(uiIconIds().includes('info'), 'the shared UI set owns the info glyph');
assert.match(uiIconSVG('info', 13), /<circle/);
assert.match(uiIconSVG('info', 13), /<path/);

assert.deepEqual(
  resolveInfoImage('/icons/m1a2_angle.webp', {
    alt: 'M1A2 Abrams',
    fit: 'contain',
    caption: 'Vehicle reference',
  }),
  {
    src: '/icons/m1a2_angle.webp',
    alt: 'M1A2 Abrams',
    fit: 'contain',
    caption: 'Vehicle reference',
  },
);

assert.deepEqual(
  resolveInfoImage(() => ({
    src: '/icons/m1a2_armor_side.png',
    alt: 'M1A2 armor diagram',
    fit: 'contain',
    caption: 'Protection',
  })),
  {
    src: '/icons/m1a2_armor_side.png',
    alt: 'M1A2 armor diagram',
    fit: 'contain',
    caption: 'Protection',
  },
);

assert.equal(resolveInfoImage(null), null);
assert.equal(resolveInfoImage({}), null);
assert.equal(resolveInfoImage(() => { throw new Error('unavailable'); }), null);

console.log('contextInfo.selftest: shared info icon and static/live image contracts passed');
