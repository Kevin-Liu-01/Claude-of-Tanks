#!/usr/bin/env node
/**
 * Multiplayer v2 peer-to-peer browser end-to-end (P2 client lane, 2026-09-28): three pristine headless Chromes on
 * the real site with `?mp=v2`, one Vite dev server of this checkout, and the room signaling double
 * (tools/mp-p2p-room-double.ts — P1's relay rules and election; the same proof runs against the real room service
 * once the rooms lane is merged: point --rooms at it). Real WebRTC on localhost (host candidates, no TURN).
 *
 *   A creates a LAN room (three seats per side), B and C open the invite link, join A's side, everyone readies,
 *   A starts: match_start names rtc://ROOM/1 and A; A boots the match actor in a Worker (the HOST badge on its
 *   strip), B and C open data channels to A through the room, every seat is welcomed, snapshots flow, B drives
 *   and C sees B move; A closes its tab; after the host grace the room elects B (host_changed, generation 2):
 *   B boots the actor from its retained keyframe at the continued tick and moves its own seat onto it, C offers
 *   to B and plays on (snapshots keep coming, B's hull continuous as C sees it, no reset); the room's reports come
 *   from B; then A opens the room again (its resume capability) and joins the running match as a peer of B.
 *   Any console error or page error on any browser fails the run.
 *
 *   node tools/mp-p2p-e2e.mjs                     # out: .qa-dev/mp-p2p-e2e (gitignored), ~3 min wall
 *   node tools/mp-p2p-e2e.mjs --grace=8000 --play=20 --json
 *   node tools/mp-p2p-e2e.mjs --rooms=wss://<the rooms Worker>   # the real room service: no double, so the gates that read
 *                                                                # its log (the election record, the host's reports) take the pages' facts
 *
 * During A's return the two tabs still rendering (B hosting, C playing) draw at 320×200: two full battle frames starve the
 * shared headless GPU process while A2 compiles its programs, and the strict preparation is wall-clock bounded (the entry
 * extends it once — src/mp/session/browserComposition.ts — but the proof keeps the load honest rather than leaning on it).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import net from 'node:net';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createP2pRoomDouble } from './mp-p2p-room-double.ts';

const root = new URL('..', import.meta.url).pathname;

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}
const json = process.argv.includes('--json');
const headful = process.argv.includes('--headful');
const outputDir = resolve(argValue('out', join(root, '.qa-dev', 'mp-p2p-e2e')));
const cacheDir = resolve(argValue('cache-dir', join(outputDir, 'vite-cache')));
const playS = Number(argValue('play', 12));
const graceMs = Number(argValue('grace', 3000));
const roomsUrl = argValue('rooms', '');
const live = roomsUrl !== '';
const requestedVitePort = Number(argValue('port', 0));

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolvePort(port)); });
  });
}
const log = (line) => { if (!json) process.stderr.write(`[mp-p2p-e2e] ${line}\n`); };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const startedAt = performance.now();
const elapsedMs = () => Math.round(performance.now() - startedAt);

const report = { pass: false, failures: [], errors: [], steps: [], screenshots: [], playS, graceMs, wallMs: 0, room: null, start: {}, play: {}, migration: {}, rejoin: {}, roomEvents: [] };
const failures = report.failures;
const step = (name, detail = {}) => { report.steps.push({ name, atMs: elapsedMs(), ...detail }); log(`${name} (${(elapsedMs() / 1000).toFixed(1)} s)${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`); };
const errors = report.errors;
function observe(page, label) {
  page.on('pageerror', (error) => errors.push({ page: label, kind: 'pageerror', text: error.stack || error.message }));
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ page: label, kind: 'console', text: message.text() }); });
}
const BOOT_QUERY = 'nosplash=1&tier=desktop&gfxreset=1&mp=v2';

/** The entry pipeline's own failure on a page (it returns the player to the Garage): the wait ends at once, with its reason. */
const entryFailureOf = (label, since) => errors.slice(since).find((entry) => entry.page === label && /\[multiplayer v2 entry\]/.test(entry.text)) ?? null;

