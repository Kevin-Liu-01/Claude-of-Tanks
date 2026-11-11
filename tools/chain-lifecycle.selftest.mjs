// Chains and budgeted tools end cleanly (2026-11-02 audit S5, tools/chain-lifecycle.mjs), in real processes:
// - the chain lock: six claimants released at one instant: exactly one holds (the old check-then-write pid file, run
//   alongside as a control with the same pause between its check and its write, lets several through); a dead owner's
//   lock is reaped and taken, a live owner's never;
// - a stop: a chain driver with a child that writes every 20 ms and a grandchild of its own gets SIGTERM; it exits 143,
//   both writers are gone and the lock is free (the control, the old handler that unlocked and exited, leaves its child
//   writing after it is gone);
// - a budget: past it, the teardown runs before the exit (a spawned server is stopped), where the old process.exit(3)
//   left it running.
// - a GPU child of the chain runs inside a capture hold (runInCaptureHold) and carries its token (round 2 U38);
// - the regen chain and mp-room-census use these (read from their sources).
// Every process this receipt starts is killed by its exact pid at the end, whatever happened.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE = new URL('./chain-lifecycle.mjs', import.meta.url).href;
const root = mkdtempSync(join(tmpdir(), 'cot-chain-lifecycle-'));
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const started = new Set();
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const readPid = (file) => { try { return Number(readFileSync(file, 'utf8').trim()) || null; } catch { return null; } };
/** A node child running `script` (an ES module); resolves { code, signal, out } once it closes. */
function node(script, { args = [], timeoutMs = 60_000, env = process.env } = {}) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env });
  started.add(child.pid);
  let out = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
  const closed = new Promise((done) => {
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, timeoutMs);
    child.once('close', (code, signal) => { clearTimeout(timer); done({ code, signal, out }); });
  });
  return { child, closed };
}
const growing = async (file) => {
  const size = () => { try { return statSync(file).size; } catch { return 0; } };
  const before = size();
  await sleep(300);
  return size() > before;
};

