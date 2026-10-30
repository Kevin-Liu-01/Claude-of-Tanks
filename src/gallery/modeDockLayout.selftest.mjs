// modeDockLayout.selftest.mjs — the Tank Gallery's layout contract (brand-ui SPEC 12.5, the Premiere direction's own
// page 07-gallery.html): three panes on a desktop, the stage's plates where the page puts them (layers top left, views
// top right, tools bottom centre, the scale inset bottom left, the legend bottom right), the layer and view labels
// leaving the picture but not the accessible names when the stage narrows, one scrolling page below 1100 px and a
// stacked phone layout, all on the media-query bands of responsiveLayout.ts and the design tokens.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { viewportQueryViolations } from '../ui/viewportQueries.test-support.mjs';

const css = readFileSync(new URL('./gallery.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../site/gallery.html', import.meta.url), 'utf8');

// Three panes: browse, the stage, the dossier, at first paint from the stylesheet.
assert.match(css, /\.gallery-shell\{height:calc\(var\(--cot-viewport-height,100dvh\) - 64px\);display:grid;grid-template-columns:var\(--g-browse\) minmax\(0,1fr\) var\(--g-dossier\);\s*grid-template-areas:"browse stage dossier"/,
  'the desktop Gallery is three panes below the navigation');
const order = ['<aside class="browse"', '<section class="stage" id="viewport"', '<aside class="dossier"'].map((tag) => html.indexOf(tag));
assert.ok(order.every((at, index) => at > 0 && (index === 0 || at > order[index - 1])), 'the markup reads browse, stage, dossier');

// The page's own structure: search, flags, toggles and the fleet in browse; the take, tabs, facts, versus card and
// actions in the dossier.
for (const part of ['<form class="search"', '<div class="flags"', '<div class="toggles"', '<div class="fam" id="vehicleList"',
  '<header class="take"', '<div class="nm">', '<div class="dz-tabs"', '<div class="facts"', '<div class="vsc"', '<div class="acts">']) {
  assert.ok(html.includes(part), `the Gallery carries the direction's ${part}`);
}

// The stage's plates hold the page's places.
assert.match(css, /\.layers\{left:16px;top:14px;display:flex;gap:2px;padding:3px\}/);
assert.match(css, /\.views\{right:16px;top:14px;display:flex;padding:3px\}/);
assert.match(css, /\.tools\{left:50%;bottom:16px;transform:translateX\(-50%\)/);
assert.match(css, /\.inset\{left:16px;bottom:16px;width:150px/);
// (247) the legend stands above the bottom row, clear of the centred turntable and photo bar
assert.match(css, /#viewport \.legend:not\(:empty\)\{right:16px;bottom:64px/);
// Five layers, each with its key: the kit's segmented control (261), built by gallery.ts in the page's place for it; the
// label leaves the picture under 1440 px and stays in the button's name.
const galleryTs = readFileSync(new URL('./gallery.ts', import.meta.url), 'utf8');
assert.match(html, /<div id="layerDock" hidden><\/div>/, 'the page holds the layers\' place');
assert.match(galleryTs, /const GALLERY_MODES: readonly GalleryMode\[\] = \['appearance', 'armor', 'modules', 'crew', 'markup'\];/, 'five layers');
assert.match(galleryTs, /segmented\(\{ label: t\('gallery\.view\.modeDockAria'\), className: 'layers'[\s\S]*?key: String\(index \+ 1\)/,
  'the layers are the kit\'s segmented control, keys 1 to 5');
assert.match(css, /@media \(width < 1440px\)\{\s*\.layers button>span\{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset\(50%\)\}/,
  'narrow stages keep the layer names as accessible names only');
assert.match(galleryTs, /createPickerMenu\(\$<HTMLElement>\('\.views'\), \{\s*id: 'gallery-camera-view'/, 'the eight camera views are the kit\'s picker menu');
assert.equal((galleryTs.match(/^\s+'?[a-z-]+'?: 'gallery\.view\.view\.[A-Za-z]+',$/gm) ?? []).length, 8, 'eight camera views');

// From 768 to 1100 px the three panes keep their row with a narrower list (the lead, 10-26); a short window under 1100 px
// scrolls, the stage spanning the top and the panes sharing a row; below 768 px they stack, the views become a bottom
// row and the fleet a strip of cards.
assert.match(css, /@media \(width < 1100px\)\{\s*:root\{--g-browse:clamp\(216px,22vw,248px\);--g-dossier:clamp\(296px,32vw,360px\)\}/);
assert.match(css, /@media \(width < 768px\), \(\(height < 520px\) and \(width < 1100px\)\)\{[\s\S]*?grid-template-areas:"stage stage" "browse dossier"/);
assert.match(css, /@media \(width < 768px\)\{[\s\S]*?grid-template-areas:"stage" "browse" "dossier"[\s\S]*?\.views\{position:absolute;z-index:var\(--z-hud-controls\);left:8px;right:auto;top:auto;bottom:8px\}/);
assert.match(css, /@media \(width < 768px\)\{[\s\S]*?\.fam,\.fam\[data-layout=grid\]\{display:grid;grid-auto-flow:column/);

// Selection states fill or outline whole controls: no clipped decorative fragments.
assert.doesNotMatch(css, /::(?:before|after)\{[^}]*height:(?:12|15|16)px/, 'no decorative border fragments');
// brand-ui SPEC §5.5: the page lays out at first paint from media queries at responsiveLayout.ts's band edges.
assert.deepEqual(viewportQueryViolations(css, 'gallery.css'), [],
  'Gallery layout keeps the one viewport contract (the bands of responsiveLayout.ts) as media queries');
// Short landscape viewports keep the shell inside the visual viewport below the shorter navigation.
assert.match(css, /@media \(\(height < 520px\) or \(width < 900px\) or \(\(width < 1440px\) and \(\(pointer: coarse\) or \(hover: none\)\)\)\)\{\s*\.gallery-shell\{height:calc\(var\(--cot-viewport-height,100dvh\) - var\(--shell-nav-h\)\)\}/);

console.log('modeDockLayout.selftest: three panes, the direction page\'s structure, the stage plates in its places, layer names kept '
  + 'as accessible names, the scrolling and stacked layouts on the responsiveLayout bands pass');
