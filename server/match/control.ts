/**
 * The match service's control surface: how a room host (the Room Durable
 * Object through its container binding, or the LAN room service in the same
 * process) starts, observes and stops the one match a container runs.
 *
 *   POST   /control/matches            start (JSON MatchStartRequest) → 201 { roomId, matchId, matchPath }
 *   GET    /control/matches/<roomId>   → 200 { roomId, matchId, phase, tick, verdict } | 404
 *   DELETE /control/matches/<roomId>   → 204
 *
 * Every request carries `Authorization: Bearer <control secret>`; the secret
 * is the seat secret unless COT_MATCH_CONTROL_SECRET names another. A start
 * for a room whose previous match has ended replaces it (rematch in the same
 * room); a start while a match is live answers 409.
 */
import type http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { CLOSE_REASON } from '../../src/mp/wire/constants.ts';
import type { ActorBotSpec, ActorSeatSpec, MatchActor } from './matchActor.ts';

const ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const MAX_BODY_BYTES = 64 * 1024;

export interface MatchStartRequest {
  roomId: string;
  matchId: string;
  mapId: string;
  mode?: string;
  seed: number;
  seats: ActorSeatSpec[];
  bots?: Array<{ playerId: string; name: string; team: 'alpha' | 'bravo'; specId: string; difficulty?: 'easy' | 'normal' | 'hard' }>;
  countdownS?: number;
  battleLimitS?: number;
}

export interface MatchControlStatus {
  roomId: string;
  matchId: string | null;
  phase: string;
  tick: number;
  verdict: { result: 'alpha' | 'bravo' | 'draw'; reason: string } | null;
}

export interface MatchControlPort {
  actor(roomId: string): MatchActor | undefined;
  createActor(request: MatchStartRequest): MatchActor;
  removeActor(roomId: string, reason?: number): boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readSeat(value: unknown): ActorSeatSpec | null {
  if (!isRecord(value)) return null;
  const team = value.team;
  if (!Number.isInteger(value.seat) || (value.seat as number) < 0 || (value.seat as number) >= 64) return null;
  if (typeof value.playerId !== 'string' || !ID_RE.test(value.playerId)) return null;
  if (team !== 'alpha' && team !== 'bravo' && team !== 'spectator') return null;
  if (typeof value.specId !== 'string' || value.specId.length > 64) return null;
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 32) : value.playerId;
  const equipment = Array.isArray(value.equipment) ? value.equipment.filter((entry): entry is string => typeof entry === 'string').slice(0, 3) : null;
  return { seat: value.seat as number, playerId: value.playerId, name, team, specId: value.specId, equipment };
}

function readBot(value: unknown): ActorBotSpec | null {
  if (!isRecord(value)) return null;
  if (typeof value.playerId !== 'string' || !ID_RE.test(value.playerId)) return null;
  if (value.team !== 'alpha' && value.team !== 'bravo') return null;
  if (typeof value.specId !== 'string' || value.specId.length > 64) return null;
  const difficulty = value.difficulty === 'easy' || value.difficulty === 'hard' ? value.difficulty : 'normal';
  return { playerId: value.playerId, name: typeof value.name === 'string' ? value.name.slice(0, 32) : value.playerId, team: value.team, specId: value.specId, difficulty };
}

/** Validate an untrusted start body into the actor's shapes; null when malformed. */
export function readMatchStartRequest(value: unknown): MatchStartRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.roomId !== 'string' || !ID_RE.test(value.roomId)) return null;
  if (typeof value.matchId !== 'string' || !/^[a-zA-Z0-9_-]{1,48}$/.test(value.matchId)) return null;
  if (typeof value.mapId !== 'string' || !/^[a-z0-9_-]{1,64}$/.test(value.mapId)) return null;
  if (!Number.isInteger(value.seed) || (value.seed as number) < 0 || (value.seed as number) > 0xffffffff) return null;
  if (!Array.isArray(value.seats) || value.seats.length > 64) return null;
  const seats: ActorSeatSpec[] = [];
  for (const raw of value.seats) { const seat = readSeat(raw); if (!seat) return null; seats.push(seat); }
  const bots: ActorBotSpec[] = [];
  if (value.bots !== undefined) {
    if (!Array.isArray(value.bots) || value.bots.length > 64) return null;
    for (const raw of value.bots) { const bot = readBot(raw); if (!bot) return null; bots.push(bot); }
  }
  const countdownS = value.countdownS === undefined ? undefined : Number(value.countdownS);
  if (countdownS !== undefined && (!Number.isFinite(countdownS) || countdownS < 0 || countdownS > 120)) return null;
  const battleLimitS = value.battleLimitS === undefined ? undefined : Number(value.battleLimitS);
  if (battleLimitS !== undefined && (!Number.isFinite(battleLimitS) || battleLimitS < 10 || battleLimitS > 3600)) return null;
  return {
    roomId: value.roomId, matchId: value.matchId, mapId: value.mapId,
    mode: typeof value.mode === 'string' ? value.mode : 'standard', seed: value.seed as number,
    seats, bots, ...(countdownS !== undefined ? { countdownS } : {}), ...(battleLimitS !== undefined ? { battleLimitS } : {}),
  };
}

