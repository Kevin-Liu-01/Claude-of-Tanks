// The solo sim Worker (soloSimCore.ts, soloSimSession.ts; RUST-ENGINE-DECISION §7 step 5, the rework of 2026-10-26): a
// free sortie's authority off the page, with no multiplayer structure. In process, the page's session and the Worker's
// core over a paired channel: the core boots the sortie's planned seats (the player and its named bots, both sides) and
// seats exactly them; the page's client is welcomed with that roster; the count holds until the page releases it; a pause
// stands the tick; the session's end stops the actor. And statically: neither the Worker nor the page's driver imports a
// room, a session, signalling, ICE, WebRTC, a seat token or migration.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAst } from 'rolldown/parseAst';
import { createSoloSimCore } from './soloSimCore.ts';
import { createSoloSimSession } from './soloSimSession.ts';
import { RecordingPresentation } from '../mp/presentation/adapter.ts';
import { ensureAuthorityFleet } from '../vehicles/authorityFleet.ts';
import { TEAM } from '../mp/wire/index.ts';

const watchdog = setTimeout(() => { console.error('soloSimSession.selftest: stuck'); process.exit(1); }, 120_000);
watchdog.unref();
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const until = async (predicate, label, timeoutMs = 60_000) => {
  const started = Date.now();
  while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(10); }
};

// a paired channel, each message on its own task (as a Worker's postMessage)
function channel() {
  const listeners = { page: new Set(), sim: new Set() };
  const end = (self, other) => ({
    post(message) { setTimeout(() => { for (const listener of listeners[other]) listener(message); }, 0); },
    onMessage(listener) { listeners[self].add(listener); return () => listeners[self].delete(listener); },
    close() { listeners[self].clear(); },
  });
  return { page: end('page', 'sim'), sim: end('sim', 'page') };
}

await ensureAuthorityFleet();
const seats = [
  { playerId: 'player', name: 'Commander', team: 'alpha', specId: 'm1a1_abrams_hc', isPlayer: true },
  ...['Viper', 'Rook', 'Atlas'].map((name, k) => ({ playerId: `ally-${k}`, name, team: 'alpha', specId: ['t90am', 'leo2_improved', 'merkava4'][k], isPlayer: false, difficulty: 'normal' })),
  ...['Hammer', 'Wolf', 'Shrike', 'Nomad'].map((name, k) => ({ playerId: `enemy-${k}`, name, team: 'bravo', specId: ['leclerc_sxxi', 't90am', 'm1a1_abrams_hc', 'leo2_improved'][k], isPlayer: false, difficulty: 'hard' })),
];
const { page, sim } = channel();
const core = createSoloSimCore({ port: sim, buildWorld: async () => 'terrain' });
const presentation = new RecordingPresentation(64);
let welcomed = null;
const session = createSoloSimSession({
  port: page, clientBuild: 'selftest',
  boot: { seed: 31, mapId: 'verdant', mode: 'standard', manifestBase: null, simKernelsUrl: null, seats, countdownS: 1 },
  presentation: { adapter: presentation, onWelcome: (welcome) => { welcomed = welcome; } },
});
const pump = setInterval(() => session.update(performance.now(), 1 / 60), 16);
try {
  const ready = await session.ready;
  assert.ok(ready.tick >= 0, 'the Worker runs the authority');
  await until(() => welcomed !== null, 'the page is welcomed');
  // the roster is the sortie's plan: every seat, its side, vehicle and name
  const byPlayer = new Map(welcomed.roster.map((entry) => [entry.playerId, entry]));
  for (const seat of seats) {
    const entry = byPlayer.get(seat.playerId);
    assert.ok(entry, `${seat.playerId} is seated`);
    assert.equal(entry.specId, seat.specId, `${seat.playerId}'s vehicle`);
    assert.equal(entry.team, seat.team === 'alpha' ? TEAM.ALPHA : TEAM.BRAVO, `${seat.playerId}'s side`);
    if (!seat.isPlayer) assert.equal(entry.name, seat.name, `${seat.playerId}'s callsign`);
  }
  assert.equal(welcomed.roster.filter((entry) => entry.team !== TEAM.SPECTATOR).length, seats.length, 'and no other seat');
  const actor = core.actor;
  await until(() => actor.tick > 120, 'the match ticks');
  assert.equal(actor.authority.phase, 'countdown', 'the count holds until the reveal');
  const releasedAt = actor.tick;
  session.releaseCountdown();
  await until(() => actor.authority.phase === 'playing', 'the released count runs out');
  assert.ok(actor.tick - releasedAt >= 55, 'its full second from the release');
  await until(() => presentation.frames.length > 10, 'the presentation draws frames');
  session.setPaused(true);
  await until(() => actor.paused, 'the authority takes the pause');
  const heldTick = actor.tick;
  await sleep(800);
  assert.equal(actor.tick, heldTick, 'no tick while paused');
  session.setPaused(false);
  await until(() => actor.tick > heldTick + 30, 'the battle goes on');
  // the client's migration store stays empty: the Worker sends no keyframe or configuration, there is nothing to migrate
  assert.equal(session.client.migration.stats().chunksReceived, 0, 'no migration traffic');
  console.log(`soloSimSession.selftest: the Worker seated the sortie's ${seats.length} planned seats (both sides, named), held the count to tick ${releasedAt}, paused at ${heldTick} with no tick`);
} finally {
  clearInterval(pump);
  session.dispose();
  await sleep(50);
  assert.ok(core.actor?.stopped, 'the session\'s end stops the authority');
  core.dispose();
}

// no multiplayer structure in the Worker's or the page's driver's static graph
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
function staticImports(file) {
  if (!/\.(?:ts|mjs|js)$/.test(file)) return [];
  const ast = parseAst(readFileSync(resolve(root, file), 'utf8'), { lang: file.endsWith('.ts') ? 'ts' : 'js' }, file);
  const out = [];
  for (const node of ast.body) {
    const declaration = node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || (node.type === 'ExportNamedDeclaration' && node.source);
    if (!declaration || typeof node.source?.value !== 'string' || !node.source.value.startsWith('.')) continue;
    if (node.importKind === 'type' || node.exportKind === 'type') continue;
    if (node.type === 'ImportDeclaration' && node.specifiers?.length && node.specifiers.every((s) => s.importKind === 'type')) continue;
    const target = resolve(root, dirname(file), node.source.value);
    if (existsSync(target)) out.push(relative(root, target));
  }
  return out;
}
// (the match client's own migration store is passive, filled only by a room host's keyframes: the runtime check above
// finds it empty)
const MULTIPLAYER = /^src\/mp\/(?:room|session)\/|^server\/rooms\/|signal|iceConfig|webRtcTransport|webSocketTransport|seatToken|migration(?!Store\.ts$)|matchHostCore|matchSession/i;
for (const entry of ['src/game/soloSimWorker.ts', 'src/game/soloSimSession.ts']) {
  const seen = new Set([entry]), queue = [entry];
  while (queue.length) for (const next of staticImports(queue.shift())) if (!seen.has(next)) { seen.add(next); queue.push(next); }
  const found = [...seen].filter((file) => MULTIPLAYER.test(file));
  assert.deepEqual(found, [], `${entry} imports no room, session, signalling, ICE, WebRTC, seat token or migration`);
}
console.log('soloSimSession.selftest: neither the Worker nor the page\'s driver imports a room, a session, signalling, ICE, WebRTC, a seat token or migration');
