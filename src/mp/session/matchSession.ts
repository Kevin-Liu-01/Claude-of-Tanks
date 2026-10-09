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
import type { RtcCandidateType, RtcIceConfig, RtcPeerConnectionFactory, Signaler } from '../transport/webRtcTransport.ts';
import { MigratingTransport } from '../transport/migratingTransport.ts';
import { Listeners } from '../transport/transport.ts';
import type { Transport, Unsubscribe } from '../transport/transport.ts';
import { CLOSE_REASON, TICK_MS, VERDICT } from '../wire/index.ts';
import type { CloseReasonId, VerdictId, WelcomeMessage } from '../wire/index.ts';
import type { RoomClient } from '../room/roomClient.ts';
import { parseP2pMatchUrl } from '../room/protocol.ts';
import type { RoomHostChangedPayload, RoomMatchStartPayload, RoomMatchStatusPayload, RoomSnapshot } from '../room/protocol.ts';
import { createMatchHost } from '../host/matchHost.ts';
import type { MatchHost } from '../host/matchHost.ts';
import { planFromRoster, planHostBoot } from '../host/hostPlan.ts';
import type { HostBootConfig, HostPort, HostToWorkerMessage, WorkerToHostMessage } from '../host/hostProtocol.ts';
import type { HostBootPlan } from '../host/hostPlan.ts';
import { decodeBootConfig, decodeMigrationKeyframe, deriveMigrationKey, openMigrationBlob, resumeStateFromRetained } from '../host/migrationState.ts';

export type SessionPhase = 'lobby' | 'loading' | 'match' | 'ended' | 'lost';

export interface SessionRound {
  matchStart: RoomMatchStartPayload;
  room: RoomSnapshot;
  spectator: boolean;
  /** The seat's own player id. */
  playerId: string;
}

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
  onLog?: (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>) => void;
}

