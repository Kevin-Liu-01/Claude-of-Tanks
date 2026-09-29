// RoomClient, the peer-to-peer plumbing (P2 client lane, 2026-09-28) over a scripted room socket: `sendSignal` refuses
// what the room would (not joined, malformed, over ROOM_SIGNAL_MAX_BYTES) and sends the rest as `room_signal`; a relayed
// signal addressed to this seat is delivered with `from`, one addressed elsewhere is ignored; `match_start` with an
// rtc:// URL names the host and the generation; `host_changed` overrides both and `isHost` follows; a new match or the
// match's end clears the election; the report and decline commands are room commands.
import assert from 'node:assert/strict';
import { RoomClient } from './roomClient.ts';
import { ROOM_SIGNAL_MAX_BYTES, p2pMatchUrl } from './protocol.ts';
import { createRoom, serializeRoom, joinRoom } from './roomPolicy.ts';
import { Listeners } from '../transport/transport.ts';

// ------------------------------------------------------------ a scripted room socket (the v2 transport contract)
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
    /** The room speaks. */
    deliver(envelope) { frames.emit(encoder.encode(JSON.stringify(envelope))); },
    outbound,
  };
  return transport;
}

const room = createRoom({ roomCode: 'ABC123', mode: 'lan', creator: { id: 'alice', name: 'Alice' }, selection: { specId: 'm1a2' }, settings: { teamSize: 2 }, now: 1000 });
joinRoom(room, { player: { id: 'bob', name: 'Bob' }, selection: { specId: 't90m' }, team: null, now: 1001 });
let transport = null;
const client = new RoomClient({
  endpoint: 'ws://rooms.test', player: { id: 'bob', name: 'Bob' }, pingIntervalMs: 0, requestTimeoutMs: 1000,
  createTransport: () => { transport = scriptedTransport(); return transport; },
  setTimer: (callback, delayMs) => setTimeout(callback, delayMs), clearTimer: (handle) => clearTimeout(handle),
});
const signals = [];
const elections = [];
client.onSignal((signal) => signals.push(signal));
client.onHostChanged((change) => elections.push(change));

// ---- not joined: nothing leaves
assert.equal(client.sendSignal({ to: 'alice', generation: 1, kind: 'offer', sdp: 'v=0' }), false, 'a signal before admission is refused');
assert.equal(client.hostId, null);
assert.equal(client.generation, 0);
assert.equal(client.isHost, false);

// ---- join through the scripted room
const joining = client.join({ roomCode: 'ABC123', selection: { specId: 't90m' } });
await new Promise((resolve) => setTimeout(resolve, 0));
const joinRequest = transport.outbound.find((envelope) => envelope.type === 'room_join');
assert.ok(joinRequest, 'the join request left');
transport.deliver({ type: 'room_joined', requestId: joinRequest.requestId, payload: { room: serializeRoom(room), playerId: 'bob', seat: 1, chat: [], region: 'lan' } });
await joining;
assert.equal(client.phase, 'joined');
assert.equal(client.hostId, null, 'no host before a match (the room record has none)');

