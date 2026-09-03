// Measure the five seconds immediately after the Garage declares itself ready.
// This closes the blind spot in networkidle-based probes: hidden asset warming
// used to produce repeated 100-400 ms frames after the playable UI appeared.
// Usage: node tools/garage-entry-performance-probe.mjs --url=http://127.0.0.1:4178
import puppeteer from 'puppeteer';

const argv = process.argv.slice(2);
const option = (name, fallback = '') => {
  const direct = argv.find((arg) => arg.startsWith(`--${name}=`));
  return direct ? direct.slice(name.length + 3) : fallback;
};
const baseUrl = option('url', 'http://127.0.0.1:4178').replace(/\/$/, '');
const cpuRate = Math.max(1, Number(option('cpu-rate', '4')) || 4);
const sampleMs = Math.max(1_000, Number(option('sample-ms', '5000')) || 5_000);
const gate = !argv.includes('--no-gate');
const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Performance.enable');
await page.setCacheEnabled(false);
if (cpuRate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errors = [];
const warnings = [];
page.on('console', (message) => {
  if (message.type() === 'error' && !/github-stars|favicon\.ico/.test(message.text())) {
    errors.push(message.text());
  }
  if (message.type() === 'warn' && /garageDressing/.test(message.text())) {
    warnings.push(message.text());
  }
});
page.on('pageerror', (error) => errors.push(String(error)));
await page.evaluateOnNewDocument(() => {
  localStorage.removeItem('cot.garage.variant');
  const probe = { frames: [], longTasks: [], running: true };
  let previous = performance.now();
  const frame = (now) => {
    probe.frames.push({ at: now, gap: now - previous });
    previous = now;
    if (probe.running) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  if (typeof PerformanceObserver === 'function') {
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          probe.longTasks.push({ at: entry.startTime, duration: entry.duration });
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* frame gaps remain the fallback */ }
  }
  window.__GARAGE_ENTRY_PERF = probe;
});

const metric = (metrics, name) => metrics.metrics.find((row) => row.name === name)?.value || 0;
const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

try {
  const wallStartedAt = Date.now();
  await page.goto(`${baseUrl}/?nosplash=1&nohero=1`, {
    waitUntil: 'domcontentloaded', timeout: 60_000,
  });
  await page.waitForFunction(() => window.__GAME_READY === true && window.__GARAGE_WORKSHOP,
    { timeout: 60_000 });
  const ready = await page.evaluate(() => ({
    at: performance.now(),
    bootMs: Number(window.__BOOT_MS || 0),
    resources: performance.getEntriesByType('resource').length,
    architecture: window.__GARAGE_WORKSHOP.stats().architecture,
  }));
  const readyWallMs = Date.now() - wallStartedAt;
  const metricsBefore = await cdp.send('Performance.getMetrics');
  await new Promise((resolve) => setTimeout(resolve, sampleMs));
  const metricsAfter = await cdp.send('Performance.getMetrics');
  const result = await page.evaluate((readyAt) => {
    const probe = window.__GARAGE_ENTRY_PERF;
    probe.running = false;
    const resources = performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      startTime: entry.startTime,
      transferSize: entry.transferSize || entry.encodedBodySize || 0,
    }));
    const groupName = (url) => {
      if (url.includes('/icons/')) return 'tank-icons';
      if (url.includes('/maps/')) return 'map-art';
      if (url.includes('/textures/garage/')) return 'garage-textures';
      if (url.includes('/media/')) return 'media';
      if (url.includes('/assets/')) return 'bundles';
      return 'other';
    };
    const summarize = (rows) => {
      const groups = {};
      for (const row of rows) {
        const key = groupName(row.name);
        groups[key] ||= { count: 0, bytes: 0 };
        groups[key].count += 1;
        groups[key].bytes += row.transferSize;
      }
      return groups;
    };
    return {
      frames: probe.frames.filter((row) => row.at >= readyAt).map((row) => row.gap),
      longTasks: probe.longTasks.filter((row) => row.at >= readyAt),
      allResources: summarize(resources),
      postReadyResources: summarize(resources.filter((row) => row.startTime >= readyAt)),
      resourcesStartedAfterReady: resources.filter((row) => row.startTime >= readyAt).length,
      stats: window.__GARAGE_WORKSHOP.stats(),
      heapBytes: performance.memory?.usedJSHeapSize || 0,
    };
  }, ready.at);
  const frameGaps = result.frames;
  const taskDelta = metric(metricsAfter, 'TaskDuration') - metric(metricsBefore, 'TaskDuration');
  const report = {
    cpuRate,
    sampleMs,
    readyWallMs,
    bootMs: +ready.bootMs.toFixed(1),
    resourcesAtReady: ready.resources,
    frameMaxMs: +Math.max(0, ...frameGaps).toFixed(1),
    frameP95Ms: +percentile(frameGaps, 0.95).toFixed(1),
    longTaskCount: result.longTasks.length,
    longTaskMaxMs: +Math.max(0, ...result.longTasks.map((row) => row.duration)).toFixed(1),
    taskCores: +(taskDelta / (sampleMs / 1_000)).toFixed(4),
    resourceGroups: result.allResources,
    postReadyResourceGroups: result.postReadyResources,
    resourcesStartedAfterReady: result.resourcesStartedAfterReady,
    heapMiB: +(result.heapBytes / 1024 / 1024).toFixed(1),
    architecture: result.stats.architecture,
    workshop: {
      built: result.stats.built,
      triangles: result.stats.workshopTriangleCount,
      optimizedTriangles: result.stats.optimizedWorkshopTriangleCount,
      exhibits: result.stats.workshopExhibitCount,
      maintenanceBays: result.stats.sharedMaintenanceBayCount,
      buildTimings: result.stats.buildTimings,
      transferTimings: result.stats.workshopTransferTimings,
      finishes: result.stats.workshopPresentationFinishes,
      palettes: result.stats.workshopPaletteCount,
      textureMaps: result.stats.workshopExhibitTextureCount,
      paletteMaterials: result.stats.workshopPaletteMaterialCount,
      transferredAttributeBytes: result.stats.workshopTransferredAttributeBytes,
      omittedAttributeBytes: result.stats.workshopOmittedAttributeBytes,
      omittedAttributeCount: result.stats.workshopOmittedAttributeCount,
      lastBuildError: result.stats.lastBuildError,
    },
    longTasks: result.longTasks,
    warnings,
    errors,
  };
  const failures = [];
  if (report.readyWallMs > 5_000) failures.push(`${report.readyWallMs} ms Garage readiness`);
  if (report.frameMaxMs > 150) failures.push(`${report.frameMaxMs} ms post-ready frame`);
  if (report.frameP95Ms > 45) failures.push(`${report.frameP95Ms} ms post-ready p95 frame`);
  if (report.longTaskCount > 4) failures.push(`${report.longTaskCount} post-ready long tasks`);
  if ((report.postReadyResourceGroups['garage-textures']?.count || 0) > 0) {
    failures.push('unused Garage environments loaded after ready');
  }
  if ((report.resourceGroups['tank-icons']?.count || 0) > 24) {
    failures.push(`${report.resourceGroups['tank-icons'].count} eager fleet portraits`);
  }
  if ((report.resourceGroups['map-art']?.count || 0) > 10) {
    failures.push(`${report.resourceGroups['map-art'].count} eager battlefield images`);
  }
  if (report.workshop.textureMaps !== 0 || report.workshop.palettes !== 3
      || report.workshop.omittedAttributeBytes <= 0) {
    failures.push(`workshop service-finish contract failed: ${JSON.stringify({
      textureMaps: report.workshop.textureMaps,
      palettes: report.workshop.palettes,
      omittedAttributeBytes: report.workshop.omittedAttributeBytes,
    })}`);
  }
  if (errors.length) failures.push(`${errors.length} console/page errors`);
  console.log(JSON.stringify({ ...report, failures }, null, 2));
  if (gate && failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
