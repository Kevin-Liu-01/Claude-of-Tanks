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
 * tokens, the host's start, per-seat `match_start`, the verdict, a lost
 * match, rematch in the same room.
 *
 * Peer-to-peer matches (§13, owner 2026-09-28): with a `p2p` match host the
 * actor also relays WebRTC signals between the host seat and its peers
 * (`room_signal`), signs the match's seat tokens with a per-match secret it
 * hands only to the host, accepts the host's `match_report` commands in place
 * of status polls, and migrates the host — after `ROOM_HOST_DISCONNECT_GRACE_MS`
 * without its socket, at once when it leaves or declines, and when its reports
 * stop for `ROOM_MATCH_REPORT_STALE_AFTER_MS` — with `host_changed`. With a
 * `service` host (the parked container backend) the match is polled as before.
 */
import type { SeatClaims } from '../../../server/match/seatToken.ts';
import {
  ROOM_ADMIN_DISCONNECT_GRACE_MS, ROOM_CHAT_HISTORY, ROOM_CLIENT_MESSAGE, ROOM_HOST_DISCONNECT_GRACE_MS, ROOM_IDLE_TTL_MS,
  ROOM_MATCH_LOST_AFTER_POLLS, ROOM_MATCH_POLL_MS, ROOM_MATCH_REPORT_STALE_AFTER_MS, ROOM_MAX_REGION_CHARS, ROOM_RATE_MAX_MESSAGES,
  ROOM_RATE_WINDOW_MS, ROOM_RESUME_TOKEN_RE, ROOM_SEAT_TOKEN_TTL_MS, ROOM_SERVER_MESSAGE, ROOM_SIGNAL_MAX_BYTES, ROOM_STATE_COALESCE_MS,
  ROOM_UNAUTHENTICATED_TIMEOUT_MS, RoomError, cleanId, isRecord, isRoomTeam, noElection, normalizeRoomChat, p2pMatchUrl,
  parseRoomEnvelope, publicRoomError, readRoomMatchReport, readRoomSignalPayload, utf8ByteLength,
} from './protocol.ts';
import type {
  RoomChatEntry, RoomCreateSettings, RoomEnvelope, RoomHostChangedPayload, RoomMatchStartPayload, RoomMatchStatusPayload, RoomMode,
  RoomResult, RoomSelection, RoomSnapshot, RoomTeam,
} from './protocol.ts';
import { electHost } from './p2pMatchHost.ts';
import type { P2pHostReport, P2pMatchHost } from './p2pMatchHost.ts';
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
  /** The authority tick reached, when the host reports one (a p2p host's last `match_report`). */
  tick?: number;
}

/** What every match host answers: a start, a status, a stop. */
export interface MatchHostBase {
  /** Start a match; resolves with the URL clients connect to (a `/match` socket path, or `rtc://<roomId>/<generation>`). */
  start(config: MatchHostStartConfig): Promise<{ matchUrl: string }>;
  /** Null when the host has no match for the room; throws when the host cannot be reached. */
  status(roomId: string): Promise<MatchHostStatus | null>;
  stop(roomId: string): Promise<void>;
}

/** A dedicated match service: a Cloudflare Container, an HTTP shim, or the in-process service (polled by alarm). */
export interface ServiceMatchHost extends MatchHostBase {
  readonly transport: 'service';
}

/** Where matches run: the host commander's browser (`p2p`, `src/mp/room/p2pMatchHost.ts`) or a dedicated service. */
export type MatchHost = ServiceMatchHost | P2pMatchHost;

