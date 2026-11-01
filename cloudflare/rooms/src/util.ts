/** Small helpers shared by the Worker entry and the Room object. */
import { ROOM_MAX_PAYLOAD_BYTES } from '../../../src/mp/room/protocol.ts';

/** Sockets one room object keeps: 36 seats plus pending admissions. */
export const MAX_SOCKETS = 48;
export const MAX_PENDING_SOCKETS = 16;

/** An exact origin, or (the preview Worker's list, api/_lib/policy.ts ROOMS_PREVIEW_ALLOWED_ORIGINS) a pattern whose
 *  one `*` stands for a single lowercase alphanumeric label: no hyphen, no dot. */
function originMatches(entry: string, origin: string): boolean {
  if (!entry.includes('*')) return entry === origin;
  const [head, tail, ...rest] = entry.split('*');
  if (rest.length) return false;
  const middle = origin.startsWith(head!) && origin.endsWith(tail!) && origin.length > head!.length + tail!.length
    ? origin.slice(head!.length, origin.length - tail!.length) : '';
  return /^[a-z0-9]+$/.test(middle);
}

export function allowedOrigin(request: Request, allowed: string): boolean {
  const origin = request.headers.get('Origin');
  return !!origin && allowed.split(',').some((value) => originMatches(value.trim(), origin));
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
