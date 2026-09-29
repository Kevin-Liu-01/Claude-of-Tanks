/**
 * The peer harness (P3 certification lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13.8): one seat of a peer-to-peer
 * match with no renderer, in a real Chrome tab — the real RoomClient, MatchSession and MatchClient
 * (`createHeadlessSession`), the browser host runtime with the actor's Worker chunk and the collision manifest under
 * /mp-collision when the room elects this seat, the browser's own RTCPeerConnection (real WebRTC; ICE from the runner:
 * host candidates only, STUN + TURN, or relay only), scripted driving, prediction against the manifest world, and every
 * fact the soak reads on `window.__peer`: status, the own pose, the last snapshot tick, the clock offset, bytes in and
 * out per data channel (getStats), channel state, the room socket's message counts by type, the migration timeline.
 * Served by the dev-only middleware of vite.config.ts at /mp-p2p-peer/ (tools/mp-p2p-soak.mjs opens one tab per seat);
 * never in the public build (tools/mp-p2p-peer.selftest.mjs).
 *
 *   /mp-p2p-peer/?rooms=ws://127.0.0.1:8791&id=p3&name=Three&index=2&host=1&ice=relay&predict=1&countdown=3
 *
 * The runner injects the ICE servers before the page runs (`window.__peerIce = { iceServers, relayOnly }`): the
 * credential never rides the URL, the log or the report. Every seat resolves ICE per connection (the transport's rule),
 * so the runner may replace `window.__peerIce` mid-run to model a credential renewal.
 */
import { createHeadlessSession, scriptedControls } from '../../src/mp/session/headlessSession.ts';
import type { HeadlessSession } from '../../src/mp/session/headlessSession.ts';
import type { SessionP2pEvent } from '../../src/mp/session/matchSession.ts';
import { createBrowserHostPort } from '../../src/mp/host/browserHostPort.ts';
import { COLLISION_MANIFEST_ROUTE, loadCollisionWorld } from '../../src/mp/host/worldCollision.ts';
import { createPredictionWorld } from '../../src/mp/presentation/predictionWorld.ts';
import { getSpec } from '../../src/vehicles/specs.ts';
import { dequantizePosition } from '../../src/mp/wire/quantize.ts';
import type { MatchFrame, PredictionProvider } from '../../src/mp/match/matchClient.ts';
import type { MatchClient } from '../../src/mp/match/matchClient.ts';
import type { RtcIceConfig, RtcIceServerLike, RtcPeerConnectionLike } from '../../src/mp/transport/webRtcTransport.ts';
import type { SocketLike } from '../../src/mp/transport/webSocketTransport.ts';
import type { RoomCreateSettings, RoomTeam } from '../../src/mp/room/protocol.ts';

// ------------------------------------------------------------ the page's parameters

const params = new URLSearchParams(location.search);
const param = (name: string, fallback: string): string => params.get(name) ?? fallback;
const endpoint = param('rooms', '');
const playerId = param('id', `h_${Math.random().toString(36).slice(2, 10)}`);
const playerName = param('name', playerId);
const controlIndex = Number(param('index', '0')) || 0;
const canHost = param('host', '1') !== '0';
const iceMode = param('ice', 'none') as 'none' | 'all' | 'relay';
const predict = param('predict', '1') !== '0';
const countdownS = Number(param('countdown', '3')) || 3;
const stepHz = Math.max(10, Math.min(120, Number(param('hz', '60')) || 60));
/** fire=0: drive but never fire (a hold run must not end on a verdict). */
const firing = param('fire', '1') !== '0';
const TIMELINE_LIMIT = 4000;

interface TimelineEntry { atMs: number; wall: number; kind: string; [key: string]: unknown }
interface OwnPose { tick: number; x: number; z: number; atMs: number; predicted: boolean }

