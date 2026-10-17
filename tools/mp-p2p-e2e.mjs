#!/usr/bin/env node
/**
 * Multiplayer v2 peer-to-peer browser end-to-end (P2 client lane, 2026-09-28): three pristine headless Chromes on
 * the real site (the only multiplayer since the cutover of 2026-09-29), one Vite dev server of this checkout, and the room signaling double
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
 *   node tools/mp-p2p-e2e.mjs --site=https://cot.kevinliu.studio  # the deployed site itself: no vite, no double; the pages use the
 *                                                                # room host the build was made with (the deployed Worker allows the
 *                                                                # site origin alone, so this is the only way to prove it); the
 *                                                                # diagnostics hook is up because puppeteer sets navigator.webdriver
 *                                                                # its log (the election record, the host's reports) take the pages' facts
 *
 * The honest-check options (2026-10-13, the MP stream; MP-SINCE-0930 plan steps 7 and 14):
 *   --mode=private          an internet room (the Play menu's Private): every connection asks the room for its ICE
 *                           (`room_relay`); the release check's LAN rooms never do (iceConfig.ts: LAN asks nothing)
 *   --game-mode=<id> --map=<id>   the admin sets the room's mode and battlefield in the lobby before Ready
 *   --phone=b|c             that seat is a phone: the mobile tier (it never hosts), a phone viewport and touch input
 *   The run is role-agnostic: the room may elect another host during a slow entry (MP-S03) or elect C rather than B
 *   when A leaves; the labels follow the roles (A is the host at the reveal, B the seat elected when A leaves), the
 *   swaps are recorded in report.roles, and a failure is a broken role, not an unexpected name.
 *   Every page records its room client's host_changed (with the room's reason), its declines, its relay grants
 *   (server counts and schemes, never a credential) and its session's p2p events: report.roomLog per page, and in
 *   live mode the election's reason comes from there. report.bandwidth: getStats bytes per page and data channel over
 *   the play window, and each link's selected candidate pair (host / srflx / relay).
 *
 * During A's return the two tabs still rendering (B hosting, C playing) draw at 320×200: two full battle frames starve the
 * shared headless GPU process while A2 compiles its programs, and the strict preparation is wall-clock bounded (since
 * 2026-10-10 the entry keeps preparing while programs link and never refuses on that clock —
 * src/mp/session/browserComposition.ts — but the proof keeps the load honest rather than leaning on it).
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
const mobile = process.argv.includes('--mobile');
const mobileViewport = {width:Number(argValue('width',667)),height:Number(argValue('height',375)),deviceScaleFactor:1,isMobile:true,hasTouch:true};
const testViewport = mobile ? mobileViewport : {width:1024,height:640,deviceScaleFactor:1};
const headful = process.argv.includes('--headful');
const outputDir = resolve(argValue('out', join(root, '.qa-dev', 'mp-p2p-e2e')));
const cacheDir = resolve(argValue('cache-dir', join(outputDir, 'vite-cache')));
const playS = Number(argValue('play', 12));
const graceMs = Number(argValue('grace', 3000));
const roomsUrl = argValue('rooms', '');
const siteUrl = argValue('site', '').replace(/\/+$/, '');
const live = roomsUrl !== '' || siteUrl !== '';
const requestedVitePort = Number(argValue('port', 0));
const roomKind = argValue('mode', 'lan') === 'private' ? 'private' : 'lan';
const gameModeOption = argValue('game-mode', '');
const mapOption = argValue('map', '');
const phoneSeat = ['b', 'c'].includes(argValue('phone', '')) ? argValue('phone', '') : '';
const phoneViewport = { width: 844, height: 390, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
// the side-by-side measurement (MP-SINCE-0930 §7): CPU throttling on the host's page alone, or on C's (CDP rates)
const hostThrottle = Number(argValue('host-throttle', 0));
const seatThrottle = Number(argValue('seat-throttle', 0));
// the seat-pause probe (MP-SINCE-0930 plan step 9): B's main thread blocked for each duration while it drives
const seatPauses = argValue('seat-pause', '').split(',').map(Number).filter((ms) => ms > 0 && ms <= 10_000);
// --host-pause=<ms,...> (2026-10-15): the host's (A's) main thread blocked for each duration while B drives — the browser
// host relays every peer's frames to its Worker on that thread, so its stall holds B's controls from the authority
const hostPauses = argValue('host-pause', '').split(',').map(Number).filter((ms) => ms > 0 && ms <= 10_000);
// --ice=relay (plan step 1's relay-only check): every peer connection on every page is built relay-only
// (iceTransportPolicy 'relay'), so a link exists only through the TURN servers the room granted
const forceRelay = argValue('ice', '') === 'relay';
// the §7 side-by-side (2026-10-14): --shoot=<s> the host and a peer press fire for that long (shot-to-hit feedback);
// --profile=<s> a CPU profile of the host's and a peer's main thread (the MP path's frame cost); both off by default
// --dist=<dir> (2026-10-14): a built site (vite build, no VITE_ROOMS_URL) served by vite preview on 127.0.0.1, its pages
// on the room double at the LAN helper's port (8792, endpoint.ts), so join and rejoin are timed on production bundles
const distDir = argValue('dist', '') ? resolve(argValue('dist', '')) : '';
const shootS = Number(argValue('shoot', 0));
const profileS = Number(argValue('profile', 0));
// --a2-profile (2026-10-14, the 224 returning-tab Garage freeze): a CPU profile of the returning tab from its first byte to
// its Garage, saved as a2-garage.cpuprofile, with its heaviest self-time frames in report.a2Profile
// --a2-profile=entry (2026-10-15, the slow rejoin): the same profile carried on through the return's battle entry to its
// reveal, saved as a2-entry.cpuprofile, with report.a2EntryProfile: the main thread's self time per second by source area
// beside the entry trace (report.rejoin.entryTrace), so each entry stage reads with what the page was doing
const a2ProfileEntry = process.argv.includes('--a2-profile=entry');
const a2Profile = a2ProfileEntry || process.argv.includes('--a2-profile');
// --window-profile (2026-10-15): a CPU profile of every page through the measurement window (window-<label>.cpuprofile),
// and each long task over 200 ms with the source areas and frames its span sampled (report.measure.perPage.<X>.stalls)
const windowProfile = process.argv.includes('--window-profile');
// --separate-browsers (2026-10-14): each seat in its own Chrome (its own GPU process), as players on separate machines;
// the returning tab A2 opens in A's browser. The default (one browser, three contexts) shares one GPU process, whose
// contention turned the returning tab's synchronous program links into minutes (the 224 Garage freeze)
const separateBrowsers = process.argv.includes('--separate-browsers');
const extraBrowsers = [];

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

const report = { pass: false, failures: [], findings: [], errors: [], steps: [], screenshots: [], mobile, viewport:testViewport, playS, graceMs, wallMs: 0, room: null, start: {}, play: {}, migration: {}, rejoin: {}, roomEvents: [],
  options: { roomKind, gameMode: gameModeOption || null, map: mapOption || null, phoneSeat: phoneSeat || null, hostThrottle: hostThrottle || null, seatThrottle: seatThrottle || null, forceRelay, dist: distDir || null, shootS, profileS, separateBrowsers },
  roles: { swaps: [], hostAtReveal: null, elected: null }, roomLog: {}, bandwidth: null, measure: null, entry: null };
const failures = report.failures;
const step = (name, detail = {}) => { report.steps.push({ name, atMs: elapsedMs(), ...detail }); log(`${name} (${(elapsedMs() / 1000).toFixed(1)} s)${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ''}`); };
const errors = report.errors;
function observe(page, label) {
  page.on('pageerror', (error) => errors.push({ page: label, kind: 'pageerror', text: error.stack || error.message }));
  page.on('console', (message) => { if (message.type() === 'error') errors.push({ page: label, kind: 'console', text: message.text() }); });
}
// A/B retain a host-capable graphics tier; touch/viewport emulation is independent.
const BOOT_QUERY = 'nosplash=1&tier=desktop&gfxreset=1';
/** Pages driven by touch: every page with --mobile, the phone seat's with --phone. */
const touchPages = new WeakSet();
async function activate(page,selector){
  if(!mobile&&!touchPages.has(page))return page.click(selector);
  const el=await page.waitForSelector(selector,{visible:true});await el.scrollIntoView();
  const box=await el.boundingBox();
  if(!box||box.width<43.5||box.height<43.5)throw new Error(`Mobile control too small: ${selector} ${JSON.stringify(box)}`);
  if(!await el.evaluate(el=>{const r=el.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&(hit===el||el.contains(hit));}))throw new Error(`Mobile control blocked: ${selector}`);
  await el.tap();
}

/**
 * The page's own record of its room and links (2026-10-13), installed before any script: the RTCPeerConnections it makes,
 * its room client's host_changed (the room's reason), its declines and relay grants (counts and URL schemes only, never a
 * credential), its session's p2p events. window.__MP_E2E_LOG (bounded), window.__MP_E2E_PCS.
 */
