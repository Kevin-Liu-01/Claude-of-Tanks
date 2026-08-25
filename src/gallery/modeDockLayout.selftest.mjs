import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('./gallery.css', import.meta.url), 'utf8');

assert.match(
  css,
  /\.viewer-bottom-console \.mode-dock\{[^}]*width:min\(760px,100%\)[^}]*grid-template-columns:148px repeat\(5,minmax\(0,1fr\)\)/,
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
  /:where\(body\[data-cot-width='laptop'\],[\s\S]*?\.viewer-bottom-console \.mode-dock\{grid-template-columns:132px repeat\(5,minmax\(0,1fr\)\)\}/,
  'compact desktop dock must retain a readable diagnostic label column',
);
assert.doesNotMatch(css, /@media[^\n]*(?:width|height|orientation)/,
  'Gallery layout must consume semantic viewport attributes instead of device media queries');
assert.match(css, /data-cot-width='phone'\] \.view-controls\{grid-template-columns:repeat\(5,minmax\(44px,1fr\)\);grid-template-rows:repeat\(2,44px\)/,
  'phone controls must recompose all ten inspection actions into a two-row touch grid');
assert.match(css, /data-cot-height='short'\]\[data-cot-orientation='landscape'\][\s\S]*\.viewer\{[\s\S]*height:calc\(100dvh - 56px\);min-height:300px/,
  'short landscape Gallery viewports must fit the live viewer into the available height');

console.log('modeDockLayout.selftest: single-line diagnostic labels and responsive dock widths pass');
