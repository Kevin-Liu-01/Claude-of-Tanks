// test:lane's red classes (2026-11-01, item 267; tools/lane-reds.mjs). Pins, on stub runs and a stub base worktree:
// (1) a red only here is OWN, the identical failure on the base is INHERITED, a failure whose text differs from the
// base's is OWN, one that passes alone here is FLAKY, a receipt the base lacks is OWN; (2) a base result is kept by the
// receipt's input fingerprint: a second lane on the base runs nothing there and opens no worktree, a lane on another
// base with the same inputs opens one (for the fingerprint) but runs nothing in it, a receipt that reads Git state keys
// on the commit too, and a timing receipt runs every time and keeps nothing; (3) test:lane reads each tier's report,
// classifies its reds and fails only on OWN.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { classifyLaneReds, laneRedLines, LANE_RED_CLASS } from './lane-reds.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'lane-reds-selftest-'));
try {
  const root = join(scratch, 'head'), baseDir = join(scratch, 'base'), storeDir = join(scratch, 'store');
  const receipts = ['r/planted', 'r/inherited', 'r/changed', 'r/flaky', 'r/new', 'r/git', 'r/timing'];
  for (const file of receipts) { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), ''); }
  for (const file of receipts.filter((name) => name !== 'r/new')) {
    mkdirSync(dirname(join(baseDir, file)), { recursive: true }); writeFileSync(join(baseDir, file), '');
  }
  // what each receipt prints and exits with, here and on the base (a failure is a thrown Error the gate's signature reads)
  const OUTCOMES = {
    'r/planted': { here: [1, 'Error: planted regression'], base: [0, ''] },
    'r/inherited': { here: [1, 'AssertionError [ERR_ASSERTION]: 11 !== 0'], base: [1, 'AssertionError [ERR_ASSERTION]: 11 !== 0'] },
    'r/changed': { here: [1, 'AssertionError [ERR_ASSERTION]: 12 !== 0'], base: [1, 'AssertionError [ERR_ASSERTION]: 11 !== 0'] },
    'r/flaky': { here: [0, ''], base: [1, 'Error: never asked'] },
    'r/new': { here: [1, 'Error: a new receipt fails'], base: [0, ''] },
    'r/git': { here: [1, 'Error: git state'], base: [1, 'Error: git state'] },
    'r/timing': { here: [1, 'Error: slow'], base: [1, 'Error: slow'] },
  };
  const runs = [];
  const runFile = async (file, { cwd, logFile }) => {
    const side = cwd === root ? 'here' : 'base';
    runs.push(`${side}:${file}`);
    const [status, text] = OUTCOMES[file][side];
    mkdirSync(dirname(logFile), { recursive: true });
    writeFileSync(logFile, status ? `${text}\n    at receipt (${cwd}/${file}:1:1)\n\nNode.js v24.0.0\n` : 'ok\n');
    return { status };
  };
  let opened = 0, removed = 0;
  const openWorktree = () => { opened++; return { dir: baseDir, lockfileMatches: true, remove: () => { removed++; } }; };
  const liveReasons = { 'r/git': 'browser or Git state must be checked live', 'r/timing': 'fresh environment/timing check' };
  const headCache = { liveReason: (file) => liveReasons[file] ?? null, runSetOf: (file) => new Set([file]), metadataOf: () => ({}) };
  const makeCache = () => ({ inputKey: (file) => ({ key: `inputs-of-${file.replace('/', '-')}` }) });
  const classify = (reds, commit) => classifyLaneReds(reds, { root, commit, headCache, makeCache, storeDir, runFile, openWorktree,
    logDir: join(scratch, `logs-${commit}-${runs.length}`), log: () => {} });
  const classOf = (result) => Object.fromEntries(result.rows.map((row) => [row.file, row.class]));

  // (1) the classes
  const first = await classify(['r/planted', 'r/inherited', 'r/changed', 'r/flaky', 'r/new', 'r/git', 'r/timing'], 'a'.repeat(40));
  assert.deepEqual(classOf(first), { 'r/planted': 'OWN', 'r/inherited': 'INHERITED', 'r/changed': 'OWN', 'r/flaky': 'FLAKY', 'r/new': 'OWN',
    'r/git': 'INHERITED', 'r/timing': 'INHERITED' }, 'each red in its class');
  assert.deepEqual(first.own, ['r/planted', 'r/changed', 'r/new'], 'only OWN counts');
  assert.equal(first.rows.find((row) => row.file === 'r/changed').verdict, 'changed', 'a differing failure is confirmed by a second pair');
  assert.equal(opened, 1, 'one base worktree for the lane'); assert.equal(removed, 1, 'and it is removed');
  const lines = laneRedLines(first, { commit: 'a'.repeat(40), logDir: '/logs' });
  assert.match(lines[0], /reds: 3 own, 3 inherited, 1 flaky/);
  assert.ok(lines.some((line) => /^ {2}OWN r\/changed: its failure differs from the base's: AssertionError .*12 !== 0$/.test(line))
    && lines.some((line) => /^ {4}base: AssertionError .*11 !== 0$/.test(line)), 'a changed failure prints both messages');
  assert.ok(lines.some((line) => /^ {2}OWN r\/new: passes on the base \(no such receipt on the base\)/.test(line)), 'a new receipt is the lane\'s');

  // (2) a second lane on the same base: the kept results, no worktree, nothing run there; a timing receipt runs again
  runs.length = 0;
  const second = await classify(['r/inherited', 'r/planted', 'r/git', 'r/timing'], 'a'.repeat(40));
  assert.deepEqual(classOf(second), { 'r/inherited': 'INHERITED', 'r/planted': 'OWN', 'r/git': 'INHERITED', 'r/timing': 'INHERITED' });
  assert.deepEqual(runs.filter((run) => run.startsWith('base:')), ['base:r/timing'], 'only the timing receipt runs on the base again');
  assert.equal(opened, 2, 'a worktree only for the receipt that is never kept');
  assert.ok(second.rows.find((row) => row.file === 'r/inherited').base.cached, 'the base result was kept');
  runs.length = 0;
  await classify(['r/inherited', 'r/planted'], 'a'.repeat(40));
  assert.equal(opened, 2, 'kept results and indexed fingerprints: no worktree at all');
  assert.deepEqual(runs, ['here:r/inherited', 'here:r/planted'], 'each red still re-runs alone here');

  // another base where the receipts' inputs are the same: a worktree for the fingerprints, no base run; Git state differs
  runs.length = 0;
  const other = await classify(['r/inherited', 'r/git'], 'b'.repeat(40));
  assert.equal(opened, 3, 'a new base needs its fingerprints');
  assert.deepEqual(runs.filter((run) => run.startsWith('base:')), ['base:r/git'], 'same inputs reuse; a Git-state receipt keys on the commit');
  assert.deepEqual(classOf(other), { 'r/inherited': 'INHERITED', 'r/git': 'INHERITED' });
  assert.equal(LANE_RED_CLASS.unstable, 'OWN', 'a base that fails differently each run proves nothing inherited');

  // (3) test:lane's wiring
  const lane = readFileSync(new URL('./test-lane.mjs', import.meta.url), 'utf8');
  assert.match(lane, /`--report=\$\{reportPath\}`/, 'each tier writes its report');
  assert.match(lane, /!isStarved\(row\.status\)/, 'STARVED is never red');
  assert.match(lane, /classifyLaneReds\(reds,/, 'the reds are classified');
  assert.match(lane, /status = classified\.own\.length \? 1 : unreported \? status : 0;/, 'only OWN fails the lane');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log('lane-reds.selftest: OWN, INHERITED and FLAKY by the gate\'s pair rule; base results kept by input fingerprint across lanes');
