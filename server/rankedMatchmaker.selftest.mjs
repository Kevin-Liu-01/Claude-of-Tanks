import assert from 'node:assert/strict';
import { RankedMatchmaker } from './rankedMatchmaker.js';
import { RatingStore } from './ratingStore.js';

let identity = 0;
let secret = 0;
let queueId = 0;
let queueToken = 0;
let matchId = 0;
const ratings = new RatingStore({
  identityFactory: () => `r_ranked_test_${++identity}`,
  secretFactory: () => `identity-secret-${String(++secret).padStart(32, '0')}`,
});
const registry = {
  matches: new Map(),
  createMatch(options) {
    const id = `ranked_match_${++matchId}`;
    this.matches.set(id, { id, ...options, simulation: { result: null } });
    return {
      matchId: id,
      tickets: options.players.map((player, index) => ({
        matchId: id,
        playerId: player.id,
        token: `match-token-${String(index).padStart(32, '0')}`,
      })),
    };
  },
};
const queue = new RankedMatchmaker({
  registry,
  ratings,
  now: () => 50_000,
  ticketIdFactory: () => `queue_test_${++queueId}`,
  ticketTokenFactory: () => `queue-token-${String(++queueToken).padStart(32, '0')}`,
});
const alpha = queue.createIdentity({ name: 'Alpha' });
const bravo = queue.createIdentity({ name: 'Bravo' });
const first = queue.join({
  playerId: alpha.playerId,
  identityToken: alpha.token,
  specId: 'm1a2',
  equipment: ['rammer', 'vstab', 'optics', 'toolbox'],
  camo: 'summer',
  teamSize: 1,
});
assert.equal(first.status, 'queued');
assert.throws(() => queue.join({
  playerId: alpha.playerId,
  identityToken: alpha.token,
  specId: 'm1a2',
  teamSize: 1,
}), /already queued/);
const second = queue.join({
  playerId: bravo.playerId,
  identityToken: bravo.token,
  specId: 't90m',
  camo: 'winter',
  teamSize: 1,
});
assert.equal(second.status, 'matched');
const firstMatched = queue.poll(first.ticketId, first.ticketToken);
assert.equal(firstMatched.status, 'matched');
assert.equal(firstMatched.match.mapId, 'verdant');
assert.equal(firstMatched.match.roster.length, 2);
assert.deepEqual(new Set(firstMatched.match.roster.map((player) => player.camo)),
  new Set(['summer', 'winter']), 'ranked tickets preserve built-in player camouflage');
assert.notEqual(firstMatched.match.roster[0].team, firstMatched.match.roster[1].team);
assert.equal(queue.poll(first.ticketId, 'wrong'), null);

const match = registry.matches.get(firstMatched.match.matchId);
match.simulation.result = match.players.find((player) => player.id === alpha.playerId).team;
queue.reconcile();
const finished = queue.poll(first.ticketId, first.ticketToken);
assert.equal(finished.status, 'finished');
assert.equal(finished.profile.matches, 1);
assert.ok(finished.profile.rating > 1000);
assert.equal(queue.leaderboard()[0].playerId, alpha.playerId);

const twoByTwoIdentities = Array.from({ length: 4 }, () =>
  queue.createIdentity({ name: 'Commander' }));
const twoByTwoTickets = twoByTwoIdentities.map((entry) => queue.join({
  playerId: entry.playerId,
  identityToken: entry.token,
  specId: 'm1a2',
  teamSize: 2,
}));
assert.deepEqual(twoByTwoTickets.map((entry) => entry.status),
  ['queued', 'queued', 'queued', 'matched'],
  'ranked 2v2 starts as soon as four compatible players are queued');
const twoByTwoMatch = queue.poll(
  twoByTwoTickets[0].ticketId,
  twoByTwoTickets[0].ticketToken,
).match;
assert.equal(twoByTwoMatch.roster.length, 4);
assert.equal(twoByTwoMatch.roster.filter((player) => player.team === 'alpha').length, 2);
assert.equal(twoByTwoMatch.roster.filter((player) => player.team === 'bravo').length, 2);
assert.equal(new Set(twoByTwoMatch.roster.map((player) =>
  player.name.toLocaleLowerCase('en-US'))).size, 4,
  'ranked roster names are unique even when every saved profile collides');

console.log('rankedMatchmaker.selftest: auth, queue, balance, tickets, and settlement passed');
