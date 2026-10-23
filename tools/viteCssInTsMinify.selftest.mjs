// viteCssInTsMinify.selftest.mjs — the build-time CSS-in-TS minifier (brand-ui BUI-F3, tools/viteCssInTsMinify.ts).
// Copyright © 2026 Kevin B. Liu.
//
// Comments and layout whitespace leave the CSS literals; strings, interpolation edges, tagged templates and every
// other literal stay as written. Proven on fixtures, then on every CSS literal of the sources: each one, minified by
// Lightning CSS (Vite's own CSS minifier) with its interpolations held as placeholders, gives byte for byte the same
// stylesheet before and after the transform, and the module still parses.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseAst } from 'rolldown/parseAst';
import { transform } from 'lightningcss';
import config from '../vite.config.ts';
import { cssInTsMinify, cssTokens, minifiedCssPieces, minifyCssLiterals, minifyCssPiece } from './viteCssInTsMinify.ts';

const ROOT = resolve(new URL('..', import.meta.url).pathname);

// the piece rules
assert.equal(minifyCssPiece('\n.cot-x {\n  color: red; /* note */\n  font: 800 9px/1 '), ' .cot-x{color: red;font: 800 9px/1 ',
  'comments go, line-breaking runs fold, whitespace beside { } ; goes, the edge before an interpolation keeps its space');
assert.equal(minifyCssPiece('/* header */\n.a{b:c}\n'), ' .a{b:c} ', 'a piece edge keeps one separator');
assert.equal(minifyCssPiece('.a,\n  .b { grid-template-areas:\n "a  b"\n "c d"; }'), '.a, .b{grid-template-areas: "a  b" "c d";}',
  'strings stay byte for byte; a selector list keeps its separator');
assert.equal(minifyCssPiece('content:"a ; { b }"; x:y'), 'content:"a ; { b }";x:y', 'nothing inside a string moves');
for (const [text, why] of [
  ['a/*x*/b', 'a comment wedged between two words may be joining them'],
  ['.a{b:c} /* open', 'an unterminated comment'],
  ['still */ .a{}', 'a stray terminator: the piece may start inside a comment'],
  ["content:'spliced ", 'a string spliced across an interpolation'],
]) assert.equal(minifyCssPiece(text), null, why);
assert.deepEqual(cssTokens('.a .b{ c : d  e }'), ['.a', '␣', '.b', '{', 'c', '␣', ':', '␣', 'd', '␣', 'e', '}'],
  'whitespace counts only between two tokens it separates');
assert.deepEqual(cssTokens('div/**/.x'), ['div', '.x'], 'a comment separates nothing');
assert.equal(minifiedCssPieces(['.a{b:c}']), null, 'a literal with nothing to fold is left alone');

// which literals: CSS / *_CSS constants and ensureStyle()'s sheet argument, never a tagged template or other text
{
  const code = [
    'const CSS = `\\n.a {\\n  color: red;\\n}\\n`;',
    'export const HUD_CSS = `\\n.b {\\n  z-index: 1;\\n}\\n`;',
    "ensureStyle('x', `\\n.c {\\n  top: 0;\\n}\\n`, 'surfaces');",
    'const HTML = `<div>\\n  <b>  kept  </b>\\n</div>`;',
    'const TAGGED_CSS = css`\\n.d {\\n  top: 0;\\n}\\n`;',
    "const FONT_CSS = ':root {\\n  --x: 1;\\n}';",
  ].join('\n');
  const result = minifyCssLiterals(code, 'probe.js');
  assert.ok(result, 'CSS literals found');
  assert.equal(result.literals, 4, 'three templates and one string literal rewritten');
  assert.match(result.code, /const CSS = ` \.a\{color: red;\} `;/);
  assert.match(result.code, /const HUD_CSS = ` \.b\{z-index: 1;\} `;/);
  assert.match(result.code, /ensureStyle\('x', ` \.c\{top: 0;\} `, 'surfaces'\);/);
  assert.match(result.code, /const HTML = `<div>\\n {2}<b> {2}kept {2}<\/b>\\n<\/div>`;/, 'markup is not CSS');
  assert.match(result.code, /css`\\n\.d \{\\n {2}top: 0;\\n\}\\n`/, 'a tagged template receives its raw text');
  assert.match(result.code, /const FONT_CSS = ":root\{--x: 1;\}";/);
  assert.equal(minifyCssLiterals('const X = 1;', 'none.js'), null);
}

