/**
 * Room policy: the pure state machine every room host runs (charter §5).
 * It encodes v1's lobby rules (`src/net/lobby.ts`: auto-balanced teams,
 * capacity, readiness resets, co-op modes on Alpha, unique names, start
 * gating, bot fill) with the v2 caps — 14 per side, 8 spectators — and with
 * the host binding replaced by an admin role that migrates to the most senior
 * connected seat. No transport, no clock reads, no randomness: callers pass
 * timestamps and seeds in, so the Durable Object, the LAN service and the
 * receipts drive the same code.
 */
import { GAME_MODE_IDS, normalizeGameMode } from '../../sim/matchModes.ts';
import { normalizeTeamArrangement, type TeamArrangement } from '../../sim/matchRuleset.ts';
import { resolveMapId } from '../../world/maps/catalog.ts';
import {
  ROOM_CAMO_RE, ROOM_CAMPAIGN_RE, ROOM_CODE_RE, ROOM_MAP_RE, ROOM_MAX_COOP_PLAYERS, ROOM_MAX_SEATS, ROOM_MAX_SPECTATORS,
  ROOM_MAX_TEAM_SIZE, ROOM_MIN_TEAM_SIZE, ROOM_PROTOCOL_VERSION, ROOM_SPEC_RE, RoomError, cleanEquipment, cleanId, isRecord,
  isRoomTeam, normalizePlayerName,
} from './protocol.ts';
import type {
  RoomCreateSettings, RoomLastResult, RoomMatchInfo, RoomMode, RoomPlayer, RoomResult, RoomSelection, RoomSettings, RoomSnapshot, RoomTeam,
} from './protocol.ts';

const GAME_MODE_SET: ReadonlySet<string> = new Set(GAME_MODE_IDS);

/** Cooperative modes: every human deploys on Alpha against authority-held defenders (v1 rule). */
export function isCoopGameMode(gameMode: string | null | undefined): boolean {
  return gameMode === 'endless_horde' || gameMode === 'frontline_assault';
}

export interface RoomPolicyGuards {
  isVehicleAllowed(specId: string, player: RoomPlayer, room: RoomSnapshot): boolean;
  isCamoAllowed(camo: string, player: RoomPlayer, room: RoomSnapshot): boolean;
  isMapAllowed(mapId: string, room: RoomSnapshot): boolean;
}

const OPEN_GUARDS: RoomPolicyGuards = {
  isVehicleAllowed: () => true,
  isCamoAllowed: () => true,
  isMapAllowed: () => true,
};

export interface CreateRoomOptions {
  roomCode: string;
  mode: RoomMode;
  creator: { id: string; name: string };
  selection?: Partial<RoomSelection> | null;
  settings?: RoomCreateSettings | null;
  now: number;
}

export interface JoinRoomOptions {
  player: { id: string; name: string };
  selection?: Partial<RoomSelection> | null;
  team?: RoomTeam | null;
  now: number;
}

/** A start plan: what the match host receives. Bots fill empty slots; disconnected seats are excluded. */
export interface RoomStartPlan {
  seats: Array<{ seat: number; playerId: string; name: string; team: RoomTeam; specId: string; equipment: string[]; camo: string }>;
  bots: Array<{ playerId: string; name: string; team: 'alpha' | 'bravo'; specId: string }>;
  mapId: string;
  gameMode: string;
  seed: number;
  round: number;
}

function cleanName(value: unknown): string {
  const name = normalizePlayerName(value);
  if (!name) throw new RoomError('invalid_name');
  return name;
}

