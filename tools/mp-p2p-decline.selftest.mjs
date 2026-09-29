// The client under the room's decline rule (docs/MULTIPLAYER-V2.md §13.2.1 and §13.8; P1b cost pass 2026-09-28), proven
// on the REAL room actor (server/rooms with matchTransport 'p2p' — the Durable Object's own state machine) and on the
// proofs' double (which mirrors the rule): the hosting admin returns to the Garage while every other commander has
// declined (declined, but able — the never-host switch after a decline, the desktop seats of a party that left hosting
// to one player). Its actor stops and it declines; the room treats a running host's decline as its departure from
// hosting and elects the next candidate AT ONCE with reason `declined` — the last resort, the lowest-seniority declined
// commander — which resumes from its sealed keyframe at the continued tick; the other peer follows it; the old host
// re-enters the running match as a peer of the new one. P1's rule (a decline moved the match only to a WILLING
// successor) kept the departed host and stalled its peers for the 30 s report budget; the certification asked P1 to
// treat the decline as a leave, and this receipt now proves that: the election arrives in seconds, not 30.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createRoomsServer } from '../server/rooms/serve.ts';
import { silentLogger } from '../server/match/log.ts';
import { createP2pRoomDouble } from './mp-p2p-room-double.ts';
import { createHeadlessSession, memoryStorage, scriptedControls } from '../src/mp/session/headlessSession.ts';
import { createInProcessHostPort } from '../src/mp/host/inProcessHost.ts';
import { RtcWorld } from '../src/mp/transport/rtcDouble.test-support.ts';
import { ROOM_MATCH_REPORT_STALE_AFTER_MS } from '../src/mp/room/protocol.ts';

