// uiCanvasCensus.selftest.mjs — (UI-LOCKDOWN A) every on-screen canvas is a uiCanvas (src/ui/uiCanvas.ts). Copyright ©
// 2026 Kevin B. Liu.
// Each on-screen canvas used to size itself (the Gallery inset compounded to 17,152 px; the sight kept its old store and
// held 1680x1050 hidden), so this census fails on any canvas made any other way:
// - `createElement('canvas')` (or a helper's `el('canvas'...)`) only in uiCanvas.ts, under the texture directories
//   (world/, vehicles/, fx/), and in the texture files below, each pinned to its count of sites: a new canvas there is
//   a review (texture or on-screen?), not a free pass. An offscreen canvas anywhere else is uiCanvas's scratchCanvas().
// - No `<canvas` markup in TypeScript: createUiCanvas() makes an on-screen canvas.
// - Every canvas in a page's HTML is registered below with the module that mounts it.
// - No canvas text on screen: a canvas's words and figures are DOM over it (canvasText.ts: the kit's type, i18n, the zh
//   floor, assistive tech). Text set into a texture or an SVG is a module of its own, kept to the importers named below.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TEXTURE_DIRS = ['src/world/', 'src/vehicles/', 'src/fx/'];
/** Texture, bake and probe canvases outside those directories, by their count of canvas sites. */
const TEXTURE_FILES = Object.freeze({
  'src/app/battleEndGarageWarm.ts': 1, // the Garage warm-up's offscreen frame
  'src/engine/capabilityGate.ts': 1, // the WebGL capability probe
  'src/engine/lighting.ts': 1, // the environment's gradient texture
  'src/engine/sky.ts': 2, // the sky's gradient and cloud textures
  'src/game/garageDressing.ts': 6, // the garage hall's decals and signage textures
  'src/game/matchModeWorldPresentation.ts': 1, // the objective sprites' icon textures
  'src/game/provingRangeDressing.ts': 1, // the proving range's signboard texture
  'src/game/studio.ts': 1, // the shot thumbnail's JPEG encode
  'src/game/studioFilm.ts': 1, // the film's frame for the encoder
  'src/ui/garageEnvironmentKit.ts': 1, // the garage's environment texture
  'src/ui/garageStage.ts': 13, // the garage stage's floor, pool, lamp, crate and cabinet textures
  'src/ui/garageYardWear.ts': 6, // the yard's wear and stain textures
});
/** Page canvases (static HTML) and the module that mounts each one as a uiCanvas. */
const PAGE_CANVASES = Object.freeze({
  'site/gallery.html#stageScale': 'src/gallery/trueScale.ts',
  'site/gallery.html#versusScale': 'src/gallery/trueScale.ts',
});
/** Canvas text still drawn on screen, per file (a ratchet: lower a pin as its labels move to the DOM; never raise one).
 *  None is left: the sight's 11 readouts (hud.ts) and the glyphs' 4 zone letters (objectiveGlyphs.ts) moved to DOM. */
const CANVAS_TEXT = Object.freeze({});
/** Text set into a texture or an SVG (no DOM over it), by module: the files that may import it. */
const OFFSCREEN_TEXT = Object.freeze({
  // a badge's or lane mark's letter on the battlefield's objective sprites and in the Field Manual's mode diagrams
  'src/ui/objectiveGlyphLetters.ts': ['src/game/matchModeWorldPresentation.ts', 'src/docs/chapters/modes.ts'],
});

function walk(dir, out = []) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = `${dir}/${name}`;
    if (statSync(join(ROOT, path)).isDirectory()) walk(path, out);
    else out.push(path);
  }
  return out;
}
const isTest = (path) => /\.(test|selftest|browser)\.|\.test-support\.|\.d\.ts$/.test(path);
const sources = walk('src').filter((path) => path.endsWith('.ts') && !isTest(path));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const count = (text, pattern) => (text.match(pattern) || []).length;

