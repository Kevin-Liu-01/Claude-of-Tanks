// The session mutex (an agent scratchpad's probe.lock) has an owner (2026-11-02 audit S4, capture-lock.mjs
// claimSessionMutex, tools/with-session-mutex.mjs). It was a bare mkdir: frame-budget-probe never reaped it (a killed
// agent's mutex cost every later round a 45-minute wait), and the polite lock (visual-census-lock) reaped any mutex without
// a pid file 60 s on, a live shell holder's included. Now: a dead owner's mutex is reaped, a live one's never, a legacy
// mutex (a `pid` file only) once its pid is dead, and a bare directory (its holder may be a live shell loop) never; shells
// hold it through with-session-mutex.mjs. A probe started under the mutex's holder nests in it (round 2:
// sessionMutexHeldByAncestor, where COT_LANE_HOLD=1 skipped it unchecked). Private directories only.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { claimSessionMutex, reapDeadSessionMutex, releaseSessionMutex, releaseSessionMutexAt, sessionMutexHeldByAncestor,
  sessionMutexState } from './capture-lock.mjs';
import * as captureLock from './capture-lock.mjs';
import { SELFTEST_STARVED_EXIT } from './selftest-verdict.mjs';
import { createPoliteCaptureLock } from './visual-census-lock.mjs';