export function statusOf(roomId: string, actor: MatchActor | undefined, matchId: string | null): MatchControlStatus | null {
  if (!actor) return null;
  const result = actor.authority.result;
  return {
    roomId,
    matchId,
    phase: actor.stopped ? 'stopped' : actor.ended ? 'ended' : actor.authority.phase,
    tick: actor.tick,
    verdict: result ? { result, reason: actor.authority.resultReason ?? '' } : null,
  };
}

function bearerMatches(header: string | undefined, secret: string): boolean {
  if (!header || !header.startsWith('Bearer ')) return false;
  const provided = Buffer.from(header.slice(7));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) { reject(new RangeError('body too large')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null); }
      catch (error) { reject(error); }
    });
    request.on('error', reject);
  });
}

export function createMatchControl({ port, controlSecret, matchPath = '/match' }: { port: MatchControlPort; controlSecret: string; matchPath?: string }) {
  const matchIds = new Map<string, string>();
  const json = (response: http.ServerResponse, status: number, body: unknown): void => {
    const data = body === null ? '' : JSON.stringify(body);
    response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(data), 'cache-control': 'no-store' });
    response.end(data);
  };
  return {
    /** True when the request was a control route (handled, whatever the outcome). */
    handle(request: http.IncomingMessage, response: http.ServerResponse): boolean {
      const path = (request.url || '').split('?', 1)[0]!;
      if (!path.startsWith('/control/')) return false;
      if (!bearerMatches(request.headers.authorization, controlSecret)) { json(response, 401, { error: 'unauthorized' }); return true; }
      const room = /^\/control\/matches\/([a-zA-Z0-9_-]{1,48})$/.exec(path)?.[1];
      if (request.method === 'POST' && path === '/control/matches') {
        readJsonBody(request).then((body) => {
          const start = readMatchStartRequest(body);
          if (!start) { json(response, 400, { error: 'invalid_start' }); return; }
          const existing = port.actor(start.roomId);
          if (existing && !existing.stopped && !existing.ended) { json(response, 409, { error: 'match_running', matchId: matchIds.get(start.roomId) ?? null }); return; }
          if (existing) port.removeActor(start.roomId, CLOSE_REASON.MATCH_ENDED);
          try {
            port.createActor(start);
          } catch (error) {
            json(response, 500, { error: 'start_failed', detail: error instanceof Error ? error.message : String(error) });
            return;
          }
          matchIds.set(start.roomId, start.matchId);
          json(response, 201, { roomId: start.roomId, matchId: start.matchId, matchPath });
        }).catch((error: unknown) => json(response, error instanceof RangeError ? 413 : 400, { error: 'invalid_body' }));
        return true;
      }
      if (request.method === 'GET' && room) {
        const status = statusOf(room, port.actor(room), matchIds.get(room) ?? null);
        if (!status) json(response, 404, { error: 'not_found', roomId: room });
        else json(response, 200, status);
        return true;
      }
      if (request.method === 'DELETE' && room) {
        port.removeActor(room, CLOSE_REASON.ROOM_CLOSED);
        matchIds.delete(room);
        json(response, 204, null);
        return true;
      }
      json(response, 404, { error: 'not_found' });
      return true;
    },
    matchIdOf: (roomId: string) => matchIds.get(roomId) ?? null,
  };
}
