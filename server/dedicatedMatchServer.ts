import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { createWebSocketTransport } from '../src/net/channelTransport.ts';
import { DedicatedMatchRegistry } from './dedicatedMatchRegistry.ts';
import { RankedMatchmaker } from './rankedMatchmaker.js';
import { RatingStore } from './ratingStore.ts';

const AUTH_TIMEOUT_MS = 5000;
const MAX_MESSAGES_PER_SECOND = 180;

type AllowedOriginsInput = string | readonly string[] | null;

interface RankedStats {
  queuedPlayers: number;
  ratedMatches: number;
}

interface RankedMatchmakerLike {
  createIdentity(input: { name?: unknown }): unknown;
  leaderboard(limit: unknown): unknown;
  profile(playerId: string): unknown;
  join(input: Record<string, unknown>): unknown;
  poll(ticketId: string, token: string): unknown;
  cancel(ticketId: string, token: string): boolean;
  reconcile(): void;
  stats(): RankedStats;
}

interface RankedMatchmakerConstructor {
  new(options: {
    registry: DedicatedMatchRegistry;
    ratings: unknown;
  }): RankedMatchmakerLike;
}

export interface DedicatedMatchServerOptions {
  host?: string;
  port?: number;
  allowedOrigins?: AllowedOriginsInput;
  autoTick?: boolean;
  registry?: DedicatedMatchRegistry;
  matchmaker?: RankedMatchmakerLike;
}

export interface DedicatedMatchServerService {
  registry: DedicatedMatchRegistry;
  matchmaker: RankedMatchmakerLike;
  server: http.Server;
  sockets: WebSocketServer;
  address: AddressInfo;
  advance(elapsedMs: number): number;
  close(reason?: string): Promise<void>;
}

interface MatchAuthMessage extends Record<string, unknown> {
  type: 'match_auth';
  matchId?: unknown;
  playerId?: unknown;
  token?: unknown;
}

interface HttpError extends Error {
  status?: number;
  code?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asHttpError(value: unknown): HttpError {
  return value instanceof Error ? value as HttpError : new Error(String(value));
}

function json(
  response: http.ServerResponse,
  status: number,
  body: unknown,
  headers: http.OutgoingHttpHeaders = {},
): void {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(data);
}

function corsHeaders(
  request: http.IncomingMessage,
  origins: ReadonlySet<string> | null,
): http.OutgoingHttpHeaders {
  const origin = request.headers.origin;
  if (!origin || (origins && !origins.has(origin))) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    vary: 'origin',
  };
}

function bearer(request: http.IncomingMessage): string {
  const match = /^Bearer\s+(.+)$/i.exec(String(request.headers.authorization || ''));
  return match ? match[1] : '';
}

async function readJson(
  request: http.IncomingMessage,
  maxBytes = 16 * 1024,
): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maxBytes) throw Object.assign(new Error('request body is too large'), { status: 413 });
    chunks.push(bytes);
  }
  if (!chunks.length) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!isRecord(parsed)) throw new Error('request body must be a JSON object');
    return parsed;
  }
  catch (_) { throw Object.assign(new Error('request body must be valid JSON'), { status: 400 }); }
}

function parseAllowedOrigins(value: AllowedOriginsInput): Set<string> | null {
  if (!value) return null;
  const values: readonly string[] = Array.isArray(value) ? value : String(value).split(',');
  return new Set(values.map((origin) => origin.trim()).filter(Boolean));
}

function parseMatchAuth(raw: RawData): MatchAuthMessage | null {
  let value: unknown;
  try { value = JSON.parse(String(raw)) as unknown; } catch (_) { return null; }
  if (!isRecord(value) || value.type !== 'match_auth') return null;
  return value as MatchAuthMessage;
}

function createDefaultMatchmaker(registry: DedicatedMatchRegistry): RankedMatchmakerLike {
  const RankedMatchmakerClass = RankedMatchmaker as unknown as RankedMatchmakerConstructor;
  return new RankedMatchmakerClass({
    registry,
    ratings: new RatingStore({ filePath: process.env.COT_RATING_FILE || null }),
  });
}

