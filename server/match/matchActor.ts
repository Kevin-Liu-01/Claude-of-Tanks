/**
 * MatchActor: one room's match. Owns the renderer-free authority, the 60 Hz
 * fixed-step loop, seat admission, input admission with the per-seat jitter
 * buffer, the pose history and lag-compensation hook, the per-viewer
 * snapshot publisher (20 Hz by default; interest tiers, per-peer skips), reliable
 * event delivery under the authority's reveal rules, chat, the verdict
 * callback and a graceful stop. Transport-agnostic (ClientLink).
 *
 * Vehicles: the spec-only authority fleet (src/vehicles/authorityFleet.ts), never the fleet's geometry. The caller
 * loads the roster's combat anatomy first (`ensureAuthorityFleet`: the browser host at boot, the Node service at
 * start); the actor refuses a roster whose calibration groups never loaded.
 */
import type { DestructionLogEntry } from '../../src/sim/destructionEvents.ts';
import { quantizeDestructionEntry } from '../../src/mp/wire/destructionLog.ts';
import { requireAuthorityFleet } from '../../src/vehicles/authorityFleet.ts';
import { createAuthoritativeMatch } from '../../src/sim/authoritativeMatch.ts';
import { camoSelectionBonus, planBotPaints } from '../../src/sim/camoPaint.ts';
import type { BotCamo } from '../../src/sim/camoPaint.ts';
import { stockCamoPatternIdFor } from '../../src/vehicles/camoPolicy.ts';
import type {
  AuthoritativeEntity, AuthoritativeMatch, AuthoritativePlayerInput, AuthoritativePlayerRecord, AuthoritativeWorldCollision,
} from '../../src/sim/authoritativeMatch.ts';
import { endingHoldExpired, matchRulesetFor, terrainVariantFor, type MatchRuleset } from '../../src/sim/matchRuleset.ts';
import { normalizeGameMode, type GameModeId } from '../../src/sim/matchModes.ts';
import { SIM_DT } from '../../src/sim/movement.ts';
import { applyAuthorityRow } from '../../src/mp/match/authorityRow.ts';
import { createDedicatedWorldCollision } from '../dedicatedWorldCollision.ts';
import type { WorldKernelModule } from '../../src/world/wasmWorldKernels.ts';
import {
  CLOSE_REASON, HELLO_CAPABILITY, INPUT_MARGIN_UNKNOWN, MAX_CLIENT_MESSAGE_BYTES, MAX_ENTITIES, MAX_SEATS, MESSAGE_TYPE,
  NO_ENTITY, NO_SEAT, NO_TICK, PROTOCOL_VERSION, SHELL_FLAGS, SNAPSHOT_HZ, TEAM, TICK_HZ,
} from '../../src/mp/wire/constants.ts';
import type { CloseReasonId, TeamId } from '../../src/mp/wire/constants.ts';
import { decodeMessage, encodeMessage, shellTypeIndex } from '../../src/mp/wire/codec.ts';
import type {
  EntityRow, EventMessage, HelloMessage, InputMessage, ResumeHintMessage, RosterEntry, ShellRow, SnapshotFrame, SnapshotMeta, WireEvent, WireMessage,
} from '../../src/mp/wire/messages.ts';
import { captureShellSnapshot, type QuantizedShellSnapshot, type SnapshotShellSource } from '../../src/sim/worldSnapshot.ts';
import { dequantizePosition, dequantizeVelocity } from '../../src/mp/wire/quantize.ts';
import { estimateEntityRowBytes } from '../../src/mp/wire/rows.ts';
import { createEventPayloadCache } from '../../src/mp/wire/eventPayload.ts';
import { MATCH_BUILD, compareMatchBuilds, matchBuildRefusalCode, matchBuildRefused } from '../../src/mp/wire/matchBuild.ts';
import { captureEntityRow, captureMeta, captureViewerState, createEraIndexer } from './entityRows.ts';
import {
  HOST_UPLINK_TARGET_BPS, INTEREST_ENGAGED_TICKS, INTEREST_NEAR_MISS_M, MAX_DEFERRED_STALENESS, beginSnapshot, createViewerInterest,
  deferRow, engageEntity, mustRefreshRow, needsFreshRow, recordRow, rowStaleness, snapshotRowBudgetBytes, viewerTierFor,
} from './interestTiers.ts';
import type { InterestTier, ViewerInterest } from './interestTiers.ts';
import { createSeatInputBuffer, type SeatInputBuffer } from './inputBuffer.ts';
import { createLagCompensation, createLatencyTracker, type LagCompensation, type LatencyTracker } from './lagCompensation.ts';
import { createFixedStepLoop, type FixedStepLoop } from './loop.ts';
import { createViewerPublisher, keyframeSlotFor, type ViewerPublisher } from './publisher.ts';
import { createChatLimiter, normalizeChatText, type ChatLimiter } from './chat.ts';
import { createUnseenShellMarks, type UnseenShellMarks } from './unseenShellMarks.ts';
import type { ClientLink } from './link.ts';
import { silentLogger, type Logger } from './log.ts';
import type { SeatClaims } from './seatToken.ts';

export type SeatTeam = 'alpha' | 'bravo' | 'spectator';

export interface ActorSeatSpec {
  seat: number;
  playerId: string;
  name: string;
  team: SeatTeam;
  specId: string;
  equipment?: readonly string[] | null;
  /** The consumable in each slot (sim/consumableRules.ts); absent carries the default trio. */
  consumables?: readonly string[] | null;
  /** The seat's chosen camouflage (the room's camo: 'auto', 'factory' or a scheme); absent, factory. Its spotting bonus on
   * the match's map is the one rule both drivers stamp (sim/camoPaint.ts). */
  camo?: string | null;
  /** A spawn override (the receipts place hulls at known distances); the layout's spawn otherwise. */
  spawn?: { x: number; z: number; yaw?: number };
}

export interface ActorBotSpec {
  playerId: string;
  name: string;
  team: 'alpha' | 'bravo';
  specId: string;
  difficulty?: 'easy' | 'normal' | 'hard';
  /** The bot's paint as the old host's roster carried it (host migration); absent, the authority rolls it. */
  camo?: BotCamo;
}

export interface MatchVerdict {
  roomId: string;
  result: 'alpha' | 'bravo' | 'draw';
  reason: string;
  tick: number;
  battleTimeMs: number;
  entities: { entityId: number; playerId: string; bot: boolean; team: SeatTeam; kills: number; damage: number; destroyed: boolean }[];
}

/** A ready collision world the caller built (the browser host: the fetched manifest through createHeadlessCollisionWorld). */
export interface ActorWorldCollision extends AuthoritativeWorldCollision {
  release?(): void;
}

/**
 * Peer-to-peer host migration (P2 client lane, 2026-09-28): the elected host boots the actor at the authority tick the
 * match reached (the tick timeline stays continuous with the old host's, so every client's server clock and input lead
 * still fit) with the battle clock already at `battleTimeMs`; the countdown is skipped, the entities are restored by
 * the host runtime from the retained keyframe before the loop starts.
 */
export interface MatchActorResume {
  tick: number;
  battleTimeMs: number;
  /**
   * When `tick` was due on the old host's timeline, on this actor's clock (`now`). The loop then starts on that timeline,
   * the ticks the world stood still meanwhile (the new host loading its world, the resume hold) skipped (267): every
   * client's clock carries the old host's time, and a loop started at `tick` later than that ran behind it by the delay,
   * the clients' controls aimed that far ahead. Without it the loop starts at `tick` when it starts.
   */
  dueAtMs?: number;
  /**
   * The phase the old host was in (audit M1, 2026-11-02; 'playing' when absent). Every resume used to skip the countdown
   * and run, so a host lost during the countdown went live at once while its peers were still in their covered entry,
   * and a keyframe sealed after the verdict resumed as a running match. Now a countdown resumes with `countdownMs` left
   * and an ended match stays ended with its `verdict` (the authority's restoreVerdict: no event, the hold spent).
   */
  phase?: 'countdown' | 'playing' | 'ended';
  countdownMs?: number;
  verdict?: { result: 'alpha' | 'bravo' | 'draw'; reason: string } | null;
  /**
   * The battle this actor plays (round 3 A3; WelcomeMessage.battleId, u32): the resumed battle's (the sealed keyframe's),
   * or a fallback restart's own (migrationState.ts migrationFallback). Absent: 0, a match's first battle.
   */
  battleId?: number;
}

export interface MatchActorOptions {
  roomId: string;
  mapId: string;
  mode?: string;
  seed: number;
  seats: ActorSeatSpec[];
  bots?: ActorBotSpec[];
  ruleset?: MatchRuleset;
  countdownS?: number;
  battleLimitS?: number;
  /**
   * 'dedicated' loads the map's collision shard (production, Node); 'terrain' uses the bare height field (fast
   * receipts); an object is a ready world (the browser host builds it from the fetched manifest).
   */
  world?: 'dedicated' | 'terrain' | ActorWorldCollision;
  /** A 'dedicated' world's WebAssembly kernels (server/match/simKernels.ts, COT_SIM_KERNELS=wasm); off when absent. */
  worldKernels?: WorldKernelModule | null;
  resume?: MatchActorResume | null;
  log?: Logger;
  onVerdict?: (verdict: MatchVerdict) => void;
  /** The actor stopped (its own end after the verdict's linger, or a stop() from its owner); called once, after its clients are detached. */
  onStop?: (reason: CloseReasonId) => void;
  now?: () => number;
  schedule?: (callback: () => void, delayMs: number) => () => void;
  /** Start the loop and the countdown immediately (default true). */
  autoStart?: boolean;
  /** Ticks the actor keeps publishing after the verdict before it stops (default: the ruleset's ending hold + 2 s, at least 5 s). */
  endedLingerTicks?: number;
  /** Snapshots per second for the near tier (SNAPSHOT_HZ by default; must divide TICK_HZ). The WELCOME names it; the tiers halve and third it. */
  snapshotHz?: number;
  /** A client this long after its WELCOME is still in its covered entry (ENTRY_BACKPRESSURE_GRACE_MS by default). */
  entryBackpressureGraceMs?: number;
  /** Continuous soft pressure that closes a client still in its entry grace (ENTRY_BACKPRESSURE_SUSTAINED_MS by default). */
  entryBackpressureSustainedMs?: number;
  /**
   * This host's build line (src/mp/wire/matchBuild.ts; default MATCH_BUILD): a HELLO whose prediction code differs is
   * refused with PROTOCOL_VERSION and a refusal code, one whose authority alone differs is admitted and logged.
   */
  build?: string;
  /**
   * (mp-scale-251) Phase timings for the scaling bench (tools/mp-scale-bench.mjs): the actor reads `profile.clock` around
   * the authority's step, the event fan-out and each viewer's frame build, encode and send, and the authority reads it
   * around its spotting update. Never given in a match: without it no clock is read.
   */
  profile?: MatchActorProfile;
  /**
   * The host uplink the snapshot budget shares among the viewers (bits per second; HOST_UPLINK_TARGET_BPS by default,
   * interestTiers.ts): each viewer's due mid and far rows are refreshed most stale first within its share, and the
   * rest wait a snapshot. 0 turns the budget off (the tiers' cadences alone).
   */
  uplinkTargetBps?: number;
  /**
   * How a viewer frame reads the authority: 'observe' (default; observeForViewer and snapshotMeta, mp-scale-251) or
   * 'snapshot' (the full viewer snapshot, its per-entity capture unused). The frames are the same bytes; receipts and
   * the scaling bench compare the two.
   */
  frameView?: 'observe' | 'snapshot';
}

