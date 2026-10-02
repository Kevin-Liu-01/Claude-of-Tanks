import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareRedReceipt, failureSignature, GATE_LOCK_TIMEOUT_MS, GATE_STEPS, normalizeMessage, parseGateArgs, planGate,
  renderGateMarkdown, runGate, verdictBlocks, workerPackages } from './gate.mjs';
import { REPO_ROOT } from './selftest-cache.mjs';

// Gate P13/P14/P2 (2026-10-01): tools/gate.mjs is the one versioned landing gate. These cases pin its
// step plan, the failure identity the stop-the-line rule compares, the verdicts, and the execution
// path (on injected commands, so the receipt never builds, tests or takes the capture lease).

// arguments
{
  const defaults = parseGateArgs([]);
  assert.deepEqual(defaults.steps, ['typecheck', 'build', 'i18n', 'budget', 'workers', 'receipts', 'preflight']);
  assert.deepEqual(GATE_STEPS, defaults.steps);
  assert.equal(defaults.baseline, null);
  assert.deepEqual(parseGateArgs(['--steps=receipts,typecheck']).steps, ['typecheck', 'receipts'], 'steps keep the canonical order');
  assert.deepEqual(parseGateArgs(['--skip=build,preflight']).steps, ['typecheck', 'i18n', 'budget', 'workers', 'receipts']);
  assert.deepEqual(parseGateArgs(['--only=src/ui/**', '--shard=2/6', '--all', '--order=registry']).receiptArgs,
    ['--only=src/ui/**', '--shard=2/6', '--all', '--order=registry'], 'receipt selection passes through to the runner');
  const strict = parseGateArgs(['--baseline=origin/main', '--strict', '--base=24c5c5b03', '--reviewed-main=abcdef1', '--install']);
  assert.deepEqual([strict.baseline, strict.strict, strict.base, strict.reviewedMain, strict.install], ['origin/main', true, '24c5c5b03', 'abcdef1', true]);
  for (const bad of [['--steps=deploy'], ['--skip='], ['--steps=typecheck', '--skip=typecheck'], ['--baseline=main', '--steps=build'],
    ['--base=main'], ['--push'], ['--shard'], ['--out=']]) {
    assert.throws(() => parseGateArgs(bad), Error, `${bad.join(' ')} is rejected`);
  }
}

// step plan
{
  const options = parseGateArgs(['--only=tools/**']);
  const workers = [{ name: 'rooms', dir: 'cloudflare/rooms', scripts: ['typecheck', 'test'], installed: true },
    { name: 'telemetry', dir: 'cloudflare/telemetry', scripts: ['typecheck', 'test'], installed: false }];
  const plan = planGate({ ...options, install: true }, { root: '/repo', out: '/out', exists: () => false, workers });
  const commands = Object.fromEntries(plan.map((row) => [row.step, row.commands.map((argv) => argv.join(' '))]));
  assert.deepEqual(commands.typecheck, ['npm run typecheck']);
  assert.deepEqual(commands.build, ['npm run build'], 'the build prebuild runs i18n:validate');
  assert.deepEqual(commands.i18n, ['node tools/i18n-scan.mjs --check'], 'only the half of i18n:check the build does not run');
  assert.equal(plan.find((row) => row.step === 'budget').skip, 'tools/bundle-budget.mjs is not in this tree');
  assert.deepEqual(commands.workers, ['npm --prefix cloudflare/rooms run typecheck', 'npm --prefix cloudflare/rooms run test',
    'npm ci --prefix cloudflare/telemetry', 'npm --prefix cloudflare/telemetry run typecheck', 'npm --prefix cloudflare/telemetry run test']);
  assert.deepEqual(commands.receipts, ['node tools/run-selftests.mjs all --only=tools/** --report=/out/receipts.json --logs=/out/receipts']);
  assert.deepEqual(commands.preflight, [], 'the preflight resolves its base and location at run time');
  const budget = planGate(options, { root: '/repo', out: '/out', exists: (path) => path === 'tools/bundle-budget.mjs', workers });
  assert.deepEqual(budget.find((row) => row.step === 'budget').commands, [['node', 'tools/bundle-budget.mjs']], 'the budget runs once it exists');
  assert.match(budget.find((row) => row.step === 'workers').error, /npm ci --prefix cloudflare\/telemetry/, 'a missing Worker install fails with the command to run');
  const real = workerPackages(REPO_ROOT);
  assert.deepEqual(real.map((worker) => [worker.dir, worker.scripts]), [['cloudflare/rooms', ['typecheck', 'test']],
    ['cloudflare/telemetry', ['typecheck', 'test']]], 'both Workers are gated with their typecheck and tests');
}

