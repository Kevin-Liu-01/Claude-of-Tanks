/**
 * RoomActor: one room's behaviour, independent of where it runs. The
 * Cloudflare Durable Object (`cloudflare/rooms/src/room.ts`) and the LAN /
 * test service (`server/rooms/localRoomService.ts`) both drive this class
 * through the same ports: sockets by opaque id, a clock, a hash, a seat-token
 * signer, a match host and a "wake me at" scheduler. Everything durable is in
 * `exportState()` so a hibernating object restores byte-for-byte; sockets are
 * runtime-only and re-attached by the host.
 *
 * Responsibilities (charter §5): admission with private resume capabilities
 * (only their SHA-256 is kept), the policy commands, chat with a bounded
 * history, reconnect leases and admin migration (explicit leave → at once;
 * disconnect → after the grace), 24 h expiry, and the match lifecycle — seat
 * tokens, the host's start, per-seat `match_start`, status polls, the verdict,
 * a lost container, rematch in the same room.
 */
import type { SeatClaims } from '../../../server/match/seatToken.ts';
import {
  ROOM_ADMIN_DISCONNECT_GRACE_MS, ROOM_CHAT_HISTORY, ROOM_CLIENT_MESSAGE, ROOM_IDLE_TTL_MS, ROOM_MATCH_LOST_AFTER_POLLS,
  ROOM_MATCH_POLL_MS, ROOM_RATE_MAX_MESSAGES, ROOM_RATE_WINDOW_MS, ROOM_RESUME_TOKEN_RE, ROOM_SEAT_TOKEN_TTL_MS,
  ROOM_SERVER_MESSAGE, ROOM_UNAUTHENTICATED_TIMEOUT_MS, RoomError, cleanId, isRecord, isRoomTeam, normalizeRoomChat,
  parseRoomEnvelope, publicRoomError,
} from './protocol.ts';
import type {
  RoomChatEntry, RoomCreateSettings, RoomEnvelope, RoomMatchStartPayload, RoomMatchStatusPayload, RoomMode, RoomResult,
  RoomSelection, RoomSnapshot, RoomTeam,
} from './protocol.ts';
import {
  abortStart, applyRoomCommand, finishMatch, joinRoom, markMatchPlaying, migrateAdminIfAbsent, planStart, recordMatch,
  removePlayer, serializeRoom, setPlayerConnected,
} from './roomPolicy.ts';
import type { RoomPolicyGuards, RoomStartPlan } from './roomPolicy.ts';
import { createRoom } from './roomPolicy.ts';

export interface MatchHostStartConfig {
  roomId: string;
  matchId: string;
  round: number;
  mapId: string;
  mode: string;
  seed: number;
  seats: RoomStartPlan['seats'];
  bots: RoomStartPlan['bots'];
  countdownS: number;
  arrangement: RoomSnapshot['settings']['arrangement'];
  campaignOperationId: string | null;
}

export interface MatchHostStatus {
  roomId: string;
  matchId: string | null;
  /** The actor's phase; `stopped` once it released the room, `unknown` when the host cannot say. */
  phase: 'loading' | 'countdown' | 'playing' | 'ended' | 'stopped' | 'unknown';
  verdict: { result: RoomResult; reason: string } | null;
}

/** Where matches run: a Cloudflare Container, an HTTP shim, or the in-process service. */
export interface MatchHost {
  /** Start a match; resolves with the WebSocket URL clients connect to (absolute, or relative to the room endpoint). */
  start(config: MatchHostStartConfig): Promise<{ matchUrl: string }>;
  /** Null when the host has no match for the room; throws when the host cannot be reached. */
  status(roomId: string): Promise<MatchHostStatus | null>;
  stop(roomId: string): Promise<void>;
}

export interface RoomActorPorts {
  now(): number;
  /** [0, 1): match seeds and ids. */
  random(): number;
  sha256Hex(text: string): string;
  signSeatToken(claims: SeatClaims): string;
  matchHost: MatchHost;
  send(socketId: string, message: RoomEnvelope): void;
  closeSocket(socketId: string, reason: string): void;
  /** The actor wants `tick()` at `atMs` (null: nothing pending). Idempotent. */
  schedule(atMs: number | null): void;
  /** Called after every durable mutation. */
  persist(): void;
  guards?: Partial<RoomPolicyGuards>;
  log?(level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>): void;
}

