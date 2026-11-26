// tools/lane-probe.sh under bash and zsh (practice audit 2026-11-26, mechanism 10): a probe that errors counts as busy
// or over the gate, every wait ends at its deadline with polls at least 60 s apart, and a retry stops after N failures.
// Stubbed sysctl and lsof stand in for the machine; a fake clock and sleep stand in for time. The control is the
// pre-audit lane helper (`lsof ... || return 0`), which reads an lsof failure as a free port.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROBE = resolve(dirname(fileURLToPath(import.meta.url)), 'lane-probe.sh');
const which = (name) => { try { return execFileSync('/bin/sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim() || null; } catch { return null; } };
const shells = ['bash', 'zsh'].map((name) => [name, which(name)]).filter(([, path]) => path);
assert.ok(shells.some(([name]) => name === 'bash'), 'bash runs the probe (zsh too where installed)');

const scratch = mkdtempSync(join(tmpdir(), 'cot-lane-probe-'));
try {
  // a bin directory with only what the probe needs, plus stubs for the machine's probes
  const bin = join(scratch, 'bin');
  mkdirSync(bin);
  for (const tool of ['awk', 'grep', 'date', 'head', 'cat', 'sleep']) symlinkSync(which(tool), join(bin, tool));
  const stub = (name, body) => { writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`); chmodSync(join(bin, name), 0o755); };
  stub('sysctl', 'case "$FAKE_LOAD" in fail) exit 1;; *) echo "{ $FAKE_LOAD 2.00 1.00 }";; esac');
  stub('lsof', [
    'case "$FAKE_LSOF" in',
    '  free) exit 1;;',
    '  busy) echo 4242; exit 0;;',
    '  error) echo "lsof: unable to open: Too many open files in system" >&2; exit 1;;',
    'esac',
  ].join('\n'));
  const clock = join(scratch, 'clock'), slept = join(scratch, 'slept'), calls = join(scratch, 'calls');
  stub('fake-clock', `cat ${clock}`);
  stub('fake-sleep', `echo "$1" >> ${slept}; echo $(( $(cat ${clock}) + $1 )) > ${clock}`);
  // succeeds on the Nth call (FAKE_AFTER), counting in a file
  stub('flaky', `n=$(( $(cat ${calls} 2>/dev/null || echo 0) + 1 )); echo $n > ${calls}; [ "$n" -ge "$FAKE_AFTER" ]`);
  const noLsofBin = join(scratch, 'bin-no-lsof');
  mkdirSync(noLsofBin);
  for (const tool of ['awk', 'grep', 'date', 'head', 'cat', 'sysctl']) symlinkSync(tool === 'sysctl' ? join(bin, 'sysctl') : which(tool), join(noLsofBin, tool));

  for (const [shell, shellPath] of shells) {
    const run = (script, env = {}, path = bin) => {
      writeFileSync(clock, '1000\n');
      rmSync(slept, { force: true });
      rmSync(calls, { force: true });
      const result = spawnSync(shellPath, ['-c', `. ${PROBE}\n${script}`], { encoding: 'utf8',
        env: { PATH: path, HOME: scratch, COT_PROBE_LOADAVG: join(scratch, 'no-loadavg'), COT_PROBE_CLOCK: 'fake-clock',
          COT_PROBE_SLEEP: 'fake-sleep', ...env } });
      let sleeps = [];
      try { sleeps = readFileSync(slept, 'utf8').trim().split('\n').filter(Boolean).map(Number); } catch { /* none */ }
      return { out: result.stdout.trim(), err: result.stderr, status: result.status, sleeps };
    };
    const label = (what) => `${shell}: ${what}`;

    // the load gate
    assert.equal(run('cot_load1', { FAKE_LOAD: '3.50' }).out, '3.50', label('the 1-minute load'));
    assert.equal(run('cot_load_under 10', { FAKE_LOAD: '3.50' }).status, 0, label('under the gate'));
    assert.equal(run('cot_load_over 3', { FAKE_LOAD: '3.50' }).status, 0, label('over the gate'));
    assert.equal(run('cot_load_over 12', { FAKE_LOAD: '12.00' }).status, 1, label('at the gate is not over'));
    const unreadable = run('cot_load1', { FAKE_LOAD: 'fail' });
    assert.deepEqual([unreadable.out, unreadable.status], ['999', 1], label('an unreadable load prints 999 and fails'));
    assert.equal(run('cot_load_over 50', { FAKE_LOAD: 'fail' }).status, 0, label('an unreadable load counts as over'));
    assert.equal(run('cot_load_under 50', { FAKE_LOAD: 'fail' }).status, 1, label('and never as under'));
    assert.equal(run('cot_load_under 50', { FAKE_LOAD: 'x.y' }).status, 1, label('a garbled load counts as over'));
    assert.equal(run('cot_load_over abc', { FAKE_LOAD: '1.00' }).status, 0, label('a bad gate counts as over'));
    writeFileSync(join(scratch, 'loadavg'), '7.25 3.00 1.00 1/200 99\n');
    assert.equal(run('cot_load1', { FAKE_LOAD: 'fail', COT_PROBE_LOADAVG: join(scratch, 'loadavg') }).out, '7.25', label('Linux: /proc/loadavg'));

    // the port probe
    assert.equal(run('cot_port_free 4271', { FAKE_LSOF: 'free' }).status, 0, label('no listener: free'));
    assert.equal(run('cot_port_busy 4271', { FAKE_LSOF: 'busy' }).status, 0, label('a listener: busy'));
    const failed = run('cot_port_busy 4271', { FAKE_LSOF: 'error' });
    assert.equal(failed.status, 0, label('an lsof failure (ENFILE) counts as busy'));
    assert.match(failed.err, /lsof failed .*counts as busy/, label('and says so'));
    assert.equal(run('cot_port_free 4271', {}, noLsofBin).status, 1, label('no lsof: never free'));
    assert.equal(run('cot_port_free 42x', { FAKE_LSOF: 'free' }).status, 1, label('a bad port: never free'));
    // the control: the pre-audit lane helper reads the same lsof failure as a free port
    const legacy = 'portfree() { for i in 1 2; do lsof -nP -iTCP:$1 -sTCP:LISTEN >/dev/null 2>&1 || return 0; sleep 0; done; return 1; }';
    assert.equal(run(`${legacy}\nportfree 4271`, { FAKE_LSOF: 'error' }).status, 0, label('control: the old portfree fails open'));

    // cot_wait: a deadline, polls at least 60 s apart with backoff, a warning for a /tmp target
    const never = run(`cot_wait demo 1000 cot_file_has DONE ${join(scratch, 'never')}`);
    assert.equal(never.status, 124, label('a wait that never finishes ends at its deadline'));
    assert.ok(never.sleeps.length >= 2 && never.sleeps.every((s) => s >= 60 && s <= 600), label(`polls 60-600 s apart: ${never.sleeps}`));
    assert.ok(never.sleeps.reduce((a, b) => a + b, 0) <= 1000, label('never sleeps past the deadline'));
    assert.ok(never.sleeps[1] > never.sleeps[0], label('the interval backs off'));
    assert.match(never.err, /gave up after \d+s and \d+ polls \(deadline 1000s\)/, label('it says it gave up'));
    const third = run('cot_wait demo 3600 flaky', { FAKE_AFTER: '3' });
    assert.deepEqual([third.status, third.sleeps.length], [0, 2], label('done on the third poll, after two sleeps'));
    const done = join(scratch, 'done.output');
    writeFileSync(done, 'x\nLIMITS-DONE\n');
    assert.deepEqual([run(`cot_wait demo 600 cot_file_has LIMITS-DONE ${done}`).status], [0], label('a file that holds the text'));
    assert.match(run('cot_wait demo 120 cot_file_has X /private/tmp/claude-501/x/tasks/b.output').err, /a reboot deletes/,
      label('a /tmp target is called out'));
    assert.equal(run('cot_wait demo soon true').status, 2, label('a bad deadline is a bad call'));
    assert.equal(run('cot_wait demo 60').status, 2, label('no command is a bad call'));
    const capped = run(`cot_wait demo 100000 cot_file_has DONE ${join(scratch, 'never')}`, { COT_PROBE_MAX_S: '30' });
    assert.ok(capped.sleeps.every((s) => s >= 60 && s <= 600), label('a cap under the floor falls back; the floor holds'));

    // cot_retry: stops after N failures in a row, backs off between them, survives a caller's set -e
    const stopped = run('cot_retry 3 chain false');
    assert.deepEqual([stopped.status, stopped.sleeps.length], [79, 2], label('three failures in a row stop the chain'));
    assert.ok(stopped.sleeps.every((s) => s >= 60), label('at least 60 s between retries'));
    assert.match(stopped.err, /STOPPED after 3 failures in a row/, label('it says it stopped'));
    const recovered = run('set -e\ncot_retry 3 chain flaky\necho recovered', { FAKE_AFTER: '2' });
    assert.deepEqual([recovered.status, recovered.out, recovered.sleeps.length], [0, 'recovered', 1], label('a failed try under set -e retries'));
    assert.equal(run('cot_retry 0 chain true').status, 2, label('no failure budget is a bad call'));
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`lane-probe: ${shells.map(([name]) => name).join(' and ')}: load and port probes fail closed (the old portfree fails open), waits end at their deadline with 60 s+ backoff, retries stop after N failures`);
