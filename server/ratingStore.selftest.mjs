import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RatingStore, rankForRating } from './ratingStore.ts';

let id = 0;
let secret = 0;
const ratings = new RatingStore({
  identityFactory: () => `r_test_identity_${++id}`,
  secretFactory: () => `test-secret-${String(++secret).padStart(32, '0')}`,
});
const alpha = ratings.createIdentity({ name: 'Alpha' });
const bravo = ratings.createIdentity({ name: 'Bravo' });
assert.ok(ratings.authenticate(alpha.playerId, alpha.token));
assert.equal(ratings.authenticate(alpha.playerId, 'wrong'), false);
assert.equal(ratings.profile(alpha.playerId).rating, 1000);

const updates = ratings.recordTeamMatch({
  matchId: 'rated-one',
  result: 'alpha',
  players: [
    { id: alpha.playerId, team: 'alpha' },
    { id: bravo.playerId, team: 'bravo' },
  ],
});
assert.equal(updates.find((entry) => entry.playerId === alpha.playerId).rating, 1024);
assert.equal(updates.find((entry) => entry.playerId === bravo.playerId).rating, 976);
assert.equal(ratings.recordTeamMatch({ matchId: 'rated-one', result: 'bravo', players: [] }), null,
  'settlement is idempotent');
assert.equal(ratings.leaderboard()[0].playerId, alpha.playerId);
assert.equal(rankForRating(1800), 'Master');
assert.equal(rankForRating(750), 'Recruit');

const dir = mkdtempSync(join(tmpdir(), 'cot-ratings-'));
const filePath = join(dir, 'ratings.json');
const persistent = new RatingStore({
  filePath,
  identityFactory: () => 'r_persistent_test_identity',
  secretFactory: () => 'persistent-secret-00000000000000000000000000000000',
});
const identityRecord = persistent.createIdentity({ name: 'Persistent' });
const restored = new RatingStore({ filePath });
assert.ok(restored.authenticate(identityRecord.playerId, identityRecord.token));
assert.equal(restored.profile(identityRecord.playerId).name, 'Persistent');
assert.equal(readFileSync(filePath, 'utf8').includes(identityRecord.token), false,
  'persistent store never writes bearer secrets in plaintext');

console.log('ratingStore.selftest: bearer identity, Elo, idempotency, and leaderboard passed');
