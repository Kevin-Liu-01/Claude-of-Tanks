#!/usr/bin/env node
/**
 * Room lifecycle proofs (2026-09-30, docs/MULTIPLAYER-V2.md §13.11): rooms never hang. Node-only headless seats — the
 * real `RoomClient` over real WebSockets (`ws`), and the real `MatchSession` with an in-process host on the scripted
 * WebRTC world where a match must run (`createHeadlessSession`) — drive the lifecycle scenarios below against a room
 * service and time every step against a hard budget. A step that never completes is a HANG, named by what it waited
 * for and the state it left; a wrong outcome is a FAIL; the table prints the time to resolution and the room messages
 * (client→room / room→client, the keepalive frames included) of every scenario, and the process exits non-zero on
 * any hang or failure.
 *
 *   node tools/mp-room-lifecycle.mjs --local                    the in-process room service (server/rooms, p2p), every scenario
 *   node tools/mp-room-lifecycle.mjs --rooms=ws://127.0.0.1:8791 --origin=http://127.0.0.1:0     wrangler dev of cloudflare/rooms
 *   node tools/mp-room-lifecycle.mjs --rooms=wss://cot-rooms.kk23907751.workers.dev --only=a,b,c,f,g    the deployed Worker
 *     (the site Origin header for wss:// unless --origin says otherwise; rooms are created and left, nothing is deployed)
 *   --only=a,b2,c   --skip=d,e     scenario groups (a letter) or ids       --slow    the 30 s / 60 s budgets too (b2, c3, c4, d4)
 *   --json                          the report as JSON on stdout (the table goes to stderr)
 *
 * Scenarios: a the creator leaves an empty lobby; b1/b2 the creator leaves / drops with seats present (a seat leaving
 * during the grace); c1 a seat drops at match start, c2 the host drops at match start, c3 a host that never reports,
 * c4 a peer whose host never accepts its link; d1–d4 every seat leaves mid-match (host last / first / only) or drops;
 * e1/e2 the host's tab dies with / without a willing successor; f1 bogus codes, f2 a join during `playing`, f3 a double
 * join of one seat, f4 the 24 h expiry (the local service's clock); g twenty rooms created and left.
 */
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { RoomClient } from '../src/mp/room/roomClient.ts';
import { RoomError, ROOM_ADMIN_DISCONNECT_GRACE_MS, ROOM_HOST_DISCONNECT_GRACE_MS, ROOM_IDLE_TTL_MS, ROOM_MATCH_REPORT_STALE_AFTER_MS, ROOM_SEAT_DISCONNECT_TTL_MS } from '../src/mp/room/protocol.ts';
import { DEFAULT_RECONNECT } from '../src/mp/transport/transport.ts';
import { createHeadlessSession, memoryStorage, scriptedControls } from '../src/mp/session/headlessSession.ts';
import { createInProcessHostPort } from '../src/mp/host/inProcessHost.ts';
import { RtcWorld } from '../src/mp/transport/rtcDouble.test-support.ts';
import { verifySeatToken } from '../server/match/seatToken.ts';

const SITE_ORIGIN = 'https://cot.kevinliu.studio';
const LOCAL_SECRET = 'mp-room-lifecycle-seat-secret-0123456789abcdef';
/** Every step's ceiling beyond the contract's own constant: a slow Worker cold start, a loaded host. */
const SLACK_MS = 5_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Hang extends Error {
  constructor(step, detail) {
    super(`HANG at "${step}"${detail ? ` — ${detail}` : ''}`);
    this.name = 'Hang';
    this.step = step;
    this.detail = detail;
  }
}

/** The scenario catalogue: id, group, whether it needs the slow budgets, whether it needs the local service's clock. */
export const SCENARIOS = [
  { id: 'a', name: 'creator leaves an empty lobby; a new seat joins the same code', slow: false },
  { id: 'b1', name: 'creator leaves with seats present', slow: false },
  { id: 'b2', name: 'creator drops with seats present; a seat leaves during the grace', slow: true },
  { id: 'c1', name: 'a seat drops at match start (scripted host)', slow: false },
  { id: 'c2', name: 'the host drops at match start', slow: false },
  { id: 'c3', name: 'the host stays connected and never reports', slow: true },
  { id: 'c4', name: "a peer whose host never accepts its link", slow: true },
  { id: 'd1', name: 'all seats leave mid-match, host last; a new seat starts a new match', slow: false },
  { id: 'd2', name: 'all seats leave mid-match, host first; a new seat starts a new match', slow: false },
  { id: 'd3', name: 'the only seat leaves mid-match; a new seat starts a new match', slow: false },
  { id: 'd4', name: 'all seats drop mid-match (sockets closed); a new seat joins and starts', slow: true },
  { id: 'e1', name: "the host's tab dies with a willing successor", slow: false },
  { id: 'e2', name: "the host's tab dies with no willing successor", slow: false },
  { id: 'f1', name: 'a bogus and a malformed room code', slow: false },
  { id: 'f2', name: 'a join during playing (commander and spectator)', slow: false },
  { id: 'f3', name: 'a double join of the same seat, and a stranger with its id', slow: false },
  { id: 'f4', name: 'the 24 h idle expiry and the seat token TTL (the local clock)', slow: false, localOnly: true },
  { id: 'g', name: 'twenty rooms created and left', slow: false },
];

function selectScenarios({ only, skip, slow, local }) {
  const wants = (list, entry) => list.some((token) => token === entry.id || token === entry.id.replace(/\d+$/, ''));
  return SCENARIOS.filter((entry) => {
    if (only.length && !wants(only, entry)) return false;
    if (skip.length && wants(skip, entry)) return false;
    if (entry.slow && !slow && !only.includes(entry.id)) return false;
    if (entry.localOnly && !local) return false;
    return true;
  });
}

// ------------------------------------------------------------ the run

