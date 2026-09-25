/**
 * Room: one Durable Object per six-character room code. It hosts the shared
 * `RoomActor` (src/mp/room/roomActor.ts) behind hibernatable WebSockets, the
 * SQLite-backed state blob, socket attachments and alarms — the patterns the
 * v1 `PrivateRoom` object proves in production — and a match host that starts
 * the room's container (or a shim in local development).
 *
 * Every room message is one text or binary UTF-8 JSON frame; replies go out
 * as binary so the v2 transport carries them. Resume capabilities are never
 * stored raw (the actor keeps SHA-256 hashes), SDP never travels (v2 has no
 * peer connections), and the room outlives every departure: only the 24 h
 * idle expiry closes it, after which the object deallocates its storage.
 */
import { DurableObject } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { signSeatToken } from '../../../server/match/seatToken.ts';
import { RoomActor } from '../../../src/mp/room/roomActor.ts';
import type { RoomActorState, RoomSocketRecord } from '../../../src/mp/room/roomActor.ts';
import { parseRoomRoute } from '../../../src/mp/room/protocol.ts';
import type { RoomEnvelope } from '../../../src/mp/room/protocol.ts';
import { createMatchHost } from './matchHost.ts';
import { MAX_PENDING_SOCKETS, MAX_SOCKETS, allowedOrigin, frameText, isWebSocketUpgrade, json } from './util.ts';

interface SocketAttachment extends RoomSocketRecord {
  version: 2;
  roomCode: string;
}

function isAttachment(value: unknown): value is SocketAttachment {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.version === 2 && typeof record.id === 'string' && typeof record.roomCode === 'string' &&
    (record.playerId === null || typeof record.playerId === 'string') &&
    Number.isFinite(record.acceptedAt) && Number.isFinite(record.lastActivity) &&
    Number.isFinite(record.rateStart) && Number.isSafeInteger(record.rateCount);
}

export class Room extends DurableObject<Env> {
  #actor: RoomActor | null = null;
  #roomCode = '';
  #sockets = new Map<string, WebSocket>();
  #ids = new Map<WebSocket, string>();
  #nextAlarm: number | null = null;
  #schemaReady = false;
  #storageUsed = false;
  #alarmWanted: number | null | undefined = undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#ensureSchema();
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM room_state WHERE id=1').toArray()[0];
    const sockets = this.ctx.getWebSockets();
    let state: RoomActorState | null = null;
    if (row) {
      try { state = JSON.parse(row.data) as RoomActorState; } catch { state = null; }
    }
    const code = state?.roomCode ?? (sockets.length ? (sockets[0]!.deserializeAttachment() as SocketAttachment | null)?.roomCode : '') ?? '';
    if (code) this.#activate(code);
    if (state && this.#actor) this.#actor.restore(state);
    for (const ws of sockets) {
      const attachment: unknown = ws.deserializeAttachment();
      if (!isAttachment(attachment) || !this.#actor || attachment.roomCode !== this.#roomCode) {
        ws.close(1008, 'invalid_attachment');
        continue;
      }
      this.#sockets.set(attachment.id, ws);
      this.#ids.set(ws, attachment.id);
      this.#actor.attachSocket(attachment);
    }
    this.ctx.blockConcurrencyWhile(async () => {
      this.#nextAlarm = await this.ctx.storage.getAlarm();
      // Deadlines come from saved state, never from the time this object woke.
      this.#actor?.settleAfterRestore();
      await this.#applyAlarm();
    });
  }

  #ensureSchema(): void {
    if (this.#schemaReady) return;
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    this.#schemaReady = true;
    this.#storageUsed = true;
  }

