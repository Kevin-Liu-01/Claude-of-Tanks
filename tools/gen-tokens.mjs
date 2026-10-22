#!/usr/bin/env node
// gen-tokens.mjs — the design-token pipeline (brand-ui SPEC §4.1). Copyright © 2026 Kevin B. Liu.
//
// One source, src/ui/tokens/tokens.json (OKLCH colour primitives), generates:
//   src/ui/tokens/tokens.css  custom properties, linked by index.html (the game and cn documents) ahead of the entry;
//                             the build keeps it a stylesheet chunk of its own (vite.config.ts group designTokens)
//   src/ui/tokens/tokens.ts   the same values for canvas, three.js, the minimap, the kill cam and the damage panel
//
//   node tools/gen-tokens.mjs           write both files (idempotent: no clock, no environment input)
//   node tools/gen-tokens.mjs --check   exit 1 when either file drifts from tokens.json
//
// Value grammar inside tokens.json (keys are CSS custom-property names without "--"; "$" keys are metadata):
//   "oklch(L% C H)"                      a colour literal, emitted as #rrggbb
//   "oklch(L% C H / A)"                  a translucent colour literal, emitted as rgba(r,g,b,A)
//   "oklch(from {name} l c h / A)"       another colour token at alpha A, emitted as rgba(r,g,b,A)
//   "{name}"                             a reference: var(--name) in CSS, the resolved value in TS
//   any other string                     CSS text; "{name}" inside it becomes var(--name) (TS: resolved)
//   a number                             a unitless value (layers, scales)
// A group may declare "$scale": "<token>" — its numeric members then mean px at scale 1 and are emitted as
// calc(Npx*var(--<token>)). The `alias`, `breakpoint` and `grid` sections are data for the selftest and tokens.ts;
// aliases live in the files that already own the legacy names (each with a fallback the selftest pins).
//
// Presets ("preset": { axis: { name: { token: value } } }) are resolved through the whole reference graph: a preset's
// CSS block carries its direct overrides plus every derived token whose CSS text changes (a translucent literal made
// from an overridden colour), and its tokens.ts table carries every token whose resolved value changes: `set` for its
// direct overrides, `follows` for the tokens derived from them (so tokenValue('plate-fill', { contrast: 'high' })
// follows --surface-plate exactly as the cascade does). A direct override beats a value another axis only derives
// (high contrast sets --text-enemy to ink-1 whatever colour-vision preset moves --team-enemy), as in the cascade, where
// the override replaces the reference. Every combination of presets is resolved from the merged overrides and must
// equal both compositions, and no two axes may declare the same property in CSS, or generation fails.
//
// The colour maths (WCAG 2.x contrast, Machado 2009 colour-vision simulation, CIE76 ΔE) is exported
// for src/ui/tokens/tokens.selftest.mjs, which recomputes the SPEC 4.4 contrast and 4.5 colour-vision tables.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STYLE_LAYER_ORDER } from '../src/ui/styleLayers.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const TOKENS_JSON = join(ROOT, 'src/ui/tokens/tokens.json');
export const TOKENS_CSS = join(ROOT, 'src/ui/tokens/tokens.css');
export const TOKENS_TS = join(ROOT, 'src/ui/tokens/tokens.ts');

/* ---------------------------------------------------------------- colour maths */

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const unit = (x) => Math.min(1, Math.max(0, x));

/** OKLCH (L 0-1, C, H degrees) to 8-bit sRGB, gamut-clipped. */
function oklchToRgb([L, C, H]) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.round(unit(encode(c)) * 255));
}