export async function runRoomLifecycle({ rooms = '', origin = null, only = [], skip = [], slow = false, local = !rooms, log = () => {} } = {}) {
  const startedAt = performance.now();
  let server = null;
  let clockOffsetMs = 0;
  let endpoint = rooms;
  if (local) {
    const { createRoomsServer } = await import('../server/rooms/serve.ts');
    const { silentLogger } = await import('../server/match/log.ts');
    server = await createRoomsServer({ host: '127.0.0.1', port: 0, seatSecret: LOCAL_SECRET, world: 'terrain', matchTransport: 'p2p', countdownS: 1, log: silentLogger, wallClock: () => Date.now() + clockOffsetMs });
    endpoint = server.url;
  }
  const originHeader = origin ?? (/^wss:/i.test(endpoint) ? SITE_ORIGIN : null);
  const report = { endpoint, origin: originHeader, local, slow, scenarios: [], wallMs: 0, pass: false };
  // ---- the counting socket factory: every seat's frames, in and out, land on the running scenario
  const counters = { current: null };
  const createSocket = (url) => {
    const ws = new WebSocket(url, originHeader ? { origin: originHeader } : undefined);
    ws.on('error', () => { /* the transport reports the close */ });
    const tally = counters.current;
    if (tally) {
      tally.sockets++;
      ws.on('message', () => { tally.in++; });
      ws.once('close', () => { tally.closed++; });
      const send = ws.send.bind(ws);
      ws.send = (data, ...rest) => { tally.out++; return send(data, ...rest); };
    }
    return ws;
  };
  // ---- one ticker for every headless session (30 Hz) and the scripted WebRTC world
  const rtc = new RtcWorld();
  const sessions = new Set();
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

  const selected = selectScenarios({ only, skip, slow, local });
  for (const entry of selected) {
    const tally = { in: 0, out: 0, sockets: 0, closed: 0 };
    counters.current = tally;
    const seats = [];
    const cores = [];
    const cleanups = [];
    const record = { id: entry.id, name: entry.name, outcome: 'PASS', ms: 0, resolutionMs: null, resolution: '', messages: tally, checks: [], failures: [], hang: null, notes: {} };
    const t0 = performance.now();
    const scenario = {
      endpoint, local, server, createSocket, log: (line) => log(`[${entry.id}] ${line}`),
      clock: { offset: () => clockOffsetMs, advance: (ms) => { clockOffsetMs += ms; } },
      /** A step with a hard budget: a promise, or a predicate polled every 25 ms. */
      async step(label, budgetMs, target, describe = () => '') {
        const started = performance.now();
        if (typeof target === 'function') {
          while (!target()) {
            if (performance.now() - started > budgetMs) throw new Hang(label, `${Math.round(performance.now() - started)} ms; ${describe() || scenario.state()}`);
            await sleep(25);
          }
          return;
        }
        let timer = null;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Hang(label, `${budgetMs} ms; ${describe() || scenario.state()}`)), budgetMs); });
        try { return await Promise.race([target, timeout]); } finally { clearTimeout(timer); }
      },
      check(condition, label) {
        record.checks.push({ label, ok: !!condition });
        if (!condition) record.failures.push(label);
      },
      resolution(ms, label = '') { record.resolutionMs = Math.round(ms); if (label) record.resolution = label; },
      note(key, value) { record.notes[key] = value; },
      cleanup(fn) { cleanups.push(fn); },
      /** A lobby seat: the real room client, no session. */
      lobbySeat(id, name, { storage = memoryStorage(), reconnect = null } = {}) {
        const seat = new RoomClient({ endpoint, player: { id, name }, storage, clientBuild: 'lifecycle', transport: { createSocket, ...(reconnect ? { reconnect } : {}) } });
        seat.hostChanges = [];
        seat.statuses = [];
        seat.closedReasons = [];
        seat.onHostChanged((change) => seat.hostChanges.push({ ...change, hostSecret: typeof change.hostSecret === 'string', at: performance.now() }));
        seat.onMatchStatus((payload) => seat.statuses.push({ status: payload.status, at: performance.now() }));
        seat.onClosed(({ reason }) => seat.closedReasons.push(reason));
        seats.push({ id, seat, kind: 'lobby' });
        return seat;
      },
      /** A full seat: the real session, an in-process host when `canHost`, the scripted WebRTC world. */
      sessionSeat(id, name, index, { canHost = true, storage = memoryStorage(), reconnect = null } = {}) {
        const entrySession = { id, headless: null, disposed: false, events: [], logs: [] };
        entrySession.headless = createHeadlessSession({
          endpoint, player: { id, name }, createSocket, storage, controls: scriptedControls(index),
          session: {
            ...(reconnect ? { transport: { reconnect } } : {}),
            p2p: {
              createPeerConnection: rtc.createPeerConnection,
              ...(canHost ? { createHostPort: createInProcessHostPort({ world: 'terrain', onCore: (core) => cores.push(core), keyframeIntervalMs: 500, reportIntervalMs: 1000 }) } : {}),
              manifestBase: null, tier: 'desktop', countdownS: 1,
              onLog: (level, message, fields) => entrySession.logs.push({ level, message, ...(fields ?? {}) }),
            },
          },
        });
        entrySession.headless.session.onP2p((event) => entrySession.events.push(event));
        const room = entrySession.headless.room;
        room.hostChanges = [];
        room.statuses = [];
        room.closedReasons = [];
        room.onHostChanged((change) => room.hostChanges.push({ ...change, hostSecret: typeof change.hostSecret === 'string', at: performance.now() }));
        room.onMatchStatus((payload) => room.statuses.push({ status: payload.status, at: performance.now() }));
        room.onClosed(({ reason }) => room.closedReasons.push(reason));
        sessions.add(entrySession);
        seats.push({ id, seat: room, kind: 'session', entry: entrySession });
        return entrySession;
      },
      retire(entrySession) { if (!entrySession.disposed) { entrySession.disposed = true; entrySession.headless.dispose(); } },
      /** Every seat's state, for a hang's description. */
      state() {
        return seats.map(({ id, seat, kind, entry: entrySession }) => {
          const stats = seat.stats();
          const base = `${id}:${stats.phase}/${stats.transport} room=${seat.room?.phase ?? '-'} admin=${seat.room?.adminId ?? '-'} host=${stats.hostId ?? '-'}@${stats.generation}`;
          if (kind !== 'session' || entrySession.disposed) return base;
          const session = entrySession.headless.session.stats();
          return `${base} session=${session.phase}${session.p2p ? ` role=${session.p2p.role} migrating=${session.p2p.migrating} host=${session.p2p.hostState ?? '-'}` : ''}${session.match ? ` link=${session.match.transportState ?? '?'}` : ''}`;
        }).join(' | ');
      },
    };
    log(`--- ${entry.id}: ${entry.name}`);
    try {
      await runScenario(entry.id, scenario);
      if (record.failures.length) record.outcome = 'FAIL';
    } catch (error) {
      if (error instanceof Hang) { record.outcome = 'HANG'; record.hang = { step: error.step, detail: error.detail }; }
      else { record.outcome = 'FAIL'; record.failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error)); }
    } finally {
      for (const fn of cleanups.reverse()) { try { await Promise.race([fn(), sleep(3000)]); } catch { /* best effort */ } }
      for (const { seat, kind, entry: entrySession } of seats) {
        if (kind === 'session') { scenario.retire(entrySession); sessions.delete(entrySession); } else seat.dispose();
      }
      for (const core of cores) { try { core.dispose(); } catch { /* gone */ } }
      // every socket this scenario opened closes (a lingering socket is a hang of its own)
      const closeStarted = performance.now();
      while (tally.closed < tally.sockets && performance.now() - closeStarted < 3000) await sleep(25);
      if (tally.closed < tally.sockets) { record.outcome = record.outcome === 'PASS' ? 'FAIL' : record.outcome; record.failures.push(`${tally.sockets - tally.closed} of ${tally.sockets} sockets still open 3 s after the scenario`); }
      record.ms = Math.round(performance.now() - t0);
      counters.current = null;
    }
    record.checks = record.checks.length;
    report.scenarios.push(record);
    log(`${entry.id}: ${record.outcome}${record.hang ? ` (${record.hang.step}: ${record.hang.detail})` : ''}${record.failures.length ? ` ${record.failures.join('; ')}` : ''} in ${record.ms} ms, ${tally.out}→/${tally.in}← messages`);
  }
  ticking = false;
  await ticker;
  if (server) await Promise.race([server.close(), sleep(5000)]);
  report.wallMs = Math.round(performance.now() - startedAt);
  report.pass = report.scenarios.length > 0 && report.scenarios.every((scenario) => scenario.outcome === 'PASS');
  report.hangs = report.scenarios.filter((scenario) => scenario.outcome === 'HANG').length;
  return report;
}

