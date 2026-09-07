import assert from 'node:assert/strict';
import { LocalShotPrediction } from './localShotPrediction.ts';
import { normalizePlayerInput } from './protocol.ts';
import { createEnvelope, MESSAGE_TYPES } from './protocol.ts';
import { snapshotWireCodec } from './snapshotWireCodec.ts';
import { MatchClientRuntime } from './matchRuntime.ts';
import { createLoopbackTransportPair } from './loopbackTransport.ts';

const ready = { tick: 1, alive: true, shellSlot: 0, reloadS: 0, ammo: 10,
  magazineRounds: 0, magazineCapacity: 0, guided: false, weaponBlocked: false };
const predictor = new LocalShotPrediction();
predictor.observe(ready);
const stateBefore = structuredClone(ready);
const first = predictor.predict(0, 0, 100, 100);
assert.ok(first, 'sequence zero is a valid first shot intent');
first.muzzleIndex = 1;
assert.deepEqual(ready, stateBefore, 'eligibility never writes caller authority state');
assert.equal(predictor.predict(1, 0, 110, 100), null, 'only one unconfirmed prediction');
assert.equal(predictor.confirm(1, 0), null, 'another intent cannot consume the prediction');
assert.equal(predictor.confirm(0, 1), null, 'another weapon channel cannot consume it');
assert.equal(predictor.confirm(0, 0), first);
assert.equal(predictor.confirm(0, 0), null, 'later autocannon shots under the same held intent remain audible');
predictor.observe({ ...ready, tick: 2 });
assert.equal(predictor.predict(2, 0, 150, 150), null, 'fresh packets alone cannot replenish the same readiness epoch');
predictor.observe({ ...ready, tick: 3, ammo: 9, reloadS: 1 });
assert.equal(predictor.predict(2, 0, 200, 200), null);
predictor.observe({ ...ready, tick: 4, ammo: 9 });
assert.ok(predictor.predict(2, 0, 250, 250), 'new confirmed ready cycle permits another fresh intent');
predictor.cancel();
assert.ok(predictor.confirm(2, 0), 'blur cancellation retains bounded dedup for a late accepted shot');
assert.equal(predictor.predict(2, 0, 250, 250), null, 'the same held/retried intent never predicts twice');
predictor.reset();
predictor.observe(ready);
assert.ok(predictor.predict(0, 0, 300, 300), 'new round/life may reuse intent IDs');

for (const state of [
  { alive: false }, { weaponBlocked: true }, { reloadS: 0.001 }, { reloadS: Number.NaN },
  { ammo: 0 }, { ammo: Number.NaN }, { magazineCapacity: 3, magazineRounds: 0 },
]) {
  predictor.reset();
  predictor.observe({ ...ready, ...state });
  assert.equal(predictor.predict(5, 0, 100, 100), null, JSON.stringify(state));
}
predictor.reset();
predictor.observe({ ...ready, guided: true, magazineCapacity: 3, magazineRounds: 0 });
assert.ok(predictor.predict(5, 0, 100, 100), 'ready ATGM channel does not borrow cannon magazine rounds');
predictor.reset();
predictor.observe({ ...ready, magazineCapacity: 3, magazineRounds: 1 });
assert.ok(predictor.predict(6, 0, 100, 100), 'one confirmed loaded magazine round is eligible');
for (const [intent, slot, now, received] of [
  [null, 0, 100, 100], [-1, 0, 100, 100], [1.2, 0, 100, 100], [0x80000000, 0, 100, 100], [1, 1, 100, 100],
  [1, 0, 100, null], [1, 0, 351, 100], [1, 0, 99, 100], [1, 0, Infinity, 100],
]) {
  predictor.reset();
  predictor.observe(ready);
  assert.equal(predictor.predict(intent, slot, now, received), null);
}
predictor.reset();
predictor.observe({ ...ready, tick: 10, reloadS: 1 });
predictor.observe({ ...ready, tick: 9 });
assert.equal(predictor.predict(1, 0, 100, 100), null, 'old readiness cannot override a newer reload');
assert.equal(predictor.confirm(undefined, 0), null);
for (let intent = 0; intent < 100; intent++) {
  predictor.observe({ ...ready, tick: 20 + intent, ammo: 200 - intent });
  assert.ok(predictor.predict(intent, 0, 100, 100));
  predictor.confirm(intent, 0);
}
assert.equal(predictor.confirm(0, 0), null, 'old receipt history is bounded');

const input = { inputSeq: 0, clientTick: 0, throttle: 0, steer: 0,
  aimYaw: 0, aimPitch: 0, shellSlot: 0, fire: true };
assert.equal(normalizePlayerInput({ ...input, fireIntentSeq: 0 }).fireIntentSeq, 0);
assert.equal(normalizePlayerInput(input).fireIntentSeq, undefined, 'cached older clients remain compatible');
for (const fireIntentSeq of [-1, 0.2, Number.NaN, Infinity, '1', 0x80000000]) {
  assert.throws(() => normalizePlayerInput({ ...input, fireIntentSeq }));
}

const packet = createEnvelope(MESSAGE_TYPES.INPUT, { ...input, fireIntentSeq: 17 });
const encoded = snapshotWireCodec.encode(packet);
const wire = JSON.parse(new TextDecoder().decode(encoded));
assert.equal(wire.length, 19);
assert.equal(snapshotWireCodec.decode(encoded).payload.fireIntentSeq, 17);
const encodeRow = (row) => new TextEncoder().encode(JSON.stringify(row));
assert.equal(snapshotWireCodec.decode(encodeRow(wire.slice(0, 18))).payload.fireIntentSeq, undefined);
for (const malformed of [-1, 0.2, '17', 0x80000000, {}]) {
  assert.throws(() => snapshotWireCodec.decode(encodeRow([...wire.slice(0, 18), malformed])));
}
assert.throws(() => snapshotWireCodec.decode(encodeRow([...wire, 0])));

// The protocol uses modulo 2^31 sequences, not uint32. A held/retried fire
// intent retains its origin across wrap; a fresh rise acquires the new ID.
const pair = createLoopbackTransportPair({ direct: true });
const peer = new MatchClientRuntime({ playerId: 'wrap', transport: pair.client });
const sent = [];
pair.host.onMessage((envelope) => {
  if (envelope.type === MESSAGE_TYPES.INPUT) sent.push(snapshotWireCodec.decode(snapshotWireCodec.encode(envelope)).payload);
});
peer.shotFeedbackVersion = 1;
peer.inputSeq = 0x7fffffff;
peer.submitInput(input);
peer.submitInput(input);
assert.deepEqual(sent.map((entry) => entry.inputSeq), [0x7fffffff, 0]);
assert.deepEqual(sent.map((entry) => entry.fireIntentSeq), [0x7fffffff, 0x7fffffff]);
peer.clearPendingInputIntent();
peer.submitInput({ ...input, fire: false });
peer.submitInput(input);
assert.equal(sent.at(-1).fireIntentSeq, 2, 'fresh trigger receives its own post-wrap identity');
peer.shotFeedbackVersion = 0;
peer.submitInput({ ...input, fireIntentSeq: 17 });
assert.equal(sent.at(-1).fireIntentSeq, undefined, 'legacy host cannot receive caller-injected extension');
peer.close(); pair.host.close();
console.log('localShotPrediction.selftest: first-shot readiness, exact confirmation, cancellation and compatibility passed');
