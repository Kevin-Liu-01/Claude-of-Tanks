/**
 * Multiplayer v2 room protocol (charter §3 "Room = Durable Object", §5).
 *
 * One JSON vocabulary shared by the Room Durable Object (`cloudflare/rooms`),
 * the in-process LAN/test room service (`server/rooms`) and the browser
 * `RoomClient` (`src/mp/room/roomClient.ts`), so a client cannot tell the
 * hosts apart. Every frame is one WebSocket message carrying a UTF-8 JSON
 * envelope `{ type, requestId?, payload }` (text or binary — the client sends
 * binary so it can ride the v2 transport contract). Pure TypeScript: no DOM,
 * no Node built-ins.
 */
import type { TeamArrangement } from '../../sim/matchRuleset.ts';

export const ROOM_PROTOCOL_VERSION = 2;

/** Capacity (charter R1): 14v14 plus spectators in one room. */
export const ROOM_MAX_PLAYERS = 28;
export const ROOM_MAX_SPECTATORS = 8;
export const ROOM_MAX_TEAM_SIZE = 14;
export const ROOM_MIN_TEAM_SIZE = 1;
/** Co-op modes (Horde, Frontline) keep the sim's allied cap. */
export const ROOM_MAX_COOP_PLAYERS = 7;
export const ROOM_MAX_SEATS = ROOM_MAX_PLAYERS + ROOM_MAX_SPECTATORS;

/** Room lifetime: 24 h after the last message (charter §5). */
export const ROOM_IDLE_TTL_MS = 24 * 60 * 60 * 1000;
/** Admin migrates this long after the admin's socket dropped without an explicit leave. */
export const ROOM_ADMIN_DISCONNECT_GRACE_MS = 30_000;
/**
 * Peer-to-peer matches (owner 2026-09-28): the admin's browser hosts the match; when its room socket is absent this
 * long the room elects the next connected commander as host (shorter than the admin grace: peers are stalled meanwhile).
 */
export const ROOM_HOST_DISCONNECT_GRACE_MS = 8_000;
/** One WebRTC signal (offer / answer / candidate) relayed between two seats: SDP fits comfortably. */
export const ROOM_SIGNAL_MAX_BYTES = 8 * 1024;
/** The browser-hosted authority emits a keyframe snapshot at least this often so any peer can become the host. */
export const ROOM_MATCH_KEYFRAME_INTERVAL_MS = 2_000;
/** The room polls the match host at this cadence while a match runs. */
export const ROOM_MATCH_POLL_MS = 10_000;
/** A match that has not answered two polls in a row is lost. */
export const ROOM_MATCH_LOST_AFTER_POLLS = 2;
/** Seat tokens issued at start are valid this long (reconnects through the whole match). */
export const ROOM_SEAT_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
/** Bounded chat history the room replays to a joining socket. */
export const ROOM_CHAT_HISTORY = 48;
export const ROOM_CHAT_MAX_CHARS = 240;
/** A socket that has not authenticated within this time is retired. */
export const ROOM_UNAUTHENTICATED_TIMEOUT_MS = 15_000;
/** Message rate ceiling per socket (a 10 s window). */
export const ROOM_RATE_WINDOW_MS = 10_000;
export const ROOM_RATE_MAX_MESSAGES = 120;
export const ROOM_MAX_PAYLOAD_BYTES = 32 * 1024;
export const ROOM_MAX_NAME_CHARS = 24;
export const ROOM_MAX_EQUIPMENT = 3;
/** `region` in the admission reply (`room_created` / `room_joined`): where the host says it runs, for the status surface. */
export const ROOM_MAX_REGION_CHARS = 32;

