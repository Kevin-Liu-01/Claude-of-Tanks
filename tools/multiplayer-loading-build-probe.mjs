#!/usr/bin/env node
// Immutable public-build acquisition only; native interactions remain owned by
// production-private-room-ui. No build, endpoint/state/quality overrides, or dwell.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { createSignalingServer } from '../server/signalingServer.ts';
import { createCaptureLock } from './capture-lock.mjs';
import { createAcquisitionOwner } from './lobby-prefetch-before-ready.browser.selftest.mjs';
import { productionDiagnosticDetails, productionFailureEvidence, verifyProductionPrivateRoomUi } from './production-private-room-ui.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CAPTURE_QUEUE_TIMEOUT_MS = 45 * 60 * 1000;
export const SCENARIO_TIMEOUT_MS = 300000;
const CLEANUP_RESERVE_MS = 10000;
// Native DOM samples can straddle frame/snapshot delivery. Keep that allowance
// explicit and bounded; a complete numeral sequence alone can still run too slowly.
const COUNTDOWN_MIN_MS = 4500;
const COUNTDOWN_MAX_MS = 6500;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (condition, code) => { if (!condition) throw Object.assign(new Error(code), { probeCode: code }); };

/** Every byte, including images/audio/fonts; links and special files fail closed. */
export function hashBuild(directory) {
  const hash = createHash('sha256');
  let files = 0, bytes = 0;
  function visit(path, name) {
    const stat = lstatSync(path);
    check(!stat.isSymbolicLink(), 'build_symlink');
    if (stat.isDirectory()) {
      hash.update(`directory:${JSON.stringify(name)}\n`);
      for (const child of readdirSync(path).sort()) visit(join(path, child), `${name}/${child}`);
    } else {
      check(stat.isFile(), 'build_special_file');
      const content = readFileSync(path); files++; bytes += content.length;
      hash.update(`file:${JSON.stringify(name)}:${content.length}:`).update(content);
    }
  }
  visit(directory, '');
  return { sha256: hash.digest('hex'), files, bytes };
}

/** Relative static/dynamic imports plus package lock identify the acquisition
 * closure, including the native TypeScript signaling service. No env/git diff. */