export interface RoomSocketRecord {
  id: string;
  playerId: string | null;
  acceptedAt: number;
  lastActivity: number;
  rateStart: number;
  rateCount: number;
}

interface IssuedToken {
  token: string;
  expiresAt: number;
  seat: number;
  team: RoomTeam;
  matchId: string;
}

/** Everything a host must persist between wakes. */
export interface RoomActorState {
  v: 1;
  roomCode: string;
  room: RoomSnapshot | null;
  resumeHashes: Record<string, string>;
  chat: RoomChatEntry[];
  chatSeq: number;
  adminLeaseAt: number | null;
  nextPollAt: number | null;
  pollMisses: number;
  expiresAt: number | null;
  matchTokens: Record<string, IssuedToken>;
  startInFlight: boolean;
}

function matchIdFrom(random: () => number, round: number): string {
  const hex = Math.floor(random() * 0xffffffff).toString(16).padStart(8, '0');
  return `m${round}-${hex}`;
}

export class RoomActor {
  readonly roomCode: string;
  private readonly ports: RoomActorPorts;
  private room: RoomSnapshot | null = null;
  private resumeHashes = new Map<string, string>();
  private chat: RoomChatEntry[] = [];
  private chatSeq = 0;
  private adminLeaseAt: number | null = null;
  private nextPollAt: number | null = null;
  private pollMisses = 0;
  private matchTokens = new Map<string, IssuedToken>();
  private startInFlight = false;
  private readonly sockets = new Map<string, RoomSocketRecord>();
  private readonly socketOfPlayer = new Map<string, string>();
  private polling: Promise<void> | null = null;

  constructor(roomCode: string, ports: RoomActorPorts) {
    this.roomCode = roomCode;
    this.ports = ports;
  }

  // ------------------------------------------------------------ state

  get snapshot(): RoomSnapshot | null { return this.room; }
  get empty(): boolean { return this.room === null && this.sockets.size === 0; }
  get socketCount(): number { return this.sockets.size; }
  socketRecord(socketId: string): RoomSocketRecord | null { return this.sockets.get(socketId) ?? null; }

  exportState(): RoomActorState {
    return {
      v: 1,
      roomCode: this.roomCode,
      room: this.room ? serializeRoom(this.room) : null,
      resumeHashes: Object.fromEntries(this.resumeHashes),
      chat: this.chat.map((entry) => ({ ...entry })),
      chatSeq: this.chatSeq,
      adminLeaseAt: this.adminLeaseAt,
      nextPollAt: this.nextPollAt,
      pollMisses: this.pollMisses,
      expiresAt: this.expiresAt,
      matchTokens: Object.fromEntries(this.matchTokens),
      startInFlight: this.startInFlight,
    };
  }

  restore(state: RoomActorState): void {
    if (!isRecord(state) || state.v !== 1 || state.roomCode !== this.roomCode) throw new Error('invalid room actor state');
    this.room = state.room;
    this.resumeHashes = new Map(Object.entries(state.resumeHashes ?? {}));
    this.chat = (state.chat ?? []).slice();
    this.chatSeq = state.chatSeq ?? 0;
    this.adminLeaseAt = state.adminLeaseAt ?? null;
    this.nextPollAt = state.nextPollAt ?? null;
    this.pollMisses = state.pollMisses ?? 0;
    this.matchTokens = new Map(Object.entries(state.matchTokens ?? {}));
    // A start that was in flight when the host restarted never completed: the room returns to waiting.
    if (state.startInFlight && this.room) abortStart(this.room, this.ports.now());
    this.startInFlight = false;
    if (this.room) for (const player of this.room.players) player.connected = false;
  }

  /** Re-attach a socket the host kept across a restart (`playerId` from its attachment). */
  attachSocket(record: RoomSocketRecord): void {
    this.sockets.set(record.id, { ...record });
    if (record.playerId && this.room?.players.some((player) => player.id === record.playerId)) {
      const previous = this.socketOfPlayer.get(record.playerId);
      if (previous && previous !== record.id) this.retire(previous, 'resume_denied');
      this.socketOfPlayer.set(record.playerId, record.id);
      setPlayerConnected(this.room, record.playerId, true, this.ports.now());
    } else if (record.playerId) {
      this.retire(record.id, 'resume_denied');
    }
  }

