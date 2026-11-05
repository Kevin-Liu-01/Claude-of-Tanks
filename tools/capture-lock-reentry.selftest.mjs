// The capture lock's acquire as one owner of its hold (2026-11-02 audit S4). An instance holds at most one hold and runs
// at most one acquire: a second acquire on an instance that holds (or is still queued) is refused at once, by name. On
// the base a second acquire overwrote `hold`: on a render slot the first slot leaked until the process exited (the group
// directory outlived every release), and on an exclusive hold it waited on its own live pid until its timeout.
// Nested holds (COT_SHOTS_HELD): a parent that holds the lock hands its children a token (nestedEnv()); a child's acquire
// that finds the token naming the live owner record at its lock directory nests inside the parent's hold at once (no
// ticket, no claim; refresh, release and checkpoint leave the parent's hold alone). A stale or foreign token queues as
// usual. On the base a child of a holder queued behind its own parent's live pid until its timeout (45 min to 3 h).
// COT_LANE_HOLD=1 with no token (round 3): a child nests only in a live hold an ancestor of it owns (a lane-hold helper's
// probe, parent or grandparent); a leftover export and this process's own other holds queue. On the lane's round 2 the flag
// was ignored and a helper's probe queued behind its own parent's hold until its timeout.
// A timing child never nests in a render hold (round 2 U38): it is refused by name; render and default-classed children nest.
// Every hold is private (a temporary lock and queue directory); no machine lock is touched.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCapturedCommand } from './capture-command.mjs';
import * as captureLock from './capture-lock.mjs';
import { createCaptureLock } from './capture-lock.mjs';

