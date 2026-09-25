/**
 * Seat tokens: the room service signs who may sit where; the match service
 * verifies without any shared state beyond the secret (HMAC-SHA256).
 * Format: base64url(JSON claims) '.' base64url(signature).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SeatClaims {
  v: 1;
  roomId: string;
  seat: number;
  playerId: string;
  name: string;
  team: 'alpha' | 'bravo' | 'spectator';
  specId: string;
  /** Unix ms. */
  iat: number;
  exp: number;
}

export type SeatTokenResult =
  | { ok: true; claims: SeatClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'not_yet_valid' | 'bad_claims' };

const ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const MAX_TOKEN_CHARS = 1024;

function sign(secret: string, payload: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest();
}

export function isSeatClaims(value: unknown): value is SeatClaims {
  if (!value || typeof value !== 'object') return false;
  const claims = value as Record<string, unknown>;
  return claims.v === 1 &&
    typeof claims.roomId === 'string' && ID_RE.test(claims.roomId) &&
    Number.isInteger(claims.seat) && (claims.seat as number) >= 0 && (claims.seat as number) < 64 &&
    typeof claims.playerId === 'string' && ID_RE.test(claims.playerId) &&
    typeof claims.name === 'string' && claims.name.length >= 1 && claims.name.length <= 32 &&
    (claims.team === 'alpha' || claims.team === 'bravo' || claims.team === 'spectator') &&
    typeof claims.specId === 'string' && claims.specId.length <= 48 &&
    Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp) && (claims.exp as number) > (claims.iat as number);
}

export function signSeatToken(secret: string, claims: SeatClaims): string {
  if (typeof secret !== 'string' || secret.length < 16) throw new TypeError('seat secret must be at least 16 characters');
  if (!isSeatClaims(claims)) throw new TypeError('invalid seat claims');
  const payload = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const signature = sign(secret, payload).toString('base64url');
  const token = `${payload}.${signature}`;
  if (token.length > MAX_TOKEN_CHARS) throw new TypeError('seat token too long');
  return token;
}

export function verifySeatToken(secret: string, token: unknown, nowMs: number): SeatTokenResult {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_CHARS) return { ok: false, reason: 'malformed' };
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' };
  const payload = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(provided)) return { ok: false, reason: 'malformed' };
  const expected = sign(secret, payload);
  const actual = Buffer.from(provided, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return { ok: false, reason: 'bad_signature' };
  let claims: unknown;
  try { claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); } catch { return { ok: false, reason: 'bad_claims' }; }
  if (!isSeatClaims(claims)) return { ok: false, reason: 'bad_claims' };
  if (nowMs >= claims.exp) return { ok: false, reason: 'expired' };
  if (nowMs < claims.iat - 60_000) return { ok: false, reason: 'not_yet_valid' };
  return { ok: true, claims };
}
