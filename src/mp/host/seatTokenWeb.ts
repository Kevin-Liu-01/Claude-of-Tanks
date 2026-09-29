/**
 * Seat-token verification with Web Crypto (P2 client lane): the browser host verifies every peer's HELLO token with the
 * per-match host secret exactly as `server/match/seatToken.ts` does with Node's HMAC — the same claims predicate, the
 * same base64url layout, a constant-time signature comparison. Runs in a Worker and in Node (globalThis.crypto).
 */
import { judgeSeatClaims, splitSeatToken } from '../../../server/match/seatClaims.ts';
import type { SeatTokenResult } from '../../../server/match/seatClaims.ts';
import { base64UrlToBytes, bytesToBase64Url } from '../match/base64url.ts';

export { base64UrlToBytes, bytesToBase64Url } from '../match/base64url.ts';

export type { SeatClaims, SeatTokenResult } from '../../../server/match/seatClaims.ts';

interface SubtleLike {
  importKey(format: 'raw', keyData: Uint8Array, algorithm: { name: string; hash: string }, extractable: boolean, usages: string[]): Promise<unknown>;
  sign(algorithm: string, key: unknown, data: Uint8Array): Promise<ArrayBuffer>;
}

function subtleOf(injected?: SubtleLike): SubtleLike {
  const subtle = injected ?? (globalThis as { crypto?: { subtle?: SubtleLike } }).crypto?.subtle;
  if (!subtle) throw new Error('Web Crypto is unavailable in this runtime');
  return subtle;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a[index]! ^ b[index]!;
  return diff === 0;
}

/** HMAC-SHA256 of `payload` under `secret` (the seat-token signature). */
export async function hmacSha256(secret: string, payload: string, subtle?: SubtleLike): Promise<Uint8Array> {
  const api = subtleOf(subtle);
  const key = await api.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await api.sign('HMAC', key, encoder.encode(payload)));
}

/** Sign claims the way the room does (the receipts and the signaling double; production tokens come from the room). */
export async function signSeatTokenWeb(secret: string, claims: unknown, subtle?: SubtleLike): Promise<string> {
  if (typeof secret !== 'string' || secret.length < 16) throw new TypeError('seat secret must be at least 16 characters');
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = bytesToBase64Url(await hmacSha256(secret, payload, subtle));
  return `${payload}.${signature}`;
}

export async function verifySeatTokenWeb(secret: string, token: unknown, nowMs: number, subtle?: SubtleLike): Promise<SeatTokenResult> {
  const parts = splitSeatToken(token);
  if (!parts) return { ok: false, reason: 'malformed' };
  const provided = base64UrlToBytes(parts.signature);
  if (!provided) return { ok: false, reason: 'malformed' };
  const expected = await hmacSha256(secret, parts.payload, subtle);
  if (!constantTimeEqual(provided, expected)) return { ok: false, reason: 'bad_signature' };
  const payloadBytes = base64UrlToBytes(parts.payload);
  if (!payloadBytes) return { ok: false, reason: 'bad_claims' };
  let claims: unknown;
  try { claims = JSON.parse(decoder.decode(payloadBytes)); } catch { return { ok: false, reason: 'bad_claims' }; }
  return judgeSeatClaims(claims, nowMs);
}

/** `sha256Hex(text)` as the room derives the per-match host secret (`MATCH_SEAT_SECRET + ':' + matchId`). */
export async function sha256HexWeb(text: string, digest?: (algorithm: string, data: Uint8Array) => Promise<ArrayBuffer>): Promise<string> {
  const run = digest ?? ((algorithm, data) => {
    const subtle = (globalThis as { crypto?: { subtle?: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } } }).crypto?.subtle;
    if (!subtle) throw new Error('Web Crypto is unavailable in this runtime');
    return subtle.digest(algorithm, data);
  });
  const bytes = new Uint8Array(await run('SHA-256', encoder.encode(text)));
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}
