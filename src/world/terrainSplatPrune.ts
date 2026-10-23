/**
 * terrainSplatPrune.ts — the terrain program's off features compiled out of its source (2026-10-15, the perf lane).
 *
 * The splat fragment (terrain.ts SPLAT_COMMON_FRAG, with the land use's LAND_USE_GLSL) carries every map's ground: the
 * land use's fields and paddies, the strata, the ice drift, the sand ripples, the jebel faces, the salt crust, the slabs
 * and a dozen more, each gated by a map-constant uniform (`if (uLandA.x > 0.001) { … }`). The fold
 * (terrainSplatFold.ts) turns those uniforms into GLSL constants of the map's values; this pass then removes every
 * gated block whose condition is false over those constants, so a map without fields never sends the 50 K characters of
 * the land use to the driver's compiler (the 10-15 link census: the splat fragment grew from 205 K to 374 K characters
 * since Sept 30, and its program links on every first entry).
 *
 * Exactness: a block is removed only when all of these hold, so the program computes what it computed before.
 *  - It is an `if (<condition>) { … }` statement with no `else` after it (a false branch with nothing else to run does
 *    nothing: GLSL block scope keeps its declarations inside).
 *  - Its condition is FALSE over the folded constants under three-valued logic. Any identifier that is not a folded
 *    constant, any function call, and any vector without a one-component swizzle is unknown. `false && x` is false and
 *    `true || x` is true; anything else involving an unknown stays unknown, and the block stays.
 *  - Arithmetic runs in float32 (Math.fround after every literal and operation, as the GPU's highp floats). A
 *    comparison whose two sides lie within PRUNE_MARGIN of each other (relative) is unknown, so no rounding detail can
 *    flip a decision.
 *  - The block holds no preprocessor line and its braces balance after comments are blanked (a `#ifdef` inside could
 *    pair with an `#endif` outside).
 * The folded constants are read back from the source itself (`const <float|vecN> <name> = <literal>;` lines whose name the
 * fold lists), so the pass sees exactly what the compiler sees. The program key already carries the folded values'
 * signature, so a pruned program is never shared with a map whose values differ.
 *
 * Lab switch: `?splatprune=0` or `window.__COT_SPLAT_PRUNE = false` keeps the full source (the A/B for pixel parity).
 */
import { SPLAT_FOLD_UNIFORMS } from './terrainSplatFold.ts';

/** Relative distance under which a comparison is not decided (float32 holds ~7 digits; this keeps four of headroom). */
export const PRUNE_MARGIN = 1e-4;

const UNKNOWN: unique symbol = Symbol('unknown');
/** A number carries whether arithmetic made it (only then can the GPU's rounding differ from ours). */
interface Num { n: number; exact: boolean }
type Value = Num | boolean | typeof UNKNOWN;
const isNum = (v: Value): v is Num => typeof v === 'object';

const f32 = Math.fround;
const SWIZZLE: Readonly<Record<string, number>> = { x: 0, y: 1, z: 2, w: 3, r: 0, g: 1, b: 2, a: 3, s: 0, t: 1, p: 2, q: 3 };

/** The folded constants a source declares: name -> float32 components (one for a float). */
export function foldedSplatConstants(source: string, names: readonly string[] = SPLAT_FOLD_UNIFORMS): Map<string, number[]> {
  const listed = new Set(names);
  const out = new Map<string, number[]>();
  for (const m of source.matchAll(/^[ \t]*const (float|vec2|vec3|vec4) (u[A-Za-z0-9_]+) = ([^;]+);/gm)) {
    const [, type, name, literal] = m;
    if (!listed.has(name)) continue;
    const parts = type === 'float' ? [literal] : /^vec[234]\((.*)\)$/.exec(literal.trim())?.[1].split(',') ?? null;
    if (!parts) continue;
    const values = parts.map((part) => Number(part.trim()));
    const size = type === 'float' ? 1 : Number(type[3]);
    if (values.length !== size || values.some((v) => !Number.isFinite(v))) continue;
    out.set(name, values.map(f32));
  }
  return out;
}

/** The source with every comment replaced by spaces (newlines kept): indices stay aligned for the brace search. */
export function blankGlslComments(source: string): string {
  let out = '';
  for (let i = 0; i < source.length;) {
    if (source.startsWith('//', i)) {
      const end = source.indexOf('\n', i);
      const stop = end < 0 ? source.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2);
      const stop = end < 0 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += source[i];
      i++;
    }
  }
  return out;
}

