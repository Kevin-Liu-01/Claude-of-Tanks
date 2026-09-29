/**
 * The browser host runtime (P2 client lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13), main thread: when the room names
 * this seat as host (`match_start.hostId === me`, or a later `host_changed`), it spawns the actor's thread through a
 * port (a Worker in the browser, the in-process core in the receipts), boots it with the plan, the secret and — on a
 * migration — the retained state, accepts every peer's WebRTC offer through the room (`rtcClientLink`'s acceptor) and
 * bridges each opened channel to the Worker as a numbered link (frames as transferred buffers, the channel's
 * bufferedAmount reported as backpressure), plays its own seat through the loopback pair (its client end is the
 * transport the host's MatchClient uses, the server end feeds link 0), forwards the actor's reports to the room
 * (`match_report`), and samples its uplink and peer count for the status model.
 */
import { createLoopbackPair } from '../transport/loopbackTransport.ts';
import type { LoopbackPair } from '../transport/loopbackTransport.ts';
import { Listeners } from '../transport/transport.ts';
import type { Transport, Unsubscribe } from '../transport/transport.ts';
import type { RtcIceConfig, RtcPeerConnectionFactory, Signaler } from '../transport/webRtcTransport.ts';
import { createRtcHostAcceptor } from '../match/rtcClientLink.ts';
import type { RtcClientLink, RtcHostAcceptor } from '../match/rtcClientLink.ts';
import { CLOSE_REASON } from '../wire/constants.ts';
import type { CloseReasonId } from '../wire/constants.ts';
import { HOST_LOOPBACK_PEER } from './hostProtocol.ts';
import type { HostBootConfig, HostCoreStats, HostMatchReport, HostPort, HostToWorkerMessage, WorkerToHostMessage } from './hostProtocol.ts';

export type MatchHostState = 'idle' | 'booting' | 'live' | 'stopped' | 'failed';

export interface MatchHostRoomPort {
  signaler: Signaler;
  /** The host's report to the room (a `room_command`); rejections are logged, never fatal. */
  reportMatch(report: HostMatchReport): Promise<unknown>;
}

export interface MatchHostOptions {
  playerId: string;
  /** The room's current host generation (the acceptor refuses offers for any other). */
  generation: () => number;
  room: MatchHostRoomPort;
  /** The actor's thread: a Worker port in the browser (browserHostPort.ts), the in-process core's port in Node. */
  createPort: () => HostPort<HostToWorkerMessage, WorkerToHostMessage>;
  ice?: RtcIceConfig | (() => Promise<RtcIceConfig> | RtcIceConfig);
  createPeerConnection?: RtcPeerConnectionFactory;
  maxPeers?: number;
  clock?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  onLog?: (level: 'info' | 'warn' | 'error', message: string, fields?: Record<string, unknown>) => void;
  /** How long the boot may take before it fails (the Worker chunk, the manifest, the world). */
  bootTimeoutMs?: number;
}

export interface MatchHostStats {
  state: MatchHostState;
  generation: number;
  peersConnected: number;
  relayed: number;
  uplinkBytesPerS: number;
  tick: number;
  phase: string;
  reports: number;
  core: HostCoreStats | null;
}

export interface MatchHost {
  readonly state: MatchHostState;
  /** The host's own seat rides this transport (the loopback pair's client end). */
  readonly transport: Transport;
  readonly generation: number;
  readonly peersConnected: number;
  readonly relayed: number;
  readonly uplinkBytesPerS: number;
  readonly lastReport: HostMatchReport | null;
  readonly acceptor: RtcHostAcceptor | null;
  /**
   * Boot the actor with `config`; resolves once it runs (rejects when the boot failed or timed out). The port and the
   * acceptor exist from construction, so peers offering before the boot is done are answered and their frames wait.
   */
  start(config: HostBootConfig): Promise<void>;
  /** One display frame: deliver the loopback frames, sample the uplink, report pressure. */
  pump(nowMs?: number): void;
  requestStats(): void;
  stats(): MatchHostStats;
  stop(reason?: CloseReasonId, detail?: string): void;
  onState(listener: (state: MatchHostState, detail: string) => void): Unsubscribe;
}

const PRESSURE_INTERVAL_MS = 100;
const UPLINK_WINDOW_MS = 1000;
const DEFAULT_BOOT_TIMEOUT_MS = 30_000;
const PORT_CLOSE_GRACE_MS = 500;

