/**
 * The match service: one Node process hosting N MatchActors behind a
 * WebSocket endpoint (`/match`, binary frames, TLS terminated upstream) and
 * an HTTP surface (`/healthz` readiness, `/metrics` JSON). Admission: the
 * first frame must be a HELLO carrying a seat token signed by the room
 * service; the token names the room, so the service routes the socket to its
 * actor. Origin allowlist, payload and rate bounds, graceful drain.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { CLOSE_REASON, CLOSE_REASON_NAMES, MAX_CLIENT_MESSAGE_BYTES, MESSAGE_TYPE } from '../../src/mp/wire/constants.ts';
import type { CloseReasonId } from '../../src/mp/wire/constants.ts';
import { decodeMessage, encodeMessage } from '../../src/mp/wire/codec.ts';
import { toUint8Array } from '../../src/mp/wire/bytes.ts';
import type { ClientLink } from './link.ts';
import { createLogger, type Logger } from './log.ts';
import { createMatchActor, type MatchActor, type MatchActorOptions, type MatchActorStats } from './matchActor.ts';
import { verifySeatToken } from './seatToken.ts';
import { createMatchControl } from './control.ts';
import type { MatchStartRequest } from './control.ts';

const HELLO_TIMEOUT_MS = 5000;
const WS_PATH = '/match';

export interface MatchServiceOptions {
  host?: string;
  port?: number;
  /** Exact origins allowed to connect; null allows any (LAN / development). */
  allowedOrigins?: readonly string[] | null;
  seatSecret: string;
  /** Bearer secret of the `/control/*` routes (defaults to the seat secret). */
  controlSecret?: string;
  maxActors?: number;
  /**
   * Battle limit (s) for a match whose start request names none: local runs and receipts cap the
   * ruleset's clock so a verdict arrives in seconds. Unset in production (the ruleset decides).
   */
  defaultBattleLimitS?: number;
  log?: Logger;
  now?: () => number;
  /** Wall clock for token expiry (Date.now). */
  wallClock?: () => number;
  /**
   * Mount on an existing HTTP server instead of listening: the owner dispatches
   * requests and upgrades through `handleRequest` / `handleUpgrade` (the LAN
   * helper serves rooms and the match on one port this way).
   */
  server?: http.Server;
}

export interface MatchServiceStats {
  ok: boolean;
  draining: boolean;
  actors: number;
  clients: number;
  connections: number;
  rejectedUpgrades: number;
  rejectedHellos: number;
  bytesOut: number;
  bytesIn: number;
  uptimeS: number;
  rssMb: number;
  tickMs: { p50: number; p95: number; max: number };
}

export interface MatchService {
  readonly address: AddressInfo;
  readonly url: string;
  readonly draining: boolean;
  readonly actors: ReadonlyMap<string, MatchActor>;
  createActor(options: Omit<MatchActorOptions, 'log' | 'now'> & Partial<Pick<MatchActorOptions, 'log' | 'now'>>): MatchActor;
  removeActor(roomId: string, reason?: CloseReasonId): boolean;
  stats(): MatchServiceStats;
  actorStats(): MatchActorStats[];
  /** True when the request was one of the service's routes (`/healthz`, `/metrics`, `/control/*`). */
  handleRequest(request: http.IncomingMessage, response: http.ServerResponse): boolean;
  /** True when the upgrade was for `/match` (admitted or refused). */
  handleUpgrade(request: http.IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): boolean;
  /** Drain: stop admitting, close every actor with SERVER_DRAIN, close the listeners. */
  close(options?: { reason?: CloseReasonId; detail?: string }): Promise<void>;
}

function parseAllowedOrigins(value: readonly string[] | null | undefined): Set<string> | null {
  if (!value) return null;
  const origins = new Set(value.map((origin) => origin.trim()).filter(Boolean));
  return origins.size ? origins : null;
}

function json(response: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'cache-control': 'no-store',
  });
  response.end(data);
}

function createSocketLink(socket: WebSocket, label: string): ClientLink {
  let closed = false;
  let messageListener: ((bytes: Uint8Array) => void) | null = null;
  let closeListener: (() => void) | null = null;
  socket.on('message', (raw: RawData, isBinary: boolean) => {
    if (closed || !messageListener) return;
    if (!isBinary) { link.close(CLOSE_REASON.MALFORMED, 'text frame'); return; }
    const bytes = toUint8Array(Array.isArray(raw) ? Buffer.concat(raw) : raw);
    if (bytes) messageListener(bytes);
  });
  socket.once('close', () => {
    closed = true;
    closeListener?.();
  });
  socket.on('error', () => { /* the close event follows; nothing to log per frame */ });
  const link: ClientLink = {
    label,
    get bufferedAmount() { return socket.bufferedAmount; },
    get closed() { return closed || socket.readyState !== socket.OPEN; },
    send(bytes) {
      if (closed || socket.readyState !== socket.OPEN) throw new Error('socket not open');
      socket.send(bytes, { binary: true });
    },
    close(reason, detail = '') {
      if (closed) return;
      closed = true;
      try {
        if (socket.readyState === socket.OPEN) {
          socket.send(encodeMessage({ type: MESSAGE_TYPE.CLOSE, reason, detail }), { binary: true });
          socket.close(1000, CLOSE_REASON_NAMES[reason] ?? 'closed');
        } else socket.terminate();
      } catch {
        socket.terminate();
      }
    },
    onMessage(listener) { messageListener = listener; },
    onClose(listener) { closeListener = listener; },
  };
  return link;
}

