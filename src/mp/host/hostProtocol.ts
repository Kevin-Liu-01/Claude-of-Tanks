import type { NewModeCheckpoint } from '../../sim/authoritativeMatch.ts';
/**
 * The browser host (P2 client lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13): the vocabulary between the main thread
 * (`matchHost.ts`: the room, the WebRTC acceptor, the host's own loopback client) and the Worker that runs the match
 * actor (`matchHostCore.ts`). Links are numbered by the main thread (0 = the host's own loopback link); frames travel
 * as transferred ArrayBuffers; the Worker never learns a player identity beyond the seat claims the actor verifies.
 * Pure types and one port shape, so the Node receipts drive the core through an in-process port pair.
 */
import type { CloseReasonId } from '../wire/constants.ts';
import type { SnapshotFrame } from '../wire/messages.ts';
import type { TeamArrangement } from '../../sim/matchRuleset.ts';
import type { SimKernelsStatus } from '../../world/simKernelsStatus.ts';

export interface HostBootSeat {
  seat: number;
  playerId: string;
  name: string;
  team: 'alpha' | 'bravo' | 'spectator';
  specId: string;
  equipment?: readonly string[] | null;
  /** The consumable in each slot (sim/consumableRules.ts); absent carries the default trio. */
  consumables?: readonly string[] | null;
}

export interface HostBootBot {
  playerId: string;
  name: string;
  team: 'alpha' | 'bravo';
  specId: string;
  difficulty?: 'easy' | 'normal' | 'hard';
}

/** A reload channel as the old host left it: [remaining s, total s, kind]. */
export type MigrationReload = [t: number, totalS: number, kind: string];

/**
 * What the old host serialized beside the wire keyframe: the parts of an entity a row does not carry. The optional
 * fields are the fight's combat counters (audit M1, 2026-11-02): without them a migration swapped a selected
 * launcher's cycle onto the cannon, left damaged modules at full hp, put fires out on their first tick and refilled
 * magazines, salvos, consumables and smoke. Times are seconds from the keyframe: the new host's authority clock
 * starts at 0. An extras entry without them (an older build's) restores what it carries.
 */
export interface MigrationEntityExtras {
  entityId: number;
  kills: number;
  damage: number;
  modules: Record<string, string>;
  crew: Record<string, boolean>;
  burning: boolean;
  /** Every module below full hp: [hp, red repair progress s]. */
  moduleHp?: Record<string, [hp: number, repairT: number]>;
  /** A burning fire's budget: [ticks left, tick timer]. */
  fire?: [ticksLeft: number, tickTimer: number];
  /**
   * Each shell slot's reload channel (slots sharing a channel carry the same values), and the cannon channel. Round 2
   * (U2): a channel at rest is null, a list or cannon channel all at rest absent, as a full magazine is: the fresh host's
   * own are that already.
   */
  reloads?: (MigrationReload | null)[];
  gunReload?: MigrationReload;
  magazineRounds?: number;
  launcherSalvoShots?: number;
  launcherCursor?: number;
  /** Each slot's charges, its cooldown left and every timed item still active (seconds left), by item; no cooldown, no item: absent. */
  consumables?: { readyIn?: number[]; charges: (number | null)[]; activeFor?: Record<string, number> };
  /** Lights, the roof gun's switch and rounds, the smoke kit's charges and cooldown left; absent while the kit is as a fresh host builds it. */
  auxiliary?: { lights: -1 | 0 | 1; gunOn: boolean; smokeCharges: number; smokeReadyIn: number; shots: number; nextShotIn: number; stations?: [shots: number, nextShotIn: number][] };
}

/** The retained state a newly elected host boots from (decrypted on the main thread with the host secret). */
export interface HostResumeState {
  modeCheckpoint?: NewModeCheckpoint | null;
  /**
   * The battle the state belongs to (round 3 A3; WelcomeMessage.battleId): the sealed keyframe's, which a resume keeps, or a
   * fallback restart's new one (migrationState.ts migrationFallback). Absent: 0, a match's first battle.
   */
  battleId?: number;
  /** The authority tick the keyframe describes. */
  tick: number;
  battleTimeMs: number;
  phase: 'countdown' | 'playing' | 'ended';
  frame: SnapshotFrame;
  entities: MigrationEntityExtras[];
  /**
   * The tick the extras (`entities`) were captured at: the keyframe's, when a newer frame's rows overlay its rows and move
   * `tick` on (migrationState.ts resumeStateFromRetained). Absent: `tick`.
   */
  keyframeTick?: number;
  /**
   * The battle clock (ms) the extras were captured at (round 2 U2): the keyframe's, while `battleTimeMs` moves on with a
   * newer frame's. The sim time between the two ages the extras (migrationState.ts resumeFrameGapS); a tick gap overstates
   * it when the old host dropped ticks. Absent: the tick gap.
   */
  keyframeBattleTimeMs?: number;
  /** The old host's authority clock (s) at `keyframeTick`, the clock a row's auxiliary times count on. Absent on an older keyframe. */
  timeS?: number;
  /**
   * The hulls a mode revived between the keyframe and their newer rows, by wire id (audit M1, review round 2): the
   * keyframe's row has them destroyed, the newer row alive. Their extras describe the life they left.
   */
  revivedEntityIds?: number[];
  /**
   * The tick of each entity's newest `mode_respawn` this seat was told of after the keyframe, by authoritative id: a revive
   * of a hull that was alive (a Turbo Ball goal's kick-off) leaves both its rows alive.
   */
  respawnTicks?: [id: string, tick: number][];
}