// ---- sendSignal: the room's own checks applied client-side
assert.equal(client.sendSignal({ to: 'alice', generation: 1, kind: 'offer', sdp: 'v=0 offer' }), true);
assert.equal(client.sendSignal({ to: 'alice', generation: 1, kind: 'candidate', candidate: { candidate: 'candidate:1 1 udp 1 127.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } }), true);
assert.equal(client.sendSignal({ to: 'alice', generation: 1, kind: 'offer' }), true, 'the room never parses SDP: an offer without sdp is a valid payload (P1)');
assert.equal(client.sendSignal({ to: 'not a valid id!', generation: 1, kind: 'offer', sdp: 'x' }), false, 'an invalid target id is malformed');
assert.equal(client.sendSignal({ to: 'alice', generation: 1, kind: 'candidate', candidate: { candidate: 'c', sdpMid: 5, sdpMLineIndex: 0 } }), false, 'a malformed candidate record');
assert.equal(client.sendSignal({ to: 'alice', generation: 1, kind: 'offer', sdp: 'x'.repeat(ROOM_SIGNAL_MAX_BYTES) }), false, 'an oversized signal never leaves');
const sent = transport.outbound.filter((envelope) => envelope.type === 'room_signal');
assert.equal(sent.length, 3, 'three signals left as room_signal envelopes');
assert.equal(sent[0].requestId, undefined, 'signals are fire-and-forget (no request id)');
assert.deepEqual(sent[0].payload, { to: 'alice', generation: 1, kind: 'offer', sdp: 'v=0 offer' });
assert.equal(client.stats().signalsSent, 3);
assert.equal(client.stats().signalsRefused, 4, 'the pre-admission refusal and the three malformed ones are counted');

// ---- inbound relay: addressed to me → delivered with from; addressed elsewhere or malformed → ignored
transport.deliver({ type: 'room_signal', payload: { to: 'bob', from: 'alice', generation: 1, kind: 'answer', sdp: 'v=0 answer' } });
transport.deliver({ type: 'room_signal', payload: { to: 'carol', from: 'alice', generation: 1, kind: 'answer', sdp: 'v=0 answer' } });
transport.deliver({ type: 'room_signal', payload: { to: 'bob', generation: 1, kind: 'answer', sdp: 'no from' } });
transport.deliver({ type: 'room_signal', payload: { to: 'bob', from: 'alice', generation: 1, kind: 'candidate', candidate: { candidate: 'c', sdpMid: null, sdpMLineIndex: null } } });
assert.equal(signals.length, 2, 'only the two well-formed signals addressed to this seat arrive');
assert.equal(signals[0].from, 'alice');
assert.equal(signals[0].sdp, 'v=0 answer');
assert.equal(signals[1].kind, 'candidate');
assert.equal(client.stats().signalsReceived, 2);

// ---- match_start with an rtc:// URL names the host and the generation
const starts = [];
client.onMatchStart((payload) => starts.push(payload));
transport.deliver({ type: 'match_start', payload: {
  matchId: 'm1-0001', round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 1, team: 'bravo', seatToken: 'tok.sig',
  matchUrl: p2pMatchUrl('ABC123', 3), hostId: 'alice', expiresAt: 9_999_999,
} });
assert.equal(starts.length, 1);
assert.equal(client.hostId, 'alice');
assert.equal(client.generation, 3, 'the generation comes from the rtc:// URL');
assert.equal(client.isHost, false);
assert.equal(client.lastHostChanged, null);

// ---- host_changed overrides host and generation; this seat elected → isHost; the secret rides along
transport.deliver({ type: 'host_changed', payload: { hostId: 'bob', generation: 4, resumeTick: 1200, reason: 'timeout', hostSecret: 'a'.repeat(64) } });
assert.equal(elections.length, 1);
assert.equal(elections[0].resumeTick, 1200);
assert.equal(elections[0].hostSecret, 'a'.repeat(64));
assert.equal(client.hostId, 'bob');
assert.equal(client.generation, 4);
assert.equal(client.isHost, true);
transport.deliver({ type: 'host_changed', payload: { hostId: 'bob', generation: 'four', resumeTick: 1, reason: 'left' } });
transport.deliver({ type: 'host_changed', payload: { hostId: 'bob', generation: 5, resumeTick: 1, reason: 'because' } });
transport.deliver({ type: 'host_changed', payload: { hostId: 'alice', generation: 3, resumeTick: 1, reason: 'timeout' } });
assert.equal(elections.length, 1, 'malformed and stale-generation elections are ignored');
assert.equal(client.hostId, 'bob', 'the stale election did not move the host');
transport.deliver({ type: 'room_signal', payload: { to: 'bob', from: 'alice', generation: 3, kind: 'candidate', candidate: { candidate: 'c', sdpMid: null, sdpMLineIndex: null } } });
assert.equal(signals.length, 2, 'a signal for an older generation is dropped');
assert.equal(client.sendSignal({ to: 'alice', generation: 3, kind: 'offer', sdp: 'v=0' }), false, 'and never sent');

// ---- the report and the decline are room commands (acknowledged by the scripted room)
const reporting = client.reportMatch({ matchId: 'm1-0001', generation: 4, tick: 1300, phase: 'playing' });
await new Promise((resolve) => setTimeout(resolve, 0));
const report = transport.outbound.findLast((envelope) => envelope.type === 'room_command');
assert.deepEqual(report.payload.command, { type: 'match_report', matchId: 'm1-0001', generation: 4, tick: 1300, phase: 'playing' });
transport.deliver({ type: 'room_ack', requestId: report.requestId, payload: { ok: true } });
await reporting;
const declining = client.declineHost(true);
await new Promise((resolve) => setTimeout(resolve, 0));
const decline = transport.outbound.findLast((envelope) => envelope.type === 'room_command');
assert.deepEqual(decline.payload.command, { type: 'host_decline', declined: true });
transport.deliver({ type: 'room_ack', requestId: decline.requestId, payload: { ok: true } });
await declining;

// ---- the match's end clears the election and the match_start; a new match starts from its own URL
transport.deliver({ type: 'match_status', payload: { matchId: 'm1-0001', round: 1, status: 'ended', verdict: { result: 'alpha', reason: 'elimination' } } });
assert.equal(client.lastHostChanged, null);
assert.equal(client.matchStart, null);
assert.equal(client.hostId, null);
transport.deliver({ type: 'match_start', payload: {
  matchId: 'm2-0002', round: 2, mapId: 'verdant', mode: 'standard', seed: 8, seat: 1, team: 'bravo', seatToken: 'tok2.sig',
  matchUrl: p2pMatchUrl('ABC123', 6), hostId: 'alice', expiresAt: 9_999_999,
} });
assert.equal(client.generation, 6);
assert.equal(client.hostId, 'alice');
// a service-hosted match keeps ws:// and names no host
transport.deliver({ type: 'match_start', payload: {
  matchId: 'm3-0003', round: 3, mapId: 'verdant', mode: 'standard', seed: 9, seat: 1, team: 'bravo', seatToken: 'tok3.sig',
  matchUrl: '/match', expiresAt: 9_999_999,
} });
assert.equal(client.hostId, null);
assert.equal(client.generation, 0);

// ---- the same match re-sent after a socket blip (P3, 2026-09-28): a NEWER generation in its URL supersedes the election this
// seat holds (it missed the host_changed while away); an older or equal one keeps the election
transport.deliver({ type: 'match_start', payload: {
  matchId: 'm4-0004', round: 4, mapId: 'verdant', mode: 'standard', seed: 10, seat: 1, team: 'bravo', seatToken: 'tok4.sig',
  matchUrl: p2pMatchUrl('ABC123', 7), hostId: 'alice', expiresAt: 9_999_999,
} });
transport.deliver({ type: 'host_changed', payload: { hostId: 'bob', generation: 8, resumeTick: 100, reason: 'timeout', hostSecret: 'b'.repeat(64) } });
assert.equal(client.generation, 8);
assert.equal(client.isHost, true);
transport.deliver({ type: 'match_start', payload: {
  matchId: 'm4-0004', round: 4, mapId: 'verdant', mode: 'standard', seed: 10, seat: 1, team: 'bravo', seatToken: 'tok4.sig',
  matchUrl: p2pMatchUrl('ABC123', 9), hostId: 'carol', expiresAt: 9_999_999,
} });
assert.equal(client.generation, 9, "the re-sent match_start's newer generation is the current one");
assert.equal(client.hostId, 'carol', 'and its host');
assert.equal(client.isHost, false, 'this seat was replaced while away');
assert.equal(client.lastHostChanged, null, 'the stale election is gone');
transport.deliver({ type: 'host_changed', payload: { hostId: 'bob', generation: 10, resumeTick: 200, reason: 'timeout', hostSecret: 'c'.repeat(64) } });
transport.deliver({ type: 'match_start', payload: {
  matchId: 'm4-0004', round: 4, mapId: 'verdant', mode: 'standard', seed: 10, seat: 1, team: 'bravo', seatToken: 'tok4.sig',
  matchUrl: p2pMatchUrl('ABC123', 10), hostId: 'bob', expiresAt: 9_999_999,
} });
assert.equal(client.generation, 10, 'an equal generation keeps the election');
assert.equal(client.isHost, true);
client.dispose();
console.log('roomClientSignals.selftest: signal relay, host elections, generations, a re-sent match_start superseding a stale election, report and decline commands verified');
