// The same-wire build check (2026-10-13, MP stream plan step 13). Deploys 219-222 all speak wire 5 / protocol 6, so a tab
// left open on one build could host a seat of the next, and the seat's prediction would silently disagree with the
// host's authority. Every build stamps its HELLO with one line (version, commit time, the prediction and authority source
// digests); the host refuses a seat whose prediction code differs, with "refresh" words, and admits (and logs) a seat
// whose builds differ only in authority or version. A build before this check, or an unstamped dev/headless run, is
// admitted as before.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MATCH_BUILD, compareMatchBuilds, formatMatchBuild, matchBuildRefusalCode, matchBuildRefused, matchRefusalCodeOf, matchRefusalMessage,
  parseMatchBuild,
} from './matchBuild.ts';
import { matchBuildMismatchMessage } from '../match/matchClient.ts';
import { CLOSE_REASON, MAX_BUILD_BYTES, MAX_DETAIL_BYTES, MESSAGE_TYPE, PROTOCOL_VERSION, WIRE_VERSION } from './constants.ts';
import { decodeMessage, encodeMessage } from './codec.ts';
import { AUTHORITY_ENTRIES, PREDICTION_ENTRIES, closureDigest, resolveMatchBuild, sourceClosure } from '../../../tools/matchBuild.ts';
import { createLoopbackLink } from '../../../server/match/link.ts';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { createLoopbackPair } from '../transport/index.ts';
import { MatchClient } from '../match/index.ts';
import { WebSocket } from 'ws';
import { createP2pRoomDouble } from '../../../tools/mp-p2p-room-double.ts';
import { createHeadlessSession, memoryStorage, scriptedControls } from '../session/headlessSession.ts';
import { createInProcessHostPort } from '../host/inProcessHost.ts';
import { RtcWorld } from '../transport/rtcDouble.test-support.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const line = (prediction, authority, { version = 'v1.0.0+g1234567', committedAt = 1_760_000_000 } = {}) =>
  formatMatchBuild({ version, committedAt, prediction, authority });
const P1 = 'aaaaaaaaaaaa', P2 = 'bbbbbbbbbbbb', A1 = 'cccccccccccc', A2 = 'dddddddddddd';

// ---- the line: bounded, parseable, round-trips
{
  const stamped = line(P1, A1, { version: 'v1.0.0+gfd437ea9e.dirty' });
  assert.equal(stamped, `v1.0.0+gfd437ea9e.dirty t${(1_760_000_000).toString(36)} p${P1} a${A1}`);
  assert.ok(new TextEncoder().encode(line(P1, A1, { version: 'v'.repeat(80), committedAt: 36 ** 8 - 1 })).byteLength <= MAX_BUILD_BYTES,
    'the longest line fits the HELLO field');
  assert.deepEqual(parseMatchBuild(stamped), { version: 'v1.0.0+gfd437ea9e.dirty', committedAt: 1_760_000_000, prediction: P1, authority: A1 });
  for (const legacy of ['production', 'dev', 'headless', 'selftest', '', null, 42, `x t1 p${P1}`]) assert.equal(parseMatchBuild(legacy), null, `${legacy}: unstamped`);
  assert.throws(() => formatMatchBuild({ version: 'v', committedAt: 0, prediction: 'xyz', authority: A1 }), /12 hex/);
  assert.equal(MATCH_BUILD, 'dev', 'Node (no vite define) is an unstamped dev build');
}