const timeline: TimelineEntry[] = [];
const errors: Array<{ atMs: number; text: string }> = [];
const bootedAtMs = performance.now();
const now = () => performance.now();
const record = (kind: string, fields: Record<string, unknown> = {}): void => {
  if (timeline.length >= TIMELINE_LIMIT) timeline.splice(0, timeline.length - TIMELINE_LIMIT + 1);
  timeline.push({ atMs: Math.round(now() * 10) / 10, wall: Date.now(), kind, ...fields });
};
window.addEventListener('error', (event) => { errors.push({ atMs: now(), text: `${event.message} (${event.filename}:${event.lineno})` }); });
window.addEventListener('unhandledrejection', (event) => { errors.push({ atMs: now(), text: `unhandled rejection: ${event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason)}` }); });

// ------------------------------------------------------------ ICE (injected by the runner; resolved per connection)

type InjectedIce = { iceServers?: RtcIceServerLike[]; relayOnly?: boolean } | null | undefined;
let iceResolves = 0;
function currentIce(): RtcIceConfig {
  const injected = (window as unknown as { __peerIce?: InjectedIce }).__peerIce;
  const servers = Array.isArray(injected?.iceServers) ? injected!.iceServers! : [];
  if (iceMode === 'none') return { iceServers: [], relayOnly: false };
  if (iceMode === 'relay') {
    if (!servers.some((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]).some((url) => /^turns?:/i.test(url)))) {
      throw new Error('ice=relay needs injected TURN servers (window.__peerIce)');
    }
    return { iceServers: servers, relayOnly: true };
  }
  return { iceServers: servers, relayOnly: false };
}
const resolveIce = (): RtcIceConfig => { iceResolves++; const config = currentIce(); record('ice:resolved', { servers: config.iceServers.length, relayOnly: config.relayOnly }); return config; };

// ------------------------------------------------------------ peer connections (kept for getStats)

