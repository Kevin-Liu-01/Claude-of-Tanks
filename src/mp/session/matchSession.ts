/**
 * MatchSession: the session owner of Multiplayer v2 (charter §3, §5). It sits
 * between a `RoomClient` and the match layer: when the room hands this seat a
 * `match_start`, it builds the presentation the caller supplies (the battle
 * presentation in the browser, a recorder headless), opens a `MatchClient` on
 * the seat token, binds the two, pumps the client once per frame, presents the
 * verdict, and returns to the lobby (the room stays) — then does it again for
 * a rematch. Spectators get the same path without controls or prediction.
 *
 * Peer-to-peer matches (P2 client lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13): a `match_start` whose URL is
 * `rtc://<room>/<generation>` opens no socket. The seat the room named as host boots the browser host
 * (`src/mp/host/matchHost.ts`: the actor in its thread, the WebRTC acceptor, the room reports) and plays through the
 * host's loopback transport; every other seat opens a `WebRtcTransport` to the host through the room's signaling
 * relay. Both ride a `MigratingTransport`, so a `host_changed` swaps the link under the running client: a peer the
 * room elects opens its retained (sealed) keyframe with the secret the election carries and boots a host from it at
 * the continued tick; a peer whose host changed offers to the new one; a host the room replaced becomes a peer. A
 * `ws(s)://` URL keeps the WebSocket path. Node-runnable: the transport, the host thread and the presentation are
 * injected.
 */
import { MatchClient } from '../match/matchClient.ts';
import type { MatchClientOptions, MatchFrame, PredictionProvider } from '../match/matchClient.ts';
import type { ControlSample } from '../match/inputStream.ts';
import { bindMatchPresentation } from '../presentation/adapter.ts';
import type { PresentationAdapter } from '../presentation/adapter.ts';
import { WebSocketTransport } from '../transport/webSocketTransport.ts';
import type { WebSocketTransportOptions } from '../transport/webSocketTransport.ts';
import { WebRtcTransport } from '../transport/webRtcTransport.ts';
import type { RtcCandidateType, RtcIceConfig, RtcLinkTimeline, RtcPeerConnectionFactory, Signaler } from '../transport/webRtcTransport.ts';
import { MigratingTransport } from '../transport/migratingTransport.ts';
import { Listeners } from '../transport/transport.ts';
import type { Transport, Unsubscribe } from '../transport/transport.ts';
import { CLOSE_REASON, TICK_MS, VERDICT } from '../wire/index.ts';
import type { CloseReasonId, VerdictId, WelcomeMessage } from '../wire/index.ts';
import { roomCommandNeverApplied } from '../room/roomClient.ts';
import type { RoomClient } from '../room/roomClient.ts';
import { parseP2pMatchUrl, ROOM_HOST_UNREACHABLE_AFTER_MS, ROOM_HOST_UNREACHABLE_REPEAT_MS, ROOM_MATCH_REPORT_INTERVAL_MS } from '../room/protocol.ts';
import type { RoomHostChangedPayload, RoomMatchStartPayload, RoomMatchStatusPayload, RoomSnapshot } from '../room/protocol.ts';
import { createMatchHost } from '../host/matchHost.ts';
import { createHostHeadroomMonitor } from './hostHeadroom.ts';
import type { HostHeadroomMonitor, HostHeadroomOptions } from './hostHeadroom.ts';
import type { MatchHost } from '../host/matchHost.ts';
import { planFromRoster, planHostBoot } from '../host/hostPlan.ts';
import type { HostBootConfig, HostCoreStats, HostPort, HostToWorkerMessage, WorkerToHostMessage } from '../host/hostProtocol.ts';
import type { HostBootPlan } from '../host/hostPlan.ts';
import { decodeBootConfig, decodeMigrationKeyframe, deriveMigrationKey, migrationFallback, openMigrationBlob, resumeHoldSeats, resumeStateFromRetained } from '../host/migrationState.ts';

export type SessionPhase = 'lobby' | 'loading' | 'match' | 'ended' | 'lost';

export interface SessionRound {
  matchStart: RoomMatchStartPayload;
  room: RoomSnapshot;
  spectator: boolean;
  /** The seat's own player id. */
  playerId: string;
}

/**
 * (2026-11-02 audit S3) The session's phases and roles as runtime lists: the multiplayer harnesses import these
 * (tools/mp-states.mjs) instead of spelling the words, so a renamed phase fails a harness by name, not by timeout.
 * tools/mp-states.selftest.mjs pins each list to its union.
 */
export const SESSION_PHASES = Object.freeze(
  ['lobby', 'loading', 'match', 'ended', 'lost'] as const satisfies readonly SessionPhase[]);
export const SESSION_ROLES = Object.freeze(['host', 'peer'] as const satisfies readonly NonNullable<SessionRole>[]);

/** What a presentation factory hands back: the adapter and, once known, the viewer's prediction world and controls. */
export interface SessionPresentation {
  adapter: PresentationAdapter;
  /** Prediction for the viewer's own tank (null for spectators or before the world is known). */
  prediction?: PredictionProvider | null;
  /** Controls for a tick (null: neutral). Ignored for spectators. */
  controls?: ((tick: number) => Readonly<ControlSample> | null) | null;
  /** Called after WELCOME with the roster (the battle presentation loads its visuals here). */
  onWelcome?(welcome: WelcomeMessage): Promise<void> | void;
  /** The verdict is presented; the owner ends the round when the player leaves the result screen. */
  onVerdict?(verdict: VerdictId, reason: string): void;
  dispose(): void;
}

/** The peer-to-peer surfaces a session needs (absent: rtc:// matches cannot be entered). */
export interface MatchSessionP2pOptions {
  /** ICE servers for the peer transport and the host acceptor: fixed, or a resolver per connection (the room's relay grant, `createRoomIceResolver`). */
  ice?: RtcIceConfig | (() => Promise<RtcIceConfig> | RtcIceConfig);
  createPeerConnection?: RtcPeerConnectionFactory;
  /** The host actor's thread (a Worker in the browser, the in-process core in Node); absent: this seat cannot host. */
  createHostPort?: () => HostPort<HostToWorkerMessage, WorkerToHostMessage>;
  /** Where the host fetches the collision manifests (null: the bare height field). */
  manifestBase?: string | null;
  /** The world kernels' module URL the host's world runs on (?simKernels=wasm); null: the TypeScript. */
  simKernelsUrl?: string | null;
  /** The device tier: the mobile tier declines to host (§13.3). */
  tier?: 'mobile' | 'desktop';
  /** The settings' "never host" switch. */
  neverHost?: boolean;
  /** Peers the host serves at most. */
  maxPeers?: number;
  /** The countdown a fresh match starts with (5 s; the proofs shorten it). */
  countdownS?: number;
  /** The snapshot rate the host publishes at for the near tier (SNAPSHOT_HZ by default; a divisor of the tick rate — the soak compares 20 and 30). */
  snapshotHz?: number;
  /**
   * A seat re-named host for a match already under way (its tab reloaded inside the host grace) holds nothing to resume
   * from: it declines so a peer resumes from its sealed keyframe, and boots afresh only when no election follows within
   * this window (the sole commander left). 10 s.
   */
  reentryElectionWaitMs?: number;
  /**
   * The elected host's entry reports (plan step 8, 2026-10-13): from the match_start until its own actor reports, the
   * host's tab tells the room it is still loading every this often (ROOM_MATCH_REPORT_INTERVAL_MS, 30 s), so the room's
   * 90 s report budget (ROOM_MATCH_REPORT_STALE_AFTER_MS) does not hand the match to a peer while the host is building its
   * world. Receipts shorten it.
   */
  entryReportIntervalMs?: number;
  /** ... and for at most this long (ENTRY_REPORT_CEILING_MS, 150 s): a host whose entry never ends is still replaced. */
  entryReportCeilingMs?: number;
  /**
   * Host choice by headroom (plan step 10): a tab whose display frames run slow while it waits in the room (p50 past
   * 33 ms) declines to host, as a preference — the room names a willing seat and keeps this one as the last resort —
   * and offers again once it recovers (under 25 ms). Fed by `observeFrame`; false turns it off.
   */
  hostHeadroom?: HostHeadroomOptions | false;
  /**
   * The standby host (2026-10-14, §13.21): a seat that may host prepares a host thread — the battlefield's collision world
   * and the roster's fleet — `delayMs` after it is welcomed as a peer (STANDBY_HOST_DELAY_MS, 20 s: after its own entry),
   * so an election boots the actor at once. False turns it off.
   */
  standbyHost?: { delayMs?: number } | false;
  onLog?: (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>) => void;
}

/** A peer prepares its standby host this long after its welcome: past its own covered entry (§13.21). */
export const STANDBY_HOST_DELAY_MS = 20_000;

export type SessionRole = 'host' | 'peer' | null;

/**
 * This seat's part in the round's peer-to-peer match (audit M2, 2026-11-02): one declared state, written only by
 * `moveRole`, which refuses a move `ROLE_MOVES` does not list. It used to be read from which objects existed (`host`,
 * `peerTransport`), and nothing ended a host when its match did: a finished round's host still read as the running host.
 * - none: no part (the lobby, the WebSocket path, a round left or over).
 * - booting_host: this seat's host actor is starting (a fresh match, or an election onto this seat).
 * - live_host: the actor runs the match.
 * - finished_host: the round settled (a verdict, a loss): the actor plays out its end; nothing hands it on, and the
 *   host is dropped when its own seat's link closes (the actor's MATCH_ENDED after its linger) or the round is left.
 * - stepping_down: the room replaced this host; its actor stops and a peer link takes the loopback's place.
 * - peer: linked to another seat's host.
 * - migrating: a peer following an election to another seat's host, until the new host welcomes it.
 */
export type SessionRoleState = 'none' | 'booting_host' | 'live_host' | 'finished_host' | 'stepping_down' | 'peer' | 'migrating';

const ROLE_MOVES: Readonly<Record<SessionRoleState, readonly SessionRoleState[]>> = {
  none: ['booting_host', 'peer'],
  // a superseded or failed election boot falls back to the peer link the seat still holds
  booting_host: ['live_host', 'finished_host', 'stepping_down', 'peer', 'none'],
  // a live host whose actor failed, elected again, boots anew
  live_host: ['finished_host', 'stepping_down', 'booting_host', 'none'],
  finished_host: ['none'],
  stepping_down: ['peer', 'none'],
  peer: ['migrating', 'booting_host', 'none'],
  migrating: ['peer', 'booting_host', 'none'],
};

