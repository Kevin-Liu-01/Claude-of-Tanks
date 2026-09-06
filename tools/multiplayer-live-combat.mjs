#!/usr/bin/env node

/**
 * Live rendered multiplayer certification.
 *
 * Runs two independent 7v7 battles. The first renders the browser host and
 * the second renders an impaired remote client. Every other seat remains a
 * real Chromium/WebRTC peer that moves, aims, fires, receives reliable combat
 * events, and samples the authority stream. Keeping one full renderer active
 * per run models one player's machine instead of benchmarking fourteen games
 * rendered on one workstation.
 */

import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import puppeteer from 'puppeteer';
import { createServer as createViteServer } from 'vite';
import { createSignalingServer } from '../server/signalingServer.ts';
import { installGlBufferProbe } from './multiplayer-gl-buffer-probe.mjs';
import { sanitizeFeedbackTimingWindows } from './multiplayer-feedback-probe.mjs';
import { startMultiplayerFrameTrace } from './multiplayer-frame-trace.mjs';

const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
const boolean = value => typeof value === 'boolean' ? value : null;
const metrics = (source, names) => Object.fromEntries(names.split(' ').map(name => [name, finite(source?.[name])]));
const size = value => Array.isArray(value) ? value.length : 0;

/** Same bounded numeric window schema as the native feedback probe; no raw event payloads. */
export function liveCombatTimingWindows(source) {
  const schema = Array.isArray(source?.frameSchema) ? source.frameSchema : [];
  const column = name => schema.indexOf(name);
  const rows = (Array.isArray(source?.frames) ? source.frames : []).slice(0, 60000)
    .filter(row => Array.isArray(row) && finite(row[column('tMs')]) !== null);
  const at = row => row[column('tMs')];
  const worst = rows.filter(row => finite(row[column('gapMs')]) !== null)
    .sort((a, b) => b[column('gapMs')] - a[column('gapMs')]).slice(0, 3);
  const keys = 'gapMs dtMs calls triangles programs geometries textures renderScale heapMB flags'.split(' ');
  const events = Array.isArray(source?.events) ? source.events.slice(0, 10000) : [];
  const clock = source?.clock;
  const traceZero = finite(clock?.pageTimeMs) !== null && finite(clock?.traceTimeMs) !== null
    ? clock.pageTimeMs - clock.traceTimeMs : null;

  function projectEvent(event, center) {
    const projected = { name: event.name, dtFromCenterMs: event.tMs - center };
    if (event.name !== 'longtask' || traceZero === null ||
        finite(event.data?.startTime) === null || finite(event.data?.duration) === null ||
        event.data.duration < 0) return projected;
    const start = event.data.startTime - traceZero;
    return { ...projected, startAtMs: start, startDtFromCenterMs: start - center,
      durationMs: event.data.duration };
  }
  function windowFor(row, ordinal) {
    const center = at(row);
    const previous = rows.filter(candidate => at(candidate) < center)
      .reduce((last, candidate) => !last || at(candidate) > at(last) ? candidate : last, null);
    const gapStart = -Math.max(0, row[column('gapMs')]);
    const previousAt = previous ? at(previous) - center : null;
    const start = center + Math.min(-250, gapStart, previousAt ?? 0);
    const nearby = rows.filter(candidate => at(candidate) >= start && at(candidate) <= center + 250);
    const pinned = previous ? [previous, row] : [row];
    const selected = [...pinned, ...nearby.filter(candidate => !pinned.includes(candidate))
      .sort((a, b) => Math.abs(at(a) - center) - Math.abs(at(b) - center)).slice(0, 48 - pinned.length)]
      .sort((a, b) => at(a) - at(b));
    const projected = events.filter(event => finite(event?.tMs) !== null)
      .map(event => projectEvent(event, center));
    // Reuse the feedback sanitizer's closed event vocabulary and task-overlap
    // semantics before choosing the bounded closest context rows.
    const allowed = [];
    for (let index = 0; index < projected.length; index += 32) {
      allowed.push(...sanitizeFeedbackTimingWindows({ windows: [{ kind: 'worst-frame',
        gapStartDtFromCenterMs: gapStart, precedingFrameDtFromCenterMs: previousAt,
        frames: [], events: projected.slice(index, index + 32) }] }).windows[0].events);
    }
    const eventDistance = event => event.name === 'longtask' && finite(event.startDtFromCenterMs) !== null
      ? Math.abs(Math.min(Math.max(0, event.startDtFromCenterMs), event.startDtFromCenterMs + event.durationMs))
      : Math.abs(event.dtFromCenterMs);
    const selectedEvents = allowed.sort((a, b) => eventDistance(a) - eventDistance(b)).slice(0, 32)
      .sort((a, b) => a.dtFromCenterMs - b.dtFromCenterMs);
    return { kind: 'worst-frame', ordinal: ordinal + 1, atMs: center,
      gapStartDtFromCenterMs: gapStart, precedingFrameDtFromCenterMs: previousAt,
      gapStartedBeforeSample: center + gapStart < 0,
      frameRowsOmitted: Math.max(0, nearby.length - selected.length),
      eventRowsOmitted: Math.max(0, allowed.length - selectedEvents.length),
      frames: selected.map(candidate => ({ dtFromCenterMs: at(candidate) - center,
        ...Object.fromEntries(keys.map(key => [key, finite(candidate[column(key)])])) })),
      events: selectedEvents };
  }
  return sanitizeFeedbackTimingWindows({ traceClockReadSpanMs: clock?.readSpanMs,
    windows: worst.map(windowFor) });
}

function clientHealth(report = {}) {
  const network = report.network;
  return {
    errorCount: size(report.errors),
    events: { ...metrics(report.events, 'fired hits damage destroyed'),
      uniqueShooters: Object.keys(report.events?.firedBy || {}).length },
    motion: metrics(report.motion, 'samples maxStepM maxShortFrameStepM maxExcessStepM maxBackstepM'),
    network: { connected: boolean(network?.connected),
      ...metrics(network, 'rttMs rttJitterMs snapshotPacketsReceived estimatedMissingSnapshots estimatedSnapshotLoss inputAckLag pendingInputEdges transportBufferedBytes pendingEventBatches inputPacketsSubmitted'),
      prediction: metrics(network?.prediction, 'reconciliations hardSnaps terminalSyncs replayedInputs droppedHistory maxPositionErrorM maxFreePositionErrorM maxContactPositionErrorM contactReconciliations lastPositionErrorM maxCorrectionStepM maxVerticalCorrectionStepM pendingInputs correctionM') },
  };
}

function renderedHealth(report = {}) {
  return { ...clientHealth(report),
    phase: ['battle', 'garage'].includes(report.phase) ? report.phase : null,
    result: ['victory', 'defeat', 'draw'].includes(report.result) ? report.result : null,
    ...metrics(report, 'rosterSize visibleRosterSize glError'), errorOverlay: boolean(report.errorOverlay),
    trace: metrics(report.trace, 'durationMs frames framesDropped events eventsDropped gapP50 gapP95 gapP99 maxGapMs spikes freezes liveSpikes liveFreezes longTasks longTaskMs'),
    traceClock: metrics(report.traceClock, 'pageTimeMs traceTimeMs readSpanMs'),
    predictionCombatBaseline: metrics(report.predictionCombatBaseline, 'hardSnaps droppedHistory maxPositionErrorM'),
    timingWindows: sanitizeFeedbackTimingWindows(report.timingWindows),
    renderer: metrics(report.renderer, 'calls triangles programs'),
    newProgramCount: size(report.newPrograms),
    presentation: metrics(report.presentation, 'pending emitted peakPending visualDestroyCount visualDestroyTotalMs visualDestroyMaxMs'),
    simulation: metrics(report.telemetry?.simulation, 'tanks'),
    world: metrics(report.telemetry?.world, 'obstacles colliders'),
    quality: { ...metrics(report.telemetry?.quality, 'renderScale dynScale dpr outputPixels'),
      preset: ['low', 'medium', 'high', 'ultra'].includes(report.telemetry?.quality?.preset)
        ? report.telemetry.quality.preset : null },
    canvas: metrics(report.canvas, 'width height'),
    glErrors: metrics(report.glErrors, 'preCombat beforeShadowProbe afterShadowProbe'),
    glBufferErrorCount: size(report.glBufferDiagnostics?.errors),
    shadows: { enabled: boolean(report.shadows?.enabled), shaderErrors: finite(report.shadows?.shaderErrors),
      cascadeCount: size(report.shadows?.cascades) },
    shadowSample: { skipped: boolean(report.shadowSample?.skipped),
      ...metrics(report.shadowSample, 'changedPixelRatio darkenedPixelRatio meanAbsLumaDelta') },
  };
}

function authorityOutcome(authority) {
  const movementM = [];
  const damageByTeam = { alpha: 0, bravo: 0 };
  for (const [id, before] of Object.entries(authority?.start || {}).slice(0, 14)) {
    const after = authority?.final?.[id];
    if (!after || !before) continue;
    movementM.push(finite(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)));
    if (['alpha', 'bravo'].includes(before.team) && finite(before.hp) !== null && finite(after.hp) !== null) {
      damageByTeam[before.team] += Math.max(0, before.hp - after.hp);
    }
  }
  return { movementM, damageByTeam };
}

/** Shareable evidence. Raw local diagnostic files retain their historical private scope. */
export function sanitizeLiveCombatHealth(source = {}) {
  const authority = source.authority;
  const capture = source.frameTrace;
  return { version: 1, gateState: 'not-evaluated',
    role: ['host', 'client'].includes(source.role) ? source.role : null,
    measuredDurationMs: finite(source.measuredDurationMs), diagnosticOverhead: !!capture,
    profile: { ...metrics(source.profile, 'players teamSize durationMs settleMs latencyMs jitterMs lossPercent inputLossPercent certificationBattleLimitS'),
      completeMatch: boolean(source.profile?.completeMatch),
      map: source.profile?.map === 'winter' ? 'winter' : null,
      roster: source.profile?.roster === 'm60a2' ? 'm60a2' : null },
    authority: { ...metrics(authority, 'tick averageAdvanceMs maxAdvanceMs'),
      stats: metrics(authority?.stats, 'invalidMessages droppedCatchUpMs steps'),
      combatBaseline: metrics(authority?.combatBaseline, 'invalidMessages droppedCatchUpMs steps'),
      ...authorityOutcome(authority) },
    rendered: renderedHealth(source.rendered),
    clients: (Array.isArray(source.clients) ? source.clients : []).slice(0, 14)
      .map((report, index) => ({ slot: index + 1, ...clientHealth(report) })),
    browserErrorCount: size(source.browserErrors), browserGlWarningCount: size(source.browserGlWarnings),
    frameTrace: capture ? { captureComplete: boolean(capture.captureComplete ?? capture.complete),
      complete: boolean(capture.complete), attributionValid: boolean(capture.attributionValid),
      clockAligned: boolean(capture.clockAligned), captureLimitMs: 30000,
      coverage: capture.requestedWindow ? 'delayed diagnostic window; not whole-battle coverage'
        : 'bounded capture; align intervals with rendered.traceClock',
      requestedWindow: capture.requestedWindow ? metrics(capture.requestedWindow, 'delayMs durationMs') : null,
      windowFullyCaptured: boolean(capture.windowFullyCaptured),
      ...metrics(capture, 'baselinePageTimeMs captureEndPageTimeMs clockDriftMs rowsDropped malformed openDurationEvents'),
      rowCount: size(capture.rows), dataLossOccurred: boolean(capture.dataLossOccurred) } : null,
  };
}

