// The hold CLI (round 2 U38, tools/with-capture-lock.mjs): the shell form of the one hold wrapper on a normal ticket. The
// audit's lane named it and it did not exist; the lane-hold helpers kept outside the repository took the FIFO and ran a
// probe under COT_LANE_HOLD=1 instead, and tools/media-r5/with-capture-lock.mjs queued at the media lane's back-dated
// stamp. Here, on private lock directories (no machine lock is touched):
// - the command runs inside one hold with the hold's token, so a tool under it that takes the lock nests (twice: several
//   probe steps under one ticket), in the class the CLI names; its exit status comes back and the lock goes after it;
// - a wait that runs out exits LOCK_WAIT_TIMEOUT_EXIT (not the runner's STARVED 75), leaving the holder alone;
// - usage errors exit 2 before any lock is touched; the media wrapper is this command at its ticket.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock, LOCK_WAIT_TIMEOUT_EXIT } from './capture-lock.mjs';
import { SELFTEST_STARVED_EXIT } from './selftest-verdict.mjs';
import { holdCommand, parseHoldArgs } from './with-capture-lock.mjs';

// the lock reads these by name; this receipt pins the CLI's own semantics
for (const name of ['COT_SHOTS_HELD', 'COT_LANE_HOLD', 'COT_SHOTS_LOCK_CLASS', 'COT_SHOTS_LOCK_TIMEOUT_MS', 'COT_CAPTURE_PRIORITY']) delete process.env[name];
const CLI = fileURLToPath(new URL('./with-capture-lock.mjs', import.meta.url));
const LOCK = new URL('./capture-lock.mjs', import.meta.url).href;
const root = mkdtempSync(join(tmpdir(), 'cot-with-capture-lock-'));
const quiet = () => {};
try {
  // ---- the command line ------------------------------------------------------------------------------------------------
  assert.deepEqual(parseHoldArgs(['--', 'node', 'tools/probe.mjs', '--x=1']), { command: 'node', args: ['tools/probe.mjs', '--x=1'], lockClass: null,
    waitMin: 240, place: null, label: 'with-capture-lock', holdCapMinutes: null, holdCapReason: null }, 'the defaults');
  const full = parseHoldArgs(['--lock-class=render', '--wait-min=30', '--place=lane-269-bands', '--label=bands', '--hold-cap-min=40',
    '--hold-cap-reason=one size batch', '--', 'zsh', 'steps.zsh']);
  assert.deepEqual([full.lockClass, full.waitMin, full.place, full.label, full.holdCapMinutes, full.holdCapReason, full.command, full.args],
    ['render', 30, 'lane-269-bands', 'bands', 40, 'one size batch', 'zsh', ['steps.zsh']]);
  for (const bad of [[], ['node', 'x.mjs'], ['--'], ['--lock-class=fast', '--', 'node'], ['--wait-min=0', '--', 'node'],
    ['--hold-cap-reason=why', '--', 'node'], ['--bogus', '--', 'node']]) {
    assert.throws(() => parseHoldArgs(bad), (error) => error.usage === true && /usage: node tools\/with-capture-lock\.mjs/.test(error.message), JSON.stringify(bad));
  }
  for (const bad of [[], ['--lock-class=fast', '--', process.execPath, '-e', '0']]) {
    const usage = spawnSync(process.execPath, [CLI, ...bad], { encoding: 'utf8' });
    assert.equal(usage.status, 2, `a usage error exits 2: ${usage.stderr}`);
  }

  // ---- one hold for the command: its tools nest (in the class named), its status comes back, the lock goes after it -------
  {
    const dirs = { lockDir: join(root, 'held.lock'), queueDir: join(root, 'held.queue') };
    // a command that exits 5 under the hold
    const steps = 'process.exit(5)';
    const lines = [];
    const status = await holdCommand({ command: process.execPath, args: ['-e', steps], waitMin: 0.1 },
      { lock: createCaptureLock({ ...dirs, log: quiet }), log: (line) => lines.push(line), stdio: 'ignore' });
    assert.equal(status, 5, `the command's status comes back: ${lines.join('\n')}`);
    assert.equal(existsSync(dirs.lockDir), false, 'the lock is released once the command ends');
    assert.ok(lines.some((line) => /waiting for the capture lock/.test(line)) && lines.some((line) => /ended \(exit 5\)/.test(line)), lines.join('\n'));
  }
  {
    // two steps that each take the lock themselves, as a lane's probe chain does: the token and what each step saw, written
    // by the command
    const dirs = { lockDir: join(root, 'steps.lock'), queueDir: join(root, 'steps.queue') };
    const out = join(root, 'steps.json');
    const steps = `import { writeFileSync } from 'node:fs';
      import { createCaptureLock } from ${JSON.stringify(LOCK)};
      const seen = [];
      for (let step = 0; step < 2; step++) {
        const lock = createCaptureLock({ ...${JSON.stringify(dirs)}, log: () => {} });
        const t0 = Date.now();
        await lock.acquire(1500);
        seen.push({ nested: lock.nested, heldClass: lock.heldClass, ms: Date.now() - t0 });
        lock.release();
      }
      writeFileSync(${JSON.stringify(out)}, JSON.stringify({ token: process.env.COT_SHOTS_HELD ?? null, seen }));`;
    const status = await holdCommand({ command: process.execPath, args: ['--input-type=module', '-e', steps], lockClass: 'render', waitMin: 0.1 },
      { lock: createCaptureLock({ ...dirs, log: quiet }), log: quiet, stdio: 'ignore' });
    assert.equal(status, 0);
    const result = JSON.parse(readFileSync(out, 'utf8'));
    assert.match(result.token ?? '', new RegExp(`^${process.pid}:[0-9a-f]{24}$`), 'the command carries the hold\'s token');
    assert.deepEqual(result.seen.map(({ nested, heldClass }) => [nested, heldClass]), [[true, 'render'], [true, 'render']],
      'both steps nest in the one hold, in the class the CLI named');
    assert.ok(result.seen.every(({ ms }) => ms < 1_000), `at once, not behind their own parent: ${JSON.stringify(result.seen)}`);
  }

  // ---- a wait that runs out: its own status, and the holder keeps its hold -----------------------------------------------
  {
    const dirs = { lockDir: join(root, 'busy.lock'), queueDir: join(root, 'busy.queue'), log: quiet };
    const holder = createCaptureLock(dirs);
    await holder.acquire(2_000);
    const lines = [];
    const status = await holdCommand({ command: process.execPath, args: ['-e', 'process.exit(0)'], waitMin: 0.005 },
      { lock: createCaptureLock(dirs), log: (line) => lines.push(line), stdio: 'ignore' });
    assert.notEqual(status, SELFTEST_STARVED_EXIT, 'a wait that runs out is not the runner\'s STARVED');
    assert.equal(status, LOCK_WAIT_TIMEOUT_EXIT, `it exits the hold CLIs' wait-timeout status: ${lines.join('\n')}`);
    assert.ok(lines.some((line) => /not free after 0\.005 min: giving up/.test(line)), lines.join('\n'));
    assert.ok(holder.refresh(), 'the holder still holds');
    holder.release();
  }

  // ---- the media wrapper is this command at the media lane's ticket ------------------------------------------------------
  {
    const media = readFileSync(new URL('./media-r5/with-capture-lock.mjs', import.meta.url), 'utf8');
    assert.match(media, /import \{ holdCommand \} from '\.\.\/with-capture-lock\.mjs'/, 'the media wrapper runs the hold CLI');
    assert.match(media, /ticket: ticketAt\(1791397979999\)/, 'at its back-dated place');
    assert.doesNotMatch(media, /withCaptureHold\(|\.acquire\(|spawn\(/, 'with no hold or child of its own');
  }
  console.log('with-capture-lock.selftest: one normal-ticket hold per command (its tools nest, twice, in the class named; its status back; the lock after it), a wait that runs out exits 77, usage exits 2, and the media wrapper is this command at its ticket');
} finally {
  rmSync(root, { recursive: true, force: true });
}