// ---- the verdicts: prediction refuses, authority or version alone admits, an unstamped side admits
{
  const older = { committedAt: 1_760_000_000 }, newer = { committedAt: 1_760_090_000 };
  const cases = [
    [line(P1, A1), line(P1, A1), 'same', null, false],
    [line(P1, A1, { version: 'v1.0.0+gaaaaaaa' }), line(P1, A1), 'version', null, false],
    [line(P1, A1, older), line(P1, A2, newer), 'authority', 'seat', false],
    [line(P1, A1, older), line(P2, A1, newer), 'prediction', 'seat', true],
    [line(P2, A2, newer), line(P1, A1, older), 'prediction', 'host', true],
    [line(P1, A1, { committedAt: 0 }), line(P2, A1), 'prediction', null, true],
    ['production', line(P1, A1), 'unknown', null, false],
    [line(P1, A1), 'production', 'unknown', null, false],
    ['dev', 'dev', 'unknown', null, false],
  ];
  for (const [host, seat, verdict, newerSide, refused] of cases) {
    const comparison = compareMatchBuilds(host, seat);
    assert.equal(comparison.verdict, verdict, `${host} / ${seat}`);
    assert.equal(comparison.newer, newerSide, `${host} / ${seat}: newer`);
    assert.equal(matchBuildRefused(comparison), refused, `${host} / ${seat}: refused`);
  }
  // the host sends a code; the joining client words it ("Refresh the page to join: your game version differs from the
  // host's"), the lobby localizes it by code (playMenu ENTRY_REFUSAL_KEYS)
  assert.equal(matchBuildRefusalCode({ verdict: 'prediction', newer: 'seat' }), 'build_host_older');
  assert.equal(matchBuildRefusalCode({ verdict: 'prediction', newer: 'host' }), 'build_host_newer');
  assert.equal(matchBuildRefusalCode({ verdict: 'prediction', newer: null }), 'build_mismatch');
  for (const code of ['build_mismatch', 'build_host_older', 'build_host_newer']) {
    const words = matchRefusalMessage(code);
    assert.ok(words.startsWith("Refresh the page to join: your game version differs from the host's."), `${code}: says exactly what to do`);
    assert.ok(new TextEncoder().encode(code).byteLength <= MAX_DETAIL_BYTES);
    assert.equal(matchRefusalCodeOf(code), code, `${code}: read back from the code`);
    assert.equal(matchRefusalCodeOf(words), code, `${code}: read back from its words`);
  }
  assert.match(matchRefusalMessage('build_host_older'), /older version.*refresh too/);
  assert.match(matchRefusalMessage('build_host_newer'), /newer version/);
  for (const other of ['bad token', 'server 6', '', null, 'build_other']) assert.equal(matchRefusalCodeOf(other), null);
  // the other-wire gate speaks the same vocabulary, so the lobby localizes it the same way
  assert.equal(matchRefusalCodeOf(matchBuildMismatchMessage(WIRE_VERSION - 1)), 'build_host_older');
  assert.equal(matchRefusalCodeOf(matchBuildMismatchMessage(WIRE_VERSION + 1)), 'build_host_newer');
  for (const [locale, catalog] of [['en-US', 'i18nCatalog.en-US.json'], ['zh-CN', 'i18nCatalog.zh-CN.json']]) {
    const strings = JSON.parse(readFileSync(join(ROOT, 'src/ui', catalog), 'utf8'));
    for (const key of ['buildMismatch', 'buildHostOlder', 'buildHostNewer', 'matchEnded']) {
      assert.ok(typeof strings[`playMenu.entryRefusal.${key}`] === 'string' && strings[`playMenu.entryRefusal.${key}`].length > 4, `${locale}: playMenu.entryRefusal.${key}`);
    }
  }
  const en = JSON.parse(readFileSync(join(ROOT, 'src/ui/i18nCatalog.en-US.json'), 'utf8'));
  assert.equal(en['playMenu.entryRefusal.buildMismatch'], matchRefusalMessage('build_mismatch'), 'the English catalog and the fallback agree');
}