// ------------------------------------------------------------ the scenarios

const rejects = async (promise, code) => {
  try { await promise; } catch (error) { return error instanceof RoomError && error.code === code ? true : `refused as ${error?.code ?? error?.message ?? error}`; }
  return 'accepted';
};
const readyAll = (seats) => Promise.all(seats.map((seat) => seat.setReady(true)));
const lobbyRoom = (s) => ({ mode: 'private', selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: true } });

/** Three lobby seats (p1 admin, p2, p3) ready in one room; returns them with the code. */
async function lobbyTrio(s, { teamSize = 2 } = {}) {
  const p1 = s.lobbySeat('p1', 'Creator');
  const room = await s.step('create', 10_000, p1.create({ ...lobbyRoom(s), settings: { teamSize, mapId: 'verdant', botsFill: true } }));
  const p2 = s.lobbySeat('p2', 'Two');
  const p3 = s.lobbySeat('p3', 'Three');
  await s.step('p2 joins', 10_000, p2.join({ roomCode: room.roomCode, selection: { specId: 't90m' } }));
  await s.step('p3 joins', 10_000, p3.join({ roomCode: room.roomCode, selection: { specId: 'leo2a7v' } }));
  await s.step('three seats seen by everyone', 5_000, () => [p1, p2, p3].every((seat) => seat.room?.players.length === 3));
  return { p1, p2, p3, code: room.roomCode };
}

/** A scripted host's report through the real room client. */
const reportAs = (seat, phase, tick, verdict) => seat.reportMatch({ matchId: seat.matchStart.matchId, generation: seat.generation, phase, tick, ...(verdict ? { verdict } : {}) });

/** N session seats in one room, the match started and playing on the host's actor; `canHost` per seat. */
async function playingMatch(s, specs, { watcher = false } = {}) {
  const entries = specs.map((spec, index) => s.sessionSeat(spec.id, spec.name ?? spec.id, index, { canHost: spec.canHost ?? true }));
  const [first, ...rest] = entries;
  const room = await s.step('create', 10_000, first.headless.room.create({ mode: 'private', selection: { specId: 'm1a2' }, settings: { teamSize: Math.max(1, Math.ceil(specs.length / 2)), mapId: 'verdant', botsFill: true } }));
  for (const entry of rest) await s.step(`${entry.id} joins`, 10_000, entry.headless.room.join({ roomCode: room.roomCode, selection: { specId: 't90m' } }));
  let seated = entries.length;
  if (watcher) {
    s.watcher = s.lobbySeat('w', 'Watcher');
    await s.step('a spectator joins to observe', 10_000, s.watcher.join({ roomCode: room.roomCode, selection: { specId: 'm1a2' }, team: 'spectator' }));
    seated++;
  }
  await s.step('every seat in the room', 5_000, () => entries.every((entry) => entry.headless.room.room?.players.length === seated));
  await s.step('everyone ready', 10_000, readyAll(entries.map((entry) => entry.headless.room)));
  await s.step('start', 15_000, first.headless.room.start());
  await s.step('every seat entered the match', 10_000, () => entries.every((entry) => entry.headless.session.round));
  await s.step('every seat welcomed by the host', 20_000, () => entries.every((entry) => entry.headless.session.match?.welcome));
  await s.step('the room is playing', 15_000, () => entries.every((entry) => entry.headless.room.room?.phase === 'playing'));
  return { entries, code: room.roomCode };
}

