import { allowedOrigin, roomCodeFromUrl } from './protocol.ts';
export { PrivateRoom } from './privateRoom.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/healthz' && !url.search) {
      return Response.json({ ok: true, service: 'cot-signaling', backend: 'durable-object' },
        { headers: { 'cache-control': 'no-store' } });
    }
    const code = roomCodeFromUrl(request);
    if (!code) return Response.json({ error: 'invalid_room_route' }, { status: 404 });
    if (!allowedOrigin(request, env.ALLOWED_ORIGINS)) {
      return Response.json({ error: 'origin_forbidden' }, { status: 403 });
    }
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: 'websocket_required' }, { status: 426 });
    }
    const { success } = await env.ROOM_CONNECT_LIMITER.limit({
      key: request.headers.get('CF-Connecting-IP') || 'local',
    });
    if (!success) return Response.json({ error: 'rate_limit' },
      { status: 429, headers: { 'retry-after': '60' } });
    try { return await env.ROOMS.getByName(code).fetch(request); }
    catch { return Response.json({ error: 'signaling_store_unavailable' }, { status: 503 }); }
  },
} satisfies ExportedHandler<Env>;
