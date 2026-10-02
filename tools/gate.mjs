#!/usr/bin/env node
// The versioned landing gate (2026-10-01; gate audit P13/P14/P2, infra P14). One command for Codex,
// Claude and CI, run from the checkout under test:
//
//   typecheck -> build -> i18n -> budget -> workers -> receipts -> preflight
//
// - build runs `npm run build`, whose prebuild is `npm run i18n:validate`; the i18n step adds the
//   other half of `npm run i18n:check` (`tools/i18n-scan.mjs --check`), so nothing runs twice.
// - budget runs `tools/bundle-budget.mjs` when that file exists and is skipped otherwise.
// - workers runs the typecheck and test scripts of every `cloudflare/*/package.json` (rooms,
//   telemetry); `--install` runs `npm ci` for a Worker whose node_modules is missing.
// - receipts runs `tools/run-selftests.mjs all` (with --only/--shard/--all/--order passed through)
//   and keeps one log per receipt.
// - preflight runs `tools/shared-main-preflight.mjs` for the validated HEAD (in place when the
//   checkout is clean, else in a reusable detached worktree of HEAD).
//
// `--baseline=<ref>` is the stop-the-line rule (gate P2): every receipt red here is re-run alone on
// this tree and on a temporary worktree of <ref> at the same time. It counts as inherited ONLY when
// both fail with the same first error (paths, temporary directories and millisecond timings
// normalised; a differing pair is re-run once to tell an unstable message from a changed one).
// A receipt that passes on <ref> is a regression and a changed message is a new defect inside an
// old red; both stop the gate, with both messages reported. One that passes alone here is flaky
// under load (reported; blocking with --strict, as is an unstable base message).
//
// Writes gate.json and gate.md to --out (default: a fresh directory under the OS temp dir). It never
// pushes, deploys, fetches, or changes any setting.
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, symlinkSync,
  writeFileSync } from 'node:fs';