export function createMatchHost({
  playerId,
  generation,
  room,
  createPort,
  ice,
  createPeerConnection,
  maxPeers,
  clock = () => (typeof performance === 'object' ? performance.now() : Date.now()),
  setTimer = (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  onLog = () => {},
  bootTimeoutMs = DEFAULT_BOOT_TIMEOUT_MS,
}: MatchHostOptions): MatchHost {
  if (typeof playerId !== 'string' || !playerId) throw new TypeError('the host player id is required');
  if (typeof generation !== 'function') throw new TypeError('the generation reader is required');
  const stateListeners = new Listeners<{ state: MatchHostState; detail: string }>();
  let state: MatchHostState = 'idle';
  let port: HostPort<HostToWorkerMessage, WorkerToHostMessage> | null = null;
  let unsubscribePort: Unsubscribe | null = null;
  let acceptor: RtcHostAcceptor | null = null;
  let config: HostBootConfig | null = null;
  let pair: LoopbackPair | null = null;
  let ready = false;
  let lastReport: HostMatchReport | null = null;
  let coreStats: HostCoreStats | null = null;
  let reports = 0;
  let peerSeq = HOST_LOOPBACK_PEER;
  const bridges = new Map<number, { link: RtcClientLink; playerId: string; lastPressure: number }>();
  const queuedLoopback: Uint8Array<ArrayBuffer>[] = [];
  let bootTimer: unknown = null;
  let lastPressureMs = -Infinity;
  let uplinkWindowStartMs: number | null = null;
  let uplinkWindowBytes = 0;
  let uplinkBytesPerS = 0;
  let startPromise: Promise<void> | null = null;

  const setState = (next: MatchHostState, detail = ''): void => {
    if (state === next) return;
    state = next;
    stateListeners.emit({ state: next, detail });
  };

  const post = (message: HostToWorkerMessage, transfer?: ArrayBuffer[]): void => { port?.post(message, transfer); };

  // ------------------------------------------------------------ the host's own seat over the loopback pair

  const loopback = createLoopbackPair({ clock, connectDelayMs: 0 });
  pair = loopback;
  loopback.server.open();
  loopback.server.onFrame((bytes) => {
    if (!ready) { queuedLoopback.push(bytes.slice()); return; }
    const copy = bytes.slice();
    post({ type: 'link_frame', peer: HOST_LOOPBACK_PEER, bytes: copy.buffer }, [copy.buffer]);
  });
  loopback.server.onState((change) => {
    if (change.state === 'closed' && ready) post({ type: 'link_close', peer: HOST_LOOPBACK_PEER });
  });

  // ------------------------------------------------------------ peers

  const bridge = (link: RtcClientLink, peerId: string): void => {
    const peer = ++peerSeq;
    bridges.set(peer, { link, playerId: peerId, lastPressure: 0 });
    post({ type: 'link_open', peer, label: link.label });
    link.onMessage((bytes) => {
      const copy = bytes.slice();
      post({ type: 'link_frame', peer, bytes: copy.buffer }, [copy.buffer]);
    });
    link.onClose(() => {
      if (bridges.delete(peer)) post({ type: 'link_close', peer });
    });
  };

  const receive = (message: WorkerToHostMessage): void => {
    switch (message.type) {
      case 'ready':
        if (ready) return;
        ready = true;
        if (bootTimer !== null) { clearTimer(bootTimer); bootTimer = null; }
        post({ type: 'link_open', peer: HOST_LOOPBACK_PEER, label: 'host' });
        for (const bytes of queuedLoopback.splice(0)) post({ type: 'link_frame', peer: HOST_LOOPBACK_PEER, bytes: bytes.buffer }, [bytes.buffer]);
        setState('live', message.resumed ? 'resumed' : 'started');
        onLog('info', 'host live', { tick: message.tick, entities: message.entities, resumed: message.resumed });
        return;
      case 'boot_failed':
        if (bootTimer !== null) { clearTimer(bootTimer); bootTimer = null; }
        onLog('error', 'host boot failed', { error: message.error });
        fail(message.error);
        return;
      case 'link_send': {
        const bytes = new Uint8Array(message.bytes);
        if (message.peer === HOST_LOOPBACK_PEER) {
          pair?.server.send(bytes);
          pair?.pump(clock());
          return;
        }
        const entry = bridges.get(message.peer);
        if (!entry || entry.link.closed) return;
        try { entry.link.send(bytes); } catch { /* the channel closed under the send; its close follows */ }
        return;
      }
      case 'link_close': {
        if (message.peer === HOST_LOOPBACK_PEER) { pair?.server.close('server', message.detail); return; }
        const entry = bridges.get(message.peer);
        if (!entry) return;
        bridges.delete(message.peer);
        entry.link.close(message.reason, message.detail);
        return;
      }
      case 'report':
        lastReport = message.report;
        reports++;
        void Promise.resolve(room.reportMatch(message.report)).catch((error: unknown) => {
          onLog('warn', 'match report refused', { error: error instanceof Error ? error.message : String(error) });
        });
        return;
      case 'stats':
        coreStats = message.stats;
        return;
      case 'log':
        onLog(message.level, message.message, message.fields);
        return;
      default:
        return;
    }
  };

  const fail = (detail: string): void => {
    if (state === 'stopped' || state === 'failed') return;
    setState('failed', detail);
    teardown();
  };

  /**
   * The runtime goes away (its owner leaves the battle, migrates onto another host, or disposes): the peers' channels
   * are dropped WITHOUT a wire CLOSE, so their clients read a lost link and wait for the room's election — the match
   * continues on the next host. A match that ended closes its links through the actor's own stop, with MATCH_ENDED.
   */
  const teardown = (): void => {
    acceptor?.close(null, 'host stopped');
    acceptor = null;
    for (const [peer, entry] of bridges) { bridges.delete(peer); entry.link.abandon(); }
    if (pair && pair.server.state !== 'closed') pair.server.close('server', 'host stopped');
    if (bootTimer !== null) { clearTimer(bootTimer); bootTimer = null; }
    const closing = port;
    const off = unsubscribePort;
    port = null;
    unsubscribePort = null;
    if (closing) {
      // Let the actor's stop and its final report drain before the thread goes.
      setTimer(() => { off?.(); closing.close(); }, PORT_CLOSE_GRACE_MS);
    }
  };

  // The thread and the acceptor come up at once: a peer that offers before the boot is done (the room's election reaches
  // every seat together) is answered now, its link bridged, its frames held by the core until the actor runs.
  let spawnError: Error | null = null;
  try {
    port = createPort();
    unsubscribePort = port.onMessage(receive);
    acceptor = createRtcHostAcceptor({
      signaler: room.signaler, hostId: playerId, generation, ice, createPeerConnection,
      ...(maxPeers !== undefined ? { maxPeers } : {}),
      onLink: (link, peer) => bridge(link, peer.playerId),
      clock, setTimer, clearTimer,
    });
  } catch (error) {
    spawnError = error instanceof Error ? error : new Error(String(error));
  }

  function start(next: HostBootConfig): Promise<void> {
    if (startPromise) return startPromise;
    startPromise = new Promise<void>((resolve, reject) => {
      if (spawnError) { fail(spawnError.message); reject(spawnError); return; }
      if (state !== 'idle') { reject(new Error(`host is ${state}`)); return; }
      if (!next || typeof next.hostSecret !== 'string' || next.hostSecret.length < 16) { const error = new TypeError('a boot config with the host secret is required'); fail(error.message); reject(error); return; }
      config = next;
      setState('booting', 'boot');
      const off = stateListeners.add(({ state: current, detail }) => {
        if (current === 'live') { off(); resolve(); }
        else if (current === 'failed' || current === 'stopped') { off(); reject(new Error(detail || current)); }
      });
      bootTimer = setTimer(() => { bootTimer = null; if (!ready) fail('host boot timed out'); }, bootTimeoutMs);
      post({ type: 'boot', config: next });
    });
    return startPromise;
  }

  function pump(nowMs: number = clock()): void {
    pair?.pump(nowMs);
    if (!ready || !acceptor) return;
    if (nowMs - lastPressureMs >= PRESSURE_INTERVAL_MS) {
      lastPressureMs = nowMs;
      for (const [peer, entry] of bridges) {
        const pressure = entry.link.bufferedAmount;
        if (pressure !== entry.lastPressure) { entry.lastPressure = pressure; post({ type: 'link_pressure', peer, bufferedAmount: pressure }); }
      }
    }
    if (uplinkWindowStartMs === null) { uplinkWindowStartMs = nowMs; uplinkWindowBytes = acceptor.bytesSent; return; }
    const elapsedMs = nowMs - uplinkWindowStartMs;
    if (elapsedMs >= UPLINK_WINDOW_MS) {
      uplinkBytesPerS = (acceptor.bytesSent - uplinkWindowBytes) * 1000 / elapsedMs;
      uplinkWindowStartMs = nowMs;
      uplinkWindowBytes = acceptor.bytesSent;
    }
  }

  function stop(reason: CloseReasonId = CLOSE_REASON.ROOM_CLOSED, detail = ''): void {
    if (state === 'stopped' || state === 'failed') return;
    post({ type: 'stop', reason, detail });
    setState('stopped', detail || 'stopped');
    teardown();
  }

  return {
    get state() { return state; },
    transport: loopback.client,
    get generation() { return config?.generation ?? generation(); },
    get peersConnected() { return acceptor?.connected ?? 0; },
    get relayed() { return acceptor?.relayed ?? 0; },
    get uplinkBytesPerS() { return uplinkBytesPerS; },
    get lastReport() { return lastReport; },
    get acceptor() { return acceptor; },
    start,
    pump,
    requestStats: () => post({ type: 'stats' }),
    stats: () => ({
      state, generation: config?.generation ?? generation(), peersConnected: acceptor?.connected ?? 0, relayed: acceptor?.relayed ?? 0, uplinkBytesPerS,
      tick: lastReport?.tick ?? 0, phase: lastReport?.phase ?? 'loading', reports, core: coreStats,
    }),
    stop,
    onState: (listener) => stateListeners.add(({ state: next, detail }) => listener(next, detail)),
  };
}
