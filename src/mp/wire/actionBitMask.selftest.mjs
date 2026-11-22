// actionBitMask.selftest.mjs — the wire's action mask is the action table's (turbo-spin-275; the coordinator, 2026-11-22:
// three 275 lanes add action bits, so the mask is derived and a new row needs no second edit). Copyright (c) 2026 Kevin B. Liu.
//
// Pins: ACTION_BIT_MASK is the OR of every PLAYER_ACTION_BITS row; every row is one distinct bit inside the u32; Turbo and
// the air spin are bits 18 and 19 (beside death-flow-275's scuttle at 17); every named bit crosses the codec alone and all together; a bit no row names (a gap,
// such as a reserved one, or the bits past the table) is refused by the encoder and by the decoder.
import assert from 'node:assert/strict';
import { PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
import { decodeMessage, encodeMessage } from './codec.ts';
import { ACTION_BIT_MASK, ACTION_BITS, MESSAGE_TYPE, NO_TICK } from './constants.ts';
import { quantizeAimDistance } from './quantize.ts';

const rows = Object.entries(PLAYER_ACTION_BITS);
const derived = rows.reduce((mask, [, bit]) => (mask | bit) >>> 0, 0);
assert.equal(ACTION_BIT_MASK, derived, 'the wire mask is the OR of the action table');
assert.equal(ACTION_BITS, PLAYER_ACTION_BITS, 'the wire names the simulation\'s table');
for (const [name, bit] of rows) {
  assert.ok(Number.isInteger(Math.log2(bit)) && bit >= 1 && bit <= 2 ** 31, `${name} is one bit of the u32`);
}
assert.equal(new Set(rows.map(([, bit]) => bit)).size, rows.length, 'no two rows share a bit');
assert.equal(PLAYER_ACTION_BITS.SCUTTLE, 1 << 17, 'the scuttle is bit 17 (death-flow-275)');
assert.equal(PLAYER_ACTION_BITS.TURBO, 1 << 18, 'Turbo is bit 18');
assert.equal(PLAYER_ACTION_BITS.AIR_SPIN, 1 << 19, 'the air spin is bit 19');

const control = (actionBits) => ({ throttle: 0, steer: 0, flags: 0, aimYaw: 0, aimPitch: 0, aimDistance: quantizeAimDistance(100),
  shellSlot: 0, fireSeq: 0, actionSeq: 1, actionBits });
const input = (bits) => ({ type: MESSAGE_TYPE.INPUT, clientTick: 5, snapshotAckTick: NO_TICK, interpDelayMs: 100, controls: [control(bits)] });
for (const bits of [...rows.map(([, bit]) => bit), ACTION_BIT_MASK, PLAYER_ACTION_BITS.TURBO | PLAYER_ACTION_BITS.AIR_SPIN | PLAYER_ACTION_BITS.SELF_RIGHT]) {
  const decoded = decodeMessage(encodeMessage(input(bits)));
  assert.ok(decoded.ok && decoded.message.controls[0].actionBits === bits, `bits ${bits.toString(16)} cross intact`);
}
const unnamed = Array.from({ length: 32 }, (_, i) => (2 ** i) >>> 0).filter((bit) => !(bit & ACTION_BIT_MASK));
assert.ok(unnamed.length > 0, 'the u32 has bits no row names');
for (const bit of unnamed) {
  assert.throws(() => encodeMessage(input(bit)), (error) => error.code === 'range', `the encoder refuses unnamed bit ${Math.log2(bit)}`);
  const frame = encodeMessage(input(PLAYER_ACTION_BITS.TURBO));
  const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
  view.setUint32(frame.byteLength - 4, (PLAYER_ACTION_BITS.TURBO | bit) >>> 0, true);
  assert.equal(decodeMessage(frame).ok, false, `the decoder refuses unnamed bit ${Math.log2(bit)}`);
}
console.log(`actionBitMask: the wire mask 0x${ACTION_BIT_MASK.toString(16)} is the OR of ${rows.length} action rows; Turbo 18 and the air spin 19 cross the codec; ${unnamed.length} unnamed bits refused both ways`);