export const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;
export const ROOM_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
export const ROOM_SPEC_RE = /^[a-z0-9_-]{1,64}$/;
export const ROOM_CAMO_RE = /^[a-z0-9_-]{1,32}$/;
export const ROOM_EQUIPMENT_RE = /^[a-z0-9_-]{1,32}$/;
export const ROOM_MAP_RE = /^[a-z0-9_-]{1,64}$/;
export const ROOM_CAMPAIGN_RE = /^[a-z][a-z0-9_]{1,40}$/;
/** Resume capabilities are 32 random bytes, hex. Only their SHA-256 is ever stored. */
export const ROOM_RESUME_TOKEN_RE = /^[a-f0-9]{64}$/;

export type RoomMode = 'private' | 'lan';
export type RoomTeam = 'alpha' | 'bravo' | 'spectator';
export type RoomPhase = 'waiting' | 'starting' | 'playing';
export type RoomMatchStatus = 'starting' | 'playing' | 'ended' | 'lost';
export type RoomResult = 'alpha' | 'bravo' | 'draw';

export interface RoomPlayer {
  id: string;
  name: string;
  team: RoomTeam;
  /** Stable seat ordinal (0..ROOM_MAX_SEATS-1) for the life of the seat. */
  seat: number;
  specId: string | null;
  equipment: string[];
  camo: string;
  ready: boolean;
  connected: boolean;
  isAdmin: boolean;
  /** Seniority ordinal (monotonic per room): admin migrates to the lowest connected one. */
  joinedAt: number;
  /** P1 rooms lane (2026-09-28): the seat asked not to host p2p matches (`host_decline`); it hosts only as the last commander. */
  hostDeclined: boolean;
}

export interface RoomSettings {
  gameMode: string;
  mapId: string;
  teamSize: number;
  maxSpectators: number;
  /** Empty team slots up to teamSize are filled with authority bots at start. */
  botsFill: boolean;
  allowTeamSwitch: boolean;
  locked: boolean;
  arrangement: TeamArrangement | null;
  campaignOperationId: string | null;
}

export interface RoomMatchInfo {
  id: string;
  round: number;
  status: RoomMatchStatus;
  mapId: string;
  seed: number;
  startedAt: number;
  endedAt: number | null;
  verdict: { result: RoomResult; reason: string } | null;
}

export interface RoomLastResult {
  round: number;
  result: RoomResult | null;
  reason: string | null;
}

/** The whole room as every participant sees it. Never carries capabilities or tokens. */
export interface RoomSnapshot {
  v: typeof ROOM_PROTOCOL_VERSION;
  roomCode: string;
  mode: RoomMode;
  phase: RoomPhase;
  adminId: string;
  revision: number;
  round: number;
  settings: RoomSettings;
  players: RoomPlayer[];
  match: RoomMatchInfo | null;
  lastResult: RoomLastResult | null;
  /**
   * Who runs the authority (peer-to-peer: a seated commander's browser; service: a dedicated match service).
   * Required since the P1 rooms lane (2026-09-28); `readRoomSnapshot` normalizes a snapshot from an older host.
   */
  host: RoomHostInfo;
  createdAt: number;
  touchedAt: number;
}

/** The match host as every participant sees it — `generation` increments on every election (host migration). */
export interface RoomHostInfo {
  transport: 'p2p' | 'service';
  /** The hosting player's id (p2p) or null (service / no match). */
  hostId: string | null;
  generation: number;
  /** Wall clock of the current election. */
  since: number;
}

export interface RoomChatEntry {
  id: number;
  playerId: string;
  name: string;
  team: RoomTeam;
  text: string;
  at: number;
}

export interface RoomSelection {
  specId: string | null;
  equipment: string[];
  camo: string;
}

/** Settings the creator may seed; everything else takes the defaults. */
export interface RoomCreateSettings {
  gameMode?: string;
  mapId?: string;
  teamSize?: number;
  maxSpectators?: number;
  botsFill?: boolean;
  allowTeamSwitch?: boolean;
  arrangement?: TeamArrangement | null;
  campaignOperationId?: string | null;
}

