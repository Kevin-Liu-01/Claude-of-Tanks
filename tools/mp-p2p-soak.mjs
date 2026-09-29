#!/usr/bin/env node
/**
 * Peer-to-peer soak (P3 certification lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13.8): one headless Chrome, N seats as
 * N tabs of the peer harness (tools/mp-p2p-peer/: the real room client, session, match client, the browser host with
 * its Worker chunk, real WebRTC; no renderer), one room on the room service named by --rooms (`wrangler dev` of
 * cloudflare/rooms, or the in-process `server/rooms` with matchTransport p2p), one Vite dev server of this checkout.
 * Every seat drives and fires on the scripted controls; every --migrate-every minutes the runner closes the host's tab
 * and measures the migration on every remaining seat (host loss → host_changed → the new host live → the first frame
 * from it; the resumed tick against the last one seen; the own hull's jump), then re-opens the old host as a peer.
 * The run ends with a JSON report and a Markdown table per size: host tick cost p50 / p95 / max (the Worker's actor
 * loop), host uplink and downlink (RTCPeerConnection.getStats bytes per data channel), per-peer snapshot rate, RTT
 * and clock offset, lost frames, memory per tab, migration times, desync (the own predicted hull against the
 * authority's newest row for it), the room's WebSocket messages by type, the console errors — each against the §13.8
 * budgets.
 *
 *   node tools/mp-p2p-soak.mjs --seats=4  --rooms=ws://127.0.0.1:8791 --port=5340 --play=2 --migrate-every=1
 *   node tools/mp-p2p-soak.mjs --seats=14 --rooms=ws://127.0.0.1:8791 --port=5340 --play=5 --migrate-every=2
 *   node tools/mp-p2p-soak.mjs --seats=28 --rooms=ws://127.0.0.1:8791 --port=5340 --play=6 --migrate-every=3
 *   node tools/mp-p2p-soak.mjs --seats=4  --rooms=… --ice=relay --play=65      # every peer through the TURN servers
 *                                                                              # /api/ice hands out (fetched with the site
 *                                                                              # Origin; the credential never leaves memory)
 *
 * --migrate-mode=stepdown replaces the tab close with a room-socket blip past the grace: the host keeps its actor, the
 * room elects a successor, the old host re-joins and its next report is refused `host_only` — the step-down to a peer
 * (P1's request, proven here against the real service). --host=game (the "realism" run): seat 1 is the real game page (`?mp=v2`, the Play menu's LAN room, its size), the
 * harness seats join its room by code; the game host plays through the game's own client and the HUD, the migration
 * closes its tab and a harness seat takes over. --rooms is required (the harness pages run on http://127.0.0.1:<port>:
 * the room service must allow that origin —
 * `wrangler dev --var ALLOWED_ORIGINS:http://127.0.0.1:<port>`). --hosts=K marks the first K seats as able to host (the
 * creator and its successors); the rest decline on join like the mobile tier. --ice=none (host candidates, the LAN
 * case) | all (STUN + TURN, whichever ICE picks) | relay (TURN only, both ends). --ice-renew-at=<minutes> re-fetches the
 * credentials and hands them to every tab (the per-connection resolution the transport applies). --strict exits 1 when
 * a budget fails; otherwise the exit code reflects only whether the run completed. Chrome runs under whatever the caller
 * wraps it in (the probe mutex, nice 19): the runner takes no lock itself.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';

const root = new URL('..', import.meta.url).pathname;

function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}
const flag = (name) => process.argv.includes(name);
const seats = Math.max(2, Number(argValue('seats', 4)) | 0);
const teamSize = Math.ceil(seats / 2);
const label = argValue('label', `${teamSize}v${seats - teamSize}`);
const roomsUrl = argValue('rooms', '');
const playMin = Number(argValue('play', 2));
const migrateEveryMin = Number(argValue('migrate-every', 0));
const migrateLimit = Number(argValue('migrations', 99));
const iceMode = argValue('ice', 'none');
const iceUrl = argValue('ice-url', 'https://cot.kevinliu.studio/api/ice');
const iceOrigin = argValue('ice-origin', 'https://cot.kevinliu.studio');
const iceRenewAtMin = Number(argValue('ice-renew-at', 0));
const hosts = Math.max(1, Math.min(seats, Number(argValue('hosts', 3)) | 0));
const mapId = argValue('map', 'verdant');
const mode = argValue('mode', 'lan');
const gameMode = argValue('game-mode', 'standard');
const predict = argValue('predict', '1');
/** --fire=0: the seats drive but never fire, so a hold run ends on the clock, not on a verdict. */
const fire = argValue('fire', '1');
const countdownS = Number(argValue('countdown', 3));
const sampleS = Math.max(1, Number(argValue('sample', 2)));
const rejoin = argValue('rejoin', '1') !== '0';
const graceMs = Number(argValue('grace', 8000));
/** --snapshot-hz=20|30: the rate the host publishes at (P3b's comparison; 0 = the actor's default). */
const snapshotHz = Number(argValue('snapshot-hz', 0)) | 0;
/** close: the host's tab dies. stepdown: the host's ROOM socket drops past the grace (a network blip) while its tab and actor live on; it re-joins after the election and its next report is refused host_only, so it steps down to a peer of the new host. */
const migrateMode = argValue('migrate-mode', 'close');
const outputDir = resolve(argValue('out', join(root, '.qa-dev', 'mp-p2p-soak')));
const cacheDir = resolve(argValue('cache-dir', join(outputDir, 'vite-cache')));
const requestedVitePort = Number(argValue('port', 0));
const json = flag('--json');
const strict = flag('--strict');
const headful = flag('--headful');
const gameHost = argValue('host', 'harness') === 'game';
const GAME_BOOT_QUERY = 'nosplash=1&tier=desktop&gfxreset=1&mp=v2';
// The harness's prediction reads `getSpec` from the saved registry (src/vehicles/specs.ts without the fleet's lazy
// finalization): these ids exist there and in the host's fleet alike.
const SPEC_IDS = ['m1a2', 't90m', 'strv103', 'kv2', 't90m_proryv'];

/** §13.8 budgets (docs/MULTIPLAYER-V2.md). */
const BUDGET = Object.freeze({
  migrationMs: 12_000,      // host loss → the first snapshot from the new host, on every remaining seat
  hullJumpM: 0.05,          // "0.0 m" at the report's precision (1 mm quantization + the prediction's own step)
  hostTickP95Ms: 8,         // at 28 entities
  hostUplinkMbit: 4,        // 14v14: reported; above it the certification names P3b
  desyncM: 0.5,             // the own hull against the authority's newest row for it, at the end
  peerRssMB: 150,           // a peer tab's renderer
  consoleErrors: 0,
  roomMessagesPerStart: 2_000,
  freeRequestsPerDay: 100_000,
});

const log = (line) => { if (!json) process.stderr.write(`[mp-p2p-soak ${label}] ${line}\n`); };
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const startedAt = performance.now();
const elapsedMs = () => Math.round(performance.now() - startedAt);
const median = (values) => { const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b); return sorted.length ? sorted[sorted.length >> 1] : null; };
const percentile = (values, p) => { const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b); return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))] : null; };
const max = (values) => { const finite = values.filter((value) => Number.isFinite(value)); return finite.length ? Math.max(...finite) : null; };
const min = (values) => { const finite = values.filter((value) => Number.isFinite(value)); return finite.length ? Math.min(...finite) : null; };
const round = (value, digits = 1) => (value === null || value === undefined || !Number.isFinite(value) ? null : Math.round(value * 10 ** digits) / 10 ** digits);
const loadAverage = () => { try { return execFileSync('sysctl', ['-n', 'vm.loadavg'], { encoding: 'utf8' }).trim(); } catch { return null; } };

function freePort() {
  return new Promise((resolvePort, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolvePort(port)); });
  });
}

const report = {
  label, seats, teamSize, hosts, pass: false, failures: [], verdicts: [], parameters: { roomsUrl, playMin, migrateEveryMin, iceMode, iceUrl: iceMode === 'none' ? null : iceUrl, hosts, mapId, mode, gameMode, predict, countdownS, sampleS, rejoin, graceMs, snapshotHz: snapshotHz || null },
  machine: { loadStart: loadAverage(), loadEnd: null, node: process.version },
  room: null, entry: null, steady: null, migrations: [], memory: null, roomMessages: null, errors: [], peers: [], series: [], wallMs: 0,
};
const failures = report.failures;
const step = (name, detail = {}) => { log(`${name} (${(elapsedMs() / 1000).toFixed(1)} s)${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`); };

// ------------------------------------------------------------ ICE (never logged, never written)

let iceConfig = null;
async function fetchIce() {
  const response = await fetch(iceUrl, { headers: { origin: iceOrigin }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`ICE endpoint ${iceUrl}: HTTP ${response.status}`);
  const body = await response.json();
  if (!Array.isArray(body.iceServers) || !body.iceServers.length) throw new Error('ICE endpoint returned no servers');
  const urls = body.iceServers.flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]));
  return { config: { iceServers: body.iceServers, relayOnly: iceMode === 'relay' }, facts: { urls, expiresInSeconds: body.expiresInSeconds ?? null, turn: urls.filter((url) => /^turns?:/i.test(url)).length, fetchedAt: new Date().toISOString() } };
}

// ------------------------------------------------------------ the browser and the seats

let vite = null;
let browser = null;
let browserPid = null;
const peers = [];
const errors = report.errors;
function observe(page, id) {
  page.on('pageerror', (error) => errors.push({ page: id, kind: 'pageerror', atMs: elapsedMs(), text: error.stack || error.message }));
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ page: id, kind: 'console', atMs: elapsedMs(), text: `${message.text()}${message.location()?.url ? ` [${message.location().url}]` : ''}` }); });
}
const relevantErrors = () => errors.filter((entry) => !/favicon|ERR_ABORTED/i.test(entry.text));