// the lock reads these by name; this receipt pins its own semantics, so it owns all of them (as capture-lock.selftest)
const LOCK_ENV = [...new Set([...readFileSync(fileURLToPath(new URL('./capture-lock.mjs', import.meta.url)), 'utf8')
  .matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((match) => match[1]))].sort();
for (const name of LOCK_ENV) delete process.env[name];

const root = mkdtempSync(join(tmpdir(), 'cot-capture-reentry-'));
const quiet = () => {};
const rig = (name, extra = {}) => ({ lockDir: join(root, `${name}.lock`), queueDir: join(root, `${name}.queue`), log: quiet, ...extra });

try {
  // ---- an exclusive hold: a second acquire is refused at once, and the hold is unchanged ------------------------------
  {
    const dirs = rig('exclusive');
    const lock = createCaptureLock(dirs);
    await lock.acquire(2_000);
    const held = lock.heldTicket;
    const started = Date.now();
    await assert.rejects(lock.acquire(600), /already holds/, 'a second acquire on a holding instance is refused, not queued behind its own pid');
    assert.ok(Date.now() - started < 450, `refused at once (${Date.now() - started} ms), not after its timeout`);
    assert.equal(lock.heldTicket, held, 'the refused acquire leaves the hold as it was');
    assert.equal(lock.refresh(), true, 'the hold still refreshes');
    assert.equal(lock.release(), true);
    assert.equal(existsSync(dirs.lockDir), false, 'and releases');
    await lock.acquire(2_000);
    assert.equal(lock.release(), true, 'a released instance acquires again');
  }

  // ---- a render slot: a second acquire is refused, so no slot leaks past the release ----------------------------------
  {
    const dirs = rig('render');
    const lock = createCaptureLock(dirs);
    await lock.acquire(2_000, { lockClass: 'render' });
    await assert.rejects(lock.acquire(600, { lockClass: 'render' }), /already holds/, 'a second render acquire is refused');
    assert.deepEqual(readdirSync(dirs.lockDir).filter((name) => name.endsWith('.holder')), ['slot-0.holder'], 'one slot, its own');
    assert.equal(lock.release(), true);
    assert.equal(existsSync(dirs.lockDir), false, 'the group leaves with its one member: no slot outlives the release');
  }

  // ---- an instance still queued: a second acquire is refused; the first goes on and holds ----------------------------
  {
    const dirs = rig('queued');
    const owner = createCaptureLock(dirs), waiter = createCaptureLock(dirs);
    await owner.acquire(2_000);
    const first = waiter.acquire(5_000);
    await new Promise((done) => setTimeout(done, 100));
    await assert.rejects(waiter.acquire(600), /already queued/, 'a second acquire while the first waits is refused');
    owner.release();
    await first;
    assert.ok(waiter.heldTicket, 'the first acquire holds once the owner leaves');
    assert.equal(waiter.release(), true);
  }

  // ---- checkpoint's own release-and-requeue is not a re-entry ---------------------------------------------------------
  {
    const dirs = rig('checkpoint', { holdCapMs: 50 });
    const lock = createCaptureLock(dirs), other = createCaptureLock(dirs);
    await lock.acquire(2_000);
    await new Promise((done) => setTimeout(done, 80));
    const waiting = other.acquire(5_000).then(() => { other.release(); });
    await new Promise((done) => setTimeout(done, 300)); // the other ticket is in the queue
    const result = await lock.checkpoint({ timeoutMs: 5_000 });
    assert.equal(result.yielded, true, 'past the cap with a waiter, the checkpoint yields and holds again');
    await waiting;
    assert.ok(lock.heldTicket, 'holding again after the yield');
    assert.equal(lock.release(), true);
  }

  // ---- nested holds: a child under its parent's token nests at once; a foreign or stale token queues ------------------
  {
    const dirs = rig('nested');
    const parent = createCaptureLock(dirs);
    assert.deepEqual(parent.nestedEnv(), {}, 'no hold: no token to hand down');
    await parent.acquire(2_000);
    const env = parent.nestedEnv();
    assert.match(env.COT_SHOTS_HELD ?? '', new RegExp(`^${process.pid}:[0-9a-f]{24}$`), 'the token names the holder and its hold');
    // a child process acquires the same lock directory under the token: it holds at once and leaves the parent's hold
    const child = (extraEnv, timeoutMs) => new Promise((done) => {
      const script = `import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
        const lock = createCaptureLock({ lockDir: ${JSON.stringify(dirs.lockDir)}, queueDir: ${JSON.stringify(dirs.queueDir)}, log: () => {} });
        const t0 = Date.now();
        try {
          const prepared = await lock.acquire(${timeoutMs}, { prepare: async () => 'warm' });
          const ms = Date.now() - t0, nested = lock.nested, env = lock.nestedEnv().COT_SHOTS_HELD ?? null;
          const refreshed = lock.refresh(), cp = await lock.checkpoint(), released = lock.release();
          console.log(JSON.stringify({ ok: true, ms, nested, prepared, refreshed, cp, released, env }));
        } catch (error) { console.log(JSON.stringify({ ok: false, ms: Date.now() - t0, error: error.message })); }`;
      const proc = spawn(process.execPath, ['--input-type=module', '-e', script], {
        env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      proc.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
      proc.once('close', () => done(JSON.parse(out.trim().split('\n').at(-1))));
    });
    const nested = await child(env, 2_000);
    assert.equal(nested.ok, true, `the child holds under its parent's token: ${JSON.stringify(nested)}`);
    assert.ok(nested.ms < 1_500, `at once (${nested.ms} ms), not behind its parent's live pid`);
    assert.equal(nested.nested, true);
    assert.equal(nested.prepared, 'warm', 'its prepare still runs and its result comes back');
    assert.deepEqual([nested.refreshed, nested.cp.yielded, nested.released], [true, false, false],
      'refresh reports the parent hold standing; checkpoint never yields the parent\'s hold; release leaves it');
    assert.equal(nested.env, env.COT_SHOTS_HELD, 'a nested child hands the same token on to its own children');
    assert.ok(existsSync(dirs.lockDir) && parent.refresh(), 'the parent still holds after the nested child released');
    // a stale token (no such hold: another nonce) or a foreign directory's token queues as usual: here it times out
    const stale = await child({ COT_SHOTS_HELD: `${process.pid}:${'0'.repeat(24)}` }, 700);
    assert.deepEqual([stale.ok, stale.error], [false, 'cot-shots lock timeout'], 'a token naming no live hold here waits in the queue');
    const other = createCaptureLock(rig('nested-other'));
    await other.acquire(2_000);
    const foreign = await child(other.nestedEnv(), 700);
    assert.deepEqual([foreign.ok, foreign.error], [false, 'cot-shots lock timeout'], 'another lock directory\'s token does not open this one');
    other.release();
    // a dead parent's token: the hold is gone once the parent releases, so the child queues and takes the free lock
    parent.release();
    const after = await child(env, 2_000);
    assert.deepEqual([after.ok, after.nested], [true, false], 'after the parent released, the token is stale: the child holds on its own');
  }
  // ---- (round 2 U38) a timing child never nests in a render hold ----------------------------------------------------------
  // A child nested whatever its own class, so a timing (exclusive) probe under a render parent shared the GPU with the
  // render group's other member: the exclusivity the class protects. It is refused at once, by name (queueing would wait
  // behind its own parent). A render child, and a child classed by default (it named nothing), nest as before.
  {
    const dirs = rig('nested-class');
    const parent = createCaptureLock(dirs);
    await parent.acquire(2_000, { lockClass: 'render' });
    const env = parent.nestedEnv();
    const child = (options) => new Promise((done) => {
      const script = `import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
        const lock = createCaptureLock({ lockDir: ${JSON.stringify(dirs.lockDir)}, queueDir: ${JSON.stringify(dirs.queueDir)}, log: () => {} });
        const t0 = Date.now();
        try {
          await lock.acquire(700, ${JSON.stringify(options)});
          const nested = lock.nested, heldClass = lock.heldClass;
          lock.release();
          console.log(JSON.stringify({ ok: true, ms: Date.now() - t0, nested, heldClass }));
        } catch (error) { console.log(JSON.stringify({ ok: false, ms: Date.now() - t0, error: error.message })); }`;
      const proc = spawn(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      proc.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
      proc.once('close', () => done(JSON.parse(out.trim().split('\n').at(-1))));
    });
    for (const [label, options] of [['lockClass timing', { lockClass: 'timing' }], ['a timing script', { command: 'node tools/frame-perf-probe.mjs' }]]) {
      const timing = await child(options);
      assert.equal(timing.ok, false, `${label}: a timing child does not nest in a render hold: ${JSON.stringify(timing)}`);
      assert.match(timing.error, /cannot nest in the render hold of pid \d+/, `${label}: refused by name`);
      assert.ok(timing.ms < 600, `${label}: at once (${timing.ms} ms), not after a wait behind its own parent`);
    }
    for (const [label, options] of [['a render child', { lockClass: 'render' }], ['a child classed by default', {}]]) {
      const nested = await child(options);
      assert.deepEqual([nested.ok, nested.nested, nested.heldClass], [true, true, 'render'], `${label} nests in the render hold: ${JSON.stringify(nested)}`);
    }
    parent.release();
    // under a timing parent a timing child nests, as before
    await parent.acquire(2_000, { lockClass: 'timing' });
    const exclusive = await new Promise((done) => {
      const script = `import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
        const lock = createCaptureLock({ lockDir: ${JSON.stringify(dirs.lockDir)}, queueDir: ${JSON.stringify(dirs.queueDir)}, log: () => {} });
        try { await lock.acquire(700, { lockClass: 'timing' }); console.log(JSON.stringify({ ok: true, nested: lock.nested })); lock.release(); }
        catch (error) { console.log(JSON.stringify({ ok: false, error: error.message })); }`;
      const proc = spawn(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, ...parent.nestedEnv() }, stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      proc.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
      proc.once('close', () => done(JSON.parse(out.trim().split('\n').at(-1))));
    });
    assert.deepEqual([exclusive.ok, exclusive.nested], [true, true], `a timing child nests in a timing hold: ${JSON.stringify(exclusive)}`);
    parent.release();
  }
  // ---- (round 2 Q20) the ancestor chain from one process table: parent first, stops at pid 1, a gap or a cycle -----------
  {
    const { ancestorChain, parsePsParents } = captureLock;
    assert.equal(typeof ancestorChain, 'function', 'the walk reads one table (ancestorChain), not one ps per level');
    const table = parsePsParents('  PID  PPID\n    1     0\n   10     1\n   20    10\n   30    20\n   40    40\n  bad line\n');
    assert.deepEqual([...ancestorChain(table, 30)], [30, 20, 10], 'up to pid 1, which is never an ancestor that counts');
    assert.deepEqual([...ancestorChain(table, 99)], [99], 'a pid the table lacks ends the walk after it');
    assert.deepEqual([...ancestorChain(table, 40)], [40], 'a cycle ends it');
    assert.deepEqual([...ancestorChain(new Map(), 1)], [], 'launchd/init alone is no ancestor');
  }
  // ---- COT_LANE_HOLD=1 with no token: nests only in a live hold an ancestor of this process owns (round 3) ------------
  // Lane-hold helpers outside the repo (fifo-hold.mjs: take the FIFO, then run a probe with COT_LANE_HOLD=1 and no token)
  // waited behind their own parent once round 2 ignored the flag. It is honoured again, checked: the live owner record
  // (or a live render slot) must belong to a parent, grandparent or further ancestor. A leftover export (no ancestor holds:
  // someone else's hold, or a free lock) and this process's own other holds (tank-release-check runs several) queue.
  {
    const laneChild = (dirs, timeoutMs, { viaShell = false } = {}) => new Promise((done) => {
      const script = `import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
        const notes = [];
        const lock = createCaptureLock({ lockDir: ${JSON.stringify(dirs.lockDir)}, queueDir: ${JSON.stringify(dirs.queueDir)}, log: (line) => notes.push(line) });
        const t0 = Date.now();
        try {
          await lock.acquire(${timeoutMs});
          const ms = Date.now() - t0, nested = lock.nested, heldClass = lock.heldClass, env = lock.nestedEnv().COT_SHOTS_HELD ?? null;
          const refreshed = lock.refresh(), released = lock.release();
          console.log(JSON.stringify({ ok: true, ms, nested, heldClass, env, refreshed, released, notes, ppid: process.ppid }));
        } catch (error) { console.log(JSON.stringify({ ok: false, ms: Date.now() - t0, error: error.message, notes })); }`;
      const args = ['--input-type=module', '-e', script];
      // through a shell that stays (a command after the node one, so it is not exec'd): the holder is a grandparent
      const proc = viaShell ? spawn('/bin/sh', ['-c', '"$0" "$@"; exit $?', process.execPath, ...args], { env: { ...process.env, COT_LANE_HOLD: '1' }, stdio: ['ignore', 'pipe', 'inherit'] })
        : spawn(process.execPath, args, { env: { ...process.env, COT_LANE_HOLD: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      proc.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
      proc.once('close', () => done(JSON.parse(out.trim().split('\n').at(-1))));
    });
    const dirs = rig('lane');
    const parent = createCaptureLock(dirs);
    await parent.acquire(2_000);
    const child = await laneChild(dirs, 2_000);
    assert.equal(child.ok, true, `a child under its parent's hold nests on COT_LANE_HOLD=1: ${JSON.stringify(child)}`);
    assert.ok(child.ms < 1_500, `at once (${child.ms} ms), not behind its parent's live pid`);
    assert.deepEqual([child.nested, child.heldClass, child.refreshed, child.released], [true, 'timing', true, false],
      'nested in the parent\'s class; refresh reports it standing; release leaves it');
    assert.equal(child.env, parent.nestedEnv().COT_SHOTS_HELD, 'and it hands the parent\'s token on to its own children');
    assert.ok(child.notes.some((line) => line.includes(`hold of pid ${process.pid}`) && line.includes('an ancestor')), child.notes.join('\n'));
    const grandchild = await laneChild(dirs, 2_000, { viaShell: true });
    assert.deepEqual([grandchild.ok, grandchild.nested], [true, true], `a grandchild (under a shell) nests too: ${JSON.stringify(grandchild)}`);
    assert.notEqual(grandchild.ppid, process.pid, 'the shell stayed between them: the holder is the grandchild\'s grandparent');
    assert.ok(existsSync(dirs.lockDir) && parent.refresh(), 'the parent still holds after its children released');
    // this process's own other instance is no child of the hold: it queues (here it times out)
    process.env.COT_LANE_HOLD = '1';
    try {
      const sibling = createCaptureLock(dirs);
      await assert.rejects(sibling.acquire(500), /cot-shots lock timeout/, 'the holder\'s own process never nests on the flag');
    } finally {
      delete process.env.COT_LANE_HOLD;
    }
    parent.release();
    // a render hold: the child nests in the ancestor's render slot
    const renderDirs = rig('lane-render');
    const renderParent = createCaptureLock(renderDirs);
    await renderParent.acquire(2_000, { lockClass: 'render' });
    const renderChild = await laneChild(renderDirs, 2_000);
    assert.deepEqual([renderChild.ok, renderChild.nested, renderChild.heldClass], [true, true, 'render'], JSON.stringify(renderChild));
    renderParent.release();
    // a leftover export: the lock is held by a process that is no ancestor (a sibling), so the child queues and says why
    const foreignDirs = rig('lane-foreign');
    const holder = spawn(process.execPath, ['--input-type=module', '-e', `import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      const lock = createCaptureLock({ lockDir: ${JSON.stringify(foreignDirs.lockDir)}, queueDir: ${JSON.stringify(foreignDirs.queueDir)}, log: () => {} });
      await lock.acquire(2000); console.log('held'); process.stdin.resume(); process.stdin.once('end', () => { lock.release(); process.exit(0); });`],
    { stdio: ['pipe', 'pipe', 'inherit'] });
    try {
      await new Promise((resolve, reject) => {
        holder.stdout.setEncoding('utf8').on('data', (chunk) => { if (chunk.includes('held')) resolve(); });
        holder.once('close', (code) => reject(new Error(`the sibling holder exited ${code} before it held`)));
      });
      const leftover = await laneChild(foreignDirs, 700);
      assert.deepEqual([leftover.ok, leftover.error], [false, 'cot-shots lock timeout'], `another process's hold does not open on the flag: ${JSON.stringify(leftover)}`);
      assert.ok(leftover.notes.some((line) => /COT_LANE_HOLD/.test(line) && /no ancestor/.test(line)), `the leftover export is said: ${leftover.notes.join('\n')}`);
    } finally {
      holder.stdin.end();
      await new Promise((resolve) => (holder.exitCode !== null ? resolve() : holder.once('close', resolve)));
    }
    // and on a free lock the flag changes nothing: the child takes the lock on its own
    const free = await laneChild(rig('lane-free'), 2_000);
    assert.deepEqual([free.ok, free.nested], [true, false], `a free lock: held on its own, not nested: ${JSON.stringify(free)}`);
  }
  // ---- (round 2 U38) ancestorHeld: a tool's own held-lock claim (--lock-held, COT_CAPTURE_LOCK_HELD=1) is checked as the
  // flag is: it skipped the lock whatever held it; now it nests only in an ancestor's live hold and otherwise queues
  {
    const claimChild = (dirs, timeoutMs) => new Promise((done) => {
      const script = `import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
        const notes = [];
        const lock = createCaptureLock({ lockDir: ${JSON.stringify(dirs.lockDir)}, queueDir: ${JSON.stringify(dirs.queueDir)}, log: (line) => notes.push(line) });
        try { await lock.acquire(${timeoutMs}, { ancestorHeld: true }); const nested = lock.nested; lock.release(); console.log(JSON.stringify({ ok: true, nested, notes })); }
        catch (error) { console.log(JSON.stringify({ ok: false, error: error.message, notes })); }`;
      const proc = spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: ['ignore', 'pipe', 'inherit'] });
      let out = '';
      proc.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
      proc.once('close', () => done(JSON.parse(out.trim().split('\n').at(-1))));
    });
    const dirs = rig('claim');
    const parent = createCaptureLock(dirs);
    await parent.acquire(2_000);
    const under = await claimChild(dirs, 2_000);
    assert.deepEqual([under.ok, under.nested], [true, true], `a claim under its parent's live hold nests: ${JSON.stringify(under)}`);
    parent.release();
    const free = await claimChild(rig('claim-free'), 2_000);
    assert.deepEqual([free.ok, free.nested], [true, false], 'on a free lock the claim changes nothing: held on its own');
    assert.ok(free.notes.some((line) => /the caller says an ancestor holds it, but no ancestor/.test(line)), `and it says so: ${free.notes.join('\n')}`);
  }
  // ---- the wrapper hands the token down: a tool under runCapturedCommand that takes the lock itself nests ------------
  {
    const dirs = rig('wrapped');
    const result = join(root, 'wrapped.json');
    const script = `import { writeFileSync } from 'node:fs';
      import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
      const lock = createCaptureLock({ lockDir: ${JSON.stringify(dirs.lockDir)}, queueDir: ${JSON.stringify(dirs.queueDir)}, log: () => {} });
      const t0 = Date.now();
      try { await lock.acquire(1500); writeFileSync(${JSON.stringify(result)}, JSON.stringify({ ok: true, nested: lock.nested, ms: Date.now() - t0 })); lock.release(); }
      catch (error) { writeFileSync(${JSON.stringify(result)}, JSON.stringify({ ok: false, error: error.message })); }`;
    const lock = createCaptureLock(dirs);
    await runCapturedCommand(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore' }, { lock, timeoutMs: 2_000 });
    const seen = JSON.parse(readFileSync(result, 'utf8'));
    assert.deepEqual([seen.ok, seen.nested], [true, true], `the wrapped tool nests in the wrapper's hold: ${JSON.stringify(seen)}`);
    assert.equal(existsSync(dirs.lockDir), false, 'and the wrapper releases its own hold after');
  }
  assert.deepEqual(LOCK_ENV.filter((name) => process.env[name] !== undefined), [], 'no lock variable is set at the end');
  console.log('capture-lock-reentry.selftest: a holding or queued instance refuses a second acquire (no leaked render slot, no wait on its own pid), checkpoint re-queues, and a child nests in its parent\'s hold through the token (runCapturedCommand hands it down; a timing child never in a render hold) or, on COT_LANE_HOLD=1, in an ancestor\'s live hold only');
} finally {
  rmSync(root, { recursive: true, force: true });
}