// ------------------------------------------------------------ envelopes

export interface RoomEnvelope {
  type: string;
  requestId?: string;
  payload: Record<string, unknown>;
}

/** Client → room message types. */
export const ROOM_CLIENT_MESSAGE = Object.freeze({
  CREATE: 'room_create',
  JOIN: 'room_join',
  COMMAND: 'room_command',
  CHAT: 'room_chat',
  LEAVE: 'room_leave',
  PING: 'room_ping',
  /** WebRTC signaling between two seats of a p2p match; the room relays it as `room_signal` with `from` added. */
  SIGNAL: 'room_signal',
} as const);

/**
 * Room → client message types. `room_created` / `room_joined` reply with
 * `{ room, playerId, seat, chat, region? }` — `region` (≤ ROOM_MAX_REGION_CHARS) is
 * optional and names where the host runs (`lan` for the local helper).
 */
export const ROOM_SERVER_MESSAGE = Object.freeze({
  CREATED: 'room_created',
  JOINED: 'room_joined',
  STATE: 'room_state',
  CHAT: 'room_chat',
  MATCH_START: 'match_start',
  MATCH_STATUS: 'match_status',
  ACK: 'room_ack',
  ERROR: 'error',
  PONG: 'room_pong',
  CLOSED: 'room_closed',
  /** A relayed WebRTC signal (`RoomSignalPayload` plus `from`). */
  SIGNAL: 'room_signal',
  /** The room elected a new match host (`RoomHostChangedPayload`); peers reconnect to `hostId`. */
  HOST_CHANGED: 'host_changed',
} as const);

/**
 * Peer-to-peer signaling (owner 2026-09-28). A seat sends `room_signal` naming the target seat; the room checks both
 * seats are in the room, the sender is the host or the target is, the match is starting or playing, and the payload
 * is under ROOM_SIGNAL_MAX_BYTES, then relays it verbatim with `from`. The room never parses SDP.
 */
