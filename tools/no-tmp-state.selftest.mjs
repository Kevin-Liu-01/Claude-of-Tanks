// tools/no-tmp-state.mjs: no log, receipt or store a later run reads lives in /tmp (practice audit 2026-11-26,
// mechanism 10: the 00:35 reboot wiped the capture lock's log and the receipt cache). The repository's tools are clean,
// every exception still matches a line, and planted literals (and the pre-audit capture-lock line itself) fail.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALLOWED, laneScriptFiles, repoToolFiles, scanLaneText, scanText, staleAllowed } from './no-tmp-state.mjs';

// this checkout: no finding, no stale exception, and every exception gives its reason
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = repoToolFiles(REPO_ROOT);
assert.ok(files.includes('tools/capture-lock.mjs') && !files.some((file) => file.endsWith('.selftest.mjs')),
  'the scan reads the tools and skips receipts');
const texts = new Map(files.map((file) => [file, readFileSync(join(REPO_ROOT, file), 'utf8')]));
const findings = files.flatMap((file) => scanText(file, texts.get(file)));
assert.deepEqual(findings.map((finding) => `${finding.file}:${finding.line} ${finding.rule}`), [], 'no /tmp log, receipt or store in tools/');
assert.deepEqual(staleAllowed(texts), [], 'every exception matches a line');
for (const entry of ALLOWED) assert.ok(entry.why.length >= 10, `${entry.file}: an exception says why /tmp is right`);

// planted literals: each rule fires, scratch and prose do not
const flagged = (line, file = 'tools/fixture.mjs') => scanText(file, `${line}\n`).map((finding) => finding.rule);
assert.deepEqual(flagged("const LOG = '/tmp/cot-planted.log';"), ['persisted'], 'a /tmp log');
assert.deepEqual(flagged("const receiptDir = join(tmpdir(), `cot-receipts-${process.pid}`);"), ['persisted'],
  'a receipt is persisted even under a per-run name');
assert.deepEqual(flagged("const out = resolve(option('out', '/private/tmp/cot-planted.png'));"), ['tmp-path'], 'a fixed /tmp output');
assert.deepEqual(flagged("const store = join(tmpdir(), 'cot-planted-store');"), ['tmpdir'], 'a fixed store under tmpdir()');
assert.deepEqual(flagged("const STATE = `/var/folders/x/T/cot-state`;"), ['tmp-path'], '$TMPDIR spelled out');
assert.deepEqual(flagged("const cacheDir = resolve('/tmp', `cot-vite-${process.pid}`);"), [], 'per-run scratch (process.pid)');
assert.deepEqual(flagged("const dir = mkdtempSync(join(tmpdir(), 'cot-fixture-'));"), [], 'per-run scratch (mkdtemp)');
assert.deepEqual(flagged("const server = await createServer({ cacheDir: join(tmpdir(), `cot-v-${process.pid}`), logLevel: 'error' });"), [],
  'logLevel names no log');
assert.deepEqual(flagged("console.log(mkdtempSync(join(tmpdir(), 'cot-x-')));"), [], 'console.log is not a .log file');
assert.deepEqual(flagged("// writes /tmp/cot-notes.log"), [], 'a comment is prose');
assert.deepEqual(flagged("const LOG = '/tmp/cot-planted.log'; // moved soon"), ['persisted'], 'a trailing comment does not hide the code');
// the reverted fix: capture-lock.mjs with its pre-audit log line fails; an exception binds to its own file only
const lock = texts.get('tools/capture-lock.mjs');
const reverted = lock.replace(/const DEFAULT_LOG_FILE = [^\n]+/, "const DEFAULT_LOG_FILE = '/tmp/cot-shots.log';");
assert.notEqual(reverted, lock, 'the control finds the line it reverts');
assert.deepEqual(scanText('tools/capture-lock.mjs', reverted).map((finding) => finding.rule), ['persisted'],
  'the pre-audit capture-lock log line fails the scan');
assert.deepEqual(flagged("const LOCK = '/tmp/cot-shots.lock';", 'tools/other.mjs'), ['tmp-path'], 'an exception is per file');
assert.deepEqual(staleAllowed(new Map([['tools/capture-lock.mjs', '']]), ALLOWED.slice(0, 1)).length, 1, 'a moved literal leaves a stale exception');

// lane scripts (outside the repository): reported, a wait on a /tmp path called out
const lanes = mkdtempSync(join(tmpdir(), 'cot-no-tmp-state-'));
try {
  mkdirSync(join(lanes, 'demo-278-notes', 'tools'), { recursive: true });
  mkdirSync(join(lanes, 'demo-278'));
  writeFileSync(join(lanes, 'wait.zsh'), "until grep -q DONE /private/tmp/claude-501/x/tasks/b.output 2>/dev/null; do sleep 20; done\n");
  writeFileSync(join(lanes, 'demo-278-notes', 'tools', 'run.sh'), "# logs to /tmp/a.log\nnode x.mjs > /tmp/cot-run.log 2>&1\nN=$HOME/cot-lanes/demo-278-notes\n");
  writeFileSync(join(lanes, 'demo-278', 'ignored.sh'), "echo > /tmp/x\n");
  const found = laneScriptFiles(lanes);
  assert.deepEqual(found.map((file) => file.slice(lanes.length + 1)), ['demo-278-notes/tools/run.sh', 'wait.zsh'],
    'top-level lane scripts and *-notes scripts; worktrees are the repository scan\'s');
  const report = found.flatMap((file) => scanLaneText(file, readFileSync(file, 'utf8')));
  assert.deepEqual(report.map((row) => `${row.file.slice(lanes.length + 1)}:${row.line} ${row.rule}`),
    ['demo-278-notes/tools/run.sh:2 tmp-path', 'wait.zsh:1 waits-on-tmp']);
  assert.deepEqual(laneScriptFiles(join(lanes, 'absent')), [], 'no lanes directory (CI): nothing to report');
} finally {
  rmSync(lanes, { recursive: true, force: true });
}
console.log(`no-tmp-state: ${files.length} tool files clean, ${ALLOWED.length} exceptions with reasons, planted and reverted literals fail, lane scripts reported`);
