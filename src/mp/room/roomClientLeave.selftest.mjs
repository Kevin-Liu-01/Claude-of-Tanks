// Proof (implicit state machine audit M2, 2026-11-02): the room client's leave and disconnect.
// (A) leave() sent `room_leave` only while joined: a leave while the socket was reconnecting dropped the capability
//     locally and left a ghost seat in the room (reaped after 5 min while waiting, kept for a running match, an 8 s
//     host lease if it hosted). It now waits for the resume (bounded by the request timeout) and leaves on it; the
//     match the room re-sends on that admission does not reach the session owners of a seat that is leaving.
// (B) disconnect() kept the room snapshot, the match_start and the election in `idle`, so hostId / isHost read stale.
import assert from 'node:assert/strict';
import { RoomClient } from './roomClient.ts';
import { p2pMatchUrl } from './protocol.ts';
import { createRoom, serializeRoom } from './roomPolicy.ts';
import { Listeners } from '../transport/transport.ts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 3000) => {
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
    send(frame) { if (transport.state !== 'open') return false; outbound.push(JSON.parse(decoder.decode(frame))); return true; },
    reconnect() {}, close() { transport.state = 'closed'; states.emit({ state: 'closed', previous: 'open', reason: 'client' }); },
    onFrame: (listener) => frames.add(listener), onState: (listener) => states.add(listener),
    deliver(envelope) { frames.emit(encoder.encode(JSON.stringify(envelope))); },
    drop() { transport.state = 'reconnecting'; states.emit({ state: 'reconnecting', previous: 'open', reason: 'network', attempt: 1, retryDelayMs: 250 }); },
    back() { transport.state = 'open'; states.emit({ state: 'open', previous: 'reconnecting', attempt: 1, resumed: true }); },
    outbound,
  };
  return transport;
}
const roomCode = 'CLILEA';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant' }, now: 1000 });
const memory = () => { const map = new Map(); return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k), map }; };
async function joined() {
  let transport = null;
  const storage = memory();
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, storage, pingIntervalMs: 0, requestTimeoutMs: 2000, createTransport: () => { transport = scriptedTransport(); return transport; } });
  const joining = client.join({ roomCode });
  await sleep(0);
  const request = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: request.requestId, payload: { room: { ...serializeRoom(room), host: { transport: 'p2p', hostId: 'me', generation: 1, since: 0 } }, playerId: 'me', seat: 0, chat: [] } });
  await joining;
  return { client, transport: () => transport, storage };
}

// ---- (A) a leave while reconnecting leaves on the resumed socket
{
  const { client, transport, storage } = await joined();
  const starts = [];
  client.onMatchStart((payload) => starts.push(payload));
  transport().drop();
  assert.equal(client.phase, 'reconnecting');
  const leaving = client.leave();
  await sleep(10);
  transport().back();
  await until(() => transport().outbound.filter((envelope) => envelope.type === 'room_join').length === 2, 'the resume presents the capability');
  const resume = transport().outbound.filter((envelope) => envelope.type === 'room_join').at(-1);
  transport().deliver({ type: 'room_joined', requestId: resume.requestId, payload: { room: serializeRoom(room), playerId: 'me', seat: 0, chat: [] } });
  // the room re-sends the running match on the admission: not for a seat that is leaving
  transport().deliver({ type: 'match_start', payload: { matchId: 'm1-0000a0a0', round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 'x.y', matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'me', expiresAt: Date.now() + 3_600_000 } });
  await until(() => transport().outbound.some((envelope) => envelope.type === 'room_leave'), 'the leave reaches the room', 3000);
  const leave = transport().outbound.find((envelope) => envelope.type === 'room_leave');
  transport().deliver({ type: 'room_ack', requestId: leave.requestId, payload: { left: true } });
  await leaving;
  assert.equal(client.phase, 'closed');
  assert.equal(client.lastClosedReason, 'left_room');
  assert.equal(storage.map.size === 0 || [...storage.map.values()].every((value) => value == null || value === 'null'), true, 'the capability is forgotten');
  assert.deepEqual(starts, [], 'a leaving seat\'s owners hear no match_start');
  client.dispose();
}

// ---- (B) a disconnect leaves nothing of the room readable as current
{
  const { client, transport } = await joined();
  transport().deliver({ type: 'match_start', payload: { matchId: 'm2-0000b0b0', round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 'x.y', matchUrl: p2pMatchUrl(roomCode, 1), hostId: 'me', expiresAt: Date.now() + 3_600_000 } });
  transport().deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 0, reason: 'timeout', hostSecret: 'f'.repeat(64) } });
  assert.equal(client.isHost, true, 'setup: this seat hosts');
  client.disconnect('page hidden');
  assert.equal(client.phase, 'idle');
  assert.equal(client.hostId, null, 'no host is read from a dropped connection');
  assert.equal(client.isHost, false);
  assert.equal(client.matchStart, null);
  assert.equal(client.lastHostChanged, null);
  assert.equal(client.room, null);
  client.dispose();
}
// ---- (C) (round 2 U8) a client that left and is admitted again is no longer leaving: `leaving` was never reset, so a
// RoomClient reused for a fresh create or join after a leave dropped every match_start and host_changed of its new seat
{
  const { client, transport } = await joined();
  const starts = [];
  const changes = [];
  client.onMatchStart((payload) => starts.push(payload.matchId));
  client.onHostChanged((payload) => changes.push(payload.generation));
  const leaving = client.leave();
  await until(() => transport().outbound.some((envelope) => envelope.type === 'room_leave'), 'the leave reaches the room');
  transport().deliver({ type: 'room_ack', requestId: transport().outbound.find((envelope) => envelope.type === 'room_leave').requestId, payload: { left: true } });
  await leaving;
  assert.equal(client.phase, 'closed', 'setup: the seat left');
  const rejoining = client.join({ roomCode });
  await until(() => transport().outbound.some((envelope) => envelope.type === 'room_join'), 'the fresh join is sent');
  const request = transport().outbound.find((envelope) => envelope.type === 'room_join');
  transport().deliver({ type: 'room_joined', requestId: request.requestId, payload: { room: { ...serializeRoom(room), host: { transport: 'p2p', hostId: 'me', generation: 1, since: 0 } }, playerId: 'me', seat: 0, chat: [] } });
  await rejoining;
  transport().deliver({ type: 'match_start', payload: { matchId: 'm3-0000c0c0', round: 2, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 'x.y', matchUrl: p2pMatchUrl(roomCode, 2), hostId: 'me', expiresAt: Date.now() + 3_600_000 } });
  transport().deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 0, reason: 'timeout', hostSecret: 'f'.repeat(64) } });
  assert.deepEqual(starts, ['m3-0000c0c0'], `the new seat's owners hear its match_start (${JSON.stringify(starts)})`);
  assert.deepEqual(changes, [2], 'and its elections');
  client.dispose();
}
console.log('roomClientLeave.selftest: a leave while reconnecting leaves on the resumed socket; a disconnect keeps no stale room, match or election; a client admitted again after a leave hears its new seat');
