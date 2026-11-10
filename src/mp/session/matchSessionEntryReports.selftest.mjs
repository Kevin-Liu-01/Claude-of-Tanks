// Plan step 8 (2026-10-13, the MP stream; MP-SINCE-0930 MP-S03): the room replaces a p2p host whose reports stop for
// 30 s, and an elected host's actor boots only after its presentation has built the world — a slow entry used to cost
// the match its host before it began. The elected host now reports `loading` (tick 0) from the match_start until its
// actor reports, for at most a ceiling. This receipt drives the real MatchSession against a scripted room socket with
// a slow presentation and short intervals: the reports flow during the entry and stop at the actor's first report; they
// stop at the ceiling, on host_only and when the room elects another seat; a peer and a running match's re-entry send
// none; and a seat that declined only to re-enter a running match withdraws that decline once it is welcomed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { RoomClient } from '../room/roomClient.ts';
import { p2pMatchUrl } from '../room/protocol.ts';
import { createRoom, joinRoom, serializeRoom } from '../room/roomPolicy.ts';
import { ENTRY_REPORT_CEILING_MS, MatchSession } from './matchSession.ts';
import { RecordingPresentation } from '../presentation/adapter.ts';
import { Listeners } from '../transport/transport.ts';
import { RtcWorld } from '../transport/rtcDouble.test-support.ts';
import { createInProcessHostPort } from '../host/inProcessHost.ts';
import { createHostPortPair } from '../host/hostProtocol.ts';
import { createMatchHostCore } from '../host/matchHostCore.ts';
import { signSeatToken } from '../../../server/match/seatToken.ts';

let stage = 'setup';
const watchdog = setTimeout(() => { console.error(`matchSessionEntryReports.selftest: stuck at ${stage}`); process.exit(1); }, 120_000);
watchdog.unref();
// a receipt that can leak a running actor bounds itself (2026-10-13: before the core fix below, a leaked actor grew a run
// to 46 GB): past 1.5 GB of RSS it stops at once and names the case
let peakRss = 0;
const memoryGuard = setInterval(() => {
  const rss = process.memoryUsage().rss;
  peakRss = Math.max(peakRss, rss);
  if (rss > 1.5e9) { console.error(`matchSessionEntryReports.selftest: RSS ${(rss / 1e9).toFixed(2)} GB at ${stage}: a leak`); process.exit(1); }
}, 200);
memoryGuard.unref();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 8000) => {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(10); }
};
// (267, main's load class: "timers slip under load" at load 280-600) the event loop's own stalls, sampled every 5 ms. A
// report timer cannot fire while the loop is stalled, so the entry reports' cadence is judged against what the loop gave
// them: a gap is the reports' fault only past the loop's own longest stall in it plus two intervals
const loopSamples = [];
let loopLast = performance.now();
const loopMonitor = setInterval(() => {
  const now = performance.now();
  loopSamples.push({ at: now, gap: now - loopLast });
  loopLast = now;
  if (loopSamples.length > 20_000) loopSamples.splice(0, 10_000);
}, 5);
loopMonitor.unref();
const loopStall = (from, to) => Math.max(0, ...loopSamples.filter((sample) => sample.at > from && sample.at <= to + 5).map((sample) => sample.gap));
const reportGaps = (envelopes) => envelopes.slice(1).map((envelope, index) => ({
  gap: envelope.at - envelopes[index].at, stall: loopStall(envelopes[index].at, envelope.at) }));

function scriptedTransport() {
  const frames = new Listeners();
  const states = new Listeners();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const outbound = [];
  const transport = {
    kind: 'scripted', state: 'idle', bufferedBytes: 0, stats: { framesSent: 0, bytesSent: 0, framesReceived: 0, bytesReceived: 0, framesDropped: 0, framesRejected: 0, reconnects: 0, opens: 0 },
    open() { transport.state = 'open'; states.emit({ state: 'open', previous: 'idle' }); },
    send(frame) { outbound.push({ ...JSON.parse(decoder.decode(frame)), at: performance.now() }); return true; },
    reconnect() {}, close() { transport.state = 'closed'; states.emit({ state: 'closed', previous: 'open', reason: 'client' }); },
    onFrame: (listener) => frames.add(listener), onState: (listener) => states.add(listener),
    deliver(envelope) { frames.emit(encoder.encode(JSON.stringify(envelope))); },
    outbound,
  };
  return transport;
}

