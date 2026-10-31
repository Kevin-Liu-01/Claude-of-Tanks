// Reuse a PASS only for identical observed inputs. Syntax and file contents
// are the proof; comments, mtimes, checkout paths and suite order are not.
import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readSync, readdirSync, readFileSync, readlinkSync,
  realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSelftestInputs, SELFTEST_ROOT_DIRS } from './selftest-inputs.mjs';
import { scanPatternBase, scanPatternFromRoot, scanPatternRegExp, SELFTEST_SCANS } from './selftest-scans.mjs';

export const SELFTEST_CACHE_VERSION = 2;
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT_DIRS = new Set(SELFTEST_ROOT_DIRS);
const SOURCE_EXTENSIONS = new Set(['.ts', '.mts', '.mjs', '.js', '.cjs', '.json', '.tsx', '.jsx', '.html']);
const MODULE_EXTENSIONS = new Set(['.ts', '.mts', '.mjs', '.js', '.cjs', '.tsx', '.jsx']);
// target: a cargo build's output under crates/
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '.vercel', '.qa-dev', '.qa-map-environment', 'target']);
// assert-graph-guard.mjs, selftest-observe.mjs: every child preloads them (run-selftests.mjs selftestChildEnv) and no
// receipt imports them.
const GLOBAL_SALT_FILES = ['package-lock.json', 'tools/selftest-cache.mjs', 'tools/selftest-inputs.mjs', 'tools/assert-graph-guard.mjs',
  'tools/selftest-observe.mjs'];