export async function persistLiveCombatHealth(source, path, write = writeFile) {
  const receipt = sanitizeLiveCombatHealth(source);
  await write(path, `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

function validateFrameTraceWindow(window, enabled) {
  if (!window) return;
  if (!enabled || !Number.isInteger(window.delayMs) || window.delayMs < 0 || window.delayMs > 30000 ||
      !Number.isInteger(window.durationMs) || window.durationMs < 1 || window.durationMs > 30000) {
    throw new TypeError('frame_trace_window_invalid');
  }
}

export function parseLiveCombatFrameTraceWindow(args) {
  const values = args.filter(arg => arg.startsWith('--frame-trace-window'));
  if (!values.length) return null;
  if (values.length !== 1 || !/^--frame-trace-window=\d+,\d+$/.test(values[0])) {
    throw new TypeError('frame_trace_window_invalid');
  }
  const [delayMs, durationMs] = values[0].slice('--frame-trace-window='.length).split(',').map(Number);
  const window = { delayMs, durationMs };
  validateFrameTraceWindow(window, args.includes('--frame-trace'));
  return window;
}

const failedFrameTrace = failure => ({ complete: false, failure, diagnosticOverhead: true });
function qualifyLiveCombatCapture(capture) {
  const clockAligned = finite(capture.clockDriftMs) !== null && Math.abs(capture.clockDriftMs) <= 2;
  const complete = capture.complete === true && clockAligned;
  return { ...capture, captureComplete: capture.complete === true, clockAligned,
    complete, attributionValid: complete };
}
async function stopLiveCombatCapture(capture) {
  try { return qualifyLiveCombatCapture(await capture.stop()); }
  catch { return failedFrameTrace('frame_trace_stop_failed'); }
}

function windowCaptureReceipt(capture, window) {
  const { baselinePageTimeMs: first, captureEndPageTimeMs: last } = capture;
  const windowFullyCaptured = finite(first) !== null && finite(last) !== null &&
    last - first >= window.durationMs;
  const complete = capture.complete === true && windowFullyCaptured;
  return { ...capture, captureComplete: capture.captureComplete ?? capture.complete === true,
    complete, attributionValid: complete && capture.attributionValid === true,
    requestedWindow: { delayMs: window.delayMs, durationMs: window.durationMs }, windowFullyCaptured,
    coverage: 'delayed diagnostic window; not whole-battle coverage; align intervals with rendered.traceClock' };
}

function scheduleLiveCombatCapture(page, start, window, timers) {
  let finished = false, pending = null;
  const timer = timers.setTimeout(() => {
    if (finished) return;
    // Start owns its bounded admission cleanup. Keep rejection handled even
    // while measurement continues; a failed capture cannot satisfy the gate.
    pending = Promise.resolve().then(() => start(page, { durationMs: window.durationMs }))
      .then(capture => ({ capture }), () => ({ failure: 'frame_trace_start_failed' }));
  }, window.delayMs);
  return async () => {
    finished = true;
    timers.clearTimeout(timer);
    const admitted = pending ? await pending : { failure: 'frame_trace_window_not_started' };
    const capture = admitted.failure ? failedFrameTrace(admitted.failure)
      : await stopLiveCombatCapture(admitted.capture);
    return windowCaptureReceipt(capture, window);
  };
}

/** Optional tracing has overhead; a delayed window starts relative to measure() invocation. */
export async function withLiveCombatFrameTrace(page, enabled, measure, start = startMultiplayerFrameTrace,
  { window = null, timers = { setTimeout, clearTimeout } } = {}) {
  validateFrameTraceWindow(window, enabled);
  if (!enabled) return { value: await measure(), frameTrace: null };
  const capture = window ? null : await start(page, { durationMs: 30000 });
  const finish = window ? scheduleLiveCombatCapture(page, start, window, timers)
    : () => stopLiveCombatCapture(capture);
  let value, failure, failed = false;
  try { value = await measure(); } catch (error) { failure = error; failed = true; }
  const frameTrace = await finish();
  if (failed) throw failure;
  return { value, frameTrace };
}

function numericArg(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find((entry) => entry.startsWith(prefix));
  const value = raw ? Number(raw.slice(prefix.length)) : fallback;
  if (!Number.isFinite(value) || value < 0) throw new TypeError(`${name} must be non-negative`);
  return value;
}

const PLAYER_COUNT = 14;
const TEAM_SIZE = 7;
const MAP_ID = 'winter';
const SPEC_ID = 'm60a2';
const CAMO_IDS = ['factory', 'summer', 'winter', 'digital', 'merdc', 'splinter', 'dazzle'];
const durationMs = numericArg('duration', 15_000);
const settleMs = numericArg('settle', 2_500);
const stalematePursuitDelayMs = numericArg('pursuit-delay', 25_000);
const latencyMs = numericArg('latency', 45);
const jitterMs = numericArg('jitter', 15);
const lossPercent = numericArg('loss', 3);
const inputLossPercent = numericArg('input-loss', 2);
const timeoutMs = numericArg('timeout', 180_000);
const matchTimeoutMs = numericArg('match-timeout', 90_000);
const certificationBattleLimitS = numericArg('battle-limit', 60);
const completeMatch = process.argv.includes('--complete-match');
const glBufferDiagnostics = process.argv.includes('--gl-buffer-diagnostics');
const frameTraceDiagnostics = process.argv.includes('--frame-trace');
const frameTraceWindow = parseLiveCombatFrameTraceWindow(process.argv);
const onlyRoleArg = process.argv.find((entry) => entry.startsWith('--only='));
const onlyRole = onlyRoleArg?.slice('--only='.length) || null;
if (onlyRole && onlyRole !== 'host' && onlyRole !== 'client') {
  throw new TypeError('only must be host or client');
}
const artifactDir = resolve('.qa-dev/multiplayer-live-7v7');
const root = new URL('..', import.meta.url).pathname;
const browserErrors = [];
const browserGlWarnings = [];
const contextByPage = new WeakMap();

let vite = null;
let signaling = null;
let browser = null;

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms));

function observePage(page, label) {
  page.on('pageerror', (error) => browserErrors.push(`${label}: ${error.stack || error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'warn' || message.type() === 'warning') {
      const text = message.text();
      if (/WebGL|\bGL_(?:INVALID|OUT_OF_MEMORY|CONTEXT_LOST)|\bGL error\b/i.test(text)) {
        browserGlWarnings.push(`${label}: ${text}`);
      }
    }
    if (message.type() === 'error' && !message.text().startsWith('Failed to load resource:')) {
      browserErrors.push(`${label}: ${message.text()}`);
    }
  });
  page.on('requestfailed', (request) => {
    browserErrors.push(
      `${label}: request failed ${request.url()} (${request.failure()?.errorText || 'unknown error'})`,
    );
  });
}

async function openPlayers(origin, renderedRole) {
  const pages = [];
  for (let index = 0; index < PLAYER_COUNT; index++) {
    const role = index === 0 ? 'host' : 'client';
    const full = role === renderedRole && (renderedRole === 'host' || index === 1);
    // Use a pristine browser profile for each commander. Sharing Chromium's
    // default context shares HTTP cache, storage, workers, and credentials,
    // which does not represent fourteen first-time players joining a room.
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    contextByPage.set(page, context);
    const label = `${renderedRole}-run-player-${index + 1}${full ? '-rendered' : ''}`;
    observePage(page, label);
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
    if (full) {
      if (glBufferDiagnostics) await page.evaluateOnNewDocument(installGlBufferProbe);
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', {
          configurable: true,
          get: () => 8,
        });
        Object.defineProperty(Navigator.prototype, 'deviceMemory', {
          configurable: true,
          get: () => 8,
        });
      });
    }
    const params = new URLSearchParams();
    if (full) {
      params.set('nosplash', '1');
      params.set('tier', 'desktop');
      params.set('gfxreset', '1');
    }
    // One representative remote player carries the adverse profile in both
    // runs (and is the fully rendered player in the client run). Applying
    // timer-based control latency to all thirteen background QA tabs makes
    // Chromium's background-timer policy part of the lobby ready barrier,
    // which is not representative of thirteen separate player machines.
    if (index === 1) {
      params.set('netSim', '1');
      params.set('netLatency', String(latencyMs));
      params.set('netJitter', String(jitterMs));
      params.set('netLoss', String(lossPercent));
      params.set('netInputLoss', String(inputLossPercent));
    }
    const path = full ? '/' : '/tools/multiplayer-browser-soak.html';
    await page.goto(`${origin}${path}?${params}`, {
      waitUntil: 'domcontentloaded',
      timeout: 180_000,
    });
    if (full) {
      await page.waitForFunction(
        () => window.__GAME_READY === true && window.__DEV_TRACE?.enabled === true,
        { timeout: 240_000 },
      );
    }
    await page.evaluate(({ isFull, pageIndex }) => {
      globalThis.__COT_LIVE_7V7 = {
        full: isFull,
        pageIndex,
        errors: [],
        lastLobby: null,
        startingLobby: null,
        eventCounts: { fired: 0, hits: 0, damage: 0, destroyed: 0, firedBy: {} },
        motion: {
          samples: 0,
          maxStepM: 0,
          maxShortFrameStepM: 0,
          maxExcessStepM: 0,
          maxBackstepM: 0,
          last: null,
        },
        advanceDurations: [],
      };
    }, { isFull: full, pageIndex: index });
    pages.push(page);
  }
  return pages;
}

