// Opt-in real-control regression against an ALREADY SERVED build. No build/server
// is started. Uses a fresh profile, normal transitions and the actual Battle,
// Battle Again and adopted Return-to-Garage buttons. Only fixture selection and
// elimination use diagnostic owners; entry/return never use debug shortcuts.
//
// node tools/garage-battle-actions-probe.mjs --url=http://127.0.0.1:4178 --out=/absolute/new-directory
// Options: --spec=m1a1 --map=urban --cpu-rate=1 --cover-limit-ms=500 --timeout-ms=90000
// Optional --profile-actions writes per-action .cpuprofile files; attribution-only,
// never compare those timings with an unprofiled acceptance run.
// Optional --trace-actions writes sanitized per-action .trace.json timelines.
// Diagnostic-only, capped at 30 seconds/action; incompatible with --profile-actions.
// Optional --audio-clock-gate also requires passively observed loading-clock
// advancement and stopped loading/ambient owners on return; no test sounds.
// Optional --garage-gesture-audio-gate verifies a real Garage canvas drag does
// not construct audio, then requires exactly one context through real battles
// and the existing audio-clock gate. Native options/output are never modified.
// Optional --boot-audio-gate instead exercises the real trusted splash-entry
// gesture and requires one shared native context through both Battle actions.
// Optional --warm-readiness-gate requires the first Battle and Rematch countdown
// warm owners to finish without an error before rollout. It does not change work.
// Optional --source-readiness-gate requires the existing source settlement to
// be fully applied at first uncovered battle and finish; it never delays reveal.
// Reports click→first painted opaque cover and click→ready, not steady-state FPS.
// Roster receipts are retained; random bot composition must not be mistaken for
// a matched-roster throughput benchmark. Queue this outside other native jobs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';
import { checkGarageBattleActions, checkGarageActionAudio, checkGarageActionWarmReadiness } from './garage-battle-actions-contract.mjs';
import { readPhaseEnvironment } from './phase-environment-receipt.mjs';
import { installGarageActionTiming, summarizeGarageActionTiming, withGarageActionProfile,
  withGarageActionTrace } from './garage-action-timing.mjs';
import { waitForGarageAction } from './garage-action-failure.mjs';
import { installGarageAudioIntent, readGarageAudioIntent, garageAudioGestureCandidates,
  checkGarageAudioIntent, checkBootAudioIntent } from './garage-audio-intent.mjs';
import { installSourcedTextureReadiness, checkSourcedTextureReadiness } from './sourced-texture-readiness.mjs';

const option = (name, fallback = '') => process.argv.slice(2)
  .find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const base = option('url'), output = option('out');
if (!base || !output) throw new Error('Required: --url=http(s)://served-build --out=/absolute/new-directory');
const url = new URL(base);
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Expected HTTP(S) build URL');
const out = resolve(output), specId = option('spec', 'm1a1'), mapId = option('map', 'urban');
const cpuRate = Number(option('cpu-rate', '1'));
const coverLimitMs = Number(option('cover-limit-ms', '500'));
const timeoutMs = Number(option('timeout-ms', '90000'));
const profileActions = process.argv.includes('--profile-actions')
  || ['1', 'true'].includes(option('profile-actions', 'false').toLowerCase());
const traceActions = process.argv.includes('--trace-actions')
  || ['1', 'true'].includes(option('trace-actions', 'false').toLowerCase());
if (traceActions && profileActions) throw new Error('--trace-actions and --profile-actions are separate diagnostic acquisitions');
const audioClockGate = process.argv.includes('--audio-clock-gate');
const garageGestureAudioGate = process.argv.includes('--garage-gesture-audio-gate');
const bootAudioGate = process.argv.includes('--boot-audio-gate');
if (bootAudioGate && garageGestureAudioGate) throw new Error('Boot and no-splash Garage audio gates are separate fixtures');
const warmReadinessGate = process.argv.includes('--warm-readiness-gate');
const sourceReadinessGate = process.argv.includes('--source-readiness-gate');
if (![cpuRate, coverLimitMs, timeoutMs].every(value => Number.isFinite(value) && value > 0)
  || cpuRate < 1 || timeoutMs < 1000) throw new Error('Invalid timing/CPU option');
