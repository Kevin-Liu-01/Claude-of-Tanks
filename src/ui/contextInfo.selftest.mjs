import assert from 'node:assert/strict';
import { INFO_GUIDE_DIAGRAMS } from './infoGuideCatalog.ts';
import { guideDiagram } from './infoGuides.ts';
import { CATALOG } from './i18nCatalog.ts';
import { CAMO_PAINT_BONUS, combineCamo } from '../sim/spotting.ts';
import { resolveInfoImage, resolveInfoImages } from './contextInfo.ts';
import { MODAL_FOCUSABLE_SELECTOR, normalizeModalSize } from './modal.ts';
import { uiIconIds, uiIconSVG } from './uiIcons.ts';

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

// Every registered guide must have a complete, independently localized explanation
// and all three diagram targets, so a caller cannot open a blank chapter.
const drawings = new Set();
for (const id of Object.keys(INFO_GUIDE_DIAGRAMS)) {
  const svg = guideDiagram(id);
  assert.ok(svg.length > 150, `${id}: missing diagram`);
  for (let step = 0; step < 3; step++) {
    assert.ok(svg.includes(`data-part="${step}"`), `${id}: chapter target ${step}`);
    for (const dictionary of Object.values(CATALOG)) {
      for (const suffix of ['title', 'body', 'label']) {
        assert.ok(dictionary[`fieldGuide.${id}.${step}.${suffix}`]?.trim(), `${id}: missing localized ${suffix}`);
      }
      assert.ok(dictionary[`fieldGuide.${id}.overview`]?.trim());
    }
  }
  assert.ok(!drawings.has(svg), `${id}: unrelated topics must not share decorative diagrams`);
  drawings.add(svg);
}
assert.ok(Math.abs(CAMO_PAINT_BONUS * 100 - 3.5) < 1e-10);
assert.ok(Math.abs(combineCamo({ base: .2, paint: CAMO_PAINT_BONUS }) - .235) < 1e-10);
assert.ok(combineCamo({ base: .2, paint: CAMO_PAINT_BONUS, bloom: 1 }) < .235);
for (const dictionary of Object.values(CATALOG)) assert.match(dictionary['fieldGuide.camo.0.body'], /3\.5/);
console.log(`contextInfo.selftest: ${drawings.size} illustrated guides, chapter targets, locale coverage and paint explanation passed`);
