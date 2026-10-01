// The session's peer-to-peer rules against a scripted room socket (no relay double, no real host thread beyond the
// in-process core): an rtc:// match_start naming this seat boots the browser host (role host, the loopback seat
// welcomed, 'loading' then the phase reported to the room as room_command match_report); the room's start election
// (host_changed, the URL's generation, reason 'start') is a no-op — no migration event; an election with an older
// generation is ignored by the room client; a host_only on a report (the room runs a newer generation) steps the
// host down: the actor stops, the seat becomes a peer targeting the room's newest host; a seat that cannot host
// (the mobile tier) sends host_decline on join; a ws:// match_start keeps the WebSocket path and no p2p facts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RoomClient } from '../room/roomClient.ts';
import { p2pMatchUrl } from '../room/protocol.ts';
import { createRoom, joinRoom, serializeRoom } from '../room/roomPolicy.ts';
import { MatchSession } from './matchSession.ts';
import { RecordingPresentation } from '../presentation/adapter.ts';
import { Listeners } from '../transport/transport.ts';
import { RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createInProcessHostPort } from '../host/inProcessHost.ts';
import { signSeatToken } from '../../../server/match/seatToken.ts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 8000) => {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(15); }
};

// ------------------------------------------------------------ a scripted room socket
function scriptedTransport() {
  const frames = new Listeners();
  const states = new Listeners();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const outbound = [];
  const transport = {
    kind: 'scripted', state: 'idle', bufferedBytes: 0, stats: { framesSent: 0, bytesSent: 0, framesReceived: 0, bytesReceived: 0, framesDropped: 0, framesRejected: 0, reconnects: 0, opens: 0 },
    open() { transport.state = 'open'; states.emit({ state: 'open', previous: 'idle' }); },
    send(frame) { outbound.push(JSON.parse(decoder.decode(frame))); return true; },
    reconnect() {}, close() { transport.state = 'closed'; states.emit({ state: 'closed', previous: 'open', reason: 'client' }); },
    onFrame: (listener) => frames.add(listener), onState: (listener) => states.add(listener),
    deliver(envelope) { frames.emit(encoder.encode(JSON.stringify(envelope))); },
    outbound,
  };
  return transport;
}

const SEAT_SECRET = 'session-p2p-seat-secret-0123456789abcdef';
const roomCode = 'SESP2P';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90m' }, team: null, now: 1001 });
for (const player of room.players) player.ready = true;
const snapshotWith = (host) => ({ ...serializeRoom(room), host });
const world = new RtcWorld();
const cores = [];

async function joinedClient({ tier = 'desktop', playerId = 'me' } = {}) {
  let transport = null;
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: playerId, name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 2000, createTransport: () => { transport = scriptedTransport(); return transport; } });
  const rounds = [];
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: (round) => { const presentation = new RecordingPresentation(64); rounds.push({ round, presentation }); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier, countdownS: 1 },
  });
  const events = [];
  session.onP2p((event) => events.push(event));
  session.start();
  const joining = client.join({ roomCode });
  await sleep(0);
  const request = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: request.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }), playerId, seat: playerId === 'me' ? 0 : 1, chat: [] } });
  await joining;
  return { client, session, transport, events, rounds };
}

// ---- a seat that cannot host declines on join
{
  const { transport, session, events, client } = await joinedClient({ tier: 'mobile' });
  await sleep(0);
  const decline = transport.outbound.find((envelope) => envelope.type === 'room_command' && envelope.payload.command?.type === 'host_decline');
  assert.ok(decline, 'the mobile tier sends host_decline on join');
  assert.equal(decline.payload.command.declined, true);
  assert.equal(decline.payload.command.unable, true, 'a seat that cannot host at all says so (2026-09-30): elected as the last resort, the room ends the match at once');
  assert.equal(session.canHost, false);
  assert.deepEqual(events, [{ kind: 'declined' }]);
  session.dispose(); client.dispose();
}

