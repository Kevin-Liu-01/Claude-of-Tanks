// The in-page room's synchronous crypto (syncCrypto.ts) against node:crypto: SHA-256 and HMAC-SHA256 of 600 texts of 0 to
// 300 characters (ASCII, accented, CJK and emoji: multi-byte UTF-8; every padding boundary near 55, 56 and 64 bytes) under
// keys short and longer than a block; and a seat token it signs verifies in the host's Worker (verifySeatTokenWeb) and in
// Node (server/match/seatToken.ts), byte for byte the token Node signs.
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { hmacSha256, sha256HexSync, signSeatTokenSync } from './syncCrypto.ts';
import { signSeatToken, verifySeatToken } from '../../../server/match/seatToken.ts';
import { verifySeatTokenWeb } from '../host/seatTokenWeb.ts';

let seed = 0x5eed;
const random = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const alphabet = [...'abcXYZ019 .:-_/', 'é', 'ß', '漢', '字', '🛡', '🚀'];
const text = (length) => Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join('');

const lengths = [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128];
for (let index = 0; index < 600; index++) {
  const message = text(index < lengths.length ? lengths[index] : Math.floor(random() * 300));
  assert.equal(sha256HexSync(message), createHash('sha256').update(message).digest('hex'), `sha256 of ${JSON.stringify(message)}`);
  const key = text(index % 3 === 0 ? 70 + (index % 40) : 16 + (index % 30));
  assert.equal(Buffer.from(hmacSha256(key, message)).toString('hex'), createHmac('sha256', key).update(message).digest('hex'),
    `hmac under a ${key.length}-character key`);
}

const nowMs = 1_800_000_000_000;
const claims = { v: 1, roomId: 'SOLO1', seat: 0, playerId: 'p-solo', name: 'Solo 漢', team: 'alpha', specId: 'm1a1_abrams_hc',
  iat: nowMs, exp: nowMs + 3_600_000 };
const secret = sha256HexSync('in-page-room-secret:match-1');
const token = signSeatTokenSync(secret, claims);
assert.equal(token, signSeatToken(secret, claims), 'the token Node signs, byte for byte');
assert.deepEqual(verifySeatToken(secret, token, nowMs + 1_000), { ok: true, claims });
assert.deepEqual(await verifySeatTokenWeb(secret, token, nowMs + 1_000), { ok: true, claims }, 'the Worker\'s check');
assert.equal((await verifySeatTokenWeb(`${secret}x`, token, nowMs)).ok, false, 'another secret fails');
assert.throws(() => signSeatTokenSync('short', claims), /16 characters/);

console.log('syncCrypto.selftest: SHA-256 and HMAC-SHA256 of 600 texts match node:crypto; a seat token signed in the page is Node\'s and verifies in the Worker');
