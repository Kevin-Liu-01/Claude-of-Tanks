// A replay file the player opens or drops is checked before any battle is entered (replay-fixes-277): the size before it
// is read, then gzip, the format's magic and version, and the whole recording. A good file (gzipped as Download replay
// saves it, or raw) comes back decoded with its raw bytes; anything else comes back with the reason the Replays tab words
// (replayImportProblemText), never a throw. No world, no DOM. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { encodeReplay, REPLAY_FORMAT_VERSION, SeatStreamWriter } from '../../sim/replayFormat.ts';
import { createSeatControl } from '../../sim/seatControl.ts';
import { checkReplayFile, REPLAY_IMPORT_MAX_BYTES, replayImportSizeProblem } from './replayImport.ts';

const writer = new SeatStreamWriter(1);
const control = [createSeatControl()];
for (let k = 0; k < 600; k++) { control[0].throttle = k % 7; writer.writeStep(control); }
const header = { format: REPLAY_FORMAT_VERSION, build: 'dev', replayDigest: 'dev', driver: 'local', recordedAtMs: 1795578955094,
  setup: { mapId: 'verdant', playerSpecId: 'm1a3' }, roster: [{ id: 'm1a3', specId: 'm1a3', team: 'player', bot: false }], seats: ['m1a3'] };
const raw = encodeReplay({ header, seats: writer.take(), actions: [], events: [[10, 'end', '', '', 0, 0]], checksums: [[600, '0badf00d']],
  end: { ticks: 600, result: 'victory', reason: 'elimination', stagedAtTick: null } });

// a good file, as Download replay saves it (gzipped) and raw
for (const file of [new Uint8Array(gzipSync(raw)), raw]) {
  const checked = await checkReplayFile(file);
  assert.equal(checked.ok, true, 'a recording opens');
  assert.deepEqual([...checked.raw], [...raw], 'its raw bytes come back');
  assert.equal(checked.recording.seatSteps.length, 600);
  assert.equal(checked.recording.header.recordedAtMs, header.recordedAtMs);
}

const problem = async (bytes) => { const checked = await checkReplayFile(bytes); assert.equal(checked.ok, false); return checked.problem; };
// not a replay: another file, raw or gzipped, and an empty one
assert.deepEqual(await problem(new TextEncoder().encode('PNG not a replay at all')), { code: 'not_replay' });
assert.deepEqual(await problem(new Uint8Array(gzipSync(Buffer.from('{"json": true}')))), { code: 'not_replay' });
assert.deepEqual(await problem(new Uint8Array(0)), { code: 'not_replay' });
// another format version: named, with this build's
const future = raw.slice(); future[4] = REPLAY_FORMAT_VERSION + 1;
assert.deepEqual(await problem(future), { code: 'format', version: REPLAY_FORMAT_VERSION + 1, current: REPLAY_FORMAT_VERSION });
// damaged: cut short past its magic, and a gzip stream cut short
assert.deepEqual(await problem(raw.slice(0, Math.floor(raw.length / 2))), { code: 'damaged' });
const gz = new Uint8Array(gzipSync(raw));
assert.deepEqual(await problem(gz.slice(0, Math.floor(gz.length / 2))), { code: 'damaged' });
// too big: refused by its size before a byte is read, and by the check itself
assert.equal(replayImportSizeProblem(REPLAY_IMPORT_MAX_BYTES), null);
assert.deepEqual(replayImportSizeProblem(REPLAY_IMPORT_MAX_BYTES + 1), { code: 'too_big' });
assert.deepEqual(await problem(new Uint8Array(REPLAY_IMPORT_MAX_BYTES + 1)), { code: 'too_big' });
assert.ok(REPLAY_IMPORT_MAX_BYTES >= 100 * gz.length, 'the cap is far above a real recording');

console.log('replayImport: PASS (gzipped and raw recordings open; not a replay, another format, damaged and too big say why)');
