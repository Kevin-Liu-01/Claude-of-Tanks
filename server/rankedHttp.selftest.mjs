import assert from 'node:assert/strict';
import { createDedicatedMatchServer } from './dedicatedMatchServer.ts';

const service = await createDedicatedMatchServer({ autoTick: false });
const base = `http://127.0.0.1:${service.address.port}`;

async function identity(name) {
  const response = await fetch(`${base}/ranked/identity`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:5173' },
    body: JSON.stringify({ name }),
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  return response.json();
}

async function join(player, specId) {
  const response = await fetch(`${base}/ranked/queue`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${player.token}`,
    },
    body: JSON.stringify({ playerId: player.playerId, specId, teamSize: 1 }),
  });
  assert.equal(response.status, 202);
  return response.json();
}

const alpha = await identity('HTTP Alpha');
const bravo = await identity('HTTP Bravo');
const alphaQueue = await join(alpha, 'm1a1');
const bravoQueue = await join(bravo, 't90a_burlak');
assert.equal(bravoQueue.status, 'matched');
const poll = await fetch(`${base}/ranked/queue/${alphaQueue.ticketId}`, {
  headers: { authorization: `Bearer ${alphaQueue.ticketToken}` },
}).then((response) => response.json());
assert.equal(poll.status, 'matched');
assert.equal(poll.match.roster.length, 2);
assert.ok(poll.match.token.length >= 24, 'queue exchanges its token for a dedicated match token');

const board = await fetch(`${base}/ranked/leaderboard`).then((response) => response.json());
assert.equal(board.players.length, 2);
const health = await fetch(`${base}/healthz`).then((response) => response.json());
assert.equal(health.matches, 1);
assert.equal(health.queuedPlayers, 0);
assert.equal(health.ratedMatches, 1);

await service.close('test_done');
console.log('rankedHttp.selftest: identity, CORS, queue, match ticket, and leaderboard passed');
