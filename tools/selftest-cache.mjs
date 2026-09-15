// Receipt result cache (fast checks, 2026-09-15). A receipt is a pure function of the
// files it can observe; when every one of those files is byte-identical to the last run
// that PASSED, running it again proves nothing. The runner therefore skips it and says so.
//
// What a receipt can observe is derived statically, and deliberately over-approximated:
//   - its ESM import graph (static imports, re-exports, side-effect imports and dynamic
//     `import('…')` with a literal specifier), followed recursively through the repo;
//   - files it names: `new URL('…', import.meta.url)`, relative `'./x'` / `'../x'` literals
//     and repo-rooted literals (`'src/…'`, `'tools/…'`, `'docs/…'`, `'public/…'`, `'server/…'`,
//     …), including the ones listed inside JSON it depends on (ledgers, preservation
//     contracts) — a path that resolves to a DIRECTORY pulls in every file below it;
//   - a dynamic `import(`…${…}`)` with a static directory prefix pulls in that directory;
//   - global salts: node's version, package-lock.json, the runner, the suite registry and
//     this module. `node_modules/<pkg>/…` literals are hashed as files when they exist.
// Anything the analysis cannot see (network, clock, GPU driver) is not an input a receipt
// may depend on for a pass/fail verdict; a receipt that does is flaky, not cacheable, and
// belongs in the exclusive list of the runner. `COT_SELFTEST_CACHE=0` or `--all` runs
// everything; the cache lives under node_modules/.cache (per worktree, never committed).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SELFTEST_CACHE_VERSION = 1;
const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '..');
const ROOT_DIRS = new Set(['src', 'tools', 'docs', 'public', 'server', 'scripts', 'shots', 'tests', 'node_modules']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.mjs', '.js', '.cjs', '.json', '.tsx', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', '.qa-dev', '.qa-map-environment']);
const GLOBAL_SALT_FILES = ['package-lock.json', 'tools/run-selftests.mjs', 'tools/selftest-cpu-pool.mjs',
  'tools/selftest-suites.mjs', 'tools/selftest-cache.mjs'];

