import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ASSET_CARRY_DEFAULTS, cacheControlIsLong, carryForwardReleaseAssets, chunkPaths, createRunner, defaultAssetCacheDir,
  deployMetadata, displayCommand, githubSlug, parseReleaseArgs, parseVersionStamp, previousProductionDeployment, recordReleaseAssets,
  RELEASE_DEFAULTS, RELEASE_MANIFEST, stampNames, stripRedactedPublicEnv, verify, VERCEL_CLI_MAJOR, workerDeployArgs } from './release.mjs';
import { REPO_ROOT } from './selftest-cache.mjs';

// Infra P14/P17, hygiene H2d (2026-10-01): tools/release.mjs is the versioned production release.
// This receipt pins its pure helpers and drives every subcommand only through --dry-run against a
// closed local port: it never runs Vercel or wrangler, never pulls an environment, never deploys.

// arguments
{
  const build = parseReleaseArgs(['build', 'abc1234', '--dry-run'], {});
  assert.deepEqual([build.command, build.sha, build.dryRun, build.scope, build.site], ['build', 'abc1234', true, 'kl01s-projects', 'https://cot.kevinliu.studio']);
  assert.equal(parseReleaseArgs(['build', 'HEAD'], { COT_VERCEL_SCOPE: 'team-from-env' }).scope, 'team-from-env', 'the scope comes from the environment');
  assert.equal(parseReleaseArgs(['build', 'HEAD', '--scope=flag-team'], { COT_VERCEL_SCOPE: 'env-team' }).scope, 'flag-team', 'a flag wins over the environment');
  const deploy = parseReleaseArgs(['deploy', 'HEAD', '--title=deploy 164: gate', '--keep', '--no-verify', '--ref=main']);
  assert.deepEqual([deploy.title, deploy.keep, deploy.verify, deploy.ref], ['deploy 164: gate', true, false, 'main']);
  const verifyOptions = parseReleaseArgs(['verify', 'HEAD', '--sweep', '--attempts=3', '--interval=2', '--site=http://127.0.0.1:9']);
  assert.deepEqual([verifyOptions.sweep, verifyOptions.attempts, verifyOptions.intervalMs, verifyOptions.site], [true, 3, 2000, 'http://127.0.0.1:9']);
  assert.equal(parseReleaseArgs(['rollback', '--to=claude-of-tanks-abc123-kl01s-projects.vercel.app']).to, 'claude-of-tanks-abc123-kl01s-projects.vercel.app');
  assert.equal(parseReleaseArgs(['workers', 'HEAD', '--only=rooms']).only, 'rooms');
  const recordOptions = parseReleaseArgs(['record', 'HEAD', '--no-verify', '--asset-cache=rc', '--dir=out'], {});
  assert.deepEqual([recordOptions.command, recordOptions.verify, recordOptions.assetCache], ['record', false, join(process.cwd(), 'rc')]);
  assert.equal(parseReleaseArgs(['deploy', 'HEAD', '--asset-cache=rc'], {}).assetCache, join(process.cwd(), 'rc'), 'deploy records into the named cache');
  for (const bad of [[], ['publish'], ['deploy'], ['record'], ['record', 'HEAD', '--carry=2'], ['verify', 'HEAD', '--asset-cache=x'], ['build', 'HEAD', '--prod'], ['rollback', 'HEAD'], ['verify', 'HEAD', '--keep'],
    ['build', 'HEAD', '--site=https://cot.kevinliu.studio/path'], ['workers', 'HEAD', '--only=../x'], ['build', 'a b'], ['deploy', 'HEAD', '--to=x'],
    ['build', 'HEAD', '--carry=x'], ['build', 'HEAD', '--carry=51'], ['build', 'HEAD', '--carry-max-mb=0'], ['deploy', 'HEAD', '--carry=2'],
    ['build', 'HEAD', '--asset-cache=']]) {
    assert.throws(() => parseReleaseArgs(bad, {}), Error, `${bad.join(' ')} is rejected`);
  }
  // the asset carry-forward: three releases and 200 MB by default, a cache outside any checkout
  assert.deepEqual([build.carryReleases, build.carryMaxBytes], [3, 200 * 1024 * 1024]);
  assert.deepEqual(ASSET_CARRY_DEFAULTS, { releases: 3, maxBytes: 200 * 1024 * 1024 });
  assert.equal(build.assetCache, join(homedir(), '.cache', 'cot-release'), 'the default cache lives in the user cache directory');
  assert.equal(defaultAssetCacheDir({ COT_RELEASE_ASSET_CACHE: '/srv/cot-cache' }), '/srv/cot-cache', 'the environment names another cache');
  assert.equal(defaultAssetCacheDir({}, '/home/release'), '/home/release/.cache/cot-release');
  const carry = parseReleaseArgs(['build', 'HEAD', '--carry=5', '--carry-max-mb=64', '--asset-cache=cache-dir'], {});
  assert.deepEqual([carry.carryReleases, carry.carryMaxBytes, carry.assetCache], [5, 64 * 1024 * 1024, join(process.cwd(), 'cache-dir')]);
  assert.equal(parseReleaseArgs(['build', 'HEAD', '--carry=0'], {}).carryReleases, 0, '--carry=0 turns the carry-forward off');
}

