// static-import-closure.mjs — the repository's one reader of source import edges (arch-1, 2026-11-27).
//
// Every tool that asks "what does this module import?" reads it here: the static closure a source entry evaluates
// before it runs (staticImportClosure), the driver and module boundary guards (tools/driver-boundaries.mjs,
// tools/module-boundaries.mjs), the build's page-catalog scan (tools/i18n-page-catalogs.mjs), the built-chunk budget
// (tools/bundle-budget.mjs) and the import-integrity receipt. tools/module-boundaries.selftest.mjs fails when one of
// them walks import declarations or resolves specifiers on its own again.
//
// Edges (importEdgesOf):
// - 'static': `import … from`, bare `import '…'` and `export … from` at the top level. `import { type X } from` is
//   static: under verbatimModuleSyntax it compiles to a side-effect import, so it is a real runtime edge.
// - 'type': `import type` and `export type … from`, which the compiler erases.
// - 'lazy': a literal `import('…')` anywhere in the module.
// - 'worker': `new URL('./x.ts', import.meta.url)`, a Worker entry (code the page runs too).
// Non-JS targets (JSON, CSS) are leaves. Package specifiers are returned as written; callers filter.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseAst } from 'rolldown/parseAst';

const SCRIPT_RE = /\.(?:[cm]?[jt]s)$/;

/** One module parsed: TypeScript for .ts/.mts/.cts, JavaScript otherwise. */
export function parseModule(source, file = 'module.ts') {
  return parseAst(String(source), { lang: /\.[cm]?ts$/.test(file) ? 'ts' : 'js' }, file);
}

/** A relative specifier (`./x`, `../x`): the only kind the graph follows. */
export const isRelativeSpecifier = (value) => typeof value === 'string' && (value.startsWith('./') || value.startsWith('../'));

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const item of node) walk(item, visit); return; }
  if (typeof node.type === 'string') visit(node);
  for (const name of Object.keys(node)) {
    if (name === 'parent') continue;
    const value = node[name];
    if (value && typeof value === 'object') walk(value, visit);
  }
}

const isLiteralString = (node) => node?.type === 'Literal' && typeof node.value === 'string';
const isImportMetaUrl = (node) => node?.type === 'MemberExpression' && node.object?.type === 'MetaProperty' && node.property?.name === 'url';

/** Every import edge of a parsed program: [{ specifier, kind: 'static'|'type'|'lazy'|'worker' }], declarations first. */
export function importEdgesOf(program) {
  const edges = [];
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration') edges.push({ specifier: node.source.value, kind: node.importKind === 'type' ? 'type' : 'static' });
    else if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
      edges.push({ specifier: node.source.value, kind: node.exportKind === 'type' ? 'type' : 'static' });
    }
  }
  walk(program, (node) => {
    if (node.type === 'ImportExpression' && isLiteralString(node.source)) edges.push({ specifier: node.source.value, kind: 'lazy' });
    if (node.type === 'NewExpression' && node.callee?.name === 'URL' && isLiteralString(node.arguments?.[0]) && isImportMetaUrl(node.arguments?.[1])
      && SCRIPT_RE.test(node.arguments[0].value)) edges.push({ specifier: node.arguments[0].value, kind: 'worker' });
  });
  return edges.filter((edge) => typeof edge.specifier === 'string');
}

/** One module's import edges from its source (importEdgesOf over parseModule). */
export function moduleImportEdges(source, file = 'module.ts') {
  return importEdgesOf(parseModule(source, file));
}

/** Runtime import edges (relative specifiers) of one source module: its static edges, the ones evaluated before it runs. */
export function runtimeImportSpecifiers(source, file = 'module.ts') {
  return moduleImportEdges(source, file).filter((edge) => edge.kind === 'static' && isRelativeSpecifier(edge.specifier)).map((edge) => edge.specifier);
}

const isFile = (path) => existsSync(path) && statSync(path).isFile();

/**
 * The file a specifier names from `fromFile` (absolute paths): the file itself, a `.js` written for its `.ts`, the
 * extensionless `.ts`, or a directory's `index.ts`; null when none exists. A query or hash (`?worker`, `?raw`) is dropped.
 */
export function resolveImportSpecifier(fromFile, specifier) {
  const path = resolve(dirname(fromFile), specifier.split(/[?#]/, 1)[0]);
  if (isFile(path)) return path;
  if (path.endsWith('.js') && isFile(`${path.slice(0, -3)}.ts`)) return `${path.slice(0, -3)}.ts`;
  for (const candidate of [`${path}.ts`, resolve(path, 'index.ts')]) if (isFile(candidate)) return candidate;
  return null;
}

/**
 * Walk the static closure of `entry` (repo-relative). Returns a Map from each reached module
 * (repo-relative, `/` separators) to the module that first imported it (null for the entry).
 */
export function staticImportClosure(entry, { root = process.cwd() } = {}) {
  const rootDir = resolve(root);
  const key = (path) => relative(rootDir, path).split('\\').join('/');
  const start = resolve(rootDir, entry);
  if (!existsSync(start)) throw new Error(`static-import-closure: missing entry ${entry}`);
  const reached = new Map([[key(start), null]]);
  const queue = [start];
  const missing = [];
  while (queue.length) {
    const file = queue.shift();
    if (!SCRIPT_RE.test(file)) continue;
    for (const specifier of runtimeImportSpecifiers(readFileSync(file, 'utf8'), file)) {
      const target = resolveImportSpecifier(file, specifier);
      if (!target) {
        missing.push(`${key(file)} -> ${specifier}`);
        continue;
      }
      if (reached.has(key(target))) continue;
      reached.set(key(target), key(file));
      queue.push(target);
    }
  }
  if (missing.length) throw new Error(`static-import-closure: unresolved imports\n${missing.join('\n')}`);
  return reached;
}

/** The import chain from the entry to `file` inside a closure, for failure messages. */
export function importChain(closure, file) {
  const chain = [];
  for (let current = file; current; current = closure.get(current) ?? null) {
    chain.unshift(current);
    if (chain.length > closure.size) break;
  }
  return chain.join(' -> ');
}
