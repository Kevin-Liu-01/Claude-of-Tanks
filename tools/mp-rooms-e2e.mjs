#!/usr/bin/env node
/**
 * Multiplayer v2 rooms end-to-end, headless, against the in-process room
 * service (server/rooms/serve.ts: rooms + match on one port, real sockets):
 * N headless sessions (src/mp/session) create / join / ready a room, the
 * admin starts, every seat is welcomed by the match, the creator leaves
 * mid-match and the match continues to a verdict under a migrated admin, a
 * rematch runs in the same room, and a seat that dropped its sockets resumes
 * with its stored capability and is welcomed back into the running match.
 *
 *   node tools/mp-rooms-e2e.mjs                    28 clients (14v14), creator leaves at 20 s, ~100 s wall
 *   node tools/mp-rooms-e2e.mjs --short            6 clients, ~35 s (the core receipt)
 *   node tools/mp-rooms-e2e.mjs --clients=28 --battle=45 --leave-at=20 --world=dedicated --map=alpine --json
 *
 * Gates (exit 1 on any): every client welcomed in round 1; the creator's
 * departure migrates admin without ending the match; a verdict reaches every
 * remaining client (room match_status and the client's own frames); the
 * rematch welcomes every remaining seat; the resumed seat is welcomed by the
 * same match with the same token; no session ends in `lost`.
 *
 * 2026-09-25: one `--clients=4` run (45 s battle, creator leaves at 20 s) timed
 * out on "a verdict at every remaining client" and took 962 s of wall time. It
 * was started at 06:20:35, the minute mp/match-server was merged into this
 * branch, beside two foreign gate suites (host load 9). On the merged tip the
 * same configuration passes 4/4 runs (53 s wall each, drain 20 ms) and the
 * 20 s / 8 s variant passes too. The wall time came from the drain waiting on
 * peers that never answered their close handshake: both services now
 * terminate what is still open after a 1 s grace, the HTTP server closes all
 * connections, and this run stops waiting for the server after 15 s. Run with
 * COT_ROOMS_E2E_DEBUG=1 for a status line every 5 s and timed shutdown steps.
 */
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createRoomsServer } from '../server/rooms/serve.ts';
import { createHeadlessSession, memoryStorage, scriptedControls } from '../src/mp/session/headlessSession.ts';

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(25);
  }
};

