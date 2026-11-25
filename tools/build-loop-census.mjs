// The build-loop census (build-loop-yield-277, 2026-11-24): every Node loop of this checkout that builds tank after tank
// or world after world in one process awaits betweenBuilds() (tools/build-loop-yield.mjs) in its body.
// First-party tooling: Kevin B. Liu.
//
// Without the yield a loop chained only through awaits that resolve at once (or no awaits at all) never ends its job, so
// V8 keeps every build's WeakRef targets (the shadow-caster lists a tank or a world registers) and Node never runs the
// N-API finalizers that free its native canvases: gen-interior-fills --all reached 31 GB, roadLife.selftest 8.1 GiB and
// gun-junction-census --update --all grew ~5 GB a minute to 24 GB before it was killed.
//
// What it reads: the Node scripts under tools/ and src/ (.mjs, .js, .cjs; tracked and new). The game's TypeScript is
// not read: a browser frame ends its job on its own, and betweenBuilds() is a Node tool's yield.
// A build is a call to one of BUILD_ENTRIES (by name, as a bare call or a member call: createTank(), fleet.createTank(),
// props.createProps()), or to a function that makes one: a function of the same file that calls a build, or one
// exported by another scanned script under the same name (a receipt's test-support builder), to a fixpoint.
// A loop is a for, for-of, for-in, while or do statement, or the callback of an array method that runs per element
// (forEach, map, flatMap, reduce, filter, some, every, find, findIndex). A build loop has a build in its body (nested
// functions included). It yields when its body calls betweenBuilds(), or when the build it calls is a function whose
// own body awaits betweenBuilds() (headlessWorldCollision.mjs buildWorldCollisionData, roadLife.selftest's build()).
// tools/build-loop-census.selftest.mjs fails on every build loop that does not yield, with file:line, outside its short
// exception list.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
/** The calls that build a tank (tankFactory / fleetFactory) or a world's drawn layers (map, props, vegetation, terrain meshes). */
export const BUILD_ENTRIES = Object.freeze(['createTank', 'createTankSteps', 'createMap', 'createMapAsync', 'createProps',
  'createPropsAsync', 'createVegetation', 'createVegetationAsync', 'buildTerrainMeshes', 'buildTerrainMeshesAsync']);
export const YIELD = 'betweenBuilds';
const PER_ELEMENT = new Set(['forEach', 'map', 'flatMap', 'reduce', 'filter', 'some', 'every', 'find', 'findIndex']);

/** The name a call is made by: the identifier, or the member's property name. */
function calleeName(call) {
  let e = call.expression;
  while (ts.isParenthesizedExpression(e) || ts.isNonNullExpression?.(e)) e = e.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return null;
}

