// strikeMissileWire.selftest.mjs — wire 13 (air-support-275): a control's action bits are a u32, for the seventeenth
// action bit, Air Support's Maverick run (sim/playerActions.ts STRIKE_MISSILE = 1 << 16). Pinned on the real path a
// guest's press takes to the host: the control frame through the codec, the seat's input buffer (edge sequences) and the
// authority's fixed step, which takes the call at the crew's aim point and launches four Mavericks; and the version seam:
// a wire-12 frame (a 274 tab's) is refused as a version, never misread as a control, and no bit past the action mask
// crosses. Every older bit keeps its value and its place.
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { createAuthoritativeMatch } from '../../sim/authoritativeMatch.ts';
import { AIR_SUPPORT_RULES as R, AIR_STRIKE_KINDS } from '../../sim/matchRuleset.ts';
import { AIR_STRIKE_BITS, PLAYER_ACTION_BITS } from '../../sim/playerActions.ts';
import { encodeMessage, decodeMessage } from '../wire/codec.ts';
import { ACTION_BIT_MASK, ACTION_BITS, MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION, WIRE_VERSION } from '../wire/constants.ts';
import { quantizeAimDistance } from '../wire/quantize.ts';
import { createSeatInputBuffer } from '../../../server/match/inputBuffer.ts';

// ---- the layout and the bits
assert.equal(WIRE_VERSION, 13, 'wire 13: the u32 action bits');
assert.equal(PROTOCOL_VERSION, 15, 'protocol 15: a 274 tab and a 275 tab never share a match');
assert.equal(AIR_STRIKE_BITS.missile, 1 << 16, 'the Maverick run is the seventeenth bit');
assert.equal(ACTION_BIT_MASK & 0x1ffff, 0x1ffff, 'the mask covers the seventeen bits through the Maverick run (later rows add theirs: actionBitMask.selftest)');
// the sixteen bits of a u16 keep their values (a 274 build and a 275 build differ only by the new one)
assert.deepEqual(Object.entries(PLAYER_ACTION_BITS).filter(([, bit]) => bit < 1 << 16).map(([, bit]) => bit).sort((a, b) => a - b),
  Array.from({ length: 16 }, (_, i) => 1 << i), 'bits 0-15 are the sixteen they were');
const bits = AIR_STRIKE_KINDS.map((kind) => AIR_STRIKE_BITS[kind]);
assert.equal(new Set(bits).size, AIR_STRIKE_KINDS.length, 'one bit a call-in');
assert.ok(bits.every((bit) => (bit & ACTION_BIT_MASK) === bit), 'every call-in\'s bit inside the mask');

const control = (actionBits, actionSeq = 1) => ({ throttle: 0, steer: 0, flags: 0, aimYaw: 0, aimPitch: 0, aimDistance: quantizeAimDistance(260),
  shellSlot: 0, fireSeq: 0, actionSeq, actionBits });
const input = (controls) => ({ type: MESSAGE_TYPE.INPUT, clientTick: 10, snapshotAckTick: NO_TICK, interpDelayMs: 100, controls });
// every bit, the full mask and the missile with the bits beside it round-trip intact
for (const value of [AIR_STRIKE_BITS.missile, ACTION_BIT_MASK, AIR_STRIKE_BITS.missile | ACTION_BITS.SMOKE | AIR_STRIKE_BITS.gunship, 0]) {
  const decoded = decodeMessage(encodeMessage(input([control(value)])));
  assert.ok(decoded.ok && decoded.message.controls[0].actionBits === value, `action bits ${value.toString(16)} cross intact`);
}
// a bit past the mask is refused on both sides of the wire
const outside = Array.from({ length: 31 }, (_, i) => 1 << i).find((bit) => !(bit & ACTION_BIT_MASK));
assert.throws(() => encodeMessage(input([control(outside)])), (error) => error.code === 'range', 'the encoder refuses a bit past the mask');
const forged = encodeMessage(input([control(AIR_STRIKE_BITS.missile)]));
const view = new DataView(forged.buffer, forged.byteOffset, forged.byteLength);
// the control's u32 is its last four bytes, little-endian (bytes.ts): every bit past the mask set
assert.equal(view.getUint32(forged.byteLength - 4, true), AIR_STRIKE_BITS.missile, 'the frame ends with the control\'s action bits');
view.setUint32(forged.byteLength - 4, (0xfffe0000 | view.getUint32(forged.byteLength - 4, true)) >>> 0, true);
assert.equal(decodeMessage(forged).ok, false, 'a decoded frame with a bit past the mask is refused');
// the version seam: the same frame stamped wire 12 is a version error, never a control misread at 16 B
const old = new Uint8Array(encodeMessage(input([control(AIR_STRIKE_BITS.missile)])));
old[0] = 12;
const refused = decodeMessage(old);
assert.ok(!refused.ok && refused.error?.code === 'bad_version', `a wire-12 frame is refused as its version (${refused.error?.code})`);

