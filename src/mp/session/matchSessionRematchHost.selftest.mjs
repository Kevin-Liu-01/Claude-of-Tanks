// Proof (implicit state machine audit M2, 2026-11-02): a hosting seat's rematch without a Garage return. The session's
// role is read from which objects exist (`role` is host while `this.host` is set), and nothing clears `this.host` when
// a match ends. The end screen's Start next starts round 2 in place: the room re-elects this seat and sends round 2's
// match_start, the session's enterMatch first runs leaveMatch('rematch') while still holding round 1's host, and that
// leave sends host_decline { declined: true, unable: true }. The room reads it as round 2's running host declining as
// unable (roomActor.ts host_decline → migrateHost(…, unable)); with no other human able to host it ends round 2 as lost
// at once (pinned by roomActor.selftest.mjs, "the elected last resort cannot host").
// Here: a scripted room socket, round 1 hosted and settled with a verdict, round 2 started with this seat as host again
// and no leaveMatch in between. Nothing may tell the room that round 2's host cannot host.
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

const SEAT_SECRET = 'session-rematch-seat-secret-0123456789abcdef';
const roomCode = 'SESRMT';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, team: null, now: 1001 });
for (const player of room.players) player.ready = true;
const snapshotWith = (host) => ({ ...serializeRoom(room), host });
const world = new RtcWorld();
const cores = [];

let transport = null;
const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 2000, createTransport: () => { transport = scriptedTransport(); return transport; } });
const session = new MatchSession({
  room: client, clock: () => performance.now(),
  createPresentation: () => { const presentation = new RecordingPresentation(64); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
  p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1 },
});
session.start();
const joining = client.join({ roomCode });
await sleep(0);
const joinRequest = transport.outbound.find((envelope) => envelope.type === 'room_join');
transport.deliver({ type: 'room_joined', requestId: joinRequest.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }), playerId: 'me', seat: 0, chat: [] } });
await joining;

/** The room starts a round with this seat elected as its p2p host (the admin hosts first). */
const startRound = (matchId, round, generation) => {
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'me', generation, since: 2000 + round }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken, matchUrl: p2pMatchUrl(roomCode, generation), hostId: 'me', hostSecret, expiresAt: Date.now() + 3_600_000 } });
};
const hostDeclines = (from) => transport.outbound.slice(from).filter((envelope) => envelope.type === 'room_command' && envelope.payload?.command?.type === 'host_decline').map((envelope) => envelope.payload.command);

const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
try {
  // round 1: this seat hosts it, it runs, and it ends with a verdict; the player stays on the end screen
  startRound('m1-0000a11a', 1, 1);
  await until(() => session.phase === 'match' && session.matchHost?.state === 'live', 'round 1 hosted');
  await until(() => !!session.match?.welcome, 'the host seat welcomed in round 1');
  assert.equal(hostDeclines(0).length, 0, 'setup: a desktop host never declines on its own');
  transport.deliver({ type: 'match_status', payload: { matchId: 'm1-0000a11a', round: 1, status: 'ended', verdict: { result: 'alpha', reason: 'time_limit' } } });
  await until(() => session.phase === 'ended', 'round 1 settled');
  const roleAfterVerdict = session.role;

  // round 2 from the end screen's Start next: no Garage return, no leaveMatch; the room elects this seat again
  const mark = transport.outbound.length;
  startRound('m2-0000b22b', 2, 2);
  await until(() => session.phase === 'match' && session.p2p?.generation === 2, 'round 2 entered');
  await sleep(100);
  const declines = hostDeclines(mark);
  assert.deepEqual(declines, [],
    `round 2's elected host told the room it cannot host (role after round 1's verdict: ${roleAfterVerdict}); `
    + 'the room ends round 2 as lost when no other seat can host');
} finally {
  clearInterval(pump);
  await session.leaveMatch('done').catch(() => {});
  session.dispose(); client.dispose();
  for (const core of cores) core.dispose();
}
console.log('matchSessionRematchHost: a hosting seat starts its next round in place without declining that round as unable');
