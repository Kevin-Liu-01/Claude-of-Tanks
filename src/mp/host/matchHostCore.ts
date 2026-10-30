/**
 * The browser host's core (P2 client lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13): runs inside the Worker
 * (`matchHostWorker.ts`) or in-process for the receipts, on one `HostPort` to the main thread. It boots the match actor
 * (`server/match/matchActor.ts`, unchanged authority, 60 Hz loop, viewer-specific snapshots) on a collision world
 * built from the fetched manifest, turns every link the main thread opens into the actor's `ClientLink` behind a HELLO
 * gate that verifies the seat token with the per-match host secret (Web Crypto), reports the match to the room every
 * ROOM_MATCH_POLL_MS and on each phase change, and broadcasts the sealed migration keyframe every
 * ROOM_MATCH_KEYFRAME_INTERVAL_MS (the boot configuration less often), so any elected peer can resume the match. On a
 * migration it boots from the retained state at the tick the main thread computed. DOM-free. Vehicles are specs only
 * (src/vehicles/authorityFleet.ts): the boot loads the roster's combat-anatomy groups beside the collision world.
 */
import type { DestructionLogEntry } from '../../sim/destructionEvents.ts';
import { quantizeDestructionEntry } from '../wire/destructionLog.ts';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { hostRulesetFor } from './hostRuleset.ts';
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
import type { HostBootConfig, HostCoreStats, HostMatchReport, HostPort, HostPrepareConfig, HostToWorkerMessage, WorkerToHostMessage } from './hostProtocol.ts';
import { loadCollisionWorld, loadWorldKernels } from './worldCollision.ts';
import { simKernelsFailureReason, type SimKernelsStatus } from '../../world/simKernelsStatus.ts';
import { terrainVariantFor } from '../../sim/matchRuleset.ts';
import { prepareAuthorityGround } from '../../sim/authoritativeMatch.ts';

type TimerHandle = unknown;

export interface MatchHostCoreOptions {
  port: HostPort<WorkerToHostMessage, HostToWorkerMessage>;
  /** The world for a boot (or a standby's preparation): the fetched manifest by default; the receipts answer 'terrain' or a ready world. */
  buildWorld?: (config: WorldConfig) => Promise<ActorWorldCollision | 'terrain'>;
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
  /** The longest a migrated host holds its world still for the awaited seats (RESUME_HOLD_MS; 0 = never hold). */
  resumeHoldMs?: number;
  /** This host's build line for the same-wire check (the actor's default, MATCH_BUILD, otherwise). */
  build?: string;
}

/**
 * The resume hold (2026-10-10, the MP lane; the e2e's "B's hull as C saw it moved 10.8 / 12.5 / 17.8 m across the
 * migration"): a migrated host used to start its loop the moment it booted, before any seat was back. A hull restored
 * with speed (its newest row, captured while it drove) rolled on under the empty input — a released throttle coasts
 * at 3.5 m/s², 9-17 m from 8-11 m/s — while the peers were still re-offering, and each peer's first frame from the new
 * host showed it that far from the last one it saw. Now the world stands still, as it did through the outage, until
 * every seat that was in the match is back or this much time has passed: the seats are welcomed together against the
 * still world (their own-row hints land before the first tick), then the loop starts at the resume tick.
 */
export const RESUME_HOLD_MS = 3_000;

/** What a world build reads from a boot or a preparation. */
type WorldConfig = Pick<HostBootConfig, 'mapId' | 'mode' | 'manifestBase' | 'simKernelsUrl'>;
/** The world a preparation built serves the boot of the same battlefield, variant, manifests and kernels only. */
const worldKey = (config: WorldConfig): string => `${config.mapId}|${terrainVariantFor(config.mode) ?? ''}|${config.manifestBase ?? ''}|${config.simKernelsUrl ?? ''}`;
/** Why a world was built without the kernels its boot named (simKernelsFailureReason): the fallback stays, observable. */
const kernelsFailures = new WeakMap<object, string>();
/** Whether a booted world steps on the kernels, and why not ('off': the boot named none; 'terrain': no collision world). */
function kernelsStatusOf(world: ActorWorldCollision | 'terrain', config: WorldConfig): SimKernelsStatus {
  if (world !== 'terrain' && world.kernelSupportField) return { mode: 'wasm' };
  if (!config.simKernelsUrl) return { mode: 'ts', reason: 'off' };
  return { mode: 'ts', reason: world === 'terrain' ? 'terrain' : kernelsFailures.get(world) ?? 'unknown' };
}