interface Token { kind: 'num' | 'id' | 'op' | '(' | ')' | ','; text: string }

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  const re = /\s*(?:(\d+\.\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|\d+(?:[eE][+-]?\d+)?)|([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z]+)?)|(&&|\|\||<=|>=|==|!=|[-+*/<>!])|([(),]))/y;
  let at = 0;
  while (at < text.length) {
    if (/^\s*$/.test(text.slice(at))) break;
    re.lastIndex = at;
    const m = re.exec(text);
    if (!m) return null;
    if (m[1] !== undefined) tokens.push({ kind: 'num', text: m[1] });
    else if (m[2] !== undefined) tokens.push({ kind: 'id', text: m[2] });
    else if (m[3] !== undefined) tokens.push({ kind: 'op', text: m[3] });
    else tokens.push({ kind: m[4] as '(' | ')' | ',', text: m[4] });
    at = re.lastIndex;
  }
  return tokens;
}

/**
 * Evaluate a GLSL condition over the folded constants: true, false, a number, or UNKNOWN. Exported for the receipt.
 */
export function evaluateSplatCondition(text: string, constants: ReadonlyMap<string, readonly number[]>): Value {
  const tokens = tokenize(text);
  if (!tokens) return UNKNOWN;
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const isOp = (op: string): boolean => peek()?.kind === 'op' && peek()!.text === op;
  const num = (v: Value): Num | typeof UNKNOWN => (isNum(v) ? v : UNKNOWN);
  const made = (n: number): Num => ({ n: f32(n), exact: false });
  const bool = (v: Value): boolean | typeof UNKNOWN => (typeof v === 'boolean' ? v : UNKNOWN);
  let failed = false;

  const primary = (): Value => {
    const token = tokens[pos++];
    if (!token) { failed = true; return UNKNOWN; }
    if (token.kind === 'num') return { n: f32(Number(token.text)), exact: true };
    if (token.kind === '(') {
      const value = or();
      if (tokens[pos]?.kind !== ')') { failed = true; return UNKNOWN; }
      pos++;
      return value;
    }
    if (token.kind === 'id') {
      if (peek()?.kind === '(') {
        // a call (max, smoothstep, a constructor): unknown, its arguments consumed
        let depth = 0;
        do {
          const t = tokens[pos++];
          if (!t) { failed = true; return UNKNOWN; }
          if (t.kind === '(') depth++;
          else if (t.kind === ')') depth--;
        } while (depth > 0);
        return UNKNOWN;
      }
      if (token.text === 'true') return true;
      if (token.text === 'false') return false;
      const [name, swizzle] = token.text.split('.');
      const value = constants.get(name);
      if (!value) return UNKNOWN;
      if (swizzle === undefined) return value.length === 1 ? { n: value[0], exact: true } : UNKNOWN;
      if (swizzle.length !== 1 || !(swizzle in SWIZZLE)) return UNKNOWN;
      const component = value[SWIZZLE[swizzle]];
      return component === undefined ? UNKNOWN : { n: component, exact: true };
    }
    failed = true;
    return UNKNOWN;
  };
  const unary = (): Value => {
    if (isOp('-')) { pos++; const v = num(unary()); return v === UNKNOWN ? UNKNOWN : { n: -v.n, exact: v.exact }; }
    if (isOp('+')) { pos++; return num(unary()); }
    if (isOp('!')) { pos++; const v = bool(unary()); return v === UNKNOWN ? UNKNOWN : !v; }
    return primary();
  };
  const mul = (): Value => {
    let left = unary();
    while (isOp('*') || isOp('/')) {
      const op = tokens[pos++].text;
      const a = num(left), b = num(unary());
      left = a === UNKNOWN || b === UNKNOWN ? UNKNOWN : op === '*' ? made(a.n * b.n) : (b.n === 0 ? UNKNOWN : made(a.n / b.n));
    }
    return left;
  };
  const add = (): Value => {
    let left = mul();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].text;
      const a = num(left), b = num(mul());
      left = a === UNKNOWN || b === UNKNOWN ? UNKNOWN : op === '+' ? made(a.n + b.n) : made(a.n - b.n);
    }
    return left;
  };
  const compare = (): Value => {
    const left = add();
    const op = peek()?.kind === 'op' ? peek()!.text : '';
    if (!['<', '>', '<=', '>=', '==', '!='].includes(op)) return left;
    pos++;
    const l = num(left), r = num(add());
    if (l === UNKNOWN || r === UNKNOWN) return UNKNOWN;
    const a = l.n, b = r.n;
    // two exact float32 values (literals, folded constants) compare exactly; a side arithmetic made could round
    // differently on the GPU, so a comparison within the margin is not decided and keeps the code
    if (!(l.exact && r.exact) && Math.abs(a - b) <= PRUNE_MARGIN * Math.max(1, Math.abs(a), Math.abs(b))) return UNKNOWN;
    switch (op) {
      case '<': return a < b;
      case '>': return a > b;
      case '<=': return a <= b;
      case '>=': return a >= b;
      case '==': return a === b;
      default: return a !== b; // '!='
    }
  };
  const and = (): Value => {
    let left = compare();
    while (isOp('&&')) {
      pos++;
      const right = compare();
      const a = bool(left), b = bool(right);
      left = a === false || b === false ? false : a === true && b === true ? true : UNKNOWN;
    }
    return left;
  };
  function or(): Value {
    let left = and();
    while (isOp('||')) {
      pos++;
      const right = and();
      const a = bool(left), b = bool(right);
      left = a === true || b === true ? true : a === false && b === false ? false : UNKNOWN;
    }
    return left;
  }
  const value = or();
  if (failed || pos !== tokens.length) return UNKNOWN;
  return value;
}

