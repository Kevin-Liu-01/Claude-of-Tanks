#!/usr/bin/env node
// hot-path-alloc.mjs — no allocation in a marked hot path (2026-10-24, lockdown-251; the owner: "no more lag spikes").
//
// A function that runs every frame or on every press is marked by a line comment right above it:
//
//   // hot-path: the Garage frame (every animation frame while the Garage shows)
//   const prepareGarageFrame = (nowMs: number, dtSeconds: number): boolean => { … };
//
// Its body (nested functions included: a closure is itself an allocation) may not allocate: no `new`, no array or
// object literal, no closure, no spread, no template string, and none of the calls that return a fresh array, string or
// object (map, filter, slice, concat, split, join, toFixed, Object.keys/values/entries/assign, Array.from, JSON.*,
// structuredClone, clone). A deliberate allocation carries `// alloc-ok: <reason>` on its line (a cache miss, an error
// path, a once-per-session branch). The garbage these make is what the collector stalls a frame to sweep.
//
//   node tools/hot-path-alloc.mjs            the marked functions and every violation; exit 1 on any
//   node tools/hot-path-alloc.mjs --list     the marked functions only
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript-compiler-api';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MARK = /^\s*\/\/\s*hot-path:\s*(.+)$/;
const ALLOWED = /\/\/\s*alloc-ok:\s*\S/;
const ALLOCATING_METHODS = new Set(['map', 'filter', 'slice', 'concat', 'flat', 'flatMap', 'split', 'join', 'toFixed',
  'toPrecision', 'padStart', 'padEnd', 'repeat', 'replace', 'replaceAll', 'trim', 'toLowerCase', 'toUpperCase',
  'substring', 'substr', 'clone', 'toArray', 'toJSON', 'entries', 'keys', 'values']);
const ALLOCATING_STATICS = new Map([
  ['Object', new Set(['keys', 'values', 'entries', 'assign', 'fromEntries', 'create'])],
  ['Array', new Set(['from', 'of'])],
  ['JSON', new Set(['parse', 'stringify'])],
  ['Promise', new Set(['all', 'race', 'allSettled', 'any', 'resolve', 'reject'])],
]);
const GLOBAL_ALLOCATORS = new Set(['structuredClone', 'String']);

function* sourceFiles(dir) {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    const stat = statSync(join(ROOT, rel));
    if (stat.isDirectory()) yield* sourceFiles(rel);
    else if (/\.ts$/.test(name) && !/\.d\.ts$/.test(name)) yield rel;
  }
}

/** The function-like node a marked line introduces (only whitespace and comments between the mark and it): a
 * declaration, a method, or a variable, property or class field holding a function. */
function functionAt(sourceFile, position, text) {
  let best = null;
  let bestStart = Infinity;
  const holder = (node) => {
    if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) return node;
    if (ts.isVariableStatement(node)) return node.declarationList.declarations[0]?.initializer ?? null;
    if (ts.isPropertyAssignment(node) || ts.isPropertyDeclaration(node)) return node.initializer ?? null;
    return null;
  };
  const visit = (node) => {
    if (node.end < position) return;
    const start = node.getStart(sourceFile);
    const fn = holder(node);
    if (fn && start >= position && start < bestStart
      && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn) || ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn))) {
      best = fn;
      bestStart = start;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (!best) return null;
  const between = text.slice(position, bestStart).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
  return between.trim() === '' ? best : null;
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return { owner: null, name: expression.text };
  if (ts.isPropertyAccessExpression(expression)) {
    const owner = ts.isIdentifier(expression.expression) ? expression.expression.text : null;
    return { owner, name: expression.name.text };
  }
  return null;
}

