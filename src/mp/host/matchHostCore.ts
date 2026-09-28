/**
 * The browser host's core (P2 client lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13): runs inside the Worker
 * (`matchHostWorker.ts`) or in-process for the receipts, on one `HostPort` to the main thread. It boots the match actor
 * (`server/match/matchActor.ts`, unchanged authority, 60 Hz loop, viewer-specific snapshots) on a collision world
 * built from the fetched manifest, turns every link the main thread opens into the actor's `ClientLink` behind a HELLO
 * gate that verifies the seat token with the per-match host secret (Web Crypto), reports the match to the room every
 * ROOM_MATCH_POLL_MS and on each phase change, and broadcasts the sealed migration keyframe every
 * ROOM_MATCH_KEYFRAME_INTERVAL_MS (the boot configuration less often), so any elected peer can resume the match. On a
 * migration it boots from the retained state at the tick the main thread computed. DOM-free.
 */
import { createMatchActor } from '../../../server/match/matchActor.ts';
import type { ActorWorldCollision, MatchActor } from '../../../server/match/matchActor.ts';
import type { ClientLink } from '../../../server/match/link.ts';
import { captureEntityRow, captureMeta, createEraIndexer } from '../../../server/match/entityRows.ts';
import type { EraIndexer } from '../../../server/match/entityRows.ts';
import { CLOSE_REASON, INPUT_MARGIN_UNKNOWN, MAX_CLIENT_MESSAGE_BYTES, MESSAGE_TYPE, NO_TICK, TICK_MS } from '../wire/constants.ts';
import type { CloseReasonId } from '../wire/constants.ts';
import { decodeMessage } from '../wire/codec.ts';
import type { EntityRow, SnapshotFrame } from '../wire/messages.ts';
import { ROOM_MATCH_KEYFRAME_INTERVAL_MS, ROOM_MATCH_POLL_MS } from '../room/protocol.ts';
import { verifySeatTokenWeb } from './seatTokenWeb.ts';
import {
  applyResumeState, captureEntityExtras, chunkMigrationBlob, deriveMigrationKey, encodeBootConfig, encodeMigrationKeyframe, sealMigrationBlob,
} from './migrationState.ts';
import type { MigrationKeyframe } from './migrationState.ts';
import { MIGRATION_EVENT_KIND } from './hostProtocol.ts';
import type { HostBootConfig, HostCoreStats, HostMatchReport, HostPort, HostToWorkerMessage, WorkerToHostMessage } from './hostProtocol.ts';
import { loadCollisionWorld } from './worldCollision.ts';

type TimerHandle = unknown;