async function createLobby(pages, signalUrl) {
  const [hostPage, ...guestPages] = pages;
  const room = await hostPage.evaluate(async ({ url, mapId, specId }) => {
    const state = globalThis.__COT_LIVE_7V7;
    const [{ RoomSignalingClient }, { PrivateRoomHostSession }] = await Promise.all([
      import('/src/net/signalingClient.ts'),
      import('/src/net/privateRoomSession.ts'),
    ]);
    state.signaling = new RoomSignalingClient({ url });
    state.roomInfo = await state.signaling.createRoom({
      player: { id: 'live-p1', name: 'Commander' },
      mode: 'lan',
      maxPlayers: 14,
    });
    state.session = new PrivateRoomHostSession({
      signaling: state.signaling,
      roomInfo: state.roomInfo,
      hostName: 'Commander',
      hostSpecId: specId,
      hostCamo: 'factory',
      mapId,
      teamSize: 7,
      onStart: (lobby) => { state.startingLobby = lobby; },
      onError: (error) => state.errors.push(error.message),
    });
    state.unsubscribeLobby = state.session.runtime.onState((lobby) => { state.lastLobby = lobby; });
    return state.roomInfo;
  }, { url: signalUrl, mapId: MAP_ID, specId: SPEC_ID });

  await Promise.all(guestPages.map((page, guestIndex) => page.evaluate(
    async ({ url, roomCode, index, specId, camo }) => {
      const state = globalThis.__COT_LIVE_7V7;
      const [{ RoomSignalingClient }, { PrivateRoomClientSession }] = await Promise.all([
        import('/src/net/signalingClient.ts'),
        import('/src/net/privateRoomSession.ts'),
      ]);
      state.signaling = new RoomSignalingClient({ url });
      state.roomInfo = await state.signaling.joinRoom({
        roomCode,
        player: { id: `live-p${index + 1}`, name: 'Commander' },
      });
      state.session = new PrivateRoomClientSession({
        signaling: state.signaling,
        roomInfo: state.roomInfo,
        onError: (error) => state.errors.push(error.message),
      });
      state.runtime = await state.session.ready;
      state.unsubscribeLobby = state.runtime.onState((lobby) => { state.lastLobby = lobby; });
      await state.session.submit({ type: 'select_vehicle', specId });
      await state.session.submit({ type: 'select_camo', camo });
      return state.roomInfo;
    },
    {
      url: signalUrl,
      roomCode: room.roomCode,
      index: guestIndex + 1,
      specId: SPEC_ID,
      camo: CAMO_IDS[(guestIndex + 1) % CAMO_IDS.length],
    },
  )));

  await hostPage.waitForFunction(
    (count) => globalThis.__COT_LIVE_7V7?.session?.runtime?.peers?.size === count - 1,
    { timeout: timeoutMs }, PLAYER_COUNT,
  );
  await Promise.all(guestPages.map((page) => page.waitForFunction(
    (count) => globalThis.__COT_LIVE_7V7?.lastLobby?.players?.length === count,
    { timeout: timeoutMs }, PLAYER_COUNT,
  )));
  await hostPage.waitForFunction(
    (count) => new Set(globalThis.__COT_LIVE_7V7?.lastLobby?.players?.map((player) => player.camo)).size === count,
    { timeout: timeoutMs }, CAMO_IDS.length,
  );

  const lobby = await hostPage.evaluate(() => globalThis.__COT_LIVE_7V7.lastLobby);
  assert.equal(lobby.players.length, PLAYER_COUNT);
  assert.equal(lobby.teamSize, TEAM_SIZE);
  assert.equal(lobby.players.filter((player) => player.team === 'alpha').length, TEAM_SIZE);
  assert.equal(lobby.players.filter((player) => player.team === 'bravo').length, TEAM_SIZE);
  assert.equal(new Set(lobby.players.map((player) => player.name.toLowerCase())).size, PLAYER_COUNT);
  assert.deepEqual(new Set(lobby.players.map((player) => player.camo)), new Set(CAMO_IDS),
    'the live duplicate-tank roster retains all seven selected camo variants');

  await Promise.all([
    hostPage.evaluate(() => globalThis.__COT_LIVE_7V7.session.command({
      type: 'set_ready', ready: true,
    })),
    ...guestPages.map((page) => page.evaluate(() =>
      globalThis.__COT_LIVE_7V7.session.submit({ type: 'set_ready', ready: true }))),
  ]);
  await hostPage.waitForFunction(
    () => globalThis.__COT_LIVE_7V7.lastLobby?.players?.every((player) => player.ready),
    { timeout: timeoutMs },
  );
  await hostPage.evaluate(() => globalThis.__COT_LIVE_7V7.session.command({
    type: 'start', matchSeed: 0x7C07CAFE,
  }));
  const startDeadline = Date.now() + timeoutMs;
  let startState = null;
  while (Date.now() < startDeadline) {
    const [host, guests] = await Promise.all([
      hostPage.evaluate(() => ({
        phase: globalThis.__COT_LIVE_7V7.startingLobby?.phase || null,
        revision: globalThis.__COT_LIVE_7V7.startingLobby?.revision ?? null,
        errors: globalThis.__COT_LIVE_7V7.errors,
      })),
      Promise.all(guestPages.map((page) => page.evaluate(() => {
        const state = globalThis.__COT_LIVE_7V7;
        return {
          playerId: state.roomInfo.peerId,
          phase: state.lastLobby?.phase || null,
          revision: state.lastLobby?.revision ?? null,
          closed: state.session.runtime.closed,
          errors: [...state.errors, ...state.session.runtime.errors],
          transport: state.session.runtime.getStats().transport,
        };
      }))),
    ]);
    startState = { host, guests };
    if (host.phase === 'starting' && guests.every((guest) => guest.phase === 'starting')) break;
    await wait(50);
  }
  assert.equal(startState?.host?.phase, 'starting',
    `host must enter starting: ${JSON.stringify(startState)}`);
  assert.equal(startState.guests.every((guest) => guest.phase === 'starting'), true,
    `all 13 guests must receive starting: ${JSON.stringify(startState)}`);
  return lobby;
}

async function stageFormation(hostPage, renderedRole, lobby) {
  return hostPage.evaluate(({ role, lobbyState, teamSize }) => {
    const state = globalThis.__COT_LIVE_7V7;
    const runtime = role === 'host' ? state.session.matchRuntime : state.match.host;
    const simulation = runtime.simulation;
    const collision = role === 'host' ? window.__DEBUG.world : state.worldCollision;
    if (!simulation || !collision) throw new Error('live authority/collision world is unavailable');
    const height = collision.heightField;
    const heightAt = height.getHeightAtFast || height.getHeightAt.bind(height);
    const obstacles = [];
    const pointClear = (x, z, radius = 4.8) => {
      obstacles.length = 0;
      collision.queryObstacles(x - radius, z - radius, x + radius, z + radius, obstacles);
      if (obstacles.some((obstacle) => !obstacle.crushed &&
        obstacle.max[0] >= x - radius && obstacle.min[0] <= x + radius &&
        obstacle.max[2] >= z - radius && obstacle.min[2] <= z + radius)) return false;
      const samples = [
        heightAt(x, z), heightAt(x + 3.5, z), heightAt(x - 3.5, z),
        heightAt(x, z + 3.5), heightAt(x, z - 3.5),
      ];
      return Math.max(...samples) - Math.min(...samples) < 0.9;
    };
    const teams = {
      alpha: lobbyState.players.filter((player) => player.team === 'alpha'),
      bravo: lobbyState.players.filter((player) => player.team === 'bravo'),
    };
    const laneSpacing = 10.5;
    const halfDepth = 32;
    const formationCandidates = () => {
      const candidates = [];
      for (let radius = 0; radius <= 320; radius += 40) {
        for (let x = -radius; x <= radius; x += 40) {
          candidates.push([x, -radius], [x, radius]);
        }
        for (let z = -radius + 40; z <= radius - 40; z += 40) {
          candidates.push([-radius, z], [radius, z]);
        }
      }
      return candidates;
    };
    const makePoints = (cx, cz, axis) => Array.from({ length: teamSize }, (_, index) => {
      const lateral = (index - (teamSize - 1) / 2) * laneSpacing;
      return axis === 'z'
        ? {
          alpha: { x: cx + lateral, z: cz - halfDepth, yaw: 0 },
          bravo: { x: cx + lateral, z: cz + halfDepth, yaw: Math.PI },
        }
        : {
          alpha: { x: cx - halfDepth, z: cz + lateral, yaw: Math.PI / 2 },
          bravo: { x: cx + halfDepth, z: cz + lateral, yaw: -Math.PI / 2 },
        };
    });
    const laneHasLineOfSight = (lane) => {
      const anchor = simulation.entityById.get(teams.alpha[0].id);
      const origin = anchor.state.pos.clone().set(
        lane.alpha.x, heightAt(lane.alpha.x, lane.alpha.z) + 2.1, lane.alpha.z,
      );
      const target = anchor.state.pos.clone().set(
        lane.bravo.x, heightAt(lane.bravo.x, lane.bravo.z) + 2.1, lane.bravo.z,
      );
      const direction = target.clone().sub(origin);
      const distance = direction.length();
      direction.multiplyScalar(1 / distance);
      const hit = collision.raycast(origin, direction, distance - 2);
      return !hit || hit.dist >= distance - 2.5;
    };
    const validFormationAt = (cx, cz, axis) => {
      const points = makePoints(cx, cz, axis);
      const clear = points.every((lane) => pointClear(lane.alpha.x, lane.alpha.z)
        && pointClear(lane.bravo.x, lane.bravo.z));
      return clear && points.every(laneHasLineOfSight)
        ? { cx, cz, axis, points } : null;
    };
    const selectFormation = () => {
      for (const [cx, cz] of formationCandidates()) {
        for (const axis of ['z', 'x']) {
          const candidate = validFormationAt(cx, cz, axis);
          if (candidate) return candidate;
        }
      }
      return null;
    };
    const selected = selectFormation();
    if (!selected) throw new Error('no clear seven-lane live-combat formation was found');

    const pairById = {};
    const resetEntityForFormation = (player, target, pose) => {
      const entity = simulation.entityById.get(player.id);
      const y = heightAt(pose.x, pose.z);
      entity.state.pos.set(pose.x, y, pose.z);
      entity.state.yaw = pose.yaw;
      entity.state.speed = 0;
      entity.state.yawRate = 0;
      entity.state.visualPitch = 0;
      entity.state.visualRoll = 0;
      entity.state.turretYaw = 0;
      entity.state.gunPitch = 0;
      entity.state.turretYawRate = 0;
      entity.state._prevSpeed = 0;
      entity.state._spool = 0;
      entity.state._ride.y = y;
      entity.state._ride.v = 0;
      entity.state._ride.supportY = y;
      entity.state._sup.x = NaN;
      entity.state._sup.z = NaN;
      entity.combat.hp = entity.combat.maxHp;
      entity.combat.destroyed = false;
      entity.combat.reload.t = 0;
      entity.input.throttle = 0;
      entity.input.steer = 0;
      entity.input.brake = true;
      entity.input.fire = false;
      pairById[player.id] = { targetId: target.id, team: player.team, yaw: pose.yaw };
    };
    for (let index = 0; index < teamSize; index++) {
      const alpha = teams.alpha[index];
      const bravo = teams.bravo[index];
      const lane = selected.points[index];
      for (const [player, target, pose] of [
        [alpha, bravo, lane.alpha],
        [bravo, alpha, lane.bravo],
      ]) {
        resetEntityForFormation(player, target, pose);
      }
    }
    state.formation = {
      center: [selected.cx, selected.cz],
      axis: selected.axis,
      pairById,
    };
    state.authorityStart = Object.fromEntries([...simulation.entityById].map(([id, entity]) => [id, {
      x: entity.state.pos.x,
      y: entity.state.pos.y,
      z: entity.state.pos.z,
      hp: entity.combat.hp,
      team: entity.team,
    }]));
    const originalAdvance = runtime.advance.bind(runtime);
    runtime.advance = (elapsedMs) => {
      const startedAt = performance.now();
      const result = originalAdvance(elapsedMs);
      state.advanceDurations.push(performance.now() - startedAt);
      return result;
    };
    return state.formation;
  }, { role: renderedRole, lobbyState: lobby, teamSize: TEAM_SIZE });
}

