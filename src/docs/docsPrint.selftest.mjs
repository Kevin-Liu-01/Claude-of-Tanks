// docsPrint.selftest.mjs — (261) the Field Manual prints as dark ink on paper (Main, 2026-10-27: "make the docs print
// well"). Copyright © 2026 Kevin B. Liu.
//
//  1. docsPrint.css is the docs' own sheet, imported by docs.css and nothing else (the game loads none of it), and every
//     rule in it sits in one `@layer overrides{@media print{...}}` block after the layer order: no unlayered CSS.
//  2. Paper: every surface token prints transparent, and the inks and the text tones it sets hold 4.5:1 on white,
//     computed from the token values (color-mix in OKLab, as the browser mixes). No colour literal: tokens only.
//  3. The chrome stays on screen: the public nav and its skip link, the shelf and its search, the contents, the pager,
//     the footer, the players.
//  4. Page breaks: a heading keeps to what follows it, figures, tables, cards and code keep whole, a caption keeps to its
//     figure; a page's backgrounds that carry data print as drawn (print-color-adjust); an outside link prints its address.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contrastRatio, parseHex } from '../ui/colorVision.ts';
import { STYLE_LAYER_ORDER } from '../ui/styleLayers.ts';
import { TOKENS } from '../ui/tokens/tokens.ts';
import { SURFACE_TOKENS as PRINT } from '../ui/tokens/surface-print.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
const sheet = read('src/docs/docsPrint.css');
const css = sheet.replace(/\/\*[\s\S]*?\*\//g, '').trim();

// 1. the docs' own sheet, in one print block in the overrides layer
assert.ok(read('src/docs/docs.css').includes("@import url('./docsPrint.css');"), 'docs.css imports the print sheet');
const walk = (dir, out = []) => {
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) walk(path, out);
    else if (/\.(css|ts|html)$/.test(name)) out.push(path);
  }
  return out;
};
// a load is an import (CSS @import, a module import or a link), never a mention in a comment
const LOADS_PRINT = /@import\s+url\(\s*['"]?[^'")]*docsPrint\.css|\bimport\s*(?:\(\s*)?['"][^'"]*docsPrint\.css|\bfrom\s*['"][^'"]*docsPrint\.css|href=["'][^"']*docsPrint\.css/;
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '').replace(/^\s*\/\/.*$/gm, '');
assert.deepEqual([...walk('src'), 'index.html'].filter((path) => !path.endsWith('.selftest.mjs') && LOADS_PRINT.test(stripComments(read(path)))),
  ['src/docs/docs.css'], 'only the manual loads the print sheet');
const IMPORT = "@import url('../ui/tokens/surface-print.css');";
assert.ok(css.startsWith(`${IMPORT}\n${STYLE_LAYER_ORDER}`), 'the sheet imports the paper tokens, then opens with the layer order');
const body = css.slice(IMPORT.length).trim().slice(STYLE_LAYER_ORDER.length).trim();
assert.ok(body.startsWith('@layer overrides{') && body.endsWith('}'), 'every rule is in the overrides layer');
let depth = 0, closedAt = -1;
for (let i = 0; i < body.length; i++) {
  if (body[i] === '{') depth++;
  else if (body[i] === '}' && --depth === 0) { closedAt = i; break; }
}
assert.equal(closedAt, body.length - 1, 'one layer block, nothing unlayered after it');
const inner = body.slice('@layer overrides{'.length, -1).trim();
assert.ok(inner.startsWith('@media print{') && inner.endsWith('}'), 'the layer holds one print block');
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|var\(--(graphite|paper|tungsten|sky|vermilion|mint|yellow)-\d/i, 'no colour literal and no ramp: the paper reads its own tokens');

// 2. paper: the surfaces fall away, the inks and tones hold on white
const root = /:root\{([\s\S]*?)\}/.exec(inner)?.[1] ?? '';
const decl = Object.fromEntries([...root.matchAll(/--([a-z0-9-]+):([^;]+);?/g)].map((m) => [m[1], m[2].trim()]));
const tokens = JSON.parse(read('src/ui/tokens/tokens.json'));
for (const name of Object.keys(tokens.semantic.surface).filter((key) => !key.startsWith('$'))) {
  assert.equal(decl[name], 'transparent', `printed, --${name} is the paper`);
}
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const enc = (c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)));
const toLab = ([r, g, b]) => {
  const [R, G, B] = [lin(r / 255), lin(g / 255), lin(b / 255)];
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B), m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B), s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const fromLab = ([L, a, b]) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [enc(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), enc(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), enc(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
};
/** A printed colour: var(--print-*) resolved from the paper's module (a hex, or a color-mix in OKLab of two hexes). */
const resolve = (value) => {
  const one = /^var\(--(print-[a-z0-9-]+)\)$/.exec(value);
  assert.ok(one && PRINT[one[1]], `a printed ink reads a paper token: ${value}`);
  const resolved = PRINT[one[1]];
  if (parseHex(resolved)) return parseHex(resolved);
  const mix = /^color-mix\(in oklab,(#[0-9a-f]{6}) (\d+)%,(#[0-9a-f]{6})\)$/i.exec(resolved);
  assert.ok(mix, `a paper token is a colour or a mix of two: ${resolved}`);
  const p = Number(mix[2]) / 100, a = toLab(parseHex(mix[1])), b = toLab(parseHex(mix[3]));
  return fromLab(a.map((v, i) => v * p + b[i] * (1 - p)));
};
const WHITE = parseHex('#ffffff');
let inkFloor = Infinity;
for (const name of ['ink-1', 'ink-2', 'ink-3', 'ink-4', 'text-accent', 'text-ok', 'text-warn', 'text-danger', 'text-info', 'text-own', 'text-enemy', 'text-squad']) {
  assert.ok(decl[name], `printed, --${name} is set for paper`);
  const ratio = contrastRatio(resolve(decl[name]), WHITE);
  inkFloor = Math.min(inkFloor, ratio);
  assert.ok(ratio >= 4.5, `printed, --${name} (${decl[name]}) holds 4.5:1 on white (${ratio.toFixed(2)})`);
}

// Chinese prints: the docs' faces (--font-ui, and --font-mono for the data) are the tokens' own stacks with Hiragino Sans GB
// ahead of PingFang SC, whose glyphs Chrome's PDF drops
const screen = read('src/ui/tokens/tokens.css');
const stack = (name) => new RegExp(`--${name}:([^;]+);`).exec(screen)[1];
assert.equal(decl['font-ui'], 'var(--print-font-ui)', 'printed, --font-ui reads the paper stack');
assert.equal(decl['font-mono'], 'var(--print-font-mono)', 'printed, --font-mono reads the paper stack');
assert.equal(PRINT['print-font-ui'], stack('font-ui').replace("'PingFang SC','Hiragino Sans GB'", "'Hiragino Sans GB','PingFang SC'"),
  'the paper UI stack is the token stack with Hiragino Sans GB before PingFang SC');
assert.equal(PRINT['print-font-mono'], stack('font-mono').replace('ui-monospace', "'Hiragino Sans GB',ui-monospace"),
  'the paper mono stack falls back to Hiragino Sans GB for Chinese');
// the game carries none of the paper: its token sheet and table hold no print-* token
assert.doesNotMatch(screen, /--print-/, "tokens.css carries none of the paper's tokens");
assert.ok(!Object.keys(TOKENS).some((name) => name.startsWith('print-')), "tokens.ts carries none of the paper's tokens");

// 3. the chrome stays on screen
// the selectors of every rule that hides, split at the top level of their :is() lists
const hiddenParts = [];
for (const m of inner.matchAll(/\{display:none\}/g)) {
  const start = Math.max(inner.lastIndexOf('}', m.index - 1), inner.lastIndexOf('{', m.index - 1)) + 1;
  let selector = inner.slice(start, m.index).replace(/\s+/g, '');
  if (selector.startsWith(':is(') && selector.endsWith(')')) selector = selector.slice(4, -1);
  let level = 0, from = 0;
  for (let i = 0; i <= selector.length; i++) {
    const c = selector[i];
    if (c === '(') level++;
    else if (c === ')') level--;
    else if ((c === ',' && level === 0) || i === selector.length) { hiddenParts.push(selector.slice(from, i)); from = i + 1; }
  }
}
for (const part of ['.public-skip', '.public-nav', '.docs-footer', '.dm-side', '.dm-search', '.dm-toc', '.dm-pager', '.cot-media-toggle', 'video']) {
  assert.ok(hiddenParts.includes(part), `printed, ${part} is hidden`);
}

// 4. page breaks, data backgrounds and outside links
assert.match(inner, /h1,h2,h3,h4,h5,h6\{break-after:avoid/, 'a heading keeps to what follows it');
assert.match(inner, /:is\(figure,\.dm-figure,[^)]*table[^)]*pre[^)]*\)\{break-inside:avoid\}/, 'figures, tables and code keep whole');
assert.match(inner, /figcaption\{break-before:avoid\}/, 'a caption keeps to its figure');
assert.match(inner, /html\{print-color-adjust:exact;-webkit-print-color-adjust:exact\}/, 'data backgrounds print as drawn');
assert.match(inner, /a\[href\^='http'\][^{]*::after\{content:' \(' attr\(href\) '\)'/, 'an outside link prints its address');

console.log(`docsPrint.selftest: one print block in the overrides layer, the docs' alone; paper surfaces, inks and tones ${inkFloor.toFixed(1)}:1 on white at worst; chrome hidden; page breaks PASS`);
