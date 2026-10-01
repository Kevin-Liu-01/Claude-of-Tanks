/**
 * A room service double for the peer-to-peer proofs (P2 client lane, 2026-09-28): the v2 room protocol over plain
 * WebSockets (`/rooms/<CODE>`, binary UTF-8 JSON envelopes) with the section-13 additions the rooms lane (P1) builds
 * into the RoomActor, implemented here exactly as §13.2 states so the client proofs run before P1 lands and the same
 * proof runs against the real service after:
 *
 *   - `match_start` names `rtc://<room>/<generation>` and the host; the host's own copy carries `hostSecret`
 *     (sha256Hex(seatSecret ':' matchId)) and every seat token of the match is signed with that secret;
 *   - `room_signal` is relayed with `from` when both seats are in the room, one of them is the current host, the
 *     match is starting or playing, the generation is current and the payload is under ROOM_SIGNAL_MAX_BYTES;
 *   - the election: the admin hosts unless it declined; else the lowest `joinedAt` connected commander that did not
 *     decline; when the host's socket is absent for ROOM_HOST_DISCONNECT_GRACE_MS, or the host leaves or declines,
 *     the room elects the next and broadcasts `host_changed` (the secret only in the elected seat's copy);
 *   - `match_report` updates the room's tick / phase / verdict; a verdict ends the match (`match_status`); reports silent
 *     past P1's budget (ROOM_MATCH_REPORT_STALE_AFTER_MS, `reportStaleMs` for the proofs) migrate with `timeout`;
 *   - the election is P1's own `electHost` (a declined commander hosts only as the last resort); a running host's
 *     decline is its departure from hosting (P1b, 2026-09-28): the next candidate takes over at once with reason
 *     `declined` — willing first, a declined commander as the last resort — never a seat that already stepped down by
 *     declining while it hosted this match; with nobody left the host keeps hosting (P1's rule moved the match only
 *     to a WILLING successor and otherwise stalled the peers for the 30 s report budget);
 *   - the keepalive is the room's exact text frame (`ping` → `pong`), answered here outside the room logic as the
 *     Durable Object's hibernation auto-response does (P1b); `room_ping` envelopes stay answered;
 *   - `room_state` broadcasts are throttled to one per ROOM_STATE_COALESCE_MS with a trailing broadcast carrying the
 *     newest revision (P1b), joins, leaves, disconnects, phase changes and elections at once — the actor's rule;
 *   - the lifecycle rules of 2026-09-30 (docs/MULTIPLAYER-V2.md §13.11): a running host's decline with `unable` and
 *     nobody left ends the match at once; a disconnected seat is reaped after `seatTtlMs` (ROOM_SEAT_DISCONNECT_TTL_MS)
 *     while no match runs, its lease restarting at a match's end; an admin absent past the grace with nobody to migrate
 *     to hands the role to the next seat admitted, at once; an emptied room's next joiner is its admin (`joinRoom`).
 *
 * Rooms live in memory; the policy is the shared `roomPolicy.ts`; nothing here is production code.
 */
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import {
  ROOM_CHAT_HISTORY, ROOM_HOST_DISCONNECT_GRACE_MS, ROOM_KEEPALIVE_REQUEST, ROOM_KEEPALIVE_RESPONSE, ROOM_MATCH_REPORT_STALE_AFTER_MS,
  ROOM_MAX_PAYLOAD_BYTES, ROOM_SEAT_DISCONNECT_TTL_MS, ROOM_SEAT_TOKEN_TTL_MS, ROOM_SIGNAL_MAX_BYTES, ROOM_STATE_COALESCE_MS,
  RoomError, cleanId, isRecord, isRoomTeam, normalizeRoomChat, p2pMatchUrl, parseRoomEnvelope, parseRoomRoute, publicRoomError,
  readRoomMatchReport, readRoomSignalPayload, utf8ByteLength,
} from '../src/mp/room/protocol.ts';
import type { RoomChatEntry, RoomCreateSettings, RoomEnvelope, RoomHostInfo, RoomMatchStartPayload, RoomSnapshot, RoomTeam } from '../src/mp/room/protocol.ts';
import {
  abortStart, applyRoomCommand, createRoom, finishMatch, joinRoom, markMatchPlaying, migrateAdminIfAbsent, planStart, recordMatch, removePlayer,
  serializeRoom, setPlayerConnected,
} from '../src/mp/room/roomPolicy.ts';
import type { RoomStartPlan } from '../src/mp/room/roomPolicy.ts';
import { electHost as electHostRule } from '../src/mp/room/p2pMatchHost.ts';
import { signSeatToken } from '../server/match/seatToken.ts';
import type { SeatClaims } from '../server/match/seatToken.ts';

