import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [main, garageSource, responsiveCss, garageCss, motionCss, publicNavCss] = await Promise.all([
  readFile(new URL('../main.ts', import.meta.url), 'utf8'),
  readFile(new URL('./garage.js', import.meta.url), 'utf8'),
  readFile(new URL('./responsiveSurfaces.css', import.meta.url), 'utf8'),
  readFile(new URL('./garage.css', import.meta.url), 'utf8'),
  readFile(new URL('./motion.css', import.meta.url), 'utf8'),
  readFile(new URL('../presentation/publicNav.css', import.meta.url), 'utf8'),
]);

const motionImport = main.indexOf("import './ui/motion.css';");
const responsiveImport = main.indexOf("import './ui/responsiveSurfaces.css';");
const garageImport = main.indexOf("import './ui/garage.css';");
const garageRuntimeImport = main.indexOf("from './ui/garage.js';");

assert.ok(motionImport >= 0, 'composition root must own the shared motion contract');
assert.ok(responsiveImport > motionImport,
  'motion tokens must load before responsive and component styles consume them');
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
assert.match(motionCss, /--cot-ease-out:\s*cubic-bezier\(/,
  'motion contract must publish the standard responsive easing');
for (const band of ['instant', 'fast', 'base', 'slow', 'scene']) {
  assert.match(motionCss, new RegExp(`--cot-motion-${band}:`),
    `motion contract must publish its ${band} duration band`);
}
assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\)/,
  'motion contract must collapse spatial motion for reduced-motion users');
assert.match(publicNavCss, /^@import url\('\.\.\/ui\/motion\.css'\);/,
  'public pages must load the same motion contract as the game');
for (const [name, css] of [
  ['motion', motionCss], ['responsive', responsiveCss], ['garage', garageCss],
  ['public navigation', publicNavCss],
]) {
  assert.doesNotMatch(css, /transition\s*:\s*all\b/i,
    `${name} styles must name the exact properties they animate`);
}
assert.ok(responsiveCss.length > 50_000, 'responsive stylesheet is not truncated');
assert.ok(garageCss.length > 75_000, 'Garage stylesheet is not truncated');

console.log('static runtime styles: PASS');
