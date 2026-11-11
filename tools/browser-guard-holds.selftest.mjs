// What a browser-guard trip releases (2026-11-02 audit S4, tools/browser-launch.mjs). A trip released every capture hold
// of the process (releaseAllCaptureHolds), so with `exit: false` the process went on with its other holds released under
// it: work of an unrelated hold ran unlocked unless its owner noticed. Now a trip that ends the process releases them all
// (they end with it); one that keeps it running releases only what its caller names (`releaseHolds`), which `exit: false`
// must give. Private lock directories only; no browser starts (the real trip is browser-launch.selftest's).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as browserLaunch from './browser-launch.mjs';
import { launchGuardedBrowser, releaseForTrip, tripReleaseScope } from './browser-launch.mjs';
import { createCaptureLock, releaseAllCaptureHolds } from './capture-lock.mjs';

const root = mkdtempSync(join(tmpdir(), 'cot-guard-holds-'));
try {
  assert.deepEqual(tripReleaseScope({}), { all: true }, 'a trip that exits releases every hold (the process ends)');
  assert.deepEqual(tripReleaseScope({ exit: true, releaseHolds: 'none' }), { all: true }, 'whatever the caller named');
  assert.deepEqual(tripReleaseScope({ exit: false, releaseHolds: 'all' }), { all: true });
  assert.deepEqual(tripReleaseScope({ exit: false, releaseHolds: 'none' }), { locks: [] });
  assert.throws(() => tripReleaseScope({ exit: false }), /exit: false needs releaseHolds/, 'exit: false must say what a trip releases');
  assert.throws(() => tripReleaseScope({ exit: false, releaseHolds: [{}] }), /needs releaseHolds/, 'a list of capture locks, nothing else');

  const lock = (name) => createCaptureLock({ lockDir: join(root, `${name}.lock`), queueDir: join(root, `${name}.queue`), log: () => {} });
  // control: the old trip, every hold of the process
  {
    const browserHold = lock('control-browser'), otherHold = lock('control-other');
    await browserHold.acquire(2_000);
    await otherHold.acquire(2_000);
    assert.equal(releaseAllCaptureHolds('browser guard: test').length, 2, 'control: the old trip released the unrelated hold too');
    assert.equal(otherHold.heldTicket, null);
  }
  // the named scope: only the browser's own hold goes
  {
    const browserHold = lock('browser'), otherHold = lock('other');
    await browserHold.acquire(2_000);
    await otherHold.acquire(2_000);
    const ticket = browserHold.heldTicket;
    assert.deepEqual(releaseForTrip(tripReleaseScope({ exit: false, releaseHolds: [browserHold] }), 'browser guard: test'), [ticket],
      'the trip releases the hold tied to its browser');
    assert.equal(browserHold.heldTicket, null);
    assert.ok(otherHold.heldTicket && otherHold.refresh(), 'and leaves another hold of the process in place');
    assert.deepEqual(releaseForTrip(tripReleaseScope({ exit: false, releaseHolds: 'none' })), [], '\'none\' releases nothing');
    assert.ok(otherHold.refresh());
    otherHold.release();
  }
  // the rule is checked before any browser starts
  let launched = false;
  await assert.rejects(launchGuardedBrowser({ launch: async () => { launched = true; return {}; } }, {}, { exit: false }), /needs releaseHolds/);
  assert.equal(launched, false, 'refused before the launcher ran');
  // (round 2 U38) the open hold's default teardown stops every guarded browser of the process: a stand-in "browser" (a node
  // process in its own group carrying the launch's token, so the guard watches it as one it started) is killed by its pid
  {
    const { stopGuardedBrowsers } = browserLaunch;
    assert.equal(typeof stopGuardedBrowsers, 'function', 'the guard can stop every browser it watches');
    let child = null;
    const target = await launchGuardedBrowser({ launch: async (options) => {
      child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)', '--', ...options.args], { detached: true, stdio: 'ignore' });
      return { process: () => child, close: async () => { try { child.kill('SIGKILL'); } catch { /* gone */ } } };
    } }, {}, { label: 'stand-in', intervalMs: 60_000 });
    try {
      assert.ok(browserLaunch.browserGuardOf(target), 'the stand-in is watched as a browser this process started');
      const exited = new Promise((done) => child.once('exit', (code, signal) => done(signal)));
      const killed = stopGuardedBrowsers();
      assert.ok(killed.includes(child.pid), `its tree is killed by its exact pids (${killed.join(', ')})`);
      assert.equal(await exited, 'SIGKILL');
      assert.deepEqual(stopGuardedBrowsers(), [], 'and nothing is watched any more');
    } finally {
      try { process.kill(child.pid, 'SIGKILL'); } catch { /* gone */ }
    }
  }
  console.log('browser-guard-holds.selftest: a trip that exits releases every hold; one that keeps the process running releases only the holds its caller names (exit: false must name them); every guarded browser of the process can be stopped (the open hold\'s teardown)');
} finally {
  rmSync(root, { recursive: true, force: true });
}
