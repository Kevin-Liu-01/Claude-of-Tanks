// Proof (implicit state machine audit M2, 2026-11-02): an election that names this seat while its world still loads.
// handleHostChanged returned at once without a match client (the whole loading phase of a starting match), and the
// round's entry took the host secret only from its own match_start, never from the election (RoomClient keeps it as
// lastHostChanged). Once loaded, the seat saw itself named without a secret and declined as `unable`; the room struck
// it from the match's ladder (steppedDown) and, with nobody else able to host, ended the match.
// (A) The room starts a match on another seat's host, that host goes while this seat loads, the room elects this
// seat; when the world is ready the seat must boot the match's host, report loading meanwhile, and never decline.
// The rest (2026-11-03, the review rounds): the same election for a match that already runs on the first host. This
// seat holds none of the match's state (its peers hold the sealed keyframe the election resumes from). The entry judged
// "running" from the room snapshot it began with ('starting'): the seat loaded, booted a fresh host at tick 0 and the
// battle restarted for every peer. It must decline (not as unable: it can host), send no loading reports, boot
// nothing, and follow the seat the room elects next as a peer.
// (B) The room elects the next seat before this world is ready: the at-once decline (handleHostChanged's no-client
//     branch) is what moves; the entry then sees another host.
// (C) The world is ready before any further election: the entry finds itself still named and must decline again
//     (openPeerToPeer's re-entry path, matchRunning). On ea869897d3 this ordering booted the fresh tick-0 host.
// (D) The same with the room's record playing and the election at tick 0 (the generation it replaced never reported):
//     the room's current record alone says running.
// (E) The same with the room's record still 'starting' and the election at tick 120 (the first host went in its
//     countdown, which runs ticks): the election's resume tick alone says running.
// (F) No election follows the declines (nobody else can host): the kept seat boots at the room's own generation, 2.
// (G) The at-once decline goes out into a room-socket blip and the room never reads it: the admission that ends the blip
//     says it again, so the room does not keep naming this seat until its world is ready.
// (H) matchRunning's truth table, one source at a time: the entry's room snapshot (a reload inside the host grace), the
//     room's current record of the match, the newest election's resume tick, and the match-id guards on the last two.
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
    // a room-socket blip: the socket drops (pending requests fail), then reopens resumed (the client admits again)
    drop() { transport.state = 'reconnecting'; states.emit({ state: 'reconnecting', previous: 'open', detail: 'blip', attempt: 1, retryDelayMs: 100 }); },
    resume() { transport.state = 'open'; states.emit({ state: 'open', previous: 'reconnecting', resumed: true }); },
    outbound,
  };
  return transport;
}

const SEAT_SECRET = 'session-loading-election-0123456789abcdef';
const roomCode = 'SESLOD';

/**
 * `running` null: (A). Otherwise { record: the room's record of the match when the election lands, resumeTick: the
 * election's, next: 'before_load' | 'after_load' | 'none' (the room's next election, naming 'third'), blip }.
 */
