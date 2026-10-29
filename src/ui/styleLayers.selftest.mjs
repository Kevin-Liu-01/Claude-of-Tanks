// styleLayers.selftest.mjs — the CSS architecture receipt (brand-ui SPEC §5, PLAN BUI-F3). Copyright © 2026 Kevin B. Liu.
//
// 1. The layer order is SPEC §5.1's; ensureStyle() wraps a sheet in its layer behind the order statement, once per id.
// 2. Every static stylesheet (src/**/*.css, public/**/*.css) and every inline <style> of a shipped or fixture HTML
//    document is: comments, @import, the order statement, then @layer <name>{...} blocks only (no unlayered rule).
// 3. CSS-in-TS enters the document only through ensureStyle() with a literal layer (no other style element,
//    constructed sheet or rule insertion).
// 4. Public pages: every stylesheet a document links is a Vite source (/src/...), so it ships hashed under /assets/ and
//    tools/vercel-output-immutable.mjs caches it for a year; the landing's home.css left public/.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(ROOT, path), 'utf8');
function walk(dir, accept, out = []) {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(path, accept, out); } else if (accept(entry.name)) out.push(path);
  }
  return out;
}

/* 1. order and helper ------------------------------------------------------------------------------------------ */
const elements = new Map();
const appended = [];
globalThis.document = {
  getElementById: (id) => elements.get(id) ?? null,
  createElement: (tag) => ({ tagName: tag.toUpperCase(), id: '', textContent: '' }),
  head: { appendChild(node) { appended.push(node); elements.set(node.id, node); } },
};
const { STYLE_LAYERS, STYLE_LAYER_ORDER, ensureStyle } = await import('./styleLayers.ts');
assert.deepEqual([...STYLE_LAYERS], ['reset', 'tokens', 'base', 'components', 'surfaces', 'utilities', 'overrides'],
  'the layer order is SPEC §5.1\'s, lowest priority first');
assert.equal(STYLE_LAYER_ORDER, `@layer ${STYLE_LAYERS.join(',')};`, 'the order statement lists the layers in order');
const injected = ensureStyle('probe-style', '.probe{color:var(--ink-1)}', 'surfaces');
assert.equal(injected.textContent, `${STYLE_LAYER_ORDER}@layer surfaces{.probe{color:var(--ink-1)}}`,
  'an injected sheet opens with the order and declares into its layer');
assert.equal(ensureStyle('probe-style', '.other{}', 'components'), injected, 'one sheet per id');
const firstPaint = { tagName: 'STYLE', id: 'first-paint', textContent: '@layer base{}' };
elements.set('first-paint', firstPaint);
assert.equal(ensureStyle('first-paint', '.x{}', 'base'), firstPaint, 'a first-paint copy in the HTML is reused untouched');
assert.equal(firstPaint.textContent, '@layer base{}');
assert.equal(appended.length, 1, 'nothing else is appended');