export interface HostBootConfig {
  roomId: string;
  matchId: string;
  generation: number;
  mapId: string;
  mode: string;
  seed: number;
  seats: HostBootSeat[];
  bots: HostBootBot[];
  countdownS: number;
  battleLimitS?: number | null;
  /** The per-match secret the seat tokens are signed with (never leaves the host's browser). */
  hostSecret: string;
  /** Where the collision manifests are served (`<base>/index.json`, `<base>/<map>.json`); null = the bare height field. */
  manifestBase: string | null;
  /** The world kernels' module URL (?simKernels=wasm, src/world/wasmWorldKernels.ts); absent or null: the TypeScript. Host-local, never sealed. */
  simKernelsUrl?: string | null;
  /**
   * A migration: boot at this state, at the tick the main thread computed (the keyframe's plus the wall time since).
   * `holdForSeats` names the players the new host waits for before its world moves (the resume hold, matchHostCore.ts):
   * the seats that were in the match when the old host went, the elected seat among them and the old host not.
   */
  resume: (HostResumeState & { resumeTick: number; holdForSeats?: readonly string[] }) | null;
  /** The snapshot rate for the near tier (SNAPSHOT_HZ when absent; a divisor of the tick rate). */
  snapshotHz?: number;
  /** The room's team arrangement (sides, wave size, enemy nation, score target, respawn, Mars settings): with the mode it names the ruleset the actor plays by (hostRuleset.ts). Absent on a pre-lane sealed config: the mode's own table. */
  arrangement?: TeamArrangement | null;
  /** A Frontline room's campaign operation: its clock and difficulty bend the ruleset. */
  campaignOperationId?: string | null;
}

export interface HostMatchReport {
  matchId: string;
  generation: number;
  tick: number;
  phase: 'loading' | 'countdown' | 'playing' | 'ended';
  verdict?: { result: 'alpha' | 'bravo' | 'draw'; reason: string };
}

export interface HostCoreStats {
  tick: number;
  phase: string;
  clients: number;
  bytesOut: number;
  bytesIn: number;
  snapshots: number;
  keyframes: number;
  migrationKeyframes: number;
  tickP95Ms: number;
  /** The actor loop's tick cost (P3 certification, 2026-09-28): the median, the mean and the worst tick, and the loop's stalls. */
  tickP50Ms: number;
  tickMeanMs: number;
  tickMaxMs: number;
  tickCount: number;
  droppedTicks: number;
  stalls: number;
  lateWakeupMaxMs: number;
  verdict: string | null;
  /** The snapshot rate the actor publishes at (Hz). */
  snapshotHz: number;
  /** Snapshots skipped for a slow peer (its channel's bufferedAmount over the skip bound): never delayed, never queued (P3b). */
  snapshotSkips: number;
  /** Rows the interest tiers refreshed per tier (near, mid, far) and held over, and the tier populations of the newest snapshot summed over the viewers (P3b). */
  interest: { published: [number, number, number]; held: number; population: [number, number, number] };
  /** Own-row hints applied and refused after a migration (P3b: the migration seed for hulls this host could not see). */
  resumeHints: { applied: number; rejected: number };
  /**
   * The resume hold of a migrated host (null for a fresh boot, or a resume nobody else was in): how long the world stood
   * still, why it moved ('seats': every awaited seat was back; 'timeout': RESUME_HOLD_MS ran out; null: still holding),
   * and how many of the awaited seats came back in time.
   */
  resumeHold: { heldMs: number; released: 'seats' | 'timeout' | null; awaited: number; arrived: number } | null;
}

/**
 * A standby host's preparation (2026-10-14, the MP stream): what a boot of this match will need before any actor —
 * the battlefield's collision world (the mode's variant, from the manifests) and the roster's combat anatomy. A seat
 * that may host prepares its host thread while it plays as a peer, so an election boots the actor at once instead of
 * loading the thread, the world and the fleet while every seat waits (§13.21).
 */
export interface HostPrepareConfig {
  mapId: string;
  mode: string;
  manifestBase: string | null;
  simKernelsUrl?: string | null;
  /** The vehicles the match fields (seats and bots): the calibration groups the host loads. */
  specIds: string[];
  /** The match fields bots: the authority's bot navigation grid is built too (the dearest part of its creation). */
  bots?: boolean;
}

