// The Web Crypto seat-token verifier against the room's Node signer and back: a token the room signs verifies in the
// browser host, a token the double signs with Web Crypto verifies in the service, every tampering class is refused
// with the service's reason (malformed, bad_signature, bad_claims, expired, not_yet_valid), and the per-match host
// secret derivation (sha256Hex) matches the room's.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { signSeatToken, verifySeatToken } from '../../../server/match/seatToken.ts';
import { base64UrlToBytes, bytesToBase64Url, sha256HexWeb, signSeatTokenWeb, verifySeatTokenWeb } from './seatTokenWeb.ts';

const SECRET = 'a-per-match-host-secret-0123456789abcdef';
const now = 1_700_000_000_000;
const claims = { v: 1, roomId: 'ABC123', seat: 3, playerId: 'bob', name: 'Bob', team: 'bravo', specId: 't90m', iat: now - 1000, exp: now + 60_000 };

// ---- room-signed → web-verified
const token = signSeatToken(SECRET, claims);
const verified = await verifySeatTokenWeb(SECRET, token, now);
assert.equal(verified.ok, true);
assert.deepEqual(verified.claims, claims);

// ---- web-signed → node-verified (and web-verified)
const webToken = await signSeatTokenWeb(SECRET, claims);
assert.equal(webToken, token, 'both signers produce the same token bytes');
assert.equal(verifySeatToken(SECRET, webToken, now).ok, true);
assert.equal((await verifySeatTokenWeb(SECRET, webToken, now)).ok, true);

// ---- refusals, with the service's reasons
assert.equal((await verifySeatTokenWeb('another-secret-0123456789abcdef', token, now)).reason, 'bad_signature');
assert.equal((await verifySeatTokenWeb(SECRET, `${token}x`, now)).reason, 'bad_signature');
assert.equal((await verifySeatTokenWeb(SECRET, 'no-dot', now)).reason, 'malformed');
assert.equal((await verifySeatTokenWeb(SECRET, 'a.b!c', now)).reason, 'malformed');
assert.equal((await verifySeatTokenWeb(SECRET, 42, now)).reason, 'malformed');
assert.equal((await verifySeatTokenWeb(SECRET, token, claims.exp + 1)).reason, 'expired');
assert.equal((await verifySeatTokenWeb(SECRET, token, claims.iat - 61_000)).reason, 'not_yet_valid');
const [payload] = token.split('.');
const tampered = `${bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ ...claims, seat: 4 })))}.${token.split('.')[1]}`;
assert.equal((await verifySeatTokenWeb(SECRET, tampered, now)).reason, 'bad_signature', 'a re-encoded payload fails the signature');
const badClaims = await signSeatTokenWeb(SECRET, { ...claims, v: 2 });
assert.equal((await verifySeatTokenWeb(SECRET, badClaims, now)).reason, 'bad_claims');
assert.equal(verifySeatToken(SECRET, badClaims, now).reason, 'bad_claims', 'the service agrees');
void payload;

// ---- base64url helpers
for (const length of [0, 1, 2, 3, 4, 5, 31, 32, 33]) {
  const bytes = new Uint8Array(length).map((_, index) => (index * 37 + 11) & 0xff);
  const text = bytesToBase64Url(bytes);
  assert.doesNotMatch(text, /[+/=]/, 'url-safe without padding');
  assert.deepEqual([...base64UrlToBytes(text)], [...bytes]);
}
assert.equal(base64UrlToBytes('not base64!'), null);

// ---- the host secret derivation matches the room's sha256Hex
const derived = await sha256HexWeb('room-seat-secret-0123456789:m1-deadbeef');
assert.equal(derived, createHash('sha256').update('room-seat-secret-0123456789:m1-deadbeef').digest('hex'));
assert.equal(derived.length, 64);
console.log('seatTokenWeb.selftest: web and node signers agree, every refusal reason matches, the host secret derivation matches');
