// Static input graph for the changed-only resolver (tools/changed-ids.mjs).
// First-party tooling: Kevin B. Liu.
//
// Each file's inputs come from the selftest cache's own parser (tools/selftest-inputs.mjs), so a receipt key and a
// changed-only key read the same syntax. This module adds what the resolver needs on top: typed edges (an executed
// import versus a file merely named), closures that stop at chosen files, and two parser corrections that only ever
// narrow a false input, never a real one:
//   - a `join`/`resolve` call whose literal segments carry no letter or digit (`.join('')`, `.join('/')`) names no file;
//     the selftest parser reads `parts.join('')` in materials.ts as "the directory src/vehicles";
//   - a declared import helper (`imp('src/x.ts')` in spare-track-placement-check.mjs) is followed as an executed import of
//     its literal argument; a call with any other argument fails the step closed.
// Everything the parser flags as computed (opaque import, whole environment, unresolved template import) or broad
// (child processes, directory reads, servers, browsers) is reported, and the resolver fails that step closed unless
// the step table (steps.mjs) declares the file's dynamic reads and pins its dynamic call sites.
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, renameSync,
  statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript-compiler-api';
import { collectSelftestInputs } from '../selftest-inputs.mjs';

export const GRAPH_VERSION = 1;
const ROOT_DIRS = new Set(['src', 'tools', 'docs', 'public', 'server', 'scripts', 'shots', 'tests', 'cloudflare', 'node_modules']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.mjs', '.js', '.cjs', '.json', '.tsx', '.jsx', '.html']);
const MODULE_EXTENSIONS = new Set(['.ts', '.mts', '.mjs', '.js', '.cjs', '.tsx', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', '.qa-dev', '.qa-map-environment']);
const LEAF_FILE = /(?:^|\/)(?:package-lock\.json|\.package-lock\.json|[^/]+\.lock)$|\/node_modules\//;
const DYNAMIC_CALLS = new Set(['execFileSync', 'execSync', 'spawnSync', 'spawn', 'execFile', 'fork',
  'readdirSync', 'readdir', 'glob', 'globSync', 'createServer', 'opendirSync', 'opendir']);
// `exec` counts only as a bare (imported) child_process function: `re.exec(text)` is a regular expression.
const BARE_DYNAMIC_CALLS = new Set(['exec']);

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');
export const h16 = (text) => sha256(text).slice(0, 16);
// Cached parses are valid only for this parser and this module's own readers (dynamicSites, helperImports, workers).
const parserHash = sha256(readFileSync(new URL('../selftest-inputs.mjs', import.meta.url))
  + readFileSync(new URL(import.meta.url)) + `graph:${GRAPH_VERSION}`);
const isDir = (path) => { try { return statSync(path).isDirectory(); } catch { return false; } };
const isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } };
const inside = (root, path) => path === root || path.startsWith(root + sep);
const hasWord = (text) => /[A-Za-z0-9]/.test(text);

export function defaultGraphCacheDir(env = process.env) {
  return env.COT_CHANGED_ONLY_CACHE_DIR
    ? resolve(env.COT_CHANGED_ONLY_CACHE_DIR)
    : join(tmpdir(), `cot-changed-only-v${GRAPH_VERSION}-${process.getuid?.() ?? 'user'}`);
}

/** Source text of every call that makes a file broad or computed, normalised: the pin a dynamic-read declaration binds. */
export function dynamicSites(text, filename) {
  if (!/\.(?:[cm]?[jt]sx?)$/.test(filename)) return [];
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true,
    filename.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const sites = [];
  const norm = (node) => node.getText(source).replace(/\s+/g, ' ');
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
      if (callee.kind === ts.SyntaxKind.ImportKeyword) {
        if (!ts.isStringLiteralLike(node.arguments[0] ?? {})) sites.push(norm(node));
      } else if (DYNAMIC_CALLS.has(name) || (ts.isIdentifier(callee) && BARE_DYNAMIC_CALLS.has(name))) sites.push(norm(node));
    }
    if (ts.isSpreadAssignment(node) || ts.isSpreadElement(node)) {
      const text = norm(node.expression);
      if (text === 'process.env') sites.push(norm(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return sites;
}

/** The sorted, trimmed source lines that name `exportName`: what a per-id accessor declaration is pinned to. */
export function accessorPin(text, exportName) {
  return h16(text.split('\n').map((line) => line.trim()).filter((line) => line.includes(exportName)).sort().join('\n'));
}

/** Literal first arguments of calls to `helper` (an import helper), plus any call whose argument is not a literal. */
export function helperImports(text, filename, helper) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const literals = [], computed = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === helper) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) literals.push(arg.text);
      else computed.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { literals, computed };
}