const CREATE = /\b(?:createElement|el|node)\(\s*['"]canvas['"]/g;
const MARKUP = /<canvas[\s>]/g;
const TEXT = /\.(?:fillText|strokeText)\(/g;

const failures = [];
const textureSeen = new Set();
const textSeen = new Set();
for (const path of sources) {
  const text = read(path);
  const creates = count(text, CREATE);
  const texture = TEXTURE_DIRS.some((dir) => path.startsWith(dir));
  if (path === 'src/ui/uiCanvas.ts') {
    assert.equal(creates, 2, 'uiCanvas.ts makes canvases in createUiCanvas and scratchCanvas only');
  } else if (Object.hasOwn(TEXTURE_FILES, path)) {
    textureSeen.add(path);
    if (creates !== TEXTURE_FILES[path]) {
      failures.push(`${path}: ${creates} canvas sites, pinned ${TEXTURE_FILES[path]} (a texture keeps its pin; an on-screen canvas is createUiCanvas())`);
    }
  } else if (!texture && creates) {
    failures.push(`${path}: ${creates} canvas(es) made outside uiCanvas (on screen: createUiCanvas(); offscreen: scratchCanvas())`);
  }
  if (!texture && path !== 'src/ui/uiCanvas.ts' && count(text, MARKUP)) {
    failures.push(`${path}: <canvas> markup (make it with createUiCanvas())`);
  }
  if (texture || Object.hasOwn(TEXTURE_FILES, path) || Object.hasOwn(OFFSCREEN_TEXT, path)) continue;
  const labels = count(text, TEXT);
  const pin = CANVAS_TEXT[path] ?? 0;
  if (Object.hasOwn(CANVAS_TEXT, path)) textSeen.add(path);
  if (labels > pin) failures.push(`${path}: ${labels} canvas text calls, pinned ${pin} (UI text is DOM over the canvas)`);
  else if (labels < pin) failures.push(`${path}: ${labels} canvas text calls, pinned ${pin}: lower the pin (it only shrinks)`);
}
for (const path of Object.keys(TEXTURE_FILES)) if (!textureSeen.has(path)) failures.push(`${path}: a pinned texture file that no longer exists`);
for (const path of Object.keys(CANVAS_TEXT)) if (!textSeen.has(path)) failures.push(`${path}: a canvas text pin for a file that no longer exists`);
// an offscreen text module reaches only its named importers (an on-screen canvas places its text through canvasText.ts)
for (const [module, importers] of Object.entries(OFFSCREEN_TEXT)) {
  const name = module.split('/').pop().replace(/\.ts$/, '');
  for (const path of sources) {
    if (path === module || !read(path).includes(`/${name}.ts'`)) continue;
    if (!importers.includes(path)) failures.push(`${path}: imports ${module}, which sets text into textures and SVG only (on screen: canvasText.ts)`);
  }
}

// page canvases: each has an id and a registered module that mounts it through uiCanvas
const pages = readdirSync(join(ROOT, 'site')).filter((name) => name.endsWith('.html')).map((name) => `site/${name}`);
const registered = new Set();
for (const page of pages) {
  for (const match of read(page).matchAll(/<canvas\b[^>]*>/g)) {
    const id = /\bid="([^"]+)"/.exec(match[0])?.[1];
    const key = `${page}#${id}`;
    if (!id || !Object.hasOwn(PAGE_CANVASES, key)) { failures.push(`${page}: ${match[0]} is not registered with the module that mounts it`); continue; }
    registered.add(key);
  }
}
for (const [key, owner] of Object.entries(PAGE_CANVASES)) {
  if (!registered.has(key)) failures.push(`${key}: registered but not on the page`);
  if (!/\buiCanvas\(/.test(read(owner))) failures.push(`${key}: ${owner} does not mount it through uiCanvas`);
}
// the Gallery hands its two canvases to the true-scale drawing
const gallery = read('src/gallery/gallery.ts');
for (const id of ['stageScale', 'versusScale']) {
  assert.match(gallery, new RegExp(`drawTrueScale\\(\\$<HTMLCanvasElement>\\('#${id}'\\)`), `gallery.ts draws #${id} through drawTrueScale`);
}

assert.deepEqual(failures, [], `on-screen canvases outside uiCanvas:\n  ${failures.join('\n  ')}`);
console.log(`uiCanvasCensus.selftest: PASS (${sources.length} sources, ${Object.keys(TEXTURE_FILES).length} texture files, ` +
  `${Object.values(CANVAS_TEXT).reduce((a, b) => a + b, 0)} canvas text calls left on screen)`);
