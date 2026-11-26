#!/usr/bin/env node
// memory-capped.selftest: the cap holds the command's whole process tree, not only its direct child (integ/278, owed
// from 277: wrapped around npm, the 275 tool measured npm and capped nothing).
//
// 1. treeOf: the group, and a descendant that left the group, are summed; another tree is not.
// 2. A grandchild allocator in its own process group, under a small parent (the npm shape): the tree passes the cap,
//    the tool exits 137, and the grandchild is gone. The parent alone stays under the cap the whole run, so a cap on the
//    direct PID alone (the 275 tool) lets it run: COT_MEMORY_CAPPED=<old copy> is the reverted control, and fails here.
// 3. Under the cap the child's own exit code passes through.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { psRows, treeOf } from './memory-capped.mjs';

const TOOL = resolve(process.env.COT_MEMORY_CAPPED ?? new URL('./memory-capped.mjs', import.meta.url).pathname);

// 1. the tree walk
{
  const rows = psRows([
    '  100   100     1   1000', // the leader
    '  101   100   100   2000', // a member
    '  102   102   101   4096', // a grandchild in its own group (detached)
    '  103   102   102   8192', // its child
    '  200   200     1  99999', // another tree
  ].join('\n'));
  const tree = treeOf(rows, 100);
  assert.deepEqual(tree.pids.sort((a, b) => a - b), [100, 101, 102, 103], 'the group and every descendant of a member');
  assert.equal(tree.rssKib, 1000 + 2000 + 4096 + 8192, 'their resident sets summed, another tree not');
}

// 2. a grandchild allocator under a small parent
const dir = mkdtempSync(join(tmpdir(), 'cot-memory-capped-'));
try {
  const pidFile = join(dir, 'grandchild.pid');
  const grandchild = `require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));`
    + 'const held = []; for (let i = 0; i < 12; i++) held.push(Buffer.alloc(64 * 1048576, 1));'
    + 'setInterval(() => held.length, 1000); setTimeout(() => process.exit(0), 30000);';
  // the parent (npm's place) starts the allocator detached, in its own group, and waits on it
  const parent = `const c = require('child_process').spawn(process.execPath, ['-e', ${JSON.stringify(grandchild)}], { stdio: 'inherit', detached: true });`
    + "c.on('exit', (code) => process.exit(code ?? 1));";
  const started = Date.now();
  const run = spawnSync(process.execPath, [TOOL, '--cap-gib=0.35', '--', process.execPath, '-e', parent], { encoding: 'utf8', timeout: 60_000 });
  const seconds = (Date.now() - started) / 1000;
  assert.equal(run.status, 137, `the tree passed the cap and was stopped (exit ${run.status} after ${seconds.toFixed(1)} s): ${run.stderr.trim()}`);
  assert.ok(seconds < 25, `stopped at the cap, not at the allocator's own end (${seconds.toFixed(1)} s)`);
  const gpid = Number(readFileSync(pidFile, 'utf8'));
  let alive = true;
  for (let i = 0; i < 40 && alive; i++) {
    try { process.kill(gpid, 0); spawnSync('sleep', ['0.1']); } catch { alive = false; }
  }
  if (alive) { try { process.kill(gpid, 'SIGKILL'); } catch { /* gone */ } }
  assert.ok(!alive, `the grandchild ${gpid} was stopped with its tree`);
  assert.match(run.stderr, /stopped at the cap/, 'the tool says it stopped the tree');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// 3. under the cap, the child's code
{
  const run = spawnSync(process.execPath, [TOOL, '--cap-gib=2', '--', process.execPath, '-e', 'process.exit(3)'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 3, 'the child\'s exit code passes through');
}

console.log('memory-capped.selftest: PASS (a grandchild allocator in its own group, under a small parent, is stopped at the tree cap)');
