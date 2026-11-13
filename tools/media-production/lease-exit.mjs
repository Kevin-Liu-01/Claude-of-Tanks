// The cinema's "lease over" exit status (2026-11-02 audit S5). cinema.mjs ends a batch whose capture lease ran out before
// every job rendered with this status, and site50-finals.mjs reads it as "lease over: rejoin the queue at the stamp and
// resume the rest". It was 75, the number the selftest runner reads as STARVED (tools/selftest-verdict.mjs
// SELFTEST_STARVED_EXIT, sysexits' EX_TEMPFAIL): one number, two machines. It has its own number now, apart from every
// status the tools give a meaning (0, 1-4, 75 STARVED, 77 a hold CLI's wait timeout (capture-lock.mjs
// LOCK_WAIT_TIMEOUT_EXIT, round 2 U39), 86 the browser guard, 124 a runner's kill, 128 + n a signal).
export const CINEMA_LEASE_OVER_EXIT = 76;