const SEAT_SECRET = 'entry-report-seat-secret-0123456789abcdef';
const roomCode = 'ENTRYR';
const room = createRoom({ roomCode, mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, team: null, now: 1001 });
for (const player of room.players) player.ready = true;
const snapshotWith = (host) => ({ ...serializeRoom(room), host });
const world = new RtcWorld();
const cores = [];

async function seat({ presentationMs = 0, presentationUntil = null, presentationGate = null, p2p = {} } = {}) {
  let transport = null;
  const counts = { presentations: 0 };
  const client = new RoomClient({ endpoint: 'ws://rooms.test', player: { id: 'me', name: 'Me' }, pingIntervalMs: 0, requestTimeoutMs: 2000, createTransport: () => { transport = scriptedTransport(); return transport; } });
  const logs = [];
  const session = new MatchSession({
    room: client, clock: () => performance.now(),
    createPresentation: async () => {
      counts.presentations++;
      if (presentationMs) await sleep(presentationMs);
      // a world build held open until the case releases it
      if (presentationGate) await presentationGate();
      // (267) a world build that lasts until the event it is there for (the entry reports flowing), capped
      if (presentationUntil) await until(() => presentationUntil(transport), 'the presentation\'s event', 20_000);
      const presentation = new RecordingPresentation(64);
      return { adapter: presentation, controls: null, prediction: null, dispose: () => presentation.dispose() };
    },
    p2p: {
      createPeerConnection: world.createPeerConnection, createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), reportIntervalMs: 500 }),
      manifestBase: null, tier: 'desktop', countdownS: 1, entryReportIntervalMs: 40, onLog: (level, message, fields) => logs.push({ message, fields, at: performance.now() }), ...p2p,
    },
  });
  session.start();
  const joining = client.join({ roomCode });
  await sleep(0);
  const request = transport.outbound.find((envelope) => envelope.type === 'room_join');
  transport.deliver({ type: 'room_joined', requestId: request.requestId, payload: { room: snapshotWith({ transport: 'p2p', hostId: null, generation: 0, since: 0 }), playerId: 'me', seat: 0, chat: [] } });
  await joining;
  return { client, session, transport, logs, counts };
}

