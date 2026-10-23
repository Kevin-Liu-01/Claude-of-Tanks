#!/usr/bin/env node
// style-literal-census.mjs — the style-literal ratchet (brand-ui SPEC §4.1, §5.4). Copyright © 2026 Kevin B. Liu.
//
// Counts the style values written as literals instead of design tokens, per file and per category:
//   colour         hex, rgb()/hsl()/hwb()/lab()/lch()/oklab()/oklch()/color() and named colours
//   fontSize       font-size, and the size inside a font shorthand
//   letterSpacing  non-zero letter-spacing
//   zIndex         z-index numbers
//   shadow         box-shadow / text-shadow values and drop-shadow() filters
//   duration       time values in transition* and animation* (and in custom properties)
//   important      !important
// across every stylesheet: .css files, CSS-in-TS (stylesheet template literals, style="..." attributes inside strings,
// .style.cssText / .style.setProperty() / .style.<prop> = literal) and the HTML entries' inline <style> blocks and
// style attributes (index.html, 404.html, site/*.html). The token package (src/ui/tokens/) is the one place literals
// belong and is not counted. A literal inside a var() fallback counts: the fallback is what renders without the token.
//
// tools/style-literal-baseline.json holds the committed counts, one line per file. The census fails when any file's
// count in any category rises above its baseline (a new file starts at zero), so new literals fail and tokens never
// do. `--write` rewrites the baseline from this tree and refuses while any category's total is above the committed
// total (moving CSS between files is fine; adding literals is not), so the baseline only falls.
//
//   node tools/style-literal-census.mjs            check against the baseline (exit 1 on a rise)
//   node tools/style-literal-census.mjs --write    lower the baseline to this tree
//   node tools/style-literal-census.mjs --json     print the per-file census
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_FILE = join(ROOT, 'tools', 'style-literal-baseline.json');
export const CATEGORIES = Object.freeze(['colour', 'fontSize', 'letterSpacing', 'zIndex', 'shadow', 'duration', 'important']);

/* ------------------------------------------------------------------------------------------------ values */

const NAMED_COLOURS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown '
  + 'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray '
  + 'darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue '
  + 'darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite '
  + 'forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory '
  + 'khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen '
  + 'lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime '
  + 'limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue '
  + 'mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive '
  + 'olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum '
  + 'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue '
  + 'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke '
  + 'yellow yellowgreen').split(' '));
const COLOUR_PROPERTY = /^(?:--|.*colou?r|background|border(?!-(?:radius|width|style|image-(?:width|slice|outset|repeat)|collapse|spacing))|outline(?!-(?:width|style|offset))|.*shadow|fill|stroke(?!-(?:width|linecap|linejoin|dasharray|dashoffset|miterlimit))|caret|accent|text-decoration|column-rule|filter|-webkit-text-stroke|mask)/;
const COLOUR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})(?![0-9a-z_-])/gi;
const LENGTH = /(?:^|[^\w-])-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|pt|pc|vw|vh|vmin|vmax|dvh|svh|lvh|dvw|ch|ex|cap|ic|lh|rlh|cqw|cqh|cqi|cqb|cqmin|cqmax|q|mm|cm|in)\b/i;
const SIZE_KEYWORD = /(?:^|[\s,/])(?:xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)(?=$|[\s,/])/i;
const TIME = /(?:^|[^\w.-])-?(?:\d+\.?\d*|\.\d+)m?s\b/gi;
const GLOBAL = /^(?:inherit|initial|unset|revert|revert-layer)$/i;
const strip = (value) => value.replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/gi, 'url()').replace(/"[^"]*"|'[^']*'/g, '""');
const tokenOnly = (value) => /^(?:var\(--[\w-]+\)\s*)+$/.test(value.trim());

