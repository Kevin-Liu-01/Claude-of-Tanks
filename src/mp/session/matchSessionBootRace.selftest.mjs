// Proof (implicit state machine audit M2, 2026-11-02): an election boot that a newer election supersedes is not a failure.
// becomeHost sets `this.host` before its awaits (the migration key, the retained blobs, the host's start). A newer
// election naming another seat inside them stops that booting host (the replaced path), which makes its start() reject;
// the catch then reported "elected host failed to boot", emitted a failed migration, cleared the NEWER migration's
// `migrationActive` (ending its banner and the host-silence suppression early) and told the room this capable seat is
// `unable` to host — the room marks it declined and, with nobody else left, ends the match.
// Here: a peer is elected (generation 2) and, before its boot can finish, the room elects another seat (generation 3).
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

const SEAT_SECRET = 'session-boot-race-secret-0123456789abcdef';
const roomCode = 'SESRAC';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, team: null, now: 1001 });
joinRoom(room, { player: { id: 'third', name: 'Third' }, selection: { specId: 't90am' }, team: null, now: 1002 });
const snapshotWith = (host) => ({ ...serializeRoom(room), host });
const world = new RtcWorld();
const cores = [];
let transport = null;
const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 60_000, createTransport: () => { transport = scriptedTransport(); return transport; } });
const session = new MatchSession({
  room: client, clock: () => performance.now(),
  createPresentation: () => { const presentation = new RecordingPresentation(64); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
  p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1, standbyHost: false },
});
const events = [];
session.onP2p((event) => events.push(event));
session.start();
const joining = client.join({ roomCode });
await sleep(0);
const joinRequest = transport.outbound.find((envelope) => envelope.type === 'room_join');
transport.deliver({ type: 'room_joined', requestId: joinRequest.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }), playerId: 'me', seat: 1, chat: [] } });
await joining;
const hostDeclines = (from) => transport.outbound.slice(from).filter((envelope) => envelope.payload?.command?.type === 'host_decline').map((envelope) => envelope.payload.command);

const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
try {
  const matchId = 'm1-0000feed';
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 1, playerId: 'me', name: 'Me', team: 'bravo', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'other', generation: 1, since: 2000 }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 1, team: 'bravo', seatToken, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'other', expiresAt: Date.now() + 3_600_000 } });
  await until(() => session.phase === 'match' && session.role === 'peer', 'a peer of the first host');

  const mark = transport.outbound.length;
  const eventMark = events.length;
  // the host went: the room elects this seat, then — inside this seat's boot — elects the third seat instead
  transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 0, reason: 'timeout', hostSecret } });
  assert.equal(session.roleStatus, 'booting_host', 'setup: the elected seat is booting its host');
  transport.deliver({ type: 'host_changed', payload: { hostId: 'third', generation: 3, resumeTick: 0, reason: 'timeout' } });
  await sleep(400);
  const failed = events.slice(eventMark).filter((event) => event.kind === 'migration' && event.phase === 'failed');
  assert.deepEqual(failed, [], 'a superseded boot reports no failed migration');
  assert.deepEqual(hostDeclines(mark), [], 'and never tells the room this capable seat cannot host');
  assert.equal(session.p2p?.migrating, true, 'the newer migration (to the third seat) is still under way');
  assert.equal(session.p2p?.migrationHostId, 'third');
  assert.equal(session.role, 'peer', 'this seat follows the third seat as a peer');
} finally {
  clearInterval(pump);
  await session.leaveMatch('done').catch(() => {});
  session.dispose(); client.dispose();
  for (const core of cores) core.dispose();
}
console.log('matchSessionBootRace.selftest: an election boot superseded by a newer election is no failure: no failed migration, no decline, the newer migration runs on');
