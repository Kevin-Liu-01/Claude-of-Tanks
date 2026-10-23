// Build-only: comments and layout whitespace out of the CSS the game keeps in TypeScript (brand-ui BUI-F3, 2026-10-18).
// Copyright © 2026 Kevin B. Liu.
//
// About 240 KB of CSS lives in TS template literals (SPEC §5.2: the HUD, the menus, settings, the end screen, the kill
// cam), injected through ensureStyle() (src/ui/styleLayers.ts). Lightning CSS minifies the .css files; these literals
// shipped as written, comments and indentation included. This transform rewrites the CSS literals of the project's
// own modules: a template or string literal that initialises a constant named CSS or *_CSS, or that is the sheet
// argument of an ensureStyle() call. Inside each piece of the literal (between `${…}` interpolations) it removes
// CSS comments, folds every whitespace run that holds a line break into one space and drops the whitespace beside
// `{`, `}` and `;`. Quoted strings are never touched, nor the text a piece shares with an interpolation (a
// `font:800 9px ${STACK}` keeps its space), nor tagged templates. A piece whose comment or string could run past its
// end is left as written. Every rewrite is checked at build time: the CSS token stream (strings verbatim, whitespace
// counted only between two tokens that it separates) must be identical, or the build fails.
// tools/viteCssInTsMinify.selftest.mjs proves, with Lightning CSS, that each literal of the sources minifies to the
// same stylesheet as before.
import { parseAst } from 'rolldown/parseAst';
import type { Plugin } from 'vite';

/** Cheap prefilter for a module worth parsing. */
const MODULE_MARKER_RE = /\b(?:CSS|ensureStyle)\b/;
const CSS_NAME_RE = /(?:^|_)CSS$/;

/**
 * One literal piece minified: comments out, line-breaking whitespace runs folded to a space, whitespace beside
 * `{` `}` `;` dropped, strings untouched. Null when a comment or a string could continue past the piece.
 */
