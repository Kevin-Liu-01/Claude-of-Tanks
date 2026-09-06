import { DurableObject } from 'cloudflare:workers';
import type { RuntimeValue } from '../../../src/runtimeTypes.ts';
import {
  SignalingRoomStore, type SignalingConnection, type SignalingJoinResult,
  type SignalingMessage, type SignalingNotification,
} from '../../../server/roomStore.ts';
import { signalingResumeAllowed, signalingResumeHash } from '../../../server/signalingMembership.ts';
import {
  ACTIVITY_CHECKPOINT_MS, MAX_PAYLOAD_BYTES, MAX_PENDING_SOCKETS, MAX_SOCKETS,
  RATE_MAX_MESSAGES, RATE_WINDOW_MS, ROOM_IDLE_TTL_MS, UNAUTHENTICATED_TIMEOUT_MS,
  allowedOrigin, failure, parseEnvelope, publicError, record, roomCodeFromUrl,
  validSignal, type SignalEnvelope,
} from './protocol.ts';

interface SocketState {
  version: 1;
  id: string;
  roomCode: string;
  acceptedAt: number;
  lastActivity: number;
  rateStart: number;
  rateCount: number;
  authenticated: boolean;
}

function socketState(value: RuntimeValue): value is SocketState {
  return record(value) && value.version === 1 && typeof value.id === 'string' &&
    /^[a-f0-9-]{36}$/.test(value.id) && typeof value.roomCode === 'string' &&
    /^[A-Z0-9]{6}$/.test(value.roomCode) && Number.isFinite(value.acceptedAt) &&
    Number.isFinite(value.lastActivity) && Number.isFinite(value.rateStart) &&
    Number.isSafeInteger(value.rateCount) && typeof value.authenticated === 'boolean';
}

/** One room owner; hibernation retains sockets, SQLite retains authenticated seats. */
export class PrivateRoom extends DurableObject<Env> {
  #store: SignalingRoomStore;
  #roomCode = '';
  #sessions = new Map<WebSocket, SocketState>();
  #connections = new Map<string, SignalingConnection>();
  #ids = new Map<SignalingConnection, string>();
  #sockets = new Map<SignalingConnection, WebSocket>();
  #nextAlarm: number | null = null;
  #lastCheckpoint = 0;
  #schemaReady = false;
  #storageUsed = false;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.#store = this.#emptyStore();
    this.#ensureSchema();
    for (const ws of this.ctx.getWebSockets()) {
      const attachment: RuntimeValue = ws.deserializeAttachment();
      if (!socketState(attachment) || this.#connections.has(attachment.id)) {
        ws.close(1008, 'invalid_attachment');
        continue;
      }
      this.#register(ws, attachment);
      this.#roomCode = attachment.roomCode;
    }
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM room_state WHERE id=1').toArray()[0];
    if (row) {
      this.#store.restoreState(JSON.parse(row.data), (id) => this.#connections.get(id) ?? null);
      if (this.#store.rooms.size !== 1) throw new Error('Invalid durable room state');
      const room = this.#store.rooms.values().next().value;
      if (!room) throw new Error('Invalid durable room state');
      this.#roomCode = room.roomCode;
      this.#lastCheckpoint = room.touchedAt;
      // Attachments survive hibernation without a SQL write on every poll.
      for (const [ws, attachment] of this.#sessions) {
        const connection = this.#connections.get(attachment.id);
        if (connection && this.#store.membership.has(connection)) {
          attachment.authenticated = true;
          ws.serializeAttachment(attachment);
          room.touchedAt = Math.max(room.touchedAt, attachment.lastActivity);
        } else if (attachment.authenticated) this.#retire(ws, 'resume_denied');
      }
    }
    this.#retireReplaced();
    this.ctx.blockConcurrencyWhile(async () => {
      this.#nextAlarm = await this.ctx.storage.getAlarm();
    });
  }