/** Every call name made inside a node (nested functions included). */
function callsIn(node) {
  const names = new Set();
  const visit = (n) => {
    if (ts.isCallExpression(n)) {
      const name = calleeName(n);
      // the yield counts only awaited: a betweenBuilds() whose promise is dropped yields nothing
      if (name && (name !== YIELD || ts.isAwaitExpression(n.parent))) names.add(name);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return names;
}

/** Named functions of a file: declarations, and arrows or function expressions bound to a const/let/var. */
function namedFunctions(sf) {
  const out = new Map();
  const add = (name, node, exported) => {
    const had = out.get(name);
    out.set(name, { calls: new Set([...(had?.calls ?? []), ...callsIn(node.body ?? node)]), exported: exported || !!had?.exported });
  };
  const exportedNames = new Set();
  const visit = (n) => {
    const exported = !!(ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
    if (ts.isFunctionDeclaration(n) && n.name && n.body) add(n.name.text, n, exported);
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) add(d.name.text, d.initializer, exported);
    } else if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer
      && (ts.isArrowFunction(n.initializer) || ts.isFunctionExpression(n.initializer)) && !ts.isVariableDeclarationList(n.parent)) add(n.name.text, n.initializer, false);
    if (ts.isExportDeclaration(n) && !n.moduleSpecifier && n.exportClause && ts.isNamedExports(n.exportClause)) {
      for (const el of n.exportClause.elements) exportedNames.add((el.propertyName ?? el.name).text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  for (const name of exportedNames) if (out.has(name)) out.get(name).exported = true;
  return out;
}

/** The loops of a file: { body, pos, line, kind }. */
function loopsOf(sf) {
  const loops = [];
  const visit = (n) => {
    const line = () => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
    if (ts.isForStatement(n) || ts.isForOfStatement(n) || ts.isForInStatement(n) || ts.isWhileStatement(n) || ts.isDoStatement(n)) {
      loops.push({ body: n.statement, pos: n.getStart(sf), line: line(), kind: ts.SyntaxKind[n.kind].replace(/Statement$/, '').toLowerCase() });
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && PER_ELEMENT.has(n.expression.name.text)) {
      const fn = n.arguments[0];
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) loops.push({ body: fn.body, pos: n.getStart(sf), line: line(), kind: `.${n.expression.name.text}` });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return loops;
}

/** Parse one script once: its named functions and loops with their call names. */
export function parseScript(file, text) {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return { file, functions: namedFunctions(sf), loops: loopsOf(sf).map((l) => ({ pos: l.pos, line: l.line, kind: l.kind, calls: callsIn(l.body) })) };
}

/**
 * The build loops of parsed scripts. `outside` holds builder names exported by other scripts (fixpoint below).
 * Returns { loops: [{ file, pos, line, kind, builds: [names], yields }], exported: Set of builder names it exports }.
 */
export function buildLoopsOf(parsed, outside = new Set()) {
  const builders = new Set([...BUILD_ENTRIES, ...outside]);
  const yielding = new Set(); // builders whose own body awaits the yield
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, fn] of parsed.functions) {
      if (builders.has(name)) continue;
      if ([...fn.calls].some((c) => builders.has(c) && c !== name)) { builders.add(name); changed = true; }
    }
  }
  for (const [name, fn] of parsed.functions) if (builders.has(name) && fn.calls.has(YIELD)) yielding.add(name);
  const loops = [];
  for (const loop of parsed.loops) {
    const builds = [...loop.calls].filter((c) => builders.has(c));
    if (!builds.length) continue;
    loops.push({ file: parsed.file, pos: loop.pos, line: loop.line, kind: loop.kind, builds, yields: loop.calls.has(YIELD) || builds.some((b) => yielding.has(b)) });
  }
  const exported = new Set([...parsed.functions].filter(([name, fn]) => fn.exported && builders.has(name) && !BUILD_ENTRIES.includes(name)).map(([name]) => name));
  return { loops, exported };
}

/** The Node scripts the census reads (tracked and new, under tools/ and src/). */
export function censusFiles(root = ROOT) {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'tools', 'src'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter((file) => /\.(?:mjs|js|cjs)$/.test(file) && !file.startsWith('src/vendor/'));
}

/** The census over the checkout: every build loop, yielding or not. */
export function census(root = ROOT) {
  const texts = new Map();
  for (const file of censusFiles(root)) {
    try { texts.set(file, readFileSync(join(root, file), 'utf8')); } catch { /* deleted in the working tree */ }
  }
  // Only a script that names a builder can hold a build loop: parse those, and widen the set with the builders they
  // export (a test-support module's builder called by a receipt), to a fixpoint.
  const parsed = new Map();
  let outside = new Set();
  for (;;) {
    const named = new RegExp(`\\b(?:${[...BUILD_ENTRIES, ...outside].join('|')})\\b`);
    for (const [file, text] of texts) if (!parsed.has(file) && named.test(text)) parsed.set(file, parseScript(file, text));
    const next = new Set(outside);
    for (const p of parsed.values()) for (const name of buildLoopsOf(p, outside).exported) next.add(name);
    if (next.size === outside.size) break;
    outside = next;
  }
  return { files: texts.size, parsed: parsed.size, outside, loops: [...parsed.values()].flatMap((p) => buildLoopsOf(p, outside).loops) };
}

/**
 * The build loops that may stay without the yield, per file: how many, and why. Each is a loop whose builds are held
 * together on purpose (nothing is free to go between them) or one that cannot await, under a loop that yields.
 */
export const BUILD_LOOP_EXCEPTIONS = Object.freeze({
  // the four Type 10 marks (and the six Object 292 comparison builds, the two XK2 turret stocks) are compared with each
  // other: every build stays alive until the comparison ends, so a yield between them frees nothing
  'src/vehicles/profiles/type10Marks.selftest.mjs': { loops: 1, reason: 'four marks built to be compared together' },
  'src/vehicles/profiles/russia152.selftest.mjs': { loops: 1, reason: 'six builds held together for the cross-comparison' },
  'src/vehicles/profiles/xk2.selftest.mjs': { loops: 1, reason: 'the two turret stocks are compared together (a sync helper)' },
  // the receipt interleaves the props jobs on purpose: all of them are in flight together (Promise.all)
  'src/world/propsTextureRows.selftest.mjs': { loops: 1, reason: 'concurrent props jobs interleaved on purpose' },
  // one id's case cache (two qualities x three camo seeds) is built once and searched across seat trials; the per-id
  // loop that drops it awaits betweenBuilds()
  'tools/gen-mission-attachment-seats.mjs': { loops: 3, reason: "the per-id case cache, held across the seat search (the id loop yields)" },
});

/** The build loops without the yield, past the exceptions; and the exception rows that no longer match the tree. */
export function openBuildLoops(loops) {
  const open = loops.filter((l) => !l.yields);
  const counts = new Map();
  for (const l of open) counts.set(l.file, (counts.get(l.file) ?? 0) + 1);
  const stale = Object.entries(BUILD_LOOP_EXCEPTIONS).filter(([file, row]) => counts.get(file) !== row.loops)
    .map(([file, row]) => `${file}: excepts ${row.loops} loop(s), the tree has ${counts.get(file) ?? 0} without the yield`);
  return { open: open.filter((l) => !BUILD_LOOP_EXCEPTIONS[l.file]), stale };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const started = performance.now();
  const { files, parsed, outside, loops } = census();
  const { open, stale } = openBuildLoops(loops);
  for (const l of open) console.log(`${l.file}:${l.line}: ${l.kind} builds ${l.builds.join(', ')} without await ${YIELD}()`);
  for (const line of stale) console.log(`stale exception: ${line}`);
  console.log(`build-loop census: ${files} scripts (${parsed} name a builder), ${loops.length} build loops, ${open.length} without ${YIELD}() `
    + `past ${Object.keys(BUILD_LOOP_EXCEPTIONS).length} excepted files (cross-file builders: ${[...outside].join(', ') || 'none'}) in ${((performance.now() - started) / 1000).toFixed(1)} s`);
  if (open.length || stale.length) process.exitCode = 1;
}
