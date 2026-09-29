/**
 * The peer-to-peer match host (owner 2026-09-28, docs/MULTIPLAYER-V2.md §13): the match runs in one seated
 * commander's browser. This `MatchHost` elects that commander at `start()`, hands out the
 * `rtc://<roomId>/<generation>` URL, answers `status()` from the host's presence and its `match_report` commands,
 * re-elects on `migrate()` when the host drops, and clears the election on `stop()`. The Durable Object
 * (`cloudflare/rooms`) and the local room service (`server/rooms`) both hand it to the `RoomActor`, which binds it
 * to the room it serves; the actor keeps the durable state (the room's `host` record, the last report) and the
 * timers, this module keeps the policy. Pure TypeScript: no DOM, no Node.
 *
 * Election (§13.2): the admin hosts unless it declined (`hostDeclined`, set by the `host_decline` command);
 * otherwise the lowest `joinedAt` connected commander that has not declined; a declined commander hosts only when
 * no other connected commander exists (§13.3: the mobile tier hosts when it is the only commander); spectators
 * never host. `generation` increments on every election a host comes out of.
 */
import { ROOM_MATCH_REPORT_STALE_AFTER_MS, p2pMatchUrl } from './protocol.ts';
import type { RoomHostInfo, RoomMatchReportPhase, RoomPlayer, RoomResult, RoomSnapshot } from './protocol.ts';
import type { MatchHostBase, MatchHostStartConfig, MatchHostStatus } from './roomActor.ts';

/** The host's last accepted `match_report` (the actor keeps it durable and hands it to the view). */
export interface P2pHostReport {
  generation: number;
  phase: RoomMatchReportPhase;
  /** The authority tick the host reached: the resume point a successor boots from. */
  tick: number;
  verdict: { result: RoomResult; reason: string } | null;
  /** The room's clock when the report arrived. */
  at: number;
}

/** What the p2p host reads from the room it serves; the actor binds it once. */
export interface P2pRoomView {
  room(): RoomSnapshot | null;
  /** True while the seat holds a live room socket. */
  isConnected(playerId: string): boolean;
  lastReport(): P2pHostReport | null;
  now(): number;
}

export type P2pHostHealth = 'alive' | 'absent' | 'silent' | 'none';

/** Seated, connected commanders (never spectators), minus `exclude` and minus `skip` (P1b: seats that stepped down). */
export function hostCandidates(room: RoomSnapshot, exclude: string | null = null, skip?: ReadonlySet<string>): RoomPlayer[] {
  return room.players.filter((player) => player.team !== 'spectator' && player.connected && player.id !== exclude && !skip?.has(player.id));
}

/**
 * The election rule above; null when no connected commander exists. `skip` (P1b, 2026-09-28) removes the seats that
 * stepped down from hosting this match by declining while they hosted — a decline never hands the match back to one
 * of them; a drop or a leave elects without it.
 */
export function electHost(room: RoomSnapshot, exclude: string | null = null, skip?: ReadonlySet<string>): RoomPlayer | null {
  const candidates = hostCandidates(room, exclude, skip);
  const willing = candidates.filter((player) => !player.hostDeclined);
  const pool = willing.length ? willing : candidates;
  let best: RoomPlayer | null = null;
  for (const player of pool) {
    if (player.id === room.adminId) return player;
    if (!best || player.joinedAt < best.joinedAt) best = player;
  }
  return best;
}

/** A running p2p match's host at `now`: `absent` without a room socket, `silent` past the report budget, else `alive`. */
export function p2pHostHealth(view: P2pRoomView, now: number): P2pHostHealth {
  const room = view.room();
  const hostId = room?.host.hostId ?? null;
  if (!room || !hostId || !room.match || (room.match.status !== 'starting' && room.match.status !== 'playing')) return 'none';
  if (!view.isConnected(hostId)) return 'absent';
  const report = view.lastReport();
  const lastSeen = report && report.generation === room.host.generation ? report.at : room.host.since;
  return now - lastSeen >= ROOM_MATCH_REPORT_STALE_AFTER_MS ? 'silent' : 'alive';
}

export interface P2pMatchHost extends MatchHostBase {
  readonly transport: 'p2p';
  /** The actor attaches the room it serves (once, in its constructor). */
  bind(view: P2pRoomView): void;
  /**
   * The current host dropped, left or declined: elect the next one (excluding it, and the `skip` seats — P1b: those
   * that stepped down by declining while hosting, on a decline), `generation + 1`, the room's `host` rewritten.
   * Null — and the room's `host` untouched — when no connected commander can take over.
   */
  migrate(exclude: string, skip?: ReadonlySet<string>): RoomHostInfo | null;
  /** The liveness `status()` reads. */
  health(): P2pHostHealth;
  /**
   * The match is over: `hostId` cleared, `generation` kept (monotonic). Synchronous on purpose — the actor calls it
   * inside a socket handler that may already have closed the delivering socket and must finish its sends without
   * yielding (a yield there crashed the Workers runtime, 2026-09-28); `stop()` is the same for the MatchHost contract.
   */
  clearElection(): void;
}

export function createP2pMatchHost(): P2pMatchHost {
  let view: P2pRoomView | null = null;
  const bound = (): P2pRoomView => {
    if (!view) throw new Error('p2p match host: bind a room view first');
    return view;
  };
  const roomFor = (roomId: string): RoomSnapshot | null => {
    const room = bound().room();
    return room && room.roomCode === roomId ? room : null;
  };
  const elect = (room: RoomSnapshot, exclude: string | null, skip?: ReadonlySet<string>): RoomHostInfo | null => {
    const next = electHost(room, exclude, skip);
    if (!next) return null;
    room.host = { transport: 'p2p', hostId: next.id, generation: room.host.generation + 1, since: bound().now() };
    return room.host;
  };
  const clearElection = (): void => {
    const room = bound().room();
    if (!room) return;
    room.host = { transport: 'p2p', hostId: null, generation: room.host.generation, since: bound().now() };
  };
  return {
    transport: 'p2p',
    bind(next: P2pRoomView) { view = next; },
    async start(config: MatchHostStartConfig) {
      const room = roomFor(config.roomId);
      if (!room) throw new Error('p2p match host: no room to host');
      const elected = elect(room, null);
      if (!elected) throw new Error('p2p match host: no connected commander can host');
      return { matchUrl: p2pMatchUrl(config.roomId, elected.generation) };
    },
    async status(roomId: string): Promise<MatchHostStatus | null> {
      const room = roomFor(roomId);
      if (!room || !room.match || !room.host.hostId) return null;
      const report = bound().lastReport();
      const current = report && report.generation === room.host.generation ? report : null;
      const alive = p2pHostHealth(bound(), bound().now()) === 'alive';
      return {
        roomId, matchId: room.match.id,
        phase: alive ? (current?.phase ?? 'loading') : 'unknown',
        verdict: current?.verdict ?? null,
        tick: current?.tick ?? 0,
      };
    },
    async stop(roomId: string) {
      if (roomFor(roomId)) clearElection();
    },
    clearElection,
    migrate(exclude: string, skip?: ReadonlySet<string>) {
      const room = bound().room();
      return room ? elect(room, exclude, skip) : null;
    },
    health() {
      return p2pHostHealth(bound(), bound().now());
    },
  };
}
