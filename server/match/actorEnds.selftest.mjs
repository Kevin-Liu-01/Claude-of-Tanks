// Proof (implicit state machine audit M3, 2026-11-02): three smaller ends of the match actor.
//   - an actor that stops itself (its linger after the verdict) leaves the match service at once: it lingered in
//     `service.actors` (its authority, histories and per-viewer state; /metrics and stats().actors counting it) until
//     the next createActor; the room still reads its verdict (control API, LAN host) from the reading the service keeps;
//   - a WELCOME that cannot be sent (the link closed under it: send returns false without a throw) detaches the seat:
//     it stayed seated and marked connected;
//   - a roster event raised by a detach inside an event batch's send loop goes out after that batch, at its tick: it
//     was broadcast re-entrantly, so the remaining clients read it first, stamped one tick behind the batch.
import assert from 'node:assert/strict';
import { createMatchActor } from './matchActor.ts';
import { createMatchService } from './service.ts';
import { createInProcessMatchHost } from '../rooms/localRoomService.ts';
import { decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { MESSAGE_TYPE, PROTOCOL_VERSION } from '../../src/mp/wire/constants.ts';
import { ensureAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';

// alice and bob face each other 60 m apart: the authority's first spotting pass is an event batch for both
const seats = [
  { seat: 0, playerId: 'alice', name: 'Alice', team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: 0, z: 0, yaw: 0 } },
  { seat: 1, playerId: 'bob', name: 'Bob', team: 'bravo', specId: 't90am', spawn: { x: 0, z: 60, yaw: Math.PI } },
  { seat: 2, playerId: 'carl', name: 'Carl', team: 'alpha', specId: 'm1a1_abrams_hc', spawn: { x: -300, z: -300, yaw: 0 } },
];
await ensureAuthorityFleet(seats.map((seat) => seat.specId));
const TICK_MS = 1000 / 60;
const hello = encodeMessage({ type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 0, token: 'unused', clientBuild: 'dev' });
const claimsFor = (roomId, seat) => ({ v: 1, roomId, seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, iat: 0, exp: Number.MAX_SAFE_INTEGER });
/** A ClientLink that records what it is sent; once `throwOn` is set, a send of that message type throws. */
function link(label, { closed = false } = {}) {
  const frames = [];
  let onClose = null;
  return {
    label, frames, throwOn: null, get bufferedAmount() { return 0; }, get closed() { return closed; },
    send(bytes) {
      const decoded = decodeMessage(bytes);
      if (this.throwOn !== null && decoded.ok && decoded.message.type === this.throwOn) throw new Error('channel gone');
      frames.push(decoded.ok ? decoded.message : null);
    },
    close() { if (closed) return; closed = true; onClose?.(); },
    onMessage() {}, onClose(listener) { onClose = listener; },
  };
}
const decodeHello = () => { const decoded = decodeMessage(hello); assert.ok(decoded.ok); return decoded.message; };

// ---- a WELCOME that cannot be sent detaches the seat
{
  const actor = createMatchActor({ roomId: 'welcome', mapId: 'verdant', seed: 1, seats, bots: [], world: 'terrain', countdownS: 0, autoStart: false, now: () => 0, schedule: () => () => {} });
  const attached = actor.attach(link('closed', { closed: true }), decodeHello(), claimsFor('welcome', seats[0]));
  assert.equal(attached, false, 'the attach reports the failed WELCOME');
  assert.equal(actor.clientStats().length, 0, `the seat is not left seated (${actor.clientStats().map((entry) => entry.playerId).join(',')})`);
  assert.equal(actor.authority.entityById.get('alice').connected, false, 'nor its entity marked connected');
  actor.stop();
}

// ---- a roster event raised inside a batch's send loop follows the batch, at its tick
{
  let nowMs = 0;
  const actor = createMatchActor({ roomId: 'roster', mapId: 'verdant', seed: 1, seats, bots: [], world: 'terrain', countdownS: 0, autoStart: false, now: () => nowMs, schedule: () => () => {} });
  const alice = link('alice');
  const bob = link('bob');
  // alice's channel dies under her first event batch; bob is attached after her, so the batch reaches him after her failed send
  assert.equal(actor.attach(alice, decodeHello(), claimsFor('roster', seats[0])), true);
  assert.equal(actor.attach(bob, decodeHello(), claimsFor('roster', seats[1])), true);
  alice.throwOn = MESSAGE_TYPE.EVENT;
  bob.frames.length = 0;
  actor.start();
  for (let n = 0; n < 6; n++) { nowMs += TICK_MS; actor.advance(nowMs); }
  const events = bob.frames.filter((frame) => frame?.type === MESSAGE_TYPE.EVENT);
  const kinds = events.map((frame) => frame.events.map((event) => event.kind).join('+'));
  const rosterAt = events.findIndex((frame) => frame.events.some((event) => event.kind === 'roster'));
  const batchAt = events.findIndex((frame) => frame.events.some((event) => event.kind === 'tank_spotted'));
  assert.ok(rosterAt >= 0 && batchAt >= 0, `bob received the batch and alice's roster change (${kinds.join(', ')})`);
  assert.ok(batchAt < rosterAt, `the roster change follows the batch it interrupted (${kinds.join(', ')})`);
  assert.equal(events[rosterAt].tick, events[batchAt].tick, `stamped at the batch's tick (${events[rosterAt].tick} vs ${events[batchAt].tick})`);
  actor.stop();
}

// ---- an actor that stops itself leaves the service; its verdict stays readable
{
  let nowMs = 0;
  const service = await createMatchService({ seatSecret: 'actor-ends-seat-secret-0123456789', worldKernels: null, now: () => nowMs, log: { child() { return this; }, info() {}, warn() {}, error() {}, debug() {} } });
  try {
    const actor = service.createActor({ roomId: 'ENDS01', mapId: 'verdant', seed: 2, seats, bots: [], world: 'terrain', countdownS: 0, battleLimitS: 1, endedLingerTicks: 30, schedule: () => () => {} });
    for (let n = 0; n < 300 && !actor.stopped; n++) { nowMs += TICK_MS; actor.advance(nowMs); }
    assert.ok(actor.stopped && actor.authority.result, 'setup: the actor reached its verdict and stopped itself');
    assert.equal(service.actors.has('ENDS01'), false, 'the stopped actor left the service (before: it stayed until the next createActor)');
    assert.equal(service.stats().actors, 0, 'stats().actors no longer counts it');
    const host = createInProcessMatchHost({ matchService: service, world: 'terrain' });
    const status = await host.status('ENDS01');
    assert.equal(status?.phase, 'stopped', `the LAN host still reads it (${JSON.stringify(status)})`);
    assert.equal(status?.verdict?.result, actor.authority.result, 'with its verdict');
    const { port } = service.address;
    const response = await fetch(`http://127.0.0.1:${port}/control/matches/ENDS01`, { headers: { authorization: 'Bearer actor-ends-seat-secret-0123456789' } });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.phase, 'stopped', 'and the control API');
    assert.equal(body.verdict?.result, actor.authority.result);
    // the room's next match replaces the reading
    const next = service.createActor({ roomId: 'ENDS01', mapId: 'verdant', seed: 3, seats, bots: [], world: 'terrain', countdownS: 0, autoStart: false, schedule: () => () => {} });
    assert.equal(service.matchStatusSource('ENDS01'), next, 'a new match for the room is read from its own actor');
    next.stop();
  } finally {
    await service.close();
  }
}
console.log('actorEnds: a self-stopped actor leaves the service with its verdict readable, a WELCOME that cannot be sent detaches the seat, and a roster change follows the batch it interrupted');