interface ChannelStats { label: string; state: string; bytesSent: number; bytesReceived: number; messagesSent: number; messagesReceived: number }
interface PcSample { id: number; connectionState: string; iceConnectionState: string; iceGatheringState: string; localType: string | null; remoteType: string | null; viaTurn: boolean; rttMs: number | null; channels: ChannelStats[]; candidatesGathered: number; relayCandidates: number; gatherMs: number | null }
const pcs = new Map<number, { pc: RTCPeerConnection; createdAtMs: number; candidates: number; relayCandidates: number; gatheredAtMs: number | null; sample: PcSample }>();
let pcSeq = 0;
function createPeerConnection(config: RtcIceConfig): RtcPeerConnectionLike {
  const id = ++pcSeq;
  const pc = new RTCPeerConnection({ iceServers: config.iceServers as RTCIceServer[], iceTransportPolicy: config.relayOnly ? 'relay' : 'all', bundlePolicy: 'max-bundle' });
  const entry = { pc, createdAtMs: now(), candidates: 0, relayCandidates: 0, gatheredAtMs: null as number | null, sample: { id, connectionState: 'new', iceConnectionState: 'new', iceGatheringState: 'new', localType: null, remoteType: null, viaTurn: false, rttMs: null, channels: [], candidatesGathered: 0, relayCandidates: 0, gatherMs: null } as PcSample };
  pcs.set(id, entry);
  record('pc:new', { id, relayOnly: config.relayOnly, servers: config.iceServers.length });
  pc.addEventListener('icecandidate', (event) => {
    if (event.candidate) { entry.candidates++; if (/ typ relay /.test(event.candidate.candidate)) entry.relayCandidates++; }
  });
  pc.addEventListener('icegatheringstatechange', () => {
    if (pc.iceGatheringState === 'complete' && entry.gatheredAtMs === null) { entry.gatheredAtMs = now(); record('pc:gathered', { id, candidates: entry.candidates, relay: entry.relayCandidates, ms: Math.round(entry.gatheredAtMs - entry.createdAtMs) }); }
  });
  pc.addEventListener('connectionstatechange', () => { record('pc:state', { id, state: pc.connectionState, sinceMs: Math.round(now() - entry.createdAtMs) }); });
  pc.addEventListener('iceconnectionstatechange', () => { record('pc:ice', { id, state: pc.iceConnectionState }); });
  // The transport's structural shape is a subset of the DOM one; the connection state strings are the same.
  return pc as unknown as RtcPeerConnectionLike;
}
const candidateType = (value: unknown): string | null => (typeof value === 'string' ? value : null);
async function samplePc(entry: { pc: RTCPeerConnection; createdAtMs: number; candidates: number; relayCandidates: number; gatheredAtMs: number | null; sample: PcSample }): Promise<void> {
  const { pc, sample } = entry;
  sample.connectionState = pc.connectionState;
  sample.iceConnectionState = pc.iceConnectionState;
  sample.iceGatheringState = pc.iceGatheringState;
  sample.candidatesGathered = entry.candidates;
  sample.relayCandidates = entry.relayCandidates;
  sample.gatherMs = entry.gatheredAtMs === null ? null : Math.round(entry.gatheredAtMs - entry.createdAtMs);
  if (pc.connectionState === 'closed') return;
  let report: RTCStatsReport;
  try { report = await pc.getStats(); } catch { return; }
  const byId = new Map<string, Record<string, unknown>>();
  let selectedPairId: string | null = null;
  const channels: ChannelStats[] = [];
  const pairs: Record<string, unknown>[] = [];
  report.forEach((value: unknown) => {
    const stat = value as Record<string, unknown>;
    if (typeof stat.id === 'string') byId.set(stat.id, stat);
    if (stat.type === 'transport' && typeof stat.selectedCandidatePairId === 'string') selectedPairId = stat.selectedCandidatePairId;
    if (stat.type === 'candidate-pair') pairs.push(stat);
    if (stat.type === 'data-channel') {
      channels.push({ label: String(stat.label ?? ''), state: String(stat.state ?? ''), bytesSent: Number(stat.bytesSent ?? 0), bytesReceived: Number(stat.bytesReceived ?? 0), messagesSent: Number(stat.messagesSent ?? 0), messagesReceived: Number(stat.messagesReceived ?? 0) });
    }
  });
  const pair = (selectedPairId ? byId.get(selectedPairId) : null) ?? pairs.find((entry) => entry.state === 'succeeded' && entry.nominated === true) ?? null;
  if (pair) {
    const local = typeof pair.localCandidateId === 'string' ? byId.get(pair.localCandidateId) : null;
    const remote = typeof pair.remoteCandidateId === 'string' ? byId.get(pair.remoteCandidateId) : null;
    sample.localType = candidateType(local?.candidateType);
    sample.remoteType = candidateType(remote?.candidateType);
    sample.viaTurn = sample.localType === 'relay' || sample.remoteType === 'relay';
    sample.rttMs = typeof pair.currentRoundTripTime === 'number' ? pair.currentRoundTripTime * 1000 : null;
  }
  sample.channels = channels;
}
/** Bytes every closed connection carried (their samples are folded here when the connection goes). */
const retired = { bytesSent: 0, bytesReceived: 0, messagesSent: 0, messagesReceived: 0, connections: 0 };
async function samplePcs(): Promise<void> {
  // pc.close() dispatches no event: a closed connection is folded into the retired totals here and forgotten.
  for (const [id, entry] of pcs) if (entry.pc.connectionState === 'closed') { foldRetired(entry.sample); pcs.delete(id); }
  await Promise.all([...pcs.values()].map((entry) => samplePc(entry)));
}
function foldRetired(sample: PcSample): void {
  retired.connections++;
  for (const channel of sample.channels) { retired.bytesSent += channel.bytesSent; retired.bytesReceived += channel.bytesReceived; retired.messagesSent += channel.messagesSent; retired.messagesReceived += channel.messagesReceived; }
}

// ------------------------------------------------------------ the room socket (every message counted by type)