export type HostToWorkerMessage =
  /**
   * `bootTimeoutMs`: the host runtime's boot bound (matchHost.ts: past it the runtime fails itself and the room elects
   * another), which the core tells the seats its boot holds, as the runtime tells its own (bootHoldNoticeMs; round 3 B1/X6
   * review r1). Absent: ELECTED_HOST_BOOT_MS, the runtime's default.
   */
  | { type: 'boot'; config: HostBootConfig; bootTimeoutMs?: number }
  /** Load the world and the fleet a later boot will use (a standby host thread; ignored once a boot began). */
  | { type: 'prepare'; prepare: HostPrepareConfig }
  // playerId: the room-authenticated peer behind the link (the relayed signal's `from`; the host's own id on the loopback)
  | { type: 'link_open'; peer: number; label: string; playerId: string }
  | { type: 'link_frame'; peer: number; bytes: ArrayBuffer }
  | { type: 'link_close'; peer: number }
  | { type: 'link_pressure'; peer: number; bufferedAmount: number }
  /** The room removed this player mid-match: drop its seat and refuse its token (MatchActor.revokeSeat). */
  | { type: 'seat_revoke'; playerId: string }
  | { type: 'stop'; reason: CloseReasonId; detail: string }
  | { type: 'stats' };

export type WorkerToHostMessage =
  /**
   * `kernels`: whether the booted world steps on the world kernels, and why not (the page reports it: simKernelsReport.ts).
   * `timings`: the boot's ms from its start: the world (built, or the standby's), the fleet's anatomy, the actor, and in all.
   */
  | { type: 'ready'; tick: number; entities: number; resumed: boolean; kernels?: SimKernelsStatus;
    timings?: { worldMs: number; fleetMs: number; actorMs: number; bootMs: number; prepared: boolean } }
  /** A standby's preparation finished (`ok` false: the boot will build its own world); `ms` from the prepare to the end. */
  | { type: 'prepared'; ok: boolean; ms: number; error?: string }
  | { type: 'boot_failed'; error: string }
  | { type: 'link_send'; peer: number; bytes: ArrayBuffer }
  /** The actor closed the link: the main thread sends the wire CLOSE and closes the channel. */
  | { type: 'link_close'; peer: number; reason: CloseReasonId; detail: string }
  | { type: 'report'; report: HostMatchReport }
  | { type: 'stats'; stats: HostCoreStats }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; fields?: Record<string, unknown> };

/** One end of the main ↔ Worker channel (a Worker / `self` in the browser, an in-process pair in the receipts). */
export interface HostPort<Out, In> {
  post(message: Out, transfer?: ArrayBuffer[]): void;
  onMessage(listener: (message: In) => void): () => void;
  close(): void;
}

/** An in-process port pair (the receipts, the headless host): messages cross on a microtask, buffers are handed over as they are. */
export function createHostPortPair<A, B>(): { main: HostPort<A, B>; worker: HostPort<B, A> } {
  const toWorker = new Set<(message: A) => void>();
  const toMain = new Set<(message: B) => void>();
  let closed = false;
  const main: HostPort<A, B> = {
    post(message) { if (closed) return; queueMicrotask(() => { if (!closed) for (const listener of [...toWorker]) listener(message); }); },
    onMessage(listener) { toMain.add(listener); return () => { toMain.delete(listener); }; },
    close() { closed = true; toWorker.clear(); toMain.clear(); },
  };
  const worker: HostPort<B, A> = {
    post(message) { if (closed) return; queueMicrotask(() => { if (!closed) for (const listener of [...toMain]) listener(message); }); },
    onMessage(listener) { toWorker.add(listener); return () => { toWorker.delete(listener); }; },
    close() { closed = true; toWorker.clear(); toMain.clear(); },
  };
  return { main, worker };
}

/** The event kinds the host rides inside wire EVENT messages for migration (defined with the client's store). */
export { MIGRATION_EVENT_KIND } from '../match/migrationStore.ts';

/** The host's own loopback link number. */
export const HOST_LOOPBACK_PEER = 0;

/**
 * The most a HELLO that arrives during a host's boot waits for its WELCOME, as the host tells the seat (wire HOLD, round 3
 * B1/X6): what is left of the boot's bound, then the resume hold when the boot may await seats (one not yet configured may).
 * The one formula for both tellers (review r1: they were two), the host runtime to its own loopback seat (matchHost.ts) and
 * the core to its peers (matchHostCore.ts noticeHeld), each from the same bound, the runtime's bootTimeoutMs, and the same
 * hold, RESUME_HOLD_MS. Rounded up to whole milliseconds, within the wire's u32.
 */
export function bootHoldNoticeMs(bootLeftMs: number, holdMs: number, config: Pick<HostBootConfig, 'resume'> | null): number {
  const awaitsSeats = holdMs > 0 && (config === null || (config.resume?.holdForSeats?.length ?? 0) > 0);
  return Math.min(0xffffffff, Math.ceil(Math.max(0, bootLeftMs) + (awaitsSeats ? holdMs : 0)));
}