// ---- the press through the seat into the authority: the call at the aim point, four Mavericks
await ensureAuthorityFleet(['m1a1_abrams_hc']);
const flat = { getHeightAt: () => 0, getGroundType: () => 'hard', getNormalAt: () => new Vector3(0, 1, 0) };
function host() {
  const match = createAuthoritativeMatch({ gameMode: 'air_support', countdownS: 0, mapId: 'verdant', seed: 31,
    worldCollision: { mapId: 'verdant', heightField: flat, getObstacles: () => [] },
    players: [{ id: 'caller', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: 0, yaw: 0 } },
      { id: 'e1', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 260, yaw: Math.PI } }] });
  match.onMatchReady();
  const air = match.modeController.airSupport;
  const saved = air.capture(); saved.points = saved.points.map(([id]) => [id, id === 'caller' ? R.points.cap : 0]); air.restore(saved);
  const seat = createSeatInputBuffer(), events = [];
  let tick = 0, seq = 0;
  const frame = (press) => {
    if (press) seq = (seq + 1) & 0xffff;
    const decoded = decodeMessage(encodeMessage({ type: MESSAGE_TYPE.INPUT, clientTick: tick, snapshotAckTick: NO_TICK, interpDelayMs: 0,
      controls: [control(press ? AIR_STRIKE_BITS.missile : 0, seq)] }));
    assert.ok(decoded.ok);
    seat.admit(decoded.message, tick);
    tick++;
    const next = seat.inputFor(tick);
    if (press) assert.equal(next.actionBits, AIR_STRIKE_BITS.missile, 'the seat hands the authority the Maverick press');
    match.step({ dt: 1 / 60, inputs: new Map([['caller', next]]) });
    for (const event of match.eventsForViewer('e1')) events.push({ type: event.type, kind: event.kind, strikeId: event.strikeId, timeS: event.timeS });
    match.afterEventBroadcast();
    for (const id of ['caller', 'e1']) { const e = match.entityById.get(id); if (!e.combat.destroyed) e.state.speed = 0; }
  };
  return { frame, events };
}
function script() {
  const h = host();
  for (let i = 0; i < 12; i++) h.frame(false);
  h.frame(true);
  for (let i = 0; i < 60 * 14; i++) h.frame(false);
  return h.events;
}
const a = script();
const called = a.filter((e) => e.type === 'mode_strike_called');
assert.equal(called.length, 1, 'the press calls one strike');
assert.equal(called[0].kind, 'missile', 'the Maverick run');
const rounds = a.filter((e) => e.type === 'mode_strike_round' && e.strikeId === called[0].strikeId);
assert.equal(rounds.length, R.missile.missiles, `${R.missile.missiles} Mavericks leave`);
assert.deepEqual(script(), a, 'two hosts given the same frames agree on every event');
console.log(`strikeMissileWire: wire ${WIRE_VERSION} / protocol ${PROTOCOL_VERSION}: the seventeenth action bit crosses the codec and the seat; a wire-12 frame is refused as a version; the press calls the Maverick run and its ${rounds.length} missiles, identically on two hosts`);