const roomMessages = { out: {} as Record<string, number>, in: {} as Record<string, number>, bytesOut: 0, bytesIn: 0, sockets: 0 };
const decoder = new TextDecoder();
function classify(text: string, direction: 'in' | 'out'): string {
  try {
    const envelope = JSON.parse(text) as { type?: string; payload?: { command?: { type?: string }; kind?: string; code?: string } };
    const type = String(envelope.type ?? 'unknown');
    if (type === 'room_command') return `room_command:${envelope.payload?.command?.type ?? '?'}`;
    if (type === 'room_signal') return `room_signal:${envelope.payload?.kind ?? '?'}`;
    if (type === 'error') return `error:${envelope.payload?.code ?? '?'}`;
    return type;
  } catch { return direction === 'in' ? 'undecodable' : 'unencodable'; }
}
function countingSocket(url: string): SocketLike {
  const socket = new WebSocket(url);
  roomMessages.sockets++;
  const send = socket.send.bind(socket);
  socket.send = ((data: Uint8Array) => {
    const text = decoder.decode(data);
    const key = classify(text, 'out');
    roomMessages.out[key] = (roomMessages.out[key] ?? 0) + 1;
    roomMessages.bytesOut += data.byteLength;
    // The transport's frames are plain Uint8Arrays (ArrayBufferLike); the DOM signature wants a BufferSource.
    send(data as unknown as BufferSource);
  }) as typeof socket.send;
  socket.addEventListener('message', (event) => {
    const data = event.data;
    const text = data instanceof ArrayBuffer ? decoder.decode(data) : typeof data === 'string' ? data : '';
    const key = classify(text, 'in');
    roomMessages.in[key] = (roomMessages.in[key] ?? 0) + 1;
    roomMessages.bytesIn += data instanceof ArrayBuffer ? data.byteLength : text.length;
  });
  socket.addEventListener('close', (event) => { record('room-socket:close', { code: (event as CloseEvent).code, reason: (event as CloseEvent).reason }); });
  return socket as unknown as SocketLike;
}

// ------------------------------------------------------------ the session

let headless: HeadlessSession | null = null;
let client: MatchClient | null = null;
let clientHooked: MatchClient | null = null;
let lastTransportState = '';
let lastLinkPhase = '';
let lastHostState = '';
let hostHooked: unknown = null;
let welcomes = 0;
let lastOwn: OwnPose | null = null;
let ownAtLoss: OwnPose | null = null;
/** The newest authority row for the own entity (what the host says, before the prediction's lead). */
let lastOwnRow: OwnPose | null = null;
let rowAtLoss: OwnPose | null = null;
let lossAtMs: number | null = null;
let awaitingFirstFrame = false;
let welcomeAtMs: number | null = null;
let framesSeen = 0;
let lastSnapshotTick = -1;
let lastMapId: string | null = null;
let predictionReady = false;
let predictionError: string | null = null;
const title = document.getElementById('title')!;
const statusPane = document.getElementById('status')!;

function ownPoseOf(frame: MatchFrame): OwnPose | null {
  const state = frame.viewer.state;
  if (state) return { tick: frame.viewer.authorityTick, x: state.pos.x, z: state.pos.z, atMs: now(), predicted: true };
  const row = frame.viewer.row;
  if (row) return { tick: frame.viewer.authorityTick, x: dequantizePosition(row.x), z: dequantizePosition(row.z), atMs: now(), predicted: false };
  return null;
}

