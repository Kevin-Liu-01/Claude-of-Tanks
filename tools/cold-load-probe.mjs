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
const sessionCount = Math.max(1, Math.min(12, Number(option('sessions', '1')) || 1));
const cpuRate = Math.max(1, Number(option('cpu', '4')) || 4);
const latencyMs = Math.max(0, Number(option('latency', '150')) || 0);
const downloadKbps = Math.max(64, Number(option('down-kbps', '1600')) || 1600);
const uploadKbps = Math.max(32, Number(option('up-kbps', '750')) || 750);
const compactOutput = option('summary', '0') === '1';
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
  const transferredByPath = new Map();
  for (const script of app.scripts) {
    if (script.transferBytes <= 0) continue;
    transferredByPath.set(script.path, (transferredByPath.get(script.path) || 0) + 1);
  }
  app.duplicateScriptTransfers = [...transferredByPath]
    .filter(([, count]) => count > 1)
    .map(([path, count]) => ({ path, count }));
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
    // This probe models an ordinary new player, not an engineering browser.
    // Production keeps rendered QA controls behind webdriver/debug intent;
    // hiding automation here ensures bundle and boot timings cannot silently
    // include that demand-loaded test runtime. `nosplash` still bypasses the
    // user-gesture gate deterministically.
    Object.defineProperty(Navigator.prototype, 'webdriver', {
      configurable: true, get: () => false,
    });
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { configurable: true, get: () => 4 });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { configurable: true, get: () => 4 });
  });
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: latencyMs,
    downloadThroughput: downloadKbps * 1024 / 8,
    uploadThroughput: uploadKbps * 1024 / 8,
    connectionType: 'cellular3g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  const url = new URL(baseUrl);
  url.searchParams.set('nosplash', '1');
  if (noHero) url.searchParams.set('nohero', '1');
  url.searchParams.set('coldProbe', '1');
  const startedAt = Date.now();
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: timeoutMs });
  const result = { name, ...(await metrics(page, startedAt)), errors };
  if (result.duplicateScriptTransfers.length) {
    throw new Error(`${name} transferred boot scripts more than once: ` +
      JSON.stringify(result.duplicateScriptTransfers));
  }
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

async function failedSelectedBuilderRecovery() {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 1 });
  let failedBuilderRequests = 0;
  const failedDocumentAttempts = new Set();
  let navigations = 0;
  const errors = [];
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations++; });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    // The pristine default M1A1 resolves through the demand-loaded Abrams
    // profile implementation. Drop it twice to prove that cold lazy-family
    // failures recover without a user refresh and still have a hard loop cap.
    let documentAttempt = 0;
    try {
      const receipt = new URL(page.url()).searchParams.get('_bootretry') || '';
      documentAttempt = Number.parseInt(receipt.split('-', 1)[0], 10) || 0;
    } catch (_) { /* first navigation may not have committed its URL yet */ }
    if (documentAttempt < 2
        && !failedDocumentAttempts.has(documentAttempt)
        && /\/assets\/abrams-(?!generated)[^/]+\.js(?:\?|$)/.test(request.url())) {
      failedDocumentAttempts.add(documentAttempt);
      failedBuilderRequests++;
      request.abort('failed');
    } else {
      request.continue();
    }
  });
  const url = new URL(baseUrl);
  url.searchParams.set('nosplash', '1');
  url.searchParams.set('nohero', '1');
  url.searchParams.set('builderRecoveryProbe', '1');
  const startedAt = Date.now();
  await page.goto(url.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => {});
  await page.waitForFunction('window.__GAME_READY === true', { timeout: timeoutMs });
  const result = {
    name: 'failed-selected-builder-auto-recovery',
    ...(await metrics(page, startedAt)),
    failedBuilderRequests,
    failedDocumentAttempts: [...failedDocumentAttempts].sort(),
    navigations,
    errors,
  };
  await context.close();
  return result;
}

try {
  // Every context is pristine and explicitly cache-disabled. Multiple rows
  // exercise the real first-visit path repeatedly instead of warming one page
  // and mistaking browser cache reuse for reliability.
  const firstVisits = [];
  for (let i = 0; i < sessionCount; i++) {
    firstVisits.push(await constrainedColdLoad({
      name: i === 0
        ? 'constrained-mobile-first-visit'
        : `constrained-mobile-first-visit-${i + 1}`,
      noHero: false,
    }));
  }
  const noHero = await constrainedColdLoad({
    name: 'constrained-mobile-nohero-control', noHero: true,
  });
  const downloadRecovery = await failedMainChunkRecovery();
  const evaluationRecovery = await failedMainEvaluationRecovery();
  const builderRecovery = await failedSelectedBuilderRecovery();
  const results = [
    ...firstVisits, noHero, downloadRecovery, evaluationRecovery, builderRecovery,
  ];
  const printable = compactOutput
    ? results.map(({ scripts: _scripts, ...row }) => row)
    : results;
  console.log(JSON.stringify({
    ok: results.every((row) => row.ready),
    conditions: {
      sessions: sessionCount, cpuRate, latencyMs, downloadKbps, uploadKbps,
    },
    results: printable,
  }, null, 2));
  if (!results.every((row) => row.ready)) process.exitCode = 1;
  if (firstVisits.some((row) => row.sourceChunks !== 0)) process.exitCode = 2;
  if (downloadRecovery.failedMainRequests !== 1 || downloadRecovery.navigations < 2) {
    process.exitCode = 3;
  }
  if (evaluationRecovery.injectedMainResponses !== 1 || evaluationRecovery.navigations < 2) {
    process.exitCode = 4;
  }
  if (builderRecovery.failedBuilderRequests !== 2
      || builderRecovery.failedDocumentAttempts.join(',') !== '0,1'
      || builderRecovery.navigations < 3) {
    process.exitCode = 7;
  }
  if (firstVisits.some((row) => row.featuredImages.length !== 1
      || !row.featuredImages[0].path.endsWith('.boot.webp')
      || row.featuredImageTransferBytes > 100_000)) process.exitCode = 5;
  if (noHero.featuredImageTransferBytes !== 0) process.exitCode = 6;
} finally {
  await browser.close();
}
