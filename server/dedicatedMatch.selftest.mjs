import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { beginDedicatedClientMatch, connectDedicatedMatch } from '../src/net/dedicatedClient.ts';
import { DedicatedMatchRegistry } from './dedicatedMatchRegistry.js';
import { createDedicatedMatchServer } from './dedicatedMatchServer.js';

let tokenCounter = 0;
const registry = new DedicatedMatchRegistry({
  tokenFactory: () => `test-token-${String(++tokenCounter).padStart(32, '0')}`,
});
const tickets = registry.createMatch({
  matchId: 'ranked_test_1',
  players: [
    { id: 'p1', specId: 'm1a2', team: 'alpha', spawn: { x: -20, z: -100, yaw: 0 } },
    { id: 'p2', specId: 'm1a2', team: 'alpha', spawn: { x: 20, z: -100, yaw: 0 } },
    { id: 'p3', specId: 'm1a2', team: 'bravo', spawn: { x: -20, z: 100, yaw: Math.PI } },
    { id: 'p4', specId: 'm1a2', team: 'bravo', spawn: { x: 20, z: 100, yaw: Math.PI } },
  ],
});
const service = await createDedicatedMatchServer({ registry, autoTick: false });
const address = service.address;
const url = `ws://127.0.0.1:${address.port}/match`;
const p1Ticket = tickets.tickets.find((ticket) => ticket.playerId === 'p1');
const p2Ticket = tickets.tickets.find((ticket) => ticket.playerId === 'p2');
const p3Ticket = tickets.tickets.find((ticket) => ticket.playerId === 'p3');
const p4Ticket = tickets.tickets.find((ticket) => ticket.playerId === 'p4');
const p1 = connectDedicatedMatch({ ...p1Ticket, url, WebSocketImpl: WebSocket,
  clientOptions: { interpolationDelayMs: 0, maxExtrapolationMs: 0 } });
const p2 = connectDedicatedMatch({ ...p2Ticket, url, WebSocketImpl: WebSocket,
  clientOptions: { interpolationDelayMs: 0, maxExtrapolationMs: 0 } });
const p3 = connectDedicatedMatch({ ...p3Ticket, url, WebSocketImpl: WebSocket,
  clientOptions: { interpolationDelayMs: 0, maxExtrapolationMs: 0 } });
const p4 = connectDedicatedMatch({ ...p4Ticket, url, WebSocketImpl: WebSocket,
  clientOptions: { interpolationDelayMs: 0, maxExtrapolationMs: 0 } });
await Promise.all([p1.ready, p2.ready, p3.ready, p4.ready]);
assert.equal(registry.stats().connectedPlayers, 4);
p1.client.readyForMatch();

p1.client.submitInput({
  throttle: 1, steer: 0, brake: false, fire: false,
  aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0,
}, 0);
p2.client.submitInput({
  throttle: 0, steer: 0, brake: true, fire: false,
  aimYaw: Math.PI, aimPitch: 0, shellSlot: 0, actionBits: 0,
}, 0);
for (const connection of [p3, p4]) {
  connection.client.submitInput({
    throttle: 0, steer: 0, brake: true, fire: false,
    aimYaw: Math.PI, aimPitch: 0, shellSlot: 0, actionBits: 0,
  }, 0);
}
await new Promise((resolve) => setTimeout(resolve, 10));
for (let i = 0; i < 60; i++) service.advance(1000 / 60);
const authoritative = registry.matches.get('ranked_test_1').simulation.entityById.get('p1');
assert.equal(registry.matches.get('ranked_test_1').runtime.matchStarted, false,
  'four-player authority waits for every ticketed player, including peers not yet ready');
for (const connection of [p2, p3, p4]) connection.client.readyForMatch();
for (let i = 0; i < 480; i++) {
  service.advance(1000 / 60);
  if (i % 10 === 0) await new Promise((resolve) => setImmediate(resolve));
}
await new Promise((resolve) => setTimeout(resolve, 10));
assert.ok([p1, p2, p3, p4].every((connection) => connection.client.buffer.snapshots.length > 0),
  'all four dedicated clients receive viewer snapshots');
assert.ok(authoritative.state.speed > 0, 'server, not client, advances movement');
const latestTicks = [p1, p2, p3, p4].map((connection) =>
  connection.client.buffer.snapshots.at(-1).tick);