export async function createDedicatedMatchServer({
  host = '127.0.0.1',
  port = 0,
  allowedOrigins = null,
  autoTick = true,
  registry = new DedicatedMatchRegistry(),
  matchmaker = createDefaultMatchmaker(registry),
}: DedicatedMatchServerOptions = {}): Promise<DedicatedMatchServerService> {
  const origins = parseAllowedOrigins(allowedOrigins);
  const server = http.createServer(async (request, response) => {
    const headers = corsHeaders(request, origins);
    if (origins && request.headers.origin && !origins.has(request.headers.origin)) {
      json(response, 403, { error: 'origin_forbidden' });
      return;
    }
    let url: URL;
    try { url = new URL(String(request.url || ''), 'http://localhost'); }
    catch (_) { json(response, 400, { error: 'invalid_url' }, headers); return; }
    if (request.method === 'OPTIONS' && url.pathname.startsWith('/ranked/')) {
      response.writeHead(204, headers);
      response.end();
      return;
    }
    try {
      if (request.method === 'GET' && url.pathname === '/healthz') {
        json(response, 200, { ok: true, service: 'cot-match', ...registry.stats(),
          ...matchmaker.stats() }, headers);
      } else if (request.method === 'POST' && url.pathname === '/ranked/identity') {
        const body = await readJson(request);
        json(response, 201, matchmaker.createIdentity({ name: body.name }), headers);
      } else if (request.method === 'GET' && url.pathname === '/ranked/leaderboard') {
        json(response, 200, { players: matchmaker.leaderboard(url.searchParams.get('limit')) }, headers);
      } else if (request.method === 'GET' && url.pathname.startsWith('/ranked/profile/')) {
        const playerId = decodeURIComponent(url.pathname.slice('/ranked/profile/'.length));
        const profile = matchmaker.profile(playerId);
        json(response, profile ? 200 : 404, profile || { error: 'profile_not_found' }, headers);
      } else if (request.method === 'POST' && url.pathname === '/ranked/queue') {
        const body = await readJson(request);
        const queued = matchmaker.join({ ...body, identityToken: bearer(request) });
        json(response, 202, queued, headers);
      } else if (url.pathname.startsWith('/ranked/queue/')) {
        const ticketId = decodeURIComponent(url.pathname.slice('/ranked/queue/'.length));
        const token = bearer(request);
        if (request.method === 'GET') {
          const ticket = matchmaker.poll(ticketId, token);
          json(response, ticket ? 200 : 404, ticket || { error: 'ticket_not_found' }, headers);
        } else if (request.method === 'DELETE') {
          const cancelled = matchmaker.cancel(ticketId, token);
          json(response, cancelled ? 200 : 409,
            cancelled ? { cancelled: true } : { error: 'ticket_not_cancellable' }, headers);
        } else json(response, 405, { error: 'method_not_allowed' }, headers);
      } else json(response, 404, { error: 'not_found' }, headers);
    } catch (caught) {
      const error = asHttpError(caught);
      json(response, error.status || (error.code === 'ranked_auth_failed' ? 401 : 400), {
        error: error.code || 'invalid_request',
        message: error.message,
      }, headers);
    }
  });
  const sockets = new WebSocketServer({
    noServer: true,
    maxPayload: 64 * 1024,
    perMessageDeflate: false,
  });

  server.on('upgrade', (request, socket, head) => {
    let path: string;
    try { path = new URL(String(request.url || ''), 'http://localhost').pathname; }
    catch (_) { path = ''; }
    const origin = request.headers.origin;
    if (path !== '/match' || (origins && (!origin || !origins.has(origin)))) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(request, socket, head, (websocket: WebSocket) => {
      sockets.emit('connection', websocket, request);
    });
  });

  sockets.on('connection', (socket: WebSocket) => {
    let authenticated = false;
    const timeout = setTimeout(() => socket.close(4401, 'authentication_timeout'), AUTH_TIMEOUT_MS);
    const authenticate = (raw: RawData): void => {
      if (authenticated) return;
      const message = parseMatchAuth(raw);
      if (!message) {
        socket.close(4401, 'authentication_required');
        return;
      }
      try {
        authenticated = true;
        clearTimeout(timeout);
        socket.off('message', authenticate);
        let windowStartedAt = Date.now();
        let messages = 0;
        socket.on('message', () => {
          const now = Date.now();
          if (now - windowStartedAt >= 1000) { windowStartedAt = now; messages = 0; }
          messages++;
          if (messages > MAX_MESSAGES_PER_SECOND) socket.close(4429, 'rate_limit');
        });
        const transport = createWebSocketTransport(socket, {
          maxMessageBytes: 64 * 1024,
          maxBufferedBytes: 512 * 1024,
        });
        registry.attach({
          matchId: message.matchId,
          playerId: message.playerId,
          token: message.token,
          transport,
        });
      } catch (_) {
        socket.close(4403, 'authentication_failed');
      }
    };
    socket.on('message', authenticate);
    socket.once('close', () => clearTimeout(timeout));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTickMs = performance.now();
  if (autoTick) {
    timer = setInterval(() => {
      const now = performance.now();
      registry.advance(Math.max(0, now - lastTickMs));
      matchmaker.reconcile();
      lastTickMs = now;
    }, 8);
    if (typeof timer.unref === 'function') timer.unref();
  }

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('dedicated match server did not bind a TCP address');
  }
  return {
    registry,
    matchmaker,
    server,
    sockets,
    address,
    advance(elapsedMs: number): number {
      const steps = registry.advance(elapsedMs);
      matchmaker.reconcile();
      return steps;
    },
    async close(reason = 'server_closed'): Promise<void> {
      if (timer) clearInterval(timer);
      registry.close(reason);
      for (const client of sockets.clients) client.close(1001, reason);
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) {
  const host = process.env.COT_MATCH_HOST || '127.0.0.1';
  const port = Number(process.env.COT_MATCH_PORT || 8790);
  createDedicatedMatchServer({
    host,
    port,
    allowedOrigins: process.env.COT_ALLOWED_ORIGINS || null,
  }).then(() => {
    console.log(`[match] ws://${host}:${port}/match`);
  }).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