url.searchParams.set('debug', '1');
if (bootAudioGate) { url.searchParams.delete('nosplash'); url.searchParams.delete('nogate'); }
else url.searchParams.set('nosplash', '1');
url.searchParams.set('tier', 'desktop');
url.searchParams.set('gfxreset', '1');
url.searchParams.delete('notrans');
await mkdir(out); // Never overwrite an earlier run, including its failure evidence.
const hash = content => createHash('sha256').update(content).digest('hex');
const retryCatalogs = await Promise.all(['en-US', 'zh-CN'].map(locale =>
  readFile(new URL(`../src/ui/i18nCatalog.${locale}.json`, import.meta.url), 'utf8')));
const retryTitles = retryCatalogs.map(catalog => JSON.parse(catalog)['boot.retry']);
const report = { schemaVersion: 2,
  passScope: warmReadinessGate && sourceReadinessGate ? 'real-control-functional-and-warm-and-source-readiness'
    : warmReadinessGate ? 'real-control-functional-and-warm-readiness'
      : sourceReadinessGate ? 'real-control-functional-and-source-readiness' : 'real-control-functional-only',
  measurementMode: traceActions ? 'timeline-trace-attribution-only'
    : profileActions ? 'cpu-profile-attribution-only' : 'unprofiled-functional',
  profileActions, profiles: [],
  ...(traceActions ? { traceActions: true, traces: [] } : {}),
  audioClockGate,
  bootAudioGate,
  ...(garageGestureAudioGate ? { garageGestureAudioGate: true } : {}),
  ...(warmReadinessGate ? { warmReadinessGate: true } : {}),
  ...(sourceReadinessGate ? { sourceReadinessGate: true } : {}),
  url: url.href, specId, mapId, cpuRate, coverLimitMs,
  timeoutMs, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  acquisitionHash: hash((await Promise.all([
    readFile(new URL(import.meta.url)),
    readFile(new URL('./garage-battle-actions-contract.mjs', import.meta.url)),
    readFile(new URL('./phase-environment-receipt.mjs', import.meta.url)),
    readFile(new URL('./garage-action-timing.mjs', import.meta.url)),
    readFile(new URL('./garage-action-failure.mjs', import.meta.url)),
    ...(traceActions ? [readFile(new URL('./multiplayer-frame-trace.mjs', import.meta.url))] : []),
    ...(garageGestureAudioGate || bootAudioGate ? [readFile(new URL('./garage-audio-intent.mjs', import.meta.url))] : []),
    ...(sourceReadinessGate ? [readFile(new URL('./sourced-texture-readiness.mjs', import.meta.url))] : []),
  ])).concat(retryCatalogs).join('\n')),
  startedAt: new Date().toISOString(), actions: [], errors: [], cleanupErrors: [], failures: [] };
const lock = createCaptureLock();
const startTrace = traceActions ? (await import('./multiplayer-frame-trace.mjs')).startMultiplayerFrameTrace : null;
let browser, page, cdp, refresher;
let leaseAcquired = false, interruptedBy = null, closingBrowser, activeActionTrace;

function assertProbeActive() {
  if (interruptedBy) throw new Error(`Probe interrupted by ${interruptedBy}`);
}

function closeOwnedBrowser() {
  if (!browser) return Promise.resolve();
  if (!closingBrowser) closingBrowser = Promise.resolve().then(() => browser.close())
    .catch(error => report.cleanupErrors.push(String(error)));
  return closingBrowser;
}

function interruptProbe(signal) {
  interruptedBy ||= signal;
  // Closing the owned browser interrupts any active navigation/action wait.
  // During acquisition or launch there is no browser yet: the post-await
  // guards handle that lifetime, without releasing another owner's lease.
  // Flush our bounded trace while its page clock still exists, then close.
  void Promise.resolve(activeActionTrace?.stop('interrupted'))
    .catch(() => {}).finally(closeOwnedBrowser);
}
const onSigint = () => interruptProbe('SIGINT');
const onSigterm = () => interruptProbe('SIGTERM');
process.on('SIGINT', onSigint);
process.on('SIGTERM', onSigterm);

