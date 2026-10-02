// Build-only: comments and line-edge whitespace out of the game's own shader programs (2026-10-02).
//
// The game's shader programs ship as JS string and template literals with long explanatory comments. This transform
// removes GLSL comments, the indentation at the start of each line, trailing whitespace and blank lines from the
// literals under src/ that hold a complete shader stage (`void main() {`). It never joins lines (every `#` directive
// stays on its own line and starts it, as three's `#include` and `#pragma unroll_loop` patterns need), never changes
// the text inside a line, and never touches `${…}` interpolations, tagged templates or the outer edges of a literal
// (a piece of a runtime concatenation keeps the whitespace that separates it from its neighbours). Library shaders
// (three.js chunks, postprocessing) and shader fragments are left exactly as written: game code patches them by
// verbatim anchors, some of which keep their indentation across lines (lighting.ts's
// '\t\t#pragma unroll_loop_end\n\t#elif defined (USE_SHADOWMAP)' — stripping three's indentation broke it in the
// first cut). A literal whose comment could continue past its end (an open `//` or `/*`, a stray `*/`, a `//` line
// spliced by a trailing backslash) is left as written. Every rewrite is checked at build time: the GLSL token stream
// and the directive lines must be identical, or the build fails.
import { parseAst } from 'rolldown/parseAst';
import type { Plugin } from 'vite';

/** Cheap prefilter for a module worth parsing. */
const MODULE_MARKER_RE = /void\s+main|gl_Frag|gl_Position|#include\s*<|precision\s+(?:high|medium|low)p|#ifdef|#ifndef|#define|#pragma/;
const STRONG_GLSL = [
  /\bvoid\s+main\s*\(/,
  /\bgl_(?:FragColor|Position|FragCoord|PointSize|FragDepth|FrontFacing|InstanceID|VertexID)\b/,
  /(?:^|\n)[ \t]*#[ \t]*(?:include[ \t]*<|ifdef\b|ifndef\b|endif\b|define\b|pragma\b|version\b|extension\b|elif\b|undef\b)/,
  /\bprecision\s+(?:highp|mediump|lowp)\s+(?:float|int|sampler)/,
  /\b(?:uniform|varying|attribute|in|out|flat)\s+(?:(?:highp|mediump|lowp)\s+)?(?:float|int|uint|bool|[iub]?vec[234]|mat[234](?:x[234])?|sampler(?:2D|3D|Cube|2DArray|2DShadow|CubeShadow))\s+\w+\s*(?:\[[^\]]*\]\s*)?;/,
];

/** A multi-line text with at least one unmistakable GLSL construct. */
export function looksLikeGlsl(text: string): boolean {
  if (text.length < 24 || !text.includes('\n') || !/[;{}]|#\w/.test(text)) return false;
  return STRONG_GLSL.some((re) => re.test(text));
}

const MAIN_DEFINITION_RE = /\bvoid\s+main\s*\(\s*(?:void\s*)?\)\s*\{/;

/** A complete shader stage: GLSL with a `void main() {` definition. Fragments and anchors never qualify. */
export function isShaderProgram(text: string): boolean {
  return looksLikeGlsl(text) && MAIN_DEFINITION_RE.test(text);
}

/**
 * Comments, line-start indentation, trailing whitespace and blank lines removed; every line break kept; the first
 * line's start and the last line's end untouched. Null when a comment could continue past the text.
 */
export function minifyGlsl(text: string): string | null {
  let out = '';
  for (let i = 0; i < text.length;) {
    const c = text[i], next = text[i + 1];
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      if (end === -1) return null;
      if (/\\[ \t]*$/.test(text.slice(i, end))) return null; // a spliced line comment swallows the next line
      i = end;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return null;
      out += text.slice(i, end).includes('\n') ? '\n' : ' ';
      i = end + 2;
      continue;
    }
    if (c === '*' && next === '/') return null;
    out += c;
    i++;
  }
  const lines = out.split('\n');
  const kept: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    const continued = index > 0 && /\\$/.test(lines[index - 1]!);
    let line = lines[index]!;
    if (index > 0 && !continued) line = line.replace(/^[ \t]+/, '');
    if (index < lines.length - 1) line = line.replace(/[ \t]+$/, '');
    if (line === '' && index > 0 && index < lines.length - 1 && !continued) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

/**
 * The GLSL token stream the build checks every rewrite against: comments dropped in one left-to-right pass, a
 * directive line kept whole (its exact trimmed text, then a line end), every other line split into tokens.
 */
export function glslTokens(text: string): string[] {
  let clean = '';
  for (let i = 0; i < text.length;) {
    if (text.startsWith('//', i)) { const end = text.indexOf('\n', i); i = end === -1 ? text.length : end; continue; }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      clean += text.slice(i, stop).includes('\n') ? '\n' : ' ';
      i = stop;
      continue;
    }
    clean += text[i++];
  }
  const tokens: string[] = [];
  for (const line of clean.replace(/\\\n/g, '\\\u0001').split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) { tokens.push(`${trimmed}⏎`); continue; }
    for (const token of trimmed.match(/[A-Za-z_]\w*|\d[\w.]*|\.\d\w*|\\\u0001|[^\s\w]/g) ?? []) tokens.push(token);
  }
  return tokens;
}

