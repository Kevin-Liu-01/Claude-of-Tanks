/**
 * A room service inside the page (RUST-ENGINE-DECISION §7 step 5: a solo battle on a local host). The same RoomActor the
 * Durable Object and the LAN helper run (server/rooms/localRoomService.ts), reached by the page's RoomClient through a
 * socket factory (WebSocketTransportOptions.createSocket) instead of a network: one actor per room code, its matches
 * peer-to-peer, so the room names this page host and the browser host's Worker runs the authority. Its hashes and seat
 * tokens are syncCrypto.ts's (the actor's ports are synchronous). Frames cross on a microtask, never inside the sender's
 * call, so the room and the client never re-enter each other.
 */
import type { SocketEvent, SocketFactory, SocketLike } from '../transport/webSocketTransport.ts';
import type { RoomEnvelope } from './protocol.ts';
import { ROOM_KEEPALIVE_REQUEST, ROOM_KEEPALIVE_RESPONSE, parseRoomRoute } from './protocol.ts';
import { RoomActor } from './roomActor.ts';
import type { RoomActorPorts } from './roomActor.ts';
import { createP2pMatchHost } from './p2pMatchHost.ts';
import { sha256HexSync, signSeatTokenSync } from './syncCrypto.ts';

/** The endpoint a RoomClient names for the in-page service (any `ws://` URL; nothing connects to it). */
export const IN_PAGE_ROOM_ENDPOINT = 'ws://in-page.room';

const CONNECTING = 0, OPEN = 1, CLOSED = 3;

interface InPageRoomServiceOptions {
  now?: () => number;
  /** [0, 1): match seeds and ids (the page's crypto when it has one). */
  random?: () => number;
  log?: RoomActorPorts['log'];
}

export interface InPageRoomService {
  /** The RoomClient's socket factory: a socket on `<endpoint>/rooms/<CODE>` opens on that room's actor. */
  readonly createSocket: SocketFactory;
  readonly rooms: ReadonlyMap<string, RoomActor>;
  close(): void;
}

function cryptoRandom(): number {
  const crypto = (globalThis as { crypto?: { getRandomValues?(array: Uint32Array): Uint32Array } }).crypto;
  if (!crypto?.getRandomValues) return Math.random();
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

export function createInPageRoomService({ now = () => Date.now(), random = cryptoRandom, log }: InPageRoomServiceOptions = {}): InPageRoomService {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const rooms = new Map<string, RoomActor>();
  const sockets = new Map<string, InPageSocket>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const keepalives = new Map<string, number>();
  let socketSeq = 0;
  let closed = false;
  // the room's seat secret: this page's alone (the host's per-match secret derives from it)
  let seatSecret = '';
  for (let index = 0; index < 4; index++) seatSecret += Math.floor(cryptoRandom() * 0x100000000).toString(16).padStart(8, '0');

  function ports(code: string): RoomActorPorts {
    return {
      now,
      random,
      sha256Hex: sha256HexSync,
      seatSecret,
      signSeatToken: signSeatTokenSync,
      matchHost: createP2pMatchHost(),
      send(socketId, message: RoomEnvelope) { sockets.get(socketId)?.deliver(encoder.encode(JSON.stringify(message))); },
      closeSocket(socketId, reason) { sockets.get(socketId)?.closeFromRoom(1000, reason); },
      schedule(atMs) {
        const pending = timers.get(code);
        if (pending) { clearTimeout(pending); timers.delete(code); }
        if (atMs === null || closed) return;
        timers.set(code, setTimeout(() => {
          timers.delete(code);
          const actor = rooms.get(code);
          if (actor) void actor.tick().then(() => { if (actor.empty) rooms.delete(code); });
        }, Math.min(Math.max(0, atMs - now()), 2_147_000_000)));
      },
      persist() { /* in memory: the room ends with the page */ },
      keepaliveAt: (socketId) => keepalives.get(socketId) ?? null,
      defer: (callback, delayMs) => { if (!closed) setTimeout(callback, delayMs); },
      ...(log ? { log } : {}),
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

  class InPageSocket implements SocketLike {
    readyState = CONNECTING;
    binaryType = 'arraybuffer';
    bufferedAmount = 0;
    private readonly listeners = new Map<string, Set<(event: SocketEvent) => void>>();
    private readonly id = `in-page-${++socketSeq}`;
    private readonly actor: RoomActor | null;

    constructor(url: string) {
      const route = parseRoomRoute(new URL(url).pathname);
      this.actor = route && !route.match && !closed ? room(route.code) : null;
      queueMicrotask(() => {
        if (this.readyState !== CONNECTING) return;
        if (!this.actor) { this.finish(1008, 'invalid_room_route'); return; }
        this.readyState = OPEN;
        sockets.set(this.id, this);
        this.actor.handleOpen(this.id);
        this.emit('open', {});
      });
    }

    send(data: Uint8Array | string): void {
      if (this.readyState !== OPEN || !this.actor) return;
      // the keepalive is answered here, as the Durable Object's auto-response does; the actor reads its time
      if (typeof data === 'string') {
        if (data !== ROOM_KEEPALIVE_REQUEST) return;
        keepalives.set(this.id, now());
        queueMicrotask(() => { if (this.readyState === OPEN) this.emit('message', { data: ROOM_KEEPALIVE_RESPONSE }); });
        return;
      }
      const text = decoder.decode(data);
      const actor = this.actor;
      queueMicrotask(() => { if (this.readyState === OPEN) void actor.handleMessage(this.id, text); });
    }

    close(code = 1000, reason = ''): void {
      if (this.readyState === CLOSED) return;
      this.finish(code, reason);
      queueMicrotask(() => this.detach());
    }

    /** The room's frame to this socket. */
    deliver(bytes: Uint8Array): void {
      const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      queueMicrotask(() => { if (this.readyState === OPEN) this.emit('message', { data }); });
    }

    /** The room closed this socket: it hears the close as from any socket (localRoomService's close event). */
    closeFromRoom(code: number, reason: string): void {
      this.finish(code, reason);
      queueMicrotask(() => this.detach());
    }

    addEventListener(type: string, listener: (event: SocketEvent) => void): void {
      let set = this.listeners.get(type);
      if (!set) { set = new Set(); this.listeners.set(type, set); }
      set.add(listener);
    }

    removeEventListener(type: string, listener: (event: SocketEvent) => void): void { this.listeners.get(type)?.delete(listener); }

    private detach(): void {
      if (!sockets.delete(this.id)) return;
      keepalives.delete(this.id);
      this.actor?.handleClose(this.id);
      if (this.actor?.empty) for (const [code, actor] of rooms) if (actor === this.actor) rooms.delete(code);
    }

    private finish(code: number, reason: string): void {
      if (this.readyState === CLOSED) return;
      this.readyState = CLOSED;
      queueMicrotask(() => this.emit('close', { code, reason }));
    }

    private emit(type: string, event: SocketEvent): void {
      for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    }
  }

  return {
    createSocket: (url) => new InPageSocket(url),
    rooms,
    close() {
      closed = true;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const socket of [...sockets.values()]) socket.closeFromRoom(1001, 'server_drain');
      rooms.clear();
    },
  };
}