async function waitFor(page, predicate, label, timeoutMs, options = {}) {
  const abort = new AbortController();
  const errorsBefore = errors.length;
  let watch = null;
  let entryFailure = null;
  try {
    const waiting = page.waitForFunction(predicate, { timeout: timeoutMs, polling: options.polling ?? 100, signal: abort.signal }, ...(options.args ?? []));
    if (options.entryOf) {
      watch = setInterval(() => { entryFailure = entryFailureOf(options.entryOf, errorsBefore); if (entryFailure) abort.abort(); }, 250);
    }
    await waiting;
  } catch (error) {
    if (entryFailure) throw new Error(`${label}: the entry pipeline failed on ${options.entryOf}: ${entryFailure.text}`);
    const diagnostics = await page.evaluate(() => ({
      url: location.href, phase: window.__DEBUG?.game?.phase ?? null,
      lobbyVisible: document.querySelector('.cot-play .lobby')?.classList.contains('show') ?? false,
      status: document.querySelector('.cot-play .status')?.textContent ?? '',
      loaderOn: document.querySelector('.cot-bl')?.classList.contains('on') ?? false,
      loaderLabel: document.querySelector('.cot-bl .label, .cot-bl .progress-label')?.textContent ?? '',
      v2: window.__MULTIPLAYER_V2?.stats?.() ?? null, entryFailure: window.__NETWORK_ENTRY_FAILURE ?? null, load: window.__NETWORK_LOAD ?? null,
    })).catch(() => null);
    throw new Error(`${label}: ${error.message}; diagnostics ${JSON.stringify(diagnostics)}`);
  } finally {
    if (watch !== null) clearInterval(watch);
  }
}
const stats = (page) => page.evaluate(() => window.__MULTIPLAYER_V2?.stats?.() ?? null);
const p2pOf = (page) => page.evaluate(() => window.__MULTIPLAYER_V2?.stats?.().session?.p2p ?? null);
const inBattle = () => window.__MULTIPLAYER_V2?.stats?.().inMatch === true && window.__DEBUG?.game?.phase === 'battle' && getComputedStyle(document.querySelector('.cot-bl')).display === 'none';

async function screenshot(page, name) {
  const path = join(outputDir, name);
  await page.screenshot({ path });
  report.screenshots.push(path);
  return path;
}

/** The hull of `otherId` as this page renders it, plus the link facts. */
const sample = (page, otherId) => page.evaluate((id) => {
  const game = window.__DEBUG?.game;
  const entity = game?.tankById?.get?.(id) ?? null;
  const pos = entity?.state?.pos ?? null;
  const v2 = window.__MULTIPLAYER_V2?.stats?.() ?? null;
  return {
    atMs: Math.round(performance.now()), phase: game?.phase ?? null, result: game?.result ?? null,
    other: pos ? { x: pos.x, z: pos.z, visible: !!entity?.networkVisible } : null,
    snapshots: v2?.session?.match?.snapshotsAccepted ?? 0, matchPhase: v2?.session?.match?.phase ?? null, p2p: v2?.session?.p2p ?? null, migrations: v2?.session?.migrations ?? 0,
  };
}, otherId);

