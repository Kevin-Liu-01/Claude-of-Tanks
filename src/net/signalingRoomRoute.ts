const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const MAX_ROOM_ROUTE_CANDIDATES = 16;
export const ROOM_ROUTE_POLL_INTERVAL_MS = 15_000;

/** Only the explicit room namespace opts in; LAN/legacy URLs stay unchanged. */
export function usesRoomSignalingRoute(endpoint: string): boolean {
  return new URL(endpoint).pathname.replace(/\/$/, '').endsWith('/rooms');
}

export function roomSignalingSocketUrl(endpoint: string, roomCode: string | null): string | null {
  if (!usesRoomSignalingRoute(endpoint)) return endpoint;
  const url = new URL(endpoint);
  if (url.username || url.password || url.search || endpoint.includes('#')) {
    throw new TypeError('room signaling URL must not contain credentials, query or fragment');
  }
  if (!roomCode) return null;
  if (!/^[A-Z0-9]{6}$/.test(roomCode)) throw new TypeError('room route requires a canonical room code');
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${roomCode}`;
  return url.href;
}

/** The 32-symbol alphabet divides 256 exactly, so masking has no modulo bias. */
export function createSignalingRoomCode(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  let code = '';
  for (const byte of bytes) code += ROOM_CODE_ALPHABET[byte & 31];
  return code;
}
