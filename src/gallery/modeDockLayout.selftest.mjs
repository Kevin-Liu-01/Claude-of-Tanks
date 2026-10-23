// modeDockLayout.selftest.mjs — the Tank Gallery's layout contract (brand-ui SPEC 12.5, the Premiere 07-gallery port):
// three panes on a desktop, the stage's plates in their own corners, the layer and view labels leaving the picture but
// not the accessible names when the stage narrows, one scrolling page below 1100 px and a stacked phone layout, all on
// the media-query bands of responsiveLayout.ts and the design tokens.
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

// The stage's plates hold their own corners: layers top left, views top right, the scale inset bottom left, the tools
// bottom centre, the legend bottom right.
assert.match(css, /\.stage-layers\{left:var\(--s4\);top:var\(--s3\)/);
assert.match(css, /\.stage-views\{right:var\(--s4\);top:var\(--s3\)/);
assert.match(css, /\.stage-inset\{left:var\(--s4\);bottom:var\(--s4\)/);
assert.match(css, /\.stage-tools\{left:50%;bottom:var\(--s4\)/);
assert.match(css, /#viewport\.stage \.overlay-legend:not\(:empty\)\{right:var\(--s4\);bottom:var\(--s4\)/);
// Five layers, each with its key; the label leaves the picture under 1440 px and stays in the button's name.
assert.equal([...html.matchAll(/<button type="button"[^>]*data-mode="(appearance|armor|modules|crew|markup)" data-key="([1-5])"/g)].length, 5,
  'five layers, keys 1 to 5');
assert.match(css, /@media \(width < 1440px\)\{\s*\.stage-layers button>span,\.stage-tools button>span\{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset\(50%\)\}/,
  'narrow stages keep the layer and tool names as accessible names only');
assert.equal([...html.matchAll(/data-view="(?:hero|front|left|right|rear|top|elevated-left|elevated-right)"/g)].length, 8, 'eight camera views');

// Below 1100 px the page scrolls: the stage spans the top and the panes share a row; below 768 px they stack, the views
// become a bottom row and the fleet a strip of cards.
assert.match(css, /@media \(width < 1100px\)\{[\s\S]*?grid-template-areas:"stage stage" "browse dossier"/);
assert.match(css, /@media \(width < 768px\)\{[\s\S]*?grid-template-areas:"stage" "browse" "dossier"[\s\S]*?\.stage-views\{left:var\(--s2\);right:var\(--s2\);top:auto;bottom:var\(--s2\);flex-direction:row/);
assert.match(css, /@media \(width < 768px\)\{[\s\S]*?\.vehicle-list,\.vehicle-list\[data-layout=grid\]\{display:grid;grid-auto-flow:column/);

// Selection states fill or outline whole controls: no clipped decorative fragments.
assert.doesNotMatch(css, /::(?:before|after)\{[^}]*height:(?:12|15|16)px/, 'no decorative border fragments');
// brand-ui SPEC §5.5: the page lays out at first paint from media queries at responsiveLayout.ts's band edges.
assert.deepEqual(viewportQueryViolations(css, 'gallery.css'), [],
  'Gallery layout keeps the one viewport contract (the bands of responsiveLayout.ts) as media queries');
// Short landscape viewports keep the shell inside the visual viewport below the shorter navigation.
assert.match(css, /@media \(\(height < 520px\) or \(width < 900px\) or \(\(width < 1440px\) and \(\(pointer: coarse\) or \(hover: none\)\)\)\)\{\s*\.gallery-shell\{height:calc\(var\(--cot-viewport-height,100dvh\) - 56px\)\}/);

console.log('modeDockLayout.selftest: three panes, the stage plates in their corners, layer names kept as accessible names, '
  + 'the scrolling and stacked layouts on the responsiveLayout bands pass');