const SECRET = 'mp-p2p-decline-seat-secret-0123456789abcdef';
/** The election must beat the report budget by a wide margin: it is immediate, the budget is 30 s. */
const ELECTION_BUDGET_MS = 5_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs, describe = () => '') => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}${describe() ? ` — ${describe()}` : ''}`);
    await sleep(25);
  }
};

/** The scenario on one room service (`url`, ws://); `steppedDown()` reads the service's record of who stepped down. */
async function runDeclineScenario({ name, url, steppedDown }) {
  const rtc = new RtcWorld();
  const cores = [];
  const sessions = [];
  const facts = { name };
  let ticking = true;
  const ticker = (async () => {
    let last = performance.now();
    while (ticking) {
      const now = performance.now();
      const elapsedS = Math.min(0.25, (now - last) / 1000);
      last = now;
      rtc.flush();
      for (const entry of sessions) if (!entry.disposed) entry.headless.step(now, elapsedS);
      rtc.flush();
      await sleep(1000 / 30);
    }
  })();
  const spawn = (id, name, index) => {
    const entry = { id, headless: null, disposed: false, elections: [] };
    entry.headless = createHeadlessSession({
      endpoint: url, player: { id, name }, createSocket: (socketUrl) => new WebSocket(socketUrl), controls: scriptedControls(index), storage: memoryStorage(),
      // a short keepalive so the room's text frame is observed within the scenario (the client's default is 15 s)
      room: { pingIntervalMs: 1000 },
      session: {
        p2p: {
          createPeerConnection: rtc.createPeerConnection,
          createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push({ id, core }), keyframeIntervalMs: 500, reportIntervalMs: 1000 }),
          manifestBase: null, tier: 'desktop', countdownS: 1,
        },
      },
    });
    entry.headless.room.onHostChanged((change) => entry.elections.push({ hostId: change.hostId, generation: change.generation, reason: change.reason, secret: typeof change.hostSecret === 'string', at: Date.now() }));
    sessions.push(entry);
    return entry;
  };
  try {
    // ---- three able commanders: p1 hosts (the admin), p2 and p3 have declined
    const p1 = spawn('p1', 'Admin', 0);
    const room = await p1.headless.room.create({ mode: 'lan', selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false } });
    const code = room.roomCode;
    facts.code = code;
    const p2 = spawn('p2', 'Two', 1);
    const p3 = spawn('p3', 'Three', 2);
    await p1.headless.room.setTeam('bravo');
    await p2.headless.room.join({ roomCode: code, selection: { specId: 't90m' }, team: 'alpha' });
    await p3.headless.room.join({ roomCode: code, selection: { specId: 'leo2a7v' }, team: 'alpha' });
    await p2.headless.room.declineHost(true);
    await p3.headless.room.declineHost(true);
    await until(() => p1.headless.room.room?.players.length === 3 && p1.headless.room.room.players.filter((player) => player.hostDeclined).length === 2, 'two declined seats in the room', 10_000,
      () => JSON.stringify({ p1: p1.headless.room.room?.players.map((player) => [player.id, player.team, player.hostDeclined, player.connected]), p1Stats: p1.headless.room.stats(), p2Sees: p2.headless.room.room?.players.map((player) => [player.id, player.hostDeclined]), p2Stats: p2.headless.room.stats(), p3Stats: p3.headless.room.stats() }));
    await Promise.all(sessions.map((entry) => entry.headless.room.setReady(true)));
    await until(() => p1.headless.room.room?.players.every((player) => player.ready), 'everyone ready', 10_000);
    await p1.headless.room.start();
    await until(() => sessions.every((entry) => entry.headless.session.round), 'every seat entered the match', 10_000);
    assert.equal(p1.headless.session.round.matchStart.hostId, 'p1', 'the willing admin hosts');
    await until(() => sessions.every((entry) => entry.headless.session.match?.welcome), 'every seat welcomed', 20_000);
    await until(() => p3.headless.session.match.retainedMigration().keyframe && p2.headless.session.match.retainedMigration().keyframe, 'sealed keyframes retained', 15_000);
    await sleep(800);
    const keyframeTick2 = p2.headless.session.match.retainedMigration().keyframe.tick;
    const oldHostTick = cores[0].core.actor.tick;
    facts.start = { hostId: 'p1', keyframeTick2, oldHostTick };
    assert.equal(p1.headless.room.stats().keepalive, 'frame', 'the seats keep the room socket alive with the room\'s text frame (P1b)');

    // ---- the host returns to the Garage: its actor stops, it declines; the room treats the decline as its departure
    // from hosting and elects the last resort at once — p2, the lowest-seniority declined commander — with reason declined
    const declinedAt = Date.now();
    await p1.headless.session.leaveMatch('garage');
    assert.equal(p1.headless.session.phase, 'lobby');
    await until(() => p2.elections.some((election) => election.generation === 2), 'the election on the decline', ELECTION_BUDGET_MS,
      () => JSON.stringify({ p2: p2.elections, p2Stats: p2.headless.room.stats(), host: p2.headless.room.hostId, generation: p2.headless.room.generation }));
    const election = p2.elections.find((entry) => entry.generation === 2);
    facts.election = { ...election, afterMs: election.at - declinedAt };
    assert.deepEqual({ hostId: election.hostId, reason: election.reason, secret: election.secret }, { hostId: 'p2', reason: 'declined', secret: true }, 'the last resort is elected at once with the secret, reason declined');
    assert.ok(facts.election.afterMs < ELECTION_BUDGET_MS, `elected ${facts.election.afterMs} ms after the decline — not the ${ROOM_MATCH_REPORT_STALE_AFTER_MS} ms report budget`);
    assert.deepEqual(await steppedDown(code), ['p1'], 'the departed host stepped down for this match: a decline never hands the match back to it');
    await until(() => p2.headless.session.role === 'host' && p2.headless.session.matchHost?.state === 'live', 'p2 hosts', 20_000);
    await until(() => p2.headless.session.match?.phase === 'live' && p2.headless.session.stats().p2p?.migrating === false, 'p2 live on its own actor', 15_000);
    await until(() => p3.headless.session.match?.phase === 'live' && p3.headless.session.stats().p2p?.hostId === 'p2', 'p3 live on p2', 20_000);
    const core2 = cores.find((entry) => entry.id === 'p2').core;
    assert.ok(core2.actor.tick >= keyframeTick2, `the resumed tick ${core2.actor.tick} continues past the keyframe's ${keyframeTick2}`);
    assert.ok(core2.actor.tick >= oldHostTick, `the resumed tick ${core2.actor.tick} never falls behind the old host's ${oldHostTick}`);
    facts.migration = { p2LiveAfterMs: Date.now() - declinedAt, resumedTick: core2.actor.tick, p3Host: p3.headless.session.stats().p2p.hostId };
    assert.equal(p3.elections.filter((entry) => entry.generation >= 2).length, 1, `one election, no ping-pong: ${JSON.stringify(p3.elections)}`);

    // ---- the old host re-enters the running match: a peer of p2 on the same seat token
    await p1.headless.session.enterMatch(p1.headless.room.matchStart);
    await until(() => p1.headless.session.match?.welcome && p1.headless.session.role === 'peer' && p1.headless.session.stats().p2p?.hostId === 'p2', 'p1 welcomed as a peer of p2', 20_000);
    await until(() => p2.headless.session.matchHost.peersConnected === 2, 'p2 serves both peers', 10_000);
    facts.rejoin = { role: p1.headless.session.role, hostId: p1.headless.session.stats().p2p.hostId, generation: p1.headless.session.stats().p2p.generation, peersOnP2: p2.headless.session.matchHost.peersConnected };
    for (const entry of sessions) assert.notEqual(entry.headless.session.stats().phase, 'lost', `${entry.id} ended in lost`);
    console.log(`mp-p2p-decline.selftest [${name}]: p1's Garage return → p2 elected (${election.reason}) ${facts.election.afterMs} ms after the decline, live ${facts.migration.p2LiveAfterMs} ms after it, resumed at tick ${facts.migration.resumedTick} (keyframe ${keyframeTick2}, old host ${oldHostTick}); p3 live on p2; p1 back as a peer`);
    return facts;
  } finally {
    ticking = false;
    await ticker;
    for (const entry of sessions) if (!entry.disposed) { entry.disposed = true; entry.headless.dispose(); }
    for (const { core } of cores) core.dispose();
  }
}

