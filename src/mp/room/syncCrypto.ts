/**
 * SHA-256 and HMAC-SHA256 computed synchronously, for a room that runs in the page (RUST-ENGINE-DECISION §7 step 5: a
 * solo battle on a local host). RoomActor's ports hash and sign synchronously (`sha256Hex`, `signSeatToken`), and the
 * browser's Web Crypto only answers in promises. The bytes are FIPS 180-4's and RFC 2104's, so a token signed here
 * verifies in the host's Worker (seatTokenWeb.ts verifySeatTokenWeb) and in Node (server/match/seatToken.ts); the
 * receipt checks both against node:crypto. Nothing secret depends on it: the room, the host and the only seat are this
 * page.
 */
import { bytesToBase64Url } from '../match/base64url.ts';
import { SEAT_TOKEN_MAX_CHARS, isSeatClaims } from '../../../server/match/seatClaims.ts';
import type { SeatClaims } from '../../../server/match/seatClaims.ts';

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const encoder = new TextEncoder();

/** SHA-256 of `bytes`. */
export function sha256(bytes: Uint8Array): Uint8Array {
  const length = bytes.length;
  const blocks = Math.ceil((length + 9) / 64);
  const padded = new Uint8Array(blocks * 64);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  // the message length in bits, big-endian, in the last 8 bytes (lengths here stay far below 2^53 bits)
  view.setUint32(padded.length - 8, Math.floor(length / 0x20000000));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let block = 0; block < blocks; block++) {
    for (let t = 0; t < 16; t++) w[t] = view.getUint32(block * 64 + t * 4);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }
    let a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (let t = 0; t < 64; t++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const choice = (e & f) ^ (~e & g);
      const t1 = (hh + s1 + choice + K[t] + w[t]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (s0 + majority) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  for (let index = 0; index < 8; index++) outView.setUint32(index * 4, h[index]);
  return out;
}

/** HMAC-SHA256 of `message` under `key` (both UTF-8 text). */
export function hmacSha256(key: string, message: string): Uint8Array {
  let keyBytes: Uint8Array = encoder.encode(key);
  if (keyBytes.length > 64) keyBytes = sha256(keyBytes);
  const inner = new Uint8Array(64), outer = new Uint8Array(64);
  inner.fill(0x36);
  outer.fill(0x5c);
  for (let index = 0; index < keyBytes.length; index++) {
    inner[index] ^= keyBytes[index];
    outer[index] ^= keyBytes[index];
  }
  const messageBytes = encoder.encode(message);
  const innerInput = new Uint8Array(64 + messageBytes.length);
  innerInput.set(inner);
  innerInput.set(messageBytes, 64);
  const outerInput = new Uint8Array(64 + 32);
  outerInput.set(outer);
  outerInput.set(sha256(innerInput), 64);
  return sha256(outerInput);
}

/** RoomActor's `sha256Hex` port: the hex SHA-256 of `text`'s UTF-8. */
export function sha256HexSync(text: string): string {
  let hex = '';
  for (const byte of sha256(encoder.encode(text))) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

/** RoomActor's `signSeatToken` port: server/match/seatToken.ts's format, base64url(JSON claims) '.' base64url(HMAC). */
export function signSeatTokenSync(secret: string, claims: SeatClaims): string {
  if (typeof secret !== 'string' || secret.length < 16) throw new TypeError('seat secret must be at least 16 characters');
  if (!isSeatClaims(claims)) throw new TypeError('invalid seat claims');
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(claims)));
  const token = `${payload}.${bytesToBase64Url(hmacSha256(secret, payload))}`;
  if (token.length > SEAT_TOKEN_MAX_CHARS) throw new TypeError('seat token too long');
  return token;
}