export interface MatchHostCore {
  readonly actor: MatchActor | null;
  readonly booted: boolean;
  /** The boot ran on a standby's prepared world (2026-10-14, §13.21); null before a boot. */
  readonly bootedPrepared: boolean | null;
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
/**
 * How long a link may stay open without its HELLO (2026-10-11, the MP lane): 5 s closed seats whose HELLO was merely late —
 * a host main thread inside a long task holds the frame on its way to this thread, a starved seat sends it late, a
 * loaded machine slows the seat-token check — with HELLO_REQUIRED "hello timeout", which the seat read as the end of its
 * seat (never welcomed: mp-world-events-audit / mp-room-lifecycle / mp-p2p-headless "every seat welcomed" at load >= 60).
 * The window only bounds a link that never says hello; once the HELLO is here, the check is this host's own work and has
 * no deadline (helloGate.selftest).
 * 2026-10-20 (item/mp-rejoin-229): 15 s → 60 s. A seat entering a running match now opens its link beside its world load
 * and says hello once its world is ready (matchSession.ts openEarlyPeerLink): 15 s closed that early link under a world
 * load of 15.5 s on the 227 rejoins. Only a link from a seat the room relayed is ever open here, one per seat (a new offer
 * replaces it), so the longer window bounds nothing new. A client that opens early links carries a prediction digest no
 * earlier build has (matchClient.ts is in that closure, wire/matchBuild.ts), so a host of an earlier build refuses it at
 * its HELLO: no early link ever meets the old 15 s window.
 */
export const HELLO_TIMEOUT_MS = 60_000;
const HOUSEKEEPING_MS = 250;
/** The vehicles the booted match fields (spectators ride none): the calibration groups the host loads. */
const rosterSpecIds = (config: HostBootConfig): string[] => [
  ...config.seats.filter((seat) => seat.team !== 'spectator').map((seat) => seat.specId),
  ...config.bots.map((bot) => bot.specId),
];

export function createMatchHostCore({
  port,
  // the mode's battlefield variant (Frontline's carved trenches) is the world the authority plays: its own manifest
  buildWorld = async (config) => {
    if (!config.manifestBase) return 'terrain';
    // a module that does not arrive or compile leaves this host's world on the TypeScript, the same match; its reason
    // rides the boot's 'ready' (kernelsStatusOf), which the page reports (simKernelsReport.ts)
    let failure: string | null = null;
    const kernels = config.simKernelsUrl
      ? await loadWorldKernels(config.simKernelsUrl).catch((error: unknown) => { failure = simKernelsFailureReason(error); return null; })
      : null;
    const world = await loadCollisionWorld(config.mapId, config.manifestBase, { variant: terrainVariantFor(config.mode), kernels });
    if (failure) kernelsFailures.set(world, failure);
    return world;
  },
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
  resumeHoldMs = RESUME_HOLD_MS,
  build,
}: MatchHostCoreOptions): MatchHostCore {
  let actor: MatchActor | null = null;
  let config: HostBootConfig | null = null;
  // the page's word on its solo match's countdown ('countdown'): null until it speaks, then it outranks the boot's holdCountdown
  let countdownHeld: boolean | null = null;
  // a standby's preparation (§13.21): the world it is building and the battlefield it is for; a boot of that battlefield takes it
  let prepared: { key: string; world: Promise<ActorWorldCollision | 'terrain'> } | null = null;
  let bootedPrepared: boolean | null = null;
  let migrationKey: unknown = null;
  let booted = false;
  let stopped = false;
  let disposed = false;
  let bootGeneration = 0;
  const links = new Map<number, PortLink>();
  // playerId: the room-authenticated peer that opened the link; a HELLO may only claim that peer's own seat
  const gates = new Map<number, { state: 'hello' | 'verifying' | 'attached'; queue: Uint8Array[]; timer: TimerHandle | null; playerId: string }>();
  // Links opened before the actor exists (peers offer the moment the room elects a host, before its boot is done):
  // their opens and frames wait here and replay once the actor runs.
  const pendingOpens: Array<{ peer: number; label: string; playerId: string; frames: Uint8Array[] }> = [];
  // seats the room removed before the actor ran: revoked as soon as it boots
  const pendingRevokes = new Set<string>();
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
  // One 'ended' report closes the match in the room (P1 records the verdict and the room is back to waiting): every report
  // after it is invalid_command there, so the cadence and the stop report end with it.
  let endedReported = false;
  // the resume hold (RESUME_HOLD_MS): the seats awaited, those back, their deferred welcomes, and how it ended
  let hold: { awaited: Set<string>; arrived: Set<string>; attaches: Array<() => void>; startedMs: number; timer: TimerHandle | null } | null = null;
  let holdStats: HostCoreStats['resumeHold'] = null;
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

  function openLink(peer: number, label: string, playerId: string): void {
    if (!actor || !config) { pendingOpens.push({ peer, label, playerId, frames: [] }); return; }
    const previous = links.get(peer);
    if (previous) previous.closedByMain();
    const link = createPortLink(peer, label);
    links.set(peer, link);
    const gate = { state: 'hello' as 'hello' | 'verifying' | 'attached', queue: [] as Uint8Array[], timer: null as TimerHandle | null, playerId };
    gates.set(peer, gate);
    gate.timer = setTimer(() => {
      gate.timer = null;
      // only a link that has not said hello: a HELLO under verification is the host's own pending work, never the seat's fault
      if (gates.get(peer) === gate && gate.state === 'hello') link.close(CLOSE_REASON.HELLO_REQUIRED, 'hello timeout');
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
      // the seat is the room-authenticated peer's own: a valid token for another seat (a former host still holds the
      // per-match signing secret) would otherwise replace that seat's live link (security audit 2026-10-22)
      if (verified.claims.playerId !== gate.playerId) {
        link.close(CLOSE_REASON.BAD_TOKEN, 'seat is not the signaling peer');
        return;
      }
      if (gate.timer !== null) { clearTimer(gate.timer); gate.timer = null; }
      const attachNow = (): void => {
        if (links.get(peer) !== link || gates.get(peer) !== gate || actor !== live) return;
        gate.state = 'attached';
        const attached = live.attach(link, hello, verified.claims);
        if (!attached) { gates.delete(peer); return; }
        for (const queued of gate.queue.splice(0)) link.deliver(queued);
        // a seat welcomed after the boot (late, re-HELLOed, or back after a reconnect) holds the sealed configuration
        // within a housekeeping beat, not at the next CONFIG_INTERVAL_MS: elected inside that window, it could not resume
        lastConfigMs = -Infinity;
      };
      // during the resume hold the seat waits, its frames queued, and is welcomed with the others when the world moves
      if (hold) {
        hold.attaches.push(attachNow);
        hold.arrived.add(verified.claims.playerId);
        if ([...hold.awaited].every((playerId) => hold!.arrived.has(playerId))) releaseHold('seats');
        return;
      }
      attachNow();
    }).catch((error: unknown) => {
      if (links.get(peer) === link) link.close(CLOSE_REASON.INTERNAL_ERROR, error instanceof Error ? error.message : 'verification failed');
    });
  }

  /** The resume hold ends: every seat that came back is welcomed against the still world, then the loop starts. */
  function releaseHold(reason: 'seats' | 'timeout'): void {
    const current = hold;
    if (!current) return;
    hold = null;
    if (current.timer !== null) { clearTimer(current.timer); current.timer = null; }
    const arrived = [...current.awaited].filter((playerId) => current.arrived.has(playerId));
    holdStats = { heldMs: Math.round(now() - current.startedMs), released: reason, awaited: current.awaited.size, arrived: arrived.length };
    const live = actor;
    if (!live || stopped || live.stopped) return;
    // welcomed at the resume tick, in arrival order; each seat's own-row hint (queued behind its HELLO) lands now, before any tick
    for (const attach of current.attaches.splice(0)) attach();
    live.start();
    post({ type: 'stats', stats: stats()! });
    log('info', 'resume hold released', { reason, heldMs: holdStats.heldMs, awaited: holdStats.awaited, arrived: holdStats.arrived,
      missing: [...current.awaited].filter((playerId) => !current.arrived.has(playerId)) });
  }

  // ------------------------------------------------------------ reports and migration state

  function currentPhase(live: MatchActor): HostMatchReport['phase'] {
    if (live.ended) return 'ended';
    const phase = live.authority.phase;
    return phase === 'countdown' ? 'countdown' : phase === 'playing' ? 'playing' : 'loading';
  }

  function report(live: MatchActor, nowMs: number): void {
    if (!config || endedReported) return;
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
    if (phase === 'ended') endedReported = true;
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
      if (entityId !== null) entities.push(captureEntityRow(entity, entityId, era, tick));
    }
    entities.sort((a, b) => a.entityId - b.entityId);
    const destroyed = Array.isArray(meta.destroyedObstacleIndices)
      ? [...new Set((meta.destroyedObstacleIndices as number[]).filter((index) => Number.isInteger(index) && index >= 0))].sort((a, b) => a - b) : [];
    const battleTimeMs = Math.round(live.authority.timeS * 1000) + live.resumedBattleTimeMs;
    // destruction (docs/DESTRUCTION.md §8.3): the sealed keyframe carries the whole log, as the wire quantizes it
    const destruction = Array.isArray(meta.destructionLog)
      ? (meta.destructionLog as DestructionLogEntry[]).map(quantizeDestructionEntry) : [];
    const frame: SnapshotFrame = {
      tick, serverTimeMs, ackedInputTick: NO_TICK, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: INPUT_MARGIN_UNKNOWN,
      meta: captureMeta({ ...meta, battleTimeMs }, live.ended), destroyed, destruction, entities, shells: [], viewer: null,
      modeStateJson: meta.modeState ? JSON.stringify(meta.modeState) : null,
    };
    const phase = live.ended || live.authority.result ? 'ended' : live.authority.phase === 'countdown' ? 'countdown' : 'playing';
    return { tick, battleTimeMs, phase, frame, entities: captureEntityExtras(live), modeCheckpoint: live.authority.captureModeCheckpoint() };
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

  /**
   * A standby host thread (2026-10-14, §13.21): build the world and load the roster's fleet now, while this seat plays as
   * a peer, so an election boots the actor at once. Once only, never after a boot began; a failed preparation is not an
   * error (the boot builds its own world).
   */
  function prepare(next: HostPrepareConfig): void {
    if (prepared || config || booted || stopped || disposed) return;
    const started = now();
    // with bots, the authority's navigation grid and ground on this world too (sim/authoritativeMatch.ts prepareAuthorityGround)
    const world = buildWorld(next).then((built) => {
      if (next.bots && built !== 'terrain' && !stopped && !disposed) prepareAuthorityGround(built);
      return built;
    });
    prepared = { key: worldKey(next), world };
    void Promise.all([world, ensureAuthorityFleet(next.specIds.filter((specId) => typeof specId === 'string' && specId.length > 0))]).then(
      () => post({ type: 'prepared', ok: true, ms: Math.round(now() - started) }),
      (error: unknown) => post({ type: 'prepared', ok: false, ms: Math.round(now() - started), error: error instanceof Error ? error.message : String(error) }),
    );
  }

  async function boot(next: HostBootConfig): Promise<void> {
    if (actor || booted) throw new Error('the host core boots once');
    const generation = ++bootGeneration;
    config = next;
    const bootStarted = now();
    // the standby's world when it is this battlefield's (it may still be loading: the boot waits for it rather than
    // starting over); a preparation that failed, or one for another battlefield, leaves the boot to build its own
    const ready = prepared && prepared.key === worldKey(next) ? prepared.world : null;
    prepared = null;
    bootedPrepared = ready !== null;
    const world$ = ready ? ready.catch(() => { bootedPrepared = false; return buildWorld(next); }) : buildWorld(next);
    let worldMs = 0, fleetMs = 0;
    const worldTimed = world$.then((built) => { worldMs = Math.round(now() - bootStarted); return built; });
    const fleetTimed = ensureAuthorityFleet(rosterSpecIds(next)).then((fleet) => { fleetMs = Math.round(now() - bootStarted); return fleet; });
    // (it starts beside the migration key now: a failure is the Promise.all's below, never an unhandled rejection meanwhile)
    fleetTimed.catch(() => {});
    migrationKey = await deriveMigrationKey(next.hostSecret);
    const [world] = await Promise.all([worldTimed, fleetTimed]);
    // a core stopped while its world loaded (the seat left the battle mid-entry) never starts an actor: its stop found none to stop
    if (bootGeneration !== generation || disposed || stopped) return;
    const resume = next.resume;
    const actorStarted = now();
    const created = createMatchActor({
      roomId: next.roomId, mapId: next.mapId, mode: next.mode, seed: next.seed,
      seats: next.seats.map((seat) => ({ ...seat })), bots: next.bots.map((bot) => ({ ...bot })),
      ruleset: hostRulesetFor(next.mode, next.arrangement, next.campaignOperationId),
      countdownS: next.countdownS, ...(next.battleLimitS != null ? { battleLimitS: next.battleLimitS } : {}),
      holdCountdown: countdownHeld ?? next.holdCountdown === true,
      world, now, ...(schedule ? { schedule } : {}), autoStart: false,
      ...(endedLingerTicks !== undefined ? { endedLingerTicks } : {}),
      resume: resume ? { tick: resume.resumeTick, battleTimeMs: resume.battleTimeMs } : null,
      ...(next.snapshotHz !== undefined ? { snapshotHz: next.snapshotHz } : {}),
      ...(build !== undefined ? { build } : {}),
      onVerdict: () => { const live = actor; if (live) report(live, now()); },
    });
    let restored = 0;
    let destroyedRestored = 0;
    if (resume) {
      const applied = applyResumeState(created, resume);
      restored = applied.restored;
      destroyedRestored = applied.destroyedRestored;
      if (applied.skipped) log('warn', 'resume rows without an entity', { skipped: applied.skipped });
      if (applied.destroyedUnknown) log('warn', 'resume destroyed props this world does not have', { unknown: applied.destroyedUnknown });
    }
    actor = created;
    booted = true;
    endedReported = false;
    // The room hears 'loading' as soon as the actor exists (P1's cadence), then every phase change and every interval.
    report(created, now());
    // A migration with other seats in it holds the world still until they are back (RESUME_HOLD_MS); anything else runs now.
    const seatIds = new Set(next.seats.filter((seat) => seat.team !== 'spectator').map((seat) => seat.playerId));
    const awaited = resume ? [...new Set(resume.holdForSeats ?? [])].filter((playerId) => seatIds.has(playerId)) : [];
    if (awaited.length && resumeHoldMs > 0) {
      const current = { awaited: new Set(awaited), arrived: new Set<string>(), attaches: [] as Array<() => void>, startedMs: now(), timer: null as TimerHandle | null };
      hold = current;
      holdStats = { heldMs: 0, released: null, awaited: awaited.length, arrived: 0 };
      current.timer = setTimer(() => { current.timer = null; if (hold === current) releaseHold('timeout'); }, resumeHoldMs);
    } else {
      created.start();
    }
    const bootMs = Math.round(now() - bootStarted);
    post({ type: 'ready', tick: created.tick, entities: created.authority.entities.length, resumed: !!resume, kernels: kernelsStatusOf(world, next),
      timings: { worldMs, fleetMs, actorMs: Math.round(now() - actorStarted), bootMs, prepared: bootedPrepared === true } });
    log('info', 'host actor booted', { tick: created.tick, entities: created.authority.entities.length, restored, destroyedRestored, resumed: !!resume, holdFor: awaited.length && resumeHoldMs > 0 ? awaited.length : 0,
      bootMs: Math.round(now() - bootStarted), prepared: bootedPrepared });
    for (const playerId of pendingRevokes) created.revokeSeat(playerId);
    pendingRevokes.clear();
    for (const { peer, label, playerId, frames } of pendingOpens.splice(0)) {
      openLink(peer, label, playerId);
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
      snapshots: summary.snapshots, keyframes: summary.keyframes, migrationKeyframes, tickP95Ms: summary.tickMs.p95,
      tickP50Ms: summary.tickMs.p50, tickMeanMs: summary.tickMs.mean, tickMaxMs: summary.tickMs.max, tickCount: summary.tickMs.count,
      droppedTicks: summary.loop.droppedTicks, stalls: summary.loop.stalls, lateWakeupMaxMs: summary.loop.lateWakeupMaxMs, verdict: summary.verdict,
      snapshotHz: summary.snapshotHz, snapshotSkips: summary.droppedSnapshots, interest: summary.interest,
      resumeHints: { applied: summary.resumeHints.applied, rejected: summary.resumeHints.rejected },
      resumeHold: holdStats ? { ...holdStats, ...(hold ? { heldMs: Math.round(now() - hold.startedMs), arrived: [...hold.awaited].filter((playerId) => hold!.arrived.has(playerId)).length } : {}) } : null,
    };
  }

  function stop(reason: CloseReasonId = CLOSE_REASON.ROOM_CLOSED, detail = ''): void {
    if (stopped) return;
    stopped = true;
    pendingOpens.length = 0; // links opened during the world load die with the core (boot returns on `stopped`)
    if (housekeeping !== null) { clearTimer(housekeeping); housekeeping = null; }
    if (hold) { if (hold.timer !== null) clearTimer(hold.timer); hold = null; }
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
        countdownHeld = null;
        void boot(message.config).catch((error: unknown) => {
          post({ type: 'boot_failed', error: error instanceof Error ? error.message : String(error) });
        });
        return;
      case 'prepare': prepare(message.prepare); return;
      case 'link_open': openLink(message.peer, message.label, typeof message.playerId === 'string' ? message.playerId : ''); return;
      case 'seat_revoke':
        if (typeof message.playerId !== 'string' || !message.playerId) return;
        if (actor) actor.revokeSeat(message.playerId);
        else pendingRevokes.add(message.playerId);
        return;
      case 'link_frame': admit(message.peer, new Uint8Array(message.bytes)); return;
      case 'link_close': {
        const pendingIndex = pendingOpens.findIndex((entry) => entry.peer === message.peer);
        if (pendingIndex >= 0) pendingOpens.splice(pendingIndex, 1);
        links.get(message.peer)?.closedByMain();
        return;
      }
      case 'link_pressure': links.get(message.peer)?.setPressure(message.bufferedAmount); return;
      case 'stop': stop(message.reason, message.detail); return;
      case 'countdown': {
        // (a release before the actor exists — the page revealed while the world still loaded — is the boot's to apply)
        countdownHeld = message.held;
        actor?.holdCountdown(message.held);
        return;
      }
      case 'pause': {
        if (!actor) return;
        if (message.paused) actor.pause();
        else actor.resume();
        post({ type: 'paused', paused: actor.paused, tick: actor.tick });
        return;
      }
      case 'stats': { const summary = stats(); if (summary) post({ type: 'stats', stats: summary }); return; }
      default: return;
    }
  });

  return {
    get actor() { return actor; },
    get booted() { return booted; },
    get bootedPrepared() { return bootedPrepared; },
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