/** "#rrggbb" to [r, g, b] (0-255). */
export function hexToRgb(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) throw new Error(`gen-tokens: not a #rrggbb colour: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
}

const rgbToHex = (rgb) => `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;

/** Source-over composite of an [r,g,b,a] colour on an opaque [r,g,b] background, in 8-bit sRGB. */
export function composite([r, g, b, a], bg) {
  return [r, g, b].map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
}

/** WCAG 2.x relative luminance of an 8-bit sRGB colour. */
export function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => linear(c / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio of two opaque 8-bit sRGB colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Machado, Oliveira & Fernandes 2009, severity 1.0, applied to linear-light sRGB (reproduces SPEC 4.5).
const MACHADO = Object.freeze({
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
});
export const VISION_VIEWS = Object.freeze(['normal', 'deutan', 'protan', 'tritan']);

/** CIELAB (D65) of an 8-bit sRGB colour as seen in one vision view. */
function labIn(view, rgb) {
  let lin = rgb.map((c) => linear(c / 255));
  if (view !== 'normal') {
    const m = MACHADO[view];
    if (!m) throw new Error(`gen-tokens: unknown vision view ${view}`);
    lin = m.map((row) => unit(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
  }
  const [r, g, b] = lin;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIE76 ΔE between two 8-bit sRGB colours in one vision view. */
export function deltaE(view, a, b) {
  const p = labIn(view, a);
  const q = labIn(view, b);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/* ---------------------------------------------------------------- token model */

const OKLCH = /^oklch\(\s*([\d.]+)%\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)\s*)?\)$/;
const RELATIVE = /^oklch\(from \{([a-z0-9-]+)\} l c h \/ ([\d.]+)\)$/;
const REF = /^\{([a-z0-9-]+)\}$/;
const NAME = /^[a-z][a-z0-9-]*$/;
const TIERS = Object.freeze(['primitive', 'semantic', 'component']);

const alphaText = (a) => String(a).replace(/^0\./, '.');
const isMeta = (key) => key.startsWith('$');

/** Every emitted token in source order: { name, tier, group, raw, scale, meta }. Throws on a malformed source. */
export function flattenTokens(source) {
  const tokens = [];
  const seen = new Set();
  for (const tier of TIERS) {
    for (const [group, members] of Object.entries(source[tier] ?? {})) {
      if (isMeta(group)) continue;
      const scale = members.$scale ?? null;
      for (const [name, entry] of Object.entries(members)) {
        if (isMeta(name)) continue;
        if (!NAME.test(name)) throw new Error(`gen-tokens: bad token name ${tier}.${group}.${name}`);
        if (seen.has(name)) throw new Error(`gen-tokens: token --${name} is defined twice`);
        seen.add(name);
        const isObject = entry !== null && typeof entry === 'object';
        const raw = isObject ? entry.value : entry;
        if (raw === undefined) throw new Error(`gen-tokens: --${name} has no value`);
        const meta = isObject ? Object.fromEntries(Object.entries(entry).filter(([k]) => isMeta(k))) : {};
        tokens.push({ name, tier, group, raw, scale, meta });
      }
    }
  }
  return tokens;
}

function parseOklch(text) {
  const m = OKLCH.exec(text);
  if (!m) return null;
  return { lch: [Number(m[1]) / 100, Number(m[2]), Number(m[3])], alpha: m[4] === undefined ? null : Number(m[4]) };
}

/** A resolver over one token table (plus optional preset overrides): CSS text and fully resolved values. */
export function createResolver(tokens, overrides = {}) {
  const byName = new Map(tokens.map((t) => [t.name, t]));
  const rawOf = (name) => {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    const token = byName.get(name);
    if (!token) throw new Error(`gen-tokens: reference to undefined token {${name}}`);
    return token.raw;
  };
  const scaleOf = (name) => byName.get(name)?.scale ?? null;

  /** The colour a token denotes as { rgb, alpha } (alpha null = opaque), or null when it is not a colour. */
  const colourCache = new Map();
  function colour(name, stack = []) {
    if (colourCache.has(name)) return colourCache.get(name);
    if (stack.includes(name)) throw new Error(`gen-tokens: reference cycle ${[...stack, name].join(' -> ')}`);
    const raw = rawOf(name);
    let out = null;
    if (typeof raw === 'string') {
      const lit = parseOklch(raw);
      const rel = RELATIVE.exec(raw);
      const ref = REF.exec(raw);
      if (lit) out = { rgb: oklchToRgb(lit.lch), alpha: lit.alpha };
      else if (rel) {
        const base = colour(rel[1], [...stack, name]);
        if (!base || base.alpha !== null) throw new Error(`gen-tokens: --${name} needs an opaque colour base`);
        out = { rgb: base.rgb, alpha: Number(rel[2]) };
      } else if (ref) out = colour(ref[1], [...stack, name]);
    }
    colourCache.set(name, out);
    return out;
  }

  const colourText = ({ rgb, alpha }) => (alpha === null ? rgbToHex(rgb) : `rgba(${rgb.join(',')},${alphaText(alpha)})`);

  /** CSS text for one token: refs stay var() so presets and scale switches cascade. */
  function css(name) {
    const raw = rawOf(name);
    const scale = scaleOf(name);
    if (typeof raw === 'number') return scale ? `calc(${raw}px*var(--${scale}))` : String(raw);
    if (typeof raw !== 'string') throw new Error(`gen-tokens: --${name} has an unsupported value`);
    const lit = parseOklch(raw);
    if (lit || RELATIVE.test(raw)) return colourText(colour(name));
    return raw.replace(/\{([a-z0-9-]+)\}/g, (_, ref) => {
      rawOf(ref); // existence check
      return `var(--${ref})`;
    });
  }

  /** Fully resolved value for one token (no var() left except the documented runtime scale switches). */
  function value(name, stack = []) {
    if (stack.includes(name)) throw new Error(`gen-tokens: reference cycle ${[...stack, name].join(' -> ')}`);
    const raw = rawOf(name);
    const scale = scaleOf(name);
    if (typeof raw === 'number') return scale ? `${raw}px` : String(raw);
    const c = colour(name);
    if (c) return colourText(c);
    return raw.replace(/\{([a-z0-9-]+)\}/g, (_, ref) => value(ref, [...stack, name]));
  }

  return { colour, css, value, rawOf };
}

/* ---------------------------------------------------------------- emitters */

const CSS_HEADER = `/* Generated by tools/gen-tokens.mjs from src/ui/tokens/tokens.json. Do not edit by hand:
 * edit tokens.json and run \`node tools/gen-tokens.mjs\`. Copyright © 2026 Kevin B. Liu.
 * Design tokens of Claude of Tanks (brand-ui SPEC §4): primitives -> semantic roles -> component tokens.
 * Components read semantic or component tokens only. Presets switch on :root[data-cvd|data-contrast|data-motion]. */
`;

/** One preset's direct overrides (its non-"$" keys). */
const overridesOf = (entry) => Object.fromEntries(Object.entries(entry).filter(([k]) => !isMeta(k)));

/** Every preset selection across the axes, as [[axis, preset | null]] lists (null = the axis at its default). */
export function presetCombinations(effects) {
  const axes = [...new Set(effects.map((e) => e.axis))];
  return axes.reduce((combos, axis) => combos.flatMap((combo) => [null, ...effects.filter((e) => e.axis === axis)]
    .map((e) => [...combo, [axis, e ? e.preset : null]])), [[]]);
}

/** The tokens.ts composition: `follows` of every selected preset, then `set` (direct overrides win). */
export function composePresets(effects, selection, name, fallback) {
  const chosen = effects.filter((e) => selection[e.axis] === e.preset);
  let out = fallback;
  for (const e of chosen) { const hit = e.follows.find(([n]) => n === name); if (hit) out = hit[1]; }
  for (const e of chosen) { const hit = e.set.find(([n]) => n === name); if (hit) out = hit[1]; }
  return out;
}

/**
 * Every preset as { axis, preset, values (direct overrides), media, css: [[name, text]], set: [[name, value]],
 * follows: [[name, value]] }; throws unless every combination composes exactly (see the header).
 */
export function presetEffects(source, tokens = flattenTokens(source)) {
  const base = createResolver(tokens);
  const out = [];
  for (const [axis, presets] of Object.entries(source.preset ?? {})) {
    if (isMeta(axis)) continue;
    for (const [preset, entry] of Object.entries(presets)) {
      if (isMeta(preset)) continue;
      const values = overridesOf(entry);
      for (const name of Object.keys(values)) if (!tokens.some((t) => t.name === name)) {
        throw new Error(`gen-tokens: preset ${axis}=${preset} overrides undefined token --${name}`);
      }
      const resolver = createResolver(tokens, values);
      // Direct overrides first (source order), then derived tokens whose CSS text moves (token order).
      const css = Object.keys(values).map((name) => [name, resolver.css(name)]);
      for (const t of tokens) {
        if (Object.hasOwn(values, t.name)) continue;
        const text = resolver.css(t.name);
        if (text !== base.css(t.name)) css.push([t.name, text]);
      }
      const set = tokens.filter((t) => Object.hasOwn(values, t.name)).map((t) => [t.name, resolver.value(t.name)]);
      const follows = tokens.filter((t) => !Object.hasOwn(values, t.name))
        .map((t) => [t.name, resolver.value(t.name)]).filter(([name, v]) => v !== base.value(name));
      out.push({ axis, preset, values, media: entry.$media ?? null, css, set, follows });
    }
  }
  for (const a of out) for (const b of out) {
    if (a.axis >= b.axis) continue;
    const declared = new Set(a.css.map(([n]) => n));
    const shared = b.css.map(([n]) => n).filter((n) => declared.has(n));
    if (shared.length) {
      throw new Error(`gen-tokens: presets ${a.axis}=${a.preset} and ${b.axis}=${b.preset} both declare --${shared.join(', --')} `
        + 'in CSS; presets on different axes must declare disjoint properties so their combinations compose');
    }
  }
  // Every combination, resolved from the merged overrides, equals the composition tokens.ts performs.
  for (const combo of presetCombinations(out)) {
    const selection = Object.fromEntries(combo.filter(([, p]) => p));
    const chosen = out.filter((e) => selection[e.axis] === e.preset);
    if (chosen.length < 2) continue;
    const truth = createResolver(tokens, Object.assign({}, ...chosen.map((e) => e.values)));
    for (const t of tokens) {
      const want = truth.value(t.name);
      const got = composePresets(out, selection, t.name, base.value(t.name));
      if (got !== want) {
        throw new Error(`gen-tokens: --${t.name} under ${chosen.map((e) => `${e.axis}=${e.preset}`).join(' + ')} resolves to ${want} `
          + `but the presets compose to ${got}; two axes move it through references, so give it to one axis`);
      }
    }
  }
  return out;
}

function cssBlock(selector, decls) {
  return `${selector}{\n${decls.map((line) => `  ${line}`).join('\n')}\n}\n`;
}

/** tokens.css text. */
function generateCss(source) {
  const tokens = flattenTokens(source);
  const base = createResolver(tokens);
  const lines = [];
  let group = null;
  let row = [];
  const flush = () => { if (row.length) lines.push(row.join('')); row = []; };
  for (const token of tokens) {
    const key = `${token.tier}.${token.group}`;
    if (key !== group) { flush(); group = key; }
    row.push(`--${token.name}:${base.css(token.name)};`);
    if (row.join('').length > 100) flush();
  }
  flush();
  // The tokens layer (brand-ui SPEC §5): the sheet opens with the document's layer order (src/ui/styleLayers.ts), then
  // declares into its own layer.
  let text = `${CSS_HEADER}${STYLE_LAYER_ORDER}\n@layer tokens{\n${cssBlock(':root', lines)}`;
  for (const { axis, preset, media, css } of presetEffects(source, tokens)) {
    const decls = [css.map(([name, value]) => `--${name}:${value};`).join('')];
    text += cssBlock(`:root[data-${axis}=${preset}]`, decls);
    if (media) text += `@media ${media}{\n${cssBlock(':root', decls).replace(/^/gm, '  ').trimEnd()}\n}\n`;
  }
  return `${text}}\n`;
}

const tsKey = (name) => (/^[a-z_$][a-z0-9_$]*$/i.test(name) ? name : `'${name}'`);
const tsString = (s) => (String(s).includes("'") ? JSON.stringify(String(s)) : `'${String(s)}'`);
function tsObject(entries, indent = '  ') {
  return `{\n${entries.map(([k, v]) => `${indent}${tsKey(k)}: ${v},`).join('\n')}\n${indent.slice(2)}}`;
}
/** Plain JSON data (numbers, strings, nested objects) as a TS literal, one level per line. */
function tsLiteral(value, indent = '  ') {
  if (value === null || typeof value !== 'object') return typeof value === 'string' ? tsString(value) : String(value);
  const flat = Object.values(value).every((v) => v === null || typeof v !== 'object');
  if (flat) return `{ ${Object.entries(value).map(([k, v]) => `${tsKey(k)}: ${tsLiteral(v)}`).join(', ')} }`;
  return tsObject(Object.entries(value).map(([k, v]) => [k, tsLiteral(v, `${indent}  `)]), indent);
}

/** tokens.ts text. */
function generateTs(source) {
  const tokens = flattenTokens(source);
  const base = createResolver(tokens);
  const values = tokens.map((t) => [t.name, tsString(base.value(t.name))]);
  const px = tokens.filter((t) => typeof t.raw === 'number' && t.scale).map((t) => [t.name, String(t.raw)])
    .concat(tokens.filter((t) => typeof t.raw === 'string' && /^\d+(\.\d+)?px$/.test(t.raw))
      .map((t) => [t.name, t.raw.slice(0, -2)]));
  const ms = tokens.filter((t) => typeof t.raw === 'string' && /^\d+ms$/.test(t.raw)).map((t) => [t.name, t.raw.slice(0, -2)]);
  const ease = tokens.filter((t) => typeof t.raw === 'string' && /^cubic-bezier\(/.test(t.raw))
    .map((t) => [t.name, `[${t.raw.slice(13, -1).split(',').map((n) => Number(n)).join(', ')}]`]);
  const presets = presetEffects(source, tokens);
  const axes = [...new Set(presets.map((p) => p.axis))];
  const table = (entries, indent) => (entries.length ? tsObject(entries.map(([name, v]) => [name, tsString(v)]), indent) : '{}');
  const presetTs = axes.map((axis) => [axis, tsObject(presets.filter((p) => p.axis === axis)
    .map(({ preset, set, follows }) => [preset, tsObject([['set', table(set, '        ')], ['follows', table(follows, '        ')]], '      ')]),
    '    ')]);
  return `// Generated by tools/gen-tokens.mjs from src/ui/tokens/tokens.json. Do not edit by hand:
// edit tokens.json and run \`node tools/gen-tokens.mjs\`. Copyright © 2026 Kevin B. Liu.
// Design tokens of Claude of Tanks (brand-ui SPEC §4) for canvas, three.js, the minimap, the kill cam and the
// damage panel. Values are fully resolved; CSS consumers read the custom properties in tokens.css instead.

/** Every token by its CSS custom-property name (without "--"), resolved at the default presets and scale 1. */
export const TOKENS = ${tsObject(values)} as const;

type TokenName = keyof typeof TOKENS;

/** Pixel tokens as numbers (type, space, radius): CSS multiplies the type scale by --cot-type-scale. */
export const TOKEN_PX = ${tsObject(px)} as const;

/** Duration tokens in milliseconds (collapse to 1 under the reduce-motion preset). */
export const TOKEN_MS = ${tsObject(ms)} as const;

/** Easing tokens as cubic-bezier control points. */
export const TOKEN_EASE = ${tsObject(ease)} as const;

/** Per preset, every token whose resolved value moves: \`set\` holds its direct overrides, \`follows\` the tokens derived
 *  from them. These are the values the cascade gives under :root[data-cvd|data-contrast|data-motion] in tokens.css;
 *  tools/gen-tokens.mjs proves every selection across axes composes to the merged result. */
export const TOKEN_PRESETS = ${tsObject(presetTs)} as const;

type PresetAxis = keyof typeof TOKEN_PRESETS;
type TokenPresets = { [A in PresetAxis]?: keyof (typeof TOKEN_PRESETS)[A] };
type PresetTable = { readonly set: Readonly<Record<string, string>>; readonly follows: Readonly<Record<string, string>> };

/** One token's value under a preset selection (default presets when omitted): derived values, then direct overrides. */
export function tokenValue(name: TokenName, presets: TokenPresets = {}): string {
  let out: string = TOKENS[name];
  for (const pass of ['follows', 'set'] as const) {
    for (const axis of Object.keys(presets) as PresetAxis[]) {
      const preset = presets[axis];
      const table = (preset ? TOKEN_PRESETS[axis][preset as never] : undefined) as PresetTable | undefined;
      if (table && Object.hasOwn(table[pass], name)) out = table[pass][name];
    }
  }
  return out;
}

/** Viewport bands (px, inclusive maxima), mirrored from src/ui/responsiveLayout.ts. */
export const TOKEN_BREAKPOINTS = ${tsLiteral(source.breakpoint ?? {})} as const;

/** Layout grid per band: columns, margin and gutter in px. */
export const TOKEN_GRID = ${tsLiteral(source.grid ?? {})} as const;
`;
}

/** Both generated files keyed by path. Pure: the same tokens.json always yields the same bytes. */
export function generate(source = JSON.parse(readFileSync(TOKENS_JSON, 'utf8'))) {
  return { [TOKENS_CSS]: generateCss(source), [TOKENS_TS]: generateTs(source) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const check = process.argv.includes('--check');
  const files = generate();
  const drift = [];
  for (const [path, text] of Object.entries(files)) {
    let current = null;
    try { current = readFileSync(path, 'utf8'); } catch { /* missing counts as drift */ }
    if (current === text) continue;
    if (check) drift.push(path.slice(ROOT.length + 1));
    else writeFileSync(path, text);
  }
  if (drift.length) {
    console.error(`gen-tokens: ${drift.join(', ')} drifted from src/ui/tokens/tokens.json; run node tools/gen-tokens.mjs`);
    process.exitCode = 1;
  } else {
    console.log(check ? 'gen-tokens: generated files match tokens.json' : 'gen-tokens: tokens.css and tokens.ts written');
  }
}