export function sha256Hex(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

interface Seat {
  socketId: string | null;
  resumeHash: string;
  declined: boolean;
  token: { token: string; seat: number; team: RoomTeam; expiresAt: number; matchId: string } | null;
}

interface RoomState {
  code: string;
  room: RoomSnapshot | null;
  seats: Map<string, Seat>;
  chat: RoomChatEntry[];
  chatSeq: number;
  host: RoomHostInfo;
  hostSecret: string | null;
  hostGrace: ReturnType<typeof setTimeout> | null;
  /** P1's report budget: the host's reports silent past it (counted from the election until the first) migrate with `timeout`. */
  reportStale: ReturnType<typeof setTimeout> | null;
  lastTick: number;
  matchUrl: string;
  plan: RoomStartPlan | null;
  reports: number;
  /** P1b: seats that stepped down from hosting this match by declining while they hosted (a decline never re-elects them). */
  steppedDown: Set<string>;
  /** P1b: the coalesced room_state broadcast (the actor's rule: one per ROOM_STATE_COALESCE_MS, a trailing flush). */
  stateBroadcastAt: number;
  stateFlushPending: boolean;
  stateFlushArmed: boolean;
  /** 2026-09-30: the reap timer of each disconnected seat (restarted at a match's end; a seat of a running match waits). */
  seatLeases: Map<string, ReturnType<typeof setTimeout>>;
  /** 2026-09-30: when the admin's socket went (null while it is connected) — a later admission past the grace migrates at once. */
  adminAbsentAt: number | null;
}

export interface P2pRoomDoubleOptions {
  host?: string;
  port?: number;
  seatSecret: string;
  hostGraceMs?: number;
  /** P1's ROOM_MATCH_REPORT_STALE_AFTER_MS (30 s); the proofs shorten it. */
  reportStaleMs?: number;
  /** ROOM_SEAT_DISCONNECT_TTL_MS (5 min): a disconnected seat's reap while no match runs; the proofs shorten it. */
  seatTtlMs?: number;
  /** A hook the proofs observe (elections, relays, reports). */
  onEvent?: (event: { kind: string; room: string; [key: string]: unknown }) => void;
  now?: () => number;
}

export interface P2pRoomDouble {
  readonly url: string;
  readonly address: AddressInfo;
  readonly rooms: ReadonlyMap<string, RoomState>;
  room(code: string): RoomState | null;
  close(): Promise<void>;
}

export async function createP2pRoomDouble({ host = '127.0.0.1', port = 0, seatSecret, hostGraceMs = ROOM_HOST_DISCONNECT_GRACE_MS, reportStaleMs = ROOM_MATCH_REPORT_STALE_AFTER_MS, seatTtlMs = ROOM_SEAT_DISCONNECT_TTL_MS, onEvent = () => {}, now = () => Date.now() }: P2pRoomDoubleOptions): Promise<P2pRoomDouble> {
  if (typeof seatSecret !== 'string' || seatSecret.length < 16) throw new TypeError('seatSecret must be at least 16 characters');
  const rooms = new Map<string, RoomState>();
  const sockets = new Map<string, { socket: WebSocket; code: string; playerId: string | null }>();
  let socketSeq = 0;
  let closed = false;

  const emit = (kind: string, room: string, fields: Record<string, unknown> = {}): void => { try { onEvent({ kind, room, ...fields }); } catch { /* the observer's own problem */ } };

  const state = (code: string): RoomState => {
    let entry = rooms.get(code);
    if (!entry) {
      entry = { code, room: null, seats: new Map(), chat: [], chatSeq: 0, host: { transport: 'p2p', hostId: null, generation: 0, since: 0 }, hostSecret: null, hostGrace: null, reportStale: null, lastTick: 0, matchUrl: '', plan: null, reports: 0, steppedDown: new Set(), stateBroadcastAt: Number.NEGATIVE_INFINITY, stateFlushPending: false, stateFlushArmed: false, seatLeases: new Map(), adminAbsentAt: null };
      rooms.set(code, entry);
    }
    return entry;
  };

  const send = (socketId: string, message: RoomEnvelope): void => {
    const entry = sockets.get(socketId);
    if (!entry || entry.socket.readyState !== entry.socket.OPEN) return;
    try { entry.socket.send(Buffer.from(JSON.stringify(message), 'utf8'), { binary: true }); } catch { /* closing */ }
  };
  const sendToPlayer = (room: RoomState, playerId: string, message: RoomEnvelope): void => {
    const seat = room.seats.get(playerId);
    if (seat?.socketId) send(seat.socketId, message);
  };
  const broadcast = (room: RoomState, message: RoomEnvelope): void => {
    for (const seat of room.seats.values()) if (seat.socketId) send(seat.socketId, message);
  };
  // P1's snapshot: `host` required, `hostDeclined` on every player (this branch's roomPolicy predates the field: it is added here).
  const snapshot = (room: RoomState): RoomSnapshot => {
    const serialized = serializeRoom(room.room!);
    return { ...serialized, players: serialized.players.map((player) => ({ ...player, hostDeclined: room.seats.get(player.id)?.declined ?? false })), host: { ...room.host } };
  };
  /**
   * P1b: the actor's throttle — an instant change (join, leave, disconnect, phase, election) goes out now; a
   * coalescable one goes out now when the last broadcast is older than ROOM_STATE_COALESCE_MS, else rides one
   * trailing broadcast at the window's end with the newest revision.
   */
  const broadcastState = (room: RoomState, instant = true): void => {
    if (!room.room) return;
    const at = now();
    if (instant || at - room.stateBroadcastAt >= ROOM_STATE_COALESCE_MS) {
      room.stateFlushPending = false;
      room.stateBroadcastAt = at;
      broadcast(room, { type: 'room_state', payload: { room: snapshot(room) } });
      return;
    }
    room.stateFlushPending = true;
    if (room.stateFlushArmed) return;
    room.stateFlushArmed = true;
    const flush = (): void => {
      room.stateFlushArmed = false;
      if (!room.stateFlushPending || !room.room || closed) { room.stateFlushPending = false; return; }
      const wait = room.stateBroadcastAt + ROOM_STATE_COALESCE_MS - now();
      if (wait > 0) { room.stateFlushArmed = true; setTimeout(flush, wait).unref?.(); return; }
      room.stateFlushPending = false;
      room.stateBroadcastAt = now();
      broadcast(room, { type: 'room_state', payload: { room: snapshot(room) } });
    };
    setTimeout(flush, Math.max(0, room.stateBroadcastAt + ROOM_STATE_COALESCE_MS - at)).unref?.();
  };

  // ------------------------------------------------------------ the match: tokens, the host, the start

  const matchStartPayload = (room: RoomState, playerId: string): RoomMatchStartPayload & { hostSecret?: string } => {
    const seat = room.seats.get(playerId)!;
    const token = seat.token!;
    const match = room.room!.match!;
    return {
      matchId: match.id, round: match.round, mapId: match.mapId, mode: room.room!.settings.gameMode, seed: match.seed, seat: token.seat, team: token.team,
      seatToken: token.token, matchUrl: room.matchUrl, hostId: room.host.hostId ?? undefined, expiresAt: token.expiresAt,
      ...(room.host.hostId === playerId && room.hostSecret ? { hostSecret: room.hostSecret } : {}),
    } as RoomMatchStartPayload & { hostSecret?: string };
  };

  /**
   * The election rule as P1 implements it (`electHost` of src/mp/room/p2pMatchHost.ts, applied to this double's snapshot
   * with `hostDeclined` on every player): the admin unless it declined; else the lowest joinedAt connected commander that
   * did not decline; declined commanders host only when no willing one exists (the last resort). P3 (2026-09-28) made the
   * double import P1's function instead of keeping its own — the previous copy excluded declined seats outright, so a
   * decline with no willing successor ended the match here while P1's room keeps the host.
   */
  const electHost = (room: RoomState, exclude: string | null, skip?: ReadonlySet<string>): string | null => electHostRule(snapshot(room), exclude, skip)?.id ?? null;

  const clearHostGrace = (room: RoomState): void => { if (room.hostGrace) { clearTimeout(room.hostGrace); room.hostGrace = null; } };
  const clearReportStale = (room: RoomState): void => { if (room.reportStale) { clearTimeout(room.reportStale); room.reportStale = null; } };
  /** P1: every report (and every election) re-arms the budget; silence past it is a dropped host, whoever is left to elect. */
  const armReportStale = (room: RoomState): void => {
    clearReportStale(room);
    room.reportStale = setTimeout(() => {
      room.reportStale = null;
      const hostId = room.host.hostId;
      if (!hostId || !matchLive(room)) return;
      emit('host_silent', room.code, { hostId });
      changeHost(room, 'timeout', hostId);
    }, reportStaleMs);
    room.reportStale.unref?.();
  };

  const matchLive = (room: RoomState): boolean => !!room.room?.match && (room.room.match.status === 'starting' || room.room.match.status === 'playing');

  // ---- 2026-09-30: disconnected seats are reaped after `seatTtlMs` while no match runs (the actor's ROOM_SEAT_DISCONNECT_TTL_MS)
  const clearSeatLease = (room: RoomState, playerId: string): void => {
    const timer = room.seatLeases.get(playerId);
    if (timer) { clearTimeout(timer); room.seatLeases.delete(playerId); }
  };
  const reapSeat = (room: RoomState, playerId: string): void => {
    const seat = room.seats.get(playerId);
    if (!seat || seat.socketId || !room.room || !room.room.players.some((player) => player.id === playerId)) return;
    const touchedAt = room.room.touchedAt;
    removePlayer(room.room, playerId, now());
    room.room.touchedAt = touchedAt; // housekeeping, not a message
    room.seats.delete(playerId);
    emit('seat_reaped', room.code, { playerId, players: room.room.players.length, admin: room.room.adminId });
    broadcastState(room);
  };
  const armSeatLease = (room: RoomState, playerId: string): void => {
    clearSeatLease(room, playerId);
    const timer = setTimeout(() => {
      room.seatLeases.delete(playerId);
      if (closed || !room.room) return;
      // a seat of a running match is kept for the match; its lease restarts when the match ends
      if (matchLive(room)) return;
      reapSeat(room, playerId);
    }, seatTtlMs);
    timer.unref?.();
    room.seatLeases.set(playerId, timer);
  };
  /** The match is over: every disconnected seat's lease restarts now. */
  const rebaseSeatLeases = (room: RoomState): void => {
    for (const [playerId, seat] of room.seats) if (!seat.socketId) armSeatLease(room, playerId);
  };

  const changeHost = (room: RoomState, reason: 'left' | 'timeout' | 'declined' | 'start', exclude: string | null, unable = false): void => {
    if (!matchLive(room)) return;
    const at = now();
    // P1b's rule: a running host's decline is its departure from hosting — the next candidate takes over at once
    // (willing first, a declined commander as the last resort), never a seat that already stepped down by declining
    // while it hosted this match; with nobody left the host keeps hosting (its `left` and `timeout` elect by the full ladder)
    // — unless it cannot host at all (`unable`, 2026-09-30): the match ends now.
    if (reason === 'declined' && exclude) room.steppedDown.add(exclude);
    const next = electHost(room, exclude, reason === 'declined' ? room.steppedDown : undefined);
    if (reason === 'declined' && !next && !unable) {
      emit('host_decline_kept', room.code, { host: exclude, steppedDown: [...room.steppedDown] });
      return;
    }
    if (!next) {
      finishMatch(room.room!, { status: 'lost', reason: 'match_lost' }, at);
      room.host = { transport: 'p2p', hostId: null, generation: room.host.generation, since: at };
      room.hostSecret = null;
      room.steppedDown.clear();
      for (const seat of room.seats.values()) seat.token = null;
      emit('match_lost', room.code, { reason: reason === 'declined' ? 'host_unable' : reason });
      clearReportStale(room);
      rebaseSeatLeases(room);
      broadcast(room, { type: 'match_status', payload: { matchId: room.room!.match!.id, round: room.room!.match!.round, status: 'lost', verdict: null } });
      broadcastState(room);
      return;
    }
    room.host = { transport: 'p2p', hostId: next, generation: room.host.generation + 1, since: at };
    room.matchUrl = p2pMatchUrl(room.code, room.host.generation);
    armReportStale(room);
    broadcastHostChanged(room, reason);
    broadcastState(room);
  };

  /** `host_changed` to every seated socket, the secret on the host's own copy alone. */
  const broadcastHostChanged = (room: RoomState, reason: 'left' | 'timeout' | 'declined' | 'start'): void => {
    const hostId = room.host.hostId!;
    emit('host_changed', room.code, { hostId, generation: room.host.generation, reason, resumeTick: room.lastTick });
    const payload = { hostId, generation: room.host.generation, resumeTick: room.lastTick, reason };
    for (const [playerId, seat] of room.seats) {
      if (!seat.socketId) continue;
      send(seat.socketId, { type: 'host_changed', payload: playerId === hostId ? { ...payload, hostSecret: room.hostSecret } : { ...payload } });
    }
  };

  const scheduleHostGrace = (room: RoomState): void => {
    clearHostGrace(room);
    room.hostGrace = setTimeout(() => {
      room.hostGrace = null;
      const hostId = room.host.hostId;
      if (!hostId || !matchLive(room)) return;
      const seat = room.seats.get(hostId);
      if (seat?.socketId) return; // back in time
      changeHost(room, 'timeout', hostId);
    }, hostGraceMs);
  };

  const startMatch = (room: RoomState, playerId: string): void => {
    const at = now();
    const seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    const plan = planStart(room.room!, { seed, now: at });
    const matchId = `m${plan.round}-${Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0')}`;
    const hostId = electHost(room, null);
    if (!hostId) { abortStart(room.room!, at); throw new RoomError('match_host_unavailable'); }
    room.hostSecret = sha256Hex(`${seatSecret}:${matchId}`);
    room.host = { transport: 'p2p', hostId, generation: room.host.generation + 1, since: at };
    room.matchUrl = p2pMatchUrl(room.code, room.host.generation);
    room.plan = plan;
    room.lastTick = 0;
    room.steppedDown.clear();
    recordMatch(room.room!, { id: matchId, round: plan.round, mapId: plan.mapId, seed: plan.seed, startedAt: at }, at);
    const expiresAt = at + ROOM_SEAT_TOKEN_TTL_MS;
    for (const seat of plan.seats) {
      const claims: SeatClaims = { v: 1, roomId: room.code, seat: seat.seat, playerId: seat.playerId, name: seat.name.slice(0, 32) || seat.playerId, team: seat.team, specId: seat.specId, iat: at, exp: expiresAt };
      const entry = room.seats.get(seat.playerId);
      if (entry) entry.token = { token: signSeatToken(room.hostSecret, claims), seat: seat.seat, team: seat.team, expiresAt, matchId };
    }
    emit('match_start', room.code, { matchId, hostId, generation: room.host.generation, seats: plan.seats.length, bots: plan.bots.length, by: playerId });
    armReportStale(room);
    broadcastState(room);
    for (const [id, seat] of room.seats) if (seat.token) sendToPlayer(room, id, { type: 'match_start', payload: { ...matchStartPayload(room, id) } });
    // P1: the election that named the host follows the per-seat match_starts (reason 'start', the URL's generation).
    broadcastHostChanged(room, 'start');
  };

  // ------------------------------------------------------------ messages

  const handle = (socketId: string, text: string): void => {
    const entry = sockets.get(socketId);
    if (!entry) return;
    let message: RoomEnvelope | null = null;
    const room = state(entry.code);
    try {
      message = parseRoomEnvelope(text);
      const requestId = message.requestId;
      const reply = (type: string, payload: Record<string, unknown>) => send(socketId, { type, ...(requestId ? { requestId } : {}), payload });
      const at = now();
      switch (message.type) {
        case 'room_create':
        case 'room_join': {
          if (entry.playerId) throw new RoomError('already_joined');
          const payload = message.payload;
          if (!isRecord(payload.player)) throw new RoomError('invalid_player');
          const playerId = cleanId(payload.player.id);
          const name = String(payload.player.name ?? '');
          const resumeToken = typeof payload.resumeToken === 'string' ? payload.resumeToken : '';
          const nextToken = typeof payload.nextResumeToken === 'string' ? payload.nextResumeToken : resumeToken;
          const selection = isRecord(payload.selection) ? { specId: typeof payload.selection.specId === 'string' ? payload.selection.specId : null, equipment: Array.isArray(payload.selection.equipment) ? payload.selection.equipment.map(String) : [], camo: typeof payload.selection.camo === 'string' ? payload.selection.camo : 'factory' } : null;
          const existing = room.seats.get(playerId);
          if (existing && room.room?.players.some((player) => player.id === playerId)) {
            if (![resumeToken, nextToken].some((proof) => sha256Hex(proof) === existing.resumeHash)) throw new RoomError('resume_denied');
            if (existing.socketId && existing.socketId !== socketId) { send(existing.socketId, { type: 'error', payload: { code: 'resume_denied' } }); sockets.get(existing.socketId)?.socket.close(1000, 'resume_denied'); }
          } else if (message.type === 'room_create') {
            if (room.room) throw new RoomError('room_code_exhausted');
            room.room = createRoom({ roomCode: room.code, mode: payload.mode === 'lan' ? 'lan' : 'private', creator: { id: playerId, name }, selection, settings: isRecord(payload.settings) ? payload.settings as RoomCreateSettings : null, now: at });
          } else {
            if (!room.room) throw new RoomError('room_not_found');
            joinRoom(room.room, { player: { id: playerId, name }, selection, team: isRoomTeam(payload.team) ? payload.team : null, now: at });
          }
          const seat: Seat = existing ?? { socketId: null, resumeHash: '', declined: false, token: null };
          seat.resumeHash = sha256Hex(nextToken);
          seat.socketId = socketId;
          room.seats.set(playerId, seat);
          entry.playerId = playerId;
          setPlayerConnected(room.room!, playerId, true, at);
          clearSeatLease(room, playerId);
          if (room.host.hostId === playerId) clearHostGrace(room);
          // 2026-09-30: the admin back clears its absence; another seat admitted past the admin's grace takes the role at once
          if (room.room!.adminId === playerId) room.adminAbsentAt = null;
          else if (room.adminAbsentAt !== null && at - room.adminAbsentAt >= hostGraceMs && migrateAdminIfAbsent(room.room!, at)) {
            room.adminAbsentAt = null;
            emit('admin_migrated', room.code, { admin: room.room!.adminId, on: 'admission' });
          }
          const me = room.room!.players.find((player) => player.id === playerId)!;
          reply(message.type === 'room_create' ? 'room_created' : 'room_joined', { room: snapshot(room), playerId, seat: me.seat, chat: room.chat.slice(-ROOM_CHAT_HISTORY), region: 'double' });
          if (seat.token && matchLive(room) && seat.token.matchId === room.room!.match!.id) sendToPlayer(room, playerId, { type: 'match_start', payload: { ...matchStartPayload(room, playerId) } });
          broadcastState(room);
          return;
        }
        case 'room_ping':
          reply('room_pong', { now: at });
          return;
        case 'room_chat': {
          const playerId = requirePlayer(entry, room);
          const chatText = normalizeRoomChat(message.payload.text);
          if (!chatText) throw new RoomError('chat_rejected');
          const player = room.room!.players.find((candidate) => candidate.id === playerId)!;
          const chat: RoomChatEntry = { id: ++room.chatSeq, playerId, name: player.name, team: player.team, text: chatText, at };
          room.chat.push(chat);
          broadcast(room, { type: 'room_chat', payload: { entry: chat } });
          reply('room_ack', { id: chat.id });
          return;
        }
        case 'room_leave': {
          const playerId = requirePlayer(entry, room);
          const wasHost = room.host.hostId === playerId;
          removePlayer(room.room!, playerId, at);
          room.seats.delete(playerId);
          clearSeatLease(room, playerId);
          entry.playerId = null;
          reply('room_ack', { left: true });
          entry.socket.close(1000, 'client_leave');
          emit('player_left', room.code, { playerId });
          if (wasHost) changeHost(room, 'left', playerId);
          broadcastState(room);
          return;
        }
        case 'room_signal': {
          // P1's order: not_in_room, invalid_payload, signal_phase, signal_generation, signal_target, signal_size.
          const playerId = requirePlayer(entry, room);
          const payload = readRoomSignalPayload(message.payload);
          const refuse = (code: 'signal_phase' | 'signal_generation' | 'signal_target' | 'signal_size'): never => {
            emit('signal_refused', room.code, { from: playerId, to: payload.to, signal: payload.kind, code });
            throw new RoomError(code);
          };
          if (!matchLive(room) || !room.host.hostId) refuse('signal_phase');
          if (payload.generation !== room.host.generation) refuse('signal_generation');
          const target = room.seats.get(payload.to);
          const hostId = room.host.hostId;
          if (payload.to === playerId || !target || !target.socketId || !room.room!.players.some((player) => player.id === payload.to) || (playerId !== hostId && payload.to !== hostId)) refuse('signal_target');
          const relayed = { ...payload, from: playerId };
          if (utf8ByteLength(JSON.stringify(relayed)) > ROOM_SIGNAL_MAX_BYTES) refuse('signal_size');
          emit('signal', room.code, { from: playerId, to: payload.to, signal: payload.kind, generation: payload.generation });
          sendToPlayer(room, payload.to, { type: 'room_signal', payload: relayed });
          if (requestId) reply('room_ack', { relayed: true });
          return;
        }
        case 'room_command': {
          const playerId = requirePlayer(entry, room);
          const command = message.payload.command;
          if (!isRecord(command)) throw new RoomError('invalid_command');
          if (command.type === 'match_report') {
            // P1: only the host of the current generation (host_only); an unknown or finished match is invalid_command.
            const parsed = readRoomMatchReport(command);
            if (!matchLive(room) || parsed.matchId !== room.room!.match!.id) throw new RoomError('invalid_command');
            if (playerId !== room.host.hostId || parsed.generation !== room.host.generation) throw new RoomError('host_only');
            room.lastTick = Math.max(room.lastTick, parsed.tick);
            room.reports++;
            armReportStale(room);
            emit('match_report', room.code, { from: playerId, tick: parsed.tick, phase: parsed.phase, verdict: parsed.verdict, generation: parsed.generation });
            if (parsed.phase === 'playing' && markMatchPlaying(room.room!, at)) broadcastState(room);
            if (parsed.phase === 'ended') {
              const match = room.room!.match!;
              const verdict = parsed.verdict;
              if (verdict) finishMatch(room.room!, { status: 'ended', result: verdict.result, reason: verdict.reason }, at);
              else finishMatch(room.room!, { status: 'lost', reason: 'host_ended' }, at);
              for (const seat of room.seats.values()) seat.token = null;
              room.hostSecret = null;
              room.host = { ...room.host, hostId: null, since: at };
              room.steppedDown.clear();
              clearHostGrace(room);
              clearReportStale(room);
              rebaseSeatLeases(room);
              emit('match_ended', room.code, { result: verdict?.result ?? null, reason: verdict?.reason ?? 'host_ended' });
              broadcast(room, { type: 'match_status', payload: { matchId: match.id, round: match.round, status: verdict ? 'ended' : 'lost', verdict: verdict ? { result: verdict.result, reason: verdict.reason } : null } });
              broadcastState(room);
            }
            reply('room_ack', { revision: room.room!.revision });
            return;
          }
          if (command.type === 'host_decline') {
            const seat = room.seats.get(playerId)!;
            seat.declined = command.declined !== false;
            emit('host_decline', room.code, { playerId, declined: seat.declined });
            reply('room_ack', { ok: true });
            // P1 broadcasts the room after every command: `hostDeclined` reaches every seat (P3, 2026-09-28); coalescable (P1b).
            broadcastState(room, false);
            if (seat.declined && room.host.hostId === playerId && matchLive(room)) changeHost(room, 'declined', playerId, command.unable === true);
            return;
          }
          if (command.type === 'start') {
            applyRoomCommand(room.room!, playerId, command, at, undefined);
            startMatch(room, playerId);
            reply('room_ack', { matchId: room.room!.match!.id });
            return;
          }
          const kicked = command.type === 'kick' ? cleanId(command.playerId, 'unknown_player') : null;
          applyRoomCommand(room.room!, playerId, command, at, undefined);
          if (kicked) {
            const seat = room.seats.get(kicked);
            room.seats.delete(kicked);
            clearSeatLease(room, kicked);
            if (seat?.socketId) { send(seat.socketId, { type: 'room_closed', payload: { reason: 'kicked' } }); sockets.get(seat.socketId)?.socket.close(1000, 'kicked'); }
          }
          reply('room_ack', { revision: room.room!.revision });
          // a kick is a leave (instant); every other command's change is coalescable (P1b)
          broadcastState(room, kicked !== null);
          return;
        }
        default:
          throw new RoomError('unknown_message');
      }
    } catch (error) {
      if (!(error instanceof RoomError)) emit('error', room.code, { error: String(error) });
      send(socketId, publicRoomError(error, message?.requestId));
    }
  };

  function requirePlayer(entry: { playerId: string | null }, room: RoomState): string {
    if (!entry.playerId || !room.room || !room.room.players.some((player) => player.id === entry.playerId)) throw new RoomError('not_in_room');
    return entry.playerId;
  }

  const handleClose = (socketId: string): void => {
    const entry = sockets.get(socketId);
    if (!entry) return;
    sockets.delete(socketId);
    const room = rooms.get(entry.code);
    if (!room || !entry.playerId) return;
    const seat = room.seats.get(entry.playerId);
    if (seat && seat.socketId === socketId) {
      seat.socketId = null;
      if (room.room?.players.some((player) => player.id === entry.playerId)) {
        setPlayerConnected(room.room, entry.playerId, false, now());
        armSeatLease(room, entry.playerId);
        if (room.host.hostId === entry.playerId && matchLive(room)) { emit('host_absent', room.code, { hostId: entry.playerId }); scheduleHostGrace(room); }
        if (room.room.adminId === entry.playerId) {
          room.adminAbsentAt = now();
          setTimeout(() => { if (room.room && migrateAdminIfAbsent(room.room, now())) { room.adminAbsentAt = null; broadcastState(room); } }, hostGraceMs).unref?.();
        }
        broadcastState(room);
      }
    }
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: ROOM_MAX_PAYLOAD_BYTES, perMessageDeflate: false });
  wss.on('connection', (socket: WebSocket, request: http.IncomingMessage) => {
    const route = parseRoomRoute((request.url || '').split('?', 1)[0]!);
    if (!route) { socket.close(1008, 'invalid_room_route'); return; }
    const socketId = `s${++socketSeq}`;
    sockets.set(socketId, { socket, code: route.code, playerId: null });
    socket.on('message', (raw: RawData, isBinary: boolean) => {
      const buffer = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer);
      const text = buffer.toString('utf8');
      // P1b: the keepalive frame is answered outside the room logic, as the Durable Object's auto-response does.
      if (!isBinary && text === ROOM_KEEPALIVE_REQUEST) {
        emit('keepalive', route.code, { socketId });
        try { socket.send(ROOM_KEEPALIVE_RESPONSE); } catch { /* closing */ }
        return;
      }
      handle(socketId, text);
    });
    socket.once('close', () => handleClose(socketId));
    socket.on('error', () => { /* close follows */ });
  });

  const server = http.createServer((request, response) => {
    const path = (request.url || '').split('?', 1)[0]!;
    if (request.method === 'GET' && path === '/rooms/healthz') {
      const body = JSON.stringify({ ok: !closed, service: 'cot-rooms', backend: 'p2p-double', rooms: rooms.size });
      response.writeHead(closed ? 503 : 200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
      response.end(body);
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end('{"error":"not_found"}');
  });
  server.on('upgrade', (request, socket, head) => {
    const route = parseRoomRoute((request.url || '').split('?', 1)[0]!);
    if (!route || route.match || closed) { socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
    wss.handleUpgrade(request, socket, head, (websocket) => wss.emit('connection', websocket, request));
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, host, () => { server.off('error', reject); resolve(); }); });
  const address = server.address() as AddressInfo;
  return {
    url: `ws://${host}:${address.port}`,
    address,
    rooms,
    room: (code) => rooms.get(code) ?? null,
    async close() {
      closed = true;
      for (const room of rooms.values()) { clearHostGrace(room); clearReportStale(room); for (const playerId of [...room.seatLeases.keys()]) clearSeatLease(room, playerId); }
      for (const entry of sockets.values()) { try { entry.socket.close(1001, 'server_drain'); } catch { /* closed */ } }
      const deadline = Date.now() + 1000;
      while (wss.clients.size > 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
      for (const socket of wss.clients) { try { socket.terminate(); } catch { /* gone */ } }
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