/** Literal counts of one declaration (property already lower-case, value without !important). */
export function declarationLiterals(property, rawValue, important = false) {
  const out = {};
  const add = (category, n = 1) => { if (n) out[category] = (out[category] ?? 0) + n; };
  if (important) add('important');
  const value = strip(String(rawValue).trim());
  if (!value || GLOBAL.test(value) || tokenOnly(value)) return out;
  const prop = property.toLowerCase();
  if (!/^(?:font-family|content|grid-template-areas|quotes|src|unicode-range|font-feature-settings|font-variation-settings)$/.test(prop)) {
    add('colour', (value.match(HEX) ?? []).length + (value.match(COLOUR_FUNCTION) ?? []).length);
    if (COLOUR_PROPERTY.test(prop)) {
      // words only: custom-property names and function names (tan(), drop-shadow()) are not colours
      const words = value.toLowerCase().replace(/--[\w-]+/g, ' ').replace(/[a-z-]+\(/g, '(');
      for (const word of words.match(/[a-z]+(?:-[a-z]+)*/g) ?? []) if (NAMED_COLOURS.has(word)) add('colour');
    }
  }
  if (prop === 'font-size') { if (LENGTH.test(value) || SIZE_KEYWORD.test(value) || /^\d/.test(value)) add('fontSize'); }
  else if (prop === 'font') { if (LENGTH.test(value) || SIZE_KEYWORD.test(value)) add('fontSize'); }
  if (prop === 'letter-spacing' && /(?:^|[^\w.-])-?(?:\d*\.)?\d*[1-9]/.test(value)) add('letterSpacing');
  if (prop === 'z-index' && /\d/.test(value) && !/^auto$/i.test(value)) add('zIndex');
  if (/^(?:-webkit-)?(?:box-shadow|text-shadow)$/.test(prop) && !/^none$/i.test(value)) add('shadow');
  if (/^(?:-webkit-)?(?:backdrop-)?filter$/.test(prop)) add('shadow', (value.match(/drop-shadow\(/gi) ?? []).length);
  // times are unambiguous, so a custom property holding one (--fade: 180ms) counts as well
  if (/^(?:-webkit-)?(?:transition|animation)(?:-duration|-delay)?$|^--/.test(prop)) add('duration', (value.match(TIME) ?? []).length);
  return out;
}

/* ------------------------------------------------------------------------------------------------ CSS text */

/** Every declaration of a stylesheet text (nested at-rules included): [{ property, value, important }]. */
export function cssDeclarations(text, { inline = false } = {}) {
  const css = String(text).replace(/\/\*[\s\S]*?\*\//g, '');
  const decls = [];
  const readDecls = (body) => {
    let depth = 0, quote = null, start = 0;
    const flush = (end) => {
      const part = body.slice(start, end).trim(); start = end + 1;
      const colon = part.indexOf(':');
      if (colon <= 0) return;
      const property = part.slice(0, colon).trim().toLowerCase();
      if (!/^(?:--[\w-]+|-?[a-z][a-z-]*)$/.test(property)) return;
      let value = part.slice(colon + 1).trim();
      const important = /!\s*important\s*$/i.test(value);
      if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
      decls.push({ property, value, important });
    };
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; continue; }
      if (ch === '(') depth++; else if (ch === ')') depth--;
      else if (ch === ';' && depth <= 0) flush(i);
    }
    flush(body.length);
  };
  if (inline) { readDecls(css); return decls; }
  // blocks: a block whose body holds a nested block is a container (@media, @layer, @supports, nesting)
  const walk = (from, to) => {
    let i = from, quote = null, segment = from;
    while (i < to) {
      const ch = css[i];
      if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; i++; continue; }
      if (ch === '"' || ch === "'") { quote = ch; i++; continue; }
      if (ch === '{') {
        let depth = 1, j = i + 1, q = null;
        for (; j < to && depth; j++) {
          const c = css[j];
          if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
          if (c === '"' || c === "'") q = c; else if (c === '{') depth++; else if (c === '}') depth--;
        }
        const body = css.slice(i + 1, j - 1);
        if (body.includes('{')) {
          // declarations before the first nested block belong to this block (CSS nesting), the rest is rules
          walk(i + 1, j - 1);
        } else readDecls(body);
        i = j; segment = j; continue;
      }
      if (ch === ';') segment = i + 1;
      i++;
    }
    void segment;
  };
  walk(0, css.length);
  return decls;
}

/* ------------------------------------------------------------------------------------------------ CSS in TS */