// ---- the named host boots, reports, and treats the start election as a no-op; a stale election is ignored; host_only steps it down
{
  const { transport, session, events, client } = await joinedClient();
  assert.equal(transport.outbound.some((envelope) => envelope.payload?.command?.type === 'host_decline'), false, 'a desktop seat never declines by itself');
  const matchId = 'm1-0000c0de';
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const token = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a2', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'me', generation: 1, since: 2000 }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: token, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'me', hostSecret, expiresAt: Date.now() + 3_600_000 } });
  await until(() => session.phase === 'match', 'the round entered');
  assert.equal(session.role, 'host');
  await until(() => session.matchHost?.state === 'live', 'the host booted');
  transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 1, resumeTick: 0, reason: 'start', hostSecret } });
  await sleep(20);
  assert.equal(events.filter((event) => event.kind === 'migration').length, 0, "the room's start election is not a migration");
  assert.equal(session.stats().migrations, 0);
  transport.deliver({ type: 'host_changed', payload: { hostId: 'other', generation: 0, resumeTick: 0, reason: 'timeout' } });
  await sleep(20);
  assert.equal(client.hostId, 'me', 'an older election is ignored by the room client');
  assert.equal(session.role, 'host');
  // the loopback seat is welcomed by the own actor; reports leave as room commands
  let ticks = 0;
  const pump = setInterval(() => { session.update(performance.now(), 1 / 60); ticks++; }, 16);
  await until(() => !!session.match?.welcome, 'the host seat welcomed', 10_000);
  await until(() => transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'match_report').length >= 2, 'two reports', 10_000);
  const reports = transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'match_report').map((envelope) => envelope.payload.command);
  assert.equal(reports[0].phase, 'loading');
  assert.equal(reports[0].matchId, matchId);
  assert.equal(reports[0].generation, 1);
  assert.ok(['countdown', 'playing'].includes(reports[1].phase));
  assert.equal(session.p2p.role, 'host');
  assert.equal(session.p2p.generation, 1);
  // the room moved on (generation 2, another host): the next report is refused host_only → this seat steps down to a peer
  transport.deliver({ type: 'host_changed', payload: { hostId: 'other', generation: 2, resumeTick: 500, reason: 'timeout' } });
  await sleep(20);
  const late = transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'match_report');
  const pendingReport = late.at(-1);
  const stopped = cores[cores.length - 1];
  // (the election above already made this seat a peer of 'other'; a refused report must not undo that, and a stale host's report is what host_only answers)
  transport.deliver({ type: 'error', requestId: pendingReport.requestId, payload: { code: 'host_only' } });
  await sleep(50);
  assert.equal(session.role, 'peer', 'a replaced host is a peer of the newest host');
  assert.equal(session.p2p.hostId, 'other');
  assert.equal(session.p2p.generation, 2);
  assert.equal(stopped.stopped, true, 'its actor stopped');
  assert.ok(events.some((event) => event.kind === 'migration' && event.phase === 'begin' && event.hostId === 'other'), 'the newer election counted as a migration');
  assert.ok(events.some((event) => event.kind === 'role' && event.role === 'peer'));
  // the round ends while that migration is still open (the room lost the match — nobody resumed): the migration ends with it,
  // so the status banner never keeps "New host: … · resuming…" over the end screen (lane mp/ui-sync-check, 2026-09-30)
  assert.equal(session.p2p.migrating, true, 'the election onto the never-welcoming host is still open');
  transport.deliver({ type: 'match_status', payload: { matchId, round: 1, status: 'lost', verdict: null } });
  await sleep(20);
  assert.equal(session.phase, 'lost');
  assert.equal(session.p2p.migrating, false, 'a lost round leaves nothing migrating');
  assert.equal(session.p2p.migrationHostId, null);
  assert.ok(events.some((event) => event.kind === 'migration' && event.phase === 'end' && event.detail === 'lost'), 'the migration ended with the round');
  clearInterval(pump);
  void ticks;
  await session.leaveMatch('done');
  session.dispose(); client.dispose();
}

// ---- a ws:// match keeps the WebSocket path: no p2p facts, no host
{
  const { transport, session, client } = await joinedClient();
  let socketUrl = null;
  const wsSession = new MatchSession({
    room: client, createPresentation: () => { const presentation = new RecordingPresentation(8); return { adapter: presentation, dispose: () => presentation.dispose() }; },
    createTransport: (options) => { socketUrl = options.url; return scriptedTransport(); },
  });
  wsSession.start();
  session.dispose();
  transport.deliver({ type: 'match_start', payload: { matchId: 'm9-000000ff', round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 'tok.sig', matchUrl: '/match', expiresAt: Date.now() + 3_600_000 } });
  await until(() => wsSession.phase === 'match', 'the ws round entered');
  assert.equal(socketUrl, 'ws://rooms.test/match');
  assert.equal(wsSession.role, null);
  assert.equal(wsSession.p2p, null);
  assert.equal(wsSession.stats().p2p, null);
  wsSession.dispose(); client.dispose();
}
for (const core of cores) core.dispose();
console.log('matchSessionP2p.selftest: the host boot and its reports, the start election as a no-op, stale elections ignored, host_only step-down, the mobile decline and the ws:// path verified');