/** Accumulated phase timings (ms) of a profiled actor (MatchActorOptions.profile). */
export interface MatchActorProfile {
  clock: () => number;
  /** The authority's step, spotting included. */
  stepMs: number;
  /** Of which the spotting update. */
  spottingMs: number;
  /** The event fan-out: each viewer's observable events, encoded and sent. */
  eventsMs: number;
  /** Each viewer's frame: the spotting-filtered viewer snapshot, the tiered rows, shells and meta. */
  buildMs: number;
  /** Of which the authority's viewer view (what the viewer may observe, and the meta). */
  viewMs: number;
  /** Each viewer's packet: keyframe or delta against its baseline, encoded. */
  encodeMs: number;
  sendMs: number;
  ticks: number;
  frames: number;
}

/** Rows the interest tiers published (refreshed) and held per tier (P3b, 2026-09-29). */
export interface InterestStats {
  /** Rows refreshed per tier (near, mid, far), cumulative. */
  published: [number, number, number];
  /** Rows carried over unchanged, cumulative. */
  held: number;
  /** Entities per tier in the newest snapshot (summed over viewers on the actor total). */
  population: [number, number, number];
  /** Due rows the snapshot budget held back a snapshot, cumulative (interestTiers.ts). */
  deferred: number;
}

export interface ActorClientStats {
  seat: number;
  entityId: number;
  playerId: string;
  spectator: boolean;
  bytesOut: number;
  bytesIn: number;
  snapshots: number;
  keyframes: number;
  droppedSnapshots: number;
  events: number;
  rttMs: number;
  rewindTicks: number;
  inputMargin: number | null;
  bufferTicks: number;
  /** Frames refused past the input ring's horizon, braking ticks, and the longest braking run a control ended (267). */
  input: { refused: number; dry: number; longestDry: number };
  interest: InterestStats;
}

/**
 * The match's one phase (audit M3, 2026-11-02), owned by the actor and read through MatchActor.phase: the authority's
 * loading | countdown | playing, then `ending` (the verdict is in and the ruleset's ending hold runs: the field alive,
 * guns silent), `ended` (the hold is spent: the field stands still while the actor lingers, publishing it) and
 * `stopped` (the actor released the room). Before, the authority's MatchPhase stopped at playing, the actor layered
 * `ended`/`stopped` booleans on it, and the full phase was rebuilt three ways (the actor's stats, the control API and
 * the LAN host's status, which fell back to 'unknown').
 */
export type MatchActorPhase = 'loading' | 'countdown' | 'playing' | 'ending' | 'ended' | 'stopped';

const battleClockScreens = new WeakMap<object, { offsetS: number; screen: Record<string, unknown> }>();
/** A smoke screen with its launch time on the battle clock (one copy per screen and offset: the frames reuse it). */
function smokeOnBattleClock(screen: unknown, offsetS: number): unknown {
  if (!screen || typeof screen !== 'object' || typeof (screen as { born?: unknown }).born !== 'number') return screen;
  const cached = battleClockScreens.get(screen);
  if (cached && cached.offsetS === offsetS) return cached.screen;
  const shifted = { ...(screen as Record<string, unknown>), born: Math.round(((screen as { born: number }).born + offsetS) * 1000) / 1000 };
  battleClockScreens.set(screen, { offsetS, screen: shifted });
  return shifted;
}

/**
 * An authority meta on the battle clock the clients read (a resumed actor's: the authority's own clock plus what the old
 * hosts had played, `resumedBattleTimeMs`): its battleTimeMs and every smoke screen's launch time (round 2 U2). A client
 * ages a network screen by its battle clock (battlePresentation.ts game.timeS, auxiliaryPresentation.ts), so on a
 * resumed host every screen read as launched `resumedBattleTimeMs` ago: past SMOKE_DURATION_S, it was never drawn. The
 * migration keyframe's meta goes through it too (matchHostCore.ts buildKeyframe), so a resume reads every screen on one
 * clock (migrationState.ts applyResumeState).
 */
export function metaOnBattleClock(meta: Record<string, unknown> | null, resumedBattleTimeMs: number): Record<string, unknown> | null {
  if (!resumedBattleTimeMs || !meta) return meta;
  const screens = meta.smokeScreens;
  const offsetS = resumedBattleTimeMs / 1000;
  return {
    ...meta, battleTimeMs: (Number(meta.battleTimeMs) || 0) + resumedBattleTimeMs,
    ...(Array.isArray(screens) && screens.length ? { smokeScreens: screens.map((screen) => smokeOnBattleClock(screen, offsetS)) } : {}),
  };
}
/** The phase in the rooms' status vocabulary (MatchHostStatus.phase): the hold and its end are both 'ended'. */
export type MatchStatusPhase = 'loading' | 'countdown' | 'playing' | 'ended' | 'stopped';

/** The one status reading of a match phase (the control API, the LAN host, the actor's stats and the host core's reports). */
export function matchStatusPhase(phase: MatchActorPhase): MatchStatusPhase {
  return phase === 'ending' ? 'ended' : phase;
}

/** A match past its verdict, or stopped: a new start may replace it. */
export function matchConcluded(phase: MatchActorPhase): boolean {
  return phase === 'ending' || phase === 'ended' || phase === 'stopped';
}

export interface MatchActorStats {
  roomId: string;
  mapId: string;
  mode: string;
  tick: number;
  phase: string;
  clients: number;
  spectators: number;
  seatsFilled: number;
  bots: number;
  bytesOut: number;
  bytesIn: number;
  snapshots: number;
  keyframes: number;
  droppedSnapshots: number;
  backpressureCloses: number;
  events: number;
  malformed: number;
  rejectedInputs: number;
  tickMs: { p50: number; p95: number; max: number; mean: number; count: number };
  loop: { droppedTicks: number; stalls: number; lateWakeupMaxMs: number };
  snapshotHz: number;
  lagComp: { rewoundShots: number; rewoundSweeps: number; mismatchMeanM: number; mismatchMaxM: number; historyMisses: number };
  verdict: string | null;
  interest: InterestStats;
  resumeHints: ResumeHintStats;
}

/** The migration seed for unseen hulls (P3b, 2026-09-29; docs/MULTIPLAYER-V2.md §13.9.5): resume hints applied and refused, by reason. */
export interface ResumeHintStats {
  applied: number;
  rejected: number;
  reasons: { noResume: number; notRestored: number; repeated: number; older: number; future: number; tooFar: number; tooHigh: number; tooFast: number; noSeat: number; late: number };
}

export interface MatchActor {
  readonly roomId: string;
  /** The ruleset the match plays by (the WELCOME's rulesetJson): the mode's table bent by the room's arrangement. */
  readonly ruleset: MatchRuleset;
  readonly tick: number;
  /** The match's phase (MatchActorPhase): the one reading every status and restart gate goes through. */
  readonly phase: MatchActorPhase;
  readonly ended: boolean;
  readonly stopped: boolean;
  readonly authority: AuthoritativeMatch;
  readonly loop: FixedStepLoop;
  readonly lagComp: LagCompensation;
  /** Admit a link whose HELLO carried verified seat claims for this room. */
  attach(link: ClientLink, hello: HelloMessage, claims: SeatClaims): boolean;
  /**
   * The room removed this player (an admin kick or a leave) while the match runs: detach its seat and refuse its seat token
   * for the rest of this match (security audit 2026-10-22: a kick used to rely on the kicked client leaving on its own).
   */
  revokeSeat(playerId: string, detail?: string): boolean;
  /** The authority entity behind a wire entity id (1..64), null for an unknown id. */
  entityForWireId(entityId: number): AuthoritativeEntity | null;
  /** The wire entity id of a player or bot id, null for an unknown one. */
  wireIdOf(playerId: string): number | null;
  /** Battle time the actor resumed at (0 for a fresh match): every published battle clock adds it. */
  readonly resumedBattleTimeMs: number;
  /** The battle this actor plays (MatchActorResume.battleId; 0 for a match's first battle): its WELCOMEs and keyframes carry it. */
  readonly battleId: number;
  /**
   * The row an entity was restored from at a migration (`applyResumeState` names it): a later RESUME_HINT from that
   * entity's own seat is applied only when it is newer than this row and within the distance the hull could have driven
   * since — the migration seed for a hull the new host could not see (P3b).
   */
  noteRestoredRow(entityId: number, tick: number, x: number, z: number): void;
  /** Inject a server-side reliable event to every viewer (roster/admin changes from the room service). */
  broadcastEvent(event: WireEvent): void;
  advance(nowMs?: number): number;
  start(): void;
  stop(reason?: CloseReasonId, detail?: string): void;
  stats(): MatchActorStats;
  clientStats(): ActorClientStats[];
}