function peerUrl(origin, peer) {
  const params = new URLSearchParams({ rooms: roomsUrl, id: peer.id, name: peer.name, index: String(peer.index), host: peer.canHost ? '1' : '0', ice: iceMode, predict, countdown: String(countdownS), fire, ...(snapshotHz > 0 ? { snapshotHz: String(snapshotHz) } : {}) });
  return `${origin}/mp-p2p-peer/?${params}`;
}

async function waitFor(page, predicate, labelText, timeoutMs, args = []) {
  try { await page.waitForFunction(predicate, { timeout: timeoutMs, polling: 100 }, ...args); }
  catch (error) { throw new Error(`${labelText}: ${error.message}`); }
}

/** The real game page as the creator: the Garage's battle menu → LAN → create; the room code from the address bar. */
async function openGamePage(origin, peer) {
  const page = await peer.context.newPage();
  await page.setViewport({ width: 1024, height: 640, deviceScaleFactor: 1 });
  observe(page, peer.id);
  await page.goto(`${origin}/?${GAME_BOOT_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await waitFor(page, () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', `${peer.id} garage ready`, 240_000);
  peer.page = page;
  peer.opens++;
  return page;
}

async function openPage(origin, peer) {
  if (peer.game) return openGamePage(origin, peer);
  const page = await peer.context.newPage();
  await page.setViewport({ width: 320, height: 200, deviceScaleFactor: 1 });
  if (iceConfig) await page.evaluateOnNewDocument((config) => { window.__peerIce = config; }, iceConfig);
  observe(page, peer.id);
  await page.goto(peerUrl(origin, peer), { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.waitForFunction(() => !!window.__peer && window.__peer.status().room !== null, { timeout: 120_000, polling: 100 });
  const booted = await page.evaluate(() => window.__peer.status().errors);
  if (booted.length) throw new Error(`${peer.id} boot errors: ${booted.map((entry) => entry.text).join(' | ')}`);
  peer.page = page;
  peer.opens++;
  return page;
}
/** The game page's facts in the harness's shape (window.__MULTIPLAYER_V2 is up under puppeteer: navigator.webdriver). */
const gameStatus = () => {
  const v2 = window.__MULTIPLAYER_V2?.stats?.() ?? null;
  const session = v2?.session ?? null;
  const match = session?.match ?? null;
  const p2p = session?.p2p ?? null;
  const game = window.__DEBUG?.game ?? null;
  const own = game?.player?.state?.pos ?? null;
  return {
    playerId: v2?.room?.playerId ?? session?.playerId ?? null, playerName: 'game', canHost: true, iceMode: 'game', predict: '1', stepHz: 0, uptimeMs: Math.round(performance.now()), nowMs: Math.round(performance.now()), wall: Date.now(),
    room: v2?.room ? { phase: v2.room.phase, roomCode: v2.room.roomCode, players: v2.room.players, hostId: p2p?.hostId ?? null, generation: p2p?.generation ?? 0, isHost: p2p?.role === 'host', adminId: v2.room.adminId ?? null, matchStatus: null, seat: null, me: null, rttMs: v2.network?.rttMs ?? null, signalsSent: null, signalsReceived: null, signalsRefused: null } : null,
    session: session ? { phase: session.phase, role: p2p?.role ?? null, migrations: session.migrations ?? 0, rounds: session.rounds ?? 0, matchUrl: session.matchUrl ?? null, p2p: p2p ? { ...p2p } : null } : null,
    host: p2p?.role === 'host' ? { state: p2p.hostState, generation: p2p.generation, peersConnected: p2p.peersConnected, relayed: p2p.relayed, uplinkBytesPerS: p2p.uplinkBytesPerS, tick: null, phase: null, reports: null, core: null } : null,
    match: match ? { ...match, framesDropped: match.transport?.framesDropped ?? null, prediction: match.prediction ?? null } : null,
    own: own ? { tick: match?.snapshotsAccepted ?? 0, x: own.x, z: own.z, atMs: performance.now(), predicted: true } : null,
    lastSnapshotTick: null, framesSeen: null, welcomes: match?.welcomed ? 1 : 0, predictionReady: !!match?.prediction, predictionError: null, mapId: null, iceResolves: null,
    rtc: { connections: 0, samples: [], retired: { bytesSent: 0, bytesReceived: 0, messagesSent: 0, messagesReceived: 0, connections: 0 }, totals: { bytesSent: null, bytesReceived: null, messagesSent: null, messagesReceived: null } },
    roomMessages: { out: {}, in: {}, bytesOut: 0, bytesIn: 0, sockets: 0 },
    memory: { jsHeapUsed: performance.memory?.usedJSHeapSize ?? null, jsHeapTotal: performance.memory?.totalJSHeapSize ?? null },
    errors: [], timelineLength: 0,
  };
};
const statusOf = (peer) => (peer.game ? peer.page.evaluate(gameStatus) : peer.page.evaluate(() => window.__peer.status()));
const timelineOf = (peer, since = 0) => (peer.game ? Promise.resolve([]) : peer.page.evaluate((from) => window.__peer.timeline(from), since));
const live = () => peers.filter((peer) => peer.page && !peer.page.isClosed());

async function waitUntil(predicate, labelText, timeoutMs, pollMs = 250) {
  const deadline = performance.now() + timeoutMs;
  for (;;) {
    const result = await predicate();
    if (result) return result;
    if (performance.now() > deadline) throw new Error(`timeout: ${labelText}`);
    await sleep(pollMs);
  }
}

/** Renderer processes under the browser (RSS in MB), the host's renderer usually the largest. */
function rendererMemory() {
  if (!browserPid) return null;
  let rows;
  try { rows = execFileSync('ps', ['-axo', 'pid=,ppid=,rss=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n'); } catch { return null; }
  const byParent = new Map();
  const info = new Map();
  for (const row of rows) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(row);
    if (!match) continue;
    const [, pid, ppid, rss, command] = match;
    info.set(Number(pid), { ppid: Number(ppid), rssMB: Number(rss) / 1024, renderer: /--type=renderer/.test(command) });
    if (!byParent.has(Number(ppid))) byParent.set(Number(ppid), []);
    byParent.get(Number(ppid)).push(Number(pid));
  }
  const renderers = [];
  const stack = [browserPid];
  const seen = new Set();
  while (stack.length) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    const entry = info.get(pid);
    if (entry?.renderer) renderers.push(round(entry.rssMB, 1));
    for (const child of byParent.get(pid) ?? []) stack.push(child);
  }
  renderers.sort((a, b) => b - a);
  return { count: renderers.length, maxMB: renderers[0] ?? null, secondMB: renderers[1] ?? null, medianMB: median(renderers), totalMB: round(renderers.reduce((sum, value) => sum + value, 0), 0), all: renderers };
}

// ------------------------------------------------------------ the run

const series = report.series;
const memorySeries = [];
// A stop from outside (the wrapper's trap, ctrl-c) still ends with a report and no browser left behind.
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { if (stopping) return; stopping = true; failures.push(`stopped by ${signal} at ${elapsedMs()} ms`); log(`${signal}: ending the run`); });
let origin = '';
let roomCode = '';
let generation = 0;
let hostPeer = null;
const finalStatus = new Map();
try {
  if (!/^wss?:\/\//.test(roomsUrl)) throw new Error('--rooms=ws(s)://… is required (the room service that admits http://127.0.0.1:<port>)');
  await mkdir(outputDir, { recursive: true });
  if (iceMode !== 'none') {
    const fetched = await fetchIce();
    iceConfig = fetched.config;
    report.parameters.ice = fetched.facts;
    step('ice', fetched.facts);
  }
  const vitePort = requestedVitePort > 0 ? requestedVitePort : await freePort();
  // The harness pages take the room service from their URL; the real game page (--host=game) resolves it from the build's
  // VITE_ROOMS_URL, inlined by the dev server from the environment (the e2e's way).
  process.env.VITE_ROOMS_URL = roomsUrl;
  vite = await createViteServer({ root, cacheDir, logLevel: 'error', server: { host: '127.0.0.1', port: vitePort, strictPort: true, hmr: false } });
  await vite.listen();
  origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  step('vite', { origin, cacheDir });

  browser = await puppeteer.launch({
    headless: !headful, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--enable-webgl', '--window-size=640,400'],
  });
  browserPid = browser.process()?.pid ?? null;
  step('browser', { pid: browserPid });

  for (let index = 0; index < seats; index++) {
    const id = `p3s${String(index + 1).padStart(2, '0')}`;
    peers.push({ index, id, name: `Seat ${index + 1}`, context: await browser.createBrowserContext(), page: null, canHost: index < hosts, team: index % 2 === 0 ? 'alpha' : 'bravo', specId: SPEC_IDS[index % SPEC_IDS.length], opens: 0, closedWall: null, hostedGenerations: [], game: gameHost && index === 0 });
  }
  // The pages open in small waves: the first transform of the harness module warms the dev server for the rest.
  await openPage(origin, peers[0]);
  for (let index = 1; index < peers.length; index += 4) await Promise.all(peers.slice(index, index + 4).map((peer) => openPage(origin, peer)));
  step('pages', { count: peers.length });

  // ---- the room: the creator on alpha, the seats alternating sides, everyone ready, the creator starts
  if (gameHost) {
    // the game page creates the LAN room through its Play menu (the menu's size; bots fill by the menu's rule); the code rides the URL
    const page = peers[0].page;
    // 2026-09-29: multiplayer has its own entry since the play-menu split (8ccc472c2) — the battle button launches solo.
    await page.click('.cot-multiplayer-entry');
    await page.waitForSelector('.cot-play.show .modes [data-mode="lan"]', { timeout: 30_000 });
    await page.click('.cot-play .modes [data-mode="lan"]');
    await page.waitForFunction(() => document.querySelector('.cot-play .modes [data-mode="lan"]')?.classList.contains('on'), { timeout: 10_000 });
    await waitFor(page, () => document.querySelector('.cot-play')?.classList.contains('show'), 'game host play menu', 30_000);
    await page.evaluate(() => { const name = document.querySelector('.cot-play [data-field="name"]'); if (name) name.value = 'Game Host'; });
    await page.click('.cot-play [data-action="create"]');
    await waitFor(page, () => document.querySelector('.cot-play .lobby')?.classList.contains('show') && /[?&]room=[A-Z0-9]{6}/.test(location.search), 'game host room created', 30_000);
    roomCode = new URL(await page.evaluate(() => location.href)).searchParams.get('room');
    report.room = { code: roomCode, mode: 'lan', teamSize: null, mapId: null, gameMode: null, creator: 'game page' };
    step('room-created', report.room);
    peers[0].id = await page.evaluate(() => window.__MULTIPLAYER_V2?.stats?.().room?.playerId ?? null) ?? peers[0].id;
  } else {
    const created = await peers[0].page.evaluate((options) => window.__peer.create(options), { mode, specId: peers[0].specId, settings: { teamSize, mapId, gameMode, botsFill: false }, team: 'alpha' });
    roomCode = created.code;
    report.room = { code: roomCode, mode, teamSize, mapId, gameMode };
    step('room-created', report.room);
  }
  for (const peer of peers.slice(1)) {
    const joined = await peer.page.evaluate((options) => window.__peer.join(options), { code: roomCode, specId: peer.specId, team: peer.team });
    peer.team = joined.team ?? peer.team;
  }
  step('joined', { players: peers.length });
  await waitUntil(async () => (await statusOf(peers[gameHost ? 1 : 0])).room.players === seats, 'every seat in the room', 30_000);
  for (const peer of peers) {
    if (peer.game) await peer.page.click('.cot-play [data-action="ready"]');
    else await peer.page.evaluate(() => window.__peer.setReady(true));
  }
  await waitUntil(async () => { const status = await statusOf(peers[gameHost ? 1 : 0]); return status.room.players === seats; }, 'ready', 30_000);
  const messagesBeforeStart = await Promise.all(peers.map(async (peer) => (await statusOf(peer)).roomMessages));
  const startWall = Date.now();
  if (gameHost) {
    await waitFor(peers[0].page, () => !document.querySelector('.cot-play [data-action="start"]')?.disabled, 'game host start enabled', 30_000);
    await peers[0].page.click('.cot-play [data-action="start"]');
  } else {
    await peers[0].page.evaluate(() => window.__peer.start());
  }
  step('started', { wall: new Date(startWall).toISOString() });

  // ---- entry: every seat welcomed, the host serving N-1 peers
  await waitUntil(async () => {
    const statuses = await Promise.all(peers.map(statusOf));
    const welcomed = statuses.filter((status) => status.match?.welcomed).length;
    const host = statuses.find((status) => status.session?.role === 'host');
    if (welcomed === seats && host && host.host?.peersConnected === seats - 1) return true;
    return false;
  }, `every seat welcomed and the host serving ${seats - 1} peers`, 180_000, 500);
  const entryStatuses = await Promise.all(peers.map(statusOf));
  hostPeer = peers[entryStatuses.findIndex((status) => status.session?.role === 'host')];
  generation = entryStatuses.find((status) => status.session?.role === 'host').session.p2p.generation;
  hostPeer.hostedGenerations.push(generation);
  const entryTimelines = await Promise.all(peers.map((peer) => timelineOf(peer)));
  const joinMs = peers.map((peer, index) => { const welcome = entryTimelines[index].find((entry) => entry.kind === 'welcome'); return welcome ? welcome.wall - startWall : null; });
  if (gameHost) {
    // the game host's entry: its load trace (the battle revealed) — puppeteer's clock, not a timeline
    const trace = await peers[0].page.evaluate(() => ({ totalMs: window.__NETWORK_LOAD?.totalMs ?? null, status: window.__NETWORK_LOAD?.status ?? null, stages: window.__NETWORK_LOAD?.stages ?? null }));
    report.gameHostEntry = trace;
    joinMs[0] = trace.totalMs;
  }
  const messagesAtEntry = entryStatuses.map((status) => status.roomMessages);
  const sumMessages = (list, direction) => list.reduce((sum, entry) => sum + Object.values(entry[direction]).reduce((a, b) => a + b, 0), 0);
  const startBurst = { out: sumMessages(messagesAtEntry, 'out') - sumMessages(messagesBeforeStart, 'out'), in: sumMessages(messagesAtEntry, 'in') - sumMessages(messagesBeforeStart, 'in') };
  const gather = entryTimelines.flatMap((timeline) => timeline.filter((entry) => entry.kind === 'pc:gathered'));
  report.entry = {
    hostId: hostPeer.id, generation, matchUrl: entryStatuses[hostPeer.index].session.matchUrl,
    joinMs: { min: min(joinMs), median: median(joinMs), max: max(joinMs), perSeat: joinMs },
    hostPeersConnected: entryStatuses[hostPeer.index].host.peersConnected, hostState: entryStatuses[hostPeer.index].host.state,
    candidateTypes: entryStatuses.filter((status) => status.session?.role === 'peer').map((status) => status.session.p2p.candidateType),
    viaTurn: entryStatuses.filter((status) => status.session?.role === 'peer').map((status) => status.session.p2p.viaTurn),
    iceGather: { connections: gather.length, candidatesMedian: median(gather.map((entry) => entry.candidates)), candidatesMax: max(gather.map((entry) => entry.candidates)), relayMedian: median(gather.map((entry) => entry.relay)), gatherMsMedian: median(gather.map((entry) => entry.ms)), gatherMsMax: max(gather.map((entry) => entry.ms)) },
    roomMessagesStartBurst: startBurst, roomSocketCloses: entryTimelines.flatMap((timeline, index) => timeline.filter((entry) => entry.kind === 'room-socket:close').map((entry) => `${peers[index].id}@${Math.round(entry.wall - startWall)}ms:${entry.code}:${entry.reason}`)),
    predictionReady: entryStatuses.filter((status) => status.predictionReady).length, predictionErrors: entryStatuses.map((status) => status.predictionError).filter(Boolean),
  };
  step('entered', { host: hostPeer.id, joinMs: report.entry.joinMs, burst: startBurst, gather: report.entry.iceGather, candidates: [...new Set(report.entry.candidateTypes)] });

  // ---- play: sample every seat; migrate on schedule; renew ICE on schedule
  const playMs = playMin * 60_000;
  const playStartedAt = performance.now();
  const migrateEveryMs = migrateEveryMin > 0 ? migrateEveryMin * 60_000 : Infinity;
  let nextMigrationAt = migrateEveryMs;
  let nextRenewAt = iceRenewAtMin > 0 && iceMode !== 'none' ? iceRenewAtMin * 60_000 : Infinity;
  let lastMemoryAt = -Infinity;
  const compact = (peer, status) => ({
    id: peer.id, role: status.session?.role ?? null, gen: status.session?.p2p?.generation ?? null, phase: status.match?.phase ?? null, ts: status.match?.transportState ?? null,
    snap: status.match?.snapshotsAccepted ?? null, rtt: status.match?.rttMs ?? null, off: status.match?.serverOffsetMs ?? null, bIn: status.match?.bytesIn ?? null, bOut: status.match?.bytesOut ?? null,
    loss: status.match?.lossRate ?? null, stale: status.match?.staleSnapshots ?? null, missing: status.match?.missingBaselines ?? null, dropped: status.match?.framesDropped ?? null, stalls: status.match?.stalls ?? null, reconnects: status.match?.reconnects ?? null,
    heap: status.memory?.jsHeapUsed ?? null, hostUp: status.host?.uplinkBytesPerS ?? null, peers: status.host?.peersConnected ?? null, tickP95: status.host?.core?.tickP95Ms ?? null, tickP50: status.host?.core?.tickP50Ms ?? null, tickMax: status.host?.core?.tickMaxMs ?? null,
    // P3b: the host's snapshot rate, its skips for slow peers and the interest tiers (rows published per tier, held, populations); the peer's interpolation facts
    hz: status.host?.core?.snapshotHz ?? status.match?.snapshotRateHz ?? null, skips: status.host?.core?.snapshotSkips ?? null,
    tierPub: status.host?.core?.interest?.published ?? null, tierHeld: status.host?.core?.interest?.held ?? null, tierPop: status.host?.core?.interest?.population ?? null,
    rowExtra: status.match?.maxRowExtrapolatedMs ?? null, snapped: status.match?.snappedSamples ?? null, delay: status.match?.interpolationDelayMs ?? null,
    rtcSent: status.rtc?.totals?.bytesSent ?? null, rtcRecv: status.rtc?.totals?.bytesReceived ?? null, pcRtt: median((status.rtc?.samples ?? []).map((sample) => sample.rttMs)), viaTurn: (status.rtc?.samples ?? []).some((sample) => sample.viaTurn),
    pred: status.match?.prediction?.lastPositionErrorM ?? null, predMax: status.match?.prediction?.maxFreePositionErrorM ?? null, tick: status.lastSnapshotTick ?? null,
  });
  const sampleAll = async () => {
    const current = live();
    const statuses = await Promise.all(current.map(statusOf));
    const row = { atMs: Math.round(performance.now() - playStartedAt), wall: Date.now(), peers: current.map((peer, index) => compact(peer, statuses[index])) };
    series.push(row);
    return { current, statuses, row };
  };
  await sampleAll();
  while (performance.now() - playStartedAt < playMs && !stopping) {
    await sleep(sampleS * 1000);
    const { row } = await sampleAll();
    const hostRow = row.peers.find((entry) => entry.role === 'host');
    if (row.peers.length && row.peers.every((entry) => entry.phase === 'closed' || entry.phase === 'ended' || entry.phase === 'failed')) {
      // the match ended on its own (a verdict, the clock): the run's play is over
      const statuses = await Promise.all(live().map(statusOf));
      report.matchEnded = { atMs: row.atMs, phases: statuses.map((status) => [status.playerId, status.match?.phase ?? null, status.match?.closeReason ?? null, status.session?.phase ?? null]) };
      step('match-ended', report.matchEnded);
      break;
    }
    if (performance.now() - lastMemoryAt >= 10_000) { lastMemoryAt = performance.now(); const memory = rendererMemory(); if (memory) memorySeries.push({ atMs: row.atMs, ...memory, all: undefined }); }
    if (series.length % Math.max(1, Math.round(30 / sampleS)) === 0) log(`t+${Math.round(row.atMs / 1000)} s: host ${hostRow?.id ?? '-'} gen ${hostRow?.gen ?? '-'} peers ${hostRow?.peers ?? '-'} up ${round((hostRow?.hostUp ?? 0) * 8 / 1000, 0)} kbit/s tick p95 ${round(hostRow?.tickP95, 2)} ms; seats ${row.peers.length}, rtt median ${round(median(row.peers.map((entry) => entry.rtt)), 1)} ms, load ${loadAverage()}`);
    const elapsed = performance.now() - playStartedAt;
    if (elapsed >= nextRenewAt) {
      nextRenewAt = Infinity;
      const fetched = await fetchIce();
      iceConfig = fetched.config;
      for (const peer of live()) await peer.page.evaluate((config) => window.__peer.setIce(config), iceConfig).catch(() => {});
      report.parameters.iceRenewed = { atMs: Math.round(elapsed), ...fetched.facts };
      step('ice-renewed', report.parameters.iceRenewed);
    }
    if (elapsed >= nextMigrationAt && report.migrations.length < migrateLimit && playMs - elapsed > 20_000) {
      nextMigrationAt = elapsed + migrateEveryMs;
      await migrate();
    }
  }
  report.machine.loadEnd = loadAverage();

  // ---- the end: every seat's final facts
  const endStatuses = await Promise.all(live().map(statusOf));
  const endTimelines = await Promise.all(live().map((peer) => timelineOf(peer)));
  live().forEach((peer, index) => finalStatus.set(peer.id, { status: endStatuses[index], timeline: endTimelines[index] }));
  // every seat's timeline tail (the link, the room socket, the elections, the host) — what a dropped peer's last minutes looked like
  report.timelines = Object.fromEntries([...finalStatus].map(([id, entry]) => [id, (entry.timeline ?? []).filter((event) => !/^(?:pc:ice|ice:resolved|pc:gathered|pc:new|frame:first)$/.test(event.kind) || event.kind === 'frame:first').slice(-160).map((event) => ({ atS: Math.round(event.atMs / 100) / 10, kind: event.kind, ...(event.state ? { state: event.state } : {}), ...(event.phase ? { phase: event.phase } : {}), ...(event.previous ? { previous: event.previous } : {}), ...(event.reconnects !== undefined ? { reconnects: event.reconnects } : {}), ...(event.generation !== undefined ? { generation: event.generation } : {}), ...(event.detail ? { detail: event.detail } : {}), ...(event.message ? { message: event.message } : {}), ...(event.reason !== undefined ? { reason: event.reason } : {}), ...(event.code !== undefined ? { code: event.code } : {}), ...(event.id !== undefined ? { id: event.id } : {}), ...(event.sinceMs !== undefined ? { sinceMs: event.sinceMs } : {}) }))]));
  report.memory = { renderers: rendererMemory(), series: memorySeries, jsHeapMB: Object.fromEntries([...finalStatus].map(([id, entry]) => [id, round((entry.status.memory?.jsHeapUsed ?? 0) / 1048576, 1)])) };
  summarize();
} catch (error) {
  failures.push(error instanceof Error ? error.stack || error.message : String(error));
} finally {
  report.wallMs = elapsedMs();
  const relevant = relevantErrors();
  if (relevant.length) report.consoleErrors = relevant.length;
  report.pass = failures.length === 0 && report.verdicts.every((verdict) => verdict.pass !== false || !strict);
  report.completed = failures.length === 0;
  await writeFile(join(outputDir, `soak-${seats}.json`), JSON.stringify(report, null, 2));
  await writeFile(join(outputDir, `soak-${seats}.md`), markdown());
  const teardown = async () => {
    try { await browser?.close(); } catch { /* gone */ }
    try { await vite?.close(); } catch { /* gone */ }
  };
  await Promise.race([teardown(), sleep(30_000)]);
  if (browserPid) { try { process.kill(browserPid, 0); process.kill(browserPid, 'SIGKILL'); log(`browser ${browserPid} killed after the teardown`); } catch { /* already gone */ } }
}

// ------------------------------------------------------------ migration

async function migrate() {
  const k = report.migrations.length + 1;
  const before = await Promise.all(live().map(async (peer) => [peer, await statusOf(peer)]));
  const hostEntry = before.find(([, status]) => status.session?.role === 'host');
  if (!hostEntry) { failures.push(`migration ${k}: no seat hosts`); return; }
  const [oldHost, oldStatus] = hostEntry;
  const oldGeneration = oldStatus.session.p2p.generation;
  const oldTeam = oldStatus.room?.me?.team ?? null;
  const preClose = { status: oldStatus, timeline: await timelineOf(oldHost) };
  finalStatus.set(`${oldHost.id}#gen${oldGeneration}`, preClose);
  const closedWall = Date.now();
  const stepDown = migrateMode === 'stepdown' && !oldHost.game;
  if (stepDown) {
    await oldHost.page.evaluate(() => window.__peer.disconnectRoom('blip'));
    step(`migration-${k}-host-room-socket-dropped`, { host: oldHost.id, generation: oldGeneration, tick: oldStatus.host?.core?.tick ?? null });
  } else {
    await oldHost.page.close();
    oldHost.page = null;
    oldHost.closedWall = closedWall;
    step(`migration-${k}-host-closed`, { host: oldHost.id, generation: oldGeneration, tick: oldStatus.host?.core?.tick ?? null });
  }
  const remaining = live().filter((peer) => peer !== oldHost);
  let newHost = null;
  let newStatus = null;
  try {
    await waitUntil(async () => {
      const statuses = await Promise.all(remaining.map(statusOf));
      const index = statuses.findIndex((status) => status.session?.role === 'host' && (status.session.p2p?.generation ?? 0) > oldGeneration && status.host?.state === 'live');
      if (index < 0) return false;
      newHost = remaining[index];
      newStatus = statuses[index];
      return true;
    }, `migration ${k}: a new host live`, graceMs + 90_000, 250);
  } catch (error) {
    failures.push(error.message);
    report.migrations.push({ k, oldHost: oldHost.id, oldGeneration, closedWall, failed: 'no new host' });
    return;
  }
  const newGeneration = newStatus.session.p2p.generation;
  newHost.hostedGenerations.push(newGeneration);
  hostPeer = newHost;
  generation = newGeneration;
  const newTeam = newStatus.room?.me?.team ?? null;
  // every remaining seat: its first frame from the new host
  const deadline = performance.now() + 90_000;
  const perPeer = new Map();
  for (;;) {
    const timelines = await Promise.all(remaining.map((peer) => timelineOf(peer)));
    let pending = 0;
    remaining.forEach((peer, index) => {
      const after = timelines[index].filter((entry) => entry.wall >= closedWall - 50);
      const loss = after.find((entry) => entry.kind === 'transport:reconnecting' || (entry.kind === 'p2p:migration' && entry.phase === 'begin'));
      const changed = after.find((entry) => entry.kind === 'host_changed' && entry.generation === newGeneration);
      const hostLive = after.find((entry) => entry.kind === 'host:live');
      const welcome = after.find((entry) => entry.kind === 'welcome');
      const first = after.find((entry) => entry.kind === 'frame:first');
      if (!first) pending++;
      perPeer.set(peer.id, {
        id: peer.id, role: peer === newHost ? 'new host' : 'peer', team: null, allyOfNewHost: null,
        lossAfterMs: loss ? loss.wall - closedWall : null, hostChangedAfterMs: changed ? changed.wall - closedWall : null, hostLiveAfterMs: hostLive ? hostLive.wall - closedWall : null,
        welcomeAfterMs: welcome ? welcome.wall - closedWall : null, firstFrameAfterMs: first ? first.wall - closedWall : null,
        jumpM: first?.jumpM ?? null, rowJumpM: first?.rowJumpM ?? null, leadAtLossM: first?.leadAtLossM ?? null, beforeTick: first?.beforeTick ?? null, afterTick: first?.tick ?? null, tickContinuous: first?.tickContinuous ?? null, resumeTick: changed?.resumeTick ?? null,
        hostChangedReason: changed?.reason ?? null, reconnects: null,
        // the seat's own timeline through the window (ms after the host's tab closed): the link, the election, the host boot, the welcome, the first frame
        events: after.filter((entry) => /^(?:transport:|link:|welcome|host_changed|frame:first|host:|p2p:|pc:state|room-socket:close|ice:)/.test(entry.kind)).slice(0, 80)
          .map((entry) => ({ ms: entry.wall - closedWall, kind: entry.kind, ...(entry.state ? { state: entry.state } : {}), ...(entry.phase ? { phase: entry.phase } : {}), ...(entry.previous ? { previous: entry.previous } : {}), ...(entry.reconnects !== undefined ? { reconnects: entry.reconnects } : {}), ...(entry.generation !== undefined ? { generation: entry.generation } : {}), ...(entry.detail ? { detail: entry.detail } : {}) })),
      });
    });
    if (pending === 0 || performance.now() > deadline) break;
    await sleep(250);
  }
  const statuses = await Promise.all(remaining.map(statusOf));
  remaining.forEach((peer, index) => { const entry = perPeer.get(peer.id); entry.team = statuses[index].room?.me?.team ?? null; entry.allyOfNewHost = entry.team !== null && entry.team === newTeam; entry.reconnects = statuses[index].match?.reconnects ?? null; entry.phase = statuses[index].match?.phase ?? null; entry.snapshotsAfter = statuses[index].match?.snapshotsAccepted ?? null; entry.hintSent = statuses[index].match?.resumeHintsSent ?? null; });
  const rows = [...perPeer.values()];
  // P3b: the own-row hints the new host applied (the migration seed for the hulls it could not see) and refused
  const newHostCore = statuses[remaining.indexOf(newHost)]?.host?.core ?? null;
  const hints = newHostCore?.resumeHints ? { applied: newHostCore.resumeHints.applied, rejected: newHostCore.resumeHints.rejected } : null;
  const migration = {
    k, oldHost: oldHost.id, oldGeneration, oldTeam, newHost: newHost.id, newGeneration, newTeam, closedWall, reason: rows.find((row) => row.hostChangedReason)?.hostChangedReason ?? null,
    hostChangedAfterMs: median(rows.map((row) => row.hostChangedAfterMs)), newHostLiveAfterMs: rows.find((row) => row.role === 'new host')?.hostLiveAfterMs ?? null,
    firstFrame: { min: min(rows.map((row) => row.firstFrameAfterMs)), median: median(rows.map((row) => row.firstFrameAfterMs)), max: max(rows.map((row) => row.firstFrameAfterMs)), missing: rows.filter((row) => row.firstFrameAfterMs === null).map((row) => row.id) },
    hullJump: { max: max(rows.map((row) => row.jumpM)), median: median(rows.map((row) => row.jumpM)), allies: max(rows.filter((row) => row.allyOfNewHost && row.role === 'peer').map((row) => row.jumpM)), enemies: max(rows.filter((row) => !row.allyOfNewHost && row.role === 'peer').map((row) => row.jumpM)), newHost: rows.find((row) => row.role === 'new host')?.jumpM ?? null },
    // the same jump measured on the authority rows alone (the host's last row before the loss → the new host's first): the prediction's lead removed
    rowJump: { max: max(rows.map((row) => row.rowJumpM)), median: median(rows.map((row) => row.rowJumpM)), allies: max(rows.filter((row) => row.allyOfNewHost && row.role === 'peer').map((row) => row.rowJumpM)), enemies: max(rows.filter((row) => !row.allyOfNewHost && row.role === 'peer').map((row) => row.rowJumpM)), newHost: rows.find((row) => row.role === 'new host')?.rowJumpM ?? null, leadAtLossMax: max(rows.map((row) => row.leadAtLossM)) },
    tickContinuous: rows.every((row) => row.tickContinuous !== false), oldHostTick: oldStatus.host?.core?.tick ?? null, resumeTick: rows.find((row) => row.resumeTick !== null)?.resumeTick ?? null,
    peersServed: newStatus.host?.peersConnected ?? null, peers: rows, rejoin: null, hints,
  };
  report.migrations.push(migration);
  step(`migration-${k}`, { newHost: newHost.id, generation: newGeneration, hostChangedAfterMs: migration.hostChangedAfterMs, newHostLiveAfterMs: migration.newHostLiveAfterMs, firstFrame: migration.firstFrame, hullJump: migration.hullJump, tickContinuous: migration.tickContinuous });
  if (stepDown) {
    // the old host's room socket comes back: the room re-sends match_start with the new host; its next report is refused host_only; it steps down
    const rejoinWall = Date.now();
    const since = (await timelineOf(oldHost)).length;
    try {
      await oldHost.page.evaluate((code) => window.__peer.join({ code }), roomCode);
      await waitUntil(async () => { const status = await statusOf(oldHost); return status.session?.role === 'peer' && status.session?.p2p?.hostId === newHost.id && status.match?.phase === 'live'; }, `migration ${k}: the old host stepped down to a live peer of ${newHost.id}`, 60_000, 250);
      const status = await statusOf(oldHost);
      const events = (await timelineOf(oldHost, since)).filter((entry) => /^(?:host-log:|p2p:|transport:|welcome|host:|match_start|room:)/.test(entry.kind)).slice(0, 40).map((entry) => ({ ms: entry.wall - rejoinWall, kind: entry.kind, ...(entry.message ? { message: entry.message } : {}), ...(entry.detail ? { detail: entry.detail } : {}), ...(entry.role ? { role: entry.role } : {}), ...(entry.hostId ? { hostId: entry.hostId } : {}) }));
      const stepped = events.find((entry) => entry.kind === 'host-log:warn' && entry.message === 'stepping down');
      migration.stepDown = { rejoinAfterLossMs: rejoinWall - closedWall, steppedDownAfterRejoinMs: stepped ? stepped.ms : null, detail: stepped?.detail ?? null, role: status.session.role, hostId: status.session.p2p.hostId, generation: status.session.p2p.generation, phase: status.match.phase, events };
      step(`migration-${k}-stepped-down`, { steppedDownAfterRejoinMs: migration.stepDown.steppedDownAfterRejoinMs, detail: migration.stepDown.detail, role: migration.stepDown.role, hostId: migration.stepDown.hostId });
    } catch (error) {
      migration.stepDown = { failed: error.message };
      failures.push(`migration ${k}: ${error.message}`);
    }
  }
  if (rejoin && !oldHost.game && !stepDown) {
    const rejoinStartedWall = Date.now();
    try {
      await openPage(origin, oldHost);
      await oldHost.page.evaluate((options) => window.__peer.join(options), { code: roomCode, specId: oldHost.specId });
      await waitUntil(async () => { const status = await statusOf(oldHost); return status.match?.welcomed && status.session?.role === 'peer' && status.match?.phase === 'live'; }, `migration ${k}: the old host back as a peer`, 120_000, 500);
      const status = await statusOf(oldHost);
      migration.rejoin = { afterMs: Date.now() - rejoinStartedWall, role: status.session.role, hostId: status.session.p2p.hostId, generation: status.session.p2p.generation, candidateType: status.session.p2p.candidateType };
      step(`migration-${k}-rejoined`, migration.rejoin);
    } catch (error) {
      migration.rejoin = { failed: error.message };
      failures.push(`migration ${k}: ${error.message}`);
    }
  }
}

// ------------------------------------------------------------ summary and verdicts

function rateSeries(field, roleFilter = null) {
  // per-seat rate between consecutive samples (units per second)
  const rates = [];
  for (let index = 1; index < series.length; index++) {
    const previous = series[index - 1];
    const current = series[index];
    const dtS = (current.atMs - previous.atMs) / 1000;
    if (dtS <= 0) continue;
    for (const entry of current.peers) {
      if (roleFilter && entry.role !== roleFilter) continue;
      const earlier = previous.peers.find((candidate) => candidate.id === entry.id && candidate.role === entry.role && candidate.gen === entry.gen);
      if (!earlier || entry[field] === null || earlier[field] === null || entry[field] < earlier[field]) continue;
      rates.push((entry[field] - earlier[field]) / dtS);
    }
  }
  return rates;
}

function summarize() {
  const peerRows = [...finalStatus.values()].filter((entry) => entry.status.session?.role === 'peer').map((entry) => entry.status);
  const hostRows = [...finalStatus.values()].filter((entry) => entry.status.session?.role === 'host').map((entry) => entry.status);
  const snapshotRates = rateSeries('snap', 'peer');
  const hostUplink = rateSeries('rtcSent', 'host').map((value) => value * 8 / 1000);
  const hostDownlink = rateSeries('rtcRecv', 'host').map((value) => value * 8 / 1000);
  // P3b: rows the interest tiers refreshed per tier per second over the populations → the refresh rate per tier (Hz per entity);
  // the skips; the peers' interpolation delay and the furthest any entity was continued past its own sample
  const tierRates = [0, 1, 2].map((tier) => {
    const rates = [];
    for (let index = 1; index < series.length; index++) {
      const previous = series[index - 1];
      const current = series[index];
      const dtS = (current.atMs - previous.atMs) / 1000;
      if (dtS <= 0) continue;
      for (const entry of current.peers) {
        if (entry.role !== 'host' || !entry.tierPub || !entry.tierPop) continue;
        const earlier = previous.peers.find((candidate) => candidate.id === entry.id && candidate.role === 'host' && candidate.gen === entry.gen && candidate.tierPub);
        if (!earlier || entry.tierPop[tier] <= 0) continue;
        rates.push((entry.tierPub[tier] - earlier.tierPub[tier]) / dtS / entry.tierPop[tier]);
      }
    }
    return rates;
  });
  const tierPopulations = [0, 1, 2].map((tier) => series.flatMap((row) => row.peers.filter((entry) => entry.role === 'host' && entry.tierPop).map((entry) => entry.tierPop[tier])));
  const hostSkips = max(series.flatMap((row) => row.peers.filter((entry) => entry.role === 'host').map((entry) => entry.skips)));
  const hostHz = median(series.flatMap((row) => row.peers.filter((entry) => entry.role === 'host').map((entry) => entry.hz)));
  const rowExtra = max(series.flatMap((row) => row.peers.filter((entry) => entry.role === 'peer').map((entry) => entry.rowExtra)));
  const delays = series.flatMap((row) => row.peers.filter((entry) => entry.role === 'peer').map((entry) => entry.delay));
  const peerDownlink = rateSeries('bIn', 'peer').map((value) => value * 8 / 1000);
  const peerUplink = rateSeries('bOut', 'peer').map((value) => value * 8 / 1000);
  const tickP95 = series.flatMap((row) => row.peers.filter((entry) => entry.role === 'host').map((entry) => entry.tickP95));
  const tickP50 = series.flatMap((row) => row.peers.filter((entry) => entry.role === 'host').map((entry) => entry.tickP50));
  const tickMax = series.flatMap((row) => row.peers.filter((entry) => entry.role === 'host').map((entry) => entry.tickMax));
  const rtt = series.flatMap((row) => row.peers.filter((entry) => entry.role === 'peer').map((entry) => entry.rtt));
  const pcRtt = series.flatMap((row) => row.peers.filter((entry) => entry.role === 'peer').map((entry) => entry.pcRtt));
  const offsets = peerRows.map((status) => status.match?.serverOffsetMs ?? null);
  const offsetDrift = series.length > 1 ? peerRows.map((status) => { const first = series.find((row) => row.peers.some((entry) => entry.id === status.playerId && entry.off !== null))?.peers.find((entry) => entry.id === status.playerId)?.off; return first === undefined || status.match?.serverOffsetMs == null ? null : status.match.serverOffsetMs - first; }) : [];
  const hostCores = hostRows.map((status) => status.host?.core ?? null).filter(Boolean);
  const finalHost = hostRows.at(-1) ?? null;
  const allStatuses = [...finalStatus.values()].map((entry) => entry.status);
  const messages = { out: {}, in: {}, bytesOut: 0, bytesIn: 0, sockets: 0 };
  for (const status of allStatuses) {
    for (const [key, count] of Object.entries(status.roomMessages?.out ?? {})) messages.out[key] = (messages.out[key] ?? 0) + count;
    for (const [key, count] of Object.entries(status.roomMessages?.in ?? {})) messages.in[key] = (messages.in[key] ?? 0) + count;
    messages.bytesOut += status.roomMessages?.bytesOut ?? 0;
    messages.bytesIn += status.roomMessages?.bytesIn ?? 0;
    messages.sockets += status.roomMessages?.sockets ?? 0;
  }
  const totalOut = Object.values(messages.out).reduce((a, b) => a + b, 0);
  const totalIn = Object.values(messages.in).reduce((a, b) => a + b, 0);
  // P1b (2026-09-28): the keepalive text frame is answered by the Durable Object's auto-response without waking it —
  // never a handled message, so never a request. `billed` counts every other client→room message as one request (the
  // certification's conservative rule); `documented` applies Cloudflare's published rule (outgoing free, incoming
  // WebSocket messages at 20:1) plus one request per room socket upgrade.
  const keepalivesOut = messages.out['keepalive:ping'] ?? 0;
  const billedOut = totalOut - keepalivesOut;
  const documentedRequests = Math.ceil(billedOut / 20) + messages.sockets;
  const playMinutes = Math.max(1 / 60, (series.at(-1)?.atMs ?? 0) / 60_000);
  report.roomMessages = {
    byTypeOut: messages.out, byTypeIn: messages.in, clientToRoom: totalOut, roomToClient: totalIn, total: totalOut + totalIn, bytesOut: messages.bytesOut, bytesIn: messages.bytesIn, sockets: messages.sockets,
    unbilledKeepalives: keepalivesOut, billedClientToRoom: billedOut, documentedRequests,
    startBurst: report.entry?.roomMessagesStartBurst ?? null, perMinuteSteady: round((totalOut + totalIn) / playMinutes, 1),
    matchesPerDayHeadroom: {
      billedClientToRoom: Math.floor(BUDGET.freeRequestsPerDay / Math.max(1, billedOut)),
      bothDirections: Math.floor(BUDGET.freeRequestsPerDay / Math.max(1, billedOut + totalIn)),
      documented: Math.floor(BUDGET.freeRequestsPerDay / Math.max(1, documentedRequests)),
    },
  };
  report.steady = {
    samples: series.length, playMinutes: round(playMinutes, 2),
    snapshotRateHz: { min: round(min(snapshotRates), 1), p05: round(percentile(snapshotRates, 0.05), 1), median: round(median(snapshotRates), 1), max: round(max(snapshotRates), 1) },
    hostTickMs: { p50: round(median(tickP50), 3), p95: round(median(tickP95), 3), p95Max: round(max(tickP95), 3), max: round(max(tickMax), 3), final: hostCores.map((core) => ({ tick: core.tick, p50: round(core.tickP50Ms, 3), p95: round(core.tickP95Ms, 3), max: round(core.tickMaxMs, 3), mean: round(core.tickMeanMs, 3), count: core.tickCount, droppedTicks: core.droppedTicks, stalls: core.stalls, lateWakeupMaxMs: round(core.lateWakeupMaxMs, 1), clients: core.clients })) },
    hostUplinkKbit: { median: round(median(hostUplink), 0), p95: round(percentile(hostUplink, 0.95), 0), max: round(max(hostUplink), 0), acceptorSampleMedian: round(median(series.flatMap((row) => row.peers.filter((entry) => entry.role === 'host').map((entry) => entry.hostUp))) * 8 / 1000, 0) },
    hostSnapshotHz: hostHz, hostSnapshotSkips: hostSkips,
    tiers: {
      refreshHz: tierRates.map((rates) => round(median(rates), 1)), refreshHzMin: tierRates.map((rates) => round(min(rates), 1)),
      population: tierPopulations.map((values) => round(median(values), 1)), populationMax: tierPopulations.map((values) => max(values)),
    },
    interpolation: { delayMsMedian: round(median(delays), 1), delayMsMax: round(max(delays), 1), rowExtrapolatedMsMax: round(rowExtra, 1), snappedSamples: peerRows.reduce((sum, status) => sum + (status.match?.snappedSamples ?? 0), 0) },
    hostDownlinkKbit: { median: round(median(hostDownlink), 0), max: round(max(hostDownlink), 0) },
    peerDownlinkKbit: { median: round(median(peerDownlink), 0), max: round(max(peerDownlink), 0) }, peerUplinkKbit: { median: round(median(peerUplink), 0), max: round(max(peerUplink), 0) },
    rttMs: { min: round(min(rtt), 1), median: round(median(rtt), 1), p95: round(percentile(rtt, 0.95), 1), max: round(max(rtt), 1) }, pcRttMs: { median: round(median(pcRtt), 1), max: round(max(pcRtt), 1) },
    clockOffsetMs: { spread: round((max(offsets) ?? 0) - (min(offsets) ?? 0), 1), driftMax: round(max(offsetDrift.map((value) => Math.abs(value ?? 0))), 1) },
    lost: { lossRateMax: round(max(peerRows.map((status) => status.match?.lossRate)), 4), staleSnapshots: peerRows.reduce((sum, status) => sum + (status.match?.staleSnapshots ?? 0), 0), missingBaselines: peerRows.reduce((sum, status) => sum + (status.match?.missingBaselines ?? 0), 0), keyframeRequests: peerRows.reduce((sum, status) => sum + (status.match?.keyframeRequests ?? 0), 0), framesDropped: allStatuses.reduce((sum, status) => sum + (status.match?.framesDropped ?? 0), 0), stalls: peerRows.reduce((sum, status) => sum + (status.match?.stalls ?? 0), 0), reconnects: peerRows.reduce((sum, status) => sum + (status.match?.reconnects ?? 0), 0), hostDroppedTicks: hostCores.reduce((sum, core) => sum + core.droppedTicks, 0), hostStalls: hostCores.reduce((sum, core) => sum + core.stalls, 0) },
    desync: { endMaxM: round(max(peerRows.map((status) => status.match?.prediction?.lastPositionErrorM)), 3), endMedianM: round(median(peerRows.map((status) => status.match?.prediction?.lastPositionErrorM)), 3), runMaxFreeM: round(max(peerRows.map((status) => status.match?.prediction?.maxFreePositionErrorM)), 3), runMaxContactM: round(max(peerRows.map((status) => status.match?.prediction?.maxContactPositionErrorM)), 3), hardSnaps: peerRows.reduce((sum, status) => sum + (status.match?.prediction?.hardSnaps ?? 0), 0), predicting: peerRows.filter((status) => status.match?.prediction).length, of: peerRows.length },
    viaTurn: { peers: peerRows.filter((status) => status.session?.p2p?.viaTurn).length, of: peerRows.length, candidateTypes: [...new Set(peerRows.map((status) => status.session?.p2p?.candidateType))] },
    hostFinal: finalHost ? { id: finalHost.playerId, generation: finalHost.session.p2p.generation, peersConnected: finalHost.host?.peersConnected, tick: finalHost.host?.core?.tick, phase: finalHost.host?.core?.phase } : null,
    iceResolves: allStatuses.reduce((sum, status) => sum + (status.iceResolves ?? 0), 0),
  };
  report.peers = allStatuses.map((status) => ({ id: status.playerId, role: status.session?.role ?? null, generation: status.session?.p2p?.generation ?? null, team: status.room?.me?.team ?? null, phase: status.match?.phase ?? null, snapshots: status.match?.snapshotsAccepted ?? null, rttMs: round(status.match?.rttMs, 1), offsetMs: round(status.match?.serverOffsetMs, 1), bytesIn: status.match?.bytesIn ?? null, bytesOut: status.match?.bytesOut ?? null, reconnects: status.match?.reconnects ?? null, stalls: status.match?.stalls ?? null, desyncM: round(status.match?.prediction?.lastPositionErrorM, 3), heapMB: round((status.memory?.jsHeapUsed ?? 0) / 1048576, 1), candidate: status.session?.p2p?.candidateType ?? null, viaTurn: status.session?.p2p?.viaTurn ?? null, roomOut: Object.values(status.roomMessages?.out ?? {}).reduce((a, b) => a + b, 0), roomIn: Object.values(status.roomMessages?.in ?? {}).reduce((a, b) => a + b, 0), errors: status.errors?.length ?? 0 }));
  const verdict = (name, value, pass, budget, note = '') => report.verdicts.push({ name, value, budget, pass, note });
  const migrations = report.migrations.filter((migration) => !migration.failed);
  const worstMigration = max(migrations.map((migration) => migration.firstFrame.max));
  verdict('migration: host loss → first snapshot from the new host (worst seat, ms)', worstMigration, migrations.length ? worstMigration !== null && worstMigration <= BUDGET.migrationMs && migrations.every((migration) => migration.firstFrame.missing.length === 0) : null, `≤ ${BUDGET.migrationMs}`, migrations.length ? `${migrations.length} migration(s); host_changed after ${migrations.map((migration) => round(migration.hostChangedAfterMs, 0)).join(' / ')} ms; missing seats ${migrations.map((migration) => migration.firstFrame.missing.length).join(' / ')}` : 'no migration in this run');
  const worstJump = max(migrations.map((migration) => migration.hullJump.max));
  verdict('migration: own-hull jump (worst seat, m)', round(worstJump, 3), migrations.length ? worstJump !== null && worstJump <= BUDGET.hullJumpM : null, `≤ ${BUDGET.hullJumpM} (0.0 m)`, migrations.length ? `allies of the new host ${migrations.map((migration) => round(migration.hullJump.allies, 2)).join(' / ')} m, enemies ${migrations.map((migration) => round(migration.hullJump.enemies, 2)).join(' / ')} m, the new host itself ${migrations.map((migration) => round(migration.hullJump.newHost, 2)).join(' / ')} m; on the authority rows alone: allies ${migrations.map((migration) => round(migration.rowJump.allies, 2)).join(' / ')} m, enemies ${migrations.map((migration) => round(migration.rowJump.enemies, 2)).join(' / ')} m, new host ${migrations.map((migration) => round(migration.rowJump.newHost, 2)).join(' / ')} m; prediction lead at the loss up to ${migrations.map((migration) => round(migration.rowJump.leadAtLossMax, 2)).join(' / ')} m` : '');
  verdict('migration: tick timeline continuous, no reset', migrations.every((migration) => migration.tickContinuous), migrations.length ? migrations.every((migration) => migration.tickContinuous) && migrations.every((migration) => migration.peers.every((peer) => peer.phase === 'live')) : null, 'every seat live on the new host at a tick ≥ its last', '');
  verdict('host tick p95 (ms, median of the samples)', report.steady.hostTickMs.p95, report.steady.hostTickMs.p95 !== null && report.steady.hostTickMs.p95 <= BUDGET.hostTickP95Ms, `≤ ${BUDGET.hostTickP95Ms}`, `p50 ${report.steady.hostTickMs.p50}, worst p95 sample ${report.steady.hostTickMs.p95Max}, max tick ${report.steady.hostTickMs.max}; stalls ${report.steady.lost.hostStalls}, dropped ticks ${report.steady.lost.hostDroppedTicks}`);
  verdict('host uplink (kbit/s, median)', report.steady.hostUplinkKbit.median, report.steady.hostUplinkKbit.median !== null && report.steady.hostUplinkKbit.median <= BUDGET.hostUplinkMbit * 1000, `≤ ${BUDGET.hostUplinkMbit * 1000} (reported; above it P3b)`, `p95 ${report.steady.hostUplinkKbit.p95}, max ${report.steady.hostUplinkKbit.max}; downlink median ${report.steady.hostDownlinkKbit.median}`);
  verdict('peer desync at the end (m, worst seat)', report.steady.desync.endMaxM, report.steady.desync.predicting > 0 ? report.steady.desync.endMaxM !== null && report.steady.desync.endMaxM <= BUDGET.desyncM : null, `≤ ${BUDGET.desyncM}`, `${report.steady.desync.predicting} of ${report.steady.desync.of} peers predicting; run max free ${report.steady.desync.runMaxFreeM} m, contact ${report.steady.desync.runMaxContactM} m, hard snaps ${report.steady.desync.hardSnaps}`);
  const peerRss = report.memory?.renderers?.secondMB ?? null;
  verdict('peer tab RSS (MB, largest renderer after the host\'s)', peerRss, peerRss !== null && peerRss <= BUDGET.peerRssMB, `≤ ${BUDGET.peerRssMB}`, `host renderer ${report.memory?.renderers?.maxMB} MB, median renderer ${report.memory?.renderers?.medianMB} MB, ${report.memory?.renderers?.count} renderers`);
  const consoleErrors = relevantErrors().length;
  verdict('console errors (every tab)', consoleErrors, consoleErrors === BUDGET.consoleErrors, '0', consoleErrors ? relevantErrors().slice(0, 3).map((entry) => `${entry.page}: ${entry.text.slice(0, 160)}`).join(' | ') : '');
  verdict('room messages per match (client→room + room→client)', report.roomMessages.total, true, 'reported', `client→room ${report.roomMessages.clientToRoom}, room→client ${report.roomMessages.roomToClient}; start burst ${report.roomMessages.startBurst?.out ?? '-'} + ${report.roomMessages.startBurst?.in ?? '-'}; ${report.roomMessages.perMinuteSteady} / min over the run`);
  verdict('room messages at the start (client→room + room→client)', (report.roomMessages.startBurst?.out ?? 0) + (report.roomMessages.startBurst?.in ?? 0), (report.roomMessages.startBurst?.out ?? 0) + (report.roomMessages.startBurst?.in ?? 0) <= BUDGET.roomMessagesPerStart, `≤ ${BUDGET.roomMessagesPerStart} (else batch ICE)`, `room sockets closed by the service: ${report.entry?.roomSocketCloses?.length ? report.entry.roomSocketCloses.join(', ') : 'none'}`);
  const authorityHz = report.steady.hostSnapshotHz ?? 30;
  verdict('snapshot rate per peer (Hz, median of the samples)', report.steady.snapshotRateHz.median, report.steady.snapshotRateHz.median !== null && report.steady.snapshotRateHz.median >= authorityHz * 0.8, `≥ ${round(authorityHz * 0.8, 0)} (${authorityHz} Hz authority, ≥ 80 %)`, `min ${report.steady.snapshotRateHz.min}, p05 ${report.steady.snapshotRateHz.p05}; skips for slow peers ${report.steady.hostSnapshotSkips ?? '–'}`);
}

function markdown() {
  const lines = [];
  const p = report.parameters;
  lines.push(`# Peer-to-peer soak — ${label} (${seats} seats)`, '');
  lines.push(`Run ${new Date().toISOString()} · rooms \`${roomsUrl}\` · ${p.playMin} min of play · migrate every ${p.migrateEveryMin || '–'} min · ice=${p.iceMode}${p.ice ? ` (${p.ice.turn} TURN urls, TTL ${p.ice.expiresInSeconds} s)` : ''} · map ${p.mapId} · ${hosts} seats able to host · firing ${fire !== '0' ? 'on' : 'off'} · load ${report.machine.loadStart} → ${report.machine.loadEnd} · ${Math.round(report.wallMs / 1000)} s wall · ${report.completed ? 'completed' : 'INCOMPLETE'}${report.matchEnded ? ` · the match ended on its own at t+${Math.round(report.matchEnded.atMs / 1000)} s (${report.matchEnded.phases.map((entry) => `${entry[0]} ${entry[1]}/${entry[2] ?? '–'}`).join(', ')})` : ''}`, '');
  if (report.failures.length) { lines.push('## Failures', '', ...report.failures.map((failure) => `- ${failure.split('\n')[0]}`), ''); }
  lines.push('## Verdicts', '', '| Check | Value | Budget | Verdict | Note |', '|---|---|---|---|---|');
  for (const verdict of report.verdicts) lines.push(`| ${verdict.name} | ${verdict.value ?? '–'} | ${verdict.budget} | ${verdict.pass === null ? 'n/a' : verdict.pass ? 'PASS' : 'FAIL'} | ${verdict.note} |`);
  lines.push('');
  if (report.entry) {
    const e = report.entry;
    lines.push('## Entry', '', `Host ${e.hostId} (generation ${e.generation}, ${e.matchUrl}), ${e.hostPeersConnected} peers served. Join time (start → WELCOME): min ${e.joinMs.min} ms, median ${e.joinMs.median} ms, max ${e.joinMs.max} ms. Candidate types ${[...new Set(e.candidateTypes)].join(', ') || '–'}; via TURN ${e.viaTurn.filter(Boolean).length} of ${e.viaTurn.length}. ICE gathering per connection: median ${e.iceGather.candidatesMedian} candidates (max ${e.iceGather.candidatesMax}, relay median ${e.iceGather.relayMedian}) in median ${e.iceGather.gatherMsMedian} ms (max ${e.iceGather.gatherMsMax}). Room messages at the start: ${e.roomMessagesStartBurst.out} client→room + ${e.roomMessagesStartBurst.in} room→client. Room sockets closed by the service: ${e.roomSocketCloses.length ? e.roomSocketCloses.join(', ') : 'none'}. Prediction ready on ${e.predictionReady} seats${e.predictionErrors.length ? ` (errors: ${e.predictionErrors.join('; ')})` : ''}.`, '');
  }
  if (report.steady) {
    const s = report.steady;
    lines.push('## Steady state', '', '| Metric | Value |', '|---|---|',
      `| Snapshot rate per peer (Hz) | median ${s.snapshotRateHz.median}, p05 ${s.snapshotRateHz.p05}, min ${s.snapshotRateHz.min}, max ${s.snapshotRateHz.max} |`,
      `| Host tick cost (ms) | p50 ${s.hostTickMs.p50}, p95 ${s.hostTickMs.p95} (worst sample ${s.hostTickMs.p95Max}), max ${s.hostTickMs.max} |`,
      `| Host loop | dropped ticks ${s.lost.hostDroppedTicks}, stalls ${s.lost.hostStalls}${s.hostTickMs.final.length ? `, late wake-up max ${s.hostTickMs.final.map((core) => core.lateWakeupMaxMs).join(' / ')} ms` : ''} |`,
      `| Host uplink (kbit/s) | median ${s.hostUplinkKbit.median}, p95 ${s.hostUplinkKbit.p95}, max ${s.hostUplinkKbit.max} (acceptor's own sample median ${s.hostUplinkKbit.acceptorSampleMedian}) |`,
      `| Host snapshot rate / skips for slow peers | ${s.hostSnapshotHz ?? '–'} Hz / ${s.hostSnapshotSkips ?? '–'} |`,
      `| Interest tiers (near / mid / far) | refresh Hz per entity median ${s.tiers.refreshHz.join(' / ')} (min ${s.tiers.refreshHzMin.join(' / ')}); entity-viewer pairs median ${s.tiers.population.join(' / ')} (max ${s.tiers.populationMax.join(' / ')}) |`,
      `| Peer interpolation | delay median ${s.interpolation.delayMsMedian} ms (max ${s.interpolation.delayMsMax}); furthest an entity was continued past its own sample ${s.interpolation.rowExtrapolatedMsMax} ms; snapped samples ${s.interpolation.snappedSamples} |`,
      `| Host downlink (kbit/s) | median ${s.hostDownlinkKbit.median}, max ${s.hostDownlinkKbit.max} |`,
      `| Peer downlink / uplink (kbit/s) | median ${s.peerDownlinkKbit.median} / ${s.peerUplinkKbit.median}, max ${s.peerDownlinkKbit.max} / ${s.peerUplinkKbit.max} |`,
      `| RTT (ms, wire pings) | min ${s.rttMs.min}, median ${s.rttMs.median}, p95 ${s.rttMs.p95}, max ${s.rttMs.max}; candidate-pair RTT median ${s.pcRttMs.median}, max ${s.pcRttMs.max} |`,
      `| Clock offset (ms) | spread across peers ${s.clockOffsetMs.spread}, worst drift over the run ${s.clockOffsetMs.driftMax} |`,
      `| Lost frames | loss rate max ${s.lost.lossRateMax}, stale ${s.lost.staleSnapshots}, missing baselines ${s.lost.missingBaselines}, keyframe requests ${s.lost.keyframeRequests}, frames dropped by backpressure ${s.lost.framesDropped}, client stalls ${s.lost.stalls}, reconnects ${s.lost.reconnects} |`,
      `| Desync (m) | end max ${s.desync.endMaxM}, end median ${s.desync.endMedianM}; run max free ${s.desync.runMaxFreeM}, contact ${s.desync.runMaxContactM}; hard snaps ${s.desync.hardSnaps}; ${s.desync.predicting}/${s.desync.of} predicting |`,
      `| TURN | ${s.viaTurn.peers} of ${s.viaTurn.of} peers relayed; candidate types ${s.viaTurn.candidateTypes.join(', ')} |`,
      `| Final host | ${s.hostFinal ? `${s.hostFinal.id} gen ${s.hostFinal.generation}, ${s.hostFinal.peersConnected} peers, tick ${s.hostFinal.tick}, ${s.hostFinal.phase}` : '–'} |`,
      `| ICE resolutions (every seat, every connection) | ${s.iceResolves} |`, '');
  }
  if (report.migrations.length) {
    lines.push('## Migrations', '', '| # | Old host → new host | Reason | host_changed after (ms) | New host live (ms) | First snapshot on every seat (min / median / max ms) | Own-hull jump max (allies / enemies / new host, m) | Hints applied / refused | Tick continuous | Peers served | Old host back as peer (ms) |', '|---|---|---|---|---|---|---|---|---|---|---|');
    for (const m of report.migrations) {
      if (m.failed) { lines.push(`| ${m.k} | ${m.oldHost} → – | – | – | – | FAILED: ${m.failed} | – | – | – | – | – |`); continue; }
      if (m.stepDown) m.rejoin = m.stepDown.failed ? { failed: m.stepDown.failed } : { afterMs: m.stepDown.rejoinAfterLossMs + (m.stepDown.steppedDownAfterRejoinMs ?? 0), role: `${m.stepDown.role} after ${m.stepDown.detail}`, hostId: m.stepDown.hostId };
      lines.push(`| ${m.k} | ${m.oldHost} (gen ${m.oldGeneration}) → ${m.newHost} (gen ${m.newGeneration}) | ${m.reason ?? '–'} | ${round(m.hostChangedAfterMs, 0)} | ${round(m.newHostLiveAfterMs, 0)} | ${round(m.firstFrame.min, 0)} / ${round(m.firstFrame.median, 0)} / ${round(m.firstFrame.max, 0)}${m.firstFrame.missing.length ? ` (missing: ${m.firstFrame.missing.join(', ')})` : ''} | ${round(m.hullJump.allies, 2)} / ${round(m.hullJump.enemies, 2)} / ${round(m.hullJump.newHost, 2)} (rows: ${round(m.rowJump?.allies, 2)} / ${round(m.rowJump?.enemies, 2)} / ${round(m.rowJump?.newHost, 2)}) | ${m.hints ? `${m.hints.applied} / ${m.hints.rejected}` : '–'} | ${m.tickContinuous ? 'yes' : 'NO'} | ${m.peersServed} | ${m.rejoin ? (m.rejoin.failed ? `FAILED: ${m.rejoin.failed}` : `${m.rejoin.afterMs} (${m.rejoin.role} of ${m.rejoin.hostId})`) : '–'} |`);
    }
    lines.push('');
    for (const m of report.migrations.filter((migration) => !migration.failed)) {
      lines.push(`### Migration ${m.k}: seats`, '', '| Seat | Role | Team | Ally of new host | Loss seen (ms) | host_changed (ms) | WELCOME (ms) | First frame (ms) | Jump, presented (m) | Jump, authority rows (m) | Lead at loss (m) | Ticks before → after | Phase at the end |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const peer of m.peers) lines.push(`| ${peer.id} | ${peer.role} | ${peer.team ?? '–'} | ${peer.allyOfNewHost === null ? '–' : peer.allyOfNewHost ? 'yes' : 'no'} | ${round(peer.lossAfterMs, 0) ?? '–'} | ${round(peer.hostChangedAfterMs, 0) ?? '–'} | ${round(peer.welcomeAfterMs, 0) ?? '–'} | ${round(peer.firstFrameAfterMs, 0) ?? '–'} | ${round(peer.jumpM, 3) ?? '–'} | ${round(peer.rowJumpM, 3) ?? '–'} | ${round(peer.leadAtLossM, 3) ?? '–'} | ${peer.beforeTick ?? '–'} → ${peer.afterTick ?? '–'} | ${peer.phase ?? '–'} |`);
      lines.push('');
    }
  }
  if (report.memory) {
    const r = report.memory.renderers;
    lines.push('## Memory', '', `Renderers under the browser at the end: ${r?.count ?? '–'}; largest ${r?.maxMB ?? '–'} MB (the host's, with the actor Worker), second ${r?.secondMB ?? '–'} MB, median ${r?.medianMB ?? '–'} MB, total ${r?.totalMB ?? '–'} MB. JS heap per tab (MB): ${Object.entries(report.memory.jsHeapMB).map(([id, mb]) => `${id} ${mb}`).join(', ')}.`, '');
  }
  if (report.roomMessages) {
    const r = report.roomMessages;
    lines.push('## Room service messages', '', `Client→room ${r.clientToRoom} (${r.bytesOut} B), of which ${r.unbilledKeepalives} keepalive frames the Durable Object's auto-response answers without waking it (unbilled) and ${r.billedClientToRoom} handled messages; room→client ${r.roomToClient} (${r.bytesIn} B); ${r.sockets} room sockets; ${r.perMinuteSteady} messages / min over the run. Headroom on the Free plan's 100,000 requests / day at this size: ${r.matchesPerDayHeadroom.billedClientToRoom} matches / day counting every handled client→room message as one request, ${r.matchesPerDayHeadroom.bothDirections} counting both directions; by Cloudflare's published rule (outgoing free, incoming at 20:1, one request per socket upgrade) ${r.documentedRequests} requests per match → ${r.matchesPerDayHeadroom.documented} matches / day.`, '', '| Direction | Type | Count |', '|---|---|---|');
    for (const [key, count] of Object.entries(r.byTypeOut).sort((a, b) => b[1] - a[1])) lines.push(`| client→room | ${key} | ${count} |`);
    for (const [key, count] of Object.entries(r.byTypeIn).sort((a, b) => b[1] - a[1])) lines.push(`| room→client | ${key} | ${count} |`);
    lines.push('');
  }
  if (report.peers.length) {
    lines.push('## Seats at the end', '', '| Seat | Role | Gen | Team | Phase | Snapshots | RTT (ms) | Offset (ms) | In / out (B) | Reconnects | Stalls | Desync (m) | Heap (MB) | Candidate | TURN | Room out / in | Errors |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const peer of report.peers) lines.push(`| ${peer.id} | ${peer.role ?? '–'} | ${peer.generation ?? '–'} | ${peer.team ?? '–'} | ${peer.phase ?? '–'} | ${peer.snapshots ?? '–'} | ${peer.rttMs ?? '–'} | ${peer.offsetMs ?? '–'} | ${peer.bytesIn ?? '–'} / ${peer.bytesOut ?? '–'} | ${peer.reconnects ?? '–'} | ${peer.stalls ?? '–'} | ${peer.desyncM ?? '–'} | ${peer.heapMB} | ${peer.candidate ?? '–'} | ${peer.viaTurn === null ? '–' : peer.viaTurn ? 'yes' : 'no'} | ${peer.roomOut} / ${peer.roomIn} | ${peer.errors} |`);
    lines.push('');
  }
  const relevant = relevantErrors();
  if (relevant.length) { lines.push('## Browser errors', '', ...relevant.slice(0, 40).map((entry) => `- ${entry.page} ${entry.kind} at ${Math.round(entry.atMs / 1000)} s: ${entry.text.slice(0, 300).replace(/\n/g, ' ')}`), ''); }
  return lines.join('\n');
}

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`mp p2p soak ${label}: ${report.completed ? 'completed' : 'INCOMPLETE'} in ${Math.round(report.wallMs / 1000)} s; ${report.verdicts.filter((verdict) => verdict.pass === true).length} pass / ${report.verdicts.filter((verdict) => verdict.pass === false).length} fail / ${report.verdicts.filter((verdict) => verdict.pass === null).length} n/a`);
  for (const verdict of report.verdicts) console.log(`  ${verdict.pass === null ? 'n/a ' : verdict.pass ? 'PASS' : 'FAIL'} ${verdict.name}: ${verdict.value ?? '–'} (budget ${verdict.budget})${verdict.note ? ` — ${verdict.note}` : ''}`);
  for (const failure of report.failures) console.log(`  FAIL: ${failure.split('\n')[0]}`);
  console.log(`  report: ${join(outputDir, `soak-${seats}.json`)}, ${join(outputDir, `soak-${seats}.md`)}`);
}
process.exitCode = report.completed && (!strict || report.verdicts.every((verdict) => verdict.pass !== false)) ? 0 : 1;
