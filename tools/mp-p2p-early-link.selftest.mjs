// The early peer link (2026-10-20, item/mp-rejoin-229; MP-228-REJOIN lever 1) against the real rooms service and the
// in-process host: a seat re-entering a match that is already playing on another seat's host opens its WebRTC link
// beside its presentation's world load, and says hello only once the presentation is ready. On the 227 rejoins the link
// stayed idle until the world was built (15.5 s), then took 7.4 s to open, and the roster stage waited for the WELCOME.
//   - a starting match keeps the late link: the seat's link begins only after its presentation (its host boots after its
//     own world, so early offers would go unanswered);
//   - a re-entry into the running match: the link is open before the presentation resolves, no frame (no HELLO) leaves
//     before it, the WELCOME follows the presentation within one round trip, and one offer made the link;
//   - an entry abandoned during its load (the Garage return) closes its early link at once;
//   - a host whose HELLO window closes the early link (a window shorter than the load) still welcomes the seat: the link
//     re-links by itself and the HELLO goes out on the new one.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createRoomsServer } from '../server/rooms/serve.ts';
import { silentLogger } from '../server/match/log.ts';
import { memoryStorage, scriptedControls } from '../src/mp/session/headlessSession.ts';
import { RoomClient } from '../src/mp/room/roomClient.ts';
import { MatchSession } from '../src/mp/session/matchSession.ts';
import { RecordingPresentation } from '../src/mp/presentation/adapter.ts';
import { createInProcessHostPort } from '../src/mp/host/inProcessHost.ts';
import { RtcWorld } from '../src/mp/transport/rtcDouble.test-support.ts';