const HOSTING: ReadonlySet<SessionRoleState> = new Set(['booting_host', 'live_host']);

/**
 * Why this seat told the room it will not host (audit M2, 2026-11-02): one declared state, written only by `setDecline`.
 * - null: willing; the room may elect it.
 * - 'unable': it cannot host at all (no host thread, the mobile tier, the never-host switch) — the seat's own, said once
 *   it is in the room and again whenever the room's record of it reads willing (a fresh admission, a room that reset
 *   its declines at a match's end).
 * - 'headroom': its frames run too slow to host well while it waits in the room; withdrawn when they recover.
 * - 'reentry': it re-entered a running match without the match's state; withdrawn at its welcome.
 * - 'match': it gave up hosting one match (left it, failed its boot, its tab went, it was named without the secret).
 *   Over with that match: the room resets every decline at a match's end (roomPolicy finishMatch), and this seat
 *   forgets its own once the room is back to waiting. It used to be a latch for the seat's life (`declinedHosting`),
 *   which kept a capable seat out of the admin-first election and shut its headroom path.
 * 'reentry' and 'match' are said again on an admission whose room record lost them while this seat's round of that
 * match still runs (2026-11-03): the command went out into a room-socket blip and the room never read it.
 */
export type HostDecline = null | 'unable' | 'headroom' | 'reentry' | 'match';

/** Why an election's host boot was given up before it went live (MatchSession.bootSuperseded). */
type BootSuperseded = 'left the match' | 'newer election' | 'host released' | 'match link closed';

/**
 * How long an elected host's tab may hold the match with loading reports before its actor runs (plan step 8): the
 * slowest measured entries (a cold compile, the 145 s welcomed-compiling rejoin) fit; a wedged entry is replaced 90 s
 * (ROOM_MATCH_REPORT_STALE_AFTER_MS) after the last report, as before.
 */
export const ENTRY_REPORT_CEILING_MS = 150_000;

export type SessionP2pEvent =
  | { kind: 'role'; role: SessionRole; generation: number }
  | { kind: 'migration'; phase: 'begin' | 'end' | 'failed'; hostId: string; generation: number; role: SessionRole; detail: string }
  | { kind: 'declined' };

/** The peer-to-peer facts the status model reads (one object, written in place). */
export interface SessionP2pStatus {
  role: SessionRole;
  generation: number;
  hostId: string | null;
  migrating: boolean;
  migrationHostId: string | null;
  candidateType: RtcCandidateType | null;
  viaTurn: boolean;
  peersConnected: number;
  relayed: number;
  uplinkBytesPerS: number;
  hostState: string | null;
  /** Snapshots the host skipped for slow peers (P3b; 0 as a peer). */
  snapshotSkips: number;
  /** Signals the peer transport refused as stale (another host's or generation's) and offers it sent (P3b diagnostics; 0 as a host). */
  staleSignals: number;
  offersSent: number;
  /** The peer link's newest attempt: began, offer sent, answer received, channel open (clock ms; null as a host). */
  link: Readonly<RtcLinkTimeline> | null;
  /** As a migrated host: how long the world held still for the seats that were playing, and why it moved (null otherwise). */
  resumeHold: HostCoreStats['resumeHold'];
}

export interface MatchSessionOptions {
  room: RoomClient;
  /** Build the presentation for one round; may load a world (the session shows `loading` meanwhile). */
  createPresentation(round: SessionRound): Promise<SessionPresentation> | SessionPresentation;
  createTransport?(options: WebSocketTransportOptions): Transport;
  clock?: () => number;
  clientBuild?: string;
  /** Extra MatchClient options (receipts shrink rings, inject interpolation policies). */
  matchClient?: Partial<Omit<MatchClientOptions, 'transport' | 'token' | 'controls' | 'prediction' | 'clock' | 'clientBuild'>>;
  /** Enter a match as soon as the room announces one (default true). */
  autoEnter?: boolean;
  /** Extra transport options (receipts inject sockets, timers, randomness). */
  transport?: Partial<Omit<WebSocketTransportOptions, 'url' | 'resumeToken'>>;
  p2p?: MatchSessionP2pOptions;
}

export interface MatchSessionStats {
  phase: SessionPhase;
  /** This seat's room player id (the proofs match hosts and hulls by it). */
  playerId: string;
  round: number;
  matchId: string | null;
  matchUrl: string | null;
  spectator: boolean;
  match: ReturnType<MatchClient['stats']> | null;
  rounds: number;
  verdicts: number;
  p2p: SessionP2pStatus | null;
  migrations: number;
}

export class MatchSession {
  readonly room: RoomClient;
  private readonly createPresentation: MatchSessionOptions['createPresentation'];
  private readonly createTransport: (options: WebSocketTransportOptions) => Transport;
  private readonly clock: () => number;
  private readonly clientBuild: string;
  private readonly matchOptions: NonNullable<MatchSessionOptions['matchClient']>;
  private readonly transportOptions: NonNullable<MatchSessionOptions['transport']>;
  private readonly p2pOptions: MatchSessionP2pOptions | null;
  private readonly autoEnter: boolean;
  private readonly phaseListeners = new Listeners<{ phase: SessionPhase; detail: string }>();
  private readonly verdictListeners = new Listeners<{ verdict: VerdictId; reason: string; matchId: string }>();
  private readonly frameListeners = new Listeners<MatchFrame>();
  private readonly p2pListeners = new Listeners<SessionP2pEvent>();
  private readonly roomSubscriptions: Unsubscribe[] = [];
  private currentPhase: SessionPhase = 'lobby';
  private matchClient: MatchClient | null = null;
  private presentation: SessionPresentation | null = null;
  private unbind: Unsubscribe | null = null;
  private currentRound: SessionRound | null = null;
  // players this seat's host already revoked this round (a kick or leave seen in room_state)
  private readonly revokedSeats = new Set<string>();
  /** The round entry's sequence token: an entry, and every leave, moves it; an entry whose token moved is superseded. */
  private generation = 0;
  /** The entry in flight (its match and promise): a match_start re-sent while the world loads joins it. */
  private entering: { matchId: string; promise: Promise<MatchClient> } | null = null;
  private roundsEntered = 0;
  private verdictsSeen = 0;
  private lastVerdict: { verdict: VerdictId; reason: string; matchId: string } | null = null;
  private started = false;
  private disposed = false;
  // ---- peer-to-peer
  /** This seat's part in the match (SessionRoleState); `host` is set in the host states, `peerTransport` as a peer. */
  private roleState: SessionRoleState = 'none';
  private host: MatchHost | null = null;
  private peerTransport: WebRtcTransport | null = null;
  private migrating: MigratingTransport | null = null;
  private hostSecret: string | null = null;
  private migrationActive = false;
  private migrationHostId: string | null = null;
  /** The host this seat's match runs on (the match_start's, then each election's): an election's previous host. */
  private servingHostId: string | null = null;
  private migrationsSeen = 0;
  /** Why this seat declines to host (HostDecline; null: willing). */
  private decline: HostDecline = null;
  /** The current decline was said with `unable` (a decline said again carries the flag it was said with). */
  private declineUnable = false;
  /**
   * Declines this seat said (declined: true) that may still reach the room's record: unanswered, or failed without
   * certainty (a timeout, a lost socket: the room may have applied it all the same). An ack, a certain refusal
   * (roomCommandNeverApplied) or an admission (its record supersedes every earlier command of this seat) retires one.
   */
  private readonly declinesMayLand = new Set<object>();
  /**
   * A per-match decline was forgotten at the room's reset while a say of it may still land: the record turning declined
   * is that one. Cleared by its withdrawal, a new decline, a room no longer waiting, an admission, or a certain refusal
   * of the last say that may land.
   */
  private lateDecline = false;
  /** The room's record of this seat's decline at its last snapshot (null before one): a true → false edge is a reset. */
  private declineRecord: boolean | null = null;
  /** The hosting tab already told the room it is going (pagehide): leaving the match must not decline twice. */
  private handedOff = false;
  private headroom: HostHeadroomMonitor | null = null;
  /** The elected host's entry reports while its world loads (null when none run). */
  private entryReports: { stop(reason: string): void } | null = null;
  /** A peer's standby host thread (§13.21): prepared after its welcome, taken by the next boot of this seat's host. */
  private standby: { port: HostPort<HostToWorkerMessage, WorkerToHostMessage>; unsubscribe: Unsubscribe; matchId: string; prepared: boolean } | null = null;
  private standbyTimer: unknown = null;
  // host-loss evidence (§13.22): when this peer last heard its host (a snapshot accepted), its last claim, its claims
  private hostHeardAt = 0;
  private hostHeardCount = -1;
  private lastUpdateAt = 0;
  private hostClaimAt = Number.NEGATIVE_INFINITY;
  private hostClaims = 0;
  /** The host generation this seat was last welcomed by (a lost link clears the client's welcome; this stays). */
  private welcomedGeneration = -1;
  /** The host generation this seat's link (or host) runs; an election with a newer one is a migration (P1: compare generations, never the reason). */
  private runningGeneration = 0;
  private readonly p2pStatus: SessionP2pStatus = {
    role: null, generation: 0, hostId: null, migrating: false, migrationHostId: null, candidateType: null, viaTurn: false,
    peersConnected: 0, relayed: 0, uplinkBytesPerS: 0, hostState: null, snapshotSkips: 0, staleSignals: 0, offersSent: 0, link: null, resumeHold: null,
  };

  constructor({
    room,
    createPresentation,
    createTransport = (options) => new WebSocketTransport(options),
    clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
    clientBuild = 'dev',
    matchClient = {},
    autoEnter = true,
    transport = {},
    p2p,
  }: MatchSessionOptions) {
    if (!room) throw new TypeError('a room client is required');
    if (typeof createPresentation !== 'function') throw new TypeError('createPresentation is required');
    this.room = room;
    this.createPresentation = createPresentation;
    this.createTransport = createTransport;
    this.clock = clock;
    this.clientBuild = clientBuild;
    this.matchOptions = matchClient;
    this.transportOptions = transport;
    this.autoEnter = autoEnter;
    this.p2pOptions = p2p ?? null;
  }

  // ------------------------------------------------------------ observation

  get phase(): SessionPhase { return this.currentPhase; }
  get match(): MatchClient | null { return this.matchClient; }
  get round(): SessionRound | null { return this.currentRound; }
  get spectator(): boolean { return this.currentRound?.spectator ?? false; }
  get verdict(): { verdict: VerdictId; reason: string; matchId: string } | null { return this.lastVerdict; }
  get presentationAdapter(): PresentationAdapter | null { return this.presentation?.adapter ?? null; }
  /** This seat's part in a peer-to-peer match (null on the WebSocket path or outside a match). */
  get role(): SessionRole {
    const state = this.roleState;
    return state === 'none' ? null : state === 'peer' || state === 'migrating' || state === 'stepping_down' ? 'peer' : 'host';
  }
  /** The declared role state (diagnostics and the proofs). */
  get roleStatus(): SessionRoleState { return this.roleState; }