// ---- a host re-named for a match already playing (its tab reloaded inside the grace) declines so a peer with the keyframe resumes;
//      with no election following, it boots afresh through the election path
{
  const { transport, session, client } = await joinedClient();
  const matchId = 'm2-0000beef';
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const token = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a2', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  room.match = { id: matchId, round: 2, status: 'playing', mapId: 'verdant', seed: 7, startedAt: 1000, endedAt: null, verdict: null };
  room.phase = 'playing';
  const quick = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: () => { const presentation = new RecordingPresentation(64); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1, reentryElectionWaitMs: 300 },
  });
  const quickEvents = [];
  quick.onP2p((event) => quickEvents.push(event));
  session.dispose();
  quick.start();
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'me', generation: 3, since: 2000 }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round: 2, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: token, matchUrl: p2pMatchUrl(roomCode, 3), hostId: 'me', hostSecret, expiresAt: Date.now() + 3_600_000 } });
  await until(() => quick.phase === 'match', 'the re-entry round entered');
  assert.equal(quick.role, 'peer', 'the re-named host enters as a peer');
  assert.ok(transport.outbound.some((envelope) => envelope.payload?.command?.type === 'host_decline' && envelope.payload.command.declined === true), 'it declined so a peer with the keyframe resumes');
  assert.equal(transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'host_decline').at(-1).payload.command.unable, undefined,
    'the re-entry decline is a preference: this seat can still boot afresh, so the room keeps it when nobody else can host');
  assert.ok(quickEvents.some((event) => event.kind === 'declined'));
  // nobody else could host: no election comes; after the wait it boots afresh through the election path
  await until(() => quick.role === 'host', 'the fallback fresh boot', 5000);
  await until(() => quick.matchHost?.state === 'live', 'the fallback host live', 10_000);
  assert.ok(quickEvents.some((event) => event.kind === 'migration' && event.phase === 'begin' && event.hostId === 'me'), 'the fallback rode the election path');
  await quick.leaveMatch('done');
  const departure = transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'host_decline').at(-1);
  assert.deepEqual({ declined: departure.payload.command.declined, unable: departure.payload.command.unable }, { declined: true, unable: true },
    'a Garage return that stopped the actor declines as unable: with nobody left the room ends the match now, not after the report budget');
  quick.dispose(); client.dispose();
  room.match = null;
  room.phase = 'waiting';
}
// ---- a peer whose host never answers its offers gives up at the link window: the session ends `lost` — a bounded wait with
//      a user-visible outcome (the entry failure / the disconnect overlay), never `connecting` for ever (the lifecycle proofs
//      of 2026-09-30, §13.11; c4 runs the production window of 60 s against the real room service, this receipt a short one)
{
  const { transport, client, session } = await joinedClient();
  session.dispose();
  const matchId = 'm3-0000dead';
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const token = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a2', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  const phases = [];
  const peer = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: () => { const presentation = new RecordingPresentation(8); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
    transport: { reconnect: { initialDelayMs: 10, maxDelayMs: 20, factor: 1, jitterFraction: 0, windowMs: 1500, attemptTimeoutMs: 400 } },
    p2p: { createPeerConnection: world.createPeerConnection, manifestBase: null, tier: 'desktop', countdownS: 1 },
  });
  peer.onPhase((change) => phases.push(change.phase));
  peer.start();
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'other', generation: 1, since: 2000 }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: token, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'other', expiresAt: Date.now() + 3_600_000 } });
  await until(() => peer.phase === 'match', 'the peer entered');
  assert.equal(peer.role, 'peer');
  const started = performance.now();
  await until(() => transport.outbound.some((envelope) => envelope.type === 'room_signal' && envelope.payload.kind === 'offer'), 'an offer left for the host');
  await until(() => peer.phase === 'lost', 'the session gives up at the window', 6000);
  const waitedMs = performance.now() - started;
  assert.ok(waitedMs >= 1000 && waitedMs < 5000, `bounded by the link window (${Math.round(waitedMs)} ms)`);
  assert.ok(transport.outbound.filter((envelope) => envelope.type === 'room_signal' && envelope.payload.kind === 'offer').length >= 2, 'it re-offered before giving up');
  assert.equal(phases.filter((phase) => phase === 'lost').length, 1);
  assert.equal(peer.stats().p2p?.migrating ?? false, false, 'nothing left migrating');
  peer.dispose(); client.dispose();
}
for (const core of cores) core.dispose();
console.log('matchSessionP2p.selftest: the re-entry decline and its fallback boot verified; a peer whose host never links gives up at the window');
