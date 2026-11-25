/**
 * Two peers, one map (mp-fixes-277; Kevin 2026-11-24, after 276 shipped: "multiplayer is broken, it doesnt work super
 * well p2p and still merges 2 maps"). Two separate headless Chromes (two first-time players: no shared profile, cache or
 * GPU process) on a built site (vite preview of --dist), one in-process room service with the browser-hosted match
 * (server/rooms/serve.ts, matchTransport 'p2p': the roomActor and p2pMatchHost the rooms Durable Object runs) on the LAN
 * helper's port, which a build with no VITE_ROOMS_URL resolves on 127.0.0.1 (src/mp/session/endpoint.ts).
 *
 *   Each battle is a new room on the same two pages, so each page carries into it the worlds the last one left resident.
 *   Before each, the joiner (B) plans its own battlefield as a player does (its Garage's map, the pointer over BATTLE:
 *   garage.ts prefetches it), so a hidden world sits in its scene before the room's is built: the merge's precondition,
 *   itself a gate. The host (A) creates a LAN room on its Garage's map (--maps, in turn), B joins by code from the same
 *   page, A starts; both play --play seconds over WebRTC, leave the battle to the Garage and leave the room.

 * Gates (exit 1 on any failure):
 *   one map     every second of every battle, on both pages, exactly one `world-*` root of the scene is drawn (visible
 *               and in the scene), and it is the battlefield the round names (round.mapId); the black-world guard's
 *               tracked world is that one too.
 *   agreement   both pages enter the same match on the same map id, and the joiner's battlefield is the host's.
 *   sync        each peer's p95 round trip <= --rtt-p95 (ms), p95 input acknowledgement lag <= --ack-p95 (ticks), no
 *               reconnect, no stall, snapshots every second; corrections and snaps are reported.
 *   link        the data channel's selected candidate pair is reported (host / srflx / relay).
 *   Any page error, or a console error, on either page fails the run.
 *
 *   node tools/with-capture-lock.mjs --lock-class=render -- node tools/mp-two-peer-e2e.mjs --dist=dist --port=4248
 *   node tools/mp-two-peer-e2e.mjs --dist=dist --battles=3 --play=120 --maps=verdant,winter --joiner-map=desert --json
 *
 * Out: --out (default .qa-dev/mp-two-peer-e2e, gitignored): report.json, a still of each page at each battle's start and
 * after its play, and each page's scene roots at those moments.
 */
import { launchGuardedBrowser } from './browser-launch.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { preview } from 'vite';
import { createRoomsServer } from '../server/rooms/serve.ts';
import { openRooms, pressControl } from './mp-rooms-entry.mjs';
import { readinessExpression } from './game-readiness.mjs';

const root = new URL('..', import.meta.url).pathname;
function argValue(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : fallback;
}
const json = process.argv.includes('--json');
const headful = process.argv.includes('--headful');
const distDir = resolve(root, argValue('dist', 'dist'));
const outputDir = resolve(argValue('out', join(root, '.qa-dev', 'mp-two-peer-e2e')));
const previewPort = Number(argValue('port', 4248));
const roomsPort = Number(argValue('rooms-port', 8792));
const battles = Math.max(1, Number(argValue('battles', 2)));
const playS = Number(argValue('play', 120));
// the room's battlefield for each battle in turn (the host's Garage pick); the joiner plans --joiner-map before each
const hostMaps = argValue('maps', 'verdant,winter').split(',').filter(Boolean);
const joinerMap = argValue('joiner-map', 'desert');
const rttP95Bound = Number(argValue('rtt-p95', 120));
const ackP95Bound = Number(argValue('ack-p95', 12));
// (the launcher asks every page for the harness path, which installs __DEBUG and __MULTIPLAYER_V2; ?debug=1 would add the
// debug HUD over the Garage's rooms entry)
const BOOT_QUERY = 'nosplash=1&tier=desktop&gfxreset=1';
const VIEWPORT = { width: 1024, height: 640, deviceScaleFactor: 1 };