assert.ok(Math.max(...latestTicks) - Math.min(...latestTicks) <= 3,
  `four client views remain within one snapshot interval (${latestTicks.join(', ')})`);
const p1Self = p1.client.buffer.snapshots.at(-1).entities.find((entity) => entity.id === 'p1');
const p1Ally = p2.client.buffer.snapshots.at(-1).entities.find((entity) => entity.id === 'p1');
assert.deepEqual(
  { x: p1Self.x, y: p1Self.y, z: p1Self.z },
  { x: p1Ally.x, y: p1Ally.y, z: p1Ally.z },
  'teammates receive the same authoritative pose for shared entities',
);
assert.ok(p1.transport.stats.inputSent > 0,
  'dedicated steering uses the backpressure-safe replaceable binary lane');
assert.equal(p1.client.getStats().inputAckLag, 0,
  'authority acknowledges the latest four-player input without a stale backlog');

const reconnectStates = [];
const resilient = await beginDedicatedClientMatch({
  ...p1Ticket,
  ticket: { ...p1Ticket, mapId: 'verdant', roster: [] },
  url,
  WebSocketImpl: WebSocket,
  reconnectDelaysMs: [1, 2, 4],
  onStatus: ({ state }) => reconnectStates.push(state),
});
resilient.ready();
const replacedClient = resilient.client;
const preservedEntity = registry.matches.get('ranked_test_1').simulation.entityById.get('p1');
preservedEntity.combat.hp = 1234;
resilient.socket.terminate();
for (let attempt = 0; attempt < 100 && resilient.client === replacedClient; attempt++) {
  await new Promise((resolve) => setTimeout(resolve, 5));
}
assert.notEqual(resilient.client, replacedClient, 'dedicated session reconnects with the same ticket');
assert.ok(resilient.client.connected);
assert.ok(reconnectStates.includes('reconnecting') && reconnectStates.includes('reconnected'));
assert.equal(registry.matches.get('ranked_test_1').simulation.entityById.get('p1'), preservedEntity,
  'reconnect preserves the authoritative entity instead of respawning it');
assert.equal(preservedEntity.combat.hp, 1234, 'reconnect preserves combat state');
resilient.submitInput({
  throttle: 0, steer: 0, brake: true, fire: false,
  aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0,
}, registry.matches.get('ranked_test_1').runtime.tick);
await new Promise((resolve) => setTimeout(resolve, 5));
for (let i = 0; i < 180; i++) service.advance(1000 / 60);
assert.equal(preservedEntity.connected, true);
assert.ok(Math.abs(preservedEntity.state.speed) < 0.1,
  'the replacement channel resumes control of the preserved tank');

const health = await fetch(`http://127.0.0.1:${address.port}/healthz`).then((response) => response.json());
assert.deepEqual(health, {
  ok: true,
  service: 'cot-match',
  matches: 1,
  connectedPlayers: 4,
  queuedPlayers: 0,
  ratedMatches: 0,
});

resilient.close('test_done');
p1.client.close('test_done');
p2.client.close('test_done');
p3.client.close('test_done');
p4.client.close('test_done');
await service.close('test_done');

class NeverOpenSocket {
  constructor() {
    this.binaryType = 'blob';
    this.listeners = new Map();
    this.closed = false;
    NeverOpenSocket.instance = this;
  }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  send() { throw new Error('socket never opened'); }
  close() { this.closed = true; }
}
const stalled = connectDedicatedMatch({
  url: 'ws://127.0.0.1:9/match',
  matchId: 'timeout-test',
  playerId: 'timeout-player',
  token: 'timeout-token',
  WebSocketImpl: NeverOpenSocket,
  timeoutMs: 1,
});
await assert.rejects(stalled.ready, /match connection timed out/);
assert.equal(NeverOpenSocket.instance.closed, true,
  'timed-out dedicated connections close their unused socket');
assert.equal([...NeverOpenSocket.instance.listeners.values()]
  .reduce((total, listeners) => total + listeners.size, 0), 0,
  'timed-out dedicated connections remove every socket listener');

console.log('dedicatedMatch.selftest: four-player auth, sync, authority, and health passed');
