// A solo battle through the in-page room (inPageRoom.ts; RUST-ENGINE-DECISION §7 step 5): the real RoomClient creates a
// LAN room on the page's own RoomActor (no network: the socket factory), picks a tank and readies; the actor names the
// only seat host of a p2p match with the room's bots filling 7 a side, signs its seat token with the page's synchronous
// HMAC; the real MatchSession boots the host (the in-process core standing in for the Worker), whose check of that token
// passes; the seat is welcomed through the loopback and the presentation receives the match's frames. A route the room
// does not serve fails the socket; the countdown holds until the page releases it (its reveal); the solo pause holds the
// actor's tick and the client's clock; a solo room seats 21 a side where any other stops at 14; closing the service
// drains it.
import assert from 'node:assert/strict';
import { RoomClient } from './roomClient.ts';
import { createRoom } from './roomPolicy.ts';
import { IN_PAGE_ROOM_ENDPOINT, createInPageRoomService } from './inPageRoom.ts';
import { MatchSession } from '../session/matchSession.ts';
import { RecordingPresentation } from '../presentation/adapter.ts';
import { RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createInProcessHostPort } from '../host/inProcessHost.ts';

const watchdog = setTimeout(() => { console.error('inPageRoom.selftest: stuck'); process.exit(1); }, 90_000);
watchdog.unref();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 30_000) => {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(10); }
};

const service = createInPageRoomService();

// a route the room does not serve
{
  const socket = service.createSocket(`${IN_PAGE_ROOM_ENDPOINT}/nowhere`);
  const closed = await new Promise((resolve) => socket.addEventListener('close', resolve));
  assert.equal(closed.reason, 'invalid_room_route');
}

const world = new RtcWorld();
const cores = [];
const rounds = [];
const client = new RoomClient({
  endpoint: IN_PAGE_ROOM_ENDPOINT, player: { id: 'solo', name: 'Solo' }, pingIntervalMs: 0, requestTimeoutMs: 5000,
  transport: { createSocket: service.createSocket },
});
const session = new MatchSession({
  room: client, clock: () => performance.now(),
  createPresentation: (round) => {
    const presentation = new RecordingPresentation(64);
    rounds.push({ round, presentation });
    return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() };
  },
  p2p: {
    createPeerConnection: world.createPeerConnection,
    createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }),
    manifestBase: null, tier: 'desktop', countdownS: 1, holdCountdown: true,
  },
});
session.start();

const room = await client.create({
  mode: 'lan', selection: { specId: 'm1a1_abrams_hc', equipment: [], camo: '' },
  settings: { gameMode: 'standard', mapId: 'verdant', teamSize: 7, botsFill: true },
});
assert.equal(service.rooms.size, 1, 'one room in the page');
assert.equal(room.players.length, 1);
await client.setReady(true);
await client.start();

const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
try {
  await until(() => cores.length === 1 && cores[0].actor, 'the host core booted its actor');
  const actor = cores[0].actor;
  assert.equal(session.role, 'host', 'the only seat hosts');
  assert.equal(actor.authority.entities.length, 14, 'the room\'s bots fill 7 a side');
  await until(() => rounds.length === 1 && rounds[0].presentation.frames.length > 30, 'the presentation receives frames');
  await until(() => actor.tick > 120, 'the match runs');
  // the held countdown: two seconds of ticks past its one-second length and it stands, until the page's reveal releases it
  assert.equal(actor.authority.phase, 'countdown', 'the countdown holds until the reveal');
  const releasedAt = actor.tick;
  session.releaseCountdown();
  await until(() => actor.authority.phase === 'playing', 'the released countdown runs out');
  assert.ok(actor.tick - releasedAt >= 60, 'its full second from the release');
  // the room heard the host's reports: the match is playing
  await until(() => client.room?.match?.status === 'playing', 'the room marks the match playing');
  // the solo pause: the host's actor holds its tick for 2 s while the page keeps drawing frames; the client neither stalls
  // nor reconnects, and the match goes on from that tick
  assert.equal(session.setPaused(true), true, 'the solo host pauses');
  await until(() => cores[0].actor.paused, 'the actor took the pause');
  const heldTick = actor.tick;
  const newestTick = () => rounds[0].presentation.frames.at(-1)?.tick ?? 0;
  await sleep(2_000);
  assert.equal(actor.tick, heldTick, 'no tick while paused');
  assert.equal(session.paused, true);
  assert.equal(session.setPaused(false), true, 'it resumes');
  await until(() => actor.tick > heldTick + 60, 'the match goes on');
  const stats = session.stats();
  assert.equal(session.phase, 'match');
  assert.equal(stats.client?.stalls ?? 0, 0, 'the pause is no stall');
  assert.equal(stats.client?.phase ?? 'live', 'live');
  await until(() => newestTick() > heldTick + 30, 'the presented frames move on past the pause');

  console.log(`inPageRoom.selftest: a solo LAN room in the page started its p2p match on the in-process host: 14 hulls (7 a side with the room's bots), the seat welcomed through the page-signed token, ${rounds[0].presentation.frames.length} frames presented by tick ${actor.tick}; the countdown held to tick ${releasedAt} and ran its full second from the release; paused 2 s at tick ${heldTick} with no tick, no stall, then resumed`);
} finally {
  clearInterval(pump);
  session.dispose();
  client.dispose();
}

// a solo room seats 21 a side (the guard the page's service sets); any other room stops at 14
assert.throws(() => createRoom({ roomCode: 'ABCDEF', mode: 'lan', creator: { id: 'p1', name: 'P' }, settings: { teamSize: 15 }, now: 0 }), /invalid_team_size/);
assert.equal(createRoom({ roomCode: 'ABCDEF', mode: 'lan', creator: { id: 'p1', name: 'P' }, settings: { teamSize: 21 }, maxTeamSize: 21, now: 0 }).settings.teamSize, 21);
{
  const big = new RoomClient({ endpoint: IN_PAGE_ROOM_ENDPOINT, player: { id: 'solo21', name: 'Solo' }, pingIntervalMs: 0, requestTimeoutMs: 5000,
    transport: { createSocket: service.createSocket } });
  const bigCores = [];
  const bigSession = new MatchSession({
    room: big, clock: () => performance.now(),
    createPresentation: () => { const presentation = new RecordingPresentation(8); return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() }; },
    p2p: { createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => bigCores.push(core), reportIntervalMs: 500 }),
      manifestBase: null, tier: 'desktop', countdownS: 1 },
  });
  bigSession.start();
  await big.create({ mode: 'lan', selection: { specId: 'm1a1_abrams_hc', equipment: [], camo: '' }, settings: { gameMode: 'standard', mapId: 'verdant', teamSize: 21 } });
  await big.setReady(true);
  await big.start();
  const bigPump = setInterval(() => bigSession.update(performance.now(), 1 / 60), 16);
  try {
    await until(() => bigCores[0]?.actor, 'the 21-a-side host booted');
    assert.equal(bigCores[0].actor.authority.entities.length, 42, '21 a side: the player and 41 of the room\'s bots');
  } finally {
    clearInterval(bigPump);
    bigSession.dispose();
    big.dispose();
  }
}
service.close();
assert.equal(service.rooms.size, 0, 'the closed service holds no room');
console.log('inPageRoom.selftest: a solo room seats 21 a side (42 hulls on its host); any other room stops at 14; the closed service holds no room');
