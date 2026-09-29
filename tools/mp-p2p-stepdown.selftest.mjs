// The `host_only` step-down against P1's REAL actor (docs/MULTIPLAYER-V2.md §13.2.1's request to the client, §13.8; P3
// certification 2026-09-28): the hosting seat's ROOM socket drops (a network blip) while its tab and actor live on; past
// ROOM_HOST_DISCONNECT_GRACE_MS the room elects a successor, which resumes from its sealed keyframe, and the third seat
// follows it; the old host's socket comes back (`room_join` with its capability) and it receives its `match_start` again
// with the CURRENT generation's URL and host — the room client reads that generation over the stale election it holds
// (the bug this receipt found: it read itself as host at the old generation and offered to itself forever) — and steps
// down at once (or on its next report, refused `host_only`): it stops its actor and becomes a peer of the new host,
// welcomed on the same seat token. Real sockets on `server/rooms` with `matchTransport: 'p2p'`,
// the actor's grace in real time (8 s); the report cadence is the receipts' 1 s.
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { createRoomsServer } from '../server/rooms/serve.ts';
import { silentLogger } from '../server/match/log.ts';
import { createHeadlessSession, memoryStorage, scriptedControls } from '../src/mp/session/headlessSession.ts';
import { createInProcessHostPort } from '../src/mp/host/inProcessHost.ts';
import { RtcWorld } from '../src/mp/transport/rtcDouble.test-support.ts';
import { ROOM_HOST_DISCONNECT_GRACE_MS, parseP2pMatchUrl } from '../src/mp/room/protocol.ts';

