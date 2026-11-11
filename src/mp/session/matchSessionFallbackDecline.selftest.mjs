// Proof (integration of audit M1 and M2, IR11, 2026-11-03): an elected seat that holds no readable keyframe of a battle
// in progress declines (mp-migration's migrationFallback, in becomeHost) through the session's own owners (mp-session's
// role machine and decline writer). mp-migration wrote that branch on a base with neither: after the merge it set
// `host = null` but left the role at 'booting_host' (the seat read as the host, and the next election's move to
// 'migrating' was refused, so it never read as a peer again), and it told the room straight through the room client,
// past setDecline, so the session's own decline record stayed willing (a decline the room lost in a socket blip was
// never said again).
// Case 1: a peer of a running match is elected (generation 2) with a newest frame that says playing and no keyframe; then
// the room elects the third seat (generation 3).
// Case 2 (integration review r1): the same election, superseded by generation 3 (the third seat) during the boot's key
// awaits. The decline branch had no supersession guard (mp-session's M2 rule, which the host.start catch keeps): the
// superseded boot reported a failed migration, cleared the newer migration's flag and host, and told the room this
// capable seat is unable to host.
// Cases 3 and 4 (round 2): the guard's other two triggers, the seat leaving the match and the match link closing during
// the key awaits, were logged as "superseded by a newer election" too. Each case checks the cause the log names.
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
import { PHASE, VERDICT } from '../wire/constants.ts';

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

const SEAT_SECRET = 'session-fallback-decline-0123456789abcdef';
const roomCode = 'SESFBD';
const matchId = 'm1-0000fb0d';
const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
// what this seat retained of the old host: a newest frame of the battle playing, no keyframe (unreadable or never sealed)
const playing = { tick: 1800, serverTimeMs: 30_000, meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 25_000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 }, entities: [], destroyed: [], destruction: [], shells: [], viewer: null, modeStateJson: null };

/** One seat ('me') of a three-seat room, a peer of the first host ('other') in a running match that it holds no keyframe of. */
async function peerOfRunningMatch() {
  const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
  joinRoom(room, { player: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, team: null, now: 1001 });
  joinRoom(room, { player: { id: 'third', name: 'Third' }, selection: { specId: 't90am' }, team: null, now: 1002 });
  const snapshotWith = (host) => ({ ...serializeRoom(room), host });
  const world = new RtcWorld();
  const cores = [];
  const logs = [];
  let transport = null;
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 60_000, createTransport: () => { transport = scriptedTransport(); return transport; } });
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: () => { const presentation = new RecordingPresentation(64); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1, standbyHost: false,
      onLog: (level, message, fields) => logs.push({ level, message, fields }) },
  });
  const events = [];
  session.onP2p((event) => events.push(event));
  session.start();
  const joining = client.join({ roomCode });
  await sleep(0);
  const joinRequest = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: joinRequest.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }), playerId: 'me', seat: 1, chat: [] } });
  await joining;
  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  const dispose = async () => {
    clearInterval(pump);
    await session.leaveMatch('done').catch(() => {});
    session.dispose(); client.dispose();
    for (const core of cores) core.dispose();
  };
  try {
    const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 1, playerId: 'me', name: 'Me', team: 'bravo', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
    transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'other', generation: 1, since: 2000 }) } });
    transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 1, team: 'bravo', seatToken, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'other', expiresAt: Date.now() + 3_600_000 } });
    await until(() => session.phase === 'match' && session.role === 'peer', 'a peer of the first host');
    session.match.retainedMigration = () => ({ keyframe: null, config: null, latestFrame: playing, latestFrameAtMs: performance.now(), fallen: [], destruction: [], respawns: [] });
  } catch (error) {
    await dispose();
    throw error;
  }
  const hostDeclines = (from) => transport.outbound.slice(from).filter((envelope) => envelope.payload?.command?.type === 'host_decline').map((envelope) => envelope.payload.command);
  const supersededCauses = () => logs.filter((entry) => entry.message.startsWith('elected host boot superseded')).map((entry) => entry.fields?.cause ?? entry.message);
  return { session, transport, events, hostDeclines, dispose, supersededCauses };
}