export interface RoomActorPorts {
  now(): number;
  /** [0, 1): match seeds and ids. */
  random(): number;
  sha256Hex(text: string): string;
  /**
   * The room's seat-token secret (`MATCH_SEAT_SECRET`). A service match signs with it directly; a p2p match signs
   * with the per-match secret the actor derives from it (`sha256Hex(seatSecret + ':' + matchId)`) and hands only to the host.
   */
  seatSecret: string;
  signSeatToken(secret: string, claims: SeatClaims): string;
  matchHost: MatchHost;
  send(socketId: string, message: RoomEnvelope): void;
  closeSocket(socketId: string, reason: string): void;
  /** The actor wants `tick()` at `atMs` (null: nothing pending). Idempotent. */
  schedule(atMs: number | null): void;
  /** Called after every durable mutation. */
  persist(): void;
  /**
   * P1b (2026-09-28): the host's clock of the newest keepalive frame (`ROOM_KEEPALIVE_REQUEST`) this socket sent —
   * the Durable Object's `getWebSocketAutoResponseTimestamp`, the LAN service's own record — or null when it never
   * did. The frames never reach the actor: the 24 h idle expiry reads them here, so a room whose seats only keep
   * alive stays open as it did when every ping was a handled message.
   */
  keepaliveAt?(socketId: string): number | null;
  /**
   * P1b: run `callback` after `delayMs` on the host's own timer, never the durable alarm (an alarm is a billed
   * request): the trailing edge of a coalesced `room_state` broadcast. A host without it broadcasts every revision at
   * once. A pending callback keeps a Durable Object awake, so a coalesced change cannot be lost to hibernation.
   */
  defer?(callback: () => void, delayMs: number): void;
  guards?: Partial<RoomPolicyGuards>;
  /** Named in every admission reply (`region`) when the host knows where it runs. */
  region?: string;
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
  /** The running match's URL (a service path; a p2p match derives it from the room's host record instead). */
  matchUrl: string;
  /** P2p: the host's socket has been absent since the lease was set (migrate at the deadline). */
  hostLeaseAt: number | null;
  /** P2p: the host's last accepted `match_report`; its `tick` is the successor's resume point. */
  hostReport: P2pHostReport | null;
  /** P2p: when the host's silence becomes a dropped host. */
  hostReportDueAt: number | null;
  /**
   * P1b (2026-09-28): seats that stepped down from hosting THIS match by declining while they were the host. A
   * decline never hands the match back to one of them (two seats that cannot host would otherwise elect each other
   * without end); a drop or a leave still may. Cleared at every start and end; optional on restore.
   */
  steppedDown?: string[];
}

function matchIdFrom(random: () => number, round: number): string {
  const hex = Math.floor(random() * 0xffffffff).toString(16).padStart(8, '0');
  return `m${round}-${hex}`;
}