export interface RoomSignalPayload {
  to: string;
  /** The host generation the signal belongs to; a stale generation is dropped. */
  generation: number;
  kind: 'offer' | 'answer' | 'candidate';
  sdp?: string;
  candidate?: { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
}

/** `host_changed`: the new host boots the authority from its last keyframe; every peer opens a new data channel to it. */
export interface RoomHostChangedPayload {
  hostId: string;
  generation: number;
  /** The authority tick the new host resumes from (the keyframe it holds), 0 for a fresh match. */
  resumeTick: number;
  reason: 'left' | 'timeout' | 'declined' | 'start';
  /** P1 rooms lane (2026-09-28): the per-match host secret — present only on the elected host's own copy. */
  hostSecret?: string;
}

/** The `match_start` payload one seat receives: its own token, never another seat's. */
export interface RoomMatchStartPayload {
  matchId: string;
  round: number;
  mapId: string;
  mode: string;
  seed: number;
  seat: number;
  team: RoomTeam;
  /** HMAC seat token for the match service (`server/match/seatToken.ts`). */
  seatToken: string;
  /**
   * Absolute or endpoint-relative URL of the `/match` WebSocket the client connects to — or, for a peer-to-peer
   * match, `rtc://<roomId>/<generation>`: the client opens a WebRTC data channel to `hostId` through `room_signal`.
   */
  matchUrl: string;
  /** Peer-to-peer matches: the hosting seat's player id (the host receives its own id and runs the authority). */
  hostId?: string;
  /**
   * P1 rooms lane (2026-09-28): the per-match host secret every seat token of THIS match is signed with — present only
   * in the host's own payload; the host verifies its peers' tokens with it and never holds the room's secret.
   */
  hostSecret?: string;
  /** Wall-clock expiry of the seat token. */
  expiresAt: number;
}

export interface RoomMatchStatusPayload {
  matchId: string;
  round: number;
  status: RoomMatchStatus;
  verdict: { result: RoomResult; reason: string } | null;
}

/** Error codes the room sends. Free text never crosses; the client maps codes to copy. */
export const ROOM_ERROR_CODES = Object.freeze([
  'invalid_payload', 'invalid_room_code', 'invalid_player', 'invalid_resume_token', 'resume_denied',
  'already_joined', 'room_not_found', 'room_full', 'spectators_full', 'team_full', 'room_locked',
  'room_code_exhausted', 'not_in_room', 'unknown_message', 'admin_only', 'players_not_ready',
  'vehicle_required', 'vehicle_locked', 'vehicle_not_allowed', 'camo_not_allowed', 'map_not_allowed',
  'invalid_command', 'invalid_team', 'invalid_team_size', 'team_size_too_small', 'team_switch_disabled',
  'cooperative_team', 'coop_capacity', 'invalid_name', 'invalid_vehicle', 'invalid_camo',
  'invalid_arrangement', 'lobby_locked', 'unknown_player', 'match_host_unavailable', 'match_running',
  'chat_rejected', 'rate_limit', 'expired', 'kicked', 'internal',
  // P1 rooms lane (2026-09-28): a refused room_signal (target, generation, size, phase) and a match_report from a seat
  // that is not the host of the current generation.
  'signal_target', 'signal_generation', 'signal_size', 'signal_phase', 'host_only',
] as const);
export type RoomErrorCode = typeof ROOM_ERROR_CODES[number];
const ROOM_ERROR_SET: ReadonlySet<string> = new Set(ROOM_ERROR_CODES);

export class RoomError extends Error {
  readonly code: RoomErrorCode;
  constructor(code: RoomErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'RoomError';
    this.code = code;
  }
}

export function isRoomErrorCode(value: unknown): value is RoomErrorCode {
  return typeof value === 'string' && ROOM_ERROR_SET.has(value);
}

export function publicRoomError(error: unknown, requestId?: string): RoomEnvelope {
  const code = error instanceof RoomError ? error.code
    : error && typeof error === 'object' && isRoomErrorCode((error as { code?: unknown }).code)
      ? (error as { code: RoomErrorCode }).code : 'internal';
  return { type: ROOM_SERVER_MESSAGE.ERROR, ...(requestId ? { requestId } : {}), payload: { code } };
}

// ------------------------------------------------------------ validation helpers

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizeRoomCode(value: unknown): string {
  return String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Six characters from an unambiguous alphabet; `random` in [0, 1). */
export function randomRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let index = 0; index < 6; index++) code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length) % CODE_ALPHABET.length];
  return code;
}

export function normalizePlayerName(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, ROOM_MAX_NAME_CHARS);
}

export function cleanId(value: unknown, code: RoomErrorCode = 'invalid_player'): string {
  const id = String(value ?? '').trim();
  if (!ROOM_ID_RE.test(id)) throw new RoomError(code);
  return id;
}

export function cleanEquipment(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const clean: string[] = [];
  for (const entry of value) {
    const id = String(entry ?? '').trim();
    if (!ROOM_EQUIPMENT_RE.test(id) || clean.includes(id)) continue;
    clean.push(id);
    if (clean.length === ROOM_MAX_EQUIPMENT) break;
  }
  return clean;
}

export function parseRoomEnvelope(text: string): RoomEnvelope {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new RoomError('invalid_payload'); }
  if (!isRecord(value) || typeof value.type !== 'string' || value.type.length > 32 ||
      (value.requestId != null && (typeof value.requestId !== 'string' || value.requestId.length > 128))) {
    throw new RoomError('invalid_payload');
  }
  return {
    type: value.type,
    ...(typeof value.requestId === 'string' ? { requestId: value.requestId } : {}),
    payload: isRecord(value.payload) ? value.payload : {},
  };
}

