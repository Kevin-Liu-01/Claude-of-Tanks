import assert from 'node:assert/strict';
import { createDedicatedMatchServer } from '../../server/dedicatedMatchServer.js';
import { createRankedServiceClient, rankedMatchWebSocketUrl } from './rankedServiceClient.js';

const service = await createDedicatedMatchServer({ autoTick: false });
const url = `http://127.0.0.1:${service.address.port}`;
const values = new Map();
const storage = {
  getItem: (key) => values.get(key) || null,
  setItem: (key, value) => values.set(key, value),
  removeItem: (key) => values.delete(key),
};
const alpha = createRankedServiceClient({ url, storage });
const alphaTicket = await alpha.join({ name: 'Client Alpha', specId: 'm1a2', teamSize: 1 });
assert.equal(alphaTicket.status, 'queued');
const storedIdentity = alpha.identity();
assert.ok(storedIdentity.playerId && storedIdentity.token);
assert.deepEqual((await createRankedServiceClient({ url, storage }).ensureIdentity('Ignored')).playerId,
  storedIdentity.playerId, 'ranked identity survives a reload');

const bravo = createRankedServiceClient({ url, storage: new MapStorage() });
const bravoTicket = await bravo.join({ name: 'Client Bravo', specId: 't90m', teamSize: 1 });
assert.equal(bravoTicket.status, 'matched');
const matched = await alphaTicket.wait({ intervalMs: 1 });
assert.equal(matched.match.roster.length, 2);
assert.equal(rankedMatchWebSocketUrl(url), `ws://127.0.0.1:${service.address.port}/match`);
assert.equal((await alpha.leaderboard()).players.length, 2);

await service.close('test_done');
console.log('rankedServiceClient.selftest: identity persistence, queue, and endpoint conversion passed');

function MapStorage() {
  const map = new Map();
  this.getItem = (key) => map.get(key) || null;
  this.setItem = (key, value) => map.set(key, value);
  this.removeItem = (key) => map.delete(key);
}
