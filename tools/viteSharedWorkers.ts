// Build-only: module workers that share the page's chunks (2026-10-02).
//
// Vite bundles every `new Worker(new URL('./x.ts', import.meta.url))` as a separate build, so a worker that
// imports the fleet re-emits every page module it reaches under other hashes: the wreck bake worker's graph was
// 12.40 MB raw / 2.26 MB brotli of which all but its 1.6 KB entry duplicated page modules, and the Garage
// workshop worker re-emitted 2.53 MB. This plugin instead emits each listed worker module as an extra entry of the
// page build (`this.emitFile({ type: 'chunk' })`): the worker then statically imports the very chunk files the
// page loads, so the browser serves them from its HTTP cache and the deploy carries one copy. What the worker
// computes is unchanged: the same modules, evaluated in the worker's own realm in ES order.
//
// Two adjustments make page chunks safe and unchanged in a worker:
//  - Vite wraps the page's dynamic imports in its preload helper, which appends <link rel=modulepreload> to
//    `document` and dispatches `vite:preloadError` on `window`. A worker has neither, so the helper is guarded:
//    without a document it imports directly; without a window it rethrows. Pages behave exactly as before.
//  - A worker that statically reaches only part of a page chunk splits it (rolldown groups modules by the
//    entries that load them), which would add a request to every page that loads the chunk. `privateCopies` gives
//    the worker its own instance of a small, stateless module instead (the Garage workshop's
//    profileBuilderAdapter.ts, a 298-byte pure function), so the page chunks keep their shape. Only list modules
//    without state or identity: the worker realm can hold both instances.
// Workers not listed keep Vite's separate bundle. The build fails when a listed worker is not constructed with
// that literal pattern, when a private copy is never imported by it, or when Vite's preload helper changes shape.
import { existsSync, realpathSync } from 'node:fs';
import { basename, dirname, extname, posix, relative, resolve } from 'node:path';
import type { Plugin } from 'vite';

export interface SharedWorkerOptions {
  /** Project-relative worker module → options. */
  workers: Record<string, { privateCopies?: readonly string[] }>;
}

