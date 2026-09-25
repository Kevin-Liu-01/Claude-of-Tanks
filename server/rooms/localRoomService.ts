/**
 * LocalRoomService: the v2 room protocol served in-process by Node — the LAN
 * helper, the receipts and the headless end-to-end runs. It hosts one
 * `RoomActor` per room code over plain WebSockets (`/rooms/<CODE>`), keeps
 * everything in memory, signs seat tokens with the shared secret and starts
 * each match as a `MatchActor` in the same `MatchService`, so a `RoomClient`
 * cannot tell it from the Cloudflare Durable Object.
 *
 * Mount it on the match service's HTTP server (one port, `server/rooms/main.ts`)
 * or on its own; `handleRequest` / `handleUpgrade` return false for paths that
 * are not theirs so an owner can dispatch.
 */
import { createHash } from 'node:crypto';
import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { RoomActor } from '../../src/mp/room/roomActor.ts';
import type { MatchHost, MatchHostStartConfig, MatchHostStatus, RoomActorPorts } from '../../src/mp/room/roomActor.ts';
import { ROOM_MAX_PAYLOAD_BYTES, parseRoomRoute } from '../../src/mp/room/protocol.ts';
import type { RoomEnvelope } from '../../src/mp/room/protocol.ts';
import type { RoomPolicyGuards } from '../../src/mp/room/roomPolicy.ts';
import { signSeatToken } from '../match/seatToken.ts';
import { statusOf } from '../match/control.ts';
import type { MatchService } from '../match/service.ts';
import { silentLogger, type Logger } from '../match/log.ts';

export interface LocalRoomServiceOptions {
  matchService: MatchService;
  seatSecret: string;
  /** Exact origins allowed to connect; null allows any (LAN / development). */
  allowedOrigins?: readonly string[] | null;
  /** The `/match` WebSocket URL handed to clients; relative to the room endpoint by default. */
  matchUrl?: string;
  /** Actor world: 'dedicated' loads the map's collision shard (production); 'terrain' for fast receipts. */
  world?: 'dedicated' | 'terrain';
  countdownS?: number;
  battleLimitS?: number;
  guards?: Partial<RoomPolicyGuards>;
  log?: Logger;
  wallClock?: () => number;
  random?: () => number;
}

export interface LocalRoomService {
  readonly rooms: ReadonlyMap<string, RoomActor>;
  readonly matchHost: MatchHost;
  handleRequest(request: http.IncomingMessage, response: http.ServerResponse): boolean;
  handleUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer): boolean;
  /** The actor for a code (created empty on first use, like a Durable Object). */
  room(code: string): RoomActor;
  close(): Promise<void>;
}

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Runs matches inside the given service: the LAN helper and the receipts. */
export function createInProcessMatchHost({
  matchService, matchUrl = '/match', world = 'dedicated', countdownS, battleLimitS, onVerdict,
}: {
  matchService: MatchService;
  matchUrl?: string;
  world?: 'dedicated' | 'terrain';
  countdownS?: number;
  battleLimitS?: number;
  onVerdict?: (roomId: string) => void;
}): MatchHost {
  const matchIds = new Map<string, string>();
  return {
    async start(config: MatchHostStartConfig) {
      const existing = matchService.actors.get(config.roomId);
      if (existing && !existing.stopped && !existing.ended) throw new Error('a match is already running for this room');
      if (existing) matchService.removeActor(config.roomId);
      matchService.createActor({
        roomId: config.roomId, mapId: config.mapId, mode: config.mode, seed: config.seed,
        seats: config.seats.map((seat) => ({ seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, equipment: seat.equipment })),
        bots: config.bots, world, countdownS: config.countdownS ?? countdownS, battleLimitS,
        onVerdict: () => onVerdict?.(config.roomId),
      });
      matchIds.set(config.roomId, config.matchId);
      return { matchUrl };
    },
    async status(roomId: string): Promise<MatchHostStatus | null> {
      const actor = matchService.actors.get(roomId);
      const status = statusOf(roomId, actor, matchIds.get(roomId) ?? null);
      if (!status) return null;
      const phase = status.phase === 'loading' || status.phase === 'countdown' || status.phase === 'playing' || status.phase === 'ended' || status.phase === 'stopped'
        ? status.phase : 'unknown';
      return { roomId, matchId: status.matchId, phase, verdict: status.verdict };
    },
    async stop(roomId: string) {
      matchService.removeActor(roomId);
      matchIds.delete(roomId);
    },
  };
}

function socketText(raw: RawData, isBinary: boolean): string | null {
  const buffer = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
  if (buffer.length > ROOM_MAX_PAYLOAD_BYTES) return null;
  void isBinary;
  return buffer.toString('utf8');
}