const log = (line) => { if (!json) process.stderr.write(`[mp-two-peer-e2e] ${line}\n`); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const startedAt = performance.now();
const elapsedMs = () => Math.round(performance.now() - startedAt);
const report = { pass: false, failures: [], findings: [], errors: [], warnings: [], steps: [], battles: [], dist: distDir, hostMaps, joinerMap, playS, bounds: { rttP95: rttP95Bound, ackP95: ackP95Bound } };
const fail = (line) => { report.failures.push(line); log(`FAIL ${line}`); };
const step = (name, detail = {}) => { report.steps.push({ name, atMs: elapsedMs(), ...detail }); log(`${name} (${(elapsedMs() / 1000).toFixed(1)} s)${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`); };

function observe(page, label) {
  page.on('pageerror', (error) => report.errors.push({ page: label, kind: 'pageerror', atMs: elapsedMs(), text: String(error.stack || error.message).slice(0, 600) }));
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error') report.errors.push({ page: label, kind: 'console', atMs: elapsedMs(), text: text.slice(0, 600) });
    // the black-world guard's heals and the network's notices: read beside the world probes
    else if ((message.type() === 'warn' || message.type() === 'warning') && /\[gl\]|\[mp\]|\[net\]|black world/i.test(text)) report.warnings.push({ page: label, atMs: elapsedMs(), text: text.slice(0, 300) });
  });
}

async function waitFor(page, predicate, label, timeoutMs, args = []) {
  try {
    await page.waitForFunction(predicate, { timeout: timeoutMs, polling: 200 }, ...args);
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      url: location.href, phase: window.__DEBUG?.game?.phase ?? null, lifecycle: window.__APP_LIFECYCLE?.state ?? null,
      status: document.querySelector('.cot-play .status')?.textContent ?? '', loaderOn: document.querySelector('.cot-bl')?.classList.contains('on') ?? false,
      v2: window.__MULTIPLAYER_V2?.stats?.() ?? null, entryFailure: window.__NETWORK_ENTRY_FAILURE ?? null,
    })).catch(() => null);
    throw new Error(`${label}: ${error.message}; diagnostics ${JSON.stringify(diagnostics)}`);
  }
}

/** In-page: the scene's roots, the drawn battlefields among them, the battlefield the round and the guard name. */
function sceneProbe() {
  const debug = window.__DEBUG;
  const scene = debug?.scene;
  const v2 = window.__MULTIPLAYER_V2?.stats?.() ?? null;
  const roots = (scene?.children ?? []).map((child) => ({ name: child.name || child.type, visible: child.visible, children: child.children.length }));
  const worlds = (scene?.children ?? []).filter((child) => child.name?.startsWith('world-'));
  const drawn = worlds.filter((child) => child.visible).map((child) => child.name);
  // the world the scene graph would draw, by the same rule three.js applies: visible all the way up to the scene
  const drawnDeep = [];
  scene?.traverse?.((node) => {
    if (!node.name?.startsWith('world-') || node === scene) return;
    for (let at = node; at; at = at.parent) { if (!at.visible) return; if (at === scene) { drawnDeep.push(node.name); return; } }
  });
  const guard = window.__COT_BLACK_GUARD;
  const guardStats = guard?.stats?.() ?? null;
  return {
    phase: debug?.game?.phase ?? null, lifecycle: window.__APP_LIFECYCLE?.state ?? null,
    gameMapId: debug?.game?.mapId ?? null, roundMapId: v2?.round?.mapId ?? null, matchId: v2?.round?.matchId ?? null,
    round: v2?.round?.round ?? null, revealed: v2?.round?.revealed ?? false,
    worlds: worlds.map((child) => ({ name: child.name, visible: child.visible })), drawn, drawnDeep: [...new Set(drawnDeep)],
    residentIds: debug?.worldCacheIds ?? null, roots,
    guard: guardStats ? { active: guardStats.active, incident: guardStats.incident, lastClass: guardStats.lastClass, verdicts: guardStats.verdicts, heals: guardStats.heals ?? null, cpuBits: guardStats.cpuBits } : null,
  };
}