const LOCK = new URL('./capture-lock.mjs', import.meta.url).href;
const WRAPPER = fileURLToPath(new URL('./with-session-mutex.mjs', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'cot-session-mutex-'));
const quiet = () => {};
try {
  // ---- owned: claimed with a token and the legacy pid file; released; a live owner's never reaped -----------------
  {
    const dir = join(root, 'owned');
    const hold = claimSessionMutex(dir);
    assert.ok(hold, 'claimed');
    assert.equal(claimSessionMutex(dir), null, 'taken while held');
    assert.equal(readFileSync(join(dir, 'pid'), 'utf8'), String(process.pid), 'the pid file older readers take');
    assert.deepEqual([sessionMutexState(dir).state, sessionMutexState(dir).pid], ['live', process.pid]);
    assert.equal(reapDeadSessionMutex(dir, { graceMs: 0, log: quiet }), false, 'a live owner\'s mutex is never reaped');
    assert.equal(releaseSessionMutex(hold, { log: quiet }), true);
    assert.equal(existsSync(dir), false, 'released');
    claimSessionMutex(dir);
    assert.equal(releaseSessionMutexAt(dir, { log: quiet }), true, 'released by its path when the token is this process\'s');
  }

  // ---- a killed holder: its mutex is reaped and taken ---------------------------------------------------------------
  {
    const dir = join(root, 'killed');
    const killed = spawnSync(process.execPath, ['--input-type=module', '-e',
      `import { claimSessionMutex } from ${JSON.stringify(LOCK)}; if (!claimSessionMutex(${JSON.stringify(dir)})) process.exit(9); process.kill(process.pid, 'SIGKILL');`]);
    assert.equal(killed.signal, 'SIGKILL', 'a holder killed while it held the mutex');
    assert.equal(sessionMutexState(dir).state, 'dead');
    assert.equal(reapDeadSessionMutex(dir, { log: quiet }), true, 'its mutex is reaped');
    assert.ok(claimSessionMutex(dir), 'and taken');
    releaseSessionMutexAt(dir, { log: quiet });
    // the legacy form (mkdir and a pid file, as frame-budget-probe and the polite lock wrote it): reaped once its pid is dead
    const legacy = join(root, 'legacy');
    mkdirSync(legacy);
    const gone = spawnSync(process.execPath, ['-e', 'console.log(process.pid)'], { encoding: 'utf8' });
    writeFileSync(join(legacy, 'pid'), gone.stdout.trim());
    assert.equal(reapDeadSessionMutex(legacy, { graceMs: 60_000, log: quiet }), false, 'younger than the grace: kept');
    assert.equal(reapDeadSessionMutex(legacy, { graceMs: 0, log: quiet }), true, 'a legacy mutex of a dead pid is reaped');
    mkdirSync(legacy);
    writeFileSync(join(legacy, 'pid'), String(process.pid));
    assert.equal(reapDeadSessionMutex(legacy, { graceMs: 0, log: quiet }), false, 'a legacy mutex of a live pid is kept');
  }

  // ---- a bare directory (a live shell holder's mkdir) is never reaped, however old --------------------------------
  {
    const dirs = { queueDir: join(root, 'queue'), lockDir: join(root, 'fifo'), probeDir: join(root, 'bare') };
    mkdirSync(dirs.probeDir);
    const old = new Date(Date.now() - 2 * 3600_000);
    utimesSync(dirs.probeDir, old, old);
    assert.equal(sessionMutexState(dirs.probeDir).state, 'unowned');
    assert.equal(reapDeadSessionMutex(dirs.probeDir, { graceMs: 0, log: quiet }), false, 'an ownerless mutex is not reaped');
    const polite = createPoliteCaptureLock({ ...dirs, probeDeadGraceMs: 0, requeuePauseMs: 20, headPollMs: 15, maxHolderWaitMs: 50, patientHeadMs: 0 });
    await assert.rejects(polite.acquire(400), /cot-shots lock timeout/, 'the polite lock waits behind it (it reaped it 60 s on, under a live holder)');
    assert.ok(existsSync(dirs.probeDir) && !existsSync(dirs.lockDir), 'the shell holder keeps its mutex; the FIFO lock was never taken');
    rmSync(dirs.probeDir, { recursive: true });
    await polite.acquire(2_000);
    assert.equal(sessionMutexState(dirs.probeDir).state, 'live', 'the polite lock holds an owned mutex');
    polite.release();
    assert.equal(existsSync(dirs.probeDir), false);
  }

  // ---- the shell wrapper: the command runs holding the mutex, its status comes back, the mutex goes ---------------
  {
    const dir = join(root, 'wrapped');
    const probe = `import { sessionMutexState } from ${JSON.stringify(LOCK)};
      const state = sessionMutexState(${JSON.stringify(dir)});
      process.exit(state.state === 'live' && state.pid === process.ppid ? 7 : 1);`;
    const wrapped = spawnSync(process.execPath, [WRAPPER, dir, '--', process.execPath, '--input-type=module', '-e', probe], { encoding: 'utf8' });
    assert.equal(wrapped.status, 7, `the command held the wrapper's mutex and its status came back: ${wrapped.stderr}`);
    assert.equal(existsSync(dir), false, 'released when the command ended');
    // it waits behind a live holder and runs once that holder releases
    const hold = claimSessionMutex(dir);
    const started = Date.now();
    const waiter = spawn(process.execPath, [WRAPPER, dir, '--', process.execPath, '-e', 'process.exit(0)'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    waiter.stderr.setEncoding('utf8').on('data', (chunk) => { err += chunk; });
    await new Promise((done) => setTimeout(done, 600));
    assert.equal(waiter.exitCode, null, 'still waiting while the mutex is held');
    releaseSessionMutex(hold, { log: quiet });
    const code = await new Promise((done) => waiter.once('close', done));
    assert.equal(code, 0, err);
    assert.ok(Date.now() - started >= 600 && /is held \(live/.test(err), 'it waited, and said who held it');
    assert.equal(existsSync(dir), false);
    const usage = spawnSync(process.execPath, [WRAPPER, dir], { encoding: 'utf8' });
    assert.equal(usage.status, 2);
    // (round 2 U39) a wait that runs out has its own status: it exited 75, the runner's STARVED, so a receipt run under the
    // wrapper that never got the mutex was neither red nor cached (a third meaning of 75)
    const held = claimSessionMutex(dir);
    try {
      const gaveUp = spawnSync(process.execPath, [WRAPPER, dir, '--wait-min=0.002', '--', process.execPath, '-e', 'process.exit(0)'],
        { encoding: 'utf8' });
      assert.match(gaveUp.stderr, /still held after 0\.002 min: giving up/, gaveUp.stderr);
      assert.notEqual(gaveUp.status, SELFTEST_STARVED_EXIT, 'a mutex wait that runs out is not the selftests\' STARVED verdict');
      assert.equal(gaveUp.status, captureLock.LOCK_WAIT_TIMEOUT_EXIT, 'it exits the hold CLIs\' wait-timeout status');
    } finally { releaseSessionMutex(held, { log: quiet }); }
  }
  // ---- held by an ancestor (round 2): a command run under the holder nests in it; another process's is not its own ------
  {
    const dir = join(root, 'ancestor');
    const probe = `import { sessionMutexHeldByAncestor } from ${JSON.stringify(LOCK)}; process.stdout.write(String(sessionMutexHeldByAncestor(${JSON.stringify(dir)})));`;
    const under = spawnSync(process.execPath, [WRAPPER, dir, '--', process.execPath, '--input-type=module', '-e', probe], { encoding: 'utf8' });
    assert.equal(under.status, 0, under.stderr);
    assert.equal(under.stdout.trim(), 'true', 'the wrapper holding the mutex is an ancestor of its command');
    assert.equal(sessionMutexHeldByAncestor(dir), false, 'a free mutex is nobody\'s');
    const hold = claimSessionMutex(dir);
    assert.equal(sessionMutexHeldByAncestor(dir), false, 'this process\'s own hold is not an ancestor\'s');
    assert.equal(spawnSync(process.execPath, ['--input-type=module', '-e', probe], { encoding: 'utf8' }).stdout, 'true', 'its child nests in it');
    releaseSessionMutex(hold, { log: quiet });
    const holder = spawn(process.execPath, ['--input-type=module', '-e',
      `import { claimSessionMutex } from ${JSON.stringify(LOCK)}; claimSessionMutex(${JSON.stringify(dir)}); console.log('claimed'); setInterval(() => {}, 1000);`],
    { stdio: ['ignore', 'pipe', 'inherit'] });
    let said = '';
    holder.stdout.setEncoding('utf8').on('data', (chunk) => { said += chunk; });
    for (let i = 0; i < 800 && !said.includes('claimed'); i++) await new Promise((done) => setTimeout(done, 25));
    assert.deepEqual([sessionMutexState(dir).state, sessionMutexHeldByAncestor(dir)], ['live', false], 'a child\'s hold is not this process\'s ancestor\'s');
    holder.kill('SIGKILL');
    await new Promise((done) => holder.once('close', done));
    // (round 2 U38) the polite lock (visual-census --probe-lock) under the mutex's holder nests in it too: it waited behind
    // its own parent (a live owner is never reaped), 20 min as the patient head, then stepped behind until its timeout
    const fifo = { queueDir: join(root, 'polite-queue'), lockDir: join(root, 'polite-fifo') };
    const census = `import { createPoliteCaptureLock } from ${JSON.stringify(new URL('./visual-census-lock.mjs', import.meta.url).href)};
      import { sessionMutexState } from ${JSON.stringify(LOCK)};
      const lock = createPoliteCaptureLock({ probeDir: ${JSON.stringify(dir)}, queueDir: ${JSON.stringify(fifo.queueDir)}, lockDir: ${JSON.stringify(fifo.lockDir)},
        requeuePauseMs: 20, headPollMs: 15, patientPollMs: 20, patientHeadMs: 200, maxHolderWaitMs: 50 });
      const t0 = Date.now();
      try {
        await lock.acquire(1500);
        const ms = Date.now() - t0, held = lock.held;
        lock.release();
        const after = sessionMutexState(${JSON.stringify(dir)});
        console.log(JSON.stringify({ ok: true, ms, held, after: after.state, own: after.pid === process.ppid }));
      } catch (error) { console.log(JSON.stringify({ ok: false, ms: Date.now() - t0, error: error.message })); }`;
    const polite = spawnSync(process.execPath, [WRAPPER, dir, '--', process.execPath, '--input-type=module', '-e', census], { encoding: 'utf8' });
    assert.equal(polite.status, 0, polite.stderr);
    const result = JSON.parse(polite.stdout.trim().split('\n').at(-1));
    assert.equal(result.ok, true, `the polite lock under the mutex's holder nests in it: ${JSON.stringify(result)}`);
    assert.deepEqual([result.held, result.after, result.own], [true, 'live', true], 'held while it ran; its release leaves the holder\'s mutex');
    assert.equal(existsSync(dir), false, 'the wrapper released the mutex once its command ended');
  }
  console.log('session-mutex.selftest: an owned probe mutex (live kept, dead and legacy-dead reaped, a bare shell mkdir never), the polite lock on it, the shell wrapper (its wait timeout its own status), and a holder\'s descendants nesting in it');
} finally {
  rmSync(root, { recursive: true, force: true });
}
