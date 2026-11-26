#!/usr/bin/env node
// browser-tree-cap.selftest: the browser guard's whole-tree cap only goes down (integ/278, Main's ruling 2026-11-25 14:12).
//
// 1. A launch's cap: the option, then COT_BROWSER_TREE_CAP_MB, then the ceiling; an ask above the ceiling is clamped
//    to it and logged once. The ceiling is the default 10240 MB, or a REVIEWED_TREE_CAPS row keyed by the guard label's
//    first word (the tool).
// 2. REVIEWED_TREE_CAPS is frozen, every row dated and reasoned; battle-spike-census is its one row, 16384 MB.
// 3. battle-spike-census reads its cap by its label: no treeCapMb option, no COT_BROWSER_TREE_CAP_MB read.
// 4. No tracked tool or source asks a literal treeCapMb above the default (a reviewed raise is a table row, not an option).
// Reverted control: the 277 browserGuardConfig (option/env win) returns 20000 for case 1 and fails here.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { clampedTreeCapMb, DEFAULT_TREE_CAP_MB, REVIEWED_TREE_CAPS, treeCapCeilingMb } from './browser-launch.mjs';

const root = new URL('..', import.meta.url).pathname;
const asks = (guard, env = {}) => { const lines = []; const mb = clampedTreeCapMb(guard, { envCapMb: env.COT_BROWSER_TREE_CAP_MB, log: (line) => lines.push(line) }); return { mb, lines }; };

// 1. the clamp
assert.equal(DEFAULT_TREE_CAP_MB, 10240, 'the default tree cap is 10 GB');
assert.equal(asks({ label: 'my-probe' }).mb, 10240, 'no ask: the default');
assert.equal(asks({ label: 'my-probe', treeCapMb: 4096 }).mb, 4096, 'an option may lower it');
assert.equal(asks({ label: 'my-probe' }, { COT_BROWSER_TREE_CAP_MB: '8000' }).mb, 8000, 'the environment may lower it');
{
  const raised = asks({ label: 'my-probe', treeCapMb: 20000 });
  assert.equal(raised.mb, 10240, 'an option above the ceiling is clamped');
  assert.equal(raised.lines.length, 1, 'and logged');
  assert.match(raised.lines[0], /20000 MB asked, clamped to 10240 MB/);
  assert.equal(asks({ label: 'my-probe', treeCapMb: 20000 }).lines.length, 0, 'once per label and ask');
}
assert.equal(asks({ label: 'my-probe-env' }, { COT_BROWSER_TREE_CAP_MB: '30000' }).mb, 10240, 'the environment cannot raise it');
const census = 'battle-spike-census steinburg:standard 7v7';
assert.equal(treeCapCeilingMb(census), 16384, 'a reviewed label: its row');
assert.equal(asks({ label: census }).mb, 16384, 'a reviewed label with no ask: its row');
assert.equal(asks({ label: census, treeCapMb: 20000 }).mb, 16384, 'a reviewed label cannot ask above its row');
assert.equal(asks({ label: census }, { COT_BROWSER_TREE_CAP_MB: '9000' }).mb, 9000, 'and may still lower it');
assert.equal(treeCapCeilingMb('battle-spike-census-copy x'), 10240, 'the key is the label\'s first word, exactly');
assert.equal(treeCapCeilingMb(undefined), 10240, 'an unlabelled launch: the default');

// 2. the table
assert.ok(Object.isFrozen(REVIEWED_TREE_CAPS), 'the table is frozen');
assert.deepEqual(Object.keys(REVIEWED_TREE_CAPS), ['battle-spike-census'], 'one reviewed raise (a new row is Main\'s or Kevin\'s ruling)');
for (const [key, row] of Object.entries(REVIEWED_TREE_CAPS)) {
  assert.ok(Object.isFrozen(row), `${key}: its row is frozen`);
  assert.ok(row.mb > DEFAULT_TREE_CAP_MB, `${key}: a row raises the cap (or it is no row)`);
  assert.match(row.reason, /^\d{4}-\d{2}-\d{2}: \S/, `${key}: its reason is dated`);
}
assert.equal(REVIEWED_TREE_CAPS['battle-spike-census'].mb, 16384);

// 3. the census reads its cap by its label
{
  const source = readFileSync(new URL('./battle-spike-census.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /COT_BROWSER_TREE_CAP_MB/, 'battle-spike-census reads no tree cap from the environment');
  assert.doesNotMatch(source, /treeCapMb\s*:/, 'battle-spike-census passes no tree cap option');
  assert.match(source, /label: `battle-spike-census /, 'its guard label starts with its row\'s key');
}

// 4. no literal raise anywhere
{
  let out = '';
  try {
    out = execFileSync('git', ['grep', '-n', '-I', '-E', 'treeCapMb\\s*:\\s*[0-9_]+', '--', 'api', 'scripts', 'server', 'src', 'tools'], { cwd: root, encoding: 'utf8' });
  } catch (error) { if (error.status !== 1) throw error; }
  const over = out.split('\n').filter(Boolean).filter((line) => Number(line.match(/treeCapMb\s*:\s*([0-9_]+)/)[1].replaceAll('_', '')) > DEFAULT_TREE_CAP_MB);
  assert.deepEqual(over, [], 'no tracked source asks a tree cap above the default');
}

console.log('browser-tree-cap.selftest: PASS (asks above the ceiling clamp and log; battle-spike-census 16384 by its label; no literal raise)');