interface ActorClient {
  link: ClientLink;
  seat: number;
  entityId: number;
  entity: AuthoritativeEntity | null;
  playerId: string;
  name: string;
  team: SeatTeam;
  viewerId: string;
  spectator: boolean;
  capabilities: number;
  input: SeatInputBuffer;
  publisher: ViewerPublisher;
  interest: ViewerInterest;
  latency: LatencyTracker;
  chat: ChatLimiter;
  bytesOut: number;
  bytesIn: number;
  events: number;
  droppedSnapshots: number;
  malformed: number;
  pressureSinceMs: number | null;
  /** The first snapshot backpressure withheld since this client's last published one (SNAPSHOT_STARVED_CLOSE_MS); null while it is fed. */
  starvedSinceMs: number | null;
  /** When the WELCOME went out: the start of the client's entry grace (ENTRY_BACKPRESSURE_GRACE_MS). */
  welcomedAtMs: number;
  /** The message-rate token bucket: `tokens` refill at MAX_MESSAGES_PER_SECOND up to MESSAGE_BURST. */
  rate: { tokens: number; lastMs: number };
  closing: boolean;
  /** The rounds this client's frames showed that left its view in flight (round 2 U31; bounded, round 3 A13). */
  unseenMarks: UnseenShellMarks;
}

/**
 * Per-peer rate adaptation (P3b, 2026-09-29; docs/MULTIPLAYER-V2.md §13.9.3): a viewer whose link holds more than
 * SNAPSHOT_SKIP_BYTES unsent (≈ 0.7 s of snapshots at 14v14) has this snapshot skipped — never delayed, never queued
 * behind — so a slow peer only ever falls a snapshot behind and never slows the others; above the soft bound for
 * BACKPRESSURE_SUSTAINED_MS, or the hard bound at once, the link closes as BACKPRESSURE.
 */
export const SNAPSHOT_SKIP_BYTES = 16 * 1024;
/**
 * How many snapshots apart the viewer's movement checkpoint (the 48-float integrator state its prediction rewinds to)
 * rides: every one. It is 48 of ≈ 206 kbit/s per viewer at 30 Hz (P3b's attribution, 2026-09-29) and a 10 Hz cadence
 * was tried: 3 cm of own misprediction in `snapshotRate.selftest`, but at 14v14 in the soak 257 hard snaps and 1.19 m
 * of end desync against 60 and 0.15 m with a checkpoint every snapshot — the predictor replaying from the row alone
 * between checkpoints diverges under contact. Not taken; the knob stays for a later measured cut.
 */
export const VIEWER_CHECKPOINT_EVERY_SNAPSHOTS = 1;
const BACKPRESSURE_SOFT_BYTES = 64 * 1024;
const BACKPRESSURE_HARD_BYTES = 512 * 1024;
const BACKPRESSURE_SUSTAINED_MS = 2000;
/**
 * The longest a viewer may go without a published snapshot while backpressure withholds them (audit S1, 2026-11-02),
 * outside its entry grace (inside it: the entry's sustained limit). The skip band (SNAPSHOT_SKIP_BYTES up to the soft
 * bound) never closed a link, and the soft band's clock restarted whenever a reading dipped to the soft bound or
 * under, so a link stalled in the skip band, or swinging across the soft bound, starved its viewer indefinitely. This
 * clock runs from the first withheld snapshot across both bands and every dip, and only a published snapshot stops it.
 * Past it the link closes as BACKPRESSURE "starved" and the seat comes back on a fresh link with a keyframe. It is past
 * the client's own stall clock (5 s, match/recovery.ts), so a client that can still ask for a fresh link does so first.
 */
export const SNAPSHOT_STARVED_CLOSE_MS = 10_000;
/**
 * 2026-10-10 (the black-screen lane; an ABBA under load ~110: the room found the creator's tab silent while its own entry
 * blocked it and elected the next seat, whose actor then closed both peers, the demoted creator and the third seat, with
 * BACKPRESSURE "sustained" about 26 s after their WELCOME, still in their first entry): a client's covered entry runs
 * synchronous steps of seconds under load (the opening FX warm 4.3 s, the first shadow maps 2.9 s, a deferred shader link),
 * and its link cannot drain meanwhile, so 2 s of soft pressure dropped seats that were loading, not dead. (The host's own
 * loopback seat reports no pressure, so this rule only ever closes remote peers.) The client streams neutral inputs from its WELCOME on
 * (matchClient sampleInputs), so no wire signal marks the end of its cover: for ENTRY_BACKPRESSURE_GRACE_MS after the
 * WELCOME, soft pressure closes the link only after ENTRY_BACKPRESSURE_SUSTAINED_MS of continuous pressure (a dead link,
 * not a busy one: a loading client drains between its synchronous steps, which resets the clock). Stale snapshots are
 * still dropped, never queued; the hard bound in the grace is ENTRY_BACKPRESSURE_HARD_BYTES (below).
 */
export const ENTRY_BACKPRESSURE_GRACE_MS = 120_000;
export const ENTRY_BACKPRESSURE_SUSTAINED_MS = 60_000;
/**
 * (battle-spikes-253; nav-perf's rooms census on a loaded Mac, Suzhou Creek: both seats closed "server 9" after a 13-16 s
 * covered entry) The hard bound in the entry grace. A link's pressure reaches the actor only when its page pumps
 * (matchHost link_pressure); a page whose own entry blocks it for seconds pumps nothing, so the actor goes on publishing
 * against a stale low reading, and when the page frees up it forwards that backlog into the link at once: the next
 * reading is a burst past BACKPRESSURE_HARD_BYTES that the host's own blocking made, not a dead peer. In the grace such a
 * burst takes the soft path (the snapshot dropped, the long sustained limit's clock) and only this much closes at once,
 * still a bound on the host's memory; after the grace the hard bound is BACKPRESSURE_HARD_BYTES again.
 */
export const ENTRY_BACKPRESSURE_HARD_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGES_PER_SECOND = 150;
/**
 * The message-rate limit is a token bucket (P3b, 2026-09-29): a client sends ≈ 65 messages a second (inputs at 60 Hz
 * and pings), and the old fixed one-second window closed every peer of a browser host whose main thread stalled for two
 * seconds — the game page's battle reveal compiled shaders while its actor already ran, the peers' frames queued on the
 * main thread and reached the Worker in one burst (the realism soak, 2026-09-29). A backlog of a few seconds of honest
 * traffic now passes; a flood still trips within seconds (900 tokens at 150 a second: a 1,000 messages/s sender is
 * closed in about a second).
 */
const MESSAGE_BURST = 900;
/**
 * A viewer frame's shells at most (the world snapshot's own bound). At most MAX_UNSEEN_SHELLS, so every round that leaves
 * a view in flight is named in the frame it left (unseenShellMarks.ts, round 3 A13).
 */
const MAX_VIEW_SHELLS = 256;
const MAX_MALFORMED = 20;
const TICK_MS = SIM_DT * 1000;

const TEAM_ID: Record<SeatTeam, TeamId> = { alpha: TEAM.ALPHA, bravo: TEAM.BRAVO, spectator: TEAM.SPECTATOR };

function teamOf(entity: AuthoritativeEntity): SeatTeam {
  return entity.team === 'bravo' ? 'bravo' : 'alpha';
}

function clampI16(value: number): number {
  return value < -32768 ? -32768 : value > 32767 ? 32767 : value;
}

/** A resume hint's vertical speed bound (m/s): a hull falling from a ~45 m drop; a true row never climbs or falls faster. */
const RESUME_HINT_MAX_VERTICAL_MPS = 30;
/** A resume hint's gun pitch is clamped (never refused) to the gun's limits with this slack (rad): rounding must not refuse a true row. */
const RESUME_HINT_PITCH_SLACK_RAD = 0.05;
/** The resume hint's pitch limit (rad, either way) for a spec that declares no elevation or depression. */
const RESUME_HINT_FALLBACK_PITCH_RAD = 0.6;
const DEG_TO_RAD = Math.PI / 180;