async function joinAsAlly(page, label, invite) {
  await page.goto(invite.href, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await waitFor(page, () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', `${label} garage ready`, 240_000);
  await waitFor(page, () => (document.querySelector('.cot-play .lobby.show .players')?.children.length ?? 0) >= 2 || document.querySelector('.cot-play .status')?.classList.contains('err'), `${label} joined the lobby`, 60_000);
  const joinError = await page.evaluate(() => (document.querySelector('.cot-play .status')?.classList.contains('err') ? document.querySelector('.cot-play .status').textContent : ''));
  if (joinError) throw new Error(`${label} could not join the room: ${joinError}`);
  await page.evaluate(() => {
    const team = document.querySelector('.cot-play [data-control="team"]');
    if (team && team.value !== 'alpha') { team.value = 'alpha'; team.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}

let rooms = null;
let vite = null;
let browser = null;
const pages = { a: null, b: null, c: null, a2: null };
let contextA = null;
try {
  await mkdir(outputDir, { recursive: true });
  if (live) {
    // The real room service: the pages reach it through VITE_ROOMS_URL; its events are not observed here.
    process.env.VITE_ROOMS_URL = roomsUrl;
    step('rooms-live', { url: roomsUrl, graceMs });
  } else {
    rooms = await createP2pRoomDouble({ host: '127.0.0.1', port: 0, seatSecret: randomBytes(24).toString('hex'), hostGraceMs: graceMs, onEvent: (event) => report.roomEvents.push({ atMs: elapsedMs(), ...event }) });
    process.env.VITE_ROOMS_URL = rooms.url;
    step('rooms-double', { url: rooms.url, graceMs });
  }
  const vitePort = requestedVitePort > 0 ? requestedVitePort : await freePort();
  vite = await createViteServer({ root, cacheDir, logLevel: 'error', server: { host: '127.0.0.1', port: vitePort, strictPort: true, hmr: false } });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  step('vite', { origin, cacheDir });

  browser = await puppeteer.launch({
    headless: !headful, protocolTimeout: 360_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--enable-webgl', '--window-size=1100,720'],
  });
  contextA = await browser.createBrowserContext();
  const contextB = await browser.createBrowserContext();
  const contextC = await browser.createBrowserContext();
  pages.a = await contextA.newPage();
  pages.b = await contextB.newPage();
  pages.c = await contextC.newPage();
  for (const [label, page] of Object.entries(pages)) if (page) { await page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 }); observe(page, label.toUpperCase()); }

  // ---- A: boot, create the LAN room with three seats per side
  await pages.a.goto(`${origin}/?${BOOT_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await waitFor(pages.a, () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', 'A garage ready', 240_000);
  step('a-garage-ready');
  await pages.a.click('.cot-battle-mode');
  await pages.a.click('.cot-battle-choice[data-mode="lan"]');
  await pages.a.click('.cot-battle');
  await waitFor(pages.a, () => document.querySelector('.cot-play')?.classList.contains('show'), 'A play menu', 30_000);
  await pages.a.evaluate(() => {
    const name = document.querySelector('.cot-play [data-field="name"]');
    if (name) name.value = 'Alpha Lead';
    const size = document.querySelector('.cot-play [data-field="create-size"]');
    if (size) size.value = '3';
  });
  await pages.a.click('.cot-play [data-action="create"]');
  await waitFor(pages.a, () => document.querySelector('.cot-play .lobby')?.classList.contains('show') && /[?&]room=[A-Z0-9]{6}/.test(location.search), 'A room created', 30_000);
  const invite = new URL(await pages.a.evaluate(() => location.href));
  const roomCode = invite.searchParams.get('room');
  report.room = { code: roomCode, mode: invite.searchParams.get('mode'), inviteVersion: invite.searchParams.get('v') };
  step('a-room-created', report.room);
  for (const [key, value] of new URLSearchParams(BOOT_QUERY)) invite.searchParams.set(key, value);

  // ---- B and C join A's side; everyone readies; A starts
  await joinAsAlly(pages.b, 'B', invite);
  step('b-joined');
  await joinAsAlly(pages.c, 'C', invite);
  step('c-joined');
  await waitFor(pages.a, () => document.querySelector('.cot-play .lobby.show .players')?.children.length === 3, 'A sees three seats', 30_000);
  const ids = { a: null, b: null, c: null };
  if (live) {
    // Without the double the teams are read from the lobby controls; the seats' ids come from their sessions once the battle begins.
    const teamOf = (page) => page.evaluate(() => document.querySelector('.cot-play [data-control="team"]')?.value ?? null);
    let teams = [];
    for (let waited = 0; waited <= 10_000; waited += 100) {
      teams = await Promise.all([pages.a, pages.b, pages.c].map(teamOf));
      if (teams.every((team) => team === 'alpha')) break;
      await sleep(100);
    }
    if (!teams.every((team) => team === 'alpha')) throw new Error(`not every seat is on alpha: ${JSON.stringify(teams)}`);
    step('lobby-ready', { teams });
  } else {
    const allAlpha = () => rooms.room(roomCode)?.room?.players.every((player) => player.team === 'alpha') === true;
    for (let waited = 0; !allAlpha() && waited < 10_000; waited += 100) await sleep(100);
    if (!allAlpha()) throw new Error(`not every seat is on alpha: ${JSON.stringify(rooms.room(roomCode)?.room?.players.map((player) => [player.id, player.team]))}`);
    // The seats' ids from the room itself (the v2 composition — and its stats — exists only once a battle begins): A created, B and C joined in that order.
    const seated = [...(rooms.room(roomCode)?.room?.players ?? [])].sort((x, y) => x.joinedAt - y.joinedAt);
    Object.assign(ids, { a: seated[0]?.id ?? null, b: seated[1]?.id ?? null, c: seated[2]?.id ?? null });
    if (seated.length !== 3 || !ids.a || !ids.b || !ids.c || rooms.room(roomCode)?.room?.adminId !== ids.a) throw new Error(`the lobby seats read ${JSON.stringify(seated.map((player) => [player.id, player.joinedAt]))}`);
    step('lobby-ready', ids);
  }
  await pages.c.click('.cot-play [data-action="ready"]');
  await pages.b.click('.cot-play [data-action="ready"]');
  await pages.a.click('.cot-play [data-action="ready"]');
  await waitFor(pages.a, () => !document.querySelector('.cot-play [data-action="start"]')?.disabled, 'A start enabled', 30_000);
  await pages.a.click('.cot-play [data-action="start"]');
  step('a-started');

  // ---- every seat reaches the battle over WebRTC: A hosts, B and C are its peers
  await Promise.all([
    waitFor(pages.a, inBattle, 'A battle revealed', 240_000, { entryOf: 'A' }),
    waitFor(pages.b, inBattle, 'B battle revealed', 240_000, { entryOf: 'B' }),
    waitFor(pages.c, inBattle, 'C battle revealed', 240_000, { entryOf: 'C' }),
  ]);
  if (live) {
    const ownId = (page) => page.evaluate(() => window.__MULTIPLAYER_V2?.stats?.().session?.playerId ?? null);
    Object.assign(ids, { a: await ownId(pages.a), b: await ownId(pages.b), c: await ownId(pages.c) });
    if (!ids.a || !ids.b || !ids.c || new Set(Object.values(ids)).size !== 3) throw new Error(`the seats' ids read ${JSON.stringify(ids)}`);
    step('seats', ids);
  }
  const startOf = async (page) => { const s = await stats(page); return { matchUrl: s?.session?.matchUrl ?? null, role: s?.session?.p2p?.role ?? null, hostId: s?.session?.p2p?.hostId ?? null, generation: s?.session?.p2p?.generation ?? null, peers: s?.session?.p2p?.peersConnected ?? null, transport: s?.session?.match?.transportState ?? null, candidate: s?.session?.p2p?.candidateType ?? null, viaTurn: s?.session?.p2p?.viaTurn ?? null, snapshots: s?.session?.match?.snapshotsAccepted ?? 0, actors: s?.round?.actors ?? 0, welcomed: s?.session?.match?.welcomed ?? false }; };
  await waitFor(pages.a, (count) => (window.__MULTIPLAYER_V2?.stats?.().session?.p2p?.peersConnected ?? 0) >= count, 'A serves two peers', 60_000, { args: [2] });
  report.start = { a: await startOf(pages.a), b: await startOf(pages.b), c: await startOf(pages.c), matchUrl: live ? null : rooms.room(roomCode)?.matchUrl ?? null };
  if (live) report.start.matchUrl = report.start.a.matchUrl;
  else if (report.start.a.matchUrl !== report.start.matchUrl) failures.push(`A runs ${report.start.a.matchUrl}, the room started ${report.start.matchUrl}`);
  const stripA = await pages.a.evaluate(() => ({ text: document.querySelector('.cot-mp-strip')?.textContent?.replace(/\s+/g, ' ').trim() ?? null, host: document.querySelector('.cot-mp-strip .unit.host')?.hidden === false }));
  report.start.stripA = stripA;
  step('battle-revealed', report.start);
  if (!/^rtc:\/\//.test(report.start.matchUrl ?? '')) failures.push(`the room started ${report.start.matchUrl}`);
  if (report.start.a.role !== 'host' || report.start.a.peers !== 2) failures.push(`A is ${report.start.a.role} with ${report.start.a.peers} peers`);
  for (const label of ['b', 'c']) {
    const entry = report.start[label];
    if (entry.role !== 'peer' || entry.hostId !== ids.a || entry.transport !== 'open') failures.push(`${label.toUpperCase()} is ${entry.role} of ${entry.hostId} (${entry.transport})`);
    if (!entry.welcomed) failures.push(`${label.toUpperCase()} was not welcomed`);
  }
  if (!stripA.host) failures.push(`A's strip shows no HOST badge: ${stripA.text}`);
  await Promise.all([screenshot(pages.a, 'a-hosting.png'), screenshot(pages.b, 'b-peer.png'), screenshot(pages.c, 'c-peer.png')]);

  // ---- play: B drives, C sees B move, every seat keeps receiving snapshots
  const before = { b: await sample(pages.b, ids.c), c: await sample(pages.c, ids.b) };
  await pages.b.keyboard.down('KeyW');
  await pages.b.keyboard.down('KeyA');
  await sleep(playS * 1000);
  await pages.b.keyboard.up('KeyA');
  await pages.b.keyboard.up('KeyW');
  const after = { b: await sample(pages.b, ids.c), c: await sample(pages.c, ids.b) };
  const movedM = after.c.other && before.c.other ? Math.hypot(after.c.other.x - before.c.other.x, after.c.other.z - before.c.other.z) : 0;
  report.play = { movedBAsCSaw: movedM, snapshotsC: after.c.snapshots - before.c.snapshots, snapshotsB: after.b.snapshots - before.b.snapshots, keyframesRetainedC: await pages.c.evaluate(() => window.__MULTIPLAYER_V2?.stats?.().session?.match ? true : null) };
  step('played', report.play);
  if (movedM < 2) failures.push(`C saw B move ${movedM.toFixed(2)} m in ${playS} s`);
  if (report.play.snapshotsC < playS * 15) failures.push(`C received ${report.play.snapshotsC} snapshots in ${playS} s`);

  // ---- A closes its tab: after the grace the room elects B; B resumes from its keyframe, C follows; no reset
  const lastSeenByC = await sample(pages.c, ids.b);
  const hostTickBefore = live ? null : report.roomEvents.filter((event) => event.kind === 'match_report').at(-1)?.tick ?? 0;
  const closedAt = performance.now();
  await pages.a.close();
  pages.a = null;
  step('a-closed');
  await waitFor(pages.b, (id) => window.__MULTIPLAYER_V2?.stats?.().session?.p2p?.role === 'host' && window.__MULTIPLAYER_V2?.stats?.().session?.p2p?.hostId === id, 'B hosts', graceMs + 90_000, { args: [ids.b], polling: 250 });
  const electedAfterMs = Math.round(performance.now() - closedAt);
  await waitFor(pages.c, (id) => { const p = window.__MULTIPLAYER_V2?.stats?.(); return p?.session?.p2p?.hostId === id && p?.session?.p2p?.migrating === false && p?.session?.match?.phase === 'live'; }, 'C live on B', 90_000, { args: [ids.b], polling: 250 });
  const firstSeenByC = await sample(pages.c, ids.b);
  const cBefore = firstSeenByC.snapshots;
  await sleep(4000);
  const cAfter = await sample(pages.c, ids.b);
  const jumpM = lastSeenByC.other && firstSeenByC.other ? Math.hypot(firstSeenByC.other.x - lastSeenByC.other.x, firstSeenByC.other.z - lastSeenByC.other.z) : null;
  const bAfter = await p2pOf(pages.b);
  // The election as the double logged it; against the real service the elected seat's own facts (host, generation) stand in.
  const election = live
    ? (bAfter ? { hostId: bAfter.hostId, generation: bAfter.generation, reason: 'unobserved', resumeTick: null } : null)
    : report.roomEvents.find((event) => event.kind === 'host_changed' && event.generation === 2);
  const reportsFromB = live ? null : report.roomEvents.filter((event) => event.kind === 'match_report' && event.from === ids.b).length;
  const stripB = await pages.b.evaluate(() => ({ host: document.querySelector('.cot-mp-strip .unit.host')?.hidden === false, banner: document.querySelector('.cot-mp-banner')?.hidden === false ? document.querySelector('.cot-mp-banner .text')?.textContent : null }));
  report.migration = {
    electedAfterMs, election: election ? { hostId: election.hostId, generation: election.generation, reason: election.reason, resumeTick: election.resumeTick } : null, hostTickBefore,
    b: bAfter, c: await p2pOf(pages.c), cMatchPhase: cAfter.matchPhase, cSnapshotsAfterMigration: cAfter.snapshots - cBefore, cMigrations: cAfter.migrations, bMigrations: (await stats(pages.b))?.session?.migrations ?? null,
    bHullJumpAsCSaw: jumpM, cPhase: cAfter.phase, cResult: cAfter.result, reportsFromB, stripB,
  };
  step('migrated', report.migration);
  if (election?.hostId !== ids.b || election.generation !== 2) failures.push(`the election ${JSON.stringify(election)}`);
  if (electedAfterMs < graceMs) failures.push(`B hosted before the grace (${electedAfterMs} ms)`);
  if (report.migration.b?.role !== 'host' || report.migration.b?.peersConnected < 1) failures.push(`B ${JSON.stringify(report.migration.b)}`);
  if (report.migration.c?.role !== 'peer' || report.migration.c?.hostId !== ids.b) failures.push(`C ${JSON.stringify(report.migration.c)}`);
  if (report.migration.cSnapshotsAfterMigration < 40) failures.push(`C received ${report.migration.cSnapshotsAfterMigration} snapshots in 4 s on the new host`);
  if (jumpM === null || jumpM > 8) failures.push(`B's hull as C saw it moved ${jumpM} m across the migration (a reset would be a spawn away)`);
  if (cAfter.phase !== 'battle' || cAfter.result) failures.push(`C's battle ended in the migration (${cAfter.phase}, ${cAfter.result})`);
  if (!live && reportsFromB < 1) failures.push('the room heard no report from B');
  if (!stripB.host) failures.push("B's strip shows no HOST badge after the election");
  await Promise.all([screenshot(pages.b, 'b-hosting-after-migration.png'), screenshot(pages.c, 'c-after-migration.png')]);

  // ---- A returns: a fresh page in its context (the resume capability in localStorage), the running match as a peer of B.
  // B (hosting) and C draw at 320×200 meanwhile: two full battle frames starve the shared headless GPU process while A2
  // compiles its programs against a wall-clock budget; they get their size back once A2 plays.
  await Promise.all([pages.b, pages.c].map((page) => page.setViewport({ width: 320, height: 200, deviceScaleFactor: 1 })));
  step('b-c-shrunk', { viewport: '320x200' });
  pages.a2 = await contextA.newPage();
  await pages.a2.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
  observe(pages.a2, 'A2');
  await pages.a2.goto(invite.href, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await waitFor(pages.a2, () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', 'A2 garage ready', 240_000);
  // The resumed seat returns one of two ways, both the product's: the room re-delivers match_start to it and the session
  // re-enters the running match on its own (the loader covers the lobby at once), or the lobby is up with Rejoin battle.
  const returnState = () => {
    const v2 = window.__MULTIPLAYER_V2?.stats?.();
    if (v2?.active === true && v2?.session?.phase === 'match') return 'auto';
    const button = document.querySelector('.cot-play [data-action="rejoin"]');
    return document.querySelector('.cot-play')?.classList.contains('show') && !!button && !button.hidden ? 'rejoin' : null;
  };
  await waitFor(pages.a2, returnState, 'A2 back in the room (re-entering, or Rejoin battle offered)', 60_000);
  const returned = await pages.a2.evaluate(returnState);
  if (returned === 'rejoin') await pages.a2.click('.cot-play [data-action="rejoin"]');
  step('a2-returned', { path: returned });
  await waitFor(pages.a2, inBattle, 'A2 rejoined the battle', 240_000, { entryOf: 'A2' });
  await waitFor(pages.a2, (id) => { const p = window.__MULTIPLAYER_V2?.stats?.(); return p?.session?.p2p?.role === 'peer' && p?.session?.p2p?.hostId === id && p?.session?.match?.phase === 'live'; }, 'A2 live as a peer of B', 90_000, { args: [ids.b], polling: 250 });
  await Promise.all([pages.b, pages.c].map((page) => page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 })));
  const a2Entry = await pages.a2.evaluate(() => ({ stages: window.__NETWORK_LOAD?.stages ?? null, totalMs: window.__NETWORK_LOAD?.totalMs ?? null, status: window.__NETWORK_LOAD?.status ?? null }));
  step('b-c-restored', { viewport: '1024x640', a2Entry });
  report.rejoin = { a: await startOf(pages.a2), p2p: await p2pOf(pages.a2), peersOnB: (await p2pOf(pages.b))?.peersConnected ?? null, path: returned, entry: a2Entry };
  step('a-rejoined', report.rejoin);
  if (report.rejoin.p2p?.role !== 'peer' || report.rejoin.p2p?.hostId !== ids.b) failures.push(`A2 ${JSON.stringify(report.rejoin.p2p)}`);
  if (report.rejoin.peersOnB !== 2) failures.push(`B serves ${report.rejoin.peersOnB} peers after A's return`);
  await screenshot(pages.a2, 'a-rejoined-as-peer.png');
} catch (error) {
  failures.push(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  report.wallMs = elapsedMs();
  const relevant = errors.filter((entry) => !/favicon|ERR_ABORTED/i.test(entry.text));
  if (relevant.length) failures.push(`${relevant.length} browser error(s): ${relevant.slice(0, 3).map((entry) => `${entry.page} ${entry.kind}: ${entry.text.slice(0, 240)}`).join(' | ')}`);
  report.pass = failures.length === 0;
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  const teardown = async () => {
    try { await browser?.close(); } catch { /* gone */ }
    try { await vite?.close(); } catch { /* gone */ }
    try { await rooms?.close(); } catch { /* gone */ }
  };
  await Promise.race([teardown(), sleep(20_000)]);
}

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`mp p2p e2e${live ? ' (live rooms)' : ''}: room ${report.room?.code ?? '-'} started ${report.start?.matchUrl ?? '-'} (A ${report.start?.a?.role ?? '-'} serving ${report.start?.a?.peers ?? '-'}, B/C ${report.start?.b?.role ?? '-'}/${report.start?.c?.role ?? '-'} on ${report.start?.b?.candidate ?? '-'} candidates); ` +
    `play ${playS} s: C saw B move ${report.play?.movedBAsCSaw?.toFixed?.(1) ?? '-'} m, ${report.play?.snapshotsC ?? '-'} snapshots; ` +
    `A closed → B hosted after ${report.migration?.electedAfterMs ?? '-'} ms (generation ${report.migration?.election?.generation ?? '-'}), C live on B with +${report.migration?.cSnapshotsAfterMigration ?? '-'} snapshots in 4 s, B's hull ${report.migration?.bHullJumpAsCSaw?.toFixed?.(2) ?? '-'} m from where C saw it, ${report.migration?.reportsFromB ?? '-'} reports from B; ` +
    `A rejoined as ${report.rejoin?.p2p?.role ?? '-'} of ${report.rejoin?.p2p?.hostId ?? '-'} (B serving ${report.rejoin?.peersOnB ?? '-'}; ${report.rejoin?.path ?? '-'} path, compile ${report.rejoin?.entry?.stages?.compile ?? '-'} ms${report.rejoin?.entry?.stages?.compileRetry !== undefined ? ` + retry ${report.rejoin.entry.stages.compileRetry} ms` : ''}); ${report.errors.length} browser errors; ${report.wallMs} ms wall`);
  for (const failure of failures) console.log(`  FAIL: ${failure}`);
  console.log(`  screenshots: ${report.screenshots.join(', ')}`);
  console.log(report.pass ? 'mp p2p e2e: PASS' : 'mp p2p e2e: FAIL');
}
process.exitCode = report.pass ? 0 : 1;