async function scenario(label, running = null) {
  const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
  joinRoom(room, { player: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, team: null, now: 1001 });
  if (running) joinRoom(room, { player: { id: 'third', name: 'Third' }, selection: { specId: 't90am' }, team: null, now: 1002 });
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
    p2p: {
      createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1, entryReportIntervalMs: 50,
      // (F) waits out a short re-entry election window; the others hear their next election well inside a long one
      reentryElectionWaitMs: running?.next === 'none' ? 300 : 4000,
    },
  });
  session.start();
  const joining = client.join({ roomCode });
  await sleep(0);
  const joinRequest = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: joinRequest.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }, 'waiting'), playerId: 'me', seat: 1, chat: [] } });
  await joining;
  const commands = (type, from = 0) => transport.outbound.slice(from).filter((envelope) => envelope.payload?.command?.type === type).map((envelope) => envelope.payload.command);
  const declines = () => commands('host_decline');
  // a withdrawal (declined: false: a seat welcomed by its own fresh host withdraws its re-entry decline) is no decline
  const declined = () => declines().filter((command) => command.declined === true).length;

  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  try {
    const matchId = 'm1-0000a1a1';
    const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
    const seatToken = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 1, playerId: 'me', name: 'Me', team: 'bravo', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
    const match = (status) => ({ id: matchId, round: 1, mapId: 'verdant', seed: 7, startedAt: 2000, status, endedAt: null, verdict: null });
    transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'other', generation: 1, since: 2000 }, 'starting', match('starting')) } });
    transport.deliver({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 1, team: 'bravo', seatToken, matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'other', expiresAt: Date.now() + 3_600_000 } });
    await until(() => session.phase === 'loading' && typeof loaded === 'function', `${label}: this seat loads the world`);
    if (!running) {
      // the first host goes while this seat loads: the room elects it, the secret riding its copy of the election
      transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 0, reason: 'timeout', hostSecret } });
      await until(() => commands('match_report').length >= 2, `${label}: the elected seat reports loading while its world builds`, 3000);
      assert.deepEqual(commands('match_report')[0], { type: 'match_report', matchId, generation: 2, phase: 'loading', tick: 0 });
      loaded();
      await until(() => session.phase === 'match', `${label}: the round entered`);
      assert.deepEqual(declines(), [], `${label}: the seat the room elected while it loaded never declines`);
      assert.equal(session.role, 'host', `${label}: it hosts the match`);
      await until(() => session.matchHost?.state === 'live', `${label}: its host runs`, 10_000);
      assert.equal(session.p2p?.generation, 2);
      return;
    }
    const { record, resumeTick, next, blip = false } = running;
    // the first host's match runs (the room's record reads `record`), then that host goes while this seat loads
    if (record === 'playing') {
      transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'other', generation: 1, since: 2000 }, 'playing', match('playing')) } });
      await sleep(30);
    }
    transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick, reason: 'timeout', hostSecret } });
    await until(() => declines().length >= 1, `${label}: the seat elected for a running match declines at once`, 3000);
    assert.deepEqual(declines()[0], { type: 'host_decline', declined: true }, `${label}: a re-entry decline, not unable: it can host a later match`);
    if (blip) {
      // the decline went out as the room socket dropped: the room never read it, and its record of this seat reads willing
      transport.drop();
      await sleep(30);
      transport.resume();
      await until(() => transport.outbound.filter((envelope) => envelope.type === 'room_join').length >= 2, `${label}: the client admits again`);
      const rejoin = transport.outbound.filter((envelope) => envelope.type === 'room_join')[1];
      transport.deliver({ type: 'room_joined', requestId: rejoin.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: 'me', generation: 2, since: 3000 }, record, match(record)), playerId: 'me', seat: 1, chat: [] } });
      await until(() => declines().length >= 2, `${label}: the admission says the decline the room never read again`, 3000);
      assert.deepEqual(declines()[1], { type: 'host_decline', declined: true }, `${label}: said again as it was said`);
    }
    const said = declined();
    if (next === 'before_load') {
      // the room elects the next commander, who holds the keyframe, before this world is ready
      transport.deliver({ type: 'host_changed', payload: { hostId: 'third', generation: 3, resumeTick, reason: 'declined' } });
      loaded();
      await until(() => session.phase === 'match', `${label}: the round entered`);
      await sleep(100);
      assert.equal(declines().length, said, `${label}: named no more, the entry declines nothing (and withdraws nothing)`);
    } else {
      // the world is ready first: the room still names this seat, so the entry declines again (no fresh tick-0 host)
      loaded();
      await until(() => declined() > said, `${label}: still named once its world is ready, the seat declines again`, 5000);
      await until(() => session.phase === 'match', `${label}: the round entered`);
      assert.equal(session.role, 'peer', `${label}: it enters as a peer`);
      assert.equal(cores.length, 0, `${label}: no fresh host at tick 0`);
      if (next === 'after_load') {
        transport.deliver({ type: 'host_changed', payload: { hostId: 'third', generation: 3, resumeTick, reason: 'declined' } });
        await sleep(100);
      } else {
        // nobody else can host, so the room kept this seat: it boots once the election window passes, at the room's generation
        await until(() => session.matchHost?.state === 'live', `${label}: no election followed: the kept seat's host runs`, 10_000);
        assert.equal(session.matchHost.generation, 2, `${label}: at the room's own generation, not one ahead of it`);
        assert.equal(cores.length, 1);
        // its own actor's reports (loading, then countdown) at generation 2: the room's next real election stays newer
        await until(() => commands('match_report').length >= 1, `${label}: the kept host reports`, 5000);
        assert.ok(commands('match_report').every((report) => report.generation === 2), JSON.stringify(commands('match_report')));
        // the two re-entry declines; welcomed by its own host, the seat may then withdraw them (willing again)
        const shape = declines().map((command) => (command.declined ? (command.unable ? 'unable' : 'declined') : 'withdrawn')).join(',');
        assert.match(shape, /^declined,declined(,withdrawn)?$/, `${label}: ${JSON.stringify(declines())}`);
        return;
      }
    }
    assert.equal(session.role, 'peer', `${label}: it follows the elected seat as a peer`);
    assert.equal(session.matchHost, null, `${label}: it booted no host`);
    assert.equal(cores.length, 0, `${label}: no fresh host at tick 0`);
    assert.deepEqual(commands('match_report'), [], `${label}: no loading reports for a running match, and none as a host`);
    assert.ok(declines().every((command) => command.declined === true && command.unable === undefined), JSON.stringify(declines()));
  } finally {
    clearInterval(pump);
    loaded?.();
    await session.leaveMatch('done').catch(() => {});
    session.dispose(); client.dispose();
    for (const core of cores) core.dispose();
  }
}

