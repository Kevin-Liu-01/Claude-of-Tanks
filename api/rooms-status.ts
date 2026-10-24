import type { IncomingMessage, ServerResponse } from 'node:http';
import { OFFICIAL_ROOMS_URL } from './_lib/policy.ts';

/**
 * GET /api/rooms-status (security audit 2026-10-22, NV-5/NV-9; owner ruling 2026-10-23: the account stays on Workers
 * Free). A browser cannot read why a WebSocket upgrade failed, so after a failed or interrupted room connection the
 * Play menu asks here once (src/mp/session/roomServiceLimit.ts). This function reads the rooms Worker's /healthz from
 * the server, where Cloudflare's refusal is visible: past the account's daily request cap Cloudflare answers error
 * 1027 (HTTP 429) instead of running the Worker. The answer is cached at the edge, so however many players ask, the
 * rooms Worker sees at most one probe per edge region per cache window.
 */
export type RoomServiceState = 'ok' | 'limited' | 'unavailable';

const HEALTH_URL = `${OFFICIAL_ROOMS_URL.replace(/^wss:/, 'https:')}/healthz`;
const CACHE_CONTROL: Record<RoomServiceState, string> = {
  ok: 'public, max-age=30, s-maxage=120, stale-while-revalidate=60',
  limited: 'public, max-age=60, s-maxage=300',
  unavailable: 'public, max-age=15, s-maxage=30',
};

/** The rooms Worker's health answer as a state: Cloudflare's daily-limit refusal (1027, a 429) is `limited`. */
export function classifyRoomsHealth(status: number, body: string): RoomServiceState {
  if (status === 429 || /error code:?\s*1027\b|\b1027\b[^]{0,200}rate.?limited|rate.?limited[^]{0,200}\b1027\b/i.test(body)) return 'limited';
  return status === 200 ? 'ok' : 'unavailable';
}

interface RoomsStatusOptions {
  fetchImpl?: typeof fetch;
  warn?: (line: string) => void;
}

export function createRoomsStatusHandler({ fetchImpl = globalThis.fetch, warn = (line) => console.warn(line) }: RoomsStatusOptions = {}) {
  return async function roomsStatus(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader('content-type', 'application/json; charset=utf-8');
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.statusCode = 405;
      response.setHeader('allow', 'GET, HEAD');
      response.setHeader('cache-control', 'private, no-store, max-age=0');
      response.end(JSON.stringify({ error: 'method_not_allowed' }));
      return;
    }
    let state: RoomServiceState = 'unavailable';
    try {
      const upstream = await fetchImpl(HEALTH_URL, { signal: AbortSignal.timeout(4_000), headers: { 'user-agent': 'claude-of-tanks-rooms-status' } });
      const body = upstream.status === 200 ? '' : (await upstream.text()).slice(0, 4096);
      state = classifyRoomsHealth(upstream.status, body);
      if (state !== 'ok') warn(JSON.stringify({ tag: 'cot-rooms-status', state, upstreamStatus: upstream.status }));
    } catch (error) {
      warn(JSON.stringify({ tag: 'cot-rooms-status', state, error: error instanceof Error ? error.name : 'unknown' }));
    }
    response.statusCode = 200;
    response.setHeader('cache-control', CACHE_CONTROL[state]);
    response.end(request.method === 'HEAD' ? '' : JSON.stringify({ state }));
  };
}

export default createRoomsStatusHandler();
