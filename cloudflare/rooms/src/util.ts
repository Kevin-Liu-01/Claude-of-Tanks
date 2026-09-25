/** Small helpers shared by the Worker entry and the Room object. */
import { ROOM_MAX_PAYLOAD_BYTES } from '../../../src/mp/room/protocol.ts';

/** Sockets one room object keeps: 36 seats plus pending admissions. */
export const MAX_SOCKETS = 48;
export const MAX_PENDING_SOCKETS = 16;

export function allowedOrigin(request: Request, allowed: string): boolean {
  const origin = request.headers.get('Origin');
  return !!origin && allowed.split(',').some((value) => value.trim() === origin);
}

export function isWebSocketUpgrade(request: Request): boolean {
  return request.method === 'GET' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket';
}

/** A text or binary UTF-8 frame as a bounded string; null when oversized. */
export function frameText(data: string | ArrayBuffer): string | null {
  if (typeof data === 'string') {
    return new TextEncoder().encode(data).byteLength > ROOM_MAX_PAYLOAD_BYTES ? null : data;
  }
  if (data.byteLength > ROOM_MAX_PAYLOAD_BYTES) return null;
  return new TextDecoder().decode(data);
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store', ...headers } });
}
