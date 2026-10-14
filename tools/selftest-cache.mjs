// Reuse a PASS only for identical observed inputs. Syntax and file contents
// are the proof; comments, mtimes, checkout paths and suite order are not.
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readSync, readdirSync, readFileSync, readlinkSync,
  realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSelftestInputs } from './selftest-inputs.mjs';

export const SELFTEST_CACHE_VERSION = 2;
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.mjs', '.js', '.cjs', '.json', '.tsx', '.jsx', '.html']);
const MODULE_EXTENSIONS = new Set(['.ts', '.mts', '.mjs', '.js', '.cjs', '.tsx', '.jsx']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', '.qa-dev', '.qa-map-environment']);
const GLOBAL_SALT_FILES = ['package-lock.json', 'tools/selftest-cache.mjs', 'tools/selftest-inputs.mjs'];
const LEAF_FILE = /(?:^|\/)(?:package-lock\.json|\.package-lock\.json|[^/]+\.lock)$|\/node_modules\//;
export const sha1 = text => createHash('sha1').update(text).digest('hex');
const parserHash = sha1(readFileSync(new URL('./selftest-inputs.mjs', import.meta.url)));
const isDir = path => { try { return statSync(path).isDirectory(); } catch { return false; } };
const isFile = path => { try { return statSync(path).isFile(); } catch { return false; } };
const inside = (root, path) => path === root || path.startsWith(root + sep);
// The root .gitignore's patterns that can name a top-level entry (`shots/`, `.qa-*/`, `.env.*`, `!.env.example`).
const rootIgnoreRules = root => {
  let text = '';
  try { text = readFileSync(join(root, '.gitignore'), 'utf8'); } catch {}
  const rules = [];
  for (let line of text.split(/\r?\n/)) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const negate = line.startsWith('!'); if (negate) line = line.slice(1);
    const directory = line.endsWith('/'); line = line.replace(/\/+$/, '').replace(/^\//, '').replace(/^\*\*\//, '');
    if (!line || line.includes('/')) continue;
    const pattern = new RegExp(`^${line.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
    rules.push({ negate, directory, pattern });
  }
  return (name, directory) => rules.reduce((ignored, rule) =>
    rule.pattern.test(name) && (directory || !rule.directory) ? !rule.negate : ignored, false);
};

export function defaultSelftestCacheDir(root, env = process.env) {
  if (env.COT_SELFTEST_CACHE_DIR) return resolve(env.COT_SELFTEST_CACHE_DIR);
  let identity = root;
  try {
    let gitDir = join(root, '.git');
    if (!isDir(gitDir)) gitDir = resolve(root, readFileSync(gitDir, 'utf8').match(/^gitdir: (.+)/m)[1]);
    try { gitDir = resolve(gitDir, readFileSync(join(gitDir, 'commondir'), 'utf8').trim()); } catch {}
    const config = readFileSync(join(gitDir, 'config'), 'utf8');
    identity = /\[remote "origin"\][^[]*?\burl\s*=\s*([^\r\n]+)/.exec(config)?.[1].trim() ?? gitDir;
  } catch {}
  // Content-addressed proofs are portable to a clean release clone of the
  // same repository. Different machines still establish their own receipts.
  return join(tmpdir(), `cot-selftests-v${SELFTEST_CACHE_VERSION}-${process.getuid?.() ?? 'user'}`, sha1(identity));
}

export function createSelftestCache({ root = REPO_ROOT, cacheDir, env = process.env,
  argv = process.argv, nodeVersion = process.version, alwaysRun = [] } = {}) {
  cacheDir ??= defaultSelftestCacheDir(root, env);
  const enabled = env.COT_SELFTEST_CACHE !== '0' && !argv.includes('--all');
  const freshFiles = new Set(alwaysRun);
  const fileHashes = new Map(), dirFingerprints = new Map(), edges = new Map(), closures = new Map();
  const executableEdges = new Map();
  const metadata = new Map();
  const unresolvedImports = new Set();
  const edgeStorePath = join(cacheDir, 'edges.json');
  // Every top-level directory a literal can name (`site/home.html`, `/api/x.ts`), and what "the whole repository" is
  // for a receipt that lists directories or spawns tools: each top-level entry Git does not ignore, files included.
  const rootDirs = new Set(), broadInputs = [];
  {
    const ignored = rootIgnoreRules(root);
    let entries = [];
    try { entries = readdirSync(root, { withFileTypes: true }); } catch {}
    for (const entry of entries) {
      const full = join(root, entry.name);
      if (entry.name === '.git') continue;
      const directory = entry.isDirectory() || (entry.isSymbolicLink() && isDir(full));
      if (directory) rootDirs.add(entry.name);
      // A cache directory inside the checkout is the runner's own output, not an input.
      if (!SKIP_DIRS.has(entry.name) && !ignored(entry.name, directory) && !inside(full, cacheDir)) broadInputs.push(full);
    }
    broadInputs.sort();
  }
  let edgeStore;
  try { edgeStore = JSON.parse(readFileSync(edgeStorePath, 'utf8')); } catch {}
  if (edgeStore?.version !== SELFTEST_CACHE_VERSION || edgeStore?.parserHash !== parserHash) {
    edgeStore = { version: SELFTEST_CACHE_VERSION, parserHash, byHash: {} };
  }
  let edgeStoreDirty = false;
  const buffer = Buffer.allocUnsafe(256 * 1024);
  const hashFile = file => {
    if (fileHashes.has(file)) return fileHashes.get(file);
    let fd, digest = 'missing';
    try {
      fd = openSync(file, 'r');
      const hash = createHash('sha256');
      for (;;) { const count = readSync(fd, buffer, 0, buffer.length, null); if (!count) break; hash.update(buffer.subarray(0, count)); }
      digest = hash.digest('hex');
    } catch (error) { if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error; }
    finally { if (fd !== undefined) closeSync(fd); }
    fileHashes.set(file, digest);
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
      out.push(full); // include empty directories and symlink identities
      if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(full))) walk(full, out, seen);
    }
  };
  const fingerprintDir = dir => {
    if (dirFingerprints.has(dir)) return dirFingerprints.get(dir);
    const files = []; walk(dir, files); files.sort();
    const hash = createHash('sha256');
    for (const file of files) {
      let link = '';
      try { link = readlinkSync(file); } catch {}
      hash.update(`${relative(root, file)}\0${link}\0${isDir(file) ? 'directory' : hashFile(file)}\n`);
    }
    const digest = hash.digest('hex'); dirFingerprints.set(dir, digest); return digest;
  };
  // Where a specifier can point. `./` and `../` are relative to the naming module; `/<dir>/…` is a checkout path when
  // <dir> is a top-level directory. Any other path (`site/home.html`, `authorityFleet.ts`, `maps/x.ts`) is read against
  // whatever base the module joins it to: the checkout root (cwd, `join(ROOT, …)`) or, for a non-import, the module's
  // own directory (`new URL(name, import.meta.url)`, `join(here, name)`). Both are watched. The own-directory candidate is
  // watched while missing only when its directory exists, so `docs/x.md` named in src/ui/ invents no src/ui/docs/x.md.
  const specifierPaths = (from, specifier, module) => {
    if (specifier.startsWith('./') || specifier.startsWith('../')) return [[resolve(dirname(from), specifier), true]];
    if (specifier.startsWith('/')) return rootDirs.has(specifier.split('/')[1]) ? [[resolve(root, specifier.slice(1)), true]] : [];
    const paths = [];
    if (rootDirs.has(specifier.split('/')[0]) || (!specifier.includes('/') && extname(specifier))) paths.push([resolve(root, specifier), true]);
    if (!module && dirname(from) !== root) {
      const local = resolve(dirname(from), specifier);
      paths.push([local, isDir(dirname(local))]);
    }
    return paths;
  };
  const resolveSpecifiers = (from, value, { required = false, module = false } = {}) => {
    if (!value || value.startsWith('node:') || value.startsWith('http') || value.includes('\n')) return [];
    // Node/Vite query suffixes make a fresh module instance, not another file.
    const clean = value.split(/[?#]/, 1)[0];
    // A glob (`src/**/*.ts` in tsconfig's include, a `*.json` listing) walks the directory before its first wildcard.
    const wildcard = clean.search(/[*{]/);
    if (wildcard >= 0) {
      const slash = clean.lastIndexOf('/', wildcard);
      return slash < 0 ? [] : resolveSpecifiers(from, clean.slice(0, slash + 1), { module }).filter(isDir);
    }
    const found = [];
    for (const [path, watchMissing] of specifierPaths(from, clean, module)) {
      if (!inside(root, path) || path === root) continue;
      if (isFile(path) || isDir(path)) { found.push(path); continue; }
      // Only module resolution completes an extension; a read or a URL (`/api/telemetry`) names its exact path.
      const completed = !module || extname(path) ? null
        : [`${path}.ts`, `${path}.mjs`, `${path}.js`, join(path, 'index.ts'), join(path, 'index.mjs')].find(isFile);
      if (completed) found.push(completed);
      // Remember a missing named file too: adding it must invalidate a PASS.
      else if (watchMissing && (required || extname(path))) found.push(path);
    }
    return found;
  };
  const inspect = file => {
    if (metadata.has(file)) return metadata.get(file);
    const digest = hashFile(file), id = `${relative(root, file)}:${digest}`;
    let value = edgeStore.byHash[id];
    if (!value) {
      value = collectSelftestInputs(readFileSync(file, 'utf8'), file);
      edgeStore.byHash[id] = value; edgeStoreDirty = true;
    }
    metadata.set(file, value); return value;
  };
  const addBroadDirectories = found => { for (const path of broadInputs) found.add(path); };
  const addJoinedInputs = (file, joined, found) => {
    for (const segments of joined) for (const base of [dirname(file), root]) {
      const target = resolve(base, ...segments);
      if (inside(root, target) && target !== root && target !== file && (isFile(target) || isDir(target))) found.add(target);
    }
  };
  // A path a template names outright: relative, or under a top-level directory. Its directory must exist or the template
  // could name anything, so the receipt watches the tree. `image/${type}` names no checkout path and adds nothing.
  const namesCheckoutPath = prefix => /^\.{1,2}\//.test(prefix) || rootDirs.has(prefix.replace(/^\//, '').split('/')[0]);
  const addDynamicInput = (file, { prefix, suffix, execute, based }, found, modules) => {
    if (/[?#]/.test(prefix)) {
      for (const target of resolveSpecifiers(file, prefix, { required: !based, module: execute })) {
        found.add(target); if (execute) modules.add(target);
      }
      return;
    }
    const slash = prefix.lastIndexOf('/');
    const dirs = slash >= 0 ? resolveSpecifiers(file, prefix.slice(0, slash + 1), { module: execute }).filter(isDir) : [];
    if (!dirs.length) {
      if (execute) unresolvedImports.add(file);
      if (execute || (!based && namesCheckoutPath(prefix))) addBroadDirectories(found);
      return;
    }
    for (const dir of dirs) found.add(dir);
    if (!execute) return;
    const tail = suffix.split(/[?#]/, 1)[0], start = prefix.slice(slash + 1);
    for (const dir of dirs) {
      const members = []; walk(dir, members);
      // Follow each possible module's imports as well as directory membership.
      // Hashing just the directory missed helpers imported from outside it.
      for (const member of members) if (isFile(member) && MODULE_EXTENSIONS.has(extname(member))
        && relative(dir, member).startsWith(start) && member.endsWith(tail)) { found.add(member); modules.add(member); }
    }
  };
  const dependenciesOf = file => {
    if (edges.has(file)) return edges.get(file);
    const found = new Set(), modules = new Set(); edges.set(file, found); executableEdges.set(file, modules);
    if (!SOURCE_EXTENSIONS.has(extname(file)) || LEAF_FILE.test(file) || !isFile(file)) return found;
    const info = inspect(file);
    for (const specifier of info.imports) {
      for (const target of resolveSpecifiers(file, specifier, { required: true, module: true })) {
        if (target !== file) { found.add(target); modules.add(target); }
      }
    }
    for (const specifier of info.specifiers) {
      for (const target of resolveSpecifiers(file, specifier)) {
        if (target !== file && !(isDir(target) && target.includes(`${sep}node_modules`))) found.add(target);
      }
    }
    // A declared computed read (a `@selftest-reads: <path>` comment) resolves like a literal.
    for (const declared of info.reads ?? []) for (const target of resolveSpecifiers(file, declared)) found.add(target);
    if (info.broad) addBroadDirectories(found);
    addJoinedInputs(file, info.joined, found);
    for (const dynamic of info.dynamic) addDynamicInput(file, dynamic, found, modules);
    return found;
  };
  const closureOf = file => {
    if (closures.has(file)) return closures.get(file);
    const seen = new Set(), expanded = new Set(), stack = [[file, true]];
    while (stack.length) {
      const [current, execute] = stack.pop(); seen.add(current);
      if (isDir(current) || expanded.has(current) || (!execute && extname(current) !== '.json')) continue;
      expanded.add(current);
      for (const dependency of dependenciesOf(current)) stack.push([dependency, executableEdges.get(current)?.has(dependency)]);
    }
    closures.set(file, seen); return seen;
  };
  const inputKey = receipt => {
    const closure = closureOf(resolve(root, receipt));
    const rows = [...closure].map(file => `${isDir(file) ? 'dir' : 'file'}:${relative(root, file)}:${isDir(file) ? fingerprintDir(file) : hashFile(file)}`).sort();
    const hash = createHash('sha256');
    hash.update(`v${SELFTEST_CACHE_VERSION}\0node:${nodeVersion}\0platform:${process.platform}/${process.arch}\0options:${env.NODE_OPTIONS ?? ''}\0`);
    const environment = new Set([...closure].flatMap(file => metadata.get(file)?.environment ?? []));
    for (const name of [...environment].sort()) hash.update(`env:${name}:${env[name] ?? '<unset>'}\n`);
    for (const salt of GLOBAL_SALT_FILES) hash.update(`salt:${salt}:${hashFile(join(root, salt))}\n`);
    rows.forEach(row => hash.update(row + '\n'));
    return { key: hash.digest('hex'), inputs: rows.length };
  };
  const atomicJson = (path, value) => {
    mkdirSync(cacheDir, { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(value) + '\n'); renameSync(temporary, path);
  };
  const entryPath = (file, key) => join(cacheDir, `${sha1(file)}-${key}.json`);
  const lookup = receipt => {
    if (!enabled) return { skip: false, reason: 'cache disabled' };
    if (freshFiles.has(receipt)) return { skip: false, reason: 'fresh environment/timing check' };
    const closure = closureOf(resolve(root, receipt));
    if ([...closure].some(file => metadata.get(file)?.browser || metadata.get(file)?.git)) {
      return { skip: false, reason: 'browser or Git state must be checked live' };
    }
    if ([...closure].some(file => metadata.get(file)?.opaqueImport || metadata.get(file)?.opaqueEnvironment || unresolvedImports.has(file))) {
      return { skip: false, reason: 'computed import/environment needs a fresh run' };
    }
    const { key, inputs } = inputKey(receipt);
    let record;
    try { record = JSON.parse(readFileSync(entryPath(receipt, key), 'utf8')); } catch {}
    if (record?.version === SELFTEST_CACHE_VERSION && record.key === key && record.file === receipt) {
      return { skip: true, key, inputs, passedAt: record.passedAt, reason: 'identical inputs passed' };
    }
    return { skip: false, key, inputs, reason: 'no PASS for these inputs' };
  };
  const recordPass = (receipt, key, { runMs } = {}) => {
    if (enabled && key) atomicJson(entryPath(receipt, key), { file: receipt, key,
      passedAt: new Date().toISOString(), version: SELFTEST_CACHE_VERSION,
      ...(Number.isFinite(runMs) ? { runMs } : {}) });
  };
  const persist = () => {
    if (!edgeStoreDirty) return;
    // Concurrent runners may add metadata. Losing a racing edge only costs a
    // parse; proof records are separate, immutable keys and never overwrite.
    let previous;
    try { previous = JSON.parse(readFileSync(edgeStorePath, 'utf8')); } catch {}
    if (previous?.version === SELFTEST_CACHE_VERSION && previous?.parserHash === parserHash) {
      edgeStore.byHash = { ...previous.byHash, ...edgeStore.byHash };
    }
    atomicJson(edgeStorePath, edgeStore); edgeStoreDirty = false;
  };
  return { enabled, cacheDir, lookup, recordPass, inputKey, closureOf, dependenciesOf, persist };
}