// failure identity: the process's own uncaught error, values included, machine detail removed
const nodeFailure = (root, message, extra = '') => [
  'Error: a diagnostic line the receipt printed before failing',
  'node:internal/modules/run_main:107',
  '    triggerUncaughtException(',
  '    ^',
  '',
  `AssertionError [ERR_ASSERTION]: ${message}`,
  '',
  extra,
  '',
  `    at file://${root}/src/vehicles/ammunitionFlow.selftest.mjs:65:8`,
  '    at ModuleJob.run (node:internal/modules/esm/module_job:413:25) {',
  '  generatedMessage: false,',
  "  code: 'ERR_ASSERTION',",
  '  actual: 456,',
  '  expected: 420,',
  "  operator: 'strictEqual',",
  "  diff: 'simple'",
  '}',
  '',
  'Node.js v24.13.0',
].join('\n');
{
  const here = failureSignature(nodeFailure('/work/tree', 'ammunition census', '456 !== 420'), ['/work/tree']);
  assert.equal(here, "AssertionError [ERR_ASSERTION]: ammunition census\n456 !== 420\nactual: 456,\nexpected: 420,\noperator: 'strictEqual',",
    'the header after the source caret, its message lines and the asserted values');
  assert.equal(failureSignature(nodeFailure('/tmp/gate/baseline-abc', 'ammunition census', '456 !== 420'), ['/tmp/gate/baseline-abc']), here,
    'the same failure on another worktree has the same identity');
  assert.notEqual(failureSignature(nodeFailure('/work/tree', 'ammunition census', '470 !== 420'), ['/work/tree']), here,
    'a drifted value inside an old red is a different failure');
  assert.equal(failureSignature('\u001b[31mTypeError: P.forEachBucketPart is not a function\u001b[39m\n    at x (file:///work/tree/a.mjs:1:1)\n', ['/work/tree']),
    'TypeError: P.forEachBucketPart is not a function', 'ANSI colour and the stack are not identity');
  assert.equal(failureSignature('building\nfleet sweep 3 failed\nexit early\n'), 'building\nfleet sweep 3 failed\nexit early',
    'without an error header: the last three lines');
  assert.equal(failureSignature('step 1\nstep 2\nstep 3\nError: thrown by a receipt that reports and exits\nmore detail\n    at x (file:///a.mjs:1:1)\nlater output\n'),
    'Error: thrown by a receipt that reports and exits\nmore detail', 'a plain Error header is found without the source caret');
  const plainThrow = (message) => ['file:///work/tree/tools/capture-command.selftest.mjs:41', "throw new Error('x');", '^', '',
    `Error: ${message}`, '    at file:///work/tree/tools/capture-command.selftest.mjs:41:7',
    '    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)', '', 'Node.js v24.13.0'].join('\n');
  assert.equal(failureSignature(plainThrow('planted regression'), ['/work/tree']), 'Error: planted regression',
    'Node\'s uncaught plain Error: the header after the caret, not the stack tail');
  assert.notEqual(failureSignature(plainThrow('first message')), failureSignature(plainThrow('second message')),
    'two plain Errors thrown from the same line are different failures');
  assert.equal(normalizeMessage("open '/private/var/folders/yl/x/T/cot-abc123/a.json' took 1234.5 ms and 12ms", []),
    "open '<tmp>' took <ms> and <ms>", 'temporary paths and millisecond timings are normalised');
  assert.equal(normalizeMessage('at file:///work/tree/src/x.ts and /work/tree/y', ['/work/tree']), 'at <root>/src/x.ts and <root>/y');
  assert.equal(normalizeMessage('decode took 2.5 s (budget 20 s)'), 'decode took 2.5 s (budget 20 s)', 'second-scale values stay part of the message');
}