/* 2. every stylesheet declares into a layer -------------------------------------------------------------------- */
/** Top-level items of a stylesheet text: comments dropped, strings respected. */
function topLevel(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const items = [];
  let i = 0;
  while (i < text.length) {
    if (/\s/.test(text[i])) { i++; continue; }
    let j = i, depth = 0, quote = null;
    for (; j < text.length; j++) {
      const c = text[j];
      if (quote) { if (c === '\\') j++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') { if (--depth === 0) { j++; break; } }
      else if (c === ';' && depth === 0) { j++; break; }
    }
    items.push(text.slice(i, j).trim());
    i = j;
  }
  return items;
}
function layerViolations(css, label) {
  const out = [];
  let ordered = false, blocks = 0;
  for (const item of topLevel(css)) {
    if (/^@import\b/.test(item)) { if (ordered || blocks) out.push(`${label}: @import after the layer order`); continue; }
    if (item === STYLE_LAYER_ORDER) { ordered = true; continue; }
    const block = /^@layer\s+([a-z-]+)\s*\{/.exec(item);
    if (block) {
      if (!ordered) out.push(`${label}: @layer ${block[1]} before the layer order statement`);
      if (!STYLE_LAYERS.includes(block[1])) out.push(`${label}: unknown layer ${block[1]}`);
      blocks++;
      continue;
    }
    out.push(`${label}: unlayered "${item.slice(0, 80)}"`);
  }
  if (!blocks) out.push(`${label}: declares no layer`);
  return out;
}
assert.deepEqual(layerViolations(`${STYLE_LAYER_ORDER}@layer surfaces{.a{color:red}}.b{}`, 'probe'), ['probe: unlayered ".b{}"'],
  'an unlayered rule is caught');
assert.deepEqual(layerViolations('@layer surfaces{.a{}}', 'probe'), ['probe: @layer surfaces before the layer order statement'],
  'a sheet that would fix the order by itself is caught');

const sheets = [...walk('src', (name) => name.endsWith('.css')), ...walk('public', (name) => name.endsWith('.css'))].sort();
assert.ok(sheets.length >= 19, `the stylesheet census found ${sheets.length} files`);
const layerUse = {};
for (const path of sheets) {
  const css = read(path);
  assert.deepEqual(layerViolations(css, path), [], `${path} declares into the cascade layers`);
  for (const [, name] of css.matchAll(/@layer\s+([a-z-]+)\s*\{/g)) (layerUse[name] ??= []).push(path);
}
const documents = ['index.html', '404.html', ...walk('site', (name) => name.endsWith('.html')), ...walk('tools/fixtures', (name) => name.endsWith('.html'))];
let inlineSheets = 0;
for (const path of documents) {
  for (const [, css] of read(path).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    inlineSheets++;
    assert.deepEqual(layerViolations(css, `${path} <style>`), [], `${path}: every inline <style> declares into the cascade layers`);
  }
}
// The token sheet holds the tokens layer. Every sheet that existed before the layers sits in surfaces, so their
// contests resolve exactly as they did unlayered (specificity, then order); base and components fill as rules move
// there deliberately (BUI-F5 builds the components).
// The landing's, the manual's, the Gallery's and the technical diagrams' own token sheets (tools/gen-tokens.mjs "$sheet")
// hold their tokens in the same layer.
assert.deepEqual(layerUse.tokens?.sort(), ['src/ui/motion.css', 'src/ui/tokens/surface-badge-paper.css', 'src/ui/tokens/surface-badge.css', 'src/ui/tokens/surface-deploy.css', 'src/ui/tokens/surface-diagram.css', 'src/ui/tokens/surface-docs.css', 'src/ui/tokens/surface-gallery.css', 'src/ui/tokens/surface-home.css', 'src/ui/tokens/surface-print.css', 'src/ui/tokens/tokens.css'],
  'tokens.css, the surfaces\' own token sheets and the legacy motion aliases form the tokens layer');
assert.match(read('index.html'), /<style>\s*@layer reset,tokens,base,components,surfaces,utilities,overrides;\s*@layer surfaces \{\s*:root \{/,
  'the game document opens its first inline sheet with the layer order and keeps the document defaults in surfaces');
// The generated heads (each document's type head, the zh-CN label floor) declare into the layers too: unlayered, their
// rules would beat every layered rule whatever its specificity.
const { typeHead } = await import('./typeFaces.ts');
const { zhTypeFloorStyle } = await import('./zhTypeFloor.ts');
for (const [name, html] of [['type head', typeHead('ui mono body display-700')], ['zh-CN label floor', zhTypeFloorStyle('game')]]) {
  const css = /<style[^>]*>([\s\S]*)<\/style>/.exec(html)?.[1] ?? '';
  assert.deepEqual(layerViolations(css, name), [], `the ${name} declares into the cascade layers`);
}

/* 3. CSS-in-TS through ensureStyle only ------------------------------------------------------------------------ */
const sources = walk('src', (name) => /\.(?:ts|mts)$/.test(name) && !/\.d\.ts$/.test(name)).filter((path) => !/\.selftest\./.test(path));
const calls = [];
for (const path of sources) {
  const text = read(path);
  if (path === 'src/ui/styleLayers.ts') continue;
  assert.doesNotMatch(text, /createElement\(\s*['"`]style['"`]\s*\)/, `${path} injects CSS only through ensureStyle()`);
  assert.doesNotMatch(text, /adoptedStyleSheets|new CSSStyleSheet\b|\.insertRule\(/, `${path} builds no stylesheet outside ensureStyle()`);
  assert.doesNotMatch(text, /function ensureStyle\b/, `${path} defines no second style injector`);
  for (const m of text.matchAll(/\bensureStyle\(/g)) {
    // the call's third argument: the text up to the matching parenthesis, its last top-level argument
    let depth = 0, k = m.index + m[0].length - 1, quote = null, template = 0;
    for (; k < text.length; k++) {
      const c = text[k];
      if (quote) { if (c === '\\') k++; else if (c === quote) quote = null; continue; }
      if (c === '`') { template ^= 1; continue; }
      if (template) continue;
      if (c === "'" || c === '"') { quote = c; continue; }
      if (c === '(') depth++; else if (c === ')' && --depth === 0) break;
    }
    const call = text.slice(m.index, k + 1);
    const layer = /,\s*'([a-z]+)'\s*\)$/.exec(call)?.[1];
    assert.ok(layer && STYLE_LAYERS.includes(layer), `${path}: ensureStyle(...) names its layer (${call.slice(0, 60).replace(/\s+/g, ' ')}...)`);
    assert.match(text, /import \{[^}]*\bensureStyle\b[^}]*\} from '(?:\.\/|\.\.\/|\.\.\/ui\/)styleLayers\.ts'/, `${path} imports ensureStyle from styleLayers.ts`);
    calls.push(`${path}:${layer}`);
  }
}
assert.ok(calls.length >= 25, `${calls.length} CSS-in-TS sheets go through ensureStyle()`);
assert.doesNotMatch(read('src/ui/dom.ts'), /ensureStyle/, 'dom.ts no longer carries a style injector');

/* 4. public pages: hashed, immutable stylesheets ---------------------------------------------------------------- */
assert.ok(!existsSync(join(ROOT, 'public/home.css')), 'home.css left public/ (it was served unhashed, revalidated on every visit)');
assert.ok(existsSync(join(ROOT, 'src/presentation/home.css')), 'the landing stylesheet lives in the Vite graph');
const shipped = ['index.html', '404.html', ...walk('site', (name) => name.endsWith('.html'))];
for (const path of shipped) {
  for (const [tag] of read(path).matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
    const href = /href=["']([^"']+)["']/.exec(tag)?.[1] ?? '';
    assert.ok(href.startsWith('/src/'),
      `${path} links ${href}: every stylesheet is a Vite source, hashed under /assets/ and cached immutably`);
  }
}
assert.match(read('site/home.html'), /<link rel="stylesheet" href="\/src\/presentation\/home\.css">/, 'the landing links its stylesheet through the Vite graph');
const { HASHED_ASSET_RE } = await import('../../tools/vercel-output-immutable.mjs');
assert.ok(HASHED_ASSET_RE.test('home-a1b2c3d4.css'), 'a Vite-named stylesheet takes the immutable cache route');

console.log(`styleLayers: ${sheets.length} stylesheets and ${inlineSheets} inline sheets declare into the ${STYLE_LAYERS.length} layers; `
  + `${calls.length} CSS-in-TS sheets go through ensureStyle(); every linked stylesheet is hashed`);
