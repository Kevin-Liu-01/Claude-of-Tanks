/**
 * cot-rooms: the Multiplayer v2 room Worker.
 *
 *   GET /healthz                      shallow health (no room lifecycle proof)
 *   GET /rooms/<CODE>        (ws)     the room socket → the Room Durable Object for that code
 *   GET /rooms/<CODE>/match  (ws)     the match socket → the room's match container (or the shim)
 *
 * Origins are exact (`ALLOWED_ORIGINS`), upgrades are rate limited per client
 * IP, and the seat token a client presents on the match socket is verified by
 * the match service itself (server/match/service.ts); the Worker only routes.
 */
import { parseRoomRoute } from '../../../src/mp/room/protocol.ts';
import { proxyMatchSocket } from './matchHost.ts';
import { allowedOrigin, isWebSocketUpgrade, json } from './util.ts';
export { Room } from './room.ts';
export { MatchContainer } from './matchContainer.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz' && !url.search) {
      return json({ ok: true, service: 'cot-rooms', backend: 'durable-object', matchHost: env.MATCH_SHIM_URL ? 'shim' : 'container' });
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
