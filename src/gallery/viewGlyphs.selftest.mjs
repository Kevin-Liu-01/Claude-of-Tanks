import assert from 'node:assert/strict';
import { CAMERA_VIEW_IDS, cameraViewGlyphSVG } from './viewGlyphs.js';

assert.equal(CAMERA_VIEW_IDS.length, 9);
for (const view of CAMERA_VIEW_IDS) {
  const svg = cameraViewGlyphSVG(view);
  assert.match(svg, /camera-view-glyph__tank/, `${view} keeps the shared tank plan`);
  assert.match(svg, /aria-hidden="true"/, `${view} is decorative`);
}
assert.match(cameraViewGlyphSVG('front'), /cy="2.5"/);
assert.match(cameraViewGlyphSVG('left'), /cx="2.5"/);
assert.match(cameraViewGlyphSVG('right'), /cx="21.5"/);
assert.match(cameraViewGlyphSVG('top'), /camera-view-glyph__focus/);
assert.match(cameraViewGlyphSVG('auto'), /camera-view-glyph__orbit/);
assert.throws(() => cameraViewGlyphSVG('unknown'), /Unknown camera view/);

console.log('viewGlyphs.selftest: coherent camera-view glyph family passed');