/** In-page: one second's network facts. */
function netProbe() {
  const v2 = window.__MULTIPLAYER_V2?.stats?.() ?? null;
  const match = v2?.session?.match ?? null;
  const prediction = match?.prediction ?? null;
  return {
    atMs: Math.round(performance.now()), phase: window.__DEBUG?.game?.phase ?? null,
    rttMs: match?.rttMs ?? null, rttJitterMs: match?.rttJitterMs ?? null, ackLagTicks: match?.inputAckLagTicks ?? null,
    intrinsicAckLagTicks: match?.inputIntrinsicAckLagTicks ?? null, snapshots: match?.snapshotsAccepted ?? 0,
    lossRate: match?.lossRate ?? null, interpolationDelayMs: match?.interpolationDelayMs ?? null, snapped: match?.snappedSamples ?? 0,
    extrapolated: match?.extrapolatedSamples ?? 0, maxExtrapolatedMs: match?.maxExtrapolatedMs ?? 0, stalls: match?.stalls ?? 0,
    reconnects: match?.reconnects ?? 0, keyframeRequests: match?.keyframeRequests ?? 0, missingBaselines: match?.missingBaselines ?? 0,
    timelineRestarts: match?.timelineRestarts ?? 0, transportState: match?.transportState ?? null,
    // (src/mp/match/prediction.ts PredictionStats)
    reconciliations: prediction?.reconciliations ?? null, visibleCorrections: prediction?.visibleCorrections ?? null,
    maxCorrectionM: prediction?.maxCorrectionM ?? null, lastPositionErrorM: prediction?.lastPositionErrorM ?? null,
    maxFreePositionErrorM: prediction?.maxFreePositionErrorM ?? null, hardSnaps: prediction?.hardSnaps ?? null, tickJumps: prediction?.tickJumps ?? null,
    health: v2?.network?.health ?? null, role: v2?.session?.p2p?.role ?? null,
  };
}

/** In-page: the selected candidate pair of every live peer connection (the recorder keeps them). */
async function linkProbe() {
  const out = [];
  for (const pc of window.__MP2_PCS ?? []) {
    if (pc.connectionState === 'closed') continue;
    try {
      const stats = await pc.getStats();
      let pair = null;
      stats.forEach((entry) => { if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && (entry.nominated || !pair)) pair = entry; });
      const local = pair ? stats.get(pair.localCandidateId) : null;
      const remote = pair ? stats.get(pair.remoteCandidateId) : null;
      out.push({ state: pc.connectionState, local: local?.candidateType ?? null, remote: remote?.candidateType ?? null, rttMs: pair?.currentRoundTripTime != null ? Math.round(pair.currentRoundTripTime * 1000) : null });
    } catch { out.push({ state: pc.connectionState, error: true }); }
  }
  return out;
}

/** Init script: keep every RTCPeerConnection the page makes, for the link probe. */
function installPcRecorder() {
  if (window.__MP2_PCS) return;
  const pcs = window.__MP2_PCS = [];
  const Native = window.RTCPeerConnection;
  if (!Native) return;
  window.RTCPeerConnection = class extends Native { constructor(...args) { super(...args); pcs.push(this); } };
}

const p95 = (values) => {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((x, y) => x - y);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : null;
};

async function still(page, name) {
  const path = join(outputDir, name);
  await page.screenshot({ path }).catch(() => {});
  return path;
}

/** One-map gate over one probe. */
function judgeScene(label, probe, when) {
  if (probe.drawnDeep.length !== 1) fail(`${label} ${when}: ${probe.drawnDeep.length} battlefields drawn (${probe.drawnDeep.join(', ') || 'none'}; roots ${probe.worlds.map((w) => `${w.name}${w.visible ? '' : '(hidden)'}`).join(', ')})`);
  const expected = probe.roundMapId ? `world-${probe.roundMapId}` : null;
  if (expected && probe.drawnDeep.length === 1 && probe.drawnDeep[0] !== expected) fail(`${label} ${when}: draws ${probe.drawnDeep[0]}, the round plays ${expected}`);
}

async function selectGarageMap(page, mapId) {
  await page.evaluate((id) => { window.__DEBUG?.garage?.setSelectedMap?.(id); }, mapId);
  await sleep(300);
}

async function bootPage(page, url, label) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await waitFor(page, readinessExpression('garage'), `${label} garage ready`, 240_000);
  await waitFor(page, () => !!window.__DEBUG?.scene && Array.isArray(window.__DEBUG?.worldCacheIds), `${label} debug surface`, 60_000);
}

/** pressControl, and on a blocked control the element over its centre (what covered it), in the error. */
async function press(page, selector) {
  try {
    await pressControl(page, selector);
  } catch (error) {
    throw await explained(page, selector, error);
  }
}

/** The rooms panel the way the page offers it (tools/mp-rooms-entry.mjs), a block explained as press() does. */
async function openRoomsPanel(page) {
  try {
    await openRooms(page, {});
  } catch (error) {
    throw await explained(page, (error.message.match(/blocked: (.+)$/) ?? [])[1] ?? '.cot-battle-mode', error);
  }
}