export async function createMatchService({
  host = '127.0.0.1',
  port = 0,
  allowedOrigins = null,
  seatSecret,
  controlSecret = seatSecret,
  maxActors = 64,
  defaultBattleLimitS,
  log = createLogger(),
  now = () => performance.now(),
  wallClock = () => Date.now(),
  server: externalServer,
}: MatchServiceOptions): Promise<MatchService> {
  if (typeof seatSecret !== 'string' || seatSecret.length < 16) throw new TypeError('seatSecret must be at least 16 characters');
  if (typeof controlSecret !== 'string' || controlSecret.length < 16) throw new TypeError('controlSecret must be at least 16 characters');
  if (!Number.isInteger(maxActors) || maxActors < 1 || maxActors > 1024) throw new TypeError('maxActors must be 1..1024');
  if (defaultBattleLimitS !== undefined && (!Number.isFinite(defaultBattleLimitS) || defaultBattleLimitS < 10 || defaultBattleLimitS > 3600)) {
    throw new TypeError('defaultBattleLimitS must be 10..3600 seconds');
  }
  const origins = parseAllowedOrigins(allowedOrigins);
  const actors = new Map<string, MatchActor>();
  const startedAt = wallClock();
  const counters = { connections: 0, rejectedUpgrades: 0, rejectedHellos: 0 };
  let draining = false;

  function totals() {
    let clients = 0;
    let bytesOut = 0;
    let bytesIn = 0;
    const p50: number[] = [];
    const p95: number[] = [];
    let max = 0;
    for (const actor of actors.values()) {
      const stats = actor.stats();
      clients += stats.clients;
      bytesOut += stats.bytesOut;
      bytesIn += stats.bytesIn;
      p50.push(stats.tickMs.p50);
      p95.push(stats.tickMs.p95);
      if (stats.tickMs.max > max) max = stats.tickMs.max;
    }
    return {
      clients, bytesOut, bytesIn,
      tickMs: { p50: p50.length ? Math.max(...p50) : 0, p95: p95.length ? Math.max(...p95) : 0, max },
    };
  }

  function stats(): MatchServiceStats {
    const sum = totals();
    return {
      ok: !draining,
      draining,
      actors: actors.size,
      clients: sum.clients,
      connections: counters.connections,
      rejectedUpgrades: counters.rejectedUpgrades,
      rejectedHellos: counters.rejectedHellos,
      bytesOut: sum.bytesOut,
      bytesIn: sum.bytesIn,
      uptimeS: Math.round((wallClock() - startedAt) / 1000),
      rssMb: Math.round(process.memoryUsage().rss / 1048576),
      tickMs: sum.tickMs,
    };
  }

  function createActor(options: Parameters<MatchService['createActor']>[0]): MatchActor {
    if (draining) throw new Error('match service is draining');
    // stopped actors are reclaimed lazily so a room can rematch under the same id
    for (const [roomId, actor] of actors) if (actor.stopped) actors.delete(roomId);
    if (actors.has(options.roomId)) throw new Error(`room ${options.roomId} already has a match`);
    if (actors.size >= maxActors) throw new Error(`match service is full (${maxActors})`);
    const actor = createMatchActor({ log, now, ...options });
    actors.set(options.roomId, actor);
    log.info('actor created', { room: options.roomId, map: options.mapId, seats: options.seats.length, bots: options.bots?.length ?? 0 });
    return actor;
  }

  const control = createMatchControl({
    controlSecret,
    matchPath: WS_PATH,
    port: {
      actor: (roomId) => actors.get(roomId),
      createActor: (request: MatchStartRequest) => createActor({
        roomId: request.roomId, mapId: request.mapId, mode: request.mode, seed: request.seed, seats: request.seats, bots: request.bots,
        countdownS: request.countdownS, battleLimitS: request.battleLimitS ?? defaultBattleLimitS,
      }),
      removeActor: (roomId, reason) => removeActor(roomId, reason as CloseReasonId | undefined),
    },
  });

  function handleRequest(request: http.IncomingMessage, response: http.ServerResponse): boolean {
    const path = (request.url || '').split('?', 1)[0];
    if (request.method === 'GET' && path === '/healthz') {
      const body = stats();
      json(response, body.ok ? 200 : 503, body);
      return true;
    }
    if (request.method === 'GET' && path === '/metrics') {
      json(response, 200, { service: stats(), actors: [...actors.values()].map((actor) => actor.stats()) });
      return true;
    }
    return control.handle(request, response);
  }

  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_CLIENT_MESSAGE_BYTES, perMessageDeflate: false });

  function handleUpgrade(request: http.IncomingMessage, socket: import('node:stream').Duplex, head: Buffer): boolean {
    const path = (request.url || '').split('?', 1)[0];
    if (path !== WS_PATH) return false;
    const origin = request.headers.origin;
    if (draining || (origins && (!origin || !origins.has(origin)))) {
      counters.rejectedUpgrades++;
      socket.write(draining ? 'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n' : 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return true;
    }
    sockets.handleUpgrade(request, socket, head, (websocket) => sockets.emit('connection', websocket, request));
    return true;
  }

  const ownsServer = !externalServer;
  const server = externalServer ?? http.createServer((request, response) => {
    if (!handleRequest(request, response)) json(response, 404, { error: 'not_found' });
  });
  if (ownsServer) {
    server.on('upgrade', (request, socket, head) => {
      if (handleUpgrade(request, socket, head)) return;
      counters.rejectedUpgrades++;
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
    });
  }

  sockets.on('connection', (socket: WebSocket, request: http.IncomingMessage) => {
    counters.connections++;
    const label = `${request.socket.remoteAddress ?? '?'}:${request.socket.remotePort ?? '?'}`;
    const link = createSocketLink(socket, label);
    let admitted = false;
    const timeout = setTimeout(() => { if (!admitted) link.close(CLOSE_REASON.HELLO_REQUIRED, 'hello timeout'); }, HELLO_TIMEOUT_MS);
    link.onMessage((bytes) => {
      if (admitted) return;
      admitted = true;
      clearTimeout(timeout);
      const decoded = decodeMessage(bytes, { maxBytes: MAX_CLIENT_MESSAGE_BYTES });
      if (!decoded.ok || decoded.message.type !== MESSAGE_TYPE.HELLO) {
        counters.rejectedHellos++;
        link.close(CLOSE_REASON.HELLO_REQUIRED, decoded.ok ? 'first frame must be hello' : decoded.error.code);
        return;
      }
      const hello = decoded.message;
      const verified = verifySeatToken(seatSecret, hello.token, wallClock());
      if (!verified.ok) {
        counters.rejectedHellos++;
        link.close(verified.reason === 'expired' ? CLOSE_REASON.TOKEN_EXPIRED : CLOSE_REASON.BAD_TOKEN, verified.reason);
        return;
      }
      const actor = actors.get(verified.claims.roomId);
      if (!actor || actor.stopped) {
        counters.rejectedHellos++;
        link.close(CLOSE_REASON.ROOM_UNKNOWN, 'no match for this room');
        return;
      }
      if (!actor.attach(link, hello, verified.claims)) counters.rejectedHellos++;
    });
    link.onClose(() => clearTimeout(timeout));
  });

  if (ownsServer) {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => { server.off('error', reject); resolve(); });
    });
  }
  // An external server may listen after mounting: read the address lazily, then remember it (it stays readable after close).
  let cachedAddress: AddressInfo | null = null;
  const boundAddress = (): AddressInfo => {
    if (cachedAddress) return cachedAddress;
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('match service did not bind a TCP address');
    cachedAddress = address;
    return address;
  };
  const boundUrl = (): string => `ws://${host}:${boundAddress().port}${WS_PATH}`;
  if (ownsServer) log.info('match service listening', { url: boundUrl(), origins: origins ? [...origins].join(',') : 'any', maxActors });
  else log.info('match service mounted', { path: WS_PATH, origins: origins ? [...origins].join(',') : 'any', maxActors });

  function removeActor(roomId: string, reason: CloseReasonId = CLOSE_REASON.ROOM_CLOSED): boolean {
    const actor = actors.get(roomId);
    if (!actor) return false;
    actors.delete(roomId);
    actor.stop(reason);
    return true;
  }

  return {
    get address() { return boundAddress(); },
    get url() { return boundUrl(); },
    get draining() { return draining; },
    actors,
    createActor,
    removeActor,
    stats,
    actorStats: () => [...actors.values()].map((actor) => actor.stats()),
    handleRequest,
    handleUpgrade,
    async close({ reason = CLOSE_REASON.SERVER_DRAIN, detail = 'drain' } = {}) {
      if (draining) return;
      draining = true;
      log.info('draining', { actors: actors.size });
      for (const roomId of [...actors.keys()]) removeActor(roomId, reason);
      for (const client of sockets.clients) client.close(1001, detail);
      // `sockets.close` resolves only once every client is gone: a peer that never answers the close
      // handshake would hold the drain for ws's 30 s timer, so what is still open after 1 s is terminated.
      const deadline = Date.now() + 1000;
      while (sockets.clients.size > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      for (const client of sockets.clients) { try { client.terminate(); } catch { /* already gone */ } }
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
      if (ownsServer) await new Promise<void>((resolve) => server.close(() => resolve()));
      log.info('match service closed');
    },
  };
}