const TEAM_SET: ReadonlySet<string> = new Set(['alpha', 'bravo', 'spectator']);
export function isRoomTeam(value: unknown): value is RoomTeam {
  return typeof value === 'string' && TEAM_SET.has(value);
}

const PHASE_SET: ReadonlySet<string> = new Set(['waiting', 'starting', 'playing']);
const MATCH_STATUS_SET: ReadonlySet<string> = new Set(['starting', 'playing', 'ended', 'lost']);
const RESULT_SET: ReadonlySet<string> = new Set(['alpha', 'bravo', 'draw']);

function isSafeUnsigned(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isRoomPlayer(value: unknown): value is RoomPlayer {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && ROOM_ID_RE.test(value.id) &&
    typeof value.name === 'string' && value.name.length >= 1 && value.name.length <= ROOM_MAX_NAME_CHARS &&
    isRoomTeam(value.team) &&
    isSafeUnsigned(value.seat) && value.seat < ROOM_MAX_SEATS &&
    (value.specId === null || (typeof value.specId === 'string' && ROOM_SPEC_RE.test(value.specId))) &&
    Array.isArray(value.equipment) && value.equipment.every((entry) => typeof entry === 'string') &&
    typeof value.camo === 'string' && typeof value.ready === 'boolean' && typeof value.connected === 'boolean' &&
    typeof value.isAdmin === 'boolean' && isSafeUnsigned(value.joinedAt) &&
    (value.hostDeclined === undefined || typeof value.hostDeclined === 'boolean');
}

function isRoomSettings(value: unknown): value is RoomSettings {
  if (!isRecord(value)) return false;
  return typeof value.gameMode === 'string' && typeof value.mapId === 'string' &&
    Number.isSafeInteger(value.teamSize) && (value.teamSize as number) >= ROOM_MIN_TEAM_SIZE && (value.teamSize as number) <= ROOM_MAX_TEAM_SIZE &&
    isSafeUnsigned(value.maxSpectators) && value.maxSpectators <= ROOM_MAX_SPECTATORS &&
    typeof value.botsFill === 'boolean' && typeof value.allowTeamSwitch === 'boolean' && typeof value.locked === 'boolean' &&
    (value.arrangement === null || isRecord(value.arrangement)) &&
    (value.campaignOperationId === null || (typeof value.campaignOperationId === 'string' && ROOM_CAMPAIGN_RE.test(value.campaignOperationId)));
}

function isRoomMatchInfo(value: unknown): value is RoomMatchInfo {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && value.id.length > 0 && isSafeUnsigned(value.round) &&
    typeof value.status === 'string' && MATCH_STATUS_SET.has(value.status) &&
    typeof value.mapId === 'string' && isSafeUnsigned(value.seed) && isSafeUnsigned(value.startedAt) &&
    (value.endedAt === null || isSafeUnsigned(value.endedAt)) &&
    (value.verdict === null || (isRecord(value.verdict) && typeof value.verdict.result === 'string' &&
      RESULT_SET.has(value.verdict.result) && typeof value.verdict.reason === 'string'));
}

/** Validate a complete snapshot before it reaches the UI or a session owner. */
export function readRoomSnapshot(value: unknown): RoomSnapshot {
  if (!isRecord(value) || value.v !== ROOM_PROTOCOL_VERSION) throw new RoomError('invalid_payload', 'room snapshot version');
  const players = value.players;
  const host = value.host;
  if (typeof value.roomCode !== 'string' || !ROOM_CODE_RE.test(value.roomCode) ||
      (value.mode !== 'private' && value.mode !== 'lan') ||
      typeof value.phase !== 'string' || !PHASE_SET.has(value.phase) ||
      typeof value.adminId !== 'string' || !isSafeUnsigned(value.revision) || !isSafeUnsigned(value.round) ||
      !isRoomSettings(value.settings) || !Array.isArray(players) || !players.every(isRoomPlayer) ||
      (value.match !== null && !isRoomMatchInfo(value.match)) ||
      (value.lastResult !== null && !(isRecord(value.lastResult) && isSafeUnsigned(value.lastResult.round) &&
        (value.lastResult.result === null || (typeof value.lastResult.result === 'string' && RESULT_SET.has(value.lastResult.result))) &&
        (value.lastResult.reason === null || typeof value.lastResult.reason === 'string'))) ||
      !isSafeUnsigned(value.createdAt) || !isSafeUnsigned(value.touchedAt) ||
      (host !== undefined && !isRoomHostInfo(host))) {
    throw new RoomError('invalid_payload', 'room snapshot fields');
  }
  const ids = new Set(players.map((player) => player.id));
  if (ids.size !== players.length || (players.length > 0 && !ids.has(value.adminId))) {
    throw new RoomError('invalid_payload', 'room snapshot identity');
  }
  if (host !== undefined && host.hostId !== null && !ids.has(host.hostId)) {
    throw new RoomError('invalid_payload', 'room snapshot host');
  }
  // P1 rooms lane (2026-09-28): every host this lane ships sends `host` and `hostDeclined`; a snapshot from an older
  // host (or a fixture written before them) reads as "no election yet, nobody declined" so the type stays required.
  if (host === undefined) value.host = noElection(value.createdAt);
  for (const player of players) (player as { hostDeclined?: boolean }).hostDeclined ??= false;
  return value as unknown as RoomSnapshot;
}

export function isRoomMatchStartPayload(value: unknown): value is RoomMatchStartPayload {
  if (!isRecord(value)) return false;
  return typeof value.matchId === 'string' && isSafeUnsigned(value.round) && typeof value.mapId === 'string' &&
    typeof value.mode === 'string' && isSafeUnsigned(value.seed) && isSafeUnsigned(value.seat) && isRoomTeam(value.team) &&
    typeof value.seatToken === 'string' && value.seatToken.length > 0 && typeof value.matchUrl === 'string' &&
    value.matchUrl.length > 0 && isSafeUnsigned(value.expiresAt);
}

export function isRoomMatchStatusPayload(value: unknown): value is RoomMatchStatusPayload {
  if (!isRecord(value)) return false;
  return typeof value.matchId === 'string' && isSafeUnsigned(value.round) && typeof value.status === 'string' &&
    MATCH_STATUS_SET.has(value.status) && (value.verdict === null || (isRecord(value.verdict) &&
      typeof value.verdict.result === 'string' && RESULT_SET.has(value.verdict.result) && typeof value.verdict.reason === 'string'));
}

export function isRoomChatEntry(value: unknown): value is RoomChatEntry {
  if (!isRecord(value)) return false;
  return isSafeUnsigned(value.id) && typeof value.playerId === 'string' && typeof value.name === 'string' &&
    isRoomTeam(value.team) && typeof value.text === 'string' && value.text.length <= ROOM_CHAT_MAX_CHARS && isSafeUnsigned(value.at);
}

/** Chat normalization shared by every host (mirrors server/match/chat.ts without importing Node). */
export function normalizeRoomChat(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let text = '';
  for (const char of raw.normalize('NFC')) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f) || code === 0x200b || code === 0x2028 || code === 0x2029) continue;
    text += char;
    if (text.length >= ROOM_CHAT_MAX_CHARS) break;
  }
  return text.trim().replace(/\s+/g, ' ');
}

