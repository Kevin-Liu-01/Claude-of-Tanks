// Production cold-load/recovery probe. Run against `vite preview` (or a real
// deployment):
//   npm run perf:cold -- --url http://127.0.0.1:5180/
// It verifies a constrained first load and intentionally fails the first main
// chunk request to prove the inline boot recovery reloads exactly once.

import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
function option(name, fallback) {
  const eq = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

const baseUrl = new URL(option('url', 'http://127.0.0.1:5180/'));
const timeoutMs = Math.max(30000, Number(option('timeout', '120')) * 1000);
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

async function metrics(page, startedAt) {
  const app = await page.evaluate(() => ({
    ready: window.__GAME_READY === true,
    bootMs: window.__BOOT_MS || null,
    timings: window.__BOOT_TIMINGS || null,
    recovery: window.__COT_BOOT_RECOVERY?.state?.() || null,
    url: location.href,
    sourceChunks: performance.getEntriesByType('resource')
      .filter((row) => row.name.includes('source-geometry')).length,
    main: performance.getEntriesByType('resource')
      .filter((row) => /\/assets\/main-[^/]+\.js/.test(row.name))
      .map((row) => ({ durationMs: Math.round(row.duration), transferBytes: row.transferSize })),
    scripts: performance.getEntriesByType('resource')
      .filter((row) => /\.js(?:\?|$)/.test(row.name))
      .map((row) => ({
        path: new URL(row.name).pathname,
        startMs: Math.round(row.startTime),
        durationMs: Math.round(row.duration),
        transferBytes: row.transferSize,
      }))
      .sort((a, b) => b.transferBytes - a.transferBytes),
    featuredImages: performance.getEntriesByType('resource')
      .filter((row) => row.name.includes('/media/featured/'))
      .map((row) => ({
        path: new URL(row.name).pathname,
        startMs: Math.round(row.startTime),
        durationMs: Math.round(row.duration),
        transferBytes: row.transferSize,
      })),
  }));
  app.scriptTransferBytes = app.scripts.reduce((sum, row) => sum + row.transferBytes, 0);
  app.featuredImageTransferBytes = app.featuredImages
    .reduce((sum, row) => sum + row.transferBytes, 0);
  return { wallMs: Date.now() - startedAt, ...app };
}

async function constrainedColdLoad({ name, noHero }) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 12; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Mobile Safari/537.36');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { configurable: true, get: () => 4 });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 4 });
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    // 1.6 Mbit/s down, 750 Kbit/s up — a deliberately mediocre mobile link.
    downloadThroughput: 200 * 1024,
    uploadThroughput: 93750,
    connectionType: 'cellular3g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const url = new URL(baseUrl);
  url.searchParams.set('nosplash', '1');
  if (noHero) url.searchParams.set('nohero', '1');
  url.searchParams.set('coldProbe', '1');
  const startedAt = Date.now();
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: timeoutMs });
  const result = { name, ...(await metrics(page, startedAt)), errors };
  await context.close();
  return result;
}

async function failedMainChunkRecovery() {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1 });
  let failedMainRequests = 0;
  let navigations = 0;
  const errors = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (failedMainRequests === 0 && /\/assets\/main-[^/]+\.js(?:\?|$)/.test(request.url())) {
      failedMainRequests++;
      request.abort('failed');
    } else {
      request.continue();
    }
  });
  const url = new URL(baseUrl);
  url.searchParams.set('nosplash', '1');
  url.searchParams.set('nohero', '1');
  url.searchParams.set('recoveryProbe', '1');
  const startedAt = Date.now();
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
  await page.waitForFunction('window.__GAME_READY === true', { timeout: timeoutMs });
  const result = {
    name: 'failed-main-auto-recovery',
    ...(await metrics(page, startedAt)),
    failedMainRequests,
    navigations,
    errors,
  };
  await context.close();
  return result;
}

async function failedMainEvaluationRecovery() {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1 });
  let injectedMainResponses = 0;
  let navigations = 0;
  const errors = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (injectedMainResponses === 0 && /\/assets\/main-[^/]+\.js(?:\?|$)/.test(request.url())) {
      injectedMainResponses++;
      request.respond({
        status: 200,
        contentType: 'application/javascript',
        body: `throw new Error('injected first-visit boot evaluation failure');\n//# sourceURL=${request.url()}`,
      });
    } else {
      request.continue();
    }
  });
  const url = new URL(baseUrl);
  url.searchParams.set('nosplash', '1');
  url.searchParams.set('nohero', '1');
  url.searchParams.set('evaluationRecoveryProbe', '1');
  const startedAt = Date.now();
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
  await page.waitForFunction('window.__GAME_READY === true', { timeout: timeoutMs });
  const result = {
    name: 'failed-main-evaluation-auto-recovery',
    ...(await metrics(page, startedAt)),
    injectedMainResponses,
    navigations,
    errors,
  };
  await context.close();
  return result;
}

try {
  const results = [
    // The first row is the real empty-cache experience. Keep the no-hero row
    // as a diagnostic control so media contention cannot hide inside a faster
    // synthetic boot number again.
    await constrainedColdLoad({ name: 'constrained-mobile-first-visit', noHero: false }),
    await constrainedColdLoad({ name: 'constrained-mobile-nohero-control', noHero: true }),
    await failedMainChunkRecovery(),
    await failedMainEvaluationRecovery(),
  ];
  console.log(JSON.stringify({ ok: results.every((row) => row.ready), results }, null, 2));
  if (!results.every((row) => row.ready)) process.exitCode = 1;
  if (results[0].sourceChunks !== 0) process.exitCode = 2;
  if (results[2].failedMainRequests !== 1 || results[2].navigations < 2) process.exitCode = 3;
  if (results[3].injectedMainResponses !== 1 || results[3].navigations < 2) process.exitCode = 4;
  if (results[0].featuredImages.length !== 1 ||
      !results[0].featuredImages[0].path.endsWith('.boot.webp') ||
      results[0].featuredImageTransferBytes > 100_000) process.exitCode = 5;
  if (results[1].featuredImageTransferBytes !== 0) process.exitCode = 6;
} finally {
  await browser.close();
}