export function createLocalRoomService({
  matchService,
  seatSecret,
  allowedOrigins = null,
  matchUrl = '/match',
  world = 'dedicated',
  countdownS,
  battleLimitS,
  guards,
  log = silentLogger,
  wallClock = () => Date.now(),
  random = Math.random,
}: LocalRoomServiceOptions): LocalRoomService {
  if (typeof seatSecret !== 'string' || seatSecret.length < 16) throw new TypeError('seatSecret must be at least 16 characters');
  const origins = allowedOrigins && allowedOrigins.length ? new Set(allowedOrigins.map((origin) => origin.trim())) : null;
  const rooms = new Map<string, RoomActor>();
  const sockets = new Map<string, WebSocket>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let socketSeq = 0;
  let closed = false;
  const roomLog = log.child({ service: 'rooms' });

  const matchHost = createInProcessMatchHost({
    matchService, matchUrl, world, countdownS, battleLimitS,
    // The verdict callback lands on the actor's tick: poll the room right away instead of waiting 10 s.
    onVerdict: (roomId) => { const room = rooms.get(roomId); if (room) queueMicrotask(() => { void room.observeMatchNow(); }); },
  });

  function ports(code: string): RoomActorPorts {
    return {
      now: wallClock,
      random,
      sha256Hex,
      signSeatToken: (claims) => signSeatToken(seatSecret, claims),
      matchHost,
      send(socketId, message: RoomEnvelope) {
        const socket = sockets.get(socketId);
        if (!socket || socket.readyState !== socket.OPEN) return;
        // Binary UTF-8 JSON: the v2 transport carries binary frames only (text is refused).
        try { socket.send(Buffer.from(JSON.stringify(message), 'utf8'), { binary: true }); } catch { /* its close handler detaches */ }
      },
      closeSocket(socketId, reason) {
        const socket = sockets.get(socketId);
        sockets.delete(socketId);
        try { socket?.close(1000, reason); } catch { /* already closed */ }
      },
      schedule(atMs) {
        const pending = timers.get(code);
        if (pending) { clearTimeout(pending); timers.delete(code); }
        if (atMs === null || closed) return;
        const delay = Math.max(0, atMs - wallClock());
        const timer = setTimeout(() => {
          timers.delete(code);
          const actor = rooms.get(code);
          if (actor) void actor.tick().then(() => { if (actor.empty) rooms.delete(code); });
        }, Math.min(delay, 2_147_000_000));
        timer.unref?.();
        timers.set(code, timer);
      },
      persist() { /* in-memory */ },
      guards,
      log: (level, message, fields) => roomLog[level](message, fields as Record<string, string | number | boolean | null | undefined> | undefined),
    };
  }

  function room(code: string): RoomActor {
    let actor = rooms.get(code);
    if (!actor) {
      actor = new RoomActor(code, ports(code));
      rooms.set(code, actor);
    }
    return actor;
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: ROOM_MAX_PAYLOAD_BYTES, perMessageDeflate: false });
  wss.on('connection', (socket: WebSocket, request: http.IncomingMessage) => {
    const route = parseRoomRoute((request.url || '').split('?', 1)[0]!);
    if (!route) { socket.close(1008, 'invalid_room_route'); return; }
    const actor = room(route.code);
    const socketId = `s${++socketSeq}`;
    sockets.set(socketId, socket);
    actor.handleOpen(socketId);
    socket.on('message', (raw: RawData, isBinary: boolean) => {
      const text = socketText(raw, isBinary);
      if (text === null) { socket.close(1009, 'invalid_payload'); return; }
      void actor.handleMessage(socketId, text);
    });
    socket.once('close', () => {
      sockets.delete(socketId);
      actor.handleClose(socketId);
      if (actor.empty) rooms.delete(route.code);
    });
    socket.on('error', () => { /* close follows */ });
  });

  return {
    rooms,
    matchHost,
    room,
    handleRequest(request, response) {
      const path = (request.url || '').split('?', 1)[0]!;
      if (request.method === 'GET' && path === '/rooms/healthz') {
        const body = JSON.stringify({ ok: !closed, service: 'cot-rooms', backend: 'local', rooms: rooms.size });
        response.writeHead(closed ? 503 : 200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' });
        response.end(body);
        return true;
      }
      return false;
    },
    handleUpgrade(request, socket, head) {
      const path = (request.url || '').split('?', 1)[0]!;
      const route = parseRoomRoute(path);
      if (!route || route.match) return false;
      const origin = request.headers.origin;
      if (closed || (origins && (!origin || !origins.has(origin)))) {
        socket.write(closed ? 'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n' : 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return true;
      }
      wss.handleUpgrade(request, socket, head, (websocket) => wss.emit('connection', websocket, request));
      return true;
    },
    async close() {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const socket of sockets.values()) { try { socket.close(1001, 'server_drain'); } catch { /* closed */ } }
      sockets.clear();
      rooms.clear();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