export type SessionRole = 'host' | 'peer' | null;

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
  private generation = 0;
  private roundsEntered = 0;
  private verdictsSeen = 0;
  private lastVerdict: { verdict: VerdictId; reason: string; matchId: string } | null = null;
  private started = false;
  private disposed = false;
  // ---- peer-to-peer
  private host: MatchHost | null = null;
  private peerTransport: WebRtcTransport | null = null;
  private migrating: MigratingTransport | null = null;
  private hostSecret: string | null = null;
  private migrationActive = false;
  private migrationHostId: string | null = null;
  private migrationsSeen = 0;
  private declinedHosting = false;
  /** The host generation this seat's link (or host) runs; an election with a newer one is a migration (P1: compare generations, never the reason). */
  private runningGeneration = 0;
  private readonly p2pStatus: SessionP2pStatus = {
    role: null, generation: 0, hostId: null, migrating: false, migrationHostId: null, candidateType: null, viaTurn: false,
    peersConnected: 0, relayed: 0, uplinkBytesPerS: 0, hostState: null, snapshotSkips: 0, staleSignals: 0, offersSent: 0,
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
  get role(): SessionRole { return this.host ? 'host' : this.peerTransport ? 'peer' : null; }
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
    this.roomSubscriptions.push(this.room.onPhase(({ phase }) => { if (phase === 'joined') this.declineIfUnable(); }));
    this.declineIfUnable();
    const pending = this.room.matchStart;
    if (pending && this.autoEnter) void this.enterMatch(pending).catch(() => { /* reported through the phase */ });
  }

  /** A seat that cannot host says so once it is in the room, so the election never names it (best effort: an older room ignores it). */
  private declineIfUnable(): void {
    if (!this.p2pOptions || this.canHost || this.declinedHosting || this.room.phase !== 'joined') return;
    this.declinedHosting = true;
    this.p2pListeners.emit({ kind: 'declined' });
    // `unable` (2026-09-30): this seat cannot host at all — elected as the last resort, its decline ends the match at once
    void this.room.declineHost(true, { unable: true }).catch(() => { this.declinedHosting = false; });
  }

  /** Enter (or re-enter) the announced match: presentation, transport on the seat token, client. */
  async enterMatch(payload: RoomMatchStartPayload): Promise<MatchClient> {
    if (this.disposed) throw new Error('session disposed');
    if (this.currentRound?.matchStart.matchId === payload.matchId && this.matchClient) {
      // The same match re-sent to a seat back from a room-socket blip (P3, 2026-09-28): the room may have elected another host
      // meanwhile and this seat missed the host_changed. The room client now reads the current generation from the URL: a host
      // the room replaced steps down at once (its next report would be host_only anyway), a peer re-offers to the current host.
      const generation = this.room.generation;
      if (parseP2pMatchUrl(payload.matchUrl) && generation > this.runningGeneration && this.migrating) {
        const me = this.room.playerId;
        if (this.host && this.room.hostId !== me) this.stepDown('match_start re-sent');
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
    this.lastVerdict = null;
    this.setPhase('loading', payload.matchId);
    let presentation: SessionPresentation;
    try {
      presentation = await this.createPresentation(round);
    } catch (error) {
      if (generation === this.generation) { this.currentRound = null; this.setPhase('lobby', 'presentation failed'); }
      throw error;
    }
    if (generation !== this.generation || this.disposed) { presentation.dispose(); throw new Error('round superseded'); }
    this.presentation = presentation;
    let transport: Transport;
    const rtc = parseP2pMatchUrl(payload.matchUrl);
    if (rtc) {
      try {
        transport = this.openPeerToPeer(payload, round);
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
        if (reason === CLOSE_REASON.MATCH_ENDED) this.setPhase(this.lastVerdict ? 'ended' : 'lost', 'match ended');
        else if (reason !== CLOSE_REASON.CLIENT_LEAVE) this.setPhase('lost', detail);
      }
    });
    this.roundsEntered++;
    this.setPhase('match', payload.matchId);
    client.connect();
    return client;
  }

  // ------------------------------------------------------------ peer-to-peer

  private roomSignaler(): Signaler {
    return {
      target: () => { const hostId = this.room.hostId; return hostId ? { hostId, generation: this.room.generation } : null; },
      sendSignal: (payload) => this.room.sendSignal(payload),
      onSignal: (listener) => this.room.onSignal(listener),
      recentOffers: () => this.room.recentOffers(),
    };
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
        reportMatch: (report) => this.room.reportMatch(report).catch((error: unknown) => {
          // host_only: the room runs a newer generation — this seat is no longer the host and steps down to a peer.
          if (error && typeof error === 'object' && (error as { code?: unknown }).code === 'host_only') this.stepDown('host_only');
          throw error;
        }),
      },
      createPort: p2p.createHostPort!, ice: p2p.ice, createPeerConnection: p2p.createPeerConnection,
      ...(p2p.maxPeers !== undefined ? { maxPeers: p2p.maxPeers } : {}),
      clock: this.clock, ...(timers.setTimer ? { setTimer: timers.setTimer } : {}), ...(timers.clearTimer ? { clearTimer: timers.clearTimer } : {}),
      onLog: (level, message, fields) => this.log(level, message, fields),
    });
  }

  /** The transport of an rtc:// match: the host's loopback (this seat boots the host) or a WebRTC link to the host. */
  private openPeerToPeer(payload: RoomMatchStartPayload, round: SessionRound): Transport {
    const p2p = this.p2pOptions;
    if (!p2p) throw new Error('peer-to-peer matches need the p2p options (ICE, the host thread)');
    const me = this.room.playerId;
    // The room's newest election wins over the payload: a seat re-entering after a Garage return holds the match_start it
    // was sent when it hosted, while the room may have elected another host since (its host_changed is newer).
    const hostId = this.room.hostId ?? payload.hostId ?? null;
    const secret = (payload as { hostSecret?: unknown }).hostSecret;
    this.hostSecret = typeof secret === 'string' && secret.length >= 16 ? secret : null;
    let inner: Transport;
    this.runningGeneration = Math.max(parseP2pMatchUrl(payload.matchUrl)?.generation ?? 0, this.room.generation);
    // Named host for a match already playing (a reload inside the host grace): this seat holds no state to resume from,
    // its peers hold the sealed keyframe. Decline, enter as a peer, let the room elect one of them; boot afresh only when
    // no election follows (nobody else is left to host).
    const reentryAsNamedHost = hostId === me && this.canHost && !!this.hostSecret && round.room.match?.status === 'playing';
    if (reentryAsNamedHost) {
      this.log('warn', 'named host of a running match without its state: declining so a peer resumes', { matchId: payload.matchId });
      this.declinedHosting = true;
      this.p2pListeners.emit({ kind: 'declined' });
      void this.room.declineHost(true).catch(() => { /* the room may predate the command */ });
      const timers = this.transportOptions as Partial<WebSocketTransportOptions>;
      const setTimer = timers.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs));
      const client = this.matchClient;
      setTimer(() => {
        if (this.currentRound !== round || this.host || this.room.hostId !== me || !this.migrating) return;
        // No election came: the room kept this seat (no other commander). Boot fresh through the election path.
        void this.handleHostChanged({ hostId: me, generation: this.room.generation + 1, resumeTick: 0, reason: 'declined', hostSecret: this.hostSecret ?? undefined });
        void client;
      }, this.p2pOptions?.reentryElectionWaitMs ?? 10_000);
    }
    if (hostId === me && this.canHost && this.hostSecret && !reentryAsNamedHost) {
      const plan = planHostBoot(round.room, payload, me);
      const config: HostBootConfig = {
        roomId: round.room.roomCode, matchId: payload.matchId, generation: this.room.generation, mapId: payload.mapId, mode: payload.mode, seed: payload.seed,
        seats: plan.seats, bots: plan.bots, countdownS: p2p.countdownS ?? 5, battleLimitS: null, hostSecret: this.hostSecret, manifestBase: p2p.manifestBase ?? null, resume: null,
        arrangement: round.room.settings.arrangement ?? null, campaignOperationId: round.room.settings.campaignOperationId ?? null,
        ...(p2p.snapshotHz !== undefined ? { snapshotHz: p2p.snapshotHz } : {}),
      };
      const host = this.createHost();
      this.host = host;
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
        this.declinedHosting = true;
        this.p2pListeners.emit({ kind: 'declined' });
        void this.room.declineHost(true, { unable: true }).catch(() => { /* the room may predate the command */ });
      }
      const peer = this.createPeerTransport();
      this.peerTransport = peer;
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
    this.p2pListeners.emit({ kind: 'migration', phase: 'end', hostId, generation: this.room.generation, role: this.role, detail });
  }

  /** The room replaced this host (a host_only on a report): the actor stops, this seat follows the room's current host as a peer. */
  private stepDown(detail: string): void {
    const host = this.host;
    const migrating = this.migrating;
    if (!host || !migrating) return;
    this.log('warn', 'stepping down', { detail, generation: this.room.generation });
    host.stop(CLOSE_REASON.REPLACED, detail);
    this.host = null;
    const peer = this.createPeerTransport();
    this.peerTransport = peer;
    this.runningGeneration = this.room.generation;
    migrating.replace(peer, detail);
    this.p2pListeners.emit({ kind: 'role', role: 'peer', generation: this.room.generation });
  }

  /** The room elected a host: a newer generation than this seat runs is a migration — become it, follow it, or step down. */
  private async handleHostChanged(change: RoomHostChangedPayload): Promise<void> {
    const client = this.matchClient;
    const round = this.currentRound;
    const migrating = this.migrating;
    if (!client || !round || !migrating || !parseP2pMatchUrl(round.matchStart.matchUrl)) return;
    const me = this.room.playerId;
    if (change.generation <= this.runningGeneration) {
      // The election that named the host at the start (the URL's generation), or one this seat already runs: nothing moves —
      // unless the room named another host than the match_start did (a decline at the start): then the peer re-offers.
      if (change.hostId !== me && this.peerTransport) this.peerTransport.retarget('host named');
      return;
    }
    this.runningGeneration = change.generation;
    this.migrationsSeen++;
    this.migrationActive = true;
    this.migrationHostId = change.hostId;
    this.p2pListeners.emit({ kind: 'migration', phase: 'begin', hostId: change.hostId, generation: change.generation, role: this.role, detail: change.reason });
    if (change.hostId === me) {
      if (this.host && this.host.state !== 'stopped' && this.host.state !== 'failed') { this.endMigration('already hosting'); return; }
      await this.becomeHost(client, round, change, migrating);
      return;
    }
    if (this.host) {
      // Replaced by the room (this seat's room socket was absent past the grace): the actor stops, this seat follows the new host.
      this.host.stop(CLOSE_REASON.REPLACED, 'host changed');
      this.host = null;
      const peer = this.createPeerTransport();
      this.peerTransport = peer;
      migrating.replace(peer, 'host changed');
      this.p2pListeners.emit({ kind: 'role', role: 'peer', generation: change.generation });
      return;
    }
    this.peerTransport?.retarget('host changed');
  }

  private async becomeHost(client: MatchClient, round: SessionRound, change: RoomHostChangedPayload, migrating: MigratingTransport): Promise<void> {
    const me = this.room.playerId;
    const secret = change.hostSecret ?? this.hostSecret;
    if (!this.canHost || !secret) {
      this.log('warn', 'elected but cannot host; declining', { canHost: this.canHost, secret: !!secret });
      this.p2pListeners.emit({ kind: 'migration', phase: 'failed', hostId: me, generation: change.generation, role: this.role, detail: 'cannot host' });
      this.migrationActive = false;
      this.migrationHostId = null;
      // the last resort that cannot host: the room ends the match now when nobody else can (2026-09-30), instead of
      // keeping this seat as a host that never reports for the 30 s budget
      void this.room.declineHost(true, { unable: true }).catch(() => { /* the room may predate the command */ });
      return;
    }
    this.hostSecret = secret;
    // The thread and the acceptor come up before the retained state is opened: peers re-offer the moment they hear the
    // election, and their offers must find an acceptor (the core holds their HELLOs until the actor runs).
    const host = this.createHost();
    this.host = host;
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
        const { state, baseTick, baseAtMs } = resumeStateFromRetained(keyframe, retained.keyframe.receivedAtMs, retained.latestFrame, retained.latestFrameAtMs, retained.fallen, retained.destruction ?? []);
        const elapsedTicks = Math.max(0, Math.ceil((this.clock() - baseAtMs) / TICK_MS));
        resume = { ...state, resumeTick: Math.max(change.resumeTick, baseTick + elapsedTicks) };
      }
    } catch (error) {
      this.log('warn', 'retained migration state unreadable; booting fresh', { error: error instanceof Error ? error.message : String(error) });
      resume = null;
    }
    if (!plan) {
      plan = welcome ? planFromRoster(welcome.roster, this.room.room) : planHostBoot(round.room, round.matchStart, me);
    }
    const config: HostBootConfig = {
      roomId: round.room.roomCode, matchId: round.matchStart.matchId, generation: change.generation, mapId: round.matchStart.mapId, mode: round.matchStart.mode,
      seed: welcome ? welcome.seed : round.matchStart.seed, seats: plan.seats, bots: plan.bots, countdownS: resume ? 0 : this.p2pOptions?.countdownS ?? 5, battleLimitS, hostSecret: secret,
      manifestBase: this.p2pOptions?.manifestBase ?? null, resume,
      arrangement, campaignOperationId,
      ...(this.p2pOptions?.snapshotHz !== undefined ? { snapshotHz: this.p2pOptions.snapshotHz } : {}),
    };
    try {
      await host.start(config);
    } catch (error) {
      if (this.host === host) this.host = null;
      this.log('error', 'elected host failed to boot', { error: error instanceof Error ? error.message : String(error) });
      this.p2pListeners.emit({ kind: 'migration', phase: 'failed', hostId: me, generation: change.generation, role: this.role, detail: 'boot failed' });
      this.migrationActive = false;
      this.migrationHostId = null;
      void this.room.declineHost(true, { unable: true }).catch(() => { /* the room may predate the command */ });
      return;
    }
    if (this.host !== host || this.matchClient !== client) { host.stop(); return; }
    const previous = this.peerTransport;
    this.peerTransport = null;
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
    this.setPhase('ended', reason);
  }

  private matchStatus(payload: RoomMatchStatusPayload): void {
    if (!this.currentRound || this.currentRound.matchStart.matchId !== payload.matchId) return;
    if (payload.status === 'ended' && payload.verdict) {
      const verdict: VerdictId = payload.verdict.result === 'alpha' ? VERDICT.ALPHA : payload.verdict.result === 'bravo' ? VERDICT.BRAVO : VERDICT.DRAW;
      this.settleVerdict(verdict, payload.verdict.reason, payload.matchId);
    } else if (payload.status === 'lost' && this.currentPhase !== 'ended') {
      this.setPhase('lost', 'match_lost');
    }
  }

  /** One display frame: pump the host (when this seat hosts) and the match client; the bound presentation receives the frame. */
  update(nowMs: number, elapsedS: number): MatchFrame | null {
    this.host?.pump(nowMs);
    return this.matchClient ? this.matchClient.update(nowMs, elapsedS) : null;
  }

  /** Leave the match (the seat stays in the room) and release the presentation. A hosting seat hands the match on. */
  async leaveMatch(reason = 'leave', closeReason: CloseReasonId = CLOSE_REASON.CLIENT_LEAVE): Promise<void> {
    const client = this.matchClient;
    const presentation = this.presentation;
    const host = this.host;
    this.matchClient = null;
    this.presentation = null;
    this.currentRound = null;
    this.host = null;
    this.peerTransport = null;
    this.migrating = null;
    this.migrationActive = false;
    this.migrationHostId = null;
    this.unbind?.();
    this.unbind = null;
    if (client) {
      try { client.leave(closeReason); } catch { /* already closed */ }
      client.dispose();
    }
    if (host) {
      // The peers' channels drop silently and the room hears this seat will not host: it elects the next one — and, its
      // actor being gone (`unable`), ends the match at once when nobody else can take it (2026-09-30).
      host.stop(CLOSE_REASON.CLIENT_LEAVE, reason);
      if (this.room.phase === 'joined') void this.room.declineHost(true, { unable: true }).catch(() => { /* the room may predate the command */ });
      this.declinedHosting = true;
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
