// style-literal-census.selftest.mjs — the style-literal ratchet receipt (brand-ui SPEC §4.1, §5.4, §17.1).
// Copyright © 2026 Kevin B. Liu.
//
// 1. The census counts what it names: colour, font size, letter spacing, z-index, shadow, duration and !important
//    literals in CSS, CSS-in-TS and HTML, never inside url(), strings or custom-property names, never a token read.
// 2. No file of the tree holds more literals of any category than tools/style-literal-baseline.json allows (a new
//    file starts at zero), and the committed baseline is in canonical form (one line per file).
// 3. The ratchet fires: a rise in one file and a literal in a new file are both reported, and a write that would raise
//    a category's total is refused.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BASELINE_FILE, CATEGORIES, baselineText, census, censusFiles, cssDeclarations, declarationLiterals, fileCensus,
  readBaseline, rises, scriptDeclarations, stringLiterals, totalRises, totals,
} from './style-literal-census.mjs';

/* 1. what counts ------------------------------------------------------------------------------------------------ */
const lit = (property, value, important) => declarationLiterals(property, value, important);
assert.deepEqual(lit('color', '#f0a030'), { colour: 1 });
assert.deepEqual(lit('background', 'linear-gradient(#152029f2,rgba(8,14,20,.93))'), { colour: 2 });
assert.deepEqual(lit('border', '1px solid white'), { colour: 1 }, 'a named colour in a colour property');
assert.deepEqual(lit('color', 'var(--ink-1)'), {}, 'a token read is never a literal');
assert.deepEqual(lit('color', 'var(--cot-gold, #ffd27a)'), { colour: 1 }, 'a var() fallback renders without its token, so it counts');
assert.deepEqual(lit('background', "url('/media/a#fff.webp') center/cover"), {}, 'nothing inside url()');
assert.deepEqual(lit('content', '"#1"'), {}, 'nothing inside a string');
assert.deepEqual(lit('background', 'var(--gold) linear-gradient(var(--tan-line), transparent)'), {}, 'custom-property names are not colours');
assert.deepEqual(lit('white-space', 'nowrap'), {});
assert.deepEqual(lit('font-family', "'Chakra Petch', Black"), {}, 'a family name is not a colour');
assert.deepEqual(lit('font-size', '11px'), { fontSize: 1 });
assert.deepEqual(lit('font-size', 'var(--fs-14)'), {});
assert.deepEqual(lit('font', '700 10px/1 var(--font-ui)'), { fontSize: 1 });
assert.deepEqual(lit('font', '500 var(--fs-13)/1.4 var(--font-body)'), {});
assert.deepEqual(lit('letter-spacing', '.18em'), { letterSpacing: 1 });
assert.deepEqual(lit('letter-spacing', '0'), {});
assert.deepEqual(lit('letter-spacing', 'normal'), {});
assert.deepEqual(lit('z-index', '62'), { zIndex: 1 });
assert.deepEqual(lit('z-index', 'auto'), {});
assert.deepEqual(lit('z-index', 'var(--z-menu)'), {});
assert.deepEqual(lit('box-shadow', '0 2px 5px #0006'), { colour: 1, shadow: 1 });
assert.deepEqual(lit('box-shadow', 'none'), {});
assert.deepEqual(lit('filter', 'drop-shadow(0 1px 2px #000) brightness(1.1)'), { colour: 1, shadow: 1 });
assert.deepEqual(lit('transition', 'opacity .2s ease, transform 140ms cubic-bezier(.2,.8,.2,1) .05s'), { duration: 3 });
assert.deepEqual(lit('--cot-motion-fast', 'var(--dur-fast, 140ms)'), { duration: 1 }, 'a time in a custom property counts');
assert.deepEqual(lit('display', 'none', true), { important: 1 });
assert.deepEqual(cssDeclarations('/* x{color:red} */@layer surfaces{@media (width < 520px){.a{color:#fff;z-index:2!important}}}'),
  [{ property: 'color', value: '#fff', important: false }, { property: 'z-index', value: '2', important: true }],
  'nested at-rules are read, comments and media preludes are not');