export function createGraph({ root, cacheDir = defaultGraphCacheDir(), importHelpers = {} } = {}) {
  root = resolve(root);
  const hashes = new Map(), infos = new Map(), edgeMap = new Map(), dirPrints = new Map();
  const storePath = join(cacheDir, 'edges.json');
  let store;
  try { store = JSON.parse(readFileSync(storePath, 'utf8')); } catch {}
  if (store?.parserHash !== parserHash) store = { parserHash, byHash: {} };
  let dirty = false;
  const buffer = Buffer.allocUnsafe(256 * 1024);

  const hashFile = (file) => {
    if (hashes.has(file)) return hashes.get(file);
    let fd, digest = 'missing';
    try {
      fd = openSync(file, 'r');
      const hash = createHash('sha256');
      for (;;) { const n = readSync(fd, buffer, 0, buffer.length, null); if (!n) break; hash.update(buffer.subarray(0, n)); }
      digest = hash.digest('hex');
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code)) throw error;
    } finally { if (fd !== undefined) closeSync(fd); }
    hashes.set(file, digest);
    return digest;
  };
  const walk = (dir, out, seen = new Set()) => {
    let canonical, entries;
    try { canonical = realpathSync(dir); entries = readdirSync(dir, { withFileTypes: true }); }
    catch (error) { if (['ENOENT', 'ENOTDIR'].includes(error.code)) return; throw error; }
    if (seen.has(canonical)) return;
    seen.add(canonical);
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      out.push(full);
      if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(full))) walk(full, out, seen);
    }
  };
  /** Directory fingerprint (names, link targets, file bytes), leaving out `exclude` paths (a step's own outputs). */
  const fingerprintDir = (dir, exclude = null) => {
    const key = exclude ? null : dir;
    if (key && dirPrints.has(key)) return dirPrints.get(key);
    const files = []; walk(dir, files); files.sort();
    const hash = createHash('sha256');
    for (const file of files) {
      if (exclude?.has(file)) continue;
      let link = '';
      try { link = readlinkSync(file); } catch {}
      hash.update(`${relative(root, file)}\0${link}\0${isDir(file) ? 'directory' : hashFile(file)}\n`);
    }
    const digest = hash.digest('hex');
    if (key) dirPrints.set(key, digest);
    return digest;
  };
  const specifierPath = (from, specifier) => {
    if (specifier.startsWith('./') || specifier.startsWith('../')) return resolve(dirname(from), specifier);
    if (specifier.startsWith('/')) return ROOT_DIRS.has(specifier.split('/')[1]) ? resolve(root, specifier.slice(1)) : null;
    return ROOT_DIRS.has(specifier.split('/')[0]) || (!specifier.includes('/') && extname(specifier))
      ? resolve(root, specifier) : null;
  };
  const resolveSpecifier = (from, value, required = false) => {
    if (!value || value.startsWith('node:') || value.startsWith('http') || value.includes('\n')) return null;
    const path = specifierPath(from, value.split(/[?#]/, 1)[0]);
    if (!path || !inside(root, path) || path === root) return null;
    if (isFile(path) || isDir(path)) return path;
    if (!extname(path)) for (const candidate of [`${path}.ts`, `${path}.mjs`, `${path}.js`, join(path, 'index.ts'), join(path, 'index.mjs')]) {
      if (isFile(candidate)) return candidate;
    }
    return required || extname(path) ? path : null;
  };
  const info = (file) => {
    if (infos.has(file)) return infos.get(file);
    const helperName = importHelpers[relative(root, file)] ?? '';
    const id = `${relative(root, file)}:${hashFile(file)}:${helperName}`;
    let value = store.byHash[id];
    if (!value) {
      const text = readFileSync(file, 'utf8');
      value = { ...collectSelftestInputs(text, file), sites: dynamicSites(text, file),
        // Can this module read a file or a URL by itself (fs, a child process, fetch, XHR, a dynamic import())?
        // Module URLs handed to a Worker (or fetched): `new URL('./x.ts', import.meta.url)`. Browser steps run them.
        urls: [...text.matchAll(/new\s+URL\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g)].map((match) => match[1]),
        fileAccess: /\bfrom\s*['"](?:node:)?(?:fs|fs\/promises|child_process)['"]|\brequire\(\s*['"](?:node:)?fs|\bfetch\s*\(|XMLHttpRequest|\bprocess\.binding\b/.test(text) };
      if (helperName) value.helper = helperImports(text, file, helperName);
      store.byHash[id] = value; dirty = true;
    }
    infos.set(file, value);
    return value;
  };
  /** { exec, mention, flags } for one file: exec = executed imports; mention = named files and directories. */
  const edges = (file) => {
    if (edgeMap.has(file)) return edgeMap.get(file);
    const exec = new Set(), mention = new Set(), urls = new Set();
    const flags = { broad: false, opaqueImport: false, opaqueEnvironment: false, unresolved: false, git: false,
      browser: false, fileAccess: false, environment: [], sites: [], helperComputed: [] };
    const result = { exec, mention, urls, flags };
    edgeMap.set(file, result);
    if (!SOURCE_EXTENSIONS.has(extname(file)) || LEAF_FILE.test(file) || !isFile(file)) return result;
    const meta = info(file);
    for (const specifier of meta.imports) {
      const target = resolveSpecifier(file, specifier, true);
      if (target && target !== file) exec.add(target);
    }
    for (const specifier of meta.specifiers) {
      if (meta.imports.includes(specifier)) continue;
      const target = resolveSpecifier(file, specifier);
      if (target && target !== file && !(isDir(target) && target.includes(`${sep}node_modules`))) mention.add(target);
    }
    for (const segments of meta.joined) {
      if (!segments.some(hasWord)) continue; // `.join('')` names no file (see header)
      for (const base of [dirname(file), root]) {
        const target = resolve(base, ...segments);
        if (inside(root, target) && target !== root && target !== file && (isFile(target) || isDir(target))) mention.add(target);
      }
    }
    for (const { prefix, suffix, execute } of meta.dynamic) {
      if (/[?#]/.test(prefix)) {
        const target = resolveSpecifier(file, prefix, true);
        if (target) (execute ? exec : mention).add(target);
        continue;
      }
      const slash = prefix.lastIndexOf('/');
      const dir = slash >= 0 ? resolveSpecifier(file, prefix.slice(0, slash + 1)) : null;
      if (!dir || !isDir(dir)) { if (execute) flags.unresolved = true; else flags.broad = true; continue; }
      mention.add(dir);
      if (!execute) continue;
      const members = []; walk(dir, members);
      const tail = suffix.split(/[?#]/, 1)[0], start = prefix.slice(slash + 1);
      for (const member of members) if (isFile(member) && MODULE_EXTENSIONS.has(extname(member))
        && relative(dir, member).startsWith(start) && member.endsWith(tail)) exec.add(member);
    }
    for (const url of meta.urls ?? []) {
      const target = resolveSpecifier(file, url, true);
      if (target && target !== file) urls.add(target);
    }
    if (meta.helper) {
      // The helper resolves its argument against the repository root (spare-track-placement-check.mjs `imp`).
      for (const literal of meta.helper.literals) {
        const target = resolve(root, literal);
        if (!inside(root, target) || target.includes(`${sep}node_modules${sep}`)) continue;
        exec.add(isFile(target) ? target : (resolveSpecifier(join(root, 'x'), literal, true) ?? target));
      }
      flags.helperComputed = meta.helper.computed;
    }
    Object.assign(flags, { broad: flags.broad || meta.broad, opaqueImport: meta.opaqueImport,
      opaqueEnvironment: meta.opaqueEnvironment, git: meta.git, browser: meta.browser, fileAccess: !!meta.fileAccess,
      environment: meta.environment, sites: meta.sites ?? [] });
    return result;
  };
  /**
   * Closure from `roots`: executed imports and JSON files are expanded; a named non-JSON file or a directory is an input
   * but is not expanded. A node in `stop` is recorded and not expanded. `skip(from, to)` drops one edge entirely.
   * `browser` also runs module URLs handed to workers (a page runs them; a Node tool does not).
   */
  const closure = (roots, { stop = new Set(), skip = null, browser = false } = {}) => {
    const seen = new Set(), stopped = new Set(), expanded = new Set();
    const stack = roots.map((file) => [resolve(root, file), true]);
    while (stack.length) {
      const [current, execute] = stack.pop();
      seen.add(current);
      if (stop.has(current)) { stopped.add(current); continue; }
      if (isDir(current) || expanded.has(current) || (!execute && extname(current) !== '.json')) continue;
      expanded.add(current);
      const { exec, mention, urls } = edges(current);
      for (const target of exec) if (!skip?.(current, target)) stack.push([target, true]);
      if (browser) for (const target of urls) if (!skip?.(current, target)) stack.push([target, true]);
      for (const target of mention) if (!skip?.(current, target)) stack.push([target, false]);
    }
    return { files: seen, stopped, expanded };
  };
  /** Sorted `kind:path:hash` rows for a set of nodes (directories by fingerprint). */
  const rowsOf = (nodes, { exclude = null } = {}) => [...nodes]
    .filter((node) => !exclude?.has(node))
    .map((node) => isDir(node)
      ? `dir:${relative(root, node)}:${fingerprintDir(node, exclude)}`
      : `file:${relative(root, node)}:${hashFile(node)}`)
    .sort();
  const persist = () => {
    if (!dirty) return;
    let previous;
    try { previous = JSON.parse(readFileSync(storePath, 'utf8')); } catch {}
    if (previous?.parserHash === parserHash) store.byHash = { ...previous.byHash, ...store.byHash };
    mkdirSync(cacheDir, { recursive: true });
    const temporary = `${storePath}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(store));
    renameSync(temporary, storePath);
    dirty = false;
  };
  return { root, hashFile, fingerprintDir, edges, closure, rowsOf, persist, isDir, isFile,
    rel: (path) => relative(root, path), abs: (path) => resolve(root, path) };
}
