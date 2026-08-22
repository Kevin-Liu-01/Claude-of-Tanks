// Proves the optimized-build QA contract:
//   1. ordinary production sessions do not load or install the recorder;
//   2. explicit `?debug=1` sessions get a bounded trace, telemetry, and
//      touch-sized mark/copy/export controls.
// Run after `npm run build` (or use `npm run qa:trace`).
import { preview } from 'vite';
import puppeteer from 'puppeteer';

const server = await preview({
  root: process.cwd(),
  logLevel: 'error',
  preview: { host: '127.0.0.1', port: 5781, strictPort: false },
});
const address = server.httpServer.address();
const port = typeof address === 'object' && address ? address.port : 5781;
const base = `http://127.0.0.1:${port}/`;
const browser = await puppeteer.launch({
  headless: 'new',
  protocolTimeout: 360000,
  args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox', '--disable-dev-shm-usage'],
});

const viewport = {
  width: 892,
  height: 412,
  isMobile: true,
  hasTouch: true,
  isLandscape: true,
  deviceScaleFactor: 3,
};
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const checks = [];
const check = (condition, name, detail = null) => {
  checks.push({ name, pass: !!condition, detail });
};
const closeServer = () => typeof server.close === 'function'
  ? server.close()
  : new Promise((done) => server.httpServer.close(done));

try {
  const normal = await browser.newPage();
  await normal.emulate({ viewport, userAgent });
  await normal.goto(`${base}?tier=mobile&gfxreset=1`, { waitUntil: 'domcontentloaded', timeout: 360000 });
  await normal.waitForFunction('window.__GAME_READY === true', { timeout: 360000 });
  const normalState = await normal.evaluate(() => ({
    qaTrace: typeof window.__QA_TRACE,
    devTrace: window.__DEBUG?.devTrace ?? null,
    recorderResources: performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => /perfTrace/i.test(name)),
    hudVisible: getComputedStyle(document.getElementById('cot-perfhud')).display !== 'none',
  }));
  check(normalState.qaTrace === 'undefined', 'normal production has no global QA recorder', normalState.qaTrace);
  check(normalState.devTrace === null, 'normal production exposes an inert/null debug seam');
  check(normalState.recorderResources.length === 0, 'normal production does not fetch the recorder chunk', normalState.recorderResources);
  check(!normalState.hudVisible, 'normal production keeps engineering telemetry hidden');
  await normal.close();

  const qa = await browser.newPage();
  await qa.emulate({ viewport, userAgent });
  await qa.goto(`${base}?tier=mobile&gfxreset=1&debug=1`, { waitUntil: 'domcontentloaded', timeout: 360000 });
  await qa.waitForFunction('window.__GAME_READY === true && window.__QA_TRACE?.enabled === true', { timeout: 360000 });
  await new Promise((done) => setTimeout(done, 1200));
  const qaState = await qa.evaluate(() => {
    const trace = window.__QA_TRACE;
    trace.mark('qa:production-probe', { source: 'qa-trace-probe' });
    const snapshot = trace.snapshot({ frames: false });
    const buttons = [...document.querySelectorAll('#cot-perfhud button')].map((button) => {
      const rect = button.getBoundingClientRect();
      return { label: button.textContent.trim(), width: rect.width, height: rect.height };
    });
    return {
      hudVisible: getComputedStyle(document.getElementById('cot-perfhud')).display !== 'none',
      buttons,
      stats: snapshot.stats,
      environment: snapshot.environment,
      telemetry: snapshot.telemetry,
      frameSchema: snapshot.frameSchema,
      mark: trace.tail(5, 'mark').find((event) => event.name === 'qa:production-probe') || null,
    };
  });
  const actionNames = new Set(qaState.buttons.map((button) => button.label));
  check(qaState.hudVisible, 'debug production shows the telemetry dashboard');
  check(['MARK ISSUE', 'COPY SUMMARY', 'EXPORT JSON'].every((label) => actionNames.has(label)),
    'debug production exposes all field-report actions', qaState.buttons);
  check(qaState.buttons.every((button) => button.height >= 44),
    'field-report controls remain touch sized', qaState.buttons);
  check(qaState.stats.traceMode === 'production-qa', 'trace identifies optimized QA mode', qaState.stats.traceMode);
  check(qaState.stats.frames > 0 && qaState.stats.framesDropped === 0,
    'trace captures bounded frame rows without loss', qaState.stats);
  check(['geometries', 'textures', 'renderScale'].every((field) => qaState.frameSchema.includes(field)),
    'trace schema includes GPU residency and dynamic resolution', qaState.frameSchema);
  check(!!qaState.telemetry?.quality && !!qaState.telemetry?.simulation,
    'trace snapshot embeds current engine telemetry', qaState.telemetry);
  check(!!qaState.mark, 'tester marks enter the exported event stream', qaState.mark);
  await qa.close();

  for (const result of checks) {
    console.log(`[qa-trace] ${result.pass ? 'PASS' : 'FAIL'} ${result.name}`);
  }
  const failed = checks.filter((result) => !result.pass);
  if (failed.length) {
    console.error(JSON.stringify({ failed }, null, 2));
    process.exitCode = 1;
  } else {
    console.log(`[qa-trace] ${checks.length}/${checks.length} checks passed`);
  }
} finally {
  await browser.close();
  await closeServer();
}