function installPageRecorder(forceRelay = false) {
  if (window.__MP_E2E_LOG) return;
  const log = window.__MP_E2E_LOG = [];
  // wallMs (2026-10-14): one clock across the pages (timeOrigin + now), so a migration reads as one timeline
  const push = (entry) => { if (log.length < 600) log.push({ atMs: Math.round(performance.now()), wallMs: Math.round(performance.timeOrigin + performance.now()), ...entry }); };
  const schemes = (servers) => {
    const urls = (Array.isArray(servers) ? servers : []).flatMap((server) => [].concat(server?.urls ?? []));
    return { servers: Array.isArray(servers) ? servers.length : 0, stun: urls.filter((url) => /^stun:/i.test(url)).length, turn: urls.filter((url) => /^turns?:/i.test(url)).length };
  };
  // the side-by-side measurement's page facts: long tasks, presented frames, each data channel's message arrivals
  const longtasks = window.__MP_E2E_LONGTASKS = [];
  try {
    new PerformanceObserver((list) => { for (const entry of list.getEntries()) if (longtasks.length < 2000) longtasks.push({ start: Math.round(entry.startTime), ms: Math.round(entry.duration) }); })
      .observe({ type: 'longtask', buffered: true });
  } catch { /* no long-task timing in this browser */ }
  // (2026-10-14, the §7 side-by-side) each presented frame's interval while `track` is on (the frame cost on every page),
  // and the smoothness sampler: every other hull's presented pose frame to frame — a step well past what its own speed
  // explains is a visible snap (a first sight or a hull coming out of the fog is not: the previous frame must have shown it)
  const frames = window.__MP_E2E_FRAMES = { count: 0, track: false, deltas: [], last: null };
  // (2026-10-14, corrected) this callback runs before the game's own in the frame, so it reads the pose the PREVIOUS frame
  // presented: a step spans the interval before the last one. With irregular frames (a host's long frame then a short one)
  // the step must be judged against both intervals, or a long interval's honest motion reads as a snap in the short one.
  const smooth = window.__MP_E2E_SMOOTH = { on: false, ownId: null, frames: 0, hullFrames: 0, snaps: [], last: new Map(), prevDt: 0, lastNow: null };
  const sampleSmooth = (now) => {
    const frameDt = smooth.lastNow === null ? 0 : now - smooth.lastNow;
    const spanS = Math.max(frameDt, smooth.prevDt) / 1000;
    smooth.prevDt = frameDt;
    smooth.lastNow = now;
    const tanks = window.__DEBUG?.game?.tankById;
    if (!tanks?.forEach) return;
    smooth.frames++;
    const seen = new Set();
    tanks.forEach((entity, id) => {
      const p = entity?.state?.pos;
      if (!p || id === smooth.ownId) return;
      const shown = entity.networkVisible !== false && !entity.combat?.destroyed;
      const key = String(id);
      seen.add(key);
      const prior = smooth.last.get(key);
      if (shown && prior && prior.shown) {
        const dt = Math.max((now - prior.at) / 1000, spanS);
        const step = Math.hypot(p.x - prior.x, p.z - prior.z);
        const expected = Math.max(Math.abs(Number(entity.state.speed) || 0), prior.speed) * dt;
        smooth.hullFrames++;
        if (step > 0.3 && step > 2 * expected + 0.2 && smooth.snaps.length < 500) smooth.snaps.push({ id: key, stepM: Math.round(step * 100) / 100, expectedM: Math.round(expected * 100) / 100, dtMs: Math.round(dt * 1000) });
      }
      smooth.last.set(key, { x: p.x, z: p.z, at: now, shown, speed: Math.abs(Number(entity.state.speed) || 0) });
    });
    for (const key of smooth.last.keys()) if (!seen.has(key)) smooth.last.delete(key);
  };
  const frame = (now) => {
    frames.count++;
    if (frames.track) { if (frames.last !== null && frames.deltas.length < 20_000) frames.deltas.push(now - frames.last); frames.last = now; }
    else frames.last = null;
    if (smooth.on) { try { sampleSmooth(now); } catch { /* a page between rounds */ } }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // the shot recorder: trigger presses, the own predicted flash, the authority's own shell_fired, and every impact
  // (shell:hit, shell:expired) with its shooter, on the page's clock (2026-10-14, shot-to-hit feedback)
  const shots = window.__MP_E2E_SHOTS = { presses: [], predicted: [], fired: [], impacts: [] };
  window.addEventListener('mousedown', (event) => { if (event.button === 0 && shots.presses.length < 500) shots.presses.push(performance.now()); }, true);
  let shotBus = null;
  setInterval(() => {
    const bus = window.__DEBUG?.bus;
    if (!bus?.on || bus === shotBus) return;
    shotBus = bus;
    const v3 = (value) => (Array.isArray(value) && value.length >= 3 ? [Number(value[0]), Number(value[1]), Number(value[2])] : null);
    bus.on('weapon:predicted', (p) => { if (shots.predicted.length < 500) shots.predicted.push({ at: performance.now(), seq: p?.fireIntentSeq ?? null, shooterId: p?.shooterId ?? null }); });
    bus.on('shell:fired', (p) => { if (p?.isPlayer && shots.fired.length < 500) shots.fired.push({ at: performance.now(), shellId: p.shellId ?? null, seq: p.fireIntentSeq ?? null, predicted: !!p.feedbackPredicted, velocityMps: Number(p.velocityMps) || null, muzzle: v3(p.muzzlePos), shooterId: p.shooterId ?? null }); });
    const impact = (kind) => (p) => { if (shots.impacts.length < 2000) shots.impacts.push({ at: performance.now(), kind, shellId: p?.shellId ?? null, shooterId: p?.shooterId ?? p?.attackerId ?? null, pos: v3(p?.pos) ?? (Number.isFinite(p?.x) ? [Number(p.x), Number(p.y), Number(p.z)] : null) }); };
    bus.on('shell:hit', impact('hit'));
    bus.on('shell:expired', impact('expired'));
  }, 100);
  const arrivals = window.__MP_E2E_ARRIVALS = {};
  // (2026-10-15) the received bytes by message: a snapshot keyframe or delta (its flags byte), else the wire type
  const wireIn = window.__MP_E2E_WIRE = {};
  const watchChannel = (channel) => {
    if (!channel || channel.__mpE2e) return;
    channel.__mpE2e = true;
    channel.addEventListener('message', (event) => {
      const bytes = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : null;
      if (bytes && bytes.length > 10) {
        const key = bytes[1] === 17 ? ((bytes[10] & 1) ? 'keyframe' : 'delta') : `type${bytes[1]}`;
        const tally = wireIn[key] ??= { n: 0, bytes: 0 };
        tally.n++; tally.bytes += bytes.length;
      }
      const now = performance.now();
      const row = arrivals[channel.label] ??= { count: 0, last: null, gaps: [] };
      if (row.last !== null && row.gaps.length < 20_000) row.gaps.push(now - row.last);
      row.last = now;
      row.count++;
    });
  };
  const Native = window.RTCPeerConnection;
  if (typeof Native === 'function') {
    const pcs = window.__MP_E2E_PCS = [];
    const Recorded = function RTCPeerConnection(configuration, ...rest) {
      if (forceRelay) configuration = { ...(configuration ?? {}), iceTransportPolicy: 'relay' };
      const pc = new Native(configuration, ...rest);
      pcs.push(pc);
      pc.addEventListener('datachannel', (event) => watchChannel(event.channel));
      const create = pc.createDataChannel.bind(pc);
      pc.createDataChannel = (...args) => { const channel = create(...args); watchChannel(channel); return channel; };
      push({ kind: 'pc', index: pcs.length - 1, ...schemes(configuration?.iceServers), relayOnly: configuration?.iceTransportPolicy === 'relay' });
      return pc;
    };
    Recorded.prototype = Native.prototype;
    Object.setPrototypeOf(Recorded, Native);
    window.RTCPeerConnection = Recorded;
  }
  let room = null;
  let session = null;
  setInterval(() => {
    const v2 = window.__MULTIPLAYER_V2;
    const client = v2?.room?.client ?? null;
    if (client && client !== room) {
      room = client;
      push({ kind: 'room', playerId: client.playerId ?? null });
      client.onHostChanged?.((change) => push({ kind: 'host_changed', hostId: change?.hostId ?? null, generation: change?.generation ?? null, reason: change?.reason ?? null, resumeTick: change?.resumeTick ?? null }));
      if (typeof client.declineHost === 'function') {
        const decline = client.declineHost.bind(client);
        client.declineHost = (declined, options) => { push({ kind: 'decline', declined: !!declined, unable: !!options?.unable }); return decline(declined, options); };
      }
      if (typeof client.requestRelay === 'function') {
        const request = client.requestRelay.bind(client);
        client.requestRelay = async () => {
          try { const grant = await request(); push({ kind: 'relay', ...schemes(grant?.iceServers), relay: grant?.relay === true, expiresInSeconds: grant?.expiresInSeconds ?? null }); return grant; }
          catch (error) { push({ kind: 'relay', error: typeof error?.code === 'string' ? error.code : 'error' }); throw error; }
        };
      }
    }
    const owner = v2?.session ?? null;
    if (owner && owner !== session && typeof owner.onP2p === 'function') {
      session = owner;
      owner.onP2p((event) => push({ kind: 'p2p', event: event?.kind ?? null, role: event?.role ?? null, phase: event?.phase ?? null, hostId: event?.hostId ?? null, generation: event?.generation ?? null, detail: event?.detail ?? null }));
    }
  }, 100);
}
/** The page's record so far (a closing page is read first). */
async function collectRoomLog(label, page) {
  const entries = await page.evaluate(() => (window.__MP_E2E_LOG ?? []).slice()).catch(() => null);
  if (entries) report.roomLog[label] = entries;
  return entries ?? report.roomLog[label] ?? [];
}
/** getStats per peer connection: each data channel's bytes, the selected pair's bytes, RTT and candidate types. */
const linkStats = (page) => page.evaluate(async () => {
  const out = [];
  for (const [index, pc] of (window.__MP_E2E_PCS ?? []).entries()) {
    if (pc.connectionState === 'closed') continue;
    const report = await pc.getStats().catch(() => null);
    if (!report) continue;
    const channels = [];
    const candidates = new Map();
    let pair = null;
    report.forEach((entry) => {
      if (entry.type === 'data-channel') channels.push({ label: entry.label, bytesSent: entry.bytesSent ?? 0, bytesReceived: entry.bytesReceived ?? 0, messagesSent: entry.messagesSent ?? 0, messagesReceived: entry.messagesReceived ?? 0 });
      if (entry.type === 'local-candidate' || entry.type === 'remote-candidate') candidates.set(entry.id, entry);
      if (entry.type === 'candidate-pair' && entry.state === 'succeeded' && (entry.nominated || !pair)) pair = entry;
    });
    out.push({ index, state: pc.connectionState, channels, pair: pair ? {
      bytesSent: pair.bytesSent ?? 0, bytesReceived: pair.bytesReceived ?? 0,
      rttMs: Number.isFinite(pair.currentRoundTripTime) ? Math.round(pair.currentRoundTripTime * 1000) : null,
      local: candidates.get(pair.localCandidateId)?.candidateType ?? null, remote: candidates.get(pair.remoteCandidateId)?.candidateType ?? null,
      protocol: candidates.get(pair.localCandidateId)?.protocol ?? null,
    } : null });
  }
  return { atMs: Math.round(performance.now()), links: out };
}).catch(() => null);
/** kbit/s per page and channel label between two linkStats samples (links matched by index). */
function bandwidthBetween(before, after) {
  if (!before || !after) return null;
  const seconds = Math.max(0.001, (after.atMs - before.atMs) / 1000);
  const kbps = (bytes) => Math.round((bytes * 8 / 1000 / seconds) * 10) / 10;
  const channels = {};
  let up = 0, down = 0;
  for (const link of after.links) {
    const prior = before.links.find((entry) => entry.index === link.index);
    for (const channel of link.channels) {
      const was = prior?.channels.find((entry) => entry.label === channel.label);
      const sent = channel.bytesSent - (was?.bytesSent ?? 0), received = channel.bytesReceived - (was?.bytesReceived ?? 0);
      const row = channels[channel.label] ??= { upKbps: 0, downKbps: 0, sentBytes: 0, receivedBytes: 0 };
      row.sentBytes += sent; row.receivedBytes += received;
      up += sent; down += received;
    }
  }
  for (const row of Object.values(channels)) { row.upKbps = kbps(row.sentBytes); row.downKbps = kbps(row.receivedBytes); }
  return { seconds: Math.round(seconds * 10) / 10, upKbps: kbps(up), downKbps: kbps(down), channels,
    pairs: after.links.map((link) => ({ index: link.index, state: link.state, ...(link.pair ?? {}) })) };
}

/** A page's counters at a point in time (frames, input ticks, snapshots), arrivals and long tasks reset for the window. */
const pageCounters = (page, reset) => page.evaluate((resetArrivals) => {
  const m = window.__MULTIPLAYER_V2?.stats?.().session?.match ?? null;
  const out = {
    atMs: performance.now(), wallMs: performance.timeOrigin + performance.now(), frames: window.__MP_E2E_FRAMES?.count ?? null,
    sampledTicks: m?.sampledTicks ?? null, skippedTicks: m?.skippedTicks ?? null, snapshots: m?.snapshotsAccepted ?? null, arrivalJitterMs: m?.arrivalJitterMs ?? null,
    rttMs: m?.rttMs ?? null, interpolationDelayMs: m?.interpolationDelayMs ?? null, snappedSamples: m?.snappedSamples ?? null, extrapolatedSamples: m?.extrapolatedSamples ?? null,
    maxExtrapolatedMs: m?.maxExtrapolatedMs ?? null, inputAckLagTicks: m?.inputAckLagTicks ?? null, ownShotsPredicted: m?.ownShotsPredicted ?? null, ownShotsConfirmed: m?.ownShotsConfirmed ?? null,
    predictor: (m?.prediction ?? m?.predictorStats) ? (({ reconciliations, hardSnaps, maxPositionErrorM, lastPositionErrorM, heldTicks, stallTicks, maxCorrectionStepM, maxFreePositionErrorM, maxContactPositionErrorM }) => ({ reconciliations, hardSnaps, maxPositionErrorM, lastPositionErrorM, heldTicks, stallTicks, maxCorrectionStepM, maxFreePositionErrorM, maxContactPositionErrorM }))(m.prediction ?? m.predictorStats) : null,
    arrivals: Object.fromEntries(Object.entries(window.__MP_E2E_ARRIVALS ?? {}).map(([label, row]) => [label, { count: row.count, gaps: row.gaps.slice() }])),
    longtasks: (window.__MP_E2E_LONGTASKS ?? []).slice(),
    // (2026-10-15) the round's world and combat events by kind (a crush, a fall, a shot), to read a stall beside them
    events: window.__MULTIPLAYER_V2?.stats?.()?.round?.events ?? null,
    // (2026-10-15) the downlink's makeup: bytes and frames in, keyframes, keyframe requests and missing baselines
    wireIn: JSON.parse(JSON.stringify(window.__MP_E2E_WIRE ?? {})),
    wire: m ? { bytesIn: m.bytesIn ?? null, framesIn: m.framesIn ?? null, keyframes: m.keyframes ?? null, keyframeRequests: m.keyframeRequests ?? null, missingBaselines: m.missingBaselines ?? null } : null,
  };
  if (resetArrivals) for (const row of Object.values(window.__MP_E2E_ARRIVALS ?? {})) row.gaps.length = 0;
  return out;
}, reset).catch(() => null);
/** Every hull this page shows, at one wall time (the §13.12 divergence sampler, re-made 2026-10-13). */
const hullsOf = (page) => page.evaluate(() => {
  const tanks = window.__DEBUG?.game?.tankById;
  // (2026-10-15) the own hull's worst misprediction so far, so the window shows when it rose
  const out = { wallMs: performance.timeOrigin + performance.now(), hulls: {}, predMaxM: window.__MULTIPLAYER_V2?.stats?.()?.session?.match?.prediction?.maxPositionErrorM ?? null };
  if (tanks?.forEach) tanks.forEach((entity, id) => { const p = entity?.state?.pos; if (p) out.hulls[id] = [p.x, p.z, Math.abs(Number(entity.state.speed) || 0), entity.networkVisible !== false && !entity.combat?.destroyed]; });
  return out;
}).catch(() => null);
const percentile = (values, q) => { if (!values.length) return null; const sorted = [...values].sort((x, y) => x - y); return sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1) + 0.5))]; };
const round1 = (value) => (value === null || value === undefined ? null : Math.round(value * 10) / 10);
/**
 * The side-by-side measurement window (MP-SINCE-0930 §7): every 500 ms each page's hulls, then per page the presented
 * fps, the share of input ticks skipped, snapshot and channel inter-arrival (p50/p95/max), long tasks; and the hull
 * divergence between pages for hulls shown on both (moving > 1 m/s, and at rest).
 */