const SECRET = 'mp-p2p-early-link-seat-secret-0123456789abcdef';
const LOAD_MS = 1500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs, describe = () => '') => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}${describe() ? ` — ${describe()}` : ''}`);
    await sleep(10);
  }
};
let stage = 'setup';
const watchdog = setTimeout(() => { console.error(`mp-p2p-early-link.selftest: stuck at ${stage}`); process.exit(1); }, 400_000);
watchdog.unref();

const server = await createRoomsServer({ host: '127.0.0.1', port: 0, seatSecret: SECRET, world: 'terrain', matchTransport: 'p2p', countdownS: 1, log: silentLogger });
const rtc = new RtcWorld();
const cores = [];
const seats = [];
let ticking = true;
const ticker = (async () => {
  let last = performance.now();
  while (ticking) {
    const now = performance.now();
    const elapsedS = Math.min(0.25, (now - last) / 1000);
    last = now;
    rtc.flush();
    for (const seat of seats) if (!seat.disposed) seat.session.update(now, elapsedS);
    rtc.flush();
    await sleep(1000 / 60);
  }
})();

/** A seat whose presentation takes `loadMs` (its world load) and rejects once `abandon()` ran (the composition's abort). */
function spawn(id, index, host = {}) {
  const seat = { id, loadMs: 0, abandoned: false, rounds: [], events: [], disposed: false, room: null, session: null };
  const clock = () => performance.now();
  const createSocket = (url) => new WebSocket(url);
  seat.room = new RoomClient({ endpoint: server.url, player: { id, name: id }, storage: memoryStorage(), clock, clientBuild: 'headless', transport: { createSocket } });
  seat.session = new MatchSession({
    room: seat.room, clock, clientBuild: 'headless', transport: { createSocket },
    createPresentation: async (round) => {
      const entry = { startedAt: performance.now(), resolvedAt: null };
      seat.rounds.push(entry);
      seat.abandoned = false;
      for (let waited = 0; waited < seat.loadMs; waited += 20) {
        if (seat.abandoned) throw new Error('round superseded: abandoned');
        await sleep(20);
      }
      if (seat.abandoned) throw new Error('round superseded: abandoned');
      const presentation = new RecordingPresentation(64);
      entry.resolvedAt = performance.now();
      return { adapter: presentation, controls: round.spectator ? null : scriptedControls(index), prediction: null, dispose: () => presentation.dispose() };
    },
    p2p: {
      createPeerConnection: rtc.createPeerConnection,
      createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push({ id, core }), keyframeIntervalMs: 500, reportIntervalMs: 1000, ...host }),
      manifestBase: null, tier: 'desktop', countdownS: 1,
    },
  });
  seat.session.onP2p((event) => seat.events.push({ ...event, at: performance.now() }));
  seat.session.start();
  seats.push(seat);
  return seat;
}

/** Two seats in a fresh room, the match started and playing; returns [host, peer]. */
async function playingRoom(prefix, host = {}) {
  const a = spawn(`${prefix}1`, 0, host);
  const b = spawn(`${prefix}2`, 1, host);
  // the starting match's entry takes a load too: its link must still wait for it
  a.loadMs = 300; b.loadMs = 300;
  const room = await a.room.create({ mode: 'lan', selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false } });
  await a.room.setTeam('bravo');
  await b.room.join({ roomCode: room.roomCode, selection: { specId: 't90am' }, team: 'alpha' });
  await until(() => a.room.room?.players.length === 2, 'two seats', 10_000);
  await Promise.all([a, b].map((seat) => seat.room.setReady(true)));
  await until(() => a.room.room?.players.every((player) => player.ready), 'both ready', 10_000);
  await a.room.start();
  await until(() => a.session.match?.welcome && b.session.match?.welcome, 'both welcomed', 30_000);
  const hostSeat = a.session.role === 'host' ? a : b;
  const peer = hostSeat === a ? b : a;
  assert.equal(peer.session.role, 'peer');
  await until(() => peer.room.room?.match?.status === 'playing', 'the match playing', 15_000, () => JSON.stringify(peer.room.room?.match));
  return [hostSeat, peer];
}

const linkOf = (seat) => seat.session.stats().p2p?.link ?? null;
const peerTransportOf = (seat) => seat.session.peerTransport;

try {
  // ---- a starting match keeps the late link; a re-entry into the running match opens it beside the load
  stage = 'room 1';
  const [host, peer] = await playingRoom('e');
  const firstRole = peer.events.find((event) => event.kind === 'role' && event.role === 'peer');
  assert.ok(firstRole && firstRole.at >= peer.rounds[0].resolvedAt, `the starting match's link began after the presentation (${Math.round(firstRole?.at - peer.rounds[0].resolvedAt)} ms)`);

  stage = 're-entry';
  await peer.session.leaveMatch('returned_to_garage');
  await sleep(200);
  peer.loadMs = LOAD_MS;
  peer.events.length = 0;
  const enteredAt = performance.now();
  const entering = peer.session.enterMatch(peer.room.matchStart);
  await until(() => typeof linkOf(peer)?.openAtMs === 'number', 'the early link open', LOAD_MS + 5_000, () => JSON.stringify(linkOf(peer)));
  const round = peer.rounds.at(-1);
  assert.equal(round.resolvedAt, null, 'the link opened while the presentation was still loading');
  assert.equal(peerTransportOf(peer).stats.framesSent, 0, 'no HELLO before the presentation');
  const openedAfterMs = linkOf(peer).openAtMs - enteredAt;
  await entering;
  await until(() => !!peer.session.match?.welcome, 'the re-entered seat welcomed', 10_000);
  const welcomedAt = performance.now();
  assert.ok(round.resolvedAt !== null);
  const welcomeAfterLoadMs = welcomedAt - round.resolvedAt;
  assert.ok(welcomeAfterLoadMs < 1000, `the WELCOME followed the presentation within a round trip (${Math.round(welcomeAfterLoadMs)} ms)`);
  assert.equal(peerTransportOf(peer).signalStats.sent, 1, 'one offer made the link');
  assert.equal(peer.session.stats().p2p.hostId, host.id);
  assert.notEqual(peer.session.phase, 'lost');
  await until(() => peer.session.match?.phase === 'live', 'the re-entered seat live', 10_000);

  // ---- an entry abandoned during its load closes its early link at once
  stage = 'abandon';
  await peer.session.leaveMatch('returned_to_garage');
  peer.loadMs = LOAD_MS;
  const abandoning = peer.session.enterMatch(peer.room.matchStart).catch((error) => error);
  await until(() => !!peerTransportOf(peer) && peerTransportOf(peer).state !== 'idle', 'the early link started', 5_000);
  const early = peerTransportOf(peer);
  peer.abandoned = true;
  await peer.session.leaveMatch('returned_to_garage');
  assert.equal(early.state, 'closed', 'the leave closed the early link');
  const abandoned = await abandoning;
  assert.ok(abandoned instanceof Error && /superseded/.test(abandoned.message), `the abandoned entry ended (${abandoned?.message})`);
  assert.equal(peer.session.phase, 'lobby');
  assert.equal(peer.session.peerTransport, null);
  peer.abandoned = false;

  // ---- a host whose HELLO window is shorter than the load closes the early link; the seat is still welcomed
  stage = 'room 2';
  const [shortHost, shortPeer] = await playingRoom('s', { helloTimeoutMs: 400 });
  await shortPeer.session.leaveMatch('returned_to_garage');
  await sleep(200);
  shortPeer.loadMs = LOAD_MS;
  await shortPeer.session.enterMatch(shortPeer.room.matchStart);
  await until(() => !!shortPeer.session.match?.welcome, 'welcomed after its early link was closed', 15_000, () => JSON.stringify({ link: linkOf(shortPeer), state: peerTransportOf(shortPeer)?.state, match: shortPeer.session.match?.stats() }));
  const relinks = peerTransportOf(shortPeer).stats.reconnects;
  assert.ok(relinks >= 1, `the host's window closed the early link and it re-linked (${relinks})`);
  await until(() => shortPeer.session.match?.phase === 'live', 'live on the short host', 10_000);
  assert.notEqual(shortPeer.session.phase, 'lost');

  console.log(`mp-p2p-early-link.selftest: a starting match links after its load; a re-entry's link opened ${Math.round(openedAfterMs)} ms into a ${LOAD_MS} ms load with no frame sent, the WELCOME ${Math.round(welcomeAfterLoadMs)} ms after the load on one offer; an abandoned entry closed its early link; a ${400} ms HELLO window closed one (${relinks} re-link) and the seat was still welcomed`);
} finally {
  ticking = false;
  await ticker;
  for (const seat of seats) if (!seat.disposed) { seat.disposed = true; seat.session.dispose(); seat.room.dispose(); }
  for (const { core } of cores) core.dispose();
  await Promise.race([server.close(), sleep(5000)]);
}