  get matchHost(): MatchHost | null { return this.host; }
  /** The peer-to-peer facts, written in place on every read (the status model samples it). */
  get p2p(): Readonly<SessionP2pStatus> | null {
    if (!this.host && !this.peerTransport) return null;
    const status = this.p2pStatus;
    status.role = this.role;
    status.generation = this.room.generation;
    status.hostId = this.room.hostId;
    status.migrating = this.migrationActive;
    status.migrationHostId = this.migrationHostId;
    status.candidateType = this.peerTransport?.candidateType ?? null;
    status.viaTurn = this.peerTransport?.viaTurn ?? (this.host ? this.host.relayed > 0 : false);
    status.peersConnected = this.host?.peersConnected ?? 0;
    status.relayed = this.host?.relayed ?? 0;
    status.uplinkBytesPerS = this.host?.uplinkBytesPerS ?? 0;
    status.hostState = this.host?.state ?? null;
    status.snapshotSkips = this.host?.snapshotSkips ?? 0;
    status.staleSignals = this.peerTransport?.staleSignals ?? 0;
    status.offersSent = this.peerTransport?.signalStats.sent ?? 0;
    status.link = this.peerTransport?.linkTimeline ?? null;
    status.resumeHold = this.host?.resumeHold ?? null;
    return status;
  }
  /** True when this seat may host (a host thread is available, the tier is not mobile, the switch is off). */
  get canHost(): boolean {
    const p2p = this.p2pOptions;
    return !!p2p && typeof p2p.createHostPort === 'function' && p2p.tier !== 'mobile' && !p2p.neverHost;
  }

  onPhase(listener: (change: { phase: SessionPhase; detail: string }) => void): Unsubscribe { return this.phaseListeners.add(listener); }
  onVerdict(listener: (change: { verdict: VerdictId; reason: string; matchId: string }) => void): Unsubscribe { return this.verdictListeners.add(listener); }
  onFrame(listener: (frame: MatchFrame) => void): Unsubscribe { return this.frameListeners.add(listener); }
  onP2p(listener: (event: SessionP2pEvent) => void): Unsubscribe { return this.p2pListeners.add(listener); }

  private setPhase(phase: SessionPhase, detail = ''): void {
    if (this.currentPhase === phase) return;
    // a round that ends (a verdict, a lost match, the lobby) ends its migration too: nothing resumes after it (2026-09-30:
    // the status banner kept "New host: … · resuming…" over the lost match's end screen)
    if (this.migrationActive && (phase === 'ended' || phase === 'lost' || phase === 'lobby')) this.endMigration(phase);
    this.currentPhase = phase;
    this.phaseListeners.emit({ phase, detail });
  }

  private log(level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>): void {
    this.p2pOptions?.onLog?.(level, message, fields);
  }

  /** The injected timers (receipts drive them), else the platform's: every timer of the session's own phases. */
  private setTimer(callback: () => void, delayMs: number): unknown {
    const timers = this.transportOptions as Partial<WebSocketTransportOptions>;
    return timers.setTimer ? timers.setTimer(callback, delayMs) : setTimeout(callback, delayMs);
  }

  private clearTimer(handle: unknown): void {
    const timers = this.transportOptions as Partial<WebSocketTransportOptions>;
    if (timers.clearTimer) timers.clearTimer(handle as never);
    else clearTimeout(handle as ReturnType<typeof setTimeout>);
  }

  /** The one writer of `roleState`: a move the table does not list is refused (false) and logged. */
  private moveRole(next: SessionRoleState, detail: string): boolean {
    const from = this.roleState;
    if (from === next) return true;
    if (!ROLE_MOVES[from].includes(next)) {
      this.log('warn', 'role move refused', { from, to: next, detail });
      return false;
    }
    this.roleState = next;
    return true;
  }

  /**
   * Watch a host this seat boots: its actor running moves the role from booting to live. A live host that fails (its
   * thread died: browserHostPort.ts reports a Worker error at any point as boot_failed, and the host tears itself down)
   * hands the match on at once, as a failed boot does (round 2 Q2): the role kept live_host with the dead host and the
   * room heard nothing, so with this page's room socket still up every peer waited for the room's report staleness (90 s)
   * before the next election. The seat steps down as stepDown does (review round 1): its own match client moves onto a
   * peer link, which has no target until the room names another host (roomSignaler), and follows the room's next
   * election like any peer. Left on the dead host's loopback, which only the host's own pump drives, the client hung in
   * 'reconnecting' with role 'none' until its recovery grace ran out, and no election could reach it. A failing boot is
   * becomeHost's to report (its host.start rejects).
   */
  private watchHost(host: MatchHost): void {
    const off = host.onState((state, detail) => {
      if (this.host !== host) { off(); return; }
      if (state === 'live' && this.roleState === 'booting_host') this.moveRole('live_host', 'host live');
      if (state === 'failed' && this.roleState === 'live_host') {
        this.log('error', 'the live host failed; handing the match on', { generation: this.room.generation, detail });
        if (this.migrating && this.migrating.state !== 'closed') this.stepDown('host failed');
        if (this.host === host) {
          // no live match link to step down onto (this seat's client already ended its round): the host goes all the same
          this.host = null;
          this.moveRole('none', 'host failed');
          this.p2pListeners.emit({ kind: 'role', role: null, generation: this.room.generation });
        }
        this.setDecline('match', { declined: true, unable: true });
      }
      if (state === 'stopped' || state === 'failed') off();
    });
  }

  /** The match is over (a verdict, the room's loss, the actor's own end): a host this seat runs serves only its end. */
  private settleHostRole(detail: string): void {
    if (HOSTING.has(this.roleState)) this.moveRole('finished_host', detail);
  }

  /** A finished round's host is dropped once its own seat's link closes: the actor played out its end (or the link went). */
  private releaseFinishedHost(detail: string): void {
    const host = this.host;
    if (this.roleState !== 'finished_host' || !host) return;
    this.host = null;
    host.stop(CLOSE_REASON.MATCH_ENDED, detail);
    this.moveRole('none', detail);
    this.p2pListeners.emit({ kind: 'role', role: null, generation: this.room.generation });
  }

  // ------------------------------------------------------------ lifecycle