/** The frame and smoothness trackers on (with the page's own hull excluded) or off: off returns what they gathered. */
const trackFrames = (page, on, ownId = null) => page.evaluate((enable, own) => {
  const frames = window.__MP_E2E_FRAMES, smooth = window.__MP_E2E_SMOOTH;
  if (!frames || !smooth) return null;
  if (enable) {
    frames.deltas = []; frames.last = null; frames.track = true;
    smooth.snaps = []; smooth.last = new Map(); smooth.frames = 0; smooth.hullFrames = 0; smooth.ownId = own; smooth.prevDt = 0; smooth.lastNow = null; smooth.on = true;
    return null;
  }
  frames.track = false; smooth.on = false;
  return { deltas: frames.deltas.slice(), smooth: { frames: smooth.frames, hullFrames: smooth.hullFrames, snaps: smooth.snaps.slice() } };
}, on, ownId).catch(() => null);
/** CDP Performance metrics (main-thread task, script, layout, style seconds) for a page; the domain stays enabled. */
const cdpSessions = new WeakMap();
async function mainThreadMetrics(page) {
  try {
    let session = cdpSessions.get(page);
    if (!session) { session = await page.createCDPSession(); await session.send('Performance.enable'); cdpSessions.set(page, session); }
    const { metrics } = await session.send('Performance.getMetrics');
    return Object.fromEntries(metrics.filter((row) => ['Timestamp', 'TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskOtherDuration'].includes(row.name)).map((row) => [row.name, row.value]));
  } catch { return null; }
}
async function measureWindow(labels, seconds) {
  const cpuStart = Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await mainThreadMetrics(pages[label])])));
  await Promise.all(labels.map((label) => trackFrames(pages[label], true, ids[label])));
  const profilers = {};
  if (windowProfile) {
    for (const label of labels) {
      try {
        const session = await pages[label].createCDPSession();
        await session.send('Profiler.enable');
        await session.send('Profiler.setSamplingInterval', { interval: 1000 });
        await session.send('Profiler.start');
        profilers[label] = session;
      } catch { profilers[label] = null; }
    }
  }
  const start = Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await pageCounters(pages[label], true)])));
  const samples = [];
  const until = performance.now() + seconds * 1000;
  while (performance.now() < until) {
    samples.push(Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await hullsOf(pages[label])]))));
    await sleep(500);
  }
  const end = Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await pageCounters(pages[label], false)])));
  const tracked = Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await trackFrames(pages[label], false)])));
  const cpuEnd = Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await mainThreadMetrics(pages[label])])));
  const stallsOf = {};
  for (const label of labels) {
    const session = profilers[label];
    if (!session) continue;
    const profile = await session.send('Profiler.stop').then((result) => result.profile).catch(() => null);
    await session.detach().catch(() => {});
    if (!profile) continue;
    await writeFile(join(outputDir, `window-${label.toUpperCase()}.cpuprofile`), JSON.stringify(profile)).catch(() => {});
    stallsOf[label] = profileStalls(profile, 200);
  }
  const perPage = {};
  for (const label of labels) {
    const a = start[label], b = end[label];
    if (!a || !b) { perPage[label.toUpperCase()] = null; continue; }
    const windowS = (b.atMs - a.atMs) / 1000;
    const sampled = (b.sampledTicks ?? 0) - (a.sampledTicks ?? 0), skipped = (b.skippedTicks ?? 0) - (a.skippedTicks ?? 0);
    const tasks = b.longtasks.filter((task) => task.start >= a.atMs);
    perPage[label.toUpperCase()] = {
      fps: b.frames !== null && a.frames !== null ? round1((b.frames - a.frames) / windowS) : null,
      skippedTickPct: sampled + skipped > 0 ? round1(100 * skipped / (sampled + skipped)) : null,
      snapshotHz: b.snapshots !== null && a.snapshots !== null ? round1((b.snapshots - a.snapshots) / windowS) : null,
      arrivalJitterMs: round1(b.arrivalJitterMs),
      channels: Object.fromEntries(Object.entries(b.arrivals).map(([name, row]) => [name, { messages: row.count - (a.arrivals[name]?.count ?? 0),
        gapP50Ms: round1(percentile(row.gaps, 0.5)), gapP95Ms: round1(percentile(row.gaps, 0.95)), gapMaxMs: round1(row.gaps.length ? Math.max(...row.gaps) : null) }])),
      longtasks: { count: tasks.length, over200: tasks.filter((task) => task.ms >= 200).length, maxMs: tasks.length ? Math.max(...tasks.map((task) => task.ms)) : 0,
        totalMs: tasks.reduce((sum, task) => sum + task.ms, 0),
        // (2026-10-15) each one over 200 ms by its start in the window, to read beside the other pages' and the events
        over200At: tasks.filter((task) => task.ms >= 200).map((task) => ({ atMs: Math.round(task.start - a.atMs), ms: task.ms })) },
      wire: a.wire && b.wire ? (() => { const d = (key) => (b.wire[key] ?? 0) - (a.wire[key] ?? 0); const snaps = (b.snapshots ?? 0) - (a.snapshots ?? 0);
        return { bytesInPerS: round1(d('bytesIn') / windowS), framesIn: d('framesIn'), snapshots: snaps, bytesPerFrame: d('framesIn') ? round1(d('bytesIn') / d('framesIn')) : null,
          keyframes: d('keyframes'), keyframeRequests: d('keyframeRequests'), missingBaselines: d('missingBaselines'),
          byMessage: Object.fromEntries(Object.entries(b.wireIn ?? {}).map(([key, row]) => { const n = row.n - (a.wireIn?.[key]?.n ?? 0), bytes = row.bytes - (a.wireIn?.[key]?.bytes ?? 0);
            return [key, { n, bytesPerMsg: n ? round1(bytes / n) : null, bytesPerS: round1(bytes / windowS) }]; }).filter(([, row]) => row.n > 0)) }; })() : null,
      events: b.events ? Object.fromEntries(Object.entries(b.events).map(([kind, count]) => [kind, count - (a.events?.[kind] ?? 0)]).filter(([, count]) => count > 0)) : null,
      ...(stallsOf[label] ? { stalls: stallsOf[label] } : {}),
      // the own hull's prediction over the window: corrections, hard snaps, the worst misprediction so far (metres)
      prediction: a.predictor && b.predictor ? { reconciliations: b.predictor.reconciliations - a.predictor.reconciliations, hardSnaps: b.predictor.hardSnaps - a.predictor.hardSnaps,
        maxPositionErrorM: round1(b.predictor.maxPositionErrorM), maxRoseInWindow: b.predictor.maxPositionErrorM > a.predictor.maxPositionErrorM,
        maxFreeM: round1(b.predictor.maxFreePositionErrorM), maxContactM: round1(b.predictor.maxContactPositionErrorM), maxCorrectionStepM: round1(b.predictor.maxCorrectionStepM),
        heldTicks: (b.predictor.heldTicks ?? 0) - (a.predictor.heldTicks ?? 0), stallTicks: (b.predictor.stallTicks ?? 0) - (a.predictor.stallTicks ?? 0),
        // the window time each rise of the worst misprediction was first sampled (ms from the window's start)
        rises: samples.reduce((rows, sample) => { const v = sample[label]?.predMaxM; const last = rows.length ? rows[rows.length - 1].m : a.predictor.maxPositionErrorM; if (typeof v === 'number' && v > last + 0.05) rows.push({ atMs: Math.round(sample[label].wallMs - a.wallMs), m: round1(v) }); return rows; }, []) } : null,
      // (2026-10-14) the link and the interpolator as the client reads them, the presented frame intervals, the other hulls'
      // visible snaps (the smoothness sampler) and the main thread's busy time per second (CDP Performance)
      link: { rttMs: round1(b.rttMs), interpolationDelayMs: round1(b.interpolationDelayMs), inputAckLagTicks: b.inputAckLagTicks,
        snappedSamples: b.snappedSamples !== null && a.snappedSamples !== null ? b.snappedSamples - a.snappedSamples : null,
        extrapolatedSamples: b.extrapolatedSamples !== null && a.extrapolatedSamples !== null ? b.extrapolatedSamples - a.extrapolatedSamples : null, maxExtrapolatedMs: round1(b.maxExtrapolatedMs) },
      frameMs: tracked[label]?.deltas?.length ? { n: tracked[label].deltas.length, p50: round1(percentile(tracked[label].deltas, 0.5)), p95: round1(percentile(tracked[label].deltas, 0.95)),
        p99: round1(percentile(tracked[label].deltas, 0.99)), max: round1(Math.max(...tracked[label].deltas)), over50: tracked[label].deltas.filter((ms) => ms > 50).length, over100: tracked[label].deltas.filter((ms) => ms > 100).length } : null,
      remoteSmoothness: tracked[label]?.smooth ? { frames: tracked[label].smooth.frames, hullFrames: tracked[label].smooth.hullFrames, snaps: tracked[label].smooth.snaps.length,
        snapsPer1kHullFrames: tracked[label].smooth.hullFrames ? round1(1000 * tracked[label].smooth.snaps.length / tracked[label].smooth.hullFrames) : null,
        maxSnapM: tracked[label].smooth.snaps.length ? Math.max(...tracked[label].smooth.snaps.map((row) => row.stepM)) : 0, worst: [...tracked[label].smooth.snaps].sort((x, y) => y.stepM - x.stepM).slice(0, 5) } : null,
      mainThread: cpuStart[label] && cpuEnd[label] ? (() => { const s = Math.max(0.001, cpuEnd[label].Timestamp - cpuStart[label].Timestamp); const per = (name) => round1(1000 * (cpuEnd[label][name] - cpuStart[label][name]) / s);
        return { taskMsPerS: per('TaskDuration'), scriptMsPerS: per('ScriptDuration'), layoutMsPerS: per('LayoutDuration'), styleMsPerS: per('RecalcStyleDuration') }; })() : null,
    };
  }
  const moving = [], rest = [], skew = [], movingCorrected = [], movingLagMs = [];
  for (const sample of samples) {
    const views = labels.map((label) => sample[label]).filter(Boolean);
    if (views.length < 2) continue;
    skew.push(Math.max(...views.map((view) => view.wallMs)) - Math.min(...views.map((view) => view.wallMs)));
    const ids = new Set(views.flatMap((view) => Object.keys(view.hulls)));
    for (const id of ids) {
      const shown = views.map((view) => (view.hulls[id] ? [...view.hulls[id], view.wallMs] : null)).filter((hull) => hull && hull[3]);
      if (shown.length < 2) continue;
      let worst = 0, worstCorrected = 0;
      for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) {
        const d = Math.hypot(shown[i][0] - shown[j][0], shown[i][1] - shown[j][1]);
        worst = Math.max(worst, d);
        // (2026-10-15) less what the two pages' sampling times explain at the hull's own speed (the pages are read in
        // parallel but not at one instant: their skew reached 1 s on a loaded run)
        worstCorrected = Math.max(worstCorrected, Math.max(0, d - Math.max(shown[i][2], shown[j][2]) * Math.abs(shown[i][4] - shown[j][4]) / 1000));
      }
      const isMoving = Math.max(...shown.map((hull) => hull[2])) > 1;
      (isMoving ? moving : rest).push(worst);
      if (isMoving) movingCorrected.push(worstCorrected);
      // (2026-10-15) the same error as time at the hull's speed: comparable across runs whose hulls drove at other speeds
      if (isMoving) movingLagMs.push(1000 * worstCorrected / Math.max(...shown.map((hull) => hull[2])));
    }
  }
  const summary = (values) => ({ n: values.length, p50: round1(percentile(values, 0.5)), p95: round1(percentile(values, 0.95)), max: round1(values.length ? Math.max(...values) : null) });
  return { windowS: seconds, samples: samples.length, wallSkewMs: summary(skew), divergence: { moving: summary(moving), rest: summary(rest), movingSkewCorrected: summary(movingCorrected), movingLagMs: summary(movingLagMs) }, perPage };
}
/** A point on the page's battle canvas (the largest canvas, where a click lands on the canvas itself), or null. */
const canvasPoint = (page) => page.evaluate(() => {
  const canvases = [...document.querySelectorAll('canvas')].map((el) => ({ el, r: el.getBoundingClientRect() })).sort((x, y) => y.r.width * y.r.height - x.r.width * x.r.height);
  const main = canvases[0];
  if (!main) return null;
  for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.4], [0.4, 0.5], [0.6, 0.45], [0.5, 0.3], [0.3, 0.35]]) {
    const x = Math.round(main.r.x + main.r.width * fx), y = Math.round(main.r.y + main.r.height * fy);
    if (document.elementFromPoint(x, y) === main.el) return { x, y };
  }
  return null;
}).catch(() => null);
const summarize = (values) => { const v = values.filter((x) => Number.isFinite(x)); return { n: v.length, p50: round1(percentile(v, 0.5)), p95: round1(percentile(v, 0.95)), max: round1(v.length ? Math.max(...v) : null) }; };
/**
 * The shot phase: each page presses fire on its canvas about once a second for `seconds` (staggered), then its own record
 * is paired: press → predicted flash (`weapon:predicted`), press → the authority's own `shell_fired`, press → the round's
 * impact (`shell:hit` / `shell:expired`), and that minus the ballistic flight (muzzle to impact over the muzzle velocity).
 */