/** The default endpoint paths every host serves. */
export function roomSocketPath(roomCode: string): string {
  return `/rooms/${roomCode}`;
}

export function matchSocketPath(roomCode: string): string {
  return `/rooms/${roomCode}/match`;
}

/** `/rooms/CODE` → CODE; `/rooms/CODE/match` → { code, match: true }; anything else null. */
export function parseRoomRoute(pathname: string): { code: string; match: boolean } | null {
  const parsed = /^\/rooms\/([A-Z0-9]{6})(\/match)?$/.exec(pathname);
  return parsed ? { code: parsed[1]!, match: !!parsed[2] } : null;
}

// ---- P1 rooms lane (2026-09-28): the peer-to-peer match host's commands, URL, validators and limits
// (docs/MULTIPLAYER-V2.md §13.2 and its addendum). Everything below is shared by the room hosts and the client.

/**
 * A p2p host reports its match to the room (`room_command` with `match_report`) instead of the room polling a
 * service; a host silent for this long without leaving is treated like a dropped host (three poll intervals).
 */
export const ROOM_MATCH_REPORT_STALE_AFTER_MS = 3 * ROOM_MATCH_POLL_MS;
/** The host reports at least this often (every phase change too); half the staleness budget stays for a slow tab. */
export const ROOM_MATCH_REPORT_INTERVAL_MS = ROOM_MATCH_POLL_MS;
/** A verdict reason in a report is one short token (`elimination`, `time_limit`, …). */
export const ROOM_MAX_VERDICT_REASON_CHARS = 64;