const RUNNING: ReadonlySet<string> = new Set(['starting', 'playing']);

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
  private matchUrl = '';
  private hostLeaseAt: number | null = null;
  private hostReport: P2pHostReport | null = null;
  private hostReportDueAt: number | null = null;
  private steppedDown = new Set<string>();
  private readonly sockets = new Map<string, RoomSocketRecord>();
  private readonly socketOfPlayer = new Map<string, string>();
  private polling: Promise<void> | null = null;
  // P1b: the coalesced room_state broadcast (runtime-only: after a restore the first change goes out at once).
  private stateBroadcastAt = Number.NEGATIVE_INFINITY;
  private stateFlushPending = false;
  private stateFlushArmed = false;

  constructor(roomCode: string, ports: RoomActorPorts) {
    this.roomCode = roomCode;
    this.ports = ports;
    if (ports.matchHost.transport === 'p2p') {
      ports.matchHost.bind({
        room: () => this.room,
        isConnected: (playerId) => this.socketOfPlayer.has(playerId),
        lastReport: () => this.hostReport,
        now: () => this.ports.now(),
      });
    }
  }

  // ------------------------------------------------------------ state

  get snapshot(): RoomSnapshot | null { return this.room; }
  get empty(): boolean { return this.room === null && this.sockets.size === 0; }
  get socketCount(): number { return this.sockets.size; }
  socketRecord(socketId: string): RoomSocketRecord | null { return this.sockets.get(socketId) ?? null; }
  /** The host's last accepted `match_report` (p2p), for the hosts' diagnostics and receipts. */
  get lastHostReport(): P2pHostReport | null { return this.hostReport; }

  /** The p2p match host, or null with a service host. */
  private get p2p(): P2pMatchHost | null {
    return this.ports.matchHost.transport === 'p2p' ? this.ports.matchHost : null;
  }

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
      matchUrl: this.matchUrl,
      hostLeaseAt: this.hostLeaseAt,
      hostReport: this.hostReport ? { ...this.hostReport, verdict: this.hostReport.verdict ? { ...this.hostReport.verdict } : null } : null,
      hostReportDueAt: this.hostReportDueAt,
      steppedDown: [...this.steppedDown],
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
    this.matchUrl = state.matchUrl ?? '';
    this.hostLeaseAt = state.hostLeaseAt ?? null;
    this.hostReport = state.hostReport ?? null;
    this.hostReportDueAt = state.hostReportDueAt ?? null;
    this.steppedDown = new Set(Array.isArray(state.steppedDown) ? state.steppedDown.filter((id): id is string => typeof id === 'string') : []);
    // A start that was in flight when the host restarted never completed: the room returns to waiting.
    if (state.startInFlight && this.room) abortStart(this.room, this.ports.now());
    this.startInFlight = false;
    if (this.room) {
      // State written before the host record and the decline flag (2026-09-28) reads as "no election, nobody declined";
      // the transport is the running host's.
      const host = (this.room as { host?: RoomSnapshot['host'] }).host;
      this.room.host = host ? { ...host, transport: this.ports.matchHost.transport } : noElection(this.room.createdAt, this.ports.matchHost.transport);
      for (const player of this.room.players) {
        player.connected = false;
        (player as { hostDeclined?: boolean }).hostDeclined ??= false;
      }
    }
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

  /** After every attachment has been replayed: reconcile the admin and host leases and schedule. */
  settleAfterRestore(): void {
    const now = this.ports.now();
    if (this.room) {
      const admin = this.room.players.find((player) => player.id === this.room!.adminId);
      if (admin && !admin.connected && this.adminLeaseAt === null) this.adminLeaseAt = now + ROOM_ADMIN_DISCONNECT_GRACE_MS;
      if (admin && admin.connected) this.adminLeaseAt = null;
      const hostId = this.runningP2pHostId();
      if (hostId && !this.socketOfPlayer.has(hostId) && this.hostLeaseAt === null) this.hostLeaseAt = now + ROOM_HOST_DISCONNECT_GRACE_MS;
      if (hostId && this.socketOfPlayer.has(hostId)) this.hostLeaseAt = null;
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
    consider(this.hostLeaseAt);
    consider(this.hostReportDueAt);
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

  /** The p2p host's id while its match is starting or playing, else null. */
  private runningP2pHostId(): string | null {
    const room = this.room;
    if (!this.p2p || !room || !room.match || !RUNNING.has(room.match.status)) return null;
    return room.host.hostId;
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
        // The p2p host's socket is gone: its peers stall until it returns or the grace elects a successor.
        if (this.runningP2pHostId() === socket.playerId) this.hostLeaseAt = now + ROOM_HOST_DISCONNECT_GRACE_MS;
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

  /**
   * `room_state` to every seat. P1b (2026-09-28): `instant` (joins, leaves, disconnects, phase changes, elections)
   * goes out now; a coalescable change (readiness, a team, a selection, a setting, a name, a decline) goes out now when
   * the last broadcast is older than ROOM_STATE_COALESCE_MS and otherwise rides one trailing broadcast at the window's
   * end carrying the newest revision — one fan-out per window however many changes a burst holds; every seat still
   * converges within the window. A host without a `defer` port broadcasts every revision at once.
   */
  private broadcastState(except: string | null = null, instant = true): void {
    if (!this.room) return;
    const defer = this.ports.defer;
    const now = this.ports.now();
    if (instant || !defer || now - this.stateBroadcastAt >= ROOM_STATE_COALESCE_MS) {
      this.stateFlushPending = false;
      this.stateBroadcastAt = now;
      this.broadcast(this.stateMessage(), except);
      return;
    }
    this.stateFlushPending = true;
    if (this.stateFlushArmed) return;
    this.stateFlushArmed = true;
    defer(() => this.flushState(), Math.max(0, this.stateBroadcastAt + ROOM_STATE_COALESCE_MS - now));
  }

  /** The trailing edge: the newest state, when a coalesced change is still unsent and the window has passed. */
  flushState(): void {
    this.stateFlushArmed = false;
    if (!this.stateFlushPending || !this.room) { this.stateFlushPending = false; return; }
    const now = this.ports.now();
    const wait = this.stateBroadcastAt + ROOM_STATE_COALESCE_MS - now;
    if (wait > 0 && this.ports.defer) {
      // an instant broadcast moved the window meanwhile: the coalesced change waits for its end
      this.stateFlushArmed = true;
      this.ports.defer(() => this.flushState(), wait);
      return;
    }
    this.stateFlushPending = false;
    this.stateBroadcastAt = now;
    this.broadcast(this.stateMessage());
  }

  /** A coalesced `room_state` is waiting for its window (receipts and the hosts' diagnostics). */
  get statePending(): boolean { return this.stateFlushPending; }

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
        case ROOM_CLIENT_MESSAGE.SIGNAL: this.signal(socket, message); break;
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
      this.room = createRoom({
        roomCode: this.roomCode, mode, creator: { id: playerId, name }, selection, settings, hostTransport: this.ports.matchHost.transport, now,
      });
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
    // The p2p host is back inside its grace: it stays the host (and receives its match_start, with the secret, below).
    if (this.runningP2pHostId() === playerId) this.hostLeaseAt = null;
    this.touch(now);
    this.persist();
    const type = kind === 'create' ? ROOM_SERVER_MESSAGE.CREATED : ROOM_SERVER_MESSAGE.JOINED;
    this.send(socket.id, {
      type, ...(message.requestId ? { requestId: message.requestId } : {}),
      payload: {
        room: serializeRoom(room), playerId, seat: existing.seat, chat: this.chat.slice(-ROOM_CHAT_HISTORY),
        ...(this.ports.region ? { region: this.ports.region.slice(0, ROOM_MAX_REGION_CHARS) } : {}),
      },
    });
    const issued = this.matchTokens.get(playerId);
    if (issued && room.match && issued.matchId === room.match.id && RUNNING.has(room.match.status)) {
      this.send(socket.id, { type: ROOM_SERVER_MESSAGE.MATCH_START, payload: { ...this.matchStartPayload(playerId, issued) } });
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
    if (command.type === 'match_report') {
      this.matchReport(socket, message, playerId, command);
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
    // A kick is a leave (instant); every other command's change is coalescable (P1b) — the ack names its revision.
    this.broadcastState(null, kicked !== null);
    // The running p2p host was kicked, or declined while hosting: its peers move to a successor at once.
    if (kicked && this.runningP2pHostId() === kicked) this.migrateHost(now, 'left');
    else if (command.type === 'host_decline' && command.declined === true && this.runningP2pHostId() === playerId) this.migrateHost(now, 'declined');
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

  /**
   * Explicit leave: the seat goes and an admin migrates at once; the room stays. A leaving p2p host migrates at once
   * too — synchronously: the handler has closed the delivering socket and must finish its sends without yielding
   * (a yield between that close and further sends crashed the Workers runtime, 2026-09-28).
   */
  private leave(socket: RoomSocketRecord, message: RoomEnvelope): void {
    const playerId = this.requirePlayer(socket);
    const room = this.room!;
    const now = this.ports.now();
    const hosting = this.runningP2pHostId() === playerId;
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
    if (hosting) this.migrateHost(now, 'left');
  }

  // ------------------------------------------------------------ peer-to-peer signaling

  /**
   * `room_signal`: relay one WebRTC signal from a seat to another (§13.2). Refused — with a code the sender can act
   * on — unless the match is starting or playing (`signal_phase`), the generation is the current one
   * (`signal_generation`), the target is another connected seat of this room and one of the two is the host
   * (`signal_target`), and the relayed payload fits `ROOM_SIGNAL_MAX_BYTES` (`signal_size`). The room never parses SDP.
   */
  private signal(socket: RoomSocketRecord, message: RoomEnvelope): void {
    const from = this.requirePlayer(socket);
    const room = this.room!;
    const signal = readRoomSignalPayload(message.payload);
    const hostId = this.runningP2pHostId();
    if (!hostId) throw new RoomError('signal_phase');
    if (signal.generation !== room.host.generation) throw new RoomError('signal_generation');
    if (signal.to === from || !room.players.some((player) => player.id === signal.to)) throw new RoomError('signal_target');
    if (from !== hostId && signal.to !== hostId) throw new RoomError('signal_target');
    const target = this.socketOfPlayer.get(signal.to);
    if (!target) throw new RoomError('signal_target');
    const relayed = { ...signal, from };
    if (utf8ByteLength(JSON.stringify(relayed)) > ROOM_SIGNAL_MAX_BYTES) throw new RoomError('signal_size');
    this.touch(this.ports.now());
    this.send(target, { type: ROOM_SERVER_MESSAGE.SIGNAL, payload: relayed });
    if (message.requestId) this.send(socket.id, { type: ROOM_SERVER_MESSAGE.ACK, requestId: message.requestId, payload: { relayed: true } });
  }

  // ------------------------------------------------------------ match lifecycle

  /** The per-match secret a p2p match's seat tokens are signed with: derived, never stored, handed only to the host. */
  private hostSecretFor(matchId: string): string {
    return this.ports.sha256Hex(`${this.ports.seatSecret}:${matchId}`);
  }

  private matchStartPayload(playerId: string, issued: IssuedToken): RoomMatchStartPayload {
    const room = this.room!;
    const match = room.match!;
    const payload: RoomMatchStartPayload = {
      matchId: match.id, round: match.round, mapId: match.mapId, mode: room.settings.gameMode, seed: match.seed,
      seat: issued.seat, team: issued.team, seatToken: issued.token, matchUrl: this.matchUrl, expiresAt: issued.expiresAt,
    };
    if (this.p2p && room.host.hostId) {
      // The URL names the current generation: a seat admitted after a migration connects to the current host.
      payload.matchUrl = p2pMatchUrl(this.roomCode, room.host.generation);
      payload.hostId = room.host.hostId;
      if (playerId === room.host.hostId) payload.hostSecret = this.hostSecretFor(match.id);
    }
    return payload;
  }

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
    // A p2p match's tokens are signed with the per-match secret only its host receives; a service verifies with the room's.
    const signingSecret = this.p2p ? this.hostSecretFor(matchId) : this.ports.seatSecret;
    for (const seat of plan.seats) {
      const claims: SeatClaims = {
        v: 1, roomId: this.roomCode, seat: seat.seat, playerId: seat.playerId, name: seat.name.slice(0, 32) || seat.playerId,
        team: seat.team, specId: seat.specId, iat: startedAt, exp: expiresAt,
      };
      this.matchTokens.set(seat.playerId, { token: this.ports.signSeatToken(signingSecret, claims), expiresAt, seat: seat.seat, team: seat.team, matchId });
    }
    if (this.p2p) {
      // No polls: the host reports; its silence past the budget, or its socket's absence past the grace, migrates.
      this.nextPollAt = null;
      this.hostReport = null;
      this.hostReportDueAt = startedAt + ROOM_MATCH_REPORT_STALE_AFTER_MS;
      this.hostLeaseAt = null;
      this.steppedDown.clear();
    } else {
      this.nextPollAt = startedAt + ROOM_MATCH_POLL_MS;
    }
    this.pollMisses = 0;
    this.touch(startedAt);
    this.persist();
    this.log('info', 'match started', {
      match: matchId, round: plan.round, seats: plan.seats.length, bots: plan.bots.length, map: plan.mapId,
      transport: this.ports.matchHost.transport, host: room.host.hostId, generation: room.host.generation,
    });
    this.send(socket.id, { type: ROOM_SERVER_MESSAGE.ACK, ...(requestId ? { requestId } : {}), payload: { matchId } });
    this.broadcastState();
    for (const [playerId, issued] of this.matchTokens) {
      this.sendToPlayer(playerId, { type: ROOM_SERVER_MESSAGE.MATCH_START, payload: { ...this.matchStartPayload(playerId, issued) } });
    }
    // The election itself, after every seat holds its match_start: a host_changed whose generation a seat already runs is a no-op.
    if (this.p2p) this.sendHostChanged('start', 0);
    this.reschedule();
  }

  private matchStatusMessage(): RoomEnvelope {
    const match = this.room?.match;
    const payload: RoomMatchStatusPayload = match
      ? { matchId: match.id, round: match.round, status: match.status, verdict: match.verdict }
      : { matchId: '', round: 0, status: 'lost', verdict: null };
    return { type: ROOM_SERVER_MESSAGE.MATCH_STATUS, payload: { ...payload } };
  }

  /** `host_changed` to every seat; the host's own copy carries the per-match secret. */
  private sendHostChanged(reason: RoomHostChangedPayload['reason'], resumeTick: number): void {
    const room = this.room;
    if (!room || !room.match || !room.host.hostId) return;
    const payload: RoomHostChangedPayload = { hostId: room.host.hostId, generation: room.host.generation, resumeTick, reason };
    const hostSocket = this.socketOfPlayer.get(room.host.hostId) ?? null;
    for (const [socketId, socket] of this.sockets) {
      if (!socket.playerId) continue;
      this.send(socketId, {
        type: ROOM_SERVER_MESSAGE.HOST_CHANGED,
        payload: socketId === hostSocket ? { ...payload, hostSecret: this.hostSecretFor(room.match.id) } : { ...payload },
      });
    }
  }

  /** The running p2p match is over (verdict, or nobody left to host): tokens, report and leases go; the election clears. */
  private endP2pMatch(): void {
    this.matchTokens.clear();
    this.hostReport = null;
    this.hostReportDueAt = null;
    this.hostLeaseAt = null;
    this.nextPollAt = null;
    this.steppedDown.clear();
    this.p2p?.clearElection();
  }

  /**
   * `match_report` from the p2p host: the room's match status and verdict follow it. Only the host of the current
   * generation may report (`host_only`); a report names the running match (`invalid_command` otherwise).
   */
  private matchReport(socket: RoomSocketRecord, message: RoomEnvelope, playerId: string, command: Record<string, unknown>): void {
    const room = this.room!;
    if (!this.p2p) throw new RoomError('invalid_command', 'match_report is a p2p host command');
    const report = readRoomMatchReport(command);
    if (!room.match || !RUNNING.has(room.match.status) || room.match.id !== report.matchId) throw new RoomError('invalid_command', 'no such running match');
    if (room.host.hostId !== playerId || room.host.generation !== report.generation) throw new RoomError('host_only');
    const now = this.ports.now();
    this.hostReport = { generation: report.generation, phase: report.phase, tick: report.tick, verdict: report.verdict, at: now };
    this.hostReportDueAt = now + ROOM_MATCH_REPORT_STALE_AFTER_MS;
    this.hostLeaseAt = null;
    let changed = false;
    if (report.phase === 'playing') changed = markMatchPlaying(room, now);
    if (report.phase === 'ended') {
      finishMatch(room, report.verdict ? { status: 'ended', result: report.verdict.result, reason: report.verdict.reason } : { status: 'lost', reason: 'host_ended' }, now);
      this.log('info', 'match ended', { match: report.matchId, result: report.verdict?.result ?? null, reason: report.verdict?.reason ?? 'host_ended', tick: report.tick });
      this.endP2pMatch();
      changed = true;
    }
    this.touch(now);
    this.persist();
    this.send(socket.id, { type: ROOM_SERVER_MESSAGE.ACK, ...(message.requestId ? { requestId: message.requestId } : {}), payload: { revision: room.revision } });
    if (report.phase === 'ended') this.broadcast(this.matchStatusMessage());
    if (changed) this.broadcastState();
  }

  /**
   * The p2p host is gone (`timeout`: socket absent past the grace or reports stopped; `left`: leave or kick;
   * `declined`: it asked not to host): elect the next connected commander, `generation + 1`, `host_changed` with the
   * departing host's last reported tick as the resume point (the secret only on the new host's copy). A drop or a
   * leave with nobody left ends the match as lost.
   *
   * P1b (2026-09-28): a running host's decline is its departure from hosting — the client declines while hosting
   * only when its actor is gone or never came (a Garage return, a re-entry without state, an elected seat that cannot
   * host) — so it is treated as a leave for the election: the next candidate takes over at once, `reason: 'declined'`,
   * willing first, a declined commander as the last resort (P1's rule kept the host unless a WILLING successor
   * existed, which stalled its peers for the 30 s report budget). The one exclusion: a seat that already stepped down
   * by declining while it hosted this match is never handed the match back by a decline (two seats that cannot host
   * would otherwise elect each other without end); a drop or a leave still elects by the full ladder. With no
   * candidate left the host keeps hosting — its seat is still in the room, unlike a leave — and its own client boots
   * afresh when no election follows.
   */
  private migrateHost(now: number, reason: RoomHostChangedPayload['reason']): void {
    const room = this.room;
    const p2p = this.p2p;
    const old = this.runningP2pHostId();
    if (!room || !p2p || !old || !room.match) return;
    let skip: ReadonlySet<string> | undefined;
    if (reason === 'declined') {
      this.steppedDown.add(old);
      skip = this.steppedDown;
      if (!electHost(room, old, skip)) {
        this.log('info', 'host declined with nobody left to take over; it keeps hosting', { host: old, steppedDown: [...this.steppedDown] });
        this.persist();
        return;
      }
    }
    const resumeTick = this.hostReport && this.hostReport.generation === room.host.generation ? this.hostReport.tick : 0;
    const next = p2p.migrate(old, skip);
    if (!next) {
      finishMatch(room, { status: 'lost', reason: 'match_lost' }, now);
      this.log('warn', 'match lost: no commander left to host', { match: room.match.id, host: old, reason });
      this.endP2pMatch();
      this.persist();
      this.broadcast(this.matchStatusMessage());
      this.broadcastState();
      return;
    }
    this.hostReport = null;
    this.hostReportDueAt = now + ROOM_MATCH_REPORT_STALE_AFTER_MS;
    this.hostLeaseAt = null;
    room.revision++;
    this.touch(now);
    this.persist();
    this.log('info', 'host migrated', { from: old, to: next.hostId, generation: next.generation, resumeTick, reason });
    this.sendHostChanged(reason, resumeTick);
    this.broadcastState();
  }

  private async pollMatch(): Promise<void> {
    const room = this.room;
    if (!room || !room.match || !RUNNING.has(room.match.status)) {
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

  /**
   * P1b: the newest keepalive frame of any seated socket keeps the room touched — the frames never reach the actor
   * (the Durable Object answers them without waking), so the expiry reads the host's record of them here.
   */
  private touchFromKeepalives(): boolean {
    const keepaliveAt = this.ports.keepaliveAt;
    const room = this.room;
    if (!keepaliveAt || !room) return false;
    const before = room.touchedAt;
    for (const [socketId, socket] of this.sockets) {
      if (!socket.playerId) continue;
      const at = keepaliveAt(socketId);
      if (at !== null && Number.isFinite(at)) this.touch(at);
    }
    return room.touchedAt !== before;
  }

  private expireIfDue(now: number): void {
    if (this.room && this.touchFromKeepalives()) this.persist();
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
    this.hostLeaseAt = null;
    this.hostReport = null;
    this.hostReportDueAt = null;
    this.steppedDown.clear();
    this.stateFlushPending = false;
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
    if (this.room && this.hostLeaseAt !== null && now >= this.hostLeaseAt) {
      this.hostLeaseAt = null;
      const hostId = this.runningP2pHostId();
      if (hostId && !this.socketOfPlayer.has(hostId)) this.migrateHost(now, 'timeout');
    }
    if (this.room && this.hostReportDueAt !== null && now >= this.hostReportDueAt) {
      this.hostReportDueAt = null;
      if (this.runningP2pHostId()) this.migrateHost(now, 'timeout');
    }
    if (this.room && !this.p2p && this.nextPollAt !== null && now >= this.nextPollAt) {
      this.nextPollAt = null;
      this.polling ??= this.pollMatch().finally(() => { this.polling = null; });
      await this.polling;
    }
    this.reschedule();
  }

  /** Force a poll now (receipts, the LAN service's verdict callback); a p2p room runs its due deadlines instead. */
  async observeMatchNow(): Promise<void> {
    if (!this.p2p) this.nextPollAt = this.ports.now();
    await this.tick();
  }
}
