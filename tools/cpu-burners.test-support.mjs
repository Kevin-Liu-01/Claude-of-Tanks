// CPU burners for load-sensitive receipts (2026-10-30, Main: ghilliePlacementDeterminism's `node -e 'for (;;) {}'` burners
// ran 13 hours after a runner's alarm ended the test. A terminating signal skips `finally`, and spawned children outlive
// their parent, so the machine's every frame-rate and timing measurement was skewed until they were found).
// A burner here spins in short slices and leaves as soon as its parent pid is no longer the pid it was given: it was
// re-parented, so its parent is gone however it went, SIGKILL included. The parent's pid is passed in rather than read at
// the burner's start: a parent that dies before the burner's runtime is up would otherwise be read as pid 1 and never
// change. The parent also kills its burners on SIGTERM, SIGALRM, SIGINT and SIGHUP (then lets the signal end it as it
// would have) and at exit.
import { spawn } from 'node:child_process';

/** The burner's program (its argument: the parent's pid): a busy loop in 50 ms slices that exits once its parent pid is
 *  no longer that one. */
const BURNER_SOURCE =
  'const p=Number(process.argv[1]);(function s(){if(process.ppid!==p)process.exit(0);const t=Date.now();while(Date.now()-t<50){}setImmediate(s)})()';

const SIGNALS = ['SIGTERM', 'SIGALRM', 'SIGINT', 'SIGHUP'];

/** Start `count` CPU burners: { pids, stop() }. `stop()` kills them and removes the handlers; call it in `finally`. */
export function startCpuBurners(count) {
  const children = Array.from({ length: count },
    () => spawn(process.execPath, ['-e', BURNER_SOURCE, String(process.pid)], { stdio: 'ignore' }));
  const kill = () => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
    }
  };
  const handlers = SIGNALS.map((signal) => [signal, () => { kill(); detach(); process.kill(process.pid, signal); }]);
  function detach() {
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.removeListener('exit', kill);
  }
  for (const [signal, handler] of handlers) process.once(signal, handler);
  process.once('exit', kill);
  return { pids: children.map((child) => child.pid), stop() { kill(); detach(); } };
}