async function triggerGuestLight(page) {
  await page.evaluate(() => {
    const state = globalThis.__COT_LIVE_7V7;
    state.handoffDone = false;
    state.handoffError = null;
    state.handoffPromise = (async () => {
      const { beginPrivateClientMatch } = await import('/src/net/privateMatchHandoff.ts');
      state.match = await beginPrivateClientMatch({
        session: state.session,
        playerId: state.roomInfo.peerId,
        lobbyState: state.lastLobby,
      });
      state.unsubscribeEvents = state.match.client.onEvent((event) => {
        const counts = state.eventCounts;
        if (event.type === 'shell_fired') {
          counts.fired++;
          counts.firedBy[event.shooterId] = (counts.firedBy[event.shooterId] || 0) + 1;
        } else if (event.type === 'shell_hit') {
          counts.hits++;
          counts.damage += Math.max(0, Number(event.damage) || 0);
        } else if (event.type === 'tank_destroyed') counts.destroyed++;
      });
      const handshakeDeadline = performance.now() + 30_000;
      while ((!state.match.client.connected || state.match.client.buffer.snapshots.length === 0) &&
             performance.now() < handshakeDeadline) {
        state.match.update(performance.now());
        await new Promise((resolvePoll) => setTimeout(resolvePoll, 16));
      }
      if (!state.match.client.connected || state.match.client.buffer.snapshots.length === 0) {
        throw new Error('fresh match welcome/snapshot handshake timed out');
      }
      if (!state.match.ready()) throw new Error('guest ready message was not sent');
      state.readyTimer = setInterval(() => {
        const phase = state.sample?.meta?.phase;
        if (phase === 'countdown' || phase === 'playing') {
          clearInterval(state.readyTimer);
          state.readyTimer = null;
        } else {
          state.match.ready();
        }
      }, 1000);
      state.pumpTimer = setInterval(() => {
        const sample = state.match.update(performance.now());
        if (sample) state.sample = sample;
      }, 16);
      state.handoffDone = true;
    })().catch((error) => {
      state.handoffError = error?.stack || error?.message || String(error);
    });
    return true;
  });
}

async function waitGuestLight(page, label) {
  await page.waitForFunction(
    () => globalThis.__COT_LIVE_7V7?.handoffDone || globalThis.__COT_LIVE_7V7?.handoffError,
    { timeout: timeoutMs, polling: 25 },
  );
  const state = await page.evaluate(() => ({
    done: globalThis.__COT_LIVE_7V7.handoffDone,
    error: globalThis.__COT_LIVE_7V7.handoffError,
    sessionErrors: globalThis.__COT_LIVE_7V7.errors,
  }));
  assert.equal(state.done, true, `${label} handoff failed: ${JSON.stringify(state)}`);
}

async function beginFullEntry(page, renderedRole) {
  await page.evaluate(({ role, complete, battleLimitS }) => {
    const state = globalThis.__COT_LIVE_7V7;
    state.entryFrames = [];
    const sample = () => {
      state.entryFrames.push({
        loaderVisible: !!document.querySelector('.cot-bl.on'),
        phase: window.__DEBUG.game.phase,
      });
      if (window.__DEBUG.game.phase !== 'battle' && state.entryFrames.length < 2400) {
        requestAnimationFrame(sample);
      }
    };
    requestAnimationFrame(sample);
    const lobbyState = role === 'host' ? state.startingLobby : state.lastLobby;
    state.entry = window.__DEBUG.beginNetworkBattle({
      role,
      session: state.session,
      lobbyState,
      battleLimitS: complete ? battleLimitS : undefined,
    }).then((result) => { state.entryResult = result; })
      .catch((error) => { state.errors.push(error.message); state.entryResult = false; });
    state.entryTransition = {
      loaderVisible: !!document.querySelector('.cot-bl.on'),
      phase: window.__DEBUG.game.phase,
    };
  }, { role: renderedRole, complete: completeMatch, battleLimitS: certificationBattleLimitS });
}

async function beginHostLight(page, lobby) {
  await page.evaluate(async ({ lobbyState, complete, battleLimitS }) => {
    const state = globalThis.__COT_LIVE_7V7;
    const [{ beginPrivateHostMatch }, { createDedicatedWorldCollision }] = await Promise.all([
      import('/src/net/privateMatchHandoff.ts'),
      import('/server/dedicatedWorldCollision.ts'),
      // Side-effect-only fleet registration. The full app imports this chain
      // through main.ts; the lightweight authority page deliberately does not.
      import('/src/vehicles/tankFactory.ts'),
    ]);
    state.worldCollision = createDedicatedWorldCollision(lobbyState.mapId);
    state.match = beginPrivateHostMatch({
      session: state.session,
      lobbyState: state.startingLobby,
      worldCollision: state.worldCollision,
      battleLimitS: complete ? battleLimitS : undefined,
    });
    state.unsubscribeEvents = state.match.client.onEvent((event) => {
      const counts = state.eventCounts;
      if (event.type === 'shell_fired') {
        counts.fired++;
        counts.firedBy[event.shooterId] = (counts.firedBy[event.shooterId] || 0) + 1;
      } else if (event.type === 'shell_hit') {
        counts.hits++;
        counts.damage += Math.max(0, Number(event.damage) || 0);
      } else if (event.type === 'tank_destroyed') counts.destroyed++;
    });
  }, { lobbyState: lobby, complete: completeMatch, battleLimitS: certificationBattleLimitS });
}

async function startHostLightPump(page) {
  await page.evaluate(() => {
    const state = globalThis.__COT_LIVE_7V7;
    state.match.ready();
    state.pumpTimer = setInterval(() => {
      const frame = state.nextInput || null;
      state.sample = state.match.advance(1000 / 60, frame);
    }, 1000 / 60);
  });
}

async function prepareRun(pages, renderedRole, lobby) {
  const [hostPage, ...guestPages] = pages;
  const fullPage = renderedRole === 'host' ? hostPage : guestPages[0];
  await fullPage.bringToFront();
  let formation;
  if (renderedRole === 'host') {
    await beginFullEntry(hostPage, renderedRole);
    await Promise.all(guestPages.map((page) => triggerGuestLight(page)));
    await hostPage.waitForFunction(
      () => globalThis.__COT_LIVE_7V7?.session?.matchRuntime?.simulation && window.__DEBUG.world,
      { timeout: timeoutMs, polling: 10 },
    );
    formation = await stageFormation(hostPage, renderedRole, lobby);
    await Promise.all(guestPages.map((page, index) =>
      waitGuestLight(page, `host run guest ${index + 2}`)));
  } else {
    await beginHostLight(hostPage, lobby);
    formation = await stageFormation(hostPage, renderedRole, lobby);
    await startHostLightPump(hostPage);
    await beginFullEntry(fullPage, renderedRole);
    await Promise.all(guestPages.slice(1).map((page) => triggerGuestLight(page)));
    await Promise.all(guestPages.slice(1).map((page, index) =>
      waitGuestLight(page, `client run guest ${index + 3}`)));
  }

  const battleDeadline = Date.now() + timeoutMs;
  let battleState = null;
  while (Date.now() < battleDeadline) {
    battleState = await fullPage.evaluate(() => {
      const state = globalThis.__COT_LIVE_7V7;
      const host = state.session?.matchRuntime;
      return {
        entryResult: state.entryResult ?? null,
        entryFailure: globalThis.__NETWORK_ENTRY_FAILURE || null,
        phase: window.__DEBUG.game.phase,
        preBattleS: window.__DEBUG.game.preBattleS,
        load: globalThis.__NETWORK_LOAD || null,
        errors: state.errors,
        authority: host ? {
          tick: host.tick,
          matchStarted: host.matchStarted,
          peers: [...host.peers.values()].map((peer) => ({
            id: peer.id,
            welcomed: peer.welcomed,
            ready: peer.ready,
          })),
        } : null,
      };
    });
    if (battleState.entryResult === false ||
        (battleState.phase === 'battle' && battleState.preBattleS <= 0)) break;
    await wait(50);
  }
  assert.ok(battleState && (battleState.entryResult === false ||
    (battleState.phase === 'battle' && battleState.preBattleS <= 0)),
  `${renderedRole} rendered battle did not open: ${JSON.stringify(battleState)}`);
  const entry = await fullPage.evaluate(() => ({
    result: globalThis.__COT_LIVE_7V7.entryResult,
    failure: globalThis.__NETWORK_ENTRY_FAILURE || null,
    transition: globalThis.__COT_LIVE_7V7.entryTransition,
    transitionFrames: globalThis.__COT_LIVE_7V7.entryFrames.length,
    exposedFrame: globalThis.__COT_LIVE_7V7.entryFrames.some((frame) =>
      !frame.loaderVisible && frame.phase !== 'battle'),
    blackCheck: globalThis.__NETWORK_LOAD?.blackCheck || null,
    rosterSize: window.__DEBUG.game.tankById.size,
  }));
  assert.notEqual(entry.result, false, `${renderedRole} entry failed: ${JSON.stringify(entry)}`);
  assert.equal(entry.transition?.loaderVisible, true, `${renderedRole} entry must cover first await`);
  assert.ok(entry.transitionFrames > 0, `${renderedRole} entry must render transition frames`);
  assert.equal(entry.exposedFrame, false,
    `${renderedRole} entry exposed a garage or blank frame`);
  assert.ok(entry.blackCheck && !entry.blackCheck.error,
    `${renderedRole} black-scene watchdog must pass`);
  assert.equal(entry.rosterSize, PLAYER_COUNT, `${renderedRole} renderer must mount all 14 tanks`);
  return { fullPage, formation, entry };
}