/** A brand-new seat joins the code, owns the room (or becomes admin within the admin grace) and starts a match that goes live. */
async function newSeatStarts(s, code, { adminBudgetMs = SLACK_MS } = {}) {
  const p4 = s.sessionSeat('p4', 'Fresh', 3);
  await s.step('a brand-new seat joins the same code', 10_000, p4.headless.room.join({ roomCode: code, selection: { specId: 'm1a2' } }));
  const joinedAt = performance.now();
  await s.step('the new seat is the admin', adminBudgetMs, () => p4.headless.room.isAdmin);
  s.note('adminAfterMs', Math.round(performance.now() - joinedAt));
  await s.step('ready', 10_000, p4.headless.room.setReady(true));
  await s.step('the new seat starts a new match', 15_000, p4.headless.room.start());
  await s.step('its match_start names it', 10_000, () => p4.headless.room.matchStart?.hostId === 'p4');
  await s.step('its host is live and the room is playing', 20_000, () => p4.headless.session.matchHost?.state === 'live' && p4.headless.room.room?.phase === 'playing');
  return p4;
}

async function runScenario(id, s) {
  switch (id) {
    case 'a': {
      const p1 = s.lobbySeat('p1', 'Creator');
      const room = await s.step('create', 10_000, p1.create({ ...lobbyRoom(s), settings: { teamSize: 1, mapId: 'verdant', botsFill: true } }));
      const t0 = performance.now();
      await s.step('the creator leaves', 10_000, p1.leave());
      s.check(p1.phase === 'closed' && p1.lastClosedReason === 'left_room', `the creator's client closed (${p1.phase}/${p1.lastClosedReason})`);
      const p2 = s.lobbySeat('p2', 'Late');
      const joined = await s.step('a new seat joins the same code', 10_000, p2.join({ roomCode: room.roomCode, selection: { specId: 't90m' } }));
      s.resolution(performance.now() - t0, 'joined, admin, started');
      s.check(joined.adminId === 'p2' && p2.isAdmin, `the next seat owns the room (admin ${joined.adminId})`);
      s.check(joined.players.length === 1 && joined.phase === 'waiting', `an empty waiting room, one seat (${joined.phase}, ${joined.players.length})`);
      await s.step('ready', 10_000, p2.setReady(true));
      await s.step('the new owner starts', 15_000, p2.start());
      await s.step('its match_start names it', 10_000, () => p2.matchStart?.hostId === 'p2');
      s.cleanup(() => p2.leave());
      return;
    }
    case 'b1': {
      const { p1, p2, p3 } = await lobbyTrio(s);
      const t0 = performance.now();
      await s.step('the creator leaves', 10_000, p1.leave());
      await s.step('the admin passes to a remaining seat', SLACK_MS, () => p2.room?.adminId === 'p2' && p3.room?.adminId === 'p2');
      s.resolution(performance.now() - t0, 'admin passed');
      s.check(p3.room.players.length === 2 && p2.room.players.length === 2, 'the remaining seats keep their room_state');
      await s.step('ready', 10_000, readyAll([p2, p3]));
      await s.step('the new admin starts', 15_000, p2.start());
      await s.step('match_start on both, hosted by the new admin', 10_000, () => p2.matchStart?.hostId === 'p2' && p3.matchStart?.hostId === 'p2');
      s.cleanup(async () => { await p3.leave(); await p2.leave(); });
      return;
    }
    case 'b2': {
      const { p1, p2, p3 } = await lobbyTrio(s);
      const t0 = performance.now();
      p1.disconnect('tab closed');
      await s.step('the room sees the creator disconnected', SLACK_MS, () => p2.room?.players.find((player) => player.id === 'p1')?.connected === false);
      await sleep(1000);
      await s.step('another seat leaves during the grace', 10_000, p3.leave());
      await s.step(`the admin passes within the ${ROOM_ADMIN_DISCONNECT_GRACE_MS} ms grace`, ROOM_ADMIN_DISCONNECT_GRACE_MS + SLACK_MS, () => p2.room?.adminId === 'p2');
      s.resolution(performance.now() - t0, 'admin passed');
      s.check(p2.room.players.some((player) => player.id === 'p1' && !player.connected), 'the dropped seat is held for its lease');
      await s.step('ready', 10_000, p2.setReady(true));
      await s.step('the new admin starts', 15_000, p2.start());
      await s.step('its match_start names it', 10_000, () => p2.matchStart?.hostId === 'p2');
      s.cleanup(() => p2.leave());
      return;
    }
    case 'c1': {
      const { p1, p2, p3 } = await lobbyTrio(s);
      await s.step('ready', 10_000, readyAll([p1, p2, p3]));
      await s.step('start', 15_000, p1.start());
      await s.step('match_start on every seat', 10_000, () => [p1, p2, p3].every((seat) => seat.matchStart));
      s.check(p1.matchStart.hostId === 'p1', `the creator hosts (${p1.matchStart.hostId})`);
      const t0 = performance.now();
      await s.step('the host reports loading', 10_000, reportAs(p1, 'loading', 0));
      p3.disconnect('tab closed during the countdown');
      await s.step('the room sees the dropped seat', SLACK_MS, () => p1.room?.players.find((player) => player.id === 'p3')?.connected === false);
      await s.step('the host reports the countdown', 10_000, reportAs(p1, 'countdown', 30));
      await s.step('the host reports playing', 10_000, reportAs(p1, 'playing', 120));
      await s.step('the room is playing on every seat', SLACK_MS, () => p1.room?.phase === 'playing' && p2.room?.phase === 'playing');
      s.resolution(performance.now() - t0, 'playing');
      await s.step('the host reports the verdict', 10_000, reportAs(p1, 'ended', 900, { result: 'alpha', reason: 'elimination' }));
      await s.step('the room is back in the lobby with the result', SLACK_MS, () => p1.room?.phase === 'waiting' && p1.room.lastResult?.result === 'alpha' && p2.statuses.some((status) => status.status === 'ended'));
      s.check(p2.room.players.find((player) => player.id === 'p3')?.connected === false, 'the dropped seat is still held (its lease runs from the end)');
      s.cleanup(async () => { await p2.leave(); await p1.leave(); });
      return;
    }
    case 'c2': {
      const { p1, p2, p3 } = await lobbyTrio(s);
      await s.step('ready', 10_000, readyAll([p1, p2, p3]));
      await s.step('start', 15_000, p1.start());
      await s.step('match_start on every seat', 10_000, () => [p1, p2, p3].every((seat) => seat.matchStart));
      const t0 = performance.now();
      p1.disconnect('host tab died at the start');
      await s.step(`host_changed within the ${ROOM_HOST_DISCONNECT_GRACE_MS} ms grace`, ROOM_HOST_DISCONNECT_GRACE_MS + SLACK_MS, () => p2.hostChanges.some((change) => change.generation === 2) && p3.hostChanges.some((change) => change.generation === 2));
      s.resolution(performance.now() - t0, 'successor elected');
      const change = p2.hostChanges.find((entry) => entry.generation === 2);
      s.check(change.hostId === 'p2' && change.reason === 'timeout', `the next commander is elected on the timeout (${change.hostId}, ${change.reason})`);
      s.check(change.hostSecret && !p3.hostChanges.find((entry) => entry.generation === 2).hostSecret, 'the secret reaches the new host alone');
      s.check(performance.now() - t0 >= ROOM_HOST_DISCONNECT_GRACE_MS - 250, 'the election waited out the grace');
      await s.step('the successor reports playing', 10_000, reportAs(p2, 'playing', 200));
      await s.step('the room is playing under the successor', SLACK_MS, () => p3.room?.phase === 'playing' && p3.room.host.hostId === 'p2');
      await s.step('the successor reports the verdict', 10_000, reportAs(p2, 'ended', 1000, { result: 'bravo', reason: 'elimination' }));
      await s.step('back in the lobby', SLACK_MS, () => p3.room?.phase === 'waiting' && p3.statuses.some((status) => status.status === 'ended'));
      s.cleanup(async () => { await p3.leave(); await p2.leave(); });
      return;
    }
    case 'c3': {
      const p1 = s.lobbySeat('p1', 'Creator');
      const room = await s.step('create', 10_000, p1.create(lobbyRoom(s)));
      const p2 = s.lobbySeat('p2', 'Two');
      await s.step('p2 joins', 10_000, p2.join({ roomCode: room.roomCode, selection: { specId: 't90m' } }));
      await s.step('ready', 10_000, readyAll([p1, p2]));
      await s.step('start', 15_000, p1.start());
      await s.step('match_start on both', 10_000, () => p1.matchStart && p2.matchStart);
      const t0 = performance.now();
      await s.step(`host_changed within the ${ROOM_MATCH_REPORT_STALE_AFTER_MS} ms report budget`, ROOM_MATCH_REPORT_STALE_AFTER_MS + SLACK_MS, () => p2.hostChanges.some((change) => change.generation === 2));
      s.resolution(performance.now() - t0, 'silent host replaced');
      const change = p2.hostChanges.find((entry) => entry.generation === 2);
      s.check(change.hostId === 'p2' && change.reason === 'timeout', `the silent host's peer takes over (${change.hostId}, ${change.reason})`);
      await s.step('the successor ends the match', 10_000, reportAs(p2, 'ended', 100, { result: 'draw', reason: 'time_limit' }));
      await s.step('back in the lobby', SLACK_MS, () => p1.room?.phase === 'waiting');
      s.cleanup(async () => { await p2.leave(); await p1.leave(); });
      return;
    }
    case 'c4': {
      // the host is a room seat that reports but never accepts a link (its actor hangs); the peer's session must give up
      const p1 = s.lobbySeat('p1', 'Creator');
      const room = await s.step('create', 10_000, p1.create(lobbyRoom(s)));
      const p2 = s.sessionSeat('p2', 'Peer', 1, { canHost: false });
      await s.step('the peer joins', 10_000, p2.headless.room.join({ roomCode: room.roomCode, selection: { specId: 't90m' } }));
      await s.step('ready', 10_000, readyAll([p1, p2.headless.room]));
      await s.step('start', 15_000, p1.start());
      await s.step('the peer entered the match', 10_000, () => p2.headless.session.round);
      const t0 = performance.now();
      let hostAlive = true;
      const reporter = (async () => { let tick = 0; while (hostAlive) { try { await reportAs(p1, tick === 0 ? 'loading' : 'countdown', tick); } catch { /* the match may be over */ } tick += 60; await sleep(5000); } })();
      const budget = DEFAULT_RECONNECT.windowMs + SLACK_MS * 2;
      await s.step(`the peer's session gives up within the ${DEFAULT_RECONNECT.windowMs} ms link window`, budget, () => p2.headless.session.phase === 'lost');
      s.resolution(performance.now() - t0, 'session lost');
      const stats = p2.headless.session.stats();
      s.check(stats.phase === 'lost', `the session is terminal (${stats.phase})`);
      s.check(p1.room?.phase === 'starting', `the room never left starting on the hanging host's reports (${p1.room?.phase})`);
      hostAlive = false;
      s.cleanup(async () => { await reporter; try { await reportAs(p1, 'ended', 0, { result: 'draw', reason: 'host_hung' }); } catch { /* done */ } await p2.headless.room.leave(); await p1.leave(); });
      return;
    }
    case 'd1':
    case 'd2':
    case 'd3': {
      const specs = id === 'd3' ? [{ id: 'p1' }] : [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
      const { entries, code } = await playingMatch(s, specs);
      const [p1, p2, p3] = entries;
      const leave = async (entry, label) => {
        await entry.headless.session.leaveMatch('garage');
        await s.step(`${label} leaves the room`, 10_000, entry.headless.room.leave());
        s.retire(entry);
      };
      const t0 = performance.now();
      if (id === 'd1') {
        await leave(p2, 'peer p2'); await leave(p3, 'peer p3');
        s.check(p1.headless.session.matchHost?.state === 'live', 'the host plays on with bots');
        await leave(p1, 'the host, last');
      } else if (id === 'd2') {
        await leave(p1, 'the host, first');
        await s.step('a peer is elected and hosts', ROOM_HOST_DISCONNECT_GRACE_MS + SLACK_MS, () => p2.headless.session.role === 'host' && p2.headless.session.matchHost?.state === 'live');
        await s.step('the other peer is live on the new host', 20_000, () => p3.headless.session.match?.phase === 'live' && p3.headless.session.stats().p2p?.hostId === 'p2' && p3.headless.session.stats().p2p?.migrating === false);
        // a Garage return declines (`unable`) before the seat leaves: the room elects on the decline, at once (P1b); the leave finds the host already moved
        s.check(['declined', 'left'].includes(p2.headless.room.hostChanges.at(-1)?.reason), `the departure elected at once (${p2.headless.room.hostChanges.at(-1)?.reason})`);
        await leave(p2, 'the second host');
        await s.step('the last peer hosts', ROOM_HOST_DISCONNECT_GRACE_MS + SLACK_MS, () => p3.headless.session.role === 'host' && p3.headless.session.matchHost?.state === 'live');
        await leave(p3, 'the last seat');
      } else {
        await leave(p1, 'the only seat');
      }
      s.resolution(performance.now() - t0, 'everyone gone');
      const p4 = await newSeatStarts(s, code);
      s.check(p4.headless.room.room.lastResult?.reason === 'match_lost' || p4.headless.room.room.round === 2, `the previous match closed as lost and a new round runs (${JSON.stringify(p4.headless.room.room.lastResult)}, round ${p4.headless.room.room.round})`);
      s.cleanup(async () => { await p4.headless.session.leaveMatch('done'); await p4.headless.room.leave(); });
      return;
    }
    case 'd4': {
      // a spectator seated before the start observes the room (a playing room admits nobody — f2); it leaves before the
      // admin grace so the role cannot migrate to it
      const { entries, code } = await playingMatch(s, [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }], { watcher: true });
      const [p1, p2, p3] = entries;
      const watcher = s.watcher;
      const t0 = performance.now();
      for (const entry of [p2, p3, p1]) { entry.headless.room.disconnect('tab closed'); s.retire(entry); }
      // the room hears nothing more from any commander: the host grace loses the match; the seats are held for their leases
      await s.step(`the match is lost within the ${ROOM_HOST_DISCONNECT_GRACE_MS} ms grace`, ROOM_HOST_DISCONNECT_GRACE_MS + SLACK_MS, () => watcher.room?.phase === 'waiting' && watcher.room.lastResult?.reason === 'match_lost' && watcher.statuses.some((status) => status.status === 'lost'));
      s.resolution(performance.now() - t0, 'match lost, room waiting');
      s.check(watcher.room.players.filter((player) => !player.connected).length === 3, `the dropped seats are held for their ${ROOM_SEAT_DISCONNECT_TTL_MS} ms leases`);
      await s.step('the watcher leaves', 10_000, watcher.leave());
      const p4 = await newSeatStarts(s, code, { adminBudgetMs: ROOM_ADMIN_DISCONNECT_GRACE_MS + SLACK_MS });
      s.check(p4.headless.room.room.players.filter((player) => !player.connected).length === 3, 'the dropped seats are still held (reaped at their lease)');
      s.cleanup(async () => { await p4.headless.session.leaveMatch('done'); await p4.headless.room.leave(); });
      return;
    }
    case 'e1': {
      const { entries } = await playingMatch(s, [{ id: 'p1' }, { id: 'p2' }, { id: 'p3', canHost: false }]);
      const [p1, p2, p3] = entries;
      s.check(p3.headless.room.room.players.find((player) => player.id === 'p3')?.hostDeclined === true, 'the seat that cannot host declared it');
      const t0 = performance.now();
      p1.headless.room.disconnect('tab died');
      s.retire(p1);
      await s.step(`host_changed within the ${ROOM_HOST_DISCONNECT_GRACE_MS} ms grace`, ROOM_HOST_DISCONNECT_GRACE_MS + SLACK_MS, () => p2.headless.room.hostChanges.some((change) => change.generation === 2));
      const electedMs = performance.now() - t0;
      await s.step('the willing successor hosts', 20_000, () => p2.headless.session.role === 'host' && p2.headless.session.matchHost?.state === 'live' && p2.headless.session.match?.phase === 'live');
      await s.step('the other peer is live on it', 20_000, () => p3.headless.session.match?.phase === 'live' && p3.headless.session.stats().p2p?.hostId === 'p2' && p3.headless.session.stats().p2p?.migrating === false);
      s.resolution(performance.now() - t0, `elected ${Math.round(electedMs)} ms, every seat live`);
      s.check(p2.headless.session.stats().p2p?.migrating === false, 'nobody is left migrating');
      s.cleanup(async () => { for (const entry of [p3, p2]) { await entry.headless.session.leaveMatch('done'); await entry.headless.room.leave(); } });
      return;
    }
    case 'e2': {
      const { entries } = await playingMatch(s, [{ id: 'p1' }, { id: 'p2', canHost: false }]);
      const [p1, p2] = entries;
      const t0 = performance.now();
      p1.headless.room.disconnect('tab died');
      s.retire(p1);
      // the contract: the last resort is elected at the grace, says it cannot host, and the room ends the match at once
      // (before 2026-09-30 the room kept it as a host that never reported and the peers waited out the 30 s report budget)
      const budget = ROOM_HOST_DISCONNECT_GRACE_MS + ROOM_MATCH_REPORT_STALE_AFTER_MS + SLACK_MS * 2;
      await s.step('the peer reaches a terminal state', budget, () => p2.headless.session.phase === 'lost' || p2.headless.session.phase === 'lobby');
      s.resolution(performance.now() - t0, `terminal (${p2.headless.session.phase})`);
      const elected = p2.headless.room.hostChanges.find((change) => change.generation === 2);
      s.check(!!elected && elected.hostId === 'p2', `the last resort was elected (${elected?.hostId})`);
      s.check(p2.headless.room.statuses.some((status) => status.status === 'lost'), 'the room ended the match as lost');
      s.check(p2.headless.session.stats().p2p?.migrating !== true, 'the peer is not left migrating');
      await s.step('the room is back in the lobby', SLACK_MS, () => p2.headless.room.room?.phase === 'waiting' && p2.headless.room.room.host.hostId === null);
      const withinGrace = (performance.now() - t0) < ROOM_HOST_DISCONNECT_GRACE_MS + SLACK_MS;
      s.note('withinGrace', withinGrace);
      s.check(withinGrace, `resolved within the grace plus slack (${Math.round(performance.now() - t0)} ms), not the report budget`);
      s.cleanup(async () => { await p2.headless.session.leaveMatch('done'); await p2.headless.room.leave(); });
      return;
    }
    case 'f1': {
      const p = s.lobbySeat('p1', 'Lost');
      const t0 = performance.now();
      const bogus = await s.step('a bogus code is refused', 10_000, rejects(p.join({ roomCode: 'ZZZZZZ', selection: { specId: 'm1a2' } }), 'room_not_found'));
      s.check(bogus === true, `bogus code: ${bogus === true ? 'room_not_found' : bogus}`);
      s.check(p.phase === 'idle', `the client is free again (${p.phase})`);
      const malformed = await s.step('a malformed code is refused before any socket', 5_000, rejects(p.join({ roomCode: 'NOPE', selection: { specId: 'm1a2' } }), 'invalid_room_code'));
      s.check(malformed === true, `malformed code: ${malformed === true ? 'invalid_room_code' : malformed}`);
      s.resolution(performance.now() - t0, 'clean refusals');
      return;
    }
    case 'f2': {
      const p1 = s.lobbySeat('p1', 'Creator');
      const room = await s.step('create', 10_000, p1.create({ ...lobbyRoom(s), settings: { teamSize: 1, mapId: 'verdant', botsFill: true } }));
      await s.step('ready', 10_000, p1.setReady(true));
      await s.step('start', 15_000, p1.start());
      await s.step('match_start', 10_000, () => p1.matchStart);
      await s.step('the host reports playing', 10_000, reportAs(p1, 'playing', 60));
      await s.step('the room is playing', SLACK_MS, () => p1.room?.phase === 'playing');
      const t0 = performance.now();
      const p2 = s.lobbySeat('p2', 'Latecomer');
      const commander = await s.step('a commander joining a playing room is refused', 10_000, rejects(p2.join({ roomCode: room.roomCode, selection: { specId: 't90m' } }), 'room_locked'));
      s.check(commander === true, `commander: ${commander === true ? 'room_locked' : commander}`);
      const spectator = await s.step('a spectator joining a playing room is refused too', 10_000, rejects(p2.join({ roomCode: room.roomCode, selection: { specId: 't90m' }, team: 'spectator' }), 'room_locked'));
      s.check(spectator === true, `spectator: ${spectator === true ? 'room_locked' : spectator}`);
      s.resolution(performance.now() - t0, 'refused as room_locked (spectators too)');
      await s.step('the host ends the match', 10_000, reportAs(p1, 'ended', 600, { result: 'alpha', reason: 'elimination' }));
      await s.step('the room waits again', SLACK_MS, () => p1.room?.phase === 'waiting');
      await s.step('the latecomer joins the lobby', 10_000, p2.join({ roomCode: room.roomCode, selection: { specId: 't90m' } }));
      s.cleanup(async () => { await p2.leave(); await p1.leave(); });
      return;
    }
    case 'f3': {
      const storage = memoryStorage();
      const p1 = s.lobbySeat('p1', 'Creator', { storage });
      const room = await s.step('create', 10_000, p1.create(lobbyRoom(s)));
      const t0 = performance.now();
      const twin = s.lobbySeat('p1', 'Creator', { storage });
      const joined = await s.step('the same seat joins again from a second client with its capability', 10_000, twin.join({ roomCode: room.roomCode }));
      s.check(joined.players.length === 1, `one seat, not two (${joined.players.length})`);
      await s.step('the first client is retired', SLACK_MS, () => p1.phase === 'closed');
      s.check(p1.lastClosedReason === 'resume_denied', `the retired client learns why (${p1.lastClosedReason})`);
      const stranger = s.lobbySeat('p1', 'Impostor');
      const refused = await s.step('a stranger with the same id and no capability is refused', 10_000, rejects(stranger.join({ roomCode: room.roomCode }), 'resume_denied'));
      s.check(refused === true, `stranger: ${refused === true ? 'resume_denied' : refused}`);
      s.check(twin.phase === 'joined', `the seat's real client stays (${twin.phase})`);
      s.resolution(performance.now() - t0, 'one seat, one socket');
      s.cleanup(() => twin.leave());
      return;
    }
    case 'f4': {
      // the local service's clock: the room expires 24 h after its last message; a seat token dies with the match's day
      const { createRoomsServer } = await import('../server/rooms/serve.ts');
      const { silentLogger } = await import('../server/match/log.ts');
      let offset = 0;
      const own = await createRoomsServer({ host: '127.0.0.1', port: 0, seatSecret: LOCAL_SECRET, world: 'terrain', matchTransport: 'p2p', countdownS: 1, log: silentLogger, wallClock: () => Date.now() + offset });
      s.cleanup(() => own.close());
      const p1 = new RoomClient({ endpoint: own.url, player: { id: 'p1', name: 'Creator' }, storage: memoryStorage(), clientBuild: 'lifecycle', transport: { createSocket: s.createSocket } });
      const closedReasons = [];
      p1.onClosed(({ reason }) => closedReasons.push(reason));
      s.cleanup(() => p1.dispose());
      const room = await s.step('create', 10_000, p1.create({ ...lobbyRoom(s), settings: { teamSize: 1, mapId: 'verdant', botsFill: true } }));
      await s.step('ready', 10_000, p1.setReady(true));
      await s.step('start', 15_000, p1.start());
      await s.step('match_start', 10_000, () => p1.matchStart);
      const token = p1.matchStart.seatToken;
      const t0 = performance.now();
      offset += ROOM_IDLE_TTL_MS + 1000;
      const actor = own.roomService.rooms.get(room.roomCode);
      await actor.tick();
      await s.step('the seat hears the expiry', SLACK_MS, () => closedReasons.includes('expired'));
      s.check(p1.phase === 'closed', `the client is closed (${p1.phase})`);
      s.check(actor.snapshot === null && actor.empty, 'the actor is empty with no deadline');
      s.check(actor.nextDeadline() === null, `no alarm remains (${actor.nextDeadline()})`);
      const late = new RoomClient({ endpoint: own.url, player: { id: 'p1', name: 'Creator' }, storage: memoryStorage(), clientBuild: 'lifecycle', transport: { createSocket: s.createSocket } });
      s.cleanup(() => late.dispose());
      const refused = await s.step('a reconnect after the boundary is refused', 10_000, rejects(late.join({ roomCode: room.roomCode }), 'room_not_found'));
      s.check(refused === true, `reconnect: ${refused === true ? 'room_not_found' : refused}`);
      const verdict = verifySeatToken(LOCAL_SECRET, token, Date.now() + offset);
      s.check(verdict.ok === false, `a seat token signed for the match is refused past the boundary (${verdict.ok ? 'accepted' : verdict.reason}; p2p tokens are signed with the per-match secret, so the room's secret refuses the signature and the host's clock refuses the age)`);
      s.resolution(performance.now() - t0, 'expired, refused');
      return;
    }
    case 'g': {
      const t0 = performance.now();
      const codes = [];
      for (let index = 0; index < 20; index++) {
        const seat = s.lobbySeat(`churn${index}`, `Churn ${index}`);
        const room = await s.step(`room ${index + 1} created`, 10_000, seat.create(lobbyRoom(s)));
        codes.push(room.roomCode);
        await s.step(`room ${index + 1} left`, 10_000, seat.leave());
        s.check(seat.phase === 'closed' && seat.lastClosedReason === 'left_room', `client ${index + 1} closed (${seat.phase})`);
      }
      s.resolution(performance.now() - t0, '20 rooms');
      if (s.local) {
        let clean = 0;
        for (const code of codes) {
          const actor = s.server.roomService.rooms.get(code);
          if (!actor) { clean++; continue; }
          const only = actor.socketCount === 0 && actor.snapshot?.players.length === 0 && actor.nextDeadline() === actor.snapshot.touchedAt + ROOM_IDLE_TTL_MS;
          if (only) clean++;
        }
        s.check(clean === codes.length, `${clean} of ${codes.length} actors hold no socket and no deadline but the idle expiry`);
        s.note('actorsWithOnlyExpiry', clean);
      }
      return;
    }
    default:
      throw new Error(`unknown scenario ${id}`);
  }
}