function onFrame(frame: MatchFrame): void {
  framesSeen++;
  const latest = client?.retainedMigration().latestFrame ?? null;
  if (latest) lastSnapshotTick = latest.tick;
  const own = ownPoseOf(frame);
  if (own) lastOwn = own;
  const row = frame.viewer.row;
  if (row) lastOwnRow = { tick: frame.viewer.authorityTick, x: dequantizePosition(row.x), z: dequantizePosition(row.z), atMs: now(), predicted: false };
  if (awaitingFirstFrame && latest && (lossAtMs === null || latest.tick > (ownAtLoss?.tick ?? -1))) {
    awaitingFirstFrame = false;
    const after = own ?? (latest ? (() => { const ownRow = latest.entities.find((entry) => entry.entityId === client?.welcome?.entityId); return ownRow ? { tick: latest.tick, x: dequantizePosition(ownRow.x), z: dequantizePosition(ownRow.z), atMs: now(), predicted: false } : null; })() : null);
    const jumpM = after && ownAtLoss ? Math.hypot(after.x - ownAtLoss.x, after.z - ownAtLoss.z) : null;
    const rowAfter = lastOwnRow && lastOwnRow.tick >= latest.tick ? lastOwnRow : null;
    const rowJumpM = rowAfter && rowAtLoss ? Math.hypot(rowAfter.x - rowAtLoss.x, rowAfter.z - rowAtLoss.z) : null;
    record('frame:first', {
      tick: latest.tick, ownTick: after?.tick ?? null, x: after?.x ?? null, z: after?.z ?? null,
      beforeTick: ownAtLoss?.tick ?? null, beforeX: ownAtLoss?.x ?? null, beforeZ: ownAtLoss?.z ?? null, jumpM,
      rowJumpM, rowBeforeTick: rowAtLoss?.tick ?? null, rowAfterTick: rowAfter?.tick ?? null, leadAtLossM: ownAtLoss && rowAtLoss ? Math.hypot(ownAtLoss.x - rowAtLoss.x, ownAtLoss.z - rowAtLoss.z) : null,
      sinceLossMs: lossAtMs === null ? null : Math.round(now() - lossAtMs), sinceWelcomeMs: welcomeAtMs === null ? null : Math.round(now() - welcomeAtMs),
      tickContinuous: ownAtLoss ? latest.tick >= ownAtLoss.tick : null,
    });
  }
}

function hookClient(next: MatchClient | null): void {
  if (next === clientHooked) return;
  clientHooked = next;
  client = next;
  lastTransportState = '';
  lastLinkPhase = '';
  if (!next) return;
  next.onWelcome((welcome) => {
    welcomes++;
    welcomeAtMs = now();
    awaitingFirstFrame = true;
    record('welcome', { n: welcomes, serverTick: welcome.serverTick, entityId: welcome.entityId, seat: welcome.seat, sinceLossMs: lossAtMs === null ? null : Math.round(now() - lossAtMs) });
  });
}

async function predictionFor(specId: string, mapId: string, mode: string): Promise<PredictionProvider | null> {
  const spec = getSpec(specId);
  if (!spec) throw new Error(`no spec ${specId}`);
  const world = await loadCollisionWorld(mapId, COLLISION_MANIFEST_ROUTE);
  const predictionWorld = createPredictionWorld({ worldCollision: world, ownSpec: spec, ownState: () => client?.predictionState ?? null, others: () => [], mode });
  if (!predictionWorld) return null;
  return { world: predictionWorld, specFor: (id) => (id === specId ? spec : getSpec(id)) };
}

