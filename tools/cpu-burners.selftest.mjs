// CPU burners leave with their parent (tools/cpu-burners.test-support.mjs; 2026-10-30, Main: a runner's alarm ended
// ghilliePlacementDeterminism and its three `for (;;) {}` burners ran on for 13 hours).
// Each case runs a child that starts burners and prints their pids, then ends the child from outside:
// - the negative control: a raw `for (;;) {}` burner outlives its SIGKILLed parent (the leak this receipt guards);
// - the helper's burners are gone within 1.5 s of their parent's SIGKILL (they see their parent's pid change; the parent
//   dies right after starting them, before their runtimes are up, so its pid is passed in), SIGTERM or SIGALRM (the
//   parent's handlers kill them first);
// - stop() ends them in-process.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startCpuBurners } from './cpu-burners.test-support.mjs';

const SELF = fileURLToPath(import.meta.url);
const childMode = process.argv.find((a) => a.startsWith('--child='))?.slice(8);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (childMode) {
  const pids = childMode === 'raw'
    ? [spawn(process.execPath, ['-e', 'for (;;) {}'], { stdio: 'ignore' }).pid]
    : startCpuBurners(2).pids;
  process.stdout.write(JSON.stringify(pids) + '\n');
  setInterval(() => {}, 1000);
} else {
  /** Start a child in `mode`, read its burners' pids, end it with `signal`; resolve the pids. */
  const run = (mode, signal) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SELF, `--child=${mode}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (!text.includes('\n')) return;
      const pids = JSON.parse(text.split('\n')[0]);
      child.once('exit', () => resolve(pids));
      child.kill(signal);
    });
    child.once('error', reject);
  });
  /** Milliseconds until every pid is gone, or null past `limitMs`. */
  const goneWithin = async (pids, limitMs) => {
    const started = Date.now();
    while (Date.now() - started <= limitMs) {
      if (!pids.some(alive)) return Date.now() - started;
      await sleep(20);
    }
    return null;
  };

  const leaked = await run('raw', 'SIGKILL');
  try {
    await sleep(1000);
    assert.ok(leaked.every(alive), 'negative control: a raw for (;;) {} burner outlives its SIGKILLed parent');
  } finally {
    for (const pid of leaked) if (alive(pid)) process.kill(pid, 'SIGKILL');
  }

  const times = {};
  for (const signal of ['SIGKILL', 'SIGTERM', 'SIGALRM']) {
    const pids = await run('helper', signal);
    assert.equal(pids.length, 2);
    const ms = await goneWithin(pids, 1500);
    for (const pid of pids) if (alive(pid)) process.kill(pid, 'SIGKILL');
    assert.notEqual(ms, null, `the helper's burners outlived their parent's ${signal} by 1.5 s`);
    times[signal] = ms;
  }

  const own = startCpuBurners(2);
  own.stop();
  const ms = await goneWithin(own.pids, 1500);
  assert.notEqual(ms, null, 'stop() ends the burners');
  console.log(`cpu-burners.selftest: a raw burner outlives its SIGKILLed parent (control); the helper's burners are gone `
    + `after SIGKILL ${times.SIGKILL} ms, SIGTERM ${times.SIGTERM} ms, SIGALRM ${times.SIGALRM} ms and stop() ${ms} ms`);
}