let matchCounter = 0;
function start(transport, { hostId = 'me', generation = 1, matchId: sameMatchId = null } = {}) {
  // a matchId given is the same match re-sent (the room re-sends match_start to a seat back from a room-socket blip)
  const matchId = sameMatchId ?? `m${++matchCounter}-0000e${matchCounter}e0`;
  const hostSecret = createHash('sha256').update(`${SEAT_SECRET}:${matchId}`).digest('hex');
  const token = signSeatToken(hostSecret, { v: 1, roomId: roomCode, seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId, generation, since: 2000 }) } });
  transport.deliver({ type: 'match_start', payload: { matchId, round: matchCounter, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', seatToken: token, matchUrl: p2pMatchUrl(roomCode, generation), hostId, ...(hostId === 'me' ? { hostSecret } : {}), expiresAt: Date.now() + 3_600_000 } });
  return { matchId, hostSecret };
}
const reportsOf = (transport) => transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'match_report');
const stopOf = (logs) => logs.find((entry) => entry.message === 'entry reports stopped');

assert.equal(ENTRY_REPORT_CEILING_MS, 150_000, 'the production ceiling holds the slowest measured entries (the 145 s welcomed-compiling rejoin)');

// ---- the elected host reports loading through a slow entry, and stops when its actor reports
stage = 'case 1';
{
  // (267) the world builds until five entry reports have gone out (600 ms at least): at load the 600 ms sleep alone
  // could end before four 40 ms timers had fired
  const { transport, session, client, logs } = await seat({ presentationMs: 600,
    presentationUntil: (transport) => reportsOf(transport).length >= 5 });
  const { matchId } = start(transport);
  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  await until(() => !!stopOf(logs), 'the entry reports stopped', 10_000);
  const stopped = stopOf(logs);
  assert.equal(stopped.fields.reason, 'host reporting', "they stop at the actor's own first report");
  const duringEntry = reportsOf(transport).filter((envelope) => envelope.at <= stopped.at);
  assert.equal(stopped.fields.sent, duringEntry.length);
  assert.ok(duringEntry.length >= 4, `loading reports flowed while the world built (${duringEntry.length} at 40 ms)`);
  for (const envelope of duringEntry) assert.deepEqual(envelope.payload.command, { type: 'match_report', matchId, generation: 1, phase: 'loading', tick: 0 });
  for (const { gap, stall } of reportGaps(duringEntry)) {
    assert.ok(gap < 400 || gap <= stall + 80, `no gap near the room's budget beyond the loop's own stall (${Math.round(gap)} ms at a 40 ms interval, the loop stalled ${Math.round(stall)} ms)`);
  }
  const atStop = reportsOf(transport).length;
  const waitFrom = performance.now();
  await sleep(300);
  // (267) a loaded machine can stretch the 300 ms: the actor's 500 ms cadence allows one report per 500 ms waited
  const waited = performance.now() - waitFrom;
  assert.ok(reportsOf(transport).length - atStop <= 1 + Math.floor(waited / 500), `after it, only the actor reports (500 ms cadence here; ${Math.round(waited)} ms waited)`);
  clearInterval(pump);
  stage += ' leave'; await session.leaveMatch('done');
  session.dispose(); client.dispose();
}

// ---- a wedged entry is still replaced: the reports end at the ceiling
stage = 'case 2';
{
  const { transport, session, client, logs } = await seat({ presentationMs: 700, p2p: { entryReportCeilingMs: 200 } });
  start(transport);
  await until(() => !!stopOf(logs), 'the ceiling', 3000);
  assert.equal(stopOf(logs).fields.reason, 'ceiling');
  const sent = reportsOf(transport).length;
  // (267) the ceiling caps them (at most ceiling / interval + 2); they repeat at the interval wherever the loop ran, up to
  // the ceiling's stop (at load a stalled loop fires fewer: four are required only when it never stalled past an interval,
  // and a stall that outlasts the ceiling leaves the first report alone)
  const marks = [...reportsOf(transport), { at: stopOf(logs).at }];
  const ceilingStall = loopStall(marks[0].at, marks.at(-1).at);
  assert.ok(sent <= 7 && sent >= (ceilingStall < 40 ? 4 : 1), `about ceiling / interval reports (${sent}; the loop stalled ${Math.round(ceilingStall)} ms)`);
  for (const { gap, stall } of reportGaps(marks)) assert.ok(gap <= stall + 80, `they repeat at the interval up to the ceiling (${Math.round(gap)} ms, the loop stalled ${Math.round(stall)} ms)`);
  await sleep(150);
  assert.equal(reportsOf(transport).length, sent, 'none after the ceiling');
  await until(() => session.phase === 'match', 'the round entered');
  stage += ' leave'; await session.leaveMatch('done');
  session.dispose(); client.dispose();
}

// ---- the room answers host_only (it runs another generation): the reports stop at once
stage = 'case 3';
{
  const { transport, session, client, logs } = await seat({ presentationMs: 500 });
  start(transport);
  await until(() => reportsOf(transport).length >= 1, 'a first report');
  transport.deliver({ type: 'error', requestId: reportsOf(transport)[0].requestId, payload: { code: 'host_only' } });
  await until(() => !!stopOf(logs), 'stopped on host_only', 2000);
  assert.equal(stopOf(logs).fields.reason, 'host_only');
  await until(() => session.phase === 'match', 'the round entered');
  stage += ' leave'; await session.leaveMatch('done');
  session.dispose(); client.dispose();
}

// ---- the room elects another seat during the entry: the next tick of the reports sees it and stops
stage = 'case 4';
{
  const { transport, session, client, logs } = await seat({ presentationMs: 500 });
  start(transport);
  await until(() => reportsOf(transport).length >= 2, 'reports flowing');
  transport.deliver({ type: 'host_changed', payload: { hostId: 'other', generation: 2, resumeTick: 0, reason: 'timeout' } });
  await until(() => !!stopOf(logs), 'stopped on the election', 2000);
  assert.equal(stopOf(logs).fields.reason, 'superseded');
  await until(() => session.phase === 'match', 'the round entered');
  stage += ' leave'; await session.leaveMatch('done');
  session.dispose(); client.dispose();
}

// ---- the room elects THIS seat while it is still loading a fresh match it entered as a peer (the named host left): its
//      match_start carries no secret, the election's copy does; the seat hosts with it (improve-271 plan 002: it used to
//      find no secret and decline as unable, which ends a two-commander match at once)
stage = 'case 4b';
{
  let release = null;
  const held = new Promise((resolve) => { release = resolve; });
  const { transport, session, client, counts } = await seat({ presentationGate: () => held });
  const { matchId, hostSecret } = start(transport, { hostId: 'other' });
  await until(() => counts.presentations === 1, 'the entry began');
  transport.deliver({ type: 'host_changed', payload: { hostId: 'me', generation: 2, resumeTick: 0, reason: 'left', hostSecret } });
  await sleep(20);
  release();
  await until(() => session.phase === 'match', 'the round entered');
  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  const unable = transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'host_decline' && envelope.payload.command.unable === true);
  assert.equal(unable.length, 0, 'no unable decline from a seat that can host');
  assert.equal(session.role, 'host', 'the elected seat hosts');
  await until(() => reportsOf(transport).length >= 1, 'the elected host reports', 10_000);
  const first = reportsOf(transport)[0].payload.command;
  assert.equal(first.matchId, matchId);
  assert.equal(first.generation, 2, "the host boots under the election's generation");
  clearInterval(pump);
  stage += ' leave'; await session.leaveMatch('done');
  session.dispose(); client.dispose();
}