// the asset carry-forward on temporary directories: old tabs keep the chunks their page named. A build only reads the
// cache; a release is recorded when it is deployed (release 254's trap: measuring builds pushed the live release out).
{
  const scratch = mkdtempSync(join(tmpdir(), 'cot-release-carry-'));
  try {
    const cacheDir = join(scratch, 'cache');
    const sha = (letter) => letter.repeat(40);
    const files = (staticDir) => readdirSync(join(staticDir, 'assets'), { recursive: true })
      .filter((name) => !name.endsWith('/') && /\.[a-z0-9]+$/.test(name)).map(String).sort();
    const cached = () => JSON.parse(readFileSync(join(cacheDir, 'releases.json'), 'utf8')).releases.map((release) => release.commit);
    let serial = 0;
    /** A fresh build output: `{ name: contents }` under static/assets. */
    const output = (assets) => {
      const staticDir = join(scratch, `build-${++serial}`, 'static');
      for (const [name, text] of Object.entries(assets)) {
        mkdirSync(dirname(join(staticDir, 'assets', name)), { recursive: true });
        writeFileSync(join(staticDir, 'assets', name), text);
      }
      return staticDir;
    };
    const carry = (staticDir, commit, extra = {}) => carryForwardReleaseAssets({ staticDir, cacheDir, commit, ...extra });
    const record = (staticDir, commit, own, extra = {}) => recordReleaseAssets({ staticDir, cacheDir, commit, files: own,
      now: () => `2026-10-02T00:00:0${serial}Z`, ...extra });
    /** build, then deploy: the carry and the record of one release. */
    const release = (staticDir, commit, extra = {}) => { const carried = carry(staticDir, commit, extra); return { carried, recorded: record(staticDir, commit, carried.ownFiles) }; };

    // release a: nothing cached yet; only hashed names are listed as the build's own
    const a = output({ 'main-aaaaaaa1.js': 'a-main', 'shared-ssssssss.js': 'shared', 'fonts/inter-aaaaaaa2.woff2': 'a-font', 'notes.txt': 'unhashed' });
    const ra = release(a, sha('a'));
    assert.deepEqual({ ...ra.carried, ownFiles: ra.carried.ownFiles.map((file) => file.path) },
      { own: 3, ownFiles: ['fonts/inter-aaaaaaa2.woff2', 'main-aaaaaaa1.js', 'shared-ssssssss.js'], carried: 0, carriedBytes: 0, overBudget: 0, missing: 0, fromReleases: [] });
    assert.deepEqual(ra.recorded, { recorded: 3, pruned: 0, releases: [sha('a')] });
    // release b: carries a's files it lacks (nested paths too), never a file it emits itself
    const b = output({ 'main-bbbbbbb1.js': 'b-main', 'shared-ssssssss.js': 'shared' });
    const rb = release(b, sha('b'));
    assert.deepEqual([rb.carried.own, rb.carried.carried, rb.carried.fromReleases], [2, 2, [sha('a')]]);
    assert.deepEqual(files(b), ['fonts/inter-aaaaaaa2.woff2', 'main-aaaaaaa1.js', 'main-bbbbbbb1.js', 'shared-ssssssss.js']);
    assert.equal(readFileSync(join(b, 'assets', 'main-aaaaaaa1.js'), 'utf8'), 'a-main', 'a carried file keeps its bytes');
    const index = JSON.parse(readFileSync(join(cacheDir, 'releases.json'), 'utf8'));
    assert.deepEqual(index.releases.map((entry) => [entry.commit, entry.files.map((file) => file.path)]),
      [[sha('a'), ['fonts/inter-aaaaaaa2.woff2', 'main-aaaaaaa1.js', 'shared-ssssssss.js']], [sha('b'), ['main-bbbbbbb1.js', 'shared-ssssssss.js']]],
      'a release records only its own files, so a carried file ages out with the release that emitted it');
    // local builds that are never deployed leave the cache untouched: the live release stays in the carry
    const before = readFileSync(join(cacheDir, 'releases.json'), 'utf8');
    for (const letter of ['5', '6', '7', '8']) carry(output({ [`main-${letter.repeat(7)}1.js`]: letter }), sha(letter));
    assert.equal(readFileSync(join(cacheDir, 'releases.json'), 'utf8'), before, 'measuring builds record nothing');
    assert.deepEqual(readdirSync(join(cacheDir, 'assets')).filter((name) => /^main-[5-8]/.test(name)), [], 'nor copy their files into the cache');
    const afterLocal = output({ 'main-9999999a.js': 'nine' });
    assert.deepEqual(carry(afterLocal, sha('9')).fromReleases, [sha('b'), sha('a')], 'the next build still carries the deployed releases');
    // releases c, d, e: the last three are carried (newest first); the cache keeps the newest four and prunes the rest
    release(output({ 'main-ccccccc1.js': 'c-main' }), sha('c'));
    release(output({ 'main-ddddddd1.js': 'd-main' }), sha('d'));
    const e = output({ 'main-eeeeeee1.js': 'e-main' });
    const re = release(e, sha('e'));
    assert.deepEqual(re.carried.fromReleases, [sha('d'), sha('c'), sha('b')], 'the last three releases, newest first');
    assert.deepEqual(files(e), ['main-bbbbbbb1.js', 'main-ccccccc1.js', 'main-ddddddd1.js', 'main-eeeeeee1.js', 'shared-ssssssss.js']);
    assert.equal(re.recorded.pruned, 2, 'release a\'s own main chunk and font leave the cache once four newer releases exist');
    assert.deepEqual(re.recorded.releases, [sha('b'), sha('c'), sha('d'), sha('e')]);
    assert.deepEqual(readdirSync(join(cacheDir, 'assets'), { recursive: true }).map(String).filter((name) => name.endsWith('.js')).sort(),
      ['main-bbbbbbb1.js', 'main-ccccccc1.js', 'main-ddddddd1.js', 'main-eeeeeee1.js', 'shared-ssssssss.js']);
    // the byte cap drops the oldest releases first
    const f = output({ 'main-fffffff1.js': 'f-main' });
    const rf = release(f, sha('f'), { maxBytes: 12 });
    assert.deepEqual([rf.carried.carried, rf.carried.carriedBytes, rf.carried.overBudget], [2, 12, 1], 'e and d (6 bytes each) fit, c does not; b (the shared chunk) is four releases back');
    assert.deepEqual(files(f), ['main-ddddddd1.js', 'main-eeeeeee1.js', 'main-fffffff1.js']);
    // a redeploy of the same commit replaces its entry; --carry=0 copies nothing; keep=1 holds only the newest
    const f2 = output({ 'main-fffffff1.js': 'f-main' });
    const rf2 = carry(f2, sha('f'), { releases: 0 });
    assert.deepEqual([rf2.carried, rf2.fromReleases], [0, []]);
    assert.deepEqual(record(f2, sha('f'), rf2.ownFiles, { keep: 1 }).releases, [sha('f')]);
    assert.deepEqual(cached(), [sha('f')]);
    // the record refuses an output that no longer holds the build's own files, and a list with nothing in it
    const g = output({ 'main-ggggggg1.js': 'g-main' });
    const rg = carry(g, sha('1'));
    writeFileSync(join(g, 'assets', 'main-ggggggg1.js'), 'g-main-edited');
    assert.throws(() => record(g, sha('1'), rg.ownFiles), /is not the 6-byte file the build emitted/);
    assert.throws(() => record(g, sha('1'), []), /no own files to record/);
    assert.deepEqual(cached(), [sha('f')], 'a refused record changes nothing');
    writeFileSync(join(g, 'assets', 'main-ggggggg1.js'), 'g-main');
    record(g, sha('1'), rg.ownFiles);
    // a missing cache file or an unsafe recorded path is skipped, never fatal and never written outside the output
    const tampered = JSON.parse(readFileSync(join(cacheDir, 'releases.json'), 'utf8'));
    tampered.releases.at(-1).files.push({ path: '../escape-hhhhhhh1.js', bytes: 1 }, { path: 'gone-iiiiiii1.js', bytes: 1 });
    writeFileSync(join(cacheDir, 'releases.json'), JSON.stringify(tampered));
    const h = output({ 'main-hhhhhhh1.js': 'h-main' });
    const rh = carry(h, sha('2'));
    assert.deepEqual([rh.carried, rh.missing], [2, 1], 'f and g carried; the vanished file is counted, the escaping path ignored');
    assert.equal(existsSync(join(h, 'escape-hhhhhhh1.js')), false);
    // another release step holding the cache stops this one; a foreign index is refused
    mkdirSync(join(cacheDir, '.lock'));
    assert.throws(() => carry(output({ 'main-jjjjjjj1.js': 'j' }), sha('d')), /another release build holds/);
    assert.throws(() => record(h, sha('2'), rh.ownFiles), /another release build holds/);
    rmSync(join(cacheDir, '.lock'), { recursive: true });
    writeFileSync(join(cacheDir, 'releases.json'), JSON.stringify({ version: 99, releases: [] }));
    assert.throws(() => carry(output({ 'main-kkkkkkk1.js': 'k' }), sha('e')), /not a version-1 release cache index/);
    assert.throws(() => record(h, sha('2'), rh.ownFiles), /not a version-1 release cache index/);
    assert.equal(existsSync(join(cacheDir, '.lock')), false, 'a failed carry or record releases its lock');
    assert.throws(() => carryForwardReleaseAssets({ staticDir: join(scratch, 'none'), cacheDir, commit: sha('a') }), /emitted no hashed assets/);
    assert.equal(RELEASE_MANIFEST, 'cot-release.json', 'the own-file list sits in .vercel/, beside the uploaded output');
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// the redacted-environment strip removes only redacted browser-visible lines and reports names only
{
  const pulled = ['# Created by Vercel CLI', 'VITE_ROOMS_URL="[SENSITIVE]"', "VITE_TELEMETRY_URL='[SENSITIVE]'", 'VITE_SELF=[SENSITIVE]',
    'VITE_PUBLIC_FLAG="1"', 'TYPESAFE_API_KEY="[SENSITIVE]"', 'VERCEL_OIDC_TOKEN="opaque"', 'VITE_NOTE="[SENSITIVE] text"', ''].join('\n');
  const { text, dropped } = stripRedactedPublicEnv(pulled);
  assert.deepEqual(dropped, ['VITE_ROOMS_URL', 'VITE_TELEMETRY_URL', 'VITE_SELF']);
  assert.equal(text, ['# Created by Vercel CLI', 'VITE_PUBLIC_FLAG="1"', 'TYPESAFE_API_KEY="[SENSITIVE]"', 'VERCEL_OIDC_TOKEN="opaque"',
    'VITE_NOTE="[SENSITIVE] text"', ''].join('\n'), 'secrets and real public values are left exactly as pulled');
  assert.deepEqual(stripRedactedPublicEnv('A=1\n'), { text: 'A=1\n', dropped: [] });
}

// the served version stamp (tools/appVersion.ts: v<semver>+g<sha9>[.dirty])
{
  const page = (content) => `<head><meta charset="utf-8"><meta name="application-version" content="${content}" /></head>`;
  assert.deepEqual(parseVersionStamp(page('v1.0.0+g24c5c5b03')), { version: 'v1.0.0+g24c5c5b03', revision: '24c5c5b03', dirty: false });
  assert.deepEqual(parseVersionStamp(page('v1.0.0+build.7.g24c5c5b03.dirty')), { version: 'v1.0.0+build.7.g24c5c5b03.dirty', revision: '24c5c5b03', dirty: true });
  assert.deepEqual(parseVersionStamp('<meta content="v1.2.3+gabcdef123" name="application-version">'), { version: 'v1.2.3+gabcdef123', revision: 'abcdef123', dirty: false },
    'attribute order does not matter');
  assert.equal(parseVersionStamp('<html>no stamp</html>'), null);
  assert.equal(parseVersionStamp(page('v1.0.0')).revision, null, 'a build without a revision names no commit');
  const full = '24c5c5b03f1c2a8d9e0b7a6c5d4e3f2a1b0c9d8e';
  assert.equal(stampNames(parseVersionStamp(page('v1.0.0+g24c5c5b03')), full), true);
  assert.equal(stampNames(parseVersionStamp(page('v1.0.0+g24c5c5b03.dirty')), full), false, 'a dirty build never certifies a commit');
  assert.equal(stampNames(parseVersionStamp(page('v1.0.0+g24c5c5b04')), full), false);
  assert.equal(stampNames(null, full), false);
}

// deployment metadata, rollback target, chunk sweep and Worker version helpers
{
  assert.deepEqual(githubSlug('https://github.com/Kevin-Liu-01/claude-of-tanks.git'), { org: 'Kevin-Liu-01', repo: 'claude-of-tanks' });
  assert.deepEqual(githubSlug('git@github.com:Kevin-Liu-01/Claude-of-Tanks'), { org: 'Kevin-Liu-01', repo: 'Claude-of-Tanks' });
  assert.equal(githubSlug('https://gitlab.com/x/y.git'), null);
  const commit = 'f'.repeat(40);
  const metadata = deployMetadata({ commit, subject: 'gate: versioned tools', author: 'Kevin Liu' });
  const pairs = Object.fromEntries(metadata.filter((_, index) => index % 2).map((pair) => pair.split(/=(.*)/s).slice(0, 2)));
  assert.ok(metadata.filter((_, index) => index % 2 === 0).every((flag) => flag === '-m'), 'every pair is a -m flag');
  assert.deepEqual(pairs, { githubDeployment: '1', githubCommitRef: 'main', githubCommitSha: commit, githubCommitMessage: 'gate: versioned tools',
    githubCommitAuthorName: 'Kevin Liu', githubCommitAuthorLogin: RELEASE_DEFAULTS.githubLogin, githubOrg: 'Kevin-Liu-01', githubRepo: 'Claude-of-Tanks',
    githubRepoId: '1316388080', githubCommitOrg: 'Kevin-Liu-01', githubCommitRepo: 'Claude-of-Tanks', githubCommitRepoId: '1316388080',
    title: 'gate: versioned tools', gateHead: commit }, 'the branch-link metadata of the CLI deploy, from git');
  assert.equal(deployMetadata({ commit, subject: 's', author: 'a', title: 'deploy 164: gate' }).at(-3), 'title=deploy 164: gate');

  const deployment = (url, createdAt, sha, extra = {}) => ({ url, createdAt, meta: { githubCommitSha: sha }, state: 'READY', target: 'production', ...extra });
  const listing = { deployments: [
    deployment('d5.vercel.app', 500, 'e'.repeat(40)),
    deployment('d4.vercel.app', 400, 'd'.repeat(40), { state: 'ERROR' }),
    deployment('d3.vercel.app', 300, 'c'.repeat(40)),
    deployment('d2.vercel.app', 200, 'c'.repeat(40)),
    deployment('d1.vercel.app', 100, 'b'.repeat(40)),
    deployment('p0.vercel.app', 600, 'a'.repeat(40), { target: 'preview' }),
  ] };
  assert.equal(previousProductionDeployment(listing, 'eeeeeeeee').url, 'd3.vercel.app', 'the newest READY production deployment before the live one');
  assert.equal(previousProductionDeployment(listing, 'ccccccccc').url, 'd1.vercel.app', 'after an earlier rollback: older than the live one, another commit');
  assert.equal(previousProductionDeployment(listing.deployments, null).url, 'd3.vercel.app', 'an unknown live stamp: the one before the newest');
  assert.equal(previousProductionDeployment(listing, 'bbbbbbbbb'), null, 'nothing older to promote');
  assert.equal(previousProductionDeployment([], 'x'), null);

  const index = '<script type="module" src="/assets/main-hc1qihnq.js"></script><link rel="modulepreload" href="/assets/a-1.js"><link href="/assets/a-1.js"><link rel="stylesheet" href="/assets/s-2.css">';
  assert.deepEqual(chunkPaths(index), ['/assets/main-hc1qihnq.js', '/assets/a-1.js', '/assets/s-2.css']);
  assert.equal(cacheControlIsLong('public, max-age=31536000, immutable'), true);
  assert.equal(cacheControlIsLong('public, max-age=3600'), true);
  assert.equal(cacheControlIsLong('public, max-age=0, must-revalidate'), false, 'the default for a missing file heals on the next request');
  assert.equal(cacheControlIsLong(null), false);
  assert.deepEqual(workerDeployArgs({ commit: 'a'.repeat(40), subject: 'rooms: tag every version' }),
    ['wrangler', 'deploy', '--tag', 'a'.repeat(12), '--message', `${'a'.repeat(12)} rooms: tag every version`], 'the Worker version names the commit');
  assert.ok(workerDeployArgs({ commit: 'a'.repeat(40), subject: 'x'.repeat(300) })[5].length <= 100);
  assert.equal(displayCommand(['vercel', 'deploy', '-m', 'title=deploy 164: gate', "it's"]), "vercel deploy -m 'title=deploy 164: gate' 'it'\\''s'");
  assert.equal(VERCEL_CLI_MAJOR, 58);
}

// verify on a fake site: retries while the alias moves, sweeps chunks, refuses a cacheable missing chunk
{
  const commit = '1234567890abcdef1234567890abcdef12345678';
  const notes = [];
  const runner = { dryRun: false, note: (text) => notes.push(text) };
  const pageFor = (revision) => `<meta name="application-version" content="v1.0.0+g${revision}"><script src="/assets/main-a.js"></script><link href="/assets/b.css">`;
  const site = (stamps, { chunkStatus = 200, missingCache = 'public, max-age=0, must-revalidate' } = {}) => {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
      calls.push(`${init.method ?? 'GET'} ${url}`);
      if (url.endsWith('/')) { const revision = stamps.length > 1 ? stamps.shift() : stamps[0]; return { ok: true, status: 200, text: async () => pageFor(revision) }; }
      if (url.includes('DOESNOTEXIST')) return { ok: false, status: 404, headers: { get: () => missingCache } };
      return { ok: chunkStatus === 200, status: chunkStatus, headers: { get: () => null } };
    };
    return { fetchImpl, calls };
  };
  const options = { sha: commit, site: 'https://example.invalid', attempts: 3, intervalMs: 1, sweep: true };
  const sleeps = [];
  const live = site(['0000000aa', '123456789']);
  assert.equal(await verify(options, { root: REPO_ROOT, runner, fetchImpl: live.fetchImpl, sleep: async (ms) => sleeps.push(ms) }), true);
  assert.deepEqual(sleeps, [1], 'one retry while the alias still served the old stamp');
  assert.deepEqual(live.calls, ['GET https://example.invalid/', 'GET https://example.invalid/', 'GET https://example.invalid/assets/main-a.js',
    'GET https://example.invalid/assets/b.css', 'HEAD https://example.invalid/assets/main-DOESNOTEXIST1.js']);
  await assert.rejects(verify(options, { root: REPO_ROOT, runner, fetchImpl: site(['0000000aa']).fetchImpl, sleep: async () => {} }),
    /serves v1\.0\.0\+g0000000aa, not 123456789/, 'a deploy that never went live fails with the served stamp');
  await assert.rejects(verify(options, { root: REPO_ROOT, runner, fetchImpl: site(['123456789'], { chunkStatus: 404 }).fetchImpl, sleep: async () => {} }),
    /do not answer 200: \/assets\/main-a\.js:404 \/assets\/b\.css:404/);
  await assert.rejects(verify(options, { root: REPO_ROOT, runner, fetchImpl: site(['123456789'], { missingCache: 'public, max-age=31536000, immutable' }).fetchImpl, sleep: async () => {} }),
    /missing \/assets path is cacheable/);
  const offline = [];
  assert.equal(await verify(options, { root: REPO_ROOT, runner: createRunner({ dryRun: true, log: (text) => offline.push(text) }),
    fetchImpl: async () => assert.fail('a dry run fetches nothing') }), true);
  assert.match(offline[0], /^\[dry-run\] GET https:\/\/example\.invalid\/ until its application-version stamp names 123456789/);
}

// the CLI: every subcommand dry-runs against a closed port, prints its commands and changes nothing
{
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  const run = (...args) => spawnSync(process.execPath, ['tools/release.mjs', ...args, '--dry-run', '--site=http://127.0.0.1:9'],
    { cwd: REPO_ROOT, encoding: 'utf8', env: { ...process.env, COT_VERCEL_BIN: 'vercel-must-not-run' } });
  const build = run('build', 'HEAD');
  assert.equal(build.status, 0, build.stderr);
  for (const expected of [`git worktree add --detach ${join(tmpdir(), `cot-release-${head.slice(0, 12)}`)} ${head}`, '$ npm ci',
    'vercel-must-not-run pull --yes --environment=production --scope kl01s-projects', 'drop redacted VITE_*="[SENSITIVE]" lines',
    'vercel-must-not-run build --prod --yes --scope kl01s-projects', 'git checkout -- package-lock.json',
    'node tools/vercel-output-immutable.mjs --check', 'finally: delete', '.vercel/.env*.local']) {
    assert.ok(build.stdout.includes(expected), `build plan names: ${expected}`);
  }
  assert.ok(build.stdout.indexOf('finally: delete') > build.stdout.indexOf('vercel-output-immutable.mjs --check'), 'the environment files go last');
  assert.equal(existsSync(join(tmpdir(), `cot-release-${head.slice(0, 12)}`)), false, 'a dry run creates no worktree');
  const at = (text) => build.stdout.indexOf(text);
  assert.match(build.stdout, /carry-forward: copy the hashed \/assets files of the last 3 deployed releases cached in \S+ that this build lacks into \S+\/\.vercel\/output\/static\/assets \(newest first, at most 200 MB\); the cache is not written/);
  assert.match(build.stdout, /write this build's own hashed files to \S+\/\.vercel\/cot-release\.json \(recorded in the cache only when deployed\)/);
  assert.ok(at('remove ') < at('vercel-must-not-run build --prod') && at('git checkout -- package-lock.json') < at('carry-forward:')
    && at('carry-forward:') < at('$ node tools/vercel-output-immutable.mjs'), 'a fresh output, then the carry-forward between the build and the immutable routes');
  const noCarry = run('build', 'HEAD', '--carry=0');
  assert.equal(noCarry.status, 0, noCarry.stderr);
  assert.match(noCarry.stdout, /carry-forward: off \(--carry=0\)/);
  const deploy = run('deploy', 'HEAD', '--title=deploy 164: gate');
  assert.equal(deploy.status, 0, deploy.stderr);
  assert.match(deploy.stdout, new RegExp(`vercel-must-not-run deploy --prebuilt --prod --yes --archive=tgz --scope kl01s-projects -m githubDeployment=1 -m githubCommitRef=main -m githubCommitSha=${head}`));
  assert.match(deploy.stdout, /-m 'title=deploy 164: gate' -m gateHead=/);
  assert.match(deploy.stdout, /GET http:\/\/127\.0\.0\.1:9\/ until its application-version stamp names/);
  assert.ok(deploy.stdout.indexOf('until its application-version stamp') < deploy.stdout.indexOf(`record ${head.slice(0, 12)}'s own hashed files`)
    && deploy.stdout.indexOf('as the newest release in') < deploy.stdout.indexOf('git worktree remove'), 'deploy verifies, then records the release, then cleans up');
  const recorded = run('record', 'HEAD');
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.match(recorded.stdout, /until its application-version stamp names[\s\S]*own hashed files \(\S+\/\.vercel\/cot-release\.json\) as the newest release in/);
  assert.match(run('record', 'HEAD', '--no-verify').stdout, /--no-verify: recording without checking the served stamp/);
  const rollback = run('rollback');
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.match(rollback.stdout, /vercel-must-not-run list claude-of-tanks --environment production --status READY --format json --limit 20 --scope kl01s-projects/);
  assert.match(rollback.stdout, /vercel-must-not-run promote '<previous production deployment>' --yes --scope kl01s-projects/);
  assert.match(run('rollback', '--to=d1.vercel.app').stdout, /promote d1\.vercel\.app --yes/);
  const workers = run('workers', 'HEAD');
  assert.equal(workers.status, 0, workers.stderr);
  for (const worker of ['rooms', 'telemetry']) {
    assert.ok(workers.stdout.includes(`cloudflare/${worker})`), `${worker} is released`);
  }
  assert.match(workers.stdout, new RegExp(`npx wrangler deploy --tag ${head.slice(0, 12)} --message '${head.slice(0, 12)} `));
  assert.match(workers.stdout, /\$ npm run typecheck[\s\S]*\$ npm test[\s\S]*wrangler deploy/, 'each Worker is typechecked and tested before its deploy');
  assert.match(run('verify', 'HEAD', '--sweep').stdout, /every \/assets chunk the served index names/);
  assert.match(run('clean', 'HEAD').stdout, /git worktree remove --force/);
  const misuse = spawnSync(process.execPath, ['tools/release.mjs', 'deploy'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(misuse.status, 2); assert.match(misuse.stderr, /deploy needs the commit to release/);
}

// versioned means portable: no machine paths, no credentials in the tool
{
  const source = readFileSync(new URL('./release.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /['"`](?:\/Users\/|\/private\/|\/var\/folders\/|\/tmp\/)/, 'no absolute machine paths');
  assert.doesNotMatch(source, /(?:token|secret|password)\s*[:=]\s*['"][^'"]{8,}/i, 'no embedded credentials');
}
console.log('release.selftest: argument rules, redacted-env strip, version stamp, rollback target, verify and the dry-run CLI pass');