// verdicts of the stop-the-line comparison
{
  const signatureOf = (log) => log;
  const pair = (...attempts) => async (file, attempt) => attempts[attempt - 1];
  const fail = (log) => ({ status: 1, log }), pass = { status: 0, log: '' };
  const verdict = async (...attempts) => (await compareRedReceipt('r.selftest.mjs', { runPair: pair(...attempts), signatureOf })).verdict;
  assert.equal(await verdict({ here: fail('A'), base: fail('A') }), 'inherited', 'red on the baseline with the same first error');
  assert.equal(await verdict({ here: fail('A'), base: pass }), 'regression', 'passes on the baseline: this tree broke it');
  assert.equal(await verdict({ here: pass, base: fail('A') }), 'flaky', 'passes alone here: red only under the suite load');
  assert.equal(await verdict({ here: fail('B'), base: fail('A') }, { here: fail('B'), base: fail('A') }), 'changed',
    'a stable baseline message that differs: a new defect inside an old red');
  assert.equal(await verdict({ here: fail('B'), base: fail('A') }, { here: fail('A'), base: fail('A') }), 'inherited',
    'the confirmation run matches the baseline');
  assert.equal(await verdict({ here: fail('B'), base: fail('A') }, { here: fail('B'), base: fail('C') }), 'unstable',
    'two baseline runs disagree: the message cannot be compared');
  assert.equal(await verdict({ here: fail('B'), base: fail('A') }, { here: fail('B'), base: pass }), 'unstable');
  assert.equal(await verdict({ here: fail('B'), base: fail('A') }, { here: pass, base: fail('A') }), 'flaky');
  const missing = await compareRedReceipt('new.selftest.mjs', { signatureOf,
    runPair: async () => ({ here: fail('A'), base: { status: 0, log: '', missing: true } }) });
  assert.equal(missing.verdict, 'regression'); assert.equal(missing.base.missing, true, 'a receipt the baseline lacks is this tree\'s red');
  const quiet = await compareRedReceipt('q.selftest.mjs', { signatureOf: () => '', runPair: async () => ({ here: { status: 7, log: '' }, base: { status: 7, log: '' } }) });
  assert.equal(quiet.here.message, 'exit status 7'); assert.equal(quiet.verdict, 'inherited');
  for (const [name, blocks, strictBlocks] of [['regression', true, true], ['changed', true, true], ['inherited', false, false],
    ['flaky', false, true], ['unstable', false, true]]) {
    assert.equal(verdictBlocks(name, false), blocks, `${name} blocks: ${blocks}`);
    assert.equal(verdictBlocks(name, true), strictBlocks, `${name} blocks with --strict: ${strictBlocks}`);
  }
  const markdown = renderGateMarkdown({ ok: false, head: 'a'.repeat(40), dirty: false, out: '/out', startedAt: 's', finishedAt: 'f',
    steps: [{ step: 'typecheck', status: 'pass', ms: 5_000, commands: ['npm run typecheck'] }, { step: 'receipts', status: 'fail', error: 'blocking a|b' }],
    receipts: { selected: 3, executed: 2, reused: 1, failed: [{ file: 'r.selftest.mjs', message: 'B', log: '/out/r.log' }] },
    baseline: { ref: 'origin/main', commit: 'b'.repeat(40), lockfileMatches: false, rows: [
      { file: 'r.selftest.mjs', verdict: 'changed', blocking: true, here: { message: 'B' }, base: { message: 'A' }, confirm: { here: { message: 'B2' }, base: { message: 'A' } } }] } });
  assert.match(markdown, /^# Gate FAIL: aaaaaaaaaaaa/);
  assert.match(markdown, /\| typecheck \| pass \| 5\.0 s \| npm run typecheck \|/);
  assert.match(markdown, /blocking a\\\|b/, 'table cells escape pipes');
  assert.match(markdown, /### r\.selftest\.mjs: changed\n\nHere:\n\n```\nB2\n```\n\nBaseline:\n\n```\nA\n```/, 'both messages are reported');
  assert.match(markdown, /lockfile differs/);
}

// execution on injected commands: tee to step logs, stop at the first red step, summaries written
{
  const out = mkdtempSync(join(tmpdir(), 'cot-gate-run-'));
  try {
    const node = process.execPath;
    const planner = () => [
      { step: 'typecheck', commands: [[node, '-e', "console.log('typed')"]] },
      { step: 'build', commands: [[node, '-e', "console.error('broken build'); process.exit(3)"]] },
      { step: 'budget', commands: [], skip: 'absent' },
      { step: 'workers', commands: [[node, '-e', "console.log('never')"]] },
    ];
    const status = await runGate({ ...parseGateArgs(['--quiet']), out }, { root: REPO_ROOT, planner });
    assert.equal(status, 1);
    const summary = JSON.parse(readFileSync(join(out, 'gate.json'), 'utf8'));
    assert.deepEqual(summary.steps.map((row) => [row.step, row.status]), [['typecheck', 'pass'], ['build', 'fail'], ['budget', 'not run'], ['workers', 'not run']],
      'the gate stops at the first red step');
    assert.match(summary.steps[1].error, /exited 3/);
    assert.equal(summary.ok, false);
    assert.match(readFileSync(join(out, 'typecheck.log'), 'utf8'), /typed/);
    assert.match(readFileSync(join(out, 'build.log'), 'utf8'), /broken build/);
    assert.match(readFileSync(join(out, 'gate.md'), 'utf8'), /^# Gate FAIL/);
    const keepGoing = await runGate({ ...parseGateArgs(['--quiet', '--keep-going']), out: join(out, 'again') }, { root: REPO_ROOT, planner });
    assert.equal(keepGoing, 1);
    assert.deepEqual(JSON.parse(readFileSync(join(out, 'again', 'gate.json'), 'utf8')).steps.map((row) => row.status), ['pass', 'fail', 'skip', 'pass'],
      '--keep-going runs every step');
    const green = await runGate({ ...parseGateArgs(['--quiet']), out: join(out, 'green') }, { root: REPO_ROOT, planner: () => planner().filter((row) => row.step !== 'build') });
    assert.equal(green, 0);
    assert.equal(JSON.parse(readFileSync(join(out, 'green', 'gate.json'), 'utf8')).ok, true, 'skipped steps do not fail the gate');
    // an export without Git still runs its steps; the preflight fails cleanly instead of crashing
    const exported = mkdtempSync(join(tmpdir(), 'cot-gate-export-'));
    try {
      const steps = () => [{ step: 'typecheck', commands: [[node, '-e', "console.log('typed')"]] }, { step: 'preflight', commands: [] }];
      assert.equal(await runGate({ ...parseGateArgs(['--quiet', '--keep-going']), out: join(out, 'export') }, { root: exported, planner: steps }), 1);
      const summary = JSON.parse(readFileSync(join(out, 'export', 'gate.json'), 'utf8'));
      assert.equal(summary.head, null);
      assert.deepEqual(summary.steps.map((row) => [row.step, row.status]), [['typecheck', 'pass'], ['preflight', 'fail']]);
      assert.match(summary.steps[1].error, /not a git checkout/);
    } finally { rmSync(exported, { recursive: true, force: true }); }
  } finally { rmSync(out, { recursive: true, force: true }); }
}

// the CLI: a dry run prints the plan and runs nothing; misuse exits 2
{
  const dry = spawnSync(process.execPath, ['tools/gate.mjs', '--dry-run', '--baseline=HEAD', '--only=tools/**'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /\[gate\] typecheck: npm run typecheck/);
  assert.match(dry.stdout, /\[gate\] receipts: node tools\/run-selftests\.mjs all --only=tools\/\*\* --report=/);
  assert.match(dry.stdout, /\[gate\] preflight: node tools\/shared-main-preflight\.mjs --base=<merge-base HEAD origin\/main> --validated-head=[0-9a-f]{40}/);
  assert.match(dry.stdout, /inherited only with the same first error/);
  const outPath = /output would go to (\S+)/.exec(dry.stdout)?.[1];
  assert.ok(outPath && !existsSync(outPath), 'a dry run writes nothing');
  assert.equal(GATE_LOCK_TIMEOUT_MS, 3 * 60 * 60 * 1000, 'the gate waits for the capture lock as long as the landing chains did');
  assert.match(readFileSync(new URL('./gate.mjs', import.meta.url), 'utf8'), /process\.env\.COT_SHOTS_LOCK_TIMEOUT_MS \|\|= String\(GATE_LOCK_TIMEOUT_MS\)/,
    'the CLI sets the wait for its children only when the caller did not choose one');
  const misuse = spawnSync(process.execPath, ['tools/gate.mjs', '--deploy'], { cwd: REPO_ROOT, encoding: 'utf8' });
  assert.equal(misuse.status, 2);
  assert.match(misuse.stderr, /Unknown gate option: --deploy/);
}
console.log('gate.selftest: step plan, failure identity, stop-the-line verdicts, step execution and the dry-run CLI pass');
