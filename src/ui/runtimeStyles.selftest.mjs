import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [main, garageSource, responsiveCss, garageCss, motionCss, publicNavCss] = await Promise.all([
  readFile(new URL('../main.ts', import.meta.url), 'utf8'),
  readFile(new URL('./garage.ts', import.meta.url), 'utf8'),
  readFile(new URL('./responsiveSurfaces.css', import.meta.url), 'utf8'),
  readFile(new URL('./garage.css', import.meta.url), 'utf8'),
  readFile(new URL('./motion.css', import.meta.url), 'utf8'),
  readFile(new URL('../presentation/publicNav.css', import.meta.url), 'utf8'),
]);

const motionImport = main.indexOf("import './ui/motion.css';");
const responsiveImport = main.indexOf("import './ui/responsiveSurfaces.css';");
const garageImport = main.indexOf("import './ui/garage.css';");
const garageRuntimeImport = main.indexOf("from './ui/garage.ts';");

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
assert.match(garageCss,
  /\.cot-garage\{--cot-garage-sidebar-width:280px;--cot-garage-sidebar-top:86px;--cot-garage-sidebar-bottom:210px/,
  'Garage root must own one shared desktop sidebar rail');
assert.match(garageCss,
  /\.cot-garage \.stats\{position:absolute;right:22px;top:var\(--cot-garage-sidebar-top\);bottom:var\(--cot-garage-sidebar-bottom\)/,
  'Garage dossier must consume the shared sidebar top and bottom anchors');
assert.match(garageCss,
  /\.cot-leftcol\{position:absolute;left:34px;top:var\(--cot-garage-sidebar-top\);bottom:var\(--cot-garage-sidebar-bottom\)/,
  'Garage setup column must consume the shared sidebar top and bottom anchors');
assert.doesNotMatch(garageCss, /\.cot-garage \.stats\{max-height:max\(/,
  'Garage dossier must not retain an independent height cap that shortens the right rail');
assert.match(garageCss,
  /\.cot-garage \.stats::-webkit-scrollbar\{width:3px;\}/,
  'Garage dossier scrollbar must remain visually minimal');
assert.match(garageCss,
  /\.cot-garage \.stats::-webkit-scrollbar-track\{background:transparent;\}/,
  'Garage dossier scrollbar must not draw a permanent track');
assert.match(garageCss,
  /\.cot-garage \.stats::-webkit-scrollbar-thumb\{background:rgba\(146,164,180,\.28\);border-radius:999px;\}/,
  'Garage dossier scrollbar thumb must stay quiet and rounded');
assert.match(garageCss,
  /@media \(hover:hover\) and \(pointer:fine\)\{\s*\.cot-garage \.stats:hover::-webkit-scrollbar-thumb/,
  'Garage dossier hover affordance must only run on hover-capable pointers');
assert.doesNotMatch(garageSource,
  /\$\{eqIds\.length\}\/\$\{EQUIP_SLOTS\} mounted/,
  'Garage equipment section must not repeat a mounted-slot counter');
assert.ok(garageSource.includes("eqTooltipEl.setAttribute('role', 'tooltip')"),
  'Garage equipment explanations must use an accessible tooltip contract');
assert.ok(garageSource.includes('eqpickEl.addEventListener(\'pointerover\'') &&
  garageSource.includes('eqpickEl.addEventListener(\'focusin\''),
  'Garage equipment tooltips must work with pointer hover and keyboard focus');
assert.ok(garageSource.includes('<button type="button" class="${cls.join(\' \')}"'),
  'Garage equipment choices must render as semantic buttons');
assert.doesNotMatch(garageSource, /title="\$\{it\.name\}/,
  'Garage equipment choices must not fall back to inconsistent native title bubbles');
assert.match(garageCss, /\.cot-eqtooltip\{position:fixed;[^}]*pointer-events:none;/,
  'Garage equipment tooltip must escape the scrolling picker without intercepting input');
assert.match(garageCss,
  /@media \(hover:hover\) and \(pointer:fine\)\{[\s\S]*\.cot-eqtile:not\(\.locked\):hover/,
  'Garage equipment hover motion must only run on hover-capable pointers');
assert.match(garageCss,
  /body\[data-cot-panels='overlay'\] \.cot-eqpick\.open\{[^}]*left:auto;[^}]*right:calc\(max\([^}]*var\(--cot-compact-stats-width\)[^}]*width:min\(420px,calc\(100vw - var\(--cot-compact-stats-width\)[^}]*display:flex;/,
  'Compact Garage equipment picker must stay beside the dossier and inside the safe viewport');
assert.match(garageCss,
  /body\[data-cot-panels='overlay'\] \.cot-eqpick \.pgrid\{[^}]*min-height:0;[^}]*max-height:none;[^}]*flex:1 1 auto/,
  'Compact Garage equipment choices must scroll inside the bounded picker');
assert.match(garageCss,
  /\.cot-sidebar-section-title\{[^}]*font:700 10px[^}]*letter-spacing:\.24em[^}]*text-transform:uppercase;/,
  'Garage sidebars must share one section-heading typography contract');
for (const headerClass of [
  'ftitle cot-sidebar-section-title',
  'mtitle cot-sidebar-section-title',
  'ctitle cot-sidebar-section-title',
  'cot-stat-title cot-sidebar-section-title',
  'eqhead cot-sidebar-section-title',
]) {
  assert.match(garageSource, new RegExp(headerClass),
    `Garage header ${headerClass} must consume the shared section-heading contract`);
}
assert.match(garageCss,
  /\.cot-sidebar-section-title > span\{[^}]*white-space:nowrap;/,
  'Garage sidebar headings must remain on one readable line');
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
