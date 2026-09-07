import assert from 'node:assert/strict';
import { RankedMatchmaker, rankedBattleMapForSequence } from './rankedMatchmaker.ts';
import { RatingStore } from './ratingStore.ts';
import { RANDOM_BATTLE_MAP_IDS } from '../src/world/maps/index.ts';

assert.deepEqual(
  RANDOM_BATTLE_MAP_IDS.map((_, index) => rankedBattleMapForSequence(index)),
  RANDOM_BATTLE_MAP_IDS,
  'ranked Random Battle rotates through every registered battlefield',
);

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
  now: () => now,
  ticketIdFactory: () => `queue_test_${++queueId}`,
  ticketTokenFactory: () => `queue-token-${String(++queueToken).padStart(32, '0')}`,
});
let now = 50_000;
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

// The registry can abort a match whose roster never finishes loading. That
// operation releases exact reservations and produces no rating/result record.
registry.matches.delete(twoByTwoMatch.matchId);
queue.reconcile();
assert.equal(queue.ratedMatches.has(twoByTwoMatch.matchId), false);
for (const [index, ticket] of twoByTwoTickets.entries()) {
  assert.equal(queue.poll(ticket.ticketId, ticket.ticketToken).status, 'expired');
  assert.equal(queue.poll(ticket.ticketId, ticket.ticketToken).match, undefined);
  assert.equal(queue.activeByPlayer.has(twoByTwoIdentities[index].playerId), false);
  assert.equal(queue.profile(twoByTwoIdentities[index].playerId).matches, 0);
  assert.equal(queue.profile(twoByTwoIdentities[index].playerId).rating, 1000);
}
const replacementIdentity = twoByTwoIdentities[0];
const replacement = queue.join({ playerId: replacementIdentity.playerId,
  identityToken: replacementIdentity.token, specId: 'm1a2', teamSize: 2 });
assert.equal(replacement.status, 'queued', 'aborted players may explicitly queue again');
queue.reconcile();
assert.equal(queue.activeByPlayer.get(replacementIdentity.playerId), replacement.ticketId);

// Model reconciliation arriving after a reservation has already been replaced:
// releasing the old exact ticket must not delete the new active mapping.
const staleTicket = twoByTwoTickets[0];
const staleEntry = queue.entries.get(staleTicket.ticketId);
staleEntry.status = 'matched';
staleEntry.match = { matchId: twoByTwoMatch.matchId };
queue.ratedMatches.set(twoByTwoMatch.matchId, { entries: [staleEntry], players: [], settled: false });
queue.reconcile();
assert.equal(queue.activeByPlayer.get(replacementIdentity.playerId), replacement.ticketId);
assert.equal(queue.poll(replacement.ticketId, replacement.ticketToken).status, 'queued');

// Already-settled results survive normal registry cleanup and stay idempotent.
registry.matches.delete(firstMatched.match.matchId);
queue.reconcile();
assert.equal(queue.poll(first.ticketId, first.ticketToken).status, 'finished');
assert.equal(queue.profile(alpha.playerId).matches, 1);
now += 120_001;
queue.reconcile();
for (const ticket of [first, second, ...twoByTwoTickets]) {
  assert.equal(queue.poll(ticket.ticketId, ticket.ticketToken), null,
    'terminal ticket tombstones are reclaimed after their bounded replay window');
}
assert.equal(queue.ratedMatches.size, 0, 'neither abandoned nor settled match tracking leaks');
assert.equal(queue.entries.size, 1, 'only the explicit replacement queue remains');

console.log('rankedMatchmaker.selftest: auth, queue, balance, tickets, and settlement passed');