export interface MatchHostCoreOptions {
  port: HostPort<WorkerToHostMessage, HostToWorkerMessage>;
  /** The world for a boot: the fetched manifest by default; the receipts answer 'terrain' or a ready world. */
  buildWorld?: (config: HostBootConfig) => Promise<ActorWorldCollision | 'terrain'>;
  now?: () => number;
  /** Wall clock for the seat tokens' expiry. */
  wallClock?: () => number;
  /** The actor loop's timer seam (the Worker's setTimeout by default). */
  schedule?: (callback: () => void, delayMs: number) => () => void;
  setTimer?: (callback: () => void, delayMs: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  keyframeIntervalMs?: number;
  configIntervalMs?: number;
  reportIntervalMs?: number;
  helloTimeoutMs?: number;
  /** Ticks the actor keeps publishing after the verdict (the actor's default otherwise). */
  endedLingerTicks?: number;
}

export interface MatchHostCore {
  readonly actor: MatchActor | null;
  readonly booted: boolean;
  readonly stopped: boolean;
  stats(): HostCoreStats | null;
  /** Force a migration keyframe now (the receipts). */
  broadcastKeyframe(): Promise<void>;
  stop(reason?: CloseReasonId, detail?: string): void;
  dispose(): void;
}

interface PortLink extends ClientLink {
  readonly peer: number;
  deliver(bytes: Uint8Array): void;
  setPressure(bufferedAmount: number): void;
  /** The main thread's channel closed. */
  closedByMain(): void;
}

const CONFIG_INTERVAL_MS = 10_000;
const HELLO_TIMEOUT_MS = 5_000;
const HOUSEKEEPING_MS = 250;

export function createMatchHostCore({
  port,
  buildWorld = async (config) => (config.manifestBase ? loadCollisionWorld(config.mapId, config.manifestBase) : 'terrain'),
  now = () => (typeof performance === 'object' ? performance.now() : Date.now()),
  wallClock = () => Date.now(),
  schedule,
  setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  keyframeIntervalMs = ROOM_MATCH_KEYFRAME_INTERVAL_MS,
  configIntervalMs = CONFIG_INTERVAL_MS,
  reportIntervalMs = ROOM_MATCH_POLL_MS,
  helloTimeoutMs = HELLO_TIMEOUT_MS,
  endedLingerTicks,
}: MatchHostCoreOptions): MatchHostCore {
  let actor: MatchActor | null = null;
  let config: HostBootConfig | null = null;
  let migrationKey: unknown = null;
  let booted = false;
  let stopped = false;
  let disposed = false;
  let bootGeneration = 0;
  const links = new Map<number, PortLink>();
  const gates = new Map<number, { state: 'hello' | 'verifying' | 'attached'; queue: Uint8Array[]; timer: TimerHandle | null }>();
  // Links opened before the actor exists (peers offer the moment the room elects a host, before its boot is done):
  // their opens and frames wait here and replay once the actor runs.
  const pendingOpens: Array<{ peer: number; label: string; frames: Uint8Array[] }> = [];
  let housekeeping: TimerHandle | null = null;
  let lastReportMs = -Infinity;
  let lastReportPhase = '';
  let lastKeyframeMs = -Infinity;
  let lastConfigMs = -Infinity;
  let keyframeSeq = 0;
  let configSeq = 0;
  let migrationKeyframes = 0;
  let sealing = false;
  let verdictReported = false;
  const era: EraIndexer = createEraIndexer();

  const post = (message: WorkerToHostMessage, transfer?: ArrayBuffer[]): void => { if (!disposed) port.post(message, transfer); };
  const log = (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>): void => post({ type: 'log', level, message, ...(fields ? { fields } : {}) });

  // ------------------------------------------------------------ links

  function createPortLink(peer: number, label: string): PortLink {
    let closed = false;
    let pressure = 0;
    let messageListener: ((bytes: Uint8Array) => void) | null = null;
    let closeListener: (() => void) | null = null;
    return {
      peer,
      label,
      get bufferedAmount() { return closed ? 0 : pressure; },
      get closed() { return closed; },
      send(bytes) {
        if (closed) throw new Error('link closed');
        const copy = bytes.slice();
        post({ type: 'link_send', peer, bytes: copy.buffer }, [copy.buffer]);
      },
      close(reason, detail = '') {
        if (closed) return;
        closed = true;
        links.delete(peer);
        gates.delete(peer);
        messageListener = null;
        closeListener = null;
        post({ type: 'link_close', peer, reason, detail });
      },
      onMessage(listener) { messageListener = listener; },
      onClose(listener) { closeListener = listener; },
      deliver(bytes) { if (!closed) messageListener?.(bytes); },
      setPressure(bufferedAmount) { pressure = Math.max(0, bufferedAmount | 0); },
      closedByMain() {
        if (closed) return;
        closed = true;
        links.delete(peer);
        gates.delete(peer);
        const notify = closeListener;
        messageListener = null;
        closeListener = null;
        notify?.();
      },
    };
  }

  function openLink(peer: number, label: string): void {
    if (!actor || !config) { pendingOpens.push({ peer, label, frames: [] }); return; }
    const previous = links.get(peer);
    if (previous) previous.closedByMain();
    const link = createPortLink(peer, label);
    links.set(peer, link);
    const gate = { state: 'hello' as 'hello' | 'verifying' | 'attached', queue: [] as Uint8Array[], timer: null as TimerHandle | null };
    gates.set(peer, gate);
    gate.timer = setTimer(() => {
      gate.timer = null;
      if (gates.get(peer) === gate && gate.state !== 'attached') link.close(CLOSE_REASON.HELLO_REQUIRED, 'hello timeout');
    }, helloTimeoutMs);
  }

  function admit(peer: number, bytes: Uint8Array): void {
    if (!actor) {
      const pending = pendingOpens.find((entry) => entry.peer === peer);
      if (pending && pending.frames.length < 64) pending.frames.push(bytes);
      return;
    }
    const link = links.get(peer);
    const gate = gates.get(peer);
    const live = actor;
    if (!link || !gate || !live || !config) return;
    if (gate.state === 'attached') { link.deliver(bytes); return; }
    if (gate.state === 'verifying') { gate.queue.push(bytes); return; }
    gate.state = 'verifying';
    const decoded = decodeMessage(bytes, { maxBytes: MAX_CLIENT_MESSAGE_BYTES });
    if (!decoded.ok || decoded.message.type !== MESSAGE_TYPE.HELLO) {
      link.close(CLOSE_REASON.HELLO_REQUIRED, decoded.ok ? 'first frame must be hello' : decoded.error.code);
      return;
    }
    const hello = decoded.message;
    const secret = config.hostSecret;
    void verifySeatTokenWeb(secret, hello.token, wallClock()).then((verified) => {
      if (links.get(peer) !== link || gates.get(peer) !== gate || actor !== live) return;
      if (!verified.ok) {
        link.close(verified.reason === 'expired' ? CLOSE_REASON.TOKEN_EXPIRED : CLOSE_REASON.BAD_TOKEN, verified.reason);
        return;
      }
      if (gate.timer !== null) { clearTimer(gate.timer); gate.timer = null; }
      gate.state = 'attached';
      const attached = live.attach(link, hello, verified.claims);
      if (!attached) { gates.delete(peer); return; }
      for (const queued of gate.queue.splice(0)) link.deliver(queued);
    }).catch((error: unknown) => {
      if (links.get(peer) === link) link.close(CLOSE_REASON.INTERNAL_ERROR, error instanceof Error ? error.message : 'verification failed');
    });
  }

  // ------------------------------------------------------------ reports and migration state

  function currentPhase(live: MatchActor): HostMatchReport['phase'] {
    if (live.ended) return 'ended';
    const phase = live.authority.phase;
    return phase === 'countdown' ? 'countdown' : phase === 'playing' ? 'playing' : 'loading';
  }

  function report(live: MatchActor, nowMs: number): void {
    if (!config) return;
    const phase = currentPhase(live);
    const result = live.authority.result;
    const payload: HostMatchReport = {
      matchId: config.matchId, generation: config.generation, tick: live.tick, phase,
      ...(result ? { verdict: { result, reason: live.authority.resultReason ?? '' } } : {}),
    };
    post({ type: 'report', report: payload });
    lastReportMs = nowMs;
    lastReportPhase = phase;
    if (result) verdictReported = true;
  }

  function buildKeyframe(live: MatchActor): MigrationKeyframe {
    const tick = live.tick;
    const serverTimeMs = Math.round(tick * TICK_MS);
    // A viewer the authority does not know sees every entity: this keyframe is sealed for the next host alone.
    const snapshot = live.authority.snapshot({ tick, serverTimeMs, viewerId: 'migration', ackInputSeq: null });
    const meta = snapshot.meta as Record<string, unknown>;
    const entities: EntityRow[] = [];
    for (const entity of live.authority.entities) {
      const entityId = live.wireIdOf(entity.id);
      if (entityId !== null) entities.push(captureEntityRow(entity, entityId, era));
    }
    entities.sort((a, b) => a.entityId - b.entityId);
    const destroyed = Array.isArray(meta.destroyedObstacleIndices)
      ? [...new Set((meta.destroyedObstacleIndices as number[]).filter((index) => Number.isInteger(index) && index >= 0))].sort((a, b) => a - b) : [];
    const battleTimeMs = Math.round(live.authority.timeS * 1000) + live.resumedBattleTimeMs;
    const frame: SnapshotFrame = {
      tick, serverTimeMs, ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: INPUT_MARGIN_UNKNOWN,
      meta: captureMeta({ ...meta, battleTimeMs }, live.ended), destroyed, entities, shells: [], viewer: null,
      modeStateJson: meta.modeState ? JSON.stringify(meta.modeState) : null,
    };
    const phase = live.ended || live.authority.result ? 'ended' : live.authority.phase === 'countdown' ? 'countdown' : 'playing';
    return { tick, battleTimeMs, phase, frame, entities: captureEntityExtras(live) };
  }

  async function broadcastSealed(kind: typeof MIGRATION_EVENT_KIND[keyof typeof MIGRATION_EVENT_KIND], id: number, tick: number, plain: Uint8Array): Promise<void> {
    if (!migrationKey) return;
    const live = actor;
    const generation = bootGeneration;
    const blob = await sealMigrationBlob(migrationKey, plain);
    if (actor !== live || bootGeneration !== generation || !live || live.stopped) return;
    for (const event of chunkMigrationBlob(kind, id, tick, blob)) live.broadcastEvent(event);
  }

  async function broadcastKeyframe(): Promise<void> {
    const live = actor;
    if (!live || live.stopped || sealing) return;
    sealing = true;
    try {
      const keyframe = buildKeyframe(live);
      await broadcastSealed(MIGRATION_EVENT_KIND.KEYFRAME, ++keyframeSeq, keyframe.tick, encodeMigrationKeyframe(keyframe));
      migrationKeyframes++;
    } catch (error) {
      log('warn', 'migration keyframe failed', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      sealing = false;
    }
  }

  async function broadcastConfig(): Promise<void> {
    const live = actor;
    if (!live || live.stopped || !config) return;
    try {
      await broadcastSealed(MIGRATION_EVENT_KIND.CONFIG, ++configSeq, live.tick, encodeBootConfig(config));
    } catch (error) {
      log('warn', 'migration config failed', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  function housekeep(): void {
    housekeeping = null;
    const live = actor;
    if (!live || stopped || disposed) return;
    const nowMs = now();
    const phase = currentPhase(live);
    if (phase !== lastReportPhase || nowMs - lastReportMs >= reportIntervalMs || (live.authority.result && !verdictReported)) report(live, nowMs);
    if (!live.stopped && live.authority.phase !== 'loading') {
      if (nowMs - lastKeyframeMs >= keyframeIntervalMs) { lastKeyframeMs = nowMs; void broadcastKeyframe(); }
      if (nowMs - lastConfigMs >= configIntervalMs) { lastConfigMs = nowMs; void broadcastConfig(); }
    }
    if (live.stopped) { post({ type: 'stats', stats: stats()! }); return; }
    housekeeping = setTimer(housekeep, HOUSEKEEPING_MS);
  }

  // ------------------------------------------------------------ boot

  async function boot(next: HostBootConfig): Promise<void> {
    if (actor || booted) throw new Error('the host core boots once');
    const generation = ++bootGeneration;
    config = next;
    migrationKey = await deriveMigrationKey(next.hostSecret);
    const world = await buildWorld(next);
    if (bootGeneration !== generation || disposed) return;
    const resume = next.resume;
    const created = createMatchActor({
      roomId: next.roomId, mapId: next.mapId, mode: next.mode, seed: next.seed,
      seats: next.seats.map((seat) => ({ ...seat })), bots: next.bots.map((bot) => ({ ...bot })),
      countdownS: next.countdownS, ...(next.battleLimitS != null ? { battleLimitS: next.battleLimitS } : {}),
      world, now, ...(schedule ? { schedule } : {}), autoStart: false,
      ...(endedLingerTicks !== undefined ? { endedLingerTicks } : {}),
      resume: resume ? { tick: resume.resumeTick, battleTimeMs: resume.battleTimeMs } : null,
      onVerdict: () => { const live = actor; if (live) report(live, now()); },
    });
    let restored = 0;
    if (resume) {
      const applied = applyResumeState(created, resume);
      restored = applied.restored;
      if (applied.skipped) log('warn', 'resume rows without an entity', { skipped: applied.skipped });
    }
    actor = created;
    booted = true;
    // The room hears 'loading' as soon as the actor exists (P1's cadence), then every phase change and every interval.
    report(created, now());
    created.start();
    post({ type: 'ready', tick: created.tick, entities: created.authority.entities.length, resumed: !!resume });
    log('info', 'host actor booted', { tick: created.tick, entities: created.authority.entities.length, restored, resumed: !!resume });
    for (const { peer, label, frames } of pendingOpens.splice(0)) {
      openLink(peer, label);
      for (const frame of frames) admit(peer, frame);
    }
    report(created, now());
    housekeeping = setTimer(housekeep, HOUSEKEEPING_MS);
  }

  function stats(): HostCoreStats | null {
    const live = actor;
    if (!live) return null;
    const summary = live.stats();
    return {
      tick: summary.tick, phase: summary.phase, clients: summary.clients, bytesOut: summary.bytesOut, bytesIn: summary.bytesIn,
      snapshots: summary.snapshots, keyframes: summary.keyframes, migrationKeyframes, tickP95Ms: summary.tickMs.p95, verdict: summary.verdict,
    };
  }

  function stop(reason: CloseReasonId = CLOSE_REASON.ROOM_CLOSED, detail = ''): void {
    if (stopped) return;
    stopped = true;
    if (housekeeping !== null) { clearTimer(housekeeping); housekeeping = null; }
    for (const gate of gates.values()) if (gate.timer !== null) clearTimer(gate.timer);
    gates.clear();
    const live = actor;
    if (live) {
      live.stop(reason, detail);
      report(live, now());
    }
    for (const link of [...links.values()]) link.close(reason, detail);
    links.clear();
  }

  const unsubscribe = port.onMessage((message) => {
    if (disposed) return;
    switch (message.type) {
      case 'boot':
        void boot(message.config).catch((error: unknown) => {
          post({ type: 'boot_failed', error: error instanceof Error ? error.message : String(error) });
        });
        return;
      case 'link_open': openLink(message.peer, message.label); return;
      case 'link_frame': admit(message.peer, new Uint8Array(message.bytes)); return;
      case 'link_close': {
        const pendingIndex = pendingOpens.findIndex((entry) => entry.peer === message.peer);
        if (pendingIndex >= 0) pendingOpens.splice(pendingIndex, 1);
        links.get(message.peer)?.closedByMain();
        return;
      }
      case 'link_pressure': links.get(message.peer)?.setPressure(message.bufferedAmount); return;
      case 'stop': stop(message.reason, message.detail); return;
      case 'stats': { const summary = stats(); if (summary) post({ type: 'stats', stats: summary }); return; }
      default: return;
    }
  });

  return {
    get actor() { return actor; },
    get booted() { return booted; },
    get stopped() { return stopped; },
    stats,
    broadcastKeyframe,
    stop,
    dispose() {
      if (disposed) return;
      stop(CLOSE_REASON.ROOM_CLOSED, 'host disposed');
      disposed = true;
      unsubscribe();
    },
  };
}
