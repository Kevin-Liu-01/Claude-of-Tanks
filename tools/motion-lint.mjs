#!/usr/bin/env node
// motion-lint.mjs — the static motion lint (UI-LOCKDOWN part D, "no lossy animation"). Copyright © 2026 Kevin B. Liu.
//
// Reads every stylesheet the game and the public site ship, as tools/style-literal-census.mjs does: .css files,
// CSS-in-TS (stylesheet templates, style="..." attributes, element.style writes, WAAPI animate() calls) and the HTML
// entries' inline <style> blocks, style attributes and scripts. Per file it counts the motion that can be lossy:
//   layout    a transition or @keyframes step that animates a layout property (width, top, margin, padding, all...)
//   paint     ... a paint property that repaints a wide area (shadows, filter, backdrop, clip-path, masks, a custom
//             property, a background position or size, a dash offset)
//   colour    ... a colour (color, background-color, border-color, fill, stroke...): a small repaint, still not the
//             compositor's, so a large layer converts first (an overlay fading its opacity)
//   duration  a literal duration in a transition or animation (or a time in a custom property) instead of a --dur-*
//             token; delays and staggers are choreography and are not counted
//   reduced   a transition or animation with no prefers-reduced-motion path
//   raf       a requestAnimationFrame loop that writes element styles every frame
//   raster    raster or video UI chrome: a logo, brand or partner mark, spinner, loader, the logo's rumble, any GIF
// Only transform, opacity, translate, rotate and scale animate on the compositor. A discrete flip (visibility,
// display, overlay, content-visibility) costs one style change, not one a frame. A time of 1 ms or less is the
// reduced-motion collapse, not a duration.
//
// A reduced-motion path is one of: every duration slot reads a motion token (they collapse to 1 ms under the reduce
// preset, src/ui/tokens/tokens.css) and the animation is finite (an infinite one at 1 ms strobes); the rule sits in
// a (prefers-reduced-motion: no-preference) block; or a (prefers-reduced-motion: reduce) or [data-motion=reduce] rule
// in the same file sets transition or animation on the same class (a `*` subject covers the file). Script motion
// (animate()) needs a reduced-motion read in its file.
//
// tools/motion-allowlist.json holds the measured exceptions (each with its reason and its measurement); an allowed
// finding is not counted. tools/motion-lint-baseline.json holds the per-file counts: the lint fails when any file's
// count of any rule rises above it (a new file starts at zero), and --write refuses to raise a rule's total, so the
// baseline only falls.
//
//   node tools/motion-lint.mjs            check against the baseline (exit 1 on a rise)
//   node tools/motion-lint.mjs --report   every counted finding with file:line, grouped by file (for routing)
//   node tools/motion-lint.mjs --write    lower the baseline to this tree
//   node tools/motion-lint.mjs --json     the findings and the per-file counts
//   --root=<checkout>                     read another checkout (its own baseline and allowlist)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE_FILE = 'tools/motion-lint-baseline.json';
export const ALLOWLIST_FILE = 'tools/motion-allowlist.json';
export const RULES = Object.freeze(['layout', 'paint', 'colour', 'duration', 'reduced', 'raf', 'raster']);

/* ------------------------------------------------------------------------------------------------ properties */

const COMPOSITOR = new Set(['transform', 'opacity', 'translate', 'rotate', 'scale']);
const DISCRETE = new Set(['visibility', 'display', 'overlay', 'content-visibility']);
const KEYFRAME_META = new Set(['animation-timing-function', 'animation-composition']);
const LAYOUT = /^(?:all|width|height|(?:min|max)-(?:width|height|block-size|inline-size)|block-size|inline-size|top|right|bottom|left|inset(?:-[a-z-]+)?|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?(?:-width)?|font(?:-size|-weight|-stretch|-family)?|line-height|letter-spacing|word-spacing|text-indent|gap|row-gap|column-gap|grid(?:-[a-z-]+)?|flex(?:-[a-z-]+)?|order|aspect-ratio|position|float|columns|column-width|vertical-align|white-space)$/;

/** A property whose animation moves something (what reduced motion is for); a fade or a colour change does not. */
export function moves(property) {
  const prop = property.toLowerCase().replace(/^-webkit-/, '');
  return /^(?:transform|translate|rotate|scale|transform-origin|background-position|background-size|object-position|clip-path|mask-position|mask-size|offset[a-z-]*|stroke-dash[a-z]+|perspective[a-z-]*)$/.test(prop)
    || propertyClass(prop) === 'layout';
}

const COLOUR = /^(?:color|background|background-color|border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-color|outline-color|text-decoration-color|text-emphasis-color|caret-color|accent-color|column-rule-color|fill|stroke|stop-color|flood-color|lighting-color|text-fill-color|text-stroke-color)$/;

/** 'layout', 'paint', 'colour', or null for a compositor property or a discrete flip. */
export function propertyClass(property) {
  const prop = property.toLowerCase().replace(/^-webkit-/, '');
  if (COMPOSITOR.has(prop) || DISCRETE.has(prop)) return null;
  return LAYOUT.test(prop) ? 'layout' : COLOUR.test(prop) ? 'colour' : 'paint';
}

/* ------------------------------------------------------------------------------------------------ values */

const TIME = /^(-?(?:\d+\.?\d*|\.\d+))(m?s)$/i;
const TIME_IN_TEXT = /(?:^|[^\w.$-])(-?(?:\d+\.?\d*|\.\d+))(m?s)\b/gi;
const JS_TIME = /var\(--interpolated\)\s*m?s\b/gi; // `${ms}ms` in a template: a JS number written as a time
const EASING_VAR = /^--(?:cot-)?ease-/;
const timeMs = (num, unit) => parseFloat(num) * (unit.toLowerCase() === 's' ? 1000 : 1);