export function minifyCssPiece(text: string): string | null {
  // pass 1: comments out, strings kept whole. A comment separates nothing in CSS (div/**/.x is div.x), so it goes
  // without a trace; one wedged between two word characters (a/**/b) leaves the piece as written.
  let clean = '';
  const SEPARATES = /[\s{}();:,>+~]/;
  for (let i = 0; i < text.length;) {
    const c = text[i]!;
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end === -1) return null;
      const before = clean.at(-1), after = text[end + 2];
      if (before !== undefined && after !== undefined && !SEPARATES.test(before) && !SEPARATES.test(after)) return null;
      i = end + 2;
      continue;
    }
    if (c === '*' && text[i + 1] === '/') return null; // this piece may start inside a comment
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < text.length && text[j] !== c; j++) { if (text[j] === '\\') j++; if (text[j] === '\n') return null; }
      if (j >= text.length) return null; // a string spliced across an interpolation
      clean += text.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    clean += c;
    i++;
  }
  // pass 2: whitespace outside strings
  let out = '';
  for (let i = 0; i < clean.length;) {
    const c = clean[i]!;
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < clean.length && clean[j] !== c; j++) if (clean[j] === '\\') j++;
      out += clean.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (/\s/.test(c)) {
      let j = i;
      while (j < clean.length && /\s/.test(clean[j]!)) j++;
      const run = clean.slice(i, j);
      const before = out.at(-1), after = clean[j];
      const atEdge = i === 0 || j === clean.length; // shared with a neighbour (interpolation or concatenation)
      if (!atEdge && (before === '{' || before === '}' || before === ';' || after === '{' || after === '}' || after === ';')) { i = j; continue; }
      out += /\n/.test(run) || run.length > 1 ? (atEdge && !/\n/.test(run) ? run : ' ') : run;
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/**
 * The CSS token stream a rewrite must keep: comments dropped, strings verbatim, `{}();:,` as tokens, and whitespace as
 * one token only where it separates two other tokens (a descendant combinator, a value list), never beside `{}`/`;`.
 */
export function cssTokens(text: string): string[] {
  const tokens: string[] = [];
  let pendingSpace = false;
  const push = (token: string) => {
    if (pendingSpace && tokens.length && !/^[{};]$/.test(tokens.at(-1)!) && !/^[{};]$/.test(token)) tokens.push('␣');
    pendingSpace = false;
    tokens.push(token);
  };
  for (let i = 0; i < text.length;) {
    const c = text[i]!;
    if (c === '/' && text[i + 1] === '*') { const end = text.indexOf('*/', i + 2); i = end === -1 ? text.length : end + 2; continue; }
    if (/\s/.test(c)) { pendingSpace = true; i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      for (; j < text.length && text[j] !== c; j++) if (text[j] === '\\') j++;
      push(text.slice(i, j + 1));
      i = j + 1;
      continue;
    }
    if (/[{}();:,]/.test(c)) { push(c); i++; continue; }
    let j = i;
    while (j < text.length && !/[\s{}();:,"']/.test(text[j]!) && !(text[j] === '/' && text[j + 1] === '*')) j++;
    push(text.slice(i, j));
    i = j;
  }
  if (pendingSpace) tokens.push('␣'); // a trailing separator stays significant at a piece's edge
  return tokens;
}

interface Edit { start: number; end: number; text: string }
type AstNode = { type?: string; start?: number; end?: number; [key: string]: unknown };
type Quasi = { start: number; end: number; value: { raw: string; cooked: string | null } };

const escapeTemplateRaw = (text: string): string => text.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  .replace(/\r/g, '\\r');

/** The minified pieces of one literal, or null when it is left as written; throws if a rewrite would change tokens. */
export function minifiedCssPieces(pieces: string[]): string[] | null {
  const out: string[] = [];
  for (const piece of pieces) {
    const min = minifyCssPiece(piece);
    if (min === null) return null;
    out.push(min);
  }
  if (out.every((min, index) => min === pieces[index])) return null;
  pieces.forEach((piece, index) => {
    const before = cssTokens(piece), after = cssTokens(out[index]!);
    // the edges of a piece meet an interpolation: a leading separator stays significant there too
    const lead = (text: string) => (/^\s/.test(text.replace(/^(?:\/\*[\s\S]*?\*\/)+/, '')) ? '␣' : '');
    if (lead(piece) !== lead(out[index]!) || before.length !== after.length || before.some((token, k) => token !== after[k])) {
      throw new Error('cot-css-in-ts-minify: a rewrite changed the CSS token stream; leave this literal alone or fix minifyCssPiece');
    }
  });
  return out;
}

/** True when the node is a CSS literal: a CSS/*_CSS constant's initialiser or ensureStyle()'s sheet argument. */
function cssLiteralParent(node: AstNode, parent: AstNode | null): boolean {
  if (!parent) return false;
  if (parent.type === 'VariableDeclarator' && parent.init === node) {
    const id = parent.id as AstNode;
    return id?.type === 'Identifier' && CSS_NAME_RE.test(String(id.name));
  }
  if (parent.type === 'CallExpression') {
    const callee = parent.callee as AstNode;
    const args = parent.arguments as unknown[];
    return callee?.type === 'Identifier' && callee.name === 'ensureStyle' && args?.[1] === node;
  }
  return false;
}

/** The module with its CSS literals minified, or null when nothing changes. */
export function minifyCssLiterals(code: string, file = 'module.js', lang: 'js' | 'ts' = 'js'): { code: string; literals: number; saved: number } | null {
  if (!MODULE_MARKER_RE.test(code)) return null;
  const ast = parseAst(code, { lang }, file) as unknown as AstNode;
  const edits: Edit[] = [];
  let literals = 0;
  const visit = (node: unknown, parent: AstNode | null): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const child of node) visit(child, parent); return; }
    const current = node as AstNode;
    if (current.type === 'TaggedTemplateExpression') return; // a tag receives the raw text
    if (cssLiteralParent(current, parent)) {
      if (current.type === 'Literal' && typeof current.value === 'string' && typeof current.start === 'number' && typeof current.end === 'number') {
        const min = minifiedCssPieces([current.value]);
        if (min) { edits.push({ start: current.start, end: current.end, text: JSON.stringify(min[0]) }); literals++; }
        return;
      }
      if (current.type === 'TemplateLiteral') {
        const quasis = current.quasis as Quasi[];
        // a quasi's span is its raw text (JS) or the raw text with its delimiters (`…${ / }…${ / }…`, TS): locate it
        const spans = quasis.map((quasi) => {
          const raw = quasi.value.raw;
          for (const start of [quasi.start, quasi.start + 1]) if (code.startsWith(raw, start) && start + raw.length <= quasi.end) return { start, end: start + raw.length };
          return null;
        });
        if (quasis.every((quasi, index) => typeof quasi.value.cooked === 'string' && spans[index])) {
          const min = minifiedCssPieces(quasis.map((quasi) => quasi.value.cooked as string));
          if (min) { spans.forEach((span, index) => edits.push({ start: span!.start, end: span!.end, text: escapeTemplateRaw(min[index]!) })); literals++; }
        }
        // interpolations may hold literals of their own (never CSS by this rule); nothing to visit below
        return;
      }
    }
    for (const key of Object.keys(current)) if (key !== 'type' && key !== 'start' && key !== 'end') visit(current[key], current);
  };
  visit(ast, null);
  if (!edits.length) return null;
  edits.sort((a, b) => a.start - b.start);
  let out = '', last = 0;
  for (const edit of edits) {
    out += code.slice(last, edit.start) + edit.text;
    last = edit.end;
  }
  out += code.slice(last);
  return { code: out, literals, saved: code.length - out.length };
}

/** Modules the transform may rewrite: the project's own sources, never a dependency. */
function isProjectSource(id: string, root: string): boolean {
  const path = id.split('?', 1)[0]!.replace(/\\/g, '/');
  const base = `${root.replace(/\\/g, '/').replace(/\/$/, '')}/src/`;
  return path.startsWith(base) && !path.includes('/node_modules/') && /\.(?:ts|js|mjs)$/.test(path);
}

/** The build-only plugin; skipped when the build writes source maps (it returns no map). */
export function cssInTsMinify(): Plugin {
  let enabled = true;
  let root = process.cwd();
  let literals = 0, saved = 0;
  let log: (message: string) => void = () => {};
  return {
    name: 'cot-css-in-ts-minify',
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
        const result = minifyCssLiterals(code, id);
        if (!result) return null;
        literals += result.literals;
        saved += result.saved;
        return { code: result.code, map: null };
      },
    },
    buildEnd() {
      if (enabled && literals) log(`cot-css-in-ts-minify: ${literals} CSS literals, ${saved} source characters removed`);
    },
  };
}
