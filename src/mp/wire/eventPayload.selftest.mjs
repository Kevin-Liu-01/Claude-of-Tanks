// Binary event payloads (wire 8, mp-scale-251; eventPayload.ts): a decoded payload is exactly the object JSON.parse gives
// for the payload serialized with its numbers at four decimals (eventPayloadJson), on crafted edge cases and on every
// event a real battle's authority emits; the payloads are much smaller than their JSON; the codec frames, bounds and
// pre-encoded payloads hold.
import assert from 'node:assert/strict';
import { ByteReader } from './bytes.ts';
import { MAX_EVENT_JSON_BYTES, MESSAGE_TYPE, NO_TICK, PROTOCOL_VERSION } from './constants.ts';
import { decodeMessage, encodeMessage } from './codec.ts';
import { EVENT_PAYLOAD_KEYS, createEventPayloadCache, encodeEventPayload, eventPayloadJson, readEventPayload } from './eventPayload.ts';

const roundTrip = (payload) => readEventPayload(new ByteReader(encodeEventPayload(payload)));
const asJson = (payload) => JSON.parse(eventPayloadJson(payload));

// ---- the edge cases: what JSON would do, value for value
const nested = { a: { b: { c: { d: { e: { f: { g: { h: [1, [2, [3, { deep: 4.56789 }]]] } } } } } } } };
const proto = JSON.parse('{"__proto__": {"polluted": true}, "x": 1}');
const crafted = [
  { type: 'shell_fired', timeS: 12.345678912, x: -123.456789, y: 0.000049, z: 1e-7, id: 'p1', guided: false },
  { n: -0, nan: NaN, inf: Infinity, ninf: -Infinity, big: 2 ** 40, bigNeg: -(2 ** 40) - 0.5, huge: 1.5e300, tiny: -1e-300 },
  { i32max: 2147483647, i32min: -2147483648, over: 2147483648, decimalEdge: 214748.3647, decimalOver: 214748.3648 },
  { text: 'naïve 🚀 坦克 "quoted" \\ back\nline', empty: '', nul: null, t: true, f: false },
  { undefinedMember: undefined, fn() {}, sym: Symbol('s'), kept: 1, arr: [undefined, () => 0, Symbol('x'), null, 2] },
  { typed: new Float64Array([1.123456789, -2]), date: new Date(0), boxed: new Number(3.14159), set: new Set([1]), map: new Map([[1, 2]]) },
  { unknownKeyNotInTable: 1, 'with space': 2, '': 3, [String(EVENT_PAYLOAD_KEYS[0])]: 'type key' },
  nested,
  proto,
  Object.assign(Object.create(null), { nullProto: 1.5, inner: Object.assign(Object.create(null), { z: -2 }) }),
  { toJSONInside: { toJSON() { return { replaced: 7.123456 }; } } },
  { sparse: [1, , 3], localDir: [0.7071067811865476, 0, -0.7071067811865476] }, // eslint-disable-line no-sparse-arrays
];
for (const payload of crafted) {
  const decoded = roundTrip(payload);
  assert.deepEqual(decoded, asJson(payload), `round trip equals JSON for ${eventPayloadJson(payload).slice(0, 80)}`);
}
assert.ok(Object.prototype.hasOwnProperty.call(roundTrip(proto), '__proto__') && !({}).polluted, 'a __proto__ key stays an own property');
assert.equal(Object.is(roundTrip({ n: -0 }).n, 0), true, '-0 reads as 0, as JSON has it');
assert.equal(roundTrip({ x: 0.30000000000000004 }).x, 0.3, 'four decimals');

// ---- the codec: framed, bounded, pre-encoded alike
const events = crafted.slice(0, 4).map((payload, index) => ({ kind: index === 0 ? 'shell_fired' : 'custom_kind', payload }));
const bytes = encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: 42, events });
const decodedMessage = decodeMessage(bytes);
assert.ok(decodedMessage.ok, decodedMessage.ok ? '' : decodedMessage.error.message);
assert.deepEqual(decodedMessage.message.events.map((event) => event.payload), events.map((event) => asJson(event.payload)));
assert.deepEqual(decodedMessage.message.events.map((event) => event.kind), ['shell_fired', 'custom_kind', 'custom_kind', 'custom_kind']);
const cache = createEventPayloadCache();
const preEncoded = encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: 42, events: events.map((event) => ({ ...event, encoded: cache(event.payload) })) });
assert.deepEqual(preEncoded, bytes, 'a pre-encoded payload writes the same bytes');
assert.equal(cache(events[0].payload), cache(events[0].payload), 'encoded once per payload object');
assert.throws(() => encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: 1, events: [{ kind: 'chat', payload: { text: 'x'.repeat(MAX_EVENT_JSON_BYTES) } }] }),
  (error) => error.code === 'bad_length', 'a payload over the bound is refused');