export type RoomMatchReportPhase = 'loading' | 'countdown' | 'playing' | 'ended';

/** `room_command { command: RoomMatchReportCommand }` — accepted only from the host of the current generation. */
export interface RoomMatchReportCommand {
  type: 'match_report';
  matchId: string;
  generation: number;
  phase: RoomMatchReportPhase;
  /** The authority tick reached (the resume point a successor boots from); 0 while loading. */
  tick?: number;
  /** Required with `ended`; an `ended` without a verdict records the match as lost. */
  verdict?: { result: RoomResult; reason: string };
}

/** `room_command { command: RoomHostDeclineCommand }` — any seat, any phase; the current host declining mid-match migrates. */
export interface RoomHostDeclineCommand {
  type: 'host_decline';
  declined: boolean;
}

/** The p2p match URL: `rtc://<roomId>/<generation>`; the client opens a data channel to `hostId` through `room_signal`. */
export function p2pMatchUrl(roomId: string, generation: number): string {
  return `rtc://${roomId}/${generation}`;
}

export function parseP2pMatchUrl(url: unknown): { roomId: string; generation: number } | null {
  if (typeof url !== 'string') return null;
  const parsed = /^rtc:\/\/([a-zA-Z0-9_-]{1,48})\/(\d{1,9})$/.exec(url);
  return parsed ? { roomId: parsed[1]!, generation: Number(parsed[2]) } : null;
}

const HOST_TRANSPORT_SET: ReadonlySet<string> = new Set(['p2p', 'service']);
const SIGNAL_KIND_SET: ReadonlySet<string> = new Set(['offer', 'answer', 'candidate']);
const HOST_CHANGED_REASON_SET: ReadonlySet<string> = new Set(['left', 'timeout', 'declined', 'start']);
const REPORT_PHASE_SET: ReadonlySet<string> = new Set(['loading', 'countdown', 'playing', 'ended']);

/** The record of a room before any election (also what `readRoomSnapshot` gives an older host's snapshot). */
export function noElection(since: number, transport: RoomHostInfo['transport'] = 'p2p'): RoomHostInfo {
  return { transport, hostId: null, generation: 0, since };
}

export function isRoomHostInfo(value: unknown): value is RoomHostInfo {
  if (!isRecord(value)) return false;
  return typeof value.transport === 'string' && HOST_TRANSPORT_SET.has(value.transport) &&
    (value.hostId === null || (typeof value.hostId === 'string' && ROOM_ID_RE.test(value.hostId))) &&
    isSafeUnsigned(value.generation) && isSafeUnsigned(value.since);
}

/** UTF-8 byte length without a TextEncoder (the actor runs where neither DOM nor Node globals are assumed). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; index++; }
    else bytes += 3;
  }
  return bytes;
}

/**
 * The client's `room_signal` payload, validated field by field (the room never parses SDP): `to`, `generation`, `kind`,
 * an optional `sdp` string and an optional `candidate` record. Anything else is `invalid_payload`; the size rule
 * (`ROOM_SIGNAL_MAX_BYTES`, `signal_size`) is the room's, measured on the validated fields.
 */
