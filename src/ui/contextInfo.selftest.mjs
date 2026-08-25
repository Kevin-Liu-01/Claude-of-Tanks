import assert from 'node:assert/strict';
import { resolveInfoImage, resolveInfoImages } from './contextInfo.js';
import { MODAL_FOCUSABLE_SELECTOR, normalizeModalSize } from './modal.js';
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

assert.deepEqual(resolveInfoImages(() => [
  '/icons/m1a2_angle.webp',
  { src: '/icons/m1a2_modules_side.png', fit: 'contain', caption: 'Modules' },
  null,
], { alt: 'M1A2 Abrams' }), [
  { src: '/icons/m1a2_angle.webp', alt: 'M1A2 Abrams', fit: 'cover', caption: '' },
  { src: '/icons/m1a2_modules_side.png', alt: 'M1A2 Abrams', fit: 'contain', caption: 'Modules' },
]);
assert.equal(normalizeModalSize('wide'), 'wide');
assert.equal(normalizeModalSize('unknown'), 'medium');
assert.match(MODAL_FOCUSABLE_SELECTOR, /button:not/);

console.log('contextInfo.selftest: shared modal, info icon, and live media gallery contracts passed');