// the plugin is registered for builds only
{
  const plugin = cssInTsMinify();
  assert.equal(plugin.name, 'cot-css-in-ts-minify');
  assert.equal(plugin.apply, 'build');
  assert.ok(config.plugins.flat().some((p) => p && p.name === 'cot-css-in-ts-minify'), 'vite.config.ts registers the minifier');
}

// every CSS literal of the sources: the same stylesheet after the transform
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walk(path);
  return /\.ts$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [path] : [];
});
const TARGETS = { chrome: 111 << 16, edge: 111 << 16, firefox: 114 << 16, safari: (16 << 16) | (4 << 8), ios_saf: (16 << 16) | (4 << 8) };
const lightning = (css, label) => new TextDecoder().decode(transform({ filename: label, code: Buffer.from(css), minify: true, targets: TARGETS, errorRecovery: true }).code);
/** Every CSS literal of a module as [label, cooked text with placeholders for its interpolations]. */
function cssLiterals(code, file) {
  const ast = parseAst(code, { lang: 'ts' }, file);
  const out = [];
  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) visit(child, parent); return; }
    if (node.type === 'TaggedTemplateExpression') return;
    const named = parent?.type === 'VariableDeclarator' && parent.init === node && parent.id?.type === 'Identifier' && /(?:^|_)CSS$/.test(parent.id.name);
    const injected = parent?.type === 'CallExpression' && parent.callee?.type === 'Identifier' && parent.callee.name === 'ensureStyle' && parent.arguments[1] === node;
    if ((named || injected) && node.type === 'TemplateLiteral') {
      out.push([`${relative(ROOT, file)}:${node.start}`, node.quasis.map((q, i) => q.value.cooked + (i < node.expressions.length ? `cotinterp${i}` : '')).join('')]);
      return;
    }
    if ((named || injected) && node.type === 'Literal' && typeof node.value === 'string') { out.push([`${relative(ROOT, file)}:${node.start}`, node.value]); return; }
    for (const key of Object.keys(node)) if (key !== 'type' && key !== 'start' && key !== 'end') visit(node[key], node);
  };
  visit(ast, null);
  return out;
}
let modules = 0, literals = 0, saved = 0, compared = 0;
for (const file of walk(join(ROOT, 'src'))) {
  const code = readFileSync(file, 'utf8');
  if (!/\b(?:CSS|ensureStyle)\b/.test(code)) continue;
  const result = minifyCssLiterals(code, file, 'ts');
  if (!result) continue;
  parseAst(result.code, { lang: 'ts' }, file); // still a module
  const before = cssLiterals(code, file), after = cssLiterals(result.code, file);
  assert.equal(after.length, before.length, `${relative(ROOT, file)}: the same CSS literals`);
  before.forEach(([label, css], index) => {
    const sheet = lightning(css, label);
    assert.ok(sheet.length > 0.5 * css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').length, `${label}: Lightning CSS reads the literal`);
    assert.equal(lightning(after[index][1], label), sheet, `${label}: the minified literal is the same stylesheet`);
    compared += sheet.length;
  });
  modules++;
  literals += result.literals;
  saved += result.saved;
}
assert.ok(modules >= 20 && literals >= 20, `${modules} modules, ${literals} CSS literals rewritten`);
assert.ok(compared > 150_000, `${compared} B of minified CSS compared`);
console.log(`viteCssInTsMinify: ${literals} CSS literals in ${modules} modules minify to the same stylesheets (Lightning CSS, ${compared} B); ${saved} source characters removed`);