async function installFullCombatProbe(page, formation) {
  await page.evaluate((formationState) => {
    const state = globalThis.__COT_LIVE_7V7;
    state.formation = formationState;
    const counts = state.eventCounts;
    state.unsubscribeBus = [
      window.__DEBUG.bus.on('shell:fired', (event) => {
        counts.fired++;
        counts.firedBy[event.shooterId] = (counts.firedBy[event.shooterId] || 0) + 1;
      }),
      window.__DEBUG.bus.on('shell:hit', (event) => {
        counts.hits++;
        counts.damage += Math.max(0, Number(event.damage) || 0);
      }),
      window.__DEBUG.bus.on('tank:destroyed', () => { counts.destroyed++; }),
    ];
  }, formation);
}

async function baselineAuthority(hostPage, renderedRole) {
  await hostPage.evaluate((role) => {
    const state = globalThis.__COT_LIVE_7V7;
    const runtime = role === 'host' ? state.session.matchRuntime : state.match.host;
    state.authorityCombatBaseline = {
      invalidMessages: runtime.stats.invalidMessages,
      droppedCatchUpMs: runtime.stats.droppedCatchUpMs,
      steps: runtime.stats.steps,
    };
    state.advanceDurations.length = 0;
  }, renderedRole);
}

async function startLightCombat(page, isHost, formation) {
  await page.evaluate(({ host, formation: formationState, pursuitDelayMs }) => {
    const state = globalThis.__COT_LIVE_7V7;
    state.formation = formationState;
    state.combatEnabled = true;
    state.measureMotion = true;
    state.combatStartedAt = performance.now();
    const nearestEnemy = (own, enemies) => enemies.reduce((nearest, candidate) => {
      const distance = Math.hypot(candidate.x - own.x, candidate.z - own.z);
      return !nearest || distance < nearest.distance ? { entity: candidate, distance } : nearest;
    }, null)?.entity || null;
    const selectTarget = (playerId, pair, own, sample) => {
      const enemies = sample?.entities?.filter((entity) =>
        state.formation.pairById[entity.id]?.team !== pair.team && !entity.destroyed) || [];
      return enemies.find((entity) => entity.id === pair.targetId)
        || (own ? nearestEnemy(own, enemies) : null);
    };
    const recordMotion = (own, motionAtMs) => {
      if (!own || !state.measureMotion) return;
      const motion = state.motion;
      if (motion.last) {
        const dx = own.x - motion.last.x;
        const dy = own.y - motion.last.y;
        const dz = own.z - motion.last.z;
        const stepM = Math.hypot(dx, dy, dz);
        const elapsedS = Math.max(0, motionAtMs - motion.last.atMs) / 1000;
        const speedMps = Math.hypot(own.vx || 0, own.vy || 0, own.vz || 0);
        const expectedStepM = Math.max(speedMps, motion.last.speedMps || 0) * elapsedS;
        motion.maxStepM = Math.max(motion.maxStepM, stepM);
        if (elapsedS <= 0.025) {
          motion.maxShortFrameStepM = Math.max(motion.maxShortFrameStepM, stepM);
        }
        motion.maxExcessStepM = Math.max(
          motion.maxExcessStepM,
          Math.max(0, stepM - expectedStepM),
        );
        const previousYaw = Number.isFinite(motion.last.yaw) ? motion.last.yaw : own.yaw;
        const headingYaw = Math.atan2(
          Math.sin(previousYaw) + Math.sin(own.yaw),
          Math.cos(previousYaw) + Math.cos(own.yaw),
        );
        const forward = dx * Math.sin(headingYaw) + dz * Math.cos(headingYaw);
        motion.maxBackstepM = Math.max(motion.maxBackstepM, -forward);
      }
      motion.last = {
        x: own.x,
        y: own.y,
        z: own.z,
        yaw: own.yaw,
        atMs: motionAtMs,
        speedMps: Math.hypot(own.vx || 0, own.vy || 0, own.vz || 0),
      };
      motion.samples++;
    };
    const combatInput = (own, target, elapsed, driveElapsed) => {
      if (!state.combatEnabled || !own || own.destroyed || !target) return null;
      const dx = target.x - own.x;
      const dy = target.y + 1.5 - own.y;
      const dz = target.z - own.z;
      const horizontal = Math.hypot(dx, dz);
      const pursuit = driveElapsed >= pursuitDelayMs;
      const desiredYaw = Math.atan2(dx, dz);
      const yawError = Math.atan2(
        Math.sin(desiredYaw - own.yaw),
        Math.cos(desiredYaw - own.yaw),
      );
      const openingDrive = driveElapsed < 2500;
      return {
        throttle: openingDrive ? 0.35 : (pursuit ? (Math.abs(yawError) > 1.2 ? 0.3 : 0.55) : 0),
        steer: pursuit ? Math.max(-1, Math.min(1, yawError * 2.2)) : 0,
        brake: !openingDrive && !pursuit,
        fire: elapsed >= 1200,
        aimYaw: Math.atan2(dx, dz),
        aimPitch: Math.atan2(dy, Math.max(1e-6, horizontal)),
        aimDistance: Math.hypot(horizontal, dy),
        shellSlot: pursuit ? 2 : 0,
        actionBits: 0,
      };
    };
    const buildInput = () => {
      const motionAtMs = performance.now();
      const playerId = state.roomInfo.peerId;
      const pair = state.formation.pairById[playerId];
      const elapsed = motionAtMs - state.combatStartedAt;
      const driveElapsed = motionAtMs -
        (state.measurementStartedAt || state.combatStartedAt);
      const sample = state.sample;
      const own = sample?.entities?.find((entity) => entity.id === playerId);
      const target = selectTarget(playerId, pair, own, sample);
      recordMotion(own, motionAtMs);
      return combatInput(own, target, elapsed, driveElapsed);
    };
    if (host) {
      state.inputTimer = setInterval(() => { state.nextInput = buildInput(); }, 8);
    } else {
      clearInterval(state.pumpTimer);
      state.pumpTimer = setInterval(() => {
        const input = buildInput();
        if (input) state.match.submitInput(input);
        const sample = state.match.update(performance.now());
        if (sample) state.sample = sample;
      }, 16);
    }
  }, { host: isHost, formation, pursuitDelayMs: stalematePursuitDelayMs });
}

async function startFullCombat(page, formation) {
  await page.evaluate(({ formation: formationState, pursuitDelayMs }) => {
    const state = globalThis.__COT_LIVE_7V7;
    state.formation = formationState;
    state.combatEnabled = true;
    state.measureMotion = true;
    state.combatStartedAt = performance.now();
    const playerId = state.roomInfo.peerId;
    const pair = formationState.pairById[playerId];
    const keyDown = new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true });
    window.dispatchEvent(keyDown);
    state.stopDrivingTimer = setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
    }, 2500);
    state.pursuitKeys = new Set();
    const setPursuitKey = (code, key, down) => {
      const held = state.pursuitKeys.has(code);
      if (held === down) return;
      if (down) state.pursuitKeys.add(code);
      else state.pursuitKeys.delete(code);
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {
        code, key, bubbles: true,
      }));
    };
    const selectLiveTarget = (player) => {
      const preferred = window.__DEBUG.game.tankById.get(pair.targetId);
      if (preferred && !preferred.combat?.destroyed) return preferred;
      if (!player?.state) return null;
      return window.__DEBUG.game.tanks
        .filter((entity) => formationState.pairById[entity.id]?.team !== pair.team
          && !entity.combat?.destroyed)
        .sort((a, b) => a.state.pos.distanceToSquared(player.state.pos)
          - b.state.pos.distanceToSquared(player.state.pos))[0] || null;
    };
    const selectPursuitShell = () => {
      if (state.pursuitShellSelected) return;
      state.pursuitShellSelected = true;
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'Digit3', key: '3', bubbles: true,
      }));
      window.dispatchEvent(new KeyboardEvent('keyup', {
        code: 'Digit3', key: '3', bubbles: true,
      }));
    };
    const updatePursuit = (player, target, elapsed) => {
      player.input.aimPoint.copy(target.state.pos);
      player.input.aimPoint.y += target.spec.dims.heightM * 0.52;
      const dx = target.state.pos.x - player.state.pos.x;
      const dz = target.state.pos.z - player.state.pos.z;
      const desiredYaw = Math.atan2(dx, dz);
      const yawError = Math.atan2(
        Math.sin(desiredYaw - player.state.yaw),
        Math.cos(desiredYaw - player.state.yaw),
      );
      const pursuit = elapsed >= pursuitDelayMs;
      if (pursuit) selectPursuitShell();
      setPursuitKey('KeyW', 'w', pursuit);
      setPursuitKey('KeyA', 'a', pursuit && yawError > 0.06);
      setPursuitKey('KeyD', 'd', pursuit && yawError < -0.06);
    };
    const recordFullMotion = (player, motionAtMs) => {
      const motion = state.motion;
      const own = player.state.pos;
      if (motion.last) {
        const dx = own.x - motion.last.x;
        const dy = own.y - motion.last.y;
        const dz = own.z - motion.last.z;
        const stepM = Math.hypot(dx, dy, dz);
        const elapsedS = Math.max(0, motionAtMs - motion.last.atMs) / 1000;
        const speedMps = Math.hypot(
          player.state.speed || 0,
          player.state.verticalSpeed || 0,
        );
        const expectedStepM = Math.max(speedMps, motion.last.speedMps || 0) * elapsedS;
        motion.maxStepM = Math.max(motion.maxStepM, stepM);
        if (elapsedS <= 0.025) {
          motion.maxShortFrameStepM = Math.max(motion.maxShortFrameStepM, stepM);
        }
        motion.maxExcessStepM = Math.max(
          motion.maxExcessStepM,
          Math.max(0, stepM - expectedStepM),
        );
        const previousYaw = Number.isFinite(motion.last.yaw)
          ? motion.last.yaw : player.state.yaw;
        const headingYaw = Math.atan2(
          Math.sin(previousYaw) + Math.sin(player.state.yaw),
          Math.cos(previousYaw) + Math.cos(player.state.yaw),
        );
        const forward = dx * Math.sin(headingYaw) + dz * Math.cos(headingYaw);
        motion.maxBackstepM = Math.max(motion.maxBackstepM, -forward);
      }
      motion.last = {
        x: own.x,
        y: own.y,
        z: own.z,
        yaw: player.state.yaw,
        atMs: motionAtMs,
        speedMps: Math.hypot(player.state.speed || 0, player.state.verticalSpeed || 0),
      };
      motion.samples++;
    };
    const releasePursuitKeys = () => {
      setPursuitKey('KeyW', 'w', false);
      setPursuitKey('KeyA', 'a', false);
      setPursuitKey('KeyD', 'd', false);
    };
    const loop = () => {
      const motionAtMs = performance.now();
      const elapsed = motionAtMs - state.combatStartedAt;
      const player = window.__DEBUG.game.player;
      const target = selectLiveTarget(player);
      if (player?.state && target?.state) {
        updatePursuit(player, target, elapsed);
        recordFullMotion(player, motionAtMs);
      } else {
        releasePursuitKeys();
      }
      window.__DEBUG.flags.forceFire = state.combatEnabled && elapsed >= 1200;
      if (state.combatEnabled) state.aimRaf = requestAnimationFrame(loop);
    };
    state.aimRaf = requestAnimationFrame(loop);
  }, { formation, pursuitDelayMs: stalematePursuitDelayMs });
}

