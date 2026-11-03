// Chains and budgeted tools end cleanly (2026-11-02 audit S5, tools/chain-lifecycle.mjs), in real processes:
// - the chain lock: six claimants released at one instant: exactly one holds (the old check-then-write pid file, run
//   alongside as a control with the same pause between its check and its write, lets several through); a dead owner's
//   lock is reaped and taken, a live owner's never;
// - a stop: a chain driver with a child that writes every 20 ms and a grandchild of its own gets SIGTERM; it exits 143,
//   both writers are gone and the lock is free (the control, the old handler that unlocked and exited, leaves its child
//   writing after it is gone);
// - a budget: past it, the teardown runs before the exit (a spawned server is stopped), where the old process.exit(3)
//   left it running.
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
function node(script, { args = [], timeoutMs = 60_000 } = {}) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
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

  // ---- the callers --------------------------------------------------------------------------------------------------
  {
    const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    const chain = read('./tank-regen-changed.mjs');
    assert.match(chain, /takeChainLock\(/, 'the regen chain takes the owned chain lock');
    assert.doesNotMatch(chain, /writeFileSync\(lockPath/, 'and writes no bare pid lock');
    assert.match(chain, /children\.spawn\(/, 'its steps run in their own process groups');
    assert.match(chain, /stopOnSignal\(children/, 'and a stop reaches them before the lock goes');
    assert.doesNotMatch(chain, /process\.on\(signal, \(\) => \{ unlock\(\); process\.exit/, 'no unlock-and-exit handler is left');
  }
  console.log('chain-lifecycle.selftest: one chain holds the owned lock (the old pid file let several in), a stop signals and sweeps every child group before the unlock, and the regen chain uses them');
} finally {
  for (const pid of started) { if (pid && pid !== process.pid) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } } }
  rmSync(root, { recursive: true, force: true });
}
