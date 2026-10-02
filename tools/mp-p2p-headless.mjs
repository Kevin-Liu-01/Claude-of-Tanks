#!/usr/bin/env node
/**
 * Multiplayer v2 peer-to-peer, headless in one Node process (P2 client lane): three headless sessions (the real
 * RoomClient, MatchSession, MatchClient, the browser host runtime with the match actor in an in-process core) against
 * the room signaling double (tools/mp-p2p-room-double.ts: the §13.2 relay rules, the election, host_changed with the
 * secret) over the scripted WebRTC world (the same code path as a browser's RTCPeerConnection behind the factory).
 *
 *   1. p1 creates a LAN room, p2 and p3 join, everyone readies, p1 starts: match_start names rtc://ROOM/1 and p1;
 *      p1 boots the host, p2 and p3 offer through the room, data channels open, every seat is welcomed;
 *   2. snapshots flow to every seat; the scripted controls move the hulls; the peers retain sealed keyframes;
 *   3. p1 closes its tab (the room socket and the session go): after the host grace the room elects p2 (host_changed,
 *      generation 2, the secret to p2 alone); p2 boots a host from its retained keyframe at the continued tick and
 *      moves its own seat onto it; p3 offers to p2 and is welcomed again; a hull p3 could see is continuous across
 *      the migration (within one tick of motion); the room's reports now come from p2;
 *   4. p1 opens the room again (a resume with its stored capability): match_start names p2 as host, p1 joins the
 *      running match as a peer and is welcomed by p2's actor.
 *
 *   node tools/mp-p2p-headless.mjs            ~25 s wall (the core receipt)
 *   node tools/mp-p2p-headless.mjs --json
 *   node tools/mp-p2p-headless.mjs --map=desert --world=dedicated   a battlefield on the host's manifest world
 *     (the hosts build server/dedicatedWorldCollision.ts from the committed collision shard, as a browser host does)
 */
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { createP2pRoomDouble } from './mp-p2p-room-double.ts';
import { createHeadlessSession, memoryStorage, scriptedControls } from '../src/mp/session/headlessSession.ts';
import { createInProcessHostPort } from '../src/mp/host/inProcessHost.ts';
import { RtcWorld } from '../src/mp/transport/rtcDouble.test-support.ts';
import { PHASE } from '../src/mp/wire/constants.ts';
import { dequantizePosition } from '../src/mp/wire/quantize.ts';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs) => {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`);
    await sleep(25);
  }
};

export async function runP2pHeadless({ hostGraceMs = 1500, frameHz = 30, playMs = 4000, world = 'terrain', mapId = 'verdant', log = () => {} } = {}) {
  const SECRET = 'mp-p2p-headless-seat-secret-0123456789abcdef';
  const events = [];
  const rooms = await createP2pRoomDouble({ seatSecret: SECRET, hostGraceMs, onEvent: (event) => events.push(event) });
  const rtc = new RtcWorld();
  const cores = [];
  const failures = [];
  const report = { world, mapId, hostGraceMs, steps: {}, wallMs: 0 };
  const startedAt = performance.now();
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
      await sleep(1000 / frameHz);
    }
  })();
  const spawn = (id, name, storage, index, { canHost = true } = {}) => {
    const p2pEvents = [];
    const entry = { id, headless: null, storage, disposed: false, p2pEvents, hostLiveTick: null };
    const headless = createHeadlessSession({
      endpoint: rooms.url, player: { id, name }, createSocket: (url) => new WebSocket(url), controls: scriptedControls(index), storage,
      session: {
        p2p: {
          createPeerConnection: rtc.createPeerConnection,
          ...(canHost ? { createHostPort: createInProcessHostPort({ world, onCore: (core) => cores.push({ id, core }), keyframeIntervalMs: 500, reportIntervalMs: 1000 }) } : {}),
          manifestBase: null, tier: 'desktop', countdownS: 1,
          onLog: (level, message, fields) => {
            if (message === 'host live' && fields && entry.hostLiveTick === null) entry.hostLiveTick = fields.tick;
            log(`[${id}] ${level}: ${message} ${fields ? JSON.stringify(fields) : ''}`);
          },
        },
      },
    });
    headless.session.onP2p((event) => p2pEvents.push(event));
    entry.headless = headless;
    sessions.push(entry);
    return entry;
  };
  const retire = (entry) => { if (!entry.disposed) { entry.disposed = true; entry.headless.dispose(); } };
  const roomState = () => rooms.room(code);
  let code = '';
  const posesOf = (entry, entityId) => entry.headless.presentation?.poses.get(entityId) ?? null;
  try {
    // ---- 1. create, join, ready, start → rtc:// with p1 as host; channels open; welcomes
    const p1 = spawn('p1', 'Creator', memoryStorage(), 0);
    const room = await p1.headless.room.create({ mode: 'lan', selection: { specId: 'm1a2' }, settings: { teamSize: 2, mapId, botsFill: true } });
    code = room.roomCode;
    const p2 = spawn('p2', 'Two', memoryStorage(), 1);
    const p3 = spawn('p3', 'Three', memoryStorage(), 2);
    // p1 (the first host) sits on bravo; p2 and p3 are allies on alpha, so each sees the other's hull at full rate
    await p1.headless.room.setTeam('bravo');
    await p2.headless.room.join({ roomCode: code, selection: { specId: 't90m' }, team: 'alpha' });
    await p3.headless.room.join({ roomCode: code, selection: { specId: 'leo2a7v' }, team: 'alpha' });
    await until(() => p1.headless.room.room?.players.length === 3, 'three seats', 10_000);
    await Promise.all(sessions.map((entry) => entry.headless.room.setReady(true)));
    await until(() => p1.headless.room.room?.players.every((player) => player.ready), 'everyone ready', 10_000);
    await p1.headless.room.start();
    await until(() => sessions.every((entry) => entry.headless.session.round), 'every seat entered the match', 10_000);
    const start1 = p1.headless.session.round.matchStart;
    report.steps.start = { matchUrl: start1.matchUrl, hostId: start1.hostId, secretToHost: typeof start1.hostSecret === 'string', secretToPeer: typeof p2.headless.session.round.matchStart.hostSecret === 'string', roles: sessions.map((entry) => [entry.id, entry.headless.session.role]) };
    log(`match_start ${start1.matchUrl} host ${start1.hostId}; roles ${JSON.stringify(report.steps.start.roles)}`);
    if (!/^rtc:\/\//.test(start1.matchUrl) || start1.hostId !== 'p1') failures.push(`start: ${start1.matchUrl} host ${start1.hostId}`);
    if (!report.steps.start.secretToHost || report.steps.start.secretToPeer) failures.push('start: the host secret must reach the host alone');
    if (p1.headless.session.role !== 'host' || p2.headless.session.role !== 'peer' || p3.headless.session.role !== 'peer') failures.push(`roles ${JSON.stringify(report.steps.start.roles)}`);
    await until(() => sessions.every((entry) => entry.headless.session.match?.welcome), 'every seat welcomed', 20_000);
    await until(() => sessions.every((entry) => (entry.headless.presentation?.frames.length ?? 0) > 10), 'frames flowing on every seat', 15_000);
    const hostStats = p1.headless.session.matchHost.stats();
    const startElection = events.find((event) => event.kind === 'host_changed');
    report.steps.connected = {
      peers: hostStats.peersConnected, hostState: hostStats.state, offers: events.filter((event) => event.kind === 'signal' && event.signal === 'offer').length,
      signals: events.filter((event) => event.kind === 'signal').length, refused: events.filter((event) => event.kind === 'signal_refused').length, reports: roomState().reports,
      startElection: startElection ? { reason: startElection.reason, generation: startElection.generation } : null, migrationsSeen: sessions.map((entry) => entry.headless.session.stats().migrations),
    };
    if (startElection?.reason !== 'start' || startElection.generation !== 1) failures.push(`the start election ${JSON.stringify(startElection)}`);
    if (report.steps.connected.migrationsSeen.some((count) => count !== 0)) failures.push('the start election counted as a migration');
    if (report.steps.connected.offers !== 2) failures.push(`${report.steps.connected.offers} offers relayed`);
    log(`connected: ${hostStats.peersConnected} peers on p1 (${hostStats.state}), ${report.steps.connected.signals} signals relayed, ${report.steps.connected.refused} refused, ${report.steps.connected.reports} reports`);
    if (hostStats.peersConnected !== 2) failures.push(`p1 serves ${hostStats.peersConnected} peers`);
    if (report.steps.connected.reports < 1) failures.push('no match_report reached the room');

    // ---- 2. play: hulls move (p3 watches its ally p2), the peers retain sealed keyframes
    const welcome2 = p2.headless.session.match.welcome;
    const own2 = welcome2.entityId;
    await until(() => !!posesOf(p3, own2), 'p3 sees p2', 10_000);
    await until(() => p3.headless.session.match.stats().matchPhase === PHASE.PLAYING, 'the countdown ended', 15_000);
    const before = { ...posesOf(p3, own2) };
    await sleep(playMs);
    const after = posesOf(p3, own2);
    const movedM = after ? Math.hypot(after.x - before.x, after.z - before.z) : 0;
    const retained2 = p2.headless.session.match.retainedMigration();
    const retained3 = p3.headless.session.match.retainedMigration();
    report.steps.play = { movedM, keyframeTick2: retained2.keyframe?.tick ?? null, keyframeTick3: retained3.keyframe?.tick ?? null, config2: !!retained2.config, snapshots2: p2.headless.session.match.snapshotsAcceptedCount, snapshots3: p3.headless.session.match.snapshotsAcceptedCount, hostTick: cores[0].core.actor.tick };
    log(`play: p3 saw p2's hull move ${movedM.toFixed(1)} m in ${playMs} ms; keyframes retained at ticks ${report.steps.play.keyframeTick2} / ${report.steps.play.keyframeTick3}; host tick ${report.steps.play.hostTick}`);
    if (movedM < 2) failures.push(`p2's hull moved ${movedM.toFixed(2)} m as p3 saw it`);
    if (!retained2.keyframe || !retained3.keyframe) failures.push('the peers retained no sealed keyframe');
    if (!retained2.config) failures.push('p2 retained no sealed configuration');

    // ---- 3. p1 closes its tab: the room elects p2 after the grace; p2 resumes from the keyframe; p3 follows
    // p3's view of p2's hull (an ally: exact on the new host, overlaid from p2's own newest frame) right before the host goes;
    // the first frame p3 presents from the new host is captured as it happens
    // authority rows on both sides (the assembled frames), never interpolated renders: the interpolation delay's catch-up is not a discontinuity
    const rowOf = (frame, entityId) => { const row = frame?.entities.find((entry) => entry.entityId === entityId); return row ? { tick: frame.tick, x: dequantizePosition(row.x), z: dequantizePosition(row.z) } : null; };
    const lastFrame3 = p3.headless.session.match.retainedMigration().latestFrame;
    const lastSeen3 = rowOf(lastFrame3, own2);
    if (!lastSeen3) failures.push("p3's newest frame carries no row for p2");
    const framesBefore3 = p3.headless.presentation.frames.length;
    const lastTickBefore3 = lastFrame3?.tick ?? -1;
    // the new host's first frame: p3 is welcomed again first (its interpolation buffer is cleared with the new link),
    // so the first frame after that welcome is the resumed authority's, never a buffered frame of the old one
    let firstAfter3 = null;
    let welcomedAgain3 = false;
    const offWelcome3 = p3.headless.session.match.onWelcome(() => { welcomedAgain3 = true; });
    const offFrames3 = p3.headless.session.onFrame(() => {
      if (firstAfter3 || !welcomedAgain3) return;
      const latest = p3.headless.session.match.retainedMigration().latestFrame;
      if (!latest || latest.tick <= lastTickBefore3) return;
      // the first assembled frame from the new authority; its tick beyond the boot tick is how long p2 has been driving on it
      firstAfter3 = rowOf(latest, own2);
    });
    const oldHostTick = cores[0].core.actor.tick;
    const closedAt = performance.now();
    p1.headless.room.disconnect('tab closed');
    retire(p1);
    const electionOf = (generation) => events.find((event) => event.kind === 'host_changed' && event.generation === generation);
    await until(() => !!electionOf(2), 'host_changed after the grace', hostGraceMs + 10_000);
    const election = electionOf(2);
    const electedAfterMs = Math.round(performance.now() - closedAt);
    log(`host_changed → ${election.hostId} generation ${election.generation} (${election.reason}) after ${electedAfterMs} ms, resumeTick ${election.resumeTick}`);
    if (election.hostId !== 'p2' || election.generation !== 2 || election.reason !== 'timeout') failures.push(`election ${JSON.stringify(election)}`);
    if (electedAfterMs < hostGraceMs) failures.push(`the election came before the grace (${electedAfterMs} ms)`);
    await until(() => p2.headless.session.role === 'host' && p2.headless.session.matchHost?.state === 'live', 'p2 hosts', 20_000);
    const core2 = cores.find((entry) => entry.id === 'p2')?.core;
    await until(() => p2.headless.session.stats().p2p?.migrating === false && p2.headless.session.match?.phase === 'live', 'p2 live on its own actor', 15_000);
    await until(() => p3.headless.session.match?.phase === 'live' && p3.headless.session.stats().p2p?.migrating === false, 'p3 live on p2', 20_000);
    await until(() => p3.headless.presentation.frames.length > framesBefore3 + 2, 'frames flow to p3 again', 15_000);
    const resumedTick = core2.actor.tick;
    // the first frame p3 presented after the migration against the last it saw before: one tick of motion at most
    await until(() => firstAfter3 !== null, 'p3 presents p2 again', 10_000);
    offFrames3();
    offWelcome3();
    const compared = firstAfter3 ? 1 : 0;
    const worstJumpM = firstAfter3 && lastSeen3 ? Math.hypot(firstAfter3.x - lastSeen3.x, firstAfter3.z - lastSeen3.z) : 0;
    const firstTickAfter3 = firstAfter3?.tick ?? -1;
    // the hull holds still until the new actor runs, then p2 drives on: the ticks the new authority ran before this frame are legitimate motion (≤ 10 m/s)
    const drivenAfterLiveS = firstAfter3 && p2.hostLiveTick !== null ? Math.max(0, (firstAfter3.tick - p2.hostLiveTick) / 60) : 0;
    const discontinuityM = Math.max(0, worstJumpM - 10 * drivenAfterLiveS);
    const reportsBy = events.filter((event) => event.kind === 'match_report').map((event) => event.from);
    report.steps.migration = {
      electedAfterMs, generation: election.generation, resumeTickRoom: election.resumeTick, coreResumedAt: core2.actor.resumedBattleTimeMs, hostTickAfter: resumedTick, oldHostTick,
      p2Role: p2.headless.session.role, p3Role: p3.headless.session.role, p3Target: p3.headless.session.stats().p2p?.hostId ?? null,
      peersOnP2: p2.headless.session.matchHost.peersConnected, comparedHulls: compared, worstJumpM, drivenAfterLiveS, discontinuityM, lastTickBefore3, firstTickAfter3, reportsFromP2: reportsBy.filter((from) => from === 'p2').length,
      p2Events: p2.p2pEvents.map((event) => `${event.kind}${event.phase ? ':' + event.phase : ''}${event.role ? ':' + event.role : ''}`),
      p3Events: p3.p2pEvents.map((event) => `${event.kind}${event.phase ? ':' + event.phase : ''}${event.role ? ':' + event.role : ''}`),
    };
    log(`migration: p2 ${report.steps.migration.p2Role} at tick ${resumedTick} (old host reached ${oldHostTick}), p3 ${report.steps.migration.p3Role} → ${report.steps.migration.p3Target}, p2's hull as p3 saw it: ${worstJumpM.toFixed(2)} m between its last old frame and its first new one, ${drivenAfterLiveS.toFixed(2)} s of driving after the new host went live → discontinuity ${discontinuityM.toFixed(2)} m; ${report.steps.migration.reportsFromP2} reports from p2`);
    if (resumedTick < oldHostTick) failures.push(`the resumed tick ${resumedTick} fell behind the old host's ${oldHostTick}`);
    if (p3.headless.session.stats().p2p?.hostId !== 'p2') failures.push('p3 does not target p2');
    if (report.steps.migration.peersOnP2 !== 1) failures.push(`p2 serves ${report.steps.migration.peersOnP2} peers`);
    if (compared === 0) failures.push('no hull to compare across the migration');
    // the ally's hull holds still through the window and resumes where p2's own newest frame left it: within one tick of motion (< 0.5 m at the fleet's speeds) plus quantization
    // 2026-09-29: 1.0 m — one simulation tick of driving (10 m/s / 60 Hz ≈ 0.17 m) rode over the old 0.75 m under the 8-worker suite
    // (0.76 m read once); a reset would be a spawn away, tens of metres.
    if (discontinuityM > 1.0) failures.push(`p2's hull jumped ${discontinuityM.toFixed(2)} m across the migration as p3 saw it (${worstJumpM.toFixed(2)} m raw over ${drivenAfterLiveS.toFixed(2)} s of driving)`);
    if (worstJumpM > 5) failures.push(`p2's hull is ${worstJumpM.toFixed(2)} m from where p3 last saw it: a reset, not a resume`);
    if (firstTickAfter3 < lastTickBefore3) failures.push(`the tick timeline went backwards (${lastTickBefore3} → ${firstTickAfter3})`);
    if (report.steps.migration.reportsFromP2 < 1) failures.push('the room heard no report from the new host');

    // ---- 4. p1 returns: a resume with its capability, match_start names p2, p1 joins as a peer
    const p1b = spawn('p1', 'Creator', p1.storage, 0);
    await p1b.headless.room.join({ roomCode: code });
    await until(() => p1b.headless.session.round && p1b.headless.session.match?.welcome, 'p1 welcomed again as a peer', 20_000);
    report.steps.rejoin = { matchUrl: p1b.headless.session.round.matchStart.matchUrl, hostId: p1b.headless.session.round.matchStart.hostId, role: p1b.headless.session.role, entity: p1b.headless.session.match.welcome.entityId, peersOnP2: p2.headless.session.matchHost.peersConnected };
    log(`rejoin: p1 ${report.steps.rejoin.role} via ${report.steps.rejoin.matchUrl} (host ${report.steps.rejoin.hostId}), entity ${report.steps.rejoin.entity}, p2 now serves ${report.steps.rejoin.peersOnP2}`);
    if (report.steps.rejoin.role !== 'peer' || report.steps.rejoin.hostId !== 'p2' || !/\/2$/.test(report.steps.rejoin.matchUrl)) failures.push(`rejoin ${JSON.stringify(report.steps.rejoin)}`);
    await until(() => p2.headless.session.matchHost.peersConnected === 2, 'p2 serves both peers', 10_000);
    for (const entry of sessions) if (!entry.disposed && entry.headless.session.stats().phase === 'lost') failures.push(`${entry.id} ended in lost`);
    const refused = events.filter((event) => event.kind === 'signal_refused');
    report.steps.relay = { relayed: events.filter((event) => event.kind === 'signal').length, refused: refused.length, refusedCodes: [...new Set(refused.map((event) => event.code))] };
  } catch (error) {
    failures.push(error instanceof Error ? error.stack ?? error.message : String(error));
  } finally {
    report.wallMs = Math.round(performance.now() - startedAt);
    ticking = false;
    await ticker;
    for (const entry of sessions) retire(entry);
    for (const { core } of cores) core.dispose();
    await Promise.race([rooms.close(), sleep(5000)]);
  }
  report.failures = failures;
  report.pass = failures.length === 0;
  return report;
}

export function formatReport(report) {
  const lines = [`mp p2p headless: map=${report.mapId}, world=${report.world}, host grace ${report.hostGraceMs} ms (${report.wallMs} ms wall)`];
  for (const [step, detail] of Object.entries(report.steps)) lines.push(`  ${step}: ${JSON.stringify(detail)}`);
  for (const failure of report.failures) lines.push(`  FAIL: ${failure}`);
  lines.push(report.pass ? 'mp p2p headless: PASS' : 'mp p2p headless: FAIL');
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const json = process.argv.includes('--json');
  const flag = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
  const report = await runP2pHeadless({ mapId: flag('map') ?? 'verdant', world: flag('world') ?? 'terrain',
    log: json ? () => {} : (line) => process.stderr.write(`[p2p-headless] ${line}\n`) });
  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
  process.exitCode = report.pass ? 0 : 1;
}
