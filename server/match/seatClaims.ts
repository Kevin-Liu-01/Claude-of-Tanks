/**
 * Seat-token claims (the pure half of seatToken.ts): the shape the room signs and the match host verifies. No Node
 * built-ins, so the browser host (src/mp/host, Web Crypto) validates claims through the same predicate the service uses.
 */
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

export const SEAT_TOKEN_MAX_CHARS = 1024;
const ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;

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

/** The token's two base64url parts, or null when the shape is off (the verifier then answers `malformed`). */
export function splitSeatToken(token: unknown): { payload: string; signature: string } | null {
  if (typeof token !== 'string' || token.length > SEAT_TOKEN_MAX_CHARS) return null;
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]+$/.test(signature)) return null;
  return { payload, signature };
}

/** Claims validity against the clock: expired, not yet valid (a minute of skew allowed), or the claims. */
export function judgeSeatClaims(claims: unknown, nowMs: number): SeatTokenResult {
  if (!isSeatClaims(claims)) return { ok: false, reason: 'bad_claims' };
  if (nowMs >= claims.exp) return { ok: false, reason: 'expired' };
  if (nowMs < claims.iat - 60_000) return { ok: false, reason: 'not_yet_valid' };
  return { ok: true, claims };
}