const WORKER_URL_RE = /\bnew\s+Worker\s*\(\s*(new\s+URL\s*\(\s*(['"])(\.{1,2}\/[^'"`]+)\2\s*,\s*import\.meta\.url\s*\))/g;
const PLACEHOLDER = '__COT_SHARED_WORKER_';
const PLACEHOLDER_RE = /__COT_SHARED_WORKER_(\d+)__/g;
const PRIVATE_COPY_QUERY = '?cot-worker-copy';
export const PRELOAD_HELPER_ID = '\0vite/preload-helper.js';

/** The preload helper's two document/window touches, guarded for a worker realm; throws when either is missing. */
export function guardPreloadHelper(code: string): string {
  const preloadGuard = 'if (__VITE_IS_MODERN__ && deps && deps.length > 0) {';
  const dispatch = 'window.dispatchEvent(e);';
  if (code.split(preloadGuard).length !== 2 || code.split(dispatch).length !== 2) {
    throw new Error('cot-shared-worker-chunks: Vite\'s preload helper changed shape; re-check the worker guard in tools/viteSharedWorkers.ts');
  }
  return code
    .replace(preloadGuard, 'if (__VITE_IS_MODERN__ && deps && deps.length > 0 && typeof document !== "undefined") {')
    .replace(dispatch, 'if (typeof window === "undefined") throw err;\n\t\twindow.dispatchEvent(e);');
}

/** Rewrite the listed workers' `new Worker(new URL(...))` sites; `emit` returns the placeholder index of a module. */
export function rewriteWorkerSites(code: string, importer: string, isListed: (file: string) => boolean,
  emit: (file: string) => number): string | null {
  let changed = false;
  const out = code.replace(WORKER_URL_RE, (full: string, urlExpr: string, _quote: string, spec: string) => {
    const file = resolve(dirname(importer), spec);
    if (!isListed(file)) return full;
    changed = true;
    return full.replace(urlExpr, `new URL(/* @vite-ignore */ "${PLACEHOLDER}${emit(file)}__", import.meta.url)`);
  });
  return changed ? out : null;
}

export function sharedWorkerChunks({ workers }: SharedWorkerOptions): Plugin[] {
  let root = process.cwd();
  let workerFiles = new Map<string, Set<string>>();
  const refs: string[] = [];
  const refByFile = new Map<string, number>();
  const copiesUsed = new Set<string>();
  let helperGuarded = false;
  const clean = (id: string): string => id.split('?', 1)[0]!;
  return [{
    name: 'cot-shared-worker-chunks',
    apply: 'build',
    // Ahead of Vite's resolver (a private copy must win the resolution) and its worker URL rewrite.
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
      // Module ids are real paths (a temporary root may sit behind a symlink such as /var -> /private/var).
      const real = (file: string): string => {
        const path = resolve(root, file);
        if (!existsSync(path)) throw new Error(`cot-shared-worker-chunks: ${file} does not exist`);
        return realpathSync(path);
      };
      workerFiles = new Map(Object.entries(workers).map(([file, options]) => [real(file),
        new Set((options.privateCopies ?? []).map(real))]));
      root = realpathSync(root);
    },
    buildStart() {
      refs.length = 0;
      refByFile.clear();
      copiesUsed.clear();
      helperGuarded = false;
    },
    async resolveId(source, importer) {
      if (!importer || !source.startsWith('.')) return null;
      const copies = workerFiles.get(clean(importer));
      if (!copies?.size) return null;
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (!resolved || !copies.has(clean(resolved.id))) return null;
      copiesUsed.add(clean(resolved.id));
      return `${clean(resolved.id)}${PRIVATE_COPY_QUERY}`;
    },
    transform(code, id) {
      if (id === PRELOAD_HELPER_ID) {
        helperGuarded = true;
        return { code: guardPreloadHelper(code), map: null };
      }
      if (!code.includes('new Worker') || id.includes(PRIVATE_COPY_QUERY)) return null;
      const out = rewriteWorkerSites(code, clean(id), (file) => workerFiles.has(file), (file) => {
        let index = refByFile.get(file);
        if (index === undefined) {
          index = refs.length;
          refs.push(this.emitFile({ type: 'chunk', id: file, name: basename(file, extname(file)) }));
          refByFile.set(file, index);
        }
        return index;
      });
      return out === null ? null : { code: out, map: null };
    },
    renderChunk(code, chunk) {
      if (!code.includes(PLACEHOLDER)) return null;
      return {
        code: code.replace(PLACEHOLDER_RE, (_match: string, index: string) => {
          const ref = refs[Number(index)];
          if (ref === undefined) throw new Error(`cot-shared-worker-chunks: unknown worker placeholder ${index} in ${chunk.fileName}`);
          const path = posix.relative(posix.dirname(chunk.fileName), this.getFileName(ref));
          return path.startsWith('.') ? path : `./${path}`;
        }),
        map: null,
      };
    },
    generateBundle() {
      const names = (files: string[]): string => files.map((file) => relative(root, file)).join(', ');
      const missing = [...workerFiles.keys()].filter((file) => !refByFile.has(file));
      if (missing.length) {
        throw new Error(`cot-shared-worker-chunks: no \`new Worker(new URL('./…', import.meta.url))\` constructs ${names(missing)}; `
          + 'update vite.config.ts');
      }
      const unusedCopies = [...workerFiles.values()].flatMap((copies) => [...copies]).filter((copy) => !copiesUsed.has(copy));
      if (unusedCopies.length) throw new Error(`cot-shared-worker-chunks: private copies no listed worker imports: ${names(unusedCopies)}`);
      if (refs.length && !helperGuarded) throw new Error('cot-shared-worker-chunks: the preload helper was not guarded for workers');
    },
  }];
}
