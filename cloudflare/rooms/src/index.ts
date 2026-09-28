/**
 * cot-rooms: the Multiplayer v2 room Worker (Free plan since the peer-to-peer
 * re-scope, docs/MULTIPLAYER-V2.md §13).
 *
 *   GET /healthz                      shallow health (no room lifecycle proof)
 *   GET /rooms/<CODE>        (ws)     the room socket → the Room Durable Object for that code
 *   GET /rooms/<CODE>/match  (ws)     the match socket of the parked service backend (503 with the p2p host)
 *
 * Origins are exact (`ALLOWED_ORIGINS`) and upgrades are rate limited per client
 * IP. With the p2p host the Worker carries no game traffic: the Room object
 * relays a few dozen signaling messages per join and the match runs between
 * the browsers over WebRTC. `MatchContainer` (`matchContainer.ts`) is not
 * exported: a container class cannot deploy on the Free plan; a paid account
 * re-exports it, binds `MATCH` and restores the `containers` block.
 */
import { parseRoomRoute } from '../../../src/mp/room/protocol.ts';
import { matchHostKind, proxyMatchSocket } from './matchHost.ts';
import { allowedOrigin, isWebSocketUpgrade, json } from './util.ts';
export { Room } from './room.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz' && !url.search) {
      return json({ ok: true, service: 'cot-rooms', backend: 'durable-object', matchHost: matchHostKind(env) });
    }
    const route = parseRoomRoute(url.pathname);
    if (!route || url.hash) return json({ error: 'invalid_room_route' }, 404);
    if (!allowedOrigin(request, env.ALLOWED_ORIGINS)) return json({ error: 'origin_forbidden' }, 403);
    if (!isWebSocketUpgrade(request)) return json({ error: 'websocket_required' }, 426);
    const { success } = await env.ROOM_CONNECT_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
    if (!success) return json({ error: 'rate_limit' }, 429, { 'retry-after': '60' });
    if (route.match) {
      try { return await proxyMatchSocket(env, route.code, request); }
      catch (error) { console.error('match proxy failed', { room: route.code, error: String(error) }); return json({ error: 'match_host_unavailable' }, 503); }
    }
    if (url.search) return json({ error: 'invalid_room_route' }, 404);
    try { return await env.ROOMS.getByName(route.code).fetch(request); }
    catch (error) { console.error('room object unavailable', { room: route.code, error: String(error) }); return json({ error: 'room_store_unavailable' }, 503); }
  },
} satisfies ExportedHandler<Env>;