// ---- the digests: a prediction-closure edit moves p, an authority-only edit moves a alone, a type-only import is not followed
{
  const root = mkdtempSync(join(tmpdir(), 'cot-match-build-'));
  const put = (path, text) => { mkdirSync(join(root, dirname(path)), { recursive: true }); writeFileSync(join(root, path), text); };
  put('src/mp/match/prediction.ts', "import { step } from '../../sim/movement.ts';\nimport type { Only } from '../../sim/typesOnly.ts';\nexport const p = step;\n");
  put('src/mp/presentation/predictionWorld.ts', "export {\n  bounds,\n} from '../../world/bounds.ts';\n");
  put('src/mp/match/matchClient.ts', "export const c = await import('./lazy.ts');\n");
  put('src/mp/match/lazy.ts', 'export const lazy = 1;\n');
  put('src/vehicles/specs.ts', "import './sideEffect.ts';\n");
  put('src/vehicles/sideEffect.ts', '');
  put('src/sim/movement.ts', 'export const step = 1;\n');
  put('src/sim/typesOnly.ts', 'export type Only = 1;\n');
  put('src/world/bounds.ts', 'export const bounds = 1;\n');
  put('server/match/matchActor.ts', "import { step } from '../../src/sim/movement.ts';\nimport { fleet } from '../../src/vehicles/geometry.ts';\nimport { x } from 'three';\n");
  put('src/vehicles/geometry.ts', 'export const fleet = 1;\n');
  put('src/mp/host/matchHostCore.ts', "import '../../../server/match/matchActor.ts';\n");
  const prediction = sourceClosure(root, PREDICTION_ENTRIES);
  assert.deepEqual(prediction, [
    'src/mp/match/lazy.ts', 'src/mp/match/matchClient.ts', 'src/mp/match/prediction.ts', 'src/mp/presentation/predictionWorld.ts',
    'src/sim/movement.ts', 'src/vehicles/sideEffect.ts', 'src/vehicles/specs.ts', 'src/world/bounds.ts',
  ], 'static, multi-line, side-effect and dynamic imports are followed; type-only imports and bare packages are not');
  const authority = sourceClosure(root, AUTHORITY_ENTRIES);
  assert.deepEqual(authority, ['server/match/matchActor.ts', 'src/mp/host/matchHostCore.ts', 'src/sim/movement.ts', 'src/vehicles/geometry.ts']);
  const before = parseMatchBuild(resolveMatchBuild(root, 'v1.0.0+gtest'));
  assert.ok(before, 'the tree resolves to a stamped line');
  put('src/vehicles/geometry.ts', 'export const fleet = 2;\n');
  const authorityEdit = parseMatchBuild(resolveMatchBuild(root, 'v1.0.0+gtest'));
  assert.equal(authorityEdit.prediction, before.prediction, 'an authority-only edit leaves the prediction digest');
  assert.notEqual(authorityEdit.authority, before.authority, 'and moves the authority digest');
  put('src/sim/movement.ts', 'export const step = 2;\n');
  const sharedEdit = parseMatchBuild(resolveMatchBuild(root, 'v1.0.0+gtest'));
  assert.notEqual(sharedEdit.prediction, authorityEdit.prediction, 'shared movement code moves the prediction digest');
  assert.notEqual(sharedEdit.authority, authorityEdit.authority, 'and the authority digest');
  assert.equal(compareMatchBuilds(resolveMatchBuild(root, 'v1'), formatMatchBuild(before)).verdict, 'prediction');
  put('src/sim/typesOnly.ts', 'export type Only = 2;\n');
  assert.equal(parseMatchBuild(resolveMatchBuild(root, 'v1.0.0+gtest')).prediction, sharedEdit.prediction, 'a type-only dependency never moves it');
  assert.equal(closureDigest(root, ['src/sim/movement.ts']), closureDigest(root, ['src/sim/movement.ts']), 'deterministic');
}

