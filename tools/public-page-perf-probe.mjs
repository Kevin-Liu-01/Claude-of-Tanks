// Public landing-page loading probe.
//
// Usage:
//   npm run perf:public -- --url=http://127.0.0.1:4431/home --profile=mobile
//   npm run perf:public -- --url=http://127.0.0.1:4431/home --profile=desktop --scroll
//
// The probe keeps navigation and scroll measurements separate so the initial
// critical path cannot be hidden by below-fold media work.

import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
function option(name, fallback) {
  const exact = argv.find((arg) => arg.startsWith(`--${name}=`));
  if (exact) return exact.slice(name.length + 3);
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
}

const url = option('url', 'http://127.0.0.1:4431/home');
const profile = option('profile', 'mobile');
const scroll = argv.includes('--scroll');
const playVideos = argv.includes('--play-videos');
if (!['mobile', 'desktop'].includes(profile)) {
  throw new Error(`Unknown profile '${profile}' (expected mobile or desktop)`);
}

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const context = await browser.createBrowserContext();
const page = await context.newPage();
const mobile = profile === 'mobile';
await page.setViewport(mobile
  ? { width: 390, height: 844, deviceScaleFactor: 2 }
  : { width: 1440, height: 900, deviceScaleFactor: 1 });
if (mobile) {
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151 Mobile Safari/537.36');
}

await page.evaluateOnNewDocument((isMobile) => {
  window.__PUBLIC_PERF = { cls: 0, lcp: 0, longTasks: [], paints: {} };
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__PUBLIC_PERF.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      window.__PUBLIC_PERF.lcp = entries.at(-1)?.startTime || window.__PUBLIC_PERF.lcp;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__PUBLIC_PERF.longTasks.push({ start: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__PUBLIC_PERF.paints[entry.name] = entry.startTime;
    }).observe({ type: 'paint', buffered: true });
  } catch (_) {}
  Object.defineProperty(Navigator.prototype, 'deviceMemory', {
    configurable: true,
    get: () => isMobile ? 4 : 8,
  });
}, mobile);

const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
if (mobile) {
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 100,
    downloadThroughput: 450 * 1024,
    uploadThroughput: 150 * 1024,
    connectionType: 'cellular4g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

const requests = new Map();
const failures = [];
const consoleErrors = [];
cdp.on('Network.requestWillBeSent', ({ requestId, request, type }) => {
  requests.set(requestId, { url: request.url, type, bytes: 0 });
});
cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
  const request = requests.get(requestId);
  if (request) request.bytes = Math.max(request.bytes, encodedDataLength);
});
cdp.on('Network.dataReceived', ({ requestId, encodedDataLength }) => {
  const request = requests.get(requestId);
  if (request) request.bytes += encodedDataLength;
});
cdp.on('Network.loadingFailed', ({ requestId, errorText, canceled }) => {
  const request = requests.get(requestId);
  if (request && !canceled) failures.push({ url: request.url, error: errorText });
});
page.on('pageerror', (error) => consoleErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

function summarizeRequests() {
  const rows = [...requests.values()];
  const total = rows.reduce((sum, request) => sum + request.bytes, 0);
  const byType = {};
  for (const request of rows) {
    const current = byType[request.type] || { requests: 0, bytes: 0 };
    current.requests += 1;
    current.bytes += request.bytes;
    byType[request.type] = current;
  }
  const videos = rows
    .filter((request) => /\.(?:mp4|webm)(?:\?|$)/.test(request.url))
    .map((request) => ({ url: new URL(request.url).pathname, bytes: request.bytes }));
  const largest = rows
    .filter((request) => request.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, 12)
    .map((request) => ({ url: new URL(request.url).pathname, type: request.type, bytes: request.bytes }));
  return { requests: rows.length, bytes: total, byType, videos, largest };
}

async function snapshot(label) {
  await new Promise((resolve) => setTimeout(resolve, 800));
  const pageMetrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const videos = [...document.querySelectorAll('video')].map((video) => ({
      source: video.currentSrc ? new URL(video.currentSrc).pathname : '',
      readyState: video.readyState,
      networkState: video.networkState,
      paused: video.paused,
      preload: video.preload,
    }));
    return {
      fcpMs: window.__PUBLIC_PERF.paints['first-contentful-paint'] || 0,
      lcpMs: window.__PUBLIC_PERF.lcp,
      cls: window.__PUBLIC_PERF.cls,
      domContentLoadedMs: navigation?.domContentLoadedEventEnd || 0,
      loadMs: navigation?.loadEventEnd || 0,
      longTasks: window.__PUBLIC_PERF.longTasks,
      scrollY: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
      videos,
    };
  });
  return { label, ...pageMetrics, network: summarizeRequests() };
}

const results = [];
try {
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  results.push(await snapshot('initial'));

  if (scroll) {
    const videoCount = await page.$$eval('video', (videos) => videos.length);
    for (let index = 0; index < videoCount; index++) {
      await page.evaluate((videoIndex) => {
        const video = document.querySelectorAll('video')[videoIndex];
        video?.scrollIntoView({ block: 'center' });
      }, index);
      if (playVideos) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        await page.evaluate((videoIndex) => {
          const video = document.querySelectorAll('video')[videoIndex];
          video?.parentElement?.querySelector('.v5-video-control')?.click();
        }, index);
      }
      await new Promise((resolve) => setTimeout(resolve, mobile ? 2200 : 1600));
    }
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    results.push(await snapshot('full-scroll'));
  }

  console.log(JSON.stringify({
    ok: failures.length === 0 && consoleErrors.length === 0,
    profile,
    url,
    failures,
    consoleErrors,
    results,
  }, null, 2));
  if (failures.length || consoleErrors.length) process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
}
