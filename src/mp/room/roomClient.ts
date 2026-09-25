/**
 * RoomClient: the browser (and headless) side of the v2 room protocol. One
 * WebSocket to the room host (`<endpoint>/rooms/<CODE>`) carried by the v2
 * transport (binary UTF-8 JSON frames, reconnect with the transport's backoff
 * inside its 60 s window), a private resume capability per endpoint / room /
 * player kept in a storage the caller supplies (localStorage in the browser),
 * request/response commands, chat, readiness, settings, admin actions, and
 * typed events for the UI and the session owner. Node-runnable: no DOM.
 */
import { WebSocketTransport } from '../transport/webSocketTransport.ts';
import type { WebSocketTransportOptions } from '../transport/webSocketTransport.ts';
import { Listeners } from '../transport/transport.ts';
import type { Transport, TransportStateChange, Unsubscribe } from '../transport/transport.ts';
import {
  ROOM_CLIENT_MESSAGE, ROOM_MAX_PAYLOAD_BYTES, ROOM_RESUME_TOKEN_RE, ROOM_SERVER_MESSAGE, RoomError, isRecord,
  isRoomChatEntry, isRoomErrorCode, isRoomMatchStartPayload, isRoomMatchStatusPayload, normalizeRoomCode, parseRoomEnvelope,
  randomRoomCode, readRoomSnapshot, roomSocketPath,
} from './protocol.ts';
import type {
  RoomChatEntry, RoomCreateSettings, RoomEnvelope, RoomMatchStartPayload, RoomMatchStatusPayload, RoomMode, RoomPlayer,
  RoomSelection, RoomSnapshot, RoomTeam,
} from './protocol.ts';

export type RoomClientPhase = 'idle' | 'connecting' | 'joined' | 'reconnecting' | 'closed';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface RoomClientOptions {
  /** The room endpoint origin, e.g. `wss://cot-rooms.example.workers.dev` or `ws://192.168.1.20:8792`. */
  endpoint: string;
  player: { id: string; name: string };
  storage?: StorageLike | null;
  createTransport?: (options: WebSocketTransportOptions) => Transport;
  clock?: () => number;
  /** 32 random bytes as hex (crypto.getRandomValues / randomBytes). */
  randomHex?: () => string;
  random?: () => number;
  clientBuild?: string;
  requestTimeoutMs?: number;
  /** Keepalive pings (0 disables). */
  pingIntervalMs?: number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  /** Extra transport options (receipts inject timers, sockets and randomness). */
  transport?: Partial<Omit<WebSocketTransportOptions, 'url' | 'resumeToken'>>;
}

export interface RoomCreateRequest {
  mode: RoomMode;
  roomCode?: string | null;
  selection?: Partial<RoomSelection> | null;
  settings?: RoomCreateSettings | null;
}

export interface RoomJoinRequest {
  roomCode: string;
  selection?: Partial<RoomSelection> | null;
  team?: RoomTeam | null;
}

interface PendingRequest {
  resolve(payload: Record<string, unknown>): void;
  reject(error: Error): void;
  timer: unknown;
}

const RESUME_KEY_PREFIX = 'cot.mp.room.v2';
const CREATE_ATTEMPTS = 5;

function defaultRandomHex(): string {
  const bytes = new Uint8Array(32);
  const cryptoApi = (globalThis as { crypto?: { getRandomValues?: (array: Uint8Array) => Uint8Array } }).crypto;
  if (cryptoApi?.getRandomValues) cryptoApi.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}