// ---- the named host of a fresh match that fails its world load, or leaves while loading, tells the room it cannot host
//      (improve-271 plan 003: it left silently, and its peers offered to a seat with no acceptor until the 60 s link window)
const unableDeclines = (transport) => transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'host_decline')
  .map((envelope) => envelope.payload.command).filter((command) => command.declined === true && command.unable === true);
stage = 'case 4c';
{
  const { transport, session, client } = await seat({ presentationGate: () => Promise.reject(new Error('the world failed to load')) });
  start(transport);
  await until(() => unableDeclines(transport).length > 0, 'the unable decline after a failed load', 5000);
  assert.equal(unableDeclines(transport).length, 1, 'declined once');
  assert.equal(session.phase, 'lobby');
  session.dispose(); client.dispose();
}
stage = 'case 4d';
{
  let release = null;
  const held = new Promise((resolve) => { release = resolve; });
  const { transport, session, client, counts } = await seat({ presentationGate: () => held });
  start(transport);
  await until(() => counts.presentations === 1, 'the entry began');
  await session.leaveMatch('garage');
  assert.equal(unableDeclines(transport).length, 1, 'a Garage return while loading declines as unable, once');
  release();
  session.dispose(); client.dispose();
}
stage = 'case 4e';
{
  const { transport, session, client } = await seat({ presentationGate: () => Promise.reject(new Error('the world failed to load')) });
  const phases = [];
  session.onPhase(({ phase }) => phases.push(phase));
  start(transport, { hostId: 'other' });
  await until(() => phases.includes('loading') && session.phase === 'lobby', 'the failed peer entry', 5000);
  await sleep(50);
  assert.equal(transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'host_decline').length, 0, 'a peer whose load failed sends no decline');
  session.dispose(); client.dispose();
}

// ---- a peer sends none
stage = 'case 5';
{
  const { transport, session, client, logs } = await seat({ presentationMs: 300 });
  start(transport, { hostId: 'other' });
  await until(() => session.phase === 'match', 'the peer entered');
  assert.equal(reportsOf(transport).length, 0, 'a peer never reports');
  assert.equal(stopOf(logs), undefined);
  session.dispose(); client.dispose();
}