async function runAction(action, selector) {
  assertProbeActive();
  await page.waitForSelector(selector, { visible: true });
  await page.evaluate((label, target) => window.__ACTION_TRACE.arm(label, target), action, selector);
  const receipt = await withGarageActionTrace({
    page, enabled: traceActions, action, startTrace,
    onOwner: owner => { activeActionTrace = owner; },
    onTrace: async (trace, capture) => {
      const file = `${action}.trace.json`;
      await writeFile(resolve(out, file), `${JSON.stringify({ ...capture, trace })}\n`, { flag: 'wx' });
      report.traces.push({ ...capture, file });
    },
    onCleanupError: error => report.cleanupErrors.push(`trace ${action}: ${String(error)}`),
  }, () => withGarageActionProfile({
    page, cdp, enabled: profileActions, action,
    onProfile: async (profile, capture) => {
      const file = `${action}.cpuprofile`;
      await writeFile(resolve(out, file), `${JSON.stringify(profile)}\n`, { flag: 'wx' });
      report.profiles.push({ ...capture, file });
    },
    onCleanupError: error => report.cleanupErrors.push(`profile ${action}: ${String(error)}`),
  }, async () => {
    assertProbeActive();
    await waitForGarageAction(page, { action, retryTitles, timeoutMs,
      onCleanupError: error => report.cleanupErrors.push(`action ${action}: ${String(error)}`),
    }, async () => {
      await page.click(selector);
    });
    return page.evaluate(() => window.__ACTION_TRACE.finish());
  }));
  receipt.timingDiagnostic = summarizeGarageActionTiming(receipt);
  receipt.environment = await page.evaluate(readPhaseEnvironment);
  if (garageGestureAudioGate || bootAudioGate) receipt.garageAudioIntent = await page.evaluate(readGarageAudioIntent);
  report.actions.push(receipt);
  await page.screenshot({ path: resolve(out, `${action}.png`) });
}

async function runGarageAudioGesture() {
  assertProbeActive();
  const before = await page.evaluate(readGarageAudioIntent);
  report.garageAudioIntent = { before, after: null, canvasHitVerified: false };
  const candidates = garageAudioGestureCandidates(before.stage, report.viewport);
  const path = await page.evaluate(paths => {
    const canvas = window.__DEBUG?.renderer?.domElement;
    if (!canvas || canvas.getClientRects().length === 0) return null;
    return paths.find(({ start, end }) => [0, 0.5, 1].every(fraction =>
      document.elementFromPoint(start.x + (end.x - start.x) * fraction, start.y) === canvas)) ?? null;
  }, candidates);
  if (!path) throw new Error('Garage gesture: no bounded stage path hits the actual renderer canvas');
  Object.assign(report.garageAudioIntent, { path, canvasHitVerified: true });
  await page.screenshot({ path: resolve(out, 'garage-before-gesture.png') });
  await page.mouse.move(path.start.x, path.start.y);
  await page.evaluate(() => window.__GARAGE_AUDIO_INTENT.armGesture(window.__DEBUG.renderer.domElement));
  try {
    await page.mouse.down({ button: 'left' });
    await page.mouse.move(path.end.x, path.end.y, { steps: 10 });
    // Post-handler, still-held observation distinguishes native movement
    // payload, drag ownership and production frame progress without forcing any.
    report.garageAudioIntent.held = await page.evaluate(readGarageAudioIntent);
  } finally {
    await page.mouse.up({ button: 'left' });
    report.garageAudioIntent.released = await page.evaluate(readGarageAudioIntent);
    await page.evaluate(() => window.__GARAGE_AUDIO_INTENT.finishGesture());
  }
  const releasedAtMs = report.garageAudioIntent.released.atMs;
  // Observe pending lazy imports too. No input, renderer or audio-state forcing.
  await page.waitForFunction(start => performance.now() - start >= 1000, { timeout: timeoutMs }, releasedAtMs);
  const after = await page.evaluate(readGarageAudioIntent);
  Object.assign(report.garageAudioIntent, { after, releasedAtMs, observationMs: after.atMs - releasedAtMs });
  await page.screenshot({ path: resolve(out, 'garage-after-gesture.png') });
}

async function finishFixtureBattle() {
  // The live solo result owner observes these eliminated enemies and presents
  // the ordinary report. Do not directly synthesize result DOM or ui:battleAgain.
  await page.evaluate(() => window.__DEBUG.slayEnemies());
  await page.waitForSelector('.cot-es-btn.prime', { visible: true, timeout: timeoutMs });
}

