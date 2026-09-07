import assert from 'node:assert/strict';
import { LocalConfirmedShotQueue } from './localConfirmedShotQueue.ts';
import { MatchClientRuntime } from './matchRuntime.ts';
import { createLoopbackTransportPair } from './loopbackTransport.ts';
import { createEnvelope, MESSAGE_TYPES } from './protocol.ts';
import { captureWorldSnapshot } from './snapshot.ts';
import { PresentationEventQueue } from './presentationEventQueue.ts';

const shot = (shellId, shooterId = 'own', shellType = 'APFSDS') => ({
  type: 'shell_fired', shellId, shooterId, shellType,
});
const queue = new LocalConfirmedShotQueue('own');
const target = [];
assert.equal(queue.take({ type: 'shell_hit', shooterId: 'own', shellId: 1 }), false);
assert.equal(queue.take(shot(1, 'enemy')), false);
assert.equal(queue.take(shot(Number.NaN)), false);
assert.equal(queue.take(shot(-1)), false);
assert.equal(queue.take(shot(1)), true);
assert.equal(queue.take(shot(1)), true, 'duplicate confirmation is consumed without replay');
queue.drain(target);
assert.equal(target.length, 1);
queue.clearPending();
assert.equal(queue.take(shot(1)), true);
queue.drain(target);
assert.equal(target.length, 0, 'transport recovery retains same-round dedup history');
queue.reset();
queue.take(shot(1));
queue.drain(target);
assert.equal(target.length, 1, 'new matches may reuse shell identifiers');
for (let id = 2; id <= 129; id++) queue.take(shot(id));
assert.throws(() => queue.take(shot(130)), /backlog/);
queue.reset();
for (let id = 0; id < 300; id++) {
  queue.take(shot(id));
  queue.drain(target);
  assert.equal(target.length, 1, 'sustained confirmed autocannon shots do not coalesce');
}

let now = 1900;
const link = createLoopbackTransportPair({ direct: true });
const client = new MatchClientRuntime({ playerId: 'own', transport: link.client,
  clock: () => now, interpolationDelayMs: 100, maxInterpolationDelayMs: 100 });
let sequence = 0;
function sendBatch(tick, events, roomRound = undefined) {
  link.host.send(createEnvelope(MESSAGE_TYPES.EVENT, { tick, events,
    ...(roomRound == null ? {} : { roomRound }) }, { seq: sequence++, tick }));
}
for (const tick of [114, 117, 120]) {
  now = tick * 1000 / 60;
  link.host.send(createEnvelope(MESSAGE_TYPES.SNAPSHOT, captureWorldSnapshot({
    tick, serverTimeMs: now, entities: [], viewerId: 'own',
  }), { seq: sequence++, tick }));
}
const observed = [];
client.onEvent((event) => observed.push(event));
const volley = Array.from({ length: 14 }, (_, index) => shot(index, index === 13 ? 'own' : `bot-${index}`));
sendBatch(120, volley);
const delayed = client.drainEventsThrough(client.update(now).tick);
assert.equal(delayed.length, 0, 'the remote chronology has not reached the shot yet');
client.drainLocalShotEvents(target);
assert.deepEqual(target, [volley[13]], 'own shot is available at receipt, before interpolation and the 13 remote shots');
assert.equal(now, 2000);
assert.equal(observed.length, 14, 'ordinary event observers see every original authoritative event once');
const presented = [];
const presentation = new PresentationEventQueue({ emit: (event) => presented.push(event) });
for (let frame = 0; frame < 40; frame++) {
  now = 2000 + frame * 1000 / 60;
  presentation.enqueue(client.drainEventsThrough(client.update(now).tick));
  presentation.flush();
}
assert.deepEqual(presented, volley.slice(0, 13), 'remote order/budget remains intact and own feedback never repeats');
sendBatch(121, [shot(13), shot(14, 'own', 'HEAT'), { type: 'ammo_empty', id: 'own' }]);
client.drainLocalShotEvents(target);
assert.deepEqual(target, [shot(14, 'own', 'HEAT')], 'ATGM/alternate round confirmation is independent of earlier gun shots');
assert.deepEqual(client.drainEventsThrough(121), [{ type: 'ammo_empty', id: 'own' }],
  'denials remain authoritative events, never muzzle flashes');
client.resetForRound(2);
sendBatch(1, [shot(14)], 1);
client.drainLocalShotEvents(target);
assert.equal(target.length, 0, 'late previous-round confirmation cannot leak across reset');
sendBatch(1, [shot(14)], 2);
client.drainLocalShotEvents(target);
assert.equal(target.length, 1, 'same shell ID is valid after round reset');
sendBatch(2, [shot(15)], 2);
client.requestReconnect('test_cancel');
client.drainLocalShotEvents(target);
assert.equal(target.length, 0, 'connection cancellation discards unplayed local feedback');
client.close();

// Other consumers keep the original delayed API unless they explicitly opt in.
const legacyLink = createLoopbackTransportPair({ direct: true });
const legacy = new MatchClientRuntime({ playerId: 'own', transport: legacyLink.client });
legacyLink.host.send(createEnvelope(MESSAGE_TYPES.EVENT, { tick: 1, events: [shot(1)] }, { seq: 0, tick: 1 }));
assert.deepEqual(legacy.drainEventsThrough(1), [shot(1)]);
legacy.close();
console.log('localConfirmedShotQueue.selftest: authority-only fast feedback, bounded dedup, chronology and lifecycle passed');
