import assert from 'node:assert/strict';
import { isSeatClaims, signSeatToken, verifySeatToken } from './seatToken.ts';

const secret = 'test-secret-that-is-long-enough';
const now = 1_700_000_000_000;
const claims = { v: 1, roomId: 'room-1', seat: 3, playerId: 'p_3', name: 'Three', team: 'bravo', specId: 't90m', iat: now, exp: now + 60_000 };
const token = signSeatToken(secret, claims);
assert.ok(token.includes('.') && token.length < 400);
const verified = verifySeatToken(secret, token, now + 1000);
assert.equal(verified.ok, true);
assert.deepEqual(verified.claims, claims);
assert.equal(verifySeatToken(secret, token, now + 60_000).reason, 'expired');
assert.equal(verifySeatToken(secret, token, now - 120_000).reason, 'not_yet_valid');
assert.equal(verifySeatToken('another-secret-that-is-long', token, now).reason, 'bad_signature');
const [payload, signature] = token.split('.');
assert.equal(verifySeatToken(secret, `${payload}x.${signature}`, now).reason, 'bad_signature');
assert.equal(verifySeatToken(secret, payload, now).reason, 'malformed');
assert.equal(verifySeatToken(secret, `${payload}.`, now).reason, 'malformed');
assert.equal(verifySeatToken(secret, 42, now).reason, 'malformed');
assert.equal(verifySeatToken(secret, 'a'.repeat(2000), now).reason, 'malformed');
// forged claims with a valid signature over a different payload cannot verify
const other = signSeatToken(secret, { ...claims, seat: 4 });
assert.equal(verifySeatToken(secret, `${payload}.${other.split('.')[1]}`, now).reason, 'bad_signature');
// a signed payload that is not a claims object is rejected as bad_claims
{
  const { createHmac } = await import('node:crypto');
  const junk = Buffer.from(JSON.stringify({ v: 1, roomId: 'x' }), 'utf8').toString('base64url');
  const sig = createHmac('sha256', secret).update(junk).digest('base64url');
  assert.equal(verifySeatToken(secret, `${junk}.${sig}`, now).reason, 'bad_claims');
  const notJson = Buffer.from('nope', 'utf8').toString('base64url');
  const sig2 = createHmac('sha256', secret).update(notJson).digest('base64url');
  assert.equal(verifySeatToken(secret, `${notJson}.${sig2}`, now).reason, 'bad_claims');
}
assert.throws(() => signSeatToken('short', claims), TypeError);
assert.throws(() => signSeatToken(secret, { ...claims, seat: 64 }), TypeError);
assert.throws(() => signSeatToken(secret, { ...claims, playerId: 'has space' }), TypeError);
assert.throws(() => signSeatToken(secret, { ...claims, team: 'red' }), TypeError);
assert.throws(() => signSeatToken(secret, { ...claims, exp: now }), TypeError);
assert.equal(isSeatClaims(null), false);
assert.equal(isSeatClaims({ ...claims, name: '' }), false);
console.log('seatToken.selftest: HMAC seat tokens sign, verify, expire and reject every tampering class');