export async function runRoomsE2E({
  clients: clientCount = 28,
  battleS = 45,
  leaveAtS = 20,
  world = 'terrain',
  mapId = 'verdant',
  frameHz = 30,
  countdownS = 3,
  log = () => {},
} = {}) {
  if (!Number.isInteger(clientCount) || clientCount < 2 || clientCount > 36) throw new RangeError('clients must be 2..36');
  const teamSize = Math.max(1, Math.ceil(clientCount / 2));
  const SECRET = 'mp-rooms-e2e-seat-secret-0123456789abcdef';
  const server = await createRoomsServer({ seatSecret: SECRET, world, countdownS, battleLimitS: battleS, maxActors: 4 });
  const createSocket = (url) => new WebSocket(url);
  const sessions = [];
  const failures = [];
  const report = { clients: clientCount, teamSize, world, mapId, battleS, leaveAtS, rounds: [], resume: null, admin: [], wallMs: 0 };
  const startedAt = performance.now();
  let ticking = true;
  const ticker = (async () => {
    let last = performance.now();
    while (ticking) {
      const now = performance.now();
      const elapsedS = Math.min(0.25, (now - last) / 1000);
      last = now;
      for (const entry of sessions) if (!entry.disposed) entry.headless.step(now, elapsedS);
      await sleep(1000 / frameHz);
    }
  })();
  // COT_ROOMS_E2E_DEBUG=1: a status line every 5 s (every live session's room / session / match phase and
  // verdict, the actor's phase and tick) and the wall time of every shutdown step.
  const debug = process.env.COT_ROOMS_E2E_DEBUG === '1';
  const elapsed = () => `${((performance.now() - startedAt) / 1000).toFixed(1)} s`;
  const statusLine = () => {
    const actor = server.matchService.actors.get(sessions[0]?.headless.room.code ?? '');
    const roomActor = server.roomService.rooms.get(sessions[0]?.headless.room.code ?? '');
    const seats = sessions.filter((entry) => !entry.disposed).map((entry) => {
      const stats = entry.headless.session.stats();
      const verdict = entry.headless.session.verdict;
      return `${entry.id}[room ${entry.headless.room.phase}/${entry.headless.room.room?.phase ?? '-'} session ${stats.phase}` +
        ` match ${stats.match?.phase ?? '-'} welcomed ${!!entry.headless.session.match?.welcome} verdict ${verdict ? `${verdict.verdict}:${verdict.reason}` : '-'}]`;
    });
    const actorLine = actor ? `actor ${actor.stats().phase} tick ${actor.tick} clients ${actor.stats().clients} ended ${actor.ended} stopped ${actor.stopped}` : 'actor -';
    const roomLine = roomActor?.snapshot ? `room ${roomActor.snapshot.phase} match ${roomActor.snapshot.match?.status ?? '-'}` : 'room -';
    return `${elapsed()}: ${actorLine}; ${roomLine}; ${seats.join(' ')}`;
  };
  const debugTimer = debug ? setInterval(() => log(statusLine()), 5000) : null;
  const stop = async () => {
    ticking = false;
    if (debugTimer) clearInterval(debugTimer);
    const step = async (label, task) => {
      const at = performance.now();
      await task();
      if (debug) log(`stop: ${label} took ${(performance.now() - at).toFixed(0)} ms`);
    };
    await step('ticker', () => ticker);
    await step('sessions', async () => { for (const entry of sessions) if (!entry.disposed) { entry.disposed = true; entry.headless.dispose(); } });
    // A close that waits for a peer's close handshake must not hold a failed run open (a 962 s wall was measured
    // on 2026-09-25): the server terminates lingering sockets itself, and this run stops waiting after 15 s.
    await step('server', () => Promise.race([server.close(), sleep(15_000).then(() => { failures.push('server close exceeded 15 s'); })]));
  };
  try {
    // ---- create and join
    const creator = createHeadlessSession({ endpoint: server.url, player: { id: 'p1', name: 'Creator' }, createSocket, controls: scriptedControls(0), storage: memoryStorage() });
    sessions.push({ id: 'p1', headless: creator, disposed: false, storage: null });
    const room = await creator.room.create({ mode: 'lan', selection: { specId: 'm1a2' }, settings: { teamSize, mapId, botsFill: false } });
    log(`room ${room.roomCode} created (team size ${teamSize})`);
    for (let index = 2; index <= clientCount; index++) {
      const storage = memoryStorage();
      const headless = createHeadlessSession({ endpoint: server.url, player: { id: `p${index}`, name: `Player ${index}` }, createSocket, controls: scriptedControls(index - 1), storage });
      sessions.push({ id: `p${index}`, headless, disposed: false, storage });
      await headless.room.join({ roomCode: room.roomCode, selection: { specId: index % 2 ? 't90m' : 'm1a2' } });
    }
    await until(() => creator.room.room?.players.length === clientCount, 'every seat visible to the creator', 10_000);
    const alpha = creator.room.room.players.filter((player) => player.team === 'alpha').length;
    const bravo = creator.room.room.players.filter((player) => player.team === 'bravo').length;
    log(`${clientCount} seated: alpha ${alpha}, bravo ${bravo}`);
    if (Math.abs(alpha - bravo) > 1) failures.push(`teams unbalanced ${alpha}/${bravo}`);
    await Promise.all(sessions.map((entry) => entry.headless.room.setReady(true)));
    await until(() => creator.room.room?.players.every((player) => player.ready), 'everyone ready', 10_000);

    // ---- round 1: start, every seat welcomed
    await creator.room.start();
    await until(() => sessions.every((entry) => entry.headless.session.match?.welcome), 'every client welcomed', 20_000);
    const welcomed1 = sessions.filter((entry) => entry.headless.session.match?.welcome).length;
    const matchId1 = creator.room.room?.match?.id ?? null;
    log(`round 1 (${matchId1}): ${welcomed1}/${clientCount} welcomed, ${server.matchService.actors.get(room.roomCode)?.stats().clients ?? 0} sockets on the actor`);
    if (welcomed1 !== clientCount) failures.push(`round 1 welcomed ${welcomed1}/${clientCount}`);
    await until(() => sessions.every((entry) => (entry.headless.presentation?.frames.length ?? 0) > 10), 'frames flowing to every presentation', 15_000);

    // ---- the creator leaves mid-match: admin migrates, the match runs on
    await sleep(Math.max(0, leaveAtS * 1000 - (performance.now() - startedAt)));
    const creatorEntry = sessions[0];
    await creator.session.leaveMatch('creator leaves');
    await creator.room.leave();
    creatorEntry.disposed = true;
    creator.dispose();
    const second = sessions[1].headless;
    await until(() => second.room.room?.adminId === 'p2', 'admin migrated to the most senior seat', 10_000);
    report.admin.push({ at: 'creator left', adminId: second.room.room.adminId, phase: second.room.room.phase });
    log(`creator left at ${((performance.now() - startedAt) / 1000).toFixed(1)} s; admin now ${second.room.room.adminId}; room phase ${second.room.room.phase}`);
    // `starting` until the room's first 10 s poll sees the actor playing; only `waiting` would mean the match ended
    if (second.room.room.phase === 'waiting') failures.push(`the match ended with the creator's departure (${second.room.room.phase})`);
    // the recorder is a bounded ring, so compare the newest presented tick, not the count
    const tickBefore = second.presentation.frames.at(-1)?.tick ?? -1;
    await sleep(2000);
    const tickAfter = second.presentation.frames.at(-1)?.tick ?? -1;
    if (tickAfter <= tickBefore) failures.push(`the match stalled after the creator left (tick ${tickBefore} → ${tickAfter})`);
    log(`match runs on: presented tick ${tickBefore} → ${tickAfter} over 2 s`);

    // ---- a seat drops its sockets and resumes with its capability into the running match
    const dropped = sessions[2];
    const tokenBefore = dropped.headless.session.round?.matchStart.seatToken ?? null;
    dropped.headless.session.dispose();
    dropped.headless.room.disconnect('crash');
    dropped.headless.room.dispose();
    dropped.disposed = true;
    const resumed = createHeadlessSession({ endpoint: server.url, player: { id: dropped.id, name: 'Resumed' }, createSocket, controls: scriptedControls(2), storage: dropped.storage });
    sessions.push({ id: dropped.id, headless: resumed, disposed: false, storage: dropped.storage });
    await resumed.room.join({ roomCode: room.roomCode });
    await until(() => !!resumed.session.match?.welcome, 'the resumed seat welcomed by the running match', 15_000);
    const tokenAfter = resumed.session.round?.matchStart.seatToken ?? null;
    report.resume = { playerId: dropped.id, sameToken: tokenBefore !== null && tokenBefore === tokenAfter, seat: resumed.session.match?.welcome?.seat ?? null };
    log(`seat ${dropped.id} resumed: same token ${report.resume.sameToken}, seat ${report.resume.seat}`);
    if (!report.resume.sameToken) failures.push('the resumed seat did not receive its original token');

    // ---- verdict reaches everyone (room status and the client's own frames)
    const live = () => sessions.filter((entry) => !entry.disposed);
    await until(() => live().every((entry) => entry.headless.session.verdict), 'a verdict at every remaining client', (battleS + countdownS + 30) * 1000);
    const verdicts = new Set(live().map((entry) => `${entry.headless.session.verdict.verdict}:${entry.headless.session.verdict.reason}`));
    await until(() => second.room.room?.phase === 'waiting' && second.room.room.lastResult, 'room back to waiting with a result', 20_000);
    report.rounds.push({ round: 1, matchId: matchId1, welcomed: welcomed1, verdicts: [...verdicts], lastResult: second.room.room.lastResult });
    log(`round 1 verdict ${[...verdicts].join(' | ')}; room ${second.room.room.phase}, result ${JSON.stringify(second.room.room.lastResult)}`);
    if (verdicts.size !== 1) failures.push(`clients disagree on the verdict: ${[...verdicts].join(' | ')}`);
    for (const entry of live()) await entry.headless.session.leaveMatch('result screen');

    // ---- rematch in the same room under the migrated admin
    await Promise.all(live().map((entry) => entry.headless.room.setReady(true)));
    await until(() => second.room.room?.players.filter((player) => player.connected).every((player) => player.ready), 'everyone ready again', 10_000);
    await second.room.start();
    await until(() => live().every((entry) => entry.headless.session.match?.welcome && entry.headless.session.round?.matchStart.round === 2), 'every remaining seat welcomed by the rematch', 20_000);
    const matchId2 = second.room.room?.match?.id ?? null;
    const welcomed2 = live().filter((entry) => entry.headless.session.match?.welcome).length;
    report.rounds.push({ round: 2, matchId: matchId2, welcomed: welcomed2, expected: live().length });
    log(`round 2 (${matchId2}): ${welcomed2}/${live().length} welcomed`);
    if (welcomed2 !== live().length) failures.push(`rematch welcomed ${welcomed2}/${live().length}`);
    if (matchId2 === matchId1) failures.push('the rematch reused the match id');
    await sleep(3000);
    for (const entry of live()) {
      const stats = entry.headless.session.stats();
      if (stats.phase === 'lost') failures.push(`${entry.id} ended in lost`);
      if (stats.match && stats.match.phase !== 'live') failures.push(`${entry.id} match phase ${stats.match.phase}`);
    }
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  } finally {
    report.wallMs = Math.round(performance.now() - startedAt);
    await stop();
  }
  report.failures = failures;
  report.pass = failures.length === 0;
  return report;
}

