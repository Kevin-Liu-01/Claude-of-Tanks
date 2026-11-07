// The fx-clock stamp census, whole (round 5 U12; manual tier, the fx suite: tools/selftest-tiers.mjs). The harness
// (fxClockStampCensus.test-support.mjs) runs its whole scenario: the default census's (fxClockStampCensus.selftest.mjs)
// and the two houses' destruction, their stages and sections, the collapse bodies thrown at the rebase and the hanging
// sweep, whose stamps the walk then checks, and every fx-clock site's reach is held to the named unreached list. The
// houses cost about 1.7 s of its 4.1-4.4 s of CPU (load 110-190), so the default tier leaves them here: run it on a
// change to src/fx's structure stages, debris, fracture or fracture stages (test:recommend names the suite by its reads).
import { runFxClockStampCensus } from './fxClockStampCensus.test-support.mjs';

const census = await runFxClockStampCensus({ houses: true });
console.log(`fxClockStampCensusFull.selftest: a rebase moves every fx-clock stamp the runtime holds, two houses coming down included (${census.moved} moved, none left or moved twice; ${census.values} values walked; ${census.unreached} of ${census.sites} fx-clock sites unreached, the named few)`);