  #activate(code: string): RoomActor {
    if (this.#actor && this.#roomCode === code) return this.#actor;
    this.#roomCode = code;
    this.#actor = new RoomActor(code, {
      now: () => Date.now(),
      random: () => Math.random(),
      sha256Hex: (text) => createHash('sha256').update(text).digest('hex'),
      signSeatToken: (claims) => signSeatToken(this.env.MATCH_SEAT_SECRET, claims),
      matchHost: createMatchHost(this.env, code),
      send: (socketId, message) => this.#send(socketId, message),
      closeSocket: (socketId, reason) => this.#close(socketId, reason),
      schedule: (atMs) => { this.#alarmWanted = atMs; },
      persist: () => this.#persist(),
      log: (level, message, fields) => console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](message, fields),
    });
    return this.#actor;
  }

  #send(socketId: string, message: RoomEnvelope): void {
    const ws = this.#sockets.get(socketId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(new TextEncoder().encode(JSON.stringify(message))); } catch { /* its close handler detaches */ }
  }

  #close(socketId: string, reason: string): void {
    const ws = this.#sockets.get(socketId);
    this.#sockets.delete(socketId);
    if (ws) {
      this.#ids.delete(ws);
      try { ws.close(1000, reason); } catch { /* already closed */ }
    }
  }

  /** The actor's whole durable state as one row; an empty room with no sockets deallocates. */
  #persist(): void {
    this.#ensureSchema();
    const actor = this.#actor;
    if (!actor || (actor.snapshot === null)) {
      this.ctx.storage.sql.exec('DELETE FROM room_state WHERE id=1');
      return;
    }
    this.ctx.storage.sql.exec(
      'INSERT INTO room_state (id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      JSON.stringify(actor.exportState()),
    );
  }

  #attach(ws: WebSocket, socketId: string): void {
    const record = this.#actor?.socketRecord(socketId);
    if (!record) return;
    const attachment: SocketAttachment = { version: 2, roomCode: this.#roomCode, ...record };
    ws.serializeAttachment(attachment);
  }

  async #applyAlarm(): Promise<void> {
    const wanted = this.#alarmWanted === undefined ? (this.#actor?.nextDeadline() ?? null) : this.#alarmWanted;
    this.#alarmWanted = undefined;
    if (wanted === null) {
      if (this.#nextAlarm !== null) await this.ctx.storage.deleteAlarm();
      this.#nextAlarm = null;
      // Only an empty room with no live socket may deallocate; storage input gates serialize this with admissions.
      if (this.#actor?.empty && this.#storageUsed) {
        await this.ctx.storage.deleteAll();
        this.#schemaReady = false;
        this.#storageUsed = false;
      }
      return;
    }
    if (this.#nextAlarm === null || Math.abs(wanted - this.#nextAlarm) > 500) {
      this.#storageUsed = true;
      await this.ctx.storage.setAlarm(wanted);
      this.#nextAlarm = wanted;
    }
  }

  async fetch(request: Request): Promise<Response> {
    const route = parseRoomRoute(new URL(request.url).pathname);
    if (!route || route.match || (this.#roomCode && this.#roomCode !== route.code)) return json({ error: 'invalid_room_route' }, 404);
    if (!allowedOrigin(request, this.env.ALLOWED_ORIGINS)) return json({ error: 'origin_forbidden' }, 403);
    if (!isWebSocketUpgrade(request)) return json({ error: 'websocket_required' }, 426);
    const actor = this.#activate(route.code);
    let pending = 0;
    for (const socketId of this.#sockets.keys()) if (!actor.socketRecord(socketId)?.playerId) pending++;
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS || pending >= MAX_PENDING_SOCKETS) return json({ error: 'room_connections_full' }, 429);
    const pair = new WebSocketPair();
    const ws = pair[1];
    const socketId = crypto.randomUUID();
    this.ctx.acceptWebSocket(ws);
    this.#sockets.set(socketId, ws);
    this.#ids.set(ws, socketId);
    actor.handleOpen(socketId);
    this.#attach(ws, socketId);
    await this.#applyAlarm();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const socketId = this.#ids.get(ws);
    const actor = this.#actor;
    if (!socketId || !actor) {
      ws.close(1008, 'resume_denied');
      return;
    }
    const text = frameText(data);
    if (text === null) {
      this.#close(socketId, 'invalid_payload');
      actor.handleClose(socketId);
      await this.#applyAlarm();
      return;
    }
    await actor.handleMessage(socketId, text);
    if (this.#sockets.has(socketId)) this.#attach(ws, socketId);
    await this.#applyAlarm();
  }

  async webSocketClose(ws: WebSocket, code = 1000, reason = ''): Promise<void> {
    const socketId = this.#ids.get(ws);
    if (socketId) {
      this.#sockets.delete(socketId);
      this.#ids.delete(ws);
      this.#actor?.handleClose(socketId);
    }
    // Complete the client's close handshake (the hibernation API leaves it to the object): without the
    // echo a `ws` client waited 10 s for an abnormal 1006 on every room leave (measured 2026-09-25).
    try { ws.close(code, reason); } catch { /* already closed, or a code the runtime refuses to echo */ }
    await this.#applyAlarm();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    this.#nextAlarm = null;
    if (this.#actor) await this.#actor.tick();
    await this.#applyAlarm();
  }
}