  #emptyStore(): SignalingRoomStore {
    return new SignalingRoomStore({ roomCodeFactory: () => this.#roomCode, roomTtlMs: ROOM_IDLE_TTL_MS });
  }

  #ensureSchema(): void {
    if (this.#schemaReady) return;
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS room_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    this.#schemaReady = true;
    this.#storageUsed = true;
  }

  #register(ws: WebSocket, attachment: SocketState): SignalingConnection {
    const connection = {};
    this.#sessions.set(ws, attachment);
    this.#connections.set(attachment.id, connection);
    this.#ids.set(connection, attachment.id);
    this.#sockets.set(connection, ws);
    return connection;
  }

  #copyStore(): SignalingRoomStore {
    const next = this.#emptyStore();
    next.restoreState(this.#store.exportState((connection) => {
      const id = this.#ids.get(connection);
      if (!id) throw new Error('Missing connection identity');
      return id;
    }), (id) => this.#connections.get(id) ?? null);
    return next;
  }

  #persist(next: SignalingRoomStore): void {
    this.#ensureSchema();
    if (!next.rooms.size) this.ctx.storage.sql.exec('DELETE FROM room_state WHERE id=1');
    else {
      const snapshot = next.exportState((connection) => {
        const id = this.#ids.get(connection);
        if (!id) throw new Error('Missing connection identity');
        return id;
      });
      this.ctx.storage.sql.exec('INSERT INTO room_state (id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', JSON.stringify(snapshot));
    }
    // SQLite output gates commit the write before any subsequent response/send.
    this.#store = next;
    this.#lastCheckpoint = Date.now();
  }

  #send(ws: WebSocket | undefined, message: RuntimeValue): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(message)); } catch { /* its close handler detaches membership */ }
  }

  #notify(notifications: SignalingNotification[]): void {
    for (const notification of notifications) {
      this.#send(notification.connection ? this.#sockets.get(notification.connection) : undefined,
        notification.message);
    }
  }

  #retire(ws: WebSocket, reason: string): void {
    const attachment = this.#sessions.get(ws);
    if (!attachment) return;
    if (reason === 'resume_denied') {
      this.#send(ws, { type: 'error', payload: { code: 'resume_denied', message: 'Room connection replaced.' } });
    }
    const connection = this.#connections.get(attachment.id);
    this.#sessions.delete(ws);
    this.#connections.delete(attachment.id);
    if (connection) {
      this.#ids.delete(connection);
      this.#sockets.delete(connection);
    }
    try { ws.close(1008, reason); } catch { /* already closed */ }
  }

  #retireReplaced(): void {
    for (const [ws, attachment] of this.#sessions) {
      const connection = this.#connections.get(attachment.id);
      if (attachment.authenticated && (!connection || !this.#store.membership.has(connection))) {
        this.#retire(ws, 'resume_denied');
      }
    }
  }

  async #scheduleAlarm(): Promise<void> {
    let next: number | null = null;
    const room = this.#store.rooms.get(this.#roomCode);
    if (room) next = room.touchedAt + ROOM_IDLE_TTL_MS;
    for (const attachment of this.#sessions.values()) {
      if (!attachment.authenticated) next = Math.min(next ?? Infinity,
        attachment.acceptedAt + UNAUTHENTICATED_TIMEOUT_MS);
    }
    if (next == null) {
      if (this.#nextAlarm != null) await this.ctx.storage.deleteAlarm();
      this.#nextAlarm = null;
      // Deleting the row alone retains billable SQLite metadata. Only an empty
      // room with no pending/live owner may deallocate; storage input gates
      // prevent a replacement admission from interleaving with this deletion.
      if (!this.#store.rooms.size && !this.#sessions.size && this.#storageUsed) {
        await this.ctx.storage.deleteAll();
        this.#schemaReady = false;
        this.#storageUsed = false;
      }
    } else if (this.#nextAlarm == null || next < this.#nextAlarm ||
        next - this.#nextAlarm >= ACTIVITY_CHECKPOINT_MS) {
      this.#storageUsed = true;
      await this.ctx.storage.setAlarm(next);
      this.#nextAlarm = next;
    }
  }

  #expireRoom(): void {
    const room = this.#store.rooms.get(this.#roomCode);
    if (!room || room.touchedAt + ROOM_IDLE_TTL_MS > Date.now()) return;
    const next = this.#copyStore();
    const notifications = next.sweepExpired();
    this.#persist(next);
    this.#notify(notifications);
    this.#retireReplaced();
  }

  async fetch(request: Request): Promise<Response> {
    const code = roomCodeFromUrl(request);
    if (!code || (this.#roomCode && this.#roomCode !== code)) {
      return Response.json({ error: 'invalid_room_route' }, { status: 404 });
    }
    if (!allowedOrigin(request, this.env.ALLOWED_ORIGINS)) {
      return Response.json({ error: 'origin_forbidden' }, { status: 403 });
    }
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return Response.json({ error: 'websocket_required' }, { status: 426 });
    }
    this.#roomCode = code;
    this.#expireRoom();
    let pending = 0;
    for (const attachment of this.#sessions.values()) if (!attachment.authenticated) pending++;
    if (this.ctx.getWebSockets().length >= MAX_SOCKETS || pending >= MAX_PENDING_SOCKETS) {
      return Response.json({ error: 'room_connections_full' }, { status: 429 });
    }
    const pair = new WebSocketPair();
    const ws = pair[1];
    const now = Date.now();
    const attachment: SocketState = { version: 1, id: crypto.randomUUID(), roomCode: code,
      acceptedAt: now, lastActivity: now, rateStart: now, rateCount: 0, authenticated: false };
    this.ctx.acceptWebSocket(ws);
    ws.serializeAttachment(attachment);
    this.#register(ws, attachment);
    await this.#scheduleAlarm();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  #create(next: SignalingRoomStore, connection: SignalingConnection,
    payload: Record<string, RuntimeValue>): { result: SignalingJoinResult; notify: SignalingNotification[] } {
    const room = next.rooms.get(this.#roomCode);
    if (!room) return { result: next.create(connection, payload), notify: [] };
    const host = room.peers.get(room.hostId);
    if (!record(payload.player) || payload.player.id !== room.hostId ||
        payload.sessionId !== host?.sessionId ||
        !signalingResumeAllowed(host?.resumeTokenHash, signalingResumeHash(payload.nextResumeToken))) {
      throw failure('room_code_exhausted');
    }
    // Retrying an uncertain create may rebind only its already-proven host seat.
    next.detach(connection);
    return next.join(connection, { ...payload, roomCode: this.#roomCode,
      resumeToken: payload.nextResumeToken });
  }

  #admit(ws: WebSocket, attachment: SocketState, message: SignalEnvelope): void {
    const connection = this.#connections.get(attachment.id);
    if (!connection) throw failure('resume_denied');
    const payload = message.payload;
    if (payload.roomCode !== this.#roomCode) throw failure('invalid_room_code');
    const next = this.#copyStore();
    let response: SignalingMessage | null = null;
    let notifications: SignalingNotification[] = [];
    if (message.type === 'room_create' || message.type === 'room_join') {
      const joined = message.type === 'room_create' ? this.#create(next, connection, payload)
        : next.join(connection, payload);
      response = { type: message.type === 'room_create' ? 'room_created' : 'room_joined',
        ...(message.requestId ? { requestId: message.requestId } : {}), payload: { ...joined.result } };
      notifications = joined.notify;
    } else if (message.type === 'room_leave') {
      // Unlike the legacy no-op leave, reject an unowned socket explicitly.
      next.poll(connection);
      notifications = next.leave(connection, 'client_leave');
    } else throw failure('unknown_message');
    this.#persist(next);
    attachment.authenticated = next.membership.has(connection);
    attachment.lastActivity = Date.now();
    ws.serializeAttachment(attachment);
    if (response) this.#send(ws, response);
    this.#notify(notifications);
    this.#retireReplaced();
    if (message.type === 'room_leave') this.#retire(ws, 'client_leave');
  }

  #relayOrPoll(ws: WebSocket, attachment: SocketState, message: SignalEnvelope): void {
    const connection = this.#connections.get(attachment.id);
    if (!connection) throw failure('resume_denied');
    if (message.payload.roomCode !== this.#roomCode) throw failure('invalid_room_code');
    let notification: SignalingNotification | null = null;
    if (message.type === 'room_poll') this.#store.poll(connection);
    else notification = this.#store.relay(connection, {
      ...message.payload, signal: validSignal(message.payload.signal),
    });
    attachment.lastActivity = Date.now();
    ws.serializeAttachment(attachment);
    // Room activity is non-critical/coalesced; membership rotations above are not.
    if (Date.now() - this.#lastCheckpoint >= ACTIVITY_CHECKPOINT_MS) this.#persist(this.#copyStore());
    if (notification) this.#notify([notification]);
    else if (message.requestId) this.#send(ws, { type: 'room_polled', requestId: message.requestId,
      payload: { roomCode: this.#roomCode } });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const attachment = this.#sessions.get(ws);
    if (!attachment) {
      this.#send(ws, { type: 'error', payload: { code: 'resume_denied', message: 'Room connection replaced.' } });
      ws.close(1008, 'resume_denied');
      return;
    }
    const now = Date.now();
    if (!attachment.authenticated && now - attachment.acceptedAt >= UNAUTHENTICATED_TIMEOUT_MS) {
      this.#retire(ws, 'authentication_timeout');
      await this.#scheduleAlarm();
      return;
    }
    if (now - attachment.rateStart >= RATE_WINDOW_MS) {
      attachment.rateStart = now;
      attachment.rateCount = 0;
    }
    attachment.rateCount++;
    ws.serializeAttachment(attachment);
    if (attachment.rateCount > RATE_MAX_MESSAGES) {
      await this.#detach(ws, 'rate_limit');
      return;
    }
    if (typeof data !== 'string' || new TextEncoder().encode(data).byteLength > MAX_PAYLOAD_BYTES) {
      await this.#detach(ws, 'invalid_payload');
      return;
    }
    let message: SignalEnvelope | null = null;
    try {
      this.#expireRoom();
      if (!this.#sessions.has(ws)) return;
      message = parseEnvelope(data);
      if (message.type === 'room_poll' || message.type === 'room_signal') {
        this.#relayOrPoll(ws, attachment, message);
      } else this.#admit(ws, attachment, message);
    } catch (error) {
      this.#send(ws, publicError(error, message?.requestId));
    }
    await this.#scheduleAlarm();
  }

  async #detach(ws: WebSocket, reason: string): Promise<void> {
    const attachment = this.#sessions.get(ws);
    const connection = attachment && this.#connections.get(attachment.id);
    if (connection && this.#store.membership.has(connection)) {
      const next = this.#copyStore();
      next.detach(connection);
      this.#persist(next);
    }
    this.#retire(ws, reason);
    await this.#scheduleAlarm();
  }

  async webSocketClose(ws: WebSocket): Promise<void> { await this.#detach(ws, 'connection_closed'); }
  async webSocketError(ws: WebSocket): Promise<void> { await this.#detach(ws, 'connection_closed'); }

  async alarm(): Promise<void> {
    this.#nextAlarm = null;
    for (const [ws, attachment] of this.#sessions) {
      if (!attachment.authenticated && attachment.acceptedAt + UNAUTHENTICATED_TIMEOUT_MS <= Date.now()) {
        this.#retire(ws, 'authentication_timeout');
      }
    }
    this.#expireRoom();
    await this.#scheduleAlarm();
  }
}