/** Every allocating construct in a function's body, as [line, kind] (lines with an alloc-ok are skipped). */
export function allocationsIn(fn, sourceFile, lines) {
  const found = [];
  const report = (node, kind) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
    if (ALLOWED.test(lines[line] ?? '')) return;
    found.push({ line: line + 1, kind, text: (lines[line] ?? '').trim().slice(0, 120) });
  };
  const visit = (node, depth) => {
    if (depth > 0 && (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node))) {
      report(node, 'closure');
      return;
    }
    if (ts.isTypeNode(node) || ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return;
    if (ts.isNewExpression(node)) report(node, `new ${node.expression.getText(sourceFile)}`);
    else if (ts.isArrayLiteralExpression(node) && !isDestructuringTarget(node)) report(node, 'array literal');
    else if (ts.isObjectLiteralExpression(node) && !isDestructuringTarget(node)) report(node, 'object literal');
    else if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) report(node, 'spread');
    else if (ts.isTemplateExpression(node)) report(node, 'template string');
    else if (ts.isCallExpression(node)) {
      const callee = calleeName(node.expression);
      if (callee) {
        if (callee.owner && ALLOCATING_STATICS.get(callee.owner)?.has(callee.name)) report(node, `${callee.owner}.${callee.name}`);
        else if (!callee.owner && GLOBAL_ALLOCATORS.has(callee.name) && ts.isIdentifier(node.expression)) report(node, callee.name);
        else if (ts.isPropertyAccessExpression(node.expression) && ALLOCATING_METHODS.has(callee.name)
          && !(callee.owner && ALLOCATING_STATICS.has(callee.owner))) report(node, `.${callee.name}()`);
      }
    }
    ts.forEachChild(node, (child) => visit(child, depth + 1));
  };
  const body = fn.body;
  if (body) visit(body, 1);
  return found;
}

/** `const { a } = x` / `[a, b] = pair`: a pattern, not an allocation. */
function isDestructuringTarget(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isVariableDeclaration(parent) && parent.name === node) return true;
  if (ts.isBinaryExpression(parent) && parent.left === node && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken) return true;
  if (ts.isForOfStatement(parent) && parent.initializer === node) return true;
  return false;
}

/** The marked hot paths in one source text: { file, line, reason, name, found, allocations }. */
export function scanSource(file, text) {
  if (!text.includes('hot-path:')) return [];
  const results = [];
  const lines = text.split('\n');
  const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let offset = 0;
  for (let index = 0; index < lines.length; index++) {
    const match = MARK.exec(lines[index]);
    offset += lines[index].length + 1;
    if (!match) continue;
    const fn = functionAt(sourceFile, offset, text);
    const name = fn?.name?.getText?.(sourceFile)
      ?? (fn?.parent && (ts.isVariableDeclaration(fn.parent) || ts.isPropertyAssignment(fn.parent) || ts.isPropertyDeclaration(fn.parent))
        ? fn.parent.name.getText(sourceFile) : null);
    results.push({ file, line: index + 1, reason: match[1].trim(), name: name ?? null,
      found: !!fn, allocations: fn ? allocationsIn(fn, sourceFile, lines) : [] });
  }
  return results;
}

/** Every marked hot path under src/. */
export function scanHotPaths(dirs = ['src']) {
  const results = [];
  for (const dir of dirs) {
    for (const rel of sourceFiles(dir)) results.push(...scanSource(relative(ROOT, join(ROOT, rel)), readFileSync(join(ROOT, rel), 'utf8')));
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const results = scanHotPaths();
  let failures = 0;
  for (const result of results) {
    const where = `${result.file}:${result.line} ${result.name ?? '(no function)'}`;
    if (!result.found) { failures++; console.log(`✖ ${where}: the hot-path mark is not above a function`); continue; }
    if (process.argv.includes('--list')) { console.log(`${where} — ${result.reason}`); continue; }
    if (!result.allocations.length) { console.log(`✓ ${where}`); continue; }
    failures++;
    console.log(`✖ ${where}: ${result.allocations.length} allocation(s)`);
    for (const a of result.allocations) console.log(`    ${result.file}:${a.line} ${a.kind}: ${a.text}`);
  }
  console.log(`hot-path-alloc: ${results.length} marked hot path(s), ${failures} failing`);
  if (failures && !process.argv.includes('--list')) process.exitCode = 1;
}
