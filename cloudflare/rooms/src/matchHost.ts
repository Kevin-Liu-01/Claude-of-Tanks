/**
 * Where a room's match runs, seen from the Worker: the container bound as
 * `MATCH` (one `MatchContainer` instance per room code, started with
 * `startAndWaitForPorts`, its control routes and `/match` WebSocket reached
 * through `stub.fetch`), or — when `MATCH_SHIM_URL` names a match service
 * started outside the Worker — that HTTP endpoint (local development without
 * a container runtime, receipts). Both speak `server/match/control.ts`.
 */
import { getContainer } from '@cloudflare/containers';
import type { MatchHost, MatchHostStartConfig, MatchHostStatus } from '../../../src/mp/room/roomActor.ts';
import { matchSocketPath } from '../../../src/mp/room/protocol.ts';
import type { MatchContainer } from './matchContainer.ts';

const CONTROL_ORIGIN = 'http://match';

interface ControlEnv {
  MATCH?: DurableObjectNamespace<MatchContainer>;
  MATCH_SHIM_URL?: string;
  MATCH_SEAT_SECRET: string;
  MATCH_CONTROL_SECRET?: string;
}

function controlSecret(env: ControlEnv): string {
  return env.MATCH_CONTROL_SECRET || env.MATCH_SEAT_SECRET;
}

function shimUrl(env: ControlEnv): string | null {
  const url = (env.MATCH_SHIM_URL ?? '').trim();
  return url ? url.replace(/\/+$/, '') : null;
}

/** The fetch that reaches the control routes: the container stub or the shim's origin. */
function controlFetch(env: ControlEnv, roomCode: string): (path: string, init?: RequestInit) => Promise<Response> {
  const shim = shimUrl(env);
  const headers = { authorization: `Bearer ${controlSecret(env)}`, 'content-type': 'application/json' };
  if (shim) return (path, init) => fetch(`${shim}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  if (!env.MATCH) throw new Error('no match host: bind MATCH or set MATCH_SHIM_URL');
  const container = getContainer(env.MATCH, roomCode);
  return (path, init) => container.fetch(new Request(`${CONTROL_ORIGIN}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } }));
}

async function readStatus(response: Response, roomCode: string): Promise<MatchHostStatus | null> {
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`match host status ${response.status}`);
  const body = await response.json() as { matchId?: unknown; phase?: unknown; verdict?: unknown };
  const phase = body.phase;
  const known = phase === 'loading' || phase === 'countdown' || phase === 'playing' || phase === 'ended' || phase === 'stopped';
  const verdict = body.verdict && typeof body.verdict === 'object'
    ? body.verdict as { result: 'alpha' | 'bravo' | 'draw'; reason: string } : null;
  return { roomId: roomCode, matchId: typeof body.matchId === 'string' ? body.matchId : null, phase: known ? phase : 'unknown', verdict };
}

export function createMatchHost(env: ControlEnv, roomCode: string): MatchHost {
  const shim = shimUrl(env);
  const call = controlFetch(env, roomCode);
  return {
    async start(config: MatchHostStartConfig) {
      if (!shim && env.MATCH) {
        // The container boots in seconds; wait for the match service port before posting the start.
        await getContainer(env.MATCH, roomCode).startAndWaitForPorts({ cancellationOptions: { portReadyTimeoutMS: 30_000 } });
      }
      const response = await call('/control/matches', { method: 'POST', body: JSON.stringify(config) });
      if (response.status === 409) throw new Error('a match is already running for this room');
      if (!response.ok) throw new Error(`match host refused the start (${response.status})`);
      return { matchUrl: matchSocketPath(roomCode) };
    },
    async status() {
      return readStatus(await call(`/control/matches/${roomCode}`, { method: 'GET' }), roomCode);
    },
    async stop() {
      await call(`/control/matches/${roomCode}`, { method: 'DELETE' });
    },
  };
}

/** Proxy a `/rooms/<CODE>/match` WebSocket upgrade to the room's match service at `/match`. */
export function proxyMatchSocket(env: ControlEnv, roomCode: string, request: Request): Promise<Response> {
  const target = new URL(request.url);
  target.pathname = '/match';
  const shim = shimUrl(env);
  if (shim) {
    const origin = new URL(shim);
    target.protocol = origin.protocol === 'https:' ? 'https:' : 'http:';
    target.host = origin.host;
    return fetch(new Request(target.toString(), request));
  }
  if (!env.MATCH) return Promise.resolve(Response.json({ error: 'match_host_unavailable' }, { status: 503 }));
  return getContainer(env.MATCH, roomCode).fetch(new Request(target.toString(), request));
}
