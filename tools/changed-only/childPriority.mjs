// The changed-only chain's CPU children and their priority (267, Main: release priority covers the CPU as well as the
// capture lock). A lane's chain runs its CPU children at `nice -n 10`, beside every other lane's batch work. The
// integrator's release chain runs with COT_CAPTURE_PRIORITY=release (read by name, as tools/capture-lock.mjs reads it);
// its CPU children then run un-niced, so they outrank the lanes' batch work, which runs at nice 10 or more during a
// release (LANE-RULES "CPU DURING A RELEASE"). The command line differs by that setting alone. GPU children are never
// niced. First-party tooling: Kevin B. Liu.

/** { command, args, prefix } for a child running `node <argv>`: niced 10 unless it is not niced or the run is a release. */
export function cpuChildCommand(execPath, argv, { niced, env = process.env } = {}) {
  if (niced && env.COT_CAPTURE_PRIORITY !== 'release') {
    return { command: 'nice', args: ['-n', '10', execPath, ...argv], prefix: 'nice -n 10 ' };
  }
  return { command: execPath, args: [...argv], prefix: '' };
}
