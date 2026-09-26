#!/usr/bin/env node
/**
 * Multiplayer v2 exit flow end-to-end, headless, against the in-process room
 * service (server/rooms/serve.ts: rooms + match on one port, real sockets).
 * Four headless sessions create / join / ready a room, the admin starts, every
 * seat is welcomed; then, in a running match:
 *
 *   1. a seat leaves the battle (the wire LEAVE; its room seat kept): the actor
 *      releases its client at once and tells the others (a `roster` event, the
 *      hull braked), the room still seats the player;
 *   2. the seat re-enters the running match with its retained match_start —
 *      welcomed again with the same token and entity, frames flowing;
 *   3. a second tab on the same seat replaces the first: the actor's REPLACED
 *      close reaches the first session as a seat drop (`lost`, the reason
 *      readable), which cleans up through the same leave;
 *   4. an explicit room leave drops the seat; a fresh join by code is refused
 *      while the room's match plays (`room_locked`: the roster is frozen for
 *      the round; only a resume with the capability re-enters mid-match);
 *   5. the admin kicks a seat: its room and match links end together;
 *   6. the verdict reaches the survivors, the room unlocks, the fresh join
 *      by code seats the player again and the rematch welcomes it (rooms
 *      never close).
 *
 *   node tools/mp-exit-e2e.mjs            15 s battle, ~45 s wall (the core receipt)
 *   node tools/mp-exit-e2e.mjs --battle=30 --map=alpine --world=dedicated --json
 *
 * Gates (exit 1 on any): every step above, plus no session ends in `lost`
 * except the replaced one, and every client disposes without a stray socket.
 */
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createRoomsServer } from '../server/rooms/serve.ts';
import { createHeadlessSession, memoryStorage, scriptedControls } from '../src/mp/session/headlessSession.ts';
import { CLOSE_REASON } from '../src/mp/wire/index.ts';

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