const SPECIFIER_PATTERNS = [
  /\bfrom\s*['"]([^'"\n]+)['"]/g,                    // import … from '…'; export … from '…'
  /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,         // import('…')
  /\bimport\s+['"]([^'"\n]+)['"]/g,                   // import '…'
  /new URL\(\s*['"]([^'"\n]+)['"]\s*,\s*import\.meta\.url/g,
];
const PATH_LITERAL = /['"`]((?:\.{1,2}\/|\/?(?:src|tools|docs|public|server|scripts|shots|tests|node_modules)\/)[^'"`\s${}()?#]*)['"`]/g;
// dev-server URLs inside template strings: `http://127.0.0.1:${port}/tools/page.html`
const URL_PATH = /\/(?:src|tools|public|docs)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+/g;
// repo-root files named directly: 'index.html', 'docs.html', 'package.json', 'vercel.json'
const ROOT_FILE_LITERAL = /['"`]([A-Za-z0-9_.-]+\.(?:html|json|css|md|txt|webp|png|svg|xml|ts|mjs|js))['"`]/g;
const TEMPLATE_IMPORT = /\bimport\s*\(\s*`([^`$]*)\$\{/g;
// join(here, '..', 'main.ts') / resolve(ROOT, 'docs.html'): the literal segments form a path
const JOINED_PATH = /\b(?:join|resolve)\(([^()]*)\)/g;
const QUOTED = /['"`]([^'"`\n]+)['"`]/g;
// lockfiles and anything under node_modules are leaves: hashed when named, never parsed for paths
const LEAF_FILE = /(?:^|\/)(?:package-lock\.json|\.package-lock\.json|[^/]+\.lock)$|\/node_modules\//;
// A receipt that lists directories, spawns children (tsc, git, a nested node) or drives the
// real app in a browser observes more than its import graph shows; it re-runs whenever any
// source, tool, asset or document changes.
const BROAD_OBSERVER = /child_process|execFileSync|execSync|spawnSync|readdirSync|readdir\(|ls-files|glob\(|globSync|puppeteer|createServer\(/;
const BROAD_DIRS = ['src', 'tools', 'server', 'public', 'docs', 'scripts'];

export function sha1(text) {
  return createHash('sha1').update(text).digest('hex');
}

export function createSelftestCache({
  root = REPO_ROOT,
  cacheDir = join(root, 'node_modules', '.cache', 'cot-selftests'),
  env = process.env,
  argv = process.argv,
  nodeVersion = process.version,
} = {}) {
  const enabled = env.COT_SELFTEST_CACHE !== '0' && !argv.includes('--all');
  const fileHashes = new Map();   // absolute path -> sha1 of bytes (or null when unreadable)
  const dirFingerprints = new Map(); // absolute dir -> sha1 over (relpath, size, mtime)
  const edges = new Map();        // absolute file -> resolved absolute dependencies (files or dirs)
  const closures = new Map();     // absolute file -> Set of absolute files/dirs
  // Edge extraction is the expensive part (several regex passes over every source file); the
  // resolved edges are remembered on disk by content hash, so an unchanged file costs one hash.
  const edgeStorePath = join(cacheDir, 'edges.json');
  let edgeStore = {};
  try { edgeStore = JSON.parse(readFileSync(edgeStorePath, 'utf8')); } catch { edgeStore = {}; }
  if (edgeStore.version !== SELFTEST_CACHE_VERSION) edgeStore = { version: SELFTEST_CACHE_VERSION, byHash: {} };
  let edgeStoreDirty = false;

  const hashFile = (file) => {
    if (fileHashes.has(file)) return fileHashes.get(file);
    let digest = null;
    try { digest = createHash('sha1').update(readFileSync(file)).digest('hex'); } catch { digest = null; }
    fileHashes.set(file, digest);
    return digest;
  };

  const isDir = (path) => { try { return statSync(path).isDirectory(); } catch { return false; } };
  const isNodeModulesDir = (path) => isDir(path) && (path.includes(`${sep}node_modules${sep}`) || path.endsWith(`${sep}node_modules`));
  const isFile = (path) => { try { return statSync(path).isFile(); } catch { return false; } };

  const walk = (dir, out) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (entry.isFile()) out.push(full);
    }
  };

  // Directories are fingerprinted by listing, size and mtime (a full byte hash of public/
  // would cost more than many receipts); a spurious invalidation only costs a re-run.
  const fingerprintDir = (dir) => {
    if (dirFingerprints.has(dir)) return dirFingerprints.get(dir);
    const files = [];
    walk(dir, files);
    files.sort();
    const hash = createHash('sha1');
    for (const file of files) {
      let stat;
      try { stat = statSync(file); } catch { continue; }
      hash.update(`${relative(root, file)}\0${stat.size}\0${Math.round(stat.mtimeMs)}\n`);
    }
    const digest = hash.digest('hex');
    dirFingerprints.set(dir, digest);
    return digest;
  };

  const resolveSpecifier = (fromFile, specifier) => {
    if (!specifier || specifier.startsWith('node:') || specifier.startsWith('http')) return null;
    let base;
    if (specifier.startsWith('./') || specifier.startsWith('../')) base = resolve(dirname(fromFile), specifier);
    else if (specifier.startsWith('/')) {
      // '/tools/page.html' is a dev-server URL rooted at the repo; other absolute paths are machine paths
      const head = specifier.split('/')[1];
      if (!ROOT_DIRS.has(head)) return null;
      base = resolve(root, specifier.slice(1));
    } else {
      const head = specifier.split('/')[0];
      if (!ROOT_DIRS.has(head)) {
        // a repo-root file named directly ('index.html', 'package.json')
        if (!specifier.includes('/') && isFile(resolve(root, specifier))) return resolve(root, specifier);
        return null;                                 // bare package specifier ('three', 'puppeteer')
      }
      base = resolve(root, specifier);
    }
    if (!base.startsWith(root + sep) && base !== root) return null;
    if (isFile(base)) return base;
    if (isDir(base)) return base;
    if (!extname(base)) {
      for (const candidate of [`${base}.ts`, `${base}.mjs`, `${base}.js`, join(base, 'index.ts'), join(base, 'index.mjs')]) {
        if (isFile(candidate)) return candidate;
      }
    }
    return null;
  };

  const dependenciesOf = (file) => {
    if (edges.has(file)) return edges.get(file);
    const found = new Set();
    edges.set(file, found);
    if (!SOURCE_EXTENSIONS.has(extname(file)) && !file.endsWith('.html')) return found;
    if (LEAF_FILE.test(file)) return found;
    const digest = hashFile(file);
    const remembered = digest && edgeStore.byHash[`${relative(root, file)}:${digest}`];
    if (remembered) {
      for (const rel of remembered) found.add(resolve(root, rel));
      return found;
    }
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { return found; }
    const specifiers = new Set();
    for (const pattern of SPECIFIER_PATTERNS) {
      pattern.lastIndex = 0;
      for (const match of text.matchAll(pattern)) specifiers.add(match[1]);
    }
    PATH_LITERAL.lastIndex = 0;
    for (const match of text.matchAll(PATH_LITERAL)) specifiers.add(match[1]);
    URL_PATH.lastIndex = 0;
    for (const match of text.matchAll(URL_PATH)) specifiers.add(match[0]);
    ROOT_FILE_LITERAL.lastIndex = 0;
    for (const match of text.matchAll(ROOT_FILE_LITERAL)) specifiers.add(match[1]);
    if (BROAD_OBSERVER.test(text)) for (const dir of BROAD_DIRS) if (isDir(resolve(root, dir))) found.add(resolve(root, dir));
    TEMPLATE_IMPORT.lastIndex = 0;
    for (const match of text.matchAll(TEMPLATE_IMPORT)) {
      const prefix = match[1];
      const slash = prefix.lastIndexOf('/');
      if (slash > 0) specifiers.add(prefix.slice(0, slash + 1));
    }
    for (const specifier of specifiers) {
      const target = resolveSpecifier(file, specifier);
      if (target && target !== file && !isNodeModulesDir(target)) found.add(target);
    }
    JOINED_PATH.lastIndex = 0;
    for (const call of text.matchAll(JOINED_PATH)) {
      const segments = [...call[1].matchAll(QUOTED)].map((m) => m[1]).filter((s) => !s.includes('${'));
      if (!segments.length) continue;
      for (const base of [dirname(file), root]) {
        const candidate = resolve(base, ...segments);
        if (!candidate.startsWith(root + sep) || candidate === file) continue;
        if (isFile(candidate) || (isDir(candidate) && !isNodeModulesDir(candidate))) found.add(candidate);
      }
    }
    if (digest) {
      edgeStore.byHash[`${relative(root, file)}:${digest}`] = [...found].map((p) => relative(root, p)).sort();
      edgeStoreDirty = true;
    }
    return found;
  };

  /** Write the remembered edges (call once per runner process; a no-op when nothing was learned). */
  const persist = () => {
    if (!edgeStoreDirty) return;
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(edgeStorePath, JSON.stringify(edgeStore));
    edgeStoreDirty = false;
  };

  const closureOf = (file) => {
    if (closures.has(file)) return closures.get(file);
    const seen = new Set();
    const stack = [file];
    while (stack.length) {
      const current = stack.pop();
      if (seen.has(current)) continue;
      seen.add(current);
      if (isDir(current)) continue; // a directory contributes its fingerprint, not its imports
      for (const dependency of dependenciesOf(current)) if (!seen.has(dependency)) stack.push(dependency);
    }
    closures.set(file, seen);
    return seen;
  };

  const inputKey = (receipt) => {
    const file = resolve(root, receipt);
    const closure = closureOf(file);
    const rows = [];
    for (const entry of closure) {
      const rel = relative(root, entry);
      rows.push(isDir(entry) ? `dir:${rel}:${fingerprintDir(entry)}` : `file:${rel}:${hashFile(entry) ?? 'missing'}`);
    }
    rows.sort();
    const hash = createHash('sha1');
    hash.update(`v${SELFTEST_CACHE_VERSION}\0node:${nodeVersion}\0`);
    for (const salt of GLOBAL_SALT_FILES) hash.update(`salt:${salt}:${hashFile(resolve(root, salt)) ?? 'missing'}\n`);
    for (const row of rows) hash.update(row + '\n');
    return { key: hash.digest('hex'), inputs: rows.length };
  };

  const entryPath = (receipt) => join(cacheDir, `${sha1(receipt)}.json`);

  const lookup = (receipt) => {
    if (!enabled) return { skip: false, reason: 'disabled' };
    const { key, inputs } = inputKey(receipt);
    let record = null;
    try { record = JSON.parse(readFileSync(entryPath(receipt), 'utf8')); } catch { record = null; }
    if (record && record.key === key && record.file === receipt) {
      return { skip: true, key, inputs, passedAt: record.passedAt };
    }
    return { skip: false, key, inputs };
  };

  const recordPass = (receipt, key) => {
    if (!enabled || !key) return;
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(entryPath(receipt), JSON.stringify({ file: receipt, key, passedAt: new Date().toISOString(),
      version: SELFTEST_CACHE_VERSION }) + '\n');
  };

  return { enabled, cacheDir, lookup, recordPass, inputKey, closureOf, dependenciesOf, persist };
}
