// Proof (implicit state machine audit M2, 2026-11-02): the session's peer-to-peer role is one declared state.
// The role was read from which objects existed (`host` set: a host), the session never watched its host's own state,
// and nothing ended a host when its match did: on the end screen a hosting seat still read as the match's running host.
// A pagehide there (the tab closing on the result) told the room it declines and stepped down into a peer link for a
// match that was over; the finished host's actor and thread stayed up until the seat left the round.
// Here: a seat hosts round 1 (booting → live), the room settles it (finished: nothing hands it on), the actor plays out
// its end (its MATCH_ENDED on the host's own link) and the host goes (none). A move the table does not list is refused.
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
import { CLOSE_REASON } from '../wire/index.ts';
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

const SEAT_SECRET = 'session-role-seat-secret-0123456789abcdef';
const roomCode = 'SESROL';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, team: null, now: 1001 });
const snapshotWith = (host) => ({ ...serializeRoom(room), host });
const world = new RtcWorld();
const cores = [];
let transport = null;
const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 60_000, createTransport: () => { transport = scriptedTransport(); return transport; } });
const session = new MatchSession({
  room: client, clock: () => performance.now(),
  createPresentation: () => { const presentation = new RecordingPresentation(64); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
  p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1 },
});
const roles = [];
// the role event of a fresh boot goes out as the host is made: the declared state at that moment
session.onP2p((event) => { if (event.kind === 'role') roles.push(session.roleStatus); });
session.start();
const joining = client.join({ roomCode });
await sleep(0);
const joinRequest = transport.outbound.find((envelope) => envelope.type === 'room_join');
transport.deliver({ type: 'room_joined', requestId: joinRequest.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }), playerId: 'me', seat: 0, chat: [] } });
await joining;
const hostDeclines = (from) => transport.outbound.slice(from).filter((envelope) => envelope.payload?.command?.type === 'host_decline');

const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
try {
  assert.equal(session.roleStatus, 'none', 'no part before a match');
  const matchId = 'm1-0000c0de';
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'me', generation: 1, since: 2000 }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'me', hostSecret, expiresAt: Date.now() + 3_600_000 } });
  await until(() => session.phase === 'match' && session.matchHost?.state === 'live', 'round 1 hosted');
  await until(() => session.roleStatus === 'live_host', 'the role follows the host to live');
  assert.equal(roles[0], 'booting_host', `the host boots first (${roles.join(' → ')})`);
  assert.equal(session.role, 'host');

  // the room settles the round: the host is finished, and a pagehide on the end screen hands nothing on
  transport.deliver({ type: 'match_status', payload: { matchId, round: 1, status: 'ended', verdict: { result: 'alpha', reason: 'time_limit' } } });
  await until(() => session.phase === 'ended', 'round 1 settled');
  assert.equal(session.roleStatus, 'finished_host', 'a settled round\'s host is finished');
  const mark = transport.outbound.length;
  assert.equal(session.handOffHosting('pagehide'), false, 'a finished host has no match to hand on');
  assert.equal(hostDeclines(mark).length, 0, 'and tells the room nothing');
  assert.equal(session.roleStatus, 'finished_host', 'nor steps down into a peer link for a match that is over');

  // the actor plays out its end and closes its seats with MATCH_ENDED: the finished host goes
  const host = session.matchHost;
  cores.at(-1).stop(CLOSE_REASON.MATCH_ENDED, 'alpha');
  await until(() => session.roleStatus === 'none', 'the finished host is dropped at its actor\'s end', 5000);
  assert.equal(session.matchHost, null);
  assert.equal(host.state, 'stopped', 'its thread and acceptor are released');
  assert.equal(session.role, null);

  // the table refuses a move it does not list
  assert.equal(session.moveRole('live_host', 'proof'), false, 'none → live_host is refused');
  assert.equal(session.roleStatus, 'none');
} finally {
  clearInterval(pump);
  await session.leaveMatch('done').catch(() => {});
  session.dispose(); client.dispose();
  for (const core of cores) core.dispose();
}
console.log('matchSessionRole.selftest: booting → live → finished → none; a finished host hands nothing on and goes at its actor\'s end; unlisted moves are refused');
