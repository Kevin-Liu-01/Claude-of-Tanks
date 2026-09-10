#!/usr/bin/env node
// Opt-in native regression against an ALREADY SERVED immutable production build.
// node tools/solo-cold-import-cover-probe.mjs --url=http://127.0.0.1:4178/ \
//   --dist=/absolute/dist --source-root=/absolute/source --out=/absolute/new-output \
//   --expected-build-index-hash=<sha256>
// Optional --timeout-ms=180000 --cover-limit-ms=500 --observe-held-ms=1500.
// No server/build, debug entry, runtime substitution, audio/device changes, or
// rendering overrides. Delays exactly one real loading-module network request.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCaptureLock } from './capture-lock.mjs';
import { nativeBrowserLaunchOptions, verifyNativeBrowserLaunch } from './native-browser-launch.mjs';
import { resolveColdLoadingAsset, createColdImportHold, installColdImportCoverObserver,
  checkColdImportCover } from './solo-cold-import-cover.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const option = (name, fallback = '') => process.argv.slice(2).find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
if (process.argv.includes('--help')) {
  console.log('Required: --url=http(s)://served-build/ --dist=/absolute/dist --source-root=/absolute/source --out=/absolute/new-output --expected-build-index-hash=<sha256>\nOptional: --timeout-ms=180000 --cover-limit-ms=500 --observe-held-ms=1500');
  process.exit(0);
}
const options = { url: option('url'), dist: option('dist'), sourceRoot: option('source-root'), out: option('out'),
  expectedBuildIndexHash: option('expected-build-index-hash'), timeoutMs: Number(option('timeout-ms', '180000')),
  coverLimitMs: Number(option('cover-limit-ms', '500')), observeHeldMs: Number(option('observe-held-ms', '1500')) };
if (![options.dist, options.sourceRoot, options.out].every(isAbsolute)
  || !/^[a-f0-9]{64}$/.test(options.expectedBuildIndexHash)) throw new Error('Required absolute dist/source-root/out and expected-build-index-hash');
if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30000 || options.timeoutMs > 300000
  || !Number.isFinite(options.coverLimitMs) || options.coverLimitMs < 1 || options.coverLimitMs > 1000
  || !Number.isFinite(options.observeHeldMs) || options.observeHeldMs < 1000 || options.observeHeldMs > 3000) {
  throw new Error('Invalid bounded deadline/cover/held-observation options');
}
const url = new URL(options.url);
if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Expected HTTP(S) served-build URL');
for (const [name, value] of Object.entries({ debug: '1', nosplash: '1', tier: 'desktop', gfxreset: '1' })) url.searchParams.set(name, value);
url.searchParams.delete('notrans');