function boot(): void {
  if (!/^wss?:\/\//.test(endpoint)) throw new Error('the rooms endpoint (?rooms=ws://…) is required');
  headless = createHeadlessSession({
    endpoint,
    player: { id: playerId, name: playerName },
    createSocket: countingSocket,
    storage: localStorage,
    controls: (() => { const scripted = scriptedControls(controlIndex); return firing ? scripted : (tick: number) => ({ ...scripted(tick), fire: false }); })(),
    clientBuild: 'p2p-peer-harness',
    recordedFrames: 64,
    session: {
      p2p: {
        ice: resolveIce,
        createPeerConnection,
        ...(canHost ? { createHostPort: createBrowserHostPort } : {}),
        manifestBase: COLLISION_MANIFEST_ROUTE,
        tier: 'desktop',
        countdownS,
        onLog: (level, message, fields) => { record(`host-log:${level}`, { message, ...(fields ?? {}) }); },
      },
    },
  });
  const { room, session } = headless;
  room.onPhase(({ phase, detail }) => record(`room:${phase}`, { detail }));
  room.onMatchStart((payload) => { lastMapId = payload.mapId; record('match_start', { matchId: payload.matchId, matchUrl: payload.matchUrl, hostId: payload.hostId ?? null, secret: typeof (payload as { hostSecret?: unknown }).hostSecret === 'string', team: payload.team }); });
  room.onMatchStatus((payload) => record('match_status', { status: payload.status, verdict: payload.verdict ?? null }));
  room.onHostChanged((change) => record('host_changed', { hostId: change.hostId, generation: change.generation, reason: change.reason, resumeTick: change.resumeTick, secret: typeof change.hostSecret === 'string' }));
  room.onClosed(({ reason }) => record('room:closed', { reason }));
  session.onPhase(({ phase, detail }) => record(`session:${phase}`, { detail }));
  session.onP2p((event: SessionP2pEvent) => {
    const fields: Record<string, unknown> = { ...event };
    delete fields.kind;
    record(`p2p:${event.kind}`, fields);
    if (event.kind === 'migration' && event.phase === 'begin' && lossAtMs === null) { lossAtMs = now(); ownAtLoss = lastOwn; rowAtLoss = lastOwnRow; }
  });
  session.onFrame(onFrame);
  // The presentation the session builds is the recorder; prediction rides in through the round's presentation once the
  // roster is known (the browser composition's order): patch the factory's result after WELCOME.
  const originalEnter = session.enterMatch.bind(session);
  session.enterMatch = async (payload) => {
    const matchClient = await originalEnter(payload);
    hookClient(matchClient);
    if (predict && !session.spectator) {
      const off = matchClient.onWelcome((welcome) => {
        off();
        const entry = welcome.roster.find((row) => row.entityId === welcome.entityId);
        if (!entry) { predictionError = 'own roster entry missing'; return; }
        void predictionFor(entry.specId, welcome.mapId, welcome.mode).then((provider) => {
          if (session.match !== matchClient || !provider) return;
          matchClient.enablePrediction(provider);
          predictionReady = true;
          record('prediction:enabled', { specId: entry.specId, mapId: welcome.mapId });
        }).catch((error: unknown) => { predictionError = error instanceof Error ? error.message : String(error); record('prediction:failed', { error: predictionError }); });
      });
    }
    return matchClient;
  };
  title.textContent = `peer harness · ${playerId} · ${canHost ? 'can host' : 'never hosts'} · ice=${iceMode}`;
  record('booted', { playerId, canHost, iceMode, predict, countdownS, stepHz, firing });
}

// ------------------------------------------------------------ the frame loop and the samplers

let lastStepMs = now();
function step(): void {
  if (!headless) return;
  const nowMs = now();
  const elapsedS = Math.min(0.25, (nowMs - lastStepMs) / 1000);
  lastStepMs = nowMs;
  const { session } = headless;
  hookClient(session.match);
  headless.step(nowMs, elapsedS);
  const stats = client?.stats() ?? null;
  if (stats) {
    if (stats.transportState !== lastTransportState) {
      record(`transport:${stats.transportState}`, { previous: lastTransportState, reconnects: stats.reconnects });
      if (stats.transportState !== 'open' && lastTransportState === 'open' && lossAtMs === null) { lossAtMs = nowMs; ownAtLoss = lastOwn; rowAtLoss = lastOwnRow; }
      if (stats.transportState === 'open' && lossAtMs !== null && lastTransportState !== '' && lastTransportState !== 'open') record('transport:reopened', { sinceLossMs: Math.round(nowMs - lossAtMs) });
      lastTransportState = stats.transportState;
    }
    if (stats.phase !== lastLinkPhase) { record(`link:${stats.phase}`, {}); lastLinkPhase = stats.phase; }
    // A settled migration (the transport is open again and the first frame landed): the next loss starts a new window.
    if (lossAtMs !== null && stats.transportState === 'open' && !awaitingFirstFrame && stats.phase === 'live' && welcomeAtMs !== null && welcomeAtMs > lossAtMs) { lossAtMs = null; ownAtLoss = null; rowAtLoss = null; }
  }
  const host = session.matchHost;
  if (host !== hostHooked) {
    hostHooked = host;
    lastHostState = '';
    host?.onState((state, detail) => { if (state !== lastHostState) { record(`host:${state}`, { detail }); lastHostState = state; } });
  }
}
setInterval(step, Math.round(1000 / stepHz));
setInterval(() => {
  headless?.session.matchHost?.requestStats();
  void samplePcs();
}, 1000);

// ------------------------------------------------------------ the runner's surface

const teamOf = (value: unknown): RoomTeam | null => (value === 'alpha' || value === 'bravo' || value === 'spectator' ? value : null);
const memory = (): { jsHeapUsed: number | null; jsHeapTotal: number | null } => {
  const perf = performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } };
  return { jsHeapUsed: perf.memory?.usedJSHeapSize ?? null, jsHeapTotal: perf.memory?.totalJSHeapSize ?? null };
};