const KNOWN_PROPERTY = /(?:^|[{;\s])(?:--[\w-]+|-webkit-[a-z-]+|align-[a-z]+|animation[a-z-]*|aspect-ratio|backdrop-filter|background[a-z-]*|border[a-z-]*|bottom|box-[a-z-]+|clip-path|color|column-gap|contain|content|cursor|display|fill|filter|flex[a-z-]*|font[a-z-]*|gap|grid[a-z-]*|height|inset[a-z-]*|isolation|justify-[a-z]+|left|letter-spacing|line-height|margin[a-z-]*|mask[a-z-]*|max-[a-z]+|min-[a-z]+|mix-blend-mode|object-[a-z]+|opacity|order|outline[a-z-]*|overflow[a-z-]*|padding[a-z-]*|place-[a-z]+|pointer-events|position|right|row-gap|scrollbar-[a-z]+|stroke[a-z-]*|text-[a-z-]+|top|touch-action|transform[a-z-]*|transition[a-z-]*|translate|user-select|visibility|white-space|width|will-change|word-[a-z]+|z-index)\s*:\s*[^;{}]+/;
// a rule block holding a known property: `{ ... color: ... }` (the prelude is not needed to tell, and scanning for it
// backtracks over long data strings)
const STYLESHEET = new RegExp(`\\{[^{}]*?${KNOWN_PROPERTY.source}`);

/** The string literals of a JS/TS source, interpolations replaced by var(--interpolated): [{ text, template, at }]. */
export function stringLiterals(source) {
  const out = [];
  const n = source.length;
  let i = 0;
  const template = (start) => { // source[start] === '`'; returns end index (after the closing backtick)
    let text = '', k = start + 1;
    while (k < n) {
      const ch = source[k];
      if (ch === '\\') { text += source[k + 1] ?? ''; k += 2; continue; }
      if (ch === '`') { out.push({ text, template: true, at: start }); return k + 1; }
      if (ch === '$' && source[k + 1] === '{') { text += 'var(--interpolated)'; k = code(k + 2, '}'); continue; }
      text += ch; k++;
    }
    return n;
  };
  const quoted = (start) => { // single line only, so a regex literal never swallows the file
    const q = source[start]; let k = start + 1, text = '';
    while (k < n) {
      const ch = source[k];
      if (ch === '\n') return start + 1;
      if (ch === '\\') { text += source[k + 1] ?? ''; k += 2; continue; }
      if (ch === q) { out.push({ text, template: false, at: start }); return k + 1; }
      text += ch; k++;
    }
    return n;
  };
  const code = (k, close) => { // scan code until the matching close brace; returns index after it
    let depth = 0;
    while (k < n) {
      const ch = source[k];
      if (ch === '/' && source[k + 1] === '/') { const e = source.indexOf('\n', k); k = e < 0 ? n : e; continue; }
      if (ch === '/' && source[k + 1] === '*') { const e = source.indexOf('*/', k + 2); k = e < 0 ? n : e + 2; continue; }
      if (ch === '`') { k = template(k); continue; }
      if (ch === '"' || ch === "'") { k = quoted(k); continue; }
      if (ch === '{') depth++;
      if (ch === '}') { if (close && depth === 0) return k + 1; depth--; }
      k++;
    }
    return n;
  };
  i = code(0, null);
  void i;
  return out;
}

const camelToKebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Declarations written in a JS/TS source's CSS contexts. */
export function scriptDeclarations(source) {
  const decls = [];
  for (const literal of stringLiterals(source)) {
    const text = literal.text;
    if (STYLESHEET.test(text)) { decls.push(...cssDeclarations(text)); continue; }
    for (const m of text.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) decls.push(...cssDeclarations(m[1] ?? m[2], { inline: true }));
  }
  // element.style assignments: cssText, setProperty and single properties set to a literal
  const STRING = String.raw`(?:'([^'\n]*)'|"([^"\n]*)"|\x60([^\x60]*)\x60|(-?\d+(?:\.\d+)?)\b)`;
  for (const m of source.matchAll(new RegExp(String.raw`\.style\.cssText\s*\+?=\s*${STRING}`, 'g'))) {
    decls.push(...cssDeclarations((m[1] ?? m[2] ?? m[3] ?? '').replace(/\$\{[^}]*\}/g, 'var(--interpolated)'), { inline: true }));
  }
  for (const m of source.matchAll(new RegExp(String.raw`\.style\.setProperty\(\s*['"]([\w-]+)['"]\s*,\s*${STRING}`, 'g'))) {
    decls.push({ property: m[1].toLowerCase(), value: (m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').replace(/\$\{[^}]*\}/g, 'var(--interpolated)'), important: false });
  }
  for (const m of source.matchAll(new RegExp(String.raw`\.style\.(?!cssText\b|setProperty\b)([a-zA-Z]+)\s*=\s*${STRING}`, 'g'))) {
    decls.push({ property: camelToKebab(m[1]), value: (m[2] ?? m[3] ?? m[4] ?? m[5] ?? '').replace(/\$\{[^}]*\}/g, 'var(--interpolated)'), important: false });
  }
  return decls;
}

/** Declarations of an HTML document: inline <style> blocks, style attributes and inline scripts' CSS contexts. */
export function htmlDeclarations(html) {
  const decls = [];
  const text = String(html).replace(/<!--[\s\S]*?-->/g, '');
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) decls.push(...cssDeclarations(m[1]));
  for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) decls.push(...scriptDeclarations(m[1]));
  const markup = text.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  for (const m of markup.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) decls.push(...cssDeclarations(m[1] ?? m[2], { inline: true }));
  return decls;
}

/* ------------------------------------------------------------------------------------------------ census */

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);
function walk(dir, accept, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), accept, out); continue; }
    if (accept(entry.name)) out.push(join(dir, entry.name));
  }
  return out;
}

