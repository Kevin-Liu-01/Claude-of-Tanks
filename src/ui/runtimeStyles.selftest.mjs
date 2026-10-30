import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const [main, gameHtml, garageSource, responsiveCss, garageCss, motionCss, publicNavCss] = await Promise.all([
  readFile(new URL('../main.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../index.html', import.meta.url), 'utf8'),
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

// The design tokens are the game document's first stylesheet, linked ahead of the entry (whose CSS imports read them).
const tokensLink = gameHtml.indexOf('<link rel="stylesheet" href="/src/ui/tokens/tokens.css" />');
assert.ok(tokensLink >= 0 && tokensLink === gameHtml.search(/<link rel="stylesheet"/),
  'the game document must link the design tokens before any other stylesheet');
assert.ok(tokensLink < gameHtml.indexOf('<script type="module" src="/src/main.ts">'),
  'the design tokens must load ahead of the game entry');
assert.ok(!main.includes('tokens.css'), 'the tokens load once, from the game document, not again from the entry');
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
  /\.cot-garage \.stats::-webkit-scrollbar-thumb\{background:var\(--line-3\);border-radius:999px;\}/,
  'Garage dossier scrollbar thumb must stay quiet and rounded');
assert.match(garageCss,
  /@media \(hover:hover\) and \(pointer:fine\)\{\s*\.cot-garage \.stats:hover::-webkit-scrollbar-thumb/,
  'Garage dossier hover affordance must only run on hover-capable pointers');
assert.doesNotMatch(garageSource,
  /\$\{eqIds\.length\}\/\$\{EQUIP_SLOTS\} mounted/,
  'Garage equipment section must not repeat a mounted-slot counter');
// INTERACTION-REDESIGN C: the slot's picker is the kit picker (garageEquipmentPicker.ts); the projection of the item under
// the pointer or the focus (else the slot's own) is a readout in place, on every layout (it lived in a hover tip, never on
// touch), and a shut item says why on hover, focus and press
assert.match(garageSource, /createGarageEquipmentPicker\(\{\s*id: 'garage-equipment',/,
  'Garage equipment choices must be the kit picker, stamped with its registry id');
assert.doesNotMatch(garageSource, /createRichTooltip\(eqpickEl/, 'Garage equipment projections must not hide in a hover-only tooltip');
assert.match(garageSource,
  /equipmentHoverPreview\(spec, currentLoadout, item\?\.id \|\| null, eqOpenSlot, !lock\)/,
  'Garage equipment readout must project values for the selected vehicle and pending press');
assert.match(garageSource, /projectEquipmentLoadout\(cur, itemId, eqOpenSlot\)/,
  'Garage press assignment must share the exact projection path used by its readout');
assert.match(garageSource, /icon\.innerHTML = uiIconSVG\(equipmentMetricIcon\(metric\.id\), 12\)/,
  'Garage equipment projections must pair each adjusted stat with a shared UI icon');
assert.doesNotMatch(garageSource, /Stock \$\{metric\.stock\}/,
  'Garage equipment projections must not add repetitive stock-caption lines');
assert.match(garageSource, /const id = eqShutId \?\? eqPreviewId \?\? \(loadout\[eqOpenSlot\] \|\| EQUIPMENT_EMPTY_ID\);/,
  "Garage equipment readout shows a shut item's reason, else the previewed item, else the slot's own");
assert.doesNotMatch(garageSource, /title="\$\{it\.name\}/,
  'Garage equipment choices must not fall back to inconsistent native title bubbles');
assert.doesNotMatch(garageCss, /\.cot-eqtooltip/, 'Garage equipment tooltip must not keep a plate of its own');
assert.match(garageCss,
  /\.cot-eqtip \.metric\{display:grid;grid-template-columns:14px minmax\(0,1fr\) auto;/,
  'Garage equipment readout must align icons and stat labels with current-to-projected values');
assert.match(garageCss,
  /\.cot-eqtip \.metric\.improved \.metric-values b\{color:var\(--text-ok\);\}/,
  'Garage equipment improvements must be visually distinguishable');
assert.match(garageCss,
  /\.cot-eqtip \.metric\.degraded \.metric-values b\{color:var\(--text-danger\);\}/,
  'Garage equipment replacement tradeoffs must be visually distinguishable');
assert.match(garageCss, /\.cot-eqpreview\{flex:none;block-size:9\.5rem;/,
  'Garage equipment readout keeps one height whatever it shows (the panel never jumps under the pointer)');
// (its place holds while it fades out: only display waits for .open)
assert.match(garageCss,
  /body\[data-cot-panels='overlay'\] \.cot-eqpick\{[^}]*left:auto;[^}]*right:calc\(max\([^}]*var\(--cot-compact-stats-width\)[^}]*width:min\(420px,calc\(100vw - var\(--cot-compact-stats-width\)[^}]*\}\nbody\[data-cot-panels='overlay'\] \.cot-eqpick\.open\{display:flex\}/,
  'Compact Garage equipment picker must stay beside the dossier and inside the safe viewport');
assert.match(garageCss,
  /body\[data-cot-panels='overlay'\] \.cot-eqpick \.cot-c-picker--swatches \.cot-c-picker__grid\{[^}]*min-height:0;[^}]*max-height:none;[^}]*flex:1 1 auto/,
  'Compact Garage equipment choices must scroll inside the bounded picker');
assert.match(garageCss,
  /\.cot-sidebar-section-title\{[^}]*font:600 max\(var\(--fs-floor-11\),var\(--fs-12\)\)\/1 var\(--font-display\);letter-spacing:var\(--track-label-s\);text-transform:uppercase;/,
  'Garage sidebars must share one section-heading typography contract');
for (const headerClass of [
  'ftitle cot-sidebar-section-title',
  'cot-stat-title cot-sidebar-section-title',
]) {
  assert.match(garageSource, new RegExp(headerClass),
    `Garage header ${headerClass} must consume the shared section-heading contract`);
}
assert.match(garageCss,
  /\.cot-sidebar-section-title > span\{[^}]*white-space:nowrap;/,
  'Garage sidebar headings must remain on one readable line');
assert.match(motionCss, /--cot-ease-out:\s*var\(--ease-camera,\s*cubic-bezier\(/,
  'motion contract must publish the standard responsive easing as an alias of the camera easing token');
for (const band of ['instant', 'fast', 'base', 'slow', 'scene']) {
  assert.match(motionCss, new RegExp(`--cot-motion-${band}:`),
    `motion contract must publish its ${band} duration band`);
}
assert.match(motionCss, /@media \(prefers-reduced-motion: reduce\)/,
  'motion contract must collapse spatial motion for reduced-motion users');
assert.match(publicNavCss, /^(?:@import url\('[^']+'\);\n)*@import url\('\.\.\/ui\/motion\.css'\);/, // among the leading imports (the tokens sheet comes first since 243)
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

// Only the composition root imports stylesheets statically. A lazy surface loads its CSS with a
// dynamic import beside its module (battleHudAccess.ts, publicPages.ts): plain-Node selftests
// import those modules, hud.ts and its graph among them, and Node cannot load a stylesheet.
const srcRoot = new URL('../', import.meta.url);
const staticStylesheetImport = /^\s*import\s+(?:[^'";]+\s+from\s+)?['"][^'"]+\.css(?:\?[^'"]*)?['"]/m;
const stylesheetImporters = [];
for (const entry of await readdir(srcRoot, { recursive: true })) {
  if (!entry.endsWith('.ts') || entry === 'main.ts') continue;
  if (staticStylesheetImport.test(await readFile(new URL(entry, srcRoot), 'utf8'))) stylesheetImporters.push(entry);
}
assert.deepEqual(stylesheetImporters, [],
  'only src/main.ts imports stylesheets statically; a lazy surface loads its CSS with a dynamic import at its boundary');

console.log('static runtime styles: PASS');