// CSS in TS: stylesheet templates, style attributes and element.style writes; shader code and canvas paint are not CSS
const ts = [
  'const CSS = `.cot-x{color:#123456;font:800 11px/1 ${FONT}}`;',
  "const html = `<b style=\"color:red;--focus:52% 62%\">x</b>`;",
  "el.style.zIndex = '40'; el.style.cssText = 'box-shadow:0 0 4px #000'; el.style.setProperty('color', '#abc');",
  "ctx.fillStyle = '#ff0000'; const GLSL = `void main(){ float t = x > 0.5 ? top : bottom; gl_FragColor = vec4(1.0); }`;",
].join('\n');
assert.deepEqual(fileCensus('probe.ts', ts), { colour: 4, fontSize: 1, letterSpacing: 0, zIndex: 1, shadow: 1, duration: 0, important: 0 });
assert.equal(stringLiterals("const a = `x${`y${'z'}`}w`; // `not` a template\nconst b = 'q';").map((s) => s.text).join('|'),
  "z|yvar(--interpolated)|xvar(--interpolated)w|q", 'nested template interpolations are skipped, comments ignored');
assert.deepEqual(scriptDeclarations("const re = /'/g; const s = 'color:#fff';"), [], 'a bare string is not a style context');
assert.deepEqual(fileCensus('probe.html', '<!-- <style>.a{color:red}</style> --><style>.b{color:#000}</style><p style="z-index:3">'),
  { colour: 1, fontSize: 0, letterSpacing: 0, zIndex: 1, shadow: 0, duration: 0, important: 0 }, 'HTML: inline sheets and attributes, not comments');

/* 2. the tree against the baseline ------------------------------------------------------------------------------- */
const files = censusFiles();
assert.ok(files.includes('index.html') && files.includes('src/ui/garage.css') && files.includes('src/ui/hud.ts'), 'the census reads HTML, CSS and CSS-in-TS');
assert.ok(!files.some((path) => path.startsWith('src/ui/tokens/')), 'the token package is where literals belong: not counted');
assert.ok(!files.some((path) => /\.selftest\.|^tools\//.test(path)), 'receipts and fixtures are not counted');
const current = census();
const baseline = readBaseline();
const up = rises(current, baseline);
assert.deepEqual(up, [], `style literals rose above tools/style-literal-baseline.json (use design tokens):\n${up.map((r) => `  ${r.file}: ${r.category} ${r.baseline} -> ${r.current}`).join('\n')}`);
assert.equal(readFileSync(BASELINE_FILE, 'utf8'), baselineText(baseline), 'the baseline is in canonical form (node tools/style-literal-census.mjs --write)');

/* 3. the ratchet fires ------------------------------------------------------------------------------------------- */
const zero = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
const was = { 'a.css': { ...zero, colour: 2 } };
assert.deepEqual(rises({ 'a.css': { ...zero, colour: 3 }, 'new.ts': { ...zero, zIndex: 1 } }, was), [
  { file: 'a.css', category: 'colour', baseline: 2, current: 3 },
  { file: 'new.ts', category: 'zIndex', baseline: 0, current: 1 },
], 'a rise and a new file\'s literal both fail');
assert.deepEqual(rises({ 'a.css': { ...zero, colour: 1 } }, was), [], 'a fall passes');
assert.deepEqual(totalRises({ 'b.css': { ...zero, colour: 2 } }, was), [], 'moving literals between files may be written');
assert.deepEqual(totalRises({ 'a.css': { ...zero, colour: 2 }, 'b.css': { ...zero, colour: 1 } }, was), ['colour 2 -> 3'], 'a write that raises a total is refused');

const now = totals(current);
const allowed = totals(baseline);
console.log(`style-literal-census: ${files.length} files read; ${CATEGORIES.map((c) => `${c} ${now[c]}/${allowed[c]}`).join(', ')}; no file above its baseline`);
