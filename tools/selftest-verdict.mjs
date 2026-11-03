// A receipt's third verdict (2026-11-01, item 267): STARVED. A receipt that judges host time net of what the machine
// withheld (tools/starvation-meter.mjs) can find too little left to judge on a loaded machine. It then exits
// SELFTEST_STARVED_EXIT (75, sysexits' EX_TEMPFAIL: try again later) instead of passing silently or failing a lane for
// the machine: the runner prints STARVED, never caches it as a PASS (the next run executes it again), lists it in its
// summary and report, and the gate counts it apart from the red receipts.
import { cpus, loadavg } from 'node:os';

export const SELFTEST_STARVED_EXIT = 75;

/** Whether a receipt's exit status is the STARVED verdict. */
export const isStarved = (status) => status === SELFTEST_STARVED_EXIT;

/** (268) A wall-clock wait (a browser tool's phase) timing out above this 1-min load per core was the machine's, not the
 *  product's: the tool names it STARVED and exits SELFTEST_STARVED_EXIT (tools/mp-p2p-e2e.mjs, its entry receipt). */
export const STARVED_LOAD_PER_CORE = 3;

/** The machine's 1-min load now, and whether it is past STARVED_LOAD_PER_CORE per core. */
export function machineLoad() {
  const load1 = Math.round(loadavg()[0] * 10) / 10, cores = cpus().length;
  return { load1, cores, starvedAbove: STARVED_LOAD_PER_CORE * cores, starved: load1 > STARVED_LOAD_PER_CORE * cores };
}
