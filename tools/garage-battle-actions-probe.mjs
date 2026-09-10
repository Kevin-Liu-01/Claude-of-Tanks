// Opt-in real-control regression against an ALREADY SERVED build. No build/server
// is started. Uses a fresh profile, normal transitions and the actual Battle,
// Battle Again and adopted Return-to-Garage buttons. Only fixture selection and
// elimination use diagnostic owners; entry/return never use debug shortcuts.
//
// node tools/garage-battle-actions-probe.mjs --url=http://127.0.0.1:4178 --out=/absolute/new-directory
// Options: --spec=m1a1 --map=urban --cpu-rate=1 --cover-limit-ms=500 --timeout-ms=90000
// Optional --profile-actions writes per-action .cpuprofile files; attribution-only,
// never compare those timings with an unprofiled acceptance run.
// Optional --audio-clock-gate also requires passively observed loading-clock
// advancement and stopped loading/ambient owners on return; no test sounds.
// Reports click→first painted opaque cover and click→ready, not steady-state FPS.
// Roster receipts are retained; random bot composition must not be mistaken for
// a matched-roster throughput benchmark. Queue this outside other native jobs.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
import { createCaptureLock } from './capture-lock.mjs';
import { checkGarageBattleActions, checkGarageActionAudio } from './garage-battle-actions-contract.mjs';
import { readPhaseEnvironment } from './phase-environment-receipt.mjs';
import { installGarageActionTiming, summarizeGarageActionTiming, withGarageActionProfile } from './garage-action-timing.mjs';
import { waitForGarageAction } from './garage-action-failure.mjs';

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
const audioClockGate = process.argv.includes('--audio-clock-gate');
if (![cpuRate, coverLimitMs, timeoutMs].every(value => Number.isFinite(value) && value > 0)
  || cpuRate < 1 || timeoutMs < 1000) throw new Error('Invalid timing/CPU option');
url.searchParams.set('debug', '1');
url.searchParams.set('nosplash', '1');
url.searchParams.set('tier', 'desktop');
url.searchParams.set('gfxreset', '1');
url.searchParams.delete('notrans');
await mkdir(out); // Never overwrite an earlier run, including its failure evidence.
const hash = content => createHash('sha256').update(content).digest('hex');
const retryCatalogs = await Promise.all(['en-US', 'zh-CN'].map(locale =>
  readFile(new URL(`../src/ui/i18nCatalog.${locale}.json`, import.meta.url), 'utf8')));
const retryTitles = retryCatalogs.map(catalog => JSON.parse(catalog)['boot.retry']);
const report = { schemaVersion: 2, passScope: 'real-control-functional-only',
  measurementMode: profileActions ? 'cpu-profile-attribution-only' : 'unprofiled-functional',
  profileActions, profiles: [],
  audioClockGate,
  url: url.href, specId, mapId, cpuRate, coverLimitMs,
  timeoutMs, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  acquisitionHash: hash((await Promise.all([
    readFile(new URL(import.meta.url)),
    readFile(new URL('./garage-battle-actions-contract.mjs', import.meta.url)),
    readFile(new URL('./phase-environment-receipt.mjs', import.meta.url)),
    readFile(new URL('./garage-action-timing.mjs', import.meta.url)),
    readFile(new URL('./garage-action-failure.mjs', import.meta.url)),
  ])).concat(retryCatalogs).join('\n')),
  startedAt: new Date().toISOString(), actions: [], errors: [], cleanupErrors: [], failures: [] };
const lock = createCaptureLock();
let browser, page, cdp, refresher;
let leaseAcquired = false, interruptedBy = null, closingBrowser;

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
  void closeOwnedBrowser();
}
const onSigint = () => interruptProbe('SIGINT');
const onSigterm = () => interruptProbe('SIGTERM');
process.on('SIGINT', onSigint);
process.on('SIGTERM', onSigterm);

async function runAction(action, selector) {
  assertProbeActive();
  await page.waitForSelector(selector, { visible: true });
  await page.evaluate((label, target) => window.__ACTION_TRACE.arm(label, target), action, selector);
  const receipt = await withGarageActionProfile({
    page, cdp, enabled: profileActions, action,
    onProfile: async (profile, capture) => {
      const file = `${action}.cpuprofile`;
      await writeFile(resolve(out, file), `${JSON.stringify(profile)}\n`, { flag: 'wx' });
      report.profiles.push({ ...capture, file });
    },
    onCleanupError: error => report.cleanupErrors.push(`profile ${action}: ${String(error)}`),
  }, async () => {
    await waitForGarageAction(page, { action, retryTitles, timeoutMs,
      onCleanupError: error => report.cleanupErrors.push(`action ${action}: ${String(error)}`),
    }, async () => {
      await page.click(selector);
    });
    return page.evaluate(() => window.__ACTION_TRACE.finish());
  });
  receipt.timingDiagnostic = summarizeGarageActionTiming(receipt);
  receipt.environment = await page.evaluate(readPhaseEnvironment);
  report.actions.push(receipt);
  await page.screenshot({ path: resolve(out, `${action}.png`) });
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
  const navigation = await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  if (!navigation?.ok()) throw new Error(`Navigation failed: ${navigation?.status()}`);
  report.buildIndexHash = hash(await navigation.text());
  await page.waitForFunction(() => window.__GAME_READY === true && window.__DEBUG?.garage);
  await page.evaluate((spec, map) => {
    window.__DEBUG.selectGarageTank(spec);
    window.__DEBUG.garage.setSelectedMap(map);
  }, specId, mapId);
  await page.waitForFunction((spec, map) => window.__DEBUG.pedestalOnStage
    && window.__DEBUG.pedestalVisual?.specId === spec
    && window.__DEBUG.selectedSpecId === spec && window.__DEBUG.garage.getSelectedMap() === map,
  {}, specId, mapId);
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
  report.audioClock = { gateRequested: audioClockGate, pass: audioFailures.length === 0,
    failures: audioFailures,
    caveat: 'Passive existing-context clock and loading/ambient ownership only; no PCM or audible-output proof.' };
  report.functionalPass = report.failures.length === 0;
  report.pass = report.functionalPass && (!audioClockGate || report.audioClock.pass);
  await writeFile(resolve(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
  if (!report.pass) process.exitCode = interruptedBy === 'SIGINT' ? 130 : interruptedBy === 'SIGTERM' ? 143 : 1;
}