export interface SplatPruneResult {
  source: string;
  /** Each removed block's condition and its length in characters. */
  pruned: Array<{ condition: string; chars: number }>;
  /** Gated blocks kept although their condition was false (an else follows, or a preprocessor line inside). */
  keptFalse: number;
}

/** Remove every provably-false, else-less, preprocessor-free `if` block (see the module note). */
export function pruneFoldedSplatBranches(source: string, constants = foldedSplatConstants(source)): SplatPruneResult {
  const pruned: SplatPruneResult['pruned'] = [];
  let keptFalse = 0;
  if (!constants.size) return { source, pruned, keptFalse };
  const masked = blankGlslComments(source);
  const cuts: Array<[number, number]> = [];
  const ifRe = /\bif\s*\(/g;
  let cutEnd = -1;
  for (let m = ifRe.exec(masked); m; m = ifRe.exec(masked)) {
    const start = m.index;
    if (start < cutEnd) continue; // inside a block already removed
    // a whole statement only: after a block, a statement or the source's start (never `else if`, never the unbraced
    // body of a for, a while or another if, whose removal would hand that body to the next statement)
    let p = start - 1;
    while (p >= 0 && /\s/.test(masked[p])) p--;
    const statementStart = p < 0 || masked[p] === '{' || masked[p] === '}' || masked[p] === ';';
    // the condition: up to the matching ')'
    let depth = 1, i = m.index + m[0].length;
    for (; i < masked.length && depth > 0; i++) {
      if (masked[i] === '(') depth++;
      else if (masked[i] === ')') depth--;
    }
    if (depth !== 0) break;
    const condition = masked.slice(m.index + m[0].length, i - 1);
    // the body must be a braced block
    let j = i;
    while (j < masked.length && /\s/.test(masked[j])) j++;
    if (masked[j] !== '{') continue;
    const value = evaluateSplatCondition(condition, constants);
    if (value !== false) continue;
    let braces = 1, k = j + 1;
    for (; k < masked.length && braces > 0; k++) {
      if (masked[k] === '{') braces++;
      else if (masked[k] === '}') braces--;
    }
    if (braces !== 0) break;
    const body = masked.slice(j, k);
    let after = k;
    while (after < masked.length && /\s/.test(masked[after])) after++;
    if (!statementStart || /^else\b/.test(masked.slice(after, after + 5)) || /^[ \t]*#/m.test(body)) {
      keptFalse++;
      continue;
    }
    cuts.push([start, k]);
    pruned.push({ condition: condition.replace(/\s+/g, ' ').trim(), chars: k - start });
    cutEnd = k;
  }
  if (!cuts.length) return { source, pruned, keptFalse };
  let out = '', from = 0;
  for (const [a, b] of cuts) { out += source.slice(from, a); from = b; }
  out += source.slice(from);
  return { source: out, pruned, keptFalse };
}

/** Pruning is on unless a lab tool asked for the full source (`?splatprune=0`, `window.__COT_SPLAT_PRUNE = false`). */
export function splatPruneEnabled(): boolean {
  try {
    const flag = (globalThis as { __COT_SPLAT_PRUNE?: unknown }).__COT_SPLAT_PRUNE;
    if (flag === false) return false;
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
    return !/[?&]splatprune=0(&|$)/.test(search);
  } catch {
    return true;
  }
}
