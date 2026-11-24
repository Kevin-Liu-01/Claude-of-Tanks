#!/usr/bin/env node
/**
 * Re-simulate a battle recording in Node and check it (replay-system-275, docs/REPLAY.md §4 and P1): the recording's own
 * map's world as the page builds it (tools/replay-world.mjs: full precision, not the 0.1 mm shard), its fleet's combat anatomy, the local driver's
 * replayer (src/game/replay/replayRunner.ts) stepping every recorded step, every checksum compared. No browser, no GPU.
 *
 *   node tools/replay-verify.mjs <battle.cotreplay>            # gzipped or raw
 *   node tools/replay-verify.mjs <battle.cotreplay> --json     # the receipt as JSON
 *
 * Exit 0 when the replay holds to its last step, 1 on a mismatch (the step and the reason), 2 on a file it cannot read.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decodeReplay } from '../src/sim/replayFormat.ts';
import { createReplayRun, ensureReplayFleet } from '../src/game/replay/replayRunner.ts';
import { createReplayWorldFor } from './replay-world.mjs';

const file = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const asJson = process.argv.includes('--json');
if (!file) { console.error('usage: node tools/replay-verify.mjs <battle.cotreplay> [--json]'); process.exit(2); }
let recording;
try {
  const raw = readFileSync(file);
  recording = decodeReplay(new Uint8Array(raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw));
} catch (error) {
  console.error(`replay-verify: cannot read ${file}: ${error.message}`);
  process.exit(2);
}
await ensureReplayFleet(recording);
const setup = recording.header.setup;
const world = await createReplayWorldFor(setup.mapId);
const started = performance.now();
let run = null, error = null;
try {
  run = createReplayRun(recording, world);
  while (run.step());
} catch (caught) { error = caught; }
const wallMs = Math.round(performance.now() - started);
const mismatch = error ?? run?.mismatch ?? null;
const receipt = {
  file, build: recording.header.build, digest: recording.header.replayDigest, map: setup.mapId, mode: setup.gameMode,
  player: setup.playerSpecId, hulls: recording.header.roster.length, recordedSteps: recording.seatSteps.length,
  lastTick: run?.lastTick ?? null, replayedSteps: run?.tick ?? 0, checksums: recording.checksums.length,
  stagedAtTick: recording.end.stagedAtTick, result: recording.end.result, marks: recording.events.length, actions: recording.actions.length,
  holds: !mismatch && !!run && run.tick === run.lastTick, mismatch: mismatch ? { code: mismatch.code ?? 'error', tick: mismatch.tick ?? null, message: mismatch.message } : null,
  wallMs, msPerStep: run?.tick ? Math.round((wallMs / run.tick) * 1000) / 1000 : null,
};
run?.dispose();
if (asJson) console.log(JSON.stringify(receipt, null, 2));
else console.log(receipt.holds
  ? `replay-verify: HOLDS ${receipt.replayedSteps}/${receipt.recordedSteps} steps on ${receipt.map} (${receipt.hulls} hulls, ${receipt.checksums} checksums, ${receipt.marks} marks) in ${wallMs} ms${receipt.stagedAtTick ? `; staged from step ${receipt.stagedAtTick}` : ''}`
  : `replay-verify: MISMATCH at step ${receipt.mismatch?.tick ?? '?'}: ${receipt.mismatch?.message ?? 'stopped early'}`);
process.exitCode = receipt.holds ? 0 : 1;