  /** After every attachment has been replayed: reconcile the admin lease and schedule. */
  settleAfterRestore(): void {
    const now = this.ports.now();
    if (this.room) {
      const admin = this.room.players.find((player) => player.id === this.room!.adminId);
      if (admin && !admin.connected && this.adminLeaseAt === null) this.adminLeaseAt = now + ROOM_ADMIN_DISCONNECT_GRACE_MS;
      if (admin && admin.connected) this.adminLeaseAt = null;
    }
    this.reschedule();
  }

  /** The room expires 24 h after its last message (every mutation touches the room). */
  private get expiresAt(): number | null {
    return this.room ? this.room.touchedAt + ROOM_IDLE_TTL_MS : null;
  }

  nextDeadline(): number | null {
    let next: number | null = null;
    const consider = (at: number | null) => { if (at !== null && (next === null || at < next)) next = at; };
    consider(this.expiresAt);
    consider(this.adminLeaseAt);
    consider(this.nextPollAt);
    for (const socket of this.sockets.values()) if (!socket.playerId) consider(socket.acceptedAt + ROOM_UNAUTHENTICATED_TIMEOUT_MS);
    return next;
  }

  private reschedule(): void {
    this.ports.schedule(this.nextDeadline());
  }

  private persist(): void {
    this.ports.persist();
  }

