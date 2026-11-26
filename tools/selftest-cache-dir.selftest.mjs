import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createSelftestCache, REPO_ROOT, sha1 } from './selftest-cache.mjs';
import { adoptLegacySelftestCache, durableSelftestCacheBase, moveTmpSelftestCache, readRootCommit, resolveSelftestCacheDir,
  selftestCacheLocations } from './selftest-cache-dir.mjs';

// Gate P18 (2026-10-01): the result cache is keyed on the repository's root commit, not on the
// origin remote URL, and the first run adopts the URL-keyed store so existing proofs keep counting.
// Fixtures: a throwaway repository, a clone, a shallow clone and a plain directory, with the
// per-user cache base redirected through TMPDIR so the shared store is never touched.
// Practice audit 2026-11-26: the store lives under ${XDG_CACHE_HOME:-~/.cache}/cot-selftests (here redirected through
// `env`), the first run moves the $TMPDIR store there and leaves a link, and a reboot that clears $TMPDIR loses nothing.

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

  const env = { XDG_CACHE_HOME: join(scratch, 'cache'), HOME: join(scratch, 'home') };
  const durable = join(scratch, 'cache', 'cot-selftests', 'v2');
  assert.equal(durableSelftestCacheBase(env), durable, 'the durable base: $XDG_CACHE_HOME/cot-selftests/v<format>');
  assert.equal(durableSelftestCacheBase({ HOME: join(scratch, 'home') }), join(scratch, 'home', '.cache', 'cot-selftests', 'v2'),
    'no XDG_CACHE_HOME: ~/.cache');
  const location = selftestCacheLocations(repo, env);
  const userBase = join(base, basename(dirname(location.tmpDir)));
  assert.match(basename(userBase), /^cot-selftests-v2-/, 'the $TMPDIR store older copies use keeps its per-user, per-format base');
  assert.equal(location.dir, join(durable, sha1(`root-commit:${rootCommit}`)), 'the store is durable, keyed on the root commit');
  assert.equal(location.tmpDir, join(userBase, sha1(`root-commit:${rootCommit}`)), 'older copies compute this $TMPDIR store');
  assert.equal(location.legacyDir, join(userBase, sha1('https://example.invalid/owner/old-name.git')),
    'the adopted directory is exactly the URL-keyed one older runners compute');

  git(repo, 'config', 'remote.origin.url', 'https://example.invalid/owner/New-Name.git');
  const renamed = selftestCacheLocations(repo, env);
  assert.equal(renamed.dir, location.dir, 'a renamed or moved remote keeps the cache identity');
  assert.notEqual(renamed.legacyDir, location.legacyDir);
  git(repo, 'config', 'remote.origin.url', 'https://example.invalid/owner/old-name.git');

  const clone = join(scratch, 'clone');
  git(scratch, 'clone', '-q', repo, clone);
  assert.equal(selftestCacheLocations(clone, env).dir, location.dir, 'a clean clone shares the identity');

  // Gate P18 (in $TMPDIR, before the move): the URL-keyed store holding existing proofs is adopted through a relative link
  const tmpDir = location.tmpDir;
  mkdirSync(location.legacyDir, { recursive: true });
  writeFileSync(join(location.legacyDir, 'existing-proof.json'), '{"proof":1}\n');
  assert.equal(adoptLegacySelftestCache(tmpDir, location.legacyDir), 'linked');
  assert.ok(lstatSync(tmpDir).isSymbolicLink());
  assert.equal(readlinkSync(tmpDir), basename(location.legacyDir), 'the alias is relative to the cache base');
  assert.equal(adoptLegacySelftestCache(tmpDir, location.legacyDir), 'present', 'the migration happens once');
  // a dangling alias (its store deleted) starts fresh; nothing to adopt creates nothing
  rmSync(location.legacyDir, { recursive: true, force: true });
  assert.equal(adoptLegacySelftestCache(tmpDir, location.legacyDir), 'fresh');
  assert.equal(existsSync(tmpDir) || (() => { try { return lstatSync(tmpDir).isSymbolicLink(); } catch { return false; } })(), false,
    'the dangling alias is removed');
  mkdirSync(tmpDir, { recursive: true });
  mkdirSync(location.legacyDir, { recursive: true });
  assert.equal(adoptLegacySelftestCache(tmpDir, location.legacyDir), 'present', 'an existing store is never replaced');
  assert.equal(lstatSync(tmpDir).isSymbolicLink(), false);
  assert.equal(adoptLegacySelftestCache(tmpDir, null), 'none');
  assert.equal(adoptLegacySelftestCache(tmpDir, tmpDir), 'none');
  rmSync(userBase, { recursive: true, force: true });

  // the move: a $TMPDIR store (here still the URL-keyed one an older runner made) moves to the durable dir
  mkdirSync(location.legacyDir, { recursive: true });
  writeFileSync(join(location.legacyDir, 'existing-proof.json'), '{"proof":1}\n');
  const first = resolveSelftestCacheDir(repo, env);
  assert.deepEqual([first.adoption, first.move, first.dir], ['linked', 'moved', location.dir]);
  assert.equal(lstatSync(location.dir).isSymbolicLink(), false, 'the durable store is a real directory');
  assert.equal(readFileSync(join(location.dir, 'existing-proof.json'), 'utf8'), '{"proof":1}\n', 'existing proofs moved with it');
  for (const old of [tmpDir, location.legacyDir]) {
    assert.ok(lstatSync(old).isSymbolicLink(), `${basename(old)}: the old name is a link`);
    assert.equal(realpathSync(old), realpathSync(location.dir), `${basename(old)}: older copies reach the durable store`);
  }
  assert.equal(resolveSelftestCacheDir(repo, env).move, 'present', 'the move happens once');
  // a receipt PASS recorded through the durable store is the one older runners read through $TMPDIR, and back
  writeFileSync(join(repo, 'check.selftest.mjs'), 'console.log(1);\n');
  writeFileSync(join(repo, 'package-lock.json'), '{}\n');
  const cache = createSelftestCache({ root: repo, cacheDir: location.dir, env: {}, argv: [], nodeVersion: 'v-test' });
  cache.recordPass('check.selftest.mjs', cache.lookup('check.selftest.mjs').key, { runMs: 12 });
  assert.equal(createSelftestCache({ root: repo, cacheDir: tmpDir, env: {}, argv: [], nodeVersion: 'v-test' })
    .lookup('check.selftest.mjs').skip, true, 'an older runner reading the $TMPDIR store sees the new PASS');

  // a reboot clears $TMPDIR: the proofs survive, and the next run puts the link back for older copies
  rmSync(userBase, { recursive: true, force: true });
  const rebooted = resolveSelftestCacheDir(repo, env);
  assert.deepEqual([rebooted.move, rebooted.dir], ['present', location.dir]);
  assert.equal(createSelftestCache({ root: repo, cacheDir: rebooted.dir, env: {}, argv: [], nodeVersion: 'v-test' })
    .lookup('check.selftest.mjs').skip, true, 'the PASS outlives the reboot');
  assert.equal(realpathSync(tmpDir), realpathSync(location.dir), 'the $TMPDIR link is back');
  // an older copy that ran first after the reboot made a real $TMPDIR store: its entries merge into the durable one
  // (a missing entry moves in; on a clash the newer file stays), and $TMPDIR leads to the durable store again
  rmSync(userBase, { recursive: true, force: true });
  mkdirSync(join(tmpDir, 'observed'), { recursive: true });
  writeFileSync(join(tmpDir, 'after-reboot-proof.json'), '{"proof":2}\n');
  writeFileSync(join(tmpDir, 'observed', 'seen.json'), '{}\n');
  writeFileSync(join(location.dir, 'edges.json'), '{"old":true}\n');
  writeFileSync(join(tmpDir, 'edges.json'), '{"new":true}\n');
  utimesSync(join(location.dir, 'edges.json'), new Date(1_000_000), new Date(1_000_000));
  writeFileSync(join(location.dir, 'runtimes.json'), '{"durable":true}\n');
  writeFileSync(join(tmpDir, 'runtimes.json'), '{"stale":true}\n');
  utimesSync(join(tmpDir, 'runtimes.json'), new Date(1_000_000), new Date(1_000_000));
  assert.equal(moveTmpSelftestCache(location.dir, tmpDir), 'merged');
  assert.equal(readFileSync(join(location.dir, 'after-reboot-proof.json'), 'utf8'), '{"proof":2}\n', 'a proof made meanwhile is kept');
  assert.ok(existsSync(join(location.dir, 'observed', 'seen.json')), 'directories merge');
  assert.deepEqual([readFileSync(join(location.dir, 'edges.json'), 'utf8'), readFileSync(join(location.dir, 'runtimes.json'), 'utf8')],
    ['{"new":true}\n', '{"durable":true}\n'], 'on a clash the newer file stays');
  assert.equal(readFileSync(join(location.dir, 'existing-proof.json'), 'utf8'), '{"proof":1}\n', 'the durable proofs stay');
  assert.equal(realpathSync(tmpDir), realpathSync(location.dir), '$TMPDIR leads to the durable store again');
  // a receipt that wrote to the durable dir before any runner moved the store (selftest-scans does) does not split it
  const early = { XDG_CACHE_HOME: join(scratch, 'cache-early') };
  rmSync(userBase, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  writeFileSync(join(tmpDir, 'old-proof.json'), '{"proof":3}\n');
  const earlyDir = selftestCacheLocations(repo, early).dir;
  mkdirSync(earlyDir, { recursive: true });
  writeFileSync(join(earlyDir, 'edges.json'), '{}\n');
  assert.deepEqual([resolveSelftestCacheDir(repo, early).move, existsSync(join(earlyDir, 'old-proof.json'))], ['merged', true]);
  rmSync(userBase, { recursive: true, force: true });

  // nothing to move: the durable dir is made and the $TMPDIR name links to it
  const fresh = { XDG_CACHE_HOME: join(scratch, 'cache-fresh') };
  const freshRun = resolveSelftestCacheDir(repo, fresh);
  assert.deepEqual([freshRun.adoption, freshRun.move], ['fresh', 'none']);
  assert.ok(existsSync(freshRun.dir) && realpathSync(tmpDir) === realpathSync(freshRun.dir));
  rmSync(userBase, { recursive: true, force: true });
  // an unusable durable base (a file in the way): the run falls back to the $TMPDIR store, as before the move
  writeFileSync(join(scratch, 'not-a-dir'), '');
  const blocked = resolveSelftestCacheDir(repo, { XDG_CACHE_HOME: join(scratch, 'not-a-dir') });
  assert.deepEqual([blocked.move, blocked.dir], ['failed', tmpDir]);
  rmSync(userBase, { recursive: true, force: true });

  // explicit directories, shallow clones and plain checkouts keep their names, under the durable base
  assert.deepEqual(selftestCacheLocations(repo, { COT_SELFTEST_CACHE_DIR: join(scratch, 'explicit') }),
    { dir: join(scratch, 'explicit'), legacyDir: null, tmpDir: null, identity: 'COT_SELFTEST_CACHE_DIR' });
  const shallow = join(scratch, 'shallow');
  git(scratch, 'clone', '-q', '--depth', '1', `file://${repo}`, shallow);
  assert.equal(readRootCommit(shallow), null, 'a shallow clone cannot name its root commit');
  const shallowLocation = selftestCacheLocations(shallow, env);
  assert.equal(shallowLocation.legacyDir, null);
  assert.equal(shallowLocation.dir, join(durable, sha1(`file://${repo}`)), 'a shallow clone keeps the URL-keyed name');
  const plain = join(scratch, 'plain');
  mkdirSync(plain);
  assert.equal(readRootCommit(plain), null);
  assert.equal(selftestCacheLocations(plain, env).dir, join(durable, sha1(plain)), 'no Git: the checkout path, as before');
  assert.equal(readRootCommit(repo, () => { throw new Error('git missing'); }), null);
  assert.equal(readRootCommit(repo, (args) => args[0] === 'rev-parse' ? 'false\n' : `${'b'.repeat(40)}\n${'a'.repeat(40)}\n`), 'a'.repeat(40),
    'several roots: the oldest (listed last) names the repository');

  // this repository: a full clone has a root commit and the identity follows it (pure; no link is made)
  const real = readRootCommit(REPO_ROOT);
  if (real) assert.equal(basename(selftestCacheLocations(REPO_ROOT, env).dir), sha1(`root-commit:${real}`));
} finally {
  if (previousTmp === undefined) delete process.env.TMPDIR; else process.env.TMPDIR = previousTmp;
  rmSync(scratch, { recursive: true, force: true });
}
console.log('selftest-cache-dir: root-commit identity, rename-stable, one-time adoption of the URL-keyed store, the move out of $TMPDIR (links for older copies, survives a reboot, merges a split store, falls back), shallow and plain fallbacks pass');
