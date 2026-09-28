/**
 * Seat tokens: the room service signs who may sit where; the match service
 * verifies without any shared state beyond the secret (HMAC-SHA256).
 * Format: base64url(JSON claims) '.' base64url(signature). The claims shape
 * and the pure checks live in seatClaims.ts (the browser host shares them).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { SEAT_TOKEN_MAX_CHARS, isSeatClaims, judgeSeatClaims, splitSeatToken } from './seatClaims.ts';
import type { SeatClaims, SeatTokenResult } from './seatClaims.ts';

export type { SeatClaims, SeatTokenResult } from './seatClaims.ts';
export { isSeatClaims } from './seatClaims.ts';

function sign(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function signSeatToken(secret: string, claims: SeatClaims): string {
  if (typeof secret !== 'string' || secret.length < 16) throw new TypeError('seat secret must be at least 16 characters');
  if (!isSeatClaims(claims)) throw new TypeError('invalid seat claims');
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signature = sign(secret, payload).toString('base64url');
  const token = `${payload}.${signature}`;
  if (token.length > SEAT_TOKEN_MAX_CHARS) throw new TypeError('seat token too long');
  return token;
}

export function verifySeatToken(secret: string, token: unknown, nowMs: number): SeatTokenResult {
  const parts = splitSeatToken(token);
  if (!parts) return { ok: false, reason: 'malformed' };
  const expected = sign(secret, parts.payload);
  const actual = Buffer.from(parts.signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { ok: false, reason: 'bad_signature' };
  let claims: unknown;
  try { claims = JSON.parse(Buffer.from(parts.payload, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'bad_claims' }; }
  return judgeSeatClaims(claims, nowMs);
}