async function shootPhase(byLabel, seconds) {
  const labels = Object.keys(byLabel).filter((label) => byLabel[label]);
  const points = Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await canvasPoint(byLabel[label])])));
  await Promise.all(labels.map((label) => byLabel[label].evaluate(() => { const s = window.__MP_E2E_SHOTS; if (s) { s.presses.length = 0; s.predicted.length = 0; s.fired.length = 0; s.impacts.length = 0; } }).catch(() => {})));
  const until = performance.now() + seconds * 1000;
  let turn = 0;
  while (performance.now() < until) {
    const label = labels[turn++ % labels.length];
    const point = points[label];
    if (point) await byLabel[label].mouse.click(point.x, point.y, { delay: 40 }).catch(() => {});
    await sleep(Math.round(1000 / labels.length));
  }
  await sleep(3000);
  const out = {};
  for (const label of labels) {
    const own = ids[label];
    const rec = await byLabel[label].evaluate(() => { const s = window.__MP_E2E_SHOTS; return s ? JSON.parse(JSON.stringify(s)) : null; }).catch(() => null);
    if (!rec) { out[label.toUpperCase()] = null; continue; }
    const presses = rec.presses.slice().sort((x, y) => x - y);
    const pressBefore = (at, windowMs) => { let found = null; for (const press of presses) { if (press <= at && at - press <= windowMs) found = press; } return found; };
    const flash = rec.predicted.filter((row) => !row.shooterId || row.shooterId === own).map((row) => ({ ...row, press: pressBefore(row.at, 1000) }));
    const rows = rec.fired.filter((row) => !row.shooterId || row.shooterId === own).map((row) => {
      const predicted = row.seq !== null ? flash.find((entry) => entry.seq === row.seq && entry.press !== null) : null;
      const press = predicted?.press ?? pressBefore(row.at, 3000);
      const impact = rec.impacts.find((entry) => entry.shellId !== null && entry.shellId === row.shellId) ?? null;
      const distM = impact?.pos && row.muzzle ? Math.hypot(impact.pos[0] - row.muzzle[0], impact.pos[1] - row.muzzle[1], impact.pos[2] - row.muzzle[2]) : null;
      const flightMs = distM !== null && row.velocityMps ? 1000 * distM / row.velocityMps : null;
      return { press, flashMs: predicted ? round1(predicted.at - predicted.press) : null, confirmMs: press !== null ? round1(row.at - press) : null, predicted: row.predicted,
        impactKind: impact?.kind ?? null, impactMs: press !== null && impact ? round1(impact.at - press) : null, distM: round1(distM), flightMs: round1(flightMs),
        hitFeedbackMs: press !== null && impact && flightMs !== null ? round1(impact.at - press - flightMs) : null };
    });
    out[label.toUpperCase()] = { canvas: points[label], presses: presses.length, flashes: flash.length, rows,
      summary: { presses: presses.length, shots: rows.length, flashMs: summarize(flash.filter((row) => row.press !== null).map((row) => row.at - row.press)),
        confirmMs: summarize(rows.map((row) => row.confirmMs)), impactMs: summarize(rows.map((row) => row.impactMs)), hitFeedbackMs: summarize(rows.map((row) => row.hitFeedbackMs)) } };
  }
  return out;
}
/** The source area a profiled frame belongs to (dev-server URLs name the file; a built chunk reads as `bundle`). */
function sourceArea(callFrame) {
  const fn = callFrame.functionName, url = callFrame.url || '';
  if (fn === '(idle)') return 'idle';
  if (fn === '(program)') return 'program';
  if (fn === '(garbage collector)') return 'gc';
  // a built site: the multiplayer client (composition, session, match client, presentation, transports) is its own chunks
  if (/\/assets\/(browserComposition|browserHostPort|roomInvite)-[\w-]+\.js/.test(url)) return 'mp';
  for (const [area, needle] of [['mp', '/src/mp/'], ['sim', '/src/sim/'], ['server', '/server/'], ['engine', '/src/engine/'], ['world', '/src/world/'], ['fx', '/src/fx/'],
    ['game', '/src/game/'], ['ui', '/src/ui/'], ['audio', '/src/audio/'], ['vehicles', '/src/vehicles/'], ['three', 'three'], ['src', '/src/']]) if (url.includes(needle)) return area;
  return url ? 'bundle' : 'native';
}
/** A built chunk's name without its hash ('/assets/battleHud-a1b2c3d4.js' → 'battleHud'), a dev-server file's path, or the native frame. */
function chunkOf(callFrame) {
  const url = (callFrame.url || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '');
  if (!url) return callFrame.functionName || 'native';
  const built = /\/assets\/(.+?)-[\w-]{6,}\.js$/.exec(url);
  return built ? built[1] : url.replace(/^\/(src\/)?/, '');
}
/** One frame's label: its function, its chunk or file and line (minified names read with their chunk). */
const frameLabel = (callFrame) => `${callFrame.functionName || '(anon)'} ${chunkOf(callFrame)}:${callFrame.lineNumber + 1}`;
/** The self time of a profile's samples from `fromMs` to `toMs` (profile-relative), by chunk and by frame (with two callers). */
function profileSpan(profile, fromMs = 0, toMs = Infinity) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentOf = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id);
  const chunks = new Map(), frames = new Map();
  let at = 0, idleMs = 0, busyMs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    at += (profile.timeDeltas[i] ?? 0) / 1000;
    if (at < fromMs || at > toMs) continue;
    const ms = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    const node = byId.get(profile.samples[i]);
    if (!node) continue;
    if (node.callFrame.functionName === '(idle)') { idleMs += ms; continue; }
    busyMs += ms;
    const chunk = chunkOf(node.callFrame);
    chunks.set(chunk, (chunks.get(chunk) ?? 0) + ms);
    const chain = [frameLabel(node.callFrame)];
    let up = parentOf.get(node.id);
    for (let depth = 0; depth < 2 && up !== undefined; depth++) { chain.push(frameLabel(byId.get(up).callFrame)); up = parentOf.get(up); }
    const key = chain.join(' < ');
    frames.set(key, (frames.get(key) ?? 0) + ms);
  }
  const top = (map, n) => [...map].sort((x, y) => y[1] - x[1]).slice(0, n).map(([name, ms]) => ({ name, ms: Math.round(ms) }));
  return { busyMs: Math.round(busyMs), idleMs: Math.round(idleMs), chunks: top(chunks, 6), frames: top(frames, 6) };
}
/** The profile's busy stretches over `overMs` (consecutive non-idle samples, a gap of 50 ms ends one), each with what it ran. */
function profileStalls(profile, overMs = 200) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const stretches = [];
  let at = 0, current = null;
  for (let i = 0; i < profile.samples.length; i++) {
    at += (profile.timeDeltas[i] ?? 0) / 1000;
    const idle = byId.get(profile.samples[i])?.callFrame.functionName === '(idle)';
    if (idle || (current && at - current.end > 50)) { if (current) stretches.push(current); current = null; }
    if (idle) continue;
    if (!current) current = { start: at, end: at };
    current.end = at;
  }
  if (current) stretches.push(current);
  return stretches.filter((row) => row.end - row.start >= overMs).map((row) => ({ atMs: Math.round(row.start), ms: Math.round(row.end - row.start), ...profileSpan(profile, row.start, row.end) }));
}
/** A CPU profile of each page's main thread for `seconds` (0.5 ms sampling): self time per source area, per second and per frame. */
async function profilePhase(byLabel, seconds) {
  const labels = Object.keys(byLabel).filter((label) => byLabel[label]);
  const sessions = {};
  const framesAt = {};
  for (const label of labels) {
    try {
      const session = await byLabel[label].createCDPSession();
      await session.send('Profiler.enable');
      await session.send('Profiler.setSamplingInterval', { interval: 500 });
      sessions[label] = session;
    } catch { sessions[label] = null; }
  }
  for (const label of labels) framesAt[label] = await byLabel[label].evaluate(() => window.__MP_E2E_FRAMES?.count ?? null).catch(() => null);
  await Promise.all(labels.map((label) => sessions[label]?.send('Profiler.start').catch(() => {})));
  await sleep(seconds * 1000);
  const profiles = Object.fromEntries(await Promise.all(labels.map(async (label) => [label, await sessions[label]?.send('Profiler.stop').then((result) => result.profile).catch(() => null)])));
  const out = {};
  for (const label of labels) {
    const frames = await byLabel[label].evaluate(() => window.__MP_E2E_FRAMES?.count ?? null).catch(() => null);
    const profile = profiles[label];
    await sessions[label]?.detach().catch(() => {});
    if (!profile) { out[label] = null; continue; }
    const byId = new Map(profile.nodes.map((node) => [node.id, node]));
    const areaOf = new Map(profile.nodes.map((node) => [node.id, sourceArea(node.callFrame)]));
    const fileOf = new Map(profile.nodes.map((node) => [node.id, (node.callFrame.url || node.callFrame.functionName || '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')]));
    const byArea = {}, byFile = {};
    for (let i = 0; i < profile.samples.length; i++) {
      const ms = (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i] ?? 0) / 1000;
      const area = areaOf.get(profile.samples[i]) ?? 'native';
      byArea[area] = (byArea[area] ?? 0) + ms;
      if (area === 'mp' || area === 'sim' || area === 'server') {
        const node = byId.get(profile.samples[i]);
        const file = `${fileOf.get(profile.samples[i])}${node && /\/assets\//.test(node.callFrame.url) ? ` ${node.callFrame.functionName || '(anon)'}` : ''}`;
        byFile[file] = (byFile[file] ?? 0) + ms;
      }
    }
    const spanS = Math.max(0.001, (profile.endTime - profile.startTime) / 1e6);
    const frameCount = frames !== null && framesAt[label] !== null ? frames - framesAt[label] : null;
    const busy = Object.entries(byArea).filter(([area]) => area !== 'idle').reduce((sum, [, ms]) => sum + ms, 0);
    out[label] = { seconds: round1(spanS), frames: frameCount, fps: frameCount !== null ? round1(frameCount / spanS) : null,
      busyMsPerS: round1(busy / spanS), msPerFrame: frameCount ? round1(busy / frameCount) : null,
      areas: Object.fromEntries(Object.entries(byArea).sort((x, y) => y[1] - x[1]).map(([area, ms]) => [area, { msPerS: round1(ms / spanS), msPerFrame: frameCount ? Math.round(100 * ms / frameCount) / 100 : null }])),
      topMpFiles: Object.entries(byFile).sort((x, y) => y[1] - x[1]).slice(0, 12).map(([file, ms]) => ({ file, msPerS: round1(ms / spanS) })) };
  }
  return out;
}
/** CDP CPU throttling on one page (1 = off). */
async function throttle(page, rate) {
  const session = await page.createCDPSession();
  await session.send('Emulation.setCPUThrottlingRate', { rate: Math.max(1, rate) });
  return session;
}

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
    if (entryFailure) {
      const trace = await page.evaluate(() => ({ stages: window.__NETWORK_LOAD?.stages ?? null, status: window.__NETWORK_LOAD?.status ?? null, totalMs: window.__NETWORK_LOAD?.totalMs ?? null })).catch(() => null);
      throw new Error(`${label}: the entry pipeline failed on ${options.entryOf}: ${entryFailure.text}; load trace ${JSON.stringify(trace)}`);
    }
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
    other: pos ? { x: pos.x, z: pos.z, speed: Number(entity?.state?.speed) || 0, visible: !!entity?.networkVisible } : null,
    snapshots: v2?.session?.match?.snapshotsAccepted ?? 0, matchPhase: v2?.session?.match?.phase ?? null, p2p: v2?.session?.p2p ?? null, migrations: v2?.session?.migrations ?? 0,
  };
}, otherId);