interface Edit { start: number; end: number; text: string }
type AstNode = { type?: string; start?: number; end?: number; [key: string]: unknown };

const escapeTemplateRaw = (text: string): string => text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  .replace(/\r/g, '\\r');

function minifiedPieces(pieces: string[]): string[] | null {
  const joined = pieces.join('\n');
  if (!isShaderProgram(joined)) return null;
  const out: string[] = [];
  for (const piece of pieces) {
    const min = minifyGlsl(piece);
    if (min === null) return null;
    out.push(min);
  }
  if (out.every((min, index) => min === pieces[index])) return null;
  const before = glslTokens(pieces.join(' \u0002 ')), after = glslTokens(out.join(' \u0002 '));
  if (before.length !== after.length || before.some((token, index) => token !== after[index])) {
    throw new Error('cot-glsl-minify: a rewrite changed the GLSL token stream; leave this literal alone or fix minifyGlsl');
  }
  return out;
}

/** The module with its GLSL literals minified, or null when nothing changes. */
export function minifyGlslLiterals(code: string, file = 'module.js'): { code: string; literals: number; saved: number } | null {
  if (!MODULE_MARKER_RE.test(code)) return null;
  const ast = parseAst(code, { lang: 'js' }, file) as unknown as AstNode;
  const edits: Edit[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) visit(child); return; }
    const current = node as AstNode;
    if (current.type === 'TaggedTemplateExpression') return; // a tag receives the raw text
    if (current.type === 'Literal' && typeof current.value === 'string' && typeof current.start === 'number' && typeof current.end === 'number') {
      const min = minifiedPieces([current.value]);
      if (min) edits.push({ start: current.start, end: current.end, text: JSON.stringify(min[0]) });
      return;
    }
    if (current.type === 'TemplateLiteral') {
      const quasis = current.quasis as Array<{ start: number; end: number; value: { raw: string; cooked: string | null } }>;
      if (quasis.every((quasi) => typeof quasi.value.cooked === 'string' && code.slice(quasi.start, quasi.end) === quasi.value.raw)) {
        const min = minifiedPieces(quasis.map((quasi) => quasi.value.cooked as string));
        if (min) quasis.forEach((quasi, index) => edits.push({ start: quasi.start, end: quasi.end, text: escapeTemplateRaw(min[index]!) }));
      }
    }
    for (const key of Object.keys(current)) if (key !== 'type' && key !== 'start' && key !== 'end') visit(current[key]);
  };
  visit(ast);
  if (!edits.length) return null;
  edits.sort((a, b) => a.start - b.start);
  let out = '', last = 0;
  for (const edit of edits) {
    out += code.slice(last, edit.start) + edit.text;
    last = edit.end;
  }
  out += code.slice(last);
  return { code: out, literals: edits.length, saved: code.length - out.length };
}

/** Modules the transform may rewrite: the project's own sources, never a dependency. */
export function isProjectSource(id: string, root: string): boolean {
  const path = id.split('?', 1)[0]!.replace(/\\/g, '/');
  const base = `${root.replace(/\\/g, '/').replace(/\/$/, '')}/src/`;
  return path.startsWith(base) && !path.includes('/node_modules/') && /\.(?:ts|js|mjs)$/.test(path);
}

/** The build-only plugin; skipped when the build writes source maps (it returns no map). */
export function glslMinify(): Plugin {
  let enabled = true;
  let root = process.cwd();
  let literals = 0, saved = 0;
  let log: (message: string) => void = () => {};
  return {
    name: 'cot-glsl-minify',
    apply: 'build',
    configResolved(config) {
      enabled = !config.build.sourcemap;
      root = config.root;
      log = (message) => config.logger.info(message);
    },
    buildStart() { literals = 0; saved = 0; },
    transform: {
      filter: { code: MODULE_MARKER_RE },
      handler(code, id) {
        if (!enabled || !isProjectSource(id, root)) return null;
        const result = minifyGlslLiterals(code, id);
        if (!result) return null;
        literals += result.literals;
        saved += result.saved;
        return { code: result.code, map: null };
      },
    },
    buildEnd() {
      if (enabled && literals) log(`cot-glsl-minify: ${literals} GLSL literal pieces, ${saved} source characters removed`);
    },
  };
}
