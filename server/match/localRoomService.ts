/**
 * LocalRoomService: the room side for tests, receipts, the soak and the LAN
 * helper. It does what the Room Durable Object will do for the match
 * service — hold a roster, sign seat tokens with the shared secret, start
 * the actor and receive the verdict — with nothing persistent.
 */
import type { CloseReasonId } from '../../src/mp/wire/constants.ts';
import type { ActorBotSpec, ActorSeatSpec, MatchActor, MatchActorOptions, MatchVerdict } from './matchActor.ts';
import { signSeatToken, type SeatClaims } from './seatToken.ts';
import type { MatchService } from './service.ts';
import { silentLogger, type Logger } from './log.ts';

export interface LocalRoomSeat {
  playerId: string;
  name: string;
  team: 'alpha' | 'bravo' | 'spectator';
  specId: string;
  seat?: number;
}

export interface LocalRoomOptions {
  roomId?: string;
  mapId: string;
  mode?: string;
  seed?: number;
  seats: LocalRoomSeat[];
  bots?: ActorBotSpec[];
  countdownS?: number;
  battleLimitS?: number;
  world?: MatchActorOptions['world'];
  tokenTtlMs?: number;
  autoStart?: boolean;
  endedLingerTicks?: number;
}

export interface LocalRoom {
  roomId: string;
  actor: MatchActor;
  seats: ActorSeatSpec[];
  /** playerId -> signed seat token. */
  tokens: Map<string, string>;
  claims: Map<string, SeatClaims>;
}

export interface LocalRoomService {
  readonly verdicts: MatchVerdict[];
  createRoom(options: LocalRoomOptions): LocalRoom;
  /** Issue (or re-issue) a token for a seated player, e.g. for a reconnect test. */
  issueToken(room: LocalRoom, playerId: string, ttlMs?: number): string;
  closeRoom(roomId: string, reason?: CloseReasonId): boolean;
}

let roomCounter = 0;

export function createLocalRoomService({
  service,
  seatSecret,
  wallClock = () => Date.now(),
  log = silentLogger,
}: {
  service: MatchService;
  seatSecret: string;
  wallClock?: () => number;
  log?: Logger;
}): LocalRoomService {
  const verdicts: MatchVerdict[] = [];
  const rooms = new Map<string, LocalRoom>();

  function sign(room: LocalRoom, spec: ActorSeatSpec, ttlMs: number): { token: string; claims: SeatClaims } {
    const iat = wallClock();
    const claims: SeatClaims = {
      v: 1, roomId: room.roomId, seat: spec.seat, playerId: spec.playerId, name: spec.name.slice(0, 32) || spec.playerId,
      team: spec.team, specId: spec.specId, iat, exp: iat + ttlMs,
    };
    return { token: signSeatToken(seatSecret, claims), claims };
  }

  return {
    verdicts,
    createRoom(options) {
      const roomId = options.roomId ?? `local-${++roomCounter}`;
      const used = new Set<number>();
      const seats: ActorSeatSpec[] = options.seats.map((seat, index) => {
        let number = seat.seat ?? index;
        while (used.has(number)) number++;
        used.add(number);
        return { seat: number, playerId: seat.playerId, name: seat.name, team: seat.team, specId: seat.specId };
      });
      const room: LocalRoom = { roomId, actor: null as unknown as MatchActor, seats, tokens: new Map(), claims: new Map() };
      room.actor = service.createActor({
        roomId, mapId: options.mapId, mode: options.mode, seed: options.seed ?? 6000, seats, bots: options.bots,
        countdownS: options.countdownS, battleLimitS: options.battleLimitS, world: options.world,
        autoStart: options.autoStart, endedLingerTicks: options.endedLingerTicks,
        onVerdict: (verdict) => {
          verdicts.push(verdict);
          log.info('room verdict', { room: roomId, result: verdict.result, reason: verdict.reason });
        },
      });
      const ttlMs = options.tokenTtlMs ?? 24 * 3600 * 1000;
      for (const spec of seats) {
        const issued = sign(room, spec, ttlMs);
        room.tokens.set(spec.playerId, issued.token);
        room.claims.set(spec.playerId, issued.claims);
      }
      rooms.set(roomId, room);
      return room;
    },
    issueToken(room, playerId, ttlMs = 24 * 3600 * 1000) {
      const spec = room.seats.find((seat) => seat.playerId === playerId);
      if (!spec) throw new Error(`no seat for ${playerId}`);
      const issued = sign(room, spec, ttlMs);
      room.tokens.set(playerId, issued.token);
      room.claims.set(playerId, issued.claims);
      return issued.token;
    },
    closeRoom(roomId, reason) {
      rooms.delete(roomId);
      return service.removeActor(roomId, reason);
    },
  };
}
