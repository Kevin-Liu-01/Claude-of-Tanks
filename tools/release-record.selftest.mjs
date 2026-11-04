// The release's states after the irreversible step (2026-11-02 audit S5, tools/release.mjs), driven for real (not --dry-run)
// against a temporary git repository, a temporary release cache, a stand-in Vercel CLI, a runner that records commands
// instead of running Vercel or wrangler, and a fake site: nothing is deployed and no network is touched.
// - deploy records the release before verify: a verify that fails once the deploy is live leaves it recorded (the next
//   build carries its chunks: the open-tabs 404 trap) and names the commands that finish it; a record that fails after
//   the deploy names `record <sha>`; a missing or wrong own-file list stops the deploy before Vercel runs;
// - the cache lock has an owner: a SIGKILLed step's lock is reaped, a live step's names its pid;
// - workers records each deployed Worker's commit (workers.json), and a failure part-way names the Worker left behind.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claimOwnedLock, releaseOwnedLock } from './capture-lock.mjs';
import { carryForwardReleaseAssets, pairingLine, parseReleaseArgs, readWorkerDeploys, releasePairing, runRelease } from './release.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cot-release-record-'));
const savedBin = process.env.COT_VERCEL_BIN;
try {
  // a repository whose HEAD is the release, with a built output and its own-file list, and two Workers
  const repo = join(scratch, 'repo'), cache = join(scratch, 'cache');
  mkdirSync(repo);
  const git = (...args) => execFileSync('git', ['-c', 'user.email=selftest@example.invalid', '-c', 'user.name=selftest', ...args],
    { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'release: the selftest commit');
  const sha = git('rev-parse', 'HEAD'), sha12 = sha.slice(0, 12);
  for (const name of ['rooms', 'telemetry']) mkdirSync(join(repo, 'cloudflare', name), { recursive: true });
  const assets = join(repo, '.vercel', 'output', 'static', 'assets');
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, 'main-abcdef12.js'), 'main');
  const manifest = join(repo, '.vercel', 'cot-release.json');
  const writeManifest = (commit = sha) => writeFileSync(manifest, JSON.stringify({ version: 1, commit, files: [{ path: 'main-abcdef12.js', bytes: 4 }] }));
  writeManifest();
  // the Vercel CLI's version check runs the binary; a stand-in names the expected major
  const bin = join(scratch, 'vercel');
  writeFileSync(bin, '#!/bin/sh\necho "Vercel CLI 58.0.0"\n');
  chmodSync(bin, 0o755);
  process.env.COT_VERCEL_BIN = bin;
  const recorder = (failWhen = () => false) => {
    const calls = [], notes = [];
    return { calls, notes, dryRun: false, note: (text) => notes.push(text),
      async run(argv, { cwd } = {}) {
        calls.push(argv.join(' '));
        if (failWhen(argv, cwd)) throw new Error(`${argv.slice(0, 3).join(' ')} exited 1`);
        return { status: 0, stdout: 'https://claude-of-tanks-abc123-team.vercel.app', stderr: '' };
      } };
  };
  const staleSite = async () => ({ ok: true, status: 200, text: async () => '<meta name="application-version" content="v1.0.0+g0000000aa">' });
  const deployOptions = (...extra) => parseReleaseArgs(['deploy', sha, `--dir=${repo}`, `--asset-cache=${cache}`, '--keep', '--attempts=1',
    '--interval=0', '--site=https://example.invalid', ...extra], {});
  const recorded = () => (existsSync(join(cache, 'releases.json')) ? JSON.parse(readFileSync(join(cache, 'releases.json'), 'utf8')).releases.map((r) => r.commit) : []);

  // ---- a verify that fails after the deploy: the release is recorded, and the error names what finishes it ------------
  {
    const runner = recorder();
    await assert.rejects(runRelease(deployOptions(), { root: repo, runner, fetchImpl: staleSite }),
      (error) => /is deployed and recorded, but verify failed/.test(error.message) && error.message.includes(`node tools/release.mjs verify ${sha12}`),
      'the verify failure says the release is live and recorded, and what to run');
    assert.ok(runner.calls.some((call) => call.startsWith(`${bin} deploy --prebuilt`)), 'the deploy ran');
    assert.deepEqual(recorded(), [sha], 'the live release is in the cache although verify failed: the next build carries its chunks');
    assert.match(runner.notes.join('\n'), new RegExp(`release pairing: web ${sha12}; no Worker recorded`), 'the deploy names the pairing');
  }

  // ---- a record that fails after the deploy names `record <sha>` ------------------------------------------------------
  {
    const hold = claimOwnedLock(join(cache, '.lock')); // a live release step holds the cache
    try {
      const runner = recorder();
      await assert.rejects(runRelease(deployOptions(), { root: repo, runner, fetchImpl: staleSite }),
        (error) => error.message.includes(`${sha12} is deployed but not recorded`) && error.message.includes(`node tools/release.mjs record ${sha12} --no-verify`)
          && error.message.includes(`pid ${process.pid}`), 'the record failure names the live holder and the command that records the release');
    } finally { releaseOwnedLock(hold, { log: () => {} }); }
  }

  // ---- a wrong or missing own-file list stops the deploy before Vercel runs -------------------------------------------
  for (const [label, prepare] of [['missing', () => rmSync(manifest)], ['another commit', () => writeManifest('f'.repeat(40))],
    ['a file gone', () => { writeManifest(); rmSync(join(assets, 'main-abcdef12.js')); }]]) {
    prepare();
    const runner = recorder();
    await assert.rejects(runRelease(deployOptions(), { root: repo, runner, fetchImpl: staleSite }), /cot-release\.json/, `${label}: refused`);
    assert.equal(runner.calls.some((call) => call.includes(' deploy --prebuilt')), false, `${label}: before the irreversible deploy`);
    writeFileSync(join(assets, 'main-abcdef12.js'), 'main');
    writeManifest();
  }

  // ---- the cache lock: a killed step's lock is reaped; a live one names its pid ----------------------------------------
  {
    const lock = join(cache, '.lock');
    const killed = spawnSync(process.execPath, ['--input-type=module', '-e', `import { claimOwnedLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      if (!claimOwnedLock(${JSON.stringify(lock)})) process.exit(9); process.kill(process.pid, 'SIGKILL');`]);
    assert.equal(killed.signal, 'SIGKILL', 'a release step killed while it held the cache lock');
    assert.ok(existsSync(lock), 'left its lock behind');
    const out = join(scratch, 'build', 'static');
    mkdirSync(join(out, 'assets'), { recursive: true });
    writeFileSync(join(out, 'assets', 'main-99999999.js'), 'next');
    const carried = carryForwardReleaseAssets({ staticDir: out, cacheDir: cache, commit: 'e'.repeat(40) });
    assert.equal(carried.own, 1, 'the next build reaps the dead owner\'s lock and carries on');
    assert.equal(existsSync(lock), false, 'and leaves no lock');
  }

  // ---- workers: each deployed Worker is recorded; a failure part-way names the one left behind -------------------------
  {
    const options = parseReleaseArgs(['workers', sha, `--asset-cache=${cache}`], {});
    const runner = recorder((argv, cwd) => argv.includes('wrangler') && String(cwd).endsWith('telemetry'));
    await assert.rejects(runRelease(options, { root: repo, runner }),
      (error) => error.message.includes(`Workers at ${sha12}: rooms; not deployed: telemetry (still unrecorded)`)
        && error.message.includes(`node tools/release.mjs workers ${sha12} --only=<name>`), 'the failure names which Worker is on which commit');
    assert.equal(readWorkerDeploys(cache).rooms.commit, sha, 'rooms is recorded at the release commit');
    assert.equal(readWorkerDeploys(cache).telemetry, undefined, 'telemetry is not');
    assert.ok(runner.calls.at(-1).startsWith('git worktree remove --force'), 'the worktree is removed either way');
    assert.deepEqual(releasePairing(cache), { web: sha, workers: { rooms: sha } });
    assert.equal(pairingLine(releasePairing(cache)), `release pairing: web ${sha12}; rooms ${sha12}`);
    const both = recorder();
    await runRelease(options, { root: repo, runner: both });
    assert.deepEqual(Object.keys(readWorkerDeploys(cache)).sort(), ['rooms', 'telemetry'], 'a full run records both');
    assert.match(both.notes.join('\n'), new RegExp(`release pairing: web ${sha12}; rooms ${sha12}, telemetry ${sha12}`));
  }
  console.log('release-record.selftest: a live deploy is recorded before verify and every later failure names its command, the file list is checked before the deploy, a killed step\'s cache lock is reaped, and each Worker\'s commit is on record');
} finally {
  if (savedBin === undefined) delete process.env.COT_VERCEL_BIN; else process.env.COT_VERCEL_BIN = savedBin;
  rmSync(scratch, { recursive: true, force: true });
}
