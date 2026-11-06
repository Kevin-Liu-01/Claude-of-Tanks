/**
 * LocalRoomService: the v2 room protocol served in-process by Node — the LAN
 * helper, the receipts and the headless end-to-end runs. It hosts one
 * `RoomActor` per room code over plain WebSockets (`/rooms/<CODE>`), keeps
 * everything in memory, signs seat tokens with the shared secret and runs
 * each match either as a `MatchActor` in the same `MatchService`
 * (`matchTransport: 'service'`, the LAN helper's dedicated authority) or
 * peer-to-peer in the host commander's browser (`matchTransport: 'p2p'`, the
 * same relay, election and migration as the Durable Object — the browser
 * proofs and `tools/mp-rooms-e2e.mjs --p2p`), so a `RoomClient` cannot tell
 * it from the Cloudflare Durable Object.
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
import type { MatchHost, MatchHostStartConfig, MatchHostStatus, RoomActorPorts, ServiceMatchHost } from '../../src/mp/room/roomActor.ts';
import { createP2pMatchHost } from '../../src/mp/room/p2pMatchHost.ts';
import { hostRulesetFor } from '../../src/mp/host/hostRuleset.ts';
import { ROOM_KEEPALIVE_REQUEST, ROOM_KEEPALIVE_RESPONSE, ROOM_MAX_PAYLOAD_BYTES, parseRoomRoute } from '../../src/mp/room/protocol.ts';
import type { RoomEnvelope } from '../../src/mp/room/protocol.ts';
import type { RoomPolicyGuards } from '../../src/mp/room/roomPolicy.ts';
import { signSeatToken } from '../match/seatToken.ts';
import { statusOf } from '../match/control.ts';
import { matchConcluded } from '../match/matchActor.ts';
import type { MatchService } from '../match/service.ts';
import { silentLogger, type Logger } from '../match/log.ts';

interface LocalRoomServiceOptions {
  matchService: MatchService;
  seatSecret: string;
  /** Exact origins allowed to connect; null allows any (LAN / development). */
  allowedOrigins?: readonly string[] | null;
  /** The `/match` WebSocket URL handed to clients; relative to the room endpoint by default. */
  matchUrl?: string;
  /** Actor world: 'dedicated' loads the map's collision shard (production); 'terrain' for fast receipts. */
  world?: 'dedicated' | 'terrain';
  /** Where matches run: in this process (`service`, default — the LAN helper's authority) or in the host's browser (`p2p`). */
  matchTransport?: 'service' | 'p2p';
  countdownS?: number;
  battleLimitS?: number;
  guards?: Partial<RoomPolicyGuards>;
  log?: Logger;
  wallClock?: () => number;
  random?: () => number;
  /** Named in admission replies; the LAN helper and the receipts run on `lan`. */
  region?: string;
  /**
   * Relay credentials for a seat's `room_relay` (2026-10-02, docs/MULTIPLAYER-V2.md §13.14): the LAN helper mints them
   * from its environment (`server/relayCredentials.ts`, `server/rooms/main.ts`); absent, a seat gets no server.
   */
  relayCredentials?: RoomActorPorts['relayCredentials'];
  /**
   * Most rooms held at once (security audit 2026-10-22): an abandoned room lives until its 24 h idle expiry, so past this
   * an upgrade for a new code is refused 503; a code already held still connects.
   */
  maxRooms?: number;
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
}): ServiceMatchHost {
  const matchIds = new Map<string, string>();
  return {
    transport: 'service',
    async start(config: MatchHostStartConfig) {
      const existing = matchService.matchStatusSource(config.roomId);
      if (existing && !matchConcluded(existing.phase)) throw new Error('a match is already running for this room');
      if (existing) matchService.removeActor(config.roomId);
      matchService.createActor({
        roomId: config.roomId, mapId: config.mapId, mode: config.mode, seed: config.seed,
        seats: config.seats.map((seat) => ({ seat: seat.seat, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId, equipment: seat.equipment, consumables: seat.consumables, camo: seat.camo })),
        bots: config.bots, world, countdownS: config.countdownS ?? countdownS, battleLimitS,
        ruleset: hostRulesetFor(config.mode, config.arrangement, config.campaignOperationId),
        onVerdict: () => onVerdict?.(config.roomId),
      });
      matchIds.set(config.roomId, config.matchId);
      return { matchUrl };
    },
    async status(roomId: string): Promise<MatchHostStatus | null> {
      // the actor's one status phase (matchActor.ts matchStatusPhase): the rooms' vocabulary, nothing left to map; an
      // actor that stopped itself is read from the final reading the service keeps (control.ts MatchStatusSource)
      const status = statusOf(roomId, matchService.matchStatusSource(roomId), matchIds.get(roomId) ?? null);
      if (!status) return null;
      return { roomId, matchId: status.matchId, phase: status.phase, verdict: status.verdict };
    },
    async stop(roomId: string) {
      matchService.removeActor(roomId);
      matchIds.delete(roomId);
    },
  };
}

