// (2026-11-24, 277) Heavy CPU work started outside the capture lock waits while a timing hold runs (tools/timing-gate.mjs).
// garage's timing9 phone numbers were spoiled by a test:lane tanks tier and a vite build started beside its hold: a paired
// timing run cancels only the load both arms see.
//   Stub owner tokens through timingHolder: a live timing hold and an older copy's classless hold block; a render group,
//   a render hold, a dead holder and the caller's own ancestor hold do not. waitForTimingHold on a stub series (timing,
//   timing, free) sleeps twice, names the hold once, and returns the minutes waited; COT_TIMING_GATE=off passes without
//   reading the lock. The CLI runs its command and passes the exit code through. The heavy entry points call the gate:
//   npm run build's prebuild, test:lane before its tanks tier, tank:regen:changed before a run that is not --dry-run.
//   The planted control is a gate that checks once and starts: the wait judgement must fail it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { timingHolder, waitForTimingHold, TIMING_GATE_INTERVAL_MS } from './timing-gate.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const failed = [];
const check = async (name, fn) => { try { await fn(); } catch (error) { failed.push(`${name}: ${error.message}`); } };

const LIVE = 70001, DEAD = 70002, MINE = 70003;
const stub = (token) => ({ readToken: () => token, alive: (pid) => pid !== DEAD, isAncestor: (pid) => pid === MINE });
const timing = { pid: LIVE, lockClass: 'timing', command: 'with-capture-lock.mjs --lock-class=timing -- garage timing9', startedAt: 't0' };

await check('who blocks', () => {
  assert.equal(timingHolder(stub(null)), null, 'a free lock');
  assert.deepEqual(timingHolder(stub(timing)), { pid: LIVE, lockClass: 'timing', command: timing.command, startedAt: 't0' }, 'a live timing hold');
  assert.equal(timingHolder(stub({ pid: LIVE, command: 'old copy' }))?.lockClass, 'exclusive', 'an older copy\'s classless hold');
  assert.equal(timingHolder(stub({ ...timing, lockClass: 'render' })), null, 'a render hold');
  assert.equal(timingHolder(stub({ ...timing, lockClass: 'render', group: { max: 2 } })), null, 'a render group');
  assert.equal(timingHolder(stub({ ...timing, pid: DEAD })), null, 'a dead holder');
  assert.equal(timingHolder(stub({ ...timing, pid: MINE })), null, 'the caller\'s own timing hold (an ancestor)');
});

/** Run a gate over the holder series; the clock moves only when the gate sleeps. */
async function runGate(gate, series) {
  let clock = 0, reads = 0, sleeps = 0;
  const lines = [];
  const minutes = await gate({ label: 'stub build', env: {}, holder: () => series[Math.min(reads++, series.length - 1)],
    sleep: async (ms) => { sleeps++; clock += ms; }, log: (line) => lines.push(line), now: () => clock });
  return { minutes, reads, sleeps, lines };
}
/** The wait judgement: over (timing, timing, free) a gate sleeps twice, re-reads the lock, and reports the wait. */
function judgeWait({ minutes, reads, sleeps, lines }) {
  const failures = [];
  if (sleeps !== 2) failures.push(`slept ${sleeps} times, not 2`);
  if (reads !== 3) failures.push(`read the lock ${reads} times, not 3`);
  if (minutes !== 2 * TIMING_GATE_INTERVAL_MS / 60_000) failures.push(`reported ${minutes} min`);
  if (lines.filter((line) => /waits: a timing hold \(pid 70001/.test(line)).length !== 1) failures.push('did not name the hold exactly once');
  if (!lines.some((line) => /hold ended after 2\.0 min; stub build starts/.test(line))) failures.push('did not say when it started');
  return failures;
}

await check('the wait', async () => {
  const failures = judgeWait(await runGate(waitForTimingHold, [timing, timing, null]));
  assert.deepEqual(failures, []);
  const free = await runGate(waitForTimingHold, [null]);
  assert.deepEqual([free.minutes, free.sleeps, free.lines.length], [0, 0, 0], 'a free lock passes at once, silently');
});

await check('the bypass', async () => {
  let read = false;
  const lines = [];
  await waitForTimingHold({ env: { COT_TIMING_GATE: 'off' }, holder: () => { read = true; return timing; }, log: (line) => lines.push(line) });
  assert.equal(read, false, 'the lock is not read');
  assert.match(lines.join('\n'), /COT_TIMING_GATE=off/);
});

await check('the CLI passes the exit code through', () => {
  const run = spawnSync(process.execPath, ['tools/timing-gate.mjs', '--', process.execPath, '-e', 'process.exit(3)'],
    { cwd: ROOT, env: { ...process.env, COT_TIMING_GATE: 'off' }, encoding: 'utf8' });
  assert.equal(run.status, 3, run.stderr);
});

await check('the heavy entry points call the gate', () => {
  const pkg = JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8'));
  assert.match(pkg.scripts.prebuild ?? '', /^node tools\/timing-gate\.mjs && /, 'npm run build\'s prebuild');
  const lane = readFileSync(`${ROOT}tools/test-lane.mjs`, 'utf8');
  assert.match(lane, /if \(extra\.length\) await waitForTimingHold\(/, 'test:lane before its --heavy tier');
  const regen = readFileSync(`${ROOT}tools/tank-regen-changed.mjs`, 'utf8');
  assert.match(regen, /if \(!DRY\) await waitForTimingHold\(/, 'tank:regen:changed before a run');
});

await check('planted control: a gate that checks once and starts', async () => {
  const onceGate = async ({ holder, log }) => { const held = holder(); if (held) log(`[timing-gate] stub build waits: a timing hold (pid ${held.pid}`); return 0; };
  const failures = judgeWait(await runGate(onceGate, [timing, timing, null]));
  assert.ok(failures.some((f) => /slept 0 times/.test(f)), `the judgement flags it (${failures.join('; ') || 'nothing'})`);
});

if (failed.length) {
  console.error(`timing-gate: ${failed.length} failed\n- ${failed.join('\n- ')}`);
  process.exit(1);
}
console.log('timing-gate: live timing and classless holds wait, render/dead/own holds pass, the entry points gate, control caught — ok');
