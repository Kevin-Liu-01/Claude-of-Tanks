import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { viewportQueryViolations } from '../ui/viewportQueries.test-support.mjs';

const css = readFileSync(new URL('./gallery.css', import.meta.url), 'utf8');

assert.match(
  css,
  /\.viewer-bottom-console \.mode-dock\{[^}]*width:min\(800px,100%\)[^}]*grid-template-columns:168px repeat\(5,minmax\(0,1fr\)\)/,
  'desktop diagnostic dock must reserve enough width for its label and five modes',
);
// at the 11 px type floor the heading wraps inside its own grid cell (icon | heading | info), so it
// can never run under the info control; the subtitles that no longer fit a mode button legibly are hidden, not clipped.
assert.match(
  css,
  /\.mode-dock>p\{display:grid;grid-template-columns:20px minmax\(0,1fr\) 20px;/,
  'diagnostic dock heading keeps its own grid column between the icon and the info control',
);
assert.match(
  css,
  /\.mode-dock>p>span\{[^}]*min-width:0[^}]*white-space:normal/,
  'diagnostic dock heading wraps inside its column instead of overlapping its info control',
);
assert.match(css, /\.mode-dock>button small\{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset\(50%\)/,
  'mode subtitles leave the picture (the icons and names carry the mode) but stay in each button\'s accessible name');
assert.match(
  css,
  /\.mode-dock>button span\{[^}]*min-width:0[^}]*white-space:nowrap/,
  'diagnostic mode titles and subtitles must not wrap or clip',
);
assert.match(
  css,
  /@media \(width < 1440px\)\{[^}]*\}[\s\S]*?\.viewer-bottom-console \.mode-dock\{grid-template-columns:150px repeat\(5,minmax\(0,1fr\)\)\}/,
  'compact desktop dock must retain a readable diagnostic label column',
);
assert.match(
  css,
  /\.view-controls\{[^}]*grid-template-columns:112px repeat\(9,minmax\(34px,1fr\)\)[^}]*width:min\(760px,calc\(100% - 28px\)\)/,
  'desktop camera controls must reserve separate space for Tank views and its info control',
);
assert.doesNotMatch(
  css,
  /(?:mode-dock button|vehicle-card|panel-heading|archive-filters|dossier-section|gallery-select-option\[aria-selected="true"\])(?:::[a-z]+|\.active::before)[^{]*\{[^}]*height:(?:12|15|16)px/,
  'selection states must not use clipped decorative border fragments',
);
// brand-ui SPEC §5.5: the page lays out at first paint from media queries at responsiveLayout.ts's band edges
assert.deepEqual(viewportQueryViolations(css, 'gallery.css'), [],
  'Gallery layout keeps the one viewport contract (the bands of responsiveLayout.ts) as media queries');
assert.match(css, /@media \(width < 520px\)\{:root body \.view-controls\{grid-template-columns:repeat\(5,minmax\(44px,1fr\)\);grid-template-rows:repeat\(2,44px\)/,
  'phone controls must recompose all ten inspection actions into a two-row touch grid');
assert.match(css, /@media \(height < 520px\) and \(aspect-ratio >= 1\/1\)\{[\s\S]*\.viewer\{[\s\S]*height:calc\(var\(--cot-viewport-height,100dvh\) - 56px\);min-height:300px/,
  'short landscape Gallery viewports must fit the live viewer into the available height');

console.log('modeDockLayout.selftest: diagnostic labels in their own columns (no clip, no overlap) and responsive dock widths pass');