// ---- a running match's re-named host (its tab reloaded) sends none: it declines, and withdraws the decline once welcomed
stage = 'case 6';
{
  room.match = { id: 'running', round: 9, status: 'playing', mapId: 'verdant', seed: 7, startedAt: 1000, endedAt: null, verdict: null };
  room.phase = 'playing';
  const { transport, session, client } = await seat({ presentationMs: 200, p2p: { reentryElectionWaitMs: 300 } });
  start(transport, { generation: 3 });
  await until(() => session.phase === 'match', 'the re-entry round entered');
  assert.equal(reportsOf(transport).filter((envelope) => envelope.payload.command.tick === 0 && envelope.payload.command.phase === 'loading' && envelope.at < performance.now()).length, 0,
    'no entry reports for a running match (its re-entry declines so a peer with the keyframe resumes)');
  const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
  // nobody else hosts here: the fallback boots this seat afresh through the election path, and its welcome arrives
  await until(() => !!session.match?.welcome, 'welcomed', 10_000);
  const declines = transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'host_decline').map((envelope) => envelope.payload.command);
  assert.deepEqual(declines.slice(0, 2).map((command) => command.declined), [true, false], 'the re-entry decline, then its withdrawal at the welcome');
  assert.equal(declines[0].unable, undefined);
  clearInterval(pump);
  stage += ' leave'; await session.leaveMatch('done');
  const last = transport.outbound.filter((envelope) => envelope.payload?.command?.type === 'host_decline').at(-1).payload.command;
  assert.deepEqual({ declined: last.declined, unable: last.unable }, { declined: true, unable: true }, 'leaving the hosted match still declines as unable');
  session.dispose(); client.dispose();
  room.match = null;
  room.phase = 'waiting';
}
// ---- a seat that leaves while its host's world is still loading leaves no actor behind (matchHostCore checked `disposed`
//      but not `stopped` after the load: the stopped core started an actor nobody would stop — this receipt's runs caught it)
stage = 'case 7';
{
  // a host thread whose world takes 600 ms to load (the shard fetch and build in a browser)
  const slowHostPort = () => {
    const pair = createHostPortPair();
    cores.push(createMatchHostCore({ port: pair.worker, buildWorld: async () => { await sleep(600); return 'terrain'; }, reportIntervalMs: 500 }));
    return pair.main;
  };
  const { transport, session, client } = await seat({ p2p: { createHostPort: slowHostPort } });
  const before = cores.length;
  start(transport);
  await until(() => cores.length > before, 'the host core created');
  const core = cores.at(-1);
  assert.equal(core.booted, false, 'its world is still loading');
  await session.leaveMatch('left during the load');
  assert.equal(core.stopped, true);
  await sleep(1500);
  assert.ok(core.actor === null, 'no actor started after the stop');
  session.dispose(); client.dispose();
}
// ---- the peer transport's signaler never names this seat (an elected peer booting as host offered to itself until its actor ran)
stage = 'case 8';
{
  const { transport, session, client } = await seat();
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'other', generation: 4, since: 2000 }) } });
  await sleep(0);
  assert.deepEqual(session.roomSignaler().target(), { hostId: 'other', generation: 4 });
  transport.deliver({ type: 'room_state', payload: { room: snapshotWith({ transport: 'p2p', hostId: 'me', generation: 5, since: 3000 }) } });
  await sleep(0);
  assert.equal(session.roomSignaler().target(), null, 'no offer to itself: the attempt waits for another host');
  session.dispose(); client.dispose();
}
// ---- the room re-sends match_start while this seat is still loading (a room-socket blip on the loading screen): the
//      entry in flight is joined, not restarted (it used to leave the round and build the world again)
stage = 'case 9';
{
  let release = null;
  const held = new Promise((resolve) => { release = resolve; });
  const { transport, session, client, counts } = await seat({ presentationGate: () => held });
  const { matchId } = start(transport, { hostId: 'other' });
  await until(() => counts.presentations === 1, 'the entry began');
  const joined = session.enterMatch(client.matchStart);
  start(transport, { hostId: 'other', matchId });
  await sleep(20);
  assert.equal(session.phase, 'loading');
  release();
  await until(() => session.phase === 'match', 'the round entered');
  assert.equal(counts.presentations, 1, 'one world build for one match, however often the room re-sends its start');
  assert.equal(await joined, session.match, 'a caller of the re-sent start gets the entry in flight');
  assert.equal(session.round.matchStart.matchId, matchId);
  session.dispose(); client.dispose();
}
// ---- a match_start for ANOTHER match while loading still supersedes the entry in flight
stage = 'case 10';
{
  let release = null;
  const held = new Promise((resolve) => { release = resolve; });
  const { transport, session, client, counts } = await seat({ presentationGate: () => held });
  start(transport, { hostId: 'other' });
  await until(() => counts.presentations === 1, 'the first entry began');
  const first = session.enterMatch(client.matchStart);
  const { matchId: second } = start(transport, { hostId: 'other' });
  await until(() => counts.presentations === 2, 'the second entry began');
  release();
  await assert.rejects(first, /round superseded/, 'the first round gives way');
  await until(() => session.phase === 'match', 'the second round entered');
  assert.equal(session.round.matchStart.matchId, second);
  session.dispose(); client.dispose();
}
for (const core of cores) core.dispose();
await sleep(50);
assert.ok(cores.every((core) => !core.actor || core.actor.stopped), 'no actor outlives its core');
peakRss = Math.max(peakRss, process.memoryUsage().rss);
assert.ok(peakRss < 1e9, `memory stayed bounded (peak RSS ${(peakRss / 1e6).toFixed(0)} MB)`);
console.log('matchSessionEntryReports.selftest: the elected host reports loading through a slow entry and stops at its actor\'s first report; the ceiling, host_only and a new election stop them; a seat elected while loading hosts with the election\'s secret; a named host whose load fails or that leaves while loading declines as unable, a peer does not; a peer and a running match send none; a re-entry decline is withdrawn at the welcome; a core stopped during its world load starts no actor; a match_start re-sent during loading joins the entry in flight, another match supersedes it');