try {
  // ---- the lock: exactly one of six simultaneous claimants -------------------------------------------------------------
  {
    const barrier = join(root, 'go'), dir = join(root, 'chain.lock.d'), legacy = join(root, 'chain.lock');
    const claimant = (mode) => `import { existsSync, readFileSync, writeFileSync } from 'node:fs';
      import { takeChainLock } from ${JSON.stringify(MODULE)};
      while (!existsSync(${JSON.stringify(barrier)})) await new Promise((r) => setTimeout(r, 5));
      if (${JSON.stringify(mode)} === 'old') {
        // the base's rule: check, then a plain write (a pause between them stands for a loaded machine)
        let alive = false;
        if (existsSync(${JSON.stringify(legacy)})) { try { process.kill(Number(readFileSync(${JSON.stringify(legacy)}, 'utf8')), 0); alive = true; } catch {} }
        await new Promise((r) => setTimeout(r, 100));
        if (!alive) { writeFileSync(${JSON.stringify(legacy)}, String(process.pid)); console.log('held'); } else console.log('refused');
      } else {
        await new Promise((r) => setTimeout(r, 100));
        const lock = takeChainLock(${JSON.stringify(dir)});
        console.log(lock.held ? 'held' : 'refused');
      }
      await new Promise((r) => setTimeout(r, 1500)); // hold it while the others try`;
    const race = async (mode) => {
      rmSync(barrier, { force: true });
      const runs = Array.from({ length: 6 }, () => node(claimant(mode)));
      await sleep(400);
      writeFileSync(barrier, '');
      return (await Promise.all(runs.map((run) => run.closed))).map((result) => result.out.trim());
    };
    const old = await race('old');
    assert.ok(old.filter((line) => line === 'held').length > 1, `control: the check-then-write lock lets several chains in (${old.join(' ')})`);
    const owned = await race('new');
    assert.deepEqual(owned.filter((line) => line === 'held').length, 1, `exactly one chain holds the owned lock (${owned.join(' ')})`);
    // its holder exited without releasing: the next claim reaps the dead owner's lock and holds
    const { takeChainLock, chainLockOwner } = await import(MODULE);
    assert.ok(existsSync(dir), 'the dead holder left its lock directory');
    const next = takeChainLock(dir);
    assert.equal(next.held, true, 'a dead owner\'s lock is reaped and taken');
    assert.equal(chainLockOwner(dir).pid, process.pid);
    const refused = await node(`import { takeChainLock } from ${JSON.stringify(MODULE)};
      const lock = takeChainLock(${JSON.stringify(dir)}); console.log(lock.held ? 'held' : 'refused ' + lock.owner.pid);`).closed;
    assert.equal(refused.out.trim(), `refused ${process.pid}`, 'a live owner\'s lock is never reaped');
    assert.equal(next.release(), true);
    assert.equal(existsSync(dir), false, 'released');
    // an older chain's live pid file is honoured
    writeFileSync(legacy, String(process.pid + 0));
    const legacyRun = await node(`import { takeChainLock } from ${JSON.stringify(MODULE)};
      const lock = takeChainLock(${JSON.stringify(dir)}, { legacyFile: ${JSON.stringify(legacy)} }); console.log(lock.held ? 'held' : 'refused');`).closed;
    assert.equal(legacyRun.out.trim(), 'refused', 'a live older chain\'s pid file still keeps a new chain out');
  }

  // ---- a stop: every child group is signalled and swept, then the lock goes -------------------------------------------
  {
    const dir = join(root, 'stop.lock.d');
    const writer = (file, pidFile, grand) => `import { appendFileSync, writeFileSync } from 'node:fs';
      import { spawn } from 'node:child_process';
      writeFileSync(${JSON.stringify(pidFile)}, String(process.pid));
      ${grand ? `spawn(process.execPath, ['--input-type=module', '-e', ${JSON.stringify(`import { appendFileSync, writeFileSync } from 'node:fs';
        writeFileSync(${JSON.stringify(`${pidFile}.grand`)}, String(process.pid));
        setInterval(() => appendFileSync(${JSON.stringify(`${file}.grand`)}, 'x'), 20);`)}], { stdio: 'ignore' });` : ''}
      process.on('SIGTERM', () => {}); // a step that ignores the first TERM: the sweep still ends it
      setInterval(() => appendFileSync(${JSON.stringify(file)}, 'x'), 20);`;
    const driver = (mode, file, pidFile) => `import { spawn } from 'node:child_process';
      import { createChildGroups, stopOnSignal, takeChainLock } from ${JSON.stringify(MODULE)};
      const script = ${JSON.stringify(writer(file, pidFile, true))};
      if (${JSON.stringify(mode)} === 'old') {
        // the base's handler: unlock and exit; the child is neither detached nor signalled
        spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore' });
        for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(130));
      } else {
        const lock = takeChainLock(${JSON.stringify(dir)});
        const groups = createChildGroups();
        stopOnSignal(groups, { graceMs: 500, cleanup: () => lock.release() });
        groups.spawn(process.execPath, ['--input-type=module', '-e', script], { stdio: 'ignore' });
      }
      console.log('ready');
      setInterval(() => {}, 1000);`;
    for (const mode of ['old', 'new']) {
      const file = join(root, `${mode}.writes`), pidFile = join(root, `${mode}.pid`);
      const run = node(driver(mode, file, pidFile));
      for (let i = 0; i < 200 && !(existsSync(`${pidFile}.grand`) && readPid(`${pidFile}.grand`)); i++) await sleep(25);
      const child = readPid(pidFile), grand = readPid(`${pidFile}.grand`);
      if (child) started.add(child);
      if (grand) started.add(grand);
      assert.ok(child && grand && await growing(file), `${mode}: the step child and its grandchild are writing`);
      run.child.kill('SIGTERM');
      const result = await run.closed;
      await sleep(200);
      if (mode === 'old') {
        assert.ok(alive(child) && await growing(file), 'control: the old handler exits while its child keeps writing');
        for (const pid of [child, grand]) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
      } else {
        assert.equal(result.code, 143, `the chain exits 128 + SIGTERM (${JSON.stringify(result)})`);
        assert.ok(!alive(child) && !alive(grand), 'the step child and its grandchild are gone');
        assert.equal(await growing(file) || await growing(`${file}.grand`), false, 'nothing writes after the chain stopped');
        assert.equal(existsSync(dir), false, 'and the lock was released after the children, not before');
      }
    }
  }

  // ---- a budget: the teardown runs before the exit ---------------------------------------------------------------------
  {
    const budget = (mode, pidFile) => `import { spawn } from 'node:child_process';
      import { writeFileSync } from 'node:fs';
      import { armBudget, once } from ${JSON.stringify(MODULE)};
      const server = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
      writeFileSync(${JSON.stringify(pidFile)}, String(server.pid));
      if (${JSON.stringify(mode)} === 'old') setTimeout(() => process.exit(3), 200).unref();
      else armBudget(200, { code: 3, teardown: once(async () => { server.kill(); await new Promise((r) => server.once('exit', r)); }) });
      setInterval(() => {}, 1000);`;
    for (const mode of ['old', 'new']) {
      const pidFile = join(root, `budget-${mode}.pid`);
      const result = await node(budget(mode, pidFile)).closed;
      const server = readPid(pidFile);
      started.add(server);
      assert.equal(result.code, 3, `${mode}: the budget exits 3`);
      await sleep(100);
      if (mode === 'old') assert.ok(alive(server), 'control: process.exit(3) left the spawned server running');
      else assert.equal(alive(server), false, 'the teardown stopped the server before the exit');
    }
  }

  // ---- (round 2 U38) a GPU child of the chain runs in a capture hold and carries its token ------------------------------
  // runCheck's GPU branch held the lock itself and spawned its check child without the hold's token, so a check tool that
  // took the lock would have waited behind its own parent. Both GPU branches hold through runInCaptureHold now: the work
  // gets the hold's token in its env, a child that takes the same lock nests at once, the chain keeps its own signals
  // (no handler is added) and the hold is released after the work.
  {
    const lifecycle = await import(MODULE);
    assert.equal(typeof lifecycle.runInCaptureHold, 'function', 'the chain holds its GPU children through one helper');
    const { createCaptureLock } = await import(new URL('./capture-lock.mjs', import.meta.url).href);
    const dirs = { lockDir: join(root, 'gpu.lock'), queueDir: join(root, 'gpu.queue'), log: () => {} };
    const lock = createCaptureLock(dirs);
    const signalsBefore = process.listenerCount('SIGTERM');
    let during = null;
    const result = await lifecycle.runInCaptureHold(async (env) => {
      during = { token: env.COT_SHOTS_HELD ?? null, base: env.COT_CHAIN_SELFTEST_BASE ?? null, signals: process.listenerCount('SIGTERM') };
      const child = node(`import { createCaptureLock } from ${JSON.stringify(new URL('./capture-lock.mjs', import.meta.url).href)};
        const lock = createCaptureLock({ lockDir: ${JSON.stringify(dirs.lockDir)}, queueDir: ${JSON.stringify(dirs.queueDir)}, log: () => {} });
        const t0 = Date.now();
        try { await lock.acquire(1500); console.log(JSON.stringify({ ok: true, nested: lock.nested, ms: Date.now() - t0 })); lock.release(); }
        catch (error) { console.log(JSON.stringify({ ok: false, error: error.message })); }`, { env });
      return JSON.parse((await child.closed).out.trim().split('\n').at(-1));
    }, { label: 'selftest gpu', lock, baseEnv: { ...process.env, COT_CHAIN_SELFTEST_BASE: 'kept' }, timeoutMs: 2_000 });
    assert.match(during.token ?? '', new RegExp(`^${process.pid}:[0-9a-f]{24}$`), 'the work\'s env carries the hold\'s token');
    assert.equal(during.base, 'kept', 'on top of the chain\'s own child env');
    assert.equal(during.signals, signalsBefore, 'the chain owns its signals: the hold adds no handler');
    assert.deepEqual([result.ok, result.nested], [true, true], `a child that takes the lock nests in the hold: ${JSON.stringify(result)}`);
    assert.equal(existsSync(dirs.lockDir), false, 'the hold is released after the work');
  }

  // ---- the callers --------------------------------------------------------------------------------------------------
  {
    const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    const chain = read('./tank-regen-changed.mjs'), census = read('./mp-room-census.mjs');
    assert.match(chain, /takeChainLock\(/, 'the regen chain takes the owned chain lock');
    assert.doesNotMatch(chain, /writeFileSync\(lockPath/, 'and writes no bare pid lock');
    assert.match(chain, /children\.spawn\(/, 'its steps run in their own process groups');
    assert.match(chain, /stopOnSignal\(children/, 'and a stop reaches them before the lock goes');
    assert.doesNotMatch(chain, /process\.on\(signal, \(\) => \{ unlock\(\); process\.exit/, 'no unlock-and-exit handler is left');
    // (round 2 U38) both GPU branches (a step's chunks and a step's check) hold through runInCaptureHold, with its env
    assert.equal((chain.match(/runInCaptureHold\(/g) ?? []).length, 2, 'runGpuStep and runCheck hold through runInCaptureHold');
    assert.doesNotMatch(chain, /\.acquire\(|createCaptureLock/, 'the chain takes no capture lock of its own');
    assert.equal((chain.match(/niced: false, [^\n]*\benv\b/g) ?? []).length, 2, 'each GPU child gets the hold\'s env');
    assert.match(census, /armBudget\(budgetMin \* 60_000, \{ teardown/, 'mp-room-census tears down past its budget');
    assert.doesNotMatch(census, /setTimeout\(\(\) => \{[^}]*process\.exit\(3\)/, 'and no budget timer exits past the finally');
  }
  console.log('chain-lifecycle.selftest: one chain holds the owned lock (the old pid file let several in), a stop signals and sweeps every child group before the unlock, a budget tears down before its exit, and the regen chain and mp-room-census use them');
} finally {
  for (const pid of started) { if (pid && pid !== process.pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
  rmSync(root, { recursive: true, force: true });
}
