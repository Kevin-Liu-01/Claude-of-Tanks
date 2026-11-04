// Proof (implicit state machine audit M2, 2026-11-02): the session's timer phases.
// (A) A seat re-named host of a running match without its state declines and, when no election follows, boots afresh.
//     That fallback ran a made-up election at `room.generation + 1`: the seat ran ahead of the room (its host reported a
//     generation the room never issued) and the room's next real election, at that generation and naming another seat,
//     read as "not newer" and was ignored — the seat kept hosting until a report came back host_only.
// (B) The standby host's delay ran on the global setTimeout while every other session timer runs on the injected ones.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RoomClient } from '../room/roomClient.ts';
import { p2pMatchUrl } from '../room/protocol.ts';
import { createRoom, joinRoom, serializeRoom } from '../room/roomPolicy.ts';
import { MatchSession, STANDBY_HOST_DELAY_MS } from './matchSession.ts';
import { RecordingPresentation } from '../presentation/adapter.ts';
import { Listeners } from '../transport/transport.ts';
import { RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createInProcessHostPort } from '../host/inProcessHost.ts';
import { signSeatToken } from '../../../server/match/seatToken.ts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 10_000) => {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(15); }
};
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

const SEAT_SECRET = 'session-timers-seat-secret-0123456789abcdef';
const roomCode = 'SESTIM';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, team: null, now: 1001 });
const world = new RtcWorld();
const cores = [];

// ---- (A) the re-entry fallback boots at the room's own generation; the room's next election replaces it
{
  const matchId = 'm2-0000beef';
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  const match = { id: matchId, round: 2, status: 'playing', mapId: 'verdant', seed: 7, startedAt: 1000, endedAt: null, verdict: null };
  const snapshotWith = (host) => ({ ...serializeRoom(room), phase: 'playing', match, host });
  let transport = null;
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 60_000, createTransport: () => { transport = scriptedTransport(); return transport; } });
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: () => { const presentation = new RecordingPresentation(64); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1, reentryElectionWaitMs: 300, standbyHost: false },
  });
  session.start();
  const joining = client.join({ roomCode });
  await sleep(0);
  const request = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: request.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: 'me', generation: 3, since: 2000 }), playerId: 'me', seat: 0, chat: [] } });
  await joining;
  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  try {
    transport.deliver({ type: 'match_start', payload: { matchId, round: 2, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken, matchUrl: p2pMatchUrl(roomCode, 3), hostId: 'me', hostSecret, expiresAt: Date.now() + 3_600_000 } });
    await until(() => session.phase === 'match' && session.role === 'peer', 'the re-named host enters as a peer and declines');
    await until(() => session.matchHost?.state === 'live', 'no election came: the fallback host runs', 10_000);
    assert.equal(session.matchHost.generation, 3, 'the fallback host runs the room\'s own generation, not one ahead of it');
    // the other commander is back and the room elects it (the next generation): this seat follows it
    transport.deliver({ type: 'host_changed', payload: { hostId: 'other', generation: 4, resumeTick: 120, reason: 'declined' } });
    await until(() => session.role === 'peer', 'the room\'s real election replaces the fallback host', 3000);
    assert.equal(session.matchHost, null);
  } finally {
    clearInterval(pump);
    await session.leaveMatch('done').catch(() => {});
    session.dispose(); client.dispose();
  }
}

// ---- (B) the standby host's delay runs on the injected timers, and its release clears that timer
{
  const set = [];
  const cleared = [];
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, createTransport: () => scriptedTransport() });
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: () => ({ adapter: new RecordingPresentation(8), dispose() {} }),
    transport: {
      setTimer: (callback, delayMs) => { const handle = { callback, delayMs }; set.push(handle); return handle; },
      clearTimer: (handle) => { cleared.push(handle); },
    },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core) }), manifestBase: null, tier: 'desktop' },
  });
  const round = { matchStart: { matchId: 'm3-0000c0c0', matchUrl: p2pMatchUrl(roomCode, 1), mapId: 'verdant', mode: 'standard' }, room: serializeRoom(room), spectator: false, playerId: 'me' };
  session.scheduleStandby({}, round, { roster: [] });
  assert.deepEqual(set.map((handle) => handle.delayMs), [STANDBY_HOST_DELAY_MS], 'the standby delay is the injected timer\'s');
  session.closeStandby('proof');
  assert.deepEqual(cleared, [set[0]], 'and its release clears that timer');
  session.dispose(); client.dispose();
}
for (const core of cores) core.dispose();
console.log('matchSessionTimers.selftest: the re-entry fallback boots at the room\'s generation and yields to its next election; the standby delay runs on the injected timers');