export function hashAcquisition(root = ROOT, entry = fileURLToPath(import.meta.url)) {
  const sources = new Map();
  function visit(file) {
    if (sources.has(file)) return;
    check(!relative(root, file).startsWith('..'), 'acquisition_outside_root');
    const source = readFileSync(file, 'utf8'); sources.set(file, source);
    for (const match of source.matchAll(/\b(?:from\s*|import\s*(?:\(\s*)?)['"](\.{1,2}\/[^'"]+\.(?:mjs|js|ts))['"]/g)) {
      visit(resolve(dirname(file), match[1]));
    }
  }
  visit(entry);
  const hash = createHash('sha256');
  for (const [file, source] of [...sources].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(JSON.stringify(relative(root, file))).update(sha256(source));
  }
  for (const name of ['package.json', 'package-lock.json']) hash.update(name).update(readFileSync(join(root, name)));
  return { sha256: hash.digest('hex'), files: sources.size + 2, nodeVersion: process.version };
}

export function entryEvidence(result) {
  const peers = (result?.entry?.peers ?? []).map(({ role, observation: row }) => {
    const black = row?.networkLoad?.blackCheck;
    const frames = row?.transitions ?? [];
    const five = frames.find(frame => frame.countdown === 5);
    const rollout = frames.find(frame => frame.rollout);
    return { role, completeCountdown: JSON.stringify(row?.countdown) === '[5,4,3,2,1]',
      countdown: row?.countdown ?? [], foregroundCountdown: row?.foregroundCountdown ?? [],
      countdownToRolloutMs: five && rollout ? rollout.at - five.at : null,
      nonblack: !!black && !black.error && Number.isFinite(black.after ?? black.before) && (black.after ?? black.before) >= 6,
      blackCheck: black ?? null, revealPrimed: row?.readiness?.reveal?.primed === true,
      loaderHidden: row?.readiness?.loaderHidden === true, networkComplete: row?.networkLoad?.status === 'complete',
      maxRafGapMs: row?.maxRafGapMs ?? null,
      dropped: (row?.framesDropped ?? 0) + (row?.transitionsDropped ?? 0) + (row?.longTasksDropped ?? 0) };
  });
  return { peers, countdownBoundsMs: { min: COUNTDOWN_MIN_MS, max: COUNTDOWN_MAX_MS },
    complete: peers.length === 2 && new Set(peers.map(row => row.role)).size === 2 &&
    peers.every(row => ['host', 'guest'].includes(row.role) && row.completeCountdown &&
      Number.isFinite(row.countdownToRolloutMs) && row.countdownToRolloutMs >= COUNTDOWN_MIN_MS &&
      row.countdownToRolloutMs <= COUNTDOWN_MAX_MS && row.nonblack &&
      row.revealPrimed && row.loaderHidden && row.networkComplete && row.dropped === 0),
  scope: 'Native DOM countdown and source watchdog/reveal receipts; background DOM is not foreground presentation, RAF is not photons, and no screenshot or hardware-GPU claim is made.' };
}

function assertPortUnused() {
  try {
    const listeners = execFileSync('lsof', ['-nP', '-iTCP:7777', '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
    check(!listeners.trim(), 'foreign_signaling_listener');
  } catch (error) {
    if (error.status === 1 && !String(error.stdout ?? '').trim() && !String(error.stderr ?? '').trim()) return;
    if (error.probeCode) throw error;
    throw Object.assign(new Error('signaling_listener_check_failed'), { probeCode: 'signaling_listener_check_failed' });
  }
}

function closePreview(instance) {
  instance.httpServer.closeAllConnections();
  if (!instance.httpServer.listening) return Promise.resolve();
  return new Promise((resolveClose, reject) => instance.httpServer.close(error => error ? reject(error) : resolveClose()));
}

async function closeSignaling(service) {
  // Only this service's sockets. Native room/browser cleanup has already run.
  for (const socket of service.webSocketServer.clients) socket.terminate();
  service.server.closeAllConnections();
  await service.close();
}

const defaultDependencies = {
  createLock: createCaptureLock, now: () => performance.now(), assertPortUnused,
  createSignaling: () => createSignalingServer({ host: '127.0.0.1', port: 7777 }),
  startPreview: (dist, retain) => preview({ root: ROOT, configFile: false, logLevel: 'error',
    plugins: [{ name: 'immutable-loading-owner', configurePreviewServer: retain }],
    build: { outDir: dist }, preview: { host: '127.0.0.1', port: 0, strictPort: true } }),
  closePreview, closeSignaling, verify: verifyProductionPrivateRoomUi,
};

function assertNativeReceipt(report) {
  check(report.native.ok && report.native.signalingTransport === 'local-loopback' && report.ownedRoomObserved &&
    report.native.browserLaunch?.verified === true, 'native_scenario_incomplete');
  const health = report.native.browserHealth;
  check(health && !health.browserDisconnected && health.peers.length === 2 &&
    health.peers.every(peer => !peer.rendererCrashCount && !peer.appExceptionCount && !peer.closed), 'browser_health_failed');
  check(report.entry.complete, 'entry_evidence_incomplete');
}

/** The helper retains ownership of browser/room cleanup. Never race/abandon it.
 * FIFO cancellation is delayed until admission/timeout drains its exact ticket.
 * During native verification cancellation is checked at existing stage boundaries.
 * Native acquisition deadlines and cleanup can extend the nominal scenario cap. */
export async function acquireLoadingEvidence(dist, { signal, onStage = () => {}, entryProfile = 'timings' } = {}, overrides = {}) {
  check(['timings', 'host', 'guest'].includes(entryProfile), 'invalid_entry_profile');
  const deps = { ...defaultDependencies, ...overrides }, lock = deps.createLock();
  const acquisitions = createAcquisitionOwner(), started = deps.now();
  const report = { ok: false, stages: [], errors: [], cleanup: {}, ownedRoomObserved: false };
  let lockHeld = false, service, server, refresh, scenarioStarted = null, stage = 'capture_lock';
  const remaining = () => SCENARIO_TIMEOUT_MS - CLEANUP_RESERVE_MS - (deps.now() - scenarioStarted);
  const enter = next => {
    stage = next; report.stages.push({ stage, atMs: deps.now() - started }); onStage(next);
    check(!signal?.aborted, 'cancelled');
    if (scenarioStarted !== null) check(remaining() > 0, 'scenario_deadline');
  };
  try {
    enter('capture_lock');
    await acquisitions.acquire(() => lock.acquire(CAPTURE_QUEUE_TIMEOUT_MS), () => { lockHeld = true; });
    report.captureQueueWaitMs = deps.now() - started;
    check(!signal?.aborted, 'cancelled');
    scenarioStarted = deps.now();
    refresh = setInterval(() => lock.refresh(), 30000); refresh.unref();
    enter('owned_signaling');
    await deps.assertPortUnused();
    check(!signal?.aborted, 'cancelled');
    await acquisitions.acquire(async () => {
      service = deps.createSignaling(); // Retain before listen can reject (EADDRINUSE).
      await service.listen(); return service;
    }, owner => { service = owner; });
    enter('immutable_preview');
    await acquisitions.acquire(() => deps.startPreview(dist, owner => { server = owner; }), owner => { server = owner; });
    enter('native_verification');
    check(remaining() >= 30000, 'scenario_deadline');
    report.native = await deps.verify({ url: `http://127.0.0.1:${server.httpServer.address().port}`,
      timeoutMs: Math.floor(remaining()), localSignaling: true, entryProfile,
      onStage(next) {
        enter(next);
        if (next === 'ready_and_launch') {
          check(service.store.rooms.size === 1, 'owned_signaling_room_missing');
          report.ownedRoomObserved = true;
        }
      } });
    report.cleanup.native = report.native.cleanup;
    check(!signal?.aborted, 'cancelled');
    report.entry = entryEvidence(report.native);
    assertNativeReceipt(report);
  } catch (error) {
    report.errors.push({ stage, code: error.probeCode ?? null, ...productionDiagnosticDetails(error) });
    if (!report.native) report.native = productionFailureEvidence(error);
    if (error.cleanup) report.cleanup.native = error.cleanup;
  } finally {
    report.acquisitions = await acquisitions.drain();
    report.cleanup.remainingOwnedRooms = service?.store.rooms.size ?? 0;
    for (const [name, owner, close] of [['preview', server, deps.closePreview], ['signaling', service, deps.closeSignaling]]) {
      try { if (owner) await close(owner); report.cleanup[`${name}Closed`] = true; }
      catch { report.cleanup[`${name}Closed`] = false; report.errors.push({ stage: `${name}_cleanup` }); }
    }
    clearInterval(refresh);
    lock.release(); report.cleanup.lockReleased = lockHeld; report.cleanup.lockNotHeld = true;
    report.cleanup.fifoAcquisitionDrained = true;
    report.cancelled = signal?.aborted === true;
    report.scenarioDurationMs = scenarioStarted === null ? null : deps.now() - scenarioStarted;
    report.withinScenarioBudget = report.scenarioDurationMs !== null && report.scenarioDurationMs <= SCENARIO_TIMEOUT_MS;
    report.entry ??= entryEvidence(report.native);
    report.ok = !report.cancelled && !report.errors.length && report.withinScenarioBudget &&
      report.cleanup.native?.browserClosed === true && report.cleanup.native?.roomCleanupVerified === true &&
      report.cleanup.remainingOwnedRooms === 0 && report.cleanup.lockReleased;
  }
  return report;
}

export async function runMultiplayerLoadingBuildProbe({ dist, out, expectedBuildIndexHash, signal, onStage, entryProfile = 'timings' } = {}) {
  check(['timings', 'host', 'guest'].includes(entryProfile), 'invalid_entry_profile');
  check(typeof dist === 'string' && isAbsolute(dist) && typeof out === 'string' && isAbsolute(out) &&
    resolve(out) !== resolve(out, '..'), 'absolute_paths_required');
  check(/^[a-f0-9]{64}$/.test(expectedBuildIndexHash ?? ''), 'approved_index_sha_required');
  const buildRoot = realpathSync(dist), output = resolve(out);
  const outputParent = realpathSync(dirname(output));
  const outputRelative = relative(buildRoot, join(outputParent, basename(output)));
  check(outputRelative === '..' || outputRelative.startsWith(`..${sep}`) || isAbsolute(outputRelative), 'output_inside_build');
  const index = readFileSync(join(buildRoot, 'index.html'));
  check(sha256(index) === expectedBuildIndexHash, 'approved_index_mismatch');
  const sourceVersion = index.toString().match(/name="application-version" content="(v[\w.+-]+)"/)?.[1];
  check(!!sourceVersion, 'build_source_version_missing');
  const before = { build: hashBuild(buildRoot), acquisition: hashAcquisition() };
  mkdirSync(output); // Atomic fresh-only claim; never recursively reuse evidence.
  const report = { protocol: 'multiplayer-loading-immutable-native-v1', pid: process.pid, sourceVersion,
    expectedBuildIndexHash, before, startedAt: new Date().toISOString(),
    scenario: { canonicalMap: 'winter', freshBrowserContexts: 2, cacheDisabled: true,
      entryProfile, waitForRoomMap: false, localSignaling: true, signalingPort: 7777,
      previewPort: 0, timeoutMs: SCENARIO_TIMEOUT_MS, captureQueueTimeoutMs: CAPTURE_QUEUE_TIMEOUT_MS,
      overrides: false, backgroundScheduling: 'native' },
    cancellation: 'Queued cancellation drains FIFO admission/timeout before release; native verification cancels at existing stage boundaries. Cleanup is awaited, not abandoned at a deadline.' };
  try {
    Object.assign(report, await acquireLoadingEvidence(buildRoot, { signal, onStage, entryProfile }));
  } catch (error) {
    report.ok = false; report.errors = [{ stage: 'acquisition', ...productionDiagnosticDetails(error) }];
  } finally {
    try {
      report.after = { build: hashBuild(buildRoot), acquisition: hashAcquisition(), indexSha256: sha256(readFileSync(join(buildRoot, 'index.html'))) };
      report.identityUnchanged = before.build.sha256 === report.after.build.sha256 &&
        before.acquisition.sha256 === report.after.acquisition.sha256 && expectedBuildIndexHash === report.after.indexSha256;
    } catch { report.identityUnchanged = false; }
    report.ok = report.ok === true && report.identityUnchanged;
    report.endedAt = new Date().toISOString();
    writeFileSync(join(output, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
  return report;
}

export function parseLoadingProbeArgs(args) {
  const values = {};
  for (const arg of args) {
    const match = arg.match(/^--(dist|out|expected-build-index-hash|entry-profile)=(.+)$/);
    assert.ok(match && !Object.hasOwn(values, match[1]), 'Only unique --dist, --out, --expected-build-index-hash, --entry-profile are accepted');
    values[match[1]] = match[2];
  }
  const entryProfile = values['entry-profile'];
  check(entryProfile === undefined || ['timings', 'host', 'guest'].includes(entryProfile), 'invalid_entry_profile');
  return { dist: values.dist, out: values.out, expectedBuildIndexHash: values['expected-build-index-hash'],
    ...(entryProfile === undefined ? {} : { entryProfile }) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.slice(2).join(' ') === '--help') {
    console.log('node tools/multiplayer-loading-build-probe.mjs --dist=/absolute/immutable-public-dist --out=/absolute/fresh-output --expected-build-index-hash=<sha256> [--entry-profile=timings|host|guest]');
  } else {
    const controller = new AbortController(), cancel = () => controller.abort();
    process.on('SIGINT', cancel); process.on('SIGTERM', cancel);
    try {
      const options = parseLoadingProbeArgs(process.argv.slice(2));
      console.log(`[loading-build] pid=${process.pid} output=${options.out}`);
      const result = await runMultiplayerLoadingBuildProbe({ ...options, signal: controller.signal,
        onStage: stage => console.log(`[loading-build] ${stage}`) });
      console.log(JSON.stringify({ ok: result.ok, report: join(options.out, 'report.json'), errors: result.errors }));
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error(JSON.stringify({ ok: false, code: error.probeCode ?? 'probe_setup_failed' })); process.exitCode = 1;
    } finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); }
  }
}