try {
  await lock.acquire(15 * 60 * 1000);
  leaseAcquired = true;
  assertProbeActive();
  refresher = setInterval(() => lock.refresh(), 30_000);
  refresher.unref();
  browser = await puppeteer.launch({ headless: 'new', handleSIGINT: false, handleSIGTERM: false,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] });
  assertProbeActive();
  report.browserVersion = await browser.version();
  page = await browser.newPage();
  page.setDefaultTimeout(timeoutMs);
  await page.setViewport(report.viewport);
  cdp = await page.createCDPSession();
  if (cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  page.on('pageerror', error => report.errors.push(String(error)));
  page.on('console', entry => { if (entry.type() === 'error') report.errors.push(entry.text()); });
  await page.evaluateOnNewDocument(() => {
    // Match player fades. No quality, simulation, renderer or readiness overrides.
    Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false });
  });
  await page.evaluateOnNewDocument(installGarageActionTiming);
  if (sourceReadinessGate) await page.evaluateOnNewDocument(installSourcedTextureReadiness);
  if (garageGestureAudioGate || bootAudioGate) await page.evaluateOnNewDocument(installGarageAudioIntent);
  if (bootAudioGate) await page.evaluateOnNewDocument(() => { window.__COT_FORCE_SPLASH = true; });
  const navigation = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  if (!navigation?.ok()) throw new Error(`Navigation failed: ${navigation?.status()}`);
  report.buildIndexHash = hash(await navigation.text());
  await page.waitForFunction(() => window.__GAME_READY === true && window.__DEBUG?.garage);
  if (bootAudioGate) {
    await page.waitForSelector('#cot-boot-gate.on', { visible: true });
    report.bootAudioIntent = { before: await page.evaluate(readGarageAudioIntent) };
    Object.assign(report.bootAudioIntent, await page.evaluate(() => {
      const root = document.getElementById('cot-boot'), gate = document.getElementById('cot-boot-gate');
      window.__GARAGE_AUDIO_INTENT.armGesture(gate);
      return { armedAtMs: performance.now(), gateReady: gate.classList.contains('on'),
        opaqueBefore: !!root.getClientRects().length && Number(getComputedStyle(root).opacity) >= 0.95 };
    }));
    await page.click('#cot-boot-gate');
    await page.evaluate(() => window.__GARAGE_AUDIO_INTENT.finishGesture());
    await page.waitForFunction(() => {
      const root = document.getElementById('cot-boot');
      return !root || !root.getClientRects().length || Number(getComputedStyle(root).opacity) === 0;
    });
    Object.assign(report.bootAudioIntent, { after: await page.evaluate(readGarageAudioIntent), dismissed: true,
      finishedAtMs: await page.evaluate(() => performance.now()) });
  }
  await page.evaluate((spec, map) => {
    window.__DEBUG.selectGarageTank(spec);
    window.__DEBUG.garage.setSelectedMap(map);
  }, specId, mapId);
  await page.waitForFunction((spec, map) => window.__DEBUG.pedestalOnStage
    && window.__DEBUG.pedestalVisual?.specId === spec
    && window.__DEBUG.selectedSpecId === spec && window.__DEBUG.garage.getSelectedMap() === map,
  {}, specId, mapId);
  if (garageGestureAudioGate) await runGarageAudioGesture();
  // Explicitly choose the ordinary Bots entry using the actual mode picker.
  await page.click('.cot-battle-mode');
  await page.click('.cot-battle-choice[data-mode="solo"]');
  await runAction('battle', '.cot-battle');
  await finishFixtureBattle();
  await runAction('battle-again', '.cot-es-btn.prime');
  await finishFixtureBattle();
  await runAction('return-to-garage', '.cot-es-btn.ghost');
  assertProbeActive();
  report.failures.push(...checkGarageBattleActions(report.actions, { coverLimitMs }));
} catch (error) {
  report.failures.push(String(error));
  if (error.actionFailure) report.actionFailure = error.actionFailure;
  if (page && !page.isClosed()) {
    report.partialAction = await page.evaluate(() => window.__ACTION_TRACE?.finish()).catch(() => null);
    await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {});
  }
} finally {
  if (activeActionTrace) {
    try { await activeActionTrace.stop(interruptedBy ? 'interrupted' : 'probe-finally'); }
    catch (error) { report.cleanupErrors.push(`trace cleanup: ${String(error)}`); }
  }
  if ((garageGestureAudioGate || bootAudioGate) && page && !page.isClosed()) {
    try {
      report.garageAudioObserverCleanup = await page.evaluate(() => window.__GARAGE_AUDIO_INTENT?.stop() ?? null);
      const cleanup = report.garageAudioObserverCleanup?.cleanup;
      if (!cleanup || cleanup.failedNames.length || cleanup.notOwnedNames.length) {
        report.cleanupErrors.push('Garage audio constructor observer did not restore all owned wrappers');
      }
    } catch (error) { report.cleanupErrors.push(`Garage audio observer: ${String(error)}`); }
  }
  if (page && !page.isClosed()) await page.evaluate(() => window.__ACTION_TRACE?.stop()).catch(() => {});
  await closeOwnedBrowser();
  clearInterval(refresher);
  if (leaseAcquired) lock.release();
  process.removeListener('SIGINT', onSigint);
  process.removeListener('SIGTERM', onSigterm);
  if (interruptedBy) {
    report.interruptedBy = interruptedBy;
    report.failures.push(`Probe interrupted by ${interruptedBy}`);
  }
  report.finishedAt = new Date().toISOString();
  report.failures.push(...report.errors.map(error => `browser: ${error}`));
  report.failures.push(...report.cleanupErrors.map(error => `cleanup: ${error}`));
  const audioFailures = checkGarageActionAudio(report.actions);
  report.audioClock = { gateRequested: audioClockGate || garageGestureAudioGate || bootAudioGate, pass: audioFailures.length === 0,
    failures: audioFailures,
    caveat: 'Passive existing-context clock and loading/ambient ownership only; no PCM or audible-output proof.' };
  report.functionalPass = report.failures.length === 0;
  if (traceActions) report.traceDiagnostics = {
    complete: report.traces.length === 3 && report.traces.every(trace => trace.completeForAction),
    caveat: 'Diagnostic overhead; 30-second action trace deadline can censor a longer action. Functional/readiness gates are unchanged. Sanitized timeline event categories are not JS hot-function or GPU hardware-duration attribution.',
  };
  if (bootAudioGate) {
    const failures = checkBootAudioIntent(report.bootAudioIntent, report.actions);
    report.bootAudio = { pass: failures.length === 0, failures,
      caveat: 'Opaque ready splash, trusted entry and one shared native constructor through battles; device startup cost is moved, not removed; no PCM proof.' };
  }
  if (garageGestureAudioGate) {
    const failures = checkGarageAudioIntent(report.garageAudioIntent, report.actions);
    report.garageGestureAudio = { gateRequested: true, pass: failures.length === 0, failures,
      caveat: 'Passive native constructor timing/count and trusted Garage orbit only; no device IDs, options, PCM or audible-output proof.' };
  }
  if (warmReadinessGate) {
    const failures = checkGarageActionWarmReadiness(report.actions);
    report.warmReadiness = { gateRequested: true, pass: failures.length === 0, failures,
      caveat: 'Production countdown warm completion before rollout only; no physical display or GPU-duration proof.' };
  }
  if (sourceReadinessGate) {
    const failures = report.actions.flatMap(action => checkSourcedTextureReadiness(action));
    report.sourceReadiness = { gateRequested: true, pass: failures.length === 0, failures,
      caveat: 'Existing source settlement and application at reveal only; no worker-routing or GPU-duration proof.' };
  }
  report.pass = report.functionalPass && (!(audioClockGate || garageGestureAudioGate || bootAudioGate) || report.audioClock.pass)
    && (!bootAudioGate || report.bootAudio.pass)
    && (!garageGestureAudioGate || report.garageGestureAudio.pass)
    && (!warmReadinessGate || report.warmReadiness.pass)
    && (!sourceReadinessGate || report.sourceReadiness.pass);
  await writeFile(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = interruptedBy === 'SIGINT' ? 130 : interruptedBy === 'SIGTERM' ? 143 : 1;
}
