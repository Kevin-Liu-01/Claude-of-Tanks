import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import './overlays.selftest.mjs';

const css = readFileSync(new URL('./gallery.css', import.meta.url), 'utf8');

assert.match(
  css,
  /\.viewer-bottom-console \.mode-dock\{[^}]*width:min\(800px,100%\)[^}]*grid-template-columns:168px repeat\(5,minmax\(0,1fr\)\)/,
  'desktop diagnostic dock must reserve enough width for its label and five modes',
);
assert.match(
  css,
  /\.mode-dock>p>span\{[^}]*min-width:0[^}]*white-space:nowrap/,
  'diagnostic dock heading must stay on one line without overlapping its info control',
);
assert.match(
  css,
  /\.mode-dock>button span\{[^}]*min-width:0[^}]*white-space:nowrap/,
  'diagnostic mode titles and subtitles must not wrap or clip',
);
assert.match(
  css,
  /:where\(body\[data-cot-width='laptop'\],[\s\S]*?\.viewer-bottom-console \.mode-dock\{grid-template-columns:150px repeat\(5,minmax\(0,1fr\)\)\}/,
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
assert.doesNotMatch(css, /@media[^\n]*(?:width|height|orientation)/,
  'Gallery layout must consume semantic viewport attributes instead of device media queries');
assert.match(css, /data-cot-width='phone'\] \.view-controls\{grid-template-columns:repeat\(5,minmax\(44px,1fr\)\);grid-template-rows:repeat\(2,44px\)/,
  'phone controls must recompose all ten inspection actions into a two-row touch grid');
assert.match(css, /data-cot-height='short'\]\[data-cot-orientation='landscape'\][\s\S]*\.viewer\{[\s\S]*height:calc\(100dvh - 56px\);min-height:300px/,
  'short landscape Gallery viewports must fit the live viewer into the available height');

console.log('modeDockLayout.selftest: single-line diagnostic labels and responsive dock widths pass');
