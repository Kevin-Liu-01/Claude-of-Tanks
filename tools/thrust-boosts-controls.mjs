#!/usr/bin/env node
// thrust-boosts-controls.mjs — the reverted control for src/sim/thrustBoosts.selftest.mjs (thrust-boosts-279; Main: "the
// 277 burn fails (ii) and (iii)"). Copyright (c) 2026 Kevin B. Liu.
//
// Extracts the base tree's src/ (the merge base with origin/main, or --base=<ref>) into a scratch directory beside this
// checkout's node_modules, runs the receipt's measures against its sim (COT_BOOST_CONTROL_TREE), and asserts what the
// 277 burn does to Main's rules: (i) the climb fails (F in flight is one flip a flight, no stepped climb), (ii) a side
// press fails (the roll turns one whole turn and rests on its tracks: the end attitude is the start), (iii) two side
// presses fail (the second is refused). Read-only on the checkout; the scratch directory is removed afterwards unless
// --keep. Node-runnable: `node tools/thrust-boosts-controls.mjs [--base=<ref>] [--keep]`.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const keep = process.argv.includes('--keep');
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
const base = arg('base') ?? git('merge-base', 'HEAD', 'origin/main');
const dir = mkdtempSync(join(tmpdir(), 'cot-boost-control-'));
try {
  const archive = spawnSync('git', ['archive', base, 'src'], { cwd: ROOT, maxBuffer: 1 << 30 });
  assert.equal(archive.status, 0, `git archive ${base}: ${archive.stderr}`);
  const tar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout, maxBuffer: 1 << 30 });
  assert.equal(tar.status, 0, `tar: ${tar.stderr}`);
  symlinkSync(realpathSync(join(ROOT, 'node_modules')), join(dir, 'node_modules'));
  const run = spawnSync(process.execPath, [join(ROOT, 'src/sim/thrustBoosts.selftest.mjs')], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, COT_BOOST_CONTROL_TREE: join(dir, 'src/sim') }, maxBuffer: 1 << 26,
  });
  assert.equal(run.status, 0, `the receipt's measures ran on the base tree:\n${run.stderr}`);
  const verdicts = JSON.parse(run.stdout.trim().split('\n').pop());
  for (const id of ['i', 'ii', 'iii']) {
    const list = verdicts[id] ?? [];
    for (const { pass, detail } of list) console.log(`base ${base.slice(0, 10)} (${id}) ${pass ? 'pass' : 'FAIL'} ${detail}`);
    assert.ok(list.some((v) => !v.pass), `the 277 burn fails rule (${id})`);
  }
  console.log(`thrust-boosts-controls: the base tree (${base.slice(0, 10)}, the 277 burn) fails (i), (ii) and (iii)`);
} finally {
  if (!keep) rmSync(dir, { recursive: true, force: true });
  else console.log(`kept ${dir}`);
}