/** The files the census reads, repo-relative (the token package, selftests and fixtures excluded). */
export function censusFiles(root = ROOT) {
  const files = [
    ...walk(join(root, 'src'), (name) => /\.(?:css|ts|mts)$/.test(name) && !/\.d\.ts$/.test(name) && !/\.selftest\./.test(name)),
    ...walk(join(root, 'public'), (name) => name.endsWith('.css')),
    ...walk(join(root, 'site'), (name) => name.endsWith('.html')),
    ...['index.html', '404.html'].map((name) => join(root, name)).filter((path) => existsSync(path)),
  ];
  return files.map((path) => relative(root, path).split('\\').join('/')).filter((path) => !path.startsWith('src/ui/tokens/')).sort();
}

/** Literal counts of one file's text. */
export function fileCensus(path, text) {
  const decls = path.endsWith('.css') ? cssDeclarations(text) : path.endsWith('.html') ? htmlDeclarations(text) : scriptDeclarations(text);
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const d of decls) for (const [c, n] of Object.entries(declarationLiterals(d.property, d.value, d.important))) counts[c] += n;
  return counts;
}

/** Per-file counts of the tree (files without a literal omitted). */
export function census(root = ROOT) {
  const files = {};
  for (const path of censusFiles(root)) {
    const counts = fileCensus(path, readFileSync(join(root, path), 'utf8'));
    if (Object.values(counts).some(Boolean)) files[path] = counts;
  }
  return files;
}

export function totals(files) {
  const sum = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
  for (const counts of Object.values(files)) for (const c of CATEGORIES) sum[c] += counts[c] ?? 0;
  return sum;
}

/** Rises against the baseline: [{ file, category, baseline, current }]. */
export function rises(current, baseline) {
  const out = [];
  for (const [file, counts] of Object.entries(current)) {
    for (const c of CATEGORIES) {
      const was = baseline[file]?.[c] ?? 0;
      if ((counts[c] ?? 0) > was) out.push({ file, category: c, baseline: was, current: counts[c] });
    }
  }
  return out;
}

/** Categories whose total would rise from `baseline` to `current` ("colour 2 -> 3"): a write that raises one is refused. */
export function totalRises(current, baseline) {
  const now = totals(current), was = totals(baseline);
  return CATEGORIES.filter((c) => now[c] > was[c]).map((c) => `${c} ${was[c]} -> ${now[c]}`);
}

/** The baseline file text: one line per file, so parallel lanes touching different files merge cleanly. */
export function baselineText(files) {
  const lines = Object.keys(files).sort().map((file) => {
    const counts = CATEGORIES.map((c) => `"${c}":${files[file][c] ?? 0}`).join(',');
    return `    ${JSON.stringify(file)}: {${counts}}`;
  });
  return `{\n  "note": "Style literals outside the token package, per file (tools/style-literal-census.mjs). A count may only fall: `
    + `new literals fail npm test; after removing some, lower this file with node tools/style-literal-census.mjs --write.",\n`
    + `  "categories": ${JSON.stringify(CATEGORIES)},\n  "files": {\n${lines.join(',\n')}\n  }\n}\n`;
}

export function readBaseline(path = BASELINE_FILE) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).files ?? {} : {};
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  const current = census();
  if (args.has('--json')) { console.log(JSON.stringify({ totals: totals(current), files: current }, null, 1)); process.exit(0); }
  const baseline = readBaseline();
  const now = totals(current), was = totals(baseline);
  const table = CATEGORIES.map((c) => `${c} ${now[c]}${was[c] !== now[c] ? ` (baseline ${was[c]})` : ''}`).join(', ');
  if (args.has('--write')) {
    const up = Object.keys(baseline).length ? totalRises(current, baseline) : [];
    if (up.length) {
      console.error(`style-literal-census: refusing to raise the baseline (${up.join(', ')}); replace the new literals with tokens`);
      process.exit(1);
    }
    writeFileSync(BASELINE_FILE, baselineText(current));
    console.log(`style-literal-census: baseline written (${Object.keys(current).length} files): ${table}`);
    process.exit(0);
  }
  const up = rises(current, baseline);
  if (up.length) {
    console.error(`style-literal-census: FAIL — ${up.length} count(s) rose above tools/style-literal-baseline.json; use design tokens (src/ui/tokens/tokens.json):`);
    for (const r of up.slice(0, 60)) console.error(`  ${r.file}: ${r.category} ${r.baseline} -> ${r.current}`);
    process.exit(1);
  }
  const fell = CATEGORIES.filter((c) => now[c] < was[c]);
  console.log(`style-literal-census: PASS — ${table}${fell.length ? '; the baseline can fall: node tools/style-literal-census.mjs --write' : ''}`);
}