// ---- this repository: the line the build stamps, and the closures it covers
{
  const stamped = parseMatchBuild(resolveMatchBuild(ROOT, 'v1.0.0+gselftest'));
  assert.ok(stamped && stamped.committedAt > 0, 'this tree stamps a line with its commit time');
  const prediction = sourceClosure(ROOT, PREDICTION_ENTRIES);
  const authority = sourceClosure(ROOT, AUTHORITY_ENTRIES);
  for (const file of ['src/sim/movement.ts', 'src/mp/match/prediction.ts', 'src/mp/match/movementCheckpoint.ts', 'src/mp/presentation/predictionWorld.ts', 'src/sim/matchRuleset.ts'])
    assert.ok(prediction.includes(file), `the prediction closure covers ${file}`);
  for (const file of ['server/match/matchActor.ts', 'src/sim/authoritativeMatch.ts', 'src/sim/movement.ts', 'src/sim/spotting.ts', 'src/mp/wire/matchBuild.ts'])
    assert.ok(authority.includes(file), `the authority closure covers ${file}`);
  // (src/ui/flagCodes.ts rides the vehicle specs' nation data: data, not presentation)
  const presentation = prediction.filter((file) => /^src\/(engine|fx|audio|ui)\//.test(file) && file !== 'src/ui/flagCodes.ts');
  assert.deepEqual(presentation, [], 'the prediction closure carries no render, FX, audio or UI code (a cosmetic deploy never splits a room)');
  const vite = readFileSync(join(ROOT, 'vite.config.ts'), 'utf8');
  assert.match(vite, /__COT_MATCH_BUILD__: JSON\.stringify\(matchBuild\)/, 'vite defines the line for the page and the host Worker');
  const composition = readFileSync(join(ROOT, 'src/mp/session/browserComposition.ts'), 'utf8');
  assert.match(composition, /clientBuild = MATCH_BUILD/, 'the browser composition sends this build\'s line by default');
}

// ---- the host: a seat on other prediction code is refused with "refresh" before it can replace its live link
await ensureAuthorityFleet();
{
  let nowMs = 10_000;
  const logs = [];
  const log = {
    child() { return log; },
    debug() {}, info: (message, fields) => logs.push(['info', message, fields]), warn: (message, fields) => logs.push(['warn', message, fields]), error() {},
  };
  const hostLine = line(P1, A1, { committedAt: 1_760_000_000 });
  const actor = createMatchActor({
    roomId: 'room-build-check', mapId: 'verdant', seed: 7, countdownS: 0.5, world: 'terrain', now: () => nowMs, schedule: () => () => {},
    build: hostLine, log, autoStart: false,
    seats: [
      { seat: 0, playerId: 'p1', name: 'One', team: 'alpha', specId: 'm1a2' },
      { seat: 1, playerId: 'p2', name: 'Two', team: 'bravo', specId: 't90m' },
    ],
  });
  const join = (seat, playerId, clientBuild) => {
    const link = createLoopbackLink(playerId);
    const seen = { welcome: null, closed: null };
    link.client.onMessage((bytes) => {
      const decoded = decodeMessage(bytes);
      if (!decoded.ok) return;
      if (decoded.message.type === MESSAGE_TYPE.WELCOME) seen.welcome = decoded.message;
      if (decoded.message.type === MESSAGE_TYPE.CLOSE) seen.closed = decoded.message;
    });
    link.client.onClose((reason, detail) => { seen.closed ??= { reason, detail }; });
    const hello = { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 'issued-elsewhere', clientBuild };
    const claims = { v: 1, roomId: 'room-build-check', seat, playerId, name: playerId, team: seat ? 'bravo' : 'alpha', specId: seat ? 't90m' : 'm1a2', iat: 0, exp: 1 };
    seen.attached = actor.attach(link.server, hello, claims);
    return seen;
  };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  // the same build, and a build before this check ('production'): welcomed as before
  const same = join(0, 'p1', hostLine);
  await flush();
  assert.equal(same.attached, true);
  assert.ok(same.welcome, 'the same build is welcomed');
  const legacy = join(1, 'p2', 'production');
  await flush();
  assert.equal(legacy.attached, true, 'an unstamped (pre-check) build is admitted');
  // authority alone differs: admitted, logged
  const authorityOnly = join(1, 'p2', line(P1, A2, { committedAt: 1_760_090_000 }));
  await flush();
  assert.equal(authorityOnly.attached, true, 'the same prediction on another authority is admitted');
  assert.ok(logs.some(([level, message, fields]) => level === 'info' && message === 'client on another build' && fields.verdict === 'authority'), 'and logged');
  // prediction differs, the seat newer: refused with the "older host" words, and the live link of its seat is kept
  const before = actor.clientStats().find((client) => client.seat === 1);
  const refused = join(1, 'p2', line(P2, A2, { committedAt: 1_760_090_000 }));
  await flush();
  assert.equal(refused.attached, false, 'a seat on other prediction code is refused');
  assert.equal(refused.welcome, null, 'never welcomed');
  assert.equal(refused.closed?.reason, CLOSE_REASON.PROTOCOL_VERSION, `as the protocol-version close (${JSON.stringify(refused.closed)})`);
  assert.equal(refused.closed.detail, 'build_host_older', 'with the refusal code (the seat newer: the host is older)');
  assert.ok(before && actor.clientStats().some((client) => client.seat === 1), 'the seat\'s live link was not replaced by the refused one');
  assert.equal(authorityOnly.closed, null, 'the live link stays open');
  assert.ok(logs.some(([level, message]) => level === 'warn' && message === 'client refused: another build'));
  const older = join(1, 'p2', line(P2, A1, { committedAt: 1_750_000_000 }));
  await flush();
  assert.equal(older.closed?.detail, 'build_host_newer');
  actor.stop?.();
}

// ---- the refused seat's client ends its join with the host's words (the session shows them as the entry failure)
{
  let nowMs = 10_000;
  const clock = () => nowMs;
  const pair = createLoopbackPair({ clock, clientToServer: { latencyMs: 20 }, serverToClient: { latencyMs: 20 } });
  const words = matchRefusalMessage('build_host_older');
  let hello = null;
  pair.server.onFrame((frame) => {
    const decoded = decodeMessage(frame);
    if (decoded.ok && decoded.message.type === MESSAGE_TYPE.HELLO) {
      hello = decoded.message;
      pair.server.send(encodeMessage({ type: MESSAGE_TYPE.CLOSE, reason: CLOSE_REASON.PROTOCOL_VERSION, detail: 'build_host_older' }));
    }
  });
  pair.server.open();
  const NEUTRAL = () => ({ throttle: 0, steer: 0, brake: false, fire: false, aimLocked: false, aimYaw: 0, aimPitch: 0, aimDistance: 300, shellSlot: 0, actionPresses: 0 });
  const client = new MatchClient({ transport: pair.client, token: 'tok-1', clock, controls: NEUTRAL, prediction: null, clientBuild: line(P2, A2) });
  const phases = [];
  client.onPhase((phase, detail) => phases.push({ phase, detail }));
  client.connect();
  for (let t = 0; t < 3000 && !phases.some((p) => p.phase === 'closed'); t += 5) { nowMs += 5; pair.pump(nowMs); client.update?.(nowMs); }
  assert.equal(hello?.clientBuild, line(P2, A2), 'the HELLO carries the stamped line');
  const closed = phases.find((p) => p.phase === 'closed');
  assert.ok(closed, 'the join ends');
  assert.equal(closed.detail, words, 'worded by this build from the host\'s code');
  assert.equal(client.lastCloseReason, CLOSE_REASON.PROTOCOL_VERSION);
  client.dispose?.();
}

// ---- in a room: a refused seat fails only its own entry — never a host decline, never an election (the coordinator's
// rule, 2026-10-13): the host keeps hosting at generation 1, the room hears no host_decline and elects nobody
{
  const HOST = line(P1, A1, { committedAt: 1_760_000_000 });
  const OTHER = line(P2, A1, { committedAt: 1_760_090_000 });
  const events = [];
  const rooms = await createP2pRoomDouble({ seatSecret: 'match-build-selftest-seat-secret-0123456789', hostGraceMs: 800, onEvent: (event) => events.push(event) });
  const rtc = new RtcWorld();
  const sessions = [];
  let ticking = true;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const until = async (predicate, label, timeoutMs) => {
    const started = Date.now();
    while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(25); }
  };
  const ticker = (async () => {
    let last = performance.now();
    while (ticking) {
      const nowMs = performance.now();
      rtc.flush();
      for (const entry of sessions) entry.step(nowMs, Math.min(0.25, (nowMs - last) / 1000));
      last = nowMs;
      rtc.flush();
      await sleep(33);
    }
  })();
  const spawn = (id, index, clientBuild) => {
    const headless = createHeadlessSession({
      endpoint: rooms.url, player: { id, name: id }, createSocket: (url) => new WebSocket(url), controls: scriptedControls(index), storage: memoryStorage(),
      clientBuild,
      session: { p2p: {
        ice: () => ({ iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' }), createPeerConnection: rtc.createPeerConnection,
        createHostPort: createInProcessHostPort({ world: 'terrain', build: HOST, keyframeIntervalMs: 500, reportIntervalMs: 500 }),
        manifestBase: null, tier: 'desktop', countdownS: 1,
      } },
    });
    sessions.push(headless);
    return headless;
  };
  try {
    const p1 = spawn('p1', 0, HOST);
    const created = await p1.room.create({ mode: 'lan', selection: { specId: 'm1a2' }, settings: { teamSize: 1, mapId: 'verdant', botsFill: false } });
    const p2 = spawn('p2', 1, OTHER);
    const p2Phases = [];
    p2.session.onPhase(({ phase, detail }) => p2Phases.push({ phase, detail }));
    await p2.room.join({ roomCode: created.roomCode, selection: { specId: 't90m' } });
    await until(() => p1.room.room?.players.length === 2, 'two seats', 10_000);
    await Promise.all(sessions.map((entry) => entry.room.setReady(true)));
    await until(() => p1.room.room?.players.every((player) => player.ready), 'everyone ready', 10_000);
    await p1.room.start();
    await until(() => p1.session.match?.welcome, 'the host seat welcomed by its own actor', 20_000);
    await until(() => p2.session.stats().phase === 'lost', 'the other build refused', 20_000);
    const refusedAt = events.length;
    assert.equal(p2Phases.find((change) => change.phase === 'lost')?.detail, matchRefusalMessage('build_host_older'),
      `the other build's seat is refused for its build, worded by its own client (${JSON.stringify(p2Phases)})`);
    // hold past the room's host grace: nothing the refusal did may elect or decline
    await sleep(2_500);
    assert.equal(p1.session.role, 'host', 'the host keeps hosting');
    assert.equal(p1.room.generation, 1, 'generation 1: no election');
    assert.equal(p1.session.stats().phase, 'match', 'the host\'s match runs on');
    const declines = events.filter((event) => event.kind === 'host_decline');
    const elections = events.filter((event) => event.kind === 'host_changed');
    assert.deepEqual(declines, [], `a refused seat is never a host decline (${JSON.stringify(declines)})`);
    assert.deepEqual(elections.filter((event) => event.generation > 1), [], `and never an election (${JSON.stringify(elections)})`);
    assert.ok(!events.slice(refusedAt).some((event) => event.kind === 'match_lost' || event.kind === 'match_ended'), 'the match is not ended by it');
  } finally {
    ticking = false;
    await ticker;
    for (const entry of sessions) entry.dispose();
    await Promise.race([rooms.close(), sleep(5000)]);
  }
}

console.log(`matchBuild.selftest: the same-wire build check (wire ${WIRE_VERSION}) — stamped lines, prediction refuses with "refresh", authority or version alone admits and logs, unstamped admits; the closures and digests; the host refuses before replacing a live link; the client words the host's refusal code; in a room the refused seat is never a host decline or an election`);