export function createMatchActor(options: MatchActorOptions): MatchActor {
  const {
    roomId, mapId, seed, seats, bots = [], battleLimitS, world = 'dedicated', worldKernels = null,
    log = silentLogger, onVerdict, onStop, now = () => performance.now(), schedule, autoStart = true,
    endedLingerTicks, resume = null, build = MATCH_BUILD, profile, uplinkTargetBps = HOST_UPLINK_TARGET_BPS, frameView = 'observe',
  } = options;
  if (!/^[a-zA-Z0-9_-]{1,48}$/.test(roomId)) throw new TypeError('roomId must be a safe id');
  if (resume && (!Number.isInteger(resume.tick) || resume.tick < 0 || !(resume.battleTimeMs >= 0) || !Number.isFinite(resume.battleTimeMs)
      || (resume.dueAtMs !== undefined && !Number.isFinite(resume.dueAtMs)))) {
    throw new TypeError('resume needs an integer tick >= 0, a finite battleTimeMs >= 0 and a finite dueAtMs if any');
  }
  if (resume && ((resume.phase !== undefined && resume.phase !== 'countdown' && resume.phase !== 'playing' && resume.phase !== 'ended')
      || (resume.countdownMs !== undefined && !(resume.countdownMs >= 0 && Number.isFinite(resume.countdownMs))))) {
    throw new TypeError('resume phase must be countdown, playing or ended, and its countdownMs finite and >= 0');
  }
  if (resume && resume.battleId !== undefined && !(Number.isInteger(resume.battleId) && resume.battleId >= 0 && resume.battleId <= 0xffffffff)) {
    throw new TypeError('resume battleId must be a u32');
  }
  const battleId = resume?.battleId ?? 0;
  const mode: GameModeId = normalizeGameMode(options.mode ?? 'standard');
  const ruleset = options.ruleset && options.ruleset.mode === mode ? options.ruleset : matchRulesetFor(mode);
  const snapshotHz = options.snapshotHz ?? SNAPSHOT_HZ;
  if (!Number.isInteger(snapshotHz) || snapshotHz < 1 || snapshotHz > TICK_HZ || TICK_HZ % snapshotHz !== 0) {
    throw new TypeError(`snapshotHz must be an integer divisor of ${TICK_HZ} (${snapshotHz})`);
  }
  const snapshotEveryTicks = TICK_HZ / snapshotHz;
  const entryBackpressureGraceMs = options.entryBackpressureGraceMs ?? ENTRY_BACKPRESSURE_GRACE_MS;
  const entryBackpressureSustainedMs = options.entryBackpressureSustainedMs ?? ENTRY_BACKPRESSURE_SUSTAINED_MS;
  if (!(entryBackpressureGraceMs >= 0) || !(entryBackpressureSustainedMs >= BACKPRESSURE_SUSTAINED_MS)) {
    throw new TypeError('entry backpressure grace must be >= 0 and its sustained limit at least the steady one');
  }
  /** The continuous soft pressure that closes this client now: longer while it is still in its entry grace. */
  const sustainedPressureLimitMs = (client: ActorClient, nowMs: number): number => (
    nowMs - client.welcomedAtMs < entryBackpressureGraceMs ? entryBackpressureSustainedMs : BACKPRESSURE_SUSTAINED_MS
  );
  /** The time without a published snapshot that closes this client (SNAPSHOT_STARVED_CLOSE_MS; the entry's sustained limit in its grace). */
  const starvedLimitMs = (client: ActorClient, nowMs: number): number => (
    nowMs - client.welcomedAtMs < entryBackpressureGraceMs ? entryBackpressureSustainedMs : SNAPSHOT_STARVED_CLOSE_MS
  );
  /** The buffered bytes that close this client at once: ENTRY_BACKPRESSURE_HARD_BYTES while it is in its entry grace. */
  const hardPressureBytes = (client: ActorClient, nowMs: number): number => (
    nowMs - client.welcomedAtMs < entryBackpressureGraceMs ? ENTRY_BACKPRESSURE_HARD_BYTES : BACKPRESSURE_HARD_BYTES
  );
  const checkpointEverySnapshots = VIEWER_CHECKPOINT_EVERY_SNAPSHOTS;
  const actorLog = log.child({ room: roomId, map: mapId });
  const publishFailures = new WeakSet<object>();
  // A resumed match continues its countdown or its battle where the old host left it (MatchActorResume.phase); its battle
  // clock continues from the newest frame's time (the HUD's): the authority runs its mode clock and its full clock limit
  // on that one clock (272, improve-271 plan 010).
  const resumedBattleTimeMs = resume ? Math.round(resume.battleTimeMs) : 0;
  const resumedVerdict = resume?.phase === 'ended' && resume.verdict ? resume.verdict : null;
  const countdownS = resume ? (resume.phase === 'countdown' ? (resume.countdownMs ?? 0) / 1000 : 0) : options.countdownS ?? 5;

  // ---- roster: seats first (entity ids in seat order), then bots
  const players: AuthoritativePlayerRecord[] = [];
  const seatById = new Map<number, ActorSeatSpec>();
  const seatOfPlayer = new Map<string, ActorSeatSpec>();
  const entityIdOf = new Map<string, number>();
  const rosterEntries: RosterEntry[] = [];
  let nextEntityId = 1;
  for (const spec of seats) {
    if (!Number.isInteger(spec.seat) || spec.seat < 0 || spec.seat >= MAX_SEATS || seatById.has(spec.seat)) {
      throw new TypeError(`invalid or duplicate seat ${spec.seat}`);
    }
    if (seatOfPlayer.has(spec.playerId)) throw new TypeError(`duplicate player ${spec.playerId}`);
    seatById.set(spec.seat, spec);
    seatOfPlayer.set(spec.playerId, spec);
    if (spec.team === 'spectator') continue;
    const entityId = nextEntityId++;
    entityIdOf.set(spec.playerId, entityId);
    players.push({
      id: spec.playerId, specId: spec.specId, team: spec.team, equipment: spec.equipment ?? null,
      consumables: spec.consumables ?? null, camoBonus: camoSelectionBonus(spec.camo, stockCamoPatternIdFor(spec.specId), mapId),
      ...(spec.spawn ? { spawn: spec.spawn } : {}),
    });
    rosterEntries.push({ entityId, seat: spec.seat, team: TEAM_ID[spec.team], bot: false, connected: false, playerId: spec.playerId, name: spec.name, specId: spec.specId });
  }
  // (268, item 6; round 8 Y1 s4-06) each bot's paint is the match's roll at its roster index, or the roster's on a resumed
  // match: the one rule (sim/camoPaint.ts planBotPaints) a client's guess before the WELCOME reads too. The authority takes
  // it as the record's paint, its bonus with it; the WELCOME's roster carries it below, so every client paints what the
  // authority scores
  const botPaints = planBotPaints(seats, bots, seed, mapId);
  bots.forEach((bot, ordinal) => {
    if (seatOfPlayer.has(bot.playerId) || entityIdOf.has(bot.playerId)) throw new TypeError(`duplicate bot ${bot.playerId}`);
    const entityId = nextEntityId++;
    entityIdOf.set(bot.playerId, entityId);
    players.push({ id: bot.playerId, specId: bot.specId, team: bot.team, bot: true, difficulty: bot.difficulty ?? 'normal',
      camo: botPaints[ordinal] });
    rosterEntries.push({ entityId, seat: NO_SEAT, team: TEAM_ID[bot.team], bot: true, connected: true, playerId: bot.playerId, name: bot.name, specId: bot.specId });
  });
  if (players.length < 1 || players.length > MAX_ENTITIES) throw new TypeError(`rooms field 1..${MAX_ENTITIES} entities`);
  // Every hull's armor, modules, crew and hit shells are finalized before the authority reads them (spectators ride no hull).
  requireAuthorityFleet(players.map((player) => player.specId));

  // ---- authority and world
  const collision: ActorWorldCollision | null = typeof world === 'object' && world !== null ? world
    : world === 'dedicated' ? createDedicatedWorldCollision(mapId, { retain: true, variant: terrainVariantFor(mode), kernels: worldKernels }) : null;
  const releaseWorld = () => { if (collision && typeof collision.release === 'function') collision.release(); };
  let authority: AuthoritativeMatch;
  let lagComp: LagCompensation;
  try {
    const bound: { hook: LagCompensation | null } = { hook: null };
    authority = createAuthoritativeMatch({
      players, mapId, seed, countdownS, gameMode: mode, ruleset,
      ...(battleLimitS != null ? { battleLimitS } : {}), resumedAtS: resumedBattleTimeMs / 1000,
      worldCollision: collision,
      shellRewind: { begin: (shell) => bound.hook?.begin(shell), end: (shell) => bound.hook?.end(shell) },
      ...(profile ? { profile } : {}),
    });
    lagComp = createLagCompensation({ entities: authority.entities });
    bound.hook = lagComp;
    // an ended match resumes ended: the first tick settles the verdict it carried (settleVerdict), the field stays still
    if (resumedVerdict) authority.restoreVerdict(resumedVerdict.result, resumedVerdict.reason);
  } catch (error) {
    releaseWorld();
    throw error;
  }
  const entityByWireId = new Map<number, AuthoritativeEntity>();
  for (const entity of authority.entities) {
    const entityId = entityIdOf.get(entity.id)!;
    entityByWireId.set(entityId, entity);
    lagComp.bind(entity, entityId - 1);
  }
  for (const entry of rosterEntries) if (entry.bot) entry.camo = entityByWireId.get(entry.entityId)?.camo ?? 'factory';
  const era = createEraIndexer();
  // the authority's view for one viewer frame (buildFrame), reused for every frame
  const viewEntities: AuthoritativeEntity[] = [];
  const viewShells: SnapshotShellSource[] = [];
  const viewQuantizedShells: QuantizedShellSnapshot[] = [];
  /** The authority's round behind each viewQuantizedShells entry (the observe view only). */
  const viewShellSources: SnapshotShellSource[] = [];
  let frameMeta: SnapshotMeta | null = null;
  let frameMetaTick = -1;
  // the snapshot budget's scratch (buildFrame): the due mid and far rows of one viewer's frame, reused for every frame
  let rowBudgetBytes = Infinity;
  const dueIds = new Int32Array(MAX_ENTITIES + 1);
  const dueTiers = new Uint8Array(MAX_ENTITIES + 1);
  const dueStaleness = new Float64Array(MAX_ENTITIES + 1);
  const dueOrder = new Int32Array(MAX_ENTITIES + 1);
  const dueRows: Array<EntityRow | null> = new Array(MAX_ENTITIES + 1).fill(null);
  // each event's wire payload, encoded once however many viewers receive it (eventPayload.ts)
  const eventPayloadOf = createEventPayloadCache();
  const rulesetJson = JSON.stringify(ruleset);

  // ---- clients
  const clients = new Map<ActorClient, true>();
  const clientBySeat = new Map<number, ActorClient>();
  const rowCache = new Map<number, EntityRow>();
  let rowCacheTick = -1;
  let sortedDestroyed: number[] = [];
  let destroyedRevision = -1;
  let destroyedLength = -1;
  /** For each sorted index, its position in the authority's list (where its fall is, round 2 U27). */
  let sortedDestroyedAt: number[] = [];
  /** A viewer's falls in the sorted order, by the authority's falls array (a new array whenever the list grows). */
  let sortedFallsFor = new WeakMap<readonly number[], number[]>();
  // destruction (docs/DESTRUCTION.md §8.2): the authority's log, copied for the frames whenever it grows
  let destructionFrameLog: DestructionLogEntry[] = [];
  const totals = { bytesOut: 0, bytesIn: 0, snapshots: 0, keyframes: 0, droppedSnapshots: 0, backpressureCloses: 0, events: 0, malformed: 0, rejectedInputs: 0 };
  // the migration seed (P3b): what each entity was restored from, and whether its own seat's hint was taken
  const restoredTicks = new Int32Array(MAX_ENTITIES + 1).fill(-1);
  const restoredX = new Float64Array(MAX_ENTITIES + 1);
  const restoredZ = new Float64Array(MAX_ENTITIES + 1);
  // the restored row's height (the entity's own, written before noteRestoredRow): bounds a hint's climb like its drive
  const restoredY = new Float64Array(MAX_ENTITIES + 1);
  const hinted = new Uint8Array(MAX_ENTITIES + 1);
  // an entity this resumed actor has already driven from its seat's inputs: its pose is this authority's own, so a
  // later hint is stale (a withheld hint sent mid-fight would teleport the hull; security audit 2026-10-22)
  const driven = new Uint8Array(MAX_ENTITIES + 1);
  const RESUME_HINT_WINDOW_TICKS = TICK_HZ * 10;
  // the tick the resumed loop started from (past resume.tick by the ticks the world stood still, MatchActorResume.dueAtMs)
  let resumedFromTick = resume ? resume.tick : 0;
  const resumeHints: ResumeHintStats = { applied: 0, rejected: 0, reasons: { noResume: 0, notRestored: 0, repeated: 0, older: 0, future: 0, tooFar: 0, tooHigh: 0, tooFast: 0, noSeat: 0, late: 0 } };
  let ended = false;
  let stopped = false;
  let verdict: MatchVerdict | null = null;
  let verdictTick = -1;
  const inputs = new Map<string, AuthoritativePlayerInput | null>();

  function serverTimeMs(tick: number): number { return Math.round(tick * TICK_MS); }

  /** The battle clock as the clients read it: the authority's, plus what the old host had already played. */
  function metaWithResumedClock(meta: Record<string, unknown> | null): Record<string, unknown> | null {
    return metaOnBattleClock(meta, resumedBattleTimeMs);
  }

  function send(client: ActorClient, bytes: Uint8Array): boolean {
    if (client.closing || client.link.closed) return false;
    try {
      client.link.send(bytes);
    } catch {
      detach(client, CLOSE_REASON.INTERNAL_ERROR, 'send failed');
      return false;
    }
    client.bytesOut += bytes.byteLength;
    totals.bytesOut += bytes.byteLength;
    return true;
  }

  function sendMessage(client: ActorClient, message: WireMessage): boolean {
    return send(client, encodeMessage(message));
  }

  function sendError(client: ActorClient, reason: CloseReasonId, detail: string): void {
    sendMessage(client, { type: MESSAGE_TYPE.ERROR, reason, detail });
  }

  function detach(client: ActorClient, reason: CloseReasonId, detail = ''): void {
    if (client.closing) return;
    client.closing = true;
    clients.delete(client);
    if (clientBySeat.get(client.seat) === client) clientBySeat.delete(client.seat);
    if (client.entity) {
      authority.onPeerLeave({ peerId: client.entity.id });
      lagComp.setRewindTicks(client.entity.id, 0);
      const entry = rosterEntries.find((row) => row.entityId === client.entityId);
      if (entry) entry.connected = false;
    }
    client.link.close(reason, detail);
    actorLog.info('client detached', { seat: client.seat, player: client.playerId, reason, detail });
    if (client.entity) {
      broadcastEvent({ kind: 'roster', payload: { entityId: client.entityId, playerId: client.playerId, connected: false, reason } });
    }
  }

  /**
   * The actor's own reliable events (roster changes, the room service's and the host's) wait while a batch is going out
   * and follow it, stamped with the tick being stepped (audit M3, 2026-11-02): a detach inside a send loop (a send that
   * threw) broadcast its roster event re-entrantly, so the remaining clients received it ahead of the batch being sent,
   * stamped loop.tick, one tick behind that batch's during a step (the loop advances its tick after the callback).
   */
  const queuedEvents: WireEvent[] = [];
  let sendingEvents = 0;
  let steppingTick: number | null = null;
  function broadcastEvent(event: WireEvent): void {
    queuedEvents.push(event);
    flushQueuedEvents();
  }

  function flushQueuedEvents(): void {
    if (sendingEvents > 0) return;
    sendingEvents++;
    try {
      while (queuedEvents.length) {
        const event = queuedEvents.shift()!;
        const message: EventMessage = { type: MESSAGE_TYPE.EVENT, tick: steppingTick ?? loop.tick, events: [event] };
        let bytes: Uint8Array;
        try { bytes = encodeMessage(message); } catch (error) {
          actorLog.warn('event dropped', { kind: event.kind, error: String(error) });
          continue;
        }
        for (const client of clients.keys()) if (send(client, bytes)) { client.events++; totals.events++; }
      }
    } finally {
      sendingEvents--;
    }
  }

  function rateLimited(client: ActorClient, nowMs: number): boolean {
    const rate = client.rate;
    const elapsedMs = Math.max(0, nowMs - rate.lastMs);
    rate.lastMs = nowMs;
    rate.tokens = Math.min(MESSAGE_BURST, rate.tokens + elapsedMs * MAX_MESSAGES_PER_SECOND / 1000);
    if (rate.tokens < 1) return true;
    rate.tokens -= 1;
    return false;
  }

  function receive(client: ActorClient, bytes: Uint8Array): void {
    if (client.closing) return;
    const nowMs = now();
    client.bytesIn += bytes.byteLength;
    totals.bytesIn += bytes.byteLength;
    if (rateLimited(client, nowMs)) { detach(client, CLOSE_REASON.RATE_LIMITED, 'message rate'); return; }
    const decoded = decodeMessage(bytes, { maxBytes: MAX_CLIENT_MESSAGE_BYTES });
    if (!decoded.ok) {
      client.malformed++;
      totals.malformed++;
      if (client.malformed > MAX_MALFORMED) { detach(client, CLOSE_REASON.MALFORMED, decoded.error.code); return; }
      sendError(client, CLOSE_REASON.MALFORMED, decoded.error.code);
      return;
    }
    const message = decoded.message;
    switch (message.type) {
      case MESSAGE_TYPE.INPUT: receiveInput(client, message, nowMs); return;
      case MESSAGE_TYPE.SNAPSHOT_ACK: acknowledge(client, message.tick, nowMs); return;
      case MESSAGE_TYPE.PING:
        acknowledge(client, message.snapshotAckTick, nowMs);
        // the timeline's time now (267): a server reading its sockets before its loop has caught up a stall still answers the wall's time
        sendMessage(client, { type: MESSAGE_TYPE.PONG, clientTimeMs: message.clientTimeMs, serverTimeMs: Math.round(loop.timeMs), serverTick: loop.tick });
        return;
      case MESSAGE_TYPE.CHAT: receiveChat(client, message.text, nowMs); return;
      case MESSAGE_TYPE.LEAVE: detach(client, CLOSE_REASON.CLIENT_LEAVE); return;
      case MESSAGE_TYPE.RESUME_HINT: receiveResumeHint(client, message); return;
      default:
        sendError(client, CLOSE_REASON.UNEXPECTED_MESSAGE, `type ${message.type}`);
    }
  }

  /** The hull's top speed (m/s) for the hint's distance bound; the fleet's fastest hull is the floor so a mode multiplier never refuses a true row. */
  function topSpeedMps(entity: AuthoritativeEntity): number {
    const kmh = (entity.spec as { topSpeedKmh?: number }).topSpeedKmh;
    return Math.max(25, typeof kmh === 'number' && Number.isFinite(kmh) ? kmh / 3.6 : 0);
  }

  /**
   * A viewer's own newest authority row from the host it lost (P3b): applied to its entity only when this actor resumed
   * a migration, the entity was restored from the migration state, no hint was taken for it yet, the row is newer than
   * the restored one and older than the resume tick, and it lies within the distance the hull could have driven since
   * the restored row (top speed × the ticks between, with a margin) — the pose and its body bits only, never combat state.
   * A client never places itself: outside those bounds the hint is refused and counted.
   */
  function receiveResumeHint(client: ActorClient, hint: ResumeHintMessage): void {
    const entity = client.entity;
    const refuse = (reason: keyof ResumeHintStats['reasons']): void => { resumeHints.rejected++; resumeHints.reasons[reason]++; };
    if (!entity) { refuse('noSeat'); return; }
    const entityId = client.entityId;
    if (!resume) { refuse('noResume'); return; }
    const restoredTick = restoredTicks[entityId]!;
    if (restoredTick < 0) { refuse('notRestored'); return; }
    if (hinted[entityId]) { refuse('repeated'); return; }
    if (driven[entityId] || loop.tick > resumedFromTick + RESUME_HINT_WINDOW_TICKS) { refuse('late'); return; }
    if (!(hint.tick > restoredTick)) { refuse('older'); return; }
    if (hint.tick >= resume.tick) { refuse('future'); return; }
    const x = dequantizePosition(hint.x);
    const z = dequantizePosition(hint.z);
    const allowedM = (hint.tick - restoredTick) * SIM_DT * topSpeedMps(entity) * 1.25 + 3;
    const movedM = Math.hypot(x - restoredX[entityId]!, z - restoredZ[entityId]!);
    if (!(movedM <= allowedM)) { refuse('tooFar'); actorLog.warn('resume hint refused', { player: client.playerId, movedM: Math.round(movedM * 10) / 10, allowedM: Math.round(allowedM * 10) / 10 }); return; }
    // (improve-271 plan 006) the other pose fields are bounded before the row is seated: a hull climbs no further than it
    // could drive, never past its top speed (the mode's multiplier included), and its gun stays inside its own limits
    // (clamped below). The angles are wrapped into one turn by their dequantization.
    const climbedM = Math.abs(dequantizePosition(hint.y) - restoredY[entityId]!);
    if (!(climbedM <= allowedM)) { refuse('tooHigh'); actorLog.warn('resume hint refused', { player: client.playerId, climbedM: Math.round(climbedM * 10) / 10, allowedM: Math.round(allowedM * 10) / 10 }); return; }
    const speed = dequantizeVelocity(hint.speed);
    const verticalSpeed = dequantizeVelocity(hint.verticalSpeed);
    const multiplier = entity.modeSpeedMultiplier ?? 1;
    const modeSpeed = Number.isFinite(multiplier) ? Math.max(1, multiplier) : 1;
    if (!(Math.abs(speed) <= topSpeedMps(entity) * modeSpeed * 1.25) || !(Math.abs(verticalSpeed) <= RESUME_HINT_MAX_VERTICAL_MPS)) {
      refuse('tooFast'); actorLog.warn('resume hint refused', { player: client.playerId, speed, verticalSpeed }); return;
    }
    // The hint is the seat's newest row of its own hull from the host it lost, and seats as a row does: pose, ground
    // contact and body mode from its body bits, then the spring and ride on that pose (authorityRow.ts applyAuthorityRow,
    // the restore's own owner; round 3 A14). Before, the hint carried no body bits: its contact was read from its height
    // over the terrain field (a hull on a roof or a bridge read as airborne and dropped onto its support in a tick) and
    // the restored row's body mode stood under the newer pose (a hull that had righted came back tumbling).
    applyAuthorityRow(entity.state, hint);
    const gun = entity.spec as { gunElevationDeg?: number; gunDepressionDeg?: number };
    const maxPitch = typeof gun.gunElevationDeg === 'number' && Number.isFinite(gun.gunElevationDeg) ? gun.gunElevationDeg * DEG_TO_RAD + RESUME_HINT_PITCH_SLACK_RAD : RESUME_HINT_FALLBACK_PITCH_RAD;
    const minPitch = typeof gun.gunDepressionDeg === 'number' && Number.isFinite(gun.gunDepressionDeg) ? -gun.gunDepressionDeg * DEG_TO_RAD - RESUME_HINT_PITCH_SLACK_RAD : -RESUME_HINT_FALLBACK_PITCH_RAD;
    entity.state.gunPitch = Math.min(maxPitch, Math.max(minPitch, entity.state.gunPitch));
    hinted[entityId] = 1;
    resumeHints.applied++;
    actorLog.info('resume hint applied', { player: client.playerId, tick: hint.tick, restoredTick, movedM: Math.round(movedM * 100) / 100 });
  }

  function acknowledge(client: ActorClient, tick: number, nowMs: number): void {
    const rtt = client.publisher.ack(tick, nowMs);
    if (rtt != null) {
      client.latency.sampleRtt(rtt);
      if (client.entity) lagComp.setRewindTicks(client.entity.id, client.latency.rewindTicks(TICK_MS));
    }
  }

  function receiveInput(client: ActorClient, frame: InputMessage, nowMs: number): void {
    if (!client.entity) { sendError(client, CLOSE_REASON.NOT_SEATED, 'spectators send no input'); return; }
    // leads are taken over the tick due now (267): read before the loop has caught up a stall, the last tick run is behind it
    const admitted = client.input.admit(frame, loop.dueTick);
    if (admitted.farAhead) {
      totals.rejectedInputs++;
      sendError(client, CLOSE_REASON.INPUT_TOO_FAR_AHEAD, `tick ${frame.clientTick} vs ${loop.tick}`);
      return;
    }
    if (client.entityId !== NO_ENTITY) driven[client.entityId] = 1;
    acknowledge(client, frame.snapshotAckTick, nowMs);
    client.latency.setInterpDelayMs(frame.interpDelayMs);
    lagComp.setRewindTicks(client.entity.id, client.latency.rewindTicks(TICK_MS));
  }

  function receiveChat(client: ActorClient, raw: string, nowMs: number): void {
    const text = normalizeChatText(raw);
    if (!text) { sendError(client, CLOSE_REASON.CHAT_REJECTED, 'empty or invalid'); return; }
    if (!client.chat.admit(nowMs)) { sendError(client, CLOSE_REASON.CHAT_REJECTED, 'rate limited'); return; }
    broadcastEvent({ kind: 'chat', payload: {
      seat: client.seat, entityId: client.entityId, playerId: client.playerId, name: client.name, team: client.team, text, tick: loop.tick,
    } });
  }

  // ---- per-tick pipeline
  function collectInputs(tick: number): Map<string, AuthoritativePlayerInput | null> {
    inputs.clear();
    for (const client of clients.keys()) {
      if (client.entity) inputs.set(client.entity.id, client.input.inputFor(tick));
    }
    return inputs;
  }

  /**
   * Engagement for the interest tiers (P3b): a hit either way, a shell landing beside the viewer or a ram puts the
   * other party on the near tier for INTEREST_ENGAGED_TICKS. Read from the events the viewer receives — its own
   * involvement is always among them (the authority's reveal rule names the viewer).
   */
  function engageFromEvent(client: ActorClient, event: Record<string, unknown>, tick: number): void {
    const viewer = client.entity;
    if (!viewer) return;
    const until = tick + INTEREST_ENGAGED_TICKS;
    const engage = (playerId: unknown): void => {
      if (typeof playerId !== 'string' || playerId === viewer.id) return;
      const entityId = entityIdOf.get(playerId);
      if (entityId !== undefined) engageEntity(client.interest, entityId, until);
    };
    switch (event.type) {
      case 'shell_hit':
        if (event.shooterId === viewer.id) engage(event.targetId);
        else if (event.targetId === viewer.id) engage(event.shooterId);
        return;
      case 'shell_impact': {
        if (event.shooterId === viewer.id) return;
        const dx = Number(event.x) - viewer.state.pos.x;
        const dz = Number(event.z) - viewer.state.pos.z;
        if (dx * dx + dz * dz <= INTEREST_NEAR_MISS_M * INTEREST_NEAR_MISS_M) engage(event.shooterId);
        return;
      }
      case 'tank_ram':
        if (event.aId === viewer.id) engage(event.bId);
        else if (event.bId === viewer.id) engage(event.aId);
        return;
      default:
        return;
    }
  }

  function deliverEvents(tick: number): void {
    if (authority.pendingEventCount === 0) return;
    sendingEvents++;
    try { deliverEventBatches(tick); } finally { sendingEvents--; }
    // a roster change a failed send raised in the batches goes out after them (flushQueuedEvents)
    flushQueuedEvents();
    authority.afterEventBroadcast();
  }

  function deliverEventBatches(tick: number): void {
    for (const client of clients.keys()) {
      const events = authority.eventsForViewer(client.viewerId);
      if (!events.length) continue;
      for (const event of events) engageFromEvent(client, event as unknown as Record<string, unknown>, tick);
      let bytes: Uint8Array;
      try {
        const message: EventMessage = {
          type: MESSAGE_TYPE.EVENT, tick,
          events: events.map((event) => ({
            kind: String(event.type), payload: event as Record<string, unknown>, encoded: eventPayloadOf(event as Record<string, unknown>),
          })),
        };
        bytes = encodeMessage(message);
      } catch (error) {
        actorLog.warn('event batch dropped', { player: client.playerId, error: String(error) });
        continue;
      }
      if (send(client, bytes)) { client.events += events.length; totals.events += events.length; }
    }
  }

  function rowFor(entity: AuthoritativeEntity, entityId: number, tick: number): EntityRow {
    if (rowCacheTick !== tick) { rowCache.clear(); rowCacheTick = tick; }
    let row = rowCache.get(entityId);
    if (!row) { row = captureEntityRow(entity, entityId, era, tick); rowCache.set(entityId, row); }
    return row;
  }

  /** The frames' copy of the authority's destruction log (append-only: a longer log is a new copy, the wire's entries). */
  function destructionLog(meta: Record<string, unknown> | null): DestructionLogEntry[] {
    const log = Array.isArray(meta?.destructionLog) ? meta.destructionLog as DestructionLogEntry[] : null;
    if (log && log.length !== destructionFrameLog.length) destructionFrameLog = log.map(quantizeDestructionEntry);
    return destructionFrameLog;
  }

  function destroyedList(meta: Record<string, unknown> | null): number[] {
    const revision = Number(meta?.destructibleRevision) || 0;
    const indices = Array.isArray(meta?.destroyedObstacleIndices) ? meta.destroyedObstacleIndices as number[] : [];
    if (revision !== destroyedRevision || indices.length !== destroyedLength) {
      // the first position of each valid index, sorted by index (a restore may grow the list inside one revision)
      const first = new Map<number, number>();
      for (let at = 0; at < indices.length; at++) {
        const index = indices[at]!;
        if (Number.isInteger(index) && index >= 0 && !first.has(index)) first.set(index, at);
      }
      sortedDestroyed = [...first.keys()].sort((a, b) => a - b);
      sortedDestroyedAt = sortedDestroyed.map((index) => first.get(index)!);
      sortedFallsFor = new WeakMap();
      destroyedRevision = revision;
      destroyedLength = indices.length;
    }
    return sortedDestroyed;
  }

  /** The viewer's falls for destroyedList's order (round 2, U27): none where the authority names none or a list it lacks. */
  function destroyedFalls(meta: Record<string, unknown> | null): number[] | undefined {
    const falls = Array.isArray(meta?.destroyedObstacleFalls) ? meta.destroyedObstacleFalls as number[] : null;
    if (!falls || falls.length !== destroyedLength || !sortedDestroyed.length) return undefined;
    let sorted = sortedFallsFor.get(falls);
    if (!sorted) {
      sorted = sortedDestroyedAt.map((at) => falls[at] ?? 0);
      sortedFallsFor.set(falls, sorted);
    }
    return sorted;
  }

  /**
   * The viewer's frame at `tick`. The authority's view for the viewer is the spotting filter (a hidden enemy is absent
   * before any tier applies: observeForViewer, the set snapshot() carries, without its per-entity capture); each visible
   * entity's row is then refreshed on its interest tier's cadence for this viewer or carried over from what the viewer
   * holds (P3b, 2026-09-29; interestTiers.ts). Spectators have no hull to measure from and see every entity at full rate.
   */
  function buildFrame(client: ActorClient, tick: number): SnapshotFrame {
    const viewed = profile ? profile.clock() : 0;
    let meta: Record<string, unknown> | null;
    if (frameView === 'snapshot') {
      // the full viewer snapshot (receipts and the bench compare the two views)
      const snapshot = authority.snapshot({ tick, serverTimeMs: serverTimeMs(tick), viewerId: client.viewerId, ackInputSeq: null });
      viewEntities.length = 0;
      for (const row of snapshot.entities) { const entity = authority.entityById.get(row.id); if (entity) viewEntities.push(entity); }
      viewShells.length = 0;
      for (const shell of snapshot.shells) viewQuantizedShells.push(shell);
      meta = snapshot.meta;
    } else {
      authority.observeForViewer(client.viewerId, viewEntities, viewShells);
      for (const shell of viewShells) {
        if (viewQuantizedShells.length >= MAX_VIEW_SHELLS) break;
        const captured = captureShellSnapshot(shell);
        if (captured) { viewQuantizedShells.push(captured); viewShellSources.push(shell); }
      }
      meta = authority.snapshotMeta(client.viewerId);
    }
    if (profile) profile.viewMs += profile.clock() - viewed;
    const entities: EntityRow[] = [];
    const interest = client.interest;
    const snapshotIndex = (tick / snapshotEveryTicks) | 0;
    const viewer = client.entity;
    const vx = viewer ? viewer.state.pos.x : 0;
    const vy = viewer ? viewer.state.pos.y : 0;
    const vz = viewer ? viewer.state.pos.z : 0;
    beginSnapshot(interest);
    // the rows that must be fresh go first and spend the budget; the due mid and far rows queue for what is left
    let budget = rowBudgetBytes;
    let queued = 0;
    for (const entity of viewEntities) {
      const entityId = entityIdOf.get(entity.id);
      if (entityId == null || entityByWireId.get(entityId) !== entity) continue;
      let tier: InterestTier = 0;
      if (viewer && entity !== viewer) {
        const dx = entity.state.pos.x - vx;
        const dy = entity.state.pos.y - vy;
        const dz = entity.state.pos.z - vz;
        tier = viewerTierFor(interest, entityId, tick, dx * dx + dy * dy + dz * dz);
      }
      if (!needsFreshRow(interest, entityId, tier, snapshotIndex)) {
        const held = interest.rows[entityId]!;
        recordRow(interest, entityId, tier, snapshotIndex, held, false);
        entities.push(held);
        continue;
      }
      const captured = rowFor(entity, entityId, tick);
      const staleness = budget === Infinity ? 0 : rowStaleness(interest, entityId, tier, snapshotIndex);
      if (budget === Infinity || staleness >= MAX_DEFERRED_STALENESS || mustRefreshRow(interest, entityId, snapshotIndex, tick, entity === viewer)) {
        if (budget !== Infinity) budget -= estimateEntityRowBytes(captured, interest.rows[entityId]);
        recordRow(interest, entityId, tier, snapshotIndex, captured, true);
        entities.push(captured);
        continue;
      }
      dueIds[queued] = entityId;
      dueTiers[queued] = tier;
      dueRows[queued] = captured;
      dueStaleness[queued] = staleness;
      dueOrder[queued] = queued;
      queued++;
    }
    if (queued) {
      // most overdue first, the nearer tier first among equals (insertion sort over at most MAX_ENTITIES slots)
      const before = (a: number, b: number): boolean => dueStaleness[a]! > dueStaleness[b]!
        || (dueStaleness[a] === dueStaleness[b] && dueTiers[a]! < dueTiers[b]!);
      for (let i = 1; i < queued; i++) {
        const slot = dueOrder[i]!;
        let j = i - 1;
        while (j >= 0 && before(slot, dueOrder[j]!)) { dueOrder[j + 1] = dueOrder[j]!; j--; }
        dueOrder[j + 1] = slot;
      }
      for (let i = 0; i < queued; i++) {
        const slot = dueOrder[i]!;
        const entityId = dueIds[slot]!;
        const tier = dueTiers[slot]! as InterestTier;
        const captured = dueRows[slot]!;
        dueRows[slot] = null;
        const cost = estimateEntityRowBytes(captured, interest.rows[entityId]);
        if (cost <= budget) {
          budget -= cost;
          recordRow(interest, entityId, tier, snapshotIndex, captured, true);
          entities.push(captured);
        } else {
          // held one snapshot more: the viewer keeps its row, due again next snapshot
          deferRow(interest, entityId);
          const held = interest.rows[entityId]!;
          recordRow(interest, entityId, tier, snapshotIndex, held, false);
          entities.push(held);
        }
      }
    }
    entities.sort((a, b) => a.entityId - b.entityId);
    const shells: ShellRow[] = [];
    for (const shell of viewQuantizedShells) {
      const shooter = entityIdOf.get(shell.shooterId) ?? NO_ENTITY;
      shells.push({
        id: shell.id & 0xffff, shooterEntityId: shooter,
        x: shell.x * 10, y: shell.y * 10, z: shell.z * 10,
        vx: clampI16(Math.round(shell.vx / 10)), vy: clampI16(Math.round(shell.vy / 10)), vz: clampI16(Math.round(shell.vz / 10)),
        shellType: shellTypeIndex(shell.type), flags: shell.guided ? SHELL_FLAGS.GUIDED : 0,
      });
    }
    // the rounds that left this view in flight (the observe view: the bench's snapshot view holds no rounds to ask)
    const unseenShells = frameView === 'snapshot' ? undefined : client.unseenMarks.frame(tick, viewQuantizedShells, viewShellSources);
    viewQuantizedShells.length = 0;
    viewShellSources.length = 0;
    // the frame meta is every viewer's the same in a tick (phase, clocks, verdict, smoke, revision): captured once
    if (frameMetaTick !== tick) { frameMeta = captureMeta(metaWithResumedClock(meta), ended); frameMetaTick = tick; }
    const margin = client.input.marginTicks;
    return {
      tick,
      serverTimeMs: serverTimeMs(tick),
      ackedInputTick: client.input.lastAppliedTick < 0 ? NO_TICK : client.input.lastAppliedTick,
      ackedFireSeq: Math.max(0, client.input.lastAppliedFireSeq),
      ackedActionSeq: Math.max(0, client.input.lastAppliedActionSeq),
      inputMarginTicks: margin == null ? INPUT_MARGIN_UNKNOWN : Math.max(-128, Math.min(126, margin)),
      meta: frameMeta!,
      destroyed: destroyedList(meta),
      destroyedFalls: destroyedFalls(meta),
      destruction: destructionLog(meta),
      entities,
      shells,
      ...(unseenShells ? { unseenShells } : {}),
      viewer: client.entity ? captureViewerState(client.entityId, meta?.localPrediction, snapshotIndex % checkpointEverySnapshots === 0) : null,
      modeStateJson: meta?.modeState ? JSON.stringify(meta.modeState) : null,
    };
  }

  /** Backpressure withheld this client's snapshot: true when that closed it (starved past its limit). */
  function starved(client: ActorClient, nowMs: number): boolean {
    client.starvedSinceMs ??= nowMs;
    if (nowMs - client.starvedSinceMs <= starvedLimitMs(client, nowMs)) return false;
    totals.backpressureCloses++;
    detach(client, CLOSE_REASON.BACKPRESSURE, 'starved');
    return true;
  }

  function publishSnapshots(tick: number): void {
    const nowMs = now();
    // every viewer's row budget this snapshot: the host's uplink target shared by its viewers (interestTiers.ts)
    rowBudgetBytes = uplinkTargetBps > 0 ? snapshotRowBudgetBytes(clients.size, snapshotHz, uplinkTargetBps) : Infinity;
    for (const client of [...clients.keys()]) {
      const buffered = client.link.bufferedAmount;
      if (buffered > hardPressureBytes(client, nowMs)) {
        totals.backpressureCloses++;
        detach(client, CLOSE_REASON.BACKPRESSURE, `${buffered} bytes buffered`);
        continue;
      }
      if (buffered > BACKPRESSURE_SOFT_BYTES) {
        // at most one unsent snapshot per client: the stale one is dropped, never queued behind
        client.droppedSnapshots++;
        totals.droppedSnapshots++;
        if (client.pressureSinceMs == null) client.pressureSinceMs = nowMs;
        else if (nowMs - client.pressureSinceMs > sustainedPressureLimitMs(client, nowMs)) {
          totals.backpressureCloses++;
          detach(client, CLOSE_REASON.BACKPRESSURE, 'sustained');
          continue;
        }
        starved(client, nowMs);
        continue;
      }
      client.pressureSinceMs = null;
      if (buffered > SNAPSHOT_SKIP_BYTES) {
        // a slow peer: this snapshot is skipped (the next one is fresher than a queued copy of this one would be); a
        // transient skip never closes the link, a viewer starved past its limit does (SNAPSHOT_STARVED_CLOSE_MS)
        client.droppedSnapshots++;
        totals.droppedSnapshots++;
        starved(client, nowMs);
        continue;
      }
      let published: { bytes: Uint8Array; keyframe: boolean } | null;
      try {
        if (profile) {
          const built = profile.clock();
          const frame = buildFrame(client, tick);
          const encoded = profile.clock();
          published = client.publisher.publish(frame, nowMs);
          profile.buildMs += encoded - built;
          profile.encodeMs += profile.clock() - encoded;
          profile.frames++;
        } else {
          published = client.publisher.publish(buildFrame(client, tick), nowMs);
        }
      } catch (error) {
        // one viewer's unencodable frame (e.g. a keyframe over the wire cap) never starves the rest of the match
        client.droppedSnapshots++;
        totals.droppedSnapshots++;
        if (!publishFailures.has(client)) {
          publishFailures.add(client);
          actorLog.error('snapshot publish failed', { player: client.playerId, error: error instanceof Error ? error.message : String(error) });
        }
        continue;
      }
      if (!published) continue; // a forced keyframe inside its minimum interval (publisher.ts)
      const sent = profile ? profile.clock() : 0;
      if (send(client, published.bytes)) {
        totals.snapshots++;
        if (published.keyframe) totals.keyframes++;
        client.starvedSinceMs = null;
      }
      if (profile) profile.sendMs += profile.clock() - sent;
    }
    authority.afterSnapshotBroadcast();
  }

  /** Ticks published past the verdict: the configured linger, else the ruleset's ending hold plus two seconds (never under 5 s). */
  function lingerTicks(): number {
    if (endedLingerTicks !== undefined) return endedLingerTicks;
    const holdS = typeof authority.endingHoldS === 'number' && Number.isFinite(authority.endingHoldS) ? authority.endingHoldS : 0;
    return Math.max(TICK_HZ * 5, Math.ceil((holdS + 2) * TICK_HZ));
  }

  function settleVerdict(tick: number): void {
    if (verdict || !authority.result) return;
    ended = true;
    verdictTick = tick;
    verdict = {
      roomId,
      result: authority.result,
      reason: authority.resultReason ?? '',
      tick,
      battleTimeMs: Math.round(authority.timeS * 1000) + resumedBattleTimeMs,
      entities: authority.entities.map((entity) => ({
        entityId: entityIdOf.get(entity.id)!, playerId: entity.id, bot: entity.bot, team: teamOf(entity),
        kills: entity.kills, damage: Math.round(entity.damage), destroyed: entity.combat.destroyed,
      })),
    };
    actorLog.info('verdict', { result: verdict.result, reason: verdict.reason, tick });
    try { onVerdict?.(verdict); } catch (error) { actorLog.error('verdict callback failed', { error: String(error) }); }
  }

  function onTick(tick: number, dt: number): void {
    if (stopped) return;
    steppingTick = tick;
    try { stepTick(tick, dt); } finally { steppingTick = null; }
  }

  function stepTick(tick: number, dt: number): void {
    // battle endings (2026-09-25): the authority keeps stepping through the ruleset's post-verdict hold
    // (guns silenced, shells in flight landing, the mode controller settling — authoritativeMatch endingHoldS)
    // and stands still by itself once the hold expires, so the ending replay or camera beat plays over a live field.
    if (profile) {
      const stepped = profile.clock();
      authority.step({ dt, inputs: collectInputs(tick) });
      profile.stepMs += profile.clock() - stepped;
      profile.ticks++;
    } else {
      authority.step({ dt, inputs: collectInputs(tick) });
    }
    if (!ended) lagComp.record(tick);
    if (profile) {
      const delivered = profile.clock();
      deliverEvents(tick);
      profile.eventsMs += profile.clock() - delivered;
    } else {
      deliverEvents(tick);
    }
    settleVerdict(tick);
    if (tick % snapshotEveryTicks === 0) publishSnapshots(tick);
    if (ended && tick - verdictTick >= lingerTicks()) stop(CLOSE_REASON.MATCH_ENDED, verdict?.result ?? '');
  }

  const loop = createFixedStepLoop({
    tickMs: TICK_MS,
    now,
    ...(schedule ? { schedule } : {}),
    startTick: resume ? resume.tick : 0,
    onTick,
    onError: (error) => actorLog.error('tick failed', { tick: loop.tick, error: error instanceof Error ? error.stack ?? error.message : String(error) }),
  });

  function start(): void {
    if (stopped) return;
    if (authority.phase === 'loading') authority.onMatchReady();
    if (resume?.dueAtMs !== undefined && !loop.running && loop.tick === resume.tick) {
      resumedFromTick = resume.tick + Math.max(0, Math.floor((now() - resume.dueAtMs) / TICK_MS + 1e-6));
      loop.start(resumedFromTick);
    } else {
      loop.start();
    }
  }

  function stop(reason: CloseReasonId = CLOSE_REASON.ROOM_CLOSED, detail = ''): void {
    if (stopped) return;
    stopped = true;
    loop.stop();
    for (const client of [...clients.keys()]) detach(client, reason, detail);
    releaseWorld();
    actorLog.info('actor stopped', { reason, tick: loop.tick });
    try { onStop?.(reason); } catch (error) { actorLog.error('stop callback failed', { error: String(error) }); }
  }

  const revokedPlayers = new Set<string>();
  function revokeSeat(playerId: string, detail = 'removed from the room'): boolean {
    revokedPlayers.add(playerId);
    let detached = false;
    for (const client of [...clients.keys()]) {
      if (client.playerId === playerId) { detach(client, CLOSE_REASON.ROOM_CLOSED, detail); detached = true; }
    }
    if (detached) actorLog.info('seat revoked', { player: playerId });
    return detached;
  }

  function attach(link: ClientLink, hello: HelloMessage, claims: SeatClaims): boolean {
    if (stopped) { link.close(CLOSE_REASON.ROOM_CLOSED, 'match over'); return false; }
    if (hello.protocolVersion !== PROTOCOL_VERSION) { link.close(CLOSE_REASON.PROTOCOL_VERSION, `server ${PROTOCOL_VERSION}`); return false; }
    if (claims.roomId !== roomId) { link.close(CLOSE_REASON.ROOM_UNKNOWN, 'token is for another room'); return false; }
    const seatSpec = seatById.get(claims.seat);
    if (!seatSpec || seatSpec.playerId !== claims.playerId) { link.close(CLOSE_REASON.BAD_TOKEN, 'seat does not match the roster'); return false; }
    if (revokedPlayers.has(claims.playerId)) { link.close(CLOSE_REASON.ROOM_CLOSED, 'removed from the room'); return false; }
    // the same-wire build check (2026-10-13, MP plan step 13): a seat whose prediction code differs from this authority's
    // would mispredict silently; it is refused before it can replace a live link of its seat, with words it can act on
    const builds = compareMatchBuilds(build, hello.clientBuild);
    if (matchBuildRefused(builds)) {
      actorLog.warn('client refused: another build', { seat: claims.seat, player: claims.playerId, host: build.slice(0, 64), client: hello.clientBuild.slice(0, 64), newer: builds.newer });
      // a code, worded by the joining client in its own build and locale (matchRefusalMessage, playMenu.entryRefusal.*)
      link.close(CLOSE_REASON.PROTOCOL_VERSION, matchBuildRefusalCode(builds));
      return false;
    }
    if (builds.verdict === 'authority' || builds.verdict === 'version') {
      actorLog.info('client on another build', { seat: claims.seat, verdict: builds.verdict, host: build.slice(0, 64), client: hello.clientBuild.slice(0, 64) });
    }
    const previous = clientBySeat.get(claims.seat);
    if (previous) detach(previous, CLOSE_REASON.REPLACED, 'seat reconnected');
    const spectator = seatSpec.team === 'spectator';
    const entityId = spectator ? NO_ENTITY : entityIdOf.get(seatSpec.playerId)!;
    const entity = spectator ? null : entityByWireId.get(entityId)!;
    const client: ActorClient = {
      link, seat: claims.seat, entityId, entity, playerId: seatSpec.playerId, name: seatSpec.name, team: seatSpec.team,
      viewerId: spectator ? `spectator:${seatSpec.playerId}` : seatSpec.playerId, spectator,
      capabilities: hello.capabilities & HELLO_CAPABILITY.SHOT_FEEDBACK,
      input: createSeatInputBuffer(),
      publisher: createViewerPublisher({ keyframeSlotTicks: keyframeSlotFor(claims.seat), snapshotEveryTicks }),
      interest: createViewerInterest(), latency: createLatencyTracker(), chat: createChatLimiter(),
      bytesOut: 0, bytesIn: 0, events: 0, droppedSnapshots: 0, malformed: 0, pressureSinceMs: null, starvedSinceMs: null, welcomedAtMs: now(),
      rate: { tokens: MESSAGE_BURST, lastMs: now() }, closing: false,
      unseenMarks: createUnseenShellMarks(),
    };
    clients.set(client, true);
    clientBySeat.set(client.seat, client);
    link.onMessage((bytes) => receive(client, bytes));
    link.onClose(() => detach(client, CLOSE_REASON.NONE, 'link closed'));
    if (entity) {
      authority.onPeerJoin({ peerId: entity.id });
      const entry = rosterEntries.find((row) => row.entityId === entityId);
      if (entry) entry.connected = true;
    }
    const welcomed = sendMessage(client, {
      type: MESSAGE_TYPE.WELCOME,
      protocolVersion: PROTOCOL_VERSION, tickHz: TICK_HZ, snapshotHz,
      seat: client.seat, entityId, team: TEAM_ID[seatSpec.team],
      serverTick: loop.tick, serverTimeMs: serverTimeMs(loop.tick), seed: seed >>> 0, capabilities: client.capabilities,
      roomId, mapId, mode, rulesetJson, roster: rosterEntries.map((row) => ({ ...row })), battleId,
    });
    // a link that closed under the WELCOME (send returns false on a closed link, without a throw) leaves the seat now
    // (audit M3, 2026-11-02): before, the client stayed seated and marked connected until a close event that may not follow
    if (!welcomed) { detach(client, CLOSE_REASON.NONE, 'welcome not sent'); return false; }
    actorLog.info('client welcomed', { seat: client.seat, player: client.playerId, spectator, build: hello.clientBuild.slice(0, 32) });
    if (entity) broadcastEvent({ kind: 'roster', payload: { entityId, playerId: client.playerId, connected: true } });
    return true;
  }

  function clientStats(): ActorClientStats[] {
    return [...clients.keys()].map((client) => ({
      seat: client.seat, entityId: client.entityId, playerId: client.playerId, spectator: client.spectator,
      bytesOut: client.bytesOut, bytesIn: client.bytesIn, snapshots: client.publisher.stats.keyframes + client.publisher.stats.deltas,
      keyframes: client.publisher.stats.keyframes, droppedSnapshots: client.droppedSnapshots, events: client.events,
      rttMs: client.latency.owdMs * 2, rewindTicks: client.latency.rewindTicks(TICK_MS),
      inputMargin: client.input.marginTicks, bufferTicks: client.input.bufferTicks,
      input: { refused: client.input.stats.farAhead, dry: client.input.stats.dry, longestDry: client.input.stats.longestDry },
      interest: {
        published: [...client.interest.published], held: client.interest.held, population: [...client.interest.population],
        deferred: client.interest.deferredRows,
      },
    }));
  }

  function interestTotals(): InterestStats {
    const totals: InterestStats = { published: [0, 0, 0], held: 0, population: [0, 0, 0], deferred: 0 };
    for (const client of clients.keys()) {
      const interest = client.interest;
      for (let tier = 0; tier < 3; tier++) {
        totals.published[tier] += interest.published[tier]!;
        totals.population[tier] += interest.population[tier]!;
      }
      totals.held += interest.held;
      totals.deferred += interest.deferredRows;
    }
    return totals;
  }

  function phaseOf(): MatchActorPhase {
    if (stopped) return 'stopped';
    if (ended || authority.result) return endingHoldExpired(ruleset, authority.resultTimeS, authority.timeS) ? 'ended' : 'ending';
    return authority.phase;
  }

  function stats(): MatchActorStats {
    let spectators = 0;
    for (const client of clients.keys()) if (client.spectator) spectators++;
    const lag = lagComp.stats;
    return {
      roomId, mapId, mode, tick: loop.tick, phase: matchStatusPhase(phaseOf()),
      clients: clients.size, spectators, seatsFilled: clients.size - spectators, bots: bots.length,
      ...totals,
      tickMs: loop.tickCost.summary(),
      loop: { droppedTicks: loop.stats.droppedTicks, stalls: loop.stats.stalls, lateWakeupMaxMs: loop.stats.lateWakeupMaxMs },
      snapshotHz,
      lagComp: {
        rewoundShots: lag.rewoundShots, rewoundSweeps: lag.rewoundSweeps,
        mismatchMeanM: lag.rewoundShots ? lag.mismatchSumM / lag.rewoundShots : 0, mismatchMaxM: lag.mismatchMaxM, historyMisses: lag.historyMisses,
      },
      verdict: verdict ? verdict.result : null,
      interest: interestTotals(),
      resumeHints: { applied: resumeHints.applied, rejected: resumeHints.rejected, reasons: { ...resumeHints.reasons } },
    };
  }

  if (autoStart) start();

  return {
    roomId,
    ruleset,
    get tick() { return loop.tick; },
    get phase() { return phaseOf(); },
    get ended() { return ended; },
    get stopped() { return stopped; },
    authority,
    loop,
    lagComp,
    attach,
    revokeSeat,
    entityForWireId: (entityId) => entityByWireId.get(entityId) ?? null,
    wireIdOf: (playerId) => entityIdOf.get(playerId) ?? null,
    resumedBattleTimeMs,
    battleId,
    noteRestoredRow(entityId, tick, x, z) {
      if (!Number.isInteger(entityId) || entityId < 1 || entityId > MAX_ENTITIES || !Number.isInteger(tick) || tick < 0) return;
      restoredTicks[entityId] = tick;
      restoredX[entityId] = x;
      restoredZ[entityId] = z;
      restoredY[entityId] = entityByWireId.get(entityId)?.state.pos.y ?? Number.NaN;
      hinted[entityId] = 0;
      driven[entityId] = 0;
    },
    broadcastEvent,
    advance: (nowMs) => loop.advance(nowMs),
    start,
    stop,
    stats,
    clientStats,
  };
}
