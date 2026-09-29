// The client under P1's decline rule (docs/MULTIPLAYER-V2.md §13.2.1 and §13.8, P3 certification 2026-09-28), proven on
// the REAL room actor (server/rooms with matchTransport 'p2p' — the Durable Object's own state machine, its deadlines on
// a fake clock) and on the proofs' double (which now imports P1's `electHost` and applies the same rule): the hosting
// admin returns to the Garage while every other commander has declined (declined, but able — the never-host switch
// after a decline, the desktop seats of a party that left hosting to one player). The room keeps it as host: a decline
// migrates only to a WILLING successor, so no election follows; the peers read a lost link and wait; the departed
// host's reports fall silent, and ROOM_MATCH_REPORT_STALE_AFTER_MS later the room migrates with reason `timeout` to
// the last resort — the lowest-seniority declined commander — which resumes from its sealed keyframe at the continued
// tick; the other peer follows it; the old host re-enters the running match as a peer of the new one. The cost of the
// rule is the 30 s report budget instead of the 8 s socket grace: recorded in §13.8 for P1.
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs, describe = () => '') => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}${describe() ? ` — ${describe()}` : ''}`);
    await sleep(25);
  }
};

/**
 * The scenario on one room service: `url` (ws://), `advanceStale()` (make the host's reports stale: the actor's clock
 * advanced past the budget and its deadline run; the double's shortened real-time budget waited out).
 */
async function runDeclineScenario({ name, url, advanceStale, staleBudgetLabel }) {
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
      session: {
        p2p: {
          createPeerConnection: rtc.createPeerConnection,
          createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push({ id, core }), keyframeIntervalMs: 500, reportIntervalMs: 1000 }),
          manifestBase: null, tier: 'desktop', countdownS: 1,
        },
      },
    });
    entry.headless.room.onHostChanged((change) => entry.elections.push({ hostId: change.hostId, generation: change.generation, reason: change.reason, secret: typeof change.hostSecret === 'string' }));
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

    // ---- the host returns to the Garage: its actor stops, it declines; P1 keeps it (no willing successor) — no election
    const electionsBefore = p2.elections.length;
    await p1.headless.session.leaveMatch('garage');
    assert.equal(p1.headless.session.phase, 'lobby');
    await sleep(2000);
    assert.equal(p2.elections.length, electionsBefore, `no election follows the decline (every other commander declined): ${JSON.stringify(p2.elections)}`);
    assert.equal(p2.headless.room.hostId, 'p1', 'the room still names the departed host');
    assert.equal(p2.headless.room.generation, 1);
    assert.notEqual(p2.headless.session.match.stats().transportState, 'open', 'the peer lost its link and waits');
    assert.equal(p2.headless.session.role, 'peer');
    facts.afterDecline = { hostKept: p2.headless.room.hostId, generation: p2.headless.room.generation, p2Transport: p2.headless.session.match.stats().transportState, p3Transport: p3.headless.session.match.stats().transportState };

    // ---- the reports fall silent past the budget: the room migrates with `timeout` to the last resort (p2, declined but able)
    const staleAt = Date.now();
    await advanceStale();
    await until(() => p2.elections.some((election) => election.generation === 2), 'the timeout election', 10_000);
    const election = p2.elections.find((entry) => entry.generation === 2);
    assert.deepEqual({ hostId: election.hostId, reason: election.reason, secret: election.secret }, { hostId: 'p2', reason: 'timeout', secret: true }, 'the last resort is elected with the secret');
    await until(() => p2.headless.session.role === 'host' && p2.headless.session.matchHost?.state === 'live', 'p2 hosts', 20_000);
    await until(() => p2.headless.session.match?.phase === 'live' && p2.headless.session.stats().p2p?.migrating === false, 'p2 live on its own actor', 15_000);
    await until(() => p3.headless.session.match?.phase === 'live' && p3.headless.session.stats().p2p?.hostId === 'p2', 'p3 live on p2', 20_000);
    const core2 = cores.find((entry) => entry.id === 'p2').core;
    assert.ok(core2.actor.tick >= keyframeTick2, `the resumed tick ${core2.actor.tick} continues past the keyframe's ${keyframeTick2}`);
    assert.ok(core2.actor.tick >= oldHostTick, `the resumed tick ${core2.actor.tick} never falls behind the old host's ${oldHostTick}`);
    facts.migration = { electedAfterMs: Date.now() - staleAt, election, resumedTick: core2.actor.tick, p3Host: p3.headless.session.stats().p2p.hostId };

    // ---- the old host re-enters the running match: a peer of p2 on the same seat token
    await p1.headless.session.enterMatch(p1.headless.room.matchStart);
    await until(() => p1.headless.session.match?.welcome && p1.headless.session.role === 'peer' && p1.headless.session.stats().p2p?.hostId === 'p2', 'p1 welcomed as a peer of p2', 20_000);
    await until(() => p2.headless.session.matchHost.peersConnected === 2, 'p2 serves both peers', 10_000);
    facts.rejoin = { role: p1.headless.session.role, hostId: p1.headless.session.stats().p2p.hostId, generation: p1.headless.session.stats().p2p.generation, peersOnP2: p2.headless.session.matchHost.peersConnected };
    for (const entry of sessions) assert.notEqual(entry.headless.session.stats().phase, 'lost', `${entry.id} ended in lost`);
    console.log(`mp-p2p-decline.selftest [${name}]: decline kept p1 (no election in 2 s), silence past ${staleBudgetLabel} → p2 elected (${election.reason}) after ${facts.migration.electedAfterMs} ms, resumed at tick ${facts.migration.resumedTick} (keyframe ${keyframeTick2}, old host ${oldHostTick}); p3 live on p2; p1 back as a peer`);
    return facts;
  } finally {
    ticking = false;
    await ticker;
    for (const entry of sessions) if (!entry.disposed) { entry.disposed = true; entry.headless.dispose(); }
    for (const { core } of cores) core.dispose();
  }
}

