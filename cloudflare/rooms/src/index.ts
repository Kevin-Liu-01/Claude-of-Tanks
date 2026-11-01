/**
 * cot-rooms: the Multiplayer v2 room Worker (Free plan since the peer-to-peer
 * re-scope, docs/MULTIPLAYER-V2.md §13).
 *
 *   GET /healthz                      shallow health (no room lifecycle proof)
 *   GET /rooms/<CODE>        (ws)     the room socket → the Room Durable Object for that code
 *   GET /rooms/<CODE>/match  (ws)     503 match_host_unavailable: the match runs between the browsers, never here
 *   GET /pad/new             (ws)     the phone controller: a desktop takes a fresh code → PadPair for that code
 *   GET /pad/join/<CODE>     (ws)     a phone pairs with a waiting code (docs/PHONE-CONTROLLER.md)
 *   GET /pad/resume/<CODE>   (ws)     either side comes back with its resume token
 *
 * Origins are exact (`ALLOWED_ORIGINS`) and upgrades are rate limited per client
 * IP. The Worker carries no game traffic: the Room object relays a few dozen
 * signaling messages per join and the match runs between the browsers over
 * WebRTC (the dedicated-service backend left the tree with the cutover of
 * 2026-09-29, docs/MULTIPLAYER-V2.md §13.10).
 */
import { parseRoomRoute } from '../../../src/mp/room/protocol.ts';
import { drawPadCode, parsePadRoute } from '../../../src/pad/padProtocol.ts';
import { allowedOrigin, isWebSocketUpgrade, json } from './util.ts';
export { Room } from './room.ts';
export { PadPair } from './padPair.ts';

/** A uniform [0, 1) draw from the platform CSPRNG (pairing codes are capabilities). */
const cryptoRandom = (): number => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

/** The phone controller's pairing (its own channel and limiter, never a room). A held code is drawn again. */
async function padFetch(request: Request, env: Env, url: URL): Promise<Response> {
  const route = parsePadRoute(url.pathname);
  if (!route || url.hash || url.search) return json({ error: 'invalid_pad_route' }, 404);
  if (!allowedOrigin(request, env.ALLOWED_ORIGINS)) return json({ error: 'origin_forbidden' }, 403);
  if (!isWebSocketUpgrade(request)) return json({ error: 'websocket_required' }, 426);
  const { success } = await env.PAD_CONNECT_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
  if (!success) return json({ error: 'rate_limit' }, 429, { 'retry-after': '60' });
  try {
    if (route.kind !== 'new') return await env.PADS.getByName(route.code).fetch(new Request(new URL(`/pad/${route.kind}/${route.code}`, url), request));
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = drawPadCode(cryptoRandom);
      const response = await env.PADS.getByName(code).fetch(new Request(new URL(`/pad/new/${code}`, url), request));
      if (response.status !== 409) return response;
    }
    return json({ error: 'pad_busy' }, 503);
  } catch (error) {
    console.error('pad object unavailable', { error: String(error) });
    return json({ error: 'pad_store_unavailable' }, 503);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Anonymous junk is answered from the request alone, cheapest first, before the limiter and the Durable Object
    // (security audit 2026-10-22, NV-5/NV-9: the account is on Workers Free, and only a real room socket reaches a room).
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405, { allow: 'GET' });
    const url = new URL(request.url);
    if (url.pathname === '/healthz' && !url.search) {
      return json({ ok: true, service: 'cot-rooms', backend: 'durable-object', matchHost: 'p2p' });
    }
    if (url.pathname.startsWith('/pad/')) return padFetch(request, env, url);
    const route = parseRoomRoute(url.pathname);
    if (!route || url.hash || url.search) return json({ error: 'invalid_room_route' }, 404);
    if (!allowedOrigin(request, env.ALLOWED_ORIGINS)) return json({ error: 'origin_forbidden' }, 403);
    if (!isWebSocketUpgrade(request)) return json({ error: 'websocket_required' }, 426);
    if (route.match) return json({ error: 'match_host_unavailable' }, 503);
    const { success } = await env.ROOM_CONNECT_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'local' });
    if (!success) return json({ error: 'rate_limit' }, 429, { 'retry-after': '60' });
    try { return await env.ROOMS.getByName(route.code).fetch(request); }
    catch (error) { console.error('room object unavailable', { room: route.code, error: String(error) }); return json({ error: 'room_store_unavailable' }, 503); }
  },
} satisfies ExportedHandler<Env>;