export function readRoomSignalPayload(value: unknown): RoomSignalPayload {
  if (!isRecord(value) || typeof value.kind !== 'string' || !SIGNAL_KIND_SET.has(value.kind) || !isSafeUnsigned(value.generation) ||
      (value.sdp !== undefined && typeof value.sdp !== 'string') ||
      (value.candidate !== undefined && !(isRecord(value.candidate) && typeof value.candidate.candidate === 'string' &&
        (value.candidate.sdpMid === null || typeof value.candidate.sdpMid === 'string') &&
        (value.candidate.sdpMLineIndex === null || isSafeUnsigned(value.candidate.sdpMLineIndex))))) {
    throw new RoomError('invalid_payload', 'room signal fields');
  }
  const to = cleanId(value.to, 'signal_target');
  const signal: RoomSignalPayload = { to, generation: value.generation, kind: value.kind as RoomSignalPayload['kind'] };
  if (typeof value.sdp === 'string') signal.sdp = value.sdp;
  if (value.candidate !== undefined) {
    const candidate = value.candidate as { candidate: string; sdpMid: string | null; sdpMLineIndex: number | null };
    signal.candidate = { candidate: candidate.candidate, sdpMid: candidate.sdpMid ?? null, sdpMLineIndex: candidate.sdpMLineIndex ?? null };
  }
  return signal;
}

/** A relayed `room_signal` as the target receives it: the sender's validated fields plus `from`. */
export function isRelayedRoomSignal(value: unknown): value is RoomSignalPayload & { from: string } {
  if (!isRecord(value) || typeof value.from !== 'string' || !ROOM_ID_RE.test(value.from)) return false;
  try { readRoomSignalPayload(value); return true; } catch { return false; }
}

export function isRoomHostChangedPayload(value: unknown): value is RoomHostChangedPayload {
  if (!isRecord(value)) return false;
  return typeof value.hostId === 'string' && ROOM_ID_RE.test(value.hostId) && isSafeUnsigned(value.generation) &&
    isSafeUnsigned(value.resumeTick) && typeof value.reason === 'string' && HOST_CHANGED_REASON_SET.has(value.reason) &&
    (value.hostSecret === undefined || typeof value.hostSecret === 'string');
}

/** A validated `match_report` (identity against the room is the actor's check). */
export interface RoomMatchReport {
  matchId: string;
  generation: number;
  phase: RoomMatchReportPhase;
  tick: number;
  verdict: { result: RoomResult; reason: string } | null;
}

export function readRoomMatchReport(value: unknown): RoomMatchReport {
  if (!isRecord(value) || typeof value.matchId !== 'string' || value.matchId.length === 0 || value.matchId.length > 64 ||
      !isSafeUnsigned(value.generation) || typeof value.phase !== 'string' || !REPORT_PHASE_SET.has(value.phase) ||
      (value.tick !== undefined && !isSafeUnsigned(value.tick)) ||
      (value.verdict !== undefined && value.verdict !== null && !(isRecord(value.verdict) && typeof value.verdict.result === 'string' &&
        RESULT_SET.has(value.verdict.result) && typeof value.verdict.reason === 'string' && value.verdict.reason.length <= ROOM_MAX_VERDICT_REASON_CHARS))) {
    throw new RoomError('invalid_payload', 'match report fields');
  }
  const verdict = value.verdict ? value.verdict as { result: RoomResult; reason: string } : null;
  return {
    matchId: value.matchId, generation: value.generation, phase: value.phase as RoomMatchReportPhase, tick: value.tick ?? 0,
    verdict: verdict ? { result: verdict.result, reason: verdict.reason } : null,
  };
}
