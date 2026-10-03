// static-import-closure.mjs — the modules a source entry evaluates before it runs.
//
// Follows `import … from`, bare `import '…'` and `export … from` edges with relative
// specifiers; package imports and `import()` (lazy chunks) are not followed. Type-only
// declarations (`import type`, `export type`) are erased by the compiler and are not edges.
// `import { type X } from` is kept: under verbatimModuleSyntax it compiles to a side-effect
// import, so it is a real runtime edge. Non-JS targets (JSON, CSS) are leaves.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { parseAst } from 'rolldown/parseAst';

const SCRIPT_RE = /\.(?:[cm]?[jt]s)$/;

function resolveSpecifier(fromFile, specifier) {
  const path = resolve(dirname(fromFile), specifier.split(/[?#]/, 1)[0]);
  if (existsSync(path)) return path;
  if (path.endsWith('.js') && existsSync(`${path.slice(0, -3)}.ts`)) return `${path.slice(0, -3)}.ts`;
  for (const candidate of [`${path}.ts`, resolve(path, 'index.ts')]) if (existsSync(candidate)) return candidate;
  return null;
}

/** Runtime import edges (relative specifiers) of one source module. */
export function runtimeImportSpecifiers(source, file = 'module.ts') {
  const program = parseAst(String(source), { lang: file.endsWith('.ts') ? 'ts' : 'js' }, file);
  const specifiers = [];
  for (const node of program.body) {
    if (node.type === 'ImportDeclaration' && node.importKind !== 'type') specifiers.push(node.source.value);
    else if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration')
      && node.source && node.exportKind !== 'type') specifiers.push(node.source.value);
  }
  return specifiers.filter((value) => typeof value === 'string' && (value.startsWith('./') || value.startsWith('../')));
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
      const target = resolveSpecifier(file, specifier);
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