async function beginMeasuredCombat(pages, renderedRole) {
  const fullIndex = renderedRole === 'host' ? 0 : 1;
  await Promise.all(pages.map((page, index) => page.evaluate((full) => {
    const state = globalThis.__COT_LIVE_7V7;
    state.measurementStartedAt = performance.now();
    state.motion = {
      samples: 0,
      maxStepM: 0,
      maxShortFrameStepM: 0,
      maxExcessStepM: 0,
      maxBackstepM: 0,
      last: null,
    };
    state.measureMotion = true;
    if (full) {
      // Preserve pre-measurement errors as a gate failure, not a reset that
      // makes a clean combat window erase a broken boot/warm-up phase.
      state.preCombatGlError = window.__DEBUG.renderer.getContext().getError();
      state.predictionCombatBaseline = { ...(window.__DEBUG.network?.prediction || {}) };
      state.programBaseline = new Set(
        (window.__DEBUG.renderer.info.programs || []).map((program) => program.cacheKey),
      );
      state.wreckProgramBaseline = (window.__DEBUG.renderer.info.programs || [])
        .filter((program) => program.name === 'cot:burnt'
          || String(program.cacheKey || '').includes('burnt-triplanar'))
        .map((program) => ({
          cacheKey: String(program.cacheKey || '').slice(0, 800),
          name: program.name || '',
          usedTimes: program.usedTimes,
        }));
      window.__DEV_TRACE.clear();
      window.__DEV_TRACE.mark('live-7v7:measured-combat');
      window.dispatchEvent(new KeyboardEvent('keydown', {
        code: 'KeyW', key: 'w', bubbles: true,
      }));
      if (state.stopDrivingTimer) clearTimeout(state.stopDrivingTimer);
      state.stopDrivingTimer = setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent('keyup', {
          code: 'KeyW', key: 'w', bubbles: true,
        }));
      }, 2500);
    }
  }, index === fullIndex)));
  await baselineAuthority(pages[0], renderedRole);
}

async function stopCombat(pages, renderedRole) {
  await Promise.all(pages.map((page, index) => page.evaluate((full) => {
    const state = globalThis.__COT_LIVE_7V7;
    state.combatEnabled = false;
    state.measureMotion = false;
    state.nextInput = {
      throttle: 0, steer: 0, brake: true, fire: false,
      aimYaw: 0, aimPitch: 0, aimDistance: 100, shellSlot: 0, actionBits: 0,
    };
    if (full && window.__DEBUG) {
      window.__DEBUG.flags.forceFire = false;
      for (const [code, key] of [['KeyW', 'w'], ['KeyA', 'a'], ['KeyD', 'd']]) {
        window.dispatchEvent(new KeyboardEvent('keyup', { code, key, bubbles: true }));
      }
      state.pursuitKeys?.clear();
      if (state.aimRaf) cancelAnimationFrame(state.aimRaf);
    }
  }, (renderedRole === 'host' && index === 0) || (renderedRole === 'client' && index === 1))));
}

async function collectFullReport(page, renderedRole) {
  const report = await page.evaluate(async (role) => {
    const state = globalThis.__COT_LIVE_7V7;
    const clockStartedAt = performance.now();
    const trace = window.__DEV_TRACE.stats();
    const traceClock = { pageTimeMs: clockStartedAt, traceTimeMs: trace.durationMs,
      readSpanMs: performance.now() - clockStartedAt };
    const traceAnomalies = window.__DEV_TRACE.tail(2000, 'anomaly');
    const traceTail = window.__DEV_TRACE.tail(240);
    const traceSnapshot = window.__DEV_TRACE.snapshot({ gpu: false });
    const traceColumns = Object.fromEntries(
      traceSnapshot.frameSchema.map((name, index) => [name, index]),
    );
    const spikeIndexes = traceSnapshot.frames
      .map((row, index) => row[traceColumns.gapMs] >= 40 ? index : -1)
      .filter((index) => index >= 0);
    const diagnosticIndexes = new Set();
    for (const index of spikeIndexes) {
      for (let offset = -3; offset <= 3; offset++) {
        if (index + offset >= 0 && index + offset < traceSnapshot.frames.length) {
          diagnosticIndexes.add(index + offset);
        }
      }
    }
    const traceSpikeFrames = [...diagnosticIndexes].sort((a, b) => a - b).map((index) =>
      Object.fromEntries(traceSnapshot.frameSchema.map((name, column) => [
        name,
        traceSnapshot.frames[index][column],
      ])));
    const renderer = {
      calls: window.__DEBUG.renderer.info.render.calls,
      triangles: window.__DEBUG.renderer.info.render.triangles,
      programs: window.__DEBUG.renderer.info.programs?.length || 0,
    };
    const newPrograms = (window.__DEBUG.renderer.info.programs || [])
      .filter((program) => !state.programBaseline?.has(program.cacheKey))
      .map((program) => ({
        cacheKey: String(program.cacheKey || '').slice(0, 800),
        name: program.name || '',
        usedTimes: program.usedTimes,
      }));
    const gl = window.__DEBUG.renderer.getContext();
    const glErrors = {
      preCombat: state.preCombatGlError,
      beforeShadowProbe: gl.getError(),
      afterShadowProbe: null,
    };
    const shadowSample = await window.__DEBUG.sampleShadowContribution();
    glErrors.afterShadowProbe = gl.getError();
    const telemetry = window.__DEBUG.telemetry();
    // getError consumes a sticky flag. Keep every phase receipt and expose the
    // first failure on the legacy field so attribution cannot hide an error.
    const glError = Object.values(glErrors).find((error) => error !== 0) ?? 0;
    // Vite marks every legitimate development stylesheet with
    // `data-vite-dev-id`; that attribute is not an error signal. Only the
    // actual custom error-overlay surface should fail the rendered gate.
    const overlay = document.querySelector('vite-error-overlay, .vite-error-overlay');
    return {
      role,
      playerId: state.roomInfo.peerId,
      trace,
      traceClock,
      traceAnomalies,
      traceTail,
      traceSpikeFrames,
      timingSource: { frameSchema: traceSnapshot.frameSchema, frames: traceSnapshot.frames,
        events: traceSnapshot.events, clock: traceClock },
      events: state.eventCounts,
      motion: state.motion,
      network: window.__DEBUG.network,
      predictionCombatBaseline: state.predictionCombatBaseline || null,
      presentation: window.__DEBUG.networkPresentation,
      renderer,
      newPrograms,
      wreckProgramBaseline: state.wreckProgramBaseline || [],
      rosterSize: window.__DEBUG.game.tankById.size,
      visibleRosterSize: window.__DEBUG.game.tanks.length,
      phase: window.__DEBUG.game.phase,
      result: window.__DEBUG.game.result,
      load: globalThis.__NETWORK_LOAD || null,
      shadowSample,
      telemetry: {
        quality: telemetry.quality,
        simulation: telemetry.simulation,
        world: telemetry.world,
      },
      shadows: telemetry.shadows,
      glError,
      glErrors,
      glBufferDiagnostics: globalThis.__COT_GL_BUFFER_PROBE ? {
        draws: globalThis.__COT_GL_BUFFER_PROBE.draws,
        errors: globalThis.__COT_GL_BUFFER_PROBE.errors,
      } : null,
      errorOverlay: !!overlay,
      canvas: {
        width: window.__DEBUG.renderer.domElement.width,
        height: window.__DEBUG.renderer.domElement.height,
      },
      errors: state.errors,
    };
  }, renderedRole);
  const { timingSource, ...health } = report;
  return { ...health, timingWindows: liveCombatTimingWindows(timingSource) };
}

async function collectLightReport(page) {
  return page.evaluate(() => {
    const state = globalThis.__COT_LIVE_7V7;
    const stats = state.match.client.getStats();
    return {
      playerId: state.roomInfo.peerId,
      events: state.eventCounts,
      motion: state.motion,
      network: stats,
      errors: [...state.errors, ...state.match.client.errors],
    };
  });
}

function assertClientHealth(report, label) {
  assert.equal(report.network?.connected, true, `${label} remains connected`);
  assert.deepEqual(report.errors, [], `${label} has no session/protocol errors`);
  assert.ok(report.network.snapshotPacketsReceived >= 80,
    `${label} receives a continuous state stream (${report.network.snapshotPacketsReceived})`);
  assert.ok(report.network.inputAckLag != null && report.network.inputAckLag <= 20,
    `${label} input ack lag remains bounded (${report.network.inputAckLag})`);
  assert.equal(report.network.pendingInputEdges, 0,
    `${label} drains every reliable fire edge`);
  assert.ok(report.network.transportBufferedBytes < 64 * 1024,
    `${label} stays below transport backpressure threshold`);
  assert.ok(report.motion.samples >= 30, `${label} samples live movement`);
  assert.ok(report.motion.maxShortFrameStepM < 0.5,
    `${label} display stream has no single-frame teleport ` +
    `(${report.motion.maxShortFrameStepM.toFixed(3)} m)`);
  assert.ok(report.motion.maxExcessStepM < 0.25,
    `${label} display motion stays within authority velocity ` +
    `(${report.motion.maxExcessStepM.toFixed(3)} m excess)`);
  assert.ok(report.motion.maxBackstepM < 0.3,
    `${label} display stream has no backwards correction (${report.motion.maxBackstepM.toFixed(3)} m)`);
  assert.ok(Object.keys(report.events.firedBy).length === PLAYER_COUNT,
    `${label} receives fire events from every tank`);
  assert.ok(report.events.hits >= TEAM_SIZE,
    `${label} receives real shell impacts (${report.events.hits})`);
  assert.ok(report.events.damage > 0, `${label} receives positive live damage`);
}

function assertGlHealth(report, renderedRole) {
  assert.equal(report.glBufferDiagnostics?.errors?.length ?? 0, 0,
    `${renderedRole} instanced GL probe retained errors (${JSON.stringify(report.glBufferDiagnostics)})`);
  for (const phase of ['preCombat', 'beforeShadowProbe', 'afterShadowProbe']) {
    assert.equal(report.glErrors?.[phase], 0,
      `${renderedRole} has no WebGL error at ${phase} (${JSON.stringify(report.glErrors)})`);
  }
  assert.equal(report.glError, 0, `${renderedRole} has no WebGL error`);
}