async function joinAsAlly(page, label, invite) {
  // the phone seat loads the mobile tier (it never hosts); every other seat keeps the host-capable desktop tier
  const url = new URL(invite.href);
  if (label.toLowerCase() === phoneSeat) url.searchParams.set('tier', 'mobile');
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: 180_000 });
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
const contexts = { a: null, b: null, c: null };
const ids = { a: null, b: null, c: null };
/**
 * Role-agnostic labels (2026-10-13): swap two seats' pages, contexts and ids so the labels name the roles the run
 * checks (A the host at the reveal, B the seat elected when A leaves). Recorded in report.roles.swaps.
 */
function swapSeats(x, y, why) {
  [pages[x], pages[y]] = [pages[y], pages[x]];
  [contexts[x], contexts[y]] = [contexts[y], contexts[x]];
  [ids[x], ids[y]] = [ids[y], ids[x]];
  [report.roomLog[x.toUpperCase()], report.roomLog[y.toUpperCase()]] = [report.roomLog[y.toUpperCase()], report.roomLog[x.toUpperCase()]];
  contextA = contexts.a;
  report.roles.swaps.push({ seats: [x, y], why, atMs: elapsedMs() });
  step('roles-swapped', { seats: `${x}<->${y}`, why });
}
try {
  await mkdir(outputDir, { recursive: true });
  if (siteUrl) {
    // The deployed site: its pages carry the room host they were built with; the room's events are not observed here.
    step('site-live', { url: siteUrl, graceMs });
  } else if (live) {
    // The real room service: the pages reach it through VITE_ROOMS_URL; its events are not observed here.
    process.env.VITE_ROOMS_URL = roomsUrl;
    step('rooms-live', { url: roomsUrl, graceMs });
  } else {
    rooms = await createP2pRoomDouble({ host: '127.0.0.1', port: distDir ? 8792 : 0, seatSecret: randomBytes(24).toString('hex'), hostGraceMs: graceMs, onEvent: (event) => report.roomEvents.push({ atMs: elapsedMs(), ...event }) });
    process.env.VITE_ROOMS_URL = rooms.url;
    step('rooms-double', { url: rooms.url, graceMs });
  }
  let origin = siteUrl;
  if (!siteUrl && distDir) {
    const { preview } = await import('vite');
    const previewPort = requestedVitePort > 0 ? requestedVitePort : await freePort();
    vite = await preview({ root, logLevel: 'error', build: { outDir: distDir }, preview: { host: '127.0.0.1', port: previewPort, strictPort: true } });
    origin = `http://127.0.0.1:${previewPort}`;
    step('preview', { origin, dist: distDir });
  } else if (!siteUrl) {
    const vitePort = requestedVitePort > 0 ? requestedVitePort : await freePort();
    vite = await createViteServer({ root, cacheDir, logLevel: 'error', server: { host: '127.0.0.1', port: vitePort, strictPort: true, hmr: false } });
    await vite.listen();
    origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    step('vite', { origin, cacheDir });
  }

  const launchBrowser = () => puppeteer.launch({
    headless: !headful, protocolTimeout: 360_000,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--use-gl=angle', '--enable-webgl', '--window-size=1100,720'],
  });
  browser = await launchBrowser();
  if (separateBrowsers) extraBrowsers.push(await launchBrowser(), await launchBrowser());
  contextA = await browser.createBrowserContext();
  const contextB = await (separateBrowsers ? extraBrowsers[0] : browser).createBrowserContext();
  const contextC = await (separateBrowsers ? extraBrowsers[1] : browser).createBrowserContext();
  Object.assign(contexts, { a: contextA, b: contextB, c: contextC });
  pages.a = await contextA.newPage();
  pages.b = await contextB.newPage();
  pages.c = await contextC.newPage();
  for (const [label, page] of Object.entries(pages)) {
    if (!page) continue;
    const phone = label === phoneSeat;
    if (phone) touchPages.add(page);
    await page.setViewport(phone ? phoneViewport : testViewport);
    await page.evaluateOnNewDocument(installPageRecorder, forceRelay);
    observe(page, label.toUpperCase());
  }

  // ---- A: boot, create the LAN room with three seats per side
  await pages.a.goto(`${origin}/?${BOOT_QUERY}`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await waitFor(pages.a, () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', 'A garage ready', 240_000);
  step('a-garage-ready');
  // 2026-09-29: multiplayer has its own entry since the play-menu split (8ccc472c2) — the battle button launches solo.
  await activate(pages.a,'.cot-multiplayer-entry');
  await waitFor(pages.a, () => document.querySelector('.cot-play')?.classList.contains('show'), 'A play menu', 30_000);
  await activate(pages.a,`.cot-play .modes [data-mode="${roomKind}"]`);
  await waitFor(pages.a, (kind) => document.querySelector(`.cot-play .modes [data-mode="${kind}"]`)?.classList.contains('on'), `A ${roomKind} mode`, 10_000, { args: [roomKind] });
  await pages.a.evaluate(() => {
    const name = document.querySelector('.cot-play [data-field="name"]');
    if (name) name.value = 'Alpha Lead';
    const size = document.querySelector('.cot-play [data-field="create-size"]');
    if (size) size.value = '3';
  });
  await activate(pages.a,'.cot-play [data-action="create"]');
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
  // --game-mode / --map: the admin sets them in the lobby (the controls the player uses), before anyone readies
  if (gameModeOption) {
    await activate(pages.a, `.cot-play [data-game-mode="${gameModeOption}"]`);
    await waitFor(pages.a, (mode) => document.querySelector(`.cot-play [data-game-mode="${mode}"]`)?.classList.contains('on'), `A game mode ${gameModeOption}`, 15_000, { args: [gameModeOption] });
  }
  if (mapOption) {
    // (2026-10-14) since the play menu syncs the host's Garage pick into the room (syncGarageSelection: set_map), the
    // Garage's own battlefield is set first, or the room's map snaps back to it
    await pages.a.evaluate((mapId) => { window.__DEBUG?.garage?.setSelectedMap?.(mapId); }, mapOption).catch(() => {});
    await pages.a.evaluate((mapId) => {
      const select = document.querySelector('.cot-play [data-control="map"]');
      if (select && select.value !== mapId) { select.value = mapId; select.dispatchEvent(new Event('change', { bubbles: true })); }
    }, mapOption);
    if (live) {
      await waitFor(pages.c, (mapId) => document.querySelector('.cot-play [data-control="map"]')?.value === mapId, `C sees map ${mapOption}`, 15_000, { args: [mapOption] });
    } else {
      // (2026-10-14) the room's own settings: a guest's first map control is no longer the lobby's on main
      const roomMap = () => rooms.room(report.room.code)?.room?.settings?.mapId ?? null;
      for (let waited = 0; roomMap() !== mapOption && waited < 15_000; waited += 100) await sleep(100);
      // not fatal (a night slot is one attempt): the run goes on and says which battlefield it measured
      if (roomMap() !== mapOption) report.findings.push(`--map ${mapOption} did not take: the room plays ${roomMap()}`);
    }
  }
  if (gameModeOption || mapOption) step('lobby-settings', { gameMode: gameModeOption || null, map: mapOption || null, roomMap: live ? null : rooms.room(report.room.code)?.room?.settings?.mapId ?? null });
  await activate(pages.c,'.cot-play [data-action="ready"]');
  await activate(pages.b,'.cot-play [data-action="ready"]');
  await activate(pages.a,'.cot-play [data-action="ready"]');
  await waitFor(pages.a, () => !document.querySelector('.cot-play [data-action="start"]')?.disabled, 'A start enabled', 30_000);
  await activate(pages.a,'.cot-play [data-action="start"]');
  step('a-started');
  const startedAtMs = elapsedMs();
  // start to revealed, per seat (MP-SINCE-0930 §7's first metric), whichever seat reveals first
  report.entry = { startedAtMs, revealedAfterMs: {} };
  for (const label of ['a', 'b', 'c']) {
    void pages[label].waitForFunction(inBattle, { timeout: 300_000, polling: 100 })
      .then(() => { report.entry.revealedAfterMs[label.toUpperCase()] = elapsedMs() - startedAtMs; }).catch(() => {});
  }

  // ---- every seat reaches the battle over WebRTC: A hosts, B and C are its peers
  await Promise.all([
    waitFor(pages.a, inBattle, 'A battle revealed', 240_000, { entryOf: 'A' }),
    waitFor(pages.b, inBattle, 'B battle revealed', 240_000, { entryOf: 'B' }),
    waitFor(pages.c, inBattle, 'C battle revealed', 240_000, { entryOf: 'C' }),
  ]);
  if(mobile||phoneSeat==='c'){
    const baseViewport = mobile ? mobileViewport : phoneViewport;
    for(const viewport of [baseViewport,{...baseViewport,width:568,height:256},{...baseViewport,width:320,height:568},baseViewport]){
      await pages.c.setViewport(viewport);await sleep(200);
      const issues=await pages.c.evaluate(()=>{
        const issues=[];
        for(const selector of ['.cot-mp-strip','.cot-touch.on .fire:not(.alt)','.cot-touch.on .scope','.cot-touch.on .autoaim','.cot-touch.on .mobile-chrome','.cot-vehicle-controls']){
          const el=document.querySelector(selector);if(!el?.checkVisibility({checkVisibilityCSS:true})){issues.push(`${selector}: missing`);continue;}
          const r=el.getBoundingClientRect();if(r.x<0||r.y<0||r.right>innerWidth+1||r.bottom>innerHeight+1)issues.push(`${selector}: offscreen`);
          const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!hit||!(hit===el||el.contains(hit)))issues.push(`${selector}: blocked`);
        }
        return issues;
      });
      if(issues.length)throw new Error(`Live mobile ${viewport.width}x${viewport.height}: ${issues.join(', ')}`);
      await screenshot(pages.c,`mobile-${viewport.width}x${viewport.height}.png`);
      step('mobile-battle-controls',{width:viewport.width,height:viewport.height});
    }
  }
  if (live) {
    const ownId = (page) => page.evaluate(() => window.__MULTIPLAYER_V2?.stats?.().session?.playerId ?? null);
    Object.assign(ids, { a: await ownId(pages.a), b: await ownId(pages.b), c: await ownId(pages.c) });
    if (!ids.a || !ids.b || !ids.c || new Set(Object.values(ids)).size !== 3) throw new Error(`the seats' ids read ${JSON.stringify(ids)}`);
    step('seats', ids);
  }
  // role-agnostic (2026-10-13): a slow entry can re-elect (MP-S03) — the seat hosting at the reveal is A from here on
  const roleAt = async () => Object.fromEntries(await Promise.all(['a', 'b', 'c'].map(async (label) => [label, (await p2pOf(pages[label]))?.role ?? null])));
  let revealRoles = await roleAt();
  for (let waited = 0; !Object.values(revealRoles).includes('host') && waited < 30_000; waited += 250) { await sleep(250); revealRoles = await roleAt(); }
  const hostLabel = Object.keys(revealRoles).find((label) => revealRoles[label] === 'host') ?? null;
  report.roles.hostAtReveal = hostLabel ? { label: hostLabel, id: ids[hostLabel] } : null;
  report.roles.revealRoles = revealRoles;
  if (hostLabel && hostLabel !== 'a') swapSeats('a', hostLabel, `the room elected ${hostLabel.toUpperCase()} during the entry`);
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
  const linksBefore = { A: await linkStats(pages.a), B: await linkStats(pages.b), C: await linkStats(pages.c) };
  if(mobile||touchPages.has(pages.b)){
    const joy=await pages.b.$('.cot-touch.on .joy');const box=await joy?.boundingBox();
    if(!box)throw new Error('Mobile joystick is missing');
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await pages.b.touchscreen.touchStart(x,y);
    await pages.b.touchscreen.touchMove(x-24,y-40);
  }else{
    // (2026-10-13) after a role swap B can be the page that created the room, its focus still in the play menu's fields:
    // the game ignores keys typed into a field (the private run's B moved 0.93 m in 12 s). Blur it and bring B forward.
    report.play.focusBefore = await pages.b.evaluate(() => ({ active: document.activeElement?.tagName ?? null, field: document.activeElement?.getAttribute?.('data-field') ?? null, hasFocus: document.hasFocus(), hidden: document.hidden })).catch(() => null);
    await pages.b.bringToFront().catch(() => {});
    await pages.b.evaluate(() => { const active = document.activeElement; if (active && active !== document.body && typeof active.blur === 'function') active.blur(); });
    await pages.b.keyboard.down('KeyW');await pages.b.keyboard.down('KeyA');
  }
  const throttles = [];
  if (hostThrottle > 1) throttles.push(await throttle(pages.a, hostThrottle));
  if (seatThrottle > 1) throttles.push(await throttle(pages.c, seatThrottle));
  report.measure = await measureWindow(['a', 'b', 'c'], playS);
  for (const session of throttles) await session.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
  // the seat-pause probe: B still drives; its main thread stops for each duration, then 3 s settle; B's own prediction
  // read before and after (a step between 0.3 and 0.6 s would confirm the 0.5 s held-input release, plan step 9)
  if (seatPauses.length) {
    report.seatPause = [];
    for (const ms of seatPauses) {
      const before = await pageCounters(pages.b, false);
      await pages.b.evaluate((block) => { const end = performance.now() + block; while (performance.now() < end) { /* the seat's frame stops */ } }, ms).catch(() => {});
      await sleep(3000);
      const after = await pageCounters(pages.b, false);
      const p0 = before?.predictor, p1 = after?.predictor;
      report.seatPause.push({ pauseMs: ms, reconciliations: p0 && p1 ? p1.reconciliations - p0.reconciliations : null, hardSnaps: p0 && p1 ? p1.hardSnaps - p0.hardSnaps : null,
        lastPositionErrorM: round1(p1?.lastPositionErrorM ?? null), maxPositionErrorM: round1(p1?.maxPositionErrorM ?? null), maxRose: !!(p0 && p1 && p1.maxPositionErrorM > p0.maxPositionErrorM) });
    }
    step('seat-pause', { rows: report.seatPause });
  }
  if (hostPauses.length) {
    report.hostPause = [];
    for (const ms of hostPauses) {
      const before = await pageCounters(pages.b, true);
      await pages.a.evaluate((block) => { const end = performance.now() + block; while (performance.now() < end) { /* the host's frame and relay stop */ } }, ms).catch(() => {});
      await sleep(3000);
      const after = await pageCounters(pages.b, false);
      const p0 = before?.predictor, p1 = after?.predictor;
      report.hostPause.push({ pauseMs: ms, reconciliations: p0 && p1 ? p1.reconciliations - p0.reconciliations : null, hardSnaps: p0 && p1 ? p1.hardSnaps - p0.hardSnaps : null,
        lastPositionErrorM: round1(p1?.lastPositionErrorM ?? null), maxPositionErrorM: round1(p1?.maxPositionErrorM ?? null), maxRose: !!(p0 && p1 && p1.maxPositionErrorM > p0.maxPositionErrorM),
        maxCorrectionStepM: round1(p1?.maxCorrectionStepM ?? null), gapMaxMs: round1(after?.arrivals?.match?.gaps?.length ? Math.max(...after.arrivals.match.gaps) : null) });
    }
    step('host-pause', { rows: report.hostPause });
  }
  step('measured', { divergence: report.measure.divergence, fps: Object.fromEntries(Object.entries(report.measure.perPage).map(([label, row]) => [label, row?.fps ?? null])),
    skipped: Object.fromEntries(Object.entries(report.measure.perPage).map(([label, row]) => [label, row?.skippedTickPct ?? null])) });
  const linksAfter = { A: await linkStats(pages.a), B: await linkStats(pages.b), C: await linkStats(pages.c) };
  report.bandwidth = Object.fromEntries(Object.keys(linksAfter).map((label) => [label, bandwidthBetween(linksBefore[label], linksAfter[label])]));
  step('bandwidth', Object.fromEntries(Object.entries(report.bandwidth).map(([label, row]) => [label, row ? { upKbps: row.upKbps, downKbps: row.downKbps, pairs: row.pairs.map((pair) => `${pair.local ?? '?'}/${pair.remote ?? '?'}`).join(',') } : null])));
  if(mobile||touchPages.has(pages.b))await pages.b.touchscreen.touchEnd();
  else{await pages.b.keyboard.up('KeyA');await pages.b.keyboard.up('KeyW');}
  const after = { b: await sample(pages.b, ids.c), c: await sample(pages.c, ids.b) };
  const movedM = after.c.other && before.c.other ? Math.hypot(after.c.other.x - before.c.other.x, after.c.other.z - before.c.other.z) : 0;
  report.play = { ...report.play, movedBAsCSaw: movedM, snapshotsC: after.c.snapshots - before.c.snapshots, snapshotsB: after.b.snapshots - before.b.snapshots, keyframesRetainedC: await pages.c.evaluate(() => window.__MULTIPLAYER_V2?.stats?.().session?.match ? true : null) };
  step('played', report.play);
  if (movedM < 2) failures.push(`C saw B move ${movedM.toFixed(2)} m in ${playS} s`);
  if (report.play.snapshotsC < playS * 15) failures.push(`C received ${report.play.snapshotsC} snapshots in ${playS} s`);

  // ---- shots (2026-10-14, the §7 side-by-side): the host (A) and a peer (B) press fire on the battle canvas about once a
  // second; each page's own record pairs a press with its predicted flash, the authority's shell_fired and the round's
  // impact. Shot-to-hit feedback = impact presented − press − the round's ballistic flight (distance / muzzle velocity).
  if (shootS > 0) {
    report.shots = await shootPhase({ a: pages.a, b: pages.b }, shootS);
    step('shots', Object.fromEntries(Object.entries(report.shots).map(([label, row]) => [label, row?.summary ?? null])));
  }
  // ---- the MP path's frame cost (2026-10-14): a CPU profile of the host's and a peer's main thread, self time by source area
  if (profileS > 0) {
    report.profile = await profilePhase({ A: pages.a, C: pages.c }, profileS);
    step('profiled', Object.fromEntries(Object.entries(report.profile).map(([label, row]) => [label, row ? { msPerFrame: row.msPerFrame, mpMsPerFrame: row.areas?.mp?.msPerFrame ?? null } : null])));
  }

  // ---- A closes its tab: after the grace the room elects B; B resumes from its keyframe, C follows; no reset
  // both peers' views of each other and of themselves: the room may elect either (the labels follow the election)
  let lastSeenByC = await sample(pages.c, ids.b);
  const lastSeenByB = await sample(pages.b, ids.c);
  // B's own hull as the host goes: a hull still rolling coasts on, which the new host's resume hold keeps off C's first frame
  let bOwnAtClose = await sample(pages.b, ids.b);
  const cOwnAtClose = await sample(pages.c, ids.c);
  await collectRoomLog('A', pages.a);
  const hostTickBefore = live ? null : report.roomEvents.filter((event) => event.kind === 'match_report').at(-1)?.tick ?? 0;
  const closedAt = performance.now();
  report.closedAtWallMs = Date.now();
  await pages.a.close();
  pages.a = null;
  step('a-closed');
  // role-agnostic (2026-10-13): whichever peer the room elects is B from here on (MP-S03: a seat that declined during
  // the entry is passed over; the e2e used to fail "B hosts" while the match lived on under C)
  const hostingNow = () => window.__MULTIPLAYER_V2?.stats?.().session?.p2p?.role === 'host';
  const electedLabel = await new Promise((resolveElected, rejectElected) => {
    let settled = false;
    const deadline = setTimeout(() => { settled = true; rejectElected(new Error(`neither B nor C hosts ${graceMs + 90_000} ms after A closed`)); }, graceMs + 90_000);
    const poll = async () => {
      while (!settled) {
        for (const label of ['b', 'c']) {
          if (await pages[label].evaluate(hostingNow).catch(() => false)) { settled = true; clearTimeout(deadline); resolveElected(label); return; }
        }
        await sleep(250);
      }
    };
    void poll();
  });
  report.roles.elected = { label: electedLabel, id: ids[electedLabel] };
  if (electedLabel === 'c') {
    swapSeats('b', 'c', 'the room elected C when A left');
    lastSeenByC = lastSeenByB;
    bOwnAtClose = cOwnAtClose;
  }
  await waitFor(pages.b, (id) => window.__MULTIPLAYER_V2?.stats?.().session?.p2p?.role === 'host' && window.__MULTIPLAYER_V2?.stats?.().session?.p2p?.hostId === id, 'B hosts', 30_000, { args: [ids.b], polling: 250 });
  const electedAfterMs = Math.round(performance.now() - closedAt);
  await waitFor(pages.c, (id) => { const p = window.__MULTIPLAYER_V2?.stats?.(); return p?.session?.p2p?.hostId === id && p?.session?.p2p?.migrating === false && p?.session?.match?.phase === 'live'; }, 'C live on B', 90_000, { args: [ids.b], polling: 250 });
  // (2026-10-14) close → C live on the new host: the freeze a peer sees, the election plus the resume
  const resumedAfterMs = Math.round(performance.now() - closedAt);
  const firstSeenByC = await sample(pages.c, ids.b);
  const cBefore = firstSeenByC.snapshots;
  await sleep(4000);
  const cAfter = await sample(pages.c, ids.b);
  const jumpM = lastSeenByC.other && firstSeenByC.other ? Math.hypot(firstSeenByC.other.x - lastSeenByC.other.x, firstSeenByC.other.z - lastSeenByC.other.z) : null;
  const bAfter = await p2pOf(pages.b);
  // The election as the double logged it; against the real service the elected seat's own facts (host, generation) stand in.
  // live: the election as B's own room client heard it (the room's reason); against the double, the double's log
  const startGeneration = report.start?.a?.generation ?? 1;
  const bLog = await collectRoomLog('B', pages.b);
  const heard = bLog.filter((entry) => entry.kind === 'host_changed' && entry.hostId === ids.b).at(-1) ?? null;
  const election = live
    ? (bAfter ? { hostId: bAfter.hostId, generation: bAfter.generation, reason: heard?.reason ?? 'unobserved', resumeTick: heard?.resumeTick ?? null } : null)
    : report.roomEvents.find((event) => event.kind === 'host_changed' && event.hostId === ids.b && event.generation === startGeneration + 1)
      ?? report.roomEvents.find((event) => event.kind === 'host_changed' && event.generation === startGeneration + 1);
  const reportsFromB = live ? null : report.roomEvents.filter((event) => event.kind === 'match_report' && event.from === ids.b).length;
  const stripB = await pages.b.evaluate(() => ({ host: document.querySelector('.cot-mp-strip .unit.host')?.hidden === false, banner: document.querySelector('.cot-mp-banner')?.hidden === false ? document.querySelector('.cot-mp-banner .text')?.textContent : null }));
  report.migration = {
    electedAfterMs, resumedAfterMs, election: election ? { hostId: election.hostId, generation: election.generation, reason: election.reason, resumeTick: election.resumeTick } : null, hostTickBefore,
    b: bAfter, c: await p2pOf(pages.c), cMatchPhase: cAfter.matchPhase, cSnapshotsAfterMigration: cAfter.snapshots - cBefore, cMigrations: cAfter.migrations, bMigrations: (await stats(pages.b))?.session?.migrations ?? null,
    bHullJumpAsCSaw: jumpM, bSpeedAtCloseMps: bOwnAtClose.other?.speed ?? null, bResumeHold: bAfter?.resumeHold ?? null, cPhase: cAfter.phase, cResult: cAfter.result, reportsFromB, stripB,
  };
  step('migrated', report.migration);
  if (election?.hostId !== ids.b || election.generation !== startGeneration + 1) failures.push(`the election ${JSON.stringify(election)} (the start ran at generation ${startGeneration})`);
  // a host that leaves hands its match on at once (pagehide → host_decline, §13.19): only an election on the lease is bound by the grace
  if (electedAfterMs < graceMs && election?.reason !== 'declined') failures.push(`B hosted before the grace (${electedAfterMs} ms, ${election?.reason ?? 'no reason'})`);
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
  await Promise.all([pages.b, pages.c].map((page) => page.setViewport({ ...testViewport, width: 320, height: 200 })));
  step('b-c-shrunk', { viewport: '320x200' });
  pages.a2 = await contextA.newPage();
  let a2ProfileSession = null;
  let a2ProfileStartedAt = null;
  if (a2Profile) {
    // the same origin first (the renderer the invite will use), then the sampler, then the invite
    await pages.a2.goto(new URL('/humans.txt', invite).href, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    a2ProfileSession = await pages.a2.createCDPSession().catch(() => null);
    if (a2ProfileSession) {
      await a2ProfileSession.send('Profiler.enable').catch(() => {});
      await a2ProfileSession.send('Profiler.setSamplingInterval', { interval: 1000 }).catch(() => {});
      await a2ProfileSession.send('Profiler.start').catch(() => {});
      a2ProfileStartedAt = elapsedMs();
    }
  }
  await pages.a2.setViewport(testViewport);
  // (2026-10-14) the returning tab's own telemetry beacons (its boot stage timings: renderer, sky, garage, vehicle, post ...)
  report.a2Beacons = [];
  pages.a2.on('request', (request) => {
    if (request.method() !== 'POST' || !/telemetry|\/v1\/session|\/v1\/error/.test(request.url())) return;
    try { report.a2Beacons.push({ atMs: elapsedMs(), url: request.url().replace(/^https?:\/\/[^/]+/, ''), body: JSON.parse(request.postData() ?? 'null') }); } catch { /* not JSON */ }
  });
  observe(pages.a2, 'A2');
  await pages.a2.evaluateOnNewDocument(installPageRecorder, forceRelay);
  // (2026-10-14) the return's own clock: the page opened → its Garage → its battle revealed (sampled beside the flow)
  const a2OpenedAtMs = elapsedMs();
  report.rejoinTiming = { openedAtMs: a2OpenedAtMs, garageAfterMs: null, revealedAfterMs: null };
  await pages.a2.goto(invite.href, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  void pages.a2.waitForFunction(inBattle, { timeout: 420_000, polling: 100 }).then(() => { report.rejoinTiming.revealedAfterMs = elapsedMs() - a2OpenedAtMs; }).catch(() => {});
  await waitFor(pages.a2, () => window.__GAME_READY === true && window.__DEBUG?.game?.phase === 'garage', 'A2 garage ready', 240_000);
  report.rejoinTiming.garageAfterMs = elapsedMs() - a2OpenedAtMs;
  // (2026-10-15) the return's entry, sampled every 200 ms from its Garage to its battle: the trace's stages as they are
  // marked (a stage marked twice shows its first value replaced), the link (transport, offers, reconnects, the WELCOME),
  // the round's welcome / activation / reveal and the loader's own label — each row when anything in it changed
  const entryTrace = report.rejoinEntryTrace = [];
  let entryTraceOn = true;
  const entryTracer = (async () => {
    let last = '';
    while (entryTraceOn && !pages.a2.isClosed() && elapsedMs() - a2OpenedAtMs < 300_000) {
      const row = await pages.a2.evaluate(() => {
        const load = window.__NETWORK_LOAD;
        const s = window.__MULTIPLAYER_V2?.stats?.();
        const m = s?.session?.match;
        return {
          stages: load?.stages ? Object.entries(load.stages).map(([stage, ms]) => `${stage}=${ms}`).join(' ') : null,
          session: s?.session?.phase ?? null, transport: m?.transportState ?? null, welcomed: m?.welcomed ?? null, link: m?.phase ?? null,
          reconnects: m?.reconnects ?? null, helloRetries: m?.helloRetries ?? null, close: m?.closeReason ?? null,
          offers: s?.session?.p2p?.offersSent ?? null,
          round: s?.round ? `${s.round.welcomed ? 'W' : '-'}${s.round.activated ? 'A' : '-'}${s.round.revealed ? 'R' : '-'}` : null,
          label: (document.querySelector('.cot-bl')?.classList.contains('on') ? document.querySelector('.cot-bl')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80) : null) ?? null,
        };
      }).catch(() => null);
      if (row) { const key = JSON.stringify(row); if (key !== last) { entryTrace.push({ atMs: elapsedMs() - a2OpenedAtMs, ...row }); last = key; } }
      await sleep(200);
    }
  })();
  const stopEntryTrace = async () => { entryTraceOn = false; await entryTracer; };
  if (a2ProfileSession && !a2ProfileEntry) {
    const profile = await a2ProfileSession.send('Profiler.stop').then((result) => result.profile).catch(() => null);
    if (profile) {
      await writeFile(join(outputDir, 'a2-garage.cpuprofile'), JSON.stringify(profile));
      const self = new Map();
      const byId = new Map(profile.nodes.map((node) => [node.id, node]));
      const parentOf = new Map();
      for (const node of profile.nodes) for (const child of node.children ?? []) parentOf.set(child, node.id);
      const label = (node) => `${node.callFrame.functionName || '(anon)'} ${(node.callFrame.url || '').replace(/^https?:\/\/[^/]+/, '')}:${node.callFrame.lineNumber + 1}`;
      for (let i = 0; i < profile.samples.length; i++) {
        const ms = (profile.timeDeltas[i + 1] ?? profile.timeDeltas[i] ?? 0) / 1000;
        const node = byId.get(profile.samples[i]);
        if (!node) continue;
        // the frame and its three callers: a native wait reads with the JS that made it
        const chain = [label(node)];
        let up = parentOf.get(node.id);
        for (let depth = 0; depth < 3 && up !== undefined; depth++) { chain.push(label(byId.get(up))); up = parentOf.get(up); }
        const key = chain.join(' < ');
        self.set(key, (self.get(key) ?? 0) + ms);
      }
      report.a2Profile = { garageAfterMs: report.rejoinTiming.garageAfterMs, top: [...self].sort((x, y) => y[1] - x[1]).slice(0, 25).map(([frame, ms]) => ({ ms: Math.round(ms), frame })) };
    }
    await a2ProfileSession.detach().catch(() => {});
  }
  step('a2-garage-ready');
  // The resumed seat returns one of two ways, both the product's: the room re-delivers match_start to it and the session
  // re-enters the running match on its own (the loader covers the lobby at once), or the lobby is up with Rejoin battle.
  const returnState = () => {
    const v2 = window.__MULTIPLAYER_V2?.stats?.();
    const button = document.querySelector('.cot-play [data-action="rejoin"]');
    const rejoin = (document.querySelector('.cot-play')?.classList.contains('show') ?? false) && !!button && !button.hidden;
    return {
      path: v2?.active === true && v2?.session?.phase === 'match' ? 'auto' : rejoin ? 'rejoin' : null,
      v2: !!v2, active: v2?.active ?? null, sessionPhase: v2?.session?.phase ?? null, roomPhase: v2?.room?.phase ?? null,
      lobby: document.querySelector('.cot-play .lobby')?.classList.contains('show') ?? false, rejoin,
      inRoom: /\b[A-Z0-9]{6}\b/.test(document.querySelector('.cot-play .lobby.show')?.textContent ?? '') && (document.querySelector('.cot-play .lobby.show .players')?.children.length ?? 0) > 0,
      loader: document.querySelector('.cot-bl')?.classList.contains('on') ?? false, failure: window.__NETWORK_ENTRY_FAILURE?.message ?? null,
    };
  };
  // Sampled rather than a blind wait: the resumed seat's timeline (the runtime appearing, the session entering, the lobby and
  // its Rejoin) goes into the report whichever way the return goes and however slow the page is under the host's load.
  // (2026-10-13) both band-hold runs ended by elimination before or while A2 returned (bots against idle seats): a match
  // the room ended is the product's answer, not a failed return
  const matchEnded = () => (!live ? report.roomEvents.find((event) => event.kind === 'match_ended') ?? null : null);
  const returnTimeline = [];
  const returnStartedAt = performance.now();
  let returned = null;
  let manualJoin = false;
  let lastState = '';
  while (performance.now() - returnStartedAt < 180_000) {
    const state = await pages.a2.evaluate(returnState).catch(() => null);
    if (state) {
      const key = JSON.stringify(state);
      if (key !== lastState) { returnTimeline.push({ atMs: Math.round(performance.now() - returnStartedAt), ...state }); lastState = key; }
      if (state.path) { returned = state.path; break; }
      if (matchEnded() && (state.inRoom || state.lobby)) { returned = 'match-ended'; break; }
      // (2026-10-13) the private run's A2 sat in the lobby, never in the room, for 180 s: past 60 s the harness joins by
      // code as a player would, and records that the invite did not bring the seat back by itself
      if (!state.roomPhase && !state.sessionPhase && !state.inRoom && !manualJoin && performance.now() - returnStartedAt > 60_000) {
        manualJoin = true;
        report.findings.push(`A2 (${roomKind}) was not back in the room 60 s after reopening the invite; joined by code`);
        await pages.a2.evaluate((code) => {
          const entry = document.querySelector('.cot-multiplayer-entry');
          if (!document.querySelector('.cot-play')?.classList.contains('show')) entry?.click();
          const input = document.querySelector('.cot-play [data-field="code"]');
          if (input) { input.value = code; input.dispatchEvent(new Event('input', { bubbles: true })); }
          document.querySelector('.cot-play [data-action="join"]')?.click();
        }, report.room.code).catch(() => {});
        step('a2-manual-join');
      }
    }
    await sleep(250);
  }
  report.rejoin = { path: returned, timeline: returnTimeline };
  if (!returned) throw new Error(`A2 never returned within 180 s: ${JSON.stringify(returnTimeline.slice(-3))}`);
  if (returned === 'match-ended') {
    const ended = matchEnded();
    report.findings.push(`the match ended (${ended.reason}) at ${Math.round(ended.atMs / 1000)} s before A2 was back; A2 is in the room's lobby`);
  }
  if (returned === 'rejoin') await activate(pages.a2,'.cot-play [data-action="rejoin"]');
  step('a2-returned', { path: returned, timeline: returnTimeline });
  let a2Attempts = 1;
  // (2026-10-13) a long run under load lets the bots finish the match while A2 enters: the room ends it, and A2 must show
  // "The match ended while you were joining" — the product's answer, not a failed return
  const endedNotice = () => pages.a2.evaluate(() => document.querySelector('.cot-play .status')?.textContent ?? window.__NETWORK_ENTRY_FAILURE?.message ?? '').catch(() => '');
  let endedDuringReturn = returned === 'match-ended' ? { atMs: matchEnded().atMs, result: matchEnded().result, reason: matchEnded().reason, notice: null } : null;
  if (!endedDuringReturn) try {
    await waitFor(pages.a2, inBattle, 'A2 rejoined the battle', 240_000, { entryOf: 'A2' });
  } catch (error) {
    const ended = matchEnded();
    const notice = ended ? await endedNotice() : '';
    if (ended && /ended/i.test(notice)) {
      endedDuringReturn = { atMs: ended.atMs, result: ended.result, reason: ended.reason, notice };
      report.findings.push(`the match ended (${ended.reason}) at ${Math.round(ended.atMs / 1000)} s while A2 entered; A2 showed "${notice.trim()}"`);
      step('a2-match-ended', endedDuringReturn);
    } else {
    // The product's own recovery ("Please retry from the Garage"): one Rejoin from the lobby, recorded — the console error
    // of the failed entry still fails the run; the second attempt only tells whether the return works at all under this load.
    failures.push(error instanceof Error ? error.message : String(error));
    await waitFor(pages.a2, () => { const button = document.querySelector('.cot-play [data-action="rejoin"]'); return document.querySelector('.cot-play')?.classList.contains('show') && !!button && !button.hidden; }, 'A2 offered Rejoin battle after the failed entry', 60_000);
    a2Attempts = 2;
    await activate(pages.a2,'.cot-play [data-action="rejoin"]');
    step('a2-garage-retry');
    await waitFor(pages.a2, inBattle, 'A2 rejoined the battle (Garage retry)', 240_000, { entryOf: 'A2' });
    }
  }
  if (endedDuringReturn) {
    report.rejoin = { ...report.rejoin, endedDuringReturn };
    report.inconclusive = [...(report.inconclusive ?? []), 'rejoin: the room ended the match before A2 was back in it'];
  } else {
  await waitFor(pages.a2, (id) => { const p = window.__MULTIPLAYER_V2?.stats?.(); return p?.session?.p2p?.role === 'peer' && p?.session?.p2p?.hostId === id && p?.session?.match?.phase === 'live'; }, 'A2 live as a peer of B', 90_000, { args: [ids.b], polling: 250 });
  await stopEntryTrace();
  if (a2ProfileSession && a2ProfileEntry) {
    const profile = await a2ProfileSession.send('Profiler.stop').then((result) => result.profile).catch(() => null);
    await a2ProfileSession.detach().catch(() => {});
    if (profile) {
      await writeFile(join(outputDir, 'a2-entry.cpuprofile'), JSON.stringify(profile));
      const spanMs = (profile.endTime - profile.startTime) / 1000;
      const offsetMs = (a2ProfileStartedAt ?? a2OpenedAtMs) - a2OpenedAtMs;
      const seconds = [];
      for (let from = 0; from < spanMs; from += 1000) {
        const span = profileSpan(profile, from, from + 1000);
        seconds.push({ atS: Math.round((from + offsetMs) / 100) / 10, busyMs: span.busyMs, chunks: span.chunks.slice(0, 3).map((row) => `${row.name} ${row.ms}`).join(', '), top: span.frames[0]?.name ?? null });
      }
      report.a2EntryProfile = { offsetMs, seconds, stalls: profileStalls(profile, 500).map((row) => ({ ...row, atMs: row.atMs + offsetMs })) };
    }
  }
  await Promise.all([pages.b, pages.c].map((page) => page.setViewport(testViewport)));
  const a2Entry = await pages.a2.evaluate(() => ({ stages: window.__NETWORK_LOAD?.stages ?? null, totalMs: window.__NETWORK_LOAD?.totalMs ?? null, status: window.__NETWORK_LOAD?.status ?? null, rewelcomes: window.__NETWORK_LOAD?.rewelcomes ?? 0, rewelcomeAtMs: window.__NETWORK_LOAD?.rewelcomeAtMs ?? null }));
  step('b-c-restored', { viewport: `${testViewport.width}x${testViewport.height}`, a2Entry });
  report.rejoin = { ...report.rejoin, a: await startOf(pages.a2), p2p: await p2pOf(pages.a2), peersOnB: (await p2pOf(pages.b))?.peersConnected ?? null, attempts: a2Attempts, entry: a2Entry };
  step('a-rejoined', report.rejoin);
  if (report.rejoin.p2p?.role !== 'peer' || report.rejoin.p2p?.hostId !== ids.b) failures.push(`A2 ${JSON.stringify(report.rejoin.p2p)}`);
  if (report.rejoin.peersOnB !== 2) failures.push(`B serves ${report.rejoin.peersOnB} peers after A's return`);
  await screenshot(pages.a2, 'a-rejoined-as-peer.png');
  }
} catch (error) {
  failures.push(error instanceof Error ? error.stack || error.message : String(error));
  // (2026-10-15) a page whose renderer hangs never answers a screenshot: each one is bounded, so the report is still written
  for(const [label,page] of Object.entries(pages))if(page&&!page.isClosed())await Promise.race([screenshot(page,`${label}-failure.png`).catch(()=>{}),sleep(15_000)]);
} finally {
  for (const [label, page] of Object.entries(pages)) if (page && !page.isClosed()) await Promise.race([collectRoomLog(label.toUpperCase(), page), sleep(10_000)]);
  // every election each page heard, with the room's reason: the ones before the reveal are MP-S03's entry elections
  report.elections = Object.fromEntries(Object.entries(report.roomLog).map(([label, entries]) => [label,
    (entries ?? []).filter((entry) => entry.kind === 'host_changed' || entry.kind === 'decline').map((entry) => ({ atMs: entry.atMs, kind: entry.kind, hostId: entry.hostId ?? null, generation: entry.generation ?? null, reason: entry.reason ?? null, unable: entry.unable ?? null }))]));
  report.wallMs = elapsedMs();
  const relevant = errors.filter((entry) => !/favicon|ERR_ABORTED/i.test(entry.text));
  if (relevant.length) failures.push(`${relevant.length} browser error(s): ${relevant.slice(0, 3).map((entry) => `${entry.page} ${entry.kind}: ${entry.text.slice(0, 240)}`).join(' | ')}`);
  report.pass = failures.length === 0;
  await writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  const teardown = async () => {
    try { await browser?.close(); } catch { /* gone */ }
    for (const extra of extraBrowsers) { try { await extra.close(); } catch { /* gone */ } }
    try { await vite?.close(); } catch { /* gone */ }
    try { await rooms?.close(); } catch { /* gone */ }
  };
  await Promise.race([teardown(), sleep(20_000)]);
}

if (json) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`mp p2p e2e${siteUrl ? ' (live site)' : live ? ' (live rooms)' : ''}: room ${report.room?.code ?? '-'} started ${report.start?.matchUrl ?? '-'} (A ${report.start?.a?.role ?? '-'} serving ${report.start?.a?.peers ?? '-'}, B/C ${report.start?.b?.role ?? '-'}/${report.start?.c?.role ?? '-'} on ${report.start?.b?.candidate ?? '-'} candidates); ` +
    `play ${playS} s: C saw B move ${report.play?.movedBAsCSaw?.toFixed?.(1) ?? '-'} m, ${report.play?.snapshotsC ?? '-'} snapshots; ` +
    `A closed → B hosted after ${report.migration?.electedAfterMs ?? '-'} ms (generation ${report.migration?.election?.generation ?? '-'}), C live on B with +${report.migration?.cSnapshotsAfterMigration ?? '-'} snapshots in 4 s, B's hull ${report.migration?.bHullJumpAsCSaw?.toFixed?.(2) ?? '-'} m from where C saw it, ${report.migration?.reportsFromB ?? '-'} reports from B; ` +
    `A rejoined as ${report.rejoin?.p2p?.role ?? '-'} of ${report.rejoin?.p2p?.hostId ?? '-'} (B serving ${report.rejoin?.peersOnB ?? '-'}; ${report.rejoin?.path ?? '-'} path, ${report.rejoin?.attempts ?? '-'} attempt(s), compile ${report.rejoin?.entry?.stages?.compile ?? '-'} ms${report.rejoin?.entry?.stages?.compileRetry !== undefined ? ` + retry ${report.rejoin.entry.stages.compileRetry} ms` : ''}); ${report.errors.length} browser errors; ${report.wallMs} ms wall`);
  for (const failure of failures) console.log(`  FAIL: ${failure}`);
  for (const finding of report.findings) console.log(`  FINDING: ${finding}`);
  for (const item of report.inconclusive ?? []) console.log(`  INCONCLUSIVE: ${item}`);
  console.log(`  screenshots: ${report.screenshots.join(', ')}`);
  console.log(report.pass ? 'mp p2p e2e: PASS' : 'mp p2p e2e: FAIL');
}
process.exitCode = report.pass ? 0 : 1;
// (2026-10-17) a browser, preview server or rooms double that ignored close() keeps the event loop alive until the caller's
// alarm (a failed run held the capture lock 15 minutes past its report): once the report is out, exit. Unref'd, so a clean
// teardown still ends the process at once.
setTimeout(() => process.exit(process.exitCode), 3000).unref();
