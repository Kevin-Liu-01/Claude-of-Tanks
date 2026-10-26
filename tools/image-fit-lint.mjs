// The image-fit lint (owner 2026-10-26, on the battle load screen: "there are still black bars above and below the images
// here!!! fix that!!! no more object containns LOL"). Copyright © 2026 Kevin B. Liu.
//
// A picture of the world (a scene, a background, footage, a photo) fills its box: object-fit or background-size cover,
// with its focal point declared (object-position or background-position), so no box ever shows bars. `contain` is right
// only for a transparent cutout (a tank render, an icon, a silhouette, a diagram, a logo), which draws no bars; each one
// is registered in src/ui/imageFitRegistry.ts with what it holds.
//
// scanImageFits(root) reads every module and page (src/**/*.{css,ts}, site/**/*.html, index.html, 404.html) and returns:
// - contain: each contain site, keyed by its CSS rule's selector, an inline style's target (`x.style.cssText`), or a
//   script line (`fit: 'contain'`, drawImageFit(…, 'contain'), objectFit = 'contain');
// - unfocused: each cover rule that declares no focal point, keyed by its selector.
// tools/image-fit-lint.selftest.mjs (core) fails on a contain site no cutout row names, a stale cutout row, and a cover
// rule without a focal point outside tools/image-fit-baseline.json (which only shrinks). The browser half, letterbox
// bands on the rendered load screen, end report and media pages, is tools/letterbox-bands.browser.mjs.
//
//   node tools/image-fit-lint.mjs              every contain site and unfocused cover rule, by file
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
/** The registry names selectors; it holds none of its own. */
const SKIP = new Set(['src/ui/imageFitRegistry.ts']);