const SECRET = 'mp-p2p-stepdown-seat-secret-0123456789abcdef';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs, describe = () => '') => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}${describe() ? ` — ${describe()}` : ''}`);
    await sleep(25);
  }
};

const server = await createRoomsServer({ host: '127.0.0.1', port: 0, seatSecret: SECRET, world: 'terrain', matchTransport: 'p2p', countdownS: 1, log: silentLogger });
const rtc = new RtcWorld();
const cores = [];
const sessions = [];
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
  const entry = { id, headless: null, disposed: false, elections: [], logs: [], starts: [] };
  entry.headless = createHeadlessSession({
    endpoint: server.url, player: { id, name }, createSocket: (url) => new WebSocket(url), controls: scriptedControls(index), storage: memoryStorage(),
    session: {
      p2p: {
        createPeerConnection: rtc.createPeerConnection,
        createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push({ id, core }), keyframeIntervalMs: 500, reportIntervalMs: 1000 }),
        manifestBase: null, tier: 'desktop', countdownS: 1,
        onLog: (level, message, fields) => entry.logs.push({ level, message, ...(fields ?? {}) }),
      },
    },
  });
  entry.headless.room.onHostChanged((change) => entry.elections.push({ hostId: change.hostId, generation: change.generation, reason: change.reason }));
  entry.headless.room.onMatchStart((payload) => entry.starts.push({ matchUrl: payload.matchUrl, hostId: payload.hostId ?? null, secret: typeof payload.hostSecret === 'string' }));
  sessions.push(entry);
  return entry;
};
try {
  const p1 = spawn('p1', 'Admin', 0);
  const room = await p1.headless.room.create({ mode: 'lan', selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false } });
  const code = room.roomCode;
  const p2 = spawn('p2', 'Two', 1);
  const p3 = spawn('p3', 'Three', 2);
  await p1.headless.room.setTeam('bravo');
  await p2.headless.room.join({ roomCode: code, selection: { specId: 't90m' }, team: 'alpha' });
  await p3.headless.room.join({ roomCode: code, selection: { specId: 'kv2' }, team: 'alpha' });
  await until(() => p1.headless.room.room?.players.length === 3, 'three seats', 10_000);
  await Promise.all(sessions.map((entry) => entry.headless.room.setReady(true)));
  await until(() => p1.headless.room.room?.players.every((player) => player.ready), 'everyone ready', 10_000);
  await p1.headless.room.start();
  await until(() => sessions.every((entry) => entry.headless.session.match?.welcome), 'every seat welcomed', 20_000);
  assert.equal(p1.headless.session.role, 'host');
  await until(() => p2.headless.session.match.retainedMigration().keyframe, 'a sealed keyframe retained', 15_000);
  await sleep(600);
  const oldHostTick = cores[0].core.actor.tick;

  // ---- the host's room socket drops; its actor and its peers' channels live on; the grace elects p2
  const droppedAt = Date.now();
  p1.headless.room.disconnect('blip');
  assert.equal(p1.headless.room.phase, 'idle');
  await until(() => p2.elections.some((election) => election.generation === 2), 'the election after the grace', ROOM_HOST_DISCONNECT_GRACE_MS + 10_000);
  const electedAfterMs = Date.now() - droppedAt;
  const election = p2.elections.find((entry) => entry.generation === 2);
  assert.ok(electedAfterMs >= ROOM_HOST_DISCONNECT_GRACE_MS, `the election waited out the grace (${electedAfterMs} ms)`);
  assert.deepEqual({ hostId: election.hostId, reason: election.reason }, { hostId: 'p2', reason: 'timeout' });
  await until(() => p2.headless.session.role === 'host' && p2.headless.session.matchHost?.state === 'live' && p2.headless.session.match?.phase === 'live', 'p2 hosts live', 20_000);
  await until(() => p3.headless.session.match?.phase === 'live' && p3.headless.session.stats().p2p?.hostId === 'p2', 'p3 live on p2', 20_000);
  assert.equal(p1.headless.session.role, 'host', 'the old host still runs its actor (nobody told it)');
  assert.ok(!cores[0].core.stopped, "the old host's actor runs on");

  // ---- the old host's socket comes back: its match_start again with the current generation, then host_only on its report → it steps down
  const rejoinedAt = Date.now();
  await p1.headless.room.join({ roomCode: code });
  await until(() => p1.starts.length >= 2, 'the match_start re-sent to the returning seat', 5_000, () => JSON.stringify(p1.starts));
  const resent = p1.starts.at(-1);
  assert.equal(parseP2pMatchUrl(resent.matchUrl)?.generation, 2, `the re-sent match_start carries the current generation (${resent.matchUrl})`);
  assert.equal(resent.hostId, 'p2', 'and the current host');
  assert.equal(resent.secret, false, 'and no secret for a seat that is not the host');
  assert.equal(p1.headless.room.generation, 2, 'the room client reads the current generation');
  assert.equal(p1.headless.room.hostId, 'p2');
  // The step-down comes from whichever the client sees first: the re-sent match_start naming another host (the session's
  // re-entry path, at once) or the next report's host_only refusal (the fallback, within the report cadence).
  await until(() => p1.logs.some((entry) => entry.message === 'stepping down'), 'the step-down', 15_000, () => JSON.stringify(p1.logs.slice(-4)));
  const stepped = p1.logs.find((entry) => entry.message === 'stepping down');
  assert.ok(stepped.detail === 'match_start re-sent' || stepped.detail === 'host_only', `the step-down's cause (${stepped.detail})`);
  assert.equal(stepped.generation, 2);
  await until(() => cores[0].core.stopped, "the old host's actor stopped", 5_000);
  await until(() => p1.headless.session.role === 'peer' && p1.headless.session.match?.phase === 'live' && p1.headless.session.stats().p2p?.hostId === 'p2', 'the old host live as a peer of p2', 20_000,
    () => JSON.stringify({ role: p1.headless.session.role, phase: p1.headless.session.match?.phase, p2p: p1.headless.session.stats().p2p, transport: p1.headless.session.match?.stats().transportState }));
  const steppedDownAfterMs = Date.now() - rejoinedAt;
  await until(() => p2.headless.session.matchHost.peersConnected === 2, 'p2 serves both peers', 10_000);
  const core2 = cores.find((entry) => entry.id === 'p2').core;
  assert.ok(core2.actor.tick >= oldHostTick, 'the resumed timeline continues past the old host\'s');
  for (const entry of sessions) assert.notEqual(entry.headless.session.stats().phase, 'lost', `${entry.id} ended in lost`);
  console.log(`mp-p2p-stepdown.selftest: p1's socket dropped → p2 elected (${election.reason}) after ${electedAfterMs} ms and p3 followed; p1 back after the blip received ${resent.matchUrl} (host p2), stepped down on '${stepped.detail}' and was live as a peer of p2 ${steppedDownAfterMs} ms after re-joining; p2 serves 2 peers at tick ${core2.actor.tick} (old host reached ${oldHostTick})`);
} finally {
  ticking = false;
  await ticker;
  for (const entry of sessions) if (!entry.disposed) { entry.disposed = true; entry.headless.dispose(); }
  for (const { core } of cores) core.dispose();
  await Promise.race([server.close(), sleep(5000)]);
}