function status(): Record<string, unknown> {
  const room = headless?.room ?? null;
  const session = headless?.session ?? null;
  const stats = client?.stats() ?? null;
  const host = session?.matchHost ?? null;
  const hostStats = host?.stats() ?? null;
  const rtc = { connections: pcs.size, samples: [...pcs.values()].map((entry) => entry.sample), retired: { ...retired } };
  let bytesSent = retired.bytesSent, bytesReceived = retired.bytesReceived, messagesSent = retired.messagesSent, messagesReceived = retired.messagesReceived;
  for (const entry of pcs.values()) for (const channel of entry.sample.channels) { bytesSent += channel.bytesSent; bytesReceived += channel.bytesReceived; messagesSent += channel.messagesSent; messagesReceived += channel.messagesReceived; }
  return {
    playerId, playerName, canHost, iceMode, predict, stepHz, uptimeMs: Math.round(now() - bootedAtMs), nowMs: Math.round(now()), wall: Date.now(),
    room: room ? { ...room.stats(), isHost: room.isHost, adminId: room.room?.adminId ?? null, matchStatus: room.room?.match?.status ?? null, seat: room.seat, me: room.me ? { team: room.me.team, ready: room.me.ready, hostDeclined: room.me.hostDeclined } : null } : null,
    session: session ? { phase: session.phase, role: session.role, migrations: session.stats().migrations, rounds: session.stats().rounds, matchUrl: session.round?.matchStart.matchUrl ?? null, p2p: session.p2p ? { ...session.p2p } : null } : null,
    host: hostStats,
    match: stats ? {
      phase: stats.phase, matchPhase: stats.matchPhase, welcomed: stats.welcomed, transportState: stats.transportState, rttMs: stats.rttMs, rttJitterMs: stats.rttJitterMs,
      serverOffsetMs: stats.serverOffsetMs, clockSamples: stats.clockSamples, arrivalJitterMs: stats.arrivalJitterMs, lossRate: stats.lossRate, interpolationDelayMs: stats.interpolationDelayMs,
      bytesIn: stats.bytesIn, bytesOut: stats.bytesOut, bytesInPerS: stats.bytesInPerS, bytesOutPerS: stats.bytesOutPerS, framesIn: stats.framesIn, framesOut: stats.framesOut,
      snapshotsAccepted: stats.snapshotsAccepted, keyframes: stats.keyframes, missingBaselines: stats.missingBaselines, keyframeRequests: stats.keyframeRequests, staleSnapshots: stats.staleSnapshots,
      inputAckLagTicks: stats.inputAckLagTicks, inputLeadTicks: stats.inputLeadTicks, inputMarginTicks: stats.inputMarginTicks, reconnects: stats.reconnects, stalls: stats.stalls, outageMs: stats.outageMs,
      decodeErrors: stats.decodeErrors, serverErrors: stats.serverErrors, closeReason: stats.closeReason, bufferedBytes: stats.bufferedBytes, framesDropped: stats.transport.framesDropped,
      prediction: stats.prediction ? { lastPositionErrorM: stats.prediction.lastPositionErrorM, maxPositionErrorM: stats.prediction.maxPositionErrorM, maxFreePositionErrorM: stats.prediction.maxFreePositionErrorM, maxContactPositionErrorM: stats.prediction.maxContactPositionErrorM, hardSnaps: stats.prediction.hardSnaps, reconciliations: stats.prediction.reconciliations, maxCorrectionStepM: stats.prediction.maxCorrectionStepM } : null,
      ownShotsPredicted: stats.ownShotsPredicted, ownShotsConfirmed: stats.ownShotsConfirmed,
    } : null,
    own: lastOwn, lastSnapshotTick, framesSeen, welcomes, predictionReady, predictionError, mapId: lastMapId, iceResolves,
    rtc: { ...rtc, totals: { bytesSent, bytesReceived, messagesSent, messagesReceived } },
    roomMessages: { ...roomMessages, out: { ...roomMessages.out }, in: { ...roomMessages.in } },
    memory: memory(),
    errors: errors.slice(),
    timelineLength: timeline.length,
  };
}