function assertFullHealth(report, renderedRole, measuredDurationMs) {
  assert.equal(report.phase, 'battle', `${renderedRole} renderer stays in battle`);
  if (completeMatch) {
    assert.ok(['victory', 'defeat', 'draw'].includes(report.result),
      `${renderedRole} renderer reaches a canonical result (${report.result})`);
  } else {
    assert.equal(report.result, null, `${renderedRole} capture is live, not a result screen`);
  }
  assert.equal(report.errorOverlay, false, `${renderedRole} has no browser error overlay`);
  assertGlHealth(report, renderedRole);
  assert.equal(report.rosterSize, PLAYER_COUNT, `${renderedRole} owns all 14 rendered tank entities`);
  assert.ok(report.visibleRosterSize >= PLAYER_COUNT,
    `${renderedRole} presents the full close-range roster`);
  assert.ok(report.renderer.calls > 0 && report.renderer.programs > 0,
    `${renderedRole} renders real battlefield geometry (${JSON.stringify(report.renderer)})`);
  assert.ok(report.telemetry?.simulation?.tanks >= PLAYER_COUNT,
    `${renderedRole} telemetry contains the full live roster`);
  assert.ok(report.telemetry?.world?.obstacles > 0 && report.telemetry?.world?.colliders > 0,
    `${renderedRole} telemetry contains the real collision/dressing world`);
  assert.ok(report.canvas.width >= 1280 && report.canvas.height >= 720,
    `${renderedRole} renders a desktop-resolution frame`);
  const expectedTraceDurationMs = measuredDurationMs + settleMs;
  assert.ok(report.trace.durationMs >= expectedTraceDurationMs - 250,
    `${renderedRole} trace covers measured combat ` +
    `(${report.trace.durationMs.toFixed(1)}/${expectedTraceDurationMs} ms)`);
  const renderedFps = report.trace.frames / Math.max(0.001, report.trace.durationMs / 1000);
  // A 30 Hz browser cadence produces floor(duration / framePeriod) samples;
  // requiring a fractional frame makes a mathematically exact 30 FPS trace
  // fail at the capture boundary. Keep a 0.5 FPS quantization allowance while
  // the p95/max-gap and zero-spike gates below still reject unstable delivery.
  assert.ok(renderedFps >= 29.5,
    `${renderedRole} sustains at least 30 rendered fps (${renderedFps.toFixed(2)})`);
  assert.equal(report.trace.liveSpikes, 0, `${renderedRole} has no 50ms+ live frame spike`);
  assert.equal(report.trace.liveFreezes, 0, `${renderedRole} has no live gameplay freeze`);
  assert.ok(report.trace.gapP95 < 40,
    `${renderedRole} p95 frame gap stays below 40 ms (${report.trace.gapP95})`);
  const maxAllowedGapMs = completeMatch ? 75 : 50;
  assert.ok(report.trace.maxGapMs < maxAllowedGapMs,
    `${renderedRole} has no render stall (${report.trace.maxGapMs} ms)`);
  const prediction = report.network?.prediction;
  const predictionBaseline = report.predictionCombatBaseline || {};
  const liveHardSnaps = (prediction?.hardSnaps ?? Infinity) -
    (predictionBaseline.hardSnaps || 0);
  const liveDroppedHistory = (prediction?.droppedHistory ?? Infinity) -
    (predictionBaseline.droppedHistory || 0);
  assert.equal(liveHardSnaps, 0, `${renderedRole} has no live prediction hard snap`);
  assert.equal(liveDroppedHistory, 0, `${renderedRole} drops no live prediction history`);
  if ((prediction?.maxPositionErrorM || 0) >
      (predictionBaseline.maxPositionErrorM || 0) + 1e-6) {
    assert.ok(prediction.maxPositionErrorM < 2,
      `${renderedRole} new live correction stays sub-2m (${prediction.maxPositionErrorM})`);
  }
  assert.ok((prediction?.lastPositionErrorM ?? Infinity) < 1,
    `${renderedRole} settles below 1m correction (${prediction?.lastPositionErrorM})`);
  assert.ok((prediction?.maxCorrectionStepM ?? Infinity) < 0.25,
    `${renderedRole} keeps one-frame correction below 0.25m ` +
    `(${prediction?.maxCorrectionStepM})`);
  assert.ok((prediction?.maxVerticalCorrectionStepM ?? Infinity) < 0.15,
    `${renderedRole} keeps terrain-height correction below 0.15m ` +
    `(${prediction?.maxVerticalCorrectionStepM})`);
  assert.equal(report.presentation?.pending, 0,
    `${renderedRole} drains every presentation event`);
  assert.equal(report.shadows?.enabled, true, `${renderedRole} keeps shadows enabled`);
  assert.equal(report.shadows?.shaderErrors, 0, `${renderedRole} has no shadow shader error`);
  assert.equal(report.shadows?.cascades?.length, 4, `${renderedRole} keeps all four shadow cascades`);
  assert.equal(report.shadowSample?.skipped, false, `${renderedRole} shadow sample executes`);
  assert.ok(report.shadowSample.changedPixelRatio >= 0.003,
    `${renderedRole} shadows affect visible pixels`);
  assert.ok(report.shadowSample.darkenedPixelRatio >= 0.003,
    `${renderedRole} shadows visibly darken the scene`);
  assertClientHealth(report, `${renderedRole} rendered client`);
}

async function waitForNaturalMatchEnd(pages, renderedRole) {
  const startedAt = Date.now();
  const deadline = startedAt + matchTimeoutMs;
  let authority = null;
  // Do not continuously inspect all fourteen renderer processes. The old
  // 25 ms Promise.all loop issued more than 500 CDP evaluations per second
  // and could manufacture a 50 ms main-thread stall in the very page being
  // certified. Poll the single authority at human-invisible cadence, then
  // verify retained room membership once the match has actually resolved.
  while (Date.now() < deadline) {
    authority = await pages[0].evaluate((role) => {
      const state = globalThis.__COT_LIVE_7V7;
      const runtime = role === 'host' ? state.session.matchRuntime : state.match.host;
      const simulation = runtime?.simulation;
      return {
        result: simulation?.result || null,
        reason: simulation?.resultReason || null,
        tick: runtime?.tick || 0,
        events: state.eventCounts,
        living: simulation ? [...simulation.entityById.values()]
          .filter((entity) => !entity.combat.destroyed)
          .map((entity) => ({
            id: entity.id,
            team: entity.team,
            hp: Math.round(entity.combat.hp),
            x: Number(entity.state.pos.x.toFixed(1)),
            z: Number(entity.state.pos.z.toFixed(1)),
            reloadS: Number(entity.combat.reload.t.toFixed(2)),
          })) : [],
      };
    }, renderedRole);
    if (authority.result) break;
    await wait(100);
  }
  assert.ok(authority?.result,
    `authority did not complete a natural match: ${JSON.stringify(authority)}`);

  let rooms = [];
  while (Date.now() < deadline) {
    rooms = await Promise.all(pages.map((page) => page.evaluate(() => {
        const state = globalThis.__COT_LIVE_7V7;
        const room = state.session?.lobby || state.match?.client?.roomState ||
          state.session?.runtime?.roomState || null;
        const client = state.match?.client || state.session?.runtime || null;
        return room ? {
          playerId: state.roomInfo?.peerId || null,
          phase: room.phase,
          round: Number(room.round) || 0,
          revision: Number(room.revision) || 0,
          lastResult: room.lastResult || null,
          ready: room.players instanceof Map
            ? [...room.players.values()].map((player) => !!player.ready)
            : (room.players || []).map((player) => !!player.ready),
          connected: client?.connected ?? null,
          closed: client?.closed ?? null,
          lastRecvSeq: client?.lastRecvSeq ?? null,
          errors: [...(state.errors || []), ...(client?.errors || [])],
          transport: client?.getStats?.().transport || null,
        } : null;
      })));
    if (rooms.every((room) => room?.phase === 'waiting')) break;
    await wait(100);
  }
  assert.ok(rooms.every((room) => room?.phase === 'waiting' && room.round === 1),
    `all pristine sessions retain round-one room membership: ${JSON.stringify(rooms)}`);
  assert.ok(rooms.every((room) => room.ready.every((ready) => !ready)),
    'natural match completion resets every ready vote');
  const fullPage = renderedRole === 'host' ? pages[0] : pages[1];
  await fullPage.waitForFunction(
    () => ['victory', 'defeat', 'draw'].includes(window.__DEBUG?.game?.result),
    { timeout: Math.min(matchTimeoutMs, 30_000), polling: 16 },
  );
  return {
    ...authority,
    elapsedMs: Date.now() - startedAt,
    retainedSessions: rooms.length,
  };
}

async function closePages(pages) {
  await Promise.all(pages.map(async (page) => {
    if (!page || page.isClosed()) return;
    await page.evaluate(() => {
      const state = globalThis.__COT_LIVE_7V7;
      if (!state) return;
      for (const timer of [
        state.pumpTimer, state.inputTimer, state.stopDrivingTimer, state.readyTimer,
      ]) {
        if (timer) clearInterval(timer);
      }
      if (state.aimRaf) cancelAnimationFrame(state.aimRaf);
      for (const unsubscribe of state.unsubscribeBus || []) {
        try { unsubscribe(); } catch (_) { /* best effort */ }
      }
      try { state.unsubscribeEvents?.(); } catch (_) { /* best effort */ }
      try { state.unsubscribeLobby?.(); } catch (_) { /* best effort */ }
      try { state.match?.close('live_7v7_complete'); } catch (_) { /* best effort */ }
      try { state.session?.close('live_7v7_complete'); } catch (_) { /* best effort */ }
      try { state.signaling?.close('live_7v7_complete'); } catch (_) { /* best effort */ }
    }).catch(() => {});
    await page.close().catch(() => {});
    const context = contextByPage.get(page);
    contextByPage.delete(page);
    if (context) await context.close().catch(() => {});
  }));
}