/** Split a value on a top-level separator (',' or whitespace), keeping parentheses and quotes whole. */
function splitTop(value, comma = true) {
  const out = []; let depth = 0, quote = null, cur = '';
  for (const ch of String(value)) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++; else if (ch === ')') depth--;
    if (depth === 0 && (comma ? ch === ',' : /\s/.test(ch))) { if (cur.trim()) out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** The value with every var() that reads a motion token removed (fallback included). */
function stripMotionVars(value, motion) {
  let out = '', i = 0;
  const text = String(value);
  while (i < text.length) {
    const at = text.indexOf('var(', i);
    if (at < 0) { out += text.slice(i); break; }
    let depth = 0, j = at + 3;
    for (; j < text.length; j++) { if (text[j] === '(') depth++; else if (text[j] === ')' && --depth === 0) break; }
    const name = /^var\(\s*(--[\w-]+)/.exec(text.slice(at))?.[1];
    out += text.slice(i, at) + (name && motion.has(name) ? ' ' : text.slice(at, j + 1));
    i = j + 1;
  }
  return out;
}

/** Time literals above 1 ms in a value, motion-token reads not counted (`${n}ms` interpolations count). */
export function durationLiterals(value, motion) {
  const text = stripMotionVars(value, motion).replace(/url\([^)]*\)|"[^"]*"|'[^']*'/g, ' ');
  let n = (text.match(JS_TIME) ?? []).length;
  for (const m of text.matchAll(TIME_IN_TEXT)) if (timeMs(m[1], m[2]) > 1) n++; // a negative delay is a loop's phase
  return n;
}

/** A value that reads only motion tokens and times of 1 ms or less (calc() of them included). */
function motionValue(value, motion) {
  const rest = stripMotionVars(value, motion);
  const times = [...rest.matchAll(TIME_IN_TEXT)];
  if (times.some((m) => timeMs(m[1], m[2]) > 1) || (rest === value && !times.length)) return false;
  return rest.replace(TIME_IN_TEXT, ' ').replace(/calc\(|[()*/+\s\d.-]/gi, '') === '';
}

/** One token of a transition or animation item: { kind: time|var|ease|word|number, collapses? }. */
function slotToken(token, motion) {
  const t = TIME.exec(token);
  if (t) {
    const ms = timeMs(t[1], t[2]);
    return { kind: 'time', zero: ms === 0, collapses: Math.abs(ms) <= 1, literal: ms > 1 };
  }
  if (/^var\(--interpolated\)\s*m?s$/i.test(token)) return { kind: 'time', zero: false, collapses: false, literal: true };
  if (/^(?:cubic-bezier|steps|linear)\(/i.test(token)) return { kind: 'ease' };
  const v = /^var\(\s*(--[\w-]+)/.exec(token);
  if (v) {
    if (motion.has(v[1])) return { kind: 'time', zero: false, collapses: true };
    if (EASING_VAR.test(v[1])) return { kind: 'ease' };
    return { kind: 'var', name: v[1] };
  }
  if (/^calc\(/i.test(token)) {
    const literal = durationLiterals(token, motion) > 0 || /var\(--(?!(?:cot-)?ease-)/.test(stripMotionVars(token, motion));
    return { kind: 'time', zero: false, collapses: !literal, literal: durationLiterals(token, motion) > 0 };
  }
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(token)) return { kind: 'number' };
  return { kind: 'word', word: token.toLowerCase() };
}

const TRANSITION_WORDS = new Set(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end', 'allow-discrete', 'normal']);
const ANIMATION_WORDS = new Set(['infinite', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'none', 'forwards', 'backwards', 'both', 'running', 'paused', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear', 'step-start', 'step-end']);

/** The items of a transition shorthand: [{ properties, duration: slot|null }] ('all' when none is named). */
export function transitionItems(value, motion) {
  if (/^\s*none\s*$/i.test(value)) return [];
  return splitTop(value).map((item) => {
    const slots = splitTop(item, false).map((token) => ({ token, ...slotToken(token, motion) }));
    const named = slots.filter((s) => s.kind === 'word' && !TRANSITION_WORDS.has(s.word)).map((s) => s.word);
    const times = slots.filter((s) => s.kind === 'time' || s.kind === 'var');
    return { properties: named.length ? named : ['all'], duration: times[0] ?? null };
  });
}

/** The items of an animation shorthand: [{ name, duration: slot|null, infinite }]. */
export function animationItems(value, motion) {
  if (/^\s*none\s*$/i.test(value)) return [];
  return splitTop(value).map((item) => {
    const slots = splitTop(item, false).map((token) => ({ token, ...slotToken(token, motion) }));
    const name = slots.find((s) => s.kind === 'word' && !ANIMATION_WORDS.has(s.word))?.word ?? null;
    const times = slots.filter((s) => s.kind === 'time' || s.kind === 'var');
    return { name, duration: times[0] ?? null, infinite: slots.some((s) => s.word === 'infinite') };
  });
}

/* ------------------------------------------------------------------------------------------------ text */

/** offset -> 1-based line of a text. */
function lineCounter(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= offset) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

const blank = (s) => s.replace(/[^\n]/g, ' ');

/**
 * The rules of a stylesheet text, nested at-rules and CSS nesting included:
 * [{ selector, prelude, ancestors, keyframes, decls: [{ property, value, line }], line }].
 */
export function parseSheet(text, lineAt = lineCounter(String(text))) {
  const css = String(text).replace(/\/\*[\s\S]*?\*\//g, blank);
  const rules = [];
  const stack = [];
  let seg = 0, quote = null, depth = 0;
  const top = () => stack[stack.length - 1];
  const declaration = (start, end) => {
    const raw = css.slice(start, end);
    const part = raw.trim();
    const frame = top();
    if (!part || !frame || part.startsWith('@')) return;
    const colon = part.indexOf(':');
    if (colon <= 0) return;
    const property = part.slice(0, colon).trim().toLowerCase();
    if (!/^(?:--[\w-]+|-?[a-z][a-z-]*)$/.test(property)) return;
    const value = part.slice(colon + 1).replace(/!\s*important\s*$/i, '').trim();
    frame.decls.push({ property, value, line: lineAt(start + raw.length - raw.trimStart().length) });
  };
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); continue; }
    if (depth) continue;
    if (ch === '{') {
      const raw = css.slice(seg, i);
      const prelude = raw.trim().replace(/\s+/g, ' ');
      const parent = top();
      const keyframes = parent?.keyframes ?? (/^@(?:-webkit-)?keyframes\s/i.test(prelude) ? prelude.split(' ')[1] : null);
      let selector = parent?.selector ?? null;
      if (!keyframes && !prelude.startsWith('@')) {
        selector = !selector ? prelude : prelude.includes('&') ? prelude.replaceAll('&', selector) : `${selector} ${prelude}`;
      }
      stack.push({ prelude, selector, keyframes, ancestors: stack.map((f) => f.prelude), decls: [], line: lineAt(seg + raw.length - raw.trimStart().length) });
      seg = i + 1;
    } else if (ch === '}') {
      declaration(seg, i);
      const frame = stack.pop();
      if (frame?.decls.length) rules.push(frame);
      seg = i + 1;
    } else if (ch === ';') { declaration(seg, i); seg = i + 1; }
  }
  return rules;
}

/** An inline declaration list (a style attribute, cssText) as one rule. */
function inlineRule(text, selector, lineAt) {
  const [rule] = parseSheet(`x{${text}}`, (offset) => lineAt(Math.max(0, offset - 2)));
  return rule ? { ...rule, selector, prelude: selector } : null;
}

/** The string literals of a JS/TS source with a source offset per character (interpolations as var(--interpolated)). */
function scriptLiterals(source) {
  const out = [];
  const n = source.length;
  const code = (k, close) => {
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
  const template = (start) => {
    let text = ''; const at = []; let k = start + 1;
    while (k < n) {
      const ch = source[k];
      if (ch === '\\') { text += source[k + 1] ?? ''; at.push(k); k += 2; continue; }
      if (ch === '`') { out.push({ text, at, start, end: k + 1, template: true }); return k + 1; }
      if (ch === '$' && source[k + 1] === '{') {
        const s = 'var(--interpolated)'; text += s; for (let q = 0; q < s.length; q++) at.push(k);
        k = code(k + 2, '}'); continue;
      }
      text += ch; at.push(k); k++;
    }
    return n;
  };
  const quoted = (start) => { // single line only, so a regex literal never swallows the file
    const q = source[start]; let k = start + 1, text = ''; const at = [];
    while (k < n) {
      const ch = source[k];
      if (ch === '\n') return start + 1;
      if (ch === '\\') { text += source[k + 1] ?? ''; at.push(k); k += 2; continue; }
      if (ch === q) { out.push({ text, at, start, end: k + 1, template: false }); return k + 1; }
      text += ch; at.push(k); k++;
    }
    return n;
  };
  code(0, null);
  return out;
}

/** The source with comments, strings and templates blanked (offsets and lines kept): code structure only. */
function maskCode(source) {
  const chars = source.split('');
  const fill = (from, to) => { for (let k = from; k < to; k++) if (chars[k] !== '\n') chars[k] = ' '; };
  for (const lit of scriptLiterals(source)) fill(lit.start + 1, lit.end - 1);
  let masked = chars.join('');
  masked = masked.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:\\])\/\/[^\n]*/g, (m, lead) => lead + blank(m.slice(lead.length)));
  return masked;
}

const camelToKebab = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const MOTION_DECL = /(?:^|[{;\s"'`])(?:-webkit-)?(?:transition|animation)(?:-[a-z]+)*\s*:/;
const CANDIDATE = /@(?:-webkit-)?keyframes|(?:^|[{;\s"'`])(?:-webkit-)?(?:transition|animation)(?:-[a-z]+)*\s*:|--[\w-]+\s*:[^;{}]*?\d\s*m?s\b/;
const STYLE_PROPS = /^(?:webkit)?(?:transition|animation)(?:Property|Duration|Delay|Name|IterationCount|TimingFunction)?$|^(?:Webkit)(?:Transition|Animation)/;

/** The style contexts of a JS/TS source: rules from stylesheet templates, style attributes and element.style writes. */
export function scriptRules(source, lineAt = lineCounter(source)) {
  const rules = [];
  if (!CANDIDATE.test(source) && !source.includes('.style.')) return rules;
  for (const lit of scriptLiterals(source)) {
    if (!CANDIDATE.test(lit.text)) continue;
    const litLine = (p) => lineAt(lit.at[Math.min(Math.max(0, p), lit.at.length - 1)] ?? lit.start);
    if (lit.text.includes('{')) rules.push(...parseSheet(lit.text, litLine));
    for (const m of lit.text.matchAll(/\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const body = m[1] ?? m[2];
      const offset = m.index + m[0].indexOf(body);
      const rule = inlineRule(body, '[style]', (p) => litLine(offset + p));
      if (rule) rules.push(rule);
    }
  }
  // element.style writes: cssText, setProperty and single motion properties set to a literal
  const STRING = String.raw`(?:'([^'\n]*)'|"([^"\n]*)"|\x60([^\x60]*)\x60)`;
  const value = (m, from) => (m[from] ?? m[from + 1] ?? m[from + 2] ?? '').replace(/\$\{[^}]*\}/g, 'var(--interpolated)');
  for (const m of source.matchAll(new RegExp(String.raw`\.style\.cssText\s*\+?=\s*${STRING}`, 'g'))) {
    if (!MOTION_DECL.test(` ${value(m, 1)}`)) continue;
    const rule = inlineRule(value(m, 1), 'element.style', () => lineAt(m.index));
    if (rule) rules.push(rule);
  }
  for (const m of source.matchAll(new RegExp(String.raw`\.style\.setProperty\(\s*['"]([\w-]+)['"]\s*,\s*${STRING}`, 'g'))) {
    if (!/^(?:-webkit-)?(?:transition|animation)|^--/.test(m[1])) continue;
    rules.push({ selector: 'element.style', prelude: 'element.style', ancestors: [], keyframes: null, line: lineAt(m.index),
      decls: [{ property: m[1].toLowerCase(), value: value(m, 2), line: lineAt(m.index) }] });
  }
  for (const m of source.matchAll(new RegExp(String.raw`\.style\.([a-zA-Z]+)\s*=\s*${STRING}`, 'g'))) {
    if (!STYLE_PROPS.test(m[1])) continue;
    rules.push({ selector: 'element.style', prelude: 'element.style', ancestors: [], keyframes: null, line: lineAt(m.index),
      decls: [{ property: camelToKebab(m[1]).replace(/^webkit-/, '-webkit-'), value: value(m, 2), line: lineAt(m.index) }] });
  }
  return rules;
}

/* ------------------------------------------------------------------------------------------------ files */

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);
function walk(dir, accept, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), accept, out); continue; }
    if (accept(entry.name)) out.push(join(dir, entry.name));
  }
  return out;
}

/** The files the lint reads, repo-relative (the token package, where durations are defined, and receipts excluded). */
export function lintFiles(root = ROOT) {
  const files = [
    ...walk(join(root, 'src'), (name) => /\.(?:css|ts|mts)$/.test(name) && !/\.d\.ts$/.test(name) && !/\.selftest\./.test(name)),
    ...walk(join(root, 'public'), (name) => name.endsWith('.css')),
    ...walk(join(root, 'site'), (name) => name.endsWith('.html')),
    ...['index.html', '404.html'].map((name) => join(root, name)).filter((path) => existsSync(path)),
  ];
  return files.map((path) => relative(root, path).split('\\').join('/')).filter((path) => !path.startsWith('src/ui/tokens/')).sort();
}

/** The custom properties that hold a motion token: --dur-* and every alias of one in the token package and motion.css. */
export function motionTokens(root = ROOT) {
  const defs = new Map();
  for (const path of ['src/ui/tokens/tokens.css', 'src/ui/motion.css']) {
    const file = join(root, path);
    if (!existsSync(file)) continue;
    for (const rule of parseSheet(readFileSync(file, 'utf8'))) for (const d of rule.decls) {
      if (d.property.startsWith('--')) defs.set(d.property, [...(defs.get(d.property) ?? []), d.value]);
    }
  }
  return resolveMotionVars(defs, new Set([...defs.keys()].filter((name) => name.startsWith('--dur-'))));
}

/** Grow a motion-token set with every custom property whose definitions all read motion tokens (or are <= 1 ms). */
function resolveMotionVars(defs, seed) {
  const motion = new Set(seed);
  for (let grew = true; grew;) {
    grew = false;
    for (const [name, values] of defs) {
      if (motion.has(name)) continue;
      if (values.every((v) => motionValue(v, motion))) { motion.add(name); grew = true; }
    }
  }
  return motion;
}

/* ------------------------------------------------------------------------------------------------ lint */

const REDUCE_MEDIA = /prefers-reduced-motion\s*:\s*reduce/i;
const OPT_IN_MEDIA = /prefers-reduced-motion\s*:\s*no-preference/i;
const REDUCE_SELECTOR = /\[data-motion=["']?reduce["']?\]/i;
const MOTION_PROP = /^(?:-webkit-)?(?:transition|animation)(?:-[a-z]+)?$/;
const RING = /^(?:none|var\(--[\w-]*(?:ring|edge)[\w-]*\)|inset 0 0 0 [\d.]+px [^,]+)$/;
const REDUCED_IN_SCRIPT = /prefers-reduced-motion|reduced?Motion|motionReduced|prefersReduced|data-motion|dataset\.motion/i;

/** The classes and ids of each selector's subject compound ('*' for a universal subject). */
function subjectKeys(selector) {
  const keys = new Set();
  for (const sel of splitTop(selector ?? '')) {
    const compounds = sel.replace(/\([^()]*\)/g, '()').split(/\s*[>+~]\s*|\s+/).filter(Boolean);
    const subject = (compounds[compounds.length - 1] ?? '').replace(/::?[\w-]+(?:\(\))?/g, '');
    if (subject === '*' || subject === '') keys.add('*');
    for (const m of subject.matchAll(/[.#][\w-]+/g)) keys.add(m[0]);
  }
  return keys;
}

const inReduce = (rule) => rule.ancestors.some((p) => p.startsWith('@media') && REDUCE_MEDIA.test(p)) || REDUCE_SELECTOR.test(rule.selector ?? '');
const inOptIn = (rule) => rule.ancestors.some((p) => p.startsWith('@media') && OPT_IN_MEDIA.test(p));

/** The findings of one file: [{ file, line, rule, where, property?, detail }]. */
export function lintFile(file, text, motionGlobal) {
  const findings = [];
  const add = (rule, line, where, property, detail) => findings.push({ file, line, rule, where, ...(property ? { property } : {}), detail });
  const lineAt = lineCounter(text);
  let rules = [];
  const scripts = [];
  if (file.endsWith('.css')) rules = parseSheet(text, lineAt);
  else if (file.endsWith('.html')) {
    const html = text.replace(/<!--[\s\S]*?-->/g, blank);
    for (const m of html.matchAll(/(<style\b[^>]*>)([\s\S]*?)<\/style>/gi)) {
      const base = m.index + m[1].length;
      rules.push(...parseSheet(m[2], (p) => lineAt(base + p)));
    }
    for (const m of html.matchAll(/(<script\b(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)<\/script>/gi)) {
      const base = m.index + m[1].length;
      scripts.push({ source: m[2], lineAt: (p) => lineAt(base + p) });
    }
    const markup = html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, blank);
    for (const m of markup.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
      const body = m[1] ?? m[2];
      const base = m.index + m[0].indexOf(body);
      const rule = inlineRule(body, '[style]', (p) => lineAt(base + p));
      if (rule) rules.push(rule);
    }
  } else scripts.push({ source: text, lineAt });
  for (const s of scripts) rules.push(...scriptRules(s.source, s.lineAt));

  // the file's own motion aliases (--fade: var(--dur-fast))
  const defs = new Map();
  for (const rule of rules) if (!rule.keyframes) for (const d of rule.decls) {
    if (d.property.startsWith('--')) defs.set(d.property, [...(defs.get(d.property) ?? []), d.value]);
  }
  const motion = resolveMotionVars(defs, motionGlobal);

  // reduced-motion rules: the subjects they stop, shorten or hold still (transition: none, transform: none...)
  const reduceKeys = new Set();
  for (const rule of rules) {
    if (rule.keyframes || !inReduce(rule)) continue;
    for (const key of subjectKeys(rule.selector)) reduceKeys.add(key);
  }
  const covered = (selector) => reduceKeys.has('*') || [...subjectKeys(selector)].some((key) => key !== '*' && reduceKeys.has(key));

  // a box-shadow that is only ever a 1 px ring on this subject (var(--ring-*), an inset spread line) repaints like a
  // border colour: colour, not paint
  const shadows = new Map();
  for (const rule of rules) if (!rule.keyframes) for (const d of rule.decls) {
    if (!/^(?:-webkit-)?box-shadow$/.test(d.property)) continue;
    for (const key of subjectKeys(rule.selector)) if (key !== '*') shadows.set(key, [...(shadows.get(key) ?? []), d.value]);
  }
  const ringOnly = (selector) => {
    const values = [...subjectKeys(selector)].flatMap((key) => shadows.get(key) ?? []);
    return values.length > 0 && values.every((v) => RING.test(v.trim()));
  };

  // which keyframes move: an unknown name (defined elsewhere) is taken to move
  const keyframesMove = new Map();
  for (const rule of rules) if (rule.keyframes) {
    keyframesMove.set(rule.keyframes, (keyframesMove.get(rule.keyframes) ?? false) || rule.decls.some((d) => !KEYFRAME_META.has(d.property) && moves(d.property)));
  }

  const keyframeSeen = new Set();
  for (const rule of rules) {
    if (rule.keyframes) {
      for (const d of rule.decls) {
        if (KEYFRAME_META.has(d.property)) continue;
        const cls = propertyClass(d.property);
        const where = `@keyframes ${rule.keyframes}`;
        if (cls && !keyframeSeen.has(`${where}|${d.property}`)) { keyframeSeen.add(`${where}|${d.property}`); add(cls, d.line, where, d.property, `${d.property}: ${d.value}`); }
      }
      continue;
    }
    const where = rule.selector ?? rule.prelude;
    const reduce = inReduce(rule), optIn = inOptIn(rule);
    let transitionSite = null, animationSite = null, infinite = false, longDuration = null, moving = false;
    const named = rule.decls.find((d) => /^(?:-webkit-)?transition-property$/.test(d.property));
    const namedMove = named ? splitTop(named.value).some((p) => moves(p) || p.toLowerCase() === 'all') : false;
    for (const d of rule.decls) {
      const prop = d.property.replace(/^-webkit-/, '');
      if (d.property.startsWith('--')) {
        for (let k = durationLiterals(d.value, motion); k > 0; k--) add('duration', d.line, where, d.property, `${d.property}: ${d.value}`);
        continue;
      }
      if (!MOTION_PROP.test(d.property)) continue;
      // durations only: a delay or a stagger is choreography, not a tempo
      const literals = prop === 'transition' ? transitionItems(d.value, motion).filter((i) => i.duration?.literal).length
        : prop === 'animation' ? animationItems(d.value, motion).filter((i) => i.name && i.duration?.literal).length
          : /-duration$/.test(prop) ? durationLiterals(d.value, motion) : 0;
      for (let k = literals; k > 0; k--) add('duration', d.line, where, d.property, `${d.property}: ${d.value}`);
      if (prop === 'transition' || prop === 'transition-property') {
        const items = prop === 'transition' ? transitionItems(d.value, motion)
          : splitTop(d.value).map((p) => ({ properties: [p.toLowerCase()], duration: { kind: 'var' } }));
        for (const item of items) {
          if (!item.duration || item.duration.zero) continue;
          for (const p of item.properties) {
            if (p === 'none') continue;
            const cls = propertyClass(p);
            const kind = cls === 'paint' && /^(?:-webkit-)?box-shadow$/.test(p) && ringOnly(rule.selector) ? 'colour' : cls;
            if (kind) add(kind, d.line, where, p, `${d.property}: ${d.value}`);
          }
          if (prop === 'transition' && !item.duration.collapses && item.properties.some(moves)) transitionSite ??= d;
        }
      } else if (prop === 'transition-duration') {
        if (namedMove && splitTop(d.value).some((t) => { const s = slotToken(t, motion); return !(s.zero || s.collapses); })) transitionSite ??= d;
      } else if (prop === 'animation') {
        for (const item of animationItems(d.value, motion)) {
          if (!item.name) continue;
          if (item.infinite) infinite = true;
          if (keyframesMove.get(item.name) ?? true) moving = true;
          if (item.duration && !item.duration.zero) animationSite ??= { d, collapses: item.duration.collapses };
        }
      } else if (prop === 'animation-name') {
        for (const name of splitTop(d.value)) if (name !== 'none' && (keyframesMove.get(name) ?? true)) moving = true;
      } else if (prop === 'animation-duration') {
        longDuration = d;
      } else if (prop === 'animation-iteration-count' && /infinite/i.test(d.value)) infinite = true;
    }
    if (longDuration && !animationSite) {
      const collapses = splitTop(longDuration.value).every((t) => { const s = slotToken(t, motion); return s.zero || s.collapses; });
      animationSite = { d: longDuration, collapses };
    }
    if (reduce || optIn) continue;
    if (transitionSite && !covered(rule.selector)) add('reduced', transitionSite.line, where, null, `transition without a reduced-motion path: ${transitionSite.value}`);
    // a finite fade needs no reduced path; anything that moves or loops does (a loop at 1 ms strobes)
    if (animationSite && (infinite || moving && !animationSite.collapses) && !covered(rule.selector)) {
      add('reduced', animationSite.d.line, where, null, `${infinite ? 'infinite ' : ''}animation without a reduced-motion path: ${animationSite.d.value}`);
    }
  }

  for (const s of scripts) {
    if (!/requestAnimationFrame|\.animate\(/.test(s.source)) continue;
    const masked = maskCode(s.source);
    findings.push(...scriptMotion(file, s.source, masked, s.lineAt), ...rafLoops(file, s.source, masked, s.lineAt));
  }
  findings.push(...rasterChrome(file, text, lineAt));
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
}

/** Matching close of the bracket at `open` in masked code (or the end). */
function matchClose(masked, open) {
  const pairs = { '(': ')', '{': '}', '[': ']' };
  const stack = [pairs[masked[open]]];
  for (let k = open + 1; k < masked.length; k++) {
    const ch = masked[k];
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (ch === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return k; }
  }
  return masked.length;
}

/** WAAPI animate([...keyframes], options) calls: animated properties, literal durations, a reduced-motion read. */
function scriptMotion(file, source, masked, lineAt) {
  const out = [];
  const readsReduce = REDUCED_IN_SCRIPT.test(source);
  for (const m of masked.matchAll(/\.animate\(\s*([[{])/g)) {
    const open = m.index + m[0].length - 1;
    const frames = masked.slice(open, matchClose(masked, open) + 1);
    const line = lineAt(m.index);
    const where = 'animate()';
    const seen = new Set();
    for (const k of frames.matchAll(/([A-Za-z$_][\w$]*)\s*:/g)) {
      const prop = camelToKebab(k[1]);
      if (/^(?:offset|easing|composite)$/.test(prop) || seen.has(prop)) continue;
      seen.add(prop);
      const cls = propertyClass(prop);
      if (cls) out.push({ file, line, rule: cls, where, property: prop, detail: `animate() keyframes animate ${prop}` });
    }
    const after = masked.slice(open + frames.length);
    const opts = /^\s*,\s*([\d.]+|\{)/.exec(after);
    if (opts) {
      let ms = null;
      if (opts[1] === '{') {
        const o = after.indexOf('{');
        ms = /\bduration\s*:\s*([\d.]+)\b/.exec(after.slice(o, matchClose(after, o) + 1))?.[1] ?? null;
      } else ms = opts[1];
      if (ms !== null && Number(ms) > 1) out.push({ file, line, rule: 'duration', where, property: 'duration', detail: `animate() duration ${ms} ms` });
    }
    if (!readsReduce) out.push({ file, line, rule: 'reduced', where, detail: 'animate() in a file that never reads reduced motion' });
  }
  return out;
}

const STYLE_WRITE = /\.style\.(?!cssText\b|setProperty\b|getPropertyValue\b|removeProperty\b)[A-Za-z]+\s*=(?!=)|\.style\.setProperty\(|\.style\.cssText\s*\+?=|\.style\[[^\]]+\]\s*=(?!=)|\.setAttribute\(\s*$|Object\.assign\(\s*[\w$.]+\.style\b/m;

/** The body of a function a rAF names (an inline function, or one defined in this source), or null. */
function callbackBody(masked, arg) {
  const inline = /^\s*(?:async\s*)?(?:function\b|\(|[A-Za-z_$][\w$]*\s*=>)/.exec(arg.text);
  if (inline) return { from: arg.from, text: arg.text };
  const ref = /^\s*(?:this\.|self\.)?([A-Za-z_$][\w$]*)(?:\.bind\([^)]*\))?\s*$/.exec(arg.text);
  return ref ? definitionBody(masked, ref[1]) : null;
}

function definitionBody(masked, name) {
  const id = name.replace(/\$/g, '\\$');
  const defs = [
    new RegExp(String.raw`\bfunction\s*\*?\s*${id}\s*(?:<[^>]*>)?\s*\(`, 'g'),
    new RegExp(String.raw`(?:^|[\s;{},])(?:(?:private|public|protected|static|async|readonly|override)\s+)*${id}\s*(?::[^=;\n]+)?=\s*(?:async\s*)?(?:function\b[^(]*)?\(`, 'g'),
    new RegExp(String.raw`(?:^|[\s;{},])(?:(?:const|let|var)\s+)${id}\s*(?::[^=;\n]+)?=\s*(?:async\s*)?[A-Za-z_$][\w$]*\s*=>`, 'g'),
    new RegExp(String.raw`(?:^|\n)\s*(?:(?:private|public|protected|static|async|override)\s+)*${id}\s*(?:<[^>]*>)?\s*\(`, 'g'),
  ];
  for (const re of defs) {
    for (const m of masked.matchAll(re)) {
      let k = m.index + m[0].length - 1;
      if (masked[k] === '(') k = matchClose(masked, k) + 1;
      // past a return type and an arrow to the body
      const rest = /^\s*(?::\s*[^{=]+?)?\s*(=>)?\s*/.exec(masked.slice(k));
      k += rest[0].length;
      if (masked[k] === '{') return { from: k, text: masked.slice(k, matchClose(masked, k) + 1) };
      if (rest[1]) { const end = masked.slice(k).search(/[;\n]/); return { from: k, text: masked.slice(k, end < 0 ? masked.length : k + end) }; }
    }
  }
  return null;
}

/** requestAnimationFrame loops (the callback, or a function it calls, re-arms rAF) that write element styles. */
function rafLoops(file, source, masked, lineAt) {
  const out = [];
  const seen = new Set();
  for (const m of masked.matchAll(/\brequestAnimationFrame\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const close = matchClose(masked, open);
    const args = masked.slice(open + 1, close);
    const first = splitTop(args)[0] ?? '';
    const body = callbackBody(masked, { from: open + 1, text: first });
    if (!body) continue;
    // one level of same-file callees joins the body: a loop that calls render() or schedule()
    let text = body.text;
    const callees = new Set([...body.text.matchAll(/(?:\bthis\.|[^.\w$]|^)([A-Za-z_$][\w$]*)\s*\(/g)].map((c) => c[1]));
    for (const name of callees) {
      if (/^(?:if|for|while|switch|return|function|catch|requestAnimationFrame|cancelAnimationFrame)$/.test(name)) continue;
      const callee = definitionBody(masked, name);
      if (callee && callee.from !== body.from) text += `\n${callee.text}`;
    }
    if (!/\brequestAnimationFrame\s*\(/.test(text) || !STYLE_WRITE.test(text) && !/setAttribute\(\s*['"]style/.test(source.slice(body.from, body.from + body.text.length))) continue;
    const name = /^\s*(?:this\.|self\.)?([A-Za-z_$][\w$]*)/.exec(first)?.[1];
    const where = `requestAnimationFrame(${/=>|function/.test(first) ? 'inline' : name})`;
    if (seen.has(`${where}|${lineAt(body.from)}`)) continue;
    seen.add(`${where}|${lineAt(body.from)}`);
    out.push({ file, line: lineAt(m.index), rule: 'raf', where, detail: 'a rAF loop writes element styles every frame (use CSS or WAAPI)' });
  }
  return out;
}

const MEDIA_REF = /(?:^|["'(\s=,])((?:https?:)?[\w./@%-]*\.(?:png|jpe?g|webp|avif|gif|apng|webm|mp4|mov|m4v))(?=[?#"')\s,]|$)/gim;
const CHROME_NAME = /(?:^|[/_.-])(?:logo|wordmark|brand-?mark|spinner|loader|throbber|rumble)(?=[/_.-]|$)/i;
const META_LINE = /<meta\b|rel=["'](?:icon|apple-touch-icon|shortcut icon|manifest|mask-icon)["']/i;

/** Raster or video used as UI chrome: any GIF/APNG, a brand or partner mark, a logo, spinner, loader or rumble file. */
function rasterChrome(file, text, lineAt) {
  const out = [];
  const lines = text.split('\n');
  for (const m of text.matchAll(MEDIA_REF)) {
    const path = m[1];
    const line = lineAt(m.index + m[0].indexOf(path));
    if (META_LINE.test(lines[line - 1] ?? '')) continue;
    const animated = /\.(?:gif|apng)$/i.test(path);
    if (animated || /\/brand\/partners\//i.test(path) || CHROME_NAME.test(path)) {
      out.push({ file, line, rule: 'raster', where: path, detail: `${animated ? 'animated raster' : 'raster or video'} UI chrome: ${path} (use CSS, SVG or vector)` });
    }
  }
  for (const m of text.matchAll(/<video\b[^>]*>/gi)) {
    if (CHROME_NAME.test(m[0].replace(/\s(?:src|poster|data-src|data-poster)=["'][^"']*["']/g, ''))
      || /class=["'][^"']*\b(?:logo|wordmark|brand-mark|spinner|loader|rumble)\b/i.test(m[0])) {
      out.push({ file, line: lineAt(m.index), rule: 'raster', where: '<video>', detail: 'video as UI chrome (use CSS, SVG or vector)' });
    }
  }
  return out;
}

/* ------------------------------------------------------------------------------------------------ ratchet */

export function readAllowlist(root = ROOT) {
  const path = join(root, ALLOWLIST_FILE);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).rows ?? [] : [];
}

export const allowed = (row, f) => row.rule === f.rule && row.file === f.file && row.where === f.where && (!row.property || row.property === f.property);

/** Every finding of the tree, each marked allowed when an allowlist row covers it. */
export function lint(root = ROOT, allow = readAllowlist(root)) {
  const motion = motionTokens(root);
  const findings = [];
  for (const file of lintFiles(root)) {
    for (const f of lintFile(file, readFileSync(join(root, file), 'utf8'), motion)) {
      findings.push(allow.some((row) => allowed(row, f)) ? { ...f, allowed: true } : f);
    }
  }
  return findings;
}

/** Per-file counts of the counted (not allowed) findings; files without one omitted. */
export function counts(findings) {
  const files = {};
  for (const f of findings) {
    if (f.allowed) continue;
    files[f.file] ??= Object.fromEntries(RULES.map((r) => [r, 0]));
    files[f.file][f.rule]++;
  }
  return files;
}

export function totals(files) {
  const sum = Object.fromEntries(RULES.map((r) => [r, 0]));
  for (const c of Object.values(files)) for (const r of RULES) sum[r] += c[r] ?? 0;
  return sum;
}

/** Rises against the baseline: [{ file, rule, baseline, current }]. */
export function rises(current, baseline) {
  const out = [];
  for (const [file, c] of Object.entries(current)) {
    for (const r of RULES) {
      const was = baseline[file]?.[r] ?? 0;
      if ((c[r] ?? 0) > was) out.push({ file, rule: r, baseline: was, current: c[r] });
    }
  }
  return out;
}

/** Rules whose total would rise from `baseline` to `current` ("paint 2 -> 3"): a write that raises one is refused. */
export function totalRises(current, baseline) {
  const now = totals(current), was = totals(baseline);
  return RULES.filter((r) => now[r] > was[r]).map((r) => `${r} ${was[r]} -> ${now[r]}`);
}

/** The baseline file text: one line per file, so lanes touching different files merge cleanly. */
export function baselineText(files) {
  const lines = Object.keys(files).sort().map((file) => `    ${JSON.stringify(file)}: {${RULES.map((r) => `"${r}":${files[file][r] ?? 0}`).join(',')}}`);
  return `{\n  "note": "Lossy motion per file (tools/motion-lint.mjs, UI-LOCKDOWN part D). A count may only fall: new lossy motion `
    + `fails npm test; after removing some, lower this file with node tools/motion-lint.mjs --write.",\n`
    + `  "rules": ${JSON.stringify(RULES)},\n  "files": {\n${lines.join(',\n')}\n  }\n}\n`;
}

export function readBaseline(root = ROOT) {
  const path = join(root, BASELINE_FILE);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).files ?? {} : {};
}

/** Every @keyframes block of the tree (the program's count of animations to audit). */
export function keyframeBlocks(root = ROOT) {
  let n = 0;
  for (const file of lintFiles(root)) n += (readFileSync(join(root, file), 'utf8').match(/@(?:-webkit-)?keyframes\s+[\w-]/g) ?? []).length;
  return n;
}

/** The command line; returns the exit code (output is left to drain: an exit cuts a piped stdout at 64 KB). */
function cli(args) {
  const flags = new Set(args);
  const root = resolve(args.find((a) => a.startsWith('--root='))?.slice(7) ?? ROOT);
  const findings = lint(root);
  const current = counts(findings);
  if (flags.has('--json')) { console.log(JSON.stringify({ totals: totals(current), files: current, findings }, null, 1)); return 0; }
  if (flags.has('--report')) {
    let file = null;
    for (const f of findings.filter((x) => !x.allowed).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      if (f.file !== file) { file = f.file; console.log(`\n${file}`); }
      console.log(`  ${f.line}\t${f.rule}\t${f.where}${f.property ? ` {${f.property}}` : ''}\t${f.detail}`);
    }
    return 0;
  }
  const baseline = readBaseline(root);
  const now = totals(current), was = totals(baseline);
  const table = RULES.map((r) => `${r} ${now[r]}${was[r] !== now[r] ? ` (baseline ${was[r]})` : ''}`).join(', ');
  if (flags.has('--write')) {
    const up = Object.keys(baseline).length ? totalRises(current, baseline) : [];
    if (up.length) {
      console.error(`motion-lint: refusing to raise the baseline (${up.join(', ')}); animate transform and opacity on the motion tokens`);
      return 1;
    }
    writeFileSync(join(root, BASELINE_FILE), baselineText(current));
    console.log(`motion-lint: baseline written (${Object.keys(current).length} files): ${table}`);
    return 0;
  }
  const up = rises(current, baseline);
  if (up.length) {
    console.error(`motion-lint: FAIL — ${up.length} count(s) rose above ${BASELINE_FILE}; animate transform and opacity on the --dur-* tokens with a reduced-motion path (node tools/motion-lint.mjs --report):`);
    for (const r of up.slice(0, 60)) {
      console.error(`  ${r.file}: ${r.rule} ${r.baseline} -> ${r.current}`);
      for (const f of findings.filter((x) => !x.allowed && x.file === r.file && x.rule === r.rule).slice(0, 8)) console.error(`    ${f.line}: ${f.where}${f.property ? ` {${f.property}}` : ''} ${f.detail}`);
    }
    return 1;
  }
  const fell = RULES.filter((r) => now[r] < was[r]);
  console.log(`motion-lint: PASS — ${table}${fell.length ? '; the baseline can fall: node tools/motion-lint.mjs --write' : ''}`);
  return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = cli(process.argv.slice(2));
