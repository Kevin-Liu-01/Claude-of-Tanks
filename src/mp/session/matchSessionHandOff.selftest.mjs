// Plan step 11 (2026-10-13, the MP stream; MU.07): a hosting tab that closes, reloads or navigates away hands its match
// on at once. The room used to wait out the socket lease for a vanished host (the e2e of 2026-10-13: 10 s to
// `host_absent`, 13.75 s from the close to the new host's first report). On pagehide the hosting seat now sends
// `host_decline` (unable) inside the event, synchronously, and the room elects the next seat at once (its 'declined'
// path, roomActor.selftest). This receipt drives the real MatchSession hosting through the in-process host against a
// scripted room socket: the decline leaves before anything is awaited, once; leaving afterwards does not decline again;
// a peer and a seat in the lobby send nothing.
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

const watchdog = setTimeout(() => { console.error('matchSessionHandOff.selftest: stuck'); process.exit(1); }, 60_000);
watchdog.unref();
const memoryGuard = setInterval(() => { if (process.memoryUsage().rss > 1.5e9) { console.error('matchSessionHandOff.selftest: RSS past 1.5 GB'); process.exit(1); } }, 200);
memoryGuard.unref();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 10_000) => { const started = Date.now(); while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(10); } };

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
const SEAT_SECRET = 'hand-off-seat-secret-0123456789abcdef0123';
const room = createRoom({ roomCode: 'HANDOF', mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90m' }, team: null, now: 1001 });
const snapshotWith = (host) => ({ ...serializeRoom(room), host });
const world = new RtcWorld();
const cores = [];

async function seat() {
  let transport = null;
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 2000, createTransport: () => { transport = scriptedTransport(); return transport; } });
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: () => { const presentation = new RecordingPresentation(16); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }), manifestBase: null, tier: 'desktop', countdownS: 1, entryReportIntervalMs: 50 },
  });
  session.start();
  const joining = client.join({ roomCode: 'HANDOF' });
  await sleep(0);
  const request = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: request.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }), playerId: 'me', seat: 0, chat: [] } });
  await joining;
  return { client, session, transport };
}
let counter = 0;
function start(transport, hostId) {
  const matchId = `m${++counter}-0000f${counter}f0`;
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const token = signSeatToken(hostSecret, { v: 1, roomId: 'HANDOF', seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a2', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId, generation: 1, since: 2000 }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round: counter, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: token, matchUrl: p2pMatchUrl('HANDOF', 1), hostId, ...(hostId === 'me' ? { hostSecret } : {}), expiresAt: Date.now() + 3_600_000 } });
}
const declinesOf = (transport) => transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'host_decline').map((envelope) => envelope.payload.command);

// ---- the hosting seat: the decline leaves inside the call, once
{
  const { client, session, transport } = await seat();
  assert.equal(session.handOffHosting('pagehide'), false, 'nothing to hand on in the lobby');
  start(transport, 'me');
  await until(() => session.matchHost?.state === 'live', 'the host live');
  const before = declinesOf(transport).length;
  assert.equal(session.handOffHosting('pagehide'), true);
  const sent = declinesOf(transport);
  assert.equal(sent.length, before + 1, 'sent synchronously: on the socket before anything is awaited');
  assert.deepEqual(sent.at(-1), { type: 'host_decline', declined: true, unable: true }, 'unable: the room elects the next seat at once, or ends the match if none can host');
  assert.equal(session.handOffHosting('pagehide'), false, 'once');
  await session.leaveMatch('page gone');
  assert.equal(declinesOf(transport).length, before + 1, 'leaving afterwards does not decline again');
  session.dispose(); client.dispose();
}

// ---- a peer sends nothing
{
  const { client, session, transport } = await seat();
  start(transport, 'other');
  await until(() => session.phase === 'match', 'the peer entered');
  assert.equal(session.handOffHosting('pagehide'), false);
  assert.equal(declinesOf(transport).length, 0);
  session.dispose(); client.dispose();
}
for (const core of cores) core.dispose();
await sleep(50);
assert.ok(cores.every((core) => !core.actor || core.actor.stopped), 'no actor outlives its core');
console.log('matchSessionHandOff.selftest: a hosting tab going away sends host_decline (unable) synchronously, once; leaving afterwards adds nothing; a peer and the lobby send nothing');
