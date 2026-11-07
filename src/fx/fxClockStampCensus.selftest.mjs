// The fx-clock stamp census, default tier (round 2 U33/Q15; round 3 B5; round 4 F7): a rebase leaves no fx-clock stamp
// the battle runtime holds. The harness (fxClockStampCensus.test-support.mjs, whose header says what it drives and
// checks) runs its whole scenario but the two houses' destruction: their stages, sections, collapse bodies and hanging
// sweep, about 1.7 s of the census's 4.1-4.4 s of CPU (round 5 U12). Every other check runs here: the walk (no stamp left,
// none moved twice, the control), the reach of every fx-clock site outside the houses' modules against its named
// unreached list, the clock followed under other names, every src/fx module with a clock read loaded, the drones and the
// cinematic layer live at the rebase. src/fx/fxClockStampCensusFull.selftest.mjs (the manual fx suite) runs it whole.
import { runFxClockStampCensus } from './fxClockStampCensus.test-support.mjs';

const census = await runFxClockStampCensus({ houses: false });
console.log(`fxClockStampCensus.selftest: a rebase moves every fx-clock stamp the runtime holds, the houses' aside (${census.moved} moved, none left or moved twice; ${census.values} values walked; ${census.unreached} of ${census.sites} fx-clock sites unreached, the houses' and the named few)`);