function uniqueName(room: RoomSnapshot, requested: string, excludingId: string | null): string {
  const taken = new Set(room.players.filter((player) => player.id !== excludingId)
    .map((player) => player.name.toLocaleLowerCase('en-US')));
  if (!taken.has(requested.toLocaleLowerCase('en-US'))) return requested;
  for (let number = 2; number < 1000; number++) {
    const suffix = ` ${number}`;
    const candidate = `${requested.slice(0, 24 - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase('en-US'))) return candidate;
  }
  throw new RoomError('invalid_name', 'player name space is exhausted');
}

function cleanSpecId(value: unknown): string {
  const id = String(value ?? '').trim();
  if (!ROOM_SPEC_RE.test(id)) throw new RoomError('invalid_vehicle');
  return id;
}

function cleanCamo(value: unknown): string {
  const id = String(value ?? 'factory').trim() || 'factory';
  if (!ROOM_CAMO_RE.test(id)) throw new RoomError('invalid_camo');
  return id;
}

function cleanMap(value: unknown): string {
  const id = String(value ?? 'random').trim() || 'random';
  if (!ROOM_MAP_RE.test(id)) throw new RoomError('map_not_allowed');
  return id;
}

function cleanTeamSize(value: unknown): number {
  const size = Number(value);
  if (!Number.isInteger(size) || size < ROOM_MIN_TEAM_SIZE || size > ROOM_MAX_TEAM_SIZE) throw new RoomError('invalid_team_size');
  return size;
}

function readArrangement(value: unknown): TeamArrangement | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw new RoomError('invalid_arrangement');
  const pick = (key: string): number | string | null => {
    const field = value[key];
    return field === undefined || field === null ? null : typeof field === 'number' || typeof field === 'string' ? field : null;
  };
  return {
    allies: pick('allies') as number | null, enemies: pick('enemies') as number | null,
    waveSize: pick('waveSize') as number | null, enemyNation: pick('enemyNation') as string | null,
    marsGravity: pick('marsGravity') as TeamArrangement['marsGravity'], marsCaches: pick('marsCaches') as TeamArrangement['marsCaches'],
  };
}

export function activePlayers(room: RoomSnapshot): RoomPlayer[] {
  return room.players.filter((player) => player.team !== 'spectator');
}

export function countTeam(room: RoomSnapshot, team: RoomTeam, excluding: string | null = null): number {
  let count = 0;
  for (const player of room.players) if (player.id !== excluding && player.team === team) count++;
  return count;
}

export function requirePlayer(room: RoomSnapshot, playerId: string): RoomPlayer {
  const player = room.players.find((entry) => entry.id === playerId);
  if (!player) throw new RoomError('unknown_player');
  return player;
}

function assertWaiting(room: RoomSnapshot): void {
  if (room.phase !== 'waiting') throw new RoomError('lobby_locked', 'the room is starting or playing');
}

function assertAdmin(room: RoomSnapshot, playerId: string): void {
  if (room.adminId !== playerId) throw new RoomError('admin_only');
}

function assertEditable(player: RoomPlayer): void {
  if (player.ready) throw new RoomError('vehicle_locked', 'unready before changing your vehicle or team');
}

function touch(room: RoomSnapshot, now: number): RoomSnapshot {
  room.revision++;
  room.touchedAt = Math.max(room.touchedAt, now);
  return room;
}

function resetReadiness(room: RoomSnapshot): void {
  for (const player of room.players) player.ready = false;
}

function nextSeat(room: RoomSnapshot): number {
  const used = new Set(room.players.map((player) => player.seat));
  for (let seat = 0; seat < ROOM_MAX_SEATS; seat++) if (!used.has(seat)) return seat;
  throw new RoomError('room_full');
}

function nextJoinOrdinal(room: RoomSnapshot): number {
  let max = -1;
  for (const player of room.players) if (player.joinedAt > max) max = player.joinedAt;
  return max + 1;
}

/** The lighter team, Alpha on ties; co-op modes always Alpha. */
export function autoTeam(room: RoomSnapshot): 'alpha' | 'bravo' {
  if (isCoopGameMode(room.settings.gameMode)) return 'alpha';
  return countTeam(room, 'alpha') <= countTeam(room, 'bravo') ? 'alpha' : 'bravo';
}

function teamCapacity(room: RoomSnapshot, team: RoomTeam): number {
  if (team === 'spectator') return room.settings.maxSpectators;
  return isCoopGameMode(room.settings.gameMode) ? ROOM_MAX_COOP_PLAYERS : room.settings.teamSize;
}

function resolveJoinTeam(room: RoomSnapshot, requested: RoomTeam): RoomTeam {
  if (requested === 'spectator') {
    if (countTeam(room, 'spectator') >= room.settings.maxSpectators) throw new RoomError('spectators_full');
    return 'spectator';
  }
  const active = activePlayers(room).length;
  if (isCoopGameMode(room.settings.gameMode)) {
    if (active >= ROOM_MAX_COOP_PLAYERS) throw new RoomError('coop_capacity');
    room.settings.teamSize = Math.max(room.settings.teamSize, Math.min(ROOM_MAX_TEAM_SIZE, active + 1));
    return 'alpha';
  }
  if (active >= room.settings.teamSize * 2) throw new RoomError('room_full');
  const target = countTeam(room, requested) >= room.settings.teamSize ? autoTeam(room) : requested;
  if (countTeam(room, target) >= room.settings.teamSize) throw new RoomError('team_full');
  return target;
}

function createPlayer(room: RoomSnapshot, {
  id, name, team, selection, isAdmin, now,
}: { id: string; name: string; team: RoomTeam; selection: Partial<RoomSelection> | null | undefined; isAdmin: boolean; now: number }): RoomPlayer {
  void now;
  return {
    id,
    name,
    team,
    seat: nextSeat(room),
    specId: selection?.specId ? cleanSpecId(selection.specId) : null,
    equipment: cleanEquipment(selection?.equipment),
    camo: cleanCamo(selection?.camo),
    ready: false,
    connected: true,
    isAdmin,
    joinedAt: nextJoinOrdinal(room),
  };
}

export function defaultRoomSettings(settings: RoomCreateSettings | null | undefined): RoomSettings {
  const gameMode = normalizeGameMode(settings?.gameMode);
  const teamSize = settings?.teamSize == null ? 7 : cleanTeamSize(settings.teamSize);
  const maxSpectators = settings?.maxSpectators == null ? ROOM_MAX_SPECTATORS : Number(settings.maxSpectators);
  if (!Number.isInteger(maxSpectators) || maxSpectators < 0 || maxSpectators > ROOM_MAX_SPECTATORS) throw new RoomError('invalid_payload', 'maxSpectators');
  return {
    gameMode,
    mapId: cleanMap(settings?.mapId),
    teamSize: isCoopGameMode(gameMode) ? Math.min(teamSize, ROOM_MAX_COOP_PLAYERS) : teamSize,
    maxSpectators,
    botsFill: settings?.botsFill == null ? true : !!settings.botsFill,
    allowTeamSwitch: settings?.allowTeamSwitch == null ? true : !!settings.allowTeamSwitch,
    locked: false,
    arrangement: normalizeTeamArrangement(gameMode, readArrangement(settings?.arrangement)),
    campaignOperationId: typeof settings?.campaignOperationId === 'string' && ROOM_CAMPAIGN_RE.test(settings.campaignOperationId)
      ? settings.campaignOperationId : null,
  };
}

/** A new room: the creator is the admin and the first (Alpha) seat. */
export function createRoom({ roomCode, mode, creator, selection, settings, now }: CreateRoomOptions): RoomSnapshot {
  if (!ROOM_CODE_RE.test(roomCode)) throw new RoomError('invalid_room_code');
  if (mode !== 'private' && mode !== 'lan') throw new RoomError('invalid_payload', 'mode');
  const id = cleanId(creator.id);
  const room: RoomSnapshot = {
    v: ROOM_PROTOCOL_VERSION,
    roomCode,
    mode,
    phase: 'waiting',
    adminId: id,
    revision: 0,
    round: 0,
    settings: defaultRoomSettings(settings),
    players: [],
    match: null,
    lastResult: null,
    createdAt: now,
    touchedAt: now,
  };
  room.players.push(createPlayer(room, { id, name: cleanName(creator.name), team: 'alpha', selection, isAdmin: true, now }));
  return room;
}

/** Seat a new player (auto-balanced unless a team is requested and has room). */
export function joinRoom(room: RoomSnapshot, { player, selection, team, now }: JoinRoomOptions): RoomPlayer {
  if (room.settings.locked) throw new RoomError('room_locked');
  const id = cleanId(player.id);
  if (room.players.some((entry) => entry.id === id)) throw new RoomError('already_joined');
  const requested: RoomTeam = isCoopGameMode(room.settings.gameMode) ? 'alpha' : (team && isRoomTeam(team) ? team : autoTeam(room));
  const target = resolveJoinTeam(room, requested);
  if (room.players.length >= ROOM_MAX_SEATS) throw new RoomError('room_full');
  const seated = createPlayer(room, {
    id, name: uniqueName(room, cleanName(player.name), null), team: target, selection, isAdmin: false, now,
  });
  room.players.push(seated);
  touch(room, now);
  return seated;
}

/** The most senior connected seat, else the most senior seat of all; null in an empty room. */
export function seniorPlayer(room: RoomSnapshot, excluding: string | null = null): RoomPlayer | null {
  let best: RoomPlayer | null = null;
  let bestConnected: RoomPlayer | null = null;
  for (const player of room.players) {
    if (player.id === excluding) continue;
    if (!best || player.joinedAt < best.joinedAt) best = player;
    if (player.connected && (!bestConnected || player.joinedAt < bestConnected.joinedAt)) bestConnected = player;
  }
  return bestConnected ?? best;
}

/** Hand the admin role to `next` (idempotent). Returns true when the admin changed. */
export function assignAdmin(room: RoomSnapshot, next: RoomPlayer | null, now: number): boolean {
  if (!next || room.adminId === next.id) return false;
  for (const player of room.players) player.isAdmin = player.id === next.id;
  room.adminId = next.id;
  touch(room, now);
  return true;
}

/** Explicit leave (or kick): the seat goes; an admin seat migrates at once. */
export function removePlayer(room: RoomSnapshot, playerId: string, now: number): boolean {
  const index = room.players.findIndex((player) => player.id === playerId);
  if (index < 0) return false;
  const [gone] = room.players.splice(index, 1);
  if (gone && gone.isAdmin) assignAdmin(room, seniorPlayer(room), now);
  touch(room, now);
  return true;
}

/** Socket presence. A disconnected seat loses its readiness so it cannot hold a start hostage. */
export function setPlayerConnected(room: RoomSnapshot, playerId: string, connected: boolean, now: number): boolean {
  const player = requirePlayer(room, playerId);
  if (player.connected === connected) return false;
  player.connected = connected;
  if (!connected && room.phase === 'waiting') player.ready = false;
  touch(room, now);
  return true;
}

/** The admin's socket has been gone longer than the grace: migrate to the most senior connected seat. */
export function migrateAdminIfAbsent(room: RoomSnapshot, now: number): boolean {
  const admin = room.players.find((player) => player.id === room.adminId);
  if (!admin || admin.connected) return false;
  const next = seniorPlayer(room, admin.id);
  if (!next || !next.connected) return false;
  return assignAdmin(room, next, now);
}

/** Commands a seated player may send (the admin ones check the role). */
export interface RoomCommand extends Record<string, unknown> {
  type?: unknown;
}

function applyTeam(room: RoomSnapshot, actor: RoomPlayer, target: RoomPlayer, team: unknown, byAdmin: boolean): void {
  if (!isRoomTeam(team)) throw new RoomError('invalid_team');
  if (!byAdmin) {
    assertEditable(target);
    if (!room.settings.allowTeamSwitch && !actor.isAdmin) throw new RoomError('team_switch_disabled');
  }
  if (isCoopGameMode(room.settings.gameMode) && team === 'bravo') throw new RoomError('cooperative_team');
  if (team !== target.team && countTeam(room, team, target.id) >= teamCapacity(room, team)) {
    throw new RoomError(team === 'spectator' ? 'spectators_full' : 'team_full');
  }
  target.team = team;
  target.ready = false;
}

/**
 * Apply one validated command. Policy is centralized here so the Durable
 * Object, the LAN service and the loopback receipts cannot disagree.
 */
export function applyRoomCommand(
  room: RoomSnapshot,
  playerId: string,
  raw: unknown,
  now: number,
  guards: Partial<RoomPolicyGuards> = {},
): RoomSnapshot {
  const { isVehicleAllowed, isCamoAllowed, isMapAllowed } = { ...OPEN_GUARDS, ...guards };
  if (!isRecord(raw)) throw new RoomError('invalid_command');
  const command: RoomCommand = raw;
  const id = cleanId(playerId);
  const player = requirePlayer(room, id);
  const type = String(command.type ?? '');
  // A finished match returns the room to `waiting`; only `start` is refused while one runs.
  if (type !== 'set_name' && type !== 'kick') assertWaiting(room);
  switch (type) {
    case 'set_name':
      player.name = uniqueName(room, cleanName(command.name), id);
      break;
    case 'select_vehicle': {
      assertEditable(player);
      const specId = cleanSpecId(command.specId);
      if (!isVehicleAllowed(specId, player, room)) throw new RoomError('vehicle_not_allowed');
      player.specId = specId;
      player.ready = false;
      break;
    }
    case 'select_equipment':
      assertEditable(player);
      player.equipment = cleanEquipment(command.equipment);
      player.ready = false;
      break;
    case 'select_camo': {
      assertEditable(player);
      const camo = cleanCamo(command.camo);
      if (!isCamoAllowed(camo, player, room)) throw new RoomError('camo_not_allowed');
      player.camo = camo;
      player.ready = false;
      break;
    }
    case 'set_ready':
      if (player.team !== 'spectator' && !player.specId) throw new RoomError('vehicle_required');
      player.ready = !!command.ready;
      break;
    case 'set_team':
      applyTeam(room, player, player, command.team, false);
      break;
    case 'move_player': {
      assertAdmin(room, id);
      const target = requirePlayer(room, cleanId(command.playerId, 'unknown_player'));
      applyTeam(room, player, target, command.team, true);
      break;
    }
    case 'kick': {
      assertAdmin(room, id);
      const target = cleanId(command.playerId, 'unknown_player');
      if (target === id) throw new RoomError('invalid_command', 'the admin cannot kick itself');
      if (!removePlayer(room, target, now)) throw new RoomError('unknown_player');
      return room;
    }
    case 'set_game_mode': {
      assertAdmin(room, id);
      const gameMode = normalizeGameMode(command.gameMode);
      if (!GAME_MODE_SET.has(gameMode)) throw new RoomError('invalid_command');
      if (isCoopGameMode(gameMode)) {
        const active = activePlayers(room);
        if (active.length > ROOM_MAX_COOP_PLAYERS) throw new RoomError('coop_capacity');
        room.settings.teamSize = Math.max(1, Math.min(ROOM_MAX_COOP_PLAYERS, Math.max(room.settings.teamSize, active.length)));
        for (const entry of active) entry.team = 'alpha';
      }
      if (gameMode !== room.settings.gameMode) room.settings.arrangement = null;
      if (gameMode !== 'frontline_assault') room.settings.campaignOperationId = null;
      room.settings.gameMode = gameMode;
      resetReadiness(room);
      break;
    }
    case 'set_team_size': {
      assertAdmin(room, id);
      const size = cleanTeamSize(command.teamSize);
      if (countTeam(room, 'alpha') > size || countTeam(room, 'bravo') > size) throw new RoomError('team_size_too_small');
      room.settings.teamSize = isCoopGameMode(room.settings.gameMode) ? Math.min(size, ROOM_MAX_COOP_PLAYERS) : size;
      resetReadiness(room);
      break;
    }
    case 'set_spectators': {
      assertAdmin(room, id);
      const max = Number(command.maxSpectators);
      if (!Number.isInteger(max) || max < 0 || max > ROOM_MAX_SPECTATORS) throw new RoomError('invalid_command');
      if (countTeam(room, 'spectator') > max) throw new RoomError('spectators_full');
      room.settings.maxSpectators = max;
      break;
    }
    case 'set_bots_fill':
      assertAdmin(room, id);
      room.settings.botsFill = !!command.botsFill;
      resetReadiness(room);
      break;
    case 'set_arrangement':
      assertAdmin(room, id);
      room.settings.arrangement = normalizeTeamArrangement(normalizeGameMode(room.settings.gameMode),
        readArrangement(command.arrangement === undefined ? null : command.arrangement));
      resetReadiness(room);
      break;
    case 'set_campaign_operation': {
      assertAdmin(room, id);
      if (room.settings.gameMode !== 'frontline_assault') throw new RoomError('invalid_command');
      const operation = command.campaignOperationId;
      if (operation !== null && operation !== undefined && (typeof operation !== 'string' || !ROOM_CAMPAIGN_RE.test(operation))) {
        throw new RoomError('invalid_command');
      }
      room.settings.campaignOperationId = typeof operation === 'string' ? operation : null;
      resetReadiness(room);
      break;
    }
    case 'set_map': {
      assertAdmin(room, id);
      const mapId = cleanMap(command.mapId);
      if (!isMapAllowed(mapId, room)) throw new RoomError('map_not_allowed');
      room.settings.mapId = mapId;
      resetReadiness(room);
      break;
    }
    case 'set_locked':
      assertAdmin(room, id);
      room.settings.locked = !!command.locked;
      break;
    case 'start':
      // The host's actor starts the match (`planStart`); the command only checks the right.
      assertAdmin(room, id);
      assertStartable(room);
      break;
    default:
      throw new RoomError('invalid_command', `unknown room command: ${type}`);
  }
  return touch(room, now);
}

/** Every connected active player ready with a vehicle, and at least one of them. */
export function assertStartable(room: RoomSnapshot): void {
  const connected = activePlayers(room).filter((player) => player.connected);
  if (connected.length === 0) throw new RoomError('players_not_ready', 'no connected player');
  if (connected.some((player) => !player.ready || !player.specId)) throw new RoomError('players_not_ready');
}

export function canStart(room: RoomSnapshot): boolean {
  try { assertStartable(room); return room.phase === 'waiting'; } catch { return false; }
}

/** Bot vehicle for an empty slot: the most common spec on that side, else the first seated one. */
function botSpecFor(plan: RoomStartPlan['seats'], team: 'alpha' | 'bravo', fallback: string): string {
  const counts = new Map<string, number>();
  for (const seat of plan) if (seat.team === team) counts.set(seat.specId, (counts.get(seat.specId) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = 0;
  for (const [specId, count] of counts) if (count > bestCount) { best = specId; bestCount = count; }
  return best ?? plan[0]?.specId ?? fallback;
}

/**
 * Freeze the roster for a match: connected active players by seat, bots on the
 * empty slots (co-op modes leave the other side to the authority's own rules),
 * spectators seated as spectators. The room moves to `starting` and the round
 * advances; the caller records the match once the host accepted it.
 */
export function planStart(room: RoomSnapshot, { seed, now, botSpecFallback = 'm1a2' }: { seed: number; now: number; botSpecFallback?: string }): RoomStartPlan {
  assertStartable(room);
  if (room.phase !== 'waiting') throw new RoomError('match_running');
  const seats: RoomStartPlan['seats'] = [];
  for (const player of room.players) {
    if (!player.connected) continue;
    if (player.team !== 'spectator' && !player.specId) continue;
    seats.push({
      seat: player.seat, playerId: player.id, name: player.name, team: player.team,
      specId: player.specId ?? botSpecFallback, equipment: player.equipment.slice(), camo: player.camo,
    });
  }
  const bots: RoomStartPlan['bots'] = [];
  const coop = isCoopGameMode(room.settings.gameMode);
  if (room.settings.botsFill && !coop) {
    for (const team of ['alpha', 'bravo'] as const) {
      const humans = seats.filter((seat) => seat.team === team).length;
      for (let index = humans; index < room.settings.teamSize; index++) {
        const ordinal = bots.length + 1;
        bots.push({ playerId: `bot-${team}-${index + 1}`, name: `Bot ${ordinal}`, team, specId: botSpecFor(seats, team, botSpecFallback) });
      }
    }
  }
  room.round += 1;
  room.phase = 'starting';
  room.settings.locked = true;
  touch(room, now);
  // `random` (the room default) becomes a concrete battlefield here, from the match seed, so the match
  // host, every seat's `match_start` and the room's match record name the same map (v1 resolved it the
  // same way from the lobby's match seed in privateMatchHandoff.ts).
  const mapId = resolveMapId(room.settings.mapId, seededUnit(seed >>> 0));
  return { seats, bots, mapId, gameMode: room.settings.gameMode, seed: seed >>> 0, round: room.round };
}

/** v1's seeded unit generator (privateMatchHandoff.ts), kept bit-identical so a seed picks the same map on both. */
function seededUnit(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6D2B79F5) | 0;
    let out = Math.imul(value ^ (value >>> 15), 1 | value);
    out = (out + Math.imul(out ^ (out >>> 7), 61 | out)) ^ out;
    return ((out ^ (out >>> 14)) >>> 0) / 4294967296;
  };
}

/** The host accepted the start: remember the match handle. */
export function recordMatch(room: RoomSnapshot, match: Omit<RoomMatchInfo, 'status' | 'endedAt' | 'verdict'>, now: number): RoomSnapshot {
  room.match = { ...match, status: 'starting', endedAt: null, verdict: null };
  return touch(room, now);
}

export function markMatchPlaying(room: RoomSnapshot, now: number): boolean {
  if (!room.match || room.match.status !== 'starting') return false;
  room.match.status = 'playing';
  room.phase = 'playing';
  touch(room, now);
  return true;
}

/** The start could not happen (host unavailable): back to `waiting`, readiness kept, the round returned. */
export function abortStart(room: RoomSnapshot, now: number): RoomSnapshot {
  if (room.phase === 'starting') {
    // the aborted round's own record goes; an earlier round's result stays on record
    if (room.match && room.match.round === room.round) room.match = null;
    room.round = Math.max(0, room.round - 1);
  }
  room.phase = 'waiting';
  room.settings.locked = false;
  return touch(room, now);
}

/** The verdict (or the loss of the container): the room returns to `waiting` with the result on record. */
export function finishMatch(
  room: RoomSnapshot,
  outcome: { status: 'ended'; result: RoomResult; reason: string } | { status: 'lost'; reason: string },
  now: number,
): RoomLastResult | null {
  if (!room.match) return null;
  room.match.status = outcome.status;
  room.match.endedAt = now;
  room.match.verdict = outcome.status === 'ended' ? { result: outcome.result, reason: outcome.reason } : null;
  room.lastResult = {
    round: room.match.round,
    result: outcome.status === 'ended' ? outcome.result : null,
    reason: outcome.reason,
  };
  room.phase = 'waiting';
  room.settings.locked = false;
  resetReadiness(room);
  touch(room, now);
  return room.lastResult;
}

/** Plain data safe to send to every participant (a defensive copy). */
export function serializeRoom(room: RoomSnapshot): RoomSnapshot {
  return {
    ...room,
    settings: { ...room.settings, arrangement: room.settings.arrangement ? { ...room.settings.arrangement } : null },
    players: room.players.map((player) => ({ ...player, equipment: player.equipment.slice() })),
    match: room.match ? { ...room.match, verdict: room.match.verdict ? { ...room.match.verdict } : null } : null,
    lastResult: room.lastResult ? { ...room.lastResult } : null,
  };
}

/** The v1 `SerializedLobby` shape the Play menu renders (hostId = admin, isHost = isAdmin). */
export function roomToLobby(room: RoomSnapshot): Record<string, unknown> {
  return {
    roomCode: room.roomCode,
    mode: room.mode,
    gameMode: room.settings.gameMode,
    phase: room.phase,
    hostId: room.adminId,
    maxPlayers: room.settings.teamSize * 2,
    maxSpectators: room.settings.maxSpectators,
    allowTeamSwitch: room.settings.allowTeamSwitch,
    locked: room.settings.locked,
    mapId: room.settings.mapId,
    teamSize: room.settings.teamSize,
    arrangement: room.settings.arrangement ? { ...room.settings.arrangement } : null,
    campaignOperationId: room.settings.campaignOperationId,
    revision: room.revision,
    matchSeed: room.match?.seed ?? null,
    round: room.round,
    lastResult: room.lastResult ? { ...room.lastResult } : null,
    players: room.players.map((player) => ({
      id: player.id, name: player.name, team: player.team, specId: player.specId, equipment: player.equipment.slice(),
      camo: player.camo, ready: player.ready, connected: player.connected, isHost: player.isAdmin, rating: null,
    })),
  };
}