/** How long a drain waits for graceful close handshakes before terminating what is left. */
const ROOM_DRAIN_GRACE_MS = 1000;

/** Resolve once every client socket of `wss` is closed, terminating the ones still open after `graceMs`. */
async function terminateAfterGrace(wss: WebSocketServer, graceMs: number): Promise<void> {
  const deadline = Date.now() + graceMs;
  while (wss.clients.size > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
  for (const socket of wss.clients) { try { socket.terminate(); } catch { /* already gone */ } }
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
  matchTransport = 'service',
  countdownS,
  battleLimitS,
  guards,
  log = silentLogger,
  wallClock = () => Date.now(),
  random = Math.random,
  region = 'lan',
  relayCredentials,
  maxRooms = 256,
}: LocalRoomServiceOptions): LocalRoomService {
  if (typeof seatSecret !== 'string' || seatSecret.length < 16) throw new TypeError('seatSecret must be at least 16 characters');
  if (!Number.isInteger(maxRooms) || maxRooms < 1 || maxRooms > 4096) throw new TypeError('maxRooms must be 1..4096');
  const origins = allowedOrigins && allowedOrigins.length ? new Set(allowedOrigins.map((origin) => origin.trim())) : null;
  const rooms = new Map<string, RoomActor>();
  const sockets = new Map<string, WebSocket>();
  // (audit S1, 2026-11-02) a room's timer, its event queue and its removal are the actor's own, never its code's: a
  // room deleted while its async work was pending (a relay mint, the match host's start) could clear the next room's
  // timer under the same code when that work rescheduled, an old timer ticked whichever room held the code, and an old
  // socket's close deleted it.
  const timers = new Map<RoomActor, ReturnType<typeof setTimeout>>();
  /** Each room's events run one at a time in arrival order, as the Durable Object's input gate runs them (audit S1). */
  const queues = new Map<RoomActor, Promise<void>>();
  /** How many of each room's events are queued or running, the running one included (round 2 U3: forgetIfEmpty). */
  const queued = new Map<RoomActor, number>();
  /** P1b: the wall clock of each socket's newest keepalive frame, answered here without the actor (the Worker's auto-response). */
  const keepalives = new Map<string, number>();
  let socketSeq = 0;
  let closed = false;
  const roomLog = log.child({ service: 'rooms' });

  const serviceHost = matchTransport === 'service' ? createInProcessMatchHost({
    matchService, matchUrl, world, countdownS, battleLimitS,
    // The verdict callback lands on the actor's tick: poll the room right away instead of waiting for its next match poll
    // (ROOM_MATCH_POLL_MS, 30 s), as one more of the room's events (review round 2: the poll is a room tick, and it ran in
    // the middle of whatever event the queue awaited)
    onVerdict: (roomId) => {
      const room = rooms.get(roomId);
      if (room) void serialize(room, async () => { await room.observeMatchNow(); forgetIfEmpty(roomId, room); });
    },
  }) : null;
  // A p2p host is bound to one room (the actor binds it), so every room gets its own (audit S1: the first one was
  // handed again to any room created while the map was empty, and rebinding it moved the first room's view away).
  const matchHostFor = (): MatchHost => serviceHost ?? createP2pMatchHost();
  /** The service's match host; with p2p, an unbound one (every room makes its own). */
  const matchHost = matchHostFor();

  /** Run one event of `actor` after the ones before it; a failure is logged and the queue goes on. */
  function serialize(actor: RoomActor, work: () => void | Promise<void>): Promise<void> {
    queued.set(actor, (queued.get(actor) ?? 0) + 1);
    const next = (queues.get(actor) ?? Promise.resolve()).then(work).catch((error: unknown) => {
      roomLog.warn('room event failed', { room: actor.roomCode, error: error instanceof Error ? error.message : String(error) });
    }).finally(() => {
      const left = (queued.get(actor) ?? 1) - 1;
      if (left > 0) queued.set(actor, left); else queued.delete(actor);
    });
    queues.set(actor, next);
    void next.then(() => { if (queues.get(actor) === next) queues.delete(actor); });
    return next;
  }

  /**
   * Forget a room that holds nothing, only while its code still names it and no later event of it waits; its timer goes
   * with it. It runs at the end of one of the room's own events (a close, a tick, the verdict's poll), so that event is
   * the one `queued` entry it may see. A later event leaves the room under its code (round 2 U3: a socket that opened
   * while the last close waited in the queue joined this actor, and the close forgot it before the open ran); each later
   * event is itself followed by a check, because a queued open or message has its socket's close behind it and a tick
   * or poll ends with one.
   */
  function forgetIfEmpty(code: string, actor: RoomActor): void {
    if (!actor.empty || rooms.get(code) !== actor || (queued.get(actor) ?? 0) > 1) return;
    rooms.delete(code);
    const timer = timers.get(actor);
    if (timer) { clearTimeout(timer); timers.delete(actor); }
  }

  function ports(code: string, host: MatchHost, self: () => RoomActor | null): RoomActorPorts {
    return {
      now: wallClock,
      random,
      sha256Hex,
      seatSecret,
      signSeatToken,
      matchHost: host,
      region,
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
        const actor = self();
        if (!actor) return;
        const pending = timers.get(actor);
        if (pending) { clearTimeout(pending); timers.delete(actor); }
        // a room no longer under its code (deleted while this work was pending) arms nothing
        if (atMs === null || closed || rooms.get(code) !== actor) return;
        const delay = Math.max(0, atMs - wallClock());
        const timer = setTimeout(() => {
          if (timers.get(actor) === timer) timers.delete(actor);
          if (rooms.get(code) !== actor) return;
          void serialize(actor, async () => { await actor.tick(); forgetIfEmpty(code, actor); });
        }, Math.min(delay, 2_147_000_000));
        timer.unref?.();
        timers.set(actor, timer);
      },
      persist() { /* in-memory */ },
      // P1b: what the Worker reads from the runtime (getWebSocketAutoResponseTimestamp), this service records itself.
      keepaliveAt: (socketId) => keepalives.get(socketId) ?? null,
      defer: (callback, delayMs) => { if (!closed) setTimeout(callback, delayMs).unref?.(); },
      ...(relayCredentials ? { relayCredentials } : {}),
      guards,
      log: (level, message, fields) => roomLog[level](message, fields as Record<string, string | number | boolean | null | undefined> | undefined),
    };
  }

  function room(code: string): RoomActor {
    let actor = rooms.get(code);
    if (!actor) {
      let created: RoomActor | null = null;
      created = new RoomActor(code, ports(code, matchHostFor(), () => created));
      actor = created;
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
    void serialize(actor, () => actor.handleOpen(socketId));
    socket.on('message', (raw: RawData, isBinary: boolean) => {
      const text = socketText(raw, isBinary);
      if (text === null) { socket.close(1009, 'invalid_payload'); return; }
      // P1b: the keepalive is one exact text frame, answered here without the actor — what the Durable Object's
      // hibernation auto-response does; the actor learns of it only through `keepaliveAt` (the idle expiry).
      if (!isBinary && text === ROOM_KEEPALIVE_REQUEST) {
        keepalives.set(socketId, wallClock());
        try { socket.send(ROOM_KEEPALIVE_RESPONSE); } catch { /* closing */ }
        return;
      }
      void serialize(actor, () => actor.handleMessage(socketId, text));
    });
    socket.once('close', () => {
      sockets.delete(socketId);
      keepalives.delete(socketId);
      void serialize(actor, () => { actor.handleClose(socketId); forgetIfEmpty(route.code, actor); });
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
      const full = !rooms.has(route.code) && rooms.size >= maxRooms;
      if (closed || full || (origins && (!origin || !origins.has(origin)))) {
        socket.write(closed || full ? 'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n' : 'HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
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
      queues.clear();
      queued.clear();
      // `wss.close` resolves only once every client socket is gone; a peer that never answers the close
      // handshake would hold the drain for ws's own 30 s timer (or a dead process for good), so the
      // sockets still open after a short grace are terminated.
      await terminateAfterGrace(wss, ROOM_DRAIN_GRACE_MS);
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}