async function explained(page, selector, error) {
  {
    const cover = await page.evaluate((sel) => {
      const el = [...document.querySelectorAll(sel)].find((node) => node.getClientRects().length);
      if (!el) return 'no such control shown';
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      const path = [];
      for (let at = hit; at && path.length < 4; at = at.parentElement) path.push(`${at.tagName.toLowerCase()}${at.id ? `#${at.id}` : ''}.${[...at.classList].slice(0, 3).join('.')}`);
      return path.join(' < ');
    }, selector).catch(() => null);
    return new Error(`${error.message} (covered by ${cover})`);
  }
}

const inBattle = `${readinessExpression('battleRevealed')} && window.__MULTIPLAYER_V2?.stats?.().inMatch === true`;

let rooms = null;
let server = null;
const browsers = [];
const stopAll = async () => {
  for (const browser of browsers) await browser.close().catch(() => {});
  browsers.length = 0;
  if (server) await new Promise((done) => server.httpServer.close(() => done())).catch(() => {});
  server = null;
  if (rooms) await rooms.close().catch(() => {});
  rooms = null;
};
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stopAll().finally(() => process.exit(130)); });

try {
  await mkdir(outputDir, { recursive: true });
  rooms = await createRoomsServer({ host: '127.0.0.1', port: roomsPort, seatSecret: randomBytes(24).toString('hex'), matchTransport: 'p2p' });
  step('rooms', { url: rooms.url, transport: 'p2p' });
  server = await preview({ root, logLevel: 'error', build: { outDir: distDir }, preview: { host: '127.0.0.1', port: previewPort, strictPort: true, open: false } });
  const origin = `http://127.0.0.1:${previewPort}`;
  step('preview', { origin, dist: distDir });

  const launch = () => launchGuardedBrowser(puppeteer, {
    headless: !headful, protocolTimeout: 360_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--enable-webgl', '--window-size=1100,720'],
  });
  browsers.push(await launch(), await launch());
  const pages = {};
  for (const [label, browser] of [['A', browsers[0]], ['B', browsers[1]]]) {
    const page = await (await browser.createBrowserContext()).newPage();
    await page.setViewport(VIEWPORT);
    await page.evaluateOnNewDocument(installPcRecorder);
    observe(page, label);
    pages[label] = page;
  }
  const { A, B } = pages;

  // ---- both Garages: the host's battlefield is each room's (the play menu syncs the Garage's pick into it)
  await bootPage(A, `${origin}/?${BOOT_QUERY}`, 'A');
  await bootPage(B, `${origin}/?${BOOT_QUERY}`, 'B');

  for (let battle = 1; battle <= battles; battle++) {
    const roomMap = hostMaps[(battle - 1) % hostMaps.length];
    const record = { battle, roomMap, samples: { A: [], B: [] }, scenes: { A: [], B: [] }, links: {} };
    report.battles.push(record);

    // ---- the joiner plans its own battlefield first, as a player does: its Garage's map, the pointer over BATTLE
    // (garage.ts signalBattleIntent: the planned battlefield is prefetched), so a hidden world is resident before the
    // room's is built (the merge's precondition; without it the run proves nothing)
    await selectGarageMap(B, joinerMap);
    await B.hover('.cot-battle').catch(() => {});
    try {
      await waitFor(B, (id) => (window.__DEBUG?.worldCacheIds ?? []).some((key) => key === id || key.startsWith(`${id}#`)), `B prefetched ${joinerMap}`, 120_000, [joinerMap]);
    } catch (error) {
      fail(`battle ${battle}: the joiner's planned battlefield ${joinerMap} never became resident (${error.message.slice(0, 200)})`);
    }
    await B.mouse.move(5, 5);
    record.joinerPlanned = await B.evaluate(sceneProbe);
    step(`battle-${battle}-b-planned`, { resident: record.joinerPlanned.residentIds, worlds: record.joinerPlanned.worlds });

    // ---- the host creates a LAN room for two on its Garage's map
    await selectGarageMap(A, roomMap);
    await openRoomsPanel(A);
    await waitFor(A, () => document.querySelector('.cot-play')?.classList.contains('show'), 'A play menu', 30_000);
    await press(A, '.cot-play .modes [data-value="lan"]');
    await A.evaluate(() => {
      const name = document.querySelector('.cot-play [data-field="name"]');
      if (name) name.value = 'Alpha Lead';
      const size = document.querySelector('.cot-play [data-field="create-size"]');
      if (size) size.value = '2';
    });
    await press(A, '.cot-play [data-action="create"]');
    await waitFor(A, () => document.querySelector('.cot-play .lobby')?.classList.contains('show') && /[?&]room=[A-Z0-9]{6}/.test(location.search), 'A room created', 30_000);
    const roomCode = new URL(await A.evaluate(() => location.href)).searchParams.get('room');
    const roomState = () => rooms.roomService.rooms.get(roomCode)?.snapshot ?? null;
    for (let waited = 0; roomState()?.settings?.mapId !== roomMap && waited < 15_000; waited += 200) await sleep(200);
    record.roomCode = roomCode;
    step(`battle-${battle}-a-room`, { code: roomCode, map: roomState()?.settings?.mapId ?? null });
    if (roomState()?.settings?.mapId !== roomMap) report.findings.push(`battle ${battle}: the room plays ${roomState()?.settings?.mapId}, not ${roomMap}`);

    // ---- the joiner joins by code from the same page (an invite link would reload it and drop its planned world)
    await openRoomsPanel(B);
    await waitFor(B, () => document.querySelector('.cot-play')?.classList.contains('show'), 'B play menu', 30_000);
    await press(B, '.cot-play .modes [data-value="lan"]');
    await B.evaluate((code) => {
      const name = document.querySelector('.cot-play [data-field="name"]');
      if (name) name.value = 'Bravo Wing';
      const field = document.querySelector('.cot-play [data-field="code"]');
      field.value = code;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }, roomCode);
    await press(B, '.cot-play [data-action="join"]');
    await waitFor(B, () => (document.querySelector('.cot-play .lobby.show .players')?.children.length ?? 0) >= 2 || document.querySelector('.cot-play .status')?.classList.contains('err'), 'B joined', 60_000);
    const joinError = await B.evaluate(() => (document.querySelector('.cot-play .status')?.classList.contains('err') ? document.querySelector('.cot-play .status').textContent : ''));
    if (joinError) throw new Error(`B could not join ${roomCode}: ${joinError}`);
    await B.evaluate(() => {
      const team = document.querySelector('.cot-play [data-control="team"]');
      if (team && team.value !== 'alpha') { team.value = 'alpha'; team.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await sleep(1500);
    record.joinerLobby = await B.evaluate(sceneProbe);
    step(`battle-${battle}-b-joined`, { resident: record.joinerLobby.residentIds, worlds: record.joinerLobby.worlds });

    // ---- ready and start (the lobby's controls; after a battle, the Garage's lobby again)
    for (const page of [B, A]) {
      await waitFor(page, () => document.querySelector('.cot-play [data-action="ready"]')?.disabled === false, 'ready control', 60_000);
      // (src/ui/playMenu.ts) the control carries `needs-ready` while this seat is not ready in a waiting room
      const needsReady = await page.evaluate(() => document.querySelector('.cot-play [data-action="ready"]')?.classList.contains('needs-ready') === true);
      if (needsReady) await press(page, '.cot-play [data-action="ready"]');
    }
    await waitFor(A, () => !document.querySelector('.cot-play [data-action="start"]')?.disabled, 'A start enabled', 30_000);
    await press(A, '.cot-play [data-action="start"]');
    const pressedAt = elapsedMs();
    step(`battle-${battle}-start`);
    const revealed = {};
    await Promise.all([['A', A], ['B', B]].map(async ([label, page]) => {
      await waitFor(page, inBattle, `${label} battle ${battle} revealed`, 240_000);
      revealed[label] = elapsedMs() - pressedAt;
    }));
    record.revealMs = revealed;
    for (const [label, page] of [['A', A], ['B', B]]) {
      await page.bringToFront().catch(() => {});
      const probe = await page.evaluate(sceneProbe);
      record.scenes[label].push({ at: 'reveal', ...probe });
      judgeScene(label, probe, `battle ${battle} reveal`);
      await still(page, `battle${battle}-${label.toLowerCase()}-reveal.png`);
    }
    const [sa, sb] = [record.scenes.A[0], record.scenes.B[0]];
    step(`battle-${battle}-revealed`, { revealMs: revealed, a: { map: sa.roundMapId, drawn: sa.drawnDeep }, b: { map: sb.roundMapId, drawn: sb.drawnDeep } });
    if (sa.matchId !== sb.matchId) fail(`battle ${battle}: the peers are in different matches (${sa.matchId} / ${sb.matchId})`);
    if (sa.roundMapId !== sb.roundMapId) fail(`battle ${battle}: the peers play different maps (${sa.roundMapId} / ${sb.roundMapId})`);
    if (sa.drawnDeep[0] && sb.drawnDeep[0] && sa.drawnDeep[0] !== sb.drawnDeep[0]) fail(`battle ${battle}: the peers draw different battlefields (${sa.drawnDeep[0]} / ${sb.drawnDeep[0]})`);

    // ---- play: both drive and turn, one shot each now and then; every second the scene and the link
    const drive = async (page, turnKey) => {
      await page.keyboard.down('KeyW');
      await page.keyboard.down(turnKey);
    };
    const release = async (page, turnKey) => { await page.keyboard.up(turnKey).catch(() => {}); await page.keyboard.up('KeyW').catch(() => {}); };
    await drive(A, 'KeyA');
    await drive(B, 'KeyD');
    const until = performance.now() + playS * 1000;
    let tick = 0;
    while (performance.now() < until) {
      tick += 1;
      for (const [label, page] of [['A', A], ['B', B]]) {
        const [net, scene] = await Promise.all([page.evaluate(netProbe), page.evaluate(sceneProbe)]);
        record.samples[label].push({ ...net, drawn: scene.drawnDeep, guard: scene.guard });
        if (scene.drawnDeep.length !== 1 || (scene.roundMapId && scene.drawnDeep[0] !== `world-${scene.roundMapId}`)) {
          if (!record.scenes[label].some((entry) => entry.at === 'merge')) {
            record.scenes[label].push({ at: 'merge', tick, ...scene });
            await still(page, `battle${battle}-${label.toLowerCase()}-merge.png`);
          }
        }
        if (tick % 10 === 0) await page.keyboard.press(tick % 20 === 0 ? 'KeyS' : 'Space').catch(() => {});
      }
      if (tick % 15 === 0) {
        await release(A, 'KeyA'); await release(B, 'KeyD');
        await drive(A, tick % 30 === 0 ? 'KeyA' : 'KeyD'); await drive(B, tick % 30 === 0 ? 'KeyD' : 'KeyA');
      }
      await sleep(Math.max(0, 1000 - 60));
    }
    await release(A, 'KeyA'); await release(B, 'KeyD');
    for (const [label, page] of [['A', A], ['B', B]]) {
      const probe = await page.evaluate(sceneProbe);
      record.scenes[label].push({ at: 'end', ...probe });
      record.links[label] = await page.evaluate(linkProbe);
      await still(page, `battle${battle}-${label.toLowerCase()}-end.png`);
      const samples = record.samples[label].filter((sample) => sample.phase === 'battle');
      const merged = record.samples[label].filter((sample) => sample.drawn.length !== 1);
      if (merged.length) fail(`${label} battle ${battle}: ${merged.length}/${record.samples[label].length} seconds drew ${merged[0].drawn.length} battlefields (${merged[0].drawn.join(', ')})`);
      const first = samples[0] ?? {};
      const last = samples.at(-1) ?? {};
      const stalledSeconds = samples.slice(1).filter((sample, index) => sample.snapshots <= samples[index].snapshots).length;
      const summary = record[`sync${label}`] = {
        seconds: samples.length, rttP95: p95(samples.map((s) => s.rttMs)), rttMax: Math.max(...samples.map((s) => s.rttMs ?? 0)),
        ackP95: p95(samples.map((s) => s.ackLagTicks)), ackMax: Math.max(...samples.map((s) => s.ackLagTicks ?? 0)),
        intrinsicAckP95: p95(samples.map((s) => s.intrinsicAckLagTicks)),
        snapshots: (last.snapshots ?? 0) - (first.snapshots ?? 0), secondsWithoutSnapshot: stalledSeconds,
        stalls: (last.stalls ?? 0) - (first.stalls ?? 0), reconnects: (last.reconnects ?? 0) - (first.reconnects ?? 0),
        snapped: (last.snapped ?? 0) - (first.snapped ?? 0), extrapolated: (last.extrapolated ?? 0) - (first.extrapolated ?? 0),
        maxExtrapolatedMs: last.maxExtrapolatedMs ?? 0, reconciliations: (last.reconciliations ?? 0) - (first.reconciliations ?? 0),
        visibleCorrections: (last.visibleCorrections ?? 0) - (first.visibleCorrections ?? 0), hardSnaps: (last.hardSnaps ?? 0) - (first.hardSnaps ?? 0),
        maxCorrectionM: last.maxCorrectionM, maxFreePositionErrorM: last.maxFreePositionErrorM, tickJumps: last.tickJumps,
        positionErrorP95M: p95(samples.map((s) => s.lastPositionErrorM)), snapshotHz: samples.length > 1 ? +(((last.snapshots ?? 0) - (first.snapshots ?? 0)) / ((last.atMs - first.atMs) / 1000)).toFixed(1) : null,
        keyframeRequests: (last.keyframeRequests ?? 0) - (first.keyframeRequests ?? 0), timelineRestarts: (last.timelineRestarts ?? 0) - (first.timelineRestarts ?? 0),
        lossRate: last.lossRate, role: last.role, health: [...new Set(samples.map((s) => s.health))], link: record.links[label],
      };
      step(`battle-${battle}-${label}-sync`, summary);
      if (summary.rttP95 !== null && summary.rttP95 > rttP95Bound) fail(`${label} battle ${battle}: rtt p95 ${summary.rttP95} ms > ${rttP95Bound}`);
      if (summary.ackP95 !== null && summary.ackP95 > ackP95Bound) fail(`${label} battle ${battle}: input ack lag p95 ${summary.ackP95} ticks > ${ackP95Bound}`);
      if (summary.reconnects > 0) fail(`${label} battle ${battle}: ${summary.reconnects} reconnects`);
      if (summary.stalls > 0) fail(`${label} battle ${battle}: ${summary.stalls} stalls`);
      if (summary.secondsWithoutSnapshot > 1) fail(`${label} battle ${battle}: ${summary.secondsWithoutSnapshot} seconds without a snapshot`);
    }

    // ---- both leave to the Garage (the room is kept); the match ends once no commander is in it
    for (const [label, page] of [['B', B], ['A', A]]) {
      await page.evaluate(() => window.__MULTIPLAYER_V2?.pressLeave?.());
      await sleep(300);
      await page.evaluate(() => window.__MULTIPLAYER_V2?.pressLeave?.());
      await waitFor(page, readinessExpression('garage'), `${label} back in the Garage after battle ${battle}`, 120_000);
      const probe = await page.evaluate(sceneProbe);
      record.scenes[label].push({ at: 'garage', ...probe });
      if (probe.drawnDeep.length) fail(`${label} after battle ${battle}: the Garage draws ${probe.drawnDeep.join(', ')}`);
    }
    // ---- and both leave the room (the lobby's Leave): the next battle is a new room on the same pages, so each page
    // carries the worlds this one left resident into it
    for (const [label, page] of [['B', B], ['A', A]]) {
      await openRoomsPanel(page).catch(() => {});
      await press(page, '.cot-play [data-action="leave"]').catch((error) => report.findings.push(`${label} room leave after battle ${battle}: ${error.message}`));
      await waitFor(page, () => !document.querySelector('.cot-play .lobby')?.classList.contains('show'), `${label} out of the room`, 30_000)
        .catch((error) => report.findings.push(error.message.slice(0, 200)));
    }
    step(`battle-${battle}-left`, { roomPhase: roomState()?.phase ?? 'closed' });
    await sleep(1500);
  }

  if (report.errors.length) fail(`${report.errors.length} page or console errors (first: ${report.errors[0].page} ${report.errors[0].text.slice(0, 160)})`);
  report.pass = report.failures.length === 0;
} catch (error) {
  report.failures.push(`run stopped: ${error.message}`);
  report.pass = false;
} finally {
  report.wallMs = elapsedMs();
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {});
  await stopAll();
}
if (json) process.stdout.write(`${JSON.stringify({ pass: report.pass, failures: report.failures, out: outputDir })}\n`);
else log(`${report.pass ? 'PASS' : 'FAIL'} (${(report.wallMs / 1000).toFixed(0)} s) ${outputDir}/report.json`);
process.exit(report.pass ? 0 : 1);