/** Blank comments, keeping every offset and line break. */
function uncomment(text, kind) {
  const blank = (match) => match.replace(/[^\n]/g, ' ');
  const out = kind === 'html' ? text.replace(/<!--[\s\S]*?-->/g, blank) : text.replace(/\/\*[\s\S]*?\*\//g, blank);
  return kind === 'ts' ? out.replace(/(^|[^:\\'"`])\/\/[^\n]*/g, (match, lead) => lead + blank(match.slice(lead.length))) : out;
}

/** Template interpolations blanked too, offsets kept: `${x}` becomes `$___`, so a CSS-in-TS selector
 *  (`${WIDE} .cot-bl .map img`) reads as one token and its braces never open a rule. Keys are read from the
 *  uncommented text at the same offsets, interpolations and all. */
function neutralize(text) {
  let out = text;
  for (let pass = 0; pass < 3 && out.includes('${'); pass++) {
    out = out.replace(/\$\{[^{}]*\}/g, (match) => `$${'_'.repeat(match.length - 1)}`.replace(/_/g, (c, i) => (match[i + 1] === '\n' ? '\n' : c)));
  }
  return out;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;
const squash = (value) => value.replace(/\s+/g, ' ').trim();

/** The CSS rule around `index` (in `text`, read back from `source` at the same offsets): its selector and body, or null
 *  when the declaration is not inside one (an inline style). */
function ruleAt(text, index, source) {
  const open = text.lastIndexOf('{', index);
  const close = text.lastIndexOf('}', index);
  if (open < 0 || close > open) return null;
  const end = text.indexOf('}', index);
  const body = text.slice(open + 1, end < 0 ? text.length : end);
  // a rule's body is declarations: a script block has statements (`=`, `(` before a `:`), parentheses aside
  if (/[;{]\s*(?:const|let|return|if|for)\b|=>|\)\s*;\s*$/.test(body.slice(0, index - open))) return null;
  const from = text.lastIndexOf('}', open) + 1;
  const cut = text.slice(from, open).lastIndexOf('`');
  const selector = squash(source.slice(cut < 0 ? from : from + cut + 1, open).split(/\n\s*\n/).pop());
  if (!selector || /;\s*$/.test(selector) || /^(?:function|if|for|while|switch|else|try|catch|=>)\b/.test(selector)) return null;
  return { selector, body };
}

/** The fit sites in one source: contain sites and unfocused cover rules, with their keys and lines. */
export function scanFits(path, raw) {
  const kind = path.endsWith('.html') ? 'html' : path.endsWith('.css') ? 'css' : 'ts';
  const source = uncomment(raw, kind);
  const text = neutralize(source);
  const lines = source.split('\n');
  const contain = [];
  const unfocused = [];
  const seen = new Set();
  const once = (list, key, index) => {
    if (seen.has(`${list === contain}:${key}`)) return;
    seen.add(`${list === contain}:${key}`);
    list.push({ key, line: lineOf(text, index) });
  };
  for (const match of text.matchAll(/\b(object-fit|background-size)\s*:\s*([^;}"'`\n]*)/g)) {
    const value = match[2];
    const fit = /\bcontain\b/.test(value) ? 'contain' : /\bcover\b/.test(value) ? 'cover' : null;
    if (!fit) continue;
    const line = lines[lineOf(text, match.index) - 1];
    const inline = kind === 'ts' && /\.style\b|cssText|style=/.test(line) ? /([\w$.]+\.style(?:\.cssText)?)\s*[=+]/.exec(line)?.[1] ?? 'style' : null;
    const rule = inline ? null : ruleAt(text, match.index, source);
    if (fit === 'contain') { once(contain, rule ? rule.selector : `inline:${inline ?? squash(line).slice(0, 100)}`, match.index); continue; }
    if (rule && !/(object-position|background-position)\s*:/.test(rule.body)) once(unfocused, rule.selector, match.index);
  }
  if (kind === 'ts') {
    // a script asking for contain: an option, the canvas fit, a style property
    for (const match of text.matchAll(/\bfit\s*:\s*['"]contain['"]|drawImageFit\([^;]*['"]contain['"]\s*\)|\b(?:objectFit|backgroundSize)\s*=\s*['"]contain['"]/g)) {
      once(contain, `js:${squash(lines[lineOf(text, match.index) - 1]).slice(0, 120)}`, match.index);
    }
  }
  return { contain, unfocused };
}

/** Every source the lint reads, repo-relative. */
function sources(root) {
  const files = [];
  const walk = (dir, test) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, test);
      else if (test(name)) files.push(relative(root, path).split('\\').join('/'));
    }
  };
  walk(join(root, 'src'), (name) => /\.(ts|css)$/.test(name) && !/\.selftest\.|\.d\.ts$|\.test-support\.|\.test\.ts$/.test(name));
  walk(join(root, 'site'), (name) => name.endsWith('.html'));
  return [...files, 'index.html', '404.html'].filter((path) => !SKIP.has(path)).sort();
}

/** Every fit site in the checkout: { contain: [{ path, key, line }], unfocused: [{ path, key, line }] }. */
export function scanImageFits(root = ROOT) {
  const result = { contain: [], unfocused: [] };
  for (const path of sources(root)) {
    const raw = readFileSync(join(root, path), 'utf8');
    // a module that names no fit has none (the fleet's generated tables are megabytes)
    if (!/\bcontain\b|\bcover\b/.test(raw)) continue;
    const found = scanFits(path, raw);
    for (const site of found.contain) result.contain.push({ path, ...site });
    for (const site of found.unfocused) result.unfocused.push({ path, ...site });
  }
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { contain, unfocused } = scanImageFits();
  console.log('contain (a registered cutout, or a frame to fix):');
  for (const site of contain) console.log(`  ${site.path}:${site.line}  ${site.key}`);
  console.log('cover without a focal point:');
  for (const site of unfocused) console.log(`  ${site.path}:${site.line}  ${site.key}`);
  console.log(`${contain.length} contain sites, ${unfocused.length} unfocused cover rules`);
}