async function sourceReceipt() {
  const git = args => execFileSync('git', ['-C', options.sourceRoot, ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const paths = [...new Set(git(['ls-files', '-z', '-co', '--exclude-standard', '--', 'src']).split('\0').filter(Boolean))].sort();
  const digest = createHash('sha256');
  for (const path of paths) digest.update(path).update('\0').update(await readFile(resolve(options.sourceRoot, path))).update('\0');
  return { root: options.sourceRoot, revision: git(['rev-parse', 'HEAD']).trim(), sourceHash: digest.digest('hex'),
    pathCount: paths.length, scope: 'sorted tracked and non-ignored untracked src paths and bytes',
    dirtyPaths: git(['status', '--short', '--', 'src']).trim().split('\n').filter(Boolean) };
}

async function acquisitionHash() {
  const digest = createHash('sha256');
  for (const name of ['tools/solo-cold-import-cover-probe.mjs', 'tools/solo-cold-import-cover.mjs',
    'tools/capture-lock.mjs', 'tools/native-browser-launch.mjs', 'package-lock.json']) {
    digest.update(name).update('\0').update(await readFile(resolve(ROOT, name))).update('\0');
  }
  return digest.digest('hex');
}

async function bounded(work, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`deadline:${label}`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

const indexBytes = await readFile(resolve(options.dist, 'index.html'));
if (hash(indexBytes) !== options.expectedBuildIndexHash) throw new Error('Local build index does not match expected hash');
const targetAsset = resolveColdLoadingAsset(await readdir(resolve(options.dist, 'assets')));
const scripts = [...indexBytes.toString().matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)].map(match => match[1]);
const entryScripts = scripts.filter(src => /\/assets\/main-[^/]+\.js$/.test(src));
if (entryScripts.length !== 1) throw new Error('Unsupported emitted entry script layout');
const targetUrl = new URL(targetAsset, new URL(entryScripts[0], url)).href;
const targetAssetSha256 = hash(await readFile(resolve(options.dist, 'assets', targetAsset)));
await mkdir(options.out); // Never overwrite any prior success or failure receipt.
const report = { protocol: 'solo-cold-import-cover-v1', pass: false,
  startedAt: new Date().toISOString(), url: url.href, options,
  buildIndexHash: options.expectedBuildIndexHash, targetAsset, targetUrl, targetAssetSha256,
  source: await sourceReceipt(), acquisitionHash: await acquisitionHash(),
  sourceCaveat: 'Local source fingerprint is provenance supplied by the operator; served index and delayed module bytes are independently hash-verified.',
  queuePolicy: 'Before FIFO admission, ordinary OS signal termination applies. A dead queued PID ticket is reaped by the shared FIFO on its next scan, not synchronously by this probe. After admission this probe owns signal/browser/request cleanup.',
  targetResponseCount: 0,
  coverLimitMs: options.coverLimitMs, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
  observationCaveat: 'DOM geometry/opacity, a browser animation callback, and a screenshot while the real request is held establish visible cover evidence; rAF is not physical GPU/display acknowledgement.',
  errors: [], failures: [], cleanupErrors: [] };
const lock = createCaptureLock();
let lease = false, refresher = null, browser = null, page = null, cdp = null, hold = null;
let fetchEnabled = false, scenarioStartedAt = null, interrupted = null, pausedListener = null;
const responseWork = [];
let closePromise = null;
const active = () => { if (interrupted) throw new Error(`interrupted:${interrupted}`); };
const remaining = () => Math.max(1, options.timeoutMs - (performance.now() - scenarioStartedAt));
const run = (label, work) => { active(); return bounded(work, remaining(), label); };

async function closeBrowser() {
  if (!browser) return;
  if (closePromise) return closePromise;
  closePromise = (async () => {
    try { await bounded(() => browser.close(), 10000, 'browser-close'); report.browserClosed = true; }
    catch (error) {
      report.cleanupErrors.push(String(error));
      const child = browser.process();
      if (child && child.exitCode === null && child.signalCode === null) {
        const exited = new Promise(resolveExit => child.once('exit', resolveExit));
        child.kill('SIGKILL'); // Only this probe's explicitly owned native child.
        await bounded(() => exited, 5000, 'owned-browser-exit').catch(error2 => report.cleanupErrors.push(String(error2)));
      }
      report.browserClosed = !!child && (child.exitCode !== null || child.signalCode !== null);
    }
  })();
  return closePromise;
}
const interrupt = signal => { interrupted ||= signal; void closeBrowser(); };
const sigint = () => interrupt('SIGINT'), sigterm = () => interrupt('SIGTERM');

function readGraphics() {
  const renderer = window.__DEBUG?.renderer, gl = renderer?.getContext();
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  return { renderer: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : null,
    vendor: info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : null,
    rescue: window.__GL_DIAG?.rescue ?? null, contextLost: gl?.isContextLost() ?? null };
}

try {
  // Preserve the shared FIFO's existing queue boundary. No signal handler
  // swallows OS termination while acquire() is waiting on another owner.
  await lock.acquire(15 * 60 * 1000); lease = true;
  process.on('SIGINT', sigint); process.on('SIGTERM', sigterm);
  active();
  refresher = setInterval(() => lock.refresh(), 30000); refresher.unref();
  scenarioStartedAt = performance.now();
  const { default: puppeteer } = await import('puppeteer');
  // Puppeteer owns the fresh temporary profile and its bounded launch timeout.
  browser = await puppeteer.launch(nativeBrowserLaunchOptions({ headless: 'new', timeout: 30000,
    protocolTimeout: 15000, handleSIGINT: false, handleSIGTERM: false,
    args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'] }));
  active();
  report.nativeLaunch = verifyNativeBrowserLaunch(browser);
  report.browserVersion = await browser.version();
  page = await browser.newPage();
  page.setDefaultTimeout(15000);
  await page.setViewport(report.viewport); await page.bringToFront(); await page.setCacheEnabled(false);
  page.on('pageerror', error => { if (report.errors.length < 64) report.errors.push(String(error).slice(0, 4096)); });
  page.on('console', entry => {
    if (entry.type() === 'error' && report.errors.length < 64) report.errors.push(entry.text().slice(0, 4096));
  });
  page.on('response', response => {
    if (response.url() !== targetUrl) return;
    report.targetResponseCount++;
    if (report.targetResponseCount !== 1) { report.errors.push('duplicate_target_response'); return; }
    responseWork.push((async () => {
      const bytes = await response.buffer();
      report.targetResponse = { status: response.status(), sha256: hash(bytes), bytes: bytes.length };
    })().catch(error => report.errors.push(String(error))));
  });
  cdp = await page.createCDPSession();
  hold = createColdImportHold({ targetUrl, maxHoldMs: 10000,
    continueRequest: requestId => cdp.send('Fetch.continueRequest', { requestId }) });
  pausedListener = event => hold.pause(event);
  cdp.on('Fetch.requestPaused', pausedListener);
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: targetUrl, resourceType: 'Script', requestStage: 'Request' }] });
  fetchEnabled = true;
  await page.evaluateOnNewDocument(() => {
    // Same ordinary player fades as the maintained real-control probe.
    Object.defineProperty(Navigator.prototype, 'webdriver', { configurable: true, get: () => false });
  });
  await page.evaluateOnNewDocument(installColdImportCoverObserver);
  const response = await run('navigation', () => page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: remaining() }));
  if (!response?.ok() || hash(await response.buffer()) !== report.buildIndexHash) throw new Error('served_build_index_mismatch');
  await run('garage-ready', () => page.waitForFunction(() => window.__GAME_READY === true
    && window.__DEBUG?.game?.phase === 'garage' && window.__DEBUG?.pedestalOnStage, { timeout: remaining() }));
  report.graphics = await page.evaluate(readGraphics);
  await run('solo-mode-picker', async () => {
    await page.click('.cot-battle-mode');
    await page.click('.cot-battle-choice[data-mode="solo"]');
  });
  if (hold.snapshot().targetCount !== 0) throw new Error('loading_module_was_not_cold_before_battle');
  await page.evaluate(() => window.__COLD_IMPORT_COVER.arm());
  hold.arm();
  await run('native-battle-click', () => page.click('.cot-battle'));
  await run('target-request', () => hold.seen);
  if (!hold.snapshot().held) throw new Error('target_request_not_held');
  // Fixed diagnostic window under a real unresolved import, never a warmup.
  // A missing cover is preserved and reported after releasing the real request.
  await run('held-cover-window', () => new Promise(resolveWait => setTimeout(resolveWait, options.observeHeldMs)));
  report.heldCover = await run('held-cover-read', () => page.evaluate(() => window.__COLD_IMPORT_COVER.read()));
  report.heldRequest = hold.snapshot();
  await run('held-cover-screenshot', () => page.screenshot({ path: resolve(options.out, 'held-import.png') }));
  report.screenshotWhileHeld = hold.snapshot().held && hold.snapshot().releaseStartedAtMs === null;
  report.heldScreenshotSha256 = hash(await readFile(resolve(options.out, 'held-import.png')));
  report.releasedRequest = await run('release-real-import', () => hold.release('observed'));
  await run('loader-enrichment', () => page.waitForFunction(() => {
    const sample = window.__COLD_IMPORT_COVER.read().current;
    return sample.visible && sample.allyRows > 0 && sample.enemyRows > 0;
  }, { timeout: remaining(), polling: 50 }));
  report.enrichedCover = await page.evaluate(() => window.__COLD_IMPORT_COVER.read().current);
  await run('real-battle-ready', () => page.waitForFunction(() => {
    const sample = window.__COLD_IMPORT_COVER.read().current;
    return sample.phase === 'battle' && sample.preBattleS <= 0 && !sample.displayed && !sample.resultPresent;
  }, { timeout: remaining(), polling: 50 }));
  report.completed = await page.evaluate(() => window.__COLD_IMPORT_COVER.read().current);
  await run('target-response-hash', () => Promise.all(responseWork));
  await run('completed-screenshot', () => page.screenshot({ path: resolve(options.out, 'battle-ready.png') }));
} catch (error) {
  report.failures.push(String(error));
} finally {
  if (hold) {
    report.finalRequest = await bounded(() => hold.stop(), 15000, 'request-owner-stop')
      .catch(error => { report.cleanupErrors.push(String(error)); return hold.snapshot(); });
  }
  if (fetchEnabled) await bounded(() => cdp.send('Fetch.disable'), 5000, 'fetch-disable')
    .catch(error => report.cleanupErrors.push(String(error)));
  if (pausedListener) cdp.off('Fetch.requestPaused', pausedListener);
  if (page && !page.isClosed()) await bounded(() => page.evaluate(() => window.__COLD_IMPORT_COVER?.stop()), 5000, 'observer-stop')
    .catch(error => report.cleanupErrors.push(String(error)));
  await closeBrowser();
  await bounded(() => Promise.allSettled(responseWork), 5000, 'response-owner-drain')
    .catch(error => report.cleanupErrors.push(String(error)));
  clearInterval(refresher);
  if (lease && (!browser || report.browserClosed)) { lock.release(); report.lockReleased = true; }
  process.removeListener('SIGINT', sigint); process.removeListener('SIGTERM', sigterm);
  try {
    report.sourceEnd = await sourceReceipt();
    report.acquisitionUnchanged = report.acquisitionHash === await acquisitionHash();
    report.buildUnchanged = hash(await readFile(resolve(options.dist, 'index.html'))) === report.buildIndexHash
      && hash(await readFile(resolve(options.dist, 'assets', targetAsset))) === targetAssetSha256;
    if (report.sourceEnd.sourceHash !== report.source.sourceHash || !report.acquisitionUnchanged || !report.buildUnchanged) {
      report.failures.push('source_build_or_acquisition_changed_during_run');
    }
  } catch (error) { report.failures.push(`identity:${String(error)}`); }
  report.failures.push(...checkColdImportCover(report), ...report.errors, ...report.cleanupErrors.map(error => `cleanup:${error}`));
  if (report.finalRequest?.errors?.length) report.failures.push(...report.finalRequest.errors);
  if (report.finalRequest?.targetCount !== 1 || report.finalRequest?.held !== false || report.finalRequest?.stopped !== true) {
    report.failures.push('request_owner_cleanup_incomplete');
  }
  if (interrupted) report.failures.push(`interrupted:${interrupted}`);
  report.finishedAt = new Date().toISOString();
  report.pass = report.failures.length === 0 && report.browserClosed === true && report.lockReleased === true;
  await writeFile(resolve(options.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ pass: report.pass, report: resolve(options.out, 'report.json'), failures: report.failures }, null, 2));
  if (!report.pass) process.exitCode = interrupted === 'SIGINT' ? 130 : interrupted === 'SIGTERM' ? 143 : 1;
}
