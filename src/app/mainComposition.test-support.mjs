// Test support: run one of main.ts's own top-level compositions in Node (2026-11-02 audit F2/F3 review). A port
// binding that only main makes (an announcement, a reader, a notice) is otherwise unpinned: its runtime defaults it,
// so deleting main's line keeps every runtime test green. These helpers slice main's actual statement, strip its
// types and run it over a scope the test controls.
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

export const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');

/** main's top-level statement that begins with `head` (at a line start), through its closing `});` line. The head must
 * name one statement: 275's one-line `bus.on('phase:change', () => { connectivity?.refresh(); });` (aa8d9b73b5) came
 * first in main and two receipts silently ran it in place of the Garage handler they meant. */
export function mainStatement(head, source = mainSource) {
  const start = source.indexOf(`\n${head}`);
  if (start < 0) throw new Error(`main.ts has no top-level statement starting ${head}`);
  if (source.indexOf(`\n${head}`, start + 1) >= 0) throw new Error(`main.ts has more than one top-level statement starting ${head}: name one`);
  const end = source.indexOf('\n});', start + 1);
  if (end < 0) throw new Error(`main.ts statement ${head} has no closing line`);
  return source.slice(start + 1, end + 4);
}

/**
 * (replay-slices-276) The one top-level statement starting `head` whose body holds `anchor`: a listener found by what it
 * does, not by its first line (replay's fd79f71ad8 put the recording's close at the top of main's Garage phase:change
 * listener, and every slice by `bus.on('phase:change', () => {\n  if (game.phase === 'garage') {` stopped matching).
 */
export function mainStatementWith(head, anchor, source = mainSource) {
  const found = [];
  for (let start = source.indexOf(`\n${head}`); start >= 0; start = source.indexOf(`\n${head}`, start + 1)) {
    const end = source.indexOf('\n});', start + 1);
    if (end < 0) throw new Error(`main.ts statement ${head} has no closing line`);
    const statement = source.slice(start + 1, end + 4);
    if (statement.includes(anchor)) found.push(statement);
  }
  if (found.length !== 1) throw new Error(`main.ts has ${found.length} top-level statements starting ${head} that hold ${anchor}: want one`);
  return found[0];
}

/** A name main reads that the test did not provide: inert (any property, any call), never a thenable. */
function inert(name) {
  const stub = new Proxy(function inertStub() {}, {
    get: (_target, key) => {
      if (key === Symbol.toPrimitive) return () => `[inert ${name}]`;
      if (key === 'then' || typeof key === 'symbol') return undefined;
      return stub;
    },
    apply: () => stub,
    construct: () => stub,
    set: () => true,
  });
  return stub;
}

/**
 * Run main's statements over `scope`, returning the expression `result`. Free names resolve to the scope first, then
 * to Node's globals, then to an inert stub; assignments to scope names (main's `let`s) land in the scope.
 */
export function runMainStatements(statements, scope, result) {
  const body = stripTypeScriptTypes(Array.isArray(statements) ? statements.join('\n') : statements);
  const proxy = new Proxy(scope, {
    has: (target, key) => typeof key === 'string' && (key in target || !(key in globalThis)),
    get: (target, key) => {
      if (key === Symbol.unscopables) return undefined;
      if (key in target) return target[key];
      return typeof key === 'string' ? inert(key) : undefined;
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
  // sloppy-mode Function (no 'use strict'): `with` gives the statements the scope as their free names
  return new Function('scope', `with (scope) {\n${body}\nreturn (${result});\n}`)(proxy);
}
