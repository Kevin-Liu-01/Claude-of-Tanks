// Shard 5 of 8 of the battlePacing core run (test-speed R9a, 2026-10-16): plays the core matches on the maps whose
// index in MAP_IDS is 4 modulo 8, on one thread, and hands the records to server/battlePacing.selftest.mjs,
// which judges all 132 (server/battlePacingRun.test-support.mjs).
import { runPacingShard } from './battlePacingRun.test-support.mjs';

await runPacingShard(5, process.env.COT_SELFTEST_RUN_DIR);
