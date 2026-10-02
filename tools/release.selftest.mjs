import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cacheControlIsLong, chunkPaths, createRunner, deployMetadata, displayCommand, githubSlug, parseReleaseArgs,
  parseVersionStamp, previousProductionDeployment, RELEASE_DEFAULTS, stampNames, stripRedactedPublicEnv, verify,
  VERCEL_CLI_MAJOR, workerDeployArgs } from './release.mjs';
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
  for (const bad of [[], ['publish'], ['deploy'], ['build', 'HEAD', '--prod'], ['rollback', 'HEAD'], ['verify', 'HEAD', '--keep'],
    ['build', 'HEAD', '--site=https://cot.kevinliu.studio/path'], ['workers', 'HEAD', '--only=../x'], ['build', 'a b'], ['deploy', 'HEAD', '--to=x']]) {
    assert.throws(() => parseReleaseArgs(bad, {}), Error, `${bad.join(' ')} is rejected`);
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
  const deploy = run('deploy', 'HEAD', '--title=deploy 164: gate');
  assert.equal(deploy.status, 0, deploy.stderr);
  assert.match(deploy.stdout, new RegExp(`vercel-must-not-run deploy --prebuilt --prod --yes --scope kl01s-projects -m githubDeployment=1 -m githubCommitRef=main -m githubCommitSha=${head}`));
  assert.match(deploy.stdout, /-m 'title=deploy 164: gate' -m gateHead=/);
  assert.match(deploy.stdout, /GET http:\/\/127\.0\.0\.1:9\/ until its application-version stamp names/);
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
