// Proof (implicit state machine audit, round 2 Q2, 2026-11-04): a live host whose thread fails hands the match on at once.
// Review round 2 of the mp-migration lane let a live host fail (matchHost.ts HOST_MOVES live -> failed): the browser port
// reports a Worker error at any point of the host's life as boot_failed (browserHostPort.ts), and the host tears itself
// down (its acceptor, its peers' channels, its own seat's loopback). The session only unsubscribed: its role stayed
// live_host with the failed host kept, and it told the room nothing. The room acts on peers' host_unreachable claims only
// once the host's room socket is gone too, and this page's socket lives on, so every peer waited for the room's report
// staleness (ROOM_MATCH_REPORT_STALE_AFTER_MS, 90 s) before the next election. Now the session declines as unable at the
// failure (setDecline 'match', as a failed boot does) and leaves its hosting role, so the room elects at once.
// Review round 1: the first fix dropped the host and moved the role to 'none', and so stranded the seat's own player. Its
// match client sat on the dead host's loopback, which only the host's pump drives, 'reconnecting' until its recovery
// grace ran out, and the room's next election reached nothing (no host to step down, no peer link to retarget). The seat
// now steps down as stepDown does: its client moves onto a peer link at once, and the next election names its host.
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

const SEAT_SECRET = 'session-live-fail-seat-secret-0123456789abcdef';
const roomCode = 'SESLVF';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, team: null, now: 1001 });
const snapshotWith = (host) => ({ ...serializeRoom(room), host });
const world = new RtcWorld();
const cores = [];
// the host thread's port, with the Worker error the browser port turns into boot_failed (browserHostPort.ts)
// (short HELLO window and request timeout: no timer of the proof's own outlives it)
const inner = createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500, helloTimeoutMs: 2000 });
const ports = [];
const createHostPort = () => {
  const port = inner();
  const listeners = new Set();
  const wrapped = {
    post: (message, transfer) => port.post(message, transfer),
    onMessage: (listener) => { listeners.add(listener); const off = port.onMessage(listener); return () => { listeners.delete(listener); off(); }; },
    close: () => port.close(),
    workerError: () => { for (const listener of [...listeners]) listener({ type: 'boot_failed', error: 'Worker error: out of memory' }); },
  };
  ports.push(wrapped);
  return wrapped;
};
let transport = null;
const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 2_000, createTransport: () => { transport = scriptedTransport(); return transport; } });
const session = new MatchSession({
  room: client, clock: () => performance.now(),
  createPresentation: () => { const presentation = new RecordingPresentation(64); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
  p2p: { createPeerConnection: world.createPeerConnection, createHostPort, manifestBase: null, tier: 'desktop', countdownS: 1, standbyHost: false },
});
session.start();
const joining = client.join({ roomCode });
await sleep(0);
const joinRequest = transport.outbound.find((envelope) => envelope.type === 'room_join');
transport.deliver({ type: 'room_joined', requestId: joinRequest.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }), playerId: 'me', seat: 0, chat: [] } });
await joining;
const hostDeclines = (from) => transport.outbound.slice(from).filter((envelope) => envelope.payload?.command?.type === 'host_decline');
// the room takes every command (its acks end them, so no request timer outlives the proof)
const acked = new Set();
const ackAll = () => {
  for (const envelope of transport.outbound) {
    if (envelope.type !== 'room_command' || !envelope.requestId || acked.has(envelope.requestId)) continue;
    acked.add(envelope.requestId);
    transport.deliver({ type: 'room_ack', requestId: envelope.requestId, payload: { revision: 1 } });
  }
};

const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
try {
  const matchId = 'm1-0000f41d';
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'me', generation: 1, since: 2000 }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'me', hostSecret, expiresAt: Date.now() + 3_600_000 } });
  await until(() => session.phase === 'match' && session.matchHost?.state === 'live' && session.roleStatus === 'live_host', 'the seat hosts its match');
  const host = session.matchHost;
  const mark = transport.outbound.length;
  // the host thread dies mid-match
  ports.at(-1).workerError();
  await until(() => host.state === 'failed', 'the live host fails (review round 2: live -> failed)', 5000);
  let declined = null;
  try { await until(() => hostDeclines(mark).length > 0, 'a decline', 3000); declined = hostDeclines(mark)[0].payload.command; } catch { declined = null; }
  assert.ok(declined, `the seat tells the room at once that it cannot host (it said nothing: role ${session.roleStatus}, the peers wait out the room's 90 s report staleness)`);
  assert.equal(declined.declined, true);
  assert.equal(declined.unable, true, 'as unable: the room elects another seat, or ends the match when none can');
  assert.equal(session.roleStatus, 'peer', `the seat steps down to a peer (${session.roleStatus})`);
  assert.equal(session.matchHost, null, 'and drops the failed host');
  assert.equal(hostDeclines(mark).length, 1, 'once');
  assert.notEqual(session.migrating?.inner, host.transport, 'its own client left the dead host\'s loopback');
  assert.equal(session.migrating?.state, 'reconnecting', `its client waits on a peer link for the next host (${session.migrating?.state})`);
  // the room elects the other seat: this seat follows it as a peer, as any peer of the failed host does
  transport.deliver({ type: 'host_changed', payload: { hostId: 'other', generation: 2, resumeTick: 600, reason: 'declined' } });
  await until(() => session.roleStatus === 'migrating', `the next election reaches the seat (role ${session.roleStatus}, link ${session.migrating?.state})`, 3000);
  assert.equal(session.p2p?.hostId, 'other', 'it follows the elected host');
  assert.equal(session.p2p?.generation, 2);
  assert.equal(session.p2p?.migrating, true, 'a migration, as on every peer');
  assert.equal(session.phase, 'match', 'still in the match');
  assert.notEqual(session.matchClient?.phase, 'closed', `its client still runs the round (${session.matchClient?.phase})`);
} finally {
  clearInterval(pump);
  ackAll();
  await session.leaveMatch('done').catch(() => {});
  ackAll();
  session.dispose(); client.dispose();
  for (const core of cores) core.dispose();
}
console.log('matchSessionLiveHostFailure.selftest: a live host whose thread fails hands the match on at once: one unable decline, the seat steps down to a peer and follows the next election');