function endpointHost(endpoint: string): string {
  try { return new URL(endpoint).host; } catch { return endpoint.replace(/^[a-z]+:\/\//i, '').split('/', 1)[0] ?? endpoint; }
}

/** `/rooms/CODE/match` relative to the endpoint origin, absolute URLs untouched. */
export function resolveRoomRelativeUrl(endpoint: string, url: string): string {
  if (/^wss?:\/\//i.test(url)) return url;
  const base = endpoint.replace(/\/+$/, '');
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}

export class RoomClient {
  readonly endpoint: string;
  readonly playerId: string;
  readonly playerName: string;
  private readonly storage: StorageLike | null;
  private readonly createTransport: (options: WebSocketTransportOptions) => Transport;
  private readonly clock: () => number;
  private readonly randomHex: () => string;
  private readonly random: () => number;
  private readonly clientBuild: string;
  private readonly requestTimeoutMs: number;
  private readonly pingIntervalMs: number;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private readonly transportOptions: Partial<Omit<WebSocketTransportOptions, 'url' | 'resumeToken'>>;
  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private readonly stateListeners = new Listeners<RoomSnapshot>();
  private readonly chatListeners = new Listeners<RoomChatEntry>();
  private readonly matchStartListeners = new Listeners<RoomMatchStartPayload>();
  private readonly matchStatusListeners = new Listeners<RoomMatchStatusPayload>();
  private readonly phaseListeners = new Listeners<{ phase: RoomClientPhase; detail: string }>();
  private readonly closedListeners = new Listeners<{ reason: string }>();
  private readonly pending = new Map<string, PendingRequest>();
  private transport: Transport | null = null;
  private unsubscribeTransport: Unsubscribe[] = [];
  private currentPhase: RoomClientPhase = 'idle';
  private roomCode = '';
  private roomSnapshot: RoomSnapshot | null = null;
  private history: RoomChatEntry[] = [];
  private lastMatchStart: RoomMatchStartPayload | null = null;
  private admission: { kind: 'create' | 'join'; payload: Record<string, unknown> } | null = null;
  private requestSeq = 0;
  private pingTimer: unknown = null;
  private disposed = false;
  private closedReason: string | null = null;

  constructor({
    endpoint,
    player,
    storage = null,
    createTransport = (options) => new WebSocketTransport(options),
    clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
    randomHex = defaultRandomHex,
    random = Math.random,
    clientBuild = 'dev',
    requestTimeoutMs = 10_000,
    pingIntervalMs = 15_000,
    setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    transport = {},
  }: RoomClientOptions) {
    if (typeof endpoint !== 'string' || !/^wss?:\/\//i.test(endpoint)) throw new TypeError('room endpoint must be a ws:// or wss:// origin');
    if (!player || typeof player.id !== 'string' || !player.id) throw new TypeError('room player id is required');
    this.endpoint = endpoint.replace(/\/+$/, '');
    this.playerId = player.id;
    this.playerName = String(player.name ?? '').trim() || player.id;
    this.storage = storage;
    this.createTransport = createTransport;
    this.clock = clock;
    this.randomHex = randomHex;
    this.random = random;
    this.clientBuild = clientBuild;
    this.requestTimeoutMs = requestTimeoutMs;
    this.pingIntervalMs = pingIntervalMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.transportOptions = transport;
  }

  // ------------------------------------------------------------ observation

  get phase(): RoomClientPhase { return this.currentPhase; }
  get room(): RoomSnapshot | null { return this.roomSnapshot; }
  get code(): string { return this.roomCode; }
  get me(): RoomPlayer | null { return this.roomSnapshot?.players.find((player) => player.id === this.playerId) ?? null; }
  get isAdmin(): boolean { return this.roomSnapshot?.adminId === this.playerId; }
  get chatHistory(): readonly RoomChatEntry[] { return this.history; }
  /** The newest `match_start` this seat received (re-sent by the host after a resume). */
  get matchStart(): RoomMatchStartPayload | null { return this.lastMatchStart; }
  get lastClosedReason(): string | null { return this.closedReason; }

  onState(listener: (room: RoomSnapshot) => void): Unsubscribe { return this.stateListeners.add(listener); }
  onChat(listener: (entry: RoomChatEntry) => void): Unsubscribe { return this.chatListeners.add(listener); }
  onMatchStart(listener: (payload: RoomMatchStartPayload) => void): Unsubscribe { return this.matchStartListeners.add(listener); }
  onMatchStatus(listener: (payload: RoomMatchStatusPayload) => void): Unsubscribe { return this.matchStatusListeners.add(listener); }
  onPhase(listener: (change: { phase: RoomClientPhase; detail: string }) => void): Unsubscribe { return this.phaseListeners.add(listener); }
  /** The room is gone for this client: kicked, expired, resume denied, transport exhausted, left. */
  onClosed(listener: (change: { reason: string }) => void): Unsubscribe { return this.closedListeners.add(listener); }

  /** Absolute URL for a host-relative match path. */
  resolveUrl(url: string): string { return resolveRoomRelativeUrl(this.endpoint, url); }

  // ------------------------------------------------------------ resume capabilities

  private resumeKey(code: string): string {
    return `${RESUME_KEY_PREFIX}:${endpointHost(this.endpoint)}:${code}:${this.playerId}`;
  }

  private readResume(code: string): { token: string; next: string } {
    let stored: { token?: unknown; next?: unknown } | null = null;
    try {
      const raw = this.storage?.getItem(this.resumeKey(code));
      stored = raw ? JSON.parse(raw) as { token?: unknown; next?: unknown } : null;
    } catch { stored = null; }
    const token = typeof stored?.token === 'string' && ROOM_RESUME_TOKEN_RE.test(stored.token) ? stored.token : this.randomHex();
    const next = typeof stored?.next === 'string' && ROOM_RESUME_TOKEN_RE.test(stored.next) && stored.next !== token ? stored.next : this.randomHex();
    return { token, next };
  }

  private writeResume(code: string, value: { token: string; next: string } | null): void {
    try {
      if (value) this.storage?.setItem(this.resumeKey(code), JSON.stringify(value));
      else this.storage?.removeItem(this.resumeKey(code));
    } catch { /* storage unavailable: the capability lives for this session only */ }
  }

  /** True when this browser holds a capability for the room (a reload can resume it). */
  hasResumeCapability(code: string): boolean {
    try { return !!this.storage?.getItem(this.resumeKey(normalizeRoomCode(code))); } catch { return false; }
  }

  // ------------------------------------------------------------ lifecycle

  private setPhase(phase: RoomClientPhase, detail = ''): void {
    if (this.currentPhase === phase) return;
    this.currentPhase = phase;
    this.phaseListeners.emit({ phase, detail });
  }

  private openTransport(code: string): void {
    this.closeTransport();
    const transport = this.createTransport({
      url: `${this.endpoint}${roomSocketPath(code)}`,
      resumeToken: null,
      maxFrameBytes: ROOM_MAX_PAYLOAD_BYTES * 2,
      clock: this.clock,
      ...this.transportOptions,
    });
    this.transport = transport;
    this.unsubscribeTransport.push(transport.onFrame((frame) => this.receive(frame)));
    this.unsubscribeTransport.push(transport.onState((change) => this.transportChanged(change)));
    transport.open();
  }

  private closeTransport(): void {
    for (const unsubscribe of this.unsubscribeTransport.splice(0)) unsubscribe();
    this.transport?.close('client', 'room client');
    this.transport = null;
    this.stopPings();
  }

  private transportChanged(change: TransportStateChange): void {
    if (change.state === 'open' && change.resumed && this.admission && this.roomCode) {
      // A dropped socket came back: present the capability again (the host retires the old socket).
      this.setPhase('connecting', 'resuming');
      void this.admit('join', this.rejoinPayload(this.roomCode)).catch(() => { /* reported through onClosed */ });
    } else if (change.state === 'reconnecting') {
      this.failPending(new RoomError('internal', 'connection lost'));
      this.stopPings();
      this.setPhase('reconnecting', change.detail ?? '');
    } else if (change.state === 'closed') {
      this.failPending(new RoomError('internal', `connection closed (${change.reason ?? 'unknown'})`));
      this.stopPings();
      if (this.currentPhase !== 'closed') this.finish(change.reason === 'server' ? (this.closedReason ?? 'room_connection_closed') : (change.reason ?? 'closed'));
    }
  }

  private finish(reason: string): void {
    if (this.currentPhase === 'closed') return;
    this.closedReason = reason;
    this.admission = null;
    this.closeTransport();
    this.setPhase('closed', reason);
    this.closedListeners.emit({ reason });
  }

  private startPings(): void {
    this.stopPings();
    if (this.pingIntervalMs <= 0) return;
    const tick = () => {
      this.pingTimer = null;
      if (this.currentPhase !== 'joined') return;
      this.sendEnvelope({ type: ROOM_CLIENT_MESSAGE.PING, payload: {} });
      this.pingTimer = this.setTimer(tick, this.pingIntervalMs);
    };
    this.pingTimer = this.setTimer(tick, this.pingIntervalMs);
  }

  private stopPings(): void {
    if (this.pingTimer !== null) this.clearTimer(this.pingTimer);
    this.pingTimer = null;
  }

  // ------------------------------------------------------------ wire

  private sendEnvelope(envelope: RoomEnvelope): boolean {
    if (!this.transport || this.transport.state !== 'open') return false;
    return this.transport.send(this.encoder.encode(JSON.stringify(envelope)));
  }

  private request(type: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const requestId = `r${++this.requestSeq}`;
    return new Promise((resolve, reject) => {
      const timer = this.setTimer(() => {
        this.pending.delete(requestId);
        reject(new RoomError('internal', `${type} timed out`));
      }, this.requestTimeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
      if (!this.sendEnvelope({ type, requestId, payload })) {
        this.clearTimer(timer);
        this.pending.delete(requestId);
        reject(new RoomError('internal', 'not connected'));
      }
    });
  }

  private failPending(error: Error): void {
    for (const [requestId, entry] of this.pending) {
      this.clearTimer(entry.timer);
      this.pending.delete(requestId);
      entry.reject(error);
    }
  }

  private receive(frame: Uint8Array): void {
    let envelope: RoomEnvelope;
    try { envelope = parseRoomEnvelope(this.decoder.decode(frame)); } catch { return; }
    const { type, requestId, payload } = envelope;
    if (type === ROOM_SERVER_MESSAGE.ERROR) {
      const code = isRoomErrorCode(payload.code) ? payload.code : 'internal';
      const entry = requestId ? this.pending.get(requestId) : null;
      if (entry && requestId) { this.pending.delete(requestId); this.clearTimer(entry.timer); entry.reject(new RoomError(code)); }
      if (code === 'resume_denied' || code === 'expired' || code === 'kicked') this.closedReason = code;
      return;
    }
    if (requestId) {
      const entry = this.pending.get(requestId);
      if (entry) { this.pending.delete(requestId); this.clearTimer(entry.timer); entry.resolve(payload); }
    }
    switch (type) {
      case ROOM_SERVER_MESSAGE.CREATED:
      case ROOM_SERVER_MESSAGE.JOINED:
      case ROOM_SERVER_MESSAGE.STATE:
        this.applyRoom(payload.room);
        if (Array.isArray(payload.chat)) {
          this.history = payload.chat.filter(isRoomChatEntry);
          for (const entry of this.history) this.chatListeners.emit(entry);
        }
        break;
      case ROOM_SERVER_MESSAGE.CHAT:
        if (isRoomChatEntry(payload.entry)) {
          this.history.push(payload.entry);
          if (this.history.length > 96) this.history.splice(0, this.history.length - 96);
          this.chatListeners.emit(payload.entry);
        }
        break;
      case ROOM_SERVER_MESSAGE.MATCH_START:
        if (isRoomMatchStartPayload(payload)) {
          this.lastMatchStart = payload;
          this.matchStartListeners.emit(payload);
        }
        break;
      case ROOM_SERVER_MESSAGE.MATCH_STATUS:
        if (isRoomMatchStatusPayload(payload)) {
          if (payload.status === 'ended' || payload.status === 'lost') this.lastMatchStart = null;
          this.matchStatusListeners.emit(payload);
        }
        break;
      case ROOM_SERVER_MESSAGE.CLOSED:
        this.closedReason = typeof payload.reason === 'string' ? payload.reason : 'room_closed';
        this.writeResume(this.roomCode, null);
        this.finish(this.closedReason);
        break;
      default:
        break;
    }
  }

  private applyRoom(value: unknown): void {
    let room: RoomSnapshot;
    try { room = readRoomSnapshot(value); } catch { return; }
    this.roomSnapshot = room;
    this.stateListeners.emit(room);
  }

  // ------------------------------------------------------------ admission

  private selectionPayload(selection: Partial<RoomSelection> | null | undefined): Record<string, unknown> | null {
    if (!selection) return null;
    return { specId: selection.specId ?? null, equipment: selection.equipment ?? [], camo: selection.camo ?? 'factory' };
  }

  private rejoinPayload(code: string): Record<string, unknown> {
    const base = this.admission?.payload ?? {};
    return { ...base, roomCode: code, player: { id: this.playerId, name: this.playerName } };
  }

  private async admit(kind: 'create' | 'join', payload: Record<string, unknown>): Promise<RoomSnapshot> {
    const code = String(payload.roomCode);
    const resume = this.readResume(code);
    this.writeResume(code, resume);
    const type = kind === 'create' ? ROOM_CLIENT_MESSAGE.CREATE : ROOM_CLIENT_MESSAGE.JOIN;
    const response = await this.request(type, { ...payload, resumeToken: resume.token, nextResumeToken: resume.next });
    // Rotate: the host now holds the hash of `next`; a leaked older token is useless.
    this.writeResume(code, { token: resume.next, next: this.randomHex() });
    this.admission = { kind, payload };
    this.roomCode = code;
    const room = readRoomSnapshot(response.room);
    this.roomSnapshot = room;
    this.setPhase('joined');
    this.startPings();
    return room;
  }

  private async connectAndAdmit(kind: 'create' | 'join', code: string, payload: Record<string, unknown>): Promise<RoomSnapshot> {
    if (this.disposed) throw new RoomError('internal', 'room client disposed');
    this.closedReason = null;
    this.roomCode = code;
    this.setPhase('connecting', kind);
    this.openTransport(code);
    await this.waitForOpen();
    return this.admit(kind, { ...payload, roomCode: code });
  }

  private waitForOpen(): Promise<void> {
    const transport = this.transport;
    if (!transport) return Promise.reject(new RoomError('internal', 'no transport'));
    if (transport.state === 'open') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const off = transport.onState((change) => {
        if (change.state === 'open') { off(); resolve(); }
        else if (change.state === 'closed') { off(); reject(new RoomError('internal', `connect failed (${change.reason ?? 'closed'})`)); }
      });
    });
  }

  /** Create a room: a random code is reserved atomically; a collision tries another. */
  async create({ mode, roomCode = null, selection = null, settings = null }: RoomCreateRequest): Promise<RoomSnapshot> {
    const payload = { mode, selection: this.selectionPayload(selection), settings: settings ?? {}, player: { id: this.playerId, name: this.playerName }, clientBuild: this.clientBuild };
    let attempts = roomCode ? 1 : CREATE_ATTEMPTS;
    let code = roomCode ? normalizeRoomCode(roomCode) : randomRoomCode(this.random);
    for (;;) {
      try {
        return await this.connectAndAdmit('create', code, payload);
      } catch (error) {
        this.closeTransport();
        if (error instanceof RoomError && error.code === 'room_code_exhausted' && --attempts > 0) {
          code = randomRoomCode(this.random);
          continue;
        }
        this.setPhase('idle', 'create failed');
        throw error;
      }
    }
  }

  /** Join (or resume) a room by code. */
  async join({ roomCode, selection = null, team = null }: RoomJoinRequest): Promise<RoomSnapshot> {
    const code = normalizeRoomCode(roomCode);
    if (code.length !== 6) throw new RoomError('invalid_room_code');
    const payload = { selection: this.selectionPayload(selection), team, player: { id: this.playerId, name: this.playerName }, clientBuild: this.clientBuild };
    try {
      return await this.connectAndAdmit('join', code, payload);
    } catch (error) {
      this.closeTransport();
      this.setPhase('idle', 'join failed');
      throw error;
    }
  }

  // ------------------------------------------------------------ actions

  private requireJoined(): void {
    if (this.currentPhase !== 'joined') throw new RoomError('not_in_room', `room client is ${this.currentPhase}`);
  }

  /** A policy command (`set_ready`, `set_team`, `set_map`, `start`, `kick`, ...). Rejections carry the room's code. */
  async command(command: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.requireJoined();
    return this.request(ROOM_CLIENT_MESSAGE.COMMAND, { command });
  }

  setReady(ready: boolean): Promise<Record<string, unknown>> { return this.command({ type: 'set_ready', ready }); }
  setTeam(team: RoomTeam): Promise<Record<string, unknown>> { return this.command({ type: 'set_team', team }); }
  selectVehicle(specId: string): Promise<Record<string, unknown>> { return this.command({ type: 'select_vehicle', specId }); }
  start(): Promise<Record<string, unknown>> { return this.command({ type: 'start' }); }

  async chat(text: string): Promise<void> {
    this.requireJoined();
    await this.request(ROOM_CLIENT_MESSAGE.CHAT, { text });
  }

  /** Explicit leave: the seat goes (an admin migrates at once) and the capability is forgotten. */
  async leave(): Promise<void> {
    if (this.currentPhase === 'joined') {
      try { await this.request(ROOM_CLIENT_MESSAGE.LEAVE, {}); } catch { /* the socket may already be gone */ }
    }
    this.writeResume(this.roomCode, null);
    this.finish('left_room');
  }

  /** Drop the connection but keep the seat and the capability (a reload resumes). */
  disconnect(reason = 'client'): void {
    this.admission = null;
    this.closeTransport();
    this.setPhase('idle', reason);
  }

  dispose(): void {
    this.disposed = true;
    this.failPending(new RoomError('internal', 'disposed'));
    this.admission = null;
    this.closeTransport();
    if (this.currentPhase !== 'closed') this.setPhase('closed', 'disposed');
    this.stateListeners.clear();
    this.chatListeners.clear();
    this.matchStartListeners.clear();
    this.matchStatusListeners.clear();
    this.phaseListeners.clear();
    this.closedListeners.clear();
  }

  /** Diagnostics for the F3 panel and the receipts. */
  stats(): { phase: RoomClientPhase; roomCode: string; revision: number; players: number; transport: string; pending: number } {
    return {
      phase: this.currentPhase, roomCode: this.roomCode, revision: this.roomSnapshot?.revision ?? -1,
      players: this.roomSnapshot?.players.length ?? 0, transport: this.transport?.state ?? 'none', pending: this.pending.size,
    };
  }
}

export { isRecord as isRoomRecord };
