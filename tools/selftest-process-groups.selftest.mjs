// Every receipt leads its own process group, and nothing in it outlives the receipt (266, Main: three `for (;;) {}`
// burners a receipt left behind ran 17.5 hours; tools/run-selftests.mjs runSelftestFile). A fixture receipt starts
// three raw burners and either fails at once or hangs. Whether it fails, or the runner itself is ended by SIGTERM or by
// an outer alarm (SIGALRM, the ghillie case) while it hangs, no process of its group is alive once the runner returns.
// Controls: the runner's old kill (the receipt's own process only, in the runner's group) leaves all three burners
// running after the same failure and the same SIGTERM. Every fixture process stops itself after 60 s, so a proof ended
// from outside cannot leak them for long. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runSelftestFile } from './run-selftests.mjs';

const BURNER = 'const end = Date.now() + 60000; for (;;) if (Date.now() > end) process.exit(0);';
const fixture = (ending) => `import { spawn } from 'node:child_process';
const burn = () => spawn(process.execPath, ['-e', ${JSON.stringify(BURNER)}], { stdio: 'ignore' }).pid;
const burners = [burn(), burn(), burn()];
console.log('fixture ' + JSON.stringify({ fixture: process.pid, burners }));
${ending}
`;
// The runner as its own process (a file: modules it imports read process.argv[1] as a path): runSelftestFile on the
// fixture with the process's real signals. `legacy` restores the old kill: no group of its own, and signals reach the
// receipt's process only.
const DRIVER = `import { spawn } from 'node:child_process';
const [runner, file, logFile, mode] = process.argv.slice(2);
const { runSelftestFile } = await import(runner);
const legacy = mode === 'legacy' ? {
  spawnProcess: (command, args, options) => spawn(command, args, { ...options, detached: false }),
  killGroup: () => { throw new Error('legacy: no group'); },
} : {};
const result = await runSelftestFile(file, { logFile, ...legacy });
console.log('runner ' + result.status);
`;
const RUNNER = pathToFileURL(join(import.meta.dirname, 'run-selftests.mjs')).href;
const noGroup = () => { throw new Error('no group'); };

const dir = mkdtempSync(join(tmpdir(), 'cot-selftest-groups-'));
const started = [];
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const failing = join(dir, 'failing.mjs'), hanging = join(dir, 'hanging.mjs'), driver = join(dir, 'runner.mjs');
writeFileSync(failing, fixture('process.exit(1);'));
writeFileSync(hanging, fixture('setTimeout(() => process.exit(0), 60000);'));
writeFileSync(driver, DRIVER);

/** The fixture's pids from its log, once it has written them. */
async function fixturePids(logFile) {
  for (let waited = 0; waited < 15000; waited += 50) {
    let text = '';
    try { text = readFileSync(logFile, 'utf8'); } catch { /* not yet */ }
    const line = text.split('\n').find((entry) => entry.startsWith('fixture '));
    if (line) {
      const { fixture: pid, burners } = JSON.parse(line.slice('fixture '.length));
      started.push(pid, ...burners);
      return [pid, ...burners];
    }
    await sleep(50);
  }
  throw new Error(`${logFile}: the fixture never reported its pids`);
}
/** The pids still alive after the processes have had `ms` to go. */
const survivors = async (pids, ms = 300) => { await sleep(ms); return pids.filter(alive); };
/** Resolves when `child` closes; fails after `ms`. */
function closedWithin(child, ms, what) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} did not return within ${ms} ms`)), ms);
    child.once('close', () => { clearTimeout(timer); resolve(); });
  });
}

try {
  // The receipt fails: its burners go with it.
  {
    const logFile = join(dir, 'failing.log');
    const result = await runSelftestFile(failing, { logFile, signals: new EventEmitter() });
    assert.equal(result.status, 1);
    assert.deepEqual(await survivors(await fixturePids(logFile)), [], 'a failed receipt leaves no process in its group');
  }
  {
    const logFile = join(dir, 'failing-legacy.log');
    await runSelftestFile(failing, { logFile, signals: new EventEmitter(), killGroup: noGroup });
    const [, ...burners] = await fixturePids(logFile);
    assert.equal((await survivors(burners)).length, 3, 'control: without the group kill, the failed receipt\'s burners run on');
  }

  // The runner itself is ended while the receipt hangs.
  for (const [signal, mode, status] of [['SIGTERM', 'groups', 143], ['SIGALRM', 'groups', 142], ['SIGTERM', 'legacy', null]]) {
    const logFile = join(dir, `hanging-${signal}-${mode}.log`);
    const runner = spawn(process.execPath, [driver, RUNNER, hanging, logFile, mode], { stdio: ['ignore', 'pipe', 'inherit'] });
    started.push(runner.pid);
    let output = '';
    runner.stdout.on('data', (chunk) => { output += chunk; });
    const closed = closedWithin(runner, 15000, `the runner after ${signal}`);
    const pids = await fixturePids(logFile);
    runner.kill(signal);
    await closed;
    const left = await survivors(pids);
    if (mode === 'legacy') {
      assert.equal(left.filter((pid) => pid !== pids[0]).length, 3,
        `control: the old kill leaves the hung receipt's three burners after the runner's ${signal}`);
      continue;
    }
    assert.match(output, new RegExp(`runner ${status}\\b`), `${signal}: the runner reports the interruption (${status})`);
    assert.deepEqual(left, [], `${signal} to the runner: no process of the hung receipt's group is left`);
  }
  console.log('selftest-process-groups.selftest: a failed receipt, and a hung one whose runner gets SIGTERM or SIGALRM, '
    + 'leave no process in their group; controls: the old kill leaves three burners after the failure and after SIGTERM');
} finally {
  for (const pid of started) if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ } }
  rmSync(dir, { recursive: true, force: true });
}