// ---- the real actor (server/rooms, p2p): its clock advanced past the report budget, its deadline run
{
  let offset = 0;
  const server = await createRoomsServer({ host: '127.0.0.1', port: 0, seatSecret: SECRET, world: 'terrain', matchTransport: 'p2p', countdownS: 1, wallClock: () => Date.now() + offset, log: silentLogger });
  try {
    const facts = await runDeclineScenario({
      name: 'actor', url: server.url, staleBudgetLabel: `ROOM_MATCH_REPORT_STALE_AFTER_MS (${ROOM_MATCH_REPORT_STALE_AFTER_MS} ms, the actor's clock)`,
      advanceStale: async () => {
        offset += ROOM_MATCH_REPORT_STALE_AFTER_MS + 1000;
        const actor = server.roomService.rooms.get(currentCode(server));
        assert.ok(actor, 'the room actor exists');
        await actor.tick();
      },
    });
    assert.equal(facts.migration.election.reason, 'timeout');
  } finally {
    await Promise.race([server.close(), sleep(5000)]);
  }
}
function currentCode(server) {
  const codes = [...server.roomService.rooms.keys()];
  assert.equal(codes.length, 1, `one room on the service (${codes.join(', ')})`);
  return codes[0];
}

// ---- the double: the same rule, the shortened real-time budget
{
  const events = [];
  // the double's budget runs in real time: longer than the scenario's 2 s "no election" window, short enough for a receipt
  const rooms = await createP2pRoomDouble({ seatSecret: SECRET, hostGraceMs: 8000, reportStaleMs: 4000, onEvent: (event) => events.push(event) });
  try {
    const facts = await runDeclineScenario({ name: 'double', url: rooms.url, staleBudgetLabel: 'reportStaleMs 4000 ms', advanceStale: async () => { await sleep(2500); } });
    assert.ok(events.some((event) => event.kind === 'host_decline_kept' && event.host === 'p1'), 'the double kept the host on the decline');
    assert.ok(events.some((event) => event.kind === 'host_silent' && event.hostId === 'p1'), "the double timed the host's silence out");
    assert.equal(facts.migration.election.reason, 'timeout');
  } finally {
    await Promise.race([rooms.close(), sleep(5000)]);
  }
}
console.log("mp-p2p-decline.selftest: the client behaves under P1's decline rule on the real actor and on the double");