// ---- the real actor (server/rooms, p2p): the Durable Object's own state machine
{
  const server = await createRoomsServer({ host: '127.0.0.1', port: 0, seatSecret: SECRET, world: 'terrain', matchTransport: 'p2p', countdownS: 1, log: silentLogger });
  try {
    const facts = await runDeclineScenario({
      name: 'actor', url: server.url,
      steppedDown: async (code) => {
        const actor = server.roomService.rooms.get(code);
        assert.ok(actor, 'the room actor exists');
        return actor.exportState().steppedDown;
      },
    });
    assert.equal(facts.election.reason, 'declined');
  } finally {
    await Promise.race([server.close(), sleep(5000)]);
  }
}

// ---- the double: the same rule (its events name the decline and the election; nothing is kept)
{
  const events = [];
  const rooms = await createP2pRoomDouble({ seatSecret: SECRET, hostGraceMs: 8000, reportStaleMs: ROOM_MATCH_REPORT_STALE_AFTER_MS, onEvent: (event) => events.push(event) });
  try {
    const facts = await runDeclineScenario({ name: 'double', url: rooms.url, steppedDown: async (code) => [...rooms.room(code).steppedDown] });
    assert.ok(events.some((event) => event.kind === 'host_decline' && event.playerId === 'p1' && event.declined === true), 'the double saw the decline');
    assert.ok(events.some((event) => event.kind === 'host_changed' && event.hostId === 'p2' && event.reason === 'declined'), 'the double elected p2 on the decline');
    assert.ok(!events.some((event) => event.kind === 'host_decline_kept'), 'nothing was kept');
    assert.ok(!events.some((event) => event.kind === 'host_silent'), 'no report budget ran out');
    assert.ok(events.some((event) => event.kind === 'keepalive'), 'the seats kept alive with the text frame');
    assert.equal(facts.election.reason, 'declined');
  } finally {
    await Promise.race([rooms.close(), sleep(5000)]);
  }
}
console.log("mp-p2p-decline.selftest: the client behaves under the room's decline rule (P1b: a departure, elected at once) on the real actor and on the double");