// ------------------------------------------------------------ the report

export function formatReport(report) {
  const rows = [['scenario', 'outcome', 'resolution', 'messages →/←', 'detail']];
  for (const scenario of report.scenarios) {
    const detail = scenario.outcome === 'HANG' ? `${scenario.hang.step}: ${scenario.hang.detail}` : scenario.failures.length ? scenario.failures.join('; ') : `${scenario.resolution}${Object.keys(scenario.notes).length ? ` ${JSON.stringify(scenario.notes)}` : ''}`;
    rows.push([`${scenario.id} ${scenario.name}`, scenario.outcome, scenario.resolutionMs === null ? '–' : `${(scenario.resolutionMs / 1000).toFixed(2)} s`, `${scenario.messages.out}/${scenario.messages.in}`, detail.slice(0, 220)]);
  }
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const line = (row) => row.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd();
  const lines = [`mp room lifecycle: ${report.endpoint}${report.origin ? ` (Origin ${report.origin})` : ''}${report.local ? ' [local]' : ''}, ${report.scenarios.length} scenarios in ${(report.wallMs / 1000).toFixed(1)} s`, line(rows[0]), line(rows[0].map((cell, column) => '-'.repeat(widths[column])))];
  for (const row of rows.slice(1)) lines.push(line(row));
  lines.push(report.pass ? 'mp room lifecycle: PASS — no room, seat or client hung' : `mp room lifecycle: FAIL — ${report.hangs} hang(s), ${report.scenarios.filter((scenario) => scenario.outcome === 'FAIL').length} failure(s)`);
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const argValue = (name) => { const prefix = `--${name}=`; const raw = process.argv.find((entry) => entry.startsWith(prefix)); return raw ? raw.slice(prefix.length) : ''; };
  const list = (name) => argValue(name).split(',').map((entry) => entry.trim()).filter(Boolean);
  const json = process.argv.includes('--json');
  const report = await runRoomLifecycle({
    rooms: argValue('rooms'), origin: argValue('origin') || null, only: list('only'), skip: list('skip'), slow: process.argv.includes('--slow'),
    local: process.argv.includes('--local') || !argValue('rooms'),
    log: (line) => process.stderr.write(`[room-lifecycle] ${line}\n`),
  });
  if (json) { process.stderr.write(`${formatReport(report)}\n`); console.log(JSON.stringify(report, null, 2)); } else console.log(formatReport(report));
  process.exitCode = report.pass ? 0 : 1;
}
