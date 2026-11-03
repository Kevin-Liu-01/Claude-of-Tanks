// Proof (implicit state machine audit M2, 2026-11-02): an election that names this seat while its world still loads.
// handleHostChanged returned at once without a match client (the whole loading phase of a starting match), and the
// round's entry took the host secret only from its own match_start, never from the election (RoomClient keeps it as
// lastHostChanged). Once loaded, the seat saw itself named without a secret and declined as `unable`; the room struck
// it from the match's ladder (steppedDown) and, with nobody else able to host, ended the match.
// (A) The room starts a match on another seat's host, that host goes while this seat loads, the room elects this
// seat; when the world is ready the seat must boot the match's host, report loading meanwhile, and never decline.
// (B) (2026-11-03, the round-1 review) The same election after the match went playing on the first host: this seat
// holds none of the match's state (its peers hold the sealed keyframe the election resumes from). The entry judged
// "running" from the room snapshot it began with ('starting'): the seat reported loading for the playing match and
// booted a fresh host at tick 0, so the battle restarted for every peer. It must decline (not as unable: it can host),
// send no loading reports, boot nothing, and follow the seat the room elects next as a peer.
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

const SEAT_SECRET = 'session-loading-election-0123456789abcdef';
const roomCode = 'SESLOD';

async function scenario({ playing }) {
  const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
  joinRoom(room, { player: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, team: null, now: 1001 });
  if (playing) joinRoom(room, { player: { id: 'third', name: 'Third' }, selection: { specId: 't90am' }, team: null, now: 1002 });
  const snapshotWith = (host, phase = 'starting', match = undefined) => ({ ...serializeRoom(room), phase, host, ...(match ? { match } : {}) });
  const world = new RtcWorld();
  const cores = [];
  let transport = null;
  let loaded = null;
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 60_000, createTransport: () => { transport = scriptedTransport(); return transport; } });
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    // the world loads until the receipt lets it finish
    createPresentation: async () => {
      await new Promise((resolve) => { loaded = resolve; });
      const presentation = new RecordingPresentation(64);
      return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() };
    },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1, entryReportIntervalMs: 50 },
  });
  session.start();
  const joining = client.join({ roomCode });
  await sleep(0);
  const joinRequest = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: joinRequest.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }, 'waiting'), playerId: 'me', seat: 1, chat: [] } });
  await joining;
  const commands = (type, from = 0) => transport.outbound.slice(from).filter((envelope) => envelope.payload?.command?.type === type).map((envelope) => envelope.payload.command);

  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  try {
    const matchId = 'm1-0000a1a1';
    const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
    const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 1, playerId: 'me', name: 'Me', team: 'bravo', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
    const match = (status) => ({ id: matchId, round: 1, mapId: 'verdant', seed: 7, startedAt: 2000, status, endedAt: null, verdict: null });
    transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'other', generation: 1, since: 2000 }, 'starting', match('starting')) } });
    transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 1, team: 'bravo', seatToken, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'other', expiresAt: Date.now() + 3_600_000 } });
    await until(() => session.phase === 'loading' && typeof loaded === 'function', 'this seat loads the world');
    if (!playing) {
      // the first host goes while this seat loads: the room elects it, the secret riding its copy of the election
      transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 0, reason: 'timeout', hostSecret } });
      await until(() => commands('match_report').length >= 2, 'the elected seat reports loading while its world builds', 3000);
      assert.deepEqual(commands('match_report')[0], { type: 'match_report', matchId, generation: 2, phase: 'loading', tick: 0 });
      loaded();
      await until(() => session.phase === 'match', 'the round entered');
      assert.deepEqual(commands('host_decline'), [], 'the seat the room elected while it loaded never declines');
      assert.equal(session.role, 'host', 'it hosts the match');
      await until(() => session.matchHost?.state === 'live', 'its host runs', 10_000);
      assert.equal(session.p2p?.generation, 2);
      return;
    }
    // the first host's match went playing (it reported playing at tick 1800), then the host went while this seat loads
    transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'other', generation: 1, since: 2000 }, 'playing', match('playing')) } });
    await sleep(30);
    transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 1800, reason: 'timeout', hostSecret } });
    await until(() => commands('host_decline').length >= 1, 'the seat elected for a running match declines', 3000);
    assert.deepEqual(commands('host_decline')[0], { type: 'host_decline', declined: true }, 'a re-entry decline, not unable: it can host a later match');
    await sleep(200);
    assert.deepEqual(commands('match_report'), [], 'no loading reports for a match that is playing');
    // the room elects the next commander, who holds the keyframe
    transport.deliver({ type: 'host_changed', payload: { hostId: 'third', generation: 3, resumeTick: 1800, reason: 'declined' } });
    loaded();
    await until(() => session.phase === 'match', 'the round entered');
    await sleep(100);
    assert.equal(session.role, 'peer', 'it follows the elected seat as a peer');
    assert.equal(session.matchHost, null, 'it booted no host');
    assert.equal(cores.length, 0, 'no fresh host at tick 0');
    assert.deepEqual(commands('match_report'), [], 'and reported nothing as a host');
    assert.ok(commands('host_decline').every((command) => command.declined === true && command.unable === undefined), JSON.stringify(commands('host_decline')));
  } finally {
    clearInterval(pump);
    loaded?.();
    await session.leaveMatch('done').catch(() => {});
    session.dispose(); client.dispose();
    for (const core of cores) core.dispose();
  }
}

await scenario({ playing: false });
await scenario({ playing: true });
console.log('matchSessionLoadingElection.selftest: a seat elected while it loads keeps the election and its secret, reports loading, and hosts once its world is ready; elected for a match already playing, it declines at once, boots nothing and follows the next host as a peer');
