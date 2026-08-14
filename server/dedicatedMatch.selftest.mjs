import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { beginDedicatedClientMatch, connectDedicatedMatch } from '../src/net/dedicatedClient.js';
import { DedicatedMatchRegistry } from './dedicatedMatchRegistry.js';
import { createDedicatedMatchServer } from './dedicatedMatchServer.js';

let tokenCounter = 0;
const registry = new DedicatedMatchRegistry({
  tokenFactory: () => `test-token-${String(++tokenCounter).padStart(32, '0')}`,
});
const tickets = registry.createMatch({
  matchId: 'ranked_test_1',
  players: [
    { id: 'p1', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -100, yaw: 0 } },
    { id: 'p2', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 100, yaw: Math.PI } },
  ],
});
const service = await createDedicatedMatchServer({ registry, autoTick: false });
const address = service.address;
const url = `ws://127.0.0.1:${address.port}/match`;
const p1Ticket = tickets.tickets.find((ticket) => ticket.playerId === 'p1');
const p2Ticket = tickets.tickets.find((ticket) => ticket.playerId === 'p2');
const p1 = connectDedicatedMatch({ ...p1Ticket, url, WebSocketImpl: WebSocket,
  clientOptions: { interpolationDelayMs: 0, maxExtrapolationMs: 0 } });
const p2 = connectDedicatedMatch({ ...p2Ticket, url, WebSocketImpl: WebSocket,
  clientOptions: { interpolationDelayMs: 0, maxExtrapolationMs: 0 } });
await Promise.all([p1.ready, p2.ready]);
assert.equal(registry.stats().connectedPlayers, 2);
p1.client.readyForMatch();

p1.client.submitInput({
  throttle: 1, steer: 0, brake: false, fire: false,
  aimYaw: 0, aimPitch: 0, shellSlot: 0, actionBits: 0,
}, 0);
p2.client.submitInput({
  throttle: 0, steer: 0, brake: true, fire: false,
  aimYaw: Math.PI, aimPitch: 0, shellSlot: 0, actionBits: 0,
}, 0);
await new Promise((resolve) => setTimeout(resolve, 10));
for (let i = 0; i < 60; i++) service.advance(1000 / 60);
const authoritative = registry.matches.get('ranked_test_1').simulation.entityById.get('p1');
assert.ok(Math.abs(authoritative.state.speed) < 0.001,
  'authority waits for every ticketed player, including peers not yet ready');
p2.client.readyForMatch();
for (let i = 0; i < 480; i++) {
  service.advance(1000 / 60);
  if (i % 10 === 0) await new Promise((resolve) => setImmediate(resolve));
}
await new Promise((resolve) => setTimeout(resolve, 10));
assert.ok(p1.client.buffer.snapshots.length > 0 && p2.client.buffer.snapshots.length > 0,
  'dedicated clients receive viewer snapshots');
assert.ok(authoritative.state.speed > 0, 'server, not client, advances movement');

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
  connectedPlayers: 2,
  queuedPlayers: 0,
  ratedMatches: 0,
});

resilient.close('test_done');
p1.client.close('test_done');
p2.client.close('test_done');
await service.close('test_done');

console.log('dedicatedMatch.selftest: auth, authority, snapshots, and health passed');