const peer = {
  status,
  timeline: (since = 0) => timeline.slice(since),
  async create(options: { mode?: 'lan' | 'private'; specId?: string; settings?: RoomCreateSettings; team?: RoomTeam }) {
    if (!headless) throw new Error('not booted');
    const snapshot = await headless.room.create({ mode: options.mode ?? 'lan', selection: { specId: options.specId ?? 'm1a2' }, settings: options.settings ?? null });
    const team = teamOf(options.team);
    if (team) await headless.room.setTeam(team);
    record('room:created', { code: snapshot.roomCode, team });
    return { code: snapshot.roomCode, playerId };
  },
  async join(options: { code: string; specId?: string; team?: RoomTeam }) {
    if (!headless) throw new Error('not booted');
    const snapshot = await headless.room.join({ roomCode: options.code, selection: { specId: options.specId ?? 't90m' }, team: teamOf(options.team) });
    record('room:joined', { code: snapshot.roomCode, players: snapshot.players.length, team: headless.room.me?.team ?? null });
    return { code: snapshot.roomCode, playerId, team: headless.room.me?.team ?? null, players: snapshot.players.length };
  },
  setReady: (ready = true) => headless!.room.setReady(ready),
  setTeam: (team: RoomTeam) => headless!.room.setTeam(team),
  start: () => headless!.room.start(),
  declineHost: (declined: boolean) => headless!.room.declineHost(declined),
  leaveMatch: () => headless!.session.leaveMatch('harness leave'),
  leaveRoom: () => headless!.room.leave(),
  disconnectRoom: (reason = 'harness disconnect') => headless!.room.disconnect(reason),
  setIce: (config: { iceServers: RtcIceServerLike[]; relayOnly?: boolean } | null) => { (window as unknown as { __peerIce?: InjectedIce }).__peerIce = config; record('ice:replaced', { servers: config?.iceServers.length ?? 0 }); },
  roster: () => client?.welcome?.roster.map((entry) => ({ entityId: entry.entityId, playerId: entry.playerId, team: entry.team, bot: entry.bot, specId: entry.specId })) ?? null,
  poses: () => { const presentation = headless?.presentation; return presentation ? [...presentation.poses.values()].map((pose) => ({ entityId: pose.entityId, x: pose.x, z: pose.z, yaw: pose.yaw, destroyed: pose.destroyed })) : null; },
  retainedTicks: () => { const retained = client?.retainedMigration(); return retained ? { keyframe: retained.keyframe?.tick ?? null, config: retained.config?.tick ?? null, latest: retained.latestFrame?.tick ?? null } : null; },
};
(window as unknown as { __peer: typeof peer }).__peer = peer;

try {
  boot();
} catch (error) {
  errors.push({ atMs: now(), text: error instanceof Error ? error.stack ?? error.message : String(error) });
  title.textContent = `peer harness · boot failed: ${error instanceof Error ? error.message : String(error)}`;
}
setInterval(() => {
  const summary = status();
  statusPane.textContent = JSON.stringify({ room: summary.room, session: summary.session, host: summary.host, match: summary.match, own: summary.own, roomMessages: summary.roomMessages, errors: summary.errors }, null, 1);
}, 2000);
