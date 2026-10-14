// Host choice by headroom (2026-10-13, the MP stream; plan step 10). A p2p match's packets all cross the host tab's main
// thread, and the room elects the admin (else the senior willing commander) without knowing how each tab runs. A tab
// whose display frames run slow while it waits in the room now declines to host as a preference (the room names a
// willing seat, keeps this one as the last resort) and offers again once it recovers. This receipt checks the monitor's
// verdicts and hysteresis, and the real MatchSession against a scripted room socket: the decline and its withdrawal in
// the room, nothing during a match, nothing from a seat that cannot host, nothing with the option off.
import assert from 'node:assert/strict';
import { RoomClient } from '../room/roomClient.ts';
import { createRoom, joinRoom, serializeRoom } from '../room/roomPolicy.ts';
import { MatchSession } from './matchSession.ts';
import { createHostHeadroomMonitor } from './hostHeadroom.ts';
import { RecordingPresentation } from '../presentation/adapter.ts';
import { Listeners } from '../transport/transport.ts';
import { RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createInProcessHostPort } from '../host/inProcessHost.ts';

const watchdog = setTimeout(() => { console.error('hostHeadroom.selftest: stuck'); process.exit(1); }, 60_000);
watchdog.unref();
const memoryGuard = setInterval(() => { if (process.memoryUsage().rss > 1.5e9) { console.error('hostHeadroom.selftest: RSS past 1.5 GB'); process.exit(1); } }, 200);
memoryGuard.unref();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const feed = (target, frameMs, frames) => { let changed = 0; for (let n = 0; n < frames; n++) changed += target(frameMs) ? 1 : 0; return changed; };

// ---- the monitor
{
  const monitor = createHostHeadroomMonitor();
  assert.equal(feed((ms) => monitor.frame(ms), 16.7, 600), 0, '60 fps is never weak');
  assert.equal(monitor.weak, false);
  assert.ok(Math.abs(monitor.p50FrameMs - 16.7) < 1e-9);
  feed((ms) => monitor.frame(ms), 50, 100);
  assert.equal(monitor.weak, false, 'a dip under half the window does not decide (the p50 of four seconds)');
  feed((ms) => monitor.frame(ms), 50, 240);
  assert.equal(monitor.weak, true, '20 fps for four seconds is weak');
  feed((ms) => monitor.frame(ms), 28.6, 600);
  assert.equal(monitor.weak, true, '35 fps stays weak: the hysteresis band between 25 and 33 ms');
  feed((ms) => monitor.frame(ms), 5000, 600);
  assert.equal(monitor.weak, true, 'hidden-tab frames (past 500 ms) are no measure');
  feed((ms) => monitor.frame(ms), 22, 600);
  assert.equal(monitor.weak, false, '45 fps recovers');
  assert.throws(() => createHostHeadroomMonitor({ weakFrameMs: 20, recoverFrameMs: 25 }), /recoverFrameMs/);
}

// ---- the session in a room
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
const room = createRoom({ roomCode: 'HEADRM', mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90m' }, team: null, now: 1001 });
const world = new RtcWorld();
const cores = [];

async function seat(p2p = {}) {
  let transport = null;
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 2000, createTransport: () => { transport = scriptedTransport(); return transport; } });
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: () => { const presentation = new RecordingPresentation(8); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core) }), manifestBase: null, tier: 'desktop', countdownS: 1, ...p2p },
  });
  session.start();
  const joining = client.join({ roomCode: 'HEADRM' });
  await sleep(0);
  const request = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: request.requestId, payload: { room: { ...serializeRoom(room), host: { transport: 'p2p', hostId: null, generation: 0, since: 0 } }, playerId: 'me', seat: 0, chat: [] } });
  await joining;
  return { client, session, transport };
}
const declinesOf = (transport) => transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'host_decline').map((envelope) => envelope.payload.command);

{
  const { client, session, transport } = await seat();
  session.observeFrame(16.7);
  feed((ms) => session.observeFrame(ms), 16.7, 600);
  assert.equal(declinesOf(transport).length, 0, 'a fast tab never declines');
  feed((ms) => session.observeFrame(ms), 50, 480);
  await sleep(0);
  assert.deepEqual(declinesOf(transport), [{ type: 'host_decline', declined: true }], 'a slow tab declines as a preference (not unable: the room keeps it as the last resort)');
  assert.equal(session.hostHeadroom.declined, true);
  feed((ms) => session.observeFrame(ms), 50, 600);
  assert.equal(declinesOf(transport).length, 1, 'once');
  feed((ms) => session.observeFrame(ms), 16.7, 600);
  await sleep(0);
  assert.deepEqual(declinesOf(transport).at(-1), { type: 'host_decline', declined: false }, 'recovered, it offers again');
  assert.equal(session.hostHeadroom.declined, false);
  session.dispose(); client.dispose();
}

// ---- during a match nothing is sent (a hosting seat's decline would hand the match on mid-battle)
{
  const { client, session, transport } = await seat();
  transport.deliver({ type: 'room_state', payload: { room: { ...serializeRoom(room), host: { transport: 'p2p', hostId: 'other', generation: 1, since: 2000 } } } });
  transport.deliver({ type: 'match_start', payload: { matchId: 'm1-0000a0a0', round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: 'x.y', matchUrl: 'rtc://HEADRM/1', hostId: 'other', expiresAt: Date.now() + 3_600_000 } });
  const started = Date.now();
  while (session.phase !== 'match' && Date.now() - started < 5000) await sleep(10);
  assert.equal(session.phase, 'match');
  feed((ms) => session.observeFrame(ms), 50, 600);
  await sleep(0);
  assert.equal(declinesOf(transport).length, 0, 'no decline during a match');
  session.dispose(); client.dispose();
}

// ---- a seat that cannot host, and the option off
{
  const mobile = await seat({ tier: 'mobile' });
  const before = declinesOf(mobile.transport).length; // the mobile tier's own 'unable' decline on join
  feed((ms) => mobile.session.observeFrame(ms), 50, 600);
  await sleep(0);
  assert.equal(declinesOf(mobile.transport).length, before, 'a seat that cannot host sends no headroom decline');
  assert.equal(mobile.session.hostHeadroom, null);
  mobile.session.dispose(); mobile.client.dispose();
  const off = await seat({ hostHeadroom: false });
  feed((ms) => off.session.observeFrame(ms), 50, 600);
  await sleep(0);
  assert.equal(declinesOf(off.transport).length, 0, 'the option off: no decline');
  off.session.dispose(); off.client.dispose();
}
for (const core of cores) core.dispose();
console.log('hostHeadroom.selftest: a tab under 30 fps (p50 of 4 s) declines to host while it waits in the room and offers again over 40 fps; never during a match, never from a seat that cannot host, nothing with the option off');
