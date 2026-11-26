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

 * Gates (exit 1 on any failure; exit 2: --ice=relay with no relay configured):
 *   one map     every second of every battle, on both pages, exactly one `world-*` root of the scene is drawn (visible
 *               and in the scene), and it is the battlefield the round names (round.mapId); the black-world guard's
 *               tracked world is that one too.
 *   agreement   both pages enter the same match on the same map id, and the joiner's battlefield is the host's.
 *   opening     by --ack-by seconds after the reveal (3) each page's input acknowledgement lag is within --ack-p95, and stays
 *   sync        each peer's p95 round trip <= --rtt-p95 (ms), p95 input acknowledgement lag <= --ack-p95 (ticks), no
 *               reconnect, no stall, snapshots every second; corrections and snaps are reported.
 *   link        the data channel's selected candidate pair is reported (host / srflx / relay).
 *   Any page error, or a console error, on either page fails the run.
 *
 *   node tools/with-capture-lock.mjs --lock-class=render -- node tools/mp-two-peer-e2e.mjs --dist=dist
 *     (inside a hold the preview and the rooms service bind the slot's block, $COT_CAPTURE_PREVIEW_PORT and
 *     $COT_CAPTURE_ROOMS_PORT (tools/capture-ports.mjs), and the pages dial that rooms port with ?roomsPort=, so two render
 *     slots never share the LAN helper's 8792; --port and --rooms-port name others, and outside a hold they default to
 *     4248 and 8792)
 *   node tools/mp-two-peer-e2e.mjs --dist=dist --battles=3 --play=120 --maps=verdant,winter --joiner-map=desert --json
 *   node tools/mp-two-peer-e2e.mjs --dist=dist --battles=1 --play=20 --host-throttle=4   # a slow laptop hosting
 *   node tools/with-capture-lock.mjs --lock-class=render -- node tools/mp-two-peer-e2e.mjs --dist=dist --mode=private --ice=relay
 *     (relay-only through real TURN: run it in a terminal whose environment holds the rooms Worker's relay variables, set by
 *     hand there and never written to a file; without them the run refuses, exit 2, naming them. Every link's selected
 *     pair must be relay/relay and the status model's Path, the F3 row, must say via TURN.)
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
import { createRelayIssuer, pickRelayEnv } from '../server/relayCredentials.ts';
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
// unnamed ports inside a capture hold: its slot block's first preview port and rooms port (tools/capture-ports.mjs, 277)
const previewPort = Number(argValue('port', process.env.COT_CAPTURE_PREVIEW_PORT || 4248));
const roomsPort = Number(argValue('rooms-port', process.env.COT_CAPTURE_ROOMS_PORT || 8792));
const battles = Math.max(1, Number(argValue('battles', 2)));
const playS = Number(argValue('play', 120));
// the room's battlefield for each battle in turn (the host's Garage pick); the joiner plans --joiner-map before each
const hostMaps = argValue('maps', 'verdant,winter').split(',').filter(Boolean);
const joinerMap = argValue('joiner-map', 'desert');
const rttP95Bound = Number(argValue('rtt-p95', 120));
const ackP95Bound = Number(argValue('ack-p95', 12));
// --mode=private: an internet room (the Play menu's Private), whose every connection asks the room for its ICE servers; a
// LAN room uses none (src/mp/transport/iceConfig.ts). --ice=relay (implies private): every peer connection on both pages is
// built relay-only (iceTransportPolicy 'relay'), so a link exists only through the TURN servers the room granted, and the
// room service mints them from this process's environment (server/relayCredentials.ts). The tool never reads, prints or
// writes the relay variables: the issuer says whether they configure a relay, and a run without one refuses by their names.
const forceRelay = argValue('ice', '') === 'relay';
const roomKind = forceRelay || argValue('mode', 'lan') === 'private' ? 'private' : 'lan';
// --host-throttle=<rate>: the host's page under CDP CPU throttling from its boot (a slow laptop hosting), where its own
// clock's seed and boot land in its first seconds. --ack-by=<s>: the startup gate's second (3 by default).
const hostThrottle = Number(argValue('host-throttle', 0));
const ackBy = Number(argValue('ack-by', 3));
// (Kevin 2026-11-25, a friend on the live site: "it didnt load fast enough ... he got stuck at 56%") the joiner as that
// friend: --joiner-cold opens the invite link in its fresh profile for its first battle (no Garage before it);
// --joiner-net=<down kbps>,<rtt ms>[,<up kbps>] and --joiner-cpu=<rate> throttle its page (CDP) from its first request;
// --joiner-ice=blocked builds its peer connections relay-only with no relay server, so its link can never connect (two
// NATs with no usable TURN). Gates: the joiner's battle on screen within --join-bound seconds of the start press, and no
// loading state (the loader's percent and stage) unchanged for more than --stall-bound seconds.
const joinerCold = process.argv.includes('--joiner-cold');
const joinerNet = argValue('joiner-net', '').split(',').map(Number).filter((value) => value > 0);
const joinerCpu = Number(argValue('joiner-cpu', 0));
const joinerBlocked = argValue('joiner-ice', '') === 'blocked';
const joinBoundS = Number(argValue('join-bound', 0));
const stallBoundS = Number(argValue('stall-bound', 10));
// --solo: one cold page (the joiner's throttles apply) enters a solo battle on the first --maps battlefield in --spec, the
// player's covered path (__DEBUG.beginSoloBattle), measured as the joiner is: the loader's timeline, its longest still
// state (--stall-bound), the time to the battle (--join-bound), the entry trace and the bytes it fetched.
const solo = process.argv.includes('--solo');
// --seed=<n> (277 by default; --seed=random for the room's own Math.random): the in-process room service draws its match
// seeds (and room codes) from a generator on this seed, so a run's matches draw the same bots, vehicles and 'random' map
// as another run's and their timings compare (the roster stage swung 6.8-12.4 s with the bots a run drew).
const seedArg = argValue('seed', '277');
// --lobby-wait=<s>: the seconds both seats sit in the lobby before readying (a real lobby's wait, in which the lobby
// preloader builds the room's world and, from room protocol 3, its next bots' vehicles); 0 by default (the worst case)
const lobbyWaitS = Number(argValue('lobby-wait', 0));
const roomRandom = seedArg === 'random' ? undefined : (() => {
  let state = (Number(seedArg) >>> 0) || 277;
  return () => { state = (state + 0x6D2B79F5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
})();
const soloSpec = argValue('spec', 'm1a2_abrams_sepv3');
// --post-reveal-s=<s> (wreck-bake-after-reveal-278): the solo page stays in its battle this long after the reveal, timing
// every presented frame (rAF deltas: the longest, how many passed 50 ms) and reading the wrecks' swap after the reveal
// (world/deferredWrecks.ts: when each bake's hulks swapped in, and the swap's own longest main-thread step)
const postRevealS = Number(argValue('post-reveal-s', 0));
const RELAY_VARIABLES = 'COT_CLOUDFLARE_TURN_KEY_ID and COT_CLOUDFLARE_TURN_API_TOKEN (the rooms Worker\'s Cloudflare TURN key), '
  + 'or COT_TURN_URLS and COT_TURN_SHARED_SECRET (a coturn), or COT_TURN_ICE_SERVERS_JSON';
// (the launcher asks every page for the harness path, which installs __DEBUG and __MULTIPLAYER_V2; ?debug=1 would add the
// debug HUD over the Garage's rooms entry)
// a rooms service off the LAN helper's 8792 is dialled with ?roomsPort= (endpoint.ts, loopback pages only)
const BOOT_QUERY = `nosplash=1&tier=desktop&gfxreset=1${roomsPort !== 8792 ? `&roomsPort=${roomsPort}` : ''}`;
const VIEWPORT = { width: 1024, height: 640, deviceScaleFactor: 1 };

const log = (line) => { if (!json) process.stderr.write(`[mp-two-peer-e2e] ${line}\n`); };
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const startedAt = performance.now();
const elapsedMs = () => Math.round(performance.now() - startedAt);
const report = { pass: false, failures: [], findings: [], errors: [], warnings: [], steps: [], battles: [], dist: distDir, solo, seed: seedArg, lobbyWaitS, roomKind, forceRelay, hostThrottle, ackBy, joinerCold, joinerNet, joinerCpu, joinerBlocked, joinBoundS, stallBoundS, hostMaps, joinerMap, playS, bounds: { rttP95: rttP95Bound, ackP95: ackP95Bound } };
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
    // the client clock (src/mp/match/clock.ts): the active offset against the filtered target the pongs give, and its samples
    offsetMs: match?.serverOffsetMs ?? null, offsetTargetMs: match?.serverOffsetTargetMs ?? null,
    offsetErrorMs: match && Number.isFinite(match.serverOffsetMs) && Number.isFinite(match.serverOffsetTargetMs) ? match.serverOffsetMs - match.serverOffsetTargetMs : null,
    clockSamples: match?.clockSamples ?? null, leadTicks: match?.inputLeadTicks ?? null,
    // the F3 panel's Path row reads these (src/ui/multiplayerStatus.ts formatPanelRows)
    candidateType: window.__MULTIPLAYER_V2?.networkStatus?.candidateType ?? null, viaTurn: window.__MULTIPLAYER_V2?.networkStatus?.viaTurn ?? null,
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
function installPcRecorder(relayOnly = false, blocked = false) {
  if (window.__MP2_PCS) return;
  const pcs = window.__MP2_PCS = [];
  const Native = window.RTCPeerConnection;
  if (!Native) return;
  window.RTCPeerConnection = class extends Native {
    constructor(configuration, ...rest) {
      // blocked: relay-only with no relay server gathers no candidate, so ICE never connects (two NATs, no TURN)
      const next = blocked ? { ...(configuration ?? {}), iceServers: [], iceTransportPolicy: 'relay' }
        : relayOnly ? { ...(configuration ?? {}), iceTransportPolicy: 'relay' } : configuration;
      super(next, ...rest);
      pcs.push(this);
    }
  };
}

/** Init script: the battle loader's percent and stage every 250 ms while it is on (the joiner's loading timeline). */
function installLoadRecorder() {
  if (window.__MP2_LOAD) return;
  // (every resource the page fetches counted: the default buffer of 250 fills during the boot)
  try { performance.setResourceTimingBufferSize(20_000); } catch { /* no resource timing */ }
  const rows = window.__MP2_LOAD = [];
  let last = '';
  setInterval(() => {
    const root = document.querySelector('.cot-bl');
    const on = !!root && root.classList.contains('on');
    const pct = root?.querySelector('.fpct')?.textContent?.trim() ?? '';
    const stage = root?.querySelector('.fstage .st')?.textContent?.trim() ?? '';
    const key = `${on}|${pct}|${stage}`;
    if (key !== last && rows.length < 4000) { last = key; rows.push({ atMs: Math.round(performance.now()), on, pct, stage }); }
  }, 250);
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

/** In-page: when each terrain photograph finished, in seconds against now (the reveal): negative landed before it. */
function terrainPhotoTimes() {
  const now = performance.now();
  return performance.getEntriesByType('resource').filter((entry) => entry.name.includes('/textures/terrain/'))
    .map((entry) => ({ file: entry.name.split('/').pop().slice(0, 48), endS: +((entry.responseEnd - now) / 1000).toFixed(1), bytes: entry.transferSize || 0 }));
}

/** (mp-fixes-277) the props build's own record of its slices and waits (props.ts _buildDetail: wreck bakes, pool joins). */
const propsBuildDetail = () => {
  const props = window.__DEBUG?.world?._buildDetail?.props;
  return props ? JSON.parse(JSON.stringify({ synchronousMs: props.synchronousMs, sliceCount: props.sliceCount, slowest: props.slowest,
    awaitTimings: props.awaitTimings ? { ...props.awaitTimings, wreckRows: undefined } : null })) : null;
};

/** One cold page's solo entry, throttled as the joiner, measured as the joiner's (the --solo mode). */
async function runSolo(origin) {
  const browser = await launchGuardedBrowser(puppeteer, {
    headless: !headful, protocolTimeout: 360_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--enable-webgl', '--window-size=1100,720'],
  });
  browsers.push(browser);
  const page = await (await browser.createBrowserContext()).newPage();
  await page.setViewport(VIEWPORT);
  await page.evaluateOnNewDocument(installLoadRecorder);
  observe(page, 'S');
  if (joinerNet.length || joinerCpu > 1) {
    const cdp = await page.createCDPSession();
    if (joinerNet.length) {
      const [downKbps, rttMs = 50, upKbps = Math.max(256, Math.round(joinerNet[0] / 4))] = joinerNet;
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rttMs,
        downloadThroughput: Math.round(downKbps * 1000 / 8), uploadThroughput: Math.round(upKbps * 1000 / 8) });
    }
    if (joinerCpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: joinerCpu });
  }
  const bytes = () => page.evaluate(() => performance.getEntriesByType('resource').reduce((sum, entry) => sum + (entry.transferSize || 0), 0)).catch(() => null);
  const openedAt = elapsedMs();
  await bootPage(page, `${origin}/?${BOOT_QUERY}`, 'S');
  const out = { map: hostMaps[0], spec: soloSpec, bootMs: elapsedMs() - openedAt, bytesAtBoot: await bytes() };
  const mark = await page.evaluate(() => (window.__MP2_LOAD ?? []).length);
  const startedAt = elapsedMs();
  await page.evaluate((specId, mapId) => {
    window.__SOLO = { done: false, error: null };
    Promise.resolve(window.__DEBUG.beginSoloBattle({ specId, mapId, randomRoster: false }))
      .then(() => { window.__SOLO.done = true; }, (error) => { window.__SOLO.done = true; window.__SOLO.error = String(error?.message ?? error).slice(0, 300); });
  }, soloSpec, hostMaps[0]);
  await waitFor(page, readinessExpression('battleRevealed'), 'S solo battle revealed', 300_000);
  out.revealMs = elapsedMs() - startedAt;
  out.bytesAtReveal = await bytes();
  const rows = (await page.evaluate((from) => (window.__MP2_LOAD ?? []).slice(from), mark)) ?? [];
  const t0 = rows[0]?.atMs ?? 0;
  out.load = rows.map((row) => ({ s: +((row.atMs - t0) / 1000).toFixed(1), on: row.on, pct: row.pct, stage: row.stage }));
  let longest = { s: 0, pct: '', stage: '' };
  for (let index = 0; index < rows.length; index++) {
    if (!rows[index].on) continue;
    const end = rows[index + 1]?.atMs ?? t0;
    const heldS = (end - rows[index].atMs) / 1000;
    if (heldS > longest.s) longest = { s: +heldS.toFixed(1), pct: rows[index].pct, stage: rows[index].stage };
  }
  out.longestHold = longest;
  out.trace = await page.evaluate(() => (window.__BATTLE_LOAD ? JSON.parse(JSON.stringify(window.__BATTLE_LOAD)) : null)).catch(() => null);
  // the terrain photographs against the reveal: one that lands after it swaps in on screen (the pop)
  out.terrainPhotos = await page.evaluate(terrainPhotoTimes).catch(() => null);
  out.propsBuild = await page.evaluate(propsBuildDetail).catch(() => null);
  step('solo-entry', { revealS: +(out.revealMs / 1000).toFixed(1), longestHold: longest, bytes: { boot: out.bytesAtBoot, reveal: out.bytesAtReveal } });
  if (longest.s > stallBoundS) fail(`solo: the loader held ${longest.pct} "${longest.stage}" for ${longest.s} s (> ${stallBoundS} s with no new state)`);
  if (joinBoundS && out.revealMs > joinBoundS * 1000) fail(`solo: the battle was not on screen within ${joinBoundS} s (${(out.revealMs / 1000).toFixed(1)} s)`);
  await still(page, 'solo-reveal.png');
  if (postRevealS > 0) out.postReveal = await watchAfterReveal(page, postRevealS);
  return out;
}

/** (wreck-bake-after-reveal-278) The battle's frames over `seconds` after the reveal, and the wrecks' deferred swap. */
async function watchAfterReveal(page, seconds) {
  const deferredPlan = () => {
    let plan = null;
    window.__DEBUG?.world?.group?.traverse((object) => { if (!plan && object.userData?.deferredWrecks) plan = object.userData.deferredWrecks; });
    return plan ? { state: plan.state, hulks: plan.hulks.length, stats: plan.stats ? JSON.parse(JSON.stringify(plan.stats)) : null } : null;
  };
  // the timeline: every frame over 50 ms with when it ended, and when each wreck swap landed, on one clock (ms after the
  // swap run started, at the reveal); the run's start is read off a swap seen landing live (its frame's time less the
  // swap's own swapsMs), so a long frame can be matched to a swap. Without a plan (the base) the clock is the watch's start.
  const watched = await page.evaluate((ms) => new Promise((done) => {
    const deltas = [], long = [];
    let plan = null, seen = 0, runStart = null;
    window.__DEBUG?.world?.group?.traverse((object) => { if (!plan && object.userData?.deferredWrecks) plan = object.userData.deferredWrecks; });
    const start = performance.now();
    let last = start;
    const tick = (now) => {
      const delta = now - last;
      deltas.push(delta);
      last = now;
      const swaps = plan?.stats?.swapsMs ?? [];
      // (a frame ends after the swap it shows, so each sighting bounds the start from above; the least is the closest)
      if (swaps.length > seen) { runStart = Math.min(runStart ?? Infinity, now - swaps[swaps.length - 1]); seen = swaps.length; }
      if (delta > 50) long.push({ endAt: now, ms: +delta.toFixed(1) });
      if (now - start < ms) requestAnimationFrame(tick);
      else {
        const origin = runStart ?? start;
        const swapsAt = runStart === null ? [] : (plan?.stats?.swapsMs ?? []);
        done({ deltas, timeline: {
          clock: runStart === null ? 'watch start' : 'swap run start (reveal)',
          watchStartMs: Math.round(start - origin),
          swapsAt,
          longFrames: long.map((f) => {
            const endMs = Math.round(f.endAt - origin), startMs = Math.round(endMs - f.ms);
            return { startMs, endMs, ms: f.ms, swap: swapsAt.some((s) => s >= startMs - 2 && s <= endMs + 2) };
          }),
        } });
      }
    };
    requestAnimationFrame((now) => { last = now; requestAnimationFrame(tick); });
  }), seconds * 1000);
  const frames = watched.deltas;
  const sorted = [...frames].sort((a, b) => a - b);
  const result = {
    seconds, frames: frames.length,
    longestMs: +(sorted.at(-1) ?? 0).toFixed(1),
    p99Ms: +(sorted[Math.floor(sorted.length * 0.99)] ?? 0).toFixed(1),
    over50: frames.filter((ms) => ms > 50).length,
    over100: frames.filter((ms) => ms > 100).length,
    deferred: await page.evaluate(deferredPlan).catch(() => null),
  };
  step('solo-post-reveal', result);
  result.timeline = watched.timeline;
  await still(page, 'solo-post-reveal.png');
  return result;
}

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
  // a private room's grants come from this process's relay variables (none set: STUN-less host candidates, as the LAN helper)
  const relay = createRelayIssuer({ env: pickRelayEnv(process.env), warn: (line) => report.findings.push(`relay issuer: ${line}`) });
  if (forceRelay && relay.source === 'none') {
    report.refused = `--ice=relay needs a relay in this process's environment: set ${RELAY_VARIABLES} in your own terminal (never in a file or a chat)`;
    throw new Error(report.refused);
  }
  rooms = await createRoomsServer({ host: '127.0.0.1', port: roomsPort, seatSecret: randomBytes(24).toString('hex'), matchTransport: 'p2p',
    ...(roomRandom ? { random: roomRandom } : {}),
    ...(roomKind === 'private' ? { relayCredentials: () => relay.issue() } : {}) });
  step('rooms', { url: rooms.url, transport: 'p2p', roomKind, relaySource: relay.source, forceRelay });
  server = await preview({ root, logLevel: 'error', build: { outDir: distDir }, preview: { host: '127.0.0.1', port: previewPort, strictPort: true, open: false } });
  const origin = `http://127.0.0.1:${previewPort}`;
  step('preview', { origin, dist: distDir });

  if (solo) {
    report.solo = await runSolo(origin);
    if (report.errors.length) fail(`${report.errors.length} page or console errors (first: ${report.errors[0].page} ${report.errors[0].text.slice(0, 160)})`);
    report.pass = report.failures.length === 0;
    throw Object.assign(new Error('solo done'), { soloDone: true });
  }
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
    await page.evaluateOnNewDocument(installPcRecorder, forceRelay, label === 'B' && joinerBlocked);
    if (label === 'B') await page.evaluateOnNewDocument(installLoadRecorder);
    observe(page, label);
    pages[label] = page;
  }
  const { A, B } = pages;
  if (joinerNet.length || joinerCpu > 1) {
    const cdp = await B.createCDPSession();
    if (joinerNet.length) {
      const [downKbps, rttMs = 50, upKbps = Math.max(256, Math.round(joinerNet[0] / 4))] = joinerNet;
      await cdp.send('Network.enable');
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: rttMs,
        downloadThroughput: Math.round(downKbps * 1000 / 8), uploadThroughput: Math.round(upKbps * 1000 / 8) });
    }
    if (joinerCpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: joinerCpu });
  }
  if (hostThrottle > 1) {
    const cdp = await A.createCDPSession();
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: hostThrottle });
  }

  // ---- both Garages: the host's battlefield is each room's (the play menu syncs the Garage's pick into it)
  await bootPage(A, `${origin}/?${BOOT_QUERY}`, 'A');
  let joinerBooted = false;
  if (!joinerCold) { await bootPage(B, `${origin}/?${BOOT_QUERY}`, 'B'); joinerBooted = true; }

  for (let battle = 1; battle <= battles; battle++) {
    const roomMap = hostMaps[(battle - 1) % hostMaps.length];
    const record = { battle, roomMap, samples: { A: [], B: [] }, scenes: { A: [], B: [] }, links: {} };
    report.battles.push(record);

    // ---- the joiner plans its own battlefield first, as a player does: its Garage's map, the pointer over BATTLE
    // (garage.ts signalBattleIntent: the planned battlefield is prefetched), so a hidden world is resident before the
    // room's is built (the merge's precondition; without it the run proves nothing)
    if (joinerBooted) {
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
    }

    // ---- the host creates a LAN room for two on its Garage's map
    await selectGarageMap(A, roomMap);
    await openRoomsPanel(A);
    await waitFor(A, () => document.querySelector('.cot-play')?.classList.contains('show'), 'A play menu', 30_000);
    await press(A, `.cot-play .modes [data-value="${roomKind}"]`);
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

    if (!joinerBooted) {
      // ---- the cold joiner: the invite link in a fresh profile, its first page of the site (the friend's way in)
      const invite = new URL(await A.evaluate(() => location.href));
      for (const [key, value] of new URLSearchParams(BOOT_QUERY)) invite.searchParams.set(key, value);
      const openedAt = elapsedMs();
      await bootPage(B, invite.href, 'B (cold invite)');
      record.joinerBootMs = elapsedMs() - openedAt;
      joinerBooted = true;
      await waitFor(B, () => (document.querySelector('.cot-play .lobby.show .players')?.children.length ?? 0) >= 2 || document.querySelector('.cot-play .status')?.classList.contains('err'), 'B joined (invite)', 120_000);
      record.joinerJoinedAtPageMs = await B.evaluate(() => performance.now()).catch(() => 0);
      record.joinerBytesAtJoin = await B.evaluate(() => performance.getEntriesByType('resource').reduce((sum, entry) => sum + (entry.transferSize || 0), 0)).catch(() => null);
      step(`battle-${battle}-b-cold-joined`, { bootMs: record.joinerBootMs, bytes: record.joinerBytesAtJoin });
    } else {
    // ---- the joiner joins by code from the same page (an invite link would reload it and drop its planned world)
    await openRoomsPanel(B);
    await waitFor(B, () => document.querySelector('.cot-play')?.classList.contains('show'), 'B play menu', 30_000);
    await press(B, `.cot-play .modes [data-value="${roomKind}"]`);
    await B.evaluate((code) => {
      const name = document.querySelector('.cot-play [data-field="name"]');
      if (name) name.value = 'Bravo Wing';
      const field = document.querySelector('.cot-play [data-field="code"]');
      field.value = code;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }, roomCode);
    await press(B, '.cot-play [data-action="join"]');
    await waitFor(B, () => (document.querySelector('.cot-play .lobby.show .players')?.children.length ?? 0) >= 2 || document.querySelector('.cot-play .status')?.classList.contains('err'), 'B joined', 60_000);
    }
    const joinError = await B.evaluate(() => (document.querySelector('.cot-play .status')?.classList.contains('err') ? document.querySelector('.cot-play .status').textContent : ''));
    if (joinError) throw new Error(`B could not join ${roomCode}: ${joinError}`);
    await B.evaluate(() => {
      const team = document.querySelector('.cot-play [data-control="team"]');
      if (team && team.value !== 'alpha') { team.value = 'alpha'; team.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await sleep(1500);
    record.joinerLobby = await B.evaluate(sceneProbe);
    step(`battle-${battle}-b-joined`, { resident: record.joinerLobby.residentIds, worlds: record.joinerLobby.worlds });

    if (lobbyWaitS > 0) {
      step(`battle-${battle}-lobby-wait`, { s: lobbyWaitS });
      await sleep(lobbyWaitS * 1000);
    }
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
    const loadMark = await B.evaluate(() => (window.__MP2_LOAD ?? []).length);
    const revealWaits = await Promise.allSettled([['A', A], ['B', B]].map(async ([label, page]) => {
      if (joinerBlocked && label === 'B') {
        await waitFor(page, () => !document.querySelector('.cot-bl')?.classList.contains('on') && !!window.__NETWORK_ENTRY_FAILURE, 'B told it cannot reach the host', 120_000);
        return;
      }
      await waitFor(page, inBattle, `${label} battle ${battle} revealed`, 240_000);
      revealed[label] = elapsedMs() - pressedAt;
    }));
    record.revealMs = revealed;
    // the joiner's loading timeline from the start press: each change of the loader's percent or stage
    const loadRows = (await B.evaluate((from) => (window.__MP2_LOAD ?? []).slice(from), loadMark)) ?? [];
    const t0 = loadRows[0]?.atMs ?? 0;
    record.joinerLoad = loadRows.map((row) => ({ s: +((row.atMs - t0) / 1000).toFixed(1), on: row.on, pct: row.pct, stage: row.stage }));
    let longest = { s: 0, pct: '', stage: '' };
    for (let index = 0; index < loadRows.length; index++) {
      const row = loadRows[index];
      if (!row.on) continue;
      const end = loadRows[index + 1]?.atMs ?? (await B.evaluate(() => Math.round(performance.now())));
      const heldS = (end - row.atMs) / 1000;
      if (heldS > longest.s) longest = { s: +heldS.toFixed(1), pct: row.pct, stage: row.stage };
    }
    record.joinerLongestHold = longest;
    // what the joiner downloaded: at its join (boot + lobby prefetch) and by its reveal (the entry), from resource timing
    // what the entry fetched, by kind and by the heaviest files (resources that finished after the join)
    record.joinerEntryFetches = await B.evaluate((joinedAt) => {
      const rows = performance.getEntriesByType('resource').filter((entry) => entry.responseEnd >= joinedAt);
      const kindOf = (name) => {
        const path = new URL(name, location.href).pathname;
        if (/\.(js|mjs)$/.test(path)) return 'script';
        if (/\.(png|jpe?g|webp|avif|ktx2|basis|dds)$/.test(path)) return 'image';
        if (/\.(bin|glb|gltf|dat|br|json)$/.test(path)) return 'data';
        if (/\.(wasm)$/.test(path)) return 'wasm';
        if (/\.(mp3|ogg|opus|wav|m4a)$/.test(path)) return 'audio';
        return 'other';
      };
      const byKind = {};
      for (const entry of rows) { const kind = kindOf(entry.name); byKind[kind] = (byKind[kind] ?? 0) + (entry.transferSize || 0); }
      const top = rows.sort((x, y) => (y.transferSize || 0) - (x.transferSize || 0)).slice(0, 15)
        .map((entry) => ({ path: new URL(entry.name, location.href).pathname.slice(0, 90), bytes: entry.transferSize || 0, encoded: entry.encodedBodySize || 0, decoded: entry.decodedBodySize || 0 }));
      return { count: rows.length, byKind, top };
    }, record.joinerJoinedAtPageMs ?? 0).catch(() => null);
    record.joinerTerrainPhotos = await B.evaluate(terrainPhotoTimes).catch(() => null);
    record.joinerPropsBuild = await B.evaluate(propsBuildDetail).catch(() => null);
    record.joinerBytes = { atJoin: record.joinerBytesAtJoin ?? null, atReveal: await B.evaluate(() => performance.getEntriesByType('resource').reduce((sum, entry) => sum + (entry.transferSize || 0), 0)).catch(() => null) };
    // the entry's own stage timings on the joiner (browserComposition markStage: where the time under one label went)
    record.joinerTrace = await B.evaluate(() => {
      const trace = window.__NETWORK_LOAD ?? null;
      return trace ? JSON.parse(JSON.stringify({ status: trace.status, totalMs: trace.totalMs, stages: trace.stages, compile: trace.compile ?? null })) : null;
    }).catch(() => null);
    step(`battle-${battle}-joiner-load`, { revealS: revealed.B ? +(revealed.B / 1000).toFixed(1) : null, longestHold: longest, rows: record.joinerLoad.length });
    if (longest.s > stallBoundS) fail(`battle ${battle}: the joiner's loader held ${longest.pct} "${longest.stage}" for ${longest.s} s (> ${stallBoundS} s with no new state)`);
    if (joinBoundS && !joinerBlocked && !(revealed.B <= joinBoundS * 1000)) fail(`battle ${battle}: the joiner's battle was not on screen within ${joinBoundS} s of the start (${revealed.B ? (revealed.B / 1000).toFixed(1) + ' s' : 'never'})`);
    if (joinerBlocked) {
      // (a link that can never connect) the joiner is told, in words, with Rejoin: the lobby back with the host_unreachable
      // sentence within --join-bound of the start, and its loader never still for more than --stall-bound on the way.
      // The failure is recorded before the Garage restore; the lobby words it after (offerRoomAfterFailure): wait for it.
      await waitFor(B, () => document.querySelector('.cot-play .status')?.classList.contains('err') === true, 'B lobby names the failure', 20_000)
        .catch((error) => report.findings.push(error.message.slice(0, 200)));
      const status = await B.evaluate(() => ({ text: document.querySelector('.cot-play .status')?.textContent ?? '',
        err: document.querySelector('.cot-play .status')?.classList.contains('err') ?? false,
        rejoin: !!document.querySelector('.cot-play [data-action="rejoin"]:not([hidden])'),
        failure: window.__NETWORK_ENTRY_FAILURE ?? null, loaderOn: document.querySelector('.cot-bl')?.classList.contains('on') ?? false }));
      const toldAtS = loadRows.findLast?.((row) => row.on)?.atMs !== undefined ? +(((loadRows.findLast((row) => row.on).atMs - t0) / 1000) + 0.25).toFixed(1) : null;
      record.blocked = { status, toldAfterS: toldAtS };
      step(`battle-${battle}-joiner-blocked`, record.blocked);
      if (status.failure?.reason !== 'host_unreachable') fail(`battle ${battle}: the blocked joiner's failure is ${status.failure?.reason ?? 'none'}, not host_unreachable`);
      if (!/reach the host/i.test(status.text)) fail(`battle ${battle}: the blocked joiner's lobby does not say the host could not be reached: "${status.text}"`);
      if (joinBoundS && !(toldAtS !== null && toldAtS <= joinBoundS)) fail(`battle ${battle}: the blocked joiner was told after ${toldAtS} s (> ${joinBoundS} s)`);
      break;
    }
    const stuck = revealWaits.find((wait) => wait.status === 'rejected');
    if (stuck) throw stuck.reason;
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
      // (a throttled joiner's steady state carries the throttle: its bounds are reported, not gated)
      const gate = label === 'B' && (joinerNet.length || joinerCpu > 1)
        ? (line) => report.findings.push(`throttled joiner (not gated): ${line}`) : fail;
      if (summary.rttP95 !== null && summary.rttP95 > rttP95Bound) gate(`${label} battle ${battle}: rtt p95 ${summary.rttP95} ms > ${rttP95Bound}`);
      if (summary.ackP95 !== null && summary.ackP95 > ackP95Bound) gate(`${label} battle ${battle}: input ack lag p95 ${summary.ackP95} ticks > ${ackP95Bound}`);
      // (the host's startup backlog, 277) the first seconds: by --ack-by the lag is within the bound, and stays there
      const opening = samples.slice(0, ackBy + 3).map((sample) => sample.ackLagTicks);
      summary.openingAck = opening;
      summary.openingOffsetErrorMs = samples.slice(0, ackBy + 3).map((sample) => (sample.offsetErrorMs === null ? null : Math.round(sample.offsetErrorMs)));
      const late = opening.slice(ackBy).filter((ticks) => Number.isFinite(ticks) && ticks > ackP95Bound);
      if (late.length) gate(`${label} battle ${battle}: input ack lag still ${Math.max(...late)} ticks at second ${ackBy}+ (> ${ackP95Bound}; first seconds ${opening.join(', ')})`);
      if (summary.reconnects > 0) fail(`${label} battle ${battle}: ${summary.reconnects} reconnects`);
      if (summary.stalls > 0) fail(`${label} battle ${battle}: ${summary.stalls} stalls`);
      if (summary.secondsWithoutSnapshot > 1) fail(`${label} battle ${battle}: ${summary.secondsWithoutSnapshot} seconds without a snapshot`);
      summary.path = { candidateType: last.candidateType ?? null, viaTurn: last.viaTurn ?? null };
      if (forceRelay) {
        // relay-only: every live link through TURN at both ends, and the F3 panel's Path row says so (the peer's
        // candidate type, the host's "via TURN")
        const links = record.links[label] ?? [];
        if (!links.length || links.some((link) => link.state === 'connected' && (link.local !== 'relay' || link.remote !== 'relay'))) {
          fail(`${label} battle ${battle}: --ice=relay, but a link's selected pair is not relay/relay: ${JSON.stringify(links)}`);
        }
        if (last.viaTurn !== true) fail(`${label} battle ${battle}: --ice=relay, but the status model (the F3 Path row) says viaTurn ${last.viaTurn}`);
      }
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
  if (!error?.soloDone) {
    report.failures.push(`run stopped: ${error.message}`);
    report.pass = false;
  }
} finally {
  report.wallMs = elapsedMs();
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2)).catch(() => {});
  await stopAll();
}
if (json) process.stdout.write(`${JSON.stringify({ pass: report.pass, failures: report.failures, out: outputDir })}\n`);
else log(`${report.pass ? 'PASS' : 'FAIL'} (${(report.wallMs / 1000).toFixed(0)} s) ${outputDir}/report.json`);
if (report.refused) process.stderr.write(`[mp-two-peer-e2e] refused: ${report.refused}\n`);
process.exit(report.refused ? 2 : report.pass ? 0 : 1);