import { constants, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const GATE_STEPS = Object.freeze(['typecheck', 'build', 'i18n', 'budget', 'workers', 'receipts', 'preflight']);
const VERDICTS_BLOCKING = Object.freeze({ regression: true, changed: true, flaky: false, unstable: false, inherited: false });
const RECEIPT_FLAGS = /^--(?:only|shard|order)=.+$|^--all$/;

/** Parse the command line; throws on misuse (exit 2). */
export function parseGateArgs(args) {
  const options = { steps: [...GATE_STEPS], receiptArgs: [], baseline: null, strict: false, base: null,
    reviewedMain: null, install: false, out: null, dryRun: false, keepGoing: false, quiet: false };
  let only = null;
  const skip = new Set();
  const stepList = (value, flag) => {
    const names = value.split(',').map((name) => name.trim()).filter(Boolean);
    const unknown = names.filter((name) => !GATE_STEPS.includes(name));
    if (!names.length || unknown.length) throw new Error(`${flag} takes steps from ${GATE_STEPS.join(',')}; got ${value}`);
    return names;
  };
  for (const arg of args) {
    const [flag, ...rest] = arg.split('=');
    const value = rest.join('=');
    if (flag === '--steps' && value) only = new Set(stepList(value, '--steps'));
    else if (flag === '--skip' && value) for (const name of stepList(value, '--skip')) skip.add(name);
    else if (RECEIPT_FLAGS.test(arg)) options.receiptArgs.push(arg);
    else if (flag === '--baseline' && value) options.baseline = value;
    else if (flag === '--base' && /^[0-9a-f]{7,40}$/.test(value)) options.base = value;
    else if (flag === '--reviewed-main' && /^[0-9a-f]{7,40}$/.test(value)) options.reviewedMain = value;
    else if (flag === '--out' && value) options.out = resolve(value);
    else if (arg === '--strict') options.strict = true;
    else if (arg === '--install') options.install = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--keep-going') options.keepGoing = true;
    else if (arg === '--quiet') options.quiet = true;
    else throw new Error(`Unknown gate option: ${arg}`);
  }
  options.steps = GATE_STEPS.filter((step) => (!only || only.has(step)) && !skip.has(step));
  if (!options.steps.length) throw new Error('--steps/--skip leave no step to run');
  if (options.baseline && !options.steps.includes('receipts')) throw new Error('--baseline compares red receipts; keep the receipts step');
  return options;
}

/** Worker packages with their scripts, from cloudflare/*\/package.json. */
export function workerPackages(root) {
  const base = join(root, 'cloudflare');
  let names = [];
  try { names = readdirSync(base, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(); }
  catch { return []; }
  return names.flatMap((name) => {
    const manifest = join(base, name, 'package.json');
    if (!existsSync(manifest)) return [];
    const scripts = JSON.parse(readFileSync(manifest, 'utf8')).scripts ?? {};
    return [{ name, dir: `cloudflare/${name}`, scripts: ['typecheck', 'test'].filter((script) => scripts[script]),
      installed: existsSync(join(base, name, 'node_modules')) }];
  });
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
/** The commands of each selected step (preflight is resolved at run time). */
export function planGate(options, { root, out, exists = (path) => existsSync(join(root, path)), workers = workerPackages(root) }) {
  return options.steps.map((step) => {
    if (step === 'typecheck') return { step, commands: [[npm, 'run', 'typecheck']] };
    if (step === 'build') return { step, commands: [[npm, 'run', 'build']], note: 'prebuild runs npm run i18n:validate' };
    if (step === 'i18n') return { step, commands: [['node', 'tools/i18n-scan.mjs', '--check']], note: 'the build prebuild ran i18n:validate' };
    if (step === 'budget') {
      return exists('tools/bundle-budget.mjs') ? { step, commands: [['node', 'tools/bundle-budget.mjs']] }
        : { step, commands: [], skip: 'tools/bundle-budget.mjs is not in this tree' };
    }
    if (step === 'workers') {
      if (!workers.length) return { step, commands: [], skip: 'no cloudflare/*/package.json' };
      const missing = workers.filter((worker) => !worker.installed);
      if (missing.length && !options.install) {
        return { step, commands: [], error: `Worker dependencies are not installed: run ${missing.map((worker) => `npm ci --prefix ${worker.dir}`).join(' && ')} (or pass --install)` };
      }
      return { step, commands: workers.flatMap((worker) => [
        ...(worker.installed ? [] : [[npm, 'ci', '--prefix', worker.dir]]),
        ...worker.scripts.map((script) => [npm, '--prefix', worker.dir, 'run', script]),
      ]) };
    }
    if (step === 'receipts') {
      return { step, commands: [['node', 'tools/run-selftests.mjs', 'all', ...options.receiptArgs,
        `--report=${join(out, 'receipts.json')}`, `--logs=${join(out, 'receipts')}`]] };
    }
    return { step, commands: [] }; // preflight
  });
}

const stripAnsi = (text) => text.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
const ERROR_HEADER = /^\s*(?:Uncaught\s+)?(?:[A-Za-z_$][\w$.]*)?(?:Error|Exception)(?:\s\[[A-Z0-9_]+\])?:/;
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Paths, temporary directories and millisecond timings are not part of an error's identity. */
export function normalizeMessage(text, roots = []) {
  let result = text;
  const variants = [...new Set(roots.filter(Boolean).flatMap((root) => {
    const real = (() => { try { return realpathSync(root); } catch { return root; } })();
    return [root, real, root.replace(/^\/private\//, '/'), real.replace(/^\/private\//, '/')];
  }))].sort((a, b) => b.length - a.length);
  for (const root of variants) result = result.replace(new RegExp(`(?:file://)?${escapeRegExp(root)}`, 'g'), '<root>');
  result = result
    .replace(/(?:file:\/\/)?(?:\/private)?\/(?:var\/folders|tmp)\/[^\s'"`)\]]*/g, '<tmp>')
    .replace(/\b\d+(?:\.\d+)?\s?ms\b/g, '<ms>');
  return result.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
}

/**
 * The identity of a receipt failure: the error header and its message lines up to the stack, plus
 * the actual/expected/operator lines Node prints after the stack (a custom assertion message hides
 * the values otherwise). The header is the first one after Node's last source-context caret (the
 * process's own uncaught error, not a diagnostic line the receipt printed), else the first one in
 * the output (a receipt that reports and exits). Without an error header: the last three lines.
 */
export function failureSignature(text, roots = []) {
  const lines = stripAnsi(String(text ?? '')).split(/\r?\n/);
  const caret = lines.findLastIndex((line) => /^\s*\^+\s*$/.test(line));
  let start = caret < 0 ? -1 : lines.findIndex((line, at) => at > caret && ERROR_HEADER.test(line));
  if (start < 0) start = lines.findIndex((line) => ERROR_HEADER.test(line));
  let picked;
  if (start < 0) picked = lines.filter((line) => line.trim()).slice(-3);
  else {
    picked = [];
    let index = start;
    for (; index < lines.length && picked.length < 40; index++) {
      const line = lines[index];
      if (index > start && (/^\s+at\s/.test(line) || /^Node\.js v\d/.test(line))) break;
      picked.push(line);
    }
    // Node opens the error's own properties at the end of the last stack line (or on its own line)
    const open = lines.findIndex((line, at) => at >= index && line.trimEnd().endsWith('{'));
    if (open >= 0) {
      for (let at = open + 1; at < lines.length && lines[at].trim() !== '}'; at++) {
        if (/^\s+(?:actual|expected|operator):/.test(lines[at])) picked.push(lines[at]);
      }
    }
  }
  return normalizeMessage(picked.join('\n'), roots);
}

/**
 * One red receipt against the baseline. runPair(file, attempt) runs it alone here and on the
 * baseline at the same time: { here: { status, log }, base: { status, log } }.
 */
export async function compareRedReceipt(file, { runPair, signatureOf }) {
  const summary = (result) => ({ status: result.status, log: result.log, ...(result.missing ? { missing: true } : {}),
    message: result.status === 0 ? '' : (signatureOf(result.log) || `exit status ${result.status}`) });
  const first = await runPair(file, 1);
  const row = { file, here: summary(first.here), base: summary(first.base) };
  if (row.here.status === 0) row.verdict = 'flaky';
  else if (row.base.status === 0) row.verdict = 'regression';
  else if (row.here.message === row.base.message) row.verdict = 'inherited';
  else {
    const second = await runPair(file, 2);
    row.confirm = { here: summary(second.here), base: summary(second.base) };
    if (row.confirm.here.status === 0) row.verdict = 'flaky';
    else if (row.confirm.base.status === 0 || row.confirm.base.message !== row.base.message) row.verdict = 'unstable';
    else if (row.confirm.here.message === row.base.message) row.verdict = 'inherited';
    else row.verdict = 'changed';
  }
  return row;
}

export const verdictBlocks = (verdict, strict) => VERDICTS_BLOCKING[verdict] || (strict && verdict !== 'inherited');

const fence = (text) => ['```', text || '(no output)', '```'].join('\n');
/** The Markdown summary. */
export function renderGateMarkdown(summary) {
  const lines = [`# Gate ${summary.ok ? 'PASS' : 'FAIL'}: ${summary.head?.slice(0, 12) ?? '?'}${summary.dirty ? ' (uncommitted changes)' : ''}`, '',
    `Started ${summary.startedAt}, finished ${summary.finishedAt}. Output: \`${summary.out}\`.`, '',
    '| step | status | time | detail |', '|---|---|--:|---|'];
  for (const step of summary.steps) {
    const detail = step.error ?? step.skip ?? step.note ?? (step.commands ?? []).join('; ');
    lines.push(`| ${step.step} | ${step.status} | ${step.ms === undefined ? '' : `${(step.ms / 1000).toFixed(1)} s`} | ${String(detail).replace(/\|/g, '\\|')} |`);
  }
  const receipts = summary.receipts;
  if (receipts) {
    lines.push('', `## Receipts`, '', `${receipts.selected ?? '?'} selected, ${receipts.executed ?? '?'} executed, ${receipts.reused ?? '?'} reused, ${receipts.failed.length} red.`);
    for (const failed of receipts.failed) lines.push('', `- \`${failed.file}\` (log: \`${failed.log}\`)`, '', fence(failed.message));
  }
  const baseline = summary.baseline;
  if (baseline) {
    lines.push('', `## Baseline ${baseline.ref} (${baseline.commit?.slice(0, 12) ?? '?'})`, '');
    if (baseline.lockfileMatches === false) lines.push('The baseline lockfile differs from this tree; its receipts ran with this tree\'s node_modules.', '');
    lines.push('| receipt | verdict | blocks |', '|---|---|---|');
    for (const row of baseline.rows) lines.push(`| \`${row.file}\` | ${row.verdict} | ${row.blocking ? 'yes' : 'no'} |`);
    for (const row of baseline.rows.filter((entry) => entry.verdict === 'changed' || entry.verdict === 'unstable')) {
      lines.push('', `### ${row.file}: ${row.verdict}`, '', 'Here:', '', fence((row.confirm ?? row).here.message), '', 'Baseline:', '', fence(row.base.message));
      if (row.confirm) lines.push('', 'Baseline, second run:', '', fence(row.confirm.base.message));
    }
  }
  if (summary.preflight) lines.push('', '## Preflight', '', fence(JSON.stringify(summary.preflight, null, 2)));
  return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------------
// Execution

const git = (root, ...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryGit = (root, ...args) => { try { return git(root, ...args); } catch { return null; } };

/** Run one command, teeing its output to the step log (and the console unless quiet). */
function runCommand(argv, { cwd, log, echo }) {
  return new Promise((resolvePromise) => {
    const started = Date.now();
    log.write(`$ ${argv.join(' ')}\n`);
    let child;
    try { child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { resolvePromise({ status: null, error, ms: 0 }); return; }
    const write = (chunk) => { log.write(chunk); if (echo) process.stdout.write(chunk); };
    child.stdout.on('data', write);
    child.stderr.on('data', write);
    let done = false, exitStatus = null;
    const finish = (error) => {
      if (done) return;
      done = true;
      resolvePromise({ status: exitStatus, error, ms: Date.now() - started });
    };
    child.once('error', (error) => finish(error));
    child.once('close', () => finish());
    child.once('exit', (code, signal) => {
      exitStatus = code ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 1);
      // a lingering grandchild may hold the pipes; stop waiting for them shortly after the exit
      setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); finish(); }, 3000).unref();
    });
  });
}

async function runStep(plan, { root, out, echo }) {
  const logPath = join(out, `${plan.step}.log`);
  const log = createWriteStream(logPath);
  const row = { step: plan.step, commands: plan.commands.map((argv) => argv.join(' ')), log: logPath };
  let ms = 0, status = 'pass';
  try {
    for (const argv of plan.commands) {
      if (echo) console.log(`[gate] ${plan.step}: ${argv.join(' ')}`);
      const result = await runCommand(argv, { cwd: root, log, echo });
      ms += result.ms;
      if (result.error || result.status !== 0) {
        status = 'fail';
        row.error = result.error ? `could not run ${argv[0]}: ${result.error.message}` : `${argv.join(' ')} exited ${result.status}`;
        break;
      }
    }
  } finally {
    await new Promise((resolveEnd) => log.end(resolveEnd));
  }
  return { ...row, status, ms };
}

function receiptSummary(out, root) {
  let report;
  try { report = JSON.parse(readFileSync(join(out, 'receipts.json'), 'utf8')); } catch { return null; }
  const failed = report.rows.filter((row) => !row.skipped && (row.error || row.status !== 0)).map((row) => {
    const log = join(out, 'receipts', `${row.file}.log`);
    let text = '';
    try { text = readFileSync(log, 'utf8'); } catch { /* spawn error: no log */ }
    return { file: row.file, status: row.status, message: row.error ?? (failureSignature(text, [root]) || `exit status ${row.status}`), log };
  });
  return { report: join(out, 'receipts.json'), status: report.status, selected: report.selected, executed: report.executed,
    reused: report.reused, failed };
}

async function compareWithBaseline({ root, ref, failed, out, strict, echo, lockFactory }) {
  const { runSelftestFile, runSelftestSuite, SELFTEST_OWNED_LEASE_FILES } = await import('./run-selftests.mjs');
  const { createCaptureLock } = await import('./capture-lock.mjs');
  lockFactory ??= createCaptureLock;
  const commit = git(root, 'rev-parse', '--verify', `${ref}^{commit}`);
  const dir = join(out, `baseline-${commit.slice(0, 12)}`);
  const result = { ref, commit, dir, rows: [] };
  if (echo) console.log(`[gate] baseline: worktree of ${ref} (${commit.slice(0, 12)}) at ${dir}`);
  git(root, 'worktree', 'add', '--detach', dir, commit);
  try {
    const modules = join(root, 'node_modules');
    if (existsSync(modules)) symlinkSync(realpathSync(modules), join(dir, 'node_modules'));
    const models = join(root, 'public', 'models');
    if (existsSync(models) && !existsSync(join(dir, 'public', 'models'))) {
      mkdirSync(join(dir, 'public'), { recursive: true });
      symlinkSync(realpathSync(models), join(dir, 'public', 'models'));
    }
    const lock = (path) => { try { return readFileSync(path); } catch { return null; } };
    result.lockfileMatches = Boolean(lock(join(root, 'package-lock.json'))?.equals(lock(join(dir, 'package-lock.json')) ?? Buffer.alloc(0)));
    const signatureOf = (log) => { try { return failureSignature(readFileSync(log, 'utf8'), [root, dir]); } catch { return ''; } };
    const runPair = async (file, attempt) => {
      const logs = { here: join(out, 'pairs', 'here', `${file}.${attempt}.log`), base: join(out, 'pairs', 'base', `${file}.${attempt}.log`) };
      if (!existsSync(join(dir, file))) return { here: { ...(await runSelftestFile(file, { cwd: root, logFile: logs.here })), log: logs.here },
        base: { status: 0, log: '', missing: true } };
      const [here, base] = await Promise.all([
        runSelftestFile(file, { cwd: root, logFile: logs.here }),
        runSelftestFile(file, { cwd: dir, logFile: logs.base }),
      ]);
      return { here: { ...here, log: logs.here }, base: { ...base, log: logs.base } };
    };
    // the pairs hold the capture lease like any receipt run (browser receipts take it themselves)
    await runSelftestSuite('baseline-pairs', failed.map((row) => row.file), {
      lock: lockFactory(), ownedLeaseFiles: SELFTEST_OWNED_LEASE_FILES, concurrency: 1, log: () => {},
      runFile: async (file) => {
        const row = await compareRedReceipt(file, { runPair, signatureOf });
        row.blocking = verdictBlocks(row.verdict, strict);
        result.rows.push(row);
        if (echo) console.log(`[gate] baseline ${row.verdict}${row.blocking ? ' (blocks)' : ''}: ${file}`);
        return { status: 0 };
      },
    });
  } finally {
    try { git(root, 'worktree', 'remove', '--force', dir); } catch { /* reported below */ }
  }
  result.blocking = result.rows.filter((row) => row.blocking).map((row) => row.file);
  return result;
}

function preflightLocation(root, head, echo) {
  if (!git(root, 'status', '--porcelain=v1', '--untracked-files=normal')) return { cwd: root, inPlace: true };
  const dir = join(tmpdir(), `cot-gate-preflight-${createHash('sha1').update(realpathSync(root)).digest('hex').slice(0, 12)}`);
  let valid = false;
  try { valid = existsSync(dir) && git(dir, 'rev-parse', '--git-common-dir') === git(root, 'rev-parse', '--git-common-dir'); } catch { valid = false; }
  if (valid) git(dir, 'checkout', '-q', '--detach', head);
  else {
    if (existsSync(dir) || (() => { try { return lstatSync(dir).isSymbolicLink(); } catch { return false; } })()) {
      throw new Error(`${dir} exists but is not a worktree of this repository; remove it`);
    }
    try { git(root, 'worktree', 'prune'); } catch { /* best effort */ }
    if (echo) console.log(`[gate] preflight: creating a detached worktree of HEAD at ${dir} (the checkout has untracked files)`);
    git(root, 'worktree', 'add', '-q', '--detach', dir, head);
  }
  return { cwd: dir, inPlace: false };
}

async function runPreflight({ root, head, options, out, echo }) {
  const started = Date.now();
  const row = { step: 'preflight', log: join(out, 'preflight.log') };
  const fail = (error) => ({ ...row, status: 'fail', error, ms: Date.now() - started });
  if (!head) return fail('not a git checkout: the preflight validates a commit');
  if (git(root, 'rev-parse', 'HEAD') !== head) return fail('HEAD moved during the gate; validate the current commit');
  if (git(root, 'status', '--porcelain=v1', '--untracked-files=no')) return fail('tracked files changed or are uncommitted: the gate validated a tree that is not HEAD; commit and rerun');
  let base = options.base;
  if (!base) {
    try { base = git(root, 'merge-base', 'HEAD', 'origin/main'); } catch { return fail('no --base and no merge-base with origin/main'); }
  }
  let location;
  try { location = preflightLocation(root, head, echo); } catch (error) { return fail(error.message); }
  const argv = ['node', 'tools/shared-main-preflight.mjs', `--base=${base}`, `--validated-head=${head}`,
    ...(options.reviewedMain ? [`--reviewed-main=${options.reviewedMain}`] : [])];
  const log = createWriteStream(row.log);
  const result = await runCommand(argv, { cwd: location.cwd, log, echo });
  await new Promise((resolveEnd) => log.end(resolveEnd));
  let preflight = null;
  try {
    const text = readFileSync(row.log, 'utf8');
    preflight = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
  } catch { /* reported through the exit status */ }
  return { ...row, commands: [`${argv.join(' ')} (in ${location.inPlace ? 'place' : location.cwd})`],
    status: result.status === 0 ? 'pass' : 'fail', ms: Date.now() - started, preflight,
    ...(result.status === 0 ? {} : { error: preflight?.error ?? `shared-main-preflight exited ${result.status}` }) };
}

// planner and lockFactory are seams for verification (injected commands, a private lock).
export async function runGate(options, { root, planner = planGate, lockFactory }) {
  // A checkout without Git (an export) still runs its steps; the preflight and --baseline need a commit.
  const head = tryGit(root, 'rev-parse', 'HEAD');
  const dirty = head ? Boolean(tryGit(root, 'status', '--porcelain=v1', '--untracked-files=no')) : null;
  const shortHead = head?.slice(0, 12) ?? 'no-git';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const out = options.out ?? join(tmpdir(), 'cot-gate', `${stamp}-${shortHead.slice(0, 9)}`);
  const echo = !options.quiet;
  const plans = planner(options, { root, out });
  if (options.dryRun) {
    console.log(`[gate] dry run at ${shortHead}${dirty ? ' (uncommitted changes)' : ''}; output would go to ${out}`);
    for (const plan of plans) {
      if (plan.step === 'preflight') console.log(`[gate] preflight: node tools/shared-main-preflight.mjs --base=${options.base ?? '<merge-base HEAD origin/main>'} --validated-head=${head ?? '<no git: the preflight would fail>'}${options.reviewedMain ? ` --reviewed-main=${options.reviewedMain}` : ''} (in place when the checkout is clean, else in a detached worktree of HEAD)`);
      else if (plan.skip) console.log(`[gate] ${plan.step}: skipped (${plan.skip})`);
      else if (plan.error) console.log(`[gate] ${plan.step}: would fail (${plan.error})`);
      else for (const argv of plan.commands) console.log(`[gate] ${plan.step}: ${argv.join(' ')}`);
    }
    if (options.baseline) console.log(`[gate] baseline: receipts red here re-run alone here and on a temporary worktree of ${options.baseline}; inherited only with the same first error${options.strict ? ' (strict: flaky and unstable block too)' : ''}`);
    return 0;
  }
  mkdirSync(out, { recursive: true });
  const summary = { tool: 'tools/gate.mjs', version: 1, head, dirty, out, startedAt: new Date().toISOString(),
    options: { steps: options.steps, receiptArgs: options.receiptArgs, baseline: options.baseline, strict: options.strict }, steps: [] };
  let failed = false;
  try {
    for (const plan of plans) {
      if (failed && !options.keepGoing) { summary.steps.push({ step: plan.step, status: 'not run' }); continue; }
      let row;
      if (plan.skip) row = { step: plan.step, status: 'skip', skip: plan.skip };
      else if (plan.error) row = { step: plan.step, status: 'fail', error: plan.error };
      else if (plan.step === 'preflight') {
        row = await runPreflight({ root, head, options, out, echo });
        summary.preflight = row.preflight ?? null;
        delete row.preflight;
      } else {
        row = await runStep(plan, { root, out, echo });
        if (plan.note) row.note = plan.note;
      }
      if (plan.step === 'receipts' && row.status === 'fail') {
        summary.receipts = receiptSummary(out, root);
        if (!summary.receipts || !summary.receipts.failed.length) {
          row.error = `${row.error}; the runner reported no red receipt (an infrastructure failure)`;
        } else if (options.baseline) {
          try {
            summary.baseline = await compareWithBaseline({ root, ref: options.baseline, failed: summary.receipts.failed, out, strict: options.strict, echo, lockFactory });
            if (!summary.baseline.blocking.length) {
              row.status = 'pass';
              row.note = `${summary.baseline.rows.length} red receipt(s), none blocking against ${options.baseline}`;
              delete row.error;
            } else row.error = `blocking against ${options.baseline}: ${summary.baseline.blocking.join(', ')}`;
          } catch (error) {
            row.error = `baseline comparison failed: ${error.message}`;
          }
        }
      } else if (plan.step === 'receipts') summary.receipts = receiptSummary(out, root);
      summary.steps.push(row);
      if (row.status === 'fail') failed = true;
      if (echo) console.log(`[gate] ${row.step}: ${row.status}${row.error ? ` (${row.error})` : ''}`);
    }
  } finally {
    summary.finishedAt = new Date().toISOString();
    summary.ok = !failed && summary.steps.every((row) => row.status === 'pass' || row.status === 'skip');
    writeFileSync(join(out, 'gate.json'), JSON.stringify(summary, null, 2) + '\n');
    writeFileSync(join(out, 'gate.md'), renderGateMarkdown(summary));
    console.log(`[gate] ${summary.ok ? 'PASS' : 'FAIL'} ${shortHead}: ${join(out, 'gate.md')}`);
  }
  return summary.ok ? 0 : 1;
}

// Like the landing chains it replaces, a gate on a shared host waits up to three hours for the capture
// lock (its receipt runner, its browser receipts and its baseline pairs) instead of the 45 min default.
export const GATE_LOCK_TIMEOUT_MS = 3 * 60 * 60 * 1000;

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let options;
  try { options = parseGateArgs(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 2; }
  if (options) {
    process.env.COT_SHOTS_LOCK_TIMEOUT_MS ||= String(GATE_LOCK_TIMEOUT_MS);
    const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    process.exitCode = await runGate(options, { root });
  }
}
