// The recording's bytes and the seat stage (replay-system-275, docs/REPLAY.md §1): no world, no fleet.
//  - seat controls round-trip exactly through the SEATS stream (random walks of every field, a seat that never moves);
//  - the stage is a fixed point: a hull's controls captured, applied, then captured again give the same integers, and
//    applying the same integers to a hull at the same place gives the same floats and aim point, bit for bit (the
//    live stage and a replay leave the step the same input);
//  - every section survives encode/decode; a wrong magic, another format and a cut file are refused by code.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { REPLAY_FORMAT_VERSION, ReplayFormatError, SeatStreamWriter, decodeReplay, encodeReplay } from './replayFormat.ts';
import { SEAT_CONTROL_FIELDS, applySeatControl, captureSeatControl, createSeatControl } from './seatControl.ts';

let seed = 7;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

// ---- the stream: two seats, 3000 steps, every field walking; seat 1 never moves ----
const steps = [];
const live = [createSeatControl(), createSeatControl()];
const writer = new SeatStreamWriter(2);
for (let k = 0; k < 3000; k++) {
  const c = live[0];
  if (rand() < 0.3) c.throttle = Math.round(rand() * 254) - 127;
  if (rand() < 0.3) c.steer = Math.round(rand() * 254) - 127;
  c.flags = rand() < 0.1 ? Math.floor(rand() * 8) : c.flags;
  c.aimYaw = (c.aimYaw + Math.round((rand() - 0.5) * 200) + 65536) & 65535;
  c.aimPitch = Math.max(-32767, Math.min(32767, c.aimPitch + Math.round((rand() - 0.5) * 40)));
  c.aimDistance = Math.max(0, Math.min(65535, c.aimDistance + Math.round((rand() - 0.5) * 100)));
  if (rand() < 0.01) c.shellSlot = Math.floor(rand() * 3);
  if (rand() < 0.02) c.actionBits = Math.floor(rand() * 65536);
  if (rand() < 0.02) c.auxiliaryBits = Math.floor(rand() * 65536);
  if (rand() < 0.01) c.fireIntentSeq = rand() < 0.5 ? -1 : Math.floor(rand() * 1e6);
  writer.writeStep(live);
  steps.push(live.map((control) => ({ ...control })));
}
const seatBytes = writer.take();
const header = { format: REPLAY_FORMAT_VERSION, build: 'dev', replayDigest: 'dev', driver: 'local', recordedAtMs: 0, setup: { mapId: 'verdant' },
  roster: [{ id: 'p', specId: 'm1a1_abrams_hc', team: 'player', bot: false }], seats: ['p', 'q'] };
const parts = { header, seats: seatBytes, actions: [{ tick: 3, seat: 0, kind: 'selectShell', args: [1] }],
  events: [[10, 'kill:shot', 'b1', 'p', 1.5, -2.25]], checksums: [[600, '0badf00d']], end: { ticks: 3000, result: 'victory', reason: 'elimination', stagedAtTick: null } };
const bytes = encodeReplay(parts);
const back = decodeReplay(bytes);
assert.equal(back.seatSteps.length, 3000, 'every step read back');
for (let k = 0; k < 3000; k++) for (let s = 0; s < 2; s++) {
  for (const key of SEAT_CONTROL_FIELDS) assert.equal(back.seatSteps[k][s][key], steps[k][s][key], `step ${k} seat ${s} ${key}`);
}
assert.deepEqual(back.header, header);
assert.deepEqual(back.actions, parts.actions);
assert.deepEqual(back.events, parts.events);
assert.deepEqual(back.checksums, parts.checksums);
assert.deepEqual(back.end, parts.end);
const idleSeatBytes = 3000; // seat 1 never moves: one mask byte a step
assert.ok(seatBytes.length < idleSeatBytes + 3000 * 9, `the stream is compact (${seatBytes.length} bytes for 3000 steps of two seats)`);

// ---- refusals ----
const refused = (data, code) => assert.throws(() => decodeReplay(data), (error) => error instanceof ReplayFormatError && error.code === code, code);
refused(new TextEncoder().encode('PNG!xxxx'), 'not_a_replay');
const newer = bytes.slice(); newer[4] = REPLAY_FORMAT_VERSION + 1;
refused(newer, 'format_version');
refused(bytes.slice(0, bytes.length - 3), 'truncated');

// ---- the stage is a fixed point ----
const hull = () => ({ state: { pos: new Vector3(120.37, 14.2, -88.91) }, aerial: null, input: { throttle: 0.73, steer: -1, brake: false,
  fire: true, aimLocked: false, shellSlot: 1, actionBits: 64, auxiliaryBits: 2048, fireIntentSeq: 12, aimPoint: new Vector3(412.123456, 19.98, 57.000321) } });
const a = hull(), b = hull();
const first = captureSeatControl(a, createSeatControl());
applySeatControl(a, first);
const second = captureSeatControl(a, createSeatControl());
for (const key of SEAT_CONTROL_FIELDS) assert.equal(second[key], first[key], `capture after apply keeps ${key}`);
applySeatControl(b, first);
for (const key of ['throttle', 'steer', 'brake', 'fire', 'aimLocked', 'shellSlot', 'actionBits', 'auxiliaryBits', 'fireIntentSeq']) {
  assert.ok(Object.is(a.input[key], b.input[key]), `apply gives the same ${key}`);
}
for (const axis of ['x', 'y', 'z']) assert.ok(Object.is(a.input.aimPoint[axis], b.input.aimPoint[axis]), `apply gives the same aim ${axis}`);
assert.ok(a.input.aimPoint.distanceTo(new Vector3(412.123456, 19.98, 57.000321)) < 0.05, 'the staged aim is within the wire resolution of the frame\'s');

console.log(`replayFormat.selftest: 3000 steps of two seats round-trip in ${seatBytes.length} bytes; header, actions, marks, checksums and end `
  + 'survive; a wrong magic, a newer format and a cut file are refused by code; the seat stage is a fixed point');