const LEAF_FILE = /(?:^|\/)(?:package-lock\.json|\.package-lock\.json|[^/]+\.lock)$|\/node_modules\//;
// The fallback a module gets when its reads cannot be named (a listing, a child process, a computed import): every
// file under these is an input of its key. A match through one of them alone is not a named read; selection
// (run-selftests.mjs selftestPlan) reports it as broad.
export const SELFTEST_BROAD_DIRS = Object.freeze(['src', 'tools', 'server', 'public', 'docs', 'scripts', 'site', 'api', 'crates', 'cloudflare']);
const BROAD_DIRS = SELFTEST_BROAD_DIRS;
export const sha1 = text => createHash('sha1').update(text).digest('hex');
const parserHash = sha1(readFileSync(new URL('./selftest-inputs.mjs', import.meta.url)));
const isDir = path => { try { return statSync(path).isDirectory(); } catch { return false; } };
const isFile = path => { try { return statSync(path).isFile(); } catch { return false; } };
const inside = (root, path) => path === root || path.startsWith(root + sep);

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
  argv = process.argv, nodeVersion = process.version, alwaysRun = [], fixtureKeyed = [], declaredInputs = {},
  scans = SELFTEST_SCANS } = {}) {
  cacheDir ??= defaultSelftestCacheDir(root, env);
  const enabled = env.COT_SELFTEST_CACHE !== '0' && !argv.includes('--all');
  const freshFiles = new Set(alwaysRun);
  // Receipts whose closure holds tools they never run against this checkout (fixture repositories, plans, static
  // reads): a browser or git tool, a computed import or a whole-environment read there is data to them, so they are
  // keyed by their inputs like any other receipt (run-selftests.mjs SELFTEST_FIXTURE_KEYED_FILES names why).
  const keyedFixtures = new Set([...fixtureKeyed, ...Object.keys(declaredInputs)]);
  // A receipt that runs only on fixtures it writes: its inputs are the receipt and the files its declaration names
  // (repository paths, or `dir/*.ext` for one directory level), never the closure the import scan would give
  // (broad directory walks over the fixture, tool names held as data). run-selftests.selftest holds every
  // declaration to the declared files' own relative imports.
  const declaredClosure = (receipt) => {
    const files = new Set([resolve(root, receipt)]);
    for (const pattern of declaredInputs[receipt]) {
      const star = pattern.indexOf('*');
      if (star < 0) { files.add(resolve(root, pattern)); continue; }
      const dir = dirname(pattern), suffix = pattern.slice(star + 1);
      let names = [];
      try { names = readdirSync(resolve(root, dir)); } catch { /* an absent directory declares nothing */ }
      for (const name of names) if (name.endsWith(suffix) && isFile(resolve(root, dir, name))) files.add(resolve(root, dir, name));
    }
    return files;
  };
  const fileHashes = new Map(), dirFingerprints = new Map(), edges = new Map(), closures = new Map();
  const runSets = new Map(), scanSets = new Map(), patternMembers = new Map(), executedSets = new Map();
  const executableEdges = new Map();
  const metadata = new Map();
  const unresolvedImports = new Set();
  const edgeStorePath = join(cacheDir, 'edges.json');
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
  const walks = new Map();
  const membersUnder = dir => {
    if (!walks.has(dir)) { const members = []; walk(dir, members); walks.set(dir, members); }
    return walks.get(dir);
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
  const specifierPath = (from, specifier) => {
    if (specifier.startsWith('./') || specifier.startsWith('../')) return resolve(dirname(from), specifier);
    if (specifier.startsWith('/')) {
      return ROOT_DIRS.has(specifier.split('/')[1]) ? resolve(root, specifier.slice(1)) : null;
    }
    return ROOT_DIRS.has(specifier.split('/')[0]) || (!specifier.includes('/') && extname(specifier))
      ? resolve(root, specifier) : null;
  };
  const resolveSpecifier = (from, value, required = false) => {
    if (!value || value.startsWith('node:') || value.startsWith('http') || value.includes('\n')) return null;
    // Node/Vite query suffixes make a fresh module instance, not another file.
    const path = specifierPath(from, value.split(/[?#]/, 1)[0]);
    if (!path || !inside(root, path) || path === root) return null;
    if (isFile(path) || isDir(path)) return path;
    if (!extname(path)) for (const candidate of [`${path}.ts`, `${path}.mjs`, `${path}.js`, join(path, 'index.ts'), join(path, 'index.mjs')]) {
      if (isFile(candidate)) return candidate;
    }
    // Remember a missing named file too: adding it must invalidate a PASS.
    return required || extname(path) ? path : null;
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
  const addBroadDirectories = found => {
    for (const name of BROAD_DIRS) if (isDir(join(root, name))) found.add(join(root, name));
  };
  const addJoinedInputs = (file, joined, found) => {
    for (const segments of joined) for (const base of [dirname(file), root]) {
      const target = resolve(base, ...segments);
      if (inside(root, target) && target !== root && target !== file && (isFile(target) || isDir(target))) found.add(target);
    }
  };
  const addDynamicInput = (file, { prefix, suffix, execute }, found, modules) => {
    if (/[?#]/.test(prefix)) {
      const target = resolveSpecifier(file, prefix, true);
      if (target) { found.add(target); if (execute) modules.add(target); }
      return;
    }
    const slash = prefix.lastIndexOf('/');
    const dir = slash >= 0 ? resolveSpecifier(file, prefix.slice(0, slash + 1)) : null;
    if (!dir || !isDir(dir)) {
      if (execute) unresolvedImports.add(file);
      addBroadDirectories(found);
      return;
    }
    const tail = suffix.split(/[?#]/, 1)[0], start = prefix.slice(slash + 1);
    const matches = member => relative(dir, member).startsWith(start) && member.endsWith(tail);
    // A data path with a computed part reads what its pattern matches, not its whole directory (266: the Vite i18n
    // plugin's `src/ui/i18nCatalog.${locale}.json` made all of src/ui an input of every capture tool, so a note in
    // src/ui/components selected the world receipts). A member that appears or goes changes the closure, so the key.
    // A pattern that matches the whole directory, or computes its first segment under a top-level one (`src/${path}`:
    // the broad fallback, never a named read), keeps the directory.
    const whole = !start && (!tail || BROAD_DIRS.includes(relative(root, dir)));
    if (!execute && !whole) {
      for (const member of membersUnder(dir)) if (matches(member) || (isDir(member) && matches(member + sep))) found.add(member);
      return;
    }
    found.add(dir);
    if (!execute) return;
    // Follow each possible module's imports as well as directory membership.
    // Hashing just the directory missed helpers imported from outside it.
    for (const member of membersUnder(dir)) if (isFile(member) && MODULE_EXTENSIONS.has(extname(member)) && matches(member)) {
      found.add(member); modules.add(member);
    }
  };
  const dependenciesOf = file => {
    if (edges.has(file)) return edges.get(file);
    const found = new Set(), modules = new Set(); edges.set(file, found); executableEdges.set(file, modules);
    if (!SOURCE_EXTENSIONS.has(extname(file)) || LEAF_FILE.test(file) || !isFile(file)) return found;
    const info = inspect(file);
    for (const specifier of info.imports) {
      const target = resolveSpecifier(file, specifier, true);
      if (target && target !== file) { found.add(target); modules.add(target); }
    }
    for (const specifier of info.specifiers) {
      const target = resolveSpecifier(file, specifier);
      if (target && target !== file && !(isDir(target) && target.includes(`${sep}node_modules`))) found.add(target);
    }
    if (info.broad) addBroadDirectories(found);
    addJoinedInputs(file, info.joined, found);
    for (const dynamic of info.dynamic) addDynamicInput(file, dynamic, found, modules);
    return found;
  };
  const closureOf = file => {
    if (closures.has(file)) return closures.get(file);
    const declared = relative(root, file);
    if (Object.hasOwn(declaredInputs, declared)) {
      const files = declaredClosure(declared);
      // inspected for the environment they read, so the key never depends on which receipts were looked up first
      for (const member of files) if (SOURCE_EXTENSIONS.has(extname(member)) && isFile(member)) inspect(member);
      executedSets.set(file, files); closures.set(file, files); return files;
    }
    const seen = new Set(), expanded = new Set(), executed = new Set(), stack = [[file, true]];
    while (stack.length) {
      const [current, execute] = stack.pop(); seen.add(current);
      if (isDir(current) || expanded.has(current) || (!execute && extname(current) !== '.json')) continue;
      expanded.add(current);
      if (execute) executed.add(current);
      for (const dependency of dependenciesOf(current)) stack.push([dependency, executableEdges.get(current)?.has(dependency)]);
    }
    // Every file a listing module it runs lists is a named input (data, never followed): the key changes when one
    // appears, changes or goes, and a reader of closures (selection) sees the read directly.
    for (const pattern of scanOf(file).lists) for (const member of membersOf(pattern)) seen.add(member);
    executedSets.set(file, executed);
    closures.set(file, seen); return seen;
  };
  // The files whose flags (browser, Git, computed imports) and environment reads count for a receipt: the modules its
  // import graph executes, never a file it only names or lists. Another receipt's walk may have parsed a named file, so
  // counting it made liveness and keys depend on lookup order (2026-10-20: tools/contig-hidden-gaps.selftest.mjs went
  // live after any receipt that imports tools/source-x-oracle.mjs, which a research receipt JSON only names). A tool a
  // receipt spawns keeps the fallback key and does not make it live (wreckBakePlanDrift, ~500 s, would run every time
  // for its tool's git revision stamp).
  const executedOf = file => { closureOf(file); return executedSets.get(file); };
  // The modules a receipt runs: its import graph, and the repository modules a child-process user names (a tool it
  // may spawn) with theirs. Listing declarations are inherited along it; the cache key's flags are not.
  const modules = new Map();
  const isModule = file => {
    if (!modules.has(file)) modules.set(file, MODULE_EXTENSIONS.has(extname(file)) && !LEAF_FILE.test(file) && isFile(file));
    return modules.get(file);
  };
  const runEdges = new Map();
  const runEdgesOf = file => {
    if (runEdges.has(file)) return runEdges.get(file);
    const dependencies = dependenciesOf(file), spawns = metadata.get(file)?.spawns;
    const found = [...dependencies].filter(dependency => (spawns || executableEdges.get(file).has(dependency)) && isModule(dependency));
    runEdges.set(file, found); return found;
  };
  const runSetOf = file => {
    if (runSets.has(file)) return runSets.get(file);
    const run = new Set(), stack = [file];
    while (stack.length) {
      const current = stack.pop();
      if (run.has(current) || !isModule(current)) continue;
      run.add(current);
      stack.push(...runEdgesOf(current));
    }
    runSets.set(file, run); return run;
  };
  // What a receipt's run set lists (tools/selftest-scans.mjs): `lists` patterns key the receipt and select it;
  // `tracked` patterns (git's index) select it and require a live run. A declared-inputs receipt runs on fixtures
  // only (its declaration is its whole input set), so it inherits nothing.
  const scanOf = file => {
    if (scanSets.has(file)) return scanSets.get(file);
    const result = { modules: [], lists: [], tracked: [] };
    if (!Object.hasOwn(declaredInputs, relative(root, file))) {
      const lists = new Set(), tracked = new Set();
      for (const module of runSetOf(file)) {
        const declaration = scans[relative(root, module)];
        if (!declaration) continue;
        result.modules.push(relative(root, module));
        declaration.lists?.forEach(pattern => lists.add(pattern));
        declaration.tracked?.forEach(pattern => tracked.add(pattern));
      }
      result.modules.sort(); result.lists = [...lists].sort(); result.tracked = [...tracked].sort();
    }
    scanSets.set(file, result); return result;
  };
  // The checkout's files a pattern matches, walked from its literal base no deeper than the pattern reaches.
  const membersOf = pattern => {
    if (patternMembers.has(pattern)) return patternMembers.get(pattern);
    const test = scanPatternRegExp(pattern), base = scanPatternBase(pattern), found = [], seen = new Set();
    // never a walk of the whole checkout (shots/, public/models): selftest-scans.selftest fails on such a pattern
    if (scanPatternFromRoot(pattern)) { patternMembers.set(pattern, found); return found; }
    const depth = pattern.slice(base.length).includes('**') ? Infinity : pattern.slice(base ? base.length + 1 : 0).split('/').length;
    const visit = (dir, level) => {
      let canonical, entries;
      try { canonical = realpathSync(dir); entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      if (seen.has(canonical)) return;
      seen.add(canonical);
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory() || (entry.isSymbolicLink() && isDir(full))) { if (level < depth) visit(full, level + 1); }
        else if (test.test(relative(root, full).split(sep).join('/'))) found.push(full);
      }
    };
    visit(join(root, base), 1);
    found.sort(); patternMembers.set(pattern, found); return found;
  };
  // A repository path (relative, existing or not) that a receipt's listings cover: a deleted file selects it too.
  const scanMatch = (receipt, path) => {
    const { lists, tracked } = scanOf(resolve(root, receipt));
    const rel = relative(root, resolve(root, path)).split(sep).join('/');
    return [...lists, ...tracked].some(pattern => scanPatternRegExp(pattern).test(rel));
  };
  const inputKey = receipt => {
    const closure = closureOf(resolve(root, receipt));
    const rows = [...closure].map(file => `${isDir(file) ? 'dir' : 'file'}:${relative(root, file)}:${isDir(file) ? fingerprintDir(file) : hashFile(file)}`).sort();
    const hash = createHash('sha256');
    hash.update(`v${SELFTEST_CACHE_VERSION}\0node:${nodeVersion}\0platform:${process.platform}/${process.arch}\0options:${env.NODE_OPTIONS ?? ''}\0`);
    const environment = new Set([...executedOf(resolve(root, receipt))].flatMap(file => metadata.get(file)?.environment ?? []));
    for (const name of [...environment].sort()) hash.update(`env:${name}:${env[name] ?? '<unset>'}\n`);
    for (const salt of GLOBAL_SALT_FILES) hash.update(`salt:${salt}:${hashFile(join(root, salt))}\n`);
    rows.forEach(row => hash.update(row + '\n'));
    return { key: hash.digest('hex'), inputs: rows.length };
  };
  const atomicJson = (path, value) => {
    mkdirSync(dirname(path), { recursive: true });
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(value) + '\n'); renameSync(temporary, path);
  };
  const entryPath = (file, key) => join(cacheDir, `${sha1(file)}-${key}.json`);
  // What a run observed (tools/selftest-observe.mjs, 266): the checkout paths its processes read, listed and probed.
  // A path the closure covers (the path, or a directory holding it) is keyed already; the rest is kept beside the PASS
  // as it stood after the run, and a PASS is reused only while all of it still holds. This only adds conditions.
  const covered = (closure, absolute) => {
    for (let path = absolute; path.startsWith(root + sep); path = dirname(path)) if (closure.has(path)) return true;
    return false;
  };
  const listingOf = dir => { try { return sha1(readdirSync(dir).sort().join('\n')); } catch { return 'missing'; } };
  const kindOf = path => (isDir(path) ? 'dir' : isFile(path) ? 'file' : 'missing');
  const OBSERVED = { reads: hashFile, lists: listingOf, probes: kindOf };
  const observedState = (receipt, observed) => {
    const closure = closureOf(resolve(root, receipt)), state = {};
    for (const [kind, read] of Object.entries(OBSERVED)) {
      const rows = {};
      for (const path of observed[kind] ?? []) {
        const absolute = resolve(root, path);
        if (path.split('/').some(segment => SKIP_DIRS.has(segment)) || covered(closure, absolute)) continue;
        if (kind === 'reads') fileHashes.delete(absolute); // as the run left it, not as this process first hashed it
        rows[path] = read(absolute);
      }
      if (Object.keys(rows).length) state[kind] = rows;
    }
    return state;
  };
  const observedChange = state => {
    for (const [kind, rows] of Object.entries(state ?? {})) {
      for (const [path, value] of Object.entries(rows)) if (OBSERVED[kind]?.(resolve(root, path)) !== value) return path;
    }
    return null;
  };
  // Each receipt's latest PASS observation, keyed or live, for lane mode (tools/test-diff.mjs laneReadOf).
  const observedPath = receipt => join(cacheDir, 'observed', `${sha1(receipt)}.json`);
  const observations = new Map();
  const observedOf = receipt => {
    if (!observations.has(receipt)) {
      let record = null;
      try { record = JSON.parse(readFileSync(observedPath(receipt), 'utf8')); } catch {}
      observations.set(receipt, record?.file === receipt ? { reads: new Set(record.reads), lists: new Set(record.lists) } : null);
    }
    return observations.get(receipt);
  };
  // Why a receipt is never keyed (it runs every time), or null when its inputs key it.
  const liveReason = receipt => {
    if (freshFiles.has(receipt)) return 'fresh environment/timing check';
    if (keyedFixtures.has(receipt)) { closureOf(resolve(root, receipt)); return null; }
    const runs = executedOf(resolve(root, receipt));
    if ([...runs].some(file => metadata.get(file)?.browser || metadata.get(file)?.git)) {
      return 'browser or Git state must be checked live';
    }
    if ([...runs].some(file => metadata.get(file)?.opaqueImport || metadata.get(file)?.opaqueEnvironment || unresolvedImports.has(file))) {
      return 'computed import/environment needs a fresh run';
    }
    return null;
  };
  const lookup = receipt => {
    if (!enabled) return { skip: false, reason: 'cache disabled' };
    const live = liveReason(receipt);
    if (live) return { skip: false, reason: live };
    const { key, inputs } = inputKey(receipt);
    let record;
    try { record = JSON.parse(readFileSync(entryPath(receipt, key), 'utf8')); } catch {}
    if (record?.version === SELFTEST_CACHE_VERSION && record.key === key && record.file === receipt) {
      const changed = observedChange(record.observed);
      if (changed) return { skip: false, key, inputs, reason: `an input its last PASS read changed (${changed})` };
      return { skip: true, key, inputs, passedAt: record.passedAt, reason: 'identical inputs passed' };
    }
    return { skip: false, key, inputs, reason: 'no PASS for these inputs' };
  };
  const recordPass = (receipt, key, { runMs, observed } = {}) => {
    if (enabled && key) atomicJson(entryPath(receipt, key), { file: receipt, key,
      passedAt: new Date().toISOString(), version: SELFTEST_CACHE_VERSION,
      ...(Number.isFinite(runMs) ? { runMs } : {}), ...(observed ? { observed: observedState(receipt, observed) } : {}) });
  };
  const recordObserved = (receipt, { reads = [], lists = [] }) => {
    atomicJson(observedPath(receipt), { file: receipt, at: new Date().toISOString(), reads, lists });
    observations.delete(receipt);
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
  return { enabled, cacheDir, lookup, liveReason, recordPass, recordObserved, observedOf, inputKey, closureOf, dependenciesOf,
    runSetOf, runEdgesOf, scanOf, scanMatch, membersOf, metadataOf: file => metadata.get(file), persist };
}
