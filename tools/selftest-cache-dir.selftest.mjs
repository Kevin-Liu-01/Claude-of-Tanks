import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createSelftestCache, REPO_ROOT, sha1 } from './selftest-cache.mjs';
import { adoptLegacySelftestCache, readRootCommit, resolveSelftestCacheDir, selftestCacheLocations } from './selftest-cache-dir.mjs';

// Gate P18 (2026-10-01): the result cache is keyed on the repository's root commit, not on the
// origin remote URL, and the first run adopts the URL-keyed store so existing proofs keep counting.
// Fixtures: a throwaway repository, a clone, a shallow clone and a plain directory, with the
// per-user cache base redirected through TMPDIR so the shared store is never touched.

const scratch = mkdtempSync(join(tmpdir(), 'cot-cache-dir-'));
const previousTmp = process.env.TMPDIR;
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid',
  '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
try {
  const base = join(scratch, 'tmp');
  mkdirSync(base);
  process.env.TMPDIR = base; // os.tmpdir() reads it on every call
  const repo = join(scratch, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  git(repo, 'config', 'remote.origin.url', 'https://example.invalid/owner/old-name.git');
  writeFileSync(join(repo, 'a.txt'), 'one\n');
  git(repo, 'add', 'a.txt');
  git(repo, 'commit', '-q', '-m', 'root');
  const rootCommit = git(repo, 'rev-parse', 'HEAD');
  writeFileSync(join(repo, 'a.txt'), 'two\n');
  git(repo, 'commit', '-q', '-am', 'second');
  assert.equal(readRootCommit(repo), rootCommit, 'the oldest root commit of HEAD');

  const location = selftestCacheLocations(repo, {});
  const userBase = join(base, basename(dirname(location.dir)));
  assert.match(basename(userBase), /^cot-selftests-v2-/, 'the per-user, per-format base is unchanged');
  assert.equal(location.dir, join(userBase, sha1(`root-commit:${rootCommit}`)));
  assert.equal(location.legacyDir, join(userBase, sha1('https://example.invalid/owner/old-name.git')),
    'the adopted directory is exactly the URL-keyed one older runners compute');

  git(repo, 'config', 'remote.origin.url', 'https://example.invalid/owner/New-Name.git');
  const renamed = selftestCacheLocations(repo, {});
  assert.equal(renamed.dir, location.dir, 'a renamed or moved remote keeps the cache identity');
  assert.notEqual(renamed.legacyDir, location.legacyDir);
  git(repo, 'config', 'remote.origin.url', 'https://example.invalid/owner/old-name.git');

  const clone = join(scratch, 'clone');
  git(scratch, 'clone', '-q', repo, clone);
  assert.equal(selftestCacheLocations(clone, {}).dir, location.dir, 'a clean clone shares the identity');

  // first run: the URL-keyed store holding existing proofs is adopted through a relative link
  mkdirSync(location.legacyDir, { recursive: true });
  writeFileSync(join(location.legacyDir, 'existing-proof.json'), '{"proof":1}\n');
  assert.equal(resolveSelftestCacheDir(repo, {}).adoption, 'linked');
  assert.ok(lstatSync(location.dir).isSymbolicLink());
  assert.equal(readlinkSync(location.dir), basename(location.legacyDir), 'the alias is relative to the cache base');
  assert.equal(readFileSync(join(location.dir, 'existing-proof.json'), 'utf8'), '{"proof":1}\n',
    'existing proofs keep counting under the new identity');
  assert.equal(resolveSelftestCacheDir(repo, {}).adoption, 'present', 'the migration happens once');
  // a receipt PASS recorded through the new identity lands in the one shared store
  writeFileSync(join(repo, 'check.selftest.mjs'), 'console.log(1);\n');
  writeFileSync(join(repo, 'package-lock.json'), '{}\n');
  const cache = createSelftestCache({ root: repo, cacheDir: location.dir, env: {}, argv: [], nodeVersion: 'v-test' });
  const miss = cache.lookup('check.selftest.mjs');
  cache.recordPass('check.selftest.mjs', miss.key, { runMs: 12 });
  assert.equal(createSelftestCache({ root: repo, cacheDir: location.legacyDir, env: {}, argv: [], nodeVersion: 'v-test' })
    .lookup('check.selftest.mjs').skip, true, 'older runners reading the URL-keyed store see the new PASS');

  // a dangling alias (its store deleted) starts fresh; nothing to adopt creates nothing
  rmSync(location.legacyDir, { recursive: true, force: true });
  assert.equal(adoptLegacySelftestCache(location.dir, location.legacyDir), 'fresh');
  assert.equal(existsSync(location.dir) || (() => { try { return lstatSync(location.dir).isSymbolicLink(); } catch { return false; } })(), false,
    'the dangling alias is removed');
  mkdirSync(location.dir, { recursive: true });
  mkdirSync(location.legacyDir, { recursive: true });
  assert.equal(adoptLegacySelftestCache(location.dir, location.legacyDir), 'present', 'an existing store is never replaced');
  assert.equal(lstatSync(location.dir).isSymbolicLink(), false);
  assert.equal(adoptLegacySelftestCache(location.dir, null), 'none');
  assert.equal(adoptLegacySelftestCache(location.dir, location.dir), 'none');

  // explicit directories, shallow clones and plain checkouts keep their existing behaviour
  assert.deepEqual(selftestCacheLocations(repo, { COT_SELFTEST_CACHE_DIR: join(scratch, 'explicit') }),
    { dir: join(scratch, 'explicit'), legacyDir: null, identity: 'COT_SELFTEST_CACHE_DIR' });
  const shallow = join(scratch, 'shallow');
  git(scratch, 'clone', '-q', '--depth', '1', `file://${repo}`, shallow);
  assert.equal(readRootCommit(shallow), null, 'a shallow clone cannot name its root commit');
  const shallowLocation = selftestCacheLocations(shallow, {});
  assert.equal(shallowLocation.legacyDir, null);
  assert.equal(shallowLocation.dir, join(userBase, sha1(`file://${repo}`)), 'a shallow clone keeps the URL-keyed directory');
  const plain = join(scratch, 'plain');
  mkdirSync(plain);
  assert.equal(readRootCommit(plain), null);
  assert.equal(selftestCacheLocations(plain, {}).dir, join(userBase, sha1(plain)), 'no Git: the checkout path, as before');
  assert.equal(readRootCommit(repo, () => { throw new Error('git missing'); }), null);
  assert.equal(readRootCommit(repo, (args) => args[0] === 'rev-parse' ? 'false\n' : `${'b'.repeat(40)}\n${'a'.repeat(40)}\n`), 'a'.repeat(40),
    'several roots: the oldest (listed last) names the repository');

  // this repository: a full clone has a root commit and the identity follows it (pure; no link is made)
  const real = readRootCommit(REPO_ROOT);
  if (real) assert.equal(basename(selftestCacheLocations(REPO_ROOT, {}).dir), sha1(`root-commit:${real}`));
} finally {
  if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmp;
  rmSync(scratch, { recursive: true, force: true });
}
console.log('selftest-cache-dir: root-commit identity, rename-stable, one-time adoption of the URL-keyed store, shallow and plain fallbacks pass');
