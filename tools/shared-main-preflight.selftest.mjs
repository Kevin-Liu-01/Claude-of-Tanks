import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = mkdtempSync(join(tmpdir(), 'cot-shared-main-test-'));
const tool = fileURLToPath(new URL('./shared-main-preflight.mjs', import.meta.url));
const remote = join(root, 'origin.git');
const first = join(root, 'first');
const second = join(root, 'second');
// Do not inherit user signing, hooks, identity or Git directory overrides.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
Object.assign(env, {
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_AUTHOR_NAME: 'Preflight Test', GIT_AUTHOR_EMAIL: 'preflight@example.invalid',
  GIT_COMMITTER_NAME: 'Preflight Test', GIT_COMMITTER_EMAIL: 'preflight@example.invalid',
});
const git = (cwd, ...args) => execFileSync('git', args, {
  cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
}).trim();
const save = (cwd, file, body) => writeFileSync(join(cwd, file), body);
const commit = (cwd, message) => {
  git(cwd, 'add', '.'); git(cwd, 'commit', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
};
const check = (cwd, base, validated, extra = []) => {
  const run = spawnSync(process.execPath, [tool, `--base=${base}`, `--validated-head=${validated}`, ...extra], {
    cwd, env, encoding: 'utf8',
  });
  assert.equal(run.error, undefined);
  return { status: run.status, ...JSON.parse(run.stdout || run.stderr) };
};

try {
  git(root, 'init', '--bare', '--initial-branch=main', remote);
  git(root, 'clone', remote, first);
  save(first, 'shared.txt', 'initial\n');
  const base = commit(first, 'base');
  git(first, 'push', 'origin', 'main');
  git(root, 'clone', remote, second);
  save(first, 'own.txt', 'isolated change\n');
  const own = commit(first, 'own change');
  assert.equal(check(first, base, own).ok, true, 'isolated current work passes');
  assert.match(check(first, base, base).error, /after validation/);
  save(first, 'uncommitted.txt', 'uncommitted\n');
  assert.match(check(first, base, own).error, /uncommitted/);
  rmSync(join(first, 'uncommitted.txt'));

  save(second, 'shared.txt', 'other agent change\n');
  const advanced = commit(second, 'other agent');
  git(second, 'push', 'origin', 'main');
  assert.match(check(first, base, own).error, /Fetch origin/);
  git(first, 'fetch', 'origin');
  assert.match(check(first, base, own).error, /not included/);
  git(first, 'merge', '--no-edit', 'origin/main');
  const merged = git(first, 'rev-parse', 'HEAD');
  assert.equal(check(first, base, merged).ok, true, 'nonoverlapping integrated changes pass');

  // A stale whole-file replacement can be a perfectly legal fast-forward.
  // The file overlap gate must still catch it after the merge is complete.
  save(first, 'shared.txt', 'initial\n');
  const rollback = commit(first, 'simulate accidental replacement');
  const refused = check(first, base, rollback);
  assert.equal(refused.status, 1);
  assert.deepEqual(refused.overlappingPaths, ['shared.txt']);
  assert.match(check(first, base, rollback, [`--reviewed-main=${base}`]).error, /older main/);
  assert.equal(check(first, base, rollback, [`--reviewed-main=${advanced}`]).ok, true,
    'explicit review acknowledgment is tied to the exact current main');
  assert.match(check(first, own, rollback).error, /starting base/);
  assert.match(check(first, base, rollback, ['--force']).error, /Invalid/);
  assert.equal(git(remote, 'rev-parse', 'main'), advanced, 'preflight never pushes');
  console.log('shared-main-preflight: freshness, stale validation, dirty tree, overlap and read-only checks PASS');
} finally {
  rmSync(root, { recursive: true, force: true });
}