  private log(level: 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}): void {
    this.ports.log?.(level, message, { room: this.roomCode, ...fields });
  }

  // ------------------------------------------------------------ sockets

  handleOpen(socketId: string): void {
    const now = this.ports.now();
    this.sockets.set(socketId, { id: socketId, playerId: null, acceptedAt: now, lastActivity: now, rateStart: now, rateCount: 0 });
    this.reschedule();
  }

  handleClose(socketId: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) return;
    this.sockets.delete(socketId);
    if (socket.playerId && this.socketOfPlayer.get(socket.playerId) === socketId) {
      this.socketOfPlayer.delete(socket.playerId);
      if (this.room?.players.some((player) => player.id === socket.playerId)) {
        const now = this.ports.now();
        setPlayerConnected(this.room, socket.playerId, false, now);
        if (this.room.adminId === socket.playerId) this.adminLeaseAt = now + ROOM_ADMIN_DISCONNECT_GRACE_MS;
        this.broadcastState();
        this.persist();
      }
    }
    this.reschedule();
  }

  private retire(socketId: string, reason: string): void {
    const socket = this.sockets.get(socketId);
    if (!socket) return;
    this.sockets.delete(socketId);
    if (socket.playerId && this.socketOfPlayer.get(socket.playerId) === socketId) this.socketOfPlayer.delete(socket.playerId);
    if (reason === 'resume_denied') this.ports.send(socketId, { type: ROOM_SERVER_MESSAGE.ERROR, payload: { code: 'resume_denied' } });
    this.ports.closeSocket(socketId, reason);
  }

  private send(socketId: string, message: RoomEnvelope): void {
    this.ports.send(socketId, message);
  }

  private sendToPlayer(playerId: string, message: RoomEnvelope): void {
    const socketId = this.socketOfPlayer.get(playerId);
    if (socketId) this.send(socketId, message);
  }

  private broadcast(message: RoomEnvelope, except: string | null = null): void {
    for (const [socketId, socket] of this.sockets) {
      if (!socket.playerId || socketId === except) continue;
      this.send(socketId, message);
    }
  }

  private stateMessage(): RoomEnvelope {
    return { type: ROOM_SERVER_MESSAGE.STATE, payload: { room: this.room ? serializeRoom(this.room) : null } };
  }

  private broadcastState(except: string | null = null): void {
    if (!this.room) return;
    this.broadcast(this.stateMessage(), except);
  }

  // ------------------------------------------------------------ messages

  /** One inbound frame (already decoded to text). Never throws: errors go back as `error` envelopes. */
  async handleMessage(socketId: string, text: string): Promise<void> {
    const socket = this.sockets.get(socketId);
    if (!socket) {
      this.ports.send(socketId, { type: ROOM_SERVER_MESSAGE.ERROR, payload: { code: 'resume_denied' } });
      this.ports.closeSocket(socketId, 'resume_denied');
      return;
    }
    const now = this.ports.now();
    if (!socket.playerId && now - socket.acceptedAt >= ROOM_UNAUTHENTICATED_TIMEOUT_MS) {
      this.retire(socketId, 'authentication_timeout');
      this.reschedule();
      return;
    }
    if (now - socket.rateStart >= ROOM_RATE_WINDOW_MS) { socket.rateStart = now; socket.rateCount = 0; }
    socket.rateCount++;
    if (socket.rateCount > ROOM_RATE_MAX_MESSAGES) {
      // detach first so the seat reads disconnected (and an admin lease starts), then close
      this.handleClose(socketId);
      this.ports.closeSocket(socketId, 'rate_limit');
      return;
    }
    let message: RoomEnvelope | null = null;
    try {
      this.expireIfDue(now);
      if (!this.sockets.has(socketId)) return;
      message = parseRoomEnvelope(text);
      socket.lastActivity = now;
      switch (message.type) {
        case ROOM_CLIENT_MESSAGE.CREATE: this.admit(socket, message, 'create'); break;
        case ROOM_CLIENT_MESSAGE.JOIN: this.admit(socket, message, 'join'); break;
        case ROOM_CLIENT_MESSAGE.COMMAND: await this.command(socket, message); break;
        case ROOM_CLIENT_MESSAGE.CHAT: this.chatMessage(socket, message); break;
        case ROOM_CLIENT_MESSAGE.LEAVE: this.leave(socket, message); break;
        case ROOM_CLIENT_MESSAGE.PING:
          this.requirePlayer(socket);
          this.touch(now);
          this.send(socketId, { type: ROOM_SERVER_MESSAGE.PONG, ...(message.requestId ? { requestId: message.requestId } : {}), payload: { now } });
          break;
        default: throw new RoomError('unknown_message');
      }
    } catch (error) {
      if (!(error instanceof RoomError)) this.log('error', 'room message failed', { error: String(error) });
      this.send(socketId, publicRoomError(error, message?.requestId));
    }
    this.reschedule();
  }

  private requirePlayer(socket: RoomSocketRecord): string {
    if (!socket.playerId || !this.room || !this.room.players.some((player) => player.id === socket.playerId)) {
      throw new RoomError('not_in_room');
    }
    return socket.playerId;
  }

  private touch(now: number): void {
    if (!this.room) return;
    this.room.touchedAt = Math.max(this.room.touchedAt, now);
  }

  private readSelection(value: unknown): Partial<RoomSelection> | null {
    if (!isRecord(value)) return null;
    return {
      specId: typeof value.specId === 'string' ? value.specId : null,
      equipment: Array.isArray(value.equipment) ? value.equipment.map(String) : [],
      camo: typeof value.camo === 'string' ? value.camo : 'factory',
    };
  }

  private readResume(payload: Record<string, unknown>): { proofs: string[]; next: string } {
    const current = payload.resumeToken;
    const next = payload.nextResumeToken ?? current;
    if (typeof current !== 'string' || !ROOM_RESUME_TOKEN_RE.test(current) ||
        typeof next !== 'string' || !ROOM_RESUME_TOKEN_RE.test(next)) {
      throw new RoomError('invalid_resume_token');
    }
    return { proofs: current === next ? [current] : [current, next], next };
  }

  private resumeAllowed(playerId: string, proofs: string[]): boolean {
    const stored = this.resumeHashes.get(playerId);
    if (!stored) return false;
    return proofs.some((proof) => this.ports.sha256Hex(proof) === stored);
  }

  /** `room_create` / `room_join`: seat, resume or refuse; reply with the room and the chat history. */
  private admit(socket: RoomSocketRecord, message: RoomEnvelope, kind: 'create' | 'join'): void {
    if (socket.playerId) throw new RoomError('already_joined');
    const payload = message.payload;
    if (payload.roomCode !== undefined && payload.roomCode !== this.roomCode) throw new RoomError('invalid_room_code');
    if (!isRecord(payload.player)) throw new RoomError('invalid_player');
    const playerId = cleanId(payload.player.id);
    const name = String(payload.player.name ?? '');
    const resume = this.readResume(payload);
    const selection = this.readSelection(payload.selection);
    const now = this.ports.now();
    let existing = this.room?.players.find((player) => player.id === playerId) ?? null;
    if (existing) {
      if (!this.resumeAllowed(playerId, resume.proofs)) throw new RoomError('resume_denied');
      const previous = this.socketOfPlayer.get(playerId);
      if (previous && previous !== socket.id) this.retire(previous, 'resume_denied');
    } else if (kind === 'create') {
      if (this.room) throw new RoomError('room_code_exhausted');
      const mode: RoomMode = payload.mode === 'lan' ? 'lan' : 'private';
      const settings = isRecord(payload.settings) ? payload.settings as RoomCreateSettings : null;
      this.room = createRoom({ roomCode: this.roomCode, mode, creator: { id: playerId, name }, selection, settings, now });
      this.chat = [];
      this.chatSeq = 0;
      this.matchTokens.clear();
      existing = this.room.players[0]!;
      this.log('info', 'room created', { admin: playerId, mode });
    } else {
      if (!this.room) throw new RoomError('room_not_found');
      const team = isRoomTeam(payload.team) ? payload.team : null;
      existing = joinRoom(this.room, { player: { id: playerId, name }, selection, team, now });
      this.log('info', 'player joined', { player: playerId, team: existing.team });
    }
    const room = this.room!;
    this.resumeHashes.set(playerId, this.ports.sha256Hex(resume.next));
    socket.playerId = playerId;
    this.socketOfPlayer.set(playerId, socket.id);
    setPlayerConnected(room, playerId, true, now);
    if (room.adminId === playerId) this.adminLeaseAt = null;
    this.touch(now);
    this.persist();
    const type = kind === 'create' ? ROOM_SERVER_MESSAGE.CREATED : ROOM_SERVER_MESSAGE.JOINED;
    this.send(socket.id, {
      type, ...(message.requestId ? { requestId: message.requestId } : {}),
      payload: { room: serializeRoom(room), playerId, seat: existing.seat, chat: this.chat.slice(-ROOM_CHAT_HISTORY) },
    });
    const issued = this.matchTokens.get(playerId);
    if (issued && room.match && issued.matchId === room.match.id && (room.match.status === 'starting' || room.match.status === 'playing')) {
      this.send(socket.id, { type: ROOM_SERVER_MESSAGE.MATCH_START, payload: { ...this.matchStartPayload(issued) } });
    }
    this.broadcastState(socket.id);
  }

  private async command(socket: RoomSocketRecord, message: RoomEnvelope): Promise<void> {
    const playerId = this.requirePlayer(socket);
    const room = this.room!;
    const now = this.ports.now();
    const command = message.payload.command;
    if (!isRecord(command)) throw new RoomError('invalid_command');
    if (command.type === 'start') {
      if (this.startInFlight) throw new RoomError('match_running');
      applyRoomCommand(room, playerId, command, now, this.ports.guards);
      await this.startMatch(socket, message.requestId);
      return;
    }
    const kicked = command.type === 'kick' ? cleanId(command.playerId, 'unknown_player') : null;
    applyRoomCommand(room, playerId, command, now, this.ports.guards);
    if (kicked) {
      const kickedSocket = this.socketOfPlayer.get(kicked);
      this.resumeHashes.delete(kicked);
      this.matchTokens.delete(kicked);
      if (kickedSocket) {
        this.send(kickedSocket, { type: ROOM_SERVER_MESSAGE.CLOSED, payload: { reason: 'kicked' } });
        this.retire(kickedSocket, 'kicked');
      }
    }
    this.touch(now);
    this.persist();
    this.send(socket.id, { type: ROOM_SERVER_MESSAGE.ACK, ...(message.requestId ? { requestId: message.requestId } : {}), payload: { revision: room.revision } });
    this.broadcastState();
  }

  private chatMessage(socket: RoomSocketRecord, message: RoomEnvelope): void {
    const playerId = this.requirePlayer(socket);
    const room = this.room!;
    const player = room.players.find((entry) => entry.id === playerId)!;
    const text = normalizeRoomChat(message.payload.text);
    if (!text) throw new RoomError('chat_rejected');
    const now = this.ports.now();
    const entry: RoomChatEntry = { id: ++this.chatSeq, playerId, name: player.name, team: player.team, text, at: now };
    this.chat.push(entry);
    if (this.chat.length > ROOM_CHAT_HISTORY) this.chat.splice(0, this.chat.length - ROOM_CHAT_HISTORY);
    this.touch(now);
    this.persist();
    this.broadcast({ type: ROOM_SERVER_MESSAGE.CHAT, payload: { entry } });
    if (message.requestId) this.send(socket.id, { type: ROOM_SERVER_MESSAGE.ACK, requestId: message.requestId, payload: { id: entry.id } });
  }

  /** Explicit leave: the seat goes and an admin migrates at once; the room stays. */
  private leave(socket: RoomSocketRecord, message: RoomEnvelope): void {
    const playerId = this.requirePlayer(socket);
    const room = this.room!;
    const now = this.ports.now();
    removePlayer(room, playerId, now);
    this.resumeHashes.delete(playerId);
    this.matchTokens.delete(playerId);
    if (room.adminId !== playerId) this.adminLeaseAt = null;
    this.touch(now);
    this.persist();
    this.send(socket.id, { type: ROOM_SERVER_MESSAGE.ACK, ...(message.requestId ? { requestId: message.requestId } : {}), payload: { left: true } });
    this.retire(socket.id, 'client_leave');
    this.log('info', 'player left', { player: playerId, admin: room.adminId, players: room.players.length });
    this.broadcastState();
  }

  // ------------------------------------------------------------ match lifecycle

  private matchStartPayload(issued: IssuedToken): RoomMatchStartPayload {
    const room = this.room!;
    const match = room.match!;
    return {
      matchId: match.id, round: match.round, mapId: match.mapId, mode: room.settings.gameMode, seed: match.seed,
      seat: issued.seat, team: issued.team, seatToken: issued.token, matchUrl: this.matchUrl, expiresAt: issued.expiresAt,
    };
  }

  private matchUrl = '';

  private async startMatch(socket: RoomSocketRecord, requestId: string | undefined): Promise<void> {
    const room = this.room!;
    const now = this.ports.now();
    const seed = Math.floor(this.ports.random() * 0xffffffff) >>> 0;
    const plan = planStart(room, { seed, now });
    const matchId = matchIdFrom(this.ports.random, plan.round);
    this.startInFlight = true;
    this.persist();
    this.broadcastState();
    const config: MatchHostStartConfig = {
      roomId: this.roomCode, matchId, round: plan.round, mapId: plan.mapId, mode: plan.gameMode, seed: plan.seed,
      seats: plan.seats, bots: plan.bots, countdownS: 5,
      arrangement: room.settings.arrangement, campaignOperationId: room.settings.campaignOperationId,
    };
    let matchUrl: string;
    try {
      ({ matchUrl } = await this.ports.matchHost.start(config));
    } catch (error) {
      this.startInFlight = false;
      abortStart(room, this.ports.now());
      this.log('warn', 'match host unavailable', { error: String(error) });
      this.persist();
      this.broadcastState();
      this.send(socket.id, publicRoomError(new RoomError('match_host_unavailable'), requestId));
      return;
    }
    const startedAt = this.ports.now();
    this.startInFlight = false;
    this.matchUrl = matchUrl;
    recordMatch(room, { id: matchId, round: plan.round, mapId: plan.mapId, seed: plan.seed, startedAt }, startedAt);
    this.matchTokens.clear();
    const expiresAt = startedAt + ROOM_SEAT_TOKEN_TTL_MS;
    for (const seat of plan.seats) {
      const claims: SeatClaims = {
        v: 1, roomId: this.roomCode, seat: seat.seat, playerId: seat.playerId, name: seat.name.slice(0, 32) || seat.playerId,
        team: seat.team, specId: seat.specId, iat: startedAt, exp: expiresAt,
      };
      this.matchTokens.set(seat.playerId, { token: this.ports.signSeatToken(claims), expiresAt, seat: seat.seat, team: seat.team, matchId });
    }
    this.nextPollAt = startedAt + ROOM_MATCH_POLL_MS;
    this.pollMisses = 0;
    this.touch(startedAt);
    this.persist();
    this.log('info', 'match started', { match: matchId, round: plan.round, seats: plan.seats.length, bots: plan.bots.length, map: plan.mapId });
    this.send(socket.id, { type: ROOM_SERVER_MESSAGE.ACK, ...(requestId ? { requestId } : {}), payload: { matchId } });
    this.broadcastState();
    for (const [playerId, issued] of this.matchTokens) {
      this.sendToPlayer(playerId, { type: ROOM_SERVER_MESSAGE.MATCH_START, payload: { ...this.matchStartPayload(issued) } });
    }
    this.reschedule();
  }

  private matchStatusMessage(): RoomEnvelope {
    const match = this.room?.match;
    const payload: RoomMatchStatusPayload = match
      ? { matchId: match.id, round: match.round, status: match.status, verdict: match.verdict }
      : { matchId: '', round: 0, status: 'lost', verdict: null };
    return { type: ROOM_SERVER_MESSAGE.MATCH_STATUS, payload: { ...payload } };
  }

  private async pollMatch(): Promise<void> {
    const room = this.room;
    if (!room || !room.match || (room.match.status !== 'starting' && room.match.status !== 'playing')) {
      this.nextPollAt = null;
      return;
    }
    let status: MatchHostStatus | null;
    try {
      status = await this.ports.matchHost.status(this.roomCode);
    } catch (error) {
      status = null;
      this.log('warn', 'match status poll failed', { error: String(error) });
    }
    const now = this.ports.now();
    if (!this.room || this.room.match !== room.match) return;
    if (status && status.verdict) {
      finishMatch(room, { status: 'ended', result: status.verdict.result, reason: status.verdict.reason }, now);
      this.matchTokens.clear();
      this.nextPollAt = null;
      this.log('info', 'match ended', { match: room.match.id, result: status.verdict.result, reason: status.verdict.reason });
      this.persist();
      this.broadcast(this.matchStatusMessage());
      this.broadcastState();
      return;
    }
    const alive = !!status && (status.phase === 'loading' || status.phase === 'countdown' || status.phase === 'playing' || status.phase === 'ended');
    if (alive) {
      this.pollMisses = 0;
      if (status!.phase === 'playing' && markMatchPlaying(room, now)) { this.persist(); this.broadcastState(); }
      this.nextPollAt = now + ROOM_MATCH_POLL_MS;
      return;
    }
    this.pollMisses++;
    if (this.pollMisses < ROOM_MATCH_LOST_AFTER_POLLS) {
      this.nextPollAt = now + ROOM_MATCH_POLL_MS;
      return;
    }
    finishMatch(room, { status: 'lost', reason: 'match_lost' }, now);
    this.matchTokens.clear();
    this.nextPollAt = null;
    this.log('warn', 'match lost', { match: room.match.id });
    this.persist();
    this.broadcast(this.matchStatusMessage());
    this.broadcastState();
  }

  // ------------------------------------------------------------ timers

  private expireIfDue(now: number): void {
    const expiresAt = this.expiresAt;
    if (!this.room || expiresAt === null || now < expiresAt) return;
    this.log('info', 'room expired', { players: this.room.players.length });
    this.broadcast({ type: ROOM_SERVER_MESSAGE.CLOSED, payload: { reason: 'expired' } });
    for (const socketId of [...this.sockets.keys()]) this.retire(socketId, 'expired');
    this.room = null;
    this.resumeHashes.clear();
    this.matchTokens.clear();
    this.chat = [];
    this.adminLeaseAt = null;
    this.nextPollAt = null;
    this.persist();
  }

  /** The host's alarm / timer: run every due deadline, then reschedule. */
  async tick(): Promise<void> {
    const now = this.ports.now();
    for (const [socketId, socket] of [...this.sockets]) {
      if (!socket.playerId && socket.acceptedAt + ROOM_UNAUTHENTICATED_TIMEOUT_MS <= now) this.retire(socketId, 'authentication_timeout');
    }
    this.expireIfDue(now);
    if (this.room && this.adminLeaseAt !== null && now >= this.adminLeaseAt) {
      this.adminLeaseAt = null;
      if (migrateAdminIfAbsent(this.room, now)) {
        this.log('info', 'admin migrated', { admin: this.room.adminId });
        this.persist();
        this.broadcastState();
      } else {
        const admin = this.room.players.find((player) => player.id === this.room!.adminId);
        // Nobody else is connected: re-check when someone is (the next admission clears the lease).
        if (admin && !admin.connected) this.adminLeaseAt = now + ROOM_ADMIN_DISCONNECT_GRACE_MS;
      }
    }
    if (this.room && this.nextPollAt !== null && now >= this.nextPollAt) {
      this.nextPollAt = null;
      this.polling ??= this.pollMatch().finally(() => { this.polling = null; });
      await this.polling;
    }
    this.reschedule();
  }

  /** Force a poll now (receipts, the LAN service's verdict callback). */
  async observeMatchNow(): Promise<void> {
    this.nextPollAt = this.ports.now();
    await this.tick();
  }
}
