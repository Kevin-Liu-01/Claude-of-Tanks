/**
 * The replay system's lazy chunk (docs/REPLAY.md): what the page needs to record a solo battle and to open a saved one.
 * game/replayRecordingAccess.ts loads it with a solo battle's authority (before its setup, so the recording starts at
 * the battle's first step) and when a saved replay is watched, a replay file is opened (replayImport.ts) or the tools list
 * them; nothing of it is on the boot graph (tools/boot-static-closure.selftest.mjs).
 */
export { createReplayRecorder } from './replayRecorder.ts';
export { listReplays, loadReplayFile, saveReplay, unpackReplay } from './replayStore.ts';
export { decodeReplay } from '../../sim/replayFormat.ts';
export { recordedBattle, runRecordedSetup } from './replaySetup.ts';
export { checkReplayFile, replayImportSizeProblem } from './replayImport.ts';
