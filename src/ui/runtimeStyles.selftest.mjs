import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [main, garageSource, responsiveCss, garageCss] = await Promise.all([
  readFile(new URL('../main.js', import.meta.url), 'utf8'),
  readFile(new URL('./garage.js', import.meta.url), 'utf8'),
  readFile(new URL('./responsiveSurfaces.css', import.meta.url), 'utf8'),
  readFile(new URL('./garage.css', import.meta.url), 'utf8'),
]);

const responsiveImport = main.indexOf("import './ui/responsiveSurfaces.css';");
const garageImport = main.indexOf("import './ui/garage.css';");
const garageRuntimeImport = main.indexOf("from './ui/garage.js';");

assert.ok(responsiveImport >= 0, 'composition root must own responsive styles');
assert.ok(garageImport > responsiveImport,
  'responsive styles must precede Garage styles to preserve the established cascade');
assert.ok(garageRuntimeImport > garageImport,
  'Garage code must load after its explicitly ordered static styles');
assert.doesNotMatch(garageSource, /GARAGE_CSS|cot-garage-style|ensureStyle\(/,
  'Garage must not parse or inject its static stylesheet from JavaScript');
assert.doesNotMatch(responsiveCss, /\$\{/,
  'responsive stylesheet must not retain template interpolation');
assert.doesNotMatch(garageCss, /\$\{/,
  'Garage stylesheet must not retain template interpolation');
assert.match(responsiveCss, /:root\{\s*--cot-edge:/,
  'shared responsive tokens remain present');
assert.match(garageCss, /\.cot-garage\{--cot-garage-sidebar-width:/,
  'Garage root rules remain present');
assert.ok(responsiveCss.length > 50_000, 'responsive stylesheet is not truncated');
assert.ok(garageCss.length > 75_000, 'Garage stylesheet is not truncated');

console.log('static runtime styles: PASS');
