// The base a lane command diffs against (tools/test-diff.mjs suggestedBase, chooseBase `--base=integ`) on criss-cross
// history (266, the M60 lane: it merged integ/265, then main, after integ/265 had merged main; plain `git merge-base`
// picked main's commit, so the suggestion fell back to origin/main and 2,903 paths). A fixture repository with an
// origin: the lane's newest merge base that origin/main does not contain is integ's, and a lane that never merged integ
// gets no suggestion (the negative control). First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseBase, suggestedBase } from './test-diff.mjs';

const dir = mkdtempSync(join(tmpdir(), 'cot-test-base-'));
try {
  const origin = join(dir, 'origin.git'), work = join(dir, 'work');
  let clock = 1_700_000_000;
  const git = (cwd, ...args) => {
    clock += 60; // each commit a minute later: the newest base is unambiguous
    const date = `${clock} +0000`;
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid', GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } }).trim();
  };
  const commit = (name) => { writeFileSync(join(work, `${name}.txt`), name); git(work, 'add', '.'); git(work, 'commit', '-q', '-m', name); return git(work, 'rev-parse', 'HEAD'); };
  const merge = (ref) => { git(work, 'merge', '-q', '--no-ff', '--no-edit', ref); return git(work, 'rev-parse', 'HEAD'); };
  git(dir, 'init', '-q', '--bare', origin);
  git(dir, 'init', '-q', '-b', 'main', work);
  commit('m0');
  git(work, 'switch', '-q', '-c', 'integ/265'); const i1 = commit('i1');
  git(work, 'switch', '-q', '-c', 'lane'); commit('l1');
  git(work, 'switch', '-q', 'main'); const m1 = commit('m1');
  git(work, 'switch', '-q', 'integ/265'); merge('main'); // integ merges main
  git(work, 'switch', '-q', 'main'); commit('m2');
  git(work, 'switch', '-q', 'lane'); merge('main'); // the lane merges the newer main
  git(work, 'remote', 'add', 'origin', origin);
  git(work, 'push', '-q', 'origin', 'main', 'integ/265');
  git(work, 'fetch', '-q', 'origin');

  const bases = git(work, 'merge-base', '--all', 'HEAD', 'origin/integ/265').split('\n').sort();
  assert.deepEqual(bases, [i1, m1].sort(), 'the fixture is criss-cross: two merge bases, one of them on origin/main');
  const suggestion = suggestedBase(work, 'origin/main');
  assert.deepEqual([suggestion?.name, suggestion?.mergeBase], ['integ/265', i1], 'the base origin/main does not contain is integ\'s');
  const said = [], log = console.log;
  console.log = (line) => said.push(line);
  try { assert.equal(chooseBase(work, 'integ', 'test:lane'), i1, '--base=integ takes it'); } finally { console.log = log; }
  assert.match(said.join('\n'), /--base=integ: origin\/integ\/265 at /);

  // negative control: a lane that never merged integ has every base on origin/main
  git(work, 'switch', '-q', '-c', 'plain', 'origin/main'); commit('p1');
  assert.equal(suggestedBase(work, 'origin/main'), null, 'a lane without integ commits gets no suggestion');
  console.log('test-base.selftest: criss-cross history suggests integ\'s own merge base; a lane without integ commits gets none');
} finally {
  rmSync(dir, { recursive: true, force: true }); // this receipt's own fixture
}