assert.throws(() => encodeEventPayload({ big: 10n }), (error) => error.code === 'bad_json', 'a bigint has no JSON');
const badTag = bytes.slice(); badTag[9] = 0xee;
assert.equal(decodeMessage(badTag).error.code, 'bad_json', 'a payload that is not an object');
const truncated = bytes.slice(0, bytes.length - 3);
assert.ok(!decodeMessage(truncated).ok, 'a truncated payload is a typed rejection, never a throw');
const lying = encodeMessage({ type: MESSAGE_TYPE.EVENT, tick: 1, events: [{ kind: 'chat', payload: { x: 1, y: 2 } }] }).slice();
lying[8] = lying[8] - 1; // the length prefix one short: the section ends before the payload does
assert.ok(!decodeMessage(lying).ok, 'a payload longer than its length is rejected');
void PROTOCOL_VERSION;

// ---- every event of a real battle (Verdant, 8v8 bots and a firing seat, 30 s on the dedicated collision): equal to its JSON, smaller
const { createMatchActor } = await import('../../../server/match/matchActor.ts');
const { createLoopbackLink } = await import('../../../server/match/link.ts');
await import('../../vehicles/tankFactory.ts');
const { ALL_TANK_IDS, getSpec } = await import('../../vehicles/specs.ts');
const specs = ALL_TANK_IDS.filter((id) => ['mbt', 'medium'].includes(getSpec(id).role)).slice(0, 8);
const bots = [];
for (const team of ['alpha', 'bravo']) for (let n = 0; n < 8; n++) bots.push({ playerId: `bot-${team}-${n}`, name: `B${n}`, team, specId: specs[n] });
let nowMs = 0;
const actor = createMatchActor({
  roomId: 'event-payloads', mapId: 'verdant', seed: 77, countdownS: 0, world: 'dedicated', bots,
  seats: [
    { seat: 0, playerId: 'watch', name: 'Watch', team: 'spectator', specId: '' },
    { seat: 1, playerId: 'gunner', name: 'Gunner', team: 'alpha', specId: specs[0] },
  ],
  now: () => nowMs, schedule: () => () => {},
});
const seen = [];
const original = actor.authority.eventsForViewer.bind(actor.authority);
// the spectator's view (every event, whole): what its link receives
actor.authority.eventsForViewer = (viewerId) => { const out = original(viewerId); if (viewerId === 'spectator:watch') seen.push(...out); return out; };
const link = createLoopbackLink('watch');
const received = [];
// (the room's own roster, admin and chat events are the actor's, not the authority's)
link.client.onMessage((message) => {
  const decoded = decodeMessage(message);
  if (decoded.ok && decoded.message.type === MESSAGE_TYPE.EVENT) received.push(...decoded.message.events.filter((event) => !['roster', 'admin', 'chat'].includes(event.kind)));
});
actor.attach(link.server, { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: '', clientBuild: 'payloads' },
  { v: 1, roomId: actor.roomId, seat: 0, playerId: 'watch', name: 'Watch', team: 'spectator', specId: '', iat: 0, exp: 1 });
// a seated gunner fires every half second (shell_fired, its impacts and hits beside the bots' own)
const gunner = createLoopbackLink('gunner');
gunner.client.onMessage(() => {});
actor.attach(gunner.server, { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: '', clientBuild: 'payloads' },
  { v: 1, roomId: actor.roomId, seat: 1, playerId: 'gunner', name: 'Gunner', team: 'alpha', specId: specs[0], iat: 0, exp: 1 });
let fireSeq = 0;
for (let tick = 0; tick < 1800; tick++) {
  if (tick % 30 === 0) fireSeq = (fireSeq + 1) & 0xffff;
  gunner.client.send(encodeMessage({
    type: MESSAGE_TYPE.INPUT, clientTick: actor.tick + 2, snapshotAckTick: NO_TICK, interpDelayMs: 100,
    controls: [{ throttle: 0, steer: 0, flags: 0, aimYaw: 0, aimPitch: 0, aimDistance: 4000, shellSlot: 0, fireSeq, actionSeq: 0, actionBits: 0 }],
  }));
  await Promise.resolve();
  nowMs += 1000 / 60;
  actor.advance(nowMs);
  if (tick % 60 === 0) await new Promise((resolve) => setImmediate(resolve));
}
actor.stop();
assert.ok(seen.length >= 40, `the battle emitted events (${seen.length})`);
const kinds = new Set(seen.map((event) => String(event.type)));
assert.ok(kinds.has('shell_fired') && kinds.has('world_prop_destroyed'), `shots and crushed props among them (${[...kinds].join(', ')})`);
let jsonBytes = 0, binaryBytes = 0;
for (const event of seen) {
  assert.deepEqual(roundTrip(event), asJson(event), `${event.type}: decodes to its JSON`);
  jsonBytes += eventPayloadJson(event).length;
  binaryBytes += encodeEventPayload(event).byteLength;
}
assert.equal(received.length, seen.length, 'every event reached the spectator');
for (let index = 0; index < seen.length; index++) assert.deepEqual(received[index].payload, asJson(seen[index]), 'over the wire alike');
assert.ok(binaryBytes <= jsonBytes * 0.45, `the payloads are under half their JSON (${binaryBytes} of ${jsonBytes} bytes)`);
console.log(`eventPayload.selftest: ${crafted.length} edge cases and ${seen.length} battle events (${[...kinds].sort().join(', ')}) decode to their JSON; `
  + `${binaryBytes} bytes in binary for ${jsonBytes} of rounded JSON (${(100 * binaryBytes / jsonBytes).toFixed(0)} %); framed, bounded and pre-encoded alike PASS`);