async function runRenderedRole(origin, signalUrl, renderedRole) {
  const pages = await openPlayers(origin, renderedRole);
  const fullIndex = renderedRole === 'host' ? 0 : 1;
  try {
    console.log(`[live-7v7] ${renderedRole}: 14 Chromium peers ready`);
    const lobby = await createLobby(pages, signalUrl);
    console.log(`[live-7v7] ${renderedRole}: balanced 7v7 lobby synchronized`);
    const { fullPage, formation, entry } = await prepareRun(pages, renderedRole, lobby);
    console.log(`[live-7v7] ${renderedRole}: full renderer entered at ` +
      `${formation.axis}-axis formation ${formation.center.join(',')}`);
    await installFullCombatProbe(fullPage, formation);
    await Promise.all(pages.map((page, index) => {
      if (index === fullIndex) return startFullCombat(page, formation);
      return startLightCombat(page, renderedRole === 'client' && index === 0, formation);
    }));

    await fullPage.waitForFunction(
      () => globalThis.__COT_LIVE_7V7.eventCounts.fired > 0,
      { timeout: 10_000, polling: 10 },
    );
    const volleyPath = resolve(artifactDir, `${renderedRole}-first-volley.png`);
    await fullPage.screenshot({ path: volleyPath, type: 'png' });
    await wait(Math.min(3000, Math.max(750, durationMs / 4)));
    const livePath = resolve(artifactDir, `${renderedRole}-live.png`);
    await fullPage.screenshot({ path: livePath, type: 'png' });
    // PNG readback/encoding is intentionally outside the gameplay timing gate.
    // Give Chromium one quiet second to release its screenshot buffers before
    // resetting the trace, otherwise an encoder GC can masquerade as a live
    // render hitch on the first measured frame.
    await wait(1000);
    const measurement = await withLiveCombatFrameTrace(fullPage, frameTraceDiagnostics, async () => {
      await beginMeasuredCombat(pages, renderedRole);
      const measuredStartedAt = Date.now();
      const completion = completeMatch
        ? await waitForNaturalMatchEnd(pages, renderedRole)
        : null;
      if (!completeMatch) await wait(durationMs);
      const measuredDurationMs = Date.now() - measuredStartedAt;
      await stopCombat(pages, renderedRole);
      await wait(settleMs);
      // Collect the unchanged gate inputs before stopping/flushing Chrome's
      // optional trace; its cleanup latency must not extend the frame window.
      const hostAuthority = await pages[0].evaluate((role) => {
        const state = globalThis.__COT_LIVE_7V7;
        const runtime = role === 'host' ? state.session.matchRuntime : state.match.host;
        const simulation = runtime.simulation;
        return {
          tick: runtime.tick,
          stats: runtime.stats,
          combatBaseline: state.authorityCombatBaseline,
          averageAdvanceMs: state.advanceDurations.reduce((sum, value) => sum + value, 0) /
            Math.max(1, state.advanceDurations.length),
          maxAdvanceMs: Math.max(0, ...state.advanceDurations),
          start: state.authorityStart,
          final: Object.fromEntries([...simulation.entityById].map(([id, entity]) => [id, {
            x: entity.state.pos.x,
            y: entity.state.pos.y,
            z: entity.state.pos.z,
            hp: entity.combat.hp,
            destroyed: entity.combat.destroyed,
            team: entity.team,
          }])),
        };
      }, renderedRole);
      const fullReport = await collectFullReport(fullPage, renderedRole);
      const clientReports = await Promise.all(pages.map((page, index) =>
        index === fullIndex ? fullReport : collectLightReport(page)));
      return { completion, measuredDurationMs, hostAuthority, fullReport, clientReports };
    }, startMultiplayerFrameTrace, { window: frameTraceWindow });
    const { completion, measuredDurationMs, hostAuthority, fullReport, clientReports } = measurement.value;

    const healthPath = resolve(artifactDir, `${renderedRole}-health.json`);
    await persistLiveCombatHealth({ role: renderedRole, measuredDurationMs,
      authority: hostAuthority, rendered: fullReport, clients: clientReports,
      browserErrors, browserGlWarnings, frameTrace: measurement.frameTrace,
      profile: { players: PLAYER_COUNT, teamSize: TEAM_SIZE, map: MAP_ID, roster: SPEC_ID,
        durationMs, settleMs, latencyMs, jitterMs, lossPercent, inputLossPercent,
        completeMatch, certificationBattleLimitS } }, healthPath);
    if (measurement.frameTrace) {
      // The collector has already stripped Chrome names/arguments/identities.
      // Keep its bounded rows separate from the compact shareable health receipt.
      await writeFile(resolve(artifactDir, `${renderedRole}-frame-trace.json`),
        `${JSON.stringify(measurement.frameTrace, null, 2)}\n`);
    }
    console.log(`[live-7v7] ${renderedRole}: health receipt saved before gate checks`);
    if (frameTraceDiagnostics) {
      assert.equal(measurement.frameTrace?.complete, true, 'bounded Chrome trace completes without data loss');
    }

    const liveInvalidMessages = hostAuthority.stats.invalidMessages -
      hostAuthority.combatBaseline.invalidMessages;
    const liveDroppedCatchUpMs = hostAuthority.stats.droppedCatchUpMs -
      hostAuthority.combatBaseline.droppedCatchUpMs;
    assert.equal(liveInvalidMessages, 0, 'authority accepts every live input');
    assert.equal(liveDroppedCatchUpMs, 0, 'authority drops no simulation time during live combat');
    assert.ok(hostAuthority.averageAdvanceMs < 4,
      `authority retains 60 Hz headroom (${hostAuthority.averageAdvanceMs.toFixed(3)} ms)`);
    assert.ok(hostAuthority.maxAdvanceMs < 33,
      `authority avoids multi-frame stalls (${hostAuthority.maxAdvanceMs.toFixed(3)} ms)`);
    const movement = Object.keys(hostAuthority.start).map((id) => {
      const before = hostAuthority.start[id];
      const after = hostAuthority.final[id];
      return Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
    });
    assert.ok(movement.every((distance) => distance > 0.5),
      `every authority tank moves (${movement.map((value) => value.toFixed(2)).join(', ')})`);
    const damageByTeam = { alpha: 0, bravo: 0 };
    for (const [id, before] of Object.entries(hostAuthority.start)) {
      damageByTeam[before.team] += Math.max(0, before.hp - hostAuthority.final[id].hp);
    }
    await writeFile(resolve(artifactDir, `${renderedRole}-diagnostic.json`),
      `${JSON.stringify({
        role: renderedRole,
        formation,
        entry,
        authority: hostAuthority,
        rendered: fullReport,
        clients: clientReports,
        browserErrors,
        browserGlWarnings,
      }, null, 2)}\n`);
    assert.ok(damageByTeam.alpha > 0 && damageByTeam.bravo > 0,
      `both teams take live damage (${JSON.stringify(damageByTeam)})`);
    assertFullHealth(fullReport, renderedRole, measuredDurationMs);
    clientReports.forEach((report, index) => {
      if (index !== fullIndex) assertClientHealth(report, `${renderedRole} run player ${index + 1}`);
    });
    assert.deepEqual(browserErrors, [], `browser errors:\n${browserErrors.join('\n')}`);

    const report = {
      role: renderedRole,
      profile: {
        players: PLAYER_COUNT,
        teamSize: TEAM_SIZE,
        mapId: MAP_ID,
        specId: SPEC_ID,
        durationMs,
        settleMs,
        stalematePursuitDelayMs,
        latencyMs,
        jitterMs,
        lossPercent,
        inputLossPercent,
        freshBrowserContexts: true,
        completeMatch,
        measuredDurationMs,
        matchTimeoutMs,
        certificationBattleLimitS,
        glBufferDiagnostics,
        frameTraceDiagnostics,
        frameTraceWindow,
      },
      completion,
      formation,
      entry,
      authority: {
        tick: hostAuthority.tick,
        averageAdvanceMs: Number(hostAuthority.averageAdvanceMs.toFixed(3)),
        maxAdvanceMs: Number(hostAuthority.maxAdvanceMs.toFixed(3)),
        droppedCatchUpMs: hostAuthority.stats.droppedCatchUpMs,
        liveDroppedCatchUpMs,
        preCombatDroppedCatchUpMs: hostAuthority.combatBaseline.droppedCatchUpMs,
        damageByTeam,
        minimumMovementM: Number(Math.min(...movement).toFixed(3)),
      },
      rendered: fullReport,
      clients: clientReports.map((client) => ({
        playerId: client.playerId,
        fired: client.events.fired,
        uniqueShooters: Object.keys(client.events.firedBy).length,
        hits: client.events.hits,
        damage: client.events.damage,
        snapshots: client.network.snapshotPacketsReceived,
        rttMs: client.network.rttMs,
        inputAckLag: client.network.inputAckLag,
        maxPoseStepM: client.motion.maxStepM,
        maxBackstepM: client.motion.maxBackstepM,
      })),
      screenshots: { firstVolley: volleyPath, live: livePath },
      browserGlWarnings,
    };
    await writeFile(resolve(artifactDir, `${renderedRole}-report.json`),
      `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[live-7v7] ${renderedRole}: PASS ` + JSON.stringify({
      shots: fullReport.events.fired,
      shooters: Object.keys(fullReport.events.firedBy).length,
      hits: fullReport.events.hits,
      damage: fullReport.events.damage,
      frames: fullReport.trace.frames,
      gapP95: fullReport.trace.gapP95,
      maxGapMs: fullReport.trace.maxGapMs,
      preCombatHardSnaps: fullReport.predictionCombatBaseline?.hardSnaps || 0,
      liveHardSnaps: fullReport.network.prediction.hardSnaps -
        (fullReport.predictionCombatBaseline?.hardSnaps || 0),
      lastPredictionErrorM: fullReport.network.prediction.lastPositionErrorM,
      maxPoseStepM: fullReport.motion.maxStepM,
      authorityAverageMs: hostAuthority.averageAdvanceMs,
      authorityMaxMs: hostAuthority.maxAdvanceMs,
    }));
    return report;
  } finally {
    await closePages(pages);
  }
}

async function runLiveCombat() {
  try {
    vite = await createViteServer({ root, logLevel: 'error',
      server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false } });
    signaling = createSignalingServer({ host: '127.0.0.1', port: 0 });
    await mkdir(artifactDir, { recursive: true });
    await vite.listen();
    const signalAddress = await signaling.listen();
    const viteAddress = vite.httpServer.address();
    const origin = `http://127.0.0.1:${viteAddress.port}`;
    const signalUrl = `ws://127.0.0.1:${signalAddress.port}/signal`;
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--use-gl=angle',
        '--enable-webgl',
      ],
    });
    const host = onlyRole === 'client' ? null : await runRenderedRole(origin, signalUrl, 'host');
    const client = onlyRole === 'host' ? null : await runRenderedRole(origin, signalUrl, 'client');
    const summary = {
      ok: true,
      capturedAt: new Date().toISOString(),
      host: host?.screenshots || null,
      client: client?.screenshots || null,
    };
    await writeFile(resolve(artifactDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    if (browser) await browser.close().catch(() => {});
    await signaling?.close().catch(() => {});
    await vite?.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await runLiveCombat();
}