  /** Subscribe to the room; a match already announced (a resumed seat) is entered at once. */
  start(): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.roomSubscriptions.push(this.room.onMatchStart((payload) => {
      if (this.autoEnter) void this.enterMatch(payload).catch(() => { /* reported through the phase */ });
    }));
    this.roomSubscriptions.push(this.room.onMatchStatus((payload) => this.matchStatus(payload)));
    this.roomSubscriptions.push(this.room.onClosed(() => { void this.leaveMatch('room_closed'); }));
    this.roomSubscriptions.push(this.room.onHostChanged((change) => { void this.handleHostChanged(change); }));
    this.roomSubscriptions.push(this.room.onPhase(({ phase }) => { if (phase === 'joined') this.syncDecline(true); }));
    this.roomSubscriptions.push(this.room.onState((room) => { this.revokeRemovedSeats(room); this.syncDecline(false); }));
    this.syncDecline(true);
    const pending = this.room.matchStart;
    if (pending && this.autoEnter) void this.enterMatch(pending).catch(() => { /* reported through the phase */ });
  }

  /**
   * The one writer of `decline`. `say` tells the room (true: declined, false: willing again; `unable` with it when the
   * seat cannot run the match at all); omitted, only this seat's own record moves (the room already knows). A say the
   * room refuses or never answers (an older room, a timeout) leaves the seat's decline as it is: syncDecline says it
   * again on the next admission or move of the room's record (round 2 U7: the unable and headroom says cleared it on a
   * failure, past this owner, so every later room_state said `unable` again and every slow frame `headroom`).
   */
  private setDecline(next: HostDecline, say?: { declined: boolean; unable?: boolean }): void {
    this.decline = next;
    if (next === null) this.declineUnable = false;
    else {
      this.lateDecline = false;
      if (say?.declined) this.declineUnable = say.unable === true;
    }
    if (!say) return;
    const declining = say.declined ? {} : null;
    if (declining) this.declinesMayLand.add(declining);
    void this.room.declineHost(say.declined, say.unable ? { unable: true } : {}).then( // the room may predate the command
      // it reached the record; applied after the reset, its echo is on its way and the mark waits for that
      () => { if (declining) this.declinesMayLand.delete(declining); },
      (error: unknown) => {
        // Only a say that certainly never reached the room's record (refused, never sent) is over: once none may land,
        // no late one can echo (round 2 Q4). A timeout or a lost socket may follow a write the room made: 44af12dcec
        // cleared the mark on every failure, so a willing seat's own late decline that the room applied after a timed-out
        // request stayed on its record; before that, a refused one kept the mark and the next external decline went.
        // A room refuses host_decline for the seat or the room as a whole (not_in_room; invalid_command from a room that
        // predates it), never one say of two, so an acked say whose echo is due and a refused one do not meet at a reset.
        if (!declining || !roomCommandNeverApplied(error) || !this.declinesMayLand.delete(declining)) return;
        if (this.declinesMayLand.size === 0) this.lateDecline = false;
      },
    );
  }

  /**
   * Keep the room's record of this seat's decline in step with the seat (audit M2, 2026-11-02). A seat that cannot host
   * says so once it is in the room, so the election never names it — and again when the room's record of it reads
   * willing on an admission or after a reset (best effort: an older room ignores it). A decline made for one match is
   * over once the room is back to waiting: the room reset it, and one of this seat's own that reached the room after
   * that reset is withdrawn here, as is a declined record an admission finds while this seat is willing (an earlier
   * page's). A decline other code made straight through the room client is not this session's to undo (2026-11-03).
   * While that match runs, an admission whose record lost the decline (a command sent into a room-socket blip) says it
   * again.
   */
  private syncDecline(admitted: boolean): void {
    if (!this.p2pOptions || this.room.phase !== 'joined') return;
    if (admitted) {
      // the room's record at an admission holds every earlier command of this seat it applied, and the admission retired
      // the seat's old socket, whose later frames the room turns away (roomActor handleMessage): nothing said before it
      // can land after it
      this.declinesMayLand.clear();
      this.lateDecline = false;
    }
    const room = this.room.room;
    const record = room?.players.find((player) => player.id === this.room.playerId)?.hostDeclined ?? null;
    const previousRecord = this.declineRecord;
    this.declineRecord = record;
    if (!this.canHost && this.decline !== 'unable') {
      // `unable` (2026-09-30): this seat cannot host at all — elected as the last resort, its decline ends the match at once
      this.p2pListeners.emit({ kind: 'declined' });
      this.setDecline('unable', { declined: true, unable: true });
      return;
    }
    if (record === null || !room) return;
    if (room.phase !== 'waiting') this.lateDecline = false;
    if ((this.decline === 'match' || this.decline === 'reentry') && room.phase === 'waiting') {
      this.log('info', 'the match a decline was made for is over: willing to host again', { decline: this.decline });
      // a say that may still land reaches the room after the reset: the record turning declined is that one
      const late = !record && this.declinesMayLand.size > 0;
      this.setDecline(null, record ? { declined: false } : undefined);
      this.lateDecline = late;
      return;
    }
    // Only an admission or a move of the room's record re-says anything: a room that never echoes a decline is not asked
    // again on every snapshot.
    if (record === (this.decline !== null) || !(admitted || previousRecord !== record)) return;
    const roundMatch = room.match && room.match.id === this.currentRound?.matchStart.matchId ? room.match : null;
    // the seat's own decline, which the room's record lost (a reset at a match's end, a room that forgot): said again
    if (this.decline === 'unable') this.setDecline('unable', { declined: true, unable: true });
    else if (this.decline === 'headroom') this.setDecline('headroom', { declined: true });
    // a decline for the match this seat's round still runs (match, reentry) that never reached the room (sent into a
    // room-socket blip): said again, with the flag it was said with, on the admission that ends the blip. Without it a
    // seat elected while its world loads stayed the room's host until its world was ready (audit M2, 2026-11-03).
    else if (this.decline !== null && admitted && room.phase !== 'waiting' && roundMatch && (roundMatch.status === 'starting' || roundMatch.status === 'playing')) {
      this.log('info', 'a decline for the running match the room never read: said again', { decline: this.decline });
      this.setDecline(this.decline, { declined: true, ...(this.declineUnable ? { unable: true } : {}) });
    }
    // a decline this seat no longer means: its own that reached the room after the reset of its match, or a record an
    // admission finds. Withdrawing every declined record while willing also undid a decline other code sent through the
    // room client (the e2e harness's "this seat declined", the headless peer tool's hook) the moment the room echoed it.
    else if (this.decline === null && room.phase === 'waiting' && this.canHost && (admitted || this.lateDecline)) {
      this.lateDecline = false;
      this.setDecline(null, { declined: false });
    }
  }

  /** Enter (or re-enter) the announced match: presentation, transport on the seat token, client. */
  async enterMatch(payload: RoomMatchStartPayload): Promise<MatchClient> {
    if (this.disposed) throw new Error('session disposed');
    // The same match re-sent while its world still loads (a room-socket blip resumed: the room re-sends match_start on
    // every admission; audit M2, 2026-11-02): the entry in flight goes on — it reads the room's newest host and secret
    // when the world is ready. It used to need a match client, so the blip tore the loading round down and loaded again.
    const inFlight = this.entering;
    if (inFlight && inFlight.matchId === payload.matchId && !this.matchClient) return inFlight.promise;
    const promise = this.enterRound(payload);
    this.entering = { matchId: payload.matchId, promise };
    try {
      return await promise;
    } finally {
      if (this.entering?.promise === promise) this.entering = null;
    }
  }

  private async enterRound(payload: RoomMatchStartPayload): Promise<MatchClient> {
    if (this.currentRound?.matchStart.matchId === payload.matchId && this.matchClient) {
      // The same match re-sent to a seat back from a room-socket blip (P3, 2026-09-28): the room may have elected another host
      // meanwhile and this seat missed the host_changed. The room client now reads the current generation from the URL: a host
      // the room replaced steps down at once (its next report would be host_only anyway), a peer re-offers to the current host.
      const generation = this.room.generation;
      if (parseP2pMatchUrl(payload.matchUrl) && generation > this.runningGeneration && this.migrating) {
        const me = this.room.playerId;
        if (HOSTING.has(this.roleState) && this.room.hostId !== me) this.stepDown('match_start re-sent');
        else if (this.peerTransport) { this.runningGeneration = generation; this.peerTransport.retarget('match_start re-sent'); }
      }
      return this.matchClient;
    }
    await this.leaveMatch('rematch');
    const generation = ++this.generation;
    const room = this.room.room;
    if (!room) throw new Error('no room snapshot');
    const round: SessionRound = { matchStart: payload, room, spectator: payload.team === 'spectator', playerId: this.room.playerId };
    this.currentRound = round;
    this.revokedSeats.clear();
    this.lastVerdict = null;
    this.setPhase('loading', payload.matchId);
    this.startEntryReports(round, payload);
    const early = this.openEarlyPeerLink(payload, round);
    let presentation: SessionPresentation;
    try {
      presentation = await this.createPresentation(round);
    } catch (error) {
      this.closeEarlyPeerLink(early, 'presentation failed');
      if (generation === this.generation) { this.currentRound = null; this.setPhase('lobby', 'presentation failed'); }
      throw error;
    }
    if (generation !== this.generation || this.disposed) { this.closeEarlyPeerLink(early, 'round superseded'); presentation.dispose(); throw new Error('round superseded'); }
    this.presentation = presentation;
    let transport: Transport;
    const rtc = parseP2pMatchUrl(payload.matchUrl);
    if (rtc) {
      try {
        transport = this.adoptEarlyPeerLink(early) ?? this.openPeerToPeer(payload, round);
      } catch (error) {
        presentation.dispose();
        this.presentation = null;
        this.currentRound = null;
        this.setPhase('lobby', 'host failed');
        throw error;
      }
    } else {
      transport = this.createTransport({
        url: this.room.resolveUrl(payload.matchUrl),
        resumeToken: payload.seatToken,
        clock: this.clock,
        ...this.transportOptions,
      });
    }
    const client = new MatchClient({
      transport,
      token: payload.seatToken,
      clock: this.clock,
      clientBuild: this.clientBuild,
      controls: round.spectator ? null : presentation.controls ?? null,
      prediction: round.spectator ? null : presentation.prediction ?? null,
      ...this.matchOptions,
    });
    this.matchClient = client;
    this.unbind = bindMatchPresentation(client, presentation.adapter);
    client.onWelcome((welcome) => {
      if (this.matchClient !== client) return;
      if (this.migrationActive) this.endMigration('welcomed');
      this.welcomedGeneration = this.room.generation;
      this.withdrawReentryDecline();
      this.scheduleStandby(client, round, welcome);
      void Promise.resolve(presentation.onWelcome?.(welcome)).then(() => {
        if (this.matchClient === client && !round.spectator && presentation.prediction) client.enablePrediction(presentation.prediction);
      }).catch(() => { /* the presentation reports its own failures */ });
    });
    client.onFrame((frame) => {
      if (this.matchClient !== client) return;
      this.frameListeners.emit(frame);
      if (frame.meta.verdict !== VERDICT.NONE) this.settleVerdict(frame.meta.verdict, frame.meta.verdictReason, payload.matchId);
    });
    client.onPhase((phase, detail) => {
      if (this.matchClient !== client) return;
      if (phase === 'failed' && this.currentPhase === 'match') this.setPhase('lost', detail);
      if (phase === 'closed' && this.currentPhase === 'match') {
        const reason = client.lastCloseReason;
        if (reason === CLOSE_REASON.MATCH_ENDED) { this.settleHostRole('match ended'); this.setPhase(this.lastVerdict ? 'ended' : 'lost', 'match ended'); }
        else if (reason !== CLOSE_REASON.CLIENT_LEAVE) this.setPhase('lost', detail);
      }
      // A finished round's host goes once its own seat's link closes: the actor played out its end (its MATCH_ENDED).
      // A host whose own link failed while its match runs stays a host: its peers still play on it, and its leave hands
      // the match on.
      if ((phase === 'closed' || phase === 'failed') && this.roleState === 'finished_host') this.releaseFinishedHost(`own link ${phase}`);
    });
    this.roundsEntered++;
    this.setPhase('match', payload.matchId);
    client.connect();
    return client;
  }

  // ------------------------------------------------------------ peer-to-peer

  private roomSignaler(): Signaler {
    return {
      // never this seat itself: an elected peer booting as host kept offering to itself every attempt until its actor ran
      // (the e2e of 2026-10-13: 26 s of refused signal_target offers and a fresh peer connection each time)
      target: () => { const hostId = this.room.hostId; return hostId && hostId !== this.room.playerId ? { hostId, generation: this.room.generation } : null; },
      sendSignal: (payload) => this.room.sendSignal(payload),
      onSignal: (listener) => this.room.onSignal(listener),
      recentOffers: () => this.room.recentOffers(),
    };
  }

  /**
   * Plan step 8 (2026-10-13; MP-SINCE-0930 MP-S03): the room replaces a host whose reports stop for 90 s, and an
   * elected host's actor boots only after its presentation has built the world — a slow entry (a cold compile, a busy
   * machine) used to cost the match its host before it began, and the peers a migration onto a seat that was loading
   * too. From the match_start until its actor's first report, the elected host reports `loading` (tick 0) every
   * entryReportIntervalMs, for at most entryReportCeilingMs; a host whose tab is wedged sends nothing (its timers do
   * not run) and is replaced as before. Only a fresh match's elected host: a running match's re-entry declines.
   */
  private startEntryReports(round: SessionRound, payload: RoomMatchStartPayload): void {
    this.stopEntryReports('restart');
    const p2p = this.p2pOptions;
    const me = this.room.playerId;
    if (!p2p || !parseP2pMatchUrl(payload.matchUrl) || (this.room.hostId ?? payload.hostId ?? null) !== me || !this.canHost) return;
    if (!this.hostSecretFor(payload) || this.matchRunning(round)) return;
    const timers = this.transportOptions as Partial<WebSocketTransportOptions>;
    const setTimer = timers.setTimer ?? ((callback: () => void, delayMs: number) => setTimeout(callback, delayMs));
    const clearTimer = timers.clearTimer ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    const intervalMs = p2p.entryReportIntervalMs ?? ROOM_MATCH_REPORT_INTERVAL_MS;
    const ceilingMs = p2p.entryReportCeilingMs ?? ENTRY_REPORT_CEILING_MS;
    const generation = this.room.generation;
    const startedAt = this.clock();
    let timer: unknown = null;
    let sent = 0;
    const reports = {
      stop: (reason: string): void => {
        if (this.entryReports !== reports) return;
        this.entryReports = null;
        if (timer !== null) clearTimer(timer as never);
        timer = null;
        this.log('info', 'entry reports stopped', { reason, sent, ms: Math.round(this.clock() - startedAt) });
      },
    };
    const send = (): void => {
      timer = null;
      if (this.entryReports !== reports) return;
      if (this.currentRound !== round || this.room.hostId !== me || this.room.generation !== generation) { reports.stop('superseded'); return; }
      if (this.clock() - startedAt >= ceilingMs) { reports.stop('ceiling'); return; }
      sent++;
      void this.room.reportMatch({ matchId: payload.matchId, generation, phase: 'loading', tick: 0 }).catch((error: unknown) => {
        // host_only: the room elected another seat meanwhile; the round's own handling follows its host_changed
        if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'host_only') reports.stop('host_only');
      });
      timer = setTimer(send, intervalMs);
    };
    this.entryReports = reports;
    send();
  }

  private stopEntryReports(reason: string): void {
    this.entryReports?.stop(reason);
  }

  /**
   * Whether the round's match already runs on a host (audit M2, 2026-11-03): the room's current record of the match
   * says playing, the entry's own room snapshot did, or the room's newest election for the match resumes from a
   * keyframe (tick > 0) that the seats in the match hold. A seat elected while its world loads holds no such state. The
   * entry snapshot alone went stale: a seat that began loading while the match was starting and was elected after it
   * went playing booted a fresh host at tick 0, and the battle restarted for every peer.
   */
  private matchRunning(round: SessionRound): boolean {
    const matchId = round.matchStart.matchId;
    const current = this.room.room?.match;
    if (round.room.match?.status === 'playing' || (current?.id === matchId && current.status === 'playing')) return true;
    const election = this.room.lastHostChanged;
    return !!election && election.resumeTick > 0 && this.room.matchStart?.matchId === matchId;
  }

  /**
   * The per-match host secret this seat holds for `payload`'s match (audit M2, 2026-11-02): the newest election naming
   * this seat carries it (RoomClient.lastHostChanged), the room's newest match_start of the match carries it once this
   * seat hosts (re-sent on a resume), else the payload's own. An election that named this seat while its world loaded
   * used to be dropped, and the loaded seat, named without the secret, declined as unable.
   */
  private hostSecretFor(payload: RoomMatchStartPayload): string | null {
    const me = this.room.playerId;
    const election = this.room.lastHostChanged;
    const latest = this.room.matchStart;
    const candidates: unknown[] = [
      election?.hostId === me ? election.hostSecret : undefined,
      latest?.matchId === payload.matchId ? (latest as { hostSecret?: unknown }).hostSecret : undefined,
      (payload as { hostSecret?: unknown }).hostSecret,
    ];
    for (const candidate of candidates) if (typeof candidate === 'string' && candidate.length >= 16) return candidate;
    return null;
  }

  /**
   * A seat that declined only because it re-entered a running match without its state (the reload inside the host
   * grace) holds the match's state once it is welcomed as a peer: it withdraws the decline, so a later election may
   * name it again (plan step 8). A seat that cannot host never declined this way.
   */
  /**
   * One display frame of this tab (the app calls it from its foreground frame loop; a hidden tab's frames are not a
   * measure). Plan step 10: a seat whose frames run too slow to host well declines to host while it waits in the room,
   * and offers again when they recover. Never during a match: a hosting seat's decline hands the match on mid-battle.
   */
  observeFrame(frameMs: number): void {
    const p2p = this.p2pOptions;
    if (!p2p || p2p.hostHeadroom === false || !this.canHost) return;
    this.headroom ??= createHostHeadroomMonitor(p2p.hostHeadroom ?? {});
    this.headroom.frame(frameMs);
    if (this.currentPhase !== 'lobby' || this.roleState !== 'none' || this.room.phase !== 'joined') return;
    const weak = this.headroom.weak;
    if (weak && this.decline === null) {
      this.log('info', 'frames too slow to host well: declining to host', { p50FrameMs: this.headroom.p50FrameMs });
      this.p2pListeners.emit({ kind: 'declined' });
      this.setDecline('headroom', { declined: true });
    } else if (!weak && this.decline === 'headroom') {
      this.log('info', 'frames recovered: willing to host again', { p50FrameMs: this.headroom.p50FrameMs });
      this.setDecline(null, { declined: false });
    }
  }

  /**
   * Plan step 11 (2026-10-13; MU.07): the hosting tab is going away (the browser's pagehide: a close, a reload, a
   * navigation, or a page entering the back-forward cache). The room waited out the socket lease for a vanished host
   * (10 s on the e2e of 2026-10-13, 13.75 s from the close to the new host's first report): when another seat can take
   * the match, this seat now declines inside the event (`host_decline`, a preference: with no candidate after all the
   * room keeps it, and its lease runs as before) and steps down at once — its actor stopped, the seat a peer — so a page
   * restored from the back-forward cache never thinks it still hosts. "Another seat" is the room's own candidate set: any
   * connected commander, a seat that declined hosting included (2026-10-14): the room's ladder takes a declined
   * commander as the last resort, at once on this decline and after the lease without it, so waiting out the lease
   * elected the same seat 8 s later — and a slow machine declines in the lobby (host headroom, §13.18), so under load
   * every other seat had declined and the hand-off never ran. With no other connected commander (a solo room with bots,
   * the others gone or spectating), nothing is sent: the lease and the resume hold run as they did, so the same player
   * can come back. Synchronous by design: nothing is awaited. True when it handed the match on.
   */
  handOffHosting(reason: string): boolean {
    const host = this.host;
    // a finished round's host has nothing to hand on (its match is over), a booting or live one does
    if (!host || !HOSTING.has(this.roleState) || host.state === 'stopped' || host.state === 'failed' || this.handedOff) return false;
    if (this.room.phase !== 'joined' || this.room.hostId !== this.room.playerId) return false;
    const me = this.room.playerId;
    const successor = this.room.room?.players.some((player) => player.id !== me && player.team !== 'spectator' && player.connected) ?? false;
    if (!successor) {
      this.log('info', 'hosting tab going away with no other commander connected: the room keeps it (the lease)', { reason });
      return false;
    }
    this.handedOff = true;
    this.log('info', 'hosting tab going away: handing the match on', { reason, generation: this.room.generation });
    this.setDecline('match', { declined: true }); // the page is going; the socket lease still covers a refusal
    this.stepDown(reason);
    return true;
  }

  /** The tab's frame headroom as the host choice reads it (diagnostics). */
  get hostHeadroom(): { weak: boolean; p50FrameMs: number | null; declined: boolean } | null {
    return this.headroom ? { weak: this.headroom.weak, p50FrameMs: this.headroom.p50FrameMs, declined: this.decline === 'headroom' } : null;
  }

  /**
   * The standby host (§13.21): a peer that may host prepares a host thread `delayMs` after its welcome — the world and
   * the fleet a boot of this match needs — so an election boots its actor at once rather than loading them while every
   * seat waits. Once per match; a later welcome (a reconnect, a migration onto another host) keeps the one it has.
   */
  private scheduleStandby(client: MatchClient, round: SessionRound, welcome: WelcomeMessage): void {
    const p2p = this.p2pOptions;
    if (!p2p || p2p.standbyHost === false || !this.canHost || this.host || round.spectator) return;
    if (!parseP2pMatchUrl(round.matchStart.matchUrl)) return;
    if (this.standby?.matchId === round.matchStart.matchId || this.standbyTimer !== null) return;
    const delayMs = Math.max(0, (p2p.standbyHost ? p2p.standbyHost.delayMs : undefined) ?? STANDBY_HOST_DELAY_MS);
    // the injected timers, as every other phase of the session (audit M2, 2026-11-02: this one used the global setTimeout)
    this.standbyTimer = this.setTimer(() => {
      this.standbyTimer = null;
      if (this.disposed || this.matchClient !== client || this.currentRound !== round || this.host || !this.canHost) return;
      this.closeStandby('replaced');
      const plan = planFromRoster(welcome.roster, this.room.room);
      const specIds = [...new Set([...plan.seats.filter((seat) => seat.team !== 'spectator').map((seat) => seat.specId), ...plan.bots.map((bot) => bot.specId)])];
      let port: HostPort<HostToWorkerMessage, WorkerToHostMessage>;
      try { port = p2p.createHostPort!(); } catch (error) {
        this.log('warn', 'standby host thread unavailable', { error: error instanceof Error ? error.message : String(error) });
        return;
      }
      const standby = { port, unsubscribe: (() => {}) as Unsubscribe, matchId: round.matchStart.matchId, prepared: false };
      standby.unsubscribe = port.onMessage((message) => {
        if (message.type !== 'prepared') return;
        standby.prepared = message.ok;
        this.log(message.ok ? 'info' : 'warn', 'standby host prepared', { ok: message.ok, ms: message.ms, ...(message.error ? { error: message.error } : {}) });
      });
      this.standby = standby;
      port.post({ type: 'prepare', prepare: { mapId: round.matchStart.mapId, mode: round.matchStart.mode, manifestBase: p2p.manifestBase ?? null, simKernelsUrl: p2p.simKernelsUrl ?? null, specIds, bots: plan.bots.length > 0 } });
    }, delayMs);
  }

  /** The standby's port for this match's boot (its listener released: the host runtime subscribes its own), or null. */
  private takeStandby(): HostPort<HostToWorkerMessage, WorkerToHostMessage> | null {
    const standby = this.standby;
    this.standby = null;
    if (!standby) return null;
    standby.unsubscribe();
    if (standby.matchId !== this.currentRound?.matchStart.matchId) { standby.port.close(); return null; }
    return standby.port;
  }

  private closeStandby(reason: string): void {
    if (this.standbyTimer !== null) { this.clearTimer(this.standbyTimer); this.standbyTimer = null; }
    const standby = this.standby;
    this.standby = null;
    if (!standby) return;
    standby.unsubscribe();
    standby.port.close();
    this.log('info', 'standby host released', { reason });
  }

  /** Diagnostics: this seat's standby host thread (null: none). */
  get standbyHost(): { matchId: string; prepared: boolean } | null {
    return this.standby ? { matchId: this.standby.matchId, prepared: this.standby.prepared } : null;
  }

  private withdrawReentryDecline(): void {
    if (this.decline !== 'reentry') return;
    if (!this.canHost || this.room.phase !== 'joined') { this.setDecline(null); return; }
    this.log('info', 'welcomed after a re-entry decline: willing to host again');
    this.setDecline(null, { declined: false });
  }

  private createPeerTransport(): WebRtcTransport {
    const p2p = this.p2pOptions!;
    const { clock: _clock, createSocket: _socket, ...rest } = this.transportOptions as Partial<WebSocketTransportOptions>;
    return new WebRtcTransport({
      signaler: this.roomSignaler(), ice: p2p.ice, createPeerConnection: p2p.createPeerConnection, clock: this.clock,
      ...(rest as Partial<Pick<WebSocketTransportOptions, 'backpressure' | 'reconnect' | 'autoReconnect' | 'maxFrameBytes' | 'setTimer' | 'clearTimer' | 'random'>>),
    });
  }

  private createHost(): MatchHost {
    const p2p = this.p2pOptions!;
    const timers = this.transportOptions as Partial<WebSocketTransportOptions>;
    return createMatchHost({
      playerId: this.room.playerId, generation: () => this.room.generation,
      room: {
        signaler: this.roomSignaler(),
        reportMatch: (report) => { this.stopEntryReports('host reporting'); return this.room.reportMatch(report).catch((error: unknown) => {
          // host_only: the room runs a newer generation — this seat is no longer the host and steps down to a peer.
          if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'host_only') this.stepDown('host_only');
          throw error;
        }); },
      },
      createPort: () => this.takeStandby() ?? p2p.createHostPort!(), ice: p2p.ice, createPeerConnection: p2p.createPeerConnection,
      ...(p2p.maxPeers !== undefined ? { maxPeers: p2p.maxPeers } : {}),
      clock: this.clock, ...(timers.setTimer ? { setTimer: timers.setTimer } : {}), ...(timers.clearTimer ? { clearTimer: timers.clearTimer } : {}),
      onLog: (level, message, fields) => this.log(level, message, fields),
    });
  }

  /**
   * 2026-10-20 (item/mp-rejoin-229; MP-228-REJOIN lever 1): a seat entering a match that is already playing on another
   * seat's host opens its peer link now, beside its presentation's world load. On the 227 rejoins the link stayed idle
   * until the world was built (15.5 s) and then took 7.4 s to open, and the roster stage waited for the WELCOME. The
   * HELLO still waits for the presentation: the match client is built on this link once the world is ready and says
   * hello then (MatchClient.connect on an open link), so the host attaches the seat no earlier than before and nothing
   * on the wire changes. A fresh match's host boots only after its own world, so a starting match's peers keep the late
   * link (their early offers would go unanswered); so do a seat the room names as host and a re-entry that declines it.
   */
  private openEarlyPeerLink(payload: RoomMatchStartPayload, round: SessionRound): { migrating: MigratingTransport; peer: WebRtcTransport } | null {
    if (!this.p2pOptions || !parseP2pMatchUrl(payload.matchUrl) || round.room.match?.status !== 'playing') return null;
    const hostId = this.room.hostId ?? payload.hostId ?? null;
    if (!hostId || hostId === this.room.playerId) return null;
    const migrating = this.openPeerToPeer(payload, round) as MigratingTransport;
    const peer = this.peerTransport;
    if (!peer || this.migrating !== migrating) { migrating.close(undefined, 'early link not a peer link'); return null; }
    migrating.open();
    return { migrating, peer };
  }

  /**
   * The early link the presentation's world load ran beside, once the world is ready: kept when it is still this round's
   * peer link (open, or still connecting or reconnecting on its own) and the room still names another seat as host; the
   * link follows an election that came meanwhile (`retarget`). Otherwise it is closed and the late path opens one (null).
   */
  private adoptEarlyPeerLink(early: { migrating: MigratingTransport; peer: WebRtcTransport } | null): Transport | null {
    if (!early) return null;
    const hostId = this.room.hostId;
    if (this.migrating !== early.migrating || this.peerTransport !== early.peer || early.migrating.state === 'closed' || !hostId || hostId === this.room.playerId) {
      this.closeEarlyPeerLink(early, 'early link replaced');
      return null;
    }
    this.servingHostId = hostId;
    this.runningGeneration = Math.max(this.runningGeneration, this.room.generation);
    early.peer.retarget('host changed during entry');
    return early.migrating;
  }

  private closeEarlyPeerLink(early: { migrating: MigratingTransport; peer: WebRtcTransport } | null, reason: string): void {
    if (!early) return;
    if (this.migrating === early.migrating) this.migrating = null;
    if (this.peerTransport === early.peer) { this.peerTransport = null; this.moveRole('none', reason); }
    early.migrating.close(undefined, reason);
  }

  /** The transport of an rtc:// match: the host's loopback (this seat boots the host) or a WebRTC link to the host. */
  private openPeerToPeer(payload: RoomMatchStartPayload, round: SessionRound): Transport {
    const p2p = this.p2pOptions;
    if (!p2p) throw new Error('peer-to-peer matches need the p2p options (ICE, the host thread)');
    const me = this.room.playerId;
    // The room's newest election wins over the payload: a seat re-entering after a Garage return holds the match_start it
    // was sent when it hosted, while the room may have elected another host since (its host_changed is newer).
    const hostId = this.room.hostId ?? payload.hostId ?? null;
    this.servingHostId = hostId;
    this.hostSecret = this.hostSecretFor(payload);
    let inner: Transport;
    this.runningGeneration = Math.max(parseP2pMatchUrl(payload.matchUrl)?.generation ?? 0, this.room.generation);
    // Named host for a match already playing (a reload inside the host grace, or elected while its world loaded): this
    // seat holds no state to resume from, its peers hold the sealed keyframe. Decline, enter as a peer, let the room elect one of them; boot afresh only when
    // no election follows (nobody else is left to host).
    const reentryAsNamedHost = hostId === me && this.canHost && !!this.hostSecret && this.matchRunning(round);
    if (reentryAsNamedHost) {
      this.log('warn', 'named host of a running match without its state: declining so a peer resumes', { matchId: payload.matchId });
      this.p2pListeners.emit({ kind: 'declined' });
      this.setDecline('reentry', { declined: true });
      this.setTimer(() => {
        if (this.currentRound !== round || this.host || this.room.hostId !== me || !this.migrating) return;
        // No election came: the room kept this seat (no other commander). Boot fresh through the election path.
        this.bootKeptHost(round, 'no election followed the re-entry decline');
      }, this.p2pOptions?.reentryElectionWaitMs ?? 10_000);
    }
    if (hostId === me && this.canHost && this.hostSecret && !reentryAsNamedHost) {
      const plan = planHostBoot(round.room, payload, me);
      const config: HostBootConfig = {
        roomId: round.room.roomCode, matchId: payload.matchId, generation: this.room.generation, mapId: payload.mapId, mode: payload.mode, seed: payload.seed,
        seats: plan.seats, bots: plan.bots, countdownS: p2p.countdownS ?? 5, battleLimitS: null, hostSecret: this.hostSecret, manifestBase: p2p.manifestBase ?? null, simKernelsUrl: p2p.simKernelsUrl ?? null, resume: null,
        arrangement: round.room.settings.arrangement ?? null, campaignOperationId: round.room.settings.campaignOperationId ?? null,
        ...(p2p.snapshotHz !== undefined ? { snapshotHz: p2p.snapshotHz } : {}),
      };
      const host = this.createHost();
      this.host = host;
      this.moveRole('booting_host', 'fresh match');
      this.watchHost(host);
      void host.start(config).catch((error: unknown) => {
        if (this.host !== host) return;
        this.log('error', 'host boot failed', { error: error instanceof Error ? error.message : String(error) });
        if (this.currentPhase === 'match' || this.currentPhase === 'loading') this.setPhase('lost', 'host_boot_failed');
      });
      inner = host.transport;
      this.p2pListeners.emit({ kind: 'role', role: 'host', generation: this.room.generation });
    } else {
      if (hostId === me && !reentryAsNamedHost) {
        // The room named this seat but it cannot host (no thread, the mobile tier, no secret): decline and wait for the election.
        this.log('warn', 'named host cannot host; declining', { canHost: this.canHost, secret: !!this.hostSecret });
        this.p2pListeners.emit({ kind: 'declined' });
        this.setDecline(this.canHost ? 'match' : 'unable', { declined: true, unable: true });
      }
      const peer = this.createPeerTransport();
      this.peerTransport = peer;
      this.moveRole('peer', 'match link');
      inner = peer;
      this.p2pListeners.emit({ kind: 'role', role: 'peer', generation: this.room.generation });
    }
    const migrating = new MigratingTransport(inner);
    this.migrating = migrating;
    return migrating;
  }

  private endMigration(detail: string): void {
    if (!this.migrationActive) return;
    this.migrationActive = false;
    const hostId = this.migrationHostId ?? '';
    this.migrationHostId = null;
    if (this.roleState === 'migrating') this.moveRole('peer', detail);
    this.p2pListeners.emit({ kind: 'migration', phase: 'end', hostId, generation: this.room.generation, role: this.role, detail });
  }

  /**
   * Boot this seat's host for the election the room kept (audit M2, 2026-11-02): a re-entry decline the room had nobody
   * to hand on to leaves this seat the host at the room's own generation. The fallback used to run a made-up election at
   * `generation + 1` through handleHostChanged: the seat then ran ahead of the room, its reports carried a generation the
   * room never issued, and the room's next real election (at that generation, naming another seat) read as "not newer"
   * and was ignored.
   * The kept host restarts a battle that had begun (migrationFallback's last resort) on the newest tick it knows (review
   * round 1, U1): the room's election that named it carries the old host's last report tick (roomActor.ts migrateHost),
   * and it used to be dropped for 0, so the restart ran behind every peer's clock by the whole battle. What the seat cannot
   * know (the ticks since that report; a reload hears no election at all) the peers' clients follow at their WELCOME
   * (matchClient.ts receiveWelcome: a host on another timeline re-anchors the clocks).
   */
  private bootKeptHost(round: SessionRound, detail: string): void {
    const client = this.matchClient;
    const migrating = this.migrating;
    if (!client || !migrating || migrating.state === 'closed' || this.currentRound !== round) return;
    const me = this.room.playerId;
    const election = this.room.lastHostChanged;
    const reportTick = election && election.hostId === me && election.generation === this.room.generation && this.room.matchStart?.matchId === round.matchStart.matchId
      ? election.resumeTick : 0;
    const change: RoomHostChangedPayload = { hostId: me, generation: this.room.generation, resumeTick: reportTick, reason: 'declined', ...(this.hostSecret ? { hostSecret: this.hostSecret } : {}) };
    this.runningGeneration = Math.max(this.runningGeneration, change.generation);
    this.migrationsSeen++;
    this.migrationActive = true;
    const previousHostId = this.servingHostId;
    this.servingHostId = me;
    this.migrationHostId = me;
    this.p2pListeners.emit({ kind: 'migration', phase: 'begin', hostId: me, generation: change.generation, role: this.role, detail });
    void this.becomeHost(client, round, change, migrating, previousHostId, true);
  }

  /** The room replaced this host (a host_only on a report): the actor stops, this seat follows the room's current host as a peer. */
  private stepDown(detail: string): void {
    const host = this.host;
    const migrating = this.migrating;
    if (!host || !migrating || !this.moveRole('stepping_down', detail)) return;
    this.log('warn', 'stepping down', { detail, generation: this.room.generation });
    host.stop(CLOSE_REASON.REPLACED, detail);
    this.host = null;
    const peer = this.createPeerTransport();
    this.peerTransport = peer;
    this.moveRole('peer', detail);
    this.runningGeneration = this.room.generation;
    // a newer generation's blobs outrank the one this seat hosted, whatever tick an earlier host stamped on them
    this.matchClient?.migration.setGeneration(this.room.generation);
    migrating.replace(peer, detail);
    this.p2pListeners.emit({ kind: 'role', role: 'peer', generation: this.room.generation });
  }

  /**
   * The room removed a seat of the running match (an admin kick, a leave): the host this seat runs drops its link and
   * refuses its token for the rest of the match (security audit 2026-10-22: a kick used to end the match link only when
   * the kicked client honoured room_closed). A seat that merely lost its room socket stays in the roster and is kept.
   */
  private revokeRemovedSeats(room: RoomSnapshot): void {
    const host = this.host;
    const round = this.currentRound;
    if (!host || !round) return;
    const seated = new Set(room.players.map((player) => player.id));
    for (const player of round.room.players) {
      if (seated.has(player.id) || this.revokedSeats.has(player.id)) continue;
      this.revokedSeats.add(player.id);
      host.revokeSeat(player.id);
    }
  }

  /** The room elected a host: a newer generation than this seat runs is a migration — become it, follow it, or step down. */
  private async handleHostChanged(change: RoomHostChangedPayload): Promise<void> {
    const client = this.matchClient;
    const round = this.currentRound;
    const migrating = this.migrating;
    // 2026-10-20 (item/mp-rejoin-229, the 229 e2e under load): a match link its client already closed (recovery past
    // its grace: the round is lost for this seat) carries no migration; replacing it threw "transport closed" as an
    // unhandled rejection in the page
    if (!client || !round || !migrating || migrating.state === 'closed' || !parseP2pMatchUrl(round.matchStart.matchUrl)) {
      // An election that lands while this seat's world still loads (no match client yet; audit M2, 2026-11-02) is kept by
      // the room client with its secret, and the round's entry acts on it once the world is ready (openPeerToPeer reads
      // the room's newest host and hostSecretFor). Elected meanwhile for a match that has not begun, the seat reports
      // loading as an elected host does. Elected for a match that already runs (2026-11-03), it holds none of the
      // match's state: it declines now, so the room elects a seat that resumes from its keyframe; the entry, once the
      // world is ready, declines again and boots only when no election follows (openPeerToPeer's re-entry path).
      if (!client && round && !this.matchClient && change.hostId === this.room.playerId && parseP2pMatchUrl(round.matchStart.matchUrl)) {
        if (this.canHost && this.matchRunning(round)) {
          this.log('warn', 'elected while the world loads a running match: declining so a peer resumes', { generation: change.generation, resumeTick: change.resumeTick });
          this.p2pListeners.emit({ kind: 'declined' });
          this.setDecline('reentry', { declined: true });
        } else {
          this.log('info', 'elected while the world loads: the entry boots the host', { generation: change.generation });
          this.startEntryReports(round, round.matchStart);
        }
      }
      return;
    }
    const me = this.room.playerId;
    if (change.generation <= this.runningGeneration) {
      // The election that named the host at the start (the URL's generation), or one this seat already runs: nothing moves —
      // unless the room named another host than the match_start did (a decline at the start): then the peer re-offers.
      if (change.hostId !== me && this.peerTransport) this.peerTransport.retarget('host named');
      return;
    }
    this.runningGeneration = change.generation;
    client.migration.setGeneration(change.generation);
    this.migrationsSeen++;
    this.migrationActive = true;
    // the host that went (the resume hold does not wait for it: a silent host may still hold its room socket)
    const previousHostId = this.servingHostId;
    this.servingHostId = change.hostId;
    this.migrationHostId = change.hostId;
    this.p2pListeners.emit({ kind: 'migration', phase: 'begin', hostId: change.hostId, generation: change.generation, role: this.role, detail: change.reason });
    if (change.hostId === me) {
      if (this.host && this.host.state !== 'stopped' && this.host.state !== 'failed') { this.endMigration('already hosting'); return; }
      await this.becomeHost(client, round, change, migrating, previousHostId);
      return;
    }
    if (this.host && this.moveRole('stepping_down', 'host changed')) {
      // Replaced by the room (this seat's room socket was absent past the grace): the actor stops, this seat follows the new host.
      this.host.stop(CLOSE_REASON.REPLACED, 'host changed');
      this.host = null;
      const peer = this.createPeerTransport();
      this.peerTransport = peer;
      this.moveRole('peer', 'host changed');
      migrating.replace(peer, 'host changed');
      this.p2pListeners.emit({ kind: 'role', role: 'peer', generation: change.generation });
      return;
    }
    if (this.peerTransport && this.migrationActive) this.moveRole('migrating', 'host changed');
    this.peerTransport?.retarget('host changed');
  }

  /**
   * Why an election's host boot no longer stands, or null while it does (round 2: every cause was logged as a newer
   * election). The seat left the match (a leave, or a newer round's entry, moved the match client); the boot's host is no
   * longer this seat's (a newer election replaced it, or the room's step-down or the finished match's release dropped
   * it); or the match link the host was to serve closed.
   */
  private bootSuperseded(host: MatchHost, client: MatchClient, migrating: MigratingTransport, generation: number): BootSuperseded | null {
    if (this.matchClient !== client) return 'left the match';
    if (this.host !== host) return this.room.generation > generation ? 'newer election' : 'host released';
    if (migrating.state === 'closed') return 'match link closed';
    return null;
  }

  private async becomeHost(client: MatchClient, round: SessionRound, change: RoomHostChangedPayload, migrating: MigratingTransport, previousHostId: string | null = null, kept = false): Promise<void> {
    const me = this.room.playerId;
    const secret = change.hostSecret ?? this.hostSecret;
    if (!this.canHost || !secret) {
      this.log('warn', 'elected but cannot host; declining', { canHost: this.canHost, secret: !!secret });
      this.p2pListeners.emit({ kind: 'migration', phase: 'failed', hostId: me, generation: change.generation, role: this.role, detail: 'cannot host' });
      this.migrationActive = false;
      this.migrationHostId = null;
      // the last resort that cannot host: the room ends the match now when nobody else can (2026-09-30), instead of
      // keeping this seat as a host that never reports for the report budget
      this.setDecline(this.canHost ? 'match' : 'unable', { declined: true, unable: true });
      return;
    }
    this.hostSecret = secret;
    // The thread and the acceptor come up before the retained state is opened: peers re-offer the moment they hear the
    // election, and their offers must find an acceptor (the core holds their HELLOs until the actor runs).
    const host = this.createHost();
    this.host = host;
    this.moveRole('booting_host', 'elected');
    this.watchHost(host);
    const retained = client.retainedMigration();
    const welcome = client.welcome;
    let resume: HostBootConfig['resume'] = null;
    let plan: HostBootPlan | null = null;
    let battleLimitS: number | null = null;
    // the ruleset the first host booted with rides the sealed configuration; a pre-lane blob leaves the room's own settings
    let arrangement = round.room.settings.arrangement ?? null;
    let campaignOperationId = round.room.settings.campaignOperationId ?? null;
    try {
      const key = await deriveMigrationKey(secret);
      if (retained.config) {
        const config = decodeBootConfig(await openMigrationBlob(key, retained.config.blob));
        plan = { seats: config.seats, bots: config.bots };
        battleLimitS = config.battleLimitS ?? null;
        if (config.arrangement !== undefined) arrangement = config.arrangement;
        if (config.campaignOperationId !== undefined) campaignOperationId = config.campaignOperationId;
      }
      if (retained.keyframe) {
        const keyframe = decodeMigrationKeyframe(await openMigrationBlob(key, retained.keyframe.blob));
        // the newer of the keyframe and this viewer's newest frame, and every prop this seat was told fell (migrationState.ts)
        const { state, baseTick, baseAtMs } = resumeStateFromRetained(keyframe, retained.keyframe.receivedAtMs, retained.latestFrame, retained.latestFrameAtMs, retained.fallen, retained.destruction ?? [], retained.respawns ?? []);
        const elapsedTicks = Math.max(0, Math.ceil((this.clock() - baseAtMs) / TICK_MS));
        resume = { ...state, resumeTick: Math.max(change.resumeTick, baseTick + elapsedTicks) };
      }
    } catch (error) {
      this.log('warn', 'retained migration state unreadable', { error: error instanceof Error ? error.message : String(error) });
      resume = null;
    }
    // no readable keyframe (audit M1, migrationState.ts migrationFallback): a battle in progress is declined, never
    // restarted at tick 0; before the battle the countdown starts over on the timeline the clients keep
    if (!resume) {
      const roomMatch = this.room.room?.match;
      const fallback = migrationFallback({ latestFrame: retained.latestFrame, latestFrameAtMs: retained.latestFrameAtMs, nowMs: this.clock(), resumeTick: change.resumeTick, countdownMs: (this.p2pOptions?.countdownS ?? 5) * 1000,
        roomMatchStatus: roomMatch && roomMatch.id === round.matchStart.matchId ? roomMatch.status : null, kept });
      if (fallback.kind === 'decline') {
        // Something that ends this boot landed during the key awaits above (bootSuperseded names which: the seat left
        // the match, a newer election, the room's step-down or the finished match's release, or the match link closed):
        // this boot is superseded, as in the host.start catch below (audit M2). Reporting a failure here cleared a newer
        // migration's flag and host and told the room a capable seat is unable to host (integration review r1).
        const superseded = this.bootSuperseded(host, client, migrating, change.generation);
        if (superseded) {
          if (this.host === host) { this.host = null; this.moveRole(this.peerTransport ? 'peer' : 'none', 'boot superseded'); }
          host.stop();
          this.log('info', 'elected host boot superseded', { cause: superseded, generation: change.generation, running: this.runningGeneration });
          return;
        }
        this.log('warn', 'elected without a readable keyframe of a battle in progress; declining', { generation: change.generation, evidence: fallback.evidence });
        // through the session's role machine and its one decline writer, as the boot-failed path below (integration
        // IR11: this branch was written before either existed; it left the role at 'booting_host' with no host, and its
        // decline went past the session's own record)
        this.host = null;
        this.moveRole(this.peerTransport ? 'peer' : 'none', 'no state');
        host.stop();
        this.p2pListeners.emit({ kind: 'migration', phase: 'failed', hostId: me, generation: change.generation, role: this.role, detail: 'no state' });
        this.migrationActive = false;
        this.migrationHostId = null;
        this.setDecline('match', { declined: true, unable: true });
        return;
      }
      // a kept host restarting a battle that had begun says so, with what told it the battle had begun (round 2 U1)
      if (fallback.lastResort) this.log('warn', 'kept host restarts a battle in progress as the last resort', { generation: change.generation, evidence: fallback.lastResort, resumeTick: fallback.resumeTick });
      resume = { ...fallback.state, resumeTick: fallback.resumeTick };
    }
    if (!plan) {
      plan = welcome ? planFromRoster(welcome.roster, this.room.room) : planHostBoot(round.room, round.matchStart, me);
    }
    // the resume hold: the world stays still until the seats that were in the match are back (matchHostCore.ts RESUME_HOLD_MS)
    if (resume) resume = { ...resume, holdForSeats: resumeHoldSeats(this.room.room?.players ?? [], plan.seats, previousHostId) };
    const config: HostBootConfig = {
      roomId: round.room.roomCode, matchId: round.matchStart.matchId, generation: change.generation, mapId: round.matchStart.mapId, mode: round.matchStart.mode,
      seed: welcome ? welcome.seed : round.matchStart.seed, seats: plan.seats, bots: plan.bots, countdownS: resume ? 0 : this.p2pOptions?.countdownS ?? 5, battleLimitS, hostSecret: secret,
      manifestBase: this.p2pOptions?.manifestBase ?? null, simKernelsUrl: this.p2pOptions?.simKernelsUrl ?? null, resume,
      arrangement, campaignOperationId,
      ...(this.p2pOptions?.snapshotHz !== undefined ? { snapshotHz: this.p2pOptions.snapshotHz } : {}),
    };
    try {
      await host.start(config);
    } catch (error) {
      // The boot's host was taken from this seat while it started (the replaced path, audit M2 2026-11-02): a newer
      // election, whose own migration runs on, or the room's step-down or the finished match's release (bootSuperseded
      // names which). Reporting a failure here cleared a newer migration's flag and told the room a capable seat is
      // unable to host.
      if (this.host !== host) {
        this.log('info', 'elected host boot superseded', { cause: this.bootSuperseded(host, client, migrating, change.generation), generation: change.generation, running: this.runningGeneration });
        return;
      }
      this.host = null;
      this.moveRole(this.peerTransport ? 'peer' : 'none', 'boot failed');
      this.log('error', 'elected host failed to boot', { error: error instanceof Error ? error.message : String(error) });
      this.p2pListeners.emit({ kind: 'migration', phase: 'failed', hostId: me, generation: change.generation, role: this.role, detail: 'boot failed' });
      this.migrationActive = false;
      this.migrationHostId = null;
      this.setDecline('match', { declined: true, unable: true });
      return;
    }
    const superseded = this.bootSuperseded(host, client, migrating, change.generation);
    if (superseded) {
      if (this.host === host) { this.host = null; this.moveRole(this.peerTransport ? 'peer' : 'none', 'boot superseded'); }
      host.stop();
      this.log('info', 'elected host boot superseded', { cause: superseded, generation: change.generation, running: this.runningGeneration });
      return;
    }
    const previous = this.peerTransport;
    this.peerTransport = null;
    this.moveRole('live_host', 'elected host live');
    migrating.replace(host.transport, 'host migration');
    previous?.close(undefined, 'became host');
    this.p2pListeners.emit({ kind: 'role', role: 'host', generation: change.generation });
  }

  private settleVerdict(verdict: VerdictId, reason: string, matchId: string): void {
    if (this.lastVerdict) return;
    this.lastVerdict = { verdict, reason, matchId };
    this.verdictsSeen++;
    this.presentation?.onVerdict?.(verdict, reason);
    this.verdictListeners.emit(this.lastVerdict);
    this.settleHostRole('verdict');
    this.setPhase('ended', reason);
  }

  private matchStatus(payload: RoomMatchStatusPayload): void {
    if (!this.currentRound || this.currentRound.matchStart.matchId !== payload.matchId) return;
    if (payload.status === 'ended' && payload.verdict) {
      const verdict: VerdictId = payload.verdict.result === 'alpha' ? VERDICT.ALPHA : payload.verdict.result === 'bravo' ? VERDICT.BRAVO : VERDICT.DRAW;
      this.settleVerdict(verdict, payload.verdict.reason, payload.matchId);
    } else if (payload.status === 'lost' && this.currentPhase !== 'ended') {
      // the room ended the match for every seat: nothing of it is left to hand on
      this.settleHostRole('match_lost');
      this.setPhase('lost', 'match_lost');
    }
  }

  /** One display frame: pump the host (when this seat hosts) and the match client; the bound presentation receives the frame. */
  update(nowMs: number, elapsedS: number): MatchFrame | null {
    this.host?.pump(nowMs);
    const frame = this.matchClient ? this.matchClient.update(nowMs, elapsedS) : null;
    this.watchHostSilence(nowMs);
    return frame;
  }

  /**
   * Host-loss evidence (2026-10-14, the MP stream; §13.22): a peer welcomed by the current host that has accepted no
   * snapshot for ROOM_HOST_UNREACHABLE_AFTER_MS tells the room (`host_unreachable`), again every
   * ROOM_HOST_UNREACHABLE_REPEAT_MS while the silence lasts. The room acts on it only when the host's room socket is gone
   * too — a crashed or killed host tab then costs its peers the claim's 1.5 s rather than the 8 s socket lease. A page
   * that itself stalled (a frame gap over 500 ms) restarts the count: its silence is its own, not the host's.
   */
  private watchHostSilence(nowMs: number): void {
    const client = this.matchClient;
    const stalled = nowMs - this.lastUpdateAt > 500;
    this.lastUpdateAt = nowMs;
    const count = client?.snapshotsAcceptedCount ?? -1;
    if (!client || this.roleState !== 'peer' || !this.peerTransport || this.currentPhase !== 'match' || this.migrationActive
        || this.welcomedGeneration !== this.room.generation || this.room.phase !== 'joined' || stalled || count !== this.hostHeardCount) {
      this.hostHeardCount = count;
      this.hostHeardAt = nowMs;
      return;
    }
    const silentMs = nowMs - this.hostHeardAt;
    if (silentMs < ROOM_HOST_UNREACHABLE_AFTER_MS || nowMs - this.hostClaimAt < ROOM_HOST_UNREACHABLE_REPEAT_MS) return;
    this.hostClaimAt = nowMs;
    this.hostClaims++;
    void this.room.reportHostUnreachable(this.room.generation, silentMs).catch(() => { /* a room that predates the claim */ });
  }

  /** Diagnostics: `host_unreachable` claims this seat sent (§13.22). */
  get hostUnreachableClaims(): number { return this.hostClaims; }

  /** Leave the match (the seat stays in the room) and release the presentation. A hosting seat hands the match on. */
  async leaveMatch(reason = 'leave', closeReason: CloseReasonId = CLOSE_REASON.CLIENT_LEAVE): Promise<void> {
    const client = this.matchClient;
    const presentation = this.presentation;
    const host = this.host;
    // an early peer link no match client owns yet (openEarlyPeerLink): the client's leave would have closed it
    const unowned = client ? null : this.migrating;
    const handedOff = this.handedOff;
    // Only a host leaving a round that is still running hands it on. A settled round (its verdict, a loss) has nothing
    // to hand on, and a rematch's leave runs after the room already elected this seat for the next round: a decline
    // then reads as the NEW round's host declining as unable, and the room ends that round at once (audit M2, 2026-11-02).
    const handsOn = reason !== 'rematch' && HOSTING.has(this.roleState);
    // a leave supersedes an entry still loading (audit M2, 2026-11-02): its token check after the world's await ends it
    this.generation++;
    this.entering = null;
    this.handedOff = false;
    this.stopEntryReports(`leave: ${reason}`);
    this.closeStandby(`leave: ${reason}`);
    this.matchClient = null;
    this.presentation = null;
    this.currentRound = null;
    this.host = null;
    this.peerTransport = null;
    this.moveRole('none', `leave: ${reason}`);
    this.migrating = null;
    this.migrationActive = false;
    this.migrationHostId = null;
    this.unbind?.();
    this.unbind = null;
    if (client) {
      try { client.leave(closeReason); } catch { /* already closed */ }
      client.dispose();
    }
    unowned?.close(undefined, `leave: ${reason}`);
    if (host) {
      // The peers' channels drop silently and the room hears this seat will not host: it elects the next one — and, its
      // actor being gone (`unable`), ends the match at once when nobody else can take it (2026-09-30).
      host.stop(CLOSE_REASON.CLIENT_LEAVE, reason);
      if (handsOn && !handedOff) this.setDecline('match', this.room.phase === 'joined' ? { declined: true, unable: true } : undefined);
      this.p2pListeners.emit({ kind: 'role', role: null, generation: this.room.generation });
    }
    presentation?.dispose();
    if (!this.disposed) this.setPhase('lobby', reason);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const unsubscribe of this.roomSubscriptions.splice(0)) unsubscribe();
    void this.leaveMatch('dispose');
    this.phaseListeners.clear();
    this.verdictListeners.clear();
    this.frameListeners.clear();
    this.p2pListeners.clear();
  }

  stats(): MatchSessionStats {
    return {
      phase: this.currentPhase,
      playerId: this.room.playerId,
      round: this.currentRound?.matchStart.round ?? 0,
      matchId: this.currentRound?.matchStart.matchId ?? null,
      matchUrl: this.currentRound?.matchStart.matchUrl ?? null,
      spectator: this.spectator,
      match: this.matchClient?.stats() ?? null,
      rounds: this.roundsEntered,
      verdicts: this.verdictsSeen,
      p2p: this.p2p ? { ...this.p2p } : null,
      migrations: this.migrationsSeen,
    };
  }
}
