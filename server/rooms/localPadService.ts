/**
 * LocalPadService: the phone controller's pairing (docs/PHONE-CONTROLLER.md) served in-process by Node — the LAN
 * helper (`npm run server:mp`, mounted beside the rooms by `server/rooms/serve.ts`), the receipts and the pad e2e. It
 * hosts one `PadActor` per code over plain WebSockets (`/pad/new`, `/pad/join/<CODE>`, `/pad/resume/<CODE>`), keeps
 * everything in memory and answers the keepalive frame without the actor, so a client cannot tell it from the rooms
 * Worker's `PadPair` object. It is its own channel: nothing here touches a room or a match.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { PadActor } from '../../src/pad/padActor.ts';
import {
  PAD_CODE_ALPHABET, PAD_CODE_LENGTH, PAD_KEEPALIVE_REQUEST, PAD_KEEPALIVE_RESPONSE, PAD_MAX_MESSAGE_BYTES, parsePadRoute,
} from '../../src/pad/padProtocol.ts';
import type { PadHostMessage, PadIceServer } from '../../src/pad/padProtocol.ts';

interface LocalPadServiceOptions {
  /** Exact origins allowed to connect; null allows any (LAN / development). */
  allowedOrigins?: readonly string[] | null;
  /** ICE servers for a pairing's peer connection (the relay issuer); absent, none (a LAN needs host candidates). */
  iceServers?: () => Promise<{ iceServers: PadIceServer[]; relay: boolean }>;
  /** Upgrades one client address may make a minute (the Worker's PAD_CONNECT_LIMITER). */
  connectLimit?: number;
  /** Most pairings held at once. */
  maxPairs?: number;
  wallClock?: () => number;
  /** Code draws (tests pin them to force a collision). */
  drawCode?: () => string;
}

export interface LocalPadService {
  handleUpgrade(request: http.IncomingMessage, socket: Duplex, head: Buffer): boolean;
  /** Pairings held now (receipts). */
  readonly pairs: number;
  close(): Promise<void>;
}

function defaultCode(): string {
  let code = '';
  for (let i = 0; i < PAD_CODE_LENGTH; i++) code += PAD_CODE_ALPHABET[randomInt(PAD_CODE_ALPHABET.length)];
  return code;
}

export function createLocalPadService({
  allowedOrigins = null,
  iceServers = async () => ({ iceServers: [], relay: false }),
  connectLimit = 30,
  maxPairs = 256,
  wallClock = () => Date.now(),
  drawCode = defaultCode,
}: LocalPadServiceOptions = {}): LocalPadService {
  const origins = allowedOrigins && allowedOrigins.length ? new Set(allowedOrigins.map((origin) => origin.trim())) : null;
  const actors = new Map<string, PadActor>();
  const sockets = new Map<string, WebSocket>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const connects = new Map<string, { start: number; count: number }>();
  let closed = false;
  let nextSocket = 0;

  const actorFor = (code: string): PadActor => {
    let actor = actors.get(code);
    if (actor) return actor;
    actor = new PadActor(code, {
      now: wallClock,
      randomToken: () => randomBytes(16).toString('base64url'),
      sha256Hex: (text) => createHash('sha256').update(text).digest('hex'),
      send: (socketId, message: PadHostMessage) => {
        const ws = sockets.get(socketId);
        if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
      },
      close: (socketId, reason) => {
        const ws = sockets.get(socketId);
        sockets.delete(socketId);
        if (ws) setTimeout(() => { try { ws.close(1000, reason); } catch { /* gone */ } }, 0);
      },
      schedule: (atMs) => {
        clearTimeout(timers.get(code));
        timers.delete(code);
        if (atMs !== null) timers.set(code, setTimeout(() => actors.get(code)?.tick(), Math.max(0, atMs - wallClock())));
      },
      persist: () => {
        // memory is the store: a pairing that holds nothing is forgotten
        const held = actors.get(code);
        if (held && held.vacant && held.liveSockets === 0) actors.delete(code);
      },
      iceServers,
    });
    actors.set(code, actor);
    return actor;
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: PAD_MAX_MESSAGE_BYTES, perMessageDeflate: false });

  const admit = (address: string): boolean => {
    const now = wallClock();
    let window = connects.get(address);
    if (!window || now - window.start >= 60_000) { window = { start: now, count: 0 }; connects.set(address, window); }
    return ++window.count <= connectLimit;
  };

  return {
    get pairs() { return [...actors.values()].filter((actor) => !actor.vacant).length; },
    handleUpgrade(request, socket, head) {
      const url = new URL(request.url ?? '/', 'http://local');
      const route = parsePadRoute(url.pathname);
      if (!route) return false;
      const origin = request.headers.origin;
      const refuse = (status: string) => { socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
      if (closed || url.search || (origins && (!origin || !origins.has(origin)))) { refuse('403 Forbidden'); return true; }
      if (!admit(request.socket.remoteAddress ?? 'local')) { refuse('429 Too Many Requests'); return true; }
      let actor: PadActor;
      if (route.kind === 'new') {
        // a held code is drawn again, as the Worker does
        let code = '';
        for (let attempt = 0; attempt < 3 && !code; attempt++) {
          const candidate = drawCode();
          if (!actors.get(candidate) || actors.get(candidate)!.vacant) code = candidate;
        }
        if (!code || actors.size >= maxPairs) { refuse('503 Service Unavailable'); return true; }
        actor = actorFor(code);
      } else {
        actor = actors.get(route.code) ?? actorFor(route.code);
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        const socketId = `pad-${++nextSocket}`;
        sockets.set(socketId, ws);
        ws.on('message', (raw: RawData, isBinary: boolean) => {
          const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : Buffer.concat(raw as Buffer[]).toString('utf8');
          if (!isBinary && text === PAD_KEEPALIVE_REQUEST) { try { ws.send(PAD_KEEPALIVE_RESPONSE); } catch { /* closing */ } return; }
          if (sockets.get(socketId) !== ws) return;
          actor.handleMessage(socketId, text);
        });
        ws.on('close', () => {
          if (sockets.get(socketId) === ws) sockets.delete(socketId);
          actor.handleClose(socketId);
          if (actor.vacant && actor.liveSockets === 0) actors.delete(actor.code);
        });
        if (route.kind === 'new') actor.openDesktop(socketId);
        else if (route.kind === 'join') actor.openJoin(socketId);
        else actor.openResume(socketId);
        if (actor.vacant && actor.liveSockets === 0) actors.delete(actor.code);
      });
      return true;
    },
    async close() {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const ws of wss.clients) { try { ws.terminate(); } catch { /* gone */ } }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      actors.clear();
    },
  };
}
