import type { IncomingMessage, ServerResponse } from 'node:http';
import { OFFICIAL_STUN_URLS } from './_lib/policy.ts';

/**
 * DEPRECATED — delete with the release after the one that ships it (2026-10-02, docs/MULTIPLAYER-V2.md §13.14).
 *
 * Relay (TURN) credentials are minted inside the room for its seated players (`room_relay`, the rooms Worker); this
 * route mints none and holds no secret. It stays one release for the tabs loaded before that release, whose client
 * still asks `/api/ice` once per peer connection: they receive the official STUN servers alone — no TURN credential, no
 * provider call — so their links keep their direct paths through NAT, where a plain 404 would have left them host
 * candidates only (their client falls back to an empty server list on any error). The client of this release never
 * calls it.
 */
export default function deprecatedIceConfig(request: IncomingMessage, response: ServerResponse): void {
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'private, no-store, max-age=0');
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('allow', 'GET');
    response.end(JSON.stringify({ error: 'method_not_allowed' }));
    return;
  }
  response.statusCode = 200;
  response.end(JSON.stringify({ iceServers: [{ urls: [...OFFICIAL_STUN_URLS] }], relayOnly: false, deprecated: 'relay credentials come from the room' }));
}
