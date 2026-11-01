// A receipt's third verdict (2026-11-01, item 267): STARVED. A receipt that judges host time net of what the machine
// withheld (tools/starvation-meter.mjs) can find too little left to judge on a loaded machine. It then exits
// SELFTEST_STARVED_EXIT (75, sysexits' EX_TEMPFAIL: try again later) instead of passing silently or failing a lane for
// the machine: the runner prints STARVED, never caches it as a PASS (the next run executes it again), lists it in its
// summary and report, and the gate counts it apart from the red receipts.
export const SELFTEST_STARVED_EXIT = 75;

/** Whether a receipt's exit status is the STARVED verdict. */
export const isStarved = (status) => status === SELFTEST_STARVED_EXIT;
