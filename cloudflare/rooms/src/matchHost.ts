/**
 * Where a room's match runs, seen from the Worker. Since the peer-to-peer
 * re-scope (owner 2026-09-28, docs/MULTIPLAYER-V2.md §13) the default is the
 * `p2p` host: the match runs in the host commander's browser and the Room
 * object elects, signals and migrates (`src/mp/room/p2pMatchHost.ts`). The
 * dedicated-service backend stays parked in the tree and is selected only
 * when a `MATCH` container binding exists (`matchContainer.ts`, a paid
 * account) or `MATCH_SHIM_URL` names a match service started outside the
 * Worker (local development, receipts). Both speak `server/match/control.ts`.
 */
import { getContainer } from '@cloudflare/containers';
import type { MatchHost, MatchHostStartConfig, MatchHostStatus, ServiceMatchHost } from '../../../src/mp/room/roomActor.ts';
import { createP2pMatchHost } from '../../../src/mp/room/p2pMatchHost.ts';
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

/** Which backend this environment selects: the parked service when a shim or a container binding exists, else p2p. */
export function matchHostKind(env: ControlEnv): 'p2p' | 'shim' | 'container' {
  if (shimUrl(env)) return 'shim';
  return env.MATCH ? 'container' : 'p2p';
}

/** The fetch that reaches the control routes: the container stub or the shim's origin. */
function controlFetch(env: ControlEnv, roomCode: string): (path: string, init?: RequestInit) => Promise<Response> {
  const shim = shimUrl(env);
  const headers = { authorization: `Bearer ${controlSecret(env)}`, 'content-type': 'application/json' };
  if (shim) return (path, init) => fetch(`${shim}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
  if (!env.MATCH) throw new Error('no match service: bind MATCH or set MATCH_SHIM_URL');
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

/** The parked dedicated-service backend: the container binding or the HTTP shim, polled by the room's alarm. */
export function createServiceMatchHost(env: ControlEnv, roomCode: string): ServiceMatchHost {
  const shim = shimUrl(env);
  const call = controlFetch(env, roomCode);
  return {
    transport: 'service',
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

/** The room's match host for this environment (see `matchHostKind`). */
export function createMatchHost(env: ControlEnv, roomCode: string): MatchHost {
  return matchHostKind(env) === 'p2p' ? createP2pMatchHost() : createServiceMatchHost(env, roomCode);
}

/** Proxy a `/rooms/<CODE>/match` WebSocket upgrade to the room's match service at `/match` (503 with the p2p host). */
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
