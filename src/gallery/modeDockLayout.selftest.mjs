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
  /@media\(max-width:1280px\)\{[\s\S]*?\.viewer-bottom-console \.mode-dock\{grid-template-columns:132px repeat\(5,minmax\(0,1fr\)\)\}/,
  'compact desktop dock must retain a readable diagnostic label column',
);

console.log('modeDockLayout.selftest: single-line diagnostic labels and responsive dock widths pass');
