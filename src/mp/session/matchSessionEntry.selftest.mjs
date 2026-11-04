// Proof (implicit state machine audit M2, 2026-11-02): the round entry's sequence token.
// enterMatch takes a generation token and re-checks it after the presentation's await, but leaveMatch never moved it:
// a leave while the world loaded (the room closing, a failed entry, the player leaving) did not cancel the entry, and
// the session built a match client after it had already reported `lobby` (the browser's own presentation factory checks
// its abort; the headless one does not). And the duplicate match_start guard needed a match client: during loading a
// room-socket blip that resumed (the room re-sends match_start on every admission) tore the loading round down and
// loaded the world again; in the browser the first round then failed as superseded and the launch's waiter resolved
// false while the second load went on under the cover.
// Here, on the WebSocket path with a scripted room and match transport: (A) a leave during loading ends the entry;
// (B) the same match_start re-sent while loading keeps the one entry in flight.
import assert from 'node:assert/strict';
import { RoomClient } from '../room/roomClient.ts';
import { createRoom, joinRoom, serializeRoom } from '../room/roomPolicy.ts';
import { MatchSession } from './matchSession.ts';
import { RecordingPresentation } from '../presentation/adapter.ts';
import { Listeners } from '../transport/transport.ts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 5000) => {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(5); }
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
    send(frame) { try { outbound.push(JSON.parse(decoder.decode(frame))); } catch { outbound.push(frame); } return true; },
    reconnect() {}, close() { transport.state = 'closed'; states.emit({ state: 'closed', previous: 'open', reason: 'client' }); },
    onFrame: (listener) => frames.add(listener), onState: (listener) => states.add(listener),
    deliver(envelope) { frames.emit(encoder.encode(JSON.stringify(envelope))); },
    outbound,
  };
  return transport;
}

const roomCode = 'SESENT';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, team: null, now: 1001 });

async function seat() {
  let roomTransport = null;
  const matchTransports = [];
  const presentations = [];
  const loads = [];
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 60_000, createTransport: () => { roomTransport = scriptedTransport(); return roomTransport; } });
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    createTransport: () => { const transport = scriptedTransport(); matchTransports.push(transport); return transport; },
    // each world load waits for the receipt to finish it
    createPresentation: () => new Promise((resolve) => {
      loads.push(() => {
        const adapter = new RecordingPresentation(8);
        const presentation = { adapter, controls: null, prediction: null, disposed: false, dispose() { presentation.disposed = true; adapter.dispose(); } };
        presentations.push(presentation);
        resolve(presentation);
      });
    }),
  });
  session.start();
  const joining = client.join({ roomCode });
  await sleep(0);
  const request = roomTransport.outbound.find((envelope) => envelope.type === 'room_join');
  roomTransport.deliver({ type: 'room_joined', requestId: request.requestId, payload: { room: serializeRoom(room), playerId: 'me', seat: 0, chat: [] } });
  await joining;
  const matchStart = (matchId) => ({ type: 'match_start', payload: { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 'seat.token', matchUrl: `/rooms/${roomCode}/match`, expiresAt: Date.now() + 3_600_000 } });
  return { client, session, roomTransport, matchTransports, presentations, loads, matchStart };
}

// ---- (A) a leave while the world loads ends the entry: no match client after the lobby
{
  const { client, session, roomTransport, matchTransports, presentations, loads, matchStart } = await seat();
  const phases = [];
  session.onPhase(({ phase }) => phases.push(phase));
  roomTransport.deliver(matchStart('m1-0000aaaa'));
  await until(() => loads.length === 1, 'the world loads');
  assert.equal(session.phase, 'loading');
  await session.leaveMatch('garage');
  assert.equal(session.phase, 'lobby', 'setup: the leave reports the lobby');
  loads[0]();
  await sleep(20);
  assert.equal(session.match, null, 'no match client after the leave');
  assert.equal(matchTransports.length, 0, 'no match socket opened for a round that was left');
  assert.equal(session.phase, 'lobby', `the session stays in the lobby (${phases.join(' → ')})`);
  assert.equal(presentations[0].disposed, true, 'the late presentation is released');
  session.dispose(); client.dispose();
}

// ---- (B) the same match re-sent while the world loads (a room-socket blip resumed) keeps the one entry
{
  const { client, session, roomTransport, matchTransports, presentations, loads, matchStart } = await seat();
  const phases = [];
  session.onPhase(({ phase }) => phases.push(phase));
  roomTransport.deliver(matchStart('m2-0000bbbb'));
  await until(() => loads.length === 1, 'the world loads');
  roomTransport.deliver(matchStart('m2-0000bbbb'));
  await sleep(20);
  assert.equal(loads.length, 1, 'the re-sent match_start loads no second world');
  loads[0]();
  await until(() => session.phase === 'match', 'the round entered');
  assert.equal(matchTransports.length, 1, 'one match socket');
  assert.equal(presentations.filter((presentation) => presentation.disposed).length, 0, 'the presentation stands');
  assert.deepEqual(phases, ['loading', 'match'], 'one entry: loading, then the match');
  await session.leaveMatch('done');
  session.dispose(); client.dispose();
}
console.log('matchSessionEntry.selftest: a leave during loading ends the entry; a match_start re-sent while loading keeps the one entry');