// Case 1: the elected seat declines through the session's own owners.
{
  const { session, transport, events, hostDeclines, dispose } = await peerOfRunningMatch();
  try {
    const mark = transport.outbound.length;
    const eventMark = events.length;
    transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 1800, reason: 'timeout', hostSecret } });
    assert.equal(session.roleStatus, 'booting_host', 'setup: the elected seat is booting its host');
    await until(() => events.slice(eventMark).some((event) => event.kind === 'migration' && event.phase === 'failed'), 'the elected seat declines');
    await sleep(50);
    const failed = events.slice(eventMark).filter((event) => event.kind === 'migration' && event.phase === 'failed');
    assert.deepEqual(failed.map((event) => event.detail), ['no state'], 'one failed migration: the seat holds no state of the battle');
    const declines = hostDeclines(mark);
    assert.equal(declines.length, 1, `one decline told to the room (${JSON.stringify(declines)})`);
    assert.equal(declines[0].declined, true, 'a decline');
    assert.equal(session.matchHost, null, 'no host is left booting');
    assert.equal(session.roleStatus, 'peer', 'the seat is a peer again on the link it still holds, not a booting host');
    assert.equal(session.role, 'peer');
    // white-box: the session's one decline writer recorded it (setDecline), as the boot-failed path beside it does
    assert.equal(session.decline, 'match', 'the session\'s own decline record holds the per-match decline');

    // the room elects the third seat: this seat follows it as a peer (from 'booting_host' the move to 'migrating' was refused)
    transport.deliver({ type: 'host_changed', payload: { hostId: 'third', generation: 3, resumeTick: 1800, reason: 'declined' } });
    await sleep(100);
    assert.equal(session.p2p?.migrationHostId, 'third');
    assert.equal(session.roleStatus, 'migrating', 'a peer following the election to the third seat');
    assert.equal(session.role, 'peer');
  } finally {
    await dispose();
  }
}

// Case 2: generation 3 (the third seat) lands before the generation-2 boot's first key await settles.
{
  const { session, transport, events, hostDeclines, dispose, supersededCauses } = await peerOfRunningMatch();
  try {
    const mark = transport.outbound.length;
    const eventMark = events.length;
    transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 1800, reason: 'timeout', hostSecret } });
    assert.equal(session.roleStatus, 'booting_host', 'setup: the elected seat is booting its host');
    transport.deliver({ type: 'host_changed', payload: { hostId: 'third', generation: 3, resumeTick: 1800, reason: 'timeout' } });
    await sleep(300);
    const failed = events.slice(eventMark).filter((event) => event.kind === 'migration' && event.phase === 'failed');
    assert.deepEqual(failed, [], 'a superseded no-state boot reports no failed migration');
    assert.deepEqual(hostDeclines(mark), [], 'and never tells the room this capable seat cannot host');
    assert.equal(session.decline, null, 'the session records no decline');
    assert.equal(session.p2p?.migrating, true, 'the newer migration (to the third seat) is still under way');
    assert.equal(session.p2p?.migrationHostId, 'third', 'the newer migration keeps its host');
    assert.equal(session.matchHost, null, 'no host is left booting');
    // the stepping-down path (booting_host -> stepping_down -> peer) on the new peer link, as matchSessionBootRace
    assert.equal(session.roleStatus, 'peer', 'this seat follows the third seat as a peer');
    assert.equal(session.role, 'peer');
    assert.deepEqual(supersededCauses(), ['newer election'], 'the log names the newer election');
  } finally {
    await dispose();
  }
}

// Case 3 (round 2): the seat leaves the match (a Garage return) during the generation-2 boot's key awaits.
{
  const { session, transport, events, dispose, supersededCauses } = await peerOfRunningMatch();
  try {
    const eventMark = events.length;
    transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 1800, reason: 'timeout', hostSecret } });
    assert.equal(session.roleStatus, 'booting_host', 'setup: the elected seat is booting its host');
    await session.leaveMatch('garage');
    await sleep(300);
    assert.deepEqual(events.slice(eventMark).filter((event) => event.kind === 'migration' && event.phase === 'failed'), [], 'a boot the leave ended reports no failed migration');
    assert.deepEqual(supersededCauses(), ['left the match'], `the log names the leave, not an election (${supersededCauses().join(', ')})`);
    assert.equal(session.roleStatus, 'none');
  } finally {
    await dispose();
  }
}

// Case 4 (round 2): the match link the boot was to serve closes during the generation-2 boot's key awaits.
{
  const { session, transport, events, dispose, supersededCauses } = await peerOfRunningMatch();
  try {
    const eventMark = events.length;
    transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 1800, reason: 'timeout', hostSecret } });
    assert.equal(session.roleStatus, 'booting_host', 'setup: the elected seat is booting its host');
    session.migrating.close(undefined, 'test: the match link closed'); // white-box: the session's migrating transport
    await sleep(300);
    assert.deepEqual(events.slice(eventMark).filter((event) => event.kind === 'migration' && event.phase === 'failed'), [], 'a boot whose link closed reports no failed migration');
    assert.deepEqual(supersededCauses(), ['match link closed'], `the log names the closed link, not an election (${supersededCauses().join(', ')})`);
    assert.equal(session.matchHost, null, 'no host is left booting');
  } finally {
    await dispose();
  }
}
console.log('matchSessionFallbackDecline.selftest: an elected seat with no state of a running battle declines through the session\'s role machine and decline owner: a peer again, its decline its own; superseded during its key awaits, it declines nothing, the newer migration runs on and the log names why');