export async function runExitE2E({ battleS = 15, world = 'terrain', mapId = 'verdant', frameHz = 30, countdownS = 2, log = () => {} } = {}) {
  const SECRET = 'mp-exit-e2e-seat-secret-0123456789abcdef';
  const server = await createRoomsServer({ seatSecret: SECRET, world, countdownS, battleLimitS: battleS, maxActors: 4 });
  const createSocket = (url) => new WebSocket(url);
  const sessions = [];
  const failures = [];
  const report = { clients: 4, world, mapId, battleS, steps: {}, wallMs: 0 };
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
  const spawn = (id, name, storage, index) => {
    const headless = createHeadlessSession({ endpoint: server.url, player: { id, name }, createSocket, controls: scriptedControls(index), storage });
    const entry = { id, headless, storage, disposed: false };
    sessions.push(entry);
    return entry;
  };
  const retire = (entry) => { if (!entry.disposed) { entry.disposed = true; entry.headless.dispose(); } };
  const actor = () => server.matchService.actors.get(code);
  const roomSnapshot = () => server.roomService.rooms.get(code)?.snapshot ?? null;
  let code = '';
  const stop = async () => {
    ticking = false;
    await ticker;
    for (const entry of sessions) retire(entry);
    await Promise.race([server.close(), sleep(15_000).then(() => { failures.push('server close exceeded 15 s'); })]);
  };
  try {
    // ---- create, join, ready, start: every seat welcomed and presenting frames
    const p1 = spawn('p1', 'Creator', memoryStorage(), 0);
    const room = await p1.headless.room.create({ mode: 'lan', selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId, botsFill: false } });
    code = room.roomCode;
    const p2 = spawn('p2', 'Two', memoryStorage(), 1);
    const p3 = spawn('p3', 'Three', memoryStorage(), 2);
    const p4 = spawn('p4', 'Four', memoryStorage(), 3);
    for (const entry of [p2, p3, p4]) await entry.headless.room.join({ roomCode: code, selection: { specId: 't90m' } });
    await until(() => p1.headless.room.room?.players.length === 4, 'four seats', 10_000);
    await Promise.all(sessions.map((entry) => entry.headless.room.setReady(true)));
    await until(() => p1.headless.room.room?.players.every((player) => player.ready), 'everyone ready', 10_000);
    await p1.headless.room.start();
    await until(() => sessions.every((entry) => entry.headless.session.match?.welcome), 'every client welcomed', 20_000);
    await until(() => sessions.every((entry) => (entry.headless.presentation?.frames.length ?? 0) > 10), 'frames flowing', 15_000);
    const matchId = p1.headless.room.room?.match?.id ?? null;
    const welcome3 = p3.headless.session.match.welcome;
    const token3 = p3.headless.session.round.matchStart.seatToken;
    report.steps.start = { matchId, actorClients: actor()?.stats().clients ?? 0, entity3: welcome3.entityId };
    log(`round 1 ${matchId}: 4/4 welcomed, ${report.steps.start.actorClients} clients on the actor`);
    if (report.steps.start.actorClients !== 4) failures.push(`actor clients ${report.steps.start.actorClients}`);

    // ---- 1. leave battle: the wire LEAVE releases the seat's client at once; the room keeps the seat
    const eventsBefore = p2.headless.presentation.events.filter((event) => event.kind === 'roster').length;
    await p3.headless.session.leaveMatch('leave battle');
    await until(() => (actor()?.stats().clients ?? 0) === 3, 'the actor released the leaving client', 5_000);
    await until(() => p2.headless.presentation.events.filter((event) => event.kind === 'roster').length > eventsBefore, 'the others receive the roster event', 5_000);
    const roster3 = p2.headless.session.match.roster.find((entry) => entry.playerId === 'p3');
    // an ally always sees the released hull (enemies are disclosed by spotting only)
    const ally = [p1, p2, p4].find((entry) => entry.headless.session.match?.roster.find((row) => row.playerId === entry.id)?.team === roster3?.team) ?? p1;
    const poseBefore = { ...(ally.headless.presentation.poses.get(welcome3.entityId) ?? {}) };
    await sleep(2000);
    const poseAfter = ally.headless.presentation.poses.get(welcome3.entityId) ?? null;
    const movedM = poseAfter && Number.isFinite(poseBefore.x) ? Math.hypot(poseAfter.x - poseBefore.x, poseAfter.z - poseBefore.z) : null;
    report.steps.leave = {
      sessionPhase: p3.headless.session.phase, roomPhase: p3.headless.room.phase, seatKept: !!roomSnapshot()?.players.some((player) => player.id === 'p3'),
      matchStartKept: !!p3.headless.room.matchStart, actorClients: actor()?.stats().clients ?? 0, rosterEntity: roster3?.entityId ?? null, movedMAfterLeave: movedM,
    };
    log(`p3 left the battle: session ${report.steps.leave.sessionPhase}, room ${report.steps.leave.roomPhase}, seat kept ${report.steps.leave.seatKept}, actor clients ${report.steps.leave.actorClients}, hull moved ${movedM?.toFixed(2)} m in 2 s`);
    if (report.steps.leave.sessionPhase !== 'lobby') failures.push(`leave: session ${report.steps.leave.sessionPhase}`);
    if (!report.steps.leave.seatKept || !report.steps.leave.matchStartKept) failures.push('leave: the room seat or the match_start was lost');
    if (movedM !== null && movedM > 1.5) failures.push(`leave: the released hull kept moving (${movedM.toFixed(2)} m)`);

    // ---- 2. re-entry into the running match: same token, same entity, frames again
    const framesBefore = p3.headless.rounds.length;
    await p3.headless.session.enterMatch(p3.headless.room.matchStart);
    await until(() => !!p3.headless.session.match?.welcome, 'p3 welcomed again', 15_000);
    await until(() => (p3.headless.presentation?.frames.length ?? 0) > 10, 'frames flow to the re-entered seat', 15_000);
    report.steps.reentry = {
      sameToken: p3.headless.session.round.matchStart.seatToken === token3, sameEntity: p3.headless.session.match.welcome.entityId === welcome3.entityId,
      sameMatch: p3.headless.session.round.matchStart.matchId === matchId, rounds: p3.headless.rounds.length - framesBefore, actorClients: actor()?.stats().clients ?? 0,
      matchPhase: p3.headless.session.match.phase,
    };
    log(`p3 re-entered: same token ${report.steps.reentry.sameToken}, same entity ${report.steps.reentry.sameEntity}, link ${report.steps.reentry.matchPhase}, actor clients ${report.steps.reentry.actorClients}`);
    if (!report.steps.reentry.sameToken || !report.steps.reentry.sameEntity || !report.steps.reentry.sameMatch) failures.push('re-entry: not the same seat');
    if (report.steps.reentry.actorClients !== 4) failures.push(`re-entry: actor clients ${report.steps.reentry.actorClients}`);

    // ---- 3. a second tab on the seat: the actor replaces the first client, which reads a seat drop
    const tab2 = spawn('p3', 'Three (tab 2)', p3.storage, 2);
    await tab2.headless.room.join({ roomCode: code });
    await until(() => !!tab2.headless.session.match?.welcome, 'the second tab welcomed', 15_000);
    await until(() => p3.headless.session.phase === 'lost', 'the first tab reads lost', 10_000);
    const dropReason = p3.headless.session.match?.lastCloseReason ?? null;
    report.steps.replaced = { firstPhase: p3.headless.session.phase, reason: dropReason, reasonName: dropReason === CLOSE_REASON.REPLACED ? 'replaced' : String(dropReason), secondPhase: tab2.headless.session.match.phase };
    log(`a second tab took the seat: first tab ${report.steps.replaced.firstPhase} (${report.steps.replaced.reasonName}), second tab ${report.steps.replaced.secondPhase}`);
    if (dropReason !== CLOSE_REASON.REPLACED) failures.push(`replaced: the first tab's close reason is ${dropReason}`);
    await p3.headless.session.leaveMatch('dropped');
    p3.headless.room.disconnect('tab closed');
    retire(p3);
    await until(() => (actor()?.stats().clients ?? 0) === 4, 'four clients again', 5_000);

    // ---- 4. an explicit room leave drops the seat; a fresh join by code waits for the round (the room is locked while it plays)
    await p4.headless.session.leaveMatch('leave battle');
    await p4.headless.room.leave();
    await until(() => !roomSnapshot()?.players.some((player) => player.id === 'p4'), 'p4 gone from the room', 5_000);
    await until(() => (actor()?.stats().clients ?? 0) === 3, 'the actor released p4', 5_000);
    retire(p4);
    let p4b = spawn('p4', 'Four again', memoryStorage(), 3);
    let refused = null;
    try { await p4b.headless.room.join({ roomCode: code, selection: { specId: 'm1a2' } }); } catch (error) { refused = error?.code ?? String(error); }
    report.steps.roomLeave = { roomPhase: roomSnapshot()?.phase ?? null, seatGone: !roomSnapshot()?.players.some((player) => player.id === 'p4'), freshJoinRefused: refused, actorClients: actor()?.stats().clients ?? 0 };
    log(`p4 left the room: seat gone ${report.steps.roomLeave.seatGone}, a fresh join by code while ${report.steps.roomLeave.roomPhase} → ${refused}`);
    if (!report.steps.roomLeave.seatGone) failures.push('room leave: the seat stayed');
    if (refused !== 'room_locked') failures.push(`room leave: a fresh join mid-match answered ${refused}`);
    retire(p4b);

    // ---- 5. the admin kicks a seat: room and match links end together
    await p1.headless.room.command({ type: 'kick', playerId: 'p2' });
    await until(() => p2.headless.room.phase === 'closed', 'p2 room closed', 5_000);
    await until(() => (actor()?.stats().clients ?? 0) === 2, 'the kicked client left the actor', 5_000);
    report.steps.kick = { reason: p2.headless.room.lastClosedReason, sessionPhase: p2.headless.session.phase, actorClients: actor()?.stats().clients ?? 0 };
    log(`p2 kicked: room ${report.steps.kick.reason}, session ${report.steps.kick.sessionPhase}, actor clients ${report.steps.kick.actorClients}`);
    if (report.steps.kick.reason !== 'kicked' || report.steps.kick.sessionPhase !== 'lobby') failures.push(`kick: ${JSON.stringify(report.steps.kick)}`);
    retire(p2);

    // ---- 6. the verdict reaches the survivors; the room unlocks; the fresh join seats p4 again; the rematch welcomes it
    const survivors = () => sessions.filter((entry) => !entry.disposed);
    await until(() => [p1, tab2].every((entry) => entry.headless.session.verdict), 'a verdict at the survivors', (battleS + countdownS + 30) * 1000);
    await until(() => roomSnapshot()?.phase === 'waiting', 'room back to waiting', 20_000);
    for (const entry of survivors()) await entry.headless.session.leaveMatch('result screen');
    p4b = spawn('p4', 'Four again', memoryStorage(), 3);
    await p4b.headless.room.join({ roomCode: code, selection: { specId: 'm1a2' } });
    report.steps.rejoin = { roomPhase: roomSnapshot()?.phase ?? null, seated: !!roomSnapshot()?.players.some((player) => player.id === 'p4'), matchStart: p4b.headless.room.matchStart !== null, sessionPhase: p4b.headless.session.phase };
    log(`p4 joined again by code after the verdict: room ${report.steps.rejoin.roomPhase}, seated ${report.steps.rejoin.seated}, match_start ${report.steps.rejoin.matchStart}, session ${report.steps.rejoin.sessionPhase}`);
    if (!report.steps.rejoin.seated || report.steps.rejoin.matchStart || report.steps.rejoin.sessionPhase !== 'lobby') failures.push(`rejoin: ${JSON.stringify(report.steps.rejoin)}`);
    await Promise.all(survivors().map((entry) => entry.headless.room.setReady(true)));
    await until(() => roomSnapshot()?.players.filter((player) => player.connected).every((player) => player.ready), 'everyone ready again', 10_000);
    await p1.headless.room.start();
    await until(() => survivors().every((entry) => entry.headless.session.match?.welcome && entry.headless.session.round?.matchStart.round === 2), 'the rematch welcomes every seat', 20_000);
    report.steps.rematch = { welcomed: survivors().filter((entry) => entry.headless.session.match?.welcome).length, expected: survivors().length, freshSeatWelcomed: !!p4b.headless.session.match?.welcome };
    log(`rematch: ${report.steps.rematch.welcomed}/${report.steps.rematch.expected} welcomed, the fresh seat ${report.steps.rematch.freshSeatWelcomed}`);
    if (!report.steps.rematch.freshSeatWelcomed) failures.push('rematch: the fresh seat was not welcomed');
    for (const entry of survivors()) if (entry.headless.session.stats().phase === 'lost') failures.push(`${entry.id} ended in lost`);
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
  const lines = [`mp exit e2e: ${report.clients} clients, world=${report.world} map=${report.mapId}, battle ${report.battleS} s (${report.wallMs} ms wall)`];
  for (const [step, detail] of Object.entries(report.steps)) lines.push(`  ${step}: ${JSON.stringify(detail)}`);
  for (const failure of report.failures) lines.push(`  FAIL: ${failure}`);
  lines.push(report.pass ? 'mp exit e2e: PASS' : 'mp exit e2e: FAIL');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const json = process.argv.includes('--json');
  const report = await runExitE2E({
    battleS: Number(argValue('battle', 15)), world: argValue('world', 'terrain'), mapId: argValue('map', 'verdant'),
    log: json ? () => {} : (line) => process.stderr.write(`[exit-e2e] ${line}\n`),
  });
  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exitCode = report.pass ? 0 : 1;
}
