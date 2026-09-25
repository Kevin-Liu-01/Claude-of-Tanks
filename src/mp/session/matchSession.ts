/**
 * MatchSession: the session owner of Multiplayer v2 (charter §3, §5). It sits
 * between a `RoomClient` and the match layer: when the room hands this seat a
 * `match_start`, it builds the presentation the caller supplies (the battle
 * presentation in the browser, a recorder headless), opens a `MatchClient` on
 * the seat token, binds the two, pumps the client once per frame, presents the
 * verdict, and returns to the lobby (the room stays) — then does it again for
 * a rematch. Spectators get the same path without controls or prediction.
 * Node-runnable: the transport and the presentation are injected.
 */
import { MatchClient } from '../match/matchClient.ts';
import type { MatchClientOptions, MatchFrame, PredictionProvider } from '../match/matchClient.ts';
import type { ControlSample } from '../match/inputStream.ts';
import { bindMatchPresentation } from '../presentation/adapter.ts';
import type { PresentationAdapter } from '../presentation/adapter.ts';
import { WebSocketTransport } from '../transport/webSocketTransport.ts';
import type { WebSocketTransportOptions } from '../transport/webSocketTransport.ts';
import { Listeners } from '../transport/transport.ts';
import type { Transport, Unsubscribe } from '../transport/transport.ts';
import { CLOSE_REASON, VERDICT } from '../wire/index.ts';
import type { CloseReasonId, VerdictId, WelcomeMessage } from '../wire/index.ts';
import type { RoomClient } from '../room/roomClient.ts';
import type { RoomMatchStartPayload, RoomMatchStatusPayload, RoomSnapshot } from '../room/protocol.ts';

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
}

export interface MatchSessionStats {
  phase: SessionPhase;
  round: number;
  matchId: string | null;
  spectator: boolean;
  match: ReturnType<MatchClient['stats']> | null;
  rounds: number;
  verdicts: number;
}

export class MatchSession {
  readonly room: RoomClient;
  private readonly createPresentation: MatchSessionOptions['createPresentation'];
  private readonly createTransport: (options: WebSocketTransportOptions) => Transport;
  private readonly clock: () => number;
  private readonly clientBuild: string;
  private readonly matchOptions: NonNullable<MatchSessionOptions['matchClient']>;
  private readonly transportOptions: NonNullable<MatchSessionOptions['transport']>;
  private readonly autoEnter: boolean;
  private readonly phaseListeners = new Listeners<{ phase: SessionPhase; detail: string }>();
  private readonly verdictListeners = new Listeners<{ verdict: VerdictId; reason: string; matchId: string }>();
  private readonly frameListeners = new Listeners<MatchFrame>();
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

  constructor({
    room,
    createPresentation,
    createTransport = (options) => new WebSocketTransport(options),
    clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
    clientBuild = 'dev',
    matchClient = {},
    autoEnter = true,
    transport = {},
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
  }

  // ------------------------------------------------------------ observation

  get phase(): SessionPhase { return this.currentPhase; }
  get match(): MatchClient | null { return this.matchClient; }
  get round(): SessionRound | null { return this.currentRound; }
  get spectator(): boolean { return this.currentRound?.spectator ?? false; }
  get verdict(): { verdict: VerdictId; reason: string; matchId: string } | null { return this.lastVerdict; }
  get presentationAdapter(): PresentationAdapter | null { return this.presentation?.adapter ?? null; }

  onPhase(listener: (change: { phase: SessionPhase; detail: string }) => void): Unsubscribe { return this.phaseListeners.add(listener); }
  onVerdict(listener: (change: { verdict: VerdictId; reason: string; matchId: string }) => void): Unsubscribe { return this.verdictListeners.add(listener); }
  onFrame(listener: (frame: MatchFrame) => void): Unsubscribe { return this.frameListeners.add(listener); }

  private setPhase(phase: SessionPhase, detail = ''): void {
    if (this.currentPhase === phase) return;
    this.currentPhase = phase;
    this.phaseListeners.emit({ phase, detail });
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
    const pending = this.room.matchStart;
    if (pending && this.autoEnter) void this.enterMatch(pending).catch(() => { /* reported through the phase */ });
  }

  /** Enter (or re-enter) the announced match: presentation, transport on the seat token, client. */
  async enterMatch(payload: RoomMatchStartPayload): Promise<MatchClient> {
    if (this.disposed) throw new Error('session disposed');
    if (this.currentRound?.matchStart.matchId === payload.matchId && this.matchClient) return this.matchClient;
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
    const transport = this.createTransport({
      url: this.room.resolveUrl(payload.matchUrl),
      resumeToken: payload.seatToken,
      clock: this.clock,
      ...this.transportOptions,
    });
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

  /** One display frame: pump the match client; the bound presentation receives the frame. */
  update(nowMs: number, elapsedS: number): MatchFrame | null {
    return this.matchClient ? this.matchClient.update(nowMs, elapsedS) : null;
  }

  /** Leave the match (the seat stays in the room) and release the presentation. */
  async leaveMatch(reason = 'leave', closeReason: CloseReasonId = CLOSE_REASON.CLIENT_LEAVE): Promise<void> {
    const client = this.matchClient;
    const presentation = this.presentation;
    this.matchClient = null;
    this.presentation = null;
    this.currentRound = null;
    this.unbind?.();
    this.unbind = null;
    if (client) {
      try { client.leave(closeReason); } catch { /* already closed */ }
      client.dispose();
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
  }

  stats(): MatchSessionStats {
    return {
      phase: this.currentPhase,
      round: this.currentRound?.matchStart.round ?? 0,
      matchId: this.currentRound?.matchStart.matchId ?? null,
      spectator: this.spectator,
      match: this.matchClient?.stats() ?? null,
      rounds: this.roundsEntered,
      verdicts: this.verdictsSeen,
    };
  }
}
