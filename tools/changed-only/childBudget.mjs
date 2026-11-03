// The changed-only chain's CPU children and their limit (267, Main: the load class fixed in receipts and browser
// launches). A step's limit (steps.mjs timeoutS + perIdS per id) is a budget of the CPU its child process tree spends,
// not of wall time: on a starved machine (load 300-1000 on 18 cores, 2026-11-01) a healthy step getting a fifth of a
// core used to pass its wall limit and be killed, which stopped the release chain. A separate, generous wall cap names
// only a hang: no CPU progress in the tree for `hangS`. GPU children keep their wall limit (it bounds a capture hold).
// First-party tooling: Kevin B. Liu.
import { execFile, execFileSync, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';

/** Seconds of CPU from ps's `time` column ([[dd-]hh:]mm:ss.ss). */
export function psCpuSeconds(text = '') {
  const value = String(text).trim();
  const [days, clock] = value.includes('-') ? value.split('-') : ['0', value];
  return Number(days) * 86400 + clock.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
}

/** CPU seconds of `rootPid` and every live descendant in `ps -A -o pid=,ppid=,time=` rows ({ pid, ppid, cpuS }). */
export function treeCpu(rows, rootPid) {
  const children = new Map();
  for (const row of rows) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row);
  }
  const members = rows.filter((row) => row.pid === rootPid);
  for (let i = 0; i < members.length; i++) members.push(...(children.get(members[i].pid) ?? []));
  return { pids: members.map((row) => row.pid), cpuS: members.reduce((sum, row) => sum + row.cpuS, 0) };
}

/** Why a child must stop, or null: its tree spent its CPU budget, or it made no CPU progress for `hangS` of wall. */
export function budgetVerdict({ cpuS, budgetS, idleS, hangS, wallS }) {
  if (cpuS > budgetS) return { kind: 'budget', message: `CPU budget ${budgetS} s spent (${cpuS.toFixed(1)} s of CPU in ${Math.round(wallS)} s of wall)` };
  if (idleS > hangS) return { kind: 'hang', message: `no CPU progress for ${Math.round(idleS)} s (hang cap ${hangS} s; ${cpuS.toFixed(1)} s of CPU in ${Math.round(wallS)} s of wall)` };
  return null;
}

/**
 * A synchronous child bounded by the CPU its process tree spends, never by wall time (268: execFileSync has only a wall
 * timeout). This module, run as a script, spawns `command` and watches its tree (watchChild, `limits`: budgetS, hangS,
 * pollMs, graceMs) while the caller blocks on it; `options` are execFileSync's, and `command`'s output is the caller's.
 * Throws past the budget (named on stderr) or the hang cap, and on any other failure. One mechanism with the chain's
 * own children: the kernel's CPU limit (ulimit -t) never stopped a node child that node had spawned (Main's probes,
 * 2026-11-02: 3 s of CPU on a 1 s limit, exit 0), so the rows read ran unbounded.
 */
export function budgetedSync(command, args, { budgetS, hangS, pollMs, graceMs, ...options }) {
  return execFileSync(process.execPath, [import.meta.filename, JSON.stringify({ budgetS, hangS, pollMs, graceMs }), command, ...args], options);
}

const psRows = () => new Promise((done) => {
  execFile('ps', ['-A', '-o', 'pid=,ppid=,time='], { maxBuffer: 1 << 24, timeout: 15_000 }, (error, stdout) => {
    done(error ? null : String(stdout).split('\n').map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)/)).filter(Boolean)
      .map(([, pid, ppid, time]) => ({ pid: +pid, ppid: +ppid, cpuS: psCpuSeconds(time) })));
  });
});

/**
 * Watch child `pid`'s process tree: past `budgetS` of its CPU, or `hangS` without CPU progress, it calls `onStop(verdict)`
 * once and stops its tree by exact pids (TERM, then KILL after `graceMs`). `stop()` ends the watch; a failed ps sample is
 * skipped, never a verdict. The tree's CPU is every member's last sampled CPU, kept after it exits (268): summed over
 * the live members alone, a chain of short children overspent unseen, and the tree fell below its old peak each time a
 * child exited, so a healthy tree read as no progress (a hang).
 */
export function watchChild(pid, { budgetS, hangS = 1800, pollMs = 15_000, graceMs = 15_000, onStop = () => {} }) {
  const startedAt = Date.now(), spent = new Map();
  let lastCpuS = 0, lastProgressAt = startedAt, timer = null, stopped = false, verdict = null;
  const tick = async () => {
    if (stopped) return;
    const rows = await psRows();
    if (stopped) return;
    if (rows) {
      const tree = treeCpu(rows, pid);
      if (!tree.pids.length) { timer = setTimeout(tick, pollMs); return; } // exited; 'close' ends the watch
      for (const row of rows) if (tree.pids.includes(row.pid)) spent.set(row.pid, Math.max(spent.get(row.pid) ?? 0, row.cpuS));
      const cpuS = [...spent.values()].reduce((sum, each) => sum + each, 0);
      const now = Date.now();
      if (cpuS > lastCpuS + 0.05) { lastCpuS = cpuS; lastProgressAt = now; }
      verdict = budgetVerdict({ cpuS, budgetS, idleS: (now - lastProgressAt) / 1000, hangS, wallS: (now - startedAt) / 1000 });
      if (verdict) {
        onStop(verdict);
        for (const member of tree.pids) { try { process.kill(member, 'SIGTERM'); } catch { /* gone */ } }
        setTimeout(() => { for (const member of tree.pids) { try { process.kill(member, 'SIGKILL'); } catch { /* gone */ } } }, graceMs).unref();
        return;
      }
    }
    timer = setTimeout(tick, pollMs);
  };
  timer = setTimeout(tick, Math.min(pollMs, 1000));
  return {
    get verdict() { return verdict; },
    stop() { stopped = true; clearTimeout(timer); },
  };
}

// The runner budgetedSync starts: `node childBudget.mjs <limits JSON> <command> [args...]`. The child shares its stdio,
// so its output reaches the caller as it writes it; a child stopped by its watch exits 1 with the verdict on stderr.
const isEntry = (() => { try { return realpathSync(process.argv[1] ?? '') === import.meta.filename; } catch { return false; } })();
if (isEntry) {
  const [limits, command, ...args] = process.argv.slice(2);
  const child = spawn(command, args, { stdio: 'inherit' });
  const watch = watchChild(child.pid, { ...JSON.parse(limits), onStop: (verdict) => process.stderr.write(`${command} stopped: ${verdict.message}\n`) });
  child.on('error', (error) => { watch.stop(); process.stderr.write(`${command}: ${error.message}\n`); process.exit(1); });
  child.on('close', (status, signal) => {
    watch.stop();
    if (signal && !watch.verdict) process.stderr.write(`${command} stopped by ${signal}\n`);
    process.exit(watch.verdict || status === null ? 1 : status);
  });
}