// `node matchSessionLoadingElection.selftest.mjs CF` runs only (C) and (F) (probing one ordering on an older tree)
const only = process.argv[2] ?? '';
const run = (label, running) => (!only || only.includes(label[1]) ? scenario(label, running) : null);
await run('(A) starting');
await run('(B) playing, next election before load', { record: 'playing', resumeTick: 1800, next: 'before_load' });
await run('(C) playing, loaded before the next election', { record: 'playing', resumeTick: 1800, next: 'after_load' });
await run('(D) playing record, election at tick 0', { record: 'playing', resumeTick: 0, next: 'after_load' });
await run('(E) starting record, election at countdown tick 120', { record: 'starting', resumeTick: 120, next: 'after_load' });
await run('(G) decline lost in a room-socket blip', { record: 'playing', resumeTick: 1800, next: 'before_load', blip: true });
await run('(F) kept: no election follows', { record: 'playing', resumeTick: 1800, next: 'none' });
if (!only || only.includes('H')) {
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, createTransport: () => scriptedTransport() });
  const session = new MatchSession({ room: client, clock: () => performance.now(), createPresentation: () => ({ adapter: new RecordingPresentation(8), dispose() {} }) });
  const view = { room: null, lastHostChanged: null, matchStart: null };
  for (const key of Object.keys(view)) Object.defineProperty(client, key, { get: () => view[key] });
  const record = (id, status) => ({ id, round: 1, mapId: 'verdant', seed: 7, startedAt: 2000, status, endedAt: null, verdict: null });
  const running = ({ entry = 'starting', current = 'starting', currentId = 'm1', tick = 0, electionFor = 'm1' } = {}) => {
    view.room = current === null ? null : { match: record(currentId, current) };
    view.matchStart = { matchId: electionFor };
    view.lastHostChanged = { hostId: 'me', generation: 2, resumeTick: tick, reason: 'timeout' };
    return session.matchRunning({ matchStart: { matchId: 'm1' }, room: { match: record('m1', entry) } });
  };
  assert.equal(running(), false, '(H) a starting match elected at tick 0 is fresh: the elected seat hosts it');
  assert.equal(running({ entry: 'playing', current: null }), true, '(H) the entry snapshot alone: a reload inside the host grace');
  assert.equal(running({ current: 'playing' }), true, '(H) the room\'s current record alone');
  assert.equal(running({ current: 'playing', currentId: 'm2' }), false, '(H) another match\'s record says nothing of this one');
  assert.equal(running({ tick: 120 }), true, '(H) the election\'s resume tick alone (the first host went in its countdown)');
  assert.equal(running({ tick: 120, electionFor: 'm2' }), false, '(H) an election held for another match says nothing of this one');
  session.dispose(); client.dispose();
}
console.log('matchSessionLoadingElection.selftest: a seat elected while it loads keeps the election and its secret, reports loading, and hosts once its world is ready; elected for a match already running (record playing or a resume tick), it declines at once and again when its world is ready if still named, says a decline lost in a blip again on admission, boots nothing, follows the next host as a peer, and boots at the room\'s generation only when no election follows');