export function formatReport(report) {
  const lines = [`mp rooms e2e: ${report.clients} clients (${report.teamSize} per side), world=${report.world} map=${report.mapId}, battle ${report.battleS} s, creator leaves at ${report.leaveAtS} s (${report.wallMs} ms wall)`];
  for (const round of report.rounds) lines.push(`  round ${round.round} ${round.matchId}: welcomed ${round.welcomed}${round.expected ? `/${round.expected}` : ''}${round.verdicts ? `, verdict ${round.verdicts.join(' | ')}, result ${JSON.stringify(round.lastResult)}` : ''}`);
  for (const step of report.admin) lines.push(`  admin after ${step.at}: ${step.adminId} (room ${step.phase})`);
  if (report.resume) lines.push(`  resume: ${report.resume.playerId} same token ${report.resume.sameToken} seat ${report.resume.seat}`);
  for (const failure of report.failures) lines.push(`  FAIL: ${failure}`);
  lines.push(report.pass ? 'mp rooms e2e: PASS' : 'mp rooms e2e: FAIL');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const short = process.argv.includes('--short');
  const json = process.argv.includes('--json');
  const report = await runRoomsE2E({
    clients: Number(argValue('clients', short ? 6 : 28)),
    battleS: Number(argValue('battle', short ? 20 : 45)),
    leaveAtS: Number(argValue('leave-at', short ? 8 : 20)),
    world: argValue('world', 'terrain'),
    mapId: argValue('map', 'verdant'),
    log: json ? () => {} : (line) => process.stderr.write(`[rooms-e2e] ${line}\n`),
  });
  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exitCode = report.pass ? 0 : 1;
}
